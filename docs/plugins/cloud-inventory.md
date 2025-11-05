# Cloud Inventory Plugin

> **Multi-cloud inventory, drift detection, and Terraform export for 200+ resource types.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#configuration) | [Terraform Export →](#terraformopentofu-export) | [FAQ ↓](#-faq)

---

The **Cloud Inventory Plugin**Cloud Inventory Plugin** is a comprehensive multi-cloud resource discovery and inventory system that ingests configuration metadata from **11 cloud providers** with support for **200+ resource types** across IaaS, PaaS, Serverless, Edge Computing, and Database-as-a-Service platforms.

## 🚀 What's New

**Latest Update**: **Terraform/OpenTofu Export** + MongoDB Atlas support + expanded cloud coverage!

### ✨ New in This Release

**🆕 Terraform/OpenTofu Export** (Brownfield to IaC!)
- Export discovered resources to `.tfstate` format
- 170+ resource type mappings across 11 providers
- Instant IaC management for existing infrastructure
- Three export methods: memory, file, S3
- Compatible with Terraform 0.12+ and OpenTofu

**🆕 MongoDB Atlas Support** (11th provider!)
- Projects, Clusters, Serverless Instances
- Database Users, IP Access Lists
- Cloud Backups, Alert Configurations
- Data Lakes, Atlas Search Indexes
- Custom DB Roles, Events (audit logs)

**📈 Expanded Cloud Coverage:**
- **Alibaba Cloud**: +5 services (Security Groups, Snapshots, Auto Scaling, NAT Gateway, Container Registry)
- **Linode**: +3 services (Managed Databases, StackScripts, Placement Groups)
- **Hetzner**: +3 services (Primary IPs, Placement Groups, ISOs)
- **Cloudflare**: +3 services (SSL Certificates, WAF Rulesets, Access Applications/Policies)

**Total Coverage:** 11 cloud providers, 200+ resource types, production-ready!

---

## 🌐 Supported Cloud Providers

| Provider | Services | Resources | Key Features |
|----------|----------|-----------|--------------|
| **AWS** | 43+ | 60+ | EC2, S3, RDS, Lambda, VPC, EKS, and more |
| **GCP** | 20+ | 25+ | Compute, GKE, Cloud Storage, Cloud SQL, Pub/Sub |
| **Alibaba Cloud** | 15+ | 40+ | ECS, ACK, OSS, RDS, Auto Scaling, Security Groups |
| **Azure** | 10+ | 25+ | VMs, AKS, Storage, Databases, Networking |
| **Oracle Cloud** | 10+ | 25+ | Compute, OKE, Block Storage, VCN, Databases |
| **DigitalOcean** | 15+ | 20+ | Droplets, Kubernetes, Databases, Load Balancers |
| **Linode** | 12+ | 18+ | Linodes, LKE, Managed Databases, NodeBalancers |
| **Hetzner** | 12+ | 15+ | Servers, Volumes, Networks, Primary IPs |
| **Vultr** | 12+ | 15+ | Instances, Kubernetes, Block Storage, Firewalls |
| **Cloudflare** | 11+ | 15+ | Workers, R2, Pages, D1, WAF, Access |
| **MongoDB Atlas** | 11+ | 15+ | Clusters, Serverless, Backups, Search Indexes |

---

## Overview

The **Cloud Inventory Plugin** ingests configuration metadata from external cloud providers and keeps a canonical inventory inside **S3DB**. Each discovery cycle produces:

- A _snapshot_ record with the latest digest for the resource
- An immutable _version_ entry where the raw configuration is frozen
- A structured _change log_ capturing the delta between two revisions
- A cloud-level dashboard that stores schedules, checkpoints, and statistics

The plugin is driver oriented: every cloud provider is implemented by a driver that knows how to authenticate and list resources using the vendor API. Drivers can live in your application codebase or a dedicated package.

> ℹ️ Out of the box the plugin registers a `noop` driver (mainly for tests). Real drivers must be registered with `registerCloudDriver`.

---

## Installation

```js
import { CloudInventoryPlugin, registerCloudDriver } from 's3db.js/plugins';

// Example: register a custom AWS driver
registerCloudDriver('aws', (options) => new AwsInventoryDriver(options));

const plugin = new CloudInventoryPlugin({
  clouds: [
    {
      driver: AwsInventoryDriver, // You can also pass the class directly
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
      },
      config: {
        accountId: '123456789012',
        regions: ['us-east-1', 'us-west-2']
      },
      tags: { environment: 'production' },
      scheduled: { enabled: true, cron: '0 * * * *', timezone: 'UTC' }
    },
    {
      driver: 'do',
      credentials: { token: process.env.DO_TOKEN },
      config: { accountId: 'acme-do' }
    }
  ],
  discovery: {
    concurrency: 5,
    runOnInstall: true
  },
  resourceNames: {
    snapshots: 'plg_cloud_inventory_snapshots',
    versions: 'plg_cloud_inventory_versions',
    changes: 'plg_cloud_inventory_changes',
    clouds: 'plg_cloud_inventory_clouds'
  },
  verbose: true,
  scheduled: {
    enabled: true,
    cron: '0 0 * * *', // Global daily sync
    timezone: 'UTC',
    runOnStart: true
  },
  lock: {
    ttl: 600,
    timeout: 5
  },
  terraform: {
    enabled: true,
    autoExport: true,
    output: './terraform-discovered.tfstate', // or 's3://my-bucket/terraform.tfstate'
    outputType: 'file', // or 's3' or 'custom'
    filters: {
      providers: ['aws'], // Only AWS resources
      resourceTypes: [], // All resource types
      cloudId: null // All clouds
    },
    terraformVersion: '1.6.0',
    serial: 1
  }
});

await plugin.install(database);
await plugin.syncAll(); // Trigger a manual crawl (+ auto-export if configured)
```

---

## Configuration

