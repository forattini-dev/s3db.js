import EventEmitter from 'events';
import {
  createRedDbClient,
  type RedDbCapabilities,
  type RedDbClient as ReckerRedDbClient,
  type RedDbCollectionsNamespace,
  type RedDbDocumentsNamespace,
  type RedDbEdgesNamespace,
  type RedDbGrpcKeepaliveOptions,
  type RedDbGrpcTlsOptions,
  type RedDbIndexesNamespace,
  type RedDbKvNamespace,
  type RedDbNodesNamespace,
  type RedDbOperationTimeouts,
  type RedDbRowsNamespace,
  type RedDbSqlNamespace,
  type RedDbSystemNamespace,
  type RedDbTransportMode,
  type RedDbVectorsNamespace,
  type RedDbWireTlsOptions,
} from 'recker';

import { createLogger } from '../concerns/logger.js';
import { idGenerator } from '../concerns/id.js';
import { ConnectionString } from '../connection-string.class.js';
import { ConnectionStringError } from '../errors.js';
import type { LogLevel } from '../types/common.types.js';
import type { ClientConfig, Logger, RedDbNativeClientConfig } from './types.js';

interface ResolvedRedDbNativeClientConfig {
  baseUrl: string;
  authToken?: string;
  writeToken?: string;
  collection: string;
  bucket: string;
  keyPrefix: string;
  region: string;
  transport?: RedDbTransportMode;
  allowTransportFallback?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  http2?: boolean;
  wireAddress?: string;
  wireTls?: boolean | RedDbWireTlsOptions;
  wirePoolSize?: number;
  wireKeepAlive?: boolean;
  wireKeepAliveInitialDelayMs?: number;
  wireConnectTimeout?: number;
  grpcAddress?: string;
  grpcTls?: boolean | RedDbGrpcTlsOptions;
  grpcOptions?: Record<string, string | number>;
  grpcKeepalive?: RedDbGrpcKeepaliveOptions;
  operationTimeouts?: RedDbOperationTimeouts;
  batchConcurrency?: number;
  connectionString: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeRecords<T extends Record<string, unknown>>(base?: T, override?: T): T | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base || {}),
    ...(override || {}),
  } as T;
}

function mergeObjects<T extends object>(base?: T, override?: T): T | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base || {}),
    ...(override || {}),
  } as T;
}

function normalizeKeyPrefix(value?: string): string {
  if (!value) return '';
  return value
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function parseRecordString(value: unknown): Record<string, string> | undefined {
  if (!isPlainRecord(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, recordValue]) => typeof recordValue === 'string')
      .map(([key, recordValue]) => [key, recordValue as string])
  );
}

function parseRecordStringOrNumber(value: unknown): Record<string, string | number> | undefined {
  if (!isPlainRecord(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, recordValue]) => typeof recordValue === 'string' || typeof recordValue === 'number')
      .map(([key, recordValue]) => [key, recordValue as string | number])
  );
}

function parseWireTls(value: unknown): boolean | RedDbWireTlsOptions | undefined {
  if (typeof value === 'boolean') return value;
  if (isPlainRecord(value)) return value as RedDbWireTlsOptions;
  return undefined;
}

function parseGrpcTls(value: unknown): boolean | RedDbGrpcTlsOptions | undefined {
  if (typeof value === 'boolean') return value;
  if (isPlainRecord(value)) return value as RedDbGrpcTlsOptions;
  return undefined;
}

function parseGrpcKeepalive(value: unknown): RedDbGrpcKeepaliveOptions | undefined {
  return isPlainRecord(value) ? value as RedDbGrpcKeepaliveOptions : undefined;
}

function parseOperationTimeouts(value: unknown): RedDbOperationTimeouts | undefined {
  return isPlainRecord(value) ? value as RedDbOperationTimeouts : undefined;
}

function parseTransportMode(value: unknown): RedDbTransportMode | undefined {
  return value === 'auto' || value === 'http' || value === 'grpc' || value === 'wire'
    ? value
    : undefined;
}

