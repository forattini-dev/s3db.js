# Tasks: Add Hybrid Spider with Shared Context

## 1. CrawlContext Implementation

- [x] 1.1 Create `src/plugins/spider/crawl-context.js`
- [x] 1.2 Implement cookie storage with domain-based Map
- [x] 1.3 Implement `setCookies()` with source tracking
- [x] 1.4 Implement `setCookiesFromHeader()` - parse Set-Cookie headers
- [x] 1.5 Implement `getCookieHeader()` - format for HTTP requests
- [x] 1.6 Implement `getCookiesForPuppeteer()` - format for puppeteer
- [x] 1.7 Implement `importFromPuppeteer()` - sync from page.cookies()
- [x] 1.8 Implement `exportToPuppeteer()` - inject via page.setCookie()
- [x] 1.9 Implement `getHttpClientConfig()` - config for createHttpClient
- [x] 1.10 Implement `getLaunchConfig()` - config for puppeteer.launch()
- [x] 1.11 Implement `configurePage()` - setup puppeteer page with context
- [x] 1.12 Implement `processResponse()` - extract cookies from HTTP response
- [x] 1.13 Implement `toJSON()` / `fromJSON()` for session persistence
- [x] 1.14 Add JSDoc documentation

## 2. HybridFetcher Implementation

- [x] 2.1 Create `src/plugins/spider/hybrid-fetcher.js`
- [x] 2.2 Implement constructor with CrawlContext dependency
- [x] 2.3 Implement `_getHttpClient()` with lazy initialization
- [x] 2.4 Implement `_getBrowser()` with lazy initialization
- [x] 2.5 Implement `_needsJavaScript()` detection heuristics
- [x] 2.6 Implement `fetchWithRecker()` with cookie sync
- [x] 2.7 Implement `fetchWithPuppeteer()` with cookie sync
- [x] 2.8 Implement `fetch()` smart routing (auto mode)
- [x] 2.9 Implement strategy modes: 'auto', 'recker-only', 'puppeteer-only'
- [x] 2.10 Implement `close()` for cleanup
- [x] 2.11 Add JSDoc documentation

## 3. Spider Plugin Integration

- [x] 3.1 Update `src/plugins/index.js` to export new classes
- [x] 3.2 Add optional `context` parameter to DeepDiscovery
- [x] 3.3 Add optional `context` parameter to SitemapParser
- [x] 3.4 Add optional `context` parameter to RobotsParser
- [x] 3.5 Update `_getHttpClient()` methods to use context when provided

## 4. Cookie Parsing

- [x] 4.1 Implement `_parseSetCookie()` for Set-Cookie header parsing
- [x] 4.2 Handle multiple Set-Cookie headers (array format)
- [x] 4.3 Parse cookie attributes: domain, path, expires, max-age, secure, httpOnly, sameSite
- [x] 4.4 Handle edge cases: malformed cookies, missing values

## 5. Anti-Detection Features

- [x] 5.1 Implement consistent User-Agent across clients
- [x] 5.2 Implement viewport/screen consistency
- [x] 5.3 Implement timezone emulation
- [x] 5.4 Implement navigator property overrides
- [ ] 5.5 Integrate with existing `stealth-manager.js` (optional)

## 6. Testing

- [x] 6.1 Create `tests/plugins/spider/crawl-context.test.js`
- [x] 6.2 Test cookie parsing from Set-Cookie headers
- [x] 6.3 Test cookie formatting for HTTP requests
- [x] 6.4 Test cookie sync with puppeteer format
- [x] 6.5 Test session serialization/deserialization
- [x] 6.6 Create `tests/plugins/spider/hybrid-fetcher.test.js`
- [x] 6.7 Test JavaScript detection heuristics
- [x] 6.8 Test strategy modes (auto, recker-only, puppeteer-only)
- [x] 6.9 Test cookie synchronization between clients
- [ ] 6.10 Integration test with real website (optional, manual)

## 7. Documentation

- [x] 7.1 Update CLAUDE.md with HybridFetcher section
- [x] 7.2 Add usage examples to spider plugin docs
- [x] 7.3 Document CrawlContext API
- [x] 7.4 Document session persistence pattern
- [ ] 7.5 Add troubleshooting guide for cookie issues

## 8. Validation

- [x] 8.1 Run full test suite
- [x] 8.2 Verify build succeeds
- [ ] 8.3 Test with puppeteer installed
- [ ] 8.4 Test without puppeteer (recker-only fallback)
- [ ] 8.5 Test session persistence across restarts
