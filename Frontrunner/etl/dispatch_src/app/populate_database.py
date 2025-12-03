#!/usr/bin/env python3
"""
Script to populate the database with proper lane segments and classified locations
"""
import sys
import pandas as pd
import numpy as np
from pathlib import Path

sys.path.append('/app')

from src.models import DatabaseManager
from src.models.coordinate_transform import transform_coordinates_batch

def utm_to_latlon_ultimate(x, y):
    """Convert UTM coordinates to latitude/longitude using GDA94/MGA Zone 55"""
    # Skip 0,0 coordinates as they would transform to South Pole
    if x == 0 and y == 0:
        return None, None
        
    try:
        from pyproj import Transformer
        transformer = Transformer.from_crs("EPSG:28355", "EPSG:4326", always_xy=True)
        lon, lat = transformer.transform(x, y)
        
        # Validate coordinates are within Australia bounds
        if not (-44 <= lat <= -10 and 113 <= lon <= 154):
            return None, None
            
        return lat, lon
    except Exception as e:
        return None, None

def bezier_cubic_point(p0, p1, p2, p3, t):
    """Calculate a point on the cubic Bézier curve at parameter t ∈ [0,1]"""
    x = (1-t)**3 * p0[0] + 3*(1-t)**2*t * p1[0] + 3*(1-t)*t**2 * p2[0] + t**3 * p3[0]
    y = (1-t)**3 * p0[1] + 3*(1-t)**2*t * p1[1] + 3*(1-t)*t**2 * p2[1] + t**3 * p3[1]
    return (x, y)


def create_bidirectional_curves(road_id, start_loc, end_loc, control_points, is_closed, distance):
    """Create both forward and reverse curves for bidirectional roads - same as notebook"""
    curves = []
    
    # Forward direction (start to end)
    if len(control_points) < 2:
        p0 = (start_loc['lat'], start_loc['lon'])
        p3 = (end_loc['lat'], end_loc['lon'])
        p1 = p0
        p2 = p3
    else:
        p0 = (start_loc['lat'], start_loc['lon'])
        p3 = (end_loc['lat'], end_loc['lon'])
        
        cp1 = control_points[control_points['Index'] == 1].iloc[0]
        cp2 = control_points[control_points['Index'] == 2].iloc[0]
        
        if (cp1['Value_x'] == 2147483647 or cp1['Value_y'] == 2147483647 or
            cp2['Value_x'] == 2147483647 or cp2['Value_y'] == 2147483647):
            p1 = p0
            p2 = p3
        else:
            lat1, lon1 = utm_to_latlon_ultimate(cp1['Value_x'], cp1['Value_y'])
            lat2, lon2 = utm_to_latlon_ultimate(cp2['Value_x'], cp2['Value_y'])
            
            if lat1 is None or lat2 is None:
                p1 = p0
                p2 = p3
            else:
                p1 = (lat1, lon1)
                p2 = (lat2, lon2)
    
    # Forward curve (start to end) - store the 4 control points, not sampled points
    forward_control_points = [p0, p1, p2, p3]
    curves.append({
        'road_id': road_id,
        'direction': 'forward',
        'start_location_id': start_loc['id'],
        'end_location_id': end_loc['id'],
        'curve_points': forward_control_points,
        'is_closed': is_closed,
        'distance': distance
    })
    
    # Reverse curve (end to start) - reverse the control points
    reverse_control_points = [p3, p2, p1, p0]
    curves.append({
        'road_id': road_id,
        'direction': 'reverse',
        'start_location_id': end_loc['id'],
        'end_location_id': start_loc['id'],
        'curve_points': reverse_control_points,
        'is_closed': is_closed,
        'distance': distance
    })
    
    return curves

