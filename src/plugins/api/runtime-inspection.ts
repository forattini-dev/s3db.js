import {
  buildRuntimeContractTestSuite,
  buildRuntimeInspectionDoctorReport,
  normalizeSchemaDescriptor,
  type RuntimeContractTestSuite,
  type RuntimeInspectionDiagnostic,
  type RuntimeInspectionDoctorReport,
  type RuntimeInspectionGraph,
  type RuntimeInspectionSource,
  type RuntimeInspectionSourceKind,
  type RuntimeInspectionTransportBinding,
  type SchemaDescriptor
} from 'raffel';
import type {
  OpenAPIOperation,
  OpenAPIPathItem,
  OpenAPISpec
} from './utils/openapi-generator.js';
import type { ApiRouteRegistryEntry } from './route-registry.js';

export interface ApiRuntimeInspectionPreview {
  graph: RuntimeInspectionGraph;
  routes: ApiRouteRegistryEntry[];
  summary: {
    routes: number;
    operations: number;
    diagnostics: number;
  };
}

function normalizePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function toRuntimePath(path: string): string {
  return path.replace(/{([^}]+)}/g, ':$1');
}

function buildRegistryLookup(routes: ApiRouteRegistryEntry[]): Map<string, ApiRouteRegistryEntry> {
  const lookup = new Map<string, ApiRouteRegistryEntry>();

  for (const entry of routes) {
    for (const method of entry.methods || []) {
      lookup.set(`${method.toUpperCase()} ${normalizePath(entry.path)}`, entry);
    }
  }

  return lookup;
}

function buildConfig(host: string, port: number, basePath: string): RuntimeInspectionGraph['config'] {
  const resolvedHost = host === '0.0.0.0' ? 'localhost' : host;

  return {
    entrypoint: {
      host: resolvedHost,
      port,
      source: 'native'
    },
    protocolFusion: {
      enabled: false,
      mode: 'disabled',
      entrypoint: 'http'
    },
    frontDoor: {
      enabled: false,
      host: resolvedHost,
      port,
      protocols: null,
      protocolAliasMode: 'standard'
    },
    sharedPort: {
      enabled: false,
      protocolFusion: false,
      protocolAliasMode: 'standard',
      sniffMaxBytes: 0,
      sniffTimeoutMs: 0,
      maxConcurrentDetections: 0
    },
    singlePort: {
      enabled: false,
      protocolFusion: false,
      protocolAliasMode: 'standard',
      sniffMaxBytes: 0,
      sniffTimeoutMs: 0,
      maxConcurrentDetections: 0
    },
    protocols: {
      http: {
        enabled: true,
        shared: true,
        source: 'native'
      }
    },
    warnings: basePath ? [`HTTP basePath configured at ${basePath}`] : []
  };
}

function firstJsonSchema(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== 'object') {
    return null;
  }

  const jsonSchema = (content as Record<string, { schema?: Record<string, unknown> }> )['application/json']?.schema;
  if (jsonSchema && typeof jsonSchema === 'object') {
    return jsonSchema;
  }

  const textSchema = (content as Record<string, { schema?: Record<string, unknown> }> )['text/plain']?.schema;
  if (textSchema && typeof textSchema === 'object') {
    return textSchema;
  }

  return null;
}

function isPlaceholderSchema(schema: Record<string, unknown> | null): boolean {
  return !!schema && schema['x-s3db-schema-placeholder'] === true;
}

function normalizeDescriptor(schema: Record<string, unknown> | null): SchemaDescriptor | null {
  if (!schema || isPlaceholderSchema(schema)) {
    return null;
  }

  return normalizeSchemaDescriptor(schema, { target: 'openApi3' });
}

function getInputDescriptor(operation: OpenAPIOperation): SchemaDescriptor | null {
  const schema = firstJsonSchema(operation.requestBody?.content);
  return normalizeDescriptor(schema);
}

function getOutputDescriptor(operation: OpenAPIOperation): SchemaDescriptor | null {
  const response = Object.entries(operation.responses)
    .filter(([status]) => status.startsWith('2'))
    .sort(([left], [right]) => left.localeCompare(right))[0]?.[1];

  const schema = firstJsonSchema(response?.content);
  return normalizeDescriptor(schema);
}

