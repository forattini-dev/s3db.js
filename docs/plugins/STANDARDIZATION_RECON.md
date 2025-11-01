# ReconPlugin Standardization - Missing Sections

This file contains ready-to-insert content for ReconPlugin to match PuppeteerPlugin template.

---

## SECTION: Usage Journey

Insert this after the "Quick Start" section and before "Configuration Reference".

---

## Usage Journey

### Level 1: Basic DNS Lookup

Simple DNS resolution without any advanced features.

```javascript
import { Database } from 's3db.js';
import { ReconPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });
const recon = new ReconPlugin({
  dns: { enabled: true }
});

await db.usePlugin(recon);
await db.connect();

// Perform basic DNS lookup
const result = await recon.scan('example.com', { dns: true });

console.log('DNS Records:', result.dns);
// {
//   A: ['93.184.216.34'],
//   AAAA: ['2606:2800:220:1:248:1893:25c8:1946'],
//   MX: [{ priority: 10, exchange: 'mail.example.com' }],
//   TXT: ['v=spf1 include:_spf.example.com ~all']
// }
```

**What you get:**
- Basic DNS resolution (A, AAAA, MX, TXT records)
- Simple single-target scanning
- Results logged to console

**What's missing:**
- No storage of results
- No scheduled monitoring
- No advanced tools (ports, TLS, subdomains)

---

### Level 2: Multi-Tool Scan

Add port scanning and TLS analysis for comprehensive reconnaissance.

```javascript
const recon = new ReconPlugin({
  dns: { enabled: true },
  ports: {
    enabled: true,
    commonPorts: true,  // Scan top 1000 ports
    timeout: 3000
  },
  tls: {
    enabled: true,
    checkCertificate: true,
    checkExpiration: true
  }
});

await db.usePlugin(recon);

// Comprehensive scan
const result = await recon.scan('example.com');

console.log('Open Ports:', result.ports.open);
// [80, 443]

console.log('TLS Certificate:', result.tls.certificate);
// {
//   subject: 'CN=example.com',
//   issuer: 'CN=DigiCert SHA2 Secure Server CA',
//   validFrom: '2024-01-01T00:00:00.000Z',
//   validTo: '2025-01-01T00:00:00.000Z',
//   daysUntilExpiration: 234
// }
```

**What you get:**
- DNS resolution + port scanning + TLS analysis
- Comprehensive security posture view
- Certificate expiration tracking

**Performance:**
- DNS: ~100-500ms
- Port scan (1000 ports): ~30-60s
- TLS analysis: ~1-3s
- **Total: ~1-2 minutes per target**

---

### Level 3: Scheduled Monitoring

Set up continuous reconnaissance with automated sweeps.

```javascript
const recon = new ReconPlugin({
  namespace: 'production-monitoring',
  dns: { enabled: true },
  ports: { enabled: true, commonPorts: true },
  tls: { enabled: true, checkExpiration: true },

  // Enable scheduler
  scheduler: {
    enabled: true,
    interval: 3600000,  // Every hour
    targets: ['api.example.com', 'www.example.com']
  }
});

await db.usePlugin(recon);
await db.connect();

// Monitor for changes
recon.on('artifact.changed', async ({ tool, target, changes }) => {
  if (tool === 'ports' && changes.newOpenPorts.length > 0) {
    console.warn(`⚠️ New open ports on ${target}:`, changes.newOpenPorts);
    // Send alert (email, Slack, PagerDuty, etc.)
  }

  if (tool === 'tls' && changes.certificateChanged) {
    console.log(`🔒 TLS certificate updated on ${target}`);
  }
});

// Scheduler runs automatically every hour
// Results stored in artifacts resources with partitions
```

**What you get:**
- Automated hourly scans
- Change detection (new ports, certificate changes)
- Historical artifact storage
- Alert integration hooks

**Resource usage:**
- Artifacts stored in partitioned resources
- O(1) queries by target/date/namespace
- Automatic TTL cleanup (if configured)

---

### Level 4: Behavior Presets (Passive/Stealth/Aggressive)

Use pre-configured behavior modes for different operational contexts.

```javascript
// Passive mode - OSINT only, no active scanning
const passiveRecon = new ReconPlugin({
  behavior: 'passive',
  namespace: 'osint'
});

await db.usePlugin(passiveRecon);

// Only passive tools execute
const osintResults = await passiveRecon.scan('example.com');
// Uses: DNS (basic), crt.sh, theHarvester, WHOIS
// Skips: nmap, masscan, active probing

// ---

// Stealth mode - Minimal noise, rate-limited
const stealthRecon = new ReconPlugin({
  behavior: 'stealth',
  namespace: 'pentest',
  targets: ['client.example.com']
});

await db.usePlugin(stealthRecon);

// Low-noise scanning with rate limiting
const stealthResults = await stealthRecon.scan('client.example.com');
// Concurrency: 1 (sequential)
// Rate limit: 10 req/min, 5s delays
// nmap: -T2 timing (polite), top 10 ports only

// ---

// Aggressive mode - Full reconnaissance suite
const aggressiveRecon = new ReconPlugin({
  behavior: 'aggressive',
  namespace: 'internal-audit'
});

await db.usePlugin(aggressiveRecon);

// Comprehensive deep-dive scan
const fullResults = await aggressiveRecon.scan('intranet.corp.local');
// All tools enabled
// Concurrency: 8 parallel
// Full port range, web fuzzing, vuln scanning
```

**Preset Comparison:**

