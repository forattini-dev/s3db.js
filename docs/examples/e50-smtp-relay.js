/**
 * Example: SMTP Plugin - Email Delivery via Relay
 *
 * This example demonstrates how to use the SMTPPlugin to send emails
 * via an external SMTP relay (SendGrid, AWS SES, Mailgun, etc.)
 *
 * Prerequisites:
 * - npm install nodemailer
 * - SMTP credentials (user, pass/API key)
 *
 * @example
 * node e50-smtp-relay.js
 */

import { Database } from '../src/database.class.js';
import { MemoryClient } from '../src/clients/memory-client.class.js';
import { SMTPPlugin } from '../src/plugins/smtp.plugin.js';

// Create database with in-memory client (for demo)
const db = new Database({
  client: new MemoryClient({ bucket: 'demo' })
});

// Initialize database
await db.connect();

// 1. Create SMTP plugin for SendGrid relay
const smtpPlugin = new SMTPPlugin({
  mode: 'relay', // External SMTP relay
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: 'apikey', // SendGrid requires 'apikey' as user
    pass: process.env.SENDGRID_API_KEY || 'your-api-key-here'
  },
  emailResource: 'emails', // Resource to store email records
  retryPolicy: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 60000,
    multiplier: 2,
    jitter: 0.1
  },
  rateLimit: {
    maxPerSecond: 100, // 100 emails/sec
    maxQueueDepth: 10000
  },
  verbose: false
});

// Install plugin into database
db.installPlugin(smtpPlugin);

// Initialize plugin
await smtpPlugin.initialize();

console.log('✅ SMTP plugin initialized');
console.log('Plugin status:', smtpPlugin.getStatus());

// 2. Send a simple email
try {
  const email1 = await smtpPlugin.sendEmail({
    from: 'noreply@example.com',
    to: 'recipient@example.com',
    subject: 'Welcome to our service!',
    body: 'Hello! Thanks for signing up.',
    html: '<h1>Hello!</h1><p>Thanks for signing up.</p>'
  });

  console.log('✅ Email sent successfully');
  console.log('Email ID:', email1.id);
  console.log('Status:', email1.status);
} catch (err) {
  console.error('❌ Failed to send email:', err.message);
}

// 3. Send email with attachments
try {
  const email2 = await smtpPlugin.sendEmail({
    from: 'support@example.com',
    to: 'customer@example.com',
    subject: 'Your invoice',
    body: 'Please find your invoice attached.',
    attachments: [
      {
        filename: 'invoice-2024-01.pdf',
        content: Buffer.from('PDF content here'),
        contentType: 'application/pdf'
      }
    ]
  });

  console.log('✅ Email with attachment sent');
  console.log('Email ID:', email2.id);
} catch (err) {
  console.error('❌ Failed to send email with attachment:', err.message);
}

// 4. Send email to multiple recipients
try {
  const email3 = await smtpPlugin.sendEmail({
    from: 'team@example.com',
    to: [
      'alice@example.com',
      'bob@example.com',
      'charlie@example.com'
    ],
    cc: 'manager@example.com',
    subject: 'Project Update',
    body: 'The project is on track.',
    html: '<h2>Project Update</h2><p>The project is on track.</p>'
  });

  console.log('✅ Email sent to multiple recipients');
  console.log('Email ID:', email3.id);
} catch (err) {
  console.error('❌ Failed to send email to multiple recipients:', err.message);
}

// 5. Query email records from database
try {
  const emailResource = await db.getResource('emails');
  const emails = await emailResource.list({ limit: 10 });

  console.log('\n📧 Email records:');
  for (const email of emails) {
    console.log(`  - ${email.id}: ${email.subject} → ${email.to.join(', ')} (${email.status})`);
  }
} catch (err) {
  console.error('❌ Failed to query emails:', err.message);
}

// 6. Simulate retry for failed emails
try {
  const emailResource = await db.getResource('emails');
  const failedEmails = await emailResource.query({ status: 'failed' });

  console.log(`\n⚠️ Failed emails to retry: ${failedEmails.length}`);

  for (const failedEmail of failedEmails) {
    console.log(`  Retrying: ${failedEmail.id} (attempt ${failedEmail.attempts + 1}/${failedEmail.maxAttempts})`);
    // In production, this would be handled by scheduled job
  }
} catch (err) {
  console.error('❌ Failed to query failed emails:', err.message);
}

// 7. Clean up
await smtpPlugin.close();
console.log('\n✅ SMTP plugin closed');

// ============================================================================
// Alternative SMTP Configurations
// ============================================================================

// AWS SES Example
/*
const sesPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.AWS_SES_USERNAME,
    pass: process.env.AWS_SES_PASSWORD
  },
  emailResource: 'emails'
});
*/

// Mailgun Example
/*
const mailgunPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'smtp.mailgun.org',
  port: 587,
  secure: false,
  auth: {
    user: 'postmaster@your-domain.mailgun.org',
    pass: process.env.MAILGUN_SMTP_PASSWORD
  },
  emailResource: 'emails'
});
*/

// Local SMTP Server Example (for development)
/*
const localPlugin = new SMTPPlugin({
  mode: 'relay',
  host: 'localhost',
  port: 1025, // mailhog, MailDev, etc.
  secure: false,
  auth: {
    user: 'test',
    pass: 'test'
  },
  emailResource: 'emails'
});
*/
