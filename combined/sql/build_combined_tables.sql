-- Build unified tables under combined_data schema
CREATE SCHEMA IF NOT EXISTS combined_data;

-- Drop/recreate combined tables
DROP TABLE IF EXISTS combined_data.lane_segments CASCADE;
DROP TABLE IF EXISTS combined_data.lane_connectors CASCADE;
DROP TABLE IF EXISTS combined_data.lane_conditions CASCADE;
DROP TABLE IF EXISTS combined_data.unit_types CASCADE;
DROP TABLE IF EXISTS combined_data.infrastructure CASCADE;
DROP TABLE IF EXISTS combined_data.intersections CASCADE;
DROP TABLE IF EXISTS combined_data.roads CASCADE;
DROP VIEW IF EXISTS combined_data.lane_segments_union CASCADE;
DROP VIEW IF EXISTS combined_data.lane_connectors_union CASCADE;
DROP VIEW IF EXISTS combined_data.lane_conditions_union CASCADE;
DROP VIEW IF EXISTS combined_data.infrastructure_union CASCADE;
DROP VIEW IF EXISTS combined_data.intersections_union CASCADE;
DROP VIEW IF EXISTS combined_data.roads_union CASCADE;

-- Load Frontrunner geoserver dump (contains public.map_road)
\i /sql/mf_geoserver_db.sql

-- FDW to pull Frontrunner map_road directly from mf_geoserver_db
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
DROP SERVER IF EXISTS infra_server CASCADE;
CREATE SERVER infra_server
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'host.docker.internal', port '5433', dbname 'infrastructure_db');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
SERVER infra_server
OPTIONS (user 'infra_user', password 'infra_password');

-- no FDW needed when mf_geoserver_db.sql is loaded locally

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
  NULL::double precision AS time_empty_seconds,
  NULL::double precision AS time_loaded_seconds,
  NOT COALESCE(mr.is_open, TRUE) AS is_closed
FROM public.map_road mr;

CREATE TABLE combined_data.lane_conditions AS
SELECT
  'dispatch'::text AS source,
  lc.condition_id,
  lc.lane_id,
  lc.start_measure,
  lc.end_measure,
  lc.condition_type,
  lc.condition_value,
  lc.effective_start,
  lc.effective_end,
  lc.created_at,
  lc.last_modified
FROM dispatch.lane_conditions lc;

DO $$
BEGIN
  IF to_regclass('dispatch.unit_types') IS NOT NULL THEN
    EXECUTE '
      CREATE TABLE combined_data.unit_types AS
      SELECT
        unit_type_id,
        enum_type_id,
        description,
        abbreviation,
        flags,
        created_at,
        last_modified
      FROM dispatch.unit_types
    ';
  ELSIF to_regclass('public.unit_types') IS NOT NULL THEN
    EXECUTE '
      CREATE TABLE combined_data.unit_types AS
      SELECT
        unit_type_id,
        enum_type_id,
        description,
        abbreviation,
        flags,
        created_at,
        last_modified
      FROM public.unit_types
    ';
  ELSE
    CREATE TABLE combined_data.unit_types (
      unit_type_id integer,
      enum_type_id integer,
      description text,
      abbreviation text,
      flags integer,
      created_at timestamp,
      last_modified timestamp
    );
  END IF;
END$$;

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
LEFT JOIN combined_data.unit_types ut ON ut.unit_type_id = i.unit_id
UNION ALL
SELECT
  'frontrunner'::text AS source,
  l.location_id,
  l.location_name,
  NULL::integer AS pit_id,
  NULL::integer AS region_id,
  NULL::integer AS unit_id,
  NULL::integer AS sign_id,
  NULL::integer AS signpost,
  NULL::integer AS shoptype,
  NULL::integer AS gpstype,
  NULL::text AS unit_type,
  NULL::text AS location_category,
  l.geometry,
  ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326) AS center_point,
  NULL::numeric AS radius_m,
  l.elevation_m AS elevation_m,
  NULL::boolean AS is_active,
  NULL::timestamp AS created_at,
  NULL::timestamp AS last_modified
FROM public.locations l;

