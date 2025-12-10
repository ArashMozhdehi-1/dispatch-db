#!/usr/bin/env python3
import math
from typing import List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


class SegmentType(Enum):
    """Dubins path segment types."""
    LEFT = "L"
    RIGHT = "R"
    STRAIGHT = "S"


@dataclass
class Pose:
    """2D pose: position (x, y) and heading θ."""
    x: float
    y: float
    theta: float  # radians

    def __iter__(self):
        """Allow unpacking: x, y, theta = pose"""
        return iter((self.x, self.y, self.theta))


@dataclass
class DubinsSegment:
    """A segment of a Dubins path."""
    type: SegmentType
    length: float  # arc length for turns (radians * radius), distance for straight
    param: float   # radians for arcs, meters for straight


@dataclass
class DubinsPath:
    """Complete Dubins path solution."""
    segments: List[DubinsSegment]
    total_length: float
    path_type: str  # e.g., "LSL", "RSR", "LSR", etc.


def normalize_angle(angle: float) -> float:
    """Normalize angle to [-π, π]."""
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle


def mod2pi(angle: float) -> float:
    """Normalize angle to [0, 2π]."""
    return angle % (2 * math.pi)


def dubins_LSL(alpha: float, beta: float, d: float) -> Optional[Tuple[float, float, float]]:
    """Left-Straight-Left path."""
    sa = math.sin(alpha)
    ca = math.cos(alpha)
    sb = math.sin(beta)
    cb = math.cos(beta)
    
    tmp = 2.0 + d * d - 2.0 * (ca * cb + sa * sb - d * (sa - sb))
    
    if tmp < 0:
        return None
    
    p = math.sqrt(tmp)
    tmp2 = math.atan2((cb - ca), d + sa - sb)
    t = normalize_angle(-alpha + tmp2)
    q = normalize_angle(beta - tmp2)
    
    return t, p, q


def dubins_RSR(alpha: float, beta: float, d: float) -> Optional[Tuple[float, float, float]]:
    """Right-Straight-Right path."""
    sa = math.sin(alpha)
    ca = math.cos(alpha)
    sb = math.sin(beta)
    cb = math.cos(beta)
    
    tmp = 2.0 + d * d - 2.0 * (ca * cb + sa * sb - d * (sb - sa))
    
    if tmp < 0:
        return None
    
    p = math.sqrt(tmp)
    tmp2 = math.atan2((ca - cb), d - sa + sb)
    t = normalize_angle(alpha - tmp2)
    q = normalize_angle(-beta + tmp2)
    
    return t, p, q


def dubins_LSR(alpha: float, beta: float, d: float) -> Optional[Tuple[float, float, float]]:
    """Left-Straight-Right path."""
    sa = math.sin(alpha)
    ca = math.cos(alpha)
    sb = math.sin(beta)
    cb = math.cos(beta)
    
    tmp = -2.0 + d * d + 2.0 * (ca * cb + sa * sb + d * (sa + sb))
    
    if tmp < 0:
        return None
    
    p = math.sqrt(tmp)
    tmp2 = math.atan2((-ca - cb), d + sa + sb) - math.atan2(-2.0, p)
    t = normalize_angle(-alpha + tmp2)
    q = normalize_angle(-beta + tmp2)
    
    return t, p, q


def dubins_RSL(alpha: float, beta: float, d: float) -> Optional[Tuple[float, float, float]]:
    """Right-Straight-Left path."""
    sa = math.sin(alpha)
    ca = math.cos(alpha)
    sb = math.sin(beta)
    cb = math.cos(beta)
    
    tmp = -2.0 + d * d + 2.0 * (ca * cb + sa * sb - d * (sa + sb))
    
    if tmp < 0:
        return None
    
    p = math.sqrt(tmp)
    tmp2 = math.atan2((ca + cb), d - sa - sb) - math.atan2(2.0, p)
    t = normalize_angle(alpha - tmp2)
    q = normalize_angle(beta - tmp2)
    
    return t, p, q


def dubins_RLR(alpha: float, beta: float, d: float) -> Optional[Tuple[float, float, float]]:
    """Right-Left-Right path."""
    sa = math.sin(alpha)
    ca = math.cos(alpha)
    sb = math.sin(beta)
    cb = math.cos(beta)
    
    tmp = (6.0 - d * d + 2.0 * (ca * cb + sa * sb + d * (sa - sb))) / 8.0
    
    if abs(tmp) > 1.0:
        return None
    
    p = mod2pi(2 * math.pi - math.acos(tmp))
    tmp2 = math.atan2((ca - cb), d - sa + sb)
    t = normalize_angle(alpha - tmp2 + mod2pi(p / 2.0))
    q = normalize_angle(alpha - beta - t + mod2pi(p))
    
    return t, p, q


def dubins_LRL(alpha: float, beta: float, d: float) -> Optional[Tuple[float, float, float]]:
    """Left-Right-Left path."""
    sa = math.sin(alpha)
    ca = math.cos(alpha)
    sb = math.sin(beta)
    cb = math.cos(beta)
    
    tmp = (6.0 - d * d + 2.0 * (ca * cb + sa * sb - d * (sa - sb))) / 8.0
    
    if abs(tmp) > 1.0:
        return None
    
    p = mod2pi(2 * math.pi - math.acos(tmp))
    tmp2 = math.atan2((-ca + cb), d + sa - sb)
    t = normalize_angle(-alpha + tmp2 + mod2pi(p / 2.0))
    q = normalize_angle(beta - alpha - t + mod2pi(p))
    
    return t, p, q


