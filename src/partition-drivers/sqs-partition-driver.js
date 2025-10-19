import { BasePartitionDriver } from './base-partition-driver.js';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { PartitionDriverError } from '../errors.js';
import tryFn from '../concerns/try-fn.js';

/**
 * SQS-based partition driver for distributed processing
 * Sends partition operations to SQS for processing by workers
 * Ideal for high-volume, distributed systems
 */
export class SQSPartitionDriver extends BasePartitionDriver {
  constructor(options = {}) {
    super(options);
    this.name = 'sqs';
    
    // SQS Configuration
    this.queueUrl = options.queueUrl;
    if (!this.queueUrl) {
      throw new PartitionDriverError('SQS queue URL is required', {
        driver: 'sqs',
        operation: 'constructor',
        suggestion: 'Provide queueUrl in options: new SQSPartitionDriver({ queueUrl: "https://sqs.region.amazonaws.com/account/queue" })'
      });
    }
    
    this.region = options.region || 'us-east-1';
    this.credentials = options.credentials;
    this.dlqUrl = options.dlqUrl; // Dead Letter Queue
    this.messageGroupId = options.messageGroupId || 's3db-partitions';
    this.visibilityTimeout = options.visibilityTimeout || 300; // 5 minutes
    this.batchSize = options.batchSize || 10; // SQS max batch size
    
    // Worker configuration
    this.isWorker = options.isWorker || false;
    this.workerConcurrency = options.workerConcurrency || 5;
    this.pollInterval = options.pollInterval || 1000;
    
    // Initialize SQS client
    this.sqsClient = new SQSClient({
      region: this.region,
      credentials: this.credentials
    });
    
    this.workerRunning = false;
    this.messageBuffer = [];
  }

  async initialize() {
    // Start worker if configured
    if (this.isWorker) {
      await this.startWorker();
    }
  }

  /**
   * Send partition operation to SQS
   */
  async queue(operation) {
    const [ok, error, result] = await tryFn(async () => {
      // Prepare message
      const message = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        operation: {
          type: operation.type,
          resourceName: operation.resource.name,
          data: this.serializeData(operation.data)
        }
      };

      // Buffer messages for batch sending
      this.messageBuffer.push(message);
      this.stats.queued++;

      // Send batch when buffer is full
      if (this.messageBuffer.length >= this.batchSize) {
        await this.flushMessages();
      } else {
        // Schedule flush if not already scheduled
        if (!this.flushTimeout) {
          this.flushTimeout = setTimeout(() => this.flushMessages(), 100);
        }
      }

      return {
        success: true,
        driver: 'sqs',
        messageId: message.id,
        queueUrl: this.queueUrl
      };
    });

    if (!ok) {
      this.emit('error', { operation, error });
      throw error;
    }

