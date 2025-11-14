# 🕷️ SpiderPlugin Documentation

Complete documentation for the SpiderPlugin - an all-in-one web crawler suite bundling Puppeteer, S3Queue, and TTL for distributed crawling workloads.

## 📚 Documentation Index

### Main Documentation
- **[main.md](./main.md)** - Complete SpiderPlugin documentation
  - ⚡ TLDR and quickstart
  - Usage journey (5 levels)
  - Configuration reference
  - API reference
  - Best practices
  - Error handling
  - Comprehensive FAQ

### Feature Documentation
- **Activities** - [See main.md: Available Activities](#available-activities)
  - Visual capture (screenshots)
  - Security analysis (headers, CSP, CORS)
  - SEO analysis (meta tags, Open Graph)
  - Technology fingerprinting
  - Performance metrics
  - Storage analysis (localStorage, IndexedDB)
  - Content analysis (iframes, tracking pixels)

### Quick Links
- [← Back to Plugin Index](../README.md)
- [Configuration Reference](./main.md#-configuration-reference)
- [API Reference](./main.md#-api-reference)
- [FAQ Section](./main.md#-faq)
- [Best Practices](./main.md#-best-practices)
- [Error Handling](./main.md#-error-handling)

---

## 🚀 Quick Start

```javascript
import { Database } from 's3db.js';
import { SpiderPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://key:secret@bucket/path' });

const spider = new SpiderPlugin({
  namespace: 'crawler',
  queue: { autoStart: true, concurrency: 3 },
  processor: async (task, context, { puppeteer }) => {
    const page = await puppeteer.open(task.url);
    const title = await page.title();
    await page.close();
    return { url: task.url, title };
  }
});

await db.usePlugin(spider);
await db.connect();

// Enqueue targets
await spider.enqueueTarget({ url: 'https://example.com' });
```

---

## 📊 What You Can Capture

### Visual Data
- Full page screenshots
- Viewport screenshots
- Visual regression detection

### Content Analysis
- Page structure and DOM
- All links on page
- Embedded resources
- **iframe detection & categorization** (advertising, analytics, social, embedded content)
- **Tracking pixels detection** (30+ services)

### Storage Analysis
- **localStorage** extraction
- **sessionStorage** extraction
- **IndexedDB** structure and metadata

### Security Data
- HTTP security headers
- Content Security Policy (CSP)
- CORS configuration
- Cross-Origin-Opener-Policy
- WebSocket connections
- SSL/TLS certificate info
- DNS records (A, MX, TXT, NS, SOA)
- Security DNS (DNSSEC, DMARC, SPF, DKIM)

### Anti-Bot & Detection
- **Bot detection services** (Cloudflare, reCAPTCHA, etc.)
- **Browser fingerprinting** capabilities
- **Automation signatures** detection

### Technology & SEO
- Framework detection (100+ technologies)
- JavaScript libraries and versions
- Analytics platforms
- CDN detection
- Meta tags and meta descriptions
- Open Graph tags
- Twitter Card tags
- Canonical URLs
- Language specification

### Performance Metrics
- Core Web Vitals (CLS, FID, LCP)
- Navigation timing
- Resource timing
- Memory usage
- DOM size
- Script execution time

---

## 🎯 Activity System

The plugin supports 40+ **activities** organized into categories:

**Visual Activities:**
- `screenshot_full` - Full page screenshot
- `screenshot_viewport` - Viewport screenshot

**Security Activities:**
- `security_headers` - HTTP security headers
- `security_csp` - Content Security Policy
- `security_cors` - CORS configuration
- `security_websockets` - WebSocket detection
- `security_dns` - DNS records
- `security_dns_secure` - DNSSEC, DMARC, SPF, DKIM
- `security_ssl_tls` - SSL/TLS certificates

**SEO Activities:**
- `seo_meta_tags` - Meta description, keywords
- `seo_opengraph` - Open Graph tags
- `seo_twitter_card` - Twitter Card tags
- `seo_canonical` - Canonical URL
- `seo_robots` - robots.txt analysis
- `seo_sitemap` - sitemap.xml analysis
- `seo_lang` - Language specification

**Technology Activities:**
- `technology_stack` - Framework & library detection
- `technology_analytics` - Analytics platforms
- `technology_cdn` - CDN detection

**Performance Activities:**
- `performance_cwv` - Core Web Vitals
- `performance_timing` - Navigation timing
- `performance_memory` - Memory usage
- `performance_resources` - Resource timing
- `performance_dom` - DOM metrics

**Storage Activities:**
- `storage_localstorage` - localStorage extraction
- `storage_sessionstorage` - sessionStorage extraction
- `storage_indexeddb` - IndexedDB analysis

**Content Activities:**
- `content_iframes` - iframe detection & categorization
- `content_tracking_pixels` - Tracking pixel detection

**Activity Presets:**
- `minimal` - Visual only (fastest)
- `basic` - Visual + headers + tech
- `security` - Security-focused
- `seo_complete` - SEO analysis
- `performance` - Performance metrics
- `reconnaissance` - Comprehensive (19 activities)
- `full` - All 40+ activities

---

## 📖 How to Use This Documentation

1. **New to SpiderPlugin?**
   - Start with the [Quickstart](./main.md#-quickstart) section
   - Read through [Level 1: Basic Crawling](./main.md#level-1-basic-crawling)

2. **Building a crawler?**
   - Check [Usage Journey](./main.md#usage-journey) for progressive complexity
   - Review [Configuration Examples](./main.md#-configuration-examples)

3. **Need specific features?**
   - Search for your use case in [Configuration Examples](./main.md#-configuration-examples)
   - Check [Available Activities](./main.md#available-activities)

4. **Troubleshooting?**
   - See [Error Handling](./main.md#-error-handling)
   - Check [FAQ](./main.md#-faq)
   - Review [Best Practices](./main.md#-best-practices)

5. **Production deployment?**
   - Review [Level 5: Production Setup](./main.md#level-5-production-setup)
   - Check [Best Practices](./main.md#-best-practices)
   - Read [Error Handling](./main.md#-error-handling)

---

## 🔑 Key Concepts

### Activities System
Configurable units of work that can be selectively executed per URL:
- Each activity captures specific data
- Mix and match any combination
- Use presets for common patterns
- Automatically organized into categories

### Distributed Architecture
- **Queue**: S3Queue for distributed task management
- **Browser Pool**: Puppeteer pool for concurrent page analysis
- **TTL Management**: Automatic cleanup of stale tasks
- **Horizontal Scaling**: Multiple workers across machines

### Flexible Processor
Custom business logic for each crawled URL:
```javascript
processor: async (task, context, { puppeteer, queue, ttl }) => {
  // Access browser, queue, TTL helper methods
  // Return custom data structure
}
```

---

## 💡 Common Patterns

### Reconnaissance Crawl
```javascript
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'reconnaissance'  // 19 key activities
});
```

### Security Audit
```javascript
await spider.enqueueTarget({
  url: 'https://example.com',
  activities: [
    'screenshot_full',
    'security_headers',
    'security_csp',
    'security_websockets',
    'storage_localstorage',
    'storage_indexeddb',
    'content_tracking_pixels'
  ]
});
```

### SEO Analysis
```javascript
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'seo_complete'
});
```

### Performance Check
```javascript
await spider.enqueueTarget({
  url: 'https://example.com',
  activityPreset: 'performance'
});
```

---

## 📞 Support & Feedback

- **Report Issues**: [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
- **Discussions**: [GitHub Discussions](https://github.com/forattini-dev/s3db.js/discussions)
- **Documentation**: [s3db.js Documentation](https://s3db.js)

---

**Documentation Version:** 1.0.0
**Last Updated:** November 2024
**SpiderPlugin Version:** 1.0.0+

🕷️ **Happy crawling!**
