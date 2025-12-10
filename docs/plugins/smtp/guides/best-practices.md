# Best Practices & FAQ

> **In this guide:** Security, performance optimization, error handling, troubleshooting, and FAQ.

**Navigation:** [← Back to SMTP Plugin](../README.md) | [Configuration](./configuration.md)

---

## Best Practices

### 1. Use Environment Variables for Credentials

```javascript
// ✅ Good
const plugin = new SMTPPlugin({
  driver: 'sendgrid',
  config: {
    apiKey: process.env.SENDGRID_API_KEY
  }
});

// ❌ Bad - Never hardcode credentials
config: { apiKey: 'SG.xxx...' }
```

### 2. Register Webhook Handlers on Startup

```javascript
// ✅ Good - Register before processing
plugin.onWebhookEvent('bounce', handleBounce);
plugin.onWebhookEvent('complaint', handleComplaint);

await db.usePlugin(plugin);
```

### 3. Handle Rate Limiting Gracefully

```javascript
// ✅ Good
try {
  await plugin.sendEmail({...});
} catch (error) {
  if (error instanceof RateLimitError) {
    // Queue for later retry
    await emailQueue.push(email);
  }
}

// ❌ Bad - No rate limiting consideration
for (let user of millionUsers) {
  await plugin.sendEmail({ to: user.email });  // Will hit limit
}
```

### 4. Use Templates for Dynamic Content

```javascript
// ✅ Good - Reusable templates
await plugin.sendTemplatedEmail({
  to: user.email,
  templateId: 'welcome',
  templateData: { name: user.name }
});

// ❌ Bad - String interpolation for every email
await plugin.sendEmail({
  body: `Hello ${user.name}, welcome to ${company}...`
});
```

### 5. Verify Emails Before Sending

```javascript
// ✅ Good
if (user.emailVerified) {
  await plugin.sendEmail({ to: user.email });
}

// ❌ Bad - Sending to unverified emails
await plugin.sendEmail({ to: unverifiedEmail });
```

### 6. Use Queue System for Bulk Sends

```javascript
import PQueue from 'p-queue';

// ✅ Good - Controlled concurrency
const queue = new PQueue({
  concurrency: 5,
  interval: 60000,
  maxSize: 500
});

for (let user of users) {
  await queue.add(() => plugin.sendEmail({ to: user.email }));
}
```

### 7. Monitor Delivery Metrics

```javascript
// ✅ Good - Track delivery rates
const delivered = await db.resources.emails.query({
  status: 'delivered',
  createdAt: { $gte: lastHour }
});

metrics.gauge('email.delivery_rate', delivered.length / sent.length);
```

---

## Security Considerations

### Validate Webhook Signatures

```javascript
// Always verify webhook authenticity
const isValid = plugin.verifyWebhookSignature(payload, headers);
if (!isValid) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

### Use TLS/SSL in Server Mode

```javascript
new SMTPPlugin({
  mode: 'server',
  serverSecure: true,  // Enable TLS
  // ...
});
```

### Rotate Credentials Regularly

- Rotate API keys every 90 days
- Use separate keys for dev/staging/production
- Monitor for key exposure

### Rate Limit by IP in Server Mode

```javascript
onMailFrom: async (address, session) => {
  const ip = session.remoteAddress;
  const count = await rateLimiter.get(ip);
  if (count > 100) {
    return false;  // Block excessive senders
  }
  return true;
}
```

---

## Performance Tips

### Enable Template Caching

```javascript
// Default enabled - 40-60% faster renders
templateCacheEnabled: true,
templateCacheMaxSize: 500
```

### Batch Webhook Processing

```javascript
// Process multiple events together
app.post('/webhooks/smtp', async (req, res) => {
  const events = req.body;  // Array of events
  await Promise.all(events.map(e => processEvent(e)));
  res.json({ processed: events.length });
});
```

### Query by Partition

```javascript
// Use partitions for fast lookups
const bounced = await db.resources.emails.partition('byStatus').query({
  status: 'bounced'
});
```

### Archive Old Emails

```javascript
// Use TTL plugin for automatic cleanup
const ttlPlugin = new TTLPlugin({
  resources: {
    emails: { ttl: 90 * 24 * 60 * 60 * 1000 }  // 90 days
  }
});
```

---

## Error Handling

### Error Classes

| Error | Status | Retriable | Description |
|-------|--------|-----------|-------------|
| `AuthenticationError` | 401 | No | Invalid credentials |
| `RateLimitError` | 429 | Yes | Rate limit exceeded |
| `RecipientError` | 400 | No | Invalid recipient |
| `ConnectionError` | 500 | Yes | Connection failed |

### Error Handling Pattern

```javascript
try {
  await plugin.sendEmail({...});
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Check API key');
  } else if (error instanceof RateLimitError) {
    // Queue for retry
    await emailQueue.push(email);
  } else if (error instanceof RecipientError) {
    // Mark as invalid
    await markEmailInvalid(email.to);
  } else if (error instanceof ConnectionError) {
    // Will be retried automatically
    console.warn('Connection issue, will retry');
  }
}
```

---

## Troubleshooting

### Issue 1: Emails Not Delivering

**Diagnosis:**
1. Check S3DB email status
2. Verify provider account limits
3. Check DNS (SPF, DKIM, DMARC)

**Fix:**
```javascript
// Check email status
const email = await db.resources.emails.get(emailId);
console.log('Status:', email.status);  // pending, delivered, bounced