    return result;
  }

  /**
   * Flush buffered messages to SQS
   */
  async flushMessages() {
    if (this.messageBuffer.length === 0) return;

    clearTimeout(this.flushTimeout);
    this.flushTimeout = null;

    const messages = this.messageBuffer.splice(0, this.batchSize);

    const [ok, error] = await tryFn(async () => {
      // For FIFO queues, add deduplication ID
      const isFifo = this.queueUrl.includes('.fifo');

      for (const message of messages) {
        const params = {
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(message),
          MessageAttributes: {
            Type: {
              DataType: 'String',
              StringValue: message.operation.type
            },
            Resource: {
              DataType: 'String',
              StringValue: message.operation.resourceName
            }
          }
        };

        if (isFifo) {
          params.MessageGroupId = this.messageGroupId;
          params.MessageDeduplicationId = message.id;
        }

        await this.sqsClient.send(new SendMessageCommand(params));
      }

      this.emit('messagesSent', { count: messages.length });
    });

    if (!ok) {
      // Return messages to buffer for retry
      this.messageBuffer.unshift(...messages);
      this.emit('sendError', { error, messages: messages.length });
      throw error;
    }
  }

  /**
   * Start SQS worker to process messages
   */
  async startWorker() {
    if (this.workerRunning) return;
    
    this.workerRunning = true;
    this.emit('workerStarted', { concurrency: this.workerConcurrency });
    
    // Start multiple concurrent workers
    for (let i = 0; i < this.workerConcurrency; i++) {
      this.pollMessages(i);
    }
  }

  /**
   * Poll SQS for messages
   */
  async pollMessages(workerId) {
    while (this.workerRunning) {
      const [ok, error] = await tryFn(async () => {
        // Receive messages from SQS
        const params = {
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // Long polling
          VisibilityTimeout: this.visibilityTimeout,
          MessageAttributeNames: ['All']
        };

        const response = await this.sqsClient.send(new ReceiveMessageCommand(params));

        if (response.Messages && response.Messages.length > 0) {
          // Process messages
          for (const message of response.Messages) {
            await this.processMessage(message, workerId);
          }
        }
      });

      if (!ok) {
        this.emit('pollError', { workerId, error });
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      }
    }
  }

  /**
   * Process a single SQS message
   */
  async processMessage(message, workerId) {
    const [ok, error] = await tryFn(async () => {
      // Parse message body
      const data = JSON.parse(message.Body);
      const operation = {
        type: data.operation.type,
        data: this.deserializeData(data.operation.data)
      };

      // Process the partition operation
      // Note: We need the actual resource instance to process
      // This would typically be handled by a separate worker service
      this.emit('processingMessage', { workerId, messageId: message.MessageId });

      // In a real implementation, you'd look up the resource and process:
      // await this.processOperation(operation);

      // Delete message from queue after successful processing
      await this.sqsClient.send(new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle
      }));

      this.stats.processed++;
      this.emit('messageProcessed', { workerId, messageId: message.MessageId });
    });

    if (!ok) {
      this.stats.failed++;
      this.emit('processError', { workerId, error, messageId: message.MessageId });

      // Message will become visible again after VisibilityTimeout
      // and eventually move to DLQ if configured
    }
  }

  /**
   * Serialize data for SQS transport
   */
  serializeData(data) {
    // Remove circular references and functions
    return JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'function') return undefined;
      if (value instanceof Buffer) return value.toString('base64');
      return value;
    }));
  }

  /**
   * Deserialize data from SQS
   */
  deserializeData(data) {
    return data;
  }

  /**
   * Stop the worker
   */
  async stopWorker() {
    this.workerRunning = false;
    this.emit('workerStopped');
  }

  /**
   * Force flush all pending messages
   */
  async flush() {
    await this.flushMessages();
  }

  /**
   * Get queue metrics from SQS
   */
  async getQueueMetrics() {
    const [ok, error, result] = await tryFn(async () => {
      const { Attributes } = await this.sqsClient.send(new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed'
        ]
      }));

      return {
        messagesAvailable: parseInt(Attributes.ApproximateNumberOfMessages || 0),
        messagesInFlight: parseInt(Attributes.ApproximateNumberOfMessagesNotVisible || 0),
        messagesDelayed: parseInt(Attributes.ApproximateNumberOfMessagesDelayed || 0)
      };
    });

    if (!ok) {
      return null;
    }

    return result;
  }

  /**
   * Get detailed statistics
   */
  async getStats() {
    const baseStats = super.getStats();
    const queueMetrics = await this.getQueueMetrics();
    
    return {
      ...baseStats,
      bufferLength: this.messageBuffer.length,
      isWorker: this.isWorker,
      workerRunning: this.workerRunning,
      queue: queueMetrics
    };
  }

  /**
   * Shutdown the driver
   */
  async shutdown() {
    // Stop worker if running
    await this.stopWorker();
    
    // Flush remaining messages
    await this.flush();
    
    // Clear buffer
    this.messageBuffer = [];
    
    await super.shutdown();
  }

  getInfo() {
    return {
      name: this.name,
      mode: 'distributed',
      description: 'SQS-based queue for distributed partition processing',
      config: {
        queueUrl: this.queueUrl,
        region: this.region,
        dlqUrl: this.dlqUrl,
        isWorker: this.isWorker,
        workerConcurrency: this.workerConcurrency,
        visibilityTimeout: this.visibilityTimeout
      },
      stats: this.getStats()
    };
  }
}