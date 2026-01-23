# Design: Hybrid Spider with Shared Context

## Context

The s3db.js spider plugin performs web crawling using two approaches:
- **recker/fetch**: Fast HTTP requests for static content
- **puppeteer**: Full browser for JavaScript-rendered pages

Currently these operate independently, causing session fragmentation and detection issues.

### Stakeholders
- Spider plugin users needing authenticated crawling
- Recon plugin for OSINT gathering
- Cookie Farm plugin for session management

## Goals / Non-Goals

### Goals
- Unified session state across HTTP client and browser
- Smart routing to minimize resource usage
- Cookie synchronization (bidirectional)
- Consistent fingerprint to avoid bot detection
- Session persistence for long-running crawls

### Non-Goals
- Full anti-detection suite (use existing `stealth-manager.js`)
- CAPTCHA solving
- Distributed crawling coordination
- Rate limiting (use existing http-client retry logic)

## Decisions

### Decision 1: CrawlContext as Central State Manager

**What**: Single `CrawlContext` class holds all session state.

**Why**:
- Single source of truth prevents state drift
- Easy to serialize for persistence
- Clear ownership of session data

**Alternatives considered**:
- Separate cookie jar + config objects → rejected (fragmented state)
- Event-based sync → rejected (race conditions, complexity)

### Decision 2: Cookie Synchronization Strategy

**What**: Bidirectional sync with source tracking.

```javascript
// Cookie structure
{
  name: 'session',
  value: 'abc123',
  domain: 'example.com',
  path: '/',
  expires: 1234567890,
  secure: true,
  httpOnly: true,
  sameSite: 'Lax',
  _source: 'recker',      // Track origin
  _updatedAt: 1234567890  // Track freshness
}
```

**Sync points**:
- After recker response: parse `Set-Cookie` headers
- Before puppeteer navigation: inject cookies via `page.setCookie()`
- After puppeteer navigation: extract via `page.cookies()`

**Why**:
- Source tracking helps debug session issues
- Timestamp enables conflict resolution (latest wins)

### Decision 3: JavaScript Detection Heuristics

**What**: Detect SPA patterns to decide recker vs puppeteer.

```javascript
_needsJavaScript(html) {
  const indicators = [
    // React
    /<div id="root">\s*<\/div>/i,
    /<div id="app">\s*<\/div>/i,
    // Next.js
    /__NEXT_DATA__/,
    // Nuxt
    /__NUXT__/,
    // Angular
    /ng-app|ng-controller/,
    // Vue
    /v-cloak|v-if|v-for/,
    // Generic SPA
    /<body[^>]*>\s*<script/i,
    // Empty body with scripts
    /<body[^>]*>\s*<\/body>/i
  ];

  return indicators.some(pattern => pattern.test(html));
}
```

**Why**:
- Avoids expensive puppeteer for static pages
- Catches common SPA frameworks
- False positives acceptable (puppeteer works for all pages)

### Decision 4: Fingerprint Consistency

**What**: Share these across recker and puppeteer:

| Property | recker | puppeteer |
|----------|--------|-----------|
| User-Agent | Header | `page.setUserAgent()` |
| Accept-Language | Header | `page.setExtraHTTPHeaders()` |
| Viewport | - | `page.setViewport()` |
| Timezone | - | `page.emulateTimezone()` |
| Platform | - | `navigator.platform` override |
| Screen size | - | `screen.width/height` override |
| Proxy | Client config | `--proxy-server` arg |

**Why**: Consistent fingerprint reduces bot detection risk.

### Decision 5: Lazy Initialization

**What**: Both HTTP client and browser created on first use.

```javascript
async _getHttpClient() {
  if (!this._httpClient) {
    this._httpClient = await createHttpClient(
      this.context.getHttpClientConfig(url)
    );
  }
  return this._httpClient;
}

async _getBrowser() {
  if (!this._browser) {
    this._browser = await puppeteer.launch(
      this.context.getLaunchConfig()
    );
  }
  return this._browser;
}
```

