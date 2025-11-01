# 🤖 Puppeteer Plugin Documentation

> **Enterprise-grade headless browser with human-like behavior and cookie farming**

---

## 📚 Documentation Index

This documentation covers the complete Puppeteer Plugin architecture, detailed specifications, and performance analysis.

### Core Documentation

- **[Main Plugin Documentation](../puppeteer.md)** - Complete user guide, features, and configuration
- **[Detailed Specification](./detailed-spec.md)** - Comprehensive API reference and DX helpers
- **[Partitions Analysis](./partitions-analysis.md)** - Resource optimization and partition strategies

### Additional Resources

- **[Spider Suite Roadmap](./spider-roadmap.md)** - Future enhancements and integration plans

---

## 🎯 Quick Navigation

### For Users
Start with the [Main Plugin Documentation](../puppeteer.md) for:
- Getting started guide
- Pool management
- Session handling
- Network monitoring
- Console capture
- Cookie management

### For Developers
Review the [Detailed Specification](./detailed-spec.md) for:
- Complete configuration schema
- DX helpers and events
- Browser pool management
- Human behavior simulation
- Cookie farming strategies
- Performance benchmarks

### For Performance Optimization
Check the [Partitions Analysis](./partitions-analysis.md) for:
- Resource structure
- Partition recommendations
- Query patterns
- Performance impact
- Storage optimization

---

## 🏗️ Architecture Overview

### Browser Pool Management

```
┌──────────────────────────────────────────────────────────┐
│                    Browser Pool Manager                   │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Browser 1  │  │  Browser 2  │  │  Browser 3  │     │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤     │
│  │ Tab 1 (busy)│  │ Tab 1 (idle)│  │ Tab 1 (busy)│     │
│  │ Tab 2 (idle)│  │ Tab 2 (busy)│  │ Tab 2 (idle)│     │
│  │ Tab 3 (busy)│  │ Tab 3 (idle)│  │ Tab 3 (busy)│     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                           │
│  Idle tabs are reused for new requests (10x faster!)     │
└──────────────────────────────────────────────────────────┘
```

### Cookie Farming Flow

