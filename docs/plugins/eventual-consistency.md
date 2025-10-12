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

## Analytics API - Referência Completa

### Visão Geral

O plugin fornece uma API completa com **15 funções** de analytics que cobrem todas as combinações de intervalo de tempo e granularidade. Todos os analytics são pré-computados durante a consolidação, tornando as queries extremamente rápidas (O(1) partition lookups).

**Recursos principais**:
- ✅ **15 funções diferentes** cobrindo todos os intervalos tempo/granularidade
- ✅ **Rollups pré-computados** de hour → day → week/month → year
- ✅ **Gap filling** para séries temporais contínuas
- ✅ **Múltiplos campos** (balance, totalSpent, points, etc.)
- ✅ **Top records** por volume de transações
- ✅ **Zero overhead de query** - dados agregados durante escrita

### Arquitetura

#### Hierarquia de Rollup

```
hour (transações brutas)
  ↓
day (24 horas agregadas)
  ↓ ↓
  week (7 dias)    month (28-31 dias)
  ↓                ↓
  year (52 semanas OU 12 meses)
```

**Importante**: Week e month são calculados **independentemente** de days, não um do outro.

#### Formatos de Cohort

| Período | Formato | Exemplo | Descrição |
|---------|---------|---------|-----------|
| **hour** | `YYYY-MM-DDTHH` | `2025-10-09T14` | Hora específica em UTC |
| **day** | `YYYY-MM-DD` | `2025-10-09` | Dia específico |
| **week** | `YYYY-Www` | `2025-W42` | Número da semana ISO 8601 |
| **month** | `YYYY-MM` | `2025-10` | Mês específico |
| **year** | `YYYY` | `2025` | Ano específico |

**Numeração de Semanas ISO 8601**:
- Semana 1 é a semana que contém a primeira quinta-feira do ano
- Semanas começam na segunda e terminam no domingo
- Alguns anos têm 53 semanas (quando 1 de janeiro é quinta, ou ano bissexto começando na quarta)

### Funções Disponíveis

#### 1. Query Genérica

```javascript
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);

// Query genérica com filtros
await plugin.getAnalytics('users', 'balance', {
  period: 'hour',           // 'hour', 'day', 'week', 'month', 'year'
  startDate: '2025-10-09T00',
  endDate: '2025-10-09T23'
});
```

#### 2. Por Intervalo de Tempo + Granularidade

```javascript
// Dia dividido em horas (24 registros)
await plugin.getDayByHour('users', 'balance', '2025-10-09', { fillGaps: true });

// Semana dividida em dias (7 registros)
await plugin.getWeekByDay('users', 'balance', '2025-W42', { fillGaps: true });

// Semana dividida em horas (168 registros)
await plugin.getWeekByHour('users', 'balance', '2025-W42', { fillGaps: true });

// Mês dividido em dias (28-31 registros)
await plugin.getMonthByDay('users', 'balance', '2025-10', { fillGaps: true });

// Mês dividido em horas (672-744 registros)
await plugin.getMonthByHour('users', 'balance', '2025-10', { fillGaps: true });

// Mês dividido em semanas (4-5 registros)
await plugin.getMonthByWeek('users', 'balance', '2025-10');

// Ano dividido em meses (12 registros)
await plugin.getYearByMonth('users', 'balance', '2025', { fillGaps: true });

// Ano dividido em semanas (52-53 registros)
await plugin.getYearByWeek('users', 'balance', '2025', { fillGaps: true });

// Ano dividido em dias (365-366 registros)
await plugin.getYearByDay('users', 'balance', '2025', { fillGaps: true });
```

#### 3. Funções de Conveniência

```javascript
// Últimas N horas (padrão: 24)
await plugin.getLastNHours('users', 'balance', 24, { fillGaps: true });

// Últimos N dias (padrão: 7)
await plugin.getLastNDays('users', 'balance', 7, { fillGaps: true });

// Últimas N semanas (padrão: 4)
await plugin.getLastNWeeks('users', 'balance', 4);

// Últimos N meses (padrão: 12)
await plugin.getLastNMonths('users', 'balance', 12, { fillGaps: true });
```

#### 4. Top Records

