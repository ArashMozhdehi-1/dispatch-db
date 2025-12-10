const { query } = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { roadId } = req.query;
      
      if (!roadId) {
        return res.status(400).json({ error: 'roadId is required' });
      }

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
      `, [roadId]);

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

      res.status(200).json(conditions);
    } catch (error) {
      console.error('Error fetching lane conditions:', error);
      res.status(500).json({ error: 'Failed to fetch lane conditions' });
    }
  } else if (req.method === 'PUT') {
    try {
      const { condition_id, condition_value } = req.body;
      
      if (!condition_id || condition_value === undefined) {
        return res.status(400).json({ error: 'condition_id and condition_value are required' });
      }

      const result = await query(`
        UPDATE lane_conditions
        SET condition_value = $1,
            last_modified = CURRENT_TIMESTAMP
        WHERE condition_id = $2
        RETURNING *
      `, [condition_value, condition_id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Condition not found' });
      }

      res.status(200).json({
        condition_id: result.rows[0].condition_id,
        condition_value: result.rows[0].condition_value
      });
    } catch (error) {
      console.error('Error updating lane condition:', error);
      res.status(500).json({ error: 'Failed to update lane condition' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}





