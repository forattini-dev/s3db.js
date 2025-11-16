# 🏗️ TfState Plugin - Terraform Infrastructure Inventory

> **Index Terraform/OpenTofu state files, detect drift, and power infra analytics.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## 📦 Dependencies

The TfState Plugin has **zero external dependencies** - it's built directly into s3db.js core.

**Peer Dependencies:** None required

**What's Included:**
- ✅ Terraform/OpenTofu state parser (built-in)
- ✅ SHA256 hashing for deduplication (built-in)
- ✅ Diff calculation engine (built-in)
- ✅ Provider detection logic (built-in)
- ✅ Partition-based indexing (built-in)
- ✅ Glob pattern matching (built-in)

**Installation:**
```javascript
import { Database, TfStatePlugin } from 's3db.js';

const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance'],
    providers: ['aws']
  }
});

await db.usePlugin(plugin);
await plugin.importState('./terraform.tfstate');
```

**No Additional Packages Needed:**
All Terraform state parsing and infrastructure inventory capabilities are built into the core package. Just configure your filters and start importing!

---

## ⚡ TLDR

**Import and query** your Terraform/OpenTofu states as s3db resources with **automatic change tracking** and **intelligent partition-based queries**.

```javascript
import { TfStatePlugin } from 's3db.js';

const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],
    providers: ['aws']  // aws, google, azure, kubernetes
  }
});

await db.usePlugin(plugin);

// Import local state
await plugin.importState('./terraform.tfstate');

// Import from S3
await plugin.importStateFromS3('prod/terraform.tfstate');

// Import multiple states (glob)
await plugin.importStatesGlob('./terraform/**/*.tfstate');
await plugin.importStatesFromS3Glob('environments/**/terraform.tfstate');

// Intelligent partition queries
const ec2Instances = await plugin.getResourcesByType('aws_instance');
const awsResources = await plugin.getResourcesByProvider('aws');
const rdsInstances = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');

// Statistics
const stats = await plugin.getStats();
console.log(`Total: ${stats.totalResources} resources`);
console.log(`Providers: ${Object.keys(stats.providers).length}`);

// Change tracking
const diff = await plugin.getDiff('terraform.tfstate', 1, 2);
console.log(`Added: ${diff.summary.addedCount}`);
console.log(`Modified: ${diff.summary.modifiedCount}`);
console.log(`Deleted: ${diff.summary.deletedCount}`);
```

> 🧩 **Namespaces**: Use `namespace: 'infra'` (or pass an alias to `db.usePlugin`) to run multiple TfStatePlugin instances. Inventory, state files, diffs, and lineage resources will be emitted as `plg_infra_tfstate_*`.

**Key Features:**
- ✅ **Flexible import**: Local files, S3, glob patterns
- ✅ **Intelligent queries**: Partitions by type, provider, serial
- ✅ **Diff tracking**: Compare versions and see changes
- ✅ **Complete inventory**: Catalog of entire infrastructure
- ✅ **Audit trail**: History of all changes
- ✅ **Provider detection**: Identifies aws, google, azure, kubernetes
- ✅ **SHA256 deduplication**: Never imports same state twice
- ✅ **Filters**: By resource type and provider

---

## 📋 Table of Contents

