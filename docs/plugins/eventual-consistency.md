# EventualConsistencyPlugin

**Gerencia campos numéricos com histórico de transações e consistência eventual**

Perfeito para contadores, saldos, pontos e outros campos acumuladores que precisam de:
- ✅ Histórico completo de mudanças
- ✅ Operações atômicas (add/sub/set)
- ✅ Consistência eventual ou imediata
- ✅ Analytics pré-calculados
- ✅ **85.8% de cobertura de testes** (73 testes passando)
- ✅ **Arquitetura modular** (11 módulos separados)

> **v10.0.16+**: Plugin refatorado com melhor performance, arquitetura modular e comportamento corrigido para registros não-existentes.

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
  mode: 'async',  // ou 'sync' para consistência imediata
  enableAnalytics: true
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
await wallets.add('wallet-1', 'balance', 100);
await wallets.sub('wallet-1', 'balance', 50);
await wallets.consolidate('wallet-1', 'balance');

const wallet = await wallets.get('wallet-1');
console.log(wallet.balance); // 50 ✅
```

---

## Como Funciona

### 1. Transações
Toda operação cria uma transação em `{resource}_transactions_{field}`:

```javascript
await wallets.add('wallet-1', 'balance', 100);
// Cria: { operation: 'add', value: 100, applied: false }
```

### 2. Consolidação
Aplica transações pendentes e **ATUALIZA O CAMPO ORIGINAL**:

```javascript
await wallets.consolidate('wallet-1', 'balance');
// 1. Lê transações pendentes
// 2. Aplica reducer (soma por default)
// 3. Atualiza wallet.balance ← CAMPO ORIGINAL!
// 4. Marca transações como applied: true
```

> **⚠️ IMPORTANTE (v10.0.16+)**: O plugin **NÃO cria registros** que não existem. Se você chamar `add()` em um ID que não existe, a transação será criada mas ficará pendente até você criar o registro manualmente. Isso evita problemas com campos obrigatórios que o plugin não conhece.

### 3. Analytics (Opcional)
Cria agregações em `{resource}_analytics_{field}`:
- Métricas: count, sum, avg, min, max
- Períodos: hour, day, month
- Breakdown por operação

---

## API

### Constructor

```javascript
new EventualConsistencyPlugin({
  // Obrigatório
  resources: {
    resourceName: ['field1', 'field2', ...]
  },

  // Opcional
  mode: 'async',                    // 'async' ou 'sync'
  autoConsolidate: true,            // Auto-consolidação periódica
  consolidationInterval: 300,       // Intervalo em segundos (5min)
  consolidationWindow: 24,          // Janela de consolidação em horas

  // Analytics
  enableAnalytics: false,
  analyticsConfig: {
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum', 'avg', 'min', 'max'],
    retentionDays: 365
  },

  // Reducer customizado
  reducer: (transactions) => {
    let total = 0;
    for (const t of transactions) {
      if (t.operation === 'set') total = t.value;
      else if (t.operation === 'add') total += t.value;
      else if (t.operation === 'sub') total -= t.value;
    }
    return total;
  },

  // Timezone
  cohort: {
    timezone: 'America/Sao_Paulo'   // UTC por default
  }
})
```

### Métodos do Resource

**Sempre especifique o field:**

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
```

---

## Exemplos

### Wallet System

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: { wallets: ['balance'] },
  mode: 'sync'  // Consolidação imediata
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

### Multi-Field Account

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: {
    accounts: ['balance', 'points', 'credits']
  },
  mode: 'async'
}));

const accounts = await db.createResource({
  name: 'accounts',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0',
    points: 'number|default:0',
    credits: 'number|default:0'
  }
});

await accounts.add('acc1', 'balance', 500);
await accounts.add('acc1', 'points', 100);
await accounts.sub('acc1', 'credits', 50);

await accounts.consolidate('acc1', 'balance');
await accounts.consolidate('acc1', 'points');
```

### URL Shortener com Analytics

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: {
    urls: ['clicks', 'views', 'shares']
  },
  enableAnalytics: true,
  analyticsConfig: {
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum']
  }
}));

const urls = await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    clicks: 'number|default:0',
    views: 'number|default:0',
    shares: 'number|default:0'
  }
});

// Hook para auto-incrementar
const clicks = await db.createResource({ name: 'clicks', ... });
clicks.addHook('afterInsert', async ({ record }) => {
  await urls.add(record.urlId, 'clicks', 1);
});

// Analytics
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);
const hourlyStats = await plugin.getAnalytics('urls', 'clicks', {
  period: 'hour',
  date: '2025-10-09'
});
```

