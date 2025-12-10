<!-- _sidebar.md -->

- **Getting Started**
  - [Introduction](/)
  - [Quick Start](guides/getting-started.md)
  - [Installation](/#-installation)
  - [TypeScript Guide](guides/typescript.md)
  - [Testing Guide](guides/testing.md)
  - [CLI Reference](cli.md)
  - [MCP Integration Guide](mcp.md)

- **Core Concepts**
  - [Overview](core/README.md)
  - [S3db Instance](core/database.md)
  - [Resource](core/resource.md)
  - [Schema & Validation](core/schema.md)
  - [Behaviors](core/behaviors.md)
  - [Events](core/events.md)
  - [Partitions](core/partitions.md)
  - [Encryption](core/encryption.md)
  - [Streaming](core/streaming.md)
  - **Internals**
    - [Overview](core/internals/README.md)
    - [Distributed Lock](core/internals/distributed-lock.md)
    - [Distributed Sequence](core/internals/distributed-sequence.md)
    - [JSON Recovery](core/internals/json-recovery.md)
    - [Global Coordinator](core/internals/global-coordinator.md)

- **Clients**
  - [Overview](clients/README.md)
  - [S3 Client](clients/s3-client.md)
  - [Memory Client](clients/memory-client.md)
  - [Filesystem Client](clients/filesystem-client.md)

- **The "Mega" Plugins**
  - [API Plugin](plugins/api/README.md)
  - [Identity (OIDC)](plugins/identity/README.md)
  - [Recon System](plugins/recon/README.md)
  - [Cloud Inventory](plugins/cloud-inventory/README.md)

- **Plugins (Other)**
  - [Overview](plugins/README.md)
  - **Performance**
    - [Cache](plugins/cache/README.md)
    - [Eventual Consistency](plugins/eventual-consistency/README.md)
    - [TTL](plugins/ttl/README.md)
  - **Data & Replication**
    - [Replicator](plugins/replicator/README.md)
    - [Importer](plugins/importer/README.md)
    - [Backup](plugins/backup/README.md)
    - [Audit](plugins/audit/README.md)
  - **Search & ML**
    - [Vector](plugins/vector/README.md)
    - [Fulltext Search](plugins/fulltext/README.md)
    - [ML Plugin](plugins/ml-plugin/README.md)
    - [Geo](plugins/geo/README.md)
    - [Graphs](plugins/graphs/README.md)
  - **Queues & Scheduling**
    - [S3 Queue](plugins/s3-queue/README.md)
    - [Scheduler](plugins/scheduler/README.md)
    - [Queue Consumer](plugins/queue-consumer/README.md)
    - [State Machine](plugins/state-machine/README.md)
  - **Web Scraping**
    - [Puppeteer](plugins/puppeteer/README.md)
    - [Spider](plugins/spider/README.md)
    - [Cookie Farm](plugins/cookie-farm/README.md)
  - **DevOps**
    - [Kubernetes Inventory](plugins/kubernetes-inventory/README.md)
    - [TFState](plugins/tfstate/README.md)
    - [Costs](plugins/costs/README.md)
  - **Other**
    - [Coordinator](plugins/coordinator/README.md)
    - [Relation](plugins/relation/README.md)
    - [SMTP](plugins/smtp/README.md)
    - [Metrics](plugins/metrics/README.md)
    - [Tournament](plugins/tournament/README.md)
    - [Trees](plugins/trees/README.md)

- **Guides**
  - [Overview](guides/README.md)
  - [Performance Tuning](guides/performance-tuning.md)
  - [Security Best Practices](guides/security-best-practices.md)
  - [Multi-Tenancy](guides/multi-tenancy.md)

- **Reference**
  - [Overview](reference/README.md)
  - [Connection Strings](reference/connection-strings.md)
  - [Errors](reference/errors.md)

- **Examples**
  - [Overview](examples/README.md)
  - [Use Cases](examples/use-cases.md)
  - [Catalog](examples/catalog.md)

- **More**
  - [Benchmarks](benchmarks/)
  - [AWS Integration](aws/)
  - [Fastest Validator](fastest-validator.md)
  - [Logger Best Practices](logger-best-practices.md)

- **Links**
  - [![npm](https://img.shields.io/badge/npm-s3db.js-red)](https://www.npmjs.com/package/s3db.js)
  - [![GitHub](https://img.shields.io/badge/GitHub-Repository-black)](https://github.com/forattini-dev/s3db.js)