| Option | Type | Description |
| ------ | ---- | ----------- |
| `clouds` | `Array` (required) | List of cloud definitions. Each entry must contain a `driver` and a `credentials` object. Optional fields: `id`, `config`, `tags`, `metadata`, `scheduled`. |
| `discovery.concurrency` | `number` | Parallelism hint passed to drivers. Default `3`. |
| `discovery.include` / `discovery.exclude` | `Array<string>` | Optional filters your drivers may honour (services, regions, etc.). |
| `discovery.runOnInstall` | `boolean` | Run `syncAll()` automatically during `onInstall`. Default `true`. |
| `discovery.dryRun` | `boolean` | Flag available for drivers to avoid persisting mutations. |
| `resourceNames.snapshots` | `string` | Resource name for the canonical registry. |
| `resourceNames.versions` | `string` | Resource name that stores frozen configurations. |
| `resourceNames.changes` | `string` | Resource name that stores diffs between versions. |
| `resourceNames.clouds` | `string` | Resource name that stores per-cloud summaries. |
| `terraform.enabled` | `boolean` | Enable Terraform auto-export. Default `false`. |
| `terraform.autoExport` | `boolean` | Auto-export after each discovery. Default `false`. |
| `terraform.output` | `string\|function` | Output path (file or S3 URL) or custom function. |
| `terraform.outputType` | `'file'\|'s3'\|'custom'` | Output type. Default `'file'`. |
| `terraform.filters.providers` | `Array<string>` | Filter by providers (e.g., `['aws', 'gcp']`). |
| `terraform.filters.resourceTypes` | `Array<string>` | Filter by resource types (e.g., `['aws.ec2.instance']`). |
| `terraform.filters.cloudId` | `string` | Filter by specific cloud ID. |
| `terraform.terraformVersion` | `string` | Terraform version in state. Default `'1.5.0'`. |
| `terraform.serial` | `number` | State serial number. Default `1`. |
| `verbose` | `boolean` | When `true`, emits informational logs to `console`. Default `false`. |
| `scheduled.enabled` | `boolean` | Enable a global cron job that triggers `syncAll()`. |
| `scheduled.cron` | `string` | Cron expression used for the global job (required when `enabled` is true). |
| `scheduled.timezone` | `string` | Optional cron timezone (e.g., `"UTC"`). |
| `scheduled.runOnStart` | `boolean` | Execute a discovery cycle immediately after the plugin starts. |
| `lock.ttl` | `number` | TTL (seconds) for the distributed cloud lock. Default `300`. |
| `lock.timeout` | `number` | How long to wait for the cloud lock (seconds). Default `0` (do not wait). |

### Cloud-level Options

Each entry inside `clouds[]` accepts a `scheduled` block mirroring the global schema:

```jsonc
{
  "driver": "aws",
  "credentials": { /* ... */ },
  "scheduled": {
    "enabled": true,
    "cron": "0 */6 * * *",
    "timezone": "UTC",
    "runOnStart": true
  }
}
```

Per-cloud schedules run **in addition** to the global one, allowing mixed cadences (e.g., global daily sync plus hourly refresh for mission-critical accounts).

> **Dependency:** Scheduling uses `node-cron`, which is bundled with s3db.js (no additional install required).

---

## Managed Resources

### Snapshots (`plg_cloud_inventory_snapshots`)

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `string` | `cloudId:resourceType:resourceId` |
| `cloudId` | `string` | Identifier provided (or auto-generated) during configuration |
| `driver` | `string` | Driver name (aws, gcp, do, …) |
| `resourceType` | `string` | Provider specific type (`ec2.instance`, `gcp.gce.instance`, …) |
| `resourceId` | `string` | Stable resource identifier |
| `name`, `region`, `service`, `tags`, `labels` | Optional metadata |
| `latestDigest` | `string` | SHA-256 over the canonical configuration |
| `latestVersion` | `number` | Latest version number |
| `latestSnapshotId` | `string` | Points to the entry in `plg_cloud_inventory_versions` |
| `firstSeenAt`, `lastSeenAt` | `string` | ISO timestamps |
| `changelogSize` | `number` | Count of registered diffs |

### Versions (`plg_cloud_inventory_versions`)

Stores frozen configuration documents. Payload is immutable and contains the full configuration (`configuration`), a normalized summary, and the raw driver payload for auditing.

### Changes (`plg_cloud_inventory_changes`)

For every new digest the plugin computes a structured diff. The diff is based on the flattened configuration path (`a.b.c`) and captures three buckets: `added`, `removed`, `updated`. Each `updated` entry includes `{ before, after }`.

### Cloud Summary (`plg_cloud_inventory_clouds`)

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | `string` | Cloud identifier (auto-generated from driver & account when omitted). |
| `driver` | `string` | Registered driver. |
| `status` | `string` | `idle`, `running`, or `error`. |
| `lastRunAt`, `lastSuccessAt`, `lastErrorAt` | `string` | Lifecycle timestamps. |
| `lastRunId` | `string` | Identifier for the most recent execution. |
| `lastResult` | `json` | Last execution summary (counts, duration, checkpoint). |
| `totalResources` | `number` | Approximate number of resources synced (incremented on create). |
| `totalVersions` | `number` | Total frozen versions recorded. |
| `checkpoint` | `json` | Driver-defined resume token. |
| `rateLimit` | `json` | Driver-defined rate-limit metadata. |
| `state` | `json` | Additional driver state (opaque). |
| `schedule` | `json` | Effective per-cloud schedule (if configured). |
| `tags`, `metadata` | `json` | Arbitrary user-provided metadata. |
| `progress` | `json` | Optional progress payload supplied by the driver. |

---

## Driver Contract

Custom drivers must derive from `BaseCloudDriver` and implement:

```ts
class AwsInventoryDriver extends BaseCloudDriver {
  async initialize() {
    // build SDK clients, validate credentials, etc.
  }

  async listResources(options) {
    // return an array OR an async iterable with the discovered resources
    return [
      {
        provider: 'aws',
        accountId: '123456789012',
        region: 'us-east-1',
        service: 'ec2',
        resourceType: 'ec2.instance',
        resourceId: 'i-0abcd1234',
        name: 'app-server-01',
        tags: { Environment: 'prod' },
        configuration: {/* full EC2 description */}
      }
    ];
  }
}
```

Returned objects can include any additional fields (`labels`, `metadata`, `raw`, etc.). The plugin normalizes and persists what it needs while keeping the raw payload inside the versions resource.

### Common Cloud Definition Fields

| Field | Description |
|-------|-------------|
| `driver` | Registered driver name (`aws`, `gcp`, `do`, `noop`, …) **or** a class/factory returning a `BaseCloudDriver`. |
| `credentials` | Opaque object passed directly to the driver factory. |
| `config` | Driver specific configuration (regions, accounts, etc.). |
| `scheduled` | Optional cron configuration (see above). |
| `tags` / `metadata` | Arbitrary metadata stored alongside the snapshot & summary records. |

You can continue registering drivers globally with `registerCloudDriver('aws', factory)`, but the plugin also accepts inline classes/factories. When a class is supplied (`driver: AwsInventoryDriver`), a temporary driver ID is generated and registered automatically. Factories must return an instance of `BaseCloudDriver`.

### Runtime helpers for drivers

When the plugin invokes `driver.listResources(options)` it passes a `runtime` object inside `options.runtime`:

```ts
interface RuntimeContext {
  checkpoint: any;             // previously stored checkpoint
  state: any;                  // previously stored driver state
  emitCheckpoint(value): void; // persist new checkpoint immediately
  emitRateLimit(value): void;  // persist rate-limit metadata
  emitState(value): void;      // persist opaque driver state
  emitProgress(value): void;   // optional progress payload (display purposes)
}
```

- Call `emitCheckpoint` whenever you finish a page of results so the plugin can resume after crashes.
- Use `emitRateLimit` to surface back-off windows or quota information.
- `emitState` can hold any custom payload (e.g., next page tokens or filters).
- All helpers update the cloud summary resource in real time.

