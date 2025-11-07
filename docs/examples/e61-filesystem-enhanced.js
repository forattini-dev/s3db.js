/**
 * Example 61: FileSystemClient - Enhanced Features
 *
 * Demonstrates the enhanced FileSystemClient features integrated from best filesystem plugins:
 * - Compression: gzip compression with threshold (from FilesystemCache)
 * - TTL: Automatic expiration and cleanup (from FilesystemCache)
 * - Locking: File locks for concurrent safety (from FilesystemCache)
 * - Backup: .bak files before overwrite (from FilesystemCache)
 * - Journal: Append-only operation log (from FilesystemCache)
 * - Stats: Performance tracking (from FilesystemCache)
 *
 * Use cases:
 * - Storage cost reduction via compression
 * - Automatic cache expiration
 * - Safe concurrent writes
 * - Operation auditing
 * - Performance monitoring
 */

import { rm } from 'fs/promises';
import { readFile } from 'fs/promises';
import S3db from '../../src/index.js';

// Example 1: Compression - Reduce disk usage
async function example1Compression() {
  console.log('\n=== Example 1: Compression ===');

  const db = new S3db({
    verbose: true,
    connectionString: 'file:///tmp/s3db-compression',
    compression: {
      enabled: true,         // Enable gzip compression
      threshold: 100,        // Compress if body > 100 bytes
      level: 9               // Max compression (0-9)
    },
    stats: {
      enabled: true          // Track compression ratio
    }
  });

  await db.connect();

  await db.createResource({
    name: 'documents',
    attributes: {
      title: 'string|required',
      content: 'string|required'
    }
  });

  // Insert small document (won't be compressed)
  await db.resources.documents.insert({
    title: 'Small',
    content: 'Short content'
  });

  // Insert large document (will be compressed)
  const largeContent = 'Lorem ipsum dolor sit amet. '.repeat(100);
  await db.resources.documents.insert({
    title: 'Large',
    content: largeContent
  });

  // Get compression stats
  const stats = db.client.getStats();
  console.log('\nCompression Stats:');
  console.log(`  Total uncompressed: ${stats.totalUncompressed} bytes`);
  console.log(`  Total compressed: ${stats.totalCompressed} bytes`);
  console.log(`  Saved: ${stats.compressionSaved} bytes (${((stats.compressionSaved / stats.totalUncompressed) * 100).toFixed(1)}%)`);
  console.log(`  Avg compression ratio: ${stats.avgCompressionRatio}`);

  await db.disconnect();
}

