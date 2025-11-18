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
    // Return ALL courses with ALL columns including coordinate aggregates
    const result = await pool.query(`
      SELECT 
        *,
        ST_AsGeoJSON(course_linestring)::json as linestring
      FROM courses
      ORDER BY course_length_m DESC
    `);

    console.log(`Fetched ${result.rows.length} courses from database`);

    // Return ALL columns from the database
    const courses = result.rows.map(row => {
      const course = { ...row };
      // Rename linestring to avoid overwriting
      if (course.linestring) {
        course.linestring = course.linestring;
      }
      return course;
    });

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
