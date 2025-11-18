#!/usr/bin/env python3
"""
Extract travel data from MySQL with course geometry and location names, store in PostgreSQL
Groups courses by travel and filters only courses that are part of travels
"""

import mysql.connector
import psycopg2
import logging
import math
import hashlib
from typing import Dict, List, Any
import json

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database configurations
MYSQL_CONFIG = {
    'host': 'mysql',
    'port': 3306,
    'database': 'kmtsdb',
    'user': 'kmtsuser',
    'password': 'kmtspass'
}

POSTGRES_CONFIG = {
    'host': 'postgres',
    'port': 5432,
    'database': 'infrastructure_db',
    'user': 'infra_user',
    'password': 'infra_password'
}

# UTM Zone 50S conversion (Western Australia - Yandi mining area)
LAT_OFFSET = -23.0
LNG_OFFSET = 120.0
NORTHING_ORIGIN = 7337000
EASTING_ORIGIN = 676000

def transform_local_to_latlon(x_mm, y_mm):
    """Transform local mine coordinates (mm) to WGS84 lat/lon using UTM Zone 50S"""
    x_meters = x_mm / 1000.0
    y_meters = y_mm / 1000.0
    
    easting = EASTING_ORIGIN + x_meters
    northing = NORTHING_ORIGIN + y_meters
    
    latitude = LAT_OFFSET + (northing - NORTHING_ORIGIN) / 111000.0
    longitude = LNG_OFFSET + (easting - EASTING_ORIGIN) / (111000.0 * abs(math.cos(math.radians(LAT_OFFSET))))
    
    return latitude, longitude

def extract_travels_with_courses(mysql_cursor):
    """Extract travel data with course geometry and location names"""
    # Step 1: Get unique travels with their course and location info
    logger.info("Step 1: Fetching unique travels with course and location info...")
    travel_query = """
        SELECT DISTINCT
            t._OID_ as travel_oid,
            t._CID_ as travel_cid,
            t._segment__course,
            t._fromloc,
            t._toloc,
            t.active,
            t.closed,
            t.segment__start,
            t.segment__end,
            -- From location name
            from_loc.name as from_location_name,
            from_loc._CID_ as from_location_cid,
            -- To location name
            to_loc.name as to_location_name,
            to_loc._CID_ as to_location_cid,
            -- Course data
            c._OID_ as course_oid,
            c._CID_ as course_cid,
            c.road_type,
            c.aht_profile_name,
            c.course_attributes__value,
            c.coursegeometry__inflections,
            c._spline,
            c.inclination_factor,
            c.start_direction
        FROM travel t
        INNER JOIN course c ON t._segment__course = c._OID_
        INNER JOIN pit_loc from_loc ON t._fromloc = from_loc._OID_
        INNER JOIN pit_loc to_loc ON t._toloc = to_loc._OID_
        WHERE t._segment__course IS NOT NULL
    """
    
    mysql_cursor.execute(travel_query)
    travels = mysql_cursor.fetchall()
    logger.info(f"✅ Found {len(travels):,} unique travels")
    
    if not travels:
        return [], {}
    
    # Step 2: Get unique course CIDs from travels
    course_cids = set(t['course_cid'] for t in travels if t['course_cid'])
    logger.info(f"✅ Found {len(course_cids):,} unique courses")
    
    # Step 3: Fetch coordinates per course in batches to avoid memory issues
    logger.info("Step 2: Fetching coordinates for travel courses (processing in batches)...")
    course_cids_list = list(course_cids)
    coords_by_course = {}
    batch_size = 50  # Process 50 courses at a time (smaller batches = less memory)
    
    for i in range(0, len(course_cids_list), batch_size):
        batch_cids = course_cids_list[i:i + batch_size]
        placeholders = ','.join(['%s'] * len(batch_cids))
        coord_query = f"""
            SELECT
                ccxyz._CID_ as course_cid,
                ccxyz._OID_ as geometry_oid,
                ccxyz._IDX_ as coord_idx,
                ccxyz._coordinate as coord_oid,
                coord.coord_x,
                coord.coord_y,
                coord.coord_z,
                coord.latitude,
                coord.longitude,
                coord.altitude,
                coord.coord_heading,
                coord.coord_incl,
                coord.coord_status
            FROM course__coursegeometry__x_y_z ccxyz
            INNER JOIN coordinate coord ON coord._OID_ = ccxyz._coordinate
            WHERE ccxyz._CID_ IN ({placeholders})
            AND coord.coord_x IS NOT NULL
            AND coord.coord_y IS NOT NULL
            ORDER BY ccxyz._CID_, ccxyz._IDX_
        """
        
        mysql_cursor.execute(coord_query, batch_cids)
        
        # Process coordinates in smaller chunks and immediately add to dict (don't accumulate)
        rows_processed = 0
        while True:
            rows = mysql_cursor.fetchmany(5000)  # Fetch 5k rows at a time
            if not rows:
                break
            
            # Group by course immediately
            for coord in rows:
                course_cid = coord['course_cid']
                if course_cid not in coords_by_course:
                    coords_by_course[course_cid] = []
                coords_by_course[course_cid].append(coord)
            
            rows_processed += len(rows)
            # Free the rows list immediately
            del rows
        
        total_coords = sum(len(coords) for coords in coords_by_course.values())
        logger.info(f"  Processed {min(i + batch_size, len(course_cids_list))}/{len(course_cids_list)} courses, {total_coords:,} total coordinates")
    
    logger.info(f"✅ Found {sum(len(coords) for coords in coords_by_course.values()):,} coordinate records for {len(coords_by_course):,} courses")
    
    # Return travels and coords_by_course separately to avoid creating huge intermediate list
    return travels, coords_by_course

