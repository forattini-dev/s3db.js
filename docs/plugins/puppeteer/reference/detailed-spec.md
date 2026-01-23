# 🤖 PuppeteerPlugin - Detailed Specification

> **Enterprise-grade headless browser with human-like behavior and cookie farming**

---

## 🎯 Core Philosophy

**Developer Experience First:**
- ✅ Simple API for common tasks
- ✅ Powerful API for advanced use cases
- ✅ Sensible defaults (but fully configurable)
- ✅ Zero boilerplate
- ✅ Type-safe (TypeScript support)

**Human-Like Behavior:**
- ✅ Mouse movements follow natural curves
- ✅ Random timing and delays
- ✅ Realistic viewport sizes
- ✅ Authentic user agents
- ✅ Fingerprint randomization

**Cookie Farming & Session Management:**
- ✅ Store unlimited cookies in s3db
- ✅ Share cookies across tabs/browsers
- ✅ Cookie rotation strategies
- ✅ Session warmup (build reputation)
- ✅ Auto-cleanup of expired cookies

---

## ⚙️ DX Helpers & Events (what's new)

- `plugin.withSession(sessionId, handler, { url, ...navigateOptions })` wraps navigation + cleanup so you only focus on DOM actions.
- Browsers spawned outside the pool (e.g., per-proxy) now auto close after the page finishes, preventing Chromium leaks.
- Idle pooled browsers respect `pool.closeOnIdle`/`pool.idleTimeout`; when they retire you get `puppeteer.browserRetired`.
- Extra observability hooks:
  - `puppeteer.cookieSaveFailed` when session persistence fails.
  - `puppeteer.withSession.start/finish/cleanupFailed` around helper usage.
  - `puppeteer.configWarning` for ignored options (e.g., `pool.reuseTab`).
  - `puppeteer.browserClosed` / `puppeteer.browserCloseFailed` for dedicated browsers.

---

## 📦 Configuration Schema

