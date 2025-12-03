#!/usr/bin/env python3
"""
ETL that loads Frontrunner map data into the shared_map schema.
"""

from __future__ import annotations

import json
import logging
import math
from collections import defaultdict
from decimal import Decimal
import hashlib
from typing import Any, Dict, List, Optional, Sequence, Tuple

import psycopg2
from psycopg2.extras import execute_batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
LOGGER = logging.getLogger("shared_map_loader")

SOURCE_DB = {
    "host": "postgres",
    "port": 5432,
    "database": "mf_geoserver_db",
    "user": "infra_user",
    "password": "infra_password",
}

TARGET_DB = {
    "host": "postgres",
    "port": 5432,
    "database": "shared_map",
    "user": "infra_user",
    "password": "infra_password",
}

SEGMENT_LENGTH_M = 50.0
LOCATION_SNAP_DISTANCE_M = 40.0
MARKER_TYPES = {"road_corner_marker": "corner", "road_corner_side_center": "side_center"}
CONNECTIVITY_TYPES = {"intersection", "gate", "location"}


def connect_db(cfg: Dict[str, Any]):
    return psycopg2.connect(**cfg)


def stable_int_id(raw: Any) -> int:
    if raw is None:
        raise ValueError("Cannot derive id from None")
    try:
        numeric = int(raw)
    except (TypeError, ValueError):
        digest = hashlib.sha1(str(raw).encode("utf-8")).hexdigest()
        numeric = int(digest[:15], 16)
    return (numeric % 2_000_000_000) or 1


def parse_polygon_ring(geojson_str: str) -> Optional[List[List[float]]]:
    geom = json.loads(geojson_str)
    coords: Optional[List[List[float]]] = None
    if geom["type"] == "Polygon":
        coords = geom["coordinates"][0]
    elif geom["type"] == "MultiPolygon":
        coords = geom["coordinates"][0][0]
    if not coords or len(coords) < 4:
        return None
    if coords[0] == coords[-1]:
        coords = coords[:-1]
    return coords


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_axis_frame(ring: List[List[float]]) -> Optional[Dict[str, Any]]:
    if len(ring) < 4:
        return None
    avg_lat = sum(pt[1] for pt in ring) / len(ring)
    avg_lon = sum(pt[0] for pt in ring) / len(ring)
    lat_scale = 111320.0
    lon_scale = max(1e-6, 111320.0 * math.cos(math.radians(avg_lat)))
    xy_points: List[Tuple[int, float, float]] = []
    xs: List[float] = []
    ys: List[float] = []
    for idx, (lon, lat) in enumerate(ring):
        x = (lon - avg_lon) * lon_scale
        y = (lat - avg_lat) * lat_scale
        xy_points.append((idx, x, y))
        xs.append(x)
        ys.append(y)
    n = len(xy_points)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    a = sum((x - mean_x) ** 2 for x in xs) / n
    b = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n)) / n
    c = sum((y - mean_y) ** 2 for y in ys) / n
    trace = a + c
    det = a * c - b * b
    disc = max(0.0, (trace * trace) / 4.0 - det)
    lambda1 = trace / 2.0 + math.sqrt(disc)
    axis_vec = (lambda1 - c, b)
    norm = math.hypot(axis_vec[0], axis_vec[1])
    if norm < 1e-6:
        return None
    axis_dir = (axis_vec[0] / norm, axis_vec[1] / norm)
    perp_dir = (-axis_dir[1], axis_dir[0])
    min_t = float("inf")
    max_t = -float("inf")
    min_u = float("inf")
    max_u = -float("inf")
    t_values: List[Tuple[int, float]] = []
    for idx, x, y in xy_points:
        rel_x = x - mean_x
        rel_y = y - mean_y
        t = axis_dir[0] * rel_x + axis_dir[1] * rel_y
        u = perp_dir[0] * rel_x + perp_dir[1] * rel_y
        t_values.append((idx, t))
        min_t = min(min_t, t)
        max_t = max(max_t, t)
        min_u = min(min_u, u)
        max_u = max(max_u, u)
    return {
        "origin": (avg_lat, avg_lon, lat_scale, lon_scale),
        "mean": (mean_x, mean_y),
        "axis": axis_dir,
        "perp": perp_dir,
        "min_t": min_t,
        "max_t": max_t,
        "min_u": min_u,
        "max_u": max_u,
    }


def interpolate_point(frame: Dict[str, Any], t: float, u: float) -> Tuple[float, float]:
    mean_x, mean_y = frame["mean"]
    axis_dir = frame["axis"]
    perp_dir = frame["perp"]
    lat0, lon0, lat_scale, lon_scale = frame["origin"]
    x = mean_x + axis_dir[0] * t + perp_dir[0] * u
    y = mean_y + axis_dir[1] * t + perp_dir[1] * u
    lon = lon0 + x / lon_scale
    lat = lat0 + y / lat_scale
    return lon, lat


def build_centerline_points(frame: Dict[str, Any]) -> List[Tuple[float, float]]:
    min_t = frame["min_t"]
    max_t = frame["max_t"]
    if max_t - min_t < 1.0:
        return []
    ts = [min_t]
    while ts[-1] < max_t:
        nxt = ts[-1] + SEGMENT_LENGTH_M
        if nxt >= max_t:
            ts.append(max_t)
            break
        ts.append(nxt)
    if ts[-1] != max_t:
        ts.append(max_t)
    mid_u = (frame["min_u"] + frame["max_u"]) / 2.0
    return [interpolate_point(frame, t_val, mid_u) for t_val in ts]


def create_segments(points: Sequence[Tuple[float, float]]) -> List[Tuple[Tuple[float, float], Tuple[float, float], float]]:
    segments: List[Tuple[Tuple[float, float], Tuple[float, float], float]] = []
    for idx in range(len(points) - 1):
        lon1, lat1 = points[idx]
        lon2, lat2 = points[idx + 1]
        length = haversine_distance(lat1, lon1, lat2, lon2)
        if length < 0.5:
            continue
        segments.append(((lon1, lat1), (lon2, lat2), length))
    return segments


def linestring_wkt(coords: Sequence[Tuple[float, float]]) -> str:
    joined = ",".join(f"{lon} {lat}" for lon, lat in coords)
    return f"LINESTRING({joined})"


def truncate_target(cur):
    cur.execute(
        """
        TRUNCATE road_markers, lane_connectors, lane_segments,
                 connector_unit_permissions, lane_conditions,
                 roads, infrastructure RESTART IDENTITY CASCADE;
        """
    )


