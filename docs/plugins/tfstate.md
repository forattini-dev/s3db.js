# 🏗️ TfState Plugin - Inventário de Infraestrutura Terraform

## ⚡ TL;DR

**Importe e consulte** seus estados do Terraform/OpenTofu como recursos s3db com **tracking automático de mudanças** e **queries inteligentes por partições**.

```javascript
import { TfStatePlugin } from 's3db.js/plugins';

const plugin = new TfStatePlugin({
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],
    providers: ['aws']  // aws, google, azure, kubernetes
  }
});

await db.usePlugin(plugin);

// Importar state local
await plugin.importState('./terraform.tfstate');

// Importar do S3
await plugin.importStateFromS3('prod/terraform.tfstate');

// Importar múltiplos states (glob)
await plugin.importStatesGlob('./terraform/**/*.tfstate');
await plugin.importStatesFromS3Glob('environments/**/terraform.tfstate');

// Queries inteligentes usando partitions
const ec2Instances = await plugin.getResourcesByType('aws_instance');
const awsResources = await plugin.getResourcesByProvider('aws');
const rdsInstances = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');

// Estatísticas
const stats = await plugin.getStats();
console.log(`Total: ${stats.totalResources} resources`);
console.log(`Providers: ${Object.keys(stats.providers).length}`);

// Tracking de mudanças
const diff = await plugin.getDiff('terraform.tfstate', 1, 2);
console.log(`Added: ${diff.summary.addedCount}`);
console.log(`Modified: ${diff.summary.modifiedCount}`);
console.log(`Deleted: ${diff.summary.deletedCount}`);
```

**Features Principais:**
- ✅ **Import flexível**: Local files, S3, glob patterns
- ✅ **Queries inteligentes**: Partitions por tipo, provider, serial
- ✅ **Diff tracking**: Compare versões e veja mudanças
- ✅ **Inventário completo**: Catálogo de toda infraestrutura
- ✅ **Auditoria**: Histórico de todas as mudanças
- ✅ **Provider detection**: Identifica aws, google, azure, kubernetes
- ✅ **SHA256 deduplication**: Nunca importa o mesmo state 2x
- ✅ **Filtros**: Por tipo de recurso e provider

---

## 📦 O Que Este Plugin Faz?

Você usa **Terraform** ou **OpenTofu** para gerenciar sua infraestrutura. Cada vez que roda `terraform apply`, o Terraform salva o estado atual em um arquivo `.tfstate`.

**O problema**: Esses arquivos são difíceis de consultar. Você não consegue responder facilmente:

- Quantos servidores EC2 estou rodando?
- O que mudou entre ontem e hoje?
- Quais recursos foram deletados na última semana?
- Quantos recursos do Google Cloud tenho?

**A solução**: O TfState Plugin lê esses arquivos `.tfstate` e transforma em **dados consultáveis** dentro do s3db.

---

## 🗄️ Os 3 Resources Criados

Quando você instala este plugin, ele cria automaticamente **3 resources s3db**:

### 1. `plg_tfstate_states` - Metadados dos State Files

Armazena informações sobre cada arquivo `.tfstate` importado.

**Campos principais:**
- `sourceFile` - Caminho ou S3 URI do state (`prod/terraform.tfstate`)
- `serial` - Número serial do state
- `lineage` - Identificador de lineage do Terraform
- `terraformVersion` - Versão do Terraform/OpenTofu
- `resourceCount` - Quantos recursos neste state
- `sha256Hash` - Hash para deduplicação
- `importedAt` - Quando foi importado

**Partitions:**
- `bySourceFile` - Query por arquivo
- `bySerial` - Query por versão

**Example:**
```javascript
// Ver todos os states importados
const states = await plugin.stateFilesResource.list();

// Buscar última versão de um state específico
const latest = await plugin.stateFilesResource.listPartition({
  partition: 'bySourceFile',
  partitionValues: { sourceFile: 'prod/terraform.tfstate' }
});
```

### 2. `plg_tfstate_resources` - Recursos Extraídos

