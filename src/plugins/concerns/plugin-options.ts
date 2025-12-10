import type { Database } from '../../database.class.js';
import type { Resource } from '../../resource.class.js';
import type { S3Client } from '../../clients/s3-client.class.js';

const NULLISH = Symbol('nullish');

export interface PluginOptions {
  logLevel?: string;
  resources?: Resource[] | null;
  database?: Database | null;
  client?: S3Client | null;
  [key: string]: unknown;
}

export interface PluginFallback {
  logLevel?: string;
  resources?: Resource[] | null;
  database?: Database | null;
  client?: S3Client | null;
}

export interface PluginContext {
  logLevel?: string;
  resources?: Resource[] | null;
  database?: Database | null;
  client?: S3Client | null;
  [key: string]: unknown;
}

function pickOr<T>(value: T | undefined, fallback: T | null = null): T | null | symbol {
  return value === undefined ? fallback : value;
}

function ensureAssigned(context: PluginContext | null | undefined, key: string, value: unknown): void {
  if (!context || typeof context !== 'object') return;

  if (value === NULLISH) {
    if (context[key] === undefined) {
      context[key] = null;
    }
    return;
  }

  context[key] = value;
}

export function normalizePluginOptions(
  plugin: PluginContext,
  options: PluginOptions = {},
  fallback: PluginFallback = {}
): PluginOptions {
  const logLevel = pickOr(options.logLevel, pickOr(fallback.logLevel, 'info') as string) as string;

  const normalized: PluginOptions = {
    ...options,
    logLevel,
    resources: pickOr(options.resources, pickOr(fallback.resources, NULLISH as unknown as null)) as Resource[] | null,
    database: pickOr(options.database, pickOr(fallback.database, NULLISH as unknown as null)) as Database | null,
    client: pickOr(options.client, pickOr(fallback.client, NULLISH as unknown as null)) as S3Client | null
  };

  if ((normalized.resources as unknown) === NULLISH) normalized.resources = null;
  if ((normalized.database as unknown) === NULLISH) normalized.database = null;
  if ((normalized.client as unknown) === NULLISH) normalized.client = null;

  ensureAssigned(plugin, 'logLevel', normalized.logLevel);
  ensureAssigned(plugin, 'resources', normalized.resources === null ? NULLISH : normalized.resources);
  ensureAssigned(plugin, 'database', normalized.database === null ? NULLISH : normalized.database);
  ensureAssigned(plugin, 'client', normalized.client === null ? NULLISH : normalized.client);

  return normalized;
}

export default normalizePluginOptions;