| Feature | Passive | Stealth | Aggressive |
|---------|---------|---------|------------|
| DNS | Basic A/AAAA | Full enumeration | Full enumeration |
| Port Scan | ❌ None | Top 10 ports | Full range (1-65535) |
| Subdomain Discovery | crt.sh only | subfinder + crt.sh | amass + subfinder + assetfinder |
| Web Fuzzing | ❌ None | ❌ None | ffuf + feroxbuster |
| Vuln Scanning | ❌ None | ❌ None | nikto + wpscan |
| Concurrency | 2 | 1 (sequential) | 8 (parallel) |
| Rate Limiting | Disabled | 10 req/min | Disabled |
| Scan Duration | 30-60s | 2-5 min | 10-30 min |

---

### Level 5: Production Deployment

Complete production setup with namespaces, TTL, and monitoring.

```javascript
import { Database } from 's3db.js';
import { ReconPlugin, TTLPlugin, MetricsPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });

// Production recon with monitoring
const recon = new ReconPlugin({
  namespace: 'production',
  behavior: 'stealth',  // Low-noise scanning

  dns: { enabled: true },
  ports: { enabled: true, commonPorts: true },
  tls: { enabled: true, checkExpiration: true },
  subdomains: { enabled: true },

  scheduler: {
    enabled: true,
    interval: 3600000,  // Hourly sweeps
    targets: [
      'api.example.com',
      'www.example.com',
      'cdn.example.com'
    ]
  },

  uptime: {
    enabled: true,
    interval: 60000,  // Check every minute
    checkHTTP: true,
    checkHTTPS: true,
    checkPing: true,
    alertThreshold: 3  // Alert after 3 failures
  },

  rateLimit: {
    enabled: true,
    requestsPerMinute: 30,
    delayBetweenStages: 2000
  }
});

// TTL plugin for automatic cleanup
const ttl = new TTLPlugin({
  resources: {
    plg_recon_artifacts_dns: { ttl: 2592000000 },      // 30 days
    plg_recon_artifacts_ports: { ttl: 2592000000 },    // 30 days
    plg_recon_artifacts_tls: { ttl: 2592000000 },      // 30 days
    plg_recon_artifacts_subdomains: { ttl: 2592000000 }, // 30 days
    plg_recon_uptime: { ttl: 7776000000 }              // 90 days
  }
});

// Metrics plugin for performance monitoring
const metrics = new MetricsPlugin({
  enabled: true,
  aggregations: ['p50', 'p95', 'p99']
});

await db.usePlugin(recon);
await db.usePlugin(ttl);
await db.usePlugin(metrics);
await db.connect();

// Monitor uptime failures
recon.on('uptime.failure', async ({ target, failures, lastError }) => {
  if (failures >= 3) {
    console.error(`🚨 ALERT: ${target} is down (${failures} failures)`);
    // Send alert to PagerDuty/Slack/Email
  }
});

// Monitor scan performance
recon.on('scan.complete', async ({ target, duration, tools }) => {
  console.log(`✓ Scanned ${target} in ${duration}ms`);
  console.log(`  Tools: ${Object.keys(tools).join(', ')}`);
});

// Query historical data
const dnsHistory = await db.resources.plg_recon_artifacts_dns.query({
  target: 'api.example.com',
  createdAt: { $gte: Date.now() - 86400000 }  // Last 24 hours
});

console.log(`Found ${dnsHistory.length} DNS artifacts in last 24h`);
```

**Production Checklist:**
- ✅ Namespace isolation (production/staging/dev)
- ✅ Behavior preset configured (stealth for minimal noise)
- ✅ TTL plugin for automatic cleanup
- ✅ Metrics plugin for performance tracking
- ✅ Uptime monitoring with alerts
- ✅ Rate limiting enabled
- ✅ Scheduled sweeps configured
- ✅ Event handlers for alerting
- ✅ Historical data queries

---

## SECTION: Configuration Examples

Insert this after "Configuration Reference" section.

---

## 📚 Configuration Examples

### Example 1: OSINT Reconnaissance (Passive Only)

```javascript
new ReconPlugin({
  behavior: 'passive',
  namespace: 'osint',
  dns: { enabled: true },
  subdomains: {
    enabled: true,
    sources: {
      crtsh: { enabled: true },
      securitytrails: { enabled: true, apiKey: process.env.ST_KEY }
    }
  },
  whois: { enabled: true }
})
```

**Use case:** Bug bounty pre-engagement, compliance-restricted environments

---

### Example 2: Penetration Testing (Stealth Mode)

```javascript
new ReconPlugin({
  behavior: 'stealth',
  namespace: 'pentest',
  targets: ['client.example.com'],
  dns: { enabled: true },
  ports: { enabled: true, commonPorts: true },
  tls: { enabled: true, checkCertificate: true },
  subdomains: { enabled: true },
  rateLimit: {
    enabled: true,
    requestsPerMinute: 10,
    delayBetweenStages: 5000
  }
})
```

**Use case:** Authorized penetration testing, red team engagements

---

### Example 3: Internal Audit (Aggressive Mode)

```javascript
new ReconPlugin({
  behavior: 'aggressive',
  namespace: 'audit',
  targets: ['intranet.corp.local'],
  dns: { enabled: true },
  ports: {
    enabled: true,
    customPorts: [1-65535],  // Full port range
    serviceDetection: true
  },
  tls: { enabled: true, checkCipherSuites: true },
  subdomains: { enabled: true },
  http: { enabled: true, checkSecurityHeaders: true }
})
```

**Use case:** Internal network audits, security posture assessment

---

### Example 4: Continuous Monitoring (Scheduled Sweeps)

