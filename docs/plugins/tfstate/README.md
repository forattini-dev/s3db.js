# TfState Plugin

> **Index Terraform/OpenTofu state files, detect drift, and power infra analytics.**

---

## TLDR

**Import and query your Terraform/OpenTofu states as s3db resources with automatic change tracking and intelligent partition-based queries.**

**1 line to get started:**
```javascript
plugins: [new TfStatePlugin({ filters: { types: ['aws_instance', 'aws_db_instance'], providers: ['aws'] } })]
```

**Key features:**
- Flexible import: Local files, S3, glob patterns
- O(1) queries: Partitions by type, provider, serial
- Diff tracking: Compare versions and see changes
- SHA256 deduplication: Never imports same state twice
- Provider detection: Identifies aws, google, azure, kubernetes

**Use cases:**
- Infrastructure inventory and analytics
- Drift detection and compliance auditing
- Cost analysis and resource tracking
- CI/CD pipeline validation

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { TfStatePlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],
    providers: ['aws']
  }
});

await db.usePlugin(plugin);

// Import local state
await plugin.importState('./terraform.tfstate');

// Import from S3
await plugin.importStateFromS3('prod/terraform.tfstate');

// Import multiple states (glob)
await plugin.importStatesGlob('./terraform/**/*.tfstate');

// Query resources (O(1) partition-based)
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

---

## Dependencies

**Zero external dependencies** - built directly into s3db.js core.

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, filter options, resource schemas, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Import methods, query patterns, diff tracking, real-world examples |
| [Best Practices](./guides/best-practices.md) | Performance optimization, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resourceName` | string | `'plg_tfstate_resources'` | Extracted resources table |
| `stateFilesName` | string | `'plg_tfstate_states'` | State files metadata table |
| `diffsName` | string | `'plg_tfstate_diffs'` | Change history table |
| `trackDiffs` | boolean | `true` | Enable diff tracking |
| `asyncPartitions` | boolean | `true` | 70-100% faster writes |
| `filters.types` | array | - | Resource types to import |
| `filters.providers` | array | - | Providers to import |

### The 3 Created Resources

| Resource | Description | Key Partitions |
|----------|-------------|----------------|
| `plg_tfstate_states` | State file metadata | `bySourceFile`, `bySerial` |
| `plg_tfstate_resources` | Extracted infrastructure | `byType`, `byProvider`, `byProviderAndType` |
| `plg_tfstate_diffs` | Change history | `bySourceFile`, `byOldSerial`, `byNewSerial` |

### Plugin Methods

```javascript
// Import methods
await plugin.importState('./terraform.tfstate');
await plugin.importStateFromS3('prod/terraform.tfstate');
await plugin.importStatesGlob('./terraform/**/*.tfstate');
await plugin.importStatesFromS3Glob('**/terraform.tfstate');

// Query methods (O(1) partition-based)
await plugin.getResourcesByType('aws_instance');
await plugin.getResourcesByProvider('aws');
await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');

// Diff methods
await plugin.getDiff('terraform.tfstate', oldSerial, newSerial);
await plugin.getLatestDiff('terraform.tfstate');
await plugin.getAllDiffs('terraform.tfstate');

// Statistics
await plugin.getStats();
await plugin.getStatsByProvider();
await plugin.getStatsByType();
```

### Provider Detection

| Prefix | Provider |
|--------|----------|
| `aws_*` | `aws` |
| `google_*` | `google` |
| `azurerm_*` | `azure` |
| `kubernetes_*` | `kubernetes` |

---

## How It Works

1. **Import states** from local files, S3, or using glob patterns
2. **SHA256 deduplication** prevents duplicate imports
3. **Extract resources** with provider detection
4. **Index with partitions** for O(1) queries by type, provider, serial
5. **Track diffs** between state versions automatically
6. **Query and analyze** your infrastructure inventory

---

## Configuration Examples

### Basic Setup

```javascript
const plugin = new TfStatePlugin();
await db.usePlugin(plugin);
await plugin.importState('./terraform.tfstate');
```

### With Filters

```javascript
const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],
    providers: ['aws', 'google'],
    exclude: ['data.*']  // Exclude data sources
  }
});
```

### Multiple Instances with Namespaces

```javascript
const infraPlugin = new TfStatePlugin({ namespace: 'infra' });
const appsPlugin = new TfStatePlugin({ namespace: 'apps' });

// Resources: plg_infra_tfstate_resources, plg_apps_tfstate_resources
```

---

## Compatibility

- ✅ Terraform (all versions)
- ✅ OpenTofu (all versions)
- ✅ State format versions: v3, v4
- ✅ Backends: local, S3, GCS, Azure Blob, HTTP
- ✅ Providers: AWS, Google Cloud, Azure, Kubernetes, and others

---

## See Also

- [Cloud Inventory Plugin](../cloud-inventory/README.md) - Real-time cloud resource discovery
- [Metrics Plugin](../metrics/README.md) - Monitor infrastructure performance
- [Audit Plugin](../audit/README.md) - Track all infrastructure changes
