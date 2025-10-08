const { query } = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = req.query.limit || 100000;
    
    console.log('🔍 Fetching lane segments with limit:', limit);
    
    // First, let's check how many total segments we have
    const countResult = await query(`
      SELECT COUNT(*) as total_count FROM lane_segments
    `);
    console.log('📊 Total lane segments in database:', countResult.rows[0].total_count);
    
    const result = await query(`
      SELECT 
        ls.lane_id,
        ls.road_id,
        ls.direction,
        ls.length_m,
        ls.time_empty_seconds,
        ls.time_loaded_seconds,
        ls.is_closed,
        ST_AsGeoJSON(ls.geometry) as geometry,
        ST_Y(ST_StartPoint(ls.geometry)) as start_latitude,
        ST_X(ST_StartPoint(ls.geometry)) as start_longitude,
        ST_Y(ST_EndPoint(ls.geometry)) as end_latitude,
        ST_X(ST_EndPoint(ls.geometry)) as end_longitude
      FROM lane_segments ls
      WHERE ST_Y(ST_StartPoint(ls.geometry)) BETWEEN -60 AND -20  -- Filter out bad coordinates
        AND ST_X(ST_StartPoint(ls.geometry)) BETWEEN 140 AND 155  -- Filter out bad coordinates
        AND ST_Y(ST_EndPoint(ls.geometry)) BETWEEN -60 AND -20    -- Filter out bad coordinates
        AND ST_X(ST_EndPoint(ls.geometry)) BETWEEN 140 AND 155    -- Filter out bad coordinates
      ORDER BY ls.road_id, ls.lane_id
      LIMIT $1
    `, [limit]);
    
    console.log('✅ Filtered lane segments found:', result.rows.length);
    
    const segments = result.rows.map(row => ({
      lane_id: row.lane_id,
      road_id: row.road_id,
      direction: row.direction,
      length_m: parseFloat(row.length_m),
      time_empty_seconds: parseFloat(row.time_empty_seconds),
      time_loaded_seconds: parseFloat(row.time_loaded_seconds),
      is_closed: row.is_closed,
      geometry: row.geometry,
      start_latitude: parseFloat(row.start_latitude),
      start_longitude: parseFloat(row.start_longitude),
      end_latitude: parseFloat(row.end_latitude),
      end_longitude: parseFloat(row.end_longitude)
    }));

    res.status(200).json(segments);
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
}