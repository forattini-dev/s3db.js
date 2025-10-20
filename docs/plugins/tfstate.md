# 🏗️ TfState Plugin - Track Infrastructure Changes

## ⚡ TL;DR

**Track and query** your Terraform/OpenTofu infrastructure state as s3db resources with **automatic change detection** and **cron-based monitoring**.

```javascript
// NEW: Auto-monitoring with drivers
const plugin = new TfStatePlugin({
  driver: 's3',  // or 'filesystem'
  config: {
    connectionString: 's3://key:secret@terraform-states/prod',
    selector: '**/*.tfstate'
  },
  monitor: {
    enabled: true,
    cron: '*/5 * * * *'  // Check every 5 minutes
  },
  diffs: {
    enabled: true,
    lookback: 50  // Keep last 50 changes
  }
});

await db.usePlugin(plugin);

// Get diff history
const timeline = await plugin.getDiffTimeline('terraform.tfstate', { lookback: 20 });
console.log(`Total added: ${timeline.summary.totalAdded}`);
console.log(`Total deleted: ${timeline.summary.totalDeleted}`);
```

**Key Features:**
- ✅ **Auto-monitoring**: Cron-based checks for state file changes
- ✅ **Drivers**: S3 (with connection strings) or Filesystem
- ✅ **Diff tracking**: Compare any two versions with lookback
- ✅ **SHA256 deduplication**: Never import the same state twice
- ✅ **Glob patterns**: `**/*.tfstate` imports
- ✅ **Manual triggers**: `await plugin.triggerMonitoring()`

---

## What Does This Plugin Do?

You use **Terraform** or **OpenTofu** to manage your infrastructure (servers, databases, load balancers, etc). Every time you run `terraform apply`, Terraform saves the current state of your infrastructure in a `.tfstate` file.

**The problem**: These `.tfstate` files are hard to query. You can't easily answer questions like:

- How many EC2 servers am I running right now?
- What changed between yesterday and today?
- When was this S3 bucket created?
- Which resources were deleted last week?

**The solution**: The TfState Plugin reads these `.tfstate` files and transforms them into **queryable data** inside s3db. You can now run SQL-like queries on your infrastructure.

## Why Would You Use This?

### Scenario 1: Auditing and Compliance

You need to prove to auditors that no servers were created without approval:

```javascript
// Find all servers created in the last week
const newServers = await plugin.resource.query({
  resourceType: 'aws_instance',
  importedAt: { $gte: Date.now() - 7 * 24 * 60 * 60 * 1000 }
});

console.log(`${newServers.length} servers created in the last 7 days`);
newServers.forEach(s => {
  console.log(`- ${s.resourceName} (${s.attributes.instance_type})`);
});
```

### Scenario 2: Cost Analysis

You want to know how many RDS instances you have and their types:

```javascript
// Count RDS instances by type
const rdsInstances = await plugin.resource.query({
  resourceType: 'aws_db_instance'
});

const byType = {};
rdsInstances.forEach(db => {
  const type = db.attributes.instance_class;
  byType[type] = (byType[type] || 0) + 1;
});

console.log('RDS by type:', byType);
// { 'db.t3.micro': 5, 'db.m5.large': 2, 'db.r5.xlarge': 1 }
```

### Scenario 3: Track Changes

See what changed between two infrastructure versions:

```javascript
// Import new state
await plugin.importStateFromS3('terraform-bucket', 'prod/terraform.tfstate');

// Plugin automatically calculates the diff
// Get the latest change
const latestDiff = await plugin.diffsResource.query({}, {
  limit: 1,
  sort: { calculatedAt: -1 }
});

console.log('Latest change:');
console.log(`  ${latestDiff[0].summary.addedCount} resources created`);
console.log(`  ${latestDiff[0].summary.modifiedCount} resources modified`);
console.log(`  ${latestDiff[0].summary.deletedCount} resources deleted`);
```

### Scenario 4: Automatic Monitoring (NEW!)

Watch for infrastructure changes automatically:

```javascript
// NEW! Cron-based monitoring
const plugin = new TfStatePlugin({
  driver: 's3',
  config: {
    connectionString: 's3://key:secret@terraform-states/production',
    selector: '**/*.tfstate'
  },
  monitor: {
    enabled: true,
    cron: '*/10 * * * *'  // Check every 10 minutes
  },
  diffs: {
    enabled: true,
    lookback: 50  // Keep history of 50 changes
  }
});

// Plugin now monitors automatically and emits events
plugin.on('stateFileProcessed', (event) => {
  console.log(`New version detected: serial ${event.serial}`);
  console.log(`  ${event.resourcesExtracted} resources processed`);

  // Send alert to Slack/Discord/etc
  if (event.resourcesExtracted > 100) {
    sendAlert(`⚠️ Large change detected! ${event.resourcesExtracted} resources`);
  }
});
```

## How It Works

The plugin transforms this:

```javascript
// terraform.tfstate (giant, hard-to-read JSON file)
{
  "version": 4,
  "serial": 42,
  "resources": [
    {
      "type": "aws_instance",
      "name": "web_server",
      "instances": [{
        "attributes": {
          "id": "i-1234567",
          "instance_type": "t3.micro",
          "ami": "ami-abc123"
        }
      }]
    },
    // ... hundreds or thousands of resources ...
  ]
}
```

Into this:

```javascript
// Queryable data in s3db
await plugin.resource.query({ resourceType: 'aws_instance' })
// [
//   {
//     id: 'xyz789',
//     resourceType: 'aws_instance',
//     resourceName: 'web_server',
//     stateSerial: 42,
//     attributes: {
//       id: 'i-1234567',
//       instance_type: 't3.micro',
//       ami: 'ami-abc123'
//     }
//   }
// ]
```

## 📦 The 3 Resources Created

**IMPORTANT**: When you install this plugin, it automatically creates **3 s3db resources** that you can query:

### 1. **`plugin.resource`** - Infrastructure Resources

This is the main resource containing all your infrastructure resources (EC2 instances, S3 buckets, RDS databases, etc).

**What's inside:**
- `resourceType` - Type of resource (e.g., `aws_instance`, `aws_s3_bucket`)
- `resourceName` - Name given in Terraform
- `resourceAddress` - Full address (e.g., `aws_instance.web_server`)
- `attributes` - All the resource attributes (instance type, AMI, tags, etc.)
- `stateSerial` - Which version of the state this came from
- `sourceFile` - Which .tfstate file this came from

**Example queries:**

```javascript
// Count all EC2 instances
const ec2Count = await plugin.resource.count({
  resourceType: 'aws_instance'
});
console.log(`Total EC2 instances: ${ec2Count}`);

// Find all resources with a specific tag
const prodResources = await plugin.resource.query({
  'attributes.tags.Environment': 'production'
});
console.log(`Production resources: ${prodResources.length}`);

// List all S3 buckets and their encryption status
const buckets = await plugin.resource.query({
  resourceType: 'aws_s3_bucket'
});

buckets.forEach(bucket => {
  const encrypted = bucket.attributes.server_side_encryption_configuration ? 'Yes' : 'No';
  console.log(`${bucket.resourceName}: encrypted=${encrypted}`);
});

// Find resources created in the last 24 hours
const recentResources = await plugin.resource.query({
  importedAt: { $gte: Date.now() - 86400000 }
});
```

### 2. **`plugin.stateFilesResource`** - State File Metadata

This resource tracks metadata about each `.tfstate` file that was imported.

**What's inside:**
- `sourceFile` - Path or S3 URI of the state file
- `serial` - Serial number of the state
- `lineage` - Terraform lineage identifier
- `terraformVersion` - Which Terraform/OpenTofu version created this
- `resourceCount` - How many resources in this state
- `sha256Hash` - Hash for deduplication
- `firstImportedAt` / `lastImportedAt` - When this was imported
- `importCount` - How many times we've seen this exact state

**Example queries:**

```javascript
// Get all state files we're tracking
const allStateFiles = await plugin.stateFilesResource.list();
console.log(`Tracking ${allStateFiles.length} state files`);

// Find the latest version of a specific state file
const latestProd = await plugin.stateFilesResource.query({
  sourceFile: 'production/terraform.tfstate'
}, {
  limit: 1,
  sort: { serial: -1 }
});

console.log(`Latest production state: serial ${latestProd[0].serial}`);
console.log(`Contains ${latestProd[0].resourceCount} resources`);
console.log(`Terraform version: ${latestProd[0].terraformVersion}`);

// Find states imported in the last week
const recentStates = await plugin.stateFilesResource.query({
  lastImportedAt: { $gte: Date.now() - 7 * 86400000 }
});

recentStates.forEach(state => {
  console.log(`${state.sourceFile}: serial ${state.serial} (${state.resourceCount} resources)`);
});

// Check for duplicate imports (same SHA256)
const duplicates = await plugin.stateFilesResource.query({
  importCount: { $gt: 1 }
});
console.log(`${duplicates.length} states were re-imported`);
```