def compute_dubins_path(start: Pose, goal: Pose, turning_radius: float) -> DubinsPath:
    """
    Compute the shortest Dubins path between two poses.
    
    Args:
        start: Starting pose (x, y, theta)
        goal: Goal pose (x, y, theta)
        turning_radius: Minimum turning radius (meters)
    
    Returns:
        DubinsPath with segments and total length
    """
    # Normalize problem to unit turning radius
    dx = goal.x - start.x
    dy = goal.y - start.y
    
    # Rotate to start frame
    cos_start = math.cos(start.theta)
    sin_start = math.sin(start.theta)
    
    dx_rot = dx * cos_start + dy * sin_start
    dy_rot = -dx * sin_start + dy * cos_start
    
    d = math.sqrt(dx_rot**2 + dy_rot**2) / turning_radius
    alpha = 0.0
    beta = normalize_angle(goal.theta - start.theta)
    
    # Try all 6 Dubins path types
    path_functions = [
        ("LSL", dubins_LSL, [SegmentType.LEFT, SegmentType.STRAIGHT, SegmentType.LEFT]),
        ("RSR", dubins_RSR, [SegmentType.RIGHT, SegmentType.STRAIGHT, SegmentType.RIGHT]),
        ("LSR", dubins_LSR, [SegmentType.LEFT, SegmentType.STRAIGHT, SegmentType.RIGHT]),
        ("RSL", dubins_RSL, [SegmentType.RIGHT, SegmentType.STRAIGHT, SegmentType.LEFT]),
        ("RLR", dubins_RLR, [SegmentType.RIGHT, SegmentType.LEFT, SegmentType.RIGHT]),
        ("LRL", dubins_LRL, [SegmentType.LEFT, SegmentType.RIGHT, SegmentType.LEFT]),
    ]
    
    best_path = None
    best_length = float('inf')
    best_type = None
    
    for path_type, path_func, segment_types in path_functions:
        result = path_func(alpha, beta, d)
        if result is None:
            continue
        
        t, p, q = result
        length = abs(t) + abs(p) + abs(q)
        
        if length < best_length:
            best_length = length
            best_path = (t, p, q)
            best_type = (path_type, segment_types)
    
    if best_path is None:
        # Fallback: straight line (shouldn't happen with valid inputs)
        straight_dist = math.sqrt(dx**2 + dy**2)
        return DubinsPath(
            segments=[DubinsSegment(SegmentType.STRAIGHT, straight_dist, straight_dist / turning_radius)],
            total_length=straight_dist,
            path_type="STRAIGHT"
        )
    
    # Scale back to actual turning radius
    t, p, q = best_path
    path_type, segment_types = best_type
    
    segments = []
    params = [t, p, q]
    
    for seg_type, param in zip(segment_types, params):
        if seg_type == SegmentType.STRAIGHT:
            length = param * turning_radius
            segments.append(DubinsSegment(seg_type, length, param))
        else:  # LEFT or RIGHT
            length = abs(param) * turning_radius
            segments.append(DubinsSegment(seg_type, length, param))
    
    total_length = sum(seg.length for seg in segments)
    
    return DubinsPath(
        segments=segments,
        total_length=total_length,
        path_type=path_type
    )


def sample_dubins_path(
    path: DubinsPath,
    start: Pose,
    turning_radius: float,
    step_size: float = 1.0,
) -> List[Tuple[float, float]]:
    """
    Sample a Dubins path into a polyline.

    Args:
        path: DubinsPath to sample
        start: Starting pose
        turning_radius: Turning radius used for the path
        step_size: Distance between samples (meters)

    Returns:
        List of (x, y) points
    """
    points = [(start.x, start.y)]

    current_x = start.x
    current_y = start.y
    current_theta = start.theta

    for segment in path.segments:
        # Number of samples for this segment
        num_samples = max(2, int(segment.length / step_size)) if step_size > 0 else 2
        seg_step = segment.length / num_samples

        if segment.type == SegmentType.STRAIGHT:
            for i in range(1, num_samples + 1):
                dist = i * seg_step
                x = current_x + dist * math.cos(current_theta)
                y = current_y + dist * math.sin(current_theta)
                points.append((x, y))

            # Move pose to end of straight segment
            current_x += segment.length * math.cos(current_theta)
            current_y += segment.length * math.sin(current_theta)

        else:  # LEFT or RIGHT turn
            direction = 1.0 if segment.type == SegmentType.LEFT else -1.0

            # Center of turning circle
            cx = current_x - direction * turning_radius * math.sin(current_theta)
            cy = current_y + direction * turning_radius * math.cos(current_theta)

            # Sample along the arc
            angle_start = math.atan2(current_y - cy, current_x - cx)
            total_angle = segment.param  # signed

            for i in range(1, num_samples + 1):
                angle = angle_start + (i / num_samples) * total_angle
                x = cx + turning_radius * math.cos(angle)
                y = cy + turning_radius * math.sin(angle)
                points.append((x, y))

            # Move pose to end of arc
            current_theta = normalize_angle(current_theta + total_angle)
            current_x = cx + turning_radius * math.cos(angle_start + total_angle)
            current_y = cy + turning_radius * math.sin(angle_start + total_angle)

    return points


