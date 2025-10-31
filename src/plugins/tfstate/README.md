# TfState Plugin - Internal Development Guide

This document is the internal development guide for the TfState Plugin.

---

## 📋 General Architecture

### Philosophy

The TfState Plugin transforms Terraform states (`.tfstate` files) into queryable data in s3db.

**Principles:**
- ✅ **Simplicity**: Clear and direct API
- ✅ **Performance**: Partitions for fast queries (sync mode)
- ✅ **Flexibility**: Supports local files, S3, glob patterns
- ✅ **Traceability**: Diff tracking between versions
- ✅ **Deduplication**: SHA256 hash to avoid re-imports

---

## 🗄️ The 3 Resources

### 1. State Files Resource (`plg_tfstate_states`)

Stores metadata about each imported `.tfstate`.

**Complete Schema:**
```javascript
{
  id: 'string|required',                    // generated nanoid
  sourceFile: 'string|required',            // 'prod/terraform.tfstate'
  serial: 'number|required',                // State serial
  lineage: 'string',                        // Terraform lineage
  terraformVersion: 'string',               // e.g. '1.5.0'
  resourceCount: 'number',                  // How many resources
  sha256Hash: 'string|required',            // For dedup
  importedAt: 'number|required',            // timestamp
  stateVersion: 'number'                    // 3 or 4
}
```

**Partitions:**
```javascript
{
  bySourceFile: { fields: { sourceFile: 'string' } },
  bySerial: { fields: { serial: 'number' } }
}

asyncPartitions: false  // Sync for immediate queries
```

**Common Queries:**
```javascript
// Fetch latest version of a state
const latest = await stateFilesResource.listPartition({
  partition: 'bySourceFile',
  partitionValues: { sourceFile: 'prod/terraform.tfstate' }
}).then(results => results.sort((a, b) => b.serial - a.serial)[0]);

// Fetch specific serial
const v100 = await stateFilesResource.listPartition({
  partition: 'bySerial',
  partitionValues: { serial: 100 }
});
```

---

### 2. Resources Resource (`plg_tfstate_resources`)

The main resource containing all infrastructure resources extracted from states.

**Complete Schema:**
```javascript
{
  id: 'string|required',                    // generated nanoid
  stateFileId: 'string|required',           // FK to states resource

  // Denormalized for queries
  stateSerial: 'number|required',           // Which version it came from
  sourceFile: 'string|required',            // Which file it came from

  // Resource identity
  resourceType: 'string|required',          // 'aws_instance'
  resourceName: 'string|required',          // 'web_server'
  resourceAddress: 'string|required',       // 'aws_instance.web_server'
  providerName: 'string|required',          // 'aws', 'google', 'azure', etc

  // Resource data
  mode: 'string',                           // 'managed' or 'data'
  attributes: 'json',                       // Complete resource attributes
  dependencies: 'array',                    // Dependency list

  importedAt: 'number|required'             // timestamp
}
```

**Partitions (critical for performance!):**
```javascript
{
  byType: {
    fields: { resourceType: 'string' }
  },
  byProvider: {
    fields: { providerName: 'string' }
  },
  bySerial: {
    fields: { stateSerial: 'number' }
  },
  bySourceFile: {
    fields: { sourceFile: 'string' }
  },
  byProviderAndType: {
    fields: {
      providerName: 'string',
      resourceType: 'string'
    }
  }
}

asyncPartitions: false  // IMPORTANT: Sync for immediate queries!
```

**Provider Detection Logic:**

```javascript
function detectProvider(resourceType) {
  const prefix = resourceType.split('_')[0];

  const providerMap = {
    'aws': 'aws',
    'google': 'google',
    'azurerm': 'azure',
    'azuread': 'azure',
    'kubernetes': 'kubernetes',
    'helm': 'kubernetes',
    'random': 'random',
    'null': 'null',
    'local': 'local',
    'time': 'time',
    'tls': 'tls'
  };

  return providerMap[prefix] || 'unknown';
}
```

**Common Queries:**
```javascript
// Query by type (uses partition - O(1))
const ec2 = await resource.listPartition({
  partition: 'byType',
  partitionValues: { resourceType: 'aws_instance' }
});

// Query by provider (uses partition - O(1))
const awsResources = await resource.listPartition({
  partition: 'byProvider',
  partitionValues: { providerName: 'aws' }
});

// Query by provider + type (combined partition - O(1))
const awsRds = await resource.listPartition({
  partition: 'byProviderAndType',
  partitionValues: {
    providerName: 'aws',
    resourceType: 'aws_db_instance'
  }
});
```

