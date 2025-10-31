/**
 * Example: Network Monitoring with Chrome DevTools Protocol
 *
 * Demonstrates comprehensive network activity tracking:
 * - Request/Response capture (headers, timing, sizes)
 * - Resource type analysis (images, scripts, CSS, XHR)
 * - Error tracking (failed requests, timeouts, CSP violations)
 * - CDN detection (Cloudflare, CloudFront, Fastly, Akamai)
 * - Compression analysis (gzip, brotli)
 * - Cache behavior
 * - S3DB persistence with intelligent partitioning
 *
 * Use cases:
 * - SEO analysis (image sizes, script sizes, load times)
 * - Performance debugging (slow requests, failed requests)
 * - Security auditing (CSP violations, mixed content)
 * - Cost analysis (bandwidth usage, CDN hits)
 */

import { Database } from '../../src/database.class.js';
import { PuppeteerPlugin } from '../../src/plugins/puppeteer.plugin.js';

async function main() {
  // Initialize database
  const db = new Database({
    connectionString: 'http://test:test@localhost:4566/bucket',
    paranoid: false
  });

  await db.connect();

  console.log('\n🌐 Network Monitoring Demo\n');

  // =================================================================
  // 1. BASIC NETWORK MONITORING (NO PERSISTENCE)
  // =================================================================
  console.log('1️⃣  Basic Network Monitoring (In-Memory)\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin1 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    networkMonitor: {
      enabled: true,
      persist: false  // Just collect, don't save
    }
  });

  await db.installPlugin(puppeteerPlugin1);
  await db.start();

  const page1 = await puppeteerPlugin1.navigate('https://example.com');

  // Start monitoring
  const session1 = await puppeteerPlugin1.networkMonitor.startMonitoring(page1);

  console.log(`📊 Session ID: ${session1.sessionId}`);
  console.log(`🌐 URL: ${session1.url}`);
  console.log(`📅 Date: ${session1.date}\n`);

  // Wait for page to finish loading
  await page1.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Stop monitoring
  const result1 = await puppeteerPlugin1.networkMonitor.stopMonitoring(session1);

  console.log('📈 Session Statistics:');
  console.log(`   Total Requests:      ${result1.stats.totalRequests}`);
  console.log(`   Successful:          ${result1.stats.successfulRequests}`);
  console.log(`   Failed:              ${result1.stats.failedRequests}`);
  console.log(`   Total Size:          ${(result1.stats.totalBytes / 1024).toFixed(2)}KB`);
  console.log(`   Transferred Size:    ${(result1.stats.transferredBytes / 1024).toFixed(2)}KB`);
  console.log(`   Cached:              ${(result1.stats.cachedBytes / 1024).toFixed(2)}KB`);
  console.log(`   Duration:            ${result1.duration}ms\n`);

  console.log('📦 By Resource Type:');
  Object.entries(result1.stats.byType).forEach(([type, stats]) => {
    console.log(`   ${type.padEnd(12)} ${stats.count.toString().padStart(3)} requests  ${(stats.size / 1024).toFixed(0).padStart(6)}KB`);
  });

  console.log('\n📋 Individual Requests:');
  result1.requests.slice(0, 10).forEach((req, i) => {
    console.log(`\n   ${i + 1}. ${req.url.substring(0, 70)}`);
    console.log(`      Type: ${req.type}  |  Status: ${req.statusCode}  |  Size: ${(req.resourceSize / 1024).toFixed(1)}KB  |  ${req.duration?.toFixed(0)}ms`);
    if (req.compression !== 'none') {
      console.log(`      Compression: ${req.compression}  |  Saved: ${((1 - req.transferredSize / req.resourceSize) * 100).toFixed(0)}%`);
    }
    if (req.cdn) {
      console.log(`      CDN: ${req.cdn}`);
    }
  });

  if (result1.failures.length > 0) {
    console.log('\n❌ Failed Requests:');
    result1.failures.forEach((failure, i) => {
      console.log(`   ${i + 1}. ${failure.url}`);
      console.log(`      Error: ${failure.errorText}`);
    });
  }

  await page1.close();
  await db.stop();

  // =================================================================
  // 2. FILTERED MONITORING (IMAGES ONLY)
  // =================================================================
  console.log('\n\n2️⃣  Filtered Monitoring (Images Only)\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin2 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    performance: {
      blockResources: { enabled: false }  // Don't block anything
    },
    networkMonitor: {
      enabled: true,
      persist: false,
      filters: {
        types: ['image'],  // Only images
        minSize: 10240     // Only > 10KB
      }
    }
  });

  await db.installPlugin(puppeteerPlugin2);
  await db.start();

  const page2 = await puppeteerPlugin2.navigate('https://www.iana.org/');
  const session2 = await puppeteerPlugin2.networkMonitor.startMonitoring(page2, {
    filters: {
      types: ['image'],
      minSize: 1024  // > 1KB
    }
  });

  await page2.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const result2 = await puppeteerPlugin2.networkMonitor.stopMonitoring(session2);

  console.log(`\n📸 Image Analysis:`);
  console.log(`   Total Images: ${result2.requests.length}`);

  const totalSize = result2.requests.reduce((sum, r) => sum + (r.resourceSize || 0), 0);
  const totalTransferred = result2.requests.reduce((sum, r) => sum + (r.transferredSize || 0), 0);

  console.log(`   Total Size: ${(totalSize / 1024).toFixed(2)}KB`);
  console.log(`   Transferred: ${(totalTransferred / 1024).toFixed(2)}KB`);
  console.log(`   Compression Savings: ${((1 - totalTransferred / totalSize) * 100).toFixed(0)}%\n`);

  console.log('🖼️  Largest Images:');
  result2.requests
    .sort((a, b) => (b.resourceSize || 0) - (a.resourceSize || 0))
    .slice(0, 5)
    .forEach((img, i) => {
      console.log(`   ${i + 1}. ${(img.resourceSize / 1024).toFixed(1)}KB - ${img.url.split('/').pop()}`);
      console.log(`      ${img.mimeType}  |  ${img.compression}  |  ${img.duration?.toFixed(0)}ms`);
    });

  await page2.close();
  await db.stop();

  // =================================================================
  // 3. NETWORK MONITORING WITH PERSISTENCE
  // =================================================================
  console.log('\n\n3️⃣  Network Monitoring with S3DB Persistence\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin3 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    performance: {
      blockResources: { enabled: false }
    },
    networkMonitor: {
      enabled: true,
      persist: true,  // ✅ Save to S3DB
      filters: {
        saveErrors: true,
        saveLargeAssets: true
      }
    }
  });

  await db.installPlugin(puppeteerPlugin3);
  await db.start();

  console.log('\n📊 Monitoring https://example.com with persistence...\n');

  const page3 = await puppeteerPlugin3.navigate('https://example.com');
  const session3 = await puppeteerPlugin3.networkMonitor.startMonitoring(page3);

  await page3.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const result3 = await puppeteerPlugin3.networkMonitor.stopMonitoring(session3, {
    includePerformance: true  // Include PerformanceManager metrics
  });

  console.log('✅ Session persisted to S3DB!');
  console.log(`   Session ID: ${result3.sessionId}`);
  console.log(`   Requests Saved: ${result3.requests.length}`);
  console.log(`   Errors Saved: ${result3.failures.length}\n`);

  // Query back from S3DB
  const savedSession = await puppeteerPlugin3.networkMonitor.getSessionStats(result3.sessionId);
  console.log('📊 Retrieved from S3DB:');
  console.log(`   URL: ${savedSession.url}`);
  console.log(`   Total Requests: ${savedSession.totalRequests}`);
  console.log(`   Total Size: ${(savedSession.totalBytes / 1024).toFixed(2)}KB`);
  console.log(`   Duration: ${savedSession.duration}ms`);

  if (savedSession.performance) {
    console.log(`   Performance Score: ${savedSession.performance.score}/100`);
    console.log(`   LCP: ${savedSession.performance.lcp}ms`);
  }

  // Query requests for this session
  const savedRequests = await puppeteerPlugin3.networkMonitor.getSessionRequests(result3.sessionId);
  console.log(`\n📋 Requests from S3DB: ${savedRequests.length}`);

  // Query by resource type using partition
  const scripts = await puppeteerPlugin3.networkMonitor.requestsResource.listPartition('byType', { type: 'script' });
  console.log(`📜 Total Scripts in DB: ${scripts.length}`);

  await page3.close();
  await db.stop();

  // =================================================================
  // 4. ERROR TRACKING
  // =================================================================
  console.log('\n\n4️⃣  Error Tracking\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin4 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    networkMonitor: {
      enabled: true,
      persist: true,
      filters: {
        saveErrors: true,
        types: null  // Track all types
      }
    }
  });

  await db.installPlugin(puppeteerPlugin4);
  await db.start();

  // Navigate to page with potential errors
  const page4 = await puppeteerPlugin4.navigate('https://example.com');
  const session4 = await puppeteerPlugin4.networkMonitor.startMonitoring(page4);

  // Inject some 404 errors
  await page4.evaluate(() => {
    fetch('/nonexistent-resource.js').catch(() => {});
    fetch('/missing-image.png').catch(() => {});
  }).catch(() => {});

  await new Promise(resolve => setTimeout(resolve, 2000));

  const result4 = await puppeteerPlugin4.networkMonitor.stopMonitoring(session4);

  if (result4.failures.length > 0) {
    console.log(`\n❌ Errors Detected: ${result4.failures.length}\n`);

    result4.failures.forEach((error, i) => {
      console.log(`   ${i + 1}. ${error.url}`);
      console.log(`      Type: ${error.type}`);
      console.log(`      Error: ${error.errorText}`);
      console.log(`      Duration: ${error.duration?.toFixed(0)}ms`);
    });

    // Query errors from S3DB
    const savedErrors = await puppeteerPlugin4.networkMonitor.getSessionErrors(result4.sessionId);
    console.log(`\n📊 Errors saved to S3DB: ${savedErrors.length}`);
  } else {
    console.log('✅ No errors detected!');
  }

  await page4.close();
  await db.stop();

  // =================================================================
  // 5. SEO USE CASE: ANALYZE PAGE WEIGHT
  // =================================================================
  console.log('\n\n5️⃣  SEO Use Case: Page Weight Analysis\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin5 = new PuppeteerPlugin({
    pool: { enabled: false },
    humanBehavior: { enabled: false },
    performance: {
      blockResources: { enabled: false }
    },
    networkMonitor: {
      enabled: true,
      persist: false
    }
  });

  await db.installPlugin(puppeteerPlugin5);
  await db.start();

  const page5 = await puppeteerPlugin5.navigate('https://www.iana.org/');
  const session5 = await puppeteerPlugin5.networkMonitor.startMonitoring(page5);

  await page5.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const result5 = await puppeteerPlugin5.networkMonitor.stopMonitoring(session5);

  console.log('\n📊 Page Weight Report:\n');

  // Calculate by type
  const byType = result5.stats.byType;
  const totalSize = result5.stats.totalBytes;

  console.log('By Resource Type:');
  Object.entries(byType)
    .sort((a, b) => b[1].size - a[1].size)
    .forEach(([type, stats]) => {
      const percentage = (stats.size / totalSize * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(percentage / 2));
      console.log(`   ${type.padEnd(12)} ${(stats.size / 1024).toFixed(0).padStart(6)}KB  ${percentage.padStart(5)}%  ${bar}`);
    });

  console.log(`\n   TOTAL        ${(totalSize / 1024).toFixed(0).padStart(6)}KB\n`);

  // SEO recommendations
  console.log('💡 SEO Recommendations:\n');

  const imageSize = byType.image?.size || 0;
  const scriptSize = byType.script?.size || 0;
  const stylesheetSize = byType.stylesheet?.size || 0;

  if (imageSize > 1024 * 1024) {
    console.log(`   ⚠️  Images are ${(imageSize / 1024 / 1024).toFixed(1)}MB - Consider:`);
    console.log('      • Using WebP/AVIF format');
    console.log('      • Implementing lazy loading');
    console.log('      • Compressing images further\n');
  }

  if (scriptSize > 512 * 1024) {
    console.log(`   ⚠️  JavaScript is ${(scriptSize / 1024).toFixed(0)}KB - Consider:`);
    console.log('      • Code splitting');
    console.log('      • Removing unused libraries');
    console.log('      • Minification and tree-shaking\n');
  }

  if (totalSize > 3 * 1024 * 1024) {
    console.log(`   ❌ Total page weight is ${(totalSize / 1024 / 1024).toFixed(1)}MB (target: <3MB)`);
    console.log('      • Optimize images, scripts, and CSS');
    console.log('      • Enable compression (gzip/brotli)');
    console.log('      • Use CDN for static assets\n');
  } else {
    console.log(`   ✅ Total page weight is acceptable: ${(totalSize / 1024).toFixed(0)}KB\n`);
  }

  // Compression analysis
  const compressed = result5.requests.filter(r => r.compression !== 'none').length;
  const compressionRate = (compressed / result5.requests.length * 100).toFixed(0);

  console.log(`📦 Compression Analysis:`);
  console.log(`   Compressed Resources: ${compressed}/${result5.requests.length} (${compressionRate}%)\n`);

  if (compressionRate < 80) {
    console.log('   ⚠️  Low compression rate - Enable gzip/brotli on server\n');
  }

  // CDN analysis
  const cdnRequests = result5.requests.filter(r => r.cdnDetected).length;
  const cdnRate = (cdnRequests / result5.requests.length * 100).toFixed(0);

  console.log(`🌐 CDN Usage:`);
  console.log(`   CDN Requests: ${cdnRequests}/${result5.requests.length} (${cdnRate}%)\n`);

  if (cdnRate < 50) {
    console.log('   💡 Consider using a CDN for static assets\n');
  }

  await page5.close();
  await db.stop();

  // =================================================================
  // 6. ADVANCED: QUERY PATTERNS
  // =================================================================
  console.log('\n\n6️⃣  Advanced: Query Patterns with Partitions\n');
  console.log('━'.repeat(60));

  const puppeteerPlugin6 = new PuppeteerPlugin({
    networkMonitor: {
      enabled: true,
      persist: true
    }
  });

  await db.installPlugin(puppeteerPlugin6);
  await db.start();

  console.log('\n📊 Querying network data using partitions...\n');

  // Query all images (using byType partition)
  const allImages = await puppeteerPlugin6.networkMonitor.requestsResource.listPartition('byType', { type: 'image' });
  console.log(`🖼️  Total images in database: ${allImages.length}`);

  // Query failed requests (using byStatus partition)
  const errors = await puppeteerPlugin6.networkMonitor.requestsResource.listPartition('byStatus', { statusCode: 404 });
  console.log(`❌ 404 errors in database: ${errors.length}`);

  // Query all sessions for a domain
  const domainSessions = await puppeteerPlugin6.networkMonitor.sessionsResource.listPartition('byDomain', { domain: 'example.com' });
  console.log(`🌐 Sessions for example.com: ${domainSessions.length}`);

  // Query large assets (using bySize partition - requires range query)
  const allRequests = await puppeteerPlugin6.networkMonitor.requestsResource.list({ limit: 1000 });
  const largeAssets = allRequests.filter(r => r.size > 1024 * 1024); // > 1MB
  console.log(`📦 Assets > 1MB: ${largeAssets.length}\n`);

  if (largeAssets.length > 0) {
    console.log('   Largest assets:');
    largeAssets
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .forEach((asset, i) => {
        console.log(`   ${i + 1}. ${(asset.size / 1024 / 1024).toFixed(2)}MB - ${asset.url.split('/').pop()}`);
      });
  }

  await db.stop();

  // =================================================================
  // CLEANUP
  // =================================================================
  await db.disconnect();

  console.log('\n✅ Network monitoring demo completed!\n');
  console.log('📝 Key Takeaways:\n');
  console.log('   • CDP captures ALL network activity (requests, responses, errors)');
  console.log('   • Filters allow selective persistence (images only, errors only, etc.)');
  console.log('   • S3DB partitions enable fast queries (byType, byStatus, byDomain)');
  console.log('   • Perfect for SEO analysis (page weight, compression, CDN usage)');
  console.log('   • Integration with PerformanceManager for complete analysis\n');
}

main().catch(console.error);
