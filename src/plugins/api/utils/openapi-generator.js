/**
 * OpenAPI Generator - Generate OpenAPI 3.1 specification from s3db.js resources
 *
 * Automatically creates OpenAPI documentation based on resource schemas
 * Note: OpenAPI 3.2.0 is not yet supported by Redoc v2.5.1
 */

import { applyBasePath, normalizeBasePath } from './base-path.js';
import startCase from 'lodash-es/startCase.js';
import { findBestMatch } from './path-matcher.js';

const CUSTOM_ROUTES_TAG = 'Custom Routes';
const CUSTOM_ROUTE_METHOD_REGEX = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i;

function parseCustomRouteDefinition(definition) {
  if (typeof definition !== 'string') {
    return null;
  }

  let def = definition.trim();
  if (!def) {
    return null;
  }

  if (/^async\s+/i.test(def)) {
    def = def.replace(/^async\s+/i, '').trim();
  }

  const match = def.match(CUSTOM_ROUTE_METHOD_REGEX);
  if (!match) {
    return null;
  }

  let path = match[2].trim();
  if (!path) {
    return null;
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  return {
    method: match[1].toUpperCase(),
    path,
    originalKey: definition
  };
}

function convertPathToOpenAPI(path) {
  return path
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/\*/g, '{wildcard}');
}

function methodSupportsRequestBody(method) {
  return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
}

const DRIVER_SECURITY_MAP = {
  jwt: 'bearerAuth',
  apiKey: 'apiKeyAuth',
  basic: 'basicAuth',
  oauth2: 'oauth2Auth',
  oidc: 'oidcAuth'
};

function toRuntimePath(path = '') {
  return path.replace(/{([^}]+)}/g, ':$1');
}

/**
 * Infer tag from custom route path by extracting first segment after prefixes
 *
 * Examples:
 *   inferTagFromPath('/api/v1/analytics/reports', '/api', 'v1') → 'analytics'
 *   inferTagFromPath('/api/v1/admin/settings', '/api', 'v1') → 'admin'
 *   inferTagFromPath('/api/v1/:id', '/api', 'v1') → null (fallback to Custom Routes)
 *
 * @param {string} fullPath - Full path including basePrefix and versionPrefix
 * @param {string} basePrefix - Base path prefix (e.g., '/api')
 * @param {string} versionPrefix - Version prefix (e.g., 'v1', 'v2', or '')
 * @returns {string|null} - Inferred tag name or null if inference failed
 */
function inferTagFromPath(fullPath, basePrefix = '', versionPrefix = '') {
  if (!fullPath || typeof fullPath !== 'string') {
    return null;
  }

  let path = fullPath.trim();

  // Remove basePrefix if present
  if (basePrefix && typeof basePrefix === 'string') {
    const normalizedBase = basePrefix.trim();
    if (normalizedBase && path.startsWith(normalizedBase)) {
      path = path.substring(normalizedBase.length);
    }
  }

  // Remove versionPrefix if present (could be /v1 or just v1)
  if (versionPrefix && typeof versionPrefix === 'string') {
    const normalizedVersion = versionPrefix.trim();
    if (normalizedVersion) {
      // Handle both /v1 and v1 formats
      const versionPattern = normalizedVersion.startsWith('/')
        ? normalizedVersion
        : `/${normalizedVersion}`;
      if (path.startsWith(versionPattern)) {
        path = path.substring(versionPattern.length);
      }
    }
  }

  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  // 🩹 Special handling for health probes (K8s standard)
  if (path === '/liveness' || path === '/readiness' || path === '/health') {
    return 'Health';
  }

  // Split path into segments
  const segments = path.split('/').filter(segment => segment.length > 0);

  // If no segments, cannot infer tag
  if (segments.length === 0) {
    return null;
  }

  // Get first segment
  const firstSegment = segments[0];

  // Check if segment is a parameter (starts with : or is wrapped in {})
  if (firstSegment.startsWith(':') || firstSegment.startsWith('{') || firstSegment === '*') {
    return null;
  }

  // Check if segment is empty or only whitespace
  if (!firstSegment.trim()) {
    return null;
  }

  // Return the first segment as-is (lowercase, no formatting)
  return firstSegment.toLowerCase();
}

