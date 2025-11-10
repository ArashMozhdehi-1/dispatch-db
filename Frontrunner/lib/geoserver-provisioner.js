import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'dispatch_db',
  user: process.env.DB_USER || 'dispatch_user',
  password: process.env.DB_PASSWORD || 'dispatch_password',
});

const GEOSERVER_URL = process.env.GEOSERVER_URL || 'http://localhost:8082/geoserver';
const GEOSERVER_USER = process.env.GEOSERVER_USER || 'admin';
const GEOSERVER_PASSWORD = process.env.GEOSERVER_PASSWORD || 'geoserver';

export class GeoServerProvisioner {
  constructor() {
    this.baseUrl = GEOSERVER_URL;
    this.auth = btoa(`${GEOSERVER_USER}:${GEOSERVER_PASSWORD}`);
  }

  async provisionLayer(manifest) {
    try {
      console.log(`Provisioning layer: ${manifest.layerId}`);
      
      // Step 1: Ensure workspace exists
      await this.ensureWorkspace(manifest.workspace);
      
      // Step 2: Configure data store
      await this.configureDataStore(manifest);
      
      // Step 3: Publish feature type
      await this.publishFeatureType(manifest);
      
      // Step 4: Configure services
      await this.configureServices(manifest);
      
      // Step 5: Apply styling
      await this.applyStyling(manifest);
      
      // Step 6: Configure caching
      if (manifest.caching?.enabled) {
        await this.configureCaching(manifest);
      }
      
      console.log(`Successfully provisioned layer: ${manifest.layerId}`);
      return { success: true, layerId: manifest.layerId };
      
    } catch (error) {
      console.error(`Failed to provision layer ${manifest.layerId}:`, error);
      throw error;
    }
  }

  async ensureWorkspace(workspaceName) {
    const workspaceUrl = `${this.baseUrl}/rest/workspaces`;
    
    try {
      // Check if workspace exists
      const checkResponse = await fetch(`${workspaceUrl}/${workspaceName}`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (checkResponse.ok) {
        console.log(`Workspace ${workspaceName} already exists`);
        return;
      }

      // Create workspace
      const workspaceConfig = {
        workspace: {
          name: workspaceName,
          isolated: false
        }
      };

      const response = await fetch(workspaceUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(workspaceConfig)
      });

      if (!response.ok) {
        throw new Error(`Failed to create workspace: ${response.statusText}`);
      }

      console.log(`Created workspace: ${workspaceName}`);
    } catch (error) {
      console.error(`Error ensuring workspace ${workspaceName}:`, error);
      throw error;
    }
  }

