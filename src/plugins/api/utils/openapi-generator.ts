import { applyBasePath, normalizeBasePath } from './base-path.js';
import startCase from 'lodash-es/startCase.js';
import { findBestMatch, type PathAuthRule as PathMatcherRule } from './path-matcher.js';

const CUSTOM_ROUTES_TAG = 'Custom Routes';
const CUSTOM_ROUTE_METHOD_REGEX = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i;

export interface ParsedRouteDefinition {
  method: string;
  path: string;
  originalKey: string;
}

export interface PathAuthRule {
  id?: string;
  path?: string;
  pattern?: string;
  required?: boolean;
  methods?: string[];
}

export interface NormalizedPathRule {
  id: string;
  pattern: string;
  required: boolean;
  methods: string[];
}

export interface AuthDriver {
  driver?: string;
  type?: string;
  config?: {
    resource?: string;
    headerName?: string;
    queryParam?: string;
    realm?: string;
    cookieName?: string;
    issuer?: string;
    audience?: string;
    openIdConnectUrl?: string;
    [key: string]: unknown;
  };
}

export interface AuthConfig {
  drivers?: AuthDriver[];
  pathRules?: PathAuthRule[];
  pathAuth?: boolean;
  jwt?: { enabled?: boolean };
  apiKey?: { enabled?: boolean };
  basic?: { enabled?: boolean };
}

export interface ResourceConfigOptions {
  enabled?: boolean;
  methods?: string[];
  auth?: string[];
  versionPrefix?: string | boolean;
  routes?: Record<string, unknown>;
  relations?: Record<string, { expose?: boolean }>;
}

export interface ResourceLike {
  name: string;
  version?: string;
  config?: {
    currentVersion?: string;
    versionPrefix?: string | boolean;
    description?: string | { resource?: string; attributes?: Record<string, string> };
    attributes?: Record<string, unknown>;
    routes?: Record<string, unknown>;
    api?: Record<string, unknown>;
    [key: string]: unknown;
  };
  $schema: {
    attributes?: Record<string, unknown>;
    partitions?: Record<string, PartitionDefinition>;
    api?: {
      description?: string | { resource?: string; attributes?: Record<string, string> };
      [key: string]: unknown;
    };
    description?: string | { resource?: string; attributes?: Record<string, string> };
    [key: string]: unknown;
  };
  schema?: {
    _pluginAttributes?: Record<string, string[]>;
    [key: string]: unknown;
  };
  attributes?: Record<string, unknown>;
  _relations?: Record<string, unknown>;
}

export interface PartitionDefinition {
  fields?: Record<string, string>;
  [key: string]: unknown;
}

export interface DatabaseLike {
  resources: Record<string, ResourceLike>;
  pluginRegistry?: {
    relation?: RelationsPluginLike;
    RelationPlugin?: RelationsPluginLike;
    metrics?: MetricsPluginLike;
    MetricsPlugin?: MetricsPluginLike;
    [key: string]: unknown;
  };
}

export interface RelationsPluginLike {
  relations?: Record<string, Record<string, RelationConfig>>;
}

export interface RelationConfig {
  type: string;
  resource: string;
  partitionHint?: string;
  [key: string]: unknown;
}

export interface MetricsPluginLike {
  config?: {
    prometheus?: {
      enabled?: boolean;
      path?: string;
      mode?: string;
    };
  };
}

export interface ApiAppRoute {
  path: string;
  method: string;
  description?: string;
  summary?: string;
  operationId?: string;
  tags?: string[];
  responseSchema?: OpenAPISchemaObject;
  requestSchema?: OpenAPISchemaObject;
}

export interface ApiAppLike {
  getRoutes(): ApiAppRoute[];
}

export interface OpenAPIGeneratorConfig {
  title?: string;
  version?: string;
  description?: string;
  serverUrl?: string;
  auth?: AuthConfig;
  resources?: Record<string, ResourceConfigOptions>;
  versionPrefix?: string | boolean;
  basePath?: string;
  routes?: Record<string, unknown>;
  app?: ApiAppLike | null;
}

export interface OpenAPISchemaObject {
  type?: string;
  format?: string;
  description?: string;
  example?: unknown;
  default?: unknown;
  properties?: Record<string, OpenAPISchemaObject>;
  items?: OpenAPISchemaObject;
  required?: string[];
  enum?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  readOnly?: boolean;
  nullable?: boolean;
  oneOf?: OpenAPISchemaObject[];
  additionalProperties?: boolean | OpenAPISchemaObject;
  $ref?: string;
}

