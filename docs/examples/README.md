# s3db.js Example Hub

Curated, searchable entry point for everything inside `docs/examples/`. Use it as the landing page in Docsify to
find a runnable script, understand what it demonstrates, and why it matters.

## Run any example in seconds
1. `cd s3db.js && pnpm install` (installs runtime + dev deps).
2. Start the fake S3 backend using `USE_FAKE_S3=true` or point `connectionString` to your MinIO/S3 endpoint.
3. Execute any script: `node docs/examples/e47-api-plugin-basic.js` (Node 18+ recommended). Most samples rely on
   helper utilities such as `docs/examples/database.js` so they auto-create resources.
4. Need TypeScript? Copy `docs/examples/tsconfig.example.json` and run `tsx docs/examples/typescript-usage-example.ts`.

> Tip: Many demos (API Plugin, OAuth2, Recon, ML) spin up servers. Keep multiple terminals open or use `pnpm concurrently`.

## Navigation helpers
- [Use-case proposals](./use-cases.md) - scenario-driven "propostas" that suggest example playlists.
- [Example catalog](./catalog.md) - alphabetical list of every script with keywords for Docsify search.
- [Plugins overview](../plugins/README.md) - deep dive into each plugin once you know which one to explore.
- [Client & resource references](../client.md), (../resources.md), (../schema.md) - API surface that examples rely on.

## Category cheat-sheet
### Data ingestion & schema
- `e01-bulk-insert.js`, `e02-read-stream.js`, `e03-export-to-csv.js`, `e04-export-to-zip.js`, `e05-write-stream.js` -
  bulk import/export via streams with throughput + cost tracking.
- `e07-create-resource.js`, `e08-resource-behaviors.js`, `e12-schema-validation.js`, `e13-versioning-hooks.js`,
  `e14-timestamp-hooks.js` - schema DSL usage, behaviors, versioning, and auditing.
- `e15-pagination.js`, `e16-full-crud.js`, `e17-error-handling.js`, `e29-arrays-of-strings-and-numbers.js` -
  production-friendly query patterns and validation edge cases.

### Partitioning, IDs & authorization
- `e09-partitioning.js`, `e10-partition-validation.js`, `e11-utm-partitioning.js` - tenant-aware layouts.
- `e22-custom-id-generators.js`, `e51-incremental-ids.js` - deterministic IDs for reconciliation-heavy apps.
- `e30-middleware-auth-audit.js`, `e64-authorization-complete.js`, `e65-guards-comparison.js`,
  `e90-guards-with-partitions.js` - complete RLS + RBAC + ABAC story with middleware instrumentation.
- `e47-namespace-concern-usage.js`, `e85-api-path-based-auth.js` - isolate namespaces per customer/region.

### Replication, analytics & caching
- `e23-replicators.js`, `e24-bigquery-replicator.js`, `e25-sqs-replication.js`, `e26-postgres-replicator.js`,
  `e46-replicator-schema-sync.js` - move data to BigQuery, Postgres, queues, and keep schemas consistent.
- `e32-improved-caching.js`, `e37-cache-plugin-drivers.js`, `e56-memory-cache-limits.js`, `e57-memory-cache-percentage.js`,
  `e99-multi-tier-cache.js` - tuning caches for read-heavy APIs.
- `e54-analytics-granularity.js`, `e55-multi-field-resources-demo.js`, `e98-resource-schema-introspection.js` -
  analytics-friendly sampling and live schema exploration.

### Eventual consistency, state machines & messaging
- `e50-eventual-consistency-simple.js`, `e51-eventual-consistency-url-shortener.js`, `e52-eventual-consistency-analytics.js`,
  `e53-eventual-consistency-url-tracking.js` - queue-backed workloads and reconciliation loops.
- `e51-state-machine-event-triggers.js`, `e52-state-machine-resource-api.js`, `e76-state-machine-sync-events.js` -
  workflow/state-machine orchestration.
- `e50-smtp-relay.js`, `e51-smtp-server.js`, `e52-smtp-templates.js`, `e53-smtp-webhooks.js` - outbound notifications,
  multi-provider failover, and webhook ingestion.

### API Plugin & HTTP delivery
- `e47-api-plugin-basic.js`, `e49-api-plugin-complete.js`, `e58-api-rest-complete.js`, `e59-api-rest-simple.js`,
  `e103-api-plugin-complete-config.js` - every knob you can tweak in the API Plugin.
- `e69-api-custom-routes.js`, `e71-api-root-route-customization.js`, `e77-api-version-prefix.js`,
  `e90-api-context-injection-dx.js` - advanced routing, DX helpers, and version negotiation.
- `api-plugin-new-features.js`, `e87-api-templates-ejs-pug.js`, `e88-api-templates-pug-only.js`,
  `e91-api-opengraph-helper.js`, `e84-static-files.js` - templating, OG metadata, and static asset delivery.
- `e78-api-driver-auth-jwt.js`, `e79-api-driver-auth-basic.js`, `e80-api-custom-routes.js`, `e83-api-oidc-dual-auth.js` -
  auth drivers and flow mixing.