### 3. **`plugin.diffsResource`** - Change History

This resource tracks what changed between state file versions (only if `diffs.enabled: true`).

**What's inside:**
- `sourceFile` - Which state file this diff is for
- `oldSerial` / `newSerial` - Which versions were compared
- `summary` - Quick stats (`addedCount`, `modifiedCount`, `deletedCount`)
- `changes` - Detailed arrays of what was added, modified, deleted
- `calculatedAt` - When this diff was calculated

**Example queries:**

```javascript
// Get latest changes across all state files
const latestChanges = await plugin.diffsResource.query({}, {
  limit: 10,
  sort: { calculatedAt: -1 }
});

latestChanges.forEach(diff => {
  console.log(`\n${diff.sourceFile} (serial ${diff.oldSerial} → ${diff.newSerial}):`);
  console.log(`  ✅ ${diff.summary.addedCount} added`);
  console.log(`  ✏️  ${diff.summary.modifiedCount} modified`);
  console.log(`  ❌ ${diff.summary.deletedCount} deleted`);
});

// Find significant changes (>10 resources modified)
const bigChanges = await plugin.diffsResource.query({
  'summary.modifiedCount': { $gte: 10 }
});

console.log(`Found ${bigChanges.length} deployments with 10+ changes`);

// Get detailed changes for a specific diff
const diff = await plugin.diffsResource.get(diffId);

console.log('\nAdded resources:');
diff.changes.added.forEach(r => {
  console.log(`  + ${r.type}.${r.name}`);
});

console.log('\nDeleted resources:');
diff.changes.deleted.forEach(r => {
  console.log(`  - ${r.type}.${r.name}`);
});

console.log('\nModified resources:');
diff.changes.modified.forEach(r => {
  console.log(`  ~ ${r.type}.${r.name}`);
  r.changes.forEach(c => {
    console.log(`      ${c.field}: ${c.oldValue} → ${c.newValue}`);
  });
});

// Aggregate changes over time
const allDiffs = await plugin.diffsResource.list({ limit: 100 });

const totals = allDiffs.reduce((acc, diff) => {
  acc.added += diff.summary.addedCount || 0;
  acc.modified += diff.summary.modifiedCount || 0;
  acc.deleted += diff.summary.deletedCount || 0;
  return acc;
}, { added: 0, modified: 0, deleted: 0 });

console.log('\nTotal changes in last 100 deployments:');
console.log(`  Added: ${totals.added}`);
console.log(`  Modified: ${totals.modified}`);
console.log(`  Deleted: ${totals.deleted}`);
```

### Summary: Which Resource Should I Use?

- **Want to query infrastructure?** → Use `plugin.resource`
  - "How many EC2 instances do I have?"
  - "Which S3 buckets are not encrypted?"
  - "List all RDS instances in production"

- **Want to see state file history?** → Use `plugin.stateFilesResource`
  - "What's the latest serial number?"
  - "How many times has this state been imported?"
  - "Which Terraform version is being used?"

- **Want to see what changed?** → Use `plugin.diffsResource`
  - "What was added in the last deployment?"
  - "Show me all deletions from last week"
  - "Which resource was modified between serial 100 and 110?"

## Quick Setup

### Option 1: Local Files (Development)

```javascript
import { Database } from 's3db.js';
import { TfStatePlugin } from 's3db.js/plugins';

const db = new Database({
  bucketName: 'my-bucket',
  region: 'us-east-1'
});

await db.connect();

// Simple config for local files
const plugin = new TfStatePlugin({
  driver: 'filesystem',
  config: {
    basePath: './terraform',  // Folder with .tfstate files
    selector: '**/*.tfstate'  // Find all .tfstate files
  },
  monitor: {
    enabled: true,
    cron: '*/1 * * * *'  // Check every 1 minute
  }
});

await db.usePlugin(plugin);

// Done! Plugin is now monitoring the ./terraform folder
console.log('Monitoring .tfstate files in ./terraform folder');
```

