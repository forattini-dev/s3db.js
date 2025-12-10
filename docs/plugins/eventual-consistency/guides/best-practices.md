# Best Practices & FAQ

> **In this guide:** Recommendations, troubleshooting, events, and FAQ.

**Navigation:** [← Back to EventualConsistency Plugin](/plugins/eventual-consistency/README.md) | [Configuration](/plugins/eventual-consistency/guides/configuration.md)

---

## Best Practices

### Recommendations

- Use **sync mode** for critical data (money, inventory)
- Use **async mode** for metrics and counters
- Enable **analytics** for dashboards
- Use **hooks** for auto-increment
- Always **create the record first** before incrementing
- Configure `asyncPartitions: true` on resource (70-100% faster)

### Cautions

- **Batch mode** loses data on crash
- **Custom reducers** must be pure functions
- **Timezone** affects cohort partitioning

### Correct Flow

```javascript
// ALWAYS create the record first
await urls.insert({
  id: 'url-123',
  link: 'https://example.com',
  clicks: 0
});

// Then increment
await urls.add('url-123', 'clicks', 1);

// Sync mode consolidates automatically
const url = await urls.get('url-123');
console.log(url.clicks); // 1
```

---

## Troubleshooting

### Transactions don't consolidate

```javascript
// Check mode
console.log(plugin.config.mode);  // 'async' or 'sync'

// Consolidate manually
await resource.consolidate(id, field);

// Check auto-consolidation
console.log(plugin.config.autoConsolidate);  // true?
```

### Slow performance

```javascript
// Enable async partitions
await db.createResource({
  name: 'wallets',
  asyncPartitions: true  // 70-100% faster
});

// Increase consolidation concurrency
{ consolidation: { concurrency: 10 } }  // default: 5

// Increase mark applied concurrency
{ consolidation: { markAppliedConcurrency: 100 } }  // default: 50

// Reduce window
{ consolidation: { window: 12 } }  // default: 24h
```

### Missing analytics

```javascript
// Check configuration
console.log(plugin.config.enableAnalytics);

// Check resource created
console.log(db.resources.plg_wallets_an_balance);
```

---

## Debug Mode

### Complete Debug Logging

The plugin shows detailed logs at **THREE moments**:

**1. BEFORE update:**
```javascript
[DEBUG] BEFORE targetResource.update() {
  originalId: 'abc123',
  field: 'clicks',
  consolidatedValue: 2,
  currentValue: 0
}
```

**2. AFTER update:**
```javascript
[DEBUG] AFTER targetResource.update() {
  updateOk: true,
  updateErr: undefined,
  updateResult: { clicks: 0 },
  hasField: 0
}
```

**3. VERIFICATION (fresh from S3):**
```javascript
[DEBUG] VERIFICATION (fresh from S3, no cache) {
  verifyOk: true,
  verifiedRecord[clicks]: 2,
  expectedValue: 2,
  MATCH: true
}
```

### Enable Debug Mode

```javascript
// logLevel: 'debug' is the default!
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  // Don't need to pass logLevel: 'debug'
});

// Or use debug mode for additional logs
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  debug: true
});
```

---

## Events

### `plg:eventual-consistency:started`

Emitted when consolidation or garbage collection starts:

```javascript
plugin.on('plg:eventual-consistency:started', (data) => {
  console.log(`Started for ${data.resource}.${data.field}`);
});
```

### `plg:eventual-consistency:stopped`

Emitted when consolidation/garbage collection stops:

```javascript
plugin.on('plg:eventual-consistency:stopped', (data) => {
  console.log(`Stopped for ${data.resource}.${data.field}`);
});
```

### `plg:eventual-consistency:consolidated`

Emitted after each successful consolidation run:

```javascript
plugin.on('plg:eventual-consistency:consolidated', (data) => {
  console.log(`Consolidated ${data.recordCount} records in ${data.duration}ms`);
  console.log(`Success: ${data.successCount}, Errors: ${data.errorCount}`);
});
```

