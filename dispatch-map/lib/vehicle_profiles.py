#!/usr/bin/env python3
"""
Vehicle profiles for path planning.
Defines physical dimensions and turning constraints for different vehicle types.
"""

import math
from dataclasses import dataclass
from typing import Dict


@dataclass
class VehicleProfile:
    """
    Vehicle dimensions and constraints for path planning.
    """
    name: str
    vehicle_width_m: float
    wheelbase_m: float
    max_steering_angle_deg: float
    side_buffer_m: float = 0.5
    front_buffer_m: float = 1.0
    rear_buffer_m: float = 1.0

    @property
    def min_turn_radius_m(self) -> float:
        """
        Calculate minimum turning radius based on wheelbase and max steering angle.
        Uses bicycle model: R = L / tan(δ_max)
        """
        return self.wheelbase_m / math.tan(math.radians(self.max_steering_angle_deg))

    @property
    def total_width_with_buffer_m(self) -> float:
        """Total width including side buffers on both sides."""
        return self.vehicle_width_m + (2 * self.side_buffer_m)

    def to_dict(self) -> Dict:
        """Convert to dictionary for API responses."""
        return {
            "name": self.name,
            "vehicle_width_m": self.vehicle_width_m,
            "wheelbase_m": self.wheelbase_m,
            "max_steering_angle_deg": self.max_steering_angle_deg,
            "side_buffer_m": self.side_buffer_m,
            "front_buffer_m": self.front_buffer_m,
            "rear_buffer_m": self.rear_buffer_m,
            "min_turn_radius_m": self.min_turn_radius_m,
            "total_width_with_buffer_m": self.total_width_with_buffer_m
        }


# Pre-defined vehicle profiles
# Komatsu 830E-AC specifications (verified):
# - Overall width: 7.3 m
# - Wheelbase: 6.35 m
# - Max steering angle: ~32° (calculated from turning radius specs)
# - Turning circle diameter: ~29 m (giving minimum radius of ~14.5m outside, ~10m centerline)
KOMATSU_830E = VehicleProfile(
    name="Komatsu 830E",
    vehicle_width_m=7.3,      # Official spec
    wheelbase_m=6.35,         # Official spec
    max_steering_angle_deg=32.0,  # Calculated from turning performance
    side_buffer_m=0.5,
    front_buffer_m=1.0,
    rear_buffer_m=1.0
)

# Registry of available profiles
VEHICLE_PROFILES: Dict[str, VehicleProfile] = {
    "komatsu_830e": KOMATSU_830E,
}


def get_vehicle_profile(profile_id: str) -> VehicleProfile:
    """
    Get a vehicle profile by ID.

    Args:
        profile_id: Profile identifier (e.g., "komatsu_830e")

    Returns:
        VehicleProfile instance

    Raises:
        KeyError: If profile_id is not found
    """
    if profile_id not in VEHICLE_PROFILES:
        raise KeyError(f"Unknown vehicle profile: {profile_id}. Available: {list(VEHICLE_PROFILES.keys())}")
    return VEHICLE_PROFILES[profile_id]


def list_vehicle_profiles() -> Dict[str, Dict]:
    """List all available vehicle profiles."""
    return {
        profile_id: profile.to_dict()
        for profile_id, profile in VEHICLE_PROFILES.items()
    }


