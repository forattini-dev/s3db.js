import { TasksPool } from "../tasks/tasks-pool.class.js";
import { Plugin, type PluginConfig } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { createReplicator, validateReplicatorConfig } from "./replicators/index.js";
import { ReplicationError } from "./replicator.errors.js";
import { resolveResourceName } from "./concerns/resource-names.js";
import { createLogger, type LogLevel, type S3DBLogger } from '../concerns/logger.js';

function normalizeResourceName(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : String(name);
}

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Database {
  createResource(config: ResourceConfig): Promise<Resource>;
  resources: Record<string, Resource>;
  addHook(event: string, handler: HookHandler): void;
  removeHook(event: string, handler: HookHandler): void;
  uploadMetadataFile?(): Promise<void>;
}

interface Resource {
  name: string;
  get(id: string): Promise<Record<string, unknown>>;
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  patch(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  query(filter: Record<string, unknown>, options?: QueryOptions): Promise<Array<Record<string, unknown>>>;
  page(options: PageOptions): Promise<Array<Record<string, unknown>> | { items: Array<Record<string, unknown>> }>;
  count(filter?: Record<string, unknown>): Promise<number>;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  addHook(hook: string, handler: HookHandler): void;
  _replicatorDefaultsInstalled?: boolean;
}

interface ResourceConfig {
  name: string;
  attributes: Record<string, string>;
  behavior?: string;
  partitions?: Record<string, PartitionConfig>;
}

interface PartitionConfig {
  fields: Record<string, string>;
}

interface QueryOptions {
  limit?: number;
  offset?: number;
}

interface PageOptions {
  offset: number;
  size: number;
}

type EventHandler = (...args: unknown[]) => void | Promise<void>;
type HookHandler = (data: unknown) => unknown | Promise<unknown>;

interface Replicator {
  id: string;
  name?: string;
  driver: string;
  config: Record<string, unknown>;
  initialize(database: Database): Promise<void>;
  replicate(
    resourceName: string,
    operation: string,
    data: Record<string, unknown> | null,
    recordId: string,
    beforeData?: Record<string, unknown> | null
  ): Promise<unknown>;
  shouldReplicateResource(resourceName: string, operation?: string): boolean;
  getStatus(): Promise<ReplicatorStatus>;
  stop?(): Promise<void>;
}

interface ReplicatorStatus {
  healthy: boolean;
  lastSync?: Date;
  errorCount?: number;
}

interface ReplicatorConfig {
  driver: string;
  config?: Record<string, unknown>;
  resources: ResourcesDefinition;
  client?: unknown;
  queueUrlDefault?: string;
}

type ResourcesDefinition =
  | string[]
  | Record<string, string | ResourceMapping | TransformFn>;

interface ResourceMapping {
  resource: string;
  transform?: TransformFn;
}

type TransformFn = (data: Record<string, unknown>) => Record<string, unknown>;

interface ReplicatorPluginConfig {
  replicators: ReplicatorConfig[];
  logErrors: boolean;
  persistReplicatorLog: boolean;
  enabled: boolean;
  batchSize: number;
  maxRetries: number;
  timeout: number;
  logLevel?: string;
  replicatorConcurrency: number;
  stopConcurrency: number;
  logResourceName: string;
}

interface ReplicatorStats {
  totalReplications: number;
  totalErrors: number;
  lastSync: string | null;
}

interface LogEntry {
  id?: string;
  replicator?: string;
  replicatorId?: string;
  resource?: string;
  resourceName?: string;
  action?: string;
  operation?: string;
  data?: Record<string, unknown> | null;
  timestamp?: number;
  createdAt?: string;
  status?: string;
  error?: string | null;
  retryCount?: number;
}

interface ReplicatorItem {
  id?: string;
  resourceName: string;
  operation: string;
  recordId: string;
  data?: Record<string, unknown> | null;
  beforeData?: Record<string, unknown> | null;
  replicator?: string;
  resource?: string;
  action?: string;
  status?: string;
  error?: string | null;
  retryCount?: number;
  timestamp?: number;
  createdAt?: string;
}

interface PromiseOutcome {
  status: 'fulfilled' | 'rejected';
  value?: unknown;
  reason?: Error;
}

interface ReplicatorLogsOptions {
  resourceName?: string;
  operation?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ReplicatorPluginOptions {
  replicators?: ReplicatorConfig[];
  resourceNames?: { log?: string };
  replicatorConcurrency?: number;
  stopConcurrency?: number;
  logErrors?: boolean;
  persistReplicatorLog?: boolean;
  enabled?: boolean;
  batchSize?: number;
  maxRetries?: number;
  timeout?: number;
  replicatorLogResource?: string;
  resourceFilter?: (resourceName: string) => boolean;
  resourceAllowlist?: string[];
  resourceBlocklist?: string[];
  logLevel?: string;
  logger?: Logger;
  [key: string]: unknown;
}

export class ReplicatorPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: ReplicatorPluginConfig;
  _logResourceDescriptor: { defaultName: string; override?: string };
  logResourceName: string;
  resourceFilter: (resourceName: string) => boolean;
  replicators: Replicator[] = [];
  eventListenersInstalled: Set<string> = new Set();
  eventHandlers: Map<string, { inserted: EventHandler; updated: EventHandler; deleted: EventHandler }> = new Map();
  stats: ReplicatorStats = {
    totalReplications: 0,
    totalErrors: 0,
    lastSync: null
  };
  _afterCreateResourceHook: HookHandler | null = null;
  replicatorLog: Resource | null = null;
  _logResourceHooksInstalled = false;

