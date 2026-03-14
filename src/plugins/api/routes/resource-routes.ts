import type { Context, HttpApp as HttpAppType, MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';
import type { ContentfulStatusCode } from '#src/plugins/shared/http-runtime.js';
import type { HttpMethod } from 'raffel/http';
import { asyncHandler } from '../utils/error-handler.js';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger } from '../../../concerns/logger.js';
import * as formatter from '../utils/response-formatter.js';
import { guardMiddleware } from '../utils/guards.js';
import type { GuardsConfig } from '../utils/guards.js';
import { createRouteContext } from '../concerns/route-context.js';
import { applyResponsePolicy, resolveRequestedView, resolveWritePolicy } from '../utils/resource-policy.js';
import { generateRecordETag, validateIfMatch, validateIfNoneMatch } from '../utils/etag.js';
import { getResourceCustomRoutes } from '../utils/resource-custom-routes.js';
import { decodeRequestParam } from '../utils/request-params.js';
import { ValidationError } from '../../../errors.js';
import { createHash } from 'node:crypto';

const logger: Logger = createLogger({ name: 'ResourceRoutes', level: 'info' });

export interface ResourceLike {
  name: string;
  version?: string;
  attributes?: Record<string, unknown>;
  config?: {
    currentVersion?: string;
    attributes?: Record<string, unknown>;
    partitions?: Record<string, unknown>;
    api?: Record<string, unknown>;
    [key: string]: unknown;
  };
  schema?: {
    attributes?: Record<string, unknown>;
    [key: string]: unknown;
  };
  $schema?: {
    api?: {
      guard?: GuardsConfig;
      protected?: string[];
      description?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  _relations?: Record<string, RelationDefinition>;
  database?: DatabaseLike;
  list(options?: { limit?: number; offset?: number }): Promise<Record<string, unknown>[]>;
  listPartition(options: unknown): Promise<Record<string, unknown>[]>;
  query(filters: Record<string, unknown>, options?: { limit?: number; offset?: number }): Promise<Record<string, unknown>[]>;
  page?(options?: {
    size?: number;
    page?: number;
    cursor?: string | null;
    partition?: string | null;
    partitionValues?: Record<string, unknown>;
    skipCount?: boolean;
  }): Promise<{
    items: Record<string, unknown>[];
    totalItems?: number | null;
    page?: number;
    pageSize?: number;
    totalPages?: number | null;
    hasMore?: boolean;
    nextCursor?: string | null;
  }>;
  get(id: string, options?: { include?: string[] }): Promise<Record<string, unknown> | null>;
  getFromPartition(options: { id: string; partitionName: string; partitionValues: unknown }): Promise<Record<string, unknown> | null>;
  insert(data: Record<string, unknown>, options?: { user?: unknown; request?: unknown }): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>, options?: { user?: unknown; request?: unknown }): Promise<Record<string, unknown>>;
  patch(id: string, data: Record<string, unknown>, options?: {
    user?: unknown;
    request?: unknown;
    partition?: string;
    partitionValues?: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  delete(id: string): Promise<void>;
  count(options?: { partition?: string | null; partitionValues?: Record<string, unknown> }): Promise<number>;
  applyPartitionRule?(value: unknown, rule: string): string;
}

export interface DatabaseLike {
  resources?: Record<string, ResourceLike>;
  logger?: Logger;
}

export interface RelationDefinition {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
  resource: string;
  foreignKey?: string;
  [key: string]: unknown;
}

export interface RelationsPluginLike {
  relations?: Record<string, Record<string, RelationDefinition>>;
  database?: DatabaseLike;
  populate(resource: ResourceLike, items: Record<string, unknown> | Record<string, unknown>[], includes: Record<string, unknown>): Promise<void>;
}

export interface EventsEmitter {
  emitResourceEvent(event: string, data: Record<string, unknown>): void;
}

export interface ResourceRoutesConfig {
  methods?: string[];
  customMiddleware?: MiddlewareHandler[];
  versionPrefix?: string;
  events?: EventsEmitter | null;
  relationsPlugin?: RelationsPluginLike | null;
  globalGuards?: GuardsConfig | null;
  logLevel?: string;
}

interface PopulateResult {
  includes?: Record<string, unknown> | null;
  errors?: string[];
}

type IncludesTree = Record<string, boolean | IncludesNode>;

interface IncludesNode {
  include: IncludesTree;
}

interface PartitionCandidate {
  partition: string;
  partitionValues: Record<string, unknown>;
  remainingFilters: Record<string, unknown>;
  fieldCount: number;
}

interface PartitionResolution {
  partition: string | null;
  partitionValues: Record<string, unknown> | undefined;
  remainingFilters: Record<string, unknown>;
  error?: {
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
  };
}

interface ApiFilterCursorPayload {
  v: 1;
  type: 'api-filter';
  cursor: string | null;
  pageSize: number;
  filtersHash: string;
  partitionSignature: string;
  apiVersion?: string;
}

interface RelationListCursorPayload {
  v: 1;
  type: 'relation-list';
  index: number;
  pageSize: number;
}

type BulkCreateMode = 'partial' | 'all-or-nothing';

interface BulkCreateRouteConfig {
  enabled?: boolean;
  path?: string;
  maxItems?: number;
  mode?: BulkCreateMode;
}

interface NormalizedBulkCreateRouteConfig {
  path: string;
  maxItems: number;
  mode: BulkCreateMode;
}

interface BulkCreateItemError {
  index: number;
  code: string;
  message: string;
  status: number;
  details: Record<string, unknown>;
}

function parsePopulateValues(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];

  const values = Array.isArray(raw) ? raw : [raw];

  return values
    .flatMap(value => String(value).split(','))
    .map(value => value.trim())
    .filter(Boolean);
}

function getDecodedRouteId(c: Context): string | undefined {
  return decodeRequestParam(c.req.param('id'));
}

function parsePartitionValues(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;

  const value = typeof raw === 'string'
    ? (() => {
      try {
        return JSON.parse(raw);
      } catch {
        throw new ValidationError('Invalid partitionValues parameter', {
          field: 'partitionValues',
          statusCode: 400,
          suggestion: 'Pass partitionValues as a JSON object, e.g. {"country":"BR"}'
        });
      }
    })()
    : raw;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Invalid partitionValues parameter', {
      field: 'partitionValues',
      statusCode: 400,
      suggestion: 'partitionValues must be an object'
    });
  }

  return value as Record<string, unknown>;
}

function parseQueryFilterValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getPartitionFieldRules(resource: ResourceLike, partitionName: string): Record<string, string> {
  const partitions = resource.config?.partitions || {};
  const partitionDef = partitions[partitionName] as { fields?: Record<string, unknown> } | undefined;
  if (!partitionDef?.fields || typeof partitionDef.fields !== 'object' || Array.isArray(partitionDef.fields)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [field, rule] of Object.entries(partitionDef.fields)) {
    if (typeof rule === 'string') {
      result[field] = rule;
    }
  }
  return result;
}

function listPartitionNames(resource: ResourceLike): string[] {
  return Object.keys(resource.config?.partitions || {});
}

function getResourceAttributes(resource: ResourceLike): Record<string, unknown> {
  return resource.attributes || resource.config?.attributes || resource.schema?.attributes || {};
}

function normalizePartitionFieldValue(resource: ResourceLike, value: unknown, rule: string): unknown {
  if (typeof resource.applyPartitionRule !== 'function') {
    return value;
  }

  try {
    return resource.applyPartitionRule(value, rule);
  } catch {
    return value;
  }
}

