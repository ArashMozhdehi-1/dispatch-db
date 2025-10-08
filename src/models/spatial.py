import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import transform
import pyproj
from typing import List, Tuple, Optional, Dict, Any, Union
from dataclasses import dataclass
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing as mp

from config import config
from src.core import get_logger, get_performance_logger

logger = get_logger(__name__)
perf_logger = get_performance_logger(__name__)


@dataclass
class SpatialResult:
    geometry: Any
    properties: Dict[str, Any]
    processing_time: float
    success: bool
    error: Optional[str] = None


@dataclass
class CurveSegment:
    start_point: Tuple[float, float]
    end_point: Tuple[float, float]
    control_points: List[Tuple[float, float]]
    length: float
    curvature: float
    radius_of_curvature: float
    segment_type: str


class SpatialProcessor:
    def __init__(self):
        self.config = config.spatial
        from .sampling import SamplingConfig, SamplingManager

        sampling_config = SamplingConfig(
            min_points=self.config.min_points_per_segment,
            max_points=self.config.max_points_per_segment,
            adaptive=self.config.adaptive_sampling,
        )
        self.sampling_manager = SamplingManager(sampling_config)

    def transform_coordinates(self, x: float, y: float) -> Tuple[float, float]:
        try:
            from .coordinate_transform import transform_coordinates

            return transform_coordinates(x, y)
        except Exception as e:
            
            raise

    def transform_coordinates_batch(
        self, coordinates: List[Tuple[float, float]]
    ) -> List[Tuple[float, float]]:
        try:
            from .coordinate_transform import transform_coordinates_batch

            return transform_coordinates_batch(coordinates)
        except Exception as e:
            
            raise

    def create_bezier_curve(
        self,
        start_point: Tuple[float, float],
        end_point: Tuple[float, float],
        control_points: Optional[List[Tuple[float, float]]] = None,
    ) -> List[CurveSegment]:
        start_time = time.time()

        try:
            start = np.array(start_point)
            end = np.array(end_point)

            if control_points is None or len(control_points) == 0:
                direction = end - start
                distance = np.linalg.norm(direction)

                if distance < 1:
                    return [
                        CurveSegment(
                            start_point=start_point,
                            end_point=end_point,
                            control_points=[],
                            length=distance,
                            curvature=0.0,
                            radius_of_curvature=float("inf"),
                            segment_type="straight",
                        )
                    ]

                cp1 = start + direction * 0.33
                cp2 = start + direction * 0.67

                return [
                    CurveSegment(
                        start_point=start_point,
                        end_point=end_point,
                        control_points=[tuple(cp1), tuple(cp2)],
                        length=distance,
                        curvature=0.0,
                        radius_of_curvature=float("inf"),
                        segment_type="straight",
                    )
                ]

            control_points = [np.array(cp) for cp in control_points]
            main_direction = end - start
            main_distance = np.linalg.norm(main_direction)

            if main_distance < 1:
                return [
                    CurveSegment(
                        start_point=start_point,
                        end_point=end_point,
                        control_points=[],
                        length=main_distance,
                        curvature=0.0,
                        radius_of_curvature=float("inf"),
                        segment_type="straight",
                    )
                ]

            if len(control_points) >= 1:
                to_control = control_points[0] - start
                cp1 = start + to_control * 0.5
            else:
                cp1 = start + main_direction * 0.33

            if len(control_points) >= 1:
                to_control = control_points[-1] - end
                cp2 = end + to_control * 0.5
            else:
                cp2 = start + main_direction * 0.67

            curve_length = self._calculate_bezier_length(start, cp1, cp2, end)
            curvature = self._calculate_curve_curvature(start, cp1, cp2, end)
            radius = 1.0 / curvature if curvature > 1e-10 else float("inf")
            segment_type = "curved" if curvature > 1e-6 else "straight"

            return [
                CurveSegment(
                    start_point=start_point,
                    end_point=end_point,
                    control_points=[tuple(cp1), tuple(cp2)],
                    length=curve_length,
                    curvature=curvature,
                    radius_of_curvature=radius,
                    segment_type=segment_type,
                )
            ]

        except Exception as e:
            
            raise

    def _calculate_bezier_length(
        self,
        P0: np.ndarray,
        P1: np.ndarray,
        P2: np.ndarray,
        P3: np.ndarray,
        num_samples: int = 100,
    ) -> float:
        t_values = np.linspace(0, 1, num_samples)
        points = []

        for t in t_values:
            point = (
                (1 - t) ** 3 * P0
                + 3 * (1 - t) ** 2 * t * P1
                + 3 * (1 - t) * t**2 * P2
                + t**3 * P3
            )
            points.append(point)

        points = np.array(points)
        distances = np.sqrt(np.sum(np.diff(points, axis=0) ** 2, axis=1))
        return np.sum(distances)

    def _calculate_curve_curvature(
        self,
        P0: np.ndarray,
        P1: np.ndarray,
        P2: np.ndarray,
        P3: np.ndarray,
        t: float = 0.5,
    ) -> float:
        dP = (
            3 * (1 - t) ** 2 * (P1 - P0)
            + 6 * (1 - t) * t * (P2 - P1)
            + 3 * t**2 * (P3 - P2)
        )
        ddP = 6 * (1 - t) * (P2 - 2 * P1 + P0) + 6 * t * (P3 - 2 * P2 + P1)
        cross_product = dP[0] * ddP[1] - dP[1] * ddP[0]
        dP_magnitude = np.linalg.norm(dP)

        if dP_magnitude < 1e-10:
            return 0

        return abs(cross_product) / (dP_magnitude**3)

    def sample_curve_curvature_based(
        self, segments: List[CurveSegment]
    ) -> List[Tuple[float, float]]:

        start_time = time.time()
        all_points = []

        try:
            for segment in segments:
                P0 = np.array(segment.start_point)
                P1, P2 = np.array(segment.control_points[0]), np.array(
                    segment.control_points[1]
                )
                P3 = np.array(segment.end_point)

                all_points.append(segment.start_point)

                t = 0.0
                while t < 1.0:
                    R = segment.radius_of_curvature

                    # Use target segment length for spacing
                    max_spacing = self.config.target_segment_length

                    current_point = (
                        (1 - t) ** 3 * P0
                        + 3 * (1 - t) ** 2 * t * P1
                        + 3 * (1 - t) * t**2 * P2
                        + t**3 * P3
                    )

                    dt = 0.01
                    next_t = t + dt

                    while next_t <= 1.0:
                        next_point = (
                            (1 - next_t) ** 3 * P0
                            + 3 * (1 - next_t) ** 2 * next_t * P1
                            + 3 * (1 - next_t) * next_t**2 * P2
                            + next_t**3 * P3
                        )
                        distance = np.linalg.norm(next_point - current_point)

                        if distance >= max_spacing:
                            all_points.append(tuple(next_point))
                            t = next_t
                            break
                        next_t += dt

                    if next_t > 1.0:
                        break

                if (
                    len(all_points) == 0
                    or np.linalg.norm(np.array(all_points[-1]) - P3) > 1e-6
                ):
                    all_points.append(segment.end_point)

            processing_time = time.time() - start_time
            
            print(
                f"Curve sampling completed: {len(all_points)} points in {processing_time:.3f}s"
            )

            return all_points

        except Exception as e:
            
            raise

    def create_lane_segments(
        self,
        curve_points: List[Tuple[float, float]],
        road_id: int,
        total_distance: float = None,
    ) -> List[Dict[str, Any]]:
        start_time = time.time()
        segments = []
        target_length = self.config.target_segment_length

        try:
            if len(curve_points) < 2:
                return []

            if total_distance is None:
                total_distance = 0
                for i in range(len(curve_points) - 1):
                    dist = np.linalg.norm(
                        np.array(curve_points[i + 1]) - np.array(curve_points[i])
                    )
                    total_distance += dist

            if total_distance <= self.config.max_segment_length:
                sampled_points = self._sample_curve_points(curve_points, num_points=25)
                line_geom = LineString(sampled_points)

                segment = {
                    "road_id": road_id,
                    "lane_id": f"{road_id}_0_forward",
                    "start_utm_x": curve_points[0][0],
                    "start_utm_y": curve_points[0][1],
                    "end_utm_x": curve_points[-1][0],
                    "end_utm_y": curve_points[-1][1],
                    "length_m": total_distance,
                    "geometry": line_geom,
                    "lane_width_m": 3.5,
                    "num_points": len(sampled_points),
                }
                segments.append(segment)
                return segments

            num_segments = max(1, int(np.ceil(total_distance / target_length)))
            segment_length = total_distance / num_segments

            cumulative_distances = [0]
            for i in range(len(curve_points) - 1):
                dist = np.linalg.norm(
                    np.array(curve_points[i + 1]) - np.array(curve_points[i])
                )
                cumulative_distances.append(cumulative_distances[-1] + dist)

            for seg_idx in range(num_segments):
                start_distance = seg_idx * segment_length
                end_distance = min((seg_idx + 1) * segment_length, total_distance)

                start_point = self._interpolate_point_at_distance(
                    curve_points, cumulative_distances, start_distance
                )
                end_point = self._interpolate_point_at_distance(
                    curve_points, cumulative_distances, end_distance
                )

                segment_curve_points = self._extract_segment_curve(
                    curve_points, cumulative_distances, start_distance, end_distance
                )
                sampled_segment_points = self._sample_curve_points(segment_curve_points, num_points=25)
                
                actual_length = end_distance - start_distance
                line_geom = LineString(sampled_segment_points)

                segment = {
                    "road_id": road_id,
                    "lane_id": f"{road_id}_{seg_idx}_forward",
                    "start_utm_x": start_point[0],
                    "start_utm_y": start_point[1],
                    "end_utm_x": end_point[0],
                    "end_utm_y": end_point[1],
                    "length_m": actual_length,
                    "geometry": line_geom,
                    "lane_width_m": 3.5,
                    "num_points": len(sampled_segment_points),
                }
                segments.append(segment)

            processing_time = time.time() - start_time
            
            print(
                f"Created {len(segments)} lane segments for road {road_id} (total length: {total_distance:.1f}m) in {processing_time:.3f}s"
            )

            return segments

        except Exception as e:
            
            raise

    def _interpolate_point_at_distance(
        self,
        curve_points: List[Tuple[float, float]],
        cumulative_distances: List[float],
        target_distance: float,
    ) -> Tuple[float, float]:
        """Interpolate a point at a specific distance along the curve."""
        if target_distance <= 0:
            return curve_points[0]
        if target_distance >= cumulative_distances[-1]:
            return curve_points[-1]

        for i in range(len(cumulative_distances) - 1):
            if (
                cumulative_distances[i]
                <= target_distance
                <= cumulative_distances[i + 1]
            ):
                segment_start_dist = cumulative_distances[i]
                segment_end_dist = cumulative_distances[i + 1]
                segment_length = segment_end_dist - segment_start_dist

                if segment_length == 0:
                    return curve_points[i]

                t = (target_distance - segment_start_dist) / segment_length

                start_point = np.array(curve_points[i])
                end_point = np.array(curve_points[i + 1])
                interpolated_point = start_point + t * (end_point - start_point)

                return (float(interpolated_point[0]), float(interpolated_point[1]))

        return curve_points[-1]

    def _sample_curve_points(self, curve_points: List[Tuple[float, float]], num_points: int = 25) -> List[Tuple[float, float]]:
        """Sample points along a curve for better visualization"""
        if len(curve_points) <= 2:
            return curve_points
        
        total_distance = 0
        for i in range(len(curve_points) - 1):
            dist = np.linalg.norm(
                np.array(curve_points[i + 1]) - np.array(curve_points[i])
            )
            total_distance += dist
        
        sampled_points = []
        for i in range(num_points):
            t = i / (num_points - 1) if num_points > 1 else 0
            target_distance = t * total_distance
            
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
                sampled_points.append(curve_points[-1])
        
        return sampled_points

    def _extract_segment_curve(
        self, 
        curve_points: List[Tuple[float, float]], 
        cumulative_distances: List[float], 
        start_distance: float, 
        end_distance: float
    ) -> List[Tuple[float, float]]:
        """Extract curve points for a specific segment"""
        segment_points = []
        
        start_point = self._interpolate_point_at_distance(
            curve_points, cumulative_distances, start_distance
        )
        segment_points.append(start_point)
        
        for i, (point, cum_dist) in enumerate(zip(curve_points, cumulative_distances)):
            if start_distance < cum_dist < end_distance:
                segment_points.append(point)
        
        end_point = self._interpolate_point_at_distance(
            curve_points, cumulative_distances, end_distance
        )
        segment_points.append(end_point)
        
        return segment_points

    def process_roads_parallel(
        self, roads_data: List[Dict[str, Any]], max_workers: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        if max_workers is None:
            max_workers = min(config.processing.max_workers, mp.cpu_count())

        all_segments = []

        try:
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_road = {
                    executor.submit(self._process_single_road, road): road
                    for road in roads_data
                }

                for future in as_completed(future_to_road):
                    road = future_to_road[future]
                    try:
                        segments = future.result()
                        all_segments.extend(segments)
                        
                        print(
                            f"Processed road {road.get('Id', 'unknown')}: {len(segments)} segments"
                        )
                    except Exception as e:
                        
                        print(
                            f"Failed to process road {road.get('Id', 'unknown')}: {e}"
                        )

            print(
                f"Parallel processing completed: {len(all_segments)} total segments"
            )
            return all_segments

        except Exception as e:
            
            raise

    def _process_single_road(self, road: Dict[str, Any]) -> List[Dict[str, Any]]:
        try:
            road_id = road["Id"]
            start_xy = (road["StartX"], road["StartY"])
            end_xy = (road["EndX"], road["EndY"])
            control_points = road.get("control_points", None)
            segments = self.create_bezier_curve(start_xy, end_xy, control_points)
            curve_points = self.sample_curve_curvature_based(segments)
            lane_segments = self.create_lane_segments(curve_points, road_id, total_distance=None)
            return lane_segments

        except Exception as e:
            
            return []


spatial_processor = SpatialProcessor()