// Check recent events
const events = plugin.getWebhookEventLog(100);
console.log(events);
```

### Issue 2: Bounces Not Being Processed

**Diagnosis:**
1. Webhook endpoint accessible?
2. Webhook secret matches?
3. Handler registered?

**Fix:**
```javascript
// Verify webhook secret
console.log('Secret configured:', !!process.env.SENDGRID_WEBHOOK_SECRET);

// Register handler
plugin.onWebhookEvent('bounce', async (event) => {
  console.log('Bounce received:', event);
});

// Test webhook endpoint
// curl -X POST http://localhost:3000/webhooks/smtp/sendgrid \
//   -H 'Content-Type: application/json' \
//   -d '[{"event":"bounce","email":"test@example.com"}]'
```

### Issue 3: Rate Limit Errors

**Diagnosis:**
1. Check `rateLimit` setting
2. Check provider quotas
3. Monitor send volume

**Fix:**
```javascript
// Reduce rate limit
new SMTPPlugin({
  rateLimit: 200,  // Lower from 500
  maxRetries: 5,
  retryDelay: 2000  // Longer delay
});

// Or use queue system
const queue = new PQueue({
  concurrency: 5,
  interval: 60000,
  maxSize: 200
});
```

### Issue 4: Template Rendering Errors

**Diagnosis:**
1. Check template syntax
2. Verify required variables
3. Check helper functions

**Fix:**
```javascript
// Enable debug logging
logLevel: 'debug'

// Test template rendering
try {
  plugin.renderTemplate('welcome', { name: 'Test' });
} catch (error) {
  console.error('Template error:', error.message);
}
```

---

## FAQ

### General

**Q: Which email provider should I choose?**

A: Recommended order:
1. **SendGrid** - Best features, excellent deliverability
2. **AWS SES** - Cheapest for high volume ($0.10/1000 emails)
3. **Mailgun** - Flexible, good for developers
4. **Postmark** - Premium deliverability, transactional focus

---

**Q: Can I switch providers without losing email history?**

A: Yes! Email history is stored in S3DB. Switch provider config anytime.

```javascript
// Switch from SendGrid to AWS SES
const plugin = new SMTPPlugin({
  driver: 'aws-ses',  // Changed
  config: { region: 'us-east-1', ... },
  emailResource: 'emails'  // Keep same resource
});
```

---

**Q: What's the difference between the three operating modes?**

A:
| Mode | Use Case | Webhooks | Sending | Receiving |
|------|----------|----------|---------|-----------|
| Provider Relay | Transactional emails | ✅ Yes | ✅ Yes | ❌ No |
| Custom SMTP | Self-hosted, on-premise | ❌ No | ✅ Yes | ❌ No |
| Server | Email gateway, inbox systems | ❌ No | ❌ No | ✅ Yes |

---

**Q: How often should I rotate API keys?**

A: Every 90 days, or immediately if exposed. Use separate keys per environment.

---

### Performance

**Q: How fast are emails sent?**

A:
- **p50**: 200-400ms
- **p95**: 1-2s
- **p99**: 3-5s (with retry)

---

**Q: What's the throughput limit?**

A:
- **Default**: 100 emails/minute
- **Configurable**: Up to provider limits
- **SendGrid**: 100K/day (free), millions (paid)
- **AWS SES**: 200/day (sandbox), 50K+/day (production)

---

**Q: How do I optimize for high volume?**

A:
1. Use template caching
2. Batch webhook processing
3. Increase `rateLimit` (within provider limits)
4. Use queue system with concurrency control
5. Archive old emails with TTL plugin

---

### Server Mode

**Q: How do SMTP clients connect to Server Mode?**

A: Connect via standard SMTP protocol:

```bash
# Mail client settings:
Host: your-server.com
Port: 25 (or 2525)
Auth: username / password
```

Any SMTP client (Outlook, nodemailer, Python smtplib) can send to your server.

---

**Q: Can I run both relay and server modes?**

A: Yes, use two plugin instances:

```javascript
const sendPlugin = new SMTPPlugin({ mode: 'relay', ... });
const receivePlugin = new SMTPPlugin({ mode: 'server', ... });

await db.usePlugin(sendPlugin);
await db.usePlugin(receivePlugin);
```

---

**Q: How do I implement spam filtering in server mode?**

A: Use the `onData` callback:

```javascript
onData: async (stream, session) => {
  const email = await parseEmail(stream);

  // Check spam score
  const spamScore = await checkSpam(email);
  if (spamScore > 5) {
    return false;  // Reject
  }

  // Check virus
  const hasVirus = await scanAttachments(email.attachments);
  if (hasVirus) {
    return false;  // Reject
  }

  return true;  // Accept
}
```

---

### Multi-Relay

**Q: Can I use multiple SMTP relays with failover?**

A: Yes, see [Multi-Relay Patterns](./usage-patterns.md#multi-relay-patterns) for failover, domain routing, and load balancing examples.

---

**Q: How do I route emails by domain?**

A:
```javascript
const relays = {
  'gmail.com': gmailPlugin,
  'default': primaryPlugin
};

const domain = recipient.split('@')[1];
const plugin = relays[domain] || relays['default'];
await plugin.sendEmail(emailData);
```

---

### Templates

**Q: Can I use different templates for different providers?**

A: Templates are provider-agnostic. Register once, use with any provider.

---

**Q: How do I add custom template helpers?**

A:
```javascript
plugin.registerHelper('formatCurrency', (amount, currency) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
});

// Use: {{formatCurrency price "USD"}}
```

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Provider examples, multi-relay, server mode
