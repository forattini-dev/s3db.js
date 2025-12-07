# JSON Recovery

> Self-healing mechanisms for corrupted metadata in s3db.js.

[← Distributed Sequence](distributed-sequence.md) | [Global Coordinator →](global-coordinator.md)

---

## Overview

s3db.js includes self-healing capabilities that automatically detect and repair corrupted JSON metadata. This ensures database resilience even when storage corruption occurs.

## Key Features

- **Automatic JSON repair** - Fixes common syntax errors
- **Metadata validation** - Ensures required fields exist
- **Resource healing** - Repairs invalid resource structures
- **Backup creation** - Preserves corrupted files before repair
- **Event emission** - Notifies when healing occurs

## How It Works

When `database.connect()` reads the `s3db.json` metadata file:

```
┌─────────────────────┐
│  Read s3db.json     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────────┐
│  JSON.parse()       │────►│ Parse OK? Continue      │
└──────────┬──────────┘     └─────────────────────────┘
           │ Parse Error
           ▼
┌─────────────────────┐
│ _attemptJsonRecovery│
│ - Try 5+ fix        │
│   patterns          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│_validateAndHealMeta │
│ - Check structure   │
│ - Fix resources     │
│ - Heal hooks        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ _uploadHealedMeta   │
│ - Save repaired     │
│ - Emit event        │
└─────────────────────┘
```

## JSON Recovery Patterns

`_attemptJsonRecovery()` tries multiple fixes in order:

| Fix | Pattern | Description |
|-----|---------|-------------|
| 1 | Trailing commas | Remove `,}` and `,]` |
| 2 | Missing quotes | Add quotes to unquoted keys |
| 3 | Single quotes | Replace `'` with `"` |
| 4 | Unescaped newlines | Escape `\n` in strings |
| 5 | Truncated JSON | Attempt to close brackets |

```javascript
// Example: Trailing comma fix
// Before: {"name": "test",}
// After:  {"name": "test"}

// Example: Missing quotes
// Before: {name: "test"}
// After:  {"name": "test"}
```

## Metadata Validation

`_validateAndHealMetadata()` ensures the metadata structure is valid:

### Root Level

| Field | Action if Missing/Invalid |
|-------|---------------------------|
| `version` | Set to `"1"` |
| `s3dbVersion` | Set to current s3db version |
| `resources` | Set to `{}` |
| `lastUpdated` | Set to current ISO timestamp |

### Resource Level

For each resource in `resources`:

| Field | Action if Missing/Invalid |
|-------|---------------------------|
| `currentVersion` | Set to `"v1"` |
| `versions` | Set to `{}` |
| `partitions` | Set to `{}` |
| Invalid version ref | Point to first available version |
| No valid versions | Remove resource entirely |
| Invalid attributes | Remove resource entirely |

### Hooks Level

For each resource's hooks:

| Issue | Action |
|-------|--------|
| Non-array hooks | Remove event entry |
| Invalid hook functions | Filter out invalid entries |
| Null/undefined hooks | Replace with empty object |

## Backup Creation

Before any healing, corrupted content is backed up:

```
s3db.json.corrupted.20231115T143022Z.backup
```

The backup contains:
- Original raw content (if readable)
- Timestamp of corruption detection

## Events

When healing occurs, the database emits:

```javascript
db.on('db:metadata-healed', ({ healingLog, metadata }) => {
  console.log('Healing operations:', healingLog);
  // ['JSON parsing failed - attempting recovery',
  //  'JSON recovery successful using fix #1',
  //  'Resource users: added missing currentVersion']
});
```

## Healing Log

Each healing operation is logged:

```javascript
const healingLog = [
  'JSON parsing failed - attempting recovery',
  'JSON recovery successful using fix #1',
  'Converted version from number to string',
  'Resource users: added missing currentVersion',
  'Resource users: fixed invalid versions object',
  'Resource orders: cleaned invalid hooks for event insert'
];
```

## Manual Recovery

If automatic recovery fails, you can manually repair:

```javascript
const db = new Database({
  connectionString: 's3://...',
  // Skip validation to allow reading corrupted state
  skipValidation: true
});

// Read raw metadata
const raw = await db.client.get('s3db.json');
console.log('Raw content:', raw);

// Manually fix and re-upload
const fixed = {
  version: '1',
  s3dbVersion: '15.0.0',
  resources: {},
  lastUpdated: new Date().toISOString()
};

await db.client.put('s3db.json', JSON.stringify(fixed, null, 2));
```

## Best Practices

### Prevention

- **Use transactions** - Wrap multi-step operations
- **Monitor events** - Alert on `db:metadata-healed`
- **Regular backups** - Use the Backup Plugin
- **Validate before deploy** - Test with MemoryClient

### Recovery

- **Check backups first** - Look for `.corrupted.*.backup` files
- **Review healing log** - Understand what was repaired
- **Verify resources** - List resources after healing
- **Test operations** - Ensure CRUD still works

## Logging

Healing operations are logged at different levels:

| Level | Message |
|-------|---------|
| `warn` | Self-healing operations detected |
| `info` | Healed metadata uploaded successfully |
| `error` | Failed to upload healed metadata |

```javascript
// Enable debug logging
const db = new Database({
  connectionString: 's3://...',
  logger: createLogger({ level: 'debug' })
});
```

## Related Features

- [Distributed Lock](distributed-lock.md) - Prevents concurrent corruption
- [Backup Plugin](../../plugins/backup/README.md) - Regular metadata backups
- [Audit Plugin](../../plugins/audit/README.md) - Track all changes

## Error Reference

| Error | Cause | Solution |
|-------|-------|----------|
| "All JSON recovery attempts failed" | Severely corrupted JSON | Restore from backup |
| "Critical error reading s3db.json" | S3 access error | Check permissions |
| "No valid versions found" | Resource completely broken | Re-create resource |
