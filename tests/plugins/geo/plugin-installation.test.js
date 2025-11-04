import { describe, expect, jest, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Installation', () => {
  setupGeoSuite();

  test('installs plugin successfully', async () => {
    const plugin = new GeoPlugin({
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    const db = await importDatabase();
    await db.usePlugin(plugin);

    expect(plugin.database).toBe(db);
    expect(Object.keys(plugin.resources)).toHaveLength(1);
  });

  test('logs when verbose mode enabled', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    const plugin = new GeoPlugin({
      verbose: true,
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    const db = await importDatabase();
    await db.usePlugin(plugin);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[GeoPlugin] Installed with 1 resources')
    );

    logSpy.mockRestore();
  });

  test('emits installed event', async () => {
    const plugin = new GeoPlugin({
      resources: {
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

    const db = await importDatabase();
    await db.usePlugin(plugin);

    expect(payload).toEqual({
      plugin: 'GeoPlugin',
      resources: ['stores']
    });
  });
});

async function importDatabase() {
  const { getCurrentDatabase } = await import('./shared-state.js');
  return getCurrentDatabase();
}
