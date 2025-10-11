import { metadataEncode, metadataDecode, analyzeString } from '../../src/concerns/metadata-encoding.js';

console.log('='.repeat(120));
console.log('SMART ENCODING PERFORMANCE BENCHMARK');
console.log('='.repeat(120));

// Test data sets
const testDataSets = {
  ascii: [
    'user_123456',
    'session_abc123xyz',
    'txn-2024-01-15-001',
    'v2.5.1',
    '2024-01-15T10:30:00Z',
    'status_ok',
    'GET',
    'POST',
    '/api/v1/users',
    'application/json'
  ],
  latin: [
    'José Silva',
    'Maria José',
    'São Paulo',
    'Ação Completa',
    'François Müller',
    'Señor García',
    'Città italiana',
    'Zürich',
    'København',
    'Málaga'
  ],
  mixed: [
    'User: José Silva',
    'Status: Ação OK',
    'Price: R$ 1.500,00',
    'Location: São Paulo, BR',
    'François bought 5 items',
    'Meeting at 15:30 in Zürich',
    'Invoice #12345 - José María',
    'Temperature: 25°C',
    'Progress: 75%',
    'Email: jose@example.com'
  ],
  emoji: [
    'Approved ✅',
    'Rating: ⭐⭐⭐⭐⭐',
    'Status: 🚀 Launched',
    'Mood: 😊',
    'Weather: ☀️',
    '🎉 Celebration',
    'Priority: 🔥',
    'Done ✓',
    'Warning ⚠️',
    'Error ❌'
  ],
  cjk: [
    '李明',
    '東京',
    '北京市',
    '株式会社',
    '안녕하세요',
    'こんにちは',
    '你好世界',
    '서울특별시',
    'ありがとう',
    '謝謝'
  ]
};

// Function to measure performance
function benchmark(name, fn, data, iterations = 100000) {
  const start = process.hrtime.bigint();
  
  for (let i = 0; i < iterations; i++) {
    const item = data[i % data.length];
    fn(item);
  }
  
  const end = process.hrtime.bigint();
  const timeMs = Number(end - start) / 1_000_000;
  const opsPerSec = Math.round(iterations / (timeMs / 1000));
  
  return {
    name,
    timeMs,
    iterations,
    opsPerSec,
    avgTimeUs: (timeMs * 1000) / iterations // microseconds per operation
  };
}

// Benchmark different operations
console.log('\n📊 ENCODING PERFORMANCE (100k operations per test):');
console.log('─'.repeat(120));

const encodingResults = [];

// Test encoding for each data type
for (const [dataType, data] of Object.entries(testDataSets)) {
  const result = benchmark(
    `Encode ${dataType}`,
    (str) => metadataEncode(str),
    data
  );
  encodingResults.push({ ...result, dataType });
}

// Display encoding results
const encodingTable = encodingResults.map(r => ({
  'Data Type': r.dataType,
  'Time (ms)': r.timeMs.toFixed(1),
  'Ops/sec': r.opsPerSec.toLocaleString(),
  'Avg μs/op': r.avgTimeUs.toFixed(2),
  'Throughput KB/s': Math.round(r.opsPerSec * 50 / 1000)
}));
console.table(encodingTable);

// Test decoding
console.log('\n📊 DECODING PERFORMANCE (100k operations per test):');
console.log('─'.repeat(120));

const decodingResults = [];

// First encode all test data
const encodedDataSets = {};
for (const [dataType, data] of Object.entries(testDataSets)) {
  encodedDataSets[dataType] = data.map(str => metadataEncode(str).encoded);
}

// Test decoding for each data type
for (const [dataType, data] of Object.entries(encodedDataSets)) {
  const result = benchmark(
    `Decode ${dataType}`,
    (str) => metadataDecode(str),
    data
  );
  decodingResults.push({ ...result, dataType });
}

// Display decoding results
const decodingTable = decodingResults.map(r => ({
  'Data Type': r.dataType,
  'Time (ms)': r.timeMs.toFixed(1),
  'Ops/sec': r.opsPerSec.toLocaleString(),
  'Avg μs/op': r.avgTimeUs.toFixed(2),
  'Throughput KB/s': Math.round(r.opsPerSec * 50 / 1000)
}));
console.table(decodingTable);

