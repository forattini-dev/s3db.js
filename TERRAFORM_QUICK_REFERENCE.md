# 🚀 Terraform Export - Quick Reference Card

## 📦 Installation (Zero Config)

```javascript
import { CloudInventoryPlugin } from 's3db.js/plugins';

const plugin = new CloudInventoryPlugin({
  clouds: [{ driver: 'aws', credentials: {...} }]
});
```

## 🎯 Manual Export (3 Methods)

### 1. In-Memory
```javascript
const { state, stats } = await plugin.exportToTerraformState();
// state = Terraform state object
// stats = { total, converted, skipped, skippedTypes }
```

### 2. To File
```javascript
await plugin.exportToTerraformStateFile('./terraform.tfstate');
```

### 3. To S3
```javascript
await plugin.exportToTerraformStateToS3('my-bucket', 'terraform/prod.tfstate');
```

## ⚡ Auto-Export (One-Line Setup)

```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [...],
  terraform: {
    enabled: true,
    autoExport: true,
    output: './terraform.tfstate', // or s3://bucket/key
    outputType: 'file' // 'file' | 's3' | 'custom'
  }
});

await plugin.syncAll(); // Auto-exports! 🎉
```

## 🎨 Output Types

### File Output
```javascript
terraform: {
  output: './terraform.tfstate',
  outputType: 'file'
}
```

### S3 Output
```javascript
terraform: {
  output: 's3://my-bucket/terraform/prod.tfstate',
  outputType: 's3'
}
```

### Custom Function
```javascript
terraform: {
  output: async (stateData) => {
    // Your custom logic
    await commitToGit(stateData.state);
    await sendToWebhook(stateData.state);
    console.log('Exported:', stateData.stats);
  },
  outputType: 'custom'
}
```

## 🔍 Filters

### Filter by Provider
```javascript
terraform: {
  filters: {
    providers: ['aws', 'gcp'] // Only AWS and GCP
  }
}
```

### Filter by Resource Type
```javascript
terraform: {
  filters: {
    resourceTypes: ['aws.ec2.instance', 'aws.s3.bucket']
  }
}
```

### Filter by Cloud ID
```javascript
terraform: {
  filters: {
    cloudId: 'aws-production' // Only specific cloud
  }
}
```

## 🎯 Common Use Cases

### Continuous IaC Sync (Hourly)
```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [{
    driver: 'aws',
    scheduled: { enabled: true, cron: '0 * * * *' }
  }],
  terraform: {
    enabled: true,
    autoExport: true,
    output: 's3://terraform-states/current.tfstate',
    outputType: 's3'
  }
});
```

### GitOps (Auto-Commit)
```javascript
terraform: {
  enabled: true,
  autoExport: true,
  output: async (stateData) => {
    await fs.writeFile('./terraform.tfstate', JSON.stringify(stateData.state, null, 2));
    await exec('git add terraform.tfstate && git commit -m "Update" && git push');
  },
  outputType: 'custom'
}
```

### Multi-Environment
```javascript
terraform: {
  enabled: true,
  autoExport: true,
  output: async (stateData) => {
    const env = stateData.filters?.cloudId; // 'prod', 'staging', 'dev'
    await fs.writeFile(`./terraform-${env}.tfstate`, JSON.stringify(stateData.state));
  },
  outputType: 'custom'
}
```

### Disaster Recovery (Multiple Backups)
```javascript
terraform: {
  enabled: true,
  autoExport: true,
  output: async (stateData) => {
    await Promise.all([
      uploadToS3Primary(stateData.state),
      uploadToS3Backup(stateData.state),
      uploadToGCS(stateData.state)
    ]);
  },
  outputType: 'custom'
}
```

## 📊 Supported Providers