export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  description?: string;
  required?: boolean;
  schema: OpenAPISchemaObject;
  example?: unknown;
}

export interface OpenAPIRequestBody {
  required?: boolean;
  content: {
    'application/json'?: {
      schema: OpenAPISchemaObject;
    };
  };
}

export interface OpenAPIResponse {
  description: string;
  content?: {
    'application/json'?: {
      schema: OpenAPISchemaObject;
    };
    'text/plain'?: {
      schema: OpenAPISchemaObject;
    };
  };
  headers?: Record<string, { description: string; schema: OpenAPISchemaObject }>;
}

export interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  head?: OpenAPIOperation;
  options?: OpenAPIOperation;
}

export interface OpenAPISecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  in?: string;
  name?: string;
  openIdConnectUrl?: string;
  description?: string;
}

export interface OpenAPITag {
  name: string;
  description?: string;
}

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact?: {
      name?: string;
      url?: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, OpenAPIPathItem>;
  components: {
    schemas: Record<string, OpenAPISchemaObject>;
    securitySchemes: Record<string, OpenAPISecurityScheme>;
  };
  tags: OpenAPITag[];
}

interface CustomRouteDetails {
  originalKey: string;
  scope: string;
  tags: string[];
  security: Array<Record<string, string[]>> | null;
}

interface RegisterCustomRouteParams {
  fullPath: string;
  method: string;
  originalKey: string;
  scope: string;
  tags: string[];
  basePrefix: string;
  versionPrefix: string;
}

type SecurityResolver = (path: string) => Array<Record<string, string[]>> | null;

const DRIVER_SECURITY_MAP: Record<string, string> = {
  jwt: 'bearerAuth',
  apiKey: 'apiKeyAuth',
  basic: 'basicAuth',
  oauth2: 'oauth2Auth',
  oidc: 'oidcAuth'
};

function parseCustomRouteDefinition(definition: string): ParsedRouteDefinition | null {
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
  if (!match || !match[1] || !match[2]) {
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

function convertPathToOpenAPI(path: string): string {
  return path
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/\*/g, '{wildcard}');
}

function methodSupportsRequestBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
}

function toRuntimePath(path: string = ''): string {
  return path.replace(/{([^}]+)}/g, ':$1');
}

