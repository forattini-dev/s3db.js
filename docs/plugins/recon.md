# 🛰️ ReconPlugin

> **Full-stack reconnaissance with DNS, ports, TLS, subdomains, and scheduled sweeps.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ TLDR

**Enterprise-grade reconnaissance with multi-tool orchestration, behavioral presets, and time-series analysis.**

**1 line to get started:**
```javascript
await db.usePlugin(new ReconPlugin({ behavior: 'passive' }));
```

**Production-ready setup:**
```javascript
await db.usePlugin(new ReconPlugin({
  behavior: 'stealth',                    // Passive, stealth, or aggressive
  namespace: 'security-scan',             // Multi-instance isolation
  scheduler: { enabled: true, interval: 3600000 },  // Hourly sweeps
  targets: ['example.com', 'api.example.com']       // Auto-scanned targets
}));

// Run comprehensive scan
const report = await reconPlugin.scan('example.com', { persist: true });
console.log(report.fingerprint);
```

**Key features:**
- ✅ **Behavior Presets** - Passive (OSINT), Stealth (rate-limited), Aggressive (full arsenal)
- ✅ **Multi-Tool Orchestration** - DNS, WHOIS, ports, TLS, subdomains, vulnerability scanning
- ✅ **3-Layer Storage** - Raw artifacts, aggregated results, queryable database resources
- ✅ **Tool Dependency Manager** - Automatic fallback when tools unavailable
- ✅ **Scheduled Monitoring** - Cron-driven sweeps with change detection
- ✅ **Namespace Isolation** - Run multiple independent reconnaissance instances
- ✅ **Time-Series Analysis** - O(1) partition-based queries by date/host

**Performance comparison:**
```javascript
// ❌ Without ReconPlugin: Manual tool execution
const dnsResults = await runDig('example.com');
const portResults = await runNmap('example.com');
const subdomains = await runSubfinder('example.com');
// Manual parsing, no storage, no change detection

// ✅ With ReconPlugin: Unified orchestration
const report = await reconPlugin.scan('example.com');
// All tools orchestrated, results parsed, changes detected, stored in 3 layers
// 70-90% less code, automatic retry, tool fallback, historical tracking
```

---

## 📑 Table of Contents

