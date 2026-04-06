# Configuration

> **In this guide:** All configuration options, driver configurations, message format, consumer setup, and API reference.

**Navigation:** [← Back to Queue Consumer Plugin](../README.md)

---

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `drivers` | array | `[]` | Driver configurations (new API) |
| `consumers` | array | `[]` | Legacy format (deprecated, auto-normalized to `drivers`) |
| `startConcurrency` | number | `5` | Concurrent driver startup |
| `stopConcurrency` | number | same as start | Concurrent driver shutdown |
| `logLevel` | string | `'info'` | Logging level (debug/info/warn/error/silent) |

---

## Supported Drivers

| Driver | Package | Version | Install Command |
|--------|---------|---------|-----------------|
| `sqs` | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| `rabbitmq` | `amqplib` | `^0.10.0` | `pnpm add amqplib` |
| `redis-list` | `ioredis` | `^5.4.1` | `pnpm add ioredis` |
| `redis-stream` | `ioredis` | `^5.4.1` | `pnpm add ioredis` |
| `redis-pubsub` | `ioredis` | `^5.4.1` | `pnpm add ioredis` |
| `bullmq` | `bullmq` | `>=5.0.0` | `pnpm add bullmq` |

---

## SQS Driver Configuration

```javascript
{
  driver: 'sqs',
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  poolingInterval: 1000,      // Polling frequency (ms)
  maxMessages: 10,            // Max messages per poll
  queues: [
    {
      resources: ['users', 'products'],
      queueUrl: 'specific-queue-url'  // Override default queue
    }
  ]
}
```

### SQS Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queueUrl` | string | Required | SQS queue URL |
| `region` | string | `'us-east-1'` | AWS region |
| `credentials` | object | — | AWS credentials |
| `pollingInterval` | number | `1000` | Polling frequency (ms) |
| `maxMessages` | number | `10` | Max messages per poll |
| `visibilityTimeout` | number | `30` | Visibility timeout (seconds) |
| `waitTimeSeconds` | number | `20` | Long polling duration |
| `deleteAfterProcessing` | boolean | `true` | Auto-delete processed messages |

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility"
    ],
    "Resource": "arn:aws:sqs:us-east-1:123456789012:my-queue"
  }]
}
```

---

## RabbitMQ Driver Configuration

```javascript
{
  driver: 'rabbitmq',
  amqpUrl: 'amqp://user:pass@localhost:5672',
  queue: 'orders-queue',
  prefetch: 10,
  reconnectInterval: 2000,
  queues: [
    {
      resources: ['orders']
    }
  ]
}
```

### RabbitMQ Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `amqpUrl` | string | Required | AMQP connection URL |
| `exchange` | string | `''` | Exchange name |
| `exchangeType` | string | `'direct'` | Exchange type (direct/topic/fanout/headers) |
| `prefetch` | number | `10` | Message prefetch count |
| `reconnectInterval` | number | `2000` | Reconnection interval (ms) |
| `heartbeat` | number | `60` | Heartbeat interval (seconds) |
| `durable` | boolean | `true` | Durable queues and connections |

---

## Message Format

Expected message structure:

```javascript
{
  resource: 'users',           // Target resource name
  action: 'inserted',          // Operation: inserted, updated, deleted, upserted, patched, replaced
  data: {                      // Data payload
    name: 'John Doe',
    email: 'john@example.com'
  },
  id: 'user-123',              // Optional: Record ID for updates/deletes
  metadata: {                  // Optional: Additional metadata
    source: 'external-system',
    timestamp: '2024-01-15T10:30:00.000Z'
  }
}
```

### Supported Actions

| Action | Description |
|--------|-------------|
| `inserted` | Create new record |
| `updated` | Update existing record (merge) |
| `deleted` | Delete record by ID |
| `upserted` | Create or update record |
| `patched` | Partial update (HEAD+COPY) |
| `replaced` | Full replace (PUT only) |

---

## Configuration Interfaces

```typescript
interface DriverDefinition {
  driver: string;                  // 'sqs' | 'rabbitmq' | 'redis-list' | 'redis-stream' | 'redis-pubsub' | 'bullmq'
  queues?: QueueDefinition[];      // Queue definitions
  [key: string]: unknown;          // Driver-specific config (flattened at top level)
}

