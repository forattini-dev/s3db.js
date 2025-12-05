import { describe, test, it, expect, beforeAll, afterAll } from "vitest";
import { describe, test, expect } from 'vitest';
import { createDatabaseForTest } from '../config.js';
import { metadataEncode, metadataDecode } from '../../src/concerns/metadata-encoding.js';

describe('Smart Encoding - Exhaustive Tests', () => {
  let db;
  let resource;

  beforeAll(async () => {
    db = await createDatabaseForTest('suite=functions/smart-encoding-exhaustive');
    resource = await db.createResource({
      name: 'exhaustive_test',
      attributes: {
        id: 'string|optional',
        data: 'string|optional'
      }
    });
  });

  afterAll(async () => {
    if (db?.teardown) await db.teardown();
  });

  describe('Complete Unicode Coverage', () => {
    test('should handle all ASCII printable characters', () => {
      // Test all printable ASCII (32-126)
      for (let i = 32; i <= 126; i++) {
        const char = String.fromCharCode(i);
        const encoded = metadataEncode(char);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(char);
        
        // Most ASCII should not be encoded except special cases
        if (i >= 32 && i <= 126 && char !== '%' && char !== '+' && char !== '&' && char !== '=' && char !== '#') {
          expect(encoded.encoding).toBe('none');
        }
      }
    });

    test('should handle all control characters', () => {
      // Test control characters (0-31, 127)
      const controlChars = [];
      for (let i = 0; i < 32; i++) {
        controlChars.push(String.fromCharCode(i));
      }
      controlChars.push(String.fromCharCode(127)); // DEL
      
      controlChars.forEach(char => {
        const encoded = metadataEncode(char);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(char);
        // Control chars should be encoded
        expect(encoded.encoding).not.toBe('none');
      });
    });

    test('should handle Latin-1 Supplement (128-255)', () => {
      for (let i = 128; i <= 255; i++) {
        const char = String.fromCharCode(i);
        const encoded = metadataEncode(char);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(char);
        // Latin-1 should be encoded
        expect(encoded.encoding).not.toBe('none');
      }
    });

    test('should handle all Unicode blocks', () => {
      const unicodeBlocks = [
        { name: 'Latin Extended-A', start: 0x0100, end: 0x017F },
        { name: 'Greek', start: 0x0370, end: 0x03FF },
        { name: 'Cyrillic', start: 0x0400, end: 0x04FF },
        { name: 'Hebrew', start: 0x0590, end: 0x05FF },
        { name: 'Arabic', start: 0x0600, end: 0x06FF },
        { name: 'CJK Unified', start: 0x4E00, end: 0x4E10 }, // Just sample
        { name: 'Hiragana', start: 0x3040, end: 0x309F },
        { name: 'Katakana', start: 0x30A0, end: 0x30FF },
        { name: 'Hangul', start: 0xAC00, end: 0xAC10 }, // Just sample
        { name: 'Emoji', samples: [0x1F600, 0x1F601, 0x1F602, 0x1F923, 0x1F970] }
      ];

      unicodeBlocks.forEach(block => {
        if (block.samples) {
          // Test specific samples for large blocks
          block.samples.forEach(code => {
            const char = String.fromCodePoint(code);
            const encoded = metadataEncode(char);
            const decoded = metadataDecode(encoded.encoded);
            expect(decoded).toBe(char);
            // High unicode should use base64
            expect(encoded.encoding).toBe('base64');
          });
        } else {
          // Test first 10 chars of each block
          for (let i = block.start; i < Math.min(block.start + 10, block.end); i++) {
            const char = String.fromCharCode(i);
            const encoded = metadataEncode(char);
            const decoded = metadataDecode(encoded.encoded);
            expect(decoded).toBe(char);
          }
        }
      });
    });
  });

  describe('Edge Cases and Corner Cases', () => {
    test('should handle empty and whitespace strings', () => {
      const cases = ['', ' ', '  ', '\t', '\n', '\r\n', ' \t\n '];
      
      cases.forEach(str => {
        const encoded = metadataEncode(str);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(str);
      });
    });

    test('should handle very long strings', () => {
      const lengths = [100, 500, 1000, 2000];
      
      lengths.forEach(len => {
        // Pure ASCII
        const asciiStr = 'a'.repeat(len);
        const asciiEncoded = metadataEncode(asciiStr);
        expect(metadataDecode(asciiEncoded.encoded)).toBe(asciiStr);
        expect(asciiEncoded.encoding).toBe('none');
        
        // With accents
        const accentStr = 'àáâãäå'.repeat(Math.floor(len / 6));
        const accentEncoded = metadataEncode(accentStr);
        expect(metadataDecode(accentEncoded.encoded)).toBe(accentStr);
        
        // With emoji
        const emojiStr = '🚀'.repeat(Math.floor(len / 4));
        const emojiEncoded = metadataEncode(emojiStr);
        expect(metadataDecode(emojiEncoded.encoded)).toBe(emojiStr);
        expect(emojiEncoded.encoding).toBe('base64');
      });
    });

    test('should handle strings that look like encoded data', () => {
      const suspiciousStrings = [
        'SGVsbG8gV29ybGQ=', // Valid base64
        'SGVsbG8gV29ybGQ', // Looks like base64 but no padding
        'prefix:Hello World', // Looks like URL encoding but isn't
        'data:SGVsbG8=', // Looks like base64 but isn't
        '%20%20%20', // URL encoded spaces
        '%%%', // Invalid URL encoding
        '====', // Just padding
        'nil', // Special value but not 'null'
        'undef', // Special value but not 'undefined'
        'true', 'false', // Booleans
        '{}', '[]', // JSON-like
        '{"key":"value"}', // JSON
        '<xml>test</xml>', // XML
        'user@example.com', // Email
        'https://example.com', // URL
        '/path/to/file.txt', // File path
        'C:\\Windows\\System32', // Windows path
        '192.168.1.1', // IP address
        '2024-01-15T10:30:00Z' // ISO date
      ];

      suspiciousStrings.forEach(str => {
        const encoded = metadataEncode(str);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(str);
        
        // Test double encoding/decoding - should handle already encoded strings
        const doubleEncoded = metadataEncode(encoded.encoded);
        const doubleDecoded = metadataDecode(doubleEncoded.encoded);
        // Double decode should get back to original
        expect(doubleDecoded).toBe(encoded.encoded);
      });
    });

    test('should handle mixed direction text (RTL/LTR)', () => {
      const mixedTexts = [
        'Hello עברית World', // English + Hebrew
        'مرحبا World السلام', // Arabic + English
        'Text עם mixed כיוון', // Mixed directions
        '‏RTL marker test', // RTL marker
        '‎LTR marker test', // LTR marker
      ];

      mixedTexts.forEach(text => {
        const encoded = metadataEncode(text);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(text);
      });
    });

    test('should handle special number formats', () => {
      const numbers = [
        '0', '1', '-1', '0.0', '1.23', '-45.67',
        '1e10', '1E10', '1e-10', '1E-10',
        'Infinity', '-Infinity', 'NaN',
        '0x1234', '0o777', '0b1010',
        '1,234,567.89', '1.234.567,89', // Different locales
        '١٢٣٤٥', // Arabic numerals
        '一二三四五', // Chinese numerals
      ];

      numbers.forEach(num => {
        const encoded = metadataEncode(num);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(num);
      });
    });

    test('should handle null and undefined specially', () => {
      expect(metadataEncode(null).encoded).toBe('null');
      expect(metadataEncode(undefined).encoded).toBe('undefined');
      expect(metadataDecode('null')).toBe(null);
      expect(metadataDecode('undefined')).toBe(undefined);
      
      // But strings 'null' and 'undefined' should work
      const nullStr = 'null value here';
      const undefinedStr = 'undefined behavior';
      expect(metadataDecode(metadataEncode(nullStr).encoded)).toBe(nullStr);
      expect(metadataDecode(metadataEncode(undefinedStr).encoded)).toBe(undefinedStr);
    });
  });

  describe('Combinations and Sequences', () => {
    test('should handle all combinations of character types', () => {
      const combinations = [
        'abc123', // ASCII letters + numbers
        'abc-123_456', // ASCII with symbols
        'José123', // Latin + numbers
        'test@ção.com', // Mixed with special chars
        'Price: $99.99', // Currency
        'Score: 98%', // Percentage
        'Temp: 25°C', // Degree symbol
        '©2024™', // Copyright/trademark
        'a²+b²=c²', // Superscript
        'H₂O', // Subscript
        '🚀→🌟', // Emoji with arrow
        'Hello\nWorld', // With newline
        'Tab\there', // With tab
        'Quote"Test"', // With quotes
        "Single'Quote'", // With single quotes
        'Back\\slash', // Backslash
        'Null\0Byte', // Null byte
      ];

      combinations.forEach(str => {
        const encoded = metadataEncode(str);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(str);
      });
    });

    test('should handle repeated encoding patterns', () => {
      // Test strings with repeated patterns that might confuse the decoder
      const patterns = [
        '%%%%%%%%%%', // Repeated URL encode char
        '=========', // Repeated base64 padding
        'prefix_' + 'test'.repeat(100), // Long content
        'data_' + 'test'.repeat(100), // Long content
      ];

      patterns.forEach(pattern => {
        const encoded = metadataEncode(pattern);
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(pattern);
      });
    });
  });

  describe('Database Integration Tests', () => {
    test('should preserve all test cases through database storage', async () => {
      const testCases = [
        { id: 'ascii', data: 'Simple ASCII text' },
        { id: 'latin', data: 'José María ação' },
        { id: 'emoji', data: '🚀🌟😊' },
        { id: 'chinese', data: '中文测试' },
        { id: 'arabic', data: 'مرحبا بالعالم' },
        { id: 'mixed', data: 'Test: José 中文 🚀' },
        { id: 'null-str', data: 'null value' },  // Avoid literal 'null'
        { id: 'long', data: 'a'.repeat(500) + 'ção' + '🚀'.repeat(10) },
        { id: 'special', data: '\n\t\r\0' },
        { id: 'base64-like', data: 'SGVsbG8=' },
      ];

      // Insert all test cases
      for (const testCase of testCases) {
        await resource.insert(testCase);
      }

      // Retrieve and verify all test cases
      for (const testCase of testCases) {
        const retrieved = await resource.get(testCase.id);
        expect(retrieved.data).toBe(testCase.data);
      }
    });

    test('should handle concurrent operations', async () => {
      const promises = [];
      
      // Create 50 concurrent operations with different character types
      for (let i = 0; i < 50; i++) {
        const data = {
          id: `concurrent-${i}`,
          data: i % 3 === 0 ? `José-${i}` : 
                i % 3 === 1 ? `🚀-${i}` : 
                `test-${i}`
        };
        promises.push(resource.insert(data));
      }

      await Promise.all(promises);

      // Verify all were saved correctly
      for (let i = 0; i < 50; i++) {
        const retrieved = await resource.get(`concurrent-${i}`);
        const expected = i % 3 === 0 ? `José-${i}` : 
                        i % 3 === 1 ? `🚀-${i}` : 
                        `test-${i}`;
        expect(retrieved.data).toBe(expected);
      }
    }, 60000);  // Increase timeout further for concurrent test
  });

  describe('Encoding Choice Validation', () => {
    test('should choose optimal encoding for different content ratios', () => {
      const tests = [
        { 
          str: 'hello', 
          expectedEncoding: 'none',
          reason: 'Pure ASCII should not be encoded'
        },
        { 
          str: 'a'.repeat(100), 
          expectedEncoding: 'none',
          reason: 'Long ASCII should not be encoded'
        },
        { 
          str: 'José', 
          expectedEncoding: 'url',
          reason: 'Single accent should use URL encoding'
        },
        { 
          str: 'ççççç', 
          expectedEncoding: 'base64',
          reason: 'High density of special chars should use base64'
        },
        { 
          str: '🚀', 
          expectedEncoding: 'base64',
          reason: 'Emoji should use base64'
        },
        { 
          str: '中文字符', 
          expectedEncoding: 'base64',
          reason: 'CJK should use base64'
        },
        { 
          str: 'test\ntest', 
          expectedEncoding: 'url',  // Control chars can be URL encoded
          reason: 'Control characters should be encoded'
        }
      ];

      tests.forEach(({ str, expectedEncoding, reason }) => {
        const result = metadataEncode(str);
        expect(result.encoding).toBe(expectedEncoding);
        // Verify it decodes correctly
        expect(metadataDecode(result.encoded)).toBe(str);
      });
    });
  });

  // v13: Backwards compatibility removed - legacy base64 without prefix no longer supported
  // describe('Backwards Compatibility', () => {
  //   test('should decode legacy base64 without prefix', () => {
  //     // These are base64 encoded strings without our prefix
  //     const legacyEncoded = [
  //       { encoded: 'Sm9zw6k=', decoded: 'Jose' },
  //       { encoded: 'YcOnw6Nv', decoded: 'acao' },  // Corrected base64
  //       { encoded: '8J+agA==', decoded: '🚀' },
  //       { encoded: '5Lit5paH', decoded: '中文' },
  //     ];
  //
  //     legacyEncoded.forEach(({ encoded, decoded }) => {
  //       const result = metadataDecode(encoded);
  //       expect(result).toBe(decoded);
  //     });
  //   });
  //
  //   test('should not misinterpret regular strings as base64', () => {
  //     const notBase64 = [
  //       'TEST',
  //       'user123',
  //       'AbCdEf',
  //       'hello',
  //       '12345',
  //     ];
  //
  //     notBase64.forEach(str => {
  //       const result = metadataDecode(str);
  //       expect(result).toBe(str); // Should return as-is
  //     });
  //   });
  // });
});
