# Configuration

> **In this guide:** All configuration options, cloud definitions, managed resources, and driver contract.

**Navigation:** [← Back to Cloud Inventory Plugin](/plugins/cloud-inventory/README.md)

---

## Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clouds` | Array | Required | List of cloud definitions |
| `discovery.concurrency` | number | `3` | Parallelism for discovery |
| `discovery.include` | string[] | `[]` | Service/region filters |
| `discovery.exclude` | string[] | `[]` | Service/region exclusions |
| `discovery.runOnInstall` | boolean | `true` | Run `syncAll()` on install |
| `discovery.dryRun` | boolean | `false` | Skip persistence |
| `resourceNames.snapshots` | string | `'plg_cloud_inventory_snapshots'` | Snapshot resource name |
| `resourceNames.versions` | string | `'plg_cloud_inventory_versions'` | Versions resource name |
| `resourceNames.changes` | string | `'plg_cloud_inventory_changes'` | Changes resource name |
| `resourceNames.clouds` | string | `'plg_cloud_inventory_clouds'` | Clouds resource name |
| `logLevel` | boolean | `false` | Emit console logs |
| `emitEvents` | boolean | `false` | Emit discovery events |
| `concurrency` | number | `3` | Max parallel cloud discoveries |

---

## Cloud Definition

Each entry in `clouds[]` accepts:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `driver` | string/class | Yes | Driver name or class |
| `credentials` | object | Yes | Provider-specific credentials |
| `id` | string | No | Unique cloud identifier |
| `config` | object | No | Driver configuration |
| `tags` | object | No | Metadata tags |
| `metadata` | object | No | Additional metadata |
| `scheduled` | object | No | Per-cloud scheduling |

### Scheduling Configuration

```javascript
scheduled: {
  enabled: true,
  cron: '0 */6 * * *',  // Every 6 hours
  timezone: 'UTC',
  runOnStart: true
}
```

---

## Terraform Export Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `terraform.enabled` | boolean | `false` | Enable Terraform export |
| `terraform.autoExport` | boolean | `false` | Export after each discovery |
| `terraform.output` | string/function | Required | Output path or function |
| `terraform.outputType` | string | `'file'` | `'file'`, `'s3'`, or `'custom'` |
| `terraform.filters.providers` | string[] | `[]` | Filter by provider |
| `terraform.filters.resourceTypes` | string[] | `[]` | Filter by type |
| `terraform.filters.cloudId` | string | `null` | Filter by cloud |
| `terraform.terraformVersion` | string | `'1.5.0'` | TF version in state |
| `terraform.serial` | number | `1` | State serial number |

---

## Distributed Lock Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `lock.ttl` | number | `300` | Lock TTL in seconds |
| `lock.timeout` | number | `0` | Wait timeout (0 = no wait) |

---

## Managed Resources

### Snapshots Resource

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `cloudId:resourceType:resourceId` |
| `cloudId` | string | Cloud identifier |
| `driver` | string | Driver name |
| `resourceType` | string | Provider-specific type |
| `resourceId` | string | Stable resource ID |
| `name` | string | Resource name |
| `region` | string | Region/zone |
| `service` | string | Service category |
| `tags` | object | Resource tags |
| `latestDigest` | string | SHA-256 hash |
| `latestVersion` | number | Current version |
| `latestSnapshotId` | string | Version reference |
| `firstSeenAt` | string | Discovery timestamp |
| `lastSeenAt` | string | Last seen timestamp |
| `changelogSize` | number | Change count |

### Versions Resource

Stores frozen configuration documents with:
- `configuration` - Full resource configuration
- Normalized summary
- Raw driver payload for auditing

### Changes Resource

Structured diff with:
- `added` - New fields
- `removed` - Deleted fields
- `updated` - Changed fields with `{ before, after }`

### Cloud Summary Resource

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Cloud identifier |
| `driver` | string | Driver name |
| `status` | string | `idle`, `running`, `error` |
| `lastRunAt` | string | Last execution time |
| `lastSuccessAt` | string | Last success time |
| `lastErrorAt` | string | Last error time |
| `lastRunId` | string | Execution ID |
| `lastResult` | object | Execution summary |
| `totalResources` | number | Resource count |
| `totalVersions` | number | Version count |
| `checkpoint` | object | Resume token |
| `rateLimit` | object | Rate limit metadata |
| `state` | object | Driver state |
| `schedule` | object | Per-cloud schedule |
| `progress` | object | Progress payload |

---

## Driver Contract

Custom drivers must extend `BaseCloudDriver`:

```javascript
class MyCloudDriver extends BaseCloudDriver {
  async initialize() {
    // Build SDK clients, validate credentials
  }

  async listResources(options) {
    // Return array or async iterable
    return [
      {
        provider: 'mycloud',
        accountId: '123456',
        region: 'us-east-1',
        service: 'compute',
        resourceType: 'mycloud.compute.instance',
        resourceId: 'instance-001',
        name: 'app-server',
        tags: { environment: 'prod' },
        configuration: { /* full config */ }
      }
    ];
  }
}
```

### Runtime Helpers

Drivers receive a `runtime` object with:

```javascript
interface RuntimeContext {
  checkpoint: any;             // Previous checkpoint
  state: any;                  // Previous driver state
  emitCheckpoint(value): void; // Persist new checkpoint
  emitRateLimit(value): void;  // Persist rate limit info
  emitState(value): void;      // Persist driver state
  emitProgress(value): void;   // Progress for display
}
```

---

## API Reference

### Plugin Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `syncAll()` | Discover all configured clouds | SyncResult[] |
| `syncCloud(cloudId)` | Discover single cloud | SyncResult |
| `exportToTerraformState(opts?)` | Export to TF state object | `{ state, stats }` |
| `exportToTerraformStateFile(path, opts?)` | Export to file | `{ filePath, state, stats }` |
| `exportToTerraformStateToS3(bucket, key, opts?)` | Export to S3 | `{ bucket, key, state, stats }` |

### SyncResult

```javascript
{
  cloudId: string,
  driver: string,
  created: number,
  updated: number,
  unchanged: number,
  processed: number,
  durationMs: number
}
```

---

## See Also

- [Usage Patterns](/plugins/cloud-inventory/guides/usage-patterns.md) - Cloud driver examples, Terraform export workflows
- [Best Practices](/plugins/cloud-inventory/guides/best-practices.md) - Performance, security, troubleshooting, FAQ
