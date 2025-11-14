# PuppeteerPlugin Storage Capture - Complete Implementation Guide

## Documentation Overview

This directory contains comprehensive design documentation for implementing localStorage and IndexedDB capture in the PuppeteerPlugin.

### Files in This Documentation Set

1. **puppeteer-storage-capture-design.md** (17 KB)
   - Comprehensive architecture analysis
   - Detailed implementation specifications
   - Configuration schema
   - Usage examples
   - Testing considerations
   - Full method signatures and schemas

2. **puppeteer-storage-quick-ref.txt** (15 KB)
   - Quick reference summary
   - Key architectural decisions
   - Integration points in main plugin
   - Resource schemas at-a-glance
   - Implementation timeline estimate

3. **puppeteer-storage-architecture-diagram.txt** (20 KB)
   - Visual ASCII diagrams showing:
     - Plugin initialization flow
     - Page navigation flow with storage capture
     - Data flow from page to S3DB
     - Manager pattern consistency
     - S3DB resource structure
     - Returned data structures

## Quick Start for Implementation

### Step 1: Create StorageManager (3-4 hours)
Create `src/plugins/puppeteer/storage-manager.js` with:
- Constructor and initialization
- `captureStorage(page, sessionId, context)` - main API
- `_captureLocalStorage(page)` - localStorage extraction
- `_captureSessionStorage(page)` - sessionStorage extraction
- `_captureIndexedDB(page)` - IndexedDB extraction
- `_persistStorageData(results)` - S3DB insertion

See puppeteer-storage-capture-design.md for complete code template.

### Step 2: Integrate with PuppeteerPlugin (1-2 hours)
Modify `src/plugins/puppeteer.plugin.js`:
1. Add storage config option (lines ~203-210)
2. Add resource descriptors (lines ~280-284)
3. Add `this.storageManager = null` (lines ~315-316)
4. Add initialization call in `onStart()` (lines ~392-398)
5. Add `_initializeStorageManager()` method (lines ~567)
6. Add capture hook in `navigate()` (after line 955)

See puppeteer-storage-quick-ref.txt for exact line numbers and code snippets.

### Step 3: Write Tests (2-3 hours)
Create `tests/plugins/puppeteer-storage.test.js` with:
- Unit tests for StorageManager
- Integration tests with PuppeteerPlugin
- Mock strategies for testing

### Step 4: Documentation (1-2 hours)
Create example and update main README with usage patterns.

## Architecture Summary

### Manager Pattern
StorageManager follows the same pattern as existing managers:
- CookieManager
- NetworkMonitor
- ConsoleMonitor
- PerformanceManager

### Key Design Decisions

1. **Separate Manager Class** - Maintains modularity and consistency
2. **Auto-capture in navigate()** - Ensures storage is always captured
3. **Optional Persistence** - Can capture without saving to S3DB
4. **Three Separate Resources** - localStorage, sessionStorage, indexedDB
5. **Configurable Capture** - Each storage type can be toggled independently

### Configuration Options

```javascript
new PuppeteerPlugin({
  storage: {
    enabled: false,                    // Enable/disable entirely
    persist: false,                    // Save to S3DB
    capture: {
      localStorage: true,              // Capture window.localStorage
      indexedDB: true,                 // Capture all indexedDB
      sessionStorage: true             // Capture window.sessionStorage
    },
    compression: {
      enabled: true,
      threshold: 10240                 // Compress > 10KB
    },
    filters: {
      excludeKeys: [],                 // ['token', '__session']
      maxItemSize: 1048576,            // 1MB per item
      maxTotalSize: 10485760           // 10MB total
    }
  }
})
```

## Data Flow

```
Page Navigation
  ↓
page.goto(url) - DOM loads
  ↓
Post-navigation hooks
  ├─ Screenshot (if enabled)
  └─ STORAGE CAPTURE (new)
      ├─ _captureLocalStorage()
      ├─ _captureSessionStorage()
      ├─ _captureIndexedDB()
      ↓
    Attach to page._storageData
      ↓
    (Optional) Persist to S3DB
      ├─ localStorageResource.insert()
      ├─ sessionStorageResource.insert()
      └─ indexedDBResource.insert()
```

## Return Structure

The `captureStorage()` method returns:

```javascript
{
  localStorage: { key: 'value', ... },
  sessionStorage: { key: 'value', ... },
  indexedDB: {
    databaseName: {
      storeName: [ records ]
    }
  },
  timestamp: 1731611400000,
  sessionId: 'session-123',
  url: 'https://example.com',
  domain: 'example.com'
}
```

Available at: `page._storageData` after navigation completes.

## S3DB Resources Created

Three resources are created when persistence is enabled:

1. **plg_puppeteer_storage_local**
   - Stores localStorage data
   - Partitioned by: url, domain, date

2. **plg_puppeteer_storage_session**
   - Stores sessionStorage data
   - Partitioned by: url, domain, date

