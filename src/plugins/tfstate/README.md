# TfState Plugin - Internal Development Guide

Este documento é o guia interno de desenvolvimento do TfState Plugin.

---

## 📋 Arquitetura Geral

### Filosofia

O TfState Plugin transforma states do Terraform (arquivos `.tfstate`) em dados consultáveis no s3db.

**Princípios:**
- ✅ **Simplicidade**: API clara e direta
- ✅ **Performance**: Partitions para queries rápidas (sync mode)
- ✅ **Flexibilidade**: Suporta local files, S3, glob patterns
- ✅ **Rastreabilidade**: Diff tracking entre versões
- ✅ **Deduplicação**: SHA256 hash para evitar re-imports

---

## 🗄️ Os 3 Resources

### 1. State Files Resource (`plg_tfstate_states`)

Armazena metadados sobre cada `.tfstate` importado.

**Schema Completo:**
```javascript
{
  id: 'string|required',                    // nanoid gerado
  sourceFile: 'string|required',            // 'prod/terraform.tfstate'
  serial: 'number|required',                // Serial do state
  lineage: 'string',                        // Terraform lineage
  terraformVersion: 'string',               // e.g. '1.5.0'
  resourceCount: 'number',                  // Quantos recursos
  sha256Hash: 'string|required',            // Para dedup
  importedAt: 'number|required',            // timestamp
  stateVersion: 'number'                    // 3 ou 4
}
```

**Partitions:**
```javascript
{
  bySourceFile: { fields: { sourceFile: 'string' } },
  bySerial: { fields: { serial: 'number' } }
}

asyncPartitions: false  // Sync para queries imediatas
```

**Queries Comuns:**
```javascript
// Buscar última versão de um state
const latest = await stateFilesResource.listPartition({
  partition: 'bySourceFile',
  partitionValues: { sourceFile: 'prod/terraform.tfstate' }
}).then(results => results.sort((a, b) => b.serial - a.serial)[0]);

// Buscar serial específico
const v100 = await stateFilesResource.listPartition({
  partition: 'bySerial',
  partitionValues: { serial: 100 }
});
```

---

### 2. Resources Resource (`plg_tfstate_resources`)

O resource principal contendo todos os recursos de infraestrutura extraídos dos states.

**Schema Completo:**
```javascript
{
  id: 'string|required',                    // nanoid gerado
  stateFileId: 'string|required',           // FK para states resource

  // Denormalized para queries
  stateSerial: 'number|required',           // De qual versão veio
  sourceFile: 'string|required',            // De qual arquivo veio

  // Identidade do recurso
  resourceType: 'string|required',          // 'aws_instance'
  resourceName: 'string|required',          // 'web_server'
  resourceAddress: 'string|required',       // 'aws_instance.web_server'
  providerName: 'string|required',          // 'aws', 'google', 'azure', etc

  // Dados do recurso
  mode: 'string',                           // 'managed' ou 'data'
  attributes: 'json',                       // Atributos completos do recurso
  dependencies: 'array',                    // Lista de dependências

  importedAt: 'number|required'             // timestamp
}
```

**Partitions (crítico para performance!):**
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

asyncPartitions: false  // IMPORTANTE: Sync para queries imediatas!
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

