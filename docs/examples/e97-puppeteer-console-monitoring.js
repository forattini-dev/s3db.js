/**
 * Example: Console Monitoring
 *
 * Demonstrates console message tracking:
 * - console.log, console.error, console.warn, console.info, console.debug
 * - Uncaught exceptions
 * - Promise rejections
 * - Stack traces
 * - Source locations
 * - S3DB persistence with partitions
 *
 * Use cases:
 * - JavaScript error tracking in production
 * - Debug issues without browser DevTools
 * - Monitor third-party script errors
 * - Track console usage patterns
 * - Detect performance warnings
 */

import { Database } from '../../src/database.class.js';
import { PuppeteerPlugin } from '../../src/plugins/puppeteer.plugin.js';

async function main() {
  const db = new Database({
    connectionString: 'http://test:test@localhost:4566/bucket',
    paranoid: false
  });

  await db.connect();

  console.log('\n🖥️  Console Monitoring Demo\n');

  // =================================================================
  // 1. BASIC CONSOLE MONITORING
  // =================================================================
  console.log('1️⃣  Basic Console Monitoring\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin1 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    consoleMonitor: {
      enabled: true,
      persist: false  // Just collect, don't save
    }
  });

  await db.installPlugin(puppeteerPlugin1);
  await db.start();

  const page1 = await puppeteerPlugin1.navigate('https://example.com');
  const session1 = await puppeteerPlugin1.consoleMonitor.startMonitoring(page1);

  // Trigger various console messages
  await page1.evaluate(() => {
    console.log('This is a log message');
    console.info('This is an info message');
    console.warn('This is a warning message');
    console.error('This is an error message');
    console.debug('This is a debug message');
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  const result1 = await puppeteerPlugin1.consoleMonitor.stopMonitoring(session1);

  console.log('\n📊 Session Statistics:');
  console.log(`   Session ID: ${result1.sessionId}`);
  console.log(`   Total Messages: ${result1.stats.totalMessages}`);
  console.log(`   Errors: ${result1.stats.errorCount}`);
  console.log(`   Warnings: ${result1.stats.warningCount}`);
  console.log(`   Logs: ${result1.stats.logCount}`);
  console.log(`   Info: ${result1.stats.infoCount}`);
  console.log(`   Debug: ${result1.stats.debugCount}\n`);

  console.log('📋 Messages:');
  result1.messages.forEach((msg, i) => {
    const icon = msg.type === 'error' ? '❌' : msg.type === 'warning' ? '⚠️' : msg.type === 'info' ? 'ℹ️' : '📝';
    console.log(`   ${icon} [${msg.type.toUpperCase()}] ${msg.text}`);
  });

  await page1.close();
  await db.stop();

  // =================================================================
  // 2. ERROR TRACKING (ERRORS ONLY)
  // =================================================================
  console.log('\n\n2️⃣  Error Tracking (Errors Only)\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin2 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    consoleMonitor: {
      enabled: true,
      persist: false,
      filters: {
        levels: ['error', 'warning']  // Only errors and warnings
      }
    }
  });

  await db.installPlugin(puppeteerPlugin2);
  await db.start();

  const page2 = await puppeteerPlugin2.navigate('https://example.com');
  const session2 = await puppeteerPlugin2.consoleMonitor.startMonitoring(page2);

  // Trigger errors
  await page2.evaluate(() => {
    console.log('This will be filtered out');
    console.error('Critical error occurred!');
    console.warn('This is a warning');
    console.info('This will also be filtered out');

    // Trigger uncaught exception
    setTimeout(() => {
      throw new Error('Uncaught exception test');
    }, 100);

    // Trigger promise rejection
    Promise.reject(new Error('Promise rejection test'));
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  const result2 = await puppeteerPlugin2.consoleMonitor.stopMonitoring(session2);

  console.log(`\n❌ Errors & Warnings: ${result2.messages.length}\n`);

  result2.messages.forEach((msg, i) => {
    console.log(`   ${i + 1}. [${msg.type.toUpperCase()}] ${msg.text}`);
    if (msg.stackTrace) {
      console.log(`      Stack: ${msg.stackTrace.frames?.[0] || 'No stack'}`);
    }
  });

  if (result2.exceptions.length > 0) {
    console.log(`\n🔥 Uncaught Exceptions: ${result2.exceptions.length}\n`);
    result2.exceptions.forEach((exc, i) => {
      console.log(`   ${i + 1}. ${exc.message}`);
    });
  }

  if (result2.promiseRejections.length > 0) {
    console.log(`\n⚠️  Promise Rejections: ${result2.promiseRejections.length}\n`);
    result2.promiseRejections.forEach((rej, i) => {
      console.log(`   ${i + 1}. ${rej.message}`);
    });
  }

  await page2.close();
  await db.stop();

  // =================================================================
  // 3. CONSOLE MONITORING WITH PERSISTENCE
  // =================================================================
  console.log('\n\n3️⃣  Console Monitoring with S3DB Persistence\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin3 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    consoleMonitor: {
      enabled: true,
      persist: true,  // ✅ Save to S3DB
      filters: {
        levels: null,  // All levels
        includeStackTraces: true,
        includeSourceLocation: true
      }
    }
  });

  await db.installPlugin(puppeteerPlugin3);
  await db.start();

  const page3 = await puppeteerPlugin3.navigate('https://example.com');
  const session3 = await puppeteerPlugin3.consoleMonitor.startMonitoring(page3);

  // Trigger various messages
  await page3.evaluate(() => {
    console.log('Application started');
    console.info('User logged in');
    console.warn('Deprecated API called');
    console.error('Failed to load resource');
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  const result3 = await puppeteerPlugin3.consoleMonitor.stopMonitoring(session3);

  console.log('\n✅ Session persisted to S3DB!');
  console.log(`   Session ID: ${result3.sessionId}`);
  console.log(`   Messages Saved: ${result3.messages.length}`);
  console.log(`   Errors Saved: ${result3.errors.length}\n`);

  // Query back from S3DB
  const savedSession = await puppeteerPlugin3.consoleMonitor.getSessionStats(result3.sessionId);
  console.log('📊 Retrieved from S3DB:');
  console.log(`   URL: ${savedSession.url}`);
  console.log(`   Total Messages: ${savedSession.totalMessages}`);
  console.log(`   Errors: ${savedSession.errorCount}`);
  console.log(`   Warnings: ${savedSession.warningCount}\n`);

  // Query messages for this session
  const savedMessages = await puppeteerPlugin3.consoleMonitor.getSessionMessages(result3.sessionId);
  console.log(`📋 Messages from S3DB: ${savedMessages.length}\n`);

  savedMessages.forEach((msg, i) => {
    console.log(`   ${i + 1}. [${msg.type.toUpperCase()}] ${msg.text}`);
  });

  // Query errors only
  const errorMessages = await puppeteerPlugin3.consoleMonitor.messagesResource.listPartition('byType', { type: 'error' });
  console.log(`\n❌ Total errors in database: ${errorMessages.length}\n`);

  await page3.close();
  await db.stop();

  // =================================================================
  // 4. PATTERN EXCLUSION
  // =================================================================
  console.log('\n4️⃣  Pattern Exclusion\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin4 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    consoleMonitor: {
      enabled: true,
      persist: false,
      filters: {
        excludePatterns: [
          'Deprecation',  // Exclude deprecation warnings
          'DevTools',     // Exclude DevTools messages
          'Download the'  // Exclude extension ads
        ]
      }
    }
  });

  await db.installPlugin(puppeteerPlugin4);
  await db.start();

  const page4 = await puppeteerPlugin4.navigate('https://example.com');
  const session4 = await puppeteerPlugin4.consoleMonitor.startMonitoring(page4);

  // Trigger messages (some will be excluded)
  await page4.evaluate(() => {
    console.log('This will be captured');
    console.warn('Deprecation warning - will be excluded');
    console.info('DevTools message - will be excluded');
    console.error('Real error - will be captured');
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  const result4 = await puppeteerPlugin4.consoleMonitor.stopMonitoring(session4);

  console.log(`\n📊 Captured Messages: ${result4.messages.length}\n`);
  result4.messages.forEach((msg, i) => {
    console.log(`   ${i + 1}. [${msg.type.toUpperCase()}] ${msg.text}`);
  });

  await page4.close();
  await db.stop();

  // =================================================================
  // 5. REAL-WORLD USE CASE: ERROR MONITORING
  // =================================================================
  console.log('\n\n5️⃣  Real-World Use Case: Production Error Monitoring\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin5 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    consoleMonitor: {
      enabled: true,
      persist: true,
      filters: {
        levels: ['error', 'warning'],  // Only track problems
        includeStackTraces: true,
        includeSourceLocation: true
      }
    }
  });

  await db.installPlugin(puppeteerPlugin5);
  await db.start();

  console.log('\n💼 Simulating production error tracking...\n');

  const urls = [
    'https://example.com',
    'https://www.iana.org/'
  ];

  const errorSummary = {
    total: 0,
    byType: {},
    byUrl: {}
  };

  for (const url of urls) {
    try {
      const page = await puppeteerPlugin5.navigate(url);
      const session = await puppeteerPlugin5.consoleMonitor.startMonitoring(page);

      await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = await puppeteerPlugin5.consoleMonitor.stopMonitoring(session);

      errorSummary.total += result.stats.errorCount + result.stats.warningCount;
      errorSummary.byUrl[url] = result.stats.errorCount + result.stats.warningCount;

      console.log(`   ✅ ${url}`);
      console.log(`      Errors: ${result.stats.errorCount} | Warnings: ${result.stats.warningCount}`);

      await page.close();
    } catch (err) {
      console.log(`   ❌ ${url} - ${err.message}`);
    }
  }

  console.log('\n📈 Error Summary:');
  console.log(`   Total Issues: ${errorSummary.total}\n`);

  Object.entries(errorSummary.byUrl).forEach(([url, count]) => {
    console.log(`   ${url}: ${count} issues`);
  });

  // Query all errors by type
  const typeErrors = await puppeteerPlugin5.consoleMonitor.errorsResource.listPartition('byErrorType', { errorType: 'TypeError' });
  console.log(`\n   TypeErrors in database: ${typeErrors.length}`);

  await db.stop();

  // =================================================================
  // CLEANUP
  // =================================================================
  await db.disconnect();

  console.log('\n✅ Console monitoring demo completed!\n');
  console.log('📝 Key Takeaways:\n');
  console.log('   • Captures ALL console messages (log, error, warn, info, debug)');
  console.log('   • Tracks uncaught exceptions and promise rejections');
  console.log('   • Includes stack traces and source locations');
  console.log('   • Filters by level (errors only, warnings only, etc.)');
  console.log('   • Pattern exclusion (exclude noisy messages)');
  console.log('   • S3DB persistence with partitions (bySession, byType, byDate)');
  console.log('   • Perfect for production error tracking\n');
}

main().catch(console.error);
