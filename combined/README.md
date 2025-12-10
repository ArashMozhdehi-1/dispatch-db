## Combined setup (Dispatch + Frontrunner)

Goal: keep Dispatch and Frontrunner data in one Postgres, but in **separate schemas**, and expose a single set of views that merges roads + intersections for map consumption (UI/API at port 3004 in your future stack).

What’s here:

- `sql/combined_views.sql`: creates schemas (if missing) and views that unify roads/intersections across the two schemas.

How to load data (concept):

1) Run the existing ETLs twice, once per schema:
   - For Dispatch: run your `src/app/etl.py` pointing to schema `dispatch`.
   - For Frontrunner: run the Frontrunner ETL (or the same ETL with its dataset) pointing to schema `frontrunner`.
   Ensure both runs target the same Postgres database/instance.

2) Apply the combined views:
   - `psql -h <db_host> -U <db_user> -d <db_name> -f sql/combined_views.sql`

3) Point your UI/API (on port 3004) at the combined DB and read from:
   - `combined_roads` (unified roads/segments)
   - `combined_intersections` (unified intersections)

Notes:
- Views only depend on `lane_segments` and `intersections` tables existing in each schema.
- If you use different table names, adjust the view definitions accordingly.
- This folder doesn’t yet include docker-compose/ui/api scaffolding; it just provides the DB unification layer. You can wire the UI/API container(s) to port 3004 and point them at the same DB.



