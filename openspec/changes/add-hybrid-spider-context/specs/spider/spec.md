## ADDED Requirements

### Requirement: Shared Crawl Context

The system SHALL provide a `CrawlContext` class that maintains session state shared between HTTP client (recker) and browser automation (puppeteer).

#### Scenario: Cookie synchronization from HTTP response
- **WHEN** an HTTP response contains Set-Cookie headers
- **THEN** the cookies SHALL be parsed and stored in the context
- **AND** the cookies SHALL be available for subsequent puppeteer navigation

#### Scenario: Cookie synchronization from puppeteer
- **WHEN** puppeteer navigates to a page that sets cookies
- **THEN** the cookies SHALL be extracted from the page
- **AND** the cookies SHALL be available for subsequent HTTP requests

#### Scenario: Consistent User-Agent
- **WHEN** a CrawlContext is configured with a User-Agent
- **THEN** both HTTP client and puppeteer SHALL use the same User-Agent
- **AND** the User-Agent SHALL be included in all requests

#### Scenario: Session persistence
- **WHEN** a CrawlContext is serialized via toJSON()
- **THEN** all session state (cookies, headers, settings) SHALL be captured
- **AND** the session SHALL be restorable via fromJSON()

---

### Requirement: Hybrid Fetcher

The system SHALL provide a `HybridFetcher` class that intelligently routes requests between HTTP client and puppeteer based on content requirements.

#### Scenario: Static page fetching
- **WHEN** fetching a page that does not require JavaScript
- **THEN** the system SHALL use the HTTP client (recker/fetch)
- **AND** the response SHALL include source indicator 'recker'

#### Scenario: SPA page fetching
- **WHEN** fetching a page that requires JavaScript rendering
- **THEN** the system SHALL use puppeteer for full rendering
- **AND** the response SHALL include source indicator 'puppeteer'

#### Scenario: Automatic JavaScript detection
- **WHEN** fetching a page in 'auto' mode
- **THEN** the system SHALL first attempt HTTP fetch
- **AND** if SPA patterns are detected, SHALL fallback to puppeteer
- **AND** SPA patterns include: empty root divs, framework markers (__NEXT_DATA__, __NUXT__, ng-app)

#### Scenario: Strategy modes
- **WHEN** HybridFetcher is configured with strategy 'recker-only'
- **THEN** only HTTP client SHALL be used
- **WHEN** configured with strategy 'puppeteer-only'
- **THEN** only puppeteer SHALL be used
- **WHEN** configured with strategy 'auto' (default)
- **THEN** smart routing SHALL be applied

---

### Requirement: Cookie Management

The system SHALL properly manage cookies across domains and respect cookie attributes.

#### Scenario: Domain-scoped cookies
- **WHEN** cookies are stored for a domain
- **THEN** they SHALL be sent only to matching domains and subdomains
- **AND** path restrictions SHALL be respected

#### Scenario: Secure cookie handling
- **WHEN** a cookie has the Secure attribute
- **THEN** it SHALL only be sent over HTTPS connections

#### Scenario: Cookie expiration
- **WHEN** a cookie has expired (via Expires or Max-Age)
- **THEN** it SHALL NOT be included in subsequent requests

#### Scenario: HttpOnly cookies
- **WHEN** a cookie has the HttpOnly attribute
- **THEN** it SHALL be stored and transmitted correctly
- **AND** it SHALL be available for both HTTP and puppeteer requests

---

### Requirement: Anti-Detection Consistency

The system SHALL maintain consistent browser fingerprint across HTTP client and puppeteer to reduce bot detection risk.

#### Scenario: Viewport consistency
- **WHEN** a CrawlContext is configured with viewport dimensions
- **THEN** puppeteer pages SHALL be configured with matching viewport
- **AND** screen dimensions SHALL be overridden to match

#### Scenario: Timezone consistency
- **WHEN** a CrawlContext is configured with a timezone
- **THEN** puppeteer pages SHALL emulate that timezone

#### Scenario: Proxy consistency
- **WHEN** a CrawlContext is configured with a proxy
- **THEN** both HTTP client and puppeteer SHALL route through the same proxy

---

### Requirement: Lazy Resource Initialization

The system SHALL initialize HTTP client and browser instances only when first needed.

#### Scenario: HTTP-only crawling
- **WHEN** only HTTP requests are made (no JavaScript pages)
- **THEN** puppeteer browser SHALL NOT be launched
- **AND** memory usage SHALL remain low

#### Scenario: First puppeteer request
- **WHEN** the first JavaScript-heavy page is encountered
- **THEN** puppeteer browser SHALL be launched on demand
- **AND** subsequent puppeteer requests SHALL reuse the browser instance

---

### Requirement: Graceful Degradation

The system SHALL operate correctly when optional dependencies are unavailable.

#### Scenario: Missing puppeteer
- **WHEN** puppeteer is not installed
- **AND** a JavaScript-heavy page is requested
- **THEN** the system SHALL return the unrendered HTML from HTTP client
- **AND** a warning SHALL be logged

#### Scenario: Missing recker
- **WHEN** recker is not installed
- **THEN** the system SHALL fall back to native fetch
- **AND** all features SHALL remain functional
