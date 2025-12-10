# Configuration

> **In this guide:** All configuration options, filter options, resource schemas, and API reference.

**Navigation:** [← Back to TfState Plugin](../README.md)

---

## Plugin Options

```javascript
new TfStatePlugin({
  resourceName: 'plg_tfstate_resources',   // Extracted resources table
  stateFilesName: 'plg_tfstate_states',    // State files metadata table
  diffsName: 'plg_tfstate_diffs',          // Change history table
  trackDiffs: true,                        // Enable diff tracking
  asyncPartitions: true,                   // 70-100% faster writes
  logLevel: false,                         // Enable debug logging
  filters: {}                              // Filter options
})
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resourceName` | string | `'plg_tfstate_resources'` | Name of extracted resources table |
| `stateFilesName` | string | `'plg_tfstate_states'` | Name of state files metadata table |
| `diffsName` | string | `'plg_tfstate_diffs'` | Name of diffs/changes table |
| `trackDiffs` | boolean | `true` | Enable automatic diff tracking between versions |
| `asyncPartitions` | boolean | `true` | Enable async partition indexing for faster writes |
| `logLevel` | string/boolean | `false` | Enable detailed logging (`'debug'`) |
| `namespace` | string | - | Namespace prefix for resources |

---

## Filter Options

```javascript
filters: {
  types: ['aws_instance', 'aws_s3_bucket'],  // Resource types to import
  providers: ['aws', 'google'],               // Providers to import
  exclude: ['data.*']                         // Patterns to exclude
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `filters.types` | Array&lt;string&gt; | Only import specific resource types |
| `filters.providers` | Array&lt;string&gt; | Only import from specific providers |
| `filters.exclude` | Array&lt;string&gt; | Exclude patterns (e.g., `['data.*']` for data sources) |

### Filter Examples

**Filter by Resource Types:**
```javascript
const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket']
  }
});
```

**Filter by Providers:**
```javascript
const plugin = new TfStatePlugin({
  filters: {
    providers: ['aws', 'google', 'azure']
  }
});
```

**Exclude Data Sources:**
```javascript
const plugin = new TfStatePlugin({
  filters: {
    exclude: ['data.*']  // Excludes all data sources
  }
});
```

---

## The 3 Created Resources

When you install this plugin, it automatically creates 3 s3db resources.

### 1. `plg_tfstate_states` - State File Metadata

Stores information about each imported `.tfstate` file.

**Main Fields:**
- `sourceFile` - Path or S3 URI of the state
- `serial` - State serial number
- `lineage` - Terraform lineage identifier
- `terraformVersion` - Terraform/OpenTofu version
- `resourceCount` - How many resources in this state
- `sha256Hash` - Hash for deduplication
- `importedAt` - When it was imported

**Partitions:**
- `bySourceFile` - Query by file
- `bySerial` - Query by version

### 2. `plg_tfstate_resources` - Extracted Resources

The main resource containing all infrastructure resources (EC2, RDS, S3, etc).

**Main Fields:**
- `resourceType` - Resource type (`aws_instance`, `aws_s3_bucket`)
- `resourceName` - Name given in Terraform
- `resourceAddress` - Full address (`aws_instance.web_server`)
- `providerName` - Provider (`aws`, `google`, `azure`, `kubernetes`)
- `attributes` - All resource attributes (JSON)
- `mode` - `managed` or `data`
- `stateSerial` - Which version it came from
- `sourceFile` - Which file it came from

**Partitions (sync for fast O(1) queries):**
- `byType` - Query by resource type
- `byProvider` - Query by provider
- `bySerial` - Query by version
- `bySourceFile` - Query by file
- `byProviderAndType` - Query by provider + type

### 3. `plg_tfstate_diffs` - Change History

Tracks what changed between state versions (if diff tracking is enabled).

**Main Fields:**
- `sourceFile` - Which state file
- `oldSerial` / `newSerial` - Which versions were compared
- `summary` - Quick statistics
  - `addedCount` - How many resources were created
  - `modifiedCount` - How many were modified
  - `deletedCount` - How many were deleted
- `changes` - Detailed arrays
  - `added` - List of created resources
  - `modified` - List of modified resources (with changed field details)
  - `deleted` - List of deleted resources
- `calculatedAt` - When the diff was calculated

**Partitions:**
- `bySourceFile` - Diffs of a specific state
- `byOldSerial` / `byNewSerial` - Diffs involving specific versions

---

## Import Options

Options that can be passed to import methods:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sourceFile` | string | (auto) | Override source file name when importing |

**Example:**
```javascript
await plugin.importState('./local.tfstate', {
  sourceFile: 'prod/terraform.tfstate'  // Custom name
});
```

---

## Provider Detection

The plugin automatically detects providers from resource type prefixes:

| Prefix | Provider |
|--------|----------|
| `aws_*` | `aws` |
| `google_*` | `google` |
| `azurerm_*` | `azure` |
| `kubernetes_*` | `kubernetes` |
| `random_*` | `random` |
| `null_*` | `null` |

