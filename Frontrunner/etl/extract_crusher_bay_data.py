#!/usr/bin/env python3
"""
Extract Crusher and Bay Location Data from MySQL and Add to Consolidated Table
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

def extract_pit_bay_locations():
    """Extract pit bay locations with coordinates"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    locations = []
    
    try:
        # Get pit bay data - these have pos_x, pos_y coordinates
        mysql_cursor.execute("SELECT * FROM pit_bay")
        bay_rows = mysql_cursor.fetchall()
        
        logger.info(f"Found {len(bay_rows)} pit bay records")
        
        for row in bay_rows:
            if row['pos_x'] and row['pos_y']:
                # Convert local coordinates to approximate lat/lon
                # These appear to be local mine coordinates, we'll use them as-is for now
                x_coord = float(row['pos_x'])
                y_coord = float(row['pos_y'])
                
                # For mining coordinates, we'll create approximate lat/lon
                # This is a rough conversion - you may need to adjust based on your coordinate system
                latitude = -23.0 + (y_coord / 1000000.0)  # Rough conversion
                longitude = 119.0 + (x_coord / 1000000.0)  # Rough conversion
                
                locations.append({
                    'source_id': row['_OID_'],
                    'location_name': f"Bay_{row['name']}",
                    'latitude': latitude,
                    'longitude': longitude,
                    'x_coord': x_coord,
                    'y_coord': y_coord,
                    'category': 'bay',
                    'raw_data': row
                })
                
    except Exception as e:
        logger.error(f"Error extracting pit bay data: {e}")
    
    mysql_conn.close()
    return locations

def extract_crusher_locations():
    """Extract crusher locations by joining with location_info"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    locations = []
    
    try:
        # Get crusher bay info and try to find coordinates
        mysql_cursor.execute("""
            SELECT cb.*, pb.pos_x, pb.pos_y, pb.name as bay_name
            FROM crusher_bay_info cb
            LEFT JOIN pit_bay pb ON cb._bay = pb._OID_
        """)
        
        crusher_rows = mysql_cursor.fetchall()
        logger.info(f"Found {len(crusher_rows)} crusher bay info records")
        
        for row in crusher_rows:
            if row['pos_x'] and row['pos_y']:
                x_coord = float(row['pos_x'])
                y_coord = float(row['pos_y'])
                
                # Convert to approximate lat/lon
                latitude = -23.0 + (y_coord / 1000000.0)
                longitude = 119.0 + (x_coord / 1000000.0)
                
                locations.append({
                    'source_id': row['_OID_'],
                    'location_name': f"Crusher_{row['bay_name'] or 'Unknown'}",
                    'latitude': latitude,
                    'longitude': longitude,
                    'x_coord': x_coord,
                    'y_coord': y_coord,
                    'category': 'crusher',
                    'raw_data': row
                })
        
        # Also get crusher locations from pit_loc__crush_dump_prf
        mysql_cursor.execute("SELECT * FROM pit_loc__crush_dump_prf")
        crush_prf_rows = mysql_cursor.fetchall()
        
        logger.info(f"Found {len(crush_prf_rows)} crusher profile records")
        
        for row in crush_prf_rows:
            # These don't have coordinates directly, but we can create entries
            locations.append({
                'source_id': row['_OID_'],
                'location_name': f"Crusher_Location_{row['_OID_']}",
                'latitude': None,  # No coordinates available
                'longitude': None,
                'x_coord': None,
                'y_coord': None,
                'category': 'crusher',
                'raw_data': row
            })
                
    except Exception as e:
        logger.error(f"Error extracting crusher data: {e}")
    
    mysql_conn.close()
    return locations

def search_for_fuel_locations():
    """Search for any fuel-related data in the database"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    locations = []
    
    try:
        # Search in dump_node for fuel-related names
        mysql_cursor.execute("""
            SELECT * FROM dump_node 
            WHERE node_name LIKE '%fuel%' 
               OR node_name LIKE '%gas%' 
               OR node_name LIKE '%service%'
               OR node_name LIKE '%refuel%'
            LIMIT 100
        """)
        
        fuel_nodes = mysql_cursor.fetchall()
        logger.info(f"Found {len(fuel_nodes)} potential fuel locations in dump_node")
        
        for row in fuel_nodes:
            if row.get('latitude') and row.get('longitude'):
                locations.append({
                    'source_id': row['_OID_'],
                    'location_name': f"Fuel_{row['node_name']}",
                    'latitude': float(row['latitude']),
                    'longitude': float(row['longitude']),
                    'x_coord': row.get('x_coord'),
                    'y_coord': row.get('y_coord'),
                    'category': 'fuel',
                    'raw_data': row
                })
        
        # Search in coordinate table for fuel-related entries
        mysql_cursor.execute("""
            SELECT c.*, 'coordinate_fuel' as source_table
            FROM coordinate c
            WHERE c._OID_ IN (
                SELECT DISTINCT _coordinate 
                FROM dump_node 
                WHERE node_name LIKE '%fuel%' 
                   OR node_name LIKE '%gas%' 
                   OR node_name LIKE '%service%'
            )
            LIMIT 50
        """)
        
        coord_fuel = mysql_cursor.fetchall()
        logger.info(f"Found {len(coord_fuel)} fuel coordinates")
        
        for row in coord_fuel:
            if row.get('latitude') and row.get('longitude'):
                locations.append({
                    'source_id': row['_OID_'],
                    'location_name': f"Fuel_Coordinate_{row['_OID_']}",
                    'latitude': float(row['latitude']),
                    'longitude': float(row['longitude']),
                    'x_coord': row.get('coord_x'),
                    'y_coord': row.get('coord_y'),
                    'category': 'fuel',
                    'raw_data': row
                })
                
    except Exception as e:
        logger.error(f"Error searching for fuel locations: {e}")
    
    mysql_conn.close()
    return locations

