const http = require('http');
const { getConfig, getDatabaseConfig, getGeoServerConfig } = require('../lib/config');

const config = getConfig();
const geoserverConfig = getGeoServerConfig();
const postgresConfig = getDatabaseConfig('postgres');

const GEOSERVER_URL = geoserverConfig.url;
const GEOSERVER_USER = geoserverConfig.user;
const GEOSERVER_PASSWORD = geoserverConfig.password;
const WORKSPACE = geoserverConfig.workspace;
const POSTGRES_HOST = postgresConfig.host;
const POSTGRES_PORT = postgresConfig.port;
const POSTGRES_DATABASE = postgresConfig.database;
const POSTGRES_USER = postgresConfig.user;
const POSTGRES_PASSWORD = postgresConfig.password;

const auth = Buffer.from(`${GEOSERVER_USER}:${GEOSERVER_PASSWORD}`).toString('base64');

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else if (res.statusCode === 409) {
          resolve({ status: res.statusCode, body: 'Already exists' });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function createWorkspace() {
  console.log('📦 Creating workspace...');
  try {
    const url = new URL(`${GEOSERVER_URL}/rest/workspaces`);
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    const result = await makeRequest({
      hostname: url.hostname,
      port: port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    }, {
      workspace: { name: WORKSPACE }
    });
    console.log('✅ Workspace created');
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('Already exists')) {
      console.log('ℹ️  Workspace already exists');
    } else {
      console.error('❌ Error creating workspace:', e.message);
      throw e;
    }
  }
}

async function createDatastore() {
  console.log('💾 Creating PostGIS datastore...');
  try {
    const url = new URL(`${GEOSERVER_URL}/rest/workspaces/${WORKSPACE}/datastores`);
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    const result = await makeRequest({
      hostname: url.hostname,
      port: port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    }, {
      dataStore: {
        name: 'postgis',
        type: 'PostGIS',
        enabled: true,
        connectionParameters: {
          host: POSTGRES_HOST,
          port: POSTGRES_PORT,
          database: POSTGRES_DATABASE,
          user: POSTGRES_USER,
          passwd: POSTGRES_PASSWORD,
          dbtype: 'postgis',
          schema: 'public',
          'Expose primary keys': 'true'
        }
      }
    });
    console.log('✅ Datastore created');
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('Already exists')) {
      console.log('ℹ️  Datastore already exists');
    } else {
      console.error('❌ Error creating datastore:', e.message);
      throw e;
    }
  }
}

async function publishLayer(layerName, title, abstract) {
  console.log(`🗺️  Publishing layer: ${layerName}...`);
  try {
    const url = new URL(`${GEOSERVER_URL}/rest/workspaces/${WORKSPACE}/datastores/postgis/featuretypes`);
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    const result = await makeRequest({
      hostname: url.hostname,
      port: port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    }, {
      featureType: {
        name: layerName,
        nativeName: layerName,
        title: title,
        abstract: abstract,
        srs: 'EPSG:4326',
        enabled: true,
        store: {
          '@class': 'dataStore',
          name: `${WORKSPACE}:postgis`
        }
      }
    });
    console.log(`✅ Layer ${layerName} published`);
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('Already exists')) {
      console.log(`ℹ️  Layer ${layerName} already exists`);
    } else {
      console.error(`❌ Failed to publish ${layerName}:`, e.message);
      // Don't throw - continue with other layers
    }
  }
}

async function main() {
  console.log('🚀 Initializing GeoServer...');
  console.log(`📍 GeoServer URL: ${GEOSERVER_URL}`);
  console.log(`📦 Workspace: ${WORKSPACE}`);
  
  try {
    await createWorkspace();
    await createDatastore();
    
    // Publish consolidated layers
    await publishLayer(
      'consolidated_locations',
      'Consolidated Locations',
      'Mine locations consolidated into polygons (pits, parking, crushers, etc.)'
    );
    
    await publishLayer(
      'consolidated_intersections',
      'Consolidated Intersections',
      'Road intersections consolidated into polygons'
    );
    
    await publishLayer(
      'survey_points',
      'Survey Points',
      'General survey coordinate points from coordinate table'
    );
    
    console.log('✅ GeoServer initialization complete!');
    console.log(`🌐 WMS: ${GEOSERVER_URL}/${WORKSPACE}/wms`);
    console.log(`🌐 WFS: ${GEOSERVER_URL}/${WORKSPACE}/wfs`);
  } catch (e) {
    console.error('❌ GeoServer initialization failed:', e);
    process.exit(1);
  }
}

main();

