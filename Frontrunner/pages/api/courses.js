import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'infrastructure_db',
  user: process.env.DB_USER || 'infra_user',
  password: process.env.DB_PASSWORD || 'infra_password',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Return ALL courses - they're already deduplicated with ~31 points average
    const result = await pool.query(`
      SELECT 
        course_id,
        cid,
        course_name,
        haul_profile_name,
        road_type,
        total_points,
        course_length_m,
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude,
        ST_AsGeoJSON(course_linestring)::json as linestring
      FROM courses
      ORDER BY course_length_m DESC
    `);

    console.log(`Fetched ${result.rows.length} courses from database`);

    const courses = result.rows.map(row => ({
      course_id: row.course_id,
      cid: row.cid,
      course_name: row.course_name,
      haul_profile_name: row.haul_profile_name,
      road_type: row.road_type,
      total_points: row.total_points,
      course_length_m: row.course_length_m,
      start_latitude: row.start_latitude,
      start_longitude: row.start_longitude,
      end_latitude: row.end_latitude,
      end_longitude: row.end_longitude,
      linestring: row.linestring
    }));

    console.log(`Returning ${courses.length} courses to client`);

    res.status(200).json({
      total_courses: courses.length,
      courses: courses
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({ 
      error: 'Failed to fetch courses',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
