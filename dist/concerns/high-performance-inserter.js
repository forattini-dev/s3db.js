import { tryFn } from './try-fn.js';
import { TasksPool } from '../tasks/tasks-pool.class.js';
export class HighPerformanceInserter {
    resource;
    batchSize;
    concurrency;
    flushInterval;
    disablePartitions;
    useStreamMode;
    insertBuffer;
    partitionBuffer;
    stats;
    flushTimer;
    isProcessing;
    partitionQueue;
    partitionProcessor;
    constructor(resource, options = {}) {
        this.resource = resource;
        this.batchSize = options.batchSize || 100;
        this.concurrency = options.concurrency || 50;
        this.flushInterval = options.flushInterval || 1000;
        this.disablePartitions = options.disablePartitions || false;
        this.useStreamMode = options.useStreamMode || false;
        this.insertBuffer = [];
        this.partitionBuffer = new Map();
        this.stats = {
            inserted: 0,
            failed: 0,
            partitionsPending: 0,
            avgInsertTime: 0
        };
        this.flushTimer = null;
        this.isProcessing = false;
        this.partitionQueue = [];
        this.partitionProcessor = null;
    }
    async add(data) {
        this.insertBuffer.push({
            data,
            timestamp: Date.now(),
            promise: null
        });
        if (this.insertBuffer.length >= this.batchSize) {
            setImmediate(() => this.flush());
        }
        else if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
        }
        return { queued: true, position: this.insertBuffer.length };
    }
    async bulkAdd(items) {
        for (const item of items) {
            await this.add(item);
        }
        return { queued: items.length };
    }
    async flush() {
        if (this.isProcessing || this.insertBuffer.length === 0)
            return;
        this.isProcessing = true;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        const batch = this.insertBuffer.splice(0, this.batchSize);
        const startTime = Date.now();
        const [ok] = await tryFn(async () => {
            const { results, errors } = await TasksPool.map(batch, async (item) => this.performInsert(item), { concurrency: this.concurrency });
            const duration = Date.now() - startTime;
            this.stats.inserted += results.filter(r => r.success).length;
            this.stats.failed += errors.length;
            this.stats.avgInsertTime = duration / batch.length;
            if (!this.disablePartitions && this.partitionQueue.length > 0) {
                this.processPartitionsAsync();
            }
        });
        this.isProcessing = false;
        if (this.insertBuffer.length > 0) {
            setImmediate(() => this.flush());
        }
    }
    async performInsert(item) {
        const { data } = item;
        const [ok, error, result] = await tryFn(async () => {
            const originalAsyncPartitions = this.resource.config.asyncPartitions;
            const originalPartitions = this.resource.config.partitions;
            if (this.disablePartitions) {
                this.resource.config.partitions = {};
            }
            const [insertOk, insertErr, insertResult] = await tryFn(() => this.resource.insert(data));
            if (!insertOk || !insertResult) {
                throw insertErr ?? new Error('Insert returned no result');
            }
            if (!this.disablePartitions && originalPartitions && Object.keys(originalPartitions).length > 0) {
                this.partitionQueue.push({
                    operation: 'create',
                    data: insertResult,
                    partitions: originalPartitions
                });
                this.stats.partitionsPending++;
            }
            this.resource.config.partitions = originalPartitions;
            this.resource.config.asyncPartitions = originalAsyncPartitions;
            return { success: true, data: insertResult };
        });
        if (!ok || !result) {
            return { success: false, error: error };
        }
        return result;
    }
    async processPartitionsAsync() {
        if (this.partitionProcessor)
            return;
        this.partitionProcessor = setImmediate(async () => {
            const batch = this.partitionQueue.splice(0, 100);
            if (batch.length === 0) {
                this.partitionProcessor = null;
                return;
            }
            await TasksPool.map(batch, async (item) => {
                const [ok, err] = await tryFn(() => this.resource.createPartitionReferences(item.data));
                if (ok) {
                    this.stats.partitionsPending--;
                }
                else {
                    this.resource.emit('partitionIndexError', {
                        operation: 'bulk-insert',
                        error: err
                    });
                }
            }, { concurrency: 10 });
            if (this.partitionQueue.length > 0) {
                this.processPartitionsAsync();
            }
            else {
                this.partitionProcessor = null;
            }
        });
    }
    async forceFlush() {
        while (this.insertBuffer.length > 0 || this.isProcessing) {
            await this.flush();
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    getStats() {
        return {
            ...this.stats,
            bufferSize: this.insertBuffer.length,
            isProcessing: this.isProcessing,
            throughput: this.stats.avgInsertTime > 0
                ? Math.round(1000 / this.stats.avgInsertTime)
                : 0
        };
    }
    destroy() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }
        this.insertBuffer = [];
        this.partitionQueue = [];
    }
}
export class StreamInserter {
    resource;
    concurrency;
    skipPartitions;
    skipHooks;
    skipValidation;
    constructor(resource, options = {}) {
        this.resource = resource;
        this.concurrency = options.concurrency || 100;
        this.skipPartitions = options.skipPartitions !== false;
        this.skipHooks = options.skipHooks || false;
        this.skipValidation = options.skipValidation || false;
    }
    async fastInsert(data) {
        const id = data.id || this.resource.generateId();
        const key = this.resource.getResourceKey(id);
        const metadata = this.skipValidation
            ? { id, ...data }
            : await this.resource.schema.mapper({ id, ...data });
        const { PutObjectCommand } = await import('@aws-sdk/client-s3');
        const command = new PutObjectCommand({
            Bucket: this.resource.client.config.bucket,
            Key: key,
            Metadata: metadata,
            Body: ''
        });
        await this.resource.client.client.send(command);
        return { id, inserted: true };
    }
    async bulkInsert(items) {
        const { results, errors } = await TasksPool.map(items, async (item) => this.fastInsert(item), { concurrency: this.concurrency });
        return {
            success: results.length,
            failed: errors.length,
            errors: errors.map(e => e.error).slice(0, 10)
        };
    }
}
//# sourceMappingURL=high-performance-inserter.js.map