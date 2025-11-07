/**
 * Example 60: FileSystemClient - Persistent Local Storage
 *
 * Demonstrates FileSystemClient usage for persistent local development:
 * - Stores data on local filesystem (survives process restarts)
 * - Uses hierarchical directory structure (human-readable)
 * - Zero cloud dependencies (100% offline)
 * - Connection string: file:// protocol
 * - Shared storage registry (multiple instances)
 * - Manual configuration (without connection string)
 *
 * Use cases:
 * - Local development without AWS credentials
 * - Integration testing with persistent data
 * - Offline work
 * - Debugging (inspect files directly)
 * - Data portability (easy backup/restore)
 */

import { join } from 'path';
import { rm } from 'fs/promises';
import S3db from '../../src/index.js';

// Example 1: Connection string with absolute path
async function example1AbsolutePath() {
  console.log('\n=== Example 1: Absolute Path ===');

  const db = new S3db({
    verbose: true,
    connectionString: 'file:///tmp/s3db-example-60'
  });

  await db.connect();

  // Create resource
  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|email',
      age: 'number'
    }
  });

  // Insert data
  await db.resources.users.insert({ name: 'Alice', email: 'alice@example.com', age: 30 });
  await db.resources.users.insert({ name: 'Bob', email: 'bob@example.com', age: 25 });

  console.log('Data stored at: /tmp/s3db-example-60');
  console.log('Structure:');
  console.log('  /tmp/s3db-example-60/');
  console.log('  ├── __metadata__/');
  console.log('  │   ├── database.json');
  console.log('  │   └── database.json.meta.json');
  console.log('  └── resource=users/');
  console.log('      ├── id=<user1>');
  console.log('      ├── id=<user1>.meta.json');
  console.log('      ├── id=<user2>');
  console.log('      └── id=<user2>.meta.json');

  // Query data
  const users = await db.resources.users.query({});
  console.log(`\nFound ${users.length} users`);
  users.forEach(user => console.log(`  - ${user.name} (${user.email})`));

  await db.disconnect();
}

// Example 2: Connection string with relative path
async function example2RelativePath() {
  console.log('\n\n=== Example 2: Relative Path ===');

  const db = new S3db({
    verbose: false,
    connectionString: 'file://./data/s3db-example'
  });

  await db.connect();

  await db.createResource({
    name: 'products',
    attributes: {
      name: 'string|required',
      price: 'number|required',
      stock: 'number'
    }
  });

  await db.resources.products.insert({ name: 'Widget', price: 9.99, stock: 100 });
  await db.resources.products.insert({ name: 'Gadget', price: 19.99, stock: 50 });

  console.log('Data stored at: ./data/s3db-example (relative to cwd)');

  const products = await db.resources.products.query({});
  console.log(`\nFound ${products.length} products`);
  products.forEach(p => console.log(`  - ${p.name}: $${p.price} (stock: ${p.stock})`));

  await db.disconnect();
}

// Example 3: Connection string with bucket and keyPrefix
async function example3BucketAndPrefix() {
  console.log('\n\n=== Example 3: Bucket and KeyPrefix ===');

  const db = new S3db({
    verbose: false,
    connectionString: 'file:///tmp/s3db-root/mybucket/projects/app1'
  });

  await db.connect();

  await db.createResource({
    name: 'tasks',
    attributes: {
      title: 'string|required',
      completed: 'boolean',
      priority: 'number'
    }
  });

  await db.resources.tasks.insert({ title: 'Task 1', completed: false, priority: 1 });
  await db.resources.tasks.insert({ title: 'Task 2', completed: true, priority: 2 });

  console.log('basePath: /tmp/s3db-root');
  console.log('bucket: mybucket');
  console.log('keyPrefix: projects/app1');
  console.log('\nStructure:');
  console.log('  /tmp/s3db-root/');
  console.log('  └── projects/app1/');
  console.log('      ├── __metadata__/...');
  console.log('      └── resource=tasks/...');

  const tasks = await db.resources.tasks.query({});
  console.log(`\nFound ${tasks.length} tasks`);
  tasks.forEach(t => console.log(`  - [${t.completed ? '✓' : ' '}] ${t.title} (priority: ${t.priority})`));

  await db.disconnect();
}

// Example 4: Manual configuration (without connection string)
async function example4ManualConfig() {
  console.log('\n\n=== Example 4: Manual Configuration ===');

  const { FileSystemClient } = await import('../../src/clients/index.js');

  const client = new FileSystemClient({
    basePath: '/tmp/s3db-manual',
    bucket: 'test-bucket',
    keyPrefix: 'dev/data',
    verbose: false
  });

  const db = new S3db({
    verbose: false,
    client
  });

  await db.connect();

  await db.createResource({
    name: 'events',
    attributes: {
      type: 'string|required',
      timestamp: 'number|required',
      data: 'object'
    }
  });

  await db.resources.events.insert({
    type: 'user.login',
    timestamp: Date.now(),
    data: { userId: 123, ip: '192.168.1.1' }
  });

  console.log('Manual configuration:');
  console.log('  basePath:', client.basePath);
  console.log('  bucket:', client.bucket);
  console.log('  keyPrefix:', client.keyPrefix);

  const events = await db.resources.events.query({});
  console.log(`\nFound ${events.length} events`);

  await db.disconnect();
}

