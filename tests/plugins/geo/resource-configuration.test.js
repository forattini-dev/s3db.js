import { describe, expect, jest, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Resource configuration', () => {
  const ctx = setupGeoSuite();

  test('throws when latField is missing', async () => {
    await ctx.createStoresResource({
      attributes: {
        name: 'string',
        longitude: 'number'
      }
    });

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    await expect(ctx.db.usePlugin(plugin)).rejects.toThrow('must have "latField" and "lonField" configured');
  });

  test('throws when lonField is missing', async () => {
    await ctx.createStoresResource({
      attributes: {
        name: 'string',
        latitude: 'number'
      }
    });

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          precision: 5
        }
      }
    });

    await expect(ctx.db.usePlugin(plugin)).rejects.toThrow('must have "latField" and "lonField" configured');
  });

  test('uses default precision when invalid precision provided', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: true,  // Test expects verbose logging output
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 999
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    expect(resource._geoConfig.precision).toBe(5);

    logSpy.mockRestore();
  });

  test('warns when resource is not found', async () => {
    const plugin = new GeoPlugin({
      verbose: true,  // Test expects verbose logging output
      resources: {
        nonexistent: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    const warnSpy = jest.spyOn(plugin.logger, 'warn').mockImplementation();

    await ctx.db.usePlugin(plugin);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ resourceName: 'nonexistent' }),
      expect.stringContaining('Resource "nonexistent" not found')
    );

    warnSpy.mockRestore();
  });

  test('adds geohash fields when addGeohash is true', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,resources: {
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
    expect(resource.attributes.geohash).toBeDefined();
    expect(resource.attributes._geohash).toBeDefined();
  });

  test('skips external geohash field when addGeohash is false', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          addGeohash: false
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    expect(resource.attributes.geohash).toBeUndefined();
    expect(resource.attributes._geohash).toBeDefined();
  });
});
