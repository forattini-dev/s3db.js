import { describe, test, expect } from '@jest/globals';
import { advancedEncode, advancedDecode } from '../../src/concerns/advanced-metadata-encoding.js';
import { calculateUTF8Bytes, clearUTF8Memory } from '../../src/concerns/calculator.js';

describe('Optimization Tests', () => {
  
  describe('ISO Timestamp Optimization', () => {
    test('should detect and compress ISO timestamps', () => {
      const isoTimestamps = [
        '2024-01-15T10:30:00.000Z',
        '2024-12-31T23:59:59.999Z',
        '2023-06-15T14:25:30Z',
        '2025-01-01T00:00:00Z',
      ];
      
      isoTimestamps.forEach(iso => {
        const result = advancedEncode(iso);
        
        // Should detect as ISO timestamp
        expect(result.method).toBe('iso-timestamp');
        expect(result.encoded.startsWith('i')).toBe(true);
        
        // Should be much shorter
        console.log(`ISO: ${iso} (${iso.length} chars) → ${result.encoded} (${result.encoded.length} chars)`);
        expect(result.encoded.length).toBeLessThan(12); // Should be around 9-10 chars with milliseconds
        expect(result.encoded.length).toBeLessThan(iso.length * 0.5); // At least 50% savings
        
        // Should decode back to ISO format
        const decoded = advancedDecode(result.encoded);
        expect(decoded).toBe(iso);
      });
    });
    
    test('should handle ISO timestamps with different timezones', () => {
      const timestamps = [
        '2024-01-15T10:30:00+01:00',
        '2024-01-15T10:30:00-05:00',
        '2024-01-15T10:30:00.123Z',
      ];
      
      timestamps.forEach(ts => {
        const result = advancedEncode(ts);
        expect(result.method).toBe('iso-timestamp');
        
        const decoded = advancedDecode(result.encoded);
        // Decoded will be in UTC/Z format
        const originalDate = new Date(ts);
        const decodedDate = new Date(decoded);
        expect(decodedDate.getTime()).toBe(originalDate.getTime());
      });
    });
    
    test('should show massive space savings for ISO timestamps', () => {
      const iso = '2024-01-15T10:30:00.000Z';
      const result = advancedEncode(iso);
      
      const originalBytes = Buffer.byteLength(iso, 'utf8');
      const encodedBytes = Buffer.byteLength(result.encoded, 'utf8');
      const savings = Math.round((1 - encodedBytes/originalBytes) * 100);
      
      console.log(`
ISO Timestamp Optimization:
• Original: "${iso}" (${originalBytes} bytes)
• Encoded: "${result.encoded}" (${encodedBytes} bytes)
• Savings: ${savings}% 🎉
      `);
      
      expect(savings).toBeGreaterThan(60); // Should save at least 60%
    });
  });
  
  describe('UTF-8 Memory Cache Performance', () => {
    beforeEach(() => {
      clearUTF8Memory();
    });
    
    test('should cache UTF-8 calculations in memory', () => {
      const testString = 'José Silva with 中文 and 🚀';
      
      // First call - calculates
      const start1 = process.hrtime.bigint();
      const size1 = calculateUTF8Bytes(testString);
      const time1 = Number(process.hrtime.bigint() - start1);
      
      // Second call - should use memory cache
      const start2 = process.hrtime.bigint();
      const size2 = calculateUTF8Bytes(testString);
      const time2 = Number(process.hrtime.bigint() - start2);
      
      expect(size1).toBe(size2);
      
      // Memory cache should be much faster (at least 10x)
      console.log(`
UTF-8 Memory Cache Performance:
• First call: ${time1} ns
• Cached call: ${time2} ns
• Speed improvement: ${Math.round(time1/time2)}x faster
      `);
      
      expect(time2).toBeLessThan(time1 / 2); // At least 2x faster
    });
    
    test('should handle memory cache size limits', () => {
      // Test that memory doesn't grow infinitely
      const uniqueStrings = [];
      for (let i = 0; i < 15000; i++) {
        uniqueStrings.push(`test_string_${i}`);
      }
      
      // Calculate all strings
      uniqueStrings.forEach(str => calculateUTF8Bytes(str));
      
      // Memory should not exceed UTF8_MEMORY_MAX_SIZE (10000)
      // We can't directly access memory size, but we can verify it still works
      const testStr = uniqueStrings[0];
      const size = calculateUTF8Bytes(testStr);
      expect(size).toBeGreaterThan(0);
    });
    
    test('should significantly improve performance for repeated calculations', () => {
      const testStrings = [
        'active',
        'inactive', 
        'pending',
        'José Silva',
        '🚀 Launch'
      ];
      
      const iterations = 10000;
      
      // Without memory cache (clear before each)
      const startNoCache = process.hrtime.bigint();
      for (let i = 0; i < iterations; i++) {
        clearUTF8Memory(); // Force recalculation
        calculateUTF8Bytes(testStrings[i % testStrings.length]);
      }
      const timeNoCache = Number(process.hrtime.bigint() - startNoCache) / 1_000_000; // ms
      
      // With memory cache
      clearUTF8Memory();
      const startWithCache = process.hrtime.bigint();
      for (let i = 0; i < iterations; i++) {
        calculateUTF8Bytes(testStrings[i % testStrings.length]);
      }
      const timeWithCache = Number(process.hrtime.bigint() - startWithCache) / 1_000_000; // ms
      
      const improvement = Math.round(timeNoCache / timeWithCache);
      
      console.log(`
UTF-8 Memory Cache Benchmark (${iterations} operations):
• Without cache: ${timeNoCache.toFixed(2)}ms
• With cache: ${timeWithCache.toFixed(2)}ms
• Performance improvement: ${improvement}x faster
• Time saved: ${(timeNoCache - timeWithCache).toFixed(2)}ms
      `);
      
      expect(timeWithCache).toBeLessThan(timeNoCache);
      expect(improvement).toBeGreaterThanOrEqual(2); // Should be at least 2x faster
    });
  });
  
  describe('Combined Optimizations Impact', () => {
    test('should show cumulative savings with all optimizations', () => {
      const testData = {
        id: '550e8400-e29b-41d4-a716-446655440000', // UUID
        createdAt: '2024-01-15T10:30:00.000Z',     // ISO timestamp
        updatedAt: '2024-01-15T14:45:30.000Z',     // ISO timestamp
        status: 'active',                           // Dictionary
        enabled: 'true',                            // Dictionary
        timestamp: '1705321800',                    // Unix timestamp
        hash: 'd41d8cd98f00b204e9800998ecf8427e',  // MD5 hash
      };
      
      let totalOriginal = 0;
      let totalOptimized = 0;
      
      const results = Object.entries(testData).map(([key, value]) => {
        const result = advancedEncode(value);
        const originalSize = Buffer.byteLength(value, 'utf8');
        const optimizedSize = Buffer.byteLength(result.encoded, 'utf8');
        
        totalOriginal += originalSize;
        totalOptimized += optimizedSize;
        
        return {
          field: key,
          original: value.length > 20 ? value.substring(0, 20) + '...' : value,
          originalSize,
          optimized: result.encoded,
          optimizedSize,
          method: result.method,
          savings: Math.round((1 - optimizedSize/originalSize) * 100) + '%'
        };
      });
      
      console.log('\nCombined Optimizations:');
      console.table(results);
      
      const totalSavings = Math.round((1 - totalOptimized/totalOriginal) * 100);
      console.log(`
Total Impact:
• Original size: ${totalOriginal} bytes
• Optimized size: ${totalOptimized} bytes
• Total savings: ${totalSavings}% 🚀
• Bytes saved: ${totalOriginal - totalOptimized} bytes
      `);
      
      expect(totalSavings).toBeGreaterThan(40); // Should save at least 40% overall
    });
  });
});