  constructor(options: ReplicatorPluginOptions = {}) {
    super(options as PluginConfig);

    if (options.logger) {
      this.logger = options.logger as unknown as S3DBLogger;
    } else {
      const logLevel = (this.logLevel || 'info') as LogLevel;
      this.logger = createLogger({ name: 'ReplicatorPlugin', level: logLevel });
    }

    const typedOptions = this.options as ReplicatorPluginOptions;
    const {
      replicators = [],
      resourceNames = {},
      replicatorConcurrency,
      stopConcurrency,
      logErrors = true,
      persistReplicatorLog = false,
      enabled = true,
      batchSize = 100,
      maxRetries = 3,
      timeout = 30000,
      replicatorLogResource
    } = typedOptions;

    if (!Array.isArray(replicators) || replicators.length === 0) {
      throw new ReplicationError('ReplicatorPlugin requires replicators array', {
        operation: 'constructor',
        pluginName: 'ReplicatorPlugin',
        providedOptions: Object.keys(this.options),
        suggestion: 'Provide replicators array: new ReplicatorPlugin({ replicators: [{ driver: "s3db", resources: [...] }] })'
      });
    }

    for (const rep of replicators) {
      if (!rep.driver) {
        throw new ReplicationError('Each replicator must have a driver', {
          operation: 'constructor',
          pluginName: 'ReplicatorPlugin',
          replicatorConfig: rep,
          suggestion: 'Each replicator entry must specify a driver: { driver: "s3db", resources: {...} }'
        });
      }
      if (!rep.resources || typeof rep.resources !== 'object') {
        throw new ReplicationError('Each replicator must have resources config', {
          operation: 'constructor',
          pluginName: 'ReplicatorPlugin',
          driver: rep.driver,
          replicatorConfig: rep,
          suggestion: 'Provide resources as object or array: { driver: "s3db", resources: ["users"] } or { resources: { users: "people" } }'
        });
      }
      const resourceKeys = Array.isArray(rep.resources) ? rep.resources : Object.keys(rep.resources);
      if (resourceKeys.length === 0) {
        throw new ReplicationError('Each replicator must have at least one resource configured', {
          operation: 'constructor',
          pluginName: 'ReplicatorPlugin',
          driver: rep.driver,
          replicatorConfig: rep,
          suggestion: 'Add at least one resource to replicate: { driver: "s3db", resources: ["users"] }'
        });
      }
    }

    const resolvedReplicatorConcurrency = Number.isFinite(replicatorConcurrency)
      ? Math.max(1, Math.floor(replicatorConcurrency!))
      : 5;
    const resolvedStopConcurrency = Number.isFinite(stopConcurrency)
      ? Math.max(1, Math.floor(stopConcurrency!))
      : resolvedReplicatorConcurrency;

    this._logResourceDescriptor = {
      defaultName: 'plg_replicator_logs',
      override: resourceNames.log || replicatorLogResource
    };
    this.logResourceName = this._resolveLogResourceName();

    this.config = {
      replicators,
      logErrors,
      persistReplicatorLog,
      enabled,
      batchSize,
      maxRetries,
      timeout,
      logLevel: this.logLevel,
      replicatorConcurrency: resolvedReplicatorConcurrency,
      stopConcurrency: resolvedStopConcurrency,
      logResourceName: this.logResourceName
    };

    this.resourceFilter = this._buildResourceFilter(this.options);
  }

  private _resolveLogResourceName(): string {
    return resolveResourceName('replicator', this._logResourceDescriptor, {
      namespace: this.namespace,
      applyNamespaceToOverrides: true
    });
  }

  override onNamespaceChanged(): void {
    this.logResourceName = this._resolveLogResourceName();
    if (this.config) {
      this.config.logResourceName = this.logResourceName;
    }
  }

