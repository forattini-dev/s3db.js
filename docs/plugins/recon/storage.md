# Recon Plugin - Storage Architecture & Insights Generation

**Como salvamos TODAS as informações de CADA ferramenta e como agregamos nas resources para tirar insights**

---

## 📊 Visão Geral

O ReconPlugin implementa uma arquitetura de armazenamento em **3 camadas** que captura dados em múltiplos níveis de granularidade:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: RAW ARTIFACTS                   │
│                  (Per-Tool, Per-Execution)                  │
├─────────────────────────────────────────────────────────────┤
│         plugin=recon/reports/<host>/stages/<timestamp>/     │
│                      tools/<tool>.json                      │
│                                                             │
│  Cada ferramenta gera um arquivo JSON individual com:      │
│  - Saída completa (stdout/stderr)                          │
│  - Status de execução (ok/error/unavailable)               │
│  - Métricas específicas da ferramenta                      │
│  - Timestamp de execução                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  LAYER 2: AGGREGATED STAGES                 │
│                   (Combined Tool Results)                   │
├─────────────────────────────────────────────────────────────┤
│         plugin=recon/reports/<host>/stages/<timestamp>/     │
│                   aggregated/<stage>.json                   │
│                                                             │
│  Resultados combinados de múltiplas ferramentas:           │
│  - ports.json = nmap + masscan (portas únicas)             │
│  - subdomains.json = amass + subfinder + crtsh (únicos)    │
│  - vulnerabilities.json = nikto + wpscan + droopescan       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  LAYER 3: DATABASE RESOURCES                │
│                   (Queryable, Indexed Data)                 │
├─────────────────────────────────────────────────────────────┤
│  7 Resources para análise e insights:                      │
│  - plg_recon_hosts (fingerprints, summaries)               │
│  - plg_recon_reports (scan history)                        │
│  - plg_recon_stages (per-stage metadata)                   │
│  - plg_recon_diffs (change detection)                      │
│  - plg_recon_subdomains (discovered subdomains)            │
│  - plg_recon_paths (discovered endpoints)                  │
│  - plg_recon_targets (dynamic target management)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 LAYER 1: Per-Tool Raw Artifacts

### Estrutura de Armazenamento

Cada ferramenta salva seu output em um arquivo JSON individual:

```
plugin=recon/reports/example.com/stages/2025-01-01T06-00-00-000Z/
└── tools/
    ├── nmap.json           # Scan de portas do nmap
    ├── masscan.json        # Scan de portas do masscan
    ├── amass.json          # Enumeração de subdomínios do amass
    ├── subfinder.json      # Enumeração de subdomínios do subfinder
    ├── assetfinder.json    # Enumeração de subdomínios do assetfinder
    ├── crtsh.json          # Subdomínios do certificate transparency
    ├── ffuf.json           # Directory fuzzing do ffuf
    ├── feroxbuster.json    # Directory fuzzing do feroxbuster
    ├── gobuster.json       # Directory fuzzing do gobuster
    ├── nikto.json          # Vulnerability scan do nikto
    ├── wpscan.json         # WordPress scan do wpscan
    ├── droopescan.json     # Drupal/Joomla scan
    ├── openssl.json        # TLS audit do openssl
    ├── sslyze.json         # TLS audit do sslyze
    ├── testssl.json        # TLS audit do testssl.sh
    ├── whatweb.json        # Technology fingerprinting
    ├── aquatone.json       # Screenshot capture
    ├── eyewitness.json     # Screenshot capture
    ├── theharvester.json   # OSINT data
    └── recon-ng.json       # OSINT framework
```

### Exemplo: nmap.json

```json
{
  "status": "ok",
  "tool": "nmap",
  "executedAt": "2025-01-01T06:00:05.123Z",
  "executionTimeMs": 5432,
  "summary": {
    "openPorts": [
      {
        "port": "22/tcp",
        "service": "ssh",
        "detail": "OpenSSH 8.2p1 Ubuntu"
      },
      {
        "port": "80/tcp",
        "service": "http",
        "detail": "nginx 1.18.0"
      },
      {
        "port": "443/tcp",
        "service": "https",
        "detail": "nginx 1.18.0"
      }
    ],
    "detectedServices": [
      "ssh OpenSSH 8.2p1 Ubuntu",
      "http nginx 1.18.0",
      "https nginx 1.18.0"
    ]
  },
  "raw": "Starting Nmap 7.80...\nNmap scan report for example.com (93.184.216.34)...",
  "command": "nmap -Pn --top-ports 100 -T4 -sV example.com"
}
```

