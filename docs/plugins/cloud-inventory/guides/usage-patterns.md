# Usage Patterns

> **In this guide:** Cloud driver configurations, Terraform export workflows, and production patterns.

**Navigation:** [← Back to Cloud Inventory Plugin](/plugins/cloud-inventory/README.md) | [Configuration](/plugins/cloud-inventory/guides/configuration.md)

---

## AWS Driver

**Coverage:** 43+ services, 60+ resource types

```javascript
{
  driver: 'aws',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN  // Optional: for STS
  },
  config: {
    accountId: '123456789012',
    regions: ['us-east-1', 'us-west-2'],
    services: ['ec2', 'vpc', 'rds', 'dynamodb'],  // Optional filter
    rateLimit: 10,
    timeout: 30000,
    retries: 3
  }
}
```

**Supported:** EC2, S3, RDS, Lambda, VPC, EKS, CloudFront, Route53, IAM, KMS, SQS, SNS, EventBridge, CloudWatch, and 30+ more.

---

## GCP Driver

**Coverage:** 20+ services, 25+ resource types

```javascript
{
  driver: 'gcp',
  credentials: {
    // Option 1: Key file
    keyFile: '/path/to/service-account.json',

    // Option 2: Credentials object
    credentials: {
      type: 'service_account',
      project_id: 'my-project',
      private_key_id: '...',
      private_key: '...',
      client_email: 'sa@project.iam.gserviceaccount.com'
    }
  },
  config: {
    projectId: 'my-gcp-project',
    regions: ['us-central1', 'europe-west1'],
    services: ['compute', 'gke', 'storage', 'sql']
  }
}
```

**Supported:** Compute Engine, GKE, Cloud Storage, Cloud SQL, BigQuery, Pub/Sub, Cloud Functions, Cloud Run.

---

## Azure Driver

**Coverage:** 10+ services, 25+ resource types

```javascript
{
  driver: 'azure',
  credentials: {
    subscriptionId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    clientId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    clientSecret: 'your-client-secret',
    tenantId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  },
  config: {
    accountId: 'my-azure-account',
    services: ['compute', 'kubernetes', 'storage'],
    resourceGroups: ['rg-production', 'rg-staging']
  }
}
```

**Supported:** Virtual Machines, AKS, Storage Accounts, SQL Databases, Cosmos DB, VNets, Load Balancers.

---

## DigitalOcean Driver

**Coverage:** 15+ services, 20+ resource types

```javascript
{
  driver: 'digitalocean',  // or 'do'
  credentials: {
    token: process.env.DIGITALOCEAN_TOKEN
  },
  config: {
    accountId: 'my-do-account',
    services: ['droplets', 'kubernetes', 'databases'],
    regions: ['nyc1', 'sfo3']
  }
}
```

**Supported:** Droplets, DOKS, Managed Databases, Volumes, Load Balancers, Firewalls, Spaces, DNS.

---

## Cloudflare Driver

**Coverage:** 11+ services, 15+ resource types

```javascript
{
  driver: 'cloudflare',  // or 'cf'
  credentials: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN
  },
  config: {
    accountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID',
    services: ['workers', 'r2', 'pages', 'd1']
  }
}
```

**Supported:** Workers, R2, Pages, D1, KV, Durable Objects, Zones, DNS, WAF, Access.

---

## MongoDB Atlas Driver

**Coverage:** 11+ services, 15+ resource types

```javascript
{
  driver: 'mongodb-atlas',  // or 'atlas'
  credentials: {
    publicKey: process.env.MONGODB_ATLAS_PUBLIC_KEY,
    privateKey: process.env.MONGODB_ATLAS_PRIVATE_KEY,
    organizationId: 'YOUR_ORG_ID'
  },
  config: {
    projectIds: ['project-1', 'project-2'],  // null = all
    services: ['clusters', 'serverless', 'users', 'backups']
  }
}
```

**Supported:** Clusters, Serverless, Database Users, IP Access Lists, Backups, Alerts, Data Lakes, Search Indexes.

---

## Other Cloud Drivers

### Vultr
```javascript
{ driver: 'vultr', credentials: { apiKey: '...' }, config: { accountId: '...' } }
```

### Linode
```javascript
{ driver: 'linode', credentials: { token: '...' }, config: { accountId: '...' } }
```

### Hetzner
```javascript
{ driver: 'hetzner', credentials: { token: '...' }, config: { accountId: '...' } }
```

### Alibaba Cloud
```javascript
{ driver: 'alibaba', credentials: { accessKeyId: '...', accessKeySecret: '...' }, config: { regions: ['cn-hangzhou'] } }
```

### Oracle Cloud
```javascript
{ driver: 'oracle', credentials: { tenancy: '...', user: '...', fingerprint: '...', privateKey: '...' }, config: { compartmentId: '...' } }
```

