#!/usr/bin/env python3
"""
Extract Intersection Location Data from MySQL and Create Consolidated Polygons
Similar to pit locations but for intersections in consolidated_intersections table
"""

import os
import sys
import time
import logging
import math
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

def create_consolidated_intersections_table():
    """Create the consolidated_intersections table in PostgreSQL"""
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    try:
        # Create table with same structure as consolidated_locations but for intersections
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS consolidated_intersections (
                intersection_id SERIAL PRIMARY KEY,
                intersection_name VARCHAR(255) NOT NULL,
                total_points INTEGER NOT NULL DEFAULT 0,
                center_latitude DOUBLE PRECISION,
                center_longitude DOUBLE PRECISION,
                center_point GEOMETRY(POINT, 4326),
                intersection_polygon GEOMETRY(POLYGON, 4326),
                intersection_boundary GEOMETRY(LINESTRING, 4326),
                area_sqm DOUBLE PRECISION,
                all_coordinate_ids TEXT[],
                intersection_type VARCHAR(100) DEFAULT 'road_intersection',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Create spatial indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_intersections_center_point 
            ON consolidated_intersections USING GIST (center_point);
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_intersections_polygon 
            ON consolidated_intersections USING GIST (intersection_polygon);
        """)
        
        logger.info("✅ Created consolidated_intersections table")
        
    except Exception as e:
        logger.error(f"Error creating table: {e}")
    
    conn.close()

def extract_intersection_data():
    """Extract intersection data from MySQL using the same logic as grouped-locations API"""
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    intersection_coordinates = []
    
    try:
        # Get coordinates grouped by pit location where type is intersection
        logger.info("Extracting intersection coordinates from pit_loc...")
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
                AND pl._CID_ = 'pit_loc_intersection'
            ORDER BY pl.name, c._OID_
        """)
        
        pit_intersection_results = mysql_cursor.fetchall()
        logger.info(f"Found {len(pit_intersection_results)} intersection coordinates from pit_loc")
        
        for row in pit_intersection_results:
            intersection_coordinates.append({
                'coordinate_id': row['coordinate_id'],
                'location_name': row['location_name'],
                'location_type': row['location_type'],
                'latitude': float(row['latitude']),
                'longitude': float(row['longitude']),
                'altitude': float(row['altitude']) if row['altitude'] else None,
                'coord_x': row['coord_x'],
                'coord_y': row['coord_y'],
                'coord_z': row['coord_z'],
                'source': 'pit_loc_intersection'
            })
        
        # Also search for intersection-related coordinates in general coordinate table
        logger.info("Searching for intersection-related coordinates...")
        mysql_cursor.execute("""
            SELECT 
                'coordinate' as location_type,
                CONCAT('Intersection_', c._OID_) as location_name,
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
            LIMIT 1000
        """)
        
        general_coords = mysql_cursor.fetchall()
        logger.info(f"Found {len(general_coords)} general coordinates to check for intersections")
        
        # Filter for intersection-like coordinates (heuristic)
        # You might want to adjust this logic based on your specific data patterns
        intersection_keywords = ['intersection', 'cross', 'junction', 'int_', '_int', 'road_', '_road']
        
        for row in general_coords:
            # Heuristic: if coordinate ID or nearby coordinates suggest intersection
            coord_id_str = str(row['coordinate_id']).lower()
            if any(keyword in coord_id_str for keyword in intersection_keywords):
                intersection_coordinates.append({
                    'coordinate_id': row['coordinate_id'],
                    'location_name': row['location_name'],
                    'location_type': 'intersection_coordinate',
                    'latitude': float(row['latitude']),
                    'longitude': float(row['longitude']),
                    'altitude': float(row['altitude']) if row['altitude'] else None,
                    'coord_x': row['coord_x'],
                    'coord_y': row['coord_y'],
                    'coord_z': row['coord_z'],
                    'source': 'general_coordinate'
                })
        
    except Exception as e:
        logger.error(f"Error extracting intersection data: {e}")
    
    mysql_conn.close()
    return intersection_coordinates