### Exemplo: amass.json

```json
{
  "status": "ok",
  "tool": "amass",
  "executedAt": "2025-01-01T06:00:15.456Z",
  "executionTimeMs": 45000,
  "count": 127,
  "sample": [
    "api.example.com",
    "cdn.example.com",
    "staging.example.com",
    "admin.example.com",
    "mail.example.com",
    "www.example.com",
    "blog.example.com",
    "shop.example.com",
    "support.example.com",
    "dev.example.com"
  ],
  "raw": "api.example.com\ncdn.example.com\nstaging.example.com..."
}
```

### Exemplo: nikto.json

```json
{
  "status": "ok",
  "tool": "nikto",
  "executedAt": "2025-01-01T06:01:30.789Z",
  "executionTimeMs": 60000,
  "raw": "- Nikto v2.1.6\n----------- Scan started at Thu Jan 1 06:01:30 2025\n+ Server: nginx/1.18.0\n+ The X-Frame-Options header is not set..."
}
```

### Como Acessar os Artifacts

```javascript
const report = await plugin.runDiagnostics('example.com', { persist: true });
const storage = plugin.getStorage();

// Carregar artifact individual do nmap
const nmapArtifact = await storage.get(report.toolStorageKeys.nmap);
console.log('Nmap encontrou:', nmapArtifact.summary.openPorts.length, 'portas');

// Carregar artifact individual do amass
const amassArtifact = await storage.get(report.toolStorageKeys.amass);
console.log('Amass encontrou:', amassArtifact.count, 'subdomínios');

// Comparar performance entre ferramentas
const subfinderArtifact = await storage.get(report.toolStorageKeys.subfinder);
console.log('Amass:', amassArtifact.count, 'vs Subfinder:', subfinderArtifact.count);
console.log('Tempo Amass:', amassArtifact.executionTimeMs, 'ms');
console.log('Tempo Subfinder:', subfinderArtifact.executionTimeMs, 'ms');
```

---

## 🎯 LAYER 2: Aggregated Stage Results

### Estrutura de Armazenamento

Resultados combinados de múltiplas ferramentas do mesmo estágio:

```
plugin=recon/reports/example.com/stages/2025-01-01T06-00-00-000Z/
└── aggregated/
    ├── dns.json                # Registros DNS (não agregado)
    ├── certificate.json        # Certificado TLS (não agregado)
    ├── ping.json               # Latência ping (não agregado)
    ├── traceroute.json         # Traceroute (não agregado)
    ├── curl.json               # Headers HTTP (não agregado)
    ├── ports.json              # ✨ AGREGADO: nmap + masscan
    ├── subdomains.json         # ✨ AGREGADO: amass + subfinder + assetfinder + crtsh
    ├── webDiscovery.json       # ✨ AGREGADO: ffuf + feroxbuster + gobuster
    ├── vulnerabilityScan.json  # ✨ AGREGADO: nikto + wpscan + droopescan
    ├── tlsAudit.json           # ✨ AGREGADO: openssl + sslyze + testssl
    ├── fingerprintTools.json   # Technologies (whatweb)
    ├── screenshots.json        # ✨ AGREGADO: aquatone + eyewitness
    └── osint.json              # ✨ AGREGADO: theHarvester + recon-ng
```

### Exemplo: ports.json (Agregado)

```json
{
  "status": "ok",
  "openPorts": [
    { "port": "22/tcp", "service": "ssh", "detail": "OpenSSH 8.2p1" },
    { "port": "80/tcp", "service": "http", "detail": "nginx 1.18.0" },
    { "port": "443/tcp", "service": "https", "detail": "nginx 1.18.0" },
    { "port": "3306/tcp", "service": "mysql", "detail": "" },
    { "port": "8080/tcp", "service": "http-proxy", "detail": "" }
  ],
  "scanners": {
    "nmap": {
      "status": "ok",
      "summary": {
        "openPorts": [
          { "port": "22/tcp", "service": "ssh", "detail": "OpenSSH 8.2p1" },
          { "port": "80/tcp", "service": "http", "detail": "nginx 1.18.0" },
          { "port": "443/tcp", "service": "https", "detail": "nginx 1.18.0" }
        ],
        "detectedServices": ["ssh OpenSSH 8.2p1", "http nginx 1.18.0", "https nginx 1.18.0"]
      }
    },
    "masscan": {
      "status": "ok",
      "openPorts": [
        { "port": "22/tcp", "ip": "93.184.216.34" },
        { "port": "80/tcp", "ip": "93.184.216.34" },
        { "port": "443/tcp", "ip": "93.184.216.34" },
        { "port": "3306/tcp", "ip": "93.184.216.34" },
        { "port": "8080/tcp", "ip": "93.184.216.34" }
      ]
    }
  }
}
```

