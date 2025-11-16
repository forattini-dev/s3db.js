import { describe, expect, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Automatic geohash calculation', () => {
  const ctx = setupGeoSuite();

  test('calculates geohash on insert', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'silent',resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          addGeohash: true
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    const record = await resource.insert({
      name: 'Store 1',
      latitude: -23.5505,
      longitude: -46.6333
    });

    expect(record.geohash).toBeDefined();
    expect(record.geohash).toHaveLength(5);
    expect(record._geohash).toBe(record.geohash);
  });

  test('recomputes geohash on update', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'silent',resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          addGeohash: true
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    const record = await resource.insert({
      name: 'Store 1',
      latitude: -23.5505,
      longitude: -46.6333
    });

    const updated = await resource.update(record.id, {
      latitude: -23.6,
      longitude: -46.7
    });

    expect(updated.geohash).toBeDefined();
    expect(updated.geohash).not.toBe(record.geohash);
  });

  test('skips geohash when coordinates missing', async () => {
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
          precision: 5,
          addGeohash: true
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    const record = await resource.insert({
      name: 'No Location Store'
    });

    expect(record.geohash).toBeUndefined();
    expect(record._geohash).toBeUndefined();
  });
});