```javascript
import { PuppeteerPlugin } from 's3db.js';

const puppeteer = new PuppeteerPlugin({
  // ============================================
  // 1. BROWSER POOL MANAGEMENT
  // ============================================
  pool: {
    min: 1,                    // Minimum browsers to keep alive
    max: 10,                   // Maximum browsers
    maxTabsPerBrowser: 5,      // Max tabs per browser
    idleTimeout: 300000,       // Close idle browsers after 5min
    recycleAfter: 100,         // Recycle browser after N tabs
    launchTimeout: 30000,      // Max time to launch browser
    closeTimeout: 5000         // Max time to close browser
  },

  // ============================================
  // 2. BROWSER LAUNCH OPTIONS
  // ============================================
  launch: {
    headless: 'new',           // 'new', true, false
    executablePath: undefined, // Custom Chrome path (optional)

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ],

    // Chrome flags for stealth
    ignoreDefaultArgs: ['--enable-automation'],

    // Performance
    pipe: true,                // Use pipe instead of websocket (faster)
    dumpio: false              // Don't dump browser logs
  },

  // ============================================
  // 3. VIEWPORT & USER AGENT
  // ============================================
  viewport: {
    mode: 'random',            // 'random', 'fixed', 'custom'

    // Predefined viewport sets
    presets: [
      // Desktop
      { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false }, // Full HD
      { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false },  // Laptop
      { width: 1536, height: 864, deviceScaleFactor: 1, isMobile: false },  // HD+
      { width: 2560, height: 1440, deviceScaleFactor: 1, isMobile: false }, // 2K

      // Mobile
      { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },    // iPhone 13
      { width: 393, height: 851, deviceScaleFactor: 2.75, isMobile: true }, // Pixel 5
      { width: 414, height: 896, deviceScaleFactor: 3, isMobile: true },    // iPhone 11 Pro Max
    ],

    // Or fixed viewport
    fixed: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      isLandscape: false
    },

    // Or fully custom
    custom: async () => {
      return {
        width: Math.floor(Math.random() * (1920 - 1024) + 1024),
        height: Math.floor(Math.random() * (1080 - 768) + 768),
        deviceScaleFactor: 1,
        isMobile: false
      };
    }
  },

  // ============================================
  // 4. USER AGENT MANAGEMENT
  // ============================================
  userAgent: {
    mode: 'random',            // 'random', 'fixed', 'rotate', 'real'

    // Use user-agents library (20,000+ real user agents)
    // https://www.npmjs.com/package/user-agents
    library: 'user-agents',    // Will install automatically

    // Filter options
    filter: {
      deviceCategory: 'desktop', // 'desktop', 'mobile', 'tablet', null (all)
      minVersion: 90,           // Minimum Chrome version
      excludeOld: true          // Exclude old browsers
    },

    // Or fixed user agent
    fixed: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',

    // Or rotation list
    rotate: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0',
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0'
    ],

    // Match user agent with viewport (smart!)
    matchViewport: true        // Mobile UA = mobile viewport
  },

  // ============================================
  // 5. STEALTH MODE (Anti-Detection)
  // ============================================
  stealth: {
    enabled: true,

    // Use puppeteer-extra-plugin-stealth
    plugins: {
      // Remove automation markers
      automation: true,

      // Hide webdriver
      webdriver: true,

      // Hide Chrome headless
      chrome: {
        runtime: true,
        app: true,
        csi: true,
        loadTimes: true
      },

      // Realistic plugins
      plugins: true,

      // Random WebGL vendor/renderer
      webgl: {
        vendor: 'random',      // 'random', 'Intel', 'NVIDIA', 'AMD'
        renderer: 'random'
      },

      // Random canvas fingerprint
      canvas: {
        noise: true,
        shift: true
      },

      // Random audio fingerprint
      audio: {
        noise: true
      },

      // Permissions
      permissions: {
        overrides: {
          geolocation: 'allow',
          notifications: 'deny',
          camera: 'deny',
          microphone: 'deny'
        }
      },

      // Languages
      languages: {
        languages: ['en-US', 'en'],
        enabledLanguages: true
      },

      // Timezone
      timezone: {
        timezoneId: 'America/New_York', // Or 'auto' for system
        locale: 'en-US'
      },

      // Media codecs
      mediaCodecs: true,

      // iframe contentWindow
      iframe: {
        contentWindow: true
      }
    }
  },

  // ============================================
  // 6. HUMAN BEHAVIOR SIMULATION
  // ============================================
  humanBehavior: {
    enabled: true,

    // Mouse movements (ghost-cursor library)
    mouse: {
      enabled: true,

      // Movement algorithm
      algorithm: 'bezier',     // 'bezier', 'line', 'random'

      // Speed settings
      speed: {
        min: 50,               // Pixels per second (min)
        max: 200,              // Pixels per second (max)
        acceleration: 1.5      // Acceleration factor
      },

      // Overshoot & correction (very human!)
      overshoot: {
        enabled: true,
        radius: 10,            // Pixels
        spread: 3,             // Randomness
        correction: true       // Correct back to target
      },

      // Random movements before click
      jitter: {
        enabled: true,
        beforeClick: true,
        radius: 5              // Pixels
      },

      // Move through intermediate elements
      pathElements: {
        enabled: true,
        maxElements: 3,        // Max elements to hover
        hoverTime: {
          min: 50,
          max: 200
        }
      }
    },

    // Typing simulation
    typing: {
      enabled: true,

      // Character delay
      delay: {
        min: 50,               // ms between chars (min)
        max: 150,              // ms between chars (max)
        variance: 30           // Random variance
      },

      // Mistakes & corrections
      mistakes: {
        enabled: true,
        probability: 0.05,     // 5% chance per character
        correction: true       // Backspace and retype
      },

      // Realistic patterns
      patterns: {
        doubleChar: 0.02,      // Type char twice (typo)
        skipChar: 0.01,        // Skip char then correct
        pauseAfterWord: true,  // Pause between words
        pauseDuration: {
          min: 100,
          max: 300
        }
      }
    },

    // Scrolling behavior
    scrolling: {
      enabled: true,

      // Scroll speed
      speed: {
        min: 100,              // Pixels per scroll
        max: 300
      },

      // Scroll patterns
      patterns: {
        randomStop: true,      // Random stops while scrolling
        backScroll: true,      // Scroll back up sometimes
        horizontalJitter: true // Slight horizontal movement
      },

      // Pause behavior
      pause: {
        enabled: true,
        probability: 0.3,      // 30% chance to pause
        duration: {
          min: 500,
          max: 2000
        }
      }
    },

    // Random waits & delays
    delays: {
      beforeClick: { min: 100, max: 500 },
      afterClick: { min: 200, max: 800 },
      beforeType: { min: 200, max: 600 },
      afterType: { min: 300, max: 1000 },
      pageLoad: { min: 1000, max: 3000 },
      random: { min: 500, max: 2000 }
    }
  },

  // ============================================
  // 7. COOKIE MANAGEMENT & FARMING
  // ============================================
  cookies: {
    enabled: true,

    // Storage
    storage: {
      resource: 'puppeteer_cookies',

      // Auto-save cookies after navigation
      autoSave: true,

      // Auto-load cookies before navigation
      autoLoad: true,

      // Save frequency
      saveInterval: 30000,     // Save every 30s

      // Encryption
      encrypt: true,           // Encrypt cookies in s3db
      encryptionKey: process.env.COOKIE_ENCRYPTION_KEY
    },

    // Cookie farming
    farming: {
      enabled: true,

      // Warmup strategy
      warmup: {
        enabled: true,

        // Visit pages to build reputation
        pages: [
          'https://www.google.com',
          'https://www.youtube.com',
          'https://www.amazon.com',
          'https://www.facebook.com',
          'https://www.twitter.com'
        ],

        // Random order
        randomOrder: true,

        // Time per page
        timePerPage: {
          min: 5000,
          max: 15000
        },

        // Interactions
        interactions: {
          scroll: true,
          click: true,
          hover: true
        }
      },

      // Cookie rotation
      rotation: {
        enabled: true,

        // Rotate after N requests
        requestsPerCookie: 100,

        // Or time-based
        maxAge: 86400000,      // 24 hours

        // Pool size
        poolSize: 10,          // Keep 10 cookie sets

        // Fallback
        fallbackToNew: true    // Create new session if pool empty
      },

      // Cookie reputation
      reputation: {
        enabled: true,

        // Track success rate
        trackSuccess: true,

        // Retire low-performing cookies
        retireThreshold: 0.5,  // <50% success rate

        // Age boost (older = better reputation)
        ageBoost: true
      }
    },

    // Session management
    sessions: {
      enabled: true,

      // Session resource
      resource: 'puppeteer_sessions',

      // Save full session state
      saveState: {
        cookies: true,
        localStorage: true,
        sessionStorage: true,
        indexedDB: false,      // Heavy!
        viewport: true,
        userAgent: true
      },

      // Session sharing
      shareAcrossTabs: true,
      shareAcrossBrowsers: false,

      // Session lifecycle
      ttl: 604800000,          // 7 days
      autoCleanup: true
    },

    // Cookie domains
    domains: {
      // Allow cookies for these domains
      whitelist: ['*'],        // All domains

      // Block these domains
      blacklist: []
    }
  },

  // ============================================
  // 8. PERFORMANCE OPTIMIZATION
  // ============================================
  performance: {
    // Resource blocking
    block: {
      enabled: true,

      types: [
        'image',               // Block images (huge speedup!)
        'stylesheet',          // Block CSS (if you don't need it)
        'font',                // Block fonts
        'media',               // Block video/audio
        // 'script',           // DON'T block JS (breaks sites)
        // 'xhr',              // DON'T block AJAX
        // 'fetch',            // DON'T block fetch
      ],

      // Block specific domains
      domains: [
        'google-analytics.com',
        'googletagmanager.com',
        'facebook.com',
        'doubleclick.net',
        'ads.*',
        'analytics.*'
      ],

      // Exception rules
      exceptions: {
        urls: [],              // Never block these URLs
        domains: []            // Never block these domains
      }
    },

    // Cache
    cache: {
      enabled: true,
      size: 100 * 1024 * 1024  // 100MB cache
    },

    // Network
    network: {
      throttling: false,       // Simulate slow network
      throttleSettings: {
        downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5Mbps
        uploadThroughput: 750 * 1024 / 8,           // 750Kbps
        latency: 40            // 40ms
      }
    },

    // Tab limits
    tabs: {
      maxConcurrent: 5,        // Max concurrent tabs
      reuseIdleTabs: true,     // Reuse idle tabs
      idleTimeout: 60000       // Consider idle after 1min
    }
  },

  // ============================================
  // 9. SCREENSHOT & RECORDING
  // ============================================
  screenshots: {
    enabled: true,

    // Storage
    storage: {
      resource: 'puppeteer_screenshots',
      saveToS3: true,          // Save large files to S3
      saveMetadata: true       // Save metadata to s3db
    },

    // Default options
    defaults: {
      type: 'png',             // 'png', 'jpeg'
      quality: 80,             // JPEG quality
      fullPage: false,         // Full page or viewport
      omitBackground: false    // Transparent background
    },

    // Screenshot diffing
    diff: {
      enabled: true,
      threshold: 0.1,          // 10% difference threshold
      saveOriginals: true,
      saveDiffs: true
    }
  },

  // ============================================
  // 10. PROXY SUPPORT
  // ============================================
  proxy: {
    enabled: false,

    // Single proxy
    url: 'http://proxy.example.com:8080',
    username: 'user',
    password: 'pass',

    // Or proxy rotation
    rotation: {
      enabled: false,

      proxies: [
        'http://proxy1.example.com:8080',
        'http://proxy2.example.com:8080',
        'http://proxy3.example.com:8080'
      ],

      // Rotation strategy
      strategy: 'round-robin', // 'round-robin', 'random', 'least-used'

      // Health check
      healthCheck: {
        enabled: true,
        interval: 60000,       // Check every minute
        timeout: 5000,
        retries: 3
      }
    },

    // Proxy per session
    perSession: false
  },

  // ============================================
  // 11. ERROR HANDLING & RETRIES
  // ============================================
  errors: {
    // Retry configuration
    retries: {
      enabled: true,
      maxAttempts: 3,
      backoff: 'exponential',  // 'exponential', 'linear', 'fixed'
      initialDelay: 1000,
      maxDelay: 10000
    },

    // Error handling
    onError: async (error, context) => {
      console.error('Puppeteer error:', error);
      // Custom error handling
    },

    // Timeout handling
    timeouts: {
      navigation: 30000,       // Page load timeout
      waitFor: 10000,          // waitForSelector timeout
      script: 5000             // Script execution timeout
    }
  },

  // ============================================
  // 12. LOGGING & DEBUGGING
  // ============================================
  logging: {
    enabled: true,
    level: 'info',             // 'debug', 'info', 'warn', 'error'

    // Log categories
    categories: {
      pool: true,              // Browser pool events
      navigation: true,        // Page navigations
      cookies: true,           // Cookie operations
      humanBehavior: false,    // Human behavior (verbose!)
      performance: true        // Performance metrics
    },

    // Custom logger
    logger: console,           // Or custom logger (Winston, etc.)

    // Log to s3db
    saveToDb: {
      enabled: false,
      resource: 'puppeteer_logs',
      level: 'error'           // Only save errors
    }
  },

  // ============================================
  // 13. EVENTS
  // ============================================
  events: {
    enabled: true,

    // Event handlers
    handlers: {
      'browser:launched': (browser) => {},
      'browser:closed': (browser) => {},
      'page:created': (page) => {},
      'page:closed': (page) => {},
      'navigation:start': (url) => {},
      'navigation:end': (url, metrics) => {},
      'cookies:saved': (sessionId, count) => {},
      'cookies:loaded': (sessionId, count) => {},
      'error': (error, context) => {}
    }
  }
});

await db.usePlugin(puppeteer);
```

