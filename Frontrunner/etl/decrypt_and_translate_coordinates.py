#!/usr/bin/env python3
"""
Decrypt encrypted columns in MySQL tables (coordinate, dump_node, travel, operator_account)
Then translate local coordinates to WGS84 using reference point
Handles all 4 tables with encrypted columns:
1. coordinate (pose_aes)
2. dump_node (coordinate__pose_aes)
3. travel (from_destination__pose_aes)
4. operator_account (ppin_aes - no coordinate translation)
"""

import mysql.connector
import os
import math
import time

MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', 'rootpassword'),
    'database': os.getenv('MYSQL_DATABASE', 'kmtsdb'),
    'charset': 'utf8mb4'
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
    """Translate mine coordinates to WGS84 using reference point
    
    Args:
        x, y, z: Local mine coordinates in MILLIMETERS (mm)
    
    Returns:
        lat, lon, alt: WGS84 coordinates (lat/lon in degrees, alt in meters)
    """
    # Input coordinates are in mm (mine local coordinates)
    # Apply mine scale
    x_scaled = x * MINE_SCALE
    y_scaled = y * MINE_SCALE
    z_scaled = z * MINE_SCALE
    
    # Convert to WGS84 using Komatsu algorithm
    # WGS_ORIGIN values are also in mm
    wgs_x = WGS_ORIGIN_X + x_scaled  # Result in mm
    wgs_y = WGS_ORIGIN_Y + y_scaled  # Result in mm
    wgs_z = WGS_ORIGIN_Z + z_scaled  # Result in mm
    
    # Convert WGS84 grid coordinates (in mm) to lat/lon using reference point
    # 1 degree ≈ 111,320 meters = 111,320,000 mm
    # Convert mm to degrees: divide by 111,320,000
    lat = MINE_LAT + (wgs_y / 111320000000.0)  # mm to degrees
    lon = MINE_LON + (wgs_x / (111320000000.0 * math.cos(math.radians(MINE_LAT))))  # mm to degrees
    alt = wgs_z / 1000.0  # Convert mm to meters
    
    return lat, lon, alt

def wait_for_mysql():
    """Wait for MySQL to be ready"""
    print("⏳ Waiting for MySQL...")
    max_attempts = 60
    for attempt in range(max_attempts):
        try:
            conn = mysql.connector.connect(**MYSQL_CONFIG)
            conn.close()
            print("✅ MySQL is ready")
            return True
        except mysql.connector.Error as e:
            if attempt % 10 == 0:
                print(f"Still waiting... ({attempt}/{max_attempts})")
            time.sleep(1)
    print("❌ MySQL not ready after 60 seconds")
    return False

