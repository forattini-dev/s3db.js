# Example Catalog

Use this catalog to discover which example script matches a particular scenario. Docsify search indexes every
file name and the highlighted keywords below, so you can type "replicator", "Keycloak" or "multi-tier cache"
and immediately jump to the right asset.

Need scenario-centric guidance? Read [use-cases.md](./use-cases.md). Looking for category overviews? Start with
[README.md](./README.md).

## Utility scripts & folders
- `api-plugin-new-features.js` - Demonstrates the OpenGraph helper, notification/attempt state machines and the
  Pug template engine packaged inside the API Plugin so you can prototype social cards and workflows quickly.
- `database.js` - Shared helper used by several samples to spin up a fake S3 bucket, register plugins, and tear
  down resources between runs.
- `generate-types-example.js` - Shows how to emit TypeScript definitions directly from resource metadata so
  clients get autocomplete and compile-time safety.
- `tsconfig.example.json` - A ready-to-copy compiler configuration with the module resolution and decorators that
  mirror our build setup.
- `typescript-usage-example.ts` - TypeScript end-to-end example consuming the generated types, async clients,
  resource handles, and hooks.
- `hooks/validate-domain.js` - Custom hook that validates e-mail domains against DNS or allow-lists before a
  resource is persisted.
- `hooks/validate-domain.test.js` - Minimal Jest suite exercising the hook contract so you can copy the testing
  pattern for your own hooks.
- `recon-artifacts/` - Example JSON/LHR output produced by Recon modes (full scan, per-tool artifacts, namespace
  detection) to help you understand the expected shape of reports.

## e01-e09 - Data onboarding essentials
- `e01-bulk-insert.js` - Bulk-ingest 100+ leads with Faker, custom ID generation, `CostsPlugin` accounting, and
  a progress bar to stress-test write throughput.
- `e02-read-stream.js` - Consume large collections through the readable stream helper while tracking costs and
  throughput with multi-progress dashboards.
- `e03-export-to-csv.js` - Stream resources to CSV via Node.js transforms, ideal for analytics extracts without
  loading records into memory.
- `e04-export-to-zip.js` - Same export pattern but compacts the payload into a ZIP archive for archival or
  external sharing workflows.
- `e05-write-stream.js` - Demonstrates how to pipe arbitrary input streams into `insertMany` to avoid buffering
  huge payloads on the application side.
- `e06-jwt-tokens.js` - End-to-end example generating JWTs, hashing them for persistence, and replaying saved
  tokens to validate subject/audience claims.
- `e07-create-resource.js` - Minimal script for defining a resource programmatically, perfect when you need to
  share copy/paste friendly scaffolding.
- `e08-resource-behaviors.js` - Highlights behavior flags such as `body-overflow`, metadata enforcement, and
  retention policies so you can pick the right mode for each table.
- `e09-partitioning.js` - Covers logical partition strategies (per-tenant, per-campaign, per-region) and how the
  SDK keeps hot partitions inside fast buckets.

## e10-e19 - Schema validation & migrations
- `e10-partition-validation.js` - Validates that each resource lands inside the expected partition and raises
  actionable errors when IDs leak across tenants.
- `e11-utm-partitioning.js` - Shows how to shard event data by UTM parameters so marketing analytics stay
  bounded per campaign/source.
- `e12-schema-validation.js` - Deep dive into the schema DSL, custom messages, and how to short-circuit writes
  before they hit S3.
- `e13-versioning-hooks.js` - Uses hooks to keep historical versions of each resource, including metadata on who
  made changes and when.
- `e14-timestamp-hooks.js` - Adds created/updated timestamps via hooks so you can keep strict audit columns even
  on lightweight resources.
- `e15-pagination.js` - Implements cursor-based pagination with deterministic ordering to keep API responses fast
  and stateless.
- `e16-full-crud.js` - All-in-one CRUD playground covering insert/update/delete/list patterns with optimistic
  concurrency checks.
