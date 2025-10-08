# S3Queue Plugin

**Distributed queue processing with zero race conditions**

The S3Queue Plugin provides a distributed queue processing system using S3 as the backend, with ETag-based atomicity and distributed locking to guarantee exactly-once message processing across multiple concurrent workers.

## Features

- ✅ **Zero Race Conditions** - ETag-based atomicity + distributed locking = 0% duplication
- 🔒 **Atomic Message Claiming** - S3 ETags ensure only one worker claims each message
- 🔄 **Distributed Locking** - Resource-based locks prevent cache race conditions
- ⏱️ **Visibility Timeout** - Messages become invisible during processing (like AWS SQS)
- 🔁 **Automatic Retries** - Exponential backoff with configurable max attempts
- ☠️ **Dead Letter Queue** - Failed messages after max attempts moved to separate resource
- 👥 **Concurrent Workers** - Configurable concurrency across multiple containers
- 📊 **Queue Statistics** - Real-time stats on pending, processing, completed, and failed messages
- 🎯 **At-Least-Once Delivery** - Messages guaranteed to be processed at least once
- 🎪 **Event Emission** - Track enqueued, completed, retry, and dead letter events

## Installation

The S3Queue Plugin is built-in to S3DB:

```javascript
import { Database, S3QueuePlugin } from 's3db';
```

## Quick Start

```javascript
import { Database, S3QueuePlugin } from 's3db';

const db = new Database({
  connection: 's3://KEY:SECRET@localhost:9000/my-bucket'
});

await db.connect();

// Create resource
const emails = await db.createResource({
  name: 'emails',
  attributes: {
    id: 'string|required',
    to: 'string|required',
    subject: 'string|required',
    body: 'string'
  }
});

// Setup S3QueuePlugin
const queuePlugin = new S3QueuePlugin({
  resource: 'emails',
  visibilityTimeout: 30000,  // 30 seconds
  pollInterval: 1000,         // 1 second
  maxAttempts: 3,             // Retry up to 3 times
  concurrency: 5,             // 5 concurrent workers
  deadLetterResource: 'failed_emails',
  autoStart: true,            // Auto-start workers
  verbose: true,              // Enable logging

  // Message handler
  onMessage: async (email, context) => {
    console.log(`Processing email ${email.id} (attempt ${context.attempts})`);
    await sendEmail(email);
    return { sent: true };
  },

  // Error handler
  onError: (error, email) => {
    console.error(`Error processing email ${email.id}:`, error.message);
  },

  // Completion handler
  onComplete: (email, result) => {
    console.log(`Completed email ${email.id}:`, result);
  }
});

db.use(queuePlugin);

// Enqueue messages
await emails.enqueue({
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Welcome to our service'
});

// Get queue stats
const stats = await emails.queueStats();
console.log(stats);
// { total: 10, pending: 5, processing: 2, completed: 3, failed: 0, dead: 0 }
```

## Configuration

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resource` | `string` | **required** | Target resource name |
| `visibilityTimeout` | `number` | `30000` | Time (ms) message is invisible during processing |
| `pollInterval` | `number` | `1000` | Polling interval (ms) for checking new messages |
| `maxAttempts` | `number` | `3` | Maximum retry attempts before moving to dead letter |
| `concurrency` | `number` | `3` | Number of concurrent workers |
| `deadLetterResource` | `string` | `null` | Resource name for failed messages (optional) |
| `autoStart` | `boolean` | `false` | Auto-start workers on setup |
| `verbose` | `boolean` | `false` | Enable verbose logging |
| `onMessage` | `function` | `null` | Message handler function |
| `onError` | `function` | `null` | Error handler function |
| `onComplete` | `function` | `null` | Completion handler function |

### Handler Functions

#### onMessage(record, context)

Called for each message to be processed.

**Parameters:**
- `record` - The original resource record
- `context` - Processing context:
  - `workerId` - Unique worker identifier
  - `attempts` - Current attempt number
  - `maxAttempts` - Maximum attempts allowed
  - `queueId` - Queue entry ID

**Returns:** Any value (stored in queue entry as `result`)

```javascript
onMessage: async (record, context) => {
  console.log(`Worker ${context.workerId} processing attempt ${context.attempts}`);

  // Your processing logic
  const result = await processRecord(record);

  return result; // Stored in queue entry
}
```

#### onError(error, record)

Called when message processing fails.

```javascript
onError: (error, record) => {
  console.error(`Failed to process ${record.id}:`, error.message);
  // Send alert, log to external service, etc.
}
```

#### onComplete(record, result)

Called when message processing succeeds.

```javascript
onComplete: (record, result) => {
  console.log(`Successfully processed ${record.id}:`, result);
  // Update metrics, send notification, etc.
}
```

## API Methods

### Resource Methods

The plugin adds the following methods to your target resource:

#### enqueue(data)

Enqueue a new message for processing.

```javascript
const message = await emails.enqueue({
  to: 'user@example.com',
  subject: 'Test',
  body: 'Hello World'
});

