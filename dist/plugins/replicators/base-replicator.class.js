import EventEmitter from 'events';
import { TasksPool } from '../../tasks/tasks-pool.class.js';
import { ReplicationError } from '../replicator.errors.js';
import { createLogger } from '../../concerns/logger.js';
export class BaseReplicator extends EventEmitter {
    config;
    name;
    enabled;
    batchConcurrency;
    logger;
    database;
    constructor(config = {}) {
        super();
        this.config = config;
        this.name = this.constructor.name;
        this.enabled = config.enabled !== false;
        this.batchConcurrency = Math.max(1, config.batchConcurrency ?? 5);
        this.database = null;
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            const logLevel = config.logLevel ? 'debug' : 'info';
            this.logger = createLogger({ name: this.name, level: logLevel });
        }
    }
    async initialize(database) {
        this.database = database;
        this.emit('db:plugin:initialized', { replicator: this.name });
    }
    async replicate(resourceName, operation, data, id) {
        throw new ReplicationError('replicate() method must be implemented by subclass', {
            operation: 'replicate',
            replicatorClass: this.name,
            resourceName,
            suggestion: 'Extend BaseReplicator and implement the replicate() method'
        });
    }
    async replicateBatch(resourceName, records) {
        throw new ReplicationError('replicateBatch() method must be implemented by subclass', {
            operation: 'replicateBatch',
            replicatorClass: this.name,
            resourceName,
            batchSize: records?.length,
            suggestion: 'Extend BaseReplicator and implement the replicateBatch() method'
        });
    }
    async testConnection() {
        throw new ReplicationError('testConnection() method must be implemented by subclass', {
            operation: 'testConnection',
            replicatorClass: this.name,
            suggestion: 'Extend BaseReplicator and implement the testConnection() method'
        });
    }
    async getStatus() {
        return {
            name: this.name,
            config: this.config,
            connected: false
        };
    }
    async cleanup() {
        this.emit('cleanup', { replicator: this.name });
    }
    setBatchConcurrency(value) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new ReplicationError('Batch concurrency must be a positive number', {
                operation: 'setBatchConcurrency',
                replicatorClass: this.name,
                providedValue: value,
                suggestion: 'Provide a positive integer value greater than zero.'
            });
        }
        this.batchConcurrency = Math.floor(value);
    }
    async processBatch(records = [], handler, { concurrency, mapError } = {}) {
        if (!Array.isArray(records) || records.length === 0) {
            return { results: [], errors: [] };
        }
        if (typeof handler !== 'function') {
            throw new ReplicationError('processBatch requires an async handler function', {
                operation: 'processBatch',
                replicatorClass: this.name,
                suggestion: 'Provide an async handler: async (record) => { ... }'
            });
        }
        const limit = Math.max(1, concurrency ?? this.batchConcurrency ?? 5);
        const poolResult = await TasksPool.map(records, async (record) => handler(record), {
            concurrency: limit,
            onItemError: mapError
                ? (error, record) => mapError(error, record)
                : undefined
        });
        const errors = mapError
            ? poolResult.errors.map(e => mapError(e.error, e.item)).filter(m => m !== undefined)
            : poolResult.errors.map(e => ({ record: e.item, error: e.error }));
        return { results: poolResult.results, errors };
    }
    createError(message, details = {}) {
        return new ReplicationError(message, {
            replicatorClass: this.name,
            operation: details.operation || 'unknown',
            resourceName: details.resourceName,
            statusCode: details.statusCode ?? 500,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion,
            description: details.description,
            docs: details.docs,
            hint: details.hint,
            metadata: details.metadata,
            ...details
        });
    }
    validateConfig() {
        return { isValid: true, errors: [] };
    }
}
export default BaseReplicator;
//# sourceMappingURL=base-replicator.class.js.map