# ReconPlugin - Uptime 20s Checks + 1-Minute Aggregation

**Arquitetura de monitoramento com alta frequência e agregação eficiente**

---

## 🎯 Visão Geral

O uptime behavior usa uma estratégia de **checks frequentes (20s) com agregação por minuto**:

```
Check (20s) → Check (20s) → Check (20s) → Aggregate (60s) → Persist
    ↓             ↓             ↓              ↓
  Buffer        Buffer        Buffer      Calculate Avg    Storage
                                           & Persist
```

**Benefícios**:
- ✅ **Alta granularidade**: 3 samples por minuto
- ✅ **Detecção rápida**: Downtime detectado em 60s (3 falhas)
- ✅ **Storage eficiente**: Só persiste dados agregados
- ✅ **Reduz ruído**: Média de 3 samples é mais confiável
- ✅ **Métricas ricas**: Min/Max/Avg latency por minuto

---

## ⏱️ Configuração

```javascript
const plugin = new ReconPlugin({
  behaviors: {
    uptime: {
      enabled: true,
      checkInterval: 20000,         // ⏰ Check a cada 20 segundos
      aggregationInterval: 60000,   // 📊 Agrega a cada 60 segundos
      methods: ['ping', 'http'],    // Métodos de health check
      alertOnDowntime: true,
      downtimeThreshold: 3,         // 3 falhas consecutivas = down (60s total)
      timeout: 5000,
      retainHistory: 30 * 24 * 60 * 60 * 1000,  // 30 dias
      persistRawChecks: false       // ⚠️ Não persistir checks brutos (só agregados)
    }
  }
});
```

---

## 📊 Como Funciona

### 1. **Checks a cada 20 segundos** (In-Memory Buffer)

```javascript
// t=0s: First check
{
  timestamp: "2025-01-01T12:00:00.000Z",
  status: "up",
  methods: {
    ping: { status: "ok", latency: 15.2, duration: 20 },
    http: { status: "ok", statusCode: 200, duration: 145 }
  },
  latency: { ping: 15.2, http: 145 }
}

// t=20s: Second check
{
  timestamp: "2025-01-01T12:00:20.000Z",
  status: "up",
  methods: {
    ping: { status: "ok", latency: 18.5, duration: 22 },
    http: { status: "ok", statusCode: 200, duration: 132 }
  },
  latency: { ping: 18.5, http: 132 }
}

// t=40s: Third check
{
  timestamp: "2025-01-01T12:00:40.000Z",
  status: "up",
  methods: {
    ping: { status: "ok", latency: 16.8, duration: 21 },
    http: { status: "ok", statusCode: 200, duration: 151 }
  },
  latency: { ping: 16.8, http: 151 }
}
```

**Buffer**: Armazena os 3 checks em memória (`minuteBuffer`)

---

### 2. **Agregação a cada 60 segundos** (Persist Minute Cohort)

```javascript
// t=60s: Aggregate and persist
{
  minuteCohort: "2025-01-01T12:00",  // Minute precision
  timestamp: "2025-01-01T12:00:00.000Z",  // First check timestamp
  sampleCount: 3,
  successCount: 3,
  failCount: 0,
  uptimePercent: "100.00",
  avgLatencies: {
    ping: {
      avg: "16.83",   // (15.2 + 18.5 + 16.8) / 3
      min: "15.20",
      max: "18.50",
      samples: 3
    },
    http: {
      avg: "142.67",  // (145 + 132 + 151) / 3
      min: "132.00",
      max: "151.00",
      samples: 3
    }
  },
  overallStatus: "up"  // 100% uptime = up
}
```

**Persistência**:
```
plugin=recon/uptime/example.com/cohorts/2025-01-01/12-00.json
```

---

## 📁 Storage Structure

```
plugin=recon/uptime/
└── example.com/
    ├── status.json                      # Current status (updated every minute)
    ├── transitions/
    │   ├── 2025-01-01T12-30-15-000Z.json
    │   └── 2025-01-01T12-45-20-000Z.json
    ├── cohorts/                         # ✨ Minute-aggregated data (NEW!)
    │   ├── 2025-01-01/
    │   │   ├── 12-00.json              # 12:00 minute aggregate
    │   │   ├── 12-01.json              # 12:01 minute aggregate
    │   │   ├── 12-02.json
    │   │   └── ...
    │   ├── 2025-01-02/
    │   │   └── ...
    │   └── ...
    ├── scans/                           # Links to reports
    │   └── 2025-01-01T12-34-00-000Z.json
    └── raw/                             # ⚠️ Only if persistRawChecks=true
        ├── 2025-01-01T12-00-00-000Z.json
        ├── 2025-01-01T12-00-20-000Z.json
        └── 2025-01-01T12-00-40-000Z.json
```

