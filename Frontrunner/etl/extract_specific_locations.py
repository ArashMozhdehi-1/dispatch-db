#!/usr/bin/env python3
"""
Extract crusher, parking, fuel bay, and other location types from MySQL coordinate table
and add them to the consolidated_locations table in PostgreSQL
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

def extract_locations_by_keywords():
    """Extract locations from MySQL coordinate table based on keywords"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    # Define location categories and their keywords
    location_categories = {
        'crusher': ['crush', 'mill', 'grind', 'process'],
        'parking': ['park', 'lot', 'bay', 'stand'],
        'fuel': ['fuel', 'refuel', 'gas', 'diesel', 'station'],
        'maintenance': ['maint', 'repair', 'service', 'workshop'],
        'loading': ['load', 'tip', 'dump', 'unload'],
        'office': ['office', 'admin', 'control', 'dispatch']
    }
    
    all_locations = {}
    
    try:
        # Get all coordinate data with any kind of name or description
        mysql_cursor.execute("""
            SELECT 
                _OID_ as source_id,
                coord_x, coord_y, coord_z,
                latitude, longitude,
                name, description, label, tag,
                created_at, updated_at
            FROM coordinate 
            WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
            AND (name IS NOT NULL OR description IS NOT NULL OR label IS NOT NULL OR tag IS NOT NULL)
            LIMIT 10000
        """)
        
        coordinates = mysql_cursor.fetchall()
        logger.info(f"Found {len(coordinates)} coordinate records with names/descriptions")
        
        # Categorize coordinates based on keywords
        for coord in coordinates:
            # Combine all text fields for keyword matching
            text_fields = [
                coord.get('name', ''),
                coord.get('description', ''),
                coord.get('label', ''),
                coord.get('tag', '')
            ]
            combined_text = ' '.join([str(field) for field in text_fields if field]).lower()
            
            if not combined_text.strip():
                continue
            
            # Check which category this coordinate belongs to
            matched_category = None
            for category, keywords in location_categories.items():
                if any(keyword in combined_text for keyword in keywords):
                    matched_category = category
                    break
            
            # If no specific category found, categorize as 'other'
            if not matched_category:
                matched_category = 'other'
            
            # Create location name
            location_name = coord.get('name') or coord.get('label') or coord.get('description') or coord.get('tag')
            if not location_name:
                location_name = f"{matched_category}_{coord['source_id']}"
            
            # Group by location name within category
            key = f"{matched_category}_{location_name}"
            if key not in all_locations:
                all_locations[key] = {
                    'category': matched_category,
                    'location_name': str(location_name),
                    'points': []
                }
            
            all_locations[key]['points'].append({
                'source_id': str(coord['source_id']),
                'latitude': float(coord['latitude']),
                'longitude': float(coord['longitude']),
                'altitude': float(coord['coord_z']) if coord.get('coord_z') else None,
                'created_at': coord.get('created_at'),
                'updated_at': coord.get('updated_at')
            })
        
        # Also check survey_location table if it exists
        try:
            mysql_cursor.execute("SELECT COUNT(*) as count FROM survey_location")
            survey_count = mysql_cursor.fetchone()['count']
            
            if survey_count > 0:
                mysql_cursor.execute("""
                    SELECT 
                        sl._OID_ as source_id,
                        sl.name, sl.description,
                        c.latitude, c.longitude, c.coord_z,
                        sl.created_at, sl.updated_at
                    FROM survey_location sl
                    LEFT JOIN coordinate c ON sl._coordinate = c._OID_
                    WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
                    LIMIT 1000
                """)
                
                survey_locations = mysql_cursor.fetchall()
                logger.info(f"Found {len(survey_locations)} survey locations")
                
                for loc in survey_locations:
                    text_fields = [loc.get('name', ''), loc.get('description', '')]
                    combined_text = ' '.join([str(field) for field in text_fields if field]).lower()
                    
                    if not combined_text.strip():
                        continue
                    
                    # Categorize survey locations
                    matched_category = 'survey'
                    for category, keywords in location_categories.items():
                        if any(keyword in combined_text for keyword in keywords):
                            matched_category = category
                            break
                    
                    location_name = loc.get('name') or loc.get('description') or f"survey_{loc['source_id']}"
                    key = f"{matched_category}_{location_name}"
                    
                    if key not in all_locations:
                        all_locations[key] = {
                            'category': matched_category,
                            'location_name': str(location_name),
                            'points': []
                        }
                    
                    all_locations[key]['points'].append({
                        'source_id': str(loc['source_id']),
                        'latitude': float(loc['latitude']),
                        'longitude': float(loc['longitude']),
                        'altitude': float(loc['coord_z']) if loc.get('coord_z') else None,
                        'created_at': loc.get('created_at'),
                        'updated_at': loc.get('updated_at')
                    })
                    
        except Exception as e:
            logger.debug(f"Survey location extraction failed: {e}")
    
    except Exception as e:
        logger.error(f"Error extracting locations: {e}")
    
    mysql_conn.close()
    return all_locations

