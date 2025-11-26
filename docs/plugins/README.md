# 🔌 s3db.js Plugin System

> **Explore the full plugin ecosystem for s3db.js—performance, observability, automation, and more.**
>
> **Navigation:** [Quick Start ↓](#-quick-start) | [Architecture ↓](#️-plugin-architecture) | [Plugin List ↓](#-all-available-plugins) | [Documentation Standard ↓](#-documentation-standard)

---

<p align="center">
  <strong>Extend your database with powerful plugins</strong><br>
  <em>26 production-ready plugins • Zero core modifications • Infinite possibilities</em>
</p>

---

## 📖 Documentation Standard

**All plugin documentation follows a standardized format for consistency and ease of use.**

- **[📋 Documentation Standard](../plugin-docs-standard.md)** - Complete specification with 12 required sections
- **[📝 Full Template](../templates/plugin-doc-template.md)** - Comprehensive template for complex plugins
- **[📝 Minimal Template](../templates/plugin-doc-minimal.md)** - Streamlined template for simple plugins
- **[🌟 Gold Standard](./puppeteer/README.md)** - Exemplar implementation (1,850+ lines)

### Quality Badges

Plugin documentation quality is indicated with badges:

- 🟢 **Complete**: All requirements met, passes quality checklist (12 sections, 10+ FAQ, examples, cross-links)
- 🟡 **Partial**: Most sections present (8-11), some content missing or minimal
- 🔴 **Minimal**: Stub documentation, incomplete sections

**Contributing:** When documenting plugins, use the templates above to achieve 🟢 Complete rating.

---

## 🎯 All Available Plugins

| Plugin | Purpose | Use Cases | Docs |
|--------|---------|-----------|------|
| **[🌐 API](./api/README.md)** | Auto-generated REST API with OpenAPI, path-based auth, template engine | RESTful endpoints, Swagger UI, multi-auth, SSR | [→](./api/README.md) |
| **[📝 Audit](./audit.md)** | Comprehensive operation logging | Compliance, security | [→](./audit.md) |
| **[💾 Backup](./backup.md)** | Multi-destination backup system | Data protection, disaster recovery | [→](./backup.md) |
| **[💾 Cache](./cache.md)** | Multi-driver caching (memory/S3/filesystem) | Performance, cost reduction | [→](./cache.md) |
| **[💰 Costs](./costs.md)** | Real-time AWS S3 cost tracking | Budget monitoring, optimization | [→](./costs.md) |
| **[☁️ Cloud Inventory](./cloud-inventory.md)** | Multi-cloud inventory with versioning & diffs | CMDB, compliance, drift detection | [→](./cloud-inventory.md) |
| **[⚡ Eventual Consistency](./eventual-consistency.md)** | Transaction-based counters | Balances, analytics, aggregations | [→](./eventual-consistency.md) |
| **[🔍 FullText](./fulltext.md)** | Full-text search capabilities | Search, content discovery | [→](./fulltext.md) |
| **[🌍 Geo](./geo.md)** | Location-based queries & proximity search | Store locators, routing | [→](./geo.md) |
| **[🕸️ Graph](./graphs.md)** | Graph database with vertices, edges, A* pathfinding | Social networks, recommendations, knowledge graphs | [→](./graphs.md) |
| **[🔐 Identity](./identity/README.md)** | OAuth2/OIDC authentication with MFA | SSO, user management, whitelabel UI | [→](./identity/README.md) |
| **[☸️ Kubernetes Inventory](./kubernetes-inventory/)** | Multi-cluster K8s inventory with versioning & diffs | CMDB, compliance, cluster monitoring | [→](./kubernetes-inventory/) |
| **[📥 Importer](./importer.md)** | Multi-format data import | JSON, CSV, bulk migrations | [→](./importer.md) |
| **[📊 Metrics](./metrics.md)** | Performance & usage analytics | Monitoring, insights | [→](./metrics.md) |
| **[🤖 ML](./ml-plugin/)** | Machine learning model management | Model inference, predictions | [→](./ml-plugin/) |
| **[🛰️ Recon](./recon/)** | Full-stack recon (DNS, ports, TLS, subdomains) with scheduled sweeps | Incident response, asset discovery, continuous monitoring | [→](./recon/) |
| **[📬 Queue Consumer](./queue-consumer.md)** | Process RabbitMQ/SQS messages | Event-driven architecture | [→](./queue-consumer.md) |
| **[🔗 Relation](./relation.md)** | ORM-like relationships (hasOne, hasMany, belongsTo, belongsToMany) | Relational data, joins, nested loading | [→](./relation.md) |
| **[🔄 Replicator](./replicator/)** | Real-time data replication | PostgreSQL, BigQuery, SQS, S3DB | [→](./replicator/) |
| **[🔒 S3Queue](./s3-queue/)** | Distributed queue with zero race conditions | Task queues, worker pools | [→](./s3-queue/) |
| **[🕷️ Spider Suite](./spider/)** | Crawling bundle (Puppeteer + S3 queue + TTL) | Web scraping pipelines, sitemap refresh, link audits | [→](./spider/README.md) |
| **[🍪 Cookie Farm Suite](./cookie-farm/README.md)** | Persona farming bundle (Cookie Farm + Puppeteer + Queue) | Anti-bot personas, warmup workflows, session rotation | [→](./cookie-farm/README.md) |
| **[🎭 Puppeteer](./puppeteer/README.md)** | Headless browser automation with anti-detection & pooling | Scraping, testing, cookie farming | [→](./puppeteer/README.md) |
| **[⏰ Scheduler](./scheduler/)** | Cron-based job scheduling | Maintenance, batch processing | [→](./scheduler/) |
| **[🤖 State Machine](./state-machine/)** | Finite state machine workflows | Business processes, automation | [→](./state-machine/) |
| **[📧 SMTP](./smtp.md)** | Enterprise email delivery with 4 providers & webhooks | Transactional email, notifications, email server mode | [→](./smtp.md) |
| **[🏗️ Tfstate](./tfstate.md)** | Track Terraform infrastructure changes | DevOps, infrastructure monitoring | [→](./tfstate.md) |
| **[🏆 Tournament](./tournament.md)** | Esports & sports tournament engine | Brackets, match reporting, leagues | [→](./tournament.md) |
| **[🌳 Tree](./trees.md)** | Hierarchical data with Nested Set & Adjacency List | Categories, org charts, file systems | [→](./trees.md) |
| **[⏳ TTL](./ttl/)** | Automatic record expiration | Sessions, cache invalidation | [→](./ttl/) |
| **[🎯 Vector](./vector/)** | Vector similarity search (cosine, euclidean) | RAG, semantic search, ML | [→](./vector/) |

**💡 Can't find what you need?** [Build your own plugin](#-plugin-development) in ~50 lines of code!

---

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [🏗️ Plugin Architecture](#️-plugin-architecture)
  - [🔖 Namespaces & Multi-instance Support](#-namespaces--multi-instance-support)
- [⏰ Plugin Timing](#-plugin-timing-before-vs-after-resource-creation)
- [💡 Plugin Combinations](#-plugin-combinations)
- [🔧 Build Your Own Plugin](#-build-your-own-plugin)
- [🎯 Best Practices](#-best-practices)
- [🔍 Troubleshooting](#-troubleshooting)
- [📚 Additional Resources](#-additional-resources)

---

## 🚀 Quick Start

```javascript
import { S3db, CachePlugin, AuditPlugin, MetricsPlugin } from 's3db.js';

const db = new S3db({
  connectionString: "s3://KEY:SECRET@BUCKET/path",
  plugins: [
    // Performance
    new CachePlugin({ driver: 'memory', config: { maxSize: 1000 } }),

    // Monitoring
    new AuditPlugin({ trackOperations: ['inserted', 'updated', 'deleted'] }),
    new MetricsPlugin({ trackLatency: true }),

    // Cost tracking (no config needed)
    CostsPlugin
  ]
});

await db.connect();

// Plugins automatically enhance all resources
const users = await db.createResource({
  name: 'users',
  attributes: { email: 'string|required' }
});

// Cache, audit, metrics all work automatically!
await users.insert({ email: 'user@example.com' });
```

**What just happened?**
- ✅ Every read is cached automatically
- ✅ Every operation is logged for audit
- ✅ Performance metrics are tracked
- ✅ AWS costs are calculated in real-time

---

## 🏗️ Plugin Architecture

### Standard Plugin Options

Every plugin constructor MUST accept the shared options contract handled by
`normalizePluginOptions`:

- `logLevel` – defaults to `false` and gates any console/log output.
- `resources`, `database`, `client` – references injected by the runtime; use
  them via `this.resources`, `this.database`, `this.client` after calling
  `super(options)`.

In new plugins, call `super(options)` and rely on `this.options`/`this.logger.level`
instead of reading `options.logLevel` directly. Existing plugins follow this
pattern, so use them as reference implementations.

### Plugin Lifecycle

All plugins extend the base `Plugin` class and follow a consistent lifecycle:

```javascript
import { Plugin } from 's3db.js';

class MyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'MyPlugin';
    this.slug = 'my-plugin'; // Used for PluginStorage namespace
    // Plugin initialization
  }

  async onInstall() {
    // Called when plugin is attached to database
    // Access database via this.database
    // Setup resources, storage, and configuration
    const storage = this.getStorage();
    await storage.put(
      storage.getPluginKey(null, 'config'),
      { enabled: true, version: '1.0.0' }
    );
  }

  async onStart() {
    // Called after install is complete
    // Start timers, workers, and background tasks
    this.timer = setInterval(() => this.processQueue(), 5000);
  }

  async onStop() {
    // Cleanup when plugin is stopped
    // Stop timers, close connections, flush buffers
    if (this.timer) clearInterval(this.timer);
    await this.flushPendingData();
  }

  async onUninstall(options = {}) {
    // Called when plugin is being removed
    // Cleanup plugin-specific resources
    // Note: PluginStorage is automatically cleaned if purgeData=true
    await this.removeHooksFromResources();
    await this.cleanupInternalState();
  }
}
```

**Lifecycle Stages:**


1. **Construction**: Plugin instance created with configuration
2. **Registration**: Plugin added to database via `usePlugin()` or constructor
3. **Install**: `onInstall()` called when database is connected
   - Setup resources, hooks, and initial configuration
   - Initialize PluginStorage
   - Prepare deferred setups for missing resources
4. **Start**: `onStart()` called after install completes
   - Start background tasks, timers, workers
   - Begin active operation
5. **Operation**: Plugin actively processing database operations
   - Intercept methods, respond to hooks, process events
6. **Stop**: `onStop()` called for cleanup
   - Stop timers and background tasks
   - Flush pending data
   - Close connections
7. **Uninstall**: `onUninstall()` called when plugin is removed
   - Remove hooks and method wrappers
   - Cleanup internal state
   - Optionally purge all data from S3 (`purgeData: true`)

### 🔖 Namespaces & Multi-instance Support

**All plugins support running multiple instances simultaneously** with isolated data through namespace support. This is handled automatically by the base `Plugin` class.

#### Automatic Namespace Detection

When you create a plugin with a namespace, the system automatically:

1. ✅ **Scans storage** to find existing namespaces
2. ✅ **Emits console warnings** listing detected namespaces
3. ✅ **Warns which namespace** the current instance will use
4. ✅ **Isolates all data** (storage paths, database resources, events)

```javascript
// First instance
const uptimePlugin = new ReconPlugin({ namespace: 'uptime' });
await db.usePlugin(uptimePlugin);
// Console: [ReconPlugin] Using namespace: "uptime"

// Second instance (detects first)
const stealthPlugin = new ReconPlugin({ namespace: 'stealth' });
await db.usePlugin(stealthPlugin);
// Console: [ReconPlugin] Detected 1 existing namespace(s): uptime
// Console: [ReconPlugin] Using namespace: "stealth"

// Third instance (detects both)
const aggressivePlugin = new ReconPlugin({ namespace: 'aggressive' });
await db.usePlugin(aggressivePlugin);
// Console: [ReconPlugin] Detected 2 existing namespace(s): stealth, uptime
// Console: [ReconPlugin] Using namespace: "aggressive"
```

#### Storage Isolation

Each namespace has completely isolated storage:

```
# Uptime namespace
plugin=recon/uptime/reports/...
plugin=cache/uptime/entries/...

# Stealth namespace
plugin=recon/stealth/reports/...
plugin=cache/stealth/entries/...
```

#### Resource Isolation

Database resources are namespaced automatically.

**Pattern**: `plg_<namespace>_<plugin>_<resource>` (namespace comes FIRST!)

```
# No namespace - clean global context
plg_recon_hosts
plg_cache_entries
plg_scheduler_jobs

# With namespace - namespace first for grouping
plg_uptime_recon_hosts        ✨
plg_uptime_recon_reports      ✨
plg_prod_cache_entries        ✨
plg_prod_scheduler_jobs       ✨
plg_staging_cache_entries     ✨
```

**Why namespace first?** Resources are alphabetically grouped by namespace, making it easy to see all resources belonging to a specific namespace (e.g., all `plg_prod_*` resources).

#### Common Use Cases

**1. Multi-Environment Monitoring**
```javascript
const prodCache = new CachePlugin({
  namespace: 'production',
  driver: 'memory',
  ttl: 3600000
});

const stagingCache = new CachePlugin({
  namespace: 'staging',
  driver: 's3',
  ttl: 1800000
});

await db.usePlugin(prodCache);
await db.usePlugin(stagingCache);
```

**2. Multi-Tenant SaaS**
```javascript
const clientAcmeMetrics = new MetricsPlugin({ namespace: 'client-acme' });
const clientGlobexMetrics = new MetricsPlugin({ namespace: 'client-globex' });

await db.usePlugin(clientAcmeMetrics);
await db.usePlugin(clientGlobexMetrics);
```

**3. Different Behaviors**
```javascript
const uptimeRecon = new ReconPlugin({
  namespace: 'uptime',
  behavior: 'passive',
  behaviors: { uptime: { enabled: true } }
});

const auditRecon = new ReconPlugin({
  namespace: 'audit',
  behavior: 'aggressive'
});

await db.usePlugin(uptimeRecon);
await db.usePlugin(auditRecon);
```

#### Namespace Validation

Namespaces must follow these rules:
- ✅ Alphanumeric characters, hyphens (`-`), underscores (`_`)
- ✅ 1-50 characters
- ❌ No spaces or special characters

**Valid**: `production`, `client-acme`, `env_staging_2`
**Invalid**: `"prod env"`, `"client@acme"`, `""`

> 📚 **Complete Namespace API Documentation**: See detailed API reference and implementation guide below.

---

## 📘 Plugin Namespace API Reference

> **Standardized namespace detection and logging for all S3DB plugins**

### Overview

The `plugin-namespace` concern provides utilities for consistent namespace support across all plugins. Every plugin that implements namespaces **must** use these functions to ensure uniform behavior.

### Requirements

All plugins with namespace support **MUST**:

1. ✅ **List existing namespaces** on initialization
2. ✅ **Emit console.warn** showing detected namespaces
3. ✅ **Emit console.warn** showing which namespace is being used
4. ✅ **Validate namespace** format (alphanumeric, hyphens, underscores only)
5. ✅ **Use standardized resource naming** (default namespace has no suffix)

### API Functions

#### `listPluginNamespaces(storage, pluginPrefix)`

Lists all existing namespaces for a plugin by scanning storage.

**Parameters**:
- `storage` (Object): Plugin storage instance
- `pluginPrefix` (string): Plugin prefix (e.g., 'recon', 'scheduler', 'cache')

**Returns**: `Promise<string[]>` - Array of namespace strings, sorted alphabetically

**Example**:
```javascript
import { listPluginNamespaces } from 's3db.js/concerns/plugin-namespace';

const storage = plugin.getStorage();
const namespaces = await listPluginNamespaces(storage, 'recon');
// ['aggressive', 'default', 'stealth', 'uptime']
```

#### `warnNamespaceUsage(pluginName, currentNamespace, existingNamespaces)`

Emits console warnings about namespace detection and usage.

**Parameters**:
- `pluginName` (string): Plugin name for logging (e.g., 'ReconPlugin', 'SchedulerPlugin')
- `currentNamespace` (string): The namespace being used by this instance
- `existingNamespaces` (string[]): Array of detected namespaces

**Example**:
```javascript
import { warnNamespaceUsage } from 's3db.js/concerns/plugin-namespace';

warnNamespaceUsage('ReconPlugin', 'uptime', ['default', 'stealth']);
// Console output:
// [ReconPlugin] Detected 2 existing namespace(s): default, stealth
// [ReconPlugin] Using namespace: "uptime"
```

#### `detectAndWarnNamespaces(storage, pluginName, pluginPrefix, currentNamespace)`

Complete namespace detection and warning flow (combines listing + warning).

**Parameters**:
- `storage` (Object): Plugin storage instance
- `pluginName` (string): Plugin name for logging
- `pluginPrefix` (string): Plugin prefix for storage scanning
- `currentNamespace` (string): The namespace being used

**Returns**: `Promise<string[]>` - Array of detected namespaces

**Example**:
```javascript
import { detectAndWarnNamespaces } from 's3db.js/concerns/plugin-namespace';

const namespaces = await detectAndWarnNamespaces(
  plugin.getStorage(),
  'ReconPlugin',
  'recon',
  'uptime'
);
// Console output:
// [ReconPlugin] Detected 2 existing namespace(s): default, stealth
// [ReconPlugin] Using namespace: "uptime"
// Returns: ['default', 'stealth']
```

#### `getNamespacedResourceName(baseResourceName, namespace, pluginPrefix)`

Generates consistent resource names across all plugins.

**Parameters**:
- `baseResourceName` (string): Base resource name (e.g., 'plg_recon_hosts')
- `namespace` (string): Namespace to apply
- `pluginPrefix` (string): Plugin prefix (e.g., 'plg_recon')

**Returns**: `string` - Namespaced resource name

**Example**:
```javascript
import { getNamespacedResourceName } from 's3db.js/concerns/plugin-namespace';

// Default namespace (no suffix)
getNamespacedResourceName('plg_recon_hosts', 'default', 'plg_recon');
// 'plg_recon_hosts'

// Custom namespace (adds suffix)
getNamespacedResourceName('plg_recon_hosts', 'uptime', 'plg_recon');
// 'plg_recon_uptime_hosts'

getNamespacedResourceName('plg_scheduler_jobs', 'prod', 'plg_scheduler');
// 'plg_scheduler_prod_jobs'
```

#### `validateNamespace(namespace)`

Validates namespace format.

**Parameters**:
- `namespace` (string): Namespace to validate

**Throws**: `Error` if namespace is invalid

**Rules**:
- ✅ Alphanumeric characters
- ✅ Hyphens (`-`)
- ✅ Underscores (`_`)
- ✅ 1-50 characters
- ❌ Spaces
- ❌ Special characters
- ❌ Empty strings

**Example**:
```javascript
import { validateNamespace } from 's3db.js/concerns/plugin-namespace';

validateNamespace('uptime');        // OK
validateNamespace('client-acme');   // OK
validateNamespace('prod_env_2');    // OK
validateNamespace('');              // Throws: Namespace must be a non-empty string
validateNamespace('invalid space'); // Throws: Namespace can only contain...
validateNamespace('a'.repeat(51));  // Throws: Namespace must be 50 characters or less
```

#### `getValidatedNamespace(config, defaultNamespace)`

Extracts and validates namespace from plugin config.

**Parameters**:
- `config` (Object): Plugin configuration
- `defaultNamespace` (string): Default namespace if not specified (default: 'default')

**Returns**: `string` - Validated namespace

**Throws**: `Error` if namespace is invalid

**Example**:
```javascript
import { getValidatedNamespace } from 's3db.js/concerns/plugin-namespace';

getValidatedNamespace({ namespace: 'uptime' });
// 'uptime'

getValidatedNamespace({});
// 'default'

getValidatedNamespace({ namespace: 'invalid space' });
// Throws Error
```

### Plugin Implementation Guide

#### Step 1: Import Namespace Utilities

```javascript
import {
  getValidatedNamespace,
  detectAndWarnNamespaces,
  getNamespacedResourceName
} from 's3db.js/concerns/plugin-namespace';
```

#### Step 2: Validate Namespace in Constructor

```javascript
class MyPlugin extends Plugin {
  static pluginName = 'myplugin';

  constructor(config = {}) {
    super(config);

    // Validate and set namespace (REQUIRED)
    this.namespace = getValidatedNamespace(config, 'default');

    // ... rest of constructor
  }
}
```

#### Step 3: Detect and Warn on Initialize

```javascript
async initialize() {
  // Detect existing namespaces and emit warnings (REQUIRED)
  await detectAndWarnNamespaces(
    this.getStorage(),
    'MyPlugin',          // Plugin name for console output
    'myplugin',          // Plugin prefix for storage scanning
    this.namespace       // Current namespace
  );

  // ... rest of initialization
}
```

#### Step 4: Use Namespaced Resource Names

```javascript
async createResources() {
  const namespace = this.namespace;

  // Use standardized resource naming
  const hostsResourceName = getNamespacedResourceName(
    'plg_myplugin_hosts',
    namespace,
    'plg_myplugin'
  );

  const resource = await this.database.createResource({
    name: hostsResourceName,
    // ... rest of config
  });
}
```

### Complete Example

```javascript
import { Plugin } from 's3db.js/plugins/plugin.class';
import {
  getValidatedNamespace,
  detectAndWarnNamespaces,
  getNamespacedResourceName
} from 's3db.js/concerns/plugin-namespace';

export class MyPlugin extends Plugin {
  static pluginName = 'myplugin';

  constructor(config = {}) {
    super(config);

    // Step 1: Validate and set namespace
    this.namespace = getValidatedNamespace(config, 'default');

    this.config = {
      ...config,
      storage: { enabled: true },
      resources: { persist: true }
    };
  }

  async initialize() {
    await super.initialize();

    // Step 2: Detect and warn about namespaces
    await detectAndWarnNamespaces(
      this.getStorage(),
      'MyPlugin',
      'myplugin',
      this.namespace
    );

    // Step 3: Create namespaced resources
    await this.createResources();
  }

  async createResources() {
    if (!this.database) return;

    const namespace = this.namespace;

    // Step 4: Use standardized resource naming
    const resourceConfigs = [
      { name: 'plg_myplugin_hosts', attributes: { /* ... */ } },
      { name: 'plg_myplugin_reports', attributes: { /* ... */ } }
    ];

    for (const config of resourceConfigs) {
      const namespacedName = getNamespacedResourceName(
        config.name,
        namespace,
        'plg_myplugin'
      );

      await this.database.createResource({
        ...config,
        name: namespacedName
      });
    }
  }

  // Storage paths should also use namespace
  async saveReport(report) {
    const storage = this.getStorage();
    const namespace = this.namespace;

    // Use namespace in storage path
    const key = storage.getPluginKey(null, namespace, 'reports', report.id);
    await storage.set(key, report);
  }
}

// Usage
const plugin1 = new MyPlugin({ namespace: 'uptime' });
const plugin2 = new MyPlugin({ namespace: 'monitoring' });

await db.usePlugin(plugin1);
// Console: [MyPlugin] Using namespace: "uptime"

await db.usePlugin(plugin2);
// Console: [MyPlugin] Detected 1 existing namespace(s): uptime
// Console: [MyPlugin] Using namespace: "monitoring"
```

### Checklist for Plugin Authors

When adding namespace support to a plugin, ensure:

- [ ] Import namespace utilities from `s3db.js/concerns/plugin-namespace`
- [ ] Use `getValidatedNamespace()` in constructor
- [ ] Call `detectAndWarnNamespaces()` in `initialize()`
- [ ] Use `getNamespacedResourceName()` for all resources
- [ ] Use namespace in all storage paths (`storage.getPluginKey(null, namespace, ...)`)
- [ ] Document namespace support in plugin README
- [ ] Create examples showing multiple instances
- [ ] Add tests for namespace isolation

### Testing Namespace Support

```javascript
import { describe, test, expect } from '@jest/globals';

describe('MyPlugin Namespace Support', () => {
  test('should validate namespace on construction', () => {
    expect(() => new MyPlugin({ namespace: 'invalid space' })).toThrow();
    expect(() => new MyPlugin({ namespace: 'valid-name' })).not.toThrow();
  });

  test('should create namespaced resources', async () => {
    const plugin = new MyPlugin({ namespace: 'test' });
    await db.usePlugin(plugin);

    const resource = await db.getResource('plg_myplugin_test_hosts');
    expect(resource).toBeDefined();
  });

  test('should isolate storage by namespace', async () => {
    const plugin1 = new MyPlugin({ namespace: 'ns1' });
    const plugin2 = new MyPlugin({ namespace: 'ns2' });

    await db.usePlugin(plugin1);
    await db.usePlugin(plugin2);

    await plugin1.saveReport({ id: 'report1' });
    await plugin2.saveReport({ id: 'report2' });

    const storage = plugin1.getStorage();
    const ns1Keys = await storage.list(storage.getPluginKey(null, 'ns1'));
    const ns2Keys = await storage.list(storage.getPluginKey(null, 'ns2'));

    expect(ns1Keys.length).toBe(1);
    expect(ns2Keys.length).toBe(1);
  });

  test('should list existing namespaces', async () => {
    const plugin1 = new MyPlugin({ namespace: 'ns1' });
    const plugin2 = new MyPlugin({ namespace: 'ns2' });

    await db.usePlugin(plugin1);
    await plugin1.saveReport({ id: 'report1' });

    await db.usePlugin(plugin2);
    await plugin2.saveReport({ id: 'report2' });

    const { listPluginNamespaces } = await import('s3db.js/concerns/plugin-namespace');
    const namespaces = await listPluginNamespaces(plugin1.getStorage(), 'myplugin');

    expect(namespaces).toContain('ns1');
    expect(namespaces).toContain('ns2');
  });
});
```

### Related Documentation

- [ReconPlugin Namespace Implementation](./recon/namespace.md)
- [Multi-Instance Example](../examples/e45-recon-multi-instance.js)
- [Namespace Detection Example](../examples/e46-recon-namespace-detection.js)
- [Custom Plugin Example](../examples/e47-namespace-concern-usage.js)

---

### Dependency Awareness

Some plugins install or expect other plugins. s3db.js now treats these relationships explicitly:

- **Dependency graphs**: Every plugin doc now includes a quick Mermaid dependency graph (right after the configuration table) that calls out hard (`→`) and optional (`-- optional -->`) relationships.
- **Bundle plugins** such as `SpiderSuitePlugin` and `CookieFarmSuitePlugin` call `database.usePlugin()` internally, passing down your original options so shared settings (e.g. `namespace`, `ttl`, `puppeteer`) flow through to their child plugins.
- **Shared configuration**: Pass nested config blocks that mirror the dependency name (e.g. `puppeteer: { pool: { enabled: false } }`) and the bundle forwards them. Aliases/namespaces are derived from the outer plugin, so everything stays scoped like `plg_<namespace>_*`.
- **Manual combos**: When you compose plugins yourself, prefer a common namespace and, if needed, pass references between them (e.g. expose the installed cache via `db.plugins.cacheHot`). The helper `requirePluginDependency()` throws an actionable error (with install command/version) when a runtime dependency is missing.
- **Resource naming overrides**: For multi-instance setups, most plugins accept `resourceNames` overrides so you can keep storage/resources distinct even when dependencies are shared.

> ✅ Tip: Set `S3DB_SKIP_PLUGIN_DEP_CHECK=1` in tests if you mock dependencies—the runtime safety nets stay in production while your test suite avoids installing heavy packages.

### Plugin Cleanup and Uninstall

Proper cleanup is essential for preventing data leaks and resource exhaustion. The s3db.js plugin system provides robust cleanup mechanisms at multiple levels.

#### Manual Uninstall

Remove a plugin and optionally purge all its data:

```javascript
const plugin = new MyPlugin({ /* config */ });
await database.usePlugin(plugin);

// Later, uninstall the plugin
await plugin.uninstall({ purgeData: true });
// ✅ Plugin removed
// ✅ All PluginStorage data deleted from S3
// ✅ Hooks and method wrappers removed
// ✅ Background tasks stopped
```

#### Automatic Data Purge

When `purgeData: true` is passed to `uninstall()`, the Plugin base class automatically:

1. Calls `onUninstall(options)` for custom cleanup
2. Deletes **all** plugin data from PluginStorage
3. Emits `plugin.dataPurged` event with deletion count

```javascript
async uninstall(options = {}) {
  const { purgeData = false } = options;

  this.beforeUninstall();
  await this.onUninstall(options);

  // Automatic purge if requested
  if (purgeData && this._storage) {
    const deleted = await this._storage.deleteAll();
    this.emit('plugin.dataPurged', { deleted });
  }

  this.afterUninstall();
}
```

#### Implementing Custom Cleanup

Override `onUninstall()` for plugin-specific cleanup:

```javascript
class MyPlugin extends Plugin {
  async onUninstall(options = {}) {
    // Stop all timers
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = null;
    }

    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    // Flush pending operations
    if (this.pendingQueue.length > 0) {
      await this.flushQueue();
    }

    // Remove hooks from all resources
    for (const [resourceName, hooks] of this.installedHooks) {
      const resource = this.database.resources[resourceName];
      if (resource) {
        hooks.forEach(hook => resource.removeHook(hook.event, hook.handler));
      }
    }

    // Close external connections
    if (this.externalClient) {
      await this.externalClient.close();
      this.externalClient = null;
    }

    // Clear caches
    this.cache?.clear();

    // Remove event listeners
    this.removeAllListeners();
  }
}
```

---

### 🏷️ Plugin Attributes: Isolation System

**IMPORTANT**: When your plugin needs to add custom attributes to user resources, use the **Plugin Attribute API** to prevent data corruption and maintain compatibility.

#### Why Plugin Attribute Isolation?

s3db.js uses field name mapping for optimization (converts field names to compact IDs like `0`, `1`, `2`...). Without isolation:

```javascript
// ❌ BAD: Direct attribute addition (old way)
resource.schema.attributes['_hasEmbedding'] = { type: 'boolean', optional: true };

// Problem: If user has fields [name, email], they become:
// { name: '0', email: '1' }

// After plugin adds _hasEmbedding, ALL field IDs shift:
// { _hasEmbedding: '0', name: '1', email: '2' }  ← BREAKS HISTORICAL DATA!
```

**The Solution**: Plugin attributes use a **reserved namespace** (`p0`, `p1`, `p2`...) that's completely separate from user attributes:

```javascript
// ✅ GOOD: Use Plugin Attribute API (new way)
resource.addPluginAttribute('_hasEmbedding', {
  type: 'boolean',
  optional: true
}, 'VectorPlugin');

// User fields stay stable:     { name: '0', email: '1' }
// Plugin fields isolated:       { _hasEmbedding: 'p0' }
// ✅ No conflicts, no data loss!
```

#### When to Use Plugin Attributes

Use `addPluginAttribute()` when:
- ✅ Your plugin needs to track state per record (e.g., `_hasEmbedding`, `_indexed`)
- ✅ You're adding boolean flags, timestamps, or metadata to user records
- ✅ The attribute is optional and specific to your plugin's functionality

**Do NOT use plugin attributes for:**
- ❌ Plugin configuration (use PluginStorage instead)
- ❌ Internal plugin state (use PluginStorage or class properties)
- ❌ Cross-record data (create a separate resource with `createdBy: 'YourPlugin'`)

#### Adding Plugin Attributes

**During `onInstall()`** (recommended - before any records exist):

```javascript
class MyVectorPlugin extends Plugin {
  async onInstall() {
    // Loop through all resources that need vector support
    for (const [resourceName, vectorFields] of this.config.resources) {
      const resource = this.database.resources[resourceName];

      if (!resource) continue; // Resource will be handled later via hooks

      // Add tracking field for each vector field
      for (const field of vectorFields) {
        const trackingField = `_has${this.capitalize(field.name)}`;

        // ✅ Use addPluginAttribute() API
        resource.addPluginAttribute(trackingField, {
          type: 'boolean',
          optional: true,
          default: false
        }, 'MyVectorPlugin');  // Always pass your plugin name!
      }
    }
  }
}
```

**API Signature**:
```typescript
resource.addPluginAttribute(
  name: string,              // Attribute name (e.g., '_hasEmbedding')
  definition: string|object, // Schema definition ('boolean|optional' or { type: 'boolean', optional: true })
  pluginName: string         // Your plugin name (REQUIRED for isolation)
)
```

#### Removing Plugin Attributes

When your plugin is uninstalled:

```javascript
async onUninstall(options = {}) {
  // Remove plugin attributes from all resources
  for (const [resourceName, resource] of Object.entries(this.database.resources)) {
    // Check if resource has your plugin attributes
    if (resource.schema.attributes['_hasEmbedding']) {
      resource.removePluginAttribute('_hasEmbedding', 'MyVectorPlugin');
    }
  }
}
```

#### Best Practices: Naming Conventions

**Use prefixes to organize plugin attributes** and avoid conflicts:

| Plugin Type | Prefix | Example Fields | Notes |
|-------------|--------|----------------|-------|
| **Tracking/State** | `_<plugin>_` | `_vector_indexed`, `_ttl_expiresAt` | Plugin-specific tracking |
| **Boolean Flags** | `_has` / `_is` | `_hasEmbedding`, `_isProcessed` | Clear boolean indicators |
| **Timestamps** | `_<plugin>At` | `_indexedAt`, `_consolidatedAt` | When plugin action occurred |
| **Counters** | `_<plugin>Count` | `_vectorSearchCount`, `_cacheHits` | Plugin metrics |
| **IDs/References** | `_<plugin>Id` | `_clusterId`, `_cacheKey` | Plugin-managed identifiers |

**Examples from Official Plugins**:

```javascript
// VectorPlugin
resource.addPluginAttribute('_hasEmbedding', { type: 'boolean', optional: true }, 'VectorPlugin');
resource.addPluginAttribute('_vector_clusterId', 'string|optional', 'VectorPlugin');
resource.addPluginAttribute('_vector_clusterVersion', 'string|optional', 'VectorPlugin');

// TTLPlugin
resource.addPluginAttribute('_ttl_expiresAt', { type: 'number', optional: true }, 'TTLPlugin');
resource.addPluginAttribute('_ttl_cohort', 'string|optional', 'TTLPlugin');

// AuditPlugin (doesn't add attributes - uses separate resource instead)
// ✅ GOOD: Creates plg_audit resource with createdBy: 'AuditPlugin'
```

#### When NOT to Add Attributes

Some plugins don't need to add attributes at all:

**Use Separate Resources Instead** (with `createdBy: 'YourPlugin'`):
```javascript
// ✅ GOOD: Audit logs, metrics, and analytics
await database.createResource({
  name: 'plg_audit_logs',
  attributes: { /* ... */ },
  createdBy: 'AuditPlugin'  // Marks resource as plugin-owned
});

// ✅ GOOD: Plugin configuration
const storage = this.getStorage();
await storage.put('config', { enabled: true });
```

**Why separate resources are better for:**
- 📊 **Analytics/Metrics**: One-to-many relationships (many audit logs per record)
- ⚙️ **Configuration**: Plugin settings that aren't record-specific
- 🔐 **Sensitive Data**: Isolation from user data
- 🗄️ **Large Datasets**: Better performance than bloating user records

#### Error Handling

The Plugin Attribute API includes safety checks:

```javascript
// ❌ Error: Trying to override user attribute
resource.addPluginAttribute('email', 'string|optional', 'MyPlugin');
// Throws: "Attribute 'email' already exists and is not from plugin 'MyPlugin'"

// ❌ Error: Missing plugin name
resource.addPluginAttribute('_myField', 'string|optional');
// Throws: "Plugin name is required when adding plugin attributes"

// ❌ Error: Removing attribute from wrong plugin
resource.removePluginAttribute('_hasEmbedding', 'WrongPlugin');
// Throws: "Attribute '_hasEmbedding' belongs to plugin 'VectorPlugin', not 'WrongPlugin'"
```

#### Migration Guide

If you have existing plugins adding attributes directly:

```javascript
// ❌ OLD WAY (manual schema mutation)
if (!resource.schema.attributes['_myField']) {
  resource.schema.attributes['_myField'] = { type: 'boolean', optional: true };
}

// ✅ NEW WAY (Plugin Attribute API)
resource.addPluginAttribute('_myField', {
  type: 'boolean',
  optional: true
}, 'MyPlugin');
```

**Migration Steps:**
1. Replace direct `schema.attributes[x] = ...` with `addPluginAttribute()`
2. Add `pluginName` parameter (required)
3. Update `onUninstall()` to call `removePluginAttribute()`
4. Test with existing data to ensure compatibility

#### Complete Example

```javascript
import { Plugin } from 's3db.js';

class IndexingPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'IndexingPlugin';
  }

  async onInstall() {
    for (const resource of Object.values(this.database.resources)) {
      // Add tracking attributes
      resource.addPluginAttribute('_index_status', {
        type: 'string',
        optional: true,
        enum: ['pending', 'indexed', 'failed']
      }, 'IndexingPlugin');

      resource.addPluginAttribute('_index_indexedAt', {
        type: 'number',
        optional: true
      }, 'IndexingPlugin');

      resource.addPluginAttribute('_index_version', {
        type: 'string',
        optional: true
      }, 'IndexingPlugin');

      // Install hooks to auto-update status
      resource.addHook('afterInsert', async ({ item }) => {
        await resource.update(item.id, { _index_status: 'pending' });
      });
    }
  }

  async onUninstall() {
    for (const resource of Object.values(this.database.resources)) {
      // Clean up attributes
      resource.removePluginAttribute('_index_status', 'IndexingPlugin');
      resource.removePluginAttribute('_index_indexedAt', 'IndexingPlugin');
      resource.removePluginAttribute('_index_version', 'IndexingPlugin');
    }
  }
}
```

#### Automatic Filtering from Documentation

**Plugin attributes are automatically hidden** from user-facing documentation and type definitions to keep your API clean and focused on user-defined fields.

**🔧 Filtered From:**

| Tool | What Gets Filtered | Why |
|------|-------------------|-----|
| **OpenAPI Generator** | All plugin attributes (`_hasEmbedding`, `_ttl_expiresAt`, etc.) | API docs show only user fields |
| **TypeScript Generator** | All plugin attributes | Type definitions match API contracts |
| **API Plugin (Swagger UI)** | All plugin attributes | Clean, predictable REST API |

**How It Works:**

```javascript
// User creates resource
const users = await db.createResource({
  name: 'users',
  description: {
    resource: 'User management',
    attributes: {
      email: 'User email address',
      name: 'Full name'
    }
  },
  attributes: {
    email: 'string|required|email',
    name: 'string|required'
  }
});

// VectorPlugin adds internal tracking
users.addPluginAttribute('_hasEmbedding', 'boolean|optional', 'VectorPlugin');
users.addPluginAttribute('_vector_version', 'number|optional', 'VectorPlugin');

// 📄 Generated OpenAPI shows ONLY user fields:
// {
//   "properties": {
//     "email": { "type": "string", "format": "email" },
//     "name": { "type": "string" }
//   }
// }
// ✅ _hasEmbedding and _vector_version are automatically hidden

// 📝 Generated TypeScript shows ONLY user fields:
// interface Users {
//   email: string;
//   name: string;
// }
// ✅ Plugin attributes not exposed to developers
```

**Implementation Details:**

The filtering uses two mechanisms to track plugin attributes:

```javascript
// 1. Reverse mapping (_pluginAttributes)
resource.schema._pluginAttributes = {
  'VectorPlugin': ['_hasEmbedding', '_vector_version'],
  'TTLPlugin': ['_ttl_expiresAt', '_ttl_cohort']
}

// 2. Metadata for string-based definitions (_pluginAttributeMetadata)
resource.schema._pluginAttributeMetadata = {
  '_hasEmbedding': { __plugin__: 'VectorPlugin', __pluginCreated__: 1234567890 }
}
```

**⚠️ Important: `$schema` vs `schema`**

When generating documentation, always use `resource.schema` (live object) for attributes:

```javascript
// ✅ CORRECT: Use schema for attributes (includes runtime changes)
const attributes = resource.schema.attributes;
const pluginAttrs = resource.schema._pluginAttributes;
const metadata = resource.schema._pluginAttributeMetadata;

// ✅ CORRECT: Use $schema for static config (set at creation)
const description = resource.$schema.description;
const partitions = resource.$schema.partitions;
const timestamps = resource.$schema.timestamps;
```

**Why the difference?**

- `$schema` - Frozen snapshot at resource creation (doesn't include plugin attributes added later)
- `schema` - Live object that reflects runtime changes (includes plugin attributes)

This ensures OpenAPI/TypeScript generators can access and filter plugin attributes correctly.

---

**Why This Matters:**

- ✅ **Clean API Docs**: Users see only their fields, not internal plugin state
- ✅ **Type Safety**: TypeScript types match actual API responses
- ✅ **Backwards Compatible**: Plugin attributes work in records but don't pollute docs
- ✅ **Zero Config**: Automatic - just use `addPluginAttribute()` correctly

**Note**: Plugin attributes are still **accessible in code** and **stored in records**—they're only hidden from **generated documentation**.

---

### 📦 PluginStorage: Persistent State Management

Every plugin has access to **PluginStorage** - a namespaced key-value store in S3 specifically for plugin data.
    this.removeAllListeners();

    console.log(`${this.name} uninstalled successfully`);
  }
}
```

#### Cleanup Best Practices

**✅ DO:**

```javascript
async onUninstall(options) {
  // 1. Stop all timers/intervals
  clearInterval(this.timer);

  // 2. Flush pending data
  await this.flushPendingData();

  // 3. Close external connections
  await this.client?.close();

  // 4. Remove all hooks
  this.removeAllHooks();

  // 5. Clear caches
  this.cache.clear();

  // 6. Remove event listeners
  this.removeAllListeners();

  // 7. Let purgeData handle PluginStorage cleanup
  // (automatic if purgeData=true)
}
```

**❌ DON'T:**

```javascript
async onUninstall(options) {
  // ❌ Don't forget to stop timers
  // this.timer keeps running forever

  // ❌ Don't manually delete PluginStorage data
  await this.getStorage().deleteAll();
  // This is redundant - base class handles it automatically

  // ❌ Don't leak event listeners
  // this.removeAllListeners() is required

  // ❌ Don't leave pending operations
  // await this.flushPendingData() is required
}
```

#### Cleanup Examples by Plugin Type

##### Timer-Based Plugins (Scheduler, EventualConsistency)

```javascript
async onUninstall(options) {
  // Stop all scheduled jobs
  for (const [jobName, job] of this.jobs) {
    job.stop();
  }

  // Clear job registry
  this.jobs.clear();

  // Flush any pending execution
  await this.flushPendingJobs();
}
```

##### Queue-Based Plugins (S3Queue, QueueConsumer)

```javascript
async onUninstall(options) {
  // Stop consuming messages
  await this.stopConsuming();

  // Flush pending messages
  await this.flushQueue();

  // Close queue connection
  await this.queueClient.disconnect();
}
```

##### Connection-Based Plugins (Replicator, External APIs)

```javascript
async onUninstall(options) {
  // Close all replicator connections
  for (const replicator of this.replicators) {
    await replicator.close();
  }

  // Flush pending replications
  await this.flushPendingReplications();

  // Clear connection pool
  this.connectionPool.clear();
}
```

##### Cache Plugins

```javascript
async onUninstall(options) {
  // Flush cache if needed
  if (options.flushCache) {
    await this.writeBackCache();
  }

  // Clear all cache entries
  this.cache.clear();

  // Close cache backend connection
  await this.cacheBackend?.close();
}
```

#### Monitoring Cleanup Events

Listen to cleanup events for debugging:

```javascript
plugin.on('plugin.beforeUninstall', (date) => {
  console.log(`Uninstalling plugin at ${date}`);
});

plugin.on('plugin.dataPurged', ({ deleted }) => {
  console.log(`Purged ${deleted} objects from S3`);
});

plugin.on('plugin.afterUninstall', (date) => {
  console.log(`Plugin uninstalled at ${date}`);
});
```

#### Testing Cleanup

Always test plugin cleanup in your test suite:

```javascript
describe('MyPlugin cleanup', () => {
  it('should cleanup all resources on uninstall', async () => {
    const plugin = new MyPlugin();
    await database.usePlugin(plugin);

    // Create some data
    await plugin.doSomething();

    // Verify data exists
    const storage = plugin.getStorage();
    const keys = await storage.list();
    expect(keys.length).toBeGreaterThan(0);

    // Uninstall with purge
    await plugin.uninstall({ purgeData: true });

    // Verify all data is gone
    const keysAfter = await storage.list();
    expect(keysAfter.length).toBe(0);

    // Verify timers are stopped
    expect(plugin.timer).toBeNull();
  });

  it('should keep data when purgeData=false', async () => {
    const plugin = new MyPlugin();
    await database.usePlugin(plugin);

    await plugin.doSomething();

    // Uninstall WITHOUT purge
    await plugin.uninstall({ purgeData: false });

    // Verify data still exists
    const storage = new PluginStorage(database.client, 'my-plugin');
    const keys = await storage.list();
    expect(keys.length).toBeGreaterThan(0);
  });
});
```

### Driver-Based Architecture

Most s3db.js plugins follow a **driver pattern** where you specify:
- **`driver`**: The storage/connection type (`filesystem`, `s3`, `multi`, etc.)
- **`config`**: Driver-specific configuration options
- **Plugin options**: Global settings that apply across drivers

```javascript
// Single driver example
new SomePlugin({
  driver: 'driverType',
  config: {
    // Driver-specific options
    option1: 'value1',
    option2: 'value2'
  },
  // Global plugin options
  logLevel: 'debug',
  timeout: 30000
});

// Multi-driver example  
new SomePlugin({
  driver: 'multi',
  config: {
    strategy: 'all',
    destinations: [
      { driver: 'driver1', config: {...} },
      { driver: 'driver2', config: {...} }
    ]
  }
});
```

### Plugin Types

- **Instance Plugins**: Require `new` - `new CachePlugin(config)`
- **Static Plugins**: Used directly - `CostsPlugin`
- **Configurable**: Accept options for customization
- **Event-Driven**: Emit events for monitoring and integration
- **Deferred Setup**: Can be added before target resources exist (e.g., EventualConsistencyPlugin)

---

## 📦 Plugin Dependencies

### Lightweight Core Approach

s3db.js uses a **lightweight core** approach - plugin-specific dependencies are **not bundled** with the main package. This keeps plugin dependencies optional (as peerDependencies) and lets you install only what you need.

### How It Works

1. **Automatic Validation** - When you use a plugin, s3db.js validates its dependencies at runtime
2. **Clear Error Messages** - If a dependency is missing, you get a helpful error with install commands
3. **Version Checking** - Ensures installed packages meet minimum version requirements
4. **Optional Dependencies** - Most plugin dependencies are marked as optional peers (install only what you need)

### Dependency Matrix

| Plugin | Required Package | Version | Install Command |
|--------|-----------------|---------|-----------------|
| PostgreSQL Replicator | `pg` | `^8.0.0` | `pnpm add pg` |
| BigQuery Replicator | `@google-cloud/bigquery` | `^7.0.0` | `pnpm add @google-cloud/bigquery` |
| SQS Replicator | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| SQS Consumer | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| RabbitMQ Consumer | `amqplib` | `^0.10.0` | `pnpm add amqplib` |
| Tfstate Plugin | `node-cron` | `^4.0.0` | _(bundled with s3db.js)_ |

### Installation Example

```bash
# Install only what you need
pnpm add pg                      # For PostgreSQL replication
pnpm add @google-cloud/bigquery  # For BigQuery replication
pnpm add @aws-sdk/client-sqs     # For SQS
pnpm add amqplib                 # For RabbitMQ
```

### Error Messages

If you forget to install a dependency, you'll get a clear error:

```bash
Error: PostgreSQL Replicator - Missing dependencies detected!

❌ Missing dependency: pg
   Description: PostgreSQL client for Node.js
   Required: ^8.0.0
   Install: pnpm add pg

Quick fix - Run all install commands:
  pnpm add pg
```

### Checking Dependencies Programmatically

```javascript
import { getPluginDependencyReport } from 's3db.js/plugins/concerns/plugin-dependencies';

// Get a full report of all plugin dependencies
const report = await getPluginDependencyReport();
console.log(report);
```

**See also:** [Plugin Dependency Validation Example](../examples/e46-plugin-dependency-validation.js)

---

## 📦 Getting Started

### Basic Plugin Usage

```javascript
import { S3db, CachePlugin, BackupPlugin, CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});

await s3db.connect();

// Driver-based plugins (most common)
await s3db.usePlugin(new CachePlugin({
  driver: 'memory',
  config: { maxSize: 1000 }
}));

await s3db.usePlugin(new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups/{date}/' }
}));

// Static utility plugins
await s3db.usePlugin(CostsPlugin);
```

### Adding Plugins to Your Database

#### Method 1: Using usePlugin() (Recommended)

```javascript
const database = new S3db({ connectionString: '...' });
await database.connect();

// Add plugin after connection
const cachePlugin = new CachePlugin({
  driver: 'memory',
  config: { maxSize: 1000 }
});

await database.usePlugin(cachePlugin);
```

#### Method 2: Constructor Configuration

```javascript
const cachePlugin = new CachePlugin({ driver: 'memory' });
const auditPlugin = new AuditPlugin({ driver: 'memory' });

const database = new S3db({
  connectionString: '...',
  plugins: [cachePlugin, auditPlugin]
});

await database.connect(); // Plugins are initialized during connection
```

#### Method 3: Plugin Factory Functions

Some plugins provide static factory methods:

```javascript
await database.usePlugin(CostsPlugin); // Static plugin
```


## ⏰ Plugin Timing: Before vs After Resource Creation

One of the key features of the s3db.js plugin system is that plugins can be added at any time - before or after resources are created.

### Adding Plugins BEFORE Resource Creation

Plugins can be added before their target resources exist. They will automatically set up once the resource is created:

```javascript
const database = new S3db({ connectionString: '...' });
await database.connect();

// Add plugin for a resource that doesn't exist yet
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',  // This resource doesn't exist yet
  field: 'balance',
  mode: 'sync'
});

await database.usePlugin(plugin); // Plugin defers setup

// Later, create the resource
const wallets = await database.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});

// Plugin automatically completes setup and adds methods
console.log(typeof wallets.add); // 'function'
```

### Adding Plugins AFTER Resource Creation

Plugins can also be added after resources already exist:

```javascript
// Create resource first
const products = await database.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    stock: 'number|default:0'
  }
});

