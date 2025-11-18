#!/usr/bin/env python3
"""
Extract consolidated locations (pits, parking, crushers, fuel) from MySQL and create polygons in PostgreSQL
"""

import mysql.connector
import psycopg2
import logging
import math
from typing import Dict, List, Any

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
# Based on the utmToLatLng function in the frontend
LAT_OFFSET = -23.0
LNG_OFFSET = 120.0
NORTHING_ORIGIN = 7337000  # UTM northing origin in meters
EASTING_ORIGIN = 676000    # UTM easting origin in meters

def transform_local_to_latlon(x_mm, y_mm):
    """Transform local mine coordinates (mm) to WGS84 lat/lon using UTM Zone 50S"""
    # Convert mm to meters
    x_meters = x_mm / 1000.0
    y_meters = y_mm / 1000.0
    
    # Add local coordinates to UTM origin to get absolute UTM coordinates
    easting = EASTING_ORIGIN + x_meters
    northing = NORTHING_ORIGIN + y_meters
    
    # UTM to lat/lon conversion (simplified)
    latitude = LAT_OFFSET + (northing - NORTHING_ORIGIN) / 111000.0
    longitude = LNG_OFFSET + (easting - EASTING_ORIGIN) / (111000.0 * abs(math.cos(math.radians(LAT_OFFSET))))
    
    return latitude, longitude

def extract_locations_by_type(mysql_cursor, location_type_pattern):
    """Extract locations matching a type pattern - includes ALL pit_loc columns"""
    query = """
        SELECT DISTINCT
            pl._OID_ as pit_loc_oid,
            pl._CID_ as pit_loc_cid,
            pl.name as location_name,
            pl._location_survey,
            pl._def_dump_prof,
            pl._cur_dump_prof,
            pl.inclination,
            pl.crusher_interface_enabled,
            pl.auto_pause_enabled,
            pl.min_steering_radius,
            pl.max_acceleration,
            pl.max_deceleration,
            pl.max_centripetal_accel,
            pl.max_forward_speed,
            pl.max_reverse_speed,
            pl.ignore_dismiss,
            pl.mixed_location_current_type,
            pl.crush_bed_hold_time,
            pl.default_crush_bed_hold_time_used,
            pl.crush_move_fwd_while_lower_bed,
            pl.default_crush_move_fwd_while_lower_bed_used,
            pl.highdump__,
            pl.highdump__node_threshold,
            pl.highdump__default_node_threshold_used,
            pl.highdump__node_increment,
            pl.highdump__default_node_increment_used,
            pl.highdump__row_spacing,
            pl.highdump__default_row_spacing_used,
            pl.highdump__dump_spacing,
            pl.highdump__default_dump_spacing_used,
            pl.highdump__bed_hold_time,
            pl.highdump__default_bed_hold_time_used,
            pl.highdump__tip_area_depth,
            pl.highdump__edge_detection_dist,
            pl.highdump__default_edge_detection_dist_used,
            pl.highdump__extra_edge_approach_dist,
            pl.highdump__default_extra_edge_approach_dist_used,
            pl.highdump__lower_bed_before_move_fwd,
            pl.highdump__default_lower_bed_before_move_fwd_used,
            c._OID_ as coordinate_id,
            c.coord_x,
            c.coord_y,
            c.coord_z,
            c.latitude,
            c.longitude,
            c.altitude
        FROM pit_loc pl
        INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
        INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
        INNER JOIN coordinate c ON slsxyz._coordinate = c._OID_
        WHERE pl.name LIKE %s
        AND c.coord_x IS NOT NULL
        AND c.coord_y IS NOT NULL
        ORDER BY pl.name, c._OID_
    """
    
    mysql_cursor.execute(query, (location_type_pattern,))
    return mysql_cursor.fetchall()