interface QueueDefinition {
  name?: string;                   // Explicit name (used for publish/getPublisher)
  resources?: string | string[];   // Target resource(s) for CRUD routing
  onMessage?: (msg, ctx) => Promise<unknown>;  // Custom handler (no resource needed)
  [key: string]: unknown;          // Queue-specific overrides
}

interface QueueMessageContext {
  driver: string;                  // Driver name
  queueName: string;               // Resolved queue name
  raw: unknown;                    // Raw message from driver
}
```

When `onMessage` is set on a queue, it bypasses the resource+action CRUD flow entirely.
When `resources` is set without `onMessage`, the default handler expects messages with `{ resource, action, data }`.

---

## Event System

The plugin emits various events for monitoring and debugging:

```javascript
// Message lifecycle events
plugin.on('message_received', (data) => {
  console.log(`Received message: ${data.messageId}`);
});

plugin.on('message_processed', (data) => {
  console.log(`Processed: ${data.action} on ${data.resource}`);
  console.log(`Duration: ${data.duration}ms`);
});

plugin.on('message_error', (data) => {
  console.error(`Error: ${data.error}`);
  console.log(`Retry count: ${data.retryCount}`);
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

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `message_received` | `{ messageId }` | Message received from queue |
| `message_processed` | `{ action, resource, recordId, duration }` | Message successfully processed |
| `message_error` | `{ error, message, retryCount }` | Message processing failed |
| `batch_started` | `{ size }` | Batch processing started |
| `batch_completed` | `{ processed, total }` | Batch processing completed |
| `consumer_connected` | `{ driver, queue }` | Connected to queue |
| `consumer_disconnected` | `{ driver, queue }` | Disconnected from queue |

---

## API Reference

### Constructor

```javascript
new QueueConsumerPlugin({
  drivers?: DriverDefinition[],     // New API
  consumers?: LegacyFormat[],       // Deprecated, auto-normalized
  startConcurrency?: number,
  stopConcurrency?: number,
  logLevel?: string
})
```

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `stop()` | Stop all consumers | `Promise<void>` |
| `publish(target, data, options?)` | Publish to a named consumer | `Promise<unknown>` |
| `getPublisher(target)` | Get a consumer instance by name | `Consumer \| undefined` |
| `listPublishers()` | List all registered consumer names | `string[]` |

### stop()

```javascript
await plugin.stop();
// All consumers stopped. Current messages will finish processing.
```

### publish()

```javascript
await plugin.publish('sqs:https://sqs.../queue', {
  resource: 'users',
  action: 'insert',
  data: { name: 'Alice' }
});
```

### getPublisher() / listPublishers()

```javascript
const publishers = plugin.listPublishers();
// ['sqs:https://sqs.../queue', 'bullmq:email-jobs']

const sqsPublisher = plugin.getPublisher('sqs:https://sqs.../queue');
await sqsPublisher.publish({ ... });
```

---

## Environment-Based Configuration

```javascript
const getQueueConfig = () => {
  const env = process.env.NODE_ENV;

  const baseConfig = {
    retryAttempts: 3,
    retryDelay: 1000
  };

  if (env === 'production') {
    return {
      ...baseConfig,
      drivers: [{
        driver: 'sqs',
        queueUrl: process.env.PROD_SQS_QUEUE_URL,
        region: process.env.AWS_REGION,
        queues: [{ resources: ['users', 'orders'] }]
      }]
    };
  }

  if (env === 'staging') {
    return {
      ...baseConfig,
      drivers: [{
        driver: 'sqs',
        queueUrl: process.env.STAGING_SQS_QUEUE_URL,
        region: process.env.AWS_REGION,
        queues: [{ resources: ['users'] }]
      }]
    };
  }

  // Development - disabled
  return { ...baseConfig, enabled: false };
};
```

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Multi-queue processing, transformations, health monitoring
- [Best Practices](./best-practices.md) - Performance, error handling, troubleshooting, FAQ