O resource principal contendo **todos os recursos de infraestrutura** (EC2, RDS, S3, etc).

**Campos principais:**
- `resourceType` - Tipo do recurso (`aws_instance`, `aws_s3_bucket`)
- `resourceName` - Nome dado no Terraform
- `resourceAddress` - Endereço completo (`aws_instance.web_server`)
- `providerName` - Provider (`aws`, `google`, `azure`, `kubernetes`)
- `attributes` - Todos os atributos do recurso (JSON)
- `mode` - `managed` ou `data`
- `stateSerial` - De qual versão veio
- `sourceFile` - De qual arquivo veio

**Partitions (sync para queries rápidas):**
- `byType` - Query por tipo de recurso
- `byProvider` - Query por provider
- `bySerial` - Query por versão
- `bySourceFile` - Query por arquivo
- `byProviderAndType` - Query por provider + tipo

**Example:**
```javascript
// Todos os EC2 (usando partition)
const ec2 = await plugin.getResourcesByType('aws_instance');

// Todos os recursos AWS (usando partition)
const aws = await plugin.getResourcesByProvider('aws');

// Todos os RDS da AWS (partition combinada)
const rds = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');

// Query complexa
const prodInstances = await plugin.resource.query({
  resourceType: 'aws_instance',
  'attributes.tags.Environment': 'production'
});
```

### 3. `plg_tfstate_diffs` - Histórico de Mudanças

Rastreia o que mudou entre versões de states (se diff tracking estiver habilitado).

**Campos principais:**
- `sourceFile` - Qual state file
- `oldSerial` / `newSerial` - Quais versões foram comparadas
- `summary` - Estatísticas rápidas
  - `addedCount` - Quantos recursos foram criados
  - `modifiedCount` - Quantos foram modificados
  - `deletedCount` - Quantos foram deletados
- `changes` - Arrays detalhados
  - `added` - Lista de recursos criados
  - `modified` - Lista de recursos modificados (com detalhes dos campos alterados)
  - `deleted` - Lista de recursos deletados
- `calculatedAt` - Quando o diff foi calculado

**Partitions:**
- `bySourceFile` - Diffs de um state específico
- `byOldSerial` / `byNewSerial` - Diffs envolvendo versões específicas

**Example:**
```javascript
// Ver últimas mudanças
const recentDiffs = await plugin.diffsResource.query({}, {
  limit: 10,
  sort: { calculatedAt: -1 }
});

// Ver mudanças de um state específico
const prodDiffs = await plugin.diffsResource.listPartition({
  partition: 'bySourceFile',
  partitionValues: { sourceFile: 'prod/terraform.tfstate' }
});

// Detalhes de um diff
const diff = await plugin.getDiff('terraform.tfstate', 100, 101);
console.log('Recursos adicionados:');
diff.changes.added.forEach(r => {
  console.log(`  + ${r.type}.${r.name}`);
});
```

---

## 🚀 Quick Start

### Instalação Básica

```javascript
import { Database } from 's3db.js';
import { TfStatePlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: process.env.S3DB_CONNECTION
});

await db.connect();

// Configuração simples
const plugin = new TfStatePlugin({
  // Opcional: filtrar por tipos específicos
  filters: {
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],
    providers: ['aws', 'google']
  }
});

await db.usePlugin(plugin);
```

### Importar States

```javascript
// 1. Arquivo local
await plugin.importState('./terraform.tfstate');

// 2. Do S3 (usa database.client)
await plugin.importStateFromS3('prod/terraform.tfstate');

// 3. Múltiplos arquivos locais (glob)
await plugin.importStatesGlob('./terraform/**/*.tfstate');

// 4. Múltiplos do S3 (glob)
await plugin.importStatesFromS3Glob('environments/**/terraform.tfstate');
```

### Consultar Recursos

