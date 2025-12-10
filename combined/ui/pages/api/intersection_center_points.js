import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'dispatch_db',
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'dispatch_user',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'dispatch_password',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const client = await pool.connect();
    try {
      let rows = [];

      // First try the precomputed table (written by ETL). If it errors (missing table), fall through.
      try {
        const result = await client.query(
          `SELECT road_id, intersection_id, intersection_name, side,
                  ST_X(geometry) AS lon, ST_Y(geometry) AS lat
           FROM intersection_center_points`
        );
        if (result.rows && result.rows.length > 0) {
          rows = result.rows;
        }
      } catch (e) {
        console.warn('intersection_center_points table not available; using fallback', e?.message || e);
      }

      if (!rows.length) {
        // Fallback: compute on the fly from lane_segments and intersections
        const fallback = await client.query(
          `
          WITH segs AS (
            SELECT road_id, geometry AS geom
            FROM lane_segments
          ),
          ints AS (
            SELECT intersection_id, intersection_name, geometry
            FROM intersections
          ),
          pairs AS (
            SELECT
              s.road_id,
              i.intersection_id,
              i.intersection_name,
              s.geom AS seg_geom,
              ST_Boundary(i.geometry) AS inter_boundary
            FROM segs s
            JOIN ints i
              ON ST_DWithin(s.geom, i.geometry, 5.0 / 111320.0)
          ),
          calc AS (
            SELECT
              road_id,
              intersection_id,
              intersection_name,
              ST_LineInterpolatePoint(
                seg_geom,
                LEAST(
                  1.0,
                  GREATEST(
                    0.0,
                    ST_LineLocatePoint(
                      seg_geom,
                      ST_ClosestPoint(seg_geom, inter_boundary)
                    )
                  )
                )
              ) AS pt
            FROM pairs
          )
          SELECT
            road_id,
            intersection_id,
            intersection_name,
            ST_X(pt) AS lon,
            ST_Y(pt) AS lat
          FROM calc
          WHERE pt IS NOT NULL;
          `
        );
        rows = fallback.rows || [];
      }

      // If any rows are missing road_id, attach to nearest lane segment (closest, no distance cap)
      const missing = rows.filter((r) => r.road_id == null);
      if (missing.length) {
        for (const row of missing) {
          try {
            const nearest = await client.query(
              `
              SELECT road_id,
                     COALESCE(_oid_, id) AS segment_id
              FROM lane_segments
              ORDER BY ST_Distance(
                geometry::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
              )
              LIMIT 1;
              `,
              [row.lon, row.lat]
            );
            if (nearest.rows?.length) {
              row.road_id = nearest.rows[0].road_id;
              row.segment_id = row.segment_id ?? nearest.rows[0].segment_id;
            }
          } catch (e) {
            console.warn('intersection_center_points nearest-road enrichment failed', e?.message || e);
          }
        }
      }

      res.status(200).json(rows);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error fetching intersection_center_points', err);
    res.status(500).json({ error: 'Failed to fetch center points', detail: err?.message || String(err) });
  }
}

