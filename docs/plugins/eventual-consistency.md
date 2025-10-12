# EventualConsistencyPlugin

## ⚡ TLDR

Plugin para campos numéricos com **transações auditáveis** e **analytics pré-calculados** por hora/dia/semana/mês.

**3 linhas para começar:**
```javascript
await db.usePlugin(new EventualConsistencyPlugin({ resources: { wallets: ['balance'] } }));
await wallets.insert({ id: 'w1', balance: 0 });
await wallets.add('w1', 'balance', 100);  // Cria transação e consolida automaticamente
```

**Principais features:**
- ✅ Transações atômicas (add/sub/set) com histórico completo
- ✅ Modo sync (imediato) ou async (eventual) com auto-consolidação
- ✅ Analytics pré-calculados (hour → day → **week** → month)
- ✅ Partições otimizadas (query O(1) por originalId + applied status)
- ✅ 85.8% de cobertura de testes + arquitetura modular (11 módulos)

**Quando usar:**
- 💰 Saldos/carteiras (modo sync)
- 📊 Contadores/métricas (modo async)
- 📈 Dashboards com analytics pré-calculados

> **v11.0.2+**: Suporte para agregações semanais (ISO 8601) adicionado! 🎉

---

## Quick Start

```javascript
import { S3db, EventualConsistencyPlugin } from 's3db.js';

const db = new S3db({ connectionString: '...' });
await db.connect();

// Configurar plugin
await db.usePlugin(new EventualConsistencyPlugin({
  resources: {
    wallets: ['balance'],
    users: ['points', 'credits']
  },

  consolidation: {
    mode: 'sync',  // ou 'async'
    auto: true
  }
}));

// Criar resource
const wallets = await db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

// Usar
await wallets.insert({ id: 'wallet-1', balance: 0 });
await wallets.add('wallet-1', 'balance', 100);
await wallets.sub('wallet-1', 'balance', 50);

const wallet = await wallets.get('wallet-1');
console.log(wallet.balance); // 50 ✅
```

---

## Como Funciona

### 1. Transações
Toda operação cria uma transação em `plg_{resource}_tx_{field}`:

```javascript
await wallets.add('wallet-1', 'balance', 100);
// Cria: { operation: 'add', value: 100, applied: false }
```

### 2. Consolidação
Aplica transações pendentes e **atualiza o campo original**:

```javascript
await wallets.consolidate('wallet-1', 'balance');
// 1. Lê transações pendentes
// 2. Aplica reducer (soma por default)
// 3. Atualiza wallet.balance
// 4. Marca transações como applied: true
```

> **⚠️ IMPORTANTE**: O plugin **NÃO cria registros** que não existem. Transações ficam pendentes até você criar o registro.

### 3. Analytics (Opcional)
Cria agregações em `plg_{resource}_an_{field}`:
- Métricas: count, sum, avg, min, max
- Períodos: hour, day, month

---

## API

### Constructor

```javascript
new EventualConsistencyPlugin({
  // Obrigatório
  resources: {
    resourceName: ['field1', 'field2', ...]
  },

  // Consolidação
  consolidation: {
    mode: 'sync',                   // 'sync' ou 'async' (default: 'async')
    auto: true,                     // Auto-consolidação (default: true)
    interval: 300,                  // Intervalo em segundos (default: 300)
    window: 24,                     // Janela em horas (default: 24)
    concurrency: 5,                 // Consolidações paralelas (default: 5)
    markAppliedConcurrency: 50      // ✅ NOVO (v11.0.3): Concurrency para mark applied (default: 50)
  },

  // Analytics (opcional)
  analytics: {
    enabled: false,      // Habilitar analytics (default: false)
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum', 'avg', 'min', 'max']
  },

  // Debug e logging
  verbose: true,           // Logging detalhado (default: true desde v11.0.0)
  debug: false,            // Debug mode adicional (default: false, v11.0.0+)

  // Opções avançadas
  locks: { timeout: 300 },
  garbageCollection: { enabled: true, interval: 86400, retention: 30 },
  checkpoints: { enabled: true, strategy: 'hourly', retention: 90 },
  cohort: { timezone: 'UTC' }  // Default: UTC (ou TZ env var)
})
```

### Métodos do Resource

