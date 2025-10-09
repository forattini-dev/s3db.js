#!/usr/bin/env node

import S3DB from './dist/s3db.es.js';
import { EventualConsistencyPlugin } from './dist/s3db.es.js';

console.log('🧪 Testing Multi-Resource EventualConsistencyPlugin API\n');

const db = new S3DB({
  connectionString: process.env.S3DB_CONNECTION || 'http://minioadmin:minioadmin123@localhost:9100/s3db',
  plugins: [
    new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      verbose: true,
      enableAnalytics: true,
      cohort: {
        timezone: 'America/Sao_Paulo'
      }
    })
  ]
});

try {
  console.log('1️⃣  Connecting...');
  await db.connect();
  console.log('   ✅ Connected\n');

  console.log('2️⃣  Creating urls resource...');
  await db.createResource({
    name: 'urls',
    attributes: {
      id: 'string|required',
      link: 'string|optional',
      clicks: 'number|default:0',
      views: 'number|default:0',
      shares: 'number|default:0',
      scans: 'number|default:0'
    }
  });
  console.log('   ✅ Resource created\n');

  // Wait for plugin setup
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('3️⃣  Checking created resources...\n');

  const expectedResources = [
    'urls_transactions_clicks',
    'urls_analytics_clicks',
    'urls_consolidation_locks_clicks',
    'urls_transactions_views',
    'urls_analytics_views',
    'urls_consolidation_locks_views',
    'urls_transactions_shares',
    'urls_analytics_shares',
    'urls_consolidation_locks_shares',
    'urls_transactions_scans',
    'urls_analytics_scans',
    'urls_consolidation_locks_scans',
  ];

  let allCreated = true;
  for (const name of expectedResources) {
    const exists = !!db.resources[name];
    console.log(`   ${exists ? '✅' : '❌'} ${name}`);
    if (!exists) allCreated = false;
  }

  console.log('\n4️⃣  Summary:');
  console.log(`   Total expected: ${expectedResources.length}`);
  console.log(`   Total created: ${Object.keys(db.resources).length}`);

  if (allCreated) {
    console.log('\n🎉 SUCCESS! All resources created correctly!');
  } else {
    console.log('\n❌ FAIL! Some resources were not created');
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  await db.disconnect();
}