// Add plugin later
const plugin = new EventualConsistencyPlugin({
  resource: 'products',
  field: 'stock',
  mode: 'async'
});

await database.usePlugin(plugin);

// Methods are immediately available
await products.add('product-1', 10);
```

### How Deferred Setup Works

When a plugin requires a resource that doesn't exist:

1. **Detection**: Plugin checks for resource in `onSetup()`
2. **Deferral**: Sets up a watcher using database hooks
3. **Monitoring**: Listens for `afterCreateResource` events
4. **Completion**: When target resource is created, completes setup automatically

Example implementation pattern:

```javascript
class MyResourcePlugin extends Plugin {
  async onSetup() {
    this.targetResource = this.database.resources[this.config.resource];
    
    if (!this.targetResource) {
      // Resource doesn't exist - defer setup
      this.deferredSetup = true;
      this.watchForResource();
      return;
    }
    
    // Resource exists - complete setup now
    await this.completeSetup();
  }

  watchForResource() {
    this.database.addHook('afterCreateResource', async ({ resource, config }) => {
      if (config.name === this.config.resource && this.deferredSetup) {
        this.targetResource = resource;
        this.deferredSetup = false;
        await this.completeSetup();
      }
    });
  }

  async completeSetup() {
    // Perform actual setup work
    this.addMethodsToResource();
    this.installHooks();
  }
}
```

---

## 🔧 Build Your Own Plugin

Building a plugin is easier than you think! Here's a complete plugin in ~50 lines:

### Creating a Custom Plugin

```javascript
import { Plugin, ValidationError } from 's3db.js';

class MyCustomPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'MyCustomPlugin';
    this.version = '1.0.0';
    
    // Validate configuration
    if (!options.resource) {
      throw new ValidationError('MyCustomPlugin requires a target resource', {
        statusCode: 400,
        retriable: false,
        suggestion: 'Pass { resource: "my-resource" } when instantiating the plugin.'
      });
    }
    
    this.config = {
      ...this.getDefaultConfig(),
      ...options
    };
  }

  getDefaultConfig() {
    return {
      enabled: true,
      logLevel: 'silent'
    };
  }

  async onSetup() {
    // Called when plugin is attached to database
    // Access database via this.database
    await this.initialize();
  }

  async onStart() {
    // Called after setup is complete
    this.emit('plugin.started', { name: this.name });
  }

  async onStop() {
    // Cleanup when plugin is stopped
    this.removeAllListeners();
    await this.cleanup();
  }

  async initialize() {
    // Custom initialization logic
    this.setupHooks();
    this.addResourceMethods();
  }

  setupHooks() {
    this.database.addHook('beforeInsert', async (data) => {
      // Intercept insert operations
      return this.processInsert(data);
    });
  }

  addResourceMethods() {
    const resource = this.database.resources[this.config.resource];
    if (!resource) return;

    // Add custom methods to resource
    resource.customMethod = async (...args) => {
      return this.handleCustomMethod(...args);
    };
  }
}
```

### Plugin Patterns

#### Pattern 1: Multi-Driver Support

```javascript
import { Plugin, PluginError } from 's3db.js';
class FlexiblePlugin extends Plugin {
  async onSetup() {
    switch(this.config.driver) {
      case 'memory':
        this.driver = new MemoryDriver(this.config);
        break;
      case 'redis':
        this.driver = new RedisDriver(this.config);
        break;
      default:
        throw new PluginError(`Unknown driver "${this.config.driver}"`, {
          statusCode: 400,
          retriable: false,
          suggestion: 'Choose one of: memory | redis.',
          metadata: { availableDrivers: ['memory', 'redis'] }
        });
    }
  }
}
```

#### Pattern 2: Resource Method Extension

```javascript
class ExtensionPlugin extends Plugin {
  addResourceMethods(resource) {
    const plugin = this;
    
    resource.newMethod = async function(...args) {
      // Access both resource and plugin context
      return plugin.processMethod(this, ...args);
    };
  }
}
```

#### Pattern 3: Operation Interception

```javascript
class InterceptorPlugin extends Plugin {
  interceptOperation(resource, operation) {
    const original = resource[operation];
    
    resource[operation] = async function(...args) {
      // Pre-processing
      await plugin.beforeOperation(operation, args);
      
      // Call original
      const result = await original.apply(this, args);
      
      // Post-processing
      await plugin.afterOperation(operation, result);
      
      return result;
    };
  }
}
```

### Plugin Hooks and Events

#### Database Hooks

Plugins can register hooks for database operations:

```javascript
this.database.addHook('beforeCreateResource', async ({ config }) => {
  // Modify resource configuration
});

