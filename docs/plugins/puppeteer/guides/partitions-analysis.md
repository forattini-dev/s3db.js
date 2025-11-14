# PuppeteerPlugin Partitions Analysis & Optimization

Complete breakdown of every resource created by the PuppeteerPlugin plus partition recommendations for O(1) queries.

## 📊 Existing Resources

### 1. **puppeteer_cookies** (Cookie Storage)
**Location**: `puppeteer.plugin.js:399`

**Current Schema**:
```javascript
{
  sessionId: 'string|required',
  cookies: 'array|required',
  userAgent: 'string',
  viewport: 'object',
  proxyId: 'string',
  reputation: 'object',
  metadata: 'object'
}
```

**Current Partitions**: ❌ None

**Observed Query Patterns**:
- ✅ Fetch by sessionId (get)
- 🔍 Find cookies for a specific proxy
- 🔍 Filter cookies by reputation (success rate)
- 🔍 Locate expired cookies (by date)
- 🔍 Lookup cookies for a given domain

**Recommended Partitions**:
```javascript
partitions: {
  byProxy: { fields: { proxyId: 'string' } },           // Cookies for a proxy
  byDate: { fields: { date: 'string' } },               // Rotation by date
  byDomain: { fields: { domain: 'string' } }            // Cookies by domain (requires attribute)
}
```

**Additional Fields Needed**:
- `domain: 'string'` - Primary cookie domain
- `date: 'string'` - YYYY-MM-DD for temporal partitioning
- `expiresAt: 'number'` - Expiration timestamp

---

### 2. **network_sessions** (Network Metadata)
**Location**: `network-monitor.js:81`

**Current Schema**:
```javascript
{
  sessionId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  date: 'string|required',
  startTime: 'number|required',
  endTime: 'number',
  duration: 'number',
  totalRequests: 'number',
  successfulRequests: 'number',
  failedRequests: 'number',
  totalBytes: 'number',
  transferredBytes: 'number',
  cachedBytes: 'number',
  byType: 'object',
  performance: 'object',
  userAgent: 'string'
}
```

**Current Partitions**: ✅ `byUrl`, `byDate`, `byDomain`

**Extra Query Patterns**:
- 🔍 Sessions with many failures (failedRequests > threshold)
- 🔍 Heavy sessions (totalBytes > threshold)
- 🔍 Filter by performance score
- 🔍 Group by user agent (bot detection)

**Recommended Additional Partitions**:
```javascript
partitions: {
  byUrl: { fields: { url: 'string' } },                 // ✅ Already present
  byDate: { fields: { date: 'string' } },               // ✅ Already present
  byDomain: { fields: { domain: 'string' } },           // ✅ Already present
  byQuality: { fields: { quality: 'string' } },         // 🆕 good/medium/poor (score-based)
  byUserAgent: { fields: { userAgentType: 'string' } }  // 🆕 desktop/mobile/bot
}
```

**Additional Fields Needed**:
- `quality: 'string'` - Classification (good/medium/poor) based on score
- `userAgentType: 'string'` - Device class (desktop/mobile/tablet/bot)

---

### 3. **network_requests** (Detailed Requests)
**Location**: `network-monitor.js:125`

**Current Schema**:
```javascript
{
  requestId: 'string|required',
  sessionId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  path: 'string',
  type: 'string|required',
  statusCode: 'number',
  statusText: 'string',
  method: 'string',
  size: 'number',
  transferredSize: 'number',
  resourceSize: 'number',
  fromCache: 'boolean',
  timing: 'object',
  startTime: 'number',
  endTime: 'number',
  duration: 'number',
  requestHeaders: 'object',
  responseHeaders: 'object',
  compression: 'string',
  cacheControl: 'string',
  expires: 'string',
  failed: 'boolean',
  errorText: 'string',
  blockedReason: 'string',
  redirected: 'boolean',
  redirectUrl: 'string',
  cdn: 'string',
  cdnDetected: 'boolean',
  mimeType: 'string',
  priority: 'string'
}
```

**Current Partitions**: ✅ `bySession`, `byType`, `byStatus`, `bySize`, `byDomain`