```javascript
// Definir valor absoluto
await resource.set(id, field, value)

// Adicionar
await resource.add(id, field, amount)

// Subtrair
await resource.sub(id, field, amount)

// Consolidar
await resource.consolidate(id, field)

// Obter valor consolidado (sem aplicar)
await resource.getConsolidatedValue(id, field, options)

// Recalcular do zero
await resource.recalculate(id, field)
```

---

## Exemplos

### Wallet System (Sync Mode)

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  consolidation: { mode: 'sync', auto: false }
}));

const wallets = await db.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

await wallets.insert({ id: 'w1', balance: 0 });
await wallets.add('w1', 'balance', 1000);
await wallets.sub('w1', 'balance', 250);

const wallet = await wallets.get('w1');
console.log(wallet.balance); // 750
```

### URL Shortener (Async Mode + Analytics)

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: { urls: ['clicks', 'views'] },

  consolidation: {
    mode: 'async',
    auto: true,
    interval: 60  // 1 minuto
  },

  analytics: {
    enabled: true,
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum']
  }
}));

const urls = await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    clicks: 'number|default:0',
    views: 'number|default:0'
  }
});

// Hook para auto-incrementar
const clicks = await db.createResource({ name: 'clicks', ... });
clicks.addHook('afterInsert', async ({ record }) => {
  await urls.add(record.urlId, 'clicks', 1);
});

// Analytics
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);
const stats = await plugin.getLastNDays('urls', 'clicks', 7);
```

---

## Analytics API

```javascript
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);

// Generic query
await plugin.getAnalytics('resource', 'field', { period: 'hour', date: '2025-10-09' });

// Time range breakdown (specific period)
await plugin.getDayByHour('resource', 'field', '2025-10-09');       // Day → 24 hours
await plugin.getWeekByDay('resource', 'field', '2025-W42');         // 🆕 Week → 7 days (ISO 8601)
await plugin.getWeekByHour('resource', 'field', '2025-W42');        // 🆕 Week → 168 hours
await plugin.getMonthByDay('resource', 'field', '2025-10');         // Month → ~30 days
await plugin.getMonthByHour('resource', 'field', '2025-10');        // Month → ~720 hours
await plugin.getMonthByWeek('resource', 'field', '2025-10');        // Month → 4-5 weeks
await plugin.getYearByDay('resource', 'field', 2025);               // 🆕 Year → 365/366 days
await plugin.getYearByWeek('resource', 'field', 2025);              // Year → 52-53 weeks
await plugin.getYearByMonth('resource', 'field', 2025);             // Year → 12 months

// Last N periods (convenience functions)
await plugin.getLastNHours('resource', 'field', 24);                // 🆕 Last 24 hours
await plugin.getLastNDays('resource', 'field', 7);                  // Last 7 days
await plugin.getLastNWeeks('resource', 'field', 4);                 // 🆕 Last 4 weeks
await plugin.getLastNMonths('resource', 'field', 12);               // 🆕 Last 12 months

// Top records by volume
await plugin.getTopRecords('resource', 'field', {
  period: 'day',
  cohort: '2025-10-09',
  limit: 10,
  sortBy: 'transactionCount'  // ou 'totalValue'
});
```

### Gap Filling

All functions support `fillGaps` option for continuous time series:

```javascript
// Without gaps (sparse data only)
const data = await plugin.getLastNHours('urls', 'clicks', 24);
// Returns only hours with actual data

// With gaps (continuous series with zeros)
const data = await plugin.getLastNHours('urls', 'clicks', 24, { fillGaps: true });
// Returns all 24 hours, filling missing periods with zeros
```

### 🆕 Complete Analytics Functions (v11.0.4+)

The plugin now provides **15 analytics functions** covering all time range and granularity combinations:

#### By Time Range + Granularity

| Function | Time Range | Granularity | Records | Example |
|----------|-----------|-------------|---------|---------|
| `getDayByHour()` | Single day | Hours | 24 | `'2025-10-09'` |
| `getWeekByDay()` ⭐ | Single week | Days | 7 | `'2025-W42'` |
| `getWeekByHour()` ⭐ | Single week | Hours | 168 | `'2025-W42'` |
| `getMonthByDay()` | Single month | Days | 28-31 | `'2025-10'` |
| `getMonthByHour()` | Single month | Hours | 672-744 | `'2025-10'` |
| `getMonthByWeek()` | Single month | Weeks | 4-5 | `'2025-10'` |
| `getYearByDay()` ⭐ | Single year | Days | 365-366 | `2025` |
| `getYearByWeek()` | Single year | Weeks | 52-53 | `2025` |
| `getYearByMonth()` | Single year | Months | 12 | `2025` |

