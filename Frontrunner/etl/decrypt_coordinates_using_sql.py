#!/usr/bin/env python3
"""
Decrypt coordinates using the SQL approach shown by user
Uses MySQL's AES_DECRYPT with JOIN subquery pattern
"""

import mysql.connector
import os

MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', 'rootpassword'),
    'database': os.getenv('MYSQL_DATABASE', 'kmtsdb'),
    'charset': 'utf8mb4'
}

AES_KEY = 'a8ba99bd-6871-4344-a227-4c2807ef5fbc'

def column_exists(cursor, table_name, column_name):
    """Check if column exists in table"""
    cursor.execute("""
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_schema = %s
        AND table_name = %s
        AND column_name = %s
    """, (MYSQL_CONFIG['database'], table_name, column_name))
    return cursor.fetchone()['count'] > 0

def main():
    print("🚀 Starting coordinate decryption using SQL approach...")
    print("=" * 80)
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    try:
        # Set the key variable
        mysql_cursor.execute(f"SET @k := '{AES_KEY}';")
        
        # 1) operator_account (ppin_aes -> ppin_plain)
        print("\n📋 1) Processing operator_account...")
        if not column_exists(mysql_cursor, 'operator_account', 'ppin_plain'):
            mysql_cursor.execute("""
                ALTER TABLE operator_account
                ADD COLUMN ppin_plain VARCHAR(255) NULL
            """)
            print("   ✅ Added ppin_plain column")
        else:
            print("   ℹ️  ppin_plain column already exists")
        
        mysql_cursor.execute("""
            UPDATE operator_account
            SET ppin_plain = CAST(AES_DECRYPT(ppin_aes, @k) AS CHAR)
            WHERE ppin_aes IS NOT NULL
        """)
        updated = mysql_cursor.rowcount
        mysql_conn.commit()
        print(f"   ✅ Updated {updated} records")
        
        # 2) coordinate (pose_aes -> coord_x..coord_status)
        print("\n📋 2) Processing coordinate table...")
        columns_to_add = [
            ('coord_x', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('coord_y', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('coord_z', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('coord_heading', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('coord_incl', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('coord_status', 'DECIMAL(15,6) NOT NULL DEFAULT 0')
        ]
        
        for col_name, col_def in columns_to_add:
            if not column_exists(mysql_cursor, 'coordinate', col_name):
                mysql_cursor.execute(f"""
                    ALTER TABLE coordinate
                    ADD COLUMN {col_name} {col_def}
                """)
                print(f"   ✅ Added {col_name} column")
        
        # Use the exact SQL pattern from the user's example
        # Only update records where decryption succeeds and has tabs
        mysql_cursor.execute("""
            UPDATE coordinate c
            JOIN (
              SELECT
                _OID_ AS pk,
                CAST(AES_DECRYPT(pose_aes, @k) AS CHAR) AS coords,
                LENGTH(CAST(AES_DECRYPT(pose_aes, @k) AS CHAR)) -
                LENGTH(REPLACE(CAST(AES_DECRYPT(pose_aes, @k) AS CHAR), '\\t','')) AS tabs
              FROM coordinate
              WHERE pose_aes IS NOT NULL
                AND CAST(AES_DECRYPT(pose_aes, @k) AS CHAR) IS NOT NULL
                AND CAST(AES_DECRYPT(pose_aes, @k) AS CHAR) LIKE '%\\t%'
            ) d ON d.pk = c._OID_
            SET
              c.coord_x = IFNULL(NULLIF(SUBSTRING_INDEX(d.coords, '\\t', 1), ''), 0),
              c.coord_y = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 2), '\\t', -1), ''), 0),
              c.coord_z = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 3), '\\t', -1), ''), 0),
              c.coord_heading = IF(d.tabs >= 3, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 4), '\\t', -1), ''), 0), 0),
              c.coord_incl    = IF(d.tabs >= 4, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 5), '\\t', -1), ''), 0), 0),
              c.coord_status  = IF(d.tabs >= 5, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 6), '\\t', -1), ''), 0), 0)
        """)
        updated = mysql_cursor.rowcount
        mysql_conn.commit()
        print(f"   ✅ Updated {updated} coordinate records")
        
        # 3) dump_node (coordinate__pose_aes -> coord_x..coord_status)
        print("\n📋 3) Processing dump_node table...")
        for col_name, col_def in columns_to_add:
            if not column_exists(mysql_cursor, 'dump_node', col_name):
                mysql_cursor.execute(f"""
                    ALTER TABLE dump_node
                    ADD COLUMN {col_name} {col_def}
                """)
                print(f"   ✅ Added {col_name} column")
        
        mysql_cursor.execute("""
            UPDATE dump_node dn
            JOIN (
              SELECT
                _OID_ AS pk,
                CAST(AES_DECRYPT(coordinate__pose_aes, @k) AS CHAR) AS coords,
                LENGTH(CAST(AES_DECRYPT(coordinate__pose_aes, @k) AS CHAR)) -
                LENGTH(REPLACE(CAST(AES_DECRYPT(coordinate__pose_aes, @k) AS CHAR), '\\t','')) AS tabs
              FROM dump_node
              WHERE coordinate__pose_aes IS NOT NULL
            ) d ON d.pk = dn._OID_
            SET
              dn.coord_x = IFNULL(NULLIF(SUBSTRING_INDEX(d.coords, '\\t', 1), ''), 0),
              dn.coord_y = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 2), '\\t', -1), ''), 0),
              dn.coord_z = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 3), '\\t', -1), ''), 0),
              dn.coord_heading = IF(d.tabs >= 3, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 4), '\\t', -1), ''), 0), 0),
              dn.coord_incl    = IF(d.tabs >= 4, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 5), '\\t', -1), ''), 0), 0),
              dn.coord_status  = IF(d.tabs >= 5, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 6), '\\t', -1), ''), 0), 0)
        """)
        updated = mysql_cursor.rowcount
        mysql_conn.commit()
        print(f"   ✅ Updated {updated} dump_node records")
        
        # 4) travel (from_destination__pose_aes -> dest_x..dest_status)
        print("\n📋 4) Processing travel table...")
        travel_columns = [
            ('dest_x', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('dest_y', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('dest_z', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('dest_heading', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('dest_incl', 'DECIMAL(15,6) NOT NULL DEFAULT 0'),
            ('dest_status', 'DECIMAL(15,6) NOT NULL DEFAULT 0')
        ]
        
        for col_name, col_def in travel_columns:
            if not column_exists(mysql_cursor, 'travel', col_name):
                mysql_cursor.execute(f"""
                    ALTER TABLE travel
                    ADD COLUMN {col_name} {col_def}
                """)
                print(f"   ✅ Added {col_name} column")
        
        mysql_cursor.execute("""
            UPDATE travel t
            JOIN (
              SELECT
                _OID_ AS pk,
                CAST(AES_DECRYPT(from_destination__pose_aes, @k) AS CHAR) AS coords,
                LENGTH(CAST(AES_DECRYPT(from_destination__pose_aes, @k) AS CHAR)) -
                LENGTH(REPLACE(CAST(AES_DECRYPT(from_destination__pose_aes, @k) AS CHAR), '\\t','')) AS tabs
              FROM travel
              WHERE from_destination__pose_aes IS NOT NULL
            ) d ON d.pk = t._OID_
            SET
              t.dest_x = IFNULL(NULLIF(SUBSTRING_INDEX(d.coords, '\\t', 1), ''), 0),
              t.dest_y = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 2), '\\t', -1), ''), 0),
              t.dest_z = IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 3), '\\t', -1), ''), 0),
              t.dest_heading = IF(d.tabs >= 3, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 4), '\\t', -1), ''), 0), 0),
              t.dest_incl    = IF(d.tabs >= 4, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 5), '\\t', -1), ''), 0), 0),
              t.dest_status  = IF(d.tabs >= 5, IFNULL(NULLIF(SUBSTRING_INDEX(SUBSTRING_INDEX(d.coords, '\\t', 6), '\\t', -1), ''), 0), 0)
        """)
        updated = mysql_cursor.rowcount
        mysql_conn.commit()
        print(f"   ✅ Updated {updated} travel records")
        
        # Verify results
        print("\n📊 Verification:")
        mysql_cursor.execute("SELECT COUNT(*) as total, COUNT(coord_x) as with_x FROM coordinate WHERE pose_aes IS NOT NULL")
        coord_stats = mysql_cursor.fetchone()
        print(f"   coordinate: {coord_stats['total']} total, {coord_stats['with_x']} with coord_x")
        
        mysql_cursor.execute("SELECT COUNT(*) as total, COUNT(coord_x) as with_x FROM dump_node WHERE coordinate__pose_aes IS NOT NULL")
        dump_stats = mysql_cursor.fetchone()
        print(f"   dump_node: {dump_stats['total']} total, {dump_stats['with_x']} with coord_x")
        
        mysql_cursor.execute("SELECT COUNT(*) as total, COUNT(dest_x) as with_x FROM travel WHERE from_destination__pose_aes IS NOT NULL")
        travel_stats = mysql_cursor.fetchone()
        print(f"   travel: {travel_stats['total']} total, {travel_stats['with_x']} with dest_x")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        mysql_cursor.close()
        mysql_conn.close()
    
    print("\n" + "=" * 80)
    print("✅ Decryption complete!")
    print("=" * 80)

if __name__ == "__main__":
    main()

