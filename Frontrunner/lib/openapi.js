const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dispatch Database Dynamic Layer API',
      version: '1.0.0',
      description: 'RESTful API for managing dynamic geospatial layers in the Dispatch Database system',
      contact: {
        name: 'Dispatch Database Team',
        email: 'arashm@luxmodus.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Development server'
      }
    ],
    components: {
      schemas: {
        Layer: {
          type: 'object',
          required: ['name', 'title', 'type'],
          properties: {
            name: {
              type: 'string',
              description: 'Database table name',
              example: 'road_segments'
            },
            title: {
              type: 'string',
              description: 'Display name for the layer',
              example: 'Road Segments'
            },
            type: {
              type: 'string',
              enum: ['point', 'line', 'polygon'],
              description: 'Geometry type of the layer'
            },
            style: {
              type: 'object',
              description: 'Default styling configuration',
              properties: {
                color: {
                  type: 'string',
                  description: 'Color in hex format',
                  example: '#2ECC71'
                },
                weight: {
                  type: 'number',
                  description: 'Line weight or border width',
                  example: 3
                },
                opacity: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description: 'Opacity level',
                  example: 0.8
                },
                fillColor: {
                  type: 'string',
                  description: 'Fill color for points and polygons',
                  example: '#FF6B6B'
                },
                fillOpacity: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                  description: 'Fill opacity',
                  example: 0.6
                },
                radius: {
                  type: 'number',
                  description: 'Radius for point markers',
                  example: 6
                },
                dashArray: {
                  type: 'string',
                  description: 'Dash pattern for lines',
                  example: '5, 5'
                }
              }
            },
            filter: {
              type: 'object',
              description: 'Dynamic styling based on attribute values',
              properties: {
                field: {
                  type: 'string',
                  description: 'Attribute field name to filter by',
                  example: 'status'
                },
                values: {
                  type: 'object',
                  description: 'Style configurations for different attribute values',
                  additionalProperties: {
                    type: 'object',
                    description: 'Style properties for this attribute value'
                  }
                }
              }
            },
            popup: {
              type: 'object',
              description: 'Popup configuration',
              properties: {
                fields: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Fields to include in popup',
                  example: ['name', 'type', 'status']
                },
                template: {
                  type: 'string',
                  description: 'HTML template for popup content with {field} placeholders',
                  example: '<strong>{name}</strong><br>Type: {type}<br>Status: {status}'
                }
              }
            }
          }
        },
        LayerInfo: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Database table name'
            },
            schema: {
              type: 'string',
              description: 'Database schema name'
            },
            geometryColumn: {
              type: 'string',
              description: 'Name of the geometry column'
            },
            geometryType: {
              type: 'string',
              description: 'PostGIS geometry type',
              example: 'LINESTRING'
            },
            srid: {
              type: 'integer',
              description: 'Spatial reference system identifier',
              example: 4326
            },
            coordDimension: {
              type: 'integer',
              description: 'Coordinate dimension (2D or 3D)',
              example: 2
            },
            config: {
              $ref: '#/components/schemas/Layer'
            },
            enabled: {
              type: 'boolean',
              description: 'Whether the layer is currently enabled'
            }
          }
        },
        FeatureCollection: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['FeatureCollection']
            },
            features: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Feature'
              }
            }
          }
        },
        Feature: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['Feature']
            },
            geometry: {
              $ref: '#/components/schemas/Geometry'
            },
            properties: {
              type: 'object',
              description: 'Feature attributes',
              additionalProperties: true
            }
          }
        },
        Geometry: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon']
            },
            coordinates: {
              type: 'array',
              description: 'Geometry coordinates'
            }
          }
        },
        LayerSchema: {
          type: 'object',
          properties: {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Column name'
                  },
                  type: {
                    type: 'string',
                    description: 'PostgreSQL data type'
                  },
                  nullable: {
                    type: 'boolean',
                    description: 'Whether the column allows null values'
                  },
                  default: {
                    type: 'string',
                    description: 'Default value for the column'
                  }
                }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Success message'
            },
            config: {
              $ref: '#/components/schemas/Layer'
            }
          }
        }
      }
    },
    paths: {
      '/layers': {
        get: {
          tags: ['Layers'],
          summary: 'List all available layers',
          description: 'Returns all PostGIS tables with geometry columns and their configurations',
          parameters: [
            {
              name: 'action',
              in: 'query',
              description: 'Action to perform',
              required: false,
              schema: {
                type: 'string',
                enum: ['list', 'config', 'data', 'schema'],
                default: 'list'
              }
            },
            {
              name: 'layerName',
              in: 'query',
              description: 'Layer name (required for config, data, and schema actions)',
              required: false,
              schema: {
                type: 'string'
              }
            }
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      layers: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/LayerInfo'
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': {
              description: 'Bad request',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            }
          }
        },
        post: {
          tags: ['Layers'],
          summary: 'Add, update, or remove layer configuration',
          description: 'Manages layer configurations in the system',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['action', 'name'],
                  properties: {
                    action: {
                      type: 'string',
                      enum: ['add', 'update', 'remove'],
                      description: 'Action to perform'
                    },
                    name: {
                      type: 'string',
                      description: 'Layer name (table name)'
                    },
                    config: {
                      $ref: '#/components/schemas/Layer',
                      description: 'Layer configuration (required for add and update actions)'
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Configuration updated successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Success'
                  }
                }
              }
            },
            '201': {
              description: 'Configuration added successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Success'
                  }
                }
              }
            },
            '400': {
              description: 'Bad request',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            },
            '404': {
              description: 'Layer not found',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            }
          }
        }
      },
      '/geoserver': {
        get: {
          tags: ['GeoServer'],
          summary: 'Get GeoServer capabilities and layer information',
          description: 'Returns GeoServer WMS/WFS capabilities and layer information',
          parameters: [
            {
              name: 'action',
              in: 'query',
              description: 'Action to perform',
              required: true,
              schema: {
                type: 'string',
                enum: ['layers', 'capabilities', 'feature-info']
              }
            },
            {
              name: 'service',
              in: 'query',
              description: 'Service type (for capabilities action)',
              required: false,
              schema: {
                type: 'string',
                enum: ['WMS', 'WFS'],
                default: 'WMS'
              }
            },
            {
              name: 'layer',
              in: 'query',
              description: 'Layer name (for feature-info action)',
              required: false,
              schema: {
                type: 'string'
              }
            },
            {
              name: 'bbox',
              in: 'query',
              description: 'Bounding box (for feature-info action)',
              required: false,
              schema: {
                type: 'string'
              }
            },
            {
              name: 'x',
              in: 'query',
              description: 'X coordinate (for feature-info action)',
              required: false,
              schema: {
                type: 'number'
              }
            },
            {
              name: 'y',
              in: 'query',
              description: 'Y coordinate (for feature-info action)',
              required: false,
              schema: {
                type: 'number'
              }
            }
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    description: 'Response varies based on action parameter'
                  }
                }
              }
            },
            '400': {
              description: 'Bad request',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            },
            '500': {
              description: 'Internal server error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Error'
                  }
                }
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Layers',
        description: 'Dynamic layer management operations'
      },
      {
        name: 'GeoServer',
        description: 'GeoServer integration operations'
      }
    ]
  },
  apis: ['./pages/api/*.js'] // Path to the API files
};

const specs = swaggerJSDoc(options);

module.exports = specs;
