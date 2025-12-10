import { Plugin, type PluginConfig } from './plugin.class.js';
import tryFn from '../concerns/try-fn.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { PluginError } from '../errors.js';
import { getCronManager } from '../concerns/cron-manager.js';
import { createLogger } from '../concerns/logger.js';
import type { Server, IncomingMessage, ServerResponse } from 'http';

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Resource {
  name: string;
  insert: (...args: unknown[]) => Promise<unknown>;
  _insert?: (...args: unknown[]) => Promise<unknown>;
  update: (...args: unknown[]) => Promise<unknown>;
  _update?: (...args: unknown[]) => Promise<unknown>;
  delete: (...args: unknown[]) => Promise<unknown>;
  _delete?: (...args: unknown[]) => Promise<unknown>;
  deleteMany?: (...args: unknown[]) => Promise<unknown>;
  _deleteMany?: (...args: unknown[]) => Promise<unknown>;
  get: (...args: unknown[]) => Promise<unknown>;
  _get?: (...args: unknown[]) => Promise<unknown>;
  getMany?: (...args: unknown[]) => Promise<unknown>;
  _getMany?: (...args: unknown[]) => Promise<unknown>;
  getAll: () => Promise<MetricRecord[]>;
  _getAll?: () => Promise<MetricRecord[]>;
  list: (...args: unknown[]) => Promise<unknown[]>;
  _list?: (...args: unknown[]) => Promise<unknown[]>;
  listIds?: (...args: unknown[]) => Promise<string[]>;
  _listIds?: (...args: unknown[]) => Promise<string[]>;
  count?: (...args: unknown[]) => Promise<number>;
  _count?: (...args: unknown[]) => Promise<number>;
  page?: (...args: unknown[]) => Promise<unknown>;
  _page?: (...args: unknown[]) => Promise<unknown>;
  query: (filter: Record<string, unknown>) => Promise<MetricRecord[]>;
}

