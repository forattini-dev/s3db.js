# Recon Plugin - Per-Tool Artifact Storage

**Requirement**: Each individual tool must generate its own artifact and persist it separately.

---

## Current Storage Structure (Problem)

Currently, tools are **aggregated by stage** into single artifacts:

```
plugin=recon/reports/example.com/stages/2025-01-01T00-00-00Z/
├── dns.json                    # Single tool (dns)
├── certificate.json            # Single tool (certificate)
├── ping.json                   # Single tool (ping)
├── traceroute.json             # Single tool (traceroute)
├── curl.json                   # Single tool (curl)
├── ports.json                  # ❌ AGGREGATED: contains nmap + masscan
├── subdomains.json             # ❌ AGGREGATED: contains amass + subfinder + assetfinder + crtsh
├── tlsAudit.json               # ❌ AGGREGATED: contains openssl + sslyze + testssl
├── fingerprintTools.json       # ❌ AGGREGATED: contains whatweb
├── webDiscovery.json           # ❌ AGGREGATED: contains ffuf + feroxbuster + gobuster
├── vulnerabilityScan.json      # ❌ AGGREGATED: contains nikto + wpscan + droopescan
├── screenshots.json            # ❌ AGGREGATED: contains aquatone + eyewitness
└── osint.json                  # ❌ AGGREGATED: contains theHarvester + recon-ng
```

**Problem**: Multiple tools are combined into single stage artifacts, making it impossible to:
- Track individual tool performance
- Debug specific tool failures
- Rerun single tools independently
- Analyze tool-specific output

---

## Desired Storage Structure (Solution)

Each tool should persist its own artifact:

```
plugin=recon/reports/example.com/stages/2025-01-01T00-00-00Z/
├── dns.json                    # ✅ Single tool
├── certificate.json            # ✅ Single tool
├── ping.json                   # ✅ Single tool
├── traceroute.json             # ✅ Single tool
├── curl.json                   # ✅ Single tool
│
├── tools/
│   ├── nmap.json               # ✅ Individual tool
│   ├── masscan.json            # ✅ Individual tool
│   │
│   ├── amass.json              # ✅ Individual tool
│   ├── subfinder.json          # ✅ Individual tool
│   ├── assetfinder.json        # ✅ Individual tool
│   ├── crtsh.json              # ✅ Individual tool
│   │
│   ├── openssl.json            # ✅ Individual tool
│   ├── sslyze.json             # ✅ Individual tool
│   ├── testssl.json            # ✅ Individual tool
│   │
│   ├── whatweb.json            # ✅ Individual tool
│   │
│   ├── ffuf.json               # ✅ Individual tool
│   ├── feroxbuster.json        # ✅ Individual tool
│   ├── gobuster.json           # ✅ Individual tool
│   │
│   ├── nikto.json              # ✅ Individual tool
│   ├── wpscan.json             # ✅ Individual tool
│   ├── droopescan.json         # ✅ Individual tool
│   │
│   ├── aquatone.json           # ✅ Individual tool
│   ├── eyewitness.json         # ✅ Individual tool
│   │
│   ├── theharvester.json       # ✅ Individual tool
│   └── recon-ng.json           # ✅ Individual tool
│
└── aggregated/
    ├── ports.json              # Aggregated view (optional)
    ├── subdomains.json         # Aggregated view (optional)
    ├── tlsAudit.json           # Aggregated view (optional)
    ├── fingerprint.json        # Aggregated view (optional)
    ├── webDiscovery.json       # Aggregated view (optional)
    ├── vulnerabilityScan.json  # Aggregated view (optional)
    ├── screenshots.json        # Aggregated view (optional)
    └── osint.json              # Aggregated view (optional)
```

---

## Implementation Strategy

### 1. Update Stage Methods to Return Per-Tool Results