def sample_curve_points(curve_points, num_points=25):
    """Sample points along a curve for better visualization"""
    if len(curve_points) <= 2:
        return curve_points
    
    # Calculate total distance
    total_distance = 0
    for i in range(len(curve_points) - 1):
        dist = np.linalg.norm(
            np.array(curve_points[i + 1]) - np.array(curve_points[i])
        )
        total_distance += dist
    
    # Sample points evenly along the curve
    sampled_points = []
    for i in range(num_points):
        t = i / (num_points - 1) if num_points > 1 else 0
        target_distance = t * total_distance
        
        # Find the point at this distance
        cumulative_distance = 0
        for j in range(len(curve_points) - 1):
            segment_distance = np.linalg.norm(
                np.array(curve_points[j + 1]) - np.array(curve_points[j])
            )
            
            if cumulative_distance + segment_distance >= target_distance:
                # Interpolate within this segment
                segment_t = (target_distance - cumulative_distance) / segment_distance
                start_point = np.array(curve_points[j])
                end_point = np.array(curve_points[j + 1])
                interpolated_point = start_point + segment_t * (end_point - start_point)
                sampled_points.append((float(interpolated_point[0]), float(interpolated_point[1])))
                break
            
            cumulative_distance += segment_distance
        else:
            # If we didn't find a point, use the last point
            sampled_points.append(curve_points[-1])
    
    return sampled_points

def extract_segment_curve(curve_points, cumulative_distances, start_distance, end_distance):
    """Extract curve points for a specific segment"""
    segment_points = []
    
    # Add start point
    start_point = interpolate_point_at_distance(
        curve_points, cumulative_distances, start_distance
    )
    segment_points.append(start_point)
    
    # Add intermediate points that fall within the segment
    for i, (point, cum_dist) in enumerate(zip(curve_points, cumulative_distances)):
        if start_distance < cum_dist < end_distance:
            segment_points.append(point)
    
    # Add end point
    end_point = interpolate_point_at_distance(
        curve_points, cumulative_distances, end_distance
    )
    segment_points.append(end_point)
    
    return segment_points

def create_lane_segments_from_bezier_curve(curve_data, target_length=75.0):
    """
    Create proper lane segments from Bézier curve data using actual Bézier curve functions
    """
    segments = []
    road_id = curve_data['road_id']
    direction = curve_data['direction']
    curve_points = curve_data['curve_points']
    total_distance = curve_data['distance']
    is_closed = curve_data['is_closed']
    
    # Get the 4 control points for the Bézier curve
    if len(curve_points) < 4:
        print(f"Warning: Road {road_id} has insufficient curve points: {len(curve_points)}")
        return segments
    
    # P0 = start point, P1 = first control point, P2 = second control point, P3 = end point
    p0 = curve_points[0]  # Start point
    p1 = curve_points[1]  # First control point
    p2 = curve_points[2]  # Second control point  
    p3 = curve_points[3]  # End point
    
    # If curve is short enough, create one segment with proper Bézier sampling
    if total_distance <= 100.0:
        segment = {
            "lane_id": f"road_{road_id}_0_{direction}",
            "lane_name": f"Road {road_id} - Segment 0 ({direction.title()})",
            "start_lat": float(p0[0]),
            "start_lon": float(p0[1]),
            "end_lat": float(p3[0]),
            "end_lon": float(p3[1]),
            "length_m": float(total_distance),
            "p0": p0,
            "p1": p1, 
            "p2": p2,
            "p3": p3,
            "use_bezier": True
        }
        segments.append(segment)
        return segments
    
    # For long curves, break into multiple segments
    num_segments = max(1, int(np.ceil(total_distance / target_length)))
    
    # Generate segments by sampling the Bézier curve at different t values
    for seg_idx in range(num_segments):
        # Calculate t range for this segment
        t_start = seg_idx / num_segments
        t_end = (seg_idx + 1) / num_segments
        
        # Get start and end points on the Bézier curve
        start_point = bezier_point_at_t(p0, p1, p2, p3, t_start)
        end_point = bezier_point_at_t(p0, p1, p2, p3, t_end)
        
        # Calculate actual length
        actual_length = np.linalg.norm(np.array(end_point) - np.array(start_point))
        
        segment = {
            "lane_id": f"road_{road_id}_{seg_idx}_{direction}",
            "lane_name": f"Road {road_id} - Segment {seg_idx} ({direction.title()})",
            "start_lat": float(start_point[0]),
            "start_lon": float(start_point[1]),
            "end_lat": float(end_point[0]),
            "end_lon": float(end_point[1]),
            "length_m": float(actual_length),
            "p0": p0,
            "p1": p1,
            "p2": p2, 
            "p3": p3,
            "t_start": t_start,
            "t_end": t_end,
            "use_bezier": True
        }
        segments.append(segment)
    
    return segments

