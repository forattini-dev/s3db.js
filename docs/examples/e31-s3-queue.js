/**
 * Example 31: Distributed Queue Processing with S3QueuePlugin
 *
 * This example demonstrates how to use the S3QueuePlugin to create
 * a distributed queue processing system with:
 * - Atomic message claiming using S3 ETags (zero race conditions)
 * - Multiple concurrent workers
 * - Automatic retries with exponential backoff
 * - Dead letter queue for failed messages
 * - Queue statistics and monitoring
 */

import { Database, S3QueuePlugin } from '../src/index.js';

// Simulate email sending
async function sendEmail(email) {
  console.log(`Sending email to ${email.to}: ${email.subject}`);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // Simulate random failures (20% failure rate)
  if (Math.random() < 0.2) {
    throw new Error(`Failed to send email to ${email.to}`);
  }

  console.log(`✅ Email sent successfully to ${email.to}`);
  return { messageId: `msg-${Date.now()}`, status: 'sent' };
}

async function main() {
  // Create database instance
  const db = new Database({
    connection: process.env.S3DB_CONNECTION || 's3://minioadmin:minioadmin@localhost:9000/s3db-transactions-example'
  });

  await db.connect();
  console.log('Connected to S3DB\n');

  // Create email resource
  const emails = await db.createResource({
    name: 'emails',
    attributes: {
      id: 'string|required',
      to: 'string|required',
      subject: 'string|required',
      body: 'string',
      priority: 'string|default:normal'
    },
    timestamps: true
  });

  console.log('✅ Created emails resource\n');

  // Setup S3QueuePlugin
  const transactionsPlugin = new S3QueuePlugin({
    resource: 'emails',
    visibilityTimeout: 30000,        // 30 seconds
    pollInterval: 1000,               // 1 second
    maxAttempts: 3,                   // Retry up to 3 times
    concurrency: 5,                   // 5 concurrent workers
    deadLetterResource: 'failed_emails',
    autoStart: true,                  // Auto-start workers
    verbose: true,                    // Enable logging

    // Message handler
    onMessage: async (email, context) => {
      console.log(`\n[Worker ${context.workerId}] Processing email ${email.id} (attempt ${context.attempts})`);
      console.log(`  To: ${email.to}`);
      console.log(`  Subject: ${email.subject}`);

      // Send email
      const result = await sendEmail(email);

      return result;
    },

    // Error handler
    onError: (error, email) => {
      console.error(`\n❌ Error processing email ${email.id}: ${error.message}`);
    },

    // Completion handler
    onComplete: (email, result) => {
      console.log(`\n✅ Completed email ${email.id}: ${JSON.stringify(result)}`);
    }
  });

  db.use(transactionsPlugin);
  console.log('✅ S3QueuePlugin configured\n');

  // Listen to events
  transactionsPlugin.on('message.enqueued', (event) => {
    console.log(`📨 Message enqueued: ${event.id}`);
  });

  transactionsPlugin.on('message.completed', (event) => {
    console.log(`✅ Message completed in ${event.duration}ms (${event.attempts} attempts)`);
  });

  transactionsPlugin.on('message.retry', (event) => {
    console.log(`🔄 Message retry: ${event.queueId} (attempt ${event.attempts})`);
  });

  transactionsPlugin.on('message.dead', (event) => {
    console.log(`💀 Message moved to dead letter queue: ${event.queueId}`);
  });

  // Enqueue some emails
  console.log('\n=== Enqueueing Emails ===\n');

  const emailsToSend = [
    { to: 'user1@example.com', subject: 'Welcome!', body: 'Welcome to our service' },
    { to: 'user2@example.com', subject: 'Newsletter', body: 'Latest updates' },
    { to: 'user3@example.com', subject: 'Reminder', body: 'Your subscription expires soon' },
    { to: 'user4@example.com', subject: 'Promotion', body: '50% off today!' },
    { to: 'user5@example.com', subject: 'Update', body: 'New features available' },
    { to: 'user6@example.com', subject: 'Alert', body: 'Important notification' },
    { to: 'user7@example.com', subject: 'Report', body: 'Monthly report attached' },
    { to: 'user8@example.com', subject: 'Invite', body: 'Join our community' },
    { to: 'user9@example.com', subject: 'Feedback', body: 'We value your opinion' },
    { to: 'user10@example.com', subject: 'Thank You', body: 'Thanks for your support' }
  ];

  for (const emailData of emailsToSend) {
    await emails.enqueue(emailData);
  }

  console.log(`\n✅ Enqueued ${emailsToSend.length} emails\n`);

  // Show initial stats
  let stats = await emails.queueStats();
  console.log('\n=== Initial Queue Stats ===');
  console.log(stats);

  // Wait for processing (workers are already running due to autoStart: true)
  console.log('\n=== Processing Messages ===');
  console.log('Workers are processing messages...\n');

  // Monitor progress
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    stats = await emails.queueStats();
    console.log(`\n[${new Date().toISOString()}] Queue Stats:`, stats);

    if (stats.pending === 0 && stats.processing === 0) {
      console.log('\n✅ All messages processed!');
      break;
    }
  }

  // Final stats
  stats = await emails.queueStats();
  console.log('\n=== Final Queue Stats ===');
  console.log(stats);

  // Check dead letter queue
  if (stats.dead > 0) {
    console.log('\n=== Dead Letter Queue ===');
    const deadLetters = await db.resources.failed_emails.list();
    console.log(`Found ${deadLetters.length} failed messages:`);

    for (const dl of deadLetters) {
      console.log(`  - Email to ${dl.data.to}: ${dl.error} (${dl.attempts} attempts)`);
    }
  }

  // Stop processing
  await emails.stopProcessing();
  console.log('\n✅ Workers stopped');

  // Example: Manual processing control
  console.log('\n=== Manual Processing Control ===\n');

  // Enqueue more emails
  await emails.enqueue({ to: 'manual1@example.com', subject: 'Manual Test 1' });
  await emails.enqueue({ to: 'manual2@example.com', subject: 'Manual Test 2' });
  console.log('✅ Enqueued 2 more emails');

  // Start processing manually with custom handler
  await emails.startProcessing(async (email) => {
    console.log(`[Manual Handler] Processing: ${email.subject}`);
    await sendEmail(email);
    return { manual: true };
  }, { concurrency: 2 });

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Stop
  await emails.stopProcessing();
  console.log('✅ Manual processing stopped');

  // Example: ETag-based conditional updates
  console.log('\n=== ETag Conditional Updates ===\n');

  const testEmail = await emails.enqueue({
    to: 'etag-test@example.com',
    subject: 'ETag Test'
  });

  console.log(`Created email: ${testEmail.id}`);

  // Get with ETag
  const email1 = await emails.get(testEmail.id);
  console.log(`ETag: ${email1._etag}`);

  // Conditional update (should succeed)
  const result1 = await emails.updateConditional(
    testEmail.id,
    { subject: 'ETag Test - Updated' },
    { ifMatch: email1._etag }
  );

  console.log(`First update: ${result1.success ? '✅ Success' : '❌ Failed'}`);

  // Try to update with old ETag (should fail)
  const result2 = await emails.updateConditional(
    testEmail.id,
    { subject: 'ETag Test - Update 2' },
    { ifMatch: email1._etag }  // Using old ETag
  );

  console.log(`Second update with old ETag: ${result2.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`Error: ${result2.error}`);

  // Cleanup
  await db.disconnect();
  console.log('\n✅ Disconnected from database');
}

// Run example
main().catch(console.error);

/**
 * Expected Output:
 *
 * Connected to S3DB
 *
 * ✅ Created emails resource
 *
 * ✅ S3QueuePlugin configured
 *
 * === Enqueueing Emails ===
 *
 * 📨 Message enqueued: email-1
 * 📨 Message enqueued: email-2
 * ...
 *
 * ✅ Enqueued 10 emails
 *
 * === Initial Queue Stats ===
 * { total: 10, pending: 10, processing: 0, completed: 0, failed: 0, dead: 0 }
 *
 * === Processing Messages ===
 * Workers are processing messages...
 *
 * [Worker worker-123-abc] Processing email email-1 (attempt 1)
 *   To: user1@example.com
 *   Subject: Welcome!
 * Sending email to user1@example.com: Welcome!
 * ✅ Email sent successfully to user1@example.com
 * ✅ Message completed in 105ms (1 attempts)
 *
 * [Worker worker-123-def] Processing email email-2 (attempt 1)
 *   To: user2@example.com
 *   Subject: Newsletter
 * ...
 *
 * [2025-10-08T12:00:00.000Z] Queue Stats: { total: 10, pending: 3, processing: 2, completed: 5, failed: 0, dead: 0 }
 *
 * ✅ All messages processed!
 *
 * === Final Queue Stats ===
 * { total: 10, pending: 0, processing: 0, completed: 9, failed: 0, dead: 1 }
 *
 * === Dead Letter Queue ===
 * Found 1 failed messages:
 *   - Email to user3@example.com: Failed to send email (3 attempts)
 *
 * ✅ Workers stopped
 *
 * === ETag Conditional Updates ===
 *
 * Created email: email-test-123
 * ETag: "abc123def456"
 * First update: ✅ Success
 * Second update with old ETag: ❌ Failed
 * Error: ETag mismatch - object was modified by another process
 *
 * ✅ Disconnected from database
 */
