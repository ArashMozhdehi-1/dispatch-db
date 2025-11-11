#!/usr/bin/env python3
"""
Transfer the 4 main tables with decrypted coordinates from MySQL to PostgreSQL
Tables: coordinate, dump_node, travel, operator_account
"""

import os
import sys
import time
import mysql.connector
import psycopg2
from psycopg2.extras import execute_batch
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

BATCH_SIZE = 1000

def create_coordinate_table(pg_cursor):
    """Create coordinate table in PostgreSQL with PostGIS geometry"""
    logger.info("Creating coordinate table...")
    pg_cursor.execute("""
        CREATE TABLE IF NOT EXISTS coordinate (
            _oid_ BIGINT PRIMARY KEY,
            coord_x DOUBLE PRECISION,
            coord_y DOUBLE PRECISION,
            coord_z DOUBLE PRECISION,
            coord_heading DOUBLE PRECISION,
            coord_incl DOUBLE PRECISION,
            coord_status DOUBLE PRECISION,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            altitude DOUBLE PRECISION,
            geom GEOMETRY(Point, 4326),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    logger.info("✓ coordinate table created")

def create_dump_node_table(pg_cursor):
    """Create dump_node table in PostgreSQL"""
    logger.info("Creating dump_node table...")
    pg_cursor.execute("""
        CREATE TABLE IF NOT EXISTS dump_node (
            _oid_ BIGINT PRIMARY KEY,
            coord_x DOUBLE PRECISION,
            coord_y DOUBLE PRECISION,
            coord_z DOUBLE PRECISION,
            coord_heading DOUBLE PRECISION,
            coord_incl DOUBLE PRECISION,
            coord_status DOUBLE PRECISION,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            altitude DOUBLE PRECISION,
            geom GEOMETRY(Point, 4326),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    logger.info("✓ dump_node table created")

def create_travel_table(pg_cursor):
    """Create travel table in PostgreSQL"""
    logger.info("Creating travel table...")
    pg_cursor.execute("""
        CREATE TABLE IF NOT EXISTS travel (
            _oid_ BIGINT PRIMARY KEY,
            dest_x DOUBLE PRECISION,
            dest_y DOUBLE PRECISION,
            dest_z DOUBLE PRECISION,
            dest_heading DOUBLE PRECISION,
            dest_incl DOUBLE PRECISION,
            dest_status DOUBLE PRECISION,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            altitude DOUBLE PRECISION,
            geom GEOMETRY(Point, 4326),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    logger.info("✓ travel table created")

def create_operator_account_table(pg_cursor):
    """Create operator_account table in PostgreSQL"""
    logger.info("Creating operator_account table...")
    pg_cursor.execute("""
        CREATE TABLE IF NOT EXISTS operator_account (
            _oid_ BIGINT PRIMARY KEY,
            ppin_plain VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    logger.info("✓ operator_account table created")

def transfer_coordinate_table(mysql_conn, pg_conn):
    """Transfer coordinate table with decrypted data"""
    logger.info("Transferring coordinate table...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    pg_cursor = pg_conn.cursor()
    
    # Get total count
    mysql_cursor.execute("SELECT COUNT(*) as count FROM coordinate WHERE latitude IS NOT NULL AND longitude IS NOT NULL")
    total = mysql_cursor.fetchone()['count']
    logger.info(f"Found {total} coordinates with lat/lon to transfer")
    
    if total == 0:
        logger.warning("No coordinates with lat/lon found!")
        return
    
    # Transfer in batches
    offset = 0
    transferred = 0
    
    while offset < total:
        mysql_cursor.execute(f"""
            SELECT _OID_, coord_x, coord_y, coord_z, coord_heading, coord_incl, coord_status,
                   latitude, longitude, altitude
            FROM coordinate
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            LIMIT {BATCH_SIZE} OFFSET {offset}
        """)
        
        batch = mysql_cursor.fetchall()
        if not batch:
            break
        
        # Insert into PostgreSQL with PostGIS geometry
        insert_sql = """
            INSERT INTO coordinate (_oid_, coord_x, coord_y, coord_z, coord_heading, coord_incl, coord_status,
                                   latitude, longitude, altitude, geom)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            ON CONFLICT (_oid_) DO UPDATE SET
                coord_x = EXCLUDED.coord_x,
                coord_y = EXCLUDED.coord_y,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                geom = EXCLUDED.geom
        """
        
        values = []
        for row in batch:
            values.append((
                row['_OID_'], row['coord_x'], row['coord_y'], row['coord_z'],
                row['coord_heading'], row['coord_incl'], row['coord_status'],
                row['latitude'], row['longitude'], row['altitude'],
                row['longitude'], row['latitude']  # For ST_MakePoint (lon, lat)
            ))
        
        execute_batch(pg_cursor, insert_sql, values)
        pg_conn.commit()
        
        transferred += len(batch)
        offset += BATCH_SIZE
        
        if transferred % 10000 == 0:
            logger.info(f"  Transferred {transferred}/{total} coordinates...")
    
    logger.info(f"✓ Transferred {transferred} coordinates")
    
    # Create spatial index
    logger.info("Creating spatial index on coordinate...")
    pg_cursor.execute("CREATE INDEX IF NOT EXISTS coordinate_geom_idx ON coordinate USING GIST (geom)")
    pg_conn.commit()
    logger.info("✓ Spatial index created")

def transfer_dump_node_table(mysql_conn, pg_conn):
    """Transfer dump_node table"""
    logger.info("Transferring dump_node table...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    pg_cursor = pg_conn.cursor()
    
    mysql_cursor.execute("SELECT COUNT(*) as count FROM dump_node WHERE latitude IS NOT NULL")
    total = mysql_cursor.fetchone()['count']
    logger.info(f"Found {total} dump_nodes to transfer")
    
    if total == 0:
        return
    
    offset = 0
    transferred = 0
    
    while offset < total:
        mysql_cursor.execute(f"""
            SELECT _OID_, coord_x, coord_y, coord_z, coord_heading, coord_incl, coord_status,
                   latitude, longitude, altitude
            FROM dump_node
            WHERE latitude IS NOT NULL
            LIMIT {BATCH_SIZE} OFFSET {offset}
        """)
        
        batch = mysql_cursor.fetchall()
        if not batch:
            break
        
        insert_sql = """
            INSERT INTO dump_node (_oid_, coord_x, coord_y, coord_z, coord_heading, coord_incl, coord_status,
                                  latitude, longitude, altitude, geom)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            ON CONFLICT (_oid_) DO NOTHING
        """
        
        values = [(
            row['_OID_'], row['coord_x'], row['coord_y'], row['coord_z'],
            row['coord_heading'], row['coord_incl'], row['coord_status'],
            row['latitude'], row['longitude'], row['altitude'],
            row['longitude'], row['latitude']
        ) for row in batch]
        
        execute_batch(pg_cursor, insert_sql, values)
        pg_conn.commit()
        
        transferred += len(batch)
        offset += BATCH_SIZE
    
    logger.info(f"✓ Transferred {transferred} dump_nodes")

def transfer_travel_table(mysql_conn, pg_conn):
    """Transfer travel table"""
    logger.info("Transferring travel table...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    pg_cursor = pg_conn.cursor()
    
    mysql_cursor.execute("SELECT COUNT(*) as count FROM travel WHERE latitude IS NOT NULL")
    total = mysql_cursor.fetchone()['count']
    logger.info(f"Found {total} travel records to transfer")
    
    if total == 0:
        return
    
    offset = 0
    transferred = 0
    
    while offset < total:
        mysql_cursor.execute(f"""
            SELECT _OID_, dest_x, dest_y, dest_z, dest_heading, dest_incl, dest_status,
                   latitude, longitude, altitude
            FROM travel
            WHERE latitude IS NOT NULL
            LIMIT {BATCH_SIZE} OFFSET {offset}
        """)
        
        batch = mysql_cursor.fetchall()
        if not batch:
            break
        
        insert_sql = """
            INSERT INTO travel (_oid_, dest_x, dest_y, dest_z, dest_heading, dest_incl, dest_status,
                               latitude, longitude, altitude, geom)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            ON CONFLICT (_oid_) DO NOTHING
        """
        
        values = [(
            row['_OID_'], row['dest_x'], row['dest_y'], row['dest_z'],
            row['dest_heading'], row['dest_incl'], row['dest_status'],
            row['latitude'], row['longitude'], row['altitude'],
            row['longitude'], row['latitude']
        ) for row in batch]
        
        execute_batch(pg_cursor, insert_sql, values)
        pg_conn.commit()
        
        transferred += len(batch)
        offset += BATCH_SIZE
    
    logger.info(f"✓ Transferred {transferred} travel records")

def transfer_operator_account_table(mysql_conn, pg_conn):
    """Transfer operator_account table"""
    logger.info("Transferring operator_account table...")
    
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    pg_cursor = pg_conn.cursor()
    
    mysql_cursor.execute("SELECT COUNT(*) as count FROM operator_account")
    total = mysql_cursor.fetchone()['count']
    logger.info(f"Found {total} operator accounts to transfer")
    
    if total == 0:
        return
    
    mysql_cursor.execute("SELECT _OID_, ppin_plain FROM operator_account")
    batch = mysql_cursor.fetchall()
    
    insert_sql = """
        INSERT INTO operator_account (_oid_, ppin_plain)
        VALUES (%s, %s)
        ON CONFLICT (_oid_) DO NOTHING
    """
    
    values = [(row['_OID_'], row['ppin_plain']) for row in batch]
    execute_batch(pg_cursor, insert_sql, values)
    pg_conn.commit()
    
    logger.info(f"✓ Transferred {total} operator accounts")

def main():
    logger.info("=" * 80)
    logger.info("TRANSFERRING 4 MAIN TABLES WITH DECRYPTED DATA")
    logger.info("=" * 80)
    
    try:
        # Connect to databases
        logger.info("Connecting to databases...")
        mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
        pg_conn = psycopg2.connect(**POSTGRES_CONFIG)
        pg_cursor = pg_conn.cursor()
        
        # Enable PostGIS
        logger.info("Enabling PostGIS extension...")
        pg_cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        pg_conn.commit()
        
        # Create tables
        logger.info("\nStep 1: Creating tables in PostgreSQL...")
        create_coordinate_table(pg_cursor)
        create_dump_node_table(pg_cursor)
        create_travel_table(pg_cursor)
        create_operator_account_table(pg_cursor)
        pg_conn.commit()
        
        # Transfer data
        logger.info("\nStep 2: Transferring data...")
        transfer_coordinate_table(mysql_conn, pg_conn)
        transfer_dump_node_table(mysql_conn, pg_conn)
        transfer_travel_table(mysql_conn, pg_conn)
        transfer_operator_account_table(mysql_conn, pg_conn)
        
        # Verify
        logger.info("\nStep 3: Verification...")
        pg_cursor.execute("SELECT COUNT(*) FROM coordinate")
        coord_count = pg_cursor.fetchone()[0]
        logger.info(f"  coordinate: {coord_count} records")
        
        pg_cursor.execute("SELECT COUNT(*) FROM dump_node")
        dump_count = pg_cursor.fetchone()[0]
        logger.info(f"  dump_node: {dump_count} records")
        
        pg_cursor.execute("SELECT COUNT(*) FROM travel")
        travel_count = pg_cursor.fetchone()[0]
        logger.info(f"  travel: {travel_count} records")
        
        pg_cursor.execute("SELECT COUNT(*) FROM operator_account")
        op_count = pg_cursor.fetchone()[0]
        logger.info(f"  operator_account: {op_count} records")
        
        logger.info("\n" + "=" * 80)
        logger.info("✅ TRANSFER COMPLETE!")
        logger.info("=" * 80)
        
        mysql_conn.close()
        pg_conn.close()
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
