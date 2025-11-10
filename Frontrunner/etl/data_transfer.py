#!/usr/bin/env python3
"""
MySQL to PostgreSQL Data Transfer
No decryption, no coordinate conversion - just pure data migration
"""

import os
import sys
import time
import mysql.connector
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from lib.config import get_database_config, get_etl_config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load configuration
mysql_config_dict = get_database_config('mysql')
postgres_config_dict = get_database_config('postgres')
etl_config = get_etl_config()

# Database configurations
MYSQL_CONFIG = {
    'host': mysql_config_dict['host'],
    'port': mysql_config_dict['port'],
    'user': mysql_config_dict['user'],
    'password': mysql_config_dict['password'],
    'database': mysql_config_dict['database'],
    'charset': mysql_config_dict.get('charset', 'utf8mb4')
}

POSTGRES_CONFIG = {
    'host': postgres_config_dict['host'],
    'port': postgres_config_dict['port'],
    'user': postgres_config_dict['user'],
    'password': postgres_config_dict['password'],
    'database': postgres_config_dict['database']
}

BATCH_SIZE = etl_config['batchSize']

def wait_for_database(config, db_type):
    """Wait for database to be available"""
    max_retries = 60
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            if db_type == 'mysql':
                conn = mysql.connector.connect(**config)
                conn.close()
            else:  # postgresql
                conn = psycopg2.connect(**config)
                conn.close()
            
            logger.info(f"{db_type.upper()} is ready")
            return True
        except Exception as e:
            retry_count += 1
            logger.info(f"Waiting for {db_type.upper()}... ({retry_count}/{max_retries})")
            time.sleep(1)
    
    logger.error(f"{db_type.upper()} not available after {max_retries} seconds")
    return False

def get_mysql_connection():
    """Get MySQL connection"""
    return mysql.connector.connect(**MYSQL_CONFIG)

def get_postgres_connection():
    """Get PostgreSQL connection"""
    return psycopg2.connect(**POSTGRES_CONFIG)

def convert_mysql_to_postgres_schema(sql_content):
    """Convert MySQL schema to PostgreSQL compatible schema"""
    logger.info("Converting MySQL schema to PostgreSQL...")
    
    # Basic conversions
    conversions = [
        # Remove MySQL specific syntax
        (r'ENGINE=\w+', ''),
        (r'DEFAULT CHARSET=\w+', ''),
        (r'COLLATE=\w+', ''),
        (r'AUTO_INCREMENT=\d+', ''),
        (r'AUTO_INCREMENT', 'SERIAL'),
        
        # Convert data types
        (r'tinyint\(1\)', 'BOOLEAN'),
        (r'tinyint\(\d+\)', 'SMALLINT'),
        (r'int\(\d+\)', 'INTEGER'),
        (r'bigint\(\d+\)', 'BIGINT'),
        (r'double', 'DOUBLE PRECISION'),
        (r'float', 'REAL'),
        (r'datetime', 'TIMESTAMP'),
        (r'longtext', 'TEXT'),
        (r'mediumtext', 'TEXT'),
        (r'tinytext', 'TEXT'),
        
        # Convert quotes
        (r'`([^`]+)`', r'"\1"'),
        
        # Remove MySQL specific clauses
        (r'KEY `[^`]+` \([^)]+\),?', ''),
        (r'UNIQUE KEY `[^`]+` \([^)]+\),?', ''),
        (r'CONSTRAINT `[^`]+` FOREIGN KEY[^,)]+,?', ''),
    ]
    
    converted_sql = sql_content
    for pattern, replacement in conversions:
        import re
        converted_sql = re.sub(pattern, replacement, converted_sql, flags=re.IGNORECASE)
    
    # Clean up extra commas and whitespace
    converted_sql = re.sub(r',\s*\)', ')', converted_sql)
    converted_sql = re.sub(r'\n\s*\n', '\n', converted_sql)
    
    return converted_sql

