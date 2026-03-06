# 🏗️ Plugin Architecture

> **What this guide covers:** how the plugin runtime is structured, how plugins live through install/start/stop/uninstall, and how to design plugins that stay isolated from user data.

**Main:** [← Plugin System](/plugins/README.md) | **Next:** [Namespaces API](/plugins/reference/namespaces.md) | **Related:** [PluginStorage](/plugins/reference/plugin-storage.md)

---

## Core Contract

Every plugin constructor should accept the shared options contract handled by `normalizePluginOptions`.

- `logLevel`: gates console and logger output.
- `resources`, `database`, `client`: runtime references injected by the plugin system.
- `namespace`: isolates storage, resources, and emitted state when the plugin supports multi-instance usage.

Use `super(options)` and read the normalized state from `this.options`, `this.logger`, `this.database`, and `this.resources` instead of reading raw constructor input everywhere.

```javascript
import { Plugin } from 's3db.js';

class MyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'MyPlugin';
    this.slug = 'my-plugin';
  }
}
```

## Lifecycle

All plugins follow the same lifecycle:

1. `constructor()`: validate config and store local state.
2. `onInstall()`: create resources, hooks, storage, and derived config.
3. `onStart()`: start timers, workers, queues, polling loops.
4. normal operation: intercept resource/database activity.
5. `onStop()`: stop background work and flush buffered state.
6. `onUninstall()`: remove wrappers, hooks, timers, and plugin-owned side effects.

## Namespaces And Multi-Instance Support

Multi-instance plugins should isolate:

- storage paths
- generated resources
- counters and sequences
- warnings and diagnostics

The base pattern is:

- storage: `plugin=<slug>/<namespace>/...`
- resources: `plg_<namespace>_<plugin>_<resource>`

Use the shared namespace helpers instead of inventing local conventions. The full contract lives in [Namespaces API](/plugins/reference/namespaces.md).

## Deferred Setup

Some plugins need a resource that may not exist yet. Those plugins should defer setup and finish configuration when the resource appears.

```javascript
class MyResourcePlugin extends Plugin {
  async onInstall() {
    this.targetResource = this.database.resources[this.config.resource];

    if (!this.targetResource) {
      this.deferredSetup = true;
      this.database.addHook('afterCreateResource', async ({ resource, config }) => {
        if (this.deferredSetup && config.name === this.config.resource) {
          this.targetResource = resource;
          this.deferredSetup = false;
          await this.completeSetup();
        }
      });
      return;
    }

    await this.completeSetup();
  }
}
```

## Dependency Awareness

Some plugins are bundles or wrappers around other plugins. When that happens:

- document hard dependencies and optional dependencies clearly
- forward shared config intentionally
- reuse outer namespace and naming conventions
- fail with actionable errors when runtime dependencies are missing

## Cleanup And Uninstall

A plugin is not finished when it starts working. It also needs a correct shutdown path.

On uninstall, clean up:

- timers and intervals
- open sockets and client connections
- in-memory caches
- event listeners
- resource hooks and wrapped methods
- pending queues and buffered writes

If the caller requests `purgeData: true`, let the base class purge `PluginStorage` instead of duplicating that logic inside the plugin.

## Plugin Attributes

If a plugin needs to add internal attributes to user resources, use the Plugin Attribute API instead of mutating `resource.schema.attributes` directly.

```javascript
resource.addPluginAttribute('_hasEmbedding', {
  type: 'boolean',
  optional: true
}, 'VectorPlugin');
```

This matters because user attributes and plugin attributes must not share the same field-id mapping namespace. Direct mutation can invalidate historical records.

## Driver-Based Plugins

Most plugins follow a driver model:

- `driver`: selects the implementation
- `config`: passes driver-specific settings
- top-level options: control plugin-wide behavior

## Plugin Types

- instance plugins: `new CachePlugin(...)`
- static plugins: `CostsPlugin`
- resource-extending plugins: add methods or hooks to resources
- event-driven plugins: emit plugin-level events
- deferred-setup plugins: wait for resources created later

## Design Checklist

- validate constructor config early
- call `super(options)`
- keep runtime side effects in lifecycle methods, not constructors
- namespace storage and generated resources
- remove all hooks and timers on uninstall
- use Plugin Attribute API for user-resource extensions
- use PluginStorage for plugin-owned state
