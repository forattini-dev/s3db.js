import { EventEmitter } from 'events';
import { PartitionDriverError } from '../errors.js';
import tryFn from './try-fn.js';
export class PartitionQueue extends EventEmitter {
    maxRetries;
    retryDelay;
    persistence;
    queue;
    processing;
    failures;
    constructor(options = {}) {
        super();
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.persistence = options.persistence || null;
        this.queue = [];
        this.processing = false;
        this.failures = [];
    }
    async enqueue(operation) {
        const item = {
            id: `${Date.now()}-${Math.random()}`,
            operation,
            retries: 0,
            createdAt: new Date(),
            status: 'pending'
        };
        this.queue.push(item);
        if (this.persistence) {
            await this.persistence.save(item);
        }
        if (!this.processing) {
            setImmediate(() => this.process());
        }
        return item.id;
    }
    async process() {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            const [ok, error] = await tryFn(async () => {
                await this.executeOperation(item);
                item.status = 'completed';
                this.emit('success', item);
                if (this.persistence) {
                    await this.persistence.remove(item.id);
                }
            });
            if (!ok) {
                item.retries++;
                item.lastError = error;
                if (item.retries < this.maxRetries) {
                    const delay = this.retryDelay * Math.pow(2, item.retries - 1);
                    item.status = 'retrying';
                    setTimeout(() => {
                        this.queue.push(item);
                        if (!this.processing)
                            this.process();
                    }, delay);
                    this.emit('retry', { item, error, delay });
                }
                else {
                    item.status = 'failed';
                    this.failures.push(item);
                    this.emit('failure', { item, error });
                    if (this.persistence) {
                        await this.persistence.moveToDLQ(item);
                    }
                }
            }
        }
        this.processing = false;
    }
    async executeOperation(item) {
        const { type, resource, data } = item.operation;
        switch (type) {
            case 'create':
                return await resource.createPartitionReferences(data);
            case 'update':
                return await resource.handlePartitionReferenceUpdates(data.original, data.updated);
            case 'delete':
                return await resource.deletePartitionReferences(data);
            default:
                throw new PartitionDriverError(`Unknown partition operation type: ${type}`, {
                    driver: 'PartitionQueue',
                    operation: type,
                    availableOperations: ['create', 'update', 'delete'],
                    suggestion: 'Use one of the supported partition operations: create, update, or delete'
                });
        }
    }
    async recover() {
        if (!this.persistence)
            return;
        const items = await this.persistence.getPending();
        this.queue.push(...items);
        if (this.queue.length > 0) {
            this.emit('recovered', { count: this.queue.length });
            setImmediate(() => this.process());
        }
    }
    getStats() {
        return {
            pending: this.queue.length,
            failures: this.failures.length,
            processing: this.processing,
            failureRate: this.failures.length / (this.queue.length + this.failures.length) || 0
        };
    }
}
export class InMemoryPersistence {
    items;
    dlq;
    constructor() {
        this.items = new Map();
        this.dlq = new Map();
    }
    async save(item) {
        this.items.set(item.id, item);
    }
    async remove(id) {
        this.items.delete(id);
    }
    async moveToDLQ(item) {
        this.items.delete(item.id);
        this.dlq.set(item.id, item);
    }
    async getPending() {
        return Array.from(this.items.values());
    }
    async getDLQ() {
        return Array.from(this.dlq.values());
    }
}
//# sourceMappingURL=partition-queue.js.map