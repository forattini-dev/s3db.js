/**
 * SQS Replicator Configuration Documentation
 * 
 * This replicator sends replicator events to Amazon SQS queues. It supports both
 * resource-specific queues and a single queue for all events, with a flexible message
 * structure that includes operation details and data.
 * 
 * ⚠️  REQUIRED DEPENDENCY: You must install the AWS SQS SDK to use this replicator:
 * 
 * ```bash
 * npm install @aws-sdk/client-sqs
 * # or
 * yarn add @aws-sdk/client-sqs
 * # or
 * pnpm add @aws-sdk/client-sqs
 * ```
 * 
 * @typedef {Object} SQSReplicatorConfig
 * @property {string} region - AWS region where the SQS queues are located
 * @property {string} [accessKeyId] - AWS access key ID (if not using IAM roles)
 * @property {string} [secretAccessKey] - AWS secret access key (if not using IAM roles)
 * @property {string} [sessionToken] - AWS session token for temporary credentials
 * @property {string} [defaultQueueUrl] - Default SQS queue URL for all events when resource-specific queues are not configured
 * @property {Object.<string, string>} [resourceQueues] - Maps s3db resource names to specific SQS queue URLs
 *   - Key: s3db resource name (e.g., 'users', 'orders')
 *   - Value: SQS queue URL (e.g., 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue')
 *   - If not provided, defaultQueueUrl is used for all resources
 * @property {number} [maxRetries=3] - Maximum number of retry attempts for failed message sends
 * @property {number} [retryDelay=1000] - Delay in milliseconds between retry attempts
 * @property {boolean} [logMessages=false] - Whether to log message details to console for debugging
 * @property {number} [messageDelaySeconds=0] - Delay in seconds before messages become visible in queue
 * @property {Object} [messageAttributes] - Additional attributes to include with every SQS message
 *   - Key: attribute name (e.g., 'environment', 'version')
 *   - Value: attribute value (e.g., 'production', '1.0.0')
 * @property {string} [messageGroupId] - Message group ID for FIFO queues (required for FIFO queues)
 * @property {boolean} [useFIFO=false] - Whether the target queues are FIFO queues
 * @property {number} [batchSize=10] - Number of messages to send in a single batch (for batch operations)
 * @property {boolean} [compressMessages=false] - Whether to compress message bodies using gzip
 * @property {string} [messageFormat='json'] - Format for message body: 'json' or 'stringified'
 * @property {Object} [sqsClientOptions] - Additional options to pass to the SQS client constructor
 * 
 * @example
 * // Configuration with resource-specific queues
 * {
 *   region: 'us-east-1',
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   resourceQueues: {
 *     'users': 'https://sqs.us-east-1.amazonaws.com/123456789012/users-events',
 *     'orders': 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-events',
 *     'products': 'https://sqs.us-east-1.amazonaws.com/123456789012/products-events'
 *   },
 *   logMessages: true,
 *   messageAttributes: {
 *     'environment': 'production',
 *     'source': 's3db-replicator'
 *   }
 * }
 * 
 * @example
 * // Configuration with single default queue
 * {
 *   region: 'us-west-2',
 *   defaultQueueUrl: 'https://sqs.us-west-2.amazonaws.com/123456789012/all-events',
 *   maxRetries: 5,
 *   retryDelay: 2000,
 *   compressMessages: true
 * }
 * 
 * @example
 * // FIFO queue configuration
 * {
 *   region: 'eu-west-1',
 *   defaultQueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789012/events.fifo',
 *   useFIFO: true,
 *   messageGroupId: 's3db-events',
 *   messageDelaySeconds: 5
 * }
 * 
 * @example
 * // Minimal configuration using IAM roles
 * {
 *   region: 'us-east-1',
 *   defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue'
 * }
 * 
 * @notes
 * - Requires AWS credentials with SQS SendMessage permissions
 * - Resource-specific queues take precedence over defaultQueueUrl
 * - Message structure includes: resource, action, data, before (for updates), timestamp, source
 * - FIFO queues require messageGroupId and ensure strict ordering
 * - Message compression reduces bandwidth but increases CPU usage
 * - Batch operations improve performance but may fail if any message in batch fails
 * - Retry mechanism uses exponential backoff for failed sends
 * - Message attributes are useful for filtering and routing in SQS
 * - Message delay is useful for implementing eventual consistency patterns
 * - SQS client options allow for custom endpoint, credentials, etc.
 */
import BaseReplicator from './base-replicator.class.js';
import tryFn from "../../concerns/try-fn.js";

/**
 * SQS Replicator - Sends data to AWS SQS queues with support for resource-specific queues
 * 
 * Configuration options:
 * - queueUrl: Single queue URL for all resources
 * - queues: Object mapping resource names to specific queue URLs
 * - defaultQueueUrl: Fallback queue URL when resource-specific queue is not found
 * - messageGroupId: For FIFO queues
 * - deduplicationId: For FIFO queues
 * 
 * Example configurations:
 * 
 * // Single queue for all resources
 * {
 *   queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue'
 * }
 * 
 * // Resource-specific queues
 * {
 *   queues: {
 *     users: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue',
 *     orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue'
 *   },
 *   defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/default-queue'
 * }
 */
class SqsReplicator extends BaseReplicator {
  constructor(config = {}, resources = [], client = null) {
    super(config);
    this.resources = resources;
    this.client = client;
    this.queueUrl = config.queueUrl;
    this.queues = config.queues || {};
    this.defaultQueue = config.defaultQueue || config.defaultQueueUrl || config.queueUrlDefault;
    this.region = config.region || 'us-east-1';
    this.sqsClient = client || null;
    this.messageGroupId = config.messageGroupId;
    this.deduplicationId = config.deduplicationId;
    
    // Build queues from resources configuration
    if (resources && typeof resources === 'object') {
      for (const [resourceName, resourceConfig] of Object.entries(resources)) {
        if (resourceConfig.queueUrl) {
          this.queues[resourceName] = resourceConfig.queueUrl;
        }
      }
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
    
    // Check for transform function in resource config
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
      resources: this.resources,
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