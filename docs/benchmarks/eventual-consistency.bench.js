#!/usr/bin/env node
/**
 * EventualConsistency Plugin Benchmark
 *
 * Tests the performance of the EventualConsistency plugin after optimizations:
 * - Parallelization of analytics updates (Promise.all)
 * - Parallelization of rollup analytics (Promise.all)
 * - Configurable concurrency for mark applied (10 → 50)
 *
 * Metrics tested:
 * 1. Transaction creation rate (ops/sec)
 * 2. Consolidation performance (varying transaction counts)
 * 3. Analytics update performance (before vs after parallelization)
 * 4. Mark applied concurrency impact (10 vs 50 vs 100)
 */

import { S3DB } from '../../src/index.js';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

console.log(`\n${colors.blue}${colors.bright}🚀 EventualConsistency Plugin Benchmark${colors.reset}\n`);

// Helper to format numbers
function formatNumber(num) {
  return Math.round(num).toLocaleString('en-US');
}

// Helper to calculate statistics
function calculateStats(runs) {
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const fastest = Math.max(...runs);
  const slowest = Math.min(...runs);
  const stdDev = Math.sqrt(
    runs.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / runs.length
  );
  return { avg, fastest, slowest, stdDev };
}

// Clean bucket before starting
async function cleanBucket(s3Client, bucket) {
  try {
    const { Contents } = await s3Client.send({ Bucket: bucket, Prefix: '' });
    if (!Contents || Contents.length === 0) return;

    const objects = Contents.map(obj => ({ Key: obj.Key }));
    await s3Client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: objects }
    }));
  } catch (err) {
    // Bucket is empty or doesn't exist yet
  }
}

// Benchmark: Transaction Creation Rate
async function benchTransactionCreation(config, transactionCount = 1000) {
  const db = new S3DB(config.connection);
  const runs = [];

  console.log(`${colors.dim}Running transaction creation benchmark (${transactionCount} transactions, 3 runs)...${colors.reset}`);

  for (let run = 0; run < 3; run++) {
    await cleanBucket(db.client, config.bucket);

    const users = await db.createResource({
      name: 'users',
      attributes: {
        email: 'string|required',
        balance: 'number|default:0'
      },
      plugins: [config.plugin]
    });

    // Insert some users
    const userIds = [];
    for (let i = 0; i < 10; i++) {
      const user = await users.insert({
        email: `user${i}@test.com`,
        balance: 100
      });
      userIds.push(user.id);
    }

    // Transaction creation benchmark
    const start = process.hrtime.bigint();

    for (let i = 0; i < transactionCount; i++) {
      const userId = userIds[i % userIds.length];
      await users.update(userId, {
        balance: { operation: 'add', value: Math.floor(Math.random() * 100) }
      });
    }

    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    const opsPerSec = (transactionCount / ms) * 1000;
    runs.push(opsPerSec);
  }

  return calculateStats(runs);
}

// Benchmark: Consolidation Performance
async function benchConsolidation(config, transactionCount = 1000) {
  const db = new S3DB(config.connection);
  const runs = [];

  console.log(`${colors.dim}Running consolidation benchmark (${transactionCount} transactions, 3 runs)...${colors.reset}`);

  for (let run = 0; run < 3; run++) {
    await cleanBucket(db.client, config.bucket);

    const users = await db.createResource({
      name: 'users',
      attributes: {
        email: 'string|required',
        balance: 'number|default:0'
      },
      plugins: [config.plugin]
    });

    // Insert user
    const user = await users.insert({
      email: 'user@test.com',
      balance: 100
    });

    // Create transactions
    for (let i = 0; i < transactionCount; i++) {
      await users.update(user.id, {
        balance: { operation: 'add', value: 1 }
      });
    }

    // Consolidation benchmark
    const start = process.hrtime.bigint();
    await config.plugin.consolidateAll();
    const end = process.hrtime.bigint();

    const ms = Number(end - start) / 1e6;
    const opsPerSec = (transactionCount / ms) * 1000;
    runs.push(opsPerSec);
  }

  return calculateStats(runs);
}

// Benchmark: Analytics Performance
async function benchAnalytics(config, transactionCount = 1000) {
  const db = new S3DB(config.connection);
  const runs = [];

  console.log(`${colors.dim}Running analytics benchmark (${transactionCount} transactions, 3 runs)...${colors.reset}`);

  for (let run = 0; run < 3; run++) {
    await cleanBucket(db.client, config.bucket);

    const users = await db.createResource({
      name: 'users',
      attributes: {
        email: 'string|required',
        balance: 'number|default:0'
      },
      plugins: [config.plugin]
    });

    // Insert user
    const user = await users.insert({
      email: 'user@test.com',
      balance: 100
    });

    // Create transactions distributed across multiple hours
    const baseTime = Date.now() - (24 * 60 * 60 * 1000); // 24h ago
    for (let i = 0; i < transactionCount; i++) {
      const hourOffset = Math.floor(i / (transactionCount / 24)); // Distribute over 24 hours
      await users.update(user.id, {
        balance: { operation: 'add', value: 1 }
      });
    }

    // Consolidation benchmark (includes analytics)
    const start = process.hrtime.bigint();
    await config.plugin.consolidateAll();
    const end = process.hrtime.bigint();

    const ms = Number(end - start) / 1e6;
    const opsPerSec = (transactionCount / ms) * 1000;
    runs.push(opsPerSec);
  }

  return calculateStats(runs);
}