```javascript
// Por tipo (usa partition - rápido!)
const ec2 = await plugin.getResourcesByType('aws_instance');
const buckets = await plugin.getResourcesByType('aws_s3_bucket');

// Por provider (usa partition - rápido!)
const awsResources = await plugin.getResourcesByProvider('aws');
const gcpResources = await plugin.getResourcesByProvider('google');

// Por provider + tipo (partition combinada - ultra rápido!)
const awsRds = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');
const gcpVMs = await plugin.getResourcesByProviderAndType('google', 'google_compute_instance');

// Query manual
const prodEC2 = await plugin.resource.query({
  resourceType: 'aws_instance',
  'attributes.tags.Environment': 'production'
});
```

### Ver Estatísticas

```javascript
// Overview geral
const stats = await plugin.getStats();
console.log(`Total states: ${stats.totalStates}`);
console.log(`Total resources: ${stats.totalResources}`);
console.log(`Latest serial: ${stats.latestSerial}`);
console.log('Providers:', stats.providers);  // { aws: 150, google: 30 }
console.log('Types:', stats.types);          // { aws_instance: 20, aws_s3_bucket: 50 }

// Por provider
const byProvider = await plugin.getStatsByProvider();
console.log(byProvider);  // { aws: 150, google: 30, azure: 10 }

// Por tipo
const byType = await plugin.getStatsByType();
console.log(byType);  // { aws_instance: 20, aws_s3_bucket: 50, ... }
```

### Tracking de Mudanças

```javascript
// Importar 2 versões
await plugin.importState('./terraform-v1.tfstate');
await plugin.importState('./terraform-v2.tfstate');

// Ver diff entre versões
const diff = await plugin.getDiff('terraform.tfstate', 1, 2);

console.log('Mudanças:');
console.log(`  ✅ ${diff.summary.addedCount} recursos adicionados`);
console.log(`  ✏️  ${diff.summary.modifiedCount} recursos modificados`);
console.log(`  ❌ ${diff.summary.deletedCount} recursos deletados`);

// Detalhes
console.log('\nRecursos adicionados:');
diff.changes.added.forEach(r => {
  console.log(`  + ${r.type}.${r.name}`);
});

console.log('\nRecursos modificados:');
diff.changes.modified.forEach(r => {
  console.log(`  ~ ${r.type}.${r.name}`);
  r.changes.forEach(c => {
    console.log(`      ${c.field}: ${c.oldValue} → ${c.newValue}`);
  });
});

console.log('\nRecursos deletados:');
diff.changes.deleted.forEach(r => {
  console.log(`  - ${r.type}.${r.name}`);
});
```

---

## 📚 Use Cases Reais

### 1. Dashboard de Infraestrutura

```javascript
async function getInfraDashboard() {
  const stats = await plugin.getStats();

  console.log('📊 Infrastructure Overview:');
  console.log(`  Total Resources: ${stats.totalResources}`);
  console.log(`  Latest Version: serial ${stats.latestSerial}`);
  console.log('');

  console.log('By Provider:');
  Object.entries(stats.providers).forEach(([provider, count]) => {
    console.log(`  ${provider}: ${count} resources`);
  });
  console.log('');

  console.log('Top 10 Resource Types:');
  const topTypes = Object.entries(stats.types)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  topTypes.forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
}

// Atualizar a cada 5 minutos
setInterval(getInfraDashboard, 5 * 60 * 1000);
```

### 2. Auditoria e Compliance

```javascript
// Ver todos os recursos criados na última semana
const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

const recentResources = await plugin.resource.query({
  importedAt: { $gte: weekAgo }
});

console.log(`${recentResources.length} recursos criados nos últimos 7 dias:`);
recentResources.forEach(r => {
  console.log(`  ${r.resourceType}.${r.resourceName} (serial ${r.stateSerial})`);
});

// Ver mudanças grandes (>10 recursos)
const bigChanges = await plugin.diffsResource.query({
  $or: [
    { 'summary.addedCount': { $gte: 10 } },
    { 'summary.deletedCount': { $gte: 10 } }
  ]
});

console.log(`\n${bigChanges.length} mudanças grandes detectadas`);
```

### 3. Análise de Custos

