import { describe, expect, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Zoom levels', () => {
  const ctx = setupGeoSuite();

  test('adds zoom-specific geohash fields to resource schema', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: true,
          zoomLevels: [4, 5, 6]
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;
    expect(resource.attributes._geohash_zoom4).toBeDefined();
    expect(resource.attributes._geohash_zoom5).toBeDefined();
    expect(resource.attributes._geohash_zoom6).toBeDefined();

    const record = await resource.insert({
      name: 'Store 1',
      latitude: -23.5505,
      longitude: -46.6333
    });

    expect(record._geohash_zoom4).toHaveLength(4);
    expect(record._geohash_zoom5).toHaveLength(5);
    expect(record._geohash_zoom6).toHaveLength(6);
    expect(record._geohash_zoom5.startsWith(record._geohash_zoom4)).toBe(true);
    expect(record._geohash_zoom6.startsWith(record._geohash_zoom5)).toBe(true);
  });

  test('does not duplicate partitions on repeated setup', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: true,
          zoomLevels: [4, 5]
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;
    const originalPartitions = Object.keys(resource.config.partitions).length;

    await plugin._setupPartitions(resource, plugin.resources.stores);

    const newPartitions = Object.keys(resource.config.partitions).length;
    expect(newPartitions).toBe(originalPartitions);
  });
});