interface MetricRecord {
  id: string;
  type?: string;
  resourceName?: string;
  operation?: string;
  count?: number;
  totalTime?: number;
  errors?: number;
  avgTime?: number;
  timestamp?: string;
  createdAt?: string;
  duration?: number;
  error?: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

interface OperationPool {
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface PoolTask {
  timings?: {
    execution?: number;
  };
}

interface S3Client {
  operationPool?: OperationPool;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface PluginRegistry {
  MetricsPlugin?: MetricsPlugin;
  metrics?: MetricsPlugin;
  api?: ApiPlugin;
  ApiPlugin?: ApiPlugin;
}

interface ApiPlugin {
  server?: unknown;
  config?: {
    port?: number;
  };
}

interface Database {
  client: S3Client;
  resources: Record<string, Resource>;
  pluginRegistry: PluginRegistry;
  createResource(config: ResourceConfig): Promise<Resource>;
  _createResource?: (config: ResourceConfig) => Promise<Resource>;
  addHook(event: string, handler: (resource: Resource) => void): void;
  removeHook(event: string, handler: (resource: Resource) => void): void;
}

interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  partitions?: Record<string, { fields: Record<string, string> }>;
  behavior?: string;
}

export interface PrometheusConfig {
  enabled?: boolean;
  mode?: 'auto' | 'integrated' | 'standalone';
  port?: number;
  path?: string;
  includeResourceLabels?: boolean;
  ipAllowlist?: string[];
  enforceIpAllowlist?: boolean;
}

export interface MetricsPluginOptions {
  resourceNames?: {
    metrics?: string;
    errors?: string;
    performance?: string;
  };
  resources?: {
    metrics?: string;
    errors?: string;
    performance?: string;
  };
  collectPerformance?: boolean;
  collectErrors?: boolean;
  collectUsage?: boolean;
  retentionDays?: number;
  flushInterval?: number;
  prometheus?: PrometheusConfig;
  logger?: Logger;
  logLevel?: string;
  [key: string]: unknown;
}

interface MetricsConfig {
  collectPerformance: boolean;
  collectErrors: boolean;
  collectUsage: boolean;
  retentionDays: number;
  flushInterval: number;
  prometheus: Required<PrometheusConfig>;
  logLevel?: string;
}

interface OperationMetrics {
  count: number;
  totalTime: number;
  errors: number;
}

interface PoolMetrics {
  tasksStarted: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRetried: number;
  totalExecutionTime: number;
  avgExecutionTime: number;
}

interface PerformanceEntry {
  resourceName: string;
  operation: string;
  duration: number;
  timestamp: string;
}

interface ErrorEntry {
  resourceName: string;
  operation: string;
  error: string;
  stack?: string;
  timestamp: string;
}

interface MetricsData {
  operations: Record<string, OperationMetrics>;
  pool: PoolMetrics;
  resources: Record<string, Record<string, OperationMetrics>>;
  errors: ErrorEntry[];
  performance: PerformanceEntry[];
  startTime: string;
}

interface ResourceDescriptor {
  defaultName: string;
  override?: string;
}

interface ResourceNames {
  metrics: string;
  errors: string;
  performance: string;
}

export interface MetricsQueryOptions {
  type?: string;
  resourceName?: string;
  operation?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface ErrorLogsQueryOptions {
  resourceName?: string;
  operation?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface PerformanceLogsQueryOptions {
  resourceName?: string;
  operation?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

interface OperationStats {
  count: number;
  errors: number;
  avgTime: number;
}

export interface MetricsStats {
  period: string;
  totalOperations: number;
  totalErrors: number;
  avgResponseTime: number;
  operationsByType: Record<string, OperationStats>;
  resources: Record<string, unknown>;
  pool: PoolMetrics;
  uptime: {
    startTime: string;
    duration: number;
  };
}

interface FlushTimer {
  stop?: () => void;
  destroy?: () => void;
}

interface CronTask {
  stop?: () => void;
  destroy?: () => void;
}

export class MetricsPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: MetricsConfig;
  metrics: MetricsData;
  resourceNames: ResourceNames;
  metricsResource: Resource | null = null;
  errorsResource: Resource | null = null;
  performanceResource: Resource | null = null;
  flushJobName: string | null = null;
  flushTimer: FlushTimer | null = null;
  metricsServer: Server | null = null;

  private _resourceDescriptors: Record<string, ResourceDescriptor>;

  constructor(options: MetricsPluginOptions = {}) {
    super(options as PluginConfig);

    if (options.logger) {
      this.logger = options.logger as any;
    } else {
      const logLevel = (this.logLevel || 'info') as any;
      this.logger = createLogger({ name: 'MetricsPlugin', level: logLevel });
    }

    const metricsOptions = this.options as MetricsPluginOptions;
    const {
      resourceNames = {},
      resources = {},
      collectPerformance,
      collectErrors,
      collectUsage,
      retentionDays,
      flushInterval,
      prometheus = {},
      ...rest
    } = metricsOptions;

    const resourceNamesOption = resourceNames as { metrics?: string; errors?: string; performance?: string } || {};
    const legacyResourceOption = resources as { metrics?: string; errors?: string; performance?: string } || {};
    const prometheusConfig = prometheus as PrometheusConfig || {};

    if (Object.keys(legacyResourceOption).length > 0) {
      this.logger.warn(
        {},
        '[MetricsPlugin] DEPRECATED: The "resources" option is deprecated. ' +
        'Use "resourceNames" instead: { resourceNames: { metrics: "...", errors: "...", performance: "..." } }. ' +
        'This will be removed in v17.0.'
      );
    }

    const resourceOverrides = {
      metrics: resourceNamesOption.metrics ?? legacyResourceOption.metrics,
      errors: resourceNamesOption.errors ?? legacyResourceOption.errors,
      performance: resourceNamesOption.performance ?? legacyResourceOption.performance
    };

    this._resourceDescriptors = {
      metrics: {
        defaultName: 'plg_metrics',
        override: resourceOverrides.metrics
      },
      errors: {
        defaultName: 'plg_metrics_errors',
        override: resourceOverrides.errors
      },
      performance: {
        defaultName: 'plg_metrics_performance',
        override: resourceOverrides.performance
      }
    };

    this.resourceNames = this._resolveResourceNames();

    this.config = {
      collectPerformance: collectPerformance !== false,
      collectErrors: collectErrors !== false,
      collectUsage: collectUsage !== false,
      retentionDays: retentionDays ?? 30,
      flushInterval: flushInterval ?? 60000,
      prometheus: {
        ...prometheusConfig,
        enabled: prometheusConfig.enabled !== false,
        mode: prometheusConfig.mode || 'auto',
        port: prometheusConfig.port || 9090,
        path: prometheusConfig.path || '/metrics',
        includeResourceLabels: prometheusConfig.includeResourceLabels !== false,
        ipAllowlist: prometheusConfig.ipAllowlist || [
          '127.0.0.1',
          '::1',
          '10.0.0.0/8',
          '172.16.0.0/12',
          '192.168.0.0/16'
        ],
        enforceIpAllowlist: prometheusConfig.enforceIpAllowlist !== false
      },
      logLevel: this.logLevel
    };

    this.metrics = {
      operations: {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      },
      pool: {
        tasksStarted: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        tasksRetried: 0,
        totalExecutionTime: 0,
        avgExecutionTime: 0
      },
      resources: {},
      errors: [],
      performance: [],
      startTime: new Date().toISOString()
    };
  }

  private _resolveResourceNames(): ResourceNames {
    return resolveResourceNames('metrics', this._resourceDescriptors, {
      namespace: this.namespace
    }) as unknown as ResourceNames;
  }

  override onNamespaceChanged(): void {
    this.resourceNames = this._resolveResourceNames();
  }

  override async onInstall(): Promise<void> {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return;

    const [ok] = await tryFn(async () => {
      const [ok1, , metricsResource] = await tryFn(() => this.database.createResource({
        name: this.resourceNames.metrics,
        attributes: {
          id: 'string|required',
          type: 'string|required',
          resourceName: 'string',
          operation: 'string',
          count: 'number|required',
          totalTime: 'number|required',
          errors: 'number|required',
          avgTime: 'number|required',
          timestamp: 'string|required',
          metadata: 'json',
          createdAt: 'string|required'
        },
        partitions: {
          byDate: { fields: { createdAt: 'string|maxlength:10' } }
        },
        behavior: 'body-overflow'
      }));
      this.metricsResource = ok1
        ? metricsResource as Resource
        : ((this.database as any).resources[this.resourceNames.metrics] ?? null);

      const [ok2, , errorsResource] = await tryFn(() => this.database.createResource({
        name: this.resourceNames.errors,
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          operation: 'string|required',
          error: 'string|required',
          timestamp: 'string|required',
          metadata: 'json',
          createdAt: 'string|required'
        },
        partitions: {
          byDate: { fields: { createdAt: 'string|maxlength:10' } }
        },
        behavior: 'body-overflow'
      }));
      this.errorsResource = ok2
        ? errorsResource as Resource
        : ((this.database as any).resources[this.resourceNames.errors] ?? null);

      const [ok3, , performanceResource] = await tryFn(() => this.database.createResource({
        name: this.resourceNames.performance,
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          operation: 'string|required',
          duration: 'number|required',
          timestamp: 'string|required',
          metadata: 'json',
          createdAt: 'string|required'
        },
        partitions: {
          byDate: { fields: { createdAt: 'string|maxlength:10' } }
        },
        behavior: 'body-overflow'
      }));
      this.performanceResource = ok3
        ? performanceResource as Resource
        : ((this.database as any).resources[this.resourceNames.performance] ?? null);
    });

    if (!ok) {
      this.metricsResource = (this.database as any).resources[this.resourceNames.metrics] ?? null;
      this.errorsResource = (this.database as any).resources[this.resourceNames.errors] ?? null;
      this.performanceResource = (this.database as any).resources[this.resourceNames.performance] ?? null;
    }

    this.installDatabaseHooks();
    this.installMetricsHooks();

    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
      this.startFlushTimer();
    }
  }

