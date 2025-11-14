# Recon Plugin - Storage Architecture & Insights Generation

**How every tool persists its output and how we aggregate the data into resources for insights**

---

## 📊 Overview

ReconPlugin uses a **3-layer storage architecture** that captures data at multiple levels of detail:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: RAW ARTIFACTS                   │
│                  (Per-Tool, Per-Execution)                  │
├─────────────────────────────────────────────────────────────┤
│         plugin=recon/reports/<host>/stages/<timestamp>/     │
│                      tools/<tool>.json                      │
│                                                             │
│  Each tool writes its own JSON artifact with:              │
│  - Full stdout/stderr                                      │
│  - Execution status (ok/error/unavailable)                 │
│  - Tool-specific metrics                                   │
│  - Execution timestamp                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  LAYER 2: AGGREGATED STAGES                 │
│                   (Combined Tool Results)                   │
├─────────────────────────────────────────────────────────────┤
│         plugin=recon/reports/<host>/stages/<timestamp>/     │
│                   aggregated/<stage>.json                   │
│                                                             │
│  Combined results from multiple tools:                     │
│  - ports.json = nmap + masscan (unique ports)              │
│  - subdomains.json = amass + subfinder + crtsh (unique)    │
│  - vulnerabilities.json = nikto + wpscan + droopescan      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  LAYER 3: DATABASE RESOURCES                │
│                   (Queryable, Indexed Data)                 │
├─────────────────────────────────────────────────────────────┤
│  7 resources for analytics & insights:                     │
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

### Storage layout

Each tool saves its output into an individual JSON file:

```
plugin=recon/reports/example.com/stages/2025-01-01T06-00-00-000Z/
└── tools/
    ├── nmap.json           # nmap port scan
    ├── masscan.json        # masscan port scan
    ├── amass.json          # amass subdomain enumeration
    ├── subfinder.json      # subfinder subdomain enumeration
    ├── assetfinder.json    # assetfinder subdomain enumeration
    ├── crtsh.json          # Certificate Transparency subdomains
    ├── ffuf.json           # ffuf directory fuzzing
    ├── feroxbuster.json    # feroxbuster directory fuzzing
    ├── gobuster.json       # gobuster directory fuzzing
    ├── nikto.json          # nikto vulnerability scan
    ├── wpscan.json         # wpscan (WordPress)
    ├── droopescan.json     # droopescan (Drupal/Joomla)
    ├── openssl.json        # openssl TLS audit
    ├── sslyze.json         # sslyze TLS audit
    ├── testssl.json        # testssl.sh TLS audit
    ├── whatweb.json        # Technology fingerprinting
    ├── aquatone.json       # Screenshot capture
    ├── eyewitness.json     # Screenshot capture
    ├── theharvester.json   # OSINT data
    └── recon-ng.json       # OSINT framework
```

### Example: nmap.json

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

### Example: amass.json

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

### Example: nikto.json

```json
{
  "status": "ok",
  "tool": "nikto",
  "executedAt": "2025-01-01T06:01:30.789Z",
  "executionTimeMs": 60000,
  "raw": "- Nikto v2.1.6\n----------- Scan started at Thu Jan 1 06:01:30 2025\n+ Server: nginx/1.18.0\n+ The X-Frame-Options header is not set..."
}
```

### Accessing artifacts

```javascript
const report = await plugin.runDiagnostics('example.com', { persist: true });
const storage = plugin.getStorage();

// Load an individual nmap artifact
const nmapArtifact = await storage.get(report.toolStorageKeys.nmap);
console.log('Nmap found:', nmapArtifact.summary.openPorts.length, 'ports');

// Load an individual amass artifact
const amassArtifact = await storage.get(report.toolStorageKeys.amass);
console.log('Amass discovered:', amassArtifact.count, 'subdomains');

// Compare tool performance
const subfinderArtifact = await storage.get(report.toolStorageKeys.subfinder);
console.log('Amass:', amassArtifact.count, 'vs Subfinder:', subfinderArtifact.count);
console.log('Amass duration:', amassArtifact.executionTimeMs, 'ms');
console.log('Subfinder duration:', subfinderArtifact.executionTimeMs, 'ms');
```

