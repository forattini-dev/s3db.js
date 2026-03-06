# 🔌 s3db.js Plugin System

> **Understand the plugin runtime, then jump into the plugin you actually need.**
>
> **Navigation:** [Getting Started](/plugins/guides/getting-started.md) | [Architecture](/plugins/guides/architecture.md) | [Build Plugins](/plugins/guides/building-plugins.md) | [PluginStorage](/plugins/reference/plugin-storage.md)

---

## ⚡ TLDR

s3db.js plugins extend the database without changing the core runtime. They can add APIs, queues, replication, analytics, scraping, workflows, search, and internal platform capabilities.

This page is now the entry point for the plugin system docs. The large monolithic guide was split into focused documents so the system is easier to read and maintain.

If you are new here:

1. Read [Getting Started](/plugins/guides/getting-started.md)
2. Read [Architecture](/plugins/guides/architecture.md)
3. If you are building plugins, read [Building Plugins](/plugins/guides/building-plugins.md)
4. If you need plugin-owned state, use [PluginStorage Reference](/plugins/reference/plugin-storage.md)

## 📋 Documentation Index

| Doc | Focus | When to read |
|-----|-------|--------------|
| [Getting Started](/plugins/guides/getting-started.md) | install plugins, timing, deferred setup | first read |
| [Architecture](/plugins/guides/architecture.md) | lifecycle, cleanup, attributes, drivers | when building or reviewing plugins |
| [Dependencies](/plugins/guides/dependencies.md) | peer dependencies and bundle plugins | when wiring runtime deps |
| [Building Plugins](/plugins/guides/building-plugins.md) | minimal plugin shape and patterns | when authoring plugins |
| [PluginStorage Reference](/plugins/reference/plugin-storage.md) | plugin-owned persistence | when storing plugin state |
| [Namespace API](/plugins/reference/namespaces.md) | multi-instance isolation helpers | when adding namespace support |
| [Plugin Combinations](/plugins/guides/combinations.md) | suggested stacks by workload | when designing a platform stack |
| [Best Practices](/plugins/guides/best-practices.md) | guardrails for maintainable plugins | after first implementation |
| [Troubleshooting](/plugins/guides/troubleshooting.md) | common failures and diagnosis | when debugging |

## 🎯 All Available Plugins

