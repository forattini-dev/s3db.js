# Recon Plugin - Refactoring Plan

**Current Status**: 2709 lines in single file
**Goal**: Modular structure with clear separation of concerns

---

## 🎯 Objectives

1. ✅ Split monolithic `recon.plugin.js` into logical modules
2. ✅ Remove API integration (no `getApiRoutes()`)
3. ✅ Improve maintainability and testability
4. ✅ Keep backwards compatibility

---

## 📁 Proposed Structure

```
src/plugins/recon/
├── index.js                          # Main plugin class (~300 lines)
│
├── config/
│   ├── defaults.js                   # DEFAULT_FEATURES, BEHAVIOR_PRESETS
│   └── resources.js                  # Resource schema definitions
│
├── managers/
│   ├── target-manager.js             # Target CRUD operations
│   ├── scheduler-manager.js          # Cron scheduling logic
│   ├── storage-manager.js            # Report persistence
│   └── dependency-manager.js         # Tool availability checks
│
├── stages/
│   ├── dns-stage.js                  # DNS enumeration
│   ├── certificate-stage.js          # TLS certificate inspection
│   ├── latency-stage.js              # Ping + Traceroute
│   ├── http-stage.js                 # HTTP header analysis
│   ├── ports-stage.js                # Port scanning (nmap, masscan)
│   ├── subdomains-stage.js           # Subdomain discovery
│   ├── web-discovery-stage.js        # Directory/endpoint fuzzing
│   ├── vulnerability-stage.js        # Vulnerability scanning
│   ├── fingerprint-stage.js          # Technology fingerprinting
│   ├── screenshot-stage.js           # Screenshot capture
│   └── osint-stage.js                # OSINT data gathering
│
├── concerns/
│   ├── command-runner.js             # CLI command execution
│   ├── target-normalizer.js          # Target URL parsing
│   ├── fingerprint-builder.js        # Fingerprint aggregation
│   ├── report-generator.js           # Client reports
│   └── diff-detector.js              # Change detection
│
└── recon.plugin.js                   # Backwards compatibility export
```

---

## 🔧 Module Breakdown

### `index.js` (Main Plugin)

**Responsibilities:**
- Plugin lifecycle (`onInstall`, `onStart`, `onStop`)
- Orchestrate managers and stages
- Event emission
- Configuration merging

**Exports:**
```javascript
export class ReconPlugin extends Plugin {
  constructor(options)

  // Lifecycle
  async onInstall()
  async onStart()
  async onStop()

  // Core API
  async runDiagnostics(target, options)
  async checkDependencies()

  // Target Management (delegates to TargetManager)
  async addTarget(target, options)
  async removeTarget(target)
  async updateTarget(target, updates)
  async listTargets(options)
  async getTarget(target)

  // Reports (delegates to ReportGenerator)
  async generateClientReport(target, options)
  async generateConsolidatedReport(target, options)
  async getRecentAlerts(target, options)
}
```

**Size**: ~300 lines

---

### `config/defaults.js`

**Exports:**
```javascript
export const DEFAULT_FEATURES = { ... };
export const BEHAVIOR_PRESETS = { passive, stealth, aggressive };
```

**Size**: ~120 lines
✅ **Created**: Already implemented

---

### `config/resources.js`

**Exports:**
```javascript
export const RESOURCE_DEFINITIONS = {
  targets: { ... },
  hosts: { ... },
  reports: { ... },
  diffs: { ... },
  stages: { ... },
  subdomains: { ... },
  paths: { ... }
};
```

**Size**: ~150 lines

---

### `managers/target-manager.js`

**Responsibilities:**
- CRUD operations for targets
- Target normalization
- Resource persistence

**Exports:**
```javascript
export class TargetManager {
  constructor(plugin)

  async add(target, options)
  async remove(target)
  async update(target, updates)
  async list(options)
  async get(target)
}
```

**Size**: ~200 lines

---

### `managers/scheduler-manager.js`

**Responsibilities:**
- Cron job management
- Scheduled sweeps
- Target iteration

**Exports:**
```javascript
export class SchedulerManager {
  constructor(plugin)

  async start()
  async stop()
  async triggerSweep(reason)
}
```

**Size**: ~150 lines

---

### `managers/storage-manager.js`

**Responsibilities:**
- Report persistence to PluginStorage
- Resource updates (hosts, reports, diffs, etc.)
- History pruning

**Exports:**
```javascript
export class StorageManager {
  constructor(plugin)

  async persistReport(target, report)
  async persistToResources(report)
  async pruneHistory(target, pruned)
  async loadLatestReport(hostId)
  async loadHostSummary(hostId, report)
}
```

**Size**: ~250 lines

---

### `managers/dependency-manager.js`

**Responsibilities:**
- Check tool availability
- Emit warnings
- Provide installation docs

**Exports:**
```javascript
export class DependencyManager {
  constructor(plugin)

  async checkAll()
  async checkTool(tool)
}
```

**Size**: ~100 lines

---

### `stages/*.js` (11 Stage Files)

Each stage file exports a class with a single `execute()` method:

**Example: `stages/dns-stage.js`**

```javascript
export class DnsStage {
  constructor(plugin)

  async execute(target) {
    return {
      status: 'ok',
      records: { ... },
      errors: { ... }
    };
  }
}
```

