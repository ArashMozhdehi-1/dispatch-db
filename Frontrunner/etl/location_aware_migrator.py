#!/usr/bin/env python3
"""
Location-Aware Migration
Migrates MySQL data with proper location names from tip_area table
"""

import os
import sys
import time
import logging
import mysql.connector
import psycopg2
from psycopg2.extras import RealDictCursor

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database Configuration
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'kmtsuser'),
    'password': os.getenv('MYSQL_PASSWORD', 'kmtspass'),
    'database': os.getenv('MYSQL_DATABASE', 'kmtsdb'),
    'charset': 'utf8mb4'
}

POSTGRES_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'user': os.getenv('POSTGRES_USER', 'infra_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'infra_password'),
    'database': os.getenv('POSTGRES_DATABASE', 'infrastructure_db')
}

def wait_for_databases():
    """Wait for both databases to be available"""
    logger.info("Waiting for databases...")
    
    # Wait for MySQL
    for i in range(60):
        try:
            conn = mysql.connector.connect(**MYSQL_CONFIG)
            conn.close()
            logger.info("MySQL is ready")
            break
        except:
            time.sleep(1)
    
    # Wait for PostgreSQL
    for i in range(60):
        try:
            conn = psycopg2.connect(**POSTGRES_CONFIG)
            conn.close()
            logger.info("PostgreSQL is ready")
            break
        except:
            time.sleep(1)

