/**
 * Memory Cache Limits Example
 *
 * This example demonstrates how to use maxMemoryBytes to prevent
 * memory exhaustion in production environments.
 */

import { Database } from '../src/database.class.js';
import { CachePlugin } from '../src/plugins/cache.plugin.js';

async function main() {
  // Create database instance
  const db = new Database({
    bucket: 'my-bucket',
    region: 'us-east-1'
  });

  await db.connect();

  // Configure cache with memory limits
  const cachePlugin = new CachePlugin({
    driver: 'memory',
    maxSize: 1000, // Max 1000 items
    ttl: 600000, // 10 minutes
    config: {
      maxMemoryBytes: 10 * 1024 * 1024, // 10MB hard limit
      enableCompression: true,
      compressionThreshold: 1024 // Compress items > 1KB
    }
  });

  await cachePlugin.install(db);

  // Create a resource
  const users = await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required',
      bio: 'string',
      metadata: 'object'
    }
  });

  console.log('=== Memory Cache Limits Demo ===\n');

  // Insert some test data with large metadata
  console.log('1. Inserting test data...');
  const largeMetadata = { description: 'x'.repeat(5000) }; // ~5KB per record

  for (let i = 0; i < 100; i++) {
    await users.insert({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      bio: 'A test user with large metadata',
      metadata: largeMetadata
    });
  }

  // Cache operations to fill memory
  console.log('2. Performing cache operations...');
  await users.list();
  await users.count();
  await users.getAll();

  // Check memory stats
  const stats = cachePlugin.driver.getMemoryStats();
  console.log('\n3. Memory Statistics:');
  console.log(`   Current Memory: ${stats.memoryUsage.current}`);
  console.log(`   Max Memory: ${stats.memoryUsage.max}`);
  console.log(`   Available: ${stats.memoryUsage.available}`);
  console.log(`   Usage: ${stats.memoryUsagePercent.toFixed(2)}%`);
  console.log(`   Total Items: ${stats.totalItems}`);
  console.log(`   Average Item Size: ${stats.averageItemSize} bytes`);
  console.log(`   Evicted (memory): ${stats.evictedDueToMemory}`);

  // Check compression stats if enabled
  if (cachePlugin.driver.enableCompression) {
    const compressionStats = cachePlugin.driver.getCompressionStats();
    console.log('\n4. Compression Statistics:');
    console.log(`   Compressed Items: ${compressionStats.compressedItems}`);
    console.log(`   Space Savings: ${compressionStats.spaceSavingsPercent}%`);
    console.log(`   Original Size: ${compressionStats.memoryUsage.uncompressed}`);
    console.log(`   Compressed Size: ${compressionStats.memoryUsage.compressed}`);
    console.log(`   Saved: ${compressionStats.memoryUsage.saved}`);
  }

  // Demonstrate auto-eviction
  console.log('\n5. Filling cache to trigger eviction...');
  const initialEvicted = stats.evictedDueToMemory;

  for (let i = 0; i < 50; i++) {
    await users.page({ offset: i * 10, size: 10 });
  }

  const newStats = cachePlugin.driver.getMemoryStats();
  const evictedCount = newStats.evictedDueToMemory - initialEvicted;

  console.log(`   Evicted ${evictedCount} items due to memory limits`);
  console.log(`   Memory stayed under: ${newStats.memoryUsage.current} / ${newStats.memoryUsage.max}`);

  await db.disconnect();
  console.log('\n✓ Demo complete!');
}

main().catch(console.error);