this.database.addHook('afterCreateResource', async ({ resource }) => {
  // React to resource creation
});
```

#### Resource Events

Plugins can listen to resource-level events:

```javascript
resource.on('inserted', async (data) => {
  // React to insert operations
});

resource.on('updated', async (id, changes) => {
  // React to updates
});
```

#### Plugin Events

Plugins can emit their own events:

```javascript
this.emit('cache.hit', { key, value });
this.emit('audit.logged', { operation, data });
```

### 💾 PluginStorage: Efficient Data Persistence for Plugins

**PluginStorage** is a lightweight storage utility that enables plugins to persist data efficiently without the overhead of creating full Resources. It reuses s3db.js's metadata encoding and behavior system for cost optimization.

#### Why Use PluginStorage?

- **⚡ 3-5x Faster** than creating Resources
- **💰 30-40% Fewer S3 API calls**
- **🔐 Automatic Data Isolation** between plugins
- **📦 Metadata Encoding** for cost optimization
- **🎯 Behavior Support** (`body-overflow`, `body-only`, `enforce-limits`)
- **🗂️ Hierarchical Keys** for organized data storage

#### Key Features

1. **Automatic Data Isolation**: Each plugin gets its own namespace
2. **Resource-Scoped Storage**: Store data per resource or globally
3. **Efficient Serialization**: Reuses s3db.js's advanced metadata encoding
4. **Behavior Patterns**: Smart data distribution between metadata and body
5. **Batch Operations**: Efficient bulk read/write operations
6. **Easy Cleanup**: Delete all plugin data on uninstall

#### When to Use PluginStorage vs Resources

**✅ Use PluginStorage for:**
- Plugin configuration and settings (low volume)
- Distributed locks with TTL
- Simple key-value data (< 1000 records)
- Transient state and temporary data
- Plugin-internal bookkeeping

**❌ Use Resources for:**
- High-volume data (> 1000 records)
- Complex queries with filters and partitions
- Time-series data requiring date-based partitioning
- Audit logs and historical records
- Data requiring structured schemas and validation

#### Getting Started with PluginStorage

Every plugin has access to `PluginStorage` through the `getStorage()` method:

```javascript
import { Plugin } from 's3db.js';

