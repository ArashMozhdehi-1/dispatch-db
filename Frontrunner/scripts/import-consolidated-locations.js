const { query } = require('../lib/mysql-database');
const { Client } = require('pg');

async function importConsolidatedLocations() {
  console.log('🚀 Starting consolidated locations import from MySQL to PostgreSQL...');
  
  const pgClient = new Client({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'infrastructure_db',
    user: process.env.DB_USER || 'infra_user',
    password: process.env.DB_PASSWORD || 'infra_password'
  });

  try {
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create consolidated_locations table
    await pgClient.query(`
      CREATE EXTENSION IF NOT EXISTS postgis;
    `);

    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS consolidated_locations (
        id SERIAL PRIMARY KEY,
        location_name TEXT NOT NULL,
        category TEXT DEFAULT 'default',
        total_points INTEGER,
        center_latitude DOUBLE PRECISION,
        center_longitude DOUBLE PRECISION,
        avg_altitude DOUBLE PRECISION,
        center_point GEOMETRY(POINT, 4326),
        polygon GEOMETRY(POLYGON, 4326),
        boundary GEOMETRY(LINESTRING, 4326),
        area_sqm DOUBLE PRECISION,
        all_dump_node_ids TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_consolidated_location_name 
      ON consolidated_locations (location_name);
    `);

    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_consolidated_location_polygon 
      ON consolidated_locations USING GIST (polygon);
    `);

    console.log('✅ Created consolidated_locations table');

    // Extract data from MySQL - use the same query pattern as grouped-locations
    // But we need to decrypt coordinates first
    const mysqlResult = await query(`
      SELECT DISTINCT
        pl.name as location_name,
        pl._CID_ as category_type,
        COUNT(DISTINCT c._OID_) as point_count,
        AVG(CAST(c.coord_y AS DECIMAL(10,6))) as avg_lat,
        AVG(CAST(c.coord_x AS DECIMAL(10,6))) as avg_lon,
        AVG(CAST(c.coord_z AS DECIMAL(10,2))) as avg_alt
      FROM pit_loc pl
      INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
      INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
      INNER JOIN coordinate c ON c._OID_ = slsxyz._coordinate
      WHERE pl.name IS NOT NULL
        AND c.coord_x IS NOT NULL
        AND c.coord_y IS NOT NULL
      GROUP BY pl.name, pl._CID_
      HAVING COUNT(DISTINCT c._OID_) >= 3
      ORDER BY pl.name
    `);

    console.log(`✅ Extracted ${mysqlResult.rows.length} locations from MySQL`);

    if (mysqlResult.rows.length === 0) {
      console.log('⚠️ No locations found. Trying alternative query...');
      // Try getting all coordinates for each location
      const altResult = await query(`
        SELECT 
          pl.name as location_name,
          pl._CID_ as category_type,
          c._OID_ as coordinate_id,
          c.coord_x,
          c.coord_y,
          c.coord_z
        FROM pit_loc pl
        INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
        INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
        INNER JOIN coordinate c ON c._OID_ = slsxyz._coordinate
        WHERE pl.name IS NOT NULL
          AND c.coord_x IS NOT NULL
          AND c.coord_y IS NOT NULL
        LIMIT 1000
      `);

      console.log(`Found ${altResult.rows.length} coordinate records`);
      
      // Group by location
      const locationMap = {};
      for (const row of altResult.rows) {
        const locName = row.location_name;
        if (!locationMap[locName]) {
          locationMap[locName] = {
            location_name: locName,
            category: row.category_type || 'default',
            coordinates: []
          };
        }
        locationMap[locName].coordinates.push({
          x: parseFloat(row.coord_x),
          y: parseFloat(row.coord_y),
          z: parseFloat(row.coord_z) || 0
        });
      }

      // Insert into PostgreSQL
      let inserted = 0;
      for (const [locName, locData] of Object.entries(locationMap)) {
        if (locData.coordinates.length < 3) continue;

        const lats = locData.coordinates.map(c => c.y).filter(v => !isNaN(v));
        const lons = locData.coordinates.map(c => c.x).filter(v => !isNaN(v));
        const alts = locData.coordinates.map(c => c.z).filter(v => !isNaN(v));

        if (lats.length === 0 || lons.length === 0) continue;

        const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        const centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;
        const avgAlt = alts.length > 0 ? alts.reduce((a, b) => a + b, 0) / alts.length : null;

        // Create polygon from coordinates
        const polygonCoords = locData.coordinates
          .map(c => `${c.x} ${c.y}`)
          .join(', ');
        
        const polygonWKT = `POLYGON((${polygonCoords}, ${locData.coordinates[0].x} ${locData.coordinates[0].y}))`;

        await pgClient.query(`
          INSERT INTO consolidated_locations (
            location_name, category, total_points,
            center_latitude, center_longitude, avg_altitude,
            center_point, polygon, boundary, area_sqm
          ) VALUES ($1, $2, $3, $4, $5, $6,
            ST_SetSRID(ST_MakePoint($5, $4), 4326),
            ST_SetSRID(ST_GeomFromText($7), 4326),
            ST_ExteriorRing(ST_SetSRID(ST_GeomFromText($7), 4326)),
            ST_Area(ST_SetSRID(ST_GeomFromText($7), 4326)::geography)
          )
          ON CONFLICT DO NOTHING
        `, [
          locName,
          locData.category,
          locData.coordinates.length,
          centerLat,
          centerLon,
          avgAlt,
          polygonWKT
        ]);

        inserted++;
      }

      console.log(`✅ Inserted ${inserted} consolidated locations`);
    } else {
      // Insert aggregated data
      for (const row of mysqlResult.rows) {
        await pgClient.query(`
          INSERT INTO consolidated_locations (
            location_name, category, total_points,
            center_latitude, center_longitude, avg_altitude,
            center_point
          ) VALUES ($1, $2, $3, $4, $5, $6,
            ST_SetSRID(ST_MakePoint($5, $4), 4326)
          )
          ON CONFLICT DO NOTHING
        `, [
          row.location_name,
          row.category_type || 'default',
          parseInt(row.point_count),
          parseFloat(row.avg_lat),
          parseFloat(row.avg_lon),
          row.avg_alt ? parseFloat(row.avg_alt) : null
        ]);
      }
      console.log(`✅ Inserted ${mysqlResult.rows.length} consolidated locations`);
    }

    const countResult = await pgClient.query('SELECT COUNT(*) as count FROM consolidated_locations');
    console.log(`✅ Total consolidated_locations in PostgreSQL: ${countResult.rows[0].count}`);

    await pgClient.end();
    return { success: true, count: countResult.rows[0].count };

  } catch (error) {
    console.error('❌ Error importing consolidated locations:', error);
    await pgClient.end();
    throw error;
  }
}

if (require.main === module) {
  importConsolidatedLocations()
    .then(result => {
      console.log('✅ Import complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Import failed:', error);
      process.exit(1);
    });
}

module.exports = { importConsolidatedLocations };





