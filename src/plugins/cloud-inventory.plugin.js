import { createHash, randomUUID } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { flatten } from '../concerns/flatten.js';
import isEqual from 'lodash-es/isEqual.js';

import { Plugin } from './plugin.class.js';
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

const DEFAULT_DISCOVERY = {
  concurrency: 3,
  include: null,
  exclude: [],
  runOnInstall: true,
  dryRun: false
};

const DEFAULT_LOCK = {
  ttl: 300,
  timeout: 0
};

const BASE_SCHEDULE = {
  enabled: false,
  cron: null,
  timezone: undefined,
  runOnStart: false
};

const DEFAULT_TERRAFORM = {
  enabled: false,
  autoExport: false,
  output: null,
  outputType: 'file', // 'file', 's3', or 'custom'
  filters: {
    providers: [],
    resourceTypes: [],
    cloudId: null
  },
  terraformVersion: '1.5.0',
  serial: 1
};

const INLINE_DRIVER_NAMES = new Map();

/**
 * CloudInventoryPlugin
 *
 * Centralizes configuration snapshots collected from multiple cloud vendors.
 * For each discovered asset we store:
 *  - A canonical record with the latest configuration digest
 *  - Frozen configuration revisions (immutable history)
 *  - Structured diffs between revisions
 */
