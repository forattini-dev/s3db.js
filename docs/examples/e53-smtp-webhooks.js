/**
 * Example: SMTP Plugin - Webhook Processing for Bounces & Complaints
 *
 * This example demonstrates how to process bounce/complaint/delivery
 * notifications from email providers (SendGrid, AWS SES, Mailgun, Postmark).
 *
 * Prerequisites:
 * - npm install express body-parser (for webhook server)
 * - nodemailer for SMTP
 *
 * @example
 * node e53-smtp-webhooks.js
 *
 * Then configure your provider:
 * - SendGrid: Settings → Mail Send → Event Webhook
 * - AWS SES: SNS Topics → Bounce/Complaint/Delivery notifications
 * - Mailgun: Webhooks → Add webhook endpoint
 * - Postmark: Account Settings → Webhooks
 */

import { Database } from '../src/database.class.js';
import { MemoryClient } from '../src/clients/memory-client.class.js';
import { SMTPPlugin } from '../src/plugins/smtp.plugin.js';

// Create database
const db = new Database({
  client: new MemoryClient({ bucket: 'demo' })
});
await db.connect();

// ============================================================================
// SENDGRID WEBHOOK EXAMPLE
// ============================================================================

console.log('=== SendGrid Webhook Example ===\n');

const smtpPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY || 'your-key'
  },
  webhookProvider: 'sendgrid',
  webhookSecret: process.env.SENDGRID_WEBHOOK_SECRET || 'your-webhook-secret',
  emailResource: 'emails',
  verbose: false
});

db.installPlugin(smtpPlugin);
await smtpPlugin.initialize();

console.log('✅ SMTP plugin initialized\n');

// 1. Register webhook event handlers
console.log('--- Registering Webhook Handlers ---\n');

// Handle bounces
smtpPlugin.onWebhookEvent('bounce', async (event) => {
  console.log(`📬 Bounce received:`);
  console.log(`   Recipient: ${event.recipient}`);
  console.log(`   Type: ${event.bounceType} (${event.bounceSubType})`);
  console.log(`   Reason: ${event.reason}\n`);

  // Custom logic: Add to suppression list
  if (event.bounceType === 'hard') {
    console.log(`   ℹ️ Added to suppression list: ${event.recipient}`);
  }
});

// Handle complaints
smtpPlugin.onWebhookEvent('complaint', async (event) => {
  console.log(`📧 Complaint received:`);
  console.log(`   Recipient: ${event.recipient}`);
  console.log(`   Type: ${event.complaintType}`);
  console.log(`   Reason: ${event.reason}\n`);

  // Custom logic: Auto-unsubscribe
  console.log(`   ℹ️ Auto-unsubscribed: ${event.recipient}`);
});

// Handle deliveries
smtpPlugin.onWebhookEvent('delivery', async (event) => {
  console.log(`✅ Delivery confirmed:`);
  console.log(`   Recipient: ${event.recipient}`);
  console.log(`   Timestamp: ${new Date(event.timestamp * 1000).toISOString()}\n`);
});

// Handle opens
smtpPlugin.onWebhookEvent('open', async (event) => {
  console.log(`👁️ Email opened:`);
  console.log(`   Recipient: ${event.recipient}`);
  console.log(`   IP: ${event.ip}`);
  console.log(`   User-Agent: ${event.userAgent}\n`);
});

// Handle clicks
smtpPlugin.onWebhookEvent('click', async (event) => {
  console.log(`🔗 Link clicked:`);
  console.log(`   Recipient: ${event.recipient}`);
  console.log(`   URL: ${event.url}`);
  console.log(`   IP: ${event.ip}\n`);
});

// 2. Simulate webhook payloads from providers
console.log('--- Simulating Webhook Payloads ---\n');

// SendGrid bounce event
const sendGridBouncePayload = [
  {
    sg_event_id: 'sendgrid_internal_event_id',
    email: 'john@example.com',
    timestamp: Math.floor(Date.now() / 1000),
    'smtp-id': '<14c5d75ce93.dfd.64b469@ismtpd-555>',
    event: 'bounce',
    bounce_type: 'permanent',
    bounce_subtype: 'general',
    reason: 'Invalid email address'
  }
];

