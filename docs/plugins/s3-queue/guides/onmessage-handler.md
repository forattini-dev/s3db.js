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
import { PluginError } from 's3db.js';

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
      throw new PluginError('Webhook endpoint rejected the payload', {
        statusCode: response.status,
        retriable: response.status >= 500,
        suggestion: response.status >= 500
          ? 'Remote endpoint returned a 5xx. S3Queue will retry; ensure the service recovers.'
          : 'Inspect the remote service logs and payload to fix validation issues before retrying.',
        metadata: {
          endpoint: webhook.url,
          statusText: response.statusText
        }
      });
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
import { PluginError } from 's3db.js';

const orderQueue = new S3QueuePlugin({
  resource: 'orders',
  concurrency: 10,

  onMessage: async (order, context) => {
    console.log(`Processing order ${order.id} (attempt ${context.attempt})`);

    // Step 1: Validate inventory
    const inventory = await checkInventory(order.items);
    if (!inventory.available) {
      throw new PluginError('Order cannot be fulfilled: inventory unavailable', {
        statusCode: 409,
        retriable: false,
        suggestion: 'Restock the missing SKUs or route the order to a fallback warehouse before retrying.',
        metadata: { missingSkus: inventory.missing }
      });
    }

    // Step 2: Process payment
    const payment = await processPayment({
      amount: order.total,
      customerId: order.customerId,
      paymentMethod: order.paymentMethod
    });

    if (!payment.success) {
      throw new PluginError('Payment processor declined the transaction', {
        statusCode: payment.status ?? 402,
        retriable: payment.retriable ?? false,
        suggestion: payment.retriable
          ? 'Allow S3Queue to retry after the backoff window or try a backup processor.'
          : 'Ask the customer to supply a new payment method or authorize the charge.',
        metadata: { attemptId: payment.id, reason: payment.error }
      });
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
    throw new PluginError('Upstream API returned a non-2xx response', {
      statusCode: response.status,
      retriable: response.status >= 500,
      suggestion: response.status >= 500
        ? 'Leave the message in-flight so the automatic retry kicks in.'
        : 'Fix the request payload or authentication before retrying.',
      metadata: { endpoint: response.url }
    });
    // → Will retry with exponential backoff when retriable=true
  }

  return { success: true };
}
```

### Error Handling in `onMessage`

S3QueuePlugin now throws `QueueError` (a `PluginError`) when queue messages are malformed or when the target resource is unavailable. When you want to fail deliberately from inside `onMessage`, throw your own `PluginError` (import it from `s3db.js`) so operators receive clear guidance.

```javascript
if (error.name === 'QueueError') {
  console.error('Status:', error.statusCode, 'Retriable?', error.retriable);
  console.error('Suggestion:', error.suggestion);
}
```

| Scenario | Status | Retriable? | Message | Suggested Fix |
|----------|--------|------------|---------|---------------|
| Missing `resource` or `action` | 400 | `false` | `Resource not found in message` / `Action not found in message` | Ensure the producer includes both fields before enqueueing. |
| Unknown resource | 404 | `false` | `Resource '<name>' not found` | Create the resource (or adjust naming) before processing messages. |
| Unsupported action | 400 | `false` | `Unsupported action '<name>'` | Use `insert`, `update`, `delete`, or extend the consumer to handle custom actions. |
| Queue storage locked | 423 | `true` | `Message already claimed by worker-X` | Let the default retry run; the lock TTL will release. |

Call `error.toJson()` whenever you send telemetry—the payload already contains `suggestion`, `docs`, `metadata`, and `retriable` so your dashboards remain actionable.

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