---

## 🎨 Developer Experience API

### 1. Simple API (90% of use cases)

```javascript
// Get a page with best defaults
const page = await puppeteer.getPage();

// Navigate with human-like behavior
await page.goto('https://example.com');

// Human-like interactions
await page.humanClick('.button');
await page.humanType('#input', 'Hello world');
await page.randomScroll();
await page.randomWait();

// Take screenshot
const screenshot = await page.screenshot();

// Release back to pool
await puppeteer.releasePage(page);
```

### 2. Session API (Cookie Farming)

```javascript
// Get page with specific session
const page = await puppeteer.getPage({
  sessionId: 'user-123',
  stealth: true,
  warmup: true  // Do warmup if new session
});

// Cookies auto-loaded from s3db!
await page.goto('https://authenticated-site.com');

// Do stuff...

// Cookies auto-saved to s3db!
await puppeteer.releasePage(page);
```

### 3. Cookie Farming API

```javascript
// Create new session with warmup
const session = await puppeteer.createSession({
  sessionId: 'farm-001',
  warmup: {
    enabled: true,
    pages: [
      'https://www.google.com',
      'https://www.youtube.com'
    ],
    interactions: true
  }
});

// Rotate cookies automatically
const page = await puppeteer.getPage({
  cookieRotation: true  // Auto-picks from pool
});

// Get cookie stats
const stats = await puppeteer.getCookieStats('farm-001');
console.log(stats);
/*
{
  sessionId: 'farm-001',
  age: 86400000,           // 24 hours
  requestCount: 150,
  successRate: 0.95,       // 95% success
  lastUsed: Date,
  reputation: 'good',      // 'good', 'fair', 'poor'
  domains: ['example.com', 'api.example.com']
}
*/
```

