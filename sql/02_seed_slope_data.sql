WITH ordered_segments AS (
  SELECT 
    lane_id,
    road_id,
    length_m,
    (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int as seg_num,
    SUM(length_m) OVER (PARTITION BY road_id ORDER BY (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as cumulative_start
  FROM lane_segments
  WHERE road_id = 5862758
)
-- Segment 1: 0-200m, 2% slope
INSERT INTO lane_conditions (lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end)
SELECT 
  os.lane_id,
  GREATEST(0, 0 - COALESCE(os.cumulative_start, 0)) as start_measure,
  LEAST(os.length_m, 200 - COALESCE(os.cumulative_start, 0)) as end_measure,
  'slope',
  '2.0',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '1 year'
FROM ordered_segments os
WHERE COALESCE(os.cumulative_start, 0) + os.length_m > 0 
  AND COALESCE(os.cumulative_start, 0) < 200
  AND LEAST(os.length_m, 200 - COALESCE(os.cumulative_start, 0)) > GREATEST(0, 0 - COALESCE(os.cumulative_start, 0));

WITH ordered_segments AS (
  SELECT 
    lane_id,
    road_id,
    length_m,
    (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int as seg_num,
    SUM(length_m) OVER (PARTITION BY road_id ORDER BY (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as cumulative_start
  FROM lane_segments
  WHERE road_id = 5862758
)
-- Segment 2: 200-500m, 5% slope
INSERT INTO lane_conditions (lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end)
SELECT 
  os.lane_id,
  GREATEST(0, 200 - COALESCE(os.cumulative_start, 0)) as start_measure,
  LEAST(os.length_m, 500 - COALESCE(os.cumulative_start, 0)) as end_measure,
  'slope',
  '5.0',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '1 year'
FROM ordered_segments os
WHERE COALESCE(os.cumulative_start, 0) + os.length_m > 200 
  AND COALESCE(os.cumulative_start, 0) < 500
  AND LEAST(os.length_m, 500 - COALESCE(os.cumulative_start, 0)) > GREATEST(0, 200 - COALESCE(os.cumulative_start, 0));

WITH ordered_segments AS (
  SELECT 
    lane_id,
    road_id,
    length_m,
    (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int as seg_num,
    SUM(length_m) OVER (PARTITION BY road_id ORDER BY (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as cumulative_start
  FROM lane_segments
  WHERE road_id = 5862758
)
-- Segment 3: 500-800m, -1.5% slope (downhill)
INSERT INTO lane_conditions (lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end)
SELECT 
  os.lane_id,
  GREATEST(0, 500 - COALESCE(os.cumulative_start, 0)) as start_measure,
  LEAST(os.length_m, 800 - COALESCE(os.cumulative_start, 0)) as end_measure,
  'slope',
  '-1.5',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '1 year'
FROM ordered_segments os
WHERE COALESCE(os.cumulative_start, 0) + os.length_m > 500 
  AND COALESCE(os.cumulative_start, 0) < 800
  AND LEAST(os.length_m, 800 - COALESCE(os.cumulative_start, 0)) > GREATEST(0, 500 - COALESCE(os.cumulative_start, 0));

-- Seed slope data for Road 5859678
WITH ordered_segments AS (
  SELECT 
    lane_id,
    road_id,
    length_m,
    (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int as seg_num,
    SUM(length_m) OVER (PARTITION BY road_id ORDER BY (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as cumulative_start
  FROM lane_segments
  WHERE road_id = 5859678
)
-- Segment 1: 0-300m, 3% slope
INSERT INTO lane_conditions (lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end)
SELECT 
  os.lane_id,
  GREATEST(0, 0 - COALESCE(os.cumulative_start, 0)) as start_measure,
  LEAST(os.length_m, 300 - COALESCE(os.cumulative_start, 0)) as end_measure,
  'slope',
  '3.0',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '1 year'
FROM ordered_segments os
WHERE COALESCE(os.cumulative_start, 0) + os.length_m > 0 
  AND COALESCE(os.cumulative_start, 0) < 300
  AND LEAST(os.length_m, 300 - COALESCE(os.cumulative_start, 0)) > GREATEST(0, 0 - COALESCE(os.cumulative_start, 0));

WITH ordered_segments AS (
  SELECT 
    lane_id,
    road_id,
    length_m,
    (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int as seg_num,
    SUM(length_m) OVER (PARTITION BY road_id ORDER BY (regexp_match(lane_id, 'road_\d+_(\d+)_'))[1]::int ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as cumulative_start
  FROM lane_segments
  WHERE road_id = 5859678
)
-- Segment 2: 300-600m, 6% slope
INSERT INTO lane_conditions (lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end)
SELECT 
  os.lane_id,
  GREATEST(0, 300 - COALESCE(os.cumulative_start, 0)) as start_measure,
  LEAST(os.length_m, 600 - COALESCE(os.cumulative_start, 0)) as end_measure,
  'slope',
  '6.0',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '1 year'
FROM ordered_segments os
WHERE COALESCE(os.cumulative_start, 0) + os.length_m > 300 
  AND COALESCE(os.cumulative_start, 0) < 600
  AND LEAST(os.length_m, 600 - COALESCE(os.cumulative_start, 0)) > GREATEST(0, 300 - COALESCE(os.cumulative_start, 0));
