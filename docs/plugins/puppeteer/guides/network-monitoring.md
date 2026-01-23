# Network Monitoring with Chrome DevTools Protocol

Comprehensive network activity tracking system integrated with PuppeteerPlugin using CDP (Chrome DevTools Protocol).

## Overview

NetworkMonitor captures **ALL** network activity including:
- Request/Response data (headers, timing, sizes, status codes)
- Resource types (image, script, stylesheet, xhr, fetch, websocket, etc.)
- Failed requests (errors, timeouts, blocked resources, CSP violations)
- CDN detection (Cloudflare, CloudFront, Fastly, Akamai)
- Compression analysis (gzip, brotli, deflate)
- Cache behavior (hits, misses, cache-control headers)
- Timing breakdown (DNS, TCP, TLS, request, response)

## Quick Start

```javascript
import { Database } from 's3db.js';
import { PuppeteerPlugin } from 's3db.js';

const db = new Database({ connectionString: '...' });
await db.connect();

const puppeteerPlugin = new PuppeteerPlugin({
  networkMonitor: {
    enabled: true,
    persist: true  // Save to S3DB
  }
});

await db.installPlugin(puppeteerPlugin);
await db.start();

// Start monitoring
const page = await puppeteerPlugin.navigate('https://example.com');
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);

// Wait for page load
await page.waitForLoadState('networkidle');

// Stop and get results
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

console.log(`Total requests: ${result.stats.totalRequests}`);
console.log(`Total size: ${result.stats.totalBytes / 1024}KB`);
console.log(`Failed: ${result.stats.failedRequests}`);

await page.close();
```

## Configuration

```javascript
networkMonitor: {
  // Enable network monitoring (disabled by default due to overhead)
  enabled: false,

  // Persist to S3DB (creates network_sessions, network_requests, network_errors)
  persist: false,

  // Filtering options
  filters: {
    // Only specific resource types (null = all)
    types: ['image', 'script'],  // or null

    // Only specific status codes (null = all)
    statuses: [404, 500],  // or null

    // Minimum size in bytes
    minSize: 10240,  // Only >= 10KB

    // Maximum size in bytes
    maxSize: 1048576,  // Only <= 1MB

    // Always save failed requests regardless of filters
    saveErrors: true,

    // Always save large assets (> 1MB) regardless of filters
    saveLargeAssets: true
  },

  // Compression settings
  compression: {
    enabled: true,
    threshold: 10240  // Compress payloads > 10KB
  }
}
```

## S3DB Schema

### network_sessions

Session metadata for each monitored page:

```javascript
{
  sessionId: 'session_1234567890_abc123',
  url: 'https://example.com',
  domain: 'example.com',
  date: '2025-10-31',  // YYYY-MM-DD for partitioning
  startTime: 1730000000000,
  endTime: 1730000010000,
  duration: 10000,

  // Statistics
  totalRequests: 45,
  successfulRequests: 43,
  failedRequests: 2,
  totalBytes: 2456789,
  transferredBytes: 1234567,
  cachedBytes: 456789,

  // By type breakdown
  byType: {
    image: { count: 12, size: 678901, transferredSize: 345678 },
    script: { count: 15, size: 1234567, transferredSize: 678901 },
    stylesheet: { count: 8, size: 345678, transferredSize: 123456 }
  },

  // Performance metrics (if includePerformance: true)
  performance: {
    score: 85,
    lcp: 2453,
    cls: 0.045,
    fcp: 1230
  },

  userAgent: 'Mozilla/5.0...'
}
```

**Partitions:**
- `byUrl` - Fast lookup by URL
- `byDate` - Query by date range
- `byDomain` - Group by domain

### network_requests

Detailed information for each request:

```javascript
{
  requestId: 'req_1234567890_abc123',
  sessionId: 'session_1234567890_abc123',
  url: 'https://example.com/image.jpg',
  domain: 'example.com',
  path: '/image.jpg',

  // Type and status
  type: 'image',  // image, script, stylesheet, xhr, fetch, etc.
  statusCode: 200,
  statusText: 'OK',
  method: 'GET',

  // Size information (bytes)
  size: 245678,         // Total size
  transferredSize: 123456,  // Bytes transferred (after compression)
  resourceSize: 245678,     // Uncompressed size
  fromCache: false,

  // Timing (milliseconds)
  timing: {
    dns: 45,
    tcp: 32,
    ssl: 28,
    request: 156,
    response: 89,
    total: 350
  },
  startTime: 1730000001000,
  endTime: 1730000001350,
  duration: 350,

  // Headers (compressed - cookies removed)
  requestHeaders: { 'user-agent': '...', 'accept': '...' },
  responseHeaders: { 'content-type': 'image/jpeg', 'cache-control': 'max-age=86400' },

  // Compression
  compression: 'gzip',  // gzip, br (brotli), deflate, none

  // Cache headers
  cacheControl: 'public, max-age=86400',
  expires: 'Wed, 01 Nov 2025 12:00:00 GMT',

  // Error info (if failed)
  failed: false,
  errorText: null,
  blockedReason: null,  // csp, mixed-content, etc.

  // Redirects
  redirected: false,
  redirectUrl: null,

  // CDN
  cdn: 'cloudflare',  // cloudflare, cloudfront, fastly, akamai, etc.
  cdnDetected: true,

  // Additional metadata
  mimeType: 'image/jpeg',
  priority: 'High'  // VeryHigh, High, Medium, Low, VeryLow
}
```

**Partitions:**
- `bySession` - Fast lookup for session's requests
- `byType` - Query all images, scripts, etc.
- `byStatus` - Find 404s, 500s, etc.
- `bySize` - Find large assets
- `byDomain` - Group by domain

### network_errors

Failed requests only:

```javascript
{
  errorId: 'error_req_1234567890_abc123',
  sessionId: 'session_1234567890_abc123',
  requestId: 'req_1234567890_abc123',
  url: 'https://example.com/missing.js',
  domain: 'example.com',
  date: '2025-10-31',

  // Error details
  errorType: 'failed',  // dns, connection, timeout, ssl, certificate, blocked, failed, aborted
  errorText: 'net::ERR_CONNECTION_REFUSED',
  statusCode: null,

  // Context
  type: 'script',
  method: 'GET',
  timing: { dns: 0, tcp: 0, total: 100 },

  // Additional info
  blockedReason: null,
  consoleMessages: ['Uncaught ReferenceError: foo is not defined']  // Related console errors
}
```

**Partitions:**
- `bySession` - Errors for specific session
- `byErrorType` - Group by error type
- `byDate` - Query errors by date
- `byDomain` - Domain-specific errors

## Usage Examples

### 1. Basic Monitoring (No Persistence)

```javascript
const puppeteerPlugin = new PuppeteerPlugin({
  networkMonitor: {
    enabled: true,
    persist: false  // Just collect, don't save
  }
});

const page = await puppeteerPlugin.navigate('https://example.com');
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);

await page.waitForLoadState('networkidle');

const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

console.log('Statistics:', result.stats);
console.log('Requests:', result.requests);
console.log('Failures:', result.failures);
```

### 2. Filtered Monitoring (Images Only)

```javascript
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page, {
  filters: {
    types: ['image'],
    minSize: 10240  // Only images > 10KB
  }
});
```

### 3. Persistence and Querying

```javascript
const puppeteerPlugin = new PuppeteerPlugin({
  networkMonitor: {
    enabled: true,
    persist: true  // ✅ Save to S3DB
  }
});

// Monitor and save
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
await page.waitForLoadState('networkidle');
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

// Query back from S3DB
const savedSession = await puppeteerPlugin.networkMonitor.getSessionStats(result.sessionId);
const requests = await puppeteerPlugin.networkMonitor.getSessionRequests(result.sessionId);
const errors = await puppeteerPlugin.networkMonitor.getSessionErrors(result.sessionId);

console.log(`Saved ${requests.length} requests to S3DB`);
```

### 4. Error Tracking