### Option 2: S3 Backend (Production)

```javascript
// Config to read from Terraform's S3 backend
const plugin = new TfStatePlugin({
  driver: 's3',
  config: {
    // Connect directly to Terraform bucket
    connectionString: process.env.TERRAFORM_BACKEND_URL,
    // Or: 's3://key:secret@terraform-states/production'

    // Find all .tfstate files
    selector: '**/*.tfstate'
  },
  monitor: {
    enabled: true,
    cron: '*/5 * * * *'  // Every 5 minutes
  },
  diffs: {
    enabled: true,
    lookback: 100  // Keep history of 100 changes
  }
});

await db.usePlugin(plugin);

// Manual trigger if needed
await plugin.triggerMonitoring();
```

## Common Queries

### View All Resources

```javascript
const allResources = await plugin.resource.list({ limit: 1000 });
console.log(`Total: ${allResources.length} resources`);
```

### Filter by Type

```javascript
// All EC2 instances
const ec2 = await plugin.resource.query({
  resourceType: 'aws_instance'
});

// All S3 buckets
const buckets = await plugin.resource.query({
  resourceType: 'aws_s3_bucket'
});

// All RDS databases
const databases = await plugin.resource.query({
  resourceType: 'aws_db_instance'
});
```

### View Change History (NEW!)

```javascript
// Last 10 changes
const recentChanges = await plugin.getDiffsWithLookback('terraform.tfstate', {
  lookback: 10
});

recentChanges.forEach(diff => {
  console.log(`\nSerial ${diff.oldSerial} → ${diff.newSerial}:`);
  console.log(`  ✅ ${diff.summary.addedCount} added`);
  console.log(`  ✏️  ${diff.summary.modifiedCount} modified`);
  console.log(`  ❌ ${diff.summary.deletedCount} deleted`);
});
```

### Timeline of Changes (NEW!)

```javascript
// View progression of changes over time
const timeline = await plugin.getDiffTimeline('terraform.tfstate', {
  lookback: 30  // Last 30 changes
});

console.log('Timeline:');
console.log(`  Period: serial ${timeline.summary.serialRange.oldest} to ${timeline.summary.serialRange.newest}`);
console.log(`  Total resources added: ${timeline.summary.totalAdded}`);
console.log(`  Total resources deleted: ${timeline.summary.totalDeleted}`);
console.log(`  Net change: ${timeline.summary.totalAdded - timeline.summary.totalDeleted}`);
```

### Compare Two Specific Versions (NEW!)

```javascript
// Compare serial 100 with serial 110
const diff = await plugin.compareStates('terraform.tfstate', 100, 110);

console.log('Changes between version 100 and 110:');
console.log('\nAdded Resources:');
diff.added.forEach(r => console.log(`  + ${r.type}.${r.name}`));

console.log('\nDeleted Resources:');
diff.deleted.forEach(r => console.log(`  - ${r.type}.${r.name}`));

console.log('\nModified Resources:');
diff.modified.forEach(r => {
  console.log(`  ~ ${r.type}.${r.name}`);
  r.changes.forEach(c => {
    console.log(`      ${c.field}: ${c.oldValue} → ${c.newValue}`);
  });
});
```

## Real-World Use Cases

### 1. Infrastructure Dashboard

```javascript
// Create a real-time dashboard
async function getDashboard() {
  const stats = {
    ec2: await plugin.resource.count({ resourceType: 'aws_instance' }),
    rds: await plugin.resource.count({ resourceType: 'aws_db_instance' }),
    s3: await plugin.resource.count({ resourceType: 'aws_s3_bucket' }),
    lambda: await plugin.resource.count({ resourceType: 'aws_lambda_function' })
  };

  console.log('📊 Infrastructure:');
  console.log(`  🖥️  EC2 Instances: ${stats.ec2}`);
  console.log(`  💾 RDS Databases: ${stats.rds}`);
  console.log(`  🪣 S3 Buckets: ${stats.s3}`);
  console.log(`  ⚡ Lambda Functions: ${stats.lambda}`);

  return stats;
}

// Update every 5 minutes
setInterval(getDashboard, 5 * 60 * 1000);
```

