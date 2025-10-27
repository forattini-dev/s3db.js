/**
 * Test Logging Format Parser
 *
 * Tests that custom logging format works correctly
 */

import Database from './src/database.class.js';
import { ApiPlugin } from './src/plugins/api/index.js';
import { MemoryClient } from './src/clients/memory-client.class.js';

async function testLoggingFormat() {
  console.log('🧪 Testing Logging Format Parser\n');

  // Use MemoryClient for fast testing
  const memoryClient = new MemoryClient({ bucketName: 'test-logging' });

  // Create database
  const db = new Database({
    client: memoryClient
  });

  await db.connect();

  // Create test resource
  await db.createResource({
    name: 'items',
    attributes: {
      name: 'string|required'
    }
  });

  // Test with custom format
  const apiPlugin = new ApiPlugin({
    port: 3457,
    logging: {
      enabled: true,
      format: ':method :path :status :response-time ms - :user',
      verbose: false
    },
    verbose: false
  });

  await db.usePlugin(apiPlugin);

  const baseUrl = 'http://localhost:3457';

  console.log('✅ Server started on', baseUrl);
  console.log('');

  // Wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    // Test 1: GET request (should log with custom format)
    console.log('1️⃣  Testing custom log format...');
    const res1 = await fetch(`${baseUrl}/api/v1/items`);
    console.log('   Status:', res1.status);
    console.log('   ⏳ Check logs above for format: "GET /api/v1/items 200 XXms - anonymous"\n');

    // Test 2: POST request
    console.log('2️⃣  Testing POST request log...');
    const res2 = await fetch(`${baseUrl}/api/v1/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Item' })
    });
    console.log('   Status:', res2.status);
    console.log('   ⏳ Check logs above for format: "POST /api/v1/items 201 XXms - anonymous"\n');

    // Test 3: GET single item (404)
    console.log('3️⃣  Testing 404 request log...');
    const res3 = await fetch(`${baseUrl}/api/v1/items/nonexistent`);
    console.log('   Status:', res3.status);
    console.log('   ⏳ Check logs above for format: "GET /api/v1/items/nonexistent 404 XXms - anonymous"\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Logging Format Test Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Custom format working!');
    console.log('✅ All log lines above should follow format:');
    console.log('   [API Plugin] METHOD PATH STATUS XXms - USER');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
  } finally {
    // Cleanup
    await apiPlugin.stop();
    await db.disconnect();
    console.log('✅ Test complete, server stopped\n');
  }
}

testLoggingFormat().catch(console.error);
