# SMTP Plugin

> **Enterprise-grade email delivery with multiple operating modes: Send via email providers (SendGrid, AWS SES, Mailgun, Postmark), custom SMTP relay, or run an in-process SMTP server to receive emails.**

---

## TLDR

**Three ways to handle emails: (1) Via email providers, (2) Via custom SMTP relay, or (3) As an in-process SMTP server. Automatic retry, templates, webhooks, and S3DB storage.**

**1 line to get started:**
```javascript
await db.usePlugin(new SMTPPlugin({ driver: 'sendgrid', from: 'noreply@example.com', config: { apiKey: 'SG.xxx' } }));
```

**Key features:**
- 3 Operating Modes (provider relay, custom SMTP, server mode)
- 4 Provider Drivers (SendGrid, AWS SES, Mailgun, Postmark)
- Webhook Processing (bounce, complaint, delivery, open, click)
- Handlebars Templates with caching
- Automatic Retry with exponential backoff
- Rate Limiting with token bucket algorithm
- Server Mode for receiving emails

**Use cases:**
- Transactional emails (welcome, password reset, notifications)
- Marketing campaigns with bounce handling
- Email gateway for legacy systems
- Custom inbox systems

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { SMTPPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://key:secret@bucket/path' });

const smtpPlugin = new SMTPPlugin({
  mode: 'relay',
  driver: 'sendgrid',
  from: 'noreply@yourdomain.com',
  config: {
    apiKey: process.env.SENDGRID_API_KEY,
    webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET
  },
  emailResource: 'emails',
  rateLimit: 500,
  maxRetries: 3
});

await db.usePlugin(smtpPlugin);
await db.connect();

// Send email
const result = await smtpPlugin.sendEmail({
  to: 'user@example.com',
  subject: 'Hello World',
  body: 'This is a test email'
});

console.log(`Email sent with ID: ${result.id}`);
```

---

## Dependencies

**Required:**
```bash
pnpm install nodemailer
```

**Optional (for Server Mode):**
```bash
pnpm install mailparser smtp-server
```

| Dependency | Version | Purpose |
|------------|---------|---------|
| `nodemailer` | `^6.9.0` | SMTP connection handling |
| `mailparser` | `^3.6.0` | Parse incoming emails (server mode) |
| `smtp-server` | `^3.13.0` | In-process SMTP listener (server mode) |

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, driver configs, server mode, storage schema, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Progressive adoption, provider examples, multi-relay, templates |
| [Best Practices](./guides/best-practices.md) | Security, performance, error handling, troubleshooting, FAQ |

---

## Quick Reference

### Operating Modes

| Mode | Description | Webhooks | Use Case |
|------|-------------|----------|----------|
| **Provider Relay** | Send via SendGrid/SES/Mailgun/Postmark | Yes | Transactional emails |
| **Custom SMTP** | Send via your own SMTP server | No | Self-hosted, on-premise |
| **Server** | Receive emails from SMTP clients | No | Email gateway, inbox systems |

### Supported Providers

| Provider | Driver | Features |
|----------|--------|----------|
| **SendGrid** | `sendgrid` | Full webhooks, analytics |
| **AWS SES** | `aws-ses` | Cost-effective, high volume |
| **Mailgun** | `mailgun` | Flexible, EU region support |
| **Postmark** | `postmark` | Premium deliverability |
| **Custom SMTP** | `smtp` | Any SMTP server |

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `'relay'` | `'relay'` or `'server'` |
| `driver` | string | — | Provider driver |
| `from` | string | — | Sender email address |
| `config` | object | — | Driver-specific config |
| `rateLimit` | number | `100` | Emails per minute |
| `maxRetries` | number | `3` | Retry attempts |
| `emailResource` | string | `'emails'` | S3DB resource name |

### Plugin Methods

```javascript
// Send simple email
await plugin.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  body: 'Email content'
});

// Send templated email
await plugin.sendTemplatedEmail({
  to: 'user@example.com',
  templateId: 'welcome',
  templateData: { name: 'John' }
});

// Process webhook
await plugin.processWebhook(payload, headers);

// Register webhook handler
plugin.onWebhookEvent('bounce', async (event) => {
  console.log(`Bounced: ${event.recipient}`);
});

// Register template
plugin.registerTemplatePartial('welcome', templateString);
```

### Webhook Events

| Event | Description |
|-------|-------------|
| `bounce` | Email bounced (hard or soft) |
| `complaint` | Spam complaint received |
| `delivery` | Email delivered |
| `open` | Email opened |
| `click` | Link clicked |

---

## How It Works

1. **Relay Mode**: Connect to provider SMTP, send emails, track in S3DB
2. **Webhooks**: Process bounce/complaint/delivery events from providers
3. **Templates**: Handlebars with YAML front matter, cached for performance
4. **Retry**: Exponential backoff with jitter for transient errors
5. **Server Mode**: In-process SMTP server stores emails in S3DB

---

## Configuration Examples

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
  rateLimit: 500
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
    auth: { user: 'user', pass: 'pass' }
  }
})
```

### Server Mode

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
  onRcptTo: async (address) => {
    const user = await db.resources.users.get(address);
    return user?.enabled || false;
  }
})
```

---

## See Also

- [Scheduler Plugin](../scheduler/README.md) - Schedule email campaigns
- [TTL Plugin](../ttl/README.md) - Auto-cleanup old emails
- [Metrics Plugin](../metrics/README.md) - Monitor delivery rates
