#!/usr/bin/env python3
"""
Populate consolidated_locations from decrypted coordinate data in PostgreSQL
"""

import psycopg2
from psycopg2.extras import RealDictCursor
import os

POSTGRES_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'user': os.getenv('POSTGRES_USER', 'infra_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'infra_password'),
    'database': os.getenv('POSTGRES_DATABASE', 'infrastructure_db')
}

def populate_consolidated_locations():
    """Populate consolidated_locations from decrypted pit_loc data"""
    print("🚀 Populating consolidated_locations from decrypted data...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    try:
        # Check if we have decrypted coordinate data
        cursor.execute("""
            SELECT COUNT(*) as total, 
                   COUNT(latitude) as with_lat,
                   COUNT(longitude) as with_lon
            FROM coordinate
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        """)
        coord_check = cursor.fetchone()
        print(f"📊 Coordinate table: {coord_check['total']} total, {coord_check['with_lat']} with lat/lon")
        
        # Create consolidated_locations table if it doesn't exist
        cursor.execute("""
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
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_location_name 
            ON consolidated_locations (location_name);
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_consolidated_location_polygon 
            ON consolidated_locations USING GIST (polygon);
        """)
        
        print("✅ consolidated_locations table ready")
        
        # Check if pit_loc table exists and has data
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'pit_loc'
            ) as exists;
        """)
        pit_loc_exists = cursor.fetchone()['exists']
        
        if not pit_loc_exists:
            print("⚠️ pit_loc table doesn't exist in PostgreSQL")
            return False
        
        # Get locations from pit_loc with decrypted coordinates
        # Join through survey_location and coordinate tables
        cursor.execute("""
            SELECT 
                pl.name as location_name,
                pl._CID_ as category_type,
                COUNT(DISTINCT c._OID_) as point_count,
                AVG(c.latitude) as avg_lat,
                AVG(c.longitude) as avg_lon,
                AVG(c.altitude) as avg_alt,
                ST_Collect(ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)) as points_geom
            FROM pit_loc pl
            INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
            INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
            INNER JOIN coordinate c ON c._OID_ = slsxyz._coordinate
            WHERE pl.name IS NOT NULL
                AND c.latitude IS NOT NULL
                AND c.longitude IS NOT NULL
                AND c.latitude BETWEEN -60 AND -20
                AND c.longitude BETWEEN 100 AND 160
            GROUP BY pl.name, pl._CID_
            HAVING COUNT(DISTINCT c._OID_) >= 3
            ORDER BY pl.name
        """)
        
        locations = cursor.fetchall()
        print(f"📊 Found {len(locations)} locations to consolidate")
        
        if len(locations) == 0:
            print("⚠️ No locations found. Checking if coordinate table has decrypted data...")
            cursor.execute("SELECT COUNT(*) as count FROM coordinate WHERE latitude IS NOT NULL LIMIT 1")
            coord_count = cursor.fetchone()['count']
            print(f"   Coordinate table has {coord_count} records with latitude")
            return False
        
        # Insert into consolidated_locations
        inserted = 0
        for loc in locations:
            try:
                location_name = loc['location_name']
                category = loc['category_type'] or 'default'
                point_count = loc['point_count']
                avg_lat = float(loc['avg_lat'])
                avg_lon = float(loc['avg_lon'])
                avg_alt = float(loc['avg_alt']) if loc['avg_alt'] else None
                points_geom = loc['points_geom']
                
                # Create polygon from collected points
                cursor.execute("""
                    INSERT INTO consolidated_locations (
                        location_name, category, total_points,
                        center_latitude, center_longitude, avg_altitude,
                        center_point, polygon, boundary, area_sqm
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                        ST_ConvexHull(%s),
                        ST_ExteriorRing(ST_ConvexHull(%s)),
                        ST_Area(ST_ConvexHull(%s)::geography)
                    )
                    ON CONFLICT DO NOTHING
                """, (
                    location_name, category, point_count,
                    avg_lat, avg_lon, avg_alt,
                    avg_lon, avg_lat,
                    points_geom, points_geom, points_geom
                ))
                
                inserted += 1
                if inserted % 10 == 0:
                    print(f"   ✅ Inserted {inserted}/{len(locations)} locations...")
                    
            except Exception as e:
                print(f"   ⚠️ Failed to insert {loc.get('location_name', 'unknown')}: {e}")
                continue
        
        print(f"✅ Inserted {inserted} consolidated locations")
        
        # Get final count
        cursor.execute("SELECT COUNT(*) as count FROM consolidated_locations")
        final_count = cursor.fetchone()['count']
        print(f"📊 Total consolidated_locations: {final_count}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    success = populate_consolidated_locations()
    exit(0 if success else 1)






