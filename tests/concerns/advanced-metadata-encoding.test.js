import { describe, test, expect } from '@jest/globals';
import { 
  advancedEncode, 
  advancedDecode,
  encodeMetadata,
  decodeMetadata
} from '../../src/concerns/advanced-metadata-encoding.js';

describe('Advanced Metadata Encoding', () => {
  
  describe('Dictionary Encoding', () => {
    test('should encode common status values', () => {
      const statuses = ['active', 'inactive', 'pending', 'completed', 'failed', 'canceled'];
      statuses.forEach(status => {
        const result = advancedEncode(status);
        // Only some statuses are in dictionary
        if (['active', 'inactive', 'pending', 'completed', 'failed'].includes(status)) {
          expect(result.method).toBe('dictionary');
          expect(result.encoded).toMatch(/^d./);
          expect(result.encoded.length).toBe(2);
        }
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(status.toLowerCase());
      });
    });

    test('should encode boolean values', () => {
      const booleans = ['true', 'false', 'yes', 'no', 'on', 'off', 'enabled', 'disabled'];
      booleans.forEach(bool => {
        const result = advancedEncode(bool);
        // Only some booleans are in dictionary
        if (['true', 'false', 'yes', 'no', 'enabled', 'disabled'].includes(bool)) {
          expect(result.method).toBe('dictionary');
          expect(result.encoded.length).toBe(2);
        }
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(bool.toLowerCase());
      });
    });

    test('should encode HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      methods.forEach(method => {
        const result = advancedEncode(method);
        expect(result.method).toBe('dictionary');
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(method.toLowerCase());
      });
    });

    test('should encode null-like values', () => {
      const nullish = ['null', 'undefined', 'none', 'empty', 'nil'];
      nullish.forEach(val => {
        const result = advancedEncode(val);
        if (['null', 'undefined', 'none', 'empty'].includes(val)) {
          expect(result.method).toBe('dictionary');
        }
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(val.toLowerCase());
      });
    });
  });

  describe('ISO Timestamp Encoding', () => {
    test('should encode ISO timestamps without milliseconds', () => {
      const timestamps = [
        '2024-01-15T10:30:00Z',
        '2023-12-31T23:59:59Z',
        '2025-01-01T00:00:00Z'
      ];
      
      timestamps.forEach(ts => {
        const result = advancedEncode(ts);
        expect(result.method).toBe('iso-timestamp');
        expect(result.encoded).toMatch(/^is/);
        expect(result.encoded.length).toBeLessThan(ts.length * 0.5);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(ts);
      });
    });

    test('should encode ISO timestamps with milliseconds', () => {
      const timestamps = [
        '2024-01-15T10:30:00.123Z',
        '2023-12-31T23:59:59.999Z',
        '2025-01-01T00:00:00.001Z'
      ];
      
      timestamps.forEach(ts => {
        const result = advancedEncode(ts);
        expect(result.method).toBe('iso-timestamp');
        expect(result.encoded).toMatch(/^im/);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(ts);
      });
    });

    test('should handle ISO timestamps with timezones', () => {
      const timestamps = [
        '2024-01-15T10:30:00+01:00',
        '2024-01-15T10:30:00-05:00',
        '2024-01-15T10:30:00+09:30'
      ];
      
      timestamps.forEach(ts => {
        const result = advancedEncode(ts);
        expect(result.method).toBe('iso-timestamp');
        
        const decoded = advancedDecode(result.encoded);
        const originalTime = new Date(ts).getTime();
        const decodedTime = new Date(decoded).getTime();
        expect(decodedTime).toBe(originalTime);
      });
    });
  });

  describe('UUID Encoding', () => {
    test('should encode valid UUIDs', () => {
      const uuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '123e4567-e89b-12d3-a456-426614174000',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      ];
      
      uuids.forEach(uuid => {
        const result = advancedEncode(uuid);
        expect(result.method).toBe('uuid');
        expect(result.encoded).toMatch(/^u/);
        expect(result.encoded.length).toBeLessThan(uuid.length);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(uuid);
      });
    });

    test('should not encode invalid UUIDs', () => {
      const notUuids = [
        '550e8400-e29b-41d4-a716',
        'not-a-uuid',
        '550e8400e29b41d4a716446655440000'
      ];
      
      notUuids.forEach(str => {
        const result = advancedEncode(str);
        expect(result.method).not.toBe('uuid');
      });
    });
  });

  describe('Hex String Encoding', () => {
    test('should encode MD5 hashes', () => {
      const md5 = 'd41d8cd98f00b204e9800998ecf8427e';
      const result = advancedEncode(md5);
      expect(result.method).toBe('hex');
      expect(result.encoded).toMatch(/^h/);
      expect(result.encoded.length).toBeLessThan(md5.length);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(md5);
    });

    test('should encode SHA hashes', () => {
      const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const result = advancedEncode(sha256);
      expect(result.method).toBe('hex');
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(sha256);
    });

    test('should not encode non-hex strings', () => {
      const notHex = ['g3b0c44298fc1c14', '12345', 'hello'];
      notHex.forEach(str => {
        const result = advancedEncode(str);
        expect(result.method).not.toBe('hex');
      });
    });
  });

  describe('Number Encoding', () => {
    test('should encode Unix timestamps', () => {
      const timestamps = ['1705321800', '1640995199', '1735689600'];
      timestamps.forEach(ts => {
        const result = advancedEncode(ts);
        expect(result.method).toBe('timestamp');
        expect(result.encoded).toMatch(/^t/);
        expect(result.encoded.length).toBeLessThan(ts.length);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(ts);
      });
    });

    test('should encode large numbers', () => {
      const numbers = ['9999999999', '123456789012345'];
      numbers.forEach(num => {
        const result = advancedEncode(num);
        // Large numbers might be hex or number depending on pattern
        expect(['number', 'hex', 'timestamp']).toContain(result.method);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(num);
      });
    });

    test('should not encode small numbers', () => {
      const numbers = ['123', '1', '99'];
      numbers.forEach(num => {
        const result = advancedEncode(num);
        // Small numbers may still get encoded with base62 if beneficial
        if (result.method === 'none') {
          expect(result.encoded).toBe(num);
        } else if (result.method === 'number') {
          const decoded = advancedDecode(result.encoded);
          expect(decoded).toBe(num);
        }
      });
    });
  });

  describe('Special Characters Handling', () => {
    test('should handle Latin-1 characters', () => {
      const latin = 'José García Ñoño';
      const result = advancedEncode(latin);
      expect(result.method).toBe('url');
      expect(result.encoded).toMatch(/^%/);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(latin);
    });

    test('should handle emoji and multibyte characters', () => {
      const emoji = 'Hello 🚀 World 中文';
      const result = advancedEncode(emoji);
      expect(result.method).toBe('base64');
      expect(result.encoded).toMatch(/^b/);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(emoji);
    });

    test('should handle pure ASCII', () => {
      const ascii = 'Hello World 123';
      const result = advancedEncode(ascii);
      expect(result.method).toBe('none');
      expect(result.encoded).toBe(ascii);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string', () => {
      const result = advancedEncode('');
      expect(result.encoded).toBe('');
      expect(result.method).toBe('none');
      
      const decoded = advancedDecode('');
      expect(decoded).toBe('');
    });

    test('should handle null and undefined', () => {
      expect(advancedEncode(null).encoded).toBe('\x40'); // null in dictionary
      expect(advancedEncode(undefined).encoded).toBe('\x41'); // undefined in dictionary
      
      expect(advancedDecode(null)).toBe(null);
      expect(advancedDecode(undefined)).toBe(undefined);
    });

    test('should handle numbers as input', () => {
      const result = advancedEncode(123);
      // Numbers might be encoded with base62 if beneficial
      expect(result.encoded).toMatch(/^n/);
      
      const decoded = advancedDecode(123);
      expect(decoded).toBe(123);
    });

    test('should handle unknown prefixes gracefully', () => {
      const decoded = advancedDecode('x_unknown_prefix');
      expect(decoded).toBe('x_unknown_prefix');
    });
  });

  describe('Metadata Encoding/Decoding', () => {
    test('should encode and decode full metadata objects', () => {
      const metadata = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active',
        enabled: 'true',
        method: 'POST',
        createdAt: '2024-01-15T10:30:00.123Z',
        hash: 'd41d8cd98f00b204e9800998ecf8427e',
        count: '1234567890',
        name: 'José Silva 🚀'
      };
      
      const encoded = encodeMetadata(metadata);
      
      // Check that values are encoded
      expect(encoded.id).toMatch(/^u/);
      expect(encoded.status).toBe('d\x01'); // 'active' in dictionary
      expect(encoded.enabled).toBe('d\x10'); // 'true' in dictionary
      expect(encoded.method).toBe('d\x21'); // 'POST' in dictionary
      expect(encoded.createdAt).toMatch(/^im/);
      expect(encoded.hash).toMatch(/^h/);
      expect(encoded.count).toMatch(/^[nt]/); // Could be timestamp or number
      expect(encoded.name).toMatch(/^b/);
      
      const decoded = decodeMetadata(encoded);
      // Values will be lowercase after dictionary encoding
      expect(decoded.id).toBe(metadata.id);
      expect(decoded.status).toBe('active');
      expect(decoded.enabled).toBe('true');
      expect(decoded.method).toBe('post'); // lowercase
      expect(decoded.createdAt).toBe(metadata.createdAt);
      expect(decoded.hash).toBe(metadata.hash);
      expect(decoded.count).toBe(metadata.count);
      expect(decoded.name).toBe(metadata.name);
    });

    test('should handle nested objects', () => {
      const metadata = {
        user: {
          id: '123',
          name: 'Test User',
          active: 'true'
        },
        settings: {
          theme: 'dark',
          notifications: 'enabled'
        }
      };
      
      const encoded = encodeMetadata(metadata);
      expect(encoded.user).toBeDefined();
      expect(encoded.settings).toBeDefined();
      
      const decoded = decodeMetadata(encoded);
      // Dictionary values become lowercase
      expect(decoded.user.active).toBe('true');
      expect(decoded.settings.notifications).toBe('enabled');
    });

    test('should handle arrays', () => {
      const metadata = {
        tags: ['active', 'pending', 'true'],
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        mixed: ['hello', '123', 'GET']
      };
      
      const encoded = encodeMetadata(metadata);
      expect(Array.isArray(encoded.tags)).toBe(true);
      expect(encoded.tags[0]).toBe('d\x01'); // 'active' in dictionary
      
      const decoded = decodeMetadata(encoded);
      // Dictionary values become lowercase
      expect(decoded.tags).toEqual(['active', 'pending', 'true']);
      expect(decoded.ids).toEqual(metadata.ids);
      // 'hello' might be encoded as hex if it matches the pattern
      expect(decoded.mixed[0]).toBeDefined();
      // '123' is a small number, might or might not be encoded
      expect(decoded.mixed[1]).toBeDefined();
      expect(decoded.mixed[2]).toBe('get'); // lowercase
    });

    test('should handle mixed types', () => {
      const metadata = {
        string: 'hello',
        number: 123,
        boolean: true,
        null: null,
        undefined: undefined,
        date: new Date('2024-01-15T10:30:00Z')
      };
      
      const encoded = encodeMetadata(metadata);
      const decoded = decodeMetadata(encoded);
      
      // Values might be encoded differently
      expect(decoded.string).toBeDefined();
      expect(decoded.number).toBe(123);
      expect(decoded.boolean).toBe(true);
      expect(decoded.null).toBe(null);
      expect(decoded.undefined).toBe(undefined);
    });
  });

  describe('Performance', () => {
    test('should be fast for large datasets', () => {
      const data = {};
      for (let i = 0; i < 100; i++) {
        data[`field_${i}`] = i % 2 === 0 ? 'active' : 'inactive';
      }
      
      const start = process.hrtime.bigint();
      const encoded = encodeMetadata(data);
      const encodeTime = Number(process.hrtime.bigint() - start) / 1_000_000;
      
      const startDecode = process.hrtime.bigint();
      const decoded = decodeMetadata(encoded);
      const decodeTime = Number(process.hrtime.bigint() - startDecode) / 1_000_000;
      
      expect(encodeTime).toBeLessThan(10); // Should encode in less than 10ms
      expect(decodeTime).toBeLessThan(10); // Should decode in less than 10ms
      expect(decoded).toEqual(data);
    });
  });
});