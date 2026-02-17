import type EventEmitter from 'events';
import type { Readable } from 'stream';

export interface S3ClientConfig {
  logLevel?: string;
  logger?: Logger | null;
  id?: string | null;
  AwsS3Client?: unknown;
  connectionString: string;
  httpClientOptions?: HttpClientOptions;
  taskExecutor?: boolean | TaskExecutorConfig;
  executorPool?: boolean | TaskExecutorConfig | null;
}

export type HttpClientProfile = 'balanced' | 'throughput' | 'resilient';

export const HTTP_CLIENT_PROFILES: Record<HttpClientProfile, Partial<HttpClientOptions>> = {
  balanced: {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
    connections: 50,
    headersTimeout: 30000,
    bodyTimeout: 60000,
    http2: true,
    http2Preset: 'performance',
    enableRetry: true,
    retryProfile: 'dual',
    maxRetries: 3,
  },
  throughput: {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 150,
    maxFreeSockets: 20,
    timeout: 120000,
    connections: 150,
    headersTimeout: 30000,
    bodyTimeout: 120000,
    http2: true,
    http2Preset: 'low-latency',
    enableRetry: true,
    retryProfile: 'recker-only',
    maxRetries: 2,
  },
  resilient: {
    keepAlive: true,
    keepAliveMsecs: 2000,
    maxSockets: 50,
    maxFreeSockets: 20,
    timeout: 60000,
    connections: 50,
    headersTimeout: 30000,
    bodyTimeout: 60000,
    http2: true,
    http2Preset: 'balanced',
    retryProfile: 'sdk-only',
    retryMode: 'adaptive',
    retryAttempts: 4,
  },
};

export interface HttpClientOptions {
  /** Apply a pre-defined transport profile before custom overrides. */
  httpClientProfile?: HttpClientProfile;
  /**
   * Retry ownership profile for the transport stack.
   * - dual (default): both handler and AWS client can retry.
   * - recker-only: retry only in Recker handler.
   * - sdk-only: retry only in AWS client.
   */
  retryProfile?: 'dual' | 'recker-only' | 'sdk-only';
  /**
   * Request-attempt budget for the AWS client when its retry layer is active.
   */
  retryAttempts?: number;
  /** Retry mode for AWS client when its retry layer is active ('standard' | 'adaptive'). */
  retryMode?: 'standard' | 'adaptive';
  /** Backward-compatible alias for retryProfile. */
  retryCoordination?: 'dual' | 'recker-only' | 'aws-only';
  /** Backward-compatible alias for retryMode. */
  awsRetryMode?: 'standard' | 'adaptive';
  /** Backward-compatible alias for retryAttempts. */
  awsMaxAttempts?: number;
  connectTimeout?: number;
  headersTimeout?: number;
  bodyTimeout?: number;
  keepAlive?: boolean;
  keepAliveMsecs?: number;
  maxSockets?: number;
  maxFreeSockets?: number;
  timeout?: number;
  connections?: number;
  pipelining?: number;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
  keepAliveTimeoutThreshold?: number;
  maxRequestsPerClient?: number;
  clientTtl?: number | null;
  http2?: boolean;
  http2Preset?: 'balanced' | 'performance' | 'low-latency' | 'low-memory';
  http2MaxConcurrentStreams?: number;
  enableHttp2Metrics?: boolean;
  enableDedup?: boolean;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTimeout?: number;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  retryJitter?: boolean;
  respectRetryAfter?: boolean;
  /** Use Recker HTTP handler (defaults to true). Falls back to AWS SDK default handler on failures by default. */
  useReckerHandler?: boolean;
  /** If false, throw immediately when Recker handler initialization fails. */
  failFastOnReckerFailure?: boolean;
  [key: string]: unknown;
}

export interface TaskExecutorConfig {
  enabled?: boolean;
  concurrency?: number | 'auto';
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  autotune?: AutotuneConfig | null;
  monitoring?: MonitoringConfig;
}

export interface AutotuneConfig {
  initialConcurrency?: number;
  minConcurrency?: number;
  maxConcurrency?: number;
  targetLatencyMs?: number;
  adjustmentInterval?: number;
  [key: string]: unknown;
}

export interface MonitoringConfig {
  collectMetrics?: boolean;
  [key: string]: unknown;
}

export interface Logger {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  trace?: (obj: unknown, msg?: string) => void;
}

export interface MemoryClientConfig {
  id?: string;
  logLevel?: string;
  logger?: Logger;
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  taskExecutor?: TaskManager;
  taskExecutorMonitoring?: MonitoringConfig | null;
  bucket?: string;
  keyPrefix?: string;
  region?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  persistPath?: string;
  autoPersist?: boolean;
  maxMemoryMB?: number;
  evictionEnabled?: boolean;
}

