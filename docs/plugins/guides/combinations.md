# 💡 Plugin Combinations

> **What this guide covers:** practical plugin stacks for common workloads and how to reason about composition.

**Main:** [← Plugin System](/plugins/README.md) | **Related:** [Best Practices](/plugins/guides/best-practices.md)

---

## Production Stack

Good baseline for performance, protection, observability, and scheduled maintenance.

## Analytics Stack

Good for indexing, search, replication, and event processing.

## Workflow Stack

Good for orders, inventory, state transitions, and scheduled jobs.

## Development Stack

Keep local dev fast and observable without overbuilding the environment.

## Composition Rules

- prefer explicit namespaces for multi-instance environments
- watch for method collisions on resources
- understand plugin order when multiple plugins wrap the same behavior
- keep large state in resources and plugin-local state in PluginStorage
