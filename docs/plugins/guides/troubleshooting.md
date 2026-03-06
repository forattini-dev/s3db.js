# 🔍 Plugin Troubleshooting

> **What this guide covers:** common plugin-system failures and how to diagnose them quickly.

**Main:** [← Plugin System](/plugins/README.md) | **Related:** [Best Practices](/plugins/guides/best-practices.md)

---

## Common Failures

- plugin not initializing
- deferred setup not working
- method conflicts
- performance regressions
- initialization order problems
- partial-schema test failures

## Debugging Checklist

- inspect `error.description` when available
- confirm plugin installation order
- confirm target resource exists
- confirm namespace and generated resource names
- inspect plugin-owned storage keys if the plugin uses PluginStorage