def load_infrastructure(src_cur, dst_cur) -> Tuple[Dict[int, Dict[str, Any]], Dict[str, int]]:
    LOGGER.info("Loading infrastructure records")
    src_cur.execute(
        """
        SELECT
            _oid_,
            name,
            type,
            is_open,
            ST_AsGeoJSON(geometry_wkt) AS geom_json,
            ST_AsGeoJSON(ST_Centroid(geometry_wkt)) AS centroid_json
        FROM map_location
        WHERE type NOT IN ('road_corner_marker', 'road_corner_side_center')
        """
    )
    rows = src_cur.fetchall()
    by_id: Dict[int, Dict[str, Any]] = {}
    by_name: Dict[str, int] = {}
    values = []
    for row in rows:
        try:
            location_id = stable_int_id(row[0])
        except ValueError:
            continue
        name = row[1]
        loc_type = (row[2] or "").lower()
        is_open = row[3]
        geom_json = row[4]
        centroid_json = row[5]
        if not geom_json or not centroid_json:
            continue
        centroid_coords = json.loads(centroid_json)["coordinates"]
        center_latlon = (centroid_coords[1], centroid_coords[0])
        by_id[location_id] = {
            "name": name,
            "type": loc_type,
            "is_open": is_open,
            "centroid": center_latlon,
        }
        if name:
            by_name.setdefault(name, location_id)
        values.append(
            (
                location_id,
                name,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                geom_json,
                centroid_json,
                None,
                None,
                is_open,
            )
        )
    if values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO infrastructure (
                location_id, location_name, pit_id, region_id, unit_id,
                sign_id, signpost, shoptype, gpstype,
                geometry, center_point, radius_m, elevation_m, is_active
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                ST_GeomFromGeoJSON(%s), ST_GeomFromGeoJSON(%s), %s, %s, %s
            )
            ON CONFLICT (location_id) DO UPDATE
            SET location_name = EXCLUDED.location_name,
                geometry = EXCLUDED.geometry,
                center_point = EXCLUDED.center_point,
                is_active = EXCLUDED.is_active;
            """,
            values,
            page_size=500,
        )
    LOGGER.info("Inserted %s infrastructure rows", len(values))
    return by_id, by_name


def insert_roads_and_lanes(src_cur, dst_cur, infra_by_name: Dict[str, int]) -> Dict[str, Dict[str, Any]]:
    LOGGER.info("Loading roads and slicing centerlines")
    src_cur.execute(
        """
        SELECT
            _oid_,
            from_location_name,
            to_location_name,
            is_open,
            length_m,
            ST_AsGeoJSON(geometry_wkt) AS geom_json
        FROM map_road
        WHERE geometry_wkt IS NOT NULL
        """
    )
    roads = src_cur.fetchall()
    road_values = []
    lane_values = []
    lane_endpoints: Dict[str, Dict[str, Any]] = {}
    for row in roads:
        try:
            road_id = stable_int_id(row[0])
        except ValueError:
            continue
        from_name = row[1]
        to_name = row[2]
        is_open = row[3]
        length_m = row[4] or 0.0
        geom_json = row[5]
        ring = parse_polygon_ring(geom_json)
        if not ring:
            continue
        frame = build_axis_frame(ring)
        if not frame:
            continue
        center_points = build_centerline_points(frame)
        if len(center_points) < 2:
            continue
        centerline_wkt = linestring_wkt(center_points)
        width_m = frame["max_u"] - frame["min_u"]
        start_loc_id = infra_by_name.get(from_name)
        end_loc_id = infra_by_name.get(to_name)
        road_length = float(length_m) if length_m else SEGMENT_LENGTH_M * (len(center_points) - 1)
        road_values.append(
            (
                road_id,
                f"{from_name} -> {to_name}",
                start_loc_id,
                end_loc_id,
                from_name,
                to_name,
                "frontrunner",
                geom_json,
                centerline_wkt,
                road_length,
                is_open,
            )
        )

        def add_segments(points: List[Tuple[float, float]], direction: str, name_a: str, name_b: str):
            segs = create_segments(points)
            if not segs:
                return
            for idx, seg in enumerate(segs):
                lane_id = f"{road_id}_{direction}_{idx:03d}"
                geom_wkt = linestring_wkt([seg[0], seg[1]])
                lane_values.append(
                    (
                        lane_id,
                        road_id,
                        f"{name_a} -> {name_b} {direction}",
                        direction,
                        geom_wkt,
                        width_m,
                        None,
                        seg[2],
                        "frontrunner",
                        infra_by_name.get(name_a),
                        infra_by_name.get(name_b),
                        name_a,
                        name_b,
                        None,
                        None,
                        not is_open,
                    )
                )
            start_lane_id = f"{road_id}_{direction}_000"
            end_lane_id = f"{road_id}_{direction}_{len(segs)-1:03d}"
            lane_endpoints[f"{start_lane_id}:start"] = {"lane_id": start_lane_id, "point": points[0]}
            lane_endpoints[f"{end_lane_id}:end"] = {"lane_id": end_lane_id, "point": points[-1]}

        add_segments(center_points, "F", from_name, to_name)
        add_segments(list(reversed(center_points)), "B", to_name, from_name)

    if road_values:
        road_sql = """
            INSERT INTO roads (
                road_id, road_name, start_location_id, end_location_id,
                from_location_name, to_location_name, source_system,
                geometry, centerline, road_length_m, is_open
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                ST_GeomFromGeoJSON(%s), ST_GeomFromText(%s, 4326), %s, %s
            )
            ON CONFLICT (road_id) DO UPDATE
            SET road_name = EXCLUDED.road_name,
                geometry = EXCLUDED.geometry,
                centerline = EXCLUDED.centerline,
                road_length_m = EXCLUDED.road_length_m,
                is_open = EXCLUDED.is_open;
            """
        for row in road_values:
            try:
                dst_cur.execute(road_sql, row)
            except Exception:
                LOGGER.exception("Failed inserting road %s (%s -> %s)", row[0], row[4], row[5])
                raise
    if lane_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO lane_segments (
                lane_id, road_id, lane_name, lane_direction,
                geometry, lane_width_m, weight_limit_tonnes,
                length_m, source_system,
                from_location_id, to_location_id,
                from_location_name, to_location_name,
                time_empty_seconds, time_loaded_seconds, is_closed
            )
            VALUES (
                %s, %s, %s, %s,
                ST_GeomFromText(%s, 4326), %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s
            )
            ON CONFLICT (lane_id) DO UPDATE
            SET geometry = EXCLUDED.geometry,
                length_m = EXCLUDED.length_m,
                lane_width_m = EXCLUDED.lane_width_m,
                is_closed = EXCLUDED.is_closed;
            """,
            lane_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s roads and %s lane segments", len(road_values), len(lane_values))
    return lane_endpoints


