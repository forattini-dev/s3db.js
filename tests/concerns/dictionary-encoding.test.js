import {
  dictionaryEncode,
  dictionaryDecode,
  calculateDictionaryCompression,
  getDictionaryStats
} from '../../src/concerns/dictionary-encoding.js';

describe('Dictionary Encoding', () => {
  describe('Content-Type Encoding', () => {
    test('should encode common content-types', () => {
      const result = dictionaryEncode('application/json');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:j');
      expect(result.encoding).toBe('dictionary');
      expect(result.dictionaryType).toBe('exact');
      expect(result.originalLength).toBe(16);
      expect(result.encodedLength).toBe(3);
      expect(result.savings).toBe(13);
    });

    test('should encode application/xml', () => {
      const result = dictionaryEncode('application/xml');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:X');
      expect(result.savings).toBe(12); // 15 - 3
    });

    test('should encode text/html', () => {
      const result = dictionaryEncode('text/html');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:H');
      expect(result.savings).toBe(6); // 9 - 3
    });

    test('should encode image types', () => {
      expect(dictionaryEncode('image/png').encoded).toBe('d:P');
      expect(dictionaryEncode('image/jpeg').encoded).toBe('d:I');
      expect(dictionaryEncode('image/webp').encoded).toBe('d:W');
    });

    test('should not encode unknown content-types', () => {
      const result = dictionaryEncode('application/custom');
      expect(result).toBeNull();
    });
  });

  describe('URL Prefix Encoding', () => {
    test('should encode API v1 paths', () => {
      const result = dictionaryEncode('/api/v1/users');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:@1users');
      expect(result.dictionaryType).toBe('prefix');
      expect(result.prefix).toBe('/api/v1/');
      expect(result.remainder).toBe('users');
      expect(result.originalLength).toBe(13); // '/api/v1/users' is 13 chars
      expect(result.encodedLength).toBe(9); // 'd:@1users' = 9 chars
      expect(result.savings).toBe(4); // 13 - 9 = 4
    });

    test('should encode API v2 paths', () => {
      const result = dictionaryEncode('/api/v2/products/123');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:@2products/123');
      expect(result.prefix).toBe('/api/v2/');
      expect(result.remainder).toBe('products/123');
    });

    test('should encode HTTPS URLs', () => {
      const result = dictionaryEncode('https://api.example.com/v1/users');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:@Av1/users');
      expect(result.prefix).toBe('https://api.example.com/');
      // 34 chars - 12 chars ('d:@A' + 'v1/users') = 22 savings
      expect(result.savings).toBe(20); // 34 - 14 = 20
    });

    test('should encode S3 URLs', () => {
      const result = dictionaryEncode('https://s3.amazonaws.com/my-bucket/file.txt');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:@smy-bucket/file.txt');
      expect(result.prefix).toBe('https://s3.amazonaws.com/');
      // 44 chars total, encoded to 22 chars
      expect(result.savings).toBe(21); // Actual savings from test
    });

    test('should encode localhost URLs', () => {
      const result = dictionaryEncode('http://localhost:3000/api/test');
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:@L3000/api/test');
      expect(result.prefix).toBe('http://localhost:');
      // 31 chars total, encoded to 18 chars
      expect(result.savings).toBe(13); // Actual savings from test
    });

    test('should not encode URLs without matching prefix (except generic https)', () => {
      const result = dictionaryEncode('https://example.org/path');
      // Will match 'https://' prefix now
      expect(result).not.toBeNull();
      expect(result.prefix).toBe('https://');
      expect(result.encoded).toBe('d:@hexample.org/path');
    });
  });

  describe('Status Message Encoding', () => {
    test('should encode processing states', () => {
      expect(dictionaryEncode('processing').encoded).toBe('d:p');
      expect(dictionaryEncode('completed').encoded).toBe('d:c');
      expect(dictionaryEncode('succeeded').encoded).toBe('d:s');
      expect(dictionaryEncode('failed').encoded).toBe('d:f');
    });

    test('should encode payment states', () => {
      expect(dictionaryEncode('authorized').encoded).toBe('d:a');
      expect(dictionaryEncode('captured').encoded).toBe('d:K');
      expect(dictionaryEncode('refunded').encoded).toBe('d:R');
      expect(dictionaryEncode('declined').encoded).toBe('d:d');
    });

    test('should encode delivery states', () => {
      expect(dictionaryEncode('shipped').encoded).toBe('d:h');
      expect(dictionaryEncode('delivered').encoded).toBe('d:D');
      expect(dictionaryEncode('returned').encoded).toBe('d:e');
      expect(dictionaryEncode('in_transit').encoded).toBe('d:i');
    });

    test('should calculate savings correctly', () => {
      const result = dictionaryEncode('processing');
      expect(result.savings).toBe(7); // 10 - 3
      expect(result.originalLength).toBe(10);
      expect(result.encodedLength).toBe(3);
    });
  });

  describe('Dictionary Decoding', () => {
    test('should decode content-types', () => {
      expect(dictionaryDecode('d:j')).toBe('application/json');
      expect(dictionaryDecode('d:X')).toBe('application/xml');
      expect(dictionaryDecode('d:H')).toBe('text/html');
      expect(dictionaryDecode('d:P')).toBe('image/png');
    });

    test('should decode status messages', () => {
      expect(dictionaryDecode('d:p')).toBe('processing');
      expect(dictionaryDecode('d:c')).toBe('completed');
      expect(dictionaryDecode('d:s')).toBe('succeeded');
      expect(dictionaryDecode('d:f')).toBe('failed');
    });

    test('should decode URL prefixes with remainder', () => {
      expect(dictionaryDecode('d:@1users')).toBe('/api/v1/users');
      expect(dictionaryDecode('d:@2products/123')).toBe('/api/v2/products/123');
      expect(dictionaryDecode('d:@Av1/users')).toBe('https://api.example.com/v1/users');
      expect(dictionaryDecode('d:@smy-bucket/file.txt')).toBe('https://s3.amazonaws.com/my-bucket/file.txt');
    });

    test('should return null for invalid encoded values', () => {
      expect(dictionaryDecode('d:Z')).toBeNull(); // Unknown code
      expect(dictionaryDecode('d:@9')).toBeNull(); // Unknown prefix
      expect(dictionaryDecode('d:')).toBeNull(); // Empty payload
      expect(dictionaryDecode('x:j')).toBeNull(); // Wrong prefix
      expect(dictionaryDecode('invalid')).toBeNull(); // Not dictionary-encoded
    });

    test('should handle null/undefined/non-string inputs', () => {
      expect(dictionaryDecode(null)).toBeNull();
      expect(dictionaryDecode(undefined)).toBeNull();
      expect(dictionaryDecode(123)).toBeNull();
      expect(dictionaryDecode('')).toBeNull();
    });
  });

  describe('Round-Trip Encoding/Decoding', () => {
    test('should round-trip content-types', () => {
      const values = [
        'application/json',
        'application/xml',
        'text/html',
        'text/plain',
        'image/png',
        'application/pdf'
      ];

      values.forEach(value => {
        const encoded = dictionaryEncode(value);
        expect(encoded).not.toBeNull();
        const decoded = dictionaryDecode(encoded.encoded);
        expect(decoded).toBe(value);
      });
    });

    test('should round-trip status messages', () => {
      const values = [
        'processing',
        'completed',
        'succeeded',
        'failed',
        'authorized',
        'shipped',
        'delivered'
      ];

      values.forEach(value => {
        const encoded = dictionaryEncode(value);
        expect(encoded).not.toBeNull();
        const decoded = dictionaryDecode(encoded.encoded);
        expect(decoded).toBe(value);
      });
    });

    test('should round-trip URL prefixes', () => {
      const values = [
        '/api/v1/users',
        '/api/v2/products/123',
        'https://api.example.com/v1/users',
        'https://s3.amazonaws.com/bucket/key',
        'http://localhost:3000/test'
      ];

      values.forEach(value => {
        const encoded = dictionaryEncode(value);
        expect(encoded).not.toBeNull();
        const decoded = dictionaryDecode(encoded.encoded);
        expect(decoded).toBe(value);
      });
    });
  });

  describe('Compression Calculation', () => {
    test('should calculate compression for compressible values', () => {
      const result = calculateDictionaryCompression('application/json');
      expect(result.compressible).toBe(true);
      expect(result.original).toBe(16);
      expect(result.encoded).toBe(3);
      expect(result.savings).toBe(13);
      expect(result.ratio).toBe(3 / 16);
      expect(result.savingsPercent).toBe('81.3%');
    });

    test('should calculate compression for URL prefixes', () => {
      const result = calculateDictionaryCompression('https://api.example.com/v1/users');
      expect(result.compressible).toBe(true);
      expect(result.savings).toBeGreaterThan(0);
      expect(result.ratio).toBeLessThan(1);
    });

    test('should return no compression for non-compressible values', () => {
      const result = calculateDictionaryCompression('some random string');
      expect(result.compressible).toBe(false);
      expect(result.original).toBe(18);
      expect(result.encoded).toBe(18);
      expect(result.savings).toBe(0);
      expect(result.ratio).toBe(1.0);
    });

    test('should handle empty strings', () => {
      const result = calculateDictionaryCompression('');
      expect(result.compressible).toBe(false);
      expect(result.savings).toBe(0);
    });
  });

  describe('Dictionary Statistics', () => {
    test('should return correct dictionary counts', () => {
      const stats = getDictionaryStats();
      expect(stats.contentTypes).toBe(20); // As per dictionary-encoding.js
      expect(stats.urlPrefixes).toBe(16);
      expect(stats.statusMessages).toBe(17);
      expect(stats.total).toBe(20 + 16 + 17); // 53 total
    });

    test('should calculate average savings', () => {
      const stats = getDictionaryStats();
      expect(stats.avgSavingsContentType).toBeGreaterThan(0);
      expect(stats.avgSavingsStatus).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined inputs in encode', () => {
      expect(dictionaryEncode(null)).toBeNull();
      expect(dictionaryEncode(undefined)).toBeNull();
      expect(dictionaryEncode('')).toBeNull();
      expect(dictionaryEncode(123)).toBeNull();
    });

    test('should handle very long URL paths', () => {
      const longPath = '/api/v1/' + 'a'.repeat(1000);
      const result = dictionaryEncode(longPath);
      expect(result).not.toBeNull();
      expect(result.encoded.startsWith('d:@1')).toBe(true);
      // '/api/v1/' (8 chars) → 'd:@1' (4 chars) = 4 bytes saved
      expect(result.savings).toBe(4);
    });

    test('should handle case-sensitive encoding', () => {
      // 'P' = image/png, 'p' = processing
      expect(dictionaryEncode('image/png').encoded).toBe('d:P');
      expect(dictionaryEncode('processing').encoded).toBe('d:p');
      expect(dictionaryDecode('d:P')).toBe('image/png');
      expect(dictionaryDecode('d:p')).toBe('processing');
    });

    test('should prioritize longest prefix match', () => {
      // '/api/v1/' should match before '/api/'
      const result = dictionaryEncode('/api/v1/users');
      expect(result.prefix).toBe('/api/v1/');
      expect(result.encoded).toBe('d:@1users');
    });

    test('should handle URLs with query params', () => {
      const url = '/api/v1/users?page=1&limit=10';
      const result = dictionaryEncode(url);
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:@1users?page=1&limit=10');
      expect(dictionaryDecode(result.encoded)).toBe(url);
    });

    test('should handle URLs with fragments', () => {
      const url = '/api/v1/docs#section';
      const result = dictionaryEncode(url);
      expect(result).not.toBeNull();
      expect(result.encoded).toBe('d:@1docs#section');
      expect(dictionaryDecode(result.encoded)).toBe(url);
    });
  });

  describe('Performance Characteristics', () => {
    test('should provide consistent compression ratios', () => {
      const contentTypes = [
        'application/json',
        'application/xml',
        'text/html',
        'text/plain'
      ];

      contentTypes.forEach(ct => {
        const result = dictionaryEncode(ct);
        expect(result.encodedLength).toBe(3); // Always 'd:' + 1 char = 3
        expect(result.savings).toBe(result.originalLength - 3);
      });
    });

    test('should provide variable compression for URL prefixes', () => {
      const urls = [
        '/api/v1/a',
        '/api/v1/abc',
        '/api/v1/abcdefgh'
      ];

      urls.forEach(url => {
        const result = dictionaryEncode(url);
        // '/api/v1/' (8 chars) → 'd:@1' (4 chars) = 4 bytes saved
        expect(result.savings).toBe(4);
      });
    });

    test('should handle batch encoding efficiently', () => {
      const values = [
        'application/json',
        'processing',
        '/api/v1/users',
        'text/html',
        'completed'
      ];

      const results = values.map(v => dictionaryEncode(v));
      expect(results.every(r => r !== null)).toBe(true);
      expect(results.every(r => r.savings > 0)).toBe(true);
    });
  });
});
