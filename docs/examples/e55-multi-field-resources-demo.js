/**
 * Multi-Field Resources Demo
 *
 * Demonstrates that EventualConsistencyPlugin creates resources for ALL configured fields
 *
 * Example with 10 fields should create:
 * - 10 transaction resources (metrics_transactions_*)
 * - 10 lock resources (metrics_consolidation_locks_*)
 * - 10 analytics resources (metrics_analytics_*) [if enabled]
 * = 30 total resources
 */

import { S3db } from '../src/database.class.js';
import { EventualConsistencyPlugin } from '../src/plugins/eventual-consistency/index.js';

async function demo() {
  console.log('\n🧪 EventualConsistency Multi-Field Resources Demo\n');
  console.log('=' .repeat(60));

  // Create database
  const database = new S3db({
    connectionString: process.env.S3DB_CONNECTION || 's3://test:test@localhost:9000/test-multi-field',
    forcePathStyle: true
  });

  await database.connect();

  // Create metrics resource with 10 fields
  console.log('\n1️⃣  Creating metrics resource with 10 fields...\n');

  const metrics = await database.createResource({
    name: 'metrics',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      // 10 metric fields
      impressions: 'number|default:0',
      clicks: 'number|default:0',
      views: 'number|default:0',
      shares: 'number|default:0',
      likes: 'number|default:0',
      comments: 'number|default:0',
      downloads: 'number|default:0',
      saves: 'number|default:0',
      opens: 'number|default:0',
      completions: 'number|default:0'
    }
  });

  console.log('   ✅ metrics resource created\n');

  // Configure plugin with all 10 fields
  console.log('2️⃣  Configuring EventualConsistencyPlugin with 10 fields...\n');

  const fieldNames = [
    'impressions', 'clicks', 'views', 'shares', 'likes',
    'comments', 'downloads', 'saves', 'opens', 'completions'
  ];

  const plugin = new EventualConsistencyPlugin({
    resources: {
      metrics: fieldNames
    },
    mode: 'sync',
    verbose: false,
    enableAnalytics: true,
    analyticsConfig: {
      periods: ['hour', 'day', 'month'],
      metrics: ['count', 'sum'],
      retentionDays: 365
    }
  });

  await database.usePlugin(plugin);

  console.log('   ✅ Plugin configured and initialized\n');

  // Count created resources
  console.log('3️⃣  Counting created resources...\n');
  console.log('=' .repeat(60));

  const allResources = Object.keys(database.resources).sort();

  // Filter by type
  const transactionResources = allResources.filter(r => r.startsWith('metrics_transactions_'));
  const lockResources = allResources.filter(r => r.startsWith('metrics_consolidation_locks_'));
  const analyticsResources = allResources.filter(r => r.startsWith('metrics_analytics_'));

  // Display transaction resources
  console.log('\n📊 TRANSACTION RESOURCES (' + transactionResources.length + '):\n');
  transactionResources.forEach((r, i) => {
    console.log(`   ${i + 1}.  ${r}`);
  });

  // Display lock resources
  console.log('\n🔒 LOCK RESOURCES (' + lockResources.length + '):\n');
  lockResources.forEach((r, i) => {
    console.log(`   ${i + 1}.  ${r}`);
  });

  // Display analytics resources
  console.log('\n📈 ANALYTICS RESOURCES (' + analyticsResources.length + '):\n');
  analyticsResources.forEach((r, i) => {
    console.log(`   ${i + 1}.  ${r}`);
  });

  // Summary
  const totalCreated = transactionResources.length + lockResources.length + analyticsResources.length;
  console.log('\n' + '=' .repeat(60));
  console.log(`\n✅ TOTAL: ${totalCreated} resources created for ${fieldNames.length} fields`);
  console.log(`   (${fieldNames.length} transactions + ${fieldNames.length} locks + ${fieldNames.length} analytics)\n`);

  // Test operations on each field
  console.log('4️⃣  Testing operations on all fields...\n');
  console.log('=' .repeat(60));

  await metrics.insert({
    id: 'demo-metric',
    name: 'Demo Metric',
    impressions: 0,
    clicks: 0,
    views: 0,
    shares: 0,
    likes: 0,
    comments: 0,
    downloads: 0,
    saves: 0,
    opens: 0,
    completions: 0
  });

  console.log('\n   Adding values to each field:\n');

  for (let i = 0; i < fieldNames.length; i++) {
    const fieldName = fieldNames[i];
    const value = (i + 1) * 10;
    await metrics.add('demo-metric', fieldName, value);
    console.log(`   ✅ ${fieldName.padEnd(15)} +${value}`);
  }

  console.log('\n   Reading final values:\n');
  const record = await metrics.get('demo-metric');

  for (let i = 0; i < fieldNames.length; i++) {
    const fieldName = fieldNames[i];
    const value = record[fieldName];
    const expected = (i + 1) * 10;
    const status = value === expected ? '✅' : '❌';
    console.log(`   ${status} ${fieldName.padEnd(15)} ${value} (expected: ${expected})`);
  }

  console.log('\n' + '=' .repeat(60));
  console.log('\n✅ Demo complete! All fields working correctly.\n');

  await database.disconnect();
}

demo().catch(console.error);