console.log('SendGrid bounce webhook:');
try {
  const result = await smtpPlugin.processWebhook(sendGridBouncePayload, {
    'x-twilio-email-event-webhook-signature': 'dummy-signature',
    'x-twilio-email-event-webhook-timestamp': Math.floor(Date.now() / 1000).toString()
  });
  console.log(`✅ Processed: ${result.eventsProcessed} events\n`);
} catch (err) {
  console.log(`ℹ️ (Signature validation skipped for demo)\n`);
  // In real scenario, this would validate signature
}

// SendGrid spam complaint
const sendGridComplaintPayload = [
  {
    email: 'jane@example.com',
    timestamp: Math.floor(Date.now() / 1000),
    event: 'spamreport',
    sg_message_id: 'msg123'
  }
];

console.log('SendGrid complaint webhook:');
try {
  await smtpPlugin.processWebhook(sendGridComplaintPayload, {});
  console.log('✅ Processed complaint\n');
} catch (err) {
  console.error(`Error: ${err.message}\n`);
}

// ============================================================================
// AWS SES WEBHOOK EXAMPLE
// ============================================================================

console.log('\n=== AWS SES Webhook Example ===\n');

const sesPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  auth: {
    user: process.env.AWS_SES_USERNAME || 'aws-user',
    pass: process.env.AWS_SES_PASSWORD || 'aws-pass'
  },
  webhookProvider: 'aws-ses',
  emailResource: 'emails'
});

db.installPlugin(sesPlugin);
await sesPlugin.initialize();

// Register handlers for SES
sesPlugin.onWebhookEvent('bounce', async (event) => {
  console.log(`AWS SES Bounce: ${event.recipient} (${event.bounceType})`);
});

sesPlugin.onWebhookEvent('complaint', async (event) => {
  console.log(`AWS SES Complaint: ${event.recipient}`);
});

// AWS SES SNS bounce notification
const awsSesBouncePayload = {
  Type: 'Notification',
  Message: JSON.stringify({
    eventType: 'Bounce',
    bounce: {
      bounceType: 'Permanent',
      bounceSubType: 'General',
      bouncedRecipients: [
        {
          emailAddress: 'user@example.com',
          status: '5.1.1',
          diagnosticCode: 'smtp; 550 user unknown'
        }
      ],
      timestamp: new Date().toISOString()
    },
    mail: {
      messageId: 'msg-aws-123',
      source: 'noreply@example.com'
    }
  })
};

console.log('AWS SES bounce via SNS:');
try {
  await sesPlugin.processWebhook(awsSesBouncePayload, {});
  console.log('✅ Processed AWS SES bounce\n');
} catch (err) {
  console.error(`Error: ${err.message}`);
}

// ============================================================================
// MAILGUN WEBHOOK EXAMPLE
// ============================================================================

console.log('\n=== Mailgun Webhook Example ===\n');

const mailgunPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'smtp.mailgun.org',
  port: 587,
  auth: {
    user: 'postmaster@example.mailgun.org',
    pass: process.env.MAILGUN_PASSWORD || 'pass'
  },
  webhookProvider: 'mailgun',
  webhookSecret: process.env.MAILGUN_WEBHOOK_SECRET || 'key',
  emailResource: 'emails'
});

db.installPlugin(mailgunPlugin);
await mailgunPlugin.initialize();

// Mailgun failed/bounce event
const mailgunFailurePayload = {
  'event-data': {
    event: 'failed',
    recipient: 'user@example.com',
    timestamp: Math.floor(Date.now() / 1000),
    severity: 'permanent',
    reason: 'bounce',
    code: 550,
    message: {
      id: 'mailgun-msg-id'
    }
  }
};

console.log('Mailgun failed event:');
try {
  await mailgunPlugin.processWebhook(mailgunFailurePayload, {});
  console.log('✅ Processed Mailgun failure\n');
} catch (err) {
  console.error(`Error: ${err.message}`);
}

// ============================================================================
// POSTMARK WEBHOOK EXAMPLE
// ============================================================================

console.log('\n=== Postmark Webhook Example ===\n');

const postmarkPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'smtp.postmarkapp.com',
  port: 587,
  auth: {
    user: 'postmark-api-key',
    pass: 'postmark-api-key'
  },
  webhookProvider: 'postmark',
  emailResource: 'emails'
});

db.installPlugin(postmarkPlugin);
await postmarkPlugin.initialize();