| Plugin | Purpose | Use Cases | Docs |
|--------|---------|-----------|------|
| **[🌐 API](/plugins/api/README.md)** | Auto-generated REST API with OpenAPI, path-based auth, template engine | RESTful endpoints, Swagger UI, multi-auth, SSR | [→](/plugins/api/README.md) |
| **[📝 Audit](/plugins/audit/README.md)** | Comprehensive operation logging | Compliance, security | [→](/plugins/audit/README.md) |
| **[💾 Backup](/plugins/backup/README.md)** | Multi-destination backup system | Data protection, disaster recovery | [→](/plugins/backup/README.md) |
| **[💾 Cache](/plugins/cache/README.md)** | Multi-driver caching | Performance, cost reduction | [→](/plugins/cache/README.md) |
| **[☁️ Cloud Inventory](/plugins/cloud-inventory/README.md)** | Multi-cloud inventory with drift detection and export | CMDB, compliance, IaC adoption | [→](/plugins/cloud-inventory/README.md) |
| **[🍪 Cookie Farm](/plugins/cookie-farm/README.md)** | Persona farming bundle for anti-bot workflows | Session rotation, warmup workflows | [→](/plugins/cookie-farm/README.md) |
| **[💰 Costs](/plugins/costs/README.md)** | S3 cost tracking | Budget monitoring, optimization | [→](/plugins/costs/README.md) |
| **[⚡ Eventual Consistency](/plugins/eventual-consistency/README.md)** | Counter and transactional numeric flows | Balances, analytics, aggregations | [→](/plugins/eventual-consistency/README.md) |
| **[🔍 FullText](/plugins/fulltext/README.md)** | Full-text indexing and search | Search, content discovery | [→](/plugins/fulltext/README.md) |
| **[🌍 Geo](/plugins/geo/README.md)** | Location-aware querying | Store locators, routing | [→](/plugins/geo/README.md) |
| **[🕸️ Graph](/plugins/graphs/README.md)** | Graph data structures and traversal | Recommendations, knowledge graphs | [→](/plugins/graphs/README.md) |
| **[🔐 Identity](/plugins/identity/README.md)** | OAuth2/OIDC auth server | SSO, user management, whitelabel auth | [→](/plugins/identity/README.md) |
| **[📥 Importer](/plugins/importer/README.md)** | Bulk data import | JSON, CSV, migrations | [→](/plugins/importer/README.md) |
| **[☸️ Kubernetes Inventory](/plugins/kubernetes-inventory/README.md)** | Kubernetes discovery and drift tracking | CMDB, compliance, cluster monitoring | [→](/plugins/kubernetes-inventory/README.md) |
| **[📊 Metrics](/plugins/metrics/README.md)** | Performance and usage metrics | Monitoring, insights | [→](/plugins/metrics/README.md) |
| **[🤖 ML Plugin](/plugins/ml-plugin/README.md)** | Machine learning model workflows | Inference, predictions | [→](/plugins/ml-plugin/README.md) |
| **[🎭 Puppeteer](/plugins/puppeteer/README.md)** | Headless browser automation | Scraping, testing, cookie farming | [→](/plugins/puppeteer/README.md) |
| **[📬 Queue Consumer](/plugins/queue-consumer/README.md)** | Queue consumption | Event-driven architecture | [→](/plugins/queue-consumer/README.md) |
| **[🛰️ Recon](/plugins/recon/README.md)** | DNS, ports, TLS, subdomains, sweeps | Asset discovery, continuous monitoring | [→](/plugins/recon/README.md) |
| **[🔗 Relation](/plugins/relation/README.md)** | ORM-like relations | Nested loading, relational modeling | [→](/plugins/relation/README.md) |
| **[🔄 Replicator](/plugins/replicator/README.md)** | Data replication | PostgreSQL, BigQuery, SQS, S3DB | [→](/plugins/replicator/README.md) |
| **[🔒 S3 Queue](/plugins/s3-queue/README.md)** | Distributed queueing | Task queues, worker pools | [→](/plugins/s3-queue/README.md) |
| **[⏰ Scheduler](/plugins/scheduler/README.md)** | Cron-like scheduled jobs | Maintenance, batch processing | [→](/plugins/scheduler/README.md) |
| **[📧 SMTP](/plugins/smtp/README.md)** | Email delivery and webhook flows | Transactional email, notifications | [→](/plugins/smtp/README.md) |
| **[🕷️ Spider](/plugins/spider/README.md)** | Crawling bundle | Web scraping pipelines, audits | [→](/plugins/spider/README.md) |
| **[🤖 State Machine](/plugins/state-machine/README.md)** | Workflow orchestration | Business processes, automation | [→](/plugins/state-machine/README.md) |
| **[🏗️ TFState](/plugins/tfstate/README.md)** | Terraform state tracking | Infrastructure monitoring | [→](/plugins/tfstate/README.md) |
| **[🏆 Tournament](/plugins/tournament/README.md)** | Tournament engine | Brackets, match reporting, leagues | [→](/plugins/tournament/README.md) |
| **[🌳 Tree](/plugins/tree/README.md)** | Hierarchical data | Categories, org charts, file systems | [→](/plugins/tree/README.md) |
| **[⏳ TTL](/plugins/ttl/README.md)** | Automatic expiration | Sessions, cache invalidation | [→](/plugins/ttl/README.md) |
| **[🎯 Vector](/plugins/vector/README.md)** | Vector search and embeddings workflows | RAG, semantic search, ML | [→](/plugins/vector/README.md) |
| **[🔌 WebSocket](/plugins/websocket/README.md)** | Stateful websocket transport | Realtime apps, channel-based messaging | [→](/plugins/websocket/README.md) |

## 🏗️ Plugin Architecture

The plugin runtime is documented in smaller guides now:

- [Architecture](/plugins/guides/architecture.md)
- [Namespace API](/plugins/reference/namespaces.md)
- [Dependencies](/plugins/guides/dependencies.md)

## 📘 Plugin Namespace API Reference

Namespace helpers, validation rules, and implementation patterns now live in [Plugin Namespace API Reference](/plugins/reference/namespaces.md).

## 📦 Getting Started

For installing plugins, `usePlugin()`, constructor-based registration, and deferred setup, see [Plugin System Getting Started](/plugins/guides/getting-started.md).

## ⏰ Plugin Timing: Before vs After Resource Creation

The timing model and deferred-setup pattern are covered in [Plugin System Getting Started](/plugins/guides/getting-started.md#timing-before-vs-after-resource-creation).

## 🔧 Build Your Own Plugin

For custom plugin patterns, hooks, events, and authoring guidance, see [Building Plugins](/plugins/guides/building-plugins.md).

## 💾 PluginStorage

`PluginStorage` now has its own reference page: [PluginStorage Reference](/plugins/reference/plugin-storage.md).

## 💡 Plugin Combinations

Suggested production, analytics, workflow, and development stacks live in [Plugin Combinations](/plugins/guides/combinations.md).

## 🎯 Best Practices

Operational guidance for safe plugins lives in [Plugin Best Practices](/plugins/guides/best-practices.md).

## 🔍 Troubleshooting

Common failure modes now live in [Plugin Troubleshooting](/plugins/guides/troubleshooting.md).

## 📚 Additional Resources

- [Coordinator Runtime](/plugins/coordinator/README.md)
- [Architecture](/plugins/guides/architecture.md)
- [Getting Started](/plugins/guides/getting-started.md)
- [Building Plugins](/plugins/guides/building-plugins.md)
- [PluginStorage Reference](/plugins/reference/plugin-storage.md)
- [Namespace API](/plugins/reference/namespaces.md)
- [Plugin Combinations](/plugins/guides/combinations.md)
- [Best Practices](/plugins/guides/best-practices.md)
- [Troubleshooting](/plugins/guides/troubleshooting.md)