---

## 🎯 LAYER 2: Aggregated Stage Results

### Storage layout

Combined outputs for each stage:

```
plugin=recon/reports/example.com/stages/2025-01-01T06-00-00-000Z/
└── aggregated/
    ├── dns.json                # DNS records (raw)
    ├── certificate.json        # TLS certificate (raw)
    ├── ping.json               # Ping latency (raw)
    ├── traceroute.json         # Traceroute (raw)
    ├── curl.json               # HTTP headers (raw)
    ├── ports.json              # ✨ AGGREGATED: nmap + masscan
    ├── subdomains.json         # ✨ AGGREGATED: amass + subfinder + assetfinder + crtsh
    ├── webDiscovery.json       # ✨ AGGREGATED: ffuf + feroxbuster + gobuster
    ├── vulnerabilityScan.json  # ✨ AGGREGATED: nikto + wpscan + droopescan
    ├── tlsAudit.json           # ✨ AGGREGATED: openssl + sslyze + testssl
    ├── fingerprintTools.json   # Technologies (whatweb)
    ├── screenshots.json        # ✨ AGGREGATED: aquatone + eyewitness
    └── osint.json              # ✨ AGGREGATED: theHarvester + recon-ng
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

**Insights produced**:
- ✅ Unique list of open ports (union of nmap + masscan)
- ✅ Masscan found two extra ports (3306, 8080)
- ✅ Nmap delivers precise service detail
- ✅ Cross-check between scanners

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

**Insights produced**:
- ✅ **245 unique subdomains** collected across four sources
- ✅ **Amass**: 127 findings (excellent OSINT coverage)
- ✅ **crt.sh**: 156 findings (Certificate Transparency)
- ✅ **Subfinder**: 98 findings (fastest)
- ✅ **Assetfinder**: 45 findings (least coverage)
- ✅ Overlap between sources indicates reliability

### Accessing the aggregated data

```javascript
// Load aggregated stage
const portsStage = await storage.get(report.stageStorageKeys.ports);
console.log('Unique ports:', portsStage.openPorts.length);
console.log('Scanners used:', Object.keys(portsStage.scanners));

// Compare coverage per source
const subdomainsStage = await storage.get(report.stageStorageKeys.subdomains);
console.log('Total unique:', subdomainsStage.total);
for (const [source, data] of Object.entries(subdomainsStage.sources)) {
  console.log(`  ${source}: ${data.count} findings`);
}
```

---

## 💾 LAYER 3: Database Resources (Insights & Analytics)

### 1. **plg_recon_hosts** – Fingerprints & summaries

**Purpose**: store the current state of each discovered host.

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

**Insight-friendly queries**:

```javascript
const hostsResource = await db.resources.plg_recon_hosts;

// 1. Hosts exposing critical ports
const criticalPorts = await hostsResource.query({
  'summary.openPorts.port': { $in: ['3306/tcp', '5432/tcp', '27017/tcp', '6379/tcp'] }
});
console.log('Hosts with exposed databases:', criticalPorts.length);

// 2. Hosts running a specific stack
const wordpressSites = await hostsResource.query({
  'fingerprint.technologies': 'WordPress'
});
console.log('WordPress sites:', wordpressSites.length);

// 3. Hosts behind a CDN
const cdnHosts = await hostsResource.query({
  'fingerprint.cdn': { $exists: true, $ne: null }
});
console.log('Hosts with CDN:', cdnHosts.length);

// 4. Hosts with high latency
const slowHosts = await hostsResource.query({
  'fingerprint.latencyMs': { $gt: 100 }
});
console.log('High-latency hosts (>100ms):', slowHosts.length);

// 5. Hosts with extensive subdomain sprawl
const sprawlHosts = await hostsResource.query({
  'summary.subdomainCount': { $gt: 100 }
});
console.log('Hosts with subdomain sprawl:', sprawlHosts.length);
```

---

### 2. **plg_recon_reports** – Scan history

**Purpose**: full record of every scan executed.

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

**Insight-friendly queries**:

```javascript
const reportsResource = await db.resources.plg_recon_reports;

