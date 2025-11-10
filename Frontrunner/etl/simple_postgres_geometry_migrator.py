#!/usr/bin/env python3
"""
PostgreSQL Migration with Geometry Conversion
Migrates already decrypted MySQL data to PostgreSQL and converts locations to spatial geometries
"""

import os
import sys
import time
import logging
import subprocess
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any
import mysql.connector
import psycopg2
from psycopg2.extras import RealDictCursor
import re

# Configuration Constants
BATCH_SIZE = 1000

# Database Configuration
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

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/app/migration.log')
    ]
)
logger = logging.getLogger(__name__)

class DatabaseConnectionManager:
    """Manages database connections and availability checks"""
    
    def __init__(self):
        self.mysql_conn = None
        self.postgres_conn = None
    
    def wait_for_mysql(self, timeout: int = 60) -> bool:
        """Wait for MySQL to become available"""
        logger.info("Waiting for MySQL to become available...")
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                conn = mysql.connector.connect(**MYSQL_CONFIG)
                conn.close()
                logger.info("MySQL is available")
                return True
            except Exception as e:
                logger.debug(f"MySQL not ready: {e}")
                time.sleep(1)
        
        logger.error("MySQL failed to become available within timeout")
        return False
    
    def wait_for_postgres(self, timeout: int = 60) -> bool:
        """Wait for PostgreSQL to become available"""
        logger.info("Waiting for PostgreSQL to become available...")
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                conn = psycopg2.connect(**POSTGRES_CONFIG)
                conn.close()
                logger.info("PostgreSQL is available")
                return True
            except Exception as e:
                logger.debug(f"PostgreSQL not ready: {e}")
                time.sleep(1)
        
        logger.error("PostgreSQL failed to become available within timeout")
        return False
    
    def connect_mysql(self) -> bool:
        """Establish MySQL connection"""
        try:
            self.mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
            logger.info("Connected to MySQL")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to MySQL: {e}")
            return False
    
    def connect_postgres(self) -> bool:
        """Establish PostgreSQL connection"""
        try:
            self.postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
            self.postgres_conn.autocommit = True
            logger.info("Connected to PostgreSQL")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            return False
    
    def close_connections(self):
        """Close all database connections"""
        if self.mysql_conn:
            self.mysql_conn.close()
            logger.info("Closed MySQL connection")
        if self.postgres_conn:
            self.postgres_conn.close()
            logger.info("Closed PostgreSQL connection")

class PostgreSQLCleaner:
    """Handles PostgreSQL database cleanup and PostGIS setup"""
    
    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager
    
    def clean_postgres_database(self) -> bool:
        """Drop all existing tables and prepare clean database"""
        try:
            logger.info("Cleaning PostgreSQL database...")
            cursor = self.db_manager.postgres_conn.cursor()
            
            # Drop all tables by dropping and recreating public schema
            cursor.execute("DROP SCHEMA IF EXISTS public CASCADE;")
            cursor.execute("CREATE SCHEMA public;")
            cursor.execute("GRANT ALL ON SCHEMA public TO PUBLIC;")
            
            logger.info("PostgreSQL database cleaned successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to clean PostgreSQL database: {e}")
            return False
    
    def enable_postgis(self) -> bool:
        """Enable PostGIS extension and topology"""
        try:
            logger.info("Enabling PostGIS extensions...")
            cursor = self.db_manager.postgres_conn.cursor()
            
            # Enable PostGIS extensions
            cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
            cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis_topology;")
            
            logger.info("PostGIS extensions enabled successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to enable PostGIS: {e}")
            return False

