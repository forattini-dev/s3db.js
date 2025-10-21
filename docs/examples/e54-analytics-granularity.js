/**
 * Analytics Granularity Examples
 *
 * Demonstrates how to query analytics with different time granularities:
 * - Month broken down by days
 * - Day broken down by hours
 * - Week broken down by days
 * - Year broken down by months
 */

import S3db from '../src/s3db.class.js';
import { EventualConsistencyPlugin } from '../src/plugins/eventual-consistency/index.js';

async function main() {
  const s3db = new S3db({
    connectionString: "s3://test:test@granularity-demo/analytics",
    enableCache: false
  });

  await s3db.connect();

  // Create wallets resource
  const wallets = await s3db.createResource({
    name: 'wallets',
    attributes: {
      id: 'string|required',
      balance: 'number|default:0'
    }
  });

  // Enable analytics
  const plugin = new EventualConsistencyPlugin({
    resource: 'wallets',
    field: 'balance',
    mode: 'sync',
    autoConsolidate: false,
    enableAnalytics: true
  });

  await s3db.usePlugin(plugin);

  // Simulate transactions across different hours and days
  console.log('Creating sample transactions...\n');

  await wallets.insert({ id: 'w1', balance: 0 });

  // Simulate 20 transactions
  for (let i = 0; i < 20; i++) {
    const amount = Math.floor(Math.random() * 100) + 10;
    await wallets.add('w1', amount);
  }

  await wallets.consolidate('w1');
  console.log('✅ Transactions created and consolidated\n');

  // Get plugin reference
  const analyticsPlugin = s3db.plugins.find(p => p instanceof EventualConsistencyPlugin);

  // ========================================
  // 1. Day broken down by hours
  // ========================================
  console.log('═'.repeat(70));
  console.log('📊 TODAY - HOUR BY HOUR');
  console.log('═'.repeat(70));

  const today = new Date().toISOString().substring(0, 10);
  const todayByHour = await analyticsPlugin.getDayByHour('wallets', 'balance', today);

  console.log(`\nDate: ${today}`);
  console.log(`Total Hours with Transactions: ${todayByHour.length}\n`);

  todayByHour.forEach(hour => {
    const hourNum = hour.cohort.substring(11);
    console.log(`  ${hourNum}:00 → ${hour.count.toString().padStart(3)} transactions, $${hour.sum.toString().padStart(6)}, avg: $${hour.avg.toFixed(2)}`);
  });

  // ========================================
  // 2. Last 7 days broken down by days
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📊 LAST 7 DAYS - DAY BY DAY');
  console.log('═'.repeat(70));

  const last7Days = await analyticsPlugin.getLastNDays('wallets', 'balance', 7);

  console.log(`\nPeriod: Last 7 days`);
  console.log(`Total Days with Transactions: ${last7Days.length}\n`);

  last7Days.forEach(day => {
    const dayName = new Date(day.cohort).toLocaleDateString('en-US', { weekday: 'short' });
    console.log(`  ${dayName} ${day.cohort} → ${day.count.toString().padStart(3)} txns, $${day.sum.toString().padStart(6)}, avg: $${day.avg.toFixed(2)}`);
  });

  // Calculate week totals
  const weekTotal = last7Days.reduce((acc, day) => ({
    count: acc.count + day.count,
    sum: acc.sum + day.sum
  }), { count: 0, sum: 0 });

  console.log(`\n  Week Total: ${weekTotal.count} transactions, $${weekTotal.sum}`);
  console.log(`  Daily Average: ${(weekTotal.count / 7).toFixed(1)} transactions, $${(weekTotal.sum / 7).toFixed(2)}`);

  // ========================================
  // 3. Month broken down by days
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📊 THIS MONTH - DAY BY DAY');
  console.log('═'.repeat(70));

  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const monthByDay = await analyticsPlugin.getMonthByDay('wallets', 'balance', currentMonth);

  console.log(`\nMonth: ${currentMonth}`);
  console.log(`Total Days with Transactions: ${monthByDay.length}\n`);

  // Show first 10 days
  const daysToShow = Math.min(10, monthByDay.length);
  monthByDay.slice(0, daysToShow).forEach(day => {
    console.log(`  ${day.cohort} → ${day.count.toString().padStart(3)} txns, $${day.sum.toString().padStart(6)}, avg: $${day.avg.toFixed(2)}`);
  });

  if (monthByDay.length > 10) {
    console.log(`  ... (${monthByDay.length - 10} more days)`);
  }

  // Month totals
  const monthTotal = monthByDay.reduce((acc, day) => ({
    count: acc.count + day.count,
    sum: acc.sum + day.sum
  }), { count: 0, sum: 0 });

  console.log(`\n  Month Total: ${monthTotal.count} transactions, $${monthTotal.sum}`);

  // ========================================
  // 4. Last month broken down by hours
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📊 LAST MONTH - HOUR BY HOUR');
  console.log('═'.repeat(70));

  const lastMonthByHour = await analyticsPlugin.getMonthByHour('wallets', 'balance', 'last');

  console.log(`\nLast Month Total Hours with Transactions: ${lastMonthByHour.length}`);
  console.log('(Showing first 24 hours and statistics)\n');

  // Show first 24 hours
  const hoursToShow = Math.min(24, lastMonthByHour.length);
  lastMonthByHour.slice(0, hoursToShow).forEach(hour => {
    const date = hour.cohort.substring(0, 10);
    const time = hour.cohort.substring(11);
    console.log(`  ${date} ${time}:00 → ${hour.count.toString().padStart(3)} txns, $${hour.sum.toString().padStart(6)}`);
  });

  if (lastMonthByHour.length > 24) {
    console.log(`  ... (${lastMonthByHour.length - 24} more hours)`);
  }

  // Calculate month totals
  const lastMonthTotal = lastMonthByHour.reduce((acc, hour) => ({
    count: acc.count + hour.count,
    sum: acc.sum + hour.sum
  }), { count: 0, sum: 0 });

  console.log(`\n  Last Month Total: ${lastMonthTotal.count} transactions, $${lastMonthTotal.sum}`);
  console.log(`  Hourly Average: ${(lastMonthTotal.count / Math.max(lastMonthByHour.length, 1)).toFixed(1)} transactions, $${(lastMonthTotal.sum / Math.max(lastMonthByHour.length, 1)).toFixed(2)}`);

  // ========================================
  // 5. Year broken down by months
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📊 THIS YEAR - MONTH BY MONTH');
  console.log('═'.repeat(70));

  const currentYear = new Date().getFullYear();
  const yearByMonth = await analyticsPlugin.getYearByMonth('wallets', 'balance', currentYear);

  console.log(`\nYear: ${currentYear}`);
  console.log(`Total Months with Transactions: ${yearByMonth.length}\n`);

  yearByMonth.forEach(month => {
    const monthName = new Date(month.cohort + '-01').toLocaleDateString('en-US', { month: 'long' });
    console.log(`  ${monthName.padEnd(10)} → ${month.count.toString().padStart(4)} txns, $${month.sum.toString().padStart(8)}, avg: $${month.avg.toFixed(2)}`);
  });

  // Year totals
  const yearTotal = yearByMonth.reduce((acc, month) => ({
    count: acc.count + month.count,
    sum: acc.sum + month.sum
  }), { count: 0, sum: 0 });

  console.log(`\n  Year Total: ${yearTotal.count} transactions, $${yearTotal.sum}`);

  // ========================================
  // 6. Custom granularity - Business hours
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📊 TODAY - BUSINESS HOURS ONLY (9am-5pm)');
  console.log('═'.repeat(70));

  const allHours = await analyticsPlugin.getDayByHour('wallets', 'balance', today);
  const businessHours = allHours.filter(h => {
    const hour = parseInt(h.cohort.substring(11, 13));
    return hour >= 9 && hour <= 17;
  });

  console.log(`\nBusiness Hours: 9am - 5pm`);
  console.log(`Hours with Transactions: ${businessHours.length}\n`);

  businessHours.forEach(hour => {
    const hourNum = hour.cohort.substring(11);
    console.log(`  ${hourNum}:00 → ${hour.count.toString().padStart(3)} txns, $${hour.sum.toString().padStart(6)}`);
  });

  // Business hours totals
  const businessTotal = businessHours.reduce((acc, h) => ({
    count: acc.count + h.count,
    sum: acc.sum + h.sum
  }), { count: 0, sum: 0 });

  console.log(`\n  Business Hours Total: ${businessTotal.count} transactions, $${businessTotal.sum}`);

  // ========================================
  // 7. Chart-Ready Data with fillGaps
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📊 CHART-READY DATA - LAST 7 DAYS WITH GAPS FILLED');
  console.log('═'.repeat(70));

  // Without fillGaps (sparse - only days with transactions)
  const last7DaysSparse = await analyticsPlugin.getLastNDays('wallets', 'balance', 7);
  console.log(`\nWithout fillGaps: ${last7DaysSparse.length} days with transactions`);

  // With fillGaps (continuous - all 7 days guaranteed)
  const last7DaysFilled = await analyticsPlugin.getLastNDays('wallets', 'balance', 7, {
    fillGaps: true  // Perfect for charts!
  });

  console.log(`With fillGaps: ${last7DaysFilled.length} days (guaranteed)`);
  console.log('\nLast 7 Days (Chart-Ready):');

  last7DaysFilled.forEach(day => {
    const dayName = new Date(day.cohort).toLocaleDateString('en-US', { weekday: 'short' });
    const bar = '█'.repeat(Math.floor(day.count / 2) || 1);
    console.log(`  ${dayName} ${day.cohort} → ${day.count.toString().padStart(3)} txns ${bar}`);
  });

  // Perfect for Chart.js
  const chartLabels = last7DaysFilled.map(d => d.cohort);
  const chartData = last7DaysFilled.map(d => d.count);

  console.log(`\n  Chart.js Ready:`);
  console.log(`  labels: [${chartLabels.map(l => `'${l}'`).join(', ')}]`);
  console.log(`  data: [${chartData.join(', ')}]`);

  // ========================================
  // 8. Custom range - Specific week
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📊 CUSTOM RANGE - SPECIFIC WEEK (Mon-Sun)');
  console.log('═'.repeat(70));

  // Get current week's Monday
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weekStart = monday.toISOString().substring(0, 10);
  const weekEnd = sunday.toISOString().substring(0, 10);

  const customWeek = await analyticsPlugin.getAnalytics('wallets', 'balance', {
    period: 'day',
    startDate: weekStart,
    endDate: weekEnd
  });

  console.log(`\nWeek: ${weekStart} to ${weekEnd}`);
  console.log(`Days with Transactions: ${customWeek.length}\n`);

  customWeek.forEach((day, idx) => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    console.log(`  ${dayNames[idx]} ${day.cohort} → ${day.count.toString().padStart(3)} txns, $${day.sum.toString().padStart(6)}`);
  });

  // ========================================
  // Summary
  // ========================================
  console.log('\n' + '═'.repeat(70));
  console.log('📋 SUMMARY');
  console.log('═'.repeat(70));

  console.log(`
Available Granularity Methods (all support fillGaps option):

1. getDayByHour(resource, field, date, { fillGaps })
   → Returns up to 24 hourly records for a specific day
   → With fillGaps: Always 24 hours (00:00-23:00)

2. getLastNDays(resource, field, days, { fillGaps })
   → Returns N daily records going back from today
   → With fillGaps: Always N days (no gaps)

3. getMonthByDay(resource, field, 'YYYY-MM', { fillGaps })
   → Returns daily records for entire month (28-31 days)
   → With fillGaps: Always 28-31 days (complete month)

4. getMonthByHour(resource, field, 'YYYY-MM' or 'last', { fillGaps })
   → Returns hourly records for entire month (up to 744 hours)
   → With fillGaps: Always 672-744 hours (complete month)

5. getYearByMonth(resource, field, year, { fillGaps })
   → Returns 12 monthly records for entire year
   → With fillGaps: Always 12 months (Jan-Dec)

6. getAnalytics(resource, field, options)
   → Flexible queries with custom date ranges
   → No fillGaps support (use helper methods instead)

All methods return pre-calculated aggregations:
  • count: Number of transactions
  • sum: Total value (signed)
  • avg: Average transaction value
  • min: Minimum transaction value
  • max: Maximum transaction value
  • operations: Breakdown by add/sub/set
  • recordCount: Distinct records

fillGaps option:
  • Fills missing periods with zeros
  • Perfect for continuous charts (Chart.js, D3.js, etc.)
  • No performance penalty (~1ms to fill gaps)
  • Works with all time periods (hour, day, month)

Performance: ~2ms per query (regardless of transaction count!)
  `);

  await s3db.disconnect();
  console.log('✅ Done!\n');
}

main().catch(console.error);