function resolveConnectionStringOptions(connectionString: string): Partial<ResolvedRedDbNativeClientConfig> {
  const parsed = new ConnectionString(connectionString);

  if (parsed.clientType !== 'reddb') {
    throw new ConnectionStringError(`Expected a reddb:// connection string, received "${connectionString}"`, {
      input: connectionString,
      suggestion: 'Use a reddb:// URI or pass baseUrl explicitly.',
    });
  }

  const clientOptions = isPlainRecord(parsed.clientOptions)
    ? parsed.clientOptions
    : {};

  return {
    baseUrl: parsed.redDbBaseUrl,
    authToken: parsed.redDbAuthToken,
    writeToken: parsed.redDbWriteToken,
    collection: parsed.redDbCollection || parsed.bucket || 's3db',
    bucket: parsed.bucket || parsed.redDbCollection || 's3db',
    keyPrefix: normalizeKeyPrefix(parsed.keyPrefix),
    region: parsed.region || 'reddb',
    transport: parseTransportMode(clientOptions.transport),
    allowTransportFallback: parseOptionalBoolean(clientOptions.allowTransportFallback),
    headers: parseRecordString(clientOptions.headers),
    timeout: parseOptionalNumber(clientOptions.timeout),
    http2: parseOptionalBoolean(clientOptions.http2),
    wireAddress: parseOptionalString(clientOptions.wireAddress),
    wireTls: parseWireTls(clientOptions.wireTls),
    wirePoolSize: parseOptionalNumber(clientOptions.wirePoolSize),
    wireKeepAlive: parseOptionalBoolean(clientOptions.wireKeepAlive),
    wireKeepAliveInitialDelayMs: parseOptionalNumber(clientOptions.wireKeepAliveInitialDelayMs),
    wireConnectTimeout: parseOptionalNumber(clientOptions.wireConnectTimeout),
    grpcAddress: parseOptionalString(clientOptions.grpcAddress),
    grpcTls: parseGrpcTls(clientOptions.grpcTls),
    grpcOptions: parseRecordStringOrNumber(clientOptions.grpcOptions),
    grpcKeepalive: parseGrpcKeepalive(clientOptions.grpcKeepalive),
    operationTimeouts: parseOperationTimeouts(clientOptions.operationTimeouts),
    batchConcurrency: parseOptionalNumber(clientOptions.batchConcurrency),
  };
}

function buildConnectionString(options: Pick<ResolvedRedDbNativeClientConfig, 'baseUrl' | 'authToken' | 'writeToken' | 'keyPrefix' | 'collection'>): string {
  const url = new URL(options.baseUrl);
  const authToken = options.authToken ? encodeURIComponent(options.authToken) : '';
  const writeToken = options.writeToken ? `:${encodeURIComponent(options.writeToken)}` : '';
  const credentials = authToken ? `${authToken}${writeToken}@` : '';
  const normalizedKeyPrefix = normalizeKeyPrefix(options.keyPrefix);
  const keyPrefixPath = normalizedKeyPrefix
    ? `/${normalizedKeyPrefix.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`
    : '';
  const query = new URLSearchParams();

  if (options.collection) {
    query.set('collection', options.collection);
  }

  return `reddb://${credentials}${url.host}${keyPrefixPath}${query.size > 0 ? `?${query.toString()}` : ''}`;
}

function resolveConfig(config: RedDbNativeClientConfig): ResolvedRedDbNativeClientConfig {
  const fromConnectionString = config.connectionString
    ? resolveConnectionStringOptions(config.connectionString)
    : {};

  const baseUrl = config.baseUrl || fromConnectionString.baseUrl;

  if (!baseUrl) {
    throw new ConnectionStringError('RedDbNativeClient requires either connectionString or baseUrl', {
      suggestion: 'Pass connectionString: "reddb://..." or baseUrl: "http://host:8080".',
    });
  }

  const collection = config.collection
    || fromConnectionString.collection
    || config.bucket
    || fromConnectionString.bucket
    || 's3db';
  const bucket = config.bucket || fromConnectionString.bucket || collection;
  const keyPrefix = normalizeKeyPrefix(config.keyPrefix || fromConnectionString.keyPrefix);
  const region = config.region || fromConnectionString.region || 'reddb';
  const authToken = config.authToken ?? fromConnectionString.authToken;
  const writeToken = config.writeToken ?? fromConnectionString.writeToken;

  const resolved: ResolvedRedDbNativeClientConfig = {
    baseUrl,
    authToken,
    writeToken,
    collection,
    bucket,
    keyPrefix,
    region,
    transport: config.transport || fromConnectionString.transport,
    allowTransportFallback: config.allowTransportFallback ?? fromConnectionString.allowTransportFallback,
    headers: mergeRecords(fromConnectionString.headers, config.headers),
    timeout: config.timeout ?? fromConnectionString.timeout,
    http2: config.http2 ?? fromConnectionString.http2,
    wireAddress: config.wireAddress || fromConnectionString.wireAddress,
    wireTls: config.wireTls ?? fromConnectionString.wireTls,
    wirePoolSize: config.wirePoolSize ?? fromConnectionString.wirePoolSize,
    wireKeepAlive: config.wireKeepAlive ?? fromConnectionString.wireKeepAlive,
    wireKeepAliveInitialDelayMs: config.wireKeepAliveInitialDelayMs ?? fromConnectionString.wireKeepAliveInitialDelayMs,
    wireConnectTimeout: config.wireConnectTimeout ?? fromConnectionString.wireConnectTimeout,
    grpcAddress: config.grpcAddress || fromConnectionString.grpcAddress,
    grpcTls: config.grpcTls ?? fromConnectionString.grpcTls,
    grpcOptions: mergeRecords(fromConnectionString.grpcOptions, config.grpcOptions),
    grpcKeepalive: mergeObjects(fromConnectionString.grpcKeepalive, config.grpcKeepalive),
    operationTimeouts: mergeObjects(fromConnectionString.operationTimeouts, config.operationTimeouts),
    batchConcurrency: config.batchConcurrency ?? fromConnectionString.batchConcurrency,
    connectionString: '',
  };

  resolved.connectionString = buildConnectionString(resolved);
  return resolved;
}

