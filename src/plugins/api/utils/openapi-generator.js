/**
 * OpenAPI Generator - Generate OpenAPI 3.1 specification from s3db.js resources
 *
 * Automatically creates OpenAPI documentation based on resource schemas
 * Note: OpenAPI 3.2.0 is not yet supported by Redoc v2.5.1
 */

/**
 * Map s3db.js field types to OpenAPI types
 * @param {string} fieldType - s3db.js field type
 * @returns {Object} OpenAPI type definition
 */
function mapFieldTypeToOpenAPI(fieldType) {
  const type = fieldType.split('|')[0].trim();

  const typeMap = {
    'string': { type: 'string' },
    'number': { type: 'number' },
    'integer': { type: 'integer' },
    'boolean': { type: 'boolean' },
    'array': { type: 'array', items: { type: 'string' } },
    'object': { type: 'object' },
    'json': { type: 'object' },
    'secret': { type: 'string', format: 'password' },
    'email': { type: 'string', format: 'email' },
    'url': { type: 'string', format: 'uri' },
    'date': { type: 'string', format: 'date' },
    'datetime': { type: 'string', format: 'date-time' },
    'ip4': { type: 'string', format: 'ipv4', description: 'IPv4 address' },
    'ip6': { type: 'string', format: 'ipv6', description: 'IPv6 address' },
    'embedding': { type: 'array', items: { type: 'number' }, description: 'Vector embedding' }
  };

  // Handle embedding:N notation
  if (type.startsWith('embedding:')) {
    const length = parseInt(type.split(':')[1]);
    return {
      type: 'array',
      items: { type: 'number' },
      minItems: length,
      maxItems: length,
      description: `Vector embedding (${length} dimensions)`
    };
  }

  return typeMap[type] || { type: 'string' };
}

/**
 * Extract validation rules from field definition
 * @param {string} fieldDef - Field definition string
 * @returns {Object} Validation rules
 */
function extractValidationRules(fieldDef) {
  const rules = {};
  const parts = fieldDef.split('|');

  for (const part of parts) {
    const [rule, value] = part.split(':').map(s => s.trim());

    switch (rule) {
      case 'required':
        rules.required = true;
        break;
      case 'min':
        rules.minimum = parseFloat(value);
        break;
      case 'max':
        rules.maximum = parseFloat(value);
        break;
      case 'minlength':
        rules.minLength = parseInt(value);
        break;
      case 'maxlength':
        rules.maxLength = parseInt(value);
        break;
      case 'pattern':
        rules.pattern = value;
        break;
      case 'enum':
        rules.enum = value.split(',').map(v => v.trim());
        break;
      case 'default':
        rules.default = value;
        break;
    }
  }

  return rules;
}

/**
 * Generate OpenAPI schema for a resource
 * @param {Object} resource - s3db.js Resource instance
 * @returns {Object} OpenAPI schema definition
 */
