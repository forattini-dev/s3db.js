# Puppeteer Performance Metrics

Complete Chromium performance analysis system integrated with PuppeteerPlugin.

## Features

- ✅ **Core Web Vitals** - Official Google metrics (LCP, FID, CLS, TTFB, FCP, INP)
- ✅ **Navigation Timing API** - DNS, TCP, TLS, Request/Response breakdown
- ✅ **Resource Timing API** - Waterfall analysis, size tracking, caching
- ✅ **Paint Timing API** - First Paint, First Contentful Paint
- ✅ **Memory Usage** - Heap size, usage percentage
- ✅ **Lighthouse-style Scoring** - 0-100 score with weighted metrics
- ✅ **Automatic Recommendations** - Actionable performance improvements
- ✅ **Performance Comparison** - Track improvements/regressions over time
- ✅ **Custom Metrics** - Extend with your own measurements

## Quick Start

```javascript
import { Database } from 's3db.js';
import { PuppeteerPlugin } from 's3db.js';

const db = new Database({ connectionString: '...' });
await db.connect();

const puppeteerPlugin = new PuppeteerPlugin();
await db.installPlugin(puppeteerPlugin);
await db.start();

// Navigate and collect metrics
const page = await puppeteerPlugin.navigate('https://example.com');
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

console.log(`Score: ${metrics.score}/100`);
console.log(`LCP: ${metrics.coreWebVitals.lcp}ms`);
console.log(`CLS: ${metrics.coreWebVitals.cls}`);

await page.close();
```

## Core Web Vitals

### What are Core Web Vitals?

Core Web Vitals are Google's official metrics for measuring user experience:

| Metric | Full Name | What it Measures | Good | Needs Improvement | Poor |
|--------|-----------|------------------|------|-------------------|------|
| **LCP** | Largest Contentful Paint | Loading performance | ≤2.5s | ≤4.0s | >4.0s |
| **FID** | First Input Delay | Interactivity | ≤100ms | ≤300ms | >300ms |
| **CLS** | Cumulative Layout Shift | Visual stability | ≤0.1 | ≤0.25 | >0.25 |
| **TTFB** | Time to First Byte | Server response | ≤800ms | ≤1800ms | >1800ms |
| **FCP** | First Contentful Paint | First render | ≤1800ms | ≤3000ms | >3000ms |
| **INP** | Interaction to Next Paint | Responsiveness | ≤200ms | ≤500ms | >500ms |

### Collection

```javascript
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

console.log('Core Web Vitals:', metrics.coreWebVitals);
// {
//   lcp: 2453,    // ms
//   fid: 12,      // ms
//   cls: 0.045,   // score
//   ttfb: 234,    // ms
//   fcp: 1230,    // ms
//   inp: 78       // ms
// }
```

## Performance Scores

### Overall Score (0-100)

Lighthouse-style weighted score:

```javascript
console.log(`Overall Score: ${metrics.score}/100`);

// Score breakdown:
// 90-100: 🟢 Excellent
// 50-89:  🟡 Needs Improvement
// 0-49:   🔴 Poor
```

### Individual Scores

Each metric gets its own 0-100 score:

```javascript
console.log('Individual Scores:', metrics.scores);
// {
//   lcp: 95,  // Excellent
//   fid: 100, // Perfect
//   cls: 85,  // Good
//   ttfb: 78, // Good
//   fcp: 92,  // Excellent
//   inp: 88,  // Good
//   tbt: 65,  // Needs improvement
//   tti: 72   // Needs improvement
// }
```

### Scoring Algorithm

Scores are calculated based on thresholds:

```javascript
// Example: LCP scoring
if (lcp <= 2500) {
  score = 100;  // Good
} else if (lcp <= 4000) {
  score = 50-100;  // Needs improvement (interpolated)
} else {
  score = 0-50;  // Poor (interpolated)
}
```

Weights (matching Lighthouse):
- LCP: 25%
- FID: 10%
- CLS: 15%
- TTFB: 10%
- FCP: 10%
- INP: 10%
- TBT: 10%
- TTI: 10%

## Navigation Timing

Detailed breakdown of page load phases:

