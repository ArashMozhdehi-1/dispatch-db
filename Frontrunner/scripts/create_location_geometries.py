#!/usr/bin/env python3
"""
Create Location Geometries Script
Converts grouped coordinate points into polylines/polygons and stores them in PostgreSQL
"""

import mysql.connector
import psycopg2
from psycopg2.extras import RealDictCursor
import json
import math
from typing import List, Tuple, Dict, Any
import os

# Database configurations
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', 3306)),
    'database': os.getenv('MYSQL_DATABASE', 'kmtsdb'),
    'user': os.getenv('MYSQL_USER', 'kmtsuser'),
    'password': os.getenv('MYSQL_PASSWORD', 'kmtspass')
}

POSTGRES_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'port': int(os.getenv('POSTGRES_PORT', 5432)),
    'database': os.getenv('POSTGRES_DATABASE', 'infrastructure_db'),
    'user': os.getenv('POSTGRES_USER', 'infra_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'infra_password')
}

def get_mysql_connection():
    """Get MySQL connection"""
    return mysql.connector.connect(**MYSQL_CONFIG)

def get_postgres_connection():
    """Get PostgreSQL connection"""
    return psycopg2.connect(**POSTGRES_CONFIG)

def categorize_location(location_name: str, location_type: str) -> str:
    """Categorize location into functional groups"""
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
    
    # Gates
    if 'GATE' in name:
        return 'Gates'
    
    # Access points
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
    
    return 'Other Locations'

def calculate_centroid(coordinates: List[Tuple[float, float]]) -> Tuple[float, float]:
    """Calculate centroid of coordinate points"""
    if not coordinates:
        return (0, 0)
    
    lat_sum = sum(coord[0] for coord in coordinates)
    lng_sum = sum(coord[1] for coord in coordinates)
    count = len(coordinates)
    
    return (lat_sum / count, lng_sum / count)

def sort_coordinates_by_angle(coordinates: List[Tuple[float, float, str]]) -> List[Tuple[float, float, str]]:
    """Sort coordinates by angle from centroid to create proper polygon/polyline"""
    if len(coordinates) < 3:
        return coordinates
    
    # Calculate centroid
    centroid_lat = sum(coord[0] for coord in coordinates) / len(coordinates)
    centroid_lng = sum(coord[1] for coord in coordinates) / len(coordinates)
    
    # Calculate angle for each point and sort
    def get_angle(coord):
        lat, lng, coord_id = coord
        return math.atan2(lat - centroid_lat, lng - centroid_lng)
    
    return sorted(coordinates, key=get_angle)

def create_geometry_from_coordinates(coordinates: List[Tuple[float, float, str]], geometry_type: str = 'polygon') -> Dict[str, Any]:
    """Create GeoJSON geometry from coordinates"""
    if len(coordinates) < 2:
        return None
    
    # Sort coordinates to form proper shape
    sorted_coords = sort_coordinates_by_angle(coordinates)
    
    # Extract lat/lng pairs
    coord_pairs = [(coord[1], coord[0]) for coord in sorted_coords]  # GeoJSON uses [lng, lat]
    
    if geometry_type == 'polygon' and len(coord_pairs) >= 3:
        # Close the polygon by adding first point at the end
        if coord_pairs[0] != coord_pairs[-1]:
            coord_pairs.append(coord_pairs[0])
        
        return {
            'type': 'Polygon',
            'coordinates': [coord_pairs]
        }
    else:
        # Create polyline (LineString)
        return {
            'type': 'LineString',
            'coordinates': coord_pairs
        }

def fetch_grouped_coordinates():
    """Fetch coordinates grouped by location from MySQL"""
    mysql_conn = get_mysql_connection()
    cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # Get coordinates with location information
        query = """
        SELECT  
            pl.name as location_name,
            pl._CID_ as location_type,
            c._OID_ as coordinate_id,
            c.latitude,
            c.longitude,
            c.coord_x,
            c.coord_y,
            c.coord_z
        FROM pit_loc pl
        INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
        INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
        INNER JOIN coordinate c ON c._OID_ = slsxyz._coordinate
        WHERE c.latitude IS NOT NULL 
            AND c.longitude IS NOT NULL
            AND c.latitude BETWEEN -60 AND -20
            AND c.longitude BETWEEN 100 AND 160
        ORDER BY pl.name, c._OID_
        """
        
        cursor.execute(query)
        results = cursor.fetchall()
        
        # Group coordinates by location name
        grouped_coords = {}
        for row in results:
            location_name = row['location_name']
            category = categorize_location(location_name, row['location_type'])
            
            key = f"{category}::{location_name}"
            
            if key not in grouped_coords:
                grouped_coords[key] = {
                    'location_name': location_name,
                    'category': category,
                    'location_type': row['location_type'],
                    'coordinates': []
                }
            
            grouped_coords[key]['coordinates'].append((
                float(row['latitude']),
                float(row['longitude']),
                row['coordinate_id']
            ))
        
        return grouped_coords
        
    finally:
        cursor.close()
        mysql_conn.close()

