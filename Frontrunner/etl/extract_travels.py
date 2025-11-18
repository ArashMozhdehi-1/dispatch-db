#!/usr/bin/env python3
"""
Extract travel data from MySQL and create travel geometries in PostgreSQL
Travels represent aggregated courses based on from/to locations
"""

import mysql.connector
import psycopg2
import logging
import math
import hashlib

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

def main():
    logger.info("=== Extracting Travel Data with Courses ===")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_cursor = postgres_conn.cursor()
    
    # Create travels table
    logger.info("Creating travels table in PostgreSQL...")
    postgres_cursor.execute("""
        DROP TABLE IF EXISTS travels CASCADE;
        CREATE TABLE travels (
            travel_id SERIAL PRIMARY KEY,
            travel_oid VARCHAR(16) NOT NULL UNIQUE,
            travel_cid VARCHAR(255),
            course_oid VARCHAR(255),
            course_cid VARCHAR(255),
            from_location_name VARCHAR(255),
            to_location_name VARCHAR(255),
            from_location_cid VARCHAR(255),
            to_location_cid VARCHAR(255),
            road_type VARCHAR(100),
            aht_profile_name VARCHAR(255),
            course_attributes_value TEXT,
            inflections TEXT,
            spline_oid VARCHAR(32),
            inclination_factor DOUBLE PRECISION,
            start_direction DOUBLE PRECISION,
            active BOOLEAN,
            closed BOOLEAN,
            segment_start DOUBLE PRECISION,
            segment_end DOUBLE PRECISION,
            total_points INTEGER NOT NULL,
            travel_linestring GEOMETRY(LineString, 4326),
            travel_length_m DOUBLE PRECISION,
            start_latitude DOUBLE PRECISION,
            start_longitude DOUBLE PRECISION,
            end_latitude DOUBLE PRECISION,
            end_longitude DOUBLE PRECISION,
            -- Aggregate coordinate data
            min_coord_x DOUBLE PRECISION,
            max_coord_x DOUBLE PRECISION,
            avg_coord_x DOUBLE PRECISION,
            min_coord_y DOUBLE PRECISION,
            max_coord_y DOUBLE PRECISION,
            avg_coord_y DOUBLE PRECISION,
            min_coord_z DOUBLE PRECISION,
            max_coord_z DOUBLE PRECISION,
            avg_coord_z DOUBLE PRECISION,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_travels_geom ON travels USING GIST(travel_linestring);
        CREATE INDEX idx_travels_from_to ON travels(from_location_name, to_location_name);
    """)
    postgres_conn.commit()
    logger.info("✅ Created travels table")
    
    # Extract travels first (this is small)
    logger.info("Extracting travel metadata...")
    travel_query = """
        SELECT DISTINCT
            t._OID_ as travel_oid,
            t._CID_ as travel_cid,
            t._segment__course,
            t._fromloc,
            t._toloc,
            t.active,
            t.closed,
            t.segment__start,
            t.segment__end,
            from_loc.name as from_location_name,
            from_loc._CID_ as from_location_cid,
            to_loc.name as to_location_name,
            to_loc._CID_ as to_location_cid,
            c._OID_ as course_oid,
            c._CID_ as course_cid,
            c.road_type,
            c.aht_profile_name,
            c.course_attributes__value,
            c.coursegeometry__inflections,
            c._spline,
            c.inclination_factor,
            c.start_direction
        FROM travel t
        INNER JOIN course c ON t._segment__course = c._OID_
        INNER JOIN pit_loc from_loc ON t._fromloc = from_loc._OID_
        INNER JOIN pit_loc to_loc ON t._toloc = to_loc._OID_
        WHERE t._segment__course IS NOT NULL
    """
    mysql_cursor.execute(travel_query)
    travels_list = mysql_cursor.fetchall()
    logger.info(f"✅ Found {len(travels_list):,} unique travels")
    
    if not travels_list:
        logger.info("No travels found, exiting")
        mysql_conn.close()
        postgres_conn.close()
        return
    
    # Get unique course CIDs and OIDs
    course_cids = set(t['course_cid'] for t in travels_list if t['course_cid'])
    course_oids = set(t['course_oid'] for t in travels_list if t['course_oid'])
    logger.info(f"✅ Found {len(course_cids):,} unique course CIDs")
    logger.info(f"✅ Found {len(course_oids):,} unique course OIDs")
    
    # Decide whether to use OIDs or CIDs for fetching coordinates
    # Use OIDs if there are more unique OIDs than CIDs, or if CIDs are missing
    use_oid = len(course_oids) > len(course_cids) or len(course_cids) == 0
    course_ids_to_fetch = list(course_oids) if use_oid else list(course_cids)
    logger.info(f"📊 Using {'OIDs' if use_oid else 'CIDs'} for coordinate fetching ({len(course_ids_to_fetch)} courses)")
    
    # Fetch ALL coordinates at once (no batching)
    logger.info("📊 Fetching coordinates for all courses...")
    
    if use_oid:
        # First, get the CIDs for all course OIDs
        placeholders = ','.join(['%s'] * len(course_ids_to_fetch))
        cid_query = f"""
            SELECT DISTINCT _OID_, _CID_ 
            FROM course 
            WHERE _OID_ IN ({placeholders})
        """
        mysql_cursor.execute(cid_query, course_ids_to_fetch)
        cid_rows = mysql_cursor.fetchall()
        oid_to_cid = {row['_OID_']: row['_CID_'] for row in cid_rows}
        all_cids = list(oid_to_cid.values())
        
        logger.info(f"✅ Found {len(all_cids)} CIDs for {len(course_ids_to_fetch)} course OIDs")
        
        if not all_cids:
            logger.warning("❌ No CIDs found for any course OIDs!")
            mysql_conn.close()
            postgres_conn.close()
            return
        
        # Now fetch coordinates using all CIDs
        # Group by ccxyz._OID_ (course geometry) to get unique course paths
        cid_placeholders = ','.join(['%s'] * len(all_cids))
        coord_query = f"""
            SELECT 
                ccxyz._OID_ as geometry_oid,
                ccxyz._CID_ as course_cid,
                c._OID_ as course_oid,
                ccxyz._IDX_ as coord_idx,
                ccxyz._coordinate as coord_oid,
                cor.coord_x,
                cor.coord_y,
                cor.coord_z
            FROM course__coursegeometry__x_y_z ccxyz
            INNER JOIN course c ON c._CID_ = ccxyz._CID_
            INNER JOIN coordinate cor ON cor._OID_ = ccxyz._coordinate
            WHERE c._OID_ IN ({cid_placeholders})
            AND cor.coord_x IS NOT NULL
            AND cor.coord_y IS NOT NULL
            ORDER BY c._OID_, ccxyz._IDX_
        """
        # Use course OIDs for the query since we're querying by c._OID_
        all_oids = list(course_ids_to_fetch)  # These are already OIDs
        logger.info(f"📊 Executing coordinate query for {len(all_oids)} course OIDs...")
        mysql_cursor.execute(coord_query, all_oids)
    else:
        placeholders = ','.join(['%s'] * len(course_ids_to_fetch))
        coord_query = f"""
            SELECT 
                ccxyz._OID_ as geometry_oid,
                ccxyz._CID_ as course_cid,
                c._OID_ as course_oid,
                ccxyz._IDX_ as coord_idx,
                ccxyz._coordinate as coord_oid,
                cor.coord_x,
                cor.coord_y,
                cor.coord_z
            FROM course__coursegeometry__x_y_z ccxyz
            INNER JOIN course c ON c._CID_ = ccxyz._CID_
            INNER JOIN coordinate cor ON cor._OID_ = ccxyz._coordinate
            WHERE c._CID_ IN ({placeholders})
            AND cor.coord_x IS NOT NULL
            AND cor.coord_y IS NOT NULL
            ORDER BY c._OID_, ccxyz._IDX_
        """
        logger.info(f"📊 Executing coordinate query for {len(course_ids_to_fetch)} course CIDs...")
        mysql_cursor.execute(coord_query, course_ids_to_fetch)
    
    # Group coordinates by course identifier (OID or CID) for lookup
    coords_by_course = {}
    total_coords_fetched = 0
    
    logger.info("📊 Fetching coordinate results...")
    while True:
        rows = mysql_cursor.fetchmany(10000)
        if not rows:
            break
        total_coords_fetched += len(rows)
        for coord in rows:
            # Use course_oid from the query result
            if use_oid:
                course_key = coord.get('course_oid')
            else:
                course_key = coord.get('course_cid')
            
            if not course_key:
                continue
            
            if course_key not in coords_by_course:
                coords_by_course[course_key] = []
            
            coords_by_course[course_key].append({
                'idx': coord.get('coord_idx', 0),
                'coord_x': coord.get('coord_x'),
                'coord_y': coord.get('coord_y'),
                'coord_z': coord.get('coord_z')
            })
    
    # Sort coordinates by index for each course
    for course_key in coords_by_course:
        coords_by_course[course_key].sort(key=lambda c: c.get('idx', 0))
    
    logger.info(f"✅ Fetched {total_coords_fetched:,} coordinates for {len(coords_by_course)} courses")
    
    # Now process all travels
    total_added = 0
    skipped = 0
    seen_connections = set()
    
    logger.info(f"📊 Processing {len(travels_list)} travels...")
    
    # Process each travel individually (don't aggregate by from/to location)
    for travel in travels_list:
        from_name = travel.get('from_location_name')
        to_name = travel.get('to_location_name')
        course_cid = travel.get('course_cid')
        course_oid = travel.get('course_oid')
        
        if not from_name or not to_name:
            skipped += 1
            continue
        
        # Get coordinates for this specific course
        course_key_for_lookup = course_oid if use_oid else course_cid
        if course_key_for_lookup not in coords_by_course:
            skipped += 1
            continue
        
        coords = coords_by_course[course_key_for_lookup]
        
        if len(coords) < 2:
            skipped += 1
            continue
        
        # Transform coordinates to lat/lon
        latlon_points = []
        for coord in coords:
            if coord.get('coord_x') and coord.get('coord_y'):
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
        
        def safe_agg(values):
            if not values:
                return (None, None, None)
            return (min(values), max(values), sum(values) / len(values))
        
        min_x, max_x, avg_x = safe_agg(coord_x_values)
        min_y, max_y, avg_y = safe_agg(coord_y_values)
        min_z, max_z, avg_z = safe_agg(coord_z_values)
        
        # Create unique travel_oid from travel data
        travel_key = f"{from_name}->{to_name}:{course_oid or course_cid}"
        travel_oid = hashlib.md5(travel_key.encode()).hexdigest()[:16]
        
        # Convert boolean fields
        is_active = bool(travel.get('active')) if travel.get('active') is not None else None
        is_closed = bool(travel.get('closed')) if travel.get('closed') is not None else None
        
        try:
            postgres_cursor.execute("""
                    INSERT INTO travels (
                        travel_oid, travel_cid, course_oid, course_cid,
                        from_location_name, to_location_name,
                        from_location_cid, to_location_cid,
                        road_type, aht_profile_name, course_attributes_value,
                        inflections, spline_oid, inclination_factor, start_direction,
                        active, closed, segment_start, segment_end,
                        total_points, travel_linestring, travel_length_m,
                        start_latitude, start_longitude,
                        end_latitude, end_longitude,
                        min_coord_x, max_coord_x, avg_coord_x,
                        min_coord_y, max_coord_y, avg_coord_y,
                        min_coord_z, max_coord_z, avg_coord_z
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        ST_GeomFromText(%s, 4326),
                        ST_Length(ST_GeomFromText(%s, 4326)::geography),
                        %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                """, (
                    travel_oid,
                    travel.get('travel_cid'),
                    course_oid,
                    course_cid,
                    from_name,
                    to_name,
                    travel.get('from_location_cid'),
                    travel.get('to_location_cid'),
                    travel.get('road_type'),
                    travel.get('aht_profile_name'),
                    travel.get('course_attributes__value'),
                    str(travel.get('coursegeometry__inflections')) if travel.get('coursegeometry__inflections') else None,
                    travel.get('_spline'),
                    travel.get('inclination_factor'),
                    travel.get('start_direction'),
                    is_active,
                    is_closed,
                    travel.get('segment_start'),
                    travel.get('segment_end'),
                    len(coords),
                    linestring_wkt,
                    linestring_wkt,
                    start_lat,
                    start_lon,
                    end_lat,
                    end_lon,
                    min_x, max_x, avg_x,
                    min_y, max_y, avg_y,
                    min_z, max_z, avg_z
                ))
                
            total_added += 1
            if total_added % 50 == 0:
                logger.info(f"  Inserted {total_added} travels so far...")
                postgres_conn.commit()
        
        except Exception as e:
            logger.error(f"Error inserting travel {travel_oid}: {e}")
            postgres_conn.rollback()  # Reset transaction after error
            skipped += 1
            continue
    
    postgres_conn.commit()
    logger.info(f"✅ Processed all travels")
    
    # Summary
    postgres_cursor.execute("""
        SELECT 
            COUNT(*) as total_travels,
            SUM(total_points) as total_points,
            ROUND(SUM(travel_length_m)::numeric, 0) as total_length_m
        FROM travels
    """)
    row = postgres_cursor.fetchone()
    
    logger.info(f"\n=== TRAVELS SUMMARY ===")
    logger.info(f"Total Travels: {row[0]}")
    logger.info(f"Total Points: {row[1] or 0}")
    total_length = row[2] or 0
    if total_length:
        logger.info(f"Total Length: {total_length} meters ({total_length/1000:.1f} km)")
    else:
        logger.info(f"Total Length: 0 meters (0.0 km)")
    logger.info(f"Skipped: {skipped}")
    logger.info(f"\n✅ Complete: Added {total_added} travels")
    
    mysql_conn.close()
    postgres_conn.close()

if __name__ == '__main__':
    main()
