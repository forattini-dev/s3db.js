# PuppeteerPlugin Storage Capture - Complete Design Documentation

Welcome! This folder contains comprehensive analysis and design documentation for implementing localStorage and IndexedDB capture in the PuppeteerPlugin.

## Quick Navigation

### Start Here
- **[PUPPETEER_STORAGE_IMPLEMENTATION_GUIDE.md](./PUPPETEER_STORAGE_IMPLEMENTATION_GUIDE.md)** - Master guide with quickstart and checklist

### Detailed Design
- **[puppeteer-storage-capture-design.md](./puppeteer-storage-capture-design.md)** - Full architecture analysis and implementation specs
- **[puppeteer-storage-quick-ref.txt](./puppeteer-storage-quick-ref.txt)** - Quick reference with exact line numbers
- **[puppeteer-storage-architecture-diagram.txt](./puppeteer-storage-architecture-diagram.txt)** - Visual ASCII diagrams

## What You'll Find

### In the IMPLEMENTATION GUIDE
- Overview of what needs to be built
- Recommended approach (separate StorageManager class)
- Step-by-step implementation roadmap
- Configuration options
- Usage examples
- Testing strategy
- Troubleshooting tips
- Implementation checklist

### In the DESIGN DOCUMENT
- Current PuppeteerPlugin architecture
- Detailed design of StorageManager
- All three storage capture methods
- S3DB resource schemas
- Configuration integration
- Complete code templates
- Performance considerations
- Testing considerations

### In the QUICK REFERENCE
- Key architectural decisions
- Integration points with exact line numbers
- Resource schemas at a glance
- Configuration options summary
- Usage patterns
- Estimated implementation time
- File structure after implementation

### In the ARCHITECTURE DIAGRAMS
- Plugin initialization flow
- Page navigation flow with storage capture
- Data flow from page to S3DB
- Manager pattern consistency
- S3DB resource structure
- Returned data structures

## The Recommendation

**Create a separate StorageManager class** that:
- Follows the existing NetworkMonitor/ConsoleMonitor pattern
- Implements `captureStorage(page, sessionId, context)` as main API
- Automatically captures localStorage, sessionStorage, and IndexedDB
- Attaches results to `page._storageData` for immediate access
- Optionally persists to S3DB
- Handles errors gracefully without failing navigation

## Key Features

✓ **Automatic Capture** - No user code needed, happens during navigate()
✓ **Flexible** - Works with or without S3DB persistence
✓ **Configurable** - Each storage type independently toggleable
✓ **Fast** - Capture takes ~50-200ms
✓ **Consistent** - Follows existing plugin patterns
✓ **Well-documented** - 1,680 lines of design specs

## Implementation Estimate

- StorageManager creation: 3-4 hours
- Integration with plugin: 1-2 hours
- Tests: 2-3 hours
- Documentation: 1-2 hours
- **Total: 7-11 hours**

## Files to Create/Modify

### New Files
- `src/plugins/puppeteer/storage-manager.js` (300-400 lines)
- `tests/plugins/puppeteer-storage.test.js` (200-300 lines)

### Modified Files
- `src/plugins/puppeteer.plugin.js` (+50-100 lines)

## Data Structure

The captured storage returns a single object:

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

Available at `page._storageData` immediately after navigation.

## S3DB Resources Created

When persistence is enabled, three resources are created:

1. **plg_puppeteer_storage_local** - localStorage data
2. **plg_puppeteer_storage_session** - sessionStorage data
3. **plg_puppeteer_storage_indexeddb** - IndexedDB data

All use `body-overflow` behavior to automatically handle S3 metadata limits.

## Configuration Example

```javascript
new PuppeteerPlugin({
  storage: {
    enabled: true,
    persist: true,
    capture: {
      localStorage: true,
      indexedDB: true,
      sessionStorage: true
    },
    compression: {
      enabled: true,
      threshold: 10240
    },
    filters: {
      excludeKeys: ['token', '__session'],
      maxItemSize: 1048576,
      maxTotalSize: 10485760
    }
  }
})
```

## Usage Examples

### Auto-Capture
```javascript
const plugin = new PuppeteerPlugin({ storage: { enabled: true } });
const page = await plugin.navigate('https://example.com');
console.log(page._storageData.localStorage);
await page.close();
```

### With Sessions
```javascript
await plugin.withSession('user-123', async (page) => {
  const user = JSON.parse(page._storageData.localStorage.user);
  console.log('Logged in as:', user.name);
}, { url: 'https://example.com/dashboard' });
```

### Manual Capture
```javascript
const page = await plugin.navigate('https://example.com');
await page.click('button');
const updated = await plugin.storageManager.captureStorage(page, sessionId);
await page.close();
```

## Next Steps

1. **Review** - Start with PUPPETEER_STORAGE_IMPLEMENTATION_GUIDE.md
2. **Understand** - Review src/plugins/puppeteer/network-monitor.js for pattern reference
3. **Implement** - Follow the implementation roadmap in the guide
4. **Test** - Write unit and integration tests
5. **Document** - Create usage examples

## Questions?

Refer to the implementation guide's troubleshooting section or check the architecture diagrams for visual understanding of the data flow.

---

**Documentation Created**: November 14, 2024
**Status**: Design Complete - Ready for Implementation
**Complexity**: Medium (follows existing patterns)
**Effort Estimate**: 7-11 hours

All documentation has been thoroughly analyzed from the s3db.js codebase to ensure consistency with existing patterns and best practices.
