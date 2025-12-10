import { createHash, randomUUID } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { flatten } from '../concerns/flatten.js';
import isEqual from 'lodash-es/isEqual.js';

import { Plugin, type PluginConfig } from './plugin.class.js';
import { PluginError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';

import {
  createCloudDriver,
  validateCloudDefinition,
  listCloudDrivers,
  registerCloudDriver,
  BaseCloudDriver
} from './cloud-inventory/index.js';
import { resolveResourceNames } from './concerns/resource-names.js';

interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
}

interface Database {
  createResource(definition: ResourceDefinition): Promise<Resource>;
  resources: Record<string, Resource>;
  client: S3Client;
}

interface S3Client {
  putObject(params: PutObjectParams): Promise<void>;
}

interface PutObjectParams {
  Bucket: string;
  Key: string;
  Body: string;
  ContentType: string;
}

interface Resource {
  insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>>;
  get(id: string): Promise<Record<string, unknown>>;
  getOrNull(id: string): Promise<Record<string, unknown> | null>;
  query(options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  list(options?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

interface ResourceDefinition {
  name: string;
  attributes: Record<string, unknown>;
  behavior?: string;
  timestamps?: boolean;
  partitions?: Record<string, unknown>;
}

interface PluginStorage {
  acquireLock(key: string, options: LockOptions): Promise<Lock | null>;
  releaseLock(lock: Lock): Promise<void>;
}

interface LockOptions {
  ttl: number;
  timeout: number;
}

interface Lock {
  name?: string;
}

interface CronJob {
  start(): void;
  stop(): void;
  destroy?(): void;
}

interface CronModule {
  schedule(cron: string, handler: () => void, options?: { timezone?: string }): CronJob;
}

interface CloudDefinition {
  id: string;
  driver: string | CloudDriverFactory;
  config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  scheduled?: ScheduleInput;
}

type CloudDriverFactory = (options: CloudDriverOptions) => BaseCloudDriver;

interface CloudDriverOptions {
  globals?: CloudInventoryConfig;
  schedule?: Schedule;
  logger?: LogFunction;
  [key: string]: unknown;
}

type LogFunction = (level: string, message: string, meta?: Record<string, unknown>) => void;

interface CloudDriver {
  initialize(): Promise<void>;
  destroy?(): Promise<void>;
  listResources(options: ListResourcesOptions): Promise<CloudResource[] | AsyncIterable<CloudResource>>;
}

interface ListResourcesOptions {
  discovery: DiscoveryConfig;
  checkpoint: unknown;
  state: unknown;
  runtime: RuntimeContext;
  [key: string]: unknown;
}

interface RuntimeContext {
  checkpoint: unknown;
  state: unknown;
  emitCheckpoint: (value: unknown) => void;
  emitRateLimit: (value: unknown) => void;
  emitState: (value: unknown) => void;
  emitProgress: (value: unknown) => void;
}

interface CloudResource {
  resourceType?: string;
  type?: string;
  resourceId?: string;
  id?: string;
  name?: string;
  displayName?: string;
  configuration?: Record<string, unknown>;
  state?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  accountId?: string;
  subscriptionId?: string;
  organizationId?: string;
  projectId?: string;
  region?: string;
  location?: string;
  service?: string;
  product?: string;
  tags?: Record<string, unknown>;
  labels?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  arn?: string;
}

interface CloudResourceSnapshot {
  resourceType: string;
  resourceId: string;
  [key: string]: unknown;
}

interface NormalizedResource {
  cloudId: string;
  driver: string;
  accountId: string | null;
  subscriptionId: string | null;
  organizationId: string | null;
  projectId: string | null;
  region: string | null;
  service: string | null;
  resourceType: string;
  resourceId: string;
  name: string | null;
  tags: Record<string, unknown> | null;
  labels: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  configuration: Record<string, unknown>;
  resourceKey: string;
}

interface DiscoveryConfig {
  concurrency: number;
  include: string[] | null;
  exclude: string[];
  runOnInstall: boolean;
  dryRun: boolean;
}

interface Schedule {
  enabled: boolean;
  cron: string | null;
  timezone: string | undefined;
  runOnStart: boolean;
}

interface ScheduleInput {
  enabled?: boolean;
  cron?: string;
  timezone?: string;
  runOnStart?: boolean;
}

interface LockConfig {
  ttl: number;
  timeout: number;
}

interface TerraformConfig {
  enabled: boolean;
  autoExport: boolean;
  output: string | ((data: TerraformStateData) => Promise<unknown>) | null;
  outputType: 'file' | 's3' | 'custom';
  filters: TerraformFilters;
  terraformVersion: string;
  serial: number;
}

interface TerraformFilters {
  providers: string[];
  resourceTypes: string[];
  cloudId: string | null;
}

interface TerraformStateData {
  state: unknown;
  stats: TerraformExportStats;
}

interface TerraformExportStats {
  total: number;
  converted: number;
  skipped: number;
}

interface ResourceNamesConfig {
  snapshots?: string;
  versions?: string;
  changes?: string;
  clouds?: string;
}

interface ResourceDescriptor {
  defaultName: string;
  override?: string;
}

interface CloudInventoryConfig {
  clouds: CloudDefinition[];
  discovery: DiscoveryConfig;
  resourceNames: Record<string, string>;
  logger: LogFunction | null;
  logLevel?: string;
  scheduled: Schedule;
  lock: LockConfig;
  terraform: TerraformConfig;
  [key: string]: unknown;
}

interface CloudDriverEntry {
  driver: CloudDriver;
  definition: CloudDefinition & { scheduled: Schedule };
  summary?: Record<string, unknown>;
}

interface ResourceHandles {
  snapshots?: Resource;
  versions?: Resource;
  changes?: Resource;
  clouds?: Resource;
}

interface CloudSummary {
  checkpoint?: unknown;
  rateLimit?: unknown;
  state?: unknown;
  checkpointUpdatedAt?: string;
  rateLimitUpdatedAt?: string;
  stateUpdatedAt?: string;
  totalResources?: number;
  totalVersions?: number;
  tags?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface SyncResult {
  cloudId: string;
  driver: string;
  created: number;
  updated: number;
  unchanged: number;
  processed: number;
  durationMs: number;
}

interface SkippedSyncResult {
  cloudId: string;
  driver: string;
  skipped: true;
  reason: string;
}

interface PersistResult {
  status: 'created' | 'updated' | 'unchanged';
  resourceKey: string;
  version: number;
}

interface DiffResult {
  added?: Record<string, unknown>;
  removed?: Record<string, unknown>;
  updated?: Record<string, { before: unknown; after: unknown }>;
}

export interface CloudInventoryPluginOptions {
  clouds?: CloudDefinition[];
  resourceNames?: ResourceNamesConfig;
  discovery?: Partial<DiscoveryConfig>;
  logger?: LogFunction;
  scheduled?: ScheduleInput;
  lock?: Partial<LockConfig>;
  terraform?: Partial<TerraformConfig>;
  logLevel?: string;
  [key: string]: unknown;
}

interface TerraformExportOptions {
  resourceTypes?: string[];
  providers?: string[];
  cloudId?: string | null;
  terraformVersion?: string;
  lineage?: string;
  serial?: number;
  outputs?: Record<string, unknown>;
}

const DEFAULT_DISCOVERY: DiscoveryConfig = {
  concurrency: 3,
  include: null,
  exclude: [],
  runOnInstall: true,
  dryRun: false
};

const DEFAULT_LOCK: LockConfig = {
  ttl: 300,
  timeout: 0
};

const BASE_SCHEDULE: Schedule = {
  enabled: false,
  cron: null,
  timezone: undefined,
  runOnStart: false
};

const DEFAULT_TERRAFORM: TerraformConfig = {
  enabled: false,
  autoExport: false,
  output: null,
  outputType: 'file',
  filters: {
    providers: [],
    resourceTypes: [],
    cloudId: null
  },
  terraformVersion: '1.5.0',
  serial: 1
};

const INLINE_DRIVER_NAMES = new Map<CloudDriverFactory, string>();

export class CloudInventoryPlugin extends Plugin {
  declare namespace: string;
  declare logLevel: string;

  config: CloudInventoryConfig;
  cloudDrivers: Map<string, CloudDriverEntry> = new Map();
  resourceNames: Record<string, string>;
  internalResourceNames: Record<string, string>;

  private _internalResourceOverrides: ResourceNamesConfig;
  private _internalResourceDescriptors: Record<string, ResourceDescriptor>;
  private _resourceHandles: ResourceHandles = {};
  private _scheduledJobs: CronJob[] = [];
  private _cron: CronModule | null = null;

  constructor(options: CloudInventoryPluginOptions = {}) {
    super(options as PluginConfig);

    const pendingLogs: Array<{ level: string; message: string; meta: Record<string, unknown> }> = [];
    const opts = this.options as CloudInventoryPluginOptions;
    const normalizedClouds = normalizeCloudDefinitions(
      Array.isArray(opts.clouds) ? opts.clouds : [],
      (level, message, meta) => pendingLogs.push({ level, message, meta: meta ?? {} })
    );

    const {
      resourceNames = {},
      discovery = {},
      logger,
      scheduled,
      lock = {} as LockConfig,
      terraform = {} as Partial<TerraformConfig>,
      ...rest
    } = opts;

    this._internalResourceOverrides = resourceNames || {};
    this._internalResourceDescriptors = {
      snapshots: {
        defaultName: 'plg_cloud_inventory_snapshots',
        override: this._internalResourceOverrides.snapshots
      },
      versions: {
        defaultName: 'plg_cloud_inventory_versions',
        override: this._internalResourceOverrides.versions
      },
      changes: {
        defaultName: 'plg_cloud_inventory_changes',
        override: this._internalResourceOverrides.changes
      },
      clouds: {
        defaultName: 'plg_cloud_inventory_clouds',
        override: this._internalResourceOverrides.clouds
      }
    };
    this.internalResourceNames = this._resolveInternalResourceNames();

    this.config = {
      clouds: normalizedClouds,
      discovery: {
        ...DEFAULT_DISCOVERY,
        ...(discovery || {})
      },
      resourceNames: this.internalResourceNames,
      logger: typeof logger === 'function' ? logger : null,
      logLevel: this.logLevel,
      scheduled: normalizeSchedule(scheduled),
      lock: {
        ttl: lock?.ttl ?? DEFAULT_LOCK.ttl,
        timeout: lock?.timeout ?? DEFAULT_LOCK.timeout
      },
      terraform: {
        ...DEFAULT_TERRAFORM,
        ...(terraform || {}),
        filters: {
          ...DEFAULT_TERRAFORM.filters,
          ...(terraform?.filters || {})
        }
      },
      ...rest
    };

    this.resourceNames = this.internalResourceNames;

    for (const entry of pendingLogs) {
      this._log(entry.level, entry.message, entry.meta);
    }
  }

  override async onInstall(): Promise<void> {
    this._validateConfiguration();
    await this._ensureResources();
    await this._initializeDrivers();

    if (this.config.discovery.runOnInstall) {
      await this.syncAll();
    }
  }

  override async onStart(): Promise<void> {
    await this._setupSchedules();
  }

  override async onStop(): Promise<void> {
    await this._teardownSchedules();
    await this._destroyDrivers();
  }

  override async onUninstall(): Promise<void> {
    await this._teardownSchedules();
    await this._destroyDrivers();
  }

  override onNamespaceChanged(): void {
    this.internalResourceNames = this._resolveInternalResourceNames();
    if (this.config) {
      this.config.resourceNames = this.internalResourceNames;
    }
    this.resourceNames = this.internalResourceNames;
    this._resourceHandles = {};
  }

  async syncAll(options: Record<string, unknown> = {}): Promise<Array<SyncResult | SkippedSyncResult>> {
    const results: Array<SyncResult | SkippedSyncResult> = [];
    for (const cloud of this.config.clouds) {
      const result = await this.syncCloud(cloud.id, options);
      results.push(result);
    }

    if (this.config.terraform.enabled && this.config.terraform.autoExport && !this.config.terraform.filters.cloudId) {
      await this._autoExportTerraform(null);
    }

    return results;
  }

  async syncCloud(cloudId: string, options: Record<string, unknown> = {}): Promise<SyncResult | SkippedSyncResult> {
    const driverEntry = this.cloudDrivers.get(cloudId);
    if (!driverEntry) {
      throw new PluginError(`Cloud "${cloudId}" is not registered`, {
        pluginName: 'CloudInventoryPlugin',
        operation: 'syncCloud',
        statusCode: 404,
        retriable: false,
        suggestion: `Register the cloud definition in CloudInventoryPlugin configuration. Available: ${[...this.cloudDrivers.keys()].join(', ') || 'none'}.`,
        cloudId
      });
    }

    const { driver, definition } = driverEntry;
    const summaryResource = this._resourceHandles.clouds!;

    const summaryBefore = (await summaryResource.getOrNull(cloudId) as CloudSummary | null)
      ?? await this._ensureCloudSummaryRecord(cloudId, definition, definition.scheduled);

    const storage = this.getStorage() as PluginStorage;
    const lockKey = `cloud-inventory-sync-${cloudId}`;
    const lock = await storage.acquireLock(lockKey, {
      ttl: this.config.lock.ttl,
      timeout: this.config.lock.timeout
    });

    if (!lock) {
      this._log('info', 'Cloud sync already running on another worker, skipping', { cloudId });
      return {
        cloudId,
        driver: definition.driver as string,
        skipped: true,
        reason: 'lock-not-acquired'
      };
    }

    const runId = createRunIdentifier();
    const startedAt = new Date().toISOString();

    await this._updateCloudSummary(cloudId, {
      status: 'running',
      lastRunAt: startedAt,
      lastRunId: runId,
      lastError: null,
      progress: null
    });

    let pendingCheckpoint: unknown = summaryBefore?.checkpoint ?? null;
    let pendingRateLimit: unknown = summaryBefore?.rateLimit ?? null;
    let pendingState: unknown = summaryBefore?.state ?? null;

    const runtimeContext: RuntimeContext = {
      checkpoint: summaryBefore?.checkpoint ?? null,
      state: summaryBefore?.state ?? null,
      emitCheckpoint: (value) => {
        if (value === undefined) return;
        pendingCheckpoint = value;
        this._updateCloudSummary(cloudId, {
          checkpoint: value,
          checkpointUpdatedAt: new Date().toISOString()
        }).catch(err => this._log('warn', 'Failed to persist checkpoint', { cloudId, error: (err as Error).message }));
      },
      emitRateLimit: (value) => {
        pendingRateLimit = value;
        this._updateCloudSummary(cloudId, {
          rateLimit: value,
          rateLimitUpdatedAt: new Date().toISOString()
        }).catch(err => this._log('warn', 'Failed to persist rate-limit metadata', { cloudId, error: (err as Error).message }));
      },
      emitState: (value) => {
        pendingState = value;
        this._updateCloudSummary(cloudId, {
          state: value,
          stateUpdatedAt: new Date().toISOString()
        }).catch(err => this._log('warn', 'Failed to persist driver state', { cloudId, error: (err as Error).message }));
      },
      emitProgress: (value) => {
        this._updateCloudSummary(cloudId, { progress: value })
          .catch(err => this._log('warn', 'Failed to persist progress', { cloudId, error: (err as Error).message }));
      }
    };

    try {
      let items: CloudResource[] | AsyncIterable<CloudResource>;
      try {
        items = await driver.listResources({
          discovery: this.config.discovery,
          checkpoint: runtimeContext.checkpoint,
          state: runtimeContext.state,
          runtime: runtimeContext,
          ...options
        });
      } catch (err) {
        await this._updateCloudSummary(cloudId, {
          status: 'error',
          lastErrorAt: new Date().toISOString(),
          lastError: (err as Error).message || 'Driver failure during listResources'
        });
        throw err;
      }

      let countCreated = 0;
      let countUpdated = 0;
      let countUnchanged = 0;
      let processed = 0;
      let errorDuringRun: Error | null = null;
      const startMs = Date.now();

      const processItem = async (rawItem: CloudResource): Promise<void> => {
        const normalized = this._normalizeResource(definition, rawItem);
        if (!normalized) return;

        const persisted = await this._persistSnapshot(normalized, rawItem);
        processed += 1;
        if (persisted?.status === 'created') countCreated += 1;
        else if (persisted?.status === 'updated') countUpdated += 1;
        else countUnchanged += 1;
      };

      try {
        if (isAsyncIterable(items)) {
          for await (const item of items as AsyncIterable<CloudResource>) {
            await processItem(item);
          }
        } else if (Array.isArray(items)) {
          for (const item of items) {
            await processItem(item);
          }
        } else if (items) {
          await processItem(items as CloudResource);
        }
      } catch (err) {
        errorDuringRun = err as Error;
      }

      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;

      const summaryPatch: Record<string, unknown> = {
        status: errorDuringRun ? 'error' : 'idle',
        lastRunAt: startedAt,
        lastRunId: runId,
        lastResult: {
          runId,
          startedAt,
          finishedAt,
          durationMs,
          counts: {
            created: countCreated,
            updated: countUpdated,
            unchanged: countUnchanged
          },
          processed,
          checkpoint: pendingCheckpoint
        },
        totalResources: Math.max(0, (summaryBefore?.totalResources ?? 0) + countCreated),
        totalVersions: Math.max(0, (summaryBefore?.totalVersions ?? 0) + countCreated + countUpdated),
        checkpoint: pendingCheckpoint,
        checkpointUpdatedAt: pendingCheckpoint !== summaryBefore?.checkpoint ? finishedAt : summaryBefore?.checkpointUpdatedAt,
        rateLimit: pendingRateLimit,
        rateLimitUpdatedAt: pendingRateLimit !== summaryBefore?.rateLimit ? finishedAt : summaryBefore?.rateLimitUpdatedAt,
        state: pendingState,
        stateUpdatedAt: pendingState !== summaryBefore?.state ? finishedAt : summaryBefore?.stateUpdatedAt,
        progress: null
      };

      if (errorDuringRun) {
        summaryPatch.lastError = errorDuringRun.message;
        summaryPatch.lastErrorAt = finishedAt;
      } else {
        summaryPatch.lastError = null;
        summaryPatch.lastSuccessAt = finishedAt;
      }

      await this._updateCloudSummary(cloudId, summaryPatch);

      if (errorDuringRun) {
        throw errorDuringRun;
      }

      const summary: SyncResult = {
        cloudId,
        driver: definition.driver as string,
        created: countCreated,
        updated: countUpdated,
        unchanged: countUnchanged,
        processed,
        durationMs
      };

      this._log('info', 'Cloud sync finished', summary as unknown as Record<string, unknown>);

      if (this.config.terraform.enabled && this.config.terraform.autoExport) {
        await this._autoExportTerraform(cloudId);
      }

      return summary;
    } finally {
      try {
        await storage.releaseLock(lock);
      } catch (releaseErr) {
        this._log('warn', 'Failed to release sync lock', {
          cloudId,
          lockName: lock?.name ?? lockKey,
          error: (releaseErr as Error).message
        });
      }
    }
  }

  _validateConfiguration(): void {
    if (!Array.isArray(this.config.clouds) || this.config.clouds.length === 0) {
      throw new PluginError('CloudInventoryPlugin requires a "clouds" array in the configuration', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'validateConfiguration',
        statusCode: 400,
        retriable: false,
        suggestion: `Provide at least one cloud definition. Registered drivers: ${listCloudDrivers().join(', ') || 'none'}.`
      });
    }

    for (const cloud of this.config.clouds) {
      validateCloudDefinition(cloud);

      try {
        normalizeSchedule(cloud.scheduled);
      } catch (err) {
        throw new PluginError(`Cloud "${cloud.id}" has an invalid scheduled configuration`, {
          pluginName: 'CloudInventoryPlugin',
          operation: 'validateConfiguration',
          statusCode: 400,
          retriable: false,
          suggestion: 'Provide a valid cron expression and timezone when enabling scheduled discovery.',
          cloudId: cloud.id,
          original: err
        });
      }
    }
  }

  async exportToTerraformState(options: TerraformExportOptions = {}): Promise<TerraformStateData> {
    const { exportToTerraformState: exportFn } = await import('./cloud-inventory/terraform-exporter.js');

    const {
      resourceTypes = [],
      providers = [],
      cloudId = null,
      ...exportOptions
    } = options;

    const snapshotsResource = this._resourceHandles.snapshots;
    if (!snapshotsResource) {
      throw new PluginError('Snapshots resource not initialized', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'exportToTerraformState',
        statusCode: 500,
        retriable: false,
        suggestion: 'Call database.usePlugin(new CloudInventoryPlugin(...)) and ensure onInstall completed before exporting.'
      });
    }

    const queryOptions: Record<string, unknown> = {};

    if (cloudId) {
      queryOptions.cloudId = cloudId;
    }

    const snapshots = await snapshotsResource.query(queryOptions);

    this._log('info', 'Exporting cloud inventory to Terraform state', {
      totalSnapshots: snapshots.length,
      resourceTypes: resourceTypes.length > 0 ? resourceTypes : 'all',
      providers: providers.length > 0 ? providers : 'all'
    });

    const result = exportFn(snapshots as unknown as CloudResourceSnapshot[], {
      ...exportOptions,
      resourceTypes,
      providers
    });

    this._log('info', 'Export complete', result.stats);

    return result;
  }

  async exportToTerraformStateFile(filePath: string, options: TerraformExportOptions = {}): Promise<TerraformStateData & { filePath: string }> {
    const { promises: fs } = await import('fs');
    const path = await import('path');

    const result = await this.exportToTerraformState(options);

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(result.state, null, 2), 'utf8');

    this._log('info', `Terraform state exported to: ${filePath}`, result.stats as unknown as Record<string, unknown>);

    return {
      filePath,
      ...result
    };
  }

  async exportToTerraformStateToS3(bucket: string, key: string, options: TerraformExportOptions = {}): Promise<TerraformStateData & { bucket: string; key: string }> {
    const result = await this.exportToTerraformState(options);

    const s3Client = this.database.client;
    if (!s3Client || typeof s3Client.putObject !== 'function') {
      throw new PluginError('S3 client not available. Database must use S3-compatible storage.', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'exportToTerraformStateToS3',
        statusCode: 500,
        retriable: false,
        suggestion: 'Initialize the database with an S3-compatible client before exporting Terraform state to S3.'
      });
    }

    await (s3Client as any).putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(result.state, null, 2),
      ContentType: 'application/json'
    });

    this._log('info', `Terraform state exported to S3: s3://${bucket}/${key}`, result.stats as unknown as Record<string, unknown>);

    return {
      bucket,
      key,
      ...result
    };
  }

  private async _autoExportTerraform(cloudId: string | null = null): Promise<void> {
    try {
      const { terraform } = this.config;
      const exportOptions: TerraformExportOptions = {
        ...terraform.filters,
        terraformVersion: terraform.terraformVersion,
        serial: terraform.serial
      };

      if (cloudId) {
        exportOptions.cloudId = cloudId;
      }

      this._log('info', 'Auto-exporting Terraform state', {
        output: terraform.output,
        outputType: terraform.outputType,
        cloudId: cloudId || 'all'
      });

      let result: TerraformStateData;

      if (terraform.outputType === 's3') {
        const s3Match = (terraform.output as string)?.match(/^s3:\/\/([^/]+)\/(.+)$/);
        if (!s3Match) {
          throw new PluginError(`Invalid S3 URL format: ${terraform.output}`, {
            pluginName: 'CloudInventoryPlugin',
            operation: '_autoExportTerraform',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a Terraform export destination using s3://bucket/path/file.tfstate.',
            output: terraform.output
          });
        }
        const [, bucket, key] = s3Match;
        result = await this.exportToTerraformStateToS3(bucket!, key!, exportOptions);
      } else if (terraform.outputType === 'file') {
        if (!terraform.output) {
          throw new PluginError('Terraform output path not configured', {
            pluginName: 'CloudInventoryPlugin',
            operation: '_autoExportTerraform',
            statusCode: 400,
            retriable: false,
            suggestion: 'Set terraform.output to a file path (e.g., ./terraform/state.tfstate) when using outputType "file".'
          });
        }
        result = await this.exportToTerraformStateFile(terraform.output as string, exportOptions);
      } else {
        if (typeof terraform.output === 'function') {
          const stateData = await this.exportToTerraformState(exportOptions);
          await terraform.output(stateData);
          result = stateData;
        } else {
          throw new PluginError(`Unknown terraform.outputType: ${terraform.outputType}`, {
            pluginName: 'CloudInventoryPlugin',
            operation: '_autoExportTerraform',
            statusCode: 400,
            retriable: false,
            suggestion: 'Use one of the supported output types: "file", "s3", or provide a custom function.',
            outputType: terraform.outputType
          });
        }
      }

      this._log('info', 'Terraform state auto-export completed', result.stats as unknown as Record<string, unknown>);
    } catch (err) {
      this._log('error', 'Failed to auto-export Terraform state', {
        error: (err as Error).message,
        stack: (err as Error).stack
      });
    }
  }

  private async _ensureResources(): Promise<void> {
    const names = this.internalResourceNames;
    const snapshots = names.snapshots!;
    const versions = names.versions!;
    const changes = names.changes!;
    const clouds = names.clouds!;

    const resourceDefinitions: ResourceDefinition[] = [
      {
        name: snapshots,
        attributes: {
          id: 'string|required',
          cloudId: 'string|required',
          driver: 'string|required',
          accountId: 'string|optional',
          subscriptionId: 'string|optional',
          organizationId: 'string|optional',
          projectId: 'string|optional',
          region: 'string|optional',
          service: 'string|optional',
          resourceType: 'string|required',
          resourceId: 'string|required',
          name: 'string|optional',
          tags: 'json|optional',
          labels: 'json|optional',
          latestDigest: 'string|required',
          latestVersion: 'number|required',
          latestSnapshotId: 'string|required',
          lastSeenAt: 'string|required',
          firstSeenAt: 'string|required',
          changelogSize: 'number|default:0',
          metadata: 'json|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: {
          byCloudId: {
            fields: {
              cloudId: 'string|required'
            }
          },
          byResourceType: {
            fields: {
              resourceType: 'string|required'
            }
          },
          byCloudAndType: {
            fields: {
              cloudId: 'string|required',
              resourceType: 'string|required'
            }
          },
          byRegion: {
            fields: {
              region: 'string|optional'
            }
          }
        }
      },
      {
        name: versions,
        attributes: {
          id: 'string|required',
          resourceKey: 'string|required',
          cloudId: 'string|required',
          driver: 'string|required',
          version: 'number|required',
          digest: 'string|required',
          capturedAt: 'string|required',
          configuration: 'json|required',
          summary: 'json|optional',
          raw: 'json|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: {
          byResourceKey: {
            fields: {
              resourceKey: 'string|required'
            }
          },
          byCloudId: {
            fields: {
              cloudId: 'string|required'
            }
          }
        }
      },
      {
        name: changes,
        attributes: {
          id: 'string|required',
          resourceKey: 'string|required',
          cloudId: 'string|required',
          driver: 'string|required',
          fromVersion: 'number|required',
          toVersion: 'number|required',
          fromDigest: 'string|required',
          toDigest: 'string|required',
          diff: 'json|required',
          summary: 'json|optional',
          capturedAt: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        partitions: {
          byResourceKey: {
            fields: {
              resourceKey: 'string|required'
            }
          },
          byCloudId: {
            fields: {
              cloudId: 'string|required'
            }
          }
        }
      },
      {
        name: clouds,
        attributes: {
          id: 'string|required',
          driver: 'string|required',
          status: 'string|default:idle',
          lastRunAt: 'string|optional',
          lastRunId: 'string|optional',
          lastSuccessAt: 'string|optional',
          lastErrorAt: 'string|optional',
          lastError: 'string|optional',
          totalResources: 'number|default:0',
          totalVersions: 'number|default:0',
          lastResult: 'json|optional',
          tags: 'json|optional',
          metadata: 'json|optional',
          schedule: 'json|optional',
          checkpoint: 'json|optional',
          checkpointUpdatedAt: 'string|optional',
          rateLimit: 'json|optional',
          rateLimitUpdatedAt: 'string|optional',
          state: 'json|optional',
          stateUpdatedAt: 'string|optional',
          progress: 'json|optional'
        },
        behavior: 'body-overflow',
        timestamps: true
      }
    ];

    for (const definition of resourceDefinitions) {
      const [ok, err] = await tryFn(() => (this.database as any).createResource(definition));
      if (!ok && (err as Error)?.message?.includes('already exists')) {
        this._log('debug', 'Resource already exists, skipping creation', { resource: definition.name });
      } else if (!ok) {
        throw err;
      }
    }

    this._resourceHandles.snapshots = this.database.resources[snapshots];
    this._resourceHandles.versions = this.database.resources[versions];
    this._resourceHandles.changes = this.database.resources[changes];
    this._resourceHandles.clouds = this.database.resources[clouds];
    this.resourceNames = this.internalResourceNames;
  }

  private _resolveInternalResourceNames(): Record<string, string> {
    return resolveResourceNames('cloud_inventory', this._internalResourceDescriptors, {
      namespace: this.namespace
    });
  }

  private async _initializeDrivers(): Promise<void> {
    for (const cloudDef of this.config.clouds) {
      const driverId = cloudDef.id;
      if (this.cloudDrivers.has(driverId)) continue;

      const schedule = normalizeSchedule(cloudDef.scheduled);
      const summary = await this._ensureCloudSummaryRecord(driverId, cloudDef, schedule);

      const driver = await createCloudDriver(cloudDef.driver as string, {
        ...cloudDef,
        globals: this.config,
        schedule,
        logger: (level: string, message: string, meta: Record<string, unknown> = {}) => {
          this._log(level, message, { cloudId: driverId, driver: cloudDef.driver, ...meta });
        }
      } as CloudDriverOptions);

      await driver.initialize();
      this.cloudDrivers.set(driverId, {
        driver: driver as unknown as CloudDriver,
        definition: { ...cloudDef, scheduled: schedule } as CloudDefinition & { scheduled: Schedule },
        summary
      });
      this._log('info', 'Cloud driver initialized', { cloudId: driverId, driver: cloudDef.driver });
    }
  }

  private async _destroyDrivers(): Promise<void> {
    for (const [cloudId, { driver }] of this.cloudDrivers.entries()) {
      try {
        await driver.destroy?.();
      } catch (err) {
        this._log('warn', 'Failed to destroy cloud driver', { cloudId, error: (err as Error).message });
      }
    }
    this.cloudDrivers.clear();
  }

  private async _setupSchedules(): Promise<void> {
    await this._teardownSchedules();

    const globalSchedule = this.config.scheduled;
    const cloudsWithSchedule = [...this.cloudDrivers.values()]
      .filter(entry => entry.definition.scheduled?.enabled);

    const needsCron = globalSchedule.enabled || cloudsWithSchedule.length > 0;
    if (!needsCron) return;

    await requirePluginDependency('cloud-inventory-plugin');

    if (!this._cron) {
      const cronModule = await import('node-cron');
      this._cron = (cronModule.default || cronModule) as CronModule;
    }

    if (globalSchedule.enabled) {
      this._scheduleJob(globalSchedule, async () => {
        try {
          await this.syncAll({ reason: 'scheduled-global' });
        } catch (err) {
          this._log('error', 'Scheduled global sync failed', { error: (err as Error).message });
        }
      });

      if (globalSchedule.runOnStart) {
        this.syncAll({ reason: 'scheduled-global-runOnStart' }).catch(err => {
          this._log('error', 'Initial global scheduled sync failed', { error: (err as Error).message });
        });
      }
    }

    for (const { definition } of this.cloudDrivers.values()) {
      const schedule = definition.scheduled;
      if (!schedule?.enabled) continue;

      const cloudId = definition.id;
      this._scheduleJob(schedule, async () => {
        try {
          await this.syncCloud(cloudId, { reason: 'scheduled-cloud' });
        } catch (err) {
          this._log('error', 'Scheduled cloud sync failed', { cloudId, error: (err as Error).message });
        }
      });

      if (schedule.runOnStart) {
        this.syncCloud(cloudId, { reason: 'scheduled-cloud-runOnStart' }).catch(err => {
          this._log('error', 'Initial cloud scheduled sync failed', { cloudId, error: (err as Error).message });
        });
      }
    }
  }

  private _scheduleJob(schedule: Schedule, handler: () => Promise<void>): void {
    if (!this._cron) return;
    const job = this._cron.schedule(
      schedule.cron!,
      handler,
      { timezone: schedule.timezone }
    );
    if ((job as CronJob & { start?: () => void })?.start) {
      (job as CronJob & { start: () => void }).start();
    }
    this._scheduledJobs.push(job);
  }

  private async _teardownSchedules(): Promise<void> {
    if (!this._scheduledJobs.length) return;
    for (const job of this._scheduledJobs) {
      try {
        job?.stop?.();
        job?.destroy?.();
      } catch (err) {
        this._log('warn', 'Failed to teardown scheduled job', { error: (err as Error).message });
      }
    }
    this._scheduledJobs = [];
  }

  private _normalizeResource(cloudDefinition: CloudDefinition, entry: CloudResource): NormalizedResource | null {
    if (!entry || typeof entry !== 'object') {
      this._log('warn', 'Skipping invalid resource entry', { cloudId: cloudDefinition.id });
      return null;
    }

    const configuration = ensureObject(
      entry.configuration ??
      entry.state ??
      entry.attributes ??
      entry
    );

    const normalized: NormalizedResource = {
      cloudId: cloudDefinition.id,
      driver: cloudDefinition.driver as string,
      accountId: entry.accountId || (cloudDefinition.config?.accountId as string) || null,
      subscriptionId: entry.subscriptionId || null,
      organizationId: entry.organizationId || null,
      projectId: entry.projectId || (cloudDefinition.config?.projectId as string) || null,
      region: entry.region || entry.location || null,
      service: entry.service || entry.product || null,
      resourceType: entry.resourceType || entry.type || 'unknown',
      resourceId: entry.resourceId || entry.id || (configuration as Record<string, unknown>).id as string || (configuration as Record<string, unknown>).arn as string || (configuration as Record<string, unknown>).name as string,
      name: entry.name || (configuration as Record<string, unknown>).name as string || (configuration as Record<string, unknown>).displayName as string || null,
      tags: entry.tags || (configuration as Record<string, unknown>).tags as Record<string, unknown> || null,
      labels: entry.labels || (configuration as Record<string, unknown>).labels as Record<string, unknown> || null,
      metadata: entry.metadata || {},
      configuration: configuration as Record<string, unknown>,
      resourceKey: ''
    };

    if (!normalized.resourceId) {
      this._log('warn', 'Entry missing resource identifier, skipping', {
        cloudId: normalized.cloudId,
        driver: normalized.driver,
        resourceType: normalized.resourceType
      });
      return null;
    }

    normalized.resourceKey = [
      normalized.cloudId,
      normalized.resourceType,
      normalized.resourceId
    ].filter(Boolean).join(':');

    return normalized;
  }

  private async _persistSnapshot(normalized: NormalizedResource, rawItem: CloudResource): Promise<PersistResult> {
    const now = new Date().toISOString();
    const digest = computeDigest(normalized.configuration);
    const resourceKey = normalized.resourceKey;

    const snapshots = this._resourceHandles.snapshots!;
    const versions = this._resourceHandles.versions!;
    const changes = this._resourceHandles.changes!;

    const existing = await snapshots.getOrNull(resourceKey) as Record<string, unknown> | null;

    if (!existing) {
      const versionNumber = 1;
      const versionId = buildVersionId(resourceKey, versionNumber);

      await versions.insert({
        id: versionId,
        resourceKey,
        cloudId: normalized.cloudId,
        driver: normalized.driver,
        version: versionNumber,
        digest,
        capturedAt: now,
        configuration: normalized.configuration,
        summary: buildSummary(normalized),
        raw: rawItem
      });

      await snapshots.insert({
        id: resourceKey,
        cloudId: normalized.cloudId,
        driver: normalized.driver,
        accountId: normalized.accountId,
        subscriptionId: normalized.subscriptionId,
        organizationId: normalized.organizationId,
        projectId: normalized.projectId,
        region: normalized.region,
        service: normalized.service,
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        name: normalized.name,
        tags: normalized.tags,
        labels: normalized.labels,
        metadata: normalized.metadata,
        latestDigest: digest,
        latestVersion: versionNumber,
        latestSnapshotId: versionId,
        firstSeenAt: now,
        lastSeenAt: now,
        changelogSize: 0
      });

      return { status: 'created', resourceKey, version: versionNumber };
    }

    if (existing.latestDigest === digest) {
      await snapshots.update(resourceKey, { lastSeenAt: now });
      return { status: 'unchanged', resourceKey, version: existing.latestVersion as number };
    }

    const previousVersionId = existing.latestSnapshotId as string;
    const previousVersion = await versions.getOrNull(previousVersionId) as Record<string, unknown> | null;
    const nextVersionNumber = (existing.latestVersion as number) + 1;
    const nextVersionId = buildVersionId(resourceKey, nextVersionNumber);

    await versions.insert({
      id: nextVersionId,
      resourceKey,
      cloudId: normalized.cloudId,
      driver: normalized.driver,
      version: nextVersionNumber,
      digest,
      capturedAt: now,
      configuration: normalized.configuration,
      summary: buildSummary(normalized),
      raw: rawItem
    });

    const diff = computeDiff(previousVersion?.configuration as Record<string, unknown>, normalized.configuration);
    await changes.insert({
      id: `${resourceKey}:${existing.latestVersion}->${nextVersionNumber}`,
      resourceKey,
      cloudId: normalized.cloudId,
      driver: normalized.driver,
      fromVersion: existing.latestVersion,
      toVersion: nextVersionNumber,
      fromDigest: existing.latestDigest,
      toDigest: digest,
      diff,
      summary: {
        added: Object.keys(diff.added || {}).length,
        removed: Object.keys(diff.removed || {}).length,
        updated: Object.keys(diff.updated || {}).length
      },
      capturedAt: now
    });

    await snapshots.update(resourceKey, {
      latestDigest: digest,
      latestVersion: nextVersionNumber,
      latestSnapshotId: nextVersionId,
      lastSeenAt: now,
      changelogSize: ((existing.changelogSize as number) || 0) + 1,
      metadata: normalized.metadata,
      tags: normalized.tags,
      labels: normalized.labels,
      region: normalized.region,
      service: normalized.service,
      name: normalized.name
    });

    return { status: 'updated', resourceKey, version: nextVersionNumber };
  }

  private async _ensureCloudSummaryRecord(cloudId: string, cloudDef: CloudDefinition, schedule: Schedule): Promise<CloudSummary> {
    const clouds = this._resourceHandles.clouds!;
    const existing = await clouds.getOrNull(cloudId) as CloudSummary | null;

    const payload = {
      driver: cloudDef.driver,
      schedule: schedule.enabled ? schedule : null,
      tags: cloudDef.tags ?? existing?.tags ?? null,
      metadata: cloudDef.metadata ?? existing?.metadata ?? null
    };

    if (!existing) {
      await clouds.insert({
        id: cloudId,
        status: 'idle',
        totalResources: 0,
        totalVersions: 0,
        lastResult: null,
        checkpoint: null,
        rateLimit: null,
        ...payload
      });
      return await clouds.get(cloudId) as CloudSummary;
    }

    await clouds.update(cloudId, payload);
    return await clouds.get(cloudId) as CloudSummary;
  }

  private async _updateCloudSummary(cloudId: string, patch: Record<string, unknown>): Promise<void> {
    const clouds = this._resourceHandles.clouds;
    if (!clouds) return;

    const [ok, err] = await tryFn(() => clouds.update(cloudId, patch));
    if (ok) return;

    if ((err as Error)?.message?.includes('does not exist')) {
      await tryFn(() => clouds.insert({
        id: cloudId,
        status: 'idle',
        totalResources: 0,
        totalVersions: 0,
        ...patch
      }));
    } else {
      this._log('warn', 'Failed to update cloud summary', { cloudId, error: (err as Error)?.message });
    }
  }

  private _log(level: string, message: string, meta: Record<string, unknown> = {}): void {
    if (this.config.logger) {
      this.config.logger(level, message, meta);
      return;
    }

    const shouldLog = (this.logLevel === 'debug' || this.logLevel === 'trace') || level === 'error' || level === 'warn';
    const consoleFn = (console as unknown as Record<string, ((...args: unknown[]) => void) | undefined>)[level];
    if (shouldLog && typeof consoleFn === 'function') {
      consoleFn(`[CloudInventoryPlugin] ${message}`, meta);
    }
  }
}

