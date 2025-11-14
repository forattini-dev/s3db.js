# S3DB.js Backward Compatibility Audit Report

## Executive Summary

This report documents all remaining backward compatibility patterns in the s3db.js codebase. These patterns support older configurations or deprecated APIs while warning users about upcoming removal in v17.0.

Total patterns found: 14 major categories with 25+ specific implementations

---

## 1. API Plugin: Per-Driver Auth Config (DEPRECATED)

**Status**: Safe to keep until v17.0  
**Removal Target**: v17.0  
**Impact**: Medium - Affects API plugin users with legacy JWT/APIKey config

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/index.js:116-137`

### Pattern
```javascript
// Support legacy per-driver objects (DEPRECATED - jwt: {...}, apiKey: {...} → use driver array)
// This will be removed in v17.0
for (const driverName of AUTH_DRIVER_KEYS) {
  if (authOptions[driverName] === undefined) continue;
  const value = authOptions[driverName];
  if (!value || value.enabled === false) continue;
  
  if (this.database?.verbose) {
    console.warn(
      `[ApiPlugin] DEPRECATED: Using per-driver auth config (${driverName}: {...}) is deprecated. ` +
      `Use the driver array instead: driver: [{ driver: '${driverName}', ... }]. ` +
      `This will be removed in v17.0.`
    );
  }
  // Map old config to new format
  addDriver(driverName, config);
}
```

### Old Config Format
```javascript
// DEPRECATED (v16.x)
{
  jwt: { secret: '...', issuer: '...' },
  apiKey: { headerName: 'x-api-key' }
}
```

### New Config Format
```javascript
// RECOMMENDED (v16.2+)
{
  driver: [
    { driver: 'jwt', secret: '...', issuer: '...' },
    { driver: 'api-key', headerName: 'x-api-key' }
  ]
}
```

### Assessment
**Safe to remove** - Has deprecation warning, clear migration path exists in code comments

---

## 2. API Plugin: Legacy pathAuth Configuration

**Status**: Safe to keep until v17.0  
**Removal Target**: v17.0  
**Impact**: Low-Medium - Affects path-based auth users

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/auth/strategies/path-based-strategy.class.js:17-21`

### Pattern
```javascript
export class PathBasedAuthStrategy extends BaseAuthStrategy {
  constructor({ drivers, authResource, oidcMiddleware, pathAuth, verbose }) {
    super({ drivers, authResource, oidcMiddleware, verbose });
    this.pathAuth = pathAuth;

    console.warn(
      '[ApiPlugin] DEPRECATED: The pathAuth configuration is deprecated. ' +
      'Use pathRules instead: { pathRules: [{ path: "/...", drivers: [...], required: true }] }. ' +
      'This will be removed in v17.0.'
    );
  }
```

### Old Config Format
```javascript
// DEPRECATED
{
  pathAuth: {
    '/api/admin': { drivers: ['jwt'], required: true },
    '/api/public': { drivers: [], required: false }
  }
}
```

### New Config Format
```javascript
// RECOMMENDED
{
  pathRules: [
    { path: '/api/admin', drivers: ['jwt'], required: true },
    { path: '/api/public', drivers: [], required: false }
  ]
}
```

### Assessment
**Safe to remove** - Has deprecation warning, new implementation in `pathRules`

---

## 3. API Plugin: Legacy CSP Configuration (csp.enabled)

**Status**: Needs assessment  
**Removal Target**: Unknown (mentioned as DEPRECATED)  
**Impact**: Low - CSP config

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/index.js:374-379, 690, 1240-1244`

### Pattern
```javascript
// Legacy CSP config (DEPRECATED - use security.contentSecurityPolicy)
csp: {
  enabled: options.csp?.enabled || false,
  directives: options.csp?.directives || {},
  reportOnly: options.csp?.reportOnly || false,
  reportUri: options.csp?.reportUri || null
},

// Later in security headers middleware (line 1240)
const cspConfig = this.config.csp.enabled
  ? this.config.csp
  : security.contentSecurityPolicy;
```

### Old Config Format
```javascript
{
  csp: {
    enabled: true,
    directives: { 'default-src': ["'self'"] }
  }
}
```

### New Config Format
```javascript
{
  security: {
    contentSecurityPolicy: {
      enabled: true,
      directives: { 'default-src': ["'self'"] }
    }
  }
}
```

### Assessment
**Needs deprecation warning** - No explicit v17.0 removal notice, needs to be added

---

## 4. Identity Plugin: "logo" Field Deprecation

**Status**: Safe to keep until v17.0  
**Removal Target**: v17.0  
**Impact**: Low - UI configuration

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/identity/index.js:185-194`