console.log(message.id); // Original record ID
```

#### queueStats()

Get queue statistics.

```javascript
const stats = await emails.queueStats();
// {
//   total: 100,
//   pending: 10,
//   processing: 5,
//   completed: 80,
//   failed: 3,
//   dead: 2
// }
```

#### startProcessing(handler, options)

Start processing messages with a custom handler.

```javascript
await emails.startProcessing(
  async (email) => {
    await sendEmail(email);
    return { sent: true };
  },
  { concurrency: 3 }
);
```

#### stopProcessing()

Stop all workers and wait for current tasks to complete.

```javascript
await emails.stopProcessing();
```

## Events

The plugin emits the following events:

### message.enqueued

Emitted when a message is enqueued.

```javascript
queuePlugin.on('message.enqueued', (event) => {
  console.log(`Message enqueued: ${event.id}`);
  // event: { id, queueId }
});
```

### message.completed

Emitted when a message is successfully processed.

```javascript
queuePlugin.on('message.completed', (event) => {
  console.log(`Message completed in ${event.duration}ms`);
  // event: { queueId, duration, attempts, result }
});
```

### message.retry

Emitted when a message is retried after failure.

```javascript
queuePlugin.on('message.retry', (event) => {
  console.log(`Retrying message (attempt ${event.attempts})`);
  // event: { queueId, error, attempts, nextVisibleAt }
});
```

### message.dead

Emitted when a message is moved to dead letter queue.

```javascript
queuePlugin.on('message.dead', (event) => {
  console.log(`Message moved to dead letter: ${event.queueId}`);
  // event: { queueId, originalId, error, attempts }
});
```

### workers.started

Emitted when workers start.

```javascript
queuePlugin.on('workers.started', (event) => {
  console.log(`Started ${event.concurrency} workers`);
  // event: { concurrency, workerId }
});
```

### workers.stopped

Emitted when workers stop.

```javascript
queuePlugin.on('workers.stopped', (event) => {
  console.log(`Workers stopped: ${event.workerId}`);
  // event: { workerId }
});
```

## How It Works

### Architecture

The S3Queue Plugin uses three S3DB resources:

1. **Original Resource** (`emails`) - Your data
2. **Queue Resource** (`emails_queue`) - Queue metadata with status tracking
3. **Lock Resource** (`emails_locks`) - Distributed locks for atomic operations

### Message Flow

```
┌─────────────────┐
│ 1. Enqueue      │ ← Create record + queue entry (status: pending)
└────────┬────────┘
         │
┌────────▼────────┐
│ 2. Poll         │ ← Workers query for pending messages
└────────┬────────┘
         │
┌────────▼────────┐
│ 3. Acquire Lock │ ← Distributed lock prevents race conditions
└────────┬────────┘
         │
┌────────▼────────┐
│ 4. Claim (ETag) │ ← Atomic claim using S3 ETag conditional update
└────────┬────────┘
         │
┌────────▼────────┐
│ 5. Process      │ ← Execute onMessage handler
└────────┬────────┘
         │
      ┌──┴──┐
      │     │
┌─────▼─┐ ┌─▼─────┐
│Success│ │Failure│
└───┬───┘ └───┬───┘
    │         │
    │    ┌────▼────┐
    │    │ Retry?  │
    │    └────┬────┘
    │         │
    │    ┌────▼────────┐
    │    │ Dead Letter │ ← After max attempts
    │    └─────────────┘
    │
┌───▼────────┐
│ Complete   │ ← Mark as completed
└────────────┘
```

### Zero Duplication Guarantee

The plugin achieves **0% duplication** through:

1. **Distributed Locking** - Resource-based locks using ETag conditional updates
2. **Cache Protection** - Deduplication cache updated while holding lock
3. **Atomic Claims** - S3 ETag prevents multiple workers claiming same message
4. **Lock Cleanup** - Automatic cleanup of expired locks (5s TTL)

## Advanced Usage

### Manual Processing Control

Start and stop workers programmatically:

```javascript
// Don't auto-start workers
const plugin = new S3QueuePlugin({
  resource: 'tasks',
  autoStart: false,
  onMessage: async (task) => ({ done: true })
});

db.use(plugin);

// Later, start processing manually
await plugin.startProcessing();

// Stop when needed
await plugin.stopProcessing();
```

### Custom Handler Per Start

Override the default handler when starting:

```javascript
await emails.startProcessing(
  async (email) => {
    // Custom processing logic
    await customEmailSender(email);
    return { sent: true };
  },
  { concurrency: 10 }
);
```

### Dead Letter Queue Processing

Process failed messages from the dead letter queue:

```javascript
const deadLetters = await db.resource('failed_emails').list();

