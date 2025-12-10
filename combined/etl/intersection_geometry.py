from typing import List, Dict, Any, Optional
import math

from shapely.geometry import (
    LineString,
    Point,
    Polygon,
    MultiPolygon,
    MultiPoint,
    MultiLineString,
    GeometryCollection,
    shape,
    mapping,
    JOIN_STYLE,
)
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


def _extract_branch_centers_from_polygon(
    poly_local: Polygon | MultiPolygon,
    center_local: Point,
    branch_width_m: float,
    *,
    num_rays: int = 180,
    angle_sep_deg: float = 18.0,
    dist_percentile: float = 0.60,
):
    """
    Given an intersection polygon in local metric coords and its centre,
    find one 'branch centre' per arm of the intersection.

    Algorithm:
      - Cast rays from the centre in `num_rays` directions.
      - For each ray, intersect with the polygon outer boundary and take
        the farthest hit from the centre (exit point).
      - We now have distance(theta) sampled around the circle.
      - Find local maxima of distance(theta) above a percentile threshold.
      - Merge maxima closer than `angle_sep_deg` so we get 1 per arm.

    Returns a list of shapely Points in the SAME CRS as `poly_local`.
    """
    if poly_local.is_empty:
        return []

    if isinstance(poly_local, MultiPolygon):
        if not poly_local.geoms:
            return []
        poly_local = max(poly_local.geoms, key=lambda p: p.area)

    if not isinstance(poly_local, Polygon):
        return []

    cx, cy = center_local.x, center_local.y
    minx, miny, maxx, maxy = poly_local.bounds
    max_extent = max(maxx - minx, maxy - miny)
    ray_len = max_extent * 3.0 if max_extent > 0 else branch_width_m * 4.0

    samples: list[tuple[float, float, Point]] = []
    outer = poly_local.exterior

    for i in range(num_rays):
        theta = 2.0 * math.pi * i / num_rays
        ex = cx + ray_len * math.cos(theta)
        ey = cy + ray_len * math.sin(theta)
        ray = LineString([(cx, cy), (ex, ey)])

        inter = outer.intersection(ray)
        if inter.is_empty:
            continue

        pts: list[Point] = []
        if isinstance(inter, Point):
            pts = [inter]
        elif isinstance(inter, MultiPoint):
            pts = list(inter.geoms)
        elif isinstance(inter, GeometryCollection):
            pts = [g for g in inter.geoms if isinstance(g, Point)]
        elif isinstance(inter, LineString):
            pts = [Point(inter.coords[0]), Point(inter.coords[-1])]

        if not pts:
            continue

        far_pt = max(pts, key=lambda p: center_local.distance(p))
        dist = center_local.distance(far_pt)
        samples.append((theta, dist, far_pt))

    if len(samples) < 3:
        return []

    samples.sort(key=lambda t: t[0])
    dists = [d for _, d, _ in samples]
    d_sorted = sorted(dists)
    idx = int(dist_percentile * (len(d_sorted) - 1))
    min_branch_dist = d_sorted[idx]

    angle_sep_rad = math.radians(angle_sep_deg)
    n = len(samples)

    maxima: list[tuple[float, float, Point]] = []
    for i, (theta, dist, pt) in enumerate(samples):
        prev_dist = samples[(i - 1) % n][1]
        next_dist = samples[(i + 1) % n][1]
        if dist < min_branch_dist:
            continue
        if dist >= prev_dist and dist >= next_dist:
            maxima.append((theta, dist, pt))

    if not maxima:
        return []

    maxima.sort(key=lambda t: t[0])
    merged: list[tuple[float, float, Point]] = []
    for theta, dist, pt in maxima:
        if not merged:
            merged.append((theta, dist, pt))
            continue
        last_theta, last_dist, last_pt = merged[-1]
        if theta - last_theta <= angle_sep_rad:
            if dist > last_dist:
                merged[-1] = (theta, dist, pt)
        else:
            merged.append((theta, dist, pt))

    if len(merged) > 1:
        first_theta, first_dist, first_pt = merged[0]
        last_theta, last_dist, last_pt = merged[-1]
        if (2.0 * math.pi - last_theta + first_theta) <= angle_sep_rad:
            if last_dist > first_dist:
                merged[0] = (last_theta, last_dist, last_pt)
            merged.pop()

    branch_pts = [pt for (_, _, pt) in merged]

    # Snap each branch point to the nearest ~90° corner if it is close, so the
    # marker sits where the patch meets the road at a right-ish angle.
    coords = list(poly_local.exterior.coords)
    right_angle_vertices: list[Point] = []
    for i in range(1, len(coords) - 1):
        ang = _vertex_angle_deg(coords[i - 1], coords[i], coords[i + 1])
        if 70.0 <= ang <= 110.0:  # roughly 90°
            right_angle_vertices.append(Point(coords[i]))

    if right_angle_vertices:
        snap_thresh = max(branch_width_m * 0.6, 3.0)
        snapped = []
        for pt in branch_pts:
            nearest = min(right_angle_vertices, key=lambda p: pt.distance(p))
            if pt.distance(nearest) <= snap_thresh:
                snapped.append(nearest)
            else:
                snapped.append(pt)
        branch_pts = snapped

    return branch_pts