// 1. Recent scans (last 24h)
const recentScans = await reportsResource.query({
  endedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
});
console.log('Scans in the last 24h:', recentScans.length);

// 2. Scans with issues
const failedScans = await reportsResource.query({
  status: { $in: ['partial', 'error'] }
});
console.log('Problematic scans:', failedScans.length);

// 3. Scan history for a host
const hostHistory = await reportsResource.query({
  host: 'example.com'
});
console.log('Scans for example.com:', hostHistory.length);
hostHistory.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
console.log('Most recent scan:', hostHistory[0].endedAt);
```

---

### 3. **plg_recon_stages** – Per-stage metadata

**Purpose**: capture per-stage metadata for performance tracking.

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

**Insight-friendly queries**:

```javascript
const stagesResource = await db.resources.plg_recon_stage_results;

// 1. Stages that failed most often
const failedStages = await stagesResource.query({
  status: { $in: ['error', 'unavailable'] }
});
const stageCounts = {};
for (const stage of failedStages) {
  stageCounts[stage.stage] = (stageCounts[stage.stage] || 0) + 1;
}
console.log('Most problematic stages:', stageCounts);

// 2. Stage performance
const portsScans = await stagesResource.query({
  stage: 'ports',
  status: 'ok'
});
console.log('Successful port scans:', portsScans.length);
```

---

### 4. **plg_recon_diffs** – Change detection & alerts

**Purpose**: track changes over time (new subdomains, ports, technologies, etc.).

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
      description: 'New subdomains: new-api.example.com, staging2.example.com',
      severity: 'medium',
      critical: false,
      detectedAt: '2025-01-01T06:00:00.000Z'
    },
    {
      type: 'port:add',
      values: ['3306/tcp'],
      description: 'Newly exposed port: 3306/tcp',
      severity: 'high',
      critical: true,
      detectedAt: '2025-01-01T06:00:00.000Z'
    },
    {
      type: 'field:primaryIp',
      previous: '93.184.216.34',
      current: '93.184.216.35',
      description: 'primaryIp changed from 93.184.216.34 to 93.184.216.35',
      severity: 'high',
      critical: true,
      detectedAt: '2025-01-01T06:00:00.000Z'
    }
  ],
  createdAt: '2025-01-01T06:05:00.000Z',
  updatedAt: '2025-01-01T06:05:00.000Z'
}
```

**Insight-friendly queries**:

```javascript
const diffsResource = await db.resources.plg_recon_diffs;

// 1. Recent critical changes
const criticalChanges = await diffsResource.query({
  'changes.critical': true,
  timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
});
console.log('Critical changes last 7 days:', criticalChanges.length);

// 2. Newly discovered subdomains
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
console.log('Total new subdomains:', totalNewSubdomains);

// 3. Newly exposed ports
const newPorts = await diffsResource.query({
  'changes.type': 'port:add'
});
console.log('Exposed-port events:', newPorts.length);

// 4. IP changes (possible migration/failover)
const ipChanges = await diffsResource.query({
  'changes.type': 'field:primaryIp'
});
console.log('IP changes detected:', ipChanges.length);
```

---

### 5. **plg_recon_subdomains** - Discovered Subdomains

**Purpose**: consolidated list of subdomains per host.

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

**Insight-friendly queries**:

```javascript
const subdomainsResource = await db.resources.plg_recon_subdomains;

// 1. Hosts with the most subdomains
const allSubdomains = await subdomainsResource.list({ limit: 1000 });
allSubdomains.sort((a, b) => b.total - a.total);
console.log('Top 10 hosts by subdomains:');
for (const entry of allSubdomains.slice(0, 10)) {
  console.log(`  ${entry.host}: ${entry.total} subdomains`);
}

// 2. Total subdomains discovered
const totalSubdomains = allSubdomains.reduce((sum, entry) => sum + entry.total, 0);
console.log('Inventory-wide subdomain total:', totalSubdomains);

// 3. Most effective sources
const sourceCounts = { amass: 0, subfinder: 0, assetfinder: 0, crtsh: 0 };
for (const entry of allSubdomains) {
  for (const [source, data] of Object.entries(entry.sources || {})) {
    if (data.count) {
      sourceCounts[source] = (sourceCounts[source] || 0) + data.count;
    }
  }
}
console.log('Discoveries per source:', sourceCounts);
```

