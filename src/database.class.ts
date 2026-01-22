import tryFn, { tryFnSync } from './concerns/try-fn.js';
import { S3Client } from './clients/s3-client.class.js';
import { MemoryClient } from './clients/memory-client.class.js';
import { FileSystemClient } from './clients/filesystem-client.class.js';
import { ConnectionString } from './connection-string.class.js';
import Resource from './resource.class.js';
import { idGenerator } from './concerns/id.js';
import { ProcessManager } from './concerns/process-manager.js';
import { SafeEventEmitter } from './concerns/safe-event-emitter.js';
import { CronManager } from './concerns/cron-manager.js';
import { createLogger, getLoggerOptionsFromEnv, type Logger } from './concerns/logger.js';

import { DatabaseHooks } from './database/database-hooks.class.js';
import { DatabaseCoordinators } from './database/database-coordinators.class.js';
import { DatabaseRecovery } from './database/database-recovery.class.js';
import { DatabaseMetadata } from './database/database-metadata.class.js';
import { DatabasePlugins } from './database/database-plugins.class.js';
import { DatabaseResources, type CreateResourceConfig, type HashExistsResult } from './database/database-resources.class.js';
import { DatabaseConnection } from './database/database-connection.class.js';

import type { Client } from './clients/types.js';
import type { BehaviorType } from './behaviors/types.js';
import type { LogLevel, StringRecord } from './types/common.types.js';
import type { ResourceExport } from './resource.class.js';
import type { PartitionsConfig } from './core/resource-query.class.js';
import type { AttributesSchema } from './core/resource-validator.class.js';
import type {
  ExecutorPoolConfig,
  AutotuneConfig,
  MonitoringConfig,
  TaskExecutorMonitoringConfig,
  LoggerConfig,
  ClientOptions,
  CacheConfig,
  SavedMetadata,
  ResourceMetadata,
  VersionData,
  HookSummary,
  DefinitionChange,
  GlobalCoordinatorOptions,
  GlobalCoordinatorService,
  MemorySnapshot,
  HookEventName,
  DatabaseHookFunction,
  Plugin,
  PluginConstructor
} from './database/types.js';

export type {
  ExecutorPoolConfig,
  AutotuneConfig,
  MonitoringConfig,
  TaskExecutorMonitoringConfig,
  LoggerConfig,
  ClientOptions,
  CacheConfig,
  SavedMetadata,
  ResourceMetadata,
  VersionData,
  HookSummary,
  DefinitionChange,
  GlobalCoordinatorOptions,
  GlobalCoordinatorService,
  MemorySnapshot,
  HookEventName,
  DatabaseHookFunction,
  Plugin,
  PluginConstructor,
  CreateResourceConfig,
  HashExistsResult
};

export type { ResourceApiConfig } from './database/database-resources.class.js';

export interface DatabaseOptions {
  connectionString?: string;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  client?: Client;
  clientOptions?: ClientOptions;
  plugins?: PluginConstructor[];
  cache?: CacheConfig | boolean;
  passphrase?: string;
  bcryptRounds?: number;
  versioningEnabled?: boolean;
  strictValidation?: boolean;
  strictHooks?: boolean;
  disableResourceEvents?: boolean;
  deferMetadataWrites?: boolean;
  metadataWriteDelay?: number;
  parallelism?: number | string;
  executorPool?: ExecutorPoolConfig | false;
  taskExecutorMonitoring?: TaskExecutorMonitoringConfig;
  logLevel?: LogLevel;
  loggerOptions?: LoggerConfig;
  logger?: Logger;
  processManager?: ProcessManager;
  cronManager?: CronManager;
  exitOnSignal?: boolean;
  autoCleanup?: boolean;
}

export class Database extends SafeEventEmitter {
  public id: string;
  public version: string;
  public s3dbVersion: string;
  public resources: StringRecord<Resource>;
  public savedMetadata: SavedMetadata | null;
  public databaseOptions!: DatabaseOptions;
  public executorPool: ExecutorPoolConfig;
  public taskExecutor: ExecutorPoolConfig;
  public pluginList: PluginConstructor[];
  public pluginRegistry: StringRecord<Plugin>;
  public plugins: StringRecord<Plugin>;
  public cache: CacheConfig | boolean | undefined;
  public passphrase: string;
  public bcryptRounds: number;
  public versioningEnabled: boolean;
  public strictValidation: boolean;
  public strictHooks: boolean;
  public disableResourceEvents: boolean;
  public deferMetadataWrites: boolean;
  public metadataWriteDelay: number;
  public processManager: ProcessManager;
  public cronManager: CronManager;
  public logLevel: string;
  public override logger: Logger;
  public client!: Client;
  public connectionString: string | undefined;
  public bucket!: string;
  public keyPrefix!: string;

