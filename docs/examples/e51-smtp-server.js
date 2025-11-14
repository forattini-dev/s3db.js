/**
 * Example: SMTP Plugin - In-Process SMTP Server
 *
 * This example demonstrates how to use the SMTPPlugin to run an in-process
 * SMTP server that accepts incoming email connections.
 *
 * Useful for:
 * - Development environments (mock SMTP server)
 * - Internal microservices email routing
 * - Email collection from legacy systems
 *
 * Prerequisites:
 * - npm install smtp-server
 *
 * @example
 * node e51-smtp-server.js
 *
 * Testing the SMTP server:
 * npm install -g telnet
 * telnet localhost 25
 * > EHLO localhost
 * > MAIL FROM:<test@example.com>
 * > RCPT TO:<admin@example.com>
 * > DATA
 * > Subject: Test email
 * > Hello from SMTP server!
 * > .
 * > QUIT
 */

import { Database } from '../src/database.class.js';
import { MemoryClient } from '../src/clients/memory-client.class.js';
import { SMTPPlugin } from '../src/plugins/smtp.plugin.js';
import net from 'net';

// Create database with in-memory client
const db = new Database({
  client: new MemoryClient({ bucket: 'demo' })
});

// Initialize database
await db.connect();

// 1. Create SMTP plugin in server mode
const smtpPlugin = new SMTPPlugin({
  mode: 'server', // In-process SMTP server
  port: 25, // SMTP port (or use 1025 if you can't bind to 25)
  host: '0.0.0.0', // Listen on all interfaces
  secure: false, // No TLS (for dev)
  requireAuth: false, // No authentication required (for dev)
  emailResource: 'inbound_emails',

  // Custom handlers for SMTP events
  authHandler: async (auth, session) => {
    // Validate SMTP authentication
    console.log(`🔐 Auth attempt: ${auth.username}`);
    return { user: auth.username };
  },

  onMailFrom: async (address, session) => {
    // Validate sender
    console.log(`📤 Mail from: ${address.address}`);
    if (!address.address.endsWith('@trusted.com')) {
      throw new Error('Untrusted sender domain');
    }
  },

  onRcptTo: async (address, session) => {
    // Validate recipient
    console.log(`📬 Recipient: ${address.address}`);
  },

  onData: async (stream, session) => {
    // Process incoming email data
    console.log(`📧 Receiving email data...`);
    // In real implementation, would parse MIME
  },

  verbose: false
});

// Install and initialize plugin
db.installPlugin(smtpPlugin);
await smtpPlugin.initialize();

console.log('✅ SMTP server started on port 25');
console.log('Plugin status:', smtpPlugin.getStatus());
console.log('Waiting for incoming SMTP connections...\n');

// 2. Listen for email received events
smtpPlugin.on('email:received', (data) => {
  console.log(`📧 Email received: ${data.messageId}`);
});

smtpPlugin.on('error', (data) => {
  console.error(`❌ Error: ${data.event} - ${data.error.message}`);
});

// 3. Test client connection (after 2 seconds)
setTimeout(async () => {
  console.log('\n--- Testing SMTP client connection ---\n');

  // Create a simple SMTP client to send a test email to the server
  const socket = net.createConnection({ port: 25, host: 'localhost' });

  const commands = [
    'EHLO test-client',
    'MAIL FROM:<sender@example.com>',
    'RCPT TO:<admin@example.com>',
    'DATA',
    'From: sender@example.com',
    'To: admin@example.com',
    'Subject: Test email to SMTP server',
    'Date: ' + new Date().toUTCString(),
    '',
    'This is a test email sent to the SMTP server.',
    'It demonstrates the in-process SMTP listener.',
    '.',
    'QUIT'
  ];

  let commandIndex = 0;

  socket.on('data', (data) => {
    const response = data.toString();
    console.log(`← ${response.trim()}`);

    if (commandIndex < commands.length && !response.includes('closing')) {
      setTimeout(() => {
        const cmd = commands[commandIndex++];
        console.log(`→ ${cmd}`);
        socket.write(cmd + '\r\n');
      }, 100);
    }
  });

  socket.on('error', (err) => {
    console.error('❌ Socket error:', err.message);
    console.log('Make sure SMTP server is running (check port binding permissions)');
  });

  socket.on('close', () => {
    console.log('\n--- Test client disconnected ---');
    cleanup();
  });

  socket.on('connect', () => {
    console.log('✅ Connected to SMTP server');
    console.log('→ Sending commands...\n');
  });
}, 2000);

// 4. Periodically check stored emails
const emailCheckInterval = setInterval(async () => {
  try {
    const emailResource = await db.getResource('inbound_emails');
    const emails = await emailResource.list({ limit: 5 });

    if (emails.length > 0) {
      console.log(`\n📋 Stored emails (${emails.length}):`);
      for (const email of emails) {
        console.log(`  - From: ${email.from}, To: ${email.to.join(', ')}`);
        console.log(`    Subject: ${email.subject}`);
      }
    }
  } catch (err) {
    // Resource may not exist yet
  }
}, 5000);

// 5. Cleanup function
async function cleanup() {
  clearInterval(emailCheckInterval);
  await smtpPlugin.close();
  console.log('\n✅ SMTP server closed');
  process.exit(0);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', cleanup);

// Auto-cleanup after 30 seconds for demo
setTimeout(cleanup, 30000);

// ============================================================================
// SMTP Server Architecture
// ============================================================================

/*
The SMTP server mode supports:

1. Multiple concurrent connections
   - Handles simultaneous SMTP clients
   - Connection pooling and limits
   - Timeout management

2. Authentication
   - Custom auth handler (optional)
   - SASL mechanisms (PLAIN, LOGIN)
   - Whitelist/blacklist support

3. Sender/Recipient Validation
   - onMailFrom hook for sender validation
   - onRcptTo hook for recipient validation
   - Reject invalid addresses early

4. Email Processing
   - Automatic MIME parsing
   - Stream-based data handling (for large emails)
   - Custom onData handler for processing

5. Storage
   - Automatic storage to emails resource
   - Metadata extraction from headers
   - Status tracking (received, processed, etc.)

Typical Use Cases:
- Development/testing (no need for real SMTP provider)
- Internal microservice communication
- Email collection from legacy systems
- Multi-tenant email gateway
- Custom email routing logic
*/