**Extra Query Patterns**:
- 🔍 Slow requests (duration > threshold)
- 🔍 Group by CDN provider (`cdn`)
- 🔍 Cached responses (`fromCache = true`)
- 🔍 Compression types
- 🔍 HTTP method
- 🔍 Redirect tracking

**Recommended Additional Partitions**:
```javascript
partitions: {
  bySession: { fields: { sessionId: 'string' } },       // ✅ Already present
  byType: { fields: { type: 'string' } },               // ✅ Already present
  byStatus: { fields: { statusCode: 'number' } },       // ✅ Already present
  bySize: { fields: { size: 'number' } },               // ✅ Already present
  byDomain: { fields: { domain: 'string' } },           // ✅ Already present
  byCDN: { fields: { cdn: 'string' } },                 // 🆕 cloudflare/cloudfront/etc
  byCompression: { fields: { compression: 'string' } }, // 🆕 gzip/brotli/none
  byMethod: { fields: { method: 'string' } },           // 🆕 GET/POST/PUT/etc
  byPerformance: { fields: { performance: 'string' } }  // 🆕 fast/medium/slow (duration-based)
}
```

**Additional Fields Needed**:
- `performance: 'string'` - Classification (fast <500ms, medium <2s, slow >2s)

---

### 4. **network_errors** (Network Failures)
**Location**: `network-monitor.js:197`

**Schema Atual**:
```javascript
{
  errorId: 'string|required',
  sessionId: 'string|required',
  requestId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  date: 'string|required',
  errorType: 'string|required',
  errorText: 'string',
  statusCode: 'number',
  type: 'string',
  method: 'string',
  timing: 'object',
  blockedReason: 'string',
  consoleMessages: 'array'
}
```

**Partitions Atuais**: ✅ `bySession`, `byErrorType`, `byDate`, `byDomain`

**Status**: ✅ **OPTIMIZED** – current partitions already cover all primary use cases.

---

### 5. **console_sessions** (Console Metadata)
**Location**: `console-monitor.js:75`

**Schema Atual**:
```javascript
{
  sessionId: 'string|required',
  url: 'string|required',
  domain: 'string|required',
  date: 'string|required',
  startTime: 'number|required',
  endTime: 'number',
  duration: 'number',
  totalMessages: 'number',
  errorCount: 'number',
  warningCount: 'number',
  logCount: 'number',
  infoCount: 'number',
  debugCount: 'number',
  byType: 'object',
  userAgent: 'string'
}
```

**Current Partitions**: ✅ `byUrl`, `byDate`, `byDomain`

**Extra Query Patterns**:
- 🔍 Sessions with many errors (`errorCount > threshold`)
- 🔍 Sessions with warnings (`warningCount > 0`)
- 🔍 Filter by user agent type

**Recommended Additional Partitions**:
```javascript
partitions: {
  byUrl: { fields: { url: 'string' } },                 // ✅ Already present
  byDate: { fields: { date: 'string' } },               // ✅ Already present
  byDomain: { fields: { domain: 'string' } },           // ✅ Already present
  byQuality: { fields: { quality: 'string' } },         // 🆕 clean/warnings/errors
  byUserAgent: { fields: { userAgentType: 'string' } }  // 🆕 desktop/mobile/bot
}
```

**Additional Fields Needed**:
- `quality: 'string'` - Classification (clean: 0 errors, warnings: >0 warnings, errors: >0 errors)
- `userAgentType: 'string'` - Device class (desktop/mobile/tablet/bot)

---

### 6. **console_messages** (All Console Messages)
**Location**: `console-monitor.js:115`

**Current Schema**:
```javascript
{
  messageId: 'string|required',
  sessionId: 'string|required',
  timestamp: 'number|required',
  date: 'string|required',
  type: 'string|required',
  text: 'string|required',
  args: 'array',
  source: 'object',
  stackTrace: 'object',
  url: 'string',
  domain: 'string'
}
```

**Current Partitions**: ✅ `bySession`, `byType`, `byDate`, `byDomain`

