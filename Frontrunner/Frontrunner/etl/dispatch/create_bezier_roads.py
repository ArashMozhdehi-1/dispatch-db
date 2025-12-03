#!/usr/bin/env python3
"""
Script to create Bézier curve roads from the CSV data
"""
import sys
import pandas as pd
import numpy as np
from pathlib import Path

sys.path.append('/app')

from src.models import DatabaseManager
from src.models.coordinate_transform import transform_coordinates_batch

def create_bezier_functions():
    """Create the Bézier curve functions in PostgreSQL"""
    db = DatabaseManager()
    
    bezier_functions_sql = """
    -- Returns a POINT on the cubic Bézier at parameter t ∈ [0,1]
    CREATE OR REPLACE FUNCTION bezier_cubic_point(
        p0 geometry, p1 geometry, p2 geometry, p3 geometry, t double precision
    ) RETURNS geometry LANGUAGE sql IMMUTABLE AS $$
    SELECT ST_SetSRID(
      ST_MakePoint(
        /* x(t) */
        (1-t)^3 * ST_X(p0) +
        3*(1-t)^2*t * ST_X(p1) +
        3*(1-t)*t^2 * ST_X(p2) +
        t^3 * ST_X(p3),
        /* y(t) */
        (1-t)^3 * ST_Y(p0) +
        3*(1-t)^2*t * ST_Y(p1) +
        3*(1-t)*t^2 * ST_Y(p2) +
        t^3 * ST_Y(p3)
      ),
      ST_SRID(p0)
    );
    $$;

    -- n_samples controls smoothness (>=2). More = smoother.
    CREATE OR REPLACE FUNCTION bezier_cubic_line(
        p0 geometry, p1 geometry, p2 geometry, p3 geometry, n_samples integer
    ) RETURNS geometry LANGUAGE sql IMMUTABLE AS $$
    WITH params AS (
      SELECT g AS i, g::double precision/(n_samples::double precision) AS t
      FROM generate_series(0, n_samples) AS g
    ),
    pts AS (
      SELECT bezier_cubic_point(p0,p1,p2,p3,t) AS pt
      FROM params
      ORDER BY i
    )
    SELECT ST_MakeLine(pt ORDER BY 1) FROM pts;
    $$;
    """
    
    try:
        db.execute_query(bezier_functions_sql)
        print("✅ Bézier curve functions created successfully")
        return True
    except Exception as e:
        print(f"❌ Error creating Bézier functions: {e}")
        return False

def utm_to_latlon_ultimate(x, y):
    """Convert UTM coordinates to latitude/longitude using GDA94/MGA Zone 55"""
    try:
        from pyproj import Transformer
        transformer = Transformer.from_crs("EPSG:28355", "EPSG:4326", always_xy=True)
        lon, lat = transformer.transform(x, y)
        return lat, lon
    except Exception as e:
        return None, None

def bezier_cubic_point(p0, p1, p2, p3, t):
    """Calculate a point on the cubic Bézier curve at parameter t ∈ [0,1]"""
    x = (1-t)**3 * p0[0] + 3*(1-t)**2*t * p1[0] + 3*(1-t)*t**2 * p2[0] + t**3 * p3[0]
    y = (1-t)**3 * p0[1] + 3*(1-t)**2*t * p1[1] + 3*(1-t)*t**2 * p2[1] + t**3 * p3[1]
    return (x, y)

def generate_bezier_curve(p0, p1, p2, p3, num_points=25):
    """Generate a Bézier curve with num_points points"""
    curve_points = []
    for i in range(num_points):
        t = i / (num_points - 1)
        point = bezier_cubic_point(p0, p1, p2, p3, t)
        curve_points.append(point)
    return curve_points

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
    
    # Forward curve (start to end)
    forward_curve = generate_bezier_curve(p0, p1, p2, p3)
    curves.append({
        'road_id': road_id,
        'direction': 'forward',
        'start_location_id': start_loc['id'],
        'end_location_id': end_loc['id'],
        'curve_points': forward_curve,
        'is_closed': is_closed,
        'distance': distance
    })
    
    # Reverse curve (end to start) - reverse the control points
    reverse_curve = generate_bezier_curve(p3, p2, p1, p0)
    curves.append({
        'road_id': road_id,
        'direction': 'reverse',
        'start_location_id': end_loc['id'],
        'end_location_id': start_loc['id'],
        'curve_points': reverse_curve,
        'is_closed': is_closed,
        'distance': distance
    })
    
    return curves

