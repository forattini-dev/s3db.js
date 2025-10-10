# EventualConsistencyPlugin

**Gerencia campos numéricos com histórico de transações e consistência eventual**

Perfeito para contadores, saldos, pontos e outros campos acumuladores que precisam de:
- ✅ Histórico completo de mudanças
- ✅ Operações atômicas (add/sub/set)
- ✅ Consistência eventual ou imediata
- ✅ Analytics pré-calculados
- ✅ 85.8% de cobertura de testes
- ✅ Arquitetura modular (11 módulos separados)

> **v10.0.16+**: Plugin refatorado com melhor performance, estrutura nested e comportamento corrigido para registros não-existentes.

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
Toda operação cria uma transação em `{resource}_transactions_{field}`:

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
Cria agregações em `{resource}_analytics_{field}`:
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
    mode: 'sync',        // 'sync' ou 'async' (default: 'async')
    auto: true,          // Auto-consolidação (default: true)
    interval: 300,       // Intervalo em segundos (default: 300)
    window: 24,          // Janela em horas (default: 24)
    concurrency: 5       // Consolidações paralelas (default: 5)
  },

  // Analytics (opcional)
  analytics: {
    enabled: false,      // Habilitar analytics (default: false)
    periods: ['hour', 'day', 'month'],
    metrics: ['count', 'sum', 'avg', 'min', 'max']
  },

  // Opções avançadas
  locks: { timeout: 300 },
  garbageCollection: { enabled: true, interval: 86400, retention: 30 },
  checkpoints: { enabled: true, strategy: 'hourly', retention: 90 },
  cohort: { timezone: 'UTC' },  // Default: UTC (ou TZ env var)
  verbose: false
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

// Stats por período
await plugin.getAnalytics('resource', 'field', { period: 'hour', date: '2025-10-09' });
await plugin.getLastNDays('resource', 'field', 7);
await plugin.getMonthByDay('resource', 'field', '2025-10');
await plugin.getDayByHour('resource', 'field', '2025-10-09');
await plugin.getYearByMonth('resource', 'field', 2025);

// Top records
await plugin.getTopRecords('resource', 'field', {
  period: 'day',
  cohort: '2025-10-09',
  limit: 10,
  sortBy: 'transactionCount'  // ou 'totalValue'
});
```

**Estrutura dos Analytics:**
```javascript
{
  id: 'hour-2025-10-09T14',
  period: 'hour',
  cohort: '2025-10-09T14',
  transactionCount: 150,
  totalValue: 5000,
  avgValue: 33.33,
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

1. **`{resource}_transactions_{field}`** - Log de transações
   - Partições: byDay, byMonth, byOriginalIdAndApplied (otimizado)

2. **`{resource}_consolidation_locks_{field}`** - Locks distribuídos

3. **`{resource}_analytics_{field}`** - Analytics (se habilitado)

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

// Aumentar concorrência
{ consolidation: { concurrency: 10 } }  // default: 5

// Reduzir janela
{ consolidation: { window: 12 } }  // default: 24h
```

### Analytics faltando
```javascript
// Verificar configuração
console.log(plugin.config.enableAnalytics);

// Verificar resource criado
console.log(db.resources.wallets_analytics_balance);
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

## Ver Também

- [Replicator Plugin](./replicator.md) - Replicar para outros bancos
- [Audit Plugin](./audit.md) - Audit trail
- [Cache Plugin](./cache.md) - Cache de valores consolidados
