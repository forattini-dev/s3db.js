# 🚀 Plugin System Getting Started

> **What this guide covers:** how to install plugins, when to use `usePlugin()`, and how plugin timing works before or after resources exist.

**Main:** [← Plugin System](/plugins/README.md) | **Next:** [Building Plugins](/plugins/guides/building-plugins.md)

---

## Basic Usage

All plugins are available from the main `s3db.js` package.

```javascript
import { S3db } from 's3db.js';
import { BackupPlugin, CachePlugin, CostsPlugin } from 's3db.js';

const db = new S3db({
  connectionString: 's3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp'
});

await db.connect();

await db.usePlugin(new CachePlugin({
  driver: 'memory',
  config: { maxSize: 1000 }
}));

await db.usePlugin(new BackupPlugin({
  driver: 'filesystem',
  config: { path: './backups/{date}/' }
}));

await db.usePlugin(CostsPlugin);
```

## Ways To Add Plugins

### `usePlugin()` after connect

This is the clearest default for most applications.

```javascript
const database = new S3db({ connectionString: '...' });
await database.connect();

await database.usePlugin(new CachePlugin({
  driver: 'memory',
  config: { maxSize: 1000 }
}));
```

### constructor `plugins`

Use this when plugin installation is part of database bootstrapping.

```javascript
const database = new S3db({
  connectionString: '...',
  plugins: [
    new CachePlugin({ driver: 'memory' }),
    new AuditPlugin({ driver: 'memory' })
  ]
});

await database.connect();
```

### static plugin objects

Some plugins are installed directly rather than instantiated.

```javascript
await database.usePlugin(CostsPlugin);
```

## Timing: Before Vs After Resource Creation

Plugins can be installed before or after the resources they target.

### Before the resource exists

```javascript
const plugin = new EventualConsistencyPlugin({
  resource: 'wallets',
  field: 'balance',
  mode: 'sync'
});

await database.usePlugin(plugin);

await database.createResource({
  name: 'wallets',
  attributes: {
    id: 'string|required',
    balance: 'number|default:0'
  }
});
```

This works when the plugin supports deferred setup.

### After the resource already exists

```javascript
await database.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    stock: 'number|default:0'
  }
});

await database.usePlugin(new EventualConsistencyPlugin({
  resource: 'products',
  field: 'stock',
  mode: 'async'
}));
```

This works when the plugin can attach itself immediately to an existing resource.

## How Deferred Setup Works

Deferred setup is the usual pattern when a plugin depends on a resource that may appear later.

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

## When To Prefer Each Style

- use constructor `plugins` when plugins are part of platform boot
- use `usePlugin()` when plugin wiring is conditional or environment-dependent
- use deferred setup when a plugin must tolerate missing resources
- install before resource creation when the plugin wants to influence resource setup automatically

## Next Steps

- [Architecture](/plugins/guides/architecture.md)
- [Building Plugins](/plugins/guides/building-plugins.md)
- [PluginStorage Reference](/plugins/reference/plugin-storage.md)
