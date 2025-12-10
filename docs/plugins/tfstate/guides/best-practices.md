# Best Practices & FAQ

> **In this guide:** Performance optimization, troubleshooting, and comprehensive FAQ.

**Navigation:** [← Back to TfState Plugin](../README.md) | [Configuration](./configuration.md)

---

## Performance Optimization

### Use Partition-Based Queries

```javascript
// ❌ Slow - full scan
const ec2 = await plugin.resource.query({ resourceType: 'aws_instance' });

// ✅ Fast - partition query (O(1))
const ec2 = await plugin.getResourcesByType('aws_instance');
```

### Enable Async Partitioning

```javascript
// Default: true - 70-100% faster writes
const plugin = new TfStatePlugin({
  asyncPartitions: true
});
```

### Use Filters for Large Infrastructures

```javascript
// Import only needed resource types
const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],
    providers: ['aws']
  }
});
```

### Disable Diff Tracking if Not Needed

```javascript
// Skip diff calculation for faster imports
const plugin = new TfStatePlugin({
  trackDiffs: false
});
```

### Query Performance (10,000+ Resources)

| Query Type | Method | Performance |
|------------|--------|-------------|
| Type query | `getResourcesByType()` | O(1) - 10-50ms |
| Provider query | `getResourcesByProvider()` | O(1) - 10-50ms |
| Combined query | `getResourcesByProviderAndType()` | O(1) - 10-50ms |
| Full scan | `resource.query()` | O(n) - avoid unless necessary |

### Storage Estimates

| Resources | Approximate Storage |
|-----------|---------------------|
| 100 | 100-500 KB |
| 1,000 | 1-5 MB |
| 10,000 | 10-50 MB |

---

## Troubleshooting

### Import Fails with "Invalid state file"

**Solution:**
1. Check it's a valid JSON file
2. Ensure it has `version`, `lineage`, and `resources` fields
3. Try opening in a text editor to inspect structure
4. Enable debug mode: `new TfStatePlugin({ logLevel: 'debug' })`

### Resources Not Showing After Import

**Check filters:**
```javascript
// No filters (imports everything)
const plugin = new TfStatePlugin();

// With filters (may exclude some resources)
const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance'],  // Only imports aws_instance
    providers: ['aws']         // Only imports AWS resources
  }
});
```

### Diff Tracking Not Working

**Verify:**
1. `trackDiffs: true` (default)
2. Import same state file with different serial numbers
3. Check `diffsResource.list()` for diff records
4. Enable debug mode to see diff calculations

### Queries Are Slow

**Use partition-based queries:**
```javascript
// ❌ Slow
const ec2 = await plugin.resource.query({ resourceType: 'aws_instance' });

// ✅ Fast
const ec2 = await plugin.getResourcesByType('aws_instance');
```

### SHA256 Deduplication Not Working

Deduplication works automatically. If a state is reimported:
1. Check `logLevel: 'debug'` logs - should show "Skipping duplicate state"
2. Verify state content is identical (same serial, lineage, resources)
3. Different serials = different states (will be imported)

### Error: "Resource already exists"

This occurs if plugin is used multiple times with same resource names.

**Solution:** Use different namespaces:
```javascript
const plugin1 = new TfStatePlugin({ namespace: 'infra' });
const plugin2 = new TfStatePlugin({ namespace: 'apps' });
```

---

## FAQ

### General

**Q: What does the TfStatePlugin do?**

A: Transforms Terraform/OpenTofu .tfstate files into queryable s3db resources with automatic change tracking, partition-based indexing, SHA256 deduplication, and infrastructure analytics capabilities.

**Q: Does TfStatePlugin require external dependencies?**

A: No! Zero external dependencies. Everything is built into s3db.js core: Terraform/OpenTofu state parser, SHA256 hashing, diff calculation, provider detection, partition indexing, and glob pattern matching.

**Q: Does the plugin modify my .tfstate files?**

A: No! The plugin only **reads** the files. It never modifies the original `.tfstate` files. All data is safely stored in separate s3db resources.

**Q: Does it work with OpenTofu?**

A: Yes! OpenTofu uses the same `.tfstate` format as Terraform. The plugin works perfectly with both.