```javascript
// Top 10 usuários por volume de transações
await plugin.getTopRecords('users', 'balance', 10);

// Top 20 usuários em Outubro 2025
await plugin.getTopRecords('users', 'balance', 20, {
  startDate: '2025-10-01',
  endDate: '2025-10-31'
});
```

### Formato dos Registros de Analytics

```javascript
{
  cohort: '2025-10-09T14',    // Identificador de tempo
  count: 145,                  // Número de transações
  sum: 52834.50,              // Soma de todos os valores
  avg: 364.38,                // Valor médio
  min: -500.00,               // Valor mínimo
  max: 10000.00,              // Valor máximo
  recordCount: 23,            // IDs únicos de resources
  operations: {               // Breakdown por operação
    add: { count: 120, sum: 60000 },
    sub: { count: 25, sum: -7165.50 }
  }
}
```

### Exemplos de Uso

#### Dashboard em Tempo Real

```javascript
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);

// Obter últimas 24 horas
const hourlyData = await plugin.getLastNHours('users', 'balance', 24, {
  fillGaps: true
});

// Transformar para gráfico
const chartData = hourlyData.map(record => ({
  time: record.cohort,
  transactions: record.count,
  volume: record.sum,
  average: record.avg
}));
```

#### Relatório Semanal

```javascript
// Obter últimas 2 semanas
const weeklyData = await plugin.getLastNWeeks('users', 'balance', 2);

const [lastWeek, thisWeek] = weeklyData;

const report = {
  thisWeek: {
    transactions: thisWeek.count,
    volume: thisWeek.sum,
    average: thisWeek.avg
  },
  lastWeek: {
    transactions: lastWeek.count,
    volume: lastWeek.sum,
    average: lastWeek.avg
  },
  growth: {
    transactions: ((thisWeek.count - lastWeek.count) / lastWeek.count * 100).toFixed(2) + '%',
    volume: ((thisWeek.sum - lastWeek.sum) / lastWeek.sum * 100).toFixed(2) + '%'
  }
};
```

#### Heatmap Mensal

```javascript
// Obter todas as horas de outubro
const hourlyData = await plugin.getMonthByHour('users', 'balance', '2025-10', {
  fillGaps: true
});

// Transformar para array 2D [dia][hora]
const heatmapData = [];
for (let day = 1; day <= 31; day++) {
  const dayData = [];
  for (let hour = 0; hour < 24; hour++) {
    const cohort = `2025-10-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}`;
    const record = hourlyData.find(r => r.cohort === cohort);
    dayData.push(record ? record.count : 0);
  }
  heatmapData.push(dayData);
}
```

#### Comparação Ano-a-Ano

```javascript
// Obter dados mensais de 2024 e 2025
const data2024 = await plugin.getYearByMonth('users', 'balance', '2024', { fillGaps: true });
const data2025 = await plugin.getYearByMonth('users', 'balance', '2025', { fillGaps: true });

// Combinar para comparação
const comparison = data2024.map((record2024, index) => {
  const record2025 = data2025[index];
  return {
    month: index + 1,
    '2024': record2024.sum,
    '2025': record2025.sum,
    growth: ((record2025.sum - record2024.sum) / record2024.sum * 100).toFixed(1) + '%'
  };
});
```

#### Top 10 Usuários

```javascript
// Obter top 10 por contagem de transações
const topUsers = await plugin.getTopRecords('users', 'balance', 10);

// Enriquecer com detalhes do usuário
const usersResource = await db.getResource('users');
const enrichedData = await Promise.all(
  topUsers.map(async (record) => {
    const user = await usersResource.get(record.resourceId);
    return {
      id: record.resourceId,
      name: user.name,
      email: user.email,
      transactions: record.count,
      totalVolume: record.sum,
      avgTransaction: record.avg
    };
  })
);
```

#### Detecção de Anomalias

