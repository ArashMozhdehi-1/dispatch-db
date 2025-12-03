import { Pool } from 'pg';

// Connect to the Dispatch database
const dispatchPool = new Pool({
  host: process.env.DISPATCH_DB_HOST || 'localhost',
  port: process.env.DISPATCH_DB_PORT || 5434,
  database: process.env.DISPATCH_DB_NAME || 'dispatch_db',
  user: process.env.DISPATCH_DB_USER || 'dispatch_user',
  password: process.env.DISPATCH_DB_PASSWORD || 'dispatch_password',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Fetching dispatch locations from database...');
    
    const allLocations = [];
    
    // 1. Get locations from infrastructure table (primary source, matches GraphQL)
    // Join with unit_types to get the description (Call Point, Dump, etc.)
    try {
      const infrastructureResult = await dispatchPool.query(`
        SELECT 
          i.location_id,
          i.location_name,
          ST_Y(i.center_point) as latitude,
          ST_X(i.center_point) as longitude,
          i.elevation_m,
          ut.description as unit_type,
          CASE 
            WHEN ut.description IN ('Workshop', 'Fuelbay', 'Crusher', 'Stockpile', 'Blast', 'Pit', 'Region', 'Call Point', 'Shiftchange') 
            THEN ut.description
            WHEN ut.description IN ('Truck', 'Shovel', 'Dump', 'Dozer', 'Grader', 'Wheel Dozer', 'Aux Crusher', 'Foreman', 'Water Truck', 'Utility Vehicle', 'Man Bus', 'Generic Auxil', 'Drill')
            THEN ut.description
            ELSE 'Infrastructure'
          END as location_category,
          p.pit_name,
          r.region_name
        FROM infrastructure i
        LEFT JOIN unit_types ut ON i.unit_id = ut.unit_type_id
        LEFT JOIN pits p ON i.pit_id = p.pit_id
        LEFT JOIN regions r ON i.region_id = r.region_id
        WHERE i.center_point IS NOT NULL
          AND i.is_active = true
        ORDER BY i.location_id
      `);
      
      infrastructureResult.rows.forEach(row => {
        allLocations.push({
          location_id: row.location_id,
          location_name: row.location_name,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
          unit_type: row.unit_type || 'Infrastructure',
          location_category: row.location_category || 'Infrastructure',
          pit_name: row.pit_name,
          region_name: row.region_name,
          source: 'infrastructure_table'
        });
      });
      
      console.log(`✅ Infrastructure table: ${infrastructureResult.rows.length} rows`);
    } catch (error) {
      console.log('⚠️ Infrastructure table query failed:', error.message);
    }
    
    // 2. Get locations from locations table (fallback, join with unit_types)
    try {
      const locationsResult = await dispatchPool.query(`
        SELECT 
          l.location_id,
          l.location_name,
          l.latitude,
          l.longitude,
          l.elevation_m,
          COALESCE(ut.description, l.unit_type, 'Infrastructure') as unit_type,
          COALESCE(
            NULLIF(TRIM(l.location_category), ''),
            ut.description,
            'Infrastructure'
          ) AS location_category,
          l.pit_name,
          l.region_name
        FROM locations l
        LEFT JOIN unit_types ut ON 
          (CASE WHEN l.unit_type ~ '^[0-9]+$' THEN l.unit_type::INTEGER ELSE NULL END) = ut.unit_type_id
        WHERE l.latitude IS NOT NULL 
          AND l.longitude IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM infrastructure i 
            WHERE i.location_id = l.location_id
          )
        ORDER BY l.location_id
      `);
      
      locationsResult.rows.forEach(row => {
        allLocations.push({
          location_id: row.location_id,
          location_name: row.location_name,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
          unit_type: row.unit_type || 'Infrastructure',
          location_category: row.location_category || 'Infrastructure',
          pit_name: row.pit_name,
          region_name: row.region_name,
          source: 'locations_table'
        });
      });
      
      console.log(`✅ Locations table: ${locationsResult.rows.length} rows`);
    } catch (error) {
      console.log('⚠️ Locations table query failed:', error.message);
    }

    console.log(`🎯 Total dispatch locations found: ${allLocations.length}`);
    
    // Group by location_category for the UI
    const categoryCounts = {};
    allLocations.forEach(loc => {
      categoryCounts[loc.location_category] = (categoryCounts[loc.location_category] || 0) + 1;
    });
    console.log(`📊 Breakdown by category:`);
    Object.entries(categoryCounts).forEach(([category, count]) => {
      console.log(`   ${category}: ${count} locations`);
    });

    res.status(200).json(allLocations);
  } catch (error) {
    console.error('❌ Error fetching dispatch locations:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

