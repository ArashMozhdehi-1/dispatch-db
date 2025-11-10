#!/usr/bin/env python3
"""
PostgreSQL Migration System with Geometry Conversion
Migrates MySQL data to PostgreSQL, decrypts AES coordinates, and converts locations to spatial geometries
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
from math import cos, radians

# Configuration Constants
AES_UUID_KEY = 'a8ba99bd-6871-4344-a227-4c2807ef5fbc'
WGS_ORIGIN_X = 1422754634  # mm
WGS_ORIGIN_Y = -272077520  # mm  
WGS_ORIGIN_Z = 528824      # mm
MINE_SCALE = 1.0
GPS_SCALE = 3.08
MINE_LAT = -22.74172628
MINE_LON = 119.25262554
BATCH_SIZE = 1000

# Database Configuration
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

if __name__ == "__main__":
    logger.info("PostgreSQL Geometry Migration System Starting...")
    
    # Initialize database manager
    db_manager = DatabaseConnectionManager()
    
    # Wait for databases to be available
    if not db_manager.wait_for_mysql() or not db_manager.wait_for_postgres():
        logger.error("Database availability check failed")
        sys.exit(1)
    
    # Connect to databases
    if not db_manager.connect_mysql() or not db_manager.connect_postgres():
        logger.error("Database connection failed")
        sys.exit(1)
    
    # Clean PostgreSQL and enable PostGIS
    cleaner = PostgreSQLCleaner(db_manager)
    if not cleaner.clean_postgres_database() or not cleaner.enable_postgis():
        logger.error("PostgreSQL cleanup and PostGIS setup failed")
        sys.exit(1)
    
    logger.info("Migration system initialized successfully")
    db_manager.close_connections()

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

class SchemaDataImporter:
    """Handles schema and data import from MySQL backup files"""
    
    def __init__(self, db_manager: DatabaseConnectionManager, converter: MySQLToPostgreSQLConverter):
        self.db_manager = db_manager
        self.converter = converter
        self.schema_success_count = 0
        self.schema_failure_count = 0
        self.data_success_count = 0
        self.data_failure_count = 0
    
    def import_schema_and_data(self) -> bool:
        """Import schema and data from SQL files"""
        try:
            # Import schema first
            if not self._import_schema():
                return False
            
            # Import data
            if not self._import_data():
                return False
            
            logger.info(f"Schema import: {self.schema_success_count} success, {self.schema_failure_count} failures")
            logger.info(f"Data import: {self.data_success_count} success, {self.data_failure_count} failures")
            return True
            
        except Exception as e:
            logger.error(f"Schema and data import failed: {e}")
            return False
    
    def _import_schema(self) -> bool:
        """Import database schema"""
        schema_file = '/app/frontrunnerv3_dbschema.sql'
        if not os.path.exists(schema_file):
            logger.error(f"Schema file not found: {schema_file}")
            return False
        
        logger.info("Importing database schema...")
        sql_content = self.converter.handle_encoding_fallback(schema_file)
        if not sql_content:
            return False
        
        # Convert MySQL syntax to PostgreSQL
        sql_content = self.converter.convert_mysql_to_postgres(sql_content)
        
        # Execute schema statements
        return self._execute_sql_statements(sql_content, "schema")
    
    def _import_data(self) -> bool:
        """Import database data"""
        data_file = '/app/backup.sql'
        if not os.path.exists(data_file):
            logger.error(f"Data file not found: {data_file}")
            return False
        
        logger.info("Importing database data...")
        sql_content = self.converter.handle_encoding_fallback(data_file)
        if not sql_content:
            return False
        
        # Convert MySQL syntax to PostgreSQL
        sql_content = self.converter.convert_mysql_to_postgres(sql_content)
        
        # Execute data statements
        return self._execute_sql_statements(sql_content, "data")
    
    def _execute_sql_statements(self, sql_content: str, statement_type: str) -> bool:
        """Execute SQL statements with error handling"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip()]
            
            report_interval = 100 if statement_type == "schema" else 1000
            
            for i, statement in enumerate(statements):
                try:
                    # Skip empty statements and comments
                    if not statement or statement.startswith('--') or statement.startswith('/*'):
                        continue
                    
                    cursor.execute(statement)
                    
                    if statement_type == "schema":
                        self.schema_success_count += 1
                    else:
                        self.data_success_count += 1
                    
                    # Progress reporting
                    if (i + 1) % report_interval == 0:
                        logger.info(f"Processed {i + 1} {statement_type} statements")
                
                except Exception as e:
                    if statement_type == "schema":
                        self.schema_failure_count += 1
                    else:
                        self.data_failure_count += 1
                    
                    logger.warning(f"Failed to execute {statement_type} statement {i + 1}: {e}")
                    continue
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to execute {statement_type} statements: {e}")
            return Falseclass AES