### `plg:eventual-consistency:consolidation-error`

Emitted when consolidation encounters an error:

```javascript
plugin.on('plg:eventual-consistency:consolidation-error', (error) => {
  console.error('Consolidation error:', error);
});
```

### `plg:eventual-consistency:gc-completed`

Emitted after garbage collection completes:

```javascript
plugin.on('plg:eventual-consistency:gc-completed', (data) => {
  console.log(`GC deleted ${data.deletedCount} old transactions`);
});
```

### `plg:eventual-consistency:gc-error`

Emitted when garbage collection encounters an error:

```javascript
plugin.on('plg:eventual-consistency:gc-error', (error) => {
  console.error('GC error:', error);
});
```

---

## FAQ

### For Developers

**Q: What's the difference between sync and async mode?**
**A:**
- **Sync mode**: Consolidation happens immediately when you call `add()`/`sub()`. Good for critical data like wallets/balances.
- **Async mode**: Consolidation happens eventually (background job every 5 minutes by default). Good for non-critical data like counters/metrics.

**Q: Does the plugin create records automatically?**
**A:** No! The plugin DOES NOT create records. Transactions remain pending until you create the record manually.

```javascript
// This won't work - no record exists
await wallets.add('new-wallet-id', 'balance', 100);

// This works - create record first
await wallets.insert({ id: 'new-wallet-id', balance: 0 });
await wallets.add('new-wallet-id', 'balance', 100);
```

**Q: How do I handle race conditions with concurrent add() calls?**
**A:** The plugin uses transactions to handle concurrency:
1. Each `add()`/`sub()` creates a transaction
2. Consolidation reads all pending transactions
3. All transactions are applied atomically
4. Transactions are marked as applied

**Q: Can I use nested fields?**
**A:** Yes! Use dot notation for nested paths:

```javascript
new EventualConsistencyPlugin({
  resources: {
    users: ['profile.stats.totalPosts', 'metrics.engagement.likes']
  }
});

await users.add('user-123', 'profile.stats.totalPosts', 1);
```

**Q: What's the performance impact of analytics?**
**A:** Analytics are pre-calculated in the background, so queries are O(1) lookups:
- Hour analytics: ~720 records per month per field
- Day analytics: ~30 records per month per field
- Week analytics: ~52 records per year per field
- Month analytics: ~12 records per year per field

### For AI Agents

**Q: What problem does this plugin solve?**
**A:** Provides atomic transactions (add/sub/set) for numeric fields with complete audit trail, eventual consistency guarantees, and pre-calculated time-series analytics.

**Q: What are the minimum required parameters?**
**A:** Only `resources` is required:

```javascript
new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] }
})
```

**Q: What are the default values for all configurations?**
**A:**
```javascript
{
  resources: {},              // Required
  consolidation: {
    mode: 'async',
    auto: true,
    interval: 300,
    window: 24,
    concurrency: 5,
    markAppliedConcurrency: 50
  },
  analytics: {
    enabled: false,
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum', 'avg', 'min', 'max']
  },
  logLevel: 'debug',
  debug: false,
  locks: { timeout: 300 },
  garbageCollection: { enabled: true, interval: 86400, retention: 30 },
  checkpoints: { enabled: true, strategy: 'hourly', retention: 90 },
  cohort: { timezone: 'UTC' }
}
```

**Q: What resources are created automatically?**
**A:** For each tracked field:
1. **Transaction resource**: `plg_{resourceName}_tx_{fieldName}` - Stores all transactions
2. **Analytics resource** (if enabled): `plg_{resourceName}_an_{fieldName}` - Pre-calculated data

---

## See Also

- [Configuration](/plugins/eventual-consistency/guides/configuration.md) - All options and API reference
- [Usage Patterns](/plugins/eventual-consistency/guides/usage-patterns.md) - Examples and use cases
