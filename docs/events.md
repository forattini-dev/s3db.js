# Event System Reference

This document lists all events emitted by s3db.js core and plugins.

## Event Naming Convention

s3db.js uses a consistent naming convention for events:

- **Database events**: `db:*` (e.g., `db:connected`, `db:disconnected`, `db:resource-created`)
- **Plugin events**: `plg:<plugin-name>:*` (e.g., `plg:ml:model-trained`, `plg:eventual-consistency:consolidated`)
- **Plugin lifecycle hooks**: `plugin.*` (e.g., `plugin.beforeInstall`, `plugin.afterStart`) - for internal plugin use
- **Client events**: `cl:*` (e.g., `cl:PutObject`, `cl:GetObject`)

## Core Database Events

### Connection Events

| Event | Description | Payload |
|-------|-------------|---------|
| `db:connected` | Database connection established | `{ connectionString }` |
| `db:disconnected` | Database disconnected | `{}` |
| `connection_error` | Connection error occurred | `Error` |

### Plugin Lifecycle Events

| Event | Description | Payload |
|-------|-------------|---------|
| `db:plugin:installed` | Plugin installed successfully | `{ pluginName }` |
| `db:plugin:initialized` | Plugin initialized | `{ pluginName }` |
| `db:plugin:started` | Plugin started | `{ pluginName }` |
| `db:plugin:stopped` | Plugin stopped | `{ pluginName }` |
| `db:plugin:uninstalled` | Plugin uninstalled | `{ pluginName }` |

### Metadata Events

| Event | Description | Payload |
|-------|-------------|---------|
| `db:metadata-uploaded` | Metadata uploaded to S3 | `{ bucket, key }` |
| `db:metadata-healed` | Metadata healed/repaired | `{ issues, fixed }` |
| `db:resource-definitions-changed` | Resource definitions changed | `{ resources }` |

### Resource Lifecycle Events (Database-level)

These events are emitted by the **Database** when resources are created or modified:

| Event | Description | Payload |
|-------|-------------|---------|
| `db:resource-created` | New resource created | `name` (string) |
| `db:resource-updated` | Resource updated | `name` (string) |

## Resource Instance Events

These events are emitted by **Resource instances** during CRUD operations. Each event has two variants:
- **General event**: Fires for all operations (e.g., `inserted`)
- **ID-specific event**: Fires only for specific record (e.g., `inserted:user-123`)

### CRUD Operations

| Method | General Event | ID-Specific Event | Payload |
|--------|--------------|-------------------|---------|
| `insert()` | `inserted` | `inserted:${id}` | Complete object |
| `get()` | `fetched` | `fetched:${id}` | Complete object |
| `update()` | `updated` | `updated:${id}` | `{ old, new, changes }` |
| `patch()` | `updated` | `updated:${id}` | `{ old, new, changes }` |
| `delete()` | `deleted` | `deleted:${id}` | `{ id, deletedAt }` |

**Note**: `patch()` internally calls `update()`, so it emits `updated` events.

### Bulk Operations

| Method | Event | ID-Specific? | Payload |
|--------|-------|-------------|---------|
| `insertMany()` | `inserted-many` | ❌ | `count` (number) |
| `deleteMany()` | `deleted-many` | ❌ | `count` (number) |
| `deleteAll()` | `deleted-all` | ❌ | `{ count }` |
| `deleteAllData()` | `deleted-all-data` | ❌ | `{ keepMetadata }` |

### Query Operations

| Method | Event | ID-Specific? | Payload |
|--------|-------|-------------|---------|
| `count()` | `count` | ❌ | `count` (number) |
| `list()` | `list` | ❌ | `{ count, errors }` or `{ partition, partitionValues, count, errors }` |
| `listIds()` | `listed-ids` | ❌ | `count` (number) |
| `getMany()` | `fetched-many` | ❌ | `count` (number) |
| `paginate()` | `paginated` | ❌ | Full page result |

### Binary Content Operations

| Method | General Event | ID-Specific Event | Payload |
|--------|--------------|-------------------|---------|
| `setContent()` | `content-set` | `content-set:${id}` | `{ id, contentType, contentLength }` |
| `getContent()` | `content-fetched` | `content-fetched:${id}` | `{ id, contentLength, contentType }` |
| `deleteContent()` | `content-deleted` | `content-deleted:${id}` | `id` |

### Partition Operations

| Method | General Event | ID-Specific Event | Payload |
|--------|--------------|-------------------|---------|
| `getFromPartition()` | `partition-fetched` | `partition-fetched:${id}` | Complete object |

### Error & Warning Events

| Event | Description | Payload |
|-------|-------------|---------|
| `exceedsLimit` | Data exceeds 2KB limit | `{ overflowSize, metadataSize, totalSize, limit, behavior, field }` |
| `partitionIndexError` | Partition indexing error | `{ partition, field, value, error }` |
| `partitionIndexWarning` | Partition warning | `{ message, partition, field }` |
| `orphanedPartitionsRemoved` | Orphaned partitions cleaned up | `{ removed, resource }` |
| `error` | Generic error | `(error, content)` |

### Example Usage

