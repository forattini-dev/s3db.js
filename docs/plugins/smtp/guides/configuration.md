# Configuration

> **In this guide:** All configuration options, driver configurations, server mode options, storage architecture, and API reference.

**Navigation:** [← Back to SMTP Plugin](../README.md)

---

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `'relay'` | Operating mode: `'relay'` or `'server'` |
| `driver` | string | — | Driver: `'sendgrid'`, `'aws-ses'`, `'mailgun'`, `'postmark'`, `'smtp'` |
| `from` | string | — | Sender email address (required for relay mode) |
| `config` | object | — | Driver-specific configuration |
| `maxRetries` | number | `3` | Maximum retry attempts |
| `retryDelay` | number | `1000` | Initial retry delay in ms |
| `retryMultiplier` | number | `1.5` | Exponential backoff multiplier |
| `rateLimit` | number | `100` | Maximum emails per minute |
| `emailResource` | string | `'emails'` | S3DB resource name |
| `templateEngine` | string | `'handlebars'` | Template engine |
| `templateCacheEnabled` | boolean | `true` | Enable template caching |
| `templateCacheMaxSize` | number | `500` | Max templates in cache |
| `logLevel` | string | `'silent'` | Log level |

---

## Driver Configurations

### SendGrid

```javascript
{
  driver: 'sendgrid',
  config: {
    apiKey: process.env.SENDGRID_API_KEY,
    webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET
  }
}
```

**SMTP Connection:**
| Setting | Value |
|---------|-------|
| Host | `smtp.sendgrid.net` |
| Port | `587` |
| Secure | `false` (STARTTLS) |
| Auth User | `apikey` |
| Auth Pass | Your API key |

---

### AWS SES

```javascript
{
  driver: 'aws-ses',
  config: {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
  }
}
```

**SMTP Connection:**
| Setting | Value |
|---------|-------|
| Host | `email-smtp.{region}.amazonaws.com` |
| Port | `587` |
| Secure | `false` (STARTTLS) |
| Auth | SMTP credentials (not IAM keys) |

---

### Mailgun

```javascript
{
  driver: 'mailgun',
  config: {
    apiKey: process.env.MAILGUN_API_KEY,
    domain: 'yourdomain.mailgun.org',
    webhookSecret: process.env.MAILGUN_WEBHOOK_SECRET
  }
}
```

**SMTP Connection:**
| Setting | Value |
|---------|-------|
| Host | `smtp.mailgun.org` |
| Port | `587` |
| Secure | `false` |
| Auth User | `postmaster@domain` |
| Auth Pass | API key |

---

### Postmark

```javascript
{
  driver: 'postmark',
  config: {
    serverToken: process.env.POSTMARK_SERVER_TOKEN,
    webhookSecret: process.env.POSTMARK_WEBHOOK_SECRET
  }
}
```

**SMTP Connection:**
| Setting | Value |
|---------|-------|
| Host | `smtp.postmarkapp.com` |
| Port | `587` |
| Secure | `false` |
| Auth User | Server token |
| Auth Pass | Server token |

---

### Custom SMTP Relay

```javascript
{
  driver: 'smtp',
  config: {
    host: 'mail.yourdomain.com',
    port: 587,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  }
}
```

---

## Server Mode Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serverPort` | number | `25` | SMTP server port |
| `serverHost` | string | `'0.0.0.0'` | Bind address |
| `serverSecure` | boolean | `false` | Require TLS |
| `serverAuth` | object | — | Authentication config |
| `serverMaxConnections` | number | `50` | Max concurrent connections |
| `serverMaxMessageSize` | number | `25MB` | Max email size |
| `serverMaxRecipients` | number | `100` | Max recipients per email |

### Server Authentication

```javascript
serverAuth: {
  username: 'postmaster',
  password: 'secret'
}

// Or multiple users:
serverAuth: {
  credentials: [
    { username: 'admin', password: 'pass1' },
    { username: 'noreply', password: 'pass2' }
  ]
}
```

### Server Callbacks

```javascript
{
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
}
```

---

## Retry & Rate Limiting

### Retry Configuration

```javascript
{
  maxRetries: 3,           // Max attempts
  retryDelay: 1000,        // Initial delay (ms)
  retryMultiplier: 1.5     // 1s → 1.5s → 2.25s
}

// Or detailed configuration
retryPolicy: {
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 60000,
  multiplier: 2,
  jitter: 0.1
}
```

### Rate Limiting

```javascript
{
  rateLimit: 500           // emails/minute
}

// Or detailed configuration
rateLimit: {
  maxPerSecond: 100,       // Emails per second
  maxQueueDepth: 10000     // Queue limit
}
```