def bezier_point_at_t(p0, p1, p2, p3, t):
    """Calculate a point on a cubic Bézier curve at parameter t"""
    # Convert to numpy arrays for easier calculation
    p0 = np.array(p0)
    p1 = np.array(p1)
    p2 = np.array(p2)
    p3 = np.array(p3)
    
    # Cubic Bézier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
    point = ((1-t)**3 * p0 + 
             3*(1-t)**2*t * p1 + 
             3*(1-t)*t**2 * p2 + 
             t**3 * p3)
    
    return (float(point[0]), float(point[1]))

def interpolate_point_at_distance(curve_points, cumulative_distances, target_distance):
    """Interpolate a point at a specific distance along the curve."""
    if target_distance <= 0:
        return curve_points[0]
    if target_distance >= cumulative_distances[-1]:
        return curve_points[-1]
    
    # Find the segment containing the target distance
    for i in range(len(cumulative_distances) - 1):
        if (
            cumulative_distances[i]
            <= target_distance
            <= cumulative_distances[i + 1]
        ):
            # Interpolate between points i and i+1
            segment_start_dist = cumulative_distances[i]
            segment_end_dist = cumulative_distances[i + 1]
            segment_length = segment_end_dist - segment_start_dist
            
            if segment_length == 0:
                return curve_points[i]
            
            # Calculate interpolation factor
            t = (target_distance - segment_start_dist) / segment_length
            
            # Interpolate coordinates
            start_point = np.array(curve_points[i])
            end_point = np.array(curve_points[i + 1])
            interpolated_point = start_point + t * (end_point - start_point)
            
            return (float(interpolated_point[0]), float(interpolated_point[1]))
    
    return curve_points[-1]

def populate_unit_types():
    """Populate unit_types table from enum units.csv"""
    db = DatabaseManager()
    
    try:
        units_df = pd.read_csv('/app/data/enum units.csv')
        
        with db.pool.get_connection() as conn:
            with conn.cursor() as cursor:
                for _, unit in units_df.iterrows():
                    cursor.execute("""
                        INSERT INTO unit_types (unit_type_id, description, abbreviation)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (unit_type_id) DO UPDATE SET
                        description = EXCLUDED.description,
                        abbreviation = EXCLUDED.abbreviation
                    """, (
                        int(unit['Id']),
                        unit['Description'],
                        unit.get('Abbreviation', '')
                    ))
        
            conn.commit()
            print(f"✅ Populated {len(units_df)} unit types")
        return True
    except Exception as e:
        print(f"❌ Error populating unit types: {e}")
        return False

def populate_pits_and_regions():
    """Populate pits and regions from locations data"""
    print("Starting populate_pits_and_regions")
    db = DatabaseManager()
    
    locations_df = pd.read_csv('/app/data/locations.csv')
    print(f"Loaded {len(locations_df)} locations")
    
    # Get unique pits (exclude NaN values)
    pits = locations_df['Pit'].dropna().unique()
    print(f"Found {len(pits)} unique pits")
    
    with db.pool.get_connection() as conn:
        with conn.cursor() as cursor:
            # Insert pits
            for i, pit_name in enumerate(pits):
                cursor.execute("""
                    INSERT INTO pits (pit_id, pit_name, description)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (pit_name) DO NOTHING
                """, (i + 1, pit_name, f"Pit {pit_name}"))
            
            # Get unique regions (exclude NaN values)
            regions = locations_df['Region'].dropna().unique()
            print(f"Found {len(regions)} unique regions")
            
            # Insert regions
            for i, region_name in enumerate(regions):
                # Find associated pit (exclude rows where Pit is NaN)
                region_data = locations_df[(locations_df['Region'] == region_name) & locations_df['Pit'].notna()]
                if len(region_data) > 0:
                    pit_name = region_data.iloc[0]['Pit']
                    
                    cursor.execute("""
                        SELECT pit_id FROM pits WHERE pit_name = %s
                    """, (pit_name,))
                    pit_result = cursor.fetchone()
                    pit_id = pit_result['pit_id'] if pit_result else 1
                    
                    cursor.execute("""
                        INSERT INTO regions (region_id, region_name, pit_id, description)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (region_name) DO NOTHING
                    """, (i + 1, region_name, pit_id, f"Region {region_name}"))
    
    conn.commit()
    print(f"✅ Populated {len(pits)} pits and {len(regions)} regions")
    return True

def populate_pits_and_regions_new():
    """New version of populate pits and regions"""
    print("Starting populate_pits_and_regions_new")
    db = DatabaseManager()
    
    locations_df = pd.read_csv('/app/data/locations.csv')
    print(f"Loaded {len(locations_df)} locations")
    
    # Get unique pits (exclude NaN values)
    pits = locations_df['Pit'].dropna().unique()
    print(f"Found {len(pits)} unique pits")
    
    with db.pool.get_connection() as conn:
        with conn.cursor() as cursor:
            # Insert pits
            for i, pit_name in enumerate(pits):
                cursor.execute("""
                    INSERT INTO pits (pit_id, pit_name, description)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (pit_name) DO NOTHING
                """, (i + 1, pit_name, f"Pit {pit_name}"))
            
            # Get unique regions (exclude NaN values)
            regions = locations_df['Region'].dropna().unique()
            print(f"Found {len(regions)} unique regions")
            
            # Insert regions
            for i, region_name in enumerate(regions):
                # Find associated pit (exclude rows where Pit is NaN)
                region_data = locations_df[(locations_df['Region'] == region_name) & locations_df['Pit'].notna()]
                if len(region_data) > 0:
                    pit_name = region_data.iloc[0]['Pit']
                    
                    cursor.execute("""
                        SELECT pit_id FROM pits WHERE pit_name = %s
                    """, (pit_name,))
                    pit_result = cursor.fetchone()
                    pit_id = pit_result['pit_id'] if pit_result else 1
                    
                    cursor.execute("""
                        INSERT INTO regions (region_id, region_name, pit_id, description)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (region_name) DO NOTHING
                    """, (i + 1, region_name, pit_id, f"Region {region_name}"))
    
    conn.commit()
    print(f"✅ Populated {len(pits)} pits and {len(regions)} regions")
    return True

