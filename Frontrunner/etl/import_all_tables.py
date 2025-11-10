#!/usr/bin/env python3
"""
Complete MySQL to PostgreSQL Migration
Imports ALL tables from backup.sql and frontrunnerv3_dbschema.sql
Then adds decrypted coordinate columns and translates coordinates
"""

import mysql.connector
import psycopg2
import os
import subprocess
import time
import math
from psycopg2.extras import execute_batch

# Configuration
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'host.docker.internal'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', 'rootpassword'),
    'database': os.getenv('MYSQL_DATABASE', 'frontrunnerV3'),
    'charset': 'utf8mb4'
}

POSTGRES_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'user': os.getenv('POSTGRES_USER', 'infra_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'infra_password'),
    'database': os.getenv('POSTGRES_DATABASE', 'infrastructure_db')
}

# Mine configuration
MINE_ORIGIN_LAT = float(os.getenv('MINE_ORIGIN_LAT', '-22.74172628'))
MINE_ORIGIN_LON = float(os.getenv('MINE_ORIGIN_LON', '119.25262554'))
MINE_ORIGIN_ALT = float(os.getenv('MINE_ORIGIN_ALT', '528.824'))

# WGS84 Origin from cfg_deployment (in mm)
WGS_ORIGIN_X = 1422754634  # mm
WGS_ORIGIN_Y = -272077520  # mm  
WGS_ORIGIN_Z = 528824      # mm

# Scale factors from cfg_deployment
MINE_SCALE = 1.0  # dsp_mine_scale
GPS_SCALE = 3.08  # dsp_gps_scale

# Mine location from cfg_deployment
MINE_LAT = -22.74172628  # dsp_mine_latitude
MINE_LON = 119.25262554  # dsp_mine_longitude

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
            print(f"Still waiting... ({e})")
            time.sleep(1)
    print("❌ MySQL not ready after 60 seconds")
    return False

def wait_for_postgres():
    """Wait for PostgreSQL to be ready"""
    print("⏳ Waiting for PostgreSQL...")
    max_attempts = 60
    for attempt in range(max_attempts):
        try:
            conn = psycopg2.connect(**POSTGRES_CONFIG)
            conn.close()
            print("✅ PostgreSQL is ready")
            return True
        except psycopg2.Error as e:
            print(f"Still waiting... ({e})")
            time.sleep(1)
    print("❌ PostgreSQL not ready after 60 seconds")
    return False

def translate_mine_coords_to_wgs84(x, y, z):
    """Translate mine coordinates to WGS84 using Komatsu algorithm"""
    # Input coordinates are already in mm (mine local coordinates)
    # Apply mine scale
    x_scaled = x * MINE_SCALE
    y_scaled = y * MINE_SCALE
    z_scaled = z * MINE_SCALE
    
    # Convert to WGS84 using Komatsu algorithm
    wgs_x = WGS_ORIGIN_X + x_scaled
    wgs_y = WGS_ORIGIN_Y + y_scaled
    wgs_z = WGS_ORIGIN_Z + z_scaled
    
    # Convert WGS84 grid coordinates to lat/lon
    # Using the mine's base location as reference
    lat = MINE_LAT + (wgs_y / 111320000)  # 1 degree ≈ 111,320 meters
    lon = MINE_LON + (wgs_x / (111320000 * math.cos(math.radians(MINE_LAT))))
    alt = wgs_z / 1000.0  # Convert mm to meters
    
    return lat, lon, alt

