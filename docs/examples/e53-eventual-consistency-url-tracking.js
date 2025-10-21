/**
 * URL Click Tracking with EventualConsistencyPlugin
 *
 * Real-world example: URL shortener with click tracking
 *
 * Demonstrates:
 * - Using hooks to automatically increment counters
 * - Accessing other resources via this.database.resources
 * - Practical eventual consistency use case
 * - Analytics integration for click reports
 */

import S3db from '../src/s3db.class.js';
import { EventualConsistencyPlugin } from '../src/plugins/eventual-consistency/index.js';

async function main() {
  // 1. Setup database
  const s3db = new S3db({
    connectionString: "s3://test:test@url-tracking-demo/tracking",
    enableCache: false
  });

  await s3db.connect();
  console.log('✅ Connected to S3db\n');

  // 2. Create URLs resource (what we're tracking)
  const urls = await s3db.createResource({
    name: 'urls',
    attributes: {
      id: 'string|required',           // short code (e.g., 'abc123')
      url: 'string|required',          // original URL
      clicksCount: 'number|default:0', // total clicks (managed by plugin)
      createdAt: 'string|required',
      createdBy: 'string|optional'
    }
  });

  console.log('✅ URLs resource created\n');

  // 3. Add EventualConsistencyPlugin to manage clicksCount
  const urlsPlugin = new EventualConsistencyPlugin({
    resource: 'urls',
    field: 'clicksCount',
    mode: 'async',                     // Auto-consolidate every 5min
    autoConsolidate: true,
    consolidationInterval: 10,         // 10 seconds for demo (default: 300)
    enableAnalytics: true,             // Track click analytics
    verbose: true                      // See what's happening
  });

  await s3db.usePlugin(urlsPlugin);
  console.log('✅ EventualConsistencyPlugin enabled for urls.clicksCount\n');

  // 4. Create Clicks resource (events that increment the counter)
  const clicks = await s3db.createResource({
    name: 'clicks',
    attributes: {
      id: 'string|required',
      urlId: 'string|required',        // which URL was clicked
      ip: 'string|optional',
      userAgent: 'string|optional',
      referer: 'string|optional',
      timestamp: 'string|required'
    },
    hooks: {
      // ⚠️ IMPORTANT: Use function (not arrow) to access 'this'
      afterInsert: [async function(data) {
        // this = clicks resource
        // this.database = s3db instance

        console.log(`\n🔗 Click recorded for URL: ${data.urlId}`);
        console.log(`   IP: ${data.ip}, UserAgent: ${data.userAgent}`);

        // Automatically increment clicksCount for this URL!
        // Using EventualConsistencyPlugin via this.database.resources
        await this.database.resources.urls.add(data.urlId, 1);

        console.log(`✅ Incremented clicksCount for ${data.urlId} (will consolidate in 10s)\n`);

        return data;
      }]
    }
  });

  console.log('✅ Clicks resource created with hook\n');

  // 5. Create some URLs
  console.log('═'.repeat(70));
  console.log('📊 CREATING URLs');
  console.log('═'.repeat(70) + '\n');

  await urls.insert({
    id: 'google',
    url: 'https://google.com',
    clicksCount: 0,
    createdAt: new Date().toISOString(),
    createdBy: 'admin'
  });

  await urls.insert({
    id: 'github',
    url: 'https://github.com',
    clicksCount: 0,
    createdAt: new Date().toISOString(),
    createdBy: 'admin'
  });

  await urls.insert({
    id: 's3db',
    url: 'https://github.com/forattini-dev/s3db.js',
    clicksCount: 0,
    createdAt: new Date().toISOString(),
    createdBy: 'admin'
  });

  console.log('✅ Created 3 URLs: google, github, s3db\n');

  // 6. Simulate clicks (hook will automatically increment counters!)
  console.log('═'.repeat(70));
  console.log('🖱️  SIMULATING CLICKS');
  console.log('═'.repeat(70));

  // Google gets 5 clicks
  for (let i = 0; i < 5; i++) {
    await clicks.insert({
      id: `click-google-${i}`,
      urlId: 'google',
      ip: `192.168.1.${i}`,
      userAgent: 'Mozilla/5.0',
      referer: 'https://twitter.com',
      timestamp: new Date().toISOString()
    });
  }

  // GitHub gets 3 clicks
  for (let i = 0; i < 3; i++) {
    await clicks.insert({
      id: `click-github-${i}`,
      urlId: 'github',
      ip: `10.0.0.${i}`,
      userAgent: 'Chrome/120.0',
      referer: 'https://reddit.com',
      timestamp: new Date().toISOString()
    });
  }

  // S3DB gets 10 clicks
  for (let i = 0; i < 10; i++) {
    await clicks.insert({
      id: `click-s3db-${i}`,
      urlId: 's3db',
      ip: `172.16.0.${i}`,
      userAgent: 'Safari/17.0',
      referer: 'https://news.ycombinator.com',
      timestamp: new Date().toISOString()
    });
  }

  console.log('\n✅ Created 18 total clicks (5 google, 3 github, 10 s3db)');
  console.log('⏳ Transactions created, waiting for consolidation...\n');

  // 7. Check BEFORE consolidation (values not updated yet)
  console.log('═'.repeat(70));
  console.log('📊 BEFORE CONSOLIDATION (Async Mode)');
  console.log('═'.repeat(70) + '\n');

  let googleUrl = await urls.get('google');
  let githubUrl = await urls.get('github');
  let s3dbUrl = await urls.get('s3db');

  console.log(`Google clicks: ${googleUrl.clicksCount} (transactions pending)`);
  console.log(`GitHub clicks: ${githubUrl.clicksCount} (transactions pending)`);
  console.log(`S3DB clicks: ${s3dbUrl.clicksCount} (transactions pending)`);

  // 8. Wait for auto-consolidation OR manually consolidate
  console.log('\n⏳ Waiting 12 seconds for auto-consolidation...\n');
  await new Promise(resolve => setTimeout(resolve, 12000));

  // 9. Check AFTER consolidation (values updated!)
  console.log('═'.repeat(70));
  console.log('📊 AFTER CONSOLIDATION - ORIGINAL FIELDS UPDATED!');
  console.log('═'.repeat(70) + '\n');

  googleUrl = await urls.get('google');
  githubUrl = await urls.get('github');
  s3dbUrl = await urls.get('s3db');

  console.log(`Google clicks: ${googleUrl.clicksCount} ✅ (UPDATED from urls.clicksCount field!)`);
  console.log(`GitHub clicks: ${githubUrl.clicksCount} ✅ (UPDATED from urls.clicksCount field!)`);
  console.log(`S3DB clicks: ${s3dbUrl.clicksCount} ✅ (UPDATED from urls.clicksCount field!)`);

  // 10. Analytics - Top URLs by clicks
  console.log('\n' + '═'.repeat(70));
  console.log('🏆 TOP URLs BY CLICKS (Analytics API)');
  console.log('═'.repeat(70) + '\n');

  const today = new Date().toISOString().substring(0, 10);
  const topUrls = await urlsPlugin.getTopRecords('urls', 'clicksCount', {
    period: 'day',
    date: today,
    metric: 'transactionCount',
    limit: 10
  });

  topUrls.forEach((url, idx) => {
    console.log(`${idx + 1}. ${url.recordId.padEnd(10)} → ${url.count} clicks`);
  });

  // 11. Hourly analytics
  console.log('\n' + '═'.repeat(70));
  console.log('📈 HOURLY CLICK ANALYTICS');
  console.log('═'.repeat(70) + '\n');

  const hourlyStats = await urlsPlugin.getDayByHour('urls', 'clicksCount', today, {
    fillGaps: true  // Get all 24 hours
  });

  const currentHour = new Date().getHours();
  const recentHours = hourlyStats.filter(h => {
    const hour = parseInt(h.cohort.substring(11, 13));
    return hour >= currentHour - 2 && hour <= currentHour;
  });

  console.log('Last 3 hours:');
  recentHours.forEach(hour => {
    const time = hour.cohort.substring(11);
    console.log(`  ${time}:00 → ${hour.count} clicks`);
  });

  // 12. Demonstrate real-world usage
  console.log('\n' + '═'.repeat(70));
  console.log('💡 REAL-WORLD USAGE PATTERN');
  console.log('═'.repeat(70) + '\n');

  console.log(`
// Your URL shortener redirect endpoint:
app.get('/:shortCode', async (req, res) => {
  const { shortCode } = req.params;

  // Get the URL
  const url = await urls.get(shortCode);
  if (!url) return res.status(404).send('URL not found');

  // Record click (hook automatically increments counter!)
  await clicks.insert({
    id: generateId(),
    urlId: shortCode,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    referer: req.headers['referer'],
    timestamp: new Date().toISOString()
  });
  // ↑ Hook calls: urls.add(shortCode, 1)
  // ↑ Consolidation updates: urls.clicksCount (every 5min)

  // Redirect
  res.redirect(url.url);
});

// Dashboard endpoint:
app.get('/stats/:shortCode', async (req, res) => {
  const { shortCode } = req.params;

  // Get current count (ORIGINAL FIELD, updated by consolidation!)
  const url = await urls.get(shortCode);

  // Get analytics (pre-calculated, instant!)
  const last7Days = await plugin.getLastNDays('urls', 'clicksCount', 7, {
    fillGaps: true  // Perfect for charts
  });

  res.json({
    url: url.url,
    totalClicks: url.clicksCount,  // ← From original field!
    chart: last7Days.map(d => ({
      date: d.cohort,
      clicks: d.count
    }))
  });
});
  `);

  // 13. Summary
  console.log('═'.repeat(70));
  console.log('✅ SUMMARY');
  console.log('═'.repeat(70) + '\n');

  console.log(`
Key Takeaways:

1. ✅ Hooks automatically trigger counter increments
   → clicks.afterInsert calls urls.add(urlId, 1)

2. ✅ Original field IS UPDATED during consolidation
   → urls.clicksCount contains the real count
   → No need to query transactions!

3. ✅ Analytics provide instant reports
   → Top URLs, hourly stats, trends
   → O(1) queries vs O(n) scans

4. ✅ this.database.resources gives access to other resources
   → Perfect for cross-resource operations in hooks

5. ✅ Production-ready pattern
   → Auto-consolidation handles updates
   → Distributed locks prevent race conditions
   → Analytics pre-calculated for dashboards

Perfect for:
- URL shorteners
- Link tracking
- Ad click counting
- API rate limiting
- Usage metering
- Event counters
  `);

  await s3db.disconnect();
  console.log('✅ Done!\n');
}

main().catch(console.error);
