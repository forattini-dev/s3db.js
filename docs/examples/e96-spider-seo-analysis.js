/**
 * Example 96: SpiderPlugin - Complete SEO Analysis & Tech Fingerprinting
 *
 * Demonstrates:
 * - Meta tags extraction (title, description, keywords)
 * - OpenGraph and Twitter Card extraction
 * - Asset inventory (CSS, JS, images, videos, audios)
 * - Technology fingerprinting (frameworks, analytics, CDN)
 * - Performance metrics collection
 * - Batch crawling with result aggregation
 *
 * Run: node docs/examples/e96-spider-seo-analysis.js
 */

import { Database } from '../src/database.class.js';
import { SpiderPlugin } from '../src/plugins/spider.plugin.js';

async function main() {
  // Initialize database
  const db = new Database({
    connectionString: process.env.S3DB_CONNECTION || 'memory://test/spider-demo'
  });

  console.log('📊 SpiderPlugin - SEO Analysis & Tech Fingerprinting Demo\n');

  try {
    // Connect to database
    await db.connect();
    console.log('✅ Connected to database\n');

    // ======================
    // 1. Basic SEO Analysis
    // ======================
    console.log('1️⃣  Basic SEO Analysis Setup\n');

    const spider = new SpiderPlugin({
      namespace: 'seo-analyzer',
      queue: {
        autoStart: true,
        concurrency: 3
      },
      puppeteer: {
        pool: {
          enabled: true,
          maxBrowsers: 2,
          maxTabsPerBrowser: 5
        },
        stealth: { enabled: true }
      },
      // SEO Configuration
      seo: {
        enabled: true,
        extractMetaTags: true,
        extractOpenGraph: true,
        extractTwitterCard: true,
        extractAssets: true,
        assetMetadata: true
      },
      // Tech Detection Configuration
      techDetection: {
        enabled: true,
        detectFrameworks: true,
        detectAnalytics: true,
        detectMarketing: true,
        detectCDN: true,
        detectWebServer: true,
        detectCMS: true
      },
      // Performance Configuration
      performance: {
        enabled: true,
        collectCoreWebVitals: true,
        collectNavigationTiming: true,
        collectMemory: true
      }
    });

    // Initialize plugin
    await db.usePlugin(spider);
    console.log('✅ SpiderPlugin initialized\n');

    // ======================
    // 2. Enqueue URLs to Crawl
    // ======================
    console.log('2️⃣  Enqueueing URLs for Crawling\n');

    const urlsToCrawl = [
      {
        url: 'https://example.com',
        metadata: { source: 'manual', category: 'homepage' }
      },
      {
        url: 'https://example.com/about',
        metadata: { source: 'manual', category: 'about' },
        priority: 5
      },
      {
        url: 'https://www.wikipedia.org',
        metadata: { source: 'manual', category: 'reference' }
      },
      {
        url: 'https://www.github.com',
        metadata: { source: 'manual', category: 'development' }
      }
    ];

    console.log(`Enqueueing ${urlsToCrawl.length} URLs:\n`);

    for (const target of urlsToCrawl) {
      await spider.enqueueTarget(target);
      console.log(`  ✓ ${target.url}`);
    }

    console.log();

    // ======================
    // 3. Monitor Progress
    // ======================
    console.log('3️⃣  Monitoring Crawl Progress\n');

    const progressInterval = setInterval(async () => {
      const status = await spider.getQueueStatus();
      console.log(
        `  ⏳ Pending: ${status.pending} | Completed: ${status.completed} | Active: ${status.activeWorkers}`
      );

      if (status.pending === 0 && status.activeWorkers === 0) {
        clearInterval(progressInterval);
        console.log('✅ All URLs processed!\n');
      }
    }, 2000);

    // Wait for completion
    await new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const status = await spider.getQueueStatus();
        if (status.pending === 0 && status.activeWorkers === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });

    // ======================
    // 4. Retrieve & Analyze Results
    // ======================
    console.log('4️⃣  Analyzing Crawl Results\n');

    const results = await spider.getResults();
    const seoData = await spider.getSEOAnalysis();
    const fingerprints = await spider.getTechFingerprints();

    console.log(`Total URLs Crawled: ${results.length}\n`);

    // ======================
    // 5. Display Detailed Analysis
    // ======================
    console.log('5️⃣  Detailed Analysis for Each URL\n');
    console.log('═'.repeat(80));

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const seo = seoData.find((s) => s.url === result.url);
      const tech = fingerprints.find((f) => f.url === result.url);

      console.log(`\n📄 ${result.url}`);
      console.log('─'.repeat(80));

      // Status & Performance
      console.log(`\n⚡ Status & Performance:`);
      console.log(`  Status Code: ${result.statusCode}`);
      console.log(`  Processing Time: ${result.processingTime}ms`);
      console.log(`  Title: ${result.title || 'N/A'}`);

      // SEO Data
      if (seo) {
        console.log(`\n📊 SEO Metadata:`);

        // Meta Tags
        if (seo.metaTags) {
          console.log(`  Meta Tags:`);
          for (const [key, value] of Object.entries(seo.metaTags)) {
            const truncated = value.length > 50 ? value.substring(0, 50) + '...' : value;
            console.log(`    - ${key}: "${truncated}"`);
          }
        }

        // OpenGraph
        if (seo.openGraph) {
          console.log(`  Open Graph:`);
          for (const [key, value] of Object.entries(seo.openGraph)) {
            const truncated = value.length > 50 ? value.substring(0, 50) + '...' : value;
            console.log(`    - og:${key}: "${truncated}"`);
          }
        }

        // Assets Summary
        if (seo.assets && seo.assets.summary) {
          console.log(`  Asset Inventory:`);
          const summary = seo.assets.summary;
          console.log(`    - Stylesheets: ${summary.totalStylesheets}`);
          console.log(`    - Scripts: ${summary.totalScripts}`);
          console.log(`    - Images: ${summary.totalImages}`);
          console.log(`    - Videos: ${summary.totalVideos}`);
          console.log(`    - Audio Files: ${summary.totalAudios}`);

          // Image formats
          if (summary.imageFormats && Object.keys(summary.imageFormats).length > 0) {
            console.log(`    - Image Formats: ${Object.entries(summary.imageFormats)
              .map(([fmt, count]) => `${fmt}(${count})`)
              .join(', ')}`);
          }

          // Script types
          if (summary.scriptTypes && Object.keys(summary.scriptTypes).length > 0) {
            console.log(`    - Script Types: ${Object.entries(summary.scriptTypes)
              .map(([type, count]) => `${type}(${count})`)
              .join(', ')}`);
          }
        }
      }

      // Technology Detection
      if (tech) {
        console.log(`\n🔍 Technology Stack:`);

        if (tech.frameworks && tech.frameworks.length > 0) {
          console.log(`  Frameworks: ${tech.frameworks.join(', ')}`);
        }

        if (tech.analytics && tech.analytics.length > 0) {
          console.log(`  Analytics: ${tech.analytics.join(', ')}`);
        }

        if (tech.marketing && tech.marketing.length > 0) {
          console.log(`  Marketing: ${tech.marketing.join(', ')}`);
        }

        if (tech.cdn && tech.cdn.length > 0) {
          console.log(`  CDN: ${tech.cdn.join(', ')}`);
        }

        if (tech.webServers && tech.webServers.length > 0) {
          console.log(`  Web Servers: ${tech.webServers.join(', ')}`);
        }

        if (tech.cms && tech.cms.length > 0) {
          console.log(`  CMS: ${tech.cms.join(', ')}`);
        }

        if (tech.libraries && tech.libraries.length > 0) {
          console.log(`  Libraries: ${tech.libraries.join(', ')}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(80) + '\n');

    // ======================
    // 6. Aggregated Statistics
    // ======================
    console.log('6️⃣  Aggregated Statistics\n');

    const stats = {
      totalURLs: results.length,
      successfulCrawls: results.filter((r) => r.statusCode === 200).length,
      failedCrawls: results.filter((r) => r.statusCode !== 200).length,
      averageProcessingTime: (results.reduce((sum, r) => sum + r.processingTime, 0) / results.length).toFixed(0),
      totalAssets: seoData.reduce((sum, s) => {
        if (s.assets && s.assets.summary) {
          return (
            sum +
            s.assets.summary.totalStylesheets +
            s.assets.summary.totalScripts +
            s.assets.summary.totalImages
          );
        }
        return sum;
      }, 0),
      frameworksDetected: new Set(fingerprints.flatMap((f) => f.frameworks || [])).size,
      analyticsServicesDetected: new Set(fingerprints.flatMap((f) => f.analytics || [])).size,
      uniqueTechnologies: new Set(
        fingerprints.flatMap((f) => [
          ...(f.frameworks || []),
          ...(f.analytics || []),
          ...(f.marketing || []),
          ...(f.cdn || []),
          ...(f.cms || [])
        ])
      ).size
    };

    console.log(`Crawl Statistics:`);
    console.log(`  Total URLs Crawled: ${stats.totalURLs}`);
    console.log(`  Successful (200): ${stats.successfulCrawls}`);
    console.log(`  Failed: ${stats.failedCrawls}`);
    console.log(`  Average Processing Time: ${stats.averageProcessingTime}ms`);
    console.log(`  Total Assets Catalogued: ${stats.totalAssets}`);
    console.log(`  Unique Frameworks: ${stats.frameworksDetected}`);
    console.log(`  Unique Analytics: ${stats.analyticsServicesDetected}`);
    console.log(`  Total Unique Technologies: ${stats.uniqueTechnologies}\n`);

    // ======================
    // 7. Framework Distribution
    // ======================
    console.log('7️⃣  Technology Distribution\n');

    const frameworkDistribution = {};
    const analyticsDistribution = {};

    for (const fp of fingerprints) {
      for (const fw of fp.frameworks || []) {
        frameworkDistribution[fw] = (frameworkDistribution[fw] || 0) + 1;
      }
      for (const an of fp.analytics || []) {
        analyticsDistribution[an] = (analyticsDistribution[an] || 0) + 1;
      }
    }

    console.log('Framework Usage:');
    for (const [fw, count] of Object.entries(frameworkDistribution).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${fw}: ${count} site${count > 1 ? 's' : ''}`);
    }

    console.log('\nAnalytics Services:');
    for (const [svc, count] of Object.entries(analyticsDistribution).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${svc}: ${count} site${count > 1 ? 's' : ''}`);
    }

    console.log('\n');

    // ======================
    // 8. Cleanup
    // ======================
    await spider.destroy();
    await db.disconnect();

    console.log('✅ Demo completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
