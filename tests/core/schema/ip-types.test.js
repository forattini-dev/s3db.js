/**
 * Schema IP Types Integration Tests
 *
 * Tests the integration of ip4 and ip6 primitive types in the schema validator.
 */

import { Schema } from '../../../src/schema.class.js';

describe('Schema - IP Types Integration', () => {
  describe('IP4 Type - Shorthand Notation', () => {
    let schema;

    beforeEach(() => {
      schema = new Schema({
        name: 'test',
        attributes: {
          ipAddress: 'ip4',
          optionalIP: 'ip4|optional',
          requiredIP: 'ip4|required'
        }
      });
    });

    it('should encode IPv4 address during mapping', async () => {
      const data = { ipAddress: '192.168.1.1' };
      const mapped = await schema.mapper(data);

      // Should be encoded to Base64
      expect(mapped[schema.map.ipAddress]).toBe('wKgBAQ==');
      expect(mapped[schema.map.ipAddress]).not.toBe('192.168.1.1');
    });

    it('should decode IPv4 address during unmapping', async () => {
      const data = { ipAddress: '10.0.0.1' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.ipAddress).toBe('10.0.0.1');
    });

    it('should handle roundtrip for various IPv4 addresses', async () => {
      const testAddresses = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '255.255.255.255',
        '0.0.0.0',
        '127.0.0.1'
      ];

      for (const ip of testAddresses) {
        const data = { ipAddress: ip };
        const mapped = await schema.mapper(data);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.ipAddress).toBe(ip);
      }
    });

    it('should handle optional IPv4 fields', async () => {
      const data = { requiredIP: '192.168.1.1' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.requiredIP).toBe('192.168.1.1');
      expect(unmapped.optionalIP).toBeUndefined();
    });

    it('should handle null and undefined values', async () => {
      const data = { ipAddress: null, optionalIP: undefined };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.ipAddress).toBeNull();
      expect(unmapped.optionalIP).toBeUndefined();
    });

    it('should preserve invalid IPv4 addresses as-is', async () => {
      const data = { ipAddress: '999.999.999.999' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      // Invalid addresses should not be encoded
      expect(unmapped.ipAddress).toBe('999.999.999.999');
    });
  });

  describe('IP6 Type - Shorthand Notation', () => {
    let schema;

    beforeEach(() => {
      schema = new Schema({
        name: 'test',
        attributes: {
          ipAddress: 'ip6',
          optionalIP: 'ip6|optional',
          requiredIP: 'ip6|required'
        }
      });
    });

    it('should encode IPv6 address during mapping', async () => {
      const data = { ipAddress: '2001:db8::1' };
      const mapped = await schema.mapper(data);

      // Should be encoded to Base64 (16 bytes)
      expect(mapped[schema.map.ipAddress]).not.toBe('2001:db8::1');
      expect(typeof mapped[schema.map.ipAddress]).toBe('string');
      expect(mapped[schema.map.ipAddress].length).toBeGreaterThan(0);
    });

    it('should decode IPv6 address during unmapping', async () => {
      const data = { ipAddress: '2001:db8::1' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      // Should decode back to compressed form
      expect(unmapped.ipAddress).toBe('2001:db8::1');
    });

    it('should handle roundtrip for various IPv6 addresses', async () => {
      const testAddresses = [
        '2001:db8::1',
        '::1',
        'fe80::1',
        '2001:db8:85a3::8a2e:370:7334',
        '::',
        'ff02::1'
      ];

      for (const ip of testAddresses) {
        const data = { ipAddress: ip };
        const mapped = await schema.mapper(data);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.ipAddress).toBe(ip);
      }
    });

    it('should handle full IPv6 addresses', async () => {
      const fullAddress = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const compressed = '2001:db8:85a3::8a2e:370:7334';

      const data = { ipAddress: fullAddress };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      // Should decode to compressed form
      expect(unmapped.ipAddress).toBe(compressed);
    });

    it('should handle optional IPv6 fields', async () => {
      const data = { requiredIP: '2001:db8::1' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.requiredIP).toBe('2001:db8::1');
      expect(unmapped.optionalIP).toBeUndefined();
    });

    it('should handle null and undefined values', async () => {
      const data = { ipAddress: null, optionalIP: undefined };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.ipAddress).toBeNull();
      expect(unmapped.optionalIP).toBeUndefined();
    });

    it('should preserve invalid IPv6 addresses as-is', async () => {
      const data = { ipAddress: 'invalid-ipv6' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      // Invalid addresses should not be encoded
      expect(unmapped.ipAddress).toBe('invalid-ipv6');
    });
  });

  describe('IP Types - Object Notation', () => {
    it('should support ip4 with object notation', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          ipAddress: { type: 'ip4', required: true }
        }
      });

      const data = { ipAddress: '192.168.1.1' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.ipAddress).toBe('192.168.1.1');
    });

    it('should support ip6 with object notation', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          ipAddress: { type: 'ip6', required: false }
        }
      });

      const data = { ipAddress: '2001:db8::1' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.ipAddress).toBe('2001:db8::1');
    });
  });

  describe('IP Types - Nested Objects', () => {
    it('should handle IP fields in nested objects', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          connection: {
            type: 'object',
            properties: {
              ipv4: 'ip4',
              ipv6: 'ip6'
            }
          }
        }
      });

      const data = {
        connection: {
          ipv4: '192.168.1.1',
          ipv6: '2001:db8::1'
        }
      };

      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.connection.ipv4).toBe('192.168.1.1');
      expect(unmapped.connection.ipv6).toBe('2001:db8::1');
    });
  });

  describe('IP Types - Mixed Types', () => {
    it('should handle schemas with mixed IP and other types', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          userId: 'string|required',
          ipv4: 'ip4',
          ipv6: 'ip6',
          timestamp: 'number',
          active: 'boolean'
        }
      });

      const data = {
        userId: 'user123',
        ipv4: '192.168.1.1',
        ipv6: '2001:db8::1',
        timestamp: 1234567890,
        active: true
      };

      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.userId).toBe('user123');
      expect(unmapped.ipv4).toBe('192.168.1.1');
      expect(unmapped.ipv6).toBe('2001:db8::1');
      expect(unmapped.timestamp).toBe(1234567890);
      expect(unmapped.active).toBe(true);
    });
  });

  describe('IP Types - Compression Savings', () => {
    it('should demonstrate IPv4 compression savings', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip4' }
      });

      const longIP = '192.168.100.200'; // 15 characters
      const data = { ip: longIP };
      const mapped = await schema.mapper(data);

      const encodedLength = mapped[schema.map.ip].length;
      const originalLength = longIP.length;

      // Base64 encoding of 4 bytes = 8 characters (including padding)
      expect(encodedLength).toBeLessThan(originalLength);
      expect(encodedLength).toBe(8); // 4 bytes → 8 Base64 chars
    });

    it('should demonstrate IPv6 compression savings', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip6' }
      });

      const fullIP = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'; // 39 characters
      const data = { ip: fullIP };
      const mapped = await schema.mapper(data);

      const encodedLength = mapped[schema.map.ip].length;
      const originalLength = fullIP.length;

      // Base64 encoding of 16 bytes = 24 characters (including padding)
      expect(encodedLength).toBeLessThan(originalLength);
      expect(encodedLength).toBe(24); // 16 bytes → 24 Base64 chars
    });
  });

  describe('IP Types - Edge Cases', () => {
    it('should handle empty strings', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: {
          ipv4: 'ip4|optional',
          ipv6: 'ip6|optional'
        }
      });

      const data = { ipv4: '', ipv6: '' };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      expect(unmapped.ipv4).toBe('');
      expect(unmapped.ipv6).toBe('');
    });

    it('should handle non-string values gracefully', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ipv4: 'ip4|optional' }
      });

      const data = { ipv4: 12345 };
      const mapped = await schema.mapper(data);
      const unmapped = await schema.unmapper(mapped);

      // Should preserve non-string values as-is
      expect(unmapped.ipv4).toBe(12345);
    });

    it('should handle special IPv4 addresses', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip4' }
      });

      const specialAddresses = [
        '0.0.0.0',        // All zeros
        '255.255.255.255', // Broadcast
        '127.0.0.1',      // Loopback
        '169.254.0.1',    // Link-local
        '224.0.0.1'       // Multicast
      ];

      for (const ip of specialAddresses) {
        const data = { ip };
        const mapped = await schema.mapper(data);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.ip).toBe(ip);
      }
    });

    it('should handle special IPv6 addresses', async () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip6' }
      });

      const specialAddresses = [
        '::',             // All zeros
        '::1',            // Loopback
        'fe80::1',        // Link-local
        'ff02::1'         // Multicast
        // Note: IPv4-mapped addresses (::ffff:192.0.2.1) are not fully supported
        // in compression/expansion and should be stored as-is or handled separately
      ];

      for (const ip of specialAddresses) {
        const data = { ip };
        const mapped = await schema.mapper(data);
        const unmapped = await schema.unmapper(mapped);

        expect(unmapped.ip).toBe(ip);
      }
    });
  });

  describe('IP Types - Hook Generation', () => {
    it('should generate beforeMap hook for ip4', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip4' }
      });

      expect(schema.options.hooks.beforeMap.ip).toContain('encodeIPv4');
    });

    it('should generate afterUnmap hook for ip4', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip4' }
      });

      expect(schema.options.hooks.afterUnmap.ip).toContain('decodeIPv4');
    });

    it('should generate beforeMap hook for ip6', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip6' }
      });

      expect(schema.options.hooks.beforeMap.ip).toContain('encodeIPv6');
    });

    it('should generate afterUnmap hook for ip6', () => {
      const schema = new Schema({
        name: 'test',
        attributes: { ip: 'ip6' }
      });

      expect(schema.options.hooks.afterUnmap.ip).toContain('decodeIPv6');
    });
  });
});