def _serialize_metadata(meta: Any):
    if isinstance(meta, Decimal):
        return float(meta)
    if isinstance(meta, dict):
        return {k: _serialize_metadata(v) for k, v in meta.items()}
    if isinstance(meta, list):
        return [_serialize_metadata(v) for v in meta]
    return meta


def load_road_markers(src_cur, dst_cur, infra_by_name: Dict[str, int]):
    LOGGER.info("Loading road markers")
    src_cur.execute(
        """
        SELECT
            type,
            road_marker_metadata,
            ST_AsGeoJSON(geometry_wkt) AS geom_json
        FROM map_location
        WHERE type IN ('road_corner_marker', 'road_corner_side_center')
        """
    )
    rows = src_cur.fetchall()
    marker_values = []
    for row in rows:
        meta = row[1]
        if not meta or "road_id" not in meta:
            continue
        try:
            road_id = stable_int_id(meta.get("road_id"))
        except (TypeError, ValueError):
            continue
        marker_type = MARKER_TYPES.get(row[0])
        if not marker_type:
            continue
        nearest_name = meta.get("nearest_entity")
        nearest_id = infra_by_name.get(nearest_name) if nearest_name else None
        marker_values.append(
            (
                road_id,
                marker_type,
                meta.get("corner_index"),
                row[2],
                meta.get("angle_deg"),
                meta.get("proximity_m"),
                nearest_id,
                nearest_name,
                json.dumps(_serialize_metadata(meta)),
            )
        )
    if marker_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO road_markers (
                road_id, marker_type, marker_index,
                geometry, angle_deg, proximity_m,
                nearest_location_id, nearest_location_name, metadata
            )
            VALUES (
                %s, %s, %s,
                ST_GeomFromGeoJSON(%s), %s, %s,
                %s, %s, %s::jsonb
            )
            """,
            marker_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s road markers", len(marker_values))


def build_connectors(dst_cur, infra_by_id: Dict[int, Dict[str, Any]], lane_endpoints: Dict[str, Dict[str, Any]]):
    if not lane_endpoints:
        LOGGER.info("No lane endpoints available for connectors")
        return
    LOGGER.info("Building lane connectors")
    neighbors: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for loc_id, info in infra_by_id.items():
        if info["type"] not in CONNECTIVITY_TYPES:
            continue
        loc_lat, loc_lon = info["centroid"]
        for lane_info in lane_endpoints.values():
            lon, lat = lane_info["point"]
            dist = haversine_distance(loc_lat, loc_lon, lat, lon)
            if dist <= LOCATION_SNAP_DISTANCE_M:
                neighbors[loc_id].append({"lane_id": lane_info["lane_id"], "point": lane_info["point"]})
    connector_values = []
    seen_pairs = set()
    for loc_id, entries in neighbors.items():
        for idx, a in enumerate(entries):
            for jdx, b in enumerate(entries):
                if idx == jdx:
                    continue
                pair_key = (a["lane_id"], b["lane_id"], loc_id)
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                line = linestring_wkt([a["point"], b["point"]])
                connector_values.append((a["lane_id"], b["lane_id"], loc_id, loc_id, line))
    if connector_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO lane_connectors (
                from_lane_id, to_lane_id,
                from_location_id, to_location_id,
                geometry
            )
            VALUES (
                %s, %s, %s, %s, ST_GeomFromText(%s, 4326)
            )
            """,
            connector_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s lane connectors", len(connector_values))


def main():
    src_conn = connect_db(SOURCE_DB)
    dst_conn = connect_db(TARGET_DB)
    try:
        with dst_conn:
            with dst_conn.cursor() as dst_cur:
                truncate_target(dst_cur)
        with src_conn, dst_conn:
            src_cur = src_conn.cursor()
            dst_cur = dst_conn.cursor()
            infra_by_id, infra_by_name = load_infrastructure(src_cur, dst_cur)
            lane_endpoints = insert_roads_and_lanes(src_cur, dst_cur, infra_by_name)
            load_road_markers(src_cur, dst_cur, infra_by_name)
            build_connectors(dst_cur, infra_by_id, lane_endpoints)
            dst_conn.commit()
    finally:
        src_conn.close()
        dst_conn.close()
    LOGGER.info("Shared map ETL completed")


if __name__ == "__main__":
    main()
 
"""
ETL that loads Frontrunner map data into the shared_map schema.
"""

from __future__ import annotations

import json
import logging
import math
from collections import defaultdict
from decimal import Decimal
import hashlib
from typing import Any, Dict, List, Optional, Sequence, Tuple

import psycopg2
from psycopg2.extras import execute_batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
LOGGER = logging.getLogger("shared_map_loader")

SOURCE_DB = {
    "host": "postgres",
    "port": 5432,
    "database": "mf_geoserver_db",
    "user": "infra_user",
    "password": "infra_password",
}

TARGET_DB = {
    "host": "postgres",
    "port": 5432,
    "database": "shared_map",
    "user": "infra_user",
    "password": "infra_password",
}

SEGMENT_LENGTH_M = 50.0
LOCATION_SNAP_DISTANCE_M = 40.0
MARKER_TYPES = {"road_corner_marker": "corner", "road_corner_side_center": "side_center"}
CONNECTIVITY_TYPES = {"intersection", "gate", "location"}


def connect_db(cfg: Dict[str, Any]):
    return psycopg2.connect(**cfg)


def stable_int_id(raw: Any) -> int:
    if raw is None:
        raise ValueError("Cannot derive id from None")
    try:
        numeric = int(raw)
    except (TypeError, ValueError):
        digest = hashlib.sha1(str(raw).encode("utf-8")).hexdigest()
        numeric = int(digest[:15], 16)
    return (numeric % 2_000_000_000) or 1


