-- Import roads and intersections from two running Postgres instances into this DB.
-- Sources:
--   dispatch_db  : localhost:5434 (dbname=komatsu_dispatch, user=dispatch_user, pass=dispatch_password)
--   frontrunner_db: localhost:5433 (dbname=infrastructure_db, user=infra_user, pass=infra_password)
--
-- Run with:
--   psql -h <combined_host> -p <combined_port> -U <combined_user> -d <combined_db> -f combined/sql/import_from_two_dbs.sql

CREATE EXTENSION IF NOT EXISTS dblink;

-- Target schemas in this combined DB
CREATE SCHEMA IF NOT EXISTS dispatch_src;
CREATE SCHEMA IF NOT EXISTS frontrunner_src;
CREATE SCHEMA IF NOT EXISTS combined;

-- Drop staging tables if they exist
DROP TABLE IF EXISTS dispatch_src.lane_segments CASCADE;
DROP TABLE IF EXISTS dispatch_src.intersections CASCADE;
DROP TABLE IF EXISTS frontrunner_src.lane_segments CASCADE;
DROP TABLE IF EXISTS frontrunner_src.intersections CASCADE;

-- Pull Dispatch data
SELECT dblink_exec($dbl$
  CREATE TABLE dispatch_src.lane_segments AS
  SELECT * FROM dblink(
    'host=localhost port=5434 dbname=komatsu_dispatch user=dispatch_user password=dispatch_password',
    'SELECT * FROM lane_segments'
  ) AS t(*);

  CREATE TABLE dispatch_src.intersections AS
  SELECT * FROM dblink(
    'host=localhost port=5434 dbname=komatsu_dispatch user=dispatch_user password=dispatch_password',
    'SELECT * FROM intersections'
  ) AS t(*);
$dbl$);

-- Pull Frontrunner data
SELECT dblink_exec($dbl$
  CREATE TABLE frontrunner_src.lane_segments AS
  SELECT * FROM dblink(
    'host=localhost port=5433 dbname=infrastructure_db user=infra_user password=infra_password',
    'SELECT * FROM lane_segments'
  ) AS t(*);

  CREATE TABLE frontrunner_src.intersections AS
  SELECT * FROM dblink(
    'host=localhost port=5433 dbname=infrastructure_db user=infra_user password=infra_password',
    'SELECT * FROM intersections'
  ) AS t(*);
$dbl$);

-- Unified views with source tags
DROP VIEW IF EXISTS combined.combined_roads;
DROP VIEW IF EXISTS combined.combined_intersections;

CREATE VIEW combined.combined_roads AS
SELECT 'dispatch'::text AS source, * FROM dispatch_src.lane_segments
UNION ALL
SELECT 'frontrunner'::text AS source, * FROM frontrunner_src.lane_segments;

CREATE VIEW combined.combined_intersections AS
SELECT 'dispatch'::text AS source, * FROM dispatch_src.intersections
UNION ALL
SELECT 'frontrunner'::text AS source, * FROM frontrunner_src.intersections;


