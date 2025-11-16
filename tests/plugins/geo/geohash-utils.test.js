import { describe, expect, test } from '@jest/globals';

import { GeoPlugin } from '../../../src/plugins/geo.plugin.js';

describe('Geo Plugin - Geohash utilities', () => {
  test('encodes coordinates to geohash', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});
    const geohash = plugin.encodeGeohash(-23.5505, -46.6333, 5);

    expect(geohash).toBe('6gyf4');
    expect(geohash).toHaveLength(5);
  });

  test('supports multiple precision levels', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});

    const hash4 = plugin.encodeGeohash(-23.5505, -46.6333, 4);
    const hash6 = plugin.encodeGeohash(-23.5505, -46.6333, 6);

    expect(hash4).toHaveLength(4);
    expect(hash6).toHaveLength(6);
    expect(hash6.startsWith(hash4)).toBe(true);
  });

  test('decodes geohash to coordinates', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});
    const decoded = plugin.decodeGeohash('6gyf4');

    expect(decoded.latitude).toBeCloseTo(-23.5505, 1);
    expect(decoded.longitude).toBeCloseTo(-46.6333, 1);
    expect(decoded.error.latitude).toBeGreaterThan(0);
    expect(decoded.error.longitude).toBeGreaterThan(0);
  });

  test('rejects invalid geohash characters', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});

    expect(() => plugin.decodeGeohash('abc')).toThrow('Invalid geohash character: a');
  });

  test('round-trips encode/decode', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});
    const lat = -23.5505;
    const lon = -46.6333;

    const encoded = plugin.encodeGeohash(lat, lon, 8);
    const decoded = plugin.decodeGeohash(encoded);

    expect(decoded.latitude).toBeCloseTo(lat, 3);
    expect(decoded.longitude).toBeCloseTo(lon, 3);
  });

  test('returns distance between two points', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});
    const distance = plugin.calculateDistance(-23.5505, -46.6333, -22.9068, -43.1729);

    expect(distance).toBeGreaterThan(350);
    expect(distance).toBeLessThan(370);
  });

  test('handles zero distance and equator crossing', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});

    expect(plugin.calculateDistance(-23.5505, -46.6333, -23.5505, -46.6333)).toBeLessThan(0.001);
    expect(plugin.calculateDistance(5, 0, -5, 0)).toBeGreaterThan(1100);
  });

  test('returns neighboring geohashes', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});
    const neighbors = plugin.getNeighbors('6gyf4');

    expect(neighbors).toHaveLength(8);
    expect(new Set(neighbors).size).toBe(8);
    expect(neighbors).not.toContain('6gyf4');
  });

  test('lists geohashes covering a bounding box', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});
    const geohashes = plugin._getGeohashesInBounds({
      north: -23.5,
      south: -23.6,
      east: -46.6,
      west: -46.7,
      precision: 5
    });

    expect(geohashes.length).toBeGreaterThan(0);
    expect(new Set(geohashes).size).toBe(geohashes.length);

    const corners = [
      plugin.encodeGeohash(-23.5, -46.7, 5),
      plugin.encodeGeohash(-23.5, -46.6, 5),
      plugin.encodeGeohash(-23.6, -46.7, 5),
      plugin.encodeGeohash(-23.6, -46.6, 5)
    ];

    corners.forEach(hash => expect(geohashes).toContain(hash));
  });

  test('maps precision levels to cell sizes', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});

    expect(plugin._getPrecisionDistance(1)).toBe(5000);
    expect(plugin._getPrecisionDistance(5)).toBe(4.9);
    expect(plugin._getPrecisionDistance(8)).toBe(0.038);
    expect(plugin._getPrecisionDistance(999)).toBe(5);
  });

  test('selects optimal zoom based on radius', () => {
    const plugin = new GeoPlugin({ logLevel: 'silent',});

    expect(plugin._selectOptimalZoom([4, 5, 6, 7], 20)).toBe(5);
    expect(plugin._selectOptimalZoom([4, 5, 6, 7], 5)).toBe(6);
    expect(plugin._selectOptimalZoom([4, 5, 6, 7], 1)).toBe(7);
    expect(plugin._selectOptimalZoom([], 10)).toBeNull();
  });
});

