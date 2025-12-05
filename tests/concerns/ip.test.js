import {
  isValidIPv4,
  isValidIPv6,
  encodeIPv4,
  decodeIPv4,
  encodeIPv6,
  decodeIPv6,
  expandIPv6,
  compressIPv6,
  detectIPVersion,
  calculateIPSavings
} from '../../src/concerns/ip.js';

describe('IP Address Utilities', () => {
  describe('IPv4 Validation', () => {
    test('should validate correct IPv4 addresses', () => {
      expect(isValidIPv4('192.168.1.1')).toBe(true);
      expect(isValidIPv4('0.0.0.0')).toBe(true);
      expect(isValidIPv4('255.255.255.255')).toBe(true);
      expect(isValidIPv4('10.0.0.1')).toBe(true);
      expect(isValidIPv4('172.16.0.1')).toBe(true);
    });

    test('should reject invalid IPv4 addresses', () => {
      expect(isValidIPv4('256.1.1.1')).toBe(false); // octet > 255
      expect(isValidIPv4('192.168.1')).toBe(false); // missing octet
      expect(isValidIPv4('192.168.1.1.1')).toBe(false); // too many octets
      expect(isValidIPv4('abc.def.ghi.jkl')).toBe(false); // non-numeric
      expect(isValidIPv4('192.168.-1.1')).toBe(false); // negative
      expect(isValidIPv4('')).toBe(false); // empty
      expect(isValidIPv4(null)).toBe(false); // null
      expect(isValidIPv4(undefined)).toBe(false); // undefined
      expect(isValidIPv4(123)).toBe(false); // number
    });
  });

  describe('IPv6 Validation', () => {
    test('should validate correct IPv6 addresses', () => {
      expect(isValidIPv6('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true);
      expect(isValidIPv6('2001:db8::1')).toBe(true);
      expect(isValidIPv6('::1')).toBe(true);
      expect(isValidIPv6('::')).toBe(true);
      expect(isValidIPv6('fe80::1')).toBe(true);
      expect(isValidIPv6('::ffff:192.0.2.1')).toBe(true); // IPv4-mapped
      expect(isValidIPv6('2001:db8:85a3::8a2e:370:7334')).toBe(true);
    });

    test('should reject invalid IPv6 addresses', () => {
      expect(isValidIPv6('gggg::1')).toBe(false); // invalid hex
      expect(isValidIPv6('192.168.1.1')).toBe(false); // IPv4
      expect(isValidIPv6('')).toBe(false); // empty
      expect(isValidIPv6(null)).toBe(false); // null
      expect(isValidIPv6(undefined)).toBe(false); // undefined
      expect(isValidIPv6(123)).toBe(false); // number
    });
  });

  describe('IPv4 Encoding/Decoding', () => {
    test('should encode IPv4 to Base64', () => {
      const encoded = encodeIPv4('192.168.1.1');
      expect(encoded).toBe('wKgBAQ==');
      expect(encoded.length).toBeLessThan('192.168.1.1'.length);
    });

    test('should encode various IPv4 addresses', () => {
      expect(encodeIPv4('0.0.0.0')).toBe('AAAAAA==');
      expect(encodeIPv4('255.255.255.255')).toBe('/////w==');
      expect(encodeIPv4('10.0.0.1')).toBe('CgAAAQ==');
      expect(encodeIPv4('172.16.0.1')).toBe('rBAAAQ==');
    });

    test('should decode Base64 to IPv4', () => {
      const decoded = decodeIPv4('wKgBAQ==');
      expect(decoded).toBe('192.168.1.1');
    });

    test('should roundtrip encode/decode IPv4', () => {
      const testIPs = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.254.1',
        '0.0.0.0',
        '255.255.255.255',
        '8.8.8.8',
        '1.1.1.1'
      ];

      for (const ip of testIPs) {
        const encoded = encodeIPv4(ip);
        const decoded = decodeIPv4(encoded);
        expect(decoded).toBe(ip);
      }
    });

    test('should throw error on invalid IPv4', () => {
      expect(() => encodeIPv4('256.1.1.1')).toThrow('Invalid IPv4 address');
      expect(() => encodeIPv4('abc.def.ghi.jkl')).toThrow('Invalid IPv4 address');
      expect(() => encodeIPv4('192.168.1')).toThrow('Invalid IPv4 address');
    });

    test('should throw error on invalid encoded IPv4', () => {
      expect(() => decodeIPv4('invalid')).toThrow('Invalid encoded IPv4 length');
      expect(() => decodeIPv4('wKgB')).toThrow('Invalid encoded IPv4 length'); // Too short
      expect(() => decodeIPv4(123)).toThrow('Encoded IPv4 must be a string');
    });
  });

  describe('IPv6 Expansion/Compression', () => {
    test('should expand compressed IPv6 addresses', () => {
      expect(expandIPv6('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
      expect(expandIPv6('::1')).toBe('0000:0000:0000:0000:0000:0000:0000:0001');
      expect(expandIPv6('::')).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
      expect(expandIPv6('fe80::1')).toBe('fe80:0000:0000:0000:0000:0000:0000:0001');
      expect(expandIPv6('2001:db8:85a3::8a2e:370:7334')).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });

    test('should expand already full IPv6 addresses', () => {
      const fullAddress = '2001:0db8:0000:0000:0000:0000:0000:0001';
      expect(expandIPv6(fullAddress)).toBe(fullAddress);
    });

    test('should compress IPv6 addresses', () => {
      expect(compressIPv6('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
      expect(compressIPv6('0000:0000:0000:0000:0000:0000:0000:0001')).toBe('::1');
      expect(compressIPv6('0000:0000:0000:0000:0000:0000:0000:0000')).toBe('::');
      expect(compressIPv6('fe80:0000:0000:0000:0000:0000:0000:0001')).toBe('fe80::1');
      expect(compressIPv6('2001:0db8:0001:0000:0000:0000:0000:0001')).toBe('2001:db8:1::1');
    });

    test('should choose longest zero sequence for compression', () => {
      // Has two zero sequences, should compress the longer one
      expect(compressIPv6('2001:0000:0000:0001:0000:0000:0000:0001')).toContain('::');
    });

    test('should handle IPv6 with no compression opportunity', () => {
      const address = '2001:0db8:0001:0002:0003:0004:0005:0006';
      const compressed = compressIPv6(address);
      expect(compressed).not.toContain('::');
      expect(compressed).toBe('2001:db8:1:2:3:4:5:6');
    });

    test('should throw error on invalid IPv6 expansion', () => {
      expect(() => expandIPv6('192.168.1.1')).toThrow('Invalid IPv6 address');
      expect(() => expandIPv6('gggg::1')).toThrow('Invalid IPv6 address');
    });
  });

  describe('IPv6 Encoding/Decoding', () => {
    test('should encode IPv6 to Base64', () => {
      const encoded = encodeIPv6('2001:db8::1');
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeLessThan('2001:0db8:0000:0000:0000:0000:0000:0001'.length);
    });

    test('should encode various IPv6 addresses', () => {
      const addresses = [
        '::1',
        '::',
        '2001:db8::1',
        'fe80::1',
        '2001:db8:85a3::8a2e:370:7334'
      ];

      for (const addr of addresses) {
        const encoded = encodeIPv6(addr);
        expect(typeof encoded).toBe('string');
        expect(encoded.length).toBeGreaterThan(0);
      }
    });

    test('should decode Base64 to IPv6', () => {
      const encoded = encodeIPv6('2001:db8::1');
      const decoded = decodeIPv6(encoded);

      // Should be compressed by default
      expect(decoded).toBe('2001:db8::1');
    });

    test('should decode to full format when compress=false', () => {
      const encoded = encodeIPv6('2001:db8::1');
      const decoded = decodeIPv6(encoded, false);

      expect(decoded).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    });

    test('should roundtrip encode/decode IPv6', () => {
      const testIPs = [
        '2001:db8::1',
        '::1',
        '::',
        'fe80::1',
        '2001:db8:85a3::8a2e:370:7334',
        '2001:0db8:0000:0000:0000:0000:0000:0001'
      ];

      for (const ip of testIPs) {
        const encoded = encodeIPv6(ip);
        const decoded = decodeIPv6(encoded);

        // Normalize both to compressed form for comparison
        const normalizedOriginal = compressIPv6(expandIPv6(ip));
        expect(decoded).toBe(normalizedOriginal);
      }
    });

    test('should throw error on invalid IPv6', () => {
      expect(() => encodeIPv6('192.168.1.1')).toThrow('Invalid IPv6 address');
      expect(() => encodeIPv6('gggg::1')).toThrow('Invalid IPv6 address');
      expect(() => encodeIPv6('invalid')).toThrow('Invalid IPv6 address');
    });

    test('should throw error on invalid encoded IPv6', () => {
      expect(() => decodeIPv6('invalid')).toThrow('Invalid encoded IPv6 length');
      expect(() => decodeIPv6('wKgBAQ==')).toThrow('Invalid encoded IPv6 length'); // Too short
      expect(() => decodeIPv6(123)).toThrow('Encoded IPv6 must be a string');
    });
  });

  describe('IP Version Detection', () => {
    test('should detect IPv4', () => {
      expect(detectIPVersion('192.168.1.1')).toBe('ipv4');
      expect(detectIPVersion('10.0.0.1')).toBe('ipv4');
      expect(detectIPVersion('255.255.255.255')).toBe('ipv4');
    });

    test('should detect IPv6', () => {
      expect(detectIPVersion('2001:db8::1')).toBe('ipv6');
      expect(detectIPVersion('::1')).toBe('ipv6');
      expect(detectIPVersion('::')).toBe('ipv6');
      expect(detectIPVersion('fe80::1')).toBe('ipv6');
    });

    test('should return null for invalid IPs', () => {
      expect(detectIPVersion('invalid')).toBe(null);
      expect(detectIPVersion('256.1.1.1')).toBe(null);
      expect(detectIPVersion('gggg::1')).toBe(null);
      expect(detectIPVersion('')).toBe(null);
    });
  });

  describe('Savings Calculation', () => {
    test('should calculate savings for IPv4', () => {
      const savings = calculateIPSavings('192.168.1.1');

      expect(savings.version).toBe('ipv4');
      expect(savings.originalSize).toBe(11);
      expect(savings.encodedSize).toBe(8);
      expect(savings.savings).toBeGreaterThan(0);
      expect(savings.savingsPercent).toContain('%');
    });

    test('should calculate savings for IPv6', () => {
      const savings = calculateIPSavings('2001:0db8:0000:0000:0000:0000:0000:0001');

      expect(savings.version).toBe('ipv6');
      expect(savings.originalSize).toBeGreaterThan(20);
      expect(savings.encodedSize).toBeLessThan(savings.originalSize);
      expect(savings.savings).toBeGreaterThan(0);
    });

    test('should calculate savings for compressed IPv6', () => {
      const savings = calculateIPSavings('2001:db8::1');

      expect(savings.version).toBe('ipv6');
      expect(savings.originalSize).toBe(11);
      // Compressed IPv6 may be larger after Base64 encoding (11 chars -> ~24 chars)
      // But uncompressed IPv6 (39 chars) benefits significantly
      expect(savings.encodedSize).toBeGreaterThan(0);
    });

    test('should handle invalid IP', () => {
      const savings = calculateIPSavings('invalid');

      expect(savings.version).toBe(null);
      expect(savings.originalSize).toBe(0);
      expect(savings.encodedSize).toBe(0);
      expect(savings.savings).toBe(0);
    });

    test('should calculate percentage correctly', () => {
      const ipv4Savings = calculateIPSavings('192.168.1.1');
      expect(ipv4Savings.savingsPercent).toMatch(/^\d+%$/);

      const ipv6Savings = calculateIPSavings('2001:db8::1');
      // Can be negative if encoded is larger than original (compressed IPv6)
      expect(ipv6Savings.savingsPercent).toMatch(/^-?\d+%$/);
    });
  });

  describe('Edge Cases', () => {
    test('should handle loopback addresses', () => {
      // IPv4 loopback
      const ipv4Loop = '127.0.0.1';
      expect(isValidIPv4(ipv4Loop)).toBe(true);
      const encoded4 = encodeIPv4(ipv4Loop);
      expect(decodeIPv4(encoded4)).toBe(ipv4Loop);

      // IPv6 loopback
      const ipv6Loop = '::1';
      expect(isValidIPv6(ipv6Loop)).toBe(true);
      const encoded6 = encodeIPv6(ipv6Loop);
      expect(decodeIPv6(encoded6)).toBe(ipv6Loop);
    });

    test('should handle broadcast address', () => {
      const broadcast = '255.255.255.255';
      expect(isValidIPv4(broadcast)).toBe(true);
      const encoded = encodeIPv4(broadcast);
      expect(decodeIPv4(encoded)).toBe(broadcast);
    });

    test('should handle all-zeros addresses', () => {
      // IPv4 all zeros
      const ipv4Zero = '0.0.0.0';
      expect(isValidIPv4(ipv4Zero)).toBe(true);
      const encoded4 = encodeIPv4(ipv4Zero);
      expect(decodeIPv4(encoded4)).toBe(ipv4Zero);

      // IPv6 all zeros
      const ipv6Zero = '::';
      expect(isValidIPv6(ipv6Zero)).toBe(true);
      const encoded6 = encodeIPv6(ipv6Zero);
      expect(decodeIPv6(encoded6)).toBe(ipv6Zero);
    });

    test('should handle private network ranges', () => {
      const privateIPs = [
        '10.0.0.0',
        '172.16.0.0',
        '192.168.0.0',
        '169.254.0.0'  // Link-local
      ];

      for (const ip of privateIPs) {
        expect(isValidIPv4(ip)).toBe(true);
        const encoded = encodeIPv4(ip);
        expect(decodeIPv4(encoded)).toBe(ip);
      }
    });

    test('should handle IPv6 with different compression styles', () => {
      const variations = [
        { original: 'fe80:0000:0000:0000:0204:61ff:fe9d:f156', compressed: 'fe80::204:61ff:fe9d:f156' },
        { original: '2001:0db8:0000:0042:0000:8a2e:0370:7334', compressed: '2001:db8:0:42:0:8a2e:370:7334' },
        { original: '2001:0db8:0000:0000:0000:0000:1428:57ab', compressed: '2001:db8::1428:57ab' }
      ];

      for (const { original, compressed } of variations) {
        const expanded = expandIPv6(compressed);
        expect(expanded).toBe(original);

        const recompressed = compressIPv6(original);
        // Both should be valid and equivalent
        expect(expandIPv6(recompressed)).toBe(original);
      }
    });
  });

  describe('Performance & Compression Benefits', () => {
    test('should provide significant savings for long IPv6 addresses', () => {
      const longIPv6 = '2001:0db8:0000:0000:0000:0000:0000:0001';
      const savings = calculateIPSavings(longIPv6);

      expect(savings.originalSize).toBe(39);
      expect(savings.encodedSize).toBeLessThan(25);
      expect(savings.savings).toBeGreaterThan(30); // At least 30% savings
    });

    test('should maintain encoding efficiency', () => {
      const testCases = [
        { ip: '192.168.1.1', expectedMaxSize: 10 },
        { ip: '2001:db8::1', expectedMaxSize: 25 },
        { ip: '::1', expectedMaxSize: 25 }
      ];

      for (const { ip, expectedMaxSize } of testCases) {
        const version = detectIPVersion(ip);
        let encoded;

        if (version === 'ipv4') {
          encoded = encodeIPv4(ip);
        } else {
          encoded = encodeIPv6(ip);
        }

        expect(encoded.length).toBeLessThanOrEqual(expectedMaxSize);
      }
    });
  });
});
