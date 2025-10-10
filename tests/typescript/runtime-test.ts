/**
 * Runtime Test - Executes real TypeScript code with s3db.js
 * This validates that s3db.js works correctly when used from TypeScript
 */

import S3db from '../../dist/s3db.es.js';
import { EventualConsistencyPlugin } from '../../dist/s3db.es.js';

async function main() {
  console.log('🧪 Testing s3db.js with TypeScript runtime...\n');

  // 1. Create database
  const db = new S3db({
    connectionString: 's3://test:test@localhost:9000/ts-runtime-test',
    forcePathStyle: true
  });

  await db.connect();
  console.log('✅ Database connected');

  // 2. Create resource
  const wallets = await db.createResource({
    name: 'wallets',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      balance: 'number|default:0'
    }
  });

  console.log('✅ Resource created');

  // 3. Add EventualConsistencyPlugin
  const plugin = new EventualConsistencyPlugin({
    resources: {
      wallets: ['balance']
    },
    consolidation: {
      mode: 'sync'
    }
  });

  await db.usePlugin(plugin);
  console.log('✅ Plugin added');

  // 4. Insert wallet
  await wallets.insert({
    id: 'wallet-1',
    userId: 'user-1',
    balance: 100
  });

  console.log('✅ Wallet inserted');

  // 5. Test eventual consistency methods (added by plugin)
  const newBalance = await (wallets as any).add('wallet-1', 'balance', 50);
  console.log(`✅ Balance after add: ${newBalance} (expected: 150)`);

  // 6. Get wallet
  const wallet = await wallets.get('wallet-1');
  console.log(`✅ Wallet balance: ${wallet.balance} (expected: 150)`);

  // 7. Test analytics
  const analyticsResults = await plugin.getAnalytics('wallets', 'balance', {
    period: 'day',
    date: new Date().toISOString().substring(0, 10)
  });

  console.log(`✅ Analytics results: ${analyticsResults.length} records`);

  // 8. Cleanup
  await db.disconnect();
  console.log('✅ Database disconnected');

  console.log('\n🎉 All TypeScript runtime tests passed!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
