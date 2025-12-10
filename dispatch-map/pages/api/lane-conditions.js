const { Pool } = require('pg');
const path = require('path');

// Try to load env from backend or current directory
try {
  require('dotenv').config({ path: path.join(process.cwd(), '..', 'backend', 'env.local') });
} catch (e) {
  try {
    require('dotenv').config({ path: path.join(process.cwd(), 'env.local') });
  } catch (e2) {
    // Use default values if no env file found
  }
}

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dispatch_db',
  user: process.env.DB_USER || 'dispatch_user',
  password: process.env.DB_PASSWORD || 'dispatch_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const query = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { roadId } = req.query;

      if (!roadId) {
        return res.status(400).json({ error: 'roadId is required' });
      }

      // Convert roadId to integer
      const roadIdInt = parseInt(roadId, 10);
      if (isNaN(roadIdInt)) {
        return res.status(400).json({ error: 'roadId must be a valid number' });
      }

      console.log(`[lane-conditions] Fetching slope data for road_id: ${roadIdInt}`);
      console.log(`[lane-conditions] DB Config: Host=${process.env.DB_HOST || 'postgres'}, User=${process.env.DB_USER || 'dispatch_user'}, DB=${process.env.DB_NAME || 'dispatch_db'}`);

      const result = await query(`
        SELECT 
          lc.condition_id,
          lc.lane_id,
          lc.start_measure,
          lc.end_measure,
          lc.condition_type,
          lc.condition_value,
          lc.effective_start,
          lc.effective_end,
          ls.length_m as lane_length
        FROM lane_conditions lc
        JOIN lane_segments ls ON lc.lane_id = ls.lane_id
        WHERE ls.road_id = $1
          AND lc.condition_type = 'slope'
          AND (lc.effective_start IS NULL OR lc.effective_start <= NOW())
          AND (lc.effective_end IS NULL OR lc.effective_end >= NOW())
        ORDER BY lc.lane_id, lc.start_measure
      `, [roadIdInt]);

      console.log(`[lane-conditions] Found ${result.rows.length} slope conditions for road ${roadIdInt}`);

      const conditions = result.rows.map(row => ({
        condition_id: row.condition_id,
        lane_id: row.lane_id,
        start_measure: parseFloat(row.start_measure),
        end_measure: parseFloat(row.end_measure),
        condition_type: row.condition_type,
        condition_value: row.condition_value,
        effective_start: row.effective_start,
        effective_end: row.effective_end,
        lane_length: parseFloat(row.lane_length)
      }));

      // Get total road length (sum of all lane segment lengths)
      const totalLengthResult = await query(`
        SELECT COALESCE(SUM(ls.length_m), 0) as total_road_length
        FROM lane_segments ls
        WHERE ls.road_id = $1
      `, [roadIdInt]);

      const totalRoadLength = parseFloat(totalLengthResult.rows[0].total_road_length) || 0;

      res.status(200).json({
        conditions,
        total_road_length: totalRoadLength
      });
    } catch (error) {
      console.error('Error fetching lane conditions:', error);
      res.status(500).json({ error: 'Failed to fetch lane conditions' });
    }
  } else if (req.method === 'PUT') {
    try {
      const { condition_id, condition_value } = req.body;

      if (!condition_id || condition_value === undefined || condition_value === null) {
        return res.status(400).json({ error: 'condition_id and condition_value are required' });
      }

      // Ensure condition_value is a string (as stored in DB)
      const valueStr = String(condition_value).trim();

      // Validate it's a number
      if (isNaN(parseFloat(valueStr))) {
        return res.status(400).json({ error: 'condition_value must be a valid number' });
      }

      console.log(`[lane-conditions] Updating condition_id: ${condition_id}, new value: ${valueStr}`);

      const result = await query(`
        UPDATE lane_conditions
        SET condition_value = $1,
            last_modified = CURRENT_TIMESTAMP
        WHERE condition_id = $2
        RETURNING condition_id, condition_value, lane_id, start_measure, end_measure
      `, [valueStr, condition_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Condition not found' });
      }

      console.log(`[lane-conditions] Successfully updated condition_id: ${condition_id}`);

      res.status(200).json({
        condition_id: result.rows[0].condition_id,
        condition_value: result.rows[0].condition_value,
        lane_id: result.rows[0].lane_id,
        start_measure: parseFloat(result.rows[0].start_measure),
        end_measure: parseFloat(result.rows[0].end_measure)
      });
    } catch (error) {
      console.error('Error updating lane condition:', error);
      res.status(500).json({ error: 'Failed to update lane condition', details: error.message });
    }
  } else if (req.method === 'POST') {
    try {
      const { lane_id, start_measure, end_measure, condition_value } = req.body;

      if (!lane_id || start_measure === undefined || end_measure === undefined || condition_value === undefined) {
        return res.status(400).json({ error: 'lane_id, start_measure, end_measure, and condition_value are required' });
      }

      const valueStr = String(condition_value).trim();
      if (isNaN(parseFloat(valueStr))) {
        return res.status(400).json({ error: 'condition_value must be a valid number' });
      }

      console.log(`[lane-conditions] Creating new condition for lane_id: ${lane_id}`);

      const result = await query(`
        INSERT INTO lane_conditions (lane_id, start_measure, end_measure, condition_type, condition_value, effective_start, effective_end)
        VALUES ($1, $2, $3, 'slope', $4, NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 year')
        RETURNING condition_id, lane_id, start_measure, end_measure, condition_value
      `, [lane_id, start_measure, end_measure, valueStr]);

      console.log(`[lane-conditions] Successfully created condition_id: ${result.rows[0].condition_id}`);

      res.status(201).json({
        condition_id: result.rows[0].condition_id,
        lane_id: result.rows[0].lane_id,
        start_measure: parseFloat(result.rows[0].start_measure),
        end_measure: parseFloat(result.rows[0].end_measure),
        condition_value: result.rows[0].condition_value
      });
    } catch (error) {
      console.error('Error creating lane condition:', error);
      res.status(500).json({ error: 'Failed to create lane condition', details: error.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { condition_id } = req.body;

      if (!condition_id) {
        return res.status(400).json({ error: 'condition_id is required' });
      }

      console.log(`[lane-conditions] Deleting condition_id: ${condition_id}`);

      const result = await query(`
        DELETE FROM lane_conditions
        WHERE condition_id = $1
        RETURNING condition_id
      `, [condition_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Condition not found' });
      }

      console.log(`[lane-conditions] Successfully deleted condition_id: ${condition_id}`);

      res.status(200).json({ success: true, condition_id: result.rows[0].condition_id });
    } catch (error) {
      console.error('Error deleting lane condition:', error);
      res.status(500).json({ error: 'Failed to delete lane condition', details: error.message });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

