# Best Practices & FAQ

> **In this guide:** Performance optimization, security, error handling, troubleshooting, and FAQ.

**Navigation:** [← Back to Cloud Inventory Plugin](/plugins/cloud-inventory/README.md) | [Configuration](/plugins/cloud-inventory/guides/configuration.md)

---

## Best Practices

### 1. Install Only Required SDKs

```bash
# Only install SDKs for providers you use
pnpm install @aws-sdk/client-ec2 @aws-sdk/client-s3  # AWS only
pnpm install @google-cloud/compute                    # GCP only
```

### 2. Use IAM Roles (Not Hardcoded Credentials)

```javascript
// AWS: Use environment variables or IAM role
credentials: {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN  // STS
}

// GCP: Use Application Default Credentials
credentials: {}  // ADC auto-detected

// Azure: Use DefaultAzureCredential
credentials: { subscriptionId: '...' }  // MSI/CLI auto-detected
```

### 3. Enable Rate Limiting

```javascript
config: {
  rateLimit: 10,    // 10 requests/second per service
  timeout: 30000,   // 30s timeout per API call
  retries: 3        // Retry failed calls
}
```

### 4. Filter by Services and Regions

```javascript
config: {
  services: ['ec2', 's3', 'rds'],  // Only needed services
  regions: ['us-east-1', 'us-west-2']  // Only active regions
}
```

### 5. Schedule Discovery Off-Peak

```javascript
scheduled: {
  enabled: true,
  cron: '0 3 * * *',  // 3 AM daily
  timezone: 'America/New_York'
}
```

### 6. Monitor Discovery Performance

```javascript
db.on('plg:cloud-inventory:discovery:complete', ({ cloud, duration, resources }) => {
  metrics.histogram('discovery.duration', duration, { cloud });
  metrics.gauge('discovery.resources', resources, { cloud });
});
```

### 7. Use Least Privilege Permissions

AWS example (read-only):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:Describe*",
      "s3:ListAllMyBuckets",
      "s3:GetBucketLocation",
      "rds:Describe*"
    ],
    "Resource": "*"
  }]
}
```

---

## Error Handling

### Error Classes

```javascript
import { PluginError } from 's3db.js';

try {
  await plugin.syncAll();
} catch (error) {
  if (error.name === 'PluginError') {
    console.log('Status:', error.statusCode);
    console.log('Retriable:', error.retriable);
    console.log('Suggestion:', error.suggestion);
  }
}
```

### Common Errors

| Error | Status | Cause | Fix |
|-------|--------|-------|-----|
| Missing credentials | 400 | No API token | Set environment variables |
| Invalid schedule | 400 | Bad cron expression | Fix cron syntax |
| Unknown driver | 400 | Driver not registered | Register driver first |
| S3 client unavailable | 500 | No S3 backend | Use S3-compatible storage |
| Rate limited | 429 | Too many requests | Reduce `rateLimit` |

### Error Handling Pattern

```javascript
db.on('plg:cloud-inventory:error', async ({ error, cloud, service }) => {
  if (error.retriable) {
    // Schedule retry
    await scheduleRetry(cloud, service);
  } else {
    // Alert and skip
    await alertOps(`Discovery failed: ${cloud}/${service}`, error);
  }
});
```

---

## Performance Optimization

### Discovery Speed by Scale

| Resources | Provider | Duration | Notes |
|-----------|----------|----------|-------|
| 100 | AWS | ~5-10s | EC2 + S3 + RDS |
| 1,000 | AWS | ~30-60s | Multi-service |
| 10,000 | AWS | ~5-10min | Full account |
| 100 | GCP | ~3-8s | Compute + Storage |
| 1,000 | DigitalOcean | ~15-30s | All services |

### Optimization Strategies

1. **Filter services**: Only discover what you need
2. **Increase concurrency**: Parallel API calls
3. **Reduce regions**: Focus on active regions
4. **Schedule off-peak**: Lower API costs

```javascript
config: {
  services: ['ec2', 's3'],  // Skip unused services
  regions: ['us-east-1'],   // Skip unused regions
  concurrency: 10           // Parallel API calls
}
```

### Memory Footprint

| Scale | RAM Usage |
|-------|-----------|
| < 1K resources | ~50-100MB |
| 1K-10K resources | ~100-300MB |
| 10K-100K resources | ~300-500MB |

---

## FAQ

### General

**Q: What clouds are supported?**
A: 11 providers with 200+ resource types:
- AWS (43+ services), GCP (20+), Azure (10+)
- Alibaba Cloud (15+), Oracle Cloud (10+)
- DigitalOcean (15+), Linode (12+), Hetzner (12+), Vultr (12+)
- Cloudflare (11+), MongoDB Atlas (11+)

**Q: Do I need all provider SDKs?**
A: No. Install only SDKs for providers you use. Plugin uses lazy loading.

**Q: How does drift detection work?**
A: Plugin stores immutable configuration snapshots. Each discovery compares current state with latest snapshot, generating structured diffs for any changes.

**Q: How often should I run discovery?**
A: Depends on use case:
- Asset management: Every 6-24 hours
- Drift detection: Every 1-6 hours
- Security compliance: Every 15-60 minutes
- Cost optimization: Daily

### Terraform Export

**Q: Can I import existing infrastructure into Terraform?**
A: Yes! Export to `.tfstate`, then run `terraform plan` to detect existing resources.

**Q: Which resources support Terraform export?**
A: 170+ resource types across all 11 providers (EC2, S3, GKE, AKS, etc.).

**Q: Can I export only specific resources?**
A: Yes, filter by cloud, provider, resource type, or tags.

### Security

**Q: How should I store credentials?**
A: Best practices:
1. Use environment variables
2. Use IAM roles on cloud
3. Use secret management (Vault, Secrets Manager)
4. Rotate regularly
5. Use least privilege permissions

**Q: Can I use SSO/SAML?**
A: Yes. Use temporary credentials from STS assume-role.

### Troubleshooting

**Q: Discovery is slow - how to speed up?**
A:
1. Filter by services and regions
2. Increase concurrency
3. Schedule off-peak

**Q: Getting rate limit errors?**
A: Reduce `rateLimit` and increase `retryDelay`:
```javascript
config: { rateLimit: 5, retries: 5, retryDelay: 2000 }
```

**Q: How do I debug discovery issues?**
A: Enable events and verbose logging:
```javascript
emitEvents: true,
verboseEvents: true

db.on('plg:cloud-inventory:error', ({ error, cloud, service }) => {
  console.error(`Error in ${cloud}/${service}:`, error);
});
```

### Multi-Cloud

**Q: Can I discover multiple AWS accounts?**
A: Yes, create separate cloud configurations for each account.

**Q: Can I discover multiple Azure subscriptions?**
A: Yes, create separate cloud configurations for each subscription.

**Q: How do I run parallel discovery?**
A: Set `concurrency` at plugin level:
```javascript
new CloudInventoryPlugin({ clouds: [...], concurrency: 5 })
```

---

## See Also

- [Configuration](/plugins/cloud-inventory/guides/configuration.md) - All options and API reference
- [Usage Patterns](/plugins/cloud-inventory/guides/usage-patterns.md) - Cloud drivers, Terraform export