⭐ = New in v11.0.4

#### Last N Periods (Convenience)

| Function | Description | Default | Example |
|----------|-------------|---------|---------|
| `getLastNHours()` ⭐ | Last N hours | 24 | Last 24 hours |
| `getLastNDays()` | Last N days | 7 | Last 7 days |
| `getLastNWeeks()` ⭐ | Last N weeks | 4 | Last 4 weeks |
| `getLastNMonths()` ⭐ | Last N months | 12 | Last 12 months |

⭐ = New in v11.0.4

#### Example Usage

```javascript
// Get year breakdown by days (365/366 records)
const yearDays = await plugin.getYearByDay('products', 'sold', 2025);
// [
//   { cohort: '2025-01-01', count: 50, sum: 5000, avg: 100, ... },
//   { cohort: '2025-01-02', count: 75, sum: 7500, avg: 100, ... },
//   ...
//   { cohort: '2025-12-31', count: 100, sum: 10000, avg: 100, ... }
// ]

// Get week breakdown by days (7 records, ISO 8601)
const weekDays = await plugin.getWeekByDay('urls', 'clicks', '2025-W42', { fillGaps: true });
// [
//   { cohort: '2025-10-13', count: 0, sum: 0, ... },  // Monday
//   { cohort: '2025-10-14', count: 150, sum: 1500, ... },
//   ...
//   { cohort: '2025-10-19', count: 200, sum: 2000, ... }  // Sunday
// ]

// Get week breakdown by hours (168 records)
const weekHours = await plugin.getWeekByHour('wallets', 'balance', '2025-W42');

// Get last 24 hours
const last24h = await plugin.getLastNHours('apis', 'requests', 24, { fillGaps: true });

// Get last 4 weeks
const last4Weeks = await plugin.getLastNWeeks('sales', 'revenue', 4);

// Get last 12 months
const last12Months = await plugin.getLastNMonths('users', 'signups', 12, { fillGaps: true });
```

#### Data Format (Chart-Ready)

All functions return the same structure, ready for charting:

```javascript
[
  {
    cohort: '2025-10-11T14',  // Time identifier (x-axis)
    count: 145,                // Transaction count
    sum: 52834.50,            // Total value (y-axis for bar/area charts)
    avg: 364.38,              // Average value (y-axis for line charts)
    min: -500.00,             // Minimum value
    max: 10000.00,            // Maximum value
    recordCount: 23,          // Unique records affected
    operations: {             // Breakdown by operation type
      add: { count: 120, sum: 60000 },
      sub: { count: 25, sum: -7165.50 }
    }
  }
]
```

**Direct chart usage** (no processing needed):
- **Bar charts**: `data.map(d => ({ x: d.cohort, y: d.sum }))`
- **Line charts**: `data.map(d => ({ x: d.cohort, y: d.avg }))`
- **Area charts**: `data.map(d => ({ x: d.cohort, y1: d.operations.add.sum, y2: d.operations.sub.sum }))`
- **Range charts**: `data.map(d => ({ x: d.cohort, min: d.min, max: d.max }))`

### 🆕 Week Analytics (ISO 8601)

O plugin agora suporta **agregações semanais (ISO 8601)**:

```javascript
// Obter ano inteiro dividido por semanas (52-53 semanas)
const yearWeeks = await plugin.getYearByWeek('products', 'sold', 2025);
// [
//   { cohort: '2025-W01', count: 150, sum: 15000, avg: 100, ... },
//   { cohort: '2025-W02', count: 200, sum: 20000, avg: 100, ... },
//   ...
//   { cohort: '2025-W53', count: 100, sum: 10000, avg: 100, ... }
// ]

// Obter mês dividido por semanas (4-5 semanas)
const monthWeeks = await plugin.getMonthByWeek('products', 'views', '2025-10');
// [
//   { cohort: '2025-W40', count: 500, sum: 5000, ... },
//   { cohort: '2025-W41', count: 700, sum: 7000, ... },
//   ...
// ]
```

**Formato ISO 8601:**
- `YYYY-Www` (exemplo: `2025-W42` = semana 42 de 2025)
- Semana começa na **segunda-feira**
- Primeira semana do ano contém 4 de janeiro
- Anos podem ter 52 ou 53 semanas