---

## 📈 Análise Time-Series

### **Query por minuto** (granularidade)
```javascript
const storage = plugin.getStorage();
const minuteKey = storage.getPluginKey(null, 'uptime', 'example.com', 'cohorts', '2025-01-01', '12-34.json');
const minuteData = await storage.get(minuteKey);

console.log(`Uptime at 12:34: ${minuteData.uptimePercent}%`);
console.log(`Avg ping latency: ${minuteData.avgLatencies.ping.avg}ms`);
```

### **Query por hora** (agregação)
```javascript
// Get all minutes in an hour
const hourData = [];
for (let minute = 0; minute < 60; minute++) {
  const mm = minute.toString().padStart(2, '0');
  const key = storage.getPluginKey(null, 'uptime', 'example.com', 'cohorts', '2025-01-01', `12-${mm}.json`);

  try {
    const data = await storage.get(key);
    hourData.push(data);
  } catch (error) {
    // Minute not available (monitoring started mid-hour)
  }
}

// Calculate hour aggregate
const hourUptime = (hourData.reduce((sum, m) => sum + parseFloat(m.uptimePercent), 0) / hourData.length).toFixed(2);
console.log(`Hour uptime (12:00-13:00): ${hourUptime}%`);
```

### **Query por dia** (agregação de horas)
```javascript
// Get all cohorts for a day
const dayKeys = await storage.list(storage.getPluginKey(null, 'uptime', 'example.com', 'cohorts', '2025-01-01'));
const dayData = await Promise.all(dayKeys.map(key => storage.get(key)));

// Calculate day aggregate
const dayUptime = (dayData.reduce((sum, m) => sum + parseFloat(m.uptimePercent), 0) / dayData.length).toFixed(2);
console.log(`Day uptime (2025-01-01): ${dayUptime}%`);
```

---

## 🔍 Detecção de Downtime

### **Threshold Logic**
```
Check 1 (t=0s):   ❌ down → consecutiveFails = 1
Check 2 (t=20s):  ❌ down → consecutiveFails = 2
Check 3 (t=40s):  ❌ down → consecutiveFails = 3 → 🚨 DOWNTIME DETECTED!
```

**Emite evento**: `uptime:transition` (from 'up' to 'down')

```javascript
plugin.on('uptime:transition', (transition) => {
  console.log(`${transition.host}: ${transition.from} → ${transition.to}`);
  // transition.to === 'down' → Target is DOWN!
});
```

### **Recovery Detection**
```
Check 1 (t=60s):  ✅ up → consecutiveSuccess = 1
Check 2 (t=80s):  ✅ up → consecutiveSuccess = 2
Check 3 (t=100s): ✅ up → consecutiveSuccess = 3 → 🟢 RECOVERY!
```

**Emite evento**: `uptime:transition` (from 'down' to 'up')

---

## 📊 Métricas Calculadas

### **Por Minuto** (Minute Cohort)
- `sampleCount`: Número de checks (esperado: 3)
- `successCount`: Checks bem-sucedidos
- `failCount`: Checks falhados
- `uptimePercent`: (successCount / sampleCount) * 100
- `avgLatencies`: Latência avg/min/max por método
- `overallStatus`: 'up' se uptimePercent >= 66.67% (2/3 samples)

### **Global** (Status Atual)
- `totalChecks`: Total de checks realizados
- `successfulChecks`: Total de sucessos
- `failedChecks`: Total de falhas
- `uptimePercentage`: (successfulChecks / totalChecks) * 100
- `consecutiveFails`: Falhas consecutivas atuais
- `lastCheck`: Último check realizado
- `lastUp`: Última vez que estava up
- `lastDown`: Última vez que ficou down

---

## 💾 Storage Efficiency

### **Comparação: Raw vs Aggregated**

| Mode | Checks/Dia | Records/Dia | Storage/Mês (100 targets) |
|------|------------|-------------|---------------------------|
| **Raw 20s** | 4.320 | 432.000 | ~2GB |
| **Aggregated 60s** ⭐ | 1.440 | 144.000 | ~500MB |
| **Reduction** | -67% | -67% | **-75%** |

**Configuração**:
```javascript
{
  persistRawChecks: false  // ✅ Só agregados (padrão)
  // persistRawChecks: true   // ❌ Persiste tudo (debug only)
}
```

---

