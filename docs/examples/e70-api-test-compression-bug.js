/**
 * Example 70: API Plugin - Test Compression Bug Fix
 *
 * Test to verify ERR_CONTENT_DECODING_FAILED is fixed
 *
 * Run: node docs/examples/e70-api-test-compression-bug.js
 * Then: curl -v http://localhost:3001/v1/test
 */

import { Database, ApiPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 70: API Plugin - Compression Bug Test');
console.log('='.repeat(60));

const db = new Database({
  client: 'memory',
  verbose: false
});

// Create test resource
const test = await db.createResource({
  name: 'test',
  attributes: {
    name: 'string|required',
    value: 'number|required'
  }
});

await test.insert({ name: 'test1', value: 100 });

// Install API Plugin with compression DISABLED (default)
const apiPlugin = new ApiPlugin({
  port: 3001,
  verbose: true,
  docs: { enabled: true },

  // IMPORTANT: Keep compression disabled (default is false)
  // compression: { enabled: false },  // Already false by default

  resources: {
    test: {
      methods: ['GET', 'POST'],
      auth: false
    }
  }
});

await db.install(apiPlugin);
await db.start();

console.log('\n✅ API Server started on http://localhost:3001');
console.log('='.repeat(60));
console.log('\n🧪 Test Commands:');
console.log('\n1. Test with curl (verbose):');
console.log('   curl -v http://localhost:3001/v1/test');
console.log('\n2. Check headers:');
console.log('   curl -I http://localhost:3001/v1/test');
console.log('\n3. Test in browser:');
console.log('   Open: http://localhost:3001/v1/test');
console.log('   Open: http://localhost:3001/docs');
console.log('\n4. Expected: NO "Content-Encoding" header in response');
console.log('\n='.repeat(60));
console.log('\nℹ️  Press Ctrl+C to stop\n');

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await db.stop();
  console.log('✅ Server stopped');
  process.exit(0);
});