### Reducer Customizado (Points Only Increase)

```javascript
await db.usePlugin(new EventualConsistencyPlugin({
  resources: { users: ['points'] },
  reducer: (transactions) => {
    let total = 0;
    for (const t of transactions) {
      if (t.operation === 'set') {
        total = Math.max(total, t.value);
      } else if (t.operation === 'add') {
        total += t.value;
      }
      // Ignora 'sub' - pontos nunca diminuem
    }
    return total;
  }
}));
```

---

## Analytics API

### Estrutura

Analytics em `{resource}_analytics_{field}`:

```javascript
{
  id: 'hour-2025-10-09T14',
  period: 'hour',
  cohort: '2025-10-09T14',

  transactionCount: 150,
  totalValue: 5000,
  avgValue: 33.33,
  minValue: -100,
  maxValue: 500,

  operations: {
    add: { count: 120, sum: 6000 },
    sub: { count: 30, sum: -1000 }
  },

  recordCount: 45  // IDs únicos
}
```

### Query

```javascript
const plugin = db.plugins.find(p => p instanceof EventualConsistencyPlugin);

// Stats por hora
const hourly = await plugin.getAnalytics('wallets', 'balance', {
  period: 'hour',
  date: '2025-10-09'
});

// Stats diários
const daily = await plugin.getAnalytics('wallets', 'balance', {
  period: 'day',
  startDate: '2025-10-01',
  endDate: '2025-10-31'
});

// Top records
const top = await plugin.getTopRecords('wallets', 'balance', {
  period: 'day',
  cohort: '2025-10-09',
  limit: 10,
  sortBy: 'transactionCount'  // ou 'totalValue'
});
```

---

## Modo Sync vs Async

### Sync Mode
- Consolidação **imediata**
- Bloqueia até completar
- Garantia de consistência

```javascript
{ mode: 'sync' }

await wallets.add('w1', 'balance', 100);
// ↑ Já consolidou, wallet.balance atualizado
```

### Async Mode (Default)
- Consolidação **eventual**
- Não bloqueia
- Auto-consolidação periódica

```javascript
{ mode: 'async', consolidationInterval: 300 }

await wallets.add('w1', 'balance', 100);
// ↑ Criou transação, mas ainda não consolidou

// Consolidar manualmente se precisar do valor atualizado
await wallets.consolidate('w1', 'balance');
```

---

## Recursos Criados

Para cada field, o plugin cria:

1. **`{resource}_transactions_{field}`** - Log de transações
   - Atributos: id, originalId, field, value, operation, timestamp, cohortDate, cohortHour, applied
   - Partições: byDay, byHour, byMonth

2. **`{resource}_consolidation_locks_{field}`** - Locks distribuídos
   - Previne consolidação duplicada

3. **`{resource}_analytics_{field}`** - Analytics (se enabled)
   - Métricas agregadas por período

---

## Best Practices

### ✅ Use Sync Mode para:
- Saldos bancários
- Inventário
- Qualquer coisa que precise de consistência imediata

### ✅ Use Async Mode para:
- Contadores (views, clicks)
- Métricas (analytics)
- Pontos/gamificação
- Alta escala (milhões de transações)

### ✅ Use Analytics para:
- Dashboards
- Relatórios
- Métricas agregadas
- Evitar scans em milhões de transações

### ✅ Use Hooks para:
- Auto-incrementar contadores
- Trigger consolidações
- Replicar para outros systems

### ⚠️ Cuidados:
- **Batch mode** (`batchTransactions: true`) perde dados se o container crashar
- **Reducers customizados** devem ser pure functions (serializados no metadata)
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

// Aumentar concorrência
{ consolidationConcurrency: 10 }  // default: 5

// Reduzir janela de consolidação
{ consolidationWindow: 12 }  // default: 24h
```

### Analytics faltando
```javascript
// Verificar configuração
console.log(plugin.config.enableAnalytics);

// Verificar resource criado
console.log(db.resources.wallets_analytics_balance);

// Forçar atualização
await plugin.updateAnalytics(resourceName, field);
```

---

## Migration Guide

### De v9.x (API antiga)

```javascript
// ❌ v9.x - NÃO FUNCIONA MAIS
new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance'
})

