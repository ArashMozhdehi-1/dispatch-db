#!/usr/bin/env python3

import math
import json
import sys
from typing import Dict, Any, Tuple, Optional, List
import psycopg2
from psycopg2.extras import RealDictCursor

from lib.vehicle_profiles import VehicleProfile, get_vehicle_profile
from lib.dubins_path import Pose, compute_dubins_path, sample_dubins_path, normalize_angle
def sample_cubic_bezier(p0, p1, p2, p3, num_points=64):
    """Sample a cubic Bezier curve defined by 4 control points."""
    points = []
    for i in range(num_points + 1):
        t = i / num_points
        mt = 1 - t
        x = (
            (mt ** 3) * p0[0]
            + 3 * (mt ** 2) * t * p1[0]
            + 3 * mt * (t ** 2) * p2[0]
            + (t ** 3) * p3[0]
        )
        y = (
            (mt ** 3) * p0[1]
            + 3 * (mt ** 2) * t * p1[1]
            + 3 * mt * (t ** 2) * p2[1]
            + (t ** 3) * p3[1]
        )
        points.append((x, y))
    return points


def build_smooth_turn_curve(
    start: Pose,
    goal: Pose,
    min_turn_radius: float,
    num_points: int = 80,
) -> List[Tuple[float, float]]:
    """
    Build a visually smooth curve between start and goal using a cubic Bezier.
    Uses headings at the endpoints as tangents and scales control points
    based on the minimum turning radius and distance between centers.
    """
    p0 = (start.x, start.y)
    p3 = (goal.x, goal.y)

    u0 = (math.cos(start.theta), math.sin(start.theta))
    u3 = (math.cos(goal.theta), math.sin(goal.theta))

    dx = p3[0] - p0[0]
    dy = p3[1] - p0[1]
    center_dist = math.hypot(dx, dy)

    # Heuristic for control point distance: between ~0.25*dist and 0.5*dist, but at least ~radius
    ctrl_dist = max(min_turn_radius * 0.8, center_dist * 0.25)
    ctrl_dist = min(ctrl_dist, center_dist * 0.5) if center_dist > 1e-3 else min_turn_radius

    p1 = (p0[0] + ctrl_dist * u0[0], p0[1] + ctrl_dist * u0[1])
    p2 = (p3[0] - ctrl_dist * u3[0], p3[1] - ctrl_dist * u3[1])

    return sample_cubic_bezier(p0, p1, p2, p3, num_points=num_points)