- `e17-error-handling.js` - Demonstrates rich error payloads, human-readable codes, and how to bubble stack traces
  to logs without leaking sensitive data to callers.
- `e18-plugin-costs.js` - Installs the Costs plugin, emits per-operation metrics, and surfaces them via console so
  you can estimate S3 spend before deploying.
- `e19-migration-v3-to-v4.js` - Safely migrates from the v3 resource layout to v4 with backfills and health
  checks for each partition.

## e20-e29 - Hooks, IDs, replication & analytics
- `e20-hooks-order.js` - Explains hook execution order, short-circuit rules, and how to layer validation,
  enrichment, and logging without race conditions.
- `e21-metadata-type-fix.js` - Recipes for cleaning up legacy metadata types, coercing values, and enforcing
  consistent storage before you roll out analytics.
- `e22-custom-id-generators.js` - Compares snowflake, ULID, and slug-style IDs so you can pick the generator that
  matches your workload.
- `e23-replicators.js` - High-level overview of the replicator framework (drivers, batch sizes, failure handling)
  before diving into cloud-specific variants.
- `e24-bigquery-replicator.js` - Streams s3db.js resources into BigQuery tables with automatic schema sync and
  retry/backoff policies.
- `e25-sqs-replication.js` - Ships mutations to Amazon SQS so downstream services can consume events in real time.
- `e26-postgres-replicator.js` - Mirrors resources to PostgreSQL, keeping foreign keys and indexes in sync for BI
  workloads.
- `e27-queue-consumer.js` - Companion example showing how to implement a worker that processes queue payloads and
  reports status back to s3db.js.
- `e28-errors-detailed.js` - Produces structured errors (with causes, request IDs, hints) to improve incident
  response.
- `e29-arrays-of-strings-and-numbers.js` - Focuses on array validation, nested rules, and how to prevent user
  input from exploding storage costs.

## e30-e39 - Middleware, caching & testing
- `e30-middleware-auth-audit.js` - Adds authentication middleware plus audit logging so every API call is stamped
  with who performed the action and why.
- `e31-event-listeners.js` - Shows how to subscribe to emitted events (inserted, updated, deleted) without slowing
  down the main write path.
- `e31-s3-queue.js` - Implements an S3-backed queue for long running jobs together with visibility timeouts.
- `e32-improved-caching.js` - Benchmarks the in-memory cache improvements and how TTLs interact with the
  persistence layer.
- `e33-http-client-config.js` - Teaches how to tune the HTTP client (timeouts, retries, pools) when s3db.js talks
  to third-party APIs.
- `e34-http-client-benchmark-demo.js` - Puts different HTTP configs under load so you can compare metrics and
  adopt the best defaults.
- `e35-persist-hooks.js` - Persists hook side effects in dedicated resources, ensuring idempotency when you need
  to resume tasks.
- `e36-hook-limitations.js` - Documents known hook constraints (e.g., async boundaries, recursion) so you avoid
  subtle bugs.
- `e36-s3db-json-self-healing.js` - Builds a JSON self-healing routine to recover from malformed documents and
  keep the resource online.
- `e37-cache-plugin-drivers.js` - Explores different cache backends (memory, filesystem, Redis-like) and when to
  switch drivers.
- `e38-testing-isolated-plugin.js` - Blueprint for writing plugin tests without touching S3 thanks to dependency
  injection and fake clients.
- `e39-testing-partial-schema.js` - Shows how to test schema subsets and override validation rules per test case.

## e40-e49 - Testing, AI, recon & API plugin foundations
- `e40-testing-mock-database.js` - Provides a mock database layer so you can unit-test logic without hitting
  MinIO/S3.
- `e41-vector-rag-chatbot.js` - Walkthrough for building a chatbot backed by vector embeddings stored inside
  s3db.js.
- `e42-vector-integrations.js` - Compares integration patterns across OpenAI, Cohere, and custom embedding
  providers.
