import { Pool } from 'pg';

const dispatchPool = new Pool({
  host: process.env.DISPATCH_DB_HOST || 'localhost',
  port: process.env.DISPATCH_DB_PORT || 5434,
  database: process.env.DISPATCH_DB_NAME || 'dispatch_db',
  user: process.env.DISPATCH_DB_USER || 'dispatch_user',
  password: process.env.DISPATCH_DB_PASSWORD || 'dispatch_password',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚧 Fetching Dispatch intersections from database...');
    
    // Use infrastructure table as it contains location data
    const result = await dispatchPool.query(`
      SELECT 
        i.location_id as intersection_id,
        i.location_name as intersection_name,
        'infrastructure' as intersection_type,
        0 as safety_buffer_m,
        0 as r_min_m,
        i.created_at,
        ST_AsGeoJSON(i.center_point) as geometry
      FROM infrastructure i
      WHERE i.center_point IS NOT NULL
        AND i.is_active = true
      ORDER BY i.location_id
      LIMIT 100
    `);
    
    console.log(`✅ Found ${result.rows.length} Dispatch intersections (from infrastructure)`);
    
    res.status(200).json({
      total_intersections: result.rows.length,
      intersections: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching Dispatch intersections:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Dispatch intersections',
      message: error.message
    });
  }
}