Decryptor:
    """Handles AES decryption of coordinate data"""
    
    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager
    
    def decrypt_coordinates(self, encrypted_data: bytes) -> Optional[Tuple[float, float, float, float, float, float]]:
        """Decrypt AES encrypted coordinate data using MySQL"""
        try:
            if not encrypted_data:
                return None
            
            cursor = self.db_manager.mysql_conn.cursor()
            
            # Use MySQL AES_DECRYPT function
            query = "SELECT AES_DECRYPT(%s, %s) as decrypted"
            cursor.execute(query, (encrypted_data, AES_UUID_KEY))
            result = cursor.fetchone()
            
            if not result or not result[0]:
                return None
            
            # Parse tab-separated values
            decrypted_str = result[0].decode('utf-8')
            values = decrypted_str.split('\t')
            
            if len(values) != 6:
                logger.warning(f"Expected 6 values, got {len(values)}: {values}")
                return None
            
            # Convert to floats
            x, y, z, heading, inclination, status = map(float, values)
            return (x, y, z, heading, inclination, status)
            
        except Exception as e:
            logger.debug(f"Decryption failed: {e}")
            return None

class CoordinateTranslator:
    """Translates mine-local coordinates to WGS84"""
    
    @staticmethod
    def translate_mine_coords_to_wgs84(x: float, y: float, z: float) -> Tuple[float, float, float]:
        """Translate mine coordinates to WGS84 lat/lon/alt"""
        try:
            # Apply mine scale factor
            x_scaled = x * MINE_SCALE
            y_scaled = y * MINE_SCALE
            z_scaled = z * MINE_SCALE
            
            # Apply WGS84 offset
            wgs_x = WGS_ORIGIN_X + x_scaled
            wgs_y = WGS_ORIGIN_Y + y_scaled
            wgs_z = WGS_ORIGIN_Z + z_scaled
            
            # Convert to geographic coordinates
            # 1 degree ≈ 111,320 meters
            lat = MINE_LAT + (wgs_y / 111320000)
            lon = MINE_LON + (wgs_x / (111320000 * cos(radians(MINE_LAT))))
            alt = wgs_z / 1000.0  # mm to meters
            
            return (lat, lon, alt)
            
        except Exception as e:
            logger.error(f"Coordinate translation failed: {e}")
            return (0.0, 0.0, 0.0)