```javascript
new ReconPlugin({
  namespace: 'monitoring',
  scheduler: {
    enabled: true,
    interval: 3600000,  // Every hour
    targets: ['api.example.com', 'www.example.com']
  },
  uptime: {
    enabled: true,
    interval: 60000,  // Every minute
    checkHTTP: true,
    checkHTTPS: true,
    alertThreshold: 3
  }
})
```

**Use case:** Production uptime monitoring, change detection

---

### Example 5: Multi-Instance Isolation (Namespaces)

```javascript
// Production instance
const prodRecon = new ReconPlugin({
  namespace: 'production',
  behavior: 'stealth',
  targets: ['api.example.com']
});

// Staging instance
const stagingRecon = new ReconPlugin({
  namespace: 'staging',
  behavior: 'aggressive',
  targets: ['staging.example.com']
});

await db.usePlugin(prodRecon);
await db.usePlugin(stagingRecon);

// Artifacts are isolated by namespace
const prodDns = await db.resources.plg_recon_artifacts_dns.listPartition('byNamespace', {
  namespace: 'production'
});
```

**Use case:** Multi-tenant SaaS, environment separation

---

## SECTION: API Reference

Insert this after "Configuration Examples" section.

---

## 🔧 API Reference

### Plugin Methods

#### `scan(target, options): Promise<Object>`

Perform a comprehensive reconnaissance scan on a target.

**Signature:**
```javascript
await recon.scan(target, options)
```

**Parameters:**
- `target` (string, required): Hostname or IP address to scan
- `options` (object, optional): Tool selection and configuration
  - `dns` (boolean): Enable DNS resolution (default: `true`)
  - `ports` (boolean): Enable port scanning (default: `true`)
  - `tls` (boolean): Enable TLS analysis (default: `true`)
  - `subdomains` (boolean): Enable subdomain discovery (default: `true`)
  - `http` (boolean): Enable HTTP header analysis (default: `false`)
  - `whois` (boolean): Enable WHOIS lookup (default: `false`)

**Returns:** Promise resolving to scan results object

**Example:**
```javascript
// Full scan
const results = await recon.scan('example.com');

// Selective tools
const dnsOnly = await recon.scan('example.com', {
  dns: true,
  ports: false,
  tls: false,
  subdomains: false
});

console.log(dnsOnly);
// {
//   target: 'example.com',
//   timestamp: 1704067200000,
//   dns: { A: ['93.184.216.34'], AAAA: [...] },
//   duration: 523
// }
```

---

#### `scanBatch(targets, options): Promise<Array<Object>>`

Scan multiple targets in parallel.

**Signature:**
```javascript
await recon.scanBatch(targets, options)
```

**Parameters:**
- `targets` (string[], required): Array of hostnames or IP addresses
- `options` (object, optional): Tool selection (same as `scan()`)

**Returns:** Promise resolving to array of scan results

**Example:**
```javascript
const targets = ['example.com', 'test.com', 'demo.com'];
const results = await recon.scanBatch(targets, { dns: true, ports: true });

console.log(`Scanned ${results.length} targets`);
results.forEach(r => {
  console.log(`${r.target}: ${r.ports.open.length} open ports`);
});
```

**Performance:**
- Concurrency controlled by `performance.maxConcurrent` (default: 5)
- Average time: ~1-2 minutes per target (depends on tools enabled)

---

#### `addTarget(config): Promise<string>`

Add a target for scheduled monitoring.

**Signature:**
```javascript
await recon.addTarget(config)
```

**Parameters:**
- `config` (object, required): Target configuration
  - `host` (string, required): Hostname or IP address
  - `schedule` (string, optional): Cron expression for scheduling
  - `tools` (string[], optional): Tools to enable (default: all enabled tools)
  - `alerts` (object, optional): Alert configuration
    - `onPortChange` (boolean): Alert on new/closed ports
    - `onTlsExpiration` (number): Days before TLS expiration to alert
    - `onDnsChange` (boolean): Alert on DNS record changes

**Returns:** Promise resolving to target ID

**Example:**
```javascript
const targetId = await recon.addTarget({
  host: 'api.example.com',
  schedule: '*/30 * * * *',  // Every 30 minutes
  tools: ['dns', 'ports', 'tls'],
  alerts: {
    onPortChange: true,
    onTlsExpiration: 30  // Alert 30 days before expiration
  }
});

console.log(`Target added: ${targetId}`);
```

---

#### `removeTarget(targetId): Promise<void>`

Remove a target from scheduled monitoring.

**Signature:**
```javascript
await recon.removeTarget(targetId)
```

**Parameters:**
- `targetId` (string, required): Target identifier (returned by `addTarget()`)

**Returns:** Promise resolving to void

**Example:**
```javascript
await recon.removeTarget('target_abc123');
console.log('Target removed from monitoring');
```

---

#### `getArtifacts(tool, query): Promise<Array<Object>>`

Query artifacts for a specific tool.

**Signature:**
```javascript
await recon.getArtifacts(tool, query)
```

**Parameters:**
- `tool` (string, required): Tool name (`'dns'`, `'ports'`, `'tls'`, `'subdomains'`)
- `query` (object, optional): Query parameters
  - `target` (string): Filter by target hostname
  - `namespace` (string): Filter by namespace
  - `startDate` (number|string): Filter by start date
  - `endDate` (number|string): Filter by end date
  - `limit` (number): Maximum results to return (default: 100)

**Returns:** Promise resolving to array of artifact objects

