/**
 * Tests for new decimal types: money, decimal, geo
 */

import { createDatabaseForTest } from '../../config.js';
import { encodeMoney, decodeMoney } from '../../../src/concerns/money.js';
import { encodeGeoLat, decodeGeoLat, encodeGeoLon, decodeGeoLon } from '../../../src/concerns/geo-encoding.js';
import { encodeFixedPoint, decodeFixedPoint } from '../../../src/concerns/base62.js';

describe('Money Type', () => {
  it('should encode/decode USD correctly', () => {
    const value = 19.99;
    const encoded = encodeMoney(value, 'USD');
    expect(encoded).toMatch(/^\$/); // Starts with $
    expect(encoded.length).toBeGreaterThan(1); // Has content

    const decoded = decodeMoney(encoded, 'USD');
    expect(decoded).toBe(19.99);
  });

  it('should encode/decode BRL correctly', () => {
    const value = 1000.50;
    const encoded = encodeMoney(value, 'BRL');
    const decoded = decodeMoney(encoded, 'BRL');
    expect(decoded).toBe(1000.50);
  });

  it('should encode/decode BTC (satoshis) correctly', () => {
    const value = 0.00012345;
    const encoded = encodeMoney(value, 'BTC');
    expect(encoded).toMatch(/^\$/); // Starts with $

    const decoded = decodeMoney(encoded, 'BTC');
    expect(decoded).toBe(0.00012345);
  });

  it('should handle floating point precision correctly', () => {
    // The famous 0.1 + 0.2 problem
    const value = 0.1 + 0.2; // 0.30000000000004
    const encoded = encodeMoney(value, 'USD');
    const decoded = decodeMoney(encoded, 'USD');

    // Should be exactly 0.30 (rounded to cents)
    expect(decoded).toBe(0.30);
  });

  it('should throw error for negative values', () => {
    expect(() => encodeMoney(-10, 'USD')).toThrow('Money value cannot be negative');
  });

  it('should compress better than JSON floats', () => {
    const value = 1999.99;
    const jsonSize = JSON.stringify(value).length; // "1999.99" = 7 bytes
    const encoded = encodeMoney(value, 'USD'); // "$LWr" = 4 bytes

    expect(encoded.length).toBeLessThan(jsonSize);
    expect(encoded.length).toBe(4);
  });
});

describe('Decimal Type (Fixed-Point)', () => {
  it('should encode/decode with default precision', () => {
    const value = 0.123456;
    const encoded = encodeFixedPoint(value, 6);
    const decoded = decodeFixedPoint(encoded, 6);

    expect(decoded).toBeCloseTo(0.123456, 6);
  });

  it('should encode/decode with custom precision', () => {
    const value = 4.5;
    const encoded = encodeFixedPoint(value, 1);
    const decoded = decodeFixedPoint(encoded, 1);

    expect(decoded).toBe(4.5);
  });

  it('should handle zero correctly', () => {
    const encoded = encodeFixedPoint(0, 6);
    expect(encoded).toBe('^0');

    const decoded = decodeFixedPoint(encoded, 6);
    expect(decoded).toBe(0);
  });

  it('should compress better than JSON floats', () => {
    const value = 0.123456;
    const jsonSize = JSON.stringify(value).length; // "0.123456" = 8 bytes
    const encoded = encodeFixedPoint(value, 6); // "^w7f" = 4 bytes

    expect(encoded.length).toBeLessThan(jsonSize);
  });
});

describe('Geo Types', () => {
  describe('Latitude', () => {
    it('should encode/decode latitude correctly', () => {
      const lat = -23.550519;
      const encoded = encodeGeoLat(lat, 6);
      expect(encoded).toMatch(/^~/); // Starts with ~

      const decoded = decodeGeoLat(encoded, 6);
      expect(decoded).toBeCloseTo(-23.550519, 6);
    });

    it('should handle edge cases', () => {
      const latMin = -90;
      const latMax = 90;

      const encodedMin = encodeGeoLat(latMin, 6);
      const encodedMax = encodeGeoLat(latMax, 6);

      expect(decodeGeoLat(encodedMin, 6)).toBeCloseTo(-90, 6);
      expect(decodeGeoLat(encodedMax, 6)).toBeCloseTo(90, 6);
    });

    it('should throw error for out of range', () => {
      expect(() => encodeGeoLat(91, 6)).toThrow('Latitude out of range');
      expect(() => encodeGeoLat(-91, 6)).toThrow('Latitude out of range');
    });

    it('should compress better than JSON floats', () => {
      const lat = -23.550519;
      const jsonSize = JSON.stringify(lat).length; // "-23.550519" = 11 bytes
      const encoded = encodeGeoLat(lat, 6); // "~18kPxZ" = 8 bytes

      expect(encoded.length).toBeLessThan(jsonSize);
    });
  });

  describe('Longitude', () => {
    it('should encode/decode longitude correctly', () => {
      const lon = -46.633309;
      const encoded = encodeGeoLon(lon, 6);
      expect(encoded).toMatch(/^~/); // Starts with ~

      const decoded = decodeGeoLon(encoded, 6);
      expect(decoded).toBeCloseTo(-46.633309, 6);
    });

    it('should handle edge cases', () => {
      const lonMin = -180;
      const lonMax = 180;

      const encodedMin = encodeGeoLon(lonMin, 6);
      const encodedMax = encodeGeoLon(lonMax, 6);

      expect(decodeGeoLon(encodedMin, 6)).toBeCloseTo(-180, 6);
      expect(decodeGeoLon(encodedMax, 6)).toBeCloseTo(180, 6);
    });

    it('should throw error for out of range', () => {
      expect(() => encodeGeoLon(181, 6)).toThrow('Longitude out of range');
      expect(() => encodeGeoLon(-181, 6)).toThrow('Longitude out of range');
    });
  });

  describe('Precision Levels', () => {
    it('should support different precision levels', () => {
      const lat = -23.550519;

      // 4 decimals (~11m accuracy)
      const encoded4 = encodeGeoLat(lat, 4);
      const decoded4 = decodeGeoLat(encoded4, 4);
      expect(decoded4).toBeCloseTo(-23.5505, 4);

      // 6 decimals (~11cm accuracy)
      const encoded6 = encodeGeoLat(lat, 6);
      const decoded6 = decodeGeoLat(encoded6, 6);
      expect(decoded6).toBeCloseTo(-23.550519, 6);
    });

    it('should produce smaller encoding with lower precision', () => {
      const lat = -23.550519;

      const encoded4 = encodeGeoLat(lat, 4);
      const encoded6 = encodeGeoLat(lat, 6);

      // Lower precision = fewer bytes
      expect(encoded4.length).toBeLessThanOrEqual(encoded6.length);
    });
  });
});

