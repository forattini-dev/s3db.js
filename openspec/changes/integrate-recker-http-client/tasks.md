# Tasks: Integrate Recker HTTP Client

## 1. Foundation

- [x] 1.1 Add `recker` to peerDependencies in package.json
- [x] 1.2 Add `recker` to peerDependenciesMeta with `optional: true`
- [x] 1.3 Add `recker` to external array in rollup.config.js
- [x] 1.4 Create `src/concerns/http-client.js` wrapper module
- [x] 1.5 Implement lazy-loading pattern with fallback to native fetch
- [x] 1.6 Add JSDoc documentation for wrapper API
- [x] 1.7 Create `tests/core/concerns/http-client.test.js`
- [x] 1.8 Test wrapper with recker installed
- [x] 1.9 Test wrapper without recker (fallback mode)

## 2. WebhookReplicator Migration

- [x] 2.1 Read current implementation in `src/plugins/replicators/webhook-replicator.class.js`
- [x] 2.2 Create new `_getHttpClient()` method using http-client wrapper
- [x] 2.3 Add retry configuration adapter (old format -> recker format)
- [x] 2.4 Replace `_makeRequest()` implementation
- [x] 2.5 Add Retry-After header support
- [x] 2.6 Update authentication handling (bearer, basic, apikey)
- [x] 2.7 Remove ~85 lines of manual retry logic (now ~43 lines)
- [ ] 2.8 Update existing tests to use mock http-client
- [ ] 2.9 Add new tests for Retry-After behavior
- [ ] 2.10 Add deprecation warning for old config format (Phase 3)

## 3. Spider Plugins Migration

- [x] 3.1 N/A - `link-discoverer.js` doesn't use fetch directly
- [x] 3.2 Update `src/plugins/spider/robots-parser.js` to use wrapper
- [x] 3.3 Update `src/plugins/spider/sitemap-parser.js` to use wrapper
- [x] 3.4 N/A - `tech-detector.js` doesn't exist or doesn't use fetch
- [x] 3.5 Update `src/plugins/spider/deep-discovery.js` to use wrapper
- [ ] 3.6 Add `recker.scrape()` usage for simple HTML fetch cases
- [ ] 3.7 Add circuit breaker configuration for rate limiting
- [ ] 3.8 Update Spider plugin tests

## 4. API Auth Plugins Migration

- [x] 4.1 Update `src/plugins/api/auth/oidc-client.js` to use wrapper (3 fetch calls)
- [x] 4.2 Update `src/plugins/api/auth/oauth2-auth.js` to use wrapper (4 fetch calls)
- [x] 4.3 Update `src/plugins/api/auth/oidc-auth.js` to use wrapper (4 fetch calls)
- [x] 4.4 Update `src/plugins/api/concerns/oidc-par.js` to use wrapper (1 fetch call)
- [ ] 4.5 Update API auth plugin tests

## 5. Recon Plugin Stages Migration

- [x] 5.1 Update `src/plugins/recon/stages/asn-stage.js` to use wrapper (2 fetch calls)
- [x] 5.2 Update `src/plugins/recon/stages/subdomains-stage.js` to use wrapper (1 fetch call)
- [x] 5.3 Update `src/plugins/recon/stages/dnsdumpster-stage.js` to use wrapper (2 fetch calls)
- [x] 5.4 Update `src/plugins/recon/stages/osint-stage.js` to use wrapper (8+ fetch calls)
- [x] 5.5 Update `src/plugins/recon/stages/google-dorks-stage.js` to use wrapper (1 fetch call)
- [ ] 5.6 Update Recon plugin tests

## 6. SMTP Plugin Migration

- [x] 6.1 N/A - SMTP plugin uses connection managers and drivers, no fetch calls
- [x] 6.2 N/A - No DNS lookup via HTTP in SMTP plugin
- [x] 6.3 N/A - No changes needed

## 6.5 Cloud Inventory Drivers Migration

- [x] 6.5.1 Update `src/plugins/cloud-inventory/drivers/mongodb-atlas-driver.js` to use wrapper
- [x] 6.5.2 N/A - Other drivers use official SDKs (AWS, GCP, Azure, etc.)

## 7. GlobalCoordinatorService Enhancement

- [x] 7.1 Add circuit breaker support to `src/plugins/concerns/global-coordinator-service.class.js`
- [x] 7.2 Configure circuit breaker thresholds (5 failures, 30s reset)
- [x] 7.3 Add circuit breaker state to metrics
- [ ] 7.4 Add tests for circuit breaker behavior
- [x] 7.5 Document circuit breaker configuration in JSDoc

## 8. Documentation

- [x] 8.1 Update CLAUDE.md with http-client wrapper info
- [x] 8.2 Add migration guide for WebhookReplicator config change (updated docs/plugins/replicator/guides/configuration.md)
- [x] 8.3 Document circuit breaker configuration options (in CLAUDE.md and JSDoc)
- [x] 8.4 Update plugin documentation with recker integration notes (updated plugin list in CLAUDE.md)
- [x] 8.5 Add example showing recker configuration (in CLAUDE.md HTTP Client section)

## 9. Validation & Cleanup

- [x] 9.1 Run http-client test suite (21 tests pass)
- [x] 9.2 Verify build succeeds with migrations (confirmed)
- [x] 9.3 Verify build succeeds with recker installed
- [x] 9.4 Check bundle size impact (5.5MB CJS/ES bundles - no significant change)
- [x] 9.5 Remove any dead code from old implementations (none found - all modules properly migrated)