```javascript
// Listen to general events (all records)
usersResource.on('inserted', (user) => {
  console.log('A user was inserted:', user.id);
});

usersResource.on('updated', ({ old, new, changes }) => {
  console.log('User updated:', changes);
});

// Listen to ID-specific events (specific record)
usersResource.on('inserted:user-123', (user) => {
  console.log('User 123 was inserted!', user);
});

usersResource.on('updated:user-123', ({ old, new, changes }) => {
  console.log('User 123 was updated:', changes);
});

// Listen to bulk operations
usersResource.on('inserted-many', (count) => {
  console.log(`${count} users were inserted`);
});

// Listen to errors
usersResource.on('exceedsLimit', ({ field, overflowSize }) => {
  console.warn(`Field ${field} exceeds limit by ${overflowSize} bytes`);
});
```

### Plugin Lifecycle Hooks (Internal Use)

These events are emitted by the base Plugin class and are meant for internal plugin lifecycle management. Plugin developers can listen to these to perform setup/teardown tasks.

| Event | Description | Payload |
|-------|-------------|---------|
| `plugin.beforeInstall` | Before plugin installation | `Date` |
| `plugin.afterInstall` | After plugin installation | `Date` |
| `plugin.beforeStart` | Before plugin starts | `Date` |
| `plugin.afterStart` | After plugin starts | `Date` |
| `plugin.beforeStop` | Before plugin stops | `Date` |
| `plugin.afterStop` | After plugin stops | `Date` |
| `plugin.beforeUninstall` | Before plugin uninstallation | `Date` |
| `plugin.afterUninstall` | After plugin uninstallation | `Date` |
| `plugin.dataPurged` | Plugin data purged | `{ deleted }` |
| `plugin.started` | Plugin started | Various |
| `plugin.stopped` | Plugin stopped | Various |

**Note**: These are for plugin developers, not end users. End users should listen to `db:plugin:*` events instead.

## Plugin Events

### EventualConsistencyPlugin

**Namespace**: `plg:eventual-consistency:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:eventual-consistency:started` | Consolidation/GC started | `{ resource, field, cohort }` |
| `plg:eventual-consistency:stopped` | Consolidation/GC stopped | `{ resource, field }` |
| `plg:eventual-consistency:consolidated` | Consolidation completed | `{ resource, field, recordCount, successCount, errorCount, duration }` |
| `plg:eventual-consistency:consolidation-error` | Consolidation error | `Error` |
| `plg:eventual-consistency:gc-completed` | Garbage collection completed | `{ resource, field, deletedCount, errorCount }` |
| `plg:eventual-consistency:gc-error` | Garbage collection error | `Error` |

### MLPlugin

**Namespace**: `plg:ml:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:ml:model-trained` | Model training completed | `{ modelName, stats }` |
| `plg:ml:prediction` | Prediction made | `{ modelName, input, prediction }` |

### BackupPlugin

**Namespace**: `plg:backup:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:backup:start` | Backup started | `{ timestamp, resources }` |
| `plg:backup:complete` | Backup completed | `{ duration, size, resources }` |
| `plg:backup:error` | Backup error | `Error` |
| `plg:backup:cancelled` | Backup cancelled | `{ reason }` |
| `plg:backup:restore-start` | Restore started | `{ backupId }` |
| `plg:backup:restore-complete` | Restore completed | `{ duration, resources }` |
| `plg:backup:restore-error` | Restore error | `Error` |

### CachePlugin

**Namespace**: `plg:cache:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:cache:clear-error` | Cache clear error | `Error` |

### ReplicatorPlugin

**Namespace**: `plg:replicator:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:replicator:replicated` | Record replicated | `{ resource, recordId, target }` |
| `plg:replicator:error` | Replication error | `Error` |
| `plg:replicator:sync-completed` | Sync completed | `{ duration, count }` |
| `plg:replicator:sync-resource` | Resource sync started | `{ resource }` |
| `plg:replicator:log-error` | Replication log error | `Error` |
| `plg:replicator:log-failed` | Log operation failed | `{ error }` |
| `plg:replicator:update-log-failed` | Log update failed | `{ error }` |
| `plg:replicator:plugin-stop-error` | Plugin stop error | `Error` |
| `plg:replicator:stop-error` | Stop operation error | `Error` |

### S3QueuePlugin

**Namespace**: `plg:s3-queue:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:s3-queue:message-enqueued` | Message added to queue | `{ messageId, queueName }` |
| `plg:s3-queue:message-completed` | Message processed successfully | `{ messageId, duration }` |
| `plg:s3-queue:message-retry` | Message retrying | `{ messageId, attempt }` |
| `plg:s3-queue:message-dead` | Message moved to DLQ | `{ messageId, reason }` |
| `plg:s3-queue:workers-started` | Workers started | `{ workerCount }` |
| `plg:s3-queue:workers-stopped` | Workers stopped | `{}` |

### SchedulerPlugin