### 4. Human Behavior API

```javascript
// Get page with human behavior
const page = await puppeteer.getPage({
  human: true  // Enable all human features
});

// Move mouse through elements (very human!)
await page.humanMoveTo('.link', {
  path: true,              // Move through intermediate elements
  overshoot: true,         // Overshoot and correct
  jitter: true             // Random jitter
});

// Type with mistakes
await page.humanType('#search', 'puppeteer', {
  mistakes: true,          // Make typos
  corrections: true,       // Correct them
  pauseAfterWord: true     // Pause between words
});

// Scroll like human
await page.humanScroll({
  direction: 'down',
  distance: 1000,
  randomStops: true,       // Stop randomly
  backScroll: true         // Scroll back up sometimes
});

// Random wait (acts like reading)
await page.randomWait(2000, 5000);
```

### 5. Advanced API (Power Users)

```javascript
// Full control
const page = await puppeteer.getPage({
  sessionId: 'advanced-001',

  // Custom viewport
  viewport: {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1
  },

  // Custom user agent
  userAgent: 'Mozilla/5.0...',

  // Custom stealth settings
  stealth: {
    webgl: { vendor: 'NVIDIA' },
    canvas: { noise: true }
  },

  // Resource blocking
  block: {
    types: ['image', 'stylesheet'],
    domains: ['ads.*']
  },

  // Proxy
  proxy: 'http://proxy.example.com:8080',

  // Callbacks
  onConsole: (msg) => console.log('PAGE:', msg.text()),
  onRequest: (req) => console.log('REQ:', req.url()),
  onResponse: (res) => console.log('RES:', res.url())
});
```

