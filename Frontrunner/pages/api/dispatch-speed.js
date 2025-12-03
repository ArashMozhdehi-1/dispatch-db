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
    console.log('🚦 Fetching speed monitoring points from Dispatch database...');
    
    // Check if table exists first
    const tableCheck = await dispatchPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'speed_monitoring'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ speed_monitoring table does not exist yet');
      return res.status(200).json({
        total_points: 0,
        points: []
      });
    }
    
    const result = await dispatchPool.query(`
      SELECT 
        sm.monitoring_id,
        sm.lane_id,
        sm.measure,
        sm.speed_kmh,
        sm.violation_type,
        sm.operational_mode,
        sm.latitude,
        sm.longitude,
        ST_AsGeoJSON(sm.geometry) as geometry
      FROM speed_monitoring sm
      WHERE sm.latitude IS NOT NULL 
        AND sm.longitude IS NOT NULL
      ORDER BY sm.monitoring_id
    `);
    
    console.log(`✅ Found ${result.rows.length} speed monitoring points`);
    
    res.status(200).json({
      total_points: result.rows.length,
      points: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching speed monitoring:', error);
    res.status(500).json({ 
      error: 'Failed to fetch speed monitoring',
      message: error.message
    });
  }
}

