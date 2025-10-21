# BackupPlugin Documentation Fixes

## Issues Found

### 1. Multi Driver Configuration

**❌ Incorrect (in docs):**
```javascript
const plugin = new BackupPlugin({
  driver: 'multi',
  config: {
    strategy: 'all',
    destinations: [  // WRONG KEY
      { driver: 'filesystem', config: { ... } }
    ]
  }
});
```

**✅ Correct:**
```javascript
const plugin = new BackupPlugin({
  driver: 'multi',
  config: {
    strategy: 'all',
    drivers: [  // CORRECT KEY
      { driver: 'filesystem', config: { ... } }
    ]
  }
});
```

**Locations to fix:**
- Line 181-208
- Line 235-241
- Any other multi driver examples

---

### 2. S3 Driver bucketName vs bucket

**❌ Incorrect (in docs):**
```javascript
const plugin = new BackupPlugin({
  driver: 's3',
  config: {
    bucketName: 'my-backups',  // WRONG KEY
    region: 'us-west-2'
  }
});
```

**✅ Correct:**
```javascript
const plugin = new BackupPlugin({
  driver: 's3',
  config: {
    bucket: 'my-backups',  // CORRECT KEY
    region: 'us-west-2'
  }
});
```

**Locations to fix:**
- Line 155 (`bucketName: 'my-backups'`)
- Line 192 (`bucketName: 'backups-us-east-1'`)
- Line 202 (`bucketName: 'backups-eu-west-1'`)
- Line 239-240 (two instances)
- Any S3 examples throughout the doc

---

### 3. Plugin API Changes

**Check these match code:**
- `plugin.backup(type, options)` signature
- `plugin.restore(backupId, options)` signature
- `plugin.list()` return format
- Metadata structure in s3db.json

---

## Files to Update

1. `docs/plugins/backup.md` - Main documentation
2. `docs/examples/` - Any backup examples
3. `CLAUDE.md` - If it has backup plugin references

---

## Verification Steps

After fixes:
1. Run all backup tests: `pnpm test tests/plugins/plugin-backup.test.js`
2. Test each code example manually
3. Verify s3db.json format matches docs
4. Check BACKUP_VS_REPLICATOR.md is consistent

---

## Additional Improvements Needed

1. Update streaming exporter documentation to match new `StreamingExporter` class
2. Clarify that compression is built-in (gzip) for JSONL files
3. Update output format to show JSONL.gz instead of just .jsonl
4. Add note about `tempDir` configuration option
5. Document hooks: `onBackupStart`, `onBackupComplete`, `onBackupError`