- `e43-vector-benchmarks.js` - Captures embedding latency/accuracy numbers to help you size clusters.
- `e44-orphaned-partitions-recovery.js` - Detects and repairs orphaned partitions so billing and compliance stay
  accurate.
- `e45-mcp-documentation-assistant.js` - Uses the MCP server to surface documentation snippets as part of the
  developer workflow.
- `e45-recon-behavior-modes.js` - Explains each Recon behavior mode (baseline, aggressive, compare-only) and the
  corresponding trade-offs.
- `e45-recon-multi-instance.js` - Coordinates multiple Recon instances so you can scale scans horizontally.
- `e46-plugin-dependency-validation.js` - Validates plugin dependency graphs to prevent runtime surprises when
  stacking plugins.
- `e46-recon-consolidated-reports.js` - Aggregates Recon outputs into executive-friendly consolidated reports.
- `e46-recon-namespace-detection.js` - Learns which namespaces exist automatically, crucial for sprawling
  multi-tenant setups.
- `e46-replicator-schema-sync.js` - Keeps replicator schemas aligned so downstream databases never break.
- `e47-api-plugin-basic.js` - Step-by-step guide to exposing resources through the API Plugin with validation,
  rate limits, docs, and health checks.
- `e47-namespace-concern-usage.js` - Shows how Namespace Concern isolates per-tenant resources even inside a
  shared deployment.
- `e47-recon-dynamic-targets.js` - Builds Recon target lists at runtime (per customer, per region) for more
  focused scans.
- `e47-tfstate-tracking.js` - Tracks Terraform state versions inside s3db.js, enabling IaC drift detection.
- `e48-metrics-prometheus.js` - Publishes Prometheus metrics for every operation so you can hook alerts in
  Grafana.
- `e48-recon-per-tool-artifacts.js` - Breaks down Recon outputs per tool/plugin, making it easier to share
  artifacts with partner teams.
- `e48-tfstate-advanced-monitoring.js` - Adds alerting, diffs, and history browsing on top of Terraform state
  storage.
- `e49-api-plugin-complete.js` - Fully configured API Plugin instance with multiple resources, auth strategies,
  and documentation endpoints.

## e50-e59 - Eventual consistency, SMTP & REST flavors
- `e50-eventual-consistency-simple.js` - Introduces the eventual-consistency plugin with replication lags and
  read-repair hooks.
- `e50-oidc-simple.js` - Barebones OIDC sample covering discovery documents, JWKS caching, and token verification.
- `e50-patch-replace-update.js` - Benchmarks `patch`, `replace`, and `update` to help you pick the right mutation
  strategy per route.
- `e50-recon-uptime-monitoring.js` - Turns Recon into an uptime monitor by mapping findings to SLAs.
- `e50-smtp-relay.js` - Uses four SMTP providers (SES, SendGrid, Mailgun, Postmark) with automatic retries and
  provider fallbacks.
- `e51-eventual-consistency-url-shortener.js` - Showcase service using the eventual consistency plugin to serve
  short URLs resiliently.
- `e51-incremental-ids.js` - Implements incremental IDs when you need ordered sequences instead of random GUIDs.
- `e51-recon-full-scan.js` - Full-stack Recon scan that enumerates namespaces, resources, and behavior deltas.
- `e51-smtp-server.js` - Embedded SMTP server for receiving mail locally during tests.
- `e51-state-machine-event-triggers.js` - Connects state machine transitions with event emitters to orchestrate
  background work.
- `e52-api-context-patterns.js` - Explains API context injection patterns so middleware and handlers stay thin.
- `e52-eventual-consistency-analytics.js` - Applies eventual consistency to analytics workloads with catch-up
  jobs.
- `e52-recon-new-features.js` - Illustrates the newest Recon features (dynamic namespaces, per-tool scanning,
  attachments).
