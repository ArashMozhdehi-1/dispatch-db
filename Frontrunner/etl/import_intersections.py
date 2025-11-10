#!/usr/bin/env python3
"""
Import intersections from MySQL to PostgreSQL consolidated_intersections table
Groups by _location field (like "I9") and creates polygons
"""

import psycopg2
import mysql.connector
from mysql.connector import Error
import os
import re
import logging
from typing import List, Dict

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MySQL connection config
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'localhost'),
    'port': int(os.getenv('MYSQL_PORT', 3306)),
    'database': os.getenv('MYSQL_DB', 'frontrunnerv3'),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', '')
}

# PostgreSQL connection config
POSTGRES_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'infrastructure_db'),
    'user': os.getenv('DB_USER', 'infra_user'),
    'password': os.getenv('DB_PASSWORD', 'infra_password')
}

def get_mysql_connection():
    """Get MySQL database connection"""
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        return conn
    except Error as e:
        logger.error(f"Error connecting to MySQL: {e}")
        raise

def get_postgres_connection():
    """Get PostgreSQL database connection"""
    try:
        conn = psycopg2.connect(**POSTGRES_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"Error connecting to PostgreSQL: {e}")
        raise

def extract_intersection_location(name: str) -> str:
    """Extract _location identifier from intersection name (e.g., 'I9' from 'I9' or 'I9_1')"""
    if not name:
        return None
    
    # Match pattern like "I9", "I10", etc.
    match = re.match(r'^([A-Z]\d+)', name)
    if match:
        return match.group(1)
    
    # If name is already just the identifier
    if re.match(r'^[A-Z]\d+$', name):
        return name
    
    return name.split('_')[0] if '_' in name else name

def extract_intersections_from_mysql() -> List[Dict]:
    """Extract intersection data from MySQL map_intersection table"""
    mysql_conn = get_mysql_connection()
    cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # First, try to get intersections from map_intersection table
        # Check if they have geometry_wkt that we can extract points from
        query1 = """
        SELECT 
            mi._OID_ as intersection_id,
            mi.name as intersection_name,
            mi._CID_ as category_type,
            mi.geometry_wkt,
            mi.is_open
        FROM map_intersection mi
        WHERE mi.name IS NOT NULL
        ORDER BY mi.name
        """
        
        cursor.execute(query1)
        intersections = cursor.fetchall()
        logger.info(f"Found {len(intersections)} intersections in map_intersection table")
        
        # If we have geometry_wkt, we can extract points from it
        # But we also need to check if they're linked to coordinates via survey_location
        query2 = """
        SELECT DISTINCT
            mi._OID_ as intersection_id,
            mi.name as intersection_name,
            mi._CID_ as category_type,
            c._OID_ as coordinate_id,
            c.latitude,
            c.longitude,
            c.altitude
        FROM map_intersection mi
        LEFT JOIN map_location ml ON mi.name = ml.name
        LEFT JOIN survey_location sl ON ml._location_survey = sl._OID_
        LEFT JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
        LEFT JOIN coordinate c ON c._OID_ = slsxyz._coordinate
        WHERE c.latitude IS NOT NULL 
            AND c.longitude IS NOT NULL
            AND c.latitude BETWEEN -60 AND -20
            AND c.longitude BETWEEN 100 AND 160
        ORDER BY mi.name, c._OID_
        """
        
        cursor.execute(query2)
        results = cursor.fetchall()
        
        if not results:
            logger.warning("No intersection coordinates found via survey_location. Trying alternative method...")
            # Try checking if intersections are already in locations table
            return None
        
        logger.info(f"Extracted {len(results)} intersection coordinate points from MySQL")
        return results
        
    except Error as e:
        logger.error(f"Error extracting intersections from MySQL: {e}")
        raise
    finally:
        cursor.close()
        mysql_conn.close()

