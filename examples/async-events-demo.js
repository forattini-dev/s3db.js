#!/usr/bin/env node

/**
 * Async Events Demo
 * 
 * This example demonstrates the difference between async and sync event emission
 * in s3db.js resources. By default, events are emitted asynchronously for better
 * performance.
 */

import Database from '../src/index.js';

async function demo() {
  // Initialize database (use your own connection string)
  const db = new Database({ 
    connectionString: process.env.S3DB_CONNECTION || 'http://minioadmin:minioadmin@localhost:9000/test-bucket' 
  });
  
  console.log('🚀 Async Events Demo\n');
  
  // Create resource with ASYNC events (default)
  const asyncUsers = await db.createResource({
    name: 'async_users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required'
    },
    asyncEvents: true // This is the default, shown for clarity
  });
  
  // Create resource with SYNC events
  const syncUsers = await db.createResource({
    name: 'sync_users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required'
    },
    asyncEvents: false // Events will block operations
  });
  
  // Add listeners that simulate heavy work
  const heavyWork = (label) => {
    const start = Date.now();
    // Simulate 100ms of work
    while (Date.now() - start < 100) {
      // Busy wait
    }
    console.log(`  ✓ ${label} completed (took 100ms)`);
  };
  
  asyncUsers.on('insert', () => heavyWork('Async listener 1'));
  asyncUsers.on('insert', () => heavyWork('Async listener 2'));
  
  syncUsers.on('insert', () => heavyWork('Sync listener 1'));
  syncUsers.on('insert', () => heavyWork('Sync listener 2'));
  
  // Test ASYNC events
  console.log('--- Testing ASYNC Events ---');
  console.log('Inserting user (async)...');
  const asyncStart = Date.now();
  
  await asyncUsers.insert({
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com'
  });
  
  const asyncTime = Date.now() - asyncStart;
  console.log(`Insert completed in ${asyncTime}ms`);
  console.log('Notice: Insert returned immediately, listeners run in background\n');
  
  // Wait for async listeners to complete
  await new Promise(resolve => setTimeout(resolve, 150));
  
  // Test SYNC events
  console.log('--- Testing SYNC Events ---');
  console.log('Inserting user (sync)...');
  const syncStart = Date.now();
  
  await syncUsers.insert({
    id: 'user-2',
    name: 'Jane Doe',
    email: 'jane@example.com'
  });
  
  const syncTime = Date.now() - syncStart;
  console.log(`Insert completed in ${syncTime}ms`);
  console.log('Notice: Insert waited for all listeners (200ms total)\n');
  
  // Demonstrate runtime mode change
  console.log('--- Runtime Mode Change ---');
  console.log('Changing async resource to sync mode...');
  asyncUsers.setAsyncMode(false);
  
  const runtimeStart = Date.now();
  await asyncUsers.insert({
    id: 'user-3',
    name: 'Bob Smith',
    email: 'bob@example.com'
  });
  
  const runtimeTime = Date.now() - runtimeStart;
  console.log(`Insert completed in ${runtimeTime}ms (now in sync mode)\n`);
  
  // Clean up
  await db.deleteResource('async_users');
  await db.deleteResource('sync_users');
  
  console.log('✅ Demo completed!');
  console.log('\nKey Takeaways:');
  console.log('• Async events (default) = Non-blocking = Better performance');
  console.log('• Sync events = Blocking = Predictable for testing');
  console.log('• You can change modes at runtime with setAsyncMode()');
}

// Run demo
demo().catch(error => {
  console.error('Demo failed:', error.message);
  console.log('\nMake sure your S3/MinIO server is running and accessible.');
  process.exit(1);
});