**Namespace**: `plg:scheduler:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:scheduler:job-added` | Job added to schedule | `{ jobId, schedule }` |
| `plg:scheduler:job-removed` | Job removed | `{ jobId }` |
| `plg:scheduler:job-enabled` | Job enabled | `{ jobId }` |
| `plg:scheduler:job-disabled` | Job disabled | `{ jobId }` |
| `plg:scheduler:job-start` | Job execution started | `{ jobId, timestamp }` |
| `plg:scheduler:job-complete` | Job execution completed | `{ jobId, duration }` |

### StateMachinePlugin

**Namespace**: `plg:state-machine:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:state-machine:entity-initialized` | Entity state initialized | `{ entityId, state }` |
| `plg:state-machine:transition` | State transition occurred | `{ entityId, from, to, trigger }` |
| `plg:state-machine:trigger-executed` | Trigger executed | `{ entityId, trigger }` |
| `plg:state-machine:action-error` | Action execution error | `{ entityId, action, error }` |
| `plg:state-machine:action-error-non-retriable` | Non-retriable action error | `{ entityId, action, error }` |
| `plg:state-machine:action-retry-attempt` | Action retry attempt | `{ entityId, action, attempt }` |
| `plg:state-machine:action-retry-exhausted` | Action retries exhausted | `{ entityId, action, attempts }` |
| `plg:state-machine:action-retry-success` | Action retry succeeded | `{ entityId, action, attempt }` |

### TTLPlugin

**Namespace**: `plg:ttl:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:ttl:record-expired` | Record expired and deleted | `{ resourceName, recordId }` |
| `plg:ttl:scan-completed` | TTL scan completed | `{ expired, duration }` |
| `plg:ttl:cleanup-error` | Cleanup error | `Error` |

### VectorPlugin

**Namespace**: `plg:vector:*`

| Event | Description | Payload |
|-------|-------------|---------|
| `plg:vector:field-detected` | Vector field detected | `{ resource, field }` |
| `plg:vector:partition-created` | Vector partition created | `{ resource, partition }` |
| `plg:vector:partition-exists` | Partition already exists | `{ resource, partition }` |
| `plg:vector:hooks-installed` | Hooks installed for resource | `{ resource }` |
| `plg:vector:behavior-fixed` | Behavior automatically fixed | `{ resource, field }` |
| `plg:vector:storage-warning` | Storage warning | `{ message }` |

## Client Events

These events are emitted by the S3 client for low-level operations:

| Event | Description | Payload |
|-------|-------------|---------|
| `cl:PutObject` | Object uploaded | `{ bucket, key, size }` |
| `cl:GetObject` | Object retrieved | `{ bucket, key }` |
| `cl:DeleteObject` | Object deleted | `{ bucket, key }` |
| `cl:DeleteObjects` | Multiple objects deleted | `{ bucket, keys }` |
| `cl:HeadObject` | Object metadata retrieved | `{ bucket, key }` |
| `cl:CopyObject` | Object copied | `{ bucket, key, sourceBucket, sourceKey }` |
| `cl:ListObjects` | Objects listed | `{ bucket, prefix, count }` |
| `cl:request` | HTTP request started | `{ method, url }` |
| `cl:response` | HTTP response received | `{ status, duration }` |

## Usage Examples

### Listening to Events

```javascript
// Database events
db.on('db:connected', () => {
  console.log('Database connected');
});

db.on('db:plugin:installed', ({ pluginName }) => {
  console.log(`Plugin ${pluginName} installed`);
});

// Plugin events
plugin.on('plg:eventual-consistency:consolidated', (data) => {
  console.log(`Consolidated ${data.recordCount} records in ${data.duration}ms`);
});

plugin.on('plg:ml:model-trained', ({ modelName, stats }) => {
  console.log(`Model ${modelName} trained with ${stats.samples} samples`);
});
```

### Event-Driven Workflows

```javascript
// Monitor consolidation performance
plugin.on('plg:eventual-consistency:consolidated', (data) => {
  if (data.duration > 5000) {
    console.warn(`Slow consolidation: ${data.duration}ms`);
  }
  if (data.errorCount > 0) {
    console.error(`Consolidation errors: ${data.errorCount}`);
  }
});

// Auto-retry on errors
plugin.on('plg:replicator:error', async (error) => {
  console.error('Replication failed:', error);
  // Implement custom retry logic
});

// Track ML model performance
plugin.on('plg:ml:prediction', ({ modelName, prediction }) => {
  // Log predictions for monitoring
  await metricsDb.insert({
    model: modelName,
    prediction,
    timestamp: new Date()
  });
});
```

## Best Practices

1. **Use namespaced events** to avoid conflicts (`plg:plugin-name:event`)
2. **Include context in payloads** (resource name, IDs, durations, counts)
3. **Emit errors as events** for centralized error handling
4. **Document all events** in plugin documentation
5. **Provide event payload types** in TypeScript definitions
6. **Use past tense for completed actions** (`consolidated`, `started`, `completed`)
7. **Use present tense for ongoing actions** (`consolidation-error`, `prediction`)

## See Also

- [Plugin Development Guide](./plugins/README.md)
- [EventualConsistencyPlugin](./plugins/eventual-consistency.md)
- [MLPlugin](./plugins/ml-plugin.md)