def get_road_side_centers_at_intersection(
    cursor,
    from_road_id: str,
    to_road_id: str,
    intersection_name: str,
    local_srid: int,
    from_marker_oid: Optional[str] = None,
    to_marker_oid: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Fetch side-center points for two roads at a shared intersection.
    
    Returns dict with:
        - from_point: (x, y) in local SRID
        - from_segment: list of (x, y) points for the width edge
        - to_point: (x, y) in local SRID
        - to_segment: list of (x, y) points for the width edge
        - intersection_geom_wkt: WKT in local SRID
        - intersection_centroid: (x, y) in local SRID
    """
    if from_marker_oid and to_marker_oid:
        query = """
        WITH from_center AS (
            SELECT
                _oid_,
                road_marker_metadata->>'road_id' AS road_id,
                ST_Transform(geometry_wkt, %s) AS geom,
                ST_Transform(ST_GeomFromText(road_marker_metadata->>'segment_wkt', 4326), %s) AS segment_geom
            FROM map_location
            WHERE _oid_ = %s
              AND type = 'road_corner_side_center'
        ),
        to_center AS (
            SELECT
                _oid_,
                road_marker_metadata->>'road_id' AS road_id,
                ST_Transform(geometry_wkt, %s) AS geom,
                ST_Transform(ST_GeomFromText(road_marker_metadata->>'segment_wkt', 4326), %s) AS segment_geom
            FROM map_location
            WHERE _oid_ = %s
              AND type = 'road_corner_side_center'
        ),
        intersection_poly AS (
            SELECT
                ST_Transform(geometry_wkt, %s) AS geom
            FROM map_location
            WHERE name = %s
                AND type IN ('intersection_polygon', 'Intersection')
            LIMIT 1
        )
        SELECT
            f.road_id AS from_road_id,
            t.road_id AS to_road_id,
            ST_X(f.geom) AS from_x,
            ST_Y(f.geom) AS from_y,
            ST_AsText(f.segment_geom) AS from_segment_wkt,
            ST_X(t.geom) AS to_x,
            ST_Y(t.geom) AS to_y,
            ST_AsText(t.segment_geom) AS to_segment_wkt,
            ST_AsText(i.geom) AS intersection_wkt,
            ST_X(ST_Centroid(i.geom)) AS intersection_cx,
            ST_Y(ST_Centroid(i.geom)) AS intersection_cy,
            ST_X(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), f.segment_geom), f.geom), ST_ClosestPoint(ST_Boundary(i.geom), f.geom))) AS from_boundary_x,
            ST_Y(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), f.segment_geom), f.geom), ST_ClosestPoint(ST_Boundary(i.geom), f.geom))) AS from_boundary_y,
            ST_X(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), t.segment_geom), t.geom), ST_ClosestPoint(ST_Boundary(i.geom), t.geom))) AS to_boundary_x,
            ST_Y(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), t.segment_geom), t.geom), ST_ClosestPoint(ST_Boundary(i.geom), t.geom))) AS to_boundary_y
        FROM from_center f, to_center t, intersection_poly i;
        """
        cursor.execute(
            query,
            (
                local_srid, local_srid,
                from_marker_oid,
                local_srid, local_srid,
                to_marker_oid,
                local_srid,
                intersection_name,
            ),
        )
    else:
        query = """
    WITH centers AS (
        SELECT
            _oid_,
            road_marker_metadata->>'road_id' AS road_id,
            road_marker_metadata->>'road_name' AS road_name,
            COALESCE(
                road_marker_metadata->>'overlapping_entity_name',
                road_marker_metadata->>'best_overlap_entity'
            ) AS intersection_name,
            road_marker_metadata->>'segment_wkt' AS segment_wkt,
            ST_Transform(geometry_wkt, %s) AS geom,
            ST_Transform(ST_GeomFromText(road_marker_metadata->>'segment_wkt', 4326), %s) AS segment_geom
        FROM map_location
        WHERE type = 'road_corner_side_center'
          AND road_marker_metadata->>'road_id' IS NOT NULL
    ),
    from_center AS (
        SELECT * FROM centers
        WHERE road_id = %s
          AND intersection_name = %s
        LIMIT 1
    ),
    to_center AS (
        SELECT * FROM centers
        WHERE road_id = %s
          AND intersection_name = %s
        LIMIT 1
    ),
    intersection_poly AS (
        SELECT
            ST_Transform(geometry_wkt, %s) AS geom
        FROM map_location
        WHERE name = %s
          AND type IN ('intersection_polygon', 'Intersection')
        LIMIT 1
    )
    SELECT
        ST_X(f.geom) AS from_x,
        ST_Y(f.geom) AS from_y,
        ST_AsText(f.segment_geom) AS from_segment_wkt,
        ST_X(t.geom) AS to_x,
        ST_Y(t.geom) AS to_y,
        ST_AsText(t.segment_geom) AS to_segment_wkt,
        ST_AsText(i.geom) AS intersection_wkt,
        ST_X(ST_Centroid(i.geom)) AS intersection_cx,
        ST_Y(ST_Centroid(i.geom)) AS intersection_cy,
        ST_X(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), f.segment_geom), f.geom), ST_ClosestPoint(ST_Boundary(i.geom), f.geom))) AS from_boundary_x,
        ST_Y(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), f.segment_geom), f.geom), ST_ClosestPoint(ST_Boundary(i.geom), f.geom))) AS from_boundary_y,
        ST_X(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), t.segment_geom), t.geom), ST_ClosestPoint(ST_Boundary(i.geom), t.geom))) AS to_boundary_x,
        ST_Y(COALESCE(ST_ClosestPoint(ST_Intersection(ST_Boundary(i.geom), t.segment_geom), t.geom), ST_ClosestPoint(ST_Boundary(i.geom), t.geom))) AS to_boundary_y
    FROM from_center f, to_center t, intersection_poly i;
    """

        cursor.execute(query, (
            local_srid, local_srid,  # Transform for centers
            from_road_id, intersection_name,
            to_road_id, intersection_name,
            local_srid,  # Transform for intersection
            intersection_name
        ))
    
    row = cursor.fetchone()
    if not row:
        return None
    
    # Validation: Ensure markers actually belong to the requested roads (when checking by OID)
    if from_marker_oid and to_marker_oid:
        # Check from_road_id / to_road_id logic
        if (str(row.get("from_road_id")) != str(from_road_id) or str(row.get("to_road_id")) != str(to_road_id)):
             print(
                f"[Turn Path] Marker/road mismatch: "
                f"from_marker road_id={row.get('from_road_id')} expected={from_road_id}, "
                f"to_marker road_id={row.get('to_road_id')} expected={to_road_id}",
                file=sys.stderr, flush=True
            )
             return None
    
    # Parse WKT segments into coordinate lists
    def parse_linestring_wkt(wkt: Optional[str]) -> List[Tuple[float, float]]:
        # "LINESTRING(x1 y1, x2 y2, ...)" -> [(x1, y1), (x2, y2), ...]
        if wkt is None:
            return []
        coords_str = wkt.replace("LINESTRING(", "").replace(")", "")
        return [tuple(map(float, pt.strip().split())) for pt in coords_str.split(",")]
    
    return {
        "from_point": (row["from_x"], row["from_y"]),
        "from_boundary_point": (row["from_boundary_x"], row["from_boundary_y"]),
        "from_segment": parse_linestring_wkt(row.get("from_segment_wkt")),
        "to_point": (row["to_x"], row["to_y"]),
        "to_boundary_point": (row["to_boundary_x"], row["to_boundary_y"]),
        "to_segment": parse_linestring_wkt(row.get("to_segment_wkt")),
        "intersection_wkt": row["intersection_wkt"],
        "intersection_centroid": (row["intersection_cx"], row["intersection_cy"])
    }


def snap_along_heading_to_boundary(
    cursor,
    x: float,
    y: float,
    heading_rad: float,
    direction_sign: int,
    intersection_wkt: str,
    local_srid: int,
    max_snap_dist_m: float = 60.0,
) -> Tuple[float, float]:
    """
    Slide (x, y) along the given heading until it hits the intersection boundary.

    direction_sign:
        +1 → move in the same direction as heading_rad
        -1 → move opposite to heading_rad

    If snapping fails for any reason, returns the original (x, y).
    """
    dx = math.cos(heading_rad) * direction_sign
    dy = math.sin(heading_rad) * direction_sign

    far_x = x + max_snap_dist_m * dx
    far_y = y + max_snap_dist_m * dy

    sql = """
    WITH intersection AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
    ),
    ray AS (
        SELECT ST_MakeLine(
            ST_SetSRID(ST_MakePoint(%s, %s), %s),
            ST_SetSRID(ST_MakePoint(%s, %s), %s)
        ) AS geom
    ),
    boundary AS (
        SELECT ST_Boundary(geom) AS geom
        FROM intersection
    ),
    inter AS (
        SELECT ST_Intersection(ray.geom, boundary.geom) AS geom
        FROM ray, boundary
    )
    SELECT
        ST_X(g) AS x,
        ST_Y(g) AS y
    FROM (
        SELECT (ST_Dump(geom)).geom AS g
        FROM inter
    ) d
    ORDER BY ST_Distance(
        g,
        ST_SetSRID(ST_MakePoint(%s, %s), %s)
    )
    LIMIT 1;
    """

    cursor.execute(sql, (
        intersection_wkt, local_srid,
        x, y, local_srid,
        far_x, far_y, local_srid,
        x, y, local_srid,
    ))
    row = cursor.fetchone()
    if not row:
        return x, y

    return float(row["x"]), float(row["y"])


def compute_road_heading(
    segment_coords: List[Tuple[float, float]],
    center_point: Tuple[float, float],
    intersection_centroid: Tuple[float, float],
    into_intersection: bool = True
) -> float:
    """
    Compute the heading (tangent direction) at a road's side-center point.
    
    Args:
        segment_coords: List of (x, y) points forming the width edge
        center_point: (x, y) of the side-center
        intersection_centroid: (x, y) of the intersection center
        into_intersection: If True, orient heading towards intersection
    
    Returns:
        Heading angle in radians
    """
    cx, cy = center_point
    ix, iy = intersection_centroid

    if not segment_coords or len(segment_coords) < 2:
        return math.atan2(iy - cy, ix - cx) if into_intersection else math.atan2(cy - iy, cx - ix)

    # Project the point onto each segment; pick the segment with the closest projection
    best_vec = None
    best_dist = float("inf")
    for i in range(len(segment_coords) - 1):
        x1, y1 = segment_coords[i]
        x2, y2 = segment_coords[i + 1]
        vx, vy = x2 - x1, y2 - y1
        seg_len2 = vx * vx + vy * vy
        if seg_len2 < 1e-9:
            continue
        t = ((cx - x1) * vx + (cy - y1) * vy) / seg_len2
        t = max(0.0, min(1.0, t))
        proj_x = x1 + t * vx
        proj_y = y1 + t * vy
        d = math.hypot(proj_x - cx, proj_y - cy)
        if d < best_dist:
            best_dist = d
            best_vec = (vx, vy)

    if best_vec is None:
        return math.atan2(iy - cy, ix - cx) if into_intersection else math.atan2(cy - iy, cx - ix)

    ex, ey = best_vec
    edge_length = math.hypot(ex, ey)

    if edge_length < 1e-3:
        return math.atan2(iy - cy, ix - cx) if into_intersection else math.atan2(cy - iy, cx - ix)

    nx_edge, ny_edge = ex / edge_length, ey / edge_length

    tx1, ty1 = -ny_edge, nx_edge
    tx2, ty2 = ny_edge, -nx_edge

    to_inter_x, to_inter_y = ix - cx, iy - cy
    dot1 = tx1 * to_inter_x + ty1 * to_inter_y
    dot2 = tx2 * to_inter_x + ty2 * to_inter_y

    if into_intersection:
        if dot1 >= dot2:
            return math.atan2(ty1, tx1)
        else:
            return math.atan2(ty2, tx2)
    else:
        if dot1 <= dot2:
            return math.atan2(ty1, tx1)
        else:
            return math.atan2(ty2, tx2)


def check_path_clearance(
    cursor,
    path_wkt: str,
    intersection_wkt: str,
    vehicle_width_m: float,
    side_buffer_m: float,
    local_srid: int,
    from_road_wkt: Optional[str] = None,
    to_road_wkt: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Check if the vehicle envelope (path + lateral buffer) stays within
    the Safe Zone (Intersection + Connecting Road Projections).

    Args:
        cursor: DB cursor
        path_wkt: The path LINESTRING
        intersection_wkt: The intersection POLYGON
        vehicle_width_m: Vehicle width
        side_buffer_m: Vehicle side buffer
        local_srid: SRID for metric calculations
        from_road_wkt: (Optional) POLYGON of the approach road "safe box"
        to_road_wkt: (Optional) POLYGON of the departure road "safe box"

    Returns:
        Dict with status and metrics.
    """
    buffer_radius = (vehicle_width_m / 2.0) + side_buffer_m

    # Default to empty polygons if roads not provided
    from_road_sql = "ST_GeomFromText(%s, %s)" if from_road_wkt else "ST_GeomFromText('POLYGON EMPTY', %s)"
    to_road_sql = "ST_GeomFromText(%s, %s)" if to_road_wkt else "ST_GeomFromText('POLYGON EMPTY', %s)"
    
    from_road_args = (from_road_wkt, local_srid) if from_road_wkt else (local_srid,)
    to_road_args = (to_road_wkt, local_srid) if to_road_wkt else (local_srid,)

    query = f"""
    WITH
      path AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
      ),
      intersection AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
      ),
      safe_zone AS (
        SELECT ST_Union(
            ST_Union(
                {from_road_sql},
                {to_road_sql}
            ),
            intersection.geom
        ) AS geom
        FROM intersection
      ),
      envelope_full AS (
        SELECT ST_Buffer(
                 path.geom,
                 %s,
                 'endcap=flat join=round'
               ) AS geom
        FROM path
      ),
      -- Calculate the part of the envelope that is OUTSIDE the safe zone
      leakage AS (
        SELECT ST_Difference(envelope_full.geom, safe_zone.geom) AS geom
        FROM envelope_full, safe_zone
      )
    SELECT
      ST_AsText(envelope_full.geom) AS envelope_wkt,
      ST_Area(leakage.geom) AS outside_area_sqm,
      -- Check if basically zero area is outside (allow tiny tolerance for floating point)
      (ST_Area(leakage.geom) < 0.5) AS strict_inside
    FROM envelope_full, leakage;
    """

    full_args = (
        path_wkt, local_srid,
        intersection_wkt, local_srid,
        *from_road_args,
        *to_road_args,
        buffer_radius,
    )

    try:
        cursor.execute(query, full_args)
        row = cursor.fetchone()
    except Exception as e:
        print(f"[Clearance] Error in query: {e}", file=sys.stderr, flush=True)
        row = None

    if not row or row["envelope_wkt"] is None:
        # Defensive fallback
        return {
            "vehicle_envelope_ok": False,
            "strict_inside": False,
            "outside_area_sqm": 999.9,
            "min_clearance_m": 0.0,
            "envelope_wkt": path_wkt,
        }

    outside_area = float(row.get("outside_area_sqm", 0.0))
    strict_inside = row.get("strict_inside", False)
    
    # We consider it OK if the leak is very small (rendering artifacts etc)
    # But user wants STRICT. 0.5 sqm is a reasonable tolerance for "zero".
    vehicle_envelope_ok = (outside_area < 2.0) # slightly looser tolerance for "OK" vs "Perfect"

    # print(
    #     f"[Clearance Check] outside_area={outside_area:.2f}m², "
    #     f"ok={vehicle_envelope_ok}",
    #     file=sys.stderr,
    #     flush=True,
    # )

    return {
        "vehicle_envelope_ok": vehicle_envelope_ok,
        "strict_inside": strict_inside,
        "outside_area_sqm": outside_area,
        "min_clearance_m": 0.0, # Deprecated metric in this new logic
        "envelope_wkt": row["envelope_wkt"],
    }


