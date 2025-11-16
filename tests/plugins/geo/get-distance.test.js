import { describe, expect, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - getDistance()', () => {
  const ctx = setupGeoSuite();

  test('returns distance metadata between two records', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'silent',resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;

    const store1 = await resource.insert({
      name: 'Store 1',
      latitude: -23.5505,
      longitude: -46.6333
    });

    const store2 = await resource.insert({
      name: 'Store 2',
      latitude: -23.5555,
      longitude: -46.6383
    });

    const result = await resource.getDistance(store1.id, store2.id);

    expect(result.distance).toBeGreaterThan(0);
    expect(result.distance).toBeLessThan(1);
    expect(result.unit).toBe('km');
    expect(result.from).toBe(store1.id);
    expect(result.to).toBe(store2.id);
  });

  test('throws when record not found', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'silent',resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;
    const store = await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });

    await expect(resource.getDistance(store.id, 'nonexistent')).rejects.toThrow(
      'One or both records not found'
    );
  });

  test('throws when coordinates are missing', async () => {
    await ctx.createStoresResource({
      attributes: {
        name: 'string',
        latitude: { type: 'number', optional: true },
        longitude: { type: 'number', optional: true }
      }
    });

    const plugin = new GeoPlugin({
      logLevel: 'silent',resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;

    const storeWithCoords = await resource.insert({
      name: 'Store 1',
      latitude: -23.5505,
      longitude: -46.6333
    });

    const storeWithoutCoords = await resource.insert({ name: 'Store 2' });

    await expect(resource.getDistance(storeWithCoords.id, storeWithoutCoords.id)).rejects.toThrow(
      'One or both records are missing coordinates'
    );
  });
});