-- Enrich infrastructure with Frontrunner map_location (selected types)
DO $$
BEGIN
  IF to_regclass('public.map_location') IS NOT NULL THEN
    INSERT INTO combined_data.infrastructure (
      source,
      location_id,
      location_name,
      pit_id,
      region_id,
      unit_id,
      sign_id,
      signpost,
      shoptype,
      gpstype,
      unit_type,
      location_category,
      geometry,
      center_point,
      radius_m,
      elevation_m,
      is_active,
      created_at,
      last_modified
    )
    SELECT
      'frontrunner'::text AS source,
      500000000 + ROW_NUMBER() OVER (ORDER BY ml._oid_) AS location_id, -- synthetic integer id
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
    WHERE lower(ml.type) IN (
      'high dump',
      'load',
      'paddock dump',
      'tiedown',
      'crusher'
    );
  END IF;
END$$;

-- intersections: include dispatch + frontrunner map_intersection (ids as text to avoid bigint issues)
DO $$
BEGIN
  IF to_regclass('dispatch.intersections') IS NOT NULL OR to_regclass('public.map_intersection') IS NOT NULL THEN
    EXECUTE '
      CREATE TABLE combined_data.intersections AS
      SELECT
        ''dispatch''::text AS source,
        i.intersection_id::text AS intersection_id,
        i.intersection_name,
        i.geometry,
        i.center_point,
        i.intersection_type
      FROM dispatch.intersections i
      UNION ALL
      SELECT
        ''frontrunner''::text AS source,
        mi._oid_::text AS intersection_id,
        mi.name AS intersection_name,
        mi.geometry_wkt AS geometry,
        ST_Centroid(mi.geometry_wkt) AS center_point,
        NULL::text AS intersection_type
      FROM public.map_intersection mi
    ';
  ELSE
    CREATE TABLE combined_data.intersections AS
    SELECT
      ''dispatch''::text AS source,
      NULL::text AS intersection_id,
      NULL::text AS intersection_name,
      NULL::geometry(Polygon, 4326) AS geometry,
      NULL::geometry(Point, 4326) AS center_point,
      NULL::text AS intersection_type
    WHERE FALSE;
  END IF;
END$$;

-- roads: Dispatch from lane_segments (collect), Frontrunner from courses_cleaned (collect)
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
  NULL::geometry(Polygon, 4326) AS geometry,
  ST_LineMerge(ST_Multi(mr.geometry_wkt)) AS centerline,
  ST_Length(mr.geometry_wkt::geography) AS road_length_m,
  NOT COALESCE(mr.is_open, TRUE) AS is_closed
FROM public.map_road mr;

-- lane_connectors: clear (no connectors from map_intersection)
CREATE TABLE combined_data.lane_connectors AS
SELECT
  'frontrunner'::text AS source,
  NULL::bigint AS connector_id,
  NULL::text AS from_lane_id,
  NULL::text AS to_lane_id,
  NULL::integer AS from_location_id,
  NULL::integer AS to_location_id,
  NULL::geometry(LineString, 4326) AS geometry,
  NULL::integer AS intersection_id,
  NULL::geometry(Geometry, 4326) AS intersection_geom,
  NULL::boolean AS is_active,
  NULL::timestamp AS effective_start,
  NULL::timestamp AS effective_end,
  NULL::integer AS penalty_id
WHERE FALSE;

-- Union views (column-aligned)
CREATE VIEW combined_data.lane_segments_union AS
SELECT source, lane_id, road_id, lane_name, direction, geometry, lane_width_m, weight_limit_tonnes, length_m, from_location_id, to_location_id, from_location_name, to_location_name, time_empty_seconds, time_loaded_seconds, is_closed
FROM combined_data.lane_segments;

CREATE VIEW combined_data.lane_connectors_union AS
SELECT source, connector_id, from_lane_id, to_lane_id, from_location_id, to_location_id, geometry, intersection_id, intersection_geom, is_active, effective_start, effective_end, penalty_id
FROM combined_data.lane_connectors;

CREATE VIEW combined_data.lane_conditions_union AS
SELECT source, condition_id, lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end, created_at, last_modified
FROM combined_data.lane_conditions;

CREATE VIEW combined_data.infrastructure_union AS
SELECT source, location_id, location_name, pit_id, region_id, unit_id, sign_id, signpost, shoptype, gpstype, unit_type, location_category, geometry, center_point, radius_m, elevation_m, is_active, created_at, last_modified
FROM combined_data.infrastructure;

CREATE VIEW combined_data.intersections_union AS
SELECT source, intersection_id, intersection_name, geometry, center_point, intersection_type
FROM combined_data.intersections;

CREATE VIEW combined_data.roads_union AS
SELECT source, road_id, road_name, start_location_id, end_location_id, from_location_name, to_location_name, source_system, geometry, centerline, road_length_m, is_closed
FROM combined_data.roads;