---

### 3. Diffs Resource (`plg_tfstate_diffs`)

Tracks changes between state versions.

**Complete Schema:**
```javascript
{
  id: 'string|required',                    // generated nanoid
  sourceFile: 'string|required',            // Which state
  oldSerial: 'number|required',             // Old version
  newSerial: 'number|required',             // New version

  summary: {
    type: 'object',
    props: {
      addedCount: 'number',                 // How many added
      modifiedCount: 'number',              // How many modified
      deletedCount: 'number'                // How many deleted
    }
  },

  changes: {
    type: 'object',
    props: {
      added: 'array',      // [{ type, name, address, attributes }]
      modified: 'array',   // [{ type, name, address, changes: [...] }]
      deleted: 'array'     // [{ type, name, address, attributes }]
    }
  },

  calculatedAt: 'number|required'           // timestamp
}
```

**Partitions:**
```javascript
{
  bySourceFile: {
    fields: { sourceFile: 'string' }
  },
  byOldSerial: {
    fields: { oldSerial: 'number' }
  },
  byNewSerial: {
    fields: { newSerial: 'number' }
  }
}

asyncPartitions: false  // Sync for immediate queries
```

**Diff Calculation Logic:**

```javascript
async function calculateDiff(oldState, newState) {
  const oldResources = createResourceMap(oldState);
  const newResources = createResourceMap(newState);

  const added = [];
  const deleted = [];
  const modified = [];

  // Detect added
  for (const [address, resource] of Object.entries(newResources)) {
    if (!oldResources[address]) {
      added.push({
        type: resource.type,
        name: resource.name,
        address: resource.address,
        attributes: resource.attributes
      });
    }
  }

  // Detect deleted
  for (const [address, resource] of Object.entries(oldResources)) {
    if (!newResources[address]) {
      deleted.push({
        type: resource.type,
        name: resource.name,
        address: resource.address,
        attributes: resource.attributes
      });
    }
  }

  // Detect modified
  for (const [address, newResource] of Object.entries(newResources)) {
    const oldResource = oldResources[address];
    if (oldResource) {
      const changes = detectChanges(oldResource.attributes, newResource.attributes);
      if (changes.length > 0) {
        modified.push({
          type: newResource.type,
          name: newResource.name,
          address: newResource.address,
          changes: changes
        });
      }
    }
  }

  return {
    summary: {
      addedCount: added.length,
      modifiedCount: modified.length,
      deletedCount: deleted.length
    },
    changes: {
      added,
      modified,
      deleted
    }
  };
}

function detectChanges(oldAttrs, newAttrs, path = '') {
  const changes = [];

  // Compare each field
  const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);

  for (const key of allKeys) {
    const fieldPath = path ? `${path}.${key}` : key;
    const oldValue = oldAttrs[key];
    const newValue = newAttrs[key];

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        field: fieldPath,
        oldValue: oldValue,
        newValue: newValue
      });
    }
  }

  return changes;
}
```

---

## 🔧 Main Methods

### Import Flow

```
importState(filePath)
  ↓
  1. Read file from filesystem
  2. Parse JSON
  3. Calculate SHA256
  4. Check if already exists (dedup)
  5. If new:
     - Create record in stateFilesResource
     - Extract resources
     - Create records in resource
     - If previous version exists:
       - Calculate diff
       - Create record in diffsResource
```

**Code:**
```javascript
async importState(filePath, options = {}) {
  // 1. Read and parse
  const content = await fs.readFile(filePath, 'utf8');
  const state = JSON.parse(content);

  // 2. SHA256
  const sha256Hash = crypto.createHash('sha256').update(content).digest('hex');

  // 3. Check if already exists
  const existing = await this.stateFilesResource.query({ sha256Hash });
  if (existing.length > 0) {
    return { alreadyImported: true, stateFileId: existing[0].id };
  }

  // 4. Create state file record
  const sourceFile = options.sourceFile || path.basename(filePath);
  const stateFileRecord = await this.stateFilesResource.insert({
    sourceFile,
    serial: state.serial,
    lineage: state.lineage,
    terraformVersion: state.terraform_version,
    resourceCount: state.resources?.length || 0,
    sha256Hash,
    importedAt: Date.now(),
    stateVersion: state.version
  });

  // 5. Extract and insert resources
  const extractedResources = await this._extractResources(state, stateFileRecord.id);

  // 6. Calculate diff if previous version exists
  if (this.trackDiffs) {
    await this._maybeCalculateDiff(sourceFile, state.serial);
  }

  return {
    stateFileId: stateFileRecord.id,
    resourcesExtracted: extractedResources.length
  };
}
```