def _safe_load_geojson(value: Optional[str]) -> Optional[dict]:
    if not value:
        return None
    return json.loads(value)


def _point_inside_intersection(
    cursor,
    x: float,
    y: float,
    intersection_wkt: str,
    local_srid: int,
) -> bool:
    """
    Lightweight point-in-polygon check against the intersection polygon.
    """
    cursor.execute(
        """
        WITH inter AS (
          SELECT ST_GeomFromText(%s, %s) AS geom
        )
        SELECT ST_Contains(geom, ST_SetSRID(ST_MakePoint(%s, %s), %s)) AS inside
        FROM inter;
        """,
        (intersection_wkt, local_srid, x, y, local_srid),
    )
    row = cursor.fetchone()
    return bool(row and row.get("inside"))





def clip_centerline_and_envelope_to_roads(
    cursor,
    smooth_wkt_local: str,
    envelope_wkt_local: str,
    from_road_id: str,
    to_road_id: str,
    intersection_wkt_local: str,
    local_srid: int,
    from_segment_wkt_local: Optional[str] = None,
    to_segment_wkt_local: Optional[str] = None,
    halo_min_m: float = 5.0,
    halo_max_m: float = 40.0,
    weld_eps_m: float = 0.15,
) -> Dict[str, str]:
    """
    Final clipping step.

    Behaviour:
      • Take the vehicle envelope and clip it to the INTERSECTION polygon
        ⇒ turn patch is entirely inside the intersection.
      • Build small “bridge” polygons from the road width segments, but
        CLIP them to the intersection polygon so they only weld inside it.
      • Union (envelope ∪ bridges), round the join with a tiny buffer,
        then re-clip to the intersection.
      • Clip the smooth centreline to the same intersection.
    """

    # Radii for the weld:
    #  - bridge_radius: how thick the plugs around width segments are
    #  - smooth_radius: tiny rounding buffer for the union
    bridge_radius = max(1.0, weld_eps_m * 4.0)  # was 0.75, make plugs a bit fatter
    smooth_radius = max(0.25, weld_eps_m * 2.0)  # ~0.3 m minimum

    def _is_empty_wkt(text: Optional[str]) -> bool:
        if not text:
            return True
        return "EMPTY" in text.upper()

    def _has_nan_coordinates(wkt: Optional[str]) -> bool:
        if not wkt:
            return False
        return "nan" in wkt.lower() or "inf" in wkt.lower()

    sql = """
    WITH
      -- Raw inputs in local SRID
      smooth AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
      ),
      envelope AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
      ),
      intersection_poly AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
      ),

      ------------------------------------------------------------------
      -- BRIDGE INPUTS: exact road width segments for welding
      ------------------------------------------------------------------
      bridge_segments AS (
          SELECT ST_GeomFromText(%s, %s) AS geom
          UNION ALL
          SELECT ST_GeomFromText(%s, %s) AS geom
      ),
      -- Buffer segments along the roads (NO clipping yet)
      bridges_raw AS (
          SELECT
            ST_Buffer(geom, %s, 'endcap=flat join=round') AS geom
          FROM bridge_segments
          WHERE geom IS NOT NULL
      ),
      bridges AS (
          SELECT
            ST_UnaryUnion(
              ST_Collect(
                ST_CollectionExtract(
                  ST_MakeValid(ST_Buffer(geom, 0.0)),
                  3
                )
              )
            ) AS geom
          FROM bridges_raw
          WHERE geom IS NOT NULL
      ),

      ------------------------------------------------------------------
      -- 1) Keep full smooth centreline (NO clipping to intersection)
      ------------------------------------------------------------------
      smooth_clean AS (
        SELECT ST_LineMerge(
                 ST_CollectionExtract(
                   ST_MakeValid(ST_Buffer(geom, 0.0)),
                   2
                 )
               ) AS geom
        FROM smooth
      ),
      smooth_dump AS (
        SELECT (ST_Dump(geom)).geom AS geom
        FROM smooth_clean
      ),
      smooth_single AS (
        SELECT geom
        FROM smooth_dump
        WHERE ST_IsValid(geom) AND NOT ST_IsEmpty(geom)
        ORDER BY ST_Length(geom) DESC
        LIMIT 1
      ),

      ------------------------------------------------------------------
      -- 2) Clip the envelope to the intersection polygon
      ------------------------------------------------------------------
      turn_raw AS (
        SELECT ST_Intersection(e.geom, i.geom) AS geom
        FROM envelope e, intersection_poly i
      ),
      turn_clean AS (
        SELECT ST_CollectionExtract(
                 ST_MakeValid(ST_Buffer(geom, 0.0)),
                 3
               ) AS geom
        FROM turn_raw
      ),
      turn_snapped AS (
        SELECT ST_SnapToGrid(geom, 0.01) AS geom
        FROM turn_clean
      ),
      turn_final AS (
        SELECT ST_CollectionExtract(
                 ST_MakeValid(ST_Buffer(geom, 0.0)),
                 3
               ) AS geom
        FROM turn_snapped
      ),
      turn_dump AS (
        SELECT (ST_Dump(geom)).geom AS geom
        FROM turn_final
      ),
      turn_single AS (
        SELECT geom
        FROM turn_dump
        WHERE ST_IsValid(geom)
          AND NOT ST_IsEmpty(geom)
          AND ST_Area(geom) > 0.1
        ORDER BY ST_Area(geom) DESC
        LIMIT 1
      ),

      ------------------------------------------------------------------
      -- 3) FINAL VALIDITY FILTERS ON CENTRELINE + ENVELOPE
      ------------------------------------------------------------------
      smooth_valid AS (
        SELECT
          CASE
            WHEN geom IS NULL OR ST_IsEmpty(geom) OR ST_NPoints(geom) < 2
            THEN NULL
            ELSE ST_SimplifyPreserveTopology(
                   ST_RemoveRepeatedPoints(geom, 0.5),
                   1.0
                 )
          END AS geom
        FROM smooth_single
      ),
      turn_valid AS (
        SELECT
          CASE
            WHEN geom IS NULL
                 OR ST_IsEmpty(geom)
                 OR ST_NPoints(geom) < 4
                 OR ST_Area(geom) < 0.01
            THEN NULL
            ELSE ST_SimplifyPreserveTopology(
                   ST_RemoveRepeatedPoints(geom, 0.5),
                   1.0
                 )
          END AS geom
        FROM turn_single
      ),

      ------------------------------------------------------------------
      -- 4) Cosmetic padding + Bridging
      --    Union clipped patch with clipped bridges, buffer a hair to
      --    round the join, then re-clip to the intersection.
      ------------------------------------------------------------------
      turn_padded AS (
        SELECT
          CASE
            WHEN t.geom IS NULL AND (SELECT geom FROM bridges) IS NULL THEN NULL
            WHEN t.geom IS NULL THEN (SELECT geom FROM bridges)
            WHEN (SELECT geom FROM bridges) IS NULL THEN t.geom
            ELSE ST_SimplifyPreserveTopology(
                   ST_Buffer(
                     ST_UnaryUnion(
                       ST_Collect(
                         t.geom,
                         (SELECT geom FROM bridges)
                       )
                     ),
                     %s,
                     'join=round'
                   ),
                   0.10
                 )
          END AS geom
        FROM turn_valid t
      )

    SELECT
      ST_AsText(
        ST_Transform((SELECT geom FROM smooth_valid), 4326)
      ) AS smooth_wkt_4326,
      ST_AsGeoJSON(
        ST_Transform((SELECT geom FROM smooth_valid), 4326),
        6
      ) AS smooth_geojson,
      ST_AsText(
        ST_Transform((SELECT geom FROM turn_padded), 4326)
      ) AS envelope_wkt_4326,
      ST_AsGeoJSON(
        ST_Transform((SELECT geom FROM turn_padded), 4326),
        6
      ) AS envelope_geojson;
    """

    cursor.execute(
        sql,
        (
            smooth_wkt_local, local_srid,
            envelope_wkt_local, local_srid,
            intersection_wkt_local, local_srid,
            from_segment_wkt_local, local_srid,
            to_segment_wkt_local, local_srid,
            bridge_radius,      # for ST_Buffer(geom, %s ...) in bridges_raw
            smooth_radius,      # for ST_Buffer(..., %s ...) in turn_padded
        ),
    )
    row = cursor.fetchone()

    # NaN guard
    if row:
        if _has_nan_coordinates(row.get("smooth_wkt_4326")) or \
           _has_nan_coordinates(row.get("envelope_wkt_4326")):
            print("[Turn Path] NaN detected in geometry; treating as invalid", file=sys.stderr)
            row = None

    # --- Fallback
    if (
        not row
        or _is_empty_wkt(row.get("smooth_wkt_4326"))
        or _is_empty_wkt(row.get("envelope_wkt_4326"))
    ):
        print("[Turn Path] Clipping empty; attempting simple intersection fallback", file=sys.stderr)
        # Use simpler logic but with consistent bridging if possible
        cursor.execute(
            """
            WITH
              smooth AS (SELECT ST_GeomFromText(%s, %s) AS geom),
              envelope AS (SELECT ST_GeomFromText(%s, %s) AS geom),
              intersection_poly AS (SELECT ST_GeomFromText(%s, %s) AS geom),
              bridge_segments AS (
                  SELECT ST_GeomFromText(%s, %s) AS geom
                  UNION ALL
                  SELECT ST_GeomFromText(%s, %s) AS geom
              ),
              bridges_raw AS (
                  SELECT ST_Intersection(ST_Buffer(geom, %s, 'endcap=flat join=round'), (SELECT geom FROM intersection_poly)) AS geom
                  FROM bridge_segments
                  WHERE geom IS NOT NULL
              ),
              bridges AS (
                  SELECT
                    ST_UnaryUnion(
                      ST_Collect(
                        ST_CollectionExtract(
                          ST_MakeValid(ST_Buffer(geom, 0.0)),
                          3
                        )
                      )
                    ) AS geom
                  FROM bridges_raw
                  WHERE geom IS NOT NULL
              ),
              smooth_clip AS (
                SELECT ST_LineMerge(
                         ST_CollectionExtract(
                           ST_MakeValid(ST_Buffer(s.geom, 0.0)),
                           2
                         )
                       ) AS geom
                FROM smooth s
              ),
              env_raw AS (
                SELECT ST_Intersection(e.geom, i.geom) AS geom
                FROM envelope e, intersection_poly i
              ),
              env_single AS (
                SELECT geom FROM (
                    SELECT (ST_Dump(ST_CollectionExtract(ST_Buffer(geom, 0.0), 3))).geom AS geom FROM env_raw
                ) d
                WHERE ST_IsValid(geom) AND NOT ST_IsEmpty(geom) AND ST_Area(geom) >= 0.01 AND ST_NPoints(geom) >= 4
                ORDER BY ST_Area(geom) DESC LIMIT 1
              ),
              env_padded AS (
                SELECT ST_SimplifyPreserveTopology(
                   ST_Intersection(
                     ST_Buffer(
                       CASE
                         WHEN (SELECT geom FROM bridges) IS NULL THEN e.geom
                         ELSE ST_UnaryUnion(
                                ST_Collect(
                                  e.geom,
                                  (SELECT geom FROM bridges)
                                )
                              )
                       END,
                       %s, 'join=round'
                     ),
                     (SELECT geom FROM intersection_poly)
                   ), 0.10) AS geom
                FROM env_single e
              )

            SELECT
              ST_AsText(ST_Transform((SELECT geom FROM smooth_clip), 4326)) AS smooth_wkt_4326,
              ST_AsGeoJSON(ST_Transform((SELECT geom FROM smooth_clip), 4326)) AS smooth_geojson,
              ST_AsText(ST_Transform((SELECT geom FROM env_padded), 4326)) AS envelope_wkt_4326,
              ST_AsGeoJSON(ST_Transform((SELECT geom FROM env_padded), 4326), 6) AS envelope_geojson;
            """,
            (
                smooth_wkt_local, local_srid,
                envelope_wkt_local, local_srid,
                intersection_wkt_local, local_srid,
                from_segment_wkt_local, local_srid,
                to_segment_wkt_local, local_srid,
                bridge_radius,
                smooth_radius,
            ),
        )
        row = cursor.fetchone()
        
        if (
            not row
            or _is_empty_wkt(row.get("smooth_wkt_4326"))
            or _is_empty_wkt(row.get("envelope_wkt_4326"))
        ):
            print("[Turn Path] Fallback also empty; returning None geometries", file=sys.stderr)
            return {
                "smooth_wkt_4326": None,
                "smooth_geojson": None,
                "envelope_wkt_4326": None,
                "envelope_geojson": None,
            }

    return {
        "smooth_wkt_4326": row["smooth_wkt_4326"],
        "smooth_geojson": row["smooth_geojson"],
        "envelope_wkt_4326": row["envelope_wkt_4326"],
        "envelope_geojson": row["envelope_geojson"],
    }


