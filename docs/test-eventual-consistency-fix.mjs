#!/usr/bin/env node

/**
 * Test Script - EventualConsistency Fix Verification
 *
 * Use este script no mrt-shortner para verificar se o fix está funcionando.
 *
 * Copie para: ~/work/martech/mrt-shortner/test-eventual-consistency-fix.mjs
 *
 * Execute: node test-eventual-consistency-fix.mjs
 */

import S3DB from '../dist/s3db.es.js';
import { EventualConsistencyPlugin } from '../dist/s3db.es.js';

console.log('\n🧪 Testing EventualConsistency Fix\n');
console.log('=' .repeat(60));

const database = new S3DB({
  connectionString: process.env.S3DB_CONNECTION || 'http://minioadmin:minioadmin123@localhost:9100/s3db'
});

try {
  console.log('\n1️⃣  Creating database connection...');
  await database.connect();
  console.log('   ✅ Connected');

  console.log('\n2️⃣  Creating URLs resource...');
  const resourceName = `test_urls_${Date.now()}`;
  const urls = await database.createResource({
    name: resourceName,
    attributes: {
      id: 'string|required',
      link: 'string|optional',
      clicks: 'number|default:0',
      views: 'number|default:0'
    }
  });
  console.log(`   ✅ Resource created: ${resourceName}`);

  console.log('\n3️⃣  Setting up EventualConsistency plugin...');
  const clicksPlugin = new EventualConsistencyPlugin({
    resource: resourceName,
    field: 'clicks',
    mode: 'sync',
    autoConsolidate: false,
    verbose: true
  });
  await database.usePlugin(clicksPlugin);
  console.log('   ✅ Plugin configured (clicks)');

  const viewsPlugin = new EventualConsistencyPlugin({
    resource: resourceName,
    field: 'views',
    mode: 'sync',
    autoConsolidate: false,
    verbose: true
  });
  await database.usePlugin(viewsPlugin);
  console.log('   ✅ Plugin configured (views)');

  console.log('\n4️⃣  Creating test URL...');
  const testId = `url-${Date.now()}`;
  await urls.insert({
    id: testId,
    link: 'https://example.com',
    clicks: 0,
    views: 0
  });
  console.log(`   ✅ URL created: ${testId}`);

  console.log('\n5️⃣  Testing CLICKS (scenario: add before record exists)...\n');

  // Delete the URL to simulate race condition
  await urls.delete(testId);
  console.log('   🗑️  URL deleted (simulating race condition)');

  // Add clicks to non-existent URL (THIS IS THE BUG SCENARIO)
  console.log('   📊 Adding clicks to deleted URL...');
  await urls.add(testId, 'clicks', 1);
  console.log('      ✅ Click 1 added');

  await urls.add(testId, 'clicks', 1);
  console.log('      ✅ Click 2 added');

  await urls.add(testId, 'clicks', 1);
  console.log('      ✅ Click 3 added');

  console.log('\n6️⃣  Reading back from database...\n');
  const url = await urls.get(testId);

  if (!url) {
    console.log('   ❌ URL DOES NOT EXIST (fix not working!)');
    console.log('\n' + '='.repeat(60));
    console.log('🔴 FIX NOT WORKING - EventualConsistency still has bug');
    console.log('='.repeat(60));
    console.log('\nRecommendation: Follow the installation guide to use local s3db.js');
    console.log('See: docs/mrt-shortner-local-installation-guide.md\n');
    process.exit(1);
  }

  console.log(`   📊 Clicks: ${url.clicks} (expected: 3)`);
  console.log(`   📊 Views:  ${url.views} (expected: 0)`);

  if (url.clicks === 3 && url.views === 0) {
    console.log('\n' + '='.repeat(60));
    console.log('✅ FIX IS WORKING - EventualConsistency persisting correctly!');
    console.log('='.repeat(60));
    console.log('\nDetails:');
    console.log(`  - Record was created by consolidation (upsert)`);
    console.log(`  - Clicks persisted correctly: ${url.clicks}`);
    console.log(`  - Views persisted correctly: ${url.views}`);
    console.log('\n🎉 You can now use EventualConsistency safely!\n');
    process.exit(0);
  } else {
    console.log('\n' + '='.repeat(60));
    console.log('⚠️  UNEXPECTED RESULT - Check the values above');
    console.log('='.repeat(60));
    console.log(`\nExpected: clicks=3, views=0`);
    console.log(`Got: clicks=${url.clicks}, views=${url.views}\n`);
    process.exit(1);
  }

} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error('\nStack:', error.stack);
  process.exit(1);
} finally {
  await database.disconnect();
}