---

## 🏗️ Architecture

### Browser Pool

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

### Human Behavior Flow

```
┌──────────────────────────────────────────────────────────┐
│                  Human Behavior Engine                    │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  CLICK:                                                   │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 1. Find element bounds                           │    │
│  │ 2. Calculate bezier curve from current position │    │
│  │ 3. Move through intermediate elements (hover)   │    │
│  │ 4. Add random jitter near target                │    │
│  │ 5. Overshoot target by 5-10px                   │    │
│  │ 6. Correct back to target                       │    │
│  │ 7. Random delay (100-500ms)                     │    │
│  │ 8. Mouse down                                    │    │
│  │ 9. Random delay (50-100ms)                      │    │
│  │ 10. Mouse up                                     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  TYPE:                                                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ For each character:                              │    │
│  │   1. Random delay (50-150ms)                    │    │
│  │   2. Maybe make typo (5% chance)                │    │
│  │   3. Maybe double-char (2% chance)              │    │
│  │   4. If typo: backspace + correct               │    │
│  │   5. Pause after word (100-300ms)               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
│  SCROLL:                                                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 1. Random scroll speed (100-300px)              │    │
│  │ 2. Random stops (30% chance)                    │    │
│  │ 3. Pause (500-2000ms)                           │    │
│  │ 4. Maybe scroll back up (10% chance)            │    │
│  │ 5. Slight horizontal jitter                     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 📚 Key Libraries

### 1. **user-agents** (User Agent Generation)
```bash
npm install user-agents
```

**Why:** 20,000+ real user agents with filters

```javascript
const UserAgent = require('user-agents');