def test_populate_pits_and_regions():
    """Test function to populate pits and regions"""
    print("TEST: Starting test function")
    try:
        print("TEST: Creating database manager")
        db = DatabaseManager()
        
        print("TEST: Loading CSV")
        locations_df = pd.read_csv('/app/data/locations.csv')
        print(f"TEST: Loaded {len(locations_df)} locations")
        
        print("TEST: Getting pits")
        pits = locations_df['Pit'].dropna().unique()
        print(f"TEST: Found {len(pits)} pits")
        
        print("TEST: Getting database connection")
        with db.get_cursor() as conn:
            print("TEST: Got connection")
            with conn.cursor() as cursor:
                print("TEST: Got cursor")
                
                print("TEST: Inserting pits")
                for i, pit_name in enumerate(pits):
                    print(f"TEST: Inserting pit {pit_name}")
                    cursor.execute("""
                        INSERT INTO pits (pit_id, pit_name, description)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (pit_name) DO NOTHING
                    """, (i + 1, pit_name, f"Pit {pit_name}"))
                
                print("TEST: Getting regions")
                regions = locations_df['Region'].dropna().unique()
                print(f"TEST: Found {len(regions)} regions")
                
                print("TEST: Inserting regions")
                for i, region_name in enumerate(regions):
                    print(f"TEST: Processing region {region_name}")
                    region_data = locations_df[(locations_df['Region'] == region_name) & locations_df['Pit'].notna()]
                    if len(region_data) > 0:
                        pit_name = region_data.iloc[0]['Pit']
                        print(f"TEST: Region {region_name} -> pit {pit_name}")
                        
                        cursor.execute("SELECT pit_id FROM pits WHERE pit_name = %s", (pit_name,))
                        pit_result = cursor.fetchone()
                        pit_id = pit_result['pit_id'] if pit_result else 1
                        
                        cursor.execute("""
                            INSERT INTO regions (region_id, region_name, pit_id, description)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (region_name) DO NOTHING
                        """, (i + 1, region_name, pit_id, f"Region {region_name}"))
        
        print("TEST: Committing")
        conn.commit()
        print(f"TEST: Success! Populated {len(pits)} pits and {len(regions)} regions")
        return True
        
    except Exception as e:
        print(f"TEST: Error - {e}")
        import traceback
        traceback.print_exc()
        return False

def populate_infrastructure():
    """Populate infrastructure table with proper location classification"""
    db = DatabaseManager()
    
    try:
        locations_df = pd.read_csv('/app/data/locations.csv')
        
        # Transform coordinates
        coordinates = list(zip(locations_df["Xloc"], locations_df["Yloc"]))
        lat_lon_pairs = transform_coordinates_batch(coordinates)
        locations_df["latitude"] = [pair[0] for pair in lat_lon_pairs]
        locations_df["longitude"] = [pair[1] for pair in lat_lon_pairs]
        
        # Filter out locations with invalid coordinates (must be within Australia bounds)
        valid_locations = locations_df[
            (locations_df["latitude"].notna()) & 
            (locations_df["longitude"].notna()) &
            (locations_df["latitude"] >= -44) & 
            (locations_df["latitude"] <= -10) &
            (locations_df["longitude"] >= 113) & 
            (locations_df["longitude"] <= 154)
        ]
        
        with db.pool.get_connection() as conn:
            with conn.cursor() as cursor:
                for _, loc in valid_locations.iterrows():
                    # Get pit_id
                    pit_id = None
                    if pd.notna(loc['Pit']):
                        cursor.execute("SELECT pit_id FROM pits WHERE pit_name = %s", (loc['Pit'],))
                        pit_result = cursor.fetchone()
                        pit_id = pit_result['pit_id'] if pit_result else None
                    
                    # Get region_id
                    region_id = None
                    if pd.notna(loc['Region']):
                        cursor.execute("SELECT region_id FROM regions WHERE region_name = %s", (loc['Region'],))
                        region_result = cursor.fetchone()
                        region_id = region_result['region_id'] if region_result else None
                    
                    # Get unit_id
                    unit_id = None
                    if pd.notna(loc['UnitId']):
                        cursor.execute("SELECT unit_type_id FROM unit_types WHERE unit_type_id = %s", (int(loc['UnitId']),))
                        unit_result = cursor.fetchone()
                        unit_id = unit_result['unit_type_id'] if unit_result else None
                    
                    # Create center point geometry
                    cursor.execute("""
                        INSERT INTO infrastructure (
                            location_id, location_name, pit_id, region_id, unit_id,
                            center_point, elevation_m, is_active
                        )
                        VALUES (
                            %s, %s, %s, %s, %s,
                            ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s
                        )
                        ON CONFLICT (location_id) DO UPDATE SET
                        location_name = EXCLUDED.location_name,
                        pit_id = EXCLUDED.pit_id,
                        region_id = EXCLUDED.region_id,
                        unit_id = EXCLUDED.unit_id,
                        center_point = EXCLUDED.center_point,
                        elevation_m = EXCLUDED.elevation_m
                    """, (
                        int(loc['Id']),
                        f"Location {loc['Id']}",
                        pit_id,
                        region_id,
                        unit_id,
                        float(loc['longitude']),
                        float(loc['latitude']),
                        float(loc.get('Elevation', 0)),
                        True
                    ))
        
            conn.commit()
            print(f"✅ Populated {len(locations_df)} infrastructure locations")
        return True
    except Exception as e:
        print(f"❌ Error populating infrastructure: {e}")
        import traceback
        traceback.print_exc()
        return False

