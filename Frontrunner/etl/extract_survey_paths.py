#!/usr/bin/env python3
"""
Extract survey paths from MySQL and create road geometries in PostgreSQL
Survey paths represent surveyed roads/paths with their coordinates
"""

import mysql.connector
import psycopg2
import logging
import math

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database configurations
MYSQL_CONFIG = {
    'host': 'mysql',
    'port': 3306,
    'database': 'kmtsdb',
    'user': 'kmtsuser',
    'password': 'kmtspass'
}

POSTGRES_CONFIG = {
    'host': 'postgres',
    'port': 5432,
    'database': 'infrastructure_db',
    'user': 'infra_user',
    'password': 'infra_password'
}

# UTM Zone 50S conversion (Western Australia - Yandi mining area)
LAT_OFFSET = -23.0
LNG_OFFSET = 120.0
NORTHING_ORIGIN = 7337000
EASTING_ORIGIN = 676000

def transform_local_to_latlon(x_mm, y_mm):
    """Transform local mine coordinates (mm) to WGS84 lat/lon using UTM Zone 50S"""
    x_meters = x_mm / 1000.0
    y_meters = y_mm / 1000.0
    easting = EASTING_ORIGIN + x_meters
    northing = NORTHING_ORIGIN + y_meters
    latitude = LAT_OFFSET + (northing - NORTHING_ORIGIN) / 111000.0
    longitude = LNG_OFFSET + (easting - EASTING_ORIGIN) / (111000.0 * abs(math.cos(math.radians(LAT_OFFSET))))
    return latitude, longitude

def extract_survey_paths(mysql_cursor):
    """Extract all survey paths with their coordinates"""
    query = """
        SELECT DISTINCT
            spxyz._OID_ as path_oid,
            spxyz._CID_ as spxyz_cid,
            spxyz._IDX_ as coord_idx,
            spxyz._coordinate as coord_oid,
            sp._OID_ as path_oid_original,
            sp._CID_,
            sp.valid,
            sp.changeable,
            sp.external,
            sp.shapepath__ as shapepath_oid,
            sp.shapepath__is_path,
            sp._VER_,
            sp._VER2_,
            sp.replica_version,
            sp.replica_age,
            cor._OID_ as coordinate_oid,
            cor.latitude,
            cor.longitude,
            cor.altitude,
            cor.coord_x,
            cor.coord_y,
            cor.coord_z,
            cor.coord_heading,
            cor.coord_incl,
            cor.coord_status
        FROM survey_path__shapepath__x_y_z spxyz
        INNER JOIN survey_path sp ON sp._CID_ = spxyz._CID_
        INNER JOIN coordinate cor ON cor._OID_ = spxyz._coordinate
        WHERE cor.coord_x IS NOT NULL
        AND cor.coord_y IS NOT NULL
        ORDER BY spxyz._OID_, spxyz._IDX_
    """
    
    logger.info("Executing survey path extraction query...")
    mysql_cursor.execute(query)
    results = mysql_cursor.fetchall()
    logger.info(f"Found {len(results)} survey path coordinate records")
    return results

def group_by_path(coordinates):
    """Group coordinates by path _OID_, maintaining order by _IDX_"""
    paths = {}
    for row in coordinates:
        path_oid = row['path_oid']
        if path_oid not in paths:
            paths[path_oid] = {
                'cid': row['_CID_'],
                'path_oid_original': row.get('path_oid_original'),
                'valid': row.get('valid'),
                'changeable': row.get('changeable'),
                'external': row.get('external'),
                'shapepath_oid': row.get('shapepath_oid'),
                'shapepath_is_path': row.get('shapepath__is_path'),
                'version_ver': row.get('_VER_'),
                'version_ver2': row.get('_VER2_'),
                'replica_version': row.get('replica_version'),
                'replica_age': row.get('replica_age'),
                'seen_coords': set(),
                'coordinates': []
            }
        
        # Only add coordinate if we haven't seen it before (avoid duplicates)
        coord_oid = row['coord_oid']
        if coord_oid not in paths[path_oid]['seen_coords']:
            paths[path_oid]['seen_coords'].add(coord_oid)
            paths[path_oid]['coordinates'].append({
                'idx': row['coord_idx'],
                'coord_oid': coord_oid,
                'coord_x': row.get('coord_x'),
                'coord_y': row.get('coord_y'),
                'coord_z': row.get('coord_z'),
                'coord_heading': row.get('coord_heading'),
                'coord_incl': row.get('coord_incl'),
                'coord_status': row.get('coord_status'),
                'latitude': row.get('latitude'),
                'longitude': row.get('longitude'),
                'altitude': row.get('altitude')
            })
    
    # Sort coordinates by index for each path
    for path_oid in paths:
        paths[path_oid]['coordinates'].sort(key=lambda c: c['idx'])
    
    return paths

