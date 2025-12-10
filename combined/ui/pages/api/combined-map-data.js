import pg from 'pg';

const { Pool } = pg;

// Increase response size limit to accommodate larger payloads
export const config = {
  api: {
    responseLimit: '16mb',
  },
};

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
              COALESCE(is_closed, FALSE) AS is_closed,
              ST_AsGeoJSON(centerline) AS centerline_geojson
       FROM combined_data.roads
       WHERE centerline IS NOT NULL OR geometry IS NOT NULL`
    );

    // Lane-level geometry (similar to dispatch GraphQL segments)
    const segments = await client.query(
      `SELECT lane_id,
              road_id,
              COALESCE(is_closed, FALSE) AS is_closed,
              direction,
              length_m,
              ST_AsGeoJSON(geometry) AS geometry_geojson
       FROM combined_data.lane_segments
       WHERE geometry IS NOT NULL`
    );

    const intersections = await client.query(
      `SELECT intersection_id, source,
              ST_AsGeoJSON(geometry) AS geom_geojson,
              ST_AsGeoJSON(center_point) AS center_geojson
       FROM combined_data.intersections`
    );
    const infrastructure = await client.query(
      `SELECT location_id, location_name, source,
              unit_id,
              unit_type,
              location_category,
              ST_AsGeoJSON(COALESCE(center_point, ST_Centroid(geometry))) AS point_geojson,
              ST_AsGeoJSON(geometry) AS geom_geojson
       FROM combined_data.infrastructure`
    );

    let infraRows = infrastructure.rows;

    // Fallback: if no infrastructure rows, synthesize from intersections as pseudo-locations
    if (!infraRows || infraRows.length === 0) {
      infraRows = intersections.rows.map((i) => ({
        location_id: i.intersection_id,
        location_name: i.intersection_name || `Intersection ${i.intersection_id}`,
        source: i.source,
        unit_id: null,
        unit_type: (i.intersection_type || 'intersection'),
        location_category: (i.intersection_type || 'intersection'),
        point_geojson: i.center_geojson,
        geom_geojson: i.geom_geojson,
      }));
    }

    res.status(200).json({
      roads: roads.rows,
      segments: segments.rows,
      intersections: intersections.rows,
      infrastructure: infraRows,
      trolleySegments: [],
      wateringStations: [],
      speedMonitoring: [],
    });
  } catch (err) {
    console.error('combined-map-data error', err);
    res.status(500).json({ error: 'Failed to load combined map data' });
  } finally {
    client.release();
  }
}
