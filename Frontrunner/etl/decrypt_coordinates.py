#!/usr/bin/env python3
"""
Decrypt pose_aes in MySQL coordinate table and add decrypted columns
Then translate local coordinates to WGS84 using reference point
"""

import mysql.connector
import psycopg2
import os
import math

MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', 'rootpassword'),
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

# Reference point from cfg_deployment (shown in image)
MINE_LAT = -22.74172628  # dsp_mine_latitude
MINE_LON = 119.25262554  # dsp_mine_longitude

# WGS84 Origin from cfg_deployment (in mm)
WGS_ORIGIN_X = 1422754634  # mm
WGS_ORIGIN_Y = -272077520  # mm  
WGS_ORIGIN_Z = 528824      # mm

# Scale factors
MINE_SCALE = 1.0  # dsp_mine_scale
GPS_SCALE = 3.08  # dsp_gps_scale

def translate_mine_coords_to_wgs84(x, y, z):
    """Translate mine coordinates to WGS84 using reference point"""
    # Input coordinates are in mm (mine local coordinates)
    # Apply mine scale
    x_scaled = x * MINE_SCALE
    y_scaled = y * MINE_SCALE
    z_scaled = z * MINE_SCALE
    
    # Convert to WGS84 using Komatsu algorithm
    wgs_x = WGS_ORIGIN_X + x_scaled
    wgs_y = WGS_ORIGIN_Y + y_scaled
    wgs_z = WGS_ORIGIN_Z + z_scaled
    
    # Convert WGS84 grid coordinates to lat/lon using reference point
    lat = MINE_LAT + (wgs_y / 111320000)  # 1 degree ≈ 111,320 meters
    lon = MINE_LON + (wgs_x / (111320000 * math.cos(math.radians(MINE_LAT))))
    alt = wgs_z / 1000.0  # Convert mm to meters
    
    return lat, lon, alt

def main():
    print("🚀 Starting coordinate decryption and translation...")
    print(f"📍 Reference Point: Lat={MINE_LAT}, Lon={MINE_LON}")
    print("=" * 80)
    
    # Connect to MySQL
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # Step 1: Add decrypted columns to coordinate table in MySQL
        print("\n📋 Step 1: Adding decrypted columns to coordinate table...")
        mysql_cursor.execute("""
            ALTER TABLE coordinate
            ADD COLUMN IF NOT EXISTS decrypted_x DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_y DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_z DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_heading DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_inclination DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_status DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION
        """)
        mysql_conn.commit()
        print("✅ Added decrypted columns to coordinate table")
        
        # Step 2: Get all records with pose_aes
        print("\n🔓 Step 2: Decrypting pose_aes data...")
        mysql_cursor.execute("""
            SELECT _OID_, pose_aes
            FROM coordinate
            WHERE pose_aes IS NOT NULL
        """)
        
        records = mysql_cursor.fetchall()
        print(f"📊 Found {len(records)} records with encrypted coordinates")
        
        if len(records) == 0:
            print("⚠️ No encrypted coordinates found!")
            return
        
        # Step 3: Decrypt and translate in batches
        batch_size = 1000
        processed = 0
        failed = 0
        
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            
            for record in batch:
                try:
                    oid = record['_OID_']
                    encrypted_data = record['pose_aes']
                    
                    # Decrypt using MySQL AES_DECRYPT
                    mysql_cursor.execute("""
                        SELECT CAST(AES_DECRYPT(%s, %s) AS CHAR) AS decrypted
                    """, (encrypted_data, AES_KEY))
                    
                    result = mysql_cursor.fetchone()
                    if not result or not result['decrypted']:
                        failed += 1
                        continue
                    
                    decrypted = result['decrypted']
                    parts = decrypted.split('\t')
                    
                    if len(parts) >= 6:
                        x = float(parts[0]) if parts[0] else 0.0
                        y = float(parts[1]) if parts[1] else 0.0
                        z = float(parts[2]) if parts[2] else 0.0
                        heading = float(parts[3]) if parts[3] else 0.0
                        inclination = float(parts[4]) if parts[4] else 0.0
                        status = float(parts[5]) if parts[5] else 0.0
                        
                        # Translate to WGS84
                        lat, lon, alt = translate_mine_coords_to_wgs84(x, y, z)
                        
                        # Update coordinate table with decrypted and translated values
                        mysql_cursor.execute("""
                            UPDATE coordinate
                            SET decrypted_x = %s,
                                decrypted_y = %s,
                                decrypted_z = %s,
                                decrypted_heading = %s,
                                decrypted_inclination = %s,
                                decrypted_status = %s,
                                latitude = %s,
                                longitude = %s,
                                altitude = %s
                            WHERE _OID_ = %s
                        """, (x, y, z, heading, inclination, status, lat, lon, alt, oid))
                        
                        processed += 1
                    else:
                        failed += 1
                        
                except Exception as e:
                    failed += 1
                    if failed <= 10:  # Show first 10 errors
                        print(f"   ⚠️ Failed to decrypt record {record.get('_OID_', 'unknown')}: {e}")
                    continue
            
            mysql_conn.commit()
            
            if (i + batch_size) % 10000 == 0 or (i + batch_size) >= len(records):
                print(f"   🔓 Processed {min(i + batch_size, len(records))}/{len(records)} records... (✅ {processed}, ❌ {failed})")
        
        print(f"\n✅ Decryption complete!")
        print(f"   ✅ Successfully decrypted: {processed}")
        print(f"   ❌ Failed: {failed}")
        
        # Step 4: Verify results
        mysql_cursor.execute("""
            SELECT COUNT(*) as total,
                   COUNT(latitude) as with_lat,
                   COUNT(longitude) as with_lon
            FROM coordinate
            WHERE pose_aes IS NOT NULL
        """)
        stats = mysql_cursor.fetchone()
        print(f"\n📊 Final stats:")
        print(f"   Total with pose_aes: {stats['total']}")
        print(f"   With latitude: {stats['with_lat']}")
        print(f"   With longitude: {stats['with_lon']}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        mysql_cursor.close()
        mysql_conn.close()
    
    print("\n" + "=" * 80)
    print("✅ Coordinate decryption and translation complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()

