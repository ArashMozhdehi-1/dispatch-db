const { query } = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
        const result = await query(`
          SELECT 
            location_id,
            location_name,
            latitude,
            longitude,
            elevation_m,
            unit_type,
            location_category,
            pit_name,
            region_name
          FROM locations
          WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
          ORDER BY location_id
        `);
    
    const locations = result.rows.map(row => ({
      location_id: row.location_id,
      location_name: row.location_name,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
      unit_type: row.unit_type,
      location_category: row.location_category,
      pit_name: row.pit_name,
      region_name: row.region_name
    }));

    res.status(200).json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
}