const GEOSERVER_URL = process.env.GEOSERVER_URL || 'http://geoserver:8080/geoserver';
const GEOSERVER_USER = process.env.GEOSERVER_USER || 'admin';
const GEOSERVER_PASSWORD = process.env.GEOSERVER_PASSWORD || 'geoserver';
const WORKSPACE = process.env.GEOSERVER_WORKSPACE || 'frontrunner';
const POSTGRES_HOST = process.env.POSTGRES_HOST || 'postgres';
const POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
const POSTGRES_DATABASE = process.env.POSTGRES_DATABASE || 'infrastructure_db';
const POSTGRES_USER = process.env.POSTGRES_USER || 'infra_user';
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'infra_password';

const auth = Buffer.from(`${GEOSERVER_USER}:${GEOSERVER_PASSWORD}`).toString('base64');

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else if (res.statusCode === 409) {
          resolve({ status: res.statusCode, body: 'Already exists' });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function createWorkspace() {
  console.log('📦 Creating workspace...');
  try {
    const url = new URL(`${GEOSERVER_URL}/rest/workspaces`);
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    const result = await makeRequest({
      hostname: url.hostname,
      port: port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    }, {
      workspace: { name: WORKSPACE }
    });
    console.log('✅ Workspace created');
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('Already exists')) {
      console.log('ℹ️  Workspace already exists');
    } else {
      console.error('❌ Error creating workspace:', e.message);
      throw e;
    }
  }
}

async function createDatastore() {
  console.log('💾 Creating PostGIS datastore...');
  try {
    const url = new URL(`${GEOSERVER_URL}/rest/workspaces/${WORKSPACE}/datastores`);
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    const result = await makeRequest({
      hostname: url.hostname,
      port: port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    }, {
      dataStore: {
        name: 'postgis',
        type: 'PostGIS',
        enabled: true,
        connectionParameters: {
          host: POSTGRES_HOST,
          port: POSTGRES_PORT,
          database: POSTGRES_DATABASE,
          user: POSTGRES_USER,
          passwd: POSTGRES_PASSWORD,
          dbtype: 'postgis',
          schema: 'public',
          'Expose primary keys': 'true'
        }
      }
    });
    console.log('✅ Datastore created');
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('Already exists')) {
      console.log('ℹ️  Datastore already exists');
    } else {
      console.error('❌ Error creating datastore:', e.message);
      throw e;
    }
  }
}

async function publishLayer(layerName, title, abstract) {
  console.log(`🗺️  Publishing layer: ${layerName}...`);
  try {
    const url = new URL(`${GEOSERVER_URL}/rest/workspaces/${WORKSPACE}/datastores/postgis/featuretypes`);
    const port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    const result = await makeRequest({
      hostname: url.hostname,
      port: port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    }, {
      featureType: {
        name: layerName,
        nativeName: layerName,
        title: title,
        abstract: abstract,
        srs: 'EPSG:4326',
        enabled: true,
        store: {
          '@class': 'dataStore',
          name: `${WORKSPACE}:postgis`
        }
      }
    });
    console.log(`✅ Layer ${layerName} published`);
  } catch (e) {
    if (e.message.includes('409') || e.message.includes('Already exists')) {
      console.log(`ℹ️  Layer ${layerName} already exists`);
    } else {
      console.error(`❌ Failed to publish ${layerName}:`, e.message);
      // Don't throw - continue with other layers
    }
  }
}

async function main() {
  console.log('🚀 Initializing GeoServer...');
  console.log(`📍 GeoServer URL: ${GEOSERVER_URL}`);
  console.log(`📦 Workspace: ${WORKSPACE}`);
  
  try {
    await createWorkspace();
    await createDatastore();
    
    // Publish consolidated layers
    await publishLayer(
      'consolidated_locations',
      'Consolidated Locations',
      'Mine locations consolidated into polygons (pits, parking, crushers, etc.)'
    );
    
    await publishLayer(
      'consolidated_intersections',
      'Consolidated Intersections',
      'Road intersections consolidated into polygons'
    );
    
    await publishLayer(
      'survey_points',
      'Survey Points',
      'General survey coordinate points from coordinate table'
    );
    
    console.log('✅ GeoServer initialization complete!');
    console.log(`🌐 WMS: ${GEOSERVER_URL}/${WORKSPACE}/wms`);
    console.log(`🌐 WFS: ${GEOSERVER_URL}/${WORKSPACE}/wfs`);
  } catch (e) {
    console.error('❌ GeoServer initialization failed:', e);
    process.exit(1);
  }
}

main();
