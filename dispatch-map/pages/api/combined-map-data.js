import pg from 'pg';

const {
  Pool,
} = pg;

const pool = new Pool({
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'combined_user',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'combined_password',
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'combined',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await pool.connect();
  try {
    const roads = await client.query(
      `SELECT road_id,
              road_name,
              source,
              ST_AsGeoJSON(centerline) AS centerline_geojson
       FROM combined_data.roads`
    );

    const intersections = await client.query(
      `SELECT intersection_id,
              source,
              ST_AsGeoJSON(geometry) AS geom_geojson,
              ST_AsGeoJSON(center_point) AS center_geojson
       FROM combined_data.intersections`
    );

    const infrastructure = await client.query(
      `SELECT location_id,
              location_name,
              source,
              ST_AsGeoJSON(COALESCE(center_point, geometry)) AS point_geojson,
              ST_AsGeoJSON(geometry) AS geom_geojson
       FROM combined_data.infrastructure`
    );

    return res.status(200).json({
      roads: roads.rows,
      intersections: intersections.rows,
      infrastructure: infrastructure.rows,
    });
  } catch (err) {
    console.error('combined-map-data error', err);
    return res.status(500).json({ error: 'Failed to load combined map data' });
  } finally {
    client.release();
  }
}