- `e52-smtp-templates.js` - Handlebars setup with helpers, layouts, and partials for transactional emails.
- `e52-state-machine-resource-api.js` - Exposes state machines as resources so you can mutate states via API
  calls safely.
- `e53-eventual-consistency-url-tracking.js` - Tracks clickstream events with eventual consistency, preserving
  order guarantees.
- `e53-smtp-webhooks.js` - Consumes webhook notifications (bounces, complaints, clicks) from providers and stores
  them for analytics.
- `e54-analytics-granularity.js` - Shows how to downsample analytics so dashboards stay fast without losing
  fidelity.
- `e55-multi-field-resources-demo.js` - Sample resource with dozens of field types to serve as a living schema
  reference.
- `e56-memory-cache-limits.js` - Experiments with in-memory cache limits to help tune TTL + eviction.
- `e57-memory-cache-percentage.js` - Uses percentage-based eviction thresholds for caches on constrained hosts.
- `e58-api-rest-complete.js` - Fully spec'd REST API (auth, docs, validation, pagination) using the API Plugin.
- `e59-api-rest-simple.js` - Minimal REST example for hackathons or prototypes that still keeps validation hooks.

## e60-e69 - Clients, identity, ML plugin & automation
- `e60-api-relations-descriptions.js` - Documents how to describe relationships in REST payloads so client SDKs
  can generate nested calls automatically.
- `e60-filesystem-client.js` - Demonstrates the filesystem-backed client for local development or CI pipelines
  without S3 access.
- `e60-oauth2-microservices.js` - Explains how microservices exchange JWTs securely while sharing the same OIDC
  authority.
- `e61-filesystem-enhanced.js` - Adds retry logic, inotify-style watching, and batching on top of the filesystem
  client.
- `e61-quick-wins.js` - Collection of small tweaks (compression, TTLs, better logging) that deliver disproportionate
  wins during onboarding.
- `e61-sso-architecture-explained.js` - Diagram-heavy walkthrough that glues the SSO server, resource server, and
  front-end flows together.
- `e62-api-improvements.js` - Patch set with dozens of quality-of-life updates for API consumers (sorting,
  filtering, query composition).
- `e62-azure-ad-integration.js` - Guides you through registering apps, mapping scopes, and validating Azure AD
  issued tokens locally.
- `e63-hooks-middlewares.js` - Combines HTTP middlewares and resource hooks to demonstrate layered enforcement.
- `e63-keycloak-integration.js` - Spins up Keycloak via Docker and wires it into the s3db.js API plugin.
- `e64-authorization-complete.js` - Endgame example bundling RBAC, ABAC, scopes, ownership checks, audit trail,
  and tenant isolation.
- `e64-testable-hooks.js` - Shows how to structure hooks so they can be unit-tested with mocks and fixtures.
- `e65-factories-seeders.js` - Factory + seeder toolkit to fill resources deterministically for QA.
- `e65-guards-comparison.js` - Benchmarks different guard implementations so you can choose between RBAC, ABAC,
  scope checks, or hybrids.
- `e66-guards-live.js` - Demonstrates guard hot-reloading/live toggles so security teams can react without
  redeploying.
- `e66-ml-plugin-regression.js` - Regression model example on top of the ML plugin.
- `e67-ml-plugin-classification.js` - Classification workloads showcasing feature engineering helpers.
- `e67-process-manager.js` - Supervises long-running processes with heartbeats, retries, and dashboards.
- `e68-ml-plugin-timeseries.js` - Time-series workflows (rolling windows, forecasts) leveraging the ML plugin.
- `e68-safe-event-emitter.js` - Hardened event emitter that prevents slow listeners from blocking producers.
- `e69-api-custom-routes.js` - Adds bespoke routes on top of auto-generated CRUD endpoints, including middlewares
  and docs.
- `e69-cron-manager.js` - Cron-style job manager stored in s3db.js with schedules, jitter, and execution history.