**Queries Comuns:**
```javascript
// Query por tipo (usa partition - O(1))
const ec2 = await resource.listPartition({
  partition: 'byType',
  partitionValues: { resourceType: 'aws_instance' }
});

// Query por provider (usa partition - O(1))
const awsResources = await resource.listPartition({
  partition: 'byProvider',
  partitionValues: { providerName: 'aws' }
});

// Query por provider + tipo (partition combinada - O(1))
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

Rastreia mudanças entre versões de states.

**Schema Completo:**
```javascript
{
  id: 'string|required',                    // nanoid gerado
  sourceFile: 'string|required',            // Qual state
  oldSerial: 'number|required',             // Versão antiga
  newSerial: 'number|required',             // Versão nova

  summary: {
    type: 'object',
    props: {
      addedCount: 'number',                 // Quantos adicionados
      modifiedCount: 'number',              // Quantos modificados
      deletedCount: 'number'                // Quantos deletados
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

asyncPartitions: false  // Sync para queries imediatas
```

**Diff Calculation Logic:**

```javascript
async function calculateDiff(oldState, newState) {
  const oldResources = createResourceMap(oldState);
  const newResources = createResourceMap(newState);

  const added = [];
  const deleted = [];
  const modified = [];

  // Detectar adicionados
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

  // Detectar deletados
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

  // Detectar modificados
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

  // Comparar cada campo
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

## 🔧 Métodos Principais

### Import Flow

```
importState(filePath)
  ↓
  1. Ler arquivo do filesystem
  2. Parsear JSON
  3. Calcular SHA256
  4. Verificar se já existe (dedup)
  5. Se novo:
     - Criar record em stateFilesResource
     - Extrair recursos
     - Criar records em resource
     - Se tem versão anterior:
       - Calcular diff
       - Criar record em diffsResource
```

**Código:**
```javascript
async importState(filePath, options = {}) {
  // 1. Ler e parsear
  const content = await fs.readFile(filePath, 'utf8');
  const state = JSON.parse(content);

  // 2. SHA256
  const sha256Hash = crypto.createHash('sha256').update(content).digest('hex');

  // 3. Verificar se já existe
  const existing = await this.stateFilesResource.query({ sha256Hash });
  if (existing.length > 0) {
    return { alreadyImported: true, stateFileId: existing[0].id };
  }

  // 4. Criar state file record
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

  // 5. Extrair e inserir recursos
  const extractedResources = await this._extractResources(state, stateFileRecord.id);

  // 6. Calcular diff se houver versão anterior
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
    // Aplicar filtros
    if (!this._shouldIncludeResource(resource)) {
      continue;
    }

    // Processar cada instance do recurso
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
  // Filtro por tipo
  if (this.filters?.types && this.filters.types.length > 0) {
    if (!this.filters.types.includes(resource.type)) {
      return false;
    }
  }

  // Filtro por provider
  if (this.filters?.providers && this.filters.providers.length > 0) {
    const provider = this._detectProvider(resource.type);
    if (!this.filters.providers.includes(provider)) {
      return false;
    }
  }

  // Filtro de exclusão
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
  // Buscar versão anterior
  const previousStates = await this.stateFilesResource.listPartition({
    partition: 'bySourceFile',
    partitionValues: { sourceFile }
  });

  if (previousStates.length < 2) {
    return; // Primeira versão, sem diff
  }

  // Ordenar por serial
  previousStates.sort((a, b) => b.serial - a.serial);

  const newState = previousStates[0];
  const oldState = previousStates[1];

  if (newState.serial === newSerial) {
    // Buscar recursos de ambas as versões
    const newResources = await this.resource.listPartition({
      partition: 'bySerial',
      partitionValues: { stateSerial: newState.serial }
    });

    const oldResources = await this.resource.listPartition({
      partition: 'bySerial',
      partitionValues: { stateSerial: oldState.serial }
    });

    // Calcular diff
    const diff = this._calculateDiff(oldResources, newResources);

    // Salvar diff
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

Métodos convenientes que usam partitions para queries rápidas:

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

  // Ordenar por calculatedAt desc
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

### 1. Partitions em Sync Mode

**CRÍTICO**: Todas as 3 resources usam `asyncPartitions: false`.

**Por quê?**
- Queries precisam ser imediatas após o import
- Partitions async criam race conditions
- Diff tracking requer dados imediatos

**Trade-off:**
- Insert é um pouco mais lento (mas ainda rápido)
- Queries são O(1) usando partitions

### 2. Denormalização

Os campos `stateSerial` e `sourceFile` são denormalizados no resources resource para permitir queries rápidas sem joins.

### 3. SHA256 Deduplication

Antes de importar, sempre verificamos se o SHA256 já existe. Isso evita re-imports desnecessários.

### 4. Batch Operations

Para glob imports, processamos em paralelo mas com limite:

```javascript
const concurrency = 5;  // Max 5 imports simultâneos
await PromisePool
  .withConcurrency(concurrency)
  .for(files)
  .process(async file => await this.importState(file));
```

---

## 🧪 Testing Strategy

### 1. Unit Tests

Testar métodos isolados:
- `_detectProvider()` → Detecção correta de providers
- `_shouldIncludeResource()` → Filtros funcionando
- `_calculateDiff()` → Diff calculation correto

### 2. Integration Tests

Testar fluxos completos:
- Import → Verificar resources criados
- Import 2x → Verificar dedup funciona
- Import v1 + v2 → Verificar diff criado

### 3. Partition Tests

Testar queries usando partitions:
- `getResourcesByType()` → Deve usar partition
- `getResourcesByProvider()` → Deve usar partition
- `getResourcesByProviderAndType()` → Deve usar partition combinada

### 4. Performance Tests

Verificar que partitions são rápidas:
- Import 1000 resources
- Query por tipo → Deve ser < 100ms

---

## 🐛 Common Issues

### Issue: Partitions retornam vazio

**Causa**: `asyncPartitions: true` (default)

**Solução**: Sempre usar `asyncPartitions: false` nos 3 resources

### Issue: Diff não está sendo criado

**Causa**: `trackDiffs: false` ou primeira versão do state

**Solução**: Verificar que `trackDiffs: true` e que há pelo menos 2 versões do state

### Issue: Provider detection errado

**Causa**: Provider não está no `providerMap`

**Solução**: Adicionar provider ao map em `_detectProvider()`

---

## 🚀 Future Enhancements

1. **Partial imports**: Importar apenas recursos modificados
2. **Compression**: Comprimir `attributes` JSON para economizar espaço
3. **Resource relationships**: Mapear dependências entre recursos
4. **Cost estimation**: Integrar com pricing APIs
5. **Compliance checks**: Validar recursos contra políticas

---

## 📚 References

- [Tfstate Format](https://www.terraform.io/internals/json-format)
- [s3db Partitioning Guide](../../docs/partitioning.md)
- [Plugin Development](../../docs/plugins.md)
