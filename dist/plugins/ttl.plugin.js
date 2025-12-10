import { CoordinatorPlugin } from "./concerns/coordinator-plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { resolveResourceName } from "./concerns/resource-names.js";
import { PluginError } from "../errors.js";
const ONE_MINUTE_SEC = 60;
const ONE_HOUR_SEC = 3600;
const ONE_DAY_SEC = 86400;
const THIRTY_DAYS_SEC = 2592000;
const ONE_MINUTE_MS = 60000;
const ONE_HOUR_MS = 3600000;
const ONE_DAY_MS = 86400000;
const ONE_WEEK_MS = 604800000;
const SECONDS_TO_MS = 1000;
const GRANULARITIES = {
    minute: {
        threshold: ONE_HOUR_SEC,
        cronExpression: '*/10 * * * * *',
        cohortsToCheck: 3,
        cohortFormat: (date) => date.toISOString().substring(0, 16)
    },
    hour: {
        threshold: ONE_DAY_SEC,
        cronExpression: '*/10 * * * *',
        cohortsToCheck: 2,
        cohortFormat: (date) => date.toISOString().substring(0, 13)
    },
    day: {
        threshold: THIRTY_DAYS_SEC,
        cronExpression: '0 * * * *',
        cohortsToCheck: 2,
        cohortFormat: (date) => date.toISOString().substring(0, 10)
    },
    week: {
        threshold: Infinity,
        cronExpression: '0 0 * * *',
        cohortsToCheck: 2,
        cohortFormat: (date) => {
            const year = date.getUTCFullYear();
            const week = getWeekNumber(date);
            return `${year}-W${String(week).padStart(2, '0')}`;
        }
    }
};
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / ONE_DAY_MS) + 1) / 7);
}
function detectGranularity(ttl) {
    if (!ttl)
        return 'day';
    if (ttl < GRANULARITIES.minute.threshold)
        return 'minute';
    if (ttl < GRANULARITIES.hour.threshold)
        return 'hour';
    if (ttl < GRANULARITIES.day.threshold)
        return 'day';
    return 'week';
}
function getExpiredCohorts(granularity, count) {
    const config = GRANULARITIES[granularity];
    const cohorts = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
        let checkDate;
        switch (granularity) {
            case 'minute':
                checkDate = new Date(now.getTime() - (i * ONE_MINUTE_MS));
                break;
            case 'hour':
                checkDate = new Date(now.getTime() - (i * ONE_HOUR_MS));
                break;
            case 'day':
                checkDate = new Date(now.getTime() - (i * ONE_DAY_MS));
                break;
            case 'week':
                checkDate = new Date(now.getTime() - (i * ONE_WEEK_MS));
                break;
        }
        cohorts.push(config.cohortFormat(checkDate));
    }
    return cohorts;
}
export class TTLPlugin extends CoordinatorPlugin {
    config;
    resources;
    resourceFilter;
    batchSize;
    schedules;
    stats;
    isRunning;
    expirationIndex;
    indexResourceName;
    _indexResourceDescriptor;
    constructor(options = {}) {
        super(options);
        const opts = this.options;
        this.config = {
            logLevel: opts.logLevel,
            ...opts
        };
        const { resources = {}, batchSize = 100, schedules = {}, resourceFilter, resourceAllowlist, resourceBlocklist } = opts;
        this.resources = resources;
        this.resourceFilter = this._buildResourceFilter({ resourceFilter, resourceAllowlist, resourceBlocklist });
        this.batchSize = batchSize;
        this.schedules = schedules;
        this.stats = {
            totalScans: 0,
            totalExpired: 0,
            totalDeleted: 0,
            totalArchived: 0,
            totalSoftDeleted: 0,
            totalCallbacks: 0,
            totalErrors: 0,
            lastScanAt: null,
            lastScanDuration: 0
        };
        this.cronManager = null;
        this.isRunning = false;
        const resourceNamesOption = (opts.resourceNames || {});
        this.expirationIndex = null;
        this._indexResourceDescriptor = {
            defaultName: 'plg_ttl_expiration_index',
            override: resourceNamesOption.index || opts.indexResourceName
        };
        this.indexResourceName = this._resolveIndexResourceName();
    }
    _buildResourceFilter(config = {}) {
        if (typeof config.resourceFilter === 'function') {
            return config.resourceFilter;
        }
        const allow = Array.isArray(config.resourceAllowlist) ? new Set(config.resourceAllowlist) : null;
        const block = Array.isArray(config.resourceBlocklist) ? new Set(config.resourceBlocklist) : null;
        if (allow || block) {
            return (resourceName) => {
                if (allow && allow.size > 0 && !allow.has(resourceName)) {
                    return false;
                }
                if (block && block.has(resourceName)) {
                    return false;
                }
                return true;
            };
        }
        return () => true;
    }
    async install(database) {
        await super.install(database);
        const managedResources = [];
        for (const [resourceName, config] of Object.entries(this.resources)) {
            if (!this.resourceFilter(resourceName)) {
                this.logger.warn({ resourceName }, `Resource "${resourceName}" skipped by resource filter`);
                continue;
            }
            this._validateResourceConfig(resourceName, config);
            managedResources.push(resourceName);
        }
        await this._createExpirationIndex();
        for (const resourceName of managedResources) {
            this._setupResourceHooks(resourceName, this.resources[resourceName]);
        }
        this.logger.debug({ resourceCount: managedResources.length, resources: managedResources }, `Installed with ${managedResources.length} resources`);
        this.emit('db:plugin:installed', {
            plugin: 'TTLPlugin',
            resources: managedResources
        });
        await this.startCoordination();
    }
    _resolveIndexResourceName() {
        return resolveResourceName('ttl', this._indexResourceDescriptor, {
            namespace: this.namespace || undefined
        }) ?? this._indexResourceDescriptor.defaultName;
    }
    onNamespaceChanged() {
        if (!this._indexResourceDescriptor)
            return;
        this.indexResourceName = this._resolveIndexResourceName();
    }
    _validateResourceConfig(resourceName, config) {
        if (!config.ttl && !config.field) {
            throw new PluginError('[TTLPlugin] Missing TTL configuration', {
                pluginName: 'TTLPlugin',
                operation: 'validateResourceConfig',
                resourceName,
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide either ttl (in seconds) or field (absolute expiration timestamp) for each resource.'
            });
        }
        const validStrategies = ['soft-delete', 'hard-delete', 'archive', 'callback'];
        if (!config.onExpire || !validStrategies.includes(config.onExpire)) {
            throw new PluginError('[TTLPlugin] Invalid onExpire strategy', {
                pluginName: 'TTLPlugin',
                operation: 'validateResourceConfig',
                resourceName,
                statusCode: 400,
                retriable: false,
                suggestion: `Set onExpire to one of: ${validStrategies.join(', ')}`,
                onExpire: config.onExpire
            });
        }
        if (config.onExpire === 'soft-delete' && !config.deleteField) {
            config.deleteField = 'deletedat';
        }
        if (config.onExpire === 'archive' && !config.archiveResource) {
            throw new PluginError('[TTLPlugin] Archive resource required', {
                pluginName: 'TTLPlugin',
                operation: 'validateResourceConfig',
                resourceName,
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide archiveResource pointing to the resource that stores archived records.',
                onExpire: config.onExpire
            });
        }
        if (config.onExpire === 'callback' && typeof config.callback !== 'function') {
            throw new PluginError('[TTLPlugin] Callback handler required', {
                pluginName: 'TTLPlugin',
                operation: 'validateResourceConfig',
                resourceName,
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a callback function: { onExpire: "callback", callback: async (ctx) => {...} }',
                onExpire: config.onExpire
            });
        }
        if (!config.field) {
            config.field = '_createdAt';
        }
        if (config.field === '_createdAt' && this.database) {
            const resource = this.database.resources[resourceName];
            if (resource && resource.$schema.timestamps === false) {
                this.logger.warn({ resourceName, field: config.field }, `Resource "${resourceName}" uses TTL with field "_createdAt" ` +
                    `but timestamps are disabled. TTL will be calculated from indexing time, not creation time.`);
            }
        }
        config.granularity = detectGranularity(config.ttl);
    }
    async _createExpirationIndex() {
        this.expirationIndex = await this.database.createResource({
            name: this.indexResourceName,
            attributes: {
                resourceName: 'string|required',
                recordId: 'string|required',
                expiresAtCohort: 'string|required',
                expiresAtTimestamp: 'number|required',
                granularity: 'string|required',
                createdAt: 'number'
            },
            partitions: {
                byExpiresAtCohort: {
                    fields: { expiresAtCohort: 'string' }
                }
            },
            asyncPartitions: false
        });
        this.logger.debug({ indexResourceName: this.indexResourceName }, 'Created expiration index with partition');
    }
    _setupResourceHooks(resourceName, config) {
        if (!this.database.resources[resourceName]) {
            this.logger.warn({ resourceName }, `Resource "${resourceName}" not found, skipping hooks`);
            return;
        }
        if (!this.resourceFilter(resourceName)) {
            this.logger.warn({ resourceName }, `Resource "${resourceName}" skipped by resource filter`);
            return;
        }
        const resource = this.database.resources[resourceName];
        if (typeof resource.insert !== 'function' || typeof resource.delete !== 'function') {
            this.logger.warn({ resourceName }, `Resource "${resourceName}" missing insert/delete methods, skipping hooks`);
            return;
        }
        this.addMiddleware(resource, 'insert', async (next, data, options) => {
            const result = await next(data, options);
            await this._addToIndex(resourceName, result, config);
            return result;
        });
        this.addMiddleware(resource, 'delete', async (next, id, options) => {
            const result = await next(id, options);
            await this._removeFromIndex(resourceName, id);
            return result;
        });
        this.logger.debug({ resourceName }, `Setup hooks for resource "${resourceName}"`);
    }
    async _addToIndex(resourceName, record, config) {
        try {
            let baseTime = record[config.field];
            if (!baseTime && config.field === '_createdAt') {
                baseTime = Date.now();
            }
            if (!baseTime) {
                this.logger.warn({ resourceName, recordId: record.id, field: config.field }, `Record ${record.id} in ${resourceName} missing field "${config.field}", skipping index`);
                return;
            }
            const baseTimestamp = typeof baseTime === 'number' ? baseTime : new Date(baseTime).getTime();
            const expiresAt = config.ttl
                ? new Date(baseTimestamp + config.ttl * SECONDS_TO_MS)
                : new Date(baseTimestamp);
            const cohortConfig = GRANULARITIES[config.granularity];
            const cohort = cohortConfig.cohortFormat(expiresAt);
            const indexId = `${resourceName}:${record.id}`;
            await this.expirationIndex.insert({
                id: indexId,
                resourceName,
                recordId: record.id,
                expiresAtCohort: cohort,
                expiresAtTimestamp: expiresAt.getTime(),
                granularity: config.granularity,
                createdAt: Date.now()
            });
            this.logger.debug({ resourceName, recordId: record.id, cohort, granularity: config.granularity }, `Added ${resourceName}:${record.id} to index (cohort: ${cohort}, granularity: ${config.granularity})`);
        }
        catch (error) {
            this.logger.error({ error: error.message, stack: error.stack }, 'Error adding to index');
            this.stats.totalErrors++;
        }
    }
    async _removeFromIndex(resourceName, recordId) {
        try {
            const indexId = `${resourceName}:${recordId}`;
            const [ok, err] = await tryFn(() => this.expirationIndex.delete(indexId));
            if (ok) {
                this.logger.debug({ resourceName, recordId }, `Removed index entry for ${resourceName}:${recordId}`);
            }
            if (!ok && err?.code !== 'NoSuchKey') {
                throw err;
            }
        }
        catch (error) {
            this.logger.error({ err: error }, '[TTLPlugin] Error removing from index');
        }
    }
    async onBecomeCoordinator() {
        this.logger.debug({ workerId: this.workerId }, 'Global coordinator elected this worker as leader - starting cleanup intervals');
        await this._startIntervals();
        this.emit('plg:ttl:coordinator-promoted', {
            workerId: this.workerId,
            timestamp: Date.now()
        });
    }
    async onStopBeingCoordinator() {
        this.logger.debug({ workerId: this.workerId }, 'Global coordinator demoted this worker from leader - cleanup intervals will be stopped automatically');
        this.emit('plg:ttl:coordinator-demoted', {
            workerId: this.workerId,
            timestamp: Date.now()
        });
    }
    async coordinatorWork() {
        // TTL uses cron-based cleanup intervals (scheduleCron) rather than a work loop
    }
    async _startIntervals() {
        if (!this.cronManager) {
            this.logger.warn('CronManager not available, cleanup intervals will not run');
            return;
        }
        const byGranularity = {
            minute: [],
            hour: [],
            day: [],
            week: []
        };
        for (const [name, config] of Object.entries(this.resources)) {
            if (!this.resourceFilter(name)) {
                continue;
            }
            byGranularity[config.granularity].push({ name, config });
        }
        for (const [granularity, resources] of Object.entries(byGranularity)) {
            if (resources.length === 0)
                continue;
            const granularityConfig = GRANULARITIES[granularity];
            const cronExpression = this.schedules[granularity] || granularityConfig.cronExpression;
            await this.scheduleCron(cronExpression, () => this._cleanupGranularity(granularity, resources), `cleanup-${granularity}`);
            const source = this.schedules[granularity] ? 'custom' : 'default';
            this.logger.debug({ granularity, cronExpression, resourceCount: resources.length, source }, `Scheduled ${granularity} cleanup (${source} cron: ${cronExpression}) for ${resources.length} resources`);
        }
        this.isRunning = true;
    }
    async _cleanupGranularity(granularity, resources) {
        const startTime = Date.now();
        this.stats.totalScans++;
        try {
            const granularityConfig = GRANULARITIES[granularity];
            const cohorts = getExpiredCohorts(granularity, granularityConfig.cohortsToCheck);
            this.logger.debug({ granularity, cohorts }, `Cleaning ${granularity} granularity, checking cohorts: ${cohorts.join(', ')}`);
            for (const cohort of cohorts) {
                const expired = await this.expirationIndex.listPartition({
                    partition: 'byExpiresAtCohort',
                    partitionValues: { expiresAtCohort: cohort }
                });
                const resourceNames = new Set(resources.map(r => r.name));
                const filtered = expired.filter(e => resourceNames.has(e.resourceName));
                if (filtered.length > 0) {
                    this.logger.debug({ cohort, expiredCount: filtered.length }, `Found ${filtered.length} expired records in cohort ${cohort}`);
                }
                for (let i = 0; i < filtered.length; i += this.batchSize) {
                    const batch = filtered.slice(i, i + this.batchSize);
                    for (const entry of batch) {
                        const config = this.resources[entry.resourceName];
                        if (!config || !this.resourceFilter(entry.resourceName)) {
                            continue;
                        }
                        await this._processExpiredEntry(entry, config);
                    }
                }
            }
            this.stats.lastScanAt = new Date().toISOString();
            this.stats.lastScanDuration = Date.now() - startTime;
            this.emit('plg:ttl:scan-completed', {
                granularity,
                duration: this.stats.lastScanDuration,
                cohorts
            });
        }
        catch (error) {
            this.logger.error({ err: error, granularity }, `[TTLPlugin] Error in ${granularity} cleanup`);
            this.stats.totalErrors++;
            this.emit('plg:ttl:cleanup-error', { granularity, error });
        }
    }
    async _processExpiredEntry(entry, config) {
        try {
            if (!this.database.resources[entry.resourceName]) {
                this.logger.warn({ resourceName: entry.resourceName }, `Resource "${entry.resourceName}" not found during cleanup, skipping`);
                return;
            }
            const resource = this.database.resources[entry.resourceName];
            const [ok, , record] = await tryFn(() => resource.get(entry.recordId));
            if (!ok || !record) {
                await this.expirationIndex.delete(entry.id);
                return;
            }
            if (entry.expiresAtTimestamp && Date.now() < entry.expiresAtTimestamp) {
                return;
            }
            switch (config.onExpire) {
                case 'soft-delete':
                    await this._softDelete(resource, record, config);
                    this.stats.totalSoftDeleted++;
                    break;
                case 'hard-delete':
                    await this._hardDelete(resource, record);
                    this.stats.totalDeleted++;
                    break;
                case 'archive':
                    await this._archive(resource, record, config);
                    this.stats.totalArchived++;
                    this.stats.totalDeleted++;
                    break;
                case 'callback':
                    const shouldDelete = await config.callback(record, resource);
                    this.stats.totalCallbacks++;
                    if (shouldDelete) {
                        await this._hardDelete(resource, record);
                        this.stats.totalDeleted++;
                    }
                    break;
            }
            await this.expirationIndex.delete(entry.id);
            this.stats.totalExpired++;
            this.emit('plg:ttl:record-expired', { resource: entry.resourceName, record });
        }
        catch (error) {
            this.logger.error({ error: error.message, stack: error.stack, entry }, 'Error processing expired entry');
            this.stats.totalErrors++;
        }
    }
    async _softDelete(resource, record, config) {
        const deleteField = config.deleteField || 'deletedat';
        const updates = {
            [deleteField]: new Date().toISOString(),
            isdeleted: 'true'
        };
        await resource.update(record.id, updates);
        this.logger.debug({ resourceName: resource.name, recordId: record.id, deleteField }, `Soft-deleted record ${record.id} in ${resource.name}`);
    }
    async _hardDelete(resource, record) {
        await resource.delete(record.id);
        this.logger.debug({ resourceName: resource.name, recordId: record.id }, `Hard-deleted record ${record.id} in ${resource.name}`);
    }
    async _archive(resource, record, config) {
        if (!this.database.resources[config.archiveResource]) {
            throw new PluginError(`Archive resource "${config.archiveResource}" not found`, {
                pluginName: 'TTLPlugin',
                operation: '_archive',
                resourceName: config.archiveResource,
                statusCode: 404,
                retriable: false,
                suggestion: 'Create the archive resource before using onExpire: "archive" or update archiveResource config.'
            });
        }
        const archiveResource = this.database.resources[config.archiveResource];
        const archiveData = {};
        for (const [key, value] of Object.entries(record)) {
            if (!key.startsWith('_')) {
                archiveData[key] = value;
            }
        }
        archiveData.archivedAt = new Date().toISOString();
        archiveData.archivedFrom = resource.name;
        archiveData.originalId = record.id;
        if (!config.keepOriginalId) {
            delete archiveData.id;
        }
        await archiveResource.insert(archiveData);
        await resource.delete(record.id);
        this.logger.debug({ recordId: record.id, sourceResource: resource.name, archiveResource: config.archiveResource }, `Archived record ${record.id} from ${resource.name} to ${config.archiveResource}`);
    }
    async cleanupResource(resourceName) {
        const config = this.resources[resourceName];
        if (!config) {
            throw new PluginError(`Resource "${resourceName}" not configured in TTLPlugin`, {
                pluginName: 'TTLPlugin',
                operation: 'cleanupResource',
                resourceName,
                statusCode: 404,
                retriable: false,
                suggestion: 'Add the resource under TTLPlugin configuration before invoking cleanupResource.'
            });
        }
        const granularity = config.granularity;
        await this._cleanupGranularity(granularity, [{ name: resourceName, config }]);
        return {
            resource: resourceName,
            granularity
        };
    }
    async runCleanup() {
        const byGranularity = {
            minute: [],
            hour: [],
            day: [],
            week: []
        };
        for (const [name, config] of Object.entries(this.resources)) {
            byGranularity[config.granularity].push({ name, config });
        }
        for (const [granularity, resources] of Object.entries(byGranularity)) {
            if (resources.length > 0) {
                await this._cleanupGranularity(granularity, resources);
            }
        }
    }
    getStats() {
        return {
            ...this.stats,
            resources: Object.keys(this.resources).length,
            isRunning: this.isRunning,
            cronJobs: this._cronJobs.length
        };
    }
    async onStop() {
        this.isRunning = false;
        await this.stopCoordination();
    }
    async uninstall() {
        await super.uninstall();
        this.logger.debug('Uninstalled');
    }
}
//# sourceMappingURL=ttl.plugin.js.map