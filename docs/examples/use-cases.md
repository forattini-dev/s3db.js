# Example Use Cases & Proposals

This guide answers "qual exemplo eu uso?" by mapping real problems to the scripts stored in `docs/examples/`.
Docsify search picks up the scenario titles and keywords below, so you can type "multi-tenancy proposta" or
"smtp webhooks" and land on the matching flow.

Each proposta lists the recommended order to read/run examples plus optional extras you can mix in.

## Proposta 1 - API-first launch pad
**Context.** You need to expose resources as REST endpoints quickly, keep DX sharp, and avoid spending weeks on
boilerplate.

**Recommended path.**
1. Start with `e47-api-plugin-basic.js` or `e59-api-rest-simple.js` to wire the API Plugin and understand default
   behaviors.
2. Graduate to `e49-api-plugin-complete.js`, `e58-api-rest-complete.js`, or `e103-api-plugin-complete-config.js`
   when you need every knob (docs, rate limiting, compression, scoped methods).
3. Customize entrypoints via `e71-api-root-route-customization.js`, `e69-api-custom-routes.js`, and `e90-api-context-injection-dx.js`.
4. Use `api-plugin-new-features.js`, `e91-api-opengraph-helper.js`, and `e87-api-templates-ejs-pug.js` for
   marketing/SEO friendly previews.

**Add-ons.** Combine with `e33-http-client-config.js` and `e34-http-client-benchmark-demo.js` before calling out
to external APIs so everything stays resilient.

## Proposta 2 - Identity, OAuth2 & SSO rollout
**Context.** Your team must ship authentication plus branded user journeys without buying a SaaS IdP.

**Recommended path.**
1. Use `e80-sso-oauth2-server.js` and `e81-oauth2-resource-server.js` as the canonical IdP + Resource Server pair.
2. For hosted providers, follow `e62-azure-ad-integration.js`, `e63-keycloak-integration.js`, or
   `e101-path-based-basic-oidc.js`.
3. Front-end heavy teams can copy flows from `e82-oidc-web-app.js`, `e85-protected-spa.js`, and
   `e87-oidc-api-token-cookie.js`.
4. Customize UX with `e85-identity-whitelabel.js`, `e86-custom-login-page.js`, and `e90-identity-custom-css.js`.
5. Persist sessions in s3db.js (`e102-oidc-s3db-session-store.js`) and enrich tokens during login using
   `e86-oidc-user-hooks.js` or `e92-oidc-external-api-enrichment.js`.

**Add-ons.** Harden the experience via `e88-identity-failban-integration.js`, `e88-oidc-enhancements.js`,
`e89-identity-1password-cli.js`, and the guard comparisons from `e65-guards-comparison.js`.

## Proposta 3 - Authorization & tenant isolation
**Context.** Compliance requires strict tenant isolation plus row-level security.

**Recommended path.**
1. Map your partition model with `e09-partitioning.js`, `e10-partition-validation.js`, and
   `e47-namespace-concern-usage.js`.
2. Layer row ownership + scopes via `e64-authorization-complete.js` and `e90-guards-with-partitions.js`.
3. Explain the model to stakeholders with `e61-sso-architecture-explained.js` and `e30-middleware-auth-audit.js`
   so runtime behavior stays transparent.
4. Keep guards testable and observable with `e64-testable-hooks.js`, `e20-hooks-order.js`, and `e36-hook-limitations.js`.

**Add-ons.** For hybrid auth strategies, mix in `e83-api-oidc-dual-auth.js`, `e85-api-path-based-auth.js`, and
`e78-api-driver-auth-jwt.js`.

## Proposta 4 - Observability, recon & compliance dashboards
**Context.** Security and FinOps teams need visibility into every plugin and partition.

**Recommended path.**
1. Baseline error stories with `e17-error-handling.js`, `e28-errors-detailed.js`, and `e200-pretty-logging.js`.
2. Deploy Recon flows via `e44-orphaned-partitions-recovery.js`, `e45-recon-behavior-modes.js`,
   `e45-recon-multi-instance.js`, `e46-recon-consolidated-reports.js`, `e48-recon-per-tool-artifacts.js`, and
   `e50-recon-uptime-monitoring.js`.
3. Feed results into compliance using `recon-artifacts/` (sample outputs) and extend findings with
   `e47-recon-dynamic-targets.js`.
4. Monitor infrastructure with `e48-metrics-prometheus.js`, `e47-tfstate-tracking.js`, and
   `e48-tfstate-advanced-monitoring.js`.

**Add-ons.** Automation teams can pair `e45-mcp-documentation-assistant.js` with the MCP server docs to surface
failing controls inside IDEs.

## Proposta 5 - Eventual consistency & process orchestration
**Context.** You need job queues and retries without losing data integrity.

**Recommended path.**
1. Understand the primitives through `e50-eventual-consistency-simple.js`, `e47-namespace-concern-usage.js`, and
   `e51-incremental-ids.js`.
2. Apply them to products using `e51-eventual-consistency-url-shortener.js`, `e52-eventual-consistency-analytics.js`,
   and `e53-eventual-consistency-url-tracking.js`.
