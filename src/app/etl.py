#!/usr/bin/env python3
"""
ETL Script for Komatsu Dispatch Database
Processes CSV files and loads data into PostgreSQL with PostGIS
Creates Bézier curve roads from roadgraph control points
"""
import os
import sys
import pandas as pd
import numpy as np
import psycopg2
from pathlib import Path
import json

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'dispatch_db'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'komatsu_dispatch'),
    'user': os.getenv('DB_USER', 'dispatch_user'),
    'password': os.getenv('DB_PASSWORD', 'dispatch_password')
}

def get_db_connection():
    """Create database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"Database connection failed: {e}")
        return None

def create_tables():
    """Create database tables"""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor()
        
        # Enable PostGIS extension
        cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        
        # Create locations table
        cursor.execute("""
            DROP TABLE IF EXISTS locations CASCADE;
            CREATE TABLE locations (
                location_id INTEGER PRIMARY KEY,
                location_name VARCHAR(255),
                pit_name VARCHAR(255),
                region_name VARCHAR(255),
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                elevation_m DOUBLE PRECISION,
                unit_type VARCHAR(100),
                location_category VARCHAR(50) DEFAULT 'infrastructure',
                geometry GEOMETRY(POINT, 4326)
            );
        """)
        
        # Create unit_types table
        cursor.execute("""
            DROP TABLE IF EXISTS unit_types CASCADE;
            CREATE TABLE unit_types (
                unit_type_id INTEGER PRIMARY KEY,
                enum_type_id INTEGER,
                description VARCHAR(255),
                abbreviation VARCHAR(50),
                flags INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Create infrastructure table (for GraphQL compatibility)
        cursor.execute("""
            DROP TABLE IF EXISTS infrastructure CASCADE;
            CREATE TABLE infrastructure (
                location_id INTEGER PRIMARY KEY,
                location_name VARCHAR(100),
                pit_id INTEGER,
                region_id INTEGER,
                unit_id INTEGER,
                sign_id INTEGER,
                signpost INTEGER,
                shoptype INTEGER,
                gpstype INTEGER,
                geometry GEOMETRY(POLYGON, 4326),
                center_point GEOMETRY(POINT, 4326),
                radius_m NUMERIC(10,2),
                elevation_m NUMERIC(10,2),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Create lane_segments table
        cursor.execute("""
            DROP TABLE IF EXISTS lane_segments CASCADE;
            CREATE TABLE lane_segments (
                lane_id VARCHAR(255) PRIMARY KEY,
                road_id INTEGER,
                lane_name VARCHAR(255),
                geometry GEOMETRY(LINESTRING, 4326),
                length_m DOUBLE PRECISION,
                time_empty_seconds DOUBLE PRECISION,
                time_loaded_seconds DOUBLE PRECISION,
                is_closed BOOLEAN DEFAULT FALSE,
                direction VARCHAR(20) DEFAULT 'forward'
            );
        """)
        
        # Create spatial indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_geom ON locations USING GIST (geometry);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_segments_geom ON lane_segments USING GIST (geometry);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_segments_road_id ON lane_segments (road_id);")
        
        conn.commit()
        cursor.close()
        print("✅ Database tables created successfully")
        return True
        
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        return False
    finally:
        conn.close()

def utm_to_latlon(x, y):
    """Convert UTM coordinates to latitude/longitude using Australian MGA Zone 55S"""
    try:
        from pyproj import Transformer
        # Australian MGA Zone 55S (EPSG:28355) to WGS84 (EPSG:4326)
        transformer = Transformer.from_crs("EPSG:28355", "EPSG:4326", always_xy=True)
        lon, lat = transformer.transform(x, y)
        
        # Validate coordinates are within Australia bounds
        if not (-44 <= lat <= -10 and 113 <= lon <= 154):
            return None, None
            
        return lat, lon
    except Exception as e:
        print(f"Coordinate transformation error: {e}")
        return None, None

def load_locations():
    """Load locations from CSV and transform coordinates"""
    print("Loading locations...")
    
    try:
        locations_df = pd.read_csv('/app/Dataset/locations.csv')
        print(f"Loaded {len(locations_df)} locations from CSV")
        
        conn = get_db_connection()
        if not conn:
            return False
        
        cursor = conn.cursor()
        
        inserted_count = 0
        for _, row in locations_df.iterrows():
            try:
                # Skip invalid coordinates
                if (row['Xloc'] == 2147483647 or row['Yloc'] == 2147483647 or 
                    row['Xloc'] == 0 or row['Yloc'] == 0):
                    continue
                
                # Transform coordinates from UTM to lat/lon
                lat, lon = utm_to_latlon(row['Xloc'], row['Yloc'])
                if lat is None or lon is None:
                    continue
                
                cursor.execute("""
                    INSERT INTO locations (
                        location_id, location_name, pit_name, region_name,
                        latitude, longitude, elevation_m, unit_type, location_category,
                        geometry
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326)
                    )
                """, (
                    int(row['Id']),
                    str(row['Name']),
                    str(row['Pit']) if pd.notna(row['Pit']) else None,
                    str(row['Region']) if pd.notna(row['Region']) else None,
                    float(lat),
                    float(lon),
                    float(row['Zloc']) if pd.notna(row['Zloc']) else None,
                    str(row['UnitId']) if pd.notna(row['UnitId']) else None,
                    'infrastructure',
                    float(lon),
                    float(lat)
                ))
                inserted_count += 1
                
            except Exception as e:
                print(f"Error inserting location {row['Id']}: {e}")
                continue
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"✅ Inserted {inserted_count} locations")
        
        # Populate unit_types table first
        populate_unit_types_table()
        
        # Also populate infrastructure table for GraphQL compatibility
        populate_infrastructure_table()
        
        return True
        
    except Exception as e:
        print(f"❌ Error loading locations: {e}")
        return False

def populate_unit_types_table():
    """Populate unit_types table from CSV data"""
    print("Populating unit_types table...")
    
    try:
        # Load unit types from CSV
        unit_types_df = pd.read_csv('/app/Dataset/enum units.csv')
        
        conn = get_db_connection()
        if not conn:
            return False
        
        cursor = conn.cursor()
        
        for _, row in unit_types_df.iterrows():
            cursor.execute("""
                INSERT INTO unit_types (
                    unit_type_id, enum_type_id, description, abbreviation, flags
                ) VALUES (
                    %s, %s, %s, %s, %s
                )
                ON CONFLICT (unit_type_id) DO UPDATE SET
                    enum_type_id = EXCLUDED.enum_type_id,
                    description = EXCLUDED.description,
                    abbreviation = EXCLUDED.abbreviation,
                    flags = EXCLUDED.flags
            """, (
                int(row['Id']),
                int(row['EnumTypeId']),
                str(row['Description']),
                str(row['Abbreviation']),
                int(row['Flags'])
            ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"✅ Populated {len(unit_types_df)} unit types")
        return True
        
    except Exception as e:
        print(f"❌ Error populating unit_types table: {e}")
        return False

def populate_infrastructure_table():
    """Populate infrastructure table from locations data for GraphQL compatibility"""
    print("Populating infrastructure table...")
    
    try:
        conn = get_db_connection()
        if not conn:
            return False
        
        cursor = conn.cursor()
        
        # Copy data from locations to infrastructure table with proper unit_id mapping
        cursor.execute("""
            INSERT INTO infrastructure (
                location_id, location_name, unit_id, center_point, elevation_m, is_active
            )
            SELECT 
                l.location_id,
                l.location_name,
                CASE 
                    WHEN l.unit_type IS NOT NULL AND l.unit_type != '' 
                    THEN l.unit_type::INTEGER
                    ELSE NULL
                END as unit_id,
                l.geometry as center_point,
                l.elevation_m,
                TRUE as is_active
            FROM locations l
            WHERE l.geometry IS NOT NULL
        """)
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("✅ Infrastructure table populated successfully")
        return True
        
    except Exception as e:
        print(f"❌ Error populating infrastructure table: {e}")
        return False

def bezier_cubic_point(p0, p1, p2, p3, t):
    """Calculate a point on the cubic Bézier curve at parameter t ∈ [0,1]"""
    x = (1-t)**3 * p0[0] + 3*(1-t)**2*t * p1[0] + 3*(1-t)*t**2 * p2[0] + t**3 * p3[0]
    y = (1-t)**3 * p0[1] + 3*(1-t)**2*t * p1[1] + 3*(1-t)*t**2 * p2[1] + t**3 * p3[1]
    return (x, y)

def generate_bezier_curve(p0, p1, p2, p3, num_points=50):
    """Generate a Bézier curve with num_points points"""
    curve_points = []
    for i in range(num_points + 1):
        t = i / num_points
        point = bezier_cubic_point(p0, p1, p2, p3, t)
        curve_points.append(point)
    return curve_points

def create_lane_segments_from_curve(road_id, curve_points, direction, distance, time_empty, time_loaded, is_closed, target_length=75.0):
    """Create lane segments from Bézier curve points"""
    segments = []
    
    # If curve is short, create one segment
    if distance <= 100.0:
        segment_id = f"road_{road_id}_0_{direction}"
        segments.append({
            'lane_id': segment_id,
            'road_id': road_id,
            'lane_name': f"Road {road_id} - Segment 0 ({direction.title()})",
            'curve_points': curve_points,
            'length_m': distance,
            'time_empty_seconds': time_empty,
            'time_loaded_seconds': time_loaded,
            'is_closed': is_closed,
            'direction': direction
        })
        return segments
    
    # For long curves, break into segments
    num_segments = max(1, int(np.ceil(distance / target_length)))
    segment_length = distance / num_segments
    
    for seg_idx in range(num_segments):
        segment_id = f"road_{road_id}_{seg_idx}_{direction}"
        
        # Calculate segment points
        start_idx = int((seg_idx / num_segments) * len(curve_points))
        end_idx = int(((seg_idx + 1) / num_segments) * len(curve_points))
        end_idx = min(end_idx, len(curve_points) - 1)
        
        segment_points = curve_points[start_idx:end_idx + 1]
        if len(segment_points) < 2:
            segment_points = [curve_points[start_idx], curve_points[min(start_idx + 1, len(curve_points) - 1)]]
        
        segments.append({
            'lane_id': segment_id,
            'road_id': road_id,
            'lane_name': f"Road {road_id} - Segment {seg_idx} ({direction.title()})",
            'curve_points': segment_points,
            'length_m': segment_length,
            'time_empty_seconds': time_empty,
            'time_loaded_seconds': time_loaded,
            'is_closed': is_closed,
            'direction': direction
        })
    
    return segments

def load_roads():
    """Load roads and create Bézier curves based on notebook approach"""
    print("Loading roads and creating Bézier curves...")
    
    try:
        # Load CSV files exactly like the notebook
        roads_df = pd.read_csv('/app/Dataset/roads.csv')
        locations_df = pd.read_csv('/app/Dataset/locations.csv')
        roadgraphx_df = pd.read_csv('/app/Dataset/roadgraphx.csv')
        roadgraphy_df = pd.read_csv('/app/Dataset/roadgraphy.csv')
        
        print(f"Loaded {len(roads_df)} roads")
        print(f"Loaded {len(locations_df)} locations")
        print(f"Loaded {len(roadgraphx_df)} X coordinates")
        print(f"Loaded {len(roadgraphy_df)} Y coordinates")
        
        # Merge roadgraph data exactly like notebook
        coords_df = roadgraphx_df.merge(roadgraphy_df, on=['Id', 'Index'])
        coords_df.columns = ['Id', 'Index', 'Value_x', 'Value_y']
        print(f"Merged coordinate data: {len(coords_df)} points")
        
        # Create location lookup with transformed coordinates
        location_lookup = {}
        for _, loc in locations_df.iterrows():
            if (loc['Xloc'] != 2147483647 and loc['Yloc'] != 2147483647 and
                loc['Xloc'] != 0 and loc['Yloc'] != 0):
                lat, lon = utm_to_latlon(loc['Xloc'], loc['Yloc'])
                if lat is not None and lon is not None:
                    location_lookup[loc['Id']] = {
                        'id': loc['Id'],
                        'name': loc['Name'],
                        'lat': lat,
                        'lon': lon
                    }
        
        print(f"Created location lookup with {len(location_lookup)} valid locations")
        
        conn = get_db_connection()
        if not conn:
            return False
        
        cursor = conn.cursor()
        
        processed_roads = 0
        total_segments = 0
        skipped_roads = 0
        
        # Process ALL roads, not just first 20 like notebook
        for _, road in roads_df.iterrows():
            try:
                road_id = road['Id']
                start_loc_id = road['FieldLocstart']
                end_loc_id = road['FieldLocend']
                
                # Check if locations exist
                if start_loc_id not in location_lookup or end_loc_id not in location_lookup:
                    skipped_roads += 1
                    continue
                
                start_loc = location_lookup[start_loc_id]
                end_loc = location_lookup[end_loc_id]
                
                # Get control points exactly like notebook
                road_coords = coords_df[coords_df['Id'] == road_id].sort_values('Index')
                valid_coords = road_coords[
                    (road_coords['Value_x'] != 2147483647) & 
                    (road_coords['Value_y'] != 2147483647) &
                    (road_coords['Value_x'] != 0) & 
                    (road_coords['Value_y'] != 0) &
                    (road_coords['Index'] > 0)
                ]
                
                # Define Bézier control points exactly like notebook
                p0 = (start_loc['lat'], start_loc['lon'])  # Start point
                p3 = (end_loc['lat'], end_loc['lon'])      # End point
                
                if len(valid_coords) >= 1:
                    # Transform control points to lat/lon
                    cp1_lat, cp1_lon = utm_to_latlon(valid_coords.iloc[0]['Value_x'], valid_coords.iloc[0]['Value_y'])
                    if len(valid_coords) > 1:
                        cp2_lat, cp2_lon = utm_to_latlon(valid_coords.iloc[1]['Value_x'], valid_coords.iloc[1]['Value_y'])
                    else:
                        cp2_lat, cp2_lon = cp1_lat, cp1_lon
                    
                    # Check if control points are valid (within Australia bounds)
                    if (cp1_lat is None or cp2_lat is None or 
                        not (-44 <= cp1_lat <= -10 and 113 <= cp1_lon <= 154) or
                        not (-44 <= cp2_lat <= -10 and 113 <= cp2_lon <= 154)):
                        p1 = p0  # Fallback to straight line
                        p2 = p3
                    else:
                        p1 = (cp1_lat, cp1_lon)  # First control point
                        p2 = (cp2_lat, cp2_lon)  # Second control point
                else:
                    # No control points - straight line
                    p1 = p0
                    p2 = p3
                
                # Generate Bézier curves for both directions (bidirectional roads)
                forward_curve = generate_bezier_curve(p0, p1, p2, p3, 50)
                reverse_curve = generate_bezier_curve(p3, p2, p1, p0, 50)
                
                # Create segments for both directions
                road_distance = float(road['FieldDist'])
                time_empty = float(road['FieldTimeempty'])
                time_loaded = float(road['FieldTimeloaded'])
                is_closed = bool(road['FieldClosed'])
                
                # Forward segments
                forward_segments = create_lane_segments_from_curve(
                    road_id, forward_curve, 'forward', road_distance, 
                    time_empty, time_loaded, is_closed
                )
                
                # Reverse segments
                reverse_segments = create_lane_segments_from_curve(
                    road_id, reverse_curve, 'reverse', road_distance,
                    time_empty, time_loaded, is_closed
                )
                
                # Insert all segments into database
                for segment in forward_segments + reverse_segments:
                    try:
                        # Filter out any invalid coordinates from curve points (must be within Australia)
                        valid_curve_points = []
                        for lat, lon in segment['curve_points']:
                            if (-44 <= lat <= -10 and 113 <= lon <= 154):
                                valid_curve_points.append((lat, lon))
                        
                        # Skip segment if no valid points
                        if len(valid_curve_points) < 2:
                            continue
                            
                        # Create LineString from valid curve points
                        points_wkt = ', '.join([f"{lon} {lat}" for lat, lon in valid_curve_points])
                        linestring_wkt = f"LINESTRING({points_wkt})"
                        
                        cursor.execute("""
                            INSERT INTO lane_segments (
                                lane_id, road_id, lane_name, geometry,
                                length_m, time_empty_seconds, time_loaded_seconds, 
                                is_closed, direction
                            ) VALUES (
                                %s, %s, %s, ST_GeomFromText(%s, 4326),
                                %s, %s, %s, %s, %s
                            )
                        """, (
                            str(segment['lane_id']),
                            int(segment['road_id']),
                            str(segment['lane_name']),
                            linestring_wkt,
                            float(segment['length_m']),
                            float(segment['time_empty_seconds']),
                            float(segment['time_loaded_seconds']),
                            bool(segment['is_closed']),
                            str(segment['direction'])
                        ))
                        total_segments += 1
                        
                    except Exception as e:
                        print(f"Error inserting segment {segment['lane_id']}: {e}")
                        continue
                
                processed_roads += 1
                
                # Progress reporting
                if processed_roads % 100 == 0:
                    print(f"Processed {processed_roads} roads, created {total_segments} segments...")
                    conn.commit()  # Commit periodically
                    
            except Exception as e:
                print(f"Error processing road {road['Id']}: {e}")
                skipped_roads += 1
                continue
        
        # Final commit
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"✅ Successfully processed {processed_roads} roads")
        print(f"⚠️ Skipped {skipped_roads} roads (missing location data)")
        print(f"✅ Created {total_segments} lane segments")
        print(f"📊 Success rate: {processed_roads/(processed_roads+skipped_roads)*100:.1f}%")
        return True
        
    except Exception as e:
        print(f"❌ Error loading roads: {e}")
        return False

def verify_data():
    """Verify the loaded data"""
    print("Verifying loaded data...")
    
    try:
        conn = get_db_connection()
        if not conn:
            return False
        
        cursor = conn.cursor()
        
        # Check locations
        cursor.execute("SELECT COUNT(*) FROM locations")
        location_count = cursor.fetchone()[0]
        
        # Check segments
        cursor.execute("SELECT COUNT(*) FROM lane_segments")
        segment_count = cursor.fetchone()[0]
        
        # Check open vs closed segments
        cursor.execute("SELECT COUNT(*) FROM lane_segments WHERE is_closed = false")
        open_segments = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM lane_segments WHERE is_closed = true")
        closed_segments = cursor.fetchone()[0]
        
        # Check directions
        cursor.execute("SELECT direction, COUNT(*) FROM lane_segments GROUP BY direction")
        direction_counts = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        print(f"📊 Data Verification Results:")
        print(f"   Locations: {location_count}")
        print(f"   Total Segments: {segment_count}")
        print(f"   Open Segments: {open_segments}")
        print(f"   Closed Segments: {closed_segments}")
        print(f"   Direction Breakdown:")
        for direction, count in direction_counts:
            print(f"     {direction}: {count}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error verifying data: {e}")
        return False

def main():
    """Main ETL process"""
    print("=== Komatsu Dispatch ETL Process ===")
    print("Processing CSV files and creating Bézier curve roads...")
    
    # Step 1: Create tables
    print("\n1. Creating database tables...")
    if not create_tables():
        print("❌ Failed to create tables")
        sys.exit(1)
    
    # Step 2: Load locations
    print("\n2. Loading locations...")
    if not load_locations():
        print("❌ Failed to load locations")
        sys.exit(1)
    
    # Step 3: Load roads and create Bézier curves
    print("\n3. Loading roads and creating Bézier curves...")
    if not load_roads():
        print("❌ Failed to load roads")
        sys.exit(1)
    
    # Step 4: Verify data
    print("\n4. Verifying loaded data...")
    if not verify_data():
        print("❌ Failed to verify data")
        sys.exit(1)
    
    print("\n🎉 ETL process completed successfully!")
    print("All roads are now available as Bézier curves in the database.")
    print("You can now view them on the map at http://localhost:5000")

if __name__ == "__main__":
    main()