def populate_roads_and_segments():
    """Populate roads and lane segments using same Bézier curve method as notebook"""
    db = DatabaseManager()
    
    try:
        roads_df = pd.read_csv('/app/data/roads.csv')
        roadgraphx_df = pd.read_csv('/app/data/roadgraphx.csv')
        roadgraphy_df = pd.read_csv('/app/data/roadgraphy.csv')
        locations_df = pd.read_csv('/app/data/locations.csv')
        
        # Merge roadgraph data
        coords_df = roadgraphx_df.merge(roadgraphy_df, on=['Id', 'Index'])
        
        # Transform coordinates for locations - same as notebook
        print("Transforming location coordinates...")
        location_coords_ultimate = []
        
        for _, loc in locations_df.iterrows():
            lat, lon = utm_to_latlon_ultimate(loc['Xloc'], loc['Yloc'])
            if lat is not None and lon is not None:
                location_coords_ultimate.append({
                    'id': loc['Id'],
                    'lat': lat,
                    'lon': lon,
                    'pit': loc['Pit'],
                    'unit_id': loc['UnitId']
                })
        
        # Create location lookup
        location_lookup = {loc['id']: loc for loc in location_coords_ultimate}
        
        with db.pool.get_connection() as conn:
            with conn.cursor() as cursor:
                # Insert roads
                for _, road in roads_df.iterrows():
                    cursor.execute("""
                        INSERT INTO roads (road_id, road_name, start_location_id, end_location_id)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (road_id) DO UPDATE SET
                        road_name = EXCLUDED.road_name,
                        start_location_id = EXCLUDED.start_location_id,
                        end_location_id = EXCLUDED.end_location_id
                    """, (
                        int(road['Id']),
                        f"Road {road['Id']}",
                        int(road['FieldLocstart']),
                        int(road['FieldLocend'])
                    ))
                
                # Process roads with Bézier curves - same as notebook
                bezier_curves_ultimate = []
                processed_roads = 0
                skipped_roads = 0
                
                print("Processing roads for Bézier curves...")
                for _, road in roads_df.iterrows():
                    road_id = road['Id']
                    start_loc_id = road['FieldLocstart']
                    end_loc_id = road['FieldLocend']
                    
                    if start_loc_id not in location_lookup or end_loc_id not in location_lookup:
                        skipped_roads += 1
                        continue
                    
                    start_loc = location_lookup[start_loc_id]
                    end_loc = location_lookup[end_loc_id]
                    
                    road_coords = coords_df[coords_df['Id'] == road_id]
                    control_points = road_coords[road_coords['Index'].isin([1, 2])]
                    
                    # Create bidirectional curves for all roads - same as notebook
                    road_curves = create_bidirectional_curves(
                        road_id, start_loc, end_loc, control_points, 
                        road['FieldClosed'] == 1, road['FieldDist']
                    )
                    
                    bezier_curves_ultimate.extend(road_curves)
                    processed_roads += 1
                
                print(f"✅ Successfully processed {processed_roads} roads with Bézier curves")
                print(f"⚠️ Skipped {skipped_roads} roads (missing data or invalid coordinates)")
                print(f"📊 Success rate: {processed_roads/(processed_roads+skipped_roads)*100:.1f}%")
                
                # Create proper lane segments for each curve
                inserted_count = 0
                for curve in bezier_curves_ultimate:
                    try:
                        # Create multiple segments for each curve (50-100m each)
                        segments = create_lane_segments_from_bezier_curve(curve, target_length=75.0)
                        
                        for segment in segments:
                            # Use Bézier curve function to create geometry
                            if segment.get('use_bezier', False):
                                # Create geometry using Bézier curve function with 25 sample points
                                p0 = segment['p0']
                                p1 = segment['p1'] 
                                p2 = segment['p2']
                                p3 = segment['p3']
                                
                                geometry_sql = f"""
                                    bezier_cubic_line(
                                        ST_SetSRID(ST_MakePoint({p0[1]}, {p0[0]}), 4326),
                                        ST_SetSRID(ST_MakePoint({p1[1]}, {p1[0]}), 4326),
                                        ST_SetSRID(ST_MakePoint({p2[1]}, {p2[0]}), 4326),
                                        ST_SetSRID(ST_MakePoint({p3[1]}, {p3[0]}), 4326),
                                        50
                                    )
                                """
                            else:
                                # Fallback to simple LineString
                                curve_coords = segment.get('curve_points', [])
                                if curve_coords:
                                    coord_pairs = [f"ST_MakePoint({lon}, {lat})" for lat, lon in curve_coords]
                                    geometry_sql = f"ST_MakeLine(ARRAY[{', '.join(coord_pairs)}])"
                                else:
                                    # Simple line from start to end
                                    geometry_sql = f"ST_MakeLine(ST_MakePoint({segment['start_lon']}, {segment['start_lat']}), ST_MakePoint({segment['end_lon']}, {segment['end_lat']}))"
                            
                            cursor.execute(f"""
                                INSERT INTO lane_segments (
                                    lane_id, road_id, lane_name, geometry,
                                    length_m, time_empty_seconds, time_loaded_seconds, is_closed
                                ) 
                                SELECT 
                                    %s as lane_id,
                                    %s as road_id,
                                    %s as lane_name,
                                    ST_SetSRID({geometry_sql}, 4326) as geometry,
                                    %s as length_m,
                                    %s as time_empty_seconds,
                                    %s as time_loaded_seconds,
                                    %s as is_closed
                                ON CONFLICT (lane_id) DO NOTHING
                            """, (
                                str(segment['lane_id']),
                                int(curve['road_id']),
                                str(segment['lane_name']),
                                float(segment['length_m']),
                                float(roads_df[roads_df['Id'] == curve['road_id']]['FieldTimeempty'].iloc[0]),
                                float(roads_df[roads_df['Id'] == curve['road_id']]['FieldTimeloaded'].iloc[0]),
                                bool(curve['is_closed'])
                            ))
                            inserted_count += cursor.rowcount
                        
                        print(f"✅ Created {len(segments)} segments for road {curve['road_id']} ({curve['direction']})")
                            
                    except Exception as e:
                        print(f"❌ Error inserting segments for road {curve['road_id']}: {e}")
                        continue
        
            conn.commit()
            print(f"✅ Created {inserted_count} lane segments from Bézier curves")
        return True
    except Exception as e:
        print(f"❌ Error populating roads and segments: {e}")
        return False

def main():
    """Main function to populate the database"""
    print("=== Populating Database with Corrected Data ===")
    
    # Step 1: Populate unit types
    if not populate_unit_types():
        print("Failed to populate unit types")
        sys.exit(1)
    
    # Step 2: Populate pits and regions
    if not populate_pits_and_regions_new():
        print("Failed to populate pits and regions")
        sys.exit(1)
    
    # Step 3: Populate infrastructure
    if not populate_infrastructure():
        print("Failed to populate infrastructure")
        sys.exit(1)
    
    # Step 4: Populate roads and segments
    if not populate_roads_and_segments():
        print("Failed to populate roads and segments")
        sys.exit(1)
    
    print("🎉 Database populated successfully!")
    print("You can now run the map viewer to see the corrected data.")

if __name__ == "__main__":
    main()
