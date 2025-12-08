# Change: Integrate Recker as HTTP Client

## Why

s3db.js currently uses native `fetch` with manual retry logic, authentication handling, and error management scattered across 77+ files. This leads to:

1. **Code duplication**: Each plugin implements its own retry logic (WebhookReplicator: 85 lines, Spider plugins: similar patterns)
2. **Inconsistent error handling**: Some plugins retry on 429, others don't; Retry-After header often ignored
3. **Missing resilience patterns**: No circuit breaker, no rate limiting, no connection pooling
4. **Manual auth boilerplate**: Bearer, Basic, API Key auth implemented per-plugin

Recker (our internal HTTP client at `../recker`) provides all these features out-of-the-box with a clean API.

## What Changes

### Core Changes
- Add `recker` as peer dependency (optional, lazy-loaded)
- Create shared `src/concerns/http-client.js` wrapper with fallback to native fetch
- Standardize HTTP configuration across plugins

### Plugin Updates
- **WebhookReplicator**: Replace 85+ lines of retry logic with recker's built-in retry
- **Spider plugins**: Use `recker.scrape()` for simple HTML fetch, circuit breaker for rate limiting
- **SMTP Plugin**: Use `recker.dns()` for MX record lookups (cleaner API)
- **GlobalCoordinatorService**: Add circuit breaker pattern for S3 coordination calls

### Breaking Changes
- **BREAKING**: WebhookReplicator `retryConfig` option format changes (aligns with recker's format)

## Impact

### Affected Specs
- New capability: `http-client` (shared HTTP infrastructure)

### Affected Code
- `src/plugins/replicators/webhook-replicator.class.js` (major refactor)
- `src/plugins/spider/*.js` (5 files)
- `src/plugins/smtp.plugin.js` (minor)
- `src/plugins/concerns/global-coordinator-service.class.js` (circuit breaker)
- `src/concerns/http-client.js` (new file)

### Performance Expectations
- **Retry efficiency**: +30-50% (Retry-After header respect)
- **Connection reuse**: +20-40% throughput (connection pooling)
- **Failure isolation**: Circuit breaker prevents cascade failures

### Migration Path
1. Phase 1: Add wrapper, no breaking changes
2. Phase 2: Migrate plugins internally (transparent to users)
3. Phase 3: Deprecate old config format with warning
4. Phase 4: Remove old format (next major version)
