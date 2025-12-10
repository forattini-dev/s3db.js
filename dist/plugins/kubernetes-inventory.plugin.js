import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import isEqual from 'lodash-es/isEqual.js';
import { Plugin } from './plugin.class.js';
import { PluginError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';
import { KubernetesDriver } from './kubernetes-inventory/k8s-driver.js';
import { resolveResourceNames } from './concerns/resource-names.js';
import { createLogger } from '../concerns/logger.js';
const DEFAULT_DISCOVERY = {
    concurrency: 2,
    select: null,
    ignore: [],
    runOnInstall: true,
    dryRun: false,
};
const DEFAULT_LOCK = {
    ttl: 600,
    timeout: 0,
};
const BASE_SCHEDULE = {
    enabled: false,
    cron: null,
    timezone: undefined,
    runOnStart: false,
};
function normalizeClusterDefinitions(clusters, logger) {
    return clusters.map((cluster, index) => {
        if (!cluster.id) {
            cluster.id = `k8s-cluster-${index + 1}`;
            logger('debug', `Auto-generated cluster ID: ${cluster.id}`, {});
        }
        if (!cluster.name) {
            cluster.name = cluster.id;
        }
        cluster.discovery = cluster.discovery || {};
        cluster.scheduled = normalizeSchedule(cluster.scheduled);
        cluster.tags = cluster.tags || {};
        cluster.metadata = cluster.metadata || {};
        return cluster;
    });
}
function normalizeSchedule(schedule) {
    if (!schedule)
        return { ...BASE_SCHEDULE };
    if (typeof schedule !== 'object')
        return { ...BASE_SCHEDULE };
    return {
        enabled: schedule.enabled === true,
        cron: schedule.cron || null,
        timezone: schedule.timezone,
        runOnStart: schedule.runOnStart === true,
    };
}
function requirePluginDependency(name, context) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(name);
    }
    catch {
        throw new PluginError(`Required dependency "${name}" not found`, {
            pluginName: 'KubernetesInventoryPlugin',
            operation: 'requireDependency',
            context,
            suggestion: `Install the dependency: npm install ${name}`
        });
    }
}
export class KubernetesInventoryPlugin extends Plugin {
    config;
    clusterDrivers = new Map();
    resourceNames;
    internalResourceNames;
    _internalResourceOverrides;
    _internalResourceDescriptors;
    _resourceHandles = {};
    _scheduledJobs = [];
    _cron = null;
    constructor(options = {}) {
        super(options);
        if (options.logger && typeof options.logger !== 'function') {
            this.logger = options.logger;
        }
        else {
            const logLevel = (this.logLevel || 'info');
            this.logger = createLogger({ name: 'KubernetesInventoryPlugin', level: logLevel });
        }
        const opts = this.options;
        const { clusters, resourceNames = {}, discovery = {}, logger, scheduled, lock = {}, ...rest } = opts;
        const pendingLogs = [];
        const normalizedClusters = normalizeClusterDefinitions(Array.isArray(clusters) ? clusters : [], (level, message, meta) => pendingLogs.push({ level, message, meta: meta ?? {} }));
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
        const lockConfig = lock;
        this.config = {
            clusters: normalizedClusters,
            discovery: {
                ...DEFAULT_DISCOVERY,
                ...(discovery || {}),
            },
            resourceNames: this.internalResourceNames,
            logger: typeof logger === 'function' ? logger : null,
            logLevel: this.logLevel,
            scheduled: normalizeSchedule(scheduled),
            lock: {
                ttl: lockConfig?.ttl ?? DEFAULT_LOCK.ttl,
                timeout: lockConfig?.timeout ?? DEFAULT_LOCK.timeout,
            },
            ...rest,
        };
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
        for (const cluster of this.config.clusters) {
            const result = await this.syncCluster(cluster.id, options);
            results.push(result);
        }
        return results;
    }
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
        const summaryBefore = await summaryResource.getOrNull(clusterId)
            ?? await this._ensureClusterSummaryRecord(clusterId, definition, normalizeSchedule(definition.scheduled));
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
                state: state,
                runtime,
                ...options,
            };
            const resourceIterator = driver.listResources(discoveryOptions);
            for await (const resource of resourceIterator) {
                counters.total++;
                if (!this._shouldIncludeResource(resource)) {
                    continue;
                }
                if (!this.config.discovery.dryRun) {
                    const [ok, err, result] = await tryFn(async () => {
                        return await this._persistSnapshot(resource, resource);
                    });
                    if (ok) {
                        if (result.status === 'created')
                            counters.created++;
                        else if (result.status === 'updated')
                            counters.updated++;
                        else if (result.status === 'unchanged')
                            counters.unchanged++;
                    }
                    else {
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
            await summaryResource.patch(clusterId, {
                status: 'idle',
                lastResult: {
                    success: true,
                    timestamp: new Date().toISOString(),
                    duration,
                    counters,
                },
                checkpoint: null,
                state: {},
            });
            this._log('info', `Cluster sync completed: ${clusterId}`, { clusterId, duration, counters });
            return {
                clusterId,
                success: true,
                duration,
                ...counters,
            };
        }
        catch (error) {
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
        }
        finally {
            await storage.releaseLock(lock);
        }
    }
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
    async getSnapshots(filter = {}) {
        const resource = this._resourceHandles.snapshots;
        const query = {};
        if (filter.clusterId)
            query.clusterId = filter.clusterId;
        if (filter.resourceType)
            query.resourceType = filter.resourceType;
        if (filter.namespace)
            query.namespace = filter.namespace;
        return await resource.query(query);
    }
    async getVersions(filter = {}) {
        const resource = this._resourceHandles.versions;
        const query = {};
        if (filter.clusterId)
            query.clusterId = filter.clusterId;
        if (filter.resourceType)
            query.resourceType = filter.resourceType;
        if (filter.resourceId)
            query.resourceId = filter.resourceId;
        return await resource.query(query);
    }
    async getChanges(filter = {}) {
        const resource = this._resourceHandles.changes;
        const query = {};
        if (filter.clusterId)
            query.clusterId = filter.clusterId;
        if (filter.resourceType)
            query.resourceType = filter.resourceType;
        if (filter.resourceId)
            query.resourceId = filter.resourceId;
        if (filter.since) {
            const results = await resource.query(query);
            return results.filter(change => new Date(change.createdAt) >= new Date(filter.since));
        }
        return await resource.query(query);
    }
    _validateConfiguration() {
        if (!this.config.clusters || this.config.clusters.length === 0) {
            throw new PluginError('At least one cluster must be configured', {
                pluginName: 'KubernetesInventoryPlugin',
                operation: 'validateConfiguration',
            });
        }
        const clusterIds = this.config.clusters.map(c => c.id);
        const duplicates = clusterIds.filter((id, index) => clusterIds.indexOf(id) !== index);
        if (duplicates.length > 0) {
            throw new PluginError(`Duplicate cluster IDs found: ${duplicates.join(', ')}`, {
                pluginName: 'KubernetesInventoryPlugin',
                operation: 'validateConfiguration',
            });
        }
    }
    async _ensureResources() {
        const { database } = this;
        const resourceNames = this.config.resourceNames;
        this._resourceHandles.snapshots = await database.createResource({
            name: resourceNames.snapshots,
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
        this._resourceHandles.versions = await database.createResource({
            name: resourceNames.versions,
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
        this._resourceHandles.changes = await database.createResource({
            name: resourceNames.changes,
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
        this._resourceHandles.clusters = await database.createResource({
            name: resourceNames.clusters,
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
        this._log('info', 'Internal resources created successfully', {});
    }
    async _initializeDrivers() {
        for (const clusterDef of this.config.clusters) {
            const driver = new KubernetesDriver({
                ...clusterDef,
                logger: this.config.logger,
                logLevel: this.config.logLevel,
            });
            await driver.initialize();
            this.clusterDrivers.set(clusterDef.id, {
                driver,
                definition: clusterDef,
            });
            this._log('info', `Initialized driver for cluster: ${clusterDef.id}`, {});
        }
    }
    async _destroyDrivers() {
        for (const [clusterId, { driver }] of this.clusterDrivers.entries()) {
            await driver.destroy();
            this._log('info', `Destroyed driver for cluster: ${clusterId}`, {});
        }
        this.clusterDrivers.clear();
    }
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
    async _persistSnapshot(normalized, rawItem) {
        const snapshotResource = this._resourceHandles.snapshots;
        const versionResource = this._resourceHandles.versions;
        const changeResource = this._resourceHandles.changes;
        const resourceKey = this._buildResourceKey(normalized);
        const digest = this._computeDigest(normalized.configuration);
        const existingSnapshot = await snapshotResource.getOrNull(resourceKey);
        const now = new Date().toISOString();
        if (!existingSnapshot) {
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
        if (existingSnapshot.latestDigest === digest) {
            await snapshotResource.patch(resourceKey, {
                lastSeenAt: now,
                updatedAt: now,
            });
            return { status: 'unchanged', resourceKey, version: existingSnapshot.latestVersion, digest };
        }
        const newVersion = existingSnapshot.latestVersion + 1;
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
    _buildResourceKey(normalized) {
        const parts = [
            normalized.clusterId,
            normalized.resourceType,
            normalized.namespace || 'cluster',
            normalized.resourceId,
        ];
        return parts.join('::');
    }
    _computeDigest(configuration) {
        const canonical = jsonStableStringify(configuration) ?? '{}';
        return createHash('sha256').update(canonical).digest('hex');
    }
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
    _computeDiff(oldConfig, newConfig) {
        const diff = {
            added: {},
            removed: {},
            updated: {},
        };
        const oldKeys = new Set(Object.keys(oldConfig || {}));
        const newKeys = new Set(Object.keys(newConfig || {}));
        for (const key of newKeys) {
            if (!oldKeys.has(key)) {
                diff.added[key] = newConfig[key];
            }
        }
        for (const key of oldKeys) {
            if (!newKeys.has(key)) {
                diff.removed[key] = oldConfig[key];
            }
        }
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
    _shouldIncludeResource(resource) {
        const { select, ignore } = this.config.discovery;
        if (select !== null) {
            if (!this._matchesFilter(resource, select)) {
                return false;
            }
        }
        if (ignore && ignore.length > 0) {
            for (const filter of ignore) {
                if (this._matchesFilter(resource, filter)) {
                    return false;
                }
            }
        }
        return true;
    }
    _matchesFilter(resource, filter) {
        if (typeof filter === 'function') {
            return filter(resource);
        }
        if (Array.isArray(filter)) {
            for (const pattern of filter) {
                if (this._matchesPattern(resource, pattern)) {
                    return true;
                }
            }
            return false;
        }
        return this._matchesPattern(resource, filter);
    }
    _matchesPattern(resource, pattern) {
        if (typeof pattern === 'function') {
            return pattern(resource);
        }
        if (typeof pattern === 'string') {
            const resourceType = resource.resourceType;
            if (resourceType === pattern) {
                return true;
            }
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(resourceType);
        }
        return false;
    }
    async _setupSchedules() {
        const needsCron = this.config.scheduled.enabled ||
            this.config.clusters.some(c => c.scheduled?.enabled);
        if (!needsCron) {
            this._log('debug', 'No schedules configured, skipping cron setup', {});
            return;
        }
        this._cron = requirePluginDependency('node-cron', 'KubernetesInventoryPlugin (for scheduling)');
        if (this.config.scheduled.enabled && this.config.scheduled.cron) {
            const job = this._scheduleJob(this.config.scheduled, async () => {
                this._log('info', 'Running global scheduled discovery', {});
                await this.syncAll();
            });
            this._scheduledJobs.push({ type: 'global', job });
            this._log('info', `Global schedule configured: ${this.config.scheduled.cron}`, {});
        }
        for (const cluster of this.config.clusters) {
            if (cluster.scheduled?.enabled && cluster.scheduled?.cron) {
                const schedule = normalizeSchedule(cluster.scheduled);
                const job = this._scheduleJob(schedule, async () => {
                    this._log('info', `Running scheduled discovery for cluster: ${cluster.id}`, { clusterId: cluster.id });
                    await this.syncCluster(cluster.id);
                });
                this._scheduledJobs.push({ type: 'cluster', clusterId: cluster.id, job });
                this._log('info', `Cluster schedule configured: ${cluster.id} -> ${cluster.scheduled.cron}`, {});
            }
        }
    }
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
    async _teardownSchedules() {
        for (const entry of this._scheduledJobs) {
            entry.job.stop();
            this._log('debug', `Stopped scheduled job: ${entry.type}`, { type: entry.type, clusterId: entry.clusterId });
        }
        this._scheduledJobs = [];
    }
    _emitProgress(clusterId, data) {
        this._log('debug', 'Progress update', { clusterId, ...data });
    }
    _resolveInternalResourceNames() {
        return resolveResourceNames('k8s_inventory', this._internalResourceDescriptors, {
            namespace: this.namespace
        });
    }
    _log(level, message, meta = {}) {
        if (this.config.logger && typeof this.config.logger === 'function') {
            this.config.logger(level, message, { plugin: 'KubernetesInventoryPlugin', ...meta });
        }
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
export default KubernetesInventoryPlugin;
//# sourceMappingURL=kubernetes-inventory.plugin.js.map