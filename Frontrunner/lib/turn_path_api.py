#!/usr/bin/env python3
"""
API logic for computing G2-style turning paths between roads at intersections.

This module handles:
1. Fetching side-center points and intersection geometry from the database
2. Computing approach headings for each road
3. Generating Dubins paths with curvature constraints
4. Validating that the vehicle envelope stays within the intersection
5. Converting results to WKT/GeoJSON format
"""

import math
import json
from typing import Dict, Any, Tuple, Optional, List
import psycopg2
from psycopg2.extras import RealDictCursor

from lib.vehicle_profiles import VehicleProfile, get_vehicle_profile
from lib.dubins_path import Pose, compute_dubins_path, sample_dubins_path
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
            ST_X(f.geom) AS from_x,
            ST_Y(f.geom) AS from_y,
            ST_AsText(f.segment_geom) AS from_segment_wkt,
            ST_X(t.geom) AS to_x,
            ST_Y(t.geom) AS to_y,
            ST_AsText(t.segment_geom) AS to_segment_wkt,
            ST_AsText(i.geom) AS intersection_wkt,
            ST_X(ST_Centroid(i.geom)) AS intersection_cx,
            ST_Y(ST_Centroid(i.geom)) AS intersection_cy
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
        ST_Y(ST_Centroid(i.geom)) AS intersection_cy
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
    
    # Parse WKT segments into coordinate lists
    def parse_linestring_wkt(wkt: Optional[str]) -> List[Tuple[float, float]]:
        # "LINESTRING(x1 y1, x2 y2, ...)" -> [(x1, y1), (x2, y2), ...]
        if wkt is None:
            return []
        coords_str = wkt.replace("LINESTRING(", "").replace(")", "")
        return [tuple(map(float, pt.strip().split())) for pt in coords_str.split(",")]
    
    return {
        "from_point": (row["from_x"], row["from_y"]),
        "from_segment": parse_linestring_wkt(row.get("from_segment_wkt")),
        "to_point": (row["to_x"], row["to_y"]),
        "to_segment": parse_linestring_wkt(row.get("to_segment_wkt")),
        "intersection_wkt": row["intersection_wkt"],
        "intersection_centroid": (row["intersection_cx"], row["intersection_cy"])
    }


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

    min_idx = 0
    min_dist = float("inf")
    for i, (x, y) in enumerate(segment_coords):
        d = math.hypot(x - cx, y - cy)
        if d < min_dist:
            min_dist = d
            min_idx = i

    n = len(segment_coords)
    if min_idx == 0:
        nbr_idx = 1
    elif min_idx == n - 1:
        nbr_idx = n - 2
    else:
        px, py = segment_coords[min_idx - 1]
        nx_, ny_ = segment_coords[min_idx + 1]
        d_prev = math.hypot(px - cx, py - cy)
        d_next = math.hypot(nx_ - cx, ny_ - cy)
        nbr_idx = min_idx - 1 if d_prev < d_next else min_idx + 1

    x1, y1 = segment_coords[min_idx]
    x2, y2 = segment_coords[nbr_idx]

    ex, ey = x2 - x1, y2 - y1
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
    local_srid: int
) -> Dict[str, Any]:
    """
    Check if the vehicle envelope (path + lateral buffer) stays within the intersection.

    Args:
        path_wkt: LINESTRING in local_srid
        intersection_wkt: POLYGON in local_srid
        vehicle_width_m: Vehicle width in meters
        side_buffer_m: Additional safety buffer in meters
        local_srid: SRID for geometric operations
    
    Returns dict with:
        - vehicle_envelope_ok: bool       (relaxed check)
        - strict_inside: bool            (true only if outside_area < 0.1 m²)
        - outside_area_sqm: float        (area of envelope outside intersection)
        - min_clearance_m: float | None
        - envelope_wkt: WKT of the buffered path
    """
    buffer_radius = (vehicle_width_m / 2.0) + side_buffer_m

    query = """
    WITH path AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
    ),
    intersection AS (
        SELECT ST_GeomFromText(%s, %s) AS geom
    ),
    envelope AS (
        SELECT ST_Buffer(path.geom, %s) AS geom
        FROM path
    ),
    outside AS (
        SELECT
            ST_Difference(envelope.geom, intersection.geom) AS geom
        FROM envelope, intersection
    )
    SELECT
        ST_AsText(envelope.geom) AS envelope_wkt,
        COALESCE(ST_Area(outside.geom), 0.0) AS outside_area_sqm,
        CASE
            WHEN ST_Area(outside.geom) > 0.1 THEN ST_Distance(
                (SELECT ST_Boundary(geom) FROM intersection),
                (SELECT geom FROM path)
            )
            ELSE ST_Distance(
                (SELECT ST_Boundary(geom) FROM intersection),
                (SELECT geom FROM envelope)
            )
        END AS clearance_m
    FROM envelope, outside;
    """

    cursor.execute(query, (
        path_wkt, local_srid,
        intersection_wkt, local_srid,
        buffer_radius
    ))
    row = cursor.fetchone()

    outside_area = float(row["outside_area_sqm"])

    # Strict: virtually zero leak (only numerical noise allowed)
    strict_inside = outside_area < 0.1

    # Relaxed tolerance: allow up to ~1.2 vehicle footprints worth of leak,
    # but never less than 25 m². This accounts for minor polygon / digitizing
    # mismatches at the edges of the intersection.
    leak_tolerance_area = max(25.0, (vehicle_width_m ** 2) * 1.2)

    vehicle_envelope_ok = strict_inside or outside_area <= leak_tolerance_area

    return {
        "vehicle_envelope_ok": vehicle_envelope_ok,             # relaxed
        "strict_inside": strict_inside,                         # strict
        "outside_area_sqm": outside_area,
        "min_clearance_m": float(row["clearance_m"])
            if row["clearance_m"] is not None else None,
        "envelope_wkt": row["envelope_wkt"],
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
    # ------------------------------------------------------------------
    # Step 1: Fetch geometry
    # ------------------------------------------------------------------
    geom_data = get_road_side_centers_at_intersection(
        cursor,
        from_road_id,
        to_road_id,
        intersection_name,
        local_srid,
        from_marker_oid=from_marker_oid,
        to_marker_oid=to_marker_oid,
    )

    if not geom_data:
        return {
            "status": "error",
            "error": (
                f"Could not find side-center points for roads "
                f"'{from_road_id}' and '{to_road_id}' at intersection '{intersection_name}'"
            ),
        }

    # Fixed endpoints: always exactly at the side-center points
    from_x, from_y = geom_data["from_point"]
    to_x, to_y = geom_data["to_point"]
    inter_cx, inter_cy = geom_data["intersection_centroid"]
    intersection_wkt_local = geom_data["intersection_wkt"]

    turning_radius = vehicle.min_turn_radius_m

    # ------------------------------------------------------------------
    # Step 2: Compute headings at endpoints (once)
    # ------------------------------------------------------------------
    from_heading = compute_road_heading(
        geom_data["from_segment"],
        (from_x, from_y),
        (inter_cx, inter_cy),
        into_intersection=True,
    )

    to_heading = compute_road_heading(
        geom_data["to_segment"],
        (to_x, to_y),
        (inter_cx, inter_cy),
        into_intersection=False,  # exit heading points away from intersection
    )

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

    # base control distance similar to build_smooth_turn_curve
    ctrl_dist = max(turning_radius * 0.8, center_dist * 0.25)
    if center_dist > 1e-3:
        ctrl_dist = min(ctrl_dist, center_dist * 0.5)
    else:
        ctrl_dist = turning_radius

    # mutable control points
    p1 = [p0[0] + ctrl_dist * u0[0], p0[1] + ctrl_dist * u0[1]]
    p2 = [p3[0] - ctrl_dist * u3[0], p3[1] - ctrl_dist * u3[1]]

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
    max_iterations = 8

    best_result: Optional[Dict[str, Any]] = None

    for iteration in range(max_iterations):
        # G2 smooth curve (endpoints fixed, control points possibly adjusted)
        smooth_points = sample_cubic_bezier(
            p0, tuple(p1), tuple(p2), p3, num_points=80
        )
        smooth_wkt_local = "LINESTRING(" + ", ".join(f"{x} {y}" for x, y in smooth_points) + ")"

        # ------------------------------------------------------------------
        # Step 5: Check clearance on the smooth curve
        # ------------------------------------------------------------------
        clearance_info = check_path_clearance(
            cursor,
            smooth_wkt_local,          # IMPORTANT: smooth path, not raw Dubins path
            intersection_wkt_local,
            vehicle.vehicle_width_m,
            vehicle.side_buffer_m,
            local_srid,
        )

        # Track the best attempt (min outside area), even if none perfect
        if (
            best_result is None
            or clearance_info["outside_area_sqm"]
            < best_result["clearance"]["outside_area_sqm"]
        ):
            best_result = {
                "iteration": iteration,
                "smooth_points": smooth_points,
                "smooth_wkt_local": smooth_wkt_local,
                "clearance": clearance_info,
            }

        # If envelope is fully inside intersection, we're done
        if clearance_info["vehicle_envelope_ok"]:
            break

        # Otherwise, pull the control points further inside and try again
        _pull_ctrl_towards_centroid(p1, envelope_step_m)
        _pull_ctrl_towards_centroid(p2, envelope_step_m)

    # ----------------------------------------------------------------------
    # Step 6: Finalize from best attempt
    # ----------------------------------------------------------------------
    assert best_result is not None
    final = best_result
    smooth_points = final["smooth_points"]
    smooth_wkt_local = final["smooth_wkt_local"]
    clearance_info = final["clearance"]

    # Transform chosen geometries back to WGS84 for output
    cursor.execute(
        """
        SELECT 
            ST_AsText(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS path_wkt_4326,
            ST_AsGeoJSON(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS path_geojson,
            ST_AsText(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS smooth_wkt_4326,
            ST_AsGeoJSON(ST_Transform(ST_GeomFromText(%s, %s), 4326)) AS smooth_geojson
        """,
        (
            path_wkt_local,
            local_srid,
            path_wkt_local,
            local_srid,
            smooth_wkt_local,
            local_srid,
            smooth_wkt_local,
            local_srid,
        ),
    )
    output_row = cursor.fetchone()

    status = (
        "ok" if clearance_info["vehicle_envelope_ok"]
        else "envelope_outside_intersection"
    )

    return {
        "status": status,
        "from_road_id": from_road_id,
        "to_road_id": to_road_id,
        "intersection_name": intersection_name,
        "vehicle": vehicle.to_dict(),
        "path": {
            "wkt": output_row["path_wkt_4326"],
            "geojson": json.loads(output_row["path_geojson"]),
            "smooth_wkt": output_row["smooth_wkt_4326"],
            "smooth_geojson": json.loads(output_row["smooth_geojson"]),
            "path_type": dubins_result.path_type,
            "length_m": dubins_result.total_length,
            "num_points": len(path_points),
            "sampling_step_m": sampling_step_m,
        },
        "clearance": {
            **clearance_info,
            "vehicle_width_with_buffer_m": (
                vehicle.vehicle_width_m + 2 * vehicle.side_buffer_m
            ),
            "min_turn_radius_m": turning_radius,
        },
        "debug": {
            "iteration_used": final["iteration"],
            "from_point_local": (from_x, from_y),
            "to_point_local": (to_x, to_y),
            "from_heading_deg": math.degrees(from_heading),
            "to_heading_deg": math.degrees(to_heading),
            "local_srid": local_srid,
        },
    }


