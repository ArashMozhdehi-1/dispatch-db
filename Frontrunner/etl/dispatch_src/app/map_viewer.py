#!/usr/bin/env python3
"""
Web-based map viewer to display Bézier curve roads and locations
Fetches all data from GraphQL API backend
"""
import sys
import json
import requests
from pathlib import Path
from flask import Flask, render_template, jsonify

app = Flask(__name__)

# GraphQL API endpoint
GRAPHQL_URL = "http://dispatch_graphql:3000/api/graphql"

def query_graphql(query, variables=None):
    """Make a GraphQL query to the backend API"""
    try:
        response = requests.post(
            GRAPHQL_URL,
            json={"query": query, "variables": variables or {}},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        if "errors" in data:
            print(f"GraphQL errors: {data['errors']}")
            return None
            
        return data.get("data")
    except Exception as e:
        print(f"GraphQL query failed: {e}")
        return None

def get_locations_data():
    """Get all locations from GraphQL API"""
    query = """
    query {
        locations {
            location_id
            location_name
            latitude
            longitude
            unit_type
            pit_name
            region_name
            elevation_m
            location_category
        }
    }
    """
    
    data = query_graphql(query)
    if not data or not data.get("locations"):
        return []
    
    # Transform the data to match the expected format and filter out invalid coordinates
    locations = []
    for loc in data["locations"]:
        lat = loc["latitude"]
        lon = loc["longitude"]
            
        locations.append({
            "location_id": loc["location_id"],
            "location_name": loc["location_name"],
            "pit_name": loc.get("pit_name"),
            "region_name": loc.get("region_name"),
            "latitude": lat,
            "longitude": lon,
            "elevation_m": loc.get("elevation_m"),
            "shoptype": None,  # Not available in GraphQL schema
            "gpstype": None,   # Not available in GraphQL schema
            "unit_type": loc.get("unit_type"),
            "location_category": loc.get("location_category", "infrastructure")
        })
    
    return locations

def get_lane_segments_data():
    """Get all lane segments from GraphQL API"""
    query = """
    query {
        segments {
            lane_id
            road_id
            geometry
            length_m
            time_empty_seconds
            time_loaded_seconds
            is_closed
            direction
        }
    }
    """
    
    data = query_graphql(query)
    if not data or not data.get("segments"):
        return {"type": "FeatureCollection", "features": []}
    
    # Convert to GeoJSON format
    features = []
    for segment in data["segments"]:
        if segment.get("geometry"):
            try:
                # Parse the geometry if it's a string
                if isinstance(segment["geometry"], str):
                    geometry = json.loads(segment["geometry"])
                else:
                    geometry = segment["geometry"]
                
                feature = {
                    "type": "Feature",
                    "properties": {
                        "lane_id": segment["lane_id"],
                        "road_id": segment["road_id"],
                        "lane_name": None,  # Not available in GraphQL schema
                        "length_m": float(segment.get("length_m", 0)),
                        "time_empty_seconds": float(segment.get("time_empty_seconds", 0)),
                        "time_loaded_seconds": float(segment.get("time_loaded_seconds", 0)),
                        "is_closed": segment.get("is_closed", False),
                        "direction": segment.get("direction", "unknown")
                    },
                    "geometry": geometry
                }
                features.append(feature)
            except (json.JSONDecodeError, ValueError) as e:
                print(f"Error parsing geometry for segment {segment.get('lane_id')}: {e}")
                continue
    
    return {
        "type": "FeatureCollection",
        "features": features
    }

@app.route('/')
def index():
    """Main map page"""
    return render_template('map.html')

@app.route('/api/locations')
def api_locations():
    """API endpoint for locations data"""
    try:
        locations = get_locations_data()
        return jsonify(locations)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/segments')
def api_segments():
    """API endpoint for lane segments data"""
    try:
        segments = get_lane_segments_data()
        return jsonify(segments)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)