function generateResourceSchema(resource) {
  const properties = {};
  const required = [];

  const attributes = resource.config?.attributes || resource.attributes || {};

  // Extract resource description (supports both string and object format)
  const resourceDescription = resource.config?.description;
  const attributeDescriptions = typeof resourceDescription === 'object'
    ? (resourceDescription.attributes || {})
    : {};

  // Add system-generated id field (always present in responses)
  properties.id = {
    type: 'string',
    description: 'Unique identifier for the resource',
    example: '2_gDTpeU6EI0e8B92n_R3Y',
    readOnly: true
  };

  for (const [fieldName, fieldDef] of Object.entries(attributes)) {
    // Handle object notation
    if (typeof fieldDef === 'object' && fieldDef.type) {
      const baseType = mapFieldTypeToOpenAPI(fieldDef.type);
      properties[fieldName] = {
        ...baseType,
        description: fieldDef.description || attributeDescriptions[fieldName] || undefined
      };

      if (fieldDef.required) {
        required.push(fieldName);
      }

      // Handle nested object properties
      if (fieldDef.type === 'object' && fieldDef.props) {
        properties[fieldName].properties = {};
        for (const [propName, propDef] of Object.entries(fieldDef.props)) {
          const propType = typeof propDef === 'string' ? propDef : propDef.type;
          properties[fieldName].properties[propName] = mapFieldTypeToOpenAPI(propType);
        }
      }

      // Handle array items
      if (fieldDef.type === 'array' && fieldDef.items) {
        properties[fieldName].items = mapFieldTypeToOpenAPI(fieldDef.items);
      }
    }
    // Handle string notation
    else if (typeof fieldDef === 'string') {
      const baseType = mapFieldTypeToOpenAPI(fieldDef);
      const rules = extractValidationRules(fieldDef);

      properties[fieldName] = {
        ...baseType,
        ...rules,
        description: attributeDescriptions[fieldName] || undefined
      };

      if (rules.required) {
        required.push(fieldName);
        delete properties[fieldName].required; // Move to schema-level required array
      }
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined
  };
}

/**
 * Generate OpenAPI paths for a resource
 * @param {Object} resource - s3db.js Resource instance
 * @param {string} version - Resource version
 * @param {Object} config - Resource configuration
 * @returns {Object} OpenAPI paths
 */
function generateResourcePaths(resource, version, config = {}) {
  const resourceName = resource.name;
  const basePath = `/${version}/${resourceName}`;
  const schema = generateResourceSchema(resource);
  const methods = config.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const authMethods = config.auth || [];
  const requiresAuth = authMethods && authMethods.length > 0;

  const paths = {};

  // Security schemes
  const security = [];
  if (requiresAuth) {
    if (authMethods.includes('jwt')) security.push({ bearerAuth: [] });
    if (authMethods.includes('apiKey')) security.push({ apiKeyAuth: [] });
    if (authMethods.includes('basic')) security.push({ basicAuth: [] });
  }

  // Extract partition information for documentation
  // Partitions are stored in resource.config.options.partitions
  const partitions = resource.config?.options?.partitions || resource.config?.partitions || resource.partitions || {};
  const partitionNames = Object.keys(partitions);
  const hasPartitions = partitionNames.length > 0;

  // Build partition documentation
  let partitionDescription = 'Partition name for filtering';
  let partitionValuesDescription = 'Partition values as JSON string';
  let partitionExample = undefined;
  let partitionValuesExample = undefined;

  if (hasPartitions) {
    // Build detailed partition description
    const partitionDocs = partitionNames.map(name => {
      const partition = partitions[name];
      const fields = Object.keys(partition.fields || {});
      const fieldTypes = Object.entries(partition.fields || {})
        .map(([field, type]) => `${field}: ${type}`)
        .join(', ');
      return `- **${name}**: Filters by ${fields.join(', ')} (${fieldTypes})`;
    }).join('\n');

    partitionDescription = `Available partitions:\n${partitionDocs}`;

    // Build partition values description with examples
    const examplePartition = partitionNames[0];
    const exampleFields = partitions[examplePartition]?.fields || {};
    const exampleFieldsDoc = Object.entries(exampleFields)
      .map(([field, type]) => `"${field}": <${type} value>`)
      .join(', ');

    partitionValuesDescription = `Partition field values as JSON string. Must match the structure of the selected partition.\n\nExample for "${examplePartition}" partition: \`{"${Object.keys(exampleFields)[0]}": "value"}\``;

    // Set examples
    partitionExample = examplePartition;
    const firstField = Object.keys(exampleFields)[0];
    const firstFieldType = exampleFields[firstField];
    let exampleValue = 'example';
    if (firstFieldType === 'number' || firstFieldType === 'integer') {
      exampleValue = 123;
    } else if (firstFieldType === 'boolean') {
      exampleValue = true;
    }
    partitionValuesExample = JSON.stringify({ [firstField]: exampleValue });
  }

  // Extract partition fields for query parameters (filtering)
  // Only fields that are part of partitions can be efficiently filtered
  const attributeQueryParams = [];

  if (hasPartitions) {
    const partitionFieldsSet = new Set();

    // Collect all unique fields from all partitions
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const fields = partition.fields || {};
      for (const fieldName of Object.keys(fields)) {
        partitionFieldsSet.add(fieldName);
      }
    }

    // Create query parameters only for partition fields
    const attributes = resource.config?.attributes || resource.attributes || {};

    for (const fieldName of partitionFieldsSet) {
      const fieldDef = attributes[fieldName];
      if (!fieldDef) continue; // Skip if field doesn't exist in schema

      // Get field type
      let fieldType;
      if (typeof fieldDef === 'object' && fieldDef.type) {
        fieldType = fieldDef.type;
      } else if (typeof fieldDef === 'string') {
        fieldType = fieldDef.split('|')[0].trim();
      } else {
        fieldType = 'string';
      }

      // Map to OpenAPI type
      const openAPIType = mapFieldTypeToOpenAPI(fieldType);

      // Create query parameter with partition info
      attributeQueryParams.push({
        name: fieldName,
        in: 'query',
        description: `Filter by ${fieldName} field (indexed via partitions for efficient querying). Value will be parsed as JSON if possible, otherwise treated as string.`,
        required: false,
        schema: openAPIType
      });
    }
  }

  // List endpoint with filtering support
  if (methods.includes('GET')) {
    paths[basePath] = {
      get: {
        tags: [resourceName],
        summary: `List ${resourceName}`,
        description: `Retrieve a paginated list of ${resourceName}. Supports filtering by passing any resource field as a query parameter (e.g., ?status=active&year=2024). Values are parsed as JSON if possible, otherwise treated as strings.

**Pagination**: Use \`limit\` and \`offset\` to paginate results. For example:
- First page (10 items): \`?limit=10&offset=0\`
- Second page: \`?limit=10&offset=10\`
- Third page: \`?limit=10&offset=20\`

The response includes pagination metadata in the \`pagination\` object with total count and page information.${hasPartitions ? '\n\n**Partitioning**: This resource supports partitioned queries for optimized filtering. Use the `partition` and `partitionValues` parameters together.' : ''}`,
        parameters: [
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of items to return per page (page size)',
            schema: { type: 'integer', default: 100, minimum: 1, maximum: 1000 },
            example: 10
          },
          {
            name: 'offset',
            in: 'query',
            description: 'Number of items to skip before starting to return results. Use for pagination: offset = (page - 1) * limit',
            schema: { type: 'integer', default: 0, minimum: 0 },
            example: 0
          },
          ...(hasPartitions ? [
            {
              name: 'partition',
              in: 'query',
              description: partitionDescription,
              schema: {
                type: 'string',
                enum: partitionNames
              },
              example: partitionExample
            },
            {
              name: 'partitionValues',
              in: 'query',
              description: partitionValuesDescription,
              schema: { type: 'string' },
              example: partitionValuesExample
            }
          ] : []),
          ...attributeQueryParams
        ],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: schema
                    },
                    pagination: {
                      type: 'object',
                      description: 'Pagination metadata for the current request',
                      properties: {
                        total: {
                          type: 'integer',
                          description: 'Total number of items available',
                          example: 150
                        },
                        page: {
                          type: 'integer',
                          description: 'Current page number (1-indexed)',
                          example: 1
                        },
                        pageSize: {
                          type: 'integer',
                          description: 'Number of items per page (same as limit parameter)',
                          example: 10
                        },
                        pageCount: {
                          type: 'integer',
                          description: 'Total number of pages available',
                          example: 15
                        }
                      }
                    }
                  }
                }
              }
            },
            headers: {
              'X-Total-Count': {
                description: 'Total number of records',
                schema: { type: 'integer' }
              },
              'X-Page-Count': {
                description: 'Total number of pages',
                schema: { type: 'integer' }
              }
            }
          }
        },
        security: security.length > 0 ? security : undefined
      }
    };
  }

  // Get by ID endpoint
  if (methods.includes('GET')) {
    paths[`${basePath}/{id}`] = {
      get: {
        tags: [resourceName],
        summary: `Get ${resourceName} by ID`,
        description: `Retrieve a single ${resourceName} by its ID${hasPartitions ? '. Optionally specify a partition for more efficient retrieval.' : ''}`,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: `${resourceName} ID`,
            schema: { type: 'string' }
          },
          ...(hasPartitions ? [
            {
              name: 'partition',
              in: 'query',
              description: partitionDescription,
              schema: {
                type: 'string',
                enum: partitionNames
              },
              example: partitionExample
            },
            {
              name: 'partitionValues',
              in: 'query',
              description: partitionValuesDescription,
              schema: { type: 'string' },
              example: partitionValuesExample
            }
          ] : [])
        ],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: schema
                  }
                }
              }
            }
          },
          404: {
            description: 'Resource not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        },
        security: security.length > 0 ? security : undefined
      }
    };
  }

  // Create endpoint
  if (methods.includes('POST')) {
    if (!paths[basePath]) paths[basePath] = {};
    paths[basePath].post = {
      tags: [resourceName],
      summary: `Create ${resourceName}`,
      description: `Create a new ${resourceName}`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: schema
          }
        }
      },
      responses: {
        201: {
          description: 'Resource created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema
                }
              }
            }
          },
          headers: {
            Location: {
              description: 'URL of the created resource',
              schema: { type: 'string' }
            }
          }
        },
        400: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationError' }
            }
          }
        }
      },
      security: security.length > 0 ? security : undefined
    };
  }

  // Update (full) endpoint
  if (methods.includes('PUT')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].put = {
      tags: [resourceName],
      summary: `Update ${resourceName} (full)`,
      description: `Fully update a ${resourceName}`,
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: schema
          }
        }
      },
      responses: {
        200: {
          description: 'Resource updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema
                }
              }
            }
          }
        },
        404: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      },
      security: security.length > 0 ? security : undefined
    };
  }

  // Update (partial) endpoint
  if (methods.includes('PATCH')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].patch = {
      tags: [resourceName],
      summary: `Update ${resourceName} (partial)`,
      description: `Partially update a ${resourceName}`,
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              ...schema,
              required: undefined // Partial updates don't require all fields
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Resource updated successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema
                }
              }
            }
          }
        },
        404: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      },
      security: security.length > 0 ? security : undefined
    };
  }

  // Delete endpoint
  if (methods.includes('DELETE')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].delete = {
      tags: [resourceName],
      summary: `Delete ${resourceName}`,
      description: `Delete a ${resourceName} by ID`,
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }
      ],
      responses: {
        204: {
          description: 'Resource deleted successfully'
        },
        404: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      },
      security: security.length > 0 ? security : undefined
    };
  }

  // HEAD endpoint - Get resource statistics
  if (methods.includes('HEAD')) {
    if (!paths[basePath]) paths[basePath] = {};
    paths[basePath].head = {
      tags: [resourceName],
      summary: `Get ${resourceName} statistics`,
      description: `Get statistics about ${resourceName} collection without retrieving data. Returns statistics in response headers.`,
      responses: {
        200: {
          description: 'Statistics retrieved successfully',
          headers: {
            'X-Total-Count': {
              description: 'Total number of records',
              schema: { type: 'integer' }
            },
            'X-Resource-Version': {
              description: 'Current resource version',
              schema: { type: 'string' }
            },
            'X-Schema-Fields': {
              description: 'Number of schema fields',
              schema: { type: 'integer' }
            }
          }
        }
      },
      security: security.length > 0 ? security : undefined
    };

    // HEAD for individual resource
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].head = {
      tags: [resourceName],
      summary: `Check if ${resourceName} exists`,
      description: `Check if a ${resourceName} exists without retrieving its data`,
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }
      ],
      responses: {
        200: {
          description: 'Resource exists',
          headers: {
            'Last-Modified': {
              description: 'Last modification date',
              schema: { type: 'string', format: 'date-time' }
            }
          }
        },
        404: {
          description: 'Resource not found'
        }
      },
      security: security.length > 0 ? security : undefined
    };
  }

  // OPTIONS endpoint - Get resource metadata
  if (methods.includes('OPTIONS')) {
    if (!paths[basePath]) paths[basePath] = {};
    paths[basePath].options = {
      tags: [resourceName],
      summary: `Get ${resourceName} metadata`,
      description: `Get complete metadata about ${resourceName} resource including schema, allowed methods, endpoints, and query parameters`,
      responses: {
        200: {
          description: 'Metadata retrieved successfully',
          headers: {
            'Allow': {
              description: 'Allowed HTTP methods',
              schema: { type: 'string', example: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS' }
            }
          },
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  resource: { type: 'string' },
                  version: { type: 'string' },
                  totalRecords: { type: 'integer' },
                  allowedMethods: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string' },
                        rules: { type: 'array', items: { type: 'string' } }
                      }
                    }
                  },
                  endpoints: {
                    type: 'object',
                    properties: {
                      list: { type: 'string' },
                      get: { type: 'string' },
                      create: { type: 'string' },
                      update: { type: 'string' },
                      delete: { type: 'string' }
                    }
                  },
                  queryParameters: { type: 'object' }
                }
              }
            }
          }
        }
      }
    };

    // OPTIONS for individual resource
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].options = {
      tags: [resourceName],
      summary: `Get allowed methods for ${resourceName} item`,
      description: `Get allowed HTTP methods for individual ${resourceName} operations`,
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' }
        }
      ],
      responses: {
        204: {
          description: 'Methods retrieved successfully',
          headers: {
            'Allow': {
              description: 'Allowed HTTP methods',
              schema: { type: 'string', example: 'GET, PUT, PATCH, DELETE, HEAD, OPTIONS' }
            }
          }
        }
      }
    };
  }

  return paths;
}