function createPathSecurityResolver(auth = {}) {
  const rawRules = Array.isArray(auth.pathRules) ? auth.pathRules : [];
  if (rawRules.length === 0) {
    return () => null;
  }

  const normalizedRules = rawRules
    .map((rule, index) => {
      if (!rule || typeof rule !== 'object') {
        return null;
      }
      let pattern = rule.path || rule.pattern;
      if (typeof pattern !== 'string' || !pattern.trim()) {
        return null;
      }
      pattern = pattern.trim();
      if (!pattern.startsWith('/')) {
        pattern = `/${pattern.replace(/^\/*/, '')}`;
      }

      return {
        id: `path-rule-${index}`,
        pattern,
        required: rule.required !== false,
        methods: Array.isArray(rule.methods)
          ? rule.methods.map((m) => String(m).trim().toLowerCase()).filter(Boolean)
          : []
      };
    })
    .filter(Boolean);

  if (normalizedRules.length === 0) {
    return () => null;
  }

  return (path) => {
    const match = findBestMatch(normalizedRules, path);
    if (!match) {
      return null;
    }
    if (!match.required) {
      return [];
    }
    const schemes = match.methods
      .map((driver) => DRIVER_SECURITY_MAP[driver])
      .filter(Boolean);
    if (schemes.length === 0) {
      return [];
    }
    return schemes.map((scheme) => ({ [scheme]: [] }));
  };
}

function buildCustomRouteOperationId(scope, method, path) {
  const sanitizedPath = path
    .replace(/[{}\/:\-\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '') || 'root';
  return `${scope}_${method.toLowerCase()}_${sanitizedPath}`;
}

function createCustomRouteOperation({ method, path, originalKey, scope, tags, security }) {
  const summary = `${method} ${path}`;
  const descriptionLines = [
    `Route defined ${scope}.`,
    `Original definition: \`${originalKey}\`.`,
    'Request and response payloads depend on the handler implementation.'
  ];

  const responses = {
    200: {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                description: 'Handler-defined response payload',
                nullable: true,
                oneOf: [
                  { type: 'object', additionalProperties: true },
                  { type: 'array', items: {} },
                  { type: 'string' },
                  { type: 'number' },
                  { type: 'boolean' },
                  { type: 'null' }
                ]
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Bad request',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    500: {
      description: 'Server error',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    }
  };

  const requestBody = methodSupportsRequestBody(method)
    ? {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: true,
              description: 'Arbitrary JSON payload accepted by the custom handler'
            }
          }
        }
      }
    : undefined;

  return {
    tags: Array.from(new Set(tags)),
    summary,
    description: descriptionLines.join('\n\n'),
    operationId: buildCustomRouteOperationId(scope, method, path),
    requestBody,
    responses,
    security: Array.isArray(security) && security.length > 0 ? security : undefined
  };
}

function addCustomRouteOperation(spec, path, method, details) {
  const normalizedPath = convertPathToOpenAPI(path);
  const methodKey = method.toLowerCase();

  if (!spec.paths[normalizedPath]) {
    spec.paths[normalizedPath] = {};
  }

  if (spec.paths[normalizedPath][methodKey]) {
    return false;
  }

  spec.paths[normalizedPath][methodKey] = createCustomRouteOperation({
    method,
    path: normalizedPath,
    originalKey: details.originalKey,
    scope: details.scope,
    tags: details.tags,
    security: details.security
  });

  return true;
}