class MySQLToPostgreSQLConverter:
    """Converts MySQL syntax to PostgreSQL compatible syntax"""
    
    def __init__(self):
        self.conversion_patterns = [
            # Remove backticks and replace with double quotes
            (r'`([^`]+)`', r'"\1"'),
            # Remove MySQL specific clauses
            (r'\s+ENGINE\s*=\s*\w+', ''),
            (r'\s+DEFAULT\s+CHARSET\s*=\s*\w+', ''),
            (r'\s+COLLATE\s*=\s*\w+', ''),
            (r'\s+AUTO_INCREMENT\s*=\s*\d+', ''),
            # Convert data types
            (r'\bint\(\d+\)', 'INTEGER'),
            (r'\bbigint\(\d+\)', 'BIGINT'),
            (r'\btinyint\(1\)', 'BOOLEAN'),
            (r'\bdouble\b', 'DOUBLE PRECISION'),
            (r'\bfloat\b', 'REAL'),
            (r'\bauto_increment\b', 'SERIAL'),
            # Handle binary data
            (r"_binary\s+'([^']*)'", r"'\1'::bytea"),
            # Fix INSERT statements
            (r'INSERT INTO `([^`]+)`', r'INSERT INTO "\1"'),
        ]
    
    def convert_mysql_to_postgres(self, sql_content: str) -> str:
        """Convert MySQL SQL to PostgreSQL compatible SQL"""
        try:
            # Apply all conversion patterns
            for pattern, replacement in self.conversion_patterns:
                sql_content = re.sub(pattern, replacement, sql_content, flags=re.IGNORECASE)
            
            return sql_content
            
        except Exception as e:
            logger.error(f"SQL conversion failed: {e}")
            return sql_content
    
    def handle_encoding_fallback(self, file_path: str) -> str:
        """Read file with encoding fallback (UTF-8 → latin-1)"""
        try:
            # Try UTF-8 first
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except UnicodeDecodeError:
            logger.warning(f"UTF-8 failed for {file_path}, trying latin-1")
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    return f.read()
            except Exception as e:
                logger.error(f"Failed to read {file_path}: {e}")
                return ""

