# Cloud Inventory Plugin

> **Multi-cloud inventory, drift detection, and Terraform export for 200+ resource types across 11 providers.**

---

## TLDR

**Discover and track** infrastructure across **11 cloud providers** with automatic **drift detection**, **version history**, and **Terraform export**.

**3 lines to get started:**
```javascript
import { CloudInventoryPlugin, AwsInventoryDriver } from 's3db.js/plugins';
const plugin = new CloudInventoryPlugin({ clouds: [{ driver: AwsInventoryDriver, credentials: {...} }] });
await plugin.discoverAll();
```

**Key features:**
- 11 cloud providers (AWS, GCP, Azure, Alibaba, Oracle, DigitalOcean, Linode, Hetzner, Vultr, Cloudflare, MongoDB Atlas)
- 200+ resource types
- Automatic drift detection
- Version history with immutable snapshots
- Terraform/OpenTofu export (brownfield → IaC)
- Scheduled discovery with cron
- Distributed execution with rate limiting

**Use cases:**
- Asset management: Track all cloud resources
- Cost optimization: Identify unused resources
- Security audits: Compliance scanning
- Drift detection: Alert on unauthorized changes
- IaC adoption: Export to Terraform

---

## Quick Start

```javascript
import { Database, CloudInventoryPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

const plugin = new CloudInventoryPlugin({
  clouds: [
    {
      driver: 'aws',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      },
      config: {
        accountId: '123456789012',
        regions: ['us-east-1', 'us-west-2']
      }
    }
  ]
});

await db.usePlugin(plugin);
await plugin.syncAll();

// Export to Terraform
await plugin.exportToTerraformStateFile('./terraform.tfstate');
```

---

## Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**Peer Dependencies (install only what you need):**
```bash
# AWS
pnpm install @aws-sdk/client-ec2 @aws-sdk/client-s3 @aws-sdk/client-rds

# GCP
pnpm install @google-cloud/compute @google-cloud/storage

# Azure
pnpm install @azure/identity @azure/arm-compute

# Others: See Usage Patterns guide
```

**Zero dependencies** for core plugin - SDKs loaded on-demand.

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](/plugins/cloud-inventory/guides/configuration.md) | All options, cloud definitions, managed resources, driver contract |
| [Usage Patterns](/plugins/cloud-inventory/guides/usage-patterns.md) | Cloud driver examples, Terraform export, scheduling |
| [Best Practices](/plugins/cloud-inventory/guides/best-practices.md) | Performance, security, troubleshooting, FAQ |

---

## Quick Reference

### Supported Providers

| Provider | Services | Resources | Key Features |
|----------|----------|-----------|--------------|
| **AWS** | 43+ | 60+ | EC2, S3, RDS, Lambda, VPC, EKS |
| **GCP** | 20+ | 25+ | Compute, GKE, Storage, Cloud SQL |
| **Azure** | 10+ | 25+ | VMs, AKS, Storage, Databases |
| **Alibaba** | 15+ | 40+ | ECS, ACK, OSS, RDS |
| **Oracle** | 10+ | 25+ | Compute, OKE, Block Storage |
| **DigitalOcean** | 15+ | 20+ | Droplets, K8s, Databases |
| **Linode** | 12+ | 18+ | Linodes, LKE, NodeBalancers |
| **Hetzner** | 12+ | 15+ | Servers, Volumes, Networks |
| **Vultr** | 12+ | 15+ | Instances, K8s, Block Storage |
| **Cloudflare** | 11+ | 15+ | Workers, R2, Pages, D1 |
| **MongoDB Atlas** | 11+ | 15+ | Clusters, Serverless, Backups |

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clouds` | Array | Required | Cloud provider definitions |
| `discovery.concurrency` | number | `3` | Parallel discovery |
| `terraform.enabled` | boolean | `false` | Enable TF export |
| `terraform.autoExport` | boolean | `false` | Export after discovery |
| `scheduled.cron` | string | - | Cron schedule |

### Plugin Methods

```javascript
// Discover all clouds
await plugin.syncAll();

// Discover single cloud
await plugin.syncCloud('aws-production');

// Export to Terraform
const state = await plugin.exportToTerraformState();
await plugin.exportToTerraformStateFile('./terraform.tfstate');
await plugin.exportToTerraformStateToS3('bucket', 'path/state.tfstate');
```

### Events

```javascript
db.on('plg:cloud-inventory:discovery:complete', ({ cloud, duration, resources }) => {
  console.log(`${cloud}: ${resources} resources in ${duration}ms`);
});

db.on('plg:cloud-inventory:change', ({ resource, changes }) => {
  console.log(`Drift detected:`, changes);
});
```

---

## How It Works

1. **Discovery**: Drivers fetch resources from cloud APIs
2. **Snapshots**: Each resource gets an immutable configuration snapshot
3. **Versioning**: Changes create new versions with structured diffs
4. **Drift Detection**: Compare current state vs. latest snapshot
5. **Terraform Export**: Convert inventory to `.tfstate` format

---

## Configuration Examples

### Multi-Cloud Discovery

```javascript
new CloudInventoryPlugin({
  clouds: [
    { driver: 'aws', credentials: {...}, config: { regions: ['us-east-1'] } },
    { driver: 'gcp', credentials: {...}, config: { projectId: 'my-project' } },
    { driver: 'azure', credentials: {...}, config: { subscriptionId: '...' } }
  ],
  concurrency: 3
});
```

### Scheduled Discovery

```javascript
new CloudInventoryPlugin({
  clouds: [...],
  scheduled: {
    enabled: true,
    cron: '0 */6 * * *',  // Every 6 hours
    timezone: 'UTC',
    runOnStart: true
  }
});
```

### Auto Terraform Export

```javascript
new CloudInventoryPlugin({
  clouds: [...],
  terraform: {
    enabled: true,
    autoExport: true,
    output: './terraform.tfstate',
    outputType: 'file',
    filters: { providers: ['aws'] }
  }
});
```

---

## See Also

- [Scheduler Plugin](/plugins/scheduler/README.md) - Advanced job scheduling
- [Metrics Plugin](/plugins/metrics/README.md) - Monitor discovery performance
- [Backup Plugin](/plugins/backup/README.md) - Backup inventory data
