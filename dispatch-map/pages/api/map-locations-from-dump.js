import { Pool } from 'pg';

let pooledClient;
const getPool = () => {
  if (!pooledClient) {
    pooledClient = new Pool({
      host: process.env.DB_HOST || process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.DB_NAME || process.env.POSTGRES_DB || 'dispatch_db',
      user: process.env.DB_USER || process.env.POSTGRES_USER || 'dispatch_user',
      password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'dispatch_password',
    });
  }
  return pooledClient;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pool = getPool();
    const client = await pool.connect();

    try {
      const locationsResult = await client.query(`
        SELECT 
          _oid_,
          _cid_,
          name,
          type,
          ST_AsGeoJSON(geometry_wkt) AS polygon_geojson,
          ST_AsGeoJSON(ST_Centroid(geometry_wkt)) AS center_geojson,
          ST_X(ST_Centroid(geometry_wkt)) AS center_lon,
          ST_Y(ST_Centroid(geometry_wkt)) AS center_lat,
          ST_Area(geometry_wkt::geography) AS area_sqm,
          ST_Perimeter(geometry_wkt::geography) AS perimeter_m,
          is_open,
          on_hold_by_dispatcher,
          on_hold_by_operator
        FROM map_location
        WHERE type NOT IN ('road_corner_marker', 'road_corner_side_center')
        ORDER BY name
      `);

      const consolidated_locations = locationsResult.rows.map((row) => {
        const polygon = row.polygon_geojson ? JSON.parse(row.polygon_geojson) : null;
        const center_point = row.center_geojson ? JSON.parse(row.center_geojson) : null;
        return {
          location_id: row._oid_,
          location_cid: row._cid_,
          location_name: row.name,
          name: row.name,
          type: row.type,
          category: row.type,
          polygon,
          center_point,
          center_latitude: row.center_lat,
          center_longitude: row.center_lon,
          area_sqm: row.area_sqm ? Number(row.area_sqm) : null,
          perimeter_m: row.perimeter_m ? Number(row.perimeter_m) : null,
          total_points: polygon?.coordinates?.[0]?.length || null,
          is_open: row.is_open,
          on_hold_by_dispatcher: row.on_hold_by_dispatcher,
          on_hold_by_operator: row.on_hold_by_operator,
        };
      });

      const roadCornerResult = await client.query(`
        SELECT
          name,
          type,
          ST_AsGeoJSON(geometry_wkt) AS geometry,
          ST_X(geometry_wkt) AS lon,
          ST_Y(geometry_wkt) AS lat,
          road_marker_metadata
        FROM map_location
        WHERE type = 'road_corner_marker'
      `);

      const roadSideResult = await client.query(`
        SELECT
          name,
          type,
          ST_AsGeoJSON(geometry_wkt) AS geometry,
          ST_X(geometry_wkt) AS lon,
          ST_Y(geometry_wkt) AS lat,
          road_marker_metadata
        FROM map_location
        WHERE type = 'road_corner_side_center'
      `);

      const formatMarkerRow = (row) => ({
        name: row.name,
        type: row.type,
        geometry: row.geometry ? JSON.parse(row.geometry) : null,
        lon: row.lon !== null ? Number(row.lon) : null,
        lat: row.lat !== null ? Number(row.lat) : null,
        road_marker_metadata: row.road_marker_metadata,
      });

      const road_corner_markers = roadCornerResult.rows.map(formatMarkerRow);
      const road_side_markers = roadSideResult.rows.map(formatMarkerRow);

      res.status(200).json({
        success: true,
        source: 'map_location table',
        total_locations: consolidated_locations.length,
        consolidated_locations,
        road_corner_markers: road_corner_markers || [],
        road_side_markers: road_side_markers || [],
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching map locations:', error);
    res.status(500).json({
      error: 'Failed to fetch map locations',
      message: error.message,
    });
  }
}

