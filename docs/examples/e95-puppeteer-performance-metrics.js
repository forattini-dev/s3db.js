/**
 * Example: Chromium Performance Metrics Collection
 *
 * Demonstrates comprehensive performance analysis including:
 * - Core Web Vitals (LCP, FID, CLS, TTFB, FCP, INP)
 * - Navigation Timing API
 * - Resource Timing API
 * - Memory Usage
 * - Lighthouse-style scoring (0-100)
 * - Performance recommendations
 * - Performance comparison
 *
 * Use case: SEO monitoring, site speed optimization, quality assurance
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

  // Install PuppeteerPlugin with performance tracking
  const puppeteerPlugin = new PuppeteerPlugin({
    pool: {
      enabled: false // Disable pooling for clean tests
    },
    performance: {
      blockResources: {
        enabled: false // Don't block resources - we want to measure everything
      }
    },
    humanBehavior: {
      enabled: false // Disable for faster testing
    }
  });

  await db.installPlugin(puppeteerPlugin);
  await db.start();

  console.log('\n📊 Performance Metrics Collection Demo\n');

  // =================================================================
  // 1. BASIC PERFORMANCE ANALYSIS
  // =================================================================
  console.log('1️⃣  Basic Performance Analysis');
  console.log('━'.repeat(60));

  const page1 = await puppeteerPlugin.navigate('https://example.com');

  // Collect performance metrics
  const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page1, {
    waitForLoad: true,
    collectResources: true,
    collectMemory: true
  });

  console.log(`\n📈 Overall Performance Score: ${metrics.score}/100`);
  console.log(`🌐 URL: ${metrics.url}`);
  console.log(`⏱️  Collection Time: ${metrics.collectionTime}ms`);

  // Core Web Vitals
  console.log('\n🎯 Core Web Vitals:');
  console.log(`   LCP (Largest Contentful Paint): ${metrics.coreWebVitals.lcp ? Math.round(metrics.coreWebVitals.lcp) + 'ms' : 'N/A'}`);
  console.log(`   FID (First Input Delay):        ${metrics.coreWebVitals.fid ? Math.round(metrics.coreWebVitals.fid) + 'ms' : 'N/A'}`);
  console.log(`   CLS (Cumulative Layout Shift):  ${metrics.coreWebVitals.cls ? metrics.coreWebVitals.cls.toFixed(3) : 'N/A'}`);
  console.log(`   TTFB (Time to First Byte):      ${metrics.coreWebVitals.ttfb ? Math.round(metrics.coreWebVitals.ttfb) + 'ms' : 'N/A'}`);
  console.log(`   FCP (First Contentful Paint):   ${metrics.coreWebVitals.fcp ? Math.round(metrics.coreWebVitals.fcp) + 'ms' : 'N/A'}`);
  console.log(`   INP (Interaction Next Paint):   ${metrics.coreWebVitals.inp ? Math.round(metrics.coreWebVitals.inp) + 'ms' : 'N/A'}`);

  // Individual scores
  console.log('\n📊 Individual Scores (0-100):');
  Object.entries(metrics.scores).forEach(([metric, score]) => {
    if (score !== null) {
      const emoji = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';
      console.log(`   ${emoji} ${metric.toUpperCase()}: ${score}`);
    }
  });

  // Navigation Timing
  if (metrics.navigationTiming) {
    console.log('\n⏱️  Navigation Timing:');
    console.log(`   DNS Lookup:      ${Math.round(metrics.navigationTiming.dnsDuration)}ms`);
    console.log(`   TCP Connection:  ${Math.round(metrics.navigationTiming.tcpDuration)}ms`);
    console.log(`   TLS/SSL:         ${Math.round(metrics.navigationTiming.tlsDuration)}ms`);
    console.log(`   Request Time:    ${Math.round(metrics.navigationTiming.requestDuration)}ms`);
    console.log(`   Response Time:   ${Math.round(metrics.navigationTiming.responseDuration)}ms`);
    console.log(`   DOM Processing:  ${Math.round(metrics.navigationTiming.domComplete - metrics.navigationTiming.responseEnd)}ms`);
    console.log(`   Total Load Time: ${Math.round(metrics.navigationTiming.totalTime)}ms`);
  }

  // Resource Summary
  if (metrics.resources) {
    console.log('\n📦 Resource Summary:');
    console.log(`   Total Requests:  ${metrics.resources.summary.total}`);
    console.log(`   Total Size:      ${(metrics.resources.summary.totalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Cached:          ${metrics.resources.summary.cached} (${((metrics.resources.summary.cached / metrics.resources.summary.total) * 100).toFixed(0)}%)`);

    console.log('\n   By Type:');
    Object.entries(metrics.resources.summary.byType).forEach(([type, data]) => {
      console.log(`     ${type.padEnd(15)} ${data.count.toString().padStart(3)} requests  ${(data.size / 1024).toFixed(0).padStart(6)}KB`);
    });

    console.log('\n   Slowest Resources:');
    metrics.resources.summary.slowest.slice(0, 5).forEach((resource, i) => {
      const name = resource.name.length > 50 ? '...' + resource.name.slice(-47) : resource.name;
      console.log(`     ${(i + 1)}. ${name}`);
      console.log(`        ${Math.round(resource.duration)}ms | ${(resource.size / 1024).toFixed(1)}KB | ${resource.type}`);
    });
  }

  // Memory Usage
  if (metrics.memory) {
    console.log('\n🧠 Memory Usage:');
    console.log(`   Used Heap:  ${(metrics.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Total Heap: ${(metrics.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Heap Limit: ${(metrics.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Usage:      ${metrics.memory.usedPercent.toFixed(1)}%`);
  }

  // Recommendations
  if (metrics.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    metrics.recommendations.forEach((rec, i) => {
      const severityEmoji = rec.severity === 'high' ? '🔴' : rec.severity === 'medium' ? '🟡' : '🟢';
      console.log(`\n   ${severityEmoji} ${rec.message}`);
      console.log(`   Suggestions:`);
      rec.suggestions.forEach(s => {
        console.log(`     • ${s}`);
      });
    });
  } else {
    console.log('\n✅ No major performance issues detected!');
  }

  await page1.close();

  // =================================================================
  // 2. CUSTOM METRICS
  // =================================================================
  console.log('\n\n2️⃣  Custom Metrics Collection');
  console.log('━'.repeat(60));

  const page2 = await puppeteerPlugin.navigate('https://example.com');

  // Define custom metrics to collect
  const customMetricsCollector = async (page) => {
    return await page.evaluate(() => {
      return {
        // Custom timing marks
        customMarks: performance.getEntriesByType('mark').map(m => ({
          name: m.name,
          startTime: m.startTime
        })),

        // Count specific elements
        elementCounts: {
          images: document.querySelectorAll('img').length,
          scripts: document.querySelectorAll('script').length,
          stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
          iframes: document.querySelectorAll('iframe').length
        },

        // Page dimensions
        pageDimensions: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight
        },

        // Meta tags
        metaTags: {
          description: document.querySelector('meta[name="description"]')?.content,
          viewport: document.querySelector('meta[name="viewport"]')?.content
        }
      };
    });
  };

  const customMetrics = await puppeteerPlugin.performanceManager.collectMetrics(page2, {
    customMetrics: customMetricsCollector
  });

  console.log('\n📝 Custom Metrics:');
  console.log(JSON.stringify(customMetrics.custom, null, 2));

  await page2.close();

  // =================================================================
  // 3. PERFORMANCE COMPARISON
  // =================================================================
  console.log('\n\n3️⃣  Performance Comparison');
  console.log('━'.repeat(60));

  // Collect baseline metrics
  const page3a = await puppeteerPlugin.navigate('https://example.com');
  const baseline = await puppeteerPlugin.performanceManager.collectMetrics(page3a);
  await page3a.close();

  console.log(`\n📊 Baseline collected (Score: ${baseline.score}/100)`);

  // Wait a bit and collect again
  await new Promise(resolve => setTimeout(resolve, 2000));

  const page3b = await puppeteerPlugin.navigate('https://example.com');
  const current = await puppeteerPlugin.performanceManager.collectMetrics(page3b);
  await page3b.close();

  console.log(`📊 Current collected (Score: ${current.score}/100)`);

  // Compare reports
  const comparison = puppeteerPlugin.performanceManager.compareReports(baseline, current);

  console.log('\n🔄 Comparison Results:');
  console.log(`   Score Change: ${comparison.scoreDelta > 0 ? '+' : ''}${comparison.scoreDelta}`);

  if (comparison.improvements.length > 0) {
    console.log('\n   ✅ Improvements:');
    comparison.improvements.forEach(imp => {
      console.log(`      ${imp.metric.toUpperCase()}: ${Math.round(imp.baseline)}ms → ${Math.round(imp.current)}ms (${imp.percentChange}%)`);
    });
  }

  if (comparison.regressions.length > 0) {
    console.log('\n   ⚠️  Regressions:');
    comparison.regressions.forEach(reg => {
      console.log(`      ${reg.metric.toUpperCase()}: ${Math.round(reg.baseline)}ms → ${Math.round(reg.current)}ms (${reg.percentChange}%)`);
    });
  }

  if (comparison.improvements.length === 0 && comparison.regressions.length === 0) {
    console.log('   ➡️  No significant changes detected');
  }

  // =================================================================
  // 4. BATCH PERFORMANCE ANALYSIS
  // =================================================================
  console.log('\n\n4️⃣  Batch Performance Analysis');
  console.log('━'.repeat(60));

  const urls = [
    'https://example.com',
    'https://www.iana.org/domains/reserved',
  ];

  console.log(`\n📊 Analyzing ${urls.length} URLs...\n`);

  const results = [];

  for (const url of urls) {
    try {
      const page = await puppeteerPlugin.navigate(url);
      const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page, {
        collectResources: false, // Skip resources for faster analysis
        collectMemory: false
      });
      await page.close();

      results.push({
        url,
        score: metrics.score,
        lcp: metrics.coreWebVitals.lcp,
        cls: metrics.coreWebVitals.cls,
        ttfb: metrics.coreWebVitals.ttfb
      });

      console.log(`   ✅ ${url}`);
      console.log(`      Score: ${metrics.score}/100 | LCP: ${metrics.coreWebVitals.lcp ? Math.round(metrics.coreWebVitals.lcp) + 'ms' : 'N/A'}`);
    } catch (err) {
      console.log(`   ❌ ${url} - ${err.message}`);
    }
  }

  // Summary
  console.log('\n📈 Batch Summary:');
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const avgLCP = results.reduce((sum, r) => sum + (r.lcp || 0), 0) / results.filter(r => r.lcp).length;

  console.log(`   Average Score: ${Math.round(avgScore)}/100`);
  console.log(`   Average LCP:   ${Math.round(avgLCP)}ms`);

  const best = results.reduce((best, r) => r.score > best.score ? r : best);
  const worst = results.reduce((worst, r) => r.score < worst.score ? r : worst);

  console.log(`\n   🏆 Best:  ${best.url} (${best.score}/100)`);
  console.log(`   ⚠️  Worst: ${worst.url} (${worst.score}/100)`);

  // =================================================================
  // 5. MONITORING USE CASE
  // =================================================================
  console.log('\n\n5️⃣  Performance Monitoring Use Case');
  console.log('━'.repeat(60));

  console.log('\n💼 Use Case: Continuous Performance Monitoring');
  console.log(`
   This system can be used for:

   1. 🔍 SEO Monitoring
      - Track Core Web Vitals over time
      - Alert on performance degradation
      - Compare with competitors

   2. 🚀 Site Speed Optimization
      - Identify bottlenecks
      - Measure optimization impact
      - A/B test performance

   3. ✅ Quality Assurance
      - Pre-deployment checks
      - Regression detection
      - SLA monitoring

   4. 📊 Analytics Integration
      - Store metrics in S3DB
      - Create dashboards
      - Generate reports

   5. 🤖 Automated Testing
      - CI/CD integration
      - Performance budgets
      - Fail builds on regression
  `);

  console.log('\n📝 Example: Store metrics in S3DB for historical tracking');

  // Create resource for performance metrics
  const perfResource = await db.createResource({
    name: 'performance_metrics',
    attributes: {
      url: 'string|required',
      timestamp: 'number|required',
      score: 'number|required',
      lcp: 'number',
      fid: 'number',
      cls: 'number',
      ttfb: 'number',
      fcp: 'number',
      totalSize: 'number',
      totalRequests: 'number',
      recommendations: 'array'
    },
    behavior: 'body-overflow',
    timestamps: true
  });

  // Store metrics
  const pageForStorage = await puppeteerPlugin.navigate('https://example.com');
  const metricsForStorage = await puppeteerPlugin.performanceManager.collectMetrics(pageForStorage);
  await pageForStorage.close();

  await perfResource.insert({
    url: metricsForStorage.url,
    timestamp: metricsForStorage.timestamp,
    score: metricsForStorage.score,
    lcp: metricsForStorage.coreWebVitals.lcp,
    fid: metricsForStorage.coreWebVitals.fid,
    cls: metricsForStorage.coreWebVitals.cls,
    ttfb: metricsForStorage.coreWebVitals.ttfb,
    fcp: metricsForStorage.coreWebVitals.fcp,
    totalSize: metricsForStorage.resources?.summary.totalSize || 0,
    totalRequests: metricsForStorage.resources?.summary.total || 0,
    recommendations: metricsForStorage.recommendations.map(r => r.message)
  });

  console.log('   ✅ Metrics stored in S3DB');

  // Query historical data
  const historicalMetrics = await perfResource.list({ limit: 10 });
  console.log(`   📊 Historical records: ${historicalMetrics.length}`);

  // =================================================================
  // CLEANUP
  // =================================================================
  await db.stop();
  await db.disconnect();

  console.log('\n✅ Demo completed!\n');
}

main().catch(console.error);
