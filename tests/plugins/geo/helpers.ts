import { afterEach, beforeEach } from 'vitest';
import { MemoryClient } from '../../../src/clients/memory-client.class.js';
import { createMemoryDatabaseForTest } from '../../config.js';
import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';

if (typeof process.setMaxListeners === 'function' && process.getMaxListeners() < 50) {
  process.setMaxListeners(50);
}

export function setupGeoSuite(options = {}) {
  const ctx = {
    db: null
  };

  beforeEach(async () => {
    MemoryClient.clearAllStorage();
    ctx.db = createMemoryDatabaseForTest(options.databaseName || 'suite=plugins/geo');
    await ctx.db.connect();
  });

  afterEach(async () => {
    if (ctx.db?.cronManager?.removeSignalHandlers) {
      ctx.db.cronManager.removeSignalHandlers();
    }
    if (ctx.db) {
      await ctx.db.disconnect();
      ctx.db = null;
    }
    MemoryClient.clearAllStorage();
  });

  ctx.createStoresResource = async (overrides = {}) => {
    const {
      name = 'stores',
      attributes = {
        name: 'string',
        latitude: 'number',
        longitude: 'number'
      },
      ...rest
    } = overrides;

    return ctx.db.createResource({
      name,
      attributes,
      ...rest
    });
  };

  ctx.installPlugin = async (pluginOptions) => {
    const plugin = new GeoPlugin(pluginOptions);
    await ctx.db.usePlugin(plugin);
    return plugin;
  };

  return ctx;
}
