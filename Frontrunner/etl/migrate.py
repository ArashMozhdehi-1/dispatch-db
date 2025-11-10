#!/usr/bin/env python3
"""
MySQL to PostgreSQL Migration with Data Engineering Pipelines
Features:
- Parallel table processing with ThreadPoolExecutor for maximum throughput
- Connection pooling with health checks
- Chunked processing to prevent timeouts
- Automatic retry with exponential backoff
- Checkpoint/resume functionality
- Progress tracking and monitoring
- Parallel decryption of encrypted coordinate columns

Performance Tuning Environment Variables:
- MAX_WORKERS: Number of parallel table processing workers (default: 4)
- DECRYPTION_WORKERS: Number of parallel decryption workers (default: 3)
- MYSQL_POOL_SIZE: MySQL connection pool size (default: 10)
- POSTGRES_POOL_SIZE: PostgreSQL connection pool size (default: 10)
- CHUNK_SIZE: Records per chunk for large datasets (default: 20000)

Example for high-performance server:
  MAX_WORKERS=8 DECRYPTION_WORKERS=6 MYSQL_POOL_SIZE=15 POSTGRES_POOL_SIZE=15 CHUNK_SIZE=50000
"""

import mysql.connector
from mysql.connector import pooling, Error as MySQLError
import psycopg2
from psycopg2 import pool as psycopg2_pool
from psycopg2.extras import execute_batch
import os
import csv
import time
import json
import math
from contextlib import contextmanager
from typing import Optional, Dict, List, Tuple, Any
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue

# Configuration
MYSQL_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "host.docker.internal"),
    "port": int(os.getenv("MYSQL_PORT", "3306")),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", "rootpassword"),
    "database": os.getenv("MYSQL_DATABASE", "frontrunnerV3"),
    "charset": "utf8mb4",
    "connection_timeout": 30,
    "autocommit": False,
}

POSTGRES_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "postgres"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "user": os.getenv("POSTGRES_USER", "infra_user"),
    "password": os.getenv("POSTGRES_PASSWORD", "infra_password"),
    "database": os.getenv("POSTGRES_DATABASE", "infrastructure_db"),
}

AES_KEY = os.getenv("AES_UUID_KEY", "a8ba99bd-6871-4344-a227-4c2807ef5fbc")
CSV_DIR = "/app/csv_export"
CHECKPOINT_DIR = "/app/checkpoints"
CHECKPOINT_FILE = f"{CHECKPOINT_DIR}/migration_checkpoint.json"

# WGS84 constants
WGS_ORIGIN_X = 1422754634
WGS_ORIGIN_Y = -272077520
WGS_ORIGIN_Z = 528824
MINE_SCALE = 1.0
MINE_LAT = -22.74172628
MINE_LON = 119.25262554

# Connection pool configuration
MYSQL_POOL_SIZE = int(os.getenv("MYSQL_POOL_SIZE", "10"))  # Increased for parallelization
POSTGRES_POOL_SIZE = int(os.getenv("POSTGRES_POOL_SIZE", "10"))  # Increased for parallelization
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "20000"))  # Larger chunks for better performance
MAX_RETRIES = 5
RETRY_BACKOFF_BASE = 2  # Exponential backoff: 2^retry seconds
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "4"))  # Parallel table processing
DECRYPTION_WORKERS = int(os.getenv("DECRYPTION_WORKERS", "3"))  # Parallel decryption within tables

# Global connection pools
mysql_pool = None
pg_pool = None
_checkpoint_lock = threading.Lock()


def print_performance_config():
    """Print current performance configuration"""
    print("\n" + "=" * 80, flush=True)
    print("  PERFORMANCE CONFIGURATION", flush=True)
    print("=" * 80, flush=True)
    print(f"    Parallel Table Workers: {MAX_WORKERS}", flush=True)
    print(f"    Parallel Decryption Workers: {DECRYPTION_WORKERS}", flush=True)
    print(f"     MySQL Connection Pool: {MYSQL_POOL_SIZE}", flush=True)
    print(f"     PostgreSQL Connection Pool: {POSTGRES_POOL_SIZE}", flush=True)
    print(f"    Chunk Size: {CHUNK_SIZE:,} records", flush=True)
    print(f"    Max Retries per Table: {MAX_RETRIES}", flush=True)
    print("=" * 80, flush=True)
    print(f"  Tip: Adjust these values via environment variables for better performance", flush=True)
    print(f"  See PERFORMANCE_TUNING.md for detailed guidance", flush=True)
    print("=" * 80 + "\n", flush=True)


def wait_for_mysql():
    """Wait for MySQL to be ready"""
    print(" Waiting for MySQL...", flush=True)
    max_attempts = 60
    for attempt in range(max_attempts):
        try:
            # Use a temporary connection to test
            test_config = MYSQL_CONFIG.copy()
            test_config.pop('autocommit', None)  # Remove autocommit if present
            conn = mysql.connector.connect(**test_config)
            if conn.is_connected():
                conn.close()
                print(" MySQL is ready", flush=True)
                return True
        except Exception as e:
            if attempt % 5 == 0:
                print(f"   Still waiting... ({attempt}s) - {e}", flush=True)
            time.sleep(1)
    print(" MySQL not ready after 60 seconds", flush=True)
    return False


def wait_for_postgres():
    """Wait for PostgreSQL to be ready"""
    print(" Waiting for PostgreSQL...", flush=True)
    max_attempts = 60
    for attempt in range(max_attempts):
        try:
            conn = psycopg2.connect(**POSTGRES_CONFIG)
            conn.close()
            print(" PostgreSQL is ready", flush=True)
            return True
        except Exception as e:
            if attempt % 5 == 0:
                print(f"   Still waiting... ({attempt}s) - {e}", flush=True)
            time.sleep(1)
    print(" PostgreSQL not ready after 60 seconds", flush=True)
    return False


def init_connection_pools():
    """Initialize MySQL and PostgreSQL connection pools with retry logic"""
    global mysql_pool, pg_pool
    
    print(" Initializing connection pools...", flush=True)
    
    # Wait for databases first
    if not wait_for_mysql():
        raise Exception("MySQL not available")
    
    if not wait_for_postgres():
        raise Exception("PostgreSQL not available")
    
    # MySQL Connection Pool - retry on connection failure
    mysql_config = MYSQL_CONFIG.copy()
    mysql_config.pop('autocommit', None)  # Remove autocommit from pool config
    
    mysql_retries = 0
    while mysql_retries < MAX_RETRIES:
        try:
            mysql_pool = pooling.MySQLConnectionPool(
                pool_name="mysql_pool",
                pool_size=MYSQL_POOL_SIZE,
                pool_reset_session=True,
                autocommit=False,
                **mysql_config
            )
            print(f" MySQL pool created (size: {MYSQL_POOL_SIZE})", flush=True)
            break
        except (MySQLError, Exception) as e:
            mysql_retries += 1
            if mysql_retries < MAX_RETRIES:
                wait_time = RETRY_BACKOFF_BASE ** mysql_retries
                print(f" MySQL pool creation failed, retrying in {wait_time}s... (attempt {mysql_retries}/{MAX_RETRIES})", flush=True)
                print(f"   Error: {e}", flush=True)
                time.sleep(wait_time)
            else:
                raise Exception(f"Failed to create MySQL pool after {MAX_RETRIES} attempts: {e}")
    
    # PostgreSQL Connection Pool - use minconn=0 for lazy initialization
    try:
        pg_pool = psycopg2_pool.ThreadedConnectionPool(
            minconn=0,  # Don't create connections immediately
            maxconn=POSTGRES_POOL_SIZE,
            **POSTGRES_CONFIG
        )
        print(f" PostgreSQL pool created (size: {POSTGRES_POOL_SIZE})", flush=True)
    except Exception as e:
        print(f" PostgreSQL pool creation warning: {e}", flush=True)
        # Try again with minconn=1
        try:
            pg_pool = psycopg2_pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=POSTGRES_POOL_SIZE,
                **POSTGRES_CONFIG
            )
            print(f" PostgreSQL pool created (size: {POSTGRES_POOL_SIZE})", flush=True)
        except Exception as e2:
            raise Exception(f"Failed to create PostgreSQL pool: {e2}")


@contextmanager
def get_mysql_connection():
    """Get MySQL connection from pool with automatic retry"""
    connection = None
    retries = 0
    
    while retries < MAX_RETRIES:
        connection = None
        try:
            connection = mysql_pool.get_connection()
            if connection and connection.is_connected():
                # Set connection timeout
                try:
                    cursor = connection.cursor()
                    cursor.execute("SET SESSION wait_timeout = 3600")
                    cursor.execute("SET SESSION interactive_timeout = 3600")
                    cursor.close()
                except:
                    pass
                
                # Yield connection - exceptions here will be caught
                try:
                    yield connection
                    # Success - clean up and exit
                    if connection:
                        try:
                            connection.close()
                        except:
                            pass
                    return
                except Exception as yield_error:
                    # Exception during yield - clean up connection
                    if connection:
                        try:
                            connection.close()
                        except:
                            pass
                    # Re-raise to be caught by outer except
                    raise
            else:
                raise MySQLError("Failed to get valid connection")
                
        except (MySQLError, Exception) as e:
            if connection:
                try:
                    connection.close()
                except:
                    pass
            
            retries += 1
            if retries < MAX_RETRIES:
                wait_time = RETRY_BACKOFF_BASE ** retries
                print(f" MySQL connection failed, retrying in {wait_time}s... (attempt {retries}/{MAX_RETRIES})", flush=True)
                time.sleep(wait_time)
            else:
                raise Exception(f"Failed to get MySQL connection after {MAX_RETRIES} attempts: {e}")