def group_travels_with_coordinates(travels_list, coords_by_course):
    """Group by from/to location pairs only - one road per unique location connection"""
    # Group by (from_location, to_location) only - ignore course
    # Multiple travels/courses can connect the same locations
    connection_key_to_travel = {}
    
    for travel in travels_list:
        from_name = travel.get('from_location_name')
        to_name = travel.get('to_location_name')
        course_cid = travel.get('course_cid')
        
        if not from_name or not to_name or not course_cid:
            continue
        
        # Create unique key for this connection (from->to only, not course)
        connection_key = (from_name, to_name)
        
        # Only keep the first travel for each unique location-to-location connection
        # This ensures one road per unique location pair
        if connection_key not in connection_key_to_travel:
            connection_key_to_travel[connection_key] = travel
    
    logger.info(f"✅ Found {len(connection_key_to_travel):,} unique location-to-location connections")
    
    # Now create travel entries with coordinates
    travels = {}
    for connection_key, travel in connection_key_to_travel.items():
        from_name, to_name = connection_key
        course_cid = travel.get('course_cid')
        
        # Use a composite key for the travel entry (from->to only)
        travel_key = f"{from_name}->{to_name}"
        
        travels[travel_key] = {
            'travel_cid': travel.get('travel_cid'),
            'from_location_name': from_name,
            'to_location_name': to_name,
            'from_location_cid': travel.get('from_location_cid'),
            'to_location_cid': travel.get('to_location_cid'),
            'active': travel.get('active'),
            'closed': travel.get('closed'),
            'segment_start': travel.get('segment__start'),
            'segment_end': travel.get('segment__end'),
            'course_oid': travel.get('course_oid'),
            'course_cid': course_cid,
            'road_type': travel.get('road_type'),
            'aht_profile_name': travel.get('aht_profile_name'),
            'course_attributes': travel.get('course_attributes__value'),
            'inflections': travel.get('coursegeometry__inflections'),
            'spline': travel.get('_spline'),
            'inclination_factor': travel.get('inclination_factor'),
            'start_direction': travel.get('start_direction'),
            'seen_coords': set(),
            'coordinates': []
        }
        
        # Add coordinates for this course (only once per course)
        if course_cid in coords_by_course:
            for coord in coords_by_course[course_cid]:
                coord_oid = coord['coord_oid']
                # Only add coordinate if we haven't seen it before
                if coord_oid not in travels[travel_key]['seen_coords']:
                    travels[travel_key]['seen_coords'].add(coord_oid)
                    travels[travel_key]['coordinates'].append({
                        'idx': coord['coord_idx'],
                        'coord_oid': coord_oid,
                        'coord_x': coord.get('coord_x'),
                        'coord_y': coord.get('coord_y'),
                        'coord_z': coord.get('coord_z'),
                        'coord_heading': coord.get('coord_heading'),
                        'coord_incl': coord.get('coord_incl'),
                        'coord_status': coord.get('coord_status'),
                        'latitude': coord.get('latitude'),
                        'longitude': coord.get('longitude'),
                        'altitude': coord.get('altitude')
                    })
    
    # Sort coordinates by index for each travel
    for travel_key in travels:
        travels[travel_key]['coordinates'].sort(key=lambda c: c['idx'])
    
    return travels