-- Drop/recreate combined tables
DROP TABLE IF EXISTS combined_data.lane_segments CASCADE;
DROP TABLE IF EXISTS combined_data.lane_connectors CASCADE;
DROP TABLE IF EXISTS combined_data.lane_conditions CASCADE;
DROP TABLE IF EXISTS combined_data.unit_types CASCADE;
DROP TABLE IF EXISTS combined_data.infrastructure CASCADE;
DROP TABLE IF EXISTS combined_data.intersections CASCADE;
DROP TABLE IF EXISTS combined_data.roads CASCADE;
DROP VIEW IF EXISTS combined_data.lane_segments_union CASCADE;
DROP VIEW IF EXISTS combined_data.lane_connectors_union CASCADE;
DROP VIEW IF EXISTS combined_data.lane_conditions_union CASCADE;
DROP VIEW IF EXISTS combined_data.infrastructure_union CASCADE;
DROP VIEW IF EXISTS combined_data.intersections_union CASCADE;
DROP VIEW IF EXISTS combined_data.roads_union CASCADE;

-- Load Frontrunner geoserver dump (contains public.map_road)
\i /sql/mf_geoserver_db.sql

-- FDW to pull Frontrunner map_road directly from mf_geoserver_db
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
DROP SERVER IF EXISTS infra_server CASCADE;
CREATE SERVER infra_server
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'host.docker.internal', port '5433', dbname 'infrastructure_db');

CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
SERVER infra_server
OPTIONS (user 'infra_user', password 'infra_password');

-- no FDW needed when mf_geoserver_db.sql is loaded locally

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
  NULL::double precision AS time_empty_seconds,
  NULL::double precision AS time_loaded_seconds,
  NOT COALESCE(mr.is_open, TRUE) AS is_closed
FROM public.map_road mr;

CREATE TABLE combined_data.lane_conditions AS
SELECT
  'dispatch'::text AS source,
  lc.condition_id,
  lc.lane_id,
  lc.start_measure,
  lc.end_measure,
  lc.condition_type,
  lc.condition_value,
  lc.effective_start,
  lc.effective_end,
  lc.created_at,
  lc.last_modified
FROM dispatch.lane_conditions lc;

DO $$
BEGIN
  IF to_regclass('dispatch.unit_types') IS NOT NULL THEN
    EXECUTE '
      CREATE TABLE combined_data.unit_types AS
      SELECT
        unit_type_id,
        enum_type_id,
        description,
        abbreviation,
        flags,
        created_at,
        last_modified
      FROM dispatch.unit_types
    ';
  ELSIF to_regclass('public.unit_types') IS NOT NULL THEN
    EXECUTE '
      CREATE TABLE combined_data.unit_types AS
      SELECT
        unit_type_id,
        enum_type_id,
        description,
        abbreviation,
        flags,
        created_at,
        last_modified
      FROM public.unit_types
    ';
  ELSE
    CREATE TABLE combined_data.unit_types (
      unit_type_id integer,
      enum_type_id integer,
      description text,
      abbreviation text,
      flags integer,
      created_at timestamp,
      last_modified timestamp
    );
  END IF;
END$$;

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
LEFT JOIN combined_data.unit_types ut ON ut.unit_type_id = i.unit_id
UNION ALL
SELECT
  'frontrunner'::text AS source,
  l.location_id,
  l.location_name,
  NULL::integer AS pit_id,
  NULL::integer AS region_id,
  NULL::integer AS unit_id,
  NULL::integer AS sign_id,
  NULL::integer AS signpost,
  NULL::integer AS shoptype,
  NULL::integer AS gpstype,
  NULL::text AS unit_type,
  NULL::text AS location_category,
  l.geometry,
  ST_SetSRID(ST_MakePoint(l.longitude, l.latitude), 4326) AS center_point,
  NULL::numeric AS radius_m,
  l.elevation_m AS elevation_m,
  NULL::boolean AS is_active,
  NULL::timestamp AS created_at,
  NULL::timestamp AS last_modified
FROM public.locations l;