---

## Storage Architecture

### Relay Mode Resource: `emails`

```javascript
{
  id: 'msg-123',
  to: 'user@example.com',
  from: 'noreply@yourdomain.com',
  subject: 'Welcome',
  body: 'Email content',
  status: 'pending',       // pending, delivered, bounced, failed
  createdAt: '2024-01-01T00:00:00Z',
  deliveredAt: null,
  bounceType: null,
  bounceReason: null
}
```

### Server Mode Resources

**4-resource pattern:**
```
├─ emails               (main email records)
├─ email_attachments   (file blobs)
├─ email_recipients    (CC/BCC details)
└─ email_headers       (raw SMTP headers)
```

**Main Resource: `emails`**

```javascript
{
  messageId: '<abc123@gmail.com>',
  from: 'john@example.com',
  fromName: 'John Doe',
  replyTo: 'reply@example.com',
  to: 'postmaster@yourdomain.com',
  cc: ['cc@example.com'],
  bcc: ['secret@example.com'],
  subject: 'Proposal for Q4',
  bodyText: 'Hi, here\'s the proposal...',
  bodyHtml: '<p>Hi, here\'s the proposal...</p>',
  contentType: 'multipart/mixed',
  charset: 'UTF-8',
  attachmentCount: 2,
  attachmentTotalSize: 1024000,
  attachmentIds: ['att-456', 'att-789'],
  receivedAt: '2024-11-14T10:30:15Z',
  receivedFrom: '192.168.1.1',
  receivedVia: 'smtp.domain.com:25',
  status: 'stored',
  folder: 'inbox',
  labels: ['work', 'important'],
  starred: false,
  read: false
}
```

**Attachments: `email_attachments`**

```javascript
{
  emailId: 'msg-123456',
  filename: 'proposal.pdf',
  mimeType: 'application/pdf',
  size: 512000,
  content: 'JVBERi0xLjQKJ...',      // Base64 encoded
  contentHash: 'sha256:abc123...',  // For deduplication
  inline: false
}
```

**Recipients: `email_recipients`**

```javascript
{
  emailId: 'msg-123456',
  email: 'recipient@example.com',
  name: 'Jane Doe',
  type: 'cc'  // 'to', 'cc', or 'bcc'
}
```

**Headers: `email_headers`**

```javascript
{
  emailId: 'msg-123456',
  rawHeaders: 'Subject: Proposal...\nFrom: john@...',
  parsed: {
    'Subject': 'Proposal for Q4',
    'From': 'john@example.com',
    'Message-ID': '<abc123@gmail.com>'
  }
}
```

---

## API Reference

### Plugin Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `sendEmail(options)` | Send simple email | `Promise<EmailRecord>` |
| `sendTemplatedEmail(options)` | Send templated email | `Promise<EmailRecord>` |
| `processWebhook(payload, headers)` | Process provider webhook | `Promise<WebhookResult>` |
| `onWebhookEvent(type, handler)` | Register webhook handler | `void` |
| `registerTemplatePartial(id, template)` | Register template | `void` |
| `registerHelper(name, fn)` | Register Handlebars helper | `void` |
| `getWebhookEventLog(limit)` | Get recent webhook events | `Event[]` |

### sendEmail Options

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string/string[] | Yes | Recipient(s) |
| `subject` | string | Yes | Subject line |
| `body` | string | Yes | Plain text body |
| `html` | string | No | HTML body |
| `from` | string | No | Override sender |
| `cc` | string[] | No | CC recipients |
| `bcc` | string[] | No | BCC recipients |
| `attachments` | Attachment[] | No | File attachments |
| `maxAttempts` | number | No | Override retry attempts |

### sendTemplatedEmail Options

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to` | string/string[] | Yes | Recipient(s) |
| `templateId` | string | Yes | Template ID |
| `templateData` | object | No | Template variables |
| `subject` | string | No | Override template subject |

### Webhook Event Types

| Event | Description |
|-------|-------------|
| `bounce` | Email bounced (hard or soft) |
| `complaint` | Spam complaint received |
| `delivery` | Email delivered |
| `open` | Email opened |
| `click` | Link clicked |

### Events Emitted

| Event | Payload |
|-------|---------|
| `event.sent` | `{ emailId, recipient, timestamp }` |
| `event.bounce` | `{ emailId, recipient, bounceType, reason }` |
| `event.complaint` | `{ emailId, recipient, timestamp }` |
| `event.delivery` | `{ emailId, recipient, timestamp }` |

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Provider examples, multi-relay, server mode
- [Best Practices](./best-practices.md) - Security, performance, troubleshooting, FAQ