Returning an async iterable is recommended; the plugin iterates sequentially and handles versioning/diffing automatically.

---

## Public API

Once installed you can trigger discovery manually:

```js
await plugin.syncAll();          // all clouds
await plugin.syncCloud('aws');   // single cloud
```

Each call returns a summary `{ cloudId, driver, created, updated, unchanged, processed, durationMs }`.

---

## Terraform/OpenTofu Export

**🚀 NEW: Brownfield to IaC Workflow**

Export discovered cloud resources to Terraform/OpenTofu state format (`.tfstate`), enabling instant infrastructure-as-code management for existing resources.

### Use Cases

- **Brownfield Migration**: Import existing cloud infrastructure into Terraform management
- **Disaster Recovery**: Generate Terraform state files for infrastructure recreation
- **Compliance & Audit**: Create IaC baselines for security/compliance verification
- **Multi-Cloud IaC**: Unified Terraform management across 11 cloud providers
- **Documentation**: Auto-generate infrastructure documentation via Terraform

### Quick Start

```javascript
// 1. Discover resources
await plugin.syncAll();

// 2. Export to Terraform state
const result = await plugin.exportToTerraformState();
console.log(result.state);  // Standard Terraform state object
console.log(result.stats);  // { total, converted, skipped }

// 3. Export to file
await plugin.exportToTerraformStateFile('./terraform.tfstate');

// 4. Use with Terraform/OpenTofu
// $ terraform plan  # Terraform recognizes existing resources
```

### Export Methods

#### `exportToTerraformState(options)`

Export to Terraform state object in memory.

**Options:**
- `providers` (Array<string>) - Filter by provider (e.g., `['aws', 'gcp']`)
- `resourceTypes` (Array<string>) - Filter by resource type (e.g., `['aws.ec2.instance']`)
- `cloudId` (string) - Filter by specific cloud ID
- `terraformVersion` (string) - Terraform version (default: `'1.5.0'`)
- `serial` (number) - State serial number (default: `1`)
- `lineage` (string) - State lineage UUID (default: auto-generated)
- `outputs` (Object) - Terraform outputs (default: `{}`)

**Returns:** `{ state, stats }`
- `state` - Terraform state object (version 4 format)
- `stats` - { total, converted, skipped, skippedTypes }

**Examples:**

```javascript
// Export all resources
const all = await plugin.exportToTerraformState();

// Export AWS resources only
const aws = await plugin.exportToTerraformState({
  providers: ['aws']
});

// Export specific resource types
const compute = await plugin.exportToTerraformState({
  resourceTypes: ['aws.ec2.instance', 'gcp.compute.instance']
});

// Custom Terraform version and outputs
const custom = await plugin.exportToTerraformState({
  terraformVersion: '1.6.0',
  serial: 42,
  outputs: {
    vpc_id: { value: 'vpc-123', type: 'string' }
  }
});
```

#### `exportToTerraformStateFile(filePath, options)`

Export to local `.tfstate` file.

**Parameters:**
- `filePath` (string) - Output file path
- `options` (Object) - Same as `exportToTerraformState()`

**Returns:** `{ filePath, state, stats }`

**Example:**

```javascript
await plugin.exportToTerraformStateFile('./terraform.tfstate', {
  providers: ['aws', 'gcp']
});
```

#### `exportToTerraformStateToS3(bucket, key, options)`

Export to S3 bucket (for remote state backends).

**Parameters:**
- `bucket` (string) - S3 bucket name
- `key` (string) - S3 object key
- `options` (Object) - Same as `exportToTerraformState()`

**Returns:** `{ bucket, key, state, stats }`

**Example:**

```javascript
await plugin.exportToTerraformStateToS3(
  'my-terraform-states',
  'production/terraform.tfstate',
  { providers: ['aws'] }
);
```

### Auto-Export Configuration

Configure automatic Terraform state export after each discovery:

```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [...],
  terraform: {
    enabled: true,
    autoExport: true,
    output: './terraform-discovered.tfstate',
    outputType: 'file', // 'file', 's3', or 'custom'
    filters: {
      providers: ['aws'],           // Export only AWS resources
      resourceTypes: [],            // Empty = all resource types
      cloudId: null                 // null = all clouds
    },
    terraformVersion: '1.6.0',
    serial: 1
  }
});

// Now every syncCloud() or syncAll() will auto-export!
await plugin.syncAll(); // Discovers + exports automatically
```

**Output Types:**

1. **File Output** (`outputType: 'file'`):
```javascript
terraform: {
  enabled: true,
  autoExport: true,
  output: './terraform-discovered.tfstate',
  outputType: 'file'
}
```

2. **S3 Output** (`outputType: 's3'`):
```javascript
terraform: {
  enabled: true,
  autoExport: true,
  output: 's3://my-bucket/terraform/production.tfstate',
  outputType: 's3'
}
```

3. **Custom Function** (`outputType: 'custom'`):
```javascript
terraform: {
  enabled: true,
  autoExport: true,
  output: async (stateData) => {
    // Custom export logic
    await sendToWebhook(stateData);
    await uploadToCustomStorage(stateData);
    return { custom: true };
  },
  outputType: 'custom'
}
```

**Behavior:**
- When `autoExport` is enabled, export runs **after each successful discovery**
- Export failures are logged but don't fail the discovery operation
- Use `filters` to control which resources get exported
- `cloudId` filter allows per-cloud exports (useful with scheduled jobs)

### Supported Resource Mappings

The exporter automatically maps cloud inventory resource types to Terraform resource types:

| Cloud Resource Type | Terraform Resource Type | Provider |
|---------------------|-------------------------|----------|
| `aws.ec2.instance` | `aws_instance` | AWS |
| `aws.s3.bucket` | `aws_s3_bucket` | AWS |
| `aws.rds.instance` | `aws_db_instance` | AWS |
| `gcp.compute.instance` | `google_compute_instance` | GCP |
| `gcp.storage.bucket` | `google_storage_bucket` | GCP |
| `azure.vm` | `azurerm_virtual_machine` | Azure |
| `do.droplet` | `digitalocean_droplet` | DigitalOcean |
| `alibaba.ecs.instance` | `alicloud_instance` | Alibaba Cloud |
| `mongodb-atlas.cluster` | `mongodbatlas_cluster` | MongoDB Atlas |
| ... | ... | ... |

**Total Mappings:** 170+ resource types across 11 cloud providers

See `src/plugins/cloud-inventory/terraform-exporter.js` for complete list.

### Next Steps After Export

**Option 1: Use Generated State Directly**

```bash
# Copy exported state
cp terraform-discovered.tfstate terraform.tfstate

# Terraform recognizes existing resources
terraform plan

# No changes needed - infrastructure already exists!
```

**Option 2: Import Individual Resources**

```bash
# Import resources one by one
terraform import aws_instance.my_server i-1234567890abcdef0
terraform import aws_s3_bucket.my_bucket my-app-bucket
```

