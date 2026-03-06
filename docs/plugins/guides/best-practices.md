# 🎯 Plugin Best Practices

> **What this guide covers:** practical guardrails for building plugins that are safe, maintainable, and observable.

**Main:** [← Plugin System](/plugins/README.md) | **Related:** [Troubleshooting](/plugins/guides/troubleshooting.md)

---

## Principles

- validate constructor input early
- keep constructors light
- defer setup when resources may not exist yet
- clean up timers, hooks, listeners, and connections
- avoid resource method conflicts
- use the right storage layer for the job
- monitor plugin impact in production