**Stages:**
1. `DnsStage` - DNS lookups (~80 lines)
2. `CertificateStage` - TLS certificate (~60 lines)
3. `LatencyStage` - Ping + Traceroute (~120 lines)
4. `HttpStage` - Curl headers (~80 lines)
5. `PortsStage` - Nmap + Masscan (~200 lines)
6. `SubdomainsStage` - Subdomain enum (~250 lines)
7. `WebDiscoveryStage` - Fuzzing (~180 lines)
8. `VulnerabilityStage` - Scanners (~150 lines)
9. `FingerprintStage` - Whatweb (~80 lines)
10. `ScreenshotStage` - Aquatone/EyeWitness (~100 lines)
11. `OsintStage` - theHarvester (~80 lines)

**Total**: ~1380 lines

---

### `concerns/command-runner.js`

**Exports:**
```javascript
export class CommandRunner {
  constructor()

  async isAvailable(command)
  async run(command, args, options)
}
```

**Size**: ~80 lines (already exists in plugin)

---

### `concerns/target-normalizer.js`

**Exports:**
```javascript
export function normalizeTarget(input) { ... }
export function normalizeTargetConfig(entry) { ... }
```

**Size**: ~50 lines

---

### `concerns/fingerprint-builder.js`

**Exports:**
```javascript
export function buildFingerprint(target, results) {
  return {
    target,
    primaryIp,
    cdn,
    server,
    technologies,
    openPorts,
    relatedHosts,
    subdomainCount,
    latencyMs
  };
}
```

**Size**: ~100 lines

---

### `concerns/report-generator.js`

**Exports:**
```javascript
export class ReportGenerator {
  constructor(plugin)

  async generateClientReport(target, options)
  async generateConsolidatedReport(target, options)
  buildMarkdownReport(data)
}
```

**Size**: ~300 lines

---

### `concerns/diff-detector.js`

**Exports:**
```javascript
export class DiffDetector {
  constructor(plugin)

  async computeDiffs(hostId, currentReport)
  async emitAlerts(hostId, report, diffs)
  async getRecentAlerts(hostId, options)
}
```

**Size**: ~150 lines

---

### `recon.plugin.js` (Root - Backwards Compatibility)

**Exports:**
```javascript
export { ReconPlugin } from './recon/index.js';
```

**Size**: ~5 lines

---

## 🔄 Migration Strategy

### Phase 1: Extract Concerns (Low Risk)
1. ✅ Create `config/defaults.js`
2. Create `config/resources.js`
3. Create `concerns/command-runner.js`
4. Create `concerns/target-normalizer.js`
5. Create `concerns/fingerprint-builder.js`

### Phase 2: Extract Managers (Medium Risk)
6. Create `managers/target-manager.js`
7. Create `managers/scheduler-manager.js`
8. Create `managers/storage-manager.js`
9. Create `managers/dependency-manager.js`

### Phase 3: Extract Stages (High Impact)
10. Create all 11 stage files
11. Update main plugin to use stage classes

### Phase 4: Finalize
12. Create `index.js` as new main plugin
13. Update `recon.plugin.js` to re-export from `index.js`
14. **Remove `getApiRoutes()` entirely**
15. Update all tests
16. Update documentation

---

## ⚠️ Breaking Changes

### Removed Features:
- ❌ `getApiRoutes()` method - **Plugin no longer provides API routes**
- ℹ️ Users who need API should implement routes manually or use a separate API layer

### Migration for API Users:

**Before:**
```javascript
import { ApiPlugin, ReconPlugin } from 's3db.js';

const reconPlugin = new ReconPlugin({ ... });
const apiPlugin = new ApiPlugin({
  routes: {
    ...reconPlugin.getApiRoutes()
  }
});
```

**After:**
```javascript
import { ApiPlugin, ReconPlugin } from 's3db.js';

const reconPlugin = new ReconPlugin({ ... });

// Users must implement their own API routes
const apiPlugin = new ApiPlugin({
  routes: {
    'POST /scan': async (c, ctx) => {
      const { target } = await ctx.body();
      const report = await reconPlugin.runDiagnostics(target);
      return ctx.success({ report });
    },
    'GET /targets': async (c, ctx) => {
      const targets = await reconPlugin.listTargets();
      return ctx.success({ targets });
    }
    // ... implement other routes as needed
  }
});
```

---

## ✅ Testing Strategy

1. **Unit Tests**: Each module tested independently
2. **Integration Tests**: Main plugin with real stages
3. **Backwards Compatibility**: Ensure existing code works
4. **Performance**: No regression in scan speed

---

## 📊 Size Comparison

| Module | Lines | % of Total |
|--------|-------|------------|
| **Before** | 2709 | 100% |
| **After** (sum): |  |  |
| index.js | 300 | 11% |
| config/ | 270 | 10% |
| managers/ | 700 | 26% |
| stages/ | 1380 | 51% |
| concerns/ | 580 | 21% |
| **Total** | **3230** | **119%** |

*Note: Total is higher due to added interfaces/comments, but each file is <250 lines*

---

## 🚀 Benefits

1. ✅ **Maintainability**: Each file <250 lines
2. ✅ **Testability**: Isolated unit tests per module
3. ✅ **Reusability**: Stages can be used independently
4. ✅ **Clarity**: Clear separation of concerns
5. ✅ **Performance**: No impact (same logic, different structure)
6. ✅ **Backwards Compatibility**: Existing code still works

---

## 📅 Implementation Timeline

- **Phase 1**: 2-3 hours
- **Phase 2**: 3-4 hours
- **Phase 3**: 4-6 hours
- **Phase 4**: 2-3 hours
- **Total**: ~12-16 hours

---

## 📝 Next Steps

1. Review and approve this refactoring plan
2. Create feature branch: `refactor/recon-modular-structure`
3. Implement Phase 1 (concerns)
4. Test and validate
5. Continue with remaining phases
6. Merge when all tests pass

---

**Status**: 🟡 Pending approval
**Priority**: Medium (improves maintainability, no urgent bugs)
