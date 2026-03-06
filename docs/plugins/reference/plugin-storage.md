# 💾 PluginStorage Reference

> **What this reference covers:** the plugin-owned storage abstraction for lightweight, namespaced, non-resource persistence.

**Main:** [← Plugin System](/plugins/README.md) | **Related:** [Architecture](/plugins/guides/architecture.md)

---

## Why PluginStorage Exists

`PluginStorage` gives every plugin a lightweight key-value layer without requiring a full resource definition.

Use it for:

- plugin configuration
- transient state
- locks
- counters
- caches
- low-volume bookkeeping

Prefer resources instead when you need:

- structured queries
- partitions
- large datasets
- analytics or time-series data
- user-facing schemas

## Getting Started

```javascript
class MyPlugin extends Plugin {
  constructor() {
    super({ slug: 'my-plugin' });
  }

  async onInstall() {
    const storage = this.getStorage();

    await storage.set(
      storage.getPluginKey(null, 'config'),
      { enabled: true, installedAt: Date.now() }
    );
  }
}
```

## Key Paths

```javascript
storage.getPluginKey(null, 'config');
// "plugin=my-plugin/config"

storage.getPluginKey('users', 'cache', 'user-123');
// "resource=users/plugin=my-plugin/cache/user-123"
```

## Core Methods

- `set(key, data, options)`
- `get(key)`
- `list(prefix, options)`
- `listForResource(resourceName, subPrefix, options)`
- `delete(key)`
- `deleteAll(resourceName)`

## TTL Methods

- `has(key)`
- `isExpired(key)`
- `getTTL(key)`
- `touch(key, additionalSeconds)`

## Distributed Locks

- `acquireLock(lockName, options)`
- `releaseLock(lock)`
- `isLocked(lockName)`

## Counters

- `increment(key, amount, options)`
- `decrement(key, amount, options)`

## When Not To Use PluginStorage

Do not use it for:

- high-volume query surfaces
- analytics datasets
- audit histories
- user-facing data with schema guarantees

Those belong in proper resources.