def decrypt_table_coordinates(mysql_cursor, mysql_conn, table_name, encrypted_col, coord_prefix='coord'):
    """Decrypt coordinates for a specific table"""
    print(f"\n   🔓 Processing {table_name}.{encrypted_col}...")
    
    # Add decrypted columns if they don't exist
    columns_to_add = [
        (f'{coord_prefix}_x', 'DOUBLE NOT NULL DEFAULT 0'),
        (f'{coord_prefix}_y', 'DOUBLE NOT NULL DEFAULT 0'),
        (f'{coord_prefix}_z', 'DOUBLE NOT NULL DEFAULT 0'),
        (f'{coord_prefix}_heading', 'DOUBLE NOT NULL DEFAULT 0'),
        (f'{coord_prefix}_incl', 'DOUBLE NOT NULL DEFAULT 0'),
        (f'{coord_prefix}_status', 'DOUBLE NOT NULL DEFAULT 0'),
        ('latitude', 'DOUBLE'),
        ('longitude', 'DOUBLE'),
        ('altitude', 'DOUBLE')
    ]
    
    for col_name, col_def in columns_to_add:
        try:
            mysql_cursor.execute("""
                SELECT COUNT(*) as count
                FROM information_schema.columns
                WHERE table_schema = %s
                AND table_name = %s
                AND column_name = %s
            """, (MYSQL_CONFIG['database'], table_name, col_name))
            
            exists = mysql_cursor.fetchone()['count'] > 0
            
            if not exists:
                mysql_cursor.execute(f"""
                    ALTER TABLE `{table_name}`
                    ADD COLUMN {col_name} {col_def}
                """)
        except Exception as e:
            print(f"      ⚠️  Error adding column {col_name}: {e}")
    
    mysql_conn.commit()
    
    # Decrypt using MySQL AES_DECRYPT - using the exact pattern from decrypt_coordinates_sql.sql
    # Handle pose_aes as VARBINARY/BLOB correctly
    mysql_cursor.execute(f"""
        UPDATE `{table_name}` c
        JOIN (
          SELECT
            _OID_ AS pk,
            CAST(AES_DECRYPT({encrypted_col}, %s) AS CHAR) AS coords,
            LENGTH(CAST(AES_DECRYPT({encrypted_col}, %s) AS CHAR)) -
            LENGTH(REPLACE(CAST(AES_DECRYPT({encrypted_col}, %s) AS CHAR), '\\t','')) AS tabs
          FROM `{table_name}`
          WHERE {encrypted_col} IS NOT NULL
        ) d ON d.pk = c._OID_
        SET
          c.{coord_prefix}_x = CAST(IFNULL(NULLIF(SUBSTRING_INDEX(d.coords, '\\t', 1), ''), 0) AS DOUBLE),
          c.{coord_prefix}_y = CAST(IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 2), '\\t', -1), ''), 0) AS DOUBLE),
          c.{coord_prefix}_z = CAST(IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 3), '\\t', -1), ''), 0) AS DOUBLE),
          c.{coord_prefix}_heading = CAST(IF(d.tabs >= 3, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 4), '\\t', -1), ''), 0), 0) AS DOUBLE),
          c.{coord_prefix}_incl = CAST(IF(d.tabs >= 4, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 5), '\\t', -1), ''), 0), 0) AS DOUBLE),
          c.{coord_prefix}_status = CAST(IF(d.tabs >= 5, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 6), '\\t', -1), ''), 0), 0) AS DOUBLE)
        WHERE d.coords IS NOT NULL
        AND d.coords != ''
        AND d.coords LIKE '%\\t%'
    """, (AES_KEY, AES_KEY, AES_KEY))
    
    updated = mysql_cursor.rowcount
    mysql_conn.commit()
    print(f"      ✅ Decrypted {updated} records")
    
    return updated

def translate_table_coordinates(mysql_cursor, mysql_conn, table_name, coord_prefix='coord'):
    """Translate coordinates from local to WGS84 for a specific table"""
    print(f"\n   🌍 Translating {table_name} coordinates to WGS84...")
    
    # Get all records with decrypted coordinates that need translation
    mysql_cursor.execute(f"""
        SELECT _OID_, {coord_prefix}_x, {coord_prefix}_y, {coord_prefix}_z
        FROM `{table_name}`
        WHERE {coord_prefix}_x IS NOT NULL
        AND {coord_prefix}_y IS NOT NULL
        AND {coord_prefix}_z IS NOT NULL
        AND (latitude IS NULL OR longitude IS NULL)
    """)
    
    coords_to_translate = mysql_cursor.fetchall()
    print(f"      📊 Found {len(coords_to_translate)} coordinates to translate")
    
    if not coords_to_translate:
        return 0
    
    processed = 0
    batch_size = 1000
    
    for i in range(0, len(coords_to_translate), batch_size):
        batch = coords_to_translate[i:i + batch_size]
        
        for record in batch:
            try:
                oid = record['_OID_']
                x = float(record[f'{coord_prefix}_x'])
                y = float(record[f'{coord_prefix}_y'])
                z = float(record[f'{coord_prefix}_z'])
                
                # Translate to WGS84
                lat, lon, alt = translate_mine_coords_to_wgs84(x, y, z)
                
                # Update with translated coordinates
                mysql_cursor.execute(f"""
                    UPDATE `{table_name}`
                    SET latitude = %s,
                        longitude = %s,
                        altitude = %s
                    WHERE _OID_ = %s
                """, (lat, lon, alt, oid))
                
                processed += 1
            except Exception as e:
                continue
        
        mysql_conn.commit()
        
        if (i + batch_size) % 10000 == 0 or (i + batch_size) >= len(coords_to_translate):
            print(f"      🌍 Translated {min(i + batch_size, len(coords_to_translate))}/{len(coords_to_translate)} coordinates...")
    
    print(f"      ✅ Translated {processed} coordinates")
    return processed

