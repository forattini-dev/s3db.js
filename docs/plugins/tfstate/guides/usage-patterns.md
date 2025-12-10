# Usage Patterns

> **In this guide:** Import methods, query patterns, diff tracking, and real-world examples.

**Navigation:** [← Back to TfState Plugin](../README.md) | [Configuration](./configuration.md)

---

## Basic Setup

```javascript
import { Database, TfStatePlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

await db.connect();

const plugin = new TfStatePlugin({
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

---

## Import Methods

### Import Local State Files

```javascript
// Single file
await plugin.importState('./terraform.tfstate');
await plugin.importState('/path/to/terraform.tfstate');

// With custom source file name
await plugin.importState('./local.tfstate', {
  sourceFile: 'prod/terraform.tfstate'
});
```

### Import from S3

```javascript
await plugin.importStateFromS3('prod/terraform.tfstate');
await plugin.importStateFromS3('environments/staging/terraform.tfstate');
```

### Import Multiple States (Glob)

```javascript
// Local files
await plugin.importStatesGlob('./terraform/**/*.tfstate');
await plugin.importStatesGlob('./environments/*/terraform.tfstate');

// S3 files
await plugin.importStatesFromS3Glob('**/terraform.tfstate');
await plugin.importStatesFromS3Glob('environments/*/terraform.tfstate');
```

### Import from Workspaces

```javascript
await plugin.importState('./terraform.tfstate.d/prod/terraform.tfstate');
await plugin.importState('./terraform.tfstate.d/staging/terraform.tfstate');
```

---

## Query Patterns

### Query by Resource Type

```javascript
// All EC2 instances (partition-based, O(1))
const ec2 = await plugin.getResourcesByType('aws_instance');

// All S3 buckets
const buckets = await plugin.getResourcesByType('aws_s3_bucket');

// All RDS instances
const rds = await plugin.getResourcesByType('aws_db_instance');
```

### Query by Provider

```javascript
// All AWS resources
const aws = await plugin.getResourcesByProvider('aws');

// All Google Cloud resources
const gcp = await plugin.getResourcesByProvider('google');

// All Azure resources
const azure = await plugin.getResourcesByProvider('azure');
```

### Query by Provider + Type

```javascript
// AWS RDS instances (ultra fast)
const awsRds = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');

// Google Compute instances
const gcpVMs = await plugin.getResourcesByProviderAndType('google', 'google_compute_instance');
```

### Complex Queries

```javascript
// Production EC2 instances
const prodInstances = await plugin.resource.query({
  resourceType: 'aws_instance',
  'attributes.tags.Environment': 'production'
});

// Large instances
const largeInstances = await plugin.resource.query({
  resourceType: 'aws_instance',
  'attributes.instance_type': { $in: ['t3.large', 't3.xlarge', 'm5.large'] }
});

// Resources from specific state version
const resources = await plugin.resource.listPartition({
  partition: 'bySerial',
  partitionValues: { stateSerial: 100 }
});
```

### Query State Files

```javascript
// View all imported states
const states = await plugin.stateFilesResource.list();

// Find latest version of specific state
const latest = await plugin.stateFilesResource.listPartition({
  partition: 'bySourceFile',
  partitionValues: { sourceFile: 'prod/terraform.tfstate' }
});
```

---

## Diff Tracking

### View Changes Between Versions

```javascript
const diff = await plugin.getDiff('terraform.tfstate', 100, 101);

console.log('Summary:', diff.summary);
// { addedCount: 5, modifiedCount: 3, deletedCount: 2 }

console.log('Added resources:');
diff.changes.added.forEach(r => {
  console.log(`  + ${r.type}.${r.name}`);
});

console.log('Modified resources:');
diff.changes.modified.forEach(r => {
  console.log(`  ~ ${r.type}.${r.name}: ${r.changedFields.join(', ')}`);
});

console.log('Deleted resources:');
diff.changes.deleted.forEach(r => {
  console.log(`  - ${r.type}.${r.name}`);
});
```

### Get Latest Changes

```javascript
const latest = await plugin.getLatestDiff('terraform.tfstate');
console.log(`Added: ${latest.summary.addedCount} resources`);
console.log(`Modified: ${latest.summary.modifiedCount} resources`);
console.log(`Deleted: ${latest.summary.deletedCount} resources`);
```

### View All Diffs for a State

```javascript
const allDiffs = await plugin.getAllDiffs('terraform.tfstate');
allDiffs.forEach(diff => {
  console.log(`v${diff.oldSerial} → v${diff.newSerial}: +${diff.summary.addedCount} -${diff.summary.deletedCount}`);
});
```

### Detect Large Changes

```javascript
const bigChanges = await plugin.diffsResource.query({
  $or: [
    { 'summary.addedCount': { $gte: 10 } },
    { 'summary.deletedCount': { $gte: 10 } }
  ]
});

console.log(`Found ${bigChanges.length} large changes`);
```

---

## Real-World Examples

### Infrastructure Dashboard

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

### Audit and Compliance

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

### Cost Analysis

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

### Multi-Provider Inventory

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

### CI/CD Integration

```javascript
// In CI/CD pipeline
await plugin.importState('./terraform.tfstate');

const latest = await plugin.getLatestDiff('terraform.tfstate');

if (latest.summary.deletedCount > 10) {
  throw new Error(`Too many deletions: ${latest.summary.deletedCount}`);
}

console.log('✅ Infrastructure changes approved');
```

### Drift Detection

```javascript
// Compare resources from different states
const prod = await plugin.resource.query({ sourceFile: 'prod/terraform.tfstate' });
const staging = await plugin.resource.query({ sourceFile: 'staging/terraform.tfstate' });

const prodEc2 = prod.filter(r => r.resourceType === 'aws_instance');
const stagingEc2 = staging.filter(r => r.resourceType === 'aws_instance');

console.log(`Prod: ${prodEc2.length} instances`);
console.log(`Staging: ${stagingEc2.length} instances`);
```

### Export for External Tools

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

## Scheduled Imports

### Automatic State Updates

```javascript
// Manual import
await plugin.importState('./terraform.tfstate');

// Or schedule automatic imports
setInterval(async () => {
  await plugin.importStateFromS3('prod/terraform.tfstate');
}, 5 * 60 * 1000);  // Every 5 minutes
```

### Using SchedulerPlugin

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

await db.usePlugin(scheduler);
```

---

## Monitoring Integration

```javascript
// Use s3db resource events
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

---

## See Also

- [Configuration](./configuration.md) - All options and API reference
- [Best Practices](./best-practices.md) - Performance, troubleshooting, FAQ