**Hierarquia de Rollup:**
```
Transaction (timestamp)
  ↓
HOUR cohort (2025-10-11T14)
  ↓ rollup
DAY cohort (2025-10-11)
  ↓ rollup (🆕)
WEEK cohort (2025-W42)
  ↓ rollup
MONTH cohort (2025-10)
```

**Estrutura dos Analytics:**
```javascript
{
  id: 'hour-2025-10-09T14',
  period: 'hour',            // 'hour', 'day', 'week', 'month'
  cohort: '2025-10-09T14',   // ou '2025-W42' para week
  transactionCount: 150,
  totalValue: 5000,
  avgValue: 33.33,
  minValue: 10,
  maxValue: 500,
  recordCount: 25,           // Distinct originalIds
  operations: {
    add: { count: 120, sum: 6000 },
    sub: { count: 30, sum: -1000 }
  }
}
```

---

## Modo Sync vs Async

### Sync Mode
- ✅ Consolidação imediata
- ✅ Bloqueia até completar
- ✅ Garantia de consistência
- ❌ Mais lento em alto volume

**Use para:** Saldos bancários, inventário, pagamentos

### Async Mode (Default)
- ✅ Consolidação eventual
- ✅ Não bloqueia
- ✅ Auto-consolidação periódica
- ✅ Alto volume (milhões de transações)
- ❌ Valor pode estar desatualizado

**Use para:** Contadores, métricas, pontos, analytics

---

## Recursos Criados

Para cada field, o plugin cria:

1. **`plg_{resource}_tx_{field}`** - Log de transações
   - Atributos: `id`, `originalId`, `field`, `value`, `operation`, `timestamp`, `cohortDate`, `cohortHour`, **`cohortWeek`** (v11.0.2+), `cohortMonth`, `applied`
   - Partições: `byOriginalIdAndApplied` (consolidation otimizada), `byHour`, `byDay`, **`byWeek`** (v11.0.2+), `byMonth`

2. **Locks via PluginStorage** - Distributed locks com TTL automático (não usa resource)

3. **`plg_{resource}_an_{field}`** - Analytics (se habilitado)
   - Períodos: `hour`, `day`, **`week`** (v11.0.2+), `month`

---

## Best Practices

### ✅ Recomendações
- Use **sync mode** para dados críticos (dinheiro, inventário)
- Use **async mode** para métricas e contadores
- Habilite **analytics** para dashboards
- Use **hooks** para auto-incrementar
- Sempre **crie o registro antes** de incrementar
- Configure `asyncPartitions: true` no resource (70-100% mais rápido)

### ⚠️ Cuidados
- **Batch mode** perde dados em crash
- **Reducers customizados** devem ser pure functions
- **Timezone** afeta particionamento de cohorts

---

## Troubleshooting

### Transações não consolidam
```javascript
// Verificar modo
console.log(plugin.config.mode);  // 'async' ou 'sync'

// Consolidar manualmente
await resource.consolidate(id, field);

// Verificar auto-consolidação
console.log(plugin.config.autoConsolidate);  // true?
```

### Performance lenta
```javascript
// Habilitar partições async
await db.createResource({
  name: 'wallets',
  asyncPartitions: true  // ← 70-100% mais rápido
});

// ✅ Aumentar concorrência da consolidação
{ consolidation: { concurrency: 10 } }  // default: 5

// ✅ Aumentar concorrência do mark applied (v11.0.3+)
{ consolidation: { markAppliedConcurrency: 100 } }  // default: 50

// Reduzir janela
{ consolidation: { window: 12 } }  // default: 24h
```

### Analytics faltando
```javascript
// Verificar configuração
console.log(plugin.config.enableAnalytics);

// Verificar resource criado
console.log(db.resources.plg_wallets_an_balance);
```

---

## Migration Guide (v9.x → v10.x)

### Configuração

```javascript
// ❌ v9.x - NÃO FUNCIONA MAIS
new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance'
})

// ✅ v10.x - Nova estrutura nested
new EventualConsistencyPlugin({
  resources: {
    wallets: ['balance']
  },
  consolidation: { mode: 'sync' }
})
```

### Métodos

```javascript
// ❌ v9.x
await wallets.add('w1', 100)
await wallets.consolidate('w1')

// ✅ v10.x - sempre especifique field
await wallets.add('w1', 'balance', 100)
await wallets.consolidate('w1', 'balance')
```

---

## O Que Mudou (v10.0.16+)

