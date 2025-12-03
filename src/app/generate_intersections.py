#!/usr/bin/env python3
"""
Generate smooth intersection polygons and update the database.
"""
import os
import sys
import json
import math  # <-- add this
import psycopg2
from psycopg2.extras import RealDictCursor
from shapely.geometry import shape, mapping, Point
from collections import defaultdict

# Add /app to path to allow imports from src
sys.path.append('/app')

from src.core.intersection_geometry import build_intersection_polygons

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

def create_intersections_table(conn):
    """Create intersections table (drop if exists to ensure schema)"""
    try:
        cursor = conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS intersections CASCADE;")
        cursor.execute("""
            CREATE TABLE intersections (
                intersection_id SERIAL PRIMARY KEY,
                intersection_name VARCHAR(255),
                intersection_type VARCHAR(50) DEFAULT 'road_intersection',
                geometry GEOMETRY(POLYGON, 4326),
                center_point GEOMETRY(POINT, 4326),
                safety_buffer_m DECIMAL(10,2) DEFAULT 5.0,
                r_min_m DECIMAL(10,2) DEFAULT 10.0,
                connected_roads INTEGER[],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX idx_intersections_geometry ON intersections USING GIST (geometry);
        """)
        conn.commit()
        print("✅ Recreated intersections table with correct schema")
        return True
    except Exception as e:
        print(f"❌ Error creating intersections table: {e}")
        return False

def load_road_axes(conn):
    """
    Pre-compute an 'axis' (0..pi) for each road_id, so that forward/backward
    lanes of the same physical corridor collapse to the same axis.

    We sample heading around the mid-point of the merged road line.
    """
    cur = conn.cursor(cursor_factory=RealDictCursor)

    road_axis_sql = """
    WITH road_lines AS (
        SELECT
            road_id,
            ST_LineMerge(ST_Union(geometry))::geometry(LINESTRING, 4326) AS geom
        FROM lane_segments
        GROUP BY road_id
    )
    SELECT
        road_id,
        ST_Azimuth(
            ST_LineInterpolatePoint(geom, 0.49),
            ST_LineInterpolatePoint(geom, 0.51)
        ) AS heading_rad
    FROM road_lines;
    """

    cur.execute(road_axis_sql)
    rows = cur.fetchall()

    road_axes = {}
    for row in rows:
        angle = row["heading_rad"]
        if angle is None:
            continue

        # fold 0..2π → 0..π so that forward/backwards share the same axis
        axis = angle % (2 * math.pi)
        if axis >= math.pi:
            axis -= math.pi

        road_axes[row["road_id"]] = axis

    print(f"  Precomputed axes for {len(road_axes)} roads")
    return road_axes


def characterize_physical_roads(road_ids, road_axes, tolerance_deg=15.0):
    """
    Group lane-level roads into physical corridors by axis.

    Returns
    -------
    num_physical : int
        Number of distinct physical corridors (axis clusters).
    max_angle_between_axes_deg : float
        Maximum angular separation between any two corridor axes (for logging/debug).
    """
    axes = []
    for rid in road_ids:
        axis = road_axes.get(rid)
        if axis is not None:
            axes.append(axis)

    # No heading info -> treat each road_id as its own physical road
    if not axes:
        return len(set(road_ids)), 0.0

    axes.sort()
    tol = math.radians(tolerance_deg)

    # Cluster nearly-parallel axes into one "physical" corridor
    clusters = [[axes[0]]]
    for a in axes[1:]:
        if abs(a - clusters[-1][-1]) <= tol:
            clusters[-1].append(a)
        else:
            clusters.append([a])

    centers = [sum(c) / len(c) for c in clusters]
    num_physical = len(centers)

    if num_physical < 2:
        return num_physical, 0.0

    # For debug only: how different are the corridors in angle?
    max_sep = 0.0
    for i in range(num_physical):
        for j in range(i + 1, num_physical):
            d = abs(centers[i] - centers[j])
            if d > max_sep:
                max_sep = d

    return num_physical, math.degrees(max_sep)

