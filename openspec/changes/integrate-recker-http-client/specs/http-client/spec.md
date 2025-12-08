## ADDED Requirements

### Requirement: HTTP Client Wrapper

The system SHALL provide a centralized HTTP client wrapper at `src/concerns/http-client.js` that abstracts HTTP operations with optional recker integration.

#### Scenario: Recker available
- **WHEN** recker package is installed
- **THEN** the wrapper SHALL use recker for HTTP requests
- **AND** all recker features (retry, circuit breaker, auth) SHALL be available

#### Scenario: Recker not available (fallback)
- **WHEN** recker package is NOT installed
- **THEN** the wrapper SHALL fallback to native fetch
- **AND** basic retry logic SHALL still work
- **AND** no error SHALL be thrown on import

#### Scenario: Lazy loading
- **WHEN** the http-client module is imported
- **THEN** recker SHALL NOT be loaded until first HTTP request
- **AND** import errors SHALL be caught and handled gracefully

### Requirement: Unified Retry Configuration

Plugins using HTTP SHALL support a standardized retry configuration format compatible with recker.

#### Scenario: Retry configuration format
- **WHEN** a plugin accepts retry configuration
- **THEN** it SHALL accept the format: `{ retry: { limit, delay, backoff, retryAfter } }`
- **AND** `retryAfter: true` SHALL respect the Retry-After header

#### Scenario: Retry-After header respect
- **WHEN** an HTTP response includes Retry-After header
- **AND** `retryAfter: true` is configured
- **THEN** the retry delay SHALL use the Retry-After value
- **AND** the original delay SHALL be ignored for that retry

#### Scenario: Exponential backoff
- **WHEN** `backoff: 'exponential'` is configured
- **THEN** retry delays SHALL double on each attempt
- **AND** jitter SHALL be applied to prevent thundering herd

### Requirement: Circuit Breaker Pattern

The system SHALL support circuit breaker pattern for HTTP operations to prevent cascade failures.

#### Scenario: Circuit opens after failures
- **WHEN** consecutive failures exceed threshold (default: 5)
- **THEN** the circuit SHALL open
- **AND** subsequent requests SHALL fail immediately without network call
- **AND** a CircuitOpenError SHALL be thrown

#### Scenario: Circuit half-opens after reset time
- **WHEN** circuit is open
- **AND** reset time elapses (default: 30 seconds)
- **THEN** circuit SHALL transition to half-open
- **AND** one request SHALL be allowed through

#### Scenario: Circuit closes on success
- **WHEN** circuit is half-open
- **AND** a request succeeds
- **THEN** circuit SHALL close
- **AND** normal operation SHALL resume

### Requirement: Authentication Methods

The HTTP client wrapper SHALL support common authentication methods.

#### Scenario: Bearer token authentication
- **WHEN** auth type is 'bearer'
- **THEN** Authorization header SHALL be set to `Bearer {token}`

#### Scenario: Basic authentication
- **WHEN** auth type is 'basic'
- **THEN** Authorization header SHALL be set to `Basic {base64(username:password)}`

#### Scenario: API key authentication
- **WHEN** auth type is 'apikey'
- **THEN** the specified header SHALL contain the API key
- **AND** default header name SHALL be 'X-API-Key'

### Requirement: WebhookReplicator Recker Integration

WebhookReplicator SHALL use the HTTP client wrapper for all outbound requests.

#### Scenario: Webhook delivery with retry
- **WHEN** webhook delivery fails with retryable status (429, 500-599)
- **THEN** delivery SHALL be retried according to retry configuration
- **AND** Retry-After header SHALL be respected if present

#### Scenario: Old config format deprecation
- **WHEN** old retry config format is used (`maxRetries`, `retryDelay`, `retryBackoff`)
- **THEN** a deprecation warning SHALL be logged
- **AND** the config SHALL be converted to new format internally
- **AND** functionality SHALL work unchanged

### Requirement: Spider HTTP Operations

Spider plugins SHALL use the HTTP client wrapper for web requests.

#### Scenario: Rate limiting with circuit breaker
- **WHEN** target server rate limits requests (429)
- **THEN** circuit breaker SHALL prevent request flooding
- **AND** crawler SHALL back off automatically

#### Scenario: Simple HTML fetch
- **WHEN** fetching static HTML pages
- **THEN** `scrape()` method SHALL be available if recker is installed
- **AND** fallback to standard fetch SHALL work without recker
