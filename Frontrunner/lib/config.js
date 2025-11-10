const fs = require('fs');
const path = require('path');

let configCache = null;

function loadConfig() {
  if (configCache) {
    return configCache;
  }

  const configPath = path.join(__dirname, '..', 'config.json');
  let config = {};

  if (fs.existsSync(configPath)) {
    try {
      const configFile = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(configFile);
    } catch (error) {
      console.warn('⚠️  Failed to load config.json, using defaults:', error.message);
    }
  }

  const env = process.env.NODE_ENV || config.environment || 'development';
  
  configCache = {
    app: {
      name: process.env.APP_NAME || config.app?.name || 'Frontrunner V3',
      version: process.env.APP_VERSION || config.app?.version || '1.0.0',
      port: parseInt(process.env.PORT || process.env.APP_PORT || config.app?.port || '3001'),
      apiBaseUrl: process.env.API_BASE_URL || config.app?.apiBaseUrl || 'http://localhost:3001/api',
      nodeEnv: env
    },
    databases: {
      mysql: {
        host: process.env.MYSQL_HOST || config.databases?.mysql?.host || 'mysql',
        port: parseInt(process.env.MYSQL_PORT || config.databases?.mysql?.port || '3306'),
        database: process.env.MYSQL_DATABASE || config.databases?.mysql?.database || 'kmtsdb',
        user: process.env.MYSQL_USER || config.databases?.mysql?.user || 'kmtsuser',
        password: process.env.MYSQL_PASSWORD || config.databases?.mysql?.password || 'kmtspass',
        charset: config.databases?.mysql?.charset || 'utf8mb4',
        poolSize: parseInt(config.databases?.mysql?.poolSize || '10'),
        maxRetries: parseInt(config.databases?.mysql?.maxRetries || '60'),
        retryDelay: parseInt(config.databases?.mysql?.retryDelay || '1000')
      },
      postgres: {
        host: process.env.POSTGRES_HOST || config.databases?.postgres?.host || 'postgres',
        port: parseInt(process.env.POSTGRES_PORT || config.databases?.postgres?.port || '5432'),
        database: process.env.POSTGRES_DATABASE || config.databases?.postgres?.database || 'infrastructure_db',
        user: process.env.POSTGRES_USER || config.databases?.postgres?.user || 'infra_user',
        password: process.env.POSTGRES_PASSWORD || config.databases?.postgres?.password || 'infra_password',
        poolSize: parseInt(config.databases?.postgres?.poolSize || '10'),
        maxRetries: parseInt(config.databases?.postgres?.maxRetries || '60'),
        retryDelay: parseInt(config.databases?.postgres?.retryDelay || '1000')
      }
    },
    geoserver: {
      url: process.env.GEOSERVER_URL || config.geoserver?.url || 'http://geoserver:8080/geoserver',
      publicUrl: process.env.GEOSERVER_PUBLIC_URL || config.geoserver?.publicUrl || 'http://localhost:8082/geoserver',
      user: process.env.GEOSERVER_USER || config.geoserver?.user || 'admin',
      password: process.env.GEOSERVER_PASSWORD || config.geoserver?.password || 'geoserver',
      workspace: process.env.GEOSERVER_WORKSPACE || config.geoserver?.workspace || 'frontrunner',
      email: process.env.GEOSERVER_EMAIL || config.geoserver?.email || 'admin@frontrunner.local',
      dataDir: process.env.GEOSERVER_DATA_DIR || config.geoserver?.dataDir || '/opt/geoserver/data_dir',
      javaOpts: process.env.GEOSERVER_JAVA_OPTS || config.geoserver?.javaOpts || '-Xms512m -Xmx2048m -XX:MaxPermSize=512m',
      healthCheck: {
        interval: parseInt(config.geoserver?.healthCheck?.interval || '30'),
        timeout: parseInt(config.geoserver?.healthCheck?.timeout || '10'),
        retries: parseInt(config.geoserver?.healthCheck?.retries || '5'),
        startPeriod: parseInt(config.geoserver?.healthCheck?.startPeriod || '90')
      }
    },
    etl: {
      batchSize: parseInt(process.env.BATCH_SIZE || config.etl?.batchSize || '1000'),
      coordinateBatchSize: parseInt(process.env.COORDINATE_BATCH_SIZE || config.etl?.coordinateBatchSize || '10000'),
      maxWorkers: parseInt(process.env.MAX_WORKERS || config.etl?.maxWorkers || '4'),
      chunkSize: parseInt(process.env.CHUNK_SIZE || config.etl?.chunkSize || '100'),
      enableParallelProcessing: (process.env.ENABLE_PARALLEL || config.etl?.enableParallelProcessing || 'true') === 'true',
      maxRetries: parseInt(config.etl?.maxRetries || '5'),
      retryBackoffBase: parseInt(config.etl?.retryBackoffBase || '2')
    },
    spatial: {
      bounds: {
        minLatitude: parseFloat(process.env.MIN_LATITUDE || config.spatial?.bounds?.minLatitude || '-60'),
        maxLatitude: parseFloat(process.env.MAX_LATITUDE || config.spatial?.bounds?.maxLatitude || '-20'),
        minLongitude: parseFloat(process.env.MIN_LONGITUDE || config.spatial?.bounds?.minLongitude || '100'),
        maxLongitude: parseFloat(process.env.MAX_LONGITUDE || config.spatial?.bounds?.maxLongitude || '160')
      },
      sampleSize: parseInt(process.env.SAMPLE_SIZE || config.spatial?.sampleSize || '50000'),
      coordinateSystem: process.env.COORDINATE_SYSTEM || config.spatial?.coordinateSystem || 'EPSG:4326'
    },
    api: {
      timeout: parseInt(process.env.API_TIMEOUT || config.api?.timeout || '30000'),
      maxFeatures: parseInt(process.env.MAX_FEATURES || config.api?.maxFeatures || '50000'),
      retryAttempts: parseInt(config.api?.retryAttempts || '3'),
      retryDelay: parseInt(config.api?.retryDelay || '1000')
    },
    mapbox: {
      token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || config.mapbox?.token || ''
    },
    security: {
      aesUuidKey: process.env.AES_UUID_KEY || config.security?.aesUuidKey || ''
    },
    logging: {
      level: process.env.LOG_LEVEL || config.logging?.level || 'info',
      format: config.logging?.format || 'json',
      enableConsole: config.logging?.enableConsole !== false,
      enableFile: config.logging?.enableFile === true
    }
  };

  return configCache;
}

function getConfig() {
  return loadConfig();
}

function getDatabaseConfig(type = 'postgres') {
  const config = loadConfig();
  return config.databases[type] || config.databases.postgres;
}

function getGeoServerConfig() {
  const config = loadConfig();
  return config.geoserver;
}

function getETLConfig() {
  const config = loadConfig();
  return config.etl;
}

function getSpatialConfig() {
  const config = loadConfig();
  return config.spatial;
}

function getAPIConfig() {
  const config = loadConfig();
  return config.api;
}

module.exports = {
  getConfig,
  getDatabaseConfig,
  getGeoServerConfig,
  getETLConfig,
  getSpatialConfig,
  getAPIConfig,
  loadConfig
};