**Insights Gerados**:
- ✅ Lista única de portas abertas (união de nmap + masscan)
- ✅ Masscan descobriu 2 portas extras (3306, 8080)
- ✅ Nmap forneceu detalhes de serviço mais precisos
- ✅ Correlação entre ferramentas para validação cruzada

### Exemplo: subdomains.json (Agregado)

```json
{
  "status": "ok",
  "total": 245,
  "list": [
    "api.example.com",
    "cdn.example.com",
    "staging.example.com",
    "admin.example.com",
    "mail.example.com",
    "...240 more..."
  ],
  "sources": {
    "amass": {
      "status": "ok",
      "count": 127,
      "sample": ["api.example.com", "cdn.example.com", "..."]
    },
    "subfinder": {
      "status": "ok",
      "count": 98,
      "sample": ["staging.example.com", "admin.example.com", "..."]
    },
    "assetfinder": {
      "status": "ok",
      "count": 45,
      "sample": ["mail.example.com", "support.example.com", "..."]
    },
    "crtsh": {
      "status": "ok",
      "count": 156,
      "sample": ["*.example.com", "dev.example.com", "..."]
    }
  }
}
```

**Insights Gerados**:
- ✅ **245 subdomínios únicos** descobertos (união de 4 fontes)
- ✅ **Amass**: 127 descobertas (melhor para OSINT)
- ✅ **crt.sh**: 156 descobertas (melhor para Certificate Transparency)
- ✅ **Subfinder**: 98 descobertas (mais rápido)
- ✅ **Assetfinder**: 45 descobertas (menor cobertura)
- ✅ Overlap entre ferramentas indica confiabilidade

### Como Acessar os Aggregados

```javascript
// Carregar stage agregado
const portsStage = await storage.get(report.stageStorageKeys.ports);
console.log('Total de portas únicas:', portsStage.openPorts.length);
console.log('Scanners usados:', Object.keys(portsStage.scanners));

// Comparar coberturas
const subdomainsStage = await storage.get(report.stageStorageKeys.subdomains);
console.log('Total único:', subdomainsStage.total);
for (const [source, data] of Object.entries(subdomainsStage.sources)) {
  console.log(`  ${source}: ${data.count} descobertas`);
}
```

---

## 💾 LAYER 3: Database Resources (Insights & Analytics)

### 1. **plg_recon_hosts** - Fingerprints e Summaries

**Propósito**: Armazena o estado atual de cada host descoberto.

**Schema**:
```javascript
{
  id: 'example.com',                    // Primary key
  target: 'https://example.com',        // URL original
  summary: {
    target: 'https://example.com',
    primaryIp: '93.184.216.34',
    ipAddresses: ['93.184.216.34'],
    cdn: 'Cloudflare',
    server: 'nginx',
    latencyMs: 18.5,
    subdomains: ['api.example.com', 'cdn.example.com', ...],
    subdomainCount: 245,
    openPorts: [
      { port: '22/tcp', service: 'ssh', detail: 'OpenSSH 8.2p1' },
      { port: '80/tcp', service: 'http', detail: 'nginx 1.18.0' },
      { port: '443/tcp', service: 'https', detail: 'nginx 1.18.0' }
    ],
    openPortCount: 5,
    technologies: ['nginx', 'Cloudflare', 'PHP', 'WordPress']
  },
  fingerprint: {
    target: 'example.com',
    primaryIp: '93.184.216.34',
    cdn: 'Cloudflare',
    server: 'nginx',
    technologies: ['nginx', 'Cloudflare', 'PHP', 'WordPress'],
    openPorts: [...],
    relatedHosts: ['example.com', 'www.example.com'],
    subdomainCount: 245,
    latencyMs: 18.5
  },
  lastScanAt: '2025-01-01T06:05:00.000Z',
  storageKey: 'plugin=recon/reports/example.com/2025-01-01T06-00-00-000Z.json',
  createdAt: '2025-01-01T06:05:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Queries para Insights**:

```javascript
const hostsResource = await db.resources.plg_recon_hosts;

