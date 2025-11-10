#!/usr/bin/env python3
"""
Configuration loader for Frontrunner V3
Loads configuration from config.json with environment variable overrides
"""

import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

_config_cache: Optional[Dict[str, Any]] = None


def load_config() -> Dict[str, Any]:
    """Load configuration from config.json with environment variable overrides"""
    global _config_cache
    
    if _config_cache is not None:
        return _config_cache
    
    config_path = Path(__file__).parent.parent / 'config.json'
    config = {}
    
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception as e:
            logger.warning(f'Failed to load config.json, using defaults: {e}')
    
    env = os.getenv('NODE_ENV', config.get('environment', 'development'))
    
    _config_cache = {
        'app': {
            'name': os.getenv('APP_NAME', config.get('app', {}).get('name', 'Frontrunner V3')),
            'version': os.getenv('APP_VERSION', config.get('app', {}).get('version', '1.0.0')),
            'port': int(os.getenv('PORT', os.getenv('APP_PORT', str(config.get('app', {}).get('port', 3001))))),
            'apiBaseUrl': os.getenv('API_BASE_URL', config.get('app', {}).get('apiBaseUrl', 'http://localhost:3001/api')),
            'nodeEnv': env
        },
        'databases': {
            'mysql': {
                'host': os.getenv('MYSQL_HOST', config.get('databases', {}).get('mysql', {}).get('host', 'mysql')),
                'port': int(os.getenv('MYSQL_PORT', str(config.get('databases', {}).get('mysql', {}).get('port', 3306)))),
                'database': os.getenv('MYSQL_DATABASE', config.get('databases', {}).get('mysql', {}).get('database', 'kmtsdb')),
                'user': os.getenv('MYSQL_USER', config.get('databases', {}).get('mysql', {}).get('user', 'kmtsuser')),
                'password': os.getenv('MYSQL_PASSWORD', config.get('databases', {}).get('mysql', {}).get('password', 'kmtspass')),
                'charset': config.get('databases', {}).get('mysql', {}).get('charset', 'utf8mb4'),
                'poolSize': int(config.get('databases', {}).get('mysql', {}).get('poolSize', 10)),
                'maxRetries': int(config.get('databases', {}).get('mysql', {}).get('maxRetries', 60)),
                'retryDelay': int(config.get('databases', {}).get('mysql', {}).get('retryDelay', 1000))
            },
            'postgres': {
                'host': os.getenv('POSTGRES_HOST', config.get('databases', {}).get('postgres', {}).get('host', 'postgres')),
                'port': int(os.getenv('POSTGRES_PORT', str(config.get('databases', {}).get('postgres', {}).get('port', 5432)))),
                'database': os.getenv('POSTGRES_DATABASE', config.get('databases', {}).get('postgres', {}).get('database', 'infrastructure_db')),
                'user': os.getenv('POSTGRES_USER', config.get('databases', {}).get('postgres', {}).get('user', 'infra_user')),
                'password': os.getenv('POSTGRES_PASSWORD', config.get('databases', {}).get('postgres', {}).get('password', 'infra_password')),
                'poolSize': int(config.get('databases', {}).get('postgres', {}).get('poolSize', 10)),
                'maxRetries': int(config.get('databases', {}).get('postgres', {}).get('maxRetries', 60)),
                'retryDelay': int(config.get('databases', {}).get('postgres', {}).get('retryDelay', 1000))
            }
        },
        'geoserver': {
            'url': os.getenv('GEOSERVER_URL', config.get('geoserver', {}).get('url', 'http://geoserver:8080/geoserver')),
            'publicUrl': os.getenv('GEOSERVER_PUBLIC_URL', config.get('geoserver', {}).get('publicUrl', 'http://localhost:8082/geoserver')),
            'user': os.getenv('GEOSERVER_USER', config.get('geoserver', {}).get('user', 'admin')),
            'password': os.getenv('GEOSERVER_PASSWORD', config.get('geoserver', {}).get('password', 'geoserver')),
            'workspace': os.getenv('GEOSERVER_WORKSPACE', config.get('geoserver', {}).get('workspace', 'frontrunner')),
            'email': os.getenv('GEOSERVER_EMAIL', config.get('geoserver', {}).get('email', 'admin@frontrunner.local')),
            'dataDir': os.getenv('GEOSERVER_DATA_DIR', config.get('geoserver', {}).get('dataDir', '/opt/geoserver/data_dir')),
            'javaOpts': os.getenv('GEOSERVER_JAVA_OPTS', config.get('geoserver', {}).get('javaOpts', '-Xms512m -Xmx2048m -XX:MaxPermSize=512m')),
            'healthCheck': {
                'interval': int(config.get('geoserver', {}).get('healthCheck', {}).get('interval', 30)),
                'timeout': int(config.get('geoserver', {}).get('healthCheck', {}).get('timeout', 10)),
                'retries': int(config.get('geoserver', {}).get('healthCheck', {}).get('retries', 5)),
                'startPeriod': int(config.get('geoserver', {}).get('healthCheck', {}).get('startPeriod', 90))
            }
        },
        'etl': {
            'batchSize': int(os.getenv('BATCH_SIZE', str(config.get('etl', {}).get('batchSize', 1000)))),
            'coordinateBatchSize': int(os.getenv('COORDINATE_BATCH_SIZE', str(config.get('etl', {}).get('coordinateBatchSize', 10000)))),
            'maxWorkers': int(os.getenv('MAX_WORKERS', str(config.get('etl', {}).get('maxWorkers', 4)))),
            'chunkSize': int(os.getenv('CHUNK_SIZE', str(config.get('etl', {}).get('chunkSize', 100)))),
            'enableParallelProcessing': os.getenv('ENABLE_PARALLEL', str(config.get('etl', {}).get('enableParallelProcessing', True))).lower() == 'true',
            'maxRetries': int(config.get('etl', {}).get('maxRetries', 5)),
            'retryBackoffBase': int(config.get('etl', {}).get('retryBackoffBase', 2))
        },
        'spatial': {
            'bounds': {
                'minLatitude': float(os.getenv('MIN_LATITUDE', str(config.get('spatial', {}).get('bounds', {}).get('minLatitude', -60)))),
                'maxLatitude': float(os.getenv('MAX_LATITUDE', str(config.get('spatial', {}).get('bounds', {}).get('maxLatitude', -20)))),
                'minLongitude': float(os.getenv('MIN_LONGITUDE', str(config.get('spatial', {}).get('bounds', {}).get('minLongitude', 100)))),
                'maxLongitude': float(os.getenv('MAX_LONGITUDE', str(config.get('spatial', {}).get('bounds', {}).get('maxLongitude', 160))))
            },
            'sampleSize': int(os.getenv('SAMPLE_SIZE', str(config.get('spatial', {}).get('sampleSize', 50000)))),
            'coordinateSystem': os.getenv('COORDINATE_SYSTEM', config.get('spatial', {}).get('coordinateSystem', 'EPSG:4326'))
        },
        'api': {
            'timeout': int(os.getenv('API_TIMEOUT', str(config.get('api', {}).get('timeout', 30000)))),
            'maxFeatures': int(os.getenv('MAX_FEATURES', str(config.get('api', {}).get('maxFeatures', 50000)))),
            'retryAttempts': int(config.get('api', {}).get('retryAttempts', 3)),
            'retryDelay': int(config.get('api', {}).get('retryDelay', 1000))
        },
        'security': {
            'aesUuidKey': os.getenv('AES_UUID_KEY', config.get('security', {}).get('aesUuidKey', ''))
        },
        'logging': {
            'level': os.getenv('LOG_LEVEL', config.get('logging', {}).get('level', 'info')),
            'format': config.get('logging', {}).get('format', 'json'),
            'enableConsole': config.get('logging', {}).get('enableConsole', True),
            'enableFile': config.get('logging', {}).get('enableFile', False)
        }
    }
    
    return _config_cache


def get_config() -> Dict[str, Any]:
    """Get the full configuration"""
    return load_config()


def get_database_config(db_type: str = 'postgres') -> Dict[str, Any]:
    """Get database configuration"""
    config = load_config()
    return config['databases'].get(db_type, config['databases']['postgres'])


def get_geoserver_config() -> Dict[str, Any]:
    """Get GeoServer configuration"""
    config = load_config()
    return config['geoserver']


def get_etl_config() -> Dict[str, Any]:
    """Get ETL configuration"""
    config = load_config()
    return config['etl']


def get_spatial_config() -> Dict[str, Any]:
    """Get spatial configuration"""
    config = load_config()
    return config['spatial']


def get_api_config() -> Dict[str, Any]:
    """Get API configuration"""
    config = load_config()
    return config['api']



