# PuppeteerPlugin Storage Capture - Architecture Analysis

## Current Architecture Overview

### 1. Main Plugin Structure (`puppeteer.plugin.js`)
- **Entry Point**: `PuppeteerPlugin` class extending `Plugin`
- **Size**: ~1,350 lines
- **Core Methods**:
  - `navigate(url, options)` - Main public API for page navigation
  - `withSession(sessionId, handler, options)` - Session-aware wrapper
  - Helper methods attached to page: `humanClick()`, `humanType()`, `humanScroll()`, `humanMoveTo()`

### 2. Page Lifecycle in `navigate()`

The `navigate()` method (lines 860-1038) follows this flow:

```
navigate(url, options)
  ├─ Get browser instance from pool
  ├─ Create new page from browser
  ├─ Setup viewport, user agent, resource blocking
  ├─ Load cookies if useSession provided (CookieManager.loadSession)
  ├─ Setup ghost cursor for human behavior
  ├─ Execute page.goto(url)
  ├─ Take screenshot if requested
  ├─ Attach helper methods (_attachHumanBehaviorMethods)
  ├─ Override page.close() to save cookies on close
  └─ Return page with internal properties attached:
      ├─ page._cursor (ghost cursor)
      ├─ page._userAgent
      ├─ page._viewport
      ├─ page._proxyId
      ├─ page._sessionId
      ├─ page._navigationSuccess
      └─ page._sessionSaved
```

**Key observation**: The `navigate()` method is the central hub where all page processing happens.

### 3. Manager Architecture Pattern

The plugin uses a modular manager architecture for different concerns:

```
├─ CookieManager (puppeteer/cookie-manager.js)
│  ├─ loadSession(page, sessionId) - Load cookies onto page
│  ├─ saveSession(page, sessionId, options) - Save cookies from page
│  └─ Initialize S3DB resource for persistence
│
├─ ProxyManager (puppeteer/proxy-manager.js)
│  ├─ authenticateProxy(page, proxy)
│  ├─ getProxyForSession(sessionId, binding)
│  └─ recordProxyUsage(proxyId, success)
│
├─ PerformanceManager (puppeteer/performance-manager.js)
│  ├─ collectMetrics(page, options) - Collect Core Web Vitals
│  └─ _injectWebVitalsScript(page)
│
├─ NetworkMonitor (puppeteer/network-monitor.js)
│  ├─ setupMonitoring(page, sessionId) - Attach CDP listeners
│  ├─ _persistNetworkData() - Save to S3DB
│  └─ Initialize 3 resources (sessions, requests, errors)
│
└─ ConsoleMonitor (puppeteer/console-monitor.js)
   ├─ setupMonitoring(page, sessionId) - Attach console listeners
   ├─ _persistConsoleData() - Save to S3DB
   └─ Initialize 3 resources (sessions, messages, errors)
```

### 4. How Managers Integrate

**Network & Console Monitoring Pattern** (lines 391-398, 541-567):

```javascript
// In onStart()
if (this.config.networkMonitor.enabled) {
  await this._initializeNetworkMonitor();
}
if (this.config.consoleMonitor.enabled) {
  await this._initializeConsoleMonitor();
}

// Managers are then attached to pages in navigate()
// Both use: page.on('request'), page.on('console'), etc.
```

**How they work**:
1. Manager created in `onStart()`
2. Resources created in `initialize()` if `persist: true`
3. Listeners attached to page in `setupMonitoring(page, sessionId)`
4. Data collected during navigation
5. Data persisted to S3DB asynchronously

### 5. Data Persistence Strategy

**Pattern from NetworkMonitor & ConsoleMonitor**:

```javascript
async initialize() {
  if (!this.config.persist) return;
  
  // Create 3 resources: sessions, records, errors
  const [created, err, resource] = await tryFn(() => 
    this.plugin.database.createResource({
      name: resourceName,
      attributes: { /* schema */ },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        byUrl: { fields: { url: 'string' } },
        byDate: { fields: { date: 'string' } }
      }
    })
  );
}

async _persistData(page, sessionId, data) {
  // Insert into resource
  await this.recordsResource.insert({
    sessionId,
    timestamp: Date.now(),
    data: data
  });
}
```

