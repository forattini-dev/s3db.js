import { jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import GeoPlugin from '../../src/plugins/geo.plugin.js';

describe('GeoPlugin', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/geo');
    await database.connect();
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Plugin Installation', () => {
    test('should install plugin successfully', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      expect(plugin.database).toBe(database);
      expect(Object.keys(plugin.resources)).toHaveLength(1);
    });

    test('should handle verbose mode', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

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

      await database.usePlugin(plugin);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[GeoPlugin] Installed with 1 resources')
      );

      consoleLogSpy.mockRestore();
    });

    test('should emit installed event', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      let installedEvent = null;
      plugin.on('installed', (data) => {
        installedEvent = data;
      });

      await database.usePlugin(plugin);

      expect(installedEvent).toEqual({
        plugin: 'GeoPlugin',
        resources: ['stores']
      });
    });
  });

  describe('Resource Configuration', () => {
    test('should throw error if latField missing', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          longitude: 'number'
        }
      });

      await expect(database.usePlugin(plugin)).rejects.toThrow(
        'must have "latField" and "lonField" configured'
      );
    });

    test('should throw error if lonField missing', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            precision: 5
          }
        }
      });

      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number'
        }
      });

      await expect(database.usePlugin(plugin)).rejects.toThrow(
        'must have "latField" and "lonField" configured'
      );
    });

    test('should use default precision if invalid', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 999 // Invalid
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      expect(resource._geoConfig.precision).toBe(5); // Default

      consoleLogSpy.mockRestore();
    });

    test('should warn if resource not found', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const plugin = new GeoPlugin({
        verbose: true,
        resources: {
          nonexistent: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resource "nonexistent" not found')
      );

      consoleWarnSpy.mockRestore();
    });

    test('should add geohash field when addGeohash is true', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            addGeohash: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      expect(resource.attributes.geohash).toBeDefined();
      expect(resource.attributes._geohash).toBeDefined();
    });

    test('should not add geohash field when addGeohash is false', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            addGeohash: false
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      expect(resource.attributes.geohash).toBeUndefined();
      expect(resource.attributes._geohash).toBeDefined(); // Always added
    });
  });

  describe('Partitions', () => {
    test('should create geohash partition when usePartitions is true', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      expect(resource.config.partitions).toBeDefined();
      expect(resource.config.partitions.byGeohash).toBeDefined();
      expect(resource.config.partitions.byGeohash.fields._geohash).toBe('string');
    });

    test('should not create partition when usePartitions is false', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        },
        options: {
          partitions: {}
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: false
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      expect(resource.config.partitions?.byGeohash).toBeUndefined();
    });

    test('should not duplicate partition if already exists', async () => {
      await database.createResource({
        name: 'stores',
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
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      expect(resource.config.partitions.byGeohash).toBeDefined();
    });
  });

  describe('Automatic Geohash Calculation', () => {
    test('should calculate geohash on insert', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            addGeohash: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      const record = await resource.insert({
        name: 'Store 1',
        latitude: -23.5505,
        longitude: -46.6333
      });

      expect(record.geohash).toBeDefined();
      expect(record.geohash).toHaveLength(5);
      expect(record._geohash).toBe(record.geohash);
    });

    test('should calculate geohash on update', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            addGeohash: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      const record = await resource.insert({
        name: 'Store 1',
        latitude: -23.5505,
        longitude: -46.6333
      });

      const updated = await resource.update(record.id, {
        latitude: -23.6000,
        longitude: -46.7000
      });

      expect(updated.geohash).toBeDefined();
      expect(updated.geohash).not.toBe(record.geohash); // Different location = different geohash
    });

    test('should not add geohash if coordinates missing', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: { type: 'number', optional: true },  // Explicitly optional
          longitude: { type: 'number', optional: true }   // Explicitly optional
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            addGeohash: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      const record = await resource.insert({
        name: 'Store Without Location'
      });

      expect(record.geohash).toBeUndefined();
      expect(record._geohash).toBeUndefined();
    });
  });

  describe('Geohash Encoding/Decoding', () => {
    test('should encode coordinates to geohash', () => {
      const plugin = new GeoPlugin({});
      const geohash = plugin.encodeGeohash(-23.5505, -46.6333, 5);

      expect(geohash).toBe('6gyf4');
      expect(geohash).toHaveLength(5);
    });

    test('should encode with different precisions', () => {
      const plugin = new GeoPlugin({});

      const hash4 = plugin.encodeGeohash(-23.5505, -46.6333, 4);
      const hash6 = plugin.encodeGeohash(-23.5505, -46.6333, 6);

      expect(hash4).toHaveLength(4);
      expect(hash6).toHaveLength(6);
      expect(hash6.startsWith(hash4)).toBe(true); // Higher precision starts with lower
    });

    test('should decode geohash to coordinates', () => {
      const plugin = new GeoPlugin({});
      const decoded = plugin.decodeGeohash('6gyf4');

      expect(decoded.latitude).toBeCloseTo(-23.5505, 1);
      expect(decoded.longitude).toBeCloseTo(-46.6333, 1);
      expect(decoded.error).toBeDefined();
      expect(decoded.error.latitude).toBeGreaterThan(0);
      expect(decoded.error.longitude).toBeGreaterThan(0);
    });

    test('should throw error on invalid geohash character', () => {
      const plugin = new GeoPlugin({});

      // 'a' is not in base32 alphabet (0123456789bcdefghjkmnpqrstuvwxyz)
      expect(() => plugin.decodeGeohash('abc')).toThrow(
        'Invalid geohash character: a'
      );
    });

    test('should encode and decode roundtrip', () => {
      const plugin = new GeoPlugin({});
      const originalLat = -23.5505;
      const originalLon = -46.6333;

      const encoded = plugin.encodeGeohash(originalLat, originalLon, 8);
      const decoded = plugin.decodeGeohash(encoded);

      expect(decoded.latitude).toBeCloseTo(originalLat, 3);
      expect(decoded.longitude).toBeCloseTo(originalLon, 3);
    });
  });

  describe('Distance Calculation', () => {
    test('should calculate distance between two points', () => {
      const plugin = new GeoPlugin({});

      // São Paulo to Rio de Janeiro (≈360 km)
      const distance = plugin.calculateDistance(
        -23.5505, -46.6333,  // São Paulo
        -22.9068, -43.1729   // Rio de Janeiro
      );

      expect(distance).toBeGreaterThan(350);
      expect(distance).toBeLessThan(370);
    });

    test('should return 0 for same point', () => {
      const plugin = new GeoPlugin({});

      const distance = plugin.calculateDistance(
        -23.5505, -46.6333,
        -23.5505, -46.6333
      );

      expect(distance).toBeLessThan(0.001);
    });

    test('should handle equator crossing', () => {
      const plugin = new GeoPlugin({});

      const distance = plugin.calculateDistance(
        5.0, 0.0,
        -5.0, 0.0
      );

      expect(distance).toBeGreaterThan(1100);
      expect(distance).toBeLessThan(1120);
    });
  });

  describe('Geohash Neighbors', () => {
    test('should return 8 neighbors', () => {
      const plugin = new GeoPlugin({});
      const neighbors = plugin.getNeighbors('6gyf4');

      expect(neighbors).toHaveLength(8);
      expect(neighbors.every(n => typeof n === 'string')).toBe(true);
      expect(neighbors.every(n => n.length === 5)).toBe(true);
    });

    test('should return unique neighbors', () => {
      const plugin = new GeoPlugin({});
      const neighbors = plugin.getNeighbors('6gyf4');

      const unique = new Set(neighbors);
      expect(unique.size).toBe(8);
    });

    test('should not include center geohash', () => {
      const plugin = new GeoPlugin({});
      const center = '6gyf4';
      const neighbors = plugin.getNeighbors(center);

      expect(neighbors).not.toContain(center);
    });
  });

  describe('Bounding Box Geohashes', () => {
    test('should return geohashes covering bounding box', () => {
      const plugin = new GeoPlugin({});

      // Small area in São Paulo
      const geohashes = plugin._getGeohashesInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7,
        precision: 5
      });

      expect(geohashes.length).toBeGreaterThan(0);
      expect(geohashes.every(g => typeof g === 'string')).toBe(true);
      expect(geohashes.every(g => g.length === 5)).toBe(true);
    });

    test('should return unique geohashes', () => {
      const plugin = new GeoPlugin({});

      const geohashes = plugin._getGeohashesInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7,
        precision: 4
      });

      const unique = new Set(geohashes);
      expect(unique.size).toBe(geohashes.length);
    });

    test('should include corner geohashes', () => {
      const plugin = new GeoPlugin({});

      const geohashes = plugin._getGeohashesInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7,
        precision: 5
      });

      // Encode corners and check they're included
      const nw = plugin.encodeGeohash(-23.5, -46.7, 5);
      const ne = plugin.encodeGeohash(-23.5, -46.6, 5);
      const sw = plugin.encodeGeohash(-23.6, -46.7, 5);
      const se = plugin.encodeGeohash(-23.6, -46.6, 5);

      expect(geohashes).toContain(nw);
      expect(geohashes).toContain(ne);
      expect(geohashes).toContain(sw);
      expect(geohashes).toContain(se);
    });
  });

  describe('findNearby()', () => {
    test('should find nearby locations without partitions', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: false
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Insert stores in São Paulo area
      await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });
      await resource.insert({ name: 'Store 2', latitude: -23.5555, longitude: -46.6383 });
      await resource.insert({ name: 'Store 3', latitude: -23.6505, longitude: -46.7333 }); // Far away

      const nearby = await resource.findNearby({
        lat: -23.5505,
        lon: -46.6333,
        radius: 10,
        limit: 10
      });

      expect(nearby.length).toBe(2); // Store 1 and 2
      expect(nearby[0]._distance).toBeDefined();
      expect(nearby[0]._distance).toBeLessThan(10);
      expect(nearby.every(r => r._distance <= 10)).toBe(true);
      expect(nearby[0]._distance).toBeLessThanOrEqual(nearby[1]._distance); // Sorted by distance
    });

    test('should find nearby locations with partitions', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Insert stores
      await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });
      await resource.insert({ name: 'Store 2', latitude: -23.5555, longitude: -46.6383 });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const nearby = await resource.findNearby({
        lat: -23.5505,
        lon: -46.6333,
        radius: 10,
        limit: 10
      });

      expect(nearby.length).toBeGreaterThan(0);
      expect(nearby.every(r => r._distance <= 10)).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('findNearby searched')
      );

      consoleLogSpy.mockRestore();
    });

    test('should throw error if lat/lon missing', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      await expect(resource.findNearby({ radius: 10 })).rejects.toThrow(
        'lat and lon are required'
      );
    });

    test('should handle records without coordinates', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: { type: 'number', optional: true },
          longitude: { type: 'number', optional: true }
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });
      await resource.insert({ name: 'Store No Location' }); // No coordinates

      const nearby = await resource.findNearby({
        lat: -23.5505,
        lon: -46.6333,
        radius: 100,
        limit: 10
      });

      expect(nearby.length).toBe(1); // Only Store 1
    });

    test('should respect limit parameter', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Insert multiple stores
      for (let i = 0; i < 5; i++) {
        await resource.insert({
          name: `Store ${i}`,
          latitude: -23.5505 + (i * 0.01),
          longitude: -46.6333 + (i * 0.01)
        });
      }

      const nearby = await resource.findNearby({
        lat: -23.5505,
        lon: -46.6333,
        radius: 100,
        limit: 3
      });

      expect(nearby.length).toBe(3);
    });
  });

  describe('findInBounds()', () => {
    test('should find locations in bounding box without partitions', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: false
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      await resource.insert({ name: 'Inside 1', latitude: -23.5505, longitude: -46.6333 });
      await resource.insert({ name: 'Inside 2', latitude: -23.5555, longitude: -46.6383 });
      await resource.insert({ name: 'Outside', latitude: -22.0000, longitude: -43.0000 });

      const inBounds = await resource.findInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7
      });

      expect(inBounds.length).toBe(2);
      expect(inBounds.every(r => r.latitude <= -23.5 && r.latitude >= -23.6)).toBe(true);
      expect(inBounds.every(r => r.longitude <= -46.6 && r.longitude >= -46.7)).toBe(true);
    });

    test('should find locations in bounding box with partitions', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: true
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      await resource.insert({ name: 'Inside', latitude: -23.5505, longitude: -46.6333 });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const inBounds = await resource.findInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7
      });

      expect(inBounds.length).toBeGreaterThan(0);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('findInBounds searched')
      );

      consoleLogSpy.mockRestore();
    });

    test('should throw error if bounds missing', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      await expect(resource.findInBounds({ north: 1, south: 0 })).rejects.toThrow(
        'north, south, east, west are required'
      );
    });

    test('should handle records without coordinates', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: { type: 'number', optional: true },
          longitude: { type: 'number', optional: true }
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      await resource.insert({ name: 'Inside', latitude: -23.5505, longitude: -46.6333 });
      await resource.insert({ name: 'No Location' });

      const inBounds = await resource.findInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7
      });

      expect(inBounds.length).toBe(1);
    });

    test('should respect limit parameter', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      for (let i = 0; i < 5; i++) {
        await resource.insert({
          name: `Store ${i}`,
          latitude: -23.5505 + (i * 0.01),
          longitude: -46.6333 + (i * 0.01)
        });
      }

      const inBounds = await resource.findInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7,
        limit: 2
      });

      expect(inBounds.length).toBe(2);
    });
  });

  describe('getDistance()', () => {
    test('should get distance between two records', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

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
      expect(result.distance).toBeLessThan(1); // Less than 1 km
      expect(result.unit).toBe('km');
      expect(result.from).toBe(store1.id);
      expect(result.to).toBe(store2.id);
    });

    test('should throw error if record not found', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      const store1 = await resource.insert({
        name: 'Store 1',
        latitude: -23.5505,
        longitude: -46.6333
      });

      await expect(resource.getDistance(store1.id, 'nonexistent')).rejects.toThrow(
        'One or both records not found'
      );
    });

    test('should throw error if coordinates missing', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: { type: 'number', optional: true },
          longitude: { type: 'number', optional: true }
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      const store1 = await resource.insert({
        name: 'Store 1',
        latitude: -23.5505,
        longitude: -46.6333
      });

      const store2 = await resource.insert({
        name: 'Store 2 No Location'
      });

      await expect(resource.getDistance(store1.id, store2.id)).rejects.toThrow(
        'One or both records missing coordinates'
      );
    });
  });

  describe('Resource Created After Plugin Install', () => {
    test('should setup resource created after plugin installation', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            addGeohash: true
          }
        }
      });

      await database.usePlugin(plugin);

      // Create resource AFTER plugin installation
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const resource = database.resource('stores');

      // Should have geo capabilities
      expect(resource._geoConfig).toBeDefined();
      expect(resource.findNearby).toBeDefined();
      expect(resource.findInBounds).toBeDefined();
      expect(resource.getDistance).toBeDefined();

      // Test functionality
      const record = await resource.insert({
        name: 'Store 1',
        latitude: -23.5505,
        longitude: -46.6333
      });

      expect(record.geohash).toBeDefined();
    });
  });

  describe('getStats()', () => {
    test('should return plugin statistics', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          },
          restaurants: {
            latField: 'lat',
            lonField: 'lng',
            precision: 6
          }
        }
      });

      const stats = plugin.getStats();

      expect(stats.resources).toBe(2);
      expect(stats.configurations).toHaveLength(2);
      expect(stats.configurations[0].resource).toBe('stores');
      expect(stats.configurations[0].latField).toBe('latitude');
      expect(stats.configurations[0].lonField).toBe('longitude');
      expect(stats.configurations[0].precision).toBe(5);
      expect(stats.configurations[0].cellSize).toBe('~4.9km');
      expect(stats.configurations[1].precision).toBe(6);
      expect(stats.configurations[1].cellSize).toBe('~1.2km');
    });
  });

  describe('Precision Distance Helper', () => {
    test('should return correct distances for all precision levels', () => {
      const plugin = new GeoPlugin({});

      expect(plugin._getPrecisionDistance(1)).toBe(5000);
      expect(plugin._getPrecisionDistance(2)).toBe(1250);
      expect(plugin._getPrecisionDistance(3)).toBe(156);
      expect(plugin._getPrecisionDistance(4)).toBe(39);
      expect(plugin._getPrecisionDistance(5)).toBe(4.9);
      expect(plugin._getPrecisionDistance(6)).toBe(1.2);
      expect(plugin._getPrecisionDistance(7)).toBe(0.15);
      expect(plugin._getPrecisionDistance(8)).toBe(0.038);
      expect(plugin._getPrecisionDistance(9)).toBe(0.0047);
      expect(plugin._getPrecisionDistance(10)).toBe(0.0012);
      expect(plugin._getPrecisionDistance(11)).toBe(0.00015);
      expect(plugin._getPrecisionDistance(12)).toBe(0.000037);
    });

    test('should return default for unknown precision', () => {
      const plugin = new GeoPlugin({});
      expect(plugin._getPrecisionDistance(999)).toBe(5);
    });
  });

  describe('Uninstall', () => {
    test('should uninstall plugin successfully', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      await database.usePlugin(plugin);

      // Uninstall should complete without errors
      await expect(plugin.uninstall()).resolves.not.toThrow();
    });

    test('should emit uninstalled event', async () => {
      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5
          }
        }
      });

      let uninstalledEvent = null;
      plugin.on('uninstalled', (data) => {
        uninstalledEvent = data;
      });

      await database.usePlugin(plugin);
      await plugin.uninstall();

      expect(uninstalledEvent).toEqual({
        plugin: 'GeoPlugin'
      });
    });

    test('should log uninstall in verbose mode', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

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

      await database.usePlugin(plugin);
      await plugin.uninstall();

      expect(consoleLogSpy).toHaveBeenCalledWith('[GeoPlugin] Uninstalled');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Multi-Zoom Partitions', () => {
    test('should create multiple zoom partitions when zoomLevels configured', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
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

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Should have created 4 partitions
      expect(resource.config.partitions.byGeohashZoom4).toBeDefined();
      expect(resource.config.partitions.byGeohashZoom5).toBeDefined();
      expect(resource.config.partitions.byGeohashZoom6).toBeDefined();
      expect(resource.config.partitions.byGeohashZoom7).toBeDefined();

      // Should have logged partition creation
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('byGeohashZoom4')
      );

      consoleLogSpy.mockRestore();
    });

    test('should calculate geohash at all zoom levels on insert', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: true,
            zoomLevels: [4, 5, 6]
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');
      const record = await resource.insert({
        name: 'Store 1',
        latitude: -23.5505,
        longitude: -46.6333
      });

      // Should have geohash at each zoom level
      expect(record._geohash_zoom4).toBeDefined();
      expect(record._geohash_zoom4).toHaveLength(4);
      expect(record._geohash_zoom5).toBeDefined();
      expect(record._geohash_zoom5).toHaveLength(5);
      expect(record._geohash_zoom6).toBeDefined();
      expect(record._geohash_zoom6).toHaveLength(6);

      // Higher precision should start with lower precision
      expect(record._geohash_zoom5.startsWith(record._geohash_zoom4)).toBe(true);
      expect(record._geohash_zoom6.startsWith(record._geohash_zoom5)).toBe(true);
    });

    test('should select optimal zoom based on radius', () => {
      const plugin = new GeoPlugin({});

      // Large radius - selects zoom closest to radius/2.5
      // For 20km radius: targetCellSize = 20/2.5 = 8km
      // zoom4=39km (diff=31), zoom5=4.9km (diff=3.1) → selects zoom5
      const zoom1 = plugin._selectOptimalZoom([4, 5, 6, 7], 20); // 20km
      expect(zoom1).toBe(5); // ~4.9km cells (closest to 8km target)

      // Medium radius
      // For 5km radius: targetCellSize = 5/2.5 = 2km
      // zoom5=4.9km (diff=2.9), zoom6=1.2km (diff=0.8) → selects zoom6
      const zoom2 = plugin._selectOptimalZoom([4, 5, 6, 7], 5); // 5km
      expect(zoom2).toBe(6); // ~1.2km cells (closest to 2km target)

      // Small radius
      // For 1km radius: targetCellSize = 1/2.5 = 0.4km
      // zoom6=1.2km (diff=0.8), zoom7=0.15km (diff=0.25) → selects zoom7
      const zoom3 = plugin._selectOptimalZoom([4, 5, 6, 7], 1); // 1km
      expect(zoom3).toBe(7); // ~0.15km cells (closest to 0.4km target)

      // Very small radius
      // For 0.2km radius: targetCellSize = 0.2/2.5 = 0.08km
      // zoom7=0.15km (diff=0.07), zoom6=1.2km (diff=1.12) → selects zoom7
      const zoom4 = plugin._selectOptimalZoom([4, 5, 6, 7], 0.2); // 200m
      expect(zoom4).toBe(7); // ~0.15km cells (closest to 0.08km target)
    });

    test('should return null for empty zoom levels', () => {
      const plugin = new GeoPlugin({});
      const zoom = plugin._selectOptimalZoom([], 10);
      expect(zoom).toBeNull();
    });

    test('should use auto-selected zoom in findNearby', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
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

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Insert stores
      await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });
      await resource.insert({ name: 'Store 2', latitude: -23.5555, longitude: -46.6383 });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Query with 1km radius should select zoom7 (closest to target cell size of 0.4km)
      const nearby = await resource.findNearby({
        lat: -23.5505,
        lon: -46.6333,
        radius: 1,
        limit: 10
      });

      // Should log zoom selection
      const zoomSelectionLog = consoleLogSpy.mock.calls.find(call =>
        call[0].includes('Auto-selected zoom')
      );
      expect(zoomSelectionLog).toBeDefined();
      expect(zoomSelectionLog[0]).toContain('zoom7');

      consoleLogSpy.mockRestore();
    });

    test('should use auto-selected zoom in findInBounds', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
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

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      await resource.insert({ name: 'Store 1', latitude: -23.5505, longitude: -46.6333 });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Small bounding box
      const inBounds = await resource.findInBounds({
        north: -23.5,
        south: -23.6,
        east: -46.6,
        west: -46.7
      });

      // Should log zoom selection
      const zoomSelectionLog = consoleLogSpy.mock.calls.find(call =>
        call[0].includes('Auto-selected zoom')
      );
      expect(zoomSelectionLog).toBeDefined();

      consoleLogSpy.mockRestore();
    });

    test('should handle different zoom levels for different query sizes', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
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

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Insert test data
      for (let i = 0; i < 10; i++) {
        await resource.insert({
          name: `Store ${i}`,
          latitude: -23.5505 + (i * 0.01),
          longitude: -46.6333 + (i * 0.01)
        });
      }

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Large radius query
      await resource.findNearby({
        lat: -23.5505,
        lon: -46.6333,
        radius: 50, // 50km
        limit: 10
      });

      const largeRadiusLog = consoleLogSpy.mock.calls.find(call =>
        call[0].includes('Auto-selected zoom') && call[0].includes('50km radius')
      );
      expect(largeRadiusLog).toBeDefined();
      // For 50km: targetCellSize = 20km, zoom5 (4.9km) is closer than zoom4 (39km)
      expect(largeRadiusLog[0]).toContain('zoom5');

      consoleLogSpy.mockClear();

      // Small radius query
      await resource.findNearby({
        lat: -23.5505,
        lon: -46.6333,
        radius: 0.1, // 100m
        limit: 10
      });

      const smallRadiusLog = consoleLogSpy.mock.calls.find(call =>
        call[0].includes('Auto-selected zoom') && call[0].includes('0.1km radius')
      );
      expect(smallRadiusLog).toBeDefined();
      // For 0.1km: targetCellSize = 0.04km, zoom8 (0.038km) is closest
      expect(smallRadiusLog[0]).toContain('zoom8'); // Should use fine zoom

      consoleLogSpy.mockRestore();
    });

    test('should add zoom fields to resource attributes', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        resources: {
          stores: {
            latField: 'latitude',
            lonField: 'longitude',
            precision: 5,
            usePartitions: true,
            zoomLevels: [4, 5, 6]
          }
        }
      });

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Should have added zoom fields
      expect(resource.attributes._geohash_zoom4).toBeDefined();
      expect(resource.attributes._geohash_zoom5).toBeDefined();
      expect(resource.attributes._geohash_zoom6).toBeDefined();
    });

    test('should not create duplicate partitions on re-setup', async () => {
      await database.createResource({
        name: 'stores',
        attributes: {
          name: 'string',
          latitude: 'number',
          longitude: 'number'
        }
      });

      const plugin = new GeoPlugin({
        verbose: true,
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

      await database.usePlugin(plugin);

      const resource = database.resource('stores');

      // Store original partition count
      const originalPartitionCount = Object.keys(resource.config.partitions).length;

      // Re-setup should not create duplicates
      await plugin._setupPartitions(resource, plugin.resources.stores);

      const newPartitionCount = Object.keys(resource.config.partitions).length;
      expect(newPartitionCount).toBe(originalPartitionCount);
    });
  });
});