function resolvePartitionFromFilters(
  resource: ResourceLike,
  queryFilters: Record<string, unknown>,
  explicitPartition: string | null,
  explicitPartitionValues: Record<string, unknown> | undefined
): PartitionResolution {
  const partitions = listPartitionNames(resource);

  if (explicitPartitionValues && !explicitPartition) {
    return {
      partition: null,
      partitionValues: undefined,
      remainingFilters: queryFilters,
      error: {
        message: 'partitionValues requires partition parameter',
        details: { partitionValues: explicitPartitionValues },
        suggestion: 'Provide both ?partition=<name> and ?partitionValues=<json>, or only partition field filters.'
      }
    };
  }

  if (explicitPartition) {
    if (!partitions.includes(explicitPartition)) {
      return {
        partition: null,
        partitionValues: undefined,
        remainingFilters: queryFilters,
        error: {
          message: 'Invalid partition parameter',
          details: {
            partition: explicitPartition,
            availablePartitions: partitions
          },
          suggestion: 'Use one of the available partitions or omit partition to allow auto-resolution from query filters.'
        }
      };
    }

    const rules = getPartitionFieldRules(resource, explicitPartition);
    const fields = Object.keys(rules);
    if (explicitPartitionValues) {
      const remaining = { ...queryFilters };
      for (const field of fields) {
        delete remaining[field];
      }

      return {
        partition: explicitPartition,
        partitionValues: explicitPartitionValues,
        remainingFilters: remaining
      };
    }

    const missing = fields.filter((field) => !Object.prototype.hasOwnProperty.call(queryFilters, field));
    if (missing.length > 0) {
      return {
        partition: null,
        partitionValues: undefined,
        remainingFilters: queryFilters,
        error: {
          message: 'Missing partition fields for automatic partitionValues',
          details: {
            partition: explicitPartition,
            missingFields: missing,
            requiredFields: fields
          },
          suggestion: 'Provide all partition fields in query string or send partitionValues explicitly.'
        }
      };
    }

    const derivedValues: Record<string, unknown> = {};
    for (const field of fields) {
      derivedValues[field] = normalizePartitionFieldValue(resource, queryFilters[field], rules[field]!);
    }

    const remaining = { ...queryFilters };
    for (const field of fields) {
      delete remaining[field];
    }

    return {
      partition: explicitPartition,
      partitionValues: derivedValues,
      remainingFilters: remaining
    };
  }

  if (Object.keys(queryFilters).length === 0 || partitions.length === 0) {
    return {
      partition: null,
      partitionValues: undefined,
      remainingFilters: queryFilters
    };
  }

  const candidates: PartitionCandidate[] = [];
  for (const partition of partitions) {
    const rules = getPartitionFieldRules(resource, partition);
    const fields = Object.keys(rules);
    if (fields.length === 0) continue;

    const hasAllFields = fields.every((field) => Object.prototype.hasOwnProperty.call(queryFilters, field));
    if (!hasAllFields) continue;

    const values: Record<string, unknown> = {};
    for (const field of fields) {
      values[field] = normalizePartitionFieldValue(resource, queryFilters[field], rules[field]!);
    }

    const remaining = { ...queryFilters };
    for (const field of fields) {
      delete remaining[field];
    }

    candidates.push({
      partition,
      partitionValues: values,
      remainingFilters: remaining,
      fieldCount: fields.length
    });
  }

  if (candidates.length === 0) {
    return {
      partition: null,
      partitionValues: undefined,
      remainingFilters: queryFilters
    };
  }

  const exactCandidates = candidates.filter((candidate) => Object.keys(candidate.remainingFilters).length === 0);
  if (exactCandidates.length > 1) {
    return {
      partition: null,
      partitionValues: undefined,
      remainingFilters: queryFilters,
      error: {
        message: 'Ambiguous partition filters',
        details: {
          matchingPartitions: exactCandidates.map((candidate) => candidate.partition),
          providedFilters: Object.keys(queryFilters)
        },
        suggestion: 'Specify ?partition=<name> explicitly when multiple partitions match the same query fields.'
      }
    };
  }

  const chosen = (exactCandidates[0] || candidates.sort((a, b) => b.fieldCount - a.fieldCount)[0])!;
  return {
    partition: chosen.partition,
    partitionValues: chosen.partitionValues,
    remainingFilters: chosen.remainingFilters
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashStableValue(value: unknown): string {
  return createHash('sha256')
    .update(stableSerialize(value))
    .digest('hex');
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function readPathValue(source: unknown, path: string): unknown {
  const segments = String(path || '')
    .split('.')
    .map(segment => segment.trim())
    .filter(Boolean);

  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function matchesQueryFilters(item: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  for (const [field, expectedValue] of Object.entries(filters)) {
    const actualValue = readPathValue(item, field);
    if (!valuesEqual(actualValue, expectedValue)) {
      return false;
    }
  }
  return true;
}

function encodeSimpleCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeSimpleCursor<T extends Record<string, unknown>>(cursor: string): T | null {
  try {
    const normalized = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded) as T;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function decodeApiFilterCursor(cursor: string): ApiFilterCursorPayload | null {
  const parsed = decodeSimpleCursor<Record<string, unknown>>(cursor);
  if (!parsed) return null;
  if (parsed.v !== 1) return null;
  if (parsed.type !== 'api-filter') return null;

  const cursorValue = parsed.cursor;
  const pageSize = parsed.pageSize;
  const filtersHash = parsed.filtersHash;
  const partitionSignature = parsed.partitionSignature;

  if (cursorValue !== null && typeof cursorValue !== 'string') return null;
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize) || pageSize <= 0) return null;
  if (typeof filtersHash !== 'string' || filtersHash.length === 0) return null;
  if (typeof partitionSignature !== 'string' || partitionSignature.length === 0) return null;

  const apiVersion = parsed.apiVersion;
  if (apiVersion !== undefined && typeof apiVersion !== 'string') return null;

  return {
    v: 1,
    type: 'api-filter',
    cursor: cursorValue,
    pageSize,
    filtersHash,
    partitionSignature,
    ...(apiVersion ? { apiVersion } : {})
  };
}

function decodeRelationListCursor(cursor: string): RelationListCursorPayload | null {
  const parsed = decodeSimpleCursor<Record<string, unknown>>(cursor);
  if (!parsed) return null;
  if (parsed.v !== 1) return null;
  if (parsed.type !== 'relation-list') return null;

  const index = parsed.index;
  const pageSize = parsed.pageSize;

  if (typeof index !== 'number' || !Number.isFinite(index) || index < 0) return null;
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize) || pageSize <= 0) return null;

  return {
    v: 1,
    type: 'relation-list',
    index: Math.floor(index),
    pageSize
  };
}

function addPopulatePath(tree: IncludesTree, parts: string[]): void {
  if (!parts.length) return;
  const [head, ...rest] = parts;
  if (!head) return;
  const existing = tree[head];

  if (rest.length === 0) {
    if (existing && typeof existing === 'object') {
      return;
    }
    tree[head] = true;
    return;
  }

  let node: IncludesNode;
  if (!existing || existing === true) {
    node = { include: {} };
    tree[head] = node;
  } else {
    node = existing as IncludesNode;
    if (!node.include || typeof node.include !== 'object') {
      node.include = {};
    }
  }

  addPopulatePath(node.include, rest);
}

function resolvePopulate(resource: ResourceLike, relationsPlugin: RelationsPluginLike | null, paths: string[]): PopulateResult {
  if (!relationsPlugin) {
    return {
      errors: ['RelationPlugin must be installed to use populate parameter']
    };
  }

  const includesTree: IncludesTree = {};
  const errors: string[] = [];

  for (const rawPath of paths) {
    const segments = rawPath.split('.').map(segment => segment.trim()).filter(Boolean);
    if (segments.length === 0) continue;

    let currentResource: ResourceLike | undefined = resource;
    let isValid = true;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (!segment) continue;
      const resourceName = currentResource?.name || '';
      const relationDefs: Record<string, RelationDefinition> | null | undefined =
        currentResource?._relations ||
        relationsPlugin.relations?.[resourceName] ||
        null;

      if (!relationDefs || !relationDefs[segment]) {
        errors.push(
          `Relation "${segment}" is not defined on resource "${resourceName || 'unknown'}" (path "${rawPath}")`
        );
        isValid = false;
        break;
      }

      const relationConfig: RelationDefinition = relationDefs[segment];

      if (index < segments.length - 1) {
        const relatedResource: ResourceLike | undefined = relationsPlugin.database?.resources?.[relationConfig.resource];
        if (!relatedResource) {
          errors.push(
            `Related resource "${relationConfig.resource}" for relation "${segment}" not found (path "${rawPath}")`
          );
          isValid = false;
          break;
        }
        currentResource = relatedResource;
      }
    }

    if (isValid) {
      addPopulatePath(includesTree, segments);
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    includes: Object.keys(includesTree).length > 0 ? includesTree : null
  };
}

function normalizeBulkCreateConfig(apiConfig: Record<string, unknown>): NormalizedBulkCreateRouteConfig | null {
  const defaults: NormalizedBulkCreateRouteConfig = {
    path: '/bulk',
    maxItems: 100,
    mode: 'partial'
  };

  const bulkConfig = apiConfig.bulk;

  if (!bulkConfig || typeof bulkConfig !== 'object' || Array.isArray(bulkConfig)) {
    if ((bulkConfig as unknown) === false) {
      return null;
    }
    return defaults;
  }

  const createConfig = (bulkConfig as { create?: boolean | BulkCreateRouteConfig; enabled?: boolean }).create;

  if ((bulkConfig as { enabled?: boolean }).enabled === false) {
    return null;
  }

  if (!createConfig || createConfig === true) {
    return defaults;
  }

  if (typeof createConfig !== 'object' || Array.isArray(createConfig)) {
    return defaults;
  }

  if (createConfig.enabled === false) {
    return null;
  }

  const normalizedPath = typeof createConfig.path === 'string' && createConfig.path.trim().length > 0
    ? createConfig.path.trim()
    : defaults.path;
  const path = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  const rawMaxItems = typeof createConfig.maxItems === 'number'
    ? createConfig.maxItems
    : Number.parseInt(String(createConfig.maxItems ?? defaults.maxItems), 10);
  const maxItems = Number.isFinite(rawMaxItems) && rawMaxItems > 0
    ? Math.min(Math.trunc(rawMaxItems), 1000)
    : defaults.maxItems;

  const mode = createConfig.mode === 'all-or-nothing'
    ? 'all-or-nothing'
    : defaults.mode;

  return {
    path,
    maxItems,
    mode
  };
}

function normalizeBulkCreateItems(
  payload: unknown,
  maxItems: number
): { ok: true; items: Record<string, unknown>[] } | { ok: false; message: string; code: string; details: Record<string, unknown> } {
  const items = Array.isArray(payload)
    ? payload
    : (
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        Array.isArray((payload as { items?: unknown[] }).items)
      )
        ? (payload as { items: unknown[] }).items
        : null;

  if (!items) {
    return {
      ok: false,
      message: 'Invalid bulk create payload',
      code: 'INVALID_BULK_PAYLOAD',
      details: {
        suggestion: 'Send a JSON array or an object shaped like { "items": [ ... ] }.'
      }
    };
  }

  if (items.length === 0) {
    return {
      ok: false,
      message: 'Bulk create payload must include at least one item',
      code: 'INVALID_BULK_PAYLOAD',
      details: {
        suggestion: 'Provide one or more objects inside the bulk request.'
      }
    };
  }

  if (items.length > maxItems) {
    return {
      ok: false,
      message: 'Bulk create payload exceeds the configured limit',
      code: 'BULK_LIMIT_EXCEEDED',
      details: {
        maxItems,
        receivedItems: items.length
      }
    };
  }

  const invalidItems: number[] = [];
  const normalizedItems: Record<string, unknown>[] = [];

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      invalidItems.push(index);
      return;
    }

    normalizedItems.push(item as Record<string, unknown>);
  });

  if (invalidItems.length > 0) {
    return {
      ok: false,
      message: 'Bulk create payload items must be JSON objects',
      code: 'INVALID_BULK_PAYLOAD',
      details: {
        invalidItems
      }
    };
  }

  return {
    ok: true,
    items: normalizedItems
  };
}