/**
 * RedDB Native Client for s3db.js
 *
 * Exposes RedDB namespaces from Recker V2 directly so callers can use SQL,
 * documents, graphs, vectors, and key-value operations without going through
 * the S3-compatible object mapping used by RedDbClient.
 */
export class RedDbNativeClient extends EventEmitter {
  id: string;
  logLevel: string;
  private logger: Logger;
  readonly client: ReckerRedDbClient;
  readonly system: RedDbSystemNamespace;
  readonly sql: RedDbSqlNamespace;
  readonly collections: RedDbCollectionsNamespace;
  readonly indexes: RedDbIndexesNamespace;
  readonly rows: RedDbRowsNamespace;
  readonly documents: RedDbDocumentsNamespace;
  readonly nodes: RedDbNodesNamespace;
  readonly edges: RedDbEdgesNamespace;
  readonly vectors: RedDbVectorsNamespace;
  readonly kv: RedDbKvNamespace;
  readonly baseUrl: string;
  readonly authToken?: string;
  readonly writeToken?: string;
  readonly collection: string;
  readonly bucket: string;
  readonly keyPrefix: string;
  readonly region: string;
  readonly connectionString: string;
  readonly config: ClientConfig;

  constructor(config: RedDbNativeClientConfig = {}) {
    super();

    this.id = config.id || idGenerator(77);
    this.logLevel = config.logLevel || 'info';
    this.logger = config.logger || createLogger({
      name: 'RedDbNativeClient',
      level: this.logLevel as LogLevel,
    });

    const resolved = resolveConfig(config);

    this.baseUrl = resolved.baseUrl;
    this.authToken = resolved.authToken;
    this.writeToken = resolved.writeToken;
    this.collection = resolved.collection;
    this.bucket = resolved.bucket;
    this.keyPrefix = resolved.keyPrefix;
    this.region = resolved.region;
    this.connectionString = resolved.connectionString;
    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      endpoint: this.baseUrl,
      forcePathStyle: true,
    };

    this.client = config.client || createRedDbClient({
      baseUrl: resolved.baseUrl,
      authToken: resolved.authToken,
      writeToken: resolved.writeToken,
      transport: resolved.transport,
      allowTransportFallback: resolved.allowTransportFallback,
      headers: resolved.headers,
      timeout: resolved.timeout,
      http2: resolved.http2,
      wireAddress: resolved.wireAddress,
      wireTls: resolved.wireTls,
      wirePoolSize: resolved.wirePoolSize,
      wireKeepAlive: resolved.wireKeepAlive,
      wireKeepAliveInitialDelayMs: resolved.wireKeepAliveInitialDelayMs,
      wireConnectTimeout: resolved.wireConnectTimeout,
      grpcAddress: resolved.grpcAddress,
      grpcTls: resolved.grpcTls,
      grpcOptions: resolved.grpcOptions,
      grpcKeepalive: resolved.grpcKeepalive,
      operationTimeouts: resolved.operationTimeouts,
      batchConcurrency: resolved.batchConcurrency,
    });

    this.system = this.client.system;
    this.sql = this.client.sql;
    this.collections = this.client.collections;
    this.indexes = this.client.indexes;
    this.rows = this.client.rows;
    this.documents = this.client.documents;
    this.nodes = this.client.nodes;
    this.edges = this.client.edges;
    this.vectors = this.client.vectors;
    this.kv = this.client.kv;

    this.logger.debug({
      id: this.id,
      baseUrl: this.baseUrl,
      collection: this.collection,
      transport: resolved.transport || 'auto',
      wireAddress: resolved.wireAddress,
      grpcAddress: resolved.grpcAddress,
    }, `Initialized (id: ${this.id})`);
  }

  getCapabilities(): RedDbCapabilities {
    return this.client.getCapabilities();
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async destroy(): Promise<void> {
    await this.close();
  }
}
