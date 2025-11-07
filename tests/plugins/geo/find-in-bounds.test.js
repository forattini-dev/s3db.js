import { describe, expect, jest, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

const BOUNDS = {
  north: -23.5,
  south: -23.6,
  east: -46.6,
  west: -46.7
};

describe('Geo Plugin - findInBounds()', () => {
  const ctx = setupGeoSuite();

  test('finds records within bounding box without partitions', async () => {
    await ctx.createStoresResource();

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

    const resource = ctx.db.resources.stores;

    await resource.insert({ name: 'Inside 1', latitude: -23.5505, longitude: -46.6333 });
    await resource.insert({ name: 'Inside 2', latitude: -23.5555, longitude: -46.6383 });
    await resource.insert({ name: 'Outside', latitude: -22.0, longitude: -43.0 });

    const results = await resource.findInBounds(BOUNDS);

    expect(results).toHaveLength(2);
    expect(results.every(r => r.latitude <= BOUNDS.north && r.latitude >= BOUNDS.south)).toBe(true);
    expect(results.every(r => r.longitude <= BOUNDS.east && r.longitude >= BOUNDS.west)).toBe(true);
  });

  test('uses partitions when available', async () => {
    await ctx.createStoresResource({ asyncPartitions: false });

    const plugin = new GeoPlugin({
      verbose: false,
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: true
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;
    await resource.insert({ name: 'Inside', latitude: -23.5505, longitude: -46.6333 });

    await new Promise(resolve => setTimeout(resolve, 500));

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    const results = await resource.findInBounds(BOUNDS);

    expect(results.length).toBeGreaterThan(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('findInBounds searched'));

    logSpy.mockRestore();
  });

  test('requires full bounding box parameters', async () => {
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

    const resource = ctx.db.resources.stores;

    await expect(resource.findInBounds({ north: 1, south: 0 })).rejects.toThrow(
      'Bounding box requires north, south, east, west coordinates'
    );
  });

  test('ignores records without coordinates', async () => {
    await ctx.createStoresResource({
      attributes: {
        name: 'string',
        latitude: { type: 'number', optional: true },
        longitude: { type: 'number', optional: true }
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

    const resource = ctx.db.resources.stores;
    await resource.insert({ id: 'inside', name: 'Inside', latitude: -23.5505, longitude: -46.6333 });
    await resource.insert({ id: 'noloc', name: 'Missing Coords' });

    await new Promise(resolve => setTimeout(resolve, 100));

    const results = await resource.findInBounds(BOUNDS);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('inside');
  });

  test('respects limit parameter', async () => {
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

    const resource = ctx.db.resources.stores;
    for (let i = 0; i < 5; i++) {
      await resource.insert({
        name: `Store ${i}`,
        latitude: -23.5505 + (i * 0.01),
        longitude: -46.6333 + (i * 0.01)
      });
    }

    const results = await resource.findInBounds({ ...BOUNDS, limit: 2 });
    expect(results).toHaveLength(2);
  });

  test('logs auto-selected zoom for bounds queries', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      verbose: false,
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: true,
          zoomLevels: [4, 5, 6, 7]
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;
    await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await resource.findInBounds(BOUNDS);

    const zoomLog = logSpy.mock.calls.find(call => call[0].includes('Auto-selected zoom'));
    expect(zoomLog).toBeDefined();

    logSpy.mockRestore();
  });
});

