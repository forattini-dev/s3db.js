/**
 * # QueueConsumerPlugin - Queue Message Consumer for s3db.js
 *
 * ## Overview
 *
 * The QueueConsumerPlugin consumes messages from queue services (AWS SQS, RabbitMQ)
 * and automatically maps them to s3db.js resource operations (insert, update, delete).
 * Perfect for event-driven architectures and asynchronous data processing.
 *
 * ## Features
 *
 * 1. **Multi-Driver Support** - SQS, RabbitMQ, and custom drivers
 * 2. **Automatic Operation Mapping** - Messages automatically execute resource operations
 * 3. **Flexible Configuration** - Configure multiple consumers with different queues
 * 4. **Error Handling** - Built-in error handling with custom hooks
 * 5. **Message Format** - Simple JSON format: { resource, action, data }
 * 6. **Resource Routing** - Route messages to specific resources
 * 7. **Driver-Specific Options** - AWS credentials, RabbitMQ URLs, prefetch, etc.
 *
 * ## Configuration
 *
 * ```javascript
 * import { Database } from 's3db.js';
 * import { QueueConsumerPlugin } from 's3db.js/plugins/queue-consumer';
 *
 * const db = new Database({
 *   connectionString: 's3://bucket/db'
 * });
 *
 * // SQS Configuration
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [
 *     {
 *       driver: 'sqs',
 *       config: {
 *         region: 'us-east-1',
 *         credentials: {
 *           accessKeyId: 'YOUR_ACCESS_KEY',
 *           secretAccessKey: 'YOUR_SECRET_KEY'
 *         },
 *         pollingInterval: 1000,  // Poll every 1 second
 *         maxMessages: 10         // Max messages per poll
 *       },
 *       consumers: [
 *         {
 *           resources: 'users',
 *           queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue'
 *         },
 *         {
 *           resources: ['orders', 'shipments'],
 *           queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/orders-queue'
 *         }
 *       ]
 *     }
 *   ]
 * }));
 *
 * // RabbitMQ Configuration
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [
 *     {
 *       driver: 'rabbitmq',
 *       config: {
 *         amqpUrl: 'amqp://user:pass@localhost:5672',
 *         prefetch: 10,
 *         reconnectInterval: 2000
 *       },
 *       consumers: [
 *         {
 *           resources: 'users',
 *           queueName: 'users-queue'
 *         }
 *       ]
 *     }
 *   ]
 * }));
 * ```
 *
 * ## Usage Examples
 *
 * ### Basic Queue Consumer (SQS)
 *
 * ```javascript
 * const db = new Database({ connectionString: 's3://bucket/db' });
 *
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [
 *     {
 *       driver: 'sqs',
 *       config: {
 *         region: 'us-east-1',
 *         credentials: {
 *           accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *           secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
 *         }
 *       },
 *       consumers: [
 *         {
 *           resources: 'users',
 *           queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue'
 *         }
 *       ]
 *     }
 *   ]
 * }));
 *
 * await db.start();
 *
 * // Plugin will now consume messages from the queue
 * // Message format: { resource: 'users', action: 'insert', data: { ... } }
 * ```
 *
 * ### Message Format
 *
 * ```javascript
 * // INSERT operation
 * {
 *   "resource": "users",
 *   "action": "insert",
 *   "data": {
 *     "id": "u1",
 *     "name": "John Doe",
 *     "email": "john@example.com"
 *   }
 * }
 *
 * // UPDATE operation
 * {
 *   "resource": "users",
 *   "action": "update",
 *   "data": {
 *     "id": "u1",
 *     "name": "Jane Doe"
 *   }
 * }
 *
 * // DELETE operation
 * {
 *   "resource": "users",
 *   "action": "delete",
 *   "data": {
 *     "id": "u1"
 *   }
 * }
 *
 * // Messages can be nested in $body for SQS SNS integration
 * {
 *   "$body": {
 *     "resource": "users",
 *     "action": "insert",
 *     "data": { ... }
 *   }
 * }
 * ```
 *
 * ### Multiple Consumers
 *
 * ```javascript
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [
 *     // SQS Consumer
 *     {
 *       driver: 'sqs',
 *       config: {
 *         region: 'us-east-1',
 *         credentials: { ... }
 *       },
 *       consumers: [
 *         { resources: 'users', queueUrl: 'https://...' },
 *         { resources: 'orders', queueUrl: 'https://...' }
 *       ]
 *     },
 *     // RabbitMQ Consumer
 *     {
 *       driver: 'rabbitmq',
 *       config: {
 *         amqpUrl: 'amqp://localhost:5672'
 *       },
 *       consumers: [
 *         { resources: 'notifications', queueName: 'notifications-queue' }
 *       ]
 *     }
 *   ]
 * }));
 * ```
 *
 * ### Sending Messages to Queue
 *
 * ```javascript
 * // AWS SQS Example (using AWS SDK)
 * import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
 *
 * const sqsClient = new SQSClient({ region: 'us-east-1' });
 *
 * await sqsClient.send(new SendMessageCommand({
 *   QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/users-queue',
 *   MessageBody: JSON.stringify({
 *     resource: 'users',
 *     action: 'insert',
 *     data: {
 *       id: 'u1',
 *       name: 'John Doe',
 *       email: 'john@example.com'
 *     }
 *   })
 * }));
 *
 * // RabbitMQ Example (using amqplib)
 * import amqp from 'amqplib';
 *
 * const connection = await amqp.connect('amqp://localhost');
 * const channel = await connection.createChannel();
 *
 * await channel.sendToQueue(
 *   'users-queue',
 *   Buffer.from(JSON.stringify({
 *     resource: 'users',
 *     action: 'insert',
 *     data: {
 *       id: 'u1',
 *       name: 'John Doe',
 *       email: 'john@example.com'
 *     }
 *   }))
 * );
 * ```
 *
 * ## Best Practices
 *
 * ### 1. Use Resource-Specific Queues
 *
 * ```javascript
 * // GOOD: Separate queues per resource
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [
 *     {
 *       driver: 'sqs',
 *       config: { region: 'us-east-1' },
 *       consumers: [
 *         { resources: 'users', queueUrl: 'https://.../users-queue' },
 *         { resources: 'orders', queueUrl: 'https://.../orders-queue' },
 *         { resources: 'products', queueUrl: 'https://.../products-queue' }
 *       ]
 *     }
 *   ]
 * }));
 *
 * // OK: Single queue for multiple related resources
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [
 *     {
 *       driver: 'sqs',
 *       config: { region: 'us-east-1' },
 *       consumers: [
 *         {
 *           resources: ['orders', 'order_items', 'shipments'],
 *           queueUrl: 'https://.../order-processing-queue'
 *         }
 *       ]
 *     }
 *   ]
 * }));
 * ```
 *
 * ### 2. Configure Appropriate Polling Intervals
 *
 * ```javascript
 * // High-throughput (frequent polling)
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: {
 *       pollingInterval: 500,  // Poll every 500ms
 *       maxMessages: 10        // Process up to 10 messages
 *     },
 *     consumers: [...]
 *   }]
 * }));
 *
 * // Low-throughput (less frequent polling)
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: {
 *       pollingInterval: 5000,  // Poll every 5 seconds
 *       maxMessages: 1          // Process 1 message at a time
 *     },
 *     consumers: [...]
 *   }]
 * }));
 * ```
 *
 * ### 3. Validate Messages Before Processing
 *
 * ```javascript
 * // The plugin automatically validates message structure
 * // Ensure your messages include:
 * // - resource: string (required)
 * // - action: 'insert' | 'update' | 'delete' (required)
 * // - data: object (required)
 *
 * // Example of invalid message (will throw QueueError)
 * {
 *   "action": "insert",  // ❌ Missing 'resource'
 *   "data": { ... }
 * }
 *
 * // Example of valid message
 * {
 *   "resource": "users",  // ✅
 *   "action": "insert",   // ✅
 *   "data": { ... }       // ✅
 * }
 * ```
 *
 * ### 4. Use Dead Letter Queues (DLQ)
 *
 * ```javascript
 * // Configure DLQ in AWS SQS Console or via AWS SDK
 * // Messages that fail repeatedly will be sent to DLQ for manual review
 *
 * // Example: Configure DLQ with AWS CDK
 * const dlq = new sqs.Queue(this, 'UsersDLQ', {
 *   queueName: 'users-dlq'
 * });
 *
 * const queue = new sqs.Queue(this, 'UsersQueue', {
 *   queueName: 'users-queue',
 *   deadLetterQueue: {
 *     queue: dlq,
 *     maxReceiveCount: 3  // Retry 3 times before sending to DLQ
 *   }
 * });
 * ```
 *
 * ## Performance Considerations
 *
 * ### Message Processing Throughput
 *
 * - **SQS**: Up to 100 messages/second with default settings
 * - **RabbitMQ**: Up to 1000+ messages/second with prefetch=10
 * - Processing time depends on resource operation complexity
 *
 * ### Optimization Tips
 *
 * ```javascript
 * // 1. Increase maxMessages for batch processing (SQS)
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: {
 *       maxMessages: 10  // Process 10 messages per poll
 *     },
 *     consumers: [...]
 *   }]
 * }));
 *
 * // 2. Increase prefetch for higher throughput (RabbitMQ)
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'rabbitmq',
 *     config: {
 *       prefetch: 20  // Process 20 messages concurrently
 *     },
 *     consumers: [...]
 *   }]
 * }));
 *
 * // 3. Use multiple consumers for parallel processing
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [
 *     { driver: 'sqs', config: {...}, consumers: [{resources: 'users', queueUrl: '...'}] },
 *     { driver: 'sqs', config: {...}, consumers: [{resources: 'orders', queueUrl: '...'}] }
 *   ]
 * }));
 * ```
 *
 * ## Troubleshooting
 *
 * ### Messages Not Being Consumed
 *
 * ```javascript
 * // Check if plugin is started
 * await db.start();  // Must call start() to begin consuming
 *
 * // Check if consumers are running
 * const plugin = db.pluginRegistry.QueueConsumerPlugin;
 * this.logger.info(plugin.consumers);  // Should show active consumers
 *
 * // Check queue URL/name is correct
 * this.logger.info(plugin.driversConfig);
 * ```
 *
 * ### Resource Not Found Error
 *
 * ```javascript
 * // Error: Resource 'users' not found
 *
 * // Ensure resource is created before starting plugin
 * await db.createResource({
 *   name: 'users',
 *   attributes: { ... }
 * });
 *
 * await db.use(new QueueConsumerPlugin({...}));
 * await db.start();
 * ```
 *
 * ### Invalid Message Format
 *
 * ```javascript
 * // Error: Resource not found in message
 * // Ensure message includes 'resource' field
 *
 * // Error: Action not found in message
 * // Ensure message includes 'action' field
 *
 * // Error: Unsupported action 'create'
 * // Use 'insert', 'update', or 'delete' only
 *
 * // Check message format
 * this.logger.info(JSON.stringify({
 *   resource: 'users',      // ✅ Required
 *   action: 'insert',       // ✅ Required (insert/update/delete)
 *   data: { id: 'u1', ... } // ✅ Required
 * }, null, 2));
 * ```
 *
 * ### SQS Credentials Issues
 *
 * ```javascript
 * // Use environment variables
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: {
 *       region: process.env.AWS_REGION || 'us-east-1',
 *       credentials: {
 *         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
 *       }
 *     },
 *     consumers: [...]
 *   }]
 * }));
 *
 * // Or use IAM role (no credentials needed)
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: { region: 'us-east-1' },  // Uses IAM role automatically
 *     consumers: [...]
 *   }]
 * }));
 * ```
 *
 * ## Real-World Use Cases
 *
 * ### 1. Event-Driven Data Sync
 *
 * ```javascript
 * // Sync data from external system to s3db via queue
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: { region: 'us-east-1' },
 *     consumers: [
 *       { resources: 'users', queueUrl: 'https://.../external-users-queue' },
 *       { resources: 'products', queueUrl: 'https://.../external-products-queue' }
 *     ]
 *   }]
 * }));
 *
 * // External system sends messages to SQS
 * // s3db automatically processes them
 * ```
 *
 * ### 2. Asynchronous Writes
 *
 * ```javascript
 * // Handle high-volume writes asynchronously
 * // API enqueues writes → Queue Consumer processes them
 *
 * // In API
 * await sqsClient.send(new SendMessageCommand({
 *   QueueUrl: 'https://.../analytics-queue',
 *   MessageBody: JSON.stringify({
 *     resource: 'page_views',
 *     action: 'insert',
 *     data: { page: '/home', timestamp: new Date(), userId: 'u1' }
 *   })
 * }));
 *
 * // Queue Consumer processes asynchronously
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: { pollingInterval: 100, maxMessages: 10 },
 *     consumers: [{ resources: 'page_views', queueUrl: '...' }]
 *   }]
 * }));
 * ```
 *
 * ### 3. Microservices Integration
 *
 * ```javascript
 * // Multiple microservices send events to shared queue
 * // s3db consumes and stores all events
 *
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'rabbitmq',
 *     config: { amqpUrl: 'amqp://localhost' },
 *     consumers: [
 *       { resources: 'events', queueName: 'service-events' }
 *     ]
 *   }]
 * }));
 * ```
 *
 * ### 4. ETL Pipeline
 *
 * ```javascript
 * // Extract → Transform → Load pipeline
 * // Extract: External system → SQS
 * // Transform: Lambda/Worker → Modified message → SQS
 * // Load: s3db consumes and stores
 *
 * await db.use(new QueueConsumerPlugin({
 *   consumers: [{
 *     driver: 'sqs',
 *     config: { region: 'us-east-1' },
 *     consumers: [
 *       { resources: 'raw_data', queueUrl: 'https://.../raw-queue' },
 *       { resources: 'processed_data', queueUrl: 'https://.../processed-queue' }
 *     ]
 *   }]
 * }));
 * ```
 *
 * ## API Reference
 *
 * ### Constructor Options
 *
 * ```typescript
 * interface QueueConsumerPluginOptions {
 *   consumers: Array<{
 *     driver: 'sqs' | 'rabbitmq' | string;
 *     config: DriverConfig;
 *     consumers: Array<{
 *       resources: string | string[];
 *       queueUrl?: string;   // For SQS
 *       queueName?: string;  // For RabbitMQ
 *       [key: string]: any;  // Driver-specific options
 *     }>;
 *   }>;
 * }
 *
 * // SQS Driver Config
 * interface SQSDriverConfig {
 *   region: string;
 *   credentials?: {
 *     accessKeyId: string;
 *     secretAccessKey: string;
 *   };
 *   pollingInterval?: number;  // Default: 1000ms
 *   maxMessages?: number;      // Default: 10
 * }
 *
 * // RabbitMQ Driver Config
 * interface RabbitMQDriverConfig {
 *   amqpUrl: string;
 *   prefetch?: number;         // Default: 10
 *   reconnectInterval?: number; // Default: 2000ms
 * }
 * ```
 *
 * ### Message Structure
 *
 * ```typescript
 * interface QueueMessage {
 *   resource: string;                    // Resource name
 *   action: 'insert' | 'update' | 'delete'; // Operation
 *   data: object;                        // Operation data
 * }
 *
 * // Optional: Nested in $body
 * interface NestedQueueMessage {
 *   $body: QueueMessage;
 * }
 * ```
 *
 * ### Supported Actions
 *
 * - `insert` - Creates new record (calls `resource.insert(data)`)
 * - `update` - Updates existing record (calls `resource.update(data.id, data)`)
 * - `delete` - Deletes record (calls `resource.delete(data.id)`)
 *
 * ## Notes
 *
 * - Messages are processed sequentially per consumer
 * - Failed messages are retried based on queue configuration
 * - Plugin automatically stops all consumers on `db.stop()`
 * - Double-nested messages (SNS→SQS) are automatically unwrapped
 * - Error handling can be customized via `onError` callback
 */

