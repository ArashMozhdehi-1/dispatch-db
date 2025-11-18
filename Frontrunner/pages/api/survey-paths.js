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
    // Return ALL survey paths with ALL columns including coordinate aggregates
    const result = await pool.query(`
      SELECT 
        *,
        ST_AsGeoJSON(path_linestring)::json as linestring
      FROM survey_paths
      ORDER BY path_length_m DESC
    `);

    console.log(`Fetched ${result.rows.length} survey paths from database`);

    // Return ALL columns from the database
    const paths = result.rows.map(row => {
      const path = { ...row };
      // Keep linestring as is
      if (path.linestring) {
        path.linestring = path.linestring;
      }
      return path;
    });

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
