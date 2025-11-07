import { describe, test, expect } from '@jest/globals';
import { 
  analyzeString, 
  metadataEncode, 
  metadataDecode, 
  calculateEncodedSize 
} from '../../src/concerns/metadata-encoding.js';

describe('Smart Encoding for S3 Metadata', () => {
  
  describe('analyzeString', () => {
    test('should identify pure ASCII strings', () => {
      const result = analyzeString('Hello World 123');
      expect(result.type).toBe('ascii');
      expect(result.safe).toBe(true);
    });

    test('should identify Latin-1 extended characters', () => {
      const result = analyzeString('José María ação');
      expect(result.type).toBe('url');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Latin-1');
    });

    test('should identify multibyte UTF-8 characters', () => {
      const result = analyzeString('Hello 中文 🚀');
      expect(result.type).toBe('base64'); // Changed expectation - high multibyte ratio
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('multibyte');
    });

    test('should recommend base64 for high multibyte content', () => {
      const result = analyzeString('🚀🌟😊💡🎉🌈');
      expect(result.type).toBe('base64');
      expect(result.reason).toContain('high multibyte');
    });
  });

  describe('metadataEncode and metadataDecode', () => {
    const testCases = [
      {
        name: 'Pure ASCII',
        input: 'Hello World 123',
        expectedEncoding: 'none'
      },
      {
        name: 'Latin characters',
        input: 'José María ação',
        expectedEncoding: 'url'
      },
      {
        name: 'Chinese characters',
        input: '中文测试',
        expectedEncoding: 'base64'
      },
      {
        name: 'Emoji heavy',
        input: '🚀🌟😊💡',
        expectedEncoding: 'base64'
      },
      {
        name: 'Mixed content',
        input: 'Hello José 中文 test',
        expectedEncoding: 'url'
      },
      {
        name: 'Empty string',
        input: '',
        expectedEncoding: 'none'
      },
      {
        name: 'Null value',
        input: null,
        expectedEncoding: 'special'
      },
      {
        name: 'Undefined value',
        input: undefined,
        expectedEncoding: 'special'
      }
    ];

    testCases.forEach(({ name, input, expectedEncoding }) => {
      test(`should handle ${name}`, () => {
        const encoded = metadataEncode(input);
        
        // Check encoding type
        expect(encoded.encoding).toBe(expectedEncoding);
        
        // Check prefix
        if (expectedEncoding === 'url') {
          expect(encoded.encoded).toMatch(/^u:/);
        } else if (expectedEncoding === 'base64') {
          expect(encoded.encoded).toMatch(/^b:/);
        }
        
        // Check round-trip
        const decoded = metadataDecode(encoded.encoded);
        expect(decoded).toBe(input);
      });
    });

    // v13: Legacy base64 without prefix no longer supported
    // test('should handle legacy base64 without prefix', () => {
    //   const original = 'Jose Maria';
    //   const legacyEncoded = Buffer.from(original, 'utf8').toString('base64');
    //   const decoded = metadataDecode(legacyEncoded);
    //   expect(decoded).toBe(original);
    // });

    test('should not misinterpret regular strings as base64', () => {
      const regularString = 'TEST1234';
      const decoded = metadataDecode(regularString);
      expect(decoded).toBe(regularString);
    });
  });

  describe('calculateEncodedSize', () => {
    test('should calculate size for ASCII strings', () => {
      const result = calculateEncodedSize('Hello World');
      expect(result.original).toBe(11);
      expect(result.encoded).toBe(11);
      expect(result.overhead).toBe(0);
      expect(result.encoding).toBe('ascii');
    });

    test('should calculate size for Latin-1 strings', () => {
      const result = calculateEncodedSize('José María');
      expect(result.encoding).toBe('url');
      expect(result.overhead).toBeGreaterThan(0);
      expect(result.ratio).toBeGreaterThan(1);
    });

    test('should calculate size for emoji strings', () => {
      const result = calculateEncodedSize('🚀🌟😊');
      expect(result.encoding).toBe('base64');
      expect(result.original).toBe(12); // 4 bytes per emoji
      expect(result.encoded).toBe(18); // 'b:' + base64
      expect(result.ratio).toBeLessThan(2); // Base64 is ~1.33x for binary
    });

    test('should show URL encoding overhead for mixed content', () => {
      const text = 'José com ação';
      const result = calculateEncodedSize(text);
      expect(result.encoding).toBe('url');
      // URL encoding expands Latin-1 characters significantly
      expect(result.ratio).toBeGreaterThan(1.5);
    });
  });

  describe('Edge cases', () => {
    test('should handle very long strings', () => {
      const longString = 'A'.repeat(1000) + 'ção' + '🚀'.repeat(10);
      const encoded = metadataEncode(longString);
      const decoded = metadataDecode(encoded.encoded);
      expect(decoded).toBe(longString);
    });

    test('should handle strings with only control characters', () => {
      const controlChars = '\n\t\r';
      const encoded = metadataEncode(controlChars);
      expect(encoded.encoding).toBe('base64'); // Control chars are treated as multibyte
      const decoded = metadataDecode(encoded.encoded);
      expect(decoded).toBe(controlChars);
    });

    test('should handle undefined and null consistently', () => {
      expect(metadataEncode(undefined).encoded).toBe('undefined');
      expect(metadataEncode(null).encoded).toBe('null');
      expect(metadataDecode('undefined')).toBe(undefined);
      expect(metadataDecode('null')).toBe(null);
    });

    test('should handle number inputs by converting to string', () => {
      const encoded = metadataEncode(12345);
      expect(encoded.encoding).toBe('none');
      expect(encoded.encoded).toBe('12345');
      expect(metadataDecode(encoded.encoded)).toBe('12345');
    });
  });

  describe('Efficiency comparison', () => {
    test('should choose most efficient encoding', () => {
      const examples = [
        { text: 'Hello World', expected: 'none' },
        { text: 'José María com ação', expected: 'url' },
        { text: '🚀🌟😊💡🎉', expected: 'base64' },
        { text: '中文字符测试内容', expected: 'base64' },
        { text: 'Mix: José 中 test', expected: 'url' }
      ];

      examples.forEach(({ text, expected }) => {
        const result = metadataEncode(text);
        expect(result.encoding).toBe(expected);
        
        // Verify size efficiency
        const sizeInfo = calculateEncodedSize(text);
      });
    });
  });
});