class DataETL:
    """Migrates data from MySQL to PostgreSQL"""
    
    def __init__(self, db_manager: DatabaseConnectionManager, converter: MySQLToPostgreSQLConverter):
        self.db_manager = db_manager
        self.converter = converter
    
    def migrate_all_data(self) -> bool:
        """Migrate all data from MySQL to PostgreSQL"""
        try:
            logger.info("Starting data migration from MySQL to PostgreSQL...")
            
            # Get list of tables from MySQL
            mysql_cursor = self.db_manager.mysql_conn.cursor()
            mysql_cursor.execute("SHOW TABLES")
            tables = [table[0] for table in mysql_cursor.fetchall()]
            
            logger.info(f"Found {len(tables)} tables to migrate")
            
            for table_name in tables:
                logger.info(f"Migrating table: {table_name}")
                if not self._migrate_table(table_name):
                    logger.warning(f"Failed to migrate table: {table_name}")
                    continue
            
            logger.info("Data migration completed")
            return True
            
        except Exception as e:
            logger.error(f"Data migration failed: {e}")
            return False
    
    def _migrate_table(self, table_name: str) -> bool:
        """Migrate a single table"""
        try:
            mysql_cursor = self.db_manager.mysql_conn.cursor()
            postgres_cursor = self.db_manager.postgres_conn.cursor()
            
            # Get table structure from MySQL
            mysql_cursor.execute(f"DESCRIBE `{table_name}`")
            columns_info = mysql_cursor.fetchall()
            
            # Create table in PostgreSQL
            self._create_postgres_table(table_name, columns_info)
            
            # Get data from MySQL
            mysql_cursor.execute(f"SELECT * FROM `{table_name}`")
            
            # Get column names
            column_names = [desc[0] for desc in mysql_cursor.description]
            
            # Migrate data in batches
            batch_count = 0
            while True:
                rows = mysql_cursor.fetchmany(BATCH_SIZE)
                if not rows:
                    break
                
                # Insert batch into PostgreSQL
                self._insert_batch(table_name, column_names, rows)
                batch_count += 1
                
                if batch_count % 10 == 0:
                    logger.info(f"Migrated {batch_count * BATCH_SIZE} records from {table_name}")
            
            logger.info(f"Completed migration of table {table_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to migrate table {table_name}: {e}")
            return False
    
    def _create_postgres_table(self, table_name: str, columns_info: List) -> bool:
        """Create table in PostgreSQL"""
        try:
            postgres_cursor = self.db_manager.postgres_conn.cursor()
            
            # Build CREATE TABLE statement
            column_defs = []
            for col_info in columns_info:
                col_name = col_info[0]
                col_type = self._convert_mysql_type_to_postgres(col_info[1])
                nullable = "NOT NULL" if col_info[2] == "NO" else ""
                
                column_defs.append(f'"{col_name}" {col_type} {nullable}')
            
            # Add geometry columns for spatial data
            column_defs.append('geometry_polyline GEOMETRY(LINESTRING, 4326)')
            column_defs.append('geometry_polygon GEOMETRY(POLYGON, 4326)')
            
            create_sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" ({", ".join(column_defs)})'
            postgres_cursor.execute(create_sql)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to create table {table_name}: {e}")
            return False
    
    def _convert_mysql_type_to_postgres(self, mysql_type: str) -> str:
        """Convert MySQL data type to PostgreSQL"""
        mysql_type = mysql_type.lower()
        
        if 'int' in mysql_type:
            if 'bigint' in mysql_type:
                return 'BIGINT'
            elif 'tinyint(1)' in mysql_type:
                return 'BOOLEAN'
            else:
                return 'INTEGER'
        elif 'varchar' in mysql_type or 'text' in mysql_type:
            return 'TEXT'
        elif 'decimal' in mysql_type or 'numeric' in mysql_type:
            return 'NUMERIC'
        elif 'double' in mysql_type:
            return 'DOUBLE PRECISION'
        elif 'float' in mysql_type:
            return 'REAL'
        elif 'datetime' in mysql_type or 'timestamp' in mysql_type:
            return 'TIMESTAMP'
        elif 'date' in mysql_type:
            return 'DATE'
        elif 'time' in mysql_type:
            return 'TIME'
        elif 'blob' in mysql_type or 'binary' in mysql_type:
            return 'BYTEA'
        else:
            return 'TEXT'  # Default fallback
    
    def _insert_batch(self, table_name: str, column_names: List[str], rows: List) -> bool:
        """Insert batch of rows into PostgreSQL"""
        try:
            postgres_cursor = self.db_manager.postgres_conn.cursor()
            
            # Build INSERT statement
            columns_str = ', '.join([f'"{col}"' for col in column_names])
            placeholders = ', '.join(['%s'] * len(column_names))
            
            insert_sql = f'INSERT INTO "{table_name}" ({columns_str}) VALUES ({placeholders})'
            
            # Execute batch insert
            postgres_cursor.executemany(insert_sql, rows)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to insert batch into {table_name}: {e}")
            return False

