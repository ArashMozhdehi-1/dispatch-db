const { query } = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Fetching locations from infrastructure table...');
    
    // Get unit types from database first
    console.log('🔍 Getting unit types from database...');
    const unitTypesResult = await query(`
      SELECT unit_type_id, description 
      FROM unit_types 
      ORDER BY unit_type_id
    `);
    
    const unitTypeMapping = {};
    unitTypesResult.rows.forEach(row => {
      unitTypeMapping[row.unit_type_id.toString()] = row.description;
    });
    console.log('📋 Unit type mapping from DB:', unitTypeMapping);

    // First try infrastructure table with proper unit type names
    let result;
    try {
      result = await query(`
        SELECT 
          i.location_id,
          i.location_name,
          ST_Y(i.center_point) as latitude,
          ST_X(i.center_point) as longitude,
          i.elevation_m,
          i.unit_id
        FROM infrastructure i
        WHERE ST_Y(i.center_point) IS NOT NULL 
          AND ST_X(i.center_point) IS NOT NULL
          AND ST_Y(i.center_point) BETWEEN -60 AND -20
          AND ST_X(i.center_point) BETWEEN 140 AND 155
        ORDER BY i.location_id
      `);
      console.log('✅ Infrastructure table query successful:', result.rows.length, 'rows');
      
    } catch (infraError) {
      console.log('⚠️ Infrastructure table failed, trying locations table...', infraError.message);
      // Fallback to locations table
      result = await query(`
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
          AND latitude BETWEEN -60 AND -20
          AND longitude BETWEEN 140 AND 155
        ORDER BY location_id
      `);
      console.log('✅ Locations table query successful:', result.rows.length, 'rows');
    }
    
    const locations = result.rows.map(row => {
      // Get unit type name from database mapping
      let unitType;
      if (row.unit_id) {
        // From infrastructure table
        unitType = unitTypeMapping[row.unit_id.toString()] || `Type ${row.unit_id}`;
      } else if (row.unit_type) {
        // From locations table
        unitType = row.unit_type;
      } else {
        unitType = 'Unknown';
      }
      
      return {
        location_id: row.location_id,
        location_name: row.location_name,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
        unit_type: unitType,
        location_category: row.location_category || 'infrastructure',
        pit_name: row.pit_name || 'Unknown',
        region_name: row.region_name || 'Unknown'
      };
    });

    res.status(200).json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
}