  async configureDataStore(manifest) {
    const { dataSource, workspace } = manifest;
    const datastoreUrl = `${this.baseUrl}/rest/workspaces/${workspace}/datastores`;
    
    try {
      // Check if datastore exists
      const checkResponse = await fetch(`${datastoreUrl}/${dataSource.connection.database}`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (checkResponse.ok) {
        console.log(`Datastore ${dataSource.connection.database} already exists`);
        return;
      }

      let datastoreConfig;

      switch (dataSource.type) {
        case 'postgis':
          datastoreConfig = {
            dataStore: {
              name: dataSource.connection.database,
              connectionParameters: {
                host: dataSource.connection.host || 'postgres',
                port: dataSource.connection.port || 5432,
                database: dataSource.connection.database,
                schema: dataSource.connection.schema || 'public',
                user: dataSource.connection.username,
                passwd: dataSource.connection.password,
                dbtype: 'postgis',
                'Expose primary keys': 'true'
              }
            }
          };
          break;
        
        case 'geotiff':
          datastoreConfig = {
            dataStore: {
              name: dataSource.connection.filePath.split('/').pop(),
              type: 'GeoTIFF',
              connectionParameters: {
                url: dataSource.connection.filePath
              }
            }
          };
          break;
        
        default:
          throw new Error(`Unsupported data source type: ${dataSource.type}`);
      }

      const response = await fetch(datastoreUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(datastoreConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create datastore: ${response.statusText} - ${errorText}`);
      }

      console.log(`Created datastore: ${dataSource.connection.database}`);
    } catch (error) {
      console.error(`Error configuring datastore:`, error);
      throw error;
    }
  }

  async publishFeatureType(manifest) {
    const { layerId, workspace, dataSource, geometry, metadata } = manifest;
    const featureTypeUrl = `${this.baseUrl}/rest/workspaces/${workspace}/datastores/${dataSource.connection.database}/featuretypes`;
    
    try {
      // Check if feature type exists
      const checkResponse = await fetch(`${featureTypeUrl}/${layerId}`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (checkResponse.ok) {
        console.log(`Feature type ${layerId} already exists`);
        return;
      }

      const featureTypeConfig = {
        featureType: {
          name: layerId,
          nativeName: dataSource.connection.table || layerId,
          title: metadata.title,
          abstract: metadata.description,
          srs: geometry.crs.code,
          enabled: true,
          store: {
            '@class': 'dataStore',
            name: `${workspace}:${dataSource.connection.database}`
          },
          attributes: {
            attribute: await this.getAttributeDefinitions(manifest)
          }
        }
      };

      const response = await fetch(featureTypeUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(featureTypeConfig)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to publish feature type: ${response.statusText} - ${errorText}`);
      }

      console.log(`Published feature type: ${layerId}`);
    } catch (error) {
      console.error(`Error publishing feature type:`, error);
      throw error;
    }
  }

  async getAttributeDefinitions(manifest) {
    const { dataSource } = manifest;
    
    if (dataSource.type !== 'postgis') {
      return [];
    }

    try {
      const client = await pool.connect();
      const result = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = $1
        AND table_name = $2
        AND column_name != 'geom'
        ORDER BY ordinal_position
      `, [dataSource.connection.schema || 'public', dataSource.connection.table]);

      client.release();

      return result.rows.map(row => ({
        name: row.column_name,
        minOccurs: 0,
        maxOccurs: 1,
        nillable: row.is_nullable === 'YES',
        binding: this.getJavaBinding(row.data_type)
      }));
    } catch (error) {
      console.error('Error getting attribute definitions:', error);
      return [];
    }
  }

  getJavaBinding(postgresType) {
    const typeMap = {
      'integer': 'java.lang.Integer',
      'bigint': 'java.lang.Long',
      'smallint': 'java.lang.Short',
      'real': 'java.lang.Float',
      'double precision': 'java.lang.Double',
      'numeric': 'java.math.BigDecimal',
      'character varying': 'java.lang.String',
      'text': 'java.lang.String',
      'character': 'java.lang.String',
      'boolean': 'java.lang.Boolean',
      'date': 'java.sql.Date',
      'timestamp': 'java.sql.Timestamp',
      'time': 'java.sql.Time'
    };
    
    return typeMap[postgresType] || 'java.lang.String';
  }

  async configureServices(manifest) {
    const { layerId, workspace, services } = manifest;
    
    try {
      if (services.wms?.enabled) {
        await this.configureWMS(workspace, layerId, services.wms);
      }
      
      if (services.wfs?.enabled) {
        await this.configureWFS(workspace, layerId, services.wfs);
      }
      
      if (services.wcs?.enabled) {
        await this.configureWCS(workspace, layerId, services.wcs);
      }
      
      console.log(`Configured services for layer: ${layerId}`);
    } catch (error) {
      console.error(`Error configuring services:`, error);
      throw error;
    }
  }

  async configureWMS(workspace, layerId, wmsConfig) {
    // WMS is enabled by default in GeoServer
    // We can configure specific WMS settings here if needed
    console.log(`WMS configured for ${workspace}:${layerId}`);
  }

  async configureWFS(workspace, layerId, wfsConfig) {
    const wfsUrl = `${this.baseUrl}/rest/workspaces/${workspace}/datastores/${workspace}/featuretypes/${layerId}`;
    
    const wfsConfig = {
      featureType: {
        name: layerId,
        enabled: true,
        serviceConfiguration: {
          wfs: {
            enabled: true,
            maxFeatures: wfsConfig.maxFeatures || 1000
          }
        }
      }
    };

    const response = await fetch(wfsUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${this.auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(wfsConfig)
    });

    if (!response.ok) {
      throw new Error(`Failed to configure WFS: ${response.statusText}`);
    }
  }

  async configureWCS(workspace, layerId, wcsConfig) {
    // WCS configuration for raster data
    console.log(`WCS configured for ${workspace}:${layerId}`);
  }

  async applyStyling(manifest) {
    const { layerId, workspace, styling } = manifest;
    
    if (!styling?.defaultStyle) {
      return;
    }

    try {
      const styleUrl = `${this.baseUrl}/rest/styles`;
      
      // Create or update style
      const styleConfig = {
        style: {
          name: `${layerId}_style`,
          filename: `${layerId}_style.sld`
        }
      };

      // Check if style exists
      const checkResponse = await fetch(`${styleUrl}/${layerId}_style`, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        }
      });

      if (!checkResponse.ok) {
        // Create new style
        const createResponse = await fetch(styleUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${this.auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(styleConfig)
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create style: ${createResponse.statusText}`);
        }
      }