def parse_polygon_ring(geojson_str: str) -> Optional[List[List[float]]]:
    geom = json.loads(geojson_str)
    coords: Optional[List[List[float]]] = None
    if geom["type"] == "Polygon":
        coords = geom["coordinates"][0]
    elif geom["type"] == "MultiPolygon":
        coords = geom["coordinates"][0][0]
    if not coords or len(coords) < 4:
        return None
    if coords[0] == coords[-1]:
        coords = coords[:-1]
    return coords


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_axis_frame(ring: List[List[float]]) -> Optional[Dict[str, Any]]:
    if len(ring) < 4:
        return None
    avg_lat = sum(pt[1] for pt in ring) / len(ring)
    avg_lon = sum(pt[0] for pt in ring) / len(ring)
    lat_scale = 111320.0
    lon_scale = max(1e-6, 111320.0 * math.cos(math.radians(avg_lat)))
    xy_points: List[Tuple[int, float, float]] = []
    xs: List[float] = []
    ys: List[float] = []
    for idx, (lon, lat) in enumerate(ring):
        x = (lon - avg_lon) * lon_scale
        y = (lat - avg_lat) * lat_scale
        xy_points.append((idx, x, y))
        xs.append(x)
        ys.append(y)
    n = len(xy_points)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    a = sum((x - mean_x) ** 2 for x in xs) / n
    b = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n)) / n
    c = sum((y - mean_y) ** 2 for y in ys) / n
    trace = a + c
    det = a * c - b * b
    disc = max(0.0, (trace * trace) / 4.0 - det)
    lambda1 = trace / 2.0 + math.sqrt(disc)
    axis_vec = (lambda1 - c, b)
    norm = math.hypot(axis_vec[0], axis_vec[1])
    if norm < 1e-6:
        return None
    axis_dir = (axis_vec[0] / norm, axis_vec[1] / norm)
    perp_dir = (-axis_dir[1], axis_dir[0])
    min_t = float("inf")
    max_t = -float("inf")
    min_u = float("inf")
    max_u = -float("inf")
    t_values: List[Tuple[int, float]] = []
    for idx, x, y in xy_points:
        rel_x = x - mean_x
        rel_y = y - mean_y
        t = axis_dir[0] * rel_x + axis_dir[1] * rel_y
        u = perp_dir[0] * rel_x + perp_dir[1] * rel_y
        t_values.append((idx, t))
        min_t = min(min_t, t)
        max_t = max(max_t, t)
        min_u = min(min_u, u)
        max_u = max(max_u, u)
    return {
        "origin": (avg_lat, avg_lon, lat_scale, lon_scale),
        "mean": (mean_x, mean_y),
        "axis": axis_dir,
        "perp": perp_dir,
        "min_t": min_t,
        "max_t": max_t,
        "min_u": min_u,
        "max_u": max_u,
    }


def interpolate_point(frame: Dict[str, Any], t: float, u: float) -> Tuple[float, float]:
    mean_x, mean_y = frame["mean"]
    axis_dir = frame["axis"]
    perp_dir = frame["perp"]
    lat0, lon0, lat_scale, lon_scale = frame["origin"]
    x = mean_x + axis_dir[0] * t + perp_dir[0] * u
    y = mean_y + axis_dir[1] * t + perp_dir[1] * u
    lon = lon0 + x / lon_scale
    lat = lat0 + y / lat_scale
    return lon, lat


def build_centerline_points(frame: Dict[str, Any]) -> List[Tuple[float, float]]:
    min_t = frame["min_t"]
    max_t = frame["max_t"]
    if max_t - min_t < 1.0:
        return []
    ts = [min_t]
    while ts[-1] < max_t:
        nxt = ts[-1] + SEGMENT_LENGTH_M
        if nxt >= max_t:
            ts.append(max_t)
            break
        ts.append(nxt)
    if ts[-1] != max_t:
        ts.append(max_t)
    mid_u = (frame["min_u"] + frame["max_u"]) / 2.0
    return [interpolate_point(frame, t_val, mid_u) for t_val in ts]


def create_segments(points: Sequence[Tuple[float, float]]) -> List[Tuple[Tuple[float, float], Tuple[float, float], float]]:
    segments: List[Tuple[Tuple[float, float], Tuple[float, float], float]] = []
    for idx in range(len(points) - 1):
        lon1, lat1 = points[idx]
        lon2, lat2 = points[idx + 1]
        length = haversine_distance(lat1, lon1, lat2, lon2)
        if length < 0.5:
            continue
        segments.append(((lon1, lat1), (lon2, lat2), length))
    return segments


def linestring_wkt(coords: Sequence[Tuple[float, float]]) -> str:
    joined = ",".join(f"{lon} {lat}" for lon, lat in coords)
    return f"LINESTRING({joined})"


def truncate_target(cur):
    cur.execute(
        """
        TRUNCATE road_markers, lane_connectors, lane_segments,
                 connector_unit_permissions, lane_conditions,
                 roads, infrastructure RESTART IDENTITY CASCADE;
        """
    )


