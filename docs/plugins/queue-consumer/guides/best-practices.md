# Best Practices & FAQ

> **In this guide:** Performance optimization, error handling, troubleshooting, and comprehensive FAQ.

**Navigation:** [← Back to Queue Consumer Plugin](../README.md) | [Configuration](./configuration.md)

---

## Performance Optimization

### Batch Size Tuning

| Scenario | batchSize | concurrency | Notes |
|----------|-----------|-------------|-------|
| Small, simple messages | `50` | `20` | High throughput |
| Large or complex messages | `10` | `5` | Memory-safe |
| High-throughput | `100` | `50` | Maximum performance |

```javascript
// High-throughput scenarios
batchSize: 100, concurrency: 50

// Memory-constrained
batchSize: 10, concurrency: 5

// Balanced (default)
batchSize: 10, concurrency: 5
```

### Latency Optimization

```javascript
// SQS: Reduce polling interval
config: {
  pollingInterval: 100,    // Poll every 100ms
  waitTimeSeconds: 20      // Long poll for 20 seconds
}

// RabbitMQ: Increase prefetch
config: {
  prefetch: 50            // Prefetch more messages
}
```

### Performance Benchmarks

| Configuration | Throughput |
|---------------|------------|
| concurrency=5, batchSize=10 | ~500 msg/sec |
| concurrency=20, batchSize=50 | ~2000 msg/sec |
| concurrency=50, batchSize=100 | ~5000 msg/sec |

### Optimization Checklist

1. **Increase concurrency** for I/O-bound operations
2. **Increase batchSize** for lightweight messages
3. **Keep transforms lightweight** - avoid blocking operations
4. **Use long polling** for SQS (waitTimeSeconds: 20)
5. **Increase prefetch** for RabbitMQ

---

## Error Handling

### Comprehensive Error Handler

```javascript
import { PluginError } from 's3db.js';

consumers: [{
  resources: ['users'],
  transform: (message) => {
    try {
      // Validate message structure
      if (!message.data || !message.action) {
        throw new PluginError('Missing data/action', {
          statusCode: 400,
          retriable: false,
          suggestion: 'Ensure producer publishes both fields.',
          metadata: { messageId: message.id }
        });
      }

      // Validate required fields
      if (message.action === 'inserted' && !message.data.email) {
        throw new PluginError('Email is required', {
          statusCode: 422,
          retriable: false,
          suggestion: 'Populate data.email before enqueueing.',
          metadata: { messageId: message.id }
        });
      }

      return {
        ...message.data,
        processed_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Transform error:', {
        messageId: message.id,
        error: error.message,
        originalMessage: message
      });
      throw error;
    }
  }
}]
```

### Error Event Tracking

```javascript
const errors = [];

plugin.on('message_error', (data) => {
  errors.push({
    messageId: data.messageId,
    error: data.error,
    retryCount: data.retryCount,
    timestamp: new Date().toISOString()
  });

  // Alert on high error rate
  if (errors.length > 100) {
    console.error('🚨 High error rate detected');
    // Send alert
  }
});
```

---

## Troubleshooting

### Messages Not Being Processed

**Causes:**
1. Queue URL/credentials incorrect
2. Plugin not started
3. Message format invalid
4. Resource doesn't exist

**Solutions:**
```javascript
// 1. Verify credentials and URL
console.log('Queue URL:', config.queueUrl);

// 2. Ensure plugin is started
await plugin.start();

// 3. Check message format
// Expected: { resource, action, data }

// 4. Verify resource exists
const resource = db.resources.users;
```

### High Message Processing Latency

**Causes:**
1. Low concurrency
2. Complex transforms
3. Small batch size

**Solutions:**
```javascript
// Increase concurrency
concurrency: 20

// Simplify transforms
transform: (msg) => ({ ...msg.data, ts: Date.now() })  // Fast

// Increase batch size
batchSize: 50
```

### Messages Processed Multiple Times

**Causes:**
1. Deduplication not implemented
2. `deleteAfterProcessing: false`
3. Visibility timeout too short

**Solutions:**
```javascript
// Enable auto-delete
deleteAfterProcessing: true

// Increase visibility timeout
visibilityTimeout: 300

// Implement deduplication
const processed = new Set();
transform: (msg) => {
  if (processed.has(msg.id)) return null;
  processed.add(msg.id);
  return msg.data;
}
```

### High Memory Usage

**Causes:**
1. Large batch size
2. High concurrency
3. Memory leaks in transforms

**Solutions:**
```javascript
// Reduce batch size
batchSize: 10

// Reduce concurrency
concurrency: 5

// Clear caches periodically
if (cache.size > 10000) cache.clear();
```

### Connection Issues

**SQS "Access Denied":**
- Verify IAM permissions include SQS actions

**RabbitMQ "Connection refused":**
- Check RabbitMQ server is running
- Verify `amqpUrl` is correct