def search_for_parking_locations():
    """Search for parking-related data"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    locations = []
    
    try:
        # Search in dump_node for parking-related names
        mysql_cursor.execute("""
            SELECT * FROM dump_node 
            WHERE node_name LIKE '%park%' 
               OR node_name LIKE '%lot%'
               OR node_name LIKE '%stand%'
            LIMIT 100
        """)
        
        parking_nodes = mysql_cursor.fetchall()
        logger.info(f"Found {len(parking_nodes)} potential parking locations")
        
        for row in parking_nodes:
            if row.get('latitude') and row.get('longitude'):
                locations.append({
                    'source_id': row['_OID_'],
                    'location_name': f"Parking_{row['node_name']}",
                    'latitude': float(row['latitude']),
                    'longitude': float(row['longitude']),
                    'x_coord': row.get('x_coord'),
                    'y_coord': row.get('y_coord'),
                    'category': 'parking',
                    'raw_data': row
                })
                
    except Exception as e:
        logger.error(f"Error searching for parking locations: {e}")
    
    mysql_conn.close()
    return locations

def add_locations_to_consolidated(locations, category):
    """Add locations to consolidated table"""
    if not locations:
        logger.info(f"No {category} locations found")
        return 0
    
    logger.info(f"Processing {len(locations)} {category} locations...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    added_count = 0
    
    for loc in locations:
        try:
            if not loc['latitude'] or not loc['longitude']:
                logger.info(f"Skipping {loc['location_name']} - no coordinates")
                continue
            
            # Create geometry from point
            cursor.execute("""
                INSERT INTO consolidated_locations (
                    location_name, total_points, center_latitude, center_longitude,
                    center_point, location_polygon, location_boundary, area_sqm,
                    all_dump_node_ids, category
                ) VALUES (%s, %s, %s, %s, 
                         ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                         ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 25)::geometry,
                         ST_ExteriorRing(ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 25)::geometry),
                         ST_Area(ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 25)),
                         %s, %s)
            """, (
                loc['location_name'], 1, loc['latitude'], loc['longitude'],
                loc['longitude'], loc['latitude'], 
                loc['longitude'], loc['latitude'], 
                loc['longitude'], loc['latitude'], 
                loc['longitude'], loc['latitude'],
                [loc['source_id']], category
            ))
            
            added_count += 1
            logger.info(f"Added {loc['location_name']}")
            
        except Exception as e:
            logger.warning(f"Failed to add {loc['location_name']}: {e}")
            continue
    
    conn.close()
    return added_count

def show_results():
    """Show final results"""
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("""
        SELECT 
            category,
            count(*) as locations,
            sum(total_points) as total_points
        FROM consolidated_locations 
        WHERE category IN ('crusher', 'bay', 'fuel', 'parking')
        GROUP BY category
        ORDER BY count(*) DESC
    """)
    
    results = cursor.fetchall()
    
    print("\n=== CRUSHER, BAY, FUEL, PARKING LOCATIONS ===")
    print(f"{'Category':<12} {'Locations':<10} {'Points':<8}")
    print("-" * 35)
    
    for row in results:
        print(f"{row['category']:<12} {row['locations']:<10} {row['total_points']:<8}")
    
    # Show specific examples
    cursor.execute("""
        SELECT location_name, category, center_latitude, center_longitude
        FROM consolidated_locations 
        WHERE category IN ('crusher', 'bay', 'fuel', 'parking')
        ORDER BY category, location_name
    """)
    
    examples = cursor.fetchall()
    
    if examples:
        print("\n=== SPECIFIC LOCATIONS ===")
        for row in examples:
            print(f"{row['category']}: {row['location_name']} ({row['center_latitude']:.6f}, {row['center_longitude']:.6f})")
    
    conn.close()

def main():
    """Main function"""
    logger.info("=== Extracting Crusher, Bay, Fuel, and Parking Locations ===")
    
    try:
        wait_for_databases()
        
        total_added = 0
        
        # Extract bay locations
        bay_locations = extract_pit_bay_locations()
        added = add_locations_to_consolidated(bay_locations, 'bay')
        total_added += added
        logger.info(f"Added {added} bay locations")
        
        # Extract crusher locations
        crusher_locations = extract_crusher_locations()
        added = add_locations_to_consolidated(crusher_locations, 'crusher')
        total_added += added
        logger.info(f"Added {added} crusher locations")
        
        # Search for fuel locations
        fuel_locations = search_for_fuel_locations()
        added = add_locations_to_consolidated(fuel_locations, 'fuel')
        total_added += added
        logger.info(f"Added {added} fuel locations")
        
        # Search for parking locations
        parking_locations = search_for_parking_locations()
        added = add_locations_to_consolidated(parking_locations, 'parking')
        total_added += added
        logger.info(f"Added {added} parking locations")
        
        # Show results
        show_results()
        
        logger.info(f"\n=== Complete: Added {total_added} new locations ===")
        return True
        
    except Exception as e:
        logger.error(f"Failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)