class MyPlugin extends Plugin {
  constructor() {
    super({ slug: 'my-plugin' }); // Slug is used as namespace
  }

  async onInstall() {
    // Get plugin storage instance
    const storage = this.getStorage();

    // Save global plugin configuration
    await storage.set(
      storage.getPluginKey(null, 'config'),
      {
        enabled: true,
        lastSync: Date.now(),
        settings: { retries: 3, timeout: 30000 }
      },
      { behavior: 'body-overflow' }
    );

    // Save resource-scoped data with TTL
    await storage.set(
      storage.getPluginKey('users', 'cache', 'user-123'),
      { name: 'Alice', email: 'alice@example.com', cachedAt: Date.now() },
      { ttl: 300, behavior: 'body-only' } // Auto-expires after 5 minutes
    );
  }
}
```

#### TTL Support for Auto-Expiring Data

PluginStorage supports automatic expiration with TTL (Time-To-Live):

```javascript
const storage = this.getStorage();

// Store data that expires after 60 seconds
await storage.set('session:abc123',
  { userId: 'user1', token: 'xyz789' },
  { ttl: 60 }
);

// Get data - returns null if expired
const session = await storage.get('session:abc123');
if (!session) {
  console.log('Session expired or not found');
}

// Check if data is expired
const expired = await storage.isExpired('session:abc123');

// Get remaining TTL in seconds
const remainingSeconds = await storage.getTTL('session:abc123');
console.log(`Expires in ${remainingSeconds}s`);

// Extend TTL by adding more seconds
await storage.touch('session:abc123', 30); // Add 30 more seconds
```

**TTL Use Cases:**
- Session storage
- Temporary locks
- Rate limiting counters
- Cache entries
- Temporary state during processing

#### Distributed Locks with TTL

PluginStorage provides built-in distributed lock support with automatic expiration:

```javascript
const storage = this.getStorage();

// Acquire lock with auto-expiration
const lock = await storage.acquireLock('consolidate:user123', {
  ttl: 300,        // Auto-release after 5 minutes
  timeout: 5000,   // Wait up to 5 seconds to acquire
  workerId: process.pid
});

if (!lock) {
  console.log('Could not acquire lock');
  return;
}

try {
  // Do critical work...
  await this.consolidateUserData('user123');
} finally {
  // Always release lock
  await storage.releaseLock(lock);
}

// Check if locked
const isLocked = await storage.isLocked('consolidate:user123');
```

**Before (Manual Lock Implementation):**
```javascript
// ❌ OLD WAY: Manual locks with Resources (33 lines)
const lockResource = await database.createResource({
  name: 'locks',
  attributes: { id: 'string', lockedAt: 'number', workerId: 'string' }
});