**Option 3: Generate Terraform Configuration**

```bash
# Export state to JSON
terraform show -json terraform-discovered.tfstate > state.json

# Use tools to generate .tf files
# - terraformer: github.com/GoogleCloudPlatform/terraformer
# - terraform-provider-iterative: github.com/iterative/terraform-provider-iterative
# - Custom script using state.json
```

### Important Notes

- **Unmapped Resources**: Resources without Terraform mappings are skipped (see `stats.skippedTypes`)
- **Configuration Accuracy**: Exported attributes match discovered configuration - may need adjustment
- **State File Format**: Uses Terraform state version 4 (compatible with Terraform 0.12+, OpenTofu)
- **No Credentials**: Credentials are sanitized during discovery (not included in state)
- **Resource Names**: Generated from resource IDs, sanitized for Terraform naming conventions

### Example Output

```json
{
  "version": 4,
  "terraform_version": "1.5.0",
  "serial": 1,
  "lineage": "a1b2c3d4-e5f6-4789-9abc-def012345678",
  "outputs": {},
  "resources": [
    {
      "mode": "managed",
      "type": "aws_instance",
      "name": "resource_i_1234567890abcdef0",
      "provider": "registry.terraform.io/hashicorp/aws",
      "instances": [
        {
          "schema_version": 0,
          "attributes": {
            "instanceId": "i-1234567890abcdef0",
            "instanceType": "t3.medium",
            "state": "running",
            "privateIpAddress": "10.0.1.10",
            "subnetId": "subnet-abc123",
            "vpcId": "vpc-xyz789"
          },
          "private": "bnVsbA==",
          "dependencies": []
        }
      ]
    }
  ]
}
```

### Complete Example

See [docs/examples/e70-cloud-inventory-terraform-export.js](../examples/e70-cloud-inventory-terraform-export.js) for a full working example.

---

## Diff Terminology

- **Configuration Digest** – SHA-256 digest computed from a canonical JSON representation of the configuration (a "fingerprint").
- **Version** – Immutable snapshot of a configuration (frozen document).
- **Change Log** – Structured diff describing how one version differs from another.

---

## Distributed execution & rate limits

- Each `syncCloud` acquires a distributed lock (via `PluginStorage`) so that only one pod works on a given cloud at a time. Behaviour is configurable through `lock.ttl` / `lock.timeout`.
- Drivers can throttle or pause discovery by emitting checkpoints / rate-limit metadata through the runtime helpers. The plugin persists this information and rehydrates it before the next run.
- The global summary resource keeps track of the last run, counts, and resume tokens, enabling safe restarts even when the process crashes mid-discovery.

---

## Built-in Drivers

### AWS Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **43+ AWS services** across **60+ resource types**

#### Compute & Containers
- ✅ EC2 (instances), ECS (clusters, services, task definitions), EKS (clusters, node groups), Lambda (functions)

#### Networking (16 resource types)
- ✅ VPC (VPCs, subnets, security groups, route tables, IGWs, NAT gateways, NACLs)
- ✅ Load Balancers (Classic ELB, ALB, NLB, target groups)
- ✅ Route53 (hosted zones), CloudFront (distributions)
- ✅ VPN (connections, customer gateways), Transit Gateway (gateways, attachments)

#### Storage & Database
- ✅ S3 (buckets), RDS (instances), DynamoDB (tables), ElastiCache (clusters)
- ✅ EFS (file systems), EBS (volumes, snapshots)

#### Security, Identity & Compliance
- ✅ IAM (users, roles), KMS (keys), Secrets Manager (secrets), SSM Parameter Store (parameters)
- ✅ ACM (certificates), Cognito (user pools)
- ✅ WAF Classic (global web ACLs), WAFv2 (regional + CloudFront web ACLs)
- ✅ CloudTrail (trails), Config (recorders, delivery channels)

#### Integration & Messaging
- ✅ SQS (queues), SNS (topics), EventBridge (buses, rules), Step Functions (state machines), Kinesis (streams)

#### Developer Tools
- ✅ ECR (repositories), API Gateway (REST v1, HTTP v2, WebSocket v2 APIs)

#### Monitoring & Backup
- ✅ CloudWatch (alarms), CloudWatch Logs (log groups), Backup (plans, vaults)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Multi-region support** - discover across all AWS regions
- ✅ **Complete tag collection** - every resource type includes tags
- ✅ **Full configuration** - stores complete AWS API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking

**Authentication:** All AWS credential methods supported (access keys, profiles, IAM roles, instance profiles, etc.)

**Configuration:**
```javascript
{
  driver: 'aws',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  config: {
    accountId: '123456789012',
    regions: ['us-east-1', 'us-west-2'],
    services: ['ec2', 'vpc', 'rds', 'dynamodb'] // Optional: filter services
  }
}
```

---

### GCP Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **20+ GCP services** across **25+ resource types**

#### Compute & Containers
- ✅ Compute Engine (instances), GKE (clusters), Cloud Run (services), Cloud Functions (functions)

#### Storage & Database
- ✅ Cloud Storage (buckets), Cloud SQL (instances), BigQuery (datasets)

#### Networking
- ✅ VPC (networks, subnets, firewalls)

#### Security & Identity
- ✅ IAM (service accounts), Cloud KMS (key rings), Secret Manager (secrets)

#### Integration & Messaging
- ✅ Pub/Sub (topics, subscriptions)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Multi-region support** - discover across all GCP regions
- ✅ **Complete label collection** - every resource type includes labels
- ✅ **Full configuration** - stores complete GCP API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking

**Authentication:** Service account key file, JSON credentials, or Application Default Credentials (ADC)

**Configuration:**
```javascript
{
  driver: 'gcp',
  credentials: {
    // Option 1: Key file path
    keyFile: '/path/to/service-account-key.json',

    // Option 2: Credentials object
    credentials: {
      type: 'service_account',
      project_id: 'my-project',
      private_key_id: '...',
      private_key: '...',
      client_email: 'my-sa@my-project.iam.gserviceaccount.com',
      // ... rest of service account JSON
    },

    // Option 3: Application Default Credentials (ADC)
    // Leave empty to use ADC (gcloud auth, workload identity, etc.)
  },
  config: {
    projectId: 'my-gcp-project',
    regions: ['us-central1', 'europe-west1'],
    services: ['compute', 'gke', 'storage', 'sql'] // Optional: filter services
  }
}
```

**Available Services:**
- `compute` - Compute Engine instances
- `gke` - GKE clusters
- `run` - Cloud Run services
- `functions` - Cloud Functions
- `storage` - Cloud Storage buckets
- `sql` - Cloud SQL instances
- `bigquery` - BigQuery datasets
- `pubsub` - Pub/Sub topics & subscriptions
- `vpc` - VPC networks, subnets, firewalls
- `iam` - IAM service accounts
- `kms` - Cloud KMS key rings
- `secretmanager` - Secret Manager secrets

---