### Pattern
```javascript
logo: (() => {
  if (options.ui?.logo) {
    console.warn(
      '[IdentityPlugin] DEPRECATED: The "logo" field is deprecated. ' +
      'Use "logoUrl" instead: { ui: { logoUrl: "..." } }. ' +
      'This will be removed in v17.0.'
    );
  }
  return options.ui?.logo || null;
})(),
```

### Old Config Format
```javascript
{ ui: { logo: 'data:image/...' } }
```

### New Config Format
```javascript
{ ui: { logoUrl: 'https://...' } }
```

### Assessment
**Safe to remove** - Has deprecation warning, clear migration path

---

## 5. Puppeteer Plugin: Legacy Proxy Config (DEPRECATED)

**Status**: Safe to keep until v17.0  
**Removal Target**: v17.0  
**Impact**: Low-Medium - Advanced configuration

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/puppeteer.plugin.js:327-333`

### Pattern
```javascript
// Deprecation warning for legacy single proxy config
if (options.proxy?.server || options.proxy?.username || options.proxy?.password) {
  console.warn(
    '[PuppeteerPlugin] DEPRECATED: The single proxy config (server, username, password) is deprecated. ' +
    'Use the proxy.list array with proxy objects instead. Example: proxy: { list: [{ proxy: "http://host:port", username: "user", password: "pass" }] }. ' +
    'This will be removed in v17.0.'
  );
}
```

### Old Config Format
```javascript
{
  proxy: {
    server: 'http://proxy.example.com:8080',
    username: 'user',
    password: 'pass'
  }
}
```

### New Config Format
```javascript
{
  proxy: {
    list: [
      {
        proxy: 'http://proxy.example.com:8080',
        username: 'user',
        password: 'pass'
      }
    ]
  }
}
```

### Assessment
**Safe to remove** - Has deprecation warning, clear migration path

---

## 6. Backup Plugin: requireAll Strategy (DEPRECATED)

**Status**: Safe to keep until v17.0  
**Removal Target**: v17.0  
**Impact**: Low - Multi-backup strategy

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/backup/multi-backup-driver.class.js:80-90`

### Pattern
```javascript
// Legacy support for requireAll (DEPRECATED)
if (this.config.requireAll !== undefined) {
  console.warn(
    '[MultiBackupDriver] DEPRECATED: The "requireAll" option is deprecated. ' +
    'Use "strategy" instead: strategy: "any" (instead of requireAll: false) or strategy: "all" (instead of requireAll: true). ' +
    'This will be removed in v17.0.'
  );
  if (this.config.requireAll === false) {
    this.config.strategy = 'any';
  }
}
```

### Old Config Format
```javascript
{ requireAll: true | false }
```

### New Config Format
```javascript
{ strategy: 'all' | 'any' | 'priority' }
```

### Assessment
**Safe to remove** - Has deprecation warning with auto-conversion logic

---

## 7. Metrics Plugin: Legacy resources Option (Backward Compat)

**Status**: Needs assessment  
**Removal Target**: Unknown  
**Impact**: Low - Resource naming

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/metrics.plugin.js:599-604`

### Pattern
```javascript
const resourceNamesOption = resourceNames || {};
const legacyResourceOption = resources || {};
const resourceOverrides = {
  metrics: resourceNamesOption.metrics ?? legacyResourceOption.metrics,
  errors: resourceNamesOption.errors ?? legacyResourceOption.errors,
  performance: resourceNamesOption.performance ?? legacyResourceOption.performance
};
```

### Old Config Format
```javascript
{
  resources: {
    metrics: 'custom_metrics',
    errors: 'custom_errors',
    performance: 'custom_perf'
  }
}
```

### New Config Format
```javascript
{
  resourceNames: {
    metrics: 'custom_metrics',
    errors: 'custom_errors',
    performance: 'custom_perf'
  }
}
```

### Assessment
**Needs deprecation warning** - No explicit deprecation notice, should add console.warn

---

## 8. Database: Internal Alias - this.plugins -> this.pluginRegistry

**Status**: Internal utility  
**Removal Target**: Not planned  
**Impact**: High if removed (internal usage only)

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/database.class.js:97-98`

