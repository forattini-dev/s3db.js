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

### 3. Use Partitioned Queries

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
