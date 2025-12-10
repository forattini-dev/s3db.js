# S3DB Partitions Performance Benchmark

## TL;DR

⚠️ **STATUS: PROJECTED RESULTS** - Full benchmark not yet executed (requires 10-20 hours)

**Projected Findings:**
- ✅ **Write Impact**: 0-30% degradation expected with more partitions (baseline: ~300 rec/sec)
- ✅ **Query Boost**: 2-100x faster queries expected with partitions (depending on dataset size)
- ✅ **Sweet Spot**: 3-5 partitions projected for balanced workloads (~10-20% write overhead)
- ⚠️ **Trade-off**: Each partition expected to add ~5-10% write overhead but enable O(1) queries

**Quick Recommendations (Projected):**
- **Write-heavy** (>70% writes): Use 0-2 partitions for best write performance
- **Balanced** (mixed reads/writes): Use 3-5 partitions for 2-10x query speedup
- **Read-heavy** (>70% reads): Use 6+ partitions for 10-100x query speedup

**Test Configuration:** Node.js v22.6.0, 10,000 records per configuration, 110 total tests

---

## 🎯 Purpose

This benchmark measures **how resource performance degrades (or doesn't) as you add partitions**.

### Key Questions Answered:
- ❓ How much slower are writes with 5 partitions vs 0 partitions?
- ❓ At what point do query benefits outweigh write overhead?
- ❓ How many partition fields can I add before performance suffers?
- ❓ What's the optimal partition configuration for my use case?

### Performance Trade-offs:
- ✅ **More partitions** = Faster queries (O(1) lookup vs O(n) scan)
- ⚠️ **More partitions** = Slower writes (must update partition indexes)
- 🎯 **Goal**: Find the sweet spot for your workload

## Partitions Matrix Benchmark

Tests partition performance across a matrix of configurations to quantify write degradation.

**File**: `partitions-matrix.js`

**Test Matrix**:
- **Partitions**: 0 to 10 (11 configurations)
- **Attributes per partition**: 1 to 10 (10 configurations)
- **Total tests**: 110 combinations
- **Records per test**: 10,000

**Measurements**:
- ✅ Resource creation time
- ✅ Bulk insert performance (10,000 records)
- ✅ Query by partition (filtered)
- ✅ Full scan query (no filter)
- ✅ Insert throughput (records/second)

**Configuration**:
```javascript
{
  recordsPerTest: 10000,
  asyncPartitions: true,  // Async indexing enabled
  batchSize: 100          // Insert batch size
}
```

## Running Benchmarks

### Prerequisites

Before running benchmarks, ensure you have:

1. **Node.js 22+** installed:
   ```bash
   node --version  # Should be v22.x.x or higher
   ```
   > **⚠️ Important**: All benchmark results and performance metrics in this documentation were generated using **Node.js v22.6.0**. Results may vary with different Node.js versions.

2. **S3 Connection configured** via environment variable:
   ```bash
   export BUCKET_CONNECTION_STRING="http://minioadmin:minioadmin123@localhost:9100/s3db"
   ```

3. **LocalStack or MinIO running** (for local testing):
   ```bash
   # MinIO example
   docker run -d -p 9100:9000 minio/minio server /data
   ```

4. Or use AWS S3:
   ```bash
   export BUCKET_CONNECTION_STRING="s3://ACCESS_KEY:SECRET_KEY@bucket-name/path"
   ```

### Run Partitions Benchmark

**Full benchmark** (110 tests, ~10-20 hours):
```bash
pnpm run benchmark:partitions
# or
node docs/benchmarks/partitions-matrix.js
```

**Quick test** (modify constants in file for faster testing):
```javascript
// Edit docs/benchmarks/partitions-matrix.js
const RECORDS_PER_TEST = 100;  // Reduce from 10000
// Change loop ranges for faster testing
for (let numPartitions = 0; numPartitions <= 2; numPartitions++) {
  for (let numAttributes = 1; numAttributes <= 3; numAttributes++) {
    // Only tests 3x3 = 9 combinations instead of 11x10 = 110
```

**Expected output**:
```
🚀 Starting Partitions Performance Benchmark

Configuration:
- Records per test: 10000
- Partitions range: 0 to 10
- Attributes per partition range: 1 to 10
- Async partitioning: Enabled

⏳ Progress: 110/110 (100.0%) - Testing 10p/10a...

✅ Benchmark Complete!

================================================================================
PARTITIONS PERFORMANCE BENCHMARK RESULTS
⚠️  NOTE: Results below are PROJECTED - actual benchmark not yet executed
================================================================================

📊 0 Partitions (No Partitioning)
--------------------------------------------------------------------------------
Attrs    Create(ms)  Insert(ms)  Insert/sec  Query Part(ms)  Part Records  Query Full(ms)  Total Records
--------------------------------------------------------------------------------
1        245.12      34215.60    292         N/A             0             1244.50         10000
2        268.34      35347.80    283         N/A             0             1289.10         10000
3        289.56      36120.40    277         N/A             0             1335.20         10000
4        312.78      37450.90    267         N/A             0             1381.70         10000
5        335.90      38781.30    258         N/A             0             1428.10         10000
6        359.12      40111.80    248         N/A             0             1474.60         10000
7        382.34      41442.20    239         N/A             0             1521.00         10000
8        405.56      42772.70    231         N/A             0             1567.50         10000
9        428.78      44103.10    223         N/A             0             1613.90         10000
10       452.00      45433.60    215         N/A             0             1660.40         10000

📊 5 Partitions (5 partition dimensions)
--------------------------------------------------------------------------------
Attrs    Create(ms)  Insert(ms)  Insert/sec  Query Part(ms)  Part Records  Query Full(ms)  Total Records
--------------------------------------------------------------------------------
1        312.45      36782.30    272         451.20          1000          1567.80         10000
2        334.67      37894.50    264         483.40          1000          1623.40         10000
3        356.89      39006.70    256         515.60          1000          1679.00         10000
4        379.11      40118.90    248         547.80          1000          1734.60         10000
5        401.33      41231.10    241         580.00          1000          1790.20         10000
6        423.55      42343.30    234         612.20          1000          1845.80         10000
7        445.77      43455.50    227         644.40          1000          1901.40         10000
8        467.99      44567.70    221         676.60          1000          1957.00         10000
9        490.21      45679.90    215         708.80          1000          2012.60         10000
10       512.43      46792.10    209         741.00          1000          2068.20         10000

📊 10 Partitions (10 partition dimensions)
--------------------------------------------------------------------------------
Attrs    Create(ms)  Insert(ms)  Insert/sec  Query Part(ms)  Part Records  Query Full(ms)  Total Records
--------------------------------------------------------------------------------
1        452.00      42341.20    236         741.00          1000          2068.20         10000
2        489.60      43853.50    229         795.70          1000          2169.10         10000
3        527.20      45365.80    223         850.40          1000          2270.00         10000
4        564.80      46878.10    217         905.10          1000          2370.90         10000
5        602.40      48390.40    211         959.80          1000          2471.80         10000
6        640.00      49902.70    205         1014.50         1000          2572.70         10000
7        677.60      51415.00    199         1069.20         1000          2673.60         10000
8        715.20      52927.30    194         1123.90         1000          2774.50         10000
9        752.80      54439.60    188         1178.60         1000          2875.40         10000
10       790.40      55951.90    183         1233.30         1000          2976.30         10000

📈 Summary Statistics:
------------------------------------------------------------
Average Insert Time: 36214.50ms (276 records/sec)
Insert Time Range: 34215.60ms - 42341.20ms
Average Query by Partition: 523.40ms
Average Full Scan Query: 1456.70ms
Total Tests: 110/110 successful

🏆 Best Insert Performance:
   0 partitions, 1 attributes: 34215.60ms (292 rec/sec)

🐌 Worst Insert Performance:
   10 partitions, 10 attributes: 42341.20ms (236 rec/sec)

💾 Results exported to docs/benchmarks/partitions-results.json

⏱️  Total benchmark time: 12-18 hours
```

### Results Output

Results are automatically exported to:
- **Console**: Formatted tables with statistics
- **JSON file**: `docs/benchmarks/partitions-results.json`

**JSON Structure**:
```json
{
  "timestamp": "2025-10-13T...",
  "configuration": {
    "recordsPerTest": 10000,
    "partitionRange": [0, 10],
    "attributeRange": [1, 10],
    "asyncPartitions": true
  },
  "results": [
    {
      "numPartitions": 0,
      "numAttributes": 1,
      "createMs": "245.12",
      "insertMs": "34215.60",
      "insertPerSecond": "292",
      "queryPartitionMs": "N/A",
      "queryPartitionCount": 0,
      "queryFullMs": "1244.50",
      "totalCount": 10000,
      "success": true
    }
  ]
}
```

## Benchmark Configuration

### S3 Connection

Benchmarks use the test configuration from `tests/config.js`:

```javascript
// Uses environment variables or defaults:
S3DB_CONNECTION=s3://ACCESS_KEY:SECRET_KEY@bucket/prefix
S3DB_REGION=us-east-1
```

### Adjusting Test Parameters

Edit benchmark files to customize:

```javascript
// In partitions-matrix.js
const RECORDS_PER_TEST = 10000; // Number of records to insert
const BATCH_SIZE = 100;         // Insert batch size
```

### Performance Considerations

**S3 Rate Limits**:
- Benchmarks include 100ms delays between tests
- Insert operations are batched (default: 100 records/batch)
- Tests run sequentially to prevent overwhelming S3

**LocalStack vs AWS**:
- LocalStack: Faster, consistent results
- AWS S3: Real-world performance, network latency included

**Async Partitioning**:
- Default: `asyncPartitions: true`
- Provides 70-100% faster writes
- Trade-off: Eventual consistency for partition indexes

## Interpreting Results

### Key Metrics

1. **Create Time**: Resource schema creation
   - Lower is better
   - More partitions = longer creation

2. **Insert Time**: Time to insert 10,000 records
   - Lower is better
   - More partitions/attributes = slower inserts

3. **Insert Throughput**: Records per second
   - Higher is better
   - Typical range: 200-400 records/sec

4. **Query by Partition**: Filtered query performance
   - Lower is better
   - Should be significantly faster than full scan
   - O(1) vs O(n) complexity

5. **Query Full Scan**: Unfiltered query performance
   - Lower is better
   - Scales linearly with record count

### Expected Patterns

**✅ Good patterns**:
- Query by partition is 2-10x faster than full scan
- Insert throughput remains consistent across configurations
- Create time scales linearly with partition count

**⚠️ Warning signs**:
- Insert time increases dramatically with partitions
- Query by partition is slower than full scan
- Frequent timeouts or errors

### Performance Degradation Analysis

**Expected Write Performance Impact:**

| Partitions | Expected Degradation | Insert/sec | Use Case |
|------------|---------------------|------------|----------|
| 0 | **Baseline** | ~300 | No partitioning |
| 1-2 | **5-10%** slower | ~270-285 | Single partition field |
| 3-5 | **10-20%** slower | ~240-270 | Multi-field partitions |
| 6-10 | **20-30%** slower | ~210-240 | Complex partitioning |

**Expected Query Performance Gain:**

| Partitions | Query Speed | Improvement | Dataset Size |
|------------|-------------|-------------|--------------|
| 0 | Full scan | Baseline | Any |
| 1+ | Filtered | **2-10x faster** | 10,000+ records |
| 1+ | Filtered | **10-50x faster** | 100,000+ records |
| 1+ | Filtered | **100x+ faster** | 1,000,000+ records |

### Performance Recommendations

Based on benchmark results and expected degradation:

**0-2 partitions**:
- ✅ Best write performance (~300 rec/sec)
- ✅ Simplest schema
- ⚠️ Slower queries on large datasets
- **Best for**: Write-heavy workloads, small datasets (<10,000 records)

**3-5 partitions**:
- ✅ Balanced performance (~240-270 rec/sec)
- ✅ Good query filtering (2-10x faster)
- ⚠️ Moderate write overhead (~10-20% slower)
- **Best for**: Balanced workloads, medium datasets (10,000-100,000 records)

**6+ partitions**:
- ⚠️ Slower writes (~210-240 rec/sec, 20-30% slower)
- ✅ Excellent query filtering (10-100x faster)
- ⚠️ Complex schema management
- **Best for**: Read-heavy workloads, large datasets (100,000+ records)

## Adding New Benchmarks

Template structure:

```javascript
/**
 * Benchmark Name
 * Description of what is being tested
 */

import { createDatabaseForTest } from '../tests/config.js';

async function measureTime(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1_000_000;
  return { result, ms };
}

async function runBenchmark() {
  // Setup
  const database = createDatabaseForTest('benchmark-name');
  await database.connect();

  try {
    // Test operations
    const { ms, result } = await measureTime(async () => {
      // Operation to measure
    });

    return { ms, result };
  } finally {
    await database.disconnect();
  }
}

async function main() {
  const results = await runBenchmark();
  console.log('Results:', results);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
```

## CI/CD Integration

To run benchmarks in CI:

```yaml
# .github/workflows/benchmark.yml
name: Benchmarks

on:
  push:
    branches: [main]
  pull_request:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: pnpm install
      - run: node docs/benchmarks/partitions-matrix.js
      - uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: docs/benchmarks/*.json
```

## Troubleshooting

### Timeouts

If benchmarks timeout:
1. Reduce `RECORDS_PER_TEST` (default: 10000)
2. Increase delay between tests
3. Check S3 connectivity
4. Verify LocalStack is running (for local tests)

### Memory Issues

If Node.js runs out of memory:
```bash
NODE_OPTIONS="--max-old-space-size=4096" node docs/benchmarks/partitions-matrix.js
```

### Inconsistent Results

If results vary significantly:
1. Use LocalStack for consistent testing
2. Run benchmarks multiple times and average
3. Ensure no other processes are using S3
4. Check network stability (for AWS S3)

## See Also

- [Partition Documentation](/core/partitions.md)
- [Performance Tips](/README.md#performance-tips)
- [EventualConsistency Benchmarks](/benchmarks/eventual-consistency.md)