**Examples:**
```javascript
aws_instance → provider: 'aws'
google_compute_instance → provider: 'google'
azurerm_virtual_machine → provider: 'azure'
kubernetes_deployment → provider: 'kubernetes'
```

---

## Namespaces

Use namespaces to run multiple TfStatePlugin instances:

```javascript
const infraPlugin = new TfStatePlugin({ namespace: 'infra' });
const appsPlugin = new TfStatePlugin({ namespace: 'apps' });

await db.usePlugin(infraPlugin);
await db.usePlugin(appsPlugin);

// Resources: plg_infra_tfstate_resources, plg_apps_tfstate_resources
```

---

## Complete Configuration Example

```javascript
const plugin = new TfStatePlugin({
  // === RESOURCE NAMES (optional) ===
  resourceName: 'terraform_resources',        // Default: plg_tfstate_resources
  stateFilesName: 'terraform_state_files',    // Default: plg_tfstate_states
  diffsName: 'terraform_diffs',               // Default: plg_tfstate_diffs

  // === DIFF TRACKING (optional) ===
  trackDiffs: true,  // Default: true

  // === FILTERS (optional) ===
  filters: {
    // Only import these types
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],

    // Only import from these providers
    providers: ['aws', 'google'],

    // Exclude data sources
    exclude: ['data.*']
  },

  // === PERFORMANCE ===
  asyncPartitions: true,  // Default: true - 70-100% faster writes

  // === DEBUG ===
  logLevel: 'debug'  // Default: false - detailed logs
});
```

---

## API Reference

### Import Methods

#### `importState(filePath, options)`
Import a local `.tfstate` file.

```javascript
await plugin.importState('./terraform.tfstate');
await plugin.importState('./terraform.tfstate', {
  sourceFile: 'custom-name.tfstate'
});
```

#### `importStateFromS3(key, options)`
Import a state from S3 (uses database.client).

```javascript
await plugin.importStateFromS3('prod/terraform.tfstate');
await plugin.importStateFromS3('environments/staging/terraform.tfstate');
```

#### `importStatesGlob(pattern, options)`
Import multiple local states using glob pattern.

```javascript
await plugin.importStatesGlob('./terraform/**/*.tfstate');
await plugin.importStatesGlob('./environments/*/terraform.tfstate');
```

#### `importStatesFromS3Glob(pattern, options)`
Import multiple states from S3 using glob pattern.

```javascript
await plugin.importStatesFromS3Glob('**/terraform.tfstate');
await plugin.importStatesFromS3Glob('environments/*/terraform.tfstate');
```

### Query Methods

#### `getResourcesByType(type)`
Find resources by type using partition (O(1)).

```javascript
const ec2 = await plugin.getResourcesByType('aws_instance');
const buckets = await plugin.getResourcesByType('aws_s3_bucket');
```

#### `getResourcesByProvider(provider)`
Find resources by provider using partition (O(1)).

```javascript
const aws = await plugin.getResourcesByProvider('aws');
const gcp = await plugin.getResourcesByProvider('google');
```

#### `getResourcesByProviderAndType(provider, type)`
Find resources by provider + type using combined partition (O(1)).

```javascript
const awsRds = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');
const gcpVMs = await plugin.getResourcesByProviderAndType('google', 'google_compute_instance');
```

### Diff Methods

#### `getDiff(sourceFile, oldSerial, newSerial)`
Compare two specific versions of a state.

```javascript
const diff = await plugin.getDiff('terraform.tfstate', 100, 101);
console.log(diff.summary);    // { addedCount, modifiedCount, deletedCount }
console.log(diff.changes);    // { added: [], modified: [], deleted: [] }
```

#### `getLatestDiff(sourceFile)`
Get the most recent diff for a state.

```javascript
const latest = await plugin.getLatestDiff('terraform.tfstate');
```

#### `getAllDiffs(sourceFile)`
Get all diffs for a state.

```javascript
const allDiffs = await plugin.getAllDiffs('terraform.tfstate');
```

### Statistics Methods

#### `getStats()`
General statistics for entire infrastructure.

```javascript
const stats = await plugin.getStats();
// {
//   totalStates: 5,
//   totalResources: 150,
//   totalDiffs: 20,
//   latestSerial: 45,
//   providers: { aws: 120, google: 30 },
//   types: { aws_instance: 20, aws_s3_bucket: 50, ... }
// }
```

#### `getStatsByProvider()`
Group resources by provider.

```javascript
const byProvider = await plugin.getStatsByProvider();
// { aws: 120, google: 30, azure: 0 }
```

#### `getStatsByType()`
Group resources by type.

```javascript
const byType = await plugin.getStatsByType();
// { aws_instance: 20, aws_s3_bucket: 50, ... }
```

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Import methods, query patterns, real-world examples
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ
