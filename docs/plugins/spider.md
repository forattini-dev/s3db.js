# 🕷️ SpiderPlugin

> **Complete web crawler for SEO audits, security analysis, and technology fingerprinting.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Use Cases ↓](#-use-cases) | [Activity System ↓](#-activity-system) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Enterprise-grade web crawler** combining browser automation, distributed queuing, and comprehensive analysis.

**1 line to get started:**
```javascript
await db.usePlugin(new SpiderPlugin({ namespace: 'crawler' }));
```

**Complete SEO audit:**
```javascript
const spider = new SpiderPlugin({
  namespace: 'seo-audit',
  queue: { autoStart: true, concurrency: 5 },
  puppeteer: {
    stealth: { enabled: true },           // Avoid bot detection
    pool: { enabled: true, maxBrowsers: 3 }
  }
});

await db.usePlugin(spider);
await db.connect();

// Audit with SEO preset
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'seo_complete'    // All SEO activities
});

// Or custom activities
await spider.enqueueTarget({
  url: 'https://competitor.com',
  activities: [
    'seo_meta_tags',
    'seo_opengraph',
    'seo_links_analysis',
    'seo_accessibility',
    'tech_frameworks',
    'security_headers'
  ]
});
```

**Key Features:**
- ✅ **SEO Analysis** - Meta tags, OpenGraph, content ratio, accessibility (WCAG 2.1)
- ✅ **Security Audit** - Headers, CSP, CORS, CAPTCHA detection, vulnerability scoring
- ✅ **Tech Detection** - 100+ frameworks, analytics, CMS, CDN fingerprinting
- ✅ **Performance Metrics** - Core Web Vitals, navigation timing, memory
- ✅ **Anti-Detection** - Stealth mode, proxy rotation, human behavior simulation
- ✅ **Distributed Crawling** - Horizontal scaling with S3-based queue
- ✅ **Storage Analysis** - localStorage, IndexedDB, sessionStorage extraction
- ✅ **Content Analysis** - iFrames, tracking pixels, embeds detection

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js puppeteer
```

**Full installation (recommended):**
```bash
pnpm install s3db.js puppeteer puppeteer-extra puppeteer-extra-plugin-stealth ghost-cursor user-agents
```

**What's included:**
- `puppeteer` - Browser automation
- `puppeteer-extra-plugin-stealth` - Bot detection bypass
- `ghost-cursor` - Human-like mouse movements
- `user-agents` - Realistic user agent rotation

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [📦 Dependencies](#-dependencies)
3. [🎯 Use Cases](#-use-cases)
4. [🎬 Activity System](#-activity-system)
5. [🔍 SEO Analysis Deep Dive](#-seo-analysis-deep-dive)
6. [🔒 Security Analysis Deep Dive](#-security-analysis-deep-dive)
7. [🎭 Puppeteer Integration](#-puppeteer-integration)
8. [📈 Usage Journey](#-usage-journey)
9. [📊 Configuration Reference](#-configuration-reference)
10. [🔧 API Reference](#-api-reference)
11. [✅ Best Practices](#-best-practices)
12. [🚨 Error Handling](#-error-handling)
13. [❓ FAQ](#-faq)

---

## 🎯 Use Cases

### Use Case 1: Complete SEO Audit

Audit your website for SEO issues, accessibility problems, and content optimization opportunities.

```javascript
import { Database } from 's3db.js';
import { SpiderPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

const spider = new SpiderPlugin({
  namespace: 'seo-audit',
  queue: { autoStart: true, concurrency: 3 },
  persistence: { enabled: true },    // Save all results to S3
  puppeteer: {
    stealth: { enabled: true }
  }
});

await db.usePlugin(spider);
await db.connect();

// Audit multiple pages
const pages = [
  'https://mysite.com',
  'https://mysite.com/about',
  'https://mysite.com/products',
  'https://mysite.com/blog'
];

for (const url of pages) {
  await spider.enqueueTarget({
    url,
    activityPreset: 'seo_complete'
  });
}

// Wait for completion and get results
await spider.startProcessing();

// Query SEO analysis results
const seoResults = await spider.getSEOAnalysis();

for (const result of seoResults) {
  console.log(`\n📄 ${result.url}`);
  console.log(`   SEO Score: ${result.seoScore?.percentage}%`);
  console.log(`   Title: ${result.metaTags?.title || '❌ MISSING'}`);
  console.log(`   Description: ${result.metaTags?.description ? '✅' : '❌ MISSING'}`);
  console.log(`   H1 Count: ${result.onPageSEO?.h1?.count} (should be 1)`);
  console.log(`   Content Words: ${result.onPageSEO?.contentMetrics?.mainContentWordCount}`);
  console.log(`   Images without alt: ${result.onPageSEO?.images?.withoutAlt}`);

  // Show recommendations
  if (result.onPageSEO?.recommendations?.length > 0) {
    console.log(`   ⚠️ Recommendations:`);
    for (const rec of result.onPageSEO.recommendations.slice(0, 3)) {
      console.log(`      - ${rec}`);
    }
  }
}
```

**What you get:**
- Title tag analysis (length, quality)
- Meta description presence
- H1 tag count and quality
- Heading hierarchy (H1 > H2 > H3)
- Content word count and ratio
- Image alt text audit
- Internal/external link analysis
- Accessibility score

---

### Use Case 2: Competitor Analysis

Analyze competitors' technology stack, SEO strategy, and marketing tools.

```javascript
const spider = new SpiderPlugin({
  namespace: 'competitor-analysis',
  queue: { autoStart: true, concurrency: 5 },
  puppeteer: {
    stealth: { enabled: true },      // Avoid detection
    proxy: {                         // Rotate IPs
      enabled: true,
      list: ['http://proxy1.com', 'http://proxy2.com']
    }
  },
  persistence: { enabled: true }
});

await db.usePlugin(spider);
await db.connect();

const competitors = [
  'https://competitor1.com',
  'https://competitor2.com',
  'https://competitor3.com'
];

// Deep reconnaissance
for (const url of competitors) {
  await spider.enqueueTarget({
    url,
    activityPreset: 'reconnaissance',  // Full analysis including storage
    metadata: { type: 'competitor' }
  });
}

// Get technology fingerprints
const techResults = await spider.getTechFingerprints();

for (const result of techResults) {
  console.log(`\n🔍 ${result.url}`);
  console.log(`   Frameworks: ${result.frameworks?.join(', ') || 'None detected'}`);
  console.log(`   Analytics: ${result.analytics?.join(', ') || 'None detected'}`);
  console.log(`   Marketing: ${result.marketing?.join(', ') || 'None detected'}`);
  console.log(`   CMS: ${result.cms?.join(', ') || 'None detected'}`);
  console.log(`   CDN: ${result.cdn?.join(', ') || 'None detected'}`);
}
```

**What you discover:**
- Frontend frameworks (React, Vue, Angular, Next.js, Nuxt)
- Analytics platforms (Google Analytics, Mixpanel, Amplitude, Segment)
- Marketing tools (Facebook Pixel, LinkedIn, Google Ads, HubSpot)
- CMS platforms (WordPress, Shopify, Drupal, Webflow)
- CDN providers (Cloudflare, CloudFront, Fastly)
- JavaScript libraries (jQuery, Bootstrap, Tailwind)

---

### Use Case 3: Security Assessment

Audit security headers, CSP policies, and detect vulnerabilities.

```javascript
const spider = new SpiderPlugin({
  namespace: 'security-scan',
  queue: { autoStart: true, concurrency: 2 },
  security: {
    analyzeSecurityHeaders: true,
    analyzeCSP: true,
    analyzeCORS: true,
    checkVulnerabilities: true,
    captureConsoleLogs: true,
    captureWebSockets: true
  }
});

await db.usePlugin(spider);
await db.connect();

await spider.enqueueTarget({
  url: 'https://myapp.com',
  activityPreset: 'security'
});

// Get security analysis
const securityResults = await db.getResource(spider.resourceNames.securityAnalysis);
const results = await securityResults.query({});

for (const result of results) {
  console.log(`\n🔒 Security Report: ${result.url}`);
  console.log(`   Security Score: ${result.securityScore}/100`);

  // Missing headers
  if (result.securityHeaders?.missing?.length > 0) {
    console.log(`   ❌ Missing Headers:`);
    for (const header of result.securityHeaders.missing) {
      console.log(`      - ${header.header} (${header.importance})`);
      console.log(`        Recommended: ${header.recommended}`);
    }
  }

  // CSP analysis
  if (result.csp) {
    console.log(`   CSP Strength: ${result.csp.strength}`);
    if (result.csp.issues?.length > 0) {
      console.log(`   CSP Issues:`);
      for (const issue of result.csp.issues) {
        console.log(`      - ${issue}`);
      }
    }
  }

  // CAPTCHA detection
  if (result.captcha?.present) {
    console.log(`   CAPTCHA Detected: ${result.captcha.providers.join(', ')}`);
  }

  // Vulnerabilities
  if (result.vulnerabilities?.length > 0) {
    console.log(`   ⚠️ Vulnerabilities Found:`);
    for (const vuln of result.vulnerabilities) {
      console.log(`      [${vuln.severity.toUpperCase()}] ${vuln.type}`);
      console.log(`         ${vuln.message}`);
    }
  }
}
```

**What's analyzed:**
- **Security Headers**: X-Frame-Options, HSTS, X-Content-Type-Options, X-XSS-Protection
- **CSP**: Content Security Policy directives, unsafe-inline/eval detection
- **CORS**: Cross-Origin configuration, wildcard detection
- **TLS/HTTPS**: Certificate presence, HSTS configuration
- **CAPTCHA**: reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, AWS WAF
- **Vulnerabilities**: Clickjacking, MIME sniffing, SSL downgrade risks

---

### Use Case 4: Performance Monitoring

Collect Core Web Vitals and performance metrics across your site.

```javascript
const spider = new SpiderPlugin({
  namespace: 'performance-monitor',
  queue: { autoStart: true, concurrency: 3 },
  performance: {
    collectCoreWebVitals: true,
    collectNavigationTiming: true,
    collectResourceTiming: true,
    collectMemory: true
  }
});

await db.usePlugin(spider);
await db.connect();

// Monitor key pages
const criticalPages = [
  'https://mysite.com',              // Homepage
  'https://mysite.com/products',     // High-traffic page
  'https://mysite.com/checkout'      // Conversion page
];

for (const url of criticalPages) {
  await spider.enqueueTarget({
    url,
    activityPreset: 'performance'
  });
}

// Analyze results
const results = await spider.getResults();

for (const result of results) {
  const perf = result.performanceMetrics;
  if (!perf) continue;

  console.log(`\n⚡ ${result.url}`);
  console.log(`   LCP (Largest Contentful Paint): ${perf.lcp}ms`);
  console.log(`   FID (First Input Delay): ${perf.fid}ms`);
  console.log(`   CLS (Cumulative Layout Shift): ${perf.cls}`);
  console.log(`   TTFB (Time to First Byte): ${perf.ttfb}ms`);
  console.log(`   Memory Usage: ${(perf.memory?.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);

  // Performance grade
  const grade = perf.lcp < 2500 && perf.cls < 0.1 ? '✅ Good' : '⚠️ Needs Work';
  console.log(`   Grade: ${grade}`);
}
```

---

### Use Case 5: Content & Storage Analysis

Discover what data sites store locally and detect third-party embeds.

```javascript
const spider = new SpiderPlugin({
  namespace: 'content-analysis',
  queue: { autoStart: true }
});

await db.usePlugin(spider);
await db.connect();

await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'storage_localstorage',
    'storage_sessionstorage',
    'storage_indexeddb',
    'content_iframes',
    'content_tracking_pixels'
  ]
});

// Get storage analysis
const storageResource = await db.getResource(spider.resourceNames.storageAnalysis);
const storageResults = await storageResource.query({});

for (const result of storageResults) {
  console.log(`\n💾 Storage Analysis: ${result.url}`);

  // localStorage
  if (result.localStorage?.itemCount > 0) {
    console.log(`   localStorage: ${result.localStorage.itemCount} items`);
    console.log(`   Keys: ${Object.keys(result.localStorage.data || {}).slice(0, 5).join(', ')}`);
  }

  // IndexedDB
  if (result.indexedDB?.databases?.length > 0) {
    console.log(`   IndexedDB Databases: ${result.indexedDB.databases.length}`);
    for (const db of result.indexedDB.databases) {
      console.log(`      - ${db.name} (${db.stores?.length || 0} stores)`);
    }
  }
}

// Get content analysis (iframes, tracking)
const contentResource = await db.getResource(spider.resourceNames.contentAnalysis);
const contentResults = await contentResource.query({});

for (const result of contentResults) {
  console.log(`\n📦 Content Analysis: ${result.url}`);

  // iFrames
  if (result.iframes?.totalCount > 0) {
    console.log(`   iFrames Found: ${result.iframes.totalCount}`);
    console.log(`   Categories:`);
    for (const [category, count] of Object.entries(result.iframes.categorized || {})) {
      if (count > 0) console.log(`      - ${category}: ${count}`);
    }
  }

  // Tracking Pixels
  if (result.trackingPixels?.totalCount > 0) {
    console.log(`   Tracking Pixels: ${result.trackingPixels.totalCount}`);
    console.log(`   Services: ${result.trackingPixels.detectedServices?.join(', ')}`);
  }
}
```

---

### Use Case 6: Full Power - Complete Site Intelligence

The ultimate configuration combining all Spider capabilities: stealth browsing, proxy rotation, human behavior simulation, and comprehensive analysis.

```javascript
import { Database } from 's3db.js';
import { SpiderPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

// ═══════════════════════════════════════════════════════════
// FULL POWER CONFIGURATION
// ═══════════════════════════════════════════════════════════
const spider = new SpiderPlugin({
  namespace: 'full-power-crawler',
  logLevel: 'info',

  // Queue: High concurrency with retries
  queue: {
    autoStart: true,
    concurrency: 10,
    maxRetries: 3,
    retryDelay: 2000,
    batchSize: 5
  },

  // Puppeteer: Maximum stealth and reliability
  puppeteer: {
    pool: {
      enabled: true,
      maxBrowsers: 5,
      maxTabsPerBrowser: 2,
      closeOnIdle: true,
      idleTimeout: 60000
    },
    stealth: {
      enabled: true,
      enableEvasions: true
    },
    humanBehavior: {
      enabled: true,
      mouse: { enabled: true, jitter: true },
      typing: { enabled: true, mistakes: true },
      scrolling: { enabled: true, smooth: true, randomStops: true }
    },
    proxy: {
      enabled: true,
      list: process.env.PROXY_LIST?.split(',') || [],
      strategy: 'round-robin',
      healthCheck: true
    },
    performance: {
      blockImages: false,    // Keep for SEO analysis
      blockFonts: true,
      blockMedia: true
    }
  },

  // TTL: Auto-cleanup after 7 days
  ttl: {
    enabled: true,
    queue: { ttl: 604800000, onExpire: 'hard-delete' }
  },

  // Persistence: Save everything
  persistence: {
    enabled: true,
    saveResults: true,
    saveSEOAnalysis: true,
    saveTechFingerprint: true,
    saveSecurityAnalysis: true,
    saveScreenshots: true,
    savePerformanceMetrics: true
  }
});

await db.usePlugin(spider);
await db.connect();

// ═══════════════════════════════════════════════════════════
// GRANULAR ACTIVITY SELECTION PER URL
// ═══════════════════════════════════════════════════════════

// Homepage: Full analysis
await spider.enqueueTarget({
  url: 'https://target.com',
  activities: [
    // SEO
    'seo_meta_tags',
    'seo_opengraph',
    'seo_twitter_card',
    'seo_links_analysis',
    'seo_content_analysis',
    'seo_accessibility',
    'seo_heading_structure',
    // Security
    'security_headers',
    'security_csp',
    'security_captcha',
    // Tech
    'tech_frameworks',
    'tech_analytics',
    'tech_marketing',
    // Visual
    'screenshot_full',
    // Performance
    'performance_core_web_vitals'
  ],
  priority: 100,
  metadata: { type: 'homepage', importance: 'critical' }
});

// Product pages: Focus on SEO and performance
await spider.enqueueBatch(
  [
    { url: 'https://target.com/product/1' },
    { url: 'https://target.com/product/2' },
    { url: 'https://target.com/product/3' }
  ],
  {
    activities: [
      'seo_meta_tags',
      'seo_opengraph',
      'seo_content_analysis',
      'performance_core_web_vitals',
      'screenshot_viewport'
    ],
    priority: 50,
    metadata: { type: 'product' }
  }
);

// Checkout: Security focus
await spider.enqueueTarget({
  url: 'https://target.com/checkout',
  activities: [
    'security_headers',
    'security_csp',
    'security_cors',
    'security_tls',
    'security_captcha',
    'storage_localstorage',
    'storage_sessionstorage'
  ],
  priority: 80,
  metadata: { type: 'checkout', importance: 'security-critical' }
});

// ═══════════════════════════════════════════════════════════
// ADVANCED: Manual Page Operations with Detection API
// ═══════════════════════════════════════════════════════════

// Navigate manually for deep inspection
const page = await spider.navigate('https://target.com/login');

// Detect anti-bot protection
const antiBot = await spider.detectAntiBotServices(page);
console.log('Anti-bot services:', antiBot);

// Detect fingerprinting attempts
const fingerprint = await spider.detectFingerprinting(page);
console.log('Fingerprinting:', fingerprint);

// Detect WebRTC leaks and media streams
const webrtc = await spider.detectWebRTCAndStreams(page);
console.log('WebRTC/Streams:', webrtc);

// Capture all storage
const storage = await spider.captureAllStorage(page);
console.log('Storage:', storage);

await page.close();

// ═══════════════════════════════════════════════════════════
// RESULTS: Query and Export
// ═══════════════════════════════════════════════════════════

// Wait for queue to complete
await new Promise(resolve => {
  const interval = setInterval(async () => {
    const status = await spider.getQueueStatus();
    console.log(`Progress: ${status.completed}/${status.completed + status.pending + status.processing}`);
    if (status.pending === 0 && status.processing === 0) {
      clearInterval(interval);
      resolve();
    }
  }, 5000);
});

// Get all results
const seoResults = await spider.getSEOAnalysis();
const securityResults = await spider.getSecurityAnalysis();
const techResults = await spider.getTechFingerprints();
const screenshots = await spider.getScreenshots();
const storageResults = await spider.getStorageAnalysis();
const contentResults = await spider.getContentAnalysis();
const assetsResults = await spider.getAssetsAnalysis();

// Generate report
console.log('\n═══════════════════════════════════════════════════════════');
console.log('                    FULL POWER REPORT');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`📊 Pages Analyzed: ${seoResults.length}`);
console.log(`🔒 Security Issues: ${securityResults.filter(r => r.securityScore < 50).length}`);
console.log(`🛠️ Technologies Detected: ${new Set(techResults.flatMap(r => r.frameworks)).size} frameworks`);
console.log(`📸 Screenshots Captured: ${screenshots.length}`);

// SEO Summary
const avgSeoScore = seoResults.reduce((sum, r) => sum + (r.seoScore?.score || 0), 0) / seoResults.length;
console.log(`\n📈 Average SEO Score: ${avgSeoScore.toFixed(1)}/100`);

// Pages needing attention
const lowSeoPages = seoResults.filter(r => (r.seoScore?.score || 0) < 50);
if (lowSeoPages.length > 0) {
  console.log(`\n⚠️ Pages with Low SEO Score (<50):`);
  for (const page of lowSeoPages) {
    console.log(`   - ${page.url}: ${page.seoScore?.score || 0}/100`);
  }
}

// Security alerts
const securityAlerts = securityResults.filter(r => r.securityScore < 50);
if (securityAlerts.length > 0) {
  console.log(`\n🚨 Security Alerts:`);
  for (const alert of securityAlerts) {
    console.log(`   - ${alert.url}: Score ${alert.securityScore}/100`);
    if (alert.securityHeaders?.missing?.length > 0) {
      console.log(`     Missing headers: ${alert.securityHeaders.missing.map(h => h.header).join(', ')}`);
    }
  }
}

// Tech stack overview
const allFrameworks = new Set(techResults.flatMap(r => r.frameworks || []));
const allAnalytics = new Set(techResults.flatMap(r => r.analytics || []));
const allMarketing = new Set(techResults.flatMap(r => r.marketing || []));

console.log(`\n🛠️ Tech Stack Summary:`);
console.log(`   Frameworks: ${[...allFrameworks].join(', ') || 'None detected'}`);
console.log(`   Analytics: ${[...allAnalytics].join(', ') || 'None detected'}`);
console.log(`   Marketing: ${[...allMarketing].join(', ') || 'None detected'}`);

// Cleanup
await spider.destroy();
await db.disconnect();
```

**What Full Power gives you:**

| Capability | What it does |
|------------|--------------|
| **Stealth Mode** | Bypasses bot detection (Cloudflare, Akamai, etc.) |
| **Human Behavior** | Mouse movements, typing patterns, natural scrolling |
| **Proxy Rotation** | Distributes requests across multiple IPs |
| **Browser Pool** | Manages multiple browsers for high concurrency |
| **Granular Activities** | Run only what you need per URL |
| **Detection API** | Detect anti-bot, fingerprinting, WebRTC, CAPTCHA |
| **Full Persistence** | All data saved to S3 for later analysis |
| **Auto TTL** | Automatic cleanup of old data |

---

## 🎬 Activity System

The Activity System lets you **choose exactly what to analyze** on each URL. Instead of running everything, select only what you need for faster crawls and lower costs.

### Activity Categories

| Category | Activities | Description |
|----------|------------|-------------|
| **Visual** | `screenshot_full`, `screenshot_viewport` | Page screenshots |
| **SEO** | 7 activities | Meta tags, OpenGraph, links, accessibility |
| **Security** | 8 activities | Headers, CSP, CORS, CAPTCHA, vulnerabilities |
| **Technology** | 7 activities | Frameworks, analytics, CMS, CDN |
| **Performance** | 4 activities | Core Web Vitals, timing, memory |
| **Assets** | 5 activities | CSS, JS, images, videos, audio |
| **Storage** | 3 activities | localStorage, IndexedDB, sessionStorage |
| **Content** | 2 activities | iFrames, tracking pixels |

### Complete Activity Reference

#### Visual Activities
| Activity | Description |
|----------|-------------|
| `screenshot_full` | Full page screenshot (scrollable) |
| `screenshot_viewport` | Viewport only (1920x1080) |

#### SEO Activities
| Activity | Description |
|----------|-------------|
| `seo_meta_tags` | Title, description, keywords, viewport, robots |
| `seo_opengraph` | OpenGraph tags (og:title, og:image, etc.) |
| `seo_twitter_card` | Twitter Card tags |
| `seo_links_analysis` | Internal/external links, anchor text quality |
| `seo_content_analysis` | Word count, content ratio, paragraph analysis |
| `seo_accessibility` | WCAG 2.1 checks, alt text, semantic HTML |
| `seo_heading_structure` | H1-H6 hierarchy analysis |

#### Security Activities
| Activity | Description |
|----------|-------------|
| `security_headers` | X-Frame-Options, HSTS, X-Content-Type-Options |
| `security_csp` | Content Security Policy analysis |
| `security_cors` | CORS configuration check |
| `security_tls` | HTTPS/TLS verification |
| `security_console_logs` | Browser console errors/warnings |
| `security_websockets` | WebSocket connection detection |
| `security_captcha` | CAPTCHA provider detection |
| `security_vulnerabilities` | Security misconfiguration scan |

#### Technology Activities
| Activity | Description |
|----------|-------------|
| `tech_frameworks` | React, Vue, Angular, Next.js, Nuxt, Gatsby, Svelte |
| `tech_analytics` | Google Analytics, Mixpanel, Amplitude, Hotjar, Segment |
| `tech_marketing` | Facebook Pixel, LinkedIn, Google Ads, HubSpot, Intercom |
| `tech_cdn` | Cloudflare, CloudFront, Fastly, Akamai |
| `tech_web_server` | Nginx, Apache, IIS, LiteSpeed |
| `tech_cms` | WordPress, Shopify, Drupal, Webflow, Squarespace |
| `tech_libraries` | jQuery, Lodash, D3.js, Three.js, Chart.js, Bootstrap

#### Performance Activities
| Activity | Description |
|----------|-------------|
| `performance_core_web_vitals` | LCP, FID, CLS |
| `performance_navigation_timing` | Page load timing |
| `performance_resource_timing` | Individual resource timing |
| `performance_memory` | JavaScript heap size |

#### Storage Activities
| Activity | Description |
|----------|-------------|
| `storage_localstorage` | Extract localStorage key-value pairs |
| `storage_sessionstorage` | Extract sessionStorage data |
| `storage_indexeddb` | IndexedDB databases and stores |

#### Content Activities
| Activity | Description |
|----------|-------------|
| `content_iframes` | Detect and categorize iFrames |
| `content_tracking_pixels` | Tracking pixels and analytics beacons |

### Activity Presets

Use presets for common scenarios:

| Preset | Activities | Use Case | ~Time/URL |
|--------|------------|----------|-----------|
| `minimal` | 3 | Quick check | ~5s |
| `basic` | 7 | General crawling | ~15s |
| `security` | 8 | Security audit | ~20s |
| `seo_complete` | 7 | SEO analysis | ~20s |
| `performance` | 4 | Performance testing | ~25s |
| `reconnaissance` | 19 | Deep analysis | ~40s |
| `full` | 36+ | Everything | ~60s+ |

```javascript
// Using presets
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'seo_complete'  // All SEO activities
});

// Custom combination
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'screenshot_full',
    'seo_meta_tags',
    'seo_links_analysis',
    'tech_frameworks',
    'security_headers'
  ]
});

// Batch with default preset
await spider.enqueueBatch(
  [
    { url: 'https://example.com' },
    { url: 'https://example.com/about' },
    { url: 'https://example.com/blog', activityPreset: 'security' }  // Override
  ],
  { activityPreset: 'basic' }  // Default for all
);
```

### Activity API

```javascript
// List all activities
const activities = spider.getAvailableActivities();
// Returns: [{ name: 'screenshot_full', label: 'Full Page Screenshot', ... }, ...]

// Get by category
const seoActivities = spider.getActivitiesByCategory('seo');
// Returns: Array of SEO activities

// Get all categories
const categories = spider.getActivityCategories();
// Returns: { seo: { activities: [...] }, security: { ... }, ... }

// Get preset details
const preset = spider.getPresetByName('security');
// Returns: { name: 'security', activities: [...], description: '...' }

// Validate custom list
const validation = spider.validateActivityList(['seo_meta_tags', 'invalid_name']);
// Returns: { valid: false, invalid: ['invalid_name'] }
```

---

## 🔍 SEO Analysis Deep Dive

SpiderPlugin includes a comprehensive SEO analyzer that goes beyond basic meta tag extraction.

### What's Analyzed

#### 1. Meta Tags
```javascript
{
  metaTags: {
    title: 'Page Title',           // Should be 30-60 chars
    description: 'Meta desc...',   // Should be 120-160 chars
    keywords: 'keyword1, ...',
    viewport: 'width=device-width',
    robots: 'index, follow',
    author: 'Author Name',
    charset: 'UTF-8'
  }
}
```

#### 2. OpenGraph Tags
```javascript
{
  openGraph: {
    title: 'OG Title',
    description: 'OG Description',
    image: 'https://example.com/og.jpg',
    url: 'https://example.com',
    type: 'website',
    siteName: 'Example Site'
  }
}
```

#### 3. On-Page SEO Structure
```javascript
{
  onPageSEO: {
    title: {
      text: 'Page Title',
      length: 42,
      quality: 'optimal'          // short | optimal | long
    },
    h1: {
      count: 1,                    // Should be exactly 1
      texts: [{ text: 'Main Heading', quality: 'good' }]
    },
    headingStructure: {
      total: 12,
      byLevel: { H1: 1, H2: 4, H3: 7 },
      hierarchy: 'proper'         // proper | improper
    },
    paragraphs: {
      count: 15,
      avgLength: 120,
      quality: { readability: 'good' }
    },
    images: {
      count: 8,
      withAlt: 6,
      withoutAlt: 2               // ⚠️ Accessibility issue
    },
    contentMetrics: {
      totalWordCount: 2500,
      mainContentWordCount: 1800, // Excludes nav/footer
      contentRatio: 0.72,         // 72% is main content
      quality: 'comprehensive',   // short | medium | comprehensive
      detectedContentContainers: [
        { selector: 'article', wordCount: 1800, matchType: 'semantic' }
      ]
    }
  }
}
```

#### 4. Internal Link Analysis
```javascript
{
  internalLinks: {
    total: 45,
    sameDomain: {
      count: 30,
      links: [{
        href: 'https://example.com/about',
        text: 'About Us',
        quality: 'descriptive',    // descriptive | generic
        referral: {
          nofollow: false,
          noopener: false,
          rel: null
        }
      }]
    },
    external: {
      count: 15,
      domains: { 'twitter.com': 3, 'linkedin.com': 2 }
    },
    anchorTextQuality: {
      descriptive: 38,
      poor: 7,                     // "click here", "read more"
      examples: ['click here', 'more']
    },
    referralAttributes: {
      nofollow: 5,
      sponsored: 2,
      ugc: 0,
      targetBlank: 12
    },
    topicalClusters: {
      clusters: ['blog', 'products', 'about'],
      strength: [15, 10, 5]
    }
  }
}
```

#### 5. Accessibility (WCAG 2.1)
```javascript
{
  accessibility: {
    langAttribute: {
      present: true,
      value: 'en'
    },
    headingStructure: {
      startsWithH1: true,
      properlySorted: true
    },
    altText: {
      total: 8,
      withAlt: 6,
      percentage: 75              // Should be 100%
    },
    formLabels: {
      inputs: 5,
      inputsWithLabels: 4         // 1 missing label
    },
    semanticHTML: {
      elements: {
        nav: 1,
        main: 1,
        article: 3,
        section: 5,
        aside: 1,
        header: 1,
        footer: 1
      },
      score: 13                   // Higher is better
    },
    keyboardNavigation: {
      focusableElements: 45,
      hasSkipLink: false          // ⚠️ Should have skip link
    },
    recommendations: [
      'Add lang attribute to <html> tag',
      'Add skip navigation link for keyboard users',
      'Add alt text to 2 images'
    ]
  }
}
```

#### 6. Keyword Optimization
```javascript
{
  keywordOptimization: {
    primaryKeyword: 'web development',
    secondaryKeywords: ['javascript', 'react'],
    keywordDensity: '1.5%',       // Ideal: 1-2%
    inTitle: true,
    inH1: true,
    inFirstParagraph: true,
    recommendations: [
      'Primary keyword should appear in first paragraph'
    ]
  }
}
```

#### 7. SEO Score
```javascript
{
  seoScore: {
    score: 78,
    maxScore: 100,
    percentage: '78.0'
  }
}
```

**Score breakdown:**
- Meta tags (20 points): title, description, viewport, robots
- OpenGraph (10 points): social sharing optimization
- On-page SEO (30 points): H1, headings, content length
- Accessibility (20 points): lang, alt text, semantic HTML
- Internal links (10 points): topical clusters
- Keyword optimization (10 points): density, placement

---

## 🔒 Security Analysis Deep Dive

### Security Headers Analysis

```javascript
{
  securityHeaders: {
    present: ['X-Frame-Options', 'X-Content-Type-Options'],
    missing: [
      {
        header: 'Strict-Transport-Security',
        importance: 'critical',
        recommended: 'max-age=31536000; includeSubDomains',
        description: 'Forces HTTPS connections'
      }
    ],
    details: {
      'x-frame-options': {
        value: 'SAMEORIGIN',
        importance: 'critical',
        description: 'Prevents clickjacking attacks'
      }
    }
  }
}
```

**Headers analyzed:**
| Header | Importance | Recommended Value |
|--------|------------|-------------------|
| X-Frame-Options | Critical | DENY or SAMEORIGIN |
| X-Content-Type-Options | Critical | nosniff |
| Strict-Transport-Security | Critical | max-age=31536000; includeSubDomains |
| X-XSS-Protection | High | 1; mode=block |
| Referrer-Policy | Medium | strict-origin-when-cross-origin |
| Permissions-Policy | Medium | geolocation=(), camera=() |

### CSP Analysis

```javascript
{
  csp: {
    present: true,
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'",
    directives: {
      'default-src': "'self'",
      'script-src': "'self' 'unsafe-inline'"
    },
    issues: [
      "script-src contains unsafe-inline - reduces security"
    ],
    strength: 'moderate'    // none | weak | moderate | strong
  }
}
```

### CORS Analysis

```javascript
{
  cors: {
    corsEnabled: true,
    allowOrigin: 'https://trusted.com',
    allowMethods: 'GET, POST',
    allowHeaders: 'Content-Type',
    credentials: true,
    issues: []              // Empty = secure configuration
  }
}
```

### CAPTCHA Detection

SpiderPlugin detects multiple CAPTCHA providers:

```javascript
{
  captcha: {
    present: true,
    providers: ['reCAPTCHA v3', 'Cloudflare Turnstile'],
    details: [
      {
        provider: 'Google',
        type: 'reCAPTCHA v3',
        version: 3,
        method: 'invisible',
        description: 'Google reCAPTCHA v3 - invisible verification'
      },
      {
        provider: 'Cloudflare',
        type: 'Turnstile',
        method: 'interactive/invisible',
        description: 'Cloudflare Turnstile - CAPTCHA alternative'
      }
    ]
  }
}
```

**Detected providers:**
- Google reCAPTCHA v2 (checkbox)
- Google reCAPTCHA v3 (invisible)
- hCaptcha
- Cloudflare Turnstile
- AWS WAF CAPTCHA
- Akamai Bot Manager

### Vulnerability Detection

```javascript
{
  vulnerabilities: [
    {
      type: 'clickjacking',
      severity: 'high',
      message: 'Missing X-Frame-Options header',
      recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN'
    },
    {
      type: 'ssl-downgrade',
      severity: 'high',
      message: 'Missing HSTS header',
      recommendation: 'Add Strict-Transport-Security header'
    },
    {
      type: 'csp-weak',
      severity: 'medium',
      message: 'Weak CSP: script-src contains unsafe-inline',
      recommendation: 'Remove unsafe-inline from CSP'
    }
  ]
}
```

### Security Score

Score calculation (0-100):
- Base: 50 points
- Security headers: +30 (proportional to present/missing)
- CSP strength: +20 (strong) / +10 (moderate)
- CORS security: +20 (no issues) / +10 (minor issues)
- TLS/HTTPS: +15 (HTTPS + HSTS) / +10 (HTTPS only)
- Penalties: -10 per high vulnerability, -3 per medium

---

## 🎭 Puppeteer Integration

SpiderPlugin uses PuppeteerPlugin for browser automation. Configure it to avoid bot detection and improve reliability.

### Stealth Mode

Bypass bot detection with stealth mode:

```javascript
const spider = new SpiderPlugin({
  namespace: 'stealth-crawler',
  puppeteer: {
    stealth: {
      enabled: true,
      enableEvasions: true    // All evasion techniques
    }
  }
});
```

**What stealth mode does:**
- Removes `navigator.webdriver` flag
- Patches WebGL vendor/renderer
- Fixes Chrome plugin detection
- Spoofs permissions API
- Randomizes canvas fingerprint
- Patches CDP detection

### Human Behavior Simulation

Add realistic mouse movements and typing:

```javascript
const spider = new SpiderPlugin({
  namespace: 'human-like',
  puppeteer: {
    humanBehavior: {
      enabled: true,
      mouse: {
        enabled: true,
        movementDelay: { min: 50, max: 200 },
        jitter: true
      },
      typing: {
        enabled: true,
        delay: { min: 50, max: 150 },
        mistakes: true,           // Occasional typos + corrections
        mistakeProbability: 0.02
      },
      scrolling: {
        enabled: true,
        smooth: true,
        randomStops: true
      }
    }
  }
});
```

### Proxy Rotation

Distribute requests across multiple IPs:

```javascript
const spider = new SpiderPlugin({
  namespace: 'distributed',
  puppeteer: {
    proxy: {
      enabled: true,
      list: [
        'http://user:pass@proxy1.com:8080',
        'http://user:pass@proxy2.com:8080',
        'http://user:pass@proxy3.com:8080'
      ],
      strategy: 'round-robin',    // round-robin | random | least-used
      healthCheck: true,
      failoverThreshold: 3        // Switch after 3 failures
    }
  }
});
```

### Browser Pool

Manage multiple browser instances:

```javascript
const spider = new SpiderPlugin({
  namespace: 'high-volume',
  puppeteer: {
    pool: {
      enabled: true,
      maxBrowsers: 5,
      maxTabsPerBrowser: 10,
      closeOnIdle: true,
      idleTimeout: 300000         // 5 minutes
    }
  },
  queue: {
    concurrency: 50               // Match pool capacity
  }
});
```

### Resource Blocking

Speed up crawling by blocking unnecessary resources:

```javascript
const spider = new SpiderPlugin({
  namespace: 'fast-crawler',
  puppeteer: {
    performance: {
      blockImages: true,          // Don't load images
      blockFonts: true,           // Don't load fonts
      blockCSS: false,            // Keep CSS for analysis
      blockMedia: true            // Block video/audio
    }
  }
});
```

**Performance impact:**
- Blocking images: 40-60% faster
- Blocking fonts: 10-20% faster
- Blocking all: 50-70% faster

### Cookie Farming

Maintain session cookies across requests:

```javascript
const spider = new SpiderPlugin({
  namespace: 'session-crawler',
  puppeteer: {
    cookies: {
      enabled: true,
      storage: {
        enabled: true,
        resource: 'crawler_cookies'  // Store in S3
      },
      farming: {
        enabled: true,
        warmupUrls: [
          'https://target.com',
          'https://target.com/login'
        ],
        rotationStrategy: 'least-used'
      }
    }
  }
});
```

---

## 📈 Usage Journey

### Level 1: Basic Crawling

Start with a simple single-page crawl:

```javascript
import { Database } from 's3db.js';
import { SpiderPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

const spider = new SpiderPlugin({
  namespace: 'basic',
  queue: { autoStart: true }
});

await db.usePlugin(spider);
await db.connect();

// Crawl one page
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'minimal'
});

// Get results
const results = await spider.getResults();
console.log(results[0]);
```

---

### Level 2: Batch Crawling

Crawl multiple pages efficiently:

```javascript
const spider = new SpiderPlugin({
  namespace: 'batch',
  queue: {
    autoStart: true,
    concurrency: 5
  }
});

await db.usePlugin(spider);

// Batch enqueue
await spider.enqueueBatch(
  [
    { url: 'https://example.com' },
    { url: 'https://example.com/about' },
    { url: 'https://example.com/products' },
    { url: 'https://example.com/contact' }
  ],
  { activityPreset: 'basic' }
);

// Monitor progress
setInterval(async () => {
  const status = await spider.getQueueStatus();
  console.log(`Pending: ${status.pending}, Completed: ${status.completed}`);
}, 5000);
```

---

### Level 3: Persistent Storage

Save all analysis results to S3:

```javascript
const spider = new SpiderPlugin({
  namespace: 'persistent',
  queue: { autoStart: true, concurrency: 3 },
  persistence: {
    enabled: true,
    saveResults: true,
    saveSEOAnalysis: true,
    saveTechFingerprint: true,
    saveSecurityAnalysis: true,
    saveScreenshots: true,
    savePerformanceMetrics: true
  }
});

await db.usePlugin(spider);

// Crawl pages
await spider.enqueueBatch([
  { url: 'https://example.com', activityPreset: 'full' }
]);

// Later: query stored results
const seoResults = await spider.getSEOAnalysis();
const techResults = await spider.getTechFingerprints();
const screenshots = await spider.getScreenshots();
```

---

### Level 4: Production Setup

Full production configuration with stealth, proxies, and monitoring:

```javascript
const spider = new SpiderPlugin({
  namespace: 'production',

  // Queue configuration
  queue: {
    autoStart: true,
    concurrency: 10,
    maxRetries: 3,
    retryDelay: 2000
  },

  // Browser configuration
  puppeteer: {
    pool: { enabled: true, maxBrowsers: 5 },
    stealth: { enabled: true },
    proxy: {
      enabled: true,
      list: process.env.PROXY_LIST?.split(',') || []
    },
    performance: {
      blockImages: true,
      blockFonts: true
    }
  },

  // TTL cleanup
  ttl: {
    enabled: true,
    queue: {
      ttl: 86400000,              // 24 hours
      onExpire: 'hard-delete'
    }
  },

  // Full persistence
  persistence: {
    enabled: true,
    saveResults: true,
    saveSEOAnalysis: true,
    saveTechFingerprint: true,
    saveSecurityAnalysis: true,
    saveScreenshots: true
  }
});

await db.usePlugin(spider);
await db.connect();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await spider.stopProcessing();
  await spider.destroy();
  await db.disconnect();
  process.exit(0);
});

// Start crawling
await spider.startProcessing();
```

---

### Level 5: Distributed Crawling

Scale horizontally across multiple workers:

**Worker 1 (machine-1):**
```javascript
const spider = new SpiderPlugin({
  namespace: 'distributed',        // Same namespace
  queue: {
    autoStart: true,
    concurrency: 5,
    workerId: 'worker-1'           // Unique ID
  }
});
```

**Worker 2 (machine-2):**
```javascript
const spider = new SpiderPlugin({
  namespace: 'distributed',        // Same namespace
  queue: {
    autoStart: true,
    concurrency: 5,
    workerId: 'worker-2'           // Different ID
  }
});
```

**Coordinator (enqueues jobs):**
```javascript
const db = new Database({ connectionString: 's3://...' });
await db.connect();

const targetsResource = await db.getResource('plg_distributed_targets');

// Enqueue URLs from sitemap
const urls = await fetchSitemap('https://example.com/sitemap.xml');
for (const url of urls) {
  await targetsResource.insert({
    url,
    status: 'pending',
    activityPreset: 'basic'
  });
}

console.log(`Enqueued ${urls.length} URLs for distributed processing`);
```

---

## 📊 Configuration Reference

```javascript
new SpiderPlugin({
  // ============================================
  // CORE SETTINGS
  // ============================================
  namespace: 'crawler',              // Required: Namespace for resources
  logLevel: 'info',                  // debug | info | warn | error

  // ============================================
  // QUEUE CONFIGURATION
  // ============================================
  queue: {
    autoStart: true,                 // Start processing automatically
    concurrency: 5,                  // Parallel workers
    maxRetries: 3,                   // Retry failed tasks
    retryDelay: 1000,                // Delay between retries (ms)
    batchSize: 10,                   // Tasks per batch
    workerId: 'worker-1',            // Unique ID for distributed
    visibilityTimeout: 30            // Task lock duration (seconds)
  },

  // ============================================
  // PUPPETEER CONFIGURATION
  // ============================================
  puppeteer: {
    pool: {
      enabled: true,
      maxBrowsers: 3,
      maxTabsPerBrowser: 10,
      closeOnIdle: true,
      idleTimeout: 300000
    },
    stealth: {
      enabled: true,
      enableEvasions: true
    },
    humanBehavior: {
      enabled: false,
      mouse: { enabled: true, jitter: true },
      typing: { enabled: true, mistakes: true },
      scrolling: { enabled: true, smooth: true }
    },
    proxy: {
      enabled: false,
      list: [],
      strategy: 'round-robin'
    },
    performance: {
      blockImages: false,
      blockFonts: false,
      blockCSS: false,
      blockMedia: false
    },
    cookies: {
      enabled: false,
      storage: { enabled: false }
    },
    launch: {
      headless: true,
      args: ['--no-sandbox']
    },
    viewport: {
      width: 1920,
      height: 1080
    }
  },

  // ============================================
  // TTL CONFIGURATION
  // ============================================
  ttl: {
    enabled: true,
    queue: {
      ttl: 86400000,                 // 24 hours
      onExpire: 'hard-delete',       // soft-delete | hard-delete
      checkInterval: 300000          // 5 minutes
    }
  },

  // ============================================
  // SEO CONFIGURATION
  // ============================================
  seo: {
    enabled: true,
    extractMetaTags: true,
    extractOpenGraph: true,
    extractTwitterCard: true,
    extractAssets: true,
    analyzeOnPageSEO: true,
    analyzeAccessibility: true,
    analyzeInternalLinks: true,
    analyzeKeywordOptimization: true
  },

  // ============================================
  // TECHNOLOGY DETECTION
  // ============================================
  techDetection: {
    enabled: true,
    detectFrameworks: true,
    detectAnalytics: true,
    detectMarketing: true,
    detectCDN: true,
    detectWebServer: true,
    detectCMS: true
  },

  // ============================================
  // SECURITY CONFIGURATION
  // ============================================
  security: {
    enabled: true,
    analyzeSecurityHeaders: true,
    analyzeCSP: true,
    analyzeCORS: true,
    analyzeTLS: true,
    captureConsoleLogs: true,
    consoleLogLevels: ['error', 'warn'],
    maxConsoleLogLines: 100,
    captureWebSockets: true,
    maxWebSocketMessages: 50,
    checkVulnerabilities: true
  },

  // ============================================
  // SCREENSHOT CONFIGURATION
  // ============================================
  screenshot: {
    enabled: true,
    captureFullPage: true,
    quality: 80,                     // JPEG quality (0-100)
    format: 'jpeg',                  // jpeg | png
    maxWidth: 1920,
    maxHeight: 1080
  },

  // ============================================
  // PERFORMANCE METRICS
  // ============================================
  performance: {
    enabled: true,
    collectCoreWebVitals: true,
    collectNavigationTiming: true,
    collectResourceTiming: true,
    collectMemory: true
  },

  // ============================================
  // PERSISTENCE
  // ============================================
  persistence: {
    enabled: false,                  // Opt-in storage
    saveResults: true,
    saveSEOAnalysis: true,
    saveTechFingerprint: true,
    saveSecurityAnalysis: true,
    saveScreenshots: true,
    savePerformanceMetrics: true
  }
})
```

---

## 🔧 API Reference

### SpiderPlugin Methods

#### `enqueueTarget(target)`

Add a URL to the crawl queue.

```javascript
await spider.enqueueTarget({
  url: 'https://example.com',        // Required
  priority: 10,                      // Higher = sooner
  activities: ['seo_meta_tags'],     // Custom activities
  activityPreset: 'basic',           // Or use preset
  metadata: { source: 'sitemap' }    // Custom data
});
```

#### `enqueueBatch(targets, defaults)`

Add multiple URLs with shared defaults.

```javascript
await spider.enqueueBatch(
  [
    { url: 'https://example.com' },
    { url: 'https://example.com/about', activityPreset: 'security' }
  ],
  { activityPreset: 'basic', priority: 5 }
);
```

#### `getResults(query?)`

Query crawl results.

```javascript
const results = await spider.getResults({ url: 'https://example.com' });
```

#### `getSEOAnalysis(query?)`

Query SEO analysis records.

```javascript
const seo = await spider.getSEOAnalysis({ 'seoScore.percentage': { $gt: 80 } });
```

#### `getTechFingerprints(query?)`

Query technology fingerprints.

```javascript
const tech = await spider.getTechFingerprints({ frameworks: 'React' });
```

#### `getScreenshots(query?)`

Query captured screenshots.

```javascript
const screenshots = await spider.getScreenshots({ format: 'png' });
```

#### `getSecurityAnalysis(query?)`

Query security analysis records.

```javascript
const security = await spider.getSecurityAnalysis({ 'securityScore': { $lt: 50 } });
```

#### `getContentAnalysis(query?)`

Query content analysis records (iframes, tracking pixels).

```javascript
const content = await spider.getContentAnalysis({ 'trackingPixels.totalCount': { $gt: 0 } });
```

#### `getStorageAnalysis(query?)`

Query storage analysis records (localStorage, IndexedDB, sessionStorage).

```javascript
const storage = await spider.getStorageAnalysis({ 'localStorage.itemCount': { $gt: 0 } });
```

#### `getAssetsAnalysis(query?)`

Query assets analysis records (CSS, JS, images, videos, audios).

```javascript
const assets = await spider.getAssetsAnalysis({ 'summary.totalImages': { $gt: 10 } });
```

#### `getPerformanceMetrics(query?)`

Query performance metrics records.

```javascript
const perf = await spider.getPerformanceMetrics({ url: 'https://example.com' });
```

#### `getQueueStatus()`

Get queue statistics.

```javascript
const status = await spider.getQueueStatus();
// { pending: 10, processing: 2, completed: 88, failed: 0 }
```

#### `startProcessing()` / `stopProcessing()`

Control queue processing.

```javascript
await spider.startProcessing();
// ... crawling ...
await spider.stopProcessing();
```

#### `enablePersistence(config?)` / `disablePersistence()`

Toggle persistence at runtime.

```javascript
spider.enablePersistence({ saveScreenshots: false });
spider.disablePersistence();
```

#### `clear()`

Delete all crawl data.

```javascript
await spider.clear();  // Removes all targets, results, etc.
```

#### `destroy()`

Clean up resources.

```javascript
await spider.destroy();  // Closes browsers, stops processing
```

### Activity API

```javascript
spider.getAvailableActivities()      // All activities
spider.getActivitiesByCategory(cat)  // By category
spider.getActivityCategories()       // Categories with activities
spider.getActivityPresets()          // All presets
spider.getPresetByName(name)         // Specific preset
spider.validateActivityList(names)   // Validate custom list
```

### Detection API (via PuppeteerPlugin)

SpiderPlugin exposes PuppeteerPlugin's detection capabilities for advanced analysis:

```javascript
// Get a page for manual operations
const page = await spider.navigate('https://example.com');

// Anti-bot and CAPTCHA detection
const antiBot = await spider.detectAntiBotServices(page);
// Returns: { detected: true, services: ['reCAPTCHA v3', 'Cloudflare'] }

// Browser fingerprinting detection
const fingerprint = await spider.detectFingerprinting(page);
// Returns: { canvas: true, webgl: true, audio: true, fonts: true }

// Comprehensive anti-bot + fingerprinting
const combined = await spider.detectAntiBotsAndFingerprinting(page);

// WebRTC and media detection
const webrtc = await spider.detectWebRTC(page);
const streams = await spider.detectMediaStreams(page);
const protocols = await spider.detectStreamingProtocols(page);
const allStreams = await spider.detectWebRTCAndStreams(page);

// Manual storage capture
const storage = await spider.captureAllStorage(page);
// Returns: { localStorage: {...}, sessionStorage: {...}, indexedDB: {...} }

// Don't forget to close the page
await page.close();
```

### Advanced Access

```javascript
// Get underlying PuppeteerPlugin for advanced usage
const puppeteer = spider.getPuppeteerPlugin();

// Access cookie manager
await puppeteer.farmCookies('my-session');
const cookieStats = await puppeteer.getCookieStats();

// Access proxy manager
const proxyStats = puppeteer.getProxyStats();
const bindings = puppeteer.getSessionProxyBindings();
await puppeteer.checkProxyHealth();

// Human behavior methods (on page)
const page = await spider.navigate('https://example.com');
await page.humanClick('#button');
await page.humanType('#input', 'Hello world');
await page.humanScroll({ direction: 'down' });
```

---

## ✅ Best Practices

### Performance

```javascript
// ✅ Match concurrency to pool capacity
queue: { concurrency: 50 },
puppeteer: {
  pool: { maxBrowsers: 10, maxTabsPerBrowser: 5 }  // 10 * 5 = 50
}

// ✅ Block unnecessary resources
puppeteer: {
  performance: { blockImages: true, blockFonts: true }
}

// ✅ Use minimal activities when possible
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'minimal'  // Only 3 activities
});

// ✅ Batch enqueue for better performance
await spider.enqueueBatch(urls.map(url => ({ url })));
```

### Anti-Detection

```javascript
// ✅ Enable stealth for protected sites
puppeteer: {
  stealth: { enabled: true }
}

// ✅ Rotate proxies for high-volume crawling
puppeteer: {
  proxy: {
    enabled: true,
    list: [...proxies],
    strategy: 'round-robin'
  }
}

// ✅ Add delays between requests
queue: {
  concurrency: 2,  // Lower concurrency
  retryDelay: 5000 // Longer delays
}
```

### Reliability

```javascript
// ✅ Always handle shutdown gracefully
process.on('SIGTERM', async () => {
  await spider.stopProcessing();
  await spider.destroy();
});

// ✅ Enable TTL to clean up stale tasks
ttl: {
  enabled: true,
  queue: { ttl: 86400000, onExpire: 'hard-delete' }
}

// ✅ Use unique worker IDs for distributed crawling
queue: { workerId: process.env.HOSTNAME || 'worker-1' }
```

### Data Management

```javascript
// ✅ Enable persistence for important crawls
persistence: { enabled: true }

// ✅ Query results efficiently
const results = await spider.getSEOAnalysis({
  'seoScore.percentage': { $lt: 50 }  // Only poor scores
});

// ✅ Clean up after analysis
await spider.clear();
```

---

## 🚨 Error Handling

### Common Errors

#### "Target must have a url property"

```javascript
// ❌ Wrong
await spider.enqueueTarget({ link: 'https://...' });

// ✅ Correct
await spider.enqueueTarget({ url: 'https://...' });
```

#### "Unknown activity preset"

```javascript
// ❌ Wrong
await spider.enqueueTarget({ url: '...', activityPreset: 'complete' });

// ✅ Correct - use valid preset names
await spider.enqueueTarget({ url: '...', activityPreset: 'full' });
// Available: minimal, basic, security, seo_complete, performance, reconnaissance, full
```

#### "Invalid activities"

```javascript
// ❌ Wrong
await spider.enqueueTarget({ url: '...', activities: ['seo_all'] });

// ✅ Correct - validate first
const validation = spider.validateActivityList(['seo_meta_tags', 'seo_all']);
if (!validation.valid) {
  console.log('Invalid:', validation.invalid);
}
```

#### "Browser pool exhausted"

```javascript
// ❌ Wrong - concurrency exceeds pool capacity
queue: { concurrency: 100 },
puppeteer: { pool: { maxBrowsers: 2 } }

// ✅ Correct - match concurrency to capacity
queue: { concurrency: 20 },
puppeteer: { pool: { maxBrowsers: 4, maxTabsPerBrowser: 5 } }  // 4 * 5 = 20
```

### Troubleshooting

#### Site blocking your crawler

1. Enable stealth mode
2. Use proxy rotation
3. Add delays between requests
4. Reduce concurrency
5. Enable human behavior simulation

```javascript
const spider = new SpiderPlugin({
  namespace: 'careful',
  queue: { concurrency: 2, retryDelay: 5000 },
  puppeteer: {
    stealth: { enabled: true },
    humanBehavior: { enabled: true },
    proxy: { enabled: true, list: [...] }
  }
});
```

#### Memory issues

1. Enable browser pooling
2. Block images and fonts
3. Reduce concurrency
4. Enable TTL cleanup

```javascript
puppeteer: {
  pool: { enabled: true, maxBrowsers: 3 },
  performance: { blockImages: true, blockFonts: true }
}
```

#### Slow crawling

1. Increase concurrency
2. Use browser pooling
3. Block unnecessary resources
4. Use minimal activity preset

```javascript
queue: { concurrency: 20 },
puppeteer: {
  pool: { enabled: true, maxBrowsers: 5, maxTabsPerBrowser: 4 },
  performance: { blockImages: true }
}
```

---

## ❓ FAQ

### General

**Q: What's the difference between SpiderPlugin and PuppeteerPlugin?**

SpiderPlugin is a **meta-plugin** that includes PuppeteerPlugin plus:
- Distributed queue (S3QueuePlugin)
- TTL cleanup (TTLPlugin)
- SEO/Security/Tech analyzers
- Activity system

Use PuppeteerPlugin alone for simple browser automation. Use SpiderPlugin for web crawling with analysis.

**Q: How many URLs can I crawl per hour?**

Depends on configuration:
- Minimal preset, blocking images: ~500-1000 URLs/hour/worker
- Full preset, no blocking: ~50-100 URLs/hour/worker
- Distributed (5 workers): 5x single worker capacity

**Q: Can I crawl JavaScript-rendered pages?**

Yes! SpiderPlugin uses Puppeteer which fully renders JavaScript. Enable `waitUntil: 'networkidle2'` for SPA sites.

**Q: Does it work with authentication?**

Yes. Use cookie farming or inject auth headers:

```javascript
puppeteer: {
  cookies: {
    enabled: true,
    initial: [
      { name: 'session', value: 'abc123', domain: 'example.com' }
    ]
  }
}
```

---

### SEO Analysis

**Q: What SEO checks are performed?**

- Meta tags (title, description, keywords, viewport)
- OpenGraph and Twitter Card tags
- H1 tag presence and uniqueness
- Heading hierarchy (H1 > H2 > H3)
- Content length and ratio
- Image alt text audit
- Internal/external link analysis
- Keyword density and placement
- Accessibility (WCAG 2.1)
- Semantic HTML usage

**Q: How is the SEO score calculated?**

- Meta tags: 20 points
- OpenGraph: 10 points
- On-page SEO: 30 points
- Accessibility: 20 points
- Internal links: 10 points
- Keyword optimization: 10 points

**Q: What's "content ratio"?**

The percentage of main content vs total page text. A page with 1000 words total but only 300 in the main article has 30% content ratio. Higher is better (aim for 50%+).

---

### Security

**Q: What vulnerabilities does it detect?**

- Missing security headers (X-Frame-Options, HSTS, etc.)
- Weak CSP (unsafe-inline, unsafe-eval, wildcards)
- CORS misconfigurations
- Missing HTTPS/TLS
- Console errors indicating security issues

**Q: Which CAPTCHA providers are detected?**

- Google reCAPTCHA v2/v3
- hCaptcha
- Cloudflare Turnstile
- AWS WAF CAPTCHA
- Akamai Bot Manager

**Q: Can it bypass CAPTCHAs?**

No. SpiderPlugin detects CAPTCHAs but doesn't solve them. For CAPTCHA-protected pages, consider:
- Cookie farming (maintain logged-in sessions)
- Human behavior simulation (reduce CAPTCHA triggers)
- Manual CAPTCHA solving services (not included)

---

### Performance

**Q: How do I speed up crawling?**

1. Use `minimal` or `basic` presets
2. Block images/fonts: `performance: { blockImages: true }`
3. Increase concurrency with matching pool size
4. Use headless mode (default)

**Q: What are Core Web Vitals?**

Google's page experience metrics:
- **LCP** (Largest Contentful Paint): < 2.5s good
- **FID** (First Input Delay): < 100ms good
- **CLS** (Cumulative Layout Shift): < 0.1 good

---

### Distributed Crawling

**Q: How does distributed crawling work?**

Multiple workers share the same S3-based queue:
1. All workers use same `namespace`
2. Each worker has unique `workerId`
3. S3Queue handles distributed locking
4. Jobs are automatically balanced

**Q: Can workers run on different machines?**

Yes. As long as all workers have access to the same S3 bucket and use the same namespace, they can run anywhere.

**Q: What if a worker crashes mid-task?**

The task's `visibilityTimeout` expires and it's re-queued for another worker. Configure `maxRetries` to limit retry attempts.

---

### Storage & Data

**Q: Where are results stored?**

When persistence is enabled, results go to S3 resources:
- `{namespace}_results` - Main crawl results
- `{namespace}_seo_analysis` - SEO data
- `{namespace}_tech_fingerprint` - Technology detection
- `{namespace}_security_analysis` - Security findings
- `{namespace}_screenshots` - Captured screenshots
- `{namespace}_content_analysis` - iFrames, tracking
- `{namespace}_storage_analysis` - Browser storage

**Q: How do I export results?**

```javascript
const results = await spider.getResults();
const json = JSON.stringify(results, null, 2);
fs.writeFileSync('results.json', json);

// Or stream to CSV
for (const result of results) {
  console.log(`${result.url},${result.seoScore?.percentage}`);
}
```

**Q: How long are results kept?**

Until you delete them or TTL expires. Configure TTL for automatic cleanup:

```javascript
ttl: { enabled: true, queue: { ttl: 604800000 } }  // 7 days
```

---

### Troubleshooting

**Q: Why is my crawler being blocked?**

Common reasons:
1. No stealth mode → enable `stealth: { enabled: true }`
2. Too fast → reduce concurrency, add delays
3. Same IP → use proxy rotation
4. Bot-like behavior → enable human simulation

**Q: Why are some activities not running?**

Check your activity list or preset. Only specified activities run:

```javascript
// This only runs seo_meta_tags
await spider.enqueueTarget({
  url: '...',
  activities: ['seo_meta_tags']
});

// To run everything, omit activities or use 'full'
await spider.enqueueTarget({ url: '...' });
await spider.enqueueTarget({ url: '...', activityPreset: 'full' });
```

**Q: Why is memory usage high?**

1. Browser pool too large → reduce `maxBrowsers`
2. Too many concurrent tabs → reduce `maxTabsPerBrowser`
3. Not blocking resources → enable `blockImages: true`
4. Screenshots too large → reduce quality or use viewport only

**Q: How do I debug issues?**

Enable debug logging:

```javascript
const spider = new SpiderPlugin({
  namespace: 'debug',
  logLevel: 'debug'  // Shows detailed logs
});
```

---

## 🔗 See Also

- [PuppeteerPlugin](./puppeteer/README.md) - Browser automation details
- [S3QueuePlugin](./s3-queue.md) - Distributed queue internals
- [TTLPlugin](./ttl.md) - Automatic cleanup

---

## License

MIT - Same as s3db.js

---

**Made with ❤️ for the s3db.js community**

🕷️ **Happy crawling!**