def main():
    print("🚀 Starting coordinate decryption and translation for all tables...")
    print(f"📍 Reference Point: Lat={MINE_LAT}, Lon={MINE_LON}")
    print("=" * 80)
    
    # Wait for MySQL
    if not wait_for_mysql():
        return False
    
    # Connect to MySQL
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # Set the AES key variable
        mysql_cursor.execute(f"SET @k := '{AES_KEY}';")
        
        # Step 1: Decrypt operator_account (ppin_aes -> ppin_plain) - no coordinate translation
        print("\n📋 Step 1: Processing operator_account (ppin_aes)...")
        try:
            mysql_cursor.execute("""
                SELECT COUNT(*) as count
                FROM information_schema.columns
                WHERE table_schema = %s
                AND table_name = 'operator_account'
                AND column_name = 'ppin_plain'
            """, (MYSQL_CONFIG['database'],))
            
            exists = mysql_cursor.fetchone()['count'] > 0
            
            if not exists:
                mysql_cursor.execute("""
                    ALTER TABLE operator_account
                    ADD COLUMN ppin_plain VARCHAR(255) NULL
                """)
                print("   ✅ Added ppin_plain column")
            
            mysql_cursor.execute("""
                UPDATE operator_account
                SET ppin_plain = CAST(AES_DECRYPT(ppin_aes, @k) AS CHAR)
                WHERE ppin_aes IS NOT NULL
            """)
            updated = mysql_cursor.rowcount
            mysql_conn.commit()
            print(f"   ✅ Decrypted {updated} operator_account records")
        except Exception as e:
            print(f"   ⚠️  Error processing operator_account: {e}")
        
        # Step 2: Decrypt coordinate table (pose_aes)
        print("\n📋 Step 2: Processing coordinate table...")
        try:
            # First try using the SQL script approach which handles VARBINARY correctly
            print("   🔓 Attempting decryption using SQL pattern...")
            updated = decrypt_table_coordinates(mysql_cursor, mysql_conn, 'coordinate', 'pose_aes', 'coord')
            if updated == 0:
                print("   ⚠️  No records decrypted - checking if data needs different handling...")
                # Check if we can decrypt at all
                mysql_cursor.execute("""
                    SELECT COUNT(*) as can_decrypt
                    FROM coordinate
                    WHERE pose_aes IS NOT NULL
                    AND CAST(AES_DECRYPT(pose_aes, @k) AS CHAR) IS NOT NULL
                """)
                can_decrypt = mysql_cursor.fetchone()['can_decrypt']
                print(f"   📊 Records that can be decrypted: {can_decrypt}")
            translate_table_coordinates(mysql_cursor, mysql_conn, 'coordinate', 'coord')
        except Exception as e:
            print(f"   ⚠️  Error processing coordinate: {e}")
            import traceback
            traceback.print_exc()
        
        # Step 3: Decrypt dump_node table (coordinate__pose_aes)
        print("\n📋 Step 3: Processing dump_node table...")
        try:
            decrypt_table_coordinates(mysql_cursor, mysql_conn, 'dump_node', 'coordinate__pose_aes', 'coord')
            translate_table_coordinates(mysql_cursor, mysql_conn, 'dump_node', 'coord')
        except Exception as e:
            print(f"   ⚠️  Error processing dump_node: {e}")
        
        # Step 4: Decrypt travel table (from_destination__pose_aes)
        print("\n📋 Step 4: Processing travel table...")
        try:
            decrypt_table_coordinates(mysql_cursor, mysql_conn, 'travel', 'from_destination__pose_aes', 'dest')
            translate_table_coordinates(mysql_cursor, mysql_conn, 'travel', 'dest')
        except Exception as e:
            print(f"   ⚠️  Error processing travel: {e}")
        
        # Step 5: Verify results
        print("\n📊 Verification:")
        for table_name, encrypted_col, coord_prefix in [
            ('coordinate', 'pose_aes', 'coord'),
            ('dump_node', 'coordinate__pose_aes', 'coord'),
            ('travel', 'from_destination__pose_aes', 'dest')
        ]:
            try:
                mysql_cursor.execute(f"""
                    SELECT COUNT(*) as total,
                           COUNT({coord_prefix}_x) as with_x,
                           COUNT(latitude) as with_lat
                    FROM `{table_name}`
                    WHERE {encrypted_col} IS NOT NULL
                """)
                stats = mysql_cursor.fetchone()
                print(f"   {table_name}: {stats['total']} total, {stats['with_x']} decrypted, {stats['with_lat']} translated")
            except Exception as e:
                print(f"   {table_name}: Error getting stats - {e}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        mysql_cursor.close()
        mysql_conn.close()
    
    print("\n" + "=" * 80)
    print("✅ Coordinate decryption and translation complete!")
    print("=" * 80)
    return True

if __name__ == "__main__":
    main()