def _cluster_branch_points(
    center_xy: Point,
    points: list[Point],
    *,
    max_angle_sep_deg: float = 20.0,
    min_dist_factor: float = 0.3,
) -> list[Point]:
    """
    Cluster candidate branch points (on road centre-lines) into arms by direction.
    Returns one representative point per arm.
    """
    if not points:
        return []

    tmp = []
    cx, cy = center_xy.x, center_xy.y
    for pt in points:
        dx = pt.x - cx
        dy = pt.y - cy
        ang = math.atan2(dy, dx)
        if ang < 0:
            ang += 2.0 * math.pi
        dist = center_xy.distance(pt)
        tmp.append({"pt": pt, "angle": ang, "dist": dist})

    max_dist = max(t["dist"] for t in tmp)
    min_dist = max_dist * min_dist_factor
    tmp = [t for t in tmp if t["dist"] >= min_dist]
    if not tmp:
        return []

    tmp.sort(key=lambda t: t["angle"])
    max_sep = math.radians(max_angle_sep_deg)

    clusters: list[list[dict]] = [[tmp[0]]]
    for t in tmp[1:]:
        if t["angle"] - clusters[-1][-1]["angle"] <= max_sep:
            clusters[-1].append(t)
        else:
            clusters.append([t])

    if len(clusters) > 1:
        first = clusters[0][0]
        last = clusters[-1][-1]
        if (2.0 * math.pi - last["angle"] + first["angle"]) <= max_sep:
            clusters[0].extend(clusters.pop())

    centres: list[Point] = []
    for cl in clusters:
        xs = [t["pt"].x for t in cl]
        ys = [t["pt"].y for t in cl]
        centres.append(Point(sum(xs) / len(xs), sum(ys) / len(ys)))

    return centres


def _reduce_branch_points_by_angle(
    center_xy: Point,
    poly_local: Polygon | MultiPolygon,
    points: list[Point],
    *,
    max_angle_sep_deg: float = 20.0,
    branch_width_m: float = 30.0,
) -> list[Point]:
    """
    From raw boundary intersection points, produce *two* points per arm that:
      • lie EXACTLY on the intersection perimeter (polygon exterior),
      • sit on the same side where the branch touches,
      • are separated along the perimeter by ~road width.
    """
    if not points:
        return []

    cx, cy = center_xy.x, center_xy.y

    tmp: list[tuple[float, float, Point]] = []
    for pt in points:
        dx = pt.x - cx
        dy = pt.y - cy
        ang = math.atan2(dy, dx)
        if ang < 0:
            ang += 2.0 * math.pi
        dist = math.hypot(dx, dy)
        tmp.append((ang, dist, pt))

    if not tmp:
        return []

    tmp.sort(key=lambda t: t[0])
    max_sep = math.radians(max_angle_sep_deg)

    clusters: list[list[tuple[float, float, Point]]] = [[tmp[0]]]
    for ang, dist, pt in tmp[1:]:
        if ang - clusters[-1][-1][0] <= max_sep:
            clusters[-1].append((ang, dist, pt))
        else:
            clusters.append([(ang, dist, pt)])

    if len(clusters) > 1:
        first_ang = clusters[0][0][0]
        last_ang = clusters[-1][-1][0]
        if (2.0 * math.pi - last_ang + first_ang) <= max_sep:
            clusters[0].extend(clusters.pop())

    # pick polygon for exterior ring
    if isinstance(poly_local, MultiPolygon):
        containing = [p for p in poly_local.geoms if p.contains(center_xy)]
        poly = containing[0] if containing else max(poly_local.geoms, key=lambda p: p.area)
    else:
        poly = poly_local

    ring: LineString = poly.exterior
    ring_len = ring.length
    if ring_len == 0:
        return []

    # Much smaller along-edge separation to hug the branch entrance
    base_arc_offset = 0.3 * branch_width_m
    base_arc_offset = min(base_arc_offset, 0.15 * ring_len)
    if base_arc_offset <= 0:
        return []

    result: list[Point] = []

    for cl in clusters:
        pts = [pt for _, _, pt in cl]

        if pts:
            bx = sum(p.x for p in pts) / len(pts)
            by = sum(p.y for p in pts) / len(pts)
            base_pt = Point(bx, by)
        else:
            sin_sum = sum(math.sin(a) for a, _, _ in cl)
            cos_sum = sum(math.cos(a) for a, _, _ in cl)
            mean_ang = math.atan2(sin_sum, cos_sum)
            if mean_ang < 0:
                mean_ang += 2.0 * math.pi
            boundary_dist = sum(d for _, d, _ in cl) / len(cl)
            ux, uy = math.cos(mean_ang), math.sin(mean_ang)
            base_pt = Point(cx + boundary_dist * ux, cy + boundary_dist * uy)

        s0 = ring.project(base_pt)
        delta_s = base_arc_offset
        if delta_s <= 0:
            result.append(base_pt)
            continue

        s_left = (s0 - delta_s) % ring_len
        s_right = (s0 + delta_s) % ring_len

        p_left = ring.interpolate(s_left)
        p_right = ring.interpolate(s_right)

        result.extend([p_left, p_right])

    return result

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


