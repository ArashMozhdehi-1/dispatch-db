#!/usr/bin/env python3
"""
Extract Parking & Tiedown, Fuel & Service, and Crusher Operations from MySQL
Based on the categorization logic from grouped-locations.js API
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

def categorize_location(location_name, location_type):
    """Categorize locations based on the logic from grouped-locations.js"""
    if location_type == 'dump_node':
        return 'Dump Areas'
    if location_type == 'travel_destination':
        return 'Travel Routes'
    
    name = location_name.upper() if location_name else ''
    
    # Crusher-related locations
    if 'CRUSH' in name or name in ['C2', 'C3']:
        return 'Crusher Operations'
    
    # Intersection locations
    if location_type == 'pit_loc_intersection' or 'INTERSECTION' in name:
        return 'Road Intersections'
    
    # Fuel and service areas
    if any(word in name for word in ['FUEL', 'SERVICE', 'REFUEL']):
        return 'Fuel & Service'
    
    # Gates (separate from access points)
    if 'GATE' in name:
        return 'Gates'
    
    # Access points (entry/exit without gates)
    if any(word in name for word in ['ENTRY', 'EXIT', 'ACCESS']):
        return 'Access Points'
    
    # Tiedown and parking bays
    if location_type == 'pit_loc_tiedown' or any(word in name for word in ['BAY', 'BYPASS', 'PARK']):
        return 'Parking & Tiedown'
    
    # Blast areas
    if any(word in name for word in ['BLAST', 'EXPLOSIVE']):
        return 'Blast Areas'
    
    # Workshop and maintenance
    if any(word in name for word in ['WORKSHOP', 'MAINT', 'REPAIR']):
        return 'Workshop & Maintenance'
    
    # Mixed and general pit locations
    if location_type == 'pit_loc_mixed' or name.replace('_', '').replace('-', '').isalnum():
        return 'Pit Locations'
    
    # General coordinates (not linked to specific locations)
    if location_type == 'coordinate':
        return 'General Survey Points'
    
    # Default fallback
    return 'Other Locations'

def extract_locations_from_mysql():
    """Extract all locations using the same queries as the API"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    all_locations = []
    
    try:
        # Query 1: Get coordinates grouped by pit location (same as API)
        logger.info("Extracting pit locations...")
        mysql_cursor.execute("""
            SELECT  
                pl.name as location_name,
                pl._CID_ as location_type,
                c._OID_ as coordinate_id,
                c.coord_x,
                c.coord_y, 
                c.coord_z,
                c.coord_heading,
                c.coord_incl,
                c.coord_status,
                c.latitude,
                c.longitude,
                c.altitude
            FROM pit_loc pl
            INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
            INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
            INNER JOIN coordinate c ON c._OID_ = slsxyz._coordinate
            WHERE c.latitude IS NOT NULL 
                AND c.longitude IS NOT NULL
                AND c.latitude BETWEEN -60 AND -20
                AND c.longitude BETWEEN 100 AND 160
            ORDER BY pl._CID_, pl.name, c._OID_
        """)
        
        pit_results = mysql_cursor.fetchall()
        logger.info(f"Found {len(pit_results)} pit location coordinates")
        
        for row in pit_results:
            all_locations.append({
                'coordinate_id': row['coordinate_id'],
                'location_name': row['location_name'],
                'location_type': row['location_type'],
                'latitude': float(row['latitude']),
                'longitude': float(row['longitude']),
                'altitude': float(row['altitude']) if row['altitude'] else None,
                'coord_x': row['coord_x'],
                'coord_y': row['coord_y'],
                'coord_z': row['coord_z'],
                'source': 'pit_loc'
            })
        
        # Query 2: Get dump nodes (same as API)
        logger.info("Extracting dump nodes...")
        mysql_cursor.execute("""
            SELECT 
                'dump_node' as location_type,
                'Dump Nodes' as location_name,
                dn._OID_ as coordinate_id,
                dn.coord_x,
                dn.coord_y,
                dn.coord_z,
                dn.coord_heading,
                dn.coord_incl,
                dn.coord_status,
                dn.latitude,
                dn.longitude,
                dn.altitude
            FROM dump_node dn
            WHERE dn.latitude IS NOT NULL 
                AND dn.longitude IS NOT NULL
                AND dn.latitude BETWEEN -60 AND -20
                AND dn.longitude BETWEEN 100 AND 160
            ORDER BY dn._OID_
        """)
        
        dump_results = mysql_cursor.fetchall()
        logger.info(f"Found {len(dump_results)} dump node coordinates")
        
        for row in dump_results:
            all_locations.append({
                'coordinate_id': row['coordinate_id'],
                'location_name': row['location_name'],
                'location_type': row['location_type'],
                'latitude': float(row['latitude']),
                'longitude': float(row['longitude']),
                'altitude': float(row['altitude']) if row['altitude'] else None,
                'coord_x': row['coord_x'],
                'coord_y': row['coord_y'],
                'coord_z': row['coord_z'],
                'source': 'dump_node'
            })
        
        # Query 3: Get travel destinations (same as API)
        logger.info("Extracting travel destinations...")
        mysql_cursor.execute("""
            SELECT 
                'travel_destination' as location_type,
                'Travel Destinations' as location_name,
                t._OID_ as coordinate_id,
                t.dest_x as coord_x,
                t.dest_y as coord_y,
                t.dest_z as coord_z,
                t.dest_heading as coord_heading,
                t.dest_incl as coord_incl,
                t.dest_status as coord_status,
                t.latitude,
                t.longitude,
                t.altitude
            FROM travel t
            WHERE t.latitude IS NOT NULL 
                AND t.longitude IS NOT NULL
                AND t.latitude BETWEEN -60 AND -20
                AND t.longitude BETWEEN 100 AND 160
                AND (t.dest_x != 0 OR t.dest_y != 0 OR t.dest_z != 0)
            ORDER BY t._OID_
        """)
        
        travel_results = mysql_cursor.fetchall()
        logger.info(f"Found {len(travel_results)} travel destination coordinates")
        
        for row in travel_results:
            all_locations.append({
                'coordinate_id': row['coordinate_id'],
                'location_name': row['location_name'],
                'location_type': row['location_type'],
                'latitude': float(row['latitude']),
                'longitude': float(row['longitude']),
                'altitude': float(row['altitude']) if row['altitude'] else None,
                'coord_x': row['coord_x'],
                'coord_y': row['coord_y'],
                'coord_z': row['coord_z'],
                'source': 'travel'
            })
        
        # Query 4: Get remaining coordinates (same as API)
        logger.info("Extracting general coordinates...")
        mysql_cursor.execute("""
            SELECT 
                'coordinate' as location_type,
                'General Coordinates' as location_name,
                c._OID_ as coordinate_id,
                c.coord_x,
                c.coord_y,
                c.coord_z,
                c.coord_heading,
                c.coord_incl,
                c.coord_status,
                c.latitude,
                c.longitude,
                c.altitude
            FROM coordinate c
            WHERE c.latitude IS NOT NULL 
                AND c.longitude IS NOT NULL
                AND c.latitude BETWEEN -60 AND -20
                AND c.longitude BETWEEN 100 AND 160
                AND c._OID_ NOT IN (
                    SELECT DISTINCT slsxyz._coordinate
                    FROM pit_loc pl
                    INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
                    INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
                    WHERE slsxyz._coordinate IS NOT NULL
                )
            ORDER BY c._OID_
        """)
        
        coord_results = mysql_cursor.fetchall()
        logger.info(f"Found {len(coord_results)} general coordinates")
        
        for row in coord_results:
            all_locations.append({
                'coordinate_id': row['coordinate_id'],
                'location_name': row['location_name'],
                'location_type': row['location_type'],
                'latitude': float(row['latitude']),
                'longitude': float(row['longitude']),
                'altitude': float(row['altitude']) if row['altitude'] else None,
                'coord_x': row['coord_x'],
                'coord_y': row['coord_y'],
                'coord_z': row['coord_z'],
                'source': 'coordinate'
            })
        
    except Exception as e:
        logger.error(f"Error extracting locations: {e}")
    
    mysql_conn.close()
    return all_locations

