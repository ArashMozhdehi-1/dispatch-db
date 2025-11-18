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
    // Use PostGIS to clip road markings outside intersection zones
    const result = await pool.query(`
      WITH intersection_buffers AS (
        -- Create 15m buffer around each intersection polygon
        SELECT 
          intersection_id,
          ST_Buffer(geometry::geography, 15)::geometry as buffer_geom
        FROM consolidated_intersections
        WHERE geometry IS NOT NULL
      ),
      all_intersections_union AS (
        -- Union all intersection buffers into one geometry
        SELECT ST_Union(buffer_geom) as union_geom
        FROM intersection_buffers
      ),
      courses_clipped AS (
        -- Clip course linestrings outside intersection zones
        SELECT 
          c.course_id,
          c.cid,
          c.course_name,
          c.road_type,
          c.course_length_m,
          c.total_points,
          CASE 
            WHEN ai.union_geom IS NOT NULL THEN
              ST_Difference(c.course_linestring, ai.union_geom)
            ELSE
              c.course_linestring
          END as clipped_linestring
        FROM courses c
        CROSS JOIN all_intersections_union ai
        WHERE c.course_linestring IS NOT NULL
      ),
      survey_paths_clipped AS (
        -- Clip survey path linestrings outside intersection zones
        SELECT 
          sp.path_id,
          sp.path_oid,
          sp.path_length_m,
          sp.total_points,
          sp.is_valid,
          CASE 
            WHEN ai.union_geom IS NOT NULL THEN
              ST_Difference(sp.path_linestring, ai.union_geom)
            ELSE
              sp.path_linestring
          END as clipped_linestring
        FROM survey_paths sp
        CROSS JOIN all_intersections_union ai
        WHERE sp.path_linestring IS NOT NULL
      )
      -- Return courses
      SELECT 
        'course' as type,
        course_id as id,
        cid,
        course_name as name,
        road_type,
        course_length_m as length_m,
        total_points,
        ST_AsGeoJSON(clipped_linestring)::json as linestring
      FROM courses_clipped
      WHERE clipped_linestring IS NOT NULL
        AND ST_GeometryType(clipped_linestring) IN ('ST_LineString', 'ST_MultiLineString')
      
      UNION ALL
      
      -- Return survey paths
      SELECT 
        'survey_path' as type,
        path_id as id,
        path_oid as cid,
        'Survey Path ' || path_oid as name,
        NULL as road_type,
        path_length_m as length_m,
        total_points,
        ST_AsGeoJSON(clipped_linestring)::json as linestring
      FROM survey_paths_clipped
      WHERE clipped_linestring IS NOT NULL
        AND ST_GeometryType(clipped_linestring) IN ('ST_LineString', 'ST_MultiLineString')
      
      ORDER BY type, id
    `);

    console.log(`Processed ${result.rows.length} road markings with intersection clipping`);

    res.status(200).json({
      total_markings: result.rows.length,
      markings: result.rows
    });
  } catch (error) {
    console.error('Error processing road markings:', error);
    res.status(500).json({ 
      error: 'Failed to process road markings',
      message: error.message 
    });
  }
}