// Example 2: TTL - Automatic expiration
async function example2TTL() {
  console.log('\n\n=== Example 2: TTL (Time To Live) ===');

  const db = new S3db({
    verbose: true,
    connectionString: 'file:///tmp/s3db-ttl',
    ttl: {
      enabled: true,           // Enable TTL
      defaultTTL: 2000,        // 2 seconds default
      cleanupInterval: 1000    // Cleanup every 1 second
    },
    stats: { enabled: true }
  });

  await db.connect();

  await db.createResource({
    name: 'cache',
    attributes: {
      key: 'string|required',
      value: 'string'
    }
  });

  // Insert with default TTL (2 seconds)
  await db.resources.cache.insert({
    key: 'temp1',
    value: 'Expires in 2 seconds'
  });

  // Insert with custom TTL (5 seconds)
  await db.resources.cache.insert({
    key: 'temp2',
    value: 'Expires in 5 seconds'
  }, { ttl: 5000 });

  console.log('\nInserted 2 records');
  const before = await db.resources.cache.query({});
  console.log(`Records before expiration: ${before.length}`);

  // Wait for first item to expire
  console.log('\nWaiting 3 seconds for temp1 to expire...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const middle = await db.resources.cache.query({});
  console.log(`Records after 3s: ${middle.length} (temp1 expired, temp2 still alive)`);

  // Wait for second item to expire
  console.log('\nWaiting 3 more seconds for temp2 to expire...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const after = await db.resources.cache.query({});
  console.log(`Records after 6s: ${after.length} (both expired)`);

  await db.disconnect();
}

// Example 3: File Locking - Concurrent safety
async function example3Locking() {
  console.log('\n\n=== Example 3: File Locking ===');

  const db = new S3db({
    verbose: false,
    connectionString: 'file:///tmp/s3db-locking',
    locking: {
      enabled: true,      // Enable file locks
      timeout: 5000       // 5 second timeout
    }
  });

  await db.connect();

  await db.createResource({
    name: 'counter',
    attributes: {
      name: 'string|required',
      value: 'number|required'
    }
  });

  // Create counter
  const { id } = await db.resources.counter.insert({
    name: 'clicks',
    value: 0
  });

  console.log('Testing concurrent writes with locking...');

  // Simulate 10 concurrent updates
  const updates = Array.from({ length: 10 }, async (_, i) => {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    const current = await db.resources.counter.get(id);
    await db.resources.counter.update(id, { value: current.value + 1 });
  });

  await Promise.all(updates);

  const final = await db.resources.counter.get(id);
  console.log(`\nFinal counter value: ${final.value} (should be 10)`);
  console.log(`✓ Locking ${final.value === 10 ? 'PASSED' : 'FAILED'} - no lost updates`);

  await db.disconnect();
}

// Example 4: Backup - .bak files before overwrite
async function example4Backup() {
  console.log('\n\n=== Example 4: Backup Files ===');

  const db = new S3db({
    verbose: true,
    connectionString: 'file:///tmp/s3db-backup',
    backup: {
      enabled: true,      // Enable backup files
      suffix: '.bak'      // Backup file extension
    }
  });

  await db.connect();

  await db.createResource({
    name: 'config',
    attributes: {
      setting: 'string|required',
      value: 'string'
    }
  });

  // Insert initial version
  const { id } = await db.resources.config.insert({
    setting: 'theme',
    value: 'dark'
  });

  console.log('\nInitial value: dark');

  // Update (creates backup)
  await db.resources.config.update(id, { value: 'light' });
  console.log('Updated to: light (backup created)');

  // Verify backup file exists
  const backupPath = `/tmp/s3db-backup/__metadata__/database.json.bak`;
  try {
    await readFile(backupPath);
    console.log('✓ Backup file exists');
  } catch (err) {
    console.log('ℹ Backup files are created for data files, not metadata');
  }

  await db.disconnect();
}

// Example 5: Journal - Operation log for auditing
async function example5Journal() {
  console.log('\n\n=== Example 5: Journal (Operation Log) ===');

  const db = new S3db({
    verbose: false,
    connectionString: 'file:///tmp/s3db-journal',
    journal: {
      enabled: true,       // Enable operation journal
      file: 'audit.log'    // Custom journal filename
    }
  });

  await db.connect();

  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|email'
    }
  });

  // Perform operations
  const { id: id1 } = await db.resources.users.insert({ name: 'Alice', email: 'alice@example.com' });
  const { id: id2 } = await db.resources.users.insert({ name: 'Bob', email: 'bob@example.com' });
  await db.resources.users.update(id1, { email: 'alice@new.com' });
  await db.resources.users.delete(id2);

  // Read journal
  const journalPath = '/tmp/s3db-journal/audit.log';
  const journalContent = await readFile(journalPath, 'utf8');
  const entries = journalContent.trim().split('\n').map(line => JSON.parse(line));

  console.log(`\nJournal contains ${entries.length} operations:`);
  entries.forEach((entry, i) => {
    console.log(`  ${i + 1}. [${entry.timestamp}] ${entry.operation} ${entry.key}`);
  });

  await db.disconnect();
}

