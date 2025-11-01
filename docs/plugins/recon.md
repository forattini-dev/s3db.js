# 🛰️ ReconPlugin - Full-Stack Reconnaissance System

> **Enterprise-grade reconnaissance with DNS, ports, TLS, subdomains, and scheduled sweeps**

---

## 📚 Documentation Index

This documentation is organized into focused modules for easier navigation:

### Core Documentation

- **[Overview](./recon/overview.md)** - Introduction, features, and quick start guide
- **[Architecture](./recon/architecture.md)** - System design, components, and data flow
- **[Storage System](./recon/storage.md)** - Data management and storage patterns

### Feature Guides

- **[Target Management](./recon/targets.md)** - Managing scan targets and configurations
- **[Artifacts System](./recon/artifacts.md)** - Per-tool result artifacts and data structure
- **[Progress Tracking](./recon/progress.md)** - Monitoring scan progress and status

### Advanced Topics

- **[Namespace Support](./recon/namespace.md)** - Multi-instance isolation and management
- **[Namespace Implementation](./recon/namespace-implementation.md)** - Technical implementation details
- **[Uptime Behavior](./recon/uptime-behavior.md)** - Continuous availability monitoring
- **[Uptime Aggregation](./recon/uptime-aggregation.md)** - Aggregating uptime metrics

### Development

- **[Refactoring Guide](./recon/refactoring.md)** - Code organization and refactoring strategy

---

## 🚀 Quick Start

```javascript
import { S3db, ReconPlugin } from 's3db.js';

const db = new S3db({ connectionString: 's3://...' });
await db.connect();

// Basic recon setup
const recon = new ReconPlugin({
  namespace: 'security-scan',  // Optional: isolate from other scans

  // DNS configuration
  dns: {
    enabled: true,
    resolvers: ['8.8.8.8', '1.1.1.1'],
    timeout: 5000
  },

  // Port scanning
  ports: {
    enabled: true,
    commonPorts: true,  // Scan top 1000 ports
    timeout: 3000
  },

  // TLS/SSL analysis
  tls: {
    enabled: true,
    checkCertificate: true,
    checkExpiration: true
  },

  // Subdomain discovery
  subdomains: {
    enabled: true,
    sources: ['crtsh', 'dnsdumpster', 'virustotal'],
    timeout: 30000
  },

  // Scheduled sweeps
  scheduler: {
    enabled: true,
    interval: 3600000,  // Every hour
    targets: ['example.com', 'api.example.com']
  }
});

await db.use(recon);

// Start reconnaissance
const results = await recon.scan('example.com', {
  dns: true,
  ports: true,
  tls: true,
  subdomains: true
});

console.log(results);
```

---

## 🎨 Behavior Presets

ReconPlugin includes three pre-configured behavior modes for different scanning scenarios. These presets automatically configure all tools with appropriate settings for your operational context.

### Passive Mode

**Use Case**: Minimal footprint reconnaissance using only passive sources (OSINT).

```javascript
const recon = new ReconPlugin({
  behavior: 'passive',
  namespace: 'osint-scan'
});

await db.use(recon);

// Only passive tools will execute
const results = await recon.scan('example.com');
```

**Features Enabled**:
- ✅ DNS resolution (basic A/AAAA records only)
- ✅ Certificate Transparency logs via crt.sh
- ✅ OSINT via theHarvester
- ✅ Public WHOIS data
- ❌ No active scanning (nmap, masscan)
- ❌ No intrusive probing (port scans, vulnerability scans)
- ❌ No HTTP requests to target

**Configuration**:
- Concurrency: 2
- Rate limiting: Disabled (passive sources only)
- Timeout: 10 seconds
- Tools: dig, crt.sh, theHarvester, whois

**When to Use**:
- Pre-engagement reconnaissance
- Bug bounty initial recon (before scope confirmation)
- Compliance-restricted environments
- Educational/research purposes

---

### Stealth Mode

**Use Case**: Balanced reconnaissance with minimal noise and rate limiting for authorized penetration testing.

```javascript
const recon = new ReconPlugin({
  behavior: 'stealth',
  namespace: 'pentest',
  targets: ['client.example.com']
});

await db.use(recon);
```

**Features Enabled**:
- ✅ DNS enumeration + Certificate analysis
- ✅ HTTP probing with custom user-agent
- ✅ Ping latency checks (3 packets, longer timeout)
- ✅ Subdomain discovery (subfinder + crt.sh only)
- ✅ Port scanning (top 10 ports only, `-T2` timing)
- ✅ TLS audit (OpenSSL only, no aggressive scans)
- ❌ No web fuzzing or directory brute-forcing
- ❌ No vulnerability scanning