### Vultr Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **12+ Vultr services** across **15+ resource types**

#### Compute & Containers
- ✅ Compute Instances (VPS), Bare Metal servers, Kubernetes (VKE clusters, node pools)

#### Storage
- ✅ Block Storage (volumes), Snapshots, Object Storage (buckets)

#### Networking & Security
- ✅ Load Balancers, Firewalls (groups, rules), VPC (networks, legacy VPC)

#### DNS & Identity
- ✅ DNS (domains, records), SSH Keys

#### Databases
- ✅ Managed Databases (MySQL, PostgreSQL, Redis)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete tag collection** - every resource type includes tags
- ✅ **Full configuration** - stores complete Vultr API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Nested resources** - firewall rules, DNS records, K8s node pools

**Authentication:** Vultr API key (Personal Access Token)

**Configuration:**
```javascript
{
  driver: 'vultr',
  credentials: {
    // Option 1: API key directly
    apiKey: process.env.VULTR_API_KEY,

    // Option 2: Using 'token' field
    token: 'YOUR_VULTR_API_KEY'
  },
  config: {
    accountId: 'my-vultr-account',
    services: ['instances', 'kubernetes', 'blockstorage', 'loadbalancers'] // Optional: filter services
  }
}
```

**Available Services:**
- `instances` - Compute instances (VPS)
- `baremetal` - Bare metal servers
- `kubernetes` - VKE clusters and node pools
- `blockstorage` - Block storage volumes
- `snapshots` - Snapshots
- `loadbalancers` - Load balancers
- `firewalls` - Firewall groups and rules
- `vpc` - VPC 2.0 networks (with legacy VPC fallback)
- `dns` - DNS domains and records
- `databases` - Managed databases
- `sshkeys` - SSH keys
- `objectstorage` - Object storage buckets

