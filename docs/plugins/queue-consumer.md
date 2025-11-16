# 📬 Queue Consumer Plugin

> **Bridge SQS and RabbitMQ messages into S3DB insert/update/delete operations.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#configuration) | [FAQ ↓](#-faq)

---

## 📦 Dependencies

The Queue Consumer Plugin requires **driver-specific peer dependencies** based on which queue system you're using.

**Peer Dependencies:** (install only what you need)

```bash
# For AWS SQS
pnpm add @aws-sdk/client-sqs

# For RabbitMQ
pnpm add amqplib
```

**Dependency Matrix:**

| Driver | Package | Version | Auto-installed? |
|--------|---------|---------|-----------------|
| SQS | `@aws-sdk/client-sqs` | `^3.0.0` | ❌ Optional |
| RabbitMQ | `amqplib` | `^0.10.0` | ❌ Optional |

**What's Included:**
- ✅ Queue consumer framework (built-in)
- ✅ Message processing engine (built-in)
- ✅ Retry logic (built-in)
- ✅ Event system (built-in)
- ✅ Concurrent processing (built-in)

**Installation:**
```javascript
// Install driver dependency first
// pnpm add @aws-sdk/client-sqs

import { Database, QueueConsumerPlugin } from 's3db.js';

await db.usePlugin(new QueueConsumerPlugin({
  consumers: [{
    driver: 'sqs',  // Requires @aws-sdk/client-sqs
    config: { queueUrl: '...' },
    consumers: [{ resources: 'users' }]
  }]
}));
```

**Automatic Validation:**
The plugin validates dependencies at runtime and provides clear error messages with installation instructions if dependencies are missing.

**Example Error:**
```
Error: SQS Queue Consumer - Missing dependencies detected!

❌ Missing dependency: @aws-sdk/client-sqs
   Description: AWS SDK for SQS
   Required: ^3.0.0
   Install: pnpm add @aws-sdk/client-sqs
```

---

## ⚡ TLDR

Consumes messages from **SQS/RabbitMQ** and automatically processes them as insert/update/delete operations.

**Basic example:**
```javascript
await db.usePlugin(new QueueConsumerPlugin({
  consumers: [{ driver: 'sqs', config: { queueUrl: '...' }, consumers: [{ resources: 'users' }] }]
}));  // Messages become operations automatically!
```

**Key features:**
- ✅ Drivers: SQS, RabbitMQ
- ✅ Auto-processing: msg → insert/update/delete
- ✅ Concurrent processing + batching
- ✅ Retry logic + dead letter queue
- ✅ Custom transformations

**When to use:**
- 🔄 Event-driven architectures
- 🌐 Microservices communication
- 📡 Real-time data sync
- 📬 Webhook processing

---

## ⚡ Quick Start

Get started with queue consumption in under 2 minutes (using SQS):

```javascript
import { Database, QueueConsumerPlugin } from 's3db.js';

// Step 1: Create database
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Step 2: Create resource
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

// Step 3: Configure queue consumer
const queueConsumerPlugin = new QueueConsumerPlugin({
  consumers: [{
    driver: 'sqs',
    config: {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
      region: 'us-east-1'
    },
    consumers: [{
      resources: 'users',  // Process messages for users resource
      concurrency: 5       // Process up to 5 messages concurrently
    }]
  }]
});

await db.usePlugin(queueConsumerPlugin);

// Step 4: Start consuming messages
await queueConsumerPlugin.start();
console.log('Queue consumer started! Listening for messages...');

// Messages are automatically processed!
// Example message from SQS:
// {
//   "operation": "insert",
//   "resource": "users",
//   "data": { "name": "Alice", "email": "alice@example.com" }
// }
// → Automatically calls: users.insert({ name: "Alice", email: "alice@example.com" })

// Step 5: Monitor processing
queueConsumerPlugin.on('messageProcessed', (event) => {
  console.log('Processed:', event);
  // { operation: 'inserted', resource: 'users', recordId: 'user-1', duration: 145 }
});

queueConsumerPlugin.on('messageError', (error) => {
  console.error('Processing failed:', error);
});

// Step 6: Stop when done (optional)
// await queueConsumerPlugin.stop();
```

**What just happened:**
1. ✅ QueueConsumerPlugin installed with SQS driver
2. ✅ Configured to consume from SQS queue
3. ✅ Messages automatically converted to insert/update/delete operations
4. ✅ Concurrent processing with automatic retry on failure