### 2. Automatic Alerts

```javascript
plugin.on('stateFileProcessed', async (event) => {
  // Get most recent diff
  const diffs = await plugin.diffsResource.query({}, {
    limit: 1,
    sort: { calculatedAt: -1 }
  });

  if (diffs.length === 0) return;

  const lastDiff = diffs[0];

  // Alert if many things changed
  if (lastDiff.summary.deletedCount > 10) {
    await sendSlackAlert({
      text: `⚠️ ALERT: ${lastDiff.summary.deletedCount} resources were DELETED!`,
      resources: lastDiff.changes.deleted.map(r => r.address)
    });
  }

  // Alert if expensive resources were created
  const added = lastDiff.changes.added;
  const expensiveTypes = ['aws_db_instance', 'aws_elasticache_cluster'];
  const expensiveAdded = added.filter(r => expensiveTypes.includes(r.type));

  if (expensiveAdded.length > 0) {
    await sendSlackAlert({
      text: `💰 Expensive resources were created:`,
      resources: expensiveAdded.map(r => `${r.type}.${r.name}`)
    });
  }
});
```

### 3. Backup and Disaster Recovery

```javascript
// Automatic backup of all states
async function backupAllStates() {
  const stateFiles = await plugin.stateFilesResource.list();

  for (const state of stateFiles) {
    const backupKey = `backups/${state.serial}-${Date.now()}.tfstate`;

    await plugin.exportStateToS3(
      'disaster-recovery-bucket',
      backupKey,
      { serial: state.serial }
    );

    console.log(`✅ Backup: ${state.sourceFile} → ${backupKey}`);
  }
}

// Run backup daily
setInterval(backupAllStates, 24 * 60 * 60 * 1000);
```

### 4. Trend Analysis

```javascript
// See how infrastructure grew over time
async function analyzeGrowth() {
  const stateFiles = await plugin.stateFilesResource.list();

  // Sort by serial
  stateFiles.sort((a, b) => a.serial - b.serial);

  console.log('📈 Infrastructure Growth:\n');

  for (const state of stateFiles.slice(-10)) {  // Last 10 versions
    const date = new Date(state.lastImportedAt).toLocaleDateString();
    console.log(`Serial ${state.serial} (${date}): ${state.resourceCount} resources`);
  }

  // Calculate growth rate
  const first = stateFiles[0];
  const last = stateFiles[stateFiles.length - 1];
  const growth = ((last.resourceCount - first.resourceCount) / first.resourceCount) * 100;

  console.log(`\n📊 Total growth: ${growth.toFixed(1)}%`);
}
```

## Complete Configuration

```javascript
const plugin = new TfStatePlugin({
  // === DRIVER (how to access files) ===
  driver: 's3',  // or 'filesystem'

  config: {
    // S3 Driver:
    connectionString: 's3://accessKey:secretKey@bucket/prefix?region=us-east-1',

    // Filesystem Driver:
    // basePath: './terraform-states',

    // Both:
    selector: '**/*.tfstate'  // Glob pattern
  },

  // === TABLE NAMES ===
  resources: {
    stateFiles: 'infra_state_files',    // File metadata
    resources: 'infra_resources',        // Extracted resources
    diffs: 'infra_changes'               // Change history
  },

  // === AUTOMATIC MONITORING ===
  monitor: {
    enabled: true,
    cron: '*/10 * * * *'  // Every 10 minutes
  },

  // === CHANGE TRACKING ===
  diffs: {
    enabled: true,
    lookback: 100  // Keep last 100 changes
  },

  // === FILTERS (optional) ===
  filters: {
    // Import only these types
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],

    // Exclude data sources
    exclude: ['data.*']
  },

  // === DEBUG ===
  verbose: true  // Log operations
});
```

## Plugin Events

The plugin emits events you can listen to:

```javascript
// When a new or modified file is found
plugin.on('stateFileProcessed', (event) => {
  console.log(`✅ Processed: ${event.path}`);
  console.log(`   Serial: ${event.serial}`);
  console.log(`   Resources: ${event.resourcesExtracted}`);
});

// When monitoring completes a round
plugin.on('monitoringCompleted', (result) => {
  console.log(`🔍 Monitoring completed:`);
  console.log(`   Files checked: ${result.totalFiles}`);
  console.log(`   New: ${result.newFiles}`);
  console.log(`   Modified: ${result.changedFiles}`);
});

// When processing errors occur
plugin.on('processingError', (error) => {
  console.error(`❌ Error: ${error.path}`);
  console.error(`   Message: ${error.error}`);
});
```