def load_infrastructure(src_cur, dst_cur) -> Tuple[Dict[int, Dict[str, Any]], Dict[str, int]]:
    LOGGER.info("Loading infrastructure records")
    src_cur.execute(
        """
        SELECT
            _oid_,
            name,
            type,
            is_open,
            ST_AsGeoJSON(geometry_wkt) AS geom_json,
            ST_AsGeoJSON(ST_Centroid(geometry_wkt)) AS centroid_json
        FROM map_location
        WHERE type NOT IN ('road_corner_marker', 'road_corner_side_center')
        """
    )
    rows = src_cur.fetchall()
    by_id: Dict[int, Dict[str, Any]] = {}
    by_name: Dict[str, int] = {}
    values = []
    for row in rows:
        try:
            location_id = stable_int_id(row[0])
        except ValueError:
            continue
        name = row[1]
        loc_type = (row[2] or "").lower()
        is_open = row[3]
        geom_json = row[4]
        centroid_json = row[5]
        if not geom_json or not centroid_json:
            continue
        centroid_coords = json.loads(centroid_json)["coordinates"]
        center_latlon = (centroid_coords[1], centroid_coords[0])
        by_id[location_id] = {
            "name": name,
            "type": loc_type,
            "is_open": is_open,
            "centroid": center_latlon,
        }
        if name:
            by_name.setdefault(name, location_id)
        values.append(
            (
                location_id,
                name,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                geom_json,
                centroid_json,
                None,
                None,
                is_open,
            )
        )
    if values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO infrastructure (
                location_id, location_name, pit_id, region_id, unit_id,
                sign_id, signpost, shoptype, gpstype,
                geometry, center_point, radius_m, elevation_m, is_active
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                ST_GeomFromGeoJSON(%s), ST_GeomFromGeoJSON(%s), %s, %s, %s
            )
            ON CONFLICT (location_id) DO UPDATE
            SET location_name = EXCLUDED.location_name,
                geometry = EXCLUDED.geometry,
                center_point = EXCLUDED.center_point,
                is_active = EXCLUDED.is_active;
            """,
            values,
            page_size=500,
        )
    LOGGER.info("Inserted %s infrastructure rows", len(values))
    return by_id, by_name


def insert_roads_and_lanes(src_cur, dst_cur, infra_by_name: Dict[str, int]) -> Dict[str, Dict[str, Any]]:
    LOGGER.info("Loading roads and slicing centerlines")
    src_cur.execute(
        """
        SELECT
            _oid_,
            from_location_name,
            to_location_name,
            is_open,
            length_m,
            ST_AsGeoJSON(geometry_wkt) AS geom_json
        FROM map_road
        WHERE geometry_wkt IS NOT NULL
        """
    )
    roads = src_cur.fetchall()
    road_values = []
    lane_values = []
    lane_endpoints: Dict[str, Dict[str, Any]] = {}
    for row in roads:
        try:
            road_id = stable_int_id(row[0])
        except ValueError:
            continue
        from_name = row[1]
        to_name = row[2]
        is_open = row[3]
        length_m = row[4] or 0.0
        geom_json = row[5]
        ring = parse_polygon_ring(geom_json)
        if not ring:
            continue
        frame = build_axis_frame(ring)
        if not frame:
            continue
        center_points = build_centerline_points(frame)
        if len(center_points) < 2:
            continue
        centerline_wkt = linestring_wkt(center_points)
        width_m = frame["max_u"] - frame["min_u"]
        start_loc_id = infra_by_name.get(from_name)
        end_loc_id = infra_by_name.get(to_name)
        road_length = float(length_m) if length_m else SEGMENT_LENGTH_M * (len(center_points) - 1)
        road_values.append(
            (
                road_id,
                f"{from_name} -> {to_name}",
                start_loc_id,
                end_loc_id,
                from_name,
                to_name,
                "frontrunner",
                geom_json,
                centerline_wkt,
                road_length,
                is_open,
            )
        )

        def add_segments(points: List[Tuple[float, float]], direction: str, name_a: str, name_b: str):
            segs = create_segments(points)
            if not segs:
                return
            for idx, seg in enumerate(segs):
                lane_id = f"{road_id}_{direction}_{idx:03d}"
                geom_wkt = linestring_wkt([seg[0], seg[1]])
                lane_values.append(
                    (
                        lane_id,
                        road_id,
                        f"{name_a} -> {name_b} {direction}",
                        direction,
                        geom_wkt,
                        width_m,
                        None,
                        seg[2],
                        "frontrunner",
                        infra_by_name.get(name_a),
                        infra_by_name.get(name_b),
                        name_a,
                        name_b,
                        None,
                        None,
                        not is_open,
                    )
                )
            start_lane_id = f"{road_id}_{direction}_000"
            end_lane_id = f"{road_id}_{direction}_{len(segs)-1:03d}"
            lane_endpoints[f"{start_lane_id}:start"] = {"lane_id": start_lane_id, "point": points[0]}
            lane_endpoints[f"{end_lane_id}:end"] = {"lane_id": end_lane_id, "point": points[-1]}

        add_segments(center_points, "F", from_name, to_name)
        add_segments(list(reversed(center_points)), "B", to_name, from_name)

    if road_values:
        road_sql = """
            INSERT INTO roads (
                road_id, road_name, start_location_id, end_location_id,
                from_location_name, to_location_name, source_system,
                geometry, centerline, road_length_m, is_open
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                ST_GeomFromGeoJSON(%s), ST_GeomFromText(%s, 4326), %s, %s
            )
            ON CONFLICT (road_id) DO UPDATE
            SET road_name = EXCLUDED.road_name,
                geometry = EXCLUDED.geometry,
                centerline = EXCLUDED.centerline,
                road_length_m = EXCLUDED.road_length_m,
                is_open = EXCLUDED.is_open;
            """
        for row in road_values:
            try:
                dst_cur.execute(road_sql, row)
            except Exception:
                LOGGER.exception("Failed inserting road %s (%s -> %s)", row[0], row[4], row[5])
                raise
    if lane_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO lane_segments (
                lane_id, road_id, lane_name, lane_direction,
                geometry, lane_width_m, weight_limit_tonnes,
                length_m, source_system,
                from_location_id, to_location_id,
                from_location_name, to_location_name,
                time_empty_seconds, time_loaded_seconds, is_closed
            )
            VALUES (
                %s, %s, %s, %s,
                ST_GeomFromText(%s, 4326), %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s
            )
            ON CONFLICT (lane_id) DO UPDATE
            SET geometry = EXCLUDED.geometry,
                length_m = EXCLUDED.length_m,
                lane_width_m = EXCLUDED.lane_width_m,
                is_closed = EXCLUDED.is_closed;
            """,
            lane_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s roads and %s lane segments", len(road_values), len(lane_values))
    return lane_endpoints


def _serialize_metadata(meta: Any):
    if isinstance(meta, Decimal):
        return float(meta)
    if isinstance(meta, dict):
        return {k: _serialize_metadata(v) for k, v in meta.items()}
    if isinstance(meta, list):
        return [_serialize_metadata(v) for v in meta]
    return meta


def load_road_markers(src_cur, dst_cur, infra_by_name: Dict[str, int]):
    LOGGER.info("Loading road markers")
    src_cur.execute(
        """
        SELECT
            type,
            road_marker_metadata,
            ST_AsGeoJSON(geometry_wkt) AS geom_json
        FROM map_location
        WHERE type IN ('road_corner_marker', 'road_corner_side_center')
        """
    )
    rows = src_cur.fetchall()
    marker_values = []
    for row in rows:
        meta = row[1]
        if not meta or "road_id" not in meta:
            continue
        try:
            road_id = stable_int_id(meta.get("road_id"))
        except (TypeError, ValueError):
            continue
        marker_type = MARKER_TYPES.get(row[0])
        if not marker_type:
            continue
        nearest_name = meta.get("nearest_entity")
        nearest_id = infra_by_name.get(nearest_name) if nearest_name else None
        marker_values.append(
            (
                road_id,
                marker_type,
                meta.get("corner_index"),
                row[2],
                meta.get("angle_deg"),
                meta.get("proximity_m"),
                nearest_id,
                nearest_name,
                json.dumps(_serialize_metadata(meta)),
            )
        )
    if marker_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO road_markers (
                road_id, marker_type, marker_index,
                geometry, angle_deg, proximity_m,
                nearest_location_id, nearest_location_name, metadata
            )
            VALUES (
                %s, %s, %s,
                ST_GeomFromGeoJSON(%s), %s, %s,
                %s, %s, %s::jsonb
            )
            """,
            marker_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s road markers", len(marker_values))


def build_connectors(dst_cur, infra_by_id: Dict[int, Dict[str, Any]], lane_endpoints: Dict[str, Dict[str, Any]]):
    if not lane_endpoints:
        LOGGER.info("No lane endpoints available for connectors")
        return
    LOGGER.info("Building lane connectors")
    neighbors: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for loc_id, info in infra_by_id.items():
        if info["type"] not in CONNECTIVITY_TYPES:
            continue
        loc_lat, loc_lon = info["centroid"]
        for lane_info in lane_endpoints.values():
            lon, lat = lane_info["point"]
            dist = haversine_distance(loc_lat, loc_lon, lat, lon)
            if dist <= LOCATION_SNAP_DISTANCE_M:
                neighbors[loc_id].append({"lane_id": lane_info["lane_id"], "point": lane_info["point"]})
    connector_values = []
    seen_pairs = set()
    for loc_id, entries in neighbors.items():
        for idx, a in enumerate(entries):
            for jdx, b in enumerate(entries):
                if idx == jdx:
                    continue
                pair_key = (a["lane_id"], b["lane_id"], loc_id)
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                line = linestring_wkt([a["point"], b["point"]])
                connector_values.append((a["lane_id"], b["lane_id"], loc_id, loc_id, line))
    if connector_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO lane_connectors (
                from_lane_id, to_lane_id,
                from_location_id, to_location_id,
                geometry
            )
            VALUES (
                %s, %s, %s, %s, ST_GeomFromText(%s, 4326)
            )
            """,
            connector_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s lane connectors", len(connector_values))


