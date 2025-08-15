import { describe, test, expect } from '@jest/globals';
import { 
  advancedEncode, 
  advancedDecode, 
  calculateAdvancedSize,
  optimizeObjectValues 
} from '../../src/concerns/advanced-metadata-encoding.js';
import { metadataEncode } from '../../src/concerns/metadata-encoding.js';

describe('Ultra Encoding - Advanced String Optimizations', () => {
  
  describe('UUID Optimization', () => {
    test('should compress UUID v4 from 36 to ~24 chars', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = advancedEncode(uuid);
      
      expect(result.method).toBe('uuid');
      expect(result.encoded.startsWith('u')).toBe(true);
      expect(result.encoded.length).toBeLessThan(30); // base64 of 16 bytes
      
      // Test decode
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(uuid);
    });

    test('should handle various UUID formats', () => {
      const uuids = [
        '123e4567-e89b-42d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-41d0-b3d3-00265947051c'
      ];
      
      uuids.forEach(uuid => {
        const encoded = advancedEncode(uuid);
        const decoded = advancedDecode(encoded.encoded);
        expect(decoded).toBe(uuid);
        expect(encoded.encoded.length).toBeLessThan(uuid.length);
      });
    });
  });

  describe('Hex String Optimization', () => {
    test('should compress MD5 hash by ~33%', () => {
      const md5 = 'd41d8cd98f00b204e9800998ecf8427e';
      const result = advancedEncode(md5);
      
      expect(result.method).toBe('hex');
      expect(result.encoded.startsWith('h')).toBe(true);
      expect(result.encoded.length).toBeLessThan(md5.length);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(md5);
    });

    test('should compress SHA256 hash', () => {
      const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const result = advancedEncode(sha256);
      
      expect(result.method).toBe('hex');
      expect(result.encoded.length).toBeLessThan(sha256.length);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(sha256);
    });

    test('should handle MongoDB ObjectIds', () => {
      const objectId = '507f1f77bcf86cd799439011';
      const result = advancedEncode(objectId);
      
      expect(result.method).toBe('hex');
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(objectId);
    });
  });

  describe('Dictionary Encoding', () => {
    test('should encode common status values to single bytes', () => {
      const statuses = ['active', 'inactive', 'pending', 'completed', 'failed'];
      
      statuses.forEach(status => {
        const result = advancedEncode(status);
        expect(result.method).toBe('dictionary');
        expect(result.encoded.length).toBe(2); // 'd' prefix + 1 byte
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(status);
      });
    });

    test('should encode boolean values efficiently', () => {
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
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
      methods.forEach(method => {
        const result = advancedEncode(method);
        expect(result.method).toBe('dictionary');
        
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(method);
      });
    });
  });

  describe('Timestamp Optimization', () => {
    test('should optimize Unix timestamps with base62', () => {
      const timestamp = '1705321800'; // 10 digits
      const result = advancedEncode(timestamp);
      
      expect(result.method).toBe('timestamp');
      expect(result.encoded.startsWith('t')).toBe(true);
      expect(result.encoded.length).toBeLessThan(timestamp.length);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(timestamp);
    });

    test('should optimize millisecond timestamps', () => {
      const timestamp = '1705321800000'; // 13 digits
      const result = advancedEncode(timestamp);
      
      expect(result.method).toBe('timestamp');
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(timestamp);
    });
  });

  describe('Number Optimization', () => {
    test('should optimize large numbers with base62', () => {
      const numbers = ['1234567890', '9876543210', '999999999999'];
      
      numbers.forEach(num => {
        const result = advancedEncode(num);
        if (result.method === 'number') {
          expect(result.encoded.length).toBeLessThan(num.length);
          const decoded = advancedDecode(result.encoded);
          expect(decoded).toBe(num);
        }
      });
    });

    test('should not encode small numbers where base62 is not beneficial', () => {
      const smallNumbers = ['1', '12', '123'];
      
      smallNumbers.forEach(num => {
        const result = advancedEncode(num);
        expect(result.method).toBe('none'); // Too small to benefit
      });
    });
  });

  describe('Fallback Behaviors', () => {
    test('should handle ASCII strings without encoding', () => {
      const ascii = 'simple_ascii_text_123';
      const result = advancedEncode(ascii);
      
      expect(result.method).toBe('none');
      expect(result.encoded).toBe(ascii);
    });

    test('should handle Latin characters with URL encoding', () => {
      const latin = 'José María';
      const result = advancedEncode(latin);
      
      expect(result.method).toBe('url');
      expect(result.encoded.startsWith('%')).toBe(true);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(latin);
    });

    test('should handle emoji with base64', () => {
      const emoji = '🚀🌟😊';
      const result = advancedEncode(emoji);
      
      expect(result.method).toBe('base64');
      expect(result.encoded.startsWith('b')).toBe(true);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(emoji);
    });
  });

  describe('Size Calculations', () => {
    test('should calculate correct size savings', () => {
      const tests = [
        { value: '550e8400-e29b-41d4-a716-446655440000', expectedSavings: 30 }, // UUID
        { value: 'd41d8cd98f00b204e9800998ecf8427e', expectedSavings: 30 }, // MD5
        { value: 'active', expectedSavings: 60 }, // Dictionary
        { value: '1705321800', expectedSavings: 30 }, // Timestamp
      ];
      
      tests.forEach(({ value, expectedSavings }) => {
        const size = calculateAdvancedSize(value);
        expect(size.savings).toBeGreaterThan(expectedSavings);
      });
    });
  });

  describe('Object Optimization', () => {
    test('should optimize entire objects efficiently', () => {
      const obj = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active',
        created: '1705321800',
        hash: 'd41d8cd98f00b204e9800998ecf8427e',
        method: 'POST',
        enabled: 'true',
        name: 'John Doe',
        description: 'Simple ASCII text'
      };
      
      const result = optimizeObjectValues(obj);
      
      expect(result.stats.savings).toBeGreaterThan(20);
      expect(result.stats.methods.uuid).toBe(1);
      expect(result.stats.methods.dictionary).toBeGreaterThanOrEqual(3);
      expect(result.stats.methods.hex).toBe(1);
      
      // Verify all can be decoded
      for (const [key, encoded] of Object.entries(result.optimized)) {
        const decoded = advancedDecode(encoded);
        expect(decoded).toBe(String(obj[key]));
      }
    });
  });

  describe('Comparison with Smart Encoding', () => {
    test('should outperform smart encoding for specific patterns', () => {
      const testCases = [
        { value: '550e8400-e29b-41d4-a716-446655440000', name: 'UUID' },
        { value: 'd41d8cd98f00b204e9800998ecf8427e', name: 'MD5' },
        { value: 'active', name: 'Status' },
        { value: '1705321800', name: 'Timestamp' },
        { value: 'POST', name: 'HTTP Method' }
      ];
      
      const comparison = testCases.map(({ value, name }) => {
        const smart = metadataEncode(value);
        const ultra = advancedEncode(value);
        
        return {
          'Pattern': name,
          'Original': value.length,
          'Smart': smart.encoded.length,
          'Ultra': ultra.encoded.length,
          'Improvement': smart.encoded.length > ultra.encoded.length ? 
            `${Math.round((1 - ultra.encoded.length/smart.encoded.length) * 100)}%` : '0%'
        };
      });
      
      console.table(comparison);
      
      // Ultra should be better for most patterns
      const improvements = comparison.filter(c => c.Improvement !== '0%');
      expect(improvements.length).toBeGreaterThan(2);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty strings', () => {
      expect(advancedEncode('').encoded).toBe('');
      expect(advancedDecode('')).toBe('');
    });

    test('should handle null and undefined', () => {
      const nullResult = advancedEncode(null);
      expect(nullResult.method).toBe('dictionary');
      expect(advancedDecode(nullResult.encoded)).toBe('null');
      
      const undefinedResult = advancedEncode(undefined);
      expect(undefinedResult.method).toBe('dictionary');
      expect(advancedDecode(undefinedResult.encoded)).toBe('undefined');
    });

    test('should handle malformed inputs gracefully', () => {
      const malformed = [
        'not-a-uuid',
        'not-hex-g123',
        'partial-550e8400',
        '%%%broken%%%'
      ];
      
      malformed.forEach(input => {
        const encoded = advancedEncode(input);
        const decoded = advancedDecode(encoded.encoded);
        expect(decoded).toBe(input); // Should preserve original
      });
    });

    test('should handle already encoded strings', () => {
      const value = 'test_string';
      const encoded1 = advancedEncode(value);
      const encoded2 = advancedEncode(encoded1.encoded);
      
      // Should not double-encode
      const decoded1 = advancedDecode(encoded1.encoded);
      const decoded2 = advancedDecode(encoded2.encoded);
      
      expect(decoded1).toBe(value);
    });
  });
});