**Example:**
```javascript
// Get latest DNS artifacts
const dnsArtifacts = await recon.getArtifacts('dns', {
  target: 'example.com',
  limit: 10
});

console.log(`Found ${dnsArtifacts.length} DNS artifacts`);
dnsArtifacts.forEach(a => {
  console.log(`${new Date(a.timestamp).toISOString()}: ${a.data.A.join(', ')}`);
});

// Get port scans from last 7 days
const portScans = await recon.getArtifacts('ports', {
  target: 'api.example.com',
  startDate: Date.now() - 7 * 86400000,
  endDate: Date.now()
});
```

---

#### `getAllArtifacts(target, options): Promise<Object>`

Get all artifacts for a target across all tools.

**Signature:**
```javascript
await recon.getAllArtifacts(target, options)
```

**Parameters:**
- `target` (string, required): Target hostname
- `options` (object, optional): Query options
  - `startDate` (number|string): Filter by start date
  - `endDate` (number|string): Filter by end date
  - `namespace` (string): Filter by namespace

**Returns:** Promise resolving to object with artifacts grouped by tool

**Example:**
```javascript
const allArtifacts = await recon.getAllArtifacts('example.com', {
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});

console.log(allArtifacts);
// {
//   dns: [ {...}, {...}, ... ],
//   ports: [ {...}, {...}, ... ],
//   tls: [ {...}, {...}, ... ],
//   subdomains: [ {...}, {...}, ... ]
// }
```

---

#### `detectChanges(target, options): Promise<Object>`

Detect changes in reconnaissance data over time.

**Signature:**
```javascript
await recon.detectChanges(target, options)
```

**Parameters:**
- `target` (string, required): Target hostname
- `options` (object, optional): Detection options
  - `tool` (string): Specific tool to analyze (`'dns'`, `'ports'`, `'tls'`, `'subdomains'`)
  - `timeRange` (string): Time range to analyze (`'last-24h'`, `'last-7-days'`, `'last-30-days'`)
  - `compareWith` (number|string): Specific timestamp to compare against

**Returns:** Promise resolving to change summary object

**Example:**
```javascript
// Detect port changes in last 7 days
const portChanges = await recon.detectChanges('example.com', {
  tool: 'ports',
  timeRange: 'last-7-days'
});

console.log(portChanges);
// {
//   target: 'example.com',
//   tool: 'ports',
//   changes: {
//     newOpenPorts: [8080, 8443],
//     closedPorts: [21],
//     unchanged: [80, 443, 22]
//   },
//   timestamps: {
//     baseline: 1704067200000,
//     current: 1704672000000
//   }
// }
```

---

#### `getToolStatus(): Promise<Object>`

Check availability of all reconnaissance tools.

**Signature:**
```javascript
await recon.getToolStatus()
```

**Returns:** Promise resolving to tool status object

**Example:**
```javascript
const status = await recon.getToolStatus();
console.log(status);
// {
//   dns: { available: true, command: 'dig', version: '9.18.1' },
//   nmap: { available: true, command: 'nmap', version: '7.94' },
//   amass: { available: false, error: 'Command not found: amass' },
//   subfinder: { available: true, command: 'subfinder', version: '2.5.4' },
//   masscan: { available: false, error: 'Command not found: masscan' }
// }
```

---

#### `isToolAvailable(tool): Promise<boolean>`

Check if a specific tool is available.

**Signature:**
```javascript
await recon.isToolAvailable(tool)
```

**Parameters:**
- `tool` (string, required): Tool name to check

**Returns:** Promise resolving to boolean

**Example:**
```javascript
const hasNmap = await recon.isToolAvailable('nmap');
if (!hasNmap) {
  console.error('nmap not installed - port scanning disabled');
}
```

---

## SECTION: Best Practices

Insert this after "API Reference" section.

---

## ✅ Best Practices

### Do's ✅

1. **Use namespaces for isolation**
   ```javascript
   // ✅ Production scans
   const prodRecon = new ReconPlugin({ namespace: 'production' });

   // ✅ Development scans
   const devRecon = new ReconPlugin({ namespace: 'development' });

   // Artifacts are isolated by namespace
   ```

2. **Configure appropriate behavior presets**
   ```javascript
   // ✅ Passive for pre-engagement OSINT
   behavior: 'passive'

   // ✅ Stealth for authorized pentesting
   behavior: 'stealth'

   // ✅ Aggressive for internal audits
   behavior: 'aggressive'
   ```

3. **Enable rate limiting for stealth operations**
   ```javascript
   // ✅ Prevent IDS/IPS alerts
   rateLimit: {
     enabled: true,
     requestsPerMinute: 30,
     delayBetweenStages: 2000
   }
   ```

4. **Use partitioned queries for performance**
   ```javascript
   // ✅ O(1) lookup by partition
   const artifacts = await db.resources.plg_recon_artifacts_dns.listPartition('byTarget', {
     target: 'example.com'
   });

   // ❌ Avoid full scans
   // const all = await db.resources.plg_recon_artifacts_dns.list();
   ```

5. **Set up TTL for automatic cleanup**
   ```javascript
   // ✅ Clean up old artifacts automatically
   const ttl = new TTLPlugin({
     resources: {
       plg_recon_artifacts_dns: { ttl: 2592000000 },  // 30 days
       plg_recon_artifacts_ports: { ttl: 2592000000 }
     }
   });
   ```

6. **Monitor for changes**
   ```javascript
   // ✅ Alert on infrastructure changes
   recon.on('artifact.changed', async ({ tool, target, changes }) => {
     if (tool === 'ports' && changes.newOpenPorts.length > 0) {
       console.warn(`⚠️ New ports: ${changes.newOpenPorts}`);
     }
   });
   ```