class ColumnManager:
    """Manages addition of decrypted and geometry columns"""
    
    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager
    
    def add_decrypted_columns(self) -> bool:
        """Add decrypted coordinate and geometry columns to tables"""
        try:
            logger.info("Adding decrypted and geometry columns...")
            cursor = self.db_manager.postgres_conn.cursor()
            
            # Find tables with coordinate columns
            coordinate_tables = self._find_coordinate_tables()
            
            for table_name in coordinate_tables:
                try:
                    # Add decrypted coordinate columns
                    alter_sql = f"""
                    ALTER TABLE "{table_name}"
                    ADD COLUMN IF NOT EXISTS decrypted_x DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS decrypted_y DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS decrypted_z DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS decrypted_heading DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS decrypted_inclination DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS decrypted_status DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS altitude DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS geometry_polyline GEOMETRY(LINESTRING, 4326),
                    ADD COLUMN IF NOT EXISTS geometry_polygon GEOMETRY(POLYGON, 4326)
                    """
                    
                    cursor.execute(alter_sql)
                    logger.info(f"Added columns to table: {table_name}")
                    
                except Exception as e:
                    logger.warning(f"Failed to add columns to {table_name}: {e}")
                    continue
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to add decrypted columns: {e}")
            return False
    
    def _find_coordinate_tables(self) -> List[str]:
        """Find tables with coordinate columns"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            
            # Query for tables with coordinate-related columns
            query = """
            SELECT DISTINCT table_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND (column_name LIKE '%pose_aes%' 
                 OR column_name LIKE '%coordinate%' 
                 OR column_name LIKE '%shapeloc%' 
                 OR column_name LIKE '%shapepath%')
            """
            
            cursor.execute(query)
            tables = [row[0] for row in cursor.fetchall()]
            
            logger.info(f"Found {len(tables)} tables with coordinate data: {tables}")
            return tables
            
        except Exception as e:
            logger.error(f"Failed to find coordinate tables: {e}")
            return []class
 GeometryConverter:
    """Converts point locations to polylines and polygons"""
    
    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager
        self.functional_categories = ['fuel', 'crusher', 'parking', 'pit']
    
    def identify_functional_locations(self) -> Dict[str, List[Dict[str, Any]]]:
        """Identify and group functional locations by category"""
        try:
            logger.info("Identifying functional locations...")
            cursor = self.db_manager.postgres_conn.cursor(cursor_factory=RealDictCursor)
            
            grouped_locations = {}
            
            # Query all tables for location data
            coordinate_tables = self._get_coordinate_tables()
            
            for table_name in coordinate_tables:
                try:
                    # Look for location name and category columns
                    query = f"""
                    SELECT * FROM "{table_name}" 
                    WHERE latitude IS NOT NULL 
                    AND longitude IS NOT NULL
                    """
                    
                    cursor.execute(query)
                    records = cursor.fetchall()
                    
                    for record in records:
                        location_info = self._extract_location_info(record, table_name)
                        if location_info:
                            category = location_info['category']
                            location_name = location_info['name']
                            
                            if category not in grouped_locations:
                                grouped_locations[category] = {}
                            
                            if location_name not in grouped_locations[category]:
                                grouped_locations[category][location_name] = []
                            
                            grouped_locations[category][location_name].append({
                                'table': table_name,
                                'oid': record.get('_OID_', record.get('id')),
                                'latitude': record['latitude'],
                                'longitude': record['longitude'],
                                'altitude': record.get('altitude', 0)
                            })
                
                except Exception as e:
                    logger.warning(f"Failed to process table {table_name}: {e}")
                    continue
            
            # Log summary
            for category, locations in grouped_locations.items():
                logger.info(f"Found {len(locations)} {category} locations")
            
            return grouped_locations
            
        except Exception as e:
            logger.error(f"Failed to identify functional locations: {e}")
            return {}
    
    def _extract_location_info(self, record: Dict, table_name: str) -> Optional[Dict[str, str]]:
        """Extract location name and category from record"""
        try:
            # Look for location name in various columns
            location_name = None
            for col in ['location_name', 'name', 'loc_name', 'description', 'label']:
                if col in record and record[col]:
                    location_name = str(record[col]).strip()
                    break
            
            if not location_name:
                # Use table name + OID as fallback
                oid = record.get('_OID_', record.get('id', 'unknown'))
                location_name = f"{table_name}_{oid}"
            
            # Determine category based on location name or table name
            category = 'other'
            location_lower = location_name.lower()
            table_lower = table_name.lower()
            
            for func_cat in self.functional_categories:
                if func_cat in location_lower or func_cat in table_lower:
                    category = func_cat
                    break
            
            # Special handling for pit locations
            if 'pit' in table_lower or 'dump' in table_lower:
                category = 'pit'
            
            return {
                'name': location_name,
                'category': category
            }
            
        except Exception as e:
            logger.debug(f"Failed to extract location info: {e}")
            return None
    
    def convert_points_to_geometries(self) -> bool:
        """Convert grouped points to polylines and polygons"""
        try:
            logger.info("Converting points to geometries...")
            
            # Get grouped locations
            grouped_locations = self.identify_functional_locations()
            
            geometry_count = 0
            
            for category, locations in grouped_locations.items():
                logger.info(f"Processing {category} locations...")
                
                for location_name, points in locations.items():
                    if len(points) < 3:
                        logger.debug(f"Skipping {location_name}: insufficient points ({len(points)})")
                        continue
                    
                    # Sort points by some logical order (could be timestamp, distance, etc.)
                    points = sorted(points, key=lambda p: (p['latitude'], p['longitude']))
                    
                    # Create geometries
                    polyline_wkt = self._create_linestring(points)
                    polygon_wkt = self._create_polygon(points)
                    
                    # Update database records
                    for point in points:
                        try:
                            self._update_geometry_columns(
                                point['table'], 
                                point['oid'], 
                                polyline_wkt, 
                                polygon_wkt
                            )
                            geometry_count += 1
                        except Exception as e:
                            logger.warning(f"Failed to update geometry for {point['oid']}: {e}")
            
            logger.info(f"Created geometries for {geometry_count} records")
            return True
            
        except Exception as e:
            logger.error(f"Failed to convert points to geometries: {e}")
            return False
    
    def _create_linestring(self, points: List[Dict]) -> str:
        """Create LINESTRING WKT from points"""
        if len(points) < 2:
            return None
        
        coords = []
        for point in points:
            coords.append(f"{point['longitude']} {point['latitude']}")
        
        return f"LINESTRING({', '.join(coords)})"
    
    def _create_polygon(self, points: List[Dict]) -> str:
        """Create POLYGON WKT from points"""
        if len(points) < 4:
            return None
        
        coords = []
        for point in points:
            coords.append(f"{point['longitude']} {point['latitude']}")
        
        # Close the polygon by adding first point at the end
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        
        return f"POLYGON(({', '.join(coords)}))"
    
    def _update_geometry_columns(self, table_name: str, oid: str, polyline_wkt: str, polygon_wkt: str):
        """Update geometry columns in database"""
        cursor = self.db_manager.postgres_conn.cursor()
        
        update_parts = []
        params = []
        
        if polyline_wkt:
            update_parts.append("geometry_polyline = ST_GeomFromText(%s, 4326)")
            params.append(polyline_wkt)
        
        if polygon_wkt:
            update_parts.append("geometry_polygon = ST_GeomFromText(%s, 4326)")
            params.append(polygon_wkt)
        
        if update_parts:
            # Try different OID column names
            oid_columns = ['_OID_', 'id', 'oid']
            
            for oid_col in oid_columns:
                try:
                    query = f"""
                    UPDATE "{table_name}" 
                    SET {', '.join(update_parts)}
                    WHERE "{oid_col}" = %s
                    """
                    params.append(oid)
                    cursor.execute(query, params)
                    
                    if cursor.rowcount > 0:
                        break
                        
                except Exception:
                    continue
    
    def _get_coordinate_tables(self) -> List[str]:
        """Get list of tables with coordinate data"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            
            query = """
            SELECT DISTINCT table_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND column_name IN ('latitude', 'longitude')
            """
            
            cursor.execute(query)
            return [row[0] for row in cursor.fetchall()]
            
        except Exception as e:
            logger.error(f"Failed to get coordinate tables: {e}")
            return []
    
    def create_spatial_indexes(self) -> bool:
        """Create spatial indexes on geometry columns"""
        try:
            logger.info("Creating spatial indexes...")
            cursor = self.db_manager.postgres_conn.cursor()
            
            coordinate_tables = self._get_coordinate_tables()
            
            for table_name in coordinate_tables:
                try:
                    # Create indexes for geometry columns
                    polyline_index = f"idx_{table_name}_geometry_polyline"
                    polygon_index = f"idx_{table_name}_geometry_polygon"
                    
                    cursor.execute(f"""
                        CREATE INDEX IF NOT EXISTS {polyline_index} 
                        ON "{table_name}" USING GIST (geometry_polyline)
                    """)
                    
                    cursor.execute(f"""
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
            return Falseclass B
atchProcessor:
    """Processes coordinate decryption and translation in batches"""
    
    def __init__(self, db_manager: DatabaseConnectionManager, decryptor: AESDecryptor, translator: CoordinateTranslator):
        self.db_manager = db_manager
        self.decryptor = decryptor
        self.translator = translator
        self.total_processed = 0
        self.total_success = 0
        self.total_failures = 0
    
    def decrypt_and_translate_coordinates(self) -> bool:
        """Process all tables with encrypted coordinates in batches"""
        try:
            logger.info("Starting coordinate decryption and translation...")
            
            # Find tables with encrypted coordinate columns
            encrypted_tables = self._find_encrypted_tables()
            
            for table_name in encrypted_tables:
                logger.info(f"Processing table: {table_name}")
                
                if not self._process_table_batches(table_name):
                    logger.warning(f"Failed to process table: {table_name}")
                    continue
            
            logger.info(f"Coordinate processing complete: {self.total_success} success, {self.total_failures} failures")
            return True
            
        except Exception as e:
            logger.error(f"Coordinate decryption and translation failed: {e}")
            return False
    
    def _find_encrypted_tables(self) -> List[str]:
        """Find tables with encrypted coordinate columns"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            
            query = """
            SELECT DISTINCT table_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND column_name LIKE '%pose_aes%'
            """
            
            cursor.execute(query)
            tables = [row[0] for row in cursor.fetchall()]
            
            logger.info(f"Found {len(tables)} tables with encrypted coordinates")
            return tables
            
        except Exception as e:
            logger.error(f"Failed to find encrypted tables: {e}")
            return []
    
    def _process_table_batches(self, table_name: str) -> bool:
        """Process a single table in batches"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            
            # Find the encrypted column name
            encrypted_column = self._find_encrypted_column(table_name)
            if not encrypted_column:
                logger.warning(f"No encrypted column found in {table_name}")
                return False
            
            # Get total record count
            cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{encrypted_column}" IS NOT NULL')
            total_records = cursor.fetchone()[0]
            
            if total_records == 0:
                logger.info(f"No encrypted records in {table_name}")
                return True
            
            logger.info(f"Processing {total_records} records in {table_name}")
            
            # Process in batches
            offset = 0
            batch_count = 0
            
            while offset < total_records:
                batch_success = self._process_batch(table_name, encrypted_column, offset)
                
                offset += BATCH_SIZE
                batch_count += 1
                
                if batch_count % 10 == 0:  # Report every 10 batches
                    logger.info(f"Processed {min(offset, total_records)}/{total_records} records in {table_name}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to process table {table_name}: {e}")
            return False
    
    def _find_encrypted_column(self, table_name: str) -> Optional[str]:
        """Find the encrypted column name in a table"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            
            query = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = %s
            AND column_name LIKE '%pose_aes%'
            LIMIT 1
            """
            
            cursor.execute(query, (table_name,))
            result = cursor.fetchone()
            
            return result[0] if result else None
            
        except Exception as e:
            logger.error(f"Failed to find encrypted column in {table_name}: {e}")
            return None
    
    def _process_batch(self, table_name: str, encrypted_column: str, offset: int) -> bool:
        """Process a single batch of records"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            
            # Get batch of encrypted records
            oid_column = self._find_oid_column(table_name)
            if not oid_column:
                logger.warning(f"No OID column found in {table_name}")
                return False
            
            query = f"""
            SELECT "{oid_column}", "{encrypted_column}"
            FROM "{table_name}" 
            WHERE "{encrypted_column}" IS NOT NULL
            ORDER BY "{oid_column}"
            LIMIT %s OFFSET %s
            """
            
            cursor.execute(query, (BATCH_SIZE, offset))
            records = cursor.fetchall()
            
            # Process each record in the batch
            for oid, encrypted_data in records:
                try:
                    self.total_processed += 1
                    
                    # Decrypt coordinates
                    decrypted = self.decryptor.decrypt_coordinates(encrypted_data)
                    if not decrypted:
                        self.total_failures += 1
                        continue
                    
                    x, y, z, heading, inclination, status = decrypted
                    
                    # Translate to WGS84
                    lat, lon, alt = self.translator.translate_mine_coords_to_wgs84(x, y, z)
                    
                    # Update record
                    update_query = f"""
                    UPDATE "{table_name}" 
                    SET decrypted_x = %s, decrypted_y = %s, decrypted_z = %s,
                        decrypted_heading = %s, decrypted_inclination = %s, decrypted_status = %s,
                        latitude = %s, longitude = %s, altitude = %s
                    WHERE "{oid_column}" = %s
                    """
                    
                    cursor.execute(update_query, (
                        x, y, z, heading, inclination, status,
                        lat, lon, alt, oid
                    ))
                    
                    self.total_success += 1
                    
                except Exception as e:
                    self.total_failures += 1
                    logger.debug(f"Failed to process record {oid}: {e}")
                    continue
            
            # Commit batch
            self.db_manager.postgres_conn.commit()
            return True
            
        except Exception as e:
            logger.error(f"Failed to process batch at offset {offset}: {e}")
            return False
    
    def _find_oid_column(self, table_name: str) -> Optional[str]:
        """Find the OID/ID column in a table"""
        try:
            cursor = self.db_manager.postgres_conn.cursor()
            
            # Try common OID column names
            oid_candidates = ['_OID_', 'id', 'oid', 'ID']
            
            for candidate in oid_candidates:
                query = """
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = %s
                AND column_name = %s
                """
                
                cursor.execute(query, (table_name, candidate))
                if cursor.fetchone():
                    return candidate
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to find OID column in {table_name}: {e}")
            return None

class BackupManager:
    """Handles PostgreSQL database backups"""
    
    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager
    
    def create_backup(self) -> bool:
        """Create timestamped PostgreSQL backup"""
        try:
            # Generate timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"postgres_migration_backup_{timestamp}.sql"
            backup_path = f"/app/backups/{backup_filename}"
            
            # Ensure backup directory exists
            os.makedirs("/app/backups", exist_ok=True)
            
            logger.info(f"Creating backup: {backup_filename}")
            
            # Build pg_dump command
            cmd = [
                "pg_dump",
                "--clean",
                "--if-exists", 
                "--create",
                "--column-inserts",
                "--no-owner",
                "--no-privileges",
                f"--host={POSTGRES_CONFIG['host']}",
                f"--port={POSTGRES_CONFIG['port']}",
                f"--username={POSTGRES_CONFIG['user']}",
                POSTGRES_CONFIG['database']
            ]
            
            # Set password environment variable
            env = os.environ.copy()
            env['PGPASSWORD'] = POSTGRES_CONFIG['password']
            
            # Execute pg_dump
            with open(backup_path, 'w') as backup_file:
                result = subprocess.run(
                    cmd,
                    stdout=backup_file,
                    stderr=subprocess.PIPE,
                    env=env,
                    text=True
                )
            
            if result.returncode != 0:
                logger.error(f"pg_dump failed: {result.stderr}")
                return False
            
            # Report backup size
            backup_size = os.path.getsize(backup_path)
            logger.info(f"Backup created successfully: {backup_path} ({backup_size:,} bytes)")
            
            return True
            
        except Exception as e:
            logger.error(f"Backup creation failed: {e}")
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
        
        # Phase 4: Import schema and data
        logger.info("Phase 4: Importing schema and data...")
        converter = MySQLToPostgreSQLConverter()
        importer = SchemaDataImporter(db_manager, converter)
        if not importer.import_schema_and_data():
            logger.error("Schema and data import failed")
            return False
        
        # Phase 5: Add decrypted and geometry columns
        logger.info("Phase 5: Adding decrypted and geometry columns...")
        column_manager = ColumnManager(db_manager)
        if not column_manager.add_decrypted_columns():
            logger.error("Column addition failed")
            return False
        
        # Phase 6: Decrypt and translate coordinates
        logger.info("Phase 6: Decrypting and translating coordinates...")
        decryptor = AESDecryptor(db_manager)
        translator = CoordinateTranslator()
        batch_processor = BatchProcessor(db_manager, decryptor, translator)
        if not batch_processor.decrypt_and_translate_coordinates():
            logger.error("Coordinate decryption and translation failed")
            return False
        
        # Phase 7: Convert points to geometries
        logger.info("Phase 7: Converting points to geometries...")
        geometry_converter = GeometryConverter(db_manager)
        if not geometry_converter.convert_points_to_geometries():
            logger.error("Geometry conversion failed")
            return False
        
        # Phase 8: Create spatial indexes
        logger.info("Phase 8: Creating spatial indexes...")
        if not geometry_converter.create_spatial_indexes():
            logger.error("Spatial index creation failed")
            return False
        
        # Phase 9: Create backup
        logger.info("Phase 9: Creating backup...")
        backup_manager = BackupManager(db_manager)
        if not backup_manager.create_backup():
            logger.error("Backup creation failed")
            return False
        
        # Success summary
        logger.info("=== Migration Complete ===")
        logger.info(f"Total records processed: {batch_processor.total_processed}")
        logger.info(f"Successful decryptions: {batch_processor.total_success}")
        logger.info(f"Failed decryptions: {batch_processor.total_failures}")
        logger.info("All fuel, crusher, parking, and pit locations converted to polylines/polygons")
        
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False
        
    finally:
        db_manager.close_connections()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)