-- Enrich infrastructure with Frontrunner map_location (selected types)
DO $$
BEGIN
  IF to_regclass('public.map_location') IS NOT NULL THEN
    INSERT INTO combined_data.infrastructure (
      source,
      location_id,
      location_name,
      pit_id,
      region_id,
      unit_id,
      sign_id,
      signpost,
      shoptype,
      gpstype,
      unit_type,
      location_category,
      geometry,
      center_point,
      radius_m,
      elevation_m,
      is_active,
      created_at,
      last_modified
    )
    SELECT
      'frontrunner'::text AS source,
      500000000 + ROW_NUMBER() OVER (ORDER BY ml._oid_) AS location_id, -- synthetic integer id
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
    WHERE lower(ml.type) IN (
      'high dump',
      'load',
      'paddock dump',
      'tiedown',
      'crusher'
    );
  END IF;
END$$;

-- intersections: include dispatch + frontrunner map_intersection (ids as text to avoid bigint issues)
DO $$
BEGIN
  IF to_regclass('dispatch.intersections') IS NOT NULL OR to_regclass('public.map_intersection') IS NOT NULL THEN
    EXECUTE '
      CREATE TABLE combined_data.intersections AS
      SELECT
        ''dispatch''::text AS source,
        i.intersection_id::text AS intersection_id,
        i.intersection_name,
        i.geometry,
        i.center_point,
        i.intersection_type
      FROM dispatch.intersections i
      UNION ALL
      SELECT
        ''frontrunner''::text AS source,
        mi._oid_::text AS intersection_id,
        mi.name AS intersection_name,
        mi.geometry_wkt AS geometry,
        ST_Centroid(mi.geometry_wkt) AS center_point,
        NULL::text AS intersection_type
      FROM public.map_intersection mi
    ';
  ELSE
    CREATE TABLE combined_data.intersections AS
    SELECT
      ''dispatch''::text AS source,
      NULL::text AS intersection_id,
      NULL::text AS intersection_name,
      NULL::geometry(Polygon, 4326) AS geometry,
      NULL::geometry(Point, 4326) AS center_point,
      NULL::text AS intersection_type
    WHERE FALSE;
  END IF;
END$$;

-- roads: Dispatch from lane_segments (collect), Frontrunner from courses_cleaned (collect)
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
  NULL::geometry(Polygon, 4326) AS geometry,
  ST_LineMerge(ST_Multi(mr.geometry_wkt)) AS centerline,
  ST_Length(mr.geometry_wkt::geography) AS road_length_m,
  NOT COALESCE(mr.is_open, TRUE) AS is_closed
FROM public.map_road mr;

-- lane_connectors: clear (no connectors from map_intersection)
CREATE TABLE combined_data.lane_connectors AS
SELECT
  'frontrunner'::text AS source,
  NULL::bigint AS connector_id,
  NULL::text AS from_lane_id,
  NULL::text AS to_lane_id,
  NULL::integer AS from_location_id,
  NULL::integer AS to_location_id,
  NULL::geometry(LineString, 4326) AS geometry,
  NULL::integer AS intersection_id,
  NULL::geometry(Geometry, 4326) AS intersection_geom,
  NULL::boolean AS is_active,
  NULL::timestamp AS effective_start,
  NULL::timestamp AS effective_end,
  NULL::integer AS penalty_id
WHERE FALSE;

-- Union views (column-aligned)
CREATE VIEW combined_data.lane_segments_union AS
SELECT source, lane_id, road_id, lane_name, direction, geometry, lane_width_m, weight_limit_tonnes, length_m, from_location_id, to_location_id, from_location_name, to_location_name, time_empty_seconds, time_loaded_seconds, is_closed
FROM combined_data.lane_segments;

CREATE VIEW combined_data.lane_connectors_union AS
SELECT source, connector_id, from_lane_id, to_lane_id, from_location_id, to_location_id, geometry, intersection_id, intersection_geom, is_active, effective_start, effective_end, penalty_id
FROM combined_data.lane_connectors;

CREATE VIEW combined_data.lane_conditions_union AS
SELECT source, condition_id, lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end, created_at, last_modified
FROM combined_data.lane_conditions;

CREATE VIEW combined_data.infrastructure_union AS
SELECT source, location_id, location_name, pit_id, region_id, unit_id, sign_id, signpost, shoptype, gpstype, unit_type, location_category, geometry, center_point, radius_m, elevation_m, is_active, created_at, last_modified
FROM combined_data.infrastructure;

CREATE VIEW combined_data.intersections_union AS
SELECT source, intersection_id, intersection_name, geometry, center_point, intersection_type
FROM combined_data.intersections;

CREATE VIEW combined_data.roads_union AS
SELECT source, road_id, road_name, start_location_id, end_location_id, from_location_name, to_location_name, source_system, geometry, centerline, road_length_m, is_closed
FROM combined_data.roads;