def main():
    logger.info("=== Extracting Survey Paths ===")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_cursor = postgres_conn.cursor()
    
    # Create survey_paths table
    postgres_cursor.execute("""
        DROP TABLE IF EXISTS survey_paths CASCADE;
        CREATE TABLE survey_paths (
            path_id SERIAL PRIMARY KEY,
            path_oid VARCHAR(255) NOT NULL UNIQUE,
            path_oid_original VARCHAR(32),
            cid VARCHAR(255),
            is_valid BOOLEAN,
            is_changeable BOOLEAN,
            is_external BOOLEAN,
            shapepath_oid VARCHAR(32),
            shapepath_is_path BOOLEAN,
            version_ver SMALLINT,
            version_ver2 BIGINT,
            replica_version BIGINT,
            replica_age BIGINT,
            total_points INTEGER NOT NULL,
            path_linestring GEOMETRY(LineString, 4326),
            path_length_m DOUBLE PRECISION,
            start_latitude DOUBLE PRECISION,
            start_longitude DOUBLE PRECISION,
            end_latitude DOUBLE PRECISION,
            end_longitude DOUBLE PRECISION,
            all_coordinate_oids TEXT,
            -- Aggregate coordinate data from all joined coordinates
            min_coord_x DOUBLE PRECISION,
            max_coord_x DOUBLE PRECISION,
            avg_coord_x DOUBLE PRECISION,
            min_coord_y DOUBLE PRECISION,
            max_coord_y DOUBLE PRECISION,
            avg_coord_y DOUBLE PRECISION,
            min_coord_z DOUBLE PRECISION,
            max_coord_z DOUBLE PRECISION,
            avg_coord_z DOUBLE PRECISION,
            min_coord_heading DOUBLE PRECISION,
            max_coord_heading DOUBLE PRECISION,
            avg_coord_heading DOUBLE PRECISION,
            min_coord_incl DOUBLE PRECISION,
            max_coord_incl DOUBLE PRECISION,
            avg_coord_incl DOUBLE PRECISION,
            min_coord_status DOUBLE PRECISION,
            max_coord_status DOUBLE PRECISION,
            avg_coord_status DOUBLE PRECISION,
            min_latitude DOUBLE PRECISION,
            max_latitude DOUBLE PRECISION,
            avg_latitude DOUBLE PRECISION,
            min_longitude DOUBLE PRECISION,
            max_longitude DOUBLE PRECISION,
            avg_longitude DOUBLE PRECISION,
            min_altitude DOUBLE PRECISION,
            max_altitude DOUBLE PRECISION,
            avg_altitude DOUBLE PRECISION,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_survey_paths_geom ON survey_paths USING GIST(path_linestring);
    """)
    postgres_conn.commit()
    logger.info("✅ Created survey_paths table")
    
    # First, get unique survey path CIDs to process in batches
    logger.info("Step 1: Getting unique survey path CIDs...")
    mysql_cursor.execute("""
        SELECT DISTINCT sp._CID_ as path_cid, sp._OID_ as path_oid
        FROM survey_path sp
        INNER JOIN survey_path__shapepath__x_y_z spxyz ON spxyz._CID_ = sp._CID_
        INNER JOIN coordinate cor ON cor._OID_ = spxyz._coordinate
        WHERE cor.coord_x IS NOT NULL AND cor.coord_y IS NOT NULL
    """)
    path_list = mysql_cursor.fetchall()
    logger.info(f"✅ Found {len(path_list):,} unique survey paths to process")
    
    if not path_list:
        logger.info("No survey paths found, exiting")
        mysql_conn.close()
        postgres_conn.close()
        return
    
    total_added = 0
    skipped = 0
    batch_size = 50  # Process 50 paths at a time
    
    logger.info(f"📊 Step 2/2: Processing {len(path_list)} survey paths in batches of {batch_size}...")
    
    for i in range(0, len(path_list), batch_size):
        batch_paths = path_list[i:i + batch_size]
        logger.info(f"Processing batch {i//batch_size + 1}/{(len(path_list) + batch_size - 1)//batch_size}: {len(batch_paths)} paths")
        
        # Fetch coordinates for this batch only - use path_oid from the batch, not CID
        batch_path_oids = [p['path_oid'] for p in batch_paths]
        placeholders = ','.join(['%s'] * len(batch_path_oids))
        query = f"""
            SELECT DISTINCT
                spxyz._OID_ as path_oid,
                spxyz._CID_ as spxyz_cid,
                sp._CID_ as _CID_,
                spxyz._IDX_ as coord_idx,
                spxyz._coordinate as coord_oid,
                sp._OID_ as path_oid_original,
                sp._CID_ as path_cid,
                sp.valid,
                sp.changeable,
                sp.external,
                sp.shapepath__is_path,
                sp.shapepath__ as shapepath_oid,
                sp._VER_,
                sp._VER2_,
                sp.replica_version,
                sp.replica_age,
                cor._OID_ as coordinate_oid,
                cor.latitude,
                cor.longitude,
                cor.altitude,
                cor.coord_x,
                cor.coord_y,
                cor.coord_z,
                cor.coord_heading,
                cor.coord_incl,
                cor.coord_status
            FROM survey_path__shapepath__x_y_z spxyz
            INNER JOIN survey_path sp ON sp._CID_ = spxyz._CID_
            INNER JOIN coordinate cor ON cor._OID_ = spxyz._coordinate
        WHERE spxyz._OID_ IN ({placeholders})
        AND cor.coord_x IS NOT NULL
        AND cor.coord_y IS NOT NULL
            ORDER BY spxyz._OID_, spxyz._IDX_
        """
        
        mysql_cursor.execute(query, batch_path_oids)
        
        # Process coordinates in batches
        batch_coords = []
        while True:
            rows = mysql_cursor.fetchmany(10000)
            if not rows:
                break
            batch_coords.extend(rows)
        
        # Group by path
        paths = group_by_path(batch_coords)
        logger.info(f"  Grouped into {len(paths)} paths from batch (expected ~{len(batch_paths)})")
        
        # Process and insert paths from this batch
        for path_oid, path_data in paths.items():
            coords = path_data['coordinates']
            
            if len(coords) < 2:
                skipped += 1
                continue
            
            # Transform coordinates to lat/lon
            latlon_points = []
            for coord in coords:
                if coord['coord_x'] and coord['coord_y']:
                    lat, lon = transform_local_to_latlon(coord['coord_x'], coord['coord_y'])
                    latlon_points.append((lon, lat))
            
            if len(latlon_points) < 2:
                skipped += 1
                continue
            
            # Create WKT LineString
            wkt_coords = ', '.join([f"{lon} {lat}" for lon, lat in latlon_points])
            linestring_wkt = f"LINESTRING({wkt_coords})"
            
            # Get start and end points
            start_lon, start_lat = latlon_points[0]
            end_lon, end_lat = latlon_points[-1]
            
            # Calculate aggregates from coordinate data
            coord_x_values = [c['coord_x'] for c in coords if c.get('coord_x') is not None]
            coord_y_values = [c['coord_y'] for c in coords if c.get('coord_y') is not None]
            coord_z_values = [c['coord_z'] for c in coords if c.get('coord_z') is not None]
            coord_heading_values = [c['coord_heading'] for c in coords if c.get('coord_heading') is not None]
            coord_incl_values = [c['coord_incl'] for c in coords if c.get('coord_incl') is not None]
            coord_status_values = [c['coord_status'] for c in coords if c.get('coord_status') is not None]
            latitude_values = [c['latitude'] for c in coords if c.get('latitude') is not None]
            longitude_values = [c['longitude'] for c in coords if c.get('longitude') is not None]
            altitude_values = [c['altitude'] for c in coords if c.get('altitude') is not None]
            
            def safe_agg(values):
                if not values:
                    return (None, None, None)
                return (min(values), max(values), sum(values) / len(values))
            
            min_x, max_x, avg_x = safe_agg(coord_x_values)
            min_y, max_y, avg_y = safe_agg(coord_y_values)
            min_z, max_z, avg_z = safe_agg(coord_z_values)
            min_heading, max_heading, avg_heading = safe_agg(coord_heading_values)
            min_incl, max_incl, avg_incl = safe_agg(coord_incl_values)
            min_status, max_status, avg_status = safe_agg(coord_status_values)
            min_lat, max_lat, avg_lat = safe_agg(latitude_values)
            min_lon, max_lon, avg_lon = safe_agg(longitude_values)
            min_alt, max_alt, avg_alt = safe_agg(altitude_values)
            
            # Get coordinate OIDs
            coord_oids = ','.join([str(c['coord_oid']) for c in coords])
            
            try:
                # Convert tinyint to boolean
                is_valid = bool(path_data.get('valid')) if path_data.get('valid') is not None else False
                is_changeable = bool(path_data.get('changeable')) if path_data.get('changeable') is not None else False
                is_external = bool(path_data.get('external')) if path_data.get('external') is not None else False
                shapepath_is_path = bool(path_data.get('shapepath_is_path')) if path_data.get('shapepath_is_path') is not None else None
                
                postgres_cursor.execute("""
                INSERT INTO survey_paths (
                    path_oid, path_oid_original, cid, is_valid, is_changeable, is_external,
                    shapepath_oid, shapepath_is_path,
                    version_ver, version_ver2, replica_version, replica_age,
                    total_points, path_linestring, path_length_m,
                    start_latitude, start_longitude,
                    end_latitude, end_longitude,
                    all_coordinate_oids,
                    min_coord_x, max_coord_x, avg_coord_x,
                    min_coord_y, max_coord_y, avg_coord_y,
                    min_coord_z, max_coord_z, avg_coord_z,
                    min_coord_heading, max_coord_heading, avg_coord_heading,
                    min_coord_incl, max_coord_incl, avg_coord_incl,
                    min_coord_status, max_coord_status, avg_coord_status,
                    min_latitude, max_latitude, avg_latitude,
                    min_longitude, max_longitude, avg_longitude,
                    min_altitude, max_altitude, avg_altitude
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    ST_GeomFromText(%s, 4326),
                    ST_Length(ST_GeomFromText(%s, 4326)::geography),
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
            """, (
                path_oid,
                path_data.get('path_oid_original'),
                path_data.get('cid'),
                is_valid,
                is_changeable,
                is_external,
                path_data.get('shapepath_oid'),
                shapepath_is_path,
                path_data.get('version_ver'),
                path_data.get('version_ver2'),
                path_data.get('replica_version'),
                path_data.get('replica_age'),
                len(coords),
                linestring_wkt, linestring_wkt,
                start_lat, start_lon, end_lat, end_lon,
                coord_oids,
                min_x, max_x, avg_x, min_y, max_y, avg_y, min_z, max_z, avg_z,
                min_heading, max_heading, avg_heading,
                min_incl, max_incl, avg_incl,
                min_status, max_status, avg_status,
                min_lat, max_lat, avg_lat,
                min_lon, max_lon, avg_lon,
                min_alt, max_alt, avg_alt
                ))
                total_added += 1
                
                if total_added % 50 == 0:
                    logger.info(f"  Inserted {total_added} paths so far...")
                    postgres_conn.commit()
                    
            except Exception as e:
                logger.warning(f"Failed to add survey path {path_oid}: {e}")
                postgres_conn.rollback()  # Reset transaction after error
                skipped += 1
        
        # Free memory for this batch
        del batch_coords, paths
        postgres_conn.commit()
        logger.info(f"  Batch complete: {total_added} total paths inserted")
    
    postgres_conn.commit()
    
    # Summary
    postgres_cursor.execute("""
        SELECT 
            COUNT(*) as total_paths,
            SUM(total_points) as total_points,
            ROUND(SUM(path_length_m)::numeric, 0) as total_length_m
        FROM survey_paths
    """)
    row = postgres_cursor.fetchone()
    
    logger.info(f"\n=== SURVEY PATHS SUMMARY ===")
    logger.info(f"Total Paths: {row[0]}")
    logger.info(f"Total Points: {row[1] or 0}")
    total_length = row[2] or 0
    logger.info(f"Total Length: {total_length} meters ({total_length/1000:.1f} km)")
    logger.info(f"Skipped: {skipped}")
    logger.info(f"\nComplete: Added {total_added} survey paths")
    
    mysql_conn.close()
    postgres_conn.close()

if __name__ == '__main__':
    main()