def create_lane_segments_from_bezier_curve(curve_data, target_length=75.0):
    """
    Create proper lane segments from Bézier curve data, breaking long curves into 50-100m segments
    Same method as notebook but for database storage
    """
    segments = []
    road_id = curve_data['road_id']
    direction = curve_data['direction']
    curve_points = curve_data['curve_points']
    total_distance = curve_data['distance']
    is_closed = curve_data['is_closed']
    
    # If curve is short enough, create one segment
    if total_distance <= 100.0:
        start_point = curve_points[0]
        end_point = curve_points[-1]
        
        segment = {
            "lane_id": f"road_{road_id}_0_{direction}",
            "lane_name": f"Road {road_id} - Segment 0 ({direction.title()})",
            "start_lat": start_point[0],
            "start_lon": start_point[1],
            "end_lat": end_point[0],
            "end_lon": end_point[1],
            "length_m": total_distance,
            "curve_points": curve_points
        }
        segments.append(segment)
        return segments
    
    # For long curves, break into multiple segments
    num_segments = max(1, int(np.ceil(total_distance / target_length)))
    segment_length = total_distance / num_segments
    
    # Create evenly spaced points along the curve
    cumulative_distances = [0]
    for i in range(len(curve_points) - 1):
        dist = np.linalg.norm(
            np.array(curve_points[i + 1]) - np.array(curve_points[i])
        )
        cumulative_distances.append(cumulative_distances[-1] + dist)
    
    # Generate segments
    for seg_idx in range(num_segments):
        start_distance = seg_idx * segment_length
        end_distance = min((seg_idx + 1) * segment_length, total_distance)
        
        # Find start and end points
        start_point = interpolate_point_at_distance(
            curve_points, cumulative_distances, start_distance
        )
        end_point = interpolate_point_at_distance(
            curve_points, cumulative_distances, end_distance
        )
        
        actual_length = end_distance - start_distance
        
        segment = {
            "lane_id": f"road_{road_id}_{seg_idx}_{direction}",
            "lane_name": f"Road {road_id} - Segment {seg_idx} ({direction.title()})",
            "start_lat": start_point[0],
            "start_lon": start_point[1],
            "end_lat": end_point[0],
            "end_lon": end_point[1],
            "length_m": actual_length,
            "curve_points": curve_points[start_distance:end_distance] if start_distance < len(curve_points) else curve_points
        }
        segments.append(segment)
    
    return segments

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

def load_csv_data():
    """Load the CSV data files"""
    try:
        # Load CSV files
        locations_df = pd.read_csv('/app/data/locations.csv')
        roads_df = pd.read_csv('/app/data/roads.csv')
        roadgraphx_df = pd.read_csv('/app/data/roadgraphx.csv')
        roadgraphy_df = pd.read_csv('/app/data/roadgraphy.csv')
        
        # Merge roadgraph data
        coords_df = roadgraphx_df.merge(roadgraphy_df, on=['Id', 'Index'])
        
        print(f"Loaded {len(locations_df)} locations")
        print(f"Loaded {len(roads_df)} roads")
        print(f"Loaded {len(coords_df)} coordinate points")
        
        return locations_df, roads_df, coords_df
    except Exception as e:
        print(f"❌ Error loading CSV data: {e}")
        return None, None, None

def create_bezier_roads():
    """Create Bézier curve roads and insert them into the database - same method as notebook"""
    db = DatabaseManager()
    
    # Load data
    locations_df, roads_df, coords_df = load_csv_data()
    if locations_df is None:
        return False
    
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
    with db.get_cursor() as conn:
        with conn.cursor() as cursor:
            for curve in bezier_curves_ultimate:
                try:
                    # Create multiple segments for each curve (50-100m each)
                    segments = create_lane_segments_from_bezier_curve(curve, target_length=75.0)
                    
                    for segment in segments:
                        # Create LineString from curve points
                        curve_coords = segment['curve_points']
                        coord_pairs = [f"ST_MakePoint({lon}, {lat})" for lat, lon in curve_coords]
                        geometry_sql = f"ST_MakeLine(ARRAY[{', '.join(coord_pairs)}])"
                        
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
                            segment['lane_id'],
                            curve['road_id'],
                            segment['lane_name'],
                            segment['length_m'],
                            float(roads_df[roads_df['Id'] == curve['road_id']]['FieldTimeempty'].iloc[0]),
                            float(roads_df[roads_df['Id'] == curve['road_id']]['FieldTimeloaded'].iloc[0]),
                            curve['is_closed']
                        ))
                        inserted_count += cursor.rowcount
                    
                    print(f"✅ Created {len(segments)} segments for road {curve['road_id']} ({curve['direction']})")
                        
                except Exception as e:
                    print(f"❌ Error inserting segments for road {curve['road_id']}: {e}")
                    continue
        
        conn.commit()
    
    print(f"✅ Created {inserted_count} lane segments from Bézier curves")
    return True

if __name__ == "__main__":
    print("=== Creating Bézier Curve Roads ===")
    
    # Step 1: Create Bézier functions
    if not create_bezier_functions():
        print("Failed to create Bézier functions")
        sys.exit(1)
    
    # Step 2: Create Bézier roads
    if create_bezier_roads():
        print("🎉 Bézier curve roads created successfully!")
        print("You can now visualize these curves on a map to see the road connections.")
    else:
        print("❌ Failed to create Bézier roads")
        sys.exit(1)