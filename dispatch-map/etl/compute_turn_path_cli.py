#!/usr/bin/env python3
"""
CLI tool for computing turning paths between roads at intersections.
Called by the Next.js API via subprocess.
"""

import sys
import json
import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Add lib directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from lib.vehicle_profiles import get_vehicle_profile, VehicleProfile, list_vehicle_profiles
from lib.turn_path_api import compute_turn_path


def get_db_connection():
    """Create database connection using environment variables."""
    return psycopg2.connect(
        host=os.getenv('MAP_DUMP_DB_HOST', os.getenv('POSTGRES_HOST', 'postgres')),
        port=int(os.getenv('MAP_DUMP_DB_PORT', os.getenv('POSTGRES_PORT', 5432))),
        database=os.getenv('MAP_DUMP_DB_NAME', os.getenv('POSTGRES_DB', 'dispatch_db')),
        user=os.getenv('MAP_DUMP_DB_USER', os.getenv('POSTGRES_USER', 'dispatch_user')),
        password=os.getenv('MAP_DUMP_DB_PASSWORD', os.getenv('POSTGRES_PASSWORD', 'dispatch_password')),
        cursor_factory=RealDictCursor
    )


def main():
    """Main CLI entry point."""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Missing command",
            "usage": "python compute_turn_path_cli.py <command> [args...]",
            "commands": {
                "list-profiles": "List available vehicle profiles",
                "compute": "Compute turning path (requires JSON input on stdin)"
            }
        }))
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == "list-profiles":
            # List available vehicle profiles
            profiles = list_vehicle_profiles()
            print(json.dumps({
                "status": "ok",
                "profiles": profiles
            }, indent=2))
            sys.exit(0)
        
        elif command == "compute":
            # Read JSON input from stdin
            input_data = json.loads(sys.stdin.read())
            
            from_road_id = input_data.get('from_road_id')
            to_road_id = input_data.get('to_road_id')
            intersection_name = input_data.get('intersection_name')
            from_marker_oid = input_data.get('from_marker_oid')
            to_marker_oid = input_data.get('to_marker_oid')
            
            if not all([from_road_id, to_road_id, intersection_name]):
                print(json.dumps({
                    "status": "error",
                    "error": "Missing required fields: from_road_id, to_road_id, intersection_name"
                }))
                sys.exit(1)
            
            # Get vehicle profile
            if 'custom_vehicle_profile' in input_data and input_data['custom_vehicle_profile']:
                # Custom profile
                custom = input_data['custom_vehicle_profile']
                vehicle = VehicleProfile(
                    name=custom.get('name', 'Custom'),
                    vehicle_width_m=float(custom['vehicle_width_m']),
                    wheelbase_m=float(custom['wheelbase_m']),
                    max_steering_angle_deg=float(custom['max_steering_angle_deg']),
                    side_buffer_m=float(custom.get('side_buffer_m', 0.5)),
                    front_buffer_m=float(custom.get('front_buffer_m', 1.0)),
                    rear_buffer_m=float(custom.get('rear_buffer_m', 1.0))
                )
            else:
                # Use pre-defined profile
                profile_id = input_data.get('vehicle_profile_id', 'komatsu_830e')
                vehicle = get_vehicle_profile(profile_id)
            
            # Get other parameters
            local_srid = input_data.get('local_srid', 28350)
            sampling_step_m = input_data.get('sampling_step_m', 1.0)
            
            # Connect to database and compute path
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                result = compute_turn_path(
                    cursor,
                    from_road_id,
                    to_road_id,
                    intersection_name,
                    vehicle,
                    local_srid,
                    sampling_step_m,
                    from_marker_oid=from_marker_oid,
                    to_marker_oid=to_marker_oid
                )
                print(json.dumps(result, indent=2))
                sys.exit(0 if result.get('status') == 'ok' else 1)
            finally:
                conn.close()
        
        else:
            print(json.dumps({
                "error": f"Unknown command: {command}",
                "available_commands": ["list-profiles", "compute"]
            }))
            sys.exit(1)
    
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "error": str(e),
            "type": type(e).__name__
        }))
        sys.exit(1)


if __name__ == '__main__':
    main()