def classify_branch_side(line: LineString, center_local: Point, branch_pt: Point) -> str:
    """
    Classify a branch point as 'left' or 'right' relative to the road
    centreline direction at the intersection. Uses local (metric) coords.
    """
    if line.length == 0:
        return "unknown"
    along = line.project(center_local)
    eps = max(1.0, min(5.0, line.length * 0.05))
    s0 = max(0.0, along - eps)
    s1 = min(line.length, along + eps)
    if s1 <= s0:
        p_back = line.interpolate(max(0.0, along - eps))
        p_fwd = line.interpolate(min(line.length, along + eps))
    else:
        p_back = line.interpolate(s0)
        p_fwd = line.interpolate(s1)
    vx = p_fwd.x - p_back.x
    vy = p_fwd.y - p_back.y
    norm = math.hypot(vx, vy)
    if norm == 0:
        return "unknown"
    vx /= norm
    vy /= norm
    rx = center_local.x - branch_pt.x
    ry = center_local.y - branch_pt.y
    cross = vx * ry - vy * rx
    if abs(cross) < 1e-9:
        return "center"
    return "left" if cross > 0 else "right"


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

    # Slightly enlarge branch width/length (adds 5m to width and slice length)
    branch_width_m = road_width_m + 5.0
    branch_slice_m = slice_length_m + 5.0

    half_road_width = branch_width_m / 2.0
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

        connected_roads = set(inter.get("connected_roads") or [])

        candidate_slices = []
        nearby_roads = []  # roads that actually participate in this intersection

        for entry in local_roads:
            line: LineString = entry["line"]
            road_row = entry["row"]
            road_id = road_row.get("road_id")

            # Only consider roads that are tagged as connected (if list exists)
            if connected_roads and road_id not in connected_roads:
                continue

            # Skip roads too far from this intersection centre
            dist = center_local.distance(line)
            if dist > nearby_threshold_m:
                continue

            # Keep this as a candidate road for this intersection
            nearby_roads.append(entry)

            # Distance along the line of the projected centre
            along = line.project(center_local)

            pre = line_substring(
                line,
                max(0.0, along - branch_slice_m),
                along,
            )

            post = line_substring(
                line,
                along,
                min(line.length, along + branch_slice_m),
            )

            for which, sub in (("pre", pre), ("post", post)):
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
            print(
                f"intersection {name}: {len(candidate_slices)} slices "
                f"from {len(nearby_roads)} nearby roads"
            )

        if len(candidate_slices) < 2 or not nearby_roads:
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

        extra = branch_width_m * intersection_expand_factor
        if extra > 0:
            poly_local = poly_local.buffer(
                extra,
                join_style=2,
                cap_style=3,
                resolution=16,
            )

        poly_local = smooth_central_corners(
            poly_local,
            center_local,          # the intersection centre in local XY
            branch_width_m,
            angle_threshold_deg=150.0,
            max_center_dist_factor=1.6,
            patch_radius_factor=1.2,
            fillet_radius_factor=0.7,
        )

        # ------------------------------------------------------------------
        # Branch centres:
        #   1) find where the road centreline hits the intersection polygon
        #   2) compute the branch direction at that point
        #   3) move ±0.3 * road_width_m perpendicular to that direction
        #      → we get TWO side-centre points per road (left/right).
        #   We DO NOT keep the raw intersection point itself.
        # ------------------------------------------------------------------
        boundary_local = poly_local.boundary
        branch_points_info: list[dict] = []

        lane_offset = 0.3 * road_width_m  # 0.3 of road width

        # Use ONLY the roads that actually contributed slices here
        for entry in nearby_roads:
            line: LineString = entry["line"]
            road_row = entry["row"]
            road_id = road_row.get("road_id")

            # --- 1) Find the current "center" point on the polygon boundary ---
            inter_geom = line.intersection(boundary_local)
            if inter_geom.is_empty:
                continue

            candidate_pts: list[Point] = []

            if isinstance(inter_geom, Point):
                candidate_pts = [inter_geom]
            elif isinstance(inter_geom, MultiPoint):
                candidate_pts = list(inter_geom.geoms)
            elif isinstance(inter_geom, GeometryCollection):
                candidate_pts = [g for g in inter_geom.geoms if isinstance(g, Point)]
                if not candidate_pts:
                    for g in inter_geom.geoms:
                        if isinstance(g, LineString):
                            cs = list(g.coords)
                            if cs:
                                candidate_pts.append(Point(cs[0]))
                                candidate_pts.append(Point(cs[-1]))
            elif isinstance(inter_geom, LineString):
                cs = list(inter_geom.coords)
                if cs:
                    candidate_pts = [Point(cs[0]), Point(cs[-1])]

            if not candidate_pts:
                continue

            # choose the intersection point closest to the intersection centre
            base_pt = min(candidate_pts, key=lambda p: center_local.distance(p))

            # --- 2) Compute branch direction at that centre (tangent of the road) ---
            s_base = line.project(base_pt)
            eps = max(1.0, min(10.0, line.length * 0.05))
            s0 = max(0.0, s_base - eps)
            s1 = min(line.length, s_base + eps)

            p0 = line.interpolate(s0)
            p1 = line.interpolate(s1)

            vx = p1.x - p0.x
            vy = p1.y - p0.y
            norm = math.hypot(vx, vy)

            if norm == 0.0:
                # Fallback: use vector from intersection centre to base_pt
                vx = base_pt.x - center_local.x
                vy = base_pt.y - center_local.y
                norm = math.hypot(vx, vy)

            if norm == 0.0:
                # Completely degenerate, skip this branch
                continue

            # Normalized branch direction
            vx /= norm
            vy /= norm

            # Left-hand normal (perpendicular) to the branch direction
            nx = -vy
            ny = vx

            # --- 3) Generate ONLY left/right road-centre points ---
            cx, cy = base_pt.x, base_pt.y

            left_pt = Point(cx + nx * lane_offset, cy + ny * lane_offset)
            right_pt = Point(cx - nx * lane_offset, cy - ny * lane_offset)

            # two centres of the road, 0.3 * road_width_m to each side
            branch_points_info.append(
                {"geom": left_pt, "road_id": road_id, "side": "left"}
            )
            branch_points_info.append(
                {"geom": right_pt, "road_id": road_id, "side": "right"}
            )

        # ------------------------------------------------------------------
        # Re-assign each branch centre to the physically closest road line.
        # This fixes cases where the centre was computed from one road's
        # slice but ends up closer to the opposite approach.
        # ------------------------------------------------------------------
        if branch_points_info and nearby_roads:
            road_lines = [
                (e["row"].get("road_id"), e["line"])
                for e in nearby_roads
                if e["row"].get("road_id") is not None
            ]
            max_snap_dist = 0.75 * road_width_m  # e.g. ~22.5 m for 30 m roads

            for info in branch_points_info:
                pt = info["geom"]

                best_rid = info.get("road_id")
                best_dist = float("inf")

                for rid, ln in road_lines:
                    d = pt.distance(ln)
                    if d < best_dist:
                        best_dist = d
                        best_rid = rid

                if best_rid is not None and best_dist <= max_snap_dist:
                    info["road_id"] = best_rid

        poly_wgs84 = _to_wgs84_geom(poly_local)
        branch_centers_wgs = []
        for info in branch_points_info:
            pt_wgs = _to_wgs84_geom(info["geom"])
            branch_centers_wgs.append({
                "road_id": info.get("road_id"),
                "side": info.get("side", "unknown"),
                "geometry": mapping(pt_wgs)
            })

        out = dict(inter)
        out["nice_geometry"] = mapping(poly_wgs84)
        out["branch_centers"] = branch_centers_wgs
        result.append(out)

    if debug:
        print(f"Built {len(result)} nice intersection polygons")

    return result
