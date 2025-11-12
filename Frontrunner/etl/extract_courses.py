#!/usr/bin/env python3
"""
Extract course/road data from MySQL and create road geometries in PostgreSQL
Courses represent the actual road network with their paths and attributes
"""

import mysql.connector
import psycopg2
import logging
import json
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
ENCRYPTION_KEY = 'a8ba99bd-6871-4344-a227-4c2807ef5fbc'

def transform_local_to_latlon(x_mm, y_mm):
    """Transform local mine coordinates (mm) to WGS84 lat/lon using UTM Zone 50S"""
    x_meters = x_mm / 1000.0
    y_meters = y_mm / 1000.0
    easting = EASTING_ORIGIN + x_meters
    northing = NORTHING_ORIGIN + y_meters
    latitude = LAT_OFFSET + (northing - NORTHING_ORIGIN) / 111000.0
    longitude = LNG_OFFSET + (easting - EASTING_ORIGIN) / (111000.0 * abs(math.cos(math.radians(LAT_OFFSET))))
    return latitude, longitude

def extract_courses(mysql_cursor):
    """Extract all courses with their coordinates and attributes - grouped by course geometry _OID_"""
    # Use DISTINCT to avoid duplicates from the join
    # Group by the course geometry _OID_ (which represents a unique course path)
    query = f"""
        SELECT DISTINCT
            ccxyz._OID_ as course_oid,
            c._CID_,
            c.course_attributes__value,
            c.aht_profile_name,
            c.road_type,
            c.coursegeometry__inflections,
            c._spline,
            ccxyz._IDX_ as coord_idx,
            ccxyz._coordinate as coord_oid,
            cor.coord_x,
            cor.coord_y,
            cor.coord_z
        FROM course__coursegeometry__x_y_z ccxyz
        INNER JOIN course c ON c._CID_ = ccxyz._CID_
        INNER JOIN coordinate cor ON cor._OID_ = ccxyz._coordinate
        WHERE cor.coord_x IS NOT NULL
        AND cor.coord_y IS NOT NULL
        ORDER BY ccxyz._OID_, ccxyz._IDX_
    """
    
    logger.info("Executing course extraction query...")
    mysql_cursor.execute(query)
    results = mysql_cursor.fetchall()
    logger.info(f"Found {len(results)} course coordinate records")
    return results

def group_by_course(coordinates):
    """Group coordinates by course _OID_, maintaining order by _IDX_"""
    courses = {}
    for row in coordinates:
        course_oid = row['course_oid']
        if course_oid not in courses:
            courses[course_oid] = {
                'cid': row['_CID_'],
                'course_attributes': row['course_attributes__value'],
                'aht_profile_name': row['aht_profile_name'],
                'road_type': row['road_type'],
                'inflections': row['coursegeometry__inflections'],
                'seen_coords': set(),  # Track unique coordinate OIDs
                'spline': row['_spline'],
                'coordinates': []
            }
        
        # Only add coordinate if we haven't seen it before (avoid duplicates)
        coord_oid = row['coord_oid']
        if coord_oid not in courses[course_oid]['seen_coords']:
            courses[course_oid]['seen_coords'].add(coord_oid)
            courses[course_oid]['coordinates'].append({
                'idx': row['coord_idx'],
                'coord_oid': coord_oid,
                'coord_x': row['coord_x'],
                'coord_y': row['coord_y'],
                'coord_z': row['coord_z']
            })
    
    # Sort coordinates by index for each course
    for course_oid in courses:
        courses[course_oid]['coordinates'].sort(key=lambda c: c['idx'])
    
    return courses