3. Expose state machines via `e51-state-machine-event-triggers.js`, `e52-state-machine-resource-api.js`, and
   `e76-state-machine-sync-events.js`.
4. Coordinate retries/cron jobs with `e67-process-manager.js`, `e69-cron-manager.js`, and `e27-queue-consumer.js`.

**Add-ons.** Use `e68-safe-event-emitter.js` to avoid blocking producers and `e33-http-client-config.js` to wrap
idempotent outgoing calls.

## Proposta 6 - Replication & analytics pipelines
**Context.** BI and ML teams need trusted copies of operational data.

**Recommended path.**
1. Kick off with `e23-replicators.js` to understand the extension points.
2. Deploy at least one destination driver: `e24-bigquery-replicator.js`, `e26-postgres-replicator.js`, or
   `e25-sqs-replication.js`.
3. Keep schemas aligned via `e46-replicator-schema-sync.js` and sanity-check data using `e54-analytics-granularity.js`
   plus `e55-multi-field-resources-demo.js`.
4. Inspect resource metadata dynamically by running `e98-resource-schema-introspection.js` and convert outputs
   into TypeScript via `generate-types-example.js`.

**Add-ons.** When analytics require automation, feed the replicated data into ML samples such as
`e66-ml-plugin-regression.js`.

## Proposta 7 - Cloud inventory, Terraform & platform guardrails
**Context.** Platform teams must understand every cluster, environment, and Terraform module the moment it drifts.

**Recommended path.**
1. Store Terraform state using `e47-tfstate-tracking.js` and `e48-tfstate-advanced-monitoring.js`.
2. Track IaC exports with `e70-cloud-inventory-terraform-export.js` or
   `e71-cloud-inventory-terraform-auto-export.js`.
3. Scan Kubernetes with the `e72`-`e77` series (basic inventory, filters, config methods, multi-cluster/multi-context,
   namespacing) depending on your footprint.
4. Present the data through API routes created in `e71-api-root-route-customization.js` or `e77-api-version-prefix.js`.

**Add-ons.** Integrate recon outputs to halt deploys when drifts appear.

## Proposta 8 - RAG, ML plugin & experimentation
**Context.** Data science teams want to run embeddings or ML pipelines without maintaining a separate stack.

**Recommended path.**
1. Start with `e41-vector-rag-chatbot.js`, `e42-vector-integrations.js`, and `e43-vector-benchmarks.js` for RAG
   workloads.
2. Dive into the ML plugin family: regression (`e66-ml-plugin-regression.js`), classification
   (`e67-ml-plugin-classification.js`), time-series (`e68-ml-plugin-timeseries.js`), versioning (`e72-ml-plugin-versioning.js`),
   partitions (`e71-ml-plugin-partitions.js`), namespaces (`e75-ml-plugin-namespace.js`), and transforms
   (`e74-ml-plugin-data-transforms.js`).
3. Keep experiments in sync through `e67-process-manager.js`, `e65-factories-seeders.js`, and `e35-persist-hooks.js`.

**Add-ons.** Deploy automation using `e68-safe-event-emitter.js` plus the cron manager from `e69-cron-manager.js`.

## Proposta 9 - Messaging, SMTP & outbound communications
**Context.** Marketing + product squads need reliable email delivery, telemetry, and compliance evidence.

**Recommended path.**
1. Connect to providers with `e50-smtp-relay.js` and `e51-smtp-server.js` for local testing.
2. Build templated content through `e52-smtp-templates.js` or the template comparisons (`e87-api-templates-ejs-pug.js`,
   `e88-api-templates-pug-only.js`).
3. Process webhooks via `e53-smtp-webhooks.js` and merge engagement signals into analytics flows with
   `e52-eventual-consistency-analytics.js` and `e53-eventual-consistency-url-tracking.js`.
4. Add audit/middleware from `e30-middleware-auth-audit.js` and route notifications via the state machines listed
   in Proposta 5.

**Add-ons.** For OpenGraph/social previews, reuse `api-plugin-new-features.js`.

## Proposta 10 - Growth automation & puppeteer labs
**Context.** Growth teams experiment with browser automation, cookie farming, and SEO analysis.

**Recommended path.**
1. Kick off with `e91-puppeteer-basic.js` then branch into proxy binding (`e93-puppeteer-proxy-binding.js`),
   cookie farming (`e92-puppeteer-cookie-farming.js`, `e94-cookie-farm-personas.js`), and monitoring
   (`e95-puppeteer-performance-metrics.js`, `e96-puppeteer-network-monitoring.js`, `e97-puppeteer-console-monitoring.js`).
2. Feed SEO crawls from `e96-spider-seo-analysis.js` into analytics resources defined in `e54-analytics-granularity.js`.
3. Surface previews in the API using `e91-api-opengraph-helper.js` or the full `e84-static-files.js` example.

**Add-ons.** Mix these automations with access tokens minted in `e80-sso-oauth2-server.js` or
`e83-api-oidc-dual-auth.js` to keep the flows secure.