function gatherCustomRouteDefinitions(routeMaps = []) {
  const collected = [];
  const seen = new Set();

  for (const routes of routeMaps) {
    if (!routes || typeof routes !== 'object') {
      continue;
    }

    for (const [key, handler] of Object.entries(routes)) {
      if (typeof handler !== 'function') {
        continue;
      }

      const parsed = parseCustomRouteDefinition(key);
      if (!parsed) {
        continue;
      }

      const dedupeKey = `${parsed.method} ${parsed.path}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      collected.push(parsed);
    }
  }

  return collected;
}

function formatResourceLabel(resourceName = '') {
  const label = startCase(String(resourceName || '').replace(/[/_-]+/g, ' ')).trim();
  return label || resourceName || '';
}

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

  // Use $schema for reliable access to resource definition
  const allAttributes = resource.$schema.attributes || {};

  // Filter out plugin attributes - they are internal implementation details
  // and should not be exposed in public API documentation
  const pluginAttrNames = resource.schema?._pluginAttributes
    ? Object.values(resource.schema._pluginAttributes).flat()
    : [];

  const attributes = Object.fromEntries(
    Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name))
  );

  // Extract resource description from $schema.api.description (new) or $schema.description (legacy)
  // Supports both string and object format: { resource: '...', attributes: { field: 'desc' } }
  const apiConfig = resource.$schema?.api || {};
  const resourceDescription = apiConfig.description || resource.$schema?.description;
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
  const resourceLabel = formatResourceLabel(resourceName);
  const basePathPrefix = config.basePath || '';
  const resolveSecurity = typeof config.resolveSecurityForPath === 'function'
    ? config.resolveSecurityForPath
    : null;

  // Determine version prefix (same logic as server.js)
  let versionPrefixConfig = config.versionPrefix !== undefined ? config.versionPrefix : false;

  let prefix = '';
  if (versionPrefixConfig === true) {
    prefix = version;
  } else if (versionPrefixConfig === false) {
    prefix = '';
  } else if (typeof versionPrefixConfig === 'string') {
    prefix = versionPrefixConfig;
  }

  const basePath = applyBasePath(basePathPrefix, prefix ? `/${prefix}/${resourceName}` : `/${resourceName}`);
  const schema = generateResourceSchema(resource);
  const methods = config.methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const authMethods = config.auth || [];
  const requiresAuth = authMethods && authMethods.length > 0;
  const hasRelations = resource._relations && Object.keys(resource._relations).length > 0;

  const paths = {};
  const runtimeBasePath = basePath;
  const runtimeItemPath = toRuntimePath(`${basePath}/{id}`);

  // Security schemes
  const security = [];
  if (requiresAuth) {
    if (authMethods.includes('jwt')) security.push({ bearerAuth: [] });
    if (authMethods.includes('apiKey')) security.push({ apiKeyAuth: [] });
    if (authMethods.includes('basic')) security.push({ basicAuth: [] });
    if (authMethods.includes('oidc')) security.push({ oidcAuth: [] });
  }

  const formatSecurityForPath = (runtimePath) => {
    if (!resolveSecurity) {
      return security.length > 0 ? security : undefined;
    }
    const resolved = resolveSecurity(runtimePath);
    if (resolved === null || resolved === undefined) {
      return security.length > 0 ? security : undefined;
    }
    return resolved.length > 0 ? resolved : undefined;
  };

  // Extract partition information for documentation
  // Use $schema for reliable access to partition definitions
  const partitions = resource.$schema.partitions || {};
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
    const allAttributes = resource.config?.attributes || resource.attributes || {};

    // Filter out plugin attributes
    const pluginAttrNames = resource.schema?._pluginAttributes
      ? Object.values(resource.schema._pluginAttributes).flat()
      : [];

    const attributes = Object.fromEntries(
      Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name))
    );

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
        summary: `List ${resourceLabel}`,
        description: `Retrieve a paginated list of ${resourceLabel}. Supports filtering by passing any resource field as a query parameter (e.g., ?status=active&year=2024). Values are parsed as JSON if possible, otherwise treated as strings.

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
          ...(hasRelations ? [
            {
              name: 'populate',
              in: 'query',
              description: 'Comma-separated list of relations to populate (e.g., customer,items.product).',
              schema: { type: 'string' },
              example: 'customer,items.product'
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
        security: formatSecurityForPath(runtimeBasePath)
      }
    };
  }

  // Get by ID endpoint
  if (methods.includes('GET')) {
    paths[`${basePath}/{id}`] = {
      get: {
        tags: [resourceName],
        summary: `Get ${resourceLabel} by ID`,
        description: `Retrieve a single ${resourceLabel} by its ID${hasPartitions ? '. Optionally specify a partition for more efficient retrieval.' : ''}`,
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
          ] : []),
          ...(hasRelations ? [
            {
              name: 'populate',
              in: 'query',
              description: 'Comma-separated list of relations to populate (e.g., customer,items.product).',
              schema: { type: 'string' },
              example: 'customer,items'
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
        security: formatSecurityForPath(runtimeItemPath)
      }
    };
  }

  // Create endpoint
  if (methods.includes('POST')) {
    if (!paths[basePath]) paths[basePath] = {};
    paths[basePath].post = {
      tags: [resourceName],
      summary: `Create ${resourceLabel}`,
      description: `Create a new ${resourceLabel}`,
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
      security: formatSecurityForPath(runtimeBasePath)
    };
  }

  // Update (full) endpoint
  if (methods.includes('PUT')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].put = {
      tags: [resourceName],
      summary: `Replace ${resourceLabel}`,
      description: `Replace a ${resourceLabel} with a full payload`,
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
      security: formatSecurityForPath(runtimeItemPath)
    };
  }

  // Update (partial) endpoint
  if (methods.includes('PATCH')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].patch = {
      tags: [resourceName],
      summary: `Update ${resourceLabel}`,
      description: `Partially update a ${resourceLabel}`,
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
      security: formatSecurityForPath(runtimeItemPath)
    };
  }

  // Delete endpoint
  if (methods.includes('DELETE')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].delete = {
      tags: [resourceName],
      summary: `Delete ${resourceLabel}`,
      description: `Delete a ${resourceLabel} by ID`,
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
      security: formatSecurityForPath(runtimeItemPath)
    };
  }

  // HEAD endpoint - Get resource statistics
  if (methods.includes('HEAD')) {
    if (!paths[basePath]) paths[basePath] = {};
    paths[basePath].head = {
      tags: [resourceName],
      summary: `Get ${resourceLabel} statistics`,
      description: `Get statistics about ${resourceLabel} collection without retrieving data. Returns statistics in response headers.`,
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
      security: formatSecurityForPath(runtimeBasePath)
    };

    // HEAD for individual resource
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`].head = {
      tags: [resourceName],
      summary: `Check if ${resourceLabel} exists`,
      description: `Check if a ${resourceLabel} exists without retrieving its data`,
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
      security: formatSecurityForPath(runtimeItemPath)
    };
  }

  // OPTIONS endpoint - Get resource metadata
  if (methods.includes('OPTIONS')) {
    if (!paths[basePath]) paths[basePath] = {};
    paths[basePath].options = {
      tags: [resourceName],
      summary: `Get ${resourceLabel} metadata`,
      description: `Get complete metadata about ${resourceLabel} resource including schema, allowed methods, endpoints, and query parameters`,
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
      summary: `Get allowed methods for ${resourceLabel} item`,
      description: `Get allowed HTTP methods for individual ${resourceLabel} operations`,
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
 * @param {string} versionPrefix - Version prefix to use (empty string for no prefix)
 * @param {string} basePathPrefix - Normalized base path
 * @returns {Object} OpenAPI paths for relation
 */
function generateRelationalPaths(
  resource,
  relationName,
  relationConfig,
  version,
  relatedSchema,
  versionPrefix = '',
  basePathPrefix = '',
  resolveSecurityForPath = null
) {
  const resourceName = resource.name;
  const resourceLabel = formatResourceLabel(resourceName);
  const relationLabel = formatResourceLabel(relationName);
  const basePath = applyBasePath(
    basePathPrefix,
    versionPrefix
      ? `/${versionPrefix}/${resourceName}/{id}/${relationName}`
      : `/${resourceName}/{id}/${relationName}`
  );
  const relatedResourceName = relationConfig.resource;
  const isToMany = relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany';
  const runtimeRelationPath = toRuntimePath(basePath);
  const resolveSecurity = typeof resolveSecurityForPath === 'function'
    ? resolveSecurityForPath
    : null;
  const formatSecurityForPath = (runtimePath) => {
    if (!resolveSecurity) {
      return undefined;
    }
    const resolved = resolveSecurity(runtimePath);
    if (!resolved || resolved.length === 0) {
      return undefined;
    }
    return resolved;
  };

  const paths = {};

  paths[basePath] = {
    get: {
      tags: [resourceName],
      summary: `Get ${relationLabel} of ${resourceLabel}`,
      description: `Retrieve ${relationLabel} (${relationConfig.type}) associated with this ${resourceLabel}. ` +
                   `This endpoint uses the RelationPlugin to efficiently load related data` +
                   (relationConfig.partitionHint ? ` via the '${relationConfig.partitionHint}' partition.` : '.'),
      parameters: [
        {
          name: 'id',
          in: 'path',
          required: true,
          description: `${resourceLabel} ID`,
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
      },
      security: formatSecurityForPath(runtimeRelationPath)
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
    resources: resourceConfigs = {},
    versionPrefix: globalVersionPrefix,
    basePath = '',
    routes: pluginRoutes = {}
  } = config;
  const normalizedBasePath = normalizeBasePath(basePath);

  // Build resources table for description
  const resourcesTableRows = [];
  for (const [name, resource] of Object.entries(database.resources)) {
    const rawConfig = resourceConfigs[name];

    // Skip resources explicitly disabled
    if (rawConfig?.enabled === false) {
      continue;
    }

    // Skip plugin resources unless explicitly configured
    if (name.startsWith('plg_') && !rawConfig) {
      continue;
    }

    const version = resource.config?.currentVersion || resource.version || 'v1';
    // Read description from $schema.api.description (new) or resource.config.description (legacy)
    const apiConfig = resource.$schema?.api || {};
    const resourceDescription = apiConfig.description || resource.config?.description;
    const descText = typeof resourceDescription === 'object'
      ? resourceDescription.resource
      : resourceDescription || 'No description';

    // Check version prefix for this resource (same logic as server.js)
    const resourceConfig = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    let versionPrefixConfig;
    if (resourceConfig.versionPrefix !== undefined) {
      versionPrefixConfig = resourceConfig.versionPrefix;
    } else if (resource.config && resource.config.versionPrefix !== undefined) {
      versionPrefixConfig = resource.config.versionPrefix;
    } else if (globalVersionPrefix !== undefined) {
      versionPrefixConfig = globalVersionPrefix;
    } else {
      versionPrefixConfig = false; // Default to no prefix
    }

    let prefix = '';
    if (versionPrefixConfig === true) {
      prefix = version;
    } else if (versionPrefixConfig === false) {
      prefix = '';
    } else if (typeof versionPrefixConfig === 'string') {
      prefix = versionPrefixConfig;
    }

    const resourceBasePath = applyBasePath(normalizedBasePath, prefix ? `/${prefix}/${name}` : `/${name}`);

    resourcesTableRows.push(`| ${name} | ${descText} | \`${resourceBasePath}\` |`);
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

  const resolveSecurityForPath = createPathSecurityResolver(auth);

  const documentedCustomRouteOperations = new Set();
  let customRoutesUsed = false;

  const registerCustomRouteOperation = ({ fullPath, method, originalKey, scope, tags, basePrefix, versionPrefix }) => {
    const opKey = `${method.toUpperCase()} ${convertPathToOpenAPI(fullPath)}`;
    if (documentedCustomRouteOperations.has(opKey)) {
      return;
    }

    // Use provided tags (already processed for resource-level routes)
    let finalTags = tags || [];

    // If tags include CUSTOM_ROUTES_TAG, try to infer a better tag
    if (finalTags.includes(CUSTOM_ROUTES_TAG)) {
      const inferredTag = inferTagFromPath(fullPath, basePrefix, versionPrefix);

      if (inferredTag) {
        // Replace CUSTOM_ROUTES_TAG with inferred tag
        finalTags = finalTags.map(tag => tag === CUSTOM_ROUTES_TAG ? inferredTag : tag);

        // Remove duplicates (e.g., if inferred tag equals resource name)
        finalTags = [...new Set(finalTags)];

        // Ensure inferred tag exists in spec.tags if not already present
        if (!spec.tags.some(t => t.name === inferredTag)) {
          spec.tags.push({
            name: inferredTag,
            description: `Routes for ${inferredTag}`
          });
        }
      }
    } else if (finalTags.length === 0) {
      // If no tags provided, try to infer
      const inferredTag = inferTagFromPath(fullPath, basePrefix, versionPrefix);
      if (inferredTag) {
        finalTags = [inferredTag];
        if (!spec.tags.some(t => t.name === inferredTag)) {
          spec.tags.push({
            name: inferredTag,
            description: `Routes for ${inferredTag}`
          });
        }
      } else {
        finalTags = [CUSTOM_ROUTES_TAG];
      }
    } else {
      // Tags already provided (e.g., resource-level with inferred tag)
      // Ensure all tags exist in spec.tags
      for (const tag of finalTags) {
        if (tag !== CUSTOM_ROUTES_TAG && !spec.tags.some(t => t.name === tag)) {
          spec.tags.push({
            name: tag,
            description: `Routes for ${tag}`
          });
        }
      }
    }

    const added = addCustomRouteOperation(spec, fullPath, method, {
      originalKey,
      scope,
      tags: finalTags,
      security: resolveSecurityForPath
        ? resolveSecurityForPath(fullPath)
        : null
    });

    if (added) {
      documentedCustomRouteOperations.add(opKey);
      customRoutesUsed = true;
    }
  };

  const driverEntries = Array.isArray(auth.drivers) ? auth.drivers : [];
  const driverNames = driverEntries
    .map((driver) => driver?.driver || driver?.type)
    .filter(Boolean);

  // Add security schemes based on configured drivers

  // JWT Driver
  const jwtDriver = driverEntries.find((driver) => driver?.driver === 'jwt');
  if (jwtDriver || driverNames.includes('jwt')) {
    const resourceName = jwtDriver?.config?.resource || 'users';
    spec.components.securitySchemes.bearerAuth = {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: `JWT Bearer token authentication. Users stored in '${resourceName}' resource.`
    };
  }

  // API Key Driver
  const apiKeyDriver = driverEntries.find((driver) => driver?.driver === 'apiKey');
  if (apiKeyDriver || driverNames.includes('apiKey')) {
    const headerName = apiKeyDriver?.config?.headerName || 'X-API-Key';
    const resourceName = apiKeyDriver?.config?.resource || 'users';
    const queryParam = apiKeyDriver?.config?.queryParam;

    let description = `API Key authentication via ${headerName} header.`;
    if (queryParam) {
      description += ` Also accepts '${queryParam}' query parameter.`;
    }
    description += ` Keys managed in '${resourceName}' resource.`;

    spec.components.securitySchemes.apiKeyAuth = {
      type: 'apiKey',
      in: 'header',
      name: headerName,
      description
    };
  }

  // Basic Auth Driver
  const basicDriver = driverEntries.find((driver) => driver?.driver === 'basic');
  if (basicDriver || driverNames.includes('basic')) {
    const resourceName = basicDriver?.config?.resource || 'users';
    const realm = basicDriver?.config?.realm || 'API Access';
    const cookieName = basicDriver?.config?.cookieName;

    let description = `HTTP Basic authentication (realm: '${realm}').`;
    if (cookieName) {
      description += ` Cookie fallback: '${cookieName}'.`;
    }
    description += ` Credentials stored in '${resourceName}' resource.`;

    spec.components.securitySchemes.basicAuth = {
      type: 'http',
      scheme: 'basic',
      description
    };
  }

  // OAuth2 Driver
  const oauth2Driver = driverEntries.find((driver) => driver?.driver === 'oauth2');
  if (oauth2Driver) {
    const issuer = oauth2Driver.config?.issuer;
    const audience = oauth2Driver.config?.audience;
    const resourceName = oauth2Driver.config?.resource || 'users';

    let description = `OAuth2 Bearer token authentication (Resource Server mode).`;
    if (issuer) {
      description += ` Issuer: ${issuer}.`;
    }
    if (audience) {
      description += ` Audience: ${audience}.`;
    }
    description += ` User data synced to '${resourceName}' resource.`;

    spec.components.securitySchemes.oauth2Auth = {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description
    };
  }

  // OIDC Driver
  const oidcDriver = driverEntries.find((driver) => driver?.driver === 'oidc');
  if (oidcDriver) {
    const issuer = oidcDriver.config?.issuer;
    const discoveryUrl = oidcDriver.config?.openIdConnectUrl ||
      (issuer ? `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration` : null) ||
      `${serverUrl}/.well-known/openid-configuration`;
    const resourceName = oidcDriver.config?.resource || 'users';

    spec.components.securitySchemes.oidcAuth = {
      type: 'openIdConnect',
      openIdConnectUrl: discoveryUrl,
      description: `OpenID Connect authentication. User sessions managed in '${resourceName}' resource.`
    };
  }

  // Generate paths for each resource
  const resources = database.resources;

  // Detect RelationPlugin
  const relationsPlugin = database.pluginRegistry?.relation || database.pluginRegistry?.RelationPlugin || null;

  for (const [name, resource] of Object.entries(resources)) {
    const rawConfig = resourceConfigs[name];
    const resourceLabel = formatResourceLabel(name);

    if (rawConfig?.enabled === false) {
      continue;
    }

    // Skip plugin resources unless explicitly configured
    if (name.startsWith('plg_') && !rawConfig) {
      continue;
    }

    // Get resource configuration
    const resourceConfig = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      auth: false
    };

    // Determine version
    const version = resource.config?.currentVersion || resource.version || 'v1';

    // Determine version prefix (same logic as server.js)
    let versionPrefixConfig;
    if (resourceConfig.versionPrefix !== undefined) {
      versionPrefixConfig = resourceConfig.versionPrefix;
    } else if (resource.config && resource.config.versionPrefix !== undefined) {
      versionPrefixConfig = resource.config.versionPrefix;
    } else if (globalVersionPrefix !== undefined) {
      versionPrefixConfig = globalVersionPrefix;
    } else {
      versionPrefixConfig = false;
    }

    let prefix = '';
    if (versionPrefixConfig === true) {
      prefix = version;
    } else if (versionPrefixConfig === false) {
      prefix = '';
    } else if (typeof versionPrefixConfig === 'string') {
      prefix = versionPrefixConfig;
    }

    const resourceBaseMountPath = applyBasePath(
      normalizedBasePath,
      prefix ? `/${prefix}/${name}` : `/${name}`
    );

    // Generate paths
    const paths = generateResourcePaths(resource, version, {
      ...resourceConfig,
      versionPrefix: versionPrefixConfig,
      basePath: normalizedBasePath,
      resolveSecurityForPath
    });

    // Merge paths
    Object.assign(spec.paths, paths);

    // Add tag with description support (from $schema.api.description or legacy resource.config.description)
    const tagApiConfig = resource.$schema?.api || {};
    const tagResourceDescription = tagApiConfig.description || resource.config?.description;
    const tagDescription = typeof tagResourceDescription === 'object'
      ? tagResourceDescription.resource
      : tagResourceDescription || `Operations for ${name} resource`;

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
        const exposeRelation = resourceConfig?.relations?.[relationName]?.expose !== false;
        if (!exposeRelation) {
          continue;
        }

        // Get related resource schema
        const relatedResource = database.resources[relationConfig.resource];
        if (!relatedResource) {
          continue;
        }

        const relatedSchema = generateResourceSchema(relatedResource);

        // Generate relational paths (using the same prefix calculated above)
        const relationalPaths = generateRelationalPaths(
          resource,
          relationName,
          relationConfig,
          version,
          relatedSchema,
          prefix,
          normalizedBasePath,
          resolveSecurityForPath
        );

        // Merge relational paths
        Object.assign(spec.paths, relationalPaths);
      }
    }

    const resourceCustomRoutes = gatherCustomRouteDefinitions([
      resource.config?.routes,
      resource.config?.api,
      resourceConfig?.routes
    ]);

    for (const routeDef of resourceCustomRoutes) {
      const relativePath = routeDef.path === '/' ? '' : routeDef.path;
      const fullPath = relativePath
        ? `${resourceBaseMountPath}${relativePath}`
        : resourceBaseMountPath;

      // For resource-level routes, infer tag from the relative path (not fullPath)
      // because fullPath already includes the resource name
      const inferredTag = relativePath ? inferTagFromPath(relativePath, '', '') : null;
      const tags = inferredTag && inferredTag !== name
        ? [name, inferredTag]
        : [name];

      registerCustomRouteOperation({
        fullPath,
        method: routeDef.method,
        originalKey: routeDef.originalKey,
        scope: `for resource "${resourceLabel}"`,
        tags,
        basePrefix: normalizedBasePath,
        versionPrefix: prefix
      });
    }
  }

  const pluginCustomRoutesDefined = gatherCustomRouteDefinitions([pluginRoutes]);
  for (const routeDef of pluginCustomRoutesDefined) {
    const fullPath = applyBasePath(normalizedBasePath, routeDef.path);
    registerCustomRouteOperation({
      fullPath,
      method: routeDef.method,
      originalKey: routeDef.originalKey,
      scope: 'at plugin level',
      tags: [CUSTOM_ROUTES_TAG],
      basePrefix: normalizedBasePath,
      versionPrefix: globalVersionPrefix || ''
    });
  }

  // Add authentication endpoints if enabled
  if (auth.jwt?.enabled || auth.apiKey?.enabled || auth.basic?.enabled) {
    const loginPath = applyBasePath(normalizedBasePath, '/auth/login');
    spec.paths[loginPath] = {
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

    const registerPath = applyBasePath(normalizedBasePath, '/auth/register');
    spec.paths[registerPath] = {
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
  const metricsPlugin = database.pluginRegistry?.metrics || database.pluginRegistry?.MetricsPlugin;
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

  if (customRoutesUsed && !spec.tags.some(tag => tag.name === CUSTOM_ROUTES_TAG)) {
    spec.tags.push({
      name: CUSTOM_ROUTES_TAG,
      description: 'User-defined routes configured in ApiPlugin options or resource configurations.'
    });
  }

  return spec;
}

export default {
  generateOpenAPISpec,
  generateResourceSchema,
  generateResourcePaths
};