### Identity, OAuth2 & UX polish
- `e60-oauth2-microservices.js`, `e61-sso-architecture-explained.js`, `e80-sso-oauth2-server.js`,
  `e81-oauth2-resource-server.js`, `e82-oidc-web-app.js` - base stack covering server, resource server, and SPA.
- `e62-azure-ad-integration.js`, `e63-keycloak-integration.js`, `e101-path-based-basic-oidc.js`,
  `e102-oidc-s3db-session-store.js` - drop-in provider integrations.
- `e85-identity-whitelabel.js`, `e85-protected-spa.js`, `e86-custom-login-page.js`, `e87-identity-no-registration.js`,
  `e90-identity-custom-css.js`, `e89-identity-1password-cli.js` - custom UX, restricted enrollments, CLI ties.
- `e86-oidc-user-hooks.js`, `e87-oidc-api-token-cookie.js`, `e92-oidc-external-api-enrichment.js` - customizing
  claims, cookies, and profile hydration.

### Observability, recon & infrastructure guardrails
- `e17-error-handling.js`, `e28-errors-detailed.js`, `e200-pretty-logging.js`, `e72-api-plugin-logging.js` -
  structured logging, regression repros, and failure observability.
- `e44-orphaned-partitions-recovery.js`, `e45-recon-behavior-modes.js`, `e46-recon-namespace-detection.js`,
  `e48-recon-per-tool-artifacts.js`, `e50-recon-uptime-monitoring.js` - Recon operations.
- `e47-tfstate-tracking.js`, `e48-tfstate-advanced-monitoring.js`, `e70-cloud-inventory-terraform-export.js`,
  `e71-cloud-inventory-terraform-auto-export.js`, `e72`-`e77` Kubernetes inventory series - Terraform/Kubernetes
  governance at scale.

### ML, automation & growth
- `e41-vector-rag-chatbot.js`, `e42-vector-integrations.js`, `e43-vector-benchmarks.js` - RAG and vector pilots.
- `e66-ml-plugin-regression.js`, `e67-ml-plugin-classification.js`, `e68-ml-plugin-timeseries.js`,
  `e71-ml-plugin-partitions.js`, `e72-ml-plugin-versioning.js`, `e74-ml-plugin-data-transforms.js`,
  `e75-ml-plugin-namespace.js` - ML plugin lifecycle.
- `e67-process-manager.js`, `e69-cron-manager.js`, `e27-queue-consumer.js`, `e68-safe-event-emitter.js` - job orchestration.
- `e91-puppeteer-basic.js`, `e92-puppeteer-cookie-farming.js`, `e93-puppeteer-proxy-binding.js`,
  `e94-cookie-farm-personas.js`, `e95`-`e97` monitoring scripts, `e96-spider-seo-analysis.js` - growth & automation labs.

## Value proposition highlights
| Proposta | When to start here | Anchor examples |
| --- | --- | --- |
| API-first launch pad | Need REST + docs + DX quickly | `e47`, `e49`, `e58`, `e103`, `api-plugin-new-features.js` |
| Identity & SSO rollout | Ship OAuth2/OIDC with branded flows | `e80`, `e81`, `e82`, `e85`, `e102`, `e92` |
| Authorization & tenant isolation | Guarantee RLS, scopes, and auditing | `e09`, `e10`, `e64`, `e90`, `e65` |
| Eventual consistency & workflows | Run async jobs and state machines | `e50`, `e51`, `e52`, `e69`, `e76` |
| Observability, Recon & FinOps | Need findings, uptime, tfstate, compliance dashboards | `e44`, `e45`, `e46`, `e47-tfstate-tracking.js`, `e48-metrics-prometheus.js` |
| ML & analytics pipelines | Centralize RAG/ML experiments | `e41`, `e43`, `e66`-`e75`, `e98` |
| Messaging & growth automation | Own emails, webhooks, and puppeteer ops | `e50-smtp-relay.js`, `e52-smtp-templates.js`, `e53-smtp-webhooks.js`, `e91`-`e97` |

Each proposta is documented in more detail inside [use-cases.md](./use-cases.md) with sequencing tips.

## Docsify search tips
- Search by feature (`"eventual consistency"`, `"kubernetes inventory"`) to jump straight to the right file.
- Search by provider names (`"Azure AD"`, `"Keycloak"`, `"Mailgun"`, `"Prometheus"`) because they are explicitly
  mentioned in the catalog table.
- Search by plugin names (`"API Plugin"`, `"Recon"`, `"ML Plugin"`, `"Costs Plugin"`) to list the relevant scripts.

## Related reading
- [../multi-file-plugin-docs-standard.md](../multi-file-plugin-docs-standard.md) - how plugin docs are structured.
- [../logging.md](../logging.md) & [../logger-best-practices.md](../logger-best-practices.md) - tie into the
  observability samples.
- [../mcp.md](../mcp.md) - background on the MCP server referenced by `e45-mcp-documentation-assistant.js`.
- [../resources.md](../resources.md) & [../schema.md](../schema.md) - deep reference for building your own examples.
