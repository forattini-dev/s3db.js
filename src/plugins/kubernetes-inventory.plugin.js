/**
 * KubernetesInventoryPlugin
 *
 * Collects and tracks all resources from Kubernetes clusters.
 * For each discovered resource we store:
 *  - A snapshot with the latest configuration digest
 *  - Immutable configuration versions (history)
 *  - Structured diffs between versions
 *
 * Supports:
 *  - Multi-cluster inventory
 *  - Core resources + Custom Resource Definitions (CRDs)
 *  - Select/ignore filtering
 *  - Scheduled discovery
 *  - Distributed locking
 */

import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import isEqual from 'lodash-es/isEqual.js';

import { Plugin } from './plugin.class.js';
import { PluginError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';
import { KubernetesDriver } from './kubernetes-inventory/k8s-driver.js';
import { formatResourceTypeId, parseResourceTypeId } from './kubernetes-inventory/resource-types.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { createLogger } from '../concerns/logger.js';

const DEFAULT_DISCOVERY = {
  concurrency: 2,
  select: null, // null = allow all
  ignore: [],   // empty = ignore nothing
  runOnInstall: true,
  dryRun: false,
};

const DEFAULT_LOCK = {
  ttl: 600, // 10 minutes (K8s can be slow)
  timeout: 0,
};

const BASE_SCHEDULE = {
  enabled: false,
  cron: null,
  timezone: undefined,
  runOnStart: false,
};

/**
 * Normalize cluster definitions
 */
function normalizeClusterDefinitions(clusters, logger) {
  return clusters.map((cluster, index) => {
    // Auto-generate ID if not provided
    if (!cluster.id) {
      cluster.id = `k8s-cluster-${index + 1}`;
      logger('debug', `Auto-generated cluster ID: ${cluster.id}`);
    }

    // Set name to ID if not provided
    if (!cluster.name) {
      cluster.name = cluster.id;
    }

    // Normalize discovery options
    cluster.discovery = cluster.discovery || {};

    // Normalize scheduled
    cluster.scheduled = normalizeSchedule(cluster.scheduled);

    // Tags and metadata
    cluster.tags = cluster.tags || {};
    cluster.metadata = cluster.metadata || {};

    return cluster;
  });
}

/**
 * Normalize schedule configuration
 */
function normalizeSchedule(schedule) {
  if (!schedule) return { ...BASE_SCHEDULE };
  if (typeof schedule !== 'object') return { ...BASE_SCHEDULE };

  return {
    enabled: schedule.enabled === true,
    cron: schedule.cron || null,
    timezone: schedule.timezone,
    runOnStart: schedule.runOnStart === true,
  };
}

/**
 * KubernetesInventoryPlugin Class
 */
export class KubernetesInventoryPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    // 🪵 Logger initialization
    if (options.logger && typeof options.logger !== 'function') {
      this.logger = options.logger;
    } else {
      const logLevel = this.verbose ? 'debug' : 'info';
      this.logger = createLogger({ name: 'KubernetesInventoryPlugin', level: logLevel });
    }

    const {
      clusters,
      resourceNames = {},
      discovery = {},
      logger,
      scheduled,
      lock = {},
      ...rest
    } = this.options;

    const pendingLogs = [];
    const normalizedClusters = normalizeClusterDefinitions(
      Array.isArray(clusters) ? clusters : [],
      (level, message, meta) => pendingLogs.push({ level, message, meta })
    );

    this._internalResourceOverrides = resourceNames;
    this._internalResourceDescriptors = {
      snapshots: {
        defaultName: 'plg_k8s_inventory_snapshots',
        override: this._internalResourceOverrides.snapshots,
      },
      versions: {
        defaultName: 'plg_k8s_inventory_versions',
        override: this._internalResourceOverrides.versions,
      },
      changes: {
        defaultName: 'plg_k8s_inventory_changes',
        override: this._internalResourceOverrides.changes,
      },
      clusters: {
        defaultName: 'plg_k8s_inventory_clusters',
        override: this._internalResourceOverrides.clusters,
      },
    };
    this.internalResourceNames = this._resolveInternalResourceNames();

    this.config = {
      clusters: normalizedClusters,
      discovery: {
        ...DEFAULT_DISCOVERY,
        ...(discovery || {}),
      },
      resourceNames: this.internalResourceNames,
      logger: typeof logger === 'function' ? logger : null,
      verbose: this.verbose,
      scheduled: normalizeSchedule(scheduled),
      lock: {
        ttl: lock?.ttl ?? DEFAULT_LOCK.ttl,
        timeout: lock?.timeout ?? DEFAULT_LOCK.timeout,
      },
      ...rest,
    };

    this.clusterDrivers = new Map();
    this._resourceHandles = {};
    this._scheduledJobs = [];
    this._cron = null;
    this.resourceNames = this.internalResourceNames;

    for (const entry of pendingLogs) {
      this._log(entry.level, entry.message, entry.meta);
    }
  }

  // ============================================
  // LIFECYCLE HOOKS
  // ============================================

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

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Sync all clusters
   */
  async syncAll(options = {}) {
    const results = [];
    for (const cluster of this.config.clusters) {
      const result = await this.syncCluster(cluster.id, options);
      results.push(result);
    }
    return results;
  }

  /**
   * Sync specific cluster
   */
  async syncCluster(clusterId, options = {}) {
    const driverEntry = this.clusterDrivers.get(clusterId);
    if (!driverEntry) {
      throw new PluginError(`Cluster "${clusterId}" is not registered`, {
        pluginName: 'KubernetesInventoryPlugin',
        operation: 'syncCluster',
        statusCode: 404,
        retriable: false,
        suggestion: `Register the cluster in KubernetesInventoryPlugin configuration. Available: ${[...this.clusterDrivers.keys()].join(', ') || 'none'}.`,
        clusterId,
      });
    }

    const { driver, definition } = driverEntry;
    const summaryResource = this._resourceHandles.clusters;

    const summaryBefore = (await summaryResource.getOrNull(clusterId))
      ?? await this._ensureClusterSummaryRecord(clusterId, definition, definition.scheduled);

    const storage = this.getStorage();
    const lockKey = `k8s-inventory-sync-${clusterId}`;
    const lock = await storage.acquireLock(lockKey, {
      ttl: this.config.lock.ttl,
      timeout: this.config.lock.timeout,
    });

    if (!lock) {
      this._log('warn', `Could not acquire lock for cluster sync: ${clusterId}`, { clusterId, lockKey });
      return {
        clusterId,
        skipped: true,
        reason: 'lock-not-acquired',
        lockKey,
      };
    }

    const startTime = Date.now();

    try {
      await summaryResource.patch(clusterId, {
        status: 'running',
        lastRunAt: new Date().toISOString(),
      });

      const checkpoint = summaryBefore.checkpoint || null;
      const state = summaryBefore.state || {};

      const runtime = {
        emitProgress: (data) => this._emitProgress(clusterId, data),
        emitCheckpoint: async (data) => {
          await summaryResource.patch(clusterId, { checkpoint: data });
        },
      };

      const counters = {
        total: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        errors: 0,
      };

      const discoveryOptions = {
        checkpoint,
        state,
        runtime,
        ...options,
      };

      // List resources from driver
      const resourceIterator = driver.listResources(discoveryOptions);

      for await (const resource of resourceIterator) {
        counters.total++;

        // Apply filtering
        if (!this._shouldIncludeResource(resource)) {
          continue;
        }

        // Persist snapshot
        if (!this.config.discovery.dryRun) {
          const [ok, err, result] = await tryFn(async () => {
            return await this._persistSnapshot(resource, resource);
          });

          if (ok) {
            if (result.status === 'created') counters.created++;
            else if (result.status === 'updated') counters.updated++;
            else if (result.status === 'unchanged') counters.unchanged++;
          } else {
            counters.errors++;
            this._log('error', `Failed to persist resource snapshot: ${err.message}`, {
              clusterId,
              resourceType: resource.resourceType,
              resourceId: resource.resourceId,
              error: err.message,
            });
          }
        }
      }

      const duration = Date.now() - startTime;

      // Update cluster summary
      await summaryResource.patch(clusterId, {
        status: 'idle',
        lastResult: {
          success: true,
          timestamp: new Date().toISOString(),
          duration,
          counters,
        },
        checkpoint: null, // Clear checkpoint on success
        state: {}, // Clear state on success
      });

      this._log('info', `Cluster sync completed: ${clusterId}`, { clusterId, duration, counters });

      return {
        clusterId,
        success: true,
        duration,
        ...counters,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      await summaryResource.patch(clusterId, {
        status: 'error',
        lastResult: {
          success: false,
          timestamp: new Date().toISOString(),
          duration,
          error: error.message,
        },
      });

      this._log('error', `Cluster sync failed: ${clusterId}`, {
        clusterId,
        error: error.message,
        stack: error.stack,
      });

      throw error;
    } finally {
      await storage.releaseLock(lock);
    }
  }

  /**
   * Discover available resource types in a cluster
   */
  async discoverResourceTypes(clusterId, options = {}) {
    const driverEntry = this.clusterDrivers.get(clusterId);
    if (!driverEntry) {
      throw new PluginError(`Cluster "${clusterId}" is not registered`, {
        pluginName: 'KubernetesInventoryPlugin',
        operation: 'discoverResourceTypes',
        clusterId,
      });
    }

    const { driver } = driverEntry;
    return await driver.discoverResourceTypes(options);
  }

  /**
   * Get snapshots (latest state of resources)
   */
  async getSnapshots(filter = {}) {
    const resource = this._resourceHandles.snapshots;
    const query = {};

    if (filter.clusterId) query.clusterId = filter.clusterId;
    if (filter.resourceType) query.resourceType = filter.resourceType;
    if (filter.namespace) query.namespace = filter.namespace;

    return await resource.query(query);
  }

  /**
   * Get version history for a resource
   */
  async getVersions(filter = {}) {
    const resource = this._resourceHandles.versions;
    const query = {};

    if (filter.clusterId) query.clusterId = filter.clusterId;
    if (filter.resourceType) query.resourceType = filter.resourceType;
    if (filter.resourceId) query.resourceId = filter.resourceId;

    return await resource.query(query);
  }

  /**
   * Get changes (diffs) for resources
   */
  async getChanges(filter = {}) {
    const resource = this._resourceHandles.changes;
    const query = {};

    if (filter.clusterId) query.clusterId = filter.clusterId;
    if (filter.resourceType) query.resourceType = filter.resourceType;
    if (filter.resourceId) query.resourceId = filter.resourceId;

    // Filter by time if provided
    if (filter.since) {
      const results = await resource.query(query);
      return results.filter(change => new Date(change.createdAt) >= new Date(filter.since));
    }

    return await resource.query(query);
  }

  // ============================================
  // INTERNAL METHODS
  // ============================================

  /**
   * Validate plugin configuration
   */
  _validateConfiguration() {
    if (!this.config.clusters || this.config.clusters.length === 0) {
      throw new PluginError('At least one cluster must be configured', {
        pluginName: 'KubernetesInventoryPlugin',
        operation: 'validateConfiguration',
      });
    }

    // Validate cluster IDs are unique
    const clusterIds = this.config.clusters.map(c => c.id);
    const duplicates = clusterIds.filter((id, index) => clusterIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      throw new PluginError(`Duplicate cluster IDs found: ${duplicates.join(', ')}`, {
        pluginName: 'KubernetesInventoryPlugin',
        operation: 'validateConfiguration',
      });
    }
  }

  /**
   * Create internal resources for storing inventory data
   */
  async _ensureResources() {
    const { database } = this;

    // Snapshots resource (latest state of each resource)
    this._resourceHandles.snapshots = await database.createResource({
      name: this.config.resourceNames.snapshots,
      createdBy: 'KubernetesInventoryPlugin',
      attributes: {
        clusterId: 'string|required',
        namespace: 'string',
        resourceType: 'string|required',
        resourceId: 'string|required',
        uid: 'string',
        name: 'string',
        apiVersion: 'string',
        kind: 'string',
        labels: 'object',
        annotations: 'object',
        latestDigest: 'string|required',
        latestVersion: 'number|required|integer|min:1',
        changelogSize: 'number|required|integer|min:0',
        firstSeenAt: 'string|required',
        lastSeenAt: 'string|required',
        createdAt: 'string|required',
        updatedAt: 'string|required',
      },
      partitions: {
        byClusterId: { fields: { clusterId: 'string' } },
        byResourceType: { fields: { resourceType: 'string' } },
        byClusterAndType: { fields: { clusterId: 'string', resourceType: 'string' } },
        byNamespace: { fields: { namespace: 'string' } },
      },
      timestamps: false,
    });

    // Versions resource (immutable history)
    this._resourceHandles.versions = await database.createResource({
      name: this.config.resourceNames.versions,
      createdBy: 'KubernetesInventoryPlugin',
      attributes: {
        clusterId: 'string|required',
        resourceType: 'string|required',
        resourceId: 'string|required',
        uid: 'string',
        namespace: 'string',
        version: 'number|required|integer|min:1',
        digest: 'string|required',
        capturedAt: 'string|required',
        configuration: 'object|required',
        summary: 'object',
        raw: 'object',
      },
      partitions: {
        byResourceKey: {
          fields: { clusterId: 'string', resourceType: 'string', resourceId: 'string' },
        },
        byClusterId: { fields: { clusterId: 'string' } },
      },
      timestamps: true,
    });

    // Changes resource (diffs between versions)
    this._resourceHandles.changes = await database.createResource({
      name: this.config.resourceNames.changes,
      createdBy: 'KubernetesInventoryPlugin',
      attributes: {
        clusterId: 'string|required',
        resourceType: 'string|required',
        resourceId: 'string|required',
        fromVersion: 'number|required|integer|min:1',
        toVersion: 'number|required|integer|min:1',
        diff: 'object|required',
      },
      partitions: {
        byResourceKey: {
          fields: { clusterId: 'string', resourceType: 'string', resourceId: 'string' },
        },
        byClusterId: { fields: { clusterId: 'string' } },
      },
      timestamps: true,
    });

    // Clusters resource (cluster metadata and sync status)
    this._resourceHandles.clusters = await database.createResource({
      name: this.config.resourceNames.clusters,
      createdBy: 'KubernetesInventoryPlugin',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        status: 'string|required|enum:idle,running,error',
        lastRunAt: 'string',
        lastResult: 'object',
        checkpoint: 'object',
        state: 'object',
        schedule: 'object',
        tags: 'object',
        metadata: 'object',
      },
      timestamps: true,
    });

    this._log('info', 'Internal resources created successfully');
  }

  /**
   * Initialize Kubernetes drivers for each cluster
   */
  async _initializeDrivers() {
    for (const clusterDef of this.config.clusters) {
      const driver = new KubernetesDriver({
        ...clusterDef,
        logger: this.config.logger,
        verbose: this.config.verbose,
      });

      await driver.initialize();

      this.clusterDrivers.set(clusterDef.id, {
        driver,
        definition: clusterDef,
      });

      this._log('info', `Initialized driver for cluster: ${clusterDef.id}`);
    }
  }

  /**
   * Destroy all drivers
   */
  async _destroyDrivers() {
    for (const [clusterId, { driver }] of this.clusterDrivers.entries()) {
      await driver.destroy();
      this._log('info', `Destroyed driver for cluster: ${clusterId}`);
    }
    this.clusterDrivers.clear();
  }

  /**
   * Ensure cluster summary record exists
   */
  async _ensureClusterSummaryRecord(clusterId, definition, schedule) {
    const summaryResource = this._resourceHandles.clusters;

    return await summaryResource.insert({
      id: clusterId,
      name: definition.name || clusterId,
      status: 'idle',
      lastRunAt: null,
      lastResult: null,
      checkpoint: null,
      state: {},
      schedule,
      tags: definition.tags || {},
      metadata: definition.metadata || {},
    });
  }

  /**
   * Persist snapshot and track version history
   */
  async _persistSnapshot(normalized, rawItem) {
    const snapshotResource = this._resourceHandles.snapshots;
    const versionResource = this._resourceHandles.versions;
    const changeResource = this._resourceHandles.changes;

    const resourceKey = this._buildResourceKey(normalized);
    const digest = this._computeDigest(normalized.configuration);

    // Try to get existing snapshot
    const existingSnapshot = await snapshotResource.getOrNull(resourceKey);

    const now = new Date().toISOString();

    if (!existingSnapshot) {
      // NEW RESOURCE
      await versionResource.insert({
        clusterId: normalized.clusterId,
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        uid: normalized.uid,
        namespace: normalized.namespace,
        version: 1,
        digest,
        capturedAt: now,
        configuration: normalized.configuration,
        summary: this._extractSummary(normalized),
        raw: rawItem,
      });

      await snapshotResource.insert({
        id: resourceKey,
        clusterId: normalized.clusterId,
        namespace: normalized.namespace,
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        uid: normalized.uid,
        name: normalized.name,
        apiVersion: normalized.apiVersion,
        kind: normalized.kind,
        labels: normalized.labels,
        annotations: normalized.annotations,
        latestDigest: digest,
        latestVersion: 1,
        changelogSize: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return { status: 'created', resourceKey, version: 1, digest };
    }

    // EXISTING RESOURCE
    if (existingSnapshot.latestDigest === digest) {
      // UNCHANGED
      await snapshotResource.patch(resourceKey, {
        lastSeenAt: now,
        updatedAt: now,
      });

      return { status: 'unchanged', resourceKey, version: existingSnapshot.latestVersion, digest };
    }

    // CHANGED
    const newVersion = existingSnapshot.latestVersion + 1;

    // Store new version
    await versionResource.insert({
      clusterId: normalized.clusterId,
      resourceType: normalized.resourceType,
      resourceId: normalized.resourceId,
      uid: normalized.uid,
      namespace: normalized.namespace,
      version: newVersion,
      digest,
      capturedAt: now,
      configuration: normalized.configuration,
      summary: this._extractSummary(normalized),
      raw: rawItem,
    });

    // Compute diff
    const previousVersions = await versionResource.query({
      clusterId: normalized.clusterId,
      resourceType: normalized.resourceType,
      resourceId: normalized.resourceId,
      version: existingSnapshot.latestVersion,
    });

    if (previousVersions.length > 0) {
      const previousVersion = previousVersions[0];
      const diff = this._computeDiff(previousVersion.configuration, normalized.configuration);

      await changeResource.insert({
        clusterId: normalized.clusterId,
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        fromVersion: existingSnapshot.latestVersion,
        toVersion: newVersion,
        diff,
      });
    }

    // Update snapshot
    await snapshotResource.patch(resourceKey, {
      latestDigest: digest,
      latestVersion: newVersion,
      changelogSize: existingSnapshot.changelogSize + 1,
      lastSeenAt: now,
      updatedAt: now,
      labels: normalized.labels,
      annotations: normalized.annotations,
    });

    return { status: 'updated', resourceKey, version: newVersion, digest };
  }

  /**
   * Build unique resource key
   */
  _buildResourceKey(normalized) {
    const parts = [
      normalized.clusterId,
      normalized.resourceType,
      normalized.namespace || 'cluster',
      normalized.resourceId,
    ];
    return parts.join('::');
  }

  /**
   * Compute digest (SHA256) of configuration
   */
  _computeDigest(configuration) {
    const canonical = jsonStableStringify(configuration);
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Extract summary information
   */
  _extractSummary(normalized) {
    return {
      name: normalized.name,
      namespace: normalized.namespace,
      kind: normalized.kind,
      apiVersion: normalized.apiVersion,
      labels: normalized.labels,
      annotations: normalized.annotations,
    };
  }

  /**
   * Compute diff between two configurations
   */
  _computeDiff(oldConfig, newConfig) {
    const diff = {
      added: {},
      removed: {},
      updated: {},
    };

    const oldKeys = new Set(Object.keys(oldConfig || {}));
    const newKeys = new Set(Object.keys(newConfig || {}));

    // Added keys
    for (const key of newKeys) {
      if (!oldKeys.has(key)) {
        diff.added[key] = newConfig[key];
      }
    }

    // Removed keys
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        diff.removed[key] = oldConfig[key];
      }
    }

    // Updated keys
    for (const key of newKeys) {
      if (oldKeys.has(key) && !isEqual(oldConfig[key], newConfig[key])) {
        diff.updated[key] = {
          old: oldConfig[key],
          new: newConfig[key],
        };
      }
    }

    return diff;
  }

  /**
   * Check if resource should be included based on filters
   */
  _shouldIncludeResource(resource) {
    const { select, ignore } = this.config.discovery;

    // Apply select filter first (whitelist)
    if (select !== null) {
      if (!this._matchesFilter(resource, select)) {
        return false;
      }
    }

    // Apply ignore filter (blacklist)
    if (ignore && ignore.length > 0) {
      if (this._matchesFilter(resource, ignore)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if resource matches a filter
   */
  _matchesFilter(resource, filter) {
    // Function filter
    if (typeof filter === 'function') {
      return filter(resource);
    }

    // Array filter
    if (Array.isArray(filter)) {
      for (const pattern of filter) {
        if (this._matchesPattern(resource, pattern)) {
          return true;
        }
      }
      return false;
    }

    // Single pattern
    return this._matchesPattern(resource, filter);
  }

  /**
   * Check if resource matches a pattern
   */
  _matchesPattern(resource, pattern) {
    // Function pattern
    if (typeof pattern === 'function') {
      return pattern(resource);
    }

    // String pattern (resource type matching)
    if (typeof pattern === 'string') {
      const resourceType = resource.resourceType;

      // Exact match
      if (resourceType === pattern) {
        return true;
      }

      // Wildcard matching (e.g., "core.*", "*.Pod")
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(resourceType);
    }

    return false;
  }

  /**
   * Setup scheduled jobs
   */
  async _setupSchedules() {
    // Require node-cron if scheduling is enabled
    const needsCron = this.config.scheduled.enabled ||
      this.config.clusters.some(c => c.scheduled?.enabled);

    if (!needsCron) {
      this._log('debug', 'No schedules configured, skipping cron setup');
      return;
    }

    this._cron = requirePluginDependency('node-cron', 'KubernetesInventoryPlugin (for scheduling)');

    // Global schedule (applies to all clusters without per-cluster schedule)
    if (this.config.scheduled.enabled && this.config.scheduled.cron) {
      const job = this._scheduleJob(
        this.config.scheduled,
        async () => {
          this._log('info', 'Running global scheduled discovery');
          await this.syncAll();
        }
      );
      this._scheduledJobs.push({ type: 'global', job });
      this._log('info', `Global schedule configured: ${this.config.scheduled.cron}`);
    }

    // Per-cluster schedules
    for (const cluster of this.config.clusters) {
      if (cluster.scheduled?.enabled && cluster.scheduled?.cron) {
        const job = this._scheduleJob(
          cluster.scheduled,
          async () => {
            this._log('info', `Running scheduled discovery for cluster: ${cluster.id}`, { clusterId: cluster.id });
            await this.syncCluster(cluster.id);
          }
        );
        this._scheduledJobs.push({ type: 'cluster', clusterId: cluster.id, job });
        this._log('info', `Cluster schedule configured: ${cluster.id} -> ${cluster.scheduled.cron}`);
      }
    }
  }

  /**
   * Schedule a single job
   */
  _scheduleJob(schedule, handler) {
    const { cron, timezone, runOnStart } = schedule;

    const job = this._cron.schedule(cron, handler, {
      scheduled: true,
      timezone: timezone || 'UTC',
    });

    if (runOnStart) {
      setImmediate(handler);
    }

    return job;
  }

  /**
   * Teardown all scheduled jobs
   */
  async _teardownSchedules() {
    for (const entry of this._scheduledJobs) {
      entry.job.stop();
      this._log('debug', `Stopped scheduled job: ${entry.type}`, { type: entry.type, clusterId: entry.clusterId });
    }
    this._scheduledJobs = [];
  }

  /**
   * Emit progress event
   */
  _emitProgress(clusterId, data) {
    // Can be extended to emit events to external systems
    this._log('debug', 'Progress update', { clusterId, ...data });
  }

  /**
   * Resolve internal resource names
   */
  _resolveInternalResourceNames() {
    return resolveResourceNames(this.database, this._internalResourceDescriptors);
  }

  /**
   * Internal logger
   */
  _log(level, message, meta = {}) {
    // Call custom logger if provided (for backward compatibility)
    if (this.config.logger && typeof this.config.logger === 'function') {
      this.config.logger(level, message, { plugin: 'KubernetesInventoryPlugin', ...meta });
    }

    // Use Pino logger with structured logging
    const logContext = { plugin: 'KubernetesInventoryPlugin', ...meta };
    switch (level) {
      case 'error':
        this.logger.error(logContext, message);
        break;
      case 'warn':
        this.logger.warn(logContext, message);
        break;
      case 'info':
        this.logger.info(logContext, message);
        break;
      case 'debug':
        this.logger.debug(logContext, message);
        break;
      default:
        this.logger.info(logContext, message);
    }
  }
}