def group_intersection_coordinates(coordinates):
    """Group intersection coordinates by location name"""
    grouped_intersections = {}
    
    for coord in coordinates:
        location_name = coord['location_name']
        
        if location_name not in grouped_intersections:
            grouped_intersections[location_name] = {
                'intersection_name': location_name,
                'coordinates': [],
                'intersection_type': 'road_intersection'
            }
        
        grouped_intersections[location_name]['coordinates'].append(coord)
    
    # Filter out groups with too few points (less than 3 points can't make a meaningful polygon)
    filtered_intersections = {}
    for name, data in grouped_intersections.items():
        if len(data['coordinates']) >= 1:  # Keep even single points for now
            filtered_intersections[name] = data
    
    logger.info(f"Grouped into {len(filtered_intersections)} intersection locations")
    return filtered_intersections

def create_intersection_polygons(grouped_intersections):
    """Create polygon geometries for intersections and insert into PostgreSQL"""
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    added_count = 0
    logger.info(f"=== CREATING POLYGONS FOR {len(grouped_intersections)} INTERSECTIONS ===")
    
    for intersection_name, intersection_data in grouped_intersections.items():
        try:
            coordinates = intersection_data['coordinates']
            
            # Debug specific intersections
            if intersection_name == 'I20' or intersection_name == 'INT_49':
                logger.info(f"DEBUG {intersection_name}: Processing {len(coordinates)} coordinates")
            
            # Get coordinate IDs
            coord_ids = [str(c['coordinate_id']) for c in coordinates]
            
            # Calculate center from LOCAL coordinates and transform to lat/lon using UTM
            # UTM Zone 50S parameters for Yandi mining area
            LAT_OFFSET = -22.74
            LNG_OFFSET = 119.25
            NORTHING_ORIGIN = 7337000  # meters
            EASTING_ORIGIN = 676000    # meters
            
            # Get local mine coordinates (in millimeters) for area calculation
            local_coords = [(c['coord_x'], c['coord_y']) for c in coordinates if c['coord_x'] is not None and c['coord_y'] is not None]
            
            # Calculate center lat/lon from local coordinates using UTM transformation
            if len(local_coords) > 0:
                # Calculate center in millimeters
                center_x_mm = sum([c[0] for c in local_coords]) / len(local_coords)
                center_y_mm = sum([c[1] for c in local_coords]) / len(local_coords)
                
                # Convert mm to meters (UTM coordinates)
                easting = center_x_mm / 1000.0
                northing = center_y_mm / 1000.0
                
                # UTM Zone 50S to WGS84 conversion
                center_lat = LAT_OFFSET + (northing - NORTHING_ORIGIN) / 111000.0
                center_lon = LNG_OFFSET + (easting - EASTING_ORIGIN) / (111000.0 * abs(math.cos(math.radians(LAT_OFFSET))))
            else:
                # Fallback to existing lat/lon if no local coordinates
                lats = [c['latitude'] for c in coordinates]
                lons = [c['longitude'] for c in coordinates]
                center_lat = sum(lats) / len(lats)
                center_lon = sum(lons) / len(lons)
            
            # Debug: log local coordinates status for specific intersections
            if intersection_name == 'I20' or intersection_name == 'INT_49':
                logger.info(f"DEBUG {intersection_name}: {len(local_coords)}/{len(coordinates)} points have local coords")
                if len(local_coords) > 0:
                    logger.info(f"DEBUG {intersection_name}: Center UTM (m): E={easting:.2f}, N={northing:.2f}")
                    logger.info(f"DEBUG {intersection_name}: Calculated lat/lon: {center_lat:.8f}, {center_lon:.8f}")
                else:
                    logger.info(f"DEBUG {intersection_name}: Sample coord keys: {list(coordinates[0].keys())}")
            
            if len(coordinates) == 1:
                # Single point - create small circular buffer for intersection (15 meter radius)
                cursor.execute("""
                    WITH buffered AS (
                        SELECT ST_Buffer(ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography, 15)::geometry as geom
                    )
                    INSERT INTO consolidated_intersections (
                        intersection_name, total_points, center_latitude, center_longitude,
                        center_point, intersection_polygon, intersection_boundary, area_sqm,
                        all_coordinate_ids, intersection_type
                    ) 
                    SELECT %s, %s, %s, %s,
                           ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                           geom,
                           ST_ExteriorRing(geom),
                           PI() * 15 * 15,
                           %s, %s
                    FROM buffered
                """, (
                    center_lon, center_lat,
                    intersection_name, len(coordinates), center_lat, center_lon,
                    center_lon, center_lat,
                    coord_ids, intersection_data['intersection_type']
                ))
            elif len(local_coords) >= 3:
                # Multiple points with local coordinates - use local coords for area calculation
                # Convert from millimeters to meters
                local_points_meters = [(x / 1000.0, y / 1000.0) for x, y in local_coords]
                
                # Debug: Check coordinate range
                if intersection_name in ['I20', 'INT_49']:
                    x_coords = [p[0] for p in local_points_meters]
                    y_coords = [p[1] for p in local_points_meters]
                    logger.info(f"{intersection_name} CALC: After /1000 conversion:")
                    logger.info(f"{intersection_name} CALC: X in meters (first 5): {x_coords[:5]}")
                    logger.info(f"{intersection_name} CALC: Y in meters (first 5): {y_coords[:5]}")
                    logger.info(f"{intersection_name} CALC: X range: {min(x_coords):.2f} to {max(x_coords):.2f} meters (diff: {max(x_coords)-min(x_coords):.2f}m)")
                    logger.info(f"{intersection_name} CALC: Y range: {min(y_coords):.2f} to {max(y_coords):.2f} meters (diff: {max(y_coords)-min(y_coords):.2f}m)")
                
                # Calculate area using Shoelace formula in Python (more reliable)
                def calculate_polygon_area(points):
                    """Calculate area of polygon using Shoelace formula"""
                    n = len(points)
                    if n < 3:
                        return 0
                    area = 0.0
                    for i in range(n):
                        j = (i + 1) % n
                        area += points[i][0] * points[j][1]
                        area -= points[j][0] * points[i][1]
                    return abs(area) / 2.0
                
                # Sort points by angle to form proper polygon
                cx = sum(p[0] for p in local_points_meters) / len(local_points_meters)
                cy = sum(p[1] for p in local_points_meters) / len(local_points_meters)
                
                def angle_from_center(p):
                    return math.atan2(p[1] - cy, p[0] - cx)
                
                sorted_points = sorted(local_points_meters, key=angle_from_center)
                area_sqm = calculate_polygon_area(sorted_points)
                
                # Debug: Show final area calculation
                if intersection_name in ['I20', 'INT_49']:
                    logger.info(f"{intersection_name} CALC: Calculated area using Shoelace formula: {area_sqm:.2f} sqm")
                    logger.info(f"{intersection_name} CALC: That's approximately {area_sqm/10000:.4f} hectares or {(area_sqm**0.5):.1f}m x {(area_sqm**0.5):.1f}m if square")
                
                # Use geographic coordinates for the polygon geometry
                points_wkt = ', '.join([f"{lon} {lat}" for lon, lat in zip(lons, lats)])
                
                cursor.execute("""
                    WITH geo_geom AS (
                        SELECT ST_ConvexHull(ST_GeomFromText('MULTIPOINT(' || %s || ')', 4326)) as geo_hull
                    )
                    INSERT INTO consolidated_intersections (
                        intersection_name, total_points, center_latitude, center_longitude,
                        center_point, intersection_polygon, intersection_boundary, area_sqm,
                        all_coordinate_ids, intersection_type
                    ) 
                    SELECT %s, %s, %s, %s,
                           ST_Centroid(geo_hull),
                           geo_hull,
                           ST_ExteriorRing(geo_hull),
                           %s,
                           %s, %s
                    FROM geo_geom
                """, (
                    points_wkt,
                    intersection_name, len(coordinates), center_lat, center_lon,
                    area_sqm,
                    coord_ids, intersection_data['intersection_type']
                ))
            else:
                # Fallback to geographic coordinates
                points_wkt = ', '.join([f"{lon} {lat}" for lon, lat in zip(lons, lats)])
                
                cursor.execute("""
                    WITH geom AS (
                        SELECT ST_ConvexHull(ST_GeomFromText('MULTIPOINT(' || %s || ')', 4326)) as hull
                    )
                    INSERT INTO consolidated_intersections (
                        intersection_name, total_points, center_latitude, center_longitude,
                        center_point, intersection_polygon, intersection_boundary, area_sqm,
                        all_coordinate_ids, intersection_type
                    ) 
                    SELECT %s, %s, %s, %s,
                           ST_Centroid(hull),
                           hull,
                           ST_ExteriorRing(hull),
                           ST_Area(hull::geography),
                           %s, %s
                    FROM geom
                """, (
                    points_wkt,
                    intersection_name, len(coordinates), center_lat, center_lon,
                    coord_ids, intersection_data['intersection_type']
                ))
            
            added_count += 1
            logger.info(f"Added intersection: {intersection_name} ({len(coordinates)} points)")
            
        except Exception as e:
            logger.warning(f"Failed to add intersection {intersection_name}: {e}")
            continue
    
    conn.close()
    return added_count