## 🎯 Use Cases

### 1. **SLA Monitoring** (99.9% uptime)
```javascript
// Query last 30 days
const last30Days = generateDateRange(30);
const uptimeData = [];

for (const day of last30Days) {
  const dayKeys = await storage.list(
    storage.getPluginKey(null, 'uptime', 'api.example.com', 'cohorts', day)
  );
  const dayMinutes = await Promise.all(dayKeys.map(k => storage.get(k)));

  const dayUptime = dayMinutes.reduce((sum, m) => sum + parseFloat(m.uptimePercent), 0) / dayMinutes.length;
  uptimeData.push({ day, uptime: dayUptime });
}

const avgUptime = uptimeData.reduce((sum, d) => sum + d.uptime, 0) / uptimeData.length;
console.log(`30-day SLA: ${avgUptime.toFixed(2)}% (target: 99.9%)`);
```

### 2. **Latency Monitoring** (performance degradation)
```javascript
// Detect latency spikes
const hourKeys = await storage.list(
  storage.getPluginKey(null, 'uptime', 'api.example.com', 'cohorts', '2025-01-01')
);

for (const key of hourKeys) {
  const minute = await storage.get(key);
  const pingAvg = parseFloat(minute.avgLatencies.ping.avg);

  if (pingAvg > 50) {  // Threshold: 50ms
    console.warn(`⚠️ High latency at ${minute.minuteCohort}: ${pingAvg}ms`);
  }
}
```

### 3. **Downtime Analysis** (root cause)
```javascript
// Find downtime periods
const transitions = await storage.list(
  storage.getPluginKey(null, 'uptime', 'example.com', 'transitions')
);

const downtimeEvents = [];
for (const key of transitions) {
  const transition = await storage.get(key);

  if (transition.to === 'down') {
    // Find corresponding minute cohort
    const minuteCohort = transition.timestamp.substring(0, 16); // "2025-01-01T12:34"
    const day = minuteCohort.substring(0, 10);
    const hourMinute = minuteCohort.substring(11).replace(':', '-');

    const cohortKey = storage.getPluginKey(null, 'uptime', transition.host, 'cohorts', day, `${hourMinute}.json`);
    const cohortData = await storage.get(cohortKey);

    downtimeEvents.push({
      timestamp: transition.timestamp,
      minuteUptime: cohortData.uptimePercent,
      failedChecks: cohortData.failCount,
      latencies: cohortData.avgLatencies
    });
  }
}

console.log(`Total downtime events: ${downtimeEvents.length}`);
```

---

## ⚡ Performance

### **Check Execution** (20s interval)
- Concurrent methods: ping + http executam em paralelo
- Timeout: 5s por método
- Buffer em memória (zero disk I/O)

### **Aggregation** (60s interval)
- Processa 3 samples
- Calcula avg/min/max
- 1 write para storage (minute cohort)
- Limpa buffer

### **Memory Usage**
- Buffer: ~3 checks × 1KB = 3KB por target
- 100 targets: 300KB RAM
- Limpa a cada minuto (sem memory leak)

---

## 🔧 Troubleshooting

### **Checks não estão sendo executados**
```javascript
// Verificar se intervals estão ativos
const checkIntervals = plugin.uptimeBehavior.checkIntervals;
const aggregationIntervals = plugin.uptimeBehavior.aggregationIntervals;

console.log(`Check intervals: ${checkIntervals.size}`);
console.log(`Aggregation intervals: ${aggregationIntervals.size}`);
```

### **Minute cohorts não estão sendo persistidos**
```javascript
// Verificar buffer
const buffer = plugin.uptimeBehavior.minuteBuffer.get('example.com');
console.log(`Buffer size: ${buffer.length}`);  // Esperado: 0-3

// Verificar última agregação
const lastCohort = await storage.get(
  storage.getPluginKey(null, 'uptime', 'example.com', 'cohorts', '2025-01-01', '12-34.json')
);
console.log(lastCohort);
```

### **Storage crescendo muito**
```javascript
// Habilitar pruning
{
  retainHistory: 7 * 24 * 60 * 60 * 1000  // Reduzir para 7 dias
}

// Ou desabilitar raw checks (se habilitado por engano)
{
  persistRawChecks: false  // ✅ Só agregados
}
```

---

## 📚 Related Docs

- [Uptime Behavior Overview](./recon-uptime-behavior.md)
- [Storage Architecture](./recon-storage-insights.md)
- [Architecture Fixes](./recon-architecture-fixes.md)

---

**Status**: ✅ Implementado e funcional