7. **Check tool availability before scanning**
   ```javascript
   // ✅ Verify tools are installed
   const status = await recon.getToolStatus();
   if (!status.nmap.available) {
     console.warn('nmap not installed - port scanning will be skipped');
   }
   ```

8. **Configure timeouts based on network conditions**
   ```javascript
   // ✅ Increase timeouts for slow networks
   dns: { timeout: 10000 },
   ports: { timeout: 5000 },
   subdomains: { sources: { virustotal: { timeout: 60000 } } }
   ```

---

### Don'ts ❌

1. **Don't scan without authorization**
   ```javascript
   // ❌ Never scan targets you don't own or have permission to scan
   await recon.scan('competitor.com');  // Illegal in most jurisdictions

   // ✅ Only scan authorized targets
   await recon.scan('mycompany.com');
   ```

2. **Don't use aggressive mode on external targets**
   ```javascript
   // ❌ Aggressive scanning on external targets triggers IDS/IPS
   behavior: 'aggressive'  // On public websites

   // ✅ Use stealth or passive mode
   behavior: 'stealth'
   ```

3. **Don't ignore rate limiting**
   ```javascript
   // ❌ Rapid scanning triggers alerts
   rateLimit: { enabled: false }

   // ✅ Enable rate limiting for stealth
   rateLimit: { enabled: true, requestsPerMinute: 30 }
   ```

4. **Don't forget to clean up old data**
   ```javascript
   // ❌ Artifacts accumulate indefinitely
   // No TTL configured

   // ✅ Use TTL plugin for cleanup
   await db.usePlugin(new TTLPlugin({ resources: { ... } }));
   ```

5. **Don't rely on single resolvers**
   ```javascript
   // ❌ Single resolver = single point of failure
   dns: { resolvers: ['8.8.8.8'] }

   // ✅ Use multiple resolvers
   dns: { resolvers: ['8.8.8.8', '1.1.1.1', '208.67.222.222'] }
   ```

6. **Don't use default timeouts for external APIs**
   ```javascript
   // ❌ External APIs need longer timeouts
   subdomains: { sources: { virustotal: { timeout: 5000 } } }

   // ✅ Increase timeout for external services
   subdomains: { sources: { virustotal: { timeout: 60000 } } }
   ```

---

## SECTION: Error Handling

Insert this after "Best Practices" section.

---

## 🚨 Error Handling

### Common Errors

#### 1. ToolNotFoundError: "Tool not available"

**Cause:** Required reconnaissance tool not installed

**Solution:**
```javascript
// Check tool availability first
const status = await recon.getToolStatus();
if (!status.nmap.available) {
  console.error('Install nmap: sudo apt install nmap');
}

// Or let plugin skip missing tools automatically
recon.on('recon:tool-unavailable', ({ tool, stage }) => {
  console.warn(`Skipping ${stage} - ${tool} not installed`);
});
```

---

#### 2. TimeoutError: "Scan timeout exceeded"

**Cause:** Target took too long to respond

**Solution:**
```javascript
// Increase timeouts
const recon = new ReconPlugin({
  dns: { timeout: 10000 },       // 10 seconds
  ports: { timeout: 5000 },       // 5 seconds per port
  tls: { timeout: 15000 },        // 15 seconds
  performance: { timeout: 600000 } // 10 minutes per target
});

// Or reduce scan scope
ports: { commonPorts: true }  // Only top 1000 ports instead of full range
```

---

#### 3. RateLimitError: "API rate limit exceeded"

**Cause:** External API (VirusTotal, SecurityTrails) rate limit hit

**Solution:**
```javascript
// Add API key for higher limits
subdomains: {
  sources: {
    virustotal: {
      enabled: true,
      apiKey: process.env.VT_API_KEY,  // Premium API key
      rateLimit: { requests: 4, per: 60000 }  // 4 req/min free tier
    }
  }
}

// Or disable external sources
subdomains: {
  sources: {
    crtsh: { enabled: true },  // No rate limit
    virustotal: { enabled: false }  // Disable if no API key
  }
}
```

---

#### 4. NetworkError: "DNS resolution failed"

**Cause:** DNS resolver unreachable or target doesn't exist

**Solution:**
```javascript
// Use multiple resolvers for failover
dns: {
  resolvers: [
    '8.8.8.8',        // Google
    '1.1.1.1',        // Cloudflare
    '208.67.222.222'  // OpenDNS
  ],
  retries: 3
}

// Handle errors gracefully
try {
  const result = await recon.scan('nonexistent.invalid');
} catch (error) {
  if (error.name === 'NetworkError') {
    console.error(`DNS resolution failed: ${error.message}`);
  }
}
```

---

#### 5. PermissionError: "Insufficient permissions"

**Cause:** Port scanning requires elevated privileges

**Solution:**
```bash
# Run with sudo (not recommended for production)
sudo node scan.js

# Or use setcap to grant port permissions (recommended)
sudo setcap cap_net_raw,cap_net_admin=eip $(which node)
```

---

#### 6. StorageError: "Failed to save artifact"

**Cause:** S3 storage issues (permissions, quota, network)

**Solution:**
```javascript
// Verify S3 permissions
const db = new Database({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@bucket/path'
});

// Check storage quota
const artifacts = await db.resources.plg_recon_artifacts_dns.list();
console.log(`Stored ${artifacts.length} DNS artifacts`);

// Enable TTL to prevent quota exhaustion
await db.usePlugin(new TTLPlugin({
  resources: {
    plg_recon_artifacts_dns: { ttl: 2592000000 }  // 30 days
  }
}));
```