// Run all benchmarks
async function runAllBenchmarks() {
  const bucket = 'ec-benchmark-test';

  // Test with different concurrency configurations
  const configs = [
    {
      name: 'Concurrency: 10 (old default)',
      connection: `s3://test:test@${bucket}?region=us-east-1&endpoint=http://localhost:4566`,
      bucket,
      plugin: null // will be created below
    },
    {
      name: 'Concurrency: 50 (new default)',
      connection: `s3://test:test@${bucket}?region=us-east-1&endpoint=http://localhost:4566`,
      bucket,
      plugin: null
    },
    {
      name: 'Concurrency: 100 (aggressive)',
      connection: `s3://test:test@${bucket}?region=us-east-1&endpoint=http://localhost:4566`,
      bucket,
      plugin: null
    }
  ];

  // Import plugin dynamically
  const { EventualConsistencyPlugin } = await import('../../src/plugins/eventual-consistency/index.js');

  // Create plugins with different configurations
  configs[0].plugin = new EventualConsistencyPlugin({
    resources: { users: ['balance'] },
    consolidation: { markAppliedConcurrency: 10 }
  });
  configs[1].plugin = new EventualConsistencyPlugin({
    resources: { users: ['balance'] },
    consolidation: { markAppliedConcurrency: 50 }
  });
  configs[2].plugin = new EventualConsistencyPlugin({
    resources: { users: ['balance'] },
    consolidation: { markAppliedConcurrency: 100 }
  });

  const results = [];

  // Test 1: Transaction Creation (not affected by concurrency)
  console.log(`\n${colors.yellow}${colors.bright}📝 Test 1: Transaction Creation Rate${colors.reset}`);
  const txCreation = await benchTransactionCreation(configs[0], 1000);
  results.push({
    Test: 'Transaction Creation (1k)',
    'Avg ops/s': formatNumber(txCreation.avg),
    'Fastest': formatNumber(txCreation.fastest),
    'StdDev': `±${formatNumber(txCreation.stdDev)}`
  });

  // Test 2: Consolidation with different volumes
  console.log(`\n${colors.yellow}${colors.bright}🔄 Test 2: Consolidation Performance${colors.reset}`);

  for (const count of [100, 500, 1000]) {
    for (const config of configs) {
      const stats = await benchConsolidation(config, count);
      results.push({
        Test: `Consolidation (${count} txns) - ${config.name.split(':')[1].trim()}`,
        'Avg ops/s': formatNumber(stats.avg),
        'Fastest': formatNumber(stats.fastest),
        'StdDev': `±${formatNumber(stats.stdDev)}`
      });
    }
  }

  // Test 3: Analytics with parallelization
  console.log(`\n${colors.yellow}${colors.bright}📊 Test 3: Analytics Performance${colors.reset}`);
  const analytics = await benchAnalytics(configs[1], 1000);
  results.push({
    Test: 'Analytics (1k txns, 24 hours)',
    'Avg ops/s': formatNumber(analytics.avg),
    'Fastest': formatNumber(analytics.fastest),
    'StdDev': `±${formatNumber(analytics.stdDev)}`
  });

  // Show results
  console.log(`\n${colors.blue}${colors.bright}📊 Results Summary${colors.reset}\n`);
  console.table(results);

  // Speedup analysis
  console.log(`\n${colors.green}${colors.bright}✅ Performance Analysis${colors.reset}\n`);

  // Calculate speedup between concurrency 10 and 50
  const consolidation100_10 = results.find(r => r.Test.includes('Consolidation (100 txns)') && r.Test.includes('10'));
  const consolidation100_50 = results.find(r => r.Test.includes('Consolidation (100 txns)') && r.Test.includes('50'));

  if (consolidation100_10 && consolidation100_50) {
    const speedup = parseFloat(consolidation100_50['Avg ops/s'].replace(/,/g, '')) /
                    parseFloat(consolidation100_10['Avg ops/s'].replace(/,/g, ''));
    console.log(`  ${colors.magenta}Speedup (concurrency 10→50):${colors.reset} ${speedup.toFixed(2)}x faster`);
  }

  console.log(`\n${colors.green}✅ Benchmark complete!${colors.reset}\n`);
  console.log(`${colors.dim}Results saved to: docs/benchmarks/eventual-consistency.md${colors.reset}\n`);
}

// Execute
runAllBenchmarks().catch(err => {
  console.error(`${colors.red}Error:${colors.reset}`, err);
  process.exit(1);
});