```javascript
// Obter últimos 30 dias para calcular baseline
const last30Days = await plugin.getLastNDays('users', 'balance', 30, { fillGaps: true });

// Calcular estatísticas baseline
const baseline = {
  avgCount: last30Days.reduce((sum, r) => sum + r.count, 0) / 30,
  avgSum: last30Days.reduce((sum, r) => sum + r.sum, 0) / 30
};

// Obter últimos 7 dias para análise
const last7Days = last30Days.slice(-7);

// Encontrar anomalias (> 2x baseline ou < 0.5x baseline)
const anomalies = last7Days.filter(record => {
  const countRatio = record.count / baseline.avgCount;
  const sumRatio = record.sum / baseline.avgSum;
  return countRatio > 2 || countRatio < 0.5 || sumRatio > 2 || sumRatio < 0.5;
});
```

### Performance

Todas as queries de analytics são **lookups O(1) em partições** sem agregação em tempo de query:

| Função | Registros | Tempo de Query | Requests S3 |
|--------|-----------|----------------|-------------|
| `getDayByHour()` | 24 | ~50ms | 1 |
| `getWeekByDay()` | 7 | ~30ms | 1 |
| `getWeekByHour()` | 168 | ~100ms | 1-2 |
| `getMonthByDay()` | 28-31 | ~50ms | 1 |
| `getMonthByHour()` | 672-744 | ~150ms | 2-3 |
| `getYearByMonth()` | 12 | ~40ms | 1 |
| `getYearByWeek()` | 52-53 | ~80ms | 1-2 |
| `getYearByDay()` | 365-366 | ~200ms | 3-4 |
| `getLastNDays()` | N | ~50ms | 1 |
| `getLastNHours()` | N | ~50ms | 1 |

**Notas**:
- Tempos para LocalStack (desenvolvimento). AWS S3 adiciona ~20-50ms de latência
- Cache com CachePlugin reduz para ~1-5ms (memória) ou ~10-20ms (filesystem)
- ResultSets grandes podem precisar de múltiplos requests S3 para paginação

### Best Practices

#### 1. Use fillGaps para Gráficos de Séries Temporais

```javascript
// ❌ RUIM - lacunas nos dados criam gráficos irregulares
const data = await plugin.getLastNDays('users', 'balance', 7);

// ✅ BOM - série temporal contínua com zeros para períodos faltantes
const data = await plugin.getLastNDays('users', 'balance', 7, { fillGaps: true });
```

#### 2. Escolha a Granularidade Correta

- **Dashboards em tempo real** (< 1 dia): Use `getLastNHours()`
- **Relatórios diários** (1-7 dias): Use `getLastNDays()`
- **Relatórios semanais** (1-4 semanas): Use `getLastNWeeks()`
- **Relatórios mensais** (1-12 meses): Use `getLastNMonths()`
- **Relatórios anuais**: Use `getYearByMonth()` ou `getYearByWeek()`

**Evite over-granularity**: Não use `getYearByDay()` (365 registros) quando `getYearByMonth()` (12 registros) é suficiente.

#### 3. Cache de Queries de Analytics

```javascript
database.use(new CachePlugin({
  driver: 'memory',
  ttl: 300, // 5 minutos
  include: ['users_analytics_*'] // Cache todos os resources de analytics
}));
```

**Resultado**: Queries 100x mais rápidas (1-5ms vs 50-100ms)

#### 4. Use Top Records para Leaderboards

```javascript
// ❌ RUIM - busca todos os registros e ordena em memória
const allData = await plugin.getAnalytics('users', 'balance');
const topUsers = allData.sort((a, b) => b.count - a.count).slice(0, 10);

// ✅ BOM - pré-ordenado por contagem de transações
const topUsers = await plugin.getTopRecords('users', 'balance', 10);
```

#### 5. Use Semanas ISO 8601 Corretamente

```javascript
// ❌ RUIM - formato de semana incorreto
await plugin.getWeekByDay('users', 'balance', '2025-10-09');

// ✅ BOM - formato ISO 8601
await plugin.getWeekByDay('users', 'balance', '2025-W41');
```

#### 6. Atenção com Edge Cases de Final de Ano

```javascript
// 31 de dezembro de 2025 está na semana 2026-W01 (não 2025-W53)
getCohortWeekFromDate(new Date('2025-12-31')); // '2026-W01'

// 1 de janeiro de 2024 está na semana 2024-W01 (segunda-feira)
getCohortWeekFromDate(new Date('2024-01-01')); // '2024-W01'
```

**Dica**: Ao fazer query de ano por semana, semanas podem cruzar fronteiras de anos.

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