```javascript
const puppeteerPlugin = new PuppeteerPlugin({
  networkMonitor: {
    enabled: true,
    persist: true,
    filters: {
      saveErrors: true,  // Always save errors
      types: null  // Track all resource types
    }
  }
});

const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
await page.waitForLoadState('networkidle');
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

if (result.failures.length > 0) {
  console.log('Errors detected:');
  result.failures.forEach(error => {
    console.log(`  ${error.url} - ${error.errorText}`);
  });

  // Query errors from S3DB
  const savedErrors = await puppeteerPlugin.networkMonitor.getSessionErrors(result.sessionId);
  console.log(`Saved ${savedErrors.length} errors to database`);
}
```

### 5. Performance Integration

```javascript
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session, {
  includePerformance: true  // Include PerformanceManager metrics
});

console.log(`Performance Score: ${result.performance.score}/100`);
console.log(`LCP: ${result.performance.coreWebVitals.lcp}ms`);
console.log(`Total Size: ${result.stats.totalBytes / 1024}KB`);
```

## Use Cases

### 1. SEO Analysis

Track page weight, compression, and resource optimization:

```javascript
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
await page.waitForLoadState('networkidle');
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

// Page weight analysis
const totalSize = result.stats.totalBytes;
const imageSize = result.stats.byType.image?.size || 0;
const scriptSize = result.stats.byType.script?.size || 0;

console.log(`Total Size: ${(totalSize / 1024).toFixed(0)}KB`);
console.log(`Images: ${(imageSize / 1024).toFixed(0)}KB (${((imageSize / totalSize) * 100).toFixed(0)}%)`);
console.log(`Scripts: ${(scriptSize / 1024).toFixed(0)}KB (${((scriptSize / totalSize) * 100).toFixed(0)}%)`);

// Compression analysis
const compressed = result.requests.filter(r => r.compression !== 'none').length;
const compressionRate = (compressed / result.requests.length * 100).toFixed(0);
console.log(`Compression Rate: ${compressionRate}%`);

// CDN analysis
const cdnRequests = result.requests.filter(r => r.cdnDetected).length;
const cdnRate = (cdnRequests / result.requests.length * 100).toFixed(0);
console.log(`CDN Usage: ${cdnRate}%`);
```

### 2. Performance Debugging

Find slow requests and bottlenecks:

```javascript
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
await page.waitForLoadState('networkidle');
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

// Find slowest requests
const slowRequests = result.requests
  .filter(r => r.duration > 1000)  // > 1s
  .sort((a, b) => b.duration - a.duration);

console.log('Slow requests:');
slowRequests.forEach(req => {
  console.log(`  ${req.duration}ms - ${req.url}`);
  console.log(`    DNS: ${req.timing.dns}ms | TCP: ${req.timing.tcp}ms | Response: ${req.timing.response}ms`);
});

// Find large transfers
const largeTransfers = result.requests
  .filter(r => r.transferredSize > 1024 * 1024)  // > 1MB
  .sort((a, b) => b.transferredSize - a.transferredSize);

console.log('Large transfers:');
largeTransfers.forEach(req => {
  console.log(`  ${(req.transferredSize / 1024 / 1024).toFixed(2)}MB - ${req.url}`);
});
```

### 3. Security Auditing

Track CSP violations, mixed content, SSL errors:

```javascript
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
await page.waitForLoadState('networkidle');
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

// Find blocked requests
const blocked = result.failures.filter(f => f.blockedReason);
if (blocked.length > 0) {
  console.log('Blocked requests:');
  blocked.forEach(req => {
    console.log(`  ${req.url}`);
    console.log(`    Reason: ${req.blockedReason}`);
  });
}

// Find SSL errors
const sslErrors = result.failures.filter(f => f.errorText?.includes('ERR_SSL'));
if (sslErrors.length > 0) {
  console.log('SSL errors:');
  sslErrors.forEach(req => {
    console.log(`  ${req.url} - ${req.errorText}`);
  });
}
```

### 4. Cost Analysis

Calculate bandwidth usage and CDN costs:

```javascript
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
await page.waitForLoadState('networkidle');
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

// Total bandwidth
const totalBytes = result.stats.totalBytes;
const transferredBytes = result.stats.transferredBytes;
const compressionSavings = totalBytes - transferredBytes;

console.log(`Total Bandwidth: ${(transferredBytes / 1024 / 1024).toFixed(2)}MB`);
console.log(`Compression Savings: ${(compressionSavings / 1024 / 1024).toFixed(2)}MB`);

// CDN vs origin
const cdnBytes = result.requests
  .filter(r => r.cdnDetected)
  .reduce((sum, r) => sum + r.transferredSize, 0);

const originBytes = transferredBytes - cdnBytes;

console.log(`CDN: ${(cdnBytes / 1024 / 1024).toFixed(2)}MB`);
console.log(`Origin: ${(originBytes / 1024 / 1024).toFixed(2)}MB`);
```

### 5. A/B Testing

Compare network behavior between variants:

```javascript
const variants = ['control', 'variant-a'];
const results = {};

for (const variant of variants) {
  const page = await puppeteerPlugin.navigate(`https://site.com?variant=${variant}`);
  const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
  await page.waitForLoadState('networkidle');
  const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

  results[variant] = {
    totalRequests: result.stats.totalRequests,
    totalSize: result.stats.totalBytes,
    duration: result.duration
  };

  await page.close();
}

// Compare
const improvement = (results.control.totalSize - results['variant-a'].totalSize) / results.control.totalSize * 100;
console.log(`Variant A reduced size by ${improvement.toFixed(1)}%`);
```

## Query Patterns with Partitions

Partitions enable O(1) lookups instead of O(n) scans:

```javascript
// Query all images (byType partition)
const images = await puppeteerPlugin.networkMonitor.requestsResource.listPartition('byType', { type: 'image' });

// Query 404 errors (byStatus partition)
const errors404 = await puppeteerPlugin.networkMonitor.requestsResource.listPartition('byStatus', { statusCode: 404 });

// Query sessions for domain (byDomain partition)
const sessions = await puppeteerPlugin.networkMonitor.sessionsResource.listPartition('byDomain', { domain: 'example.com' });

// Query errors by type (byErrorType partition)
const timeouts = await puppeteerPlugin.networkMonitor.errorsResource.listPartition('byErrorType', { errorType: 'timeout' });

// Query errors by date (byDate partition)
const todayErrors = await puppeteerPlugin.networkMonitor.errorsResource.listPartition('byDate', { date: '2025-10-31' });
```

## Best Practices

### 1. Use Filters to Reduce Storage

```javascript
// Only save images and scripts
networkMonitor: {
  filters: {
    types: ['image', 'script']
  }
}

// Only save large assets
networkMonitor: {
  filters: {
    minSize: 1024 * 1024  // > 1MB
  }
}

// Only save errors
networkMonitor: {
  filters: {
    types: null,  // Track all types
    saveErrors: true,  // But only save errors
    statuses: null  // Clear status filter
  }
}
```

### 2. Enable Persistence Selectively

```javascript
// Production: No persistence (performance)
if (process.env.NODE_ENV === 'production') {
  networkMonitor.persist = false;
}

// Staging: Full persistence (debugging)
if (process.env.NODE_ENV === 'staging') {
  networkMonitor.persist = true;
}
```

### 3. Batch Processing for Large Crawls

```javascript
// For spider crawling many pages
const sessions = [];

for (const url of urls) {
  const page = await puppeteerPlugin.navigate(url);
  const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
  await page.waitForLoadState('networkidle');
  const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session);

  // Store summary only
  sessions.push({
    url,
    totalRequests: result.stats.totalRequests,
    totalBytes: result.stats.totalBytes,
    failedRequests: result.stats.failedRequests
  });

  await page.close();
}

// Analyze batch
const avgSize = sessions.reduce((sum, s) => sum + s.totalBytes, 0) / sessions.length;
console.log(`Average page size: ${(avgSize / 1024).toFixed(0)}KB`);
```

### 4. Combine with Performance Metrics

```javascript
const session = await puppeteerPlugin.networkMonitor.startMonitoring(page);
await page.waitForLoadState('networkidle');
const result = await puppeteerPlugin.networkMonitor.stopMonitoring(session, {
  includePerformance: true  // ✅ Get both network + performance
});

// Correlate network with performance
if (result.performance.score < 80 && result.stats.totalBytes > 3 * 1024 * 1024) {
  console.log('Poor performance likely due to large page size');
}
```

## API Reference

### `startMonitoring(page, options)`

Start monitoring network activity for a page.

**Parameters:**
- `page` (Page) - Puppeteer page instance
- `options` (Object) - Monitoring options
  - `sessionId` (string) - Custom session ID (default: auto-generated)
  - `persist` (boolean) - Override global persist setting (default: config.persist)
  - `filters` (Object) - Override global filters (default: config.filters)

**Returns:** Session object

### `stopMonitoring(session, options)`

Stop monitoring and optionally persist data.

**Parameters:**
- `session` (Object) - Session object from startMonitoring
- `options` (Object) - Stop options
  - `persist` (boolean) - Override session persist setting (default: session._persist)
  - `includePerformance` (boolean) - Include PerformanceManager metrics (default: true)

**Returns:** Final session data with requests array

### `getSessionStats(sessionId)`

Query session metadata from S3DB.

**Parameters:**
- `sessionId` (string) - Session ID

**Returns:** Session object

### `getSessionRequests(sessionId, filters)`

Query requests for a session from S3DB.

**Parameters:**
- `sessionId` (string) - Session ID
- `filters` (Object) - Query filters (optional)

**Returns:** Array of request objects

### `getSessionErrors(sessionId)`

Query errors for a session from S3DB.

**Parameters:**
- `sessionId` (string) - Session ID

**Returns:** Array of error objects

## Resource Types

NetworkMonitor tracks these resource types (from CDP):

- `document` - HTML documents
- `stylesheet` - CSS files
- `image` - Images (jpg, png, gif, webp, etc.)
- `media` - Video/audio
- `font` - Web fonts
- `script` - JavaScript files
- `texttrack` - Subtitles/captions
- `xhr` - XMLHttpRequest
- `fetch` - Fetch API requests
- `eventsource` - Server-Sent Events
- `websocket` - WebSocket connections
- `manifest` - Web app manifests
- `signedexchange` - Signed HTTP Exchanges
- `ping` - Ping/beacon requests
- `cspviolation` - CSP violation reports
- `preflight` - CORS preflight requests
- `other` - Other resource types

## Error Types

NetworkMonitor categorizes these error types:

- `dns` - DNS resolution failed (ERR_NAME_NOT_RESOLVED)
- `connection` - Connection failed (ERR_CONNECTION_*)
- `timeout` - Request timed out (ERR_TIMED_OUT)
- `ssl` - SSL/TLS errors (ERR_SSL_*)
- `certificate` - Certificate errors (ERR_CERT_*)
- `blocked` - Request blocked (ERR_BLOCKED_*)
- `failed` - Generic failure (ERR_FAILED)
- `aborted` - Request aborted (ERR_ABORTED)
- `other` - Other error types

## CDN Detection

Automatically detects these CDN providers:

- Cloudflare (`cf-ray` header, `cloudflare` server)
- CloudFront (`x-amz-cf-id` header, `cloudfront` in `x-cache`)
- Fastly (`fastly` in `server` or `via` headers)
- Akamai (`x-akamai-transformed`, `x-akamai-staging` headers)
- Generic (`x-cdn` header)

## Performance Considerations

### Overhead

Network monitoring adds minimal overhead:
- ~1-2% CPU increase (CDP event listeners)
- ~10-50MB memory (request tracking)
- ~100-500ms persistence time (batch inserts)

### Optimization Tips

1. **Disable when not needed**: Set `enabled: false` in production
2. **Use filters**: Only track what you need
3. **Batch persistence**: Enable `persist` only for sampling
4. **Compression**: Large payloads auto-compress (>10KB)
5. **Partitions**: Use partitions for fast queries

## Examples

See complete examples:
- `docs/examples/e96-puppeteer-network-monitoring.js` - Comprehensive demo

## Further Reading

- [Chrome DevTools Protocol - Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)
- [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Resource_Timing_API)
- [Navigation Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_timing_API)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
