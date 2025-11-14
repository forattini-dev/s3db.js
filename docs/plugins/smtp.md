# 📧 SMTP Plugin

> **Enterprise-grade email delivery with support for 4 major providers plus in-process SMTP server. Sends emails, processes webhooks, and tracks delivery status in S3DB.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Multi-provider email sending (SendGrid, AWS SES, Mailgun, Postmark) with automatic retry, templates, webhooks, and S3DB storage.**

**1 line to get started:**
```javascript
await db.usePlugin(new SMTPPlugin({ provider: 'sendgrid', from: 'noreply@example.com', sendgridApiKey: 'SG.xxx' }));
```

**Production-ready setup:**
```javascript
await db.usePlugin(new SMTPPlugin({
  mode: 'relay',                         // 'relay' or 'server'
  provider: 'sendgrid',                  // SendGrid, AWS SES, Mailgun, Postmark
  from: 'noreply@yourdomain.com',       // Sender address
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridWebhookSecret: process.env.SENDGRID_WEBHOOK_SECRET,
  emailResource: 'emails',               // S3DB resource name
  rateLimit: 500,                        // emails/minute
  maxRetries: 3                          // max retry attempts
}));

// Send email
const result = await smtpPlugin.sendEmail({
  to: 'user@example.com',
  subject: 'Hello!',
  body: 'Email content'
});
```

