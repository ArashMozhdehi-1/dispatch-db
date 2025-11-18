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
        WITH intersection_buffer AS (
            -- Create small buffer around each intersection point (5 meters)
            SELECT 
                point_id,
                ST_Buffer(geom::geography, 5)::geometry as buffer_geom
            FROM road_intersection_points
        ),
        roads_with_intersections AS (
            -- Find roads that intersect with buffers
            SELECT 
                c.course_id,
                c.cid,
                c.course_name,
                c.haul_profile_name,
                c.road_type,
                c.total_points,
                c.course_linestring,
                ST_Union(ib.buffer_geom) as intersection_union
            FROM courses c
            LEFT JOIN intersection_buffer ib ON ST_Intersects(c.course_linestring, ib.buffer_geom)
            WHERE c.course_linestring IS NOT NULL
            GROUP BY c.course_id, c.cid, c.course_name, c.haul_profile_name, c.road_type, c.total_points, c.course_linestring
        ),
        roads_split AS (
            -- Split roads at intersection buffers using LATERAL
            SELECT 
                r.course_id,
                r.cid,
                r.course_name,
                r.haul_profile_name,
                r.road_type,
                r.total_points,
                COALESCE(d.geom, r.course_linestring) as cleaned_linestring
            FROM roads_with_intersections r
            LEFT JOIN LATERAL (
                SELECT (ST_Dump(ST_Difference(r.course_linestring, r.intersection_union))).geom
                WHERE r.intersection_union IS NOT NULL
            ) d ON true
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
        FROM roads_split
        WHERE cleaned_linestring IS NOT NULL
            AND ST_GeometryType(cleaned_linestring) = 'ST_LineString'
            AND ST_Length(cleaned_linestring::geography) > 1.0;  -- Remove tiny segments < 1m
        
        CREATE INDEX idx_courses_cleaned_geom ON courses_cleaned USING GIST(course_linestring);
        CREATE INDEX idx_courses_cleaned_course_id ON courses_cleaned(course_id);
    """)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM courses_cleaned")
    cleaned_count = cursor.fetchone()[0]
    logger.info(f"✅ Created {cleaned_count} cleaned road segments")
    
    # Step 3: Do the same for survey paths
    logger.info("Step 3: Cleaning survey paths...")
    cursor.execute("""
        DROP TABLE IF EXISTS survey_paths_cleaned CASCADE;
        CREATE TABLE survey_paths_cleaned AS
        WITH intersection_buffer AS (
            SELECT 
                point_id,
                ST_Buffer(geom::geography, 5)::geometry as buffer_geom
            FROM road_intersection_points
        ),
        paths_with_intersections AS (
            -- Find paths that intersect with buffers
            SELECT 
                sp.path_id,
                sp.path_oid,
                sp.cid,
                sp.is_valid,
                sp.total_points,
                sp.path_linestring,
                ST_Union(ib.buffer_geom) as intersection_union
            FROM survey_paths sp
            LEFT JOIN intersection_buffer ib ON ST_Intersects(sp.path_linestring, ib.buffer_geom)
            WHERE sp.path_linestring IS NOT NULL
            GROUP BY sp.path_id, sp.path_oid, sp.cid, sp.is_valid, sp.total_points, sp.path_linestring
        ),
        paths_split AS (
            -- Split paths at intersection buffers using LATERAL
            SELECT 
                p.path_id,
                p.path_oid,
                p.cid,
                p.is_valid,
                p.total_points,
                COALESCE(d.geom, p.path_linestring) as cleaned_linestring
            FROM paths_with_intersections p
            LEFT JOIN LATERAL (
                SELECT (ST_Dump(ST_Difference(p.path_linestring, p.intersection_union))).geom
                WHERE p.intersection_union IS NOT NULL
            ) d ON true
        )
        SELECT 
            row_number() OVER () as segment_id,
            path_id,
            path_oid,
            cid,
            is_valid,
            total_points,
            cleaned_linestring as path_linestring,
            ST_Length(cleaned_linestring::geography) as segment_length_m
        FROM paths_split
        WHERE cleaned_linestring IS NOT NULL
            AND ST_GeometryType(cleaned_linestring) = 'ST_LineString'
            AND ST_Length(cleaned_linestring::geography) > 1.0;
        
        CREATE INDEX idx_survey_paths_cleaned_geom ON survey_paths_cleaned USING GIST(path_linestring);
    """)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM survey_paths_cleaned")
    survey_cleaned_count = cursor.fetchone()[0]
    logger.info(f"✅ Created {survey_cleaned_count} cleaned survey path segments")
    
    # Summary
    logger.info("\n=== CLEANUP SUMMARY ===")
    logger.info(f"Intersection points detected: {intersection_count}")
    logger.info(f"Cleaned course segments: {cleaned_count}")
    logger.info(f"Cleaned survey path segments: {survey_cleaned_count}")
    logger.info("\n💡 Use courses_cleaned and survey_paths_cleaned tables for rendering")
    logger.info("   These tables have roads properly split at intersections")
    
    conn.close()

if __name__ == '__main__':
    clean_road_intersections()