      // Apply style to layer
      const layerUrl = `${this.baseUrl}/rest/layers/${workspace}:${layerId}`;
      const layerConfig = {
        layer: {
          name: `${workspace}:${layerId}`,
          defaultStyle: {
            name: `${layerId}_style`
          }
        }
      };

      const response = await fetch(layerUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(layerConfig)
      });

      if (!response.ok) {
        throw new Error(`Failed to apply style: ${response.statusText}`);
      }

      console.log(`Applied styling to layer: ${layerId}`);
    } catch (error) {
      console.error(`Error applying styling:`, error);
      throw error;
    }
  }

  async configureCaching(manifest) {
    const { layerId, workspace, caching } = manifest;
    
    try {
      // Configure GeoWebCache for the layer
      const cacheUrl = `${this.baseUrl}/gwc/rest/layers/${workspace}:${layerId}`;
      
      const cacheConfig = {
        layer: {
          name: `${workspace}:${layerId}`,
          enabled: true,
          inMemoryCached: true,
          metaWidth: 4,
          metaHeight: 4,
          expireCache: caching.expiration || 3600,
          expireClients: caching.expiration || 3600,
          gutter: 0,
          gridSubsets: {
            gridSubset: {
              gridSetName: 'EPSG:4326',
              extent: {
                coords: {
                  double: manifest.geometry.bounds ? [
                    manifest.geometry.bounds.minX,
                    manifest.geometry.bounds.minY,
                    manifest.geometry.bounds.maxX,
                    manifest.geometry.bounds.maxY
                  ] : [-180, -90, 180, 90]
                }
              }
            }
          }
        }
      };

      const response = await fetch(cacheUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cacheConfig)
      });

      if (!response.ok) {
        console.warn(`Failed to configure caching for ${layerId}: ${response.statusText}`);
        return;
      }

      console.log(`Configured caching for layer: ${layerId}`);
    } catch (error) {
      console.error(`Error configuring caching:`, error);
      // Don't throw error for caching failures
    }
  }

  async deprovisionLayer(layerId, workspace) {
    try {
      console.log(`Deprovisioning layer: ${layerId}`);
      
      // Remove layer from GeoServer
      const layerUrl = `${this.baseUrl}/rest/layers/${workspace}:${layerId}`;
      const response = await fetch(layerUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to remove layer: ${response.statusText}`);
      }

      console.log(`Successfully deprovisioned layer: ${layerId}`);
      return { success: true, layerId };
      
    } catch (error) {
      console.error(`Failed to deprovision layer ${layerId}:`, error);
      throw error;
    }
  }
}

export default GeoServerProvisioner;
