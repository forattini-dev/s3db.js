#!/usr/bin/env node

import { advancedEncode, advancedDecode } from './src/concerns/advanced-metadata-encoding.js';
import { metadataEncode, metadataDecode } from './src/concerns/metadata-encoding.js';

/**
 * Comprehensive benchmark of compression methods
 */

console.log('🔬 S3DB Compression Benchmark\n');
console.log('='.repeat(80));

// Test cases with realistic data
const testCases = [
  {
    category: 'HTTP Methods',
    data: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
  },
  {
    category: 'Status Values',
    data: ['active', 'inactive', 'pending', 'completed', 'failed', 'archived']
  },
  {
    category: 'Boolean Values',
    data: ['true', 'false', 'yes', 'no', '1', '0', 'enabled', 'disabled']
  },
  {
    category: 'UUIDs',
    data: [
      '550e8400-e29b-41d4-a716-446655440000',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    ]
  },
  {
    category: 'ISO Timestamps',
    data: [
      '2024-01-15T10:30:00.000Z',
      '2023-12-31T23:59:59.999Z',
      '2024-06-15T14:22:33.123Z',
      '2025-01-01T00:00:00.000Z'
    ]
  },
  {
    category: 'Unix Timestamps',
    data: ['1705321800', '1703980799', '1718456553', '1735689600']
  },
  {
    category: 'MD5 Hashes',
    data: [
      'd41d8cd98f00b204e9800998ecf8427e',
      '5d41402abc4b2a76b9719d911017c592',
      '098f6bcd4621d373cade4e832627b4f6'
    ]
  },
  {
    category: 'SHA256 Hashes',
    data: [
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae'
    ]
  },
  {
    category: 'ASCII Text',
    data: [
      'user_session_12345',
      'http://example.com/api/v1/users',
      'simple ascii text without special chars',
      'Product Name ABC-123-XYZ'
    ]
  },
  {
    category: 'Latin-1 Text',
    data: [
      'José María García',
      'São Paulo, Brasil',
      'Café résumé naïve',
      'Straße München Österreich'
    ]
  },
  {
    category: 'Mixed Unicode',
    data: [
      'Hello 世界 🌍',
      'User: José posted 🚀',
      'Test 中文 émojis 🎉',
      'Мир Peace 平和'
    ]
  },
  {
    category: 'Numbers',
    data: ['0', '1', '42', '123', '9999', '123456', '987654321', '1234567890123']
  },
  {
    category: 'Large Content',
    data: [
      'x'.repeat(100),
      'a'.repeat(500) + 'ção',
      JSON.stringify({name: 'John', email: 'john@example.com', roles: ['admin', 'user']}),
      'Lorem ipsum '.repeat(50)
    ]
  }
];

/**
 * Calculate compression efficiency
 */
function calculateEfficiency(original, compressed, method) {
  const originalBytes = Buffer.byteLength(original, 'utf8');
  const compressedBytes = Buffer.byteLength(compressed, 'utf8');
  const savings = originalBytes - compressedBytes;
  const savingsPercent = originalBytes > 0 ? (savings / originalBytes) * 100 : 0;
  
  return {
    original: originalBytes,
    compressed: compressedBytes,
    savings: savings,
    savingsPercent: savingsPercent,
    method: method,
    ratio: compressedBytes / originalBytes
  };
}

/**
 * Test encoding method
 */
function testEncoding(value, encoder, decoder, methodName) {
  try {
    const encoded = encoder(value);
    const encodedValue = typeof encoded === 'string' ? encoded : encoded.encoded;
    const decoded = decoder(encodedValue);
    
    // Verify round-trip integrity
    const isValid = decoded === value;
    
    const efficiency = calculateEfficiency(value, encodedValue, methodName);
    
    return {
      ...efficiency,
      valid: isValid,
      encodedValue: encodedValue,
      decodedValue: decoded
    };
  } catch (error) {
    return {
      original: Buffer.byteLength(value, 'utf8'),
      compressed: Buffer.byteLength(value, 'utf8'),
      savings: 0,
      savingsPercent: 0,
      method: methodName,
      ratio: 1,
      valid: false,
      error: error.message
    };
  }
}

