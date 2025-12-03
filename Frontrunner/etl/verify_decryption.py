#!/usr/bin/env python3
"""
Verify that encrypted columns are properly decrypted in MySQL tables
Shows sample data and statistics for each table
"""

import mysql.connector
import os
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

def verify_table_decryption(mysql_cursor, table_name, encrypted_col, decrypted_cols, coord_prefix='coord'):
    """Verify decryption for a specific table"""
    print(f"\n{'='*80}")
    print(f"📊 Verifying {table_name}")
    print(f"{'='*80}")
    
    # Check if table exists
    mysql_cursor.execute("""
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = %s
        AND table_name = %s
    """, (MYSQL_CONFIG['database'], table_name))
    
    if mysql_cursor.fetchone()['count'] == 0:
        print(f"   ⚠️  Table {table_name} does not exist")
        return False
    
    # Check encrypted column
    mysql_cursor.execute(f"""
        SELECT COUNT(*) as total,
               COUNT({encrypted_col}) as with_encrypted
        FROM `{table_name}`
    """)
    stats = mysql_cursor.fetchone()
    print(f"\n   📋 Total records: {stats['total']}")
    print(f"   🔒 Records with {encrypted_col}: {stats['with_encrypted']}")
    
    # Check decrypted columns
    for col in decrypted_cols:
        mysql_cursor.execute(f"""
            SELECT COUNT(*) as count
            FROM `{table_name}`
            WHERE {col} IS NOT NULL
            AND {col} != 0
        """)
        count = mysql_cursor.fetchone()['count']
        print(f"   ✅ Records with {col}: {count}")
    
    # Show sample decrypted data
    print(f"\n   📝 Sample decrypted data (first 5 records):")
    sample_query = f"""
        SELECT _OID_, {', '.join(decrypted_cols[:6])}
        FROM `{table_name}`
        WHERE {decrypted_cols[0]} IS NOT NULL
        AND {decrypted_cols[0]} != 0
        LIMIT 5
    """
    
    try:
        mysql_cursor.execute(sample_query)
        samples = mysql_cursor.fetchall()
        
        if samples:
            # Print header
            headers = ['_OID_'] + decrypted_cols[:6]
            print(f"   {' | '.join(f'{{:<15}}'.format(h[:15]) for h in headers)}")
            print(f"   {'-' * (len(headers) * 18)}")
            
            # Print data
            for row in samples:
                values = [str(row.get('_OID_', ''))] + [f"{row.get(col, 0):.6f}" for col in decrypted_cols[:6]]
                print(f"   {' | '.join(f'{{:<15}}'.format(v[:15]) for v in values)}")
        else:
            print(f"   ⚠️  No decrypted data found")
    except Exception as e:
        print(f"   ⚠️  Error showing samples: {e}")
    
    # Verify decryption by comparing encrypted vs decrypted
    print(f"\n   🔍 Verification: Testing decryption on sample...")
    mysql_cursor.execute(f"""
        SELECT _OID_, {encrypted_col}
        FROM `{table_name}`
        WHERE {encrypted_col} IS NOT NULL
        LIMIT 1
    """)
    
    sample = mysql_cursor.fetchone()
    if sample:
        encrypted_data = sample.get(encrypted_col)
        if encrypted_data:
            # Try to decrypt
            mysql_cursor.execute(f"""
                SELECT CAST(AES_DECRYPT(%s, %s) AS CHAR) AS decrypted
            """, (encrypted_data, AES_KEY))
            result = mysql_cursor.fetchone()
            if result and result.get('decrypted'):
                decrypted_str = result['decrypted']
                parts = decrypted_str.split('\t')
                print(f"   ✅ Decryption test successful!")
                print(f"   📦 Decrypted string length: {len(decrypted_str)}")
                print(f"   📦 Tab-separated values: {len(parts)} parts")
                if len(parts) >= 3:
                    print(f"   📦 Sample values: x={parts[0][:20]}, y={parts[1][:20]}, z={parts[2][:20]}")
            else:
                print(f"   ⚠️  Decryption test failed - could not decrypt")
        else:
            print(f"   ⚠️  No encrypted data to test")
    else:
        print(f"   ⚠️  No records with encrypted data")
    
    # Check if latitude/longitude columns exist and have data
    mysql_cursor.execute(f"""
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_schema = %s
        AND table_name = %s
        AND column_name = 'latitude'
    """, (MYSQL_CONFIG['database'], table_name))
    
    has_lat = mysql_cursor.fetchone()['count'] > 0
    
    if has_lat:
        mysql_cursor.execute(f"""
            SELECT COUNT(*) as with_lat,
                   COUNT(longitude) as with_lon,
                   COUNT(altitude) as with_alt
            FROM `{table_name}`
            WHERE latitude IS NOT NULL
        """)
        lat_stats = mysql_cursor.fetchone()
        print(f"\n   🌍 Coordinate translation:")
        print(f"   ✅ Records with latitude: {lat_stats['with_lat']}")
        print(f"   ✅ Records with longitude: {lat_stats['with_lon']}")
        print(f"   ✅ Records with altitude: {lat_stats['with_alt']}")
        
        # Show sample translated coordinates
        mysql_cursor.execute(f"""
            SELECT _OID_, {coord_prefix}_x, {coord_prefix}_y, {coord_prefix}_z,
                   latitude, longitude, altitude
            FROM `{table_name}`
            WHERE latitude IS NOT NULL
            AND longitude IS NOT NULL
            LIMIT 3
        """)
        translated = mysql_cursor.fetchall()
        if translated:
            print(f"\n   📍 Sample translated coordinates:")
            for row in translated:
                print(f"      _OID_: {row.get('_OID_')}")
                print(f"         Local: x={row.get(f'{coord_prefix}_x', 0):.2f}, y={row.get(f'{coord_prefix}_y', 0):.2f}, z={row.get(f'{coord_prefix}_z', 0):.2f}")
                print(f"         Global: lat={row.get('latitude', 0):.8f}, lon={row.get('longitude', 0):.8f}, alt={row.get('altitude', 0):.2f}m")
    
    return True

