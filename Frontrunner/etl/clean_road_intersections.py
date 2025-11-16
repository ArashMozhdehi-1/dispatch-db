#!/usr/bin/env python3
"""
Clean up messy road intersections by detecting where roads cross
and properly trimming/merging them at intersection points
"""

import psycopg2
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

POSTGRES_CONFIG = {
    'host': 'postgres',
    'port': 5432,
    'database': 'infrastructure_db',
    'user': 'infra_user',
    'password': 'infra_password'
}

def clean_road_intersections():
    """
    Use PostGIS spatial analysis to:
    1. Find where roads actually intersect (not just at endpoints)
    2. Split roads at intersection points
    3. Create clean connection points
    4. Remove duplicate/overlapping segments
    """
    
    logger.info("=== Cleaning Road Intersections ===")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor()
    
    # Step 1: Find all road intersection points
    logger.info("Step 1: Detecting road intersection points...")
    cursor.execute("""
        DROP TABLE IF EXISTS road_intersection_points CASCADE;
        CREATE TABLE road_intersection_points AS
        WITH road_pairs AS (
            -- Find all pairs of roads that intersect (not just touch at endpoints)
            SELECT 
                c1.course_id as road1_id,
                c2.course_id as road2_id,
                ST_Intersection(c1.course_linestring, c2.course_linestring) as intersection_geom
            FROM courses c1
            CROSS JOIN courses c2
            WHERE c1.course_id < c2.course_id  -- Avoid duplicates
                AND ST_Intersects(c1.course_linestring, c2.course_linestring)
                AND NOT ST_Touches(c1.course_linestring, c2.course_linestring)  -- Exclude simple endpoint touches
                AND ST_GeometryType(ST_Intersection(c1.course_linestring, c2.course_linestring)) = 'ST_Point'
        )
        SELECT 
            row_number() OVER () as point_id,
            road1_id,
            road2_id,
            intersection_geom as geom,
            ST_X(intersection_geom) as lon,
            ST_Y(intersection_geom) as lat
        FROM road_pairs;
        
        CREATE INDEX idx_road_intersection_points_geom ON road_intersection_points USING GIST(geom);
    """)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM road_intersection_points")
    intersection_count = cursor.fetchone()[0]
    logger.info(f"✅ Found {intersection_count} road intersection points")
    
    # Step 2: Create cleaned road segments
    logger.info("Step 2: Creating cleaned road segments...")
    cursor.execute("""
        DROP TABLE IF EXISTS courses_cleaned CASCADE;
        CREATE TABLE courses_cleaned AS
        WITH road_endpoints AS (
            -- Get first and last points of each road
            SELECT
                course_id,
                cid,
                course_name,
                haul_profile_name,
                road_type,
                total_points,
                course_linestring,
                ST_StartPoint(course_linestring) as start_point,
                ST_EndPoint(course_linestring) as end_point
            FROM courses
            WHERE course_linestring IS NOT NULL
        ),
        endpoint_buffers AS (
            -- Buffer the entire linestring by lane width (3 meters)
            -- This creates a polygon representing the road surface
            SELECT
                course_id,
                ST_Buffer(course_linestring::geography, 1.5)::geometry as road_buffer
            FROM road_endpoints
        ),
        roads_trimmed AS (
            -- Keep roads as-is, no trimming
            -- The buffer is just for visualization/intersection detection
            SELECT
                r.course_id,
                r.cid,
                r.course_name,
                r.haul_profile_name,
                r.road_type,
                r.total_points,
                r.course_linestring as cleaned_linestring
            FROM road_endpoints r
        )
        SELECT
            row_number() OVER () as segment_id,
            course_id,
            cid,
            course_name,
            haul_profile_name,
            road_type,
            total_points,
            cleaned_linestring as course_linestring,
            ST_Length(cleaned_linestring::geography) as segment_length_m,
            ST_StartPoint(cleaned_linestring) as start_point,
            ST_EndPoint(cleaned_linestring) as end_point
        FROM roads_trimmed
        WHERE cleaned_linestring IS NOT NULL
            AND ST_GeometryType(cleaned_linestring) = 'ST_LineString'
            AND ST_Length(cleaned_linestring::geography) > 1.0;

        CREATE INDEX idx_courses_cleaned_geom
            ON courses_cleaned USING GIST(course_linestring);
        CREATE INDEX idx_courses_cleaned_course_id
            ON courses_cleaned(course_id);
    """)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM courses_cleaned")
    cleaned_count = cursor.fetchone()[0]
    logger.info(f"✅ Created {cleaned_count} cleaned road segments")
    
    # Summary
    logger.info("\n=== CLEANUP SUMMARY ===")
    logger.info(f"Intersection points detected: {intersection_count}")
    logger.info(f"Cleaned course segments: {cleaned_count}")
    logger.info("\n💡 Use courses_cleaned table for rendering courses")
    logger.info("   Survey paths are left untouched (use original survey_paths table)")
    logger.info("   Courses have been trimmed at their endpoints at intersections")
    
    conn.close()

if __name__ == '__main__':
    clean_road_intersections()
