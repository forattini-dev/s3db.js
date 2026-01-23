# Queue Consumer Plugin

> **Bridge SQS and RabbitMQ messages into S3DB insert/update/delete operations.**

---

## TLDR

**Consumes messages from SQS/RabbitMQ and automatically processes them as insert/update/delete operations on your S3DB resources.**

**2 lines to get started:**
```javascript
const consumer = new QueueConsumerPlugin({ consumers: [{ driver: 'sqs', config: { queueUrl: '...' }, consumers: [{ resources: 'users' }] }] });
await db.usePlugin(consumer); await consumer.start();
```

**Key features:**
- 2 Drivers (SQS, RabbitMQ)
- Auto-processing: message → insert/update/delete
- Concurrent processing + batching
- Retry logic + dead letter queue
- Custom message transformations

**Use cases:**
- Event-driven architectures
- Microservices communication
- Real-time data sync
- Webhook processing

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { QueueConsumerPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

const queueConsumerPlugin = new QueueConsumerPlugin({
  consumers: [{
    driver: 'sqs',
    config: {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
      region: 'us-east-1'
    },
    consumers: [{
      resources: 'users',
      concurrency: 5
    }]
  }]
});

await db.usePlugin(queueConsumerPlugin);
await queueConsumerPlugin.start();

// Messages are automatically processed!
// { "resource": "users", "action": "inserted", "data": { "name": "Alice" } }
// → users.insert({ name: "Alice" })
```

---

## Dependencies

**Peer Dependencies:** (install only what you need)

```bash
# For AWS SQS
pnpm add @aws-sdk/client-sqs

# For RabbitMQ
pnpm add amqplib
```

| Driver | Package | Version | Required |
|--------|---------|---------|----------|
| SQS | `@aws-sdk/client-sqs` | `^3.0.0` | Optional |
| RabbitMQ | `amqplib` | `^0.10.0` | Optional |

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, driver configs, message format, events, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Multi-queue processing, transformations, health monitoring, graceful shutdown |
| [Best Practices](./guides/best-practices.md) | Performance, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Supported Drivers

| Driver | Description | Features |
|--------|-------------|----------|
| **SQS** | AWS Simple Queue Service | Long polling, visibility timeout, FIFO support |
| **RabbitMQ** | AMQP message broker | Exchanges, routing keys, prefetch |

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable consumption |
| `consumers` | array | Required | Consumer configurations |
| `batchSize` | number | `10` | Messages per batch |
| `concurrency` | number | `5` | Concurrent processing |
| `retryAttempts` | number | `3` | Retry failed messages |
| `retryDelay` | number | `1000` | Delay between retries (ms) |
| `deadLetterQueue` | string | `null` | DLQ for failed messages |

### Message Format

```javascript
{
  resource: 'users',           // Target resource
  action: 'inserted',          // inserted, updated, deleted, upserted, patched, replaced
  data: { name: 'John' },      // Payload
  id: 'user-123'               // Optional: for updates/deletes
}
```

### Plugin Methods

```javascript
// Start consuming
await plugin.start();

// Stop consuming
await plugin.stop();

// Check status
plugin.isProcessing();

// Get statistics
plugin.getStats();
// { processed: 10000, failed: 50, retries: 120, uptime: 3600000 }
```

### Events

```javascript
plugin.on('message_processed', (data) => {
  console.log(`Processed: ${data.action} on ${data.resource} in ${data.duration}ms`);
});

plugin.on('message_error', (data) => {
  console.error(`Error: ${data.error}, Retry: ${data.retryCount}`);
});

plugin.on('batch_completed', (data) => {
  console.log(`Batch: ${data.processed}/${data.total}`);
});
```

---

## How It Works

1. **Queue Monitoring**: Continuously polls configured queues for new messages
2. **Message Processing**: Parses incoming messages and extracts operation data
3. **Resource Operations**: Automatically performs database operations based on message content
4. **Error Handling**: Implements retries, dead letter queues, and comprehensive error reporting
5. **Concurrent Processing**: Handles multiple messages simultaneously for high throughput

---

## Configuration Examples

### SQS Consumer

```javascript
new QueueConsumerPlugin({
  consumers: [{
    driver: 'sqs',
    config: {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/.../my-queue',
      region: 'us-east-1',
      visibilityTimeout: 300,
      waitTimeSeconds: 20
    },
    consumers: [{ resources: 'users', concurrency: 10 }]
  }]
})
```

### RabbitMQ Consumer

```javascript
new QueueConsumerPlugin({
  consumers: [{
    driver: 'rabbitmq',
    config: {
      amqpUrl: 'amqp://user:pass@localhost:5672',
      exchange: 'events',
      exchangeType: 'topic',
      prefetch: 10
    },
    consumers: [{
      resources: 'orders',
      queue: 'order-queue',
      routingKey: 'order.*'
    }]
  }]
})
```

### Message Transform

```javascript
new QueueConsumerPlugin({
  consumers: [{
    driver: 'sqs',
    config: { queueUrl: '...' },
    consumers: [{
      resources: 'users',
      transform: (message) => ({
        ...message.data,
        email: message.data.email.toLowerCase(),
        processed_at: new Date().toISOString()
      })
    }]
  }]
})
```

---

## See Also

- [Replicator Plugin](../replicator/README.md) - Send messages to queues
- [Metrics Plugin](../metrics/README.md) - Monitor processing performance
- [Audit Plugin](../audit/README.md) - Track queue message processing