### Pattern
```javascript
this.pluginRegistry = {};
this.plugins = this.pluginRegistry; // Internal alias for plugin registry
```

### Usage Notes
- **Not for external use** - Both properties point to same object
- Safe to keep indefinitely (internal implementation detail)
- Used in: `this.plugins[pluginName]` in one location (line 888)
- Could be refactored but low priority

### Assessment
**Keep as-is** - Internal implementation detail, not user-facing API

---

## 9. Database: Internal Alias - this.taskExecutor -> this.operationsPool

**Status**: Internal alias  
**Removal Target**: Not planned  
**Impact**: Medium (internal usage)

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/database.class.js:95`

### Pattern
```javascript
this.operationsPool = this._normalizeOperationsPool(options.operationsPool, this._parallelism);
this._parallelism = this.operationsPool?.concurrency ?? this._parallelism;
this.taskExecutor = this.operationsPool; // Alias for backward compatibility
```

### Usage Notes
- Both properties reference the same OperationsPool instance
- Used in plugins via: `database.taskExecutor`
- Could be exposed in public API through plugin context

### Assessment
**Keep as-is** - Useful alias, low cost to maintain

---

## 10. Database: Proxy for db.resources Property Access

**Status**: Backward compat enhancement  
**Removal Target**: Not planned  
**Impact**: High (user-facing API)

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/database.class.js:55-80`

### Pattern
```javascript
// Create Proxy for resources to enable property access (db.resources.users)
this._resourcesMap = {};
this.resources = new Proxy(this._resourcesMap, {
  get: (target, prop) => {
    if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') {
      return target[prop];
    }
    if (target[prop]) {
      return target[prop];
    }
    return undefined; // Enables optional chaining
  },
  ownKeys: (target) => Object.keys(target),
  getOwnPropertyDescriptor: (target, prop) => Object.getOwnPropertyDescriptor(target, prop)
});
```

### Usage
```javascript
// This works:
const user = db.resources.users;
// Also works:
const user = db.resources['users'];
// Also works:
const user = await db.getResource('users');
```

### Assessment
**Keep as-is** - Provides excellent DX, no deprecation planned

---

## 11. Schema: Legacy Attribute Import Pattern

**Status**: Internal utility  
**Removal Target**: Unknown  
**Impact**: Low - Internal schema parsing

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/schema.class.js:1047-1058`

### Pattern
```javascript
/**
 * Recursively import attributes, parsing only stringified objects (legacy)
 */
static _importAttributes(attrs) {
  if (typeof attrs === 'string') {
    // Try to detect if it's an object serialized as JSON string
    const [ok, err, parsed] = tryFnSync(() => JSON.parse(attrs));
    if (ok && typeof parsed === 'object' && parsed !== null) {
      const [okNested, errNested, nested] = tryFnSync(() => Schema._importAttributes(parsed));
      if (!okNested) throw new SchemaError('Failed to parse nested schema attribute', { original: errNested, input: attrs });
      return nested;
    }
    return attrs;
  }
  // ... rest of logic
}
```

### Purpose
Handles stringified attribute objects from older serialization formats

### Assessment
**Keep as-is** - Internal utility for schema migration, minimal cost

---

## 12. API Plugin: Legacy Context Handler Support

**Status**: Backward compat enhancement  
**Removal Target**: Unknown  
**Impact**: Medium - Route handlers

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/server.js` (based on examples)

### Pattern
```javascript
// Legacy handler (backward compatibility) - handler with only (c) param
const handler = (c) => {
  return c.json({ message: 'Legacy handler' });
};

// New handler - handler with (c, context, enhancedContext) params
const handler = (c, context, enhancedContext) => {
  return c.json({ message: 'Enhanced handler', user: enhancedContext.user });
};
```

### Usage Notes
- Both parameter styles supported simultaneously
- Detects number of parameters via `handler.length`
- Ensures backward compatibility with existing routes

### Assessment
**Keep as-is** - Excellent backward compatibility pattern, enable smooth migrations

---

## 13. OIDC Auth: fallbackIdClaims Pattern

**Status**: Runtime fallback  
**Removal Target**: Not planned  
**Impact**: Low - OIDC functionality

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/auth/providers.js:30-31`
- File: `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/auth/oidc-auth.js:195-203`

### Pattern
```javascript
// Auto-initialize fallback if not set (defaults: preferred_username → upn → sub)
if (!config.fallbackIdClaims) {
  config.fallbackIdClaims = ['preferred_username', 'upn', 'sub'];
}