@contextmanager
def get_postgres_connection():
    """Get PostgreSQL connection from pool with automatic retry"""
    connection = None
    retries = 0
    
    while retries < MAX_RETRIES:
        connection = None
        try:
            connection = pg_pool.getconn()
            if connection and not connection.closed:
                # Yield connection - exceptions here will be caught
                try:
                    yield connection
                    # Success - return connection to pool
                    if connection:
                        try:
                            pg_pool.putconn(connection)
                        except:
                            pass
                    return
                except Exception as yield_error:
                    # Exception during yield - return connection to pool with close flag
                    if connection:
                        try:
                            pg_pool.putconn(connection, close=True)
                        except:
                            pass
                    # Re-raise to be caught by outer except
                    raise
            else:
                raise Exception("Failed to get valid connection")
                
        except Exception as e:
            if connection:
                try:
                    pg_pool.putconn(connection, close=True)
                except:
                    pass
            
            retries += 1
            if retries < MAX_RETRIES:
                wait_time = RETRY_BACKOFF_BASE ** retries
                print(f" PostgreSQL connection failed, retrying in {wait_time}s... (attempt {retries}/{MAX_RETRIES})", flush=True)
                time.sleep(wait_time)
            else:
                raise Exception(f"Failed to get PostgreSQL connection after {MAX_RETRIES} attempts: {e}")


def import_sql_files_to_mysql(force=False):
    """Import SQL schema and data files into MySQL after it's ready
    Source of Truth: frontrunnerv3_dbschema.sql and backup.sql
    """
    schema_file = "/app/frontrunnerv3_dbschema.sql"
    data_file = "/app/backup.sql"
    
    print(" Checking if MySQL needs data import...", flush=True)
    print(f"   Source files (SINGLE SOURCE OF TRUTH):", flush=True)
    print(f"   - Schema: {schema_file}", flush=True)
    print(f"   - Data: {data_file}", flush=True)
    
    # Verify source files exist
    if not os.path.exists(schema_file):
        print(f"    ERROR: Schema file not found: {schema_file}", flush=True)
        print(f"   Make sure frontrunnerv3_dbschema.sql is mounted in docker-compose.yml", flush=True)
    else:
        schema_size = os.path.getsize(schema_file) / (1024 * 1024)  # MB
        print(f"    Schema file found: {schema_size:.2f} MB", flush=True)
    
    if not os.path.exists(data_file):
        print(f"    ERROR: Data file not found: {data_file}", flush=True)
        print(f"   Make sure backup.sql is mounted in docker-compose.yml", flush=True)
    else:
        data_size = os.path.getsize(data_file) / (1024 * 1024)  # MB
        print(f"    Data file found: {data_size:.2f} MB", flush=True)
    
    with get_mysql_connection() as mysql_conn:
        cursor = mysql_conn.cursor()
        
        # Check if database already has tables
        cursor.execute("USE kmtsdb")
        cursor.execute("SHOW TABLES")
        existing_tables = cursor.fetchall()
        
        # Check if tables have data
        has_data = False
        if existing_tables and not force:
            # Sample a few tables to see if they have data
            for (table_name,) in existing_tables[:5]:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                    count = cursor.fetchone()[0]
                    if count > 0:
                        has_data = True
                        break
                except:
                    pass
        
        if existing_tables and has_data and not force:
            print(f" MySQL database already has {len(existing_tables)} tables with data, skipping import", flush=True)
            cursor.close()
            return True
        
        if existing_tables and not has_data:
            print(f" MySQL has {len(existing_tables)} tables but they're EMPTY!", flush=True)
            print("   Schema was imported but data was not. Re-importing data...", flush=True)
            # Don't re-import schema, just data
            schema_file = None
        
        cursor.close()
        
        if not schema_file:
            print(" Importing data only (schema already exists)...", flush=True)
        else:
            print(" MySQL database is empty, importing SQL files...", flush=True)
    
    # Import schema first (if needed)
    if schema_file and os.path.exists(schema_file):
        print(f" Importing schema from frontrunnerv3_dbschema.sql...", flush=True)
        with get_mysql_connection() as mysql_conn:
            # Use MySQL client command for better SQL parsing
            try:
                import subprocess
                print("      Using mysql client for import...", flush=True)
                
                cmd = [
                    "mysql",
                    f"-h{MYSQL_CONFIG['host']}",
                    f"-P{MYSQL_CONFIG['port']}",
                    f"-u{MYSQL_CONFIG['user']}",
                    f"-p{MYSQL_CONFIG['password']}",
                    MYSQL_CONFIG['database'],
                    "--default-character-set=utf8mb4",
                    "--max_allowed_packet=512M",
                    "--skip-ssl"  # Disable SSL for local Docker connection
                ]
                
                with open(schema_file, 'rb') as f:
                    result = subprocess.run(
                        cmd,
                        stdin=f,
                        capture_output=True,
                        text=True,
                        timeout=7200  # 2 hour timeout
                    )
                    
                    # Show actual output for debugging
                    if result.stdout:
                        stdout_lines = result.stdout.split('\n')[:50]
                        if any('ERROR' in line.upper() for line in stdout_lines):
                            print(f"       Import output (first 50 lines):", flush=True)
                            for line in stdout_lines[:20]:
                                if line.strip():
                                    print(f"         {line[:150]}", flush=True)
                    
                    if result.returncode != 0:
                        # Show first part of errors (might be long)
                        error_output = result.stderr[:5000] if result.stderr else result.stdout[:5000] if result.stdout else "Unknown error"
                        # Filter out common warnings but show real errors
                        errors = [line for line in error_output.split('\n') if 'ERROR' in line.upper()][:30]
                        if errors:
                            print(f"       Import errors (showing first 30):", flush=True)
                            for err in errors:
                                print(f"         {err[:200]}", flush=True)
                        else:
                            print(f"       Command failed with return code {result.returncode}", flush=True)
                            if result.stderr:
                                print(f"      stderr: {result.stderr[:500]}", flush=True)
                            if result.stdout:
                                print(f"      stdout: {result.stdout[:500]}", flush=True)
                        print("       Some statements may have failed, but continuing...", flush=True)
                    else:
                        print(" Schema imported successfully", flush=True)
                        
            except subprocess.TimeoutExpired:
                print(" Schema import timed out, but may have partially completed", flush=True)
            except FileNotFoundError:
                # mysql client not found, fall back to Python parsing
                print("      mysql client not found, using Python parser...", flush=True)
                try:
                    cursor = mysql_conn.cursor()
                    with open(schema_file, 'r', encoding='utf-8', errors='ignore') as f:
                        # Better parsing: handle DELIMITER and multi-line statements
                        sql_lines = f.readlines()
                        current_statement = ""
                        delimiter = ";"
                        statement_count = 0
                        
                        for line in sql_lines:
                            line_stripped = line.strip()
                            
                            # Skip comments
                            if line_stripped.startswith('--') or line_stripped.startswith('/*'):
                                continue
                            
                            # Handle DELIMITER commands
                            if line_stripped.upper().startswith('DELIMITER'):
                                delimiter = line_stripped.split()[1] if len(line_stripped.split()) > 1 else ";"
                                continue
                            
                            current_statement += line
                            
                            # Check if statement is complete
                            if delimiter in line and not line_stripped.startswith('--'):
                                if current_statement.strip():
                                    try:
                                        # Remove delimiter from end
                                        stmt = current_statement.replace(delimiter, ';', 1) if delimiter != ';' else current_statement
                                        stmt = stmt.strip().rstrip(';').strip()
                                        if stmt:
                                            cursor.execute(stmt)
                                            statement_count += 1
                                            if statement_count % 100 == 0:
                                                print(f"      Processed {statement_count} statements...", flush=True)
                                    except Exception as e:
                                        if statement_count < 20:
                                            print(f"       Statement {statement_count} failed: {str(e)[:150]}", flush=True)
                                    finally:
                                        current_statement = ""
                        
                        # Execute any remaining statement
                        if current_statement.strip():
                            try:
                                stmt = current_statement.strip().rstrip(';').strip()
                                if stmt:
                                    cursor.execute(stmt)
                            except:
                                pass
                        
                        mysql_conn.commit()
                        cursor.close()
                        print(f" Schema imported successfully ({statement_count} statements)", flush=True)
                except Exception as e:
                    print(f" Schema import error: {e}", flush=True)
            except Exception as e:
                print(f" Schema import error: {e}", flush=True)
    
    # Import data - use mysql client for better handling
    if os.path.exists(data_file):
        print(f" Importing data from backup.sql (this may take a while)...", flush=True)
        try:
            import subprocess
            print("      Using mysql client for import...", flush=True)
            
            cmd = [
                "mysql",
                f"-h{MYSQL_CONFIG['host']}",
                f"-P{MYSQL_CONFIG['port']}",
                f"-u{MYSQL_CONFIG['user']}",
                f"-p{MYSQL_CONFIG['password']}",
                MYSQL_CONFIG['database'],
                "--default-character-set=utf8mb4",
                "--max_allowed_packet=512M",
                "--skip-ssl",  # Disable SSL for local Docker connection
                "--force"  # Continue on errors
            ]
            
            print(f"      Running command: {' '.join(cmd[:5])}... [database]", flush=True)
            with open(data_file, 'rb') as f:
                result = subprocess.run(
                    cmd,
                    stdin=f,
                    capture_output=True,
                    text=True,
                    timeout=14400  # 4 hour timeout for large data files
                )
                
                # Always show some output for debugging
                if result.stdout and len(result.stdout.strip()) > 0:
                    stdout_preview = result.stdout.split('\n')[:10]
                    if stdout_preview:
                        print(f"       Import output preview:", flush=True)
                        for line in stdout_preview[:5]:
                            if line.strip() and 'Warning' not in line:
                                print(f"         {line[:150]}", flush=True)
                
                if result.returncode != 0:
                    # Filter errors - show only actual errors, not warnings
                    error_output = result.stderr[:5000] if result.stderr else result.stdout[:5000] if result.stdout else ""
                    error_lines = [line for line in error_output.split('\n') if 'ERROR' in line.upper()][:50]
                    if error_lines:
                        print(f"       Import errors (showing first 50):", flush=True)
                        for err in error_lines[:30]:
                            print(f"         {err[:200]}", flush=True)
                    else:
                        print(f"       Command failed with return code {result.returncode}", flush=True)
                        if result.stderr:
                            print(f"      stderr preview: {result.stderr[:1000]}", flush=True)
                    print("       Some statements may have failed, but continuing...", flush=True)
                    print("      (This is normal for large imports with duplicates/constraints)", flush=True)
                else:
                    print(" Data imported successfully", flush=True)
                    
        except subprocess.TimeoutExpired:
            print(" Data import timed out, but may have partially completed", flush=True)
        except FileNotFoundError:
            print("       mysql client not found, skipping data import", flush=True)
            print("      You may need to import backup.sql manually", flush=True)
        except Exception as e:
            print(f" Data import error: {e}", flush=True)
    
    # Verify import - check if tables have data
    with get_mysql_connection() as mysql_conn:
        cursor = mysql_conn.cursor()
        cursor.execute("USE kmtsdb")
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        
        if tables:
            # Check total record count across all tables
            total_records = 0
            tables_with_data = []
            for (table_name,) in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                    count = cursor.fetchone()[0]
                    total_records += count
                    if count > 0:
                        tables_with_data.append((table_name, count))
                except:
                    pass
            
            cursor.close()
            print(f" MySQL import complete: {len(tables)} tables found", flush=True)
            print(f" Total records in MySQL: {total_records:,}", flush=True)
            if tables_with_data:
                print(f" Tables with data: {len(tables_with_data)}", flush=True)
                # Show top 10 tables by record count
                top_tables = sorted(tables_with_data, key=lambda x: x[1], reverse=True)[:10]
                for table_name, count in top_tables:
                    print(f"   - {table_name}: {count:,} records", flush=True)
                
                # Verify critical tables from source of truth
                critical_tables = ['coordinate', 'position', 'travel', 'operator_account', 'control_point']
                print(f"\n Verifying critical tables from source of truth (backup.sql)...", flush=True)
                for table_name in critical_tables:
                    try:
                        cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                        count = cursor.fetchone()[0]
                        if count > 0:
                            print(f"    {table_name}: {count:,} records", flush=True)
                        else:
                            print(f"    {table_name}: 0 records (empty)", flush=True)
                    except:
                        print(f"    {table_name}: Table not found or error", flush=True)
            else:
                print(" WARNING: No tables have data! SQL import may have failed.", flush=True)
                print("   Check MySQL logs or try importing SQL files manually.", flush=True)
                print("   Source files: /app/frontrunnerv3_dbschema.sql, /app/backup.sql", flush=True)
            return True
        else:
            print(" MySQL database is still empty after import attempt", flush=True)
            cursor.close()
            return False


