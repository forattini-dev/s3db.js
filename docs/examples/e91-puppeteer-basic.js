/**
 * Example 91: PuppeteerPlugin - Basic Navigation
 *
 * This example demonstrates basic web scraping with human behavior simulation.
 */

import { Database, PuppeteerPlugin } from '../../src/index.js';

async function example() {
  console.log('🤖 Example 91: PuppeteerPlugin - Basic Navigation\n');

  // Create database
  const db = new Database({
    connectionString: 'http://test:test@localhost:4566/bucket'
  });

  await db.connect();

  // Install PuppeteerPlugin
  const puppeteer = new PuppeteerPlugin({
    pool: {
      enabled: true,
      maxBrowsers: 2,
      maxTabsPerBrowser: 5
    },
    stealth: {
      enabled: true
    },
    humanBehavior: {
      enabled: true,
      mouse: {
        bezierCurves: true,
        overshoot: true,
        jitter: true,
        pathThroughElements: true
      },
      typing: {
        mistakes: true,
        corrections: true
      }
    },
    performance: {
      blockResources: {
        enabled: true,
        types: ['image', 'stylesheet', 'font']
      }
    }
  });

  await db.installPlugin(puppeteer);
  await db.start();

  console.log('✅ PuppeteerPlugin installed and started\n');

  // Example 1: Simple navigation
  console.log('📄 Example 1: Simple Navigation');
  const page = await puppeteer.navigate('https://example.com', {
    screenshot: true,
    waitUntil: 'networkidle2'
  });

  console.log('  User Agent:', page._userAgent);
  console.log('  Viewport:', JSON.stringify(page._viewport));

  // Get page title
  const title = await page.title();
  console.log('  Page Title:', title);

  await page.close();
  console.log('  ✅ Navigation completed\n');

  // Example 2: Human interaction
  console.log('📄 Example 2: Human Interaction');
  const page2 = await puppeteer.navigate('https://example.com');

  // Human-like scrolling
  console.log('  Scrolling with human behavior...');
  await page2.humanScroll({ direction: 'down' });

  // Human-like clicking (if element exists)
  try {
    console.log('  Attempting human click...');
    await page2.humanClick('a');
    console.log('  ✅ Click successful');
  } catch (err) {
    console.log('  ℹ️ No clickable elements found');
  }

  await page2.close();
  console.log('  ✅ Human interaction completed\n');

  // Example 3: Search with human typing
  console.log('📄 Example 3: Search with Human Typing');
  const page3 = await puppeteer.navigate('https://www.google.com');

  try {
    // Type with human behavior (mistakes, corrections, delays)
    console.log('  Typing with human behavior...');
    await page3.humanType('textarea[name="q"]', 'puppeteer automation');

    // Wait for autocomplete
    await page3.waitForTimeout(2000);

    // Submit form
    await page3.keyboard.press('Enter');
    await page3.waitForNavigation();

    const resultsTitle = await page3.title();
    console.log('  Results Page Title:', resultsTitle);
    console.log('  ✅ Search completed\n');
  } catch (err) {
    console.log('  ℹ️ Search failed:', err.message);
  }

  await page3.close();

  // Cleanup
  await db.stop();
  await db.disconnect();

  console.log('✅ Example completed!\n');
  console.log('Key Features Demonstrated:');
  console.log('  • Browser pool management');
  console.log('  • Stealth mode (anti-detection)');
  console.log('  • Random user agents and viewports');
  console.log('  • Human behavior simulation (mouse, typing, scrolling)');
  console.log('  • Performance optimization (resource blocking)');
}

// Run example
example().catch(console.error);