### 🎯 Principais Mudanças

1. **Estrutura Nested**: Config organizada em seções (`consolidation`, `analytics`, `locks`, etc)
2. **Multi-Field**: Suporte a múltiplos campos por resource
3. **Arquitetura Modular**: 11 módulos ao invés de 1 arquivo monolítico
4. **Não Cria Registros**: Plugin não cria registros inexistentes (evita erros com campos obrigatórios)
5. **Composite Partition**: Query 1000x mais rápida com `byOriginalIdAndApplied`
6. **Timezone UTC**: Padrão UTC ao invés de detecção automática

### 📦 Arquitetura

```
src/plugins/eventual-consistency/
├── index.js              # Classe principal
├── config.js             # Configuração
├── consolidation.js      # Consolidação
├── transactions.js       # Transações
├── analytics.js          # Analytics
├── locks.js              # Locks distribuídos
├── garbage-collection.js # GC
├── helpers.js            # add/sub/set
├── setup.js              # Setup
├── utils.js              # Utilitários
└── partitions.js         # Partições
```

### 🔧 Fluxo Correto

```javascript
// ✅ SEMPRE crie o registro primeiro
await urls.insert({
  id: 'url-123',
  link: 'https://example.com',
  clicks: 0
});

// ✅ Depois incremente
await urls.add('url-123', 'clicks', 1);

// ✅ Modo sync consolida automaticamente
const url = await urls.get('url-123');
console.log(url.clicks); // 1 ✅
```

---

## 🆕 Novas Correções (v11.0.0 - 11/10/2025)

### 1. Debug Mode Completo para Troubleshooting

A versão 11.0.0 adiciona instrumentação extensiva para debugar problemas de persistência de valores.

#### Problema Investigado

Usuários reportaram que `resource.update()` retornava `updateOk: true` mas o valor não persistia no S3:

```javascript
await urls.add('abc123', 'clicks', 2);
await urls.consolidate('abc123', 'clicks');

const result = await urls.get('abc123');
console.log(result.clicks); // ❌ 0 (esperado: 2)
```

#### Solução: Logging Completo

Agora o plugin mostra logs detalhados em **TRÊS momentos**:

**1. ANTES do update:**
```javascript
🔥 [DEBUG] BEFORE targetResource.update() {
  originalId: 'abc123',
  field: 'clicks',
  consolidatedValue: 2,
  currentValue: 0
}
```

**2. DEPOIS do update:**
```javascript
🔥 [DEBUG] AFTER targetResource.update() {
  updateOk: true,
  updateErr: undefined,
  updateResult: { clicks: 0 },  // ← Mostra o retorno real!
  hasField: 0
}
```

**3. VERIFICAÇÃO (busca direto do S3, sem cache):**
```javascript
🔥 [DEBUG] VERIFICATION (fresh from S3, no cache) {
  verifyOk: true,
  verifiedRecord[clicks]: 2,
  expectedValue: 2,
  ✅ MATCH: true
}
```

**4. Detecção Automática de Bugs:**

Se o valor não bater, você verá:

```javascript
❌ [CRITICAL BUG] Update reported success but value not persisted!
  Resource: urls
  Field: clicks
  Record ID: abc123
  Expected: 2
  Actually got: 0
  This indicates a bug in s3db.js resource.update()
```

#### Como Usar

```javascript
// verbose: true é o padrão agora!
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  // Não precisa passar verbose: true (já é default)
});

// Ou use debug mode para logs adicionais
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  debug: true  // ← Nova opção v11.0.0
});
```

#### O que os Logs Revelam

Os logs permitem identificar se o problema está em:
- ✅ `resource.update()` retorna valor errado mas persiste correto → Bug no retorno
- ✅ `resource.update()` retorna correto mas não persiste → Bug na persistência
- ✅ Cache serving stale data → Bug no cache
- ✅ S3 eventual consistency → Delay na propagação

### 2. Fix do Analytics "Field Required" Error

#### Problema

Ao habilitar analytics, o erro `InvalidResourceItem: The 'field' field is required` aparecia aleatoriamente:

```javascript
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks', 'views'] },
  analytics: { enabled: true }
});

// Erro aleatório:
// InvalidResourceItem: The 'field' field is required
```

#### Causa Raiz

Race condition onde múltiplos handlers compartilham o mesmo objeto `config` mutável:

```javascript
// Handler 1 (urls.clicks) começa:
this.config.field = 'clicks';

// Handler 2 (urls.views) sobrescreve concorrentemente:
this.config.field = 'views';

// Handler 1 tenta inserir analytics:
await analyticsResource.insert({
  field: config.field,  // ← 'views' (ERRADO! Deveria ser 'clicks')
  // ...
});
// ❌ Erro: Record tem field='views' mas deveria ser 'clicks'
```

#### Solução: Validação Crítica

Adicionada validação no início de `updateAnalytics()` que detecta quando o race condition ocorre:

```javascript
if (!config.field) {
  throw new Error(
    `[EventualConsistency] CRITICAL BUG: config.field is undefined in updateAnalytics()!\n` +
    `This indicates a race condition in the plugin where multiple handlers ` +
    `are sharing the same config object.\n` +
    `Config: ${JSON.stringify({ resource: config.resource, field: config.field })}\n` +
    `Transactions count: ${transactions.length}\n` +
    `AnalyticsResource: ${analyticsResource?.name}`
  );
}
```

#### Mensagem de Erro Detalhada

Agora quando o bug ocorrer, você verá:

```
CRITICAL BUG: config.field is undefined in updateAnalytics()!
This indicates a race condition in the plugin where multiple handlers
are sharing the same config object.
Config: {"resource":"urls","field":undefined,"verbose":false}
Transactions count: 5
AnalyticsResource: plg_urls_an_clicks
```

Isso ajuda a identificar o momento exato quando o race condition acontece e qual handler estava rodando.

### 3. Verbose Mode Habilitado por Padrão

#### Mudança

A partir da v11.0.0, `verbose: true` é o padrão (antes era `false`).

**Antes (v10.x):**
```javascript
// Sem logs
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] }
});
```

**Depois (v11.0+):**
```javascript
// COM logs por padrão
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] }
});

// Para desabilitar explicitamente:
const plugin = new EventualConsistencyPlugin({
  verbose: false,  // ← Agora precisa desabilitar explicitamente
  resources: { urls: ['clicks'] }
});
```

#### Benefícios

- ✅ Debug out-of-the-box (sem precisar adicionar `verbose: true`)
- ✅ Facilita troubleshooting em produção
- ✅ Alinhado com expectativas do usuário para plugin crítico

### 4. Nova Opção: Debug Mode

Além de `verbose`, agora existe a opção `debug` (funciona igual, mas separada):

```javascript
const plugin = new EventualConsistencyPlugin({
  debug: true,    // ← Nova opção (equivalente a verbose)
  verbose: true,  // ← Opção original
  resources: { urls: ['clicks'] }
});
```

Todos os logs respondem a **ambos** `verbose` e `debug`:

```javascript
if (config.verbose || config.debug) {
  console.log('🔥 [DEBUG] ...');
}
```

### Arquivos Modificados (v11.0.0)

- ✅ **`src/plugins/eventual-consistency/consolidation.js`** (+73 linhas)
  - Debug logging ANTES do update (valores originais)
  - Debug logging DEPOIS do update (resultado retornado)
  - Verificação direta do S3 (bypass cache)
  - Detecção automática de bugs de persistência

- ✅ **`src/plugins/eventual-consistency/analytics.js`** (+20 linhas)
  - Validação crítica de `config.field`
  - Mensagens de erro detalhadas para race conditions
  - Debug mode em todos os logs

- ✅ **`src/plugins/eventual-consistency/config.js`** (+2 linhas)
  - `verbose: options.verbose !== false` (default: true)
  - `debug: options.debug || false` (nova opção)

### Commits

- `ccfc639` - fix(eventual-consistency): add comprehensive debug mode and fix analytics race condition
- `3115ac8` - feat(eventual-consistency): change verbose default to true

### Como Testar as Correções

#### 1. Testar Debug Mode

```javascript
const plugin = new EventualConsistencyPlugin({
  // verbose: true já é o padrão!
  resources: { urls: ['clicks', 'views'] },
  analytics: { enabled: true }
});

await db.usePlugin(plugin);

// Execute operações e observe os logs
await urls.add('test123', 'clicks', 2);
await urls.consolidate('test123', 'clicks');
```

**Logs esperados:**
```
🔥 [DEBUG] BEFORE targetResource.update() {...}
🔥 [DEBUG] AFTER targetResource.update() {...}
🔥 [DEBUG] VERIFICATION {...}
```