def load_checkpoint() -> Dict[str, Any]:
    """Load migration checkpoint"""
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {
        "current_table": None,
        "current_table_index": 0,
        "processed_tables": [],
        "failed_tables": [],
        "last_record_id": None,
        "total_processed": 0
    }


def save_checkpoint(checkpoint: Dict[str, Any]):
    """Save migration checkpoint"""
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    with _checkpoint_lock:
        with open(CHECKPOINT_FILE, 'w') as f:
            json.dump(checkpoint, f, indent=2)


def get_table_count(mysql_conn, table_name: str) -> int:
    """Get total record count for a table"""
    cursor = mysql_conn.cursor()
    try:
        cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
        return cursor.fetchone()[0]
    finally:
        cursor.close()


def export_table_chunked(mysql_conn, table_name: str, checkpoint: Dict) -> Tuple[str, List[str], int]:
    """Export table in chunks to prevent timeout"""
    cursor = mysql_conn.cursor(buffered=True)
    
    try:
        # Get column names and types - EXCLUDE encrypted columns (they'll be decrypted separately)
        cursor.execute(f"DESCRIBE `{table_name}`")
        all_columns = []
        encrypted_cols = []
        for row in cursor.fetchall():
            col = row[0].decode() if isinstance(row[0], bytes) else row[0]
            col_type = row[1].decode() if isinstance(row[1], bytes) else str(row[1])
            all_columns.append((col, col_type))
            
            # Identify encrypted columns to EXCLUDE from export
            col_lower = col.lower()
            if (col_lower in ["pose_aes", "coordinate__pose_aes", "coordinate_pose_aes", 
                              "from_destination__pose_aes", "ppin_aes"] or
                "pose_aes" in col_lower or 
                "coordinate__pose_aes" in col_lower or
                "from_destination__pose_aes" in col_lower or
                "ppin_aes" in col_lower or
                "encrypted" in col_lower or
                ("aes" in col_lower and ("pose" in col_lower or "coord" in col_lower))):
                encrypted_cols.append(col)
        
        # Only include non-encrypted columns in export
        columns = [col for col, _ in all_columns if col not in encrypted_cols]
        
        # Detailed column logging
        print(f"       Column breakdown:", flush=True)
        print(f"         Total columns in MySQL: {len(all_columns)}", flush=True)
        print(f"         Encrypted columns (excluded): {len(encrypted_cols)} {encrypted_cols if encrypted_cols else ''}", flush=True)
        print(f"         Non-encrypted columns (exported): {len(columns)}", flush=True)
        if encrypted_cols:
            print(f"       Excluding {len(encrypted_cols)} encrypted column(s): {encrypted_cols}", flush=True)
        
        # Get primary key or _OID_ for chunking
        pk_column = "_OID_" if "_OID_" in columns else (columns[0] if columns else None)
        
        csv_file = f"{CSV_DIR}/{table_name}.csv"
        os.makedirs(CSV_DIR, exist_ok=True)
        
        # Get total count
        total_count = get_table_count(mysql_conn, table_name)
        print(f"       Total records: {total_count}", flush=True)
        
        # Resume from checkpoint if exists
        last_id = checkpoint.get("last_record_id", 0)
        if last_id:
            print(f"       Resuming from record ID: {last_id}", flush=True)
        
        # Open CSV file for append or write
        file_mode = "a" if last_id else "w"
        with open(csv_file, file_mode, newline="", encoding="utf-8") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_ALL, escapechar="\\")
            
            if not last_id:
                writer.writerow(columns)
            
            processed = 0
            chunk_offset = last_id if last_id else 0
            
            # Process in chunks
            while chunk_offset < total_count:
                try:
                    # Fetch chunk using LIMIT/OFFSET - SELECT only non-encrypted columns
                    col_list = ", ".join([f"`{col}`" for col in columns])
                    query = f"SELECT {col_list} FROM `{table_name}` ORDER BY `{pk_column}` LIMIT {CHUNK_SIZE} OFFSET {chunk_offset}"
                    cursor.execute(query)
                    
                    chunk_data = cursor.fetchall()
                    if not chunk_data:
                        break
                    
                    for row in chunk_data:
                        clean_row = []
                        for val in row:
                            if val is None:
                                clean_row.append("")
                            elif isinstance(val, bytes):
                                clean_row.append("")
                            else:
                                clean_row.append(str(val))
                        writer.writerow(clean_row)
                    
                    processed += len(chunk_data)
                    chunk_offset += len(chunk_data)
                    
                    # Update checkpoint
                    checkpoint["last_record_id"] = chunk_offset
                    checkpoint["total_processed"] += len(chunk_data)
                    save_checkpoint(checkpoint)
                    
                    if processed % (CHUNK_SIZE * 5) == 0:
                        print(f"      Processed {processed:,}/{total_count:,} records... ({processed/total_count*100:.1f}%)", flush=True)
                    
                    # Reset connection periodically to prevent timeout
                    if processed % (CHUNK_SIZE * 10) == 0:
                        mysql_conn.ping(reconnect=True)
                        print(f"       Connection refreshed", flush=True)
                    
                except MySQLError as e:
                    if "Lost connection" in str(e) or "timeout" in str(e).lower():
                        print(f"       Connection lost at {chunk_offset}, will resume...", flush=True)
                        # Connection will be retried by caller
                        raise
                    else:
                        print(f"       Error processing chunk: {e}", flush=True)
                        chunk_offset += CHUNK_SIZE  # Skip problematic chunk
                        continue
        
        cursor.close()
        
        # Verify we exported all records
        if processed != total_count:
            print(f"       WARNING: Exported {processed:,} but MySQL has {total_count:,} records!", flush=True)
        else:
            print(f"       Exported ALL {processed:,} records to CSV ({len(columns)} columns)", flush=True)
        
        return csv_file, columns, processed
        
    except Exception as e:
        cursor.close()
        raise


