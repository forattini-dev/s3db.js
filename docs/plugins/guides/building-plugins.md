# 🔧 Building Plugins

> **What this guide covers:** the minimum plugin shape, common implementation patterns, and how to hook into database and resource behavior safely.

**Main:** [← Plugin System](/plugins/README.md) | **Related:** [Architecture](/plugins/guides/architecture.md) | **Reference:** [PluginStorage](/plugins/reference/plugin-storage.md)

---

## Minimal Plugin

```javascript
import { Plugin, ValidationError } from 's3db.js';

class MyCustomPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.name = 'MyCustomPlugin';

    if (!options.resource) {
      throw new ValidationError('MyCustomPlugin requires a target resource');
    }

    this.config = {
      enabled: true,
      ...options
    };
  }

  async onInstall() {
    await this.initialize();
  }

  async onStart() {
    this.emit('plugin.started', { name: this.name });
  }

  async onStop() {
    this.removeAllListeners();
    await this.cleanup();
  }
}
```

## Pattern 1: Multi-Driver Support

Use this when the plugin behavior is the same but the backend changes.

## Pattern 2: Resource Method Extension

Check before extending a resource and use names that will not collide with user-land helpers.

## Pattern 3: Operation Interception

Wrap carefully. Interceptors are powerful, but they are also one of the easiest ways to create plugin conflicts.

## Hooks And Events

- database hooks for resource lifecycle and database operations
- resource events for item-level lifecycle
- plugin events for observability and integrations

## Testing Plugin Behavior

At minimum, test:

- install and start behavior
- deferred setup when resources appear late
- resource method installation
- cleanup on stop and uninstall
- namespace or storage isolation if supported
