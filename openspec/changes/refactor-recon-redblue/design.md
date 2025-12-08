# Design: RedBlue Integration

## Context

The Recon plugin currently orchestrates ~30 external security tools through shell execution. Each tool has unique:
- Installation requirements (Go, Python, Ruby, system packages)
- Output formats (JSON, text, XML)
- Flag conventions
- Error handling patterns

RedBlue is a Rust binary that implements all reconnaissance capabilities natively using a kubectl-style CLI: `rb [domain] [resource] [verb] [target] [flags]`.

**Stakeholders**: Security researchers, pentesters, DevSecOps teams using s3db.js for recon automation.

## Goals / Non-Goals

**Goals:**
- Single binary dependency (`rb`) instead of ~30 tools
- Unified output parsing (JSON with consistent schema)
- Simplified stage implementations
- Faster execution (native Rust vs Python/Go tools)
- Cross-platform support (Linux, macOS, Windows)

**Non-Goals:**
- Modifying RedBlue itself (treat as external dependency)
- Supporting hybrid mode (old tools + redblue)
- Maintaining backward compatibility with per-tool `_individual` format
- Implementing screenshot/secrets stages if RedBlue doesn't support them yet

## Decisions

### 1. CLI Integration (not library/FFI)

**Decision**: Use RedBlue as CLI via CommandRunner, not as a Rust library.

**Rationale**:
- s3db.js is JavaScript; FFI adds complexity
- CLI provides natural process isolation
- Easier to update RedBlue independently
- JSON output is already structured

**Alternatives considered**:
- FFI via napi-rs: Too complex, tight coupling
- WASM: RedBlue uses native syscalls, not portable to WASM
- IPC/Socket: Overkill for command-response pattern

### 2. Output Parsing Strategy

**Decision**: Parse RedBlue's JSON output directly, remove `_individual` per-tool breakdown.

**Rationale**:
- RedBlue consolidates multiple sources internally
- No need to track which "tool" found each result
- Simpler output schema

**New output format**:
```javascript
{
  status: 'ok' | 'empty' | 'error',
  data: { /* stage-specific results */ },
  metadata: {
    command: 'rb recon domain subdomains example.com',
    duration_ms: 1234,
    timestamp: '2024-01-15T...'
  }
}
```

### 3. Stage Consolidation

**Decision**: Merge stages that map to the same RedBlue command.

| Merged Stages | RedBlue Command |
|---------------|-----------------|
| Certificate + TLS Audit | `rb web asset cert` |
| DNSDumpster + Subdomains | `rb recon domain subdomains` |
| ASN (dig + APIs) | `rb network host intel` |

**Rationale**: RedBlue already consolidates these internally.

### 4. Unavailable Features

**Decision**: Mark stages as `unavailable` if RedBlue doesn't support them yet.

Affected stages:
- `screenshot-stage.js` - RedBlue doesn't have screenshot capability yet
- `secrets-stage.js` - No gitleaks equivalent in RedBlue yet

**Approach**:
- Keep stage files but return `{ status: 'unavailable', reason: 'Pending RedBlue support' }`
- Track RedBlue issues/PRs for these features
- Re-enable when RedBlue adds support

### 5. Configuration Schema

**Decision**: Flatten configuration to match RedBlue's flag structure.

**Before (tool-specific)**:
```javascript
{
  subdomains: {
    amass: { enabled: true, timeout: 30000 },
    subfinder: { enabled: true, apiKeys: {...} },
    assetfinder: { enabled: false }
  }
}
```

**After (capability-focused)**:
```javascript
{
  subdomains: {
    enabled: true,
    threads: 20,
    recursive: false,
    timeout: 30000
  }
}
```

### 6. Error Handling

**Decision**: Map RedBlue exit codes and stderr to stage status.

| Exit Code | Status | Meaning |
|-----------|--------|---------|
| 0 | `ok` | Success with results |
| 0 (empty stdout) | `empty` | Success but no findings |
| 1 | `error` | Execution failed |
| 124/137 | `timeout` | Process killed |

### 7. DependencyManager Simplification

**Decision**: Check only for `rb` binary availability.

```javascript
// Before: 53 tools mapped
const toolMap = {
  'ports.nmap': 'nmap',
  'ports.masscan': 'masscan',
  // ... 51 more
}

// After: Single check
async checkDependencies() {
  const rbAvailable = await this.commandRunner.isAvailable('rb');
  if (!rbAvailable) {
    this.emit('recon:dependency-missing', {
      tool: 'rb',
      installGuide: 'cargo install redblue || Download from https://github.com/...'
    });
  }
  return rbAvailable;
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| RedBlue bugs affect all stages | Pin to stable version, test before upgrade |
| Missing features (screenshot, secrets) | Mark unavailable, track upstream |
| Different output format breaks existing reports | Migration script for historical data |
| Users attached to specific tools | Document feature parity, provide comparison |
| RedBlue not installed | Clear error message with install instructions |

## Migration Plan

### Phase 1: Preparation
1. Create feature parity matrix (current tools vs RedBlue)
2. Identify gaps (screenshot, secrets)
3. Write migration guide for users

### Phase 2: Implementation
1. Refactor CommandRunner for RedBlue output parsing
2. Update stages one by one (DNS → Subdomains → Ports → ...)
3. Simplify DependencyManager
4. Update configuration schema
5. Update tests

### Phase 3: Rollout
1. Release as major version (breaking change)
2. Deprecation warning in previous version
3. Migration script for existing configs

### Rollback
- Keep old stage implementations in `stages/_legacy/` for one major version
- Environment variable to force legacy mode: `S3DB_RECON_LEGACY=1`

## Open Questions

1. Should we vendor RedBlue binary or require user installation?
   - Leaning toward: Require installation (smaller package, user controls updates)

2. How to handle RedBlue version compatibility?
   - Option A: Require minimum version, check on init
   - Option B: Feature detection at runtime

3. Should screenshot stage use external tool as fallback?
   - Leaning toward: No, keep single-dependency philosophy