```javascript
// Listar todos os recursos "caros"
const expensiveTypes = [
  'aws_db_instance',
  'aws_elasticache_cluster',
  'aws_redshift_cluster',
  'google_compute_instance'
];

for (const type of expensiveTypes) {
  const resources = await plugin.getResourcesByType(type);

  console.log(`\n${type}: ${resources.length} instances`);
  resources.forEach(r => {
    const size = r.attributes.instance_class || r.attributes.machine_type || 'unknown';
    console.log(`  - ${r.resourceName}: ${size}`);
  });
}
```

### 4. Inventário Multi-Provider

```javascript
// Ver recursos de todos os providers
const providers = ['aws', 'google', 'azure', 'kubernetes'];

for (const provider of providers) {
  const resources = await plugin.getResourcesByProvider(provider);

  if (resources.length > 0) {
    console.log(`\n${provider.toUpperCase()}: ${resources.length} resources`);

    // Agrupar por tipo
    const byType = {};
    resources.forEach(r => {
      byType[r.resourceType] = (byType[r.resourceType] || 0) + 1;
    });

    Object.entries(byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
}
```

---

## ⚙️ Configuração Completa

```javascript
const plugin = new TfStatePlugin({
  // === NOMES DOS RESOURCES (opcional) ===
  resourceName: 'terraform_resources',        // Default: plg_tfstate_resources
  stateFilesName: 'terraform_state_files',    // Default: plg_tfstate_states
  diffsName: 'terraform_diffs',               // Default: plg_tfstate_diffs

  // === DIFF TRACKING (opcional) ===
  trackDiffs: true,  // Default: true

  // === FILTROS (opcional) ===
  filters: {
    // Importar apenas estes tipos
    types: ['aws_instance', 'aws_db_instance', 'aws_s3_bucket'],

    // Importar apenas estes providers
    providers: ['aws', 'google'],

    // Excluir data sources
    exclude: ['data.*']
  },

  // === DEBUG ===
  verbose: true  // Default: false - logs detalhados
});
```

---

## 🔌 API Completa

### Métodos de Importação

#### `importState(filePath, options)`
Importa um arquivo `.tfstate` local.

```javascript
await plugin.importState('./terraform.tfstate');
await plugin.importState('./terraform.tfstate', {
  sourceFile: 'custom-name.tfstate'  // Override source file name
});
```

#### `importStateFromS3(key, options)`
Importa um state do S3 (usa o database.client).

```javascript
await plugin.importStateFromS3('prod/terraform.tfstate');
await plugin.importStateFromS3('environments/staging/terraform.tfstate');
```

#### `importStatesGlob(pattern, options)`
Importa múltiplos states locais usando glob pattern.

```javascript
await plugin.importStatesGlob('./terraform/**/*.tfstate');
await plugin.importStatesGlob('./environments/*/terraform.tfstate');
```

#### `importStatesFromS3Glob(pattern, options)`
Importa múltiplos states do S3 usando glob pattern.

```javascript
await plugin.importStatesFromS3Glob('**/terraform.tfstate');
await plugin.importStatesFromS3Glob('environments/*/terraform.tfstate');
```

### Métodos de Query

#### `getResourcesByType(type)`
Busca recursos por tipo usando partition (rápido).

```javascript
const ec2 = await plugin.getResourcesByType('aws_instance');
const buckets = await plugin.getResourcesByType('aws_s3_bucket');
```

#### `getResourcesByProvider(provider)`
Busca recursos por provider usando partition (rápido).

```javascript
const aws = await plugin.getResourcesByProvider('aws');
const gcp = await plugin.getResourcesByProvider('google');
```

#### `getResourcesByProviderAndType(provider, type)`
Busca recursos por provider + tipo usando partition combinada (ultra rápido).

```javascript
const awsRds = await plugin.getResourcesByProviderAndType('aws', 'aws_db_instance');
const gcpVMs = await plugin.getResourcesByProviderAndType('google', 'google_compute_instance');
```

### Métodos de Diff

#### `getDiff(sourceFile, oldSerial, newSerial)`
Compara duas versões específicas de um state.