/**
 * Generate OpenAPI paths for relational routes
 * @param {Object} resource - Source s3db.js Resource instance
 * @param {string} relationName - Name of the relation
 * @param {Object} relationConfig - Relation configuration
 * @param {string} version - Resource version
 * @param {Object} relatedSchema - OpenAPI schema for related resource
 * @returns {Object} OpenAPI paths for relation
 */
function generateRelationalPaths(resource, relationName, relationConfig, version, relatedSchema) {
  const resourceName = resource.name;
  const basePath = `/${version}/${resourceName}/{id}/${relationName}`;
  const relatedResourceName = relationConfig.resource;
  const isToMany = relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany';

  const paths = {};

  paths[basePath] = {
    get: {
      tags: [resourceName],
      summary: `Get ${relationName} of ${resourceName}`,
      description: `Retrieve ${relationName} (${relationConfig.type}) associated with this ${resourceName}. ` +
                   `This endpoint uses the RelationPlugin to efficiently load related data` +
                   (relationConfig.partitionHint ? ` via the '${relationConfig.partitionHint}' partition.` : '.'),
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: `${resourceName} ID`,
          schema: { type: 'string' }
        },
        ...(isToMany ? [
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of items to return',
            schema: { type: 'integer', default: 100, minimum: 1, maximum: 1000 }
          },
          {
            name: 'offset',
            in: 'query',
            description: 'Number of items to skip',
            schema: { type: 'integer', default: 0, minimum: 0 }
          }
        ] : [])
      ],
      responses: {
        200: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: isToMany ? {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'array',
                    items: relatedSchema
                  },
                  pagination: {
                    type: 'object',
                    properties: {
                      total: { type: 'integer' },
                      page: { type: 'integer' },
                      pageSize: { type: 'integer' },
                      pageCount: { type: 'integer' }
                    }
                  }
                }
              } : {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: relatedSchema
                }
              }
            }
          },
          ...(isToMany ? {
            headers: {
              'X-Total-Count': {
                description: 'Total number of related records',
                schema: { type: 'integer' }
              },
              'X-Page-Count': {
                description: 'Total number of pages',
                schema: { type: 'integer' }
              }
            }
          } : {})
        },
        404: {
          description: `${resourceName} not found` + (isToMany ? '' : ' or no related resource exists'),
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      }
    }
  };

  return paths;
}