  override async start(): Promise<void> {
    await this._setupPrometheusExporter();
    this._setupOperationPoolListeners();
  }

  private _setupOperationPoolListeners(): void {
    const client = this.database?.client as S3Client | undefined;
    if (!client || !client.operationPool) {
      return;
    }

    client.on('pool:taskStarted', () => {
      this.metrics.pool.tasksStarted++;
    });

    client.on('pool:taskCompleted', (_task: unknown, _result: unknown) => {
      this.metrics.pool.tasksCompleted++;
      const task = _task as PoolTask;

      if (task.timings?.execution) {
        this.metrics.pool.totalExecutionTime += task.timings.execution;
        this.metrics.pool.avgExecutionTime =
          this.metrics.pool.totalExecutionTime / this.metrics.pool.tasksCompleted;
      }
    });

    client.on('pool:taskError', () => {
      this.metrics.pool.tasksFailed++;
    });

    client.on('pool:taskRetry', () => {
      this.metrics.pool.tasksRetried++;
    });

    this.logger.debug({}, 'OperationPool event listeners registered');
  }

  override async stop(): Promise<void> {
    if (this.flushJobName) {
      const cronManager = getCronManager();
      cronManager.stop(this.flushJobName);
      this.flushJobName = null;
    }

    if (this.flushTimer) {
      const clearFn = (
        (globalThis as Record<string, unknown>)?.originalClearInterval ||
        (globalThis as Record<string, unknown>)?.clearInterval ||
        clearInterval
      ) as typeof clearInterval;

      if (typeof this.flushTimer?.stop === 'function') {
        try {
          this.flushTimer.stop();
        } catch (err) {
          const error = err as Error;
          this.logger.warn({ error: error?.message || err }, `Error stopping flush timer: ${error?.message || err}`);
        }
      }

      if (typeof this.flushTimer?.destroy === 'function') {
        try {
          this.flushTimer.destroy();
        } catch (err) {
          const error = err as Error;
          this.logger.warn({ error: error?.message || err }, `Error destroying flush timer: ${error?.message || err}`);
        }
      }

      if (typeof this.flushTimer === 'object' && !this.flushTimer?.stop && !this.flushTimer?.destroy) {
        try {
          clearFn(this.flushTimer as unknown as ReturnType<typeof setInterval>);
        } catch {
          // Ignore legacy timers that can't be cleared
        }
      }

      this.flushTimer = null;
    }

    if (this.metricsServer) {
      await new Promise<void>((resolve) => {
        this.metricsServer!.close(() => {
          this.logger.debug({}, 'Standalone metrics server stopped');
          this.metricsServer = null;
          resolve();
        });
      });
    }

    this.removeDatabaseHooks();
  }