### Resource Extraction

```javascript
async _extractResources(state, stateFileId) {
  const resources = state.resources || [];
  const extracted = [];

  for (const resource of resources) {
    // Apply filters
    if (!this._shouldIncludeResource(resource)) {
      continue;
    }

    // Process each resource instance
    for (const instance of resource.instances || []) {
      const providerName = this._detectProvider(resource.type);

      const record = {
        stateFileId,
        stateSerial: state.serial,
        sourceFile: stateFileRecord.sourceFile,
        resourceType: resource.type,
        resourceName: resource.name,
        resourceAddress: `${resource.type}.${resource.name}`,
        providerName,
        mode: resource.mode || 'managed',
        attributes: instance.attributes || {},
        dependencies: resource.depends_on || [],
        importedAt: Date.now()
      };

      await this.resource.insert(record);
      extracted.push(record);
    }
  }

  return extracted;
}

_shouldIncludeResource(resource) {
  // Filter by type
  if (this.filters?.types && this.filters.types.length > 0) {
    if (!this.filters.types.includes(resource.type)) {
      return false;
    }
  }

  // Filter by provider
  if (this.filters?.providers && this.filters.providers.length > 0) {
    const provider = this._detectProvider(resource.type);
    if (!this.filters.providers.includes(provider)) {
      return false;
    }
  }

  // Exclusion filter
  if (this.filters?.exclude && this.filters.exclude.length > 0) {
    for (const pattern of this.filters.exclude) {
      if (this._matchesPattern(resource.type, pattern)) {
        return false;
      }
    }
  }

  return true;
}

_detectProvider(resourceType) {
  const prefix = resourceType.split('_')[0];

  const providerMap = {
    'aws': 'aws',
    'google': 'google',
    'azurerm': 'azure',
    'azuread': 'azure',
    'kubernetes': 'kubernetes',
    'helm': 'kubernetes',
    'random': 'random',
    'null': 'null',
    'local': 'local',
    'time': 'time',
    'tls': 'tls'
  };

  return providerMap[prefix] || 'unknown';
}
```

### Diff Calculation

```javascript
async _maybeCalculateDiff(sourceFile, newSerial) {
  // Fetch previous version
  const previousStates = await this.stateFilesResource.listPartition({
    partition: 'bySourceFile',
    partitionValues: { sourceFile }
  });

  if (previousStates.length < 2) {
    return; // First version, no diff
  }

  // Sort by serial
  previousStates.sort((a, b) => b.serial - a.serial);

  const newState = previousStates[0];
  const oldState = previousStates[1];

  if (newState.serial === newSerial) {
    // Fetch resources from both versions
    const newResources = await this.resource.listPartition({
      partition: 'bySerial',
      partitionValues: { stateSerial: newState.serial }
    });

    const oldResources = await this.resource.listPartition({
      partition: 'bySerial',
      partitionValues: { stateSerial: oldState.serial }
    });

    // Calculate diff
    const diff = this._calculateDiff(oldResources, newResources);

    // Save diff
    await this.diffsResource.insert({
      sourceFile,
      oldSerial: oldState.serial,
      newSerial: newState.serial,
      summary: diff.summary,
      changes: diff.changes,
      calculatedAt: Date.now()
    });
  }
}
```

---

## 🎯 Query Helpers

Convenient methods that use partitions for fast queries:

```javascript
async getResourcesByType(type) {
  return this.resource.listPartition({
    partition: 'byType',
    partitionValues: { resourceType: type }
  });
}

async getResourcesByProvider(provider) {
  return this.resource.listPartition({
    partition: 'byProvider',
    partitionValues: { providerName: provider }
  });
}

async getResourcesByProviderAndType(provider, type) {
  return this.resource.listPartition({
    partition: 'byProviderAndType',
    partitionValues: {
      providerName: provider,
      resourceType: type
    }
  });
}

async getDiff(sourceFile, oldSerial, newSerial) {
  const diffs = await this.diffsResource.query({
    sourceFile,
    oldSerial,
    newSerial
  });

  return diffs[0] || null;
}

async getLatestDiff(sourceFile) {
  const diffs = await this.diffsResource.listPartition({
    partition: 'bySourceFile',
    partitionValues: { sourceFile }
  });

  if (diffs.length === 0) return null;

  // Sort by calculatedAt desc
  diffs.sort((a, b) => b.calculatedAt - a.calculatedAt);
  return diffs[0];
}

async getAllDiffs(sourceFile) {
  return this.diffsResource.listPartition({
    partition: 'bySourceFile',
    partitionValues: { sourceFile }
  });
}
```