def main():
    logger.info("=== Extracting Travel Data with Courses ===")
    
    mysql_conn = mysql.connector.connect(**MYSQL_CONFIG)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    postgres_conn = psycopg2.connect(**POSTGRES_CONFIG)
    postgres_cursor = postgres_conn.cursor()
    
    # Create travels table
    logger.info("Creating travels table in PostgreSQL...")
    postgres_cursor.execute("""
        DROP TABLE IF EXISTS travels CASCADE;
        CREATE TABLE travels (
            travel_id SERIAL PRIMARY KEY,
            travel_oid VARCHAR(32) NOT NULL UNIQUE,
            travel_cid VARCHAR(32),
            course_oid VARCHAR(32),
            course_cid VARCHAR(32),
            from_location_name VARCHAR(255),
            to_location_name VARCHAR(255),
            from_location_cid VARCHAR(32),
            to_location_cid VARCHAR(32),
            road_type VARCHAR(100),
            aht_profile_name VARCHAR(255),
            course_attributes_value INTEGER,
            inflections TEXT,
            spline_oid VARCHAR(32),
            inclination_factor SMALLINT,
            start_direction SMALLINT,
            active BOOLEAN,
            closed BOOLEAN,
            segment_start INTEGER,
            segment_end INTEGER,
            total_points INTEGER NOT NULL,
            travel_linestring GEOMETRY(LineString, 4326),
            travel_length_m DOUBLE PRECISION,
            start_latitude DOUBLE PRECISION,
            start_longitude DOUBLE PRECISION,
            end_latitude DOUBLE PRECISION,
            end_longitude DOUBLE PRECISION,
            all_coordinate_oids TEXT,
            -- Aggregate coordinate data
            min_coord_x DOUBLE PRECISION,
            max_coord_x DOUBLE PRECISION,
            avg_coord_x DOUBLE PRECISION,
            min_coord_y DOUBLE PRECISION,
            max_coord_y DOUBLE PRECISION,
            avg_coord_y DOUBLE PRECISION,
            min_coord_z DOUBLE PRECISION,
            max_coord_z DOUBLE PRECISION,
            avg_coord_z DOUBLE PRECISION,
            min_coord_heading DOUBLE PRECISION,
            max_coord_heading DOUBLE PRECISION,
            avg_coord_heading DOUBLE PRECISION,
            min_coord_incl DOUBLE PRECISION,
            max_coord_incl DOUBLE PRECISION,
            avg_coord_incl DOUBLE PRECISION,
            min_coord_status DOUBLE PRECISION,
            max_coord_status DOUBLE PRECISION,
            avg_coord_status DOUBLE PRECISION,
            min_latitude DOUBLE PRECISION,
            max_latitude DOUBLE PRECISION,
            avg_latitude DOUBLE PRECISION,
            min_longitude DOUBLE PRECISION,
            max_longitude DOUBLE PRECISION,
            avg_longitude DOUBLE PRECISION,
            min_altitude DOUBLE PRECISION,
            max_altitude DOUBLE PRECISION,
            avg_altitude DOUBLE PRECISION,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_travels_geom ON travels USING GIST(travel_linestring);
        CREATE INDEX idx_travels_from_location ON travels(from_location_name);
        CREATE INDEX idx_travels_to_location ON travels(to_location_name);
        CREATE INDEX idx_travels_road_type ON travels(road_type);
    """)
    postgres_conn.commit()
    logger.info("✅ Created travels table")
    
    # Extract travels first (this is small)
    logger.info("Extracting travel metadata...")
    travel_query = """
        SELECT DISTINCT
            t._OID_ as travel_oid,
            t._CID_ as travel_cid,
            t._segment__course,
            t._fromloc,
            t._toloc,
            t.active,
            t.closed,
            t.segment__start,
            t.segment__end,
            from_loc.name as from_location_name,
            from_loc._CID_ as from_location_cid,
            to_loc.name as to_location_name,
            to_loc._CID_ as to_location_cid,
            c._OID_ as course_oid,
            c._CID_ as course_cid,
            c.road_type,
            c.aht_profile_name,
            c.course_attributes__value,
            c.coursegeometry__inflections,
            c._spline,
            c.inclination_factor,
            c.start_direction
        FROM travel t
        INNER JOIN course c ON t._segment__course = c._OID_
        INNER JOIN pit_loc from_loc ON t._fromloc = from_loc._OID_
        INNER JOIN pit_loc to_loc ON t._toloc = to_loc._OID_
        WHERE t._segment__course IS NOT NULL
    """
    mysql_cursor.execute(travel_query)
    travels_list = mysql_cursor.fetchall()
    logger.info(f"✅ Found {len(travels_list):,} unique travels")
    
    if not travels_list:
        logger.info("No travels found, exiting")
        mysql_conn.close()
        postgres_conn.close()
        return
    
    # Get unique course CIDs and OIDs
    course_cids = set(t['course_cid'] for t in travels_list if t['course_cid'])
    course_oids = set(t['course_oid'] for t in travels_list if t['course_oid'])
    logger.info(f"✅ Found {len(course_cids):,} unique course CIDs")
    logger.info(f"✅ Found {len(course_oids):,} unique course OIDs")
    
    # Check for NULL course_cids
    null_course_cids = sum(1 for t in travels_list if not t.get('course_cid'))
    if null_course_cids > 0:
        logger.warning(f"⚠️  {null_course_cids} travels have NULL course_cid (will use course_oid instead)")
    
    # Use course_oid if course_cid is missing, otherwise use course_cid
    # Create a mapping: course_oid -> course_cid for lookup
    course_oid_to_cid = {}
    for t in travels_list:
        if t.get('course_oid') and t.get('course_cid'):
            course_oid_to_cid[t['course_oid']] = t['course_cid']
    
    # Use course_oids for fetching coordinates if we have more OIDs than CIDs
    if len(course_oids) > len(course_cids):
        logger.info(f"📊 Using course_oids for coordinate lookup ({len(course_oids)} > {len(course_cids)} CIDs)")
        course_ids_to_fetch = list(course_oids)
        use_oid = True
    else:
        course_ids_to_fetch = list(course_cids)
        use_oid = False
    
    # Process travels incrementally by course batches
    logger.info(f"📊 Processing {len(course_ids_to_fetch)} courses in batches of {batch_size}...")
    
    for i in range(0, len(course_ids_to_fetch), batch_size):
        batch_ids = course_ids_to_fetch[i:i + batch_size]
        logger.info(f"Processing batch {i//batch_size + 1}/{(len(course_ids_to_fetch) + batch_size - 1)//batch_size}: {len(batch_ids)} courses")
        
        # Fetch coordinates for this batch only
        placeholders = ','.join(['%s'] * len(batch_ids))
        if use_oid:
            # Use course_oid - need to join with course table to get the geometry
            coord_query = f"""
                SELECT
                    c._OID_ as course_oid,
                    c._CID_ as course_cid,
                    ccxyz._OID_ as geometry_oid,
                    ccxyz._IDX_ as coord_idx,
                    ccxyz._coordinate as coord_oid,
                    coord.coord_x,
                    coord.coord_y,
                    coord.coord_z,
                    coord.latitude,
                    coord.longitude,
                    coord.altitude,
                    coord.coord_heading,
                    coord.coord_incl,
                    coord.coord_status
                FROM course c
                INNER JOIN course__coursegeometry__x_y_z ccxyz ON ccxyz._CID_ = c._CID_
                INNER JOIN coordinate coord ON coord._OID_ = ccxyz._coordinate
                WHERE c._OID_ IN ({placeholders})
                AND coord.coord_x IS NOT NULL
                AND coord.coord_y IS NOT NULL
                ORDER BY c._OID_, ccxyz._IDX_
            """
        else:
            # Use course_cid
            coord_query = f"""
                SELECT
                    ccxyz._CID_ as course_cid,
                    ccxyz._OID_ as geometry_oid,
                    ccxyz._IDX_ as coord_idx,
                    ccxyz._coordinate as coord_oid,
                    coord.coord_x,
                    coord.coord_y,
                    coord.coord_z,
                    coord.latitude,
                    coord.longitude,
                    coord.altitude,
                    coord.coord_heading,
                    coord.coord_incl,
                    coord.coord_status
                FROM course__coursegeometry__x_y_z ccxyz
                INNER JOIN coordinate coord ON coord._OID_ = ccxyz._coordinate
                WHERE ccxyz._CID_ IN ({placeholders})
                AND coord.coord_x IS NOT NULL
                AND coord.coord_y IS NOT NULL
                ORDER BY ccxyz._CID_, ccxyz._IDX_
            """
        
        mysql_cursor.execute(coord_query, batch_ids)
        coords_by_course = {}
        while True:
            rows = mysql_cursor.fetchmany(5000)
            if not rows:
                break
            for coord in rows:
                # Use course_oid if available, otherwise course_cid
                if use_oid and coord.get('course_oid'):
                    course_key = coord['course_oid']
                else:
                    course_key = coord.get('course_cid')
                
                if course_key and course_key not in coords_by_course:
                    coords_by_course[course_key] = []
                if course_key:
                    coords_by_course[course_key].append(coord)
        
        # Process travels for courses in this batch
        if use_oid:
            batch_travels = [t for t in travels_list if t.get('course_oid') in batch_ids]
        else:
            batch_travels = [t for t in travels_list if t.get('course_cid') in batch_ids]
        
        for travel in batch_travels:
            from_name = travel.get('from_location_name')
            to_name = travel.get('to_location_name')
            course_cid = travel.get('course_cid')
            
            if not from_name or not to_name or not course_cid:
                continue
            
            # Check if we've already processed this connection (one road per unique location pair)
            connection_key = (from_name, to_name)
            if connection_key in seen_connections:
                continue
            seen_connections.add(connection_key)
            
            # Get coordinates for this course
            if course_cid not in coords_by_course:
                skipped += 1
                continue
            
            coords = coords_by_course[course_cid]
            if len(coords) < 2:
                skipped += 1
                continue
            
            # Sort coordinates by index
            coords = sorted(coords, key=lambda c: c.get('coord_idx', 0))
            
            # Create connection key for travel_oid
            travel_key = f"{from_name}->{to_name}"
            travel_oid = hashlib.md5(travel_key.encode()).hexdigest()[:16]
            
            # Transform coordinates to lat/lon
            latlon_points = []
            for coord in coords:
                if coord.get('coord_x') and coord.get('coord_y'):
                    lat, lon = transform_local_to_latlon(coord['coord_x'], coord['coord_y'])
                    latlon_points.append((lon, lat))
            
            if len(latlon_points) < 2:
                skipped += 1
                continue
            
            # Create WKT LineString
            wkt_coords = ', '.join([f"{lon} {lat}" for lon, lat in latlon_points])
            linestring_wkt = f"LINESTRING({wkt_coords})"
            
            # Get start and end points
            start_lon, start_lat = latlon_points[0]
            end_lon, end_lat = latlon_points[-1]
            
            # Calculate aggregates from coordinate data
            coord_x_values = [c.get('coord_x') for c in coords if c.get('coord_x') is not None]
            coord_y_values = [c.get('coord_y') for c in coords if c.get('coord_y') is not None]
            coord_z_values = [c.get('coord_z') for c in coords if c.get('coord_z') is not None]
            coord_heading_values = [c.get('coord_heading') for c in coords if c.get('coord_heading') is not None]
            coord_incl_values = [c.get('coord_incl') for c in coords if c.get('coord_incl') is not None]
            coord_status_values = [c.get('coord_status') for c in coords if c.get('coord_status') is not None]
            latitude_values = [c.get('latitude') for c in coords if c.get('latitude') is not None]
            longitude_values = [c.get('longitude') for c in coords if c.get('longitude') is not None]
            altitude_values = [c.get('altitude') for c in coords if c.get('altitude') is not None]
            
            def safe_agg(values):
                if not values:
                    return (None, None, None)
                return (min(values), max(values), sum(values) / len(values))
            
            min_x, max_x, avg_x = safe_agg(coord_x_values)
            min_y, max_y, avg_y = safe_agg(coord_y_values)
            min_z, max_z, avg_z = safe_agg(coord_z_values)
            min_heading, max_heading, avg_heading = safe_agg(coord_heading_values)
            min_incl, max_incl, avg_incl = safe_agg(coord_incl_values)
            min_status, max_status, avg_status = safe_agg(coord_status_values)
            min_lat, max_lat, avg_lat = safe_agg(latitude_values)
            min_lon, max_lon, avg_lon = safe_agg(longitude_values)
            min_alt, max_alt, avg_alt = safe_agg(altitude_values)
            
            try:
                postgres_cursor.execute("""
                    INSERT INTO travels (
                        travel_oid, travel_cid, course_oid, course_cid,
                        from_location_name, to_location_name,
                        from_location_cid, to_location_cid,
                        road_type, aht_profile_name, course_attributes_value,
                        inflections, spline_oid, inclination_factor, start_direction,
                        active, closed, segment_start, segment_end,
                        total_points, travel_linestring, travel_length_m,
                        start_latitude, start_longitude,
                        end_latitude, end_longitude,
                        all_coordinate_oids,
                        min_coord_x, max_coord_x, avg_coord_x,
                        min_coord_y, max_coord_y, avg_coord_y,
                        min_coord_z, max_coord_z, avg_coord_z,
                        min_coord_heading, max_coord_heading, avg_coord_heading,
                        min_coord_incl, max_coord_incl, avg_coord_incl,
                        min_coord_status, max_coord_status, avg_coord_status,
                        min_latitude, max_latitude, avg_latitude,
                        min_longitude, max_longitude, avg_longitude,
                        min_altitude, max_altitude, avg_altitude
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        ST_GeomFromText(%s, 4326),
                        ST_Length(ST_GeomFromText(%s, 4326)::geography),
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                """, (
                    travel_oid,
                    travel.get('travel_cid'),
                    travel.get('course_oid'),
                    travel.get('course_cid'),
                    travel.get('from_location_name'),
                    travel.get('to_location_name'),
                    travel.get('from_location_cid'),
                    travel.get('to_location_cid'),
                    travel.get('road_type'),
                    travel.get('aht_profile_name'),
                    travel.get('course_attributes__value'),
                    str(travel.get('coursegeometry__inflections', '')),
                    travel.get('_spline'),
                    travel.get('inclination_factor'),
                    travel.get('start_direction'),
                    bool(travel.get('active')) if travel.get('active') is not None else None,
                    bool(travel.get('closed')) if travel.get('closed') is not None else None,
                    travel.get('segment__start'),
                    travel.get('segment__end'),
                    len(coords),
                    linestring_wkt, linestring_wkt,
                    start_lat, start_lon, end_lat, end_lon,
                    ','.join([str(c.get('coord_oid', '')) for c in coords]),
                    min_x, max_x, avg_x, min_y, max_y, avg_y, min_z, max_z, avg_z,
                    min_heading, max_heading, avg_heading,
                    min_incl, max_incl, avg_incl,
                    min_status, max_status, avg_status,
                    min_lat, max_lat, avg_lat,
                    min_lon, max_lon, avg_lon,
                    min_alt, max_alt, avg_alt
                ))
                total_added += 1
                
                if total_added % 50 == 0:
                    logger.info(f"  Inserted {total_added} travels so far...")
                    postgres_conn.commit()
            
            except Exception as e:
                logger.error(f"Error inserting travel {travel_oid}: {e}")
                postgres_conn.rollback()  # Reset transaction after error
                skipped += 1
                continue
        
        # Free memory for this batch
        del coords_by_course, batch_travels
        postgres_conn.commit()
        logger.info(f"  Batch complete: {total_added} total travels inserted")
    
    postgres_conn.commit()
    logger.info(f"\n✅ Complete: Added {total_added} travels, skipped {skipped}")
    
    # Summary
    postgres_cursor.execute("""
        SELECT 
            COUNT(*) as total_travels,
            COUNT(DISTINCT from_location_name) as unique_from_locations,
            COUNT(DISTINCT to_location_name) as unique_to_locations,
            COUNT(DISTINCT road_type) as unique_road_types,
            ROUND(SUM(travel_length_m)::numeric, 2) as total_length_km
        FROM travels
    """)
    
    summary = postgres_cursor.fetchone()
    logger.info(f"\n=== TRAVELS SUMMARY ===")
    logger.info(f"Total travels: {summary[0]}")
    logger.info(f"Unique from locations: {summary[1]}")
    logger.info(f"Unique to locations: {summary[2]}")
    logger.info(f"Unique road types: {summary[3]}")
    logger.info(f"Total length: {summary[4] / 1000:.2f} km")
    
    mysql_conn.close()
    postgres_conn.close()

if __name__ == '__main__':
    main()

