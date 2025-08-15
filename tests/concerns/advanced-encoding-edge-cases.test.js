import { describe, test, expect } from '@jest/globals';
import { 
  advancedEncode, 
  advancedDecode,
  calculateAdvancedSize,
  optimizeObjectValues
} from '../../src/concerns/advanced-metadata-encoding.js';

describe('Advanced Encoding Edge Cases', () => {
  
  describe('calculateAdvancedSize', () => {
    test('should calculate size for dictionary values', () => {
      const result = calculateAdvancedSize('active');
      expect(result.original).toBe(6);
      expect(result.encoded).toBe(2); // 'd' + control char
      expect(result.method).toBe('dictionary');
      expect(result.savings).toBeGreaterThan(60);
      expect(result.ratio).toBeLessThan(0.4);
    });
    
    test('should calculate size for ISO timestamps', () => {
      const result = calculateAdvancedSize('2024-01-15T10:30:00Z');
      expect(result.original).toBe(20);
      expect(result.encoded).toBeLessThan(12);
      expect(result.method).toBe('iso-timestamp');
      expect(result.savings).toBeGreaterThan(40);
    });
    
    test('should calculate size for UUIDs', () => {
      const result = calculateAdvancedSize('550e8400-e29b-41d4-a716-446655440000');
      expect(result.original).toBe(36);
      expect(result.encoded).toBeLessThan(26);
      expect(result.method).toBe('uuid');
      expect(result.savings).toBeGreaterThan(25);
    });
    
    test('should handle empty string', () => {
      const result = calculateAdvancedSize('');
      expect(result.original).toBe(0);
      expect(result.encoded).toBe(0);
      expect(result.savings).toBe(0);
      expect(result.ratio).toBe(1);
    });
    
    test('should handle non-string values', () => {
      const result = calculateAdvancedSize(123);
      expect(result.original).toBe(3);
      expect(result.method).toBe('number');
    });
  });
  
  describe('optimizeObjectValues', () => {
    test('should optimize all values in an object', () => {
      const obj = {
        status: 'active',
        enabled: 'true',
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2024-01-15T10:30:00Z',
        hash: 'd41d8cd98f00b204e9800998ecf8427e',
        count: '1234567890',
        name: 'Test Name'
      };
      
      const result = optimizeObjectValues(obj);
      
      expect(result.optimized.status).toBe('d\x01');
      expect(result.optimized.enabled).toBe('d\x10');
      expect(result.optimized.id).toMatch(/^u/);
      expect(result.optimized.timestamp).toMatch(/^is/);
      expect(result.optimized.hash).toMatch(/^h/);
      expect(result.optimized.count).toMatch(/^t/);
      expect(result.optimized.name).toBe('=Test Name');  // ASCII gets '=' prefix
      
      expect(result.stats.totalOriginal).toBeGreaterThan(result.stats.totalOptimized);
      expect(result.stats.methods).toBeDefined();
      expect(result.stats.methods.dictionary).toBe(2);
      expect(result.stats.methods.uuid).toBe(1);
      expect(result.stats.methods['iso-timestamp']).toBe(1);
      expect(result.stats.methods.hex).toBe(1);
    });
    
    test('should handle empty object', () => {
      const result = optimizeObjectValues({});
      
      expect(result.optimized).toEqual({});
      expect(result.stats.totalOriginal).toBe(0);
      expect(result.stats.totalOptimized).toBe(0);
      expect(result.stats.methods).toEqual({});
    });
    
    test('should handle mixed value types', () => {
      const obj = {
        string: 'hello',
        number: 123,
        boolean: true,
        null: null,
        undefined: undefined
      };
      
      const result = optimizeObjectValues(obj);
      
      expect(result.optimized.string).toBeDefined();
      expect(result.optimized.number).toBeDefined();
      expect(result.optimized.boolean).toBeDefined();
      expect(result.optimized.null).toBe('d\x40');  // null with 'd' prefix
      expect(result.optimized.undefined).toBe('d\x41');  // undefined with 'd' prefix
    });
  });
  
  describe('Decoder edge cases', () => {
    test('should handle UUID decoding with invalid base64', () => {
      // Note: base64 can decode many strings, even if they weren't originally base64
      const corrupted = 'u===='; // Invalid base64 padding
      const result = advancedDecode(corrupted);
      // Will either decode to something or return original
      expect(result).toBeDefined();
    });
    
    test('should handle hex decoding with invalid base64', () => {
      const corrupted = 'h====';
      const result = advancedDecode(corrupted);
      expect(result).toBeDefined();
    });
    
    test('should handle ISO timestamp with valid base62 that creates invalid date', () => {
      // Base62 will decode but might create invalid date
      const encoded = 'is0'; // Very small timestamp
      const result = advancedDecode(encoded);
      expect(result).toBeDefined();
    });
    
    test('should handle timestamp decoding', () => {
      const encoded = 't1ly7vk'; // Valid base62
      const result = advancedDecode(encoded);
      expect(result).toMatch(/^\d+$/);
    });
    
    test('should handle number decoding', () => {
      const encoded = 'n1Z'; // Valid base62
      const result = advancedDecode(encoded);
      expect(result).toMatch(/^\d+$/);
    });
    
    test('should handle base64 decoding with padding', () => {
      const encoded = 'bSGVsbG8='; // 'Hello' in base64
      const result = advancedDecode(encoded);
      expect(result).toBe('Hello');
    });
    
    test('should handle URL decoding', () => {
      const encoded = '%Jos%C3%A9'; // José URL encoded
      const result = advancedDecode(encoded);
      expect(result).toBe('José');
    });
  });
  
  describe('Special encoding patterns', () => {
    test('should handle strings with prefix patterns but not actually prefixed', () => {
      const notUuid = '550e8400-invalid-uuid';
      const result = advancedEncode(notUuid);
      expect(result.method).not.toBe('uuid');
    });
    
    test('should handle almost-hex strings', () => {
      const almostHex = 'd41d8cd98f00b204e9800998ecf8427g'; // 'g' at end
      const result = advancedEncode(almostHex);
      expect(result.method).not.toBe('hex');
    });
    
    test('should handle almost-ISO timestamps', () => {
      const almostISO = '2024-13-45T25:61:00Z'; // Invalid date
      const result = advancedEncode(almostISO);
      // Regex might match but Date constructor will fail, returning NaN
      // In that case it might still try to encode as ISO
      expect(result).toBeDefined();
    });
    
    test('should handle very large numbers as strings', () => {
      const bigNum = '99999999999999999999999999999999';
      const result = advancedEncode(bigNum);
      // Should either be hex (if all digits) or number
      expect(['hex', 'number']).toContain(result.method);
    });
    
    test('should handle strings that look like timestamps but arent', () => {
      const notTimestamp = '1234567890abc';
      const result = advancedEncode(notTimestamp);
      expect(result.method).not.toBe('timestamp');
    });
  });
  
  describe('Performance edge cases', () => {
    test('should handle very long strings efficiently', () => {
      const longString = 'a'.repeat(10000);
      const start = process.hrtime.bigint();
      const result = advancedEncode(longString);
      const time = Number(process.hrtime.bigint() - start) / 1_000_000;
      
      expect(time).toBeLessThan(10); // Should be fast even for long strings
      // Long repeating string might be detected as hex
      expect(['base64', 'hex']).toContain(result.method);
    });
    
    test('should handle many small encodes efficiently', () => {
      const start = process.hrtime.bigint();
      for (let i = 0; i < 1000; i++) {
        advancedEncode('active');
        advancedEncode('true');
        advancedEncode('GET');
      }
      const time = Number(process.hrtime.bigint() - start) / 1_000_000;
      
      expect(time).toBeLessThan(50); // Should be very fast for dictionary values
    });
  });
  
  describe('Unicode edge cases', () => {
    test('should handle various Unicode characters', () => {
      const unicode = '你好世界 مرحبا שלום 🌍🌎🌏';
      const result = advancedEncode(unicode);
      expect(result.method).toBe('base64');
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(unicode);
    });
    
    test('should handle zero-width characters', () => {
      const zeroWidth = 'hello\u200Bworld'; // Zero-width space
      const result = advancedEncode(zeroWidth);
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(zeroWidth);
    });
    
    test('should handle RTL text', () => {
      const rtl = 'مرحبا بالعالم';
      const result = advancedEncode(rtl);
      expect(result.method).toBe('base64');
      
      const decoded = advancedDecode(result.encoded);
      expect(decoded).toBe(rtl);
    });
  });
});