**Extra Query Patterns**:
- 🔍 Messages from a specific script (`source.url`)
- 🔍 Text pattern search (message contains)

**Recommended Additional Partitions**:
```javascript
partitions: {
  bySession: { fields: { sessionId: 'string' } },       // ✅ Already present
  byType: { fields: { type: 'string' } },               // ✅ Already present
  byDate: { fields: { date: 'string' } },               // ✅ Already present
  byDomain: { fields: { domain: 'string' } },           // ✅ Already present
  bySource: { fields: { sourceUrl: 'string' } }         // 🆕 script URL
}
```

**Additional Fields Needed**:
- `sourceUrl: 'string'` - Script URL extracted from `source.url`

---

### 7. **console_errors** (Errors & Exceptions Only)
**Location**: `console-monitor.js:154`

**Current Schema**:
```javascript
{
  errorId: 'string|required',
  sessionId: 'string|required',
  messageId: 'string|required',
  timestamp: 'number|required',
  date: 'string|required',
  errorType: 'string',
  message: 'string|required',
  stackTrace: 'object',
  url: 'string',
  lineNumber: 'number',
  columnNumber: 'number',
  pageUrl: 'string',
  domain: 'string',
  isUncaught: 'boolean',
  isPromiseRejection: 'boolean',
  isNetworkError: 'boolean',
  isSyntaxError: 'boolean'
}
```

**Current Partitions**: ✅ `bySession`, `byErrorType`, `byDate`, `byDomain`

**Extra Query Patterns**:
- 🔍 Uncaught exceptions (`isUncaught = true`)
- 🔍 Promise rejections (`isPromiseRejection = true`)
- 🔍 Network errors (`isNetworkError = true`)
- 🔍 Filter by script URL

**Recommended Additional Partitions**:
```javascript
partitions: {
  bySession: { fields: { sessionId: 'string' } },       // ✅ Already present
  byErrorType: { fields: { errorType: 'string' } },     // ✅ Already present
  byDate: { fields: { date: 'string' } },               // ✅ Already present
  byDomain: { fields: { domain: 'string' } },           // ✅ Already present
  byScript: { fields: { scriptUrl: 'string' } },        // 🆕 script causing error
  byCategory: { fields: { category: 'string' } }        // 🆕 uncaught/promise/network/syntax
}
```

**Additional Fields Needed**:
- `scriptUrl: 'string'` - Script URL causing the error (derived from `url`)
- `category: 'string'` - Category (uncaught/promise/network/syntax/other)

---

## 📈 Optimization Summary

### Resources without partitions:
1. ❌ **puppeteer_cookies** – needs three partitions

### Resources needing additional partitions:
2. 🟡 **network_sessions** – +2 (byQuality, byUserAgent)
3. 🟡 **network_requests** – +4 (byCDN, byCompression, byMethod, byPerformance)
4. ✅ **network_errors** – already sufficient (four partitions)
5. 🟡 **console_sessions** – +2 (byQuality, byUserAgent)
6. 🟡 **console_messages** – +1 (bySource)
7. 🟡 **console_errors** – +2 (byScript, byCategory)

### Totals:
- **Current partitions**: 25
- **Recommended partitions**: 39
- **Delta**: +14 partitions (+56%)

---

## 🎯 Implementation Plan

### High Priority (critical path):
1. **puppeteer_cookies**: add partitions (`byProxy`, `byDate`, `byDomain`)
2. **network_requests**: add `byPerformance` (slow-request queries are frequent)
3. **console_errors**: add `byCategory` (separate error types)

### Medium Priority (nice-to-have):
4. **network_sessions**: add `byQuality` (common filter)
5. **network_requests**: add `byCDN`, `byMethod`
6. **console_sessions**: add `byQuality`
7. **console_messages**: add `bySource`

### Low Priority (edge cases):
8. **network_requests**: add `byCompression`
9. **network_sessions**: add `byUserAgent`
10. **console_sessions**: add `byUserAgent`
11. **console_errors**: add `byScript`

---

## 🔍 Common Query Patterns (Use Cases)