def clean_existing_database():
    """Clean existing PostgreSQL database to start fresh"""
    try:
        with get_postgres_connection() as pg_conn:
            with pg_conn.cursor() as cursor:
                # Get list of all tables
                cursor.execute("""
                    SELECT tablename FROM pg_tables 
                    WHERE schemaname = 'public'
                """)
                tables = [row[0] for row in cursor.fetchall()]
                
                if tables:
                    logger.info(f"Dropping {len(tables)} existing tables...")
                    for table in tables:
                        try:
                            cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE')
                        except Exception as e:
                            logger.warning(f"Failed to drop table {table}: {e}")
                    
                    pg_conn.commit()
                    logger.info("Existing tables dropped")
                else:
                    logger.info("No existing tables found")
        
        return True
    except Exception as e:
        logger.error(f"Failed to clean database: {e}")
        return False

def import_schema():
    """Import schema from SQL file"""
    schema_file = '/app/frontrunnerv3_dbschema.sql'
    
    if not os.path.exists(schema_file):
        logger.error(f"Schema file not found: {schema_file}")
        return False
    
    try:
        with open(schema_file, 'r', encoding='utf-8') as f:
            schema_sql = f.read()
        
        # Convert MySQL schema to PostgreSQL
        postgres_sql = convert_mysql_to_postgres_schema(schema_sql)
        
        # Execute schema creation
        with get_postgres_connection() as pg_conn:
            with pg_conn.cursor() as cursor:
                # Split into individual statements
                statements = [stmt.strip() for stmt in postgres_sql.split(';') if stmt.strip()]
                
                success_count = 0
                error_count = 0
                
                for stmt in statements:
                    if stmt.upper().startswith(('CREATE TABLE', 'CREATE INDEX', 'ALTER TABLE')):
                        try:
                            cursor.execute(stmt)
                            success_count += 1
                        except Exception as e:
                            error_count += 1
                            logger.warning(f"Schema statement failed: {str(e)[:100]}...")
                
                pg_conn.commit()
                logger.info(f"Schema import: {success_count} successful, {error_count} failed")
        
        return True
    except Exception as e:
        logger.error(f"Schema import failed: {e}")
        return False

def get_table_list():
    """Get list of tables from MySQL"""
    try:
        with get_mysql_connection() as mysql_conn:
            with mysql_conn.cursor() as cursor:
                cursor.execute("SHOW TABLES")
                tables = [row[0] for row in cursor.fetchall()]
                logger.info(f"Found {len(tables)} tables in MySQL")
                return tables
    except Exception as e:
        logger.error(f"Failed to get table list: {e}")
        return []

def table_exists_mysql(table_name):
    """Check if table exists in MySQL"""
    try:
        with get_mysql_connection() as mysql_conn:
            with mysql_conn.cursor() as cursor:
                cursor.execute(f"""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = DATABASE() 
                    AND table_name = %s
                """, (table_name,))
                return cursor.fetchone()[0] > 0
    except:
        return False

def get_table_structure(table_name):
    """Get table structure from MySQL"""
    if not table_exists_mysql(table_name):
        return []
    try:
        with get_mysql_connection() as mysql_conn:
            with mysql_conn.cursor() as cursor:
                cursor.execute(f"DESCRIBE `{table_name}`")
                columns = []
                for row in cursor.fetchall():
                    col_name = row[0]
                    col_type = row[1]
                    columns.append(col_name)
                return columns
    except Exception as e:
        logger.error(f"Failed to get structure for {table_name}: {e}")
        return []

def table_exists_postgres(table_name):
    """Check if table exists in PostgreSQL"""
    try:
        with get_postgres_connection() as pg_conn:
            with pg_conn.cursor() as cursor:
                cursor.execute(f"""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = %s
                """, (table_name,))
                return cursor.fetchone()[0] > 0
    except:
        return False