**Configuration**:
- Concurrency: 1 (sequential execution)
- Rate limiting: 10 requests/minute, 5 second delay between stages
- nmap timing: `-T2 --max-retries 1` (polite)
- Port range: Top 10 common ports (80, 443, 22, 21, 25, 3389, 8080, 8443, 3000, 5000)
- Custom user-agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36`

**When to Use**:
- Authorized penetration testing
- Red team engagements (low-noise phase)
- IDS/IPS evasion required
- Client requests minimal impact

---

### Aggressive Mode

**Use Case**: Comprehensive deep-dive reconnaissance with all tools enabled for internal audits.

```javascript
const recon = new ReconPlugin({
  behavior: 'aggressive',
  namespace: 'internal-audit',
  targets: ['intranet.corp.local']
});

await db.use(recon);
```

**Features Enabled**:
- ✅ All reconnaissance tools activated
- ✅ Multiple subdomain tools (amass + subfinder + assetfinder + crt.sh)
- ✅ Full port range scanning (nmap + masscan)
- ✅ Web directory fuzzing (ffuf + feroxbuster + gobuster)
- ✅ Vulnerability scanning (nikto + wpscan + droopescan)
- ✅ TLS comprehensive audit (openssl + sslyze + testssl)
- ✅ Fingerprinting (whatweb, wappalyzer)
- ✅ Screenshot capture (aquatone, eyewitness)

**Configuration**:
- Concurrency: 8 (parallel execution)
- Rate limiting: Disabled
- nmap: Top 100 ports, `-T4 -sV --version-intensity 5`
- masscan: Full port range (1-65535) at 5000 packets/sec
- Web fuzzing: 100 threads, common wordlists
- Timeout: Generous (30-60 seconds per operation)

**Performance Impact**: Expect 5-10x longer scan time than default mode.

**When to Use**:
- Internal network audits
- Asset discovery on owned infrastructure
- Security posture assessment
- Pre-deployment validation

---

### Overriding Preset Defaults

You can apply a preset and selectively override specific settings:

```javascript
const recon = new ReconPlugin({
  behavior: 'stealth',  // Start with stealth preset

  // Override specific settings
  behaviorOverrides: {
    features: {
      ports: {
        nmap: true,
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

**Event Notification**:

The `recon:behavior-applied` event is emitted after configuration merge:

```javascript
recon.on('recon:behavior-applied', ({ mode, preset, overrides, final }) => {
  console.log(`Applied ${mode} preset`);
  console.log(`Overrides: ${Object.keys(overrides).length} settings changed`);
  console.log(`Final config:`, final);
});
```

---

## 🎯 Key Features

### 1. Multi-Tool Reconnaissance
- **DNS Resolution** - A/AAAA records, MX, TXT, NS, CNAME
- **Port Scanning** - TCP/UDP scanning with service detection
- **TLS/SSL Analysis** - Certificate validation, expiration, cipher suites
- **Subdomain Discovery** - Multiple sources (CT logs, DNS brute-force, APIs)
- **HTTP Headers** - Security headers analysis
- **WHOIS Lookup** - Domain registration information

### 2. Intelligent Artifact Storage
- **Per-Tool Results** - Each tool stores artifacts independently
- **Partitioned Data** - O(1) queries by target, date, or namespace
- **Incremental Updates** - Only changed data is updated
- **Historical Tracking** - Full timeline of reconnaissance results

### 3. Namespace Support
- **Multi-Instance** - Run multiple isolated recon instances
- **Environment Separation** - dev/staging/prod isolation
- **Tenant Isolation** - Multi-tenant SaaS support
- **Custom Workflows** - Different scan profiles per namespace

### 4. Scheduled Monitoring
- **Continuous Sweeps** - Automated recurring scans
- **Uptime Monitoring** - Track availability and response times
- **Change Detection** - Alert on infrastructure changes
- **Trend Analysis** - Historical performance metrics

### 5. Performance Optimized
- **Parallel Execution** - Multiple targets scanned concurrently
- **Smart Caching** - Reduce redundant lookups
- **Rate Limiting** - Respect external service limits
- **Timeout Management** - Fast failure detection

---

## 📊 Resource Structure

The ReconPlugin creates the following resources:

| Resource | Purpose | Partitions |
|----------|---------|------------|
| `plg_recon_targets` | Scan target configurations | `byNamespace`, `byStatus` |
| `plg_recon_artifacts_dns` | DNS resolution results | `byTarget`, `byDate`, `byNamespace` |
| `plg_recon_artifacts_ports` | Port scan results | `byTarget`, `byDate`, `byNamespace` |
| `plg_recon_artifacts_tls` | TLS/SSL analysis | `byTarget`, `byDate`, `byNamespace` |
| `plg_recon_artifacts_subdomains` | Subdomain discoveries | `byTarget`, `byDate`, `byNamespace` |
| `plg_recon_progress` | Scan progress tracking | `byTarget`, `byStatus` |
| `plg_recon_uptime` | Uptime monitoring data | `byTarget`, `byCohort` |

---

## 🔧 Configuration Reference

### Complete Configuration

```javascript
const recon = new ReconPlugin({
  // Namespace (optional)
  namespace: 'default',  // Isolate multiple instances

  // DNS Settings
  dns: {
    enabled: true,
    resolvers: ['8.8.8.8', '1.1.1.1', '208.67.222.222'],
    timeout: 5000,
    retries: 2,
    recordTypes: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA']
  },

  // Port Scanning
  ports: {
    enabled: true,
    commonPorts: true,  // Top 1000 ports
    customPorts: [8080, 8443, 3000, 5000],
    timeout: 3000,
    concurrent: 10,  // Parallel port checks
    serviceDetection: true
  },

  // TLS/SSL Analysis
  tls: {
    enabled: true,
    timeout: 10000,
    checkCertificate: true,
    checkExpiration: true,
    checkCipherSuites: true,
    minTlsVersion: 'TLSv1.2'
  },

  // Subdomain Discovery
  subdomains: {
    enabled: true,
    sources: {
      crtsh: { enabled: true, timeout: 30000 },
      dnsdumpster: { enabled: true, timeout: 30000 },
      virustotal: { enabled: true, apiKey: process.env.VT_API_KEY },
      securitytrails: { enabled: false, apiKey: process.env.ST_API_KEY }
    },
    bruteforce: {
      enabled: false,
      wordlist: ['www', 'mail', 'ftp', 'admin', 'api', 'dev']
    },
    maxSubdomains: 1000
  },

  // HTTP Headers
  http: {
    enabled: true,
    timeout: 10000,
    followRedirects: true,
    maxRedirects: 5,
    checkSecurityHeaders: true
  },

  // WHOIS Lookup
  whois: {
    enabled: true,
    timeout: 10000,
    parseFields: ['registrar', 'creation_date', 'expiration_date', 'nameservers']
  },

  // Scheduler
  scheduler: {
    enabled: true,
    interval: 3600000,  // 1 hour
    targets: [],  // Auto-populated from targets resource
    onComplete: async (results) => {
      console.log('Sweep complete:', results);
    }
  },

  // Uptime Monitoring
  uptime: {
    enabled: false,
    interval: 60000,  // 1 minute
    targets: [],
    checkHTTP: true,
    checkHTTPS: true,
    checkPing: true,
    alertThreshold: 3  // Alert after 3 failures
  },

  // Rate Limiting (prevent triggering IDS/IPS)
  rateLimit: {
    enabled: false,             // Enable throttling
    requestsPerMinute: 30,      // Max requests per minute
    delayBetweenStages: 2000    // Delay between stages (ms)
  },

  // Performance
  performance: {
    maxConcurrent: 5,  // Max concurrent target scans
    timeout: 300000,   // 5 minutes per target
    retries: 2,
    retryDelay: 5000
  },

  // Storage
  storage: {
    ttl: 2592000000,  // 30 days
    compression: true,
    encryption: false
  },

  // Events
  events: {
    onScanStart: async (target) => {},
    onScanComplete: async (target, results) => {},
    onScanError: async (target, error) => {},
    onArtifactSaved: async (tool, target, artifact) => {}
  }
});
```

---

## 🎓 Usage Examples

### Basic Scan

```javascript
// Scan a single target
const results = await recon.scan('example.com');
console.log(results);
/*
{
  target: 'example.com',
  timestamp: 1704067200000,
  dns: { A: ['93.184.216.34'], AAAA: [...], ... },
  ports: { open: [80, 443], closed: [...], ... },
  tls: { version: 'TLSv1.3', cipher: 'TLS_AES_128_GCM_SHA256', ... },
  subdomains: ['www.example.com', 'mail.example.com', ...],
  duration: 45123
}
*/
```

### Selective Tool Scanning

```javascript
// Only DNS and ports
const results = await recon.scan('example.com', {
  dns: true,
  ports: true,
  tls: false,
  subdomains: false
});
```

### Batch Scanning

```javascript
// Scan multiple targets
const targets = ['example.com', 'test.com', 'demo.com'];
const results = await recon.scanBatch(targets);
```

### Scheduled Monitoring

```javascript
// Add target for continuous monitoring
await recon.addTarget({
  host: 'api.example.com',
  schedule: '*/30 * * * *',  // Every 30 minutes
  tools: ['dns', 'ports', 'tls'],
  alerts: {
    onPortChange: true,
    onTlsExpiration: 30  // Alert 30 days before expiration
  }
});
```

### Query Artifacts

```javascript
// Get latest DNS results
const dnsResults = await recon.getArtifacts('dns', {
  target: 'example.com',
  limit: 10
});

// Get all artifacts for a target
const allArtifacts = await recon.getAllArtifacts('example.com', {
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});

// Track changes over time
const changes = await recon.detectChanges('example.com', {
  tool: 'ports',
  timeRange: 'last-7-days'
});
```

---

## 🔍 API Reference

### Main Methods

#### `scan(target, options)`
Perform a complete reconnaissance scan on a target.

**Parameters:**
- `target` (string) - Hostname or IP address
- `options` (object) - Tool selection and configuration

**Returns:** `Promise<Object>` - Scan results

#### `scanBatch(targets, options)`
Scan multiple targets in parallel.

**Parameters:**
- `targets` (string[]) - Array of targets
- `options` (object) - Tool selection and configuration

**Returns:** `Promise<Object[]>` - Array of scan results

#### `addTarget(config)`
Add a target for scheduled monitoring.

**Parameters:**
- `config` (object) - Target configuration

**Returns:** `Promise<string>` - Target ID

#### `removeTarget(targetId)`
Remove a target from monitoring.

**Parameters:**
- `targetId` (string) - Target identifier

**Returns:** `Promise<void>`

#### `getArtifacts(tool, query)`
Query artifacts for a specific tool.

**Parameters:**
- `tool` (string) - Tool name ('dns', 'ports', 'tls', etc.)
- `query` (object) - Query parameters

**Returns:** `Promise<Object[]>` - Artifact results

#### `getAllArtifacts(target, options)`
Get all artifacts for a target across all tools.

**Parameters:**
- `target` (string) - Target identifier
- `options` (object) - Query options

**Returns:** `Promise<Object>` - All artifacts grouped by tool

#### `detectChanges(target, options)`
Detect changes in reconnaissance data over time.

**Parameters:**
- `target` (string) - Target identifier
- `options` (object) - Detection options

**Returns:** `Promise<Object>` - Change summary

---

## 🎯 Best Practices

### 1. Use Namespaces for Isolation

```javascript
// Production scans
const prodRecon = new ReconPlugin({ namespace: 'production' });

// Development scans
const devRecon = new ReconPlugin({ namespace: 'development' });

await db.use(prodRecon);
await db.use(devRecon);
```

### 2. Configure Appropriate Timeouts

```javascript
// External APIs need longer timeouts
const recon = new ReconPlugin({
  subdomains: {
    enabled: true,
    sources: {
      virustotal: { timeout: 60000 },  // External API
      crtsh: { timeout: 30000 }         // CT logs
    }
  }
});
```

### 3. Enable Rate Limiting for Stealth Operations

```javascript
// Prevent triggering IDS/IPS alerts
const recon = new ReconPlugin({
  rateLimit: {
    enabled: true,
    requestsPerMinute: 30,      // Max 30 requests per minute
    delayBetweenStages: 2000    // 2 second delay between stages
  }
});
```

**Options**:
- `enabled` (boolean): Enable rate limiting (default: `false`)
- `requestsPerMinute` (number): Maximum requests per minute (default: `60`)
- `delayBetweenStages` (number): Delay in milliseconds between reconnaissance stages (default: `1000`)

**Event Notification**:

```javascript
recon.on('recon:rate-limit-delay', ({ stage, delayMs }) => {
  console.log(`Waiting ${delayMs}ms before ${stage} stage`);
});
```

**Best Practices**:
- Enable for authorized penetration testing
- Increase delay for sensitive/monitored targets
- Disable only for internal networks you own
- Combine with `behavior: 'stealth'` preset for maximum stealth

### 4. Use Partitioned Queries

```javascript
// O(1) lookup by partition
const artifacts = await reconArtifacts.listPartition('byTarget', {
  target: 'example.com'
});

// Avoid full scans
// ❌ const all = await reconArtifacts.list();  // O(n)
```

### 4. Monitor for Changes

```javascript
recon.on('artifact.changed', async ({ tool, target, changes }) => {
  if (tool === 'ports' && changes.newOpenPorts.length > 0) {
    console.warn(`New open ports detected on ${target}:`, changes.newOpenPorts);
  }
});
```

### 5. Clean Up Old Data

```javascript
// Use TTL plugin for automatic cleanup
const ttl = new TTLPlugin({
  resources: {
    plg_recon_artifacts_dns: { ttl: 2592000000 },      // 30 days
    plg_recon_artifacts_ports: { ttl: 2592000000 },    // 30 days
    plg_recon_uptime: { ttl: 7776000000 }              // 90 days
  }
});

await db.use(ttl);
```

---

## 📈 Performance Considerations

| Operation | Performance | Notes |
|-----------|-------------|-------|
| DNS Lookup | ~50-200ms | Depends on resolver |
| Port Scan (1000 ports) | ~30-60s | Parallel scanning helps |
| TLS Analysis | ~1-3s | Certificate validation |
| Subdomain Discovery | ~30-60s | Multiple sources |
| Full Scan | ~1-2min | All tools combined |

**Optimization Tips:**
- Use `concurrent` option for parallel execution
- Enable caching for repeated lookups
- Tune timeouts based on network conditions
- Use partitioned queries for O(1) lookups
- Enable compression for storage efficiency

---

## 🚨 Troubleshooting

### DNS Resolution Fails

```javascript
// Try multiple resolvers
const recon = new ReconPlugin({
  dns: {
    resolvers: [
      '8.8.8.8',        // Google
      '1.1.1.1',        // Cloudflare
      '208.67.222.222'  // OpenDNS
    ],
    retries: 3
  }
});
```

### Port Scanning Timeouts

```javascript
// Reduce concurrent scans, increase timeout
const recon = new ReconPlugin({
  ports: {
    timeout: 5000,
    concurrent: 5  // Lower = slower but more reliable
  }
});
```

### Subdomain Discovery Rate Limits

```javascript
// Add delays between API calls
const recon = new ReconPlugin({
  subdomains: {
    sources: {
      virustotal: {
        enabled: true,
        apiKey: process.env.VT_API_KEY,
        rateLimit: { requests: 4, per: 60000 }  // 4 req/min
      }
    }
  }
});
```

### Tool Dependency Issues

**Problem**: Missing reconnaissance tools cause scan stages to fail or be skipped.

**Check Tool Availability**:

```javascript
// Check all tools status
const status = await recon.getToolStatus();
console.log(status);
/*
{
  dns: { available: true, command: 'dig', version: '9.18.1' },
  nmap: { available: true, command: 'nmap', version: '7.94' },
  amass: { available: false, error: 'Command not found: amass' },
  subfinder: { available: true, command: 'subfinder', version: '2.5.4' },
  masscan: { available: false, error: 'Command not found: masscan' }
}
*/

// Check specific tool
const hasNmap = await recon.isToolAvailable('nmap');
if (!hasNmap) {
  console.error('nmap not installed');
}
```

**Automatic Fallback**:

ReconPlugin automatically skips stages when tools are unavailable:

```javascript
recon.on('recon:tool-unavailable', ({ tool, stage }) => {
  console.warn(`Skipping ${stage} stage - ${tool} not installed`);
});

// Scan continues with available tools only
const results = await recon.scan('example.com');
// Only dns, subfinder results if amass/masscan missing
```

**Installing Missing Tools**:

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

# Screenshots
go install github.com/michenriksen/aquatone@latest
```

**Tool Priority**:

When multiple tools serve the same purpose, ReconPlugin uses priority order:

```javascript
// Subdomain discovery priority
1. amass (most comprehensive)
2. subfinder (fast, reliable)
3. assetfinder (fallback)
4. crt.sh (passive, always available)

// Port scanning priority
1. masscan (fastest for full range)
2. nmap (most features, service detection)

// Web fuzzing priority
1. ffuf (fastest)
2. feroxbuster (good features)
3. gobuster (fallback)
```

---

## 🔗 Related Documentation

- [Plugin System Overview](../README.md)
- [Namespace Standard](../namespace.md)
- [TTL Plugin](../ttl.md) - Automatic artifact cleanup
- [Scheduler Plugin](../scheduler.md) - Advanced scheduling
- [Metrics Plugin](../metrics.md) - Performance monitoring

---

## 📝 Examples

Check out complete examples in the repository:

- [Basic Recon Scan](../../examples/e48-recon-basic.js)
- [Multi-Instance Setup](../../examples/e45-recon-multi-instance.js)
- [Namespace Detection](../../examples/e46-recon-namespace-detection.js)
- [Uptime Monitoring](../../examples/e50-recon-uptime-monitoring.js)

---

**Status**: ✅ Production-ready plugin for full-stack reconnaissance
