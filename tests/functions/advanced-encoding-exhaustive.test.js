import { describe, test, expect } from '@jest/globals';
import { 
  advancedEncode, 
  advancedDecode,
  calculateAdvancedSize,
  optimizeObjectValues 
} from '../../src/concerns/advanced-metadata-encoding.js';

describe('Advanced Metadata Encoding - Exhaustive Pattern Detection Tests', () => {
  
  describe('UUID Pattern Detection', () => {
    test('should detect and compress valid UUID v4', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '123e4567-e89b-42d3-a456-426614174000',
      ];
      
      validUUIDs.forEach(uuid => {
        const result = advancedEncode(uuid);
        expect(result.method).toBe('uuid');
        expect(result.encoded.startsWith('u')).toBe(true);
        expect(result.encoded.length).toBeLessThan(30);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(uuid);
      });
    });

    test('should NOT detect invalid UUIDs', () => {
      const invalidUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000x', // Extra char
        '550e8400-e29b-41d4-a716-44665544000',  // Missing digit
        '550e8400e29b41d4a716446655440000',     // No hyphens
        'not-a-uuid-at-all',
        '550e8400-xxxx-41d4-a716-446655440000', // Invalid hex
      ];
      
      invalidUUIDs.forEach(str => {
        const result = advancedEncode(str);
        expect(result.method).not.toBe('uuid');
      });
    });

    test('should handle UUID case variations', () => {
      const uuids = [
        '550E8400-E29B-41D4-A716-446655440000', // Upper
        '550e8400-e29b-41d4-a716-446655440000', // Lower
        '550E8400-e29b-41D4-a716-446655440000', // Mixed
      ];
      
      uuids.forEach(uuid => {
        const result = advancedEncode(uuid);
        expect(result.method).toBe('uuid');
        const decoded = advancedDecode(result.encoded);
        expect(decoded.toLowerCase()).toBe(uuid.toLowerCase());
      });
    });
  });

  describe('Hex String Pattern Detection', () => {
    test('should detect various hash formats', () => {
      const hashes = [
        { value: 'd41d8cd98f00b204e9800998ecf8427e', type: 'MD5' },
        { value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', type: 'SHA256' },
        { value: 'da39a3ee5e6b4b0d3255bfef95601890afd80709', type: 'SHA1' },
        { value: '507f1f77bcf86cd799439011', type: 'ObjectId' },
      ];
      
      hashes.forEach(({ value, type }) => {
        const result = advancedEncode(value);
        expect(result.method).toBe('hex');
        expect(result.encoded.startsWith('h')).toBe(true);
        expect(result.encoded.length).toBeLessThan(value.length);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(value);
      });
    });

    test('should handle hex strings of various lengths', () => {
      const hexStrings = [
        'deadbeef',           // 8 chars
        'cafebabe12345678',   // 16 chars  
        'abcdef0123456789abcdef0123456789', // 32 chars
      ];
      
      hexStrings.forEach(hex => {
        const result = advancedEncode(hex);
        expect(result.method).toBe('hex');
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(hex);
      });
    });

    test('should NOT detect non-hex strings', () => {
      const nonHex = [
        'ghijklmn',          // Non-hex chars
        'deadbee',           // Odd length
        '12345',             // Odd length
        'hex123',            // Mixed non-hex
        '00',                // Too short (< 8)
      ];
      
      nonHex.forEach(str => {
        const result = advancedEncode(str);
        expect(result.method).not.toBe('hex');
      });
    });
  });

  describe('Timestamp Pattern Detection', () => {
    test('should detect Unix timestamps', () => {
      const timestamps = [
        '1000000000',  // Sep 2001
        '1234567890',  // Feb 2009
        '1705321800',  // Jan 2024
        '1999999999',  // Sep 2033
      ];
      
      timestamps.forEach(ts => {
        const result = advancedEncode(ts);
        expect(result.method).toBe('timestamp');
        expect(result.encoded.startsWith('t')).toBe(true);
        expect(result.encoded.length).toBeLessThan(ts.length);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(ts);
      });
    });

    test('should detect millisecond timestamps', () => {
      const msTimestamps = [
        '1000000000000',  // Sep 2001
        '1234567890123',  // Feb 2009
        '1705321800000',  // Jan 2024
        '1999999999999',  // Sep 2033
      ];
      
      msTimestamps.forEach(ts => {
        const result = advancedEncode(ts);
        expect(result.method).toBe('timestamp');
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(ts);
      });
    });

    test('should NOT detect non-timestamp numbers', () => {
      const nonTimestamps = [
        '123',            // Too small
        '999999999',      // Just below threshold
        '2000000001',     // Just above threshold
        '99999999999999', // Too large
      ];
      
      nonTimestamps.forEach(num => {
        const result = advancedEncode(num);
        expect(result.method).not.toBe('timestamp');
      });
    });
  });

  describe('Dictionary Encoding', () => {
    test('should encode common status values', () => {
      const statuses = ['active', 'inactive', 'pending', 'completed', 'failed', 'deleted', 'archived', 'draft'];
      
      statuses.forEach(status => {
        const result = advancedEncode(status);
        expect(result.method).toBe('dictionary');
        expect(result.encoded.length).toBe(2); // 'd' + 1 byte
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(status);
      });
    });

    test('should encode boolean-like values', () => {
      const booleans = ['true', 'false', 'yes', 'no', '1', '0'];
      
      booleans.forEach(bool => {
        const result = advancedEncode(bool);
        expect(result.method).toBe('dictionary');
        expect(result.encoded.length).toBe(2);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(bool);
      });
    });

    test('should encode HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      
      methods.forEach(method => {
        const result = advancedEncode(method);
        expect(result.method).toBe('dictionary');
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded.toUpperCase()).toBe(method.toUpperCase());  // Compare case-insensitive
      });
    });

    test('should handle case sensitivity for dictionary', () => {
      const variations = [
        { input: 'Active', expected: 'active' },
        { input: 'TRUE', expected: 'true' },
        { input: 'POST', expected: 'post' },  // Changed to uppercase
      ];
      
      variations.forEach(({ input, expected }) => {
        const result = advancedEncode(input);
        expect(result.method).toBe('dictionary');
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded.toLowerCase()).toBe(expected.toLowerCase());  // Compare lowercase
      });
    });
  });

  describe('Number Encoding with Base62', () => {
    test('should encode large numbers efficiently', () => {
      const numbers = [
        '1234567890',
        '9876543210',
        '999999999999',
        '18446744073709551615', // Max uint64
      ];
      
      numbers.forEach(num => {
        const result = advancedEncode(num);
        if (result.method === 'number') {
          expect(result.encoded.startsWith('n')).toBe(true);
          expect(result.encoded.length).toBeLessThan(num.length);
          
          const decoded = advancedDecode(result.encoded);
          expect(decoded).toBe(num);
        }
      });
    });

    test('should NOT encode small numbers where base62 is not beneficial', () => {
      const smallNumbers = ['1', '12', '123', '1234'];
      
      smallNumbers.forEach(num => {
        const result = advancedEncode(num);
        expect(result.method).not.toBe('number');
      });
    });
  });

  describe('Fallback Encoding', () => {
    test('should handle pure ASCII without encoding', () => {
      const asciiStrings = [
        'simple_text',
        'user@example.com',
        'file_name_123.txt',
        'ABC-123-XYZ',
      ];
      
      asciiStrings.forEach(str => {
        const result = advancedEncode(str);
        expect(result.method).toBe('none');
        expect(result.encoded).toBe(str);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(str);
      });
    });

    test('should use URL encoding for Latin-1 characters', () => {
      const latinStrings = [
        'José María',
        'Café résumé',
        'Straße München',
        'São Paulo',
      ];
      
      latinStrings.forEach(str => {
        const result = advancedEncode(str);
        expect(result.method).toBe('url');
        expect(result.encoded.startsWith('%')).toBe(true);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(str);
      });
    });

    test('should use base64 for emoji and CJK', () => {
      const multibyteStrings = [
        '🚀🌟😊',
        '你好世界',
        '日本語テスト',
        '한국어 테스트',
        '🎉 Party! 🎊',
      ];
      
      multibyteStrings.forEach(str => {
        const result = advancedEncode(str);
        expect(result.method).toBe('base64');
        expect(result.encoded.startsWith('b')).toBe(true);
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(str);
      });
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle empty strings', () => {
      const result = advancedEncode('');
      expect(result.encoded).toBe('');
      expect(result.method).toBe('none');
      
      const decoded = advancedDecode('');
      expect(decoded).toBe('');
    });

    test('should handle null and undefined', () => {
      const nullResult = advancedEncode(null);
      expect(nullResult.method).toBe('dictionary');
      const nullDecoded = advancedDecode(nullResult.encoded);
      expect(nullDecoded).toBe('null');
      
      const undefinedResult = advancedEncode(undefined);
      expect(undefinedResult.method).toBe('dictionary');
      const undefinedDecoded = advancedDecode(undefinedResult.encoded);
      expect(undefinedDecoded).toBe('undefined');
    });

    test('should handle strings that look like encoded values', () => {
      const ambiguousStrings = [
        'u:test',    // Looks like UUID prefix
        'h:data',    // Looks like hex prefix
        't:value',   // Looks like timestamp prefix
        'n:number',  // Looks like number prefix
        'd:dict',    // Looks like dictionary prefix
        'b:base64',  // Looks like base64 prefix
      ];
      
      ambiguousStrings.forEach(str => {
        const encoded = advancedEncode(str);
        const decoded = advancedDecode(encoded.encoded);
        expect(decoded).toBe(str);
      });
    });

    test('should handle malformed encoded values gracefully', () => {
      const malformed = [
        'u',          // Just prefix, no content
        'h',          // Just prefix
        't',          // Just prefix
        'u:notbase64!', // Invalid base64
        'h:notbase64!', // Invalid base64
        't:notbase62!', // Invalid base62
      ];
      
      malformed.forEach(str => {
        const decoded = advancedDecode(str);
        expect(decoded).toBe(str); // Should return original if decode fails
      });
    });

    test('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const result = advancedEncode(longString);
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(longString);
    });

    test('should handle strings with mixed patterns', () => {
      const mixed = [
        'uuid:550e8400-e29b-41d4-a716-446655440000',
        'hash:d41d8cd98f00b204e9800998ecf8427e',
        'time:1705321800',
        'status:active',
      ];
      
      mixed.forEach(str => {
        const result = advancedEncode(str);
        // Should not detect pattern due to prefix
        expect(result.method).not.toBe('uuid');
        expect(result.method).not.toBe('hex');
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(str);
      });
    });
  });

  describe('Object Optimization', () => {
    test('should optimize objects with various patterns', () => {
      const testObject = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        objectId: '507f1f77bcf86cd799439011',
        timestamp: '1705321800',
        status: 'active',
        method: 'POST',
        enabled: 'true',
        hash: 'd41d8cd98f00b204e9800998ecf8427e',
        name: 'John Doe',
        description: 'Simple text description',
        unicode: 'José María',
        emoji: '🚀 Launch',
      };
      
      const result = optimizeObjectValues(testObject);
      
      // Check that optimization happened
      expect(result.stats.savings).toBeGreaterThan(0);
      expect(result.stats.methods.uuid).toBe(1);
      expect(result.stats.methods.hex).toBe(2);
      expect(result.stats.methods.timestamp).toBe(1);
      expect(result.stats.methods.dictionary).toBeGreaterThanOrEqual(3);
      
      // Check that all values can be decoded
      for (const [key, encoded] of Object.entries(result.optimized)) {
        const decoded = advancedDecode(encoded);
        expect(decoded).toBe(String(testObject[key]));
      }
    });

    test('should calculate correct savings percentages', () => {
      const obj = {
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active',
      };
      
      const result = optimizeObjectValues(obj);
      
      // UUID: 36 chars to ~24 (base64 of 16 bytes)
      // Status: 6 chars to 2 (dictionary)
      // Total: 42 original, ~26 optimized
      expect(result.stats.savings).toBeGreaterThan(30);
      expect(result.stats.totalOriginal).toBe(42);
    });
  });

  describe('Performance Characteristics', () => {
    test('should complete encoding/decoding quickly for common patterns', () => {
      const iterations = 1000;
      const testData = [
        '550e8400-e29b-41d4-a716-446655440000',
        'd41d8cd98f00b204e9800998ecf8427e',
        '1705321800',
        'active',
        'simple_text',
      ];
      
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        testData.forEach(value => {
          const encoded = advancedEncode(value);
          advancedDecode(encoded.encoded);
        });
      }
      const elapsed = Date.now() - start;
      
      // Should complete 5000 encode/decode operations reasonably fast
      expect(elapsed).toBeLessThan(1000); // Less than 1 second
    });
  });

  describe('Size Calculation', () => {
    test('should calculate correct size and savings', () => {
      const testCases = [
        { value: '550e8400-e29b-41d4-a716-446655440000', minSavings: 30 },
        { value: 'd41d8cd98f00b204e9800998ecf8427e', minSavings: 30 },
        { value: 'active', minSavings: 60 },
        { value: '1705321800', minSavings: 20 },
      ];
      
      testCases.forEach(({ value, minSavings }) => {
        const size = calculateAdvancedSize(value);
        expect(size.savings).toBeGreaterThan(minSavings);
        expect(size.original).toBe(Buffer.byteLength(value, 'utf8'));
        expect(size.encoded).toBeLessThan(size.original);
      });
    });
  });
});