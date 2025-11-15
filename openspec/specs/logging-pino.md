# Logging Overhaul: Adopt Pino + pino-http

## Summary
Instrument the entire stack with a centralized logger built on [`pino`](https://github.com/pinojs/pino) and [`pino-http`](https://github.com/pinojs/pino-http). This replaces ad-hoc `console.log` usage, standardizes metadata, and makes structured logs available to both the CLI and the API plugin.

## Motivation
- Today logs are scattered (`console.log`, plugin-specific emitters) and hard to aggregate.
- We lack consistent JSON output or request context, so shipping logs to ELK/DataDog/Splunk is painful.
- Pino gives predictable, low-overhead structured logging and integrates well with Hono via `pino-http`.
- Once centralized we can add correlation IDs across Database → Resources → Plugins → API.

## Goals & Non-Goals
### Goals
- Provide a global logger instance accessible from Database, Resources, and plugins.
- Uniform JSON log format with level, timestamp, namespace (plugin/db/resource) and optional metadata.
- HTTP request logging (method/path/status/latency) via `pino-http` in the API plugin.
- Configuration surface: log level, prettifier (for dev), destination stream/custom transport.
- Maintain low overhead; avoid blocking the event loop.

### Non-Goals
- Full observability suite (metrics/tracing already handled elsewhere).
- Backport every existing `console.log` — we’ll migrate incrementally, prioritizing core paths.

## Technical Proposal
1. **Install deps**
   ```bash
   pnpm add pino pino-http
   ```
2. **Core Logger Factory** (`src/concerns/logger.js`)
   - Export `createLogger(options)` returning a pino instance with sensible defaults.
   - Options: `level`, `name`, `transport`, `bindings`.
   - Provide `getGlobalLogger()` used by Database if user doesn’t supply a custom logger.
3. **Database Integration**
   - New option `logger` (custom pino instance) or `loggerOptions` (config passed to factory).
   - Database stores logger on `this.logger` and exposes `db.logger.child({ namespace: 'ResourceName' })` helper.
4. **Resource & Plugin Usage**
   - Base `Plugin` gains `this.logger` (child of DB logger with plugin name).
   - Resources get a child logger tagged with `resource` and operations (insert/update/etc.).
5. **API Plugin (Hono)**
   - Integrate `pino-http` middleware for inbound requests.
   - Include request IDs (reuse existing correlation ID if present; otherwise generate).
   - Expose helper to log from handlers: `ctx.get('logger')` returns the per-request logger.
6. **CLI**
   - Replace bare `console.log/error` with the shared logger; defaults to pretty output when `process.stdout.isTTY`.
7. **Configuration Surface**
   ```js
   const db = new Database({
     connectionString: '...',
     loggerOptions: {
       level: 'info',
       transport: process.env.NODE_ENV === 'development'
         ? { target: 'pino-pretty', options: { colorize: true } }
         : undefined
     }
   })
   ```
   - Allow overriding via env vars (`S3DB_LOG_LEVEL`, `S3DB_LOG_PRETTY=true`).
8. **Migration Plan**
   - Phase 1: Database core + API plugin + CLI.
   - Phase 2: High-verbosity plugins (S3Queue, Scheduler, Replicator).
   - Phase 3: Remaining modules (Cache, TTL, etc.).

## Alternatives Considered
- **Winston**: heavier, slower, more config surface; we prefer pino’s performance and ecosystem.
- **Bunyan**: effectively superseded by pino (same author).
- **Keep console.log**: unacceptable for structured logging/aggregation.

## Open Questions
- Do we expose a streaming hook for external log collectors (e.g., allow piping to OpenTelemetry)?
- Should logger configuration be part of plugin options (e.g., API plugin customizing `pino-http` separately)?
- How do we handle secrets in logs (need a redact list).

## Risks / Mitigations
- **Performance impact**: Pino is among the fastest loggers; we’ll default to async logging and expose level controls.
- **Noise**: Provide per-plugin log level overrides so verbose modules (scheduler) can be dialed down.
- **Backward compatibility**: Maintain console output for users who never configure the logger by defaulting to pino’s standard stream (which still writes to stdout).

## Acceptance Criteria
- Global logger available via `db.logger`; child loggers used by Resources/Plugins.
- API plugin emits structured HTTP access logs with `pino-http`.
- README documents new config (`logger` / `loggerOptions`).
- Tests cover logger factory and ensure the default logger is created when not provided.
