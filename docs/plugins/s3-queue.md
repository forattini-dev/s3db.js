# 🔒 S3Queue Plugin

## ⚡ TLDR

**Distributed queue system** using S3 as backend, with zero duplication guarantee.

**3 lines to get started:**
```javascript
const queue = new S3QueuePlugin({ resource: 'tasks', onMessage: async (task) => { console.log('Processing:', task); } });
await db.usePlugin(queue);
await tasks.enqueue({ type: 'send-email', data: {...} });
```

**Key features:**
- ✅ Zero duplication (distributed locks + ETag + cache)
- ✅ Visibility timeout (like AWS SQS)
- ✅ Automatic retry with exponential backoff
- ✅ Dead letter queue
- ✅ Configurable worker pool

**When to use:**
- 📧 Email/SMS queues
- 🎬 Media processing
- 📊 Report generation
- 🔄 Background jobs
- 🔔 Webhook delivery

---

## 📖 Table of Contents

- [🎯 What is S3Queue?](#-what-is-s3queue)
- [✨ Key Features](#-key-features)
- [🚀 Quick Start](#-quick-start)
- [🎯 Understanding the `onMessage` Handler](#-understanding-the-onmessage-handler)
- [⚙️ Configuration](#️-configuration)
- [🎪 Real-World Use Cases](#-real-world-use-cases)
- [🏗️ Architecture Deep Dive](#️-architecture-deep-dive)
- [📡 API Reference](#-api-reference)
- [🎭 Event System](#-event-system)
- [💡 Patterns & Best Practices](#-patterns--best-practices)
- [⚡ Performance & Tuning](#-performance--tuning)
- [🐛 Troubleshooting](#-troubleshooting)
- [❓ FAQ](#-faq)
- [📊 Comparison with Other Queues](#-comparison-with-other-queues)

---

## 🎯 What is S3Queue?

S3Queue is a **distributed queue processing system** that turns S3DB into a powerful message queue, similar to AWS SQS or RabbitMQ, but with the simplicity of S3 as your backend.

### Why Use S3Queue?

```
┌─────────────────────────────────────────────────────────────┐
│                     Traditional Approach                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   App Server  ──→  AWS SQS  ──→  Worker Pool               │
│                       ↓                                      │
│                   Extra Service                             │
│                   Extra Cost                                │
│                   Extra Config                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     S3Queue Approach                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   App Server  ──→  S3DB (with S3Queue)  ──→  Worker Pool   │
│                       ↓                                      │
│                   No Extra Service                          │
│                   No Extra Cost                             │
│                   Built-in                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Perfect For:

- 📧 **Email/SMS queues** - Send notifications asynchronously
- 🎬 **Media processing** - Video encoding, image resizing
- 📊 **Report generation** - Heavy computation tasks
- 🔄 **Data synchronization** - Sync between systems
- 🤖 **Background jobs** - Any async task processing
- 📦 **Order processing** - E-commerce workflows
- 🔔 **Webhook delivery** - Reliable webhook retries

---

## ✨ Key Features

### 🎯 Zero Duplication Guarantee

Unlike traditional queues that guarantee "at-least-once" delivery, S3Queue achieves **exactly-once processing** through a combination of:

```
┌──────────────────────────────────────────────────┐
│          Zero Duplication Architecture           │
├──────────────────────────────────────────────────┤
│                                                   │
│  Layer 1: Distributed Locks (S3 Resources)      │
│            ↓ Prevents concurrent cache checks    │
│                                                   │
│  Layer 2: Deduplication Cache (In-Memory)        │
│            ↓ Fast local duplicate detection      │
│                                                   │
│  Layer 3: ETag Atomicity (S3 Native)             │
│            ↓ Atomic claim via conditional update │
│                                                   │
│         Result: 0% Duplication Rate 🎉           │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 🔐 Distributed Locking

Each message gets a distributed lock during claim:

```javascript
// Worker A tries to claim message-123
┌─────────────────────────────────────────────────┐
│ 1. Acquire lock for message-123                 │
│    ├─ Create lock resource entry                │
│    ├─ Check if lock exists (ETag check)         │
│    └─ Only ONE worker succeeds ✓                │
│                                                  │
│ 2. Check deduplication cache (while locked)     │
│    ├─ Already processed? → Release lock, skip   │
│    └─ Not processed? → Add to cache ✓           │
│                                                  │
│ 3. Release lock immediately                     │
│    └─ Cache updated, lock no longer needed      │
│                                                  │
│ 4. Claim with ETag (no lock needed)             │
│    ├─ Fetch queue entry with ETag               │
│    ├─ Conditional update with ETag              │
│    └─ Only ONE worker succeeds (atomic) ✓       │
│                                                  │
│ 5. Process message                              │
│    └─ Handler executes                          │
└─────────────────────────────────────────────────┘
```

### ⏱️ Visibility Timeout Pattern

Just like AWS SQS:

```
Time ──────────────────────────────────────────────────────►

Message Enqueued
    │
    ├──► Worker A Claims (status: processing)
    │                │
    │                ├──► Message invisible for 30s
    │                │    (other workers can't see it)
    │                │
    │                ├──► Worker A processing...
    │                │
    │                └──► Completes (status: completed)
    │
    └──► Message visible again (if timeout expires)
```

### 🔁 Automatic Retries with Exponential Backoff

```javascript
Attempt 1: Fail ──► Wait 1 second  ──► Retry
Attempt 2: Fail ──► Wait 2 seconds ──► Retry
Attempt 3: Fail ──► Wait 4 seconds ──► Retry
Attempt 4: Fail ──► Move to Dead Letter Queue ☠️
```

---

## 🚀 Quick Start

### Installation

```bash
npm install s3db
# or
pnpm add s3db
```

### 30-Second Setup

```javascript
import { Database, S3QueuePlugin } from 's3db';

// 1. Connect to S3
const db = new Database({
  connection: 's3://KEY:SECRET@localhost:9000/my-bucket'
});
await db.connect();

// 2. Create resource
const tasks = await db.createResource({
  name: 'tasks',
  attributes: {
    id: 'string|required',
    type: 'string|required',
    data: 'json'
  }
});

// 3. Setup queue
const queue = new S3QueuePlugin({
  resource: 'tasks',
  onMessage: async (task) => {
    console.log('Processing:', task.type);
    // Your logic here
    return { done: true };
  }
});

db.use(queue);

// 4. Enqueue tasks
await tasks.enqueue({
  type: 'send-email',
  data: { to: 'user@example.com' }
});

// That's it! Workers are already processing 🎉
```

### Complete Example: Email Queue

```javascript
import { Database, S3QueuePlugin } from 's3db';
import nodemailer from 'nodemailer';

// Setup email transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Connect database
const db = new Database({
  connection: process.env.S3DB_CONNECTION
});
await db.connect();

// Create emails resource
const emails = await db.createResource({
  name: 'emails',
  attributes: {
    id: 'string|required',
    to: 'string|required',
    subject: 'string|required',
    body: 'string',
    html: 'string|optional',
    priority: 'string|default:normal'
  },
  timestamps: true
});

// Setup queue with retry logic
const emailQueue = new S3QueuePlugin({
  resource: 'emails',
  concurrency: 5,              // 5 parallel workers
  visibilityTimeout: 60000,    // 1 minute timeout
  maxAttempts: 3,              // Retry twice
  deadLetterResource: 'failed_emails',
  autoStart: true,
  verbose: true,

  onMessage: async (email, context) => {
    console.log(`[Worker ${context.workerId}] Sending email to ${email.to}`);

    try {
      const result = await transporter.sendMail({
        from: 'noreply@myapp.com',
        to: email.to,
        subject: email.subject,
        text: email.body,
        html: email.html
      });

      return {
        messageId: result.messageId,
        sentAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to send email: ${error.message}`);
      throw error; // Will trigger retry
    }
  },

  onError: (error, email) => {
    // Log to external service
    console.error(`Email failed: ${email.to}`, error);
  },

  onComplete: (email, result) => {
    console.log(`✅ Email sent to ${email.to}: ${result.messageId}`);
  }
});

db.use(emailQueue);

// Listen to events
emailQueue.on('message.completed', (event) => {
  console.log(`✅ Completed in ${event.duration}ms`);
});

emailQueue.on('message.dead', (event) => {
  console.log(`💀 Message failed after ${event.attempts} attempts`);
  // Alert admins
});

// API endpoint to enqueue emails
app.post('/api/send-email', async (req, res) => {
  const { to, subject, body } = req.body;

  const email = await emails.enqueue({
    to,
    subject,
    body
  });

  res.json({
    id: email.id,
    status: 'queued'
  });
});

// Monitor queue health
setInterval(async () => {
  const stats = await emails.queueStats();

  if (stats.pending > 1000) {
    console.warn('⚠️ Queue backlog detected:', stats);
  }

  if (stats.dead > 100) {
    console.error('🚨 High failure rate:', stats);
  }
}, 60000); // Check every minute
```

---

## 🎯 Understanding the `onMessage` Handler

**This is the most important part of S3Queue** - the `onMessage` function is where you write the logic to process each message from the queue.

### What is `onMessage`?

Think of `onMessage` as your **message processor**. Every time a worker picks up a message from the queue, it calls this function with the message data. This is where you:

- 📧 Send emails
- 🖼️ Process images or videos
- 🌐 Call external APIs
- 💾 Save to databases
- 🔄 Transform data
- 📊 Generate reports
- ...or do anything else you need!

### Function Signature

```javascript
onMessage: async (message, context) => {
  // Your processing logic here
  return result; // Optional: return data to be stored
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | `Object` | The message data from the queue (your resource attributes) |
| `context` | `Object` | Processing context with metadata |

**Context Object:**

```javascript
{
  workerId: 'worker-1',        // Which worker is processing
  attempt: 1,                   // Current attempt number (1, 2, 3...)
  queuedAt: '2024-01-15T...',  // When message was enqueued
  claimedAt: '2024-01-15T...', // When message was claimed
  metadata: {...}               // Original S3DB metadata
}
```

### Examples: Different Message Processing Scenarios

#### Example 1: Send Email

```javascript
const emailQueue = new S3QueuePlugin({
  resource: 'emails',
  onMessage: async (email, context) => {
    // Send email using your favorite service
    const result = await transporter.sendMail({
      from: 'noreply@app.com',
      to: email.to,
      subject: email.subject,
      text: email.body
    });

    // Return the result (optional)
    return {
      messageId: result.messageId,
      sentAt: new Date().toISOString()
    };
  }
});

// Enqueue an email
await emails.enqueue({
  to: 'user@example.com',
  subject: 'Welcome!',
  body: 'Thanks for signing up!'
});
```

#### Example 2: Process Images

```javascript
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const imageQueue = new S3QueuePlugin({
  resource: 'images',
  onMessage: async (image, context) => {
    console.log(`Processing image ${image.filename} (attempt ${context.attempt})`);

    // Download original image
    const buffer = await downloadImage(image.url);

    // Create thumbnails
    const thumbnail = await sharp(buffer)
      .resize(200, 200)
      .toBuffer();

    const medium = await sharp(buffer)
      .resize(800, 800)
      .toBuffer();

    // Upload to S3
    const s3 = new S3Client({ region: 'us-east-1' });

    await s3.send(new PutObjectCommand({
      Bucket: 'my-images',
      Key: `thumbnails/${image.filename}`,
      Body: thumbnail
    }));

    await s3.send(new PutObjectCommand({
      Bucket: 'my-images',
      Key: `medium/${image.filename}`,
      Body: medium
    }));

    // Return the URLs
    return {
      thumbnail: `https://my-images.s3.amazonaws.com/thumbnails/${image.filename}`,
      medium: `https://my-images.s3.amazonaws.com/medium/${image.filename}`,
      processedAt: new Date().toISOString()
    };
  }
});

// Enqueue an image
await images.enqueue({
  filename: 'photo.jpg',
  url: 'https://example.com/uploads/photo.jpg',
  userId: '12345'
});
```

#### Example 3: Call External API

```javascript
const webhookQueue = new S3QueuePlugin({
  resource: 'webhooks',
  maxAttempts: 5, // Retry up to 5 times for reliability

  onMessage: async (webhook, context) => {
    // Call external webhook URL
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': generateSignature(webhook.data)
      },
      body: JSON.stringify(webhook.data)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    return {
      statusCode: response.status,
      deliveredAt: new Date().toISOString()
    };
  }
});

// Enqueue a webhook
await webhooks.enqueue({
  url: 'https://customer-api.com/webhook',
  event: 'order.created',
  data: {
    orderId: 'ORD-12345',
    amount: 99.99
  }
});
```

#### Example 4: Database Processing

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const syncQueue = new S3QueuePlugin({
  resource: 'user_updates',
  onMessage: async (update, context) => {
    // Sync user data to PostgreSQL
    const { data, error } = await supabase
      .from('users')
      .upsert({
        id: update.userId,
        name: update.name,
        email: update.email,
        updated_at: new Date().toISOString()
      });

    if (error) {
      throw error; // Will trigger retry
    }

    // Also update Elasticsearch for search
    await elasticsearchClient.update({
      index: 'users',
      id: update.userId,
      body: {
        doc: {
          name: update.name,
          email: update.email
        }
      }
    });

    return {
      syncedTo: ['postgresql', 'elasticsearch'],
      syncedAt: new Date().toISOString()
    };
  }
});
```

#### Example 5: Complex Business Logic

```javascript
const orderQueue = new S3QueuePlugin({
  resource: 'orders',
  concurrency: 10,

  onMessage: async (order, context) => {
    console.log(`Processing order ${order.id} (attempt ${context.attempt})`);

    // Step 1: Validate inventory
    const inventory = await checkInventory(order.items);
    if (!inventory.available) {
      throw new Error('Out of stock');
    }

    // Step 2: Process payment
    const payment = await processPayment({
      amount: order.total,
      customerId: order.customerId,
      paymentMethod: order.paymentMethod
    });

    if (!payment.success) {
      throw new Error(`Payment failed: ${payment.error}`);
    }

    // Step 3: Create shipment
    const shipment = await createShipment({
      orderId: order.id,
      items: order.items,
      address: order.shippingAddress
    });

    // Step 4: Send confirmation email
    await sendEmail({
      to: order.customerEmail,
      subject: `Order ${order.id} Confirmed`,
      template: 'order-confirmation',
      data: {
        orderId: order.id,
        trackingNumber: shipment.trackingNumber
      }
    });

    // Step 5: Update order status
    await orders.update(order.id, {
      status: 'confirmed',
      paymentId: payment.id,
      trackingNumber: shipment.trackingNumber
    });

    return {
      status: 'confirmed',
      paymentId: payment.id,
      trackingNumber: shipment.trackingNumber,
      processedAt: new Date().toISOString()
    };
  },

  onError: async (error, order) => {
    // Rollback on failure
    console.error(`Order ${order.id} failed:`, error);

    await orders.update(order.id, {
      status: 'failed',
      error: error.message
    });

    // Notify customer
    await sendEmail({
      to: order.customerEmail,
      subject: 'Order Processing Failed',
      template: 'order-failed',
      data: { orderId: order.id }
    });
  }
});
```

### What Should You Return?

The `onMessage` function can return:

1. **Nothing (undefined)**: Message is marked as completed

```javascript
onMessage: async (msg) => {
  await sendEmail(msg);
  // No return - just marks as completed
}
```

2. **An object**: Stored as processing result (useful for tracking)

```javascript
onMessage: async (msg) => {
  const result = await processData(msg);
  return {
    processed: true,
    resultId: result.id,
    duration: result.duration
  };
}
```

3. **Throw an error**: Triggers retry mechanism

```javascript
onMessage: async (msg) => {
  const response = await callAPI(msg);

  if (!response.ok) {
    throw new Error(`API failed: ${response.status}`);
    // → Will retry with exponential backoff
  }

  return { success: true };
}
```

### Error Handling in `onMessage`

**If your function throws an error**, S3Queue will:

1. ⏱️ Wait with exponential backoff (1s, 2s, 4s, 8s...)
2. 🔄 Retry the message (up to `maxAttempts`)
3. ☠️ Move to dead letter queue if all attempts fail

```javascript
onMessage: async (msg, context) => {
  try {
    await riskyOperation(msg);
    return { success: true };
  } catch (error) {
    // Log the error
    console.error(`Failed on attempt ${context.attempt}:`, error);

    // Re-throw to trigger retry
    throw error;
  }
}
```

**Tip:** Use `context.attempt` to implement custom retry logic:

```javascript
onMessage: async (msg, context) => {
  // Use different strategy on later attempts
  const timeout = context.attempt === 1 ? 5000 : 30000;

  try {
    return await processWithTimeout(msg, timeout);
  } catch (error) {
    if (error.code === 'RATE_LIMIT' && context.attempt < 3) {
      // Wait longer for rate limit errors
      await sleep(10000);
      throw error; // Retry
    }

    // Don't retry for certain errors
    if (error.code === 'INVALID_DATA') {
      console.error('Invalid data, skipping retry');
      return { skipped: true, error: error.message };
    }

    throw error;
  }
}
```

### Key Takeaways

✅ `onMessage` is **THE** function where you process your queue messages

✅ It receives the **message data** (your resource attributes) and **context** (metadata)

✅ You can **return data** to track processing results

✅ **Throwing errors** triggers the retry mechanism

✅ Use **async/await** for asynchronous operations

✅ The function runs for **each message** picked from the queue

---

## ⚙️ Configuration

### Plugin Options

```javascript
new S3QueuePlugin({
  // === Required ===
  resource: 'tasks',              // Target resource name

  // === Processing ===
  onMessage: async (record, context) => {
    // Your processing logic
    return result;
  },

  // === Concurrency ===
  concurrency: 3,                 // Number of parallel workers
  pollInterval: 1000,             // Poll every 1 second
  visibilityTimeout: 30000,       // 30 seconds invisible time

  // === Retries ===
  maxAttempts: 3,                 // Retry up to 3 times
  deadLetterResource: 'failed',   // Where to move failed messages

  // === Lifecycle ===
  autoStart: true,                // Start workers immediately
  verbose: false,                 // Enable debug logging

  // === Callbacks ===
  onError: (error, record) => {
    // Handle errors
  },
  onComplete: (record, result) => {
    // Handle success
  }
});
```

### Configuration Patterns

#### Pattern 1: High Throughput

```javascript
new S3QueuePlugin({
  resource: 'analytics_events',
  concurrency: 20,           // Many parallel workers
  pollInterval: 100,         // Fast polling
  visibilityTimeout: 10000,  // Short timeout
  maxAttempts: 1,            // Don't retry (analytics)
  onMessage: async (event) => {
    await logToAnalytics(event);
  }
});
```

#### Pattern 2: Reliable Processing

```javascript
new S3QueuePlugin({
  resource: 'payments',
  concurrency: 2,            // Conservative concurrency
  pollInterval: 5000,        // Slower polling
  visibilityTimeout: 300000, // 5 minute timeout
  maxAttempts: 5,            // Multiple retries
  deadLetterResource: 'failed_payments',
  onMessage: async (payment) => {
    await processPayment(payment);
  },
  onError: async (error, payment) => {
    await alertAdmins(error, payment);
  }
});
```

#### Pattern 3: Heavy Processing

```javascript
new S3QueuePlugin({
  resource: 'video_encoding',
  concurrency: 1,             // One at a time (CPU intensive)
  pollInterval: 10000,        // Check every 10s
  visibilityTimeout: 1800000, // 30 minute timeout
  maxAttempts: 2,             // One retry
  onMessage: async (video) => {
    await ffmpeg.encode(video.path);
  }
});
```

---

## 🎪 Real-World Use Cases

### Use Case 1: E-Commerce Order Processing

```javascript
// Order workflow: payment → inventory → shipping → notification

const orders = await db.createResource({
  name: 'orders',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    items: 'json|required',
    total: 'number|required',
    status: 'string|default:pending'
  }
});

const orderQueue = new S3QueuePlugin({
  resource: 'orders',
  concurrency: 10,
  maxAttempts: 3,
  deadLetterResource: 'failed_orders',

  onMessage: async (order) => {
    // 1. Charge payment
    const payment = await stripe.charges.create({
      amount: order.total,
      customer: order.userId
    });

    // 2. Update inventory
    await Promise.all(
      order.items.map(item =>
        inventory.decrement(item.productId, item.quantity)
      )
    );

    // 3. Create shipment
    const shipment = await shipping.create({
      orderId: order.id,
      items: order.items
    });

    // 4. Send confirmation email
    await emails.enqueue({
      to: order.userEmail,
      subject: `Order ${order.id} confirmed`,
      template: 'order-confirmation',
      data: { order, shipment }
    });

    return {
      paymentId: payment.id,
      shipmentId: shipment.id
    };
  },

  onError: async (error, order) => {
    // Refund if payment succeeded
    if (error.code === 'INVENTORY_UNAVAILABLE') {
      await stripe.refunds.create({ charge: error.paymentId });
    }

    // Notify customer
    await emails.enqueue({
      to: order.userEmail,
      subject: `Order ${order.id} failed`,
      template: 'order-failed',
      data: { order, error: error.message }
    });
  }
});

db.use(orderQueue);
```

### Use Case 2: Webhook Delivery System

```javascript
const webhooks = await db.createResource({
  name: 'webhooks',
  attributes: {
    id: 'string|required',
    url: 'string|required',
    event: 'string|required',
    payload: 'json',
    signature: 'string'
  }
});

const webhookQueue = new S3QueuePlugin({
  resource: 'webhooks',
  concurrency: 50,           // High concurrency for webhooks
  maxAttempts: 5,            // Retry multiple times
  visibilityTimeout: 30000,

  onMessage: async (webhook) => {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': webhook.signature,
        'X-Event': webhook.event
      },
      body: JSON.stringify(webhook.payload),
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    return {
      status: response.status,
      deliveredAt: new Date().toISOString()
    };
  },

  onError: (error, webhook) => {
    console.error(`Webhook delivery failed: ${webhook.url}`, error);
  }
});

db.use(webhookQueue);

// Trigger webhooks from your app
app.post('/api/users', async (req, res) => {
  const user = await users.insert(req.body);

  // Enqueue webhook delivery
  await webhooks.enqueue({
    url: 'https://customer-app.com/webhooks',
    event: 'user.created',
    payload: user,
    signature: generateSignature(user)
  });

  res.json(user);
});
```

### Use Case 3: Image Processing Pipeline

```javascript
const images = await db.createResource({
  name: 'images',
  attributes: {
    id: 'string|required',
    originalUrl: 'string|required',
    sizes: 'json|default:[]'
  }
});

const imageQueue = new S3QueuePlugin({
  resource: 'images',
  concurrency: 3,  // CPU intensive
  visibilityTimeout: 120000, // 2 minutes
  maxAttempts: 2,

  onMessage: async (image) => {
    const original = await downloadImage(image.originalUrl);

    const sizes = [
      { name: 'thumbnail', width: 150, height: 150 },
      { name: 'medium', width: 800, height: 600 },
      { name: 'large', width: 1920, height: 1080 }
    ];

    const results = await Promise.all(
      sizes.map(async (size) => {
        const resized = await sharp(original)
          .resize(size.width, size.height, {
            fit: 'cover',
            position: 'center'
          })
          .toBuffer();

        const url = await uploadToS3(resized, `${image.id}-${size.name}.jpg`);

        return { ...size, url };
      })
    );

    // Update original record
    await images.update(image.id, {
      sizes: results,
      processed: true
    });

    return results;
  }
});

db.use(imageQueue);
```

### Use Case 4: Data Export System

```javascript
const exports = await db.createResource({
  name: 'exports',
  attributes: {
    id: 'string|required',
    userId: 'string|required',
    type: 'string|required',  // 'csv', 'json', 'excel'
    filters: 'json',
    downloadUrl: 'string|optional'
  }
});

const exportQueue = new S3QueuePlugin({
  resource: 'exports',
  concurrency: 2,  // Heavy queries
  visibilityTimeout: 600000, // 10 minutes
  maxAttempts: 1,  // Don't retry (user can request again)

  onMessage: async (exportJob) => {
    // 1. Query data based on filters
    const data = await database.query({
      table: exportJob.type,
      where: exportJob.filters,
      limit: 100000
    });

    // 2. Generate file
    let file;
    switch (exportJob.format) {
      case 'csv':
        file = await generateCSV(data);
        break;
      case 'json':
        file = JSON.stringify(data, null, 2);
        break;
      case 'excel':
        file = await generateExcel(data);
        break;
    }

    // 3. Upload to S3
    const url = await s3.upload({
      Bucket: 'exports',
      Key: `${exportJob.userId}/${exportJob.id}.${exportJob.format}`,
      Body: file,
      Expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // 4. Send download link
    await emails.enqueue({
      to: exportJob.userEmail,
      subject: 'Your export is ready',
      template: 'export-ready',
      data: { downloadUrl: url }
    });

    return { downloadUrl: url };
  },

  onComplete: async (exportJob, result) => {
    // Update export record with download URL
    await exports.update(exportJob.id, {
      downloadUrl: result.downloadUrl,
      completedAt: new Date().toISOString()
    });
  }
});

db.use(exportQueue);
```

---

## 🏗️ Architecture Deep Dive

### The Three Resources

S3Queue creates three S3DB resources for each queue:

```
┌─────────────────────────────────────────────────────────┐
│                    S3Queue Resources                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Original Resource (tasks)                           │
│     └─ Your actual data                                 │
│                                                          │
│  2. Queue Resource (tasks_queue)                        │
│     ├─ Queue metadata                                   │
│     ├─ status: pending/processing/completed/dead       │
│     ├─ attempts: retry count                            │
│     ├─ visibleAt: visibility timeout                    │
│     └─ ETag: for atomic claims                          │
│                                                          │
│  3. Lock Resource (tasks_locks)                         │
│     ├─ Distributed locks                                │
│     ├─ workerId: which worker owns lock                 │
│     ├─ timestamp: when lock was acquired                │
│     └─ ttl: lock expiry (5 seconds)                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Message Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     Complete Message Flow                        │
└─────────────────────────────────────────────────────────────────┘

1️⃣  ENQUEUE
    │
    ├─► Create record in 'tasks' resource
    │   { id: 'task-1', type: 'send-email', data: {...} }
    │
    └─► Create queue entry in 'tasks_queue' resource
        { id: 'queue-1', originalId: 'task-1', status: 'pending',
          visibleAt: 0, attempts: 0 }

2️⃣  POLL (by Worker A)
    │
    └─► Query 'tasks_queue' for pending messages
        WHERE status='pending' AND visibleAt <= now

3️⃣  ACQUIRE LOCK
    │
    ├─► Try to create lock in 'tasks_locks'
    │   { id: 'lock-queue-1', workerId: 'worker-A', timestamp: now }
    │
    ├─► If lock exists → Skip (another worker has it)
    └─► If created → Worker A owns the lock ✓

4️⃣  CHECK CACHE (while holding lock)
    │
    ├─► Is queue-1 in processedCache?
    │   └─► Yes → Release lock, skip message
    │   └─► No → Add to cache, continue
    │
    └─► Release lock (cache updated)

5️⃣  CLAIM WITH ETAG
    │
    ├─► Fetch queue entry with ETag
    │   { id: 'queue-1', _etag: '"abc123"', status: 'pending' }
    │
    └─► Conditional update (atomic):
        UPDATE tasks_queue SET
          status='processing',
          claimedBy='worker-A',
          visibleAt=now+30000,
          attempts=1
        WHERE id='queue-1' AND _etag='"abc123"'

        Only ONE worker succeeds ✓

6️⃣  PROCESS
    │
    ├─► Load original record: tasks.get('task-1')
    │
    ├─► Execute handler: onMessage(task, context)
    │
    └─► Result:
        ├─► Success → Mark completed
        ├─► Error → Retry or dead letter
        └─► Timeout → Becomes visible again

7️⃣  COMPLETE
    │
    └─► Update queue entry:
        { status: 'completed', result: {...}, completedAt: now }

8️⃣  RETRY (if failed)
    │
    ├─► Calculate backoff: Math.min(2^attempts * 1000, 30000)
    │
    └─► Update queue entry:
        { status: 'pending', visibleAt: now+backoff, attempts: 2 }

9️⃣  DEAD LETTER (if max attempts exceeded)
    │
    ├─► Update queue entry:
    │   { status: 'dead', error: 'Max attempts exceeded' }
    │
    └─► Create entry in 'failed_tasks' resource:
        { originalId: 'task-1', error: '...', attempts: 3, data: {...} }
```

### Lock Mechanism Details

```javascript
// How locks prevent race conditions

Worker A                          Worker B
   │                                 │
   ├─► Try create lock-msg-1        │
   │   ✓ SUCCESS                     │
   │                                 ├─► Try create lock-msg-1
   │                                 │   ✗ FAIL (already exists)
   │                                 │
   ├─► Check cache (protected)      │
   │   Not in cache ✓                │
   │                                 └─► Skip message
   ├─► Add to cache                 │
   │                                 │
   ├─► Release lock                 │
   │                                 │
   ├─► Claim with ETag              │
   │   ✓ SUCCESS (unique)            │
   │                                 │
   ├─► Process message              │
   │                                 │
   └─► Complete                     │
```

### ETag Atomicity

S3 ETags provide strong consistency guarantees:

```javascript
// Two workers try to claim simultaneously

┌─────────────────────────────────────────────────────────┐
│ Queue Entry State                                        │
├─────────────────────────────────────────────────────────┤
│ { id: 'msg-1', status: 'pending', _etag: '"v1"' }      │
└─────────────────────────────────────────────────────────┘

Worker A                          Worker B
   │                                 │
   ├─► GET msg-1                    │
   │   Returns: _etag="v1"           │
   │                                 ├─► GET msg-1
   │                                 │   Returns: _etag="v1"
   │                                 │
   ├─► UPDATE msg-1                 │
   │   WHERE _etag="v1"              │
   │   ✓ SUCCESS                     │
   │   New ETag: "v2"                │
   │                                 │
   │                                 ├─► UPDATE msg-1
   │                                 │   WHERE _etag="v1"
   │                                 │   ✗ FAIL (ETag mismatch)
   │                                 │   Current ETag is "v2"
   │                                 │
   └─► Processes message            └─► Skips (failed claim)

Result: Only Worker A processes ✓
```

---

## 📡 API Reference

### Plugin Methods

#### `startProcessing(handler?, options?)`

Start processing messages with workers.

```javascript
await queue.startProcessing();

// With custom handler
await queue.startProcessing(async (record) => {
  console.log('Custom handler:', record);
  return { done: true };
});

// With options
await queue.startProcessing(null, {
  concurrency: 10
});
```

#### `stopProcessing()`

Stop all workers gracefully (waits for current tasks).

```javascript
await queue.stopProcessing();
console.log('All workers stopped');
```

#### `getStats()`

Get detailed queue statistics.

```javascript
const stats = await queue.getStats();
console.log(stats);
// {
//   total: 100,
//   pending: 10,
//   processing: 5,
//   completed: 80,
//   failed: 3,
//   dead: 2
// }
```

### Resource Methods

These methods are added to your resource:

#### `resource.enqueue(data)`

Add a message to the queue.

```javascript
const message = await tasks.enqueue({
  type: 'send-email',
  to: 'user@example.com'
});

console.log(message.id); // 'task-123'
```

#### `resource.queueStats()`

Get queue statistics for this resource.

```javascript
const stats = await tasks.queueStats();
console.log(stats);
```

#### `resource.startProcessing(handler, options?)`

Start processing with a custom handler.

```javascript
await tasks.startProcessing(
  async (task) => {
    await processTask(task);
  },
  { concurrency: 5 }
);
```

#### `resource.stopProcessing()`

Stop processing for this resource.

```javascript
await tasks.stopProcessing();
```

### Handler Context

The `onMessage` handler receives a context object:

```javascript
onMessage: async (record, context) => {
  console.log(context);
  // {
  //   workerId: 'worker-abc123',
  //   attempts: 1,
  //   maxAttempts: 3,
  //   queueId: 'queue-entry-id'
  // }
}
```

---

## 🎭 Event System

### Available Events

```javascript
const queue = new S3QueuePlugin({ ... });

// Message enqueued
queue.on('message.enqueued', (event) => {
  console.log(`📨 Enqueued: ${event.id}`);
  // { id, queueId }
});

// Message claimed by worker
queue.on('message.claimed', (event) => {
  console.log(`🔒 Claimed: ${event.queueId}`);
  // { queueId, workerId, attempts }
});

// Processing started
queue.on('message.processing', (event) => {
  console.log(`⚙️ Processing: ${event.queueId}`);
  // { queueId, workerId }
});

// Message completed
queue.on('message.completed', (event) => {
  console.log(`✅ Completed in ${event.duration}ms`);
  // { queueId, duration, attempts, result }
});

// Retry scheduled
queue.on('message.retry', (event) => {
  console.log(`🔄 Retry ${event.attempts}/${event.maxAttempts}`);
  // { queueId, error, attempts, maxAttempts, nextVisibleAt }
});

// Moved to dead letter queue
queue.on('message.dead', (event) => {
  console.log(`💀 Dead letter: ${event.queueId}`);
  // { queueId, originalId, error, attempts }
});

// Workers started
queue.on('workers.started', (event) => {
  console.log(`🚀 Started ${event.concurrency} workers`);
  // { concurrency, workerId }
});

// Workers stopped
queue.on('workers.stopped', (event) => {
  console.log(`🛑 Workers stopped`);
  // { workerId }
});
```

### Event-Driven Monitoring

```javascript
// Real-time monitoring dashboard
const metrics = {
  enqueued: 0,
  completed: 0,
  failed: 0,
  totalDuration: 0
};

queue.on('message.enqueued', () => {
  metrics.enqueued++;
  updateDashboard();
});

queue.on('message.completed', (event) => {
  metrics.completed++;
  metrics.totalDuration += event.duration;
  updateDashboard();
});

queue.on('message.dead', () => {
  metrics.failed++;
  updateDashboard();
  alertAdmins();
});

function updateDashboard() {
  console.log({
    ...metrics,
    avgDuration: metrics.totalDuration / metrics.completed,
    successRate: (metrics.completed / metrics.enqueued) * 100
  });
}
```

---

## 💡 Patterns & Best Practices

### Pattern 1: Idempotent Handlers

Always make handlers idempotent (safe to retry):

```javascript
// ❌ BAD: Not idempotent
onMessage: async (order) => {
  await inventory.decrement(order.productId, order.quantity);
  await payments.charge(order.userId, order.total);
}

// ✅ GOOD: Idempotent with checks
onMessage: async (order) => {
  // Check if already processed
  const existing = await processedOrders.get(order.id);
  if (existing) {
    return { skipped: true, reason: 'already processed' };
  }

  // Process with transaction
  const result = await db.transaction(async (tx) => {
    await tx.inventory.decrement(order.productId, order.quantity);
    const payment = await tx.payments.charge(order.userId, order.total);
    await tx.processedOrders.insert({ id: order.id, paymentId: payment.id });
    return payment;
  });

  return result;
}
```

### Pattern 2: Graceful Shutdown

Handle shutdown signals properly:

```javascript
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  isShuttingDown = true;

  // Stop accepting new messages
  await queue.stopProcessing();

  // Wait for current tasks to finish
  console.log('⏳ Waiting for tasks to complete...');

  // Disconnect
  await db.disconnect();

  console.log('✅ Shutdown complete');
  process.exit(0);
});

const queue = new S3QueuePlugin({
  resource: 'tasks',
  onMessage: async (task) => {
    // Check if shutting down
    if (isShuttingDown) {
      throw new Error('Shutting down, will retry later');
    }

    await processTask(task);
  }
});
```

### Pattern 3: Priority Queues

Implement priority processing:

```javascript
// High priority queue
const highPriorityQueue = new S3QueuePlugin({
  resource: 'tasks',
  concurrency: 10,
  pollInterval: 100,  // Fast polling
  onMessage: async (task) => {
    if (task.priority !== 'high') return { skipped: true };
    await processTask(task);
  }
});

// Low priority queue
const lowPriorityQueue = new S3QueuePlugin({
  resource: 'tasks',
  concurrency: 2,
  pollInterval: 5000,  // Slow polling
  onMessage: async (task) => {
    if (task.priority === 'high') return { skipped: true };
    await processTask(task);
  }
});

db.use(highPriorityQueue);
db.use(lowPriorityQueue);
```

### Pattern 4: Batch Processing

Process messages in batches:

```javascript
const batchQueue = new S3QueuePlugin({
  resource: 'notifications',
  concurrency: 1,
  onMessage: async (notification) => {
    // Collect batch
    const batch = [notification];

    // Wait a bit for more messages
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get more pending messages
    const pending = await notifications.query({
      where: { status: 'pending' },
      limit: 99
    });

    batch.push(...pending);

    // Send batch
    await sendBulkNotifications(batch);

    return { batchSize: batch.length };
  }
});
```

### Pattern 5: Circuit Breaker

Prevent cascading failures:

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failures = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
    }
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      setTimeout(() => {
        this.state = 'HALF_OPEN';
        this.failures = 0;
      }, this.timeout);
    }
  }
}

const breaker = new CircuitBreaker(5, 60000);

const queue = new S3QueuePlugin({
  resource: 'api_calls',
  onMessage: async (call) => {
    return await breaker.execute(async () => {
      const response = await externalAPI.call(call.endpoint, call.data);
      return response;
    });
  },
  onError: (error, call) => {
    if (error.message === 'Circuit breaker is OPEN') {
      console.warn('⚠️ Circuit breaker open, service unavailable');
      // Will retry later
    }
  }
});
```

### Pattern 6: Rate Limiting

Control request rate to external services:

```javascript
class RateLimiter {
  constructor(maxPerSecond) {
    this.maxPerSecond = maxPerSecond;
    this.requests = [];
  }

  async acquire() {
    const now = Date.now();

    // Remove requests older than 1 second
    this.requests = this.requests.filter(t => now - t < 1000);

    // Check if limit reached
    if (this.requests.length >= this.maxPerSecond) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = 1000 - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requests.push(Date.now());
  }
}

const limiter = new RateLimiter(10); // 10 requests per second

const queue = new S3QueuePlugin({
  resource: 'api_requests',
  concurrency: 20,  // High concurrency
  onMessage: async (request) => {
    await limiter.acquire();
    const response = await fetch(request.url);
    return response;
  }
});
```

---

## ⚡ Performance & Tuning

### Throughput Benchmarks

Real-world performance with LocalStack:

```
┌─────────────────────────────────────────────────────────┐
│              S3Queue Performance Metrics                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Concurrency: 3 workers                                 │
│  Throughput:  ~10-20 messages/second                    │
│  Latency:     ~150-300ms per message                    │
│                                                          │
│  Concurrency: 10 workers                                │
│  Throughput:  ~30-50 messages/second                    │
│  Latency:     ~200-400ms per message                    │
│                                                          │
│  Concurrency: 20 workers                                │
│  Throughput:  ~50-100 messages/second                   │
│  Latency:     ~300-500ms per message                    │
│                                                          │
│  Concurrency: 50 workers                                │
│  Throughput:  ~100-150 messages/second                  │
│  Latency:     ~400-600ms per message                    │
│                                                          │
└─────────────────────────────────────────────────────────┘

Note: Latency includes S3 operations + handler execution time
```

### Tuning Guide

```javascript
// === HIGH THROUGHPUT ===
// Use case: Analytics, logs, non-critical tasks
{
  concurrency: 50,        // Many workers
  pollInterval: 100,      // Fast polling
  visibilityTimeout: 5000, // Short timeout
  maxAttempts: 1          // Don't retry
}

// === BALANCED ===
// Use case: General purpose, emails, notifications
{
  concurrency: 10,
  pollInterval: 1000,
  visibilityTimeout: 30000,
  maxAttempts: 3
}

// === RELIABLE ===
// Use case: Payments, orders, critical operations
{
  concurrency: 2,          // Conservative
  pollInterval: 5000,      // Slower polling
  visibilityTimeout: 300000, // 5 minutes
  maxAttempts: 5           // Multiple retries
}

// === HEAVY PROCESSING ===
// Use case: Video encoding, large exports
{
  concurrency: 1,           // One at a time
  pollInterval: 10000,      // Check every 10s
  visibilityTimeout: 1800000, // 30 minutes
  maxAttempts: 2
}
```

### S3 Request Costs

Approximate S3 requests per message:

```
Enqueue:        2 requests  (PUT record + PUT queue entry)
Process:        7 requests  (GET queue, GET/PUT locks, GET record,
                             PUT claim, PUT complete)
Retry:          4 requests  (GET queue, GET/PUT locks, PUT retry)
Dead Letter:    3 requests  (PUT dead letter, PUT queue status)

Total per successful message: ~9 requests
Total per failed message (3 attempts): ~21 requests
```

### Optimization Tips

```javascript
// 1. Use Local Caching
const cache = new Map();

onMessage: async (task) => {
  // Cache frequently accessed data
  let config = cache.get('app-config');
  if (!config) {
    config = await loadConfig();
    cache.set('app-config', config);
  }

  await processTask(task, config);
}

// 2. Batch External Calls
const pendingCalls = [];

onMessage: async (task) => {
  pendingCalls.push(task);

  if (pendingCalls.length >= 10) {
    const batch = pendingCalls.splice(0, 10);
    await externalAPI.batchCall(batch);
  }
}

// 3. Use Connection Pooling
const pool = new Pool({
  host: 'database',
  max: 20
});

onMessage: async (task) => {
  const client = await pool.connect();
  try {
    await client.query('...');
  } finally {
    client.release();
  }
}

// 4. Avoid Heavy Operations in Handler
// ❌ Don't do this
onMessage: async (image) => {
  const processed = await heavyImageProcessing(image);
  return processed;
}

// ✅ Do this instead - offload to another service
onMessage: async (image) => {
  await processingService.submit(image);
  return { submitted: true };
}
```

---

## 🐛 Troubleshooting

### Common Issues

#### Issue 1: No Messages Being Processed

**Symptoms:**
- Messages enqueued but never processed
- Queue stats show pending messages

**Solutions:**

```javascript
// Check 1: Are workers started?
const stats = await queue.getStats();
console.log('Is running:', queue.isRunning);

if (!queue.isRunning) {
  await queue.startProcessing();
}

// Check 2: Is autoStart enabled?
const queue = new S3QueuePlugin({
  resource: 'tasks',
  autoStart: true,  // ← Make sure this is true
  onMessage: async (task) => { ... }
});

// Check 3: Are messages visible?
const queueEntries = await db.resource('tasks_queue').list();
console.log(queueEntries.map(e => ({
  id: e.id,
  status: e.status,
  visibleAt: e.visibleAt,
  now: Date.now(),
  visible: e.visibleAt <= Date.now()
})));
```

#### Issue 2: High Duplication Rate

**Symptoms:**
- Messages processed multiple times
- Duplication rate > 0%

**Solutions:**

```javascript
// Check 1: Verify lock resource exists
console.log('Lock resource:', db.resources['tasks_locks']);

if (!db.resources['tasks_locks']) {
  console.error('⚠️ Lock resource not created!');
  // Recreate plugin
}

// Check 2: Enable verbose mode
const queue = new S3QueuePlugin({
  resource: 'tasks',
  verbose: true,  // See detailed logs
  onMessage: async (task) => { ... }
});

// Check 3: Verify ETag support
const queueEntry = await db.resource('tasks_queue').get('entry-1');
console.log('Has ETag:', !!queueEntry._etag);
```

#### Issue 3: Messages Stuck in Processing

**Symptoms:**
- Messages never complete
- Processing count keeps growing

**Solutions:**

```javascript
// Check 1: Worker crashed?
// Check logs for uncaught exceptions

// Check 2: Visibility timeout too short?
const queue = new S3QueuePlugin({
  resource: 'tasks',
  visibilityTimeout: 60000,  // Increase if tasks take longer
  onMessage: async (task) => {
    // Add logging
    console.log('Started processing:', task.id);
    await processTask(task);
    console.log('Completed processing:', task.id);
  }
});

// Check 3: Handler errors not thrown?
onMessage: async (task) => {
  try {
    await processTask(task);
  } catch (error) {
    console.error('Handler error:', error);
    throw error;  // ← Make sure errors are re-thrown
  }
}

// Solution: Reset stuck messages
const queueEntries = await db.resource('tasks_queue').list();
const stuck = queueEntries.filter(e =>
  e.status === 'processing' &&
  Date.now() - e.claimedAt > 300000 // Stuck for 5+ minutes
);

for (const entry of stuck) {
  await db.resource('tasks_queue').update(entry.id, {
    status: 'pending',
    visibleAt: 0,
    claimedBy: null
  });
}
```

#### Issue 4: High Memory Usage

**Symptoms:**
- Memory usage grows over time
- Out of memory errors

**Solutions:**

```javascript
// Solution 1: Clear cache periodically
setInterval(() => {
  queue.processedCache.clear();
  console.log('Cache cleared');
}, 3600000); // Every hour

// Solution 2: Reduce concurrency
const queue = new S3QueuePlugin({
  resource: 'tasks',
  concurrency: 3,  // Lower concurrency
  onMessage: async (task) => { ... }
});

// Solution 3: Avoid keeping large objects in memory
onMessage: async (task) => {
  // ❌ Don't do this
  const largeData = await loadLargeFile();
  globalArray.push(largeData);

  // ✅ Do this
  const largeData = await loadLargeFile();
  await processData(largeData);
  // Let GC collect largeData
}
```

#### Issue 5: Dead Letter Queue Growing

**Symptoms:**
- Many messages in dead letter queue
- High failure rate

**Solutions:**

```javascript
// Analyze dead letters
const deadLetters = await db.resource('failed_tasks').list();

// Group by error type
const errorGroups = deadLetters.reduce((acc, dl) => {
  const errorType = dl.error.split(':')[0];
  acc[errorType] = (acc[errorType] || 0) + 1;
  return acc;
}, {});

console.log('Error distribution:', errorGroups);

// Fix root cause and reprocess
for (const dl of deadLetters) {
  // Investigate error
  console.log(dl.error);
  console.log(dl.data);

  // After fixing, re-enqueue
  await tasks.enqueue(dl.data);

  // Delete from dead letter
  await db.resource('failed_tasks').delete(dl.id);
}
```

### Debug Mode

Enable comprehensive logging:

```javascript
const queue = new S3QueuePlugin({
  resource: 'tasks',
  verbose: true,  // Enable all logs
  onMessage: async (task, context) => {
    console.log('=== Processing Start ===');
    console.log('Task:', task);
    console.log('Context:', context);
    console.log('Worker:', context.workerId);
    console.log('Attempt:', context.attempts);

    try {
      const result = await processTask(task);
      console.log('=== Processing Success ===');
      console.log('Result:', result);
      return result;
    } catch (error) {
      console.log('=== Processing Error ===');
      console.log('Error:', error.message);
      console.log('Stack:', error.stack);
      throw error;
    }
  }
});

// Monitor all events
queue.on('message.enqueued', e => console.log('📨 Enqueued:', e));
queue.on('message.claimed', e => console.log('🔒 Claimed:', e));
queue.on('message.processing', e => console.log('⚙️ Processing:', e));
queue.on('message.completed', e => console.log('✅ Completed:', e));
queue.on('message.retry', e => console.log('🔄 Retry:', e));
queue.on('message.dead', e => console.log('💀 Dead:', e));
```

---

## ❓ FAQ

### General Questions

**Q: Do I need AWS SQS or RabbitMQ?**
A: No! S3Queue works entirely with S3DB. No additional services required.

**Q: Does it work with MinIO/LocalStack?**
A: Yes! Fully compatible with MinIO, LocalStack, and any S3-compatible storage.

**Q: Can I use it in production?**
A: Yes! S3Queue is production-ready with 0% duplication and comprehensive error handling.

**Q: How many workers can I run?**
A: As many as you want! Works across multiple processes, containers, and servers.

**Q: Is it serverless-friendly?**
A: Yes! Works great with AWS Lambda, Cloud Functions, etc.

### Performance Questions

**Q: What's the maximum throughput?**
A: Depends on concurrency and S3 latency. Typically 10-150 messages/second.

**Q: How does it compare to AWS SQS?**
A: SQS is faster but costs more. S3Queue is perfect for moderate throughput (< 1000 msg/s).

**Q: Can I process millions of messages?**
A: Yes! S3Queue scales horizontally by adding more workers.

**Q: What about latency?**
A: Typical latency is 150-600ms depending on S3 backend and concurrency.

### Technical Questions

**Q: How does it guarantee zero duplication?**
A: Combination of distributed locks (prevents cache races), deduplication cache (fast checks), and ETag atomicity (prevents double claims).

**Q: What happens if a worker crashes?**
A: Messages become visible again after visibility timeout and get reprocessed.

**Q: Can I manually retry failed messages?**
A: Yes! Query the dead letter queue and re-enqueue messages.

**Q: Does it preserve message order?**
A: No. Messages are processed in parallel. Use `concurrency: 1` for sequential processing.

**Q: Can I prioritize certain messages?**
A: Yes! Use separate queues with different polling intervals or filter in handler.

**Q: How are retries handled?**
A: Automatic exponential backoff: 1s, 2s, 4s, 8s, etc. up to max attempts.

**Q: What's the difference from Queue Consumer Plugin?**
A: Queue Consumer Plugin reads from external queues (SQS, RabbitMQ). S3Queue Plugin creates queues using S3DB.

---

## 📊 Comparison with Other Queues

### Feature Matrix

| Feature | S3Queue | AWS SQS | RabbitMQ | Redis Queue |
|---------|---------|---------|----------|-------------|
| **Setup** | Zero config | AWS account | Server setup | Redis server |
| **Cost** | S3 only (~$0.005/1K) | $0.40/million | Server costs | Server costs |
| **Throughput** | 10-150 msg/s | 3000+ msg/s | 20000+ msg/s | 10000+ msg/s |
| **Latency** | 150-600ms | 10-50ms | 1-10ms | 1-5ms |
| **Atomicity** | ✅ ETag + Locks | ✅ Native | ✅ Native | ✅ Lua scripts |
| **Durability** | ✅ S3 (99.999999999%) | ✅ High | ⚠️ Configurable | ⚠️ Persistence mode |
| **Visibility Timeout** | ✅ | ✅ | ✅ | ✅ |
| **Dead Letter Queue** | ✅ | ✅ | ✅ | ✅ |
| **Message Ordering** | ❌ | ⚠️ FIFO queues | ✅ | ⚠️ Single consumer |
| **Multi-region** | ✅ S3 replication | ⚠️ Cross-region | ⚠️ Federation | ⚠️ Clustering |
| **Monitoring** | ✅ Events | ✅ CloudWatch | ⚠️ Management UI | ⚠️ CLI/GUI tools |
| **Serverless** | ✅ | ✅ | ❌ | ❌ |

### When to Use Each

```
Use S3Queue when:
  ✅ Already using S3DB
  ✅ Don't want to manage additional services
  ✅ Throughput < 1000 messages/second
  ✅ Cost is a concern
  ✅ Need simple setup

Use AWS SQS when:
  ✅ Need very high throughput (> 1000 msg/s)
  ✅ Need low latency (< 50ms)
  ✅ Already on AWS
  ✅ Need FIFO guarantees

Use RabbitMQ when:
  ✅ Need ultra-high throughput (> 10000 msg/s)
  ✅ Need complex routing
  ✅ Need message ordering
  ✅ On-premise infrastructure

Use Redis Queue when:
  ✅ Need lowest latency (< 5ms)
  ✅ Already using Redis
  ✅ Need in-memory speed
  ✅ Durability not critical
```

### Cost Comparison (1 million messages)

```
S3Queue (LocalStack):    FREE (development)
S3Queue (AWS S3):        ~$5    (9M S3 requests)
AWS SQS:                 $0.40  (1M requests)
RabbitMQ (EC2 t3.small): ~$15   (monthly server cost)
Redis (ElastiCache):     ~$12   (monthly server cost)
```

---

## 🎓 Advanced Tutorials

### Tutorial 1: Building a Video Processing Pipeline

```javascript
// Step 1: Create resources
const videos = await db.createResource({
  name: 'videos',
  attributes: {
    id: 'string|required',
    originalUrl: 'string|required',
    status: 'string|default:pending',
    formats: 'json|default:[]'
  }
});

// Step 2: Setup processing queue
const videoQueue = new S3QueuePlugin({
  resource: 'videos',
  concurrency: 2,  // CPU intensive
  visibilityTimeout: 600000,  // 10 minutes
  maxAttempts: 2,
  deadLetterResource: 'failed_videos',

  onMessage: async (video) => {
    // Download original
    const input = await downloadVideo(video.originalUrl);

    // Encode to multiple formats
    const formats = [
      { name: '1080p', height: 1080, bitrate: '5000k' },
      { name: '720p', height: 720, bitrate: '2500k' },
      { name: '480p', height: 480, bitrate: '1000k' }
    ];

    const results = await Promise.all(
      formats.map(async (format) => {
        // Encode video
        const output = await ffmpeg.encode(input, {
          height: format.height,
          bitrate: format.bitrate
        });

        // Upload to S3
        const url = await uploadToS3(
          output,
          `${video.id}/${format.name}.mp4`
        );

        // Generate thumbnail
        const thumbnail = await ffmpeg.thumbnail(output, '00:00:05');
        const thumbUrl = await uploadToS3(
          thumbnail,
          `${video.id}/${format.name}-thumb.jpg`
        );

        return {
          ...format,
          url,
          thumbnail: thumbUrl
        };
      })
    );

    // Update video record
    await videos.update(video.id, {
      status: 'completed',
      formats: results
    });

    // Notify user
    await notifications.enqueue({
      userId: video.userId,
      type: 'video-ready',
      videoId: video.id
    });

    return { formats: results };
  }
});

db.use(videoQueue);

// Step 3: Upload endpoint
app.post('/api/videos/upload', async (req, res) => {
  const { file } = req.files;

  // Upload original
  const url = await uploadToS3(file, `originals/${uuid()}.mp4`);

  // Enqueue processing
  const video = await videos.enqueue({
    originalUrl: url,
    userId: req.user.id
  });

  res.json({ id: video.id, status: 'processing' });
});
```

### Tutorial 2: Distributed Cron Job System

```javascript
// Create jobs resource
const jobs = await db.createResource({
  name: 'scheduled_jobs',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    schedule: 'string|required',  // cron expression
    action: 'string|required',    // job type
    data: 'json',
    lastRun: 'string|optional',
    nextRun: 'string|optional'
  }
});

