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
    console.log('💧 Fetching watering stations from Dispatch database...');
    
    // Check if table exists first
    const tableCheck = await dispatchPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'watering_stations'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️ watering_stations table does not exist yet');
      return res.status(200).json({
        total_stations: 0,
        stations: []
      });
    }
    
    const result = await dispatchPool.query(`
      SELECT 
        ws.station_id,
        ws.station_name,
        ws.station_code,
        ws.station_type,
        ws.capacity_liters,
        ws.current_level_percent,
        ws.status,
        ws.latitude,
        ws.longitude,
        ST_AsGeoJSON(ws.geometry) as geometry
      FROM watering_stations ws
      WHERE ws.latitude IS NOT NULL 
        AND ws.longitude IS NOT NULL
      ORDER BY ws.station_id
    `);
    
    console.log(`✅ Found ${result.rows.length} watering stations`);
    
    res.status(200).json({
      total_stations: result.rows.length,
      stations: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching watering stations:', error);
    res.status(500).json({ 
      error: 'Failed to fetch watering stations',
      message: error.message
    });
  }
}

