#!/usr/bin/env python3
"""
Extract intersection locations from MySQL and create polygons in PostgreSQL
Uses same UTM Zone 50S transformation as consolidated_locations
"""

import mysql.connector
import psycopg2
import logging
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

def transform_local_to_latlon(x_mm, y_mm):
    """Transform local mine coordinates (mm) to WGS84 lat/lon using UTM Zone 50S"""
    x_meters = x_mm / 1000.0
    y_meters = y_mm / 1000.0
    easting = EASTING_ORIGIN + x_meters
    northing = NORTHING_ORIGIN + y_meters
    latitude = LAT_OFFSET + (northing - NORTHING_ORIGIN) / 111000.0
    longitude = LNG_OFFSET + (easting - EASTING_ORIGIN) / (111000.0 * abs(math.cos(math.radians(LAT_OFFSET))))
    return latitude, longitude

def extract_intersection_coordinates(mysql_cursor):
    """Extract all intersection coordinates from pit_loc"""
    query = """
        SELECT DISTINCT
            pl._location_survey,
            pl.name as intersection_name,
            c._OID_ as coordinate_id,
            c.coord_x,
            c.coord_y,
            c.coord_z
        FROM pit_loc pl
        INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
        INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
        INNER JOIN coordinate c ON slsxyz._coordinate = c._OID_
        WHERE (pl.name LIKE 'INT%' OR pl.name LIKE 'I%' OR pl.name LIKE 'IN%' 
               OR pl.name LIKE 'G_%' OR pl.name LIKE 'GA%' OR pl.name LIKE 'GATE%')
        AND c.coord_x IS NOT NULL
        AND c.coord_y IS NOT NULL
        ORDER BY pl.name, c._OID_
    """
    mysql_cursor.execute(query)
    return mysql_cursor.fetchall()

def group_by_intersection(coordinates):
    """Group coordinates by intersection name"""
    intersections = {}
    for row in coordinates:
        name = row['intersection_name']
        if name not in intersections:
            intersections[name] = []
        intersections[name].append({
            'coordinate_id': row['coordinate_id'],
            'coord_x': row['coord_x'],
            'coord_y': row['coord_y'],
            'coord_z': row['coord_z']
        })
    return intersections

def calculate_polygon_area(points):
    """Calculate area using Shoelace formula"""
    n = len(points)
    if n < 3:
        return 0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]
    return abs(area) / 2.0

def main():
    logger.info("=== Extracting Intersection Locations ===")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_cursor = postgres_conn.cursor()
    
    # Create table
    postgres_cursor.execute("""
        DROP TABLE IF EXISTS consolidated_intersections CASCADE;
        CREATE TABLE consolidated_intersections (
            intersection_id SERIAL PRIMARY KEY,
            intersection_name VARCHAR(255) NOT NULL,
            total_points INTEGER NOT NULL,
            center_latitude DOUBLE PRECISION,
            center_longitude DOUBLE PRECISION,
            center_point GEOMETRY(Point, 4326),
            intersection_polygon GEOMETRY(Polygon, 4326),
            intersection_boundary GEOMETRY(LineString, 4326),
            area_sqm DOUBLE PRECISION,
            all_coordinate_ids TEXT,
            intersection_type VARCHAR(50) DEFAULT 'road_intersection',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_intersections_geom ON consolidated_intersections USING GIST(intersection_polygon);
    """)
    postgres_conn.commit()
    logger.info("Created consolidated_intersections table")
    
    # Extract coordinates
    logger.info("Extracting intersection coordinates...")
    coordinates = extract_intersection_coordinates(mysql_cursor)
    logger.info(f"Found {len(coordinates)} coordinate records")
    
    intersections = group_by_intersection(coordinates)
    logger.info(f"Grouped into {len(intersections)} intersections")
    
    total_added = 0
    
    for intersection_name, coords in intersections.items():
        if len(coords) < 3:
            continue
        
        # Get local coordinates
        local_coords = [(c['coord_x'], c['coord_y']) for c in coords if c['coord_x'] and c['coord_y']]
        if len(local_coords) < 3:
            continue
        
        # Convert to meters
        local_points_meters = [(x / 1000.0, y / 1000.0) for x, y in local_coords]
        
        # Sort by angle for proper polygon
        cx = sum(p[0] for p in local_points_meters) / len(local_points_meters)
        cy = sum(p[1] for p in local_points_meters) / len(local_points_meters)
        
        def angle_from_center(p):
            return math.atan2(p[1] - cy, p[0] - cx)
        
        sorted_points = sorted(local_points_meters, key=angle_from_center)
        
        # Calculate area
        area_sqm = calculate_polygon_area(sorted_points)
        
        # Transform center to lat/lon
        center_lat, center_lon = transform_local_to_latlon(cx * 1000, cy * 1000)
        
        # Transform all points to lat/lon
        latlon_points = []
        for x_m, y_m in sorted_points:
            lat, lon = transform_local_to_latlon(x_m * 1000, y_m * 1000)
            latlon_points.append((lon, lat))
        
        latlon_points.append(latlon_points[0])  # Close polygon
        
        # Create WKT
        wkt_coords = ', '.join([f"{lon} {lat}" for lon, lat in latlon_points])
        polygon_wkt = f"POLYGON(({wkt_coords}))"
        
        coord_ids = ','.join([str(c['coordinate_id']) for c in coords])
        
        # Insert using CONVEX HULL
        try:
            postgres_cursor.execute("""
                WITH points AS (
                    SELECT ST_GeomFromText(%s, 4326) as geom
                ),
                hull AS (
                    SELECT ST_ConvexHull(geom) as hull_geom FROM points
                )
                INSERT INTO consolidated_intersections (
                    intersection_name, total_points,
                    center_latitude, center_longitude,
                    center_point, intersection_polygon, intersection_boundary,
                    area_sqm, all_coordinate_ids
                )
                SELECT 
                    %s, %s, %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                    hull_geom,
                    ST_ExteriorRing(hull_geom),
                    ST_Area(hull_geom::geography),
                    %s
                FROM hull
            """, (
                polygon_wkt,
                intersection_name, len(coords),
                center_lat, center_lon,
                center_lon, center_lat,
                coord_ids
            ))
            total_added += 1
        except Exception as e:
            logger.warning(f"Failed to add {intersection_name}: {e}")
    
    postgres_conn.commit()
    
    # Summary
    postgres_cursor.execute("""
        SELECT COUNT(*) as count, SUM(total_points) as points, ROUND(SUM(area_sqm)::numeric, 0) as total_area
        FROM consolidated_intersections
    """)
    row = postgres_cursor.fetchone()
    
    logger.info(f"\n=== SUMMARY ===")
    logger.info(f"Intersections: {row[0]}, Points: {row[1]}, Total Area: {row[2]} sqm")
    logger.info(f"Complete: Added {total_added} intersections")
    
    mysql_conn.close()
    postgres_conn.close()

if __name__ == '__main__':
    main()