### 6. Resource Naming Convention

All resources use a standardized naming pattern:

```javascript
const resourceDescriptors = {
  cookies: { defaultName: 'plg_puppeteer_cookies' },
  consoleSessions: { defaultName: 'plg_puppeteer_console_sessions' },
  consoleMessages: { defaultName: 'plg_puppeteer_console_messages' },
  consoleErrors: { defaultName: 'plg_puppeteer_console_errors' },
  networkSessions: { defaultName: 'plg_puppeteer_network_sessions' },
  networkRequests: { defaultName: 'plg_puppeteer_network_requests' },
  networkErrors: { defaultName: 'plg_puppeteer_network_errors' }
};
```

Can be overridden via `resourceNames` option or namespaced.

---

## Where to Add Storage Capture

### Option 1: Separate Manager (RECOMMENDED)
**Location**: Create `src/plugins/puppeteer/storage-manager.js`
**Pattern**: Follow NetworkMonitor/ConsoleMonitor pattern

**Pros**:
- Maintains architecture consistency
- Can be independently enabled/disabled
- Clear separation of concerns
- Follows established patterns in codebase
- Easy to extend with additional storage APIs

**Cons**:
- More code (but follows established patterns)
- Need to wire into navigate()

**Implementation in puppeteer.plugin.js**:
```javascript
// Line 203-210, after consoleMonitor config
storage: {
  enabled: false,
  persist: false,
  capture: {
    localStorage: true,
    indexedDB: true,
    sessionStorage: true
  },
  compression: {
    enabled: true,
    threshold: 10240
  }
}

// Lines 315-316, add to internal state
this.storageManager = null;

// Lines 392-398, add initialization
if (this.config.storage.enabled) {
  await this._initializeStorageManager();
}

// New method around line 567
async _initializeStorageManager() {
  const { StorageManager } = await import('./puppeteer/storage-manager.js');
  this.storageManager = new StorageManager(this);
  
  if (this.config.storage.persist) {
    await this.storageManager.initialize();
  }
}
```

### Option 2: Hook in navigate() (SIMPLER)
**Location**: Add logic directly in `navigate()` after page.goto()
**Pattern**: Similar to screenshot collection (lines 951-955)

**Pros**:
- Simpler, fewer lines of code
- Direct control in main flow
- Good for simple use case

**Cons**:
- Less modular if extended later
- Mixes concerns in navigate()
- Harder to test in isolation

### Option 3: Post-navigation Helper Method
**Location**: Add `capturePageStorage(page, sessionId)` method
**Pattern**: Called optionally after navigate(), before close()

**Pros**:
- Flexible, optional capture
- Doesn't block navigation
- Can be used independently

**Cons**:
- User must remember to call it
- No automatic capture

---

## Recommended Implementation: StorageManager

### 1. Create `src/plugins/puppeteer/storage-manager.js`