def get_postgres_table_structure(table_name):
    """Get table structure from PostgreSQL"""
    if not table_exists_postgres(table_name):
        return []
    try:
        with get_postgres_connection() as pg_conn:
            with pg_conn.cursor() as cursor:
                cursor.execute(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = %s 
                    AND table_schema = 'public'
                    ORDER BY ordinal_position
                """, (table_name,))
                columns = [row[0] for row in cursor.fetchall()]
                return columns
    except Exception as e:
        logger.error(f"Failed to get PostgreSQL structure for {table_name}: {e}")
        return []

def transfer_table_data(table_name):
    """Transfer data from MySQL table to PostgreSQL"""
    if not table_exists_mysql(table_name):
        logger.debug(f"Table {table_name} does not exist in MySQL, skipping")
        return False
    
    if not table_exists_postgres(table_name):
        logger.debug(f"Table {table_name} does not exist in PostgreSQL, skipping")
        return False
    
    logger.info(f"Transferring table: {table_name}")
    
    try:
        # Get table structure from both databases
        mysql_columns = get_table_structure(table_name)
        postgres_columns = get_postgres_table_structure(table_name)
        
        if not mysql_columns:
            logger.warning(f"No MySQL columns found for {table_name}, skipping")
            return False
        
        if not postgres_columns:
            logger.warning(f"No PostgreSQL columns found for {table_name}, skipping")
            return False
        
        # Use only columns that exist in both databases
        common_columns = [col for col in mysql_columns if col in postgres_columns]
        
        if not common_columns:
            logger.warning(f"No common columns found for {table_name}, skipping")
            return False
        
        if len(common_columns) != len(mysql_columns):
            logger.info(f"Table {table_name}: Using {len(common_columns)}/{len(mysql_columns)} columns")
            logger.debug(f"  MySQL columns: {mysql_columns}")
            logger.debug(f"  PostgreSQL columns: {postgres_columns}")
            logger.debug(f"  Common columns: {common_columns}")
        
        # Get total row count
        with get_mysql_connection() as mysql_conn:
            with mysql_conn.cursor() as cursor:
                cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                total_rows = cursor.fetchone()[0]
        
        if total_rows == 0:
            logger.info(f"Table {table_name} is empty, skipping")
            return True
        
        logger.info(f"Table {table_name}: {total_rows} rows to transfer")
        
        # Transfer data in batches
        transferred_rows = 0
        batch_count = 0
        
        with get_mysql_connection() as mysql_conn:
            with get_postgres_connection() as pg_conn:
                mysql_cursor = mysql_conn.cursor()
                pg_cursor = pg_conn.cursor()
                
                # Prepare column names for both databases
                mysql_column_list = ', '.join([f'`{col}`' for col in common_columns])
                pg_column_list = ', '.join([f'"{col}"' for col in common_columns])
                placeholders = ', '.join(['%s'] * len(common_columns))
                
                # Create SELECT and INSERT statements
                select_sql = f"SELECT {mysql_column_list} FROM `{table_name}` LIMIT {BATCH_SIZE} OFFSET %s"
                insert_sql = f'INSERT INTO "{table_name}" ({pg_column_list}) VALUES ({placeholders})'
                
                # Fetch and insert data in batches
                offset = 0
                while offset < total_rows:
                    # Fetch batch from MySQL (only common columns)
                    mysql_cursor.execute(select_sql, (offset,))
                    batch_data = mysql_cursor.fetchall()
                    
                    if not batch_data:
                        break
                    
                    # Insert batch into PostgreSQL
                    try:
                        # Convert data for PostgreSQL compatibility
                        converted_batch = []
                        for row in batch_data:
                            converted_row = []
                            for value in row:
                                if isinstance(value, bytes):
                                    # Handle binary data
                                    converted_row.append(value)
                                elif value is None:
                                    converted_row.append(None)
                                else:
                                    converted_row.append(value)
                            converted_batch.append(converted_row)
                        
                        # Execute batch insert
                        pg_cursor.executemany(insert_sql, converted_batch)
                        pg_conn.commit()
                        
                        transferred_rows += len(batch_data)
                        batch_count += 1
                        
                        # Progress update
                        if batch_count % 10 == 0:
                            progress = (transferred_rows / total_rows) * 100
                            logger.info(f"  {table_name}: {transferred_rows:,}/{total_rows:,} ({progress:.1f}%)")
                    
                    except Exception as e:
                        logger.error(f"Batch insert failed for {table_name}: {e}")
                        pg_conn.rollback()
                        # Continue with next batch
                    
                    offset += BATCH_SIZE
        
        logger.info(f"✓ {table_name}: {transferred_rows:,} rows transferred")
        return True
        
    except Exception as e:
        logger.error(f"Failed to transfer {table_name}: {e}")
        return False

def verify_data_transfer():
    """Verify data transfer by comparing row counts"""
    logger.info("Verifying data transfer...")
    
    try:
        mysql_tables = get_table_list()
        valid_tables = [t for t in mysql_tables if table_exists_mysql(t) and table_exists_postgres(t)]
        mismatches = []
        
        for table_name in valid_tables:
            try:
                if not table_exists_mysql(table_name):
                    logger.debug(f"Table {table_name} does not exist in MySQL, skipping verification")
                    continue
                
                if not table_exists_postgres(table_name):
                    logger.debug(f"Table {table_name} does not exist in PostgreSQL, skipping verification")
                    continue
                
                # Get MySQL count
                with get_mysql_connection() as mysql_conn:
                    with mysql_conn.cursor() as cursor:
                        cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                        mysql_count = cursor.fetchone()[0]
                
                # Get PostgreSQL count
                with get_postgres_connection() as pg_conn:
                    with pg_conn.cursor() as cursor:
                        cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                        pg_count = cursor.fetchone()[0]
                
                if mysql_count == pg_count:
                    logger.info(f"✓ {table_name}: {mysql_count} records (matched)")
                else:
                    logger.warning(f"✗ {table_name}: MySQL={mysql_count}, PostgreSQL={pg_count}")
                    mismatches.append((table_name, mysql_count, pg_count))
            
            except Exception as e:
                logger.debug(f"Verification skipped for {table_name}: {e}")
        
        if mismatches:
            logger.warning(f"Found {len(mismatches)} tables with count mismatches")
            for table, mysql_count, pg_count in mismatches:
                logger.warning(f"  {table}: MySQL={mysql_count}, PostgreSQL={pg_count}")
        else:
            logger.info("All table counts match!")
        
        return len(mismatches) == 0
        
    except Exception as e:
        logger.error(f"Verification failed: {e}")
        return False

def main():
    """Main migration function"""
    start_time = time.time()
    
    logger.info("Starting MySQL to PostgreSQL Data Transfer")
    logger.info("=" * 60)
    logger.info(f"Batch size: {BATCH_SIZE:,} records")
    logger.info("=" * 60)
    
    # Wait for databases
    if not wait_for_database(MYSQL_CONFIG, 'mysql'):
        sys.exit(1)
    
    if not wait_for_database(POSTGRES_CONFIG, 'postgresql'):
        sys.exit(1)
    
    # Clean existing database
    logger.info("Step 1: Cleaning existing database...")
    if not clean_existing_database():
        logger.error("Database cleanup failed")
        sys.exit(1)
    
    # Import schema
    logger.info("Step 2: Importing schema...")
    if not import_schema():
        logger.error("Schema import failed")
        sys.exit(1)
    
    # Get table list from MySQL
    logger.info("Step 3: Getting table list from MySQL...")
    mysql_tables = get_table_list()
    if not mysql_tables:
        logger.error("No tables found in MySQL")
        sys.exit(1)
    
    # Filter to only tables that exist in both databases
    logger.info("Step 4: Filtering tables that exist in both databases...")
    valid_tables = []
    for table_name in mysql_tables:
        if table_exists_mysql(table_name) and table_exists_postgres(table_name):
            valid_tables.append(table_name)
        else:
            logger.debug(f"Skipping {table_name} - not in both databases")
    
    logger.info(f"Found {len(valid_tables)} tables to transfer (out of {len(mysql_tables)} in MySQL)")
    
    if not valid_tables:
        logger.warning("No tables exist in both databases. Check schema import.")
        sys.exit(1)
    
    # Transfer data
    logger.info(f"Step 5: Transferring data from {len(valid_tables)} tables...")
    successful_tables = 0
    failed_tables = 0
    
    for i, table_name in enumerate(valid_tables, 1):
        logger.info(f"[{i}/{len(valid_tables)}] Processing {table_name}...")
        if transfer_table_data(table_name):
            successful_tables += 1
        else:
            failed_tables += 1
    
    # Verify transfer
    logger.info("Step 6: Verifying data transfer...")
    verification_passed = verify_data_transfer()
    
    # Summary
    end_time = time.time()
    elapsed_seconds = end_time - start_time
    elapsed_minutes = elapsed_seconds / 60
    
    logger.info("=" * 60)
    logger.info("MIGRATION COMPLETE!")
    logger.info("=" * 60)
    logger.info(f"Tables processed: {len(valid_tables)}")
    logger.info(f"Successful: {successful_tables}")
    logger.info(f"Failed: {failed_tables}")
    logger.info(f"Total time: {elapsed_minutes:.1f} minutes")
    logger.info(f"Verification: {'PASSED' if verification_passed else 'FAILED'}")
    logger.info("=" * 60)
    
    if failed_tables > 0 or not verification_passed:
        sys.exit(1)

if __name__ == "__main__":
        sys.exit(1)
    
    # Import schema
    logger.info("Step 2: Importing schema...")
    if not import_schema():
        logger.error("Schema import failed")
        sys.exit(1)
    
    # Get table list from MySQL
    logger.info("Step 3: Getting table list from MySQL...")
    mysql_tables = get_table_list()
    if not mysql_tables:
        logger.error("No tables found in MySQL")
        sys.exit(1)
    
    # Filter to only tables that exist in both databases
    logger.info("Step 4: Filtering tables that exist in both databases...")
    valid_tables = []
    for table_name in mysql_tables:
        if table_exists_mysql(table_name) and table_exists_postgres(table_name):
            valid_tables.append(table_name)
        else:
            logger.debug(f"Skipping {table_name} - not in both databases")
    
    logger.info(f"Found {len(valid_tables)} tables to transfer (out of {len(mysql_tables)} in MySQL)")
    
    if not valid_tables:
        logger.warning("No tables exist in both databases. Check schema import.")
        sys.exit(1)
    
    # Transfer data
    logger.info(f"Step 5: Transferring data from {len(valid_tables)} tables...")
    successful_tables = 0
    failed_tables = 0
    
    for i, table_name in enumerate(valid_tables, 1):
        logger.info(f"[{i}/{len(valid_tables)}] Processing {table_name}...")
        if transfer_table_data(table_name):
            successful_tables += 1
        else:
            failed_tables += 1
    
    # Verify transfer
    logger.info("Step 6: Verifying data transfer...")
    verification_passed = verify_data_transfer()
    
    # Summary
    end_time = time.time()
    elapsed_seconds = end_time - start_time
    elapsed_minutes = elapsed_seconds / 60
    
    logger.info("=" * 60)
    logger.info("MIGRATION COMPLETE!")
    logger.info("=" * 60)
    logger.info(f"Tables processed: {len(valid_tables)}")
    logger.info(f"Successful: {successful_tables}")
    logger.info(f"Failed: {failed_tables}")
    logger.info(f"Total time: {elapsed_minutes:.1f} minutes")
    logger.info(f"Verification: {'PASSED' if verification_passed else 'FAILED'}")
    logger.info("=" * 60)
    
    if failed_tables > 0 or not verification_passed:
        sys.exit(1)

if __name__ == "__main__":