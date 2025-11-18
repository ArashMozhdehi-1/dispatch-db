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

  // Disable caching to force fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    console.log('📊 [Travels API] Fetching travels from database...');
    
    // Query all travels with simplification
    const result = await pool.query(`
      SELECT 
        travel_id,
        travel_oid,
        travel_cid,
        course_oid,
        course_cid,
        from_location_name,
        to_location_name,
        from_location_cid,
        to_location_cid,
        road_type,
        aht_profile_name,
        course_attributes_value,
        inflections,
        spline_oid,
        inclination_factor,
        start_direction,
        active,
        closed,
        segment_start,
        segment_end,
        total_points,
        travel_length_m,
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude,
        ST_AsGeoJSON(travel_linestring)::json as linestring
      FROM travels
      WHERE travel_linestring IS NOT NULL
      ORDER BY travel_length_m DESC
    `);

    console.log(`📊 [Travels API] Fetched ${result.rows.length} travels from database`);

    // No simplification - return full geometries
    const travels = result.rows;

    const jsonSize = JSON.stringify(travels).length;
    console.log(`📊 [Travels API] Returning ${travels.length} travels (JSON size: ${(jsonSize / 1024 / 1024).toFixed(2)} MB)`);

    res.status(200).json({
      total_travels: travels.length,
      travels: travels
    });
  } catch (error) {
    console.error('❌ [Travels API] Error fetching travels:', error);
    res.status(500).json({ 
      error: 'Failed to fetch travels',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