```javascript
const { navigationTiming } = metrics;

console.log({
  // DNS Resolution
  dnsDuration: navigationTiming.dnsDuration,

  // TCP Connection
  tcpDuration: navigationTiming.tcpDuration,

  // TLS/SSL Handshake
  tlsDuration: navigationTiming.tlsDuration,

  // Request/Response
  requestDuration: navigationTiming.requestDuration,
  responseDuration: navigationTiming.responseDuration,

  // DOM Processing
  domInteractive: navigationTiming.domInteractive,
  domContentLoaded: navigationTiming.domContentLoaded,
  domComplete: navigationTiming.domComplete,

  // Load Events
  loadEventStart: navigationTiming.loadEventStart,
  loadEventEnd: navigationTiming.loadEventEnd,

  // Total Time
  totalTime: navigationTiming.totalTime
});
```

### Waterfall Visualization

```
DNS     ████░░░░░░░░░░░░░░░░ 45ms
TCP     ░░░░████░░░░░░░░░░░░ 32ms
TLS     ░░░░░░░░████░░░░░░░░ 28ms
Request ░░░░░░░░░░░░███░░░░░ 156ms
Response░░░░░░░░░░░░░░░████░ 89ms
DOM     ░░░░░░░░░░░░░░░░░░██ 234ms
Total: 584ms
```

## Resource Timing

Analyze all resources loaded by the page:

```javascript
const { resources } = metrics;

// Summary
console.log(resources.summary);
// {
//   total: 45,
//   totalSize: 2456789,  // bytes
//   cached: 12,
//   slowest: [...]
// }

// By type
console.log(resources.summary.byType);
// {
//   script: { count: 15, size: 1234567, duration: 2345 },
//   stylesheet: { count: 8, size: 345678, duration: 890 },
//   image: { count: 12, size: 678901, duration: 1234 },
//   ...
// }

// Slowest resources
resources.summary.slowest.forEach(resource => {
  console.log(`${resource.name} - ${resource.duration}ms`);
});
```

### Resource Details

Full resource timing data:

```javascript
resources.details.forEach(resource => {
  console.log({
    name: resource.name,
    type: resource.type,  // script, stylesheet, image, etc.
    duration: resource.duration,
    transferSize: resource.transferSize,
    cached: resource.cached,

    // Timing breakdown
    dns: resource.dns,
    tcp: resource.tcp,
    tls: resource.tls,
    request: resource.request,
    response: resource.response
  });
});
```

## Memory Usage

JavaScript heap memory consumption:

```javascript
const { memory } = metrics;

console.log({
  usedJSHeapSize: memory.usedJSHeapSize,      // bytes
  totalJSHeapSize: memory.totalJSHeapSize,    // bytes
  jsHeapSizeLimit: memory.jsHeapSizeLimit,    // bytes
  usedPercent: memory.usedPercent             // percentage
});

// Convert to MB
const usedMB = memory.usedJSHeapSize / 1024 / 1024;
console.log(`Memory usage: ${usedMB.toFixed(2)}MB`);
```

## Recommendations

Automatic performance recommendations:

```javascript
metrics.recommendations.forEach(rec => {
  console.log(`${rec.severity}: ${rec.message}`);
  rec.suggestions.forEach(suggestion => {
    console.log(`  • ${suggestion}`);
  });
});

// Example output:
// high: LCP is 4523ms (target: <2500ms)
//   • Optimize largest image/element loading
//   • Use lazy loading for below-the-fold content
//   • Reduce server response times
//   • Use CDN for static assets
//
// medium: Total page size is 5.23MB
//   • Compress images and use modern formats (WebP, AVIF)
//   • Minify CSS and JavaScript
//   • Remove unused code
//   • Use code splitting
```

## Custom Metrics

Extend with your own measurements:

```javascript
const customMetricsCollector = async (page) => {
  return await page.evaluate(() => {
    return {
      // Element counts
      elementCounts: {
        images: document.querySelectorAll('img').length,
        scripts: document.querySelectorAll('script').length,
        links: document.querySelectorAll('a').length
      },

      // Page dimensions
      pageDimensions: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      },

      // Custom timing marks
      customMarks: performance.getEntriesByType('mark'),

      // Meta information
      metaTags: {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content
      },

      // Your custom logic here...
      customLogic: (() => {
        // Calculate anything you want
        return { result: 'custom data' };
      })()
    };
  });
};

const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page, {
  customMetrics: customMetricsCollector
});

console.log(metrics.custom);
```

## Performance Comparison

Track performance changes over time:

```javascript
// Collect baseline
const page1 = await puppeteerPlugin.navigate('https://example.com');
const baseline = await puppeteerPlugin.performanceManager.collectMetrics(page1);
await page1.close();

// Make changes to your site...

// Collect current metrics
const page2 = await puppeteerPlugin.navigate('https://example.com');
const current = await puppeteerPlugin.performanceManager.collectMetrics(page2);
await page2.close();

// Compare
const comparison = puppeteerPlugin.performanceManager.compareReports(baseline, current);

console.log(`Score change: ${comparison.scoreDelta}`);

// Improvements
comparison.improvements.forEach(imp => {
  console.log(`✅ ${imp.metric}: ${imp.baseline}ms → ${imp.current}ms (${imp.percentChange}%)`);
});

// Regressions
comparison.regressions.forEach(reg => {
  console.log(`⚠️ ${reg.metric}: ${reg.baseline}ms → ${reg.current}ms (${reg.percentChange}%)`);
});
```

## Collection Options

Fine-tune data collection:

```javascript
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page, {
  // Wait for page load event
  waitForLoad: true,  // default: true

  // Collect resource timing data
  collectResources: true,  // default: true

  // Collect memory information
  collectMemory: true,  // default: true

  // Capture screenshots
  collectScreenshots: false,  // default: false

  // Custom metrics function
  customMetrics: async (page) => { /* ... */ }  // default: null
});
```

## Use Cases

### 1. SEO Monitoring

```javascript
// Track Core Web Vitals for SEO
const page = await puppeteerPlugin.navigate('https://mysite.com');
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

// Store in database
await db.getResource('seo_metrics').insert({
  url: page.url(),
  timestamp: Date.now(),
  lcp: metrics.coreWebVitals.lcp,
  cls: metrics.coreWebVitals.cls,
  fid: metrics.coreWebVitals.fid,
  score: metrics.score
});

// Alert if below threshold
if (metrics.score < 80) {
  sendAlert(`SEO score dropped to ${metrics.score}`);
}

await page.close();
```

### 2. Performance Budgets

```javascript
const budgets = {
  lcp: 2500,
  fid: 100,
  cls: 0.1,
  totalSize: 3 * 1024 * 1024  // 3MB
};

const page = await puppeteerPlugin.navigate('https://mysite.com');
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

const violations = [];

if (metrics.coreWebVitals.lcp > budgets.lcp) {
  violations.push(`LCP: ${metrics.coreWebVitals.lcp}ms > ${budgets.lcp}ms`);
}

if (metrics.resources.summary.totalSize > budgets.totalSize) {
  violations.push(`Size: ${metrics.resources.summary.totalSize} > ${budgets.totalSize}`);
}

if (violations.length > 0) {
  console.error('Budget violations:', violations);
  process.exit(1);  // Fail CI build
}

await page.close();
```

### 3. A/B Testing

```javascript
// Test two versions
const variants = ['control', 'variant-a'];
const results = {};

for (const variant of variants) {
  const page = await puppeteerPlugin.navigate(`https://mysite.com?variant=${variant}`);
  const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

  results[variant] = {
    score: metrics.score,
    lcp: metrics.coreWebVitals.lcp,
    fid: metrics.coreWebVitals.fid
  };

  await page.close();
}

// Compare
const improvement = results['variant-a'].score - results.control.score;
console.log(`Variant A improved score by ${improvement} points`);
```

### 4. Competitor Analysis

```javascript
const competitors = [
  'https://competitor1.com',
  'https://competitor2.com',
  'https://competitor3.com'
];

const results = [];

for (const url of competitors) {
  const page = await puppeteerPlugin.navigate(url);
  const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

  results.push({
    url,
    score: metrics.score,
    lcp: metrics.coreWebVitals.lcp,
    totalSize: metrics.resources.summary.totalSize
  });

  await page.close();
}

// Sort by score
results.sort((a, b) => b.score - a.score);

console.log('Competitor rankings:');
results.forEach((r, i) => {
  console.log(`${i + 1}. ${r.url} - Score: ${r.score}`);
});
```

### 5. CI/CD Integration

```javascript
// In your CI pipeline
const page = await puppeteerPlugin.navigate(process.env.STAGING_URL);
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

// Get baseline from production
const prodMetrics = await getProductionMetrics();

// Compare
const comparison = puppeteerPlugin.performanceManager.compareReports(prodMetrics, metrics);

// Fail if regression
if (comparison.scoreDelta < -10) {
  console.error(`Performance regression detected: ${comparison.scoreDelta} points`);
  process.exit(1);
}

// Warn on individual metric regressions
comparison.regressions.forEach(reg => {
  console.warn(`Regression in ${reg.metric}: ${reg.percentChange}%`);
});

await page.close();
```

## Integration with Spider Plugin

Perfect for crawling and performance auditing:

```javascript
import { SpiderPlugin } from 's3db.js';