// Random desktop user agent
const ua = new UserAgent({ deviceCategory: 'desktop' });
console.log(ua.toString());

// Random mobile user agent
const mobileUa = new UserAgent({ deviceCategory: 'mobile' });
```

### 2. **ghost-cursor** (Human Mouse Movements)
```bash
npm install ghost-cursor
```

**Why:** Bezier curves, overshoot, jitter

```javascript
const { createCursor } = require('ghost-cursor');

const cursor = createCursor(page);

// Move with overshoot and jitter
await cursor.move('.button', {
  paddingPercentage: 0.1,
  waitForClick: 500,
  moveDelay: 2000
});

await cursor.click();
```

### 3. **puppeteer-extra** + **puppeteer-extra-plugin-stealth**
```bash
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```

**Why:** Industry standard for anti-detection

```javascript
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch();
```

### 4. **puppeteer-extra-plugin-adblocker** (Block Ads)
```bash
npm install puppeteer-extra-plugin-adblocker
```

**Why:** Faster page loads, less tracking

```javascript
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
```

---

## 🎯 Cookie Farming Strategy

### Strategy 1: Warmup Sessions

```javascript
// Create 10 warmed-up sessions
for (let i = 0; i < 10; i++) {
  await puppeteer.createSession({
    sessionId: `farm-${i}`,

    warmup: {
      enabled: true,

      // Visit these sites to build reputation
      pages: [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://www.amazon.com',
        'https://www.reddit.com'
      ],

      // Do human interactions
      interactions: {
        scroll: true,
        click: true,
        search: true  // Type in search boxes
      },

      // Time per page (looks natural)
      timePerPage: {
        min: 10000,   // 10s minimum
        max: 30000    // 30s maximum
      }
    }
  });
}

// Now use them
const page = await puppeteer.getPage({
  cookieRotation: true  // Auto-picks best session
});
```

### Strategy 2: Reputation Tracking

```javascript
// Track which cookies work best
puppeteer.events.on('navigation:end', async (event) => {
  const { sessionId, statusCode, url } = event;

  if (statusCode === 200) {
    await puppeteer.updateCookieReputation(sessionId, {
      success: true
    });
  } else if (statusCode === 403 || statusCode === 429) {
    await puppeteer.updateCookieReputation(sessionId, {
      success: false,
      retire: statusCode === 403  // Retire on 403
    });
  }
});

// Get best cookies
const bestCookies = await puppeteer.getBestCookies({
  minReputation: 0.8,   // 80% success rate
  minAge: 3600000,      // At least 1 hour old
  limit: 5
});
```

### Strategy 3: Age-Based Rotation

```javascript
// Older cookies = more trustworthy
const page = await puppeteer.getPage({
  cookieRotation: {
    enabled: true,
    strategy: 'oldest-first',  // Use oldest first
    minAge: 86400000          // At least 24 hours old
  }
});
```

---

## 🚀 Performance Benchmarks

| Operation | Without Pool | With Pool | Speedup |
|-----------|-------------|-----------|---------|
| **Launch Browser** | 3-5s | 0ms (reused) | ∞ |
| **New Tab** | 500-1000ms | 50-100ms | 10x |
| **Navigate** | 1-3s | 1-3s | 1x |
| **Screenshot** | 500ms | 500ms | 1x |
| **Total (100 pages)** | 6-10min | 2-3min | 3-5x |

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

**Let's build the most developer-friendly puppeteer plugin ever! 🚀**