```javascript
export class StorageManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.config = plugin.config.storage;
    this.localStorageResource = null;
    this.indexedDBResource = null;
    this.sessionStorageResource = null;
  }

  async initialize() {
    if (!this.config.persist) return;
    
    // Create resources for each storage type
    await Promise.all([
      this._createLocalStorageResource(),
      this._createIndexedDBResource(),
      this._createSessionStorageResource()
    ]);
  }

  async captureStorage(page, sessionId, context = {}) {
    const results = {
      localStorage: null,
      indexedDB: null,
      sessionStorage: null,
      timestamp: Date.now(),
      sessionId,
      url: page.url(),
      domain: new URL(page.url()).hostname
    };

    try {
      // Capture based on config
      if (this.config.capture.localStorage) {
        results.localStorage = await this._captureLocalStorage(page);
      }
      if (this.config.capture.indexedDB) {
        results.indexedDB = await this._captureIndexedDB(page);
      }
      if (this.config.capture.sessionStorage) {
        results.sessionStorage = await this._captureSessionStorage(page);
      }

      // Persist if enabled
      if (this.config.persist) {
        await this._persistStorageData(results);
      }

      return results;
    } catch (err) {
      this.plugin.emit('puppeteer.storageCaptureFailed', {
        sessionId,
        url: page.url(),
        error: err.message
      });
      throw err;
    }
  }

  async _captureLocalStorage(page) {
    return await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        items[key] = localStorage.getItem(key);
      }
      return items;
    });
  }

  async _captureSessionStorage(page) {
    return await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        items[key] = sessionStorage.getItem(key);
      }
      return items;
    });
  }

  async _captureIndexedDB(page) {
    return await page.evaluate(async () => {
      if (!window.indexedDB) return null;
      
      const databases = await indexedDB.databases();
      const result = {};

      for (const db of databases) {
        try {
          const idb = await new Promise((resolve, reject) => {
            const req = indexedDB.open(db.name);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });

          const stores = {};
          for (let i = 0; i < idb.objectStoreNames.length; i++) {
            const storeName = idb.objectStoreNames[i];
            stores[storeName] = await new Promise((resolve) => {
              const tx = idb.transaction(storeName, 'readonly');
              const store = tx.objectStore(storeName);
              const req = store.getAll();
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => resolve([]);
            });
          }
          
          idb.close();
          result[db.name] = stores;
        } catch (err) {
          // Skip inaccessible databases
        }
      }
      
      return result;
    });
  }

  async _persistStorageData(results) {
    // Insert into appropriate resources
    if (results.localStorage && this.localStorageResource) {
      await this.localStorageResource.insert({
        sessionId: results.sessionId,
        url: results.url,
        domain: results.domain,
        date: new Date().toISOString().split('T')[0],
        data: results.localStorage,
        itemCount: Object.keys(results.localStorage).length
      });
    }

    // Similar for indexedDB and sessionStorage...
  }
}
```

### 2. Return Structure from captureStorage()

```javascript
{
  localStorage: {
    key1: 'value1',
    key2: 'value2',
    // ... all localStorage items
  },
  sessionStorage: {
    key1: 'value1',
    // ... all sessionStorage items
  },
  indexedDB: {
    dbName1: {
      storeName1: [ /* records */ ],
      storeName2: [ /* records */ ]
    },
    dbName2: {
      // ...
    }
  },
  timestamp: 1731611400000,
  sessionId: 'session-123',
  url: 'https://example.com/page',
  domain: 'example.com'
}
```

### 3. Auto-capture Integration in navigate()

**Option A: Automatic after navigation**
```javascript
// In navigate(), after line 936 (after page.goto)
if (this.storageManager) {
  page._storageData = await this.storageManager.captureStorage(page, useSession);
}
```

**Option B: On page close hook**
```javascript
// In navigate(), modify page.close override (line 986)
const originalStorageData = page._storageData;
page.close = async (...closeArgs) => {
  // Capture storage on close if not already done
  if (!page._storageData && this.storageManager) {
    try {
      page._storageData = await this.storageManager.captureStorage(page, useSession);
    } catch (err) {
      // Log but don't fail
    }
  }
  // ... rest of close logic
}
```

### 4. S3DB Resources Schema

