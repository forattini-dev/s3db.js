import tryFn from "#src/concerns/try-fn.js";
import BaseReplicator from './base-replicator.class.js';

/**
 * SQS Replicator - Send data changes to AWS SQS queues
 * 
 * ⚠️  REQUIRED DEPENDENCY: You must install the AWS SQS SDK:
 * ```bash
 * pnpm add @aws-sdk/client-sqs
 * ```
 * 
 * Configuration:
 * @param {string} region - AWS region (required)
 * @param {string} queueUrl - Single queue URL for all resources
 * @param {Object} queues - Resource-specific queue mapping { resource: queueUrl }
 * @param {string} defaultQueueUrl - Fallback queue URL
 * @param {string} messageGroupId - Message group ID for FIFO queues
 * @param {boolean} deduplicationId - Enable deduplication for FIFO queues
 * @param {Object} credentials - AWS credentials (optional, uses default if omitted)
 * 
 * @example
 * new SqsReplicator({
 *   region: 'us-east-1',
 *   queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/events-queue'
 * }, ['users', 'orders'])
 * 
 * See PLUGINS.md for comprehensive configuration documentation.
 */
class SqsReplicator extends BaseReplicator {
  constructor(config = {}, resources = [], client = null) {
    super(config);
    this.client = client;
    this.queueUrl = config.queueUrl;
    this.queues = config.queues || {};
    this.defaultQueue = config.defaultQueue || config.defaultQueueUrl || config.queueUrlDefault;
    this.region = config.region || 'us-east-1';
    this.sqsClient = client || null;
    this.messageGroupId = config.messageGroupId;
    this.deduplicationId = config.deduplicationId;
    
    // Normalize resources to object format
    if (Array.isArray(resources)) {
      this.resources = {};
      for (const resource of resources) {
        if (typeof resource === 'string') {
          this.resources[resource] = true;
        } else if (typeof resource === 'object' && resource.name) {
          this.resources[resource.name] = resource;
        }
      }
    } else if (typeof resources === 'object') {
      this.resources = resources;
      // Build queues from resources configuration
      for (const [resourceName, resourceConfig] of Object.entries(resources)) {
        if (resourceConfig && resourceConfig.queueUrl) {
          this.queues[resourceName] = resourceConfig.queueUrl;
        }
      }
    } else {
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
    // Prefer resourceQueueMap if present
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
    throw new Error(`No queue URL found for resource '${resource}'`);
  }

  _applyTransformer(resource, data) {
    const entry = this.resources[resource];
    let result = data;
    
    if (!entry) return data;
    
    // Support both transform and transformer (backwards compatibility)
    if (typeof entry.transform === 'function') {
      result = entry.transform(data);
    } else if (typeof entry.transformer === 'function') {
      result = entry.transformer(data);
    }
    
    return result || data;
  }

  /**
   * Create standardized message structure
   */
  createMessage(resource, operation, data, id, beforeData = null) {
    const baseMessage = {
      resource: resource, // padronizado para 'resource'
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
    if (!this.sqsClient) {
      const [ok, err, sdk] = await tryFn(() => import('@aws-sdk/client-sqs'));
      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[SqsReplicator] Failed to import SQS SDK: ${err.message}`);
        }
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
      this.emit('initialized', { 
        replicator: this.name, 
        queueUrl: this.queueUrl,
        queues: this.queues,
        defaultQueue: this.defaultQueue
      });
    }
  }

  async replicate(resource, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: 'resource_not_included' };
    }
    const [ok, err, result] = await tryFn(async () => {
      const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const queueUrls = this.getQueueUrlsForResource(resource);
      // Apply transformation before creating message
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
        const result = await this.sqsClient.send(command);
        results.push({ queueUrl, messageId: result.MessageId });
        this.emit('replicated', {
          replicator: this.name,
          resource,
          operation,
          id,
          queueUrl,
          messageId: result.MessageId,
          success: true
        });
      }
      return { success: true, results };
    });
    if (ok) return result;
    if (this.config.verbose) {
      console.warn(`[SqsReplicator] Replication failed for ${resource}: ${err.message}`);
    }
    this.emit('replicator_error', {
      replicator: this.name,
      resource,
      operation,
      id,
      error: err.message
    });
    return { success: false, error: err.message };
  }

  async replicateBatch(resource, records) {
    if (!this.enabled || !this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: 'resource_not_included' };
    }
    const [ok, err, result] = await tryFn(async () => {
      const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
      const queueUrls = this.getQueueUrlsForResource(resource);
      // SQS batch limit is 10 messages
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
            MessageBody: JSON.stringify(this.createMessage(
              resource, 
              record.operation, 
              record.data, 
              record.id, 
              record.beforeData
            )),
            MessageGroupId: this.messageGroupId,
            MessageDeduplicationId: this.deduplicationId ? 
              `${resource}:${record.operation}:${record.id}` : undefined
          }));
          const command = new SendMessageBatchCommand({
            QueueUrl: queueUrls[0], // Assuming all queueUrls in a batch are the same for batching
            Entries: entries
          });
          const result = await this.sqsClient.send(command);
          results.push(result);
        });
        if (!okBatch) {
          errors.push({ batch: batch.length, error: errBatch.message });
          // If this is a critical error (like connection failure), fail the entire operation
          if (errBatch.message && (errBatch.message.includes('Batch error') || errBatch.message.includes('Connection') || errBatch.message.includes('Network'))) {
            throw errBatch;
          }
        }
      }
      // Log errors if any occurred during batch processing
      if (errors.length > 0) {
        console.warn(`[SqsReplicator] Batch replication completed with ${errors.length} error(s) for ${resource}:`, errors);
      }
      
      this.emit('batch_replicated', {
        replicator: this.name,
        resource,
        queueUrl: queueUrls[0], // Assuming all queueUrls in a batch are the same for batching
        total: records.length,
        successful: results.length,
        errors: errors.length
      });
      return { 
        success: errors.length === 0,
        results,
        errors,
        total: records.length,
        queueUrl: queueUrls[0] // Assuming all queueUrls in a batch are the same for batching
      };
    });
    if (ok) return result;
    const errorMessage = err?.message || err || 'Unknown error';
    if (this.config.verbose) {
      console.warn(`[SqsReplicator] Batch replication failed for ${resource}: ${errorMessage}`);
    }
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
      // Try to get queue attributes to test connection
      const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: ['QueueArn']
      });
      await this.sqsClient.send(command);
      return true;
    });
    if (ok) return true;
    if (this.config.verbose) {
      console.warn(`[SqsReplicator] Connection test failed: ${err.message}`);
    }
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
    // Return true if:
    // 1. Resource has a specific queue mapping, OR
    // 2. Resource has a queue in the queues object, OR  
    // 3. A default queue is configured (accepts all resources), OR
    // 4. Resource is in the resources list (if provided)
    const result = (this.resourceQueueMap && Object.keys(this.resourceQueueMap).includes(resource))
      || (this.queues && Object.keys(this.queues).includes(resource))
      || !!(this.defaultQueue || this.queueUrl) // Default queue accepts all resources
      || (this.resources && Object.keys(this.resources).includes(resource))
      || false;
    return result;
  }
}

export default SqsReplicator; 