def group_and_filter_locations(all_locations):
    """Group locations by category and filter for target categories"""
    target_categories = ['Parking & Tiedown', 'Fuel & Service', 'Crusher Operations']
    
    grouped_data = {}
    
    for location in all_locations:
        category = categorize_location(location['location_name'], location['location_type'])
        
        if category in target_categories:
            if category not in grouped_data:
                grouped_data[category] = {
                    'category': category,
                    'coordinates': [],
                    'location_names': set()
                }
            
            grouped_data[category]['coordinates'].append(location)
            if location['location_name']:
                grouped_data[category]['location_names'].add(location['location_name'])
    
    # Convert sets to lists and add counts
    for category in grouped_data:
        grouped_data[category]['location_names'] = list(grouped_data[category]['location_names'])
        grouped_data[category]['total_points'] = len(grouped_data[category]['coordinates'])
        grouped_data[category]['unique_locations'] = len(grouped_data[category]['location_names'])
    
    return grouped_data

def add_category_to_consolidated(category_data, category_name):
    """Add a category's locations to consolidated table"""
    if not category_data['coordinates']:
        logger.info(f"No {category_name} locations found")
        return 0
    
    logger.info(f"Processing {category_name}: {category_data['total_points']} points, {category_data['unique_locations']} unique locations")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Group coordinates by location name
    location_groups = {}
    for coord in category_data['coordinates']:
        loc_name = coord['location_name']
        if loc_name not in location_groups:
            location_groups[loc_name] = []
        location_groups[loc_name].append(coord)
    
    added_count = 0
    
    for location_name, coordinates in location_groups.items():
        try:
            # Calculate center point and create geometry
            lats = [c['latitude'] for c in coordinates]
            lons = [c['longitude'] for c in coordinates]
            coord_ids = [str(c['coordinate_id']) for c in coordinates]
            
            center_lat = sum(lats) / len(lats)
            center_lon = sum(lons) / len(lons)
            
            if len(coordinates) == 1:
                # Single point - create small buffer
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
                    location_name, len(coordinates), center_lat, center_lon,
                    center_lon, center_lat, center_lon, center_lat, 
                    center_lon, center_lat, center_lon, center_lat,
                    coord_ids, category_name.lower().replace(' & ', '_').replace(' ', '_')
                ))
            else:
                # Multiple points - create convex hull
                points_wkt = ', '.join([f"{lon} {lat}" for lon, lat in zip(lons, lats)])
                
                cursor.execute("""
                    INSERT INTO consolidated_locations (
                        location_name, total_points, center_latitude, center_longitude,
                        center_point, location_polygon, location_boundary, area_sqm,
                        all_dump_node_ids, category
                    ) VALUES (%s, %s, %s, %s, 
                             ST_Centroid(ST_GeomFromText('MULTIPOINT(' || %s || ')', 4326)),
                             ST_ConvexHull(ST_GeomFromText('MULTIPOINT(' || %s || ')', 4326)),
                             ST_ExteriorRing(ST_ConvexHull(ST_GeomFromText('MULTIPOINT(' || %s || ')', 4326))),
                             ST_Area(ST_ConvexHull(ST_GeomFromText('MULTIPOINT(' || %s || ')', 4326))::geography),
                             %s, %s)
                """, (
                    location_name, len(coordinates), center_lat, center_lon,
                    points_wkt, points_wkt, points_wkt, points_wkt,
                    coord_ids, category_name.lower().replace(' & ', '_').replace(' ', '_')
                ))
            
            added_count += 1
            logger.info(f"Added {location_name}: {len(coordinates)} points")
            
        except Exception as e:
            logger.warning(f"Failed to add {location_name}: {e}")
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
            count(*) as unique_locations,
            sum(total_points) as total_points
        FROM consolidated_locations 
        GROUP BY category
        ORDER BY sum(total_points) DESC
    """)
    
    results = cursor.fetchall()
    
    print("\n=== CONSOLIDATED LOCATIONS BY CATEGORY ===")
    print(f"{'Category':<20} {'Locations':<10} {'Points':<8}")
    print("-" * 45)
    
    for row in results:
        print(f"{row['category']:<20} {row['unique_locations']:<10} {row['total_points']:<8}")
    
    # Show specific examples of new categories
    cursor.execute("""
        SELECT location_name, category, total_points
        FROM consolidated_locations 
        WHERE category IN ('parking_tiedown', 'fuel_service', 'crusher_operations')
        ORDER BY category, total_points DESC
        LIMIT 20
    """)
    
    examples = cursor.fetchall()
    
    if examples:
        print("\n=== NEW CATEGORY EXAMPLES ===")
        for row in examples:
            print(f"{row['category']}: {row['location_name']} ({row['total_points']} points)")
    
    conn.close()

def main():
    """Main function"""
    logger.info("=== Extracting Parking, Fuel & Service, and Crusher Operations ===")
    
    try:
        wait_for_databases()
        
        # Extract all locations using API queries
        all_locations = extract_locations_from_mysql()
        logger.info(f"Total locations extracted: {len(all_locations)}")
        
        # Group and filter for target categories
        grouped_data = group_and_filter_locations(all_locations)
        
        logger.info("Found categories:")
        for category, data in grouped_data.items():
            logger.info(f"  {category}: {data['total_points']} points, {data['unique_locations']} locations")
        
        total_added = 0
        
        # Add each category to consolidated table
        for category_name, category_data in grouped_data.items():
            added = add_category_to_consolidated(category_data, category_name)
            total_added += added
            logger.info(f"Added {added} {category_name} locations")
        
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