import tryFn from '#src/concerns/try-fn.js';
import { S3db } from '#src/database.class.js';
import BaseReplicator from './base-replicator.class.js';
import { ReplicationError } from '../replicator.errors.js';
function normalizeResourceName(name) {
    return typeof name === 'string' ? name.trim().toLowerCase() : String(name);
}
class S3dbReplicator extends BaseReplicator {
    instanceId;
    client;
    connectionString;
    region;
    keyPrefix;
    resourcesMap;
    targetDatabase;
    constructor(config = {}, resources = [], client = null) {
        super(config);
        this.instanceId = Math.random().toString(36).slice(2, 10);
        this.client = client;
        this.connectionString = config.connectionString;
        this.region = config.region;
        this.keyPrefix = config.keyPrefix;
        this.targetDatabase = null;
        let normalizedResources;
        if (!resources)
            normalizedResources = {};
        else if (Array.isArray(resources)) {
            normalizedResources = {};
            for (const res of resources) {
                if (typeof res === 'string')
                    normalizedResources[normalizeResourceName(res)] = res;
            }
        }
        else if (typeof resources === 'string') {
            normalizedResources = {};
            normalizedResources[normalizeResourceName(resources)] = resources;
        }
        else {
            normalizedResources = resources;
        }
        this.resourcesMap = this._normalizeResources(normalizedResources);
    }
    _normalizeResources(resources) {
        if (!resources)
            return {};
        if (Array.isArray(resources)) {
            const map = {};
            for (const res of resources) {
                if (typeof res === 'string')
                    map[normalizeResourceName(res)] = res;
                else if (typeof res === 'object' && res.resource) {
                    map[normalizeResourceName(res.resource)] = res;
                }
            }
            return map;
        }
        if (typeof resources === 'object') {
            const map = {};
            for (const [src, dest] of Object.entries(resources)) {
                const normSrc = normalizeResourceName(src);
                if (typeof dest === 'string')
                    map[normSrc] = dest;
                else if (Array.isArray(dest)) {
                    map[normSrc] = dest.map(item => {
                        if (typeof item === 'string')
                            return item;
                        if (typeof item === 'object' && item.resource) {
                            return item;
                        }
                        return item;
                    });
                }
                else if (typeof dest === 'function')
                    map[normSrc] = dest;
                else if (typeof dest === 'object' && dest.resource) {
                    map[normSrc] = dest;
                }
            }
            return map;
        }
        if (typeof resources === 'function') {
            return resources;
        }
        return {};
    }
    validateConfig() {
        const errors = [];
        if (!this.client && !this.connectionString) {
            errors.push('You must provide a client or a connectionString');
        }
        if (!this.resourcesMap || (typeof this.resourcesMap === 'object' && Object.keys(this.resourcesMap).length === 0)) {
            errors.push('You must provide a resources map or array');
        }
        return { isValid: errors.length === 0, errors };
    }
    async initialize(database) {
        await super.initialize(database);
        const [ok, err] = await tryFn(async () => {
            if (this.client) {
                this.targetDatabase = this.client;
            }
            else if (this.connectionString) {
                const targetConfig = {
                    connectionString: this.connectionString,
                    region: this.region,
                    keyPrefix: this.keyPrefix,
                    logLevel: (this.config.logLevel || 'info')
                };
                this.targetDatabase = new S3db(targetConfig);
                await this.targetDatabase.connect();
            }
            else {
                throw new ReplicationError('S3dbReplicator requires client or connectionString', {
                    operation: 'initialize',
                    replicatorClass: 'S3dbReplicator',
                    suggestion: 'Provide either a client instance or connectionString in config: { client: db } or { connectionString: "s3://..." }'
                });
            }
            this.emit('connected', {
                replicator: this.name,
                target: this.connectionString || 'client-provided'
            });
        });
        if (!ok) {
            this.logger.warn({ error: err.message }, 'Initialization failed');
            throw err;
        }
    }
    async replicate(resourceOrObj, operation, data, recordId, beforeData) {
        let resource;
        let op;
        let payload;
        let id;
        if (typeof resourceOrObj === 'object' && resourceOrObj.resource) {
            resource = resourceOrObj.resource;
            op = resourceOrObj.operation;
            payload = resourceOrObj.data;
            id = resourceOrObj.id;
        }
        else {
            resource = resourceOrObj;
            op = operation;
            payload = data;
            id = recordId;
        }
        const normResource = normalizeResourceName(resource);
        const resourcesMap = this.resourcesMap;
        const entry = resourcesMap[normResource];
        if (!entry) {
            throw new ReplicationError('Resource not configured for replication', {
                operation: 'replicate',
                replicatorClass: 'S3dbReplicator',
                resourceName: resource,
                configuredResources: Object.keys(resourcesMap),
                suggestion: 'Add resource to replicator resources map: { resources: { [resourceName]: "destination" } }'
            });
        }
        if (Array.isArray(entry)) {
            const results = [];
            for (const destConfig of entry) {
                const [ok, error, result] = await tryFn(async () => {
                    return await this._replicateToSingleDestination(destConfig, normResource, op, payload, id);
                });
                if (!ok) {
                    this.logger.warn({ destConfig, error: error.message }, 'Failed to replicate to destination');
                    throw error;
                }
                results.push(result);
            }
            return results;
        }
        else {
            const [ok, error, result] = await tryFn(async () => {
                return await this._replicateToSingleDestination(entry, normResource, op, payload, id);
            });
            if (!ok) {
                this.logger.warn({ entry, error: error.message }, 'Failed to replicate to destination');
                throw error;
            }
            return result;
        }
    }
    async _replicateToSingleDestination(destConfig, sourceResource, operation, data, recordId) {
        let destResourceName;
        if (typeof destConfig === 'string') {
            destResourceName = destConfig;
        }
        else if (typeof destConfig === 'object' && !Array.isArray(destConfig) && destConfig.resource) {
            destResourceName = destConfig.resource;
        }
        else {
            destResourceName = sourceResource;
        }
        if (typeof destConfig === 'object' && !Array.isArray(destConfig) && destConfig.actions && Array.isArray(destConfig.actions)) {
            if (!destConfig.actions.includes(operation)) {
                return { skipped: true, reason: 'action_not_supported', action: operation, destination: destResourceName };
            }
        }
        const destResourceObj = this._getDestResourceObj(destResourceName);
        let transformedData;
        if (typeof destConfig === 'object' && !Array.isArray(destConfig) && destConfig.transform && typeof destConfig.transform === 'function') {
            transformedData = destConfig.transform(data);
            if (transformedData && data && data.id && !transformedData.id) {
                transformedData.id = data.id;
            }
        }
        else {
            transformedData = data;
        }
        if (!transformedData && data)
            transformedData = data;
        let result;
        if (operation === 'insert') {
            result = await destResourceObj.insert(transformedData);
        }
        else if (operation === 'update') {
            result = await destResourceObj.update(recordId, transformedData);
        }
        else if (operation === 'delete') {
            result = await destResourceObj.delete(recordId);
        }
        else {
            throw new ReplicationError(`Invalid replication operation: ${operation}`, {
                operation: 'replicate',
                replicatorClass: 'S3dbReplicator',
                invalidOperation: operation,
                supportedOperations: ['insert', 'update', 'delete'],
                resourceName: sourceResource,
                suggestion: 'Use one of the supported operations: insert, update, delete'
            });
        }
        return result;
    }
    _applyTransformer(resource, data) {
        let cleanData = this._cleanInternalFields(data);
        const normResource = normalizeResourceName(resource);
        const resourcesMap = this.resourcesMap;
        const entry = resourcesMap[normResource];
        let result;
        if (!entry)
            return cleanData;
        if (Array.isArray(entry)) {
            for (const item of entry) {
                if (typeof item === 'object' && item.transform && typeof item.transform === 'function') {
                    result = item.transform(cleanData);
                    break;
                }
            }
            if (!result)
                result = cleanData;
        }
        else if (typeof entry === 'object' && !Array.isArray(entry)) {
            if (typeof entry.transform === 'function') {
                result = entry.transform(cleanData);
            }
        }
        else if (typeof entry === 'function') {
            result = entry(cleanData);
        }
        else {
            result = cleanData;
        }
        if (result && cleanData && cleanData.id && !result.id)
            result.id = cleanData.id;
        if (!result && cleanData)
            result = cleanData;
        return result;
    }
    _cleanInternalFields(data) {
        if (!data || typeof data !== 'object')
            return data;
        const cleanData = { ...data };
        Object.keys(cleanData).forEach(key => {
            if (key.startsWith('$') || key.startsWith('_')) {
                delete cleanData[key];
            }
        });
        return cleanData;
    }
    _resolveDestResource(resource, data) {
        const normResource = normalizeResourceName(resource);
        const resourcesMap = this.resourcesMap;
        const entry = resourcesMap[normResource];
        if (!entry)
            return resource;
        if (Array.isArray(entry)) {
            for (const item of entry) {
                if (typeof item === 'string')
                    return item;
                if (typeof item === 'object' && item.resource)
                    return item.resource;
            }
            return resource;
        }
        if (typeof entry === 'string')
            return entry;
        if (typeof entry === 'function')
            return resource;
        if (typeof entry === 'object' && entry.resource)
            return entry.resource;
        return resource;
    }
    _getDestResourceObj(resource) {
        const db = this.targetDatabase || this.client;
        const available = Object.keys(db?.resources || {});
        const norm = normalizeResourceName(resource);
        const found = available.find(r => normalizeResourceName(r) === norm);
        if (!found) {
            throw new ReplicationError('Destination resource not found in target database', {
                operation: '_getDestResourceObj',
                replicatorClass: 'S3dbReplicator',
                destinationResource: resource,
                availableResources: available,
                suggestion: 'Create the resource in target database or check resource name spelling'
            });
        }
        return db.resources[found];
    }
    async replicateBatch(resourceName, records) {
        if (this.enabled === false) {
            return { skipped: true, reason: 'replicator_disabled' };
        }
        if (!this.shouldReplicateResource(resourceName)) {
            return { skipped: true, reason: 'resource_not_included' };
        }
        const { results, errors } = await this.processBatch(records, async (record) => {
            const [ok, err, result] = await tryFn(() => this.replicate({
                resource: resourceName,
                operation: record.operation,
                id: record.id,
                data: record.data
            }));
            if (!ok) {
                throw err;
            }
            return result;
        }, {
            concurrency: this.config.batchConcurrency,
            mapError: (error, record) => {
                const rec = record;
                this.logger.warn({ recordId: rec.id, error: error.message }, 'Batch replication failed for record');
                return { id: rec.id, error: error.message };
            }
        });
        if (errors.length > 0) {
            this.logger.warn({ resourceName, errorCount: errors.length, errors }, 'Batch replication completed with errors');
        }
        this.emit('batch_replicated', {
            replicator: this.name,
            resourceName,
            total: records.length,
            successful: results.length,
            errors: errors.length
        });
        return {
            success: errors.length === 0,
            results,
            errors: errors,
            total: records.length
        };
    }
    async testConnection() {
        const [ok, err] = await tryFn(async () => {
            if (!this.targetDatabase) {
                throw new ReplicationError('No target database configured for connection test', {
                    operation: 'testConnection',
                    replicatorClass: 'S3dbReplicator',
                    suggestion: 'Initialize replicator with client or connectionString before testing connection'
                });
            }
            if (typeof this.targetDatabase.connect === 'function') {
                await this.targetDatabase.connect();
            }
            return true;
        });
        if (!ok) {
            this.logger.warn({ error: err.message }, 'Connection test failed');
            this.emit('connection_error', { replicator: this.name, error: err.message });
            return false;
        }
        return true;
    }
    async getStatus() {
        const baseStatus = await super.getStatus();
        const resourcesMap = this.resourcesMap;
        return {
            ...baseStatus,
            connected: !!this.targetDatabase,
            targetDatabase: this.connectionString || 'client-provided',
            resources: Object.keys(resourcesMap || {}),
            totalreplicators: this.listenerCount('replicated'),
            totalErrors: this.listenerCount('replicator_error')
        };
    }
    async cleanup() {
        if (this.targetDatabase) {
            this.targetDatabase.removeAllListeners();
        }
        await super.cleanup();
    }
    shouldReplicateResource(resource, action) {
        const normResource = normalizeResourceName(resource);
        const resourcesMap = this.resourcesMap;
        const entry = resourcesMap[normResource];
        if (!entry)
            return false;
        if (!action)
            return true;
        if (Array.isArray(entry)) {
            for (const item of entry) {
                if (typeof item === 'object' && item.resource) {
                    if (item.actions && Array.isArray(item.actions)) {
                        if (item.actions.includes(action))
                            return true;
                    }
                    else {
                        return true;
                    }
                }
                else if (typeof item === 'string') {
                    return true;
                }
            }
            return false;
        }
        if (typeof entry === 'object' && entry.resource) {
            if (entry.actions && Array.isArray(entry.actions)) {
                return entry.actions.includes(action);
            }
            return true;
        }
        if (typeof entry === 'string' || typeof entry === 'function') {
            return true;
        }
        return false;
    }
}
export default S3dbReplicator;
//# sourceMappingURL=s3db-replicator.class.js.map