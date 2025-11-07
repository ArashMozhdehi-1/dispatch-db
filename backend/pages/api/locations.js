const { query } = require('../../lib/database');
const fs = require('fs');
const path = require('path');

// Load decoded coordinates from CSV
function loadDecodedCoordinates() {
  try {
    const csvPath = path.join(process.cwd(), '../../Frontrunner/decoded_coords_full.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').slice(1); // Skip header
    
    const coordinates = [];
    lines.forEach((line, index) => {
      if (line.trim()) {
        const [row, src, easting, northing, z, pairedWith, window] = line.split(',');
        if (easting && northing && parseFloat(easting) > 0 && parseFloat(northing) > 0) {
          coordinates.push({
            id: `decoded_${index}`,
            source: 'decoded_coordinates',
            easting: parseFloat(easting),
            northing: parseFloat(northing),
            elevation: parseFloat(z) || 0,
            row_id: row.trim(),
            paired_with: pairedWith,
            window: window
          });
        }
      }
    });
    
    console.log(`📊 Loaded ${coordinates.length} decoded coordinates from CSV`);
    return coordinates;
  } catch (error) {
    console.log('⚠️ Could not load decoded coordinates:', error.message);
    return [];
  }
}

// Convert UTM to Lat/Lon (approximate)
function utmToLatLon(easting, northing, zone = 46, hemisphere = 'S') {
  // UTM Zone 46 South approximation for Australian mining sites
  const k0 = 0.9996;
  const a = 6378137; // WGS84 semi-major axis
  const e2 = 0.00669438; // WGS84 first eccentricity squared
  
  const x = easting - 500000;
  const y = hemisphere === 'S' ? northing - 10000000 : northing;
  
  const m = y / k0;
  const mu = m / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));
  
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3*e1/2 - 27*e1*e1*e1/32) * Math.sin(2*mu) + 
                (21*e1*e1/16 - 55*e1*e1*e1*e1/32) * Math.sin(4*mu) + 
                (151*e1*e1*e1/96) * Math.sin(6*mu);
  
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1));
  const r1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const t1 = Math.tan(phi1);
  const c1 = e2 * Math.cos(phi1) * Math.cos(phi1) / (1 - e2);
  const d = x / (n1 * k0);
  
  const lat = phi1 - (n1 * t1 / r1) * (d*d/2 - (5 + 3*t1*t1 + 10*c1 - 4*c1*c1 - 9*e2) * d*d*d*d/24 + 
                                       (61 + 90*t1*t1 + 298*c1 + 45*t1*t1*t1*t1 - 252*e2 - 3*c1*c1) * d*d*d*d*d*d/720);
  
  const lon = (d - (1 + 2*t1*t1 + c1) * d*d*d/6 + 
               (5 - 2*c1 + 28*t1*t1 - 3*c1*c1 + 8*e2 + 24*t1*t1*t1*t1) * d*d*d*d*d/120) / Math.cos(phi1);
  
  return {
    latitude: lat * 180 / Math.PI,
    longitude: (lon + (zone - 1) * 6 - 180) * 180 / Math.PI
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Fetching locations from database...');
    
    const allLocations = [];
    
    // 1. Get locations from the locations table (our main data source)
    try {
      const locationsResult = await query(`
        SELECT 
          l.location_id,
          l.location_name,
          l.latitude,
          l.longitude,
          l.elevation_m,
          l.unit_type,
          l.location_category,
          l.pit_name,
          l.region_name,
          ut.description as unit_type_description
        FROM locations l
        LEFT JOIN unit_types ut ON l.unit_type::integer = ut.unit_type_id
        WHERE l.latitude IS NOT NULL 
          AND l.longitude IS NOT NULL
          AND l.latitude BETWEEN -60 AND -20
          AND l.longitude BETWEEN 140 AND 155
        ORDER BY l.location_id
      `);
      
      locationsResult.rows.forEach(row => {
        allLocations.push({
          location_id: row.location_id,
          location_name: row.location_name,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
          unit_type: row.unit_type_description || row.unit_type,
          location_category: row.location_category,
          pit_name: row.pit_name,
          region_name: row.region_name,
          source: 'locations_table'
        });
      });
      
      console.log(`✅ Locations table: ${locationsResult.rows.length} rows`);
    } catch (error) {
      console.log('⚠️ Locations table query failed:', error.message);
    }
    
    // 2. Get locations from infrastructure table
    try {
      const infrastructureResult = await query(`
        SELECT 
          i.infrastructure_id as location_id,
          i.name as location_name,
          ST_Y(i.geometry) as latitude,
          ST_X(i.geometry) as longitude,
          ST_Z(i.geometry) as elevation_m,
          'Infrastructure' as unit_type,
          'infrastructure' as location_category,
          i.name as pit_name,
          'Mining Site' as region_name
        FROM infrastructure i
        WHERE ST_Y(i.geometry) IS NOT NULL 
          AND ST_X(i.geometry) IS NOT NULL
          AND ST_Y(i.geometry) BETWEEN -60 AND -20
          AND ST_X(i.geometry) BETWEEN 140 AND 155
        ORDER BY i.infrastructure_id
      `);
      
      infrastructureResult.rows.forEach(row => {
        allLocations.push({
          location_id: `infra_${row.location_id}`,
          location_name: row.location_name,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          elevation_m: row.elevation_m ? parseFloat(row.elevation_m) : null,
          unit_type: row.unit_type,
          location_category: row.location_category,
          pit_name: row.pit_name,
          region_name: row.region_name,
          source: 'infrastructure_table'
        });
      });
      
      console.log(`✅ Infrastructure table: ${infrastructureResult.rows.length} rows`);
    } catch (error) {
      console.log('⚠️ Infrastructure table query failed:', error.message);
    }
    
    // 3. Load decoded coordinates from CSV (if available)
    const decodedCoords = loadDecodedCoordinates();
    decodedCoords.forEach(coord => {
      const latLon = utmToLatLon(coord.easting, coord.northing);
      allLocations.push({
        location_id: coord.id,
        location_name: `Decoded Point ${coord.row_id}`,
        latitude: latLon.latitude,
        longitude: latLon.longitude,
        elevation_m: coord.elevation,
        unit_type: 'Decoded Coordinate',
        location_category: 'decoded',
        pit_name: 'Frontrunner V3',
        region_name: 'Mining Site',
        source: 'decoded_coordinates',
        easting: coord.easting,
        northing: coord.northing,
        row_id: coord.row_id,
        paired_with: coord.paired_with,
        window: coord.window
      });
    });

    console.log(`🎯 Total locations found: ${allLocations.length}`);
    console.log(`📊 Breakdown by source:`);
    const sourceCounts = {};
    allLocations.forEach(loc => {
      sourceCounts[loc.source] = (sourceCounts[loc.source] || 0) + 1;
    });
    Object.entries(sourceCounts).forEach(([source, count]) => {
      console.log(`   ${source}: ${count} locations`);
    });

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
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}