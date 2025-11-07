import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { GeoPlugin } from '../../src/plugins/geo.plugin.js';

describe('GeoPlugin - Configuration and Validation Tests', () => {
  test('should create GeoPlugin with valid config', () => {
    const plugin = new GeoPlugin({
      verbose: false,
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          addGeohash: true
        }
      },
      verbose: false
    });

    expect(plugin.resources.stores).toBeDefined();
    expect(plugin.resources.stores.latField).toBe('latitude');
    expect(plugin.resources.stores.lonField).toBe('longitude');
    expect(plugin.resources.stores.precision).toBe(5);
  });

  test('should throw error when latField is missing', async () => {
    const database = createDatabaseForTest('geo-no-latfield');
    await database.connect();

    await database.createResource({
      name: 'stores',
      attributes: {
        name: 'string',
        latitude: 'number',
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

    await expect(plugin.install(database)).rejects.toThrow(
      'Resource "stores" must have "latField" and "lonField" configured'
    );

    await database.disconnect();
  });

  test('should throw error when lonField is missing', async () => {
    const database = createDatabaseForTest('geo-no-lonfield');
    await database.connect();

    await database.createResource({
      name: 'stores',
      attributes: {
        name: 'string',
        latitude: 'number',
        longitude: 'number'
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

    await expect(plugin.install(database)).rejects.toThrow(
      'Resource "stores" must have "latField" and "lonField" configured'
    );

    await database.disconnect();
  });

  test('should use default precision when not specified', async () => {
    const database = createDatabaseForTest('geo-default-precision');
    await database.connect();

    const stores = await database.createResource({
      name: 'stores',
      attributes: {
        name: 'string',
        latitude: 'number',
        longitude: 'number'
      }
    });

    const plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude'
        }
      }
    });

    await plugin.install(database);

    expect(stores._geoConfig.precision).toBe(5); // Default

    await database.disconnect();
  });

  test('should handle non-existent resource gracefully', async () => {
    const database = createDatabaseForTest('geo-nonexistent');
    await database.connect();

    const plugin = new GeoPlugin({
      verbose: false,
      resources: {
        nonExistent: {
          latField: 'lat',
          lonField: 'lon',
          precision: 5
        }
      },
      verbose: false
    });

    // Install should succeed even if resource doesn't exist yet
    // The plugin will log a warning and skip setup for that resource
    await plugin.install(database);

    // Verify plugin was installed
    expect(plugin.database).toBe(database);

    // Clean up
    try {
      await plugin.uninstall();
    } catch (err) {
      // Ignore errors during cleanup
    }
    await database.disconnect();
  });
});

describe('GeoPlugin - Geohash Encoding/Decoding', () => {
  let plugin;

  beforeAll(() => {
    plugin = new GeoPlugin({ verbose: false,});
  });

  test('should encode coordinates to geohash', () => {
    const geohash = plugin.encodeGeohash(-23.5505, -46.6333, 5); // Sao Paulo
    expect(geohash).toBe('6gyf4');
    expect(geohash.length).toBe(5);
  });

  test('should encode with different precisions', () => {
    const lat = 40.7128;
    const lon = -74.0060; // New York

    const hash4 = plugin.encodeGeohash(lat, lon, 4);
    const hash6 = plugin.encodeGeohash(lat, lon, 6);
    const hash8 = plugin.encodeGeohash(lat, lon, 8);

    expect(hash4.length).toBe(4);
    expect(hash6.length).toBe(6);
    expect(hash8.length).toBe(8);
    expect(hash6.startsWith(hash4)).toBe(true);
    expect(hash8.startsWith(hash6)).toBe(true);
  });

  test('should decode geohash to coordinates', () => {
    const geohash = '6gyf4';
    const decoded = plugin.decodeGeohash(geohash);

    expect(decoded.latitude).toBeCloseTo(-23.5505, 1);
    expect(decoded.longitude).toBeCloseTo(-46.6333, 1);
    expect(decoded.error).toBeDefined();
    expect(decoded.error.latitude).toBeGreaterThan(0);
    expect(decoded.error.longitude).toBeGreaterThan(0);
  });

  test('should encode and decode round-trip accurately', () => {
    const lat = 51.5074;
    const lon = -0.1278; // London
    const precision = 7;

    const geohash = plugin.encodeGeohash(lat, lon, precision);
    const decoded = plugin.decodeGeohash(geohash);

    expect(decoded.latitude).toBeCloseTo(lat, 2);
    expect(decoded.longitude).toBeCloseTo(lon, 2);
  });

  test('should handle edge coordinates', () => {
    const northPole = plugin.encodeGeohash(90, 0, 5);
    const southPole = plugin.encodeGeohash(-90, 0, 5);
    const dateLine = plugin.encodeGeohash(0, 180, 5);

    expect(northPole).toBeTruthy();
    expect(southPole).toBeTruthy();
    expect(dateLine).toBeTruthy();
  });

  test('should throw error on invalid geohash character', () => {
    expect(() => plugin.decodeGeohash('invalid@char')).toThrow('Invalid geohash character');
  });
});