// Usage in extracting user ID from token claims
for (const field of fallbackIdClaims) {
  if (token.claims[field]) {
    return token.claims[field];
  }
}
```

### Purpose
Graceful degradation when preferred ID claims not available

### Assessment
**Keep as-is** - Essential for OIDC provider compatibility

---

## 14. Behaviors: Plugin Map Storage (Forward Compat)

**Status**: Internal compatibility mechanism  
**Removal Target**: Not planned  
**Impact**: Medium - Plugin management

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/behaviors/body-overflow.js:93`
- File: `/home/ff/work/martech/shortner/s3db.js/src/behaviors/body-only.js:63, 85`
- File: `/home/ff/work/martech/shortner/s3db.js/src/behaviors/user-managed.js:93`

### Pattern
```javascript
// Always include plugin map for backwards compatibility when plugins are added/removed
// Store pluginMap for backwards compatibility when plugins are added/removed
metadata.pluginMap = pluginMap;
```

### Purpose
Preserves plugin metadata structure even when plugins change, enabling safe plugin add/remove

### Assessment
**Keep as-is** - Essential for plugin lifecycle management

---

## 15. Database: No Flat Config Support

**Status**: Already removed, documented  
**Removal Target**: Already removed  
**Impact**: High if anyone was using flat config

### Location
- File: `/home/ff/work/martech/shortner/s3db.js/src/database.class.js:162`

### Comment
```javascript
// (No backward compatibility with flat config)
```

### Meaning
v16+ removed flat config structure. Users must use nested `operationsPool` object.

### Old (Not Supported)
```javascript
new Database({
  connectionString: '...',
  concurrency: 100,        // ❌ OLD - not supported
  retries: 3               // ❌ OLD - not supported
})
```

### New (Required)
```javascript
new Database({
  connectionString: '...',
  operationsPool: {         // ✅ NEW - required
    concurrency: 100,
    retries: 3
  }
})
```

### Assessment
**Complete** - Already fully removed, users must migrate

---

## Summary by Category

### Will be Removed in v17.0 (5 patterns)
1. Per-driver auth config (jwt: {...}, apiKey: {...})
2. pathAuth configuration
3. Puppeteer single proxy config
4. Backup requireAll option
5. Identity plugin "logo" field

### Needs Deprecation Warning (2 patterns)
1. Legacy CSP config (csp.enabled)
2. Metrics legacy resources option

### Internal/Keep As-Is (6 patterns)
1. this.plugins alias
2. this.taskExecutor alias
3. db.resources proxy
4. Legacy attribute import
5. Plugin map storage
6. OIDC fallbackIdClaims

### Already Removed (1 pattern)
1. Flat config structure

---

## Recommendations

### Immediate Actions (v16.x)
1. Add deprecation warning to Legacy CSP config (line 374)
2. Add deprecation warning to Metrics legacy resources option (line 599)
3. Document removal timeline in CHANGELOG (already in code comments)

### v17.0 Planning
- Remove 5 deprecated patterns listed above
- Remove legacy CSP config support
- Remove metrics legacy resources option
- Audit external users before removal

### Safe to Keep Indefinitely
- Resource proxy (db.resources.users) - excellent DX
- taskExecutor alias - low cost
- Plugin map storage - essential for plugin management
- OIDC fallbackIdClaims - provider compatibility

---

## Files Modified/Reviewed
- `/home/ff/work/martech/shortner/s3db.js/src/database.class.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/index.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/auth/strategies/path-based-strategy.class.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/auth/oidc-auth.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/api/auth/providers.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/identity/index.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/puppeteer.plugin.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/backup/multi-backup-driver.class.js`
- `/home/ff/work/martech/shortner/s3db.js/src/plugins/metrics.plugin.js`
- `/home/ff/work/martech/shortner/s3db.js/src/schema.class.js`
- `/home/ff/work/martech/shortner/s3db.js/src/resource.class.js`
- `/home/ff/work/martech/shortner/s3db.js/src/behaviors/body-overflow.js`
- `/home/ff/work/martech/shortner/s3db.js/src/behaviors/body-only.js`
- `/home/ff/work/martech/shortner/s3db.js/src/behaviors/user-managed.js`

---

**Report Date**: November 14, 2025  
**Scope**: s3db.js/src directory  
**Total Patterns Identified**: 15 (5 v17.0 removals, 2 need warnings, 6 keep, 1 already removed, 1 comment-only)