// Run benchmarks for each category
let totalResults = {
  raw: { original: 0, compressed: 0 },
  base64: { original: 0, compressed: 0 },
  urlEncoding: { original: 0, compressed: 0 },
  advanced: { original: 0, compressed: 0 },
  metadata: { original: 0, compressed: 0 }
};

for (const testCase of testCases) {
  console.log(`\n📊 ${testCase.category}`);
  console.log('-'.repeat(50));
  
  let categoryTotals = {
    raw: { original: 0, compressed: 0 },
    base64: { original: 0, compressed: 0 },
    urlEncoding: { original: 0, compressed: 0 },
    advanced: { original: 0, compressed: 0 },
    metadata: { original: 0, compressed: 0 }
  };
  
  for (const value of testCase.data) {
    const original = Buffer.byteLength(value, 'utf8');
    
    // Raw (no encoding)
    const raw = { original, compressed: original, savings: 0, savingsPercent: 0, method: 'raw', valid: true };
    
    // Base64 encoding
    const base64Encoded = Buffer.from(value, 'utf8').toString('base64');
    const base64 = calculateEfficiency(value, base64Encoded, 'base64');
    base64.valid = Buffer.from(base64Encoded, 'base64').toString('utf8') === value;
    
    // URL encoding
    const urlEncoded = encodeURIComponent(value);
    const urlEncoding = calculateEfficiency(value, urlEncoded, 'url');
    urlEncoding.valid = decodeURIComponent(urlEncoded) === value;
    
    // Advanced encoding
    const advanced = testEncoding(value, advancedEncode, advancedDecode, 'advanced');
    
    // Metadata encoding
    const metadata = testEncoding(value, metadataEncode, metadataDecode, 'metadata');
    
    // Accumulate totals
    categoryTotals.raw.original += raw.original;
    categoryTotals.raw.compressed += raw.compressed;
    categoryTotals.base64.original += base64.original;
    categoryTotals.base64.compressed += base64.compressed;
    categoryTotals.urlEncoding.original += urlEncoding.original;
    categoryTotals.urlEncoding.compressed += urlEncoding.compressed;
    categoryTotals.advanced.original += advanced.original;
    categoryTotals.advanced.compressed += advanced.compressed;
    categoryTotals.metadata.original += metadata.original;
    categoryTotals.metadata.compressed += metadata.compressed;
    
    // Show detailed results for first few items or if there are issues
    const showDetails = testCase.data.indexOf(value) < 3 || !advanced.valid || !metadata.valid;
    
    if (showDetails) {
      console.log(`\nValue: "${value.length > 50 ? value.substring(0, 47) + '...' : value}"`);
      console.log(`Original: ${original} bytes`);
      console.log(`Base64:   ${base64.compressed} bytes (${base64.savingsPercent.toFixed(1)}% ${base64.savingsPercent >= 0 ? 'increase' : 'savings'})`);
      console.log(`URL:      ${urlEncoding.compressed} bytes (${urlEncoding.savingsPercent.toFixed(1)}% ${urlEncoding.savingsPercent >= 0 ? 'increase' : 'savings'})`);
      console.log(`Advanced: ${advanced.compressed} bytes (${advanced.savingsPercent.toFixed(1)}% ${advanced.savingsPercent >= 0 ? 'savings' : 'increase'}) [${advanced.method}] ${advanced.valid ? '✓' : '❌'}`);
      console.log(`Metadata: ${metadata.compressed} bytes (${metadata.savingsPercent.toFixed(1)}% ${metadata.savingsPercent >= 0 ? 'savings' : 'increase'}) [${metadata.method}] ${metadata.valid ? '✓' : '❌'}`);
      
      if (!advanced.valid) {
        console.log(`⚠️  Advanced encoding failed: ${value} → ${advanced.encodedValue} → ${advanced.decodedValue}`);
      }
      if (!metadata.valid) {
        console.log(`⚠️  Metadata encoding failed: ${value} → ${metadata.encodedValue} → ${metadata.decodedValue}`);
      }
    }
  }
  
  // Category summary
  const categoryAdvancedSavings = ((categoryTotals.advanced.original - categoryTotals.advanced.compressed) / categoryTotals.advanced.original) * 100;
  const categoryMetadataSavings = ((categoryTotals.metadata.original - categoryTotals.metadata.compressed) / categoryTotals.metadata.original) * 100;
  const categoryBase64Savings = ((categoryTotals.base64.original - categoryTotals.base64.compressed) / categoryTotals.base64.original) * 100;
  
  console.log(`\n📈 ${testCase.category} Summary:`);
  console.log(`Advanced:  ${categoryAdvancedSavings.toFixed(1)}% savings vs raw`);
  console.log(`Metadata:  ${categoryMetadataSavings.toFixed(1)}% savings vs raw`);
  console.log(`Base64:    ${categoryBase64Savings.toFixed(1)}% savings vs raw`);
  
  // Add to totals
  Object.keys(totalResults).forEach(method => {
    totalResults[method].original += categoryTotals[method].original;
    totalResults[method].compressed += categoryTotals[method].compressed;
  });
}

