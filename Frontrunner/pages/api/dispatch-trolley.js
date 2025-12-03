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
    console.log('🔌 Fetching trolley segments from Dispatch database...');
    
    // Check if table exists first
    const tableCheck = await dispatchPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'trolley_segments'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ trolley_segments table does not exist yet');
      return res.status(200).json({
        total_segments: 0,
        segments: []
      });
    }
    
    const result = await dispatchPool.query(`
      SELECT 
        ts.lane_id,
        ts.lane_name,
        ts.direction,
        ts.length_m,
        ts.trolley_voltage,
        ts.trolley_current_limit,
        ts.trolley_wire_height,
        ST_AsGeoJSON(ts.geometry) as geometry,
        ST_Y(ST_StartPoint(ts.geometry)) as start_latitude,
        ST_X(ST_StartPoint(ts.geometry)) as start_longitude,
        ST_Y(ST_EndPoint(ts.geometry)) as end_latitude,
        ST_X(ST_EndPoint(ts.geometry)) as end_longitude
      FROM trolley_segments ts
      WHERE ts.geometry IS NOT NULL
      ORDER BY ts.lane_id
    `);
    
    console.log(`✅ Found ${result.rows.length} trolley segments`);
    
    res.status(200).json({
      total_segments: result.rows.length,
      segments: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching trolley segments:', error);
    res.status(500).json({ 
      error: 'Failed to fetch trolley segments',
      message: error.message
    });
  }
}

