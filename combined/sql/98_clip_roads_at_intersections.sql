-- Clip roads to remove portions that overlap with intersection polygons
-- This ensures roads don't extend into intersection areas

-- First, create a temporary table with all intersection geometries (NO buffer, exact like Python)
DROP TABLE IF EXISTS temp_intersection_areas;
CREATE TEMP TABLE temp_intersection_areas AS
SELECT 
    intersection_id,
    geometry
FROM combined_data.intersections
WHERE geometry IS NOT NULL
  AND source = 'dispatch';  -- Only use Dispatch intersections for clipping

CREATE INDEX idx_temp_intersection_areas_geom ON temp_intersection_areas USING GIST(geometry);

-- IMPORTANT: Only clip DISPATCH lanes, leave Frontrunner untouched
-- This matches the exact logic from generate_intersections.py

-- Update lane_segments table - clip the geometry (DISPATCH ONLY, using Python script approach)
-- This matches the logic in generate_intersections.py trim_roads_under_intersections()
WITH inter_union AS (
  SELECT ST_Union(geometry) AS geom
  FROM temp_intersection_areas
  WHERE geometry IS NOT NULL
),
trimmed AS (
  SELECT
    ls.lane_id AS lane_id,
    (
      SELECT d.geom
      FROM (
        SELECT (ST_Dump(
                  ST_LineMerge(
                    ST_CollectionExtract(
                      ST_MakeValid(
                        ST_Difference(ls.geometry, iu.geom)
                      ),
                      2  -- Extract linestrings only
                    )
                  )
                )).geom AS geom
      ) d
      WHERE GeometryType(d.geom) = 'LINESTRING' AND NOT ST_IsEmpty(d.geom)
      ORDER BY ST_Length(d.geom) DESC
      LIMIT 1  -- Take longest linestring
    ) AS new_geom
  FROM combined_data.lane_segments ls
  CROSS JOIN inter_union iu
  WHERE ls.source = 'dispatch' 
    AND ls.geometry IS NOT NULL
    AND iu.geom IS NOT NULL 
    AND ST_Intersects(ls.geometry, iu.geom)
)
UPDATE combined_data.lane_segments ls
SET geometry = t.new_geom  -- NULL if road completely inside intersection (like Python script)
FROM trimmed t
WHERE t.lane_id = ls.lane_id AND ls.source = 'dispatch';

-- Recalculate road lengths after clipping
UPDATE combined_data.roads
SET road_length_m = CASE 
    WHEN centerline IS NOT NULL THEN ST_Length(centerline::geography)
    WHEN geometry IS NOT NULL THEN ST_Length(geometry::geography)
    ELSE road_length_m
END
WHERE (centerline IS NOT NULL OR geometry IS NOT NULL);

-- Recalculate lane segment lengths after clipping
UPDATE combined_data.lane_segments
SET length_m = ST_Length(geometry::geography)
WHERE geometry IS NOT NULL;

-- Clean up
DROP TABLE IF EXISTS temp_intersection_areas;

-- Report statistics
DO $$
DECLARE
    road_count integer;
    lane_count integer;
    intersection_count integer;
BEGIN
    SELECT COUNT(*) INTO road_count FROM combined_data.roads WHERE geometry IS NOT NULL OR centerline IS NOT NULL;
    SELECT COUNT(*) INTO lane_count FROM combined_data.lane_segments WHERE geometry IS NOT NULL;
    SELECT COUNT(*) INTO intersection_count FROM combined_data.intersections WHERE geometry IS NOT NULL;
    
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Road clipping completed:';
    RAISE NOTICE '  - Roads processed: %', road_count;
    RAISE NOTICE '  - Lane segments processed: %', lane_count;
    RAISE NOTICE '  - Intersections used for clipping: %', intersection_count;
    RAISE NOTICE '==========================================';
END $$;