/**
 * Generate complete OpenAPI 3.0 specification
 * @param {Object} database - s3db.js Database instance
 * @param {Object} config - API configuration
 * @returns {Object} OpenAPI 3.0 specification
 */
export function generateOpenAPISpec(database, config = {}) {
  const {
    title = 's3db.js API',
    version = '1.0.0',
    description = 'Auto-generated REST API documentation for s3db.js resources',
    serverUrl = 'http://localhost:3000',
    auth = {},
    resources: resourceConfigs = {}
  } = config;

  // Build resources table for description
  const resourcesTableRows = [];
  for (const [name, resource] of Object.entries(database.resources)) {
    // Skip plugin resources unless explicitly configured
    if (name.startsWith('plg_') && !resourceConfigs[name]) {
      continue;
    }

    const version = resource.config?.currentVersion || resource.version || 'v1';
    const resourceDescription = resource.config?.description;
    const descText = typeof resourceDescription === 'object'
      ? resourceDescription.resource
      : resourceDescription || 'No description';

    resourcesTableRows.push(`| ${name} | ${descText} | \`/${version}/${name}\` |`);
  }

  // Build enhanced description with resources table
  const enhancedDescription = `${description}

## Available Resources

| Resource | Description | Base Path |
|----------|-------------|-----------|
${resourcesTableRows.join('\n')}

---

For detailed information about each endpoint, see the sections below.`;

  const spec = {
    openapi: '3.1.0',
    info: {
      title,
      version,
      description: enhancedDescription,
      contact: {
        name: 's3db.js',
        url: 'https://github.com/forattini-dev/s3db.js'
      }
    },
    servers: [
      {
        url: serverUrl,
        description: 'API Server'
      }
    ],
    paths: {},
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'string' },
                details: { type: 'object' }
              }
            }
          }
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Validation failed' },
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                details: {
                  type: 'object',
                  properties: {
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          field: { type: 'string' },
                          message: { type: 'string' },
                          expected: { type: 'string' },
                          actual: {}
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      securitySchemes: {}
    },
    tags: []
  };

  // Add security schemes
  if (auth.jwt?.enabled) {
    spec.components.securitySchemes.bearerAuth = {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT authentication'
    };
  }

  if (auth.apiKey?.enabled) {
    spec.components.securitySchemes.apiKeyAuth = {
      type: 'apiKey',
      in: 'header',
      name: auth.apiKey.headerName || 'X-API-Key',
      description: 'API Key authentication'
    };
  }

  if (auth.basic?.enabled) {
    spec.components.securitySchemes.basicAuth = {
      type: 'http',
      scheme: 'basic',
      description: 'HTTP Basic authentication'
    };
  }

  // Generate paths for each resource
  const resources = database.resources;

  // Detect RelationPlugin
  const relationsPlugin = database.plugins?.relation || database.plugins?.RelationPlugin || null;

  for (const [name, resource] of Object.entries(resources)) {
    // Skip plugin resources unless explicitly configured
    if (name.startsWith('plg_') && !resourceConfigs[name]) {
      continue;
    }

    // Get resource configuration
    const config = resourceConfigs[name] || {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      auth: false
    };

    // Determine version
    const version = resource.config?.currentVersion || resource.version || 'v1';

    // Generate paths
    const paths = generateResourcePaths(resource, version, config);

    // Merge paths
    Object.assign(spec.paths, paths);

    // Add tag with description support
    const resourceDescription = resource.config?.description;
    const tagDescription = typeof resourceDescription === 'object'
      ? resourceDescription.resource
      : resourceDescription || `Operations for ${name} resource`;

    spec.tags.push({
      name: name,
      description: tagDescription
    });

    // Add schema to components
    spec.components.schemas[name] = generateResourceSchema(resource);

    // Generate relational paths if RelationPlugin is active
    if (relationsPlugin && relationsPlugin.relations && relationsPlugin.relations[name]) {
      const relationsDef = relationsPlugin.relations[name];

      for (const [relationName, relationConfig] of Object.entries(relationsDef)) {
        // Skip belongsTo relations (not useful as REST endpoints)
        if (relationConfig.type === 'belongsTo') {
          continue;
        }

        // Check if relation should be exposed (default: yes)
        const exposeRelation = config?.relations?.[relationName]?.expose !== false;
        if (!exposeRelation) {
          continue;
        }

        // Get related resource schema
        const relatedResource = database.resources[relationConfig.resource];
        if (!relatedResource) {
          continue;
        }

        const relatedSchema = generateResourceSchema(relatedResource);

        // Generate relational paths
        const relationalPaths = generateRelationalPaths(
          resource,
          relationName,
          relationConfig,
          version,
          relatedSchema
        );

        // Merge relational paths
        Object.assign(spec.paths, relationalPaths);
      }
    }
  }

  // Add authentication endpoints if enabled
  if (auth.jwt?.enabled || auth.apiKey?.enabled || auth.basic?.enabled) {
    spec.paths['/auth/login'] = {
      post: {
        tags: ['Authentication'],
        summary: 'Login',
        description: 'Authenticate with username and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string', format: 'password' }
                },
                required: ['username', 'password']
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string' },
                        user: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          },
          401: {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' }
              }
            }
          }
        }
      }
    };

    spec.paths['/auth/register'] = {
      post: {
        tags: ['Authentication'],
        summary: 'Register',
        description: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string', minLength: 3 },
                  password: { type: 'string', format: 'password', minLength: 8 },
                  email: { type: 'string', format: 'email' }
                },
                required: ['username', 'password']
              }
            }
          }
        },
        responses: {
          201: {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string' },
                        user: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    spec.tags.push({
      name: 'Authentication',
      description: 'Authentication endpoints'
    });
  }

  // Add health endpoints for Kubernetes probes
  spec.paths['/health'] = {
    get: {
      tags: ['Health'],
      summary: 'Generic Health Check',
      description: 'Generic health check endpoint that includes references to liveness and readiness probes',
      responses: {
        200: {
          description: 'API is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      uptime: { type: 'number', description: 'Process uptime in seconds' },
                      timestamp: { type: 'string', format: 'date-time' },
                      checks: {
                        type: 'object',
                        properties: {
                          liveness: { type: 'string', example: '/health/live' },
                          readiness: { type: 'string', example: '/health/ready' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  spec.paths['/health/live'] = {
    get: {
      tags: ['Health'],
      summary: 'Liveness Probe',
      description: 'Kubernetes liveness probe - checks if the application is alive. If this fails, Kubernetes will restart the pod.',
      responses: {
        200: {
          description: 'Application is alive',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'alive' },
                      timestamp: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  spec.paths['/health/ready'] = {
    get: {
      tags: ['Health'],
      summary: 'Readiness Probe',
      description: 'Kubernetes readiness probe - checks if the application is ready to receive traffic. If this fails, Kubernetes will remove the pod from service endpoints.',
      responses: {
        200: {
          description: 'Application is ready to receive traffic',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ready' },
                      database: {
                        type: 'object',
                        properties: {
                          connected: { type: 'boolean', example: true },
                          resources: { type: 'integer', example: 5 }
                        }
                      },
                      timestamp: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        },
        503: {
          description: 'Application is not ready',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  error: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Service not ready' },
                      code: { type: 'string', example: 'NOT_READY' },
                      details: {
                        type: 'object',
                        properties: {
                          database: {
                            type: 'object',
                            properties: {
                              connected: { type: 'boolean', example: false },
                              resources: { type: 'integer', example: 0 }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  spec.tags.push({
    name: 'Health',
    description: 'Health check endpoints for monitoring and Kubernetes probes'
  });

  // Add Prometheus metrics endpoint if MetricsPlugin is active
  const metricsPlugin = database.plugins?.metrics || database.plugins?.MetricsPlugin;
  if (metricsPlugin && metricsPlugin.config?.prometheus?.enabled) {
    const metricsPath = metricsPlugin.config.prometheus.path || '/metrics';
    const isIntegrated = metricsPlugin.config.prometheus.mode !== 'standalone';

    // Only add to OpenAPI if using integrated mode (same server)
    if (isIntegrated) {
      spec.paths[metricsPath] = {
        get: {
          tags: ['Monitoring'],
          summary: 'Prometheus Metrics',
          description: 'Exposes application metrics in Prometheus text-based exposition format for monitoring and observability. ' +
                       'Metrics include operation counts, durations, errors, uptime, and resource statistics.',
          responses: {
            200: {
              description: 'Metrics in Prometheus format',
              content: {
                'text/plain': {
                  schema: {
                    type: 'string',
                    example: '# HELP s3db_operations_total Total number of operations by type and resource\n' +
                             '# TYPE s3db_operations_total counter\n' +
                             's3db_operations_total{operation="insert",resource="cars"} 1523\n' +
                             's3db_operations_total{operation="update",resource="cars"} 342\n\n' +
                             '# HELP s3db_operation_duration_seconds Average operation duration in seconds\n' +
                             '# TYPE s3db_operation_duration_seconds gauge\n' +
                             's3db_operation_duration_seconds{operation="insert",resource="cars"} 0.045\n\n' +
                             '# HELP s3db_operation_errors_total Total number of operation errors\n' +
                             '# TYPE s3db_operation_errors_total counter\n' +
                             's3db_operation_errors_total{operation="insert",resource="cars"} 12\n'
                  }
                }
              }
            }
          }
        }
      };

      spec.tags.push({
        name: 'Monitoring',
        description: 'Monitoring and observability endpoints (Prometheus)'
      });
    }
  }

  return spec;
}

export default {
  generateOpenAPISpec,
  generateResourceSchema,
  generateResourcePaths
};
