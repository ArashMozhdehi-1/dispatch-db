#!/usr/bin/env python3
from __future__ import annotations

import json
import logging
import math
import os
import sys
import uuid
from dataclasses import dataclass
from functools import cmp_to_key
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import psycopg2
from psycopg2.extras import execute_values

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("road_corner_etl")

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("MAP_DUMP_DB_NAME", os.getenv("POSTGRES_DB", "mf_geoserver_db"))
POSTGRES_USER = os.getenv("POSTGRES_USER", "infra_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "infra_password")

# Corner angle tolerance: progressive thresholds to ensure we always get 4 corners
# Start strict (3°), then relax if needed (5°, 10°, 15°)
ANGLE_THRESHOLDS = [3.0, 5.0, 10.0, 15.0]  # Progressive relaxation
# Maximum distance from intersection/location to consider a corner (meters)
MAX_PROXIMITY_FOR_CORNER_M = 5.0  # Only consider corners within 100m of intersections/locations
CORNER_MARKERS_PER_ROAD = 4
SIDE_MARKERS_PER_ROAD = 2

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Meters between two WGS84 points."""
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def calculate_interior_angle(
    prev_pt: Sequence[float],
    curr_pt: Sequence[float],
    next_pt: Sequence[float],
) -> Optional[float]:
    """
    Interior angle (degrees) at curr_pt using ONLY prev / curr / next.

    No simplification. No segment-length filtering.
    Returns angle in [0, 360), where ~90° is convex, ~270° is concave.
    """
    ax, ay = prev_pt[0] - curr_pt[0], prev_pt[1] - curr_pt[1]
    bx, by = next_pt[0] - curr_pt[0], next_pt[1] - curr_pt[1]

    len_a = math.hypot(ax, ay)
    len_b = math.hypot(bx, by)
    if len_a == 0 or len_b == 0:
        return None

    # Plain angle between vectors
    dot = ax * bx + ay * by
    cos_theta = max(-1.0, min(1.0, dot / (len_a * len_b)))
    angle = math.degrees(math.acos(cos_theta))

    # Cross product sign: convex (~90°) vs concave (~270°)
    cross = ax * by - ay * bx
    if cross < 0:
        angle = 360.0 - angle

    return angle


# Removed: build_axis_frame, project_coord_to_axis, synthesize_end_corners, band_centroid, project_point_to_segment
# These functions added unnecessary complexity to corner selection


def normalize_name(raw_name: str, suffix: str) -> str:
    """map_location.name is VARCHAR(32); truncate while keeping suffix."""
    suffix = suffix.strip()
    base = raw_name.strip()
    full = f"{base} {suffix}".strip()
    if len(full) <= 32:
        return full
    remaining = 32 - len(suffix) - 1
    trimmed = base[: max(0, remaining)].rstrip()
    return f"{trimmed} {suffix}".strip()


def corner_key(corner: Dict[str, Any]) -> Tuple[float, float]:
    return (round(corner["lon"], 8), round(corner["lat"], 8))


def parse_outer_ring(geojson_str: str) -> List[List[float]]:
    """Return the first polygon ring as [lon, lat] pairs."""
    try:
        geom = json.loads(geojson_str)
    except json.JSONDecodeError:
        return []

    coordinates = []
    gtype = geom.get("type")
    if gtype == "Polygon":
        coordinates = geom.get("coordinates") or []
    elif gtype == "MultiPolygon":
        multi = geom.get("coordinates") or []
        coordinates = multi[0] if multi else []

    ring = coordinates[0] if coordinates else []
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return ring


def corner_priority_key(corner: Dict[str, Any]) -> Tuple[float, int]:
    """Sort by angle accuracy first (closer to 90° or 270°), then by ring position."""
    angle_diff = corner.get("angle_diff_90_270", float("inf"))
    ring_index = corner.get("ring_index", 0)
    return (angle_diff, ring_index)


def cmp_corners(a: Dict[str, Any], b: Dict[str, Any]) -> int:
    """Comparator that prioritizes near-right angles and nearby intersections."""
    ak = corner_priority_key(a)
    bk = corner_priority_key(b)
    if ak == bk:
        return 0
    return -1 if ak < bk else 1


def cmp_corner_pairs(a: Dict[str, Any], b: Dict[str, Any]) -> int:
    """Sort by combined proximity, prefer shared neighbors, then short segments."""
    if math.isclose(a["proximity_sum"], b["proximity_sum"]):
        if a["shared_entity"] != b["shared_entity"]:
            return -1 if a["shared_entity"] else 1
        if math.isclose(a["segment_length"], b["segment_length"]):
            return 0
        return -1 if a["segment_length"] < b["segment_length"] else 1
    return -1 if a["proximity_sum"] < b["proximity_sum"] else 1


def guid() -> str:
    return uuid.uuid4().hex[:32]


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Neighbor:
    name: str
    type: str
    lat: float
    lon: float


@dataclass
class Road:
    road_id: str
    from_location: str
    to_location: str
    geometry_geojson: str
    length_m: Optional[float]

    @property
    def display_name(self) -> str:
        if self.from_location and self.to_location:
            return f"{self.from_location} -> {self.to_location}"
        return self.from_location or self.to_location or self.road_id


# ---------------------------------------------------------------------------
# Database fetchers
# ---------------------------------------------------------------------------


def fetch_neighbors(cursor) -> List[Neighbor]:
    cursor.execute(
        """
        SELECT
            name,
            type,
            ST_Y(ST_Centroid(geometry_wkt)) AS lat,
            ST_X(ST_Centroid(geometry_wkt)) AS lon
        FROM map_location
        WHERE type NOT IN ('road_corner_marker', 'road_corner_side_center')
          AND geometry_wkt IS NOT NULL;
        """
    )
    rows = cursor.fetchall()
    neighbors = []
    for row in rows:
        name, type_, lat, lon = row
        if lat is None or lon is None:
            continue
        neighbors.append(Neighbor(name=name or "unknown", type=type_ or "unknown", lat=lat, lon=lon))
    logger.info("Loaded %s neighbor entities for proximity checks", len(neighbors))
    return neighbors


def fetch_roads(cursor) -> List[Road]:
    cursor.execute(
        """
        SELECT
            _oid_ AS road_id,
            from_location_name,
            to_location_name,
            ST_AsGeoJSON(geometry_wkt) AS geometry_geojson,
            length_m
        FROM map_road
        WHERE geometry_wkt IS NOT NULL;
        """
    )
    rows = cursor.fetchall()
    roads: List[Road] = []
    for row in rows:
        roads.append(Road(*row))
    logger.info("Loaded %s polygon roads from map_road", len(roads))
    return roads


# ---------------------------------------------------------------------------
# Corner selection
# ---------------------------------------------------------------------------


def find_nearest_neighbor(lat: float, lon: float, neighbors: Sequence[Neighbor]) -> Tuple[Optional[Neighbor], float]:
    best_neighbor: Optional[Neighbor] = None
    best_dist = float("inf")
    for neighbor in neighbors:
        dist = haversine_distance(lat, lon, neighbor.lat, neighbor.lon)
        if dist < best_dist:
            best_neighbor = neighbor
            best_dist = dist
    return best_neighbor, best_dist






def build_corner_candidates(ring: List[List[float]]) -> List[Dict[str, Any]]:
    """
    Find polygon corners and calculate how close they are to 90° or 270°.

    NO simplification, NO RDP:
    - Work directly on the outer ring from parse_outer_ring
    - For each vertex i, use:
        prev = ring[i - 1]
        curr = ring[i]
        next = ring[(i + 1) % n]
      i.e., the vertex and its two closest neighbours along the ring.
    """
    corners: List[Dict[str, Any]] = []
    if len(ring) < 3:
        return corners

    # Work on a copy so we never mutate the original
    working_ring = list(ring)

    # If ring is explicitly closed, drop duplicate last point
    if len(working_ring) > 1 and working_ring[0] == working_ring[-1]:
        working_ring = working_ring[:-1]

    n = len(working_ring)
    if n < 3:
        return corners

    for idx, curr in enumerate(working_ring):
        prev = working_ring[idx - 1]          # neighbour before
        nxt = working_ring[(idx + 1) % n]     # neighbour after

        angle = calculate_interior_angle(prev, curr, nxt)
        if angle is None:
            continue

        # Distance to 90° / 270°
        diff_90 = abs(angle - 90.0)
        diff_270 = abs(angle - 270.0)
        angle_diff_90_270 = min(diff_90, diff_270)

        corners.append(
            {
                "lon": curr[0],
                "lat": curr[1],
                "angle": angle,
                "angle_diff_90_270": angle_diff_90_270,
                "ring_index": idx,
            }
        )

    return corners


def select_corners(candidates: List[Dict[str, Any]], neighbors: List[Neighbor], road_name: str = "unknown") -> List[Dict[str, Any]]:
    """Select the 4 corners closest to intersections/locations. Uses progressive angle thresholds to ensure 4 corners."""
    if not candidates:
        logger.debug("Road %s: No corner candidates found", road_name)
        return []
    
    # Calculate proximity to nearest intersection/location for each corner
    for corner in candidates:
        nearest, dist = find_nearest_neighbor(corner["lat"], corner["lon"], neighbors)
        corner["proximity_m"] = dist
        corner["nearest_entity"] = nearest.name if nearest else None
        corner["nearest_entity_type"] = nearest.type if nearest else None
    
    # Log ALL candidate angles for EVERY road - user wants to see every single corner angle
    all_candidate_info = []
    for c in candidates:
        all_candidate_info.append({
            "angle": c.get("angle", 0),
            "angle_diff_90_270": c.get("angle_diff_90_270", float("inf")),
            "ring_index": c.get("ring_index"),
            "proximity_m": c.get("proximity_m", float("inf")),
            "nearest_entity": c.get("nearest_entity")
        })
    all_candidate_info.sort(key=lambda x: x["angle_diff_90_270"])
    logger.info(
        "Road %s: ALL %s candidate corners (sorted by angle_diff): %s",
        road_name,
        len(candidates),
        [(f"angle={a['angle']:.2f}°", f"diff={a['angle_diff_90_270']:.2f}°", f"idx={a['ring_index']}", f"prox={a['proximity_m']:.1f}m", f"near={a['nearest_entity']}") for a in all_candidate_info]
    )
    
    # FIRST: Filter to only corners near intersections/locations (within MAX_PROXIMITY_FOR_CORNER_M)
    # This ensures we only consider corners that are actually near intersections/locations
    near_corners = [c for c in candidates if c.get("proximity_m", float("inf")) <= MAX_PROXIMITY_FOR_CORNER_M]
    far_corners = [c for c in candidates if c.get("proximity_m", float("inf")) > MAX_PROXIMITY_FOR_CORNER_M]
    
    if far_corners:
        logger.info(
            "Road %s: Filtered out %s corners that are > %.0fm from intersections/locations. Remaining: %s near corners.",
            road_name,
            len(far_corners),
            MAX_PROXIMITY_FOR_CORNER_M,
            len(near_corners)
        )
    
    # If we don't have enough near corners, log a warning but still try with all candidates
    if len(near_corners) < CORNER_MARKERS_PER_ROAD:
        logger.warning(
            "Road %s: Only %s corners within %.0fm of intersections/locations (need %s). Will use all candidates.",
            road_name,
            len(near_corners),
            MAX_PROXIMITY_FOR_CORNER_M,
            CORNER_MARKERS_PER_ROAD
        )
        # Use all candidates if we don't have enough near ones
        candidates_to_use = candidates
    else:
        # Use only near corners
        candidates_to_use = near_corners
    
    # Sort candidates_to_use (the filtered list) by ANGLE QUALITY FIRST (closest to 90°/270° wins), then proximity
    # This ensures we select geometrically significant corners (actual corners, not straight edges)
    # Proximity is used as a tiebreaker when multiple corners have similar angles
    sorted_candidates = sorted(candidates_to_use, key=lambda c: (c.get("angle_diff_90_270", float("inf")), c.get("proximity_m", float("inf"))))
    
    # Progressive threshold approach: try each threshold until we have 4 corners
    selected: List[Dict[str, Any]] = []
    seen_keys: set[Tuple[float, float]] = set()
    used_threshold = None
    
    for threshold in ANGLE_THRESHOLDS:
        valid_corners = []
        rejected_corners = []
        
        for corner in sorted_candidates:
            angle_diff = corner.get("angle_diff_90_270", float("inf"))
            if angle_diff <= threshold:
                valid_corners.append(corner)
            else:
                rejected_corners.append({
                    "angle": corner.get("angle", 0),
                    "angle_diff_90_270": angle_diff,
                    "ring_index": corner.get("ring_index")
                })
        
        logger.info(
            "Road %s: Threshold %.1f°: %s valid corners, %s rejected. Valid: %s",
            road_name,
            threshold,
            len(valid_corners),
            len(rejected_corners),
            [(f"angle={c.get('angle'):.2f}°", f"diff={c.get('angle_diff_90_270'):.2f}°", f"idx={c.get('ring_index')}", f"prox={c.get('proximity_m'):.1f}m") for c in valid_corners[:10]]
        )
        
        # Select up to 4 corners from valid_corners (already sorted by quality)
        selected = []
        seen_keys = set()
        duplicate_count = 0
        
        for corner in valid_corners:
            key = corner_key(corner)
            if key not in seen_keys:
                seen_keys.add(key)
                selected.append(corner)
                if len(selected) >= CORNER_MARKERS_PER_ROAD:
                    break
            else:
                duplicate_count += 1
        
        # If we found 4 corners with this threshold, use it
        if len(selected) >= CORNER_MARKERS_PER_ROAD:
            used_threshold = threshold
            logger.info(
                "Road %s: Found %s corners with threshold %.1f° (duplicates filtered: %s)",
                road_name,
                len(selected),
                threshold,
                duplicate_count
            )
            logger.info(
                "Road %s: SELECTED corners: %s",
                road_name,
                [(f"angle={c.get('angle'):.2f}°", f"diff={c.get('angle_diff_90_270'):.2f}°", f"prox={c.get('proximity_m'):.1f}m", f"near={c.get('nearest_entity')}") for c in selected]
            )
            break
    
    # If we still don't have 4 corners, try to get the best 4 regardless of threshold
    if len(selected) < CORNER_MARKERS_PER_ROAD:
        logger.warning(
            "Road %s: Only found %s corners even with relaxed thresholds (max %.1f°). Selecting best %s from all candidates.",
            road_name,
            len(selected),
            max(ANGLE_THRESHOLDS),
            CORNER_MARKERS_PER_ROAD
        )
        # Take the best 4 from all candidates (already sorted by quality)
        selected = []
        seen_keys = set()
        for corner in sorted_candidates:
            key = corner_key(corner)
            if key not in seen_keys:
                seen_keys.add(key)
                selected.append(corner)
                if len(selected) >= CORNER_MARKERS_PER_ROAD:
                    break
        used_threshold = "all"
    
    # Final check: if we still don't have 4, return what we have (but log warning)
    if len(selected) < CORNER_MARKERS_PER_ROAD:
        logger.warning(
            "Road %s: CRITICAL - Only found %s unique corners (need %s). Total candidates: %s. Selected angles: %s",
            road_name,
            len(selected),
            CORNER_MARKERS_PER_ROAD,
            len(candidates),
            [f"{c.get('angle'):.2f}°" for c in selected]
        )
        # Still return what we have - better than nothing
        if len(selected) == 0:
            return []
    
    # Log the selected corners with full details
    logger.info(
        "Road %s: Successfully selected %s corners (threshold: %s): %s",
        road_name,
        len(selected),
        used_threshold,
        [(f"#%s: angle=%.2f°, diff=%.2f°, idx=%s, prox=%.1fm, entity=%s" % (
            i+1, c.get("angle", 0), c.get("angle_diff_90_270", float("inf")), 
            c.get("ring_index"), c.get("proximity_m", float("inf")), c.get("nearest_entity")
        )) for i, c in enumerate(selected)]
    )
    
    return selected


def build_corner_pairs_with_spatial_overlap(
    selected: List[Dict[str, Any]],
    cursor,
    road_id: str,
) -> List[Dict[str, Any]]:
    """
    Build side-center pairs so that the center on each side is always
    the geometric midpoint of that side polyline. We still use overlap
    information only to decide which opposite pair is the "width" pair.
    """
    if len(selected) < 4:
        return []

    ordered = sorted(selected, key=lambda c: c["ring_index"])
    edges: List[Dict[str, Any]] = []

    for idx in range(len(ordered)):
        corner_a = ordered[idx]
        corner_b = ordered[(idx + 1) % len(ordered)]
        ring_idx_a = corner_a["ring_index"]
        ring_idx_b = corner_b["ring_index"]

        cursor.execute(
            """
            WITH ring AS (
                SELECT ST_ExteriorRing(geometry_wkt) AS geom,
                       ST_NPoints(ST_ExteriorRing(geometry_wkt)) AS npts
                FROM map_road
                WHERE _oid_ = %s
            ),
            side AS (
                SELECT CASE
                    WHEN %s < %s THEN
                        ST_LineMerge(
                            ST_MakeLine(
                                ARRAY(
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(%s + 1, %s + 1) AS i
                                )
                            )
                        )
                    ELSE
                        ST_LineMerge(
                            ST_MakeLine(
                                ARRAY(
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(%s + 1, npts) AS i
                                      UNION ALL
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(1, %s + 1) AS i
                                )
                            )
                        )
                END AS geom
                FROM ring
            ),
            metrics AS (
                SELECT
                    ST_AsText(geom)                    AS segment_wkt,
                    ST_LineInterpolatePoint(geom, 0.5) AS center_geom,
                    ST_Length(geom::geography)         AS segment_len_m
                FROM side
            )
            SELECT
                segment_wkt,
                ST_X(center_geom) AS center_lon,
                ST_Y(center_geom) AS center_lat,
                segment_len_m
            FROM metrics;
            """,
            (
                road_id,
                ring_idx_a,
                ring_idx_b,
                ring_idx_a,
                ring_idx_b,
                ring_idx_a,
                ring_idx_b,
            ),
        )

        seg = cursor.fetchone()
        if not seg or seg[0] is None:
            segment_wkt = f"LINESTRING({corner_a['lon']} {corner_a['lat']}, {corner_b['lon']} {corner_b['lat']})"
            center_lon = (corner_a["lon"] + corner_b["lon"]) / 2.0
            center_lat = (corner_a["lat"] + corner_b["lat"]) / 2.0
            segment_length = haversine_distance(
                corner_a["lat"], corner_a["lon"],
                corner_b["lat"], corner_b["lon"],
            )
        else:
            segment_wkt, center_lon, center_lat, segment_length = seg

        cursor.execute(
            """
            WITH segment AS (
                SELECT ST_GeomFromText(%s, 4326) AS geom
            ),
            overlapping AS (
                SELECT
                    ml.name,
                    ml.type,
                    ST_Length(
                        ST_Intersection(ST_MakeValid(ml.geometry_wkt), segment.geom)::geography
                    ) AS overlap_length
                FROM map_location ml, segment
                WHERE ml.type NOT IN ('road_corner_marker', 'road_corner_side_center')
                  AND ml.geometry_wkt IS NOT NULL
                  AND ST_Intersects(ST_MakeValid(ml.geometry_wkt), segment.geom)
            ),
            best AS (
                SELECT
                    name,
                    type,
                    overlap_length
                FROM overlapping
                WHERE overlap_length IS NOT NULL
                ORDER BY
                    CASE
                        WHEN LOWER(type) IN ('intersection', 'intersection_polygon', 'road_intersection_center')
                            THEN 0
                        ELSE 1
                    END,
                    overlap_length DESC
                LIMIT 1
            )
            SELECT
                name,
                type,
                overlap_length
            FROM best;
            """,
            (segment_wkt,),
        )

        overlap_row = cursor.fetchone()
        if overlap_row:
            entity_name, entity_type, overlap_length = overlap_row
            overlap_val = float(overlap_length or 0.0)
            center_inside = overlap_val > 0
            center_inside_score = 2 if center_inside else 1
        else:
            entity_name = None
            entity_type = None
            overlap_val = 0.0
            center_inside = False
            center_inside_score = 0

        edges.append(
            {
                "edge_index": idx,
                "corner_a": corner_a,
                "corner_b": corner_b,
                "segment_wkt": segment_wkt,
                "segment_length": float(segment_length),
                "center_lon": center_lon,
                "center_lat": center_lat,
                "center_inside": center_inside,
                "center_inside_score": center_inside_score,
                "overlap_length": overlap_val,
                "overlapping_entity_name": entity_name,
                "overlapping_entity_type": entity_type,
                "center_source": "side_polyline_midpoint",
            }
        )

    best_edge = max(
        edges,
        key=lambda e: (e["center_inside_score"], e["overlap_length"])
    )

    if best_edge["overlap_length"] == 0 and not best_edge["center_inside"]:
        return []

    opposite_index = (best_edge["edge_index"] + 2) % 4
    opposite_edge = next(e for e in edges if e["edge_index"] == opposite_index)

    pair_0 = [edges[0], edges[2]]
    pair_1 = [edges[1], edges[3]]

    center_pair_indices = {best_edge["edge_index"], opposite_edge["edge_index"]}
    if center_pair_indices == {0, 2}:
        center_pair = pair_0
        other_pair = pair_1
    else:
        center_pair = pair_1
        other_pair = pair_0

    road_width_m = (center_pair[0]["segment_length"] + center_pair[1]["segment_length"]) / 2.0
    road_length_m = (other_pair[0]["segment_length"] + other_pair[1]["segment_length"]) / 2.0

    best_edge["road_width_m"] = road_width_m
    best_edge["road_length_m"] = road_length_m
    opposite_edge["road_width_m"] = road_width_m
    opposite_edge["road_length_m"] = road_length_m

    return [best_edge, opposite_edge]


def _build_corner_pairs_with_spatial_overlap_old(
    selected: List[Dict[str, Any]],
    cursor,
    road_id: str,
) -> List[Dict[str, Any]]:
    """
    Find the best two edges for side-center markers:
    1. Pick the edge with maximum overlap with intersections/locations
    2. Pick the opposite edge (no shared corner)
    """
    if len(selected) < 4:
        return []

    ordered = sorted(selected, key=lambda c: c["ring_index"])
    edges_with_overlap: List[Dict[str, Any]] = []

    for idx in range(len(ordered)):
        corner_a = ordered[idx]
        corner_b = ordered[(idx + 1) % len(ordered)]
        ring_idx_a = corner_a["ring_index"]
        ring_idx_b = corner_b["ring_index"]

        cursor.execute(
            """
            WITH ring AS (
                SELECT ST_ExteriorRing(geometry_wkt) as geom,
                       ST_NPoints(ST_ExteriorRing(geometry_wkt)) as npts
                FROM map_road
                WHERE _oid_ = %s
            ),
            side AS (
                SELECT CASE
                    WHEN %s < %s THEN
                        ST_LineMerge(
                            ST_MakeLine(
                                ARRAY(
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(%s + 1, %s + 1) AS i
                                )
                            )
                        )
                    ELSE
                        ST_LineMerge(
                            ST_MakeLine(
                                ARRAY(
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(%s + 1, npts) AS i
                                    UNION ALL
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(1, %s + 1) AS i
                                )
                            )
                        )
                END AS geom
                FROM ring
            ),
            center_calc AS (
                SELECT
                    ST_AsText(geom) AS segment_wkt,
                    ST_LineInterpolatePoint(geom, 0.5) AS center_geom,
                    ST_Length(geom::geography) AS segment_len_m
                FROM side
            )
            SELECT
                segment_wkt,
                ST_AsText(center_geom) AS center_wkt,
                ST_X(center_geom) AS center_lon,
                ST_Y(center_geom) AS center_lat,
                segment_len_m
            FROM center_calc
            """,
            (road_id, ring_idx_a, ring_idx_b, ring_idx_a, ring_idx_b, ring_idx_a, ring_idx_b)
        )

        segment_result = cursor.fetchone()
        if not segment_result or segment_result[0] is None:
            segment_wkt = f"LINESTRING({corner_a['lon']} {corner_a['lat']}, {corner_b['lon']} {corner_b['lat']})"
            center_lon = (corner_a["lon"] + corner_b["lon"]) / 2.0
            center_lat = (corner_a["lat"] + corner_b["lat"]) / 2.0
            segment_length = haversine_distance(corner_a["lat"], corner_a["lon"], corner_b["lat"], corner_b["lon"])
        else:
            segment_wkt, _, center_lon, center_lat, segment_length = segment_result

        cursor.execute(
            """
            WITH segment AS (
                SELECT ST_GeomFromText(%s, 4326) AS geom
            ),
            overlapping_entities AS (
                SELECT 
                    ml.name,
                    ml.type,
                    ST_Intersection(ST_MakeValid(ml.geometry_wkt), segment.geom) AS intersection_geom,
                    ST_Length(ST_Intersection(ST_MakeValid(ml.geometry_wkt), segment.geom)::geography) AS overlap_length
                FROM map_location ml, segment
                WHERE ml.type NOT IN ('road_corner_marker', 'road_corner_side_center')
                  AND ml.geometry_wkt IS NOT NULL
                  AND ST_Intersects(ST_MakeValid(ml.geometry_wkt), segment.geom)
            ),
            best_entity AS (
                SELECT 
                    name,
                    type,
                    intersection_geom,
                    overlap_length
                FROM overlapping_entities
                WHERE intersection_geom IS NOT NULL
                ORDER BY 
                    CASE 
                        WHEN LOWER(type) IN ('intersection', 'intersection_polygon', 'road_intersection_center') THEN 0 
                        ELSE 1 
                    END,
                    overlap_length DESC NULLS LAST
                LIMIT 1
            ),
            best_center AS (
                SELECT 
                    name,
                    type,
                    overlap_length,
                    CASE
                        WHEN intersection_geom IS NULL THEN NULL
                        WHEN ST_Dimension(intersection_geom) = 1 THEN
                            CASE
                                WHEN GeometryType(ST_LineMerge(intersection_geom)) = 'ST_LineString'
                                    THEN ST_LineInterpolatePoint(ST_LineMerge(intersection_geom), 0.5)
                                ELSE ST_PointOnSurface(intersection_geom)
                            END
                        ELSE
                            ST_PointOnSurface(intersection_geom)
                    END AS geom_any
                FROM best_entity
            ),
            snapped AS (
                SELECT
                    name,
                    type,
                    overlap_length,
                    ST_ClosestPoint((SELECT geom FROM segment), geom_any) AS center_geom
                FROM best_center
                WHERE geom_any IS NOT NULL
            )
            SELECT 
                name,
                type,
                overlap_length,
                ST_X(center_geom) as center_lon,
                ST_Y(center_geom) as center_lat
            FROM snapped;
            """,
            (segment_wkt,),
        )

        result = cursor.fetchone()

        edge_data = {
            "edge_index": idx,
            "corner_a": corner_a,
            "corner_b": corner_b,
            "segment_wkt": segment_wkt,
            "segment_length": segment_length,
        }

        if result and result[2] is not None:
            entity_name, entity_type, overlap_length, snapped_lon, snapped_lat = result
            center_lon = snapped_lon
            center_lat = snapped_lat
            edge_data.update({
                "center_lon": center_lon,
                "center_lat": center_lat,
                "overlap_length": float(overlap_length or 0),
                "center_inside": True,  
                "center_inside_score": 2,
                "overlapping_entity_name": entity_name,
                "overlapping_entity_type": entity_type,
                "center_source": "intersection_overlap_snapped_to_side"
            })
        else:
            edge_data.update({
                "center_lon": center_lon,
                "center_lat": center_lat,
                "overlap_length": 0.0,
                "center_inside": False,
                "center_inside_score": 0,
                "overlapping_entity_name": None,
                "overlapping_entity_type": None,
                "center_source": "side_polyline_midpoint"
            })

        edges_with_overlap.append(edge_data)

    best_edge = max(
        edges_with_overlap,
        key=lambda e: (e["center_inside_score"], e["overlap_length"])
    )

    if best_edge["overlap_length"] == 0 and not best_edge["center_inside"]:
        return []

    opposite_index = (best_edge["edge_index"] + 2) % 4
    opposite_edge = next(e for e in edges_with_overlap if e["edge_index"] == opposite_index)

    pair_0 = [edges_with_overlap[0], edges_with_overlap[2]]
    pair_1 = [edges_with_overlap[1], edges_with_overlap[3]]

    center_pair_indices = {best_edge["edge_index"], opposite_edge["edge_index"]}

    if center_pair_indices == {0, 2}:
        center_pair = pair_0
        other_pair = pair_1
    else:
        center_pair = pair_1
        other_pair = pair_0

    center_avg = (center_pair[0]["segment_length"] + center_pair[1]["segment_length"]) / 2.0
    other_avg = (other_pair[0]["segment_length"] + other_pair[1]["segment_length"]) / 2.0

    road_width_m = center_avg
    road_length_m = other_avg

    best_edge["road_width_m"] = road_width_m
    best_edge["road_length_m"] = road_length_m
    opposite_edge["road_width_m"] = road_width_m
    opposite_edge["road_length_m"] = road_length_m

    return [best_edge, opposite_edge]


def _build_corner_pairs_with_spatial_overlap_old(
    selected: List[Dict[str, Any]],
    cursor,
    road_id: str,
) -> List[Dict[str, Any]]:
    """
    Updated implementation that snaps side centers to the actual side polyline
    and synchronizes the parametric position (t) across opposite sides.
    """
    if len(selected) < 4:
        return []

    ordered = sorted(selected, key=lambda c: c["ring_index"])
    edges_with_overlap: List[Dict[str, Any]] = []

    for idx in range(len(ordered)):
        corner_a = ordered[idx]
        corner_b = ordered[(idx + 1) % len(ordered)]
        ring_idx_a = corner_a["ring_index"]
        ring_idx_b = corner_b["ring_index"]

        cursor.execute(
            """
            WITH ring AS (
                SELECT ST_ExteriorRing(geometry_wkt) AS geom,
                       ST_NPoints(ST_ExteriorRing(geometry_wkt)) AS npts
                FROM map_road
                WHERE _oid_ = %s
            ),
            side AS (
                SELECT CASE
                    WHEN %s < %s THEN
                        ST_LineMerge(
                            ST_MakeLine(
                                ARRAY(
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(%s + 1, %s + 1) AS i
                                )
                            )
                        )
                    ELSE
                        ST_LineMerge(
                            ST_MakeLine(
                                ARRAY(
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(%s + 1, npts) AS i
                                    UNION ALL
                                    SELECT ST_PointN(geom, i)
                                    FROM generate_series(1, %s + 1) AS i
                                )
                            )
                        )
                END AS geom
                FROM ring
            ),
            metrics AS (
                SELECT
                    ST_AsText(geom) AS segment_wkt,
                    CASE
                        WHEN GeometryType(geom) = 'ST_LineString'
                            THEN ST_LineInterpolatePoint(geom, 0.5)
                        ELSE ST_PointN(geom, 1)
                    END AS center_geom,
                    ST_Length(geom::geography) AS segment_len_m
                FROM side
            )
            SELECT
                segment_wkt,
                COALESCE(ST_AsText(center_geom), NULL) AS center_wkt,
                ST_X(center_geom) AS center_lon,
                ST_Y(center_geom) AS center_lat,
                segment_len_m
            FROM metrics;
            """,
            (
                road_id,
                ring_idx_a,
                ring_idx_b,
                ring_idx_a,
                ring_idx_b,
                ring_idx_a,
                ring_idx_b,
            ),
        )

        segment_result = cursor.fetchone()
        if not segment_result or segment_result[0] is None:
            segment_wkt = f"LINESTRING({corner_a['lon']} {corner_a['lat']}, {corner_b['lon']} {corner_b['lat']})"
            center_lon = (corner_a["lon"] + corner_b["lon"]) / 2.0
            center_lat = (corner_a["lat"] + corner_b["lat"]) / 2.0
            segment_length = haversine_distance(
                corner_a["lat"], corner_a["lon"], corner_b["lat"], corner_b["lon"]
            )
        else:
            segment_wkt, _, center_lon, center_lat, segment_length = segment_result

        center_t = 0.5

        cursor.execute(
            """
            WITH segment AS (
                SELECT ST_GeomFromText(%s, 4326) AS geom
            ),
            overlapping_entities AS (
                SELECT 
                    ml.name,
                    ml.type,
                    ST_Intersection(ST_MakeValid(ml.geometry_wkt), segment.geom) AS intersection_geom,
                    ST_Length(
                        ST_Intersection(ST_MakeValid(ml.geometry_wkt), segment.geom)::geography
                    ) AS overlap_length
                FROM map_location ml, segment
                WHERE ml.type NOT IN ('road_corner_marker', 'road_corner_side_center')
                  AND ml.geometry_wkt IS NOT NULL
                  AND ST_Intersects(ST_MakeValid(ml.geometry_wkt), segment.geom)
            ),
            best_entity AS (
                SELECT 
                    name,
                    type,
                    intersection_geom,
                    overlap_length
                FROM overlapping_entities
                WHERE intersection_geom IS NOT NULL
                ORDER BY 
                    CASE 
                        WHEN LOWER(type) IN ('intersection', 'intersection_polygon', 'road_intersection_center') THEN 0 
                        ELSE 1 
                    END,
                    overlap_length DESC NULLS LAST
                LIMIT 1
            ),
            best_center AS (
                SELECT 
                    name,
                    type,
                    overlap_length,
                    CASE
                        WHEN intersection_geom IS NULL THEN NULL
                        WHEN ST_Dimension(intersection_geom) = 1 THEN
                            CASE
                                WHEN GeometryType(ST_LineMerge(intersection_geom)) = 'ST_LineString'
                                    THEN ST_LineInterpolatePoint(ST_LineMerge(intersection_geom), 0.5)
                                ELSE ST_PointOnSurface(intersection_geom)
                            END
                        ELSE
                            ST_PointOnSurface(intersection_geom)
                    END AS geom_any
                FROM best_entity
            ),
            snapped AS (
                SELECT
                    name,
                    type,
                    overlap_length,
                    ST_ClosestPoint((SELECT geom FROM segment), geom_any) AS center_geom
                FROM best_center
                WHERE geom_any IS NOT NULL
            ),
            located AS (
                SELECT
                    name,
                    type,
                    overlap_length,
                    center_geom,
                    ST_LineLocatePoint((SELECT geom FROM segment), center_geom) AS center_t
                FROM snapped
            )
            SELECT 
                name,
                type,
                overlap_length,
                ST_X(center_geom) as center_lon,
                ST_Y(center_geom) as center_lat,
                center_t
            FROM located;
            """,
            (segment_wkt,),
        )

        result = cursor.fetchone()

        edge_data = {
            "edge_index": idx,
            "corner_a": corner_a,
            "corner_b": corner_b,
            "segment_wkt": segment_wkt,
            "segment_length": segment_length,
        }

        if result:
            entity_name, entity_type, overlap_length, snapped_lon, snapped_lat, located_t = result
            if snapped_lon is not None and snapped_lat is not None:
                center_lon = snapped_lon
                center_lat = snapped_lat
            if located_t is not None:
                center_t = float(located_t)
            overlap_value = float(overlap_length or 0.0)
            edge_data.update({
                "center_lon": center_lon,
                "center_lat": center_lat,
                "center_t": center_t,
                "overlap_length": overlap_value,
                "center_inside": overlap_value > 0,
                "center_inside_score": 2 if overlap_value > 0 else 1,
                "overlapping_entity_name": entity_name,
                "overlapping_entity_type": entity_type,
                "center_source": "intersection_overlap_snapped_to_side" if overlap_value > 0 else "side_polyline_midpoint"
            })
        else:
            edge_data.update({
                "center_lon": center_lon,
                "center_lat": center_lat,
                "center_t": center_t,
                "overlap_length": 0.0,
                "center_inside": False,
                "center_inside_score": 0,
                "overlapping_entity_name": None,
                "overlapping_entity_type": None,
                "center_source": "side_polyline_midpoint"
            })

        edges_with_overlap.append(edge_data)

    best_edge = max(
        edges_with_overlap,
        key=lambda e: (e["center_inside_score"], e["overlap_length"])
    )

    if best_edge["overlap_length"] == 0 and not best_edge["center_inside"]:
        return []

    opposite_index = (best_edge["edge_index"] + 2) % 4
    opposite_edge = next(e for e in edges_with_overlap if e["edge_index"] == opposite_index)

    t_best = float(best_edge.get("center_t", 0.5))
    t_best = max(0.0, min(1.0, t_best))

    try:
        cursor.execute(
            """
            SELECT
                ST_X(ST_LineInterpolatePoint(ST_GeomFromText(%s, 4326), %s)) AS center_lon,
                ST_Y(ST_LineInterpolatePoint(ST_GeomFromText(%s, 4326), %s)) AS center_lat
            """,
            (opposite_edge["segment_wkt"], t_best, opposite_edge["segment_wkt"], t_best)
        )
        snapped_point = cursor.fetchone()
        if snapped_point and snapped_point[0] is not None and snapped_point[1] is not None:
            opposite_edge["center_lon"] = snapped_point[0]
            opposite_edge["center_lat"] = snapped_point[1]
            opposite_edge["center_t"] = t_best
            opposite_edge["center_source"] = (
                opposite_edge.get("center_source", "side_polyline_midpoint") + "_synced_to_best_edge_t"
            )
    except Exception as exc:
        logger.warning("Failed to sync opposite edge center for road %s: %s", road_id, exc)

    # Calculate road dimensions (same as before)
    pair_0 = [edges_with_overlap[0], edges_with_overlap[2]]
    pair_1 = [edges_with_overlap[1], edges_with_overlap[3]]

    center_pair_indices = {best_edge["edge_index"], opposite_edge["edge_index"]}

    if center_pair_indices == {0, 2}:
        center_pair = pair_0
        other_pair = pair_1
    else:
        center_pair = pair_1
        other_pair = pair_0

    center_avg = (center_pair[0]["segment_length"] + center_pair[1]["segment_length"]) / 2.0
    other_avg = (other_pair[0]["segment_length"] + other_pair[1]["segment_length"]) / 2.0

    road_width_m = center_avg
    road_length_m = other_avg

    best_edge["road_width_m"] = road_width_m
    best_edge["road_length_m"] = road_length_m
    opposite_edge["road_width_m"] = road_width_m
    opposite_edge["road_length_m"] = road_length_m

    return [best_edge, opposite_edge]


# ---------------------------------------------------------------------------
# Marker builders
# ---------------------------------------------------------------------------


def prepare_corner_records(
    road: Road,
    selected_corners: List[Dict[str, Any]],
) -> List[Tuple[Any, ...]]:
    records: List[Tuple[Any, ...]] = []
    for idx, corner in enumerate(selected_corners, start=1):
        display_idx = idx
        corner["display_index"] = display_idx
        # Use calculated road length from edges, fallback to database value
        road_length = corner.get("road_length_m")
        if road_length is None:
            road_length = float(road.length_m) if road.length_m is not None else None
        metadata = {
            "road_id": road.road_id,
            "road_name": road.display_name,
            "marker_kind": "corner",
            "corner_index": display_idx,
            "ring_index": corner.get("ring_index"),
            "angle_deg": corner.get("angle"),
            "angle_diff_deg": corner.get("angle_diff_90_270"),  # Use the 90/270 diff
            "angle_diff_from_90": abs(corner.get("angle", 0) - 90.0),  # Also store raw diff from 90 for UI
            "proximity_m": corner.get("proximity_m"),
            "nearest_entity": corner.get("nearest_entity"),
            "nearest_entity_type": corner.get("nearest_entity_type"),
            "road_length_m": road_length,  # Average of the two unchosen edge lengths
            "road_width_m": corner.get("road_width_m"),  # Average of the two chosen edge lengths
        }
        point_wkt = f"POINT({corner['lon']} {corner['lat']})"
        name = normalize_name(road.display_name, f"corner {display_idx}")
        records.append(
            (
                True,
                False,
                False,
                guid(),
                guid(),
                name,
                "road_corner_marker",
                point_wkt,
                json.dumps(metadata),
            )
        )
    return records


def prepare_side_records(road: Road, corner_pairs: List[Dict[str, Any]]) -> List[Tuple[Any, ...]]:
    records: List[Tuple[Any, ...]] = []
    for idx, pair in enumerate(corner_pairs, start=1):
        corner_a = pair["corner_a"]
        corner_b = pair["corner_b"]
        center_lon = pair.get("center_lon")
        center_lat = pair.get("center_lat")
        if center_lon is None or center_lat is None:
            logger.warning("Skipping side center %s for %s: invalid coords %s", idx, road.display_name, pair)
            continue
        metadata = {
            "road_id": road.road_id,
            "road_name": road.display_name,
            "marker_kind": "side_center",
            "pair_rank": idx,
            "corner_ring_indices": [corner_a.get("ring_index"), corner_b.get("ring_index")],
            "corner_display_indices": [corner_a.get("display_index"), corner_b.get("display_index")],
            "segment_length_m": pair["segment_length"],
            "overlap_length_m": pair["overlap_length"],
            "center_inside": pair["center_inside"],
            "overlapping_entity_name": pair.get("overlapping_entity_name"),
            "overlapping_entity_type": pair.get("overlapping_entity_type"),
            "road_width_m": pair.get("road_width_m"),  # Average of the two chosen edges (with centers)
            "road_length_m": pair.get("road_length_m"),  # Average of the two unchosen edges (without centers)
            "center_source": pair.get("center_source"),  # How center was calculated
            "segment_wkt": pair.get("segment_wkt"),  # Store full width segment for downstream heading calc
        }

        point_wkt = f"POINT({center_lon} {center_lat})"
        name = normalize_name(road.display_name, f"side center {idx}")
        records.append(
            (
                True,
                False,
                False,
                guid(),
                guid(),
                name,
                "road_corner_side_center",
                point_wkt,
                json.dumps(metadata),
            )
        )
    return records


def build_marker_records(
    roads: Iterable[Road],
    neighbors: Sequence[Neighbor],
    cursor,
) -> Tuple[List[Tuple[Any, ...]], List[Tuple[Any, ...]]]:
    """Build corner and side center marker records for all roads."""
    corner_records: List[Tuple[Any, ...]] = []
    side_records: List[Tuple[Any, ...]] = []

    for idx, road in enumerate(roads):
        ring = parse_outer_ring(road.geometry_geojson)
        if len(ring) < 3:
            continue

        corners = build_corner_candidates(ring)
        if not corners:
            continue

        # Select the 4 best corners (closest to intersections/locations)
        # select_corners now logs ALL candidate angles internally
        selected = select_corners(corners, neighbors, road_name=road.display_name)

        if len(selected) < CORNER_MARKERS_PER_ROAD:
            logger.warning(
                "Road %s (%s) only produced %s corners; skipping. Total candidates: %s",
                road.road_id,
                road.display_name,
                len(selected),
                len(corners),
            )
            continue

        # Validate selected corners - log if any are far from 90/270 (but allow them if we needed to relax threshold)
        bad_angles = [c for c in selected if c.get("angle_diff_90_270", float("inf")) > max(ANGLE_THRESHOLDS)]
        if bad_angles:
            logger.warning(
                "Road %s (%s): Selected %s corners with angles > %.1f° from 90/270 (threshold was relaxed): %s",
                road.road_id,
                road.display_name,
                len(bad_angles),
                max(ANGLE_THRESHOLDS),
                [(c.get("angle"), c.get("angle_diff_90_270")) for c in bad_angles]
            )

        if idx < 3:
            logger.info(
                "Road %s (%s): selected %s corners from %s candidates. Angles: %s",
                road.road_id,
                road.display_name,
                len(selected),
                len(corners),
                [f"{c.get('angle'):.1f}°" for c in selected]
            )

        # Find side centers using spatial overlap with intersections/locations
        corner_pairs = build_corner_pairs_with_spatial_overlap(selected, cursor, road.road_id)
        
        # Extract road dimensions from corner_pairs if available
        road_width_m = None
        road_length_m = None
        if corner_pairs:
            road_width_m = corner_pairs[0].get("road_width_m")
            road_length_m = corner_pairs[0].get("road_length_m")
        
        # Add dimensions to corners
        for corner in selected:
            corner["road_width_m"] = road_width_m
            corner["road_length_m"] = road_length_m
        
        corner_records.extend(prepare_corner_records(road, selected))
        
        if corner_pairs:
            side_records.extend(prepare_side_records(road, corner_pairs))

    return corner_records, side_records


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def insert_markers(cursor, records: List[Tuple[Any, ...]]):
    if not records:
        return
    execute_values(
        cursor,
        """
        INSERT INTO map_location (
            is_open,
            on_hold_by_dispatcher,
            on_hold_by_operator,
            _cid_,
            _oid_,
            name,
            type,
            geometry_wkt,
            road_marker_metadata
        ) VALUES %s
        """,
        records,
        template="(%s,%s,%s,%s,%s,%s,%s,ST_GeomFromText(%s,4326),%s)",
    )


def update_road_dimensions(cursor):
    """Update map_road table with calculated dimensions from corner markers."""
    logger.info("Updating map_road table with calculated dimensions...")
    
    # Get calculated dimensions from corner markers
    cursor.execute("""
        WITH marker_dimensions AS (
            SELECT DISTINCT
                road_marker_metadata->>'road_id' as road_id,
                (road_marker_metadata->>'road_width_m')::float as calc_width,
                (road_marker_metadata->>'road_length_m')::float as calc_length
            FROM map_location
            WHERE type = 'road_corner_marker'
                AND road_marker_metadata->>'road_width_m' IS NOT NULL
                AND road_marker_metadata->>'road_length_m' IS NOT NULL
        )
        UPDATE map_road
        SET 
            length_m = md.calc_length,
            width_m = md.calc_width
        FROM marker_dimensions md
        WHERE map_road._oid_ = md.road_id
    """)
    
    updated_count = cursor.rowcount
    logger.info(f"Updated dimensions for {updated_count} roads")
    return updated_count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def generate_markers():
    conn = psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )
    conn.autocommit = False
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM map_location
                WHERE type IN ('road_corner_marker', 'road_corner_side_center');
                """
            )
            removed = cursor.rowcount
            logger.info("Removed %s existing marker rows", removed)

            neighbors = fetch_neighbors(cursor)
            roads = fetch_roads(cursor)

            corner_records, side_records = build_marker_records(roads, neighbors, cursor)
            logger.info(
                "Prepared %s corner markers and %s side centers",
                len(corner_records),
                len(side_records),
            )

            insert_markers(cursor, corner_records)
            insert_markers(cursor, side_records)
            
            # Update road dimensions in map_road table
            updated_roads = update_road_dimensions(cursor)
            
        conn.commit()
        logger.info(
            "✅ Inserted %s marker rows into map_location (%s corners, %s side centers)",
            len(corner_records) + len(side_records),
            len(corner_records),
            len(side_records),
        )
        logger.info(f"✅ Updated dimensions for {updated_roads} roads in map_road table")
    except Exception as exc:  # pragma: no cover - diagnostic logging
        conn.rollback()
        logger.exception("❌ Failed to generate road corner markers: %s", exc)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    generate_markers()