Se você ver `❌ [CRITICAL BUG]`, significa que o bug do update() está acontecendo!

#### 2. Verificar Analytics Race Condition

Se o erro de analytics aparecer:
```
InvalidResourceItem: The 'field' field is required
```

Agora você verá a mensagem detalhada:
```
CRITICAL BUG: config.field is undefined in updateAnalytics()!
This indicates a race condition...
Config: {"resource":"urls","field":undefined}
```

Isso confirma que o bug é o race condition de config compartilhado.

### Documentação Completa

Para detalhes completos das correções, veja:
- [1-Pager Bug Fix (PT-BR)](../../docs/1-pager-eventual-consistency-bug-fix.pt-BR.md)

---

## 📅 Changelog

### v11.0.4 (12/10/2025)

#### 🆕 Complete Analytics API - 6 New Functions

Completed the analytics API with **6 new functions** covering all time range/granularity combinations:

**New Functions:**
1. ✅ `getYearByDay(resource, field, year, options)` - Year broken down by days (365/366 records)
2. ✅ `getWeekByDay(resource, field, week, options)` - Week broken down by days (7 records, ISO 8601)
3. ✅ `getWeekByHour(resource, field, week, options)` - Week broken down by hours (168 records)
4. ✅ `getLastNHours(resource, field, hours, options)` - Last N hours with gap filling
5. ✅ `getLastNWeeks(resource, field, weeks, options)` - Last N weeks
6. ✅ `getLastNMonths(resource, field, months, options)` - Last N months with gap filling

**Features:**
- ✅ ISO 8601 week numbering (Monday start, weeks identified as `YYYY-Www`)
- ✅ Gap filling support for continuous time series
- ✅ Chart-ready data format (cohort, count, sum, avg, min, max)
- ✅ Precise time range calculations (no off-by-one errors)
- ✅ UTC-based date handling (prevents timezone issues)

**Total Analytics Functions:** 15
- 9 time range + granularity combinations
- 4 "last N periods" convenience functions
- 1 generic query function
- 1 top records function

**Test Coverage:**
- ✅ 31/31 analytics tests passing (100%)
- ✅ All edge cases covered (ISO weeks, leap years, gap filling)

**Compatibility:**
- ✅ 100% backward compatible
- ✅ No breaking changes
- ✅ All existing functions unchanged

**Commits:**
- `a0b2f87` - feat: implement 6 new analytics functions
- `cacb511` - fix: resolve all edge case failures

### v11.0.2 (11/10/2025)

#### 🆕 Week Analytics Support (ISO 8601)

Adicionado suporte completo para agregações semanais:

**Novas Features:**
- ✅ Cálculo automático de semana ISO 8601 (segunda a domingo)
- ✅ Atributo `cohortWeek` em transações (formato: `YYYY-Www`)
- ✅ Partição `byWeek` para queries otimizadas
- ✅ Rollup automático: hour → day → **week** → month
- ✅ Novas funções: `getYearByWeek()` e `getMonthByWeek()`

**Arquivos Modificados:**
- `src/plugins/eventual-consistency/utils.js` - Função `getISOWeek()` e atualização `getCohortInfo()`
- `src/plugins/eventual-consistency/partitions.js` - Partição `byWeek`
- `src/plugins/eventual-consistency/install.js` - Atributo `cohortWeek`
- `src/plugins/eventual-consistency/transactions.js` - Transaction object inclui `cohortWeek`
- `src/plugins/eventual-consistency/analytics.js` - Rollup + query functions
- `src/plugins/eventual-consistency/index.js` - API pública

**Compatibilidade:**
- ✅ 100% backward compatible (cohortWeek é opcional)
- ✅ Transações antigas continuam funcionando
- ✅ Não requer migração
- ✅ Todos os 861 testes passando

**Uso:**
```javascript
// Obter analytics semanais
const weeks = await plugin.getYearByWeek('products', 'sold', 2025);
console.log(weeks[0]); // { cohort: '2025-W01', count: 150, sum: 15000, ... }

// Comparar semanas de um mês
const monthWeeks = await plugin.getMonthByWeek('urls', 'clicks', '2025-10');
// [W40, W41, W42, W43, W44]
```

---

## Ver Também

- [Replicator Plugin](./replicator.md) - Replicar para outros bancos
- [Audit Plugin](./audit.md) - Audit trail
- [Cache Plugin](./cache.md) - Cache de valores consolidados
