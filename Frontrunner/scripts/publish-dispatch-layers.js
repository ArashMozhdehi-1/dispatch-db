#!/usr/bin/env node

const http = require('http');

const GEOSERVER_URL = process.env.GEOSERVER_URL || 'http://localhost:8082/geoserver';
const GEOSERVER_USER = process.env.GEOSERVER_USER || 'admin';
const GEOSERVER_PASSWORD = process.env.GEOSERVER_PASSWORD || 'geoserver';
const WORKSPACE = 'dispatch';
const DATASTORE = 'dispatch_postgis';

// Dispatch database connection
const DISPATCH_DB_HOST = process.env.DISPATCH_DB_HOST || 'host.docker.internal';
const DISPATCH_DB_PORT = process.env.DISPATCH_DB_PORT || '5434';
const DISPATCH_DB_NAME = process.env.DISPATCH_DB_NAME || 'dispatch_db';
const DISPATCH_DB_USER = process.env.DISPATCH_DB_USER || 'dispatch_user';
const DISPATCH_DB_PASSWORD = process.env.DISPATCH_DB_PASSWORD || 'dispatch_password';

const auth = `Basic ${Buffer.from(`${GEOSERVER_USER}:${GEOSERVER_PASSWORD}`).toString('base64')}`;

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, GEOSERVER_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function createWorkspace() {
  console.log(`📁 Creating workspace: ${WORKSPACE}...`);
  try {
    await makeRequest('POST', '/rest/workspaces', {
      workspace: { name: WORKSPACE }
    });
    console.log(`✅ Workspace ${WORKSPACE} created`);
  } catch (error) {
    if (error.message.includes('409')) {
      console.log(`⚠️  Workspace ${WORKSPACE} already exists`);
    } else {
      throw error;
    }
  }
}

async function createDatastore() {
  console.log(`🔌 Creating PostGIS datastore: ${DATASTORE}...`);
  try {
    await makeRequest('POST', `/rest/workspaces/${WORKSPACE}/datastores`, {
      dataStore: {
        name: DATASTORE,
        type: 'PostGIS',
        enabled: true,
        connectionParameters: {
          entry: [
            { '@key': 'host', '$': DISPATCH_DB_HOST },
            { '@key': 'port', '$': DISPATCH_DB_PORT },
            { '@key': 'database', '$': DISPATCH_DB_NAME },
            { '@key': 'user', '$': DISPATCH_DB_USER },
            { '@key': 'passwd', '$': DISPATCH_DB_PASSWORD },
            { '@key': 'dbtype', '$': 'postgis' },
            { '@key': 'schema', '$': 'public' },
            { '@key': 'Expose primary keys', '$': 'true' }
          ]
        }
      }
    });
    console.log(`✅ Datastore ${DATASTORE} created`);
  } catch (error) {
    if (error.message.includes('409')) {
      console.log(`⚠️  Datastore ${DATASTORE} already exists`);
    } else {
      throw error;
    }
  }
}

async function publishLayer(tableName, title) {
  console.log(`📊 Publishing layer: ${tableName}...`);
  try {
    await makeRequest('POST', `/rest/workspaces/${WORKSPACE}/datastores/${DATASTORE}/featuretypes`, {
      featureType: {
        name: tableName,
        nativeName: tableName,
        title: title,
        srs: 'EPSG:4326',
        enabled: true,
        advertised: true,
        store: {
          '@class': 'dataStore',
          name: `${WORKSPACE}:${DATASTORE}`
        }
      }
    });
    console.log(`✅ Layer ${tableName} published`);
  } catch (error) {
    if (error.message.includes('409')) {
      console.log(`⚠️  Layer ${tableName} already exists`);
    } else {
      console.error(`❌ Failed to publish ${tableName}:`, error.message);
    }
  }
}

async function main() {
  console.log('🚀 Publishing Dispatch layers to GeoServer...\n');
  
  try {
    // Step 1: Create workspace
    await createWorkspace();
    
    // Step 2: Create datastore
    await createDatastore();
    
    // Step 3: Publish all Dispatch layers
    const layers = [
      { table: 'locations', title: 'Dispatch Locations' },
      { table: 'infrastructure', title: 'Dispatch Infrastructure' },
      { table: 'lane_segments', title: 'Dispatch Lane Segments' },
      { table: 'trolley_segments', title: 'Dispatch Trolley Lines' },
      { table: 'watering_stations', title: 'Dispatch Watering Stations' },
      { table: 'speed_monitoring', title: 'Dispatch Speed Monitoring' },
      { table: 'intersections', title: 'Dispatch Intersections' }
    ];
    
    for (const layer of layers) {
      await publishLayer(layer.table, layer.title);
    }
    
    console.log('\n✅ All Dispatch layers published successfully!');
    console.log(`\n🌐 View layers at: ${GEOSERVER_URL}/web`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();


