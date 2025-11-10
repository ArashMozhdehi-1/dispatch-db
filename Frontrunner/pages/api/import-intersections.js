const { query } = require('../../lib/mysql-database');
const { Client } = require('pg');

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 Starting intersection import from MySQL to PostgreSQL...');

    // PostgreSQL connection - use DB_HOST if set (e.g., 'postgres' in Docker), otherwise 'localhost'
    const pgHost = process.env.DB_HOST || 'localhost';
    const pgPort = parseInt(process.env.DB_PORT || (pgHost === 'postgres' ? '5432' : '5433'));
    
    const pgClient = new Client({
      host: pgHost,
      port: parseInt(pgPort),
      database: process.env.DB_NAME || 'infrastructure_db',
      user: process.env.DB_USER || 'infra_user',
      password: process.env.DB_PASSWORD || 'infra_password'
    });

    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // Step 1: Create consolidated_intersections table with all fields
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS consolidated_intersections (
        id SERIAL PRIMARY KEY,
        intersection_name TEXT NOT NULL,
        category TEXT DEFAULT 'intersection',
        total_points INTEGER,
        center_latitude DOUBLE PRECISION,
        center_longitude DOUBLE PRECISION,
        avg_altitude DOUBLE PRECISION,
        center_point GEOMETRY(POINT, 4326),
        intersection_polygon GEOMETRY(POLYGON, 4326),
        intersection_boundary GEOMETRY(LINESTRING, 4326),
        area_sqm DOUBLE PRECISION,
        all_intersection_ids TEXT[],  -- Array of all intersection _OID_ values
        all_coordinate_ids TEXT[],    -- Array of all coordinate _OID_ values
        source_tables TEXT[],         -- Array of source tables (map_intersection, pit_loc)
        first_recorded TIMESTAMP,
        last_recorded TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_name 
      ON consolidated_intersections (intersection_name)
    `);

    await pgClient.query(`
      CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_polygon 
      ON consolidated_intersections USING GIST (intersection_polygon)
    `);

    console.log('✅ Created consolidated_intersections table');

    // Step 2: Extract intersections from MySQL
    // Query pit_loc table with _CID_ = 'pit_loc_intersection' (same pattern as grouped-locations.js)
    const mysqlResult = await query(`
      SELECT DISTINCT
        pl._OID_ as intersection_id,
        pl.name as intersection_name,
        pl._CID_ as category_type,
        'pit_loc' as source_table,
        c._OID_ as coordinate_id,
        c.latitude,
        c.longitude,
        c.altitude,
        c.coord_x,
        c.coord_y,
        c.coord_z,
        c.coord_heading,
        c.coord_incl,
        c.coord_status
      FROM pit_loc pl
      INNER JOIN survey_location sl ON pl._location_survey = sl._OID_
      INNER JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
      INNER JOIN coordinate c ON c._OID_ = slsxyz._coordinate
      WHERE pl._CID_ = 'pit_loc_intersection'
        AND c.latitude IS NOT NULL 
        AND c.longitude IS NOT NULL
        AND c.latitude BETWEEN -60 AND -20
        AND c.longitude BETWEEN 100 AND 160
        AND pl.name IS NOT NULL
      ORDER BY pl.name, c._OID_
    `);

    console.log(`✅ Extracted ${mysqlResult.rows.length} intersection points from MySQL`);
    
    // Debug: Show sample data
    if (mysqlResult.rows.length > 0) {
      console.log('📊 Sample intersection data:', JSON.stringify(mysqlResult.rows.slice(0, 3), null, 2));
    } else {
      console.warn('⚠️ WARNING: No intersections found in MySQL!');
      console.log('🔍 Checking if pit_loc table exists and has data...');
      
      // Debug query to check what's in pit_loc
      const debugResult = await query(`
        SELECT COUNT(*) as total, 
               COUNT(CASE WHEN _CID_ = 'pit_loc_intersection' THEN 1 END) as intersections
        FROM pit_loc
      `);
      console.log('📊 pit_loc table stats:', debugResult.rows[0]);
      
      await pgClient.end();
      return res.status(200).json({ 
        success: false,
        message: 'No intersections found in MySQL',
        debug: debugResult.rows[0],
        imported: 0 
      });
    }

    // Step 3: Create staging table with all coordinate data
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS intersection_points_staging (
        id SERIAL PRIMARY KEY,
        intersection_id VARCHAR(32),
        intersection_name VARCHAR(32),
        _location VARCHAR(32),
        category VARCHAR(50),
        source_table VARCHAR(50),
        coordinate_id VARCHAR(32),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        altitude DOUBLE PRECISION,
        coord_x DOUBLE PRECISION,
        coord_y DOUBLE PRECISION,
        coord_z DOUBLE PRECISION,
        coord_heading DOUBLE PRECISION,
        coord_incl DOUBLE PRECISION,
        coord_status DOUBLE PRECISION,
        geometry_point GEOMETRY(POINT, 4326),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pgClient.query('TRUNCATE TABLE intersection_points_staging');

    function extractLocationIdentifier(name) {
      if (!name) return null;
      const nameStr = String(name).trim();
      
      if (/^[A-Z]\d+$/.test(nameStr)) {
        return nameStr;
      }
      
      if (nameStr.includes('_')) {
        const parts = nameStr.split('_');
        const firstPart = parts[0];
        const secondPart = parts[1];
        
        if (/^[A-Z]\d+$/.test(firstPart) && /^(point|pt|coord|p)\d*$/i.test(secondPart)) {
          return firstPart;
        }
        
        return nameStr;
      }
      
      return nameStr;
    }
    
    console.log(`📊 Sample intersection names:`, mysqlResult.rows.slice(0, 5).map(r => r.intersection_name));

    // Step 4: Insert points into staging with all coordinate data
    let insertedCount = 0;
    let skippedCount = 0;
    const locationGroups = {};
    
    for (const row of mysqlResult.rows) {
      const _location = extractLocationIdentifier(row.intersection_name);
      if (!_location) {
        skippedCount++;
        console.warn(`⚠️ Skipping row with no _location extracted from name: ${row.intersection_name}`);
        continue;
      }
      
      // Track location groups
      if (!locationGroups[_location]) {
        locationGroups[_location] = 0;
      }
      locationGroups[_location]++;

      await pgClient.query(`
        INSERT INTO intersection_points_staging (
          intersection_id, intersection_name, _location, category, source_table,
          coordinate_id, latitude, longitude, altitude,
          coord_x, coord_y, coord_z, coord_heading, coord_incl, coord_status,
          geometry_point
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
                 ST_SetSRID(ST_MakePoint($8, $7), 4326))
      `, [
        row.intersection_id,
        row.intersection_name,
        _location,
        row.category_type || 'intersection',
        row.source_table || 'unknown',
        row.coordinate_id,
        row.latitude,
        row.longitude,
        row.altitude,
        row.coord_x,
        row.coord_y,
        row.coord_z,
        row.coord_heading,
        row.coord_incl,
        row.coord_status
      ]);
      insertedCount++;
    }

    console.log(`✅ Inserted ${insertedCount} points into staging table (skipped ${skippedCount})`);
    console.log(`📊 Location groups found: ${Object.keys(locationGroups).length}`, Object.keys(locationGroups).slice(0, 10));
    
    // Verify staging table has data
    const stagingCheck = await pgClient.query('SELECT COUNT(*) as count FROM intersection_points_staging');
    console.log(`📊 Staging table has ${stagingCheck.rows[0].count} rows`);
    
    if (parseInt(stagingCheck.rows[0].count) === 0) {
      await pgClient.end();
      return res.status(500).json({
        success: false,
        message: 'No data inserted into staging table',
        inserted: insertedCount,
        skipped: skippedCount
      });
    }

    // Step 5: Consolidate into polygons
    await pgClient.query('TRUNCATE TABLE consolidated_intersections');
    
    console.log('🔄 Consolidating intersections into polygons...');
    
    // First, let's check what we have in staging
    const stagingPreview = await pgClient.query(`
      SELECT _location, COUNT(*) as point_count
      FROM intersection_points_staging
      GROUP BY _location
      ORDER BY point_count DESC
      LIMIT 5
    `);
    console.log('📊 Preview of staging data:', stagingPreview.rows);

    const consolidateResult = await pgClient.query(`
      INSERT INTO consolidated_intersections (
        intersection_name, category, total_points,
        center_latitude, center_longitude, avg_altitude,
        center_point, intersection_polygon, intersection_boundary,
        area_sqm, all_intersection_ids, all_coordinate_ids, source_tables,
        first_recorded, last_recorded
      )
      SELECT 
        _location as intersection_name,
        COALESCE(category, 'intersection') as category,
        count(*) as total_points,
        avg(latitude) as center_latitude,
        avg(longitude) as center_longitude,
        avg(COALESCE(altitude, 0)) as avg_altitude,
        ST_Centroid(ST_Collect(geometry_point)) as center_point,
        ST_ConvexHull(ST_Collect(geometry_point)) as intersection_polygon,
        ST_ExteriorRing(ST_ConvexHull(ST_Collect(geometry_point))) as intersection_boundary,
        ST_Area(ST_ConvexHull(ST_Collect(geometry_point))::geography) as area_sqm,
        array_agg(DISTINCT intersection_id) FILTER (WHERE intersection_id IS NOT NULL) as all_intersection_ids,
        array_agg(DISTINCT coordinate_id) FILTER (WHERE coordinate_id IS NOT NULL) as all_coordinate_ids,
        array_agg(DISTINCT source_table) FILTER (WHERE source_table IS NOT NULL) as source_tables,
        min(created_at) as first_recorded,
        max(created_at) as last_recorded
      FROM intersection_points_staging
      WHERE geometry_point IS NOT NULL
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND _location IS NOT NULL
      GROUP BY _location, COALESCE(category, 'intersection')
      HAVING count(*) >= 1
    `);

    console.log(`✅ Consolidated ${consolidateResult.rowCount} intersections`);
    
    if (consolidateResult.rowCount === 0) {
      console.error('❌ ERROR: Consolidation query returned 0 rows!');
      
      // Check what's in staging
      const stagingDetails = await pgClient.query(`
        SELECT _location, COUNT(*) as point_count, 
               COUNT(DISTINCT intersection_id) as intersection_count
        FROM intersection_points_staging
        GROUP BY _location
        ORDER BY point_count DESC
        LIMIT 10
      `);
      console.log('📊 Staging table details:', stagingDetails.rows);
      
      await pgClient.end();
      return res.status(500).json({
        success: false,
        message: 'Consolidation failed - no intersections created',
        staging_details: stagingDetails.rows,
        imported: 0
      });
    }

    // Get summary
    const summary = await pgClient.query(`
      SELECT 
        count(*) as total_intersections,
        sum(total_points) as total_points,
        avg(total_points) as avg_points,
        sum(area_sqm) as total_area_sqm
      FROM consolidated_intersections
    `);

    const summaryRow = summary.rows[0];

    // Show some examples
    const examples = await pgClient.query(`
      SELECT intersection_name, total_points, area_sqm
      FROM consolidated_intersections
      ORDER BY total_points DESC
      LIMIT 10
    `);

    await pgClient.end();

    res.status(200).json({
      success: true,
      message: 'Intersections imported successfully',
      imported: consolidateResult.rowCount,
      summary: {
        total_intersections: parseInt(summaryRow.total_intersections),
        total_points: parseInt(summaryRow.total_points || 0),
        avg_points: parseFloat(summaryRow.avg_points || 0).toFixed(1),
        total_area_sqm: parseFloat(summaryRow.total_area_sqm || 0).toFixed(0)
      },
      examples: examples.rows
    });

  } catch (error) {
    console.error('❌ Error importing intersections:', error);
    console.error('❌ Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}