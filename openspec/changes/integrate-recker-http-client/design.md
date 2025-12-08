# Design: Recker HTTP Client Integration

## Context

s3db.js makes HTTP requests in several contexts:
1. **Webhook replication**: Send data changes to external endpoints
2. **Spider/crawling**: Fetch web pages, parse sitemaps, check robots.txt
3. **SMTP validation**: DNS lookups for MX records
4. **Coordinator health**: S3 API calls with retry needs

Currently, each plugin implements its own HTTP handling with native `fetch`, leading to ~500 lines of duplicated retry/auth/error code.

### Stakeholders
- Plugin developers (simplified HTTP API)
- End users (better reliability, clearer error messages)
- Ops teams (circuit breaker prevents cascade failures)

### Constraints
- Recker must remain optional (peer dependency)
- Fallback to native fetch must work for basic use cases
- No breaking changes in Phase 1-2

## Goals / Non-Goals

### Goals
- Centralize HTTP configuration and retry logic
- Provide consistent error handling across plugins
- Enable circuit breaker pattern for external dependencies
- Reduce code duplication by ~400 lines

### Non-Goals
- Replace S3 client HTTP handling (AWS SDK handles this)
- Force recker as required dependency
- Change public plugin APIs (except deprecated config format)

## Decisions

### Decision 1: Lazy-loaded Wrapper Pattern

**What**: Create `src/concerns/http-client.js` that lazy-loads recker or falls back to native fetch.

**Why**:
- Maintains s3db.js's philosophy of optional dependencies
- Allows gradual adoption
- Users without recker still get working plugins

**Implementation**:
```javascript
// src/concerns/http-client.js
let reckerClient = null;

export async function getHttpClient(options = {}) {
  if (!reckerClient) {
    try {
      const { Client } = await import('recker');
      reckerClient = new Client(options);
    } catch {
      // Fallback to minimal fetch wrapper
      reckerClient = createFetchFallback(options);
    }
  }
  return reckerClient;
}
```

### Decision 2: Circuit Breaker in GlobalCoordinatorService

**What**: Add circuit breaker for S3 coordination calls.

**Why**:
- Prevents thundering herd when S3 has issues
- Graceful degradation instead of cascading failures
- Recker provides this out-of-the-box

**Configuration**:
```javascript
{
  circuitBreaker: {
    threshold: 5,      // failures before opening
    resetTime: 30000,  // ms before half-open
    timeout: 10000     // request timeout
  }
}
```

### Decision 3: Unified Retry Configuration

**What**: Standardize retry config format across plugins using recker's format.

**Why**:
- Current format varies per plugin
- Recker's format is well-documented and battle-tested
- Reduces cognitive load for users

**Format**:
```javascript
// Old (WebhookReplicator-specific)
{
  maxRetries: 3,
  retryDelay: 1000,
  retryBackoff: 'exponential'
}

// New (recker-compatible)
{
  retry: {
    limit: 3,
    delay: 1000,
    backoff: 'exponential',
    retryAfter: true  // Respect Retry-After header
  }
}
```

### Decision 4: Spider Uses scrape() for Simple Cases

**What**: Use `recker.scrape()` for HTML fetching in Spider plugins.

**Why**:
- Single call for fetch + parse
- Built-in selector support
- Automatic encoding detection

**When NOT to use**:
- Complex JavaScript rendering (stick with puppeteer)
- Need full DOM manipulation

## Alternatives Considered

### Alternative 1: Make Recker Required
**Rejected**: Breaks s3db.js's optional dependency philosophy. Many users don't need HTTP features.

### Alternative 2: Use axios/got Instead
**Rejected**: We already have recker in the workspace. Adding another HTTP library creates confusion.

### Alternative 3: Keep Manual Implementations
**Rejected**: Technical debt grows. Current code has subtle bugs (e.g., not respecting Retry-After).

## Risks / Trade-offs

### Risk 1: Recker API Changes
**Mitigation**: Pin to specific recker version range in peerDependencies. Create adapter layer in wrapper.

### Risk 2: Fallback Doesn't Cover All Features
**Mitigation**: Document which features require recker. Fallback covers basic fetch/retry only.

### Risk 3: Breaking Change in WebhookReplicator
**Mitigation**:
- Phase 3 adds deprecation warning
- Support both formats during transition
- Clear migration guide in docs

## Migration Plan

### Phase 1: Foundation (Non-breaking)
1. Add `recker` to peerDependencies
2. Create `src/concerns/http-client.js` wrapper
3. Add tests for wrapper with/without recker

### Phase 2: Internal Migration (Non-breaking)
1. Update WebhookReplicator to use wrapper internally
2. Update Spider plugins to use wrapper
3. Update SMTP plugin DNS calls
4. Add circuit breaker to GlobalCoordinatorService

### Phase 3: Deprecation (Soft Breaking)
1. Log deprecation warning for old config format
2. Accept both old and new formats
3. Update documentation

### Phase 4: Removal (Major Version)
1. Remove old config format support
2. Update minimum recker version if needed

### Rollback
- Phase 1-2: Revert commits, no user impact
- Phase 3: Remove deprecation warnings
- Phase 4: Cannot rollback (major version)

## Open Questions

1. **Q**: Should circuit breaker state persist across restarts?
   **A**: No, in-memory is fine. Fresh start = clean state.

2. **Q**: What happens if recker has a vulnerability?
   **A**: Fallback to fetch works. Users can delay recker upgrade.

3. **Q**: Should we expose recker directly to users?
   **A**: No, keep it internal. Wrapper provides stable API.