| Provider | Resources | Examples |
|----------|-----------|----------|
| AWS | 49 | EC2, S3, RDS, Lambda, VPC, ECS, EKS |
| GCP | 15 | Compute, Storage, SQL, GKE, BigQuery |
| Azure | 14 | VM, Storage, SQL, AKS, VNet |
| DigitalOcean | 11 | Droplets, Kubernetes, Volumes |
| Alibaba Cloud | 16 | ECS, OSS, RDS, ACK, VPC |
| Linode | 8 | Instances, LKE, Volumes |
| Hetzner | 9 | Servers, Volumes, Networks |
| Vultr | 8 | Instances, Kubernetes |
| Oracle Cloud | 11 | Compute, Object Storage, Database |
| Cloudflare | 13 | Workers, R2, Pages, D1, KV |
| MongoDB Atlas | 11 | Clusters, Serverless, Users |

**Total: 170+ resource types**

## 🔧 Configuration Options

```javascript
terraform: {
  enabled: true,              // Enable Terraform integration
  autoExport: true,           // Auto-export after discovery
  output: 'path|url|function', // Output destination
  outputType: 'file|s3|custom', // Output type
  filters: {
    providers: [],            // Filter by provider
    resourceTypes: [],        // Filter by resource type
    cloudId: null             // Filter by cloud ID
  },
  terraformVersion: '1.6.0',  // Terraform version in state
  serial: 1                   // State serial number
}
```

## 🎓 Next Steps

### Use with Terraform
```bash
# 1. Export state
node your-script.js

# 2. Verify state
terraform show -json terraform.tfstate

# 3. Plan changes
terraform plan

# 4. Apply if needed
terraform apply
```

### Import Individual Resources
```bash
# Generated import commands
terraform import aws_instance.resource_i_xxx i-xxx
terraform import aws_s3_bucket.resource_bucket bucket-name
```

## 📚 Documentation

- **Full PR**: `PR_TERRAFORM_EXPORT.md`
- **Quick Summary**: `FEATURE_SUMMARY.md`
- **API Docs**: `docs/plugins/cloud-inventory.md#terraform-export`
- **Manual Example**: `docs/examples/e70-cloud-inventory-terraform-export.js`
- **Auto-Export Example**: `docs/examples/e71-cloud-inventory-terraform-auto-export.js`

## ⚡ Pro Tips

1. **Start Simple**: Use file output first, then migrate to S3
2. **Filter Wisely**: Use `providers` filter to reduce export size
3. **Test First**: Run manual export before enabling auto-export
4. **Monitor Logs**: Export failures are logged, check them regularly
5. **Version Control**: Commit `.tfstate` files to track changes
6. **Backup State**: Use multiple outputs for critical infrastructure
7. **Schedule Wisely**: Hourly for dynamic infra, daily for stable

## 🆘 Troubleshooting

### Export Fails Silently
Check logs - export failures don't break discovery:
```javascript
verbose: true // Enable verbose logging
```

### S3 Upload Fails
Verify S3 client has upload permissions:
```javascript
const s3Client = plugin.database.client;
// Must have putObject permission
```

### Custom Function Errors
Return value for tracking:
```javascript
output: async (stateData) => {
  try {
    await yourLogic(stateData);
    return { success: true };
  } catch (err) {
    console.error('Export failed:', err);
    throw err; // Will be logged
  }
}
```

## 🎯 Copy-Paste Examples

### Minimal Setup
```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [{ driver: 'aws', credentials: {...} }],
  terraform: { enabled: true, autoExport: true, output: './terraform.tfstate' }
});
```

### Production Setup
```javascript
const plugin = new CloudInventoryPlugin({
  clouds: [
    {
      id: 'aws-prod',
      driver: 'aws',
      credentials: {...},
      scheduled: { enabled: true, cron: '0 */6 * * *' } // Every 6 hours
    }
  ],
  terraform: {
    enabled: true,
    autoExport: true,
    output: 's3://terraform-states/production.tfstate',
    outputType: 's3',
    filters: { providers: ['aws'] },
    terraformVersion: '1.6.0'
  },
  verbose: true
});
```

---

**Ready to use!** Copy any example above and customize for your needs. 🚀
