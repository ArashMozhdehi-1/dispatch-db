from typing import List, Dict, Any, Optional
import math

from shapely.geometry import LineString, Point, Polygon, MultiPolygon, shape, mapping, JOIN_STYLE
from shapely.ops import unary_union, transform
from pyproj import Transformer


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def _vertex_angle_deg(p_prev, p, p_next):
    """
    Interior angle at vertex p (in degrees) for polygon ring vertices.
    p_prev, p, p_next are (x, y) tuples in a planar metric CRS.
    """
    v1x = p_prev[0] - p[0]
    v1y = p_prev[1] - p[1]
    v2x = p_next[0] - p[0]
    v2y = p_next[1] - p[1]

    len1 = math.hypot(v1x, v1y)
    len2 = math.hypot(v2x, v2y)
    if len1 == 0 or len2 == 0:
        return 180.0

    dot = v1x * v2x + v1y * v2y
    cosang = dot / (len1 * len2)
    cosang = max(-1.0, min(1.0, cosang))
    return math.degrees(math.acos(cosang))


def smooth_central_corners(
    geom: Polygon | MultiPolygon,
    center_xy: Point,
    road_width_m: float,
    *,
    angle_threshold_deg: float = 150.0,
    max_center_dist_factor: float = 1.6,
    patch_radius_factor: float = 1.2,
    fillet_radius_factor: float = 0.7,
):
    """
    Locally smooth *sharp* corners of an intersection polygon near the center.

    - Only vertices with interior angle < angle_threshold_deg are smoothed.
    - Only vertices within (max_center_dist_factor * road_width_m) of the
      intersection center are touched. Corners further away (where the polygon
      'cuts through' the main road) stay sharp.
    - Smoothing is done in small patches around each such corner using
      buffer(+r)/buffer(-r) which creates a rounded fillet.

    All geometries are assumed to be in a planar metric CRS.
    """
    if geom.is_empty:
        return geom

    if isinstance(geom, MultiPolygon):
        parts = [
            smooth_central_corners(
                g,
                center_xy,
                road_width_m,
                angle_threshold_deg=angle_threshold_deg,
                max_center_dist_factor=max_center_dist_factor,
                patch_radius_factor=patch_radius_factor,
                fillet_radius_factor=fillet_radius_factor,
            )
            for g in geom.geoms
        ]
        return unary_union(parts)

    if not isinstance(geom, Polygon):
        return geom

    geom = geom.buffer(0)  # clean topology
    if geom.is_empty:
        return geom

    coords = list(geom.exterior.coords)
    if len(coords) < 5:
        return geom

    cx, cy = center_xy.x, center_xy.y
    max_center_dist = road_width_m * max_center_dist_factor
    patch_radius = road_width_m * patch_radius_factor
    fillet_radius = road_width_m * fillet_radius_factor

    current = geom

    # walk all vertices except duplicated last point
    for i in range(1, len(coords) - 2):
        p_prev = coords[i - 1]
        p = coords[i]
        p_next = coords[i + 1]

        # only touch corners reasonably close to the intersection centre
        dx = p[0] - cx
        dy = p[1] - cy
        if dx * dx + dy * dy > max_center_dist * max_center_dist:
            continue

        angle_deg = _vertex_angle_deg(p_prev, p, p_next)
        # near-straight corners -> do nothing
        if angle_deg > angle_threshold_deg:
            continue

        corner_pt = Point(p)
        patch_disk = corner_pt.buffer(patch_radius)

        local_region = current.intersection(patch_disk)
        if local_region.is_empty:
            continue

        smoothed_local = (
            local_region
            .buffer(fillet_radius, join_style=JOIN_STYLE.round)
            .buffer(-fillet_radius, join_style=JOIN_STYLE.round)
        )

        remainder = current.difference(patch_disk)
        current = remainder.union(smoothed_local)

    return current

def utm_crs_for_lonlat(lon: float, lat: float) -> str:
    """
    Pick a local UTM EPSG code for a lon/lat (WGS84).
    """
    zone = int(math.floor((lon + 180.0) / 6.0) + 1)
    if lat >= 0:
        return f"EPSG:{32600 + zone}"  # northern hemisphere
    else:
        return f"EPSG:{32700 + zone}"  # southern hemisphere


def line_substring(line: LineString, start_dist: float, end_dist: float) -> Optional[LineString]:
    """
    Return the sub-segment of 'line' between start_dist and end_dist (in the line’s units).
    start_dist / end_dist are along-line measures from the start vertex.

    Returns None if the requested segment is empty or too small.
    """
    if start_dist <= 0 and end_dist >= line.length:
        return LineString(line.coords)

    if end_dist <= 0 or start_dist >= line.length or start_dist >= end_dist:
        return None

    coords = list(line.coords)
    new_coords = []

    d = 0.0
    for i in range(len(coords) - 1):
        p1 = Point(coords[i])
        p2 = Point(coords[i + 1])
        seg_len = p1.distance(p2)
        if seg_len == 0:
            continue

        seg_start = d
        seg_end = d + seg_len

        # segment completely before requested range
        if seg_end <= start_dist:
            d += seg_len
            continue

        # segment completely after requested range
        if seg_start >= end_dist:
            break

        # Determine the part of this segment that lies inside [start_dist, end_dist]
        local_start = max(start_dist, seg_start)
        local_end = min(end_dist, seg_end)

        # fractions along this segment
        f_start = (local_start - seg_start) / seg_len
        f_end = (local_end - seg_start) / seg_len

        x1, y1 = p1.x, p1.y
        x2, y2 = p2.x, p2.y

        start_pt = Point(x1 + f_start * (x2 - x1),
                         y1 + f_start * (y2 - y1))
        end_pt = Point(x1 + f_end * (x2 - x1),
                       y1 + f_end * (y2 - y1))

        if not new_coords:
            new_coords.append((start_pt.x, start_pt.y))

        new_coords.append((end_pt.x, end_pt.y))

        d += seg_len

        if seg_end >= end_dist:
            break

    if len(new_coords) < 2:
        return None
    return LineString(new_coords)


