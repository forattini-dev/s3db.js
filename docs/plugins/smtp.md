# 📧 SMTP Plugin

> **Enterprise-grade email delivery with support for 4 major providers plus in-process SMTP server. Sends emails, processes webhooks, and tracks delivery status in S3DB.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Multi-provider email sending (SendGrid, AWS SES, Mailgun, Postmark) with automatic retry, templates, webhooks, and S3DB storage.**

**1 line to get started:**
```javascript
await db.usePlugin(new SMTPPlugin({
  driver: 'sendgrid',
  from: 'noreply@example.com',
  config: { apiKey: 'SG.xxx' }
}));
```

**Production-ready setup:**
```javascript
await db.usePlugin(new SMTPPlugin({
  mode: 'relay',                         // 'relay' or 'server'
  driver: 'sendgrid',                    // Driver: 'sendgrid', 'aws-ses', 'mailgun', 'postmark'
  from: 'noreply@yourdomain.com',       // Sender address
  config: {
    apiKey: process.env.SENDGRID_API_KEY,
    webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET
  },
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
7. [📬 Server Mode & Storage Architecture](#-server-mode--storage-architecture)
   - [Server Mode Overview](#server-mode-overview)
   - [Server Mode Configuration](#server-mode-configuration)
   - [Storage Architecture](#server-mode-storage-architecture)
   - [Use Cases](#server-mode-use-cases)
   - [Storage Optimization](#storage-optimization)
8. [🔧 API Reference](#-api-reference)
9. [✅ Best Practices](#-best-practices)
10. [🚨 Error Handling](#-error-handling)
11. [🔗 See Also](#-see-also)
12. [❓ FAQ](#-faq)

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
  driver: 'sendgrid',
  from: 'noreply@yourdomain.com',
  config: {
    apiKey: process.env.SENDGRID_API_KEY
  }
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
  driver: 'sendgrid',
  from: 'noreply@example.com',
  config: {
    apiKey: 'SG.xxx...'
  }
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
  driver: 'sendgrid',
  from: 'noreply@example.com',
  config: {
    apiKey: 'SG.xxx'
  },

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
  driver: 'sendgrid',
  from: process.env.SMTP_FROM_ADDRESS,
  config: {
    apiKey: process.env.SENDGRID_API_KEY,
    webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET
  },

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
  driver: 'sendgrid',                    // Driver: 'sendgrid', 'aws-ses', 'mailgun', 'postmark'
  from: 'noreply@yourdomain.com',       // Sender email address (required)

  // ============================================
  // PROVIDER CONFIG (when mode: 'relay')
  // ============================================
  config: {
    // SendGrid
    apiKey: 'SG.xxx...',                 // SendGrid API key
    webhookSecret: 'whsec_xxx',          // SendGrid webhook secret

    // AWS SES
    // region: 'us-east-1',               // AWS region
    // accessKeyId: 'AKIA...',            // AWS access key
    // secretAccessKey: 'xxx...',         // AWS secret key

    // Mailgun
    // apiKey: 'xxx...',                  // Mailgun API key
    // domain: 'yourdomain.mailgun.org',  // Mailgun domain
    // webhookSecret: 'xxx...',           // Mailgun webhook secret

    // Postmark
    // serverToken: 'xxx...',             // Postmark server token
    // webhookSecret: 'xxx...'            // Postmark webhook secret
  },

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
| `driver` | string | `'sendgrid'` | Email driver: 'sendgrid', 'aws-ses', 'mailgun', 'postmark' |
| `from` | string | — | Sender email address (required for relay mode) |
| `config` | object | — | Provider-specific configuration object |
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
  driver: 'sendgrid',
  from: 'noreply@yourdomain.com',
  config: {
    apiKey: process.env.SENDGRID_API_KEY,
    webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET
  },
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
  driver: 'aws-ses',
  from: 'noreply@yourdomain.com',
  config: {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  },
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
  driver: 'mailgun',
  from: 'dev@example.com',
  config: {
    apiKey: process.env.MAILGUN_API_KEY
  },
  rateLimit: 10,  // Conservative for testing
  verbose: true   // Debug logging
})
```

---

## 📬 Server Mode & Storage Architecture

### Server Mode Overview

The SMTP Plugin supports two operating modes:

1. **Relay Mode** (default) - Send emails via external SMTP providers
2. **Server Mode** - Run an in-process SMTP server to RECEIVE emails from other applications

In Server Mode, you can:
- ✅ Receive emails from external applications
- ✅ Process emails with custom validation
- ✅ Store emails in S3DB with full metadata
- ✅ Trigger webhooks when emails arrive
- ✅ Integrate with legacy systems via SMTP
- ✅ Implement custom spam filters

### Enabling Server Mode

```javascript
const plugin = new SMTPPlugin({
  mode: 'server',                    // Enable server mode
  serverPort: 25,                    // SMTP port (requires sudo)
  serverHost: '0.0.0.0',            // Listen on all interfaces
  serverAuth: {
    username: 'postmaster',
    password: 'secure-password'
  },
  emailResource: 'received_emails',  // Where to store emails
  verbose: true,

  // Custom validation callbacks
  onMailFrom: async (address) => {
    // Validate sender - return true to accept
    return address.includes('@authorized-domain.com');
  },

  onRcptTo: async (address) => {
    // Validate recipient - return true to accept
    const user = await db.resources.users.get(address);
    return user?.enabled || false;
  },

  onData: async (stream) => {
    // Process email before storing - return true to accept
    return true;
  }
});
```

### Server Mode Configuration

