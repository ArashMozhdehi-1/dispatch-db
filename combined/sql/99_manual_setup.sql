-- Manual setup for combined tables and speed management

-- Lane Segments
DROP TABLE IF EXISTS combined_data.lane_segments CASCADE;
CREATE TABLE combined_data.lane_segments AS 
SELECT 
  'dispatch'::text AS source,
  ls.lane_id::text AS lane_id,
  ls.road_id::bigint AS road_id,
  ls.lane_name,
  ls.direction AS direction,
  ls.geometry,
  NULL::numeric AS lane_width_m,
  NULL::integer AS weight_limit_tonnes,
  ls.length_m,
  NULL::integer AS from_location_id,
  NULL::integer AS to_location_id,
  NULL::text AS from_location_name,
  NULL::text AS to_location_name,
  ls.time_empty_seconds,
  ls.time_loaded_seconds,
  ls.is_closed
FROM dispatch.lane_segments ls
UNION ALL
SELECT 
  'frontrunner'::text AS source,
  mr._oid_::text AS lane_id,
  mr._oid_::bigint AS road_id,
  CONCAT(COALESCE(mr.from_location_name, ''), ' -> ', COALESCE(mr.to_location_name, '')) AS lane_name,
  NULL::text AS direction,
  mr.geometry_wkt AS geometry,
  NULL::numeric AS lane_width_m,
  NULL::integer AS weight_limit_tonnes,
  ST_Length(mr.geometry_wkt::geography) AS length_m,
  NULL::integer AS from_location_id,
  NULL::integer AS to_location_id,
  mr.from_location_name AS from_location_name,
  mr.to_location_name AS to_location_name,
  NULL::numeric AS time_empty_seconds,
  NULL::numeric AS time_loaded_seconds,
  FALSE AS is_closed
FROM public.map_road mr;

-- Roads
DROP TABLE IF EXISTS combined_data.roads CASCADE;
CREATE TABLE combined_data.roads AS 
SELECT 
  'dispatch'::text AS source,
  ls.road_id::bigint AS road_id,
  ('road_' || ls.road_id)::text AS road_name,
  NULL::integer AS start_location_id,
  NULL::integer AS end_location_id,
  NULL::text AS from_location_name,
  NULL::text AS to_location_name,
  'dispatch'::text AS source_system,
  NULL::geometry(Polygon, 4326) AS geometry,
  ST_Multi(ST_LineMerge(ST_Collect(ls.geometry))) AS centerline,
  SUM(ls.length_m) AS road_length_m,
  BOOL_OR(COALESCE(ls.is_closed, FALSE)) AS is_closed
FROM dispatch.lane_segments ls
GROUP BY ls.road_id
UNION ALL
SELECT 
  'frontrunner'::text AS source,
  mr._oid_::bigint AS road_id,
  CONCAT(COALESCE(mr.from_location_name, ''), ' -> ', COALESCE(mr.to_location_name, '')) AS road_name,
  NULL::integer AS start_location_id,
  NULL::integer AS end_location_id,
  mr.from_location_name AS from_location_name,
  mr.to_location_name AS to_location_name,
  'frontrunner'::text AS source_system,
  mr.geometry_wkt AS geometry,
  NULL::geometry AS centerline,
  ST_Length(mr.geometry_wkt::geography) AS road_length_m,
  FALSE AS is_closed
FROM public.map_road mr;

-- Intersections
DROP TABLE IF EXISTS combined_data.intersections CASCADE;
CREATE TABLE combined_data.intersections AS 
SELECT 
  'dispatch'::text AS source,
  i.intersection_id::text AS intersection_id,
  i.intersection_name,
  i.geometry,
  i.center_point,
  i.intersection_type
FROM dispatch.intersections i
UNION ALL
SELECT 
  'frontrunner'::text AS source,
  mi._oid_::text AS intersection_id,
  mi.name AS intersection_name,
  mi.geometry_wkt AS geometry,
  ST_Centroid(mi.geometry_wkt) AS center_point,
  NULL::text AS intersection_type