# -------------------------------------------------------------------
# Main intersection builder
# -------------------------------------------------------------------

def build_intersection_polygons(
    roads: List[Dict[str, Any]],
    intersections: List[Dict[str, Any]],
    road_width_m: float = 14.0,
    slice_length_m: float = 50.0,
    nearby_threshold_m: float = 60.0,
    intersection_expand_factor: float = 0.25,
    debug: bool = False,
) -> List[Dict[str, Any]]:
    if not roads or not intersections:
        if debug:
            print("No roads or intersections passed in")
        return []

    first_geom = shape(intersections[0]["geometry"])
    if isinstance(first_geom, Point):
        lon, lat = first_geom.x, first_geom.y
    else:
        c = first_geom.representative_point()
        lon, lat = c.x, c.y

    local_epsg = utm_crs_for_lonlat(lon, lat)

    to_local = Transformer.from_crs("EPSG:4326", local_epsg, always_xy=True)
    to_wgs84 = Transformer.from_crs(local_epsg, "EPSG:4326", always_xy=True)

    def _to_local_geom(geom):
        return transform(to_local.transform, geom)

    def _to_wgs84_geom(geom):
        return transform(to_wgs84.transform, geom)

    # Prebuild shapely lines in local metres
    local_roads = []
    for r in roads:
        try:
            g = shape(r["geometry"])    # GeoJSON LineString in WGS84
        except Exception as e:
            if debug:
                print("Bad road geometry:", e, r.get("road_id"))
            continue

        if not isinstance(g, LineString) or g.length == 0:
            continue

        g_local = _to_local_geom(g)
        local_roads.append({"row": r, "line": g_local})

    if debug:
        print(f"Loaded {len(local_roads)} road lines")

    half_road_width = road_width_m / 2.0
    result = []

    for idx, inter in enumerate(intersections):
        raw_geom = shape(inter["geometry"])
        if isinstance(raw_geom, Point):
            center = raw_geom
        elif isinstance(raw_geom, Polygon):
            center = raw_geom.centroid
        else:
            center = raw_geom.representative_point()

        center_local: Point = _to_local_geom(center)

        candidate_slices = []

        for entry in local_roads:
            line: LineString = entry["line"]

            # Skip roads too far from this intersection
            dist = center_local.distance(line)
            if dist > nearby_threshold_m:
                continue

            # Distance along the line of the projected centre
            along = line.project(center_local)

            # 50 m (or slice_length_m) BEFORE the centre
            pre = line_substring(
                line,
                max(0.0, along - slice_length_m),
                along,
            )

            # 50 m (or slice_length_m) AFTER the centre
            post = line_substring(
                line,
                along,
                min(line.length, along + slice_length_m),
            )

            for sub in (pre, post):
                if sub is None or sub.length == 0:
                    continue

                buf = sub.buffer(
                    half_road_width,
                    cap_style=3,   # square at far end
                    join_style=2,  # mitre along edges
                    resolution=16,
                )
                candidate_slices.append(buf)

        if debug:
            name = inter.get("intersection_name", f"#{idx}")
            print(f"intersection {name}: {len(candidate_slices)} roads nearby")

        if len(candidate_slices) < 2:
            # nothing or only one road: skip, or change <2 -> <1 if you want to *always* see something
            continue

        inter_geom_local = unary_union(candidate_slices)
        if inter_geom_local.is_empty:
            continue

        if isinstance(inter_geom_local, Polygon):
            poly_local = inter_geom_local
        else:
            polys = [g for g in inter_geom_local.geoms if isinstance(g, Polygon)]
            if not polys:
                continue
            poly_local = max(polys, key=lambda p: p.area)

        # Expand the intersection slightly to ensure it covers the road edges
        extra = road_width_m * intersection_expand_factor
        if extra > 0:
            poly_local = poly_local.buffer(
                extra,
                join_style=2,   # mitre joins
                cap_style=3,    # square caps
                resolution=16,
            )

        # 🔧 Locally round only the central branch corners
        poly_local = smooth_central_corners(
            poly_local,
            center_local,          # the intersection centre in local XY
            road_width_m,
            angle_threshold_deg=150.0,
            max_center_dist_factor=1.6,
            patch_radius_factor=1.2,
            fillet_radius_factor=0.7,
        )

        poly_wgs84 = _to_wgs84_geom(poly_local)

        out = dict(inter)
        out["nice_geometry"] = mapping(poly_wgs84)
        result.append(out)

    if debug:
        print(f"Built {len(result)} nice intersection polygons")

    return result
