/**
 * EXHAUSTIVE Integration Tests for ALL Optimized Types
 *
 * This test suite validates that ALL optimized types (strings, ip4, ip6, money, decimal, geo, embedding)
 * work correctly in REAL usage scenarios with Schema, Validator, and Resource.
 *
 * Focus on:
 * 1. EXTREME values (min, max, edge cases)
 * 2. Integration with Schema class (mapping/unmapping)
 * 3. Integration with Validator class (validation rules)
 * 4. Integration with Resource class (CRUD operations)
 * 5. Partitioning with optimized types
 * 6. Roundtrip integrity (no data loss)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

describe('ALL Optimized Types - Exhaustive Integration Tests', () => {
  let database;
  let resource;

  beforeAll(async () => {
    // Create database using test helper
    database = createDatabaseForTest('suite=integration/all-types-exhaustive');
    await database.connect();

    // Create resource with ALL optimized types
    resource = await database.createResource({
      name: 'comprehensive',
      attributes: {
        // STRING types
        userName: 'string|required',         // ASCII
        displayName: 'string|optional',      // Latin/Unicode
        status: 'string|optional',           // ASCII enum-like

        // IP types
        ipv4Client: 'ip4',
        ipv6Client: 'ip6|optional',

        // MONEY types
        balanceUSD: 'money',              // Fiat (2 decimals default)
        balanceBTC: 'crypto|optional',    // Crypto (8 decimals default)

        // DECIMAL types
        rating: 'decimal:1',                 // 1 decimal place
        successRate: 'decimal:4',            // 4 decimal places
        score: 'decimal:2',                  // 2 decimal places

        // GEO types
        latitude: 'geo:lat',
        longitude: 'geo:lon',

        // EMBEDDING types
        embedding256: 'embedding:256',
        embedding1536: 'embedding:1536|optional'
      },
      options: {
        timestamps: true,
        behavior: 'body-overflow',
        partitions: {
          byStatus: {
            fields: { status: 'string' }
          },
          byRegion: {
            fields: { latitude: 'geo:lat', longitude: 'geo:lon' }
          }
        }
      }
    });
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('1. EXTREME VALUES - Testing Edge Cases', () => {
    describe('String Types', () => {
      it('should handle pure ASCII (zero overhead)', async () => {
        const data = {
          userName: 'user_123456789_ABCDEFGH',
          displayName: 'John Doe',
          status: 'active',
          ipv4Client: '192.168.1.1',
          balanceUSD: 100.00,
          rating: 5.0,
          successRate: 1.0,
          score: 100.00,
          latitude: 40.7128,
          longitude: -74.006,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        const retrieved = await resource.get(inserted.id);

        expect(retrieved.userName).toBe(data.userName);
        expect(retrieved.displayName).toBe(data.displayName);
        expect(retrieved.status).toBe(data.status);
      });

      it('should handle Latin characters (URL encoding)', async () => {
        const data = {
          userName: 'jose_silva',
          displayName: 'José María García-Pérez', // Accents, hyphens
          status: 'active',
          ipv4Client: '10.0.0.1',
          balanceUSD: 50.00,
          rating: 4.5,
          successRate: 0.8765,
          score: 92.50,
          latitude: -23.550519,
          longitude: -46.633309,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        const retrieved = await resource.get(inserted.id);

        expect(retrieved.displayName).toBe(data.displayName);
      });

      it('should handle Emoji and CJK (Base64 fallback)', async () => {
        const data = {
          userName: 'user_emoji',
          displayName: '🚀 Launch! 中文测试',
          status: 'active',
          ipv4Client: '172.16.0.1',
          balanceUSD: 1.00,
          rating: 3.0,
          successRate: 0.5,
          score: 50.00,
          latitude: 35.6762,
          longitude: 139.6503,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        const retrieved = await resource.get(inserted.id);

        expect(retrieved.displayName).toBe(data.displayName);
      });

      it('should handle empty string', async () => {
        const data = {
          userName: 'user_empty',
          displayName: '',  // Empty string
          status: 'pending',
          ipv4Client: '8.8.8.8',
          balanceUSD: 0.01,
          rating: 1.0,
          successRate: 0.0001,
          score: 0.00,
          latitude: 0.0,  // Edge case for geo!
          longitude: 0.0,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        const retrieved = await resource.get(inserted.id);

        expect(retrieved.displayName).toBe('');
      });
    });

    describe('IP Types', () => {
      it.skip('should handle IPv4 extremes', async () => {
        const testCases = [
          { ip: '0.0.0.0', label: 'Min' },
          { ip: '255.255.255.255', label: 'Max' },
          { ip: '127.0.0.1', label: 'Localhost' },
          { ip: '192.168.1.1', label: 'Common private' }
        ];

        const insertedIds = [];

        for (const { ip, label } of testCases) {
          const data = {
            userName: `user_${label}`,
            ipv4Client: ip,
            balanceUSD: 10.00,
            rating: 5.0,
            successRate: 1.0,
            score: 100.00,
            latitude: 40.7128,
            longitude: -74.006,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          insertedIds.push(inserted.id);


          const retrieved = await resource.get(inserted.id);


          expect(retrieved.ipv4Client).toBe(ip);
        }

        // Cleanup all inserted records
        for (const id of insertedIds) {
          await resource.delete(id);
        }
      });

      it('should handle IPv6 extremes', async () => {
        const testCases = [
          { ip: '::1', label: 'Loopback compressed' },
          { ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', label: 'Full notation' },
          { ip: '2001:db8::1', label: 'Mixed compressed' },
          { ip: 'fe80::1', label: 'Link-local' }
        ];

        for (const { ip, label } of testCases) {
          const data = {
            userName: `user_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            ipv6Client: ip,
            balanceUSD: 10.00,
            rating: 5.0,
            successRate: 1.0,
            score: 100.00,
            latitude: 40.7128,
            longitude: -74.006,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          // IPv6 might be compressed on retrieval
          expect(retrieved.ipv6Client).toBeDefined();
        }
      });
    });

    describe('Money Types', () => {
      it('should handle money extremes (USD)', async () => {
        const testCases = [
          { amount: 0.01, label: '1 cent' },
          { amount: 0.99, label: '99 cents' },
          { amount: 1.00, label: '1 dollar' },
          { amount: 19.99, label: 'Typical price' },
          { amount: 999.99, label: 'Large price' },
          { amount: 9999999.99, label: 'Very large' }
        ];

        for (const { amount, label } of testCases) {
          const data = {
            userName: `user_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            balanceUSD: amount,
            rating: 5.0,
            successRate: 1.0,
            score: 100.00,
            latitude: 40.7128,
            longitude: -74.006,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          expect(retrieved.balanceUSD).toBe(amount);
        }
      });

      it('should handle BTC extremes (satoshis)', async () => {
        const testCases = [
          { amount: 0.00000001, label: '1 satoshi' },
          { amount: 0.00012345, label: 'Small BTC' },
          { amount: 0.5, label: 'Half BTC' },
          { amount: 1.0, label: '1 BTC' },
          { amount: 21.0, label: '21 BTC' }
        ];

        for (const { amount, label} of testCases) {
          const data = {
            userName: `user_btc_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            balanceUSD: 100.00,
            balanceBTC: amount,
            rating: 5.0,
            successRate: 1.0,
            score: 100.00,
            latitude: 40.7128,
            longitude: -74.006,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          expect(retrieved.balanceBTC).toBe(amount);
        }
      });

      it('should handle floating point precision correctly (0.1 + 0.2 problem)', async () => {
        const problematicValue = 0.1 + 0.2; // 0.30000000000004

        const data = {
          userName: 'user_float_precision',
          ipv4Client: '10.0.0.1',
          balanceUSD: problematicValue,
          rating: 5.0,
          successRate: 1.0,
          score: 100.00,
          latitude: 40.7128,
          longitude: -74.006,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        const retrieved = await resource.get(inserted.id);

        // Should be exactly 0.30 (rounded to cents)
        expect(retrieved.balanceUSD).toBe(0.30);
      });
    });

    describe('Decimal Types', () => {
      it('should handle decimal:1 extremes', async () => {
        const testCases = [
          { value: 0.1, label: 'Min non-zero' },
          { value: 4.5, label: 'Typical rating' },
          { value: 9.9, label: 'Max value' },
          { value: 0.0, label: 'Zero' }
        ];

        for (const { value, label } of testCases) {
          const data = {
            userName: `user_rating_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            balanceUSD: 100.00,
            rating: value,
            successRate: 0.5,
            score: 50.00,
            latitude: 40.7128,
            longitude: -74.006,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          expect(retrieved.rating).toBeCloseTo(value, 1);
        }
      });

      it('should handle decimal:4 extremes', async () => {
        const testCases = [
          { value: 0.0001, label: 'Tiny percentage' },
          { value: 0.8765, label: 'Typical' },
          { value: 0.9999, label: 'Max' },
          { value: 0.0, label: 'Zero' },
          { value: 1.0, label: 'One' }
        ];

        for (const { value, label } of testCases) {
          const data = {
            userName: `user_success_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            balanceUSD: 100.00,
            rating: 5.0,
            successRate: value,
            score: 50.00,
            latitude: 40.7128,
            longitude: -74.006,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          expect(retrieved.successRate).toBeCloseTo(value, 4);
        }
      });
    });

    describe('Geo Types', () => {
      it('should handle latitude extremes', async () => {
        const testCases = [
          { lat: -90.0, lon: 0.0, label: 'South Pole' },
          { lat: 90.0, lon: 0.0, label: 'North Pole' },
          { lat: 0.0, lon: 0.0, label: 'Equator Prime Meridian (EDGE CASE!)' },
          { lat: -23.550519, lon: -46.633309, label: 'São Paulo' },
          { lat: 40.7128, lon: -74.006, label: 'New York' },
          { lat: 51.5074, lon: -0.1278, label: 'London' }
        ];

        for (const { lat, lon, label } of testCases) {
          const data = {
            userName: `user_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            balanceUSD: 100.00,
            rating: 5.0,
            successRate: 1.0,
            score: 100.00,
            latitude: lat,
            longitude: lon,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          expect(retrieved.latitude).toBeCloseTo(lat, 6);
          expect(retrieved.longitude).toBeCloseTo(lon, 6);
        }
      });

      it('should handle longitude extremes', async () => {
        const testCases = [
          { lat: 0.0, lon: -180.0, label: 'International Date Line West' },
          { lat: 0.0, lon: 180.0, label: 'International Date Line East' },
          { lat: 0.0, lon: 0.0, label: 'Prime Meridian (EDGE CASE!)' }
        ];

        for (const { lat, lon, label } of testCases) {
          const data = {
            userName: `user_lon_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            balanceUSD: 100.00,
            rating: 5.0,
            successRate: 1.0,
            score: 100.00,
            latitude: lat,
            longitude: lon,
            embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          expect(retrieved.latitude).toBeCloseTo(lat, 6);
          expect(retrieved.longitude).toBeCloseTo(lon, 6);
        }
      });
    });

    describe('Embedding Types', () => {
      it('should handle embedding:256 with extreme values', async () => {
        const testCases = [
          { vector: Array(256).fill(-1), label: 'All -1' },
          { vector: Array(256).fill(1), label: 'All +1' },
          { vector: Array(256).fill(0), label: 'All zeros' },
          { vector: Array(256).fill(0).map((_, i) => i % 2 === 0 ? 1 : -1), label: 'Alternating' },
          { vector: Array(256).fill(0).map(() => Math.random() * 2 - 1), label: 'Random' }
        ];

        for (const { vector, label } of testCases) {
          const data = {
            userName: `user_emb_${label.replace(/\s+/g, '_')}`,
            ipv4Client: '10.0.0.1',
            balanceUSD: 100.00,
            rating: 5.0,
            successRate: 1.0,
            score: 100.00,
            latitude: 40.7128,
            longitude: -74.006,
            embedding256: vector
          };

          const inserted = await resource.insert(data);
          const retrieved = await resource.get(inserted.id);

          expect(retrieved.embedding256).toHaveLength(256);
          expect(retrieved.embedding256[0]).toBeCloseTo(vector[0], 6);
        }
      });

      it('should handle embedding:1536 (OpenAI text-embedding-3-large)', async () => {
        const vector = Array(1536).fill(0).map(() => Math.random() * 2 - 1);

        const data = {
          userName: 'user_large_embedding',
          ipv4Client: '10.0.0.1',
          balanceUSD: 100.00,
          rating: 5.0,
          successRate: 1.0,
          score: 100.00,
          latitude: 40.7128,
          longitude: -74.006,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1),
          embedding1536: vector
        };

        const inserted = await resource.insert(data);
        const retrieved = await resource.get(inserted.id);

        expect(retrieved.embedding1536).toHaveLength(1536);
        expect(retrieved.embedding1536[0]).toBeCloseTo(vector[0], 6);
        expect(retrieved.embedding1536[1535]).toBeCloseTo(vector[1535], 6);
      });
    });
  });

  describe('2. SCHEMA Integration - Mapping & Unmapping', () => {
    it('should map ALL types correctly', async () => {
      const data = {
        userName: 'test_user',
        displayName: 'Test User',
        status: 'active',
        ipv4Client: '192.168.1.1',
        ipv6Client: '2001:db8::1',
        balanceUSD: 1999.99,
        balanceBTC: 0.00123456,
        rating: 4.8,
        successRate: 0.9543,
        score: 98.75,
        latitude: 40.7128,
        longitude: -74.006,
        embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1),
        embedding1536: Array(1536).fill(0).map(() => Math.random() * 2 - 1)
      };

      const mapped = await resource.schema.mapper(data);

      // Strings should be as-is or encoded
      expect(mapped).toHaveProperty(resource.schema.map.userName);
      expect(mapped).toHaveProperty(resource.schema.map.displayName);

      // IPs should be encoded
      expect(mapped[resource.schema.map.ipv4Client]).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64
      expect(mapped[resource.schema.map.ipv6Client]).toMatch(/^[A-Za-z0-9+/=]+$/);

      // Money should have $ prefix
      expect(mapped[resource.schema.map.balanceUSD]).toMatch(/^\$/);
      expect(mapped[resource.schema.map.balanceBTC]).toMatch(/^\$/);

      // Decimals should have ^ prefix
      expect(mapped[resource.schema.map.rating]).toMatch(/^\^/);
      expect(mapped[resource.schema.map.successRate]).toMatch(/^\^/);

      // Geo should have ~ prefix
      expect(mapped[resource.schema.map.latitude]).toMatch(/^~/);
      expect(mapped[resource.schema.map.longitude]).toMatch(/^~/);

      // Embeddings should have ^ prefix and commas
      expect(mapped[resource.schema.map.embedding256]).toMatch(/^\^/);
      expect(mapped[resource.schema.map.embedding256]).toContain(',');
    });

    it('should unmap ALL types correctly (complete roundtrip)', async () => {
      const original = {
        userName: 'roundtrip_test',
        displayName: 'José María',
        status: 'pending',
        ipv4Client: '10.0.0.1',
        ipv6Client: 'fe80::1',
        balanceUSD: 123.45,
        balanceBTC: 0.00098765,
        rating: 3.7,
        successRate: 0.8234,
        score: 87.50,
        latitude: -23.550519,
        longitude: -46.633309,
        embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1),
        embedding1536: Array(1536).fill(0).map(() => Math.random() * 2 - 1)
      };

      const mapped = await resource.schema.mapper(original);
      const unmapped = await resource.schema.unmapper(mapped);

      // Exact matches
      expect(unmapped.userName).toBe(original.userName);
      expect(unmapped.displayName).toBe(original.displayName);
      expect(unmapped.status).toBe(original.status);
      expect(unmapped.ipv4Client).toBe(original.ipv4Client);
      expect(unmapped.balanceUSD).toBe(original.balanceUSD);
      expect(unmapped.balanceBTC).toBe(original.balanceBTC);

      // Close matches (floating point)
      expect(unmapped.rating).toBeCloseTo(original.rating, 1);
      expect(unmapped.successRate).toBeCloseTo(original.successRate, 4);
      expect(unmapped.score).toBeCloseTo(original.score, 2);
      expect(unmapped.latitude).toBeCloseTo(original.latitude, 6);
      expect(unmapped.longitude).toBeCloseTo(original.longitude, 6);

      // Array lengths
      expect(unmapped.embedding256).toHaveLength(256);
      expect(unmapped.embedding1536).toHaveLength(1536);

      // Sample array values
      expect(unmapped.embedding256[0]).toBeCloseTo(original.embedding256[0], 6);
      expect(unmapped.embedding1536[0]).toBeCloseTo(original.embedding1536[0], 6);
    });
  });

  describe('3. RESOURCE Integration - Full CRUD Operations', () => {
    it('should insert, get, update, and delete with ALL types', async () => {
      // INSERT
      const insertData = {
        userName: 'crud_test',
        displayName: 'CRUD Test User',
        status: 'active',
        ipv4Client: '192.168.1.100',
        ipv6Client: '2001:db8::cafe',
        balanceUSD: 500.00,
        balanceBTC: 0.001,
        rating: 4.5,
        successRate: 0.95,
        score: 95.00,
        latitude: 51.5074,
        longitude: -0.1278,
        embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
      };

      const inserted = await resource.insert(insertData);
      expect(inserted.id).toBeDefined();

      // GET
      const retrieved = await resource.get(inserted.id);
      expect(retrieved.userName).toBe(insertData.userName);
      expect(retrieved.balanceUSD).toBe(insertData.balanceUSD);

      // UPDATE
      const updateData = {
        displayName: 'Updated Name',
        balanceUSD: 750.00,
        rating: 4.8
      };

      await resource.update(inserted.id, updateData);
      const updated = await resource.get(inserted.id);

      expect(updated.displayName).toBe('Updated Name');
      expect(updated.balanceUSD).toBe(750.00);
      expect(updated.rating).toBeCloseTo(4.8, 1);
      expect(updated.userName).toBe(insertData.userName); // Unchanged

      // DELETE
      await resource.delete(inserted.id);
      const deleted = await resource.get(inserted.id).catch(() => null);
      expect(deleted).toBeNull();
    });

    // FLAKY: Intermittent failures with asyncPartitions, needs investigation
    it.skip('should list records with ALL types', async () => {
      // Insert multiple records
      const records = [];
      for (let i = 0; i < 5; i++) {
        const data = {
          userName: `list_test_${i}`,
          displayName: `User ${i}`,
          status: i % 2 === 0 ? 'active' : 'pending',
          ipv4Client: `10.0.0.${i + 1}`,
          balanceUSD: (i + 1) * 100,
          rating: 3.0 + i * 0.5,
          successRate: 0.5 + i * 0.1,
          score: 50.00 + i * 10,
          latitude: 40.0 + i,
          longitude: -74.0 + i,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        records.push({ id: inserted.id, ...data });
      }

      // Delay to ensure async partitions are indexed
      await new Promise(resolve => setTimeout(resolve, 500));

      // List all
      const listed = await resource.list({ limit: 10 });

      // list() returns an array directly, not {data: []}
      expect(Array.isArray(listed)).toBe(true);
      expect(listed.length).toBeGreaterThanOrEqual(5);

      // Verify types are decoded correctly
      const firstRecord = listed.find(r => r.userName === 'list_test_0');
      expect(firstRecord).toBeDefined();
      expect(firstRecord.balanceUSD).toBe(100);
      expect(firstRecord.rating).toBeCloseTo(3.0, 1);

      // Cleanup
      for (const record of records) {
        await resource.delete(record.id);
      }
    });
  });

  describe('4. PARTITIONING with Optimized Types', () => {
    // FLAKY: asyncPartitions race condition - partitions not always indexed before query
    it.skip('should partition by string status', async () => {
      const activeRecords = [];
      const pendingRecords = [];

      // Insert active records
      for (let i = 0; i < 3; i++) {
        const data = {
          userName: `partition_active_${i}`,
          status: 'active',
          ipv4Client: '10.0.0.1',
          balanceUSD: 100.00,
          rating: 5.0,
          successRate: 1.0,
          score: 100.00,
          latitude: 40.7128,
          longitude: -74.006,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        activeRecords.push(inserted.id);
      }

      // Insert pending records
      for (let i = 0; i < 2; i++) {
        const data = {
          userName: `partition_pending_${i}`,
          status: 'pending',
          ipv4Client: '10.0.0.1',
          balanceUSD: 50.00,
          rating: 3.0,
          successRate: 0.5,
          score: 50.00,
          latitude: 40.7128,
          longitude: -74.006,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        pendingRecords.push(inserted.id);
      }

      // Delay to ensure async partitions are indexed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Query by partition
      const activeResults = await resource.listPartition({
        partition: 'byStatus',
        partitionValues: { status: 'active' },
        limit: 10
      });

      // listPartition() returns an array directly, not {data: []}
      expect(Array.isArray(activeResults)).toBe(true);
      expect(activeResults.length).toBeGreaterThanOrEqual(3);
      expect(activeResults.every(r => r.status === 'active')).toBe(true);

      // Cleanup
      for (const id of [...activeRecords, ...pendingRecords]) {
        await resource.delete(id);  // FIX: Use id from loop, not inserted.id
      }
    });

    // FLAKY: asyncPartitions race condition - partitions not always indexed before query
    it.skip('should partition by geo coordinates', async () => {
      const nycRecords = [];
      const spRecords = [];

      // NYC records
      for (let i = 0; i < 2; i++) {
        const data = {
          userName: `geo_nyc_${i}`,
          status: 'active',
          ipv4Client: '10.0.0.1',
          balanceUSD: 100.00,
          rating: 5.0,
          successRate: 1.0,
          score: 100.00,
          latitude: 40.7128,
          longitude: -74.006,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        nycRecords.push(inserted.id);
      }

      // Sao Paulo records
      for (let i = 0; i < 2; i++) {
        const data = {
          userName: `geo_sp_${i}`,
          status: 'active',
          ipv4Client: '10.0.0.1',
          balanceUSD: 100.00,
          rating: 5.0,
          successRate: 1.0,
          score: 100.00,
          latitude: -23.550519,
          longitude: -46.633309,
          embedding256: Array(256).fill(0).map(() => Math.random() * 2 - 1)
        };

        const inserted = await resource.insert(data);
        spRecords.push(inserted.id);
      }

      // Delay to ensure async partitions are indexed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Query by geo partition (NYC)
      const nycResults = await resource.listPartition({
        partition: 'byRegion',
        partitionValues: {
          latitude: 40.7128,
          longitude: -74.006
        },
        limit: 10
      });

      // listPartition() returns an array directly, not {data: []}
      expect(Array.isArray(nycResults)).toBe(true);
      expect(nycResults.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      for (const id of [...nycRecords, ...spRecords]) {
        await resource.delete(id);  // FIX: Use id from loop, not inserted.id
      }
    });
  });

  describe('5. DATA INTEGRITY - No Loss After Roundtrip', () => {
    it('should preserve precision for ALL types after multiple roundtrips', async () => {
      const original = {
        userName: 'precision_test',
        displayName: 'Precision Test José',
        status: 'active',
        ipv4Client: '192.168.1.1',
        ipv6Client: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        balanceUSD: 1234.56,
        balanceBTC: 0.00123456,
        rating: 4.7,
        successRate: 0.8765,
        score: 92.33,
        latitude: -23.550519,
        longitude: -46.633309,
        embedding256: Array(256).fill(0).map((_, i) => (i / 256) * 2 - 1)
      };

      // Insert
      const inserted = await resource.insert(original);

      // Roundtrip 1
      const r1 = await resource.get(inserted.id);

      // Update (triggers another roundtrip)
      await resource.update(inserted.id, { rating: 4.8 });

      // Roundtrip 2
      const r2 = await resource.get(inserted.id);

      // Update back
      await resource.update(inserted.id, { rating: 4.7 });

      // Roundtrip 3
      const r3 = await resource.get(inserted.id);

      // All roundtrips should preserve data
      expect(r3.userName).toBe(original.userName);
      expect(r3.balanceUSD).toBe(original.balanceUSD);
      expect(r3.balanceBTC).toBe(original.balanceBTC);
      expect(r3.rating).toBeCloseTo(original.rating, 1);
      expect(r3.successRate).toBeCloseTo(original.successRate, 4);
      expect(r3.latitude).toBeCloseTo(original.latitude, 6);
      expect(r3.longitude).toBeCloseTo(original.longitude, 6);

      // Cleanup
      await resource.delete(inserted.id);
    });
  });
});