// Test analysis function (the decision making)
console.log('\n📊 STRING ANALYSIS PERFORMANCE (determines encoding method):');
console.log('─'.repeat(120));

const analysisResults = [];

for (const [dataType, data] of Object.entries(testDataSets)) {
  const result = benchmark(
    `Analyze ${dataType}`,
    (str) => analyzeString(str),
    data
  );
  analysisResults.push({ ...result, dataType });
}

// Display analysis results
const analysisTable = analysisResults.map(r => ({
  'Data Type': r.dataType,
  'Time (ms)': r.timeMs.toFixed(1),
  'Ops/sec': r.opsPerSec.toLocaleString(),
  'Avg μs/op': r.avgTimeUs.toFixed(2)
}));
console.table(analysisTable);

// Compare with baseline (always base64)
console.log('\n📊 COMPARISON WITH ALWAYS-BASE64 APPROACH:');
console.log('─'.repeat(120));

function alwaysBase64Encode(str) {
  if (str === null) return 'null';
  if (str === undefined) return 'undefined';
  return Buffer.from(String(str), 'utf8').toString('base64');
}

function alwaysBase64Decode(str) {
  if (str === 'null') return null;
  if (str === 'undefined') return undefined;
  if (!str) return str;
  
  try {
    return Buffer.from(str, 'base64').toString('utf8');
  } catch {
    return str;
  }
}

// Combine all test data
const allData = Object.values(testDataSets).flat();

const metadataEncodeResult = benchmark('Smart Encode', (str) => metadataEncode(str), allData);
const base64EncodeResult = benchmark('Base64 Encode', (str) => alwaysBase64Encode(str), allData);

const metadataDecodeResult = benchmark('Smart Decode', (str) => {
  const encoded = metadataEncode(str);
  return metadataDecode(encoded.encoded);
}, allData);

const base64DecodeResult = benchmark('Base64 Decode', (str) => {
  const encoded = alwaysBase64Encode(str);
  return alwaysBase64Decode(encoded);
}, allData);

const comparisonTable = [
  {
    'Method': 'Always Base64',
    'Encode μs/op': base64EncodeResult.avgTimeUs.toFixed(2),
    'Decode μs/op': base64DecodeResult.avgTimeUs.toFixed(2),
    'Total μs/op': (base64EncodeResult.avgTimeUs + base64DecodeResult.avgTimeUs).toFixed(2),
    'vs Base64': 'baseline'
  },
  {
    'Method': 'Smart Encoding',
    'Encode μs/op': metadataEncodeResult.avgTimeUs.toFixed(2),
    'Decode μs/op': metadataDecodeResult.avgTimeUs.toFixed(2),
    'Total μs/op': (metadataEncodeResult.avgTimeUs + metadataDecodeResult.avgTimeUs).toFixed(2),
    'vs Base64': `${((metadataEncodeResult.avgTimeUs + metadataDecodeResult.avgTimeUs) / (base64EncodeResult.avgTimeUs + base64DecodeResult.avgTimeUs) * 100).toFixed(0)}%`
  }
];
console.table(comparisonTable);

// Test worst-case scenarios
console.log('\n📊 WORST-CASE SCENARIOS:');
console.log('─'.repeat(120));

const worstCases = [
  { name: 'Very long ASCII (1KB)', data: 'a'.repeat(1000) },
  { name: 'Very long Latin (1KB)', data: 'ção'.repeat(333) },
  { name: 'Very long Emoji (1KB)', data: '🚀'.repeat(250) },
  { name: 'Highly mixed content', data: 'a'.repeat(100) + 'ção'.repeat(50) + '🚀'.repeat(20) },
  { name: 'Looks like base64', data: 'SGVsbG8gV29ybGQ=' },
  { name: 'URL encoded lookalike', data: 'Hello%20World%20Test' },
  { name: 'With null bytes', data: 'Hello\0World\0Test' },
  { name: 'All special chars', data: '!@#$%^&*()_+-=[]{}|;:,.<>?/~`' }
];

