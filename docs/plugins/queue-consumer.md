# 📬 Queue Consumer Plugin

<p align="center">
  <strong>External Queue Message Processing</strong><br>
  <em>Consume messages from SQS, RabbitMQ and automatically process them into your resources</em>
</p>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Supported Drivers](#supported-drivers)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

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
  action: 'insert',           // Operation: insert, update, delete
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
const transformationExamples = {
  // User registration events
  users: {
    transform: (message) => {
      // Validate required fields
      if (!message.data.email || !message.data.name) {
        throw new Error('Missing required fields: email, name');
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
// Comprehensive error handling
{
  consumers: [
    {
      resources: ['users'],
      transform: (message) => {
        try {
          // Validate message structure
          if (!message.data || !message.action) {
            throw new Error('Invalid message structure');
          }
          
          // Validate required fields
          if (message.action === 'insert' && !message.data.email) {
            throw new Error('Email is required for user creation');
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