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
    const limit = parseInt(req.query.limit) || 10000; // Default to 10k points
    
    // Get survey points with spatial sampling to get good coverage
    const result = await pool.query(`
      SELECT 
        _oid_ as coordinate_id,
        latitude,
        longitude,
        altitude,
        coord_x,
        coord_y,
        coord_z
      FROM coordinate
      WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
      ORDER BY _oid_
      LIMIT $1
    `, [limit]);

    console.log(`Fetched ${result.rows.length} survey points from database`);

    const points = result.rows.map(row => ({
      coordinate_id: row.coordinate_id,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      altitude: row.altitude ? parseFloat(row.altitude) : null,
      mine_coords: {
        x: row.coord_x,
        y: row.coord_y,
        z: row.coord_z
      }
    }));

    res.status(200).json({
      total_points: points.length,
      coordinates: points
    });
  } catch (error) {
    console.error('Error fetching survey points:', error);
    res.status(500).json({ 
      error: 'Failed to fetch survey points',
      message: error.message 
    });
  }
}