**Next steps:**
- Try RabbitMQ driver (see [Supported Drivers](#supported-drivers))
- Add custom message transformations (see [Usage Examples](#usage-examples))
- Configure retry and dead letter queue (see [Configuration Options](#configuration-options))

---

## 📋 Table of Contents

1. [📦 Dependencies](#-dependencies)
2. [⚡ TLDR](#-tldr)
3. [⚡ Quick Start](#-quick-start)
4. [Overview](#overview)
5. [Key Features](#key-features)
6. [Installation & Setup](#installation--setup)
7. [Configuration Options](#configuration-options)
8. [Supported Drivers](#supported-drivers)
9. [Usage Examples](#usage-examples)
10. [API Reference](#api-reference)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)
13. [See Also](#see-also)
14. [❓ FAQ](#-faq)

---

## Overview

The Queue Consumer Plugin allows you to consume messages from external queues (SQS, RabbitMQ) and automatically process them into your s3db resources. This enables event-driven architectures and seamless integration with message-based systems.

### How It Works

1. **Queue Monitoring**: Continuously polls configured queues for new messages
2. **Message Processing**: Parses incoming messages and extracts operation data
3. **Resource Operations**: Automatically performs database operations based on message content
4. **Error Handling**: Implements retries, dead letter queues, and comprehensive error reporting
5. **Concurrent Processing**: Handles multiple messages simultaneously for high throughput

> 📬 **Event-Driven**: Perfect for microservices architectures, data synchronization, and real-time processing workflows.

---

## Key Features

### 🎯 Core Features
- **Multi-Driver Support**: SQS, RabbitMQ, and extensible driver architecture
- **Automatic Processing**: Messages are automatically converted to database operations
- **Concurrent Processing**: Configurable concurrency for high-throughput scenarios
- **Error Resilience**: Automatic retries, dead letter queue support, and error tracking
- **Flexible Mapping**: Custom resource mapping and message transformation

### 🔧 Technical Features
- **Batch Processing**: Process multiple messages efficiently in batches
- **Message Acknowledgment**: Proper message acknowledgment and visibility timeouts
- **Health Monitoring**: Built-in health checks and performance metrics
- **Custom Transformations**: Transform message data before database operations
- **Selective Processing**: Process only specific message types or resources

---

## Installation & Setup

### 📦 Required Dependencies

**Important:** Queue consumer drivers require additional dependencies. The s3db.js core package **does not include** these dependencies to keep the package lightweight.

**Install only what you need:**

```bash
# For SQS queue consumption
pnpm add @aws-sdk/client-sqs

# For RabbitMQ queue consumption
pnpm add amqplib
```

| Driver | Package | Version | Install Command |
|--------|---------|---------|-----------------|
| `sqs` | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| `rabbitmq` | `amqplib` | `^0.10.0` | `pnpm add amqplib` |

**Automatic Validation:** When you use a queue consumer, s3db.js automatically validates dependencies at runtime. If a dependency is missing, you'll get a clear error message with installation instructions.

**Example Error:**

```bash
Error: SQS Queue Consumer - Missing dependencies detected!

❌ Missing dependency: @aws-sdk/client-sqs
   Description: AWS SDK for SQS
   Required: ^3.0.0
   Install: pnpm add @aws-sdk/client-sqs
```

---

### Basic Setup

```javascript
import { S3db, QueueConsumerPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new QueueConsumerPlugin({
    consumers: [
      {
        driver: 'sqs',
        config: {
          queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
          region: 'us-east-1'
        },
        consumers: [
          { resources: 'users' }
        ]
      }
    ]
  })]
});

await s3db.connect();
// Queue messages are automatically processed into your resources
```

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable queue consumption |
| `consumers` | array | `[]` | Array of consumer configurations |
| `batchSize` | number | `10` | Messages to process per batch |
| `concurrency` | number | `5` | Concurrent message processing |
| `retryAttempts` | number | `3` | Retry failed message processing |
| `retryDelay` | number | `1000` | Delay between retries (ms) |
| `deadLetterQueue` | string | `null` | DLQ for failed messages |

### Message Format

Expected message structure:

```javascript
{
  resource: 'users',           // Target resource name
  action: 'inserted',           // Operation: insert, update, delete
  data: {                     // Data payload
    name: 'John Doe',
    email: 'john@example.com'
  },
  id: 'user-123',            // Optional: Record ID for updates/deletes
  metadata: {                // Optional: Additional metadata
    source: 'external-system',
    timestamp: '2024-01-15T10:30:00.000Z'
  }
}
```

---

## Supported Drivers

### 📬 SQS Consumer

Consume from AWS SQS queues with comprehensive configuration options:

```javascript
{
  driver: 'sqs',
  config: {
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    region: 'us-east-1',
    credentials: { 
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
    },
    pollingInterval: 1000,      // Polling frequency (ms)
    maxMessages: 10,            // Max messages per poll
    visibilityTimeout: 300,     // Message visibility timeout (seconds)
    waitTimeSeconds: 20,        // Long polling duration
    deleteAfterProcessing: true // Auto-delete processed messages
  },
  consumers: [
    { 
      resources: ['users', 'products'],
      queueUrl: 'specific-queue-url',  // Override default queue
      transform: (message) => ({
        ...message,
        processed_at: new Date().toISOString()
      })
    }
  ]
}
```

### 🐰 RabbitMQ Consumer

Consume from RabbitMQ queues with exchange and routing configurations:

```javascript
{
  driver: 'rabbitmq',
  config: {
    amqpUrl: 'amqp://user:pass@localhost:5672',
    exchange: 'my-exchange',
    exchangeType: 'topic',      // Exchange type: direct, topic, fanout
    prefetch: 10,               // Message prefetch count
    reconnectInterval: 2000,    // Reconnection interval (ms)
    heartbeat: 60,              // Heartbeat interval (seconds)
    durable: true               // Durable connections and queues
  },
  consumers: [
    { 
      resources: ['orders'], 
      queue: 'orders-queue',
      routingKey: 'order.*',    // Routing key pattern
      transform: (message) => {
        // Custom message transformation
        return {
          ...message.content,
          routing_key: message.fields.routingKey,
          received_at: new Date().toISOString()
        };
      }
    }
  ]
}
```

---

## Usage Examples

### Multi-Queue Processing Setup

```javascript
const queueConsumerPlugin = new QueueConsumerPlugin({
  enabled: true,
  batchSize: 20,
  concurrency: 10,
  retryAttempts: 5,
  retryDelay: 2000,
  
  consumers: [
    // SQS Consumer for user events
    {
      driver: 'sqs',
      config: {
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-events',
        region: 'us-east-1',
        maxMessages: 10,
        visibilityTimeout: 300
      },
      consumers: [
        {
          resources: ['users'],
          transform: (message) => ({
            ...message,
            source: 'user-service',
            processed_at: new Date().toISOString()
          })
        }
      ]
    },
    
    // RabbitMQ Consumer for order events
    {
      driver: 'rabbitmq',
      config: {
        amqpUrl: process.env.RABBITMQ_URL,
        exchange: 'order-events',
        exchangeType: 'topic'
      },
      consumers: [
        {
          resources: ['orders'],
          queue: 'order-processing',
          routingKey: 'order.created',
          transform: (message) => ({
            ...message.content,
            event_type: message.fields.routingKey,
            processed_at: new Date().toISOString()
          })
        },
        {
          resources: ['order_analytics'],
          queue: 'order-analytics',
          routingKey: 'order.*',
          transform: (message) => ({
            order_id: message.content.id,
            action: message.fields.routingKey.split('.')[1],
            customer_id: message.content.userId,
            amount: message.content.amount,
            timestamp: new Date().toISOString()
          })
        }
      ]
    }
  ]
});
```

### Advanced Message Processing

```javascript
// Custom message processor with validation and transformation
class MessageProcessor {
  constructor(queueConsumerPlugin) {
    this.plugin = queueConsumerPlugin;
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Success handling
    this.plugin.on('message_processed', (data) => {
      console.log(`✅ Processed: ${data.action} on ${data.resource} (${data.messageId})`);
    });
    
    // Error handling
    this.plugin.on('message_error', (data) => {
      console.error(`❌ Failed: ${data.error} (${data.messageId})`);
      this.handleFailedMessage(data);
    });
    
    // Batch completion
    this.plugin.on('batch_completed', (data) => {
      console.log(`📦 Batch completed: ${data.processed}/${data.total} messages`);
    });
  }
  
  async handleFailedMessage(data) {
    // Custom error handling logic
    if (data.retryCount >= 3) {
      await this.sendToDeadLetterQueue(data);
    } else {
      await this.scheduleRetry(data);
    }
  }
  
  async sendToDeadLetterQueue(data) {
    // Send failed message to DLQ for manual review
    console.log(`📮 Sending to DLQ: ${data.messageId}`);
  }
  
  async scheduleRetry(data) {
    // Schedule message for retry with exponential backoff
    const delay = Math.pow(2, data.retryCount) * 1000; // Exponential backoff
    setTimeout(() => {
      console.log(`🔄 Retrying message: ${data.messageId}`);
      // Retry logic here
    }, delay);
  }
}

// Usage
const processor = new MessageProcessor(s3db.plugins.queueConsumer);
```

### Message Transformation Examples

```javascript
// Complex transformation scenarios
import { PluginError } from 's3db.js';

const transformationExamples = {
  // User registration events
  users: {
    transform: (message) => {
      // Validate required fields
      if (!message.data.email || !message.data.name) {
        throw new PluginError('QueueConsumer transform requires email and name', {
          statusCode: 422,
          retriable: false,
          suggestion: 'Ensure upstream producer populates both fields before enqueueing.',
          metadata: { messageId: message.metadata?.messageId }
        });
      }
      
      return {
        id: message.data.id || generateId(),
        name: message.data.name.trim(),
        email: message.data.email.toLowerCase(),
        status: 'active',
        source: message.metadata?.source || 'external',
        created_at: message.data.created_at || new Date().toISOString(),
        processed_at: new Date().toISOString()
      };
    }
  },
  
  // Order events with computed fields
  orders: {
    transform: (message) => {
      const orderData = message.data;
      
      // Calculate order totals
      const subtotal = (orderData.items || []).reduce((sum, item) => 
        sum + (item.price * item.quantity), 0);
      const tax = subtotal * (orderData.tax_rate || 0.08);
      const total = subtotal + tax + (orderData.shipping_cost || 0);
      
      return {
        ...orderData,
        subtotal,
        tax_amount: tax,
        total_amount: total,
        item_count: orderData.items?.length || 0,
        is_large_order: total > 1000,
        processed_at: new Date().toISOString()
      };
    }
  },
  
  // Event logging
  event_log: {
    transform: (message) => ({
      event_id: generateId(),
      resource_type: message.resource,
      action_type: message.action,
      data_payload: JSON.stringify(message.data),
      source_queue: message.metadata?.queue || 'unknown',
      timestamp: new Date().toISOString(),
      processing_duration: message.metadata?.processing_time || 0
    })
  }
};
```

### Health Monitoring and Metrics

```javascript
class QueueHealthMonitor {
  constructor(queueConsumerPlugin) {
    this.plugin = queueConsumerPlugin;
    this.metrics = {
      processed: 0,
      failed: 0,
      retries: 0,
      startTime: Date.now()
    };
    this.setupMonitoring();
  }
  
  setupMonitoring() {
    this.plugin.on('message_processed', () => {
      this.metrics.processed++;
    });
    
    this.plugin.on('message_error', (data) => {
      this.metrics.failed++;
      if (data.retryCount > 0) {
        this.metrics.retries++;
      }
    });
    
    // Health check every minute
    setInterval(() => {
      this.performHealthCheck();
    }, 60000);
  }
  
  performHealthCheck() {
    const uptime = Date.now() - this.metrics.startTime;
    const totalMessages = this.metrics.processed + this.metrics.failed;
    const successRate = totalMessages > 0 ? 
      (this.metrics.processed / totalMessages * 100).toFixed(2) : 100;
    const messagesPerMinute = totalMessages / (uptime / 60000);
    
    console.log(`📊 Queue Health Check:`);
    console.log(`  Uptime: ${Math.round(uptime / 60000)} minutes`);
    console.log(`  Success Rate: ${successRate}%`);
    console.log(`  Messages/min: ${messagesPerMinute.toFixed(2)}`);
    console.log(`  Processed: ${this.metrics.processed}`);
    console.log(`  Failed: ${this.metrics.failed}`);
    console.log(`  Retries: ${this.metrics.retries}`);
    
    // Alert on low success rate
    if (successRate < 95 && totalMessages > 10) {
      console.warn(`⚠️ Low success rate detected: ${successRate}%`);
    }
    
    // Alert on high failure rate
    if (this.metrics.failed > 0 && this.metrics.failed / totalMessages > 0.1) {
      console.error(`🚨 High failure rate: ${((this.metrics.failed / totalMessages) * 100).toFixed(2)}%`);
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      successRate: this.metrics.processed / (this.metrics.processed + this.metrics.failed)
    };
  }
}

// Usage
const healthMonitor = new QueueHealthMonitor(s3db.plugins.queueConsumer);
```

---

## API Reference

### Plugin Constructor

```javascript
new QueueConsumerPlugin({
  enabled?: boolean,
  consumers: ConsumerConfig[],
  batchSize?: number,
  concurrency?: number,
  retryAttempts?: number,
  retryDelay?: number,
  deadLetterQueue?: string
})
```

### Consumer Configuration

```javascript
interface ConsumerConfig {
  driver: 'sqs' | 'rabbitmq' | string;
  config: DriverConfig;
  consumers: ResourceConsumer[];
}

interface ResourceConsumer {
  resources: string | string[];
  queue?: string;
  queueUrl?: string;
  routingKey?: string;
  transform?: (message: any) => any;
}
```

### Event System

The plugin emits various events for monitoring and debugging:

```javascript
// Message processing events
plugin.on('message_received', (data) => {
  console.log(`Received message: ${data.messageId}`);
});

plugin.on('message_processed', (data) => {
  console.log(`Processed: ${data.action} on ${data.resource}`);
});

plugin.on('message_error', (data) => {
  console.error(`Error: ${data.error}`);
});

// Batch events
plugin.on('batch_started', (data) => {
  console.log(`Started processing batch of ${data.size} messages`);
});

plugin.on('batch_completed', (data) => {
  console.log(`Completed batch: ${data.processed}/${data.total}`);
});

// Connection events
plugin.on('consumer_connected', (data) => {
  console.log(`Connected to ${data.driver}: ${data.queue}`);
});

plugin.on('consumer_disconnected', (data) => {
  console.log(`Disconnected from ${data.driver}: ${data.queue}`);
});
```

---

## Best Practices

### 1. Implement Proper Error Handling

```javascript
import { PluginError } from 's3db.js';

// Comprehensive error handling
{
  consumers: [
    {
      resources: ['users'],
      transform: (message) => {
        try {
          // Validate message structure
          if (!message.data || !message.action) {
            throw new PluginError('Queue consumer message is missing data/action', {
              statusCode: 400,
              retriable: false,
              suggestion: 'Ensure the producer publishes both "data" and "action" fields.',
              metadata: { messageId: message.id }
            });
          }
          
          // Validate required fields
          if (message.action === 'inserted' && !message.data.email) {
            throw new PluginError('Email is required for user creation', {
              statusCode: 422,
              retriable: false,
              suggestion: 'Populate data.email before enqueueing inserted user messages.',
              metadata: { messageId: message.id }
            });
          }
          
          return {
            ...message.data,
            processed_at: new Date().toISOString()
          };
        } catch (error) {
          // Log error with context
          console.error('Transform error:', {
            messageId: message.id,
            error: error.message,
            originalMessage: message
          });
          
          // Re-throw to trigger retry logic
          throw error;
        }
      }
    }
  ]
}
```

### 2. Configure Appropriate Batch Sizes

```javascript
// Optimize based on message size and processing complexity
{
  // For small, simple messages
  batchSize: 50,
  concurrency: 20,
  
  // For large or complex messages
  batchSize: 10,
  concurrency: 5,
  
  // For high-throughput scenarios
  batchSize: 100,
  concurrency: 50
}
```

### 3. Implement Message Deduplication

```javascript
// Prevent duplicate processing
const processedMessages = new Set();

{
  consumers: [{
    resources: ['orders'],
    transform: (message) => {
      const messageKey = `${message.resource}:${message.action}:${message.data.id}`;
      
      if (processedMessages.has(messageKey)) {
        console.log(`Skipping duplicate message: ${messageKey}`);
        return null; // Skip processing
      }
      
      processedMessages.add(messageKey);
      
      // Clean up old entries periodically
      if (processedMessages.size > 10000) {
        processedMessages.clear();
      }
      
      return message.data;
    }
  }]
}
```

### 4. Monitor Queue Depth and Performance

```javascript
// Queue monitoring setup
const monitorQueues = async () => {
  // SQS queue attributes
  const sqsAttributes = await sqs.getQueueAttributes({
    QueueUrl: queueUrl,
    AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
  }).promise();
  
  const messagesAvailable = parseInt(sqsAttributes.Attributes.ApproximateNumberOfMessages);
  const messagesInFlight = parseInt(sqsAttributes.Attributes.ApproximateNumberOfMessagesNotVisible);
  
  console.log(`Queue depth: ${messagesAvailable} available, ${messagesInFlight} in flight`);
  
  // Alert on high queue depth
  if (messagesAvailable > 1000) {
    console.warn('⚠️ High queue depth detected - consider scaling consumers');
  }
};

// Monitor every 5 minutes
setInterval(monitorQueues, 5 * 60 * 1000);
```

### 5. Implement Graceful Shutdown

```javascript
// Graceful shutdown handling
class GracefulShutdown {
  constructor(queueConsumerPlugin) {
    this.plugin = queueConsumerPlugin;
    this.isShuttingDown = false;
    this.setupShutdownHandlers();
  }
  
  setupShutdownHandlers() {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }
  
  async shutdown(signal) {
    if (this.isShuttingDown) return;
    
    console.log(`📥 Received ${signal}, initiating graceful shutdown...`);
    this.isShuttingDown = true;
    
    try {
      // Stop accepting new messages
      await this.plugin.stop();
      
      // Wait for current messages to finish processing
      await this.waitForProcessingToComplete();
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
  
  async waitForProcessingToComplete(maxWait = 30000) {
    const startTime = Date.now();
    
    while (this.plugin.isProcessing() && (Date.now() - startTime) < maxWait) {
      console.log('⏳ Waiting for message processing to complete...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Usage
const gracefulShutdown = new GracefulShutdown(s3db.plugins.queueConsumer);
```

### 6. Use Environment-Specific Configuration

```javascript
// Environment-based configuration
const getQueueConfig = () => {
  const env = process.env.NODE_ENV;
  
  const baseConfig = {
    retryAttempts: 3,
    retryDelay: 1000
  };
  
  if (env === 'production') {
    return {
      ...baseConfig,
      batchSize: 50,
      concurrency: 20,
      consumers: [
        {
          driver: 'sqs',
          config: {
            queueUrl: process.env.PROD_SQS_QUEUE_URL,
            region: process.env.AWS_REGION,
            visibilityTimeout: 300
          },
          consumers: [{ resources: ['users', 'orders'] }]
        }
      ]
    };
  }
  
  if (env === 'staging') {
    return {
      ...baseConfig,
      batchSize: 20,
      concurrency: 5,
      consumers: [
        {
          driver: 'sqs',
          config: {
            queueUrl: process.env.STAGING_SQS_QUEUE_URL,
            region: process.env.AWS_REGION
          },
          consumers: [{ resources: ['users'] }]
        }
      ]
    };
  }
  
  // Development
  return {
    ...baseConfig,
    enabled: false // Disable in development
  };
};
```

---

## Troubleshooting

### Issue: Messages not being processed
**Solution**: Check queue URLs, verify credentials, and ensure proper IAM permissions for SQS or connection settings for RabbitMQ.

### Issue: High message processing latency
**Solution**: Increase concurrency, optimize transform functions, or reduce batch size for faster processing.

### Issue: Messages being processed multiple times
**Solution**: Implement message deduplication logic and ensure proper message acknowledgment settings.

### Issue: Consumer disconnections
**Solution**: Check network connectivity, implement proper reconnection logic, and monitor connection health.

### Issue: Memory usage growing over time
**Solution**: Clear processed message caches, optimize transform functions, and monitor for memory leaks.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Replicator Plugin](./replicator.md) - Send messages to queues
- [Audit Plugin](./audit.md) - Track queue message processing
- [Metrics Plugin](./metrics.md) - Monitor queue processing performance
## ❓ FAQ

### General

**Q: What does the QueueConsumerPlugin do?**
A: Consumes messages from external queues (SQS, RabbitMQ) and executes operations on S3DB automatically (insert, update, delete).

**Q: Which drivers are available?**
A: `sqs` (AWS SQS) and `rabbitmq` (RabbitMQ/AMQP).

**Q: What is the message format?**
A: JSON with `resource`, `action` and `data`:
```json
{
  "resource": "users",
  "action": "insert",
  "data": { "id": "123", "name": "John" }
}
```

**Q: Can I use multiple queue systems simultaneously?**
A: Yes! Configure multiple consumers with different drivers:
```javascript
consumers: [
  { driver: 'sqs', config: {...}, consumers: [...] },
  { driver: 'rabbitmq', config: {...}, consumers: [...] }
]
```

**Q: Does QueueConsumerPlugin work with MemoryClient?**
A: Yes! All queue-processed operations use MemoryClient when `useFakeS3: true`, making testing blazing fast.

**Q: Can I run multiple QueueConsumerPlugin instances?**
A: Yes, use `namespace` parameter:
```javascript
await db.usePlugin(new QueueConsumerPlugin({...}), { namespace: 'queue1' });
await db.usePlugin(new QueueConsumerPlugin({...}), { namespace: 'queue2' });
```

**Q: Is QueueConsumerPlugin compatible with other plugins?**
A: Yes! Works seamlessly with MetricsPlugin (performance tracking), AuditPlugin (change logging), and ReplicatorPlugin (forwarding).

---

### Configuration

**Q: How to configure multiple queues?**
A: Use the array format:
```javascript
new QueueConsumerPlugin({
  consumers: [
    {
      driver: 'sqs',
      config: { region: 'us-east-1', credentials: {...} },
      consumers: [
        { resources: 'users', queueUrl: 'https://sqs...users' },
        { resources: 'orders', queueUrl: 'https://sqs...orders' }
      ]
    }
  ]
})
```

**Q: How to configure RabbitMQ?**
A: Use the `rabbitmq` driver:
```javascript
new QueueConsumerPlugin({
  consumers: [{
    driver: 'rabbitmq',
    config: {
      amqpUrl: 'amqp://user:pass@localhost:5672',
      prefetch: 10,
      reconnectInterval: 2000
    },
    consumers: [
      { resources: 'users', queue: 'users-queue' }
    ]
  }]
})
```

**Q: How to configure concurrency?**
A: Use the `concurrency` option:
```javascript
new QueueConsumerPlugin({
  consumers: [{
    driver: 'sqs',
    config: { region: 'us-east-1' },
    consumers: [
      { resources: 'emails', queueUrl: '...', concurrency: 10 }
    ]
  }]
})
```

**Q: How to configure batch processing?**
A: Use `batchSize`:
```javascript
new QueueConsumerPlugin({
  batchSize: 50,  // Process up to 50 messages per batch
  consumers: [...]
})
```

**Q: How to configure SQS long polling?**
A: Use `waitTimeSeconds`:
```javascript
config: {
  queueUrl: '...',
  waitTimeSeconds: 20,  // Long poll for 20 seconds
  pollingInterval: 100  // Check every 100ms after receiving
}
```

**Q: How to configure retry logic?**
A: Use `retryAttempts` and `retryDelay`:
```javascript
new QueueConsumerPlugin({
  retryAttempts: 5,
  retryDelay: 2000,  // 2 seconds between retries
  consumers: [...]
})
```

**Q: How to configure dead letter queue?**
A: Use `deadLetterQueue`:
```javascript
new QueueConsumerPlugin({
  deadLetterQueue: 'https://sqs.us-east-1.amazonaws.com/.../my-dlq',
  consumers: [...]
})
```

**Q: How to configure message visibility timeout?**
A: SQS-specific setting:
```javascript
config: {
  queueUrl: '...',
  visibilityTimeout: 300  // 5 minutes
}
```

---

### Operations

**Q: Which actions are supported?**
A: `inserted`, `updated`, `deleted`, `upserted`, `patched`, `replaced`.

**Q: How to transform messages before processing?**
A: Use the `transform` function:
```javascript
consumers: [{
  resources: 'users',
  transform: (message) => ({
    ...message.data,
    processed_at: new Date().toISOString(),
    source: 'queue'
  })
}]
```

**Q: How to handle errors?**
A: Use event handlers:
```javascript
plugin.on('message_error', (data) => {
  console.error('Processing failed:', data.error);
  // Send to DLQ, notify, etc.
});
```

**Q: How to filter messages?**
A: Use `transform` to return `null`:
```javascript
transform: (message) => {
  if (message.data.skip) return null;  // Skip processing
  return message.data;
}
```

**Q: How to handle partial failures in batch processing?**
A: The plugin processes messages individually within batches - failures don't block other messages.

**Q: Can I process messages to multiple resources?**
A: Yes, use array format or route in transform:
```javascript
consumers: [
  { resources: ['users', 'accounts'], queueUrl: '...' }
]
```

**Q: How to implement message deduplication?**
A: Use a Set or database to track processed message IDs:
```javascript
const processed = new Set();
transform: (message) => {
  if (processed.has(message.id)) return null;
  processed.add(message.id);
  return message.data;
}
```

---

### SQS-Specific

**Q: How to configure SQS credentials?**
A: Use `credentials` object:
```javascript
config: {
  queueUrl: '...',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}
```

**Q: How to use SQS FIFO queues?**
A: FIFO queues work automatically - just provide the FIFO queue URL:
```javascript
config: {
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/.../my-queue.fifo'
}
```

**Q: How to handle SQS message attributes?**
A: Access via `message.attributes`:
```javascript
transform: (message) => ({
  ...message.data,
  priority: message.attributes?.Priority || 'normal'
})
```

**Q: How to delete messages after processing?**
A: Enabled by default with `deleteAfterProcessing: true`:
```javascript
config: {
  queueUrl: '...',
  deleteAfterProcessing: true  // Default
}
```

**Q: What IAM permissions are needed for SQS?**
A:
- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`
- `sqs:GetQueueAttributes`
- `sqs:ChangeMessageVisibility`

---

### RabbitMQ-Specific

**Q: How to configure RabbitMQ exchanges?**
A: Use `exchange` and `exchangeType`:
```javascript
config: {
  amqpUrl: 'amqp://...',
  exchange: 'my-exchange',
  exchangeType: 'topic'  // direct, topic, fanout, headers
}
```

**Q: How to use routing keys?**
A: Specify per consumer:
```javascript
consumers: [{
  resources: 'orders',
  queue: 'order-queue',
  routingKey: 'order.*'  // Wildcard pattern
}]
```

**Q: How to handle RabbitMQ connection drops?**
A: Use `reconnectInterval`:
```javascript
config: {
  amqpUrl: 'amqp://...',
  reconnectInterval: 2000,  // Reconnect after 2 seconds
  heartbeat: 60  // Heartbeat every 60 seconds
}
```

**Q: How to configure message prefetch?**
A: Use `prefetch`:
```javascript
config: {
  amqpUrl: 'amqp://...',
  prefetch: 20  // Fetch 20 messages at a time
}
```

**Q: How to use durable queues?**
A: Set `durable: true`:
```javascript
config: {
  amqpUrl: 'amqp://...',
  durable: true  // Persist queue across restarts
}
```

**Q: How to acknowledge messages manually?**
A: Messages are auto-acknowledged after successful processing. For manual control, use event handlers.

---

### Performance

**Q: How to increase throughput?**
A: Increase `concurrency` and `batchSize`:
```javascript
new QueueConsumerPlugin({
  batchSize: 100,
  concurrency: 50,
  consumers: [...]
})
```

**Q: How to reduce latency?**
A: Use smaller `pollingInterval` (SQS) or higher `prefetch` (RabbitMQ):
```javascript
config: {
  pollingInterval: 100  // SQS: Poll every 100ms
  // OR
  prefetch: 50  // RabbitMQ: Prefetch more messages
}
```

**Q: What's the overhead of queue consumption?**
A: Minimal - ~1-5ms per message for parsing and routing. Network latency dominates.

**Q: How to optimize transform functions?**
A: Keep transforms lightweight:
```javascript
// ✅ Fast
transform: (msg) => ({ ...msg.data, ts: Date.now() })

// ❌ Slow
transform: async (msg) => {
  await someHeavyOperation();  // Blocks other messages
  return msg.data;
}
```

**Q: How many messages can be processed per second?**
A: With concurrency=50, batchSize=100: ~1000-5000 msg/sec depending on operation complexity.

**Q: Does queue consumption block database operations?**
A: No. Queue consumption runs asynchronously in parallel with other operations.

---

### Monitoring & Events

**Q: What events are available?**
A:
- `message_received` - Message received from queue
- `message_processed` - Message successfully processed
- `message_error` - Message processing failed
- `batch_started` - Batch processing started
- `batch_completed` - Batch processing completed
- `consumer_connected` - Connected to queue
- `consumer_disconnected` - Disconnected from queue

**Q: How to monitor queue health?**
A: Use event handlers with metrics:
```javascript
let processed = 0, failed = 0;
plugin.on('message_processed', () => processed++);
plugin.on('message_error', () => failed++);

setInterval(() => {
  console.log(`Processed: ${processed}, Failed: ${failed}`);
}, 60000);
```

**Q: How to track processing duration?**
A: Use `message_processed` event:
```javascript
plugin.on('message_processed', (data) => {
  console.log(`Processed in ${data.duration}ms`);
});
```

**Q: How to integrate with MetricsPlugin?**
A: Automatic when both plugins are active:
```javascript
await db.usePlugin(new MetricsPlugin({ enabled: true }));
await db.usePlugin(new QueueConsumerPlugin({...}));
// Queue operations automatically tracked in metrics
```

---

### Troubleshooting

**Q: Messages are not being processed?**
A: Check:
1. Message format (resource/action/data)
2. Resource exists in database
3. Correct credentials and region
4. Queue has available messages
5. Plugin is started: `await plugin.start()`

**Q: How to debug the consumer?**
A: Enable debug logging:
```javascript
new QueueConsumerPlugin({
  logLevel: 'debug',
  consumers: [...]
})
```

**Q: Messages are failing silently?**
A: Add error handler:
```javascript
plugin.on('message_error', (data) => {
  console.error('Error:', data.error);
  console.log('Message:', data.message);
  console.log('Retry count:', data.retryCount);
});
```

**Q: High memory usage from queue consumption?**
A: Lower `concurrency` and `batchSize`:
```javascript
new QueueConsumerPlugin({
  batchSize: 10,
  concurrency: 5,
  consumers: [...]
})
```

**Q: Queue consumer not connecting?**
A:
1. Check queue URL/AMQP URL is correct
2. Verify credentials/permissions
3. Check network connectivity
4. Review console for connection errors

**Q: Messages being processed multiple times?**
A: Implement deduplication or check `deleteAfterProcessing` is enabled.

**Q: SQS: "Access Denied" error?**
A: Verify IAM permissions include SQS actions (ReceiveMessage, DeleteMessage, etc.).

**Q: RabbitMQ: "Connection refused" error?**
A: Check RabbitMQ server is running and `amqpUrl` is correct.

---

### Advanced

**Q: Can I create custom drivers?**
A: Yes, extend the base driver class and implement required methods.

**Q: How to implement exponential backoff for retries?**
A: Use event handlers with custom retry logic:
```javascript
plugin.on('message_error', async (data) => {
  const delay = Math.pow(2, data.retryCount) * 1000;
  await new Promise(resolve => setTimeout(resolve, delay));
  // Retry logic here
});
```

**Q: How to process messages to different resources based on content?**
A: Use routing in transform:
```javascript
transform: (message) => {
  if (message.type === 'user') return { resource: 'users', data: message.data };
  if (message.type === 'order') return { resource: 'orders', data: message.data };
  return null;
}
```

**Q: How to implement priority queues?**
A: Use multiple consumers with different priorities:
```javascript
consumers: [
  { resources: 'high_priority', queueUrl: '...high', concurrency: 20 },
  { resources: 'low_priority', queueUrl: '...low', concurrency: 5 }
]
```

**Q: How to archive processed messages?**
A: Use AuditPlugin or custom archiving:
```javascript
plugin.on('message_processed', async (data) => {
  await archiveMessage(data);
});
```

**Q: Can I pause/resume queue consumption?**
A: Yes:
```javascript
await plugin.stop();   // Pause
await plugin.start();  // Resume
```

---

### For AI Agents

**Q: What's the message processing pipeline?**
A:
1. Poll queue for messages
2. Parse message JSON
3. Validate message format
4. Run transform function (if configured)
5. Execute database operation (insert/update/delete)
6. Acknowledge message
7. Emit events (processed or error)

**Q: How does concurrent processing work?**
A: Uses Promise.all() with semaphore to limit concurrent operations based on `concurrency` setting.

**Q: What happens when transform returns null?**
A: Message is skipped and acknowledged (not processed).

**Q: How are errors handled internally?**
A: Caught, retried based on `retryAttempts`, then sent to DLQ (if configured) or emitted as `message_error` event.

**Q: What's the difference between batchSize and concurrency?**
A:
- `batchSize`: Max messages fetched from queue per poll
- `concurrency`: Max messages processed simultaneously

**Q: How to access raw queue message?**
A: Available in transform and event handlers via `message` object.

**Q: What's the plugin initialization order?**
A: QueueConsumerPlugin should be registered after resource creation but can be started anytime.

**Q: How to implement custom message validation?**
A: Use transform:
```javascript
transform: (message) => {
  if (!validateSchema(message.data)) {
    throw new Error('Invalid message schema');
  }
  return message.data;
}
```

**Q: What's the memory footprint per message?**
A: ~1-5KB per message (JSON parsing + processing metadata).

**Q: Can queue consumption cause race conditions?**
A: No. Each message is processed independently with proper locking at the database level.

---