// Overall summary
console.log('\n🎯 OVERALL RESULTS');
console.log('='.repeat(80));

const methods = ['base64', 'urlEncoding', 'advanced', 'metadata'];
methods.forEach(method => {
  const savings = ((totalResults[method].original - totalResults[method].compressed) / totalResults[method].original) * 100;
  const vsBase64 = totalResults[method].compressed / totalResults.base64.compressed;
  
  console.log(`${method.toUpperCase().padEnd(12)}: ${savings.toFixed(1)}% savings vs raw | ${(vsBase64 * 100).toFixed(1)}% of base64 size`);
});

console.log('\n📊 Size Comparison (bytes):');
console.log(`Raw:      ${totalResults.raw.compressed.toLocaleString()}`);
console.log(`Base64:   ${totalResults.base64.compressed.toLocaleString()} (+${((totalResults.base64.compressed / totalResults.raw.compressed - 1) * 100).toFixed(1)}%)`);
console.log(`URL:      ${totalResults.urlEncoding.compressed.toLocaleString()} (+${((totalResults.urlEncoding.compressed / totalResults.raw.compressed - 1) * 100).toFixed(1)}%)`);
console.log(`Advanced: ${totalResults.advanced.compressed.toLocaleString()} (${((totalResults.advanced.compressed / totalResults.raw.compressed - 1) * 100).toFixed(1)}%)`);
console.log(`Metadata: ${totalResults.metadata.compressed.toLocaleString()} (${((totalResults.metadata.compressed / totalResults.raw.compressed - 1) * 100).toFixed(1)}%)`);

// Performance comparison vs base64
console.log('\n🏆 Best Method by Category:');
const advancedVsBase64 = (1 - totalResults.advanced.compressed / totalResults.base64.compressed) * 100;
const metadataVsBase64 = (1 - totalResults.metadata.compressed / totalResults.base64.compressed) * 100;

console.log(`Advanced encoding: ${advancedVsBase64.toFixed(1)}% ${advancedVsBase64 >= 0 ? 'better' : 'worse'} than base64`);
console.log(`Metadata encoding: ${metadataVsBase64.toFixed(1)}% ${metadataVsBase64 >= 0 ? 'better' : 'worse'} than base64`);

if (advancedVsBase64 > 0) {
  console.log(`✅ Advanced encoding saves ${Math.round(totalResults.base64.compressed - totalResults.advanced.compressed)} bytes vs base64`);
} else {
  console.log(`⚠️  Advanced encoding uses ${Math.round(totalResults.advanced.compressed - totalResults.base64.compressed)} extra bytes vs base64`);
}

console.log('\n' + '='.repeat(80));
console.log('✅ Benchmark complete!');