const spiderPlugin = new SpiderPlugin({
  // Spider config...
});

await db.installPlugin(spiderPlugin);

// Crawl and collect performance metrics
await spiderPlugin.crawl('https://mysite.com', {
  onPage: async (page, url) => {
    const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page);

    // Store metrics for each page
    await db.getResource('page_performance').insert({
      url,
      score: metrics.score,
      lcp: metrics.coreWebVitals.lcp,
      cls: metrics.coreWebVitals.cls,
      totalSize: metrics.resources.summary.totalSize,
      recommendations: metrics.recommendations
    });
  }
});
```

## Best Practices

### 1. Always Wait for Load

```javascript
// ✅ Good - wait for load event
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page, {
  waitForLoad: true
});

// ❌ Bad - may miss metrics
const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page, {
  waitForLoad: false
});
```

### 2. Disable Resource Blocking for Full Analysis

```javascript
// When analyzing performance, don't block resources
const puppeteerPlugin = new PuppeteerPlugin({
  performance: {
    blockResources: {
      enabled: false  // Measure everything
    }
  }
});
```

### 3. Store Historical Data

```javascript
// Track performance over time
const perfResource = await db.createResource({
  name: 'performance_history',
  attributes: {
    url: 'string|required',
    timestamp: 'number|required',
    score: 'number',
    lcp: 'number',
    cls: 'number',
    // ... other metrics
  },
  partitions: {
    byUrl: { fields: { url: 'string' } },
    byDate: { fields: { date: 'string' } }
  }
});
```

### 4. Set Performance Budgets

```javascript
// Define and enforce budgets
const budgets = {
  score: 85,
  lcp: 2500,
  fid: 100,
  cls: 0.1,
  ttfb: 800,
  totalSize: 3 * 1024 * 1024
};

function checkBudgets(metrics) {
  const violations = [];

  if (metrics.score < budgets.score) {
    violations.push({ metric: 'score', value: metrics.score, budget: budgets.score });
  }

  // Check other budgets...

  return violations;
}
```

### 5. Use Custom Metrics for Domain-Specific Data

```javascript
// Collect business-specific metrics
const customMetrics = async (page) => {
  return await page.evaluate(() => {
    return {
      // E-commerce metrics
      productsDisplayed: document.querySelectorAll('.product-card').length,
      checkoutButtonVisible: !!document.querySelector('#checkout-button'),

      // Analytics integration
      googleAnalyticsLoaded: typeof window.ga !== 'undefined',
      pixelFired: window.__pixelFired || false,

      // Custom timing
      apiResponseTime: performance.getEntriesByName('api-call')[0]?.duration
    };
  });
};
```

## Troubleshooting

### Metrics Not Collected

```javascript
// Wait longer for metrics to populate
await page.waitForTimeout(2000);

const metrics = await puppeteerPlugin.performanceManager.collectMetrics(page, {
  waitForLoad: true
});
```

### Memory Usage Not Available

Memory API requires flag:

```bash
# Launch Chrome with memory API
const puppeteerPlugin = new PuppeteerPlugin({
  launch: {
    args: ['--enable-precise-memory-info']
  }
});
```

### Resource Timing Limit

```javascript
// Increase resource timing buffer
await page.evaluateOnNewDocument(() => {
  performance.setResourceTimingBufferSize(500);  // default: 250
});
```

## API Reference

### `collectMetrics(page, options)`

Collect all performance metrics from page.

**Parameters:**
- `page` (Page) - Puppeteer page instance
- `options` (Object) - Collection options
  - `waitForLoad` (boolean) - Wait for load event (default: true)
  - `collectResources` (boolean) - Collect resource timing (default: true)
  - `collectMemory` (boolean) - Collect memory info (default: true)
  - `collectScreenshots` (boolean) - Capture screenshots (default: false)
  - `customMetrics` (Function) - Custom metrics collector (default: null)

**Returns:** Performance report object

### `compareReports(baseline, current)`

Compare two performance reports.

**Parameters:**
- `baseline` (Object) - Baseline performance report
- `current` (Object) - Current performance report

**Returns:** Comparison object with improvements and regressions

## Examples

See complete examples:
- `docs/examples/e95-puppeteer-performance-metrics.js` - Comprehensive demo

## Further Reading

- [Core Web Vitals](https://web.dev/vitals/)
- [Navigation Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API)
- [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API)
- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)
- [Lighthouse Scoring](https://web.dev/performance-scoring/)