describe('GeoPlugin - Distance Calculations', () => {
  let plugin;

  beforeAll(() => {
    plugin = new GeoPlugin({ verbose: false,});
  });

  test('should calculate distance using Haversine formula', () => {
    // Distance between Sao Paulo and Rio de Janeiro
    const distance = plugin.calculateDistance(
      -23.5505, -46.6333, // Sao Paulo
      -22.9068, -43.1729  // Rio de Janeiro
    );

    // Actual distance is approximately 357 km
    expect(distance).toBeGreaterThan(350);
    expect(distance).toBeLessThan(365);
  });

  test('should return 0 for same coordinates', () => {
    const distance = plugin.calculateDistance(
      40.7128, -74.0060,
      40.7128, -74.0060
    );

    expect(distance).toBeCloseTo(0, 5);
  });

  test('should calculate distance between opposite sides of Earth', () => {
    // Antipodal points
    const distance = plugin.calculateDistance(0, 0, 0, 180);

    // Half Earth's circumference is approximately 20,000 km
    expect(distance).toBeGreaterThan(19000);
    expect(distance).toBeLessThan(21000);
  });

  test('should calculate short distances accurately', () => {
    // 1km apart approximately
    const distance = plugin.calculateDistance(
      40.7128, -74.0060,
      40.7218, -74.0060
    );

    expect(distance).toBeGreaterThan(0.5);
    expect(distance).toBeLessThan(2);
  });
});

describe('GeoPlugin - Neighbor Calculation', () => {
  let plugin;

  beforeAll(() => {
    plugin = new GeoPlugin({ verbose: false,});
  });

  test('should get 8 neighboring geohashes', () => {
    const geohash = '6gyf4';
    const neighbors = plugin.getNeighbors(geohash);

    expect(neighbors).toHaveLength(8);
    expect(neighbors.every(n => n.length === geohash.length)).toBe(true);
  });

  test('should have distinct neighbors', () => {
    const geohash = 'u4pruydqqvj';
    const neighbors = plugin.getNeighbors(geohash);
    const uniqueNeighbors = [...new Set(neighbors)];

    expect(uniqueNeighbors.length).toBe(8);
  });
});

describe('GeoPlugin - Resource Integration', () => {
  let database;
  let stores;
  let plugin;

  beforeAll(async () => {
    database = createDatabaseForTest('geo-integration');
    await database.connect();

    stores = await database.createResource({
      name: 'stores',
      attributes: {
        name: 'string',
        latitude: 'number', // Optional - added by user
        longitude: 'number', // Optional - added by user
        geohash: 'string', // Optional - added by plugin
        _geohash: 'string' // Optional - internal field added by plugin
      }
    });

    plugin = new GeoPlugin({
      verbose: false,
      resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5,
          addGeohash: true
        }
      },
      verbose: false
    });

    await plugin.install(database);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await database.disconnect();
  });

  test('should add geohash automatically on insert', async () => {
    const store = {
      id: 'store-1',
      name: 'Store 1',
      latitude: -23.5505,
      longitude: -46.6333
    };

    const inserted = await stores.insert(store);

    expect(inserted.geohash).toBe('6gyf4');
    expect(inserted._geohash).toBe('6gyf4');
  });

  test('should update geohash on update', async () => {
    await stores.insert({
      id: 'store-2',
      name: 'Store 2',
      latitude: 40.7128,
      longitude: -74.0060
    });

    const updated = await stores.update('store-2', {
      latitude: -22.9068,
      longitude: -43.1729 // Move to Rio
    });

    expect(updated.geohash).not.toBe('dr5ru'); // Old NYC hash
    expect(updated._geohash).toBeDefined();
  });

  test('should add _geohash for internal use', async () => {
    const store = {
      id: 'store-3',
      name: 'Store 3',
      latitude: -23.5505,
      longitude: -46.6333
    };

    const inserted = await stores.insert(store);

    // _geohash should always be added for internal partition use
    expect(inserted._geohash).toBeDefined();
    expect(typeof inserted._geohash).toBe('string');
  });
});