  filterInternalFields(obj: unknown): Record<string, unknown> {
    if (!obj || typeof obj !== 'object') return {};
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (!key.startsWith('_') && key !== '$overflow' && key !== '$before' && key !== '$after') {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  async prepareReplicationData(resource: Resource, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const complete = await this.getCompleteData(resource, data);
    return this.filterInternalFields(complete);
  }

  sanitizeBeforeData(beforeData: unknown): Record<string, unknown> | null {
    if (!beforeData) return null;
    return this.filterInternalFields(beforeData);
  }

  async getCompleteData(resource: Resource, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const [ok, err, completeRecord] = await tryFn(() => resource.get(data.id as string));
    if (ok && completeRecord) {
      return completeRecord as Record<string, unknown>;
    }

    const reason = (err as Error)?.message || 'record not found';
    this.logger.warn(
      { resource: resource?.name || 'unknown', id: data?.id, reason },
      `Falling back to provided data for ${resource?.name || 'unknown'}#${data?.id}: ${reason}`
    );

    return data;
  }

  installEventListeners(resource: Resource, database: Database, plugin: ReplicatorPlugin): void {
    if (!resource || this.eventListenersInstalled.has(resource.name) ||
        resource.name === this.logResourceName || !this._shouldManageResource(resource.name)) {
      return;
    }

    const insertHandler = async (data: Record<string, unknown>) => {
      const [ok, error] = await tryFn(async () => {
        const payload = await plugin.prepareReplicationData(resource, data);
        await plugin.processReplicatorEvent('insert', resource.name, payload.id as string, payload);
      });

      if (!ok) {
        this.logger.warn(
          { resource: resource.name, operation: 'insert', error: (error as Error).message },
          `Insert event failed for resource ${resource.name}: ${(error as Error).message}`
        );
        this.emit('plg:replicator:error', { operation: 'insert', error: (error as Error).message, resource: resource.name });
      }
    };

    const updateHandler = async (data: Record<string, unknown>, beforeData: unknown) => {
      const [ok, error] = await tryFn(async () => {
        const payload = await plugin.prepareReplicationData(resource, data);
        const beforePayload = plugin.sanitizeBeforeData(beforeData);
        await plugin.processReplicatorEvent('update', resource.name, payload.id as string, payload, beforePayload);
      });

      if (!ok) {
        this.logger.warn(
          { resource: resource.name, operation: 'update', error: (error as Error).message },
          `Update event failed for resource ${resource.name}: ${(error as Error).message}`
        );
        this.emit('plg:replicator:error', { operation: 'update', error: (error as Error).message, resource: resource.name });
      }
    };

    const deleteHandler = async (data: Record<string, unknown>) => {
      const [ok, error] = await tryFn(async () => {
        const sanitized = await plugin.prepareReplicationData(resource, data);
        await plugin.processReplicatorEvent('delete', resource.name, sanitized.id as string, sanitized);
      });

      if (!ok) {
        this.logger.warn(
          { resource: resource.name, operation: 'delete', error: (error as Error).message },
          `Delete event failed for resource ${resource.name}: ${(error as Error).message}`
        );
        this.emit('plg:replicator:error', { operation: 'delete', error: (error as Error).message, resource: resource.name });
      }
    };

    this.eventHandlers.set(resource.name, {
      inserted: insertHandler as EventHandler,
      updated: updateHandler as EventHandler,
      deleted: deleteHandler as EventHandler
    });

    resource.on('inserted', insertHandler as any);
    resource.on('updated', updateHandler as any);
    resource.on('deleted', deleteHandler as any);

    this.eventListenersInstalled.add(resource.name);
  }

  override async onInstall(): Promise<void> {
    if (!this.database) return;

    if (this.config.persistReplicatorLog) {
      const logResourceName = this.logResourceName;
      const [ok, err, logResource] = await tryFn(() => this.database!.createResource({
        name: logResourceName,
        attributes: {
          id: 'string|required',
          replicator: 'string|required',
          resource: 'string|required',
          action: 'string|required',
          data: 'json',
          timestamp: 'number|required',
          createdAt: 'string|required',
          status: 'string|required',
          error: 'string|optional'
        },
        behavior: 'truncate-data',
        partitions: {
          byDate: {
            fields: {
              createdAt: 'string|maxlength:10'
            }
          }
        }
      }));

      if (ok) {
        this.replicatorLog = logResource as Resource;
        this.installReplicatorLogHooks();
      } else {
        const existing = this.database.resources[logResourceName];
        if (existing) {
          this.replicatorLog = existing;
          this.installReplicatorLogHooks();
        } else {
          throw err;
        }
      }
    }

    await this.initializeReplicators(this.database as any);

    this.installDatabaseHooks();

    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== this.logResourceName && this._shouldManageResource(resource.name)) {
        this.installEventListeners(resource, this.database as any, this);
      }
    }
  }

  override async start(): Promise<void> {
    // Plugin is ready
  }

  installDatabaseHooks(): void {
    if (!this.database) return;

    this._afterCreateResourceHook = (resource: unknown) => {
      const res = resource as Resource;
      if (res.name !== this.logResourceName && this._shouldManageResource(res.name)) {
        this.installEventListeners(res, this.database! as any, this);
      }
    };

    (this.database as any).addHook('afterCreateResource', this._afterCreateResourceHook);
  }

  removeDatabaseHooks(): void {
    if (this._afterCreateResourceHook && this.database) {
      (this.database as any).removeHook('afterCreateResource', this._afterCreateResourceHook);
      this._afterCreateResourceHook = null;
    }
  }