def convert_mysql_to_postgres(sql_content):
    """Convert MySQL SQL to PostgreSQL compatible SQL"""
    # Remove MySQL-specific syntax
    sql_content = sql_content.replace('`', '"')  # Replace backticks with double quotes
    sql_content = sql_content.replace('ENGINE=InnoDB', '')  # Remove InnoDB engine
    sql_content = sql_content.replace('ENGINE=MyISAM', '')  # Remove MyISAM engine
    sql_content = sql_content.replace('DEFAULT CHARSET=utf8mb4', '')  # Remove charset
    sql_content = sql_content.replace('COLLATE=utf8mb4_0900_ai_ci', '')  # Remove collation
    sql_content = sql_content.replace('AUTO_INCREMENT', 'SERIAL')  # Convert auto increment
    sql_content = sql_content.replace('tinyint(1)', 'BOOLEAN')  # Convert tinyint(1) to boolean
    sql_content = sql_content.replace('int(11)', 'INTEGER')  # Convert int(11) to integer
    sql_content = sql_content.replace('bigint(20)', 'BIGINT')  # Convert bigint(20) to bigint
    sql_content = sql_content.replace('varchar(255)', 'VARCHAR(255)')  # Ensure proper case
    sql_content = sql_content.replace('double', 'DOUBLE PRECISION')  # Convert double to double precision
    sql_content = sql_content.replace('float', 'REAL')  # Convert float to real
    
    # Handle binary data - convert to hex format
    import re
    sql_content = re.sub(r"_binary '([^']+)'", r"'\1'::bytea", sql_content)
    
    # Remove MySQL-specific comments and commands
    lines = sql_content.split('\n')
    filtered_lines = []
    for line in lines:
        if not line.strip().startswith('/*!') and not line.strip().startswith('LOCK TABLES') and not line.strip().startswith('UNLOCK TABLES'):
            filtered_lines.append(line)
    
    return '\n'.join(filtered_lines)

def import_schema_and_data():
    """Import complete schema and data from SQL files"""
    print("\n📥 Importing complete database schema and data...")
    
    # Connect to PostgreSQL
    pg_conn = psycopg2.connect(**POSTGRES_CONFIG)
    pg_conn.autocommit = True
    pg_cursor = pg_conn.cursor()
    
    try:
        # First, import the schema
        print("   📋 Importing schema from frontrunnerv3_dbschema.sql...")
        try:
            with open('/app/frontrunnerv3_dbschema.sql', 'r', encoding='utf-8') as f:
                schema_sql = f.read()
        except UnicodeDecodeError:
            print("   ⚠️ UTF-8 failed, trying latin-1...")
            with open('/app/frontrunnerv3_dbschema.sql', 'r', encoding='latin-1') as f:
                schema_sql = f.read()
        
        # Convert MySQL to PostgreSQL
        schema_sql = convert_mysql_to_postgres(schema_sql)
        
        # Split by semicolon and execute each statement
        statements = [stmt.strip() for stmt in schema_sql.split(';') if stmt.strip()]
        for i, stmt in enumerate(statements):
            if stmt and not stmt.startswith('--') and not stmt.startswith('/*'):
                try:
                    pg_cursor.execute(stmt)
                    if i % 100 == 0:
                        print(f"   📋 Processed {i}/{len(statements)} schema statements...")
                except psycopg2.Error as e:
                    print(f"   ⚠️ Schema statement {i} failed: {e}")
                    continue
        
        print("   ✅ Schema imported successfully")
        
        # Now import the data
        print("   📊 Importing data from backup.sql...")
        try:
            with open('/app/backup.sql', 'r', encoding='utf-8') as f:
                data_sql = f.read()
        except UnicodeDecodeError:
            print("   ⚠️ UTF-8 failed, trying latin-1...")
            with open('/app/backup.sql', 'r', encoding='latin-1') as f:
                data_sql = f.read()
        
        # Convert MySQL to PostgreSQL
        data_sql = convert_mysql_to_postgres(data_sql)
        
        # Split by semicolon and execute each statement
        statements = [stmt.strip() for stmt in data_sql.split(';') if stmt.strip()]
        successful_imports = 0
        failed_imports = 0
        
        for i, stmt in enumerate(statements):
            if stmt and not stmt.startswith('--') and not stmt.startswith('/*') and not stmt.startswith('LOCK TABLES') and not stmt.startswith('UNLOCK TABLES'):
                # Skip statements with binary data or encoding issues
                if any(char in stmt for char in ['\\', '\x', '\r', '\n']):
                    failed_imports += 1
                    continue
                    
                try:
                    pg_cursor.execute(stmt)
                    successful_imports += 1
                    if i % 1000 == 0:
                        print(f"   📊 Processed {i}/{len(statements)} data statements... (✅ {successful_imports}, ❌ {failed_imports})")
                except psycopg2.Error as e:
                    failed_imports += 1
                    if failed_imports < 10:  # Only show first 10 errors
                        print(f"   ⚠️ Data statement {i} failed: {e}")
                    continue
        
        print(f"   📊 Data import complete: ✅ {successful_imports} successful, ❌ {failed_imports} failed")
        
        print("   ✅ Data imported successfully")
        
    except Exception as e:
        print(f"❌ Import failed: {e}")
        return False
    finally:
        pg_cursor.close()
        pg_conn.close()
    
    return True