1. [📦 Dependencies](#-dependencies)
2. [⚡ TLDR](#-tldr)
3. [📦 What Does This Plugin Do?](#-what-does-this-plugin-do)
4. [🗄️ The 3 Created Resources](#%EF%B8%8F-the-3-created-resources)
5. [🚀 Quick Start](#-quick-start)
6. [📚 Real-World Use Cases](#-real-world-use-cases)
7. [⚙️ Configuration Reference](#%EF%B8%8F-configuration-reference)
8. [🔌 Complete API](#-complete-api)
9. [🎯 Provider Detection](#-provider-detection)
10. [✅ Compatibility](#-compatibility)
11. [❓ FAQ](#-faq)

---

## 📦 What Does This Plugin Do?

You use **Terraform** or **OpenTofu** to manage your infrastructure. Every time you run `terraform apply`, Terraform saves the current state in a `.tfstate` file.

**The problem**: These files are hard to query. You can't easily answer:

- How many EC2 servers am I running?
- What changed between yesterday and today?
- Which resources were deleted last week?
- How many Google Cloud resources do I have?

**The solution**: The TfState Plugin reads those `.tfstate` files and transforms them into **queryable data** inside s3db.

---

## 🗄️ The 3 Created Resources

When you install this plugin, it automatically creates **3 s3db resources**:

### 1. `plg_tfstate_states` - State File Metadata

Stores information about each imported `.tfstate` file.

**Main Fields:**
- `sourceFile` - Path or S3 URI of the state (`prod/terraform.tfstate`)
- `serial` - State serial number
- `lineage` - Terraform lineage identifier
- `terraformVersion` - Terraform/OpenTofu version
- `resourceCount` - How many resources in this state
- `sha256Hash` - Hash for deduplication
- `importedAt` - When it was imported

**Partitions:**
- `bySourceFile` - Query by file
- `bySerial` - Query by version

**Example:**
```javascript
// View all imported states
const states = await plugin.stateFilesResource.list();

// Find latest version of specific state
const latest = await plugin.stateFilesResource.listPartition({
  partition: 'bySourceFile',
  partitionValues: { sourceFile: 'prod/terraform.tfstate' }
});
```

### 2. `plg_tfstate_resources` - Extracted Resources

The main resource containing **all infrastructure resources** (EC2, RDS, S3, etc).

**Main Fields:**
- `resourceType` - Resource type (`aws_instance`, `aws_s3_bucket`)
- `resourceName` - Name given in Terraform
- `resourceAddress` - Full address (`aws_instance.web_server`)
- `providerName` - Provider (`aws`, `google`, `azure`, `kubernetes`)
- `attributes` - All resource attributes (JSON)
- `mode` - `managed` or `data`
- `stateSerial` - Which version it came from
- `sourceFile` - Which file it came from

**Partitions (sync for fast queries):**
- `byType` - Query by resource type
- `byProvider` - Query by provider
- `bySerial` - Query by version
- `bySourceFile` - Query by file
- `byProviderAndType` - Query by provider + type

**Example:**
```javascript
// All EC2 instances (using partition)
const ec2 = await plugin.getResourcesByType('aws_instance');

// All AWS resources (using partition)
const aws = await plugin.getResourcesByProvider('aws');

// All AWS RDS instances (combined partition)
const rds = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');

// Complex query
const prodInstances = await plugin.resource.query({
  resourceType: 'aws_instance',
  'attributes.tags.Environment': 'production'
});
```

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

**Example:**
```javascript
// View recent changes
const recentDiffs = await plugin.diffsResource.query({}, {
  limit: 10,
  sort: { calculatedAt: -1 }
});

// View changes for specific state
const prodDiffs = await plugin.diffsResource.listPartition({
  partition: 'bySourceFile',
  partitionValues: { sourceFile: 'prod/terraform.tfstate' }
});

// Diff details
const diff = await plugin.getDiff('terraform.tfstate', 100, 101);
console.log('Added resources:');
diff.changes.added.forEach(r => {
  console.log(`  + ${r.type}.${r.name}`);
});
```

---

## 🚀 Quick Start

### Basic Setup

```javascript
import { Database } from 's3db.js';
import { TfStatePlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

await db.connect();

// Simple configuration
const plugin = new TfStatePlugin({
  // Optional: filter by specific types
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],
    providers: ['aws', 'google']
  }
});

await db.usePlugin(plugin);

// Import a state
await plugin.importState('./terraform.tfstate');

// Query resources
const ec2 = await plugin.getResourcesByType('aws_instance');
console.log(`Found ${ec2.length} EC2 instances`);

// View statistics
const stats = await plugin.getStats();
console.log(`Total resources: ${stats.totalResources}`);
console.log('Providers:', stats.providers);
```

**Output:**
```
Found 15 EC2 instances
Total resources: 150
Providers: { aws: 120, google: 30 }
```

---

## 📚 Real-World Use Cases

### 1. Infrastructure Dashboard

```javascript
async function getInfraDashboard() {
  const stats = await plugin.getStats();

  console.log('📊 Infrastructure Overview:');
  console.log(`  Total Resources: ${stats.totalResources}`);
  console.log(`  Latest Version: serial ${stats.latestSerial}`);
  console.log('');

  console.log('By Provider:');
  Object.entries(stats.providers).forEach(([provider, count]) => {
    console.log(`  ${provider}: ${count} resources`);
  });
  console.log('');

  console.log('Top 10 Resource Types:');
  const topTypes = Object.entries(stats.types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topTypes.forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}

// Update every 5 minutes
setInterval(getInfraDashboard, 5 * 60 * 1000);
```

### 2. Audit and Compliance

```javascript
// View all resources created in last week
const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

const recentResources = await plugin.resource.query({
  importedAt: { $gte: weekAgo }
});

console.log(`${recentResources.length} resources created in last 7 days:`);
recentResources.forEach(r => {
  console.log(`  ${r.resourceType}.${r.resourceName} (serial ${r.stateSerial})`);
});

// View large changes (>10 resources)
const bigChanges = await plugin.diffsResource.query({
  $or: [
    { 'summary.addedCount': { $gte: 10 } },
    { 'summary.deletedCount': { $gte: 10 } }
  ]
});

console.log(`\n${bigChanges.length} large changes detected`);
```

### 3. Cost Analysis

```javascript
// List all "expensive" resources
const expensiveTypes = [
  'aws_db_instance',
  'aws_elasticache_cluster',
  'aws_redshift_cluster',
  'google_compute_instance'
];

for (const type of expensiveTypes) {
  const resources = await plugin.getResourcesByType(type);

  console.log(`\n${type}: ${resources.length} instances`);
  resources.forEach(r => {
    const size = r.attributes.instance_class || r.attributes.machine_type || 'unknown';
    console.log(`  - ${r.resourceName}: ${size}`);
  });
}
```

### 4. Multi-Provider Inventory

```javascript
// View resources from all providers
const providers = ['aws', 'google', 'azure', 'kubernetes'];

for (const provider of providers) {
  const resources = await plugin.getResourcesByProvider(provider);

  if (resources.length > 0) {
    console.log(`\n${provider.toUpperCase()}: ${resources.length} resources`);

    // Group by type
    const byType = {};
    resources.forEach(r => {
      byType[r.resourceType] = (byType[r.resourceType] || 0) + 1;
    });

    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
}
```

---

## ⚙️ Configuration Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `resourceName` | String | `'plg_tfstate_resources'` | Name of extracted resources table |
| `stateFilesName` | String | `'plg_tfstate_states'` | Name of state files metadata table |
| `diffsName` | String | `'plg_tfstate_diffs'` | Name of diffs/changes table |
| `trackDiffs` | Boolean | `true` | Enable automatic diff tracking between versions |
| `logLevel` | Boolean | `false` | Enable detailed logging |
| `asyncPartitions` | Boolean | `true` | Enable async partition indexing for 70-100% faster writes |

### Filter Options

| Parameter | Type | Description |
|-----------|------|-------------|
| `filters.types` | Array&lt;String&gt; | Only import specific resource types (e.g., `['aws_instance', 'aws_s3_bucket']`) |
| `filters.providers` | Array&lt;String&gt; | Only import from specific providers (e.g., `['aws', 'google']`) |
| `filters.exclude` | Array&lt;String&gt; | Exclude patterns (e.g., `['data.*']` to exclude data sources) |

### Import Options (Method-Specific)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sourceFile` | String | (auto) | Override source file name when importing |

### Complete Example

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

## 🔌 Complete API

### Import Methods

#### `importState(filePath, options)`
Import a local `.tfstate` file.

```javascript
await plugin.importState('./terraform.tfstate');
await plugin.importState('./terraform.tfstate', {
  sourceFile: 'custom-name.tfstate'  // Override source file name
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
Find resources by type using partition (fast).

```javascript
const ec2 = await plugin.getResourcesByType('aws_instance');
const buckets = await plugin.getResourcesByType('aws_s3_bucket');
```

#### `getResourcesByProvider(provider)`
Find resources by provider using partition (fast).

```javascript
const aws = await plugin.getResourcesByProvider('aws');
const gcp = await plugin.getResourcesByProvider('google');
```

#### `getResourcesByProviderAndType(provider, type)`
Find resources by provider + type using combined partition (ultra fast).

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

## 🎯 Provider Detection

The plugin automatically detects the provider for each resource:

```javascript
// AWS
aws_instance → provider: 'aws'
aws_s3_bucket → provider: 'aws'

// Google Cloud
google_compute_instance → provider: 'google'
google_storage_bucket → provider: 'google'

// Azure
azurerm_virtual_machine → provider: 'azure'
azurerm_storage_account → provider: 'azure'

// Kubernetes
kubernetes_deployment → provider: 'kubernetes'
kubernetes_service → provider: 'kubernetes'

// Others
random_id → provider: 'random'
null_resource → provider: 'null'
```

---

## ❓ FAQ

### General

**Q: What does the TfStatePlugin do?**

A: Transforms Terraform/OpenTofu .tfstate files into queryable s3db resources with automatic change tracking, partition-based indexing, and infrastructure analytics. Perfect for infrastructure inventory, drift detection, compliance auditing, and cost analysis.

**Q: Does TfStatePlugin require external dependencies?**

A: No! Zero external dependencies. Everything is built into s3db.js core: Terraform/OpenTofu state parser, SHA256 hashing, diff calculation, provider detection, partition indexing, and glob pattern matching.

**Q: Does the plugin modify my .tfstate files?**

A: No! The plugin only **reads** the files. It never modifies the original `.tfstate` files. All data is safely stored in separate s3db resources.

**Q: Does it work with OpenTofu?**

A: Yes! OpenTofu uses the same `.tfstate` format as Terraform. The plugin works perfectly with both Terraform and OpenTofu in all versions.

**Q: Can I use it in production?**

A: Yes! The plugin:
- Never modifies original files
- Has SHA256 deduplication (won't import same file twice)
- Uses partitions for fast O(1) queries
- Supports async partition indexing (70-100% faster writes)
- Is fully backward compatible

**Q: Which Terraform/OpenTofu versions are supported?**

A: All versions! The plugin supports:
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

**Q: What are the default values for all configurations?**

A:
- `resourceName`: `'plg_tfstate_resources'`
- `stateFilesName`: `'plg_tfstate_states'`
- `diffsName`: `'plg_tfstate_diffs'`
- `trackDiffs`: `true`
- `logLevel`: `false`
- `asyncPartitions`: `true`
- `filters`: `undefined` (no filters, imports everything)

**Q: How to filter by specific resource types?**

A:
```javascript
const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket']
  }
});
```

**Q: How to filter by specific providers?**

A:
```javascript
const plugin = new TfStatePlugin({
  filters: {
    providers: ['aws', 'google', 'azure']
  }
});
```

**Q: How to exclude data sources?**

A:
```javascript
const plugin = new TfStatePlugin({
  filters: {
    exclude: ['data.*']  // Excludes all data sources
  }
});
```

**Q: How to customize resource names?**

A:
```javascript
const plugin = new TfStatePlugin({
  resourceName: 'terraform_resources',
  stateFilesName: 'terraform_states',
  diffsName: 'terraform_changes'
});
```

**Q: How to disable diff tracking?**

A:
```javascript
const plugin = new TfStatePlugin({
  trackDiffs: false  // No automatic diff calculation
});
```

**Q: How to enable debug logging?**

A:
```javascript
const plugin = new TfStatePlugin({
  logLevel: 'debug'  // Logs all operations
});
```

---

### Importing States

**Q: How to import a local .tfstate file?**

A:
```javascript
await plugin.importState('./terraform.tfstate');
await plugin.importState('/path/to/terraform.tfstate');
```

**Q: How to import from S3?**

A:
```javascript
await plugin.importStateFromS3('prod/terraform.tfstate');
await plugin.importStateFromS3('environments/staging/terraform.tfstate');
```

**Q: How to import multiple states at once?**

A: Use glob patterns:
```javascript
// Local files
await plugin.importStatesGlob('./terraform/**/*.tfstate');
await plugin.importStatesGlob('./environments/*/terraform.tfstate');

// S3 files
await plugin.importStatesFromS3Glob('**/terraform.tfstate');
await plugin.importStatesFromS3Glob('environments/*/terraform.tfstate');
```

**Q: How to override the source file name?**

A:
```javascript
await plugin.importState('./local.tfstate', {
  sourceFile: 'prod/terraform.tfstate'  // Custom name
});
```

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

A: SHA256 deduplication prevents duplicate imports. If the state content is identical, it won't be reimported (saves storage and processing time).

**Q: Can I import states from different Terraform workspaces?**

A: Yes! Each workspace's state file can be imported:
```javascript
await plugin.importState('./terraform.tfstate.d/prod/terraform.tfstate');
await plugin.importState('./terraform.tfstate.d/staging/terraform.tfstate');
```

---

### Querying Resources

**Q: How to query all EC2 instances?**

A: Use partition-based query (O(1) lookup):
```javascript
const ec2 = await plugin.getResourcesByType('aws_instance');
```

**Q: How to query all AWS resources?**

A: Use provider partition:
```javascript
const aws = await plugin.getResourcesByProvider('aws');
```

**Q: How to query AWS RDS instances specifically?**

A: Use combined partition (ultra fast):
```javascript
const rds = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');
```

**Q: How to query resources with complex filters?**

A: Use standard s3db query:
```javascript
const prodInstances = await plugin.resource.query({
  resourceType: 'aws_instance',
  'attributes.tags.Environment': 'production',
  'attributes.instance_type': { $in: ['t3.large', 't3.xlarge'] }
});
```

**Q: How to query resources from a specific state version?**

A:
```javascript
const resources = await plugin.resource.listPartition({
  partition: 'bySerial',
  partitionValues: { stateSerial: 100 }
});
```

**Q: How to get count of resources by type?**

A:
```javascript
const stats = await plugin.getStatsByType();
// { aws_instance: 20, aws_s3_bucket: 50, aws_db_instance: 5 }
```

**Q: How to get count of resources by provider?**

A:
```javascript
const stats = await plugin.getStatsByProvider();
// { aws: 120, google: 30, azure: 10 }
```

---

### Change Tracking & Diffs

**Q: How does diff tracking work?**

A: When `trackDiffs: true` (default), the plugin automatically compares each new state import with the previous version (by serial number). Diffs are calculated using deep comparison of resource attributes and stored in the diffs resource.

**Q: How to view changes between two specific versions?**

A:
```javascript
const diff = await plugin.getDiff('terraform.tfstate', 100, 101);
console.log(diff.summary);  // { addedCount, modifiedCount, deletedCount }
console.log(diff.changes);  // { added: [], modified: [], deleted: [] }
```

**Q: How to get the latest changes?**

A:
```javascript
const latest = await plugin.getLatestDiff('terraform.tfstate');
console.log(`Added: ${latest.summary.addedCount} resources`);
console.log(`Modified: ${latest.summary.modifiedCount} resources`);
console.log(`Deleted: ${latest.summary.deletedCount} resources`);
```

**Q: How to view all changes for a specific state?**

A:
```javascript
const allDiffs = await plugin.getAllDiffs('terraform.tfstate');
allDiffs.forEach(diff => {
  console.log(`v${diff.oldSerial} → v${diff.newSerial}: +${diff.summary.addedCount} -${diff.summary.deletedCount}`);
});
```

**Q: How to detect large infrastructure changes?**

A:
```javascript
const bigChanges = await plugin.diffsResource.query({
  $or: [
    { 'summary.addedCount': { $gte: 10 } },
    { 'summary.deletedCount': { $gte: 10 } }
  ]
});

console.log(`Found ${bigChanges.length} large changes`);
```

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
  trackDiffs: false  // No automatic diff calculation
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

**Q: Which providers are detected?**

A: All major providers are detected:
- AWS (aws_*)
- Google Cloud (google_*)
- Azure (azurerm_*)
- Kubernetes (kubernetes_*)
- Random (random_*)
- Null (null_*)
- And many others based on prefix

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

Example: 1000 resources ≈ 1-5 MB storage

**Q: How fast are queries?**

A: Very fast thanks to partition-based indexing:
- Type queries: O(1) using `byType` partition
- Provider queries: O(1) using `byProvider` partition
- Combined queries: O(1) using `byProviderAndType` partition
- No full table scans needed

**Q: Does async partitioning improve performance?**

A: Yes! Async partitioning is enabled by default (`asyncPartitions: true`) and provides:
- 70-100% faster write operations
- Immediate query availability (doesn't block on indexing)
- Background partition updates

**Q: How to optimize for large infrastructures (1000+ resources)?**

A: Best practices:
1. Use filters to import only needed resource types
2. Enable async partitioning (default: true)
3. Use partition-based queries instead of full scans
4. Schedule imports during low-traffic periods
5. Consider disabling diff tracking if not needed

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

### Troubleshooting

**Q: Import fails with "Invalid state file" error?**

A: Verify the state file:
1. Check it's a valid JSON file
2. Ensure it has `version`, `lineage`, and `resources` fields
3. Try opening it in a text editor to inspect structure
4. Enable debug mode: `new TfStatePlugin({ logLevel: 'debug' })`

**Q: Some resources not showing up after import?**

A: Check filters:
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

**Q: Diff tracking not working?**

A: Verify:
1. `trackDiffs: true` (default)
2. Import same state file with different serial numbers
3. Check `diffsResource.list()` for diff records
4. Enable debug mode to see diff calculations

**Q: Queries are slow?**

A: Use partition-based queries:
```javascript
// ❌ Slow - full scan
const ec2 = await plugin.resource.query({ resourceType: 'aws_instance' });

// ✅ Fast - partition query (O(1))
const ec2 = await plugin.getResourcesByType('aws_instance');
```

**Q: SHA256 deduplication not working?**

A: Deduplication works automatically. If a state is reimported:
1. Check `logLevel: 'debug'` logs - should show "Skipping duplicate state"
2. Verify state content is identical (same serial, lineage, resources)
3. Different serials = different states (will be imported)

**Q: Error: "Resource already exists"?**

A: This occurs if:
1. Plugin is used multiple times with same resource names
2. Solution: Use different resource names or namespaces:
```javascript
const plugin1 = new TfStatePlugin({ namespace: 'infra' });
const plugin2 = new TfStatePlugin({ namespace: 'apps' });
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

**Q: How to build an infrastructure dashboard?**

A:
```javascript
async function getDashboard() {
  const stats = await plugin.getStats();

  return {
    totalResources: stats.totalResources,
    providers: stats.providers,
    topTypes: Object.entries(stats.types)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  };
}

setInterval(getDashboard, 5 * 60 * 1000);  // Update every 5 min
```

**Q: How to detect drift between states?**

A: Compare resources from different states:
```javascript
const prod = await plugin.resource.query({ sourceFile: 'prod/terraform.tfstate' });
const staging = await plugin.resource.query({ sourceFile: 'staging/terraform.tfstate' });

const prodEc2 = prod.filter(r => r.resourceType === 'aws_instance');
const stagingEc2 = staging.filter(r => r.resourceType === 'aws_instance');

console.log(`Prod: ${prodEc2.length} instances`);
console.log(`Staging: ${stagingEc2.length} instances`);
```

**Q: How to integrate with CI/CD?**

A:
```javascript
// In CI/CD pipeline
await plugin.importState('./terraform.tfstate');

const latest = await plugin.getLatestDiff('terraform.tfstate');

if (latest.summary.deletedCount > 10) {
  throw new Error(`Too many deletions: ${latest.summary.deletedCount}`);
}

console.log('✅ Infrastructure changes approved');
```

**Q: How to export data for external tools?**

A:
```javascript
const allResources = await plugin.resource.list();
const exported = allResources.map(r => ({
  type: r.resourceType,
  name: r.resourceName,
  provider: r.providerName,
  attributes: r.attributes
}));

await fs.writeFile('infrastructure.json', JSON.stringify(exported, null, 2));
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

**Q: How to integrate with monitoring systems?**

A: Use s3db resource events:
```javascript
plugin.resource.on('insert', (data) => {
  // Send to Datadog, New Relic, etc.
  metrics.increment('tfstate.resources.added');
});

plugin.diffsResource.on('insert', (diff) => {
  if (diff.summary.deletedCount > 10) {
    alerts.send(`Large deletion: ${diff.summary.deletedCount} resources`);
  }
});
```

**Q: What's the query performance for 10,000+ resources?**

A: Very fast with partitions:
- Type query (`getResourcesByType`): O(1) - 10-50ms
- Provider query (`getResourcesByProvider`): O(1) - 10-50ms
- Combined query (`getResourcesByProviderAndType`): O(1) - 10-50ms
- Full scan (`resource.query`): O(n) - avoid unless necessary

**Q: How to implement state locking?**

A: Use SchedulerPlugin or external locking:
```javascript
import { SchedulerPlugin } from 's3db.js';

const scheduler = new SchedulerPlugin({
  jobs: {
    import_state: {
      schedule: '*/5 * * * *',  // Every 5 minutes
      action: async () => {
        await plugin.importStateFromS3('prod/terraform.tfstate');
      }
    }
  }
});
```

---

## ✅ Compatibility

- ✅ Terraform (all versions)
- ✅ OpenTofu (all versions)
- ✅ State versions: v3, v4
- ✅ Backends: local, S3, anywhere accessible
- ✅ Providers: AWS, Google Cloud, Azure, Kubernetes, and others

---

**💡 Tip**: Start by importing a local state for testing. Then migrate to S3 in production.
