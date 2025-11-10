#!/usr/bin/env python3
"""
Direct MySQL to PostgreSQL Migration with Geometry Creation
Directly copies data from MySQL to PostgreSQL and creates spatial geometries
"""

import os
import sys
import time
import logging
import mysql.connector
import psycopg2
from psycopg2.extras import RealDictCursor

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

def wait_for_databases():
    """Wait for both databases to be available"""
    logger.info("Waiting for databases...")
    
    # Wait for MySQL
    for i in range(60):
        try:
            conn = mysql.connector.connect(**MYSQL_CONFIG)
            conn.close()
            logger.info("MySQL is ready")
            break
        except:
            time.sleep(1)
    
    # Wait for PostgreSQL
    for i in range(60):
        try:
            conn = psycopg2.connect(**POSTGRES_CONFIG)
            conn.close()
            logger.info("PostgreSQL is ready")
            break
        except:
            time.sleep(1)

def setup_postgres():
    """Setup PostgreSQL with PostGIS and clean schema"""
    logger.info("Setting up PostgreSQL...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Clean and setup
    cursor.execute("DROP SCHEMA IF EXISTS public CASCADE;")
    cursor.execute("CREATE SCHEMA public;")
    cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    
    conn.close()
    logger.info("PostgreSQL setup complete")

def get_mysql_tables():
    """Get list of tables from MySQL"""
    conn = mysql.connector.connect(**MYSQL_CONFIG)
    cursor = conn.cursor()
    
    cursor.execute("SHOW TABLES")
    tables = [table[0] for table in cursor.fetchall()]
    
    conn.close()
    return tables

def create_locations_table():
    """Create a unified locations table with geometry support"""
    logger.info("Creating locations table...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Create locations table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS locations (
            id SERIAL PRIMARY KEY,
            source_table TEXT,
            source_id TEXT,
            location_name TEXT,
            category TEXT,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            altitude DOUBLE PRECISION,
            x_coord DOUBLE PRECISION,
            y_coord DOUBLE PRECISION,
            z_coord DOUBLE PRECISION,
            geometry_point GEOMETRY(POINT, 4326),
            geometry_polyline GEOMETRY(LINESTRING, 4326),
            geometry_polygon GEOMETRY(POLYGON, 4326),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create spatial indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_point ON locations USING GIST (geometry_point);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_polyline ON locations USING GIST (geometry_polyline);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_polygon ON locations USING GIST (geometry_polygon);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_category ON locations (category);")
    
    conn.close()
    logger.info("Locations table created")

def extract_coordinates_from_mysql():
    """Extract coordinate data from MySQL tables"""
    logger.info("Extracting coordinates from MySQL...")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_conn.autocommit = True
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    postgres_cursor = postgres_conn.cursor()
    
    tables = get_mysql_tables()
    location_count = 0
    
    for table_name in tables:
        logger.info(f"Processing table: {table_name}")
        
        try:
            # Get table structure
            mysql_cursor.execute(f"DESCRIBE `{table_name}`")
            columns = [col['Field'] for col in mysql_cursor.fetchall()]
            
            # Look for coordinate columns
            coord_columns = []
            lat_col = None
            lon_col = None
            x_col = None
            y_col = None
            z_col = None
            name_col = None
            
            for col in columns:
                col_lower = col.lower()
                if 'lat' in col_lower and not lat_col:
                    lat_col = col
                elif 'lon' in col_lower and not lon_col:
                    lon_col = col
                elif col_lower in ['x', 'coord_x', 'pos_x'] and not x_col:
                    x_col = col
                elif col_lower in ['y', 'coord_y', 'pos_y'] and not y_col:
                    y_col = col
                elif col_lower in ['z', 'coord_z', 'pos_z'] and not z_col:
                    z_col = col
                elif any(name_part in col_lower for name_part in ['name', 'label', 'description', 'tag']) and not name_col:
                    name_col = col
            
            # Skip if no coordinate columns found
            if not (lat_col and lon_col) and not (x_col and y_col):
                continue
            
            # Determine category from table name
            category = 'other'
            table_lower = table_name.lower()
            if any(word in table_lower for word in ['fuel', 'refuel']):
                category = 'fuel'
            elif any(word in table_lower for word in ['crush', 'mill']):
                category = 'crusher'
            elif any(word in table_lower for word in ['park']):
                category = 'parking'
            elif any(word in table_lower for word in ['pit', 'dump']):
                category = 'pit'
            
            # Get data from table
            mysql_cursor.execute(f"SELECT * FROM `{table_name}` LIMIT 10000")
            rows = mysql_cursor.fetchall()
            
            for row in rows:
                try:
                    # Extract coordinates
                    latitude = row.get(lat_col) if lat_col else None
                    longitude = row.get(lon_col) if lon_col else None
                    x_coord = row.get(x_col) if x_col else None
                    y_coord = row.get(y_col) if y_col else None
                    z_coord = row.get(z_col) if z_col else None
                    
                    # Skip if no valid coordinates
                    if not ((latitude and longitude) or (x_coord and y_coord)):
                        continue
                    
                    # Get location name
                    location_name = row.get(name_col) if name_col else f"{table_name}_{row.get('_OID_', row.get('id', 'unknown'))}"
                    
                    # Get source ID
                    source_id = str(row.get('_OID_', row.get('id', 'unknown')))
                    
                    # Insert into locations table
                    postgres_cursor.execute("""
                        INSERT INTO locations (
                            source_table, source_id, location_name, category,
                            latitude, longitude, x_coord, y_coord, z_coord,
                            geometry_point
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 
                                 ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                    """, (
                        table_name, source_id, location_name, category,
                        latitude, longitude, x_coord, y_coord, z_coord,
                        longitude or x_coord, latitude or y_coord
                    ))
                    
                    location_count += 1
                    
                except Exception as e:
                    logger.debug(f"Failed to process row in {table_name}: {e}")
                    continue
        
        except Exception as e:
            logger.warning(f"Failed to process table {table_name}: {e}")
            continue
    
    mysql_conn.close()
    postgres_conn.close()
    
    logger.info(f"Extracted {location_count} locations")
    return location_count

def create_geometries():
    """Create polylines and polygons from grouped points"""
    logger.info("Creating geometries from grouped points...")
    
    conn = psycopg2.connect(**POSTGRES_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    
    # Group locations by category and name
    cursor.execute("""
        SELECT category, location_name, 
               array_agg(longitude ORDER BY id) as lons,
               array_agg(latitude ORDER BY id) as lats,
               count(*) as point_count
        FROM locations 
        WHERE longitude IS NOT NULL AND latitude IS NOT NULL
        GROUP BY category, location_name
        HAVING count(*) >= 3
    """)
    
    groups = cursor.fetchall()
    geometry_count = 0
    
    for group in groups:
        try:
            lons = group['lons']
            lats = group['lats']
            
            if len(lons) < 3:
                continue
            
            # Create linestring
            points = [f"{lon} {lat}" for lon, lat in zip(lons, lats)]
            linestring_wkt = f"LINESTRING({', '.join(points)})"
            
            # Create polygon if we have enough points and can close it
            polygon_wkt = None
            if len(points) >= 4:
                # Close the polygon
                if points[0] != points[-1]:
                    points.append(points[0])
                polygon_wkt = f"POLYGON(({', '.join(points)}))"
            
            # Update all locations in this group
            cursor.execute("""
                UPDATE locations 
                SET geometry_polyline = ST_GeomFromText(%s, 4326),
                    geometry_polygon = CASE WHEN %s IS NOT NULL THEN ST_GeomFromText(%s, 4326) ELSE NULL END
                WHERE category = %s AND location_name = %s
            """, (linestring_wkt, polygon_wkt, polygon_wkt, group['category'], group['location_name']))
            
            geometry_count += cursor.rowcount
            
        except Exception as e:
            logger.warning(f"Failed to create geometry for {group['category']}/{group['location_name']}: {e}")
            continue
    
    conn.close()
    logger.info(f"Created geometries for {geometry_count} locations")

def main():
    """Main migration function"""
    logger.info("=== Direct MySQL to PostgreSQL Migration ===")
    
    try:
        # Setup
        wait_for_databases()
        setup_postgres()
        create_locations_table()
        
        # Extract and process data
        location_count = extract_coordinates_from_mysql()
        
        if location_count > 0:
            create_geometries()
        
        logger.info("=== Migration Complete ===")
        logger.info(f"Total locations processed: {location_count}")
        logger.info("Connect to PostgreSQL and query the 'locations' table to see your data!")
        logger.info("Example queries:")
        logger.info("  SELECT * FROM locations WHERE category = 'fuel';")
        logger.info("  SELECT category, count(*) FROM locations GROUP BY category;")
        logger.info("  SELECT * FROM locations WHERE geometry_polyline IS NOT NULL;")
        
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)