**Key features:**
- ✅ **4 Email Providers** - SendGrid, AWS SES, Mailgun, Postmark
- ✅ **Webhook Processing** - Bounce, complaint, delivery, open, click events
- ✅ **Handlebars Templates** - Custom helpers, partials, caching
- ✅ **Automatic Retry** - Exponential backoff with jitter
- ✅ **Rate Limiting** - Token bucket algorithm with backpressure
- ✅ **S3DB Integration** - Email status tracking and querying
- ✅ **Server Mode** - Receive incoming emails from external systems

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [📦 Dependencies](#-dependencies)
4. [Usage Journey](#usage-journey)
   - [Level 1: Basic Email Sending](#level-1-basic-email-sending)
   - [Level 2: Templated Emails](#level-2-templated-emails)
   - [Level 3: Webhook Processing](#level-3-webhook-processing)
   - [Level 4: Rate Limiting & Retry](#level-4-rate-limiting--retry)
   - [Level 5: Production Setup](#level-5-production-setup)
5. [📊 Configuration Reference](#-configuration-reference)
6. [📚 Configuration Examples](#-configuration-examples)
7. [🔧 API Reference](#-api-reference)
8. [✅ Best Practices](#-best-practices)
9. [🚨 Error Handling](#-error-handling)
10. [🔗 See Also](#-see-also)
11. [❓ FAQ](#-faq)

---

## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { SMTPPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Create plugin with essential options
const smtpPlugin = new SMTPPlugin({
  mode: 'relay',
  provider: 'sendgrid',
  from: 'noreply@yourdomain.com',
  sendgridApiKey: process.env.SENDGRID_API_KEY
});

await db.usePlugin(smtpPlugin);
await db.connect();

// Send an email
const result = await smtpPlugin.sendEmail({
  to: 'user@example.com',
  subject: 'Hello World',
  body: 'This is a test email'
});

console.log(`Email sent with ID: ${result.id}`);
await db.disconnect();
```

---

## 📦 Dependencies

**Required Peer Dependencies:**
```bash
pnpm install nodemailer
```

**Optional (for Server Mode):**
```bash
pnpm install mailparser smtp-server
```

| Dependency | Version | Purpose | Optional |
|------------|---------|---------|----------|
| `nodemailer` | `^6.9.0` | SMTP connection handling | No |
| `mailparser` | `^3.6.0` | Parse incoming emails | Yes (Server mode only) |
| `smtp-server` | `^3.13.0` | In-process SMTP listener | Yes (Server mode only) |

**Why these dependencies?**
- **nodemailer**: Industry standard for SMTP operations across all providers
- **mailparser**: Parses RFC 5322 emails for Server mode
- **smtp-server**: Provides in-process SMTP listener for Server mode

---

## Usage Journey

### Level 1: Basic Email Sending

Start with simple email sending via an external provider.

```javascript
import { SMTPPlugin } from 's3db.js/plugins';

const plugin = new SMTPPlugin({
  mode: 'relay',
  provider: 'sendgrid',
  from: 'noreply@example.com',
  sendgridApiKey: 'SG.xxx...'
});

await db.usePlugin(plugin);

// Send simple email
const result = await plugin.sendEmail({
  to: 'recipient@example.com',
  subject: 'Welcome',
  body: 'Welcome to our service!'
});

console.log('Email ID:', result.id);      // msg-123
console.log('Status:', result.status);    // 'pending'
```

**What's happening:**
- Plugin establishes connection to SendGrid SMTP
- Email is queued with unique ID
- Automatic S3DB storage creates `emails` resource entry
- Status starts as `pending` until delivery confirmed

---

### Level 2: Templated Emails

Use Handlebars templates for dynamic email content.

```javascript
// Register template
plugin.registerTemplatePartial('welcome', `---
subject: Welcome {{name}}!
html: true
---
<h1>Hi {{name}}</h1>
<p>Thank you for joining {{company}}!</p>
<p><a href="{{confirmLink}}">Confirm Email</a></p>
`);

// Send templated email
const result = await plugin.sendTemplatedEmail({
  to: 'john@example.com',
  templateId: 'welcome',
  templateData: {
    name: 'John',
    company: 'Acme Inc',
    confirmLink: 'https://example.com/confirm/123'
  }
});

console.log('Templated email sent:', result.id);
```

**New concepts:**
- YAML front matter for email metadata (subject, html flag)
- Handlebars syntax for variable substitution
- Template caching for performance (40-60% faster)
- Built-in helpers: uppercase, lowercase, eq, default, pluralize, etc.

---

### Level 3: Webhook Processing

Handle provider events (bounce, complaint, delivery, open, click).

```javascript
// Register handlers for webhook events
plugin.onWebhookEvent('bounce', async (event) => {
  console.log(`Email bounced: ${event.recipient}`);
  console.log(`Bounce type: ${event.bounceType}`); // hard or soft

  // Add to suppression list
  if (event.bounceType === 'hard') {
    await db.resources.suppressions.insert({
      email: event.recipient,
      reason: 'hard_bounce'
    });
  }
});

plugin.onWebhookEvent('complaint', async (event) => {
  console.log(`Complaint from: ${event.recipient}`);
  // Unsubscribe user
});

// Setup webhook endpoint (Express)
app.post('/webhooks/smtp/sendgrid', async (req, res) => {
  const result = await plugin.processWebhook(req.body, req.headers);
  res.json({ success: true, eventsProcessed: result.eventsProcessed });
});
```

**New concepts:**
- Webhook event types: bounce, complaint, delivery, open, click
- Signature validation for security
- Automatic S3DB email status updates
- Event-driven architecture

---

### Level 4: Rate Limiting & Retry

Configure rate limiting and automatic retry behavior.

```javascript
const plugin = new SMTPPlugin({
  mode: 'relay',
  provider: 'sendgrid',
  from: 'noreply@example.com',
  sendgridApiKey: 'SG.xxx',

  // Rate limiting
  rateLimit: 500,                // 500 emails/minute

  // Retry configuration
  maxRetries: 3,                 // Max 3 attempts
  retryDelay: 1000,              // Start with 1 second
  retryMultiplier: 1.5           // 1s → 1.5s → 2.25s
});

// Plugin automatically retries on transient errors
try {
  const result = await plugin.sendEmail({
    to: 'unreliable@example.com',
    subject: 'Will retry if fails',
    body: 'Content'
  });
} catch (error) {
  if (error.isRetriable) {
    // Will be retried automatically
    console.log('Retrying:', error.message);
  } else {
    // Permanent error, not retried
    console.error('Failed:', error.message);
  }
}
```

**New concepts:**
- Token bucket rate limiting
- Retriable vs permanent errors
- Exponential backoff with jitter
- Backpressure handling (HTTP 429)

---

### Level 5: Production Setup

Complete production configuration with monitoring and error handling.

```javascript
const plugin = new SMTPPlugin({
  mode: 'relay',
  provider: 'sendgrid',
  from: process.env.SMTP_FROM_ADDRESS,
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridWebhookSecret: process.env.SENDGRID_WEBHOOK_SECRET,

  // Rate limiting
  rateLimit: 500,
  maxRetries: 3,

  // Email resource
  emailResource: 'emails',

  // Monitoring
  verbose: process.env.NODE_ENV === 'development'
});

await db.usePlugin(plugin);

// Register all webhook handlers
plugin.onWebhookEvent('bounce', async (event) => {
  await handleBounce(event);
});

plugin.onWebhookEvent('complaint', async (event) => {
  await handleComplaint(event);
});

plugin.onWebhookEvent('delivery', async (event) => {
  console.log(`Delivered to ${event.recipient}`);
});

// Send email with error handling
async function sendEmailSafely(options) {
  try {
    const result = await plugin.sendEmail(options);
    console.log(`Email sent: ${result.id}`);
    return result;
  } catch (error) {
    console.error(`Email failed: ${error.message}`);
    // Alert monitoring service
    await alertMonitoring({
      severity: 'error',
      message: error.message,
      recipient: options.to
    });
    throw error;
  }
}

// Monitor delivery rate
setInterval(async () => {
  const delivered = await db.resources.emails.query({
    status: 'delivered',
    createdAt: { $gte: oneHourAgo }
  });
  console.log(`Delivered in last hour: ${delivered.length}`);
}, 60000);
```

**Production considerations:**
- Environment variables for all secrets
- Comprehensive error handling
- Webhook security validation
- Monitoring and metrics
- Graceful degradation

---

## 📊 Configuration Reference

Complete configuration object with all available options:

```javascript
new SMTPPlugin({
  // ============================================
  // CORE OPTIONS
  // ============================================
  mode: 'relay',                         // 'relay' or 'server' (default: 'relay')
  provider: 'sendgrid',                  // 'sendgrid', 'aws-ses', 'mailgun', 'postmark'
  from: 'noreply@yourdomain.com',       // Sender email address (required)

  // ============================================
  // RELAY MODE OPTIONS (when mode: 'relay')
  // ============================================
  sendgridApiKey: 'SG.xxx...',           // SendGrid API key
  sendgridWebhookSecret: 'whsec_xxx',   // SendGrid webhook secret
  awsRegion: 'us-east-1',               // AWS region for SES
  awsAccessKeyId: 'AKIA...',            // AWS access key
  awsSecretAccessKey: 'xxx...',         // AWS secret key
  mailgunApiKey: 'xxx...',              // Mailgun API key
  mailgunDomain: 'yourdomain.mailgun.org', // Mailgun domain
  mailgunWebhookSecret: 'xxx...',       // Mailgun webhook secret
  postmarkServerToken: 'xxx...',        // Postmark server token
  postmarkWebhookSecret: 'xxx...',      // Postmark webhook secret

  // ============================================
  // RETRY & RATE LIMITING
  // ============================================
  maxRetries: 3,                         // Max retry attempts (default: 3)
  retryDelay: 1000,                      // Initial delay in ms (default: 1000)
  retryMultiplier: 1.5,                  // Backoff multiplier (default: 1.5)
  rateLimit: 100,                        // Emails per minute (default: 100)

  // ============================================
  // EMAIL STORAGE
  // ============================================
  emailResource: 'emails',               // S3DB resource name (default: 'emails')

  // ============================================
  // TEMPLATES
  // ============================================
  templateEngine: 'handlebars',          // Template engine (default: 'handlebars')
  templateCacheEnabled: true,            // Cache compiled templates (default: true)
  templateCacheMaxSize: 500,             // Max templates in cache (default: 500)

  // ============================================
  // SERVER MODE OPTIONS (when mode: 'server')
  // ============================================
  serverPort: 25,                        // SMTP server port (default: 25)
  serverHost: '0.0.0.0',                // Listen address (default: '0.0.0.0')
  serverSecure: false,                   // Require TLS (default: false)
  serverAuth: {                          // SMTP authentication
    username: 'postmaster',
    password: 'secret'
  },
  serverMaxConnections: 50,              // Max concurrent connections (default: 50)
  serverMaxMessageSize: 25 * 1024 * 1024, // Max email size (default: 25MB)
  serverMaxRecipients: 100,              // Max recipients per email (default: 100)

  // ============================================
  // SERVER MODE CALLBACKS
  // ============================================
  onMailFrom: async (address) => true,   // Validate sender
  onRcptTo: async (address) => true,    // Validate recipient
  onData: async (stream) => true,        // Process email before storing

  // ============================================
  // LOGGING
  // ============================================
  verbose: false                         // Enable debug logging (default: false)
})
```

**Detailed Options Table:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `'relay'` | Operating mode: `'relay'` (send via provider) or `'server'` (listen for incoming) |
| `provider` | string | `'sendgrid'` | Email provider: SendGrid, AWS SES, Mailgun, Postmark |
| `from` | string | — | Sender email address (required for relay mode) |
| `maxRetries` | number | `3` | Maximum retry attempts for failed emails |
| `retryDelay` | number | `1000` | Initial retry delay in milliseconds |
| `retryMultiplier` | number | `1.5` | Exponential backoff multiplier for retries |
| `rateLimit` | number | `100` | Maximum emails per minute (rate limiting) |
| `emailResource` | string | `'emails'` | S3DB resource name for email storage |
| `templateEngine` | string | `'handlebars'` | Template engine type |
| `templateCacheEnabled` | boolean | `true` | Enable template compilation caching |
| `serverPort` | number | `25` | SMTP server port (for server mode) |
| `verbose` | boolean | `false` | Enable verbose logging |

---

## 📚 Configuration Examples

### Use Case 1: SendGrid with Webhooks

For transactional emails with bounce/complaint tracking.

```javascript
new SMTPPlugin({
  mode: 'relay',
  provider: 'sendgrid',
  from: 'noreply@yourdomain.com',
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  sendgridWebhookSecret: process.env.SENDGRID_WEBHOOK_SECRET,
  emailResource: 'emails',
  rateLimit: 500
})
```

**Why this configuration:**
- SendGrid recommended for best feature set
- Webhook secret enables bounce/complaint processing
- Higher rate limit for production volume

---

### Use Case 2: AWS SES (Cost-Optimized)

Cheapest option for high-volume email.

```javascript
new SMTPPlugin({
  mode: 'relay',
  provider: 'aws-ses',
  from: 'noreply@yourdomain.com',
  awsRegion: 'us-east-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY,
  awsSecretAccessKey: process.env.AWS_SECRET_KEY,
  rateLimit: 200  // SES has stricter initial limits
})
```

**Why this configuration:**
- Most cost-effective for large volumes
- AWS credentials from environment
- Conservative rate limit for SES

---

### Use Case 3: Server Mode (Email Gateway)

Receive emails from external systems.

```javascript
new SMTPPlugin({
  mode: 'server',
  serverPort: 25,
  serverHost: '0.0.0.0',
  serverAuth: {
    username: 'postmaster',
    password: process.env.SMTP_PASSWORD
  },
  emailResource: 'received_emails',
  onMailFrom: async (address) => {
    // Validate sender
    return address.endsWith('@authorized-domain.com');
  },
  onRcptTo: async (address) => {
    // Validate recipient
    const user = await db.resources.users.get(address.split('@')[0]);
    return user?.enabled || false;
  }
})
```

**Why this configuration:**
- Server mode for receiving emails
- Custom validation callbacks
- Different resource for received emails

---

### Use Case 4: Development (Memory Efficient)

Low-cost development setup.

```javascript
new SMTPPlugin({
  mode: 'relay',
  provider: 'mailgun',
  from: 'dev@example.com',
  mailgunApiKey: process.env.MAILGUN_API_KEY,
  rateLimit: 10,  // Conservative for testing
  verbose: true   // Debug logging
})
```

---

## 🔧 API Reference

### Plugin Methods

#### `sendEmail(options): Promise<EmailRecord>`

Send a simple email via the relay provider.

**Parameters:**
- `to` (string | string[], required): Recipient email address(es)
- `subject` (string, required): Email subject line
- `body` (string, required): Plain text body content
- `html` (string, optional): HTML body content
- `from` (string, optional): Sender address (defaults to configured)
- `cc` (string[], optional): CC recipients
- `bcc` (string[], optional): BCC recipients
- `attachments` (Attachment[], optional): File attachments
- `maxAttempts` (number, optional): Override retry attempts

**Returns:** `Promise<EmailRecord>` - Email record with id, status, metadata

**Example:**
```javascript
const result = await plugin.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Thanks for signing up!',
  html: '<p>Thanks for signing up!</p>'
});
console.log(result.id);  // Email ID in S3DB
```

**Throws:**
- `RateLimitError` - When rate limit exceeded (retriable)
- `AuthenticationError` - When credentials invalid (non-retriable)
- `RecipientError` - When recipient invalid (non-retriable)
- `ConnectionError` - When connection fails (retriable)

---

#### `sendTemplatedEmail(options): Promise<EmailRecord>`

Send email using Handlebars template.

**Parameters:**
- `to` (string | string[], required): Recipient(s)
- `templateId` (string, required): Registered template ID
- `templateData` (object, optional): Template variables
- `subject` (string, optional): Override template subject
- `maxAttempts` (number, optional): Override retry attempts

**Returns:** `Promise<EmailRecord>` - Email record

---

#### `processWebhook(payload, headers): Promise<WebhookResult>`

Process incoming webhook from email provider.

**Parameters:**
- `payload` (object, required): Webhook payload from provider
- `headers` (object, required): HTTP headers for signature validation

**Returns:** `Promise<{success: boolean, eventsProcessed: number}>`

---

#### `onWebhookEvent(eventType, handler): void`

Register handler for webhook event.

**Parameters:**
- `eventType` (string, required): Event type: 'bounce', 'complaint', 'delivery', 'open', 'click'
- `handler` (async function, required): Handler function

**Example:**
```javascript
plugin.onWebhookEvent('bounce', async (event) => {
  console.log(`Bounced: ${event.recipient}`);
});
```

---

#### `registerTemplatePartial(id, template): void`

Register Handlebars template partial.

**Parameters:**
- `id` (string, required): Template ID
- `template` (string, required): Handlebars template with YAML front matter

---

#### `registerHelper(name, fn): void`

Register custom Handlebars helper.

**Parameters:**
- `name` (string, required): Helper name
- `fn` (function, required): Helper implementation

---

### Events

#### `event.sent`

Emitted when email successfully sent.

**Payload:**
```javascript
{
  emailId: 'msg-123',
  recipient: 'user@example.com',
  timestamp: Date
}
```

---

#### `event.bounce`

Emitted when email bounces (before webhook processing).

**Payload:**
```javascript
{
  emailId: 'msg-123',
  recipient: 'user@example.com',
  bounceType: 'hard',
  reason: 'Invalid address'
}
```

---

## ✅ Best Practices

### Do's ✅

1. **Use environment variables for credentials**
   ```javascript
   // ✅ Good
   const plugin = new SMTPPlugin({
     sendgridApiKey: process.env.SENDGRID_API_KEY
   });
   ```

2. **Register webhook handlers on startup**
   ```javascript
   // ✅ Good
   plugin.onWebhookEvent('bounce', handleBounce);
   plugin.onWebhookEvent('complaint', handleComplaint);
   ```

3. **Handle rate limiting gracefully**
   ```javascript
   // ✅ Good
   try {
     await plugin.sendEmail({...});
   } catch (error) {
     if (error instanceof RateLimitError) {
       // Queue for later retry
     }
   }
   ```

4. **Use templates for dynamic content**
   ```javascript
   // ✅ Good
   await plugin.sendTemplatedEmail({
     to: user.email,
     templateId: 'welcome',
     templateData: { name: user.name }
   });
   ```

5. **Monitor delivery metrics**
   ```javascript
   // ✅ Good
   const delivered = await db.resources.emails.query({
     status: 'delivered',
     createdAt: { $gte: lastHour }
   });
   ```

---

### Don'ts ❌

1. **Don't hardcode API keys**
   ```javascript
   // ❌ Bad
   sendgridApiKey: 'SG.xxx...'

   // ✅ Correct
   sendgridApiKey: process.env.SENDGRID_API_KEY
   ```

2. **Don't ignore rate limiting**
   ```javascript
   // ❌ Bad
   for (let user of million Users) {
     await plugin.sendEmail({ to: user.email });  // Will hit limit
   }

   // ✅ Correct
   const queue = new PQueue({ concurrency: 5, interval: 60000, maxSize: 100 });
   for (let user of users) {
     await queue.add(() => plugin.sendEmail({ to: user.email }));
   }
   ```

3. **Don't send to unverified emails**
   ```javascript
   // ❌ Bad
   await plugin.sendEmail({ to: unverifiedEmail });

   // ✅ Correct
   if (user.emailVerified) {
     await plugin.sendEmail({ to: user.email });
   }
   ```

---

### Performance Tips

- **Use template caching**: 40-60% faster renders (enabled by default)
- **Batch webhook processing**: Process multiple events together
- **Query by partition**: Use `byStatus` partition for fast lookups
- **Archive old emails**: Use TTL plugin to remove emails > 90 days

---

### Security Considerations

- **Validate webhook signatures**: Prevents spoofed events
- **Use TLS/SSL**: Enable `serverSecure: true` in server mode
- **Rotate webhook secrets**: Regularly update provider secrets
- **Rate limit by IP**: Prevent abuse in server mode

---

## 🚨 Error Handling

### Common Errors

#### AuthenticationError

**Problem:** Invalid or expired API key.

**Error message:**
```
Error: Authentication failed: Invalid API key
```

**Solution:**
```javascript
try {
  await plugin.sendEmail({...});
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Check SENDGRID_API_KEY environment variable');
  }
}
```

**Prevention:**
- Verify API key with provider
- Check environment variables
- Rotate credentials regularly

---

#### RateLimitError

**Problem:** Exceeded configured rate limit.

**Error message:**
```
Error: Rate limit exceeded: 500 emails/minute
```

**Solution:**
```javascript
try {
  await plugin.sendEmail({...});
} catch (error) {
  if (error instanceof RateLimitError) {
    // Queue for later
    queue.push(email);
  }
}
```

**Prevention:**
- Implement queue system
- Monitor sent rate
- Increase limit if needed

---

### Troubleshooting

#### Issue 1: Bounces not being processed

**Diagnosis:**
1. Check webhook endpoint is accessible
2. Verify webhook secret matches
3. Confirm handler registered

**Fix:**
```javascript
// Verify webhook secret
console.log('Secret:', process.env.SENDGRID_WEBHOOK_SECRET);

// Register handler
plugin.onWebhookEvent('bounce', async (event) => {
  console.log('Bounce:', event);
});

// Test webhook
curl -X POST http://localhost:3000/webhooks/smtp/sendgrid \
  -H 'Content-Type: application/json' \
  -d '[{"event":"bounce","email":"test@example.com"}]'
```

---

## 🔗 See Also

- [Email Server Storage](../SMTP_SERVER_STORAGE.md) - Server mode storage architecture
- [Email Templates](../../mrt-shortner/src/integrations/email-templates.js) - Pre-configured templates
- [MRT Shortner Integration](../../mrt-shortner/docs/SMTP_PLUGIN_INTEGRATION.md) - Framework integration guide
- [Production Deployment](../../mrt-shortner/docs/SMTP_PRODUCTION_DEPLOYMENT.md) - Deploy to production

**Related Documentation:**
- [SendGrid Docs](https://docs.sendgrid.com/)
- [AWS SES Docs](https://docs.aws.amazon.com/ses/)
- [Mailgun Docs](https://documentation.mailgun.com/)
- [Postmark Docs](https://postmarkapp.com/api/overview)

---

## ❓ FAQ

### General

**Q: Which email provider should I choose?**

A: Recommended order: 1) SendGrid (best features), 2) AWS SES (cheapest), 3) Mailgun (flexible), 4) Postmark (premium).

---

**Q: Can I switch providers without losing email history?**

A: Yes! Email history is stored in S3DB. Switch provider config anytime without losing data.

```javascript
// Switch from SendGrid to AWS SES
const plugin = new SMTPPlugin({
  provider: 'aws-ses',  // Changed
  // Keep emailResource: 'emails' to reuse existing records
});
```

---

### Advanced

**Q: How do I implement custom email validation?**

A: In server mode, use `onRcptTo` callback.

```javascript
serverMode.onRcptTo = async (address) => {
  const [ok, user] = await tryFn(() =>
    db.resources.users.get(address.split('@')[0])
  );
  return ok && user.emailVerified;
};
```

---

**Q: Can I use different templates for different providers?**

A: Yes, templates are provider-agnostic. Register once, use everywhere.

```javascript
plugin.registerTemplatePartial('welcome', template);
// Works with SendGrid, SES, Mailgun, Postmark
```

---

### Performance

**Q: How fast are emails sent?**

A: **Latency (p50)**: 200-400ms, **(p95)**: 1-2s, **(p99)**: 3-5s (with retry)

---

**Q: What's the throughput limit?**

A: **Default**: 100 emails/minute, **Configurable**: 500+ recommended, **Provider limits vary**: Check their documentation.

---

### Troubleshooting

**Q: How do I debug webhook issues?**

A: Enable verbose logging and check event log.

```javascript
const plugin = new SMTPPlugin({
  verbose: true  // Enable debug logging
});

// Check event log
const events = plugin.getWebhookEventLog(10);
console.log(events);
```

---

**Q: What should I do if emails aren't delivering?**

A: 1) Check S3DB email status, 2) Verify webhook events, 3) Check provider account limits.

```javascript
// Check email status
const email = await db.resources.emails.get(emailId);
console.log('Status:', email.status);  // pending, delivered, bounced

// Check webhook events
const events = plugin.getWebhookEventLog(100);
```

---

**Q: How do I handle rate limiting?**

A: Use queue system with concurrency control.

```javascript
import PQueue from 'p-queue';

const queue = new PQueue({
  concurrency: 5,      // 5 parallel
  interval: 60000,     // per minute
  maxSize: 500         // emails/minute rate limit
});

for (let user of users) {
  await queue.add(() =>
    plugin.sendEmail({ to: user.email })
  );
}
```

---