FROM public.map_intersection mi;

-- Infrastructure
DROP TABLE IF EXISTS combined_data.infrastructure CASCADE;
CREATE TABLE combined_data.infrastructure AS 
SELECT 
  'dispatch'::text AS source,
  i.location_id,
  i.location_name,
  i.pit_id,
  i.region_id,
  i.unit_id,
  i.sign_id,
  i.signpost,
  i.shoptype,
  i.gpstype,
  COALESCE(ut.description, i.unit_id::text) AS unit_type,
  COALESCE(ut.description, i.unit_id::text) AS location_category,
  i.geometry,
  i.center_point,
  i.radius_m,
  i.elevation_m,
  i.is_active,
  i.created_at,
  i.last_modified
FROM dispatch.infrastructure i
LEFT JOIN combined_data.unit_types ut ON ut.unit_type_id = i.unit_id;

-- Add Frontrunner locations
INSERT INTO combined_data.infrastructure (
  source, location_id, location_name, pit_id, region_id, unit_id, sign_id, signpost, shoptype, gpstype,
  unit_type, location_category, geometry, center_point, radius_m, elevation_m, is_active, created_at, last_modified
)
SELECT
  'frontrunner'::text AS source,
  500000000 + ROW_NUMBER() OVER (ORDER BY ml._oid_) AS location_id,
  ml.name AS location_name,
  NULL::integer AS pit_id,
  NULL::integer AS region_id,
  NULL::integer AS unit_id,
  NULL::integer AS sign_id,
  NULL::integer AS signpost,
  NULL::integer AS shoptype,
  NULL::integer AS gpstype,
  ml.type AS unit_type,
  ml.type AS location_category,
  ml.geometry_wkt AS geometry,
  ST_Centroid(ml.geometry_wkt) AS center_point,
  NULL::numeric AS radius_m,
  NULL::numeric AS elevation_m,
  NULL::boolean AS is_active,
  NULL::timestamp AS created_at,
  NULL::timestamp AS last_modified
FROM public.map_location ml
WHERE lower(ml.type) IN ('high dump', 'load', 'paddock dump', 'tiedown', 'crusher');

-- Speed management tables
CREATE TABLE IF NOT EXISTS combined_data.vehicle_series (
  series_id SERIAL PRIMARY KEY,
  model_name TEXT NOT NULL UNIQUE,
  manufacturer TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS combined_data.road_speed_limits (
  speed_limit_id SERIAL PRIMARY KEY,
  road_id BIGINT NOT NULL,
  lane_id TEXT NOT NULL,
  series_id INTEGER NOT NULL REFERENCES combined_data.vehicle_series(series_id),
  max_speed_kmh NUMERIC(5,2) NOT NULL,
  from_measure NUMERIC(10,2) DEFAULT 0,
  to_measure NUMERIC(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert vehicle models
INSERT INTO combined_data.vehicle_series (model_name, manufacturer, description) VALUES
('Komatsu 980E-4', 'Komatsu', '327-tonne haul truck'),
('CAT 797F', 'Caterpillar', '400-tonne haul truck'),
('Komatsu 830E', 'Komatsu', '220-tonne haul truck'),
('CAT 789D', 'Caterpillar', '177-tonne haul truck')
ON CONFLICT (model_name) DO NOTHING;

-- Sample speed limits
INSERT INTO combined_data.road_speed_limits (road_id, lane_id, series_id, max_speed_kmh, from_measure, to_measure) VALUES
(5862758, 'road_5862758_0_forward', 1, 40.00, 0, 1500),
(5862758, 'road_5862758_0_forward', 2, 35.00, 0, 1500),
(5859678, 'road_5859678_0_forward', 1, 45.00, 0, 2000),
(5859678, 'road_5859678_0_forward', 2, 40.00, 0, 2000)
ON CONFLICT DO NOTHING;