for (const failed of deadLetters) {
  console.log(`Failed: ${failed.data.to}`);
  console.log(`Error: ${failed.error}`);
  console.log(`Attempts: ${failed.attempts}`);

  // Optionally re-enqueue
  await emails.enqueue(failed.data);
}
```

### Queue Monitoring

Monitor queue health in real-time:

```javascript
setInterval(async () => {
  const stats = await emails.queueStats();

  // Alert if too many pending
  if (stats.pending > 1000) {
    console.warn('Queue backlog detected!', stats);
  }

  // Alert if too many dead letters
  if (stats.dead > 100) {
    console.error('High failure rate!', stats);
  }
}, 60000); // Check every minute
```

## Production Best Practices

### 1. Idempotent Handlers

Always make handlers idempotent (safe to retry):

```javascript
onMessage: async (order) => {
  // Check if already processed
  const existing = await externalDB.findOrder(order.id);
  if (existing) {
    return { skipped: true, reason: 'already processed' };
  }

  // Process order
  await processOrder(order);
  return { processed: true };
}
```

### 2. Error Handling

Handle errors gracefully and provide useful context:

```javascript
onMessage: async (task) => {
  try {
    await performTask(task);
    return { success: true };
  } catch (error) {
    // Log with context
    console.error('Task failed:', {
      taskId: task.id,
      error: error.message,
      stack: error.stack
    });

    // Throw to trigger retry
    throw error;
  }
}
```

### 3. Visibility Timeout

Set visibility timeout longer than max processing time:

```javascript
new S3QueuePlugin({
  resource: 'videos',
  visibilityTimeout: 300000,  // 5 minutes (video processing takes 2-3 min)
  onMessage: async (video) => {
    await encodeVideo(video); // Takes up to 3 minutes
  }
});
```

### 4. Concurrency Tuning

Adjust concurrency based on:
- Available resources (CPU/memory)
- External API rate limits
- S3 request limits

```javascript
new S3QueuePlugin({
  resource: 'api_calls',
  concurrency: 10,  // Balance throughput vs API limits
  pollInterval: 500, // Faster polling for high throughput
  onMessage: async (call) => {
    await externalAPI.call(call); // Rate limited to 100/sec
  }
});
```

### 5. Dead Letter Queue Monitoring

Set up alerts for dead letter queue:

```javascript
queuePlugin.on('message.dead', async (event) => {
  // Alert team
  await sendAlert({
    type: 'dead_letter',
    message: `Message ${event.queueId} failed after ${event.attempts} attempts`,
    error: event.error
  });

  // Log to external monitoring
  await monitoring.log('queue.dead_letter', event);
});
```

## Performance

### Throughput

The plugin's throughput depends on:
- **Concurrency** - More workers = higher throughput
- **Poll Interval** - Faster polling = lower latency
- **S3 Latency** - MinIO/LocalStack faster than AWS S3
- **Message Processing Time** - Faster handlers = higher throughput

Typical performance with LocalStack:
- ~10-20 messages/second with 3 workers
- ~30-50 messages/second with 10 workers
- ~100+ messages/second with 20+ workers

### S3 Request Costs

Each message requires approximately:
- **Enqueue**: 2 requests (PUT record + PUT queue entry)
- **Process**: 5-7 requests (GET queue, GET record, PUT claim, PUT complete, locks)
- **Retry**: 3-4 requests (GET queue, PUT retry)

Use caching and batch operations to reduce costs.

## Comparison with Other Queue Systems

| Feature | S3Queue | AWS SQS | RabbitMQ |
|---------|---------|---------|----------|
| **Setup** | Zero (built-in) | AWS account | Server setup |
| **Cost** | S3 only | $0.40/million | Server costs |
| **Atomicity** | ETag + locks | Native | Native |
| **Visibility Timeout** | ✅ | ✅ | ✅ |
| **Dead Letter Queue** | ✅ | ✅ | ✅ |
| **Message Ordering** | No | FIFO queues | Yes |
| **Throughput** | Moderate | High | Very high |
| **Durability** | S3 (99.999999999%) | SQS (high) | Configurable |

## Examples

See the [example file](../../docs/examples/e31-s3-queue.js) for a complete working example.

## Testing

The plugin includes comprehensive tests:

```bash
# Run all S3Queue tests
pnpm test tests/plugins/plugin-s3-queue*.test.js

# Run concurrent tests
pnpm test tests/plugins/plugin-s3-queue-concurrent.test.js

# Run edge case tests
pnpm test tests/plugins/plugin-s3-queue-edge-cases.test.js
```

## Troubleshooting

### No messages being processed

Check:
1. Workers started? `await plugin.startProcessing()` or `autoStart: true`
2. Messages enqueued? `await resource.queueStats()`
3. Visibility timeout expired? Wait for timeout or reduce it
4. Errors in handler? Check `onError` logs

### High duplication rate

Should be **0% with distributed locking**. If seeing duplicates:
1. Verify lock resource exists: `db.resources['{resource}_locks']`
2. Check for errors in lock creation (verbose mode)
3. Ensure ETag support in S3 backend (MinIO/LocalStack/AWS)

### Messages stuck in processing

Likely cause: Worker crashed during processing. Solutions:
1. Reduce visibility timeout
2. Monitor worker health
3. Implement graceful shutdown
4. Check dead letter queue

### Lock cleanup not working

Check:
1. Lock cleanup interval running (every 10s)
2. Lock TTL expired (default 5s)
3. No errors in `cleanupStaleLocks()` (verbose mode)

## License

Part of S3DB - See [LICENSE](../../LICENSE)
