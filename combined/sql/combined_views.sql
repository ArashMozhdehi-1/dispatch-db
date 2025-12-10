-- Create schemas if they don't exist
CREATE SCHEMA IF NOT EXISTS dispatch;
CREATE SCHEMA IF NOT EXISTS frontrunner;

-- Create a dedicated combined schema
CREATE SCHEMA IF NOT EXISTS combined;

-- Drop existing views to allow re-run
-- Drop old views
DROP VIEW IF EXISTS combined.lane_segments;
DROP VIEW IF EXISTS combined.lane_connectors;
DROP VIEW IF EXISTS combined.lane_conditions;
DROP VIEW IF EXISTS combined.infrastructure;
DROP VIEW IF EXISTS combined.intersections;
DROP VIEW IF EXISTS combined.roads;
DROP VIEW IF EXISTS combined.combined_roads;
DROP VIEW IF EXISTS combined.combined_intersections;
DROP VIEW IF EXISTS combined.combined_road_network;

-- Expose unified tables under combined schema with original names
CREATE OR REPLACE VIEW combined.lane_segments AS
SELECT * FROM combined_data.lane_segments;

CREATE OR REPLACE VIEW combined.lane_connectors AS
SELECT * FROM combined_data.lane_connectors;

CREATE OR REPLACE VIEW combined.lane_conditions AS
SELECT * FROM combined_data.lane_conditions;

CREATE OR REPLACE VIEW combined.infrastructure AS
SELECT * FROM combined_data.infrastructure;

CREATE OR REPLACE VIEW combined.intersections AS
SELECT
  source,
  intersection_id,
  intersection_name,
  geometry,
  center_point,
  intersection_type
FROM combined_data.intersections;

CREATE OR REPLACE VIEW combined.roads AS
SELECT * FROM combined_data.roads;

-- Combined roads view (segments)
CREATE OR REPLACE VIEW combined.combined_roads AS
SELECT
    source,
    road_id,
    NULL::bigint AS segment_oid,
    lane_id AS segment_id,
    geometry,
    is_closed,
    direction
FROM combined_data.lane_segments;

-- Combined intersections view: unify intersections from both schemas
CREATE OR REPLACE VIEW combined.combined_intersections AS
SELECT
    source,
    intersection_id,
    intersection_name,
    geometry
FROM combined_data.intersections;

-- Road-level geometries (collected per road)
CREATE OR REPLACE VIEW combined.combined_road_network AS
SELECT source, road_id, road_name, geometry
FROM combined_data.roads;

-- Optional indexes to speed up lookups on the views (using materialized targets)
-- For materialized views, you can instead CREATE MATERIALIZED VIEW ... and index it.

