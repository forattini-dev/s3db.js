/**
 * EventualConsistencyPlugin Analytics Example
 *
 * Demonstrates how to use the analytics API for transaction reporting
 * without processing millions of transactions.
 */

import S3db from '../src/s3db.class.js';
import { EventualConsistencyPlugin } from '../src/plugins/eventual-consistency.plugin.js';

async function main() {
  // 1. Setup database with analytics enabled
  const s3db = new S3db({
    connectionString: "s3://test:test@analytics-demo/wallet-analytics",
    enableCache: false
  });

  await s3db.connect();
  console.log('✅ Connected to S3db\n');

  // 2. Create wallets resource
  const wallets = await s3db.createResource({
    name: 'wallets',
    attributes: {
      id: 'string|required',
      userId: 'string|required',
      balance: 'number|default:0',
      currency: 'string|default:USD'
    }
  });

  // 3. Add EventualConsistencyPlugin with analytics
  const plugin = new EventualConsistencyPlugin({
    resource: 'wallets',
    field: 'balance',
    mode: 'sync',  // For demo purposes
    autoConsolidate: false,  // Manual consolidation
    enableAnalytics: true,
    analyticsConfig: {
      periods: ['hour', 'day', 'month'],
      metrics: ['count', 'sum', 'avg', 'min', 'max'],
      rollupStrategy: 'incremental'
    }
  });

  await s3db.usePlugin(plugin);
  console.log('✅ Analytics enabled for wallets.balance\n');

  // 4. Create sample wallets
  console.log('Creating sample wallets...');
  await wallets.insert({ id: 'wallet-alice', userId: 'alice', balance: 0 });
  await wallets.insert({ id: 'wallet-bob', userId: 'bob', balance: 0 });
  await wallets.insert({ id: 'wallet-charlie', userId: 'charlie', balance: 0 });
  console.log('✅ Created 3 wallets\n');

  // 5. Simulate transactions
  console.log('Simulating transactions...');

  // Alice: many small transactions
  await wallets.add('wallet-alice', 10);
  await wallets.add('wallet-alice', 15);
  await wallets.add('wallet-alice', 20);
  await wallets.sub('wallet-alice', 5);

  // Bob: few large transactions
  await wallets.add('wallet-bob', 500);
  await wallets.add('wallet-bob', 300);

  // Charlie: one huge transaction
  await wallets.add('wallet-charlie', 2000);

  console.log('✅ Created 7 transactions\n');

  // 6. Consolidate (this triggers analytics update)
  console.log('Consolidating balances...');
  const aliceBalance = await wallets.consolidate('wallet-alice');
  const bobBalance = await wallets.consolidate('wallet-bob');
  const charlieBalance = await wallets.consolidate('wallet-charlie');

  console.log(`✅ Alice balance: $${aliceBalance}`);
  console.log(`✅ Bob balance: $${bobBalance}`);
  console.log(`✅ Charlie balance: $${charlieBalance}\n`);

  // 7. Query analytics - Hourly breakdown
  const today = new Date().toISOString().substring(0, 10);

  console.log('='.repeat(60));
  console.log('📊 HOURLY ANALYTICS');
  console.log('='.repeat(60));

  const hourlyStats = await plugin.getAnalytics('wallets', 'balance', {
    period: 'hour',
    date: today
  });

  if (hourlyStats.length > 0) {
    const stats = hourlyStats[0];
    console.log(`\nCohort: ${stats.cohort}`);
    console.log(`Transaction Count: ${stats.count}`);
    console.log(`Total Value: $${stats.sum}`);
    console.log(`Average Value: $${stats.avg.toFixed(2)}`);
    console.log(`Min Value: $${stats.min}`);
    console.log(`Max Value: $${stats.max}`);
    console.log(`Distinct Wallets: ${stats.recordCount}`);
  }

  // 8. Operation breakdown
  console.log('\n' + '='.repeat(60));
  console.log('📊 OPERATION BREAKDOWN');
  console.log('='.repeat(60));

  const operations = await plugin.getAnalytics('wallets', 'balance', {
    period: 'hour',
    date: today,
    breakdown: 'operations'
  });

  if (operations.length > 0) {
    const breakdown = operations[0];
    console.log('\nOperations Summary:');

    if (breakdown.add) {
      console.log(`  • ADD: ${breakdown.add.count} operations, total: $${breakdown.add.sum}`);
    }
    if (breakdown.sub) {
      console.log(`  • SUB: ${breakdown.sub.count} operations, total: $${breakdown.sub.sum}`);
    }
    if (breakdown.set) {
      console.log(`  • SET: ${breakdown.set.count} operations, total: $${breakdown.set.sum}`);
    }
  }

  // 9. Daily summary (rolled up from hourly)
  console.log('\n' + '='.repeat(60));
  console.log('📊 DAILY SUMMARY');
  console.log('='.repeat(60));

  const dailyStats = await plugin.getAnalytics('wallets', 'balance', {
    period: 'day',
    date: today
  });

  if (dailyStats.length > 0) {
    const daily = dailyStats[0];
    console.log(`\nDate: ${daily.cohort}`);
    console.log(`Total Transactions: ${daily.count}`);
    console.log(`Total Value: $${daily.sum}`);
    console.log(`Average Transaction: $${daily.avg.toFixed(2)}`);
  }

  // 10. Top wallets by transaction count
  console.log('\n' + '='.repeat(60));
  console.log('🏆 TOP WALLETS BY TRANSACTION COUNT');
  console.log('='.repeat(60));

  const topByCount = await plugin.getTopRecords('wallets', 'balance', {
    period: 'day',
    date: today,
    metric: 'transactionCount',
    limit: 3
  });

  console.log('\n');
  topByCount.forEach((record, idx) => {
    console.log(`${idx + 1}. ${record.recordId}: ${record.count} transactions, total: $${record.sum}`);
  });

  // 11. Top wallets by total value
  console.log('\n' + '='.repeat(60));
  console.log('🏆 TOP WALLETS BY TOTAL VALUE');
  console.log('='.repeat(60));

  const topByValue = await plugin.getTopRecords('wallets', 'balance', {
    period: 'day',
    date: today,
    metric: 'totalValue',
    limit: 3
  });

  console.log('\n');
  topByValue.forEach((record, idx) => {
    console.log(`${idx + 1}. ${record.recordId}: $${record.sum} (${record.count} transactions)`);
  });

  // 12. Show raw analytics data
  console.log('\n' + '='.repeat(60));
  console.log('📄 RAW ANALYTICS DATA');
  console.log('='.repeat(60));

  const analyticsResource = s3db.resources.wallets_analytics_balance;
  const allAnalytics = await analyticsResource.list();

  console.log(`\nStored analytics records: ${allAnalytics.length}`);
  console.log('\nBreakdown by period:');

  const byPeriod = allAnalytics.reduce((acc, a) => {
    acc[a.period] = (acc[a.period] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byPeriod).forEach(([period, count]) => {
    console.log(`  • ${period}: ${count} records`);
  });

  // 13. Demonstrate query performance
  console.log('\n' + '='.repeat(60));
  console.log('⚡ PERFORMANCE COMPARISON');
  console.log('='.repeat(60));

  // Query via analytics (fast)
  console.time('Analytics query');
  await plugin.getAnalytics('wallets', 'balance', {
    period: 'day',
    date: today
  });
  console.timeEnd('Analytics query');

  // Query via transactions (slow)
  const transactionsResource = s3db.resources.wallets_transactions_balance;
  console.time('Direct transaction scan');
  const allTransactions = await transactionsResource.list();
  const manualCount = allTransactions.filter(t =>
    t.cohortDate === today
  ).length;
  console.timeEnd('Direct transaction scan');

  console.log(`\n✅ Analytics: Pre-calculated (instant)`);
  console.log(`❌ Transactions: ${manualCount} records scanned`);

  // 14. Cleanup
  await s3db.disconnect();
  console.log('\n✅ Disconnected\n');

  console.log('='.repeat(60));
  console.log('KEY TAKEAWAYS');
  console.log('='.repeat(60));
  console.log(`
✅ Analytics provide instant reports without scanning transactions
✅ Metrics are pre-calculated during consolidation
✅ Roll-ups automatically aggregate hour → day → month
✅ Top N queries identify highest-volume records
✅ Operation breakdown shows add/sub/set statistics
✅ Storage grows linearly (24 records/day vs 1000s of transactions)
✅ Query performance: O(1) analytics vs O(n) transaction scans

💡 Perfect for:
   - Transaction dashboards
   - Monthly/daily reports
   - Top customer analysis
   - Compliance audits
   - Real-time monitoring
  `);
}

main().catch(console.error);
