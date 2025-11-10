const mysql = require('mysql2/promise');
const { Client } = require('pg');
const { getDatabaseConfig, getETLConfig, getSpatialConfig } = require('../lib/config');

const config = require('../lib/config').getConfig();
const mysqlConfig = getDatabaseConfig('mysql');
const postgresConfig = getDatabaseConfig('postgres');
const etlConfig = getETLConfig();
const spatialConfig = getSpatialConfig();

const MYSQL_CONFIG = {
  host: mysqlConfig.host,
  port: mysqlConfig.port,
  user: mysqlConfig.user,
  password: mysqlConfig.password,
  database: mysqlConfig.database
};

const POSTGRES_CONFIG = {
  host: postgresConfig.host,
  port: postgresConfig.port,
  user: postgresConfig.user,
  password: postgresConfig.password,
  database: postgresConfig.database
};

const BATCH_SIZE = etlConfig.coordinateBatchSize;

async function createCoordinateTable(pgClient) {
  console.log('📝 Creating coordinate table...');
  
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS coordinate (
      _OID_ VARCHAR(32) PRIMARY KEY,
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
  
  await pgClient.query(`
    CREATE INDEX IF NOT EXISTS idx_coordinate_geom ON coordinate USING GIST (geometry_point)
  `);
  
  await pgClient.query(`
    CREATE INDEX IF NOT EXISTS idx_coordinate_coords ON coordinate (latitude, longitude)
  `);
  
  console.log('✅ Coordinate table created');
}

async function importCoordinates() {
  console.log('🚀 Starting coordinate import...');
  
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  const pgClient = new Client(POSTGRES_CONFIG);
  await pgClient.connect();
  
  // Get total count
  const [countResult] = await mysqlConn.execute(`
    SELECT COUNT(*) as total 
    FROM coordinate 
    WHERE latitude IS NOT NULL 
    AND longitude IS NOT NULL
    AND latitude BETWEEN ? AND ?
    AND longitude BETWEEN ? AND ?
  `, [
    spatialConfig.bounds.minLatitude,
    spatialConfig.bounds.maxLatitude,
    spatialConfig.bounds.minLongitude,
    spatialConfig.bounds.maxLongitude
  ]);
  const total = countResult[0].total;
  console.log(`📊 Found ${total.toLocaleString()} valid coordinates in MySQL`);
  
  // Truncate existing data
  await pgClient.query('TRUNCATE TABLE coordinate');
  console.log('🗑️  Cleared existing coordinate data');
  
  // Import in batches
  let imported = 0;
  let offset = 0;
  
  const query = `
    SELECT 
      _OID_,
      latitude,
      longitude,
      altitude,
      coord_x,
      coord_y,
      coord_z,
      coord_heading,
      coord_incl,
      coord_status
    FROM coordinate 
    WHERE latitude IS NOT NULL 
    AND longitude IS NOT NULL
    AND latitude BETWEEN ? AND ?
    AND longitude BETWEEN ? AND ?
    ORDER BY _OID_
  `;
  
  const [rows] = await mysqlConn.execute(query, [
    spatialConfig.bounds.minLatitude,
    spatialConfig.bounds.maxLatitude,
    spatialConfig.bounds.minLongitude,
    spatialConfig.bounds.maxLongitude
  ]);
  console.log(`📊 Fetched ${rows.length.toLocaleString()} rows from MySQL`);
  
  // Process in batches using COPY for better performance
  const insertQuery = `
    INSERT INTO coordinate (
      _OID_, latitude, longitude, altitude,
      coord_x, coord_y, coord_z,
      coord_heading, coord_incl, coord_status,
      geometry_point
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ST_SetSRID(ST_MakePoint($3, $2), 4326))
    ON CONFLICT (_OID_) DO UPDATE SET
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      altitude = EXCLUDED.altitude,
      coord_x = EXCLUDED.coord_x,
      coord_y = EXCLUDED.coord_y,
      coord_z = EXCLUDED.coord_z,
      coord_heading = EXCLUDED.coord_heading,
      coord_incl = EXCLUDED.coord_incl,
      coord_status = EXCLUDED.coord_status,
      geometry_point = EXCLUDED.geometry_point
  `;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(row => 
      pgClient.query(insertQuery, [
        String(row._OID_),
        row.latitude,
        row.longitude,
        row.altitude || null,
        row.coord_x || null,
        row.coord_y || null,
        row.coord_z || null,
        row.coord_heading || null,
        row.coord_incl || null,
        row.coord_status || null
      ])
    );
    
    await Promise.all(promises);
    
    imported += batch.length;
    
    if (imported % 100000 === 0 || imported === rows.length) {
      console.log(`📊 Imported ${imported.toLocaleString()}/${rows.length.toLocaleString()} coordinates (${(100*imported/rows.length).toFixed(1)}%)`);
    }
  }
  
  await mysqlConn.end();
  await pgClient.end();
  
  console.log(`✅ Imported ${imported.toLocaleString()} coordinates`);
  return imported;
}