def main():
    src_conn = connect_db(SOURCE_DB)
    dst_conn = connect_db(TARGET_DB)
    try:
        with dst_conn:
            with dst_conn.cursor() as dst_cur:
                truncate_target(dst_cur)
        with src_conn, dst_conn:
            src_cur = src_conn.cursor()
            dst_cur = dst_conn.cursor()
            infra_by_id, infra_by_name = load_infrastructure(src_cur, dst_cur)
            lane_endpoints = insert_roads_and_lanes(src_cur, dst_cur, infra_by_name)
            load_road_markers(src_cur, dst_cur, infra_by_name)
            build_connectors(dst_cur, infra_by_id, lane_endpoints)
            dst_conn.commit()
    finally:
        src_conn.close()
        dst_conn.close()
    LOGGER.info("Shared map ETL completed")


if __name__ == "__main__":
    main()
 
"""
ETL that loads Frontrunner map data into the shared_map schema.
"""

from __future__ import annotations

import json
import logging
import math
from collections import defaultdict
from decimal import Decimal
import hashlib
from typing import Any, Dict, List, Optional, Sequence, Tuple

import psycopg2
from psycopg2.extras import execute_batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
LOGGER = logging.getLogger("shared_map_loader")

SOURCE_DB = {
    "host": "postgres",
    "port": 5432,
    "database": "mf_geoserver_db",
    "user": "infra_user",
    "password": "infra_password",
}

TARGET_DB = {
    "host": "postgres",
    "port": 5432,
    "database": "shared_map",
    "user": "infra_user",
    "password": "infra_password",
}

SEGMENT_LENGTH_M = 50.0
LOCATION_SNAP_DISTANCE_M = 40.0
MARKER_TYPES = {"road_corner_marker": "corner", "road_corner_side_center": "side_center"}
CONNECTIVITY_TYPES = {"intersection", "gate", "location"}


def connect_db(cfg: Dict[str, Any]):
    return psycopg2.connect(**cfg)


def stable_int_id(raw: Any) -> int:
    if raw is None:
        raise ValueError("Cannot derive id from None")
    try:
        numeric = int(raw)
    except (TypeError, ValueError):
        digest = hashlib.sha1(str(raw).encode("utf-8")).hexdigest()
        numeric = int(digest[:15], 16)
    return (numeric % 2_000_000_000) or 1


def parse_polygon_ring(geojson_str: str) -> Optional[List[List[float]]]:
    geom = json.loads(geojson_str)
    coords: Optional[List[List[float]]] = None
    if geom["type"] == "Polygon":
        coords = geom["coordinates"][0]
    elif geom["type"] == "MultiPolygon":
        coords = geom["coordinates"][0][0]
    if not coords or len(coords) < 4:
        return None
    if coords[0] == coords[-1]:
        coords = coords[:-1]
    return coords


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_axis_frame(ring: List[List[float]]) -> Optional[Dict[str, Any]]:
    if len(ring) < 4:
        return None
    avg_lat = sum(pt[1] for pt in ring) / len(ring)
    avg_lon = sum(pt[0] for pt in ring) / len(ring)
    lat_scale = 111320.0
    lon_scale = max(1e-6, 111320.0 * math.cos(math.radians(avg_lat)))
    xy_points: List[Tuple[int, float, float]] = []
    xs: List[float] = []
    ys: List[float] = []
    for idx, (lon, lat) in enumerate(ring):
        x = (lon - avg_lon) * lon_scale
        y = (lat - avg_lat) * lat_scale
        xy_points.append((idx, x, y))
        xs.append(x)
        ys.append(y)
    n = len(xy_points)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    a = sum((x - mean_x) ** 2 for x in xs) / n
    b = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n)) / n
    c = sum((y - mean_y) ** 2 for y in ys) / n
    trace = a + c
    det = a * c - b * b
    disc = max(0.0, (trace * trace) / 4.0 - det)
    lambda1 = trace / 2.0 + math.sqrt(disc)
    axis_vec = (lambda1 - c, b)
    norm = math.hypot(axis_vec[0], axis_vec[1])
    if norm < 1e-6:
        return None
    axis_dir = (axis_vec[0] / norm, axis_vec[1] / norm)
    perp_dir = (-axis_dir[1], axis_dir[0])
    min_t = float("inf")
    max_t = -float("inf")
    min_u = float("inf")
    max_u = -float("inf")
    t_values: List[Tuple[int, float]] = []
    for idx, x, y in xy_points:
        rel_x = x - mean_x
        rel_y = y - mean_y
        t = axis_dir[0] * rel_x + axis_dir[1] * rel_y
        u = perp_dir[0] * rel_x + perp_dir[1] * rel_y
        t_values.append((idx, t))
        min_t = min(min_t, t)
        max_t = max(max_t, t)
        min_u = min(min_u, u)
        max_u = max(max_u, u)
    return {
        "origin": (avg_lat, avg_lon, lat_scale, lon_scale),
        "mean": (mean_x, mean_y),
        "axis": axis_dir,
        "perp": perp_dir,
        "min_t": min_t,
        "max_t": max_t,
        "min_u": min_u,
        "max_u": max_u,
    }


def interpolate_point(frame: Dict[str, Any], t: float, u: float) -> Tuple[float, float]:
    mean_x, mean_y = frame["mean"]
    axis_dir = frame["axis"]
    perp_dir = frame["perp"]
    lat0, lon0, lat_scale, lon_scale = frame["origin"]
    x = mean_x + axis_dir[0] * t + perp_dir[0] * u
    y = mean_y + axis_dir[1] * t + perp_dir[1] * u
    lon = lon0 + x / lon_scale
    lat = lat0 + y / lat_scale
    return lon, lat


def build_centerline_points(frame: Dict[str, Any]) -> List[Tuple[float, float]]:
    min_t = frame["min_t"]
    max_t = frame["max_t"]
    if max_t - min_t < 1.0:
        return []
    ts = [min_t]
    while ts[-1] < max_t:
        nxt = ts[-1] + SEGMENT_LENGTH_M
        if nxt >= max_t:
            ts.append(max_t)
            break
        ts.append(nxt)
    if ts[-1] != max_t:
        ts.append(max_t)
    mid_u = (frame["min_u"] + frame["max_u"]) / 2.0
    return [interpolate_point(frame, t_val, mid_u) for t_val in ts]


def create_segments(points: Sequence[Tuple[float, float]]) -> List[Tuple[Tuple[float, float], Tuple[float, float], float]]:
    segments: List[Tuple[Tuple[float, float], Tuple[float, float], float]] = []
    for idx in range(len(points) - 1):
        lon1, lat1 = points[idx]
        lon2, lat2 = points[idx + 1]
        length = haversine_distance(lat1, lon1, lat2, lon2)
        if length < 0.5:
            continue
        segments.append(((lon1, lat1), (lon2, lat2), length))
    return segments


def linestring_wkt(coords: Sequence[Tuple[float, float]]) -> str:
    joined = ",".join(f"{lon} {lat}" for lon, lat in coords)
    return f"LINESTRING({joined})"


def truncate_target(cur):
    cur.execute(
        """
        TRUNCATE road_markers, lane_connectors, lane_segments,
                 connector_unit_permissions, lane_conditions,
                 roads, infrastructure RESTART IDENTITY CASCADE;
        """
    )


def load_infrastructure(src_cur, dst_cur) -> Tuple[Dict[int, Dict[str, Any]], Dict[str, int]]:
    LOGGER.info("Loading infrastructure records")
    src_cur.execute(
        """
        SELECT
            _oid_,
            name,
            type,
            is_open,
            ST_AsGeoJSON(geometry_wkt) AS geom_json,
            ST_AsGeoJSON(ST_Centroid(geometry_wkt)) AS centroid_json
        FROM map_location
        WHERE type NOT IN ('road_corner_marker', 'road_corner_side_center')
        """
    )
    rows = src_cur.fetchall()
    by_id: Dict[int, Dict[str, Any]] = {}
    by_name: Dict[str, int] = {}
    values = []
    for row in rows:
        try:
            location_id = stable_int_id(row[0])
        except ValueError:
            continue
        name = row[1]
        loc_type = (row[2] or "").lower()
        is_open = row[3]
        geom_json = row[4]
        centroid_json = row[5]
        if not geom_json or not centroid_json:
            continue
        centroid_coords = json.loads(centroid_json)["coordinates"]
        center_latlon = (centroid_coords[1], centroid_coords[0])
        by_id[location_id] = {
            "name": name,
            "type": loc_type,
            "is_open": is_open,
            "centroid": center_latlon,
        }
        if name:
            by_name.setdefault(name, location_id)
        values.append(
            (
                location_id,
                name,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                geom_json,
                centroid_json,
                None,
                None,
                is_open,
            )
        )
    if values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO infrastructure (
                location_id, location_name, pit_id, region_id, unit_id,
                sign_id, signpost, shoptype, gpstype,
                geometry, center_point, radius_m, elevation_m, is_active
            )
            VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                ST_GeomFromGeoJSON(%s), ST_GeomFromGeoJSON(%s), %s, %s, %s
            )
            ON CONFLICT (location_id) DO UPDATE
            SET location_name = EXCLUDED.location_name,
                geometry = EXCLUDED.geometry,
                center_point = EXCLUDED.center_point,
                is_active = EXCLUDED.is_active;
            """,
            values,
            page_size=500,
        )
    LOGGER.info("Inserted %s infrastructure rows", len(values))
    return by_id, by_name


def insert_roads_and_lanes(src_cur, dst_cur, infra_by_name: Dict[str, int]) -> Dict[str, Dict[str, Any]]:
    LOGGER.info("Loading roads and slicing centerlines")
    src_cur.execute(
        """
        SELECT
            _oid_,
            from_location_name,
            to_location_name,
            is_open,
            length_m,
            ST_AsGeoJSON(geometry_wkt) AS geom_json
        FROM map_road
        WHERE geometry_wkt IS NOT NULL
        """
    )
    roads = src_cur.fetchall()
    road_values = []
    lane_values = []
    lane_endpoints: Dict[str, Dict[str, Any]] = {}
    for row in roads:
        try:
            road_id = stable_int_id(row[0])
        except ValueError:
            continue
        from_name = row[1]
        to_name = row[2]
        is_open = row[3]
        length_m = row[4] or 0.0
        geom_json = row[5]
        ring = parse_polygon_ring(geom_json)
        if not ring:
            continue
        frame = build_axis_frame(ring)
        if not frame:
            continue
        center_points = build_centerline_points(frame)
        if len(center_points) < 2:
            continue
        centerline_wkt = linestring_wkt(center_points)
        width_m = frame["max_u"] - frame["min_u"]
        start_loc_id = infra_by_name.get(from_name)
        end_loc_id = infra_by_name.get(to_name)
        road_length = float(length_m) if length_m else SEGMENT_LENGTH_M * (len(center_points) - 1)
        road_values.append(
            (
                road_id,
                f"{from_name} -> {to_name}",
                start_loc_id,
                end_loc_id,
                from_name,
                to_name,
                "frontrunner",
                geom_json,
                centerline_wkt,
                road_length,
                is_open,
            )
        )

        def add_segments(points: List[Tuple[float, float]], direction: str, name_a: str, name_b: str):
            segs = create_segments(points)
            if not segs:
                return
            for idx, seg in enumerate(segs):
                lane_id = f"{road_id}_{direction}_{idx:03d}"
                geom_wkt = linestring_wkt([seg[0], seg[1]])
                lane_values.append(
                    (
                        lane_id,
                        road_id,
                        f"{name_a} -> {name_b} {direction}",
                        direction,
                        geom_wkt,
                        width_m,
                        None,
                        seg[2],
                        "frontrunner",
                        infra_by_name.get(name_a),
                        infra_by_name.get(name_b),
                        name_a,
                        name_b,
                        None,
                        None,
                        not is_open,
                    )
                )
            start_lane_id = f"{road_id}_{direction}_000"
            end_lane_id = f"{road_id}_{direction}_{len(segs)-1:03d}"
            lane_endpoints[f"{start_lane_id}:start"] = {"lane_id": start_lane_id, "point": points[0]}
            lane_endpoints[f"{end_lane_id}:end"] = {"lane_id": end_lane_id, "point": points[-1]}

        add_segments(center_points, "F", from_name, to_name)
        add_segments(list(reversed(center_points)), "B", to_name, from_name)

    if road_values:
        road_sql = """
            INSERT INTO roads (
                road_id, road_name, start_location_id, end_location_id,
                from_location_name, to_location_name, source_system,
                geometry, centerline, road_length_m, is_open
            )
            VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                ST_GeomFromGeoJSON(%s), ST_GeomFromText(%s, 4326), %s, %s
            )
            ON CONFLICT (road_id) DO UPDATE
            SET road_name = EXCLUDED.road_name,
                geometry = EXCLUDED.geometry,
                centerline = EXCLUDED.centerline,
                road_length_m = EXCLUDED.road_length_m,
                is_open = EXCLUDED.is_open;
            """
        for row in road_values:
            try:
                dst_cur.execute(road_sql, row)
            except Exception:
                LOGGER.exception("Failed inserting road %s (%s -> %s)", row[0], row[4], row[5])
                raise
    if lane_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO lane_segments (
                lane_id, road_id, lane_name, lane_direction,
                geometry, lane_width_m, weight_limit_tonnes,
                length_m, source_system,
                from_location_id, to_location_id,
                from_location_name, to_location_name,
                time_empty_seconds, time_loaded_seconds, is_closed
            )
            VALUES (
                %s, %s, %s, %s,
                ST_GeomFromText(%s, 4326), %s, %s,
                %s, %s,
                %s, %s,
                %s, %s,
                %s, %s, %s
            )
            ON CONFLICT (lane_id) DO UPDATE
            SET geometry = EXCLUDED.geometry,
                length_m = EXCLUDED.length_m,
                lane_width_m = EXCLUDED.lane_width_m,
                is_closed = EXCLUDED.is_closed;
            """,
            lane_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s roads and %s lane segments", len(road_values), len(lane_values))
    return lane_endpoints