  installReplicatorLogHooks(): void {
    if (!this.replicatorLog || typeof this.replicatorLog.addHook !== 'function') {
      return;
    }

    if (this.replicatorLog._replicatorDefaultsInstalled) {
      this._logResourceHooksInstalled = true;
      return;
    }

    if (this._logResourceHooksInstalled) {
      return;
    }

    const ensureInsertDefaults = (data: unknown): unknown => {
      if (!data || typeof data !== 'object') {
        return data;
      }
      this._normalizeLogEntry(data as LogEntry, { assignId: true, ensureTimestamp: true });
      return data;
    };

    const ensureUpdateDefaults = (data: unknown): unknown => {
      if (!data || typeof data !== 'object') {
        return data;
      }
      this._normalizeLogEntry(data as LogEntry, { assignId: false, ensureTimestamp: false });
      return data;
    };

    const ensurePatchDefaults = (payload: unknown): unknown => {
      if (payload && typeof payload === 'object' && (payload as { fields?: unknown }).fields && typeof (payload as { fields: unknown }).fields === 'object') {
        this._normalizeLogEntry((payload as { fields: LogEntry }).fields, { assignId: false, ensureTimestamp: false });
      }
      return payload;
    };

    this.replicatorLog.addHook('beforeInsert', ensureInsertDefaults);
    this.replicatorLog.addHook('beforeUpdate', ensureUpdateDefaults);
    this.replicatorLog.addHook('beforePatch', ensurePatchDefaults);

    this.replicatorLog._replicatorDefaultsInstalled = true;
    this._logResourceHooksInstalled = true;
  }

  async createReplicator(
    driver: string,
    config: Record<string, unknown>,
    resources: ResourcesDefinition,
    client?: unknown
  ): Promise<Replicator> {
    return await createReplicator(driver, config, resources as any, client) as unknown as Replicator;
  }

  async initializeReplicators(database: Database): Promise<void> {
    for (const replicatorConfig of this.config.replicators) {
      const { driver, config = {}, resources, client, ...otherConfig } = replicatorConfig;

      const rawResources = resources || (config as { resources?: ResourcesDefinition }).resources || {};
      const replicatorResources = this._filterResourcesDefinition(rawResources);

      if (this._resourcesDefinitionIsEmpty(replicatorResources)) {
        this.logger.warn({ driver }, `Skipping replicator for driver ${driver} due to resource filter`);
        continue;
      }

      const mergedConfig = { ...config, ...otherConfig };

      const replicator = await this.createReplicator(driver, mergedConfig, replicatorResources, client);
      if (replicator) {
        await replicator.initialize(database);
        this.replicators.push(replicator);
      }
    }
  }

  async uploadMetadataFile(database: Database): Promise<void> {
    if (typeof this.database?.uploadMetadataFile === 'function') {
      await this.database.uploadMetadataFile();
    }
  }

  async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const [ok, error, result] = await tryFn(operation);

