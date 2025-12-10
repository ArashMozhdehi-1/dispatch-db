import psycopg2
from psycopg2.extras import RealDictCursor
conn = psycopg2.connect(host='localhost', port=5433, database='mf_geoserver_db', user='infra_user', password='infra_password', cursor_factory=RealDictCursor)
cur = conn.cursor()

print('=== Looking for UNIN_455 ===')
cur.execute("""
    SELECT DISTINCT 
        road_marker_metadata->>'road_id' as road_id,
        road_marker_metadata->>'road_name' as road_name,
        COALESCE(road_marker_metadata->>'overlapping_entity_name', road_marker_metadata->>'best_overlap_entity') as intersection
    FROM map_location 
    WHERE type = 'road_corner_side_center'
    AND (road_marker_metadata->>'road_name' LIKE '%UNIN_455%' 
         OR road_marker_metadata->>'overlapping_entity_name' = 'UNIN_455'
         OR road_marker_metadata->>'best_overlap_entity' = 'UNIN_455')
""")
for r in cur.fetchall():
    print(f'  {r}')

print('\n=== Looking for INT_11 ===')
cur.execute("""
    SELECT DISTINCT 
        road_marker_metadata->>'road_id' as road_id,
        road_marker_metadata->>'road_name' as road_name,
        COALESCE(road_marker_metadata->>'overlapping_entity_name', road_marker_metadata->>'best_overlap_entity') as intersection
    FROM map_location 
    WHERE type = 'road_corner_side_center'
    AND (road_marker_metadata->>'road_name' LIKE '%INT_11%' 
         OR road_marker_metadata->>'overlapping_entity_name' = 'INT_11'
         OR road_marker_metadata->>'best_overlap_entity' = 'INT_11')
""")
for r in cur.fetchall():
    print(f'  {r}')

conn.close()
