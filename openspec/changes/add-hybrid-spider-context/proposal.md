# Change: Add Hybrid Spider with Shared Context

## Why

The spider plugin currently uses recker (HTTP client) and puppeteer (browser automation) separately, without sharing session state. This causes:

1. **Session inconsistency**: Cookies obtained via recker aren't available in puppeteer and vice-versa
2. **Detection risk**: Different User-Agents and fingerprints between HTTP and browser requests trigger bot detection
3. **Wasted resources**: No smart routing - puppeteer is used even for static pages that recker could handle faster
4. **Authentication duplication**: Login must be performed separately for each client

## What Changes

- **NEW**: `CrawlContext` class - Shared session state between recker and puppeteer
  - Cookie synchronization (bidirectional)
  - Unified User-Agent, headers, proxy settings
  - Viewport, timezone, locale consistency
  - Session serialization for persistence

- **NEW**: `HybridFetcher` class - Smart routing between recker and puppeteer
  - Auto-detection of JavaScript-heavy pages (SPAs)
  - Pre-flight checks to avoid unnecessary browser instances
  - Fallback strategy: recker first, puppeteer if needed

- **MODIFIED**: Spider plugins can optionally use shared context
  - `DeepDiscovery` - uses HybridFetcher for discovery
  - `SitemapParser` - uses shared context for authenticated sitemaps
  - `RobotsParser` - uses shared context for consistency

## Impact

- Affected specs: `spider` (new capability)
- Affected code:
  - `src/plugins/spider/crawl-context.js` (new)
  - `src/plugins/spider/hybrid-fetcher.js` (new)
  - `src/plugins/spider/deep-discovery.js` (optional integration)
  - `src/plugins/spider/sitemap-parser.js` (optional integration)
  - `src/plugins/spider/robots-parser.js` (optional integration)

## Dependencies

- `recker` (optional, falls back to native fetch)
- `puppeteer` or `puppeteer-core` (optional, for browser automation)

## Compatibility

- Non-breaking: existing spider usage unchanged
- Opt-in: pass `context` option to enable shared state
- Graceful degradation: works without puppeteer (recker-only mode)