def setup_postgres_tables():
    """Setup PostgreSQL tables for location geometries"""
    postgres_conn = get_postgres_connection()
    cursor = postgres_conn.cursor()
    
    try:
        # Enable PostGIS extension
        cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        
        # Create location_geometries table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS location_geometries (
            id SERIAL PRIMARY KEY,
            location_name VARCHAR(255) NOT NULL,
            category VARCHAR(100) NOT NULL,
            location_type VARCHAR(100),
            geometry_type VARCHAR(50) NOT NULL,
            coordinate_count INTEGER NOT NULL,
            geometry GEOMETRY NOT NULL,
            centroid GEOMETRY(POINT, 4326),
            area_sqm DOUBLE PRECISION,
            perimeter_m DOUBLE PRECISION,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        
        # Create spatial index
        cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_location_geometries_geometry 
        ON location_geometries USING GIST (geometry);
        """)
        
        cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_location_geometries_centroid 
        ON location_geometries USING GIST (centroid);
        """)
        
        # Create category index
        cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_location_geometries_category 
        ON location_geometries (category);
        """)
        
        postgres_conn.commit()
        print("✅ PostgreSQL tables setup complete")
        
    finally:
        cursor.close()
        postgres_conn.close()

def insert_location_geometry(location_data: Dict[str, Any], geometry: Dict[str, Any]):
    """Insert location geometry into PostgreSQL"""
    postgres_conn = get_postgres_connection()
    cursor = postgres_conn.cursor()
    
    try:
        # Determine geometry type
        geometry_type = 'polygon' if geometry['type'] == 'Polygon' else 'polyline'
        
        # Create geometry from GeoJSON
        geometry_wkt = json.dumps(geometry)
        
        # Calculate centroid
        centroid_lat, centroid_lng = calculate_centroid(location_data['coordinates'])
        
        # Insert geometry
        cursor.execute("""
        INSERT INTO location_geometries 
        (location_name, category, location_type, geometry_type, coordinate_count, 
         geometry, centroid, area_sqm, perimeter_m)
        VALUES (%s, %s, %s, %s, %s, 
                ST_GeomFromGeoJSON(%s), 
                ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                CASE WHEN %s = 'polygon' THEN ST_Area(ST_GeomFromGeoJSON(%s)::geography) ELSE NULL END,
                ST_Perimeter(ST_GeomFromGeoJSON(%s)::geography))
        ON CONFLICT (location_name) DO UPDATE SET
            category = EXCLUDED.category,
            location_type = EXCLUDED.location_type,
            geometry_type = EXCLUDED.geometry_type,
            coordinate_count = EXCLUDED.coordinate_count,
            geometry = EXCLUDED.geometry,
            centroid = EXCLUDED.centroid,
            area_sqm = EXCLUDED.area_sqm,
            perimeter_m = EXCLUDED.perimeter_m,
            updated_at = CURRENT_TIMESTAMP
        """, (
            location_data['location_name'],
            location_data['category'],
            location_data['location_type'],
            geometry_type,
            len(location_data['coordinates']),
            geometry_wkt,
            centroid_lng, centroid_lat,  # PostGIS uses lng, lat order
            geometry_type,
            geometry_wkt,
            geometry_wkt
        ))
        
        postgres_conn.commit()
        
    finally:
        cursor.close()
        postgres_conn.close()

def main():
    """Main execution function"""
    print("🚀 Starting Location Geometry Creation...")
    
    # Setup PostgreSQL tables
    setup_postgres_tables()
    
    # Fetch grouped coordinates
    print("📊 Fetching grouped coordinates from MySQL...")
    grouped_coords = fetch_grouped_coordinates()
    
    print(f"📍 Found {len(grouped_coords)} location groups")
    
    # Process each location group
    geometries_created = 0
    for key, location_data in grouped_coords.items():
        location_name = location_data['location_name']
        coord_count = len(location_data['coordinates'])
        
        print(f"🔄 Processing {location_name} ({coord_count} coordinates)")
        
        # Skip locations with too few coordinates
        if coord_count < 3:
            print(f"⚠️  Skipping {location_name} - insufficient coordinates ({coord_count})")
            continue
        
        # Determine geometry type based on coordinate count and pattern
        geometry_type = 'polygon' if coord_count >= 4 else 'polyline'
        
        # Create geometry
        geometry = create_geometry_from_coordinates(location_data['coordinates'], geometry_type)
        
        if geometry:
            try:
                insert_location_geometry(location_data, geometry)
                geometries_created += 1
                print(f"✅ Created {geometry_type} for {location_name}")
            except Exception as e:
                print(f"❌ Error creating geometry for {location_name}: {e}")
        else:
            print(f"⚠️  Could not create geometry for {location_name}")
    
    print(f"🎉 Geometry creation complete! Created {geometries_created} geometries")

if __name__ == "__main__":
    main()