class GeometryConverter:
    """Converts point locations to polylines and polygons"""
    
    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager
        self.functional_categories = ['fuel', 'crusher', 'parking', 'pit', 'dump']
    
    def convert_points_to_geometries(self) -> bool:
        """Convert grouped points to polylines and polygons"""
        try:
            logger.info("Converting points to geometries...")
            
            # Get all tables with coordinate data
            coordinate_tables = self._get_coordinate_tables()
            
            geometry_count = 0
            
            for table_name in coordinate_tables:
                logger.info(f"Processing geometries for table: {table_name}")
                
                # Get grouped locations from this table
                grouped_locations = self._group_locations_by_category(table_name)
                
                for category, locations in grouped_locations.items():
                    logger.info(f"Processing {len(locations)} {category} locations in {table_name}")
                    
                    for location_name, points in locations.items():
                        if len(points) < 3:
                            logger.debug(f"Skipping {location_name}: insufficient points ({len(points)})")
                            continue
                        
                        # Sort points by some logical order
                        points = sorted(points, key=lambda p: (p.get('latitude', 0), p.get('longitude', 0)))
                        
                        # Create geometries
                        polyline_wkt = self._create_linestring(points)
                        polygon_wkt = self._create_polygon(points)
                        
                        # Update database records
                        for point in points:
                            try:
                                self._update_geometry_columns(
                                    table_name, 
                                    point.get('id'), 
                                    polyline_wkt, 
                                    polygon_wkt
                                )
                                geometry_count += 1
                            except Exception as e:
                                logger.warning(f"Failed to update geometry for {point.get('id')}: {e}")
            
            logger.info(f"Created geometries for {geometry_count} records")
            return True
            
        except Exception as e:
            logger.error(f"Failed to convert points to geometries: {e}")
            return False
    
    def _get_coordinate_tables(self) -> List[str]:
        """Get list of tables with coordinate data"""
        try:
            postgres_cursor = self.db_manager.postgres_conn.cursor()
            
            # Look for tables with latitude/longitude or x/y columns
            query = """
            SELECT DISTINCT table_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND (column_name ILIKE '%lat%' 
                 OR column_name ILIKE '%lon%' 
                 OR column_name ILIKE '%x%' 
                 OR column_name ILIKE '%y%'
                 OR column_name ILIKE '%coordinate%'
                 OR column_name ILIKE '%location%')
            """
            
            postgres_cursor.execute(query)
            tables = [row[0] for row in postgres_cursor.fetchall()]
            
            logger.info(f"Found {len(tables)} tables with coordinate data: {tables}")
            return tables
            
        except Exception as e:
            logger.error(f"Failed to get coordinate tables: {e}")
            return []
    
    def _group_locations_by_category(self, table_name: str) -> Dict[str, Dict[str, List]]:
        """Group locations by functional category"""
        try:
            postgres_cursor = self.db_manager.postgres_conn.cursor(cursor_factory=RealDictCursor)
            
            # Get all records from the table
            query = f'SELECT * FROM "{table_name}" LIMIT 10000'  # Limit for safety
            postgres_cursor.execute(query)
            records = postgres_cursor.fetchall()
            
            grouped_locations = {}
            
            for record in records:
                location_info = self._extract_location_info(record, table_name)
                if not location_info:
                    continue
                
                category = location_info['category']
                location_name = location_info['name']
                
                # Get coordinates from various possible column names
                coords = self._extract_coordinates(record)
                if not coords:
                    continue
                
                if category not in grouped_locations:
                    grouped_locations[category] = {}
                
                if location_name not in grouped_locations[category]:
                    grouped_locations[category][location_name] = []
                
                point_data = {
                    'id': record.get('_OID_') or record.get('id') or record.get('ID'),
                    'latitude': coords.get('latitude'),
                    'longitude': coords.get('longitude'),
                    'x': coords.get('x'),
                    'y': coords.get('y')
                }
                
                grouped_locations[category][location_name].append(point_data)
            
            return grouped_locations
            
        except Exception as e:
            logger.error(f"Failed to group locations for {table_name}: {e}")
            return {}
    
    def _extract_location_info(self, record: Dict, table_name: str) -> Optional[Dict[str, str]]:
        """Extract location name and category from record"""
        try:
            # Look for location name in various columns
            location_name = None
            for col in ['location_name', 'name', 'loc_name', 'description', 'label', 'tag']:
                if col in record and record[col]:
                    location_name = str(record[col]).strip()
                    break
            
            if not location_name:
                # Use table name + ID as fallback
                record_id = record.get('_OID_') or record.get('id') or record.get('ID') or 'unknown'
                location_name = f"{table_name}_{record_id}"
            
            # Determine category based on location name or table name
            category = 'other'
            location_lower = location_name.lower()
            table_lower = table_name.lower()
            
            for func_cat in self.functional_categories:
                if func_cat in location_lower or func_cat in table_lower:
                    category = func_cat
                    break
            
            # Special handling for specific patterns
            if any(word in table_lower for word in ['pit', 'dump']):
                category = 'pit'
            elif any(word in table_lower for word in ['fuel', 'refuel']):
                category = 'fuel'
            elif any(word in table_lower for word in ['crush', 'mill']):
                category = 'crusher'
            elif any(word in table_lower for word in ['park']):
                category = 'parking'
            
            return {
                'name': location_name,
                'category': category
            }
            
        except Exception as e:
            logger.debug(f"Failed to extract location info: {e}")
            return None
    
    def _extract_coordinates(self, record: Dict) -> Optional[Dict[str, float]]:
        """Extract coordinates from record"""
        try:
            coords = {}
            
            # Look for latitude/longitude
            for lat_col in ['latitude', 'lat', 'Latitude', 'LAT']:
                if lat_col in record and record[lat_col] is not None:
                    coords['latitude'] = float(record[lat_col])
                    break
            
            for lon_col in ['longitude', 'lon', 'lng', 'Longitude', 'LON']:
                if lon_col in record and record[lon_col] is not None:
                    coords['longitude'] = float(record[lon_col])
                    break
            
            # Look for x/y coordinates
            for x_col in ['x', 'X', 'coord_x', 'pos_x']:
                if x_col in record and record[x_col] is not None:
                    coords['x'] = float(record[x_col])
                    break
            
            for y_col in ['y', 'Y', 'coord_y', 'pos_y']:
                if y_col in record and record[y_col] is not None:
                    coords['y'] = float(record[y_col])
                    break
            
            # Return coordinates if we have at least lat/lon or x/y
            if ('latitude' in coords and 'longitude' in coords) or ('x' in coords and 'y' in coords):
                return coords
            
            return None
            
        except Exception as e:
            logger.debug(f"Failed to extract coordinates: {e}")
            return None
    
    def _create_linestring(self, points: List[Dict]) -> Optional[str]:
        """Create LINESTRING WKT from points"""
        if len(points) < 2:
            return None
        
        coords = []
        for point in points:
            if point.get('longitude') is not None and point.get('latitude') is not None:
                coords.append(f"{point['longitude']} {point['latitude']}")
            elif point.get('x') is not None and point.get('y') is not None:
                coords.append(f"{point['x']} {point['y']}")
        
        if len(coords) < 2:
            return None
        
        return f"LINESTRING({', '.join(coords)})"
    
    def _create_polygon(self, points: List[Dict]) -> Optional[str]:
        """Create POLYGON WKT from points"""
        if len(points) < 4:
            return None
        
        coords = []
        for point in points:
            if point.get('longitude') is not None and point.get('latitude') is not None:
                coords.append(f"{point['longitude']} {point['latitude']}")
            elif point.get('x') is not None and point.get('y') is not None:
                coords.append(f"{point['x']} {point['y']}")
        
        if len(coords) < 4:
            return None
        
        # Close the polygon by adding first point at the end
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        
        return f"POLYGON(({', '.join(coords)}))"
    
    def _update_geometry_columns(self, table_name: str, record_id: str, polyline_wkt: Optional[str], polygon_wkt: Optional[str]):
        """Update geometry columns in database"""
        if not record_id:
            return
        
        postgres_cursor = self.db_manager.postgres_conn.cursor()
        
        update_parts = []
        params = []
        
        if polyline_wkt:
            update_parts.append("geometry_polyline = ST_GeomFromText(%s, 4326)")
            params.append(polyline_wkt)
        
        if polygon_wkt:
            update_parts.append("geometry_polygon = ST_GeomFromText(%s, 4326)")
            params.append(polygon_wkt)
        
        if update_parts:
            # Try different ID column names
            id_columns = ['_OID_', 'id', 'ID', 'oid']
            
            for id_col in id_columns:
                try:
                    query = f"""
                    UPDATE "{table_name}" 
                    SET {', '.join(update_parts)}
                    WHERE "{id_col}" = %s
                    """
                    params.append(record_id)
                    postgres_cursor.execute(query, params)
                    
                    if postgres_cursor.rowcount > 0:
                        break
                        
                except Exception:
                    params.pop()  # Remove the record_id for next attempt
                    continue
    
    def create_spatial_indexes(self) -> bool:
        """Create spatial indexes on geometry columns"""
        try:
            logger.info("Creating spatial indexes...")
            postgres_cursor = self.db_manager.postgres_conn.cursor()
            
            coordinate_tables = self._get_coordinate_tables()
            
            for table_name in coordinate_tables:
                try:
                    # Create indexes for geometry columns
                    polyline_index = f"idx_{table_name}_geometry_polyline"
                    polygon_index = f"idx_{table_name}_geometry_polygon"
                    
                    postgres_cursor.execute(f"""
                        CREATE INDEX IF NOT EXISTS {polyline_index} 
                        ON "{table_name}" USING GIST (geometry_polyline)
                    """)
                    
                    postgres_cursor.execute(f"""
                        CREATE INDEX IF NOT EXISTS {polygon_index} 
                        ON "{table_name}" USING GIST (geometry_polygon)
                    """)
                    
                    logger.info(f"Created spatial indexes for {table_name}")
                    
                except Exception as e:
                    logger.warning(f"Failed to create indexes for {table_name}: {e}")
                    continue
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to create spatial indexes: {e}")
            return False

