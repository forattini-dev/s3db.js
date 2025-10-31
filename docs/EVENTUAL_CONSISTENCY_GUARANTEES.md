# EventualConsistencyPlugin - Garantias de Consistência 💯

## 🎯 Como Garantir Consistência SEMPRE

O EventualConsistencyPlugin do s3db.js foi projetado com múltiplas camadas de proteção para garantir **consistência eventual forte**. Este documento explica todos os mecanismos e melhores práticas.

---

## 📋 Índice

1. [Garantias Fundamentais](#garantias-fundamentais)
2. [Mecanismos de Proteção](#mecanismos-de-proteção)
3. [Melhores Práticas](#melhores-práticas)
4. [Configurações Críticas](#configurações-críticas)
5. [Monitoramento e Debugging](#monitoramento-e-debugging)
6. [Cenários de Falha e Recuperação](#cenários-de-falha-e-recuperação)
7. [Checklist de Produção](#checklist-de-produção)

---

## 🛡️ Garantias Fundamentais

### 1. **Atomicidade de Transações**
Cada operação gera uma transação atômica que é:
- ✅ **Durável**: Persistida no S3 imediatamente
- ✅ **Ordenada**: Timestamp preciso (milissegundos)
- ✅ **Rastreável**: ID único + metadata completa
- ✅ **Imutável**: Nunca modificada, apenas aplicada

### 2. **Idempotência Garantida**
- Transações têm ID único
- Consolidação detecta duplicatas automaticamente
- Aplicar a mesma transação múltiplas vezes = mesmo resultado

### 3. **Eventual Consistency com Timing Configurável**
- **Default**: 30 segundos
- **Produção recomendado**: 5-10 segundos
- **Alta performance**: 1-2 segundos (requer mais recursos)

### 4. **Proteção contra Race Conditions**
- Sistema de locks distribuídos
- Consolidação por record ID (um por vez)
- Cleanup automático de locks órfãos

---

## 🔒 Mecanismos de Proteção

### 1. Distributed Locking System

```javascript
// Arquivo: src/plugins/eventual-consistency/locks.js

// Cada record é consolidado com lock exclusivo
const lockId = `${config.resource}-${config.field}-${recordId}`;

// Timeout automático previne deadlocks
lockTimeout: 300 // 5 minutos (padrão)

// Cleanup de locks órfãos
cleanupStaleLocks() // Roda periodicamente
```

**Como funciona:**
1. Antes de consolidar, tenta adquirir lock via `insert(lockId)`
2. Se lock existe, outro worker está processando → skip
3. Após consolidação, lock é removido
4. Se worker crasha, lock expira automaticamente após `lockTimeout`

**Configuração recomendada:**
```javascript
{
  lockTimeout: 300, // 5 minutos para operações normais
  // Para operações muito pesadas:
  lockTimeout: 900  // 15 minutos
}
```

### 2. Partition-Based Isolation

```javascript
// Transações são particionadas por hora
partition: `cohortHour=${cohortHour}`

// Consolidação processa apenas últimas N horas
hoursToCheck: config.consolidationWindow || 24
```

**Benefícios:**
- ✅ Queries O(1) ao invés de O(n)
- ✅ Isolamento temporal (transações antigas não interferem)
- ✅ Garbage collection eficiente

### 3. Transaction Ordering

```javascript
// Transactions são sempre ordenadas por timestamp
transactions.sort((a, b) => a.timestamp - b.timestamp);

// Aplicadas sequencialmente
for (const tx of transactions) {
  await applyTransaction(tx);
}
```

**Garantia:** Mesmo com race conditions, ordem temporal é preservada.

### 4. Retry com Exponential Backoff

```javascript
// Em consolidation.js
const MAX_RETRIES = 3;
const BACKOFF_MS = 1000;

for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    await consolidateRecord(recordId);
    break;
  } catch (error) {
    if (attempt < MAX_RETRIES - 1) {
      await sleep(BACKOFF_MS * Math.pow(2, attempt));
    }
  }
}
```

**Protege contra:**
- Falhas temporárias de rede
- S3 rate limiting
- Contenção de recursos

---

## 🎯 Melhores Práticas

### 1. **Configuração de Produção**

```javascript
const db = new Database({ /* ... */ });

await db.registerPlugin(new EventualConsistencyPlugin({
  resource: 'users',
  field: 'balance',

  // ✅ CRÍTICO: Configurações de produção
  consolidationInterval: 5,      // 5 segundos (não 30!)
  consolidationWindow: 48,        // 48 horas de histórico
  lockTimeout: 300,               // 5 minutos
  maxRetries: 5,                  // Mais retries em prod

  // ✅ RECOMENDADO: Monitoring
  verbose: false,                 // false em prod (use logs externos)
  enableMetrics: true,            // coleta métricas

  // ✅ PERFORMANCE: Batch processing
  batchSize: 100,                 // processa 100 records por vez
  concurrency: 10,                // 10 records em paralelo

  // ✅ CLEANUP: Garbage collection
  retentionDays: 30,              // mantém transações por 30 dias
  cleanupInterval: 3600,          // cleanup a cada hora
}));
```

### 2. **Field Handlers Robustos**

```javascript
const fieldHandlers = {
  balance: {
    // ✅ SEMPRE retorne número (nunca undefined/null)
    get: (record) => record?.balance ?? 0,

    // ✅ SEMPRE valide entrada
    set: (record, value) => {
      const numValue = Number(value);
      if (!isFinite(numValue)) {
        throw new Error(`Invalid balance value: ${value}`);
      }
      record.balance = Math.max(0, numValue); // nunca negativo
    },

    // ✅ SEMPRE retorne número como default
    default: () => 0,

    // ✅ OPERAÇÕES devem ser puras (sem side effects)
    increment: (current, delta) => {
      const result = (current ?? 0) + (delta ?? 0);
      return Math.max(0, result); // nunca negativo
    },

    decrement: (current, delta) => {
      const result = (current ?? 0) - (delta ?? 0);
      return Math.max(0, result); // nunca negativo
    }
  }
};
```

**Regras de Ouro:**
1. **Sempre retorne um valor** (nunca undefined/null)
2. **Valide todas as entradas** (type checking + range checking)
3. **Operações devem ser puras** (mesma entrada = mesma saída)
4. **Use valores default seguros** (0 para números, [] para arrays)

### 3. **Transações Seguras**

```javascript
// ✅ BOM: Operações atômicas
await resource.update(userId, {
  balance: { $increment: 100 }  // EventualConsistency processa
});

// ✅ BOM: Múltiplos campos
await resource.update(userId, {
  balance: { $increment: 100 },
  points: { $increment: 10 }
});

// ❌ RUIM: Modificar diretamente sem plugin
const user = await resource.get(userId);
user.balance += 100;  // RACE CONDITION!
await resource.update(userId, user);

// ❌ RUIM: Read-modify-write manual
const user = await resource.get(userId);
const newBalance = user.balance + 100;
await resource.update(userId, { balance: newBalance });  // RACE!
```

### 4. **Consolidação Forçada (quando necessário)**

```javascript
// Forçar consolidação imediata de um record
await plugin.consolidateRecord('user-123');

// Forçar consolidação de todos os pending
await plugin.runConsolidationNow();

// ⚠️ Use com moderação! Consolidação automática é mais eficiente
```

**Quando usar:**
- Antes de operações críticas (pagamentos, transferências)
- Em testes (garantir estado consistente)
- Debugging de problemas de consistência
- Migrations ou manutenção

---

## ⚙️ Configurações Críticas

### Tabela de Configurações por Ambiente

| Config | Dev | Staging | Produção | High-Volume |
|--------|-----|---------|----------|-------------|
| `consolidationInterval` | 30s | 10s | 5s | 2s |
| `consolidationWindow` | 24h | 48h | 48h | 72h |
| `lockTimeout` | 300s | 300s | 300s | 600s |
| `maxRetries` | 3 | 5 | 5 | 10 |
| `batchSize` | 50 | 100 | 100 | 200 |
| `concurrency` | 5 | 10 | 10 | 20 |
| `retentionDays` | 7 | 30 | 90 | 365 |
| `cleanupInterval` | 7200s | 3600s | 3600s | 1800s |
| `verbose` | true | false | false | false |

### Cálculo de Recursos

**Fórmula para estimar carga:**
```javascript
// Transações por segundo
const txPerSecond = writesPerSecond * fieldsWithEC;

// Records consolidados por intervalo
const recordsPerCycle = txPerSecond * consolidationInterval;

// Throughput necessário
const throughput = recordsPerCycle / consolidationInterval;

// Exemplo: 1000 writes/s, 2 fields EC, 5s interval
// = 2000 tx/s * 5s = 10,000 records per cycle
// = 10,000 / 5 = 2,000 records/s throughput needed
```

**Recursos recomendados:**
- **CPU**: 2 cores por 10,000 tx/s
- **Memory**: 512MB por 100,000 records em cache
- **S3 Ops**: ~3-5 ops por consolidação (query + update + cleanup)

---

## 📊 Monitoramento e Debugging

### 1. Métricas Essenciais

```javascript
// Coletar métricas via plugin
const metrics = await plugin.getMetrics();

console.log({
  pendingTransactions: metrics.pending,
  consolidatedLast24h: metrics.consolidated,
  averageLatency: metrics.avgLatency,
  failureRate: metrics.failures / metrics.total,

  // ⚠️ ALERTAS se:
  pendingTooHigh: metrics.pending > 10000,
  latencyTooHigh: metrics.avgLatency > 60000, // > 1 min
  failureRateTooHigh: (metrics.failures / metrics.total) > 0.01 // > 1%
});
```

### 2. Debugging de Consistência

```javascript
// Verificar estado de um record
const debug = await plugin.debugRecord('user-123');

console.log({
  currentValue: debug.value,
  pendingTransactions: debug.pending,
  lastConsolidation: debug.lastConsolidated,
  locks: debug.locks,

  // Detectar problemas
  isStale: debug.pending.length > 100,
  isLocked: debug.locks.length > 0,
  needsConsolidation: Date.now() - debug.lastConsolidated > 60000
});

// Se encontrar problema, forçar consolidação
if (debug.pending.length > 0) {
  await plugin.consolidateRecord('user-123');
}
```

### 3. Logs Estruturados

```javascript
// Habilitar verbose em dev
verbose: true

// Em produção, use sistema de logs externo
const winston = require('winston');

await db.registerPlugin(new EventualConsistencyPlugin({
  // ... config
  onTransaction: (tx) => {
    winston.info('EC:Transaction', {
      recordId: tx.recordId,
      field: tx.field,
      operation: tx.operation,
      value: tx.value,
      timestamp: tx.timestamp
    });
  },

  onConsolidation: (recordId, result) => {
    winston.info('EC:Consolidation', {
      recordId,
      transactionsApplied: result.count,
      duration: result.duration,
      finalValue: result.value
    });
  },

  onError: (error, context) => {
    winston.error('EC:Error', {
      error: error.message,
      recordId: context.recordId,
      operation: context.operation,
      stack: error.stack
    });
  }
}));
```

---

## 🚨 Cenários de Falha e Recuperação

### Cenário 1: Worker Crash Durante Consolidação

**Problema:**
Worker adquire lock → crasha antes de concluir → lock fica órfão

**Proteção:**
```javascript
// lockTimeout garante que lock expira
lockTimeout: 300 // 5 minutos

// Cleanup automático de locks órfãos
cleanupInterval: 3600 // toda hora
```

**Recuperação:**
- Aguardar `lockTimeout` segundos
- Próximo worker pegará o record automaticamente
- Transações não são perdidas (persistidas no S3)

### Cenário 2: S3 Rate Limiting

**Problema:**
Muitas operações simultâneas → S3 retorna 503 SlowDown

**Proteção:**
```javascript
maxRetries: 5,
retryBackoff: 'exponential',
concurrency: 10 // limita operações paralelas
```

**Recuperação:**
- Retry automático com backoff
- Se falhar após 5 retries, transação fica pending
- Próxima consolidação tentará novamente

### Cenário 3: Transações Acumuladas (Backlog)

**Problema:**
Consolidação não acompanha volume de writes → backlog cresce

**Detecção:**
```javascript
const pending = await plugin.getPendingCount();
if (pending > 10000) {
  console.warn('BACKLOG DETECTED!', pending);
}
```

**Recuperação:**
```javascript
// Opção 1: Reduzir interval temporariamente
consolidationInterval: 2 // de 5s para 2s

// Opção 2: Aumentar concurrency
concurrency: 20 // de 10 para 20

// Opção 3: Rodar consolidação extra
await plugin.runConsolidationNow();

// Opção 4: Escalar horizontalmente (mais workers)
// Cada worker processa diferentes partições
```

### Cenário 4: Valores Inconsistentes

**Problema:**
Valor final não bate com soma das transações

**Debugging:**
```javascript
// 1. Verificar todas as transações
const txs = await plugin.getTransactions('user-123');
const expectedSum = txs.reduce((sum, tx) =>
  tx.operation === 'increment' ? sum + tx.value : sum - tx.value,
  0
);

// 2. Comparar com valor atual
const record = await resource.get('user-123');
const diff = record.balance - expectedSum;

if (diff !== 0) {
  console.error('INCONSISTENCY!', {
    expected: expectedSum,
    actual: record.balance,
    diff
  });

  // 3. Forçar recalculação
  await plugin.recalculate('user-123', { force: true });
}
```

**Causas comuns:**
1. Field handler incorreto (não retorna default)
2. Transação duplicada aplicada
3. Modificação direta do record (bypass do plugin)

---

## ✅ Checklist de Produção

### Antes de Deploy

- [ ] `consolidationInterval` ≤ 10 segundos
- [ ] `lockTimeout` configurado (recomendado: 300s)
- [ ] `maxRetries` ≥ 5
- [ ] `retentionDays` adequado para compliance
- [ ] Field handlers testados com valores edge case (null, undefined, 0, negativo)
- [ ] Field handlers são **puros** (sem side effects)
- [ ] Métricas de monitoring configuradas
- [ ] Alertas configurados (pending > threshold, latency > threshold)
- [ ] Logs estruturados habilitados
- [ ] Testes de carga executados (1000+ tx/s)
- [ ] Plano de rollback definido

### Em Produção

- [ ] Monitorar `pendingTransactions` diariamente
- [ ] Monitorar `consolidationLatency` (deve ser < 2x interval)
- [ ] Monitorar `failureRate` (deve ser < 1%)
- [ ] Verificar garbage collection (transações antigas sendo removidas)
- [ ] Verificar locks órfãos (devem ser raros)
- [ ] Backup regular das transactions (para audit trail)
- [ ] Testar recovery procedures mensalmente

### Troubleshooting Rápido

```bash
# 1. Verificar pending transactions
curl http://api/admin/ec/metrics

# 2. Verificar locks ativos
curl http://api/admin/ec/locks

# 3. Forçar consolidação de record específico
curl -X POST http://api/admin/ec/consolidate/user-123

# 4. Limpar locks órfãos manualmente
curl -X POST http://api/admin/ec/cleanup-locks

# 5. Recalcular valor de record
curl -X POST http://api/admin/ec/recalculate/user-123
```

---

## 🎓 Princípios Fundamentais

### 1. **Never Modify Directly**
```javascript
// ❌ NUNCA
user.balance += 100;
await resource.update(userId, user);

// ✅ SEMPRE
await resource.update(userId, {
  balance: { $increment: 100 }
});
```

### 2. **Trust the Process**
- Consolidação automática funciona
- Não force consolidação desnecessariamente
- Eventual consistency é eventual, não instantânea

### 3. **Idempotency is King**
- Toda operação deve ser repetível
- Field handlers devem ser determinísticos
- Mesma transação aplicada 2x = mesmo resultado

### 4. **Monitor, Don't Guess**
- Use métricas para decisões
- Logs estruturados para debugging
- Alertas proativos para problemas

---

## 📚 Recursos Adicionais

- **Testes**: `tests/plugins/eventual-consistency-*.test.js` (122 suites, 2700+ testes)
- **Exemplos**: `docs/examples/e52-eventual-consistency-analytics.js`
- **Source**: `src/plugins/eventual-consistency/`
- **Benchmarks**: `docs/benchmarks/eventual-consistency-performance.md`

---

## 🏆 Resumo: Como Garantir Consistência SEMPRE

1. **Configure adequadamente** (interval ≤ 10s em prod)
2. **Field handlers robustos** (sempre retorne valores, valide entrada)
3. **Monitore ativamente** (pending, latency, failures)
4. **Nunca bypass o plugin** (sempre use $increment/$decrement)
5. **Teste extensivamente** (carga, race conditions, failures)
6. **Escale horizontalmente** quando necessário (múltiplos workers)

**Seguindo estas práticas, você terá consistência eventual forte com garantias matemáticas! 💯**