```
┌──────────────────────────────────────────────────────────┐
│                    Cookie Farm Manager                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  1. Create Session                                        │
│     └─> Generate unique sessionId                        │
│                                                           │
│  2. Warmup (Optional)                                     │
│     ├─> Visit trusted sites (Google, YouTube)            │
│     ├─> Human-like interactions                          │
│     ├─> Build cookies & localStorage                     │
│     └─> Save to s3db (encrypted)                         │
│                                                           │
│  3. Track Reputation                                      │
│     ├─> Success rate (200 vs 403/429)                    │
│     ├─> Age (older = better)                             │
│     └─> Request count                                     │
│                                                           │
│  4. Rotation                                              │
│     ├─> Pick best cookie from pool                       │
│     ├─> Based on reputation + age                        │
│     └─> Retire low-performing cookies                    │
│                                                           │
│  5. Auto-save                                             │
│     └─> Save cookies after every navigation              │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 🔑 Key Features

### 1. Browser Pool Management
- **Reusable Browsers** - Minimize launch overhead
- **Tab Recycling** - 10x faster than creating new tabs
- **Idle Detection** - Automatic cleanup of unused resources
- **Configurable Limits** - Min/max browsers, tabs per browser
- **Lifecycle Management** - Auto-recycle after N tabs

### 2. Human Behavior Simulation
- **Mouse Movements** - Bezier curves, overshoot, jitter
- **Realistic Typing** - Mistakes, corrections, word pauses
- **Natural Scrolling** - Random stops, back-scrolling
- **Random Delays** - Mimic human reading time
- **Element Interaction** - Hover through intermediate elements

### 3. Cookie Farming & Session Management
- **Unlimited Storage** - Store cookies in s3db (not browser)
- **Session Persistence** - Share cookies across tabs/browsers
- **Warmup Strategy** - Build reputation before scraping
- **Rotation** - Automatic cookie rotation based on reputation
- **Reputation Tracking** - Success rate, age, request count

### 4. Stealth Mode (Anti-Detection)
- **Remove Automation** - Hide webdriver, Chrome headless markers
- **Fingerprint Randomization** - WebGL, canvas, audio
- **Realistic Plugins** - Navigator plugins, languages
- **Permissions** - Configurable geolocation, notifications, etc.
- **Timezone & Locale** - Match user agent location

### 5. Network & Console Monitoring
- **Request/Response Tracking** - Full network capture
- **Console Message Capture** - Errors, warnings, logs
- **Performance Metrics** - Page load times, resource sizes
- **Error Detection** - JavaScript errors, network failures
- **Historical Storage** - All data partitioned for O(1) queries

### 6. Performance Optimization
- **Resource Blocking** - Block images, CSS, ads, analytics
- **Cache Management** - Configurable cache size
- **Network Throttling** - Simulate slow connections
- **Tab Limits** - Control concurrent tab count
- **Timeout Management** - Prevent hanging operations

---

## 📊 Resource Structure

The PuppeteerPlugin creates 7 main resources with optimized partitions:

| Resource | Purpose | Partitions | Status |
|----------|---------|------------|--------|
| `puppeteer_cookies` | Cookie storage | byProxy, byDate, byDomain | 🟡 Needs partitions |
| `network_sessions` | Network metadata | byUrl, byDate, byDomain, byQuality | ✅ Optimized |
| `network_requests` | Detailed requests | bySession, byType, byStatus, byDomain | 🟡 +4 recommended |
| `network_errors` | Network failures | bySession, byErrorType, byDate, byDomain | ✅ Optimized |
| `console_sessions` | Console metadata | byUrl, byDate, byDomain | 🟡 +2 recommended |
| `console_messages` | All console messages | bySession, byType, byDate, byDomain | 🟡 +1 recommended |
| `console_errors` | Errors & exceptions only | bySession, byErrorType, byDate, byDomain | 🟡 +2 recommended |

**See [Partitions Analysis](./partitions-analysis.md) for complete optimization recommendations.**

---

## 📈 Performance Benchmarks

### Pool vs No Pool

| Operation | Without Pool | With Pool | Speedup |
|-----------|-------------|-----------|---------|
| **Launch Browser** | 3-5s | 0ms (reused) | ∞ |
| **New Tab** | 500-1000ms | 50-100ms | 10x |
| **Navigate** | 1-3s | 1-3s | 1x |
| **Screenshot** | 500ms | 500ms | 1x |
| **Total (100 pages)** | 6-10min | 2-3min | 3-5x |

### Resource Blocking Impact

| Feature | Speed Impact | Worth It? |
|---------|--------------|-----------|
| **Block Images** | +60-80% faster | ✅ YES (if you don't need images) |
| **Block CSS** | +20-30% faster | ⚠️ Maybe (can break layout) |
| **Block Fonts** | +10-15% faster | ✅ YES (if you don't need fonts) |
| **Human Behavior** | -10-20% slower | ✅ YES (avoids blocks) |
| **Stealth Mode** | -5-10% slower | ✅ YES (avoids detection) |

---

## 🎓 Best Practices

### 1. Always Use Sessions for Authenticated Sites

```javascript
// ❌ BAD: Lose cookies between requests
const page1 = await puppeteer.getPage();
await page1.goto('https://site.com/login');
await puppeteer.releasePage(page1);

const page2 = await puppeteer.getPage();
await page2.goto('https://site.com/dashboard');  // NOT LOGGED IN!

// ✅ GOOD: Use sessionId
const page1 = await puppeteer.getPage({ sessionId: 'user-123' });
await page1.goto('https://site.com/login');
await puppeteer.releasePage(page1);

const page2 = await puppeteer.getPage({ sessionId: 'user-123' });
await page2.goto('https://site.com/dashboard');  // LOGGED IN!
```

### 2. Use Human Behavior for Anti-Bot Sites

```javascript
// ❌ BAD: Detected as bot
await page.click('.button');
await page.type('#input', 'text');