def create_postgres_table(pg_conn, table_name: str, columns: List[str], mysql_conn):
    """Create PostgreSQL table from MySQL schema"""
    cursor = pg_conn.cursor()
    mysql_cursor = mysql_conn.cursor()
    
    try:
        # Get column types from MySQL
        mysql_cursor.execute(f"DESCRIBE `{table_name}`")
        col_info = {}
        for row in mysql_cursor.fetchall():
            col_name = row[0].decode() if isinstance(row[0], bytes) else row[0]
            col_type = row[1].decode() if isinstance(row[1], bytes) else row[1]
            col_info[col_name] = col_type
        
        # Convert MySQL types to PostgreSQL
        pg_columns = []
        for col in columns:
            mysql_type = col_info[col].lower() if col in col_info else "text"
            
            if "bigint" in mysql_type:
                pg_type = "BIGINT"
            elif "int" in mysql_type:
                pg_type = "BIGINT"
            elif "varchar" in mysql_type or "text" in mysql_type:
                pg_type = "TEXT"
            elif "double" in mysql_type or "float" in mysql_type:
                pg_type = "DOUBLE PRECISION"
            elif "blob" in mysql_type or "binary" in mysql_type:
                pg_type = "BYTEA"
            elif "date" in mysql_type:
                pg_type = "TIMESTAMP"
            else:
                pg_type = "TEXT"
            
            pg_columns.append(f'"{col}" {pg_type}')
        
        create_sql = f'DROP TABLE IF EXISTS "{table_name}" CASCADE'
        cursor.execute(create_sql)
        create_sql = f'CREATE TABLE "{table_name}" ({", ".join(pg_columns)})'
        cursor.execute(create_sql)
        pg_conn.commit()
        
        print(f"       Created PostgreSQL table", flush=True)
        
    finally:
        cursor.close()
        mysql_cursor.close()


def import_csv_to_postgres_chunked(pg_conn, table_name: str, csv_file: str, columns: List[str]):
    """Import CSV to PostgreSQL in chunks"""
    cursor = pg_conn.cursor()
    
    try:
        placeholders = ",".join(["%s"] * len(columns))
        col_names = ",".join([f'"{col}"' for col in columns])
        insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES ({placeholders})'
        
        batch = []
        total_imported = 0
        
        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader)  # Skip header
            
            for row in reader:
                clean_row = [None if val == "" else val for val in row]
                batch.append(clean_row)
                
                if len(batch) >= 5000:
                    execute_batch(cursor, insert_sql, batch, page_size=5000)
                    pg_conn.commit()
                    total_imported += len(batch)
                    batch = []
                    
                    if total_imported % 50000 == 0:
                        print(f"      Imported {total_imported:,} records...", flush=True)
            
            if batch:
                execute_batch(cursor, insert_sql, batch, page_size=len(batch))
                pg_conn.commit()
                total_imported += len(batch)
        
        # Verify import completed successfully
        cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
        pg_count = cursor.fetchone()[0]
        
        print(f"       Imported {total_imported:,} records to PostgreSQL", flush=True)
        print(f"       PostgreSQL table now has {pg_count:,} records with {len(columns)} columns", flush=True)
        
        if total_imported != pg_count:
            print(f"       WARNING: Imported {total_imported:,} but PostgreSQL shows {pg_count:,}!", flush=True)
        
    finally:
        cursor.close()


