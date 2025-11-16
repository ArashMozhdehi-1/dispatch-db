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
    // Return courses with survey_path flag - check if course overlaps with any survey path
    const result = await pool.query(`
      SELECT 
        c.course_id,
        c.cid,
        c.course_name,
        c.haul_profile_name,
        c.road_type,
        c.total_points,
        c.course_length_m,
        c.start_latitude,
        c.start_longitude,
        c.end_latitude,
        c.end_longitude,
        c.is_spline,
        CASE 
          WHEN EXISTS (
            SELECT 1 
            FROM survey_paths sp 
            WHERE ST_DWithin(
              c.course_linestring::geography, 
              sp.path_linestring::geography, 
              10
            )
          ) THEN true 
          ELSE false 
        END as has_survey_path,
        ST_AsGeoJSON(c.course_linestring)::json as linestring
      FROM courses c
      ORDER BY c.course_length_m DESC
    `);

    console.log(`Fetched ${result.rows.length} courses from database`);
    
    // Debug: Count courses with/without survey paths
    const withSurveyPath = result.rows.filter(r => r.has_survey_path === true).length;
    const withoutSurveyPath = result.rows.filter(r => r.has_survey_path === false).length;
    console.log(`Courses with survey_path: ${withSurveyPath}, without: ${withoutSurveyPath}`);

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
      is_spline: row.is_spline,
      has_survey_path: row.has_survey_path,
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