def check_intersections_in_postgres() -> List[Dict]:
    """Check if intersections are already in PostgreSQL locations table"""
    conn = get_postgres_connection()
    cursor = conn.cursor()
    
    try:
        query = """
        SELECT 
            location_name,
            category,
            latitude,
            longitude,
            altitude,
            geometry_point
        FROM locations
        WHERE category = 'intersection'
            OR location_name ~ '^[A-Z]\\d+'
            OR location_name ILIKE '%intersection%'
        ORDER BY location_name
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        # Convert to dict format
        intersections = []
        for row in cursor.fetchall():
            intersections.append({
                'location_name': row[0],
                'category': row[1],
                'latitude': row[2],
                'longitude': row[3],
                'altitude': row[4],
                'geometry_point': row[5]
            })
        
        logger.info(f"Found {len(intersections)} intersections in PostgreSQL locations table")
        return intersections
        
    except Exception as e:
        logger.error(f"Error checking intersections in PostgreSQL: {e}")
        return []
    finally:
        cursor.close()
        conn.close()

def create_consolidated_intersections_table():
    """Create consolidated_intersections table if it doesn't exist"""
    conn = get_postgres_connection()
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consolidated_intersections (
                id SERIAL PRIMARY KEY,
                intersection_name TEXT NOT NULL,
                category TEXT DEFAULT 'intersection',
                total_points INTEGER,
                center_latitude DOUBLE PRECISION,
                center_longitude DOUBLE PRECISION,
                avg_altitude DOUBLE PRECISION,
                center_point GEOMETRY(POINT, 4326),
                intersection_polygon GEOMETRY(POLYGON, 4326),
                intersection_boundary GEOMETRY(LINESTRING, 4326),
                area_sqm DOUBLE PRECISION,
                first_recorded TIMESTAMP,
                last_recorded TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_name 
            ON consolidated_intersections (intersection_name)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_category 
            ON consolidated_intersections (category)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_polygon 
            ON consolidated_intersections USING GIST (intersection_polygon)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_center 
            ON consolidated_intersections USING GIST (center_point)
        """)
        
        logger.info("Created consolidated_intersections table and indexes")
        
    except Exception as e:
        logger.error(f"Error creating table: {e}")
        raise
    finally:
        cursor.close()
        conn.close()

def consolidate_intersections_from_postgres():
    """Consolidate intersections from PostgreSQL locations table"""
    conn = get_postgres_connection()
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        # Delete existing intersections to avoid duplicates
        cursor.execute("DELETE FROM consolidated_intersections")
        logger.info("Cleared existing consolidated intersections")
        
        # Insert consolidated intersections
        cursor.execute("""
            INSERT INTO consolidated_intersections (
                intersection_name,
                category,
                total_points,
                center_latitude,
                center_longitude,
                avg_altitude,
                center_point,
                intersection_polygon,
                intersection_boundary,
                area_sqm,
                first_recorded,
                last_recorded
            )
            SELECT 
                -- Extract intersection identifier (e.g., "I9" from "I9" or "I9_point1")
                CASE 
                    WHEN location_name ~ '^[A-Z]\\d+' THEN 
                        SUBSTRING(location_name FROM '^([A-Z]\\d+)')
                    ELSE 
                        location_name
                END as intersection_name,
                COALESCE(category, 'intersection') as category,
                count(*) as total_points,
                avg(latitude) as center_latitude,
                avg(longitude) as center_longitude,
                avg(altitude) as avg_altitude,
                ST_Centroid(ST_Collect(geometry_point)) as center_point,
                ST_ConvexHull(ST_Collect(geometry_point)) as intersection_polygon,
                ST_ExteriorRing(ST_ConvexHull(ST_Collect(geometry_point))) as intersection_boundary,
                ST_Area(ST_ConvexHull(ST_Collect(geometry_point))::geography) as area_sqm,
                min(created_at) as first_recorded,
                max(created_at) as last_recorded
            FROM locations 
            WHERE (category = 'intersection'
                OR location_name ~ '^[A-Z]\\d+'
                OR location_name ILIKE '%intersection%')
                AND geometry_point IS NOT NULL
                AND latitude IS NOT NULL
                AND longitude IS NOT NULL
            GROUP BY 
                CASE 
                    WHEN location_name ~ '^[A-Z]\\d+' THEN 
                        SUBSTRING(location_name FROM '^([A-Z]\\d+)')
                    ELSE 
                        location_name
                END,
                COALESCE(category, 'intersection')
        """)
        
        count = cursor.rowcount
        logger.info(f"✅ Consolidated {count} intersections into consolidated_intersections table")
        
        # Show summary
        cursor.execute("""
            SELECT 
                count(*) as total_intersections,
                sum(total_points) as total_points,
                avg(total_points) as avg_points,
                sum(area_sqm) as total_area_sqm
            FROM consolidated_intersections
        """)
        result = cursor.fetchone()
        logger.info(f"Summary: {result[0]} intersections, {result[1]} total points, {result[2]:.1f} avg points, {result[3]:.0f} sqm total area")
        
    except Exception as e:
        logger.error(f"Error consolidating intersections: {e}")
        raise
    finally:
        cursor.close()
        conn.close()

def main():
    """Main import function"""
    logger.info("🚀 Starting intersection import...")
    
    try:
        # Step 1: Create table
        logger.info("Step 1: Creating consolidated_intersections table...")
        create_consolidated_intersections_table()
        
        # Step 2: Try to extract from MySQL
        logger.info("Step 2: Checking for intersections in MySQL...")
        mysql_intersections = extract_intersections_from_mysql()
        
        # Step 3: Consolidate from PostgreSQL locations table (if they exist there)
        logger.info("Step 3: Consolidating intersections from PostgreSQL locations table...")
        consolidate_intersections_from_postgres()
        
        logger.info("✅ Intersection import completed!")
        
    except Exception as e:
        logger.error(f"❌ Import failed: {e}")
        raise

if __name__ == '__main__':
    main()