      if (ok) {
        return result as T;
      } else {
        lastError = error as Error;
        this.logger.warn(
          { attempt, maxRetries, error: (error as Error).message },
          `Retry attempt ${attempt}/${maxRetries} failed: ${(error as Error).message}`
        );

        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * 1000;
        this.logger.warn({ delay }, `Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  private _generateLogEntryId(): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `repl-${Date.now()}-${random}`;
  }

  private _normalizeLogEntry(entry: LogEntry, options: { assignId?: boolean; ensureTimestamp?: boolean } = {}): LogEntry {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }

    const { assignId = false, ensureTimestamp = false } = options;

    if (assignId && !entry.id) {
      entry.id = this._generateLogEntryId();
    }

    const numericTimestamp = Number(entry.timestamp);
    const hasNumericTimestamp = Number.isFinite(numericTimestamp);
    if (hasNumericTimestamp) {
      entry.timestamp = numericTimestamp;
    }

    if (ensureTimestamp && !hasNumericTimestamp) {
      entry.timestamp = Date.now();
    } else if (!ensureTimestamp && entry.timestamp !== undefined && !hasNumericTimestamp) {
      entry.timestamp = Date.now();
    }

    if (!entry.createdAt && entry.timestamp) {
      const iso = new Date(entry.timestamp).toISOString();
      entry.createdAt = iso.slice(0, 10);
    }

    if (ensureTimestamp && !entry.createdAt) {
      const iso = new Date().toISOString();
      entry.createdAt = iso.slice(0, 10);
    }

    if (entry.resourceName || entry.resource) {
      const normalized = normalizeResourceName(entry.resourceName || entry.resource);
      if (normalized) {
        entry.resourceName = normalized;
        if (!entry.resource) {
          entry.resource = normalized;
        }
      }
    }

    if (!entry.action && entry.operation) {
      entry.action = entry.operation;
    }

    if (!entry.operation && entry.action) {
      entry.operation = entry.action;
    }

    if (!entry.replicator) {
      entry.replicator = entry.replicatorId || 'unknown';
    }

    let retryCount = entry.retryCount;
    if (typeof retryCount !== 'number') {
      retryCount = Number(retryCount);
    }

    if (!Number.isFinite(retryCount) || retryCount < 0) {
      entry.retryCount = 0;
    } else {
      entry.retryCount = Math.floor(retryCount);
    }

    if (!entry.status) {
      entry.status = 'pending';
    }

    if (!('error' in entry)) {
      entry.error = null;
    }

    return entry;
  }

  async logError(
    replicator: Replicator,
    resourceName: string,
    operation: string,
    recordId: string,
    data: Record<string, unknown> | null,
    error: Error
  ): Promise<void> {
    const [ok, logError] = await tryFn(async () => {
      if (this.replicatorLog) {
        const logEntry: LogEntry = {
          id: recordId ? `${resourceName}-${recordId}-${Date.now()}` : undefined,
          replicator: replicator.name || replicator.id || 'unknown',
          resource: resourceName,
          resourceName,
          action: operation,
          operation,
          data: data ? this.filterInternalFields(data) : null,
          status: 'failed',
          error: error?.message,
          retryCount: 0
        };
        this._normalizeLogEntry(logEntry, { assignId: true, ensureTimestamp: true });
        await this.replicatorLog.insert(logEntry as Record<string, unknown>);
      }
    });

    if (!ok) {
      this.logger.warn(
        { replicator: replicator.name || replicator.id, resourceName, error: (logError as Error).message },
        `Failed to log error for ${resourceName}: ${(logError as Error).message}`
      );
      this.emit('plg:replicator:log-error', {
        replicator: replicator.name || replicator.id,
        resourceName,
        operation,
        recordId,
        originalError: error.message,
        logError: (logError as Error).message
      });
    }
  }

  async processReplicatorEvent(
    operation: string,
    resourceName: string,
    recordId: string,
    data: Record<string, unknown> | null,
    beforeData: Record<string, unknown> | null = null
  ): Promise<PromiseOutcome[] | undefined> {
    if (!this.config.enabled) return;

    if (!recordId) {
      throw new ReplicationError('Replication event missing record identifier', {
        operation,
        resourceName,
        pluginName: 'ReplicatorPlugin',
        suggestion: 'Ensure the replicated record contains an id before emitting change events.'
      });
    }

    const sanitizedData = data ? this.filterInternalFields(data) : null;
    const sanitizedBefore = beforeData ? this.filterInternalFields(beforeData) : null;

    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(resourceName, operation);
      return should;
    });

    if (applicableReplicators.length === 0) {
      return;
    }

    const entries = applicableReplicators.map((replicator, index) => ({ replicator, index }));
    const outcomes: PromiseOutcome[] = new Array(entries.length);

    const poolResult = await TasksPool.map(
      entries,
      async ({ replicator, index }) => {
        const [ok, error, replicationResult] = await tryFn(async () => {
          const result = await this.retryWithBackoff(
            () => replicator.replicate(resourceName, operation, sanitizedData, recordId, sanitizedBefore),
            this.config.maxRetries
          );

          this.emit('plg:replicator:replicated', {
            replicator: replicator.name || replicator.id,
            resourceName,
            operation,
            recordId,
            result,
            success: true
          });

          this.stats.totalReplications += 1;

          return result;
        });

        if (ok) {
          outcomes[index] = { status: 'fulfilled', value: replicationResult };
          return replicationResult;
        }

        this.logger.warn(
          { replicator: replicator.name || replicator.id, resourceName, operation, error: (error as Error).message },
          `Replication failed for ${replicator.name || replicator.id} on ${resourceName}: ${(error as Error).message}`
        );

        this.emit('plg:replicator:error', {
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          error: (error as Error).message
        });

        this.stats.totalErrors += 1;

        if (this.config.logErrors && this.database) {
          await this.logError(replicator, resourceName, operation, recordId, data, error as Error);
        }

        outcomes[index] = { status: 'rejected', reason: error as Error };
        throw error;
      },
      { concurrency: this.config.replicatorConcurrency }
    );

    if (poolResult.errors.length > 0) {
      for (const poolError of poolResult.errors) {
        const { item, error } = poolError;
        if (item && typeof item.index === 'number' && !outcomes[item.index]) {
          outcomes[item.index] = { status: 'rejected', reason: error };
        }
      }
    }

    return outcomes;
  }

  async processReplicatorItem(item: ReplicatorItem): Promise<PromiseOutcome[] | undefined> {
    const applicableReplicators = this.replicators.filter(replicator => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(item.resourceName, item.operation);
      return should;
    });

    if (applicableReplicators.length === 0) {
      return;
    }

    const entries = applicableReplicators.map((replicator, index) => ({ replicator, index }));
    const outcomes: PromiseOutcome[] = new Array(entries.length);

    await TasksPool.map(
      entries,
      async ({ replicator, index }) => {
        const [wrapperOk, wrapperError] = await tryFn(async () => {
          const preparedData = item.data ? this.filterInternalFields(item.data) : null;
          const preparedBefore = item.beforeData ? this.filterInternalFields(item.beforeData) : null;
          const [ok, err, result] = await tryFn(() =>
            replicator.replicate(item.resourceName, item.operation, preparedData, item.recordId, preparedBefore)
          );

          if (!ok) {
            this.logger.warn(
              { replicator: replicator.name || replicator.id, resourceName: item.resourceName, operation: item.operation, error: (err as Error).message },
              `Replicator item processing failed for ${replicator.name || replicator.id} on ${item.resourceName}: ${(err as Error).message}`
            );

            this.emit('plg:replicator:error', {
              replicator: replicator.name || replicator.id,
              resourceName: item.resourceName,
              operation: item.operation,
              recordId: item.recordId,
              error: (err as Error).message
            });

            if (this.config.logErrors && this.database) {
              await this.logError(replicator, item.resourceName, item.operation, item.recordId, item.data || null, err as Error);
            }

            this.stats.totalErrors += 1;
            return { success: false, error: (err as Error).message };
          }

          this.emit('plg:replicator:replicated', {
            replicator: replicator.name || replicator.id,
            resourceName: item.resourceName,
            operation: item.operation,
            recordId: item.recordId,
            result,
            success: true
          });

          this.stats.totalReplications += 1;

          return { success: true, result };
        });

        if (wrapperOk) {
          outcomes[index] = { status: 'fulfilled', value: wrapperOk };
          return wrapperOk;
        }

        this.logger.warn(
          { replicator: replicator.name || replicator.id, resourceName: item.resourceName, operation: item.operation, error: (wrapperError as Error).message },
          `Wrapper processing failed for ${replicator.name || replicator.id} on ${item.resourceName}: ${(wrapperError as Error).message}`
        );

        this.emit('plg:replicator:error', {
          replicator: replicator.name || replicator.id,
          resourceName: item.resourceName,
          operation: item.operation,
          recordId: item.recordId,
          error: (wrapperError as Error).message
        });

        if (this.config.logErrors && this.database) {
          await this.logError(replicator, item.resourceName, item.operation, item.recordId, item.data || null, wrapperError as Error);
        }

        this.stats.totalErrors += 1;
        const failure = { success: false, error: (wrapperError as Error).message };
        outcomes[index] = { status: 'fulfilled', value: failure };
        return failure;
      },
      { concurrency: this.config.replicatorConcurrency }
    );

    return outcomes;
  }

  async logReplicator(item: ReplicatorItem): Promise<void> {
    const logRes = this.replicatorLog;
    if (!logRes) {
      this.emit('plg:replicator:log-failed', { error: 'replicator log resource not found', item });
      return;
    }
    const sanitizedData = item.data ? this.filterInternalFields(item.data) : {};

    const logItem: LogEntry = {
      id: item.id,
      replicator: item.replicator || 'unknown',
      resource: item.resource || item.resourceName || '',
      resourceName: item.resourceName || item.resource || '',
      action: item.operation || item.action || '',
      operation: item.operation || item.action || '',
      data: sanitizedData,
      status: item.status || 'pending',
      error: item.error || null,
      retryCount: item.retryCount || 0
    };
    if (typeof item.timestamp === 'number') {
      logItem.timestamp = item.timestamp;
    }
    if (item.createdAt) {
      logItem.createdAt = item.createdAt;
    }

    this._normalizeLogEntry(logItem, { assignId: true, ensureTimestamp: true });
    const [ok, err] = await tryFn(async () => {
      await logRes.insert(logItem as Record<string, unknown>);
    });

    if (!ok) {
      this.logger.warn({ error: (err as Error).message }, `Failed to log replicator item: ${(err as Error).message}`);
      this.emit('plg:replicator:log-failed', { error: err, item });
    }
  }

  async updateReplicatorLog(logId: string, updates: Record<string, unknown>): Promise<void> {
    if (!this.replicatorLog) return;

    const [ok, err] = await tryFn(async () => {
      await this.replicatorLog!.patch(logId, {
        ...updates,
        lastAttempt: new Date().toISOString()
      });
    });
    if (!ok) {
      this.emit('plg:replicator:update-log-failed', { error: (err as Error).message, logId, updates });
    }
  }

  async getReplicatorStats(): Promise<{
    replicators: Array<{ id: string; driver: string; config: Record<string, unknown>; status: ReplicatorStatus }>;
    stats: ReplicatorStats;
    lastSync: string | null;
  }> {
    const entries = this.replicators.map((replicator, index) => ({ replicator, index }));
    const replicatorStats: Array<{ id: string; driver: string; config: Record<string, unknown>; status: ReplicatorStatus }> = new Array(entries.length);

    const poolResult = await TasksPool.map(
      entries,
      async ({ replicator, index }) => {
        const status = await replicator.getStatus();
        const info = {
          id: replicator.id,
          driver: replicator.driver,
          config: replicator.config,
          status
        };
        replicatorStats[index] = info;
        return info;
      },
      { concurrency: this.config.replicatorConcurrency }
    );

    if (poolResult.errors.length > 0) {
      const poolError = poolResult.errors[0]!;
      const { item, error } = poolError;
      const failedReplicator = item?.replicator;
      throw new ReplicationError(`Failed to collect status for replicator ${failedReplicator?.name || failedReplicator?.id || 'unknown'}`, {
        operation: 'getReplicatorStats',
        pluginName: 'ReplicatorPlugin',
        replicatorId: failedReplicator?.id,
        driver: failedReplicator?.driver,
        original: error
      });
    }

    return {
      replicators: replicatorStats,
      stats: this.stats,
      lastSync: this.stats.lastSync
    };
  }

  async getReplicatorLogs(options: ReplicatorLogsOptions = {}): Promise<Array<Record<string, unknown>>> {
    if (!this.replicatorLog) {
      return [];
    }

    const {
      resourceName,
      operation,
      status,
      limit = 100,
      offset = 0
    } = options;

    const filter: Record<string, unknown> = {};

    if (resourceName) {
      filter.resourceName = resourceName;
    }

    if (operation) {
      filter.operation = operation;
    }

    if (status) {
      filter.status = status;
    }

    const logs = await this.replicatorLog.query(filter, { limit, offset });

    return logs || [];
  }

  async retryFailedReplicators(): Promise<{ retried: number }> {
    if (!this.replicatorLog) {
      return { retried: 0 };
    }

    const failedLogs = await this.replicatorLog.query({
      status: 'failed'
    });

    let retried = 0;

    const processResult = await TasksPool.map(
      failedLogs || [],
      async (log: Record<string, unknown>) => {
        const sanitizedData = log.data ? this.filterInternalFields(log.data) : null;
        const sanitizedBefore = (log as { beforeData?: unknown }).beforeData ? this.filterInternalFields((log as { beforeData: unknown }).beforeData) : null;

        const [ok, err, results] = await tryFn(async () => {
          return await this.processReplicatorEvent(
            log.operation as string,
            log.resourceName as string,
            log.recordId as string,
            sanitizedData,
            sanitizedBefore
          );
        });

        const isSuccessfulEntry = (entry: PromiseOutcome | undefined): boolean => {
          if (!entry || entry.status !== 'fulfilled') {
            return false;
          }
          if (entry.value && typeof entry.value === 'object' && 'success' in (entry.value as object)) {
            return (entry.value as { success: boolean }).success !== false;
          }
          return true;
        };

        if (ok && Array.isArray(results) && results.every(isSuccessfulEntry)) {
          retried += 1;
          await this.updateReplicatorLog(log.id as string, {
            status: 'success',
            error: null,
            retryCount: (log.retryCount as number) || 0,
            lastSuccessAt: new Date().toISOString()
          });
          return;
        }

        let failureMessage = (err as Error)?.message || 'Unknown replication failure';

        if (Array.isArray(results)) {
          const failureEntry = results.find((entry) => {
            if (!entry) return false;
            if (entry.status === 'rejected') return true;
            if (entry.status === 'fulfilled' && entry.value && typeof entry.value === 'object' && 'success' in (entry.value as object)) {
              return (entry.value as { success: boolean }).success === false;
            }
            return false;
          });

          if (failureEntry) {
            if (failureEntry.status === 'rejected') {
              failureMessage = failureEntry.reason?.message || failureMessage;
            } else if (failureEntry.status === 'fulfilled') {
              failureMessage = (failureEntry.value as { error?: string })?.error || failureMessage;
            }
          }
        }

        await this.updateReplicatorLog(log.id as string, {
          status: 'failed',
          error: failureMessage,
          retryCount: (Number(log.retryCount) || 0) + 1
        });
      },
      { concurrency: this.config.replicatorConcurrency }
    );

    if (processResult.errors.length) {
      for (const poolError of processResult.errors) {
        const { item, error } = poolError;
        this.logger.warn({ logId: (item as Record<string, unknown>)?.id ?? 'unknown', error: error.message }, `Failed to retry log ${(item as Record<string, unknown>)?.id ?? 'unknown'}: ${error.message}`);
      }
    }

    return { retried };
  }

  async syncAllData(replicatorId: string): Promise<void> {
    const replicator = this.replicators.find(r => r.id === replicatorId);
    if (!replicator) {
      throw new ReplicationError('Replicator not found', {
        operation: 'syncAllData',
        pluginName: 'ReplicatorPlugin',
        replicatorId,
        availableReplicators: this.replicators.map(r => r.id),
        suggestion: 'Check replicator ID or use getReplicatorStats() to list available replicators'
      });
    }

    this.stats.lastSync = new Date().toISOString();

    if (!this.database) return;

    for (const resourceName in this.database.resources) {
      if (resourceName === this.logResourceName) continue;

      if (replicator.shouldReplicateResource(resourceName)) {
        this.emit('plg:replicator:sync-resource', { resourceName, replicatorId });

        const resource = this.database.resources[resourceName]!;

        let offset = 0;
        const pageSize = this.config.batchSize || 100;

        while (true) {
          const [ok, err, page] = await tryFn(() => resource.page({ offset, size: pageSize }));

          if (!ok || !page) break;

          const records = Array.isArray(page) ? page : ((page as { items?: Array<Record<string, unknown>> }).items || []);
          if (records.length === 0) break;

          const poolResult = await TasksPool.map(
            records,
            async (record: Record<string, unknown>) => {
              const sanitizedRecord = this.filterInternalFields(record);
              const [replicateOk, replicateError, result] = await tryFn(() =>
                replicator.replicate(resourceName, 'insert', sanitizedRecord, sanitizedRecord.id as string)
              );

              if (!replicateOk) {
                this.logger.warn(
                  { replicator: replicator.name || replicator.id, resourceName, error: (replicateError as Error).message },
                  `syncAllData failed for ${replicator.name || replicator.id} on ${resourceName}: ${(replicateError as Error).message}`
                );

                this.stats.totalErrors += 1;
                this.emit('plg:replicator:error', {
                  replicator: replicator.name || replicator.id,
                  resourceName,
                  operation: 'insert',
                  recordId: sanitizedRecord.id,
                  error: (replicateError as Error).message
                });

                if (this.config.logErrors && this.database) {
                  await this.logError(replicator, resourceName, 'insert', sanitizedRecord.id as string, sanitizedRecord, replicateError as Error);
                }

                throw replicateError;
              }

              this.stats.totalReplications += 1;
              this.emit('plg:replicator:replicated', {
                replicator: replicator.name || replicator.id,
                resourceName,
                operation: 'insert',
                recordId: sanitizedRecord.id,
                result,
                success: true
              });

              return result;
            },
            { concurrency: this.config.replicatorConcurrency }
          );

          if (poolResult.errors.length > 0) {
            const poolError = poolResult.errors[0]!;
            throw poolError.error;
          }

          offset += pageSize;
        }
      }
    }

    this.emit('plg:replicator:sync-completed', { replicatorId, stats: this.stats });
  }

  override async stop(): Promise<void> {
    const [ok, error] = await tryFn(async () => {
      if (this.replicators && this.replicators.length > 0) {
        await TasksPool.map(
          this.replicators,
          async (replicator) => {
            const [replicatorOk, replicatorError] = await tryFn(async () => {
              if (replicator && typeof replicator.stop === 'function') {
                await replicator.stop();
              }
            });

            if (!replicatorOk) {
              this.logger.warn(
                { replicator: replicator.name || replicator.id, driver: replicator.driver, error: (replicatorError as Error).message },
                `Failed to stop replicator ${replicator.name || replicator.id}: ${(replicatorError as Error).message}`
              );
              this.emit('plg:replicator:stop-error', {
                replicator: replicator.name || replicator.id || 'unknown',
                driver: replicator.driver || 'unknown',
                error: (replicatorError as Error).message
              });
            }
          },
          { concurrency: this.config.stopConcurrency }
        );
      }

      this.removeDatabaseHooks();

      if (this.database && this.database.resources) {
        for (const resourceName of this.eventListenersInstalled) {
          const resource = this.database.resources[resourceName]!;
          const handlers = this.eventHandlers.get(resourceName);

          if (resource && handlers) {
            resource.off('inserted', handlers.inserted);
            resource.off('updated', handlers.updated);
            resource.off('deleted', handlers.deleted);
          }
        }
      }

      this.replicators = [];
      this.database = null as any;
      this.eventListenersInstalled.clear();
      this.eventHandlers.clear();

      this.removeAllListeners();
    });

    if (!ok) {
      this.logger.warn({ error: (error as Error).message }, `Failed to stop plugin: ${(error as Error).message}`);
      this.emit('plg:replicator:plugin-stop-error', {
        error: (error as Error).message
      });
    }
  }

  private _buildResourceFilter(options: ReplicatorPluginOptions): (resourceName: string) => boolean {
    if (typeof options.resourceFilter === 'function') {
      return options.resourceFilter;
    }

    const allow = Array.isArray(options.resourceAllowlist) ? new Set(options.resourceAllowlist.map(normalizeResourceName)) : null;
    const block = Array.isArray(options.resourceBlocklist) ? new Set(options.resourceBlocklist.map(normalizeResourceName)) : null;

    if (allow || block) {
      return (resourceName: string) => {
        const normalized = normalizeResourceName(resourceName);
        if (allow && allow.size > 0 && !allow.has(normalized)) {
          return false;
        }
        if (block && block.has(normalized)) {
          return false;
        }
        return true;
      };
    }

    return () => true;
  }

  private _shouldManageResource(resourceName: string): boolean {
    try {
      return this.resourceFilter(normalizeResourceName(resourceName));
    } catch {
      return true;
    }
  }

  private _filterResourcesDefinition(definition: ResourcesDefinition): ResourcesDefinition {
    if (!definition) return definition;

    if (Array.isArray(definition)) {
      return definition.filter((name) => this._shouldManageResource(name));
    }

    if (typeof definition === 'object') {
      const filtered: Record<string, string | ResourceMapping | TransformFn> = {};
      for (const [name, target] of Object.entries(definition)) {
        if (this._shouldManageResource(name)) {
          filtered[name] = target;
        }
      }
      return filtered;
    }

    return definition;
  }

  private _resourcesDefinitionIsEmpty(definition: ResourcesDefinition): boolean {
    if (!definition) return true;
    if (Array.isArray(definition)) {
      return definition.length === 0;
    }
    if (typeof definition === 'object') {
      return Object.keys(definition).length === 0;
    }
    return false;
  }
}
