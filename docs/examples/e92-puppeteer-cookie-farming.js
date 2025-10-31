/**
 * Example 92: PuppeteerPlugin - Cookie Farming
 *
 * This example demonstrates cookie farming strategies for building
 * trusted browser sessions that can bypass anti-bot systems.
 */

import { Database, PuppeteerPlugin } from '../../src/index.js';

async function example() {
  console.log('🍪 Example 92: PuppeteerPlugin - Cookie Farming\n');

  // Create database
  const db = new Database({
    connectionString: 'http://test:test@localhost:4566/bucket'
  });

  await db.connect();

  // Install PuppeteerPlugin with cookie farming enabled
  const puppeteer = new PuppeteerPlugin({
    cookies: {
      enabled: true,
      storage: {
        resource: 'puppeteer_cookies',
        autoSave: true,
        autoLoad: true,
        encrypt: true
      },
      farming: {
        enabled: true,
        warmup: {
          enabled: true,
          pages: [
            'https://www.google.com',
            'https://www.youtube.com',
            'https://www.wikipedia.org',
            'https://www.reddit.com'
          ],
          randomOrder: true,
          timePerPage: { min: 5000, max: 15000 },
          interactions: {
            scroll: true,
            click: true,
            hover: true
          }
        },
        rotation: {
          enabled: true,
          requestsPerCookie: 100,
          maxAge: 86400000, // 24 hours
          poolSize: 10
        },
        reputation: {
          enabled: true,
          trackSuccess: true,
          retireThreshold: 0.5, // Retire cookies with <50% success rate
          ageBoost: true // Older cookies get score boost
        }
      }
    },
    humanBehavior: {
      enabled: true
    }
  });

  await db.installPlugin(puppeteer);
  await db.start();

  console.log('✅ PuppeteerPlugin installed with cookie farming\n');

  // Strategy 1: Farm cookies for a new session
  console.log('📄 Strategy 1: Warmup New Session');
  const sessionId = 'session_' + Date.now();

  console.log(`  Session ID: ${sessionId}`);
  console.log('  Starting warmup process...');

  // Listen to farming events
  puppeteer.on('cookieManager.warmupPageCompleted', (data) => {
    console.log(`  ✅ Completed warmup: ${data.url}`);
  });

  puppeteer.on('cookieManager.farmingCompleted', (data) => {
    console.log(`  🎉 Farming completed for session: ${data.sessionId}\n`);
  });

  // Farm cookies by visiting trusted sites
  await puppeteer.farmCookies(sessionId);

  // Strategy 2: Use farmed session for scraping
  console.log('📄 Strategy 2: Use Farmed Session');

  const page = await puppeteer.navigate('https://www.example.com', {
    useSession: sessionId // Use the farmed session
  });

  console.log('  Page loaded with farmed cookies');
  console.log('  User Agent:', page._userAgent);

  // Simulate successful scraping
  const title = await page.title();
  console.log('  Page Title:', title);

  await page.close();
  console.log('  ✅ Scraping with farmed session completed\n');

  // Strategy 3: Get cookie pool statistics
  console.log('📄 Strategy 3: Cookie Pool Statistics');

  const stats = await puppeteer.getCookieStats();
  console.log('  Total Sessions:', stats.total);
  console.log('  Healthy Sessions:', stats.healthy);
  console.log('  Expired Sessions:', stats.expired);
  console.log('  Overused Sessions:', stats.overused);
  console.log('  Low Reputation:', stats.lowReputation);
  console.log('  Average Age:', Math.round(stats.averageAge / 1000 / 60), 'minutes');
  console.log('  Average Success Rate:', (stats.averageSuccessRate * 100).toFixed(1) + '%');
  console.log('  Average Request Count:', Math.round(stats.averageRequestCount));
  console.log('  ✅ Statistics retrieved\n');

  // Strategy 4: Get best cookie from pool
  console.log('📄 Strategy 4: Select Best Cookie');

  const bestCookie = await puppeteer.cookieManager.getBestCookie();
  if (bestCookie) {
    console.log('  Best Session ID:', bestCookie.sessionId);
    console.log('  Success Rate:', (bestCookie.reputation.successRate * 100).toFixed(1) + '%');
    console.log('  Age:', Math.round(bestCookie.metadata.age / 1000 / 60), 'minutes');
    console.log('  Request Count:', bestCookie.metadata.requestCount);
    console.log('  ✅ Best cookie selected\n');
  } else {
    console.log('  ℹ️ No healthy cookies available\n');
  }

  // Strategy 5: Rotate expired/bad cookies
  console.log('📄 Strategy 5: Rotate Cookies');

  const removed = await puppeteer.cookieManager.rotateCookies();
  console.log('  Removed:', removed, 'expired/bad cookies');
  console.log('  ✅ Rotation completed\n');

  // Cleanup
  await db.stop();
  await db.disconnect();

  console.log('✅ Example completed!\n');
  console.log('Cookie Farming Strategies:');
  console.log('  1. Warmup Sessions - Visit trusted sites to build reputation');
  console.log('  2. Reputation Tracking - Monitor success rates');
  console.log('  3. Age-Based Rotation - Older cookies = more trustworthy');
  console.log('  4. Automatic Retirement - Remove bad cookies');
  console.log('  5. Smart Selection - Pick best cookie based on score');
  console.log('\nBenefits:');
  console.log('  • Bypass anti-bot detection');
  console.log('  • Maintain persistent sessions');
  console.log('  • Reduce blocking rates');
  console.log('  • Simulate real user behavior');
}

// Run example
example().catch(console.error);
