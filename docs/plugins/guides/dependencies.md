# 📦 Plugin Dependencies

> **What this guide covers:** how plugin peer dependencies, bundle plugins, and runtime dependency checks work.

**Main:** [← Plugin System](/plugins/README.md) | **Related:** [Architecture](/plugins/guides/architecture.md)

---

## Lightweight Core

s3db.js keeps the core package lean. Plugin-specific dependencies are not bundled into the main runtime unless there is a strong reason to do so.

That means:

- install only what your workload needs
- missing dependencies fail at runtime with actionable errors
- plugins can evolve independently without bloating the base package

## Runtime Validation

When a plugin needs an external package, the runtime should:

1. detect whether the dependency is installed
2. validate minimum supported version when relevant
3. throw an error that includes the install command

Typical examples:

| Plugin | Required Package | Version | Install Command |
|--------|------------------|---------|-----------------|
| PostgreSQL Replicator | `pg` | `^8.0.0` | `pnpm add pg` |
| BigQuery Replicator | `@google-cloud/bigquery` | `^7.0.0` | `pnpm add @google-cloud/bigquery` |
| SQS Replicator | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| RabbitMQ Consumer | `amqplib` | `^0.10.0` | `pnpm add amqplib` |

## Bundle Plugins

Some plugins install or expect other plugins. In those cases:

- document hard vs optional dependencies clearly
- forward shared config intentionally
- reuse outer namespace and naming conventions
- keep child plugin resources scoped consistently

## Programmatic Reporting

```javascript
import { getPluginDependencyReport } from 's3db.js/src/plugins/concerns/plugin-dependencies.js';

const report = await getPluginDependencyReport();
console.log(report);
```

See also:

- [Dependency validation example](/examples/e46-plugin-dependency-validation.js)
