#!/usr/bin/env python3
"""
Populate consolidated_locations directly from MySQL using decrypted coordinates
"""

import mysql.connector
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import math

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

AES_KEY = 'a8ba99bd-6871-4344-a227-4c2807ef5fbc'

# WGS84 constants
WGS_ORIGIN_X = 1422754634
WGS_ORIGIN_Y = -272077520
WGS_ORIGIN_Z = 528824
MINE_SCALE = 1.0
MINE_LAT = -22.74172628
MINE_LON = 119.25262554

def translate_mine_coords_to_wgs84(x, y, z):
    """Translate mine coordinates to WGS84"""
    x_scaled = x * MINE_SCALE
    y_scaled = y * MINE_SCALE
    z_scaled = z * MINE_SCALE
    
    wgs_x = WGS_ORIGIN_X + x_scaled
    wgs_y = WGS_ORIGIN_Y + y_scaled
    wgs_z = WGS_ORIGIN_Z + z_scaled
    
    lat = MINE_LAT + (wgs_y / 111320000)
    lon = MINE_LON + (wgs_x / (111320000 * math.cos(math.radians(MINE_LAT))))
    alt = wgs_z / 1000.0
    
    return lat, lon, alt

def populate_consolidated_locations():
    """Populate consolidated_locations from MySQL with decrypted coordinates"""
    print("🚀 Populating consolidated_locations from MySQL...")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    pg_conn = psycopg2.connect(**POSTGRES_CONFIG)
    pg_conn.autocommit = True
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    pg_cursor = pg_conn.cursor()
    
    try:
        # Create consolidated_locations table
        pg_cursor.execute("""
            CREATE EXTENSION IF NOT EXISTS postgis;
        """)
        
        pg_cursor.execute("""
            CREATE TABLE IF NOT EXISTS consolidated_locations (
                id SERIAL PRIMARY KEY,
                location_name TEXT NOT NULL,
                category TEXT DEFAULT 'default',
                total_points INTEGER,
                center_latitude DOUBLE PRECISION,
                center_longitude DOUBLE PRECISION,
                avg_altitude DOUBLE PRECISION,
                center_point GEOMETRY(POINT, 4326),
                polygon GEOMETRY(POLYGON, 4326),
                boundary GEOMETRY(LINESTRING, 4326),
                area_sqm DOUBLE PRECISION,
                all_dump_node_ids TEXT[],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        pg_cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_location_name 
            ON consolidated_locations (location_name);
        """)
        
        pg_cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_location_polygon 
            ON consolidated_locations USING GIST (polygon);
        """)
        
        print("✅ consolidated_locations table ready")
        
        # Get locations from MySQL with decrypted coordinates
        # Decrypt pose_aes and translate to lat/lon
        mysql_cursor.execute("""
            SELECT 
                pl.name as location_name,
                pl._CID_ as category_type,
                c._OID_ as coordinate_id,
                CAST(AES_DECRYPT(c.pose_aes, %s) AS CHAR) as decrypted_coords
            FROM pit_loc pl
            INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
            INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
            INNER JOIN coordinate c ON c._OID_ = slsxyz._coordinate
            WHERE pl.name IS NOT NULL
                AND c.pose_aes IS NOT NULL
            ORDER BY pl.name, c._OID_
            LIMIT 10000
        """, (AES_KEY,))
        
        rows = mysql_cursor.fetchall()
        print(f"📊 Found {len(rows)} coordinate records")
        
        if len(rows) == 0:
            print("⚠️ No coordinate records found")
            return False
        
        # Group by location
        location_map = {}
        for row in rows:
            loc_name = row['location_name']
            if loc_name not in location_map:
                location_map[loc_name] = {
                    'name': loc_name,
                    'category': row['category_type'] or 'default',
                    'coordinates': []
                }
            
            # Decrypt and parse coordinates
            decrypted = row['decrypted_coords']
            if decrypted and '\t' in decrypted:
                parts = decrypted.split('\t')
                if len(parts) >= 3:
                    try:
                        x = float(parts[0])
                        y = float(parts[1])
                        z = float(parts[2]) if len(parts) > 2 else 0.0
                        
                        # Translate to WGS84
                        lat, lon, alt = translate_mine_coords_to_wgs84(x, y, z)
                        
                        location_map[loc_name]['coordinates'].append({
                            'lat': lat,
                            'lon': lon,
                            'alt': alt
                        })
                    except (ValueError, IndexError):
                        continue
        
        print(f"📊 Grouped into {len(location_map)} locations")
        
        # Insert into PostgreSQL
        inserted = 0
        for loc_name, loc_data in location_map.items():
            if len(loc_data['coordinates']) < 3:
                continue
            
            try:
                coords = loc_data['coordinates']
                lats = [c['lat'] for c in coords]
                lons = [c['lon'] for c in coords]
                alts = [c['alt'] for c in coords]
                
                center_lat = sum(lats) / len(lats)
                center_lon = sum(lons) / len(lons)
                avg_alt = sum(alts) / len(alts) if alts else None
                
                # Create polygon WKT from coordinates
                coord_pairs = [f"{lon} {lat}" for lat, lon in zip(lats, lons)]
                polygon_wkt = f"POLYGON(({', '.join(coord_pairs)}, {coord_pairs[0]}))"
                
                pg_cursor.execute("""
                    INSERT INTO consolidated_locations (
                        location_name, category, total_points,
                        center_latitude, center_longitude, avg_altitude,
                        center_point, polygon, boundary, area_sqm
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                        ST_SetSRID(ST_GeomFromText(%s), 4326),
                        ST_ExteriorRing(ST_SetSRID(ST_GeomFromText(%s), 4326)),
                        ST_Area(ST_SetSRID(ST_GeomFromText(%s), 4326)::geography)
                    )
                    ON CONFLICT DO NOTHING
                """, (
                    loc_name, loc_data['category'], len(coords),
                    center_lat, center_lon, avg_alt,
                    center_lon, center_lat,
                    polygon_wkt, polygon_wkt, polygon_wkt
                ))
                
                inserted += 1
                if inserted % 10 == 0:
                    print(f"   ✅ Inserted {inserted}/{len(location_map)} locations...")
                    
            except Exception as e:
                print(f"   ⚠️ Failed to insert {loc_name}: {e}")
                continue
        
        print(f"✅ Inserted {inserted} consolidated locations")
        
        # Get final count
        pg_cursor.execute("SELECT COUNT(*) as count FROM consolidated_locations")
        final_count = pg_cursor.fetchone()[0]
        print(f"📊 Total consolidated_locations: {final_count}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        mysql_cursor.close()
        mysql_conn.close()
        pg_cursor.close()
        pg_conn.close()

if __name__ == "__main__":
    success = populate_consolidated_locations()
    exit(0 if success else 1)