  public _resourcesMap: StringRecord<Resource>;

  private _parallelism: number;
  private _childLoggerLevels: StringRecord<LogLevel>;

  private _hooksModule: DatabaseHooks;
  private _coordinatorsModule: DatabaseCoordinators;
  private _recoveryModule: DatabaseRecovery;
  private _metadataModule: DatabaseMetadata;
  private _pluginsModule: DatabasePlugins;
  private _resourcesModule: DatabaseResources;
  private _connectionModule: DatabaseConnection;

  constructor(options: DatabaseOptions) {
    super({
      logLevel: options.logLevel || options.loggerOptions?.level || 'info',
      autoCleanup: options.autoCleanup !== false
    });

    this.id = (() => {
      const [ok, , id] = tryFnSync(() => idGenerator(7));
      return ok && id ? id : `db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    })();

    this.version = '1';
    this.s3dbVersion = (() => {
      const [ok, , version] = tryFnSync(() => (typeof (globalThis as any)['__PACKAGE_VERSION__'] !== 'undefined' && (globalThis as any)['__PACKAGE_VERSION__'] !== '__PACKAGE_VERSION__'
        ? (globalThis as any)['__PACKAGE_VERSION__']
        : 'latest'));
      return ok ? version : 'latest';
    })();

    this._resourcesMap = {};
    this.resources = new Proxy(this._resourcesMap, {
      get: (target, prop) => {
        if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') {
          return (target as any)[prop];
        }

        if ((target as any)[prop]) {
          return (target as any)[prop];
        }

        return undefined;
      },

      ownKeys: (target) => {
        return Object.keys(target);
      },

      getOwnPropertyDescriptor: (target, prop) => {
        return Object.getOwnPropertyDescriptor(target, prop);
      }
    }) as StringRecord<Resource>;

    this.savedMetadata = null;
    this.databaseOptions = options;

    const executorPoolConfig = options?.executorPool;

    this._parallelism = this._normalizeParallelism(
      options?.parallelism ?? (executorPoolConfig as any)?.concurrency,
      10
    );

    this.logLevel = options.logLevel || options.loggerOptions?.level || 'info';

    const loggerOptions: LoggerConfig = { ...(options.loggerOptions || {}) };
    if (options.logLevel) {
      loggerOptions.level = options.logLevel;
    }

    if (options.logger) {
      this.logger = options.logger;
      if (options.logLevel) {
        this.logger.level = options.logLevel;
      }
    } else {
      const loggerConfig = getLoggerOptionsFromEnv(loggerOptions as any);
      this.logger = createLogger({
        name: 'Database',
        ...loggerConfig
      });
    }

    this._childLoggerLevels = options.loggerOptions?.childLevels || {};

    this.executorPool = this._normalizeOperationsPool(executorPoolConfig, this._parallelism);
    if (options?.taskExecutorMonitoring) {
      this.executorPool.monitoring = this._deepMerge(
        this.executorPool.monitoring || {},
        options.taskExecutorMonitoring as unknown as MonitoringConfig
      );
    }
    this._parallelism = this.executorPool?.concurrency ?? this._parallelism;
    this.taskExecutor = this.executorPool;
    this.pluginList = options.plugins ?? [];
    this.pluginRegistry = {};
    this.plugins = this.pluginRegistry;
    this.cache = options.cache;
    this.passphrase = options.passphrase ?? 'secret';
    this.bcryptRounds = options.bcryptRounds ?? 10;
    this.versioningEnabled = options.versioningEnabled ?? false;
    this.strictValidation = (options.strictValidation ?? true) !== false;
    this.strictHooks = options.strictHooks ?? false;
    this.disableResourceEvents = options.disableResourceEvents === true;

    this.deferMetadataWrites = options.deferMetadataWrites ?? false;
    this.metadataWriteDelay = options.metadataWriteDelay ?? 100;

    const exitOnSignal = (options.exitOnSignal ?? true) !== false;
    this.processManager = options.processManager ?? new ProcessManager({
      logLevel: this.logger.level as LogLevel,
      exitOnSignal
    });

    this.cronManager = options.cronManager ?? new CronManager({
      logLevel: this.logger.level as LogLevel,
      exitOnSignal
    });

    this._initializeClient(options);

    this._hooksModule = new DatabaseHooks(this as any);
    this._coordinatorsModule = new DatabaseCoordinators(this as any);
    this._recoveryModule = new DatabaseRecovery(this as any);
    this._metadataModule = new DatabaseMetadata(this as any);
    this._pluginsModule = new DatabasePlugins(this as any, this._coordinatorsModule);
    this._resourcesModule = new DatabaseResources(this as any, this._metadataModule, this._coordinatorsModule);
    this._connectionModule = new DatabaseConnection(
      this as any,
      this._metadataModule,
      this._recoveryModule,
      this._pluginsModule,
      this._coordinatorsModule
    );

    this._connectionModule.registerExitListener();
  }

  private _initializeClient(options: DatabaseOptions): void {
    let connectionString = options.connectionString;
    if (!connectionString && (options.bucket || options.accessKeyId || options.secretAccessKey)) {
      const { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = options;

      if (endpoint) {
        const url = new URL(endpoint);
        if (accessKeyId) url.username = encodeURIComponent(accessKeyId);
        if (secretAccessKey) url.password = encodeURIComponent(secretAccessKey);
        url.pathname = `/${bucket || 's3db'}`;

        if (forcePathStyle) {
          url.searchParams.set('forcePathStyle', 'true');
        }

        connectionString = url.toString();
      } else if (accessKeyId && secretAccessKey) {
        const params = new URLSearchParams();
        params.set('region', region || 'us-east-1');
        if (forcePathStyle) {
          params.set('forcePathStyle', 'true');
        }
        connectionString = `s3://${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@${bucket || 's3db'}?${params.toString()}`;
      }
    }

    let mergedClientOptions: ClientOptions = {};
    let connStr: ConnectionString | null = null;

    if (options.clientOptions) {
      mergedClientOptions = { ...options.clientOptions };
    }

    if (connectionString) {
      try {
        connStr = new ConnectionString(connectionString);
        if ((connStr as any).clientOptions && Object.keys((connStr as any).clientOptions).length > 0) {
          mergedClientOptions = this._deepMerge(mergedClientOptions, (connStr as any).clientOptions);
        }
      } catch {
        // If parsing fails, continue without querystring params
      }
    }

    if (!options.client && connectionString) {
      try {
        const url = new URL(connectionString);
        if (url.protocol === 'memory:') {
          const bucketHost = url.hostname || 'test-bucket';
          const [okBucket, , decodedBucket] = tryFnSync(() => decodeURIComponent(bucketHost));
          const bucket = okBucket ? decodedBucket : bucketHost;
          const rawPrefix = url.pathname ? url.pathname.substring(1) : '';
          const [okPrefix, , decodedPrefix] = tryFnSync(() => decodeURIComponent(rawPrefix));
          const keyPrefix = okPrefix ? decodedPrefix : rawPrefix;

          const memoryOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
            bucket,
            keyPrefix,
            logLevel: this.logger.level,
          }, mergedClientOptions as any) as any);
          this.client = new MemoryClient(memoryOptions) as Client;
        } else if (url.protocol === 'file:') {
          const filesystemOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
            basePath: (connStr as any)?.basePath,
            bucket: (connStr as any)?.bucket,
            keyPrefix: (connStr as any)?.keyPrefix,
            logLevel: this.logger.level,
          }, mergedClientOptions as any) as any);
          this.client = new FileSystemClient(filesystemOptions) as Client;
        } else {
          const s3ClientOptions = this._deepMerge({
            logLevel: this.logger.level,
            logger: this.getChildLogger('S3Client'),
            connectionString: connectionString,
          }, mergedClientOptions as any) as any;
          s3ClientOptions.executorPool = this._deepMerge(
            (s3ClientOptions as any).executorPool || {},
            this.executorPool
          );
          this.client = new S3Client(s3ClientOptions) as unknown as Client;
        }
      } catch {
        const s3ClientOptions = this._deepMerge({
          logLevel: this.logger.level,
          logger: this.getChildLogger('S3Client'),
          connectionString: connectionString,
        }, mergedClientOptions as any) as any;
        (s3ClientOptions as any).executorPool = this._deepMerge(
          (s3ClientOptions as any).executorPool || {},
          this.executorPool
        );
        this.client = new S3Client(s3ClientOptions) as unknown as Client;
      }
    } else if (!options.client) {
      const s3ClientOptions = this._deepMerge({
        logLevel: this.logger.level,
        logger: this.getChildLogger('S3Client'),
      }, mergedClientOptions as any) as any;
      (s3ClientOptions as any).executorPool = this._deepMerge(
        (s3ClientOptions as any).executorPool || {},
        this.executorPool
      );
      this.client = new S3Client(s3ClientOptions) as unknown as Client;
    } else {
      this.client = options.client;
    }

    const resolvedConnectionString = connectionString || this._inferConnectionStringFromClient(this.client);
    this.connectionString = resolvedConnectionString;
    if (!this.databaseOptions.connectionString && resolvedConnectionString) {
      this.databaseOptions.connectionString = resolvedConnectionString;
    }

    this.bucket = (this.client as any).bucket || '';
    this.keyPrefix = (this.client as any).keyPrefix || '';
  }

  get parallelism(): number {
    return this._parallelism ?? 10;
  }

  set parallelism(value: number | string) {
    const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
    this._parallelism = normalized;
    if (this.executorPool) {
      this.executorPool.concurrency = normalized;
    }
  }

  setConcurrency(value: number | string): void {
    const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
    this._parallelism = normalized;
    if (this.executorPool) {
      this.executorPool.concurrency = normalized;
    }
  }

  get config(): {
    version: string;
    s3dbVersion: string;
    bucket: string;
    keyPrefix: string;
    taskExecutor: ExecutorPoolConfig;
    logLevel: string;
  } {
    return {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      taskExecutor: this.taskExecutor,
      logLevel: this.logger.level
    };
  }

  getChildLogger(name: string, bindings: Record<string, unknown> = {}): Logger {
    const childLogger = this.logger.child({
      name,
      ...bindings
    });

    const levelOverride = this._childLoggerLevels[name];
    if (levelOverride) {
      childLogger.level = levelOverride;
    }

    return childLogger;
  }

  setChildLevel(name: string, level: LogLevel): void {
    this._childLoggerLevels[name] = level;
  }

  async connect(): Promise<void> {
    return this._connectionModule.connect();
  }

  async disconnect(): Promise<void> {
    return this._connectionModule.disconnect();
  }

  isConnected(): boolean {
    return this._connectionModule.isConnected();
  }

  async startPlugins(): Promise<void> {
    return this._pluginsModule.startPlugins();
  }

  async usePlugin(plugin: Plugin, name: string | null = null): Promise<Plugin> {
    return this._pluginsModule.usePlugin(plugin, name);
  }

  async uninstallPlugin(name: string, options: { purgeData?: boolean } = {}): Promise<void> {
    return this._pluginsModule.uninstallPlugin(name, options);
  }

  async getGlobalCoordinator(namespace: string, options: GlobalCoordinatorOptions = {}): Promise<GlobalCoordinatorService> {
    return this._coordinatorsModule.getGlobalCoordinator(namespace, options);
  }

  async createResource(config: CreateResourceConfig): Promise<Resource> {
    return this._resourcesModule.createResource(config);
  }

  async listResources(): Promise<ResourceExport[]> {
    return this._resourcesModule.listResources();
  }

  async getResource(name: string): Promise<Resource> {
    return this._resourcesModule.getResource(name);
  }

  resourceExists(name: string): boolean {
    return this._resourcesModule.resourceExists(name);
  }

  resourceExistsWithSameHash(params: {
    name: string;
    attributes: AttributesSchema;
    behavior?: BehaviorType;
    partitions?: PartitionsConfig;
  }): HashExistsResult {
    return this._resourcesModule.resourceExistsWithSameHash(params);
  }

  prewarmResources(resourceNames?: string[]): { warmed: string[]; skipped: string[]; alreadyCompiled: string[] } {
    const warmed: string[] = [];
    const skipped: string[] = [];
    const alreadyCompiled: string[] = [];

    const resources = resourceNames
      ? resourceNames.map(name => this._resourcesMap[name]).filter(Boolean)
      : Object.values(this._resourcesMap);

    for (const resource of resources) {
      if (!resource) continue;

      if (resource.isSchemaCompiled()) {
        alreadyCompiled.push(resource.name);
        continue;
      }

      try {
        resource.prewarmSchema();
        warmed.push(resource.name);
      } catch (err) {
        skipped.push(resource.name);
        this.logger.warn({ resource: resource.name, err }, `[PREWARM] Failed to prewarm resource schema`);
      }
    }

    this.logger.debug(
      { warmed: warmed.length, skipped: skipped.length, alreadyCompiled: alreadyCompiled.length },
      `[PREWARM] Resources prewarmed`
    );

    return { warmed, skipped, alreadyCompiled };
  }

  async uploadMetadataFile(): Promise<void> {
    return this._metadataModule.uploadMetadataFile();
  }

  async flushMetadata(): Promise<void> {
    return this._metadataModule.flushMetadata();
  }

  blankMetadataStructure(): SavedMetadata {
    return this._metadataModule.blankMetadataStructure();
  }

  detectDefinitionChanges(savedMetadata: SavedMetadata): DefinitionChange[] {
    return this._metadataModule.detectDefinitionChanges(savedMetadata);
  }

  generateDefinitionHash(definition: ResourceExport, behavior?: BehaviorType): string {
    return this._metadataModule.generateDefinitionHash(definition, behavior);
  }

  getNextVersion(versions: StringRecord<VersionData> = {}): string {
    return this._metadataModule.getNextVersion(versions);
  }

  addHook(event: HookEventName, fn: DatabaseHookFunction): void {
    return this._hooksModule.addHook(event, fn);
  }

  removeHook(event: HookEventName, fn: DatabaseHookFunction): void {
    return this._hooksModule.removeHook(event, fn);
  }

  getHooks(event: HookEventName): DatabaseHookFunction[] {
    return this._hooksModule.getHooks(event);
  }

  clearHooks(event: HookEventName): void {
    return this._hooksModule.clearHooks(event);
  }

  private _deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
    const result = { ...target } as T;

    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          (result as any)[key] = this._deepMerge((result as any)[key] || {}, source[key] as any);
        } else {
          (result as any)[key] = source[key];
        }
      }
    }

    return result;
  }

  private _applyTaskExecutorMonitoring<T extends Record<string, unknown>>(config: T): T {
    if (!this.databaseOptions?.taskExecutorMonitoring) {
      return config;
    }
    const merged = { ...config } as T;
    (merged as any).taskExecutorMonitoring = this._deepMerge(
      this.databaseOptions.taskExecutorMonitoring as Record<string, unknown>,
      (merged as any).taskExecutorMonitoring || {}
    );
    return merged;
  }

  private _normalizeParallelism(value: number | string | undefined | null, fallback: number = 10): number {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return fallback;
      }
      if (trimmed.toLowerCase() === 'auto') {
        return fallback;
      }
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
      }
      return fallback;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    return fallback;
  }

  private _normalizeOperationsPool(config: ExecutorPoolConfig | false | undefined, defaultConcurrency: number = 10): ExecutorPoolConfig {
    if (config === false || (config as any)?.enabled === false) {
      return { enabled: false, concurrency: this._normalizeParallelism(undefined, defaultConcurrency) };
    }

    const normalizedConcurrency = this._normalizeParallelism(config?.concurrency, defaultConcurrency);

    return {
      enabled: true,
      concurrency: normalizedConcurrency,
      retries: config?.retries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
      timeout: config?.timeout ?? 30000,
      retryableErrors: config?.retryableErrors ?? [],
      autotune: config?.autotune ?? null,
      monitoring: config?.monitoring ?? { collectMetrics: true },
    };
  }

  private _inferConnectionStringFromClient(client: Client): string | undefined {
    if (!client) {
      return undefined;
    }

    if ((client as any).connectionString) {
      return (client as any).connectionString;
    }

    if (client instanceof MemoryClient) {
      const bucket = encodeURIComponent((client as any).bucket || 's3db');
      const encodedPrefix = (client as any).keyPrefix
        ? (client as any).keyPrefix
            .split('/')
            .filter(Boolean)
            .map((segment: string) => encodeURIComponent(segment))
            .join('/')
        : '';
      const prefixPath = encodedPrefix ? `/${encodedPrefix}` : '';
      return `memory://${bucket}${prefixPath}`;
    }

    if (client instanceof FileSystemClient) {
      if ((client as any).basePath) {
        return `file://${encodeURI((client as any).basePath)}`;
      }
    }

    return undefined;
  }
}

export class S3db extends Database {}
export default S3db;
