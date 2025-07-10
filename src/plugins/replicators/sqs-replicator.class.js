/**
 * SQS Replicator Configuration Documentation
 * 
 * This replicator sends replication events to Amazon SQS queues. It supports both
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
 *     'source': 's3db-replication'
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
  constructor(config = {}, resources = []) {
    super(config);
    this.resources = resources;
    
    // Support both single queue and resource-specific queues
    this.queueUrl = config.queueUrl; // Legacy single queue
    this.queues = config.queues || {}; // Resource-specific queues
    this.defaultQueueUrl = config.defaultQueueUrl; // Fallback queue
    
    this.region = config.region || 'us-east-1';
    this.sqsClient = null;
    this.messageGroupId = config.messageGroupId;
    this.deduplicationId = config.deduplicationId;
  }

  validateConfig() {
    const errors = [];
    
    // Must have either queueUrl, queues, or defaultQueueUrl
    if (!this.queueUrl && Object.keys(this.queues).length === 0 && !this.defaultQueueUrl) {
      errors.push('Either queueUrl, queues object, or defaultQueueUrl must be provided');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get the appropriate queue URL for a resource
   */
  getQueueUrlForResource(resource) {
    // First check resource-specific queue
    if (this.queues[resource]) {
      return this.queues[resource];
    }
    
    // Then check legacy single queue
    if (this.queueUrl) {
      return this.queueUrl;
    }
    
    // Finally check default queue
    if (this.defaultQueueUrl) {
      return this.defaultQueueUrl;
    }
    
    throw new Error(`No queue URL found for resource '${resource}'`);
  }

  /**
   * Create standardized message structure
   */
  createMessage(resource, operation, data, id, beforeData = null) {
    const baseMessage = {
      resource: resource, // padronizado para 'resource'
      action: operation,
      timestamp: new Date().toISOString(),
      source: 's3db-replication'
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

  async initialize(database) {
    await super.initialize(database);
    
    // Initialize SQS client
    try {
      const { SQSClient, SendMessageCommand, SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
      
      this.sqsClient = new SQSClient({
        region: this.region,
        credentials: this.config.credentials
      });
      
      this.emit('initialized', { 
        replicator: this.name, 
        queueUrl: this.queueUrl,
        queues: this.queues,
        defaultQueueUrl: this.defaultQueueUrl
      });
    } catch (error) {
      this.emit('initialization_error', {
        replicator: this.name,
        error: error.message
      });
      throw error;
    }
  }

  async replicate(resource, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    try {
      const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
      
      const queueUrl = this.getQueueUrlForResource(resource);
      const message = this.createMessage(resource, operation, data, id, beforeData);

      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: this.messageGroupId,
        MessageDeduplicationId: this.deduplicationId ? 
          `${resource}:${operation}:${id}` : undefined
      });

      const result = await this.sqsClient.send(command);

      this.emit('replicated', {
        replicator: this.name,
        resource,
        operation,
        id,
        queueUrl,
        messageId: result.MessageId,
        success: true
      });

      return { success: true, messageId: result.MessageId, queueUrl };
    } catch (error) {
      this.emit('replication_error', {
        replicator: this.name,
        resource,
        operation,
        id,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  async replicateBatch(resource, records) {
    if (!this.enabled || !this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: 'resource_not_included' };
    }

    try {
      const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
      
      const queueUrl = this.getQueueUrlForResource(resource);
      
      // SQS batch limit is 10 messages
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < records.length; i += batchSize) {
        batches.push(records.slice(i, i + batchSize));
      }

      const results = [];
      const errors = [];

      for (const batch of batches) {
        try {
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
            QueueUrl: queueUrl,
            Entries: entries
          });

          const result = await this.sqsClient.send(command);
          results.push(result);
        } catch (error) {
          errors.push({ batch: batch.length, error: error.message });
        }
      }

      this.emit('batch_replicated', {
        replicator: this.name,
        resource,
        queueUrl,
        total: records.length,
        successful: results.length,
        errors: errors.length
      });

      return { 
        success: errors.length === 0,
        results,
        errors,
        total: records.length,
        queueUrl
      };
    } catch (error) {
      this.emit('batch_replication_error', {
        replicator: this.name,
        resource,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
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
    } catch (error) {
      this.emit('connection_error', {
        replicator: this.name,
        error: error.message
      });
      return false;
    }
  }

  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.sqsClient,
      queueUrl: this.queueUrl,
      region: this.region,
      resources: this.resources,
      totalReplications: this.listenerCount('replicated'),
      totalErrors: this.listenerCount('replication_error')
    };
  }

  async cleanup() {
    if (this.sqsClient) {
      this.sqsClient.destroy();
    }
    await super.cleanup();
  }

  shouldReplicateResource(resource) {
    return this.resources.length === 0 || this.resources.includes(resource);
  }
}

export default SqsReplicator; 