def main():
    print("🔍 Verifying Decryption Status")
    print("=" * 80)
    
    # Wait for MySQL
    if not wait_for_mysql():
        return False
    
    # Connect to MySQL
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # Verify each table
        tables_to_verify = [
            {
                'table': 'coordinate',
                'encrypted_col': 'pose_aes',
                'decrypted_cols': ['coord_x', 'coord_y', 'coord_z', 'coord_heading', 'coord_incl', 'coord_status'],
                'coord_prefix': 'coord'
            },
            {
                'table': 'dump_node',
                'encrypted_col': 'coordinate__pose_aes',
                'decrypted_cols': ['coord_x', 'coord_y', 'coord_z', 'coord_heading', 'coord_incl', 'coord_status'],
                'coord_prefix': 'coord'
            },
            {
                'table': 'travel',
                'encrypted_col': 'from_destination__pose_aes',
                'decrypted_cols': ['dest_x', 'dest_y', 'dest_z', 'dest_heading', 'dest_incl', 'dest_status'],
                'coord_prefix': 'dest'
            },
            {
                'table': 'operator_account',
                'encrypted_col': 'ppin_aes',
                'decrypted_cols': ['ppin_plain'],
                'coord_prefix': None
            }
        ]
        
        for table_info in tables_to_verify:
            verify_table_decryption(
                mysql_cursor,
                table_info['table'],
                table_info['encrypted_col'],
                table_info['decrypted_cols'],
                table_info['coord_prefix']
            )
        
        # Summary
        print(f"\n{'='*80}")
        print("📊 SUMMARY")
        print(f"{'='*80}")
        
        for table_info in tables_to_verify:
            table_name = table_info['table']
            encrypted_col = table_info['encrypted_col']
            decrypted_col = table_info['decrypted_cols'][0]
            
            try:
                mysql_cursor.execute(f"""
                    SELECT 
                        COUNT(*) as total,
                        COUNT({encrypted_col}) as encrypted,
                        COUNT({decrypted_col}) as decrypted
                    FROM `{table_name}`
                """)
                stats = mysql_cursor.fetchone()
                
                encrypted_count = stats.get('encrypted', 0)
                decrypted_count = stats.get('decrypted', 0)
                
                if encrypted_count > 0:
                    percentage = (decrypted_count / encrypted_count) * 100
                    status = "✅" if percentage > 90 else "⚠️" if percentage > 50 else "❌"
                    print(f"   {status} {table_name}: {decrypted_count}/{encrypted_count} decrypted ({percentage:.1f}%)")
                else:
                    print(f"   ℹ️  {table_name}: No encrypted data")
            except Exception as e:
                print(f"   ❌ {table_name}: Error - {e}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        mysql_cursor.close()
        mysql_conn.close()
    
    print(f"\n{'='*80}")
    print("✅ Verification complete!")
    print(f"{'='*80}")
    return True

if __name__ == "__main__":
    main()






