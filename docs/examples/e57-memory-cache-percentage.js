/**
 * Memory Cache with Percentage-based Limits Example
 *
 * This example demonstrates how to use maxMemoryPercent to set
 * dynamic memory limits based on the system's total memory.
 *
 * Perfect for:
 * - Containerized environments (Docker, Kubernetes)
 * - Cloud deployments with variable instance sizes
 * - Multi-tenant systems
 */

import { Database } from '../src/database.class.js';
import { CachePlugin } from '../src/plugins/cache.plugin.js';
import os from 'node:os';

async function main() {
  // Create database instance
  const db = new Database({
    bucket: 'my-bucket',
    region: 'us-east-1'
  });

  await db.connect();

  console.log('=== Memory Cache Percentage-based Limits Demo ===\n');

  // Show system information
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  console.log(`System Memory: ${(totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Free Memory: ${(freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB\n`);

  // Configure cache with 5% of system memory
  const percentToUse = 0.05; // 5% = 0.05
  const cachePlugin = new CachePlugin({
    driver: 'memory',
    ttl: 600000, // 10 minutes
    config: {
      maxMemoryPercent: percentToUse, // 0.05 = 5% of system memory
      enableCompression: true,
      compressionThreshold: 1024
    }
  });

  await cachePlugin.install(db);

  const calculatedLimit = Math.floor(totalMemory * percentToUse);
  console.log(`1. Cache Configuration:`);
  console.log(`   Max Memory Percent: ${(percentToUse * 100).toFixed(1)}%`);
  console.log(`   Calculated Limit: ${(calculatedLimit / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   This adapts to system memory automatically!\n`);

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

  // Insert test data
  console.log('2. Inserting test data...');
  const testMetadata = { notes: 'x'.repeat(2000) }; // ~2KB per record

  for (let i = 0; i < 50; i++) {
    await users.insert({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      bio: `Biography for user ${i}`,
      metadata: testMetadata
    });
  }

  // Perform cache operations
  console.log('3. Performing cache operations...');
  await users.list();
  await users.count();
  await users.page({ offset: 0, size: 20 });

  // Check memory stats
  const stats = cachePlugin.driver.getMemoryStats();

  console.log('\n4. Detailed Memory Statistics:');
  console.log('   ├─ Cache Memory:');
  console.log(`   │  ├─ Current: ${stats.memoryUsage.current}`);
  console.log(`   │  ├─ Max: ${stats.memoryUsage.max}`);
  console.log(`   │  ├─ Available: ${stats.memoryUsage.available}`);
  console.log(`   │  └─ Usage: ${stats.memoryUsagePercent.toFixed(2)}%`);
  console.log('   │');
  console.log('   ├─ System Memory:');
  console.log(`   │  ├─ Total: ${stats.systemMemory.total}`);
  console.log(`   │  ├─ Free: ${stats.systemMemory.free}`);
  console.log(`   │  ├─ Used: ${stats.systemMemory.used}`);
  console.log(`   │  └─ Cache Percent: ${stats.systemMemory.cachePercent}`);
  console.log('   │');
  console.log('   └─ Cache Info:');
  console.log(`      ├─ Total Items: ${stats.totalItems}`);
  console.log(`      ├─ Average Size: ${stats.averageItemSize} bytes`);
  console.log(`      └─ Evicted (memory): ${stats.evictedDueToMemory}`);

  // Show compression stats if enabled
  if (cachePlugin.driver.enableCompression) {
    const compressionStats = cachePlugin.driver.getCompressionStats();
    console.log('\n5. Compression Statistics:');
    console.log(`   ├─ Compressed Items: ${compressionStats.compressedItems}`);
    console.log(`   ├─ Original Size: ${compressionStats.memoryUsage.uncompressed}`);
    console.log(`   ├─ Compressed Size: ${compressionStats.memoryUsage.compressed}`);
    console.log(`   ├─ Saved: ${compressionStats.memoryUsage.saved}`);
    console.log(`   └─ Space Savings: ${compressionStats.spaceSavingsPercent}%`);
  }

  // Demonstrate portability
  console.log('\n6. Portability Benefits:');
  console.log('   ✓ Same config works on different instance sizes');
  console.log('   ✓ Automatically scales with container memory limits');
  console.log('   ✓ Percentage-based approach is environment-agnostic');

  if (stats.maxMemoryPercent > 0) {
    console.log(`   ✓ Using ${(stats.maxMemoryPercent * 100).toFixed(1)}% on this ${(totalMemory / 1024 / 1024 / 1024).toFixed(0)}GB system = ${stats.memoryUsage.max}`);
  }

  await db.disconnect();
  console.log('\n✓ Demo complete!');
}

main().catch(console.error);
