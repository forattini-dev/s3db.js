# Usage Patterns

> **In this guide:** Multi-queue processing, message transformations, health monitoring, graceful shutdown, and real-world scenarios.

**Navigation:** [← Back to Queue Consumer Plugin](../README.md) | [Configuration](./configuration.md)

---

## Basic Usage

### SQS Consumer

```javascript
import { Database } from 's3db.js';
import { QueueConsumerPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

const queueConsumerPlugin = new QueueConsumerPlugin({
  drivers: [{
    driver: 'sqs',
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
    region: 'us-east-1',
    queues: [{
      resources: 'users'
    }]
  }]
});

await db.usePlugin(queueConsumerPlugin);
```

### RabbitMQ Consumer

```javascript
const queueConsumerPlugin = new QueueConsumerPlugin({
  drivers: [{
    driver: 'rabbitmq',
    amqpUrl: 'amqp://user:pass@localhost:5672',
    queue: 'order-queue',
    queues: [{
      resources: 'orders'
    }]
  }]
});
```

---

## Multi-Queue Processing

### Mixed Drivers Setup

```javascript
const queueConsumerPlugin = new QueueConsumerPlugin({
  drivers: [
    // SQS Consumer for user events
    {
      driver: 'sqs',
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-events',
      region: 'us-east-1',
      maxMessages: 10,
      queues: [{
        resources: ['users']
      }]
    },

    // RabbitMQ Consumer for order events
    {
      driver: 'rabbitmq',
      amqpUrl: process.env.RABBITMQ_URL,
      queue: 'order-processing',
      queues: [{
        resources: ['orders']
      }]
    },

    // Custom handler (no resource)
    {
      driver: 'redis-stream',
      host: 'localhost',
      stream: 'events',
      group: 'workers',
      consumer: 'worker-1',
      queues: [{
        name: 'event-processor',
        onMessage: async (msg, ctx) => {
          console.log('Event:', msg.$body, 'from', ctx.driver);
        }
      }]
    }
  ]
});
```

### Multiple SQS Queues

```javascript
new QueueConsumerPlugin({
  drivers: [{
    driver: 'sqs',
    region: 'us-east-1',
    credentials: { ... },
    queues: [
      { resources: 'users', queueUrl: 'https://sqs...users' },
      { resources: 'orders', queueUrl: 'https://sqs...orders' },
      { resources: 'products', queueUrl: 'https://sqs...products' }
    ]
  }]
})
```

---

## Message Transformations

### Type Conversion

```javascript
transforms: {
  users: {
    transform: (message) => ({
      id: message.data.id || generateId(),
      name: message.data.name.trim(),
      email: message.data.email.toLowerCase(),
      age: parseInt(message.data.age, 10),
      status: 'active',
      created_at: new Date(message.data.created_at).getTime()
    })
  }
}
```

### Validation in Transform

```javascript
import { PluginError } from 's3db.js';

consumers: [{
  resources: 'users',
  transform: (message) => {
    // Validate required fields
    if (!message.data.email || !message.data.name) {
      throw new PluginError('Missing email or name', {
        statusCode: 422,
        retriable: false,
        suggestion: 'Ensure producer populates both fields.',
        metadata: { messageId: message.metadata?.messageId }
      });
    }

    return {
      ...message.data,
      email: message.data.email.toLowerCase(),
      processed_at: new Date().toISOString()
    };
  }
}]
```

### Computed Fields

```javascript
consumers: [{
  resources: 'orders',
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
}]
```

### Filter Messages

```javascript
consumers: [{
  resources: 'events',
  transform: (message) => {
    // Skip processing by returning null
    if (message.data.skip) return null;
    if (message.data.type === 'test') return null;

    return message.data;
  }
}]
```

### Route to Different Resources

```javascript
consumers: [{
  resources: ['users', 'admins'],
  transform: (message) => {
    // Route based on content
    if (message.data.role === 'admin') {
      return { resource: 'admins', data: message.data };
    }
    return { resource: 'users', data: message.data };
  }
}]
```

---

## Event Handling

### Basic Event Monitoring

```javascript
queueConsumerPlugin.on('messageProcessed', (event) => {
  console.log('Processed:', event);
  // { operation: 'inserted', resource: 'users', recordId: 'user-1', duration: 145 }
});

queueConsumerPlugin.on('messageError', (error) => {
  console.error('Processing failed:', error);
});
```

### Custom Message Processor