async function updateAllSurveyPoints() {
  console.log('🔄 Updating all_survey_points table...');
  const pgClient = new Client(POSTGRES_CONFIG);
  await pgClient.connect();
  
  const result = await pgClient.query(`
    INSERT INTO all_survey_points (
      coordinate_id, latitude, longitude, altitude,
      coord_x, coord_y, coord_z, coord_heading, coord_incl, coord_status,
      location_name, location_type, the_geom
    )
    SELECT 
      'coord_' || _OID_ as coordinate_id,
      latitude,
      longitude,
      COALESCE(altitude, 0.0) as altitude,
      coord_x,
      coord_y,
      coord_z,
      coord_heading,
      coord_incl,
      coord_status,
      'Coordinate Point' as location_name,
      'coordinate' as location_type,
      geometry_point as the_geom
    FROM coordinate
    WHERE latitude IS NOT NULL 
    AND longitude IS NOT NULL
    AND latitude BETWEEN $1 AND $2
    AND longitude BETWEEN $3 AND $4
    ON CONFLICT (coordinate_id) DO UPDATE SET
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      altitude = EXCLUDED.altitude,
      coord_x = EXCLUDED.coord_x,
      coord_y = EXCLUDED.coord_y,
      coord_z = EXCLUDED.coord_z,
      coord_heading = EXCLUDED.coord_heading,
      coord_incl = EXCLUDED.coord_incl,
      coord_status = EXCLUDED.coord_status,
      location_name = EXCLUDED.location_name,
      location_type = EXCLUDED.location_type,
      the_geom = EXCLUDED.the_geom
  `, [
    spatialConfig.bounds.minLatitude,
    spatialConfig.bounds.maxLatitude,
    spatialConfig.bounds.minLongitude,
    spatialConfig.bounds.maxLongitude
  ]);
  
  const count = result.rowCount;
  const totalResult = await pgClient.query('SELECT COUNT(*) as total FROM all_survey_points');
  const total = parseInt(totalResult.rows[0].total);
  
  await pgClient.end();
  console.log(`✅ Added ${count.toLocaleString()} coordinate points to all_survey_points (total: ${total.toLocaleString()})`);
  return total;
}

async function main() {
  console.log('🚀 Starting coordinate import from MySQL to PostgreSQL...');
  console.log('='.repeat(60));
  
  try {
    const pgClient = new Client(POSTGRES_CONFIG);
    await pgClient.connect();
    await createCoordinateTable(pgClient);
    await pgClient.end();
    
    const imported = await importCoordinates();
    const totalPoints = await updateAllSurveyPoints();
    
    console.log('='.repeat(60));
    console.log('✅ COORDINATE IMPORT COMPLETE!');
    console.log(`📊 Imported: ${imported.toLocaleString()} coordinates`);
    console.log(`📊 Total points in all_survey_points: ${totalPoints.toLocaleString()}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
