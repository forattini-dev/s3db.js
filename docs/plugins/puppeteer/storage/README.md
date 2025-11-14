# 🎭 Puppeteer Plugin - Storage Capture

Complete documentation for capturing and analyzing browser storage mechanisms (localStorage, sessionStorage, IndexedDB, cookies).

## 📚 Documentation

### Quick Start
- **[quickstart.md](./quickstart.md)** - Get started with storage capture in 5 minutes
  - Basic setup
  - Capturing localStorage
  - Capturing sessionStorage
  - Capturing IndexedDB
  - Working with captured data

### Architecture & Design
- **[design.md](./design.md)** - Storage capture system architecture
  - Design principles
  - Data flow
  - Integration points
  - API design
  - Performance considerations

### Implementation
- **[implementation.md](./implementation.md)** - Implementation details and best practices
  - How it works internally
  - Integration with PuppeteerPlugin
  - Error handling
  - Edge cases and limitations

### Reference Materials
- **[quick-reference.txt](./quick-reference.txt)** - Quick lookup reference
- **[architecture-diagram.txt](./architecture-diagram.txt)** - ASCII architecture diagram

---

## 🎯 Storage Types

### localStorage
- **Scope:** Per-domain, persistent across browser sessions
- **Use Cases:** User preferences, auth tokens, feature flags, cached data
- **Limitations:** 5-10 MB per domain

### sessionStorage
- **Scope:** Per-tab/window, cleared on close
- **Use Cases:** Session state, temporary data, form state
- **Limitations:** 5-10 MB per tab

### IndexedDB
- **Scope:** Per-domain, persistent, indexed
- **Use Cases:** Offline data, large datasets, structured queries
- **Limitations:** Browser-dependent quota (50 MB - 1 GB+)

### Cookies
- **Scope:** Per-domain, with path and expiration control
- **Use Cases:** Session IDs, tracking, authentication
- **Limitations:** 4 KB per cookie, ~180 per domain

---

## 🚀 Quick Example

```javascript
import { Database } from 's3db.js';
import { PuppeteerPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

// Initialize plugin (storage capture is automatic)
const puppet = new PuppeteerPlugin({
  pool: { maxBrowsers: 3 }
});

await db.usePlugin(puppet);
await db.connect();

// Open page and capture storage
const page = await puppet.getPage();
await page.goto('https://example.com');

// Capture all storage types
const storage = await puppet.captureAllStorage(page);
console.log('localStorage:', storage.localStorage.data);
console.log('IndexedDB:', storage.indexedDB.databases);

await puppet.releasePage(page);
```

---

## 📊 What Gets Captured

### localStorage Data
```javascript
{
  present: true,
  itemCount: 15,
  data: {
    'auth_token': 'eyJhbG...',
    'user_preferences': '{"theme":"dark"}',
    'cache_version': '2.1.0'
  }
}
```

### IndexedDB Structure
```javascript
{
  present: true,
  databases: [
    {
      name: 'firebase',
      version: 1,
      stores: [
        {
          name: 'users',
          recordCount: 342,
          keyPath: '_id',
          indexes: ['email', 'created_at']
        }
      ]
    }
  ]
}
```

---

## 🔗 Related Documentation

- [← Back to Puppeteer Plugin](../README.md)
- [← Plugin Index](../../README.md)
- [Performance Guide](../guides/performance.md)
- [Network Monitoring Guide](../guides/network-monitoring.md)

---

## 💡 When to Use

| Scenario | What to Use |
|----------|----------|
| **Debug stored state** | captureAllStorage() |
| **Find auth tokens** | captureLocalStorage() |
| **Analyze session data** | captureSessionStorage() |
| **Inspect app databases** | captureIndexedDB() |

---

**Last Updated:** November 2024
**Puppeteer Plugin Version:** 1.0.0+

🎭 **Happy debugging!**
