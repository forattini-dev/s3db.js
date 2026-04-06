# Queue Consumer Plugin

> **Bridge external queues (SQS, RabbitMQ, Redis, BullMQ) into S3DB operations or custom handlers.**

---

## TLDR

**Consumes messages from external queues. Route them to S3DB resources (insert/update/delete) or handle with custom logic.**

**2 lines to get started:**
```javascript
const consumer = new QueueConsumerPlugin({ drivers: [{ driver: 'sqs', queueUrl: '...', queues: [{ resources: 'users' }] }] });
await db.usePlugin(consumer);
```

**Key features:**
- 6 Drivers (SQS, RabbitMQ, Redis List, Redis Stream, Redis PubSub, BullMQ)
- Auto-processing: message → insert/update/delete on resources
- Custom `onMessage` handlers (no resource required)
- Concurrent startup + graceful shutdown
- Publish back to any queue

**Use cases:**
- Event-driven architectures
- Microservices communication
- Real-time data sync
- Custom event listeners without S3DB resources

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

// Route SQS messages to a resource (insert/update/delete)
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

// Messages are automatically processed!
// { "resource": "users", "action": "insert", "data": { "name": "Alice" } }
// → users.insert({ name: "Alice" })
```

### Custom Handler (no resource required)

```javascript
const consumer = new QueueConsumerPlugin({
  drivers: [{
    driver: 'sqs',
    queueUrl: 'https://sqs.../events',
    region: 'us-east-1',
    queues: [{
      name: 'event-listener',
      onMessage: async (msg, context) => {
        console.log('Event received:', msg.$body);
        console.log('Driver:', context.driver, 'Queue:', context.queueName);
      }
    }]
  }]
});
```

---

## Dependencies

**Peer Dependencies:** (install only what you need)

```bash
pnpm add @aws-sdk/client-sqs   # SQS
pnpm add amqplib                # RabbitMQ
pnpm add ioredis                # Redis List / Stream / PubSub
pnpm add bullmq                 # BullMQ
```

| Driver | Package | Version |
|--------|---------|---------|
| `sqs` | `@aws-sdk/client-sqs` | `^3.0.0` |
| `rabbitmq` | `amqplib` | `^0.10.0` |
| `redis-list` | `ioredis` | `^5.4.1` |
| `redis-stream` | `ioredis` | `^5.4.1` |
| `redis-pubsub` | `ioredis` | `^5.4.1` |
| `bullmq` | `bullmq` | `>=5.0.0` |

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
| **sqs** | AWS Simple Queue Service | Long polling, visibility timeout, FIFO support |
| **rabbitmq** | AMQP message broker | Exchanges, routing keys, prefetch |
| **redis-list** | Redis List (LPUSH/BRPOP) | FIFO/LIFO, blocking pop |
| **redis-stream** | Redis Streams + Consumer Groups | XREADGROUP, auto-claim stalled |
| **redis-pubsub** | Redis Pub/Sub | Channels, pattern subscriptions |
| **bullmq** | BullMQ (Redis-backed) | Job scheduling, rate limiting, concurrency |

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `drivers` | array | `[]` | Driver configurations (new API) |
| `consumers` | array | `[]` | Legacy format (auto-normalized, deprecated) |
| `startConcurrency` | number | `5` | Concurrent driver startup |
| `stopConcurrency` | number | same as start | Concurrent driver shutdown |
| `logLevel` | string | `'info'` | Log level |

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
// Stop all consumers
await plugin.stop();

// Publish to a named consumer
await plugin.publish('sqs:https://sqs.../queue', { resource: 'users', action: 'insert', data: {...} });

// Get a publisher instance
const publisher = plugin.getPublisher('sqs:https://sqs.../queue');

// List all registered publishers
plugin.listPublishers(); // ['sqs:https://sqs.../queue', 'bullmq:jobs']
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
  drivers: [{
    driver: 'sqs',
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/.../my-queue',
    region: 'us-east-1',
    queues: [{ resources: 'users' }]
  }]
})
```

### RabbitMQ Consumer

```javascript
new QueueConsumerPlugin({
  drivers: [{
    driver: 'rabbitmq',
    amqpUrl: 'amqp://user:pass@localhost:5672',
    queue: 'order-queue',
    prefetch: 10,
    queues: [{
      resources: 'orders'
    }]
  }]
})
```

### Redis Stream Consumer

```javascript
new QueueConsumerPlugin({
  drivers: [{
    driver: 'redis-stream',
    host: 'localhost',
    port: 6379,
    stream: 'events',
    group: 'my-group',
    consumer: 'worker-1',
    queues: [{ resources: 'events' }]
  }]
})
```

### BullMQ Consumer

```javascript
new QueueConsumerPlugin({
  drivers: [{
    driver: 'bullmq',
    connection: { host: 'localhost', port: 6379 },
    queue: 'email-jobs',
    concurrency: 5,
    queues: [{ resources: 'emails' }]
  }]
})
```

### Custom Handler (no resource)

```javascript
new QueueConsumerPlugin({
  drivers: [{
    driver: 'sqs',
    queueUrl: 'https://sqs.../events',
    region: 'us-east-1',
    queues: [{
      name: 'webhook-listener',
      onMessage: async (msg, ctx) => {
        await fetch('https://api.example.com/webhook', {
          method: 'POST',
          body: JSON.stringify(msg.$body)
        });
      }
    }]
  }]
})
```

---

## See Also

- [Replicator Plugin](../replicator/README.md) - Send messages to queues
- [Metrics Plugin](../metrics/README.md) - Monitor processing performance
- [Audit Plugin](../audit/README.md) - Track queue message processing