function createBulkItemError(index: number, err: Error): BulkCreateItemError {
  const details: Record<string, unknown> = {};
  const maybeStatus = (err as Error & { statusCode?: number }).statusCode;
  const status = typeof maybeStatus === 'number' ? maybeStatus : 500;
  const maybeCode = (err as Error & { code?: string }).code;
  const code = typeof maybeCode === 'string' && maybeCode.trim().length > 0
    ? maybeCode
    : (err instanceof ValidationError ? 'VALIDATION_ERROR' : err.name || 'BULK_CREATE_ITEM_ERROR');

  if (err instanceof ValidationError) {
    if (err.field) details.field = err.field;
    if (err.constraint) details.constraint = err.constraint;
    if (err.suggestion) details.suggestion = err.suggestion;
  }

  if ((err as Error & { suggestion?: string }).suggestion && !details.suggestion) {
    details.suggestion = (err as Error & { suggestion?: string }).suggestion;
  }

  return {
    index,
    code,
    message: err.message,
    status,
    details
  };
}

interface HttpAppWithDescribe extends HttpAppType {
  describe?(meta: Record<string, unknown>): HttpAppWithDescribe;
}

async function getRequestBody(c: Context): Promise<Record<string, unknown>> {
  const transformed = c.get('transformedBody' as never) as Record<string, unknown> | undefined;
  if (transformed) return transformed;
  return await c.req.json() as Record<string, unknown>;
}

