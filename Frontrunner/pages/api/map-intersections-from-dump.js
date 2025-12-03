import { Pool } from 'pg';

let pool;
const getPool = () => {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.MAP_DUMP_DB_NAME || 'mf_geoserver_db',
      user: process.env.POSTGRES_USER || 'infra_user',
      password: process.env.POSTGRES_PASSWORD || 'infra_password',
    });
  }
  return pool;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT
          _oid_,
          _cid_,
          name,
          ST_AsGeoJSON(geometry_wkt) AS geometry,
          ST_X(ST_Centroid(geometry_wkt)) AS center_lon,
          ST_Y(ST_Centroid(geometry_wkt)) AS center_lat,
          ST_Area(geometry_wkt::geography) AS area_sqm,
          ST_Perimeter(geometry_wkt::geography) AS perimeter_m,
          is_open,
          on_hold_by_dispatcher,
          on_hold_by_operator
        FROM map_intersection
        ORDER BY name
      `);

      const consolidated_intersections = result.rows.map((row) => ({
        intersection_id: row._oid_,
        intersection_cid: row._cid_,
        location_name: row.name,
        name: row.name,
        is_open: row.is_open,
        on_hold_by_dispatcher: row.on_hold_by_dispatcher,
        on_hold_by_operator: row.on_hold_by_operator,
        geometry: row.geometry ? JSON.parse(row.geometry) : null,
        center_longitude: row.center_lon,
        center_latitude: row.center_lat,
        area_sqm: row.area_sqm ? Number(row.area_sqm) : null,
        perimeter_m: row.perimeter_m ? Number(row.perimeter_m) : null,
      }));

      res.status(200).json({
        success: true,
        source: 'map_intersection table',
        total_intersections: consolidated_intersections.length,
        consolidated_intersections,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching map intersections:', error);
    res.status(500).json({
      error: 'Failed to fetch map intersections',
      message: error.message,
    });
  }
}