const worstCaseResults = worstCases.map(({ name, data }) => {
  const iterations = 10000;
  
  // Measure encode
  const encodeStart = process.hrtime.bigint();
  let encoded;
  for (let i = 0; i < iterations; i++) {
    encoded = metadataEncode(data);
  }
  const encodeTime = Number(process.hrtime.bigint() - encodeStart) / 1_000_000;
  
  // Measure decode
  const decodeStart = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    metadataDecode(encoded.encoded);
  }
  const decodeTime = Number(process.hrtime.bigint() - decodeStart) / 1_000_000;
  
  return {
    'Scenario': name,
    'Encode μs': (encodeTime / iterations * 1000).toFixed(1),
    'Decode μs': (decodeTime / iterations * 1000).toFixed(1),
    'Method': encoded.encoding,
    'Size': encoded.encoded.length
  };
});

console.table(worstCaseResults);

// Memory usage estimation
console.log('\n📊 MEMORY OVERHEAD ANALYSIS:');
console.log('─'.repeat(120));

const memoryTests = [
  { type: 'ASCII', sample: 'user_123456' },
  { type: 'Latin', sample: 'José Silva' },
  { type: 'Emoji', sample: '🚀 Launched' },
  { type: 'CJK', sample: '中文测试' }
];

const memoryTable = memoryTests.map(({ type, sample }) => {
  const originalSize = Buffer.byteLength(sample, 'utf8');
  const metadataEncoded = metadataEncode(sample);
  const smartSize = Buffer.byteLength(metadataEncoded.encoded, 'utf8');
  const base64Size = Buffer.byteLength(Buffer.from(sample, 'utf8').toString('base64'), 'utf8');
  
  return {
    'Type': type,
    'Original': originalSize,
    'Smart Enc': smartSize,
    'Base64': base64Size,
    'Smart Overhead': `${((smartSize/originalSize - 1) * 100).toFixed(0)}%`,
    'Base64 Overhead': `${((base64Size/originalSize - 1) * 100).toFixed(0)}%`
  };
});

console.table(memoryTable);

// Final summary
console.log('\n' + '='.repeat(120));
console.log('PERFORMANCE SUMMARY:');
console.log('='.repeat(120));

const avgSmartEncode = encodingResults.reduce((acc, r) => acc + r.avgTimeUs, 0) / encodingResults.length;
const avgSmartDecode = decodingResults.reduce((acc, r) => acc + r.avgTimeUs, 0) / decodingResults.length;

const perfOverhead = ((avgSmartEncode + avgSmartDecode) / (base64EncodeResult.avgTimeUs + base64DecodeResult.avgTimeUs) - 1) * 100;

console.log(`
✅ Smart Encoding Performance:
   • Average encode time: ${avgSmartEncode.toFixed(2)} μs/operation
   • Average decode time: ${avgSmartDecode.toFixed(2)} μs/operation
   • Total round-trip: ${(avgSmartEncode + avgSmartDecode).toFixed(2)} μs/operation
   
📈 Compared to always using Base64:
   • Smart encoding is ${((base64EncodeResult.avgTimeUs / metadataEncodeResult.avgTimeUs - 1) * 100).toFixed(0)}% slower on encode (due to analysis overhead)
   • Smart decoding is ${((base64DecodeResult.avgTimeUs / metadataDecodeResult.avgTimeUs - 1) * 100).toFixed(0)}% slower on decode (due to detection logic)
   • BUT: Saves significant storage space for typical data
   
⚡ Throughput capabilities:
   • Can process ~${Math.round(1000000 / (avgSmartEncode + avgSmartDecode)).toLocaleString()} operations/second
   • Suitable for high-volume metadata operations
   
💡 Key insights:
   • ASCII data (most common) has ZERO encoding overhead
   • Small performance cost (~${perfOverhead.toFixed(0)}% slower) for significant space savings
   • Analysis phase adds ~${analysisResults[0].avgTimeUs.toFixed(1)} μs but enables optimal encoding choice
`);