---

### 6. **plg_recon_paths** - Discovered Endpoints

**Purpose**: endpoints/paths discovered via fuzzing.

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

// 1. Hosts exposing admin panels
const adminPaths = await pathsResource.query({
  paths: { $regex: /admin|panel|dashboard/i }
});
console.log('Hosts with admin panels:', adminPaths.length);

// 2. Hosts with discovered APIs
const apiPaths = await pathsResource.query({
  paths: { $regex: /api|rest|graphql/i }
});
console.log('Hosts with APIs:', apiPaths.length);

// 3. Hosts exposing uploads/backups
const sensitivePaths = await pathsResource.query({
  paths: { $regex: /upload|backup|temp|old/i }
});
console.log('Hosts with sensitive paths:', sensitivePaths.length);
```

---

### 7. **plg_recon_targets** – Dynamic target management

**Purpose**: manage dynamic targets alongside metadata.

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

**Insight-friendly queries**:

```javascript
const targetsResource = await db.resources.plg_recon_targets;

// 1. Active targets
const activeTargets = await targetsResource.query({ enabled: true });
console.log('Active targets:', activeTargets.length);

// 2. Targets by criticality
const criticalTargets = await targetsResource.query({
  'metadata.criticality': 'high'
});
console.log('High criticality targets:', criticalTargets.length);

// 3. Targets by owner
const securityTeamTargets = await targetsResource.query({
  'metadata.owner': 'Security Team'
});
console.log('Security Team targets:', securityTeamTargets.length);

// 4. Targets with failing scans
const failingTargets = await targetsResource.query({
  lastScanStatus: { $in: ['partial', 'error'] }
});
console.log('Targets with scan issues:', failingTargets.length);

// 5. Targets by tag
const productionTargets = await targetsResource.query({
  tags: 'production'
});
console.log('Production targets:', productionTargets.length);
```

---

## 📊 Advanced Insights – cross-resource queries

### 1. **Attack surface monitoring**

Combine multiple resources to visualize the full attack surface:

```javascript
// Load all hosts
const hosts = await db.resources.plg_recon_hosts.list({ limit: 1000 });

// Load all subdomains
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
  // Count open ports
  attackSurface.totalOpenPorts += host.summary?.openPortCount || 0;

  // Count critical ports (DBs, etc.)
  const critical = (host.summary?.openPorts || []).filter(p =>
    ['3306/tcp', '5432/tcp', '27017/tcp', '6379/tcp'].includes(p.port)
  );
  attackSurface.criticalPorts += critical.length;

  // Group by technology
  for (const tech of host.fingerprint?.technologies || []) {
    attackSurface.hostsByTechnology[tech] = (attackSurface.hostsByTechnology[tech] || 0) + 1;
  }

  // Group by CDN
  if (host.fingerprint?.cdn) {
    attackSurface.hostsByCDN[host.fingerprint.cdn] = (attackSurface.hostsByCDN[host.fingerprint.cdn] || 0) + 1;
  }
}

// Count subdomains
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

### 2. **Change velocity tracking**

Monitor how fast infrastructure changes:

```javascript
const diffs = await db.resources.plg_recon_diffs.list({ limit: 1000 });

// Group changes by type and period
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

### 3. **Tool effectiveness analysis**

Compare how effective each tool is:

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
  // Load tool artifacts
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

  // Repeat for other tools...
}

// Calculate averages
for (const [tool, stats] of Object.entries(toolStats)) {
  const avgFindings = stats.avgFindings.length > 0
    ? stats.avgFindings.reduce((a, b) => a + b, 0) / stats.avgFindings.length
    : 0;

  console.log(`${tool}:`);
  console.log(`  Executions: ${stats.executions}`);
  console.log(`  Success rate: ${((stats.successes / stats.executions) * 100).toFixed(1)}%`);
  console.log(`  Average findings: ${avgFindings.toFixed(1)}`);
}
```