```javascript
class MessageProcessor {
  constructor(queueConsumerPlugin) {
    this.plugin = queueConsumerPlugin;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.plugin.on('message_processed', (data) => {
      console.log(`✅ Processed: ${data.action} on ${data.resource} (${data.messageId})`);
    });

    this.plugin.on('message_error', (data) => {
      console.error(`❌ Failed: ${data.error} (${data.messageId})`);
      this.handleFailedMessage(data);
    });

    this.plugin.on('batch_completed', (data) => {
      console.log(`📦 Batch completed: ${data.processed}/${data.total} messages`);
    });
  }

  async handleFailedMessage(data) {
    if (data.retryCount >= 3) {
      await this.sendToDeadLetterQueue(data);
    } else {
      await this.scheduleRetry(data);
    }
  }

  async sendToDeadLetterQueue(data) {
    console.log(`📮 Sending to DLQ: ${data.messageId}`);
    // DLQ logic here
  }

  async scheduleRetry(data) {
    const delay = Math.pow(2, data.retryCount) * 1000;
    setTimeout(() => {
      console.log(`🔄 Retrying message: ${data.messageId}`);
    }, delay);
  }
}

const processor = new MessageProcessor(queueConsumerPlugin);
```

---

## Health Monitoring

### Queue Health Monitor

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
    setInterval(() => this.performHealthCheck(), 60000);
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

    // Alert on low success rate
    if (successRate < 95 && totalMessages > 10) {
      console.warn(`⚠️ Low success rate: ${successRate}%`);
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

const healthMonitor = new QueueHealthMonitor(queueConsumerPlugin);
```

### SQS Queue Depth Monitoring

```javascript
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

const monitorQueues = async () => {
  const sqs = new SQSClient({ region: 'us-east-1' });

  const response = await sqs.send(new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
  }));

  const messagesAvailable = parseInt(response.Attributes.ApproximateNumberOfMessages);
  const messagesInFlight = parseInt(response.Attributes.ApproximateNumberOfMessagesNotVisible);

  console.log(`Queue depth: ${messagesAvailable} available, ${messagesInFlight} in flight`);

  if (messagesAvailable > 1000) {
    console.warn('⚠️ High queue depth - consider scaling consumers');
  }
};

setInterval(monitorQueues, 5 * 60 * 1000);
```

---

## Graceful Shutdown

```javascript
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

      // Wait for current messages to finish
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
      console.log('⏳ Waiting for processing to complete...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

const gracefulShutdown = new GracefulShutdown(queueConsumerPlugin);
```

---

## Message Deduplication

```javascript
const processedMessages = new Set();

consumers: [{
  resources: 'orders',
  transform: (message) => {
    const messageKey = `${message.resource}:${message.action}:${message.data.id}`;

    if (processedMessages.has(messageKey)) {
      console.log(`Skipping duplicate: ${messageKey}`);
      return null;
    }

    processedMessages.add(messageKey);

    // Clean up old entries periodically
    if (processedMessages.size > 10000) {
      processedMessages.clear();
    }

    return message.data;
  }
}]
```

---

## Priority Queues

```javascript
new QueueConsumerPlugin({
  drivers: [{
    driver: 'sqs',
    region: 'us-east-1',
    queues: [
      // High priority
      { resources: 'urgent_tasks', queueUrl: '...high-priority' },
      // Normal priority
      { resources: 'normal_tasks', queueUrl: '...normal' },
      // Low priority
      { resources: 'batch_tasks', queueUrl: '...low-priority' }
    ]
  }]
})
```

---

## Integration with Other Plugins

### With MetricsPlugin

```javascript
await db.usePlugin(new MetricsPlugin({ enabled: true }));
await db.usePlugin(new QueueConsumerPlugin({...}));
// Queue operations automatically tracked in metrics
```

### With AuditPlugin

```javascript
await db.usePlugin(new AuditPlugin({ resources: ['users', 'orders'] }));
await db.usePlugin(new QueueConsumerPlugin({...}));
// All queue-processed changes logged to audit trail
```

### With ReplicatorPlugin

```javascript
// Forward processed messages to another system
await db.usePlugin(new ReplicatorPlugin({
  driver: 'webhook',
  config: { url: 'https://api.example.com/events' }
}));
await db.usePlugin(new QueueConsumerPlugin({...}));
```

---

## See Also

- [Configuration](./configuration.md) - All options, driver configs, API reference
- [Best Practices](./best-practices.md) - Performance, error handling, troubleshooting, FAQ