def main():
    logger.info("=== Extracting Course/Road Data ===")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_cursor = postgres_conn.cursor()
    
    # Create courses table
    postgres_cursor.execute("""
        DROP TABLE IF EXISTS courses CASCADE;
        CREATE TABLE courses (
            course_id SERIAL PRIMARY KEY,
            cid VARCHAR(255) NOT NULL UNIQUE,
            course_name VARCHAR(255),
            haul_profile_name VARCHAR(255),
            road_type VARCHAR(100),
            inflections TEXT,
            is_spline BOOLEAN,
            total_points INTEGER NOT NULL,
            course_linestring GEOMETRY(LineString, 4326),
            course_length_m DOUBLE PRECISION,
            start_latitude DOUBLE PRECISION,
            start_longitude DOUBLE PRECISION,
            end_latitude DOUBLE PRECISION,
            end_longitude DOUBLE PRECISION,
            all_coordinate_oids TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_courses_geom ON courses USING GIST(course_linestring);
        CREATE INDEX idx_courses_road_type ON courses(road_type);
    """)
    postgres_conn.commit()
    logger.info("✅ Created courses table")
    
    # Extract coordinates
    logger.info("Extracting course coordinates...")
    coordinates = extract_courses(mysql_cursor)
    
    courses = group_by_course(coordinates)
    logger.info(f"Grouped into {len(courses)} courses")
    
    total_added = 0
    skipped = 0
    
    for course_oid, course_data in courses.items():
        coords = course_data['coordinates']
        
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
        
        # Determine course name from attributes or road type
        course_name = course_data['aht_profile_name'] or f"Road_{course_oid}"
        if course_data['course_attributes']:
            course_name = f"{course_name} (Attr: {course_data['course_attributes']})"
        
        try:
            # Convert spline to boolean (it might be an OID string or NULL)
            is_spline = course_data['spline'] is not None and str(course_data['spline']).strip() != ''
            
            postgres_cursor.execute("""
                INSERT INTO courses (
                    cid, course_name, haul_profile_name, road_type,
                    inflections, is_spline, total_points,
                    course_linestring, course_length_m,
                    start_latitude, start_longitude,
                    end_latitude, end_longitude,
                    all_coordinate_oids
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    ST_GeomFromText(%s, 4326),
                    ST_Length(ST_GeomFromText(%s, 4326)::geography),
                    %s, %s, %s, %s, %s
                )
            """, (
                course_oid, course_name, course_data['aht_profile_name'], course_data['road_type'],
                str(course_data['inflections']), is_spline, len(coords),
                linestring_wkt, linestring_wkt,
                start_lat, start_lon, end_lat, end_lon,
                course_oid
            ))
            total_added += 1
            
            if total_added % 100 == 0:
                logger.info(f"Processed {total_added} courses...")
                postgres_conn.commit()
                
        except Exception as e:
            logger.warning(f"Failed to add course {course_oid}: {e}")
            skipped += 1
    
    postgres_conn.commit()
    
    # Summary
    postgres_cursor.execute("""
        SELECT 
            COUNT(*) as total_courses,
            SUM(total_points) as total_points,
            ROUND(SUM(course_length_m)::numeric, 0) as total_length_m,
            COUNT(DISTINCT road_type) as road_types
        FROM courses
    """)
    row = postgres_cursor.fetchone()
    
    logger.info(f"\n=== COURSES SUMMARY ===")
    logger.info(f"Total Courses: {row[0]}")
    logger.info(f"Total Points: {row[1]}")
    logger.info(f"Total Length: {row[2]} meters ({row[2]/1000:.1f} km)")
    logger.info(f"Road Types: {row[3]}")
    logger.info(f"Skipped: {skipped}")
    
    # Show road type breakdown
    postgres_cursor.execute("""
        SELECT road_type, COUNT(*) as count, ROUND(SUM(course_length_m)::numeric, 0) as length_m
        FROM courses
        GROUP BY road_type
        ORDER BY count DESC
    """)
    
    logger.info("\n=== ROAD TYPE BREAKDOWN ===")
    for row in postgres_cursor.fetchall():
        road_type = row[0] or 'Unknown'
        logger.info(f"{road_type:20} {row[1]:4} courses, {row[2]:10} m")
    
    logger.info(f"\n✅ Complete: Added {total_added} courses")
    
    mysql_conn.close()
    postgres_conn.close()

if __name__ == '__main__':
    main()