def _serialize_metadata(meta: Any):
    if isinstance(meta, Decimal):
        return float(meta)
    if isinstance(meta, dict):
        return {k: _serialize_metadata(v) for k, v in meta.items()}
    if isinstance(meta, list):
        return [_serialize_metadata(v) for v in meta]
    return meta


def load_road_markers(src_cur, dst_cur, infra_by_name: Dict[str, int]):
    LOGGER.info("Loading road markers")
    src_cur.execute(
        """
        SELECT
            type,
            road_marker_metadata,
            ST_AsGeoJSON(geometry_wkt) AS geom_json
        FROM map_location
        WHERE type IN ('road_corner_marker', 'road_corner_side_center')
        """
    )
    rows = src_cur.fetchall()
    marker_values = []
    for row in rows:
        meta = row[1]
        if not meta or "road_id" not in meta:
            continue
        try:
            road_id = stable_int_id(meta.get("road_id"))
        except (TypeError, ValueError):
            continue
        marker_type = MARKER_TYPES.get(row[0])
        if not marker_type:
            continue
        nearest_name = meta.get("nearest_entity")
        nearest_id = infra_by_name.get(nearest_name) if nearest_name else None
        marker_values.append(
            (
                road_id,
                marker_type,
                meta.get("corner_index"),
                row[2],
                meta.get("angle_deg"),
                meta.get("proximity_m"),
                nearest_id,
                nearest_name,
                json.dumps(_serialize_metadata(meta)),
            )
        )
    if marker_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO road_markers (
                road_id, marker_type, marker_index,
                geometry, angle_deg, proximity_m,
                nearest_location_id, nearest_location_name, metadata
            )
            VALUES (
                %s, %s, %s,
                ST_GeomFromGeoJSON(%s), %s, %s,
                %s, %s, %s::jsonb
            )
            """,
            marker_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s road markers", len(marker_values))


def build_connectors(dst_cur, infra_by_id: Dict[int, Dict[str, Any]], lane_endpoints: Dict[str, Dict[str, Any]]):
    if not lane_endpoints:
        LOGGER.info("No lane endpoints available for connectors")
        return
    LOGGER.info("Building lane connectors")
    neighbors: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    for loc_id, info in infra_by_id.items():
        if info["type"] not in CONNECTIVITY_TYPES:
            continue
        loc_lat, loc_lon = info["centroid"]
        for lane_info in lane_endpoints.values():
            lon, lat = lane_info["point"]
            dist = haversine_distance(loc_lat, loc_lon, lat, lon)
            if dist <= LOCATION_SNAP_DISTANCE_M:
                neighbors[loc_id].append({"lane_id": lane_info["lane_id"], "point": lane_info["point"]})
    connector_values = []
    seen_pairs = set()
    for loc_id, entries in neighbors.items():
        for idx, a in enumerate(entries):
            for jdx, b in enumerate(entries):
                if idx == jdx:
                    continue
                pair_key = (a["lane_id"], b["lane_id"], loc_id)
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)
                line = linestring_wkt([a["point"], b["point"]])
                connector_values.append((a["lane_id"], b["lane_id"], loc_id, loc_id, line))
    if connector_values:
        execute_batch(
            dst_cur,
            """
            INSERT INTO lane_connectors (
                from_lane_id, to_lane_id,
                from_location_id, to_location_id,
                geometry
            )
            VALUES (
                %s, %s, %s, %s, ST_GeomFromText(%s, 4326)
            )
            """,
            connector_values,
            page_size=500,
        )
    LOGGER.info("Inserted %s lane connectors", len(connector_values))


def main():
    src_conn = connect_db(SOURCE_DB)
    dst_conn = connect_db(TARGET_DB)
    try:
        with dst_conn:
            with dst_conn.cursor() as dst_cur:
                truncate_target(dst_cur)
        with src_conn, dst_conn:
            src_cur = src_conn.cursor()
            dst_cur = dst_conn.cursor()
            infra_by_id, infra_by_name = load_infrastructure(src_cur, dst_cur)
            lane_endpoints = insert_roads_and_lanes(src_cur, dst_cur, infra_by_name)
            load_road_markers(src_cur, dst_cur, infra_by_name)
            build_connectors(dst_cur, infra_by_id, lane_endpoints)
            dst_conn.commit()
    finally:
        src_conn.close()
        dst_conn.close()
    LOGGER.info("Shared map ETL completed")


if __name__ == "__main__":
    main()
 