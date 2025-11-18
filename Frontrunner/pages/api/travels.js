import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'infrastructure_db',
  user: process.env.DB_USER || 'infra_user',
  password: process.env.DB_PASSWORD || 'infra_password',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[API] /api/travels - Starting query...');
    console.log('[API] DB connection:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    });
    
    // Return travels with simplified geometry and essential fields only
    // Use aggressive simplification (0.001 degrees ≈ 110 meters) to reduce JSON size
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
        ST_AsGeoJSON(ST_Simplify(travel_linestring, 0.001))::json as linestring
      FROM travels
      WHERE travel_linestring IS NOT NULL
      ORDER BY travel_length_m DESC
      LIMIT 1000
    `);

    console.log(`[API] Fetched ${result.rows.length} travels from database`);

    // Aggressively simplify linestring to max 100 points per travel to avoid JSON size limits
    // This ensures the response stays under JavaScript's string length limit
    const travels = result.rows.map(row => {
      const travel = { ...row };
      // Simplify linestring by reducing coordinate density
      if (travel.linestring && travel.linestring.coordinates) {
        const coords = travel.linestring.coordinates;
        // Keep max 100 points per linestring (aggressive simplification for JSON)
        if (coords.length > 100) {
          const step = Math.ceil(coords.length / 100);
          const simplified = [];
          for (let i = 0; i < coords.length; i += step) {
            simplified.push(coords[i]);
          }
          // Always keep first and last point
          if (simplified.length === 0 || simplified[simplified.length - 1] !== coords[coords.length - 1]) {
            simplified.push(coords[coords.length - 1]);
          }
          travel.linestring = {
            type: 'LineString',
            coordinates: simplified
          };
        }
      }
      return travel;
    });

    console.log(`[API] Returning ${travels.length} travels with simplified geometry`);

    res.status(200).json({
      total_travels: travels.length,
      travels: travels
    });
  } catch (error) {
    console.error('[API] Error fetching travels:', error);
    console.error('[API] Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to fetch travels',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