```javascript
const diff = await plugin.getDiff('terraform.tfstate', 100, 101);
console.log(diff.summary);    // { addedCount, modifiedCount, deletedCount }
console.log(diff.changes);    // { added: [], modified: [], deleted: [] }
```

#### `getLatestDiff(sourceFile)`
Pega o diff mais recente de um state.

```javascript
const latest = await plugin.getLatestDiff('terraform.tfstate');
```

#### `getAllDiffs(sourceFile)`
Pega todos os diffs de um state.

```javascript
const allDiffs = await plugin.getAllDiffs('terraform.tfstate');
```

### Métodos de Estatísticas

#### `getStats()`
Estatísticas gerais de toda a infraestrutura.

```javascript
const stats = await plugin.getStats();
// {
//   totalStates: 5,
//   totalResources: 150,
//   totalDiffs: 20,
//   latestSerial: 45,
//   providers: { aws: 120, google: 30 },
//   types: { aws_instance: 20, aws_s3_bucket: 50, ... }
// }
```

#### `getStatsByProvider()`
Agrupa recursos por provider.

```javascript
const byProvider = await plugin.getStatsByProvider();
// { aws: 120, google: 30, azure: 0 }
```

#### `getStatsByType()`
Agrupa recursos por tipo.

```javascript
const byType = await plugin.getStatsByType();
// { aws_instance: 20, aws_s3_bucket: 50, ... }
```

---

## 🎯 Provider Detection

O plugin detecta automaticamente o provider de cada recurso:

```javascript
// AWS
aws_instance → provider: 'aws'
aws_s3_bucket → provider: 'aws'

// Google Cloud
google_compute_instance → provider: 'google'
google_storage_bucket → provider: 'google'

// Azure
azurerm_virtual_machine → provider: 'azure'
azurerm_storage_account → provider: 'azure'

// Kubernetes
kubernetes_deployment → provider: 'kubernetes'
kubernetes_service → provider: 'kubernetes'

// Outros
random_id → provider: 'random'
null_resource → provider: 'null'
```

---

## ❓ FAQ

### O plugin modifica meus arquivos .tfstate?

**Não!** O plugin apenas **lê** os arquivos. Ele nunca modifica os arquivos `.tfstate` originais.

### Funciona com OpenTofu?

**Sim!** OpenTofu usa o mesmo formato `.tfstate` que o Terraform. O plugin funciona perfeitamente com ambos.

### Posso usar em produção?

**Sim!** O plugin:
- Nunca modifica arquivos originais
- Tem deduplicação SHA256 (não importa o mesmo arquivo 2x)
- Usa partitions para queries rápidas
- É totalmente backward compatible

### Como atualizar os dados?

Você tem que chamar manualmente os métodos de import quando quiser atualizar:

```javascript
// Manual
await plugin.importState('./terraform.tfstate');
await plugin.importStateFromS3('prod/terraform.tfstate');

// Ou criar um cron job/scheduler externo
setInterval(async () => {
  await plugin.importStateFromS3('prod/terraform.tfstate');
}, 5 * 60 * 1000);  // A cada 5 minutos
```

### Quanto espaço consome?

Depende da quantidade de recursos:
- Metadados de states: alguns KB por state
- Recursos extraídos: depende do número de recursos
- Diffs: apenas as mudanças, não duplica dados

A deduplicação SHA256 garante que states idênticos não sejam reimportados.

---

## 📖 Próximos Passos

1. **Ver exemplo completo**: `docs/examples/e48-tfstate-basic.js`
2. **Entender partitions**: `docs/partitioning.md`
3. **Integrar com outros plugins**: Combine com `CachePlugin`, `AuditPlugin`, etc.

---

## ✅ Compatibilidade

- ✅ Terraform (todas as versões)
- ✅ OpenTofu (todas as versões)
- ✅ State versions: v3, v4
- ✅ Backends: local, S3, qualquer lugar acessível
- ✅ Providers: AWS, Google Cloud, Azure, Kubernetes, e outros

---

**💡 Dica**: Comece importando um state local para testar. Depois migre para S3 em produção.