## Before vs After

### Before (without plugin)

```bash
# To know how many servers you have:
$ cat terraform.tfstate | jq '.resources[] | select(.type=="aws_instance")' | wc -l

# To see changes:
$ terraform plan
# (only shows future changes, not history)

# To see history:
$ git log terraform.tfstate
# (hard to read, no queries)
```

### After (with plugin)

```javascript
// How many servers?
const count = await plugin.resource.count({ resourceType: 'aws_instance' });

// Changes in the last 7 days?
const diffs = await plugin.diffsResource.query({
  calculatedAt: { $gte: Date.now() - 7 * 24 * 60 * 60 * 1000 }
});

// Complete history?
const timeline = await plugin.getDiffTimeline('terraform.tfstate', {
  lookback: 100
});

// Real-time dashboard?
setInterval(async () => {
  const stats = {
    ec2: await plugin.resource.count({ resourceType: 'aws_instance' }),
    rds: await plugin.resource.count({ resourceType: 'aws_db_instance' })
  };
  updateDashboard(stats);
}, 60000);
```

## Common Questions

### Does the plugin modify my .tfstate files?

**No!** The plugin only **reads** the files. It never modifies the original `.tfstate` files. Data is imported into s3db where you can query it, but the original files remain untouched.

### Does it work with OpenTofu?

**Yes!** OpenTofu uses the same `.tfstate` file format as Terraform. The plugin works perfectly with both.

### Can I use this in production?

**Yes!** The plugin:
- Never modifies original files
- Has SHA256 deduplication (doesn't import the same file twice)
- Supports automatic monitoring
- Emits events for integration
- Is fully backward compatible

### How do I update the data?

You have two options:

1. **Automatic**: Set `monitor.enabled: true` and the plugin checks by itself
2. **Manual**: Call `await plugin.triggerMonitoring()` whenever you want

### Does it consume a lot of space?

Not much. The plugin stores:
- File metadata (a few KB)
- Extracted resources (depends on quantity)
- Diffs (only changes, doesn't duplicate data)

Uses SHA256 deduplication - identical files are not reimported.

## API Reference (NEW Methods)

### `getDiffsWithLookback(sourceFile, options)`

Get last N diffs for a state file.

```javascript
const diffs = await plugin.getDiffsWithLookback('terraform.tfstate', {
  lookback: 20,           // Number of diffs to retrieve
  includeDetails: true    // Include detailed changes
});
```

### `getDiffTimeline(sourceFile, options)`

Get timeline with cumulative statistics.

```javascript
const timeline = await plugin.getDiffTimeline('terraform.tfstate', {
  lookback: 50
});
console.log(timeline.summary);  // Cumulative stats
console.log(timeline.diffs);    // Chronological history
```

### `compareStates(sourceFile, oldSerial, newSerial)`

Compare two specific state versions.

```javascript
const diff = await plugin.compareStates('terraform.tfstate', 100, 110);
console.log(diff.added);     // Resources added
console.log(diff.modified);  // Resources modified
console.log(diff.deleted);   // Resources deleted
```

### `triggerMonitoring()`

Manually trigger a monitoring check.

```javascript
const result = await plugin.triggerMonitoring();
console.log(`Processed ${result.newFiles} new files`);
console.log(`Found ${result.changedFiles} changed files`);
```

## Next Steps

1. **See complete example**: `docs/examples/e48-tfstate-advanced-monitoring.js`
2. **Understand partitions** (for faster queries): `docs/partitioning.md`
3. **Integrate with other plugins**: Use with `CachePlugin`, `AuditPlugin`, etc.

## Compatibility

- ✅ Terraform (all versions)
- ✅ OpenTofu (all versions)
- ✅ State versions: v3, v4
- ✅ Backends: local, S3, anywhere accessible

---

**💡 Tip**: Start simple with `driver: 'filesystem'` and `monitor.cron: '*/1 * * * *'` to see the plugin working locally. Then migrate to S3 in production.