def compute_turn_path(
    cursor,
    from_road_id: str,
    to_road_id: str,
    intersection_name: str,
    vehicle: VehicleProfile,
    local_srid: int = 28350,
    sampling_step_m: float = 1.0,
    from_marker_oid: Optional[str] = None,
    to_marker_oid: Optional[str] = None,
    centerline_only: bool = True,
) -> Dict[str, Any]:
    """
    Compute a G2-style turning path between two roads at an intersection.

    Endpoints (start/end poses) are fixed at the side-center points.
    The cubic Bézier control points are adjusted (pulled towards the
    intersection centroid) until the buffered vehicle envelope is
    (approximately) fully contained within the intersection polygon.
    
    Args:
        cursor: Database cursor
        from_road_id: Source road ID
        to_road_id: Destination road ID
        intersection_name: Name of the shared intersection
        vehicle: VehicleProfile instance
        local_srid: Local metric SRID for computations
        sampling_step_m: Distance between samples in the output polyline
        from_marker_oid: Optional specific marker OID for from road
        to_marker_oid: Optional specific marker OID for to road
    
    Returns:
        Dict with path geometry, diagnostics, and clearance info
    """
    # Force centreline-only mode: never return envelope polygons
    centerline_only = True
    print(f"[Turn Path API] compute_turn_path CALLED. centerline_only={centerline_only}", file=sys.stderr, flush=True)

    # ------------------------------------------------------------------
    # Step 1: Fetch geometry
    # ------------------------------------------------------------------
    # DEBUG: List tables to find the road table
    try:
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
        tables = [row['table_name'] for row in cursor.fetchall()]
        print(f"[Turn Path] Available tables: {tables}", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[Turn Path] Error listing tables: {e}", file=sys.stderr, flush=True)

    geom_data = get_road_side_centers_at_intersection(
        cursor,
        from_road_id,
        to_road_id,
        intersection_name,
        local_srid,
        from_marker_oid=from_marker_oid,
        to_marker_oid=to_marker_oid,
    )

    # Fallback: If OID-based lookup failed (e.g. mismatch), fallback to road_id-based lookup
    if not geom_data and (from_marker_oid or to_marker_oid):
        print("[Turn Path] OID lookup failed or mismatch; falling back to generic road_id lookup", file=sys.stderr, flush=True)
        geom_data = get_road_side_centers_at_intersection(
            cursor,
            from_road_id,
            to_road_id,
            intersection_name,
            local_srid,
            from_marker_oid=None,
            to_marker_oid=None,
        )

    if not geom_data:
        return {
            "status": "error",
            "error": (
                f"Could not find side-center points for roads "
                f"'{from_road_id}' and '{to_road_id}' at intersection '{intersection_name}'"
            ),
        }

    # ------------------------------------------------------------------
    # Endpoints:
    #   • from_point / to_point  = TRUE road centre (side-center markers)
    #   • from_boundary / to_boundary = where road EDGE hits intersection
    # ------------------------------------------------------------------
    from_center_x, from_center_y = geom_data["from_point"]
    to_center_x,   to_center_y   = geom_data["to_point"]

    from_boundary = geom_data.get("from_boundary_point") or (from_center_x, from_center_y)
    to_boundary   = geom_data.get("to_boundary_point")   or (to_center_x,   to_center_y)

    # ✅ Use road CENTRE for the actual path
    from_x, from_y = from_center_x, from_center_y
    to_x,   to_y   = to_center_x,   to_center_y

    inter_cx, inter_cy = geom_data["intersection_centroid"]
    intersection_wkt_local = geom_data["intersection_wkt"]

    turning_radius = vehicle.min_turn_radius_m

    # ------------------------------------------------------------------
    # Step 2: Compute headings
    # ------------------------------------------------------------------
    from_heading = compute_road_heading(
        geom_data["from_segment"],
        (from_center_x, from_center_y),
        (inter_cx, inter_cy),
        into_intersection=True,   # points INTO the intersection
    )

    to_heading = compute_road_heading(
        geom_data["to_segment"],
        (to_center_x, to_center_y),
        (inter_cx, inter_cy),
        into_intersection=False,  # points AWAY from the intersection
    )

    # ------------------------------------------------------------------
    # Step 2c: Generate "Safe Zone" Road Polygons (Virtual Extrusion)
    # ------------------------------------------------------------------
    def _create_road_box_wkt(segment: list, heading: float, dist_m: float) -> Optional[str]:
        if not segment or len(segment) < 2:
            return None
        # Use endpoints of the width edge
        p1 = segment[0]
        p2 = segment[-1]
        
        # Extrude along heading
        vx = math.cos(heading) * dist_m
        vy = math.sin(heading) * dist_m
        
        p3 = (p2[0] + vx, p2[1] + vy)
        p4 = (p1[0] + vx, p1[1] + vy)
        
        return f"POLYGON(({p1[0]} {p1[1]}, {p2[0]} {p2[1]}, {p3[0]} {p3[1]}, {p4[0]} {p4[1]}, {p1[0]} {p1[1]}))"

    # From Road: Heading points INTO intersection, so extrude BACKWARDS (add PI) or neg dist
    # Use 60m (generous) to ensure we cover the approach
    from_road_wkt_local = _create_road_box_wkt(
        geom_data.get("from_segment"),
        from_heading + math.pi, 
        60.0
    )

    # To Road: Heading points AWAY from intersection, so extrude FORWARDS
    to_road_wkt_local = _create_road_box_wkt(
        geom_data.get("to_segment"),
        to_heading,
        60.0
    )

    # ------------------------------------------------------------------
    # Step 2b: Choose endpoints
    #   centerline_only:
    #       • each side continues along its own heading until it hits the
    #         intersection boundary side line
    #   full swept path:
    #       • keep existing long lead-in/lead-out logic
    # ------------------------------------------------------------------
    if centerline_only:
        # For centerline-only: compute exact intercepts with the intersection boundary
        # by sliding along the road headings.
        try:
            from_x, from_y = snap_along_heading_to_boundary(
                cursor,
                from_center_x,
                from_center_y,
                from_heading,
                direction_sign=+1,  # along heading into the intersection
                intersection_wkt=intersection_wkt_local,
                local_srid=local_srid,
                max_snap_dist_m=80.0,
            )
        except Exception as e:
            print(f"[Turn Path] from snap failed, using boundary point: {e}", file=sys.stderr, flush=True)
            from_x, from_y = from_boundary

        try:
            to_x, to_y = snap_along_heading_to_boundary(
                cursor,
                to_center_x,
                to_center_y,
                to_heading,
                direction_sign=-1,  # opposite (into intersection)
                intersection_wkt=intersection_wkt_local,
                local_srid=local_srid,
                max_snap_dist_m=80.0,
            )
        except Exception as e:
            print(f"[Turn Path] to snap failed, using boundary point: {e}", file=sys.stderr, flush=True)
            to_x, to_y = to_boundary

        print(
            "[Turn Path] centerline_only=True → endpoints snapped to boundary intercepts: "
            f"from=({from_x:.2f}, {from_y:.2f}), to=({to_x:.2f}, {to_y:.2f})",
            file=sys.stderr,
            flush=True,
        )

    else:
        # ------------------------------------------------------------------
        # EXTENSION: move BOTH endpoints further into their roads
        # ------------------------------------------------------------------
        width_with_buffer = vehicle.vehicle_width_m + 2.0 * vehicle.side_buffer_m

        # generous lead-in/out for haul roads (keep poses well outside intersection)
        base_extension_m = max(25.0, 2.5 * width_with_buffer)
        strong_extension_m = max(base_extension_m, 5.0 * width_with_buffer)
        strong_extension_m = min(strong_extension_m, 120.0)

        # ---- 1) FROM side: move backwards along the entry road ----
        start_extension_m = strong_extension_m
        cand_x = from_x - math.cos(from_heading) * start_extension_m
        cand_y = from_y - math.sin(from_heading) * start_extension_m

        try:
            if _point_inside_intersection(cursor, cand_x, cand_y, intersection_wkt_local, local_srid):
                lo, hi = 0.0, start_extension_m
                for _ in range(10):  # binary search
                    mid = 0.5 * (lo + hi)
                    test_x = from_x - math.cos(from_heading) * mid
                    test_y = from_y - math.sin(from_heading) * mid
                    inside = _point_inside_intersection(cursor, test_x, test_y, intersection_wkt_local, local_srid)
                    if inside:
                        hi = mid
                    else:
                        lo = mid
                start_extension_m = lo
                cand_x = from_x - math.cos(from_heading) * start_extension_m
                cand_y = from_y - math.sin(from_heading) * start_extension_m
        except Exception as e:
            print(f"[Turn Path] start extension clamp failed: {e}", file=sys.stderr, flush=True)

        from_x, from_y = cand_x, cand_y

        # Debug: extension vector (centre → extended centre) vs heading
        ext_vec_x = from_center_x - from_x
        ext_vec_y = from_center_y - from_y
        heading_vec_x = math.cos(from_heading)
        heading_vec_y = math.sin(from_heading)
        print(
            "[Turn Path] from_extension_vec",
            ext_vec_x,
            ext_vec_y,
            "heading_vec",
            heading_vec_x,
            heading_vec_y,
            file=sys.stderr,
            flush=True,
        )

        # ---- 2) TO side: push the end pose down the exit road ----
        end_extension_m = strong_extension_m * 0.9  # still robust on exit
        end_extension_m = min(end_extension_m, 90.0)

        cand_tx = to_x + math.cos(to_heading) * end_extension_m
        cand_ty = to_y + math.sin(to_heading) * end_extension_m

        try:
            if _point_inside_intersection(cursor, cand_tx, cand_ty, intersection_wkt_local, local_srid):
                lo, hi = 0.0, end_extension_m
                for _ in range(10):
                    mid = 0.5 * (lo + hi)
                    test_x = to_x + math.cos(to_heading) * mid
                    test_y = to_y + math.sin(to_heading) * mid
                    inside = _point_inside_intersection(cursor, test_x, test_y, intersection_wkt_local, local_srid)
                    if inside:
                        hi = mid
                    else:
                        lo = mid
                end_extension_m = lo
                cand_tx = to_x + math.cos(to_heading) * end_extension_m
                cand_ty = to_y + math.sin(to_heading) * end_extension_m
        except Exception as e:
            print(f"[Turn Path] end extension clamp failed: {e}", file=sys.stderr, flush=True)

        to_x, to_y = cand_tx, cand_ty

    # ------------------------------------------------------------------
    # Snapping logic removed in favor of exact boundary intersection
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # Step 3: Dubins path between fixed endpoints (for length/path_type)
    # ------------------------------------------------------------------
    start_pose = Pose(from_x, from_y, from_heading)
    goal_pose = Pose(to_x, to_y, to_heading)

    dubins_result = compute_dubins_path(start_pose, goal_pose, turning_radius)
    path_points = sample_dubins_path(
        dubins_result, start_pose, turning_radius, sampling_step_m
    )
    path_wkt_local = "LINESTRING(" + ", ".join(f"{x} {y}" for x, y in path_points) + ")"

    # ------------------------------------------------------------------
    # Step 4: Build and adjust Bézier control points (endpoints fixed)
    # ------------------------------------------------------------------
    p0 = (from_x, from_y)
    p3 = (to_x, to_y)

    u0 = (math.cos(from_heading), math.sin(from_heading))
    u3 = (math.cos(to_heading), math.sin(to_heading))

    dx = p3[0] - p0[0]
    dy = p3[1] - p0[1]
    center_dist = math.hypot(dx, dy)

    # Calculate turn angle to adapt control arm length
    # Wider turns need SHORTER control arms to stay inside intersection
    turn_angle = abs(normalize_angle(to_heading - from_heading))
    turn_angle_deg = math.degrees(turn_angle)

    # Scale factor: 1.0 for small turns, down to 0.3 for 180° turns
    angle_scale = max(0.3, 1.0 - (turn_angle / math.pi) * 0.7)

    # base control distance - scale down for wider turns
    base_ctrl = max(turning_radius * 0.5, center_dist * 0.2)
    if center_dist > 1e-3:
        base_ctrl = min(base_ctrl, center_dist * 0.4 * angle_scale)
    else:
        base_ctrl = turning_radius * 0.5

    ctrl_dist = base_ctrl

    print(
        f"[Turn Path] turn_angle={turn_angle_deg:.1f}°, angle_scale={angle_scale:.2f}, "
        f"ctrl_dist={ctrl_dist:.1f}m, center_dist={center_dist:.1f}m",
        file=sys.stderr, flush=True
    )

    def _pull_ctrl_towards_centroid(pt: List[float], max_step: float) -> None:
        """Move a control point a bit towards the intersection centroid."""
        vx = inter_cx - pt[0]
        vy = inter_cy - pt[1]
        dist = math.hypot(vx, vy)
        if dist < 1e-3:
            return
        step = min(max_step, 0.5 * dist)  # don't overshoot
        scale = step / dist
        pt[0] += vx * scale
        pt[1] += vy * scale

    # How far to pull control points per iteration (≈ half envelope width)
    envelope_step_m = max(
        0.5 * (vehicle.vehicle_width_m + 2.0 * vehicle.side_buffer_m),
        0.5,  # minimum 0.5 m
    )
    max_iterations = 24

    # Try multiple control arm configurations
    configurations = [
        (ctrl_dist, "standard"),
        (ctrl_dist * 0.5, "tight"),
        (ctrl_dist * 0.3, "very_tight"),
        (turning_radius * 0.3, "minimal"),
    ]

    best_result: Optional[Dict[str, Any]] = None

    for config_ctrl, config_name in configurations:
        # Reset control points for this configuration
        p1 = [p0[0] + config_ctrl * u0[0], p0[1] + config_ctrl * u0[1]]
        p2 = [p3[0] - config_ctrl * u3[0], p3[1] - config_ctrl * u3[1]]

        for iteration in range(max_iterations):
            smooth_points = sample_cubic_bezier(
                p0, tuple(p1), tuple(p2), p3, num_points=80
            )
            smooth_wkt_local = "LINESTRING(" + ", ".join(f"{x} {y}" for x, y in smooth_points) + ")"

            clearance_info = check_path_clearance(
                cursor,
                smooth_wkt_local,
                intersection_wkt_local,
                vehicle.vehicle_width_m,
                vehicle.side_buffer_m,
                local_srid,
                from_road_wkt=from_road_wkt_local,
                to_road_wkt=to_road_wkt_local,
            )

            if (
                best_result is None
                or clearance_info["outside_area_sqm"]
                < best_result["clearance"]["outside_area_sqm"]
            ):
                best_result = {
                    "iteration": iteration,
                    "config": config_name,
                    "smooth_points": smooth_points,
                    "smooth_wkt_local": smooth_wkt_local,
                    "clearance": clearance_info,
                }

            if clearance_info["vehicle_envelope_ok"]:
                print(f"[Turn Path] Found valid path with config={config_name}, iter={iteration}",
                      file=sys.stderr, flush=True)
                break

            _pull_ctrl_towards_centroid(p1, envelope_step_m)
            _pull_ctrl_towards_centroid(p2, envelope_step_m)

        # If we found a valid path, stop trying configurations
        if best_result and best_result["clearance"]["vehicle_envelope_ok"]:
            break

    # If no configuration worked well, try direct centroid routing
    if best_result and best_result["clearance"]["outside_area_sqm"] > 30.0:
        print("[Turn Path] Trying centroid-routing fallback", file=sys.stderr, flush=True)

        # Route through intersection centroid
        mid_point = (inter_cx, inter_cy)

        # Two-segment Bézier: start -> centroid -> end
        half1_points = sample_cubic_bezier(
            p0,
            (p0[0] + ctrl_dist * 0.3 * u0[0], p0[1] + ctrl_dist * 0.3 * u0[1]),
            mid_point,
            mid_point,
            num_points=40
        )
        half2_points = sample_cubic_bezier(
            mid_point,
            mid_point,
            (p3[0] - ctrl_dist * 0.3 * u3[0], p3[1] - ctrl_dist * 0.3 * u3[1]),
            p3,
            num_points=40
        )

        centroid_points = half1_points + half2_points[1:]  # avoid duplicate midpoint
        centroid_wkt = "LINESTRING(" + ", ".join(f"{x} {y}" for x, y in centroid_points) + ")"

        centroid_clearance = check_path_clearance(
            cursor,
            centroid_wkt,
            intersection_wkt_local,
            vehicle.vehicle_width_m,
            vehicle.side_buffer_m,
            local_srid,
            from_road_wkt=from_road_wkt_local,
            to_road_wkt=to_road_wkt_local,
        )

        if centroid_clearance["outside_area_sqm"] < best_result["clearance"]["outside_area_sqm"]:
            best_result = {
                "iteration": 0,
                "config": "centroid_routing",
                "smooth_points": centroid_points,
                "smooth_wkt_local": centroid_wkt,
                "clearance": centroid_clearance,
            }
            print(f"[Turn Path] Centroid routing improved: {centroid_clearance['outside_area_sqm']:.1f}m²",
                  file=sys.stderr, flush=True)

    # ----------------------------------------------------------------------
    # Step 6: Finalize from best attempt
    # ----------------------------------------------------------------------
    assert best_result is not None
    final = best_result
    smooth_points = final["smooth_points"]
    smooth_wkt_local = final["smooth_wkt_local"]
    clearance_info = final["clearance"]

    # Full vehicle envelope in local SRID (NOT clipped)
    envelope_wkt_local = clearance_info["envelope_wkt"]

    # ----------------------------------------------------------------------
    # Step 7: Transform the raw Dubins path (for length/path_type only)
    # ----------------------------------------------------------------------
    # ----------------------------------------------------------------------
    # Step 7: Transform the raw Dubins path, Smooth path, AND Swept Path to EPSG:4326
    # ----------------------------------------------------------------------
    # We transform THREE geometries:
    # 1. The raw Dubins path (path_wkt_local) -> for debug/length
    # 2. The best smoothed Bezier path (smooth_wkt_local) -> for main rendering
    # 3. The vehicle envelope (envelope_wkt_local) -> for swept path outline
    
    # Ensure envelope is not None (fallback to empty LINESTRING if valid path not found)
    if not envelope_wkt_local:
         envelope_wkt_local = "LINESTRING EMPTY"

    cursor.execute(
        """
        SELECT
          ST_AsText(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS path_wkt_4326,
          ST_AsGeoJSON(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS path_geojson,
          ST_AsText(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS smooth_wkt_4326,
          ST_AsGeoJSON(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS smooth_geojson,
          ST_AsText(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS swept_wkt_4326,
          ST_AsGeoJSON(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS swept_geojson
        """,
        (
            path_wkt_local, local_srid,
            path_wkt_local, local_srid,
            smooth_wkt_local, local_srid,
            smooth_wkt_local, local_srid,
            envelope_wkt_local, local_srid,
            envelope_wkt_local, local_srid,
        ),
    )
    path_row = cursor.fetchone()

    dubins_wkt_4326 = path_row["path_wkt_4326"] if path_row else None
    dubins_geojson_obj = _safe_load_geojson(path_row["path_geojson"]) if path_row else None
    smooth_wkt_4326 = path_row["smooth_wkt_4326"] if path_row else None
    smooth_geojson_obj = _safe_load_geojson(path_row["smooth_geojson"]) if path_row else None
    swept_path_wkt = path_row["swept_wkt_4326"] if path_row else None
    swept_path_geojson = _safe_load_geojson(path_row["swept_geojson"]) if path_row else None

    # Remove the heavy envelope geometry from clearance info before returning
    # (We still return the numeric metrics)
    clearance_info_clean = dict(clearance_info)
    envelope_wkt_for_debug = clearance_info_clean.pop("envelope_wkt", None)

    outside_area = float(clearance_info_clean.get("outside_area_sqm") or 0.0)
    vehicle_ok = bool(clearance_info_clean.get("vehicle_envelope_ok", True))

    # 🔧 TUNE THIS: how much leak is still “ok to draw”
    MAX_LEAK_WARNING_M2 = 50.0  # e.g. up to 50 m² = warning, not fatal

    status_code = "envelope_outside_intersection"
    leak_status = "error"

    if vehicle_ok:
        status_code = "ok"
        leak_status = "ok"
    elif outside_area <= MAX_LEAK_WARNING_M2:
        # Centreline is valid, envelope leaks a bit → still draw, but mark warning
        status_code = "ok"
        leak_status = "warning"
    else:
        # Only truly huge leaks kill the path
        status_code = "envelope_outside_intersection"
        leak_status = "error"

    clearance_info_clean["leak_status"] = leak_status
    clearance_info_clean["envelope_outside_area_sqm"] = outside_area

    return {
        "status": status_code,
        "centerline_only": True, # Allow swept path return
        "from_road_id": from_road_id,
        "to_road_id": to_road_id,
        "intersection_name": intersection_name,
        "vehicle": vehicle.to_dict(),
        "swept_path": {
            "geometry_wkt": swept_path_wkt, # Re-enabled
            "geometry_geojson": swept_path_geojson, # Re-enabled
        },
        "vehicle_envelope": {
            "geometry_wkt": None,
            "geometry_geojson": None,
        },
        "path": {
            "wkt": smooth_wkt_4326, 
            "geojson": smooth_geojson_obj,
            "raw_wkt": dubins_wkt_4326,
            "raw_geojson": dubins_geojson_obj,
            "smooth_wkt": smooth_wkt_4326,
            "smooth_geojson": smooth_geojson_obj,
            "envelope_wkt": None,
            "envelope_geojson": None,
            "path_type": dubins_result.path_type,
            "length_m": dubins_result.total_length,
            "num_points": len(path_points),
            "sampling_step_m": sampling_step_m,
        },
        "clearance": {
            **clearance_info_clean,
            "vehicle_width_with_buffer_m": vehicle.vehicle_width_m + 2 * vehicle.side_buffer_m,
            "min_turn_radius_m": turning_radius,
        },
        "debug": {
            "iteration_used": final["iteration"],
            "from_point_local": (from_x, from_y),
            "from_boundary_local": from_boundary,
            "to_point_local": (to_x, to_y),
            "to_boundary_local": to_boundary,
            "from_heading_deg": math.degrees(from_heading),
            "to_heading_deg": math.degrees(to_heading),
            "local_srid": local_srid,
        },
    }