function inferSourceFromTags(tags: string[]): RuntimeInspectionSourceKind {
  const firstTag = tags[0] || '';

  if (firstTag === 'Authentication') return 'programmatic';
  if (firstTag === 'Health') return 'programmatic';
  if (firstTag === 'Documentation') return 'programmatic';
  if (firstTag === 'Monitoring' || firstTag === 'Metrics') return 'programmatic';
  if (firstTag === 'System') return 'programmatic';
  if (firstTag === 'Static Files') return 'programmatic';

  return 'rest-resource';
}

function resolveSource(
  operationId: string,
  path: string,
  tags: string[],
  registryEntry: ApiRouteRegistryEntry | undefined
): RuntimeInspectionSource {
  if (registryEntry) {
    return {
      kind: registryEntry.sourceKind || 'programmatic',
      location: registryEntry.sourceLocation || registryEntry.originalKey || registryEntry.path || operationId
    };
  }

  return {
    kind: inferSourceFromTags(tags),
    location: path
  };
}

function sanitizeOperationTag(tag: string): string {
  return tag
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'operation';
}

function deriveOperationId(method: string, path: string, tags: string[], explicit?: string): string {
  if (explicit) {
    return explicit;
  }

  const primaryTag = sanitizeOperationTag(tags[0] || 'http');
  const normalizedPath = path.replace(/\/{[^}]+}/g, '/:id');

  if (method === 'POST' && !normalizedPath.includes('/:id') && !normalizedPath.includes('/_')) {
    return `create_${primaryTag}`;
  }

  if (method === 'GET' && !normalizedPath.includes('/:id') && !normalizedPath.includes('/_')) {
    return `list_${primaryTag}`;
  }

  if (method === 'GET' && normalizedPath.endsWith('/:id')) {
    return `get_${primaryTag}`;
  }

  if (method === 'PUT' && normalizedPath.endsWith('/:id')) {
    return `update_${primaryTag}`;
  }

  if (method === 'PATCH' && normalizedPath.endsWith('/:id')) {
    return `patch_${primaryTag}`;
  }

  if (method === 'DELETE' && normalizedPath.endsWith('/:id')) {
    return `delete_${primaryTag}`;
  }

  if (method === 'GET' && normalizedPath.includes('/_stats')) {
    return `stats_${primaryTag}`;
  }

  if (method === 'GET' && normalizedPath.includes('/_metadata')) {
    return `metadata_${primaryTag}`;
  }

  if (method === 'GET' && normalizedPath.includes('/_methods')) {
    return `methods_${primaryTag}`;
  }

  if (method === 'GET' && normalizedPath.includes('/_exists')) {
    return `exists_${primaryTag}`;
  }

  return `${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function resolveSecurity(
  operation: OpenAPIOperation,
  registryEntry: ApiRouteRegistryEntry | undefined
): RuntimeInspectionGraph['operations'][number]['policies'] {
  if (registryEntry?.auth?.required) {
    return {
      effective: {
        auth: {
          mode: registryEntry.auth.mode || 'required',
          ...(registryEntry.auth.drivers?.[0] ? { scheme: registryEntry.auth.drivers[0] } : {}),
          ...(registryEntry.auth.roles?.length ? { roles: registryEntry.auth.roles.slice() } : {}),
          ...(registryEntry.auth.scopes?.length ? { scopes: registryEntry.auth.scopes.slice() } : {})
        }
      }
    };
  }

  const schemes = Array.isArray(operation.security)
    ? operation.security.flatMap((item) => Object.keys(item))
    : [];

  if (schemes.length === 0) {
    return {};
  }

  return {
    effective: {
      auth: {
        mode: 'required',
        scheme: schemes[0]
      }
    }
  };
}

function createBinding(method: string, path: string): RuntimeInspectionTransportBinding {
  return {
    id: `http:${method.toUpperCase()}:${path}`,
    protocol: 'http',
    mode: 'rest',
    method: method.toUpperCase(),
    path: toRuntimePath(path),
    shared: true,
    source: 'native'
  };
}

function addDescriptorDiagnostics(
  diagnostics: RuntimeInspectionDiagnostic[],
  descriptor: SchemaDescriptor | null,
  operationId: string,
  field: 'input' | 'output'
): void {
  for (const diagnostic of descriptor?.diagnostics || []) {
    diagnostics.push({
      code: `SCHEMA_${field.toUpperCase()}_${diagnostic.code}`,
      severity: 'warning',
      message: diagnostic.message,
      subject: {
        kind: 'operation',
        id: operationId
      },
      remediation: `Review the ${field} schema descriptor for this route.`,
      data: {
        field,
        source: descriptor?.source
      }
    });
  }
}

function addOperationDiagnostics(
  diagnostics: RuntimeInspectionDiagnostic[],
  operationId: string,
  binding: RuntimeInspectionTransportBinding,
  inputDescriptor: SchemaDescriptor | null,
  tags: string[]
): void {
  const writeMethod = binding.method === 'POST' || binding.method === 'PUT' || binding.method === 'PATCH';
  const excludedTags = new Set(['Authentication', 'Health', 'Documentation', 'Monitoring', 'Metrics', 'System']);

  if (writeMethod && !inputDescriptor && !tags.some((tag) => excludedTags.has(tag))) {
    diagnostics.push({
      code: 'MISSING_INPUT_SCHEMA',
      severity: 'warning',
      message: `Route ${binding.method} ${binding.path} does not expose a concrete input schema for generated checks.`,
      subject: {
        kind: 'operation',
        id: operationId
      },
      remediation: 'Provide a concrete request schema instead of a placeholder or opaque handler contract.'
    });
  }
}

function listOperations(pathItem: OpenAPIPathItem): Array<[string, OpenAPIOperation]> {
  const entries = Object.entries(pathItem as Record<string, OpenAPIOperation | undefined>);
  return entries.filter(([method, operation]) => {
    return ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method) && !!operation;
  }) as Array<[string, OpenAPIOperation]>;
}

export function buildApiRuntimeInspectionPreview({
  spec,
  routes,
  host,
  port,
  basePath = ''
}: {
  spec: OpenAPISpec;
  routes: ApiRouteRegistryEntry[];
  host: string;
  port: number;
  basePath?: string;
}): ApiRuntimeInspectionPreview {
  const routeLookup = buildRegistryLookup(routes);
  const diagnostics: RuntimeInspectionDiagnostic[] = [];
  const operations: RuntimeInspectionGraph['operations'] = [];

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const [method, operation] of listOperations(pathItem)) {
      const tags = Array.isArray(operation.tags) ? operation.tags.slice() : ['HTTP'];
      const operationId = deriveOperationId(method.toUpperCase(), path, tags, operation.operationId);
      const binding = createBinding(method, path);
      const registryEntry = routeLookup.get(`${method.toUpperCase()} ${path}`);
      const inputDescriptor = registryEntry?.schema?.input || getInputDescriptor(operation);
      const outputDescriptor = registryEntry?.schema?.output || getOutputDescriptor(operation);

      addDescriptorDiagnostics(diagnostics, inputDescriptor, operationId, 'input');
      addDescriptorDiagnostics(diagnostics, outputDescriptor, operationId, 'output');
      addOperationDiagnostics(diagnostics, operationId, binding, inputDescriptor, tags);

      operations.push({
        id: operationId,
        name: operation.summary || operationId,
        service: tags[0] || 'HTTP',
        kind: 'procedure',
        summary: operation.summary,
        description: operation.description,
        tags,
        source: resolveSource(operationId, path, tags, registryEntry),
        schema: {
          input: inputDescriptor
            ? { present: true, descriptor: inputDescriptor }
            : { present: false },
          output: outputDescriptor
            ? { present: true, descriptor: outputDescriptor }
            : { present: false }
        },
        policies: resolveSecurity(operation, registryEntry),
        transports: [binding]
      });
    }
  }

  const services = Array.from(new Set(operations.map((operation) => operation.service))).map((service) => ({
    id: service,
    name: service,
    operationIds: operations
      .filter((operation) => operation.service === service)
      .map((operation) => operation.id)
  }));

  const graph: RuntimeInspectionGraph = {
    version: 1,
    generatedAt: new Date().toISOString(),
    config: buildConfig(host, port, basePath),
    services,
    operations,
    channels: [],
    transportHandlers: [],
    transports: [{
      id: 'http',
      protocol: 'http',
      enabled: true,
      host: host === '0.0.0.0' ? 'localhost' : host,
      port,
      path: basePath || '/',
      shared: true,
      source: 'native'
    }],
    diagnostics
  };

  return {
    graph,
    routes,
    summary: {
      routes: routes.length,
      operations: operations.length,
      diagnostics: diagnostics.length
    }
  };
}

export function buildApiRuntimeDoctorReport(preview: ApiRuntimeInspectionPreview): RuntimeInspectionDoctorReport {
  return buildRuntimeInspectionDoctorReport(preview.graph);
}

export function buildApiRuntimeContractTests(preview: ApiRuntimeInspectionPreview): RuntimeContractTestSuite {
  return buildRuntimeContractTestSuite(preview.graph);
}