const [lockAcquired] = await tryFn(() =>
  lockResource.insert({
    id: `lock-${id}`,
    lockedAt: Date.now(),
    workerId: process.pid
  })
);

if (!lockAcquired) return;

try {
  // Do work
} finally {
  await lockResource.delete(`lock-${id}`);
}

// Manual cleanup of stale locks
const locks = await lockResource.list();
for (const lock of locks) {
  if (Date.now() - lock.lockedAt > 300000) {
    await lockResource.delete(lock.id);
  }
}
```

**After (PluginStorage with TTL):**
```javascript
// ✅ NEW WAY: TTL-based locks (6 lines, 82% less code!)
const storage = this.getStorage();
const lock = await storage.acquireLock(id, { ttl: 300 });
if (!lock) return;

try {
  // Do work
} finally {
  await storage.releaseLock(lock);
}
// No manual cleanup needed - TTL handles it! ✨
```

#### Convenience Methods

PluginStorage includes helpful utility methods:

```javascript
const storage = this.getStorage();

// Check existence (not expired)
const exists = await storage.has('config'); // true/false

// Atomic counter operations
await storage.set('counter', { value: 0 });
await storage.increment('counter', 5);  // +5
await storage.decrement('counter', 2);  // -2
const counter = await storage.get('counter'); // { value: 3 }

// TTL management
const ttl = await storage.getTTL('session'); // Remaining seconds
await storage.touch('session', 60);          // Extend by 60s
const expired = await storage.isExpired('session'); // true/false
```

#### Key Structure

PluginStorage uses hierarchical S3 keys for organization:

```javascript
// Global plugin data: plugin={slug}/{path}
storage.getPluginKey(null, 'config')
// → "plugin=my-plugin/config"

storage.getPluginKey(null, 'state', 'current')
// → "plugin=my-plugin/state/current"

// Resource-scoped data: resource={name}/plugin={slug}/{path}
storage.getPluginKey('users', 'cache', 'user-123')
// → "resource=users/plugin=my-plugin/cache/user-123"

storage.getPluginKey('wallets', 'transactions', 'txn-456')
// → "resource=wallets/plugin=my-plugin/transactions/txn-456"

// Resource-scoped sequences (for plugins that need incremental IDs per resource)
storage.getSequenceKey('users', 'orderId', 'value')
// → "resource=users/plugin=my-plugin/sequence=orderId/value"

storage.getSequenceKey('users', 'orderId', 'lock')
// → "resource=users/plugin=my-plugin/sequence=orderId/lock"

// Global sequences (not tied to a resource)
storage.getSequenceKey(null, 'globalCounter', 'value')
// → "plugin=my-plugin/sequence=globalCounter/value"
```

##### Storage Path Convention Rules

All s3db.js storage follows strict path conventions to ensure data isolation:

| Scope | Pattern | Example |
|-------|---------|---------|
| **Native Resource Feature** | `resource={name}/{feature}/...` | `resource=orders/sequence=id/value` |
| **Plugin Global Data** | `plugin={slug}/...` | `plugin=cache/config` |
| **Plugin Resource-Scoped** | `resource={name}/plugin={slug}/...` | `resource=users/plugin=cache/entries/...` |
| **Plugin Sequence (Resource)** | `resource={name}/plugin={slug}/sequence={field}/...` | `resource=orders/plugin=billing/sequence=invoiceId/value` |
| **Plugin Sequence (Global)** | `plugin={slug}/sequence={field}/...` | `plugin=scheduler/sequence=jobId/value` |

**Key Rule:** Everything restricted to a resource scope MUST be inside the resource path (`resource={name}/...`).

#### Core Methods

##### `set(key, data, options)`

Save data to S3 with automatic encoding, behavior handling, and optional TTL:

```javascript
const storage = this.getStorage();

// Simple set with body-overflow (default)
await storage.set(
  storage.getPluginKey(null, 'config'),
  { mode: 'async', interval: 5000 }
);

// Set with TTL (auto-expires after 300 seconds)
await storage.set(
  storage.getPluginKey('users', 'session', 'user-1'),
  { token: 'abc123', loggedInAt: Date.now() },
  { ttl: 300 }
);

// Force everything to body
await storage.set(
  storage.getPluginKey('users', 'cache', 'user-1'),
  { huge: 'data'.repeat(1000) },
  { behavior: 'body-only' }
);

// Enforce strict metadata limits
await storage.set(
  storage.getPluginKey(null, 'small-config'),
  { enabled: true },
  { behavior: 'enforce-limits' } // Throws if exceeds 2KB
);
```

> **Note**: `put()` is still available as a deprecated alias for backward compatibility.

##### `get(key)`

Retrieve data with automatic decoding:

```javascript
// Get global config
const config = await storage.get(
  storage.getPluginKey(null, 'config')
);

// Get resource-scoped data
const cachedUser = await storage.get(
  storage.getPluginKey('users', 'cache', 'user-1')
);

// Returns null if not found
const missing = await storage.get(
  storage.getPluginKey(null, 'nonexistent')
);
// missing === null
```

##### `list(prefix, options)`

List all keys with a given prefix:

```javascript
// List all plugin keys
const allKeys = await storage.list();
// ['plugin=my-plugin/config', 'plugin=my-plugin/state', ...]

// List with prefix
const configKeys = await storage.list('config');
// ['plugin=my-plugin/config/general', 'plugin=my-plugin/config/advanced']

// List with limit
const first10 = await storage.list('', { limit: 10 });
```

##### `listForResource(resourceName, subPrefix, options)`

List keys for a specific resource:

```javascript
// List all data for 'users' resource
const userKeys = await storage.listForResource('users');
// ['resource=users/plugin=my-plugin/cache/user-1', ...]

// List with subprefix
const userCacheKeys = await storage.listForResource('users', 'cache');
// ['resource=users/plugin=my-plugin/cache/user-1', 'resource=users/plugin=my-plugin/cache/user-2']

// List with limit
const first5 = await storage.listForResource('users', '', { limit: 5 });
```

##### `delete(key)`

Delete a single key:

```javascript
await storage.delete(
  storage.getPluginKey(null, 'temp-data')
);
```

##### `deleteAll(resourceName)`

Delete all plugin data (useful for uninstall):

```javascript
// Delete all data for specific resource
const deleted = await storage.deleteAll('users');
console.log(`Deleted ${deleted} objects from users resource`);

// Delete ALL plugin data (global + all resources)
const totalDeleted = await storage.deleteAll();
console.log(`Deleted ${totalDeleted} total objects`);
```

##### `batchPut(items)` and `batchGet(keys)`

Efficient bulk operations:

```javascript
// Batch put
const items = [
  { key: storage.getPluginKey(null, 'item-1'), data: { value: 1 } },
  { key: storage.getPluginKey(null, 'item-2'), data: { value: 2 } },
  { key: storage.getPluginKey(null, 'item-3'), data: { value: 3 } }
];

const results = await storage.batchPut(items);
results.forEach(r => console.log(`${r.key}: ${r.ok ? 'OK' : r.error}`));

// Batch get
const keys = [
  storage.getPluginKey(null, 'item-1'),
  storage.getPluginKey(null, 'item-2')
];

const data = await storage.batchGet(keys);
data.forEach(d => console.log(d.ok ? d.data : d.error));
```

#### TTL Management Methods

##### `has(key)`

Check if a key exists and is not expired:

```javascript
const exists = await storage.has('session:user123'); // true/false
```

##### `isExpired(key)`

Check if a key is expired:

```javascript
const expired = await storage.isExpired('session:user123');
if (expired) {
  console.log('Session has expired');
}
```

##### `getTTL(key)`

Get remaining TTL in seconds:

```javascript
const remaining = await storage.getTTL('session:user123');
if (remaining) {
  console.log(`Expires in ${remaining} seconds`);
} else {
  console.log('No TTL set or key not found');
}
```

##### `touch(key, additionalSeconds)`

Extend TTL by adding more seconds:

```javascript
// Add 60 more seconds to current TTL
const extended = await storage.touch('session:user123', 60);
if (extended) {
  console.log('TTL extended successfully');
}
```

#### Distributed Lock Methods

##### `acquireLock(lockName, options)`

Acquire a distributed lock with TTL and retry logic:

```javascript
const lock = await storage.acquireLock('process:task1', {
  ttl: 300,        // Auto-release after 5 minutes
  timeout: 5000,   // Wait up to 5 seconds to acquire
  workerId: process.pid
});

if (lock) {
  console.log('Lock acquired:', lock.workerId);
} else {
  console.log('Could not acquire lock');
}
```

##### `releaseLock(lock)`

Release a distributed lock using the handle returned by `acquireLock`:

```javascript
await storage.releaseLock(lock);
```

> **Note:** If you only have the lock name, you must also provide the token:
> ```javascript
> await storage.releaseLock('process:task1', lock.token);
> ```

##### `isLocked(lockName)`

Check if a lock is currently held:

```javascript
const locked = await storage.isLocked('process:task1');
if (locked) {
  console.log('Lock is currently held');
}
```

#### Counter Methods

##### `increment(key, amount, options)`

Atomically increment a counter:

```javascript
// Increment by 1 (default)
await storage.increment('api-calls');

// Increment by custom amount
await storage.increment('api-calls', 5);

// Increment with TTL
await storage.increment('hourly-requests', 1, { ttl: 3600 });
```

##### `decrement(key, amount, options)`

Atomically decrement a counter:

```javascript
// Decrement by 1 (default)
await storage.decrement('available-slots');

// Decrement by custom amount
await storage.decrement('available-slots', 3);
```

#### Real-World Patterns

##### Pattern 1: Transaction Log with TTL (EventualConsistency)

```javascript
class EventualConsistencyPlugin extends Plugin {
  async saveTransaction(resourceName, field, transaction) {
    const storage = this.getStorage();

    await storage.set(
      storage.getPluginKey(resourceName, field, 'transactions', `id=${transaction.id}`),
      transaction,
      {
        behavior: 'body-overflow',
        ttl: 3600 // Auto-expire after 1 hour
      }
    );
  }

  async getPendingTransactions(resourceName, field, originalId) {
    const storage = this.getStorage();

    // List all transactions for this field
    const keys = await storage.listForResource(resourceName, `${field}/transactions`);

    // Filter for specific original ID
    const txnKeys = keys.filter(key => key.includes(`/originalId=${originalId}/`));

    // Batch get all transactions (expired ones return null automatically)
    const results = await storage.batchGet(txnKeys);

    return results.filter(r => r.ok && r.data).map(r => r.data);
  }

  async deleteAppliedTransactions(resourceName, field, transactionIds) {
    const storage = this.getStorage();

    for (const id of transactionIds) {
      await storage.delete(
        storage.getPluginKey(resourceName, field, 'transactions', `id=${id}`)
      );
    }
  }
}
```

##### Pattern 2: Cache Plugin with Automatic TTL

```javascript
class CachePlugin extends Plugin {
  async cacheRecord(resourceName, id, data, ttlSeconds) {
    const storage = this.getStorage();

    // Use built-in TTL - no manual expiration needed!
    await storage.set(
      storage.getPluginKey(resourceName, 'cache', id),
      { ...data, cachedAt: Date.now() },
      {
        ttl: ttlSeconds,
        behavior: 'body-only' // Large data in body
      }
    );
  }

  async getCachedRecord(resourceName, id) {
    const storage = this.getStorage();

    // get() automatically returns null if expired
    const data = await storage.get(
      storage.getPluginKey(resourceName, 'cache', id)
    );

    return data; // null if expired or not found
  }

  async extendCache(resourceName, id, additionalSeconds) {
    const storage = this.getStorage();

    // Extend TTL without rewriting data
    const extended = await storage.touch(
      storage.getPluginKey(resourceName, 'cache', id),
      additionalSeconds
    );

    return extended;
  }

  async invalidateCache(resourceName, id) {
    const storage = this.getStorage();

    await storage.delete(
      storage.getPluginKey(resourceName, 'cache', id)
    );
  }

