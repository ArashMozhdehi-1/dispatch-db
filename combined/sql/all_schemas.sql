-- Aggregate loader for all schema/DDL scripts under sql/
-- Run with: psql -h <host> -U <user> -d <db> -f combined/sql/all_schemas.sql

-- Core schema and functions
\i ../sql/01_create_schema.sql
\i ../sql/bezier_functions.sql

-- Optional data seeds / feature schemas
\i ../sql/02_seed_slope_data.sql
\i ../sql/02_trolley_schema.sql
\i ../sql/03_watering_schema.sql
\i ../sql/04_speed_management_lrs_schema.sql

-- Note: paths are relative to this file when executed from repo root.