---

## Terraform Export Workflows

### Basic Export

```javascript
// 1. Discover resources
await plugin.syncAll();

// 2. Export to memory
const result = await plugin.exportToTerraformState();
console.log(result.stats);  // { total, converted, skipped }

// 3. Export to file
await plugin.exportToTerraformStateFile('./terraform.tfstate');

// 4. Export to S3
await plugin.exportToTerraformStateToS3('my-bucket', 'terraform/state.tfstate');
```

### Filtered Export

```javascript
// Export only AWS EC2 and S3
const aws = await plugin.exportToTerraformState({
  providers: ['aws'],
  resourceTypes: ['aws.ec2.instance', 'aws.s3.bucket']
});

// Export specific cloud
const prod = await plugin.exportToTerraformState({
  cloudId: 'aws-production'
});
```

### Auto-Export Configuration

```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [...],
  terraform: {
    enabled: true,
    autoExport: true,
    output: './terraform-discovered.tfstate',
    outputType: 'file',
    filters: {
      providers: ['aws', 'gcp']
    }
  }
});

// Auto-exports after every discovery
await plugin.syncAll();
```

### Export Output Types

```javascript
// 1. File output
terraform: { outputType: 'file', output: './terraform.tfstate' }

// 2. S3 output
terraform: { outputType: 's3', output: 's3://bucket/path/terraform.tfstate' }

// 3. Custom function
terraform: {
  outputType: 'custom',
  output: async (stateData) => {
    await sendToWebhook(stateData);
    return { custom: true };
  }
}
```

---

## Multi-Cloud Discovery

```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [
    { driver: 'aws', credentials: {...}, config: { accountId: 'aws-prod' } },
    { driver: 'gcp', credentials: {...}, config: { projectId: 'gcp-prod' } },
    { driver: 'azure', credentials: {...}, config: { subscriptionId: '...' } }
  ],
  concurrency: 3  // Discover 3 clouds in parallel
});

// Discover all clouds
const results = await plugin.syncAll();
results.forEach(r => console.log(`${r.cloudId}: ${r.processed} resources`));

// Discover single cloud
const awsResult = await plugin.syncCloud('aws-prod');
```

---

## Scheduled Discovery

### Global Schedule

```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [...],
  scheduled: {
    enabled: true,
    cron: '0 0 * * *',  // Daily at midnight
    timezone: 'UTC',
    runOnStart: true
  }
});
```

### Per-Cloud Schedule

```javascript
clouds: [
  {
    driver: 'aws',
    credentials: {...},
    scheduled: {
      enabled: true,
      cron: '0 */1 * * *',  // Hourly for critical cloud
      timezone: 'UTC'
    }
  },
  {
    driver: 'gcp',
    credentials: {...},
    scheduled: {
      enabled: true,
      cron: '0 */6 * * *',  // Every 6 hours
      timezone: 'UTC'
    }
  }
]
```

---

## Event Monitoring

```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [...],
  emitEvents: true
});

// Discovery progress
db.on('plg:cloud-inventory:discovery:progress', ({ cloud, service, current, total }) => {
  console.log(`${cloud}/${service}: ${current}/${total}`);
});

// Discovery complete
db.on('plg:cloud-inventory:discovery:complete', ({ cloud, duration, resources }) => {
  console.log(`${cloud}: ${resources} resources in ${duration}ms`);
});

// Errors
db.on('plg:cloud-inventory:error', ({ error, cloud, service }) => {
  console.error(`Error in ${cloud}/${service}:`, error);
});

// Drift detected
db.on('plg:cloud-inventory:change', ({ resource, changes }) => {
  console.log(`Drift detected in ${resource.id}:`, changes);
});
```

---

## Custom Driver Registration

```javascript
import { registerCloudDriver, BaseCloudDriver } from 's3db.js/plugins/cloud-inventory';

class FixtureDriver extends BaseCloudDriver {
  async listResources() {
    return [
      {
        provider: 'fixture',
        resourceId: 'instance-1',
        resourceType: 'fixture.compute.instance',
        name: 'test-instance',
        tags: { env: 'test' },
        configuration: { cpu: 2, memory: 4 }
      }
    ];
  }
}

registerCloudDriver('fixture', (opts) => new FixtureDriver(opts));

// Use in plugin
const plugin = new CloudInventoryPlugin({
  clouds: [{ driver: 'fixture', credentials: {}, config: {} }]
});
```

---

## See Also

- [Configuration](/plugins/cloud-inventory/guides/configuration.md) - All options and API reference
- [Best Practices](/plugins/cloud-inventory/guides/best-practices.md) - Performance, security, troubleshooting, FAQ