// ✅ GOOD: Human-like
await page.humanClick('.button');
await page.humanType('#input', 'text');
await page.randomWait();
```

### 3. Block Resources for Speed

```javascript
// ✅ GOOD: 2-3x faster
const page = await puppeteer.getPage({
  block: {
    types: ['image', 'stylesheet', 'font'],
    domains: ['ads.*', 'analytics.*']
  }
});
```

### 4. Warmup New Sessions

```javascript
// ✅ GOOD: Better success rate
const page = await puppeteer.getPage({
  sessionId: 'new-user-001',
  warmup: true  // Visit trusted sites first
});
```

### 5. Monitor Cookie Reputation

```javascript
// ✅ GOOD: Know when cookies go bad
puppeteer.events.on('cookies:low-reputation', async (event) => {
  console.warn(`Session ${event.sessionId} has low reputation!`);

  // Create new session
  await puppeteer.createSession({
    sessionId: `replacement-${Date.now()}`,
    warmup: true
  });
});
```

---

## 🚨 Common Issues

### Browser Launch Fails

**Problem**: Browser won't start in Docker/headless environment

**Solution**:
```javascript
const puppeteer = new PuppeteerPlugin({
  launch: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});
```

### Memory Leaks

**Problem**: Memory usage keeps growing

**Solution**:
```javascript
const puppeteer = new PuppeteerPlugin({
  pool: {
    maxTabsPerBrowser: 5,       // Limit tabs per browser
    recycleAfter: 100,          // Recycle browser after N tabs
    idleTimeout: 300000,        // Close idle browsers after 5min
    closeOnIdle: true           // Enable idle closure
  }
});
```

### Pages Hang/Timeout

**Problem**: Pages never finish loading

**Solution**:
```javascript
const page = await puppeteer.getPage();

// Set navigation timeout
await page.goto('https://example.com', {
  timeout: 30000,              // 30 seconds max
  waitUntil: 'networkidle2'    // Wait for network to be mostly idle
});
```

### Detection by Anti-Bot Systems

**Problem**: Site blocks or CAPTCHAs appear

**Solution**:
```javascript
const page = await puppeteer.getPage({
  stealth: true,               // Enable all stealth features
  human: true,                 // Enable human behavior
  sessionId: 'warmed-up-001',  // Use warmed-up session
  warmup: false                // Already warmed up
});
```

---

## 🔗 Related Documentation

- [Plugin System Overview](../README.md)
- [Spider Suite Plugin](../spider-suite.md) - Puppeteer + S3Queue + TTL bundle
- [Cookie Farm Suite Plugin](../cookie-farm-suite.md) - Cookie farming bundle
- [S3Queue Plugin](../s3-queue.md) - Distributed task queue

---

## 📝 Examples

Check out complete examples in the repository:

- [Basic Scraping](../../examples/e51-puppeteer-basic.js)
- [Cookie Farming](../../examples/e52-puppeteer-cookies.js)
- [Human Behavior](../../examples/e53-puppeteer-human.js)
- [Network Monitoring](../../examples/e54-puppeteer-network.js)

---

## 🎯 DX Helpers

### `withSession()` Helper

Simplifies navigation and cleanup:

```javascript
// Old way (manual cleanup)
const page = await puppeteer.getPage({ sessionId: 'user-1' });
try {
  await page.goto('https://example.com');
  await page.humanClick('.button');
  // ... do stuff
} finally {
  await puppeteer.releasePage(page);
}

// New way (auto cleanup)
await puppeteer.withSession('user-1', async (page) => {
  await page.humanClick('.button');
  // ... do stuff
  // Auto cleanup on finish!
}, {
  url: 'https://example.com',  // Optional: auto-navigate
  waitUntil: 'networkidle2'
});
```

### Event Observability

New events for better monitoring:

```javascript
// Cookie save failures
puppeteer.on('puppeteer.cookieSaveFailed', ({ sessionId, error }) => {
  console.error(`Failed to save cookies for ${sessionId}:`, error);
});

// Browser retirement
puppeteer.on('puppeteer.browserRetired', ({ browserId, reason }) => {
  console.log(`Browser ${browserId} retired: ${reason}`);
});

// Config warnings
puppeteer.on('puppeteer.configWarning', ({ option, reason }) => {
  console.warn(`Config warning for ${option}: ${reason}`);
});
```

---

**Status**: ✅ Production-ready plugin for enterprise browser automation