// 1. Hosts com portas críticas expostas
const criticalPorts = await hostsResource.query({
  'summary.openPorts.port': { $in: ['3306/tcp', '5432/tcp', '27017/tcp', '6379/tcp'] }
});
console.log('Hosts com DBs expostos:', criticalPorts.length);

// 2. Hosts usando tecnologias específicas
const wordpressSites = await hostsResource.query({
  'fingerprint.technologies': 'WordPress'
});
console.log('Sites WordPress:', wordpressSites.length);

// 3. Hosts atrás de CDN
const cdnHosts = await hostsResource.query({
  'fingerprint.cdn': { $exists: true, $ne: null }
});
console.log('Hosts com CDN:', cdnHosts.length);

// 4. Hosts com alta latência
const slowHosts = await hostsResource.query({
  'fingerprint.latencyMs': { $gt: 100 }
});
console.log('Hosts lentos (>100ms):', slowHosts.length);

// 5. Hosts com muitos subdomínios (possível sprawl)
const sprawlHosts = await hostsResource.query({
  'summary.subdomainCount': { $gt: 100 }
});
console.log('Hosts com subdomain sprawl:', sprawlHosts.length);
```

---

### 2. **plg_recon_reports** - Scan History

**Propósito**: Histórico completo de todos os scans executados.

**Schema**:
```javascript
{
  id: 'example.com|2025-01-01T06:00:00.000Z',  // host|timestamp
  host: 'example.com',
  startedAt: '2025-01-01T06:00:00.000Z',
  endedAt: '2025-01-01T06:05:00.000Z',
  status: 'ok',                                 // ok | partial | error
  storageKey: 'plugin=recon/reports/example.com/2025-01-01T06-00-00-000Z.json',
  stageKeys: {
    dns: 'plugin=recon/reports/example.com/stages/.../aggregated/dns.json',
    ports: 'plugin=recon/reports/example.com/stages/.../aggregated/ports.json',
    subdomains: 'plugin=recon/reports/example.com/stages/.../aggregated/subdomains.json'
  },
  toolKeys: {
    nmap: 'plugin=recon/reports/example.com/stages/.../tools/nmap.json',
    masscan: 'plugin=recon/reports/example.com/stages/.../tools/masscan.json',
    amass: 'plugin=recon/reports/example.com/stages/.../tools/amass.json',
    subfinder: 'plugin=recon/reports/example.com/stages/.../tools/subfinder.json'
  },
  createdAt: '2025-01-01T06:05:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Queries para Insights**:

```javascript
const reportsResource = await db.resources.plg_recon_reports;

// 1. Scans recentes (últimas 24h)
const recentScans = await reportsResource.query({
  endedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
});
console.log('Scans nas últimas 24h:', recentScans.length);

// 2. Scans com erros
const failedScans = await reportsResource.query({
  status: { $in: ['partial', 'error'] }
});
console.log('Scans com problemas:', failedScans.length);

// 3. Histórico de scans de um host
const hostHistory = await reportsResource.query({
  host: 'example.com'
});
console.log('Scans do example.com:', hostHistory.length);
hostHistory.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
console.log('Último scan:', hostHistory[0].endedAt);
```

---

### 3. **plg_recon_stages** - Per-Stage Metadata

**Propósito**: Metadados de cada estágio de cada scan (performance tracking).

**Schema**:
```javascript
{
  id: 'example.com|ports|2025-01-01T06:00:00.000Z',  // host|stage|timestamp
  host: 'example.com',
  stage: 'ports',                                     // dns, ports, subdomains, etc.
  status: 'ok',
  storageKey: 'plugin=recon/reports/example.com/stages/.../aggregated/ports.json',
  summary: {
    status: 'ok',
    openPortCount: 5
  },
  collectedAt: '2025-01-01T06:02:30.000Z',
  createdAt: '2025-01-01T06:05:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Queries para Insights**:

```javascript
const stagesResource = await db.resources.plg_recon_stage_results;

// 1. Estágios que falharam com mais frequência
const failedStages = await stagesResource.query({
  status: { $in: ['error', 'unavailable'] }
});
const stageCounts = {};
for (const stage of failedStages) {
  stageCounts[stage.stage] = (stageCounts[stage.stage] || 0) + 1;
}
console.log('Estágios mais problemáticos:', stageCounts);

// 2. Performance por estágio
const portsScans = await stagesResource.query({
  stage: 'ports',
  status: 'ok'
});
console.log('Total de port scans bem-sucedidos:', portsScans.length);
```

---

### 4. **plg_recon_diffs** - Change Detection & Alerts

**Propósito**: Rastreia mudanças ao longo do tempo (novos subdomínios, portas, tecnologias).

**Schema**:
```javascript
{
  id: 'example.com|2025-01-01T06:00:00.000Z',
  host: 'example.com',
  timestamp: '2025-01-01T06:00:00.000Z',
  changes: [
    {
      type: 'subdomain:add',
      values: ['new-api.example.com', 'staging2.example.com'],
      description: 'Novos subdomínios: new-api.example.com, staging2.example.com',
      severity: 'medium',
      critical: false,
      detectedAt: '2025-01-01T06:00:00.000Z'
    },
    {
      type: 'port:add',
      values: ['3306/tcp'],
      description: 'Novas portas expostas: 3306/tcp',
      severity: 'high',
      critical: true,
      detectedAt: '2025-01-01T06:00:00.000Z'
    },
    {
      type: 'field:primaryIp',
      previous: '93.184.216.34',
      current: '93.184.216.35',
      description: 'primaryIp alterado de 93.184.216.34 para 93.184.216.35',
      severity: 'high',
      critical: true,
      detectedAt: '2025-01-01T06:00:00.000Z'
    }
  ],
  createdAt: '2025-01-01T06:05:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Queries para Insights**:

```javascript
const diffsResource = await db.resources.plg_recon_diffs;

// 1. Mudanças críticas recentes
const criticalChanges = await diffsResource.query({
  'changes.critical': true,
  timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
});
console.log('Mudanças críticas nos últimos 7 dias:', criticalChanges.length);

// 2. Novos subdomínios descobertos
const newSubdomains = await diffsResource.query({
  'changes.type': 'subdomain:add'
});
let totalNewSubdomains = 0;
for (const diff of newSubdomains) {
  for (const change of diff.changes) {
    if (change.type === 'subdomain:add') {
      totalNewSubdomains += change.values.length;
    }
  }
}
console.log('Total de novos subdomínios:', totalNewSubdomains);

// 3. Portas recentemente expostas
const newPorts = await diffsResource.query({
  'changes.type': 'port:add'
});
console.log('Eventos de novas portas expostas:', newPorts.length);

// 4. Mudanças de IP (possível migração/fail over)
const ipChanges = await diffsResource.query({
  'changes.type': 'field:primaryIp'
});
console.log('Mudanças de IP detectadas:', ipChanges.length);
```

---

### 5. **plg_recon_subdomains** - Discovered Subdomains

**Propósito**: Lista consolidada de subdomínios descobertos por host.

**Schema**:
```javascript
{
  id: 'example.com',
  host: 'example.com',
  subdomains: [
    'api.example.com',
    'cdn.example.com',
    'staging.example.com',
    '...242 more...'
  ],
  total: 245,
  sources: {
    amass: { status: 'ok', count: 127 },
    subfinder: { status: 'ok', count: 98 },
    assetfinder: { status: 'ok', count: 45 },
    crtsh: { status: 'ok', count: 156 }
  },
  lastScanAt: '2025-01-01T06:02:00.000Z',
  createdAt: '2025-01-01T06:05:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Queries para Insights**:

```javascript
const subdomainsResource = await db.resources.plg_recon_subdomains;

// 1. Hosts com mais subdomínios
const allSubdomains = await subdomainsResource.list({ limit: 1000 });
allSubdomains.sort((a, b) => b.total - a.total);
console.log('Top 10 hosts por subdomínios:');
for (const entry of allSubdomains.slice(0, 10)) {
  console.log(`  ${entry.host}: ${entry.total} subdomínios`);
}

// 2. Total de subdomínios descobertos no inventário
const totalSubdomains = allSubdomains.reduce((sum, entry) => sum + entry.total, 0);
console.log('Total de subdomínios no inventário:', totalSubdomains);

// 3. Fontes mais efetivas
const sourceCounts = { amass: 0, subfinder: 0, assetfinder: 0, crtsh: 0 };
for (const entry of allSubdomains) {
  for (const [source, data] of Object.entries(entry.sources || {})) {
    if (data.count) {
      sourceCounts[source] = (sourceCounts[source] || 0) + data.count;
    }
  }
}
console.log('Descobertas por fonte:', sourceCounts);
```

---

### 6. **plg_recon_paths** - Discovered Endpoints

**Propósito**: Endpoints/paths descobertos via fuzzing.

**Schema**:
```javascript
{
  id: 'example.com',
  host: 'example.com',
  paths: [
    '/admin',
    '/api/v1',
    '/wp-admin',
    '/uploads',
    '...196 more...'
  ],
  total: 200,
  sources: {
    ffuf: { status: 'ok', count: 120 },
    feroxbuster: { status: 'ok', count: 95 },
    gobuster: { status: 'ok', count: 78 }
  },
  lastScanAt: '2025-01-01T06:03:00.000Z',
  createdAt: '2025-01-01T06:05:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Queries para Insights**:

```javascript
const pathsResource = await db.resources.plg_recon_paths;

// 1. Hosts com admin panels expostos
const adminPaths = await pathsResource.query({
  paths: { $regex: /admin|panel|dashboard/i }
});
console.log('Hosts com admin panels:', adminPaths.length);

// 2. Hosts com APIs descobertas
const apiPaths = await pathsResource.query({
  paths: { $regex: /api|rest|graphql/i }
});
console.log('Hosts com APIs:', apiPaths.length);

// 3. Hosts com uploads/backups expostos
const sensitiveaths = await pathsResource.query({
  paths: { $regex: /upload|backup|temp|old/i }
});
console.log('Hosts com paths sensíveis:', sensitivePaths.length);
```

---

### 7. **plg_recon_targets** - Dynamic Target Management

**Propósito**: Gerenciamento de targets dinâmicos com metadados.

**Schema**:
```javascript
{
  id: 'example.com',
  target: 'https://example.com',
  enabled: true,
  behavior: 'stealth',
  features: { ports: { nmap: true, masscan: false } },
  tools: null,
  schedule: { enabled: true, cron: '0 */6 * * *', nextRun: '2025-01-01T12:00:00.000Z' },
  metadata: {
    owner: 'Security Team',
    criticality: 'high',
    environment: 'production'
  },
  lastScanAt: '2025-01-01T06:00:00.000Z',
  lastScanStatus: 'ok',
  scanCount: 42,
  addedBy: 'manual',
  tags: ['production', 'public-facing', 'critical'],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Queries para Insights**:

```javascript
const targetsResource = await db.resources.plg_recon_targets;

// 1. Targets ativos
const activeTargets = await targetsResource.query({ enabled: true });
console.log('Targets ativos:', activeTargets.length);

// 2. Targets por criticality
const criticalTargets = await targetsResource.query({
  'metadata.criticality': 'high'
});
console.log('Targets críticos:', criticalTargets.length);

// 3. Targets por owner
const securityTeamTargets = await targetsResource.query({
  'metadata.owner': 'Security Team'
});
console.log('Targets do Security Team:', securityTeamTargets.length);

// 4. Targets com scans falhando
const failingTargets = await targetsResource.query({
  lastScanStatus: { $in: ['partial', 'error'] }
});
console.log('Targets com scans problemáticos:', failingTargets.length);

// 5. Targets por tag
const productionTargets = await targetsResource.query({
  tags: 'production'
});
console.log('Targets de produção:', productionTargets.length);
```

---

## 📊 Insights Avançados - Queries Cross-Resource

### 1. **Attack Surface Monitoring**

Combine múltiplas resources para visualizar a superfície de ataque completa:

```javascript
// Carregar todos os hosts
const hosts = await db.resources.plg_recon_hosts.list({ limit: 1000 });

// Carregar todos os subdomínios
const subdomainEntries = await db.resources.plg_recon_subdomains.list({ limit: 1000 });

// Carregar todas as portas abertas
const attackSurface = {
  totalHosts: hosts.length,
  totalSubdomains: 0,
  totalOpenPorts: 0,
  criticalPorts: 0,
  hostsByTechnology: {},
  hostsByCDN: {}
};

for (const host of hosts) {
  // Contar portas abertas
  attackSurface.totalOpenPorts += host.summary?.openPortCount || 0;

  // Contar portas críticas (DBs, etc.)
  const critical = (host.summary?.openPorts || []).filter(p =>
    ['3306/tcp', '5432/tcp', '27017/tcp', '6379/tcp'].includes(p.port)
  );
  attackSurface.criticalPorts += critical.length;

  // Agrupar por tecnologia
  for (const tech of host.fingerprint?.technologies || []) {
    attackSurface.hostsByTechnology[tech] = (attackSurface.hostsByTechnology[tech] || 0) + 1;
  }

  // Agrupar por CDN
  if (host.fingerprint?.cdn) {
    attackSurface.hostsByCDN[host.fingerprint.cdn] = (attackSurface.hostsByCDN[host.fingerprint.cdn] || 0) + 1;
  }
}

// Contar subdomínios
for (const entry of subdomainEntries) {
  attackSurface.totalSubdomains += entry.total || 0;
}

console.log('Attack Surface Analysis:');
console.log('  Hosts:', attackSurface.totalHosts);
console.log('  Subdomains:', attackSurface.totalSubdomains);
console.log('  Open Ports:', attackSurface.totalOpenPorts);
console.log('  Critical Ports (DBs):', attackSurface.criticalPorts);
console.log('  Top Technologies:');
const topTech = Object.entries(attackSurface.hostsByTechnology)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
for (const [tech, count] of topTech) {
  console.log(`    ${tech}: ${count} hosts`);
}
```

### 2. **Change Velocity Tracking**

Monitore a velocidade de mudanças na infraestrutura:

```javascript
const diffs = await db.resources.plg_recon_diffs.list({ limit: 1000 });

// Agrupar mudanças por tipo e período
const now = Date.now();
const last7Days = now - 7 * 24 * 60 * 60 * 1000;
const last30Days = now - 30 * 24 * 60 * 60 * 1000;

const changeStats = {
  last7Days: { total: 0, critical: 0, byType: {} },
  last30Days: { total: 0, critical: 0, byType: {} }
};

for (const diff of diffs) {
  const timestamp = new Date(diff.timestamp).getTime();
  const period = timestamp > last7Days ? 'last7Days' : timestamp > last30Days ? 'last30Days' : null;

  if (!period) continue;

  for (const change of diff.changes || []) {
    changeStats[period].total++;
    if (change.critical) {
      changeStats[period].critical++;
    }
    changeStats[period].byType[change.type] = (changeStats[period].byType[change.type] || 0) + 1;
  }
}

console.log('Change Velocity:');
console.log('  Last 7 days:');
console.log('    Total changes:', changeStats.last7Days.total);
console.log('    Critical changes:', changeStats.last7Days.critical);
console.log('    Changes per day:', (changeStats.last7Days.total / 7).toFixed(1));
console.log('  Last 30 days:');
console.log('    Total changes:', changeStats.last30Days.total);
console.log('    Critical changes:', changeStats.last30Days.critical);
console.log('    Changes per day:', (changeStats.last30Days.total / 30).toFixed(1));
```

### 3. **Tool Effectiveness Analysis**

Compare a efetividade de diferentes ferramentas:

```javascript
const reports = await db.resources.plg_recon_reports.list({ limit: 1000 });

const toolStats = {
  nmap: { executions: 0, successes: 0, failures: 0, avgFindings: [] },
  masscan: { executions: 0, successes: 0, failures: 0, avgFindings: [] },
  amass: { executions: 0, successes: 0, failures: 0, avgFindings: [] },
  subfinder: { executions: 0, successes: 0, failures: 0, avgFindings: [] }
};

const storage = plugin.getStorage();

for (const report of reports) {
  // Carregar artifacts de ferramentas
  if (report.toolKeys?.nmap) {
    const artifact = await storage.get(report.toolKeys.nmap);
    toolStats.nmap.executions++;
    if (artifact.status === 'ok') {
      toolStats.nmap.successes++;
      toolStats.nmap.avgFindings.push(artifact.summary?.openPorts?.length || 0);
    } else {
      toolStats.nmap.failures++;
    }
  }

  // Repetir para outras ferramentas...
}

// Calcular médias
for (const [tool, stats] of Object.entries(toolStats)) {
  const avgFindings = stats.avgFindings.length > 0
    ? stats.avgFindings.reduce((a, b) => a + b, 0) / stats.avgFindings.length
    : 0;

  console.log(`${tool}:`);
  console.log(`  Execuções: ${stats.executions}`);
  console.log(`  Taxa de sucesso: ${((stats.successes / stats.executions) * 100).toFixed(1)}%`);
  console.log(`  Média de descobertas: ${avgFindings.toFixed(1)}`);
}
```

---

## 🎯 Fluxo Completo de Dados

```
┌──────────────────────────────────────────────────────────┐
│  1. EXECUÇÃO DE SCAN                                     │
├──────────────────────────────────────────────────────────┤
│  plugin.runDiagnostics('example.com', { persist: true })│
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  2. STAGES EXECUTADOS EM PARALELO                        │
├──────────────────────────────────────────────────────────┤
│  - DnsStage.execute()                                    │
│  - CertificateStage.execute()                            │
│  - PortsStage.execute() → nmap + masscan                 │
│  - SubdomainsStage.execute() → amass + subfinder + crtsh │
│  - ...                                                   │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  3. CADA FERRAMENTA GERA ARTIFACT                        │
├──────────────────────────────────────────────────────────┤
│  StorageManager.persistReport()                          │
│  ├─ tools/nmap.json                                      │
│  ├─ tools/masscan.json                                   │
│  ├─ tools/amass.json                                     │
│  └─ ...                                                  │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  4. STAGES AGREGAM RESULTADOS                            │
├──────────────────────────────────────────────────────────┤
│  StorageManager.persistReport()                          │
│  ├─ aggregated/ports.json (nmap + masscan)               │
│  ├─ aggregated/subdomains.json (amass + subfinder + ...) │
│  └─ ...                                                  │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  5. DADOS PERSISTIDOS EM RESOURCES                       │
├──────────────────────────────────────────────────────────┤
│  StorageManager.persistToResources()                     │
│  ├─ plg_recon_hosts (fingerprint, summary)               │
│  ├─ plg_recon_reports (scan history)                     │
│  ├─ plg_recon_stages (per-stage metadata)                │
│  ├─ plg_recon_diffs (change detection)                   │
│  ├─ plg_recon_subdomains (discovered subdomains)         │
│  └─ plg_recon_paths (discovered endpoints)               │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  6. INSIGHTS GERADOS VIA QUERIES                         │
├──────────────────────────────────────────────────────────┤
│  - Attack surface monitoring                             │
│  - Change velocity tracking                              │
│  - Tool effectiveness analysis                           │
│  - Vulnerability trending                                │
│  - Technology stack analysis                             │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Exemplo Completo: Do Scan ao Insight

```javascript
// 1. Executar scan
const report = await plugin.runDiagnostics('example.com', { persist: true });

// 2. Acessar artifacts individuais de ferramentas
const storage = plugin.getStorage();
const nmapArtifact = await storage.get(report.toolStorageKeys.nmap);
const amassArtifact = await storage.get(report.toolStorageKeys.amass);

console.log('Nmap encontrou:', nmapArtifact.summary.openPorts.length, 'portas');
console.log('Amass encontrou:', amassArtifact.count, 'subdomínios');

// 3. Acessar stage agregado
const portsStage = await storage.get(report.stageStorageKeys.ports);
console.log('Total de portas únicas:', portsStage.openPorts.length);

// 4. Consultar resources para insights
const hostsResource = await db.resources.plg_recon_hosts;
const host = await hostsResource.get('example.com');
console.log('Fingerprint atual:', host.fingerprint);

// 5. Detectar mudanças
const diffsResource = await db.resources.plg_recon_diffs;
const recentChanges = await diffsResource.query({
  host: 'example.com',
  'changes.critical': true
});
console.log('Mudanças críticas:', recentChanges.length);

// 6. Análise cross-resource
const allHosts = await hostsResource.list({ limit: 1000 });
const criticalPorts = allHosts.filter(h =>
  (h.summary?.openPorts || []).some(p => ['3306/tcp', '5432/tcp'].includes(p.port))
);
console.log('Hosts com DBs expostos:', criticalPorts.length);
```

---

## 💡 Casos de Uso de Insights

### 1. Security Dashboard
```javascript
// Agregação para dashboard de segurança
const dashboard = {
  totalHosts: 0,
  totalSubdomains: 0,
  criticalVulnerabilities: 0,
  recentChanges: 0,
  exposedDatabases: 0
};

// Popular dashboard com queries cross-resource...
```

### 2. Compliance Reporting
```javascript
// Relatório de compliance
const complianceReport = {
  tlsEnabled: 0,
  outdatedTech: [],
  missingSecurityHeaders: [],
  exposedServices: []
};

// Queries em plg_recon_hosts + plg_recon_stages...
```

### 3. Incident Response
```javascript
// Investigação de incidente
const incident = {
  newSubdomains: [],  // plg_recon_diffs
  newPorts: [],       // plg_recon_diffs
  ipChanges: []       // plg_recon_diffs
};

// Queries em plg_recon_diffs com filtros temporais...
```

---

**Documentação completa de como TODAS as informações de CADA ferramenta são salvas e agregadas para insights! 🎯**