def add_locations_to_postgresql(locations_dict):
    """Add extracted locations to PostgreSQL consolidated_locations table"""
    if not locations_dict:
        logger.info("No locations to add")
        return 0
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    added_count = 0
    category_counts = {}
    
    for location_key, location_data in locations_dict.items():
        try:
            category = location_data['category']
            location_name = location_data['location_name']
            points = location_data['points']
            
            if len(points) < 1:
                continue
            
            # Calculate consolidated data
            lats = [p['latitude'] for p in points]
            lons = [p['longitude'] for p in points]
            alts = [p['altitude'] for p in points if p['altitude'] is not None]
            source_ids = [p['source_id'] for p in points]
            
            # Create timestamps
            created_ats = [p['created_at'] for p in points if p['created_at']]
            updated_ats = [p['updated_at'] for p in points if p['updated_at']]
            
            first_recorded = min(created_ats) if created_ats else None
            last_recorded = max(updated_ats) if updated_ats else None
            avg_altitude = sum(alts) / len(alts) if alts else None
            
            # Create geometry
            if len(points) == 1:
                # Single point - create small buffer
                cursor.execute("""
                    INSERT INTO consolidated_locations (
                        location_name, total_points, center_latitude, center_longitude, avg_altitude,
                        center_point, location_polygon, location_boundary, area_sqm,
                        all_dump_node_ids, first_recorded, last_recorded, category
                    ) VALUES (%s, %s, %s, %s, %s,
                             ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                             ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 10)::geometry,
                             ST_ExteriorRing(ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 10)::geometry),
                             ST_Area(ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 10)),
                             %s, %s, %s, %s)
                """, (
                    location_name, len(points), lats[0], lons[0], avg_altitude,
                    lons[0], lats[0], lons[0], lats[0], lons[0], lats[0], lons[0], lats[0],
                    source_ids, first_recorded, last_recorded, category
                ))
            else:
                # Multiple points - create convex hull
                points_wkt = ', '.join([f"{lon} {lat}" for lon, lat in zip(lons, lats)])
                
                cursor.execute(f"""
                    INSERT INTO consolidated_locations (
                        location_name, total_points, center_latitude, center_longitude, avg_altitude,
                        center_point, location_polygon, location_boundary, area_sqm,
                        all_dump_node_ids, first_recorded, last_recorded, category
                    ) VALUES (%s, %s, %s, %s, %s,
                             ST_Centroid(ST_GeomFromText('MULTIPOINT({points_wkt})', 4326)),
                             ST_ConvexHull(ST_GeomFromText('MULTIPOINT({points_wkt})', 4326)),
                             ST_ExteriorRing(ST_ConvexHull(ST_GeomFromText('MULTIPOINT({points_wkt})', 4326))),
                             ST_Area(ST_ConvexHull(ST_GeomFromText('MULTIPOINT({points_wkt})', 4326))::geography),
                             %s, %s, %s, %s)
                """, (
                    location_name, len(points), 
                    sum(lats) / len(lats), sum(lons) / len(lons), avg_altitude,
                    source_ids, first_recorded, last_recorded, category
                ))
            
            added_count += 1
            category_counts[category] = category_counts.get(category, 0) + 1
            logger.info(f"Added {category} location: {location_name} ({len(points)} points)")
            
        except Exception as e:
            logger.warning(f"Failed to add location {location_key}: {e}")
            continue
    
    conn.close()
    
    # Log summary
    logger.info(f"Added {added_count} locations:")
    for category, count in category_counts.items():
        logger.info(f"  {category}: {count} locations")
    
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
            round(avg(total_points)::numeric, 1) as avg_points_per_location,
            round(sum(area_sqm)::numeric, 0) as total_area_sqm
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
        print(f"{row['category']:<12} {row['unique_locations']:<10} {row['total_points']:<8} {row['avg_points_per_location']:<12} {area:<15,}")
    
    # Show examples from each non-pit category
    cursor.execute("""
        SELECT category, location_name, total_points, round(area_sqm::numeric, 0) as area_sqm
        FROM consolidated_locations 
        WHERE category != 'pit'
        ORDER BY category, total_points DESC
        LIMIT 30
    """)
    
    examples = cursor.fetchall()
    
    if examples:
        print("\n=== EXAMPLE NON-PIT LOCATIONS ===")
        print(f"{'Category':<12} {'Location Name':<30} {'Points':<8} {'Area (sqm)':<12}")
        print("-" * 65)
        
        for row in examples:
            area = int(row['area_sqm']) if row['area_sqm'] else 0
            name = row['location_name'][:28] + '...' if len(row['location_name']) > 30 else row['location_name']
            print(f"{row['category']:<12} {name:<30} {row['total_points']:<8} {area:<12,}")
    
    conn.close()

def main():
    """Main function"""
    logger.info("=== Extracting Crusher, Parking, Fuel & Other Locations ===")
    
    try:
        wait_for_databases()
        
        # Extract locations from MySQL
        logger.info("Extracting locations from MySQL coordinate table...")
        locations_dict = extract_locations_by_keywords()
        
        logger.info(f"Found {len(locations_dict)} unique locations to process")
        
        # Add to PostgreSQL
        if locations_dict:
            added_count = add_locations_to_postgresql(locations_dict)
            logger.info(f"Successfully added {added_count} new locations")
        else:
            logger.info("No new locations found to add")
        
        # Show results
        show_final_results()
        
        logger.info("=== Extraction Complete ===")
        return True
        
    except Exception as e:
        logger.error(f"Failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)