/**
 * Example 93: PuppeteerPlugin - Proxy Pool with Immutable Session Binding
 *
 * This example demonstrates the IMMUTABLE proxy-session binding feature.
 * Once a session is created with a proxy, they remain bound forever.
 * This prevents fingerprint leakage and maintains consistency.
 */

import { Database, PuppeteerPlugin } from '../../src/index.js';

async function example() {
  console.log('🔐 Example 93: PuppeteerPlugin - Proxy Pool with Immutable Binding\n');

  // Create database
  const db = new Database({
    connectionString: 'http://test:test@localhost:4566/bucket'
  });

  await db.connect();

  // Install PuppeteerPlugin with proxy pool
  const puppeteer = new PuppeteerPlugin({
    proxy: {
      enabled: true,
      list: [
        // Multiple proxy formats supported
        'http://user1:pass1@proxy1.example.com:8080',
        'http://user2:pass2@proxy2.example.com:8080',
        {
          protocol: 'http',
          host: 'proxy3.example.com',
          port: 8080,
          username: 'user3',
          password: 'pass3'
        },
        {
          protocol: 'http',
          host: 'proxy4.example.com',
          port: 8080,
          username: 'user4',
          password: 'pass4'
        }
      ],
      selectionStrategy: 'round-robin', // 'round-robin' | 'random' | 'least-used' | 'best-performance'
      bypassList: ['localhost', '127.0.0.1'],
      healthCheck: {
        enabled: true,
        interval: 300000,
        testUrl: 'https://www.google.com',
        timeout: 10000,
        successRateThreshold: 0.3
      }
    },
    cookies: {
      enabled: true,
      farming: {
        enabled: true
      }
    },
    humanBehavior: {
      enabled: true
    }
  });

  await db.installPlugin(puppeteer);
  await db.start();

  console.log('✅ PuppeteerPlugin installed with proxy pool\n');

  // Get initial proxy stats
  console.log('📊 Initial Proxy Pool Status:');
  const initialStats = puppeteer.getProxyStats();
  initialStats.forEach(stat => {
    console.log(`  • ${stat.url}`);
    console.log(`    Requests: ${stat.requests}, Success Rate: ${(stat.successRate * 100).toFixed(1)}%`);
    console.log(`    Bound Sessions: ${stat.boundSessions}, Healthy: ${stat.healthy ? '✅' : '❌'}`);
  });
  console.log();

  // Concept 1: IMMUTABLE BINDING - Session gets assigned a proxy automatically
  console.log('📄 Concept 1: Automatic Proxy Assignment (IMMUTABLE)');

  const session1 = 'session_' + Date.now() + '_1';
  const session2 = 'session_' + Date.now() + '_2';
  const session3 = 'session_' + Date.now() + '_3';

  console.log(`  Creating 3 sessions...`);

  // First navigation - session1 gets assigned proxy1 (round-robin)
  const page1 = await puppeteer.navigate('https://www.example.com', {
    useSession: session1
  });
  console.log(`  ✅ ${session1} navigated (proxy assigned)`);
  await page1.close();

  // Second navigation - session2 gets assigned proxy2 (round-robin)
  const page2 = await puppeteer.navigate('https://www.example.com', {
    useSession: session2
  });
  console.log(`  ✅ ${session2} navigated (proxy assigned)`);
  await page2.close();

  // Third navigation - session3 gets assigned proxy3 (round-robin)
  const page3 = await puppeteer.navigate('https://www.example.com', {
    useSession: session3
  });
  console.log(`  ✅ ${session3} navigated (proxy assigned)\n`);
  await page3.close();

  // Concept 2: View session-proxy bindings
  console.log('📄 Concept 2: Session-Proxy Bindings');

  const bindings = puppeteer.getSessionProxyBindings();
  console.log(`  Total Bindings: ${bindings.length}`);
  bindings.forEach(binding => {
    console.log(`  • ${binding.sessionId} → ${binding.proxyUrl}`);
  });
  console.log();

  // Concept 3: IMMUTABILITY - Sessions ALWAYS use the same proxy
  console.log('📄 Concept 3: IMMUTABILITY Enforcement');

  console.log(`  Re-using ${session1} (should use SAME proxy)...`);

  // This will use the SAME proxy as before (immutable binding!)
  const page1Again = await puppeteer.navigate('https://www.google.com', {
    useSession: session1
  });

  const title1 = await page1Again.title();
  console.log(`  Page Title: ${title1}`);
  console.log(`  ✅ Session used the SAME bound proxy (immutable!)\n`);
  await page1Again.close();

  // Concept 4: Proxy Statistics
  console.log('📄 Concept 4: Proxy Usage Statistics');

  const stats = puppeteer.getProxyStats();
  stats.forEach(stat => {
    console.log(`  • ${stat.url}`);
    console.log(`    Requests: ${stat.requests}`);
    console.log(`    Success Rate: ${(stat.successRate * 100).toFixed(1)}%`);
    console.log(`    Bound Sessions: ${stat.boundSessions}`);
    console.log(`    Healthy: ${stat.healthy ? '✅' : '❌'}`);
  });
  console.log();

  // Concept 5: Proxy Health Checks
  console.log('📄 Concept 5: Proxy Health Monitoring');

  console.log('  Running health checks on all proxies...');
  const healthResults = await puppeteer.checkProxyHealth();

  console.log(`  Total Proxies: ${healthResults.total}`);
  console.log(`  Healthy: ${healthResults.healthy}`);
  console.log(`  Unhealthy: ${healthResults.unhealthy}`);
  console.log();

  healthResults.checks.forEach(check => {
    const status = check.healthy ? '✅' : '❌';
    console.log(`  ${status} ${check.url}`);
  });
  console.log();

  // Concept 6: Selection Strategies
  console.log('📄 Concept 6: Proxy Selection Strategies');
  console.log('  Available strategies:');
  console.log('  • round-robin - Distribute evenly (default)');
  console.log('  • random - Random selection');
  console.log('  • least-used - Pick proxy with fewest requests');
  console.log('  • best-performance - Pick proxy with highest success rate');
  console.log(`  Current strategy: ${puppeteer.config.proxy.selectionStrategy}\n`);

  // Concept 7: Cookie Farming with Proxies
  console.log('📄 Concept 7: Cookie Farming with Proxy Binding');

  const farmedSession = 'farmed_' + Date.now();
  console.log(`  Farming cookies for ${farmedSession}...`);

  // This will assign a proxy and use it for all warmup pages
  await puppeteer.farmCookies(farmedSession);

  // Check binding
  const farmedBinding = puppeteer.getSessionProxyBindings().find(
    b => b.sessionId === farmedSession
  );

  console.log(`  ✅ Farmed session bound to: ${farmedBinding.proxyUrl}`);
  console.log('  All warmup requests used the SAME proxy (consistent fingerprint!)\n');

  // Cleanup
  await db.stop();
  await db.disconnect();

  console.log('✅ Example completed!\n');
  console.log('🔑 Key Concepts:');
  console.log('  1. IMMUTABLE BINDING - Session + Proxy = Forever');
  console.log('  2. Automatic Assignment - First request assigns proxy');
  console.log('  3. Consistent Fingerprint - Same proxy = Same identity');
  console.log('  4. Health Monitoring - Track proxy performance');
  console.log('  5. Multiple Strategies - Round-robin, random, least-used, best-performance');
  console.log('  6. Cookie Farming - Build reputation with consistent proxy');
  console.log('\n🚫 Important: Once bound, session-proxy relationship CANNOT change!');
  console.log('   This prevents fingerprint leakage and detection.');
}

// Run example
example().catch(console.error);
