#!/usr/bin/env python3
"""
Add Crusher, Fuel, and Parking Locations to Consolidated Table
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

def get_fuel_locations():
    """Get fuel locations from MySQL"""
    logger.info("Extracting fuel locations...")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    # Look for fuel-related tables and data
    mysql_cursor.execute("SHOW TABLES LIKE '%fuel%'")
    fuel_tables = [table[f'Tables_in_{MYSQL_CONFIG["database"]} (%fuel%)'] for table in mysql_cursor.fetchall()]
    
    logger.info(f"Found fuel tables: {fuel_tables}")
    
    fuel_locations = []
    
    # Check each fuel table for coordinate data
    for table in fuel_tables:
        try:
            mysql_cursor.execute(f"DESCRIBE `{table}`")
            columns = [col['Field'] for col in mysql_cursor.fetchall()]
            
            # Check if table has coordinate columns
            has_coords = any(col in ['latitude', 'longitude', 'coord_x', 'coord_y'] for col in columns)
            
            if has_coords:
                mysql_cursor.execute(f"SELECT * FROM `{table}` WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1000")
                rows = mysql_cursor.fetchall()
                
                for row in rows:
                    fuel_locations.append({
                        'source_table': table,
                        'source_id': str(row.get('_OID_', row.get('id', 'unknown'))),
                        'latitude': row.get('latitude'),
                        'longitude': row.get('longitude'),
                        'category': 'fuel'
                    })
        except Exception as e:
            logger.debug(f"Error processing fuel table {table}: {e}")
            continue
    
    mysql_conn.close()
    return fuel_locations

def get_crusher_locations():
    """Get crusher locations from MySQL"""
    logger.info("Extracting crusher locations...")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    # Look for crusher-related tables
    mysql_cursor.execute("SHOW TABLES")
    all_tables = [table[f'Tables_in_{MYSQL_CONFIG["database"]}'] for table in mysql_cursor.fetchall()]
    
    crusher_tables = [t for t in all_tables if 'crush' in t.lower() or 'mill' in t.lower()]
    logger.info(f"Found crusher tables: {crusher_tables}")
    
    crusher_locations = []
    
    # Check each crusher table for coordinate data
    for table in crusher_tables:
        try:
            mysql_cursor.execute(f"DESCRIBE `{table}`")
            columns = [col['Field'] for col in mysql_cursor.fetchall()]
            
            # Check if table has coordinate columns
            has_coords = any(col in ['latitude', 'longitude', 'coord_x', 'coord_y'] for col in columns)
            
            if has_coords:
                mysql_cursor.execute(f"SELECT * FROM `{table}` WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1000")
                rows = mysql_cursor.fetchall()
                
                for row in rows:
                    crusher_locations.append({
                        'source_table': table,
                        'source_id': str(row.get('_OID_', row.get('id', 'unknown'))),
                        'latitude': row.get('latitude'),
                        'longitude': row.get('longitude'),
                        'category': 'crusher'
                    })
        except Exception as e:
            logger.debug(f"Error processing crusher table {table}: {e}")
            continue
    
    mysql_conn.close()
    return crusher_locations

def get_parking_locations():
    """Get parking locations from MySQL"""
    logger.info("Extracting parking locations...")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    # Look for parking-related tables
    mysql_cursor.execute("SHOW TABLES")
    all_tables = [table[f'Tables_in_{MYSQL_CONFIG["database"]}'] for table in mysql_cursor.fetchall()]
    
    parking_tables = [t for t in all_tables if 'park' in t.lower()]
    logger.info(f"Found parking tables: {parking_tables}")
    
    parking_locations = []
    
    # Check each parking table for coordinate data
    for table in parking_tables:
        try:
            mysql_cursor.execute(f"DESCRIBE `{table}`")
            columns = [col['Field'] for col in mysql_cursor.fetchall()]
            
            # Check if table has coordinate columns
            has_coords = any(col in ['latitude', 'longitude', 'coord_x', 'coord_y'] for col in columns)
            
            if has_coords:
                mysql_cursor.execute(f"SELECT * FROM `{table}` WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 1000")
                rows = mysql_cursor.fetchall()
                
                for row in rows:
                    parking_locations.append({
                        'source_table': table,
                        'source_id': str(row.get('_OID_', row.get('id', 'unknown'))),
                        'latitude': row.get('latitude'),
                        'longitude': row.get('longitude'),
                        'category': 'parking'
                    })
        except Exception as e:
            logger.debug(f"Error processing parking table {table}: {e}")
            continue
    
    mysql_conn.close()
    return parking_locations

def add_locations_to_consolidated(locations, category):
    """Add locations to consolidated table"""
    if not locations:
        logger.info(f"No {category} locations found")
        return 0
    
    logger.info(f"Adding {len(locations)} {category} locations to consolidated table...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Group locations by source table (since we don't have specific location names)
    location_groups = {}
    for loc in locations:
        key = f"{category}_{loc['source_table']}"
        if key not in location_groups:
            location_groups[key] = []
        location_groups[key].append(loc)
    
    added_count = 0
    
    for location_name, points in location_groups.items():
        if len(points) < 1:
            continue
        
        try:
            # Calculate consolidated data
            lats = [p['latitude'] for p in points]
            lons = [p['longitude'] for p in points]
            
            # Insert consolidated location
            cursor.execute("""
                INSERT INTO consolidated_locations (
                    location_name, total_points, center_latitude, center_longitude,
                    center_point, location_polygon, location_boundary, area_sqm,
                    all_dump_node_ids, category
                ) VALUES (%s, %s, %s, %s, 
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         ST_ConvexHull(ST_Collect(ARRAY(SELECT ST_MakePoint(unnest(%s::float[]), unnest(%s::float[]))))),
                         ST_ExteriorRing(ST_ConvexHull(ST_Collect(ARRAY(SELECT ST_MakePoint(unnest(%s::float[]), unnest(%s::float[])))))),
                         ST_Area(ST_ConvexHull(ST_Collect(ARRAY(SELECT ST_MakePoint(unnest(%s::float[]), unnest(%s::float[])))))::geography),
                         %s, %s)
            """, (
                location_name, len(points), 
                sum(lats) / len(lats), sum(lons) / len(lons),
                sum(lons) / len(lons), sum(lats) / len(lats),
                lons, lats, lons, lats, lons, lats,
                [p['source_id'] for p in points], category
            ))
            
            added_count += 1
            logger.info(f"Added {location_name}: {len(points)} points")
            
        except Exception as e:
            logger.warning(f"Failed to add {location_name}: {e}")
            continue
    
    conn.close()
    return added_count

def show_final_results():
    """Show final consolidated results"""
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Show summary by category
    cursor.execute("""
        SELECT 
            category,
            count(*) as unique_locations,
            sum(total_points) as total_points,
            avg(total_points) as avg_points_per_location,
            sum(area_sqm) as total_area_sqm
        FROM consolidated_locations 
        GROUP BY category
        ORDER BY sum(total_points) DESC
    """)
    
    results = cursor.fetchall()
    
    print("\n=== FINAL CONSOLIDATED LOCATIONS BY CATEGORY ===")
    print(f"{'Category':<12} {'Locations':<10} {'Points':<8} {'Avg Points':<12} {'Total Area (sqm)':<15}")
    print("-" * 70)
    
    for row in results:
        area = int(row['total_area_sqm']) if row['total_area_sqm'] else 0
        avg_points = round(float(row['avg_points_per_location']), 1) if row['avg_points_per_location'] else 0
        print(f"{row['category']:<12} {row['unique_locations']:<10} {row['total_points']:<8} {avg_points:<12} {area:<15,}")
    
    conn.close()

def main():
    """Main function"""
    logger.info("=== Adding Crusher, Fuel, and Parking Locations ===")
    
    try:
        wait_for_databases()
        
        # Get locations from MySQL
        fuel_locations = get_fuel_locations()
        crusher_locations = get_crusher_locations()
        parking_locations = get_parking_locations()
        
        # Add to consolidated table
        fuel_added = add_locations_to_consolidated(fuel_locations, 'fuel')
        crusher_added = add_locations_to_consolidated(crusher_locations, 'crusher')
        parking_added = add_locations_to_consolidated(parking_locations, 'parking')
        
        logger.info(f"Added {fuel_added} fuel, {crusher_added} crusher, {parking_added} parking locations")
        
        # Show results
        show_final_results()
        
        logger.info("=== Complete ===")
        return True
        
    except Exception as e:
        logger.error(f"Failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)