**Current** (`_runPortScans`):
```javascript
async _runPortScans(target, featureConfig = {}) {
  const scanners = {};
  if (featureConfig.nmap) {
    const result = await this._runNmap(target);
    scanners.nmap = result;  // Nested
  }
  if (featureConfig.masscan) {
    const result = await this._runMasscan(target);
    scanners.masscan = result;  // Nested
  }
  return { status: 'ok', scanners };  // Returns nested object
}
```

**Desired**:
```javascript
async _runPortScans(target, featureConfig = {}) {
  const tools = {};  // Individual tool results

  if (featureConfig.nmap) {
    tools.nmap = await this._runNmap(target);
  }

  if (featureConfig.masscan) {
    tools.masscan = await this._runMasscan(target);
  }

  // Return both individual AND aggregated
  return {
    _individual: tools,  // Per-tool results
    _aggregated: {       // Combined view
      status: 'ok',
      openPorts: this._mergePortResults(tools),
      scanners: tools
    }
  };
}
```

### 2. Update `_persistReport()` to Store Individual Tools

**Current** (lines 765-809):
```javascript
async _persistReport(target, report) {
  const storage = this.getStorage();
  const timestamp = report.endedAt.replace(/[:.]/g, '-');
  const baseKey = storage.getPluginKey(null, 'reports', target.host);
  const stageStorageKeys = {};

  // Only persists stages (aggregated)
  for (const [stageName, stageData] of Object.entries(report.results || {})) {
    const stageKey = `${baseKey}/stages/${timestamp}/${stageName}.json`;
    await storage.set(stageKey, stageData, { behavior: 'body-only' });
    stageStorageKeys[stageName] = stageKey;
  }

  // ...
}
```

**Desired**:
```javascript
async _persistReport(target, report) {
  const storage = this.getStorage();
  const timestamp = report.endedAt.replace(/[:.]/g, '-');
  const baseKey = storage.getPluginKey(null, 'reports', target.host);
  const stageStorageKeys = {};
  const toolStorageKeys = {};

  for (const [stageName, stageData] of Object.entries(report.results || {})) {
    // Persist individual tools if present
    if (stageData._individual) {
      for (const [toolName, toolData] of Object.entries(stageData._individual)) {
        const toolKey = `${baseKey}/stages/${timestamp}/tools/${toolName}.json`;
        await storage.set(toolKey, toolData, { behavior: 'body-only' });
        toolStorageKeys[toolName] = toolKey;
      }
    }

    // Persist aggregated stage view
    const aggregatedData = stageData._aggregated || stageData;
    const stageKey = `${baseKey}/stages/${timestamp}/aggregated/${stageName}.json`;
    await storage.set(stageKey, aggregatedData, { behavior: 'body-only' });
    stageStorageKeys[stageName] = stageKey;
  }

  report.stageStorageKeys = stageStorageKeys;
  report.toolStorageKeys = toolStorageKeys;  // NEW

  // ...
}
```

### 3. Update `_persistToResources()` to Track Individual Tools

Add new resource for tracking individual tool executions:

```javascript
{
  key: 'tools',
  config: {
    primaryKey: 'id',
    attributes: {
      id: 'string|required',                // host|tool|timestamp
      host: 'string|required',
      tool: 'string|required',              // nmap, masscan, amass, etc.
      stage: 'string|required',             // ports, subdomains, etc.
      status: 'string',                     // ok, error, unavailable
      storageKey: 'string',
      summary: 'object',
      executionTimeMs: 'number',
      collectedAt: 'string'
    },
    timestamps: true,
    behavior: 'truncate-data',
    partitions: {
      byTool: { fields: { tool: 'string' } },
      byHost: { fields: { host: 'string' } }
    }
  }
}
```

---

## Benefits

1. ✅ **Granular Tracking**: Each tool execution is independently tracked
2. ✅ **Performance Analysis**: Compare tool execution times across scans
3. ✅ **Debugging**: Isolate failures to specific tools
4. ✅ **Selective Reruns**: Rerun only failed tools, not entire stages
5. ✅ **Tool Comparison**: Compare results between similar tools (e.g., nmap vs masscan)
6. ✅ **Audit Trail**: Complete history of every tool execution
7. ✅ **Resource Optimization**: Skip slow/expensive tools per target

