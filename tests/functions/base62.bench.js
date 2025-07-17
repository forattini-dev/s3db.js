import { encode as toBase62, decode as fromBase62 } from '../../src/concerns/base62.js';

// Function to calculate compression metrics
function calculateCompression(numbers, encoder) {
  let totalOriginalDigits = 0;
  let totalEncodedDigits = 0;
  
  for (const num of numbers) {
    const originalDigits = num.toString().length;
    const encodedDigits = encoder(num).length;
    totalOriginalDigits += originalDigits;
    totalEncodedDigits += encodedDigits;
  }
  
  const compressionRatio = (1 - totalEncodedDigits / totalOriginalDigits) * 100;
  const avgOriginalDigits = totalOriginalDigits / numbers.length;
  const avgEncodedDigits = totalEncodedDigits / numbers.length;
  
  return {
    compressionRatio,
    avgOriginalDigits,
    avgEncodedDigits,
    digitsSaved: avgOriginalDigits - avgEncodedDigits
  };
}

// --- Collect and print results with console.table ---
const performanceResults = [];
function recordResult(label, base62Arr, base36Arr, compressionData) {
  const base62Avg = base62Arr.reduce((a, b) => a + b, 0) / base62Arr.length;
  const base36Avg = base36Arr.reduce((a, b) => a + b, 0) / base36Arr.length;
  
  const ratio = base62Avg / base36Avg;
  let comparison;
  if (ratio > 1.2) comparison = `${ratio.toFixed(2)}x faster`;
  else if (ratio < 0.8) comparison = `${(1/ratio).toFixed(2)}x slower`;
  else comparison = 'similar';
  
  performanceResults.push({
    'Operation': label,
    'Base36 (k ops/s)': Math.round(base36Avg / 1000),
    'Base62 (k ops/s)': Math.round(base62Avg / 1000),
    'Base62 vs Base36': comparison
  });
}

function benchWithResult(name, fn, count = 1e6) {
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const start = process.hrtime.bigint();
    for (let j = 0; j < count; j++) fn(j);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    const ops = (count / ms * 1000);
    runs.push(ops);
  }
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const fastest = Math.max(...runs);
  const slowest = Math.min(...runs);
  console.log(`${name}: avg=${avg.toFixed(0)} ops/sec, fastest=${fastest.toFixed(0)}, slowest=${slowest.toFixed(0)}`);
  return runs;
}

function benchRandomWithResult(name, fn, count = 1e6, max = Number.MAX_SAFE_INTEGER) {
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const arr = Array.from({ length: count }, () => Math.floor(Math.random() * max));
    const start = process.hrtime.bigint();
    for (let j = 0; j < count; j++) fn(arr[j]);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    const ops = (count / ms * 1000);
    runs.push(ops);
  }
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const fastest = Math.max(...runs);
  const slowest = Math.min(...runs);
  console.log(`${name}: avg=${avg.toFixed(0)} ops/sec, fastest=${fastest.toFixed(0)}, slowest=${slowest.toFixed(0)}`);
  return runs;
}

// Helper to run a benchmark 3 times and return array of results
function run3(fn) {
  return [fn(), fn(), fn()];
}

// --- base36 encode/decode ---
function toBase36(n) {
  return n.toString(36);
}
function fromBase36(s) {
  return parseInt(s, 36);
}

// Generate sample data for compression analysis
const sampleSequential = Array.from({ length: 1000 }, (_, i) => i);
const sampleRandom = Array.from({ length: 1000 }, () => Math.floor(Math.random() * 1e12));
const sampleLarge = Array.from({ length: 1000 }, (_, i) => i * 1e10);

// Calculate compression metrics
const compressionSequential = {
  base36: calculateCompression(sampleSequential, toBase36),
  base62: calculateCompression(sampleSequential, toBase62)
};

const compressionRandom = {
  base36: calculateCompression(sampleRandom, toBase36),
  base62: calculateCompression(sampleRandom, toBase62)
};

const compressionLarge = {
  base36: calculateCompression(sampleLarge, toBase36),
  base62: calculateCompression(sampleLarge, toBase62)
};

// Run and record all benchmarks for both bases (5 times each, print only summary)
const b62_encode = benchWithResult('encode (0..1e6)', toBase62, 1e6);
const b62_decode = benchWithResult('decode (0..1e6)', n => fromBase62(toBase62(n)), 1e6);
const b62_encode_rand = benchRandomWithResult('encode (random 1e6)', toBase62, 1e6, 1e12);
const b62_decode_rand = benchRandomWithResult('decode (random 1e6)', n => fromBase62(toBase62(n)), 1e6, 1e12);
const b62_encode_large = benchWithResult('encode (large 1e5)', n => toBase62(n * 1e10), 1e5);
const b62_decode_large = benchWithResult('decode (large 1e5)', n => fromBase62(toBase62(n * 1e10)), 1e5);

console.log('--- base36 encode/decode benchmarks ---');
const b36_encode = benchWithResult('encode (0..1e6) [base36]', toBase36, 1e6);
const b36_decode = benchWithResult('decode (0..1e6) [base36]', n => fromBase36(toBase36(n)), 1e6);
const b36_encode_rand = benchRandomWithResult('encode (random 1e6) [base36]', toBase36, 1e6, 1e12);
const b36_decode_rand = benchRandomWithResult('decode (random 1e6) [base36]', n => fromBase36(toBase36(n)), 1e6, 1e12);
const b36_encode_large = benchWithResult('encode (large 1e5) [base36]', n => toBase36(n * 1e10), 1e5);
const b36_decode_large = benchWithResult('decode (large 1e5) [base36]', n => fromBase36(toBase36(n * 1e10)), 1e5);

// Record all results for table (averaged)
recordResult('encode (0..1e6)', b62_encode, b36_encode, compressionSequential);
recordResult('decode (0..1e6)', b62_decode, b36_decode, compressionSequential);
recordResult('encode (random 1e6)', b62_encode_rand, b36_encode_rand, compressionRandom);
recordResult('decode (random 1e6)', b62_decode_rand, b36_decode_rand, compressionRandom);
recordResult('encode (large 1e5)', b62_encode_large, b36_encode_large, compressionLarge);
recordResult('decode (large 1e5)', b62_decode_large, b36_decode_large, compressionLarge);

// Print compression analysis using console.table
console.log('\n=== COMPRESSION ANALYSIS ===');
const compressionTable = [
  {
    'Data Type': 'Sequential (0..999)',
    'Base36 Compression': `${compressionSequential.base36.compressionRatio.toFixed(2)}%`,
    'Base62 Compression': `${compressionSequential.base62.compressionRatio.toFixed(2)}%`,
    'Digits Saved (B36)': compressionSequential.base36.digitsSaved.toFixed(2),
    'Digits Saved (B62)': compressionSequential.base62.digitsSaved.toFixed(2)
  },
  {
    'Data Type': 'Random Large',
    'Base36 Compression': `${compressionRandom.base36.compressionRatio.toFixed(2)}%`,
    'Base62 Compression': `${compressionRandom.base62.compressionRatio.toFixed(2)}%`,
    'Digits Saved (B36)': compressionRandom.base36.digitsSaved.toFixed(2),
    'Digits Saved (B62)': compressionRandom.base62.digitsSaved.toFixed(2)
  },
  {
    'Data Type': 'Very Large',
    'Base36 Compression': `${compressionLarge.base36.compressionRatio.toFixed(2)}%`,
    'Base62 Compression': `${compressionLarge.base62.compressionRatio.toFixed(2)}%`,
    'Digits Saved (B36)': compressionLarge.base36.digitsSaved.toFixed(2),
    'Digits Saved (B62)': compressionLarge.base62.digitsSaved.toFixed(2)
  }
];
console.table(compressionTable);

// Print performance comparison using console.table
console.log('\n=== PERFORMANCE COMPARISON ===');
console.table(performanceResults);

// Print compression examples using console.table
console.log('\n=== COMPRESSION EXAMPLES ===');
const examples = [10000, 123456789, 999999999999];
const examplesTable = examples.map(num => {
  const base10 = num.toString();
  const base36 = toBase36(num);
  const base62 = toBase62(num);
  const b36Saved = base10.length - base36.length;
  const b62Saved = base10.length - base62.length;
  const b36Percent = ((base10.length - base36.length) / base10.length * 100).toFixed(2);
  const b62Percent = ((base10.length - base62.length) / base10.length * 100).toFixed(2);
  
  return {
    'Number': num.toLocaleString(),
    'Base10': base10,
    'Base36': base36,
    'Base62': base62,
    'B36 Saved': `${b36Saved} (${b36Percent}%)`,
    'B62 Saved': `${b62Saved} (${b62Percent}%)`
  };
});
console.table(examplesTable);

/**
encode (0..1e6): avg=24607037 ops/sec, fastest=28309788, slowest=18925580
decode (0..1e6): avg=8598851 ops/sec, fastest=8762183, slowest=8416288
encode (random 1e6): avg=10935943 ops/sec, fastest=11471780, slowest=9330478
decode (random 1e6): avg=2967363 ops/sec, fastest=3055848, slowest=2753774
encode (large 1e5): avg=8956189 ops/sec, fastest=9207366, slowest=8605453
decode (large 1e5): avg=2484995 ops/sec, fastest=2514186, slowest=2430603
--- base36 encode/decode benchmarks ---
encode (0..1e6) [base36]: avg=60741796 ops/sec, fastest=61684344, slowest=59682380
decode (0..1e6) [base36]: avg=31855745 ops/sec, fastest=36040092, slowest=20896020
encode (random 1e6) [base36]: avg=2186256 ops/sec, fastest=2235633, slowest=2020451
decode (random 1e6) [base36]: avg=2058080 ops/sec, fastest=2064569, slowest=2054866
encode (large 1e5) [base36]: avg=1669166 ops/sec, fastest=1683739, slowest=1631736
decode (large 1e5) [base36]: avg=1598687 ops/sec, fastest=1609765, slowest=1589557

=== COMPRESSION ANALYSIS ===
┌─────────┬───────────────────────┬────────────────────┬────────────────────┬────────────────────┬────────────────────┐
│ (index) │ Data Type             │ Base36 Compression │ Base62 Compression │ Digits Saved (B36) │ Digits Saved (B62) │
├─────────┼───────────────────────┼────────────────────┼────────────────────┼────────────────────┼────────────────────┤
│ 0       │ 'Sequential (0..999)' │ '32.04%'           │ '32.94%'           │ '0.93'             │ '0.95'             │
│ 1       │ 'Random Large'        │ '33.46%'           │ '41.62%'           │ '3.98'             │ '4.95'             │
│ 2       │ 'Very Large'          │ '32.43%'           │ '40.71%'           │ '4.18'             │ '5.24'             │
└─────────┴───────────────────────┴────────────────────┴────────────────────┴────────────────────┴────────────────────┘

=== PERFORMANCE COMPARISON ===
┌─────────┬───────────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ (index) │ Operation             │ Base36 (k ops/s) │ Base62 (k ops/s) │ Base62 vs Base36 │
├─────────┼───────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ 0       │ 'encode (0..1e6)'     │ 60742            │ 24607            │ '2.47x slower'   │
│ 1       │ 'decode (0..1e6)'     │ 31856            │ 8599             │ '3.70x slower'   │
│ 2       │ 'encode (random 1e6)' │ 2186             │ 10936            │ '5.00x faster'   │
│ 3       │ 'decode (random 1e6)' │ 2058             │ 2967             │ '1.44x faster'   │
│ 4       │ 'encode (large 1e5)'  │ 1669             │ 8956             │ '5.37x faster'   │
│ 5       │ 'decode (large 1e5)'  │ 1599             │ 2485             │ '1.55x faster'   │
└─────────┴───────────────────────┴──────────────────┴──────────────────┴──────────────────┘

=== COMPRESSION EXAMPLES ===
┌─────────┬───────────────────┬────────────────┬────────────┬───────────┬──────────────┬──────────────┐
│ (index) │ Number            │ Base10         │ Base36     │ Base62    │ B36 Saved    │ B62 Saved    │
├─────────┼───────────────────┼────────────────┼────────────┼───────────┼──────────────┼──────────────┤
│ 0       │ '10.000'          │ '10000'        │ '7ps'      │ '2Bi'     │ '2 (40.00%)' │ '2 (40.00%)' │
│ 1       │ '123.456.789'     │ '123456789'    │ '21i3v9'   │ '8m0Kx'   │ '3 (33.33%)' │ '4 (44.44%)' │
│ 2       │ '999.999.999.999' │ '999999999999' │ 'cre66i9r' │ 'hBxM5A3' │ '4 (33.33%)' │ '5 (41.67%)' │
└─────────┴───────────────────┴────────────────┴────────────┴───────────┴──────────────┴──────────────┘
*/