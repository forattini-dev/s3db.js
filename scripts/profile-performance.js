/**
 * Quick Performance Profiler
 *
 * Identifies performance bottlenecks in createResource() and insert()
 */

import { Database } from '../src/database.class.js';
import { MemoryClient } from '../src/clients/memory-client.class.js';

// Simple timer utility
function timer(label) {
  const start = performance.now();
  return {
    end: () => {
      const duration = (performance.now() - start).toFixed(2);
      console.log(`[TIMING] ${label}: ${duration}ms`);
      return parseFloat(duration);
    }
  };
}

async function profileCreateResource() {
  console.log('\n=== PROFILING createResource() ===\n');

  const dbTimer = timer('Database creation');
  const db = new Database({
    client: new MemoryClient({ bucket: 'profile', keyPrefix: 'profile/' }),
    deferMetadataWrites: true,  // Enable debounced metadata uploads
    metadataWriteDelay: 100     // 100ms delay
  });
  dbTimer.end();

  const connectTimer = timer('Database connect');
  await db.connect();
  connectTimer.end();

  console.log('\nCreating 10 resources...');
  const durations = [];

  for (let i = 1; i <= 10; i++) {
    const resourceTimer = timer(`Resource ${i}`);
    await db.createResource({
      name: `test_resource_${i}`,
      attributes: {
        id: 'string|required',
        name: 'string',
        value: 'number',
        active: 'boolean'
      }
    });
    const duration = resourceTimer.end();
    durations.push(duration);
  }

  console.log('\n--- createResource() Statistics ---');
  console.log(`Total time: ${durations.reduce((a, b) => a + b, 0).toFixed(2)}ms`);
  console.log(`Average: ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)}ms`);
  console.log(`Min: ${Math.min(...durations).toFixed(2)}ms`);
  console.log(`Max: ${Math.max(...durations).toFixed(2)}ms`);

  // Check if time increases (O(n) or worse)
  const first3 = durations.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last3 = durations.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const increase = ((last3 - first3) / first3 * 100).toFixed(1);

  if (Math.abs(increase) > 10) {
    console.log(`⚠️  WARNING: ${increase}% increase from first 3 to last 3 resources (complexity issue?)`);
  }

  await db.disconnect();
  return db;
}

async function profileInsertOperations() {
  console.log('\n=== PROFILING insert() Operations ===\n');

  const db = new Database({
    client: new MemoryClient({ bucket: 'profile2', keyPrefix: 'profile2/' }),
    deferMetadataWrites: true,  // Enable debounced metadata uploads
    metadataWriteDelay: 100     // 100ms delay
  });
  await db.connect();

  const resourceTimer = timer('Resource creation');
  const resource = await db.createResource({
    name: 'test_inserts',
    attributes: {
      id: 'string|required',
      name: 'string',
      count: 'number'
    }
  });
  resourceTimer.end();

  console.log('\nInserting 100 records...');
  const insertDurations = [];

  for (let i = 0; i < 100; i++) {
    const insertTimer = timer(`Insert ${i + 1}`);
    await resource.insert({
      id: `record-${i}`,
      name: `Record ${i}`,
      count: i
    });
    const duration = insertTimer.end();
    insertDurations.push(duration);

    // Only log every 10th to avoid spam
    if ((i + 1) % 10 !== 0) {
      // Clear the last console.log line
      process.stdout.moveCursor(0, -1);
      process.stdout.clearLine(1);
    }
  }

  console.log('\n--- insert() Statistics ---');
  console.log(`Total time: ${insertDurations.reduce((a, b) => a + b, 0).toFixed(2)}ms`);
  console.log(`Average: ${(insertDurations.reduce((a, b) => a + b, 0) / insertDurations.length).toFixed(2)}ms`);
  console.log(`Min: ${Math.min(...insertDurations).toFixed(2)}ms`);
  console.log(`Max: ${Math.max(...insertDurations).toFixed(2)}ms`);

  // Check for performance degradation
  const first10 = insertDurations.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const last10 = insertDurations.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const increase = ((last10 - first10) / first10 * 100).toFixed(1);

  if (Math.abs(increase) > 10) {
    console.log(`⚠️  WARNING: ${increase}% increase from first 10 to last 10 inserts (complexity issue?)`);
  }

  // Test list operation
  console.log('\nTesting list() operation...');
  const listTimer = timer('list() with limit 50');
  const results = await resource.list({ limit: 50 });
  listTimer.end();
  console.log(`Retrieved ${results.length} records`);

  await db.disconnect();
}

async function main() {
  console.log('🔍 s3db.js Performance Profiler\n');
  console.log('This will help identify performance bottlenecks\n');

  try {
    await profileCreateResource();
    await profileInsertOperations();

    console.log('\n✅ Profiling complete!\n');
  } catch (error) {
    console.error('\n❌ Profiling failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