3. **plg_puppeteer_storage_indexeddb**
   - Stores IndexedDB data
   - Partitioned by: domain, databaseName, date

All use 'body-overflow' behavior to auto-handle S3 metadata limits.

## Usage Examples

### Basic Auto-Capture
```javascript
const plugin = new PuppeteerPlugin({
  storage: { enabled: true, persist: true }
});

const page = await plugin.navigate('https://example.com');
console.log(page._storageData.localStorage);
await page.close();
```

### With Session
```javascript
await plugin.withSession('user-123', async (page) => {
  const user = JSON.parse(page._storageData.localStorage.user);
  console.log('Logged in as:', user.name);
}, {
  url: 'https://example.com/dashboard'
});
```

### Manual Capture
```javascript
const page = await plugin.navigate('https://example.com');
await page.click('button');
const updated = await plugin.storageManager.captureStorage(page, sessionId);
await page.close();
```

## Testing Strategy

### Unit Tests
- Test localStorage capture
- Test sessionStorage capture
- Test IndexedDB capture
- Test filtering and size limits
- Test resource creation

### Integration Tests
- Test auto-capture in navigate()
- Test page._storageData availability
- Test with sessions
- Test disabled scenarios

### Mock Strategy
```javascript
plugin.storageManager.captureStorage = jest.fn()
  .mockResolvedValue({
    localStorage: { test: 'value' },
    indexedDB: {},
    sessionStorage: {}
  });
```

## Implementation Checklist

- [ ] Read all three documentation files
- [ ] Create storage-manager.js (300-400 lines)
- [ ] Integrate with puppeteer.plugin.js (50-100 lines)
- [ ] Add configuration options
- [ ] Implement resource creation
- [ ] Add capture hook to navigate()
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Create usage examples
- [ ] Update main plugin documentation
- [ ] Test with real pages

## Key Files to Modify

### New Files
- `src/plugins/puppeteer/storage-manager.js` - NEW

### Modified Files
- `src/plugins/puppeteer.plugin.js` - Add StorageManager integration

### Test Files
- `tests/plugins/puppeteer-storage.test.js` - NEW

## Related Files (Reference)

For understanding the pattern, review:
- `src/plugins/puppeteer/cookie-manager.js` (490 lines)
- `src/plugins/puppeteer/network-monitor.js` (650+ lines)
- `src/plugins/puppeteer/console-monitor.js` (500+ lines)

## Performance Considerations

- **localStorage/sessionStorage**: O(n) where n = number of keys (typically < 100)
- **IndexedDB**: O(m) where m = number of records (can be large)
- **Capture time**: Usually 50-200ms per page
- **Compression**: Enabled by default for payloads > 10KB
- **Size limits**: Configurable to prevent bloat

## Error Handling

Storage capture errors:
- Won't fail page navigation
- Emit `puppeteer.storageCaptureFailed` event
- Are logged but don't throw
- Continue with rest of flow

## Browser Compatibility

- **localStorage**: Available in all modern browsers
- **sessionStorage**: Available in all modern browsers
- **IndexedDB**: Available in all modern browsers except IE (not supported)
  - Uses `indexedDB.databases()` (modern browsers only)
  - Gracefully handles unavailable databases

## Security Considerations

- Storage data is unencrypted by default
- Consider enabling S3DB encryption for sensitive data
- Use `filters.excludeKeys` to exclude tokens, passwords, etc.

## Future Enhancements

Possible future additions:
- Encryption for sensitive storage items
- Diff tracking (only capture changed values)
- Storage size monitoring
- Custom extraction functions
- Event listeners for storage changes during navigation
- IndexedDB schema analysis

## Questions & Troubleshooting

### StorageManager not capturing data?
1. Check `storage.enabled: true`
2. Verify page navigated successfully
3. Check browser console for errors
4. Ensure page has actual storage data

### Resources not being created?
1. Check `storage.persist: true`
2. Check database connection is active
3. Review error events emitted
4. Verify S3DB permissions

### Storage data too large?
1. Enable compression (enabled by default)
2. Increase `maxTotalSize` or `maxItemSize`
3. Use `excludeKeys` to skip large items
4. Consider separate capture outside navigate()

## References

- S3DB Behavior Types: `/home/ff/work/martech/shortner/s3db.js/docs/behavior-types.md`
- S3DB Partitioning: `/home/ff/work/martech/shortner/s3db.js/docs/partitions.md`
- PuppeteerPlugin Main Docs: `/home/ff/work/martech/shortner/s3db.js/docs/plugins/puppeteer/`
- NetworkMonitor Pattern: `/home/ff/work/martech/shortner/s3db.js/src/plugins/puppeteer/network-monitor.js`

---

**Created**: 2024-11-14
**Status**: Design Complete - Ready for Implementation
**Estimated Effort**: 7-11 hours
**Complexity**: Medium (follows existing patterns)