  async invalidateAllForResource(resourceName) {
    const storage = this.getStorage();

    const deleted = await storage.deleteAll(resourceName);
    console.log(`Invalidated ${deleted} cached records for ${resourceName}`);
  }
}
```

##### Pattern 3: Plugin Configuration & State

```javascript
class MyPlugin extends Plugin {
  async onInstall() {
    const storage = this.getStorage();

    // Initialize config if not exists
    let config = await storage.get(storage.getPluginKey(null, 'config'));

    if (!config) {
      config = {
        mode: 'async',
        interval: 5000,
        enabled: true,
        lastRun: null
      };

      await storage.set(
        storage.getPluginKey(null, 'config'),
        config
      );
    }

    this.config = config;
  }

  async updateConfig(changes) {
    const storage = this.getStorage();

    this.config = { ...this.config, ...changes };

    await storage.set(
      storage.getPluginKey(null, 'config'),
      this.config
    );
  }

  async saveState(state) {
    const storage = this.getStorage();

    await storage.set(
      storage.getPluginKey(null, 'state'),
      {
        ...state,
        updatedAt: Date.now()
      }
    );
  }

  async getState() {
    const storage = this.getStorage();

    return await storage.get(
      storage.getPluginKey(null, 'state')
    );
  }
}
```

##### Pattern 4: Analytics & Metrics

```javascript
class AnalyticsPlugin extends Plugin {
  async recordMetric(resourceName, field, cohort, metrics) {
    const storage = this.getStorage();

    await storage.set(
      storage.getPluginKey(resourceName, field, 'analytics', cohort),
      {
        cohort,
        count: metrics.count,
        sum: metrics.sum,
        avg: metrics.avg,
        min: metrics.min,
        max: metrics.max,
        recordedAt: Date.now()
      },
      { behavior: 'body-overflow' }
    );
  }

  async getAnalytics(resourceName, field, startCohort, endCohort) {
    const storage = this.getStorage();

    // List all analytics for field
    const keys = await storage.listForResource(resourceName, `${field}/analytics`);

    // Filter by cohort range
    const relevantKeys = keys.filter(key => {
      const cohort = key.split('/').pop();
      return cohort >= startCohort && cohort <= endCohort;
    });

    // Batch get
    const results = await storage.batchGet(relevantKeys);

    return results.filter(r => r.ok).map(r => r.data);
  }
}
```

#### Behavior Strategies

PluginStorage supports three behavior strategies for handling S3's 2KB metadata limit:

##### `body-overflow` (Default - Recommended)

Automatically distributes data between metadata and body based on field size:

```javascript
await storage.set(key, data, { behavior: 'body-overflow' });
```

- **Small fields** → Metadata (fast, no additional read)
- **Large fields** → Body (bypass metadata limit)
- **Automatic optimization** based on UTF-8 byte size

##### `body-only`

Stores all data in S3 body:

```javascript
await storage.set(key, largeData, { behavior: 'body-only' });
```

- **Best for**: Large objects (> 2KB)
- **Metadata**: Only contains minimal system fields
- **Body limit**: 5TB per object

##### `enforce-limits`

Throws error if data exceeds metadata limit:

```javascript
try {
  await storage.set(key, data, { behavior: 'enforce-limits' });
} catch (error) {
  console.error('Data exceeds 2KB limit:', error.message);
}
```

- **Best for**: Strict data validation
- **Throws**: If data > 2KB
- **Use case**: Ensure data fits in metadata for fastest access

#### Cleanup on Uninstall

Always clean up plugin data when uninstalling:

```javascript
class MyPlugin extends Plugin {
  async onUninstall(options = {}) {
    const { purgeData = false } = options;

    if (purgeData) {
      const storage = this.getStorage();

      // Delete all plugin data
      const deleted = await storage.deleteAll();
      console.log(`Cleaned up ${deleted} plugin objects`);
    }
  }
}

// Usage
await database.uninstallPlugin(myPlugin, { purgeData: true });
```

#### Performance Tips

1. **Use `body-overflow` for mixed data sizes** - Automatic optimization
2. **Batch operations** when possible - Reduces API calls
3. **Use `listForResource()`** instead of `list()` when filtering by resource
4. **Cache frequently accessed data** in memory within your plugin
5. **Use descriptive key paths** for easier debugging

#### Common Pitfalls

❌ **Don't use camelCase in keys** - S3 converts metadata keys to lowercase

```javascript
// Bad
await storage.put(key, { firstName: 'Alice', lastName: 'Smith' });
// Retrieved as: { firstname: 'Alice', lastname: 'Smith' }

// Good
await storage.put(key, { first_name: 'Alice', last_name: 'Smith' });
```

❌ **Don't forget to handle null returns**

```javascript
// Bad
const data = await storage.get(key);
console.log(data.field); // Crashes if key doesn't exist

// Good
const data = await storage.get(key);
if (data) {
  console.log(data.field);
}
```

❌ **Don't skip cleanup**

```javascript
// Bad
async onUninstall() {
  // Nothing - leaves orphaned data
}

// Good
async onUninstall(options = {}) {
  if (options.purgeData) {
    await this.getStorage().deleteAll();
  }
}
```

#### Testing PluginStorage

```javascript
import { PluginStorage } from 's3db.js';
import { createDatabaseForTest } from './test-utils';

describe('MyPlugin with PluginStorage', () => {
  let db, plugin, storage;

  beforeEach(async () => {
    db = createDatabaseForTest('my-plugin-test');
    await db.connect();

    plugin = new MyPlugin();
    await plugin.install(db);

    storage = new PluginStorage(db.client, 'my-plugin');
  });

  afterEach(async () => {
    await storage.deleteAll(); // Cleanup
    await db.disconnect();
  });

  it('should persist plugin configuration', async () => {
    const key = storage.getPluginKey(null, 'config');

    await storage.set(key, { enabled: true });

    const retrieved = await storage.get(key);
    expect(retrieved.enabled).toBe(true);
  });

  it('should handle TTL expiration', async () => {
    const key = storage.getPluginKey(null, 'session');

    // Set with 1 second TTL
    await storage.set(key, { userId: 'user1' }, { ttl: 1 });

    // Should exist immediately
    expect(await storage.has(key)).toBe(true);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should be expired and return null
    expect(await storage.get(key)).toBe(null);
    expect(await storage.has(key)).toBe(false);
  });

  it('should handle distributed locks', async () => {
    const lock1 = await storage.acquireLock('task1', { ttl: 5 });
    expect(lock1).toBeTruthy();

    // Second acquire should fail (already locked)
    const lock2 = await storage.acquireLock('task1', { timeout: 0 });
    expect(lock2).toBe(null);

    // Release lock
    await storage.releaseLock(lock1);

    // Now should be able to acquire
    const lock3 = await storage.acquireLock('task1', { ttl: 5 });
    expect(lock3).toBeTruthy();
  });

  it('should handle atomic counters', async () => {
    await storage.set('counter', { value: 0 });

    await storage.increment('counter', 5);
    await storage.increment('counter', 3);
    await storage.decrement('counter', 2);

    const counter = await storage.get('counter');
    expect(counter.value).toBe(6); // 0 + 5 + 3 - 2 = 6
  });

  it('should isolate resource-scoped data', async () => {
    await storage.set(
      storage.getPluginKey('users', 'cache', 'user-1'),
      { name: 'Alice' }
    );

    await storage.set(
      storage.getPluginKey('products', 'cache', 'prod-1'),
      { title: 'Product 1' }
    );

    const userKeys = await storage.listForResource('users');
    expect(userKeys.length).toBe(1);

    const productKeys = await storage.listForResource('products');
    expect(productKeys.length).toBe(1);
  });
});
```

---

## 💡 Plugin Combinations

### Production Stack

Perfect for production applications requiring performance, reliability, and monitoring:

```javascript
const productionPlugins = [
  // Performance optimization
  new CachePlugin({
    driver: 'multi',
    config: {
      strategy: 'all',
      destinations: [
        { driver: 'memory', config: { maxSize: 1000 } },
        { driver: 'filesystem', config: { path: './cache' } }
      ]
    }
  }),
  
  // Data protection
  new BackupPlugin({
    driver: 'multi',
    config: {
      strategy: 'all',
      destinations: [
        { driver: 'filesystem', config: { path: './backups/{date}/' } },
        { driver: 's3', config: { bucket: 'backup-bucket' } }
      ]
    },
    retention: { daily: 7, weekly: 4, monthly: 12 }
  }),
  
  // Monitoring and compliance
  new AuditPlugin({ 
    includeData: true,
    trackOperations: ['inserted', 'updated', 'deleted']
  }),
  new MetricsPlugin({ 
    collectPerformance: true,
    trackSlowQueries: true
  }),
  CostsPlugin,
  
  // Automation
  new SchedulerPlugin({
    jobs: {
      daily_cleanup: {
        schedule: '0 3 * * *',
        action: async (db) => {
          // Daily maintenance tasks
        }
      }
    }
  })
];
```

### Analytics Platform

Ideal for data analysis, search, and real-time processing:

```javascript
const analyticsPlugins = [
  // Search and discovery
  new FullTextPlugin({
    fields: ['title', 'content', 'tags'],
    fuzzySearch: true,
    stemming: true
  }),
  
  // Real-time data pipeline
  new ReplicatorPlugin({
    replicators: [{
      driver: 'bigquery',
      resources: { events: 'event_analytics' },
      config: {
        projectId: 'analytics-project',
        datasetId: 'events'
      }
    }]
  }),
  
  // Event processing
  new QueueConsumerPlugin({
    consumers: [{
      driver: 'sqs',
      config: { queueUrl: 'analytics-queue-url' },
      consumers: [{ resources: ['events'] }]
    }]
  }),
  
  // Performance monitoring
  new MetricsPlugin({
    collectUsage: true,
    trackSlowQueries: true
  }),
  new CachePlugin({
    driver: 'memory',
    config: { maxSize: 5000 }
  })
];
```

### E-commerce Workflow

Perfect for order processing, inventory management, and business workflows:

```javascript
const ecommercePlugins = [
  // Business process management
  new StateMachinePlugin({
    stateMachines: {
      order_processing: {
        initialState: 'pending',
        states: {
          pending: { on: { CONFIRM: 'confirmed' } },
          confirmed: { on: { SHIP: 'shipped' } },
          shipped: { on: { DELIVER: 'delivered' } },
          delivered: { type: 'final' }
        }
      }
    }
  }),
  
  // Inventory management with eventual consistency
  new EventualConsistencyPlugin({
    resource: 'inventory',
    field: 'quantity',
    mode: 'sync'
  }),
  
  // Automated operations
  new SchedulerPlugin({
    jobs: {
      inventory_sync: {
        schedule: '*/15 * * * *',
        action: async (db) => {
          // Sync inventory every 15 minutes
        }
      },
      daily_reports: {
        schedule: '0 9 * * *',
        action: async (db) => {
          // Generate daily sales reports
        }
      }
    }
  }),
  
  // Data synchronization
  new ReplicatorPlugin({
    replicators: [{
      driver: 'sqs',
      resources: ['orders', 'inventory'],
      config: { queueUrl: 'order-events-queue' }
    }]
  }),
  
  // Audit and compliance
  new AuditPlugin({
    trackOperations: ['inserted', 'updated', 'deleted'],
    includeData: true
  }),
  
  // Performance optimization
  new CachePlugin({
    driver: 'memory',
    config: { maxSize: 2000 }
  })
];
```

### Development Environment

Lightweight setup for development with debugging and testing support:

```javascript
const developmentPlugins = [
  // Fast local caching
  new CachePlugin({
    driver: 'memory',
    config: { maxSize: 500 }
  }),
  
  // Local backups
  new BackupPlugin({
    driver: 'filesystem',
    config: { path: './dev-backups/{date}/' }
  }),
  
  // Development metrics
  new MetricsPlugin({
    logLevel: 'debug',
    collectPerformance: true
  }),
  
  // Cost tracking
  CostsPlugin,
  
  // Search for testing
  new FullTextPlugin({
    fields: ['title', 'content'],
    logLevel: 'debug'
  })
];
```

---

## 🎯 Best Practices

### 1. Initialization Safety

Always check if resources exist before accessing them:

```javascript
async onSetup() {
  if (!this.database.resources[this.config.resource]) {
    // Handle missing resource (defer or error)
  }
}
```

### 2. Cleanup on Stop

Always clean up resources in `onStop()`:

```javascript
async onStop() {
  clearInterval(this.timer);
  await this.flushCache();
  this.removeAllListeners();
}
```

### 3. Error Handling

Use proper error handling with tryFn:

```javascript
const [ok, err, result] = await tryFn(() => 
  this.performOperation()
);