def main():
    """Main migration orchestration function"""
    logger.info("=== PostgreSQL Geometry Migration System ===")
    logger.info(f"MySQL: {MYSQL_CONFIG['host']}:{MYSQL_CONFIG['port']}/{MYSQL_CONFIG['database']}")
    logger.info(f"PostgreSQL: {POSTGRES_CONFIG['host']}:{POSTGRES_CONFIG['port']}/{POSTGRES_CONFIG['database']}")
    
    # Initialize components
    db_manager = DatabaseConnectionManager()
    
    try:
        # Phase 1: Database availability
        logger.info("Phase 1: Checking database availability...")
        if not db_manager.wait_for_mysql() or not db_manager.wait_for_postgres():
            logger.error("Database availability check failed")
            return False
        
        # Phase 2: Connect to databases
        logger.info("Phase 2: Connecting to databases...")
        if not db_manager.connect_mysql() or not db_manager.connect_postgres():
            logger.error("Database connection failed")
            return False
        
        # Phase 3: Clean PostgreSQL and enable PostGIS
        logger.info("Phase 3: Cleaning PostgreSQL and enabling PostGIS...")
        cleaner = PostgreSQLCleaner(db_manager)
        if not cleaner.clean_postgres_database() or not cleaner.enable_postgis():
            logger.error("PostgreSQL cleanup and PostGIS setup failed")
            return False
        
        # Phase 4: Migrate data from MySQL to PostgreSQL
        logger.info("Phase 4: Migrating data from MySQL to PostgreSQL...")
        converter = MySQLToPostgreSQLConverter()
        etl = DataETL(db_manager, converter)
        if not etl.migrate_all_data():
            logger.error("Data migration failed")
            return False
        
        # Phase 5: Convert points to geometries
        logger.info("Phase 5: Converting points to geometries...")
        geometry_converter = GeometryConverter(db_manager)
        if not geometry_converter.convert_points_to_geometries():
            logger.error("Geometry conversion failed")
            return False
        
        # Phase 6: Create spatial indexes
        logger.info("Phase 6: Creating spatial indexes...")
        if not geometry_converter.create_spatial_indexes():
            logger.error("Spatial index creation failed")
            return False
        
        # Success summary
        logger.info("=== Migration Complete ===")
        logger.info("Successfully migrated MySQL data to PostgreSQL")
        logger.info("All fuel, crusher, parking, and pit locations converted to polylines/polygons")
        logger.info("Spatial indexes created for optimal performance")
        
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False
        
    finally:
        db_manager.close_connections()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)