---

## SECTION: FAQ

Insert this at the end of the document.

---

## ❓ FAQ

### General

**Q: What's the difference between `scan()` and `scanBatch()`?**

A:
- `scan(target, options)` - Scan a single target, returns single result object
- `scanBatch(targets, options)` - Scan multiple targets in parallel, returns array of results

```javascript
// Single target
const result = await recon.scan('example.com');
console.log(result.dns.A);

// Multiple targets (parallel execution)
const results = await recon.scanBatch(['example.com', 'test.com', 'demo.com']);
console.log(`Scanned ${results.length} targets`);
```

**Concurrency:** `scanBatch()` uses `performance.maxConcurrent` (default: 5) to limit parallel scans.

---

**Q: How long does a full scan take?**

A: Depends on tools enabled and target:

| Configuration | Average Time | Notes |
|---------------|--------------|-------|
| DNS only | 100-500ms | Fast resolution |
| DNS + Ports (top 1000) | 30-60s | Port scanning is slow |
| DNS + Ports + TLS | 45-75s | Add ~5-10s for TLS |
| DNS + Ports + TLS + Subdomains | 1-2min | Subdomain discovery adds ~30-60s |
| Aggressive mode (all tools) | 10-30min | Full port range, web fuzzing, vuln scanning |

**Optimization Tips:**
- Use `commonPorts: true` instead of full port range (60x faster)
- Disable subdomain brute-forcing (uses passive sources only)
- Enable `performance.maxConcurrent` for parallel execution

---

**Q: Can I run multiple ReconPlugin instances?**

A: Yes! Use namespaces to isolate instances:

```javascript
// Production instance
const prodRecon = new ReconPlugin({ namespace: 'production' });

// Staging instance
const stagingRecon = new ReconPlugin({ namespace: 'staging' });

// Development instance
const devRecon = new ReconPlugin({ namespace: 'development' });

await db.usePlugin(prodRecon);
await db.usePlugin(stagingRecon);
await db.usePlugin(devRecon);

// Artifacts are isolated by namespace
const prodArtifacts = await db.resources.plg_recon_artifacts_dns.listPartition('byNamespace', {
  namespace: 'production'
});
```

---

### Behavior Modes

**Q: When should I use each behavior mode?**

A:

| Mode | Use Case | Scan Duration | Detection Risk |
|------|----------|---------------|----------------|
| **Passive** | Bug bounty pre-engagement, OSINT, compliance-restricted environments | 30-60s | Minimal (no active scanning) |
| **Stealth** | Authorized pentesting, red team engagements, IDS/IPS evasion | 2-5min | Low (rate-limited, polite timing) |
| **Aggressive** | Internal audits, owned infrastructure, security assessments | 10-30min | High (full scan, no rate limiting) |

```javascript
// Bug bounty recon (before scope confirmation)
behavior: 'passive'

// Authorized pentest (client engagement)
behavior: 'stealth'

// Internal security audit (owned infrastructure)
behavior: 'aggressive'
```

---

**Q: Can I override preset defaults?**

A: Yes, use `behaviorOverrides`:

```javascript
const recon = new ReconPlugin({
  behavior: 'stealth',  // Start with stealth preset

  // Override specific settings
  behaviorOverrides: {
    features: {
      ports: {
        topPorts: 50  // Scan more ports than stealth default (10)
      },
      subdomains: {
        amass: true   // Enable amass (disabled in stealth)
      }
    },
    concurrency: 3,     // Increase from 1 to 3
    rateLimit: {
      requestsPerMinute: 20  // Increase from 10 to 20
    }
  }
});
```

---

**Q: What tools are included in each mode?**

A:

| Tool | Passive | Stealth | Aggressive |
|------|---------|---------|------------|
| DNS (basic A/AAAA) | ✅ | ✅ | ✅ |
| DNS (full enumeration) | ❌ | ✅ | ✅ |
| Port scan (top 10) | ❌ | ✅ | ❌ |
| Port scan (top 1000) | ❌ | ❌ | ✅ |
| Port scan (full range) | ❌ | ❌ | ✅ |
| nmap service detection | ❌ | ❌ | ✅ |
| masscan | ❌ | ❌ | ✅ |
| Subdomain (crt.sh) | ✅ | ✅ | ✅ |
| Subdomain (subfinder) | ❌ | ✅ | ✅ |
| Subdomain (amass) | ❌ | ❌ | ✅ |
| TLS audit (basic) | ❌ | ✅ | ✅ |
| TLS audit (comprehensive) | ❌ | ❌ | ✅ |
| Web fuzzing | ❌ | ❌ | ✅ |
| Vuln scanning (nikto) | ❌ | ❌ | ✅ |

---

### Tools & Dependencies

**Q: What happens if a tool is not installed?**

A: ReconPlugin automatically skips stages when tools are unavailable:

```javascript
// Check tool status
const status = await recon.getToolStatus();
console.log(status);
// {
//   nmap: { available: true, version: '7.94' },
//   amass: { available: false, error: 'Command not found: amass' }
// }

// Scan continues with available tools only
recon.on('recon:tool-unavailable', ({ tool, stage }) => {
  console.warn(`Skipping ${stage} - ${tool} not installed`);
});

const results = await recon.scan('example.com');
// Only executes stages with available tools
```

---

**Q: How do I install missing tools?**

A:

```bash
# Subdomain enumeration
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/OWASP/Amass/v3/...@master
go install github.com/tomnomnom/assetfinder@latest

# Port scanning
sudo apt install nmap
go install github.com/robertdavidgraham/masscan@latest

# Web fuzzing
go install github.com/ffuf/ffuf/v2@latest
cargo install feroxbuster
go install github.com/OJ/gobuster/v3@latest

# TLS auditing
apt install testssl.sh sslyze

# Fingerprinting
apt install whatweb
```

---

**Q: Which tools are prioritized when multiple tools serve the same purpose?**

A:

**Subdomain Discovery:**
1. **amass** (most comprehensive, slowest)
2. **subfinder** (fast, reliable)
3. **assetfinder** (fallback)
4. **crt.sh** (passive, always available)

**Port Scanning:**
1. **masscan** (fastest for full range)
2. **nmap** (most features, service detection)

**Web Fuzzing:**
1. **ffuf** (fastest)
2. **feroxbuster** (good features)
3. **gobuster** (fallback)

---

### Storage & Performance

**Q: How are artifacts stored?**

A: Artifacts are stored in partitioned S3DB resources:

```javascript
// Resources created by ReconPlugin
plg_recon_artifacts_dns       // Partitions: byTarget, byDate, byNamespace
plg_recon_artifacts_ports      // Partitions: byTarget, byDate, byNamespace
plg_recon_artifacts_tls        // Partitions: byTarget, byDate, byNamespace
plg_recon_artifacts_subdomains // Partitions: byTarget, byDate, byNamespace
plg_recon_progress             // Partitions: byTarget, byStatus
plg_recon_uptime               // Partitions: byTarget, byCohort

// O(1) queries using partitions
const dnsArtifacts = await db.resources.plg_recon_artifacts_dns.listPartition('byTarget', {
  target: 'example.com'
});
```

---

**Q: How much storage do artifacts use?**

A: Average storage per artifact:

| Artifact Type | Average Size | Notes |
|---------------|--------------|-------|
| DNS | 500 bytes - 2KB | Depends on record count |
| Ports | 1KB - 5KB | Depends on open ports |
| TLS | 2KB - 10KB | Certificate data |
| Subdomains | 5KB - 50KB | Can be large for many subdomains |
| Uptime | 200 bytes | Minimal overhead |

**Optimization:**
- Enable compression: `storage: { compression: true }` (30-50% reduction)
- Use TTL plugin to auto-delete old artifacts
- Archive historical data to cheaper storage

---

**Q: How do I clean up old artifacts?**

A: Use TTL plugin for automatic cleanup:

```javascript
import { TTLPlugin } from 's3db.js/plugins';

const ttl = new TTLPlugin({
  resources: {
    plg_recon_artifacts_dns: { ttl: 2592000000 },       // 30 days
    plg_recon_artifacts_ports: { ttl: 2592000000 },     // 30 days
    plg_recon_artifacts_tls: { ttl: 2592000000 },       // 30 days
    plg_recon_artifacts_subdomains: { ttl: 2592000000 }, // 30 days
    plg_recon_uptime: { ttl: 7776000000 }               // 90 days
  }
});

await db.usePlugin(ttl);

// Artifacts older than TTL are automatically deleted
```

---

**Q: How do I query historical data?**

A: Use partitioned queries for O(1) lookups:

```javascript
// Get DNS artifacts for specific target
const dnsArtifacts = await db.resources.plg_recon_artifacts_dns.listPartition('byTarget', {
  target: 'example.com'
});

// Get all artifacts from last 7 days
const recentArtifacts = await db.resources.plg_recon_artifacts_dns.query({
  createdAt: { $gte: Date.now() - 7 * 86400000 }
});

// Get artifacts by namespace
const prodArtifacts = await db.resources.plg_recon_artifacts_dns.listPartition('byNamespace', {
  namespace: 'production'
});

// Detect changes over time
const changes = await recon.detectChanges('example.com', {
  tool: 'ports',
  timeRange: 'last-7-days'
});
```

---

### Rate Limiting & Stealth

**Q: How does rate limiting work?**

A: Rate limiting throttles scan stages to avoid triggering IDS/IPS:

```javascript
rateLimit: {
  enabled: true,
  requestsPerMinute: 30,      // Max 30 requests/min
  delayBetweenStages: 2000    // 2 second delay between stages
}

// Events emitted
recon.on('recon:rate-limit-delay', ({ stage, delayMs }) => {
  console.log(`⏳ Waiting ${delayMs}ms before ${stage} stage`);
});
```

**Stages:**
1. DNS resolution
2. Port scanning
3. TLS analysis
4. Subdomain discovery
5. HTTP header analysis
6. WHOIS lookup

**Delays:**
- Between stages: `delayBetweenStages` (default: 2000ms)
- Between requests: Auto-calculated from `requestsPerMinute`

---

**Q: When should I enable rate limiting?**

A:

| Scenario | Rate Limiting | Notes |
|----------|---------------|-------|
| Internal network audits | ❌ Disabled | You own the infrastructure |
| Bug bounty (authorized) | ✅ Enabled | Respect target's resources |
| Penetration testing | ✅ Enabled | Avoid IDS/IPS detection |
| OSINT (passive mode) | ❌ Disabled | No active scanning |
| Production monitoring | ✅ Enabled | Avoid impacting services |

```javascript
// Internal audit - disable rate limiting
rateLimit: { enabled: false }

// Authorized pentest - enable rate limiting
rateLimit: {
  enabled: true,
  requestsPerMinute: 10,
  delayBetweenStages: 5000
}
```

---

**Q: How do I minimize detection risk?**

A: Combine stealth behavior with rate limiting:

```javascript
const recon = new ReconPlugin({
  behavior: 'stealth',  // Low-noise preset
  rateLimit: {
    enabled: true,
    requestsPerMinute: 10,      // Very conservative
    delayBetweenStages: 5000    // 5 second delays
  },
  ports: {
    timeout: 5000,              // Longer timeouts (less aggressive)
    concurrent: 1               // Sequential port checks
  }
});

// Randomize scan timing
const jitter = Math.random() * 5000;
await new Promise(resolve => setTimeout(resolve, jitter));
await recon.scan('target.com');
```

---

### Uptime Monitoring

**Q: How does uptime monitoring work?**

A: ReconPlugin can continuously monitor target availability:

```javascript
const recon = new ReconPlugin({
  uptime: {
    enabled: true,
    interval: 60000,  // Check every minute
    targets: ['api.example.com', 'www.example.com'],
    checkHTTP: true,
    checkHTTPS: true,
    checkPing: true,
    alertThreshold: 3  // Alert after 3 consecutive failures
  }
});

// Monitor failures
recon.on('uptime.failure', async ({ target, failures, lastError }) => {
  if (failures >= 3) {
    console.error(`🚨 ${target} is down (${failures} failures)`);
    // Send alert to PagerDuty/Slack/Email
  }
});

// Monitor recovery
recon.on('uptime.recovery', async ({ target, downtime }) => {
  console.log(`✅ ${target} recovered after ${downtime}ms downtime`);
});
```

**Uptime Metrics:**
- HTTP/HTTPS response time
- Ping latency
- Failure count
- Downtime duration
- Availability percentage

---

**Q: How is uptime data stored?**

A: Uptime checks are stored in `plg_recon_uptime` resource:

```javascript
// Query uptime data
const uptimeData = await db.resources.plg_recon_uptime.listPartition('byTarget', {
  target: 'api.example.com'
});

// Calculate availability
const checks = uptimeData.length;
const failures = uptimeData.filter(d => !d.success).length;
const availability = ((checks - failures) / checks) * 100;

console.log(`Availability: ${availability.toFixed(2)}%`);
```

---

### Troubleshooting

**Q: Port scanning is very slow, how do I speed it up?**

A:

1. **Use common ports only** (60x faster):
   ```javascript
   ports: { commonPorts: true }  // Top 1000 ports
   ```

2. **Increase concurrency**:
   ```javascript
   ports: { concurrent: 20 }  // Scan 20 ports in parallel
   ```

3. **Use masscan instead of nmap** (10x faster):
   ```bash
   sudo apt install masscan
   ```

4. **Reduce timeout**:
   ```javascript
   ports: { timeout: 1000 }  // 1 second per port
   ```

---

**Q: Subdomain discovery is timing out, what should I do?**

A:

1. **Increase timeout**:
   ```javascript
   subdomains: {
     sources: {
       virustotal: { timeout: 60000 },  // 60 seconds
       securitytrails: { timeout: 60000 }
     }
   }
   ```

2. **Disable slow sources**:
   ```javascript
   subdomains: {
     sources: {
       crtsh: { enabled: true },        // Fast, no API key
       virustotal: { enabled: false },   // Slow, requires API key
       amass: { enabled: false }         // Very slow
     }
   }
   ```

3. **Use faster tools**:
   ```javascript
   subdomains: {
     sources: {
       subfinder: { enabled: true },  // Fast
       assetfinder: { enabled: true } // Fast
     }
   }
   ```

---

**Q: I'm getting DNS resolution errors, how do I fix this?**

A:

1. **Use multiple resolvers**:
   ```javascript
   dns: {
     resolvers: [
       '8.8.8.8',        // Google
       '1.1.1.1',        // Cloudflare
       '208.67.222.222', // OpenDNS
       '9.9.9.9'         // Quad9
     ],
     retries: 3
   }
   ```

2. **Increase timeout**:
   ```javascript
   dns: { timeout: 10000 }  // 10 seconds
   ```

3. **Check network connectivity**:
   ```bash
   # Test DNS resolution manually
   dig @8.8.8.8 example.com
   nslookup example.com 8.8.8.8
   ```

---

**Q: How do I debug scan failures?**

A:

```javascript
// Enable debug events
recon.on('scan.start', ({ target }) => {
  console.log(`🔍 Starting scan: ${target}`);
});

recon.on('scan.stage', ({ target, stage }) => {
  console.log(`  ⏳ Stage: ${stage}`);
});

recon.on('scan.error', ({ target, stage, error }) => {
  console.error(`  ❌ Error in ${stage}:`, error.message);
});

recon.on('scan.complete', ({ target, duration, tools }) => {
  console.log(`  ✅ Completed in ${duration}ms`);
  console.log(`  Tools: ${Object.keys(tools).join(', ')}`);
});

// Run scan
try {
  const results = await recon.scan('example.com');
} catch (error) {
  console.error('Scan failed:', error);
  console.error('Stack trace:', error.stack);
}
```

---

**Q: Can I customize resource names?**

A: No, resource names are standardized for plugin compatibility. However, you can use namespaces to isolate resources:

```javascript
// Production instance
const prodRecon = new ReconPlugin({ namespace: 'production' });
// Creates: plg_recon_artifacts_dns, etc. (with namespace filter)

// Staging instance
const stagingRecon = new ReconPlugin({ namespace: 'staging' });
// Uses same resource names but filters by namespace

// Query by namespace
const prodArtifacts = await db.resources.plg_recon_artifacts_dns.query({
  namespace: 'production'
});
```

---

## License

MIT License - See main s3db.js LICENSE file