**Getting an API Key:**
1. Log in to [Vultr Cloud Portal](https://my.vultr.com/)
2. Navigate to Account → API
3. Click "Enable API" if not enabled
4. Generate a new Personal Access Token
5. Set appropriate IP restrictions for security

---

### DigitalOcean Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **15+ DigitalOcean services** across **20+ resource types**

#### Compute & Containers
- ✅ Droplets (VPS), Kubernetes (DOKS clusters, node pools), App Platform

#### Storage
- ✅ Block Storage (volumes), Snapshots, Spaces (object storage - S3-compatible)

#### Networking & Security
- ✅ Load Balancers, Firewalls, VPC, Floating IPs

#### DNS & CDN
- ✅ DNS (domains, records), CDN (endpoints)

#### Databases & Registry
- ✅ Managed Databases (PostgreSQL, MySQL, Redis, MongoDB)
- ✅ Container Registry (repositories)

#### Identity
- ✅ SSH Keys

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete tag collection** - every resource type includes tags
- ✅ **Full configuration** - stores complete DigitalOcean API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Nested resources** - DNS records, K8s node pools, registry repositories

**Authentication:** DigitalOcean API Token (Personal Access Token)

**Configuration:**
```javascript
{
  driver: 'digitalocean', // or 'do' alias
  credentials: {
    // Option 1: Using 'token' field
    token: process.env.DIGITALOCEAN_TOKEN,

    // Option 2: Using 'apiToken' field
    apiToken: 'YOUR_DIGITALOCEAN_TOKEN'
  },
  config: {
    accountId: 'my-do-account',
    services: ['droplets', 'kubernetes', 'databases', 'loadbalancers'], // Optional: filter services
    regions: ['nyc1', 'sfo3', 'ams3'] // Optional: filter regions
  }
}
```

**Available Services:**
- `droplets` - Droplets (VPS)
- `kubernetes` - DOKS clusters and node pools
- `databases` - Managed databases
- `volumes` - Block storage volumes
- `snapshots` - Snapshots
- `loadbalancers` - Load balancers
- `firewalls` - Firewalls
- `vpc` - VPC networks
- `floatingips` - Floating IPs
- `domains` - DNS domains and records
- `cdn` - CDN endpoints
- `registry` - Container registry and repositories
- `apps` - App Platform apps
- `sshkeys` - SSH keys
- `spaces` - Spaces object storage (requires S3 SDK implementation)

**Getting an API Token:**
1. Log in to [DigitalOcean Cloud Portal](https://cloud.digitalocean.com/)
2. Navigate to API → Tokens/Keys
3. Click "Generate New Token"
4. Give it a name and select appropriate scopes (read or read/write)
5. Copy the token immediately (shown only once)

**SDK:** Uses community library [digitalocean-js](https://github.com/johnbwoodruff/digitalocean-js) (TypeScript-based, Promise-friendly)

---

### Oracle Cloud Infrastructure (OCI) Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **10+ OCI services** across **25+ resource types**

#### Compute & Containers
- ✅ Compute (instances, boot volumes, images)
- ✅ Kubernetes (OKE clusters, node pools)

#### Storage & Databases
- ✅ Block Storage (volumes), Object Storage (buckets), File Storage (file systems)
- ✅ Databases (Autonomous Database, DB Systems)

#### Networking & Security
- ✅ VCN (Virtual Cloud Networks, subnets)
- ✅ Load Balancers

#### Identity & DNS
- ✅ Identity (users, groups, compartments, policies)
- ✅ DNS (zones)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete tag collection** - freeform and defined tags
- ✅ **Full configuration** - stores complete OCI API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Multi-region support** - discover across all subscribed regions
- ✅ **Nested resources** - OKE node pools, VCN subnets, SQL databases

**Authentication:** Multiple methods supported

**Configuration:**
```javascript
{
  driver: 'oracle', // or 'oci' alias
  credentials: {
    // Option 1: Config file authentication
    configFilePath: '~/.oci/config',
    profile: 'DEFAULT',

    // Option 2: Instance principal (for OCI compute instances)
    instancePrincipal: true,

    // Option 3: Direct credentials
    tenancy: 'ocid1.tenancy.oc1...',
    user: 'ocid1.user.oc1...',
    fingerprint: 'aa:bb:cc:dd:ee:ff:...',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
    region: 'us-ashburn-1'
  },
  config: {
    accountId: 'my-oci-account',
    tenancyId: 'ocid1.tenancy.oc1...',
    compartmentId: 'ocid1.compartment.oc1...', // Optional: defaults to tenancy
    services: ['compute', 'kubernetes', 'database'], // Optional: filter services
    regions: ['us-ashburn-1', 'us-phoenix-1'] // Optional: filter regions
  }
}
```

**Available Services:**
- `compute` - Compute instances
- `kubernetes` - OKE clusters and node pools
- `database` - Autonomous Database and DB Systems
- `blockstorage` - Block volumes
- `objectstorage` - Object storage buckets
- `filestorage` - File systems
- `vcn` - Virtual Cloud Networks and subnets
- `loadbalancer` - Load balancers
- `identity` - Users, groups, compartments
- `dns` - DNS zones

**SDK:** Uses official [oci-sdk](https://github.com/oracle/oci-typescript-sdk) for TypeScript/JavaScript

---

### Microsoft Azure Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **10+ Azure services** across **25+ resource types**

#### Compute & Containers
- ✅ Virtual Machines, VM Scale Sets, Availability Sets
- ✅ Kubernetes (AKS clusters, node pools)
- ✅ Container Registry (ACR)

#### Storage & Databases
- ✅ Storage Accounts, Disks, Snapshots
- ✅ SQL Databases (servers, databases)
- ✅ Cosmos DB accounts

#### Networking & Security
- ✅ Virtual Networks (VNets, subnets)
- ✅ Load Balancers, Public IPs
- ✅ Network Security Groups (NSGs)
- ✅ Application Gateways

#### Identity & DNS
- ✅ Managed Identities (user-assigned)
- ✅ DNS (zones, record sets)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete tag collection** - every resource type includes tags
- ✅ **Full configuration** - stores complete Azure API responses
- ✅ **Memory efficient** - async generators with pagination
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Nested resources** - AKS node pools, VNet subnets, SQL databases

**Authentication:** Azure Active Directory (AAD) with DefaultAzureCredential or Service Principal

**Configuration:**
```javascript
{
  driver: 'azure', // or 'az' alias
  credentials: {
    subscriptionId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Required

    // Option 1: Service Principal
    clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    clientSecret: 'your-client-secret',
    tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',

    // Option 2: DefaultAzureCredential (managed identity, Azure CLI, env vars)
    // Leave clientId/clientSecret/tenantId empty to use default
  },
  config: {
    accountId: 'my-azure-account',
    services: ['compute', 'kubernetes', 'storage', 'databases'], // Optional: filter services
    resourceGroups: ['rg-production', 'rg-staging'] // Optional: filter resource groups
  }
}
```

**Available Services:**
- `compute` - Virtual Machines, VM Scale Sets
- `kubernetes` - AKS clusters and node pools
- `storage` - Storage accounts
- `disks` - Managed disks and snapshots
- `databases` - SQL databases (servers and databases)
- `cosmosdb` - Cosmos DB accounts
- `network` - VNets, subnets, load balancers, public IPs, NSGs
- `containerregistry` - Azure Container Registry
- `dns` - DNS zones
- `identity` - Managed identities

**Getting Started:**
1. Create a Service Principal: `az ad sp create-for-rbac --name "sp-cloud-inventory"`
2. Assign Reader role: `az role assignment create --assignee <clientId> --role Reader --scope /subscriptions/<subscriptionId>`
3. Use the credentials in configuration

**SDK:** Uses official [@azure/arm-*](https://github.com/Azure/azure-sdk-for-js) packages from Microsoft

---

### Linode (Akamai Cloud) Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **10+ Linode services** across **15+ resource types**

#### Compute & Containers
- ✅ Linodes (compute instances/VPS)
- ✅ Kubernetes (LKE clusters, node pools)

#### Storage
- ✅ Block Storage (volumes)

#### Networking & Security
- ✅ NodeBalancers (load balancers), Firewalls, VLANs

#### DNS & Identity
- ✅ DNS (domains, records), SSH Keys, Images

#### Object Storage
- ✅ Object Storage (buckets)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete tag collection** - every resource type includes tags
- ✅ **Full configuration** - stores complete Linode API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Nested resources** - DNS records, K8s node pools

**Authentication:** Linode API Token (Personal Access Token)

**Configuration:**
```javascript
{
  driver: 'linode',
  credentials: {
    // Option 1: Using 'token' field
    token: process.env.LINODE_TOKEN,

    // Option 2: Using 'apiToken' field
    apiToken: 'YOUR_LINODE_TOKEN'
  },
  config: {
    accountId: 'my-linode-account',
    services: ['linodes', 'kubernetes', 'volumes', 'nodebalancers'], // Optional: filter services
    regions: ['us-east', 'eu-west'] // Optional: filter regions
  }
}
```

**Available Services:**
- `linodes` - Compute instances
- `kubernetes` - LKE clusters and node pools
- `volumes` - Block storage volumes
- `nodebalancers` - NodeBalancers (load balancers)
- `firewalls` - Firewalls
- `vlans` - VLANs
- `domains` - DNS domains and records
- `images` - Custom images
- `objectstorage` - Object storage buckets

**Getting an API Token:**
1. Log in to [Linode Cloud Manager](https://cloud.linode.com/)
2. Navigate to Account → API Tokens
3. Click "Create a Personal Access Token"
4. Select appropriate permissions (Read Only or Read/Write)
5. Copy the token immediately (shown only once)

**SDK:** Uses official [@linode/api-v4](https://www.npmjs.com/package/@linode/api-v4) SDK

---

### Hetzner Cloud Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **10+ Hetzner services** across **12+ resource types**

#### Compute & Storage
- ✅ Servers (VPS), Volumes (block storage)

#### Networking & Security
- ✅ Networks (private networks/VPC with subnets), Load Balancers, Firewalls, Floating IPs

#### Identity & Images
- ✅ SSH Keys, Images (snapshots/backups), Certificates

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete label collection** - every resource type includes labels
- ✅ **Full configuration** - stores complete Hetzner API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Nested resources** - network subnets with parent linking

**Authentication:** Hetzner Cloud API Token

**Configuration:**
```javascript
{
  driver: 'hetzner',
  credentials: {
    // Option 1: Using 'token' field
    token: process.env.HETZNER_TOKEN,

    // Option 2: Using 'apiToken' field
    apiToken: 'YOUR_HETZNER_TOKEN'
  },
  config: {
    accountId: 'my-hetzner-account',
    services: ['servers', 'volumes', 'networks', 'loadbalancers'] // Optional: filter services
  }
}
```

**Available Services:**
- `servers` - Servers (VPS)
- `volumes` - Block storage volumes
- `networks` - Private networks (VPC) with subnets
- `loadbalancers` - Load balancers
- `firewalls` - Firewalls
- `floatingips` - Floating IPs
- `sshkeys` - SSH keys
- `images` - Custom images (snapshots/backups only)
- `certificates` - SSL certificates

**Getting an API Token:**
1. Log in to [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Select your project
3. Navigate to Security → API Tokens
4. Click "Generate API Token"
5. Select permissions (Read or Read & Write)
6. Copy the token immediately (shown only once)

**SDK:** Uses [hcloud-js](https://github.com/dennisbruner/hcloud-js) (community library)

**Note:** Popular European cloud provider with excellent pricing and performance.

---

### Alibaba Cloud Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **10+ Alibaba Cloud services** across **30+ resource types**

Alibaba Cloud (阿里云, Aliyun) is the 4th largest cloud provider globally and dominant in Asia.

#### Compute & Containers
- ✅ ECS (Elastic Compute Service instances)
- ✅ ACK (Container Service for Kubernetes clusters, node pools)

#### Storage & Database
- ✅ OSS (Object Storage Service buckets)
- ✅ RDS (Relational Database Service instances)
- ✅ Redis (ApsaraDB for Redis instances)

#### Networking & CDN
- ✅ VPC (Virtual Private Cloud networks, subnets, vSwitches)
- ✅ SLB (Server Load Balancer)
- ✅ EIP (Elastic IP addresses)
- ✅ CDN (distributions)
- ✅ DNS (domains)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Multi-region support** - discover across all Alibaba regions
- ✅ **Complete tag collection** - every resource type includes tags
- ✅ **Full configuration** - stores complete API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Nested resources** - ACK node pools, VPC subnets

**Authentication:** Access Key ID + Secret (RAM user or resource account)

**Configuration:**
```javascript
{
  driver: 'alibaba', // or 'aliyun' alias
  credentials: {
    accessKeyId: process.env.ALIBABA_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_ACCESS_KEY_SECRET
  },
  config: {
    accountId: 'my-alibaba-account',
    regions: ['cn-hangzhou', 'cn-beijing', 'ap-southeast-1'], // Optional: filter regions
    services: ['ecs', 'ack', 'oss', 'rds'] // Optional: filter services
  }
}
```

**Available Services:**
- `ecs` - Elastic Compute Service (VMs)
- `ack` - Container Service for Kubernetes (clusters, node pools)
- `oss` - Object Storage Service (buckets)
- `rds` - Relational Database Service
- `redis` - ApsaraDB for Redis
- `vpc` - Virtual Private Cloud (networks, subnets, vSwitches)
- `slb` - Server Load Balancer
- `eip` - Elastic IP addresses
- `cdn` - CDN distributions
- `dns` - DNS domains

**Getting Access Keys:**
1. Log in to [Alibaba Cloud Console](https://account.aliyun.com/)
2. Navigate to AccessKey Management
3. Create RAM user with appropriate permissions
4. Generate Access Key ID and Secret
5. Store credentials securely

**SDK:** Uses official [@alicloud/pop-core](https://www.npmjs.com/package/@alicloud/pop-core) and [ali-oss](https://www.npmjs.com/package/ali-oss) SDKs

**RPC Client Pattern:** Each service uses region-specific RPC clients with proper endpoint URLs.

---

### Cloudflare Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **8+ Cloudflare services** across **10+ edge computing resource types**

Cloudflare specializes in edge computing, serverless, and global content delivery.

#### Edge Computing & Serverless
- ✅ Workers (scripts, cron triggers, routes)
- ✅ Pages (projects, deployments)
- ✅ Durable Objects (namespaces)

#### Storage & Database
- ✅ R2 (object storage buckets - S3-compatible)
- ✅ D1 (serverless SQL databases)
- ✅ KV (key-value namespaces)

#### Networking & DNS
- ✅ Zones (domains, DNS records)
- ✅ Load Balancers

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete tag collection** - tags where supported
- ✅ **Full configuration** - stores complete Cloudflare API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Nested resources** - DNS records per zone
- ✅ **Global/edge regions** - resources deployed globally

**Authentication:** Cloudflare API Token

**Configuration:**
```javascript
{
  driver: 'cloudflare', // or 'cf' alias
  credentials: {
    // Option 1: Using 'apiToken' field
    apiToken: process.env.CLOUDFLARE_API_TOKEN,

    // Option 2: Using 'token' field
    token: 'YOUR_CLOUDFLARE_TOKEN'
  },
  config: {
    accountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID', // Required for most resources
    services: ['workers', 'r2', 'pages', 'd1'] // Optional: filter services
  }
}
```

**Available Services:**
- `workers` - Workers scripts (serverless functions)
- `r2` - R2 object storage buckets
- `pages` - Pages projects (static sites)
- `d1` - D1 databases (serverless SQL)
- `kv` - KV namespaces (key-value store)
- `durable-objects` - Durable Objects namespaces
- `zones` - Zones (domains) and DNS records
- `loadbalancers` - Load balancers

**Getting an API Token:**
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to My Profile → API Tokens
3. Click "Create Token"
4. Select appropriate template or create custom token
5. Grant necessary permissions (Account:Read for inventory)
6. Copy the token immediately (shown only once)

**Finding Account ID:**
1. Log in to Cloudflare Dashboard
2. Select any website/domain
3. Scroll down right sidebar - Account ID is displayed
4. Or go to Overview → Account ID in the right column

**SDK:** Uses official [cloudflare](https://www.npmjs.com/package/cloudflare) SDK (TypeScript)

**Note:** Resources are typically global/edge-deployed. The `region` field is set to `'global'` for most resources.

---

### MongoDB Atlas Driver

**✨ PRODUCTION-READY** - Comprehensive coverage of **11+ MongoDB Atlas services** across **15+ resource types**

MongoDB Atlas is a fully managed cloud database service (DBaaS) for MongoDB. The driver provides complete visibility into your Atlas organization infrastructure.

#### Database & Compute
- ✅ Clusters (M0/M2/M5/M10+ shared and dedicated clusters)
- ✅ Serverless Instances (serverless MongoDB databases)
- ✅ Projects (project/group organization)

#### Security & Access
- ✅ Database Users (authentication and authorization)
- ✅ IP Access Lists (network security whitelists)
- ✅ Custom DB Roles (custom RBAC roles)

#### Backup & Recovery
- ✅ Cloud Backups (snapshots and continuous backups)

#### Monitoring & Alerts
- ✅ Alert Configurations (monitoring alert rules)
- ✅ Events (audit logs and activity tracking)

#### Advanced Features
- ✅ Data Lakes (federated database instances)
- ✅ Atlas Search Indexes (full-text search indexes)

**Production Features:**
- ✅ **Resilient error handling** - continues if individual services fail
- ✅ **Complete tag collection** - every resource type includes tags
- ✅ **Full configuration** - stores complete MongoDB Atlas API responses
- ✅ **Memory efficient** - async generators for streaming
- ✅ **Detailed logging** - comprehensive error tracking
- ✅ **Multi-project support** - scan all accessible projects or specific ones
- ✅ **Nested resource collection** - search indexes per cluster, policies per application

**Authentication:** MongoDB Atlas API Keys (Public Key + Private Key)

**Configuration:**
```javascript
{
  driver: 'mongodb-atlas', // or 'atlas' alias
  credentials: {
    publicKey: process.env.MONGODB_ATLAS_PUBLIC_KEY,
    privateKey: process.env.MONGODB_ATLAS_PRIVATE_KEY,
    organizationId: 'YOUR_ORG_ID' // Optional: for organization-level filtering
  },
  config: {
    organizationId: 'my-atlas-org', // Optional: filter by organization
    projectIds: ['project-1', 'project-2'], // Optional: specific projects (null = all)
    services: ['clusters', 'serverless', 'users', 'backups'] // Optional: filter services
  }
}
```

**Available Services:**
- `projects` - Projects (groups) in the organization
- `clusters` - Database clusters (M0-M10+, replica sets, sharded clusters)
- `serverless` - Serverless instances
- `users` - Database users with roles and permissions
- `accesslists` - IP access lists (whitelists)
- `backups` - Cloud backups and snapshots
- `alerts` - Alert configurations
- `datalakes` - Data Lake (federated database instances)
- `search` - Atlas Search indexes
- `customroles` - Custom database roles
- `events` - Events (audit logs, last 7 days)

**Getting API Keys:**
1. Log in to [MongoDB Atlas Console](https://cloud.mongodb.com/)
2. Navigate to Organization → Access Manager → API Keys
3. Click "Create API Key"
4. Set permissions (Organization Project Creator for read-only inventory)
5. Copy the Public Key and Private Key
6. Add your IP to the API Access List

**Finding Organization ID:**
1. Log in to MongoDB Atlas Console
2. Click on your organization name in the top-left
3. Go to Settings
4. Organization ID is displayed in the General tab

**SDK:** Uses [mongodb-atlas-api-client](https://www.npmjs.com/package/mongodb-atlas-api-client) or direct HTTP Digest Authentication

**API Version:** Atlas Administration API v2 (2025)

**Resource Types:**
- `mongodb-atlas.project` - Projects/groups
- `mongodb-atlas.cluster` - Database clusters
- `mongodb-atlas.serverless` - Serverless instances
- `mongodb-atlas.user` - Database users
- `mongodb-atlas.accesslist` - IP access list entries
- `mongodb-atlas.backup` - Cloud backup snapshots
- `mongodb-atlas.alert` - Alert configurations
- `mongodb-atlas.datalake` - Data Lake instances
- `mongodb-atlas.search.index` - Atlas Search indexes
- `mongodb-atlas.customrole` - Custom database roles
- `mongodb-atlas.event` - Audit log events

**Example Usage:**
```javascript
import { CloudInventoryPlugin } from 's3db.js/plugins';

const plugin = new CloudInventoryPlugin({
  clouds: [
    {
      driver: 'mongodb-atlas',
      credentials: {
        publicKey: process.env.MONGODB_ATLAS_PUBLIC_KEY,
        privateKey: process.env.MONGODB_ATLAS_PRIVATE_KEY
      },
      config: {
        organizationId: 'my-org',
        services: ['clusters', 'users', 'backups', 'search']
      }
    }
  ]
});

await plugin.install(database);
const results = await plugin.syncAll();
```

**Important Notes:**
- Event collection is limited to the last 7 days to avoid overwhelming the API
- Most resources are global (no specific region)
- Backups require cluster enumeration first (nested collection)
- Search indexes require cluster enumeration first (nested collection)
- HTTP Digest Authentication is used for API requests
- Connection strings and passwords are automatically sanitized

---

### Driver Customisation

Built-in drivers now map 1:1 with their respective providers (`aws`, `gcp`, `azure`, `digitalocean`, `oracle`, `vultr`, `linode`, `hetzner`, `alibaba`, `cloudflare`, `mongodb-atlas`). Each driver talks to the real cloud API and requires valid credentials – no stub adapters are bundled.

For development sandboxes you can register your own lightweight driver:

```js
import { registerCloudDriver, BaseCloudDriver } from 's3db.js/plugins/cloud-inventory';

class FixtureDriver extends BaseCloudDriver {
  async listResources() {
    return [
      {
        provider: 'fixture',
        driver: 'fixture',
        resourceId: 'local-instance-1',
        region: 'local',
        service: 'compute',
        resourceType: 'fixture.compute.instance',
        name: 'local-instance-1',
        tags: { environment: 'sandbox' },
        configuration: { cpu: 2, memoryGb: 4 }
      }
    ];
  }
}

registerCloudDriver('fixture', (options) => new FixtureDriver(options));
```

Point a cloud definition at `driver: "fixture"` to load deterministic data without altering production code paths.

> 🙌 When you call `createCloudDriver('fixture', options)` you no longer have to copy the driver name into `options.driver` yourself—the registry injects it automatically before instantiating your factory or subclass.

---

## 🚨 Error Handling

CloudInventoryPlugin now emits structured `PluginError` responses for common misconfigurations. Each error includes `statusCode`, `retriable`, and an English `suggestion` to help operators recover quickly.

Examples:
- Missing API tokens/keys for SaaS drivers such as Cloudflare, DigitalOcean, Linode, Hetzner, Vultr, and MongoDB Atlas → `statusCode: 400`, `retriable: false`, suggestion points to the relevant credential names or environment variables.
- Azure driver without `subscriptionId` → `statusCode: 400`, suggestion to set `credentials.subscriptionId` or `config.subscriptionId`.
- Attempting to instantiate an unknown driver via `createCloudDriver()` → `statusCode: 400`, suggestion lists registered drivers.
- Custom driver factories that do not return `BaseCloudDriver` → `statusCode: 500`, with guidance to extend the base class.

### Missing Resource Definitions

- **Status**: `404`
- **Message**: `No eventual consistency configured for resource` (when helper APIs are called for unknown clouds)
- **Fix**: Ensure the resource or field is declared under `new CloudInventoryPlugin({ clouds: [...] })` before invoking analytics helpers.

### Invalid Schedule Configuration

- **Status**: `400`
- **Message**: `Cloud "<id>" has an invalid scheduled configuration`
- **Fix**: Supply a valid cron expression when `scheduled.enabled` is `true`. Example: `{ cron: '0 * * * *', timezone: 'UTC' }`.

### Terraform Export Misconfiguration

- **Status**: `400`/`500`
- **Message** examples:
  - `Invalid S3 URL format: s3://...`
  - `Terraform output path not configured`
- **Fix**: Provide `terraform.output` that matches the selected `outputType` (`file`, `s3`, or a custom function). The error’s `suggestion` field contains the exact formatting requirements.

### Missing S3 Client

- **Status**: `500`
- **Message**: `S3 client not available. Database must use S3-compatible storage.`
- **Fix**: Initialize the database with an S3-compatible client before calling `exportToTerraformStateToS3`.

Refer to `error.toJson()` for complete context (command input, bucket/key, retry hints) whenever an operation fails.

---

## Notes

- The plugin ships with minimal defaults; customise resource identifiers via `resourceNames` to align with your naming conventions.
- Drivers are free to interpret `discovery.include` / `discovery.exclude`.
- When `latestDigest` remains unchanged the plugin simply refreshes `lastSeenAt`.
- All locking and checkpointing is handled automatically, but drivers should regularly emit checkpoints to guarantee at-least-once coverage without duplicates.
- Cloud IDs default to `<driver>-<account>` (based on credentials/config hints) when omitted. Duplicate IDs are automatically deduplicated with numeric suffixes and logged.

---

## Next Steps

1. Implement concrete drivers for the clouds you use.
2. Wire the plugin inside your S3DB initialization pipeline.
3. Explore automation (cron jobs, Scheduler plugin, CI pipelines) to keep inventories fresh.