```javascript
// localStorage Resource
async _createLocalStorageResource() {
  const name = this.plugin.resourceNames?.storage || 'plg_puppeteer_storage_local';
  
  const [created, err, resource] = await tryFn(() =>
    this.plugin.database.createResource({
      name,
      attributes: {
        sessionId: 'string|required',
        url: 'string|required',
        domain: 'string|required',
        date: 'string|required',
        
        // Storage data
        data: 'object|required',  // { key: value, ... }
        itemCount: 'number',
        totalSize: 'number',      // Bytes
        
        // Metadata
        hasLargeValues: 'boolean',
        keys: 'array'             // List of keys for quick scanning
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        byUrl: { fields: { url: 'string' } },
        byDomain: { fields: { domain: 'string' } },
        byDate: { fields: { date: 'string' } }
      }
    })
  );
}

// IndexedDB Resource
async _createIndexedDBResource() {
  const name = this.plugin.resourceNames?.storageIndexedDB || 'plg_puppeteer_storage_indexeddb';
  
  const [created, err, resource] = await tryFn(() =>
    this.plugin.database.createResource({
      name,
      attributes: {
        sessionId: 'string|required',
        url: 'string|required',
        domain: 'string|required',
        date: 'string|required',
        
        // IndexedDB data
        databaseName: 'string|required',
        storeName: 'string|required',
        data: 'array|required',   // Records from object store
        recordCount: 'number',
        
        // Metadata
        dataSize: 'number',
        keys: 'array'
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        byDomain: { fields: { domain: 'string' } },
        byDatabase: { fields: { databaseName: 'string' } },
        byDate: { fields: { date: 'string' } }
      }
    })
  );
}
```

---

## Configuration Integration

### In puppeteer.plugin.js constructor

```javascript
// Add around line 203-210
storage: {
  enabled: false,
  persist: false,
  capture: {
    localStorage: true,
    indexedDB: true,
    sessionStorage: true
  },
  compression: {
    enabled: true,
    threshold: 10240  // Compress payloads > 10KB
  },
  filters: {
    excludeKeys: [],          // ['__session', 'token']
    maxItemSize: 1048576,     // 1MB max per item
    maxTotalSize: 10485760,   // 10MB max total
    saveErrors: true
  },
  ...options.storage
}

// Add resource descriptors around line 280-284
storage: {
  defaultName: 'plg_puppeteer_storage_local',
  indexedDB: { defaultName: 'plg_puppeteer_storage_indexeddb' },
  sessionStorage: { defaultName: 'plg_puppeteer_storage_session' },
  override: resourceNamesOption.storage
}
```

---

## Usage Examples

### Basic Usage
```javascript
const plugin = new PuppeteerPlugin({
  storage: {
    enabled: true,
    persist: true,
    capture: {
      localStorage: true,
      indexedDB: true
    }
  }
});

await db.usePlugin(plugin);

const page = await plugin.navigate('https://example.com');
// Storage automatically captured on navigate

// Access captured data
const stored = page._storageData;
console.log(stored.localStorage);
console.log(stored.indexedDB);

await page.close();
```

### With Session
```javascript
await plugin.withSession('user-123', async (page) => {
  // Storage captured automatically
  const storage = page._storageData;
  
  // User data should be in localStorage
  const user = JSON.parse(storage.localStorage.user);
  console.log('Logged in as:', user.name);
}, {
  url: 'https://example.com/dashboard'
});
```

### Manual Capture
```javascript
const page = await plugin.navigate('https://example.com');

// Do some actions
await page.click('button');
await page.waitForTimeout(1000);

// Manually capture updated storage
const updatedStorage = await plugin.storageManager.captureStorage(page, sessionId);

await page.close();
```

---

## Key Design Decisions

1. **Manager Pattern**: Follows NetworkMonitor/ConsoleMonitor pattern for consistency
2. **Async Resource Creation**: Uses `tryFn` for safe resource creation with proper error handling
3. **Auto-capture**: Happens during `navigate()` to ensure always collected (like screenshot)
4. **Persistence Optional**: Can be enabled/disabled via config
5. **Filtering**: Support for excluding keys, limiting sizes to prevent storage bloat
6. **Compression**: Large payloads compressed using S3DB's built-in compression
7. **Partitioning**: Organized by domain/date for efficient querying
8. **Error Handling**: Captures storage errors without failing the page navigation

---

## Testing Considerations

```javascript
// In tests, can be mocked:
plugin.storageManager.captureStorage = jest.fn().mockResolvedValue({
  localStorage: { test: 'value' },
  indexedDB: {},
  sessionStorage: {}
});

// Or disabled in test config:
new PuppeteerPlugin({
  storage: { enabled: false }
})
```

