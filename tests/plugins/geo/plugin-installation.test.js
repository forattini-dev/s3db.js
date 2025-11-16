import { describe, expect, jest, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Installation', () => {
  const ctx = setupGeoSuite();

  test('installs plugin successfully', async () => {
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

    expect(plugin.database).toBe(ctx.db);
    expect(Object.keys(plugin.resources)).toHaveLength(1);
  });

  test('logs when verbose mode enabled', async () => {
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

    const logSpy = jest.spyOn(plugin.logger, 'debug').mockImplementation();

    await ctx.db.usePlugin(plugin);

    expect(logSpy).toHaveBeenCalledWith(
      { resourceCount: 1 },
      expect.stringContaining('Installed with 1 resources')
    );

    logSpy.mockRestore();
  });

  test('emits installed event', async () => {
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
    plugin.on('db:plugin:installed', (data) => {
      payload = data;
    });

    await ctx.db.usePlugin(plugin);

    expect(payload).toEqual({
      plugin: 'GeoPlugin',
      resources: ['stores']
    });
  });
});