export class CloudInventoryPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    const pendingLogs = [];
    const normalizedClouds = normalizeCloudDefinitions(
      Array.isArray(options.clouds) ? options.clouds : [],
      (level, message, meta) => pendingLogs.push({ level, message, meta })
    );

    this._internalResourceOverrides = options.resourceNames || {};
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
        ...(options.discovery || {})
      },
      resourceNames: this.internalResourceNames,
      logger: typeof options.logger === 'function' ? options.logger : null,
      verbose: options.verbose === true,
      scheduled: normalizeSchedule(options.scheduled),
      lock: {
        ttl: options.lock?.ttl ?? DEFAULT_LOCK.ttl,
        timeout: options.lock?.timeout ?? DEFAULT_LOCK.timeout
      },
      terraform: {
        ...DEFAULT_TERRAFORM,
        ...(options.terraform || {}),
        filters: {
          ...DEFAULT_TERRAFORM.filters,
          ...(options.terraform?.filters || {})
        }
      }
    };

    this.cloudDrivers = new Map();
    this._resourceHandles = {};
    this._scheduledJobs = [];
    this._cron = null;
    this.resourceNames = this.internalResourceNames;

    for (const entry of pendingLogs) {
      this._log(entry.level, entry.message, entry.meta);
    }
  }

  async onInstall() {
    this._validateConfiguration();
    await this._ensureResources();
    await this._initializeDrivers();

    if (this.config.discovery.runOnInstall) {
      await this.syncAll();
    }
  }

  async onStart() {
    await this._setupSchedules();
  }

  async onStop() {
    await this._teardownSchedules();
    await this._destroyDrivers();
  }

  async onUninstall() {
    await this._teardownSchedules();
    await this._destroyDrivers();
  }

  onNamespaceChanged() {
    this.internalResourceNames = this._resolveInternalResourceNames();
    if (this.config) {
      this.config.resourceNames = this.internalResourceNames;
    }
    this.resourceNames = this.internalResourceNames;
    this._resourceHandles = {};
  }

  async syncAll(options = {}) {
    const results = [];
    for (const cloud of this.config.clouds) {
      const result = await this.syncCloud(cloud.id, options);
      results.push(result);
    }

    // Auto-export to Terraform after all clouds sync (if configured for global export)
    if (this.config.terraform.enabled && this.config.terraform.autoExport && !this.config.terraform.filters.cloudId) {
      await this._autoExportTerraform(null); // null = all clouds
    }

    return results;
  }

  async syncCloud(cloudId, options = {}) {
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
    const summaryResource = this._resourceHandles.clouds;

    const summaryBefore = (await summaryResource.getOrNull(cloudId))
      ?? await this._ensureCloudSummaryRecord(cloudId, definition, definition.scheduled);

    const storage = this.getStorage();
    const lockKey = `cloud-inventory-sync-${cloudId}`;
    const lock = await storage.acquireLock(lockKey, {
      ttl: this.config.lock.ttl,
      timeout: this.config.lock.timeout
    });

    if (!lock) {
      this._log('info', 'Cloud sync already running on another worker, skipping', { cloudId });
      return {
        cloudId,
        driver: definition.driver,
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

    let pendingCheckpoint = summaryBefore?.checkpoint ?? null;
    let pendingRateLimit = summaryBefore?.rateLimit ?? null;
    let pendingState = summaryBefore?.state ?? null;

    const runtimeContext = {
      checkpoint: summaryBefore?.checkpoint ?? null,
      state: summaryBefore?.state ?? null,
      emitCheckpoint: (value) => {
        if (value === undefined) return;
        pendingCheckpoint = value;
        this._updateCloudSummary(cloudId, {
          checkpoint: value,
          checkpointUpdatedAt: new Date().toISOString()
        }).catch(err => this._log('warn', 'Failed to persist checkpoint', { cloudId, error: err.message }));
      },
      emitRateLimit: (value) => {
        pendingRateLimit = value;
        this._updateCloudSummary(cloudId, {
          rateLimit: value,
          rateLimitUpdatedAt: new Date().toISOString()
        }).catch(err => this._log('warn', 'Failed to persist rate-limit metadata', { cloudId, error: err.message }));
      },
      emitState: (value) => {
        pendingState = value;
        this._updateCloudSummary(cloudId, {
          state: value,
          stateUpdatedAt: new Date().toISOString()
        }).catch(err => this._log('warn', 'Failed to persist driver state', { cloudId, error: err.message }));
      },
      emitProgress: (value) => {
        this._updateCloudSummary(cloudId, { progress: value })
          .catch(err => this._log('warn', 'Failed to persist progress', { cloudId, error: err.message }));
      }
    };

    try {
      let items;
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
          lastError: err.message || 'Driver failure during listResources'
        });
        throw err;
      }

      let countCreated = 0;
      let countUpdated = 0;
      let countUnchanged = 0;
      let processed = 0;
      let errorDuringRun = null;
      const startMs = Date.now();

      const processItem = async (rawItem) => {
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
          for await (const item of items) {
            await processItem(item);
          }
        } else if (Array.isArray(items)) {
          for (const item of items) {
            await processItem(item);
          }
        } else if (items) {
          await processItem(items);
        }
      } catch (err) {
        errorDuringRun = err;
      }

      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - startMs;

      const summaryPatch = {
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

      const summary = {
        cloudId,
        driver: definition.driver,
        created: countCreated,
        updated: countUpdated,
        unchanged: countUnchanged,
        processed,
        durationMs
      };

      this._log('info', 'Cloud sync finished', summary);

      // Auto-export to Terraform if configured
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
          error: releaseErr.message
        });
      }
    }
  }

  _validateConfiguration() {
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

  /**
   * Export discovered cloud resources to Terraform/OpenTofu state format
   * @param {Object} options - Export options
   * @param {Array<string>} options.resourceTypes - Filter by cloud resource types (e.g., ['aws.ec2.instance'])
   * @param {Array<string>} options.providers - Filter by provider (e.g., ['aws', 'gcp'])
   * @param {string} options.cloudId - Filter by specific cloud ID
   * @param {string} options.terraformVersion - Terraform version (default: '1.5.0')
   * @param {string} options.lineage - State lineage UUID (default: auto-generated)
   * @param {number} options.serial - State serial number (default: 1)
   * @param {Object} options.outputs - Terraform outputs (default: {})
   * @returns {Promise<Object>} - { state, stats }
   *
   * @example
   * // Export all resources
   * const result = await plugin.exportToTerraformState();
   * console.log(result.state); // Terraform state object
   * console.log(result.stats); // { total, converted, skipped }
   *
   * // Export specific provider
   * const awsOnly = await plugin.exportToTerraformState({ providers: ['aws'] });
   *
   * // Export specific resource types
   * const ec2Only = await plugin.exportToTerraformState({
   *   resourceTypes: ['aws.ec2.instance', 'aws.rds.instance']
   * });
   */
  async exportToTerraformState(options = {}) {
    const { exportToTerraformState: exportFn } = await import('./cloud-inventory/terraform-exporter.js');

    const {
      resourceTypes = [],
      providers = [],
      cloudId = null,
      ...exportOptions
    } = options;

    // Get snapshots resource
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

    // Build query filter
    const queryOptions = {};

    if (cloudId) {
      queryOptions.cloudId = cloudId;
    }

    // Fetch all snapshots (or filtered)
    const snapshots = await snapshotsResource.query(queryOptions);

    this._log('info', 'Exporting cloud inventory to Terraform state', {
      totalSnapshots: snapshots.length,
      resourceTypes: resourceTypes.length > 0 ? resourceTypes : 'all',
      providers: providers.length > 0 ? providers : 'all'
    });

    // Export to Terraform format
    const result = exportFn(snapshots, {
      ...exportOptions,
      resourceTypes,
      providers
    });

    this._log('info', 'Export complete', result.stats);

    return result;
  }

  /**
   * Export cloud inventory to Terraform state file
   * @param {string} filePath - Output file path
   * @param {Object} options - Export options (see exportToTerraformState)
   * @returns {Promise<Object>} - { filePath, stats }
   *
   * @example
   * // Export to file
   * await plugin.exportToTerraformStateFile('./terraform.tfstate');
   *
   * // Export AWS resources only
   * await plugin.exportToTerraformStateFile('./aws-resources.tfstate', {
   *   providers: ['aws']
   * });
   */
  async exportToTerraformStateFile(filePath, options = {}) {
    const { promises: fs } = await import('fs');
    const path = await import('path');

    const result = await this.exportToTerraformState(options);

    // Write to file
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(result.state, null, 2), 'utf8');

    this._log('info', `Terraform state exported to: ${filePath}`, result.stats);

    return {
      filePath,
      ...result
    };
  }

  /**
   * Export cloud inventory to Terraform state in S3
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @param {Object} options - Export options (see exportToTerraformState)
   * @returns {Promise<Object>} - { bucket, key, stats }
   *
   * @example
   * // Export to S3
   * await plugin.exportToTerraformStateToS3('my-bucket', 'terraform/state.tfstate');
   *
   * // Export GCP resources to S3
   * await plugin.exportToTerraformStateToS3('my-bucket', 'terraform/gcp.tfstate', {
   *   providers: ['gcp']
   * });
   */
  async exportToTerraformStateToS3(bucket, key, options = {}) {
    const result = await this.exportToTerraformState(options);

    // Get S3 client from database
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

    // Upload to S3
    await s3Client.putObject({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(result.state, null, 2),
      ContentType: 'application/json'
    });

    this._log('info', `Terraform state exported to S3: s3://${bucket}/${key}`, result.stats);

    return {
      bucket,
      key,
      ...result
    };
  }

  /**
   * Auto-export Terraform state after discovery (internal)
   * @private
   */
  async _autoExportTerraform(cloudId = null) {
    try {
      const { terraform } = this.config;
      const exportOptions = {
        ...terraform.filters,
        terraformVersion: terraform.terraformVersion,
        serial: terraform.serial
      };

      // If cloudId specified, override filter
      if (cloudId) {
        exportOptions.cloudId = cloudId;
      }

      this._log('info', 'Auto-exporting Terraform state', {
        output: terraform.output,
        outputType: terraform.outputType,
        cloudId: cloudId || 'all'
      });

      let result;

      // Determine output type and call appropriate export method
      if (terraform.outputType === 's3') {
        // Parse S3 URL: s3://bucket/path/to/file.tfstate
        const s3Match = terraform.output?.match(/^s3:\/\/([^/]+)\/(.+)$/);
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
        result = await this.exportToTerraformStateToS3(bucket, key, exportOptions);
      } else if (terraform.outputType === 'file') {
        // File path
        if (!terraform.output) {
          throw new PluginError('Terraform output path not configured', {
            pluginName: 'CloudInventoryPlugin',
            operation: '_autoExportTerraform',
            statusCode: 400,
            retriable: false,
            suggestion: 'Set terraform.output to a file path (e.g., ./terraform/state.tfstate) when using outputType "file".'
          });
        }
        result = await this.exportToTerraformStateFile(terraform.output, exportOptions);
      } else {
        // Custom function (user-provided)
        if (typeof terraform.output === 'function') {
          const stateData = await this.exportToTerraformState(exportOptions);
          result = await terraform.output(stateData);
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

      this._log('info', 'Terraform state auto-export completed', result.stats);
    } catch (err) {
      this._log('error', 'Failed to auto-export Terraform state', {
        error: err.message,
        stack: err.stack
      });
      // Don't throw - auto-export is best-effort
    }
  }

  async _ensureResources() {
    const names = this.internalResourceNames;
    const snapshots = names.snapshots;
    const versions = names.versions;
    const changes = names.changes;
    const clouds = names.clouds;

    const resourceDefinitions = [
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
      const [ok, err] = await tryFn(() => this.database.createResource(definition));
      if (!ok && err?.message?.includes('already exists')) {
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

  _resolveInternalResourceNames() {
    return resolveResourceNames('cloud_inventory', this._internalResourceDescriptors, {
      namespace: this.namespace
    });
  }

  async _initializeDrivers() {
    for (const cloudDef of this.config.clouds) {
      const driverId = cloudDef.id;
      if (this.cloudDrivers.has(driverId)) continue;

      const schedule = normalizeSchedule(cloudDef.scheduled);
      const summary = await this._ensureCloudSummaryRecord(driverId, cloudDef, schedule);

      const driver = await createCloudDriver(cloudDef.driver, {
        ...cloudDef,
        globals: this.config,
        schedule,
        logger: (level, message, meta = {}) => {
          this._log(level, message, { cloudId: driverId, driver: cloudDef.driver, ...meta });
        }
      });

      await driver.initialize();
      this.cloudDrivers.set(driverId, {
        driver,
        definition: { ...cloudDef, scheduled: schedule },
        summary
      });
      this._log('info', 'Cloud driver initialized', { cloudId: driverId, driver: cloudDef.driver });
    }
  }

  async _destroyDrivers() {
    for (const [cloudId, { driver }] of this.cloudDrivers.entries()) {
      try {
        await driver.destroy?.();
      } catch (err) {
        this._log('warn', 'Failed to destroy cloud driver', { cloudId, error: err.message });
      }
    }
    this.cloudDrivers.clear();
  }

  async _setupSchedules() {
    await this._teardownSchedules();

    const globalSchedule = this.config.scheduled;
    const cloudsWithSchedule = [...this.cloudDrivers.values()]
      .filter(entry => entry.definition.scheduled?.enabled);

    const needsCron = globalSchedule.enabled || cloudsWithSchedule.length > 0;
    if (!needsCron) return;

    await requirePluginDependency('cloud-inventory-plugin');

    if (!this._cron) {
      const cronModule = await import('node-cron');
      this._cron = cronModule.default || cronModule;
    }

    if (globalSchedule.enabled) {
      this._scheduleJob(globalSchedule, async () => {
        try {
          await this.syncAll({ reason: 'scheduled-global' });
        } catch (err) {
          this._log('error', 'Scheduled global sync failed', { error: err.message });
        }
      });

      if (globalSchedule.runOnStart) {
        this.syncAll({ reason: 'scheduled-global-runOnStart' }).catch(err => {
          this._log('error', 'Initial global scheduled sync failed', { error: err.message });
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
          this._log('error', 'Scheduled cloud sync failed', { cloudId, error: err.message });
        }
      });

      if (schedule.runOnStart) {
        this.syncCloud(cloudId, { reason: 'scheduled-cloud-runOnStart' }).catch(err => {
          this._log('error', 'Initial cloud scheduled sync failed', { cloudId, error: err.message });
        });
      }
    }
  }

  _scheduleJob(schedule, handler) {
    if (!this._cron) return;
    const job = this._cron.schedule(
      schedule.cron,
      handler,
      { timezone: schedule.timezone }
    );
    if (job?.start) {
      job.start();
    }
    this._scheduledJobs.push(job);
  }

  async _teardownSchedules() {
    if (!this._scheduledJobs.length) return;
    for (const job of this._scheduledJobs) {
      try {
        job?.stop?.();
        job?.destroy?.();
      } catch (err) {
        this._log('warn', 'Failed to teardown scheduled job', { error: err.message });
      }
    }
    this._scheduledJobs = [];
  }

  _normalizeResource(cloudDefinition, entry) {
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

    const normalized = {
      cloudId: cloudDefinition.id,
      driver: cloudDefinition.driver,
      accountId: entry.accountId || cloudDefinition.config?.accountId || null,
      subscriptionId: entry.subscriptionId || null,
      organizationId: entry.organizationId || null,
      projectId: entry.projectId || cloudDefinition.config?.projectId || null,
      region: entry.region || entry.location || null,
      service: entry.service || entry.product || null,
      resourceType: entry.resourceType || entry.type || 'unknown',
      resourceId: entry.resourceId || entry.id || configuration.id || configuration.arn || configuration.name,
      name: entry.name || configuration.name || configuration.displayName || null,
      tags: entry.tags || configuration.tags || null,
      labels: entry.labels || configuration.labels || null,
      metadata: entry.metadata || {},
      configuration
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

  async _persistSnapshot(normalized, rawItem) {
    const now = new Date().toISOString();
    const digest = computeDigest(normalized.configuration);
    const resourceKey = normalized.resourceKey;

    const snapshots = this._resourceHandles.snapshots;
    const versions = this._resourceHandles.versions;
    const changes = this._resourceHandles.changes;

    const existing = await snapshots.getOrNull(resourceKey);

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
      return { status: 'unchanged', resourceKey, version: existing.latestVersion };
    }

    const previousVersionId = existing.latestSnapshotId;
    const previousVersion = await versions.getOrNull(previousVersionId);
    const nextVersionNumber = existing.latestVersion + 1;
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

    const diff = computeDiff(previousVersion?.configuration, normalized.configuration);
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
      changelogSize: (existing.changelogSize || 0) + 1,
      metadata: normalized.metadata,
      tags: normalized.tags,
      labels: normalized.labels,
      region: normalized.region,
      service: normalized.service,
      name: normalized.name
    });

    return { status: 'updated', resourceKey, version: nextVersionNumber };
  }

  async _ensureCloudSummaryRecord(cloudId, cloudDef, schedule) {
    const clouds = this._resourceHandles.clouds;
    const existing = await clouds.getOrNull(cloudId);

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
      return await clouds.get(cloudId);
    }

    await clouds.update(cloudId, payload);
    return await clouds.get(cloudId);
  }

  async _updateCloudSummary(cloudId, patch) {
    const clouds = this._resourceHandles.clouds;
    if (!clouds) return;

    const [ok, err] = await tryFn(() => clouds.update(cloudId, patch));
    if (ok) return;

    if (err?.message?.includes('does not exist')) {
      await tryFn(() => clouds.insert({
        id: cloudId,
        status: 'idle',
        totalResources: 0,
        totalVersions: 0,
        ...patch
      }));
    } else {
      this._log('warn', 'Failed to update cloud summary', { cloudId, error: err?.message });
    }
  }

  _log(level, message, meta = {}) {
    if (this.config.logger) {
      this.config.logger(level, message, meta);
      return;
    }

    const shouldLog = this.config.verbose || level === 'error' || level === 'warn';
    if (shouldLog && typeof console[level] === 'function') {
      console[level](`[CloudInventoryPlugin] ${message}`, meta);
    }
  }
}

function ensureObject(value) {
  if (value && typeof value === 'object') return value;
  return {};
}

function computeDigest(payload) {
  const canonical = jsonStableStringify(payload ?? {});
  return createHash('sha256').update(canonical).digest('hex');
}

function buildVersionId(resourceKey, version) {
  return `${resourceKey}:${String(version).padStart(6, '0')}`;
}

function buildSummary(normalized) {
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

function computeDiff(previousConfig = {}, nextConfig = {}) {
  const prevFlat = flatten(previousConfig, { safe: true }) || {};
  const nextFlat = flatten(nextConfig, { safe: true }) || {};

  const diff = {
    added: {},
    removed: {},
    updated: {}
  };

  for (const key of Object.keys(nextFlat)) {
    if (!(key in prevFlat)) {
      diff.added[key] = nextFlat[key];
    } else if (!isEqual(prevFlat[key], nextFlat[key])) {
      diff.updated[key] = {
        before: prevFlat[key],
        after: nextFlat[key]
      };
    }
  }

  for (const key of Object.keys(prevFlat)) {
    if (!(key in nextFlat)) {
      diff.removed[key] = prevFlat[key];
    }
  }

  if (!Object.keys(diff.added).length) delete diff.added;
  if (!Object.keys(diff.removed).length) delete diff.removed;
  if (!Object.keys(diff.updated).length) delete diff.updated;

  return diff;
}

function isAsyncIterable(obj) {
  return obj?.[Symbol.asyncIterator];
}

function createRunIdentifier() {
  try {
    return randomUUID();
  } catch {
    return `run-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

function normalizeSchedule(input) {
  const schedule = {
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

function resolveDriverReference(driverInput, logFn) {
  if (typeof driverInput === 'string') {
    return driverInput;
  }

  if (typeof driverInput === 'function') {
    if (INLINE_DRIVER_NAMES.has(driverInput)) {
      return INLINE_DRIVER_NAMES.get(driverInput);
    }

    const baseName = sanitizeId(driverInput.name || 'inline-driver');
    let candidate = `inline-${baseName}`;
    const existing = new Set(listCloudDrivers().concat([...INLINE_DRIVER_NAMES.values()]));

    let attempt = 1;
    while (existing.has(candidate)) {
      attempt += 1;
      candidate = `inline-${baseName}-${attempt}`;
    }

    registerCloudDriver(candidate, (options) => instantiateInlineDriver(driverInput, options));
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

function instantiateInlineDriver(driverInput, options) {
  if (isSubclassOfBase(driverInput)) {
    return new driverInput(options);
  }

  const result = driverInput(options);
  if (result instanceof BaseCloudDriver) {
    return result;
  }

  if (result && typeof result === 'object' && typeof result.listResources === 'function') {
    return result;
  }

  throw new PluginError('Inline driver factory must return an instance of BaseCloudDriver', {
    pluginName: 'CloudInventoryPlugin',
    operation: 'instantiateInlineDriver',
    statusCode: 500,
    retriable: false,
    suggestion: 'Ensure the inline driver function returns a BaseCloudDriver instance or class.'
  });
}

function isSubclassOfBase(fn) {
  return typeof fn === 'function' && (fn === BaseCloudDriver || fn.prototype instanceof BaseCloudDriver);
}

function normalizeCloudDefinitions(rawClouds, logFn) {
  const usedIds = new Set();
  const results = [];

  const emitLog = (level, message, meta = {}) => {
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
      : null;

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

function deriveCloudId(cloud) {
  const driver = (cloud.driver || 'cloud').toString().toLowerCase();
  const hints = extractIdentityHints(cloud);
  const base = hints.length > 0 ? `${driver}-${sanitizeId(hints[0])}` : driver;
  return base || driver;
}

function extractIdentityHints(cloud) {
  const values = [];
  const candidatePaths = [
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
    let ref = cloud;
    for (const segment of path) {
      if (ref && typeof ref === 'object' && segment in ref) {
        ref = ref[segment];
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

function sanitizeId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cloud';
}

export default CloudInventoryPlugin;