function ensureObject(value: unknown): unknown {
  if (value && typeof value === 'object') return value;
  return {};
}

function computeDigest(payload: Record<string, unknown>): string {
  const canonical = jsonStableStringify(payload ?? {}) ?? '{}';
  return createHash('sha256').update(canonical).digest('hex');
}

function buildVersionId(resourceKey: string, version: number): string {
  return `${resourceKey}:${String(version).padStart(6, '0')}`;
}

function buildSummary(normalized: NormalizedResource): Record<string, unknown> {
  return {
    name: normalized.name,
    region: normalized.region,
    service: normalized.service,
    resourceType: normalized.resourceType,
    tags: normalized.tags,
    labels: normalized.labels,
    metadata: normalized.metadata
  };
}

function computeDiff(previousConfig: Record<string, unknown> = {}, nextConfig: Record<string, unknown> = {}): DiffResult {
  const prevFlat = flatten(previousConfig, { safe: true }) || {};
  const nextFlat = flatten(nextConfig, { safe: true }) || {};

  const diff: DiffResult = {
    added: {},
    removed: {},
    updated: {}
  };

  for (const key of Object.keys(nextFlat)) {
    if (!(key in prevFlat)) {
      diff.added![key] = (nextFlat as Record<string, unknown>)[key];
    } else if (!isEqual((prevFlat as Record<string, unknown>)[key], (nextFlat as Record<string, unknown>)[key])) {
      diff.updated![key] = {
        before: (prevFlat as Record<string, unknown>)[key],
        after: (nextFlat as Record<string, unknown>)[key]
      };
    }
  }

  for (const key of Object.keys(prevFlat)) {
    if (!(key in nextFlat)) {
      diff.removed![key] = (prevFlat as Record<string, unknown>)[key];
    }
  }

  if (!Object.keys(diff.added!).length) delete diff.added;
  if (!Object.keys(diff.removed!).length) delete diff.removed;
  if (!Object.keys(diff.updated!).length) delete diff.updated;

  return diff;
}