## e70-e79 - Cloud inventory, API hardening & auth drivers
- `e70-api-test-compression-bug.js` - Regression test capturing a compression edge case; good template for writing
  future API bug repros.
- `e70-cloud-inventory-terraform-export.js` - Exports resources into Terraform files so infra-as-code repos stay
  the source of truth.
- `e71-api-root-route-customization.js` - Shows how to override the default root, add marketing/legal pages, and
  still keep API docs reachable.
- `e71-cloud-inventory-terraform-auto-export.js` - Automates the export pipeline to track Terraform changes in
  Git or CI.
- `e71-ml-plugin-partitions.js` - Teaches how to partition ML datasets for A/B or tenant isolation.
- `e72-api-plugin-logging.js` - Streaming structured logs from the API plugin straight into observability stacks.
- `e72-kubernetes-inventory-basic.js` - Discovers Kubernetes objects and stores them in s3db.js for compliance.
- `e72-ml-plugin-versioning.js` - Model versioning, metadata, and rollback strategies inside the ML plugin.
- `e73-kubernetes-inventory-multi-cluster.js` - Handles multiple kubeconfigs and merges inventories per tenant.
- `e73-ml-plugin-resource-api.js` - Exposes ML plugin datasets as first-class resources with CRUD operations.
- `e74-kubernetes-inventory-filters.js` - Adds filter expressions so platform teams can slice inventories by
  namespace, labels, or annotations.
- `e74-ml-plugin-data-transforms.js` - Data transformation helpers (normalization, encoding) baked into the ML
  pipeline.
- `e75-kubernetes-inventory-config-methods.js` - Documents different ways to authenticate (kubeconfig, token,
  pod identity) when scraping clusters.
- `e75-ml-plugin-namespace.js` - Namespacing strategy for ML workloads so experiments stop stepping on each other.
- `e76-kubernetes-inventory-namespacing.js` - Multi-tenant isolation for inventory data sets.
- `e76-state-machine-sync-events.js` - Demonstrates synchronous events emitted from the state machine engine for
  highly coordinated workflows.
- `e77-api-version-prefix.js` - Adds API version prefixing (v1, v2) without duplicating routes.
- `e77-kubernetes-inventory-multi-context.js` - Builds inventories across multiple contexts/kubeconfigs in one
  run.
- `e78-api-driver-auth-jwt.js` - JWT driver for the API plugin, including rotating keys and claim validation.
- `e79-api-driver-auth-basic.js` - Basic auth driver with throttling and audit logging for internal tools.

## e80-e89 - Identity UX, templates & application blueprints
- `e80-api-custom-routes.js` - Builds totally custom handlers (beyond CRUD) within the API Plugin, wiring in
  advanced auth scopes.
- `e80-sso-oauth2-server.js` - Everything you need to run your own OAuth2/OIDC identity provider with JWKS,
  consent screens, and admin flows.
- `e81-oauth2-resource-server.js` - Resource server that validates JWTs locally, enforces scopes, and exposes
  health/metrics endpoints.
- `e82-oidc-web-app.js` - Front-end friendly example showing PKCE login flows and token refresh logic.
- `e83-api-oidc-dual-auth.js` - API that supports both API keys and OIDC bearer tokens without duplicating logic.
- `e83-path-based-auth.js` - Maps URL paths to auth strategies so you can mix and match protection levels.
- `e84-mrt-shortner-complete-replacement.js` - Full platform example replacing the MRT shortener stack using
  s3db.js end to end.
- `e84-static-files.js` - Serves static assets alongside the API plugin, useful for admin portals or docs.
- `e85-api-path-based-auth.js` - Deep dive on enforcing auth using path parameters, ideal for multi-tenant APIs.
- `e85-identity-whitelabel.js` - White-labeled identity UX with custom themes, logos, and domain mapping.
- `e85-protected-spa.js` - Protects single-page apps with silent renew and route guards.
- `e86-api-enhanced-context.js` - Shows how to inject helper utilities (logger, feature flags, user session) into
  every API handler.