**Q: Can I use it in production?**

A: Yes! The plugin:
- Never modifies original files
- Has SHA256 deduplication (won't import same file twice)
- Uses partitions for fast O(1) queries
- Supports async partition indexing (70-100% faster writes)
- Is fully backward compatible

**Q: Which Terraform/OpenTofu versions are supported?**

A: All versions:
- Terraform: all versions (0.x, 1.x, 2.x+)
- OpenTofu: all versions
- State format versions: v3, v4
- Any backend: local files, S3, GCS, Azure Blob, HTTP, etc.

**Q: Can I use it with MemoryClient for testing?**

A: Yes! Works perfectly with MemoryClient for fast, isolated testing:
```javascript
const db = new Database({ connectionString: 'memory://test/db' });
const plugin = new TfStatePlugin();
await db.usePlugin(plugin);
await plugin.importState('./terraform.tfstate');
```

---

### Configuration

**Q: What are the required configuration parameters?**

A: None! All parameters are optional:
```javascript
const plugin = new TfStatePlugin(); // Uses all defaults
await db.usePlugin(plugin);
```

**Q: What are the default values?**

A:
- `resourceName`: `'plg_tfstate_resources'`
- `stateFilesName`: `'plg_tfstate_states'`
- `diffsName`: `'plg_tfstate_diffs'`
- `trackDiffs`: `true`
- `logLevel`: `false`
- `asyncPartitions`: `true`
- `filters`: `undefined` (no filters, imports everything)

**Q: How to customize resource names?**

A:
```javascript
const plugin = new TfStatePlugin({
  resourceName: 'terraform_resources',
  stateFilesName: 'terraform_states',
  diffsName: 'terraform_changes'
});
```

**Q: How to enable debug logging?**

A:
```javascript
const plugin = new TfStatePlugin({
  logLevel: 'debug'
});
```

---

### Importing States

**Q: How do I update the data when state changes?**

A: Manually call import methods when you want to update:
```javascript
// Manual import
await plugin.importState('./terraform.tfstate');

// Or schedule automatic imports
setInterval(async () => {
  await plugin.importStateFromS3('prod/terraform.tfstate');
}, 5 * 60 * 1000);  // Every 5 minutes
```

**Q: What happens if I import the same state twice?**

A: SHA256 deduplication prevents duplicate imports. If the state content is identical, it won't be reimported.

**Q: Can I import states from different Terraform workspaces?**

A: Yes! Each workspace's state file can be imported:
```javascript
await plugin.importState('./terraform.tfstate.d/prod/terraform.tfstate');
await plugin.importState('./terraform.tfstate.d/staging/terraform.tfstate');
```

---

### Change Tracking & Diffs

**Q: How does diff tracking work?**

A: When `trackDiffs: true` (default), the plugin automatically compares each new state import with the previous version (by serial number). Diffs are calculated using deep comparison of resource attributes.

**Q: What details are included in modified resource diffs?**

A: Each modified resource includes:
- `resourceAddress`: Full Terraform address
- `resourceType`: Type (e.g., `aws_instance`)
- `resourceName`: Name in Terraform config
- `changedFields`: Array of attribute paths that changed
- `oldSerial` / `newSerial`: Version numbers

**Q: Can I disable diff tracking for performance?**

A: Yes, set `trackDiffs: false`:
```javascript
const plugin = new TfStatePlugin({
  trackDiffs: false
});
```

---

### Provider Detection

**Q: How does provider detection work?**

A: The plugin automatically detects providers from resource type prefixes:
- `aws_*` → `aws`
- `google_*` → `google`
- `azurerm_*` → `azure`
- `kubernetes_*` → `kubernetes`
- `random_*` → `random`
- `null_*` → `null`

**Q: Can I query multi-cloud infrastructure?**

A: Yes! Query by provider to see resources across clouds:
```javascript
const providers = ['aws', 'google', 'azure'];

for (const provider of providers) {
  const resources = await plugin.getResourcesByProvider(provider);
  console.log(`${provider}: ${resources.length} resources`);
}
```

---

### Performance & Storage

**Q: How much storage does it consume?**

A: Depends on resource count:
- **State metadata**: A few KB per state file
- **Extracted resources**: ~1-5 KB per resource (depends on attributes)
- **Diffs**: Only stores changes, no duplication
- **SHA256 deduplication**: Identical states aren't reimported

**Q: How fast are queries?**

A: Very fast thanks to partition-based indexing:
- Type queries: O(1) using `byType` partition
- Provider queries: O(1) using `byProvider` partition
- Combined queries: O(1) using `byProviderAndType` partition
- No full table scans needed

**Q: Can I query across multiple state files?**

A: Yes! All imported states are queryable together:
```javascript
const allEc2 = await plugin.getResourcesByType('aws_instance');
// Returns EC2 instances from ALL imported states

// Or query specific state
const prodEc2 = await plugin.resource.query({
  resourceType: 'aws_instance',
  sourceFile: 'prod/terraform.tfstate'
});
```

---

### Advanced Usage

**Q: How to use multiple plugin instances?**

A: Use namespaces:
```javascript
const infraPlugin = new TfStatePlugin({ namespace: 'infra' });
const appsPlugin = new TfStatePlugin({ namespace: 'apps' });

await db.usePlugin(infraPlugin);
await db.usePlugin(appsPlugin);

// Resources: plg_infra_tfstate_resources, plg_apps_tfstate_resources
```

**Q: How to integrate with monitoring systems?**

A: Use s3db resource events:
```javascript
plugin.resource.on('insert', (data) => {
  metrics.increment('tfstate.resources.added');
});

plugin.diffsResource.on('insert', (diff) => {
  if (diff.summary.deletedCount > 10) {
    alerts.send(`Large deletion: ${diff.summary.deletedCount} resources`);
  }
});
```

---

### For AI Agents

**Q: What problem does this plugin solve?**

A: Transforms unqueryable Terraform .tfstate files into structured, queryable s3db resources with automatic change tracking, partition-based indexing, SHA256 deduplication, and infrastructure analytics capabilities.

**Q: What are the 3 resources created by this plugin?**

A:
1. **`plg_tfstate_states`**: State file metadata (sourceFile, serial, lineage, resourceCount, sha256Hash)
2. **`plg_tfstate_resources`**: Extracted infrastructure resources with 5 partitions (byType, byProvider, bySerial, bySourceFile, byProviderAndType)
3. **`plg_tfstate_diffs`**: Change history (added/modified/deleted resources, summary statistics)

**Q: What are the partition strategies?**

A:
- **States**: `bySourceFile` (query by file), `bySerial` (query by version)
- **Resources**: `byType`, `byProvider`, `bySerial`, `bySourceFile`, `byProviderAndType` (all sync for O(1) lookups)
- **Diffs**: `bySourceFile`, `byOldSerial`, `byNewSerial`

**Q: What events does this plugin emit?**

A: No custom events. Uses standard s3db resource events (insert, update, delete) on the 3 created resources.

**Q: What's the internal architecture for state parsing?**

A:
1. Read .tfstate file (local or S3)
2. Calculate SHA256 hash for deduplication
3. Extract state metadata (serial, lineage, terraform_version)
4. Parse resources array
5. Detect provider from resource type prefix
6. Store in resources table with partition values
7. If trackDiffs enabled, compare with previous serial
8. Calculate diff (added, modified, deleted)
9. Store diff in diffs table

**Q: How is SHA256 deduplication implemented?**

A: Before importing:
1. Calculate SHA256 hash of entire state content
2. Query `stateFilesResource` for existing hash
3. If found, skip import and return existing record
4. If not found, proceed with full import
5. Store hash in state metadata for future checks

**Q: What's the memory footprint for large states?**

A: Minimal:
- State file loaded into memory during parsing (~state file size)
- Resources inserted individually (no batch loading)
- Diff calculated incrementally (not all in memory)
- Typical: 10-50 MB for 1000+ resources
- Async partitioning reduces memory spikes

---

## Compatibility

- ✅ Terraform (all versions)
- ✅ OpenTofu (all versions)
- ✅ State versions: v3, v4
- ✅ Backends: local, S3, anywhere accessible
- ✅ Providers: AWS, Google Cloud, Azure, Kubernetes, and others

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Usage Patterns](./usage-patterns.md) - Import methods, query patterns, real-world examples