// ✅ v10.x - API nova
new EventualConsistencyPlugin({
  resources: {
    wallets: ['balance']
  }
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

## 🆕 O Que Mudou (v10.0.16 - v10.0.18)

### Refatoração Completa ✨

O plugin foi **completamente refatorado** de um arquivo monolítico (2558 linhas) para **11 módulos separados**:

```
src/plugins/eventual-consistency/
├── index.js              # Classe principal (341 linhas)
├── config.js            # Configuração (113 linhas)
├── utils.js             # Utilitários (162 linhas)
├── partitions.js        # Partições (40 linhas)
├── transactions.js      # Transações (128 linhas)
├── consolidation.js     # Consolidação (769 linhas)
├── locks.js            # Locks distribuídos (76 linhas)
├── garbage-collection.js # GC (124 linhas)
├── analytics.js         # Analytics (660 linhas)
├── helpers.js           # Helpers add/sub/set (170 linhas)
└── setup.js            # Setup (264 linhas)
```

### Comportamento Corrigido: Registros Não-Existentes

**v10.0.16+** corrige o comportamento quando você tenta incrementar um registro que não existe:

```javascript
// ❌ ANTES (v10.0.15): Plugin tentava criar o registro e falhava
await urls.add('url-inexistente', 'clicks', 1);
// Erro: campos obrigatórios faltando!

// ✅ AGORA (v10.0.16+): Plugin NÃO cria o registro
await urls.add('url-inexistente', 'clicks', 1);
// Transação criada e fica PENDENTE
// Quando você criar o registro, a transação será aplicada!

// Criar o registro mais tarde
await urls.insert({
  id: 'url-inexistente',
  link: 'https://example.com',
  clicks: 0
});

// Consolidar aplica as transações pendentes
await urls.consolidate('url-inexistente', 'clicks');
// Agora clicks = 1 ✅
```

### Melhorias de Performance

1. **Composite Partition Optimization**: Queries 1000x mais rápidas
   - Partition `byOriginalIdAndApplied` combina dois filtros
   - O(1) lookup ao invés de O(n) scan

2. **Arquitetura Modular**: Código mais limpo e manutenível
   - Separação de responsabilidades
   - Mais fácil de testar e debugar

3. **85.8% Code Coverage**: 73 testes cobrindo todos os casos de uso
   - Consolidation, locks, GC, analytics
   - Edge cases e error handling

### Uso Correto (Padrão Recomendado)

```javascript
const plugin = new EventualConsistencyPlugin({
  resources: { urls: ['clicks'] },
  mode: 'sync',
  autoConsolidate: false
});

await db.usePlugin(plugin);

const urls = await db.createResource({
  name: 'urls',
  attributes: {
    id: 'string|required',
    link: 'string|required',
    clicks: 'number|default:0'
  }
});

// ✅ FLUXO CORRETO:

// 1. SEMPRE crie o registro primeiro
await urls.insert({
  id: 'url-123',
  link: 'https://example.com',
  clicks: 0
});

// 2. Incremente normalmente
await urls.add('url-123', 'clicks', 1);
await urls.add('url-123', 'clicks', 1);

// 3. Modo sync consolida automaticamente
const url = await urls.get('url-123');
console.log(url.clicks); // 2 ✅
```

### Fluxo com Hook (URL Shortener)

```javascript
// Resource de clicks separado
const clicks = await db.createResource({
  name: 'clicks',
  attributes: {
    id: 'string|required',
    urlId: 'string|required',
    timestamp: 'string|required'
  }
});

// Hook incrementa automaticamente
clicks.addHook('afterInsert', async (record) => {
  await urls.add(record.urlId, 'clicks', 1);
});

// Uso:
// 1. Crie a URL primeiro
await urls.insert({
  id: 'url-123',
  link: 'https://example.com',
  clicks: 0
});

// 2. Registre clicks (hook incrementa automaticamente)
await clicks.insert({
  id: 'click-1',
  urlId: 'url-123',
  timestamp: new Date().toISOString()
});

// 3. Verifique
const url = await urls.get('url-123');
console.log(url.clicks); // 1 ✅
```

---

## Ver Também

- [Replicator Plugin](./replicator.md) - Replicar para outros bancos
- [Audit Plugin](./audit.md) - Audit trail
- [Cache Plugin](./cache.md) - Cache de valores consolidados
