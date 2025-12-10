# Usage Patterns

> **In this guide:** Progressive adoption levels, provider examples, multi-relay patterns, server mode setup, and templates.

**Navigation:** [← Back to SMTP Plugin](../README.md) | [Configuration](./configuration.md)

---

## Level 1: Basic Email Sending

Start with simple email sending via any relay option.

```javascript
import { SMTPPlugin } from 's3db.js/plugins';

const plugin = new SMTPPlugin({
  mode: 'relay',
  driver: 'sendgrid',
  from: 'noreply@example.com',
  config: {
    apiKey: process.env.SENDGRID_API_KEY
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

## Level 2: Templated Emails

Use Handlebars templates for dynamic content.

```javascript
// Register template with YAML front matter
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
```

**Template features:**
- YAML front matter for email metadata
- Handlebars syntax for variable substitution
- Template caching (40-60% faster)
- Built-in helpers: uppercase, lowercase, eq, default, pluralize

### Custom Helpers

```javascript
plugin.registerHelper('formatDate', (date) => {
  return new Date(date).toLocaleDateString();
});

// Use in template: {{formatDate createdAt}}
```

---

## Level 3: Webhook Processing

Handle provider events (bounce, complaint, delivery, open, click).

**Note:** Webhooks only available with provider relay mode (SendGrid, AWS SES, Mailgun, Postmark).

```javascript
// Register handlers
plugin.onWebhookEvent('bounce', async (event) => {
  console.log(`Email bounced: ${event.recipient}`);
  console.log(`Bounce type: ${event.bounceType}`); // hard or soft

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

plugin.onWebhookEvent('delivery', async (event) => {
  console.log(`Delivered to ${event.recipient}`);
});

// Setup webhook endpoint (Express)
app.post('/webhooks/smtp/sendgrid', async (req, res) => {
  const result = await plugin.processWebhook(req.body, req.headers);
  res.json({ success: true, eventsProcessed: result.eventsProcessed });
});
```

---

## Level 4: Rate Limiting & Retry

Configure rate limiting and automatic retry behavior.

```javascript
const plugin = new SMTPPlugin({
  mode: 'relay',
  driver: 'sendgrid',
  from: 'noreply@example.com',
  config: { apiKey: 'SG.xxx' },

  rateLimit: 500,            // 500 emails/minute
  maxRetries: 3,             // Max 3 attempts
  retryDelay: 1000,          // Start with 1 second
  retryMultiplier: 1.5       // 1s → 1.5s → 2.25s
});

try {
  const result = await plugin.sendEmail({
    to: 'user@example.com',
    subject: 'Will retry if fails',
    body: 'Content'
  });
} catch (error) {
  if (error.isRetriable) {
    console.log('Will be retried automatically');
  } else {
    console.error('Permanent failure:', error.message);
  }
}
```

---

## Level 5: Production Setup

Complete production configuration with monitoring.

```javascript
const plugin = new SMTPPlugin({
  mode: 'relay',
  driver: 'sendgrid',
  from: process.env.SMTP_FROM_ADDRESS,
  config: {
    apiKey: process.env.SENDGRID_API_KEY,
    webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET
  },
  rateLimit: 500,
  maxRetries: 3,
  emailResource: 'emails',
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
});

await db.usePlugin(plugin);

// Register all webhook handlers
plugin.onWebhookEvent('bounce', handleBounce);
plugin.onWebhookEvent('complaint', handleComplaint);
plugin.onWebhookEvent('delivery', handleDelivery);

// Send with error handling
async function sendEmailSafely(options) {
  try {
    const result = await plugin.sendEmail(options);
    console.log(`Email sent: ${result.id}`);
    return result;
  } catch (error) {
    console.error(`Email failed: ${error.message}`);
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

---

## Provider-Specific Examples

### SendGrid with Webhooks

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

### AWS SES (Cost-Optimized)

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

### Custom SMTP Relay

```javascript
new SMTPPlugin({
  mode: 'relay',
  driver: 'smtp',
  from: 'noreply@yourdomain.com',
  config: {
    host: 'mail.yourdomain.com',
    port: 587,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  },
  rateLimit: 300
})
```

---

## Multi-Relay Patterns

### Failover Pattern

Try backup relay if primary fails.

```javascript
const primaryPlugin = new SMTPPlugin({
  mode: 'relay',
  driver: 'smtp',
  from: 'noreply@yourdomain.com',
  config: { host: 'primary-mail.yourdomain.com', port: 587, secure: true, auth: {...} }
});

const backupPlugin = new SMTPPlugin({
  mode: 'relay',
  driver: 'smtp',
  from: 'noreply@yourdomain.com',
  config: { host: 'backup-mail.yourdomain.com', port: 587, secure: true, auth: {...} }
});

// Failover logic
await primaryPlugin.sendEmail(emailData).catch(async (error) => {
  console.log('Primary relay failed, trying backup:', error.message);
  return await backupPlugin.sendEmail(emailData);
});
```

### Domain-Based Routing

Route emails through different relays by recipient domain.

```javascript
const relaysByDomain = {
  'gmail.com': gmailOptimizedPlugin,
  'hotmail.com': hotmailOptimizedPlugin,
  'default': primaryPlugin
};

async function sendWithRouting(emailData) {
  const domain = emailData.to.split('@')[1];
  const relay = relaysByDomain[domain] || relaysByDomain['default'];
  return await relay.sendEmail(emailData);
}
```

### Round-Robin Load Balancing

```javascript
const relays = [primaryPlugin, backupPlugin, tertiaryPlugin];
let index = 0;

function getNextRelay() {
  const relay = relays[index];
  index = (index + 1) % relays.length;
  return relay;
}

await getNextRelay().sendEmail(emailData);
```

---

## Server Mode Setup

Run an in-process SMTP server that receives emails.

### Basic Server

```javascript
const plugin = new SMTPPlugin({
  mode: 'server',
  serverPort: 25,                    // Use 2525 for unprivileged
  serverHost: '0.0.0.0',
  serverAuth: {
    username: 'postmaster',
    password: process.env.SMTP_PASSWORD
  },
  emailResource: 'received_emails',
  logLevel: 'debug'
});

await db.usePlugin(plugin);

// SMTP clients can now connect:
// telnet localhost 25
// EHLO client.example.com
// MAIL FROM: <sender@example.com>
// RCPT TO: <receiver@yourdomain.com>
// DATA
// ... email content ...
// .
```

### Server with Validation

```javascript
const plugin = new SMTPPlugin({
  mode: 'server',
  serverPort: 25,
  serverHost: '0.0.0.0',
  serverAuth: {
    username: 'postmaster',
    password: process.env.SMTP_PASSWORD
  },
  emailResource: 'received_emails',

  // Validate sender
  onMailFrom: async (address) => {
    return address.endsWith('@authorized-domain.com');
  },

  // Validate recipient
  onRcptTo: async (address) => {
    const user = await db.resources.users.get(address.split('@')[0]);
    return user?.enabled || false;
  },

  // Process before storing
  onData: async (stream) => {
    // Spam filtering, virus scanning, etc.
    return true;
  }
});
```

### Testing Server Mode

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

console.log('Email received:', result.messageId);
```

---

## Storage Optimization

### Content Deduplication

```javascript
// Calculate hash to avoid duplicate attachments
const hash = crypto.createHash('sha256').update(content).digest('hex');
// Only store if contentHash not already in system
```

### Compression

```javascript
// Compress files > 1MB for storage efficiency
if (size > 1024 * 1024) {
  content = gzip(content);  // 50-70% size reduction
  isCompressed = true;
}
```

### TTL Cleanup

```javascript
// Auto-delete old emails (e.g., 90 days)
const ttlPlugin = new TTLPlugin({
  resources: {
    emails: { ttl: 90 * 24 * 60 * 60 * 1000 }  // 90 days
  }
});
```

---

## Event Monitoring

```javascript
// Discovery progress
plugin.on('event.sent', ({ emailId, recipient }) => {
  metrics.increment('emails.sent', { recipient });
});

plugin.on('event.bounce', ({ emailId, bounceType }) => {
  metrics.increment('emails.bounced', { type: bounceType });
});

plugin.on('event.delivery', ({ emailId, recipient }) => {
  metrics.increment('emails.delivered');
});
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Security, performance, troubleshooting, FAQ