```javascript
const plugin = new SMTPPlugin({
  mode: 'server',

  // Network & Authentication
  serverPort: 25,                          // SMTP port
  serverHost: '0.0.0.0',                  // Bind address
  serverSecure: false,                     // TLS enabled

  // Authentication
  serverAuth: {
    username: 'postmaster',
    password: 'password',
    // Or multiple users:
    // credentials: [
    //   { username: 'admin', password: 'pass1' },
    //   { username: 'noreply', password: 'pass2' }
    // ]
  },

  // Limits
  serverMaxConnections: 50,                // Concurrent connections
  serverMaxMessageSize: 25 * 1024 * 1024,  // Max 25MB per email
  serverMaxRecipients: 100,                // Recipients per email

  // Storage
  emailResource: 'received_emails',

  // Logging
  verbose: true
});
```

### Server Mode Storage Architecture

Emails received in Server Mode are stored in S3DB using a 4-resource pattern:

```
S3DB Resources:
├─ emails               (main email records)
├─ email_attachments   (file blobs)
├─ email_recipients    (CC/BCC details)
└─ email_headers       (raw SMTP headers)
```

**Main Resource: `emails`**

Stores complete email with metadata:

```javascript
{
  // Identification
  messageId: '<abc123@gmail.com>',        // Message-ID header

  // Sender
  from: 'john@example.com',
  fromName: 'John Doe',
  replyTo: 'reply@example.com',

  // Recipients
  to: 'postmaster@yourdomain.com',        // Primary recipient
  cc: ['cc@example.com'],                 // CC recipients
  bcc: ['secret@example.com'],            // BCC recipients

  // Content
  subject: 'Proposal for Q4',
  bodyText: 'Hi, here\'s the proposal...',
  bodyHtml: '<p>Hi, here\'s the proposal...</p>',

  // Metadata
  contentType: 'multipart/mixed',
  charset: 'UTF-8',
  attachmentCount: 2,
  attachmentTotalSize: 1024000,
  attachmentIds: ['att-456', 'att-789'],

  // Reception Info
  receivedAt: '2024-11-14T10:30:15Z',
  receivedFrom: '192.168.1.1',
  receivedVia: 'smtp.domain.com:25',

  // Status
  status: 'stored',
  processedAt: '2024-11-14T10:30:16Z',

  // Organization
  folder: 'inbox',                        // inbox, sent, trash, etc.
  labels: ['work', 'important'],
  starred: false,
  read: false
}
```

**Attachments: `email_attachments`**

Stores files with efficient blob storage:

```javascript
{
  emailId: 'msg-123456',
  filename: 'proposal.pdf',
  mimeType: 'application/pdf',
  size: 512000,
  content: 'JVBERi0xLjQKJ...',            // Base64 encoded
  contentHash: 'sha256:abc123def456...',  // For deduplication
  inline: false,
  uploadedAt: '2024-11-14T10:30:15Z'
}
```

**Recipients: `email_recipients`**

Stores CC/BCC recipient details:

```javascript
{
  emailId: 'msg-123456',
  email: 'recipient@example.com',
  name: 'Jane Doe',
  type: 'cc'  // 'to', 'cc', or 'bcc'
}
```

**Headers: `email_headers`**

Stores raw SMTP headers for audit trail:

```javascript
{
  emailId: 'msg-123456',
  rawHeaders: 'Subject: Proposal...\nFrom: john@...\nTo: postmaster@...',
  parsed: {
    'Subject': 'Proposal for Q4',
    'From': 'john@example.com',
    'To': 'postmaster@yourdomain.com',
    'Date': '2024-11-14T10:30:00Z',
    'Message-ID': '<abc123@gmail.com>'
  }
}
```

### Server Mode Use Cases

1. **Email Gateway** - Receive emails from external systems
2. **Notification Collector** - Systems send alerts via SMTP
3. **Virtual Mailbox** - Custom email inboxes in S3DB
4. **Legacy Integration** - Old apps that use SMTP

### Server Mode vs Relay Mode

| Feature | Relay Mode | Server Mode |
|---------|-----------|------------|
| Send emails | ✅ Yes | ❌ No |
| Receive emails | ❌ No | ✅ Yes |
| External provider | ✅ Required | ❌ Not needed |
| Complexity | Low | High |
| Custom auth | Simple | Full control |
| Ideal for | Transactional | Inbox systems |

### Storage Optimization

**Content Deduplication:**
```javascript
// Calculate hash to avoid duplicate attachments
const hash = crypto.createHash('sha256').update(content).digest('hex');
// Only store if contentHash not already in system
```

**Compression:**
```javascript
// Compress files > 1MB for storage efficiency
if (size > 1024 * 1024) {
  content = gzip(content);  // 50-70% size reduction
  isCompressed = true;
}
```

**TTL Cleanup:**
```javascript
// Auto-delete old emails (e.g., 90 days)
const plugin = new TTLPlugin({
  resources: {
    emails: { ttl: 90 * 24 * 60 * 60 * 1000 }  // 90 days
  }
});
```

### Testing Server Mode

Using a SMTP client like nodemailer:

```javascript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 25,
  secure: false,
  auth: {
    user: 'postmaster',
    pass: 'password'
  }
});

const result = await transporter.sendMail({
  from: 'sender@example.com',
  to: 'postmaster@yourdomain.com',
  subject: 'Test',
  text: 'Hello Server Mode!',
  html: '<p>Hello <strong>Server Mode</strong>!</p>'
});

console.log('✅ Email received:', result.messageId);
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
     driver: 'sendgrid',
     config: {
       apiKey: process.env.SENDGRID_API_KEY
     }
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
   driver: 'sendgrid',
   config: {
     apiKey: 'SG.xxx...'
   }

   // ✅ Correct
   driver: 'sendgrid',
   config: {
     apiKey: process.env.SENDGRID_API_KEY
   }
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
  driver: 'aws-ses',  // Changed
  config: {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  },
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