describe('Schema Integration', () => {
  let database;

  beforeAll(async () => {
    database = createDatabaseForTest('schema/decimal-types', {
      passphrase: 'test-secret',
      logLevel: 'silent'
    });
    await database.connect();
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should work with money type in schema', async () => {
    const resource = await database.createResource({
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'money|required',      // Fiat (2 decimals)
        cryptoPrice: 'crypto'          // Crypto (8 decimals)
      }
    });

    const data = {
      name: 'Product A',
      price: 19.99,
      cryptoPrice: 0.00012345
    };

    const mapped = await resource.schema.mapper(data);

    // Should be encoded
    expect(mapped[resource.schema.map.price]).toMatch(/^\$/);
    expect(mapped[resource.schema.map.cryptoPrice]).toMatch(/^\$/);

    const unmapped = await resource.schema.unmapper(mapped);

    // Should be decoded back
    expect(unmapped.price).toBe(19.99);
    expect(unmapped.cryptoPrice).toBe(0.00012345);
  });

  it('should work with decimal type in schema', async () => {
    const resource = await database.createResource({
      name: 'ratings',
      attributes: {
        score: 'decimal:2|required',
        percentage: 'decimal:4'
      }
    });

    const data = {
      score: 4.5,
      percentage: 0.8765
    };

    const mapped = await resource.schema.mapper(data);

    // Should be encoded with fixed-point
    expect(mapped[resource.schema.map.score]).toMatch(/^\^/);
    expect(mapped[resource.schema.map.percentage]).toMatch(/^\^/);

    const unmapped = await resource.schema.unmapper(mapped);

    // Should be decoded back
    expect(unmapped.score).toBeCloseTo(4.5, 2);
    expect(unmapped.percentage).toBeCloseTo(0.8765, 4);
  });

  it('should work with geo types in schema', async () => {
    const resource = await database.createResource({
      name: 'locations',
      attributes: {
        name: 'string|required',
        latitude: 'geo:lat:6|required',
        longitude: 'geo:lon:6|required'
      }
    });

    const data = {
      name: 'São Paulo',
      latitude: -23.550519,
      longitude: -46.633309
    };

    const mapped = await resource.schema.mapper(data);

    // Should be encoded
    expect(mapped[resource.schema.map.latitude]).toMatch(/^~/);
    expect(mapped[resource.schema.map.longitude]).toMatch(/^~/);

    const unmapped = await resource.schema.unmapper(mapped);

    // Should be decoded back
    expect(unmapped.latitude).toBeCloseTo(-23.550519, 6);
    expect(unmapped.longitude).toBeCloseTo(-46.633309, 6);
  });

  it('should validate money is non-negative', async () => {
    const resource = await database.createResource({
      name: 'transactions',
      attributes: {
        amount: 'money|required'
      }
    });

    // Should reject negative values
    const result = await resource.validator.validate({ amount: -10 });
    expect(result.isValid).toBe(false);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should validate geo coordinates are in range', async () => {
    const resource = await database.createResource({
      name: 'places',
      attributes: {
        lat: 'geo:lat:6|required',
        lon: 'geo:lon:6|required'
      }
    });

    // Should reject out of range latitude
    const result1 = await resource.validator.validate({ lat: 91, lon: 0 });
    expect(result1.isValid).toBe(false);
    expect(Array.isArray(result1.errors)).toBe(true);

    // Should reject out of range longitude
    const result2 = await resource.validator.validate({ lat: 0, lon: 181 });
    expect(result2.isValid).toBe(false);
    expect(Array.isArray(result2.errors)).toBe(true);

    // Should accept valid coordinates
    const result3 = await resource.validator.validate({ lat: -23.5, lon: -46.6 });
    expect(result3.isValid).toBe(true);
  });
});
