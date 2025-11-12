import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'infrastructure_db',
  user: process.env.DB_USER || 'infra_user',
  password: process.env.DB_PASSWORD || 'infra_password',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Return ALL survey paths
    const result = await pool.query(`
      SELECT 
        path_id,
        path_oid,
        cid,
        is_valid,
        is_changeable,
        is_external,
        total_points,
        path_length_m,
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude,
        ST_AsGeoJSON(path_linestring)::json as linestring
      FROM survey_paths
      ORDER BY path_length_m DESC
    `);

    console.log(`Fetched ${result.rows.length} survey paths from database`);

    const paths = result.rows.map(row => ({
      path_id: row.path_id,
      path_oid: row.path_oid,
      cid: row.cid,
      is_valid: row.is_valid,
      is_changeable: row.is_changeable,
      is_external: row.is_external,
      total_points: row.total_points,
      path_length_m: row.path_length_m,
      start_latitude: row.start_latitude,
      start_longitude: row.start_longitude,
      end_latitude: row.end_latitude,
      end_longitude: row.end_longitude,
      linestring: row.linestring
    }));

    console.log(`Returning ${paths.length} survey paths to client`);

    res.status(200).json({
      total_paths: paths.length,
      paths: paths
    });
  } catch (error) {
    console.error('Error fetching survey paths:', error);
    res.status(500).json({ 
      error: 'Failed to fetch survey paths',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
