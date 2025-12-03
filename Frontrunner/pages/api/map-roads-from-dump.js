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
          is_open,
          from_location_name,
          to_location_name,
          end_to_start_travel_id,
          start_to_end_travel_id,
          course_oid,
          course_cid,
          travel_oid,
          course_attributes,
          length_m,
          width_m,
          short_sides_info,
          ST_AsGeoJSON(geometry_wkt) AS geometry
        FROM map_road
        ORDER BY from_location_name, to_location_name
      `);
    
      const roads = result.rows.map((row) => {
        const nameParts = [];
        if (row.from_location_name) nameParts.push(row.from_location_name);
        if (row.to_location_name) nameParts.push(row.to_location_name);
        const derivedName = nameParts.length === 2 ? `${nameParts[0]} -> ${nameParts[1]}` : nameParts.join(' ') || row._oid_;
      
        return {
          road_id: row._oid_,
          road_cid: row._cid_,
          name: derivedName,
          is_open: row.is_open,
          from_location_name: row.from_location_name,
          to_location_name: row.to_location_name,
          end_to_start_travel_id: row.end_to_start_travel_id,
          start_to_end_travel_id: row.start_to_end_travel_id,
          course_oid: row.course_oid,
          course_cid: row.course_cid,
          travel_oid: row.travel_oid,
          course_attributes: row.course_attributes,
          length_m: row.length_m ? Number(row.length_m) : null,
          width_m: row.width_m ? Number(row.width_m) : null,
          short_sides_info: row.short_sides_info,
          geometry: row.geometry ? JSON.parse(row.geometry) : null,
        };
      });

      res.status(200).json({
        success: true,
        source: 'map_road table',
        total_roads: roads.length,
        roads,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching map roads:', error);
    res.status(500).json({
      error: 'Failed to fetch map roads',
      message: error.message,
    });
  }
}