1. [⚡ TLDR](#-tldr)
2. [⚡ Quickstart](#-quickstart)
3. [Usage Journey](#usage-journey)
   - [Level 1: Basic DNS Scan](#level-1-basic-dns-scan)
   - [Level 2: Add Port Scanning](#level-2-add-port-scanning)
   - [Level 3: Full Stack Recon](#level-3-full-stack-recon)
   - [Level 4: Behavior Presets](#level-4-behavior-presets)
   - [Level 5: Rate Limiting & Stealth Operations](#level-5-rate-limiting--stealth-operations)
   - [Level 6: Scheduled Monitoring](#level-6-scheduled-monitoring)
   - [Level 7: Production Setup with All Features](#level-7-production-setup-with-all-features)
4. [📊 Configuration Reference](#-configuration-reference)
5. [📚 Configuration Examples](#-configuration-examples)
6. [🔧 API Reference](#-api-reference)
7. [✅ Best Practices](#-best-practices)
8. [🚨 Error Handling](#-error-handling)
9. [🔗 See Also](#-see-also)
10. [❓ FAQ](#-faq)

---

## ⚡ Quickstart

```javascript
import { Database } from 's3db.js';
import { ReconPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/path'
});

// Create plugin with stealth mode
const reconPlugin = new ReconPlugin({
  behavior: 'stealth',      // Passive, stealth, or aggressive
  namespace: 'pentest',     // Optional: isolate from other scans
  scheduler: {
    enabled: true,
    interval: 3600000       // Scan every hour
  }
});

await db.usePlugin(reconPlugin);
await db.connect();

// Run comprehensive scan
const report = await reconPlugin.scan('example.com', {
  persist: true  // Save to all 3 storage layers
});

// Access results
console.log('Primary IP:', report.fingerprint.primaryIp);
console.log('Open Ports:', report.fingerprint.openPorts);
console.log('Subdomains:', report.fingerprint.subdomainCount);
console.log('Technologies:', report.fingerprint.technologies);

// Query historical data (if persist: true)
const history = await reconPlugin.getArtifacts('dns', {
  target: 'example.com',
  limit: 10
});

await db.disconnect();
```

---

## Usage Journey

### Level 1: Basic DNS Scan

Simple DNS reconnaissance without any advanced features.

```javascript
import { Database } from 's3db.js';
import { ReconPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });
const plugin = new ReconPlugin();

await db.usePlugin(plugin);
await db.connect();

// Basic DNS scan
const report = await plugin.scan('example.com', {
  dns: true,
  ports: false,
  tls: false,
  subdomains: false
});

console.log('DNS Results:', report.results.dns);
// {
//   status: 'ok',
//   records: {
//     a: ['93.184.216.34'],
//     aaaa: ['2606:2800:220:1:248:1893:25c8:1946'],
//     mx: ['mail.example.com'],
//     txt: ['v=spf1 ...'],
//     reverse: { '93.184.216.34': ['example.com'] }
//   }
// }
```

**What you get:**
- A/AAAA/MX/TXT/NS/CNAME records
- Reverse DNS (PTR) lookups
- Node.js built-ins (no external tools required)

**What's missing:**
- No port scanning
- No subdomain discovery
- No change detection
- Results not persisted

---

### Level 2: Add Port Scanning

Add nmap port scanning with service detection.

```javascript
const plugin = new ReconPlugin({
  features: {
    ports: {
      nmap: true,        // Enable nmap
      topPorts: 100      // Scan top 100 ports
    }
  }
});

await db.usePlugin(plugin);

// DNS + Ports scan
const report = await plugin.scan('example.com', {
  dns: true,
  ports: true
});

console.log('Open Ports:', report.results.ports.openPorts);
// [
//   { port: '22/tcp', service: 'ssh', detail: 'OpenSSH 8.2' },
//   { port: '80/tcp', service: 'http', detail: 'nginx 1.18' },
//   { port: '443/tcp', service: 'https', detail: 'nginx 1.18' }
// ]

console.log('Fingerprint:', report.fingerprint);
// {
//   target: 'example.com',
//   primaryIp: '93.184.216.34',
//   openPorts: [...],
//   technologies: ['nginx 1.18', 'OpenSSH 8.2'],
//   latencyMs: null  // Add ping for latency
// }
```

**New capabilities:**
- Port scanning (TCP/UDP)
- Service version detection
- Banner grabbing
- Technology fingerprinting

---

### Level 3: Full Stack Recon

Comprehensive reconnaissance with all tools enabled.

```javascript
const plugin = new ReconPlugin({
  features: {
    dns: true,
    certificate: true,
    whois: true,
    latency: {
      ping: true,
      traceroute: true
    },
    ports: {
      nmap: true,
      topPorts: 100
    },
    subdomains: {
      subfinder: true,
      crtsh: true        // Certificate Transparency logs
    },
    tlsAudit: {
      openssl: true      // TLS cipher audit
    }
  }
});

await db.usePlugin(plugin);

// Full-stack scan
const report = await plugin.scan('example.com');

console.log('Complete Fingerprint:', report.fingerprint);
// {
//   target: 'example.com',
//   primaryIp: '93.184.216.34',
//   cdn: 'Cloudflare',
//   server: 'nginx',
//   technologies: ['nginx 1.18', 'Express', 'OpenSSH 8.2'],
//   openPorts: [{ port: '443/tcp', service: 'https', detail: 'nginx 1.18' }],
//   relatedHosts: ['example.com', 'www.example.com'],
//   subdomainCount: 42,
//   subdomainsSample: ['api.example.com', 'cdn.example.com', 'mail.example.com'],
//   latencyMs: 18.5
// }

// Individual stage results
console.log('TLS Certificate:', report.results.certificate);
// {
//   status: 'ok',
//   subject: 'example.com',
//   issuer: 'Let\'s Encrypt',
//   validFrom: '2024-01-01',
//   validTo: '2025-01-01',
//   daysUntilExpiry: 180
// }

console.log('WHOIS Data:', report.results.whois);
// {
//   status: 'ok',
//   domain: 'example.com',
//   registrar: 'Example Registrar Inc.',
//   dates: {
//     created: '2020-01-15T00:00:00.000Z',
//     expiration: '2026-01-15T00:00:00.000Z',
//     daysUntilExpiration: 365
//   },
//   nameservers: ['ns1.example.com', 'ns2.example.com'],
//   dnssec: 'unsigned'
// }

console.log('Subdomains:', report.results.subdomains);
// {
//   status: 'ok',
//   total: 42,
//   list: ['api.example.com', 'cdn.example.com', ...],
//   sources: {
//     subfinder: 35,
//     crtsh: 7
//   }
// }
```

**Full capabilities:**
- DNS + reverse lookups
- TLS certificate validation
- WHOIS domain registration lookup
- Ping latency + traceroute
- Port scanning + service detection
- Subdomain discovery (multiple sources)
- TLS cipher audit
- Comprehensive fingerprint

---

### Level 4: Behavior Presets

Use pre-configured behavior modes for different operational contexts.

```javascript
// Passive mode - OSINT only (no active scanning)
const passivePlugin = new ReconPlugin({
  behavior: 'passive',
  namespace: 'osint-scan'
});

// Stealth mode - authorized pentest with rate limiting
const stealthPlugin = new ReconPlugin({
  behavior: 'stealth',
  namespace: 'pentest',
  targets: ['client.example.com']
});

// Aggressive mode - internal audit with all tools
const aggressivePlugin = new ReconPlugin({
  behavior: 'aggressive',
  namespace: 'internal-audit',
  targets: ['intranet.corp.local']
});

await db.usePlugin(stealthPlugin);

// Stealth mode automatically enables:
// - Rate limiting (10 req/min, 5s delay between stages)
// - Polite nmap timing (-T2)
// - Top 10 ports only
// - Sequential execution (concurrency: 1)
const report = await stealthPlugin.scan('client.example.com');
```

**Behavior Modes:**

| Mode | Use Case | Detection Risk | Speed | Tools |
|------|----------|----------------|-------|-------|
| `passive` | OSINT, bug bounty recon | None | Fast | DNS, CT logs, theHarvester |
| `stealth` | Authorized pentesting | Low | Slow (rate-limited) | DNS, cert, ping, subfinder, nmap (slow) |
| `aggressive` | Internal audits | High | Very Fast | All tools (nmap, masscan, ffuf, nikto, etc.) |

**Override specific settings:**

```javascript
const plugin = new ReconPlugin({
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
    concurrency: 3    // Increase from 1 to 3
  }
});
```

**Events:**

```javascript
plugin.on('recon:behavior-applied', ({ mode, preset, overrides, final }) => {
  console.log(`Applied ${mode} preset with ${Object.keys(overrides).length} overrides`);
});
```

---

### Level 5: Rate Limiting & Stealth Operations

Configure rate limiting to avoid detection and respect service limits.

```javascript
const plugin = new ReconPlugin({
  behavior: 'stealth',  // Auto-enables rate limiting

  // Or configure rate limiting manually
  rateLimit: {
    enabled: true,
    requestsPerMinute: 30,      // Max 30 requests per minute
    delayBetweenStages: 5000    // 5 second delay between stages
  },

  features: {
    ports: {
      nmap: true,
      topPorts: 10,               // Minimal ports
      extraArgs: ['-T2']          // Polite timing (stealth mode)
    }
  }
});

await db.usePlugin(plugin);

// Stealth scan with automatic delays
const report = await plugin.scan('example.com');

// Monitor rate limit delays
plugin.on('recon:rate-limit-delay', ({ stage, delayMs }) => {
  console.log(`Waiting ${delayMs}ms before ${stage} stage`);
});
```

**Rate Limiting Features:**
- Automatic request throttling
- Delays between reconnaissance stages
- Prevents triggering IDS/IPS alerts
- Respects external API limits
- Configurable per operation

**Best Practices:**
- Enable for authorized penetration testing
- Increase delay for monitored targets
- Disable only for internal networks you own
- Combine with `behavior: 'stealth'` preset

---

### Level 6: Scheduled Monitoring

Automated recurring scans with change detection and alerting.

```javascript
const plugin = new ReconPlugin({
  behavior: 'stealth',
  namespace: 'monitoring',

  // Scheduled sweeps
  scheduler: {
    enabled: true,
    interval: 3600000,    // Every hour (ms)
    runOnStart: true      // Run immediately on plugin load
  },

  // Targets to monitor
  targets: [
    'example.com',
    {
      target: 'api.example.com',
      features: {
        vulnerability: { nikto: false }  // Override for specific target
      }
    }
  ],

  // Storage configuration
  storage: {
    persist: true,
    historyLimit: 20      // Keep last 20 scans per target
  }
});

await db.usePlugin(plugin);
await db.connect();

// Scheduler automatically starts scanning targets
// Access scheduled scan results
plugin.on('recon:completed', ({ target, report, changes }) => {
  console.log(`Scan complete for ${target}`);

  if (changes.subdomains?.added?.length > 0) {
    console.warn(`New subdomains detected: ${changes.subdomains.added}`);
  }

  if (changes.ports?.opened?.length > 0) {
    console.warn(`New open ports: ${changes.ports.opened}`);
  }
});

plugin.on('recon:alert', ({ host, stage, severity, description }) => {
  console.error(`[${severity.toUpperCase()}] ${host}: ${description}`);
});

// Manually trigger scheduled sweep
await plugin.runScheduledSweep();

// Get historical changes
const changes = await plugin.detectChanges('example.com', {
  tool: 'ports',
  timeRange: 'last-7-days'
});

console.log('Port changes:', changes);
// {
//   opened: [{ port: '8080/tcp', since: '2025-01-01T12:00:00.000Z' }],
//   closed: [{ port: '21/tcp', since: '2025-01-02T06:00:00.000Z' }]
// }
```

**Scheduling Features:**
- Cron-style intervals
- Per-target feature overrides
- Automatic change detection
- Alert on critical changes
- Historical tracking (20 scans by default)
- Automatic cleanup of old data

---

### Level 7: Production Setup with All Features

Complete production configuration with namespace isolation, monitoring, and alerting.

```javascript
const plugin = new ReconPlugin({
  // Behavior preset
  behavior: 'stealth',

  // Namespace isolation
  namespace: 'production-monitoring',

  // DNS configuration
  dns: {
    enabled: true,
    resolvers: ['8.8.8.8', '1.1.1.1', '208.67.222.222'],
    timeout: 5000,
    retries: 2,
    recordTypes: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME']
  },

  // Port scanning
  features: {
    ports: {
      nmap: true,
      masscan: false,     // Disabled in production (too noisy)
      topPorts: 20,
      timeout: 3000,
      serviceDetection: true
    },

    // Subdomain discovery
    subdomains: {
      subfinder: true,
      amass: false,       // Too slow for production
      crtsh: true,        // Passive CT logs
      maxSubdomains: 1000
    },

    // TLS monitoring
    tlsAudit: {
      openssl: true,
      checkExpiration: true,
      alertThreshold: 30  // Alert 30 days before expiry
    },

    // Fingerprinting
    fingerprint: {
      whatweb: true
    }
  },

  // Rate limiting
  rateLimit: {
    enabled: true,
    requestsPerMinute: 30,
    delayBetweenStages: 5000
  },

  // Scheduled monitoring
  scheduler: {
    enabled: true,
    interval: 3600000,    // Every hour
    runOnStart: true
  },

  // Targets with per-target overrides
  targets: [
    'example.com',
    'api.example.com',
    {
      target: 'cdn.example.com',
      features: {
        ports: { topPorts: 5 }  // CDN needs fewer ports
      }
    }
  ],

  // Storage configuration
  storage: {
    persist: true,
    historyLimit: 50,     // Keep 50 scans per target
    compression: true,
    encryption: false
  },

  // Resource persistence (queryable database)
  resources: {
    persist: true,
    autoCreate: true
  },

  // Performance
  performance: {
    maxConcurrent: 5,     // Max 5 concurrent target scans
    timeout: 300000,      // 5 minutes per target
    retries: 2,
    retryDelay: 5000
  },

  // Events
  events: {
    onScanStart: async (target) => {
      console.log(`Starting scan: ${target}`);
    },
    onScanComplete: async (target, results) => {
      console.log(`Completed scan: ${target} (${results.duration}ms)`);
    },
    onScanError: async (target, error) => {
      console.error(`Scan failed: ${target}`, error.message);
    }
  }
});

await db.usePlugin(plugin);
await db.connect();

// Monitor events
plugin.on('recon:completed', async ({ target, report, changes }) => {
  // Alert on critical changes
  if (changes.ports?.opened?.length > 0) {
    await sendAlert({
      severity: 'high',
      message: `New open ports detected on ${target}`,
      ports: changes.ports.opened
    });
  }

  if (changes.subdomains?.added?.length > 0) {
    await sendAlert({
      severity: 'medium',
      message: `New subdomains discovered for ${target}`,
      subdomains: changes.subdomains.added
    });
  }

  // Check TLS expiration
  if (report.results.certificate?.daysUntilExpiry <= 30) {
    await sendAlert({
      severity: 'high',
      message: `TLS certificate expiring soon for ${target}`,
      daysRemaining: report.results.certificate.daysUntilExpiry
    });
  }
});

plugin.on('recon:alert', async ({ host, stage, severity, description, values }) => {
  await sendAlert({ host, stage, severity, description, values });
});

plugin.on('recon:target-error', ({ target, error }) => {
  console.error(`Target error: ${target}`, error);
});

// Query production data
const hostsResource = await db.getResource('plg_recon_hosts');
const highRiskHosts = await hostsResource.query({ riskLevel: 'high' });

console.log(`High risk hosts: ${highRiskHosts.length}`);

// Time-series analysis
const reportsResource = await db.getResource('plg_recon_reports');
const todayScans = await reportsResource.listPartition('byDay', {
  timestampDay: new Date().toISOString().split('T')[0]
});

console.log(`Scans today: ${todayScans.length}`);

// Generate client report
const markdown = await plugin.generateClientReport('example.com');
console.log(markdown);
```

**Production Checklist:**
- ✅ Behavior preset configured (`stealth` for production)
- ✅ Namespace isolation enabled
- ✅ Rate limiting enabled
- ✅ Scheduled monitoring configured
- ✅ Per-target feature overrides
- ✅ Storage persistence enabled (3 layers)
- ✅ Event handlers for alerts
- ✅ Error handling with retries
- ✅ Resource queries for analysis
- ✅ Client reporting enabled

---

## 📊 Configuration Reference

### Complete Configuration Object

```javascript
{
  // ============================================
  // BEHAVIOR PRESET
  // ============================================
  behavior: null,                 // 'passive' | 'stealth' | 'aggressive' | null
  behaviorOverrides: {},          // Override specific settings within preset

  // ============================================
  // NAMESPACE (Multi-Instance Isolation)
  // ============================================
  namespace: 'default',           // Isolate multiple recon instances

  // ============================================
  // DNS SETTINGS
  // ============================================
  dns: {
    enabled: true,
    resolvers: ['8.8.8.8', '1.1.1.1', '208.67.222.222'],
    timeout: 5000,
    retries: 2,
    recordTypes: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA']
  },

  // ============================================
  // FEATURES (Tool Selection)
  // ============================================
  features: {
    // DNS & PTR (Node.js built-ins)
    dns: true,

    // TLS/SSL Base Certificate Check (Node.js tls)
    certificate: true,

    // WHOIS Domain Registration Lookup
    whois: true,

    // HTTP Headers (curl -I)
    http: {
      curl: true,
      timeout: 8000,
      userAgent: 'Mozilla/5.0 ...',
      followRedirects: true
    },

    // Latency Monitoring
    latency: {
      ping: true,
      traceroute: true,
      count: 4,                   // Ping packet count
      timeout: 7000
    },

    // Subdomain Discovery
    subdomains: {
      amass: false,               // Slow, disabled by default
      subfinder: true,            // Fast, reliable
      assetfinder: false,
      crtsh: true,                // Certificate Transparency (passive)
      timeout: 30000,
      maxSubdomains: 1000,
      bruteforce: {
        enabled: false,
        wordlist: ['www', 'mail', 'ftp', 'admin', 'api']
      }
    },

    // Port Scanning
    ports: {
      nmap: true,
      masscan: false,
      topPorts: 100,
      timeout: 3000,
      concurrent: 10,
      serviceDetection: true,
      extraArgs: []               // Additional nmap flags
    },

    // TLS Audit (Cipher Suites, Protocols)
    tlsAudit: {
      openssl: true,
      sslyze: false,
      testssl: false,
      checkExpiration: true,
      alertThreshold: 30          // Days before expiry to alert
    },

    // Fingerprinting
    fingerprint: {
      whatweb: true               // CMS/framework detection
    },

    // Web Discovery (Directory Brute-Forcing)
    web: {
      ffuf: false,
      feroxbuster: false,
      gobuster: false,
      wordlist: null,
      threads: 40
    },

    // Vulnerability Scanning (Authorized use only!)
    vulnerability: {
      nikto: false,
      wpscan: false,
      droopescan: false
    },

    // Screenshots
    screenshots: {
      aquatone: false,
      eyewitness: false
    },

    // OSINT
    osint: {
      theHarvester: false,
      reconNg: false
    }
  },

  // ============================================
  // RATE LIMITING (Stealth Operations)
  // ============================================
  rateLimit: {
    enabled: false,               // Enable throttling
    requestsPerMinute: 60,        // Max requests per minute
    delayBetweenStages: 1000      // Delay between stages (ms)
  },

  // ============================================
  // SCHEDULER (Automated Sweeps)
  // ============================================
  scheduler: {
    enabled: false,
    interval: 3600000,            // 1 hour (ms)
    runOnStart: false,            // Run immediately on plugin load
    onComplete: null              // Callback after sweep
  },

  // ============================================
  // TARGETS (Scheduled Monitoring)
  // ============================================
  targets: [],                    // Array of strings or TargetConfig objects
  // TargetConfig: { target, tools, features, persist }

  // ============================================
  // UPTIME MONITORING
  // ============================================
  uptime: {
    enabled: false,
    interval: 60000,              // 1 minute
    targets: [],
    checkHTTP: true,
    checkHTTPS: true,
    checkPing: true,
    alertThreshold: 3             // Alert after N consecutive failures
  },

  // ============================================
  // STORAGE (Persistence Configuration)
  // ============================================
  storage: {
    persist: true,                // Enable PluginStorage persistence
    historyLimit: 20,             // Number of scans to keep per host
    persistRawOutput: true,       // Keep truncated CLI stdout/stderr
    compression: true,
    encryption: false
  },

  // ============================================
  // RESOURCES (Database Persistence)
  // ============================================
  resources: {
    persist: true,                // Enable database resource persistence
    autoCreate: true              // Auto-create resources during onInstall
  },

  // ============================================
  // PERFORMANCE
  // ============================================
  performance: {
    maxConcurrent: 5,             // Max concurrent target scans
    timeout: 300000,              // 5 minutes per target
    retries: 2,
    retryDelay: 5000
  },
  concurrency: 4,                 // Max stages executed in parallel

  // ============================================
  // EVENTS
  // ============================================
  events: {
    onScanStart: null,            // async (target) => {}
    onScanComplete: null,         // async (target, results) => {}
    onScanError: null,            // async (target, error) => {}
    onArtifactSaved: null         // async (tool, target, artifact) => {}
  },

  // ============================================
  // ADVANCED
  // ============================================
  commandRunner: null             // Optional injector for sandbox/testing
}
```

---

### Configuration Options Table

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `behavior` | string | `null` | Behavior mode: `passive`, `stealth`, or `aggressive`. Overrides features/timing. |
| `behaviorOverrides` | object | `{}` | Override specific settings within a behavior preset. |
| `namespace` | string | `'default'` | Isolate multiple reconnaissance instances. |
| `dns.enabled` | boolean | `true` | Enable DNS resolution. |
| `dns.resolvers` | string[] | `['8.8.8.8', ...]` | DNS servers to use. |
| `dns.timeout` | number | `5000` | DNS query timeout (ms). |
| `features.ports.nmap` | boolean | `false` | Enable nmap port scanning. |
| `features.ports.topPorts` | number | `10` | Number of top ports to scan. |
| `features.subdomains.subfinder` | boolean | `true` | Enable subfinder subdomain discovery. |
| `features.subdomains.crtsh` | boolean | `true` | Enable Certificate Transparency logs. |
| `rateLimit.enabled` | boolean | `false` | Enable rate limiting (auto-enabled in `stealth` mode). |
| `rateLimit.requestsPerMinute` | number | `60` | Max requests per minute (stealth: 10). |
| `rateLimit.delayBetweenStages` | number | `0` | Milliseconds to pause between stages (stealth: 5000). |
| `scheduler.enabled` | boolean | `false` | Enable cron-driven sweeps. |
| `scheduler.interval` | number | `3600000` | Scan interval in milliseconds. |
| `targets` | array | `[]` | Targets processed automatically during scheduled sweeps. |
| `storage.persist` | boolean | `true` | Persist reports to PluginStorage. |
| `storage.historyLimit` | number | `20` | Number of historical reports kept per host. |
| `resources.persist` | boolean | `true` | Persist summaries to S3DB resources. |
| `performance.maxConcurrent` | number | `5` | Max concurrent target scans. |
| `performance.timeout` | number | `300000` | 5 minutes per target. |

---

## 📚 Configuration Examples

### Example 1: OSINT-Only Reconnaissance (Passive Mode)

```javascript
new ReconPlugin({
  behavior: 'passive',
  namespace: 'osint-scan',
  storage: { persist: true }
})
```

**Use case:** Bug bounty reconnaissance, pre-engagement OSINT, compliance-restricted environments

**Features:**
- DNS resolution (basic A/AAAA records only)
- Certificate Transparency logs via crt.sh
- OSINT via theHarvester
- Public WHOIS data
- No active scanning (nmap, masscan)
- No intrusive probing

---

### Example 2: Authorized Penetration Testing (Stealth Mode)

```javascript
new ReconPlugin({
  behavior: 'stealth',
  namespace: 'pentest',
  targets: ['client.example.com'],
  scheduler: {
    enabled: true,
    interval: 21600000  // Every 6 hours
  }
})
```

**Use case:** Authorized penetration testing, red team engagements (low-noise phase), IDS/IPS evasion

**Features:**
- DNS enumeration + Certificate analysis
- HTTP probing with custom user-agent
- Ping latency checks (3 packets, longer timeout)
- Subdomain discovery (subfinder + crt.sh only)
- Port scanning (top 10 ports only, `-T2` timing)
- TLS audit (OpenSSL only)
- Concurrency: 1 (sequential execution)
- Rate limiting: 10 requests/minute, 5 second delay between stages

---

### Example 3: Internal Security Audit (Aggressive Mode)

```javascript
new ReconPlugin({
  behavior: 'aggressive',
  namespace: 'internal-audit',
  targets: ['intranet.corp.local', '10.0.0.0/24'],
  scheduler: {
    enabled: true,
    interval: 86400000  // Daily
  }
})
```

**Use case:** Internal network audits, asset discovery, security posture assessment, pre-deployment validation

**Features:**
- All reconnaissance tools activated
- Multiple subdomain tools (amass + subfinder + assetfinder + crt.sh)
- Full port range scanning (nmap + masscan)
- Web directory fuzzing (ffuf + feroxbuster + gobuster)
- Vulnerability scanning (nikto + wpscan + droopescan)
- TLS comprehensive audit (openssl + sslyze + testssl)
- Fingerprinting (whatweb, wappalyzer)
- Screenshot capture (aquatone, eyewitness)
- Concurrency: 8 (parallel execution)
- Rate limiting: Disabled

---

### Example 4: Continuous Monitoring (Production)

```javascript
new ReconPlugin({
  behavior: 'stealth',
  namespace: 'production-monitoring',
  scheduler: {
    enabled: true,
    interval: 3600000,  // Hourly
    runOnStart: true
  },
  targets: [
    'example.com',
    'api.example.com',
    'cdn.example.com'
  ],
  storage: {
    persist: true,
    historyLimit: 50
  },
  resources: {
    persist: true
  },
  events: {
    onScanComplete: async (target, results) => {
      console.log(`Scan complete: ${target}`);
    }
  }
})
```

**Use case:** Production monitoring, change detection, uptime tracking, SLA compliance

---

### Example 5: Custom Tool Selection (Manual Configuration)

```javascript
new ReconPlugin({
  namespace: 'custom-scan',
  features: {
    dns: true,
    certificate: true,
    latency: {
      ping: true,
      traceroute: false  // Disable traceroute
    },
    ports: {
      nmap: true,
      topPorts: 50,      // Scan top 50 ports
      extraArgs: ['-sV', '--version-intensity', '5']
    },
    subdomains: {
      subfinder: true,
      crtsh: true,
      amass: false       // Disable slow tools
    },
    tlsAudit: {
      openssl: true,
      checkExpiration: true,
      alertThreshold: 30
    }
  },
  rateLimit: {
    enabled: true,
    requestsPerMinute: 30,
    delayBetweenStages: 2000
  }
})
```

**Use case:** Custom reconnaissance workflow with specific tool selection

---

### Example 6: Multi-Instance Setup (Namespace Isolation)

```javascript
// Production monitoring
const prodRecon = new ReconPlugin({
  namespace: 'production',
  behavior: 'stealth',
  targets: ['example.com']
});

// Development monitoring
const devRecon = new ReconPlugin({
  namespace: 'development',
  behavior: 'passive',
  targets: ['dev.example.com']
});

// Internal audit
const internalRecon = new ReconPlugin({
  namespace: 'internal',
  behavior: 'aggressive',
  targets: ['10.0.0.0/24']
});

await db.usePlugin(prodRecon);
await db.usePlugin(devRecon);
await db.usePlugin(internalRecon);
```

**Use case:** Multi-tenant SaaS, environment separation (dev/staging/prod), different scan profiles per namespace

---

## 🔧 API Reference

### Plugin Methods

#### `scan(target, options?): Promise<Object>`

Perform a complete reconnaissance scan on a target.

**Parameters:**
- `target` (string, required): Hostname, IP address, or URL
- `options` (object, optional): Scan configuration
  - `dns` (boolean): Enable DNS resolution
  - `ports` (boolean): Enable port scanning
  - `tls` (boolean): Enable TLS analysis
  - `subdomains` (boolean): Enable subdomain discovery
  - `persist` (boolean): Save results to all 3 storage layers

**Returns:** `Promise<Object>` - Complete scan report

**Example:**
```javascript
const report = await plugin.scan('example.com', {
  dns: true,
  ports: true,
  tls: true,
  subdomains: true,
  persist: true
});

console.log(report.fingerprint);
// {
//   target: 'example.com',
//   primaryIp: '93.184.216.34',
//   openPorts: [...],
//   subdomainCount: 42,
//   technologies: ['nginx', 'Express']
// }
```

**Throws:**
- `PluginError` - When target is invalid
- `TimeoutError` - When scan exceeds timeout

---

#### `scanBatch(targets, options?): Promise<Object[]>`

Scan multiple targets in parallel.

**Parameters:**
- `targets` (string[], required): Array of targets to scan
- `options` (object, optional): Scan configuration (same as `scan()`)

**Returns:** `Promise<Object[]>` - Array of scan reports

**Example:**
```javascript
const reports = await plugin.scanBatch([
  'example.com',
  'test.com',
  'demo.com'
], { persist: true });

console.log(`Scanned ${reports.length} targets`);
```

---

#### `getToolStatus(): Promise<Object>`

Check availability of all reconnaissance tools.

**Returns:** `Promise<Object>` - Tool availability status

**Example:**
```javascript
const status = await plugin.getToolStatus();
console.log(status);
// {
//   dns: { available: true, command: 'dig', version: '9.18.1' },
//   nmap: { available: true, command: 'nmap', version: '7.94' },
//   amass: { available: false, error: 'Command not found: amass' },
//   subfinder: { available: true, command: 'subfinder', version: '2.5.4' }
// }
```

---

#### `isToolAvailable(tool): Promise<boolean>`

Check if a specific tool is available.

**Parameters:**
- `tool` (string, required): Tool name ('nmap', 'subfinder', etc.)

**Returns:** `Promise<boolean>` - Tool availability

**Example:**
```javascript
const hasNmap = await plugin.isToolAvailable('nmap');
if (!hasNmap) {
  console.error('nmap not installed');
}
```

---

#### `addTarget(config): Promise<string>`

Add a target for scheduled monitoring.

**Parameters:**
- `config` (object, required): Target configuration
  - `target` (string, required): Hostname or IP
  - `tools` (string[], optional): Tool selection
  - `features` (object, optional): Feature overrides
  - `persist` (boolean, optional): Save results

**Returns:** `Promise<string>` - Target ID

**Example:**
```javascript
const targetId = await plugin.addTarget({
  target: 'api.example.com',
  features: {
    ports: { topPorts: 20 },
    vulnerability: { nikto: false }
  },
  persist: true
});
```

---

#### `removeTarget(targetId): Promise<void>`

Remove a target from monitoring.

**Parameters:**
- `targetId` (string, required): Target identifier

**Returns:** `Promise<void>`

**Example:**
```javascript
await plugin.removeTarget('target-123');
```

---

#### `getArtifacts(tool, query): Promise<Object[]>`

Query artifacts for a specific tool.

**Parameters:**
- `tool` (string, required): Tool name ('dns', 'ports', 'tls', etc.)
- `query` (object, required): Query parameters
  - `target` (string): Filter by target
  - `limit` (number): Max results
  - `startDate` (string): ISO date string
  - `endDate` (string): ISO date string

**Returns:** `Promise<Object[]>` - Artifact results

**Example:**
```javascript
// Get latest DNS results
const dnsResults = await plugin.getArtifacts('dns', {
  target: 'example.com',
  limit: 10
});

console.log(dnsResults[0].records.a);  // ['93.184.216.34']
```

---

#### `getAllArtifacts(target, options?): Promise<Object>`

Get all artifacts for a target across all tools.

**Parameters:**
- `target` (string, required): Target identifier
- `options` (object, optional): Query options
  - `startDate` (string): ISO date string
  - `endDate` (string): ISO date string
  - `tools` (string[]): Filter by tools

**Returns:** `Promise<Object>` - All artifacts grouped by tool

**Example:**
```javascript
const allArtifacts = await plugin.getAllArtifacts('example.com', {
  startDate: '2025-01-01',
  endDate: '2025-01-31'
});

console.log(allArtifacts.dns);        // DNS artifacts
console.log(allArtifacts.ports);      // Port artifacts
console.log(allArtifacts.subdomains); // Subdomain artifacts
```

---

#### `detectChanges(target, options?): Promise<Object>`

Detect changes in reconnaissance data over time.

**Parameters:**
- `target` (string, required): Target identifier
- `options` (object, optional): Detection options
  - `tool` (string): Filter by tool ('ports', 'subdomains', etc.)
  - `timeRange` (string): 'last-7-days', 'last-30-days', 'last-90-days'
  - `startDate` (string): ISO date string
  - `endDate` (string): ISO date string

**Returns:** `Promise<Object>` - Change summary

**Example:**
```javascript
const changes = await plugin.detectChanges('example.com', {
  tool: 'ports',
  timeRange: 'last-7-days'
});

console.log(changes);
// {
//   opened: [
//     { port: '8080/tcp', since: '2025-01-01T12:00:00.000Z' }
//   ],
//   closed: [
//     { port: '21/tcp', since: '2025-01-02T06:00:00.000Z' }
//   ]
// }
```

---

#### `generateClientReport(target, options?): Promise<string | Object>`

Generate a client-ready report in Markdown or JSON format.

**Parameters:**
- `target` (string, required): Target identifier
- `options` (object, optional): Report options
  - `format` (string): 'markdown' or 'json' (default: 'markdown')
  - `diffLimit` (number): Max diffs to include (default: 5)
  - `includeDiffs` (boolean): Include recent changes (default: true)

**Returns:** `Promise<string | Object>` - Report in specified format

**Example:**
```javascript
// Markdown report
const markdown = await plugin.generateClientReport('example.com');
console.log(markdown);

// JSON report
const json = await plugin.generateClientReport('example.com', {
  format: 'json',
  diffLimit: 5
});
console.log(json);
// {
//   host: 'example.com',
//   summary: {...},
//   latestReport: {...},
//   diffs: [...],
//   stages: [...]
// }
```

---

#### `getHostSummary(target, options?): Promise<Object>`

Get consolidated host summary without generating full report.

**Parameters:**
- `target` (string, required): Target identifier
- `options` (object, optional): Query options
  - `includeDiffs` (boolean): Include recent changes (default: false)

**Returns:** `Promise<Object>` - Host summary

**Example:**
```javascript
const summary = await plugin.getHostSummary('example.com', {
  includeDiffs: true
});

console.log(summary);
// {
//   host: 'example.com',
//   primaryIp: '93.184.216.34',
//   openPorts: [...],
//   subdomainCount: 42,
//   lastScanAt: '2025-01-01T12:00:00.000Z',
//   diffs: [...]
// }
```

---

#### `getRecentAlerts(target, options?): Promise<Object[]>`

Get recent alerts for a target.

**Parameters:**
- `target` (string, required): Target identifier
- `options` (object, optional): Query options
  - `limit` (number): Max alerts (default: 10)
  - `severity` (string[]): Filter by severity (['low', 'medium', 'high', 'critical'])

**Returns:** `Promise<Object[]>` - Alert list

**Example:**
```javascript
const alerts = await plugin.getRecentAlerts('example.com', {
  limit: 3,
  severity: ['high', 'critical']
});

console.log(alerts);
// [
//   {
//     host: 'example.com',
//     stage: 'ports',
//     severity: 'high',
//     description: 'New open port detected',
//     values: { port: '8080/tcp' },
//     timestamp: '2025-01-01T12:00:00.000Z'
//   }
// ]
```

---

#### `runScheduledSweep(): Promise<void>`

Manually trigger a scheduled sweep of all targets.

**Returns:** `Promise<void>`

**Example:**
```javascript
// Trigger immediate sweep
await plugin.runScheduledSweep();
```

---

### Events

#### `recon:behavior-applied`

Emitted when behavior preset is applied.

**Payload:**
```javascript
{
  mode: 'stealth',
  preset: { ...presetConfig },
  overrides: { ...overrideConfig },
  final: { ...finalConfig }
}
```

**Example:**
```javascript
plugin.on('recon:behavior-applied', ({ mode, overrides }) => {
  console.log(`Applied ${mode} preset with ${Object.keys(overrides).length} overrides`);
});
```

---

#### `recon:rate-limit-delay`

Emitted when rate limiting introduces a delay.

**Payload:**
```javascript
{
  stage: 'ports',
  delayMs: 5000
}
```

**Example:**
```javascript
plugin.on('recon:rate-limit-delay', ({ stage, delayMs }) => {
  console.log(`Waiting ${delayMs}ms before ${stage} stage`);
});
```

---

#### `recon:tool-unavailable`

Emitted when a tool is unavailable and stage is skipped.

**Payload:**
```javascript
{
  tool: 'amass',
  stage: 'subdomains'
}
```

**Example:**
```javascript
plugin.on('recon:tool-unavailable', ({ tool, stage }) => {
  console.warn(`Skipping ${stage} stage - ${tool} not installed`);
});
```

---

#### `recon:completed`

Emitted after successful scan completion.

**Payload:**
```javascript
{
  target: 'example.com',
  report: { ...scanReport },
  changes: { ...detectedChanges }
}
```

**Example:**
```javascript
plugin.on('recon:completed', ({ target, report, changes }) => {
  console.log(`Scan complete for ${target}`);
  if (changes.subdomains?.added?.length > 0) {
    console.warn(`New subdomains: ${changes.subdomains.added}`);
  }
});
```

---

#### `recon:target-error`

Emitted when a target scan fails.

**Payload:**
```javascript
{
  target: 'example.com',
  error: Error
}
```

**Example:**
```javascript
plugin.on('recon:target-error', ({ target, error }) => {
  console.error(`Scan failed: ${target}`, error.message);
});
```

---

#### `recon:alert`

Emitted when critical changes are detected.

**Payload:**
```javascript
{
  host: 'example.com',
  stage: 'ports',
  severity: 'high',
  description: 'New open port detected',
  values: { port: '8080/tcp' },
  timestamp: '2025-01-01T12:00:00.000Z'
}
```

**Example:**
```javascript
plugin.on('recon:alert', ({ host, severity, description }) => {
  console.error(`[${severity.toUpperCase()}] ${host}: ${description}`);
});
```

---

## ✅ Best Practices

### Do's ✅

1. **Use behavior presets for operational context**
   ```javascript
   // ✅ Good - Passive for OSINT
   const osintPlugin = new ReconPlugin({ behavior: 'passive' });

   // ✅ Good - Stealth for authorized pentesting
   const pentestPlugin = new ReconPlugin({ behavior: 'stealth' });

   // ✅ Good - Aggressive for internal audits
   const auditPlugin = new ReconPlugin({ behavior: 'aggressive' });
   ```

2. **Enable namespace isolation for multi-instance setups**
   ```javascript
   // ✅ Good - Separate production and development
   const prodRecon = new ReconPlugin({ namespace: 'production' });
   const devRecon = new ReconPlugin({ namespace: 'development' });
   ```

3. **Configure appropriate timeouts**
   ```javascript
   // ✅ Good - External APIs need longer timeouts
   const plugin = new ReconPlugin({
     features: {
       subdomains: {
         subfinder: { timeout: 60000 },  // External API
         crtsh: { timeout: 30000 }        // CT logs
       }
     }
   });
   ```

4. **Enable rate limiting for stealth operations**
   ```javascript
   // ✅ Good - Prevent triggering IDS/IPS
   const plugin = new ReconPlugin({
     rateLimit: {
       enabled: true,
       requestsPerMinute: 30,
       delayBetweenStages: 5000
     }
   });
   ```

5. **Use partitioned queries for O(1) lookups**
   ```javascript
   // ✅ Good - O(1) lookup by partition
   const artifacts = await hostsResource.listPartition('byNamespace', {
     namespace: 'production'
   });

   // ✅ Good - Time-series query by day
   const scans = await reportsResource.listPartition('byDay', {
     timestampDay: '2025-01-01'
   });
   ```

6. **Monitor for changes with event handlers**
   ```javascript
   // ✅ Good - React to critical changes
   plugin.on('recon:alert', async ({ host, severity, description }) => {
     if (severity === 'high' || severity === 'critical') {
       await sendAlert({ host, description });
     }
   });
   ```

7. **Clean up old data with TTL plugin**
   ```javascript
   // ✅ Good - Automatic cleanup
   const ttl = new TTLPlugin({
     resources: {
       plg_recon_reports: { ttl: 2592000000 },      // 30 days
       plg_recon_artifacts_dns: { ttl: 2592000000 }, // 30 days
       plg_recon_uptime: { ttl: 7776000000 }        // 90 days
     }
   });
   ```

8. **Check tool availability before scanning**
   ```javascript
   // ✅ Good - Verify tools are installed
   const hasNmap = await plugin.isToolAvailable('nmap');
   if (!hasNmap) {
     console.warn('nmap not installed, port scanning will be skipped');
   }
   ```

---

### Don'ts ❌

1. **Don't use aggressive mode without authorization**
   ```javascript
   // ❌ Bad - Aggressive mode on public sites
   const plugin = new ReconPlugin({
     behavior: 'aggressive',
     targets: ['google.com']  // Illegal!
   });

   // ✅ Good - Stealth mode with authorization
   const plugin = new ReconPlugin({
     behavior: 'stealth',
     targets: ['authorized-client.com']
   });
   ```

2. **Don't disable rate limiting in stealth mode**
   ```javascript
   // ❌ Bad - Stealth mode without rate limiting
   const plugin = new ReconPlugin({
     behavior: 'stealth',
     rateLimit: { enabled: false }  // Defeats stealth purpose
   });

   // ✅ Good - Keep rate limiting enabled
   const plugin = new ReconPlugin({
     behavior: 'stealth'  // Rate limiting auto-enabled
   });
   ```

3. **Don't forget to enable persistence**
   ```javascript
   // ❌ Bad - No historical tracking
   const plugin = new ReconPlugin({
     storage: { persist: false },
     resources: { persist: false }
   });

   // ✅ Good - Enable all 3 storage layers
   const plugin = new ReconPlugin({
     storage: { persist: true },
     resources: { persist: true }
   });
   ```

4. **Don't use vulnerability scanners without authorization**
   ```javascript
   // ❌ Bad - Vulnerability scanning without permission
   const plugin = new ReconPlugin({
     features: {
       vulnerability: { nikto: true }  // Illegal on unauthorized targets!
     }
   });

   // ✅ Good - Only on authorized targets
   const plugin = new ReconPlugin({
     behavior: 'aggressive',  // Vulnerability scanning enabled
     targets: ['authorized-internal.corp.local']
   });
   ```

5. **Don't ignore tool availability events**
   ```javascript
   // ❌ Bad - Silent failures
   const report = await plugin.scan('example.com');

   // ✅ Good - Monitor tool availability
   plugin.on('recon:tool-unavailable', ({ tool, stage }) => {
     console.warn(`${tool} unavailable - install for ${stage} stage`);
   });
   ```

6. **Don't perform full scans on every target**
   ```javascript
   // ❌ Bad - Full scan on all targets (slow)
   const plugin = new ReconPlugin({
     scheduler: { enabled: true, interval: 300000 },  // 5 minutes
     targets: ['target1.com', 'target2.com', ...100targets]
   });

   // ✅ Good - Selective scanning
   const plugin = new ReconPlugin({
     scheduler: { enabled: true, interval: 3600000 },  // 1 hour
     targets: [
       { target: 'critical.com', features: { ports: true, subdomains: true } },
       { target: 'low-priority.com', features: { dns: true } }  // Minimal
     ]
   });
   ```

7. **Don't query all records without partitions**
   ```javascript
   // ❌ Bad - O(n) full scan
   const all = await reportsResource.list();  // Slow!

   // ✅ Good - O(1) partition query
   const reports = await reportsResource.listPartition('byHost', {
     'target.host': 'example.com'
   });
   ```

---

### Performance Tips

- **Use passive mode for OSINT** - No active scanning, no detection risk, fast
- **Enable concurrency** - Scan multiple targets in parallel (`maxConcurrent: 5`)
- **Tune timeouts** - Reduce timeouts for fast failures (`timeout: 10000`)
- **Use partitions** - O(1) queries by host, date, or namespace
- **Enable compression** - Reduce storage size (`storage.compression: true`)
- **Limit history** - Keep only recent scans (`storage.historyLimit: 20`)

---

### Security Considerations

- **Authorization required** - Never scan targets without explicit permission
- **Rate limiting** - Enable for stealth operations to avoid detection
- **Tool safety** - Vulnerability scanners can generate noisy traffic
- **Data encryption** - Enable for sensitive reconnaissance data (`storage.encryption: true`)
- **Namespace isolation** - Separate production, development, and testing scans
- **Audit logging** - Track all reconnaissance activities with event handlers

---

## 🚨 Error Handling

### Common Errors

#### 1. ToolUnavailableError: "nmap not found"

**Problem**: Required reconnaissance tool not installed.

**Solution:**
```javascript
// Check tool status
const status = await plugin.getToolStatus();
console.log(status);

// Install missing tools
// sudo apt install nmap
// go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest

// Or disable tool in configuration
const plugin = new ReconPlugin({
  features: {
    ports: { nmap: false, masscan: false }  // Disable port scanning
  }
});
```

---

#### 2. TimeoutError: "Scan timed out"

**Problem**: Scan exceeded configured timeout.

**Solution:**
```javascript
// Increase timeout
const plugin = new ReconPlugin({
  performance: {
    timeout: 600000,  // 10 minutes (default: 5 minutes)
    retries: 3        // Retry failed scans
  }
});

// Or reduce scan scope
const report = await plugin.scan('example.com', {
  dns: true,
  ports: false,      // Disable slow port scanning
  subdomains: false  // Disable slow subdomain discovery
});
```

---

#### 3. RateLimitError: "Rate limit exceeded"

**Problem**: External API rate limits exceeded.

**Solution:**
```javascript
// Enable rate limiting
const plugin = new ReconPlugin({
  rateLimit: {
    enabled: true,
    requestsPerMinute: 30,
    delayBetweenStages: 5000  // 5 second delay between stages
  }
});

// Or use API keys
const plugin = new ReconPlugin({
  features: {
    subdomains: {
      virustotal: {
        enabled: true,
        apiKey: process.env.VT_API_KEY  // Avoid rate limits
      }
    }
  }
});
```

---

#### 4. ValidationError: "Invalid target"

**Problem**: Target format invalid or unsupported.

**Solution:**
```javascript
// ❌ Bad - Invalid formats
await plugin.scan('');                    // Empty string
await plugin.scan('not a domain');        // Invalid format
await plugin.scan('http://');             // Incomplete URL

// ✅ Good - Valid formats
await plugin.scan('example.com');         // Domain
await plugin.scan('93.184.216.34');       // IP address
await plugin.scan('https://example.com'); // Full URL
await plugin.scan('example.com:8080');    // Domain with port
```

---

#### 5. StorageError: "Failed to persist report"

**Problem**: Storage layer unavailable or insufficient permissions.

**Solution:**
```javascript
// Check database connection
if (!db.isConnected()) {
  await db.connect();
}

// Verify plugin is initialized
if (!plugin.isInitialized) {
  await plugin.initialize();
}

// Check storage permissions
const storage = plugin.getStorage();
try {
  await storage.set('test-key', { test: 'value' });
  await storage.delete('test-key');
  console.log('Storage is working');
} catch (error) {
  console.error('Storage permission error:', error);
}
```

---

#### 6. NamespaceError: "Namespace collision"

**Problem**: Multiple plugins using same namespace.

**Solution:**
```javascript
// ❌ Bad - Namespace collision
const plugin1 = new ReconPlugin({ namespace: 'default' });
const plugin2 = new ReconPlugin({ namespace: 'default' });  // Error!

// ✅ Good - Unique namespaces
const prodPlugin = new ReconPlugin({ namespace: 'production' });
const devPlugin = new ReconPlugin({ namespace: 'development' });
const testPlugin = new ReconPlugin({ namespace: 'testing' });
```

---

### Troubleshooting

#### Issue 1: DNS Resolution Fails

**Diagnosis:**
1. Check DNS resolvers are reachable
2. Verify target is valid
3. Try multiple resolvers

**Fix:**
```javascript
// Try multiple resolvers
const plugin = new ReconPlugin({
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

---

#### Issue 2: Port Scanning Timeouts

**Diagnosis:**
1. Target firewall blocking scans
2. Too many ports being scanned
3. Network latency too high

**Fix:**
```javascript
// Reduce scope and increase timeout
const plugin = new ReconPlugin({
  features: {
    ports: {
      topPorts: 10,     // Reduce from 100
      timeout: 10000,   // Increase to 10 seconds
      concurrent: 5     // Lower concurrency
    }
  }
});
```

---

#### Issue 3: Subdomain Discovery Rate Limits

**Diagnosis:**
1. External API rate limits exceeded
2. No API key provided
3. Too many concurrent requests

**Fix:**
```javascript
// Use API keys and enable rate limiting
const plugin = new ReconPlugin({
  features: {
    subdomains: {
      virustotal: {
        enabled: true,
        apiKey: process.env.VT_API_KEY,
        rateLimit: { requests: 4, per: 60000 }  // 4 req/min
      }
    }
  },
  rateLimit: {
    enabled: true,
    requestsPerMinute: 30
  }
});
```

---

#### Issue 4: Missing Tools Cause Empty Results

**Diagnosis:**
1. Tools not installed
2. Tools not in PATH
3. Insufficient permissions

**Fix:**
```bash
# Check tool availability
which nmap subfinder amass

# Install missing tools
sudo apt install nmap
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/OWASP/Amass/v3/...@master

# Add to PATH
export PATH="$PATH:$HOME/go/bin"

# Verify installation
nmap --version
subfinder -version
```

---

#### Issue 5: Historical Data Not Queryable

**Diagnosis:**
1. Resource persistence disabled
2. Resources not created
3. Partition fields missing

**Fix:**
```javascript
// Enable resource persistence
const plugin = new ReconPlugin({
  resources: {
    persist: true,
    autoCreate: true  // Auto-create resources during install
  }
});

// Verify resources exist
const hostsResource = await db.getResource('plg_recon_hosts');
if (!hostsResource) {
  console.error('Resources not created - check autoCreate setting');
}

// Use partition queries
const reports = await reportsResource.listPartition('byDay', {
  timestampDay: '2025-01-01'
});
```

---

## 🔗 See Also

### Related Documentation

- **[Overview](./recon/overview.md)** - Introduction and quick start
- **[Architecture](./recon/architecture.md)** - System design and data flow
- **[Storage System](./recon/storage.md)** - 3-layer storage architecture
- **[Target Management](./recon/targets.md)** - Managing scan targets
- **[Artifacts System](./recon/artifacts.md)** - Per-tool result artifacts
- **[Progress Tracking](./recon/progress.md)** - Monitoring scan progress
- **[Namespace Support](./recon/namespace.md)** - Multi-instance isolation
- **[Namespace Implementation](./recon/namespace-implementation.md)** - Technical details
- **[Uptime Behavior](./recon/uptime-behavior.md)** - Availability monitoring
- **[Uptime Aggregation](./recon/uptime-aggregation.md)** - Aggregating uptime metrics
- **[Refactoring Guide](./recon/refactoring.md)** - Code organization strategy

### Related Plugins

- [TTL Plugin](./ttl.md) - Automatic artifact cleanup
- [Scheduler Plugin](./scheduler.md) - Advanced scheduling
- [Metrics Plugin](./metrics.md) - Performance monitoring
- [Cache Plugin](./cache.md) - Memoize expensive sweeps

### Examples

- **Basic Recon Scan**: `docs/examples/e48-recon-basic.js`
- **Multi-Instance Setup**: `docs/examples/e45-recon-multi-instance.js`
- **Namespace Detection**: `docs/examples/e46-recon-namespace-detection.js`
- **Uptime Monitoring**: `docs/examples/e50-recon-uptime-monitoring.js`
- **Per-Tool Artifacts**: `docs/examples/e48-recon-per-tool-artifacts.js`

### Tests

- **Plugin Tests**: `tests/plugins/recon.test.js`
- **Storage Tests**: `tests/plugins/recon-storage.test.js`
- **Behavior Tests**: `tests/plugins/recon-behavior.test.js`

### Source Code

- **Plugin**: `src/plugins/recon/index.js`
- **Storage Manager**: `src/plugins/recon/managers/storage-manager.js`
- **Command Runner**: `src/plugins/recon/managers/command-runner.js`
- **Uptime Behavior**: `src/plugins/recon/behaviors/uptime-behavior.js`
- **Resource Config**: `src/plugins/recon/config/resources.js`

---

## ❓ FAQ

### General

**Q: What's the difference between passive, stealth, and aggressive modes?**

A:

| Mode | Detection Risk | Speed | Use Case |
|------|----------------|-------|----------|
| `passive` | None | Fast | OSINT, bug bounty, pre-engagement recon |
| `stealth` | Low | Slow (rate-limited) | Authorized pentesting, red team (low-noise) |
| `aggressive` | High | Very Fast | Internal audits, asset discovery |

```javascript
// Passive - OSINT only
new ReconPlugin({ behavior: 'passive' })

// Stealth - Rate-limited scans
new ReconPlugin({ behavior: 'stealth' })

// Aggressive - Full arsenal
new ReconPlugin({ behavior: 'aggressive' })
```

---

**Q: How do I scan only specific reconnaissance stages?**

A: Use the `options` parameter in `scan()`:

```javascript
// Only DNS and ports
const report = await plugin.scan('example.com', {
  dns: true,
  ports: true,
  tls: false,
  subdomains: false
});

// Or configure features in plugin initialization
const plugin = new ReconPlugin({
  features: {
    dns: true,
    ports: { nmap: true },
    subdomains: false,  // Disable subdomain discovery
    vulnerability: false  // Disable vulnerability scanning
  }
});
```

---

**Q: How many targets can I scan concurrently?**

A: Configure `maxConcurrent` based on resources:

```javascript
// Low volume (< 10 targets)
performance: { maxConcurrent: 2 }

// Medium volume (10-50 targets)
performance: { maxConcurrent: 5 }

// High volume (50+ targets)
performance: { maxConcurrent: 10 }

// Rule of thumb: 1 concurrent scan per CPU core
```

---

**Q: Should I enable all 3 storage layers?**

A: Yes, for production:

```javascript
// ✅ Recommended: All 3 layers
const plugin = new ReconPlugin({
  storage: { persist: true },      // Layer 1: Raw artifacts
                                   // Layer 2: Aggregated results (auto-enabled)
  resources: { persist: true }     // Layer 3: Queryable database
});

// Each layer serves different purposes:
// Layer 1: Raw CLI output for debugging
// Layer 2: Parsed and aggregated results
// Layer 3: Time-series queries, change detection, reporting
```

---

### Behavior Modes

**Q: When should I use passive mode?**

A: Use passive mode when:
- Performing OSINT reconnaissance
- Pre-engagement information gathering
- Bug bounty reconnaissance (before scope confirmation)
- Compliance-restricted environments
- Educational or research purposes

Passive mode uses only OSINT sources (DNS, Certificate Transparency, WHOIS, theHarvester) with no active scanning.

---

**Q: How do I override specific settings in a behavior preset?**

A: Use `behaviorOverrides`:

```javascript
const plugin = new ReconPlugin({
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

// Monitor applied configuration
plugin.on('recon:behavior-applied', ({ mode, overrides, final }) => {
  console.log(`Applied ${mode} with ${Object.keys(overrides).length} overrides`);
  console.log('Final config:', final);
});
```

---

**Q: What tools are enabled in each behavior mode?**

A:

**Passive Mode:**
- ✅ DNS resolution (A/AAAA records only)
- ✅ Certificate Transparency logs (crt.sh)
- ✅ OSINT (theHarvester)
- ✅ WHOIS
- ❌ No nmap/masscan
- ❌ No active probing

**Stealth Mode:**
- ✅ DNS enumeration + Certificate analysis
- ✅ Ping (3 packets, longer timeout)
- ✅ HTTP probing (custom user-agent)
- ✅ Subdomain discovery (subfinder + crt.sh only)
- ✅ Port scanning (top 10 ports, `-T2` timing)
- ✅ TLS audit (OpenSSL only)
- ❌ No fuzzing or vulnerability scanning
- Concurrency: 1 (sequential)
- Rate limit: 10 req/min, 5s delay between stages

**Aggressive Mode:**
- ✅ All tools enabled
- ✅ Multiple subdomain tools (amass + subfinder + assetfinder + crt.sh)
- ✅ Full port scanning (nmap + masscan)
- ✅ Web fuzzing (ffuf + feroxbuster + gobuster)
- ✅ Vulnerability scanning (nikto + wpscan + droopescan)
- ✅ TLS audit (openssl + sslyze + testssl)
- ✅ Fingerprinting (whatweb)
- ✅ Screenshots (aquatone, eyewitness)
- Concurrency: 8 (parallel)
- Rate limit: Disabled

---

### Performance

**Q: How long does a full scan take?**

A: Typical scan times:

| Configuration | Duration | Notes |
|---------------|----------|-------|
| DNS only | 50-200ms | Node.js built-ins |
| DNS + Ports (top 10) | 5-15s | Depends on target |
| DNS + Ports (top 100) | 30-60s | More ports = slower |
| Full scan (passive) | 30-60s | OSINT sources |
| Full scan (stealth) | 2-5min | Rate-limited |
| Full scan (aggressive) | 5-10min | All tools |

Optimize with:
- Reduce `topPorts` (100 → 10)
- Disable slow tools (amass, masscan)
- Increase concurrency
- Reduce timeouts
- Enable caching

---

**Q: How much storage does reconnaissance data consume?**

A: Storage estimates per target per scan:

| Layer | Size | Notes |
|-------|------|-------|
| Layer 1 (Raw artifacts) | 10-50 KB | Raw CLI output (truncated) |
| Layer 2 (Aggregated) | 5-20 KB | Parsed and structured |
| Layer 3 (Database) | 2-10 KB | Metadata only |
| **Total per scan** | **17-80 KB** | Depends on scan scope |

For 100 targets with 20 scans each (historyLimit: 20):
- Total storage: 34-160 MB
- With compression: 10-50 MB (70% reduction)

Enable cleanup:
```javascript
// TTL Plugin - Auto-delete old scans
new TTLPlugin({
  resources: {
    plg_recon_reports: { ttl: 2592000000 }  // 30 days
  }
})
```

---

**Q: How can I speed up subdomain discovery?**

A: Optimization strategies:

```javascript
// 1. Disable slow tools
features: {
  subdomains: {
    amass: false,      // Slow (2-5 minutes)
    subfinder: true,   // Fast (5-10 seconds)
    crtsh: true        // Fast (passive)
  }
}

// 2. Reduce timeout
features: {
  subdomains: {
    subfinder: { timeout: 10000 }  // 10 seconds
  }
}

// 3. Use caching
// Cache results for repeated scans
const cache = new CachePlugin({ ttl: 3600000 });  // 1 hour
await db.usePlugin(cache);
```

Performance comparison:
- amass: 2-5 minutes (comprehensive)
- subfinder: 5-10 seconds (fast, reliable)
- crt.sh: 1-3 seconds (passive CT logs)

---

### Tool Dependencies

**Q: What happens if a tool is not installed?**

A: Automatic fallback:

```javascript
// Plugin automatically detects missing tools
plugin.on('recon:tool-unavailable', ({ tool, stage }) => {
  console.warn(`Skipping ${stage} stage - ${tool} not installed`);
});

// Scan continues with available tools
const report = await plugin.scan('example.com');
// If nmap is missing, ports stage returns { status: 'unavailable' }
```

**Check tool status:**
```javascript
const status = await plugin.getToolStatus();
console.log(status);
// {
//   nmap: { available: true, version: '7.94' },
//   amass: { available: false, error: 'Command not found' }
// }
```

---

**Q: How do I install missing reconnaissance tools?**

A:

```bash
# DNS tools (usually pre-installed)
which dig host nslookup

# Port scanning
sudo apt install nmap
go install github.com/robertdavidgraham/masscan@latest

# Subdomain enumeration
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/OWASP/Amass/v3/...@master
go install github.com/tomnomnom/assetfinder@latest

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

# Verify installation
nmap --version
subfinder -version
ffuf -V
```

**Tool priority:**

When multiple tools serve the same purpose:

```javascript
// Subdomain discovery priority
1. amass         // Most comprehensive (slow)
2. subfinder     // Fast, reliable (recommended)
3. assetfinder   // Fallback
4. crt.sh        // Passive, always available

// Port scanning priority
1. masscan       // Fastest for full range
2. nmap          // Most features, service detection (recommended)

// Web fuzzing priority
1. ffuf          // Fastest
2. feroxbuster   // Good features
3. gobuster      // Fallback
```

---

**Q: Can I use custom tool binaries or Docker containers?**

A: Yes, use `commandRunner` injector:

```javascript
import { CustomCommandRunner } from './custom-runner.js';

const plugin = new ReconPlugin({
  commandRunner: new CustomCommandRunner({
    nmap: {
      command: '/custom/path/to/nmap',  // Custom binary path
      args: ['-sV', '-T4']               // Custom args
    },
    subfinder: {
      command: 'docker',
      args: ['run', '--rm', 'projectdiscovery/subfinder', '-d']  // Docker
    }
  })
});
```

---

### Storage & Queries

**Q: How do I query reconnaissance data by date range?**

A: Use time-series partitions:

```javascript
// Query scans for a specific day (O(1) partition-based)
const reportsResource = await db.getResource('plg_recon_reports');
const scans = await reportsResource.listPartition('byDay', {
  timestampDay: '2025-01-01'
});

// Query last 7 days
const last7Days = ['2025-01-01', '2025-01-02', ..., '2025-01-07'];
for (const day of last7Days) {
  const dayScans = await reportsResource.listPartition('byDay', { timestampDay: day });
  console.log(`${day}: ${dayScans.length} scans`);
}

// Query by host and date
const hostReports = await reportsResource.query({
  'target.host': 'example.com',
  timestampDay: { $gte: '2025-01-01', $lte: '2025-01-31' }
});
```

---

**Q: How do I track changes over time (diff detection)?**

A: Use `detectChanges()` or query diffs resource:

```javascript
// Detect changes using API
const changes = await plugin.detectChanges('example.com', {
  tool: 'ports',
  timeRange: 'last-7-days'
});

console.log(changes);
// {
//   opened: [{ port: '8080/tcp', since: '2025-01-01T12:00:00.000Z' }],
//   closed: [{ port: '21/tcp', since: '2025-01-02T06:00:00.000Z' }]
// }

// Or query diffs resource directly
const diffsResource = await db.getResource('plg_recon_diffs');
const recentDiffs = await diffsResource.query({
  host: 'example.com',
  'changes.subdomains.added': { $exists: true },
  'summary.severity': { $in: ['medium', 'high', 'critical'] }
});

console.log(`Found ${recentDiffs.length} critical changes`);
```

---

**Q: What's stored in each of the 3 storage layers?**

A:

**Layer 1: PluginStorage (Raw Artifacts)**
```
plugin=recon/reports/example.com/stages/<timestamp>/tools/
├── nmap.json           # Raw nmap output + parsed results
├── subfinder.json      # Raw subfinder output + parsed results
└── crtsh.json          # Raw CT log output + parsed results
```

**Layer 2: PluginStorage (Aggregated Results)**
```
plugin=recon/reports/example.com/
├── <timestamp>.json    # Complete scan report with fingerprint
├── latest.json         # Most recent scan
├── index.json          # Historical summary (last 20 scans)
└── stages/<timestamp>/aggregated/
    ├── dns.json        # Aggregated DNS results
    ├── ports.json      # Combined nmap + masscan results
    └── subdomains.json # Combined subfinder + amass + crtsh results
```

**Layer 3: Database Resources (Queryable)**
```
plg_recon_hosts         # Host fingerprints (primaryIp, openPorts, technologies)
plg_recon_reports       # Scan metadata (timestamp, status, storageKey)
plg_recon_stages        # Stage execution metadata (duration, toolsUsed, status)
plg_recon_diffs         # Change detection (new subdomains, open ports, IP changes)
plg_recon_subdomains    # Consolidated subdomain list per host
plg_recon_paths         # Discovered endpoints per host
plg_recon_targets       # Dynamic target configurations
```

**Why 3 layers?**
- Layer 1: Debugging, forensics, tool comparison
- Layer 2: Fast access to latest results, historical tracking
- Layer 3: Time-series queries, dashboards, alerting, reporting

---

### Uptime & Monitoring

**Q: How do I integrate uptime monitoring with reconnaissance?**

A: Enable uptime behavior:

```javascript
const plugin = new ReconPlugin({
  uptime: {
    enabled: true,
    interval: 60000,     // Check every minute
    targets: ['example.com', 'api.example.com'],
    checkHTTP: true,
    checkHTTPS: true,
    checkPing: true,
    alertThreshold: 3    // Alert after 3 consecutive failures
  }
});

await db.usePlugin(plugin);

// Uptime status is automatically included in reconnaissance reports
const report = await plugin.scan('example.com');
console.log(report.uptime);
// {
//   status: 'up',
//   uptimePercentage: '99.85',
//   lastCheck: '2025-01-01T12:00:00.000Z',
//   isDown: false,
//   consecutiveFails: 0
// }

// Query scans during downtime
const reportsResource = await db.getResource('plg_recon_reports');
const downtimeScans = await reportsResource.query({
  'uptime.isDown': true
});

console.log(`${downtimeScans.length} scans performed during downtime`);
```

---

**Q: How do I correlate reconnaissance changes with uptime events?**

A: Query for suspicious patterns:

```javascript
// Find changes detected during downtime (possible attack indicator)
const suspiciousChanges = await reportsResource.query({
  'uptime.isDown': true,
  $or: [
    { 'summary.totalPorts': { $gt: 0 } },      // New open ports
    { 'summary.totalSubdomains': { $gt: 0 } }, // New subdomains
    { 'changes.ip.changed': true }             // IP address changed
  ]
});

console.log(`Found ${suspiciousChanges.length} suspicious changes during downtime`);

// Hosts with frequent downtime
const unreliableHosts = await reportsResource.query({
  'uptime.consecutiveFails': { $gte: 5 }
});

// Hosts with low uptime percentage
const lowUptimeHosts = await reportsResource.query({
  'uptime.uptimePercentage': { $lt: '95.00' }
});
```

---

### Namespaces

**Q: When should I use namespaces?**

A: Use namespaces for:

1. **Environment separation** (dev/staging/prod)
2. **Multi-tenant SaaS** (different customers)
3. **Different scan profiles** (passive vs aggressive)
4. **Team isolation** (security team vs dev team)

```javascript
// Environment separation
const prodRecon = new ReconPlugin({ namespace: 'production' });
const devRecon = new ReconPlugin({ namespace: 'development' });
const stagingRecon = new ReconPlugin({ namespace: 'staging' });

// Multi-tenant
const clientA = new ReconPlugin({ namespace: 'client-a' });
const clientB = new ReconPlugin({ namespace: 'client-b' });

// Scan profiles
const osintRecon = new ReconPlugin({ namespace: 'osint', behavior: 'passive' });
const auditRecon = new ReconPlugin({ namespace: 'audit', behavior: 'aggressive' });
```

---

**Q: How do namespaces affect storage and queries?**

A:

**Storage Structure:**
```
plugin=recon/namespace=production/reports/example.com/...
plugin=recon/namespace=development/reports/example.com/...
```

**Database Resources:**
```javascript
// Query production scans only
const hostsResource = await db.getResource('plg_recon_hosts');
const prodHosts = await hostsResource.listPartition('byNamespace', {
  namespace: 'production'
});

// Query development scans only
const devHosts = await hostsResource.listPartition('byNamespace', {
  namespace: 'development'
});

// Cross-namespace query (compare environments)
const prodReport = await plugin.scan('example.com', { namespace: 'production' });
const devReport = await plugin.scan('example.com', { namespace: 'development' });

// Compare configurations
if (prodReport.fingerprint.openPorts.length !== devReport.fingerprint.openPorts.length) {
  console.warn('Port mismatch between production and development!');
}
```

---

### Alerts & Reporting

**Q: How do I generate client-ready reports?**

A: Use `generateClientReport()`:

```javascript
// Markdown report
const markdown = await plugin.generateClientReport('example.com');
console.log(markdown);
// # Recon Report – https://example.com
// - **Last scan:** 2025-01-01T00:00:00.000Z
// - **Status:** ok
// - **Primary IP:** 93.184.216.34
// - **CDN/WAF:** Cloudflare
// ...

// JSON report
const json = await plugin.generateClientReport('example.com', {
  format: 'json',
  diffLimit: 5
});
console.log(json);
// {
//   host: 'example.com',
//   summary: { primaryIp, openPorts, technologies, ... },
//   latestReport: { ... },
//   diffs: [...],
//   stages: [...]
// }

// Get recent alerts only
const alerts = await plugin.getRecentAlerts('example.com', {
  limit: 3,
  severity: ['high', 'critical']
});
```

---

**Q: How do I set up alerting for critical changes?**

A: Use event handlers:

```javascript
plugin.on('recon:alert', async ({ host, stage, severity, description, values }) => {
  // Send alert via email, Slack, PagerDuty, etc.
  if (severity === 'high' || severity === 'critical') {
    await sendSlackAlert({
      channel: '#security-alerts',
      message: `🚨 ${severity.toUpperCase()}: ${host}\n${description}`,
      details: values
    });
  }
});

plugin.on('recon:completed', async ({ target, report, changes }) => {
  // Alert on specific changes
  if (changes.ports?.opened?.length > 0) {
    await sendAlert({
      severity: 'high',
      message: `New open ports detected on ${target}`,
      ports: changes.ports.opened
    });
  }

  if (changes.subdomains?.added?.length > 0) {
    await sendAlert({
      severity: 'medium',
      message: `New subdomains discovered for ${target}`,
      subdomains: changes.subdomains.added
    });
  }

  // Alert on TLS expiration
  if (report.results.certificate?.daysUntilExpiry <= 30) {
    await sendAlert({
      severity: 'high',
      message: `TLS certificate expiring soon for ${target}`,
      daysRemaining: report.results.certificate.daysUntilExpiry
    });
  }
});
```

---

**Q: What types of changes trigger alerts?**

A: Default alert triggers:

| Change Type | Severity | Description |
|-------------|----------|-------------|
| New open ports | High | Ports not previously open |
| Closed critical ports | High | Ports 22, 80, 443 closed |
| New subdomains | Medium | Subdomains not previously discovered |
| IP address change | High | Primary IP changed |
| CDN change | Medium | CDN/WAF changed |
| TLS expiration | High | Certificate expiring < 30 days |
| New technologies | Low | New server/framework detected |

Customize alert logic:
```javascript
plugin.on('recon:completed', async ({ target, report, changes }) => {
  // Custom alert: New high-numbered ports (possibly malware)
  const suspiciousPorts = changes.ports?.opened?.filter(p =>
    parseInt(p.port) > 10000
  );

  if (suspiciousPorts?.length > 0) {
    await sendAlert({
      severity: 'critical',
      message: `Suspicious high-numbered ports detected on ${target}`,
      ports: suspiciousPorts
    });
  }
});
```

---

### Advanced

**Q: How do I benchmark reconnaissance performance?**

A: Use timestamps and metrics:

```javascript
const start = Date.now();
const report = await plugin.scan('example.com', { persist: true });
const duration = Date.now() - start;

console.log(`Total scan duration: ${duration}ms`);
console.log('Stage durations:');
for (const [stage, result] of Object.entries(report.results)) {
  if (result.duration) {
    console.log(`  ${stage}: ${result.duration}ms`);
  }
}

// Query stage performance from database
const stagesResource = await db.getResource('plg_recon_stages');
const stages = await stagesResource.query({
  'target.host': 'example.com',
  timestampDay: '2025-01-01'
});

const avgDurations = stages.reduce((acc, stage) => {
  if (!acc[stage.stageName]) acc[stage.stageName] = [];
  acc[stage.stageName].push(stage.duration);
  return acc;
}, {});

for (const [name, durations] of Object.entries(avgDurations)) {
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  console.log(`${name} average: ${avg.toFixed(0)}ms`);
}
```

---

**Q: Can I run reconnaissance scans without persistence?**

A: Yes, disable storage:

```javascript
const plugin = new ReconPlugin({
  storage: { persist: false },
  resources: { persist: false }
});

// Scan returns report but doesn't save to storage
const report = await plugin.scan('example.com');

// Use report immediately
console.log(report.fingerprint);

// No historical data will be available
const artifacts = await plugin.getArtifacts('dns', { target: 'example.com' });
console.log(artifacts.length);  // 0 (nothing persisted)
```

**Use case:** One-off scans, memory-constrained environments, testing

---

**Q: How do I extend the fingerprint with custom heuristics?**

A: Subclass ReconPlugin and override `_buildFingerprint()`:

```javascript
import { ReconPlugin } from 's3db.js/plugins';

class CustomReconPlugin extends ReconPlugin {
  _buildFingerprint(target, results) {
    const baseFingerprint = super._buildFingerprint(target, results);

    // Add custom heuristics
    const customFingerprint = {
      ...baseFingerprint,

      // Detect if target is cloud-hosted
      isCloudHosted: this._detectCloudHosting(results),

      // Calculate security score
      securityScore: this._calculateSecurityScore(results),

      // Detect frameworks
      frameworks: this._detectFrameworks(results)
    };

    return customFingerprint;
  }

  _detectCloudHosting(results) {
    // Custom logic
    const cloudProviders = ['aws', 'azure', 'gcp', 'cloudflare'];
    const reverse = results.dns?.records?.reverse || {};

    for (const hostname of Object.values(reverse).flat()) {
      for (const provider of cloudProviders) {
        if (hostname.includes(provider)) return provider;
      }
    }

    return null;
  }

  _calculateSecurityScore(results) {
    let score = 100;

    // Deduct points for open ports
    if (results.ports?.openPorts?.length > 10) score -= 20;

    // Deduct points for expired certificate
    if (results.certificate?.daysUntilExpiry < 30) score -= 30;

    // Deduct points for missing security headers
    if (!results.curl?.headers?.['strict-transport-security']) score -= 10;

    return Math.max(0, score);
  }

  _detectFrameworks(results) {
    const frameworks = [];

    // Detect from HTTP headers
    const server = results.curl?.headers?.server?.toLowerCase();
    if (server?.includes('express')) frameworks.push('Express.js');
    if (server?.includes('nginx')) frameworks.push('Nginx');

    // Detect from technologies
    const tech = results.fingerprintTools?.technologies || [];
    frameworks.push(...tech.filter(t => t.includes('Framework')));

    return [...new Set(frameworks)];
  }
}

// Use custom plugin
const plugin = new CustomReconPlugin({ behavior: 'stealth' });
const report = await plugin.scan('example.com');

console.log(report.fingerprint);
// {
//   ...baseFingerprint,
//   isCloudHosted: 'cloudflare',
//   securityScore: 70,
//   frameworks: ['Express.js', 'Nginx']
// }
```

---

## License

MIT License - See main s3db.js LICENSE file