---

## 🎯 Fluxo Completo de Dados

```
┌──────────────────────────────────────────────────────────┐
│  1. SCAN EXECUTION                                       │
├──────────────────────────────────────────────────────────┤
│  plugin.runDiagnostics('example.com', { persist: true })│
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  2. STAGES EXECUTED IN PARALLEL                          │
├──────────────────────────────────────────────────────────┤
│  - DnsStage.execute()                                    │
│  - CertificateStage.execute()                            │
│  - PortsStage.execute() → nmap + masscan                 │
│  - SubdomainsStage.execute() → amass + subfinder + crtsh │
│  - ...                                                   │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  3. EACH TOOL GENERATES AN ARTIFACT                      │
├──────────────────────────────────────────────────────────┤
│  StorageManager.persistReport()                          │
│  ├─ tools/nmap.json                                      │
│  ├─ tools/masscan.json                                   │
│  ├─ tools/amass.json                                     │
│  └─ ...                                                  │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  4. STAGES AGGREGATE RESULTS                             │
├──────────────────────────────────────────────────────────┤
│  StorageManager.persistReport()                          │
│  ├─ aggregated/ports.json (nmap + masscan)               │
│  ├─ aggregated/subdomains.json (amass + subfinder + ...) │
│  └─ ...                                                  │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│  5. DATA PERSISTED INTO RESOURCES                        │
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
│  6. INSIGHTS GENERATED THROUGH QUERIES                   │
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
// 1. Execute scan
const report = await plugin.runDiagnostics('example.com', { persist: true });

// 2. Read individual tool artifacts
const storage = plugin.getStorage();
const nmapArtifact = await storage.get(report.toolStorageKeys.nmap);
const amassArtifact = await storage.get(report.toolStorageKeys.amass);

console.log('Nmap found:', nmapArtifact.summary.openPorts.length, 'ports');
console.log('Amass found:', amassArtifact.count, 'subdomains');

// 3. Read aggregated stage
const portsStage = await storage.get(report.stageStorageKeys.ports);
console.log('Unique ports:', portsStage.openPorts.length);

// 4. Query resources for insights
const hostsResource = await db.resources.plg_recon_hosts;
const host = await hostsResource.get('example.com');
console.log('Current fingerprint:', host.fingerprint);

// 5. Detect changes
const diffsResource = await db.resources.plg_recon_diffs;
const recentChanges = await diffsResource.query({
  host: 'example.com',
  'changes.critical': true
});
console.log('Critical changes:', recentChanges.length);

// 6. Cross-resource analysis
const allHosts = await hostsResource.list({ limit: 1000 });
const criticalPorts = allHosts.filter(h =>
  (h.summary?.openPorts || []).some(p => ['3306/tcp', '5432/tcp'].includes(p.port))
);
console.log('Hosts with exposed databases:', criticalPorts.length);
```

---

## 💡 Casos de Uso de Insights

### 1. Security Dashboard
```javascript
// Aggregation for a security dashboard
const dashboard = {
  totalHosts: 0,
  totalSubdomains: 0,
  criticalVulnerabilities: 0,
  recentChanges: 0,
  exposedDatabases: 0
};

// Populate dashboard using cross-resource queries...
```

### 2. Compliance reporting
```javascript
// Compliance report scaffold
const complianceReport = {
  tlsEnabled: 0,
  outdatedTech: [],
  missingSecurityHeaders: [],
  exposedServices: []
};

// Run queries across plg_recon_hosts + plg_recon_stages...
```

### 3. Incident response
```javascript
// Incident investigation snapshot
const incident = {
  newSubdomains: [],  // plg_recon_diffs
  newPorts: [],       // plg_recon_diffs
  ipChanges: []       // plg_recon_diffs
};

// Execute time-bound queries against plg_recon_diffs...
```

---

**Complete documentation of how every tool’s data is captured and aggregated for insights! 🎯**