export function createResourceRoutes(resource: ResourceLike, _version: string, config: ResourceRoutesConfig = {}, HttpApp: new () => HttpAppType): HttpAppType {
  const app = new HttpApp() as HttpAppWithDescribe;

  if (!app.describe) {
    app.describe = function(meta: Record<string, unknown>) {
      return this;
    };
  }

  const {
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    customMiddleware = [],
    versionPrefix = '',
    events = null,
    relationsPlugin = null
  } = config;

  const resourceName = resource.name;
  const basePath = versionPrefix ? `/${versionPrefix}/${resourceName}` : `/${resourceName}`;

  const apiConfig = resource.$schema?.api || {};
  const guards = apiConfig.guard || null;
  const globalGuards = config.globalGuards || null;
  const guardOptions = {
    globalGuards,
    resource: resource as any
  };

  const protectedFields = apiConfig.protected || [];

  customMiddleware.forEach(middleware => {
    app.use('*', middleware);
  });

  const bulkCreateConfig = normalizeBulkCreateConfig(apiConfig);
  try {
    for (const route of getResourceCustomRoutes(resource.config?.api as Record<string, unknown> | undefined)) {
      app.on(route.method as HttpMethod | '*', route.path, asyncHandler(async (c: Context) => {
        const routeContext = createRouteContext(c, {
          database: resource.database as any,
          resource: resource as any,
          plugins: (resource.database as { pluginRegistry?: Record<string, unknown> } | undefined)?.pluginRegistry || {}
        });
        const result = await route.handler(c, routeContext);

        if (result && (result as Response).constructor && (result as Response).constructor.name === 'Response') {
          return result as Response;
        }

        if (result !== undefined && result !== null) {
          return c.json(formatter.success(result));
        }

        return c.json(formatter.noContent(), 204 as ContentfulStatusCode);
      }));

      if (config.logLevel || resource.database?.logger?.level === 'debug') {
        logger.info(`[API Plugin] Registered custom route for ${resourceName}: ${route.method} ${route.path}`);
      }
    }
  } catch (error) {
    logger.error({ err: error }, `[API Plugin] Error registering custom routes for ${resourceName}`);
    throw error;
  }

  if (methods.includes('GET')) {
    const listHandler = asyncHandler(async (c: Context) => {
      const query = c.req.query();
      const parsedLimit = parseInt(query.limit || '100', 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 1000)
        : 100;
      const hasCursorParam = Object.prototype.hasOwnProperty.call(query, 'cursor');
      const hasPageParam = Object.prototype.hasOwnProperty.call(query, 'page');
      const hasOffsetParam = Object.prototype.hasOwnProperty.call(query, 'offset');
      const hasSortParam = Object.prototype.hasOwnProperty.call(query, 'sort');
      const rawCursor = query.cursor;
      const cursor = typeof rawCursor === 'string' && rawCursor.trim().length > 0
        ? rawCursor.trim()
        : null;
      const parsedPage = parseInt(query.page || '1', 10);
      const page = Number.isFinite(parsedPage) && parsedPage > 0
        ? parsedPage
        : 1;
      const partition = query.partition;
      const partitionValues = parsePartitionValues(query.partitionValues);
      const explicitPartition = typeof partition === 'string' && partition.trim().length > 0
        ? partition
        : null;

      const populateValues = parsePopulateValues(query.populate);
      let populateIncludes: Record<string, unknown> | null = null;

      if (populateValues.length > 0) {
        const populateResult = resolvePopulate(resource, relationsPlugin, populateValues);
        if (populateResult.errors) {
          const response = formatter.error('Invalid populate parameter', {
            status: 400,
            code: 'INVALID_POPULATE',
            details: { errors: populateResult.errors.map(e => ({ field: 'populate', message: e })) }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }
        populateIncludes = populateResult.includes || null;
      }

      if (hasCursorParam && hasPageParam) {
        const response = formatter.error('Use either cursor token or page number, not both', {
          status: 400,
          code: 'INVALID_PAGINATION',
          details: {
            suggestion: 'Use ?page=N for page-based navigation or ?cursor=TOKEN for token-based continuation'
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (hasOffsetParam) {
        const response = formatter.error('Offset pagination is not supported', {
          status: 400,
          code: 'INVALID_PAGINATION',
          details: {
            offset: query.offset,
            suggestion: 'Use ?page=N for page-based navigation or ?cursor=TOKEN for token-based continuation'
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (hasPageParam && (!Number.isFinite(parsedPage) || parsedPage < 1)) {
        const response = formatter.error('Invalid page parameter', {
          status: 400,
          code: 'INVALID_PAGINATION',
          details: {
            page: query.page,
            suggestion: 'Use a page number greater than or equal to 1'
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const viewName = typeof query.view === 'string' ? query.view : null;
      const viewResolution = resolveRequestedView(apiConfig, viewName, c.get('user') as Record<string, unknown> | null | undefined);
      if (!viewResolution.ok) {
        const response = formatter.error(viewResolution.message, {
          status: viewResolution.status,
          code: viewResolution.code,
          details: viewResolution.details || {}
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const reservedKeys = ['limit', 'cursor', 'page', 'offset', 'partition', 'partitionValues', 'sort', 'populate', 'view'];
      const queryFilters: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(query)) {
        if (!reservedKeys.includes(key)) {
          queryFilters[key] = parseQueryFilterValue(value);
        }
      }

      const partitionResolution = resolvePartitionFromFilters(
        resource,
        queryFilters,
        explicitPartition,
        partitionValues
      );

      if (partitionResolution.error) {
        const response = formatter.error(partitionResolution.error.message, {
          status: 400,
          code: 'INVALID_PARTITION_FILTERS',
          details: {
            ...(partitionResolution.error.details || {}),
            suggestion: partitionResolution.error.suggestion
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const resolvedPartition = partitionResolution.partition;
      const resolvedPartitionValues = partitionResolution.partitionValues;
      const remainingFilters = partitionResolution.remainingFilters || {};
      const remainingFilterKeys = Object.keys(remainingFilters);

      const guardPartitionFilters = c.get('partitionFilters') as Array<{ partitionName: string; partitionFields: unknown }> | undefined || [];
      const primaryGuardFilter = guardPartitionFilters.length > 0 ? guardPartitionFilters[0] : null;

      let effectivePartition: string | null = resolvedPartition;
      let effectivePartitionValues: Record<string, unknown> | undefined = resolvedPartitionValues;
      let partitionMode: 'guard' | 'explicit' | 'auto' | null = null;

      if (primaryGuardFilter) {
        const guardValues = parsePartitionValues(primaryGuardFilter.partitionFields);
        if (!guardValues) {
          const response = formatter.error('Invalid partition guard configuration', {
            status: 500,
            code: 'INVALID_GUARD_PARTITION'
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        if (resolvedPartition && resolvedPartition !== primaryGuardFilter.partitionName) {
          const response = formatter.error('Query partition does not match guard partition', {
            status: 403,
            code: 'PARTITION_GUARD_CONFLICT',
            details: {
              guardPartition: primaryGuardFilter.partitionName,
              requestedPartition: resolvedPartition,
              suggestion: 'Remove explicit partition filters that conflict with access guard constraints.'
            }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        if (resolvedPartitionValues && guardValues && !valuesEqual(resolvedPartitionValues, guardValues)) {
          const response = formatter.error('Query partition values do not match guard constraints', {
            status: 403,
            code: 'PARTITION_GUARD_CONFLICT',
            details: {
              guardPartition: primaryGuardFilter.partitionName,
              suggestion: 'Remove explicit partitionValues or use values allowed by the active guard.'
            }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        effectivePartition = primaryGuardFilter.partitionName;
        effectivePartitionValues = guardValues;
        partitionMode = 'guard';
      } else if (resolvedPartition && resolvedPartitionValues) {
        effectivePartition = resolvedPartition;
        effectivePartitionValues = resolvedPartitionValues;
        partitionMode = explicitPartition ? 'explicit' : 'auto';
      }

      let items: Record<string, unknown>[];
      let nextCursor: string | null = null;
      let hasMore = false;

      if (hasSortParam) {
        const response = formatter.error('Cursor/page pagination does not support sort parameter', {
          status: 400,
          code: 'UNSUPPORTED_CURSOR_SORT',
          details: {
            suggestion: 'Remove sort parameter from this request.'
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (hasPageParam && remainingFilterKeys.length > 0) {
        const response = formatter.error('Page mode does not support additional query filters after partition resolution', {
          status: 400,
          code: 'UNSUPPORTED_PAGE_FILTERS',
          details: {
            unsupportedFilters: remainingFilterKeys,
            suggestion: 'Use cursor mode when combining partition filters with additional query filters.'
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (typeof resource.page !== 'function') {
        const response = formatter.error('Cursor pagination is not available for this resource', {
          status: 400,
          code: 'CURSOR_NOT_SUPPORTED'
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const filterCursorHashes = {
        filtersHash: hashStableValue(remainingFilters),
        partitionSignature: hashStableValue({
          partition: effectivePartition,
          partitionValues: effectivePartitionValues || null
        })
      };

      const cursorApiVersion = versionPrefix || undefined;

      let requestCursorForPage = hasCursorParam ? cursor : null;
      if (!hasPageParam && requestCursorForPage) {
        const decodedFilterCursor = decodeApiFilterCursor(requestCursorForPage);
        if (decodedFilterCursor) {
          if (decodedFilterCursor.apiVersion !== cursorApiVersion) {
            const response = formatter.error('Cursor was generated for a different API version', {
              status: 400,
              code: 'INVALID_CURSOR',
              details: {
                cursorVersion: decodedFilterCursor.apiVersion || 'current',
                requestVersion: cursorApiVersion || 'current',
                suggestion: 'Restart pagination without cursor when switching API versions.'
              }
            });
            return c.json(response, response._status as ContentfulStatusCode);
          }

          if (decodedFilterCursor.pageSize !== limit) {
            const response = formatter.error('Cursor pageSize does not match current limit', {
              status: 400,
              code: 'INVALID_CURSOR',
              details: {
                cursorPageSize: decodedFilterCursor.pageSize,
                requestedLimit: limit,
                suggestion: 'Reuse the same limit value used when this cursor was generated.'
              }
            });
            return c.json(response, response._status as ContentfulStatusCode);
          }

          if (decodedFilterCursor.filtersHash !== filterCursorHashes.filtersHash ||
              decodedFilterCursor.partitionSignature !== filterCursorHashes.partitionSignature) {
            const response = formatter.error('Cursor does not match current filters/partition scope', {
              status: 400,
              code: 'INVALID_CURSOR',
              details: {
                suggestion: 'Restart pagination without cursor after changing filters, partition, or guard scope.'
              }
            });
            return c.json(response, response._status as ContentfulStatusCode);
          }

          requestCursorForPage = decodedFilterCursor.cursor;
        }
      }

      if (remainingFilterKeys.length > 0) {
        const effectiveFilterLimit = limit;
        const collected: Record<string, unknown>[] = [];
        let scanCursor: string | null = requestCursorForPage;
        let safetyCounter = 0;

        while (collected.length < effectiveFilterLimit) {
          const pageResult = await resource.page!({
            size: effectiveFilterLimit,
            cursor: scanCursor,
            ...(effectivePartition && effectivePartitionValues
              ? {
                  partition: effectivePartition,
                  partitionValues: effectivePartitionValues
                }
              : {}),
            skipCount: true
          });

          const pageItems = pageResult.items || [];
          if (pageItems.length > 0) {
            const matched = pageItems.filter(item => matchesQueryFilters(item, remainingFilters));
            if (matched.length > 0) {
              collected.push(...matched);
            }
          }

          scanCursor = pageResult.nextCursor ?? null;
          if (!scanCursor) {
            break;
          }

          if (pageItems.length === 0) {
            break;
          }

          safetyCounter += 1;
          if (safetyCounter > 1024) {
            break;
          }
        }

        items = collected.slice(0, effectiveFilterLimit);
        hasMore = Boolean(scanCursor);
        nextCursor = scanCursor
          ? encodeSimpleCursor({
              v: 1,
              type: 'api-filter',
              cursor: scanCursor,
              pageSize: effectiveFilterLimit,
              filtersHash: filterCursorHashes.filtersHash,
              partitionSignature: filterCursorHashes.partitionSignature,
              ...(cursorApiVersion ? { apiVersion: cursorApiVersion } : {})
            })
          : null;
      } else {
        const pageResult = await resource.page!({
          size: limit,
          ...(hasPageParam ? { page } : {}),
          ...(!hasPageParam ? { cursor: requestCursorForPage } : {}),
          ...(effectivePartition && effectivePartitionValues
            ? {
                partition: effectivePartition,
                partitionValues: effectivePartitionValues
              }
            : {}),
          skipCount: true
        });
        items = pageResult.items || [];
        nextCursor = pageResult.nextCursor ?? null;
        hasMore = pageResult.hasMore ?? Boolean(nextCursor);
      }

      if (populateIncludes && relationsPlugin && items && items.length > 0) {
        await relationsPlugin.populate(resource, items, populateIncludes);
      }

      const filteredItems = applyResponsePolicy(
        items,
        { ...apiConfig, protected: protectedFields },
        c.get('user') as Record<string, unknown> | null | undefined,
        viewResolution.definition
      );

      const response = formatter.list(filteredItems, {
        total: null,
        page: hasPageParam ? page : null,
        pageSize: limit,
        pageCount: null,
        hasMore,
        nextCursor
      });

      if (partitionMode && effectivePartition && effectivePartitionValues) {
        response.meta.partitionMode = partitionMode;
        response.meta.partition = effectivePartition;
        response.meta.partitionValues = effectivePartitionValues;
      }

      if (viewResolution.name) {
        response.meta.view = viewResolution.name;
      }

      c.header('X-Pagination-Mode', 'cursor');
      if (nextCursor) {
        c.header('X-Next-Cursor', nextCursor);
      }

      return c.json(response, response._status as ContentfulStatusCode);
    });

    const listGuard = guardMiddleware(guards, 'list', guardOptions);
    app.describe!({
      description: `List ${resourceName} records with cursor/page pagination and partition-aware filtering`,
      tags: [resourceName],
      operationId: `list_${resourceName}`,
      responseSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'array', items: { type: 'object' } },
          pagination: {
            type: 'object',
            properties: {
              total: { type: 'integer', nullable: true },
              page: { type: 'integer', nullable: true },
              pageSize: { type: 'integer' },
              pageCount: { type: 'integer', nullable: true },
              hasMore: { type: 'boolean' },
              nextCursor: { type: 'string', nullable: true }
            }
          }
        }
      }
    }).get('/', listGuard, listHandler);
    app.get('', listGuard, listHandler);
  }

  if (methods.includes('GET')) {
    const getHandler = asyncHandler(async (c: Context) => {
      const id = getDecodedRouteId(c)!;
      const query = c.req.query();
      const partition = query.partition;
      const partitionValues = parsePartitionValues(query.partitionValues);
      const populateValues = parsePopulateValues(query.populate);
      const viewName = typeof query.view === 'string' ? query.view : null;
      const viewResolution = resolveRequestedView(apiConfig, viewName, c.get('user') as Record<string, unknown> | null | undefined);
      if (!viewResolution.ok) {
        const response = formatter.error(viewResolution.message, {
          status: viewResolution.status,
          code: viewResolution.code,
          details: viewResolution.details || {}
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }
      let populateIncludes: Record<string, unknown> | null = null;

      if (populateValues.length > 0) {
        const populateResult = resolvePopulate(resource, relationsPlugin, populateValues);
        if (populateResult.errors) {
          const response = formatter.error('Invalid populate parameter', {
            status: 400,
            code: 'INVALID_POPULATE',
            details: { errors: populateResult.errors.map(e => ({ field: 'populate', message: e })) }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }
        populateIncludes = populateResult.includes || null;
      }

      let item: Record<string, unknown> | null;

      if (partition && partitionValues) {
        item = await resource.getFromPartition({
          id,
          partitionName: partition,
          partitionValues
        });
      } else {
        item = await resource.get(id);
      }

      if (!item) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (populateIncludes && relationsPlugin) {
        await relationsPlugin.populate(resource, item, populateIncludes);
      }

      const etag = generateRecordETag(item);
      if (etag) {
        c.header('ETag', etag);
      }

      const ifNoneMatch = c.req.header('If-None-Match');
      if (ifNoneMatch && !validateIfNoneMatch(ifNoneMatch, etag)) {
        return c.body(null, 304);
      }

      const filteredItem = applyResponsePolicy(
        item,
        { ...apiConfig, protected: protectedFields },
        c.get('user') as Record<string, unknown> | null | undefined,
        viewResolution.definition
      );

      const response = formatter.success(filteredItem);
      if (viewResolution.name) {
        response.meta.view = viewResolution.name;
      }
      return c.json(response, response._status as ContentfulStatusCode);
    });

    app.describe!({
      description: `Get single ${resourceName} record by ID with optional relation population`,
      tags: [resourceName],
      operationId: `get_${resourceName}`,
      responseSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' }
        }
      }
    }).get('/:id', guardMiddleware(guards, 'get', guardOptions), getHandler);
  }

  if (methods.includes('POST')) {
    const createHandler = asyncHandler(async (c: Context) => {
      const data = await getRequestBody(c);
      const writePolicy = resolveWritePolicy(apiConfig, 'create', data, c.get('user') as Record<string, unknown> | null | undefined);
      if (!writePolicy.ok) {
        const response = formatter.error('One or more fields are not writable for this operation', {
          status: 400,
          code: 'FIELD_WRITE_NOT_ALLOWED',
          details: {
            operation: 'create',
            rejectedFields: writePolicy.rejectedPaths,
            readonlyFields: writePolicy.readonlyPaths,
            writableFields: writePolicy.writablePaths
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const item = await resource.insert(data, {
        user: c.get('user'),
        request: c.req
      });

      if (events) {
        events.emitResourceEvent('created', {
          resource: resourceName,
          id: item.id as string,
          data: item,
          user: c.get('user')
        });
      }

      const location = `${basePath}/${item.id}`;

      const prefer = c.req.header('Prefer');
      const preferMinimal = prefer && prefer.includes('return=minimal');

      c.header('Location', location);

      if (preferMinimal) {
        c.header('Preference-Applied', 'return=minimal');
        return c.body(null, 201);
      }

      const viewName = typeof c.req.query('view') === 'string' ? c.req.query('view') : null;
      const viewResolution = resolveRequestedView(apiConfig, viewName, c.get('user') as Record<string, unknown> | null | undefined);
      if (!viewResolution.ok) {
        const response = formatter.error(viewResolution.message, {
          status: viewResolution.status,
          code: viewResolution.code,
          details: viewResolution.details || {}
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const filteredItem = applyResponsePolicy(
        item,
        { ...apiConfig, protected: protectedFields },
        c.get('user') as Record<string, unknown> | null | undefined,
        viewResolution.definition
      );

      const response = formatter.created(filteredItem, location);
      if (viewResolution.name) {
        response.meta.view = viewResolution.name;
      }
      return c.json(response, response._status as ContentfulStatusCode);
    });

    const createGuard = guardMiddleware(guards, 'create', guardOptions);
    app.describe!({
      description: `Create new ${resourceName} record`,
      tags: [resourceName],
      operationId: `create_${resourceName}`,
      responseSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' }
        }
      }
    }).post('/', createGuard, createHandler);
    app.post('', createGuard, createHandler);

    if (bulkCreateConfig) {
      const bulkCreateHandler = asyncHandler(async (c: Context) => {
        let payload: unknown;
        try {
          const transformed = c.get('transformedBody' as never) as Record<string, unknown> | undefined;
          payload = transformed || await c.req.json();
        } catch {
          const response = formatter.error('Invalid bulk create payload', {
            status: 400,
            code: 'INVALID_BULK_PAYLOAD',
            details: {
              suggestion: 'Send valid JSON with a top-level array or { "items": [ ... ] }.'
            }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        const normalizedPayload = normalizeBulkCreateItems(payload, bulkCreateConfig.maxItems);
        if (!normalizedPayload.ok) {
          const response = formatter.error(normalizedPayload.message, {
            status: 400,
            code: normalizedPayload.code,
            details: normalizedPayload.details
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        const viewName = typeof c.req.query('view') === 'string' ? c.req.query('view') : null;
        const viewResolution = resolveRequestedView(apiConfig, viewName, c.get('user') as Record<string, unknown> | null | undefined);
        if (!viewResolution.ok) {
          const response = formatter.error(viewResolution.message, {
            status: viewResolution.status,
            code: viewResolution.code,
            details: viewResolution.details || {}
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        const createdItems: Record<string, unknown>[] = [];
        const errors: BulkCreateItemError[] = [];
        let processed = 0;
        let stopped = false;

        for (const [index, item] of normalizedPayload.items.entries()) {
          const writePolicy = resolveWritePolicy(apiConfig, 'create', item, c.get('user') as Record<string, unknown> | null | undefined);
          if (!writePolicy.ok) {
            errors.push({
              index,
              code: 'FIELD_WRITE_NOT_ALLOWED',
              message: 'One or more fields are not writable for this operation',
              status: 400,
              details: {
                operation: 'create',
                rejectedFields: writePolicy.rejectedPaths,
                readonlyFields: writePolicy.readonlyPaths,
                writableFields: writePolicy.writablePaths
              }
            });
            processed += 1;
            if (bulkCreateConfig.mode === 'all-or-nothing') {
              stopped = true;
              break;
            }
            continue;
          }

          try {
            const created = await resource.insert(item, {
              user: c.get('user'),
              request: c.req
            });

            if (events) {
              events.emitResourceEvent('created', {
                resource: resourceName,
                id: created.id as string,
                data: created,
                user: c.get('user')
              });
            }

            createdItems.push(applyResponsePolicy(
              created,
              { ...apiConfig, protected: protectedFields },
              c.get('user') as Record<string, unknown> | null | undefined,
              viewResolution.definition
            ) as Record<string, unknown>);
          } catch (err) {
            errors.push(createBulkItemError(index, err as Error));
            if (bulkCreateConfig.mode === 'all-or-nothing') {
              stopped = true;
              processed += 1;
              break;
            }
          }

          processed += 1;
        }

        const response = formatter.success({
          items: createdItems,
          errors,
          summary: {
            total: normalizedPayload.items.length,
            processed,
            created: createdItems.length,
            failed: errors.length,
            stopped,
            mode: bulkCreateConfig.mode
          }
        }, {
          status: errors.length > 0 ? 207 : 201,
          meta: viewResolution.name ? { view: viewResolution.name } : {}
        });

        return c.json(response, response._status as ContentfulStatusCode);
      });

      app.describe!({
        description: `Create multiple ${resourceName} records in one request`,
        tags: [resourceName],
        operationId: `bulk_create_${resourceName}`,
        responseSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      index: { type: 'integer' },
                      code: { type: 'string' },
                      message: { type: 'string' },
                      status: { type: 'integer' },
                      details: { type: 'object' }
                    }
                  }
                },
                summary: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    processed: { type: 'integer' },
                    created: { type: 'integer' },
                    failed: { type: 'integer' },
                    stopped: { type: 'boolean' },
                    mode: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }).post(bulkCreateConfig.path, createGuard, bulkCreateHandler);
    }
  }

  if (methods.includes('PUT')) {
    const updateHandler = asyncHandler(async (c: Context) => {
      const id = getDecodedRouteId(c)!;
      const data = await getRequestBody(c);
      const writePolicy = resolveWritePolicy(apiConfig, 'update', data, c.get('user') as Record<string, unknown> | null | undefined);
      if (!writePolicy.ok) {
        const response = formatter.error('One or more fields are not writable for this operation', {
          status: 400,
          code: 'FIELD_WRITE_NOT_ALLOWED',
          details: {
            operation: 'update',
            rejectedFields: writePolicy.rejectedPaths,
            readonlyFields: writePolicy.readonlyPaths,
            writableFields: writePolicy.writablePaths
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const existing = await resource.get(id);
      if (!existing) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const ifMatch = c.req.header('If-Match');
      if (ifMatch) {
        const currentETag = generateRecordETag(existing);
        if (!validateIfMatch(ifMatch, currentETag)) {
          const response = formatter.error('Resource was modified by another request. Please refetch and retry.', {
            status: 412,
            code: 'ETAG_MISMATCH'
          });
          return c.json(response, 412 as ContentfulStatusCode);
        }
      }

      const updated = await resource.update(id, data, {
        user: c.get('user'),
        request: c.req
      });

      const newETag = generateRecordETag(updated);
      if (newETag) {
        c.header('ETag', newETag);
      }

      if (events) {
        events.emitResourceEvent('updated', {
          resource: resourceName,
          id: updated.id as string,
          data: updated,
          previous: existing,
          user: c.get('user')
        });
      }

      const prefer = c.req.header('Prefer');
      const preferMinimal = prefer && prefer.includes('return=minimal');

      if (preferMinimal) {
        c.header('Preference-Applied', 'return=minimal');
        return c.body(null, 200);
      }

      const viewName = typeof c.req.query('view') === 'string' ? c.req.query('view') : null;
      const viewResolution = resolveRequestedView(apiConfig, viewName, c.get('user') as Record<string, unknown> | null | undefined);
      if (!viewResolution.ok) {
        const response = formatter.error(viewResolution.message, {
          status: viewResolution.status,
          code: viewResolution.code,
          details: viewResolution.details || {}
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const filteredUpdated = applyResponsePolicy(
        updated,
        { ...apiConfig, protected: protectedFields },
        c.get('user') as Record<string, unknown> | null | undefined,
        viewResolution.definition
      );

      const response = formatter.success(filteredUpdated);
      if (viewResolution.name) {
        response.meta.view = viewResolution.name;
      }
      return c.json(response, response._status as ContentfulStatusCode);
    });

    app.describe!({
      description: `Update ${resourceName} record (full replacement with merge)`,
      tags: [resourceName],
      operationId: `update_${resourceName}`,
      responseSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' }
        }
      }
    }).put('/:id', guardMiddleware(guards, 'update', guardOptions), updateHandler);
  }

  if (methods.includes('PATCH')) {
    const patchHandler = asyncHandler(async (c: Context) => {
      const id = getDecodedRouteId(c)!;
      const data = await getRequestBody(c);
      const writePolicy = resolveWritePolicy(apiConfig, 'patch', data, c.get('user') as Record<string, unknown> | null | undefined);
      if (!writePolicy.ok) {
        const response = formatter.error('One or more fields are not writable for this operation', {
          status: 400,
          code: 'FIELD_WRITE_NOT_ALLOWED',
          details: {
            operation: 'patch',
            rejectedFields: writePolicy.rejectedPaths,
            readonlyFields: writePolicy.readonlyPaths,
            writableFields: writePolicy.writablePaths
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const existing = await resource.get(id);
      if (!existing) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const ifMatch = c.req.header('If-Match');
      if (ifMatch) {
        const currentETag = generateRecordETag(existing);
        if (!validateIfMatch(ifMatch, currentETag)) {
          const response = formatter.error('Resource was modified by another request. Please refetch and retry.', {
            status: 412,
            code: 'ETAG_MISMATCH'
          });
          return c.json(response, 412 as ContentfulStatusCode);
        }
      }

      const updated = await resource.patch(id, data, {
        user: c.get('user'),
        request: c.req
      });

      const newETag = generateRecordETag(updated);
      if (newETag) {
        c.header('ETag', newETag);
      }

      if (events) {
        events.emitResourceEvent('updated', {
          resource: resourceName,
          id: updated.id as string,
          data: updated,
          previous: existing,
          partial: true,
          user: c.get('user')
        });
      }

      const prefer = c.req.header('Prefer');
      const preferMinimal = prefer && prefer.includes('return=minimal');

      if (preferMinimal) {
        c.header('Preference-Applied', 'return=minimal');
        return c.body(null, 200);
      }

      const viewName = typeof c.req.query('view') === 'string' ? c.req.query('view') : null;
      const viewResolution = resolveRequestedView(apiConfig, viewName, c.get('user') as Record<string, unknown> | null | undefined);
      if (!viewResolution.ok) {
        const response = formatter.error(viewResolution.message, {
          status: viewResolution.status,
          code: viewResolution.code,
          details: viewResolution.details || {}
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const filteredUpdated = applyResponsePolicy(
        updated,
        { ...apiConfig, protected: protectedFields },
        c.get('user') as Record<string, unknown> | null | undefined,
        viewResolution.definition
      );

      const response = formatter.success(filteredUpdated);
      if (viewResolution.name) {
        response.meta.view = viewResolution.name;
      }
      return c.json(response, response._status as ContentfulStatusCode);
    });

    app.describe!({
      description: `Partially update ${resourceName} record (merge with existing)`,
      tags: [resourceName],
      operationId: `patch_${resourceName}`,
      responseSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' }
        }
      }
    }).patch('/:id', guardMiddleware(guards, 'update', guardOptions), patchHandler);
  }

  if (methods.includes('DELETE')) {
    const deleteHandler = asyncHandler(async (c: Context) => {
      const id = getDecodedRouteId(c)!;

      const existing = await resource.get(id);
      if (!existing) {
        const response = formatter.notFound(resourceName, id);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const ifMatch = c.req.header('If-Match');
      if (ifMatch) {
        const currentETag = generateRecordETag(existing);
        if (!validateIfMatch(ifMatch, currentETag)) {
          const response = formatter.error('Resource was modified by another request. Please refetch and retry.', {
            status: 412,
            code: 'ETAG_MISMATCH'
          });
          return c.json(response, 412 as ContentfulStatusCode);
        }
      }

      await resource.delete(id);

      if (events) {
        events.emitResourceEvent('deleted', {
          resource: resourceName,
          id,
          previous: existing,
          user: c.get('user')
        });
      }

      return c.body(null, 204);
    });

    app.describe!({
      description: `Delete ${resourceName} record by ID`,
      tags: [resourceName],
      operationId: `delete_${resourceName}`,
      responseSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' }
        }
      }
    }).delete('/:id', guardMiddleware(guards, 'delete', guardOptions), deleteHandler);
  }

  if (methods.includes('HEAD')) {
    const headListHandler = asyncHandler(async (c: Context) => {
      const query = c.req.query();
      const resourceVersion = resource.config?.currentVersion || resource.version || 'v1';
      const partitions = resource.config?.partitions || {};
      const attributes = getResourceAttributes(resource);

      const partitionResolution = resolvePartitionFromFilters(resource, {}, query.partition || null, query.partitionValues ? JSON.parse(query.partitionValues) : undefined);
      const countOptions: { partition?: string | null; partitionValues?: Record<string, unknown> } = {};
      if (partitionResolution.partition) {
        countOptions.partition = partitionResolution.partition;
        countOptions.partitionValues = partitionResolution.partitionValues;
      }
      const total = await resource.count(countOptions);

      const pageSize = Math.min(Math.max(parseInt(query.limit || '100', 10) || 100, 1), 1000);
      const totalPages = Math.ceil(total / pageSize);

      c.header('X-Total-Count', total.toString());
      c.header('X-Total-Pages', totalPages.toString());
      c.header('X-Page-Size', pageSize.toString());
      c.header('X-Resource-Version', resourceVersion);
      c.header('X-Schema-Fields', Object.keys(attributes).length.toString());

      const partitionNames = Object.keys(partitions);
      if (partitionNames.length > 0) {
        c.header('X-Partitions', partitionNames.join(', '));
      }

      if (countOptions.partition) {
        c.header('X-Partition-Used', countOptions.partition);
      }

      c.header('X-Allowed-Methods', methods.join(', '));

      return c.body(null, 200);
    });

    const headItemHandler = asyncHandler(async (c: Context) => {
      const id = getDecodedRouteId(c)!;
      const item = await resource.get(id);

      if (!item) {
        return c.body(null, 404);
      }

      const etag = generateRecordETag(item);
      if (etag) {
        c.header('ETag', etag);
      }

      if (item._updatedAt) {
        c.header('Last-Modified', new Date(item._updatedAt as string).toUTCString());
      } else if (item._createdAt) {
        c.header('Last-Modified', new Date(item._createdAt as string).toUTCString());
      }

      const ifNoneMatch = c.req.header('If-None-Match');
      if (ifNoneMatch && !validateIfNoneMatch(ifNoneMatch, etag)) {
        return c.body(null, 304);
      }

      return c.body(null, 200);
    });

    // Use on() for HEAD - fallback gracefully if on() not available (bundling issues)
    if (typeof (app as any).on === 'function') {
      (app as any).on('HEAD', '/', headListHandler);
      (app as any).on('HEAD', '', headListHandler);
      (app as any).on('HEAD', '/:id', headItemHandler);
    }
  }

  if (methods.includes('OPTIONS')) {
    const collectionOptionsHandler = asyncHandler(async (c: Context) => {
      c.header('Allow', methods.join(', '));
      c.header('Accept-Patch', 'application/json');

      if (methods.includes('GET') || methods.includes('HEAD')) {
        c.header('ETag-Support', 'weak, If-None-Match');
      }
      if (methods.includes('PUT') || methods.includes('PATCH') || methods.includes('DELETE')) {
        c.header('Concurrency-Control', 'If-Match');
      }

      const total = await resource.count();
      const schema = getResourceAttributes(resource);
      const resourceVersion = resource.config?.currentVersion || resource.version || 'v1';
      const partitionNames = Object.keys(resource.config?.partitions || {});

      const metadata = {
        resource: resourceName,
        version: resourceVersion,
        totalRecords: total,
        defaultPageSize: 100,
        maxPageSize: 1000,
        totalPages: Math.ceil(total / 100),
        allowedMethods: methods,

        features: {
          etag: true,
          conditionalRequests: true,
          partitioning: partitionNames.length > 0,
          filtering: true,
          pagination: true,
          sorting: false,
          bulkCreate: Boolean(bulkCreateConfig)
        },

        ...(partitionNames.length > 0 ? { partitions: partitionNames } : {}),

        conditionalHeaders: {
          'If-Match': 'Prevent conflicts (PUT/PATCH/DELETE) - returns 412 on mismatch',
          'If-None-Match': 'Cache validation (GET/HEAD) - returns 304 if not modified'
        },

        preferenceHeaders: {
          'Prefer: return=minimal': 'Request minimal response (POST/PUT/PATCH) - returns status only, no body'
        },

        schema: Object.entries(schema).map(([name, def]) => ({
          name,
          type: typeof def === 'string' ? def.split('|')[0] : (def as { type?: string }).type,
          rules: typeof def === 'string' ? def.split('|').slice(1) : []
        })),

        endpoints: {
          list: `/${resourceVersion}/${resourceName}`,
          get: `/${resourceVersion}/${resourceName}/:id`,
          create: `/${resourceVersion}/${resourceName}`,
          ...(bulkCreateConfig ? { bulkCreate: `${basePath}${bulkCreateConfig.path}` } : {}),
          update: `/${resourceVersion}/${resourceName}/:id`,
          delete: `/${resourceVersion}/${resourceName}/:id`
        },

        queryParameters: {
          limit: 'number (1-1000, default: 100)',
          cursor: 'string (opaque cursor token for cursor pagination; omit or use cursor= for first cursor page)',
          page: 'number (>= 1, page-based navigation backed by cached cursor checkpoints)',
          partition: 'string (partition name)',
          partitionValues: 'JSON string',
          '[partition field]': 'any (when all fields of a partition are provided, API auto-converts query fields into partitionValues)'
        },

        statusCodes: {
          200: 'OK - Successful GET/PUT/PATCH',
          201: 'Created - Successful POST',
          207: 'Multi-Status - Bulk create completed with one or more item-level failures',
          204: 'No Content - Successful DELETE',
          304: 'Not Modified - Resource unchanged (If-None-Match)',
          404: 'Not Found - Resource does not exist',
          412: 'Precondition Failed - ETag mismatch (If-Match)',
          422: 'Unprocessable Entity - Validation error'
        }
      };

      return c.json(metadata);
    });

    app.options('/', collectionOptionsHandler);
    app.options('', collectionOptionsHandler);

    app.options('/:id', (c: Context) => {
      const itemMethods = methods.filter(m => m !== 'POST');
      c.header('Allow', itemMethods.join(', '));

      c.header('Accept-Patch', 'application/json');
      if (itemMethods.includes('GET') || itemMethods.includes('HEAD')) {
        c.header('ETag-Support', 'weak, If-None-Match');
      }
      if (itemMethods.includes('PUT') || itemMethods.includes('PATCH') || itemMethods.includes('DELETE')) {
        c.header('Concurrency-Control', 'If-Match');
      }

      return c.body(null, 204);
    });
  }

  return app;
}

export interface RelationConfig {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
  resource: string;
  [key: string]: unknown;
}

export function createRelationalRoutes(sourceResource: ResourceLike, relationName: string, relationConfig: RelationConfig, _version: string, HttpApp: new () => HttpAppType): HttpAppType {
  const app = new HttpApp();
  const resourceName = sourceResource.name;
  const relatedResourceName = relationConfig.resource;

  const relationListHandler = asyncHandler(async (c: Context) => {
    const pathParts = c.req.path.split('/');
    const relationNameIndex = pathParts.lastIndexOf(relationName);
    const id = decodeRequestParam(pathParts[relationNameIndex - 1] || '') || '';
    const query = c.req.query();

    const source = await sourceResource.get(id);
    if (!source) {
      const response = formatter.notFound(resourceName, id);
      return c.json(response, response._status as ContentfulStatusCode);
    }

    const result = await sourceResource.get(id, {
      include: [relationName]
    });

    const relatedData = result?.[relationName];

    if (!relatedData) {
      if (relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany') {
        const response = formatter.list([], {
          total: 0,
          page: 1,
          pageSize: 100,
          pageCount: 0
        });
        return c.json(response, response._status as ContentfulStatusCode);
      } else {
        const response = formatter.notFound(relatedResourceName, 'related resource');
        return c.json(response, response._status as ContentfulStatusCode);
      }
    }

    if (relationConfig.type === 'hasMany' || relationConfig.type === 'belongsToMany') {
      const items = Array.isArray(relatedData) ? relatedData : [relatedData];
      const parsedLimit = parseInt(query.limit || '100', 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 1000)
        : 100;
      const hasCursorParam = Object.prototype.hasOwnProperty.call(query, 'cursor');
      const hasPageParam = Object.prototype.hasOwnProperty.call(query, 'page');

      if (hasCursorParam && hasPageParam) {
        const response = formatter.error('Use either cursor token or page number, not both', {
          status: 400,
          code: 'INVALID_PAGINATION',
          details: {
            suggestion: 'Use ?page=N for page-based navigation or ?cursor=TOKEN for token-based continuation'
          }
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      let start = 0;
      let page: number | null = null;

      if (hasPageParam) {
        const parsedPage = parseInt(query.page || '1', 10);
        if (!Number.isFinite(parsedPage) || parsedPage < 1) {
          const response = formatter.error('Invalid page parameter', {
            status: 400,
            code: 'INVALID_PAGINATION',
            details: {
              page: query.page,
              suggestion: 'Use a page number greater than or equal to 1'
            }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }
        page = parsedPage;
        start = (page - 1) * limit;
      } else if (hasCursorParam && typeof query.cursor === 'string' && query.cursor.trim().length > 0) {
        const relationCursor = decodeRelationListCursor(query.cursor.trim());
        if (!relationCursor) {
          const response = formatter.error('Invalid relation cursor', {
            status: 400,
            code: 'INVALID_CURSOR',
            details: {
              suggestion: 'Use the nextCursor returned by this relation endpoint.'
            }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        if (relationCursor.pageSize !== limit) {
          const response = formatter.error('Cursor pageSize does not match current limit', {
            status: 400,
            code: 'INVALID_CURSOR',
            details: {
              cursorPageSize: relationCursor.pageSize,
              requestedLimit: limit,
              suggestion: 'Reuse the same limit value used when this cursor was generated.'
            }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        start = relationCursor.index;
      }

      const paginatedItems = items.slice(start, start + limit);
      const nextIndex = start + paginatedItems.length;
      const hasMore = nextIndex < items.length;
      const nextCursor = hasMore
        ? encodeSimpleCursor({
            v: 1,
            type: 'relation-list',
            index: nextIndex,
            pageSize: limit
          })
        : null;

      const response = formatter.list(paginatedItems as Record<string, unknown>[], {
        total: hasPageParam ? items.length : null,
        page,
        pageSize: limit,
        pageCount: hasPageParam ? Math.ceil(items.length / limit) : null,
        hasMore,
        nextCursor
      });

      if (hasPageParam) {
        c.header('X-Total-Count', items.length.toString());
        c.header('X-Page-Count', Math.ceil(items.length / limit).toString());
      }
      c.header('X-Pagination-Mode', hasPageParam ? 'page' : 'cursor');
      if (nextCursor) {
        c.header('X-Next-Cursor', nextCursor);
      }

      return c.json(response, response._status as ContentfulStatusCode);
    } else {
      const response = formatter.success(relatedData as Record<string, unknown>);
      return c.json(response, response._status as ContentfulStatusCode);
    }
  });

  app.get('/', relationListHandler);
  app.get('', relationListHandler);

  return app;
}

export default {
  createResourceRoutes,
  createRelationalRoutes
};
