import EventEmitter from 'events';
import { PluginStorage } from '../concerns/plugin-storage.js';
import { FilesystemStorageDriver } from '../concerns/storage-drivers/filesystem-driver.js';
import { PluginError } from '../errors.js';
import { listPluginNamespaces, detectAndWarnNamespaces } from './namespace.js';
import normalizePluginOptions from './concerns/plugin-options.js';
import { createLogger, S3DBLogger } from '../concerns/logger.js';
import type { Database } from '../database.class.js';
import type { Resource } from '../resource.class.js';
import type { CronManager } from '../concerns/cron-manager.js';

export interface PluginConfig {
  slug?: string;
  namespace?: string;
  instanceId?: string;
  logLevel?: string;
  logger?: S3DBLogger;
  storage?: StorageConfig;
  [key: string]: unknown;
}

export interface StorageConfig {
  driver?: 's3' | 'filesystem';
  config?: Record<string, unknown>;
}

export interface PartitionDefinition {
  fields?: Record<string, unknown>;
}

export interface ResourceConfig {
  partitions?: Record<string, PartitionDefinition>;
}

export interface ResourceLike {
  config?: ResourceConfig;
  $schema?: ResourceConfig;
  name?: string;
  _pluginWrappers?: Map<string, WrapperFunction[]>;
  _pluginMiddlewares?: Record<string, MiddlewareFunction[]>;
  applyPartitionRule?(value: unknown, rule: unknown): unknown;
  insert?(data: unknown): Promise<unknown>;
  update?(id: string, data: unknown): Promise<unknown>;
  delete?(id: string): Promise<unknown>;
  get?(id: string): Promise<unknown>;
  list?(options?: unknown): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

export type HookHandler = (...args: unknown[]) => Promise<unknown> | unknown;
export type WrapperFunction = (result: unknown, args: unknown[], methodName: string) => Promise<unknown>;
export type MiddlewareFunction = (next: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => Promise<unknown>;

export interface ScheduledTask {
  stop?(): void;
}

export interface UninstallOptions {
  purgeData?: boolean;
}

export class Plugin<TOptions extends PluginConfig = PluginConfig> extends EventEmitter {
  name: string;
  options: TOptions;
  hooks: Map<string, Map<string, HookHandler[]>>;
  baseSlug: string;
  slug: string;

  protected _storage: PluginStorage | FilesystemStorageDriver | null;

  instanceName: string | null;
  namespace: string | null;
  protected _namespaceExplicit: boolean;

  cronManager: CronManager | null;
  protected _cronJobs: string[];

  logger: S3DBLogger;
  database!: Database;
  logLevel: string;

  constructor(options: TOptions = {} as TOptions) {
    super();
    this.name = this.constructor.name;
    this.options = normalizePluginOptions(this as any, options) as TOptions;
    this.hooks = new Map();

    this.baseSlug = options.slug || this._generateSlug();
    this.slug = this.baseSlug;

    this._storage = null;

    this.instanceName = null;
    this.namespace = null;
    this._namespaceExplicit = false;

    this.cronManager = null;
    this._cronJobs = [];

    const logLevel = (this.options.logLevel || 'info') as string;
    this.logLevel = logLevel;
    if (options.logger) {
      this.logger = options.logger;
    } else {
      this.logger = createLogger({ name: `Plugin:${this.name}`, level: logLevel as any });
    }

    if (options.namespace || options.instanceId) {
      this.setNamespace(options.namespace || options.instanceId || null, { explicit: true });
    }
  }

  protected _generateSlug(): string {
    return this.name
      .replace(/Plugin$/, '')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }

  protected _normalizeNamespace(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '') || null;
  }

  setNamespace(value: string | null | undefined, { explicit = false }: { explicit?: boolean } = {}): void {
    const normalized = this._normalizeNamespace(value);

    if (!normalized) {
      if (explicit) {
        this.namespace = null;
        this.slug = this.baseSlug;
        this._namespaceExplicit = true;
        this._storage = null;
        if (typeof this.onNamespaceChanged === 'function') {
          this.onNamespaceChanged(this.namespace);
        }
      }
      return;
    }

    if (this.namespace === normalized && (explicit === false || this._namespaceExplicit)) {
      return;
    }

    this.namespace = normalized;
    if (explicit) {
      this._namespaceExplicit = true;
    }

    this.slug = `${this.baseSlug}--${normalized}`;
    this._storage = null;

    if (typeof this.onNamespaceChanged === 'function') {
      this.onNamespaceChanged(this.namespace);
    }
  }

  setInstanceName(name: string | null | undefined): void {
    if (!name) return;
    this.instanceName = name;

    if (!this._namespaceExplicit) {
      const normalized = this._normalizeNamespace(name);
      if (normalized && normalized !== this.baseSlug) {
        this.setNamespace(normalized);
      }
    }
  }

  onNamespaceChanged(_namespace: string | null): void {
    // Subclasses may override
  }

  getChildLogger(name: string, bindings: Record<string, unknown> = {}): S3DBLogger {
    if (!this.logger) {
      throw new PluginError('Plugin logger not initialized', {
        pluginName: this.name,
        suggestion: 'Ensure plugin is attached to database via usePlugin() or pass logger in options'
      });
    }
    return this.logger.child({ name, ...bindings });
  }

  async scheduleCron(
    expression: string,
    fn: () => Promise<void> | void,
    suffix: string = 'job',
    options: Record<string, unknown> = {}
  ): Promise<ScheduledTask | null> {
    if (!this.cronManager) {
      return null;
    }

    const jobName = `${this.slug}-${suffix}`;
    const task = await this.cronManager.schedule(expression, fn, jobName, options);

    if (task) {
      this._cronJobs.push(jobName);
    }

    return task;
  }

  async scheduleInterval(
    ms: number,
    fn: () => Promise<void> | void,
    suffix: string = 'interval',
    options: Record<string, unknown> = {}
  ): Promise<ScheduledTask | null> {
    if (!this.cronManager) {
      return null;
    }

    const jobName = `${this.slug}-${suffix}`;
    const task = await this.cronManager.scheduleInterval(ms, fn, jobName, options);

    if (task) {
      this._cronJobs.push(jobName);
    }

    return task;
  }

  stopAllCronJobs(): number {
    if (!this.cronManager) return 0;

    let stopped = 0;
    for (const jobName of this._cronJobs) {
      if (this.cronManager.stop(jobName)) {
        stopped++;
      }
    }

    this._cronJobs = [];
    return stopped;
  }

  getStorage(): PluginStorage | FilesystemStorageDriver {
    if (!this._storage) {
      const storageConfig = this.options.storage || {};
      const driver = storageConfig.driver || 's3';
      const config = storageConfig.config || {};

      if (driver === 'filesystem') {
        this._storage = new FilesystemStorageDriver(config as { basePath: string }, this.slug);
      } else if (driver === 's3') {
        if (!this.database || !this.database.client) {
          throw new PluginError('Plugin storage unavailable until plugin is installed', {
            pluginName: this.name,
            operation: 'getStorage',
            statusCode: 400,
            retriable: false,
            suggestion: 'Call db.installPlugin(new Plugin()) or ensure db.connect() completed before accessing storage.'
          });
        }
        this._storage = new PluginStorage(this.database.client as any, this.slug);
      } else {
        throw new PluginError(`Unsupported storage driver: ${driver}`, {
          pluginName: this.name,
          operation: 'getStorage',
          statusCode: 400,
          retriable: false,
          suggestion: 'Use "s3" or "filesystem" as storage driver'
        });
      }
    }
    return this._storage;
  }

  async detectAndWarnNamespaces(): Promise<string[]> {
    if (!this._namespaceExplicit && !this.namespace) {
      return [];
    }

    try {
      const pluginPrefix = this.baseSlug;
      const currentNamespace = this.namespace || '';

      return await detectAndWarnNamespaces(
        this.getStorage() as PluginStorage,
        this.name,
        pluginPrefix,
        currentNamespace,
        this.logger
      );
    } catch {
      return [];
    }
  }

  async install(database: Database): Promise<void> {
    this.database = database;
    this.beforeInstall();

    this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin installing');

    await this.detectAndWarnNamespaces();

    await this.onInstall();
    this.afterInstall();

    this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin installed');
  }

  async start(): Promise<void> {
    this.beforeStart();

    this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin starting');

    await this.onStart();
    this.afterStart();

    this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin started');
  }

  async stop(): Promise<void> {
    this.beforeStop();

    this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin stopping');

    await this.onStop();

    this.stopAllCronJobs();

    this.removeAllListeners();

    this.logger.debug({ pluginName: this.name, instanceName: this.instanceName }, 'plugin stopped');

    this.afterStop();
  }

  async uninstall(options: UninstallOptions = {}): Promise<void> {
    const { purgeData = false } = options;

    this.beforeUninstall();
    await this.onUninstall(options);

    if (purgeData && this._storage) {
      const deleted = await (this._storage as PluginStorage).deleteAll();
      this.emit('plugin.dataPurged', { deleted });
    }

    this.afterUninstall();
  }

  async onInstall(): Promise<void> {
    // Override in subclasses
  }

  async onStart(): Promise<void> {
    // Override in subclasses
  }

  async onStop(): Promise<void> {
    // Override in subclasses
  }

  async onUninstall(_options: UninstallOptions): Promise<void> {
    // Override in subclasses
  }

  addHook(resource: string, event: string, handler: HookHandler): void {
    if (!this.hooks.has(resource)) {
      this.hooks.set(resource, new Map());
    }

    const resourceHooks = this.hooks.get(resource)!;
    if (!resourceHooks.has(event)) {
      resourceHooks.set(event, []);
    }

    resourceHooks.get(event)!.push(handler);
  }

  removeHook(resource: string, event: string, handler: HookHandler): void {
    const resourceHooks = this.hooks.get(resource);
    if (resourceHooks && resourceHooks.has(event)) {
      const handlers = resourceHooks.get(event)!;
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  wrapResourceMethod(
    resource: ResourceLike,
    methodName: string,
    wrapper: WrapperFunction
  ): void {
    const originalMethod = (resource as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[methodName];

    if (!resource._pluginWrappers) {
      resource._pluginWrappers = new Map();
    }

    if (!resource._pluginWrappers.has(methodName)) {
      resource._pluginWrappers.set(methodName, []);
    }

    resource._pluginWrappers.get(methodName)!.push(wrapper);

    const wrappedMethodKey = `_wrapped_${methodName as string}` as keyof ResourceLike;
    if (!(resource as unknown as Record<string, unknown>)[wrappedMethodKey as string]) {
      (resource as unknown as Record<string, unknown>)[wrappedMethodKey as string] = originalMethod;

      const isJestMock = originalMethod && (originalMethod as { _isMockFunction?: boolean })._isMockFunction;

      (resource as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[methodName as string] = async function (this: unknown, ...args: unknown[]) {
        const wrappedFn = (resource as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[wrappedMethodKey as string] as (...args: unknown[]) => Promise<unknown>;
        let result = await wrappedFn.call(this, ...args);

        for (const wrapperFn of resource._pluginWrappers!.get(methodName)!) {
          result = await wrapperFn.call(this, result, args, methodName);
        }

        return result;
      };

      if (isJestMock) {
        Object.setPrototypeOf(
          (resource as unknown as Record<string, unknown>)[methodName],
          Object.getPrototypeOf(originalMethod)
        );
        Object.assign(
          (resource as unknown as Record<string, unknown>)[methodName] as object,
          originalMethod
        );
      }
    }
  }

  addMiddleware(
    resource: ResourceLike,
    methodName: string,
    middleware: MiddlewareFunction
  ): void {
    const resourceAny = resource as unknown as Record<string, unknown>;

    if (typeof resourceAny[methodName] !== 'function') {
      throw new PluginError(`Cannot add middleware to "${methodName}"`, {
        pluginName: this.name,
        operation: 'addMiddleware',
        statusCode: 400,
        retriable: false,
        suggestion: 'Ensure the resource exposes the method before registering middleware.',
        resourceName: resource.name || 'unknown',
        methodName
      });
    }

    if (!resource._pluginMiddlewares) {
      resource._pluginMiddlewares = {};
    }
    if (!resource._pluginMiddlewares[methodName]) {
      resource._pluginMiddlewares[methodName] = [];
      const originalMethod = (resourceAny[methodName] as (...args: unknown[]) => Promise<unknown>).bind(resource);
      resourceAny[methodName] = async function (...args: unknown[]) {
        let idx = -1;
        const next = async (...nextArgs: unknown[]): Promise<unknown> => {
          idx++;
          if (idx < resource._pluginMiddlewares![methodName]!.length) {
            return await resource._pluginMiddlewares![methodName]![idx]!.call(this, next, ...nextArgs);
          } else {
            return await originalMethod(...nextArgs);
          }
        };
        return await next(...args);
      };
    }
    resource._pluginMiddlewares[methodName].push(middleware);
  }

  getPartitionValues(data: Record<string, unknown>, resource: ResourceLike): Record<string, Record<string, unknown>> {
    if (!resource.config?.partitions) return {};

    const partitionValues: Record<string, Record<string, unknown>> = {};
    for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
      if (partitionDef.fields) {
        partitionValues[partitionName] = {};
        for (const [fieldName, rule] of Object.entries(partitionDef.fields)) {
          const value = this.getNestedFieldValue(data, fieldName);
          if (value !== null && value !== undefined) {
            partitionValues[partitionName][fieldName] = resource.applyPartitionRule
              ? resource.applyPartitionRule(value, rule)
              : value;
          }
        }
      } else {
        partitionValues[partitionName] = {};
      }
    }

    return partitionValues;
  }

  getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown {
    if (!fieldPath.includes('.')) {
      return data[fieldPath] ?? null;
    }

    const keys = fieldPath.split('.');
    let value: unknown = data;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = (value as Record<string, unknown>)[key];
      } else {
        return null;
      }
    }

    return value ?? null;
  }

  beforeInstall(): void {
    this.emit('plugin.beforeInstall', new Date());
  }

  afterInstall(): void {
    this.emit('plugin.afterInstall', new Date());
  }

  beforeStart(): void {
    this.emit('plugin.beforeStart', new Date());
  }

  afterStart(): void {
    this.emit('plugin.afterStart', new Date());
  }

  beforeStop(): void {
    this.emit('plugin.beforeStop', new Date());
  }

  afterStop(): void {
    this.emit('plugin.afterStop', new Date());
  }

  beforeUninstall(): void {
    this.emit('plugin.beforeUninstall', new Date());
  }

  afterUninstall(): void {
    this.emit('plugin.afterUninstall', new Date());
  }
}