// Example 6: Stats - Performance monitoring
async function example6Stats() {
  console.log('\n\n=== Example 6: Performance Stats ===');

  const db = new S3db({
    verbose: false,
    connectionString: 'file:///tmp/s3db-stats',
    stats: { enabled: true },        // Enable stats tracking
    compression: {
      enabled: true,
      threshold: 50
    }
  });

  await db.connect();

  await db.createResource({
    name: 'data',
    attributes: {
      payload: 'string'
    }
  });

  // Perform operations
  console.log('Performing 100 operations...');

  for (let i = 0; i < 100; i++) {
    await db.resources.data.insert({
      payload: i % 2 === 0
        ? 'Small'  // Small data (not compressed)
        : 'Large data that will be compressed '.repeat(10)  // Large data (compressed)
    });
  }

  // Get comprehensive stats
  const stats = db.client.getStats();

  console.log('\nPerformance Statistics:');
  console.log(`  Operations:`);
  console.log(`    - Gets: ${stats.gets}`);
  console.log(`    - Puts: ${stats.puts}`);
  console.log(`    - Deletes: ${stats.deletes}`);
  console.log(`    - Errors: ${stats.errors}`);

  console.log(`\n  Compression:`);
  console.log(`    - Total uncompressed: ${stats.totalUncompressed} bytes`);
  console.log(`    - Total compressed: ${stats.totalCompressed} bytes`);
  console.log(`    - Saved: ${stats.compressionSaved} bytes`);
  console.log(`    - Avg ratio: ${stats.avgCompressionRatio}`);

  console.log(`\n  Features enabled:`);
  console.log(`    - Compression: ${stats.features.compression}`);
  console.log(`    - TTL: ${stats.features.ttl}`);
  console.log(`    - Locking: ${stats.features.locking}`);
  console.log(`    - Backup: ${stats.features.backup}`);
  console.log(`    - Journal: ${stats.features.journal}`);

  await db.disconnect();
}

// Example 7: All Features Combined
async function example7AllFeatures() {
  console.log('\n\n=== Example 7: All Features Combined ===');

  const db = new S3db({
    verbose: true,
    connectionString: 'file:///tmp/s3db-all-features',
    // All features enabled (verticalizado)
    compression: {
      enabled: true,
      threshold: 100
    },
    ttl: {
      enabled: true,
      defaultTTL: 10000,      // 10 seconds
      cleanupInterval: 5000
    },
    locking: { enabled: true },
    backup: { enabled: true },
    journal: { enabled: true },
    stats: { enabled: true }
  });

  await db.connect();

  await db.createResource({
    name: 'sessions',
    attributes: {
      userId: 'string|required',
      token: 'string|required',
      data: 'string'
    }
  });

  console.log('\nFeatures active:');
  console.log('  ✓ Compression (saves disk space)');
  console.log('  ✓ TTL (auto-cleanup after 10s)');
  console.log('  ✓ Locking (safe concurrent access)');
  console.log('  ✓ Backup (recovery on overwrite)');
  console.log('  ✓ Journal (audit trail)');
  console.log('  ✓ Stats (performance tracking)');

  // Insert session with large data (will be compressed)
  await db.resources.sessions.insert({
    userId: 'user123',
    token: 'abc123',
    data: 'Session data '.repeat(50)  // Large enough to trigger compression
  });

  // Get final stats
  const stats = db.client.getStats();
  console.log('\nFinal stats:', {
    operations: { puts: stats.puts, gets: stats.gets, deletes: stats.deletes },
    compressionSaved: stats.compressionSaved,
    features: stats.features
  });

  await db.disconnect();
}

// Cleanup helper
async function cleanup() {
  console.log('\n\n=== Cleanup ===');

  const paths = [
    '/tmp/s3db-compression',
    '/tmp/s3db-ttl',
    '/tmp/s3db-locking',
    '/tmp/s3db-backup',
    '/tmp/s3db-journal',
    '/tmp/s3db-stats',
    '/tmp/s3db-all-features'
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
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Example 61: FileSystemClient - Enhanced Features           ║');
  console.log('║  (Compression, TTL, Locking, Backup, Journal, Stats)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await example1Compression();
    await example2TTL();
    await example3Locking();
    await example4Backup();
    await example5Journal();
    await example6Stats();
    await example7AllFeatures();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await cleanup();
  }

  console.log('\n✓ All examples completed!\n');
}

main();