describe('GeoPlugin - findNearby Method', () => {
  let database;
  let restaurants;
  let plugin;

  beforeAll(async () => {
    database = createDatabaseForTest('geo-findnearby');
    await database.connect();

    restaurants = await database.createResource({
      name: 'restaurants',
      attributes: {
        name: 'string',
        lat: 'number', // Optional
        lon: 'number', // Optional
        _geohash: 'string' // Optional - internal field
      }
    });

    plugin = new GeoPlugin({
      verbose: false,resources: {
        restaurants: {
          latField: 'lat',
          lonField: 'lon',
          precision: 6
        }
      }
    });

    await plugin.install(database);

    // Insert test data around Sao Paulo
    await restaurants.insert({ id: 'r1', name: 'Restaurant 1', lat: -23.5505, lon: -46.6333 }); // Center
    await restaurants.insert({ id: 'r2', name: 'Restaurant 2', lat: -23.5605, lon: -46.6433 }); // ~2km away
    await restaurants.insert({ id: 'r3', name: 'Restaurant 3', lat: -23.5705, lon: -46.6533 }); // ~4km away
    await restaurants.insert({ id: 'r4', name: 'Restaurant 4', lat: -22.9068, lon: -43.1729 }); // Rio (~360km)
  });

  afterAll(async () => {
    await plugin.uninstall();
    await database.disconnect();
  });

  test('should find restaurants within 5km', async () => {
    const nearby = await restaurants.findNearby({
      lat: -23.5505,
      lon: -46.6333,
      radius: 5,
      limit: 10
    });

    expect(nearby.length).toBe(3); // r1, r2, r3
    expect(nearby.every(r => r._distance <= 5)).toBe(true);
  });

  test('should sort by distance', async () => {
    const nearby = await restaurants.findNearby({
      lat: -23.5505,
      lon: -46.6333,
      radius: 10,
      limit: 10
    });

    for (let i = 1; i < nearby.length; i++) {
      expect(nearby[i]._distance).toBeGreaterThanOrEqual(nearby[i - 1]._distance);
    }
  });

  test('should respect limit parameter', async () => {
    const nearby = await restaurants.findNearby({
      lat: -23.5505,
      lon: -46.6333,
      radius: 10,
      limit: 2
    });

    expect(nearby.length).toBeLessThanOrEqual(2);
  });

  test('should include distance in results', async () => {
    const nearby = await restaurants.findNearby({
      lat: -23.5505,
      lon: -46.6333,
      radius: 5
    });

    nearby.forEach(r => {
      expect(r._distance).toBeDefined();
      expect(typeof r._distance).toBe('number');
      expect(r._distance).toBeGreaterThanOrEqual(0);
    });
  });

  test('should throw error when lat/lon are missing', async () => {
    await expect(
      restaurants.findNearby({ radius: 10 })
    ).rejects.toThrow('Latitude and longitude are required for findNearby()');
  });

  test('should use default radius and limit', async () => {
    const nearby = await restaurants.findNearby({
      lat: -23.5505,
      lon: -46.6333
    });

    // Default radius is 10km, default limit is 100
    expect(nearby).toBeDefined();
  });
});

describe('GeoPlugin - findInBounds Method', () => {
  let database;
  let locations;
  let plugin;

  beforeAll(async () => {
    database = createDatabaseForTest('geo-findinbounds');
    await database.connect();

    locations = await database.createResource({
      name: 'locations',
      attributes: {
        name: 'string',
        latitude: 'number', // Optional
        longitude: 'number', // Optional
        _geohash: 'string' // Optional - internal field
      }
    });

    plugin = new GeoPlugin({
      verbose: false,resources: {
        locations: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        }
      }
    });

    await plugin.install(database);

    // Insert test data
    await locations.insert({ id: 'l1', name: 'Location 1', latitude: -23.5, longitude: -46.6 }); // Inside
    await locations.insert({ id: 'l2', name: 'Location 2', latitude: -23.6, longitude: -46.7 }); // Inside
    await locations.insert({ id: 'l3', name: 'Location 3', latitude: -22.0, longitude: -43.0 }); // Outside
    await locations.insert({ id: 'l4', name: 'Location 4', latitude: -23.55, longitude: -46.65 }); // Inside
  });

  afterAll(async () => {
    await plugin.uninstall();
    await database.disconnect();
  });

  test('should find locations within bounding box', async () => {
    const inBounds = await locations.findInBounds({
      north: -23.4,
      south: -23.7,
      east: -46.5,
      west: -46.8
    });

    expect(inBounds.length).toBe(3); // l1, l2, l4
    inBounds.forEach(loc => {
      expect(loc.latitude).toBeLessThanOrEqual(-23.4);
      expect(loc.latitude).toBeGreaterThanOrEqual(-23.7);
      expect(loc.longitude).toBeLessThanOrEqual(-46.5);
      expect(loc.longitude).toBeGreaterThanOrEqual(-46.8);
    });
  });

  test('should return empty array when no locations in bounds', async () => {
    const inBounds = await locations.findInBounds({
      north: 10,
      south: 5,
      east: 10,
      west: 5
    });

    expect(inBounds).toHaveLength(0);
  });

  test('should respect limit parameter', async () => {
    const inBounds = await locations.findInBounds({
      north: -23.4,
      south: -23.7,
      east: -46.5,
      west: -46.8,
      limit: 2
    });

    expect(inBounds.length).toBeLessThanOrEqual(2);
  });

  test('should throw error when bounds are missing', async () => {
    await expect(
      locations.findInBounds({ north: -23.4, south: -23.7 })
    ).rejects.toThrow('Bounding box requires north, south, east, west coordinates');
  });

  test('should filter locations within exact bounds', async () => {
    await locations.insert({ id: 'l5', name: 'Edge location', latitude: -23.4, longitude: -46.5 });

    const inBounds = await locations.findInBounds({
      north: -23.4,
      south: -23.7,
      east: -46.5,
      west: -46.8
    });

    // Edge location should be included (on the boundary)
    expect(inBounds.some(loc => loc.id === 'l5')).toBe(true);
  });
});

