#!/bin/bash
# Temporarily disable strict error checking for SQL scripts that may have errors
set +e

# Required env vars (with defaults)
DB_HOST="${COMBINED_DB_HOST:-db}"
DB_PORT="${COMBINED_DB_PORT:-5432}"
DB_NAME="${COMBINED_DB_NAME:-combined}"
DB_USER="${COMBINED_DB_USER:-combined_user}"
DB_PASSWORD="${COMBINED_DB_PASSWORD:-combined_password}"
# admin DB to connect for control statements
DB_ADMIN_DB="${COMBINED_DB_ADMIN_DB:-postgres}"
# source roles needed by dumps
DISPATCH_ROLE="${COMBINED_DISPATCH_ROLE:-dispatch_user}"
DISPATCH_ROLE_PW="${COMBINED_DISPATCH_PASSWORD:-dispatch_password}"
FR_ROLE="${COMBINED_FR_ROLE:-infra_user}"
FR_ROLE_PW="${COMBINED_FR_PASSWORD:-infra_password}"

export PGPASSWORD="$DB_PASSWORD"
# default database for psql when -d is not provided
export PGDATABASE="$DB_ADMIN_DB"

create_postgis_public() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
}

echo "Waiting for Postgres at $DB_HOST:$DB_PORT..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready."

# Create DB if not exists
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -c "CREATE DATABASE ${DB_NAME};"

# Ensure source roles exist for ownership in dumps
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -tc "SELECT 1 FROM pg_roles WHERE rolname='${DISPATCH_ROLE}'" | grep -q 1 || \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -c "CREATE ROLE ${DISPATCH_ROLE} LOGIN PASSWORD '${DISPATCH_ROLE_PW}';"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -tc "SELECT 1 FROM pg_roles WHERE rolname='${FR_ROLE}'" | grep -q 1 || \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -c "CREATE ROLE ${FR_ROLE} LOGIN PASSWORD '${FR_ROLE_PW}';"

# Always start from a clean slate: drop and recreate target DB
echo "Dropping and recreating ${DB_NAME}..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -c "REVOKE CONNECT ON DATABASE ${DB_NAME} FROM public; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" || true
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -c "DROP DATABASE IF EXISTS ${DB_NAME};"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_ADMIN_DB" -c "CREATE DATABASE ${DB_NAME};"

# Ensure PostGIS in public before any restore
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Prepare target schemas
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE SCHEMA IF NOT EXISTS dispatch;"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE SCHEMA IF NOT EXISTS frontrunner;"

# If a combined dump exists, restore it (schema + data) and skip the legacy pieces
if [ -f /dumps/combined_latest.dump ]; then
  echo "Restoring combined_latest.dump into ${DB_NAME} (schema + data)..."
  pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists /dumps/combined_latest.dump
  echo "Import finished (combined dump)."
  exit 0
fi

# Restore dispatch dump normally, then move key tables into dispatch schema
if [ -f /dumps/dispatch.dump ]; then
  echo "Restoring dispatch.dump into ${DB_NAME}..."
  pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges /dumps/dispatch.dump
  echo "Moving dispatch tables into schema dispatch (if present)..."
  for tbl in lane_segments intersections lane_conditions lane_connectors infrastructure roads; do
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "ALTER TABLE IF EXISTS public.${tbl} SET SCHEMA dispatch;"
  done
else
  echo "dispatch.dump not found; skipping."
fi

# Restore frontrunner dump into frontrunner schema via search_path
if [ -f /dumps/frontrunner.dump ]; then
  echo "Restoring frontrunner.dump into ${DB_NAME} schema frontrunner..."
  PGOPTIONS="--search_path=frontrunner,public" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges /dumps/frontrunner.dump
else
  echo "frontrunner.dump not found; skipping."
fi

# Skip build_combined_tables.sql - it has errors and 99_manual_setup.sql does everything
# if [ -f /sql/build_combined_tables.sql ]; then
#   echo "Applying build_combined_tables.sql ..."
#   ( psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /sql/build_combined_tables.sql 2>&1 ) || echo "build_combined_tables.sql had errors (expected)"
# fi

# Apply manual setup (creates all tables and speed management)
if [ -f /sql/99_manual_setup.sql ]; then
  echo "Applying manual setup (creating all tables, speed management, and clipping roads)..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /sql/99_manual_setup.sql
fi

# Apply combined views (requires combined_data tables already built)
if [ -f /sql/combined_views.sql ]; then
  echo "Applying combined_views.sql ..."
  ( psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f /sql/combined_views.sql 2>&1 ) || echo "combined_views.sql had errors (expected)"
fi

echo "Import finished."