// Example 5: Shared storage (multiple instances)
async function example5SharedStorage() {
  console.log('\n\n=== Example 5: Shared Storage Registry ===');

  // First database instance
  const db1 = new S3db({
    verbose: false,
    connectionString: 'file:///tmp/s3db-shared'
  });

  await db1.connect();

  await db1.createResource({
    name: 'messages',
    attributes: {
      text: 'string|required',
      sender: 'string'
    }
  });

  await db1.resources.messages.insert({
    text: 'Hello from db1',
    sender: 'Alice'
  });

  console.log('DB1 inserted 1 message');

  // Second database instance (shares same basePath)
  const db2 = new S3db({
    verbose: false,
    connectionString: 'file:///tmp/s3db-shared'
  });

  await db2.connect();

  // Can read data written by db1 (shared storage)
  const messages = await db2.resources.messages.query({});
  console.log(`DB2 found ${messages.length} messages (shared storage!):`);
  messages.forEach(m => console.log(`  - "${m.text}" from ${m.sender}`));

  // Write from db2
  await db2.resources.messages.insert({
    text: 'Hello from db2',
    sender: 'Bob'
  });

  // Read from db1 (sees db2's changes)
  const allMessages = await db1.resources.messages.query({});
  console.log(`DB1 now sees ${allMessages.length} messages (including db2's write)`);

  await db1.disconnect();
  await db2.disconnect();

  console.log('\nShared storage enables:');
  console.log('  - Reconnection to same data');
  console.log('  - Multiple processes accessing same database');
  console.log('  - Persistent data between runs');
}

// Example 6: Partitioned data structure
async function example6Partitioning() {
  console.log('\n\n=== Example 6: Partitioned Data (Hierarchical Directories) ===');

  const db = new S3db({
    verbose: false,
    connectionString: 'file:///tmp/s3db-partitioned'
  });

  await db.connect();

  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string',
      region: 'string'
    },
    partitions: {
      byRegion: {
        fields: {
          region: 'string'
        }
      }
    }
  });

  await db.resources.users.insert({ name: 'Alice', email: 'alice@us.com', region: 'US' });
  await db.resources.users.insert({ name: 'Bob', email: 'bob@eu.com', region: 'EU' });
  await db.resources.users.insert({ name: 'Charlie', email: 'charlie@us.com', region: 'US' });

  console.log('Hierarchical directory structure with partitions:');
  console.log('  /tmp/s3db-partitioned/');
  console.log('  └── resource=users/');
  console.log('      └── partition=byRegion/');
  console.log('          ├── region=US/');
  console.log('          │   ├── id=<alice>');
  console.log('          │   ├── id=<alice>.meta.json');
  console.log('          │   ├── id=<charlie>');
  console.log('          │   └── id=<charlie>.meta.json');
  console.log('          └── region=EU/');
  console.log('              ├── id=<bob>');
  console.log('              └── id=<bob>.meta.json');

  // Query from specific partition (O(1) directory scan)
  const usUsers = await db.resources.users.query({ region: 'US' });
  console.log(`\nUS users: ${usUsers.length}`);
  usUsers.forEach(u => console.log(`  - ${u.name}`));

  await db.disconnect();
}

// Example 7: Performance comparison
async function example7Performance() {
  console.log('\n\n=== Example 7: Performance Comparison ===');

  const { MemoryClient, FileSystemClient } = await import('../../src/clients/index.js');

  const RECORDS = 100;

  // Test with MemoryClient
  const memClient = new MemoryClient({ bucket: 'test', verbose: false });
  const dbMem = new S3db({ client: memClient, verbose: false });
  await dbMem.connect();
  await dbMem.createResource({
    name: 'items',
    attributes: { value: 'number' }
  });

  console.time('MemoryClient insert');
  for (let i = 0; i < RECORDS; i++) {
    await dbMem.resources.items.insert({ value: i });
  }
  console.timeEnd('MemoryClient insert');

  // Test with FileSystemClient
  const fsClient = new FileSystemClient({ basePath: '/tmp/s3db-perf', verbose: false });
  const dbFs = new S3db({ client: fsClient, verbose: false });
  await dbFs.connect();
  await dbFs.createResource({
    name: 'items',
    attributes: { value: 'number' }
  });

  console.time('FileSystemClient insert');
  for (let i = 0; i < RECORDS; i++) {
    await dbFs.resources.items.insert({ value: i });
  }
  console.timeEnd('FileSystemClient insert');

  console.log(`\nFileSystemClient is slower due to disk I/O but:`);
  console.log('  ✓ Data survives process restarts');
  console.log('  ✓ Human-readable file structure');
  console.log('  ✓ Easy to inspect and debug');
  console.log('  ✓ No cloud dependencies');

  await dbMem.disconnect();
  await dbFs.disconnect();
}

// Cleanup helper
async function cleanup() {
  console.log('\n\n=== Cleanup ===');

  const paths = [
    '/tmp/s3db-example-60',
    '/tmp/s3db-root',
    '/tmp/s3db-manual',
    '/tmp/s3db-shared',
    '/tmp/s3db-partitioned',
    '/tmp/s3db-perf',
    './data/s3db-example'
  ];

  for (const p of paths) {
    try {
      await rm(p, { recursive: true, force: true });
      console.log(`Deleted: ${p}`);
    } catch (err) {
      // Ignore if doesn't exist
    }
  }

  console.log('\nCleanup complete!');
}

// Run all examples
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Example 60: FileSystemClient - Persistent Local Storage  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await example1AbsolutePath();
    await example2RelativePath();
    await example3BucketAndPrefix();
    await example4ManualConfig();
    await example5SharedStorage();
    await example6Partitioning();
    await example7Performance();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await cleanup();
  }

  console.log('\n✓ All examples completed!\n');
}

main();