describe('GeoPlugin - getDistance Method', () => {
  let database;
  let cities;
  let plugin;

  beforeAll(async () => {
    database = createDatabaseForTest('geo-getdistance');
    await database.connect();

    cities = await database.createResource({
      name: 'cities',
      attributes: {
        name: 'string',
        lat: 'number', // Optional
        lon: 'number', // Optional
        _geohash: 'string' // Optional - internal field
      }
    });

    plugin = new GeoPlugin({
      verbose: false,resources: {
        cities: {
          latField: 'lat',
          lonField: 'lon',
          precision: 4
        }
      }
    });

    await plugin.install(database);

    await cities.insert({ id: 'sp', name: 'Sao Paulo', lat: -23.5505, lon: -46.6333 });
    await cities.insert({ id: 'rj', name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 });
    await cities.insert({ id: 'ny', name: 'New York', lat: 40.7128, lon: -74.0060 });
  });

  afterAll(async () => {
    await plugin.uninstall();
    await database.disconnect();
  });

  test('should calculate distance between two cities', async () => {
    const result = await cities.getDistance('sp', 'rj');

    expect(result.distance).toBeGreaterThan(350);
    expect(result.distance).toBeLessThan(365);
    expect(result.unit).toBe('km');
    expect(result.from).toBe('sp');
    expect(result.to).toBe('rj');
  });

  test('should return 0 distance for same city', async () => {
    const result = await cities.getDistance('sp', 'sp');

    expect(result.distance).toBeCloseTo(0, 5);
  });

  test('should calculate long distances', async () => {
    const result = await cities.getDistance('sp', 'ny');

    // Sao Paulo to New York is approximately 7700 km
    expect(result.distance).toBeGreaterThan(7500);
    expect(result.distance).toBeLessThan(8000);
  });

  test('should throw error when record not found', async () => {
    await expect(
      cities.getDistance('sp', 'nonexistent')
    ).rejects.toThrow('One or both records not found');
  });

  test('should calculate distance with valid coordinates', async () => {
    await cities.insert({ id: 'la', name: 'Los Angeles', lat: 34.0522, lon: -118.2437 });

    const result = await cities.getDistance('ny', 'la');

    // NY to LA is approximately 3900-4000 km
    expect(result.distance).toBeGreaterThan(3800);
    expect(result.distance).toBeLessThan(4100);
    expect(result.unit).toBe('km');
  });
});

describe('GeoPlugin - Statistics and Monitoring', () => {
  let plugin;

  test('should return plugin statistics', () => {
    plugin = new GeoPlugin({
      verbose: false,resources: {
        stores: {
          latField: 'latitude',
          lonField: 'longitude',
          precision: 5
        },
        restaurants: {
          latField: 'lat',
          lonField: 'lon',
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
  });

  test('should return cell sizes for different precisions', () => {
    plugin = new GeoPlugin({ verbose: false,});

    expect(plugin._getPrecisionDistance(1)).toBe(5000);
    expect(plugin._getPrecisionDistance(4)).toBe(39);
    expect(plugin._getPrecisionDistance(5)).toBe(4.9);
    expect(plugin._getPrecisionDistance(6)).toBe(1.2);
    expect(plugin._getPrecisionDistance(8)).toBe(0.038);
    expect(plugin._getPrecisionDistance(12)).toBe(0.000037);
  });
});