function isAsyncIterable(obj: unknown): obj is AsyncIterable<unknown> {
  return !!(obj as Record<symbol, unknown>)?.[Symbol.asyncIterator];
}

function createRunIdentifier(): string {
  try {
    return randomUUID();
  } catch {
    return `run-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

function normalizeSchedule(input?: ScheduleInput): Schedule {
  const schedule: Schedule = {
    ...BASE_SCHEDULE,
    ...(typeof input === 'object' && input !== null ? input : {})
  };

  schedule.enabled = Boolean(schedule.enabled);
  schedule.cron = typeof schedule.cron === 'string' && schedule.cron.trim().length > 0
    ? schedule.cron.trim()
    : null;
  schedule.timezone = typeof schedule.timezone === 'string' && schedule.timezone.trim().length > 0
    ? schedule.timezone.trim()
    : undefined;
  schedule.runOnStart = Boolean(schedule.runOnStart);

  if (schedule.enabled && !schedule.cron) {
    throw new PluginError('Scheduled configuration requires a valid cron expression when enabled is true', {
      pluginName: 'CloudInventoryPlugin',
      operation: 'normalizeSchedule',
      statusCode: 400,
      retriable: false,
      suggestion: 'Set scheduled.cron to a valid cron expression (e.g., "0 * * * *") when enabling scheduled discovery.'
    });
  }

  return schedule;
}

function resolveDriverReference(driverInput: string | CloudDriverFactory, logFn: LogFunction): string {
  if (typeof driverInput === 'string') {
    return driverInput;
  }

  if (typeof driverInput === 'function') {
    if (INLINE_DRIVER_NAMES.has(driverInput)) {
      return INLINE_DRIVER_NAMES.get(driverInput)!;
    }

    const baseName = sanitizeId(driverInput.name || 'inline-driver');
    let candidate = `inline-${baseName}`;
    const existing = new Set(listCloudDrivers().concat([...INLINE_DRIVER_NAMES.values()]));

    let attempt = 1;
    while (existing.has(candidate)) {
      attempt += 1;
      candidate = `inline-${baseName}-${attempt}`;
    }

    registerCloudDriver(candidate, ((options: CloudDriverOptions) => instantiateInlineDriver(driverInput, options)) as any);
    INLINE_DRIVER_NAMES.set(driverInput, candidate);
    if (typeof logFn === 'function') {
      logFn('info', `Registered inline cloud driver "${candidate}"`, { driver: driverInput.name || 'anonymous' });
    }
    return candidate;
  }

  throw new PluginError('Cloud driver must be a string identifier or a factory/class that produces a BaseCloudDriver instance', {
    pluginName: 'CloudInventoryPlugin',
    operation: 'resolveDriverReference',
    statusCode: 400,
    retriable: false,
    suggestion: 'Register the driver name via registerCloudDriver() or supply a factory/class returning BaseCloudDriver.'
  });
}

function instantiateInlineDriver(driverInput: CloudDriverFactory, options: CloudDriverOptions): BaseCloudDriver {
  if (isSubclassOfBase(driverInput)) {
    return new (driverInput as unknown as new (options: CloudDriverOptions) => BaseCloudDriver)(options);
  }

  const result = driverInput(options);
  if (result instanceof BaseCloudDriver) {
    return result;
  }

  if (result && typeof result === 'object' && typeof (result as CloudDriver).listResources === 'function') {
    return result as BaseCloudDriver;
  }

  throw new PluginError('Inline driver factory must return an instance of BaseCloudDriver', {
    pluginName: 'CloudInventoryPlugin',
    operation: 'instantiateInlineDriver',
    statusCode: 500,
    retriable: false,
    suggestion: 'Ensure the inline driver function returns a BaseCloudDriver instance or class.'
  });
}

function isSubclassOfBase(fn: unknown): boolean {
  return typeof fn === 'function' && (fn === BaseCloudDriver || (fn as { prototype?: object }).prototype instanceof BaseCloudDriver);
}

function normalizeCloudDefinitions(rawClouds: CloudDefinition[], logFn: LogFunction): CloudDefinition[] {
  const usedIds = new Set<string>();
  const results: CloudDefinition[] = [];

  const emitLog = (level: string, message: string, meta: Record<string, unknown> = {}): void => {
    if (typeof logFn === 'function') {
      logFn(level, message, meta);
    }
  };

  for (const cloud of rawClouds) {
    if (!cloud || typeof cloud !== 'object') {
      continue;
    }

    const driverName = resolveDriverReference(cloud.driver, emitLog);
    const cloudWithDriver = { ...cloud, driver: driverName };

    let id = typeof cloudWithDriver.id === 'string' && cloudWithDriver.id.trim().length > 0
      ? cloudWithDriver.id.trim()
      : '';

    if (!id) {
      const derived = deriveCloudId(cloudWithDriver);
      let candidate = derived;
      let attempt = 1;
      while (usedIds.has(candidate)) {
        attempt += 1;
        candidate = `${derived}-${attempt}`;
      }
      id = candidate;
      emitLog('info', `Cloud id not provided for driver "${driverName}", using derived id "${id}"`, { driver: driverName });
    } else if (usedIds.has(id)) {
      let candidate = id;
      let attempt = 1;
      while (usedIds.has(candidate)) {
        attempt += 1;
        candidate = `${id}-${attempt}`;
      }
      emitLog('warn', `Duplicated cloud id "${id}" detected, using "${candidate}" instead`, { driver: driverName });
      id = candidate;
    }

    usedIds.add(id);
    results.push({ ...cloudWithDriver, id });
  }

  return results;
}

function deriveCloudId(cloud: CloudDefinition): string {
  const driver = (cloud.driver || 'cloud').toString().toLowerCase();
  const hints = extractIdentityHints(cloud);
  const base = hints.length > 0 ? `${driver}-${sanitizeId(hints[0]!)}` : driver;
  return base || driver;
}

function extractIdentityHints(cloud: CloudDefinition): string[] {
  const values: string[] = [];
  const candidatePaths: string[][] = [
    ['config', 'accountId'],
    ['config', 'projectId'],
    ['config', 'subscriptionId'],
    ['credentials', 'accountId'],
    ['credentials', 'accountNumber'],
    ['credentials', 'subscriptionId'],
    ['credentials', 'tenantId'],
    ['credentials', 'email'],
    ['credentials', 'user'],
    ['credentials', 'profile'],
    ['credentials', 'organizationId']
  ];

  for (const path of candidatePaths) {
    let ref: unknown = cloud;
    for (const segment of path) {
      if (ref && typeof ref === 'object' && segment in (ref as Record<string, unknown>)) {
        ref = (ref as Record<string, unknown>)[segment];
      } else {
        ref = null;
        break;
      }
    }
    if (typeof ref === 'string' && ref.trim().length > 0) {
      values.push(ref.trim());
    }
  }

  return values;
}

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cloud';
}

export default CloudInventoryPlugin;