- `e86-custom-login-page.js` - Build bespoke login/forgot password screens that still reuse the core identity
  engine.
- `e86-oidc-user-hooks.js` - Hook points for customizing user claims during authentication.
- `e87-api-templates-ejs-pug.js` - Compare template engines (EJS vs Pug) for dynamic responses.
- `e87-identity-no-registration.js` - Build invite-only or admin-provisioned identity flows.
- `e87-oidc-api-token-cookie.js` - Hybrid approach storing API tokens in HTTP-only cookies for SPAs.
- `e88-api-templates-pug-only.js` - Opinionated Pug-only template stack with includes and mixins.
- `e88-identity-failban-integration.js` - Bans abusive IPs by integrating with Fail2Ban or similar tooling.
- `e88-oidc-enhancements.js` - Quality-of-life improvements for the OIDC server (session management, device codes).
- `e89-identity-1password-cli.js` - Shows how to federate with 1Password CLI while still issuing local tokens.

## e90-e99 - DX tweaks, puppeteer labs & caching
- `e90-api-context-injection-dx.js` - Extends the API context object with helpers so handler code gets shorter and
  safer.
- `e90-guards-with-partitions.js` - Combines guards with partition checks for double-enforced isolation.
- `e90-identity-custom-css.js` - Theme the identity experience with custom CSS, fonts, and layout tweaks.
- `e91-api-opengraph-helper.js` - Utility to emit OpenGraph tags (title, description, image) straight from
  resources.
- `e91-puppeteer-basic.js` - Base Puppeteer harness that logs in, runs scripts, and captures screenshots.
- `e92-oidc-external-api-enrichment.js` - Enrich user sessions with data fetched from third-party APIs during
  OIDC login.
- `e92-puppeteer-cookie-farming.js` - Automates cookie farming using rotating profiles.
- `e93-puppeteer-proxy-binding.js` - Demonstrates per-session proxy binding for Puppeteer bots.
- `e94-cookie-farm-personas.js` - Builds persona definitions to drive realistic cookie farming campaigns.
- `e95-puppeteer-performance-metrics.js` - Captures performance timing, CPU, and memory stats from puppeteer runs.
- `e96-puppeteer-network-monitoring.js` - Tracks network requests, errors, and throttled responses.
- `e96-spider-seo-analysis.js` - SEO spider analyzing metadata, links, and content coverage.
- `e97-puppeteer-console-monitoring.js` - Captures console logs and JS errors from headless runs.
- `e98-resource-schema-introspection.js` - Introspects resource schemas dynamically so CLI tooling can stay in
  sync.
- `e99-api-refactored-demo.js` - Refactoring-focused API example showing how to split routers and services.
- `e99-multi-tier-cache.js` - Hot/warm/cold cache layering with fallbacks to keep APIs fast under load.

## e100+ - Large demos & coordinator flows
- `e100-api-demo-server.js` - Opinionated API stack bundling logging, auth, docs, custom routes, and UI assets for
  demos.
- `e100-global-coordinator-multi-plugin.js` - Shows how the coordinator plugin orchestrates multiple downstream
  plugins safely.
- `e101-path-based-basic-oidc.js` - Lightweight path-based OIDC protection ideal for smaller services.
- `e102-oidc-s3db-session-store.js` - Stores OIDC sessions inside s3db.js so you can scale horizontally without
  sticky sessions.
- `e103-api-plugin-complete-config.js` - Exhaustive configuration reference for the API plugin (drivers, queues,
  docs, templates, auth, rate limits).
- `e200-api-plugin-auth-drivers.js` - Catalog of API plugin auth drivers (JWT, API Key, Basic, custom) showing how
  to register each.
- `e200-pretty-logging.js` - Pretty logger preset (colors, request IDs, latency) ready to drop into any API.
