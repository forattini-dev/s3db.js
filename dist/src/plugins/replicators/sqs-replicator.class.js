import tryFn from '#src/concerns/try-fn.js';
import requirePluginDependency from '#src/plugins/concerns/plugin-dependencies.js';
import BaseReplicator from './base-replicator.class.js';
class SqsReplicator extends BaseReplicator {
    client;
    queueUrl;
    queues;
    defaultQueue;
    region;
    sqsClient;
    messageGroupId;
    deduplicationId;
    resourceQueueMap;
    resources;
    constructor(config = {}, resources = [], client = null) {
        super(config);
        this.client = client;
        this.queueUrl = config.queueUrl;
        this.queues = config.queues || {};
        this.defaultQueue = config.defaultQueue || null;
        this.region = config.region || 'us-east-1';
        this.sqsClient = client || null;
        this.messageGroupId = config.messageGroupId;
        this.deduplicationId = config.deduplicationId;
        this.resourceQueueMap = config.resourceQueueMap || null;
        if (Array.isArray(resources)) {
            this.resources = {};
            for (const resource of resources) {
                if (typeof resource === 'string') {
                    this.resources[resource] = true;
                }
                else if (typeof resource === 'object' && resource.name) {
                    this.resources[resource.name] = resource;
                }
            }
        }
        else if (typeof resources === 'object') {
            this.resources = resources;
            for (const [resourceName, resourceConfig] of Object.entries(resources)) {
                if (resourceConfig && typeof resourceConfig === 'object' && resourceConfig.queueUrl) {
                    this.queues[resourceName] = resourceConfig.queueUrl;
                }
            }
        }
        else {
            this.resources = {};
        }
    }
    validateConfig() {
        const errors = [];
        if (!this.queueUrl && Object.keys(this.queues).length === 0 && !this.defaultQueue && !this.resourceQueueMap) {
            errors.push('Either queueUrl, queues object, defaultQueue, or resourceQueueMap must be provided');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    getQueueUrlsForResource(resource) {
        if (this.resourceQueueMap && this.resourceQueueMap[resource]) {
            return this.resourceQueueMap[resource];
        }
        if (this.queues[resource]) {
            return [this.queues[resource]];
        }
        if (this.queueUrl) {
            return [this.queueUrl];
        }
        if (this.defaultQueue) {
            return [this.defaultQueue];
        }
        throw this.createError(`No queue URL found for resource '${resource}'`, {
            operation: 'resolveQueue',
            resourceName: resource,
            statusCode: 404,
            retriable: false,
            suggestion: 'Provide queueUrl, defaultQueue, queues mapping, or resourceQueueMap for this resource.'
        });
    }
    _applyTransformer(resource, data) {
        let cleanData = this._cleanInternalFields(data);
        const entry = this.resources[resource];
        let result = cleanData;
        if (!entry)
            return cleanData;
        if (typeof entry === 'object' && typeof entry.transform === 'function') {
            result = entry.transform(cleanData);
        }
        return result || cleanData;
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
    createMessage(resource, operation, data, id, beforeData = null) {
        const baseMessage = {
            resource: resource,
            action: operation,
            timestamp: new Date().toISOString(),
            source: 's3db-replicator'
        };
        switch (operation) {
            case 'insert':
                return {
                    ...baseMessage,
                    data: data
                };
            case 'update':
                return {
                    ...baseMessage,
                    before: beforeData,
                    data: data
                };
            case 'delete':
                return {
                    ...baseMessage,
                    data: data
                };
            default:
                return {
                    ...baseMessage,
                    data: data
                };
        }
    }
    async initialize(database, client) {
        await super.initialize(database);
        await requirePluginDependency('sqs-replicator');
        if (!this.sqsClient) {
            const [ok, err, sdk] = await tryFn(() => import('@aws-sdk/client-sqs'));
            if (!ok) {
                this.logger.warn({ error: err.message }, 'Failed to import SQS SDK');
                this.emit('initialization_error', {
                    replicator: this.name,
                    error: err.message
                });
                throw err;
            }
            const { SQSClient } = sdk;
            this.sqsClient = client || new SQSClient({
                region: this.region,
                credentials: this.config.credentials
            });
            this.emit('db:plugin:initialized', {
                replicator: this.name,
                queueUrl: this.queueUrl,
                queues: this.queues,
                defaultQueue: this.defaultQueue
            });
        }
    }
    async replicate(resource, operation, data, id, beforeData = null) {
        if (this.enabled === false) {
            return { skipped: true, reason: 'replicator_disabled' };
        }
        if (!this.shouldReplicateResource(resource)) {
            return { skipped: true, reason: 'resource_not_included' };
        }
        const [ok, err, result] = await tryFn(async () => {
            const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
            const queueUrls = this.getQueueUrlsForResource(resource);
            const transformedData = this._applyTransformer(resource, data);
            const message = this.createMessage(resource, operation, transformedData, id, beforeData);
            const results = [];
            for (const queueUrl of queueUrls) {
                const command = new SendMessageCommand({
                    QueueUrl: queueUrl,
                    MessageBody: JSON.stringify(message),
                    MessageGroupId: this.messageGroupId,
                    MessageDeduplicationId: this.deduplicationId ? `${resource}:${operation}:${id}` : undefined
                });
                const sendResult = await this.sqsClient.send(command);
                results.push({ queueUrl, messageId: sendResult.MessageId });
                this.emit('plg:replicator:replicated', {
                    replicator: this.name,
                    resource,
                    operation,
                    id,
                    queueUrl,
                    messageId: sendResult.MessageId,
                    success: true
                });
            }
            return { success: true, results };
        });
        if (ok)
            return result;
        this.logger.warn({ resource, error: err.message }, 'Replication failed');
        this.emit('plg:replicator:error', {
            replicator: this.name,
            resource,
            operation,
            id,
            error: err.message
        });
        return { success: false, error: err.message };
    }
    async replicateBatch(resource, records) {
        if (this.enabled === false) {
            return { skipped: true, reason: 'replicator_disabled' };
        }
        if (!this.shouldReplicateResource(resource)) {
            return { skipped: true, reason: 'resource_not_included' };
        }
        const [ok, err, result] = await tryFn(async () => {
            const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
            const queueUrls = this.getQueueUrlsForResource(resource);
            const batchSize = 10;
            const batches = [];
            for (let i = 0; i < records.length; i += batchSize) {
                batches.push(records.slice(i, i + batchSize));
            }
            const results = [];
            const errors = [];
            for (const batch of batches) {
                const [okBatch, errBatch] = await tryFn(async () => {
                    const entries = batch.map((record, index) => ({
                        Id: `${record.id}-${index}`,
                        MessageBody: JSON.stringify(this.createMessage(resource, record.operation, record.data, record.id, record.beforeData)),
                        MessageGroupId: this.messageGroupId,
                        MessageDeduplicationId: this.deduplicationId ?
                            `${resource}:${record.operation}:${record.id}` : undefined
                    }));
                    const command = new SendMessageBatchCommand({
                        QueueUrl: queueUrls[0],
                        Entries: entries
                    });
                    const batchResult = await this.sqsClient.send(command);
                    results.push(batchResult);
                });
                if (!okBatch) {
                    errors.push({ batch: batch.length, error: errBatch.message });
                    if (errBatch.message && (errBatch.message.includes('Batch error') || errBatch.message.includes('Connection') || errBatch.message.includes('Network'))) {
                        throw errBatch;
                    }
                }
            }
            if (errors.length > 0) {
                this.logger.warn({ resource, errorCount: errors.length, errors }, 'Batch replication completed with errors');
            }
            this.emit('batch_replicated', {
                replicator: this.name,
                resource,
                queueUrl: queueUrls[0],
                total: records.length,
                successful: results.length,
                errors: errors.length
            });
            return {
                success: errors.length === 0,
                results,
                errors,
                total: records.length,
                queueUrl: queueUrls[0]
            };
        });
        if (ok)
            return result;
        const errorMessage = err?.message || String(err) || 'Unknown error';
        this.logger.warn({ resource, error: errorMessage }, 'Batch replication failed');
        this.emit('batch_replicator_error', {
            replicator: this.name,
            resource,
            error: errorMessage
        });
        return { success: false, error: errorMessage };
    }
    async testConnection() {
        const [ok, err] = await tryFn(async () => {
            if (!this.sqsClient) {
                await this.initialize(this.database);
            }
            const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
            const command = new GetQueueAttributesCommand({
                QueueUrl: this.queueUrl,
                AttributeNames: ['QueueArn']
            });
            await this.sqsClient.send(command);
            return true;
        });
        if (ok)
            return true;
        this.logger.warn({ error: err.message }, 'Connection test failed');
        this.emit('connection_error', {
            replicator: this.name,
            error: err.message
        });
        return false;
    }
    async getStatus() {
        const baseStatus = await super.getStatus();
        return {
            ...baseStatus,
            connected: !!this.sqsClient,
            queueUrl: this.queueUrl,
            region: this.region,
            resources: Object.keys(this.resources || {}),
            totalreplicators: this.listenerCount('replicated'),
            totalErrors: this.listenerCount('replicator_error')
        };
    }
    async cleanup() {
        if (this.sqsClient) {
            this.sqsClient.destroy();
        }
        await super.cleanup();
    }
    shouldReplicateResource(resource) {
        const result = (this.resourceQueueMap && Object.keys(this.resourceQueueMap).includes(resource))
            || (this.queues && Object.keys(this.queues).includes(resource))
            || !!(this.defaultQueue || this.queueUrl)
            || (this.resources && Object.keys(this.resources).includes(resource))
            || false;
        return result;
    }
}
export default SqsReplicator;
//# sourceMappingURL=sqs-replicator.class.js.map