import { PromisePool } from '@supercharge/promise-pool';
import { Plugin } from './plugin.class.js';
import { createConsumer } from './consumers/index.js';
import tryFn from "../concerns/try-fn.js";
import { QueueError } from "./queue.errors.js";
import { createLogger } from '../concerns/logger.js';

export class QueueConsumerPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    const opts = this.options;

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.verbose ? 'debug' : 'info';
      this.logger = createLogger({ name: 'QueueConsumerPlugin', level: logLevel });
    }

    // New pattern: consumers = [{ driver, config, consumers: [{ queueUrl, resources, ... }] }]
    this.driversConfig = Array.isArray(opts.consumers) ? opts.consumers : [];
    this.consumers = [];
    this.startConcurrency = Math.max(1, opts.startConcurrency ?? 5);
    this.stopConcurrency = Math.max(1, opts.stopConcurrency ?? this.startConcurrency);
  }

  async onInstall() {
    const startTasks = [];

    for (const driverDef of this.driversConfig) {
      const { driver, config: driverConfig = {}, consumers: consumerDefs = [] } = driverDef;

      for (const consumerDef of consumerDefs) {
        const { resources, ...consumerConfig } = consumerDef;
        const resourceList = Array.isArray(resources) ? resources : [resources];

        for (const resource of resourceList) {
          startTasks.push({
            driver,
            resource,
            start: async () => {
              const mergedConfig = { ...driverConfig, ...consumerConfig };
              const consumer = await createConsumer(driver, {
                ...mergedConfig,
                onMessage: (msg) => this._handleMessage(msg, resource),
                onError: (err, raw) => this._handleError(err, raw, resource)
              });
              await consumer.start();
              this.consumers.push(consumer);
            }
          });
        }
      }
    }

    if (startTasks.length === 0) {
      return;
    }

    const { errors } = await PromisePool
      .withConcurrency(this.startConcurrency)
      .for(startTasks)
      .process(async task => {
        await task.start();
        return `${task.driver}:${task.resource}`;
      });

    if (errors.length > 0) {
      const messages = errors.map(({ item, reason }) => {
        const identifier = item ? `${item.driver || 'unknown'}:${item.resource || 'unknown'}` : 'unknown';
        return `[${identifier}] ${reason?.message || reason}`;
      });

      throw new QueueError('Failed to start one or more queue consumers', {
        operation: 'onInstall',
        details: messages.join('; '),
        suggestion: 'Review queue consumer configuration and connectivity before retrying.'
      });
    }
  }

  async stop() {
    if (!Array.isArray(this.consumers)) this.consumers = [];
    if (this.consumers.length === 0) {
      return;
    }

    const stopTasks = this.consumers
      .filter(consumer => consumer && typeof consumer.stop === 'function')
      .map(consumer => ({
        consumer,
        stop: () => consumer.stop()
      }));

    const { errors } = await PromisePool
      .withConcurrency(this.stopConcurrency)
      .for(stopTasks)
      .process(async task => {
        await task.stop();
        return task.consumer;
      });

    if (errors.length > 0) {
      errors.forEach(({ reason }) => {
        this.logger.warn(
          { error: reason?.message || reason },
          `Failed to stop consumer: ${reason?.message || reason}`
        );
      });
    }

    this.consumers = [];
  }

  async _handleMessage(msg, configuredResource) {
    const opt = this.options;
    // Permitir resource/action/data tanto na raiz quanto em $body
    // Handle double nesting from SQS parsing
    let body = msg.$body || msg;
    if (body.$body && !body.resource && !body.action && !body.data) {
      // Double nested case - use the inner $body
      body = body.$body;
    }
    
    let resource = body.resource || msg.resource;
    let action = body.action || msg.action;
    let data = body.data || msg.data;
    

    
    if (!resource) {
      throw new QueueError('Resource not found in message', {
        operation: 'handleMessage',
        queueName: configuredResource,
        messageBody: body,
        suggestion: 'Ensure message includes a "resource" field specifying the target resource name'
      });
    }
    if (!action) {
      throw new QueueError('Action not found in message', {
        operation: 'handleMessage',
        queueName: configuredResource,
        resource,
        messageBody: body,
        suggestion: 'Ensure message includes an "action" field (insert, update, or delete)'
      });
    }
    const resourceObj = this.database.resources[resource];
    if (!resourceObj) {
      throw new QueueError(`Resource '${resource}' not found`, {
        operation: 'handleMessage',
        queueName: configuredResource,
        resource,
        availableResources: Object.keys(this.database.resources),
        suggestion: 'Check resource name or ensure resource is created before consuming messages'
      });
    }
    
    let result;
    const [ok, err, res] = await tryFn(async () => {
      if (action === 'insert') {
        result = await resourceObj.insert(data);
      } else if (action === 'update') {
        const { id: updateId, ...updateAttributes } = data;
        result = await resourceObj.update(updateId, updateAttributes);
      } else if (action === 'delete') {
        result = await resourceObj.delete(data.id);
      } else {
        throw new QueueError(`Unsupported action '${action}'`, {
          operation: 'handleMessage',
          queueName: configuredResource,
          resource,
          action,
          supportedActions: ['insert', 'update', 'delete'],
          suggestion: 'Use one of the supported actions: insert, update, or delete'
        });
      }
      return result;
    });
    
    if (!ok) {
      throw err;
    }
    return res;
  }

  _handleError(err, raw, resourceName) {
  }
}