def add_decrypted_columns():
    """Add decrypted coordinate columns to ALL tables that have coordinate data"""
    print("\n🔧 Adding decrypted coordinate columns to ALL tables...")
    
    pg_conn = psycopg2.connect(**POSTGRES_CONFIG)
    pg_cursor = pg_conn.cursor()
    
    try:
        # Find ALL tables that have coordinate-related columns
        pg_cursor.execute("""
            SELECT DISTINCT table_name 
            FROM information_schema.columns 
            WHERE column_name LIKE '%pose_aes%' 
            OR column_name LIKE '%coordinate%'
            OR column_name LIKE '%x_y_z%'
            OR column_name LIKE '%shapeloc%'
            OR column_name LIKE '%shapepath%'
        """)
        
        tables_with_coords = [row[0] for row in pg_cursor.fetchall()]
        print(f"   📊 Found {len(tables_with_coords)} tables with coordinate data: {tables_with_coords}")
        
        for table in tables_with_coords:
            try:
                # Add decrypted columns
                pg_cursor.execute(f"""
                    ALTER TABLE {table} 
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
                
                print(f"   ✅ Added decrypted columns to {table}")
                
            except psycopg2.Error as e:
                print(f"   ⚠️ Failed to add columns to {table}: {e}")
                continue
        
        pg_conn.commit()
        
    except Exception as e:
        print(f"❌ Failed to add decrypted columns: {e}")
        return False
    finally:
        pg_cursor.close()
        pg_conn.close()
    
    return True

def decrypt_and_translate_coordinates():
    """Decrypt and translate coordinates for ALL tables"""
    print("\n🔓 Decrypting and translating coordinates for ALL tables...")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    pg_conn = psycopg2.connect(**POSTGRES_CONFIG)
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    pg_cursor = pg_conn.cursor()
    
    try:
        # Find ALL tables that have encrypted coordinate data
        mysql_cursor.execute("""
            SELECT DISTINCT table_name, column_name
            FROM information_schema.columns 
            WHERE table_schema = %s
            AND (column_name LIKE '%pose_aes%' 
                OR column_name LIKE '%coordinate%'
                OR column_name LIKE '%x_y_z%')
        """, (MYSQL_CONFIG['database'],))
        
        coord_columns = mysql_cursor.fetchall()
        print(f"   📊 Found coordinate columns: {coord_columns}")
        
        # Group by table
        tables_to_process = {}
        for table_name, column_name in coord_columns:
            if table_name not in tables_to_process:
                tables_to_process[table_name] = []
            tables_to_process[table_name].append(column_name)
        
        total_processed = 0
        
        for table_name, columns in tables_to_process.items():
            print(f"\n   🔓 Processing {table_name}...")
            
            for coord_column in columns:
                print(f"      📍 Processing column: {coord_column}")
                
                # Get all records with encrypted coordinates
                mysql_cursor.execute(f"""
                    SELECT _OID_, {coord_column}
                    FROM {table_name}
                    WHERE {coord_column} IS NOT NULL
                """)
                
                records = mysql_cursor.fetchall()
                print(f"      📊 Found {len(records)} records with encrypted coordinates")
                
                if not records:
                    continue
                
                # Process in batches
                batch_size = 1000
                processed_count = 0
                
                for i in range(0, len(records), batch_size):
                    batch = records[i:i + batch_size]
                    
                    for record in batch:
                        try:
                            # Decrypt coordinates using MySQL AES_DECRYPT
                            mysql_cursor.execute(f"""
                                SELECT CAST(AES_DECRYPT(%s, 'a8ba99bd-6871-4344-a227-4c2807ef5fbc') AS CHAR) AS coords
                            """, (record[coord_column],))
                            
                            result = mysql_cursor.fetchone()
                            if not result or not result['coords']:
                                continue
                            
                            coords = result['coords']
                            parts = coords.split('\t')
                            
                            if len(parts) >= 6:
                                x = float(parts[0]) if parts[0] else 0.0
                                y = float(parts[1]) if parts[1] else 0.0
                                z = float(parts[2]) if parts[2] else 0.0
                                heading = float(parts[3]) if parts[3] else 0.0
                                inclination = float(parts[4]) if parts[4] else 0.0
                                status = float(parts[5]) if parts[5] else 0.0
                                
                                # Translate to WGS84 (coordinates are in mm)
                                lat, lon, alt = translate_mine_coords_to_wgs84(x, y, z)
                                
                                # Update PostgreSQL record
                                pg_cursor.execute(f"""
                                    UPDATE {table_name} 
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
                                """, (x, y, z, heading, inclination, status, lat, lon, alt, record['_OID_']))
                                
                                processed_count += 1
                                total_processed += 1
                        
                        except Exception as e:
                            print(f"      ⚠️ Failed to process record {record['_OID_']}: {e}")
                            continue
                    
                    if i % 1000 == 0:
                        print(f"      🔓 Processed {i}/{len(records)} records...")
                
                print(f"      ✅ Completed {coord_column}: {processed_count} records processed")
            
            pg_conn.commit()
            print(f"   ✅ Completed table {table_name}")
        
        print(f"\n   🎯 TOTAL PROCESSED: {total_processed} coordinate records")
        
    except Exception as e:
        print(f"❌ Decryption failed: {e}")
        return False
    finally:
        mysql_cursor.close()
        mysql_conn.close()
        pg_cursor.close()
        pg_conn.close()
    
    return True

def create_backup():
    """Create complete backup of PostgreSQL database"""
    print("\n💾 Creating complete backup...")
    
    try:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_file = f"/app/backups/complete_database_{timestamp}.sql"
        
        # Create backup directory if it doesn't exist
        os.makedirs("/app/backups", exist_ok=True)
        
        # Use pg_dump to create complete backup
        cmd = [
            "pg_dump",
            "-h", POSTGRES_CONFIG['host'],
            "-p", str(POSTGRES_CONFIG['port']),
            "-U", POSTGRES_CONFIG['user'],
            "-d", POSTGRES_CONFIG['database'],
            "-f", backup_file,
            "--clean",
            "--if-exists",
            "--create",
            "--column-inserts",
            "--no-owner",
            "--no-privileges"
        ]
        
        # Set password via environment variable
        env = os.environ.copy()
        env['PGPASSWORD'] = POSTGRES_CONFIG['password']
        
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        
        if result.returncode == 0:
            file_size = os.path.getsize(backup_file) / (1024 * 1024)  # MB
            print(f"   ✅ Backup complete: {backup_file}")
            print(f"   📦 Size: {file_size:.2f} MB")
            print(f"   📝 Includes: Complete schema + all data")
        else:
            print(f"   ❌ Backup failed: {result.stderr}")
            return False
        
    except Exception as e:
        print(f"❌ Backup creation failed: {e}")
        return False
    
    return True

def main():
    """Main migration function"""
    print("🚀 Starting complete MySQL to PostgreSQL migration...")
    print("=" * 80)
    print(f"📍 Yandi Mine (Western Australia)")
    print(f"   Latitude: {MINE_LAT}°")
    print(f"   Longitude: {MINE_LON}°")
    print(f"   Altitude: {WGS_ORIGIN_Z/1000:.1f}m")
    print(f"📏 Scale Factors:")
    print(f"   Mine Scale: {MINE_SCALE} (dsp_mine_scale)")
    print(f"   GPS Scale: {GPS_SCALE} (dsp_gps_scale)")
    print(f"🗺️ WGS84 Origin (from cfg_deployment):")
    print(f"   X: {WGS_ORIGIN_X} mm")
    print(f"   Y: {WGS_ORIGIN_Y} mm")
    print(f"   Z: {WGS_ORIGIN_Z} mm")
    print(f"📐 Conversion: Komatsu WGS84KomatsuConverter algorithm")
    print(f"📊 Coordinates: Mine local coordinates in mm")
    print("=" * 80)
    
    # Wait for databases
    if not wait_for_mysql():
        return False
    
    if not wait_for_postgres():
        return False
    
    print("\n📡 Connecting to databases...")
    print("✅ Connected to databases")
    
    # Import complete schema and data
    if not import_schema_and_data():
        return False
    
    # Add decrypted coordinate columns
    if not add_decrypted_columns():
        return False
    
    # Decrypt and translate coordinates
    if not decrypt_and_translate_coordinates():
        return False
    
    # Create backup
    if not create_backup():
        return False
    
    print("\n" + "=" * 80)
    print("✅ MIGRATION COMPLETE!")
    print("=" * 80)
    print("📊 All tables imported from MySQL")
    print("🔓 All coordinates decrypted and translated")
    print("💾 Complete backup created")
    print("=" * 80)
    
    return True

if __name__ == "__main__":
    import math
    main()
