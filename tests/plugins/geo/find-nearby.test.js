
import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';
import { setupGeoSuite } from './helpers.js';

const SAO_PAULO = { lat: -23.5505, lon: -46.6333 };

describe('Geo Plugin - findNearby()', () => {
  const ctx = setupGeoSuite();

  test('finds nearby locations without partitions', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'silent',resources: {
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

    await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });
    await resource.insert({ name: 'Store 2', latitude: -23.5555, longitude: -46.6383 });
    await resource.insert({ name: 'Store 3', latitude: -23.6505, longitude: -46.7333 });

    const nearby = await resource.findNearby({
      lat: SAO_PAULO.lat,
      lon: SAO_PAULO.lon,
      radius: 10,
      limit: 10
    });

    expect(nearby).toHaveLength(2);
    expect(nearby[0]._distance).toBeDefined();
    expect(nearby.every(r => r._distance <= 10)).toBe(true);
    expect(nearby[0]._distance).toBeLessThanOrEqual(nearby[1]._distance);
  });

  test('finds nearby locations with partitions', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'debug',  // Test expects verbose logging output
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

    await resource.insert({ id: 'store1', name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });
    await resource.insert({ id: 'store2', name: 'Store 2', latitude: -23.5555, longitude: -46.6383 });

    await new Promise(resolve => setTimeout(resolve, 100));

    const logSpy = vi.spyOn(console, 'log').mockImplementation();

    const nearby = await resource.findNearby({
      lat: SAO_PAULO.lat,
      lon: SAO_PAULO.lon,
      radius: 10,
      limit: 10
    });

    expect(nearby.length).toBeGreaterThan(0);
    expect(nearby.every(r => r._distance <= 10)).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('findNearby searched'));

    logSpy.mockRestore();
  });

  test('throws when lat/lon missing', async () => {
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

    await expect(resource.findNearby({ radius: 10 })).rejects.toThrow(
      'Latitude and longitude are required for findNearby()'
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
      logLevel: 'silent',resources: {
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

    await resource.insert({ id: 'inside', name: 'Inside', latitude: SAO_PAULO.lat, longitude: SAO_PAULO.lon });
    await resource.insert({ id: 'noloc', name: 'No Location' });

    await new Promise(resolve => setTimeout(resolve, 100));

    const nearby = await resource.findNearby({
      lat: SAO_PAULO.lat,
      lon: SAO_PAULO.lon,
      radius: 10,
      limit: 10
    });

    expect(nearby.length).toBe(1);
    expect(nearby[0].id).toBe('inside');
  });

  test('respects limit parameter', async () => {
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

    for (let i = 0; i < 5; i++) {
      await resource.insert({
        name: `Store ${i}`,
        latitude: SAO_PAULO.lat + (i * 0.01),
        longitude: SAO_PAULO.lon + (i * 0.01)
      });
    }

    const nearby = await resource.findNearby({
      lat: SAO_PAULO.lat,
      lon: SAO_PAULO.lon,
      radius: 100,
      limit: 3
    });

    expect(nearby.length).toBe(3);
  });

  test('logs auto-selected zoom for partitioned searches', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'debug',  // Test expects verbose logging output
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
    await resource.insert({ name: 'Store 1', latitude: SAO_PAULO.lat, longitude: SAO_PAULO.lon });
    await resource.insert({ name: 'Store 2', latitude: SAO_PAULO.lat + 0.01, longitude: SAO_PAULO.lon + 0.01 });

    const logSpy = vi.spyOn(console, 'log').mockImplementation();

    await resource.findNearby({
      lat: SAO_PAULO.lat,
      lon: SAO_PAULO.lon,
      radius: 1,
      limit: 10
    });

    const zoomLog = logSpy.mock.calls.find(call => call[0].includes('Auto-selected zoom'));
    expect(zoomLog).toBeDefined();

    logSpy.mockRestore();
  });

  test('adapts zoom level to radius size', async () => {
    await ctx.createStoresResource();

    const plugin = new GeoPlugin({
      logLevel: 'debug',  // Test expects verbose logging output
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          usePartitions: true,
          zoomLevels: [4, 5, 6, 7, 8]
        }
      }
    });

    await ctx.db.usePlugin(plugin);

    const resource = ctx.db.resources.stores;
    for (let i = 0; i < 5; i++) {
      await resource.insert({
        name: `Store ${i}`,
        latitude: SAO_PAULO.lat + (i * 0.01),
        longitude: SAO_PAULO.lon + (i * 0.01)
      });
    }

    const logSpy = vi.spyOn(console, 'log').mockImplementation();

    await resource.findNearby({ lat: SAO_PAULO.lat, lon: SAO_PAULO.lon, radius: 50, limit: 10 });
    const largeLog = logSpy.mock.calls.find(call => call[0].includes('50km radius'));
    expect(largeLog).toBeDefined();
    expect(largeLog[0]).toContain('zoom5');

    logSpy.mockClear();

    await resource.findNearby({ lat: SAO_PAULO.lat, lon: SAO_PAULO.lon, radius: 0.1, limit: 10 });
    const smallLog = logSpy.mock.calls.find(call => call[0].includes('0.1km radius'));
    expect(smallLog).toBeDefined();
    expect(smallLog[0]).toContain('zoom8');

    logSpy.mockRestore();
  });
});