---

## Affected Stage Methods

The following methods need to be updated to return `_individual` and `_aggregated`:

1. ✅ `_runPortScans()` - nmap, masscan
2. ✅ `_runSubdomainRecon()` - amass, subfinder, assetfinder, crtsh
3. ✅ `_runTlsExtras()` - openssl, sslyze, testssl
4. ✅ `_runFingerprintTools()` - whatweb
5. ✅ `_runWebDiscovery()` - ffuf, feroxbuster, gobuster
6. ✅ `_runVulnerabilityScans()` - nikto, wpscan, droopescan
7. ✅ `_runScreenshotCapture()` - aquatone, eyewitness
8. ✅ `_runOsintRecon()` - theHarvester, recon-ng

---

## Example: Port Scan Tool Artifacts

### Individual Tool Artifacts

**plugin=recon/reports/example.com/stages/2025-01-01T00-00-00Z/tools/nmap.json**
```json
{
  "status": "ok",
  "tool": "nmap",
  "executedAt": "2025-01-01T00:00:00.000Z",
  "executionTimeMs": 5432,
  "openPorts": [
    { "port": "80/tcp", "service": "http", "detail": "nginx 1.21.0" },
    { "port": "443/tcp", "service": "https", "detail": "nginx 1.21.0" }
  ],
  "summary": {
    "totalPorts": 2,
    "detectedServices": ["http nginx 1.21.0", "https nginx 1.21.0"]
  },
  "raw": "... nmap output ...",
  "command": "nmap -Pn --top-ports 100 -T4 -sV example.com"
}
```

**plugin=recon/reports/example.com/stages/2025-01-01T00-00-00Z/tools/masscan.json**
```json
{
  "status": "ok",
  "tool": "masscan",
  "executedAt": "2025-01-01T00:00:05.000Z",
  "executionTimeMs": 1234,
  "openPorts": [
    { "port": "80/tcp", "service": "http" },
    { "port": "443/tcp", "service": "https" },
    { "port": "8080/tcp", "service": "http-proxy" }
  ],
  "summary": {
    "totalPorts": 3
  },
  "raw": "... masscan output ...",
  "command": "masscan -p1-65535 --rate=5000 example.com"
}
```

### Aggregated Stage Artifact

**plugin=recon/reports/example.com/stages/2025-01-01T00-00-00Z/aggregated/ports.json**
```json
{
  "status": "ok",
  "openPorts": [
    { "port": "80/tcp", "service": "http", "detail": "nginx 1.21.0" },
    { "port": "443/tcp", "service": "https", "detail": "nginx 1.21.0" },
    { "port": "8080/tcp", "service": "http-proxy" }
  ],
  "scanners": {
    "nmap": { "status": "ok", "totalPorts": 2, "storageKey": ".../tools/nmap.json" },
    "masscan": { "status": "ok", "totalPorts": 3, "storageKey": ".../tools/masscan.json" }
  }
}
```

---

## Backward Compatibility

- Existing code reading `report.results.ports` will still work (uses `_aggregated` data)
- New code can access individual tools via `report.toolStorageKeys.nmap`
- Resource queries for `stages` resource still work
- New `tools` resource provides granular querying

---

## Migration Path

1. ✅ Update all `_run*()` methods to return `_individual` and `_aggregated`
2. ✅ Update `_persistReport()` to store both views
3. ✅ Add `tools` resource definition
4. ✅ Update `_persistToResources()` to track individual tools
5. ✅ Update documentation and examples
6. ✅ Test with full scan to verify all 18+ tools persist separately

---

## Next Steps

1. Implement changes to stage methods
2. Update persistence logic
3. Add `tools` resource
4. Update tests
5. Update documentation

**Status**: 🟡 In Progress
**Priority**: High (user requirement)
