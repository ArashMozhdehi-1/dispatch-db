import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'combined_user',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'combined_password',
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'combined',
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    if (req.method === 'GET') {
      const { roadId } = req.query;
      if (!roadId) {
        return res.status(400).json({ error: 'roadId is required' });
      }
      const result = await client.query(
        `WITH road_lanes AS (
           SELECT lane_id, road_id, length_m
           FROM combined_data.lane_segments
           WHERE road_id::text = $1
         )
         SELECT lc.condition_id,
                lc.lane_id,
                rl.road_id,
                rl.length_m AS lane_length,
                lc.start_measure,
                lc.end_measure,
                lc.condition_type,
                lc.condition_value
         FROM combined_data.lane_conditions lc
         JOIN road_lanes rl ON rl.lane_id::text = lc.lane_id::text
         ORDER BY rl.lane_id, lc.start_measure`,
        [roadId.toString()]
      );

      const totalLengthResult = await client.query(
        `SELECT COALESCE(SUM(DISTINCT length_m), 0) AS total_road_length
         FROM combined_data.lane_segments
         WHERE road_id::text = $1`,
        [roadId.toString()]
      );

      return res.status(200).json({
        conditions: result.rows,
        total_road_length: Number(totalLengthResult.rows[0]?.total_road_length || 0),
      });
    }

    if (req.method === 'POST') {
      const { lane_id, start_measure, end_measure, condition_value, condition_type } = req.body || {};
      if (!lane_id || start_measure === undefined || end_measure === undefined || condition_value === undefined) {
        return res.status(400).json({ error: 'lane_id, start_measure, end_measure, condition_value are required' });
      }
      const type = condition_type || 'slope';
      const insert = await client.query(
        `INSERT INTO combined_data.lane_conditions (lane_id, start_measure, end_measure, condition_type, condition_value)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING condition_id`,
        [lane_id, start_measure, end_measure, type, condition_value]
      );
      return res.status(200).json({ condition_id: insert.rows[0].condition_id });
    }

    if (req.method === 'PUT') {
      const { condition_id, condition_value } = req.body || {};
      if (!condition_id || condition_value === undefined || condition_value === null) {
        return res.status(400).json({ error: 'condition_id and condition_value are required' });
      }
      await client.query(
        `UPDATE combined_data.lane_conditions
         SET condition_value = $1
         WHERE condition_id = $2`,
        [condition_value, condition_id]
      );
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { condition_id } = req.body || {};
      if (!condition_id) {
        return res.status(400).json({ error: 'condition_id is required' });
      }
      await client.query(
        `DELETE FROM combined_data.lane_conditions
         WHERE condition_id = $1`,
        [condition_id]
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('lane-conditions error', err);
    return res.status(500).json({ error: 'Failed to handle lane conditions' });
  } finally {
    client.release();
  }
}