def show_intersection_results():
    """Show final intersection results"""
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    cursor.execute("""
        SELECT 
            intersection_type,
            count(*) as intersection_count,
            sum(total_points) as total_points,
            round(avg(total_points)::numeric, 1) as avg_points_per_intersection,
            round(sum(area_sqm)::numeric, 0) as total_area_sqm
        FROM consolidated_intersections 
        GROUP BY intersection_type
        ORDER BY sum(total_points) DESC
    """)
    
    results = cursor.fetchall()
    
    print("\n=== CONSOLIDATED INTERSECTIONS BY TYPE ===")
    print(f"{'Type':<20} {'Intersections':<12} {'Points':<8} {'Avg Points':<12} {'Total Area (sqm)':<15}")
    print("-" * 75)
    
    for row in results:
        area = int(row['total_area_sqm']) if row['total_area_sqm'] else 0
        print(f"{row['intersection_type']:<20} {row['intersection_count']:<12} {row['total_points']:<8} {row['avg_points_per_intersection']:<12} {area:<15,}")
    
    # Show some examples
    cursor.execute("""
        SELECT intersection_name, total_points, round(area_sqm::numeric, 2) as area_sqm
        FROM consolidated_intersections 
        ORDER BY total_points DESC
        LIMIT 10
    """)
    
    examples = cursor.fetchall()
    
    if examples:
        print("\n=== TOP INTERSECTIONS BY POINT COUNT ===")
        print(f"{'Intersection Name':<30} {'Points':<8} {'Area (sqm)':<12}")
        print("-" * 55)
        
        for row in examples:
            area = int(row['area_sqm']) if row['area_sqm'] else 0
            name = row['intersection_name'][:28] + '...' if len(row['intersection_name']) > 30 else row['intersection_name']
            print(f"{name:<30} {row['total_points']:<8} {area:<12,}")
    
    conn.close()

def main():
    """Main function"""
    logger.info("=== Extracting Intersection Locations and Creating Polygons ===")
    
    try:
        wait_for_databases()
        
        # Create the consolidated_intersections table
        create_consolidated_intersections_table()
        
        # Extract intersection data from MySQL
        intersection_coordinates = extract_intersection_data()
        logger.info(f"Total intersection coordinates extracted: {len(intersection_coordinates)}")
        
        if not intersection_coordinates:
            logger.warning("No intersection coordinates found")
            return True
        
        # Group coordinates by intersection name
        grouped_intersections = group_intersection_coordinates(intersection_coordinates)
        
        # Create polygons and insert into PostgreSQL
        added_count = create_intersection_polygons(grouped_intersections)
        
        # Show results
        show_intersection_results()
        
        logger.info(f"\n=== Complete: Added {added_count} intersection polygons ===")
        return True
        
    except Exception as e:
        logger.error(f"Failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)