def setup_postgres():
    """Setup PostgreSQL with PostGIS"""
    logger.info("Setting up PostgreSQL...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Clean and setup
    cursor.execute("DROP SCHEMA IF EXISTS public CASCADE;")
    cursor.execute("CREATE SCHEMA public;")
    cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    
    conn.close()
    logger.info("PostgreSQL setup complete")

def create_pit_locations_table():
    """Create pit locations table with proper location names"""
    logger.info("Creating pit locations table...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Create pit_locations table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pit_locations (
            id SERIAL PRIMARY KEY,
            dump_node_id TEXT,
            tip_area_id TEXT,
            location_name TEXT,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            altitude DOUBLE PRECISION,
            x_coord BIGINT,
            y_coord BIGINT,
            z_coord BIGINT,
            heading BIGINT,
            inclination BIGINT,
            status_code BIGINT,
            geometry_point GEOMETRY(POINT, 4326),
            geometry_polyline GEOMETRY(LINESTRING, 4326),
            geometry_polygon GEOMETRY(POLYGON, 4326),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create spatial indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pit_locations_point ON pit_locations USING GIST (geometry_point);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pit_locations_polyline ON pit_locations USING GIST (geometry_polyline);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pit_locations_polygon ON pit_locations USING GIST (geometry_polygon);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pit_locations_name ON pit_locations (location_name);")
    
    conn.close()
    logger.info("Pit locations table created")

def extract_pit_data_with_locations():
    """Extract pit data from MySQL with proper location names"""
    logger.info("Extracting pit data with location names...")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_conn.autocommit = True
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    postgres_cursor = postgres_conn.cursor()
    
    # Get dump_node data with tip_area location names
    query = """
    SELECT 
        dn._OID_ as dump_node_id,
        dn._tip_area as tip_area_id,
        ta._location as location_name,
        dn.latitude,
        dn.longitude,
        dn.altitude,
        dn.coord_x,
        dn.coord_y,
        dn.coord_z,
        dn.coord_heading,
        dn.coord_incl,
        dn.coord_status
    FROM dump_node dn
    LEFT JOIN tip_area ta ON dn._tip_area = ta._OID_
    WHERE dn.latitude IS NOT NULL 
    AND dn.longitude IS NOT NULL
    AND ta._location IS NOT NULL
    """
    
    mysql_cursor.execute(query)
    rows = mysql_cursor.fetchall()
    
    logger.info(f"Found {len(rows)} pit locations with location names")
    
    location_count = 0
    
    for row in rows:
        try:
            # Insert into pit_locations table
            postgres_cursor.execute("""
                INSERT INTO pit_locations (
                    dump_node_id, tip_area_id, location_name,
                    latitude, longitude, altitude,
                    x_coord, y_coord, z_coord,
                    heading, inclination, status_code,
                    geometry_point
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            """, (
                row['dump_node_id'], row['tip_area_id'], row['location_name'],
                row['latitude'], row['longitude'], row['altitude'],
                row['coord_x'], row['coord_y'], row['coord_z'],
                row['coord_heading'], row['coord_incl'], row['coord_status'],
                row['longitude'], row['latitude']
            ))
            
            location_count += 1
            
        except Exception as e:
            logger.debug(f"Failed to process row: {e}")
            continue
    
    mysql_conn.close()
    postgres_conn.close()
    
    logger.info(f"Extracted {location_count} pit locations")
    return location_count

def create_location_polygons():
    """Create polygons for each location name (M13, M14, etc.)"""
    logger.info("Creating polygons for each location...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get locations grouped by name
    cursor.execute("""
        SELECT location_name, 
               count(*) as point_count,
               array_agg(longitude ORDER BY id) as lons,
               array_agg(latitude ORDER BY id) as lats,
               array_agg(id ORDER BY id) as location_ids
        FROM pit_locations 
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
        GROUP BY location_name
        HAVING count(*) >= 3
        ORDER BY count(*) DESC
    """)
    
    location_groups = cursor.fetchall()
    logger.info(f"Found {len(location_groups)} location groups")
    
    polygon_count = 0
    
    for group in location_groups:
        try:
            lons = group['lons']
            lats = group['lats']
            location_ids = group['location_ids']
            location_name = group['location_name']
            
            logger.info(f"Creating polygon for {location_name}: {len(lons)} points")
            
            # Create convex hull polygon for this location
            cursor.execute("""
                SELECT ST_AsText(ST_ConvexHull(ST_Collect(
                    ARRAY(SELECT ST_MakePoint(unnest(%s::float[]), unnest(%s::float[]))
                ))))
            """, (lons, lats))
            
            polygon_result = cursor.fetchone()
            if polygon_result and polygon_result[0]:
                polygon_wkt = polygon_result[0]
                
                # Create linestring connecting the boundary points
                points_wkt = ', '.join([f"{lon} {lat}" for lon, lat in zip(lons, lats)])
                linestring_wkt = f"LINESTRING({points_wkt})"
                
                # Update all locations in this group with the polygon
                cursor.execute("""
                    UPDATE pit_locations 
                    SET geometry_polygon = ST_GeomFromText(%s, 4326),
                        geometry_polyline = ST_GeomFromText(%s, 4326)
                    WHERE id = ANY(%s)
                """, (polygon_wkt, linestring_wkt, location_ids))
                
                polygon_count += cursor.rowcount
                logger.info(f"Created polygon for {location_name}")
            
        except Exception as e:
            logger.warning(f"Failed to create polygon for {group['location_name']}: {e}")
            continue
    
    # Create individual buffers for locations with fewer than 3 points
    cursor.execute("""
        UPDATE pit_locations 
        SET geometry_polygon = ST_Buffer(ST_MakePoint(longitude, latitude)::geography, 25)::geometry,
            geometry_polyline = ST_ExteriorRing(ST_Buffer(ST_MakePoint(longitude, latitude)::geography, 25)::geometry)
        WHERE longitude IS NOT NULL 
        AND latitude IS NOT NULL
        AND geometry_polygon IS NULL
    """)
    
    individual_count = cursor.rowcount
    
    conn.close()
    logger.info(f"Created {polygon_count} location polygons and {individual_count} individual buffers")
    
    return polygon_count

def show_results():
    """Show the results"""
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Show summary by location
    cursor.execute("""
        SELECT location_name, 
               count(*) as total_points,
               count(geometry_polygon) as with_polygons,
               ST_Area(ST_ConvexHull(ST_Collect(geometry_polygon))::geography) as area_sqm
        FROM pit_locations 
        WHERE geometry_polygon IS NOT NULL
        GROUP BY location_name 
        ORDER BY total_points DESC
        LIMIT 15
    """)
    
    results = cursor.fetchall()
    
    print("\n=== PIT LOCATION POLYGONS ===")
    print(f"{'Location':<12} {'Points':<8} {'Polygons':<8} {'Area (sqm)':<12}")
    print("-" * 45)
    
    for row in results:
        area = int(row['area_sqm']) if row['area_sqm'] else 0
        print(f"{row['location_name']:<12} {row['total_points']:<8} {row['with_polygons']:<8} {area:<12,}")
    
    # Check for M13 specifically
    cursor.execute("""
        SELECT location_name, count(*), ST_AsText(ST_ConvexHull(ST_Collect(geometry_polygon))) as polygon
        FROM pit_locations 
        WHERE location_name = 'M13' AND geometry_polygon IS NOT NULL
        GROUP BY location_name
    """)
    
    m13_result = cursor.fetchone()
    if m13_result:
        print(f"\n=== M13 POLYGON ===")
        print(f"Points: {m13_result['count']}")
        print(f"Polygon: {m13_result['polygon'][:100]}...")
    
    conn.close()

def main():
    """Main migration function"""
    logger.info("=== Location-Aware Pit Migration ===")
    
    try:
        # Setup
        wait_for_databases()
        setup_postgres()
        create_pit_locations_table()
        
        # Extract and process data
        location_count = extract_pit_data_with_locations()
        
        if location_count > 0:
            polygon_count = create_location_polygons()
            show_results()
        
        logger.info("=== Migration Complete ===")
        logger.info(f"Total pit locations processed: {location_count}")
        logger.info("Connect to PostgreSQL and query the 'pit_locations' table!")
        logger.info("Example queries:")
        logger.info("  SELECT * FROM pit_locations WHERE location_name = 'M13';")
        logger.info("  SELECT location_name, count(*) FROM pit_locations GROUP BY location_name;")
        
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)