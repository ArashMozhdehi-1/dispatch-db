/**
 * Import intersections from MySQL to PostgreSQL consolidated_intersections table
 * Queries map_intersection table and groups by _location (like "I9")
 */

const mysql = require('mysql2/promise');
const { Client } = require('pg');

// MySQL connection config (from docker-compose.yml)
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  database: process.env.MYSQL_DB || 'kmtsdb',
  user: process.env.MYSQL_USER || 'kmtsuser',
  password: process.env.MYSQL_PASSWORD || 'kmtspass'
};

// PostgreSQL connection config (from docker-compose.yml)
const POSTGRES_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'infrastructure_db',
  user: process.env.DB_USER || 'infra_user',
  password: process.env.DB_PASSWORD || 'infra_password'
};

async function extractIntersectionsFromMySQL() {
  const connection = await mysql.createConnection(MYSQL_CONFIG);
  
  try {
    // Query to get intersections from map_intersection with coordinates
    // Similar to how pit_loc queries work - via survey_location
    const query = `
      SELECT DISTINCT
        mi._OID_ as intersection_id,
        mi.name as intersection_name,
        mi._CID_ as category_type,
        c._OID_ as coordinate_id,
        c.latitude,
        c.longitude,
        c.altitude
      FROM map_intersection mi
      LEFT JOIN map_location ml ON mi.name = ml.name
      LEFT JOIN survey_location sl ON ml._location_survey = sl._OID_
      LEFT JOIN survey_location__shapeloc__x_y_z slsxyz ON sl._OID_ = slsxyz._OID_
      LEFT JOIN coordinate c ON c._OID_ = slsxyz._coordinate
      WHERE c.latitude IS NOT NULL 
        AND c.longitude IS NOT NULL
        AND c.latitude BETWEEN -60 AND -20
        AND c.longitude BETWEEN 100 AND 160
        AND mi.name IS NOT NULL
      ORDER BY mi.name, c._OID_
    `;
    
    const [rows] = await connection.execute(query);
    console.log(`✅ Extracted ${rows.length} intersection coordinate points from MySQL`);
    
    return rows;
  } catch (error) {
    console.error('❌ Error extracting intersections from MySQL:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

function extractLocationIdentifier(name) {
  if (!name) return null;
  
  // Match pattern like "I9", "I10", etc.
  const match = name.match(/^([A-Z]\d+)/);
  if (match) {
    return match[1];
  }
  
  // If name is already just the identifier
  if (/^[A-Z]\d+$/.test(name)) {
    return name;
  }
  
  return name.split('_')[0] || name;
}

async function createConsolidatedIntersectionsTable(pgClient) {
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
    CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_category 
    ON consolidated_intersections (category)
  `);
  
  await pgClient.query(`
    CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_polygon 
    ON consolidated_intersections USING GIST (intersection_polygon)
  `);
  
  await pgClient.query(`
    CREATE INDEX IF NOT EXISTS idx_consolidated_intersection_center 
    ON consolidated_intersections USING GIST (center_point)
  `);
  
  console.log('Created consolidated_intersections table and indexes');
}

async function insertIntersectionsToPostgres(intersections, pgClient) {
  // First, insert into staging table
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS intersection_points_staging (
      id SERIAL PRIMARY KEY,
      intersection_id VARCHAR(32),
      intersection_name VARCHAR(32),
      _location VARCHAR(32),
      category VARCHAR(50),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      altitude DOUBLE PRECISION,
      geometry_point GEOMETRY(POINT, 4326),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Clear staging table
  await pgClient.query('TRUNCATE TABLE intersection_points_staging');
  
  // Insert points
  for (const row of intersections) {
    const _location = extractLocationIdentifier(row.intersection_name);
    if (!_location) continue;
    
    await pgClient.query(`
      INSERT INTO intersection_points_staging (
        intersection_id, intersection_name, _location, category,
        latitude, longitude, altitude, geometry_point
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($6, $5), 4326))
    `, [
      row.intersection_id,
      row.intersection_name,
      _location,
      row.category_type || 'intersection',
      row.latitude,
      row.longitude,
      row.altitude
    ]);
  }
  
  console.log(`✅ Inserted ${intersections.length} intersection points into staging table`);
}

async function consolidateIntersections(pgClient) {
  // Clear existing
  await pgClient.query('TRUNCATE TABLE consolidated_intersections');
  
  // Consolidate from staging
  const result = await pgClient.query(`
    INSERT INTO consolidated_intersections (
      intersection_name, category, total_points,
      center_latitude, center_longitude, avg_altitude,
      center_point, intersection_polygon, intersection_boundary,
      area_sqm, first_recorded, last_recorded
    )
    SELECT 
      _location as intersection_name,
      COALESCE(category, 'intersection') as category,
      count(*) as total_points,
      avg(latitude) as center_latitude,
      avg(longitude) as center_longitude,
      avg(altitude) as avg_altitude,
      ST_Centroid(ST_Collect(geometry_point)) as center_point,
      ST_ConvexHull(ST_Collect(geometry_point)) as intersection_polygon,
      ST_ExteriorRing(ST_ConvexHull(ST_Collect(geometry_point))) as intersection_boundary,
      ST_Area(ST_ConvexHull(ST_Collect(geometry_point))::geography) as area_sqm,
      min(created_at) as first_recorded,
      max(created_at) as last_recorded
    FROM intersection_points_staging
    WHERE geometry_point IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND _location IS NOT NULL
    GROUP BY _location, COALESCE(category, 'intersection')
  `);
  
  console.log(`✅ Consolidated ${result.rowCount} intersections`);
  
  // Show summary
  const summary = await pgClient.query(`
    SELECT 
      count(*) as total_intersections,
      sum(total_points) as total_points,
      avg(total_points) as avg_points,
      sum(area_sqm) as total_area_sqm
    FROM consolidated_intersections
  `);
  
  const row = summary.rows[0];
  console.log(`📊 Summary: ${row.total_intersections} intersections, ${row.total_points} total points, ${parseFloat(row.avg_points).toFixed(1)} avg points, ${parseFloat(row.total_area_sqm).toFixed(0)} sqm total area`);
}

async function main() {
  console.log('🚀 Starting intersection import from MySQL to PostgreSQL...');
  
  const pgClient = new Client(POSTGRES_CONFIG);
  
  try {
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');
    
    // Step 1: Create table
    await createConsolidatedIntersectionsTable(pgClient);
    
    // Step 2: Extract from MySQL
    const intersections = await extractIntersectionsFromMySQL();
    
    if (intersections.length === 0) {
      console.log('⚠️  No intersections found in MySQL. Checking if they exist in locations table...');
      // Try consolidating from locations table instead
      await pgClient.query(`
        INSERT INTO consolidated_intersections (
          intersection_name, category, total_points,
          center_latitude, center_longitude, avg_altitude,
          center_point, intersection_polygon, intersection_boundary,
          area_sqm, first_recorded, last_recorded
        )
        SELECT 
          CASE 
            WHEN location_name ~ '^[A-Z]\\d+' THEN 
              SUBSTRING(location_name FROM '^([A-Z]\\d+)')
            ELSE 
              location_name
          END as intersection_name,
          'intersection' as category,
          count(*) as total_points,
          avg(latitude) as center_latitude,
          avg(longitude) as center_longitude,
          avg(altitude) as avg_altitude,
          ST_Centroid(ST_Collect(geometry_point)) as center_point,
          ST_ConvexHull(ST_Collect(geometry_point)) as intersection_polygon,
          ST_ExteriorRing(ST_ConvexHull(ST_Collect(geometry_point))) as intersection_boundary,
          ST_Area(ST_ConvexHull(ST_Collect(geometry_point))::geography) as area_sqm,
          min(created_at) as first_recorded,
          max(created_at) as last_recorded
        FROM locations 
        WHERE (
          category = 'intersection'
          OR location_name ~ '^I\\d+'
          OR location_name ILIKE '%intersection%'
        )
          AND geometry_point IS NOT NULL
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
        GROUP BY 
          CASE 
            WHEN location_name ~ '^[A-Z]\\d+' THEN 
              SUBSTRING(location_name FROM '^([A-Z]\\d+)')
            ELSE 
              location_name
          END
      `);
      
      const checkResult = await pgClient.query('SELECT count(*) FROM consolidated_intersections');
      console.log(`✅ Consolidated ${checkResult.rows[0].count} intersections from locations table`);
    } else {
      // Step 3: Insert to staging
      await insertIntersectionsToPostgres(intersections, pgClient);
      
      // Step 4: Consolidate
      await consolidateIntersections(pgClient);
    }
    
    console.log('✅ Intersection import completed!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };





