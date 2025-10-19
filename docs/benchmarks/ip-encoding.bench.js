#!/usr/bin/env node
/**
 * IP Address Encoding Benchmark
 *
 * Measures compression performance and encoding/decoding speed for IPv4 and IPv6 addresses
 * using binary Base64 encoding vs. plain text storage.
 */

import {
  encodeIPv4,
  decodeIPv4,
  encodeIPv6,
  decodeIPv6,
  calculateIPSavings
} from '../../src/concerns/ip.js';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  cyan: '\x1b[96m',
  bold: '\x1b[1m'
};

console.log(`\n${colors.blue}${colors.bold}🚀 IP Address Encoding Benchmark${colors.reset}\n`);

// Test data
const ipv4Addresses = [
  '192.168.1.1',      // 12 chars
  '10.0.0.1',         // 8 chars
  '172.16.0.1',       // 11 chars
  '255.255.255.255',  // 15 chars
  '127.0.0.1',        // 9 chars
  '8.8.8.8',          // 7 chars
  '1.1.1.1',          // 7 chars
  '0.0.0.0'           // 7 chars
];

const ipv6Addresses = [
  '2001:db8::1',                           // 11 chars (compressed)
  '::1',                                   // 3 chars (loopback)
  'fe80::1',                               // 8 chars (link-local)
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334', // 39 chars (full)
  '::',                                    // 2 chars (all zeros)
  'ff02::1',                               // 8 chars (multicast)
  '2001:db8:85a3::8a2e:370:7334',         // 27 chars (mixed)
  'fe80::7:8%eth0'                         // 15 chars (with zone)
];

/**
 * Benchmark helper function
 */
function bench(name, fn, iterations = 1e6) {
  const runs = [];

  // Warmup
  for (let i = 0; i < 1000; i++) fn(i);

  // Actual runs
  for (let i = 0; i < 5; i++) {
    const start = process.hrtime.bigint();
    for (let j = 0; j < iterations; j++) {
      fn(j);
    }
    const end = process.hrtime.bigint();

    const ms = Number(end - start) / 1e6;
    const opsPerSec = (iterations / ms * 1000);
    runs.push(opsPerSec);
  }

  const avg = runs.reduce((a, b) => a + b) / runs.length;
  const fastest = Math.max(...runs);
  const slowest = Math.min(...runs);

  return { name, avg, fastest, slowest };
}

// ============================================================================
// 1. Compression Ratio Test
// ============================================================================

console.log(`${colors.cyan}📊 Compression Analysis${colors.reset}\n`);

console.log(`${colors.yellow}IPv4 Addresses:${colors.reset}`);
let totalIPv4Original = 0;
let totalIPv4Encoded = 0;

ipv4Addresses.forEach(ip => {
  const savings = calculateIPSavings(ip);
  const encoded = encodeIPv4(ip);

  totalIPv4Original += savings.originalSize;
  totalIPv4Encoded += savings.encodedSize;

  const savingsColor = savings.savings > 0 ? colors.green : colors.red;
  console.log(
    `  ${ip.padEnd(15)} ${savings.originalSize}B → ${savings.encodedSize}B ` +
    `(${savingsColor}${savings.savings > 0 ? '+' : ''}${savings.savings.toFixed(1)}%${colors.reset})`
  );
});

const avgIPv4Savings = ((totalIPv4Original - totalIPv4Encoded) / totalIPv4Original * 100).toFixed(1);
console.log(
  `\n  ${colors.bold}Average IPv4:${colors.reset} ${totalIPv4Original}B → ${totalIPv4Encoded}B ` +
  `(${colors.green}+${avgIPv4Savings}%${colors.reset})\n`
);

console.log(`${colors.yellow}IPv6 Addresses:${colors.reset}`);
let totalIPv6Original = 0;
let totalIPv6Encoded = 0;

ipv6Addresses.slice(0, -1).forEach(ip => { // Skip zone ID address
  const savings = calculateIPSavings(ip);

  if (savings.version) {
    const encoded = encodeIPv6(ip);

    totalIPv6Original += savings.originalSize;
    totalIPv6Encoded += savings.encodedSize;

    const savingsColor = savings.savings > 0 ? colors.green : colors.red;
    console.log(
      `  ${ip.padEnd(40)} ${savings.originalSize}B → ${savings.encodedSize}B ` +
      `(${savingsColor}${savings.savings > 0 ? '+' : ''}${savings.savings.toFixed(1)}%${colors.reset})`
    );
  }
});

const avgIPv6Savings = ((totalIPv6Original - totalIPv6Encoded) / totalIPv6Original * 100).toFixed(1);
console.log(
  `\n  ${colors.bold}Average IPv6:${colors.reset} ${totalIPv6Original}B → ${totalIPv6Encoded}B ` +
  `(${colors.green}+${avgIPv6Savings}%${colors.reset})\n`
);

// ============================================================================
// 2. Encoding Performance
// ============================================================================

console.log(`\n${colors.cyan}⚡ Encoding Performance${colors.reset}\n`);

const encodingResults = [
  bench('IPv4 Encode', (i) => {
    const ip = ipv4Addresses[i % ipv4Addresses.length];
    encodeIPv4(ip);
  }),
  bench('IPv4 Decode', (i) => {
    const ip = ipv4Addresses[i % ipv4Addresses.length];
    const encoded = encodeIPv4(ip);
    decodeIPv4(encoded);
  }),
  bench('IPv6 Encode', (i) => {
    const ip = ipv6Addresses[i % (ipv6Addresses.length - 1)];
    encodeIPv6(ip);
  }, 5e5), // Fewer iterations for IPv6 (more complex)
  bench('IPv6 Decode', (i) => {
    const ip = ipv6Addresses[i % (ipv6Addresses.length - 1)];
    const encoded = encodeIPv6(ip);
    decodeIPv6(encoded);
  }, 5e5)
];

console.table(encodingResults.map(r => ({
  'Operation': r.name,
  'Avg ops/s': Math.round(r.avg).toLocaleString(),
  'Fastest': Math.round(r.fastest).toLocaleString(),
  'Slowest': Math.round(r.slowest).toLocaleString(),
  'µs/op': (1e6 / r.avg).toFixed(2)
})));

// ============================================================================
// 3. Roundtrip Performance
// ============================================================================

console.log(`\n${colors.cyan}🔄 Roundtrip Performance${colors.reset}\n`);

const roundtripResults = [
  bench('IPv4 Roundtrip', (i) => {
    const ip = ipv4Addresses[i % ipv4Addresses.length];
    const encoded = encodeIPv4(ip);
    const decoded = decodeIPv4(encoded);
  }),
  bench('IPv6 Roundtrip', (i) => {
    const ip = ipv6Addresses[i % (ipv6Addresses.length - 1)];
    const encoded = encodeIPv6(ip);
    const decoded = decodeIPv6(encoded);
  }, 5e5)
];

console.table(roundtripResults.map(r => ({
  'Operation': r.name,
  'Avg ops/s': Math.round(r.avg).toLocaleString(),
  'Fastest': Math.round(r.fastest).toLocaleString(),
  'Slowest': Math.round(r.slowest).toLocaleString(),
  'µs/op': (1e6 / r.avg).toFixed(2)
})));

// ============================================================================
// 4. Comparison with String Storage
// ============================================================================

console.log(`\n${colors.cyan}📈 Comparison: Binary vs String Storage${colors.reset}\n`);

// Simulate string storage (no encoding)
const stringStorageResults = [
  bench('IPv4 String (baseline)', (i) => {
    const ip = ipv4Addresses[i % ipv4Addresses.length];
    const stored = ip; // No encoding
    const retrieved = stored; // No decoding
  }),
  bench('IPv4 Binary', (i) => {
    const ip = ipv4Addresses[i % ipv4Addresses.length];
    const encoded = encodeIPv4(ip);
    const decoded = decodeIPv4(encoded);
  })
];

const ipv4StringOps = stringStorageResults[0].avg;
const ipv4BinaryOps = stringStorageResults[1].avg;
const ipv4Overhead = ((ipv4StringOps - ipv4BinaryOps) / ipv4StringOps * 100).toFixed(1);

console.log(`  ${colors.yellow}IPv4:${colors.reset}`);
console.log(`    String storage:  ${Math.round(ipv4StringOps).toLocaleString()} ops/s`);
console.log(`    Binary encoding: ${Math.round(ipv4BinaryOps).toLocaleString()} ops/s`);
console.log(
  `    Overhead: ${colors.yellow}${ipv4Overhead}%${colors.reset} slower ` +
  `(${colors.green}but ${avgIPv4Savings}% smaller${colors.reset})\n`
);

// ============================================================================
// 5. Summary
// ============================================================================

console.log(`\n${colors.green}${colors.bold}✅ Summary${colors.reset}\n`);

console.log(`  ${colors.bold}Compression:${colors.reset}`);
console.log(`    IPv4: ${colors.green}${avgIPv4Savings}% average savings${colors.reset} (${totalIPv4Original}B → ${totalIPv4Encoded}B)`);
console.log(`    IPv6: ${colors.green}${avgIPv6Savings}% average savings${colors.reset} (${totalIPv6Original}B → ${totalIPv6Encoded}B)`);

console.log(`\n  ${colors.bold}Performance:${colors.reset}`);
console.log(`    IPv4 encode: ${colors.cyan}${Math.round(encodingResults[0].avg).toLocaleString()} ops/s${colors.reset}`);
console.log(`    IPv4 decode: ${colors.cyan}${Math.round(encodingResults[1].avg).toLocaleString()} ops/s${colors.reset}`);
console.log(`    IPv6 encode: ${colors.cyan}${Math.round(encodingResults[2].avg).toLocaleString()} ops/s${colors.reset}`);
console.log(`    IPv6 decode: ${colors.cyan}${Math.round(encodingResults[3].avg).toLocaleString()} ops/s${colors.reset}`);

console.log(`\n  ${colors.bold}Trade-off:${colors.reset}`);
console.log(`    ${colors.yellow}~${ipv4Overhead}% performance overhead${colors.reset} for ${colors.green}~${avgIPv4Savings}% space savings${colors.reset}`);
console.log(`    ${colors.green}Ideal for metadata-constrained storage (S3 2KB limit)${colors.reset}`);

console.log(`\n${colors.green}✅ Benchmark complete!${colors.reset}\n`);
