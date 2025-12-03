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
        AND t.active = 1
        AND t.closed = 0
    """
    mysql_cursor.execute(travel_query)
    travels_list = mysql_cursor.fetchall()
    logger.info(f"✅ Found {len(travels_list):,} unique travels")
    
    if not travels_list:
        logger.info("No travels found, exiting")
        mysql_conn.close()
        postgres_conn.close()
        return
    
    # Use geometries from PostgreSQL courses table instead of re-fetching from MySQL
    logger.info("📊 Fetching course geometries from PostgreSQL courses table...")
    
    postgres_cursor.execute("""
        SELECT cid, course_linestring, ST_Length(course_linestring::geography) as length_m
        FROM courses
        WHERE course_linestring IS NOT NULL
    """)
    
    courses_in_postgres = {}
    for row in postgres_cursor.fetchall():
        courses_in_postgres[row[0]] = {
            'geometry': row[1],  # Store the geometry object, not WKT
            'length_m': row[2]
        }
    
    logger.info(f"✅ Found {len(courses_in_postgres)} courses in PostgreSQL")
    
    # Close MySQL connection - we don't need it anymore
    mysql_conn.close()
    
    # Now process all travels
    total_added = 0
    skipped = 0
    seen_connections = set()
    
    logger.info(f"📊 Processing {len(travels_list)} travels...")
    
    # Process each travel individually using PostgreSQL course geometries
    for travel in travels_list:
        from_name = travel.get('from_location_name')
        to_name = travel.get('to_location_name')
        course_cid = travel.get('course_cid')
        course_oid = travel.get('course_oid')  # This is what's stored in courses.cid!
        
        if not from_name or not to_name or not course_oid:
            skipped += 1
            continue
        
        # Get geometry from PostgreSQL courses table using course_oid (stored in courses.cid)
        if course_oid not in courses_in_postgres:
            skipped += 1
            continue
        
        course_info = courses_in_postgres[course_oid]
        segment_start = travel.get('segment_start')
        segment_end = travel.get('segment_end')
        
        # Extract the segment of the course if segment_start and segment_end are provided
        if segment_start is not None and segment_end is not None and course_info['length_m'] > 0:
            # Convert segment positions to fractions (0 to 1)
            start_fraction = max(0, min(1, segment_start / course_info['length_m']))
            end_fraction = max(0, min(1, segment_end / course_info['length_m']))
            
            # Use ST_LineSubstring to extract just the travel segment
            postgres_cursor.execute("""
                SELECT ST_AsText(ST_LineSubstring(%s::geometry, %s, %s)) as wkt
            """, (course_info['geometry'], start_fraction, end_fraction))
            result = postgres_cursor.fetchone()
            linestring_wkt = result[0] if result else None
        else:
            # No segment info, use full course
            postgres_cursor.execute("""
                SELECT ST_AsText(%s::geometry) as wkt
            """, (course_info['geometry'],))
            result = postgres_cursor.fetchone()
            linestring_wkt = result[0] if result else None
        
        if not linestring_wkt:
            skipped += 1
            continue
        
        # Parse WKT to get start/end points (LINESTRING(lon lat, lon lat, ...))
        coords_str = linestring_wkt.replace('LINESTRING(', '').replace(')', '')
        coord_pairs = coords_str.split(',')
        
        if len(coord_pairs) < 2:
            skipped += 1
            continue
        
        # Get start and end points
        start_parts = coord_pairs[0].strip().split()
        end_parts = coord_pairs[-1].strip().split()
        start_lon, start_lat = float(start_parts[0]), float(start_parts[1])
        end_lon, end_lat = float(end_parts[0]), float(end_parts[1])
        
        total_points = len(coord_pairs)
        
        # Set aggregates to None (we don't have raw coord_x/y/z anymore)
        min_x = max_x = avg_x = None
        min_y = max_y = avg_y = None
        min_z = max_z = avg_z = None
        
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
                    total_points,
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
    logger.info(f"\nComplete: Added {total_added} travels")
    
    postgres_conn.close()

if __name__ == '__main__':
    main()
