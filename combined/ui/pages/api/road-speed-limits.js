const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3005,
  database: process.env.DB_NAME || 'combined',
  user: process.env.DB_USER || 'combined_user',
  password: process.env.DB_PASSWORD || 'combined_password',
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { road_id } = req.query;
    
    if (!road_id) {
      return res.status(400).json({ error: 'road_id is required' });
    }

    try {
      // Get all lane segments for this road
      const lanesQuery = `
        SELECT 
          ls.lane_id,
          ls.road_id,
          ls.length_m,
          COALESCE(ls.source, 'dispatch') as source
        FROM combined_data.lane_segments ls
        WHERE ls.road_id = $1
        ORDER BY ls.lane_id
      `;
      
      const lanesResult = await pool.query(lanesQuery, [road_id]);
      const lanes = lanesResult.rows;

      // Get speed limits for this road
      const speedQuery = `
        SELECT 
          rsl.speed_limit_id,
          rsl.road_id,
          rsl.lane_id,
          rsl.series_id,
          vs.model_name,
          vs.manufacturer,
          rsl.max_speed_kmh,
          rsl.from_measure,
          rsl.to_measure
        FROM combined_data.road_speed_limits rsl
        JOIN combined_data.vehicle_series vs ON rsl.series_id = vs.series_id
        WHERE rsl.road_id = $1
        ORDER BY rsl.lane_id, vs.manufacturer, vs.model_name
      `;
      
      const speedResult = await pool.query(speedQuery, [road_id]);
      const speedLimits = speedResult.rows;

      // Get all available vehicle models
      const vehicleModelsQuery = `
        SELECT 
          vs.series_id,
          vs.model_name,
          vs.manufacturer,
          vs.description
        FROM combined_data.vehicle_series vs
        ORDER BY vs.manufacturer, vs.model_name
      `;
      
      const vehicleModelsResult = await pool.query(vehicleModelsQuery);
      const vehicleModels = vehicleModelsResult.rows;

      res.status(200).json({
        lanes,
        speedLimits,
        vehicleModels
      });
    } catch (error) {
      console.error('Error fetching speed limits:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'POST') {
    const { road_id, apply_to_all_lanes, series_id, max_speed_kmh, from_measure, to_measure } = req.body;
    
    if (!road_id || !series_id || max_speed_kmh === undefined) {
      return res.status(400).json({ error: 'road_id, series_id, and max_speed_kmh are required' });
    }

    try {
      if (apply_to_all_lanes) {
        // Get all lanes for this road
        const lanesQuery = `SELECT lane_id FROM combined_data.lane_segments WHERE road_id = $1`;
        const lanesResult = await pool.query(lanesQuery, [road_id]);
        const lanes = lanesResult.rows;
        
        // Insert speed limit for each lane
        const insertQuery = `
          INSERT INTO combined_data.road_speed_limits 
          (road_id, lane_id, series_id, max_speed_kmh, from_measure, to_measure)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
        `;
        
        for (const lane of lanes) {
          await pool.query(insertQuery, [
            road_id,
            lane.lane_id,
            series_id,
            max_speed_kmh,
            from_measure || 0.0,
            to_measure || null
          ]);
        }
        
        res.status(200).json({ success: true, lanes_updated: lanes.length });
      } else {
        // Legacy: single lane insert
        const { lane_id } = req.body;
        if (!lane_id) {
          return res.status(400).json({ error: 'lane_id required when apply_to_all_lanes is false' });
        }
        
        const query = `
          INSERT INTO combined_data.road_speed_limits 
          (road_id, lane_id, series_id, max_speed_kmh, from_measure, to_measure)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
          RETURNING *
        `;
        
        const result = await pool.query(query, [
          road_id,
          lane_id,
          series_id,
          max_speed_kmh,
          from_measure || 0.0,
          to_measure || null
        ]);
        
        res.status(200).json(result.rows[0]);
      }
    } catch (error) {
      console.error('Error creating speed limit:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'PUT') {
    const { speed_limit_id, max_speed_kmh, from_measure, to_measure } = req.body;
    
    if (!speed_limit_id || max_speed_kmh === undefined) {
      return res.status(400).json({ error: 'speed_limit_id and max_speed_kmh are required' });
    }

    try {
      const query = `
        UPDATE combined_data.road_speed_limits
        SET max_speed_kmh = $1,
            from_measure = COALESCE($2, from_measure),
            to_measure = $3,
            last_modified = CURRENT_TIMESTAMP
        WHERE speed_limit_id = $4
        RETURNING *
      `;
      
      const result = await pool.query(query, [
        max_speed_kmh,
        from_measure,
        to_measure,
        speed_limit_id
      ]);
      
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error('Error updating speed limit:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    const { speed_limit_id } = req.query;
    
    if (!speed_limit_id) {
      return res.status(400).json({ error: 'speed_limit_id is required' });
    }

    try {
      const query = `DELETE FROM combined_data.road_speed_limits WHERE speed_limit_id = $1 RETURNING *`;
      const result = await pool.query(query, [speed_limit_id]);
      
      res.status(200).json({ deleted: result.rows[0] });
    } catch (error) {
      console.error('Error deleting speed limit:', error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}