---

## 📊 Statistics

```javascript
async getStats() {
  const states = await this.stateFilesResource.list();
  const resources = await this.resource.list();
  const diffs = await this.diffsResource.list();

  // Group by provider
  const providers = {};
  resources.forEach(r => {
    providers[r.providerName] = (providers[r.providerName] || 0) + 1;
  });

  // Group by type
  const types = {};
  resources.forEach(r => {
    types[r.resourceType] = (types[r.resourceType] || 0) + 1;
  });

  // Latest serial
  const latestSerial = states.length > 0
    ? Math.max(...states.map(s => s.serial))
    : 0;

  return {
    totalStates: states.length,
    totalResources: resources.length,
    totalDiffs: diffs.length,
    latestSerial,
    providers,
    types
  };
}

async getStatsByProvider() {
  const resources = await this.resource.list();

  const stats = {};
  resources.forEach(r => {
    stats[r.providerName] = (stats[r.providerName] || 0) + 1;
  });

  return stats;
}

async getStatsByType() {
  const resources = await this.resource.list();

  const stats = {};
  resources.forEach(r => {
    stats[r.resourceType] = (stats[r.resourceType] || 0) + 1;
  });

  return stats;
}
```

---

## ⚡ Performance Considerations

### 1. Partitions in Sync Mode

**CRITICAL**: All 3 resources use `asyncPartitions: false`.

**Why?**
- Queries need to be immediate after import
- Async partitions create race conditions
- Diff tracking requires immediate data

**Trade-off:**
- Insert is slightly slower (but still fast)
- Queries are O(1) using partitions

### 2. Denormalization

Fields `stateSerial` and `sourceFile` are denormalized in the resources resource to enable fast queries without joins.

### 3. SHA256 Deduplication

Before importing, we always check if SHA256 already exists. This avoids unnecessary re-imports.

### 4. Batch Operations

For glob imports, we process in parallel but with limit:

```javascript
const concurrency = 5;  // Max 5 simultaneous imports
await PromisePool
  .withConcurrency(concurrency)
  .for(files)
  .process(async file => await this.importState(file));
```

---

## 🧪 Testing Strategy

### 1. Unit Tests

Test isolated methods:
- `_detectProvider()` → Correct provider detection
- `_shouldIncludeResource()` → Filters working
- `_calculateDiff()` → Correct diff calculation

### 2. Integration Tests

Test complete flows:
- Import → Verify resources created
- Import 2x → Verify dedup works
- Import v1 + v2 → Verify diff created

### 3. Partition Tests

Test queries using partitions:
- `getResourcesByType()` → Should use partition
- `getResourcesByProvider()` → Should use partition
- `getResourcesByProviderAndType()` → Should use combined partition

### 4. Performance Tests

Verify partitions are fast:
- Import 1000 resources
- Query by type → Should be < 100ms

---

## 🐛 Common Issues

### Issue: Partitions return empty

**Cause**: `asyncPartitions: true` (default)

**Solution**: Always use `asyncPartitions: false` in all 3 resources

### Issue: Diff not being created

**Cause**: `trackDiffs: false` or first version of state

**Solution**: Verify that `trackDiffs: true` and there are at least 2 versions of the state

### Issue: Wrong provider detection

**Cause**: Provider not in `providerMap`

**Solution**: Add provider to map in `_detectProvider()`

---

## 🚀 Future Enhancements

1. **Partial imports**: Import only modified resources
2. **Compression**: Compress `attributes` JSON to save space
3. **Resource relationships**: Map dependencies between resources
4. **Cost estimation**: Integrate with pricing APIs
5. **Compliance checks**: Validate resources against policies

---

## 📚 References

- [Tfstate Format](https://www.terraform.io/internals/json-format)
- [s3db Partitioning Guide](../../docs/partitioning.md)
- [Plugin Development](../../docs/plugins.md)
