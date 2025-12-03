import { Pool } from 'pg';

const pool = new Pool({
    host: process.env.MAP_DUMP_DB_HOST || process.env.DB_HOST || 'localhost',
    port: process.env.MAP_DUMP_DB_PORT || process.env.DB_PORT || 5433,
    database: process.env.MAP_DUMP_DB_NAME || 'mf_geoserver_db',
    user: process.env.MAP_DUMP_DB_USER || process.env.DB_USER || 'infra_user',
    password: process.env.MAP_DUMP_DB_PASSWORD || process.env.DB_PASSWORD || 'infra_password',
});

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Fetch all road corner markers and side center markers from map_location table
        const result = await pool.query(`
      SELECT 
        _oid_ as marker_id,
        name,
        type,
        ST_AsGeoJSON(geometry_wkt)::json as geometry,
        road_marker_metadata
      FROM map_location
      WHERE type IN ('road_corner_marker', 'road_corner_side_center')
      ORDER BY name;
    `);

        console.log(`Fetched ${result.rows.length} road markers (corners and side centers)`);

        // Parse the metadata JSON for each marker
        const markers = result.rows.map(row => {
            let metadata = {};
            if (row.road_marker_metadata) {
                try {
                    metadata = typeof row.road_marker_metadata === 'string'
                        ? JSON.parse(row.road_marker_metadata)
                        : row.road_marker_metadata;
                } catch (e) {
                    console.error(`Failed to parse metadata for marker ${row.marker_id}:`, e);
                }
            }

            return {
                marker_id: row.marker_id,
                name: row.name,
                type: row.type,
                geometry: row.geometry,
                metadata: metadata
            };
        });

        // Separate into corners and side centers for easier frontend handling
        const corners = markers.filter(m => m.type === 'road_corner_marker');
        const sideCenters = markers.filter(m => m.type === 'road_corner_side_center');

        res.status(200).json({
            total_markers: markers.length,
            total_corners: corners.length,
            total_side_centers: sideCenters.length,
            markers: markers,
            corners: corners,
            side_centers: sideCenters
        });
    } catch (error) {
        console.error('Error fetching road markers:', error);
        res.status(500).json({
            error: 'Failed to fetch road markers',
            message: error.message
        });
    }
}
