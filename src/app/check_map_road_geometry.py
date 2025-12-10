#!/usr/bin/env python3
"""
Check the geometry type of roads in the map_road table.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Database connection
conn = psycopg2.connect(
    host=os.getenv('MAP_DUMP_DB_HOST', 'postgres'),
    port=int(os.getenv('MAP_DUMP_DB_PORT', '5432')),
    database=os.getenv('MAP_DUMP_DB_NAME', 'mf_geoserver_db'),
    user=os.getenv('MAP_DUMP_DB_USER', os.getenv('POSTGRES_USER', 'infra_user')),
    password=os.getenv('MAP_DUMP_DB_PASSWORD', os.getenv('POSTGRES_PASSWORD', 'infra_password'))
)

cursor = conn.cursor(cursor_factory=RealDictCursor)

# Check geometry types
cursor.execute("""
    SELECT 
        _oid_,
        from_location_name,
        to_location_name,
        ST_GeometryType(geometry_wkt) AS geom_type,
        ST_AsText(ST_Envelope(geometry_wkt)) AS bbox
    FROM map_road
    LIMIT 5;
""")

print("Sample roads from map_road table:")
print("=" * 80)
for row in cursor.fetchall():
    print(f"Road: {row['from_location_name']} -> {row['to_location_name']}")
    print(f"  OID: {row['_oid_']}")
    print(f"  Geometry Type: {row['geom_type']}")
    print(f"  BBox: {row['bbox']}")
    print()

cursor.close()
conn.close()
