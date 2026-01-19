<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

AI guidance for s3db.js - S3-based document database.

## Critical Policies

**Lazy Loading (v14.1.6+):** All plugin peer dependencies use dynamic imports to prevent "module not found" errors. See pattern in `src/plugins/index.js`.

**Commenting:** No inline comments. Use JSDoc blocks before classes/functions/methods only.

**Validation:** Uses [fastest-validator](https://github.com/icebob/fastest-validator). Nested objects auto-detect - just write `profile: { bio: 'string' }`. Full docs: `docs/fastest-validator.md`

## Quick Reference

### Core API

| Method | Module | Usage |
|--------|--------|-------|
| `insert()` | `_persistence` | `await resource.insert({ name: 'John' })` |
| `get()` | `_persistence` | `await resource.get(id)` |
| `update()` | `_persistence` | GET+PUT merge (baseline) |
| `patch()` | `_persistence` | HEAD+COPY merge (40-60% faster) |
| `replace()` | `_persistence` | PUT only (30-40% faster) |
| `list()` | `_query` | `await resource.list({ limit: 100 })` |
| `query()` | `_query` | `await resource.query({ status: 'active' })` |

### Resource Architecture (Facade Pattern)

```
Resource → _persistence, _query, _partitions, _content, _streams,
           _hooks, _guards, _middleware, _eventsModule, _idGenerator, validator
```

Modules in `src/core/`: ResourcePersistence, ResourceQuery, ResourcePartitions, etc.

### Behaviors (2KB Metadata Limit)

| Behavior | Use Case |
|----------|----------|
| `body-overflow` | Default, auto overflow to body |
| `body-only` | Large data (>2KB) |
| `truncate-data` | Accept data loss for speed |
| `enforce-limits` | Production, strict validation |
| `user-managed` | Custom handling via events |

### Field Types

| Type | Example | Notes |
|------|---------|-------|
| `string` | `name: 'string\|required'` | Basic |
| `number` | `age: 'number\|min:0'` | Integer/float |
| `secret` | `password: 'secret'` | AES-256-GCM encrypted |
| `embedding:N` | `vector: 'embedding:1536'` | 77% compression |
| `ip4`/`ip6` | `ip: 'ip4'` | 44-47% compression |
| `object` | `{ bio: 'string' }` | Auto-detected nested |

### Plugins

| Plugin | Purpose |
|--------|---------|
| `ApiPlugin` | REST API with guards, OpenAPI docs |
| `TTLPlugin` | Auto-cleanup (O(1) partition-based) |
| `CachePlugin` | Memory/S3/filesystem cache |
| `AuditPlugin` | Track all changes |
| `ReplicatorPlugin` | Sync to PostgreSQL/BigQuery/SQS |

### Connection Strings

```
s3://KEY:SECRET@bucket?region=us-east-1     # AWS S3
http://KEY:SECRET@localhost:9000/bucket     # MinIO
memory://bucket/path                        # MemoryClient (testing)
file:///tmp/s3db                            # FileSystemClient (testing)
```

## Commands

```bash
pnpm install && pnpm run build    # Development
s3db list                         # List resources
s3db query <resource>             # Query records
```

## Testing

**ALL tests run inside Docker container:**

```bash
# Start container
docker compose --profile test up -d test-runner

# Run specific test (PREFERRED)
docker compose --profile test exec test-runner pnpm vitest run tests/core/path/to/test.js

# Run directory
docker compose --profile test exec test-runner pnpm vitest run tests/core/

# Stop
docker compose --profile test down
```

**Client Selection:**
| Client | Use Case |
|--------|----------|
| FileSystemClient | Default for tests (safe parallelism) |
| MemoryClient | Single-file only (RAM explosion risk!) |
| S3Client | Integration tests |

**Mock Utilities:** `tests/mocks/` - MockClient, factories, fixtures, spies

## Key Locations

| What | Where |
|------|-------|
| Core modules | `src/core/` |
| Utilities | `src/concerns/` |
| Plugins | `src/plugins/` |
| Tests | `tests/core/`, `tests/plugins/` |
| Examples | `docs/examples/eXX-*.js` |
| MCP Server | `mcp/entrypoint.js` |

## Incremental IDs

```javascript
idGenerator: 'incremental'           // 1, 2, 3...
idGenerator: 'incremental:1000'      // Start at 1000
idGenerator: 'incremental:ORD-0001'  // Prefixed
idGenerator: 'incremental:fast'      // ~1ms/ID (batch mode)
```

## Global Coordinator

All coordinator plugins share `GlobalCoordinatorService` for leader election. One heartbeat loop per namespace (10x fewer API calls).

```javascript
const coordinator = await database.getGlobalCoordinator('default');
console.log('Leader:', await coordinator.getLeader());
console.log('Circuit Breaker:', coordinator.getCircuitBreakerStatus());
```

**Resilience Features (etcd-inspired):**

| Feature | Purpose |
|---------|---------|
| Circuit Breaker | Protects against S3 outages |
| Contention Detection | Alerts when heartbeats are slow |
| Epoch Fencing | Prevents split-brain scenarios |
| Enhanced Metrics | Latency percentiles (p50/p95/p99) |

**Circuit Breaker:** Protects against repeated S3 failures. Opens after 5 consecutive failures, resets after 30 seconds.

```javascript
// Custom circuit breaker config
const coordinator = new GlobalCoordinatorService({
  namespace: 'production',
  database: db,
  config: {
    circuitBreaker: {
      failureThreshold: 5,    // Open after 5 failures
      resetTimeout: 30000     // Try to close after 30s
    }
  }
});

coordinator.on('circuitBreaker:open', ({ namespace, failureCount }) => {
  console.warn(`Circuit breaker opened for ${namespace}`);
});
```

**Contention Detection:** Emits event when heartbeat takes >2x expected time.

```javascript
const coordinator = new GlobalCoordinatorService({
  namespace: 'production',
  database: db,
  config: {
    contention: {
      enabled: true,
      threshold: 2.0,      // Alert when >2x expected
      rateLimitMs: 30000   // Max 1 event per 30s
    }
  }
});

coordinator.on('contention:detected', ({ ratio, duration, expected }) => {
  console.warn(`Contention: ${ratio.toFixed(1)}x slower (${duration}ms vs ${expected}ms)`);
});
```

**Epoch Fencing:** Rejects tasks from stale leaders to prevent split-brain.

```javascript
class MyQueuePlugin extends CoordinatorPlugin {
  async processTask(task) {
    // Validate task epoch before processing
    if (!this.isEpochValid(task.epoch, task.createdAt)) {
      this.logger.warn({ taskEpoch: task.epoch }, 'Rejecting stale task');
      return;
    }
    await this.doWork(task);
  }
}

// Configuration
new MyQueuePlugin({
  epochFencingEnabled: true,   // Enable validation
  epochGracePeriodMs: 5000     // Accept epoch-1 tasks within 5s
});
```

**Enhanced Metrics:** Latency percentiles for observability.

```javascript
const metrics = coordinator.getMetrics();
// {
//   heartbeatCount: 1234,
//   contentionEvents: 2,
//   epochDriftEvents: 0,
//   latency: { count: 100, p50: 15, p95: 45, p99: 120, min: 8, max: 200, avg: 22 }
// }
```

Plugins with coordination: S3QueuePlugin, SchedulerPlugin, TTLPlugin, EventualConsistencyPlugin

## HTTP Client Wrapper

Unified HTTP client (`src/concerns/http-client.js`) for all plugins. Uses recker when available, falls back to native fetch.

### Installation

```bash
# Optional - enhanced HTTP features (connection pooling, keep-alive)
pnpm add recker
```

### Basic Usage

```javascript
import { createHttpClient } from '#src/concerns/http-client.js';

const client = await createHttpClient({
  baseUrl: 'https://api.example.com',
  timeout: 10000,
  auth: { type: 'bearer', token: 'secret' },
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential',
    retryAfter: true,
    retryOn: [429, 500, 502, 503, 504]
  }
});

const response = await client.get('/users');
const data = await response.json();
```

### Authentication Types

```javascript
// Bearer Token
auth: { type: 'bearer', token: 'your-jwt-token' }

// Basic Auth
auth: { type: 'basic', username: 'user', password: 'pass' }

// API Key (custom header)
auth: { type: 'apikey', header: 'X-API-Key', value: 'your-key' }
```

### HTTP Methods

```javascript
// GET
await client.get('/users');
await client.get('/users?status=active');

// POST with JSON body
await client.post('/users', { body: { name: 'John' } });

// POST with form data
await client.post('/auth', {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials' }).toString()
});

// Generic request
await client.request('/endpoint', { method: 'PUT', body: data });
```

### Retry Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | number | 3 | Maximum retry attempts |
| `delay` | number | 1000 | Initial delay in ms |
| `backoff` | string | 'exponential' | 'exponential' or 'fixed' |
| `jitter` | boolean | true | Add randomness to prevent thundering herd |
| `retryAfter` | boolean | true | Respect Retry-After header |
| `retryOn` | number[] | [429,500,502,503,504] | Status codes to retry |

### Class Pattern (for plugins)

```javascript
class MyPlugin {
  constructor() {
    this._httpClient = null;
  }

  async _getHttpClient() {
    if (!this._httpClient) {
      this._httpClient = await createHttpClient({
        timeout: 15000,
        retry: { maxAttempts: 3, backoff: 'exponential' }
      });
    }
    return this._httpClient;
  }
}
```

### Module Pattern (for utilities)

```javascript
let httpClient = null;

async function getHttpClient() {
  if (!httpClient) {
    httpClient = await createHttpClient({ timeout: 30000 });
  }
  return httpClient;
}
```

**Features:** Bearer/Basic/API key auth, exponential backoff with jitter, Retry-After header support, timeout handling, lazy initialization.

**Plugins using it:** WebhookReplicator, Spider (robots-parser, sitemap-parser, deep-discovery), API Auth (oidc-client, oauth2-auth, oidc-auth, oidc-par), Recon Stages (asn, subdomains, dnsdumpster, osint, google-dorks), Cloud Inventory (mongodb-atlas-driver)

## Hybrid Spider (CrawlContext + HybridFetcher)

Unified session state between HTTP client and puppeteer for web crawling.

### CrawlContext - Session State Manager

```javascript
import { CrawlContext } from 's3db.js';

const context = new CrawlContext({
  userAgent: 'MyBot/1.0',
  proxy: 'http://proxy:8080',
  timezone: 'America/New_York',
  viewport: { width: 1920, height: 1080 }
});

// Cookies shared between HTTP and puppeteer
context.setCookies([{ name: 'session', value: 'abc', domain: 'example.com' }]);
context.setCookiesFromHeader('auth=token; Path=/', 'https://example.com');

// Get HTTP config (includes cookies)
const httpConfig = context.getHttpClientConfig('https://example.com');

// Configure puppeteer page (sets cookies, user-agent, viewport)
await context.configurePage(page);

// Persist session
const json = context.toJSON();
const restored = CrawlContext.fromJSON(json);
```

### HybridFetcher - Smart HTTP/Browser Routing

```javascript
import { HybridFetcher, CrawlContext } from 's3db.js';

const context = new CrawlContext({ userAgent: 'MyBot/1.0' });
const fetcher = new HybridFetcher({ context, strategy: 'auto' });

// Auto: tries HTTP first, falls back to puppeteer for SPAs
const { html, method } = await fetcher.fetch('https://example.com');
console.log(`Fetched with ${method}`); // 'http' or 'puppeteer'

// Force specific strategy
const fetcher2 = new HybridFetcher({ strategy: 'recker-only' });  // HTTP only
const fetcher3 = new HybridFetcher({ strategy: 'puppeteer-only' }); // Browser only

// Cleanup
await fetcher.close();
```

### JavaScript Detection

HybridFetcher auto-detects SPAs via patterns:
- Next.js: `__NEXT_DATA__`
- React: Empty `<div id="root"></div>`
- Angular: `ng-app`, `ng-controller`
- Vue: `v-cloak`, `v-if`, `v-for`
- Nuxt: `__NUXT__`
- Loading spinners, noscript warnings

### Spider Plugin Integration

```javascript
import { RobotsParser, SitemapParser, DeepDiscovery, CrawlContext } from 's3db.js';

// Share context across all spider components
const context = new CrawlContext({ userAgent: 's3db-spider' });

const robots = new RobotsParser({ context });
const sitemap = new SitemapParser({ context });
const discovery = new DeepDiscovery({ context });

// All share cookies, headers, session state
await robots.isAllowed('https://example.com/page');
await sitemap.parse('https://example.com/sitemap.xml');
```

## Constraints

- **S3**: 2KB metadata limit (use behaviors), no transactions, no indexes (use partitions)
- **Security**: `secret` fields auto-encrypted, credentials need URL encoding
- **patch()**: Falls back to update() for body behaviors

## Performance Tuning

### Multi-Plugin Optimization

When using multiple coordinator plugins (TTL, S3Queue, Scheduler), configure shared coordination:

```javascript
const db = new Database({
  connectionString: 's3://...',
  plugins: [TTLPlugin, S3QueuePlugin, SchedulerPlugin]
});

// All plugins share one GlobalCoordinatorService per namespace
const coordinator = await db.getGlobalCoordinator('default');
```

**Tuning Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `heartbeatInterval` | 10000ms | Time between heartbeat cycles |
| `heartbeatJitter` | 2000ms | Random delay to prevent thundering herd |
| `stateCacheTtl` | 2000ms | Cache state to reduce S3 GETs |

**Lazy Schema (v19.3+):**

```javascript
// Defer schema compilation until first CRUD operation
const resource = await db.createResource({
  name: 'users',
  attributes: { name: 'string' },
  lazySchema: true  // Schema compiled on first insert/get/query
});

// Explicit pre-warming for predictable latency
db.prewarmResources(['users', 'orders']);
```

## Troubleshooting

### MaxListenersExceededWarning

**Symptom:** `MaxListenersExceededWarning: Possible EventEmitter memory leak detected`

**Cause:** Multiple resources/plugins registering process signal handlers without cleanup.

**Solutions:**

1. **Ensure proper disconnect:**
```javascript
await db.disconnect();  // Cleans up all listeners
```

2. **For tests with many resources:**
```javascript
// Each resource with autoCleanup adds 3 listeners (SIGTERM, SIGINT, beforeExit)
// Disable if not needed:
const emitter = new SafeEventEmitter({ autoCleanup: false });
```

3. **Verify listener balance:**
```javascript
// After full connect/disconnect cycle, maxListeners should return to initial value
const initial = process.getMaxListeners();
await db.connect();
await db.disconnect();
console.log(process.getMaxListeners() === initial); // should be true
```

**Fixed in v19.3+:**
- SafeEventEmitter properly decrements in both `destroy()` and `removeSignalHandlers()`
- ApiServer tracks and removes signal handlers in `stop()`
- DatabaseConnection decrements on disconnect
- ProcessManager and CronManager decrement on cleanup

### Heartbeat Mutex Stall

**Symptom:** Coordinator plugins stop responding, no leader election.

**Cause:** S3 call hanging during heartbeat cycle.

**Solution (v19.3+):** Automatic mutex timeout recovery:
```javascript
// Mutex auto-expires after 2x (heartbeatInterval + jitter)
// Default: 2x (10000 + 2000) = 24000ms
// Warning logged when timeout occurs
```

### Excessive S3 API Calls

**Symptom:** High S3 costs, throttling errors.

**Causes & Solutions:**

1. **Worker deduplication (v19.3+):**
   - Plugins sharing same workerId only register once per heartbeat
   - Single PUT per unique workerId instead of N+1

2. **State caching:**
```javascript
// Reduce GETs by caching coordinator state
const coordinator = new GlobalCoordinatorService({
  config: { stateCacheTtl: 5000 }  // Cache for 5s
});
```

3. **Heartbeat interval tuning:**
```javascript
// Increase interval for less critical plugins
config: { heartbeatInterval: 30000 }  // 30s instead of 10s
```

## Documentation

- **Plugin Docs Standard:** `docs/plugin-docs-standard.md`
- **Testing Guide:** `docs/testing.md`
- **AWS Costs:** `docs/aws/`
- **Benchmarks:** `docs/benchmarks/`
- **Plugin Guides:** `docs/plugins/`