def detect_intersections(conn):
    """
    Detect intersections where *roads* (merged lane_segments by road_id) actually cross or join,
    using PostGIS line/line intersections, then drop those that only involve 1–2 physical roads.
    """
    print("🕵️ Detecting intersections from actual road crossings (PostGIS)...")

    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # 0) Precompute axes (physical road directions) per road_id
        print("  Precomputing road axes...")
        road_axes = load_road_axes(conn)

        # 1–4. Let PostGIS do the heavy lifting to find intersection clusters
        intersection_sql = """
        WITH road_lines AS (
            SELECT
                road_id,
                ST_LineMerge(ST_Union(geometry))::geometry(LINESTRING, 4326) AS geom
            FROM lane_segments
            GROUP BY road_id
        ),
        road_endpoints AS (
            SELECT road_id, ST_StartPoint(geom) as pt FROM road_lines
            UNION ALL
            SELECT road_id, ST_EndPoint(geom) as pt FROM road_lines
        ),
        raw_connections AS (
            SELECT
                r1.road_id AS road_id_1,
                r2.road_id AS road_id_2,
                ST_Transform(
                    ST_Centroid(ST_Collect(r1.pt, r2.pt)),
                    3857
                ) AS geom
            FROM road_endpoints r1
            JOIN road_endpoints r2 ON r1.road_id < r2.road_id
            WHERE ST_DWithin(r1.pt, r2.pt, 0.0005) -- approx 55m
        ),
        clustered AS (
            SELECT
                ST_ClusterDBSCAN(
                    geom,
                    eps      := 220.0, -- approx 220 m in EPSG:3857
                    minpoints := 1
                ) OVER () AS cid,
                road_id_1,
                road_id_2,
                geom
            FROM raw_connections
        ),
        clusters AS (
            SELECT
                cid,
                ST_Transform(
                    ST_Centroid(ST_Collect(geom)),
                    4326
                ) AS center_geom,
                ARRAY_AGG(DISTINCT road_id_1) AS roads_1,
                ARRAY_AGG(DISTINCT road_id_2) AS roads_2
            FROM clustered
            GROUP BY cid
        )
        SELECT
            cid,
            ST_X(center_geom) AS lon,
            ST_Y(center_geom) AS lat,
            roads_1,
            roads_2
        FROM clusters
        ORDER BY cid;
        """

        cur.execute(intersection_sql)
        rows = cur.fetchall()
        print(f"  Raw intersection clusters from DB: {len(rows)}")

        if not rows:
            print("⚠️ No intersections found – nothing to insert")
            return True

        ins_cur = conn.cursor()
        delta = 0.00025  # ~25 m in degrees near equator
        inserted = 0
        skipped_two_road = 0

        for idx, row in enumerate(rows):
            lon = row["lon"]
            lat = row["lat"]

            # Merge both road arrays into a distinct set of road_ids
            roads = set()
            for key in ("roads_1", "roads_2"):
                arr = row.get(key) or []
                for rid in arr:
                    if rid is not None:
                        roads.add(int(rid))

            if len(roads) < 2:
                # not even 2 road_ids → not a road intersection
                continue

            road_list = sorted(roads)
            road_str = ", ".join(str(r) for r in road_list)

            # ---- NEW: characterise the physical corridors at this cluster ----
            num_physical, max_angle_deg = characterize_physical_roads(
                road_list,
                road_axes,
                tolerance_deg=15.0,  # axes within ~15° = same corridor
            )

            # DROP ONLY the boring "single corridor" clusters:
            # all lanes essentially parallel → just segmentation / lane splits.
            if num_physical <= 1:
                print(
                    f"  ⚪ Skipping Intersection {idx + 1}: "
                    f"{len(road_list)} lane-level roads, "
                    f"{num_physical} physical corridor, "
                    f"max angular spread={max_angle_deg:.1f}° "
                    f"({road_str})"
                )
                skipped_two_road += 1
                continue

            # Everything else (2+ corridors) is a *real* intersection:
            #   - + crossroads (your first screenshot) → 2 axes, ~90°
            #   - T / Y / ramp into middle of road (second screenshot) → 2 axes, some angle
            #   - roundabouts / complex nodes → 3+ axes
            print(
                f"intersection Intersection {idx + 1}: "
                f"{len(road_list)} lane-level roads, "
                f"{num_physical} physical corridors, "
                f"max angular spread={max_angle_deg:.1f}° "
                f"({road_str})"
            )

            name = f"Intersection {idx + 1}"

            poly_wkt = (
                f"POLYGON(({lon - delta} {lat - delta}, "
                f"{lon + delta} {lat - delta}, "
                f"{lon + delta} {lat + delta}, "
                f"{lon - delta} {lat + delta}, "
                f"{lon - delta} {lat - delta}))"
            )

            try:
                ins_cur.execute(
                    """
                    INSERT INTO intersections (
                        intersection_name,
                        intersection_type,
                        geometry,
                        center_point,
                        safety_buffer_m,
                        r_min_m,
                        connected_roads
                    ) VALUES (
                        %s,
                        'road_intersection',
                        ST_GeomFromText(%s, 4326),
                        ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                        5.0,
                        10.0,
                        %s
                    )
                    """,
                    (name, poly_wkt, lon, lat, road_list),
                )
                inserted += 1
            except Exception as e:
                print(f"  ❌ Error inserting intersection {idx + 1}: {e}")

        conn.commit()
        print(f"✅ Inserted {inserted} intersections based on *actual road* crossings")
        print(f"🧹 Skipped {skipped_two_road} clusters with ≤2 physical roads")
        return True

    except Exception as e:
        print(f"❌ Error detecting intersections: {e}")
        conn.rollback()
        import traceback
        traceback.print_exc()
        return False

def main():
    print("🚀 Starting intersection generation...")
    conn = get_db_connection()
    if not conn:
        sys.exit(1)

    try:
        # 0. Ensure table exists
        if not create_intersections_table(conn):
            return False

        # 1. Detect intersections (populate table)
        if not detect_intersections(conn):
            return False

        # 2. Build smooth polygons
        # Fetch all intersections
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM intersections")
        intersections = cur.fetchall()

        # Fetch all roads
        cur.execute("SELECT road_id, ST_AsGeoJSON(geometry) as geometry FROM lane_segments")
        roads = cur.fetchall()

        print(f"🏗️ Building smooth polygons for {len(intersections)} intersections...")
        
        # Build polygons
        results = build_intersection_polygons(
            roads, 
            intersections, 
            road_width_m=40.0,
            slice_length_m=150.0,
            nearby_threshold_m=150.0,
            intersection_expand_factor=0.8,
            debug=True
        )

        # Update DB
        update_cur = conn.cursor()
        updated = 0
        for res in results:
            if "nice_geometry" in res:
                geom_json = json.dumps(res["nice_geometry"])
                update_cur.execute(
                    """
                    UPDATE intersections
                    SET geometry = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)
                    WHERE intersection_id = %s
                    """,
                    (geom_json, res["intersection_id"])
                )
                updated += 1
        
        conn.commit()
        print(f"✅ Updated {updated} intersections with smooth polygons")

    except Exception as e:
        print(f"❌ Error in main loop: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    main()
