# 🏗️ TfState Plugin - Terraform Infrastructure Inventory

> **Index Terraform/OpenTofu state files, detect drift, and power infra analytics.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

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

- [TL;DR](#-tldr)
- [What Does This Plugin Do?](#-what-does-this-plugin-do)
- [The 3 Created Resources](#-the-3-created-resources)
- [Quick Start](#-quick-start)
- [Real-World Use Cases](#-real-world-use-cases)
- [Configuration Reference](#%EF%B8%8F-configuration-reference)
- [Complete API](#-complete-api)
- [Provider Detection](#-provider-detection)
- [FAQ](#-faq)

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
| `verbose` | Boolean | `false` | Enable detailed logging |
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
  verbose: true  // Default: false - detailed logs
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

### For Developers

**Q: Does the plugin modify my .tfstate files?**
**A:** No! The plugin only **reads** the files. It never modifies the original `.tfstate` files.

**Q: Does it work with OpenTofu?**
**A:** Yes! OpenTofu uses the same `.tfstate` format as Terraform. The plugin works perfectly with both.

**Q: Can I use it in production?**
**A:** Yes! The plugin:
- Never modifies original files
- Has SHA256 deduplication (won't import same file twice)
- Uses partitions for fast queries
- Is fully backward compatible

**Q: How do I update the data?**
**A:** You need to manually call the import methods when you want to update:

```javascript
// Manual
await plugin.importState('./terraform.tfstate');
await plugin.importStateFromS3('prod/terraform.tfstate');

// Or create an external cron job/scheduler
setInterval(async () => {
  await plugin.importStateFromS3('prod/terraform.tfstate');
}, 5 * 60 * 1000);  // Every 5 minutes
```

**Q: How much space does it consume?**
**A:** Depends on resource count:
- State metadata: a few KB per state
- Extracted resources: depends on number of resources
- Diffs: only changes, doesn't duplicate data

SHA256 deduplication ensures identical states aren't reimported.

### For AI Agents

**Q: What problem does this plugin solve?**
**A:** Transforms unqueryable Terraform .tfstate files into structured, queryable s3db resources with automatic change tracking and partition-based indexing.

**Q: What are the minimum required parameters?**
**A:** None! Can be initialized with `new TfStatePlugin()` and all defaults will work. The database connection is required via `db.usePlugin(plugin)`.

**Q: What are the default values for all configurations?**
**A:**
- `resourceName`: `'plg_tfstate_resources'`
- `stateFilesName`: `'plg_tfstate_states'`
- `diffsName`: `'plg_tfstate_diffs'`
- `trackDiffs`: `true`
- `verbose`: `false`
- `asyncPartitions`: `true`
- `filters`: `undefined` (no filters)

**Q: What events does this plugin emit?**
**A:** The plugin doesn't emit custom events. It uses the standard s3db resource events (insert, update, delete) on the 3 created resources.

**Q: How do I debug issues with this plugin?**
**A:** Enable verbose mode:
```javascript
const plugin = new TfStatePlugin({ verbose: true });
```
This will log all import operations, resource extraction, and diff calculations.

**Q: Which partitions are created and how are they used?**
**A:**
- **States resource**: `bySourceFile`, `bySerial`
- **Resources resource**: `byType`, `byProvider`, `bySerial`, `bySourceFile`, `byProviderAndType` (all sync for O(1) lookups)
- **Diffs resource**: `bySourceFile`, `byOldSerial`, `byNewSerial`

**Q: How does diff tracking work?**
**A:** When `trackDiffs: true` (default), the plugin automatically compares each new state import with the previous version (by serial number). Diffs are calculated using deep comparison of resource attributes and stored in the diffs resource.

---

## ✅ Compatibility

- ✅ Terraform (all versions)
- ✅ OpenTofu (all versions)
- ✅ State versions: v3, v4
- ✅ Backends: local, S3, anywhere accessible
- ✅ Providers: AWS, Google Cloud, Azure, Kubernetes, and others

---

**💡 Tip**: Start by importing a local state for testing. Then migrate to S3 in production.