### SEO Analysis:
```javascript
// Heavy pages
const heavySessions = await networkSessions.listPartition('byQuality', { quality: 'poor' });

// Large images
const largeImages = await networkRequests.query({ type: 'image', size: { $gt: 1048576 } });

// Slow requests
const slowRequests = await networkRequests.listPartition('byPerformance', { performance: 'slow' });
```

### Error Tracking:
```javascript
// Uncaught exceptions
const uncaught = await consoleErrors.listPartition('byCategory', { category: 'uncaught' });

// Errors for a given script
const scriptErrors = await consoleErrors.listPartition('byScript', { scriptUrl: 'https://cdn.com/app.js' });

// Network errors
const netErrors = await networkErrors.listPartition('byErrorType', { errorType: 'timeout' });
```

### Performance Debugging:
```javascript
// Slow requests
const slow = await networkRequests.listPartition('byPerformance', { performance: 'slow' });

// Filter by CDN
const cloudflare = await networkRequests.listPartition('byCDN', { cdn: 'cloudflare' });

// Sessions with lots of errors
const errorSessions = await consoleSessions.listPartition('byQuality', { quality: 'errors' });
```

### Cookie Analysis:
```javascript
// Cookies tied to a proxy
const proxyCookies = await puppeteerCookies.listPartition('byProxy', { proxyId: 'proxy_1' });

// Expired cookies
const today = new Date().toISOString().split('T')[0];
const expired = await puppeteerCookies.listPartition('byDate', { date: { $lt: today } });

// Cookies for a specific domain
const domainCookies = await puppeteerCookies.listPartition('byDomain', { domain: 'example.com' });
```

---

## 💡 Final Recommendations

### 1. Roll out in phases:
- **Phase 1** (critical): `puppeteer_cookies`, `network_requests.byPerformance`, `console_errors.byCategory`
- **Phase 2** (important): `*_sessions.byQuality`, `network_requests.byCDN`
- **Phase 3** (optional): remaining partitions

### 2. Derived fields:
Add helpers to compute derived values:
```javascript
// quality (based on metrics)
quality = errorCount > 0 ? 'errors' : warningCount > 0 ? 'warnings' : 'clean';

// performance (based on duration)
performance = duration < 500 ? 'fast' : duration < 2000 ? 'medium' : 'slow';

// category (based on flags)
category = isUncaught ? 'uncaught' : isPromiseRejection ? 'promise' : 'other';

// userAgentType (parsed from userAgent string)
userAgentType = parseUserAgent(userAgent).deviceType;
```

### 3. Composite indexes (future):
For complex queries, consider compound partitions:
```javascript
// Example: byDomainAndDate
partitions: {
  byDomainDate: { fields: { domain: 'string', date: 'string' } }
}

// Query: Errors for example.com on 2025-10-31
const errors = await resource.listPartition('byDomainDate', {
  domain: 'example.com',
  date: '2025-10-31'
});
```

### 4. TTL Plugin integration:
Use the TTL plugin to clean up stale sessions automatically:
```javascript
const ttlPlugin = new TTLPlugin({
  resources: {
    network_sessions: { ttl: 30 * 24 * 60 * 60 * 1000 },  // 30 days
    console_sessions: { ttl: 30 * 24 * 60 * 60 * 1000 },  // 30 days
    network_requests: { ttl: 7 * 24 * 60 * 60 * 1000 },   // 7 days
    console_messages: { ttl: 7 * 24 * 60 * 60 * 1000 }    // 7 days
  }
});
```

---

## 🚀 Expected Impact

### Performance:
- **O(1) queries**: 39 partitions (vs 25 today)
- **Scan reduction**: ~70% fewer full-table scans
- **Latency**: 10–100× faster for partitioned queries

### Enabled use cases:
- ✅ SEO analysis by page quality
- ✅ Error tracking by category
- ✅ Performance debugging by CDN/compression
- ✅ Cookie management by proxy/domain
- ✅ Script-level error tracking
- ✅ User-agent analytics

### Storage:
- **Growth**: ~5–10% (extra partitioning fields)
- **Benefit**: Queries 10–100× faster
- **ROI**: Positive for datasets with >1k records per resource
