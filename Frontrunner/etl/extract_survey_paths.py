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
            sp._CID_,
            sp.valid,
            sp.changeable,
            sp.external,
            spxyz._IDX_ as coord_idx,
            spxyz._coordinate as coord_oid,
            cor.coord_x,
            cor.coord_y,
            cor.coord_z
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
                'valid': row['valid'],
                'changeable': row['changeable'],
                'external': row['external'],
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
                'coord_x': row['coord_x'],
                'coord_y': row['coord_y'],
                'coord_z': row['coord_z']
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
            cid VARCHAR(255),
            is_valid BOOLEAN,
            is_changeable BOOLEAN,
            is_external BOOLEAN,
            total_points INTEGER NOT NULL,
            path_linestring GEOMETRY(LineString, 4326),
            path_length_m DOUBLE PRECISION,
            start_latitude DOUBLE PRECISION,
            start_longitude DOUBLE PRECISION,
            end_latitude DOUBLE PRECISION,
            end_longitude DOUBLE PRECISION,
            all_coordinate_oids TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_survey_paths_geom ON survey_paths USING GIST(path_linestring);
    """)
    postgres_conn.commit()
    logger.info("✅ Created survey_paths table")
    
    # Extract coordinates
    logger.info("Extracting survey path coordinates...")
    coordinates = extract_survey_paths(mysql_cursor)
    
    paths = group_by_path(coordinates)
    logger.info(f"Grouped into {len(paths)} survey paths")
    
    total_added = 0
    skipped = 0
    
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
        
        # Get coordinate OIDs
        coord_oids = ','.join([str(c['coord_oid']) for c in coords])
        
        try:
            # Convert tinyint to boolean
            is_valid = bool(path_data['valid']) if path_data['valid'] is not None else False
            is_changeable = bool(path_data['changeable']) if path_data['changeable'] is not None else False
            is_external = bool(path_data['external']) if path_data['external'] is not None else False
            
            postgres_cursor.execute("""
                INSERT INTO survey_paths (
                    path_oid, cid, is_valid, is_changeable, is_external,
                    total_points, path_linestring, path_length_m,
                    start_latitude, start_longitude,
                    end_latitude, end_longitude,
                    all_coordinate_oids
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s,
                    ST_GeomFromText(%s, 4326),
                    ST_Length(ST_GeomFromText(%s, 4326)::geography),
                    %s, %s, %s, %s, %s
                )
            """, (
                path_oid, path_data['cid'], is_valid, 
                is_changeable, is_external, len(coords),
                linestring_wkt, linestring_wkt,
                start_lat, start_lon, end_lat, end_lon,
                coord_oids
            ))
            total_added += 1
            
            if total_added % 100 == 0:
                logger.info(f"Processed {total_added} survey paths...")
                postgres_conn.commit()
                
        except Exception as e:
            logger.warning(f"Failed to add survey path {path_oid}: {e}")
            skipped += 1
    
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
    logger.info(f"\n✅ Complete: Added {total_added} survey paths")
    
    mysql_conn.close()
    postgres_conn.close()

if __name__ == '__main__':
    main()