**Why**:
- Avoid browser startup if recker suffices
- Memory efficient for simple crawls

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      HybridFetcher                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   CrawlContext                       │    │
│  │  • cookies (Map<domain, cookie[]>)                  │    │
│  │  • userAgent, headers, proxy                        │    │
│  │  • viewport, timezone, locale                       │    │
│  │  • toJSON() / fromJSON() for persistence            │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│              ┌─────────────┴─────────────┐                  │
│              ▼                           ▼                  │
│  ┌───────────────────┐       ┌───────────────────┐         │
│  │   HTTP Client     │       │    Puppeteer      │         │
│  │   (recker/fetch)  │       │    Browser        │         │
│  │                   │       │                   │         │
│  │ • Fast requests   │       │ • JS rendering    │         │
│  │ • Static content  │       │ • SPA support     │         │
│  │ • API calls       │       │ • Screenshots     │         │
│  └───────────────────┘       └───────────────────┘         │
│              │                           │                  │
│              └─────────────┬─────────────┘                  │
│                            ▼                                │
│                    Cookie Sync                              │
│              (bidirectional on each request)                │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Fetch with Recker
```
1. HybridFetcher.fetch(url)
2. context.getHttpClientConfig(url)  → includes Cookie header
3. httpClient.get(url)
4. context.processResponse(response) → extracts Set-Cookie
5. Return HTML
```

### Fetch with Puppeteer
```
1. HybridFetcher.fetch(url) → detected JS needed
2. context.getLaunchConfig() → browser settings
3. browser.newPage()
4. context.configurePage(page) → inject cookies, UA, viewport
5. page.goto(url)
6. context.importFromPuppeteer(page) → sync cookies back
7. Return rendered HTML
```

### Smart Routing
```
1. HybridFetcher.fetch(url)
2. Try recker first (fast)
3. Check _needsJavaScript(html)
4. If true → fetch with puppeteer
5. Return result with source indicator
```

## Risks / Trade-offs

### Risk: Cookie Format Mismatch
**Issue**: Set-Cookie header format differs from puppeteer cookie object.
**Mitigation**: Robust parser with fallbacks, tested against major sites.

### Risk: Puppeteer Version Compatibility
**Issue**: Different puppeteer versions have API differences.
**Mitigation**: Test against puppeteer 20+ and puppeteer-core, document minimum version.

### Trade-off: Memory Usage
**Issue**: Keeping browser instance uses ~100-200MB RAM.
**Decision**: Accept for session consistency. Users can close browser manually.

### Trade-off: Startup Latency
**Issue**: First puppeteer request has ~2-5s latency.
**Decision**: Accept. Lazy init means no cost if not needed.

## File Structure

```
src/plugins/spider/
├── crawl-context.js      # NEW: Session state manager
├── hybrid-fetcher.js     # NEW: Smart recker/puppeteer router
├── deep-discovery.js     # MODIFIED: Optional context integration
├── sitemap-parser.js     # MODIFIED: Optional context integration
├── robots-parser.js      # MODIFIED: Optional context integration
└── index.js              # MODIFIED: Export new classes
```

## API Examples

### Basic Usage
```javascript
import { CrawlContext, HybridFetcher } from 's3db.js';

const context = new CrawlContext({
  userAgent: 'MyBot/1.0',
  proxy: 'http://proxy:8080'
});

const fetcher = new HybridFetcher({ context });

// Auto-selects recker or puppeteer
const { html, source } = await fetcher.fetch('https://example.com');
console.log(`Fetched with ${source}`); // 'recker' or 'puppeteer'
```

### With Authentication
```javascript
const context = new CrawlContext();
const fetcher = new HybridFetcher({ context });

// Login via recker (fast)
await fetcher.fetchWithRecker('https://example.com/login', {
  method: 'POST',
  body: { username: 'user', password: 'pass' }
});

// Cookies automatically shared - puppeteer is authenticated
const { html } = await fetcher.fetchWithPuppeteer('https://example.com/dashboard');
```

### Session Persistence
```javascript
// Save session
const sessionData = context.toJSON();
await fs.writeFile('session.json', JSON.stringify(sessionData));

// Restore session
const saved = JSON.parse(await fs.readFile('session.json'));
const context = CrawlContext.fromJSON(saved);
```

## Open Questions

1. **Cookie expiration handling**: Should we proactively remove expired cookies or check at access time?
   - Current decision: Check at access time (simpler)

2. **Multi-domain crawling**: Should context support multiple isolated cookie jars?
   - Current decision: Single jar with domain-based filtering (simpler, covers 90% of cases)

3. **Puppeteer pool**: Should we support multiple browser instances for parallelism?
   - Current decision: Single browser, multiple pages (simpler, sufficient for most use cases)