function inferTagFromPath(fullPath: string, basePrefix: string = '', versionPrefix: string = ''): string | null {
  if (!fullPath || typeof fullPath !== 'string') {
    return null;
  }

  let path = fullPath.trim();

  if (basePrefix && typeof basePrefix === 'string') {
    const normalizedBase = basePrefix.trim();
    if (normalizedBase && path.startsWith(normalizedBase)) {
      path = path.substring(normalizedBase.length);
    }
  }

  if (versionPrefix && typeof versionPrefix === 'string') {
    const normalizedVersion = versionPrefix.trim();
    if (normalizedVersion) {
      const versionPattern = normalizedVersion.startsWith('/')
        ? normalizedVersion
        : `/${normalizedVersion}`;
      if (path.startsWith(versionPattern)) {
        path = path.substring(versionPattern.length);
      }
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  if (path === '/liveness' || path === '/readiness' || path === '/health') {
    return 'Health';
  }

  const segments = path.split('/').filter(segment => segment.length > 0);

  if (segments.length === 0) {
    return null;
  }

  const firstSegment = segments[0];

  if (!firstSegment || firstSegment.startsWith(':') || firstSegment.startsWith('{') || firstSegment === '*') {
    return null;
  }

  if (!firstSegment.trim()) {
    return null;
  }

  return firstSegment.toLowerCase();
}

function createPathSecurityResolver(auth: AuthConfig = {}): SecurityResolver {
  const rawRules = Array.isArray(auth.pathRules) ? auth.pathRules : [];
  if (rawRules.length === 0) {
    return () => null;
  }

  const normalizedRules: NormalizedPathRule[] = rawRules
    .map((rule, index): NormalizedPathRule | null => {
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
    .filter((rule): rule is NormalizedPathRule => rule !== null);

  if (normalizedRules.length === 0) {
    return () => null;
  }

  return (path: string): Array<Record<string, string[]>> | null => {
    const match = findBestMatch(normalizedRules as unknown as PathMatcherRule[], path);
    if (!match) {
      return null;
    }
    const normalizedMatch = match as unknown as NormalizedPathRule;
    if (!normalizedMatch.required) {
      return [];
    }
    const schemes = (normalizedMatch.methods || [])
      .map((driver: string) => DRIVER_SECURITY_MAP[driver])
      .filter((s): s is string => Boolean(s));
    if (schemes.length === 0) {
      return [];
    }
    return schemes.map((scheme) => ({ [scheme]: [] }));
  };
}

function buildCustomRouteOperationId(scope: string, method: string, path: string): string {
  const sanitizedPath = path
    .replace(/[{}\/:\-\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '') || 'root';
  return `${scope}_${method.toLowerCase()}_${sanitizedPath}`;
}

function createCustomRouteOperation(params: {
  method: string;
  path: string;
  originalKey: string;
  scope: string;
  tags: string[];
  security: Array<Record<string, string[]>> | null;
}): OpenAPIOperation {
  const { method, path, originalKey, scope, tags, security } = params;
  const summary = `${method} ${path}`;
  const descriptionLines = [
    `Route defined ${scope}.`,
    `Original definition: \`${originalKey}\`.`,
    'Request and response payloads depend on the handler implementation.'
  ];

  const responses: Record<string, OpenAPIResponse> = {
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
                  { type: 'string' } // null represented as string type
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

  const requestBody: OpenAPIRequestBody | undefined = methodSupportsRequestBody(method)
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

function addCustomRouteOperation(
  spec: OpenAPISpec,
  path: string,
  method: string,
  details: CustomRouteDetails
): boolean {
  const normalizedPath = convertPathToOpenAPI(path);
  const methodKey = method.toLowerCase() as keyof OpenAPIPathItem;

  if (!spec.paths[normalizedPath]) {
    spec.paths[normalizedPath] = {};
  }

  if (spec.paths[normalizedPath][methodKey]) {
    return false;
  }

  (spec.paths[normalizedPath] as Record<string, OpenAPIOperation>)[methodKey] = createCustomRouteOperation({
    method,
    path: normalizedPath,
    originalKey: details.originalKey,
    scope: details.scope,
    tags: details.tags,
    security: details.security
  });

  return true;
}

function gatherCustomRouteDefinitions(routeMaps: Array<Record<string, unknown> | undefined | null>): ParsedRouteDefinition[] {
  const collected: ParsedRouteDefinition[] = [];
  const seen = new Set<string>();

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

function formatResourceLabel(resourceName: string = ''): string {
  const label = startCase(String(resourceName || '').replace(/[/_-]+/g, ' ')).trim();
  return label || resourceName || '';
}

function mapFieldTypeToOpenAPI(fieldType: string): OpenAPISchemaObject {
  const type = (fieldType.split('|')[0] || 'string').trim();

  const typeMap: Record<string, OpenAPISchemaObject> = {
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

  if (type.startsWith('embedding:')) {
    const length = parseInt(type.split(':')[1] || '0', 10);
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

interface ValidationRules {
  required?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  default?: string;
}

function extractValidationRules(fieldDef: string): ValidationRules {
  const rules: ValidationRules = {};
  const parts = fieldDef.split('|');

  for (const part of parts) {
    const splitParts = part.split(':').map(s => s.trim());
    const rule = splitParts[0] || '';
    const value = splitParts[1] || '';

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
        rules.minLength = parseInt(value, 10);
        break;
      case 'maxlength':
        rules.maxLength = parseInt(value, 10);
        break;
      case 'pattern':
        rules.pattern = value;
        break;
      case 'enum':
        rules.enum = value ? value.split(',').map(v => v.trim()) : [];
        break;
      case 'default':
        rules.default = value;
        break;
    }
  }

  return rules;
}

export function generateResourceSchema(resource: ResourceLike): OpenAPISchemaObject {
  const properties: Record<string, OpenAPISchemaObject> = {};
  const required: string[] = [];

  const allAttributes = resource.$schema.attributes || {};

  const pluginAttrNames = resource.schema?._pluginAttributes
    ? Object.values(resource.schema._pluginAttributes).flat()
    : [];

  const attributes = Object.fromEntries(
    Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name))
  );

  const apiConfig = resource.$schema?.api || {};
  const resourceDescription = apiConfig.description || resource.$schema?.description;
  const attributeDescriptions = typeof resourceDescription === 'object'
    ? (resourceDescription.attributes || {})
    : {};

  properties.id = {
    type: 'string',
    description: 'Unique identifier for the resource',
    example: '2_gDTpeU6EI0e8B92n_R3Y',
    readOnly: true
  };

  for (const [fieldName, fieldDef] of Object.entries(attributes)) {
    if (typeof fieldDef === 'object' && fieldDef !== null && 'type' in fieldDef) {
      const typedFieldDef = fieldDef as { type: string; description?: string; required?: boolean; props?: Record<string, unknown>; items?: string };
      const baseType = mapFieldTypeToOpenAPI(typedFieldDef.type);
      properties[fieldName] = {
        ...baseType,
        description: typedFieldDef.description || attributeDescriptions[fieldName] || undefined
      };

      if (typedFieldDef.required) {
        required.push(fieldName);
      }

      if (typedFieldDef.type === 'object' && typedFieldDef.props) {
        properties[fieldName].properties = {};
        for (const [propName, propDef] of Object.entries(typedFieldDef.props)) {
          const propType = typeof propDef === 'string' ? propDef : (propDef as { type: string }).type;
          properties[fieldName].properties![propName] = mapFieldTypeToOpenAPI(propType);
        }
      }

      if (typedFieldDef.type === 'array' && typedFieldDef.items) {
        properties[fieldName].items = mapFieldTypeToOpenAPI(typedFieldDef.items);
      }
    } else if (typeof fieldDef === 'string') {
      const baseType = mapFieldTypeToOpenAPI(fieldDef);
      const rules = extractValidationRules(fieldDef);

      properties[fieldName] = {
        ...baseType,
        ...rules,
        description: attributeDescriptions[fieldName] || undefined
      } as OpenAPISchemaObject;

      if (rules.required) {
        required.push(fieldName);
        delete (properties[fieldName] as Record<string, unknown>).required;
      }
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined
  };
}

interface ResourcePathsConfig {
  basePath?: string;
  versionPrefix?: string | boolean;
  methods?: string[];
  auth?: string[];
  resolveSecurityForPath?: SecurityResolver | null;
}

export function generateResourcePaths(
  resource: ResourceLike,
  version: string,
  config: ResourcePathsConfig = {}
): Record<string, OpenAPIPathItem> {
  const resourceName = resource.name;
  const resourceLabel = formatResourceLabel(resourceName);
  const basePathPrefix = config.basePath || '';
  const resolveSecurity = typeof config.resolveSecurityForPath === 'function'
    ? config.resolveSecurityForPath
    : null;

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

  const paths: Record<string, OpenAPIPathItem> = {};
  const runtimeBasePath = basePath;
  const runtimeItemPath = toRuntimePath(`${basePath}/{id}`);

  const security: Array<Record<string, string[]>> = [];
  if (requiresAuth) {
    if (authMethods.includes('jwt')) security.push({ bearerAuth: [] });
    if (authMethods.includes('apiKey')) security.push({ apiKeyAuth: [] });
    if (authMethods.includes('basic')) security.push({ basicAuth: [] });
    if (authMethods.includes('oidc')) security.push({ oidcAuth: [] });
  }

  const formatSecurityForPath = (runtimePath: string): Array<Record<string, string[]>> | undefined => {
    if (!resolveSecurity) {
      return security.length > 0 ? security : undefined;
    }
    const resolved = resolveSecurity(runtimePath);
    if (resolved === null || resolved === undefined) {
      return security.length > 0 ? security : undefined;
    }
    return resolved.length > 0 ? resolved : undefined;
  };

  const partitions = resource.$schema.partitions || {};
  const partitionNames = Object.keys(partitions);
  const hasPartitions = partitionNames.length > 0;

  let partitionDescription = 'Partition name for filtering';
  let partitionValuesDescription = 'Partition values as JSON string';
  let partitionExample: string | undefined = undefined;
  let partitionValuesExample: string | undefined = undefined;

  if (hasPartitions) {
    const partitionDocs = partitionNames.map(name => {
      const partition = partitions[name]!;
      const fields = Object.keys(partition.fields || {});
      const fieldTypes = Object.entries(partition.fields || {})
        .map(([field, type]) => `${field}: ${type}`)
        .join(', ');
      return `- **${name}**: Filters by ${fields.join(', ')} (${fieldTypes})`;
    }).join('\n');

    partitionDescription = `Available partitions:\n${partitionDocs}`;

    const examplePartition = partitionNames[0]!;
    const exampleFields = partitions[examplePartition]?.fields || {};
    const exampleFieldKeys = Object.keys(exampleFields);
    const exampleFieldsDoc = Object.entries(exampleFields)
      .map(([field, type]) => `"${field}": <${type} value>`)
      .join(', ');

    partitionValuesDescription = `Partition field values as JSON string. Must match the structure of the selected partition.\n\nExample for "${examplePartition}" partition: \`{"${exampleFieldKeys[0] || 'field'}": "value"}\``;

    partitionExample = examplePartition;
    const firstField = exampleFieldKeys[0] || 'field';
    const firstFieldType = exampleFields[firstField];
    let exampleValue: unknown = 'example';
    if (firstFieldType === 'number' || firstFieldType === 'integer') {
      exampleValue = 123;
    } else if (firstFieldType === 'boolean') {
      exampleValue = true;
    }
    partitionValuesExample = JSON.stringify({ [firstField]: exampleValue });
  }

  const attributeQueryParams: OpenAPIParameter[] = [];

  if (hasPartitions) {
    const partitionFieldsSet = new Set<string>();

    for (const [, partition] of Object.entries(partitions)) {
      const fields = partition.fields || {};
      for (const fieldName of Object.keys(fields)) {
        partitionFieldsSet.add(fieldName);
      }
    }

    const allAttributes = resource.config?.attributes || resource.attributes || {};

    const pluginAttrNames = resource.schema?._pluginAttributes
      ? Object.values(resource.schema._pluginAttributes).flat()
      : [];

    const filteredAttributes = Object.fromEntries(
      Object.entries(allAttributes).filter(([name]) => !pluginAttrNames.includes(name))
    );

    for (const fieldName of partitionFieldsSet) {
      const fieldDef = filteredAttributes[fieldName];
      if (!fieldDef) continue;

      let fieldType: string;
      if (typeof fieldDef === 'object' && fieldDef !== null && 'type' in fieldDef) {
        fieldType = (fieldDef as { type: string }).type;
      } else if (typeof fieldDef === 'string') {
        fieldType = (fieldDef.split('|')[0] || 'string').trim();
      } else {
        fieldType = 'string';
      }

      const openAPIType = mapFieldTypeToOpenAPI(fieldType);

      attributeQueryParams.push({
        name: fieldName,
        in: 'query',
        description: `Filter by ${fieldName} field (indexed via partitions for efficient querying). Value will be parsed as JSON if possible, otherwise treated as string.`,
        required: false,
        schema: openAPIType
      });
    }
  }

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
              in: 'query' as const,
              description: partitionDescription,
              schema: {
                type: 'string',
                enum: partitionNames
              },
              example: partitionExample
            },
            {
              name: 'partitionValues',
              in: 'query' as const,
              description: partitionValuesDescription,
              schema: { type: 'string' },
              example: partitionValuesExample
            }
          ] : []),
          ...(hasRelations ? [
            {
              name: 'populate',
              in: 'query' as const,
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
              in: 'query' as const,
              description: partitionDescription,
              schema: {
                type: 'string',
                enum: partitionNames
              },
              example: partitionExample
            },
            {
              name: 'partitionValues',
              in: 'query' as const,
              description: partitionValuesDescription,
              schema: { type: 'string' },
              example: partitionValuesExample
            }
          ] : []),
          ...(hasRelations ? [
            {
              name: 'populate',
              in: 'query' as const,
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

  if (methods.includes('PUT')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`]!.put = {
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

  if (methods.includes('PATCH')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`]!.patch = {
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
              required: undefined
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

  if (methods.includes('DELETE')) {
    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`]!.delete = {
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

    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`]!.head = {
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

    if (!paths[`${basePath}/{id}`]) paths[`${basePath}/{id}`] = {};
    paths[`${basePath}/{id}`]!.options = {
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

function generateRelationalPaths(
  resource: ResourceLike,
  relationName: string,
  relationConfig: RelationConfig,
  version: string,
  relatedSchema: OpenAPISchemaObject,
  versionPrefix: string = '',
  basePathPrefix: string = '',
  resolveSecurityForPath: SecurityResolver | null = null
): Record<string, OpenAPIPathItem> {
  const resourceName = resource.name;
  const resourceLabel = formatResourceLabel(resourceName);
  const relationLabel = formatResourceLabel(relationName);
  const basePath = applyBasePath(
    basePathPrefix,
    versionPrefix
      ? `/${versionPrefix}/${resourceName}/{id}/${relationName}`
      : `/${resourceName}/{id}/${relationName}`
  );
  const isToMany = relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany';
  const runtimeRelationPath = toRuntimePath(basePath);
  const resolveSecurity = typeof resolveSecurityForPath === 'function'
    ? resolveSecurityForPath
    : null;

  const formatSecurityForPath = (runtimePath: string): Array<Record<string, string[]>> | undefined => {
    if (!resolveSecurity) {
      return undefined;
    }
    const resolved = resolveSecurity(runtimePath);
    if (!resolved || resolved.length === 0) {
      return undefined;
    }
    return resolved;
  };

  const paths: Record<string, OpenAPIPathItem> = {};

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
            in: 'query' as const,
            description: 'Maximum number of items to return',
            schema: { type: 'integer', default: 100, minimum: 1, maximum: 1000 }
          },
          {
            name: 'offset',
            in: 'query' as const,
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

export function generateOpenAPISpec(database: DatabaseLike, config: OpenAPIGeneratorConfig = {}): OpenAPISpec {
  const {
    title = 's3db.js API',
    version = '1.0.0',
    description = 'Auto-generated REST API documentation for s3db.js resources',
    serverUrl = 'http://localhost:3000',
    auth = {},
    resources: resourceConfigs = {},
    versionPrefix: globalVersionPrefix,
    basePath = '',
    routes: pluginRoutes = {},
    app = null
  } = config;
  const normalizedBasePath = normalizeBasePath(basePath);

  const resourcesTableRows: string[] = [];
  for (const [name, resource] of Object.entries(database.resources)) {
    const rawConfig = resourceConfigs[name];

    if (rawConfig?.enabled === false) {
      continue;
    }

    if (name.startsWith('plg_') && !rawConfig) {
      continue;
    }

    const resourceVersion = resource.config?.currentVersion || resource.version || 'v1';
    const apiConfig = resource.$schema?.api || {};
    const resourceDescription = apiConfig.description || resource.config?.description;
    const descText = typeof resourceDescription === 'object'
      ? resourceDescription.resource
      : resourceDescription || 'No description';

    const resourceConfig = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    let versionPrefixConfig: string | boolean;
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
      prefix = resourceVersion;
    } else if (versionPrefixConfig === false) {
      prefix = '';
    } else if (typeof versionPrefixConfig === 'string') {
      prefix = versionPrefixConfig;
    }

    const resourceBasePath = applyBasePath(normalizedBasePath, prefix ? `/${prefix}/${name}` : `/${name}`);

    resourcesTableRows.push(`| ${name} | ${descText} | \`${resourceBasePath}\` |`);
  }

  const enhancedDescription = `${description}

## Available Resources

| Resource | Description | Base Path |
|----------|-------------|-----------|
${resourcesTableRows.join('\n')}

---

For detailed information about each endpoint, see the sections below.`;

  const spec: OpenAPISpec = {
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

  const documentedCustomRouteOperations = new Set<string>();
  let customRoutesUsed = false;

  const registerCustomRouteOperation = (params: RegisterCustomRouteParams): void => {
    const { fullPath, method, originalKey, scope, tags, basePrefix, versionPrefix } = params;
    const opKey = `${method.toUpperCase()} ${convertPathToOpenAPI(fullPath)}`;
    if (documentedCustomRouteOperations.has(opKey)) {
      return;
    }

    let finalTags = tags || [];

    if (finalTags.includes(CUSTOM_ROUTES_TAG)) {
      const inferredTag = inferTagFromPath(fullPath, basePrefix, versionPrefix);

      if (inferredTag) {
        finalTags = finalTags.map(tag => tag === CUSTOM_ROUTES_TAG ? inferredTag : tag);
        finalTags = [...new Set(finalTags)];

        if (!spec.tags.some(t => t.name === inferredTag)) {
          spec.tags.push({
            name: inferredTag,
            description: `Routes for ${inferredTag}`
          });
        }
      }
    } else if (finalTags.length === 0) {
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
    .filter(Boolean) as string[];

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

  const apiKeyDriver = driverEntries.find((driver) => driver?.driver === 'apiKey');
  if (apiKeyDriver || driverNames.includes('apiKey')) {
    const headerName = apiKeyDriver?.config?.headerName || 'X-API-Key';
    const resourceName = apiKeyDriver?.config?.resource || 'users';
    const queryParam = apiKeyDriver?.config?.queryParam;

    let securityDescription = `API Key authentication via ${headerName} header.`;
    if (queryParam) {
      securityDescription += ` Also accepts '${queryParam}' query parameter.`;
    }
    securityDescription += ` Keys managed in '${resourceName}' resource.`;

    spec.components.securitySchemes.apiKeyAuth = {
      type: 'apiKey',
      in: 'header',
      name: headerName,
      description: securityDescription
    };
  }

  const basicDriver = driverEntries.find((driver) => driver?.driver === 'basic');
  if (basicDriver || driverNames.includes('basic')) {
    const resourceName = basicDriver?.config?.resource || 'users';
    const realm = basicDriver?.config?.realm || 'API Access';
    const cookieName = basicDriver?.config?.cookieName;

    let securityDescription = `HTTP Basic authentication (realm: '${realm}').`;
    if (cookieName) {
      securityDescription += ` Cookie fallback: '${cookieName}'.`;
    }
    securityDescription += ` Credentials stored in '${resourceName}' resource.`;

    spec.components.securitySchemes.basicAuth = {
      type: 'http',
      scheme: 'basic',
      description: securityDescription
    };
  }

  const oauth2Driver = driverEntries.find((driver) => driver?.driver === 'oauth2');
  if (oauth2Driver) {
    const issuer = oauth2Driver.config?.issuer;
    const audience = oauth2Driver.config?.audience;
    const resourceName = oauth2Driver.config?.resource || 'users';

    let securityDescription = `OAuth2 Bearer token authentication (Resource Server mode).`;
    if (issuer) {
      securityDescription += ` Issuer: ${issuer}.`;
    }
    if (audience) {
      securityDescription += ` Audience: ${audience}.`;
    }
    securityDescription += ` User data synced to '${resourceName}' resource.`;

    spec.components.securitySchemes.oauth2Auth = {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: securityDescription
    };
  }

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

  const resources = database.resources;

  const relationsPlugin = database.pluginRegistry?.relation || database.pluginRegistry?.RelationPlugin || null;

  for (const [name, resource] of Object.entries(resources)) {
    const rawConfig = resourceConfigs[name];
    const resourceLabel = formatResourceLabel(name);

    if (rawConfig?.enabled === false) {
      continue;
    }

    if (name.startsWith('plg_') && !rawConfig) {
      continue;
    }

    const resourceConfig: ResourceConfigOptions = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      auth: []
    };

    const resourceVersion = resource.config?.currentVersion || resource.version || 'v1';

    let versionPrefixConfig: string | boolean;
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
      prefix = resourceVersion;
    } else if (versionPrefixConfig === false) {
      prefix = '';
    } else if (typeof versionPrefixConfig === 'string') {
      prefix = versionPrefixConfig;
    }

    const resourceBaseMountPath = applyBasePath(
      normalizedBasePath,
      prefix ? `/${prefix}/${name}` : `/${name}`
    );

    const paths = generateResourcePaths(resource, resourceVersion, {
      ...resourceConfig,
      versionPrefix: versionPrefixConfig,
      basePath: normalizedBasePath,
      resolveSecurityForPath
    });

    Object.assign(spec.paths, paths);

    const tagApiConfig = resource.$schema?.api || {};
    const tagResourceDescription = tagApiConfig.description || resource.config?.description;
    const tagDescription = typeof tagResourceDescription === 'object'
      ? tagResourceDescription.resource
      : tagResourceDescription || `Operations for ${name} resource`;

    spec.tags.push({
      name: name,
      description: tagDescription
    });

    spec.components.schemas[name] = generateResourceSchema(resource);

    if (relationsPlugin && relationsPlugin.relations && relationsPlugin.relations[name]) {
      const relationsDef = relationsPlugin.relations[name];

      for (const [relationName, relationConfig] of Object.entries(relationsDef)) {
        if (relationConfig.type === 'belongsTo') {
          continue;
        }

        const exposeRelation = resourceConfig?.relations?.[relationName]?.expose !== false;
        if (!exposeRelation) {
          continue;
        }

        const relatedResource = database.resources[relationConfig.resource];
        if (!relatedResource) {
          continue;
        }

        const relatedSchema = generateResourceSchema(relatedResource);

        const relationalPaths = generateRelationalPaths(
          resource,
          relationName,
          relationConfig,
          resourceVersion,
          relatedSchema,
          prefix,
          normalizedBasePath,
          resolveSecurityForPath
        );

        Object.assign(spec.paths, relationalPaths);
      }
    }

    const resourceCustomRoutes = gatherCustomRouteDefinitions([
      resource.config?.routes as Record<string, unknown> | undefined,
      resource.config?.api as Record<string, unknown> | undefined,
      resourceConfig?.routes as Record<string, unknown> | undefined
    ]);

    for (const routeDef of resourceCustomRoutes) {
      const relativePath = routeDef.path === '/' ? '' : routeDef.path;
      const fullPath = relativePath
        ? `${resourceBaseMountPath}${relativePath}`
        : resourceBaseMountPath;

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

  const pluginCustomRoutesDefined = gatherCustomRouteDefinitions([pluginRoutes as Record<string, unknown>]);
  for (const routeDef of pluginCustomRoutesDefined) {
    const fullPath = applyBasePath(normalizedBasePath, routeDef.path);
    registerCustomRouteOperation({
      fullPath,
      method: routeDef.method,
      originalKey: routeDef.originalKey,
      scope: 'at plugin level',
      tags: [CUSTOM_ROUTES_TAG],
      basePrefix: normalizedBasePath,
      versionPrefix: typeof globalVersionPrefix === 'string' ? globalVersionPrefix : ''
    });
  }

  if (app && typeof app.getRoutes === 'function') {
    const appRoutes = app.getRoutes();

    for (const route of appRoutes) {
      if (!route.path || !route.method) continue;

      const fullPath = applyBasePath(normalizedBasePath, route.path);
      const openApiPath = convertPathToOpenAPI(fullPath);
      const methodLower = route.method.toLowerCase() as keyof OpenAPIPathItem;

      const opKey = `${route.method.toUpperCase()} ${openApiPath}`;
      if (documentedCustomRouteOperations.has(opKey)) {
        continue;
      }

      if (!spec.paths[openApiPath]) {
        spec.paths[openApiPath] = {};
      }

      const operation: OpenAPIOperation = {
        summary: route.description || `${route.method.toUpperCase()} ${route.path}`,
        operationId: route.operationId || `${methodLower}_${route.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
        tags: route.tags || [CUSTOM_ROUTES_TAG],
        responses: {}
      };

      if (route.description && route.summary && route.description !== route.summary) {
        operation.summary = route.summary;
        operation.description = route.description;
      }

      if (route.responseSchema) {
        operation.responses = {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: route.responseSchema
              }
            }
          }
        };
      } else {
        operation.responses = {
          '200': {
            description: 'Successful response'
          }
        };
      }

      if (route.requestSchema) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: route.requestSchema
            }
          }
        };
      }

      const pathSecurity = resolveSecurityForPath(fullPath);
      if (pathSecurity) {
        operation.security = pathSecurity;
      }

      if (route.tags) {
        for (const tag of route.tags) {
          if (!spec.tags.some(t => t.name === tag)) {
            spec.tags.push({
              name: tag,
              description: `Routes for ${tag}`
            });
          }
        }
      }

      (spec.paths[openApiPath] as Record<string, OpenAPIOperation>)[methodLower] = operation;
      documentedCustomRouteOperations.add(opKey);
      customRoutesUsed = true;
    }
  }

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

  const metricsPlugin = database.pluginRegistry?.metrics || database.pluginRegistry?.MetricsPlugin;
  if (metricsPlugin && metricsPlugin.config?.prometheus?.enabled) {
    const metricsPath = metricsPlugin.config.prometheus.path || '/metrics';
    const isIntegrated = metricsPlugin.config.prometheus.mode !== 'standalone';

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
