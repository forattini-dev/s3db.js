import { describe, expect, jest, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Stats and uninstall', () => {
  const ctx = setupGeoSuite();

  test('reports plugin configuration stats', () => {
    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        },
        restaurants: {
          latField: 'lat',
          lonField: 'lon',
          precision: 6
        }
      }
    });

    const stats = plugin.getStats();

    expect(stats.resources).toBe(2);
    expect(stats.configurations).toHaveLength(2);
    expect(stats.configurations[0]).toMatchObject({
      resource: 'stores',
      latField: 'latitude',
      lonField: 'longitude',
      precision: 5,
      cellSize: '~4.9km'
    });
    expect(stats.configurations[1].precision).toBe(6);
    expect(stats.configurations[1].cellSize).toBe('~1.2km');
  });

  test('uninstalls cleanly', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    await ctx.db.usePlugin(plugin);
    await expect(plugin.uninstall()).resolves.not.toThrow();
  });

  test('emits uninstall event', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    let payload = null;
    plugin.on('db:plugin:uninstalled', data => {
      payload = data;
    });

    await ctx.db.usePlugin(plugin);
    await plugin.uninstall();

    expect(payload).toEqual({ plugin: 'GeoPlugin' });
  });

  test('logs uninstall when verbose', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: true,  // Test expects verbose logging output
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await ctx.db.usePlugin(plugin);
    await plugin.uninstall();

    expect(logSpy).toHaveBeenCalledWith('[GeoPlugin] Uninstalled');

    logSpy.mockRestore();
  });
});