  installDatabaseHooks(): void {
    (this.database as any).addHook('afterCreateResource', (resource: Resource) => {
      if (!this.isInternalResource(resource.name)) {
        this.installResourceHooks(resource);
      }
    });
  }

  removeDatabaseHooks(): void {
    (this.database as any).removeHook('afterCreateResource', this.installResourceHooks.bind(this));
  }

  isInternalResource(resourceName: string): boolean {
    return Object.values(this.resourceNames).includes(resourceName);
  }

  installMetricsHooks(): void {
    const db = this.database as any;
    for (const resource of Object.values(db.resources || {}) as Resource[]) {
      if (this.isInternalResource(resource.name)) {
        continue;
      }

      this.installResourceHooks(resource);
    }

    db._createResource = db.createResource;
    const self = this;
    db.createResource = async function(...args: [ResourceConfig]) {
      const resource = await this._createResource!(...args);
      if (this.pluginRegistry?.metrics && !this.pluginRegistry.metrics.isInternalResource(resource.name)) {
        this.pluginRegistry.metrics.installResourceHooks(resource);
      }
      return resource;
    };
  }

  installResourceHooks(resource: Resource): void {
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    resource._get = resource.get;
    resource._getMany = resource.getMany;
    resource._getAll = resource.getAll;
    resource._list = resource.list;
    resource._listIds = resource.listIds;
    resource._count = resource.count;
    resource._page = resource.page;

    const self = this;

    resource.insert = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._insert!(...args));
      self.recordOperation(resource.name, 'insert', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'insert', err as Error);
      if (!ok) throw err;
      return result;
    };

