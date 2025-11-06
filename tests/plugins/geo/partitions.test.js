import { describe, expect, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

describe('Geo Plugin - Partitions', () => {
  const ctx = setupGeoSuite();

  test('creates geohash partition when enabled', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: true
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    expect(resource.config.partitions?.byGeohash).toBeDefined();
    expect(resource.config.partitions.byGeohash.fields._geohash).toBe('string');
  });

  test('skips partition creation when disabled', async () => {
    await ctx.createStoresResource({
      options: {
        partitions: {}
      }
    });

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: false
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    expect(resource.config.partitions?.byGeohash).toBeUndefined();
  });

  test('does not duplicate existing geohash partition', async () => {
    await ctx.createStoresResource({
      attributes: {
        name: 'string',
        latitude: 'number',
        longitude: 'number',
        _geohash: 'string'
      },
      options: {
        partitions: {
          byGeohash: {
            fields: {
              _geohash: 'string'
            }
          }
        }
      }
    });

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: true
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = plugin.database.resources.stores;
    expect(resource.config.partitions.byGeohash).toBeDefined();
  });
});