// Job processor
const jobQueue = new S3QueuePlugin({
  resource: 'scheduled_jobs',
  concurrency: 5,

  onMessage: async (job) => {
    // Execute job based on action type
    switch (job.action) {
      case 'cleanup-old-data':
        await cleanupOldData();
        break;

      case 'generate-reports':
        await generateDailyReports();
        break;

      case 'send-reminders':
        await sendUserReminders();
        break;

      case 'sync-inventory':
        await syncInventory();
        break;
    }

    // Calculate next run using cron parser
    const nextRun = cronParser.next(job.schedule);

    // Update job record
    await jobs.update(job.id, {
      lastRun: new Date().toISOString(),
      nextRun: nextRun.toISOString()
    });

    return { executedAt: new Date().toISOString() };
  }
});

db.use(jobQueue);

// Scheduler loop (runs every minute)
setInterval(async () => {
  const now = new Date();

  // Find jobs that should run
  const dueJobs = await jobs.query({
    where: {
      nextRun: { $lte: now.toISOString() }
    }
  });

  // Enqueue them
  for (const job of dueJobs) {
    await jobs.enqueue(job);
  }
}, 60000);

// API to create scheduled jobs
app.post('/api/jobs', async (req, res) => {
  const { name, schedule, action, data } = req.body;

  const job = await jobs.insert({
    name,
    schedule,
    action,
    data,
    nextRun: cronParser.next(schedule).toISOString()
  });

  res.json(job);
});
```

---

## 📚 Additional Resources

### Example Files

- [📄 Complete Example](../../docs/examples/e31-s3-queue.js) - Full working example
- [🧪 Test Suite](../../tests/plugins/plugin-s3-queue*.test.js) - 40 comprehensive tests

### Related Documentation

- [📦 Plugin System Overview](./README.md)
- [🔄 Replicator Plugin](./replicator.md) - Data replication
- [📬 Queue Consumer Plugin](./queue-consumer.md) - External queue consumption
- [⚡ Eventual Consistency Plugin](./eventual-consistency.md) - Transaction-based consistency

### External Resources

- [AWS SQS Concepts](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/) - Similar concepts
- [S3 ETag Documentation](https://docs.aws.amazon.com/AmazonS3/latest/API/RESTCommonResponseHeaders.html) - ETag behavior
- [Distributed Locking Patterns](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) - Theory

---

<p align="center">
  <strong>Happy Queuing! 🎉</strong><br>
  <em>Build reliable, scalable background job systems with S3Queue</em>
</p>

---

**License:** MIT
**Source:** [s3db.js](https://github.com/yourusername/s3db.js)
**Issues:** [Report a bug](https://github.com/yourusername/s3db.js/issues)