---

## FAQ

### General

**Q: What does QueueConsumerPlugin do?**

A: Consumes messages from external queues (SQS, RabbitMQ) and executes operations on S3DB automatically (insert, update, delete).

**Q: Which drivers are available?**

A: `sqs` (AWS SQS) and `rabbitmq` (RabbitMQ/AMQP).

**Q: What is the message format?**

A:
```json
{
  "resource": "users",
  "action": "inserted",
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

**Q: Can I run multiple QueueConsumerPlugin instances?**

A: Yes, use `namespace` parameter:
```javascript
await db.usePlugin(new QueueConsumerPlugin({...}), { namespace: 'queue1' });
await db.usePlugin(new QueueConsumerPlugin({...}), { namespace: 'queue2' });
```

---

### Configuration

**Q: What are the minimum required parameters?**

A:
```javascript
new QueueConsumerPlugin({
  consumers: [{
    driver: 'sqs',
    config: { queueUrl: '...' },
    consumers: [{ resources: 'users' }]
  }]
})
```

**Q: How to configure retry logic?**

A:
```javascript
retryAttempts: 5,
retryDelay: 2000  // 2 seconds between retries
```

**Q: How to configure dead letter queue?**

A:
```javascript
deadLetterQueue: 'https://sqs.../my-dlq'
```

---

### Operations

**Q: Which actions are supported?**

A: `inserted`, `updated`, `deleted`, `upserted`, `patched`, `replaced`.

**Q: How to transform messages before processing?**

A:
```javascript
transform: (message) => ({
  ...message.data,
  processed_at: new Date().toISOString()
})
```

**Q: How to filter/skip messages?**

A: Return `null` from transform:
```javascript
transform: (message) => {
  if (message.data.skip) return null;
  return message.data;
}
```

**Q: How to handle partial failures in batch processing?**

A: The plugin processes messages individually - failures don't block other messages.

---

### SQS-Specific

**Q: How to configure SQS credentials?**

A:
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

**Q: How to use FIFO queues?**

A: FIFO queues work automatically - just provide the FIFO queue URL ending in `.fifo`.

**Q: What IAM permissions are needed?**

A: `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`, `sqs:ChangeMessageVisibility`

---

### RabbitMQ-Specific

**Q: How to configure exchanges?**

A:
```javascript
config: {
  amqpUrl: 'amqp://...',
  exchange: 'my-exchange',
  exchangeType: 'topic'  // direct, topic, fanout, headers
}
```

**Q: How to use routing keys?**

A:
```javascript
consumers: [{
  resources: 'orders',
  queue: 'order-queue',
  routingKey: 'order.*'
}]
```

**Q: How to handle connection drops?**

A:
```javascript
config: {
  reconnectInterval: 2000,
  heartbeat: 60
}
```

---

### Performance

**Q: How to increase throughput?**

A: Increase `concurrency` and `batchSize`:
```javascript
batchSize: 100, concurrency: 50
```

**Q: What's the overhead per message?**

A: ~1-5ms for parsing and routing. Network latency dominates.

**Q: How many messages can be processed per second?**

A: With concurrency=50, batchSize=100: ~1000-5000 msg/sec depending on complexity.

**Q: Does queue consumption block database operations?**

A: No. Queue consumption runs asynchronously in parallel.

---

### Monitoring & Events

**Q: What events are available?**

A:
- `message_received` - Message received
- `message_processed` - Successfully processed
- `message_error` - Processing failed
- `batch_started` / `batch_completed` - Batch lifecycle
- `consumer_connected` / `consumer_disconnected` - Connection status

**Q: How to track processing duration?**

A:
```javascript
plugin.on('message_processed', (data) => {
  console.log(`Processed in ${data.duration}ms`);
});
```

---

### Advanced

**Q: Can I create custom drivers?**

A: Yes, extend the base driver class and implement required methods.

**Q: How to implement exponential backoff?**

A:
```javascript
plugin.on('message_error', async (data) => {
  const delay = Math.pow(2, data.retryCount) * 1000;
  await new Promise(r => setTimeout(r, delay));
  // Retry logic
});
```

**Q: Can I pause/resume queue consumption?**

A: Yes:
```javascript
await plugin.stop();   // Pause
await plugin.start();  // Resume
```

**Q: What's the message processing pipeline?**

A:
1. Poll queue for messages
2. Parse message JSON
3. Validate message format
4. Run transform function
5. Execute database operation
6. Acknowledge message
7. Emit events

**Q: What's the difference between batchSize and concurrency?**

A:
- `batchSize`: Max messages fetched per poll
- `concurrency`: Max messages processed simultaneously

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Multi-queue, transformations, monitoring
- [Replicator Plugin](../../replicator/README.md) - Send messages to queues
- [Metrics Plugin](../../metrics/README.md) - Monitor processing performance