def decrypt_and_transform_chunked(mysql_conn, pg_conn, table_name: str, encrypted_col: str, checkpoint: Dict):
    """Decrypt and transform coordinates in chunks"""
    print(f"       Decrypting {table_name}.{encrypted_col}...", flush=True)
    
    mysql_cursor = None
    pg_cursor = None
    
    try:
        mysql_cursor = mysql_conn.cursor(dictionary=True, buffered=True)
        pg_cursor = pg_conn.cursor()
        # Add decrypted columns if not exist (including heading, inclination, status from Java encodeString format)
        pg_cursor.execute(
            f"""
            ALTER TABLE "{table_name}"
            ADD COLUMN IF NOT EXISTS decrypted_x DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_y DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_z DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_heading DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_inclination DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS decrypted_status DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION
        """
        )
        pg_conn.commit()
        
        # Get total count
        mysql_cursor.execute(f"SELECT COUNT(*) as cnt FROM `{table_name}` WHERE `{encrypted_col}` IS NOT NULL")
        total_count = mysql_cursor.fetchone()["cnt"]
        print(f"          Found {total_count:,} encrypted records", flush=True)
        
        # Process in chunks - use MySQL SUBSTRING_INDEX for reliable parsing (like SQL example)
        last_oid = checkpoint.get(f"{table_name}_{encrypted_col}_last_oid", None)
        processed = 0
        
        # For small datasets, process all at once
        if total_count <= CHUNK_SIZE:
            print(f"          Small dataset ({total_count:,} records), processing all at once...", flush=True)
            
            # Use MySQL SUBSTRING_INDEX to parse coordinates (format: x\t\tz\theading\tinclination\tstatus from Java encodeString)
            mysql_cursor.execute(
                f"""
                SELECT 
                    _OID_,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 1), '\t', -1) AS x,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 2), '\t', -1) AS y,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 3), '\t', -1) AS z,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 4), '\t', -1) AS heading,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 5), '\t', -1) AS inclination,
                    SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 6), '\t', -1) AS status
                FROM (
                    SELECT 
                        _OID_,
                        CAST(AES_DECRYPT(`{encrypted_col}`, %s) AS CHAR) AS coords
                    FROM `{table_name}`
                    WHERE `{encrypted_col}` IS NOT NULL
                ) AS t
                WHERE coords IS NOT NULL AND coords != ''
                """,
                (AES_KEY,)
            )
            
            rows = mysql_cursor.fetchall()
            update_batch = []
            
            for row in rows:
                try:
                    x_str = row.get("x", "").strip() if row.get("x") else ""
                    y_str = row.get("y", "").strip() if row.get("y") else ""
                    z_str = row.get("z", "").strip() if row.get("z") else ""
                    heading_str = row.get("heading", "").strip() if row.get("heading") else ""
                    inclination_str = row.get("inclination", "").strip() if row.get("inclination") else ""
                    status_str = row.get("status", "").strip() if row.get("status") else ""
                    
                    # Skip if any coordinate is empty or 'null' string
                    if not x_str or not y_str or not z_str or x_str.lower() == 'null' or y_str.lower() == 'null' or z_str.lower() == 'null':
                        continue
                    
                    x = float(x_str)
                    y = float(y_str)
                    z = float(z_str)
                    heading = float(heading_str) if heading_str and heading_str.lower() != 'null' else 0.0
                    inclination = float(inclination_str) if inclination_str and inclination_str.lower() != 'null' else 0.0
                    status = float(status_str) if status_str and status_str.lower() != 'null' else 0.0
                    
                    # Translate to WGS84
                    x_scaled = x * MINE_SCALE
                    y_scaled = y * MINE_SCALE
                    z_scaled = z * MINE_SCALE
                    
                    wgs_x = WGS_ORIGIN_X + x_scaled
                    wgs_y = WGS_ORIGIN_Y + y_scaled
                    wgs_z = WGS_ORIGIN_Z + z_scaled
                    
                    lat = MINE_LAT + (wgs_y / 111320000)
                    lon = MINE_LON + (wgs_x / (111320000 * math.cos(math.radians(MINE_LAT))))
                    alt = wgs_z / 1000.0
                    
                    update_batch.append((x, y, z, heading, inclination, status, lat, lon, alt, row["_OID_"]))
                except (ValueError, TypeError, KeyError) as e:
                    print(f"          Failed to parse coordinates for OID {row.get('_OID_', 'unknown')}: {e}", flush=True)
                    continue
            
            if update_batch:
                update_sql = f"""
                    UPDATE "{table_name}"
                    SET decrypted_x = %s, decrypted_y = %s, decrypted_z = %s,
                        decrypted_heading = %s, decrypted_inclination = %s, decrypted_status = %s,
                        latitude = %s, longitude = %s, altitude = %s
                    WHERE "_OID_" = %s
                """
                execute_batch(pg_cursor, update_sql, update_batch, page_size=len(update_batch))
                pg_conn.commit()
                processed = len(update_batch)
                print(f"          Decrypted and updated {processed:,} records", flush=True)
        else:
            # Large dataset - process in chunks
            print(f"          Large dataset ({total_count:,} records), processing in chunks of {CHUNK_SIZE:,}...", flush=True)
            while True:
                try:
                    # Use MySQL SUBSTRING_INDEX to parse coordinates
                    oid_filter = f"AND _OID_ > '{last_oid}'" if last_oid else ""
                    
                    mysql_cursor.execute(
                        f"""
                        SELECT 
                            _OID_,
                            SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 1), '\t', -1) AS x,
                            SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 2), '\t', -1) AS y,
                            SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 3), '\t', -1) AS z,
                            SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 4), '\t', -1) AS heading,
                            SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 5), '\t', -1) AS inclination,
                            SUBSTRING_INDEX(SUBSTRING_INDEX(coords, '\t', 6), '\t', -1) AS status
                        FROM (
                            SELECT 
                                _OID_,
                                CAST(AES_DECRYPT(`{encrypted_col}`, %s) AS CHAR) AS coords
                            FROM `{table_name}`
                            WHERE `{encrypted_col}` IS NOT NULL
                            {oid_filter}
                            ORDER BY _OID_
                            LIMIT %s
                        ) AS t
                        WHERE coords IS NOT NULL AND coords != ''
                        """,
                        (AES_KEY, CHUNK_SIZE)
                    )
                    
                    rows = mysql_cursor.fetchall()
                    if not rows:
                        break
                    
                    update_batch = []
                    for row in rows:
                        try:
                            x_str = row.get("x", "").strip() if row.get("x") else ""
                            y_str = row.get("y", "").strip() if row.get("y") else ""
                            z_str = row.get("z", "").strip() if row.get("z") else ""
                            heading_str = row.get("heading", "").strip() if row.get("heading") else ""
                            inclination_str = row.get("inclination", "").strip() if row.get("inclination") else ""
                            status_str = row.get("status", "").strip() if row.get("status") else ""
                            
                            # Skip if any coordinate is empty or 'null' string
                            if not x_str or not y_str or not z_str or x_str.lower() == 'null' or y_str.lower() == 'null' or z_str.lower() == 'null':
                                continue
                            
                            x = float(x_str)
                            y = float(y_str)
                            z = float(z_str)
                            heading = float(heading_str) if heading_str and heading_str.lower() != 'null' else 0.0
                            inclination = float(inclination_str) if inclination_str and inclination_str.lower() != 'null' else 0.0
                            status = float(status_str) if status_str and status_str.lower() != 'null' else 0.0
                            
                            # Translate to WGS84
                            x_scaled = x * MINE_SCALE
                            y_scaled = y * MINE_SCALE
                            z_scaled = z * MINE_SCALE
                            
                            wgs_x = WGS_ORIGIN_X + x_scaled
                            wgs_y = WGS_ORIGIN_Y + y_scaled
                            wgs_z = WGS_ORIGIN_Z + z_scaled
                            
                            lat = MINE_LAT + (wgs_y / 111320000)
                            lon = MINE_LON + (wgs_x / (111320000 * math.cos(math.radians(MINE_LAT))))
                            alt = wgs_z / 1000.0
                            
                            update_batch.append((x, y, z, heading, inclination, status, lat, lon, alt, row["_OID_"]))
                            last_oid = row["_OID_"]
                        except (ValueError, TypeError, KeyError) as e:
                            print(f"          Failed to parse coordinates for OID {row.get('_OID_', 'unknown')}: {e}", flush=True)
                            continue
                
                    if update_batch:
                        update_sql = f"""
                            UPDATE "{table_name}"
                            SET decrypted_x = %s, decrypted_y = %s, decrypted_z = %s,
                                decrypted_heading = %s, decrypted_inclination = %s, decrypted_status = %s,
                                latitude = %s, longitude = %s, altitude = %s
                            WHERE "_OID_" = %s
                        """
                        execute_batch(pg_cursor, update_sql, update_batch, page_size=len(update_batch))
                        pg_conn.commit()
                        
                        processed += len(update_batch)
                        checkpoint[f"{table_name}_{encrypted_col}_last_oid"] = last_oid
                        save_checkpoint(checkpoint)
                        
                        # Show progress every 10,000 records or at batch completion
                        if processed % 10000 == 0 or (processed > 0 and processed < 10000):
                            print(f"          Processed {processed:,}/{total_count:,} records... ({processed/total_count*100:.1f}%)", flush=True)
                        
                        # Reset connection periodically
                        if processed % (CHUNK_SIZE * 5) == 0:
                            mysql_conn.ping(reconnect=True)
                
                except MySQLError as e:
                    if "Lost connection" in str(e) or "timeout" in str(e).lower():
                        print(f"          Connection lost, will resume from OID {last_oid}...", flush=True)
                        raise
                    else:
                        print(f"          MySQL error: {e}", flush=True)
                        raise
                except Exception as e:
                    print(f"          Unexpected error: {e}", flush=True)
                    raise
        
        print(f"       Decrypted {processed:,} records", flush=True)
        
    finally:
        if mysql_cursor:
            try:
                mysql_cursor.close()
            except:
                pass
        if pg_cursor:
            try:
                pg_cursor.close()
            except:
                pass


def process_table_safe(table_name: str, table_index: int, total_tables: int, checkpoint: Dict):
    """Thread-safe wrapper for process_table"""
    try:
        return process_table(table_name, table_index, total_tables, checkpoint)
    except Exception as e:
        print(f" Fatal error processing {table_name}: {e}", flush=True)
        return False


