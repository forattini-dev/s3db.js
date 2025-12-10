# Configuration

> **In this guide:** All configuration options, driver configurations, message format, consumer setup, and API reference.

**Navigation:** [← Back to Queue Consumer Plugin](../README.md)

---

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable queue consumption |
| `consumers` | array | `[]` | Array of consumer configurations |
| `batchSize` | number | `10` | Messages to process per batch |
| `concurrency` | number | `5` | Concurrent message processing |
| `retryAttempts` | number | `3` | Retry failed message processing |
| `retryDelay` | number | `1000` | Delay between retries (ms) |
| `deadLetterQueue` | string | `null` | DLQ for failed messages |
| `logLevel` | string | `'info'` | Logging level (debug/info/warn/error) |

---

## Supported Drivers

| Driver | Package | Version | Install Command |
|--------|---------|---------|-----------------|
| `sqs` | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| `rabbitmq` | `amqplib` | `^0.10.0` | `pnpm add amqplib` |

---

## SQS Driver Configuration

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
      concurrency: 10,
      transform: (message) => ({
        ...message,
        processed_at: new Date().toISOString()
      })
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
      transform: (message) => ({
        ...message.content,
        routing_key: message.fields.routingKey,
        received_at: new Date().toISOString()
      })
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

## Consumer Configuration

```javascript
interface ConsumerConfig {
  driver: 'sqs' | 'rabbitmq' | string;
  config: DriverConfig;
  consumers: ResourceConsumer[];
}

interface ResourceConsumer {
  resources: string | string[];   // Target resource(s)
  queue?: string;                 // RabbitMQ queue name
  queueUrl?: string;              // SQS queue URL override
  routingKey?: string;            // RabbitMQ routing key
  concurrency?: number;           // Per-consumer concurrency
  transform?: (message: any) => any;  // Message transformation
}
```

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
  enabled?: boolean,
  consumers: ConsumerConfig[],
  batchSize?: number,
  concurrency?: number,
  retryAttempts?: number,
  retryDelay?: number,
  deadLetterQueue?: string,
  logLevel?: string
})
```

### Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `start()` | Start consuming messages | `Promise<void>` |
| `stop()` | Stop consuming messages | `Promise<void>` |
| `isProcessing()` | Check if currently processing | `boolean` |
| `getStats()` | Get processing statistics | `ProcessingStats` |

### start()

```javascript
await queueConsumerPlugin.start();
// Queue consumer started! Listening for messages...
```

### stop()

```javascript
await queueConsumerPlugin.stop();
// Queue consumer stopped. Current messages will finish processing.
```

### getStats()

```javascript
const stats = queueConsumerPlugin.getStats();
// {
//   processed: 10000,
//   failed: 50,
//   retries: 120,
//   uptime: 3600000,
//   messagesPerSecond: 2.78
// }
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
      batchSize: 50,
      concurrency: 20,
      consumers: [{
        driver: 'sqs',
        config: {
          queueUrl: process.env.PROD_SQS_QUEUE_URL,
          region: process.env.AWS_REGION,
          visibilityTimeout: 300
        },
        consumers: [{ resources: ['users', 'orders'] }]
      }]
    };
  }

  if (env === 'staging') {
    return {
      ...baseConfig,
      batchSize: 20,
      concurrency: 5,
      consumers: [{
        driver: 'sqs',
        config: {
          queueUrl: process.env.STAGING_SQS_QUEUE_URL,
          region: process.env.AWS_REGION
        },
        consumers: [{ resources: ['users'] }]
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
