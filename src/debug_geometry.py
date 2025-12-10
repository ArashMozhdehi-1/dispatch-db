import psycopg2
from psycopg2.extras import RealDictCursor
import json

DB_CONFIG = {
    'host': 'host.docker.internal',
    'port': '5433',
    'database': 'mf_geoserver_db',
    'user': 'infra_user',
    'password': 'infra_password'
}

def main():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # 1. Find a road side center and its intersection
        print("Finding a sample road side center...")
        cursor.execute("""
            SELECT 
                _oid_,
                road_marker_metadata->>'road_id' as road_id,
                COALESCE(
                    road_marker_metadata->>'overlapping_entity_name',
                    road_marker_metadata->>'best_overlap_entity'
                ) as intersection_name,
                ST_AsText(geometry_wkt) as center_wkt,
                road_marker_metadata->>'segment_wkt' as segment_wkt
            FROM map_location 
            WHERE type = 'road_corner_side_center'
              AND road_marker_metadata->>'overlapping_entity_name' IS NOT NULL
            LIMIT 1
        """)
        row = cursor.fetchone()
        
        if not row:
            print("No road side center found.")
            return

        print(f"Testing with Road: {row['road_id']}, Intersection: {row['intersection_name']}")
        
        intersection_name = row['intersection_name']
        segment_wkt = row['segment_wkt']
        center_wkt = row['center_wkt']
        
        # 2. Fetch intersection geometry
        cursor.execute("""
            SELECT ST_AsText(geometry_wkt) as wkt 
            FROM map_location 
            WHERE name = %s 
              AND type IN ('intersection_polygon', 'Intersection')
        """, (intersection_name,))
        
        inter_row = cursor.fetchone()
        if not inter_row:
            print(f"Intersection {intersection_name} not found.")
            return
            
        intersection_wkt = inter_row['wkt']
        
        # 3. Test geometric operations
        print("\n--- Geometric Analysis ---")
        
        # A. Closest Point on Boundary to Segment (Old method)
        cursor.execute("""
            SELECT ST_AsText(ST_ClosestPoint(ST_Boundary(ST_GeomFromText(%s)), ST_GeomFromText(%s))) as pt
        """, (intersection_wkt, segment_wkt))
        res_a = cursor.fetchone()['pt']
        print(f"A. ClosestPoint(Boundary, Segment): {res_a}")
        
        # B. Closest Point on Boundary to Center (Current method)
        cursor.execute("""
            SELECT ST_AsText(ST_ClosestPoint(ST_Boundary(ST_GeomFromText(%s)), ST_GeomFromText(%s))) as pt
        """, (intersection_wkt, center_wkt))
        res_b = cursor.fetchone()['pt']
        print(f"B. ClosestPoint(Boundary, Center):  {res_b}")
        
        # C. Intersection of Boundary and Segment (Proposed method)
        cursor.execute("""
            SELECT ST_AsText(ST_Intersection(ST_Boundary(ST_GeomFromText(%s)), ST_GeomFromText(%s))) as geom
        """, (intersection_wkt, segment_wkt))
        res_c = cursor.fetchone()['geom']
        print(f"C. Intersection(Boundary, Segment): {res_c}")
        
        # D. Robust Intersection (Intersection + Closest to Center)
        cursor.execute("""
            SELECT ST_AsText(ST_ClosestPoint(
                ST_Intersection(ST_Boundary(ST_GeomFromText(%s)), ST_GeomFromText(%s)),
                ST_GeomFromText(%s)
            )) as pt
        """, (intersection_wkt, segment_wkt, center_wkt))
        res_d = cursor.fetchone()['pt']
        print(f"D. Robust Intersection: {res_d}")
        
        print("\n--- Interpretation ---")
        if res_c == 'GEOMETRYCOLLECTION EMPTY':
            print("Segment does NOT intersect boundary (Gap or fully inside/outside without touching edges).")
        elif 'LINESTRING' in res_c:
            print("Segment overlaps boundary (Collinear). Midpoint of this overlap is likely the best anchor.")
        elif 'POINT' in res_c:
            print("Segment crosses boundary at a specific point. This is the exact anchor.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    main()
