#!/usr/bin/env python3
"""
Load Data TO MySQL Database
Import schema and data from SQL files into MySQL
"""

import os
import sys
import time
import mysql.connector
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MySQL configuration
MYSQL_CONFIG = {
    'host': os.getenv('MYSQL_HOST', 'mysql'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'user': os.getenv('MYSQL_USER', 'root'),
    'password': os.getenv('MYSQL_PASSWORD', 'rootpassword'),
    'database': os.getenv('MYSQL_DATABASE', 'kmtsdb'),
    'charset': 'utf8mb4',
    'autocommit': True
}

def wait_for_mysql():
    """Wait for MySQL to be available"""
    max_retries = 60
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            conn = mysql.connector.connect(**MYSQL_CONFIG)
            conn.close()
            logger.info("MySQL is ready")
            return True
        except Exception as e:
            retry_count += 1
            logger.info(f"Waiting for MySQL... ({retry_count}/{max_retries})")
            time.sleep(1)
    
    logger.error(f"MySQL not available after {max_retries} seconds")
    return False

def get_mysql_connection():
    """Get MySQL connection"""
    return mysql.connector.connect(**MYSQL_CONFIG)

def clean_mysql_database():
    """Clean existing MySQL database"""
    try:
        with get_mysql_connection() as conn:
            with conn.cursor() as cursor:
                # Disable foreign key checks
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
                
                # Get list of all tables
                cursor.execute("SHOW TABLES")
                tables = [row[0] for row in cursor.fetchall()]
                
                if tables:
                    logger.info(f"Dropping {len(tables)} existing tables...")
                    for table in tables:
                        try:
                            cursor.execute(f"DROP TABLE IF EXISTS `{table}`")
                        except Exception as e:
                            logger.warning(f"Failed to drop table {table}: {e}")
                    
                    logger.info("Existing tables dropped")
                else:
                    logger.info("No existing tables found")
                
                # Re-enable foreign key checks
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
        
        return True
    except Exception as e:
        logger.error(f"Failed to clean MySQL database: {e}")
        return False

def execute_sql_file(file_path, description, statement_filter=None):
    """Execute SQL file in MySQL with optional statement filtering"""
    if not os.path.exists(file_path):
        logger.error(f"{description} file not found: {file_path}")
        return False
    
    try:
        logger.info(f"Loading {description}...")
        
        # Read SQL file with encoding fallback and error handling
        sql_content = None
        for encoding in ['utf-8', 'latin-1', 'cp1252']:
            try:
                with open(file_path, 'r', encoding=encoding, errors='replace') as f:
                    sql_content = f.read()
                logger.info(f"Successfully read file using {encoding} encoding")
                break
            except Exception as e:
                logger.warning(f"Failed to read with {encoding}: {e}")
                continue
        
        if sql_content is None:
            # Try reading as binary and converting
            try:
                with open(file_path, 'rb') as f:
                    binary_content = f.read()
                sql_content = binary_content.decode('utf-8', errors='replace')
                logger.info("Successfully read file as binary with UTF-8 replacement")
            except Exception as e:
                logger.error(f"Could not read {file_path} with any method: {e}")
                return False
        
        # Get file size for progress
        file_size = len(sql_content)
        logger.info(f"{description} file size: {file_size / 1024 / 1024:.1f} MB")
        
        with get_mysql_connection() as conn:
            with conn.cursor() as cursor:
                # Disable foreign key checks for faster loading
                cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
                cursor.execute("SET AUTOCOMMIT = 0")
                
                # Split into statements
                statements = []
                current_statement = ""
                
                for line in sql_content.split('\n'):
                    line = line.strip()
                    
                    # Skip comments and empty lines
                    if not line or line.startswith('--') or line.startswith('#'):
                        continue
                    
                    current_statement += line + '\n'
                    
                    # If line ends with semicolon, it's end of statement
                    if line.endswith(';'):
                        statements.append(current_statement.strip())
                        current_statement = ""
                
                logger.info(f"Found {len(statements)} SQL statements")
                
                # Execute statements
                success_count = 0
                error_count = 0
                
                for i, statement in enumerate(statements):
                    if not statement or len(statement.strip()) < 5:
                        continue
                    
                    try:
                        # Skip problematic statements
                        statement_upper = statement.upper().strip()
                        if any(skip_pattern in statement_upper for skip_pattern in [
                            'LOCK TABLES', 'UNLOCK TABLES', 'SET @@', 'SET SESSION'
                        ]):
                            continue
                        
                        # Apply statement filter if provided
                        if statement_filter and not statement_filter(statement_upper):
                            continue
                        
                        cursor.execute(statement)
                        success_count += 1
                        
                        # Progress update every 1000 statements
                        if (i + 1) % 1000 == 0:
                            progress = ((i + 1) / len(statements)) * 100
                            logger.info(f"  Progress: {i + 1:,}/{len(statements):,} ({progress:.1f}%)")
                    
                    except Exception as e:
                        error_count += 1
                        if error_count <= 10:  # Only log first 10 errors
                            logger.warning(f"Statement failed: {str(e)[:100]}...")
                
                # Commit all changes
                conn.commit()
                
                # Re-enable foreign key checks
                cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
                cursor.execute("SET AUTOCOMMIT = 1")
                
                logger.info(f"{description} complete: {success_count} successful, {error_count} failed")
        
        return True
    
    except Exception as e:
        logger.error(f"Failed to load {description}: {e}")
        return False

def verify_data_load():
    """Verify data was loaded successfully"""
    try:
        with get_mysql_connection() as conn:
            with conn.cursor() as cursor:
                # Get table count
                cursor.execute("SHOW TABLES")
                tables = cursor.fetchall()
                table_count = len(tables)
                
                logger.info(f"Found {table_count} tables in MySQL")
                
                # Get total record count
                total_records = 0
                tables_with_data = 0
                
                for (table_name,) in tables:
                    try:
                        cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                        count = cursor.fetchone()[0]
                        total_records += count
                        
                        if count > 0:
                            tables_with_data += 1
                            logger.info(f"  {table_name}: {count:,} records")
                    
                    except Exception as e:
                        logger.warning(f"Failed to count records in {table_name}: {e}")
                
                logger.info(f"Total: {total_records:,} records in {tables_with_data} tables")
                
                return table_count > 0
    
    except Exception as e:
        logger.error(f"Verification failed: {e}")
        return False

def main():
    """Main function"""
    start_time = time.time()
    
    logger.info("Starting MySQL Data Load")
    logger.info("=" * 50)
    logger.info("Loading schema and data INTO MySQL database")
    logger.info("=" * 50)
    
    # Wait for MySQL
    if not wait_for_mysql():
        sys.exit(1)
    
    # Clean existing database
    logger.info("Step 1: Cleaning existing MySQL database...")
    if not clean_mysql_database():
        logger.error("Database cleanup failed")
        sys.exit(1)
    
    # Load schema - CREATE TABLE statements only
    logger.info("Step 2: Loading schema (CREATE TABLE statements)...")
    schema_file = '/app/frontrunnerv3_dbschema.sql'
    schema_filter = lambda stmt: stmt.startswith('CREATE TABLE') or stmt.startswith('CREATE INDEX') or stmt.startswith('ALTER TABLE')
    if not execute_sql_file(schema_file, "Schema (CREATE statements)", schema_filter):
        logger.error("Schema loading failed")
        sys.exit(1)
    
    # Load schema data - INSERT statements from schema file
    logger.info("Step 3: Loading schema data (INSERT statements)...")
    schema_data_filter = lambda stmt: stmt.startswith('INSERT INTO')
    if not execute_sql_file(schema_file, "Schema Data (INSERT statements)", schema_data_filter):
        logger.warning("Schema data loading had issues, continuing...")
    
    # Load main data
    logger.info("Step 4: Loading main data...")
    data_file = '/app/backup.sql'
    if not execute_sql_file(data_file, "Main Data"):
        logger.error("Main data loading failed")
        sys.exit(1)
    
    # Verify
    logger.info("Step 5: Verifying data load...")
    verification_passed = verify_data_load()
    
    # Summary
    end_time = time.time()
    elapsed_seconds = end_time - start_time
    elapsed_minutes = elapsed_seconds / 60
    
    logger.info("=" * 50)
    logger.info("MYSQL DATA LOAD COMPLETE!")
    logger.info("=" * 50)
    logger.info(f"Total time: {elapsed_minutes:.1f} minutes")
    logger.info(f"Verification: {'PASSED' if verification_passed else 'FAILED'}")
    logger.info("=" * 50)
    
    if not verification_passed:
        sys.exit(1)

if __name__ == "__main__":
    main()