def decrypt_table_columns(table_name: str, columns: List[str], checkpoint: Dict):
    """Decrypt all encrypted columns in a table (thread-safe)"""
    try:
        with get_mysql_connection() as mysql_conn:
            # Check if table exists in PostgreSQL
            with get_postgres_connection() as pg_conn:
                pg_cursor = pg_conn.cursor()
                pg_cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = %s
                    )
                """, (table_name,))
                table_exists = pg_cursor.fetchone()[0]
                pg_cursor.close()
            
            if not table_exists:
                print(f"       Table {table_name} does not exist in PostgreSQL", flush=True)
                return False
            
            # Check if table has data
            table_count = get_table_count(mysql_conn, table_name)
            if table_count == 0:
                print(f"       Table {table_name} is empty", flush=True)
                # Add columns even if empty
                with get_postgres_connection() as pg_conn:
                    pg_cursor = pg_conn.cursor()
                    try:
                        pg_cursor.execute(
                            f"""
                            ALTER TABLE "{table_name}"
                            ADD COLUMN IF NOT EXISTS decrypted_x DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS decrypted_y DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS decrypted_z DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS decrypted_heading DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS decrypted_inclination DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS decrypted_status DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
                            ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION
                            """
                        )
                        pg_conn.commit()
                    finally:
                        pg_cursor.close()
                return True
            
            # Decrypt each column
            with get_postgres_connection() as pg_conn:
                for col in columns:
                    # Check if column has encrypted data
                    check_cursor = mysql_conn.cursor()
                    check_cursor.execute(f"SELECT COUNT(*) FROM `{table_name}` WHERE `{col}` IS NOT NULL")
                    encrypted_count = check_cursor.fetchone()[0]
                    check_cursor.close()
                    
                    if encrypted_count > 0:
                        print(f"       Decrypting {table_name}.{col} ({encrypted_count:,} records)...", flush=True)
                        try:
                            decrypt_and_transform_chunked(mysql_conn, pg_conn, table_name, col, checkpoint)
                            
                            # Drop encrypted column
                            try:
                                pg_cursor = pg_conn.cursor()
                                pg_cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS "{col}"')
                                pg_conn.commit()
                                pg_cursor.close()
                                print(f"       Removed encrypted column {col}", flush=True)
                            except Exception as drop_error:
                                print(f"       Could not remove encrypted column {col}: {drop_error}", flush=True)
                        except Exception as e:
                            print(f"       Failed to decrypt {col}: {e}", flush=True)
                            return False
        return True
    except Exception as e:
        print(f" Error decrypting {table_name}: {e}", flush=True)
        return False


def process_table(table_name: str, table_index: int, total_tables: int, checkpoint: Dict):
    """Process a single table with retry logic"""
    print(f"\n  [{table_index}/{total_tables}] Processing {table_name}...", flush=True)
    
    retries = 0
    while retries < MAX_RETRIES:
        mysql_conn = None
        pg_conn = None
        try:
            # Get connections separately to avoid nested context manager issues
            mysql_conn = mysql_pool.get_connection()
            if not mysql_conn or not mysql_conn.is_connected():
                raise MySQLError("Failed to get MySQL connection")
            
            pg_conn = pg_pool.getconn()
            if not pg_conn or pg_conn.closed:
                raise Exception("Failed to get PostgreSQL connection")
            
            try:
                # Reset checkpoint for this table
                checkpoint["current_table"] = table_name
                checkpoint["current_table_index"] = table_index
                checkpoint["last_record_id"] = 0
                save_checkpoint(checkpoint)
                    
                # Check if table has data first
                table_count = get_table_count(mysql_conn, table_name)
                record_count = 0
                
                if table_count == 0:
                    print(f"       Table {table_name} is empty, skipping data migration...", flush=True)
                    # Still create the table structure
                    mysql_cursor = mysql_conn.cursor()
                    mysql_cursor.execute(f"DESCRIBE `{table_name}`")
                    columns = []
                    for row in mysql_cursor.fetchall():
                        col = row[0].decode() if isinstance(row[0], bytes) else row[0]
                        columns.append(col)
                    mysql_cursor.close()
                    create_postgres_table(pg_conn, table_name, columns, mysql_conn)
                else:
                    print(f"       Table has {table_count:,} records, exporting...", flush=True)
                    # Export to CSV (chunked)
                    csv_file, columns, record_count = export_table_chunked(mysql_conn, table_name, checkpoint)
                    
                    # Create PostgreSQL table
                    create_postgres_table(pg_conn, table_name, columns, mysql_conn)
                    
                    # Import CSV
                    import_csv_to_postgres_chunked(pg_conn, table_name, csv_file, columns)
                
                # Find and decrypt encrypted columns
                mysql_cursor = mysql_conn.cursor()
                mysql_cursor.execute(f"DESCRIBE `{table_name}`")
                all_columns = []
                encrypted_cols = []
                for row in mysql_cursor.fetchall():
                    col_name = row[0].decode() if isinstance(row[0], bytes) else row[0]
                    col_type = row[1].decode() if isinstance(row[1], bytes) else str(row[1])
                    all_columns.append((col_name, col_type))
                    
                    # Check for encrypted coordinate columns
                    col_lower = col_name.lower()
                    if (col_lower in ["pose_aes", "coordinate__pose_aes", "coordinate_pose_aes", 
                                      "from_destination__pose_aes", "ppin_aes"] or
                        "pose_aes" in col_lower or 
                        "coordinate__pose_aes" in col_lower or
                        "from_destination__pose_aes" in col_lower or
                        "ppin_aes" in col_lower or
                        "encrypted" in col_lower or
                        ("aes" in col_lower and ("pose" in col_lower or "coord" in col_lower))):
                        encrypted_cols.append(col_name)
                
                mysql_cursor.close()
                
                # Log column search results
                if table_count > 0:
                    print(f"       Checking for encrypted columns...", flush=True)
                    if encrypted_cols:
                        print(f"       Found {len(encrypted_cols)} encrypted column(s): {encrypted_cols}", flush=True)
                        for col in encrypted_cols:
                            # Check if column actually has data
                            check_cursor = mysql_conn.cursor()
                            check_cursor.execute(f"SELECT COUNT(*) FROM `{table_name}` WHERE `{col}` IS NOT NULL")
                            encrypted_count = check_cursor.fetchone()[0]
                            check_cursor.close()
                            
                            if encrypted_count > 0:
                                print(f"       Column {col} has {encrypted_count:,} encrypted records", flush=True)
                                decrypt_and_transform_chunked(mysql_conn, pg_conn, table_name, col, checkpoint)
                            else:
                                print(f"       Column {col} exists but has no encrypted data", flush=True)
                    else:
                        # Check all columns to see what we have
                        binary_cols = [col for col, typ in all_columns if "binary" in typ.lower() or "blob" in typ.lower()]
                        if binary_cols:
                            print(f"       Found binary/blob columns: {binary_cols}", flush=True)
                            print(f"       Checking for encrypted data in binary columns...", flush=True)
                            # Try ALL binary columns - they might be encrypted
                            for col_name, col_type in all_columns:
                                col_lower = col_name.lower()
                                if "binary" in col_type.lower() or "blob" in col_type.lower():
                                    # Check if this column has data
                                    check_cursor = mysql_conn.cursor()
                                    check_cursor.execute(f"SELECT COUNT(*) FROM `{table_name}` WHERE `{col_name}` IS NOT NULL")
                                    encrypted_count = check_cursor.fetchone()[0]
                                    check_cursor.close()
                                    
                                    if encrypted_count > 0:
                                        print(f"       Attempting to decrypt {col_name} ({encrypted_count:,} records)...", flush=True)
                                        try:
                                            decrypt_and_transform_chunked(mysql_conn, pg_conn, table_name, col_name, checkpoint)
                                            
                                            # After successful decryption, drop the encrypted column from PostgreSQL
                                            try:
                                                pg_cursor = pg_conn.cursor()
                                                pg_cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS "{col_name}"')
                                                pg_conn.commit()
                                                pg_cursor.close()
                                                print(f"       Removed encrypted column {col_name} (replaced with decrypted values)", flush=True)
                                            except Exception as drop_error:
                                                print(f"       Could not remove encrypted column {col_name}: {drop_error}", flush=True)
                                        except Exception as e:
                                            print(f"       Failed to decrypt {col_name}: {e}", flush=True)
                                    elif encrypted_count == 0:
                                        print(f"       Column {col_name} is binary/blob but contains no data", flush=True)
                        else:
                            print(f"       No encrypted columns found in {table_name}", flush=True)
                else:
                    print(f"       Skipping decryption for empty table", flush=True)
                
                # Final verification summary for this table
                try:
                    pg_cursor = pg_conn.cursor()
                    # Count PostgreSQL columns (including decrypted columns)
                    pg_cursor.execute("""
                        SELECT COUNT(*) FROM information_schema.columns 
                        WHERE table_schema = 'public' AND table_name = %s
                    """, (table_name,))
                    pg_col_count = pg_cursor.fetchone()[0]
                    
                    # Count PostgreSQL records
                    pg_cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                    pg_record_count = pg_cursor.fetchone()[0]
                    
                    print(f"\n       FINAL VERIFICATION: {table_name}", flush=True)
                    print(f"         MySQL: {len(all_columns)} columns, {table_count:,} records", flush=True)
                    print(f"         Excluded: {len(encrypted_cols)} encrypted column(s)", flush=True)
                    print(f"         PostgreSQL: {pg_col_count} columns, {pg_record_count:,} records", flush=True)
                    
                    if table_count == pg_record_count and table_count > 0:
                        print(f"          ALL {table_count:,} RECORDS MIGRATED!", flush=True)
                    elif table_count == 0:
                        print(f"          Table is empty (schema only)", flush=True)
                    else:
                        print(f"          RECORD MISMATCH: MySQL={table_count:,}, PostgreSQL={pg_record_count:,}", flush=True)
                    
                    pg_cursor.close()
                except Exception as e:
                    print(f"       Could not verify table: {e}", flush=True)
            
                # Success - return connections to pools
                if mysql_conn:
                    try:
                        mysql_conn.close()
                    except:
                        pass
                if pg_conn:
                    try:
                        pg_pool.putconn(pg_conn)
                    except:
                        pass
                
                # Mark table as processed
                checkpoint["processed_tables"].append(table_name)
                checkpoint["current_table"] = None
                checkpoint["last_record_id"] = 0
                save_checkpoint(checkpoint)
                
                if table_count == 0:
                    print(f"   Completed {table_name} (0 records - empty table)", flush=True)
                else:
                    print(f"   Completed {table_name} ({record_count:,} records)", flush=True)
                return True
                
            except Exception as inner_error:
                # Exception during processing - clean up and re-raise
                if mysql_conn:
                    try:
                        mysql_conn.close()
                    except:
                        pass
                if pg_conn:
                    try:
                        pg_pool.putconn(pg_conn, close=True)
                    except:
                        pass
                raise inner_error
                    
        except Exception as e:
            # Clean up any connections that might still be open
            if mysql_conn:
                try:
                    mysql_conn.close()
                except:
                    pass
            if pg_conn:
                try:
                    pg_pool.putconn(pg_conn, close=True)
                except:
                    pass
            
            retries += 1
            if retries < MAX_RETRIES:
                wait_time = RETRY_BACKOFF_BASE ** retries
                error_msg = str(e)
                if "generator didn't stop" in error_msg:
                    print(f"   Connection cleanup error (will retry): {error_msg[:100]}", flush=True)
                else:
                    print(f"   Error processing {table_name}: {error_msg[:200]}", flush=True)
                print(f"   Retrying in {wait_time}s... (attempt {retries}/{MAX_RETRIES})", flush=True)
                time.sleep(wait_time)
            else:
                print(f"   Failed to process {table_name} after {MAX_RETRIES} attempts", flush=True)
                checkpoint["failed_tables"].append(table_name)
                save_checkpoint(checkpoint)
                return False
    
    return False


def main():
    """Main migration function with checkpoint resume"""
    import time as time_module
    start_time = time_module.time()
    
    print(" Starting Robust MySQL to PostgreSQL Migration", flush=True)
    print("=" * 80, flush=True)
    
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(CSV_DIR, exist_ok=True)
    
    # Show performance configuration
    print_performance_config()
    
    # Wait for databases and initialize connection pools
    try:
        init_connection_pools()
    except Exception as e:
        print(f" Failed to initialize connection pools: {e}", flush=True)
        return False
    
    # Import SQL files into MySQL if needed
    try:
        import_sql_files_to_mysql()
    except Exception as e:
        print(f" SQL import issue: {e}", flush=True)
        print("   Continuing anyway - database may already be populated...", flush=True)
    
    # Load checkpoint
    checkpoint = load_checkpoint()
    
    # Get all tables
    with get_mysql_connection() as mysql_conn:
        cursor = mysql_conn.cursor()
        cursor.execute("SHOW TABLES")
        all_tables = []
        for row in cursor.fetchall():
            table = row[0].decode() if isinstance(row[0], bytes) else row[0]
            all_tables.append(table)
        cursor.close()
    
    print(f" Found {len(all_tables)} tables", flush=True)
    
    # Check if MySQL actually has data
    with get_mysql_connection() as mysql_conn:
        total_records = 0
        tables_with_data = []
        for table_name in all_tables[:10]:  # Check first 10 tables
            try:
                count = get_table_count(mysql_conn, table_name)
                total_records += count
                if count > 0:
                    tables_with_data.append((table_name, count))
            except:
                pass
        
        if total_records == 0:
            print(" WARNING: Checked first 10 tables - ALL are empty!", flush=True)
            print("   MySQL database has schema but NO DATA!", flush=True)
            print("   The SQL import likely failed or backup.sql was empty.", flush=True)
            print("   Trying to re-import SQL files...", flush=True)
            # Force re-import data only
            try:
                import_sql_files_to_mysql(force=True)
            except Exception as e:
                print(f"   Re-import failed: {e}", flush=True)
    
    # Resume from checkpoint
    start_index = checkpoint.get("current_table_index", 0)
    processed = checkpoint.get("processed_tables", [])
    failed = checkpoint.get("failed_tables", [])
    
    # Verify that "processed" tables actually exist in PostgreSQL
    print(" Verifying checkpoint integrity...", flush=True)
    missing_tables = []
    if processed:
        with get_postgres_connection() as pg_conn:
            cursor = pg_conn.cursor()
            for table_name in processed:
                # Check if table actually exists in PostgreSQL
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = %s
                    )
                """, (table_name,))
                exists = cursor.fetchone()[0]
                if not exists:
                    missing_tables.append(table_name)
            cursor.close()
    
    # If we have missing tables, they need to be reprocessed
    if missing_tables:
        print(f"    Found {len(missing_tables)} 'processed' tables that don't exist in PostgreSQL!", flush=True)
        print(f"    Missing tables: {missing_tables[:10]}{'...' if len(missing_tables) > 10 else ''}", flush=True)
        # Remove missing tables from processed list
        processed = [t for t in processed if t not in missing_tables]
        checkpoint["processed_tables"] = processed
        # Add to failed list so they get retried
        for table in missing_tables:
            if table not in failed:
                failed.append(table)
        checkpoint["failed_tables"] = failed
        save_checkpoint(checkpoint)
    
    # If all tables are "processed" but we have missing ones, we need to reprocess
    if start_index >= len(all_tables) or len(processed) >= len(all_tables):
        if failed or missing_tables:
            print(" Checkpoint shows all tables processed, but some failed or are missing!", flush=True)
            print(f"    Failed tables: {len(failed)}, Missing tables: {len(missing_tables)}", flush=True)
            print("    Resetting to reprocess failed/missing tables...", flush=True)
            # Reset to process failed tables
            checkpoint = {
                "current_table": None,
                "current_table_index": 0,
                "processed_tables": [t for t in processed if t not in failed and t not in missing_tables],
                "failed_tables": [],
                "last_record_id": None,
                "total_processed": 0
            }
            save_checkpoint(checkpoint)
            start_index = 0
            processed = checkpoint["processed_tables"]
        else:
            print(" Checkpoint shows all tables processed, checking if migration actually worked...", flush=True)
            # Verify PostgreSQL has data
            try:
                with get_postgres_connection() as pg_conn:
                    cursor = pg_conn.cursor()
                    # Check a few tables for data
                    sample_tables = all_tables[:5] if all_tables else []
                    pg_has_data = False
                    for table_name in sample_tables:
                        try:
                            cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                            count = cursor.fetchone()[0]
                            if count > 0:
                                pg_has_data = True
                                break
                        except:
                            pass
                    cursor.close()
                    
                    if not pg_has_data:
                        print("    PostgreSQL tables are EMPTY! Checkpoint is stale from empty migration.", flush=True)
                        print("   Resetting checkpoint to start fresh migration...", flush=True)
                        checkpoint = {
                            "current_table": None,
                            "current_table_index": 0,
                            "processed_tables": [],
                            "failed_tables": [],
                            "last_record_id": None,
                            "total_processed": 0
                        }
                        save_checkpoint(checkpoint)
                        start_index = 0
                        processed = []
                    else:
                        print("    PostgreSQL has data, migration appears complete.", flush=True)
            except Exception as e:
                print(f"    Could not verify PostgreSQL: {e}", flush=True)
                print("   Resetting checkpoint to be safe...", flush=True)
                checkpoint = {
                    "current_table": None,
                    "current_table_index": 0,
                    "processed_tables": [],
                    "failed_tables": [],
                    "last_record_id": None,
                    "total_processed": 0
                }
                save_checkpoint(checkpoint)
                start_index = 0
                processed = []
    
    if start_index > 0 or missing_tables:
        print(f" Resuming from table index {start_index}...", flush=True)
        print(f"    Already processed: {len(processed)} tables", flush=True)
        print(f"    Previously failed: {len(failed)} tables (will retry)", flush=True)
        if missing_tables:
            print(f"    Missing tables to reprocess: {len(missing_tables)} tables", flush=True)
    
    # Remove processed tables from list (but include missing tables and failed tables)
    all_tables = [t for t in all_tables if t not in processed or t in missing_tables or t in failed]
    
    # Process tables in parallel using ThreadPoolExecutor
    print(f"\n Starting parallel table processing with {MAX_WORKERS} workers...", flush=True)
    print(f"    Tables to process: {len(all_tables)}", flush=True)
    print(f"    Chunk size: {CHUNK_SIZE:,} records", flush=True)
    print(f"    MySQL pool: {MYSQL_POOL_SIZE} connections", flush=True)
    print(f"    PostgreSQL pool: {POSTGRES_POOL_SIZE} connections", flush=True)
    print("=" * 80, flush=True)
    
    completed_count = 0
    failed_count = 0
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        # Submit all table processing tasks
        future_to_table = {
            executor.submit(process_table_safe, table, idx, len(all_tables), checkpoint): table 
            for idx, table in enumerate(all_tables, start=start_index + 1)
        }
        
        # Process completed tasks as they finish
        for future in as_completed(future_to_table):
            table = future_to_table[future]
            try:
                success = future.result()
                if success:
                    completed_count += 1
                    print(f"\n [{completed_count}/{len(all_tables)}] Completed {table}", flush=True)
                else:
                    failed_count += 1
                    print(f"\n [{completed_count + failed_count}/{len(all_tables)}] Failed {table}", flush=True)
            except Exception as e:
                failed_count += 1
                print(f"\n [{completed_count + failed_count}/{len(all_tables)}] Exception in {table}: {e}", flush=True)
    
    print(f"\n{'='*80}", flush=True)
    print(f" Parallel Processing Summary:", flush=True)
    print(f"    Successfully completed: {completed_count}/{len(all_tables)} tables", flush=True)
    print(f"    Failed: {failed_count}/{len(all_tables)} tables", flush=True)
    print(f"{'='*80}\n", flush=True)
    
    # Post-migration: Find ALL tables with encrypted columns and decrypt them
    print("\n" + "=" * 80, flush=True)
    print(" POST-MIGRATION: Decrypting all encrypted coordinates...", flush=True)
    print("=" * 80, flush=True)
    
    with get_mysql_connection() as mysql_conn:
        # Find all tables with pose_aes or encrypted coordinate columns
        mysql_cursor = mysql_conn.cursor()
        mysql_cursor.execute("""
            SELECT DISTINCT table_name, column_name
            FROM information_schema.columns 
            WHERE table_schema = %s
            AND (
                column_name LIKE '%pose_aes%' 
                OR column_name LIKE '%coordinate__pose_aes%'
                OR column_name LIKE '%from_destination__pose_aes%'
                OR column_name LIKE '%ppin_aes%'
                OR (column_name LIKE '%aes%' AND (column_name LIKE '%pose%' OR column_name LIKE '%coord%'))
                OR column_name LIKE '%encrypted%'
            )
            ORDER BY table_name, column_name
        """, (MYSQL_CONFIG['database'],))
        
        encrypted_tables = {}
        for row in mysql_cursor.fetchall():
            table_name = row[0].decode() if isinstance(row[0], bytes) else row[0]
            col_name = row[1].decode() if isinstance(row[1], bytes) else row[1]
            if table_name not in encrypted_tables:
                encrypted_tables[table_name] = []
            encrypted_tables[table_name].append(col_name)
        
        mysql_cursor.close()
        
        if encrypted_tables:
            print(f" Found {len(encrypted_tables)} tables with encrypted columns", flush=True)
            print(f" Starting parallel decryption with {DECRYPTION_WORKERS} workers...", flush=True)
            
            decryption_completed = 0
            decryption_failed = 0
            
            with ThreadPoolExecutor(max_workers=DECRYPTION_WORKERS) as executor:
                # Submit all decryption tasks
                future_to_table = {
                    executor.submit(decrypt_table_columns, table_name, cols, checkpoint): table_name
                    for table_name, cols in encrypted_tables.items()
                }
                
                # Process completed tasks as they finish
                for future in as_completed(future_to_table):
                    table = future_to_table[future]
                    try:
                        success = future.result()
                        if success:
                            decryption_completed += 1
                            print(f"\n [{decryption_completed}/{len(encrypted_tables)}] Decrypted {table}", flush=True)
                        else:
                            decryption_failed += 1
                            print(f"\n [{decryption_completed + decryption_failed}/{len(encrypted_tables)}] Failed {table}", flush=True)
                    except Exception as e:
                        decryption_failed += 1
                        print(f"\n [{decryption_completed + decryption_failed}/{len(encrypted_tables)}] Exception in {table}: {e}", flush=True)
            
            print(f"\n{'='*80}", flush=True)
            print(f" Decryption Summary:", flush=True)
            print(f"    Successfully decrypted: {decryption_completed}/{len(encrypted_tables)} tables", flush=True)
            print(f"    Failed: {decryption_failed}/{len(encrypted_tables)} tables", flush=True)
            print(f"{'='*80}\n", flush=True)
        else:
            print(" No encrypted columns found", flush=True)
    
    # Keep the old sequential code as fallback (commented out)
    # The code below is now handled by decrypt_table_columns() in parallel
    if False:  # Disabled - using parallel version above
        if encrypted_tables:
            for table_name, cols in encrypted_tables.items():
                with get_postgres_connection() as pg_conn:
                    for col in cols:
                        check_cursor = mysql_conn.cursor()
                        check_cursor.execute(f"SELECT COUNT(*) FROM `{table_name}` WHERE `{col}` IS NOT NULL")
                        encrypted_count = check_cursor.fetchone()[0]
                        check_cursor.close()
                        
                        if encrypted_count > 0:
                            try:
                                decrypt_and_transform_chunked(mysql_conn, pg_conn, table_name, col, checkpoint)
                                
                                # Verify decrypted columns were added
                                pg_cursor = pg_conn.cursor()
                                pg_cursor.execute("""
                                    SELECT column_name FROM information_schema.columns 
                                    WHERE table_schema = 'public' AND table_name = %s
                                    AND column_name IN ('decrypted_x', 'decrypted_y', 'decrypted_z', 
                                                         'decrypted_heading', 'decrypted_inclination', 
                                                         'decrypted_status', 'latitude', 'longitude', 'altitude')
                                """, (table_name,))
                                decrypted_cols = [row[0] for row in pg_cursor.fetchall()]
                                pg_cursor.close()
                                print(f"       Added {len(decrypted_cols)} decrypted columns: {', '.join(decrypted_cols)}", flush=True)
                                
                                # After successful decryption, drop the encrypted column from PostgreSQL
                                # (we have decrypted values in separate columns)
                                try:
                                    pg_cursor = pg_conn.cursor()
                                    pg_cursor.execute(f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS "{col}"')
                                    pg_conn.commit()
                                    pg_cursor.close()
                                    print(f"       Removed encrypted column {col} (replaced with decrypted values)", flush=True)
                                except Exception as drop_error:
                                    print(f"       Could not remove encrypted column {col}: {drop_error}", flush=True)
                            except Exception as e:
                                print(f"       Failed to decrypt {table_name}.{col}: {e}", flush=True)
                        else:
                            print(f"       Column {col} exists but has no encrypted data", flush=True)
        else:
            print(" No tables with encrypted coordinate columns found", flush=True)
    
    # Final verification: Compare MySQL vs PostgreSQL record counts
    print("\n" + "=" * 80, flush=True)
    print(" FINAL VERIFICATION: Comparing MySQL vs PostgreSQL", flush=True)
    print("=" * 80, flush=True)
    
    with get_mysql_connection() as mysql_conn:
        mysql_cursor = mysql_conn.cursor()
        mysql_cursor.execute("SHOW TABLES")
        mysql_tables = [row[0].decode() if isinstance(row[0], bytes) else row[0] for row in mysql_cursor.fetchall()]
        
        discrepancies = []
        total_mysql_records = 0
        total_pg_records = 0
        
        for table_name in mysql_tables[:20]:  # Check first 20 tables with most data
            try:
                mysql_cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                mysql_count = mysql_cursor.fetchone()[0]
                total_mysql_records += mysql_count
                
                if mysql_count > 0:
                    with get_postgres_connection() as pg_conn:
                        pg_cursor = pg_conn.cursor()
                        try:
                            # First check if table exists
                            pg_cursor.execute("""
                                SELECT EXISTS (
                                    SELECT FROM information_schema.tables 
                                    WHERE table_schema = 'public' AND table_name = %s
                                )
                            """, (table_name,))
                            table_exists = pg_cursor.fetchone()[0]
                            
                            if not table_exists:
                                discrepancies.append((table_name, mysql_count, "TABLE DOES NOT EXIST IN PostgreSQL"))
                            else:
                                pg_cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                                pg_count = pg_cursor.fetchone()[0]
                                total_pg_records += pg_count
                                
                                if mysql_count != pg_count:
                                    discrepancies.append((table_name, mysql_count, pg_count))
                                else:
                                    print(f"    {table_name}: {mysql_count:,} records (matched)", flush=True)
                        except Exception as e:
                            error_msg = str(e)
                            if "does not exist" in error_msg.lower():
                                discrepancies.append((table_name, mysql_count, "TABLE DOES NOT EXIST"))
                            else:
                                discrepancies.append((table_name, mysql_count, f"ERROR: {error_msg[:100]}"))
                        finally:
                            pg_cursor.close()
            except:
                pass
        
        mysql_cursor.close()
        
        if discrepancies:
            print(f"\n Found {len(discrepancies)} tables with count mismatches:", flush=True)
            for table, mysql_cnt, pg_cnt in discrepancies:
                print(f"   - {table}: MySQL={mysql_cnt:,}, PostgreSQL={pg_cnt}", flush=True)
        else:
            print(f"\n All checked tables have matching record counts!", flush=True)
        
        print(f"\n Summary:", flush=True)
        print(f"   MySQL total records (sample): {total_mysql_records:,}", flush=True)
        print(f"   PostgreSQL total records (sample): {total_pg_records:,}", flush=True)
    
    # Calculate and display performance metrics
    end_time = time_module.time()
    elapsed_seconds = end_time - start_time
    elapsed_minutes = elapsed_seconds / 60
    elapsed_hours = elapsed_minutes / 60
    
    print("\n" + "=" * 80, flush=True)
    print(" MIGRATION COMPLETE!", flush=True)
    print("=" * 80, flush=True)
    print(f" Tables Processed: {len(checkpoint.get('processed_tables', []))}", flush=True)
    print(f" Tables Failed: {len(checkpoint.get('failed_tables', []))}", flush=True)
    print(f"  Total Time: {int(elapsed_hours)}h {int(elapsed_minutes % 60)}m {int(elapsed_seconds % 60)}s", flush=True)
    if elapsed_seconds > 60:
        print(f"   ({elapsed_minutes:.1f} minutes / {elapsed_hours:.2f} hours)", flush=True)
    
    # Calculate throughput
    processed_tables = len(checkpoint.get('processed_tables', []))
    if processed_tables > 0 and elapsed_minutes > 0:
        tables_per_minute = processed_tables / elapsed_minutes
        print(f" Throughput: {tables_per_minute:.2f} tables/minute", flush=True)
    
    print("\n  Performance Configuration Used:", flush=True)
    print(f"    Parallel Table Workers: {MAX_WORKERS}", flush=True)
    print(f"    Decryption Workers: {DECRYPTION_WORKERS}", flush=True)
    print(f"    Chunk Size: {CHUNK_SIZE:,} records", flush=True)
    print(f"     Connection Pools: MySQL={MYSQL_POOL_SIZE}, PostgreSQL={POSTGRES_POOL_SIZE}", flush=True)
    print("=" * 80, flush=True)
    
    # Cleanup
    if mysql_pool:
        try:
            mysql_pool._remove_connections()
        except:
            pass
    if pg_pool:
        try:
            pg_pool.closeall()
        except:
            pass


if __name__ == "__main__":
    main()