// Postmark bounce webhook (batch format)
const postmarkBouncePayload = {
  Bounces: [
    {
      ID: 12345,
      Type: 'HardBounce',
      MessageID: 'msg-postmark-123',
      Description: 'The server rejected the email address',
      Details: 'smtp; 550 user unknown',
      Email: 'user@example.com',
      BouncedAt: new Date().toISOString(),
      DumpStart: '--- message dump start ---',
      DumpEnd: '--- message dump end ---',
      Inactive: false,
      CanActivate: true,
      Subject: 'Welcome!'
    }
  ]
};

console.log('Postmark bounce webhook:');
try {
  await postmarkPlugin.processWebhook(postmarkBouncePayload, {});
  console.log('✅ Processed Postmark bounce\n');
} catch (err) {
  console.error(`Error: ${err.message}`);
}

// ============================================================================
// WEBHOOK STATISTICS
// ============================================================================

console.log('\n--- Webhook Statistics ---\n');

const sendgridHandlers = smtpPlugin.getWebhookHandlerCount();
console.log('SendGrid handlers registered:');
console.log(JSON.stringify(sendgridHandlers, null, 2));

const eventLog = smtpPlugin.getWebhookEventLog(5);
console.log(`\nLatest webhook events (${eventLog.length}):`);
for (const event of eventLog) {
  console.log(`  - ${event.type}: ${event.recipient} (${new Date(event.loggedAt).toISOString()})`);
}

// ============================================================================
// WEBHOOK SERVER EXAMPLE (Express)
// ============================================================================

console.log('\n\n=== Express Webhook Server Example ===\n');

const expressExample = `
// webhook-server.js
import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// SendGrid webhook endpoint
app.post('/webhooks/sendgrid', async (req, res) => {
  try {
    const result = await smtpPlugin.processWebhook(req.body, req.headers);
    res.json({ success: true, events: result.eventsProcessed });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// AWS SES webhook endpoint (SNS)
app.post('/webhooks/aws-ses', async (req, res) => {
  try {
    // Handle SNS subscription confirmation
    if (req.body.Type === 'SubscriptionConfirmation') {
      // Confirm subscription with SNS
      console.log('SNS subscription confirmation URL:', req.body.SubscribeURL);
    }

    const result = await sesPlugin.processWebhook(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// Mailgun webhook endpoint
app.post('/webhooks/mailgun', async (req, res) => {
  try {
    const result = await mailgunPlugin.processWebhook(req.body, req.headers);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// Postmark webhook endpoint
app.post('/webhooks/postmark', async (req, res) => {
  try {
    const result = await postmarkPlugin.processWebhook(req.body, req.headers);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
  console.log('Endpoints:');
  console.log('  POST /webhooks/sendgrid');
  console.log('  POST /webhooks/aws-ses');
  console.log('  POST /webhooks/mailgun');
  console.log('  POST /webhooks/postmark');
});
`;

console.log(expressExample);

// Cleanup
await smtpPlugin.close();
await sesPlugin.close();
await mailgunPlugin.close();
await postmarkPlugin.close();

console.log('✅ All plugins closed\n');

// ============================================================================
// WEBHOOK SETUP GUIDE
// ============================================================================

const setupGuide = `
WEBHOOK SETUP FOR EACH PROVIDER:

1. SENDGRID
   - Go to: Settings → Mail Send → Event Webhook
   - Webhook URL: https://yourdomain.com/webhooks/sendgrid
   - Events to enable: bounce, dropped, delivered, open, click, spamreport
   - Copy the Signing Secret to SENDGRID_WEBHOOK_SECRET env var

2. AWS SES
   - Create SNS topics for: Bounce, Complaint, Delivery
   - Set topic subscriptions to: HTTPS POST
   - URL: https://yourdomain.com/webhooks/aws-ses
   - Confirm SNS subscription in email

3. MAILGUN
   - Go to: Webhooks → Add Webhook
   - URL: https://yourdomain.com/webhooks/mailgun
   - Events: bounced, complained, delivered, opened, clicked
   - Copy API Key to MAILGUN_WEBHOOK_SECRET env var

4. POSTMARK
   - Go to: Account Settings → Webhooks
   - URL: https://yourdomain.com/webhooks/postmark
   - Message Stream: Default
   - Include bounce, complaint, delivery events
   - Copy API token to POSTMARK_WEBHOOK_SECRET env var
`;

console.log(setupGuide);