def group_coordinates_by_location(coordinates):
    """Group coordinates by location name - stores ALL pit_loc columns"""
    locations = {}
    for row in coordinates:
        location_name = row['location_name']
        if location_name not in locations:
            # Store all pit_loc columns from first occurrence (they're the same for all coords)
            locations[location_name] = {
                'pit_loc_oid': row.get('pit_loc_oid'),
                'pit_loc_cid': row.get('pit_loc_cid'),
                '_location_survey': row.get('_location_survey'),
                '_def_dump_prof': row.get('_def_dump_prof'),
                '_cur_dump_prof': row.get('_cur_dump_prof'),
                'inclination': row.get('inclination'),
                'crusher_interface_enabled': row.get('crusher_interface_enabled'),
                'auto_pause_enabled': row.get('auto_pause_enabled'),
                'min_steering_radius': row.get('min_steering_radius'),
                'max_acceleration': row.get('max_acceleration'),
                'max_deceleration': row.get('max_deceleration'),
                'max_centripetal_accel': row.get('max_centripetal_accel'),
                'max_forward_speed': row.get('max_forward_speed'),
                'max_reverse_speed': row.get('max_reverse_speed'),
                'ignore_dismiss': row.get('ignore_dismiss'),
                'mixed_location_current_type': row.get('mixed_location_current_type'),
                'crush_bed_hold_time': row.get('crush_bed_hold_time'),
                'default_crush_bed_hold_time_used': row.get('default_crush_bed_hold_time_used'),
                'crush_move_fwd_while_lower_bed': row.get('crush_move_fwd_while_lower_bed'),
                'default_crush_move_fwd_while_lower_bed_used': row.get('default_crush_move_fwd_while_lower_bed_used'),
                'highdump__': row.get('highdump__'),
                'highdump__node_threshold': row.get('highdump__node_threshold'),
                'highdump__default_node_threshold_used': row.get('highdump__default_node_threshold_used'),
                'highdump__node_increment': row.get('highdump__node_increment'),
                'highdump__default_node_increment_used': row.get('highdump__default_node_increment_used'),
                'highdump__row_spacing': row.get('highdump__row_spacing'),
                'highdump__default_row_spacing_used': row.get('highdump__default_row_spacing_used'),
                'highdump__dump_spacing': row.get('highdump__dump_spacing'),
                'highdump__default_dump_spacing_used': row.get('highdump__default_dump_spacing_used'),
                'highdump__bed_hold_time': row.get('highdump__bed_hold_time'),
                'highdump__default_bed_hold_time_used': row.get('highdump__default_bed_hold_time_used'),
                'highdump__tip_area_depth': row.get('highdump__tip_area_depth'),
                'highdump__edge_detection_dist': row.get('highdump__edge_detection_dist'),
                'highdump__default_edge_detection_dist_used': row.get('highdump__default_edge_detection_dist_used'),
                'highdump__extra_edge_approach_dist': row.get('highdump__extra_edge_approach_dist'),
                'highdump__default_extra_edge_approach_dist_used': row.get('highdump__default_extra_edge_approach_dist_used'),
                'highdump__lower_bed_before_move_fwd': row.get('highdump__lower_bed_before_move_fwd'),
                'highdump__default_lower_bed_before_move_fwd_used': row.get('highdump__default_lower_bed_before_move_fwd_used'),
                'coordinates': []
            }
        locations[location_name]['coordinates'].append({
            'coordinate_id': row['coordinate_id'],
            'coord_x': row['coord_x'],
            'coord_y': row['coord_y'],
            'coord_z': row['coord_z'],
            'latitude': row['latitude'],
            'longitude': row['longitude'],
            'altitude': row['altitude']
        })
    return locations

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
    logger.info("=== Extracting Consolidated Locations ===")
    
    # Connect to databases
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_cursor = postgres_conn.cursor()
    
    # Create table
    postgres_cursor.execute("""
        DROP TABLE IF EXISTS consolidated_locations CASCADE;
        CREATE TABLE consolidated_locations (
            location_id SERIAL PRIMARY KEY,
            location_name VARCHAR(255) NOT NULL,
            category VARCHAR(50) NOT NULL,
            total_points INTEGER NOT NULL,
            center_latitude DOUBLE PRECISION,
            center_longitude DOUBLE PRECISION,
            center_point GEOMETRY(Point, 4326),
            location_polygon GEOMETRY(Polygon, 4326),
            location_boundary GEOMETRY(LineString, 4326),
            area_sqm DOUBLE PRECISION,
            all_coordinate_ids TEXT,
            -- All pit_loc columns
            pit_loc_oid VARCHAR(32),
            pit_loc_cid VARCHAR(32),
            location_survey VARCHAR(32),
            def_dump_prof VARCHAR(32),
            cur_dump_prof VARCHAR(32),
            inclination VARCHAR(32),
            mixed_location_current_type VARCHAR(32),
            -- Store all other pit_loc columns as JSONB for flexibility
            pit_loc_attributes JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_consolidated_locations_category ON consolidated_locations(category);
        CREATE INDEX idx_consolidated_locations_geom ON consolidated_locations USING GIST(location_polygon);
    """)
    postgres_conn.commit()
    logger.info("✅ Created consolidated_locations table")
    
    # Extract each location type with multiple patterns
    location_types = [
        (['D%', 'L%', 'M%', 'HG_%', 'LG_%', '%_WEST', '%_EAST', '%_LEFT', '%_RL'], 'pit', 'Pit Locations'),
        (['BAY_%'], 'parking', 'Parking Bays'),
        (['C%', 'CRUSHER%'], 'crusher', 'Crusher Operations'),
        (['FUEL%'], 'fuel', 'Fuel Stations')
    ]
    
    total_locations = 0
    all_locations = {}
    
    for patterns, category, description in location_types:
        logger.info(f"\n📍 Extracting {description}...")
        
        category_coords = []
        for pattern in patterns:
            coords = extract_locations_by_type(mysql_cursor, pattern)
            category_coords.extend(coords)
        
        logger.info(f"Found {len(category_coords)} coordinate records")
        
        locations = group_coordinates_by_location(category_coords)
        logger.info(f"Grouped into {len(locations)} {description}")
        
        for location_name, location_data in locations.items():
            coords = location_data['coordinates']
            if len(coords) < 3:
                logger.warning(f"Skipping {location_name}: only {len(coords)} points")
                continue
            
            # Extract local coordinates
            local_coords = [(c['coord_x'], c['coord_y']) for c in coords if c['coord_x'] and c['coord_y']]
            
            if len(local_coords) < 3:
                logger.warning(f"Skipping {location_name}: insufficient local coordinates")
                continue
            
            # Convert to meters
            local_points_meters = [(x / 1000.0, y / 1000.0) for x, y in local_coords]
            
            # Sort points by angle to form proper polygon
            cx = sum(p[0] for p in local_points_meters) / len(local_points_meters)
            cy = sum(p[1] for p in local_points_meters) / len(local_points_meters)
            
            def angle_from_center(p):
                return math.atan2(p[1] - cy, p[0] - cx)
            
            sorted_points = sorted(local_points_meters, key=angle_from_center)
            
            # Calculate area
            area_sqm = calculate_polygon_area(sorted_points)
            
            # Calculate center and transform to lat/lon
            center_x_m = cx
            center_y_m = cy
            center_lat, center_lon = transform_local_to_latlon(center_x_m * 1000, center_y_m * 1000)
            
            # Transform all points to lat/lon for PostGIS polygon
            latlon_points = []
            for x_m, y_m in sorted_points:
                lat, lon = transform_local_to_latlon(x_m * 1000, y_m * 1000)
                latlon_points.append((lon, lat))  # PostGIS uses lon, lat order
            
            # Close the polygon
            latlon_points.append(latlon_points[0])
            
            # Create WKT polygon
            wkt_coords = ', '.join([f"{lon} {lat}" for lon, lat in latlon_points])
            polygon_wkt = f"POLYGON(({wkt_coords}))"
            
            # Get coordinate IDs
            coord_ids = ','.join([str(c['coordinate_id']) for c in coords])
            
            # Prepare pit_loc attributes as JSONB
            import json
            pit_loc_attrs = {
                'crusher_interface_enabled': location_data.get('crusher_interface_enabled'),
                'auto_pause_enabled': location_data.get('auto_pause_enabled'),
                'min_steering_radius': location_data.get('min_steering_radius'),
                'max_acceleration': location_data.get('max_acceleration'),
                'max_deceleration': location_data.get('max_deceleration'),
                'max_centripetal_accel': location_data.get('max_centripetal_accel'),
                'max_forward_speed': location_data.get('max_forward_speed'),
                'max_reverse_speed': location_data.get('max_reverse_speed'),
                'ignore_dismiss': location_data.get('ignore_dismiss'),
                'crush_bed_hold_time': location_data.get('crush_bed_hold_time'),
                'default_crush_bed_hold_time_used': location_data.get('default_crush_bed_hold_time_used'),
                'crush_move_fwd_while_lower_bed': location_data.get('crush_move_fwd_while_lower_bed'),
                'default_crush_move_fwd_while_lower_bed_used': location_data.get('default_crush_move_fwd_while_lower_bed_used'),
                'highdump__': location_data.get('highdump__'),
                'highdump__node_threshold': location_data.get('highdump__node_threshold'),
                'highdump__default_node_threshold_used': location_data.get('highdump__default_node_threshold_used'),
                'highdump__node_increment': location_data.get('highdump__node_increment'),
                'highdump__default_node_increment_used': location_data.get('highdump__default_node_increment_used'),
                'highdump__row_spacing': location_data.get('highdump__row_spacing'),
                'highdump__default_row_spacing_used': location_data.get('highdump__default_row_spacing_used'),
                'highdump__dump_spacing': location_data.get('highdump__dump_spacing'),
                'highdump__default_dump_spacing_used': location_data.get('highdump__default_dump_spacing_used'),
                'highdump__bed_hold_time': location_data.get('highdump__bed_hold_time'),
                'highdump__default_bed_hold_time_used': location_data.get('highdump__default_bed_hold_time_used'),
                'highdump__tip_area_depth': location_data.get('highdump__tip_area_depth'),
                'highdump__edge_detection_dist': location_data.get('highdump__edge_detection_dist'),
                'highdump__default_edge_detection_dist_used': location_data.get('highdump__default_edge_detection_dist_used'),
                'highdump__extra_edge_approach_dist': location_data.get('highdump__extra_edge_approach_dist'),
                'highdump__default_extra_edge_approach_dist_used': location_data.get('highdump__default_extra_edge_approach_dist_used'),
                'highdump__lower_bed_before_move_fwd': location_data.get('highdump__lower_bed_before_move_fwd'),
                'highdump__default_lower_bed_before_move_fwd_used': location_data.get('highdump__default_lower_bed_before_move_fwd_used')
            }
            
            # Insert into PostgreSQL using CONVEX HULL for outer boundary
            postgres_cursor.execute("""
                WITH points AS (
                    SELECT ST_GeomFromText(%s, 4326) as geom
                ),
                hull AS (
                    SELECT ST_ConvexHull(geom) as hull_geom FROM points
                )
                INSERT INTO consolidated_locations (
                    location_name, category, total_points,
                    center_latitude, center_longitude,
                    center_point, location_polygon, location_boundary,
                    area_sqm, all_coordinate_ids,
                    pit_loc_oid, pit_loc_cid, location_survey,
                    def_dump_prof, cur_dump_prof, inclination,
                    mixed_location_current_type, pit_loc_attributes
                )
                SELECT 
                    %s, %s, %s, %s, %s,
                    ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                    hull_geom,
                    ST_ExteriorRing(hull_geom),
                    ST_Area(hull_geom::geography),
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                FROM hull
            """, (
                polygon_wkt,
                location_name, category, len(coords),
                center_lat, center_lon,
                center_lon, center_lat,
                coord_ids,
                location_data.get('pit_loc_oid'),
                location_data.get('pit_loc_cid'),
                location_data.get('_location_survey'),
                location_data.get('_def_dump_prof'),
                location_data.get('_cur_dump_prof'),
                location_data.get('inclination'),
                location_data.get('mixed_location_current_type'),
                json.dumps(pit_loc_attrs)
            ))
            
            total_locations += 1
        
        postgres_conn.commit()
        logger.info(f"✅ Added {len(locations)} {description}")
    
    # Summary
    postgres_cursor.execute("""
        SELECT category, COUNT(*) as count, SUM(total_points) as points, ROUND(SUM(area_sqm)::numeric, 0) as total_area
        FROM consolidated_locations
        GROUP BY category
        ORDER BY category
    """)
    
    logger.info("\n=== CONSOLIDATED LOCATIONS SUMMARY ===")
    for row in postgres_cursor.fetchall():
        logger.info(f"{row[0]:15} {row[1]:3} locations, {row[2]:6} points, {row[3]:12} sqm")
    
    logger.info(f"\n✅ Complete: Added {total_locations} consolidated locations")
    
    mysql_conn.close()
    postgres_conn.close()

if __name__ == '__main__':
    main()
