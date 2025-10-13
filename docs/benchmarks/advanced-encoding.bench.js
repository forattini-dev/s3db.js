#!/usr/bin/env node

/**
 * Performance Benchmark for Advanced Metadata Encoding
 * Compares different encoding strategies and measures compression efficiency
 */

import { calculateUTF8Bytes } from '../../src/concerns/calculator.js';
import {
  advancedEncode,
  advancedDecode
} from '../../src/concerns/advanced-metadata-encoding.js';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m'
};

console.log(`\n${colors.blue}🚀 S3DB.js Advanced Metadata Encoding Benchmark${colors.reset}\n`);

// Test data samples
const testData = {
  timestamps: {
    iso: '2025-01-15T10:30:45.123Z',
    iso2: '2024-12-25T15:45:30.000Z',
    iso3: '2025-10-10T08:15:22.456Z'
  },
  uuids: {
    uuid1: '550e8400-e29b-41d4-a716-446655440000',
    uuid2: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    uuid3: '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
  },
  dictionary: {
    status1: 'active',
    status2: 'inactive',
    status3: 'pending',
    bool1: 'true',
    bool2: 'false',
    method1: 'GET',
    method2: 'POST'
  },
  hex: {
    hash1: 'a1b2c3d4e5f6',
    hash2: '0123456789abcdef',
    hash3: 'fedcba9876543210'
  },
  numbers: {
    small: 42,
    medium: 12345678,
    large: 999999999999
  },
  mixed: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    createdAt: '2025-01-15T10:30:45.123Z',
    status: 'active',
    count: 12345,
    hash: 'a1b2c3d4e5f6',
    enabled: 'true'
  }
};

function benchmark(name, data) {
  console.log(`${colors.yellow}📊 ${name}${colors.reset}`);

  let totalOriginal = 0;
  let totalEncoded = 0;
  let totalDecoded = 0;

  for (const [key, value] of Object.entries(data)) {
    const originalSize = calculateUTF8Bytes(typeof value === 'string' ? value : String(value));
    const encoded = advancedEncode(value);
    const encodedSize = calculateUTF8Bytes(encoded);
    const decoded = advancedDecode(encoded);

    totalOriginal += originalSize;
    totalEncoded += encodedSize;

    const savings = ((originalSize - encodedSize) / originalSize * 100).toFixed(1);
    const savingsColor = savings > 0 ? colors.green : colors.red;

    console.log(`  ${key.padEnd(20)} ${originalSize}B → ${encodedSize}B ${savingsColor}(${savings > 0 ? '+' : ''}${savings}%)${colors.reset}`);
  }

  const totalSavings = ((totalOriginal - totalEncoded) / totalOriginal * 100).toFixed(1);
  console.log(`  ${'Total'.padEnd(20)} ${totalOriginal}B → ${totalEncoded}B ${colors.green}(${totalSavings}% savings)${colors.reset}\n`);

  return { originalSize: totalOriginal, encodedSize: totalEncoded, savings: totalSavings };
}

// Run benchmarks
const results = {};

results.timestamps = benchmark('ISO Timestamps', testData.timestamps);
results.uuids = benchmark('UUIDs', testData.uuids);
results.dictionary = benchmark('Dictionary Values', testData.dictionary);
results.hex = benchmark('Hex Strings', testData.hex);
results.numbers = benchmark('Numbers', testData.numbers);
results.mixed = benchmark('Mixed Data', testData.mixed);

// Overall summary
console.log(`${colors.blue}📈 Overall Results${colors.reset}`);
console.log('─'.repeat(50));

let grandTotalOriginal = 0;
let grandTotalEncoded = 0;

for (const [category, result] of Object.entries(results)) {
  grandTotalOriginal += result.originalSize;
  grandTotalEncoded += result.encodedSize;
  console.log(`  ${category.padEnd(20)} ${result.savings}% savings`);
}

const grandTotalSavings = ((grandTotalOriginal - grandTotalEncoded) / grandTotalOriginal * 100).toFixed(1);

console.log('─'.repeat(50));
console.log(`  ${colors.green}Grand Total          ${grandTotalOriginal}B → ${grandTotalEncoded}B (${grandTotalSavings}% savings)${colors.reset}\n`);

// Performance test
console.log(`${colors.blue}⚡ Performance Test${colors.reset}`);

const iterations = 10000;
const testValue = '2025-01-15T10:30:45.123Z';

const encodeStart = performance.now();
for (let i = 0; i < iterations; i++) {
  advancedEncode(testValue);
}
const encodeTime = performance.now() - encodeStart;

const decodeStart = performance.now();
const encoded = advancedEncode(testValue);
for (let i = 0; i < iterations; i++) {
  advancedDecode(encoded);
}
const decodeTime = performance.now() - decodeStart;

console.log(`  Encode: ${(encodeTime / iterations).toFixed(3)}ms per operation (${iterations} ops)`);
console.log(`  Decode: ${(decodeTime / iterations).toFixed(3)}ms per operation (${iterations} ops)`);
console.log(`  Total:  ${(encodeTime + decodeTime).toFixed(2)}ms for ${iterations * 2} operations\n`);

// Export results to JSON
try {
  const fs = await import('fs');
  const exportResults = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    benchmark: 'advanced-encoding',
    categories: {},
    performance: {
      iterations,
      testValue,
      encodeTimeMs: encodeTime,
      decodeTimeMs: decodeTime,
      totalTimeMs: encodeTime + decodeTime,
      avgEncodeMsPerOp: encodeTime / iterations,
      avgDecodeMsPerOp: decodeTime / iterations
    },
    overall: {
      grandTotalOriginal,
      grandTotalEncoded,
      grandTotalSavingsPercent: grandTotalSavings
    }
  };

  // Add category results
  for (const [category, result] of Object.entries(results)) {
    exportResults.categories[category] = {
      originalSize: result.originalSize,
      encodedSize: result.encodedSize,
      savingsPercent: result.savings
    };
  }

  fs.writeFileSync('docs/benchmarks/advanced-encoding_results.json', JSON.stringify(exportResults, null, 2));
  console.log(`${colors.blue}💾 Results exported to docs/benchmarks/advanced-encoding_results.json${colors.reset}\n`);
} catch (error) {
  console.error(`${colors.red}⚠️  Failed to export JSON: ${error.message}${colors.reset}\n`);
}

console.log(`${colors.green}✅ Benchmark complete!${colors.reset}\n`);