    resource.update = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._update!(...args));
      self.recordOperation(resource.name, 'update', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'update', err as Error);
      if (!ok) throw err;
      return result;
    };

    resource.delete = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._delete!(...args));
      self.recordOperation(resource.name, 'delete', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'delete', err as Error);
      if (!ok) throw err;
      return result;
    };

    resource.deleteMany = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._deleteMany!(...args));
      self.recordOperation(resource.name, 'delete', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'delete', err as Error);
      if (!ok) throw err;
      return result;
    };

    resource.get = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._get!(...args));
      self.recordOperation(resource.name, 'get', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'get', err as Error);
      if (!ok) throw err;
      return result;
    };

    resource.getMany = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getMany!(...args));
      self.recordOperation(resource.name, 'get', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'get', err as Error);
      if (!ok) throw err;
      return result;
    };

    resource.getAll = async function() {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getAll!());
      self.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'list', err as Error);
      if (!ok) throw err;
      return result as MetricRecord[];
    };

    resource.list = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._list!(...args));
      self.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'list', err as Error);
      if (!ok) throw err;
      return result as unknown[];
    };

    resource.listIds = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._listIds!(...args));
      self.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'list', err as Error);
      if (!ok) throw err;
      return result as string[];
    };

    resource.count = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._count!(...args));
      self.recordOperation(resource.name, 'count', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'count', err as Error);
      if (!ok) throw err;
      return result as number;
    };

    resource.page = async function(...args: unknown[]) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._page!(...args));
      self.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) self.recordError(resource.name, 'list', err as Error);
      if (!ok) throw err;
      return result;
    };
  }

  recordOperation(resourceName: string, operation: string, duration: number, isError: boolean): void {
    if (this.metrics.operations[operation]) {
      this.metrics.operations[operation].count++;
      this.metrics.operations[operation].totalTime += duration;
      if (isError) {
        this.metrics.operations[operation].errors++;
      }
    }

    if (!this.metrics.resources[resourceName]) {
      this.metrics.resources[resourceName] = {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      };
    }

    if (this.metrics.resources[resourceName][operation]) {
      this.metrics.resources[resourceName][operation].count++;
      this.metrics.resources[resourceName][operation].totalTime += duration;
      if (isError) {
        this.metrics.resources[resourceName][operation].errors++;
      }
    }

    if (this.config.collectPerformance) {
      this.metrics.performance.push({
        resourceName,
        operation,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  }

  recordError(resourceName: string, operation: string, error: Error): void {
    if (!this.config.collectErrors) return;

    this.metrics.errors.push({
      resourceName,
      operation,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  startFlushTimer(): void {
    if (this.flushJobName) {
      const cronManager = getCronManager();
      cronManager.stop(this.flushJobName);
      this.flushJobName = null;
    }
    this.flushTimer = null;

    if (this.config.flushInterval > 0) {
      const cronManager = getCronManager();
      const jobName = `metrics-flush-${Date.now()}`;
      this.flushJobName = jobName;

      this.flushTimer = {
        stop: () => cronManager.stop(jobName),
        destroy: () => cronManager.stop(jobName),
      };

      cronManager.scheduleInterval(
        this.config.flushInterval,
        () => this.flushMetrics().catch(() => {}),
        jobName
      ).then((task: CronTask | null) => {
        if (task && typeof task === 'object') {
          this.flushTimer = task;
        }
      }).catch((error: Error) => {
        this.logger.warn({ error: error?.message || error }, `Failed to schedule flush timer: ${error?.message || error}`);
        this.flushJobName = null;
        this.flushTimer = null;
      });
    }
  }

  async flushMetrics(): Promise<void> {
    if (!this.metricsResource) return;

    const [ok] = await tryFn(async () => {
      let metadata: Record<string, string>;
      let perfMetadata: Record<string, string>;
      let errorMetadata: Record<string, string>;
      let resourceMetadata: Record<string, string>;

      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        metadata = {};
        perfMetadata = {};
        errorMetadata = {};
        resourceMetadata = {};
      } else {
        metadata = { global: 'true' };
        perfMetadata = { perf: 'true' };
        errorMetadata = { error: 'true' };
        resourceMetadata = { resource: 'true' };
      }

      const now = new Date();
      const createdAt = now.toISOString().slice(0, 10);

      for (const [operation, data] of Object.entries(this.metrics.operations)) {
        if (data.count > 0) {
          await this.metricsResource!.insert({
            id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'operation',
            resourceName: 'global',
            operation,
            count: data.count,
            totalTime: data.totalTime,
            errors: data.errors,
            avgTime: data.count > 0 ? data.totalTime / data.count : 0,
            timestamp: now.toISOString(),
            createdAt,
            metadata
          });
        }
      }

      for (const [resourceName, operations] of Object.entries(this.metrics.resources)) {
        for (const [operation, data] of Object.entries(operations)) {
          if (data.count > 0) {
            await this.metricsResource!.insert({
              id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'operation',
              resourceName,
              operation,
              count: data.count,
              totalTime: data.totalTime,
              errors: data.errors,
              avgTime: data.count > 0 ? data.totalTime / data.count : 0,
              timestamp: now.toISOString(),
              createdAt,
              metadata: resourceMetadata
            });
          }
        }
      }

      if (this.config.collectPerformance && this.metrics.performance.length > 0) {
        for (const perf of this.metrics.performance) {
          await this.performanceResource!.insert({
            id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: perf.resourceName,
            operation: perf.operation,
            duration: perf.duration,
            timestamp: perf.timestamp,
            createdAt: perf.timestamp.slice(0, 10),
            metadata: perfMetadata
          });
        }
      }

      if (this.config.collectErrors && this.metrics.errors.length > 0) {
        for (const error of this.metrics.errors) {
          await this.errorsResource!.insert({
            id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: error.resourceName,
            operation: error.operation,
            error: error.error,
            stack: error.stack,
            timestamp: error.timestamp,
            createdAt: error.timestamp.slice(0, 10),
            metadata: errorMetadata
          });
        }
      }

      this.resetMetrics();
    });
  }

  resetMetrics(): void {
    for (const operation of Object.keys(this.metrics.operations)) {
      this.metrics.operations[operation] = { count: 0, totalTime: 0, errors: 0 };
    }

    for (const resourceName of Object.keys(this.metrics.resources)) {
      for (const operation of Object.keys(this.metrics.resources[resourceName]!)) {
        this.metrics.resources[resourceName]![operation] = { count: 0, totalTime: 0, errors: 0 };
      }
    }

    this.metrics.performance = [];
    this.metrics.errors = [];
  }

  async getMetrics(options: MetricsQueryOptions = {}): Promise<MetricRecord[]> {
    const {
      type = 'operation',
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    if (!this.metricsResource) return [];

    const allMetrics = await this.metricsResource.getAll();

    let filtered = allMetrics.filter((metric: MetricRecord) => {
      if (type && metric.type !== type) return false;
      if (resourceName && metric.resourceName !== resourceName) return false;
      if (operation && metric.operation !== operation) return false;
      if (startDate && new Date(metric.timestamp!) < new Date(startDate)) return false;
      if (endDate && new Date(metric.timestamp!) > new Date(endDate)) return false;
      return true;
    });

    filtered.sort((a: MetricRecord, b: MetricRecord) =>
      new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()
    );

    return filtered.slice(offset, offset + limit);
  }

  async getErrorLogs(options: ErrorLogsQueryOptions = {}): Promise<MetricRecord[]> {
    if (!this.errorsResource) return [];

    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    const allErrors = await this.errorsResource.getAll();

    let filtered = allErrors.filter((error: MetricRecord) => {
      if (resourceName && error.resourceName !== resourceName) return false;
      if (operation && error.operation !== operation) return false;
      if (startDate && new Date(error.timestamp!) < new Date(startDate)) return false;
      if (endDate && new Date(error.timestamp!) > new Date(endDate)) return false;
      return true;
    });

    filtered.sort((a: MetricRecord, b: MetricRecord) =>
      new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()
    );

    return filtered.slice(offset, offset + limit);
  }

  async getPerformanceLogs(options: PerformanceLogsQueryOptions = {}): Promise<MetricRecord[]> {
    if (!this.performanceResource) return [];

    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    const allPerformance = await this.performanceResource.getAll();

    let filtered = allPerformance.filter((perf: MetricRecord) => {
      if (resourceName && perf.resourceName !== resourceName) return false;
      if (operation && perf.operation !== operation) return false;
      if (startDate && new Date(perf.timestamp!) < new Date(startDate)) return false;
      if (endDate && new Date(perf.timestamp!) > new Date(endDate)) return false;
      return true;
    });

    filtered.sort((a: MetricRecord, b: MetricRecord) =>
      new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()
    );

    return filtered.slice(offset, offset + limit);
  }

  async getStats(): Promise<MetricsStats> {
    const now = new Date();
    const startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));

    const [metrics, errors] = await Promise.all([
      this.getMetrics({ startDate: startDate.toISOString() }),
      this.getErrorLogs({ startDate: startDate.toISOString() }),
      this.getPerformanceLogs({ startDate: startDate.toISOString() })
    ]);

    const stats: MetricsStats = {
      period: '24h',
      totalOperations: 0,
      totalErrors: errors.length,
      avgResponseTime: 0,
      operationsByType: {},
      resources: {},
      pool: this.metrics.pool,
      uptime: {
        startTime: this.metrics.startTime,
        duration: now.getTime() - new Date(this.metrics.startTime).getTime()
      }
    };

    for (const metric of metrics) {
      if (metric.type === 'operation') {
        stats.totalOperations += metric.count || 0;

        if (!stats.operationsByType[metric.operation!]) {
          stats.operationsByType[metric.operation!] = {
            count: 0,
            errors: 0,
            avgTime: 0
          };
        }

        stats.operationsByType[metric.operation!]!.count += metric.count || 0;
        stats.operationsByType[metric.operation!]!.errors += metric.errors || 0;

        const current = stats.operationsByType[metric.operation!]!;
        const totalCount = current.count;
        const newAvg = ((current.avgTime * (totalCount - (metric.count || 0))) + (metric.totalTime || 0)) / totalCount;
        current.avgTime = newAvg;
      }
    }

    const totalTime = metrics.reduce((sum, m) => sum + (m.totalTime || 0), 0);
    const totalCount = metrics.reduce((sum, m) => sum + (m.count || 0), 0);
    stats.avgResponseTime = totalCount > 0 ? totalTime / totalCount : 0;

    return stats;
  }

  async cleanupOldData(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

    const datesToDelete: string[] = [];
    const startDate = new Date(cutoffDate);
    startDate.setDate(startDate.getDate() - 365);

    for (let d = new Date(startDate); d < cutoffDate; d.setDate(d.getDate() + 1)) {
      datesToDelete.push(d.toISOString().slice(0, 10));
    }

    if (this.metricsResource) {
      for (const dateStr of datesToDelete) {
        const [ok, , oldMetrics] = await tryFn(() =>
          this.metricsResource!.query({ createdAt: dateStr })
        );
        if (ok && oldMetrics) {
          for (const metric of oldMetrics) {
            await tryFn(() => this.metricsResource!.delete(metric.id));
          }
        }
      }
    }

    if (this.errorsResource) {
      for (const dateStr of datesToDelete) {
        const [ok, , oldErrors] = await tryFn(() =>
          this.errorsResource!.query({ createdAt: dateStr })
        );
        if (ok && oldErrors) {
          for (const error of oldErrors) {
            await tryFn(() => this.errorsResource!.delete(error.id));
          }
        }
      }
    }

    if (this.performanceResource) {
      for (const dateStr of datesToDelete) {
        const [ok, , oldPerformance] = await tryFn(() =>
          this.performanceResource!.query({ createdAt: dateStr })
        );
        if (ok && oldPerformance) {
          for (const perf of oldPerformance) {
            await tryFn(() => this.performanceResource!.delete(perf.id));
          }
        }
      }
    }
  }

  async getPrometheusMetrics(): Promise<string> {
    const { formatPrometheusMetrics } = await import('./concerns/prometheus-formatter.js');
    return formatPrometheusMetrics(this);
  }

  private async _setupPrometheusExporter(): Promise<void> {
    if (!this.config.prometheus.enabled) {
      return;
    }

    const mode = this.config.prometheus.mode;
    const registry = (this.database as any).pluginRegistry as PluginRegistry | undefined;
    const apiPlugin = registry?.api || registry?.ApiPlugin;

    if (mode === 'auto') {
      if (apiPlugin && (apiPlugin as ApiPlugin).server) {
        await this._setupIntegratedMetrics(apiPlugin as ApiPlugin);
      } else {
        await this._setupStandaloneMetrics();
      }
    } else if (mode === 'integrated') {
      if (!apiPlugin || !(apiPlugin as ApiPlugin).server) {
        throw new PluginError('[Metrics Plugin] prometheus.mode=integrated requires API Plugin to be active', {
          pluginName: 'MetricsPlugin',
          operation: '_setupPrometheusExporter',
          statusCode: 400,
          retriable: false,
          suggestion: 'Install and start the API plugin or switch prometheus.mode to "standalone" or "auto".'
        });
      }
      await this._setupIntegratedMetrics(apiPlugin as ApiPlugin);
    } else if (mode === 'standalone') {
      await this._setupStandaloneMetrics();
    } else {
      (this.logger as any).warn(
        { mode },
        `[Metrics Plugin] Unknown prometheus.mode="${mode}". Valid modes: auto, integrated, standalone`
      );
    }
  }

  private async _setupIntegratedMetrics(apiPlugin: ApiPlugin): Promise<void> {
    const port = apiPlugin.config?.port || 3000;
    const path = this.config.prometheus.path;

    this.logger.debug(
      { port, path, mode: 'integrated', auth: 'public' },
      `Prometheus metrics will be available at http://localhost:${port}${path} (integrated mode)`
    );
    this.logger.debug({}, 'Route registered by APIPlugin (public, no auth required)');
  }

  private async _setupStandaloneMetrics(): Promise<void> {
    const { createServer } = await import('http');
    const port = this.config.prometheus.port;
    const path = this.config.prometheus.path;
    const enforceIpAllowlist = this.config.prometheus.enforceIpAllowlist;
    const ipAllowlist = this.config.prometheus.ipAllowlist || [];

    let isIpAllowed: ((ip: string, allowlist: string[]) => boolean) | undefined;
    if (enforceIpAllowlist) {
      const ipHelper = await import('./concerns/ip-allowlist.js');
      isIpAllowed = ipHelper.isIpAllowed;
    }

    this.metricsServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.url === path && req.method === 'GET') {
        if (enforceIpAllowlist && isIpAllowed) {
          const forwarded = req.headers['x-forwarded-for'];
          const clientIp = forwarded
            ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])?.trim()
            : req.socket.remoteAddress;

          if (!clientIp || !isIpAllowed(clientIp, ipAllowlist)) {
            this.logger.warn(
              { clientIp: clientIp || 'unknown', endpoint: '/metrics' },
              `Blocked /metrics request from unauthorized IP: ${clientIp || 'unknown'}`
            );
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
          }
        }

        try {
          const metrics = await this.getPrometheusMetrics();
          res.writeHead(200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
            'Content-Length': Buffer.byteLength(metrics, 'utf8')
          });
          res.end(metrics);
        } catch (err) {
          this.logger.error({ error: err }, '[Metrics Plugin] Error generating Prometheus metrics');
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      } else if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    this.metricsServer.listen(port, '0.0.0.0', () => {
      const ipFilter = enforceIpAllowlist ? ` (IP allowlist: ${ipAllowlist.length} ranges)` : ' (no IP filtering)';
      this.logger.debug(
        { port, path, mode: 'standalone', ipFilterEnabled: enforceIpAllowlist, ipRangesCount: ipAllowlist.length },
        `Prometheus metrics available at http://0.0.0.0:${port}${path} (standalone mode)${ipFilter}`
      );
    });

    this.metricsServer.on('error', (err: Error & { code?: string }) => {
      this.logger.error({ error: err.message, code: err.code }, `Standalone metrics server error: ${err.message}`);
    });
  }
}