if (!ok) {
  this.emit('plugin.error', err);
  return null;
}
```

### 4. Configuration Validation

Validate configuration in constructor:

```javascript
import { ValidationError } from 's3db.js';

constructor(options = {}) {
  super(options);
  
  if (!options.resource) {
    throw new ValidationError('Plugin configuration requires a resource', {
      statusCode: 400,
      retriable: false,
      suggestion: 'Pass { resource: "..." } when instantiating your plugin.'
    });
  }
  
  this.config = {
    ...this.getDefaultConfig(),
    ...options
  };
}
```

### 5. Avoid Conflicts

Check for existing methods before adding new ones:

```javascript
if (resource.addBalance) {
  console.warn('Method addBalance already exists');
  return;
}

resource.addBalance = async (...) => { ... };
```

### Plugin Performance

- **Cache Strategically**: Use caching plugins for frequently accessed data
- **Monitor Resources**: Track performance impact with metrics plugins
- **Optimize Configurations**: Tune plugin settings based on usage patterns
- **Profile Operations**: Use metrics to identify bottlenecks

### Plugin Security

- **Audit Critical Operations**: Log all sensitive data operations
- **Encrypt Sensitive Data**: Use encryption in backup and replication plugins
- **Validate Configurations**: Ensure plugin configurations don't expose sensitive data
- **Monitor Access**: Track plugin-generated operations

### Plugin Monitoring

- **Event-Driven Monitoring**: Use plugin events for real-time monitoring
- **Health Checks**: Implement plugin health checks
- **Error Handling**: Robust error handling in plugin configurations
- **Performance Tracking**: Monitor plugin impact on overall performance

### Plugin Combinations

- **Avoid Conflicts**: Ensure plugins don't interfere with each other
- **Order Matters**: Consider plugin initialization order
- **Resource Usage**: Monitor combined plugin resource usage
- **Configuration Overlap**: Avoid conflicting plugin configurations

---

## 🔍 Troubleshooting

### Plugin Not Initializing

**Problem**: Plugin methods not appearing on resource

**Solutions**:
- Ensure database is connected before adding plugin
- Check if resource name matches exactly
- Verify plugin setup completed without errors

### Deferred Setup Not Working

**Problem**: Plugin not setting up when resource is created

**Solutions**:
- Ensure plugin is watching for correct resource name
- Check that database hooks are properly registered
- Verify no errors in completeSetup() method

### Method Conflicts

**Problem**: Plugin methods overwriting existing methods

**Solutions**:
- Check for existing methods before adding
- Use unique method names with prefixes
- Consider using namespaced methods (resource.plugin.method)

### Performance Issues

**Problem**: Plugin slowing down operations

**Solutions**:
- Use async operations where possible
- Implement caching for expensive operations
- Batch operations when appropriate
- Profile plugin performance with metrics

### Plugin Initialization Order

**Problem**: "Analytics not enabled" or similar errors

**Root Cause**: Resources must be created AFTER plugin installation for automatic setup

**Correct Order**:
```javascript
// ✅ CORRECT: Plugin → Connect → Resources
const db = new Database({
  bucket: 'my-bucket',
  plugins: [new EventualConsistencyPlugin({ /* config */ })]
});

await db.connect();  // Plugins installed here
await db.createResource({ name: 'users', ... });  // Plugin sets up automatically
```

**Wrong Order**:
```javascript
// ❌ WRONG: Resources before plugin
const db = new Database({ bucket: 'my-bucket' });
await db.connect();
await db.createResource({ name: 'users', ... });  // Resource created first
await db.usePlugin(new EventualConsistencyPlugin({ /* config */ }));  // Too late!
```

**Error Diagnostics**: If you encounter initialization errors, check `error.description` for detailed diagnostics:

```javascript
try {
  const analytics = await plugin.getAnalytics('users', 'balance');
} catch (error) {
  console.error(error.message);  // Short error message
  if (error.description) {
    console.log('\n' + error.description);  // Detailed diagnostics with solutions
  }
}
```

### Testing Plugins with Partial Schemas

**Problem**: Partition validation fails when using simplified test schemas

**Solution**: Use `strictValidation: false` to skip partition field validation during testing

**Example**:
```javascript
describe('EventualConsistency Plugin', () => {
  it('should handle counters', async () => {
    // Create database with strict validation disabled
    const db = new Database({
      bucket: 'test-bucket',
      strictValidation: false,  // ✅ Skip partition validation
      plugins: [new EventualConsistencyPlugin({
        resources: {
          users: {
            fields: {
              balance: { type: 'counter', analytics: true }
            }
          }
        }
      })]
    });

    await db.connect();

    // Create resource with PARTIAL schema (missing partition fields)
    const users = await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        balance: 'number|default:0'
        // ✅ Missing 'region' field used by plugin's partition
        // ✅ strictValidation: false allows this
      }
    });

    // Plugin still works correctly
    await users.add('user1', 100);
    const user = await users.get('user1');
    expect(user.balance).toBe(100);
  });
});
```

**When to use `strictValidation: false`**:
- ✅ Unit testing plugins with minimal schemas
- ✅ Integration testing with mock data
- ✅ Testing single features without full schema
- ❌ Production code (always use strict validation)

### Common Error Messages

#### "Analytics not enabled for {resource}.{field}"

**Cause**: Plugin configuration issue or resource not created

**Check**:
1. Verify plugin is installed before resource creation
2. Check field is configured in plugin's `resources` config
3. Look at `error.description` for detailed diagnostics

**Example Fix**:
```javascript
// Check plugin configuration
const plugin = new EventualConsistencyPlugin({
  resources: {
    wallets: {  // Must match resource name
      fields: {
        balance: {  // Must match field name
          type: 'counter',
          analytics: true  // Required for analytics
        }
      }
    }
  }
});
```

#### "Partition '{name}' uses field '{field}' which does not exist"

**Cause**: Partition references field not in schema

**Check `error.description`** for:
- List of available fields in schema
- Suggested solutions
- Documentation link

**Solutions**:
1. Add missing field to schema
2. Fix typo in partition field name
3. Use `strictValidation: false` for testing only

**Example Fix**:
```javascript
// Option 1: Add missing field
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    region: 'string|required',  // ✅ Add the field
    balance: 'number|default:0'
  },
  partitions: {
    byRegion: {
      fields: { region: 'string' }
    }
  }
});

// Option 2: Fix partition definition
await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    country: 'string|required'  // Field is 'country' not 'region'
  },
  partitions: {
    byRegion: {
      fields: { country: 'string' }  // ✅ Use correct field name
    }
  }
});

// Option 3: Use strictValidation: false for testing
const db = new Database({
  strictValidation: false,  // ✅ Skip validation in tests
  /* ... */
});
```

---

## 📚 Additional Resources

### Documentation

Each plugin has comprehensive documentation:

- [Cache Plugin](./cache.md) - Intelligent caching system
- [Costs Plugin](./costs.md) - AWS S3 cost tracking
- [Audit Plugin](./audit.md) - Comprehensive audit logging
- [Metrics Plugin](./metrics.md) - Performance monitoring
- [Backup Plugin](./backup.md) - Data backup and recovery
- [Replicator Plugin](./replicator/) - Data replication
- [FullText Plugin](./fulltext.md) - Full-text search
- [Eventual Consistency Plugin](./eventual-consistency.md) - Event sourcing for numeric fields
- [State Machine Plugin](./state-machine/) - Workflow management
- [Scheduler Plugin](./scheduler/) - Job scheduling
- [Queue Consumer Plugin](./queue-consumer.md) - Message processing
- [S3Queue Plugin](./s3-queue/) - Distributed queue processing

### Testing Plugins

#### Unit Testing

```javascript
describe('MyPlugin', () => {
  let database, plugin;
  
  beforeEach(async () => {
    database = await createDatabaseForTest('my-plugin-test');
    await database.connect();
    
    plugin = new MyPlugin({ /* config */ });
    await database.usePlugin(plugin);
  });
  
  afterEach(async () => {
    await database.disconnect();
  });
  
  it('should add methods to resource', async () => {
    const resource = await database.createResource({
      name: 'test',
      attributes: { id: 'string|required' }
    });
    
    expect(typeof resource.myMethod).toBe('function');
  });
});
```

#### Integration Testing

```javascript
it('should work with multiple plugins', async () => {
  const cache = new CachePlugin({ driver: 'memory' });
  const audit = new AuditPlugin({ driver: 'memory' });
  
  await database.usePlugin(cache);
  await database.usePlugin(audit);
  
  // Test combined functionality
  const resource = await database.createResource({ ... });
  await resource.insert({ id: '1', data: 'test' });
  
  // Verify both plugins are working
  expect(cache.getStats().operations).toBe(1);
  expect(audit.getLogs().length).toBe(1);
});
```

### Plugin File Structure

```
docs/plugins/
├── README.md              # This comprehensive guide
├── cache.md              # Cache Plugin documentation
├── costs.md              # Costs Plugin documentation
├── audit.md              # Audit Plugin documentation
├── metrics.md            # Metrics Plugin documentation
├── backup.md             # Backup Plugin documentation
├── replicator/           # Replicator Plugin documentation
│   └── README.md
├── fulltext.md           # FullText Plugin documentation
├── queue-consumer.md     # Queue Consumer Plugin documentation
├── s3-queue/             # S3Queue Plugin documentation
│   └── README.md
├── state-machine/        # State Machine Plugin documentation
│   └── README.md
├── scheduler/            # Scheduler Plugin documentation
│   └── README.md
├── ttl/                  # TTL Plugin documentation
│   └── README.md
├── vector/               # Vector Plugin documentation
│   └── README.md
├── kubernetes-inventory/ # Kubernetes Inventory Plugin documentation
│   └── README.md
├── recon/                # Recon Plugin documentation
│   └── README.md
├── ml-plugin/            # ML Plugin documentation
│   └── README.md
├── cookie-farm/          # Cookie Farm Plugin documentation
│   └── README.md
└── eventual-consistency.md # Eventual Consistency Plugin documentation
```

Each individual plugin file follows a consistent structure:
- **Overview**: Plugin purpose and how it works
- **Key Features**: Core and technical capabilities
- **Installation & Setup**: Getting started quickly
- **Configuration Options**: Complete parameter reference
- **Usage Examples**: Practical implementation examples
- **API Reference**: Method and event documentation
- **Advanced Patterns**: Complex use cases and patterns
- **Best Practices**: Recommendations and guidelines
- **Troubleshooting**: Common issues and solutions

### Namespace Documentation

For detailed information about namespace support:

- **[Plugin Namespace API](./namespace.md)** - Complete API reference
- **[Namespace Changes](./NAMESPACE-CHANGES.md)** - Pattern changes and migration guide
- **[Namespace Tests](./NAMESPACE-TESTS.md)** - Test coverage documentation
- **[ReconPlugin Namespace Example](./recon-namespace.md)** - Production implementation example
- **[Multi-Instance Example](../examples/e45-recon-multi-instance.js)** - Running 3 instances simultaneously
- **[Namespace Detection Example](../examples/e46-recon-namespace-detection.js)** - Automatic detection demo
- **[Custom Plugin Example](../examples/e47-namespace-concern-usage.js)** - Implementing namespace support

### Community & Support

- [GitHub Issues](https://github.com/s3db-js/s3db.js/issues) - Bug reports and feature requests
- [Discussions](https://github.com/s3db-js/s3db.js/discussions) - Community discussions
- [Plugin Development Guide](./plugin-development.md) - Detailed guide for creating custom plugins
- [Plugin API Reference](./plugin-api.md) - Complete API documentation
- [Community Plugin Registry](https://github.com/s3db-js/plugins) - Third-party plugins

---

This comprehensive guide provides everything you need to understand, use, and develop plugins for s3db.js. For specific plugin details, refer to the individual plugin documentation files listed above.