export interface FileSystemClientConfig {
  id?: string;
  logLevel?: string;
  logger?: Logger;
  taskExecutor?: TaskManager;
  taskExecutorMonitoring?: MonitoringConfig | null;
  concurrency?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  retryableErrors?: string[];
  basePath?: string;
  bucket?: string;
  keyPrefix?: string;
  region?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  compression?: CompressionConfig;
  ttl?: TTLConfig;
  locking?: LockingConfig;
  backup?: BackupConfig;
  journal?: JournalConfig;
  stats?: StatsConfig;
}

export interface CompressionConfig {
  enabled?: boolean;
  threshold?: number;
  level?: number;
}

export interface TTLConfig {
  enabled?: boolean;
  defaultTTL?: number;
  cleanupInterval?: number;
}

export interface LockingConfig {
  enabled?: boolean;
  timeout?: number;
}

export interface BackupConfig {
  enabled?: boolean;
  suffix?: string;
}

export interface JournalConfig {
  enabled?: boolean;
  file?: string;
}

export interface StatsConfig {
  enabled?: boolean;
}

export interface ClientConfig {
  bucket: string;
  keyPrefix: string;
  region: string;
  endpoint?: string;
  basePath?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface TaskManager {
  concurrency?: number;
  process: <T, R>(items: T[], fn: (item: T) => Promise<R>) => Promise<ProcessResult<R>>;
  getStats?: () => QueueStats | null;
  getAggregateMetrics?: (since?: number) => unknown | null;
}

export interface ProcessResult<T> {
  results: T[];
  errors: Array<{ error: Error; index: number; item?: unknown }>;
}

export interface QueueStats {
  queueSize?: number;
  activeCount?: number;
  effectiveConcurrency?: number;
  [key: string]: unknown;
}

export interface PutObjectParams {
  key: string;
  metadata?: Record<string, unknown>;
  contentType?: string;
  body?: Buffer | string | Readable;
  contentEncoding?: string;
  contentLength?: number;
  ifMatch?: string;
  ifNoneMatch?: string;
}

export interface CopyObjectParams {
  from: string;
  to: string;
  metadata?: Record<string, unknown>;
  metadataDirective?: 'COPY' | 'REPLACE';
  contentType?: string;
}

export interface ListObjectsParams {
  prefix?: string;
  delimiter?: string | null;
  maxKeys?: number;
  continuationToken?: string | null;
  startAfter?: string | null;
}

export interface GetKeysPageParams {
  prefix?: string;
  offset?: number;
  amount?: number;
}

export interface S3Object {
  Body?: Readable & {
    transformToString?: (encoding?: string) => Promise<string>;
    transformToByteArray?: () => Promise<Uint8Array>;
    transformToWebStream?: () => ReadableStream;
  };
  Metadata: Record<string, string>;
  ContentType?: string;
  ContentLength?: number;
  ETag?: string;
  LastModified?: Date;
  ContentEncoding?: string;
}

export interface ListObjectsResponse {
  Contents: S3ObjectInfo[];
  CommonPrefixes: Array<{ Prefix: string }>;
  IsTruncated: boolean;
  ContinuationToken?: string;
  NextContinuationToken?: string | null;
  KeyCount: number;
  MaxKeys: number;
  Prefix?: string;
  Delimiter?: string | null;
  StartAfter?: string;
}

export interface S3ObjectInfo {
  Key: string;
  Size: number;
  LastModified: Date;
  ETag: string;
  StorageClass?: string;
}

export interface PutObjectResponse {
  ETag: string;
  VersionId: string | null;
  ServerSideEncryption: string | null;
  Location: string;
}

export interface CopyObjectResponse {
  CopyObjectResult: {
    ETag: string;
    LastModified: string;
  };
  BucketKeyEnabled: boolean;
  VersionId: string | null;
  ServerSideEncryption: string | null;
}

export interface DeleteObjectResponse {
  DeleteMarker: boolean;
  VersionId: string | null;
}

export interface DeleteObjectsResponse {
  Deleted: Array<{ Key: string }>;
  Errors: Array<{ Key: string; Code: string; Message: string }>;
}

export interface StorageObjectData {
  body: Buffer;
  metadata: Record<string, string>;
  contentType: string;
  etag: string;
  lastModified: string;
  size: number;
  contentEncoding?: string;
  contentLength: number;
  compressed?: boolean;
  originalSize?: number;
  compressionRatio?: string;
  expiresAt?: number | null;
}

export interface StoragePutParams {
  body?: Buffer | string | unknown;
  metadata?: Record<string, string>;
  contentType?: string;
  contentEncoding?: string;
  contentLength?: number;
  ifMatch?: string;
  ifNoneMatch?: string;
  ttl?: number;
}

export interface StorageCopyParams {
  metadata?: Record<string, string>;
  metadataDirective?: 'COPY' | 'REPLACE';
  contentType?: string;
}

export interface StorageListParams {
  prefix?: string;
  delimiter?: string | null;
  maxKeys?: number;
  continuationToken?: string | null;
  startAfter?: string | null;
}

export interface MemoryStorageConfig {
  bucket?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  persistPath?: string;
  autoPersist?: boolean;
  logLevel?: string;
  logger?: Logger;
  maxMemoryMB?: number;
  evictionEnabled?: boolean;
}

export interface FileSystemStorageConfig {
  basePath?: string;
  bucket?: string;
  enforceLimits?: boolean;
  metadataLimit?: number;
  maxObjectSize?: number;
  logLevel?: string;
  logger?: Logger;
  compression?: CompressionConfig;
  ttl?: TTLConfig;
  locking?: LockingConfig;
  backup?: BackupConfig;
  journal?: JournalConfig;
  stats?: StatsConfig;
}

export interface MemoryStorageStats {
  objectCount: number;
  totalSize: number;
  totalSizeFormatted: string;
  keys: string[];
  bucket: string;
  maxMemoryMB: number;
  memoryUsagePercent: number;
  evictions: number;
  evictedBytes: number;
  peakMemoryBytes: number;
}

export interface FileSystemStorageStats {
  gets: number;
  puts: number;
  deletes: number;
  errors: number;
  compressionSaved: number;
  totalCompressed: number;
  totalUncompressed: number;
  avgCompressionRatio: string | number;
  features: {
    compression: boolean;
    ttl: boolean;
    locking: boolean;
    backup: boolean;
    journal: boolean;
    stats: boolean;
  };
}

export interface StorageSnapshot {
  timestamp: string;
  bucket: string;
  objectCount: number;
  objects: Record<string, {
    body: string;
    metadata: Record<string, string>;
    contentType: string;
    etag: string;
    lastModified: string;
    size: number;
    contentEncoding?: string;
    contentLength: number;
  }>;
}

export interface ReckerHttpHandlerOptions {
  connectTimeout?: number;
  headersTimeout?: number;
  bodyTimeout?: number;
  keepAlive?: boolean;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
  keepAliveTimeoutThreshold?: number;
  connections?: number;
  pipelining?: number;
  maxRequestsPerClient?: number;
  clientTtl?: number | null;
  maxCachedSessions?: number;
  localAddress?: string;
  http2?: boolean;
  http2MaxConcurrentStreams?: number;
  /** HTTP/2 preset: 'balanced' | 'performance' | 'low-latency' | 'low-memory' */
  http2Preset?: 'balanced' | 'performance' | 'low-latency' | 'low-memory';
  /** Enable Expect: 100-Continue for large uploads (bytes threshold or boolean) */
  expectContinue?: boolean | number;
  /** Enable HTTP/2 observability metrics */
  enableHttp2Metrics?: boolean;
  enableDedup?: boolean;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTimeout?: number;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  maxRetryDelay?: number;
  retryJitter?: boolean;
  respectRetryAfter?: boolean;
  /** Internal alignment with HttpClientOptions.useReckerHandler. */
  useReckerHandler?: boolean;
  /** Internal alignment with HttpClientOptions.failFastOnReckerFailure. */
  failFastOnReckerFailure?: boolean;
}

export interface CircuitStats {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export interface HandlerMetrics {
  requests: number;
  retries: number;
  deduped: number;
  circuitBreakerTrips: number;
  circuitStates?: Record<string, CircuitStats>;
  pendingDeduped?: number;
  /** HTTP/2 metrics (when enableHttp2Metrics is true) */
  http2?: {
    sessions: number;
    activeSessions: number;
    streams: number;
    activeStreams: number;
    errors: number;
  };
}

export interface AwsHttpRequest {
  protocol?: string;
  hostname: string;
  port?: number;
  path: string;
  query?: Record<string, string | string[] | null | undefined>;
  method: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
}

export interface AwsHttpResponse {
  statusCode: number;
  reason?: string;
  headers: Record<string, string>;
  body?: Readable;
}

export interface HandleOptions {
  abortSignal?: AbortSignal;
  requestTimeout?: number;
}

export interface Client extends EventEmitter {
  id: string;
  config: ClientConfig;
  connectionString: string;

  putObject(params: PutObjectParams): Promise<PutObjectResponse>;
  getObject(key: string): Promise<S3Object>;
  headObject(key: string): Promise<S3Object>;
  copyObject(params: CopyObjectParams): Promise<CopyObjectResponse>;
  exists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<DeleteObjectResponse>;
  deleteObjects(keys: string[]): Promise<DeleteObjectsResponse>;
  listObjects(params?: ListObjectsParams): Promise<ListObjectsResponse>;
  getKeysPage(params?: GetKeysPageParams): Promise<string[]>;
  getAllKeys(params?: { prefix?: string }): Promise<string[]>;
  count(params?: { prefix?: string }): Promise<number>;
  deleteAll(params?: { prefix?: string }): Promise<number>;
  getContinuationTokenAfterOffset(params?: { prefix?: string; offset?: number }): Promise<string | null>;
  moveObject(params: { from: string; to: string }): Promise<boolean>;
  moveAllObjects(params: { prefixFrom: string; prefixTo: string }): Promise<Array<{ from: string; to: string }>>;
  getQueueStats(): QueueStats | null;
  getAggregateMetrics(since?: number): unknown | null;
  destroy(): void | Promise<void>;
}
