# S3DB Benchmarks

Performance benchmarks for s3db.js features and operations.

## Available Benchmarks

### Partitions Matrix Benchmark

Tests partition performance across a matrix of configurations.

**File**: `partitions-matrix.js`

**Test Matrix**:
- **Partitions**: 0 to 10 (11 configurations)
- **Attributes per partition**: 1 to 10 (10 configurations)
- **Total tests**: 110 combinations
- **Records per test**: 1,000

**Measurements**:
- ✅ Resource creation time
- ✅ Bulk insert performance (1,000 records)
- ✅ Query by partition (filtered)
- ✅ Full scan query (no filter)
- ✅ Insert throughput (records/second)

**Configuration**:
```javascript
{
  recordsPerTest: 1000,
  asyncPartitions: true,  // Async indexing enabled
  batchSize: 100          // Insert batch size
}
```

## Running Benchmarks

### Prerequisites

Before running benchmarks, ensure you have:

1. **S3 Connection configured** via environment variable:
   ```bash
   export BUCKET_CONNECTION_STRING="http://minioadmin:minioadmin123@localhost:9100/s3db"
   ```

2. **LocalStack or MinIO running** (for local testing):
   ```bash
   # MinIO example
   docker run -d -p 9100:9000 minio/minio server /data
   ```

3. Or use AWS S3:
   ```bash
   export BUCKET_CONNECTION_STRING="s3://ACCESS_KEY:SECRET_KEY@bucket-name/path"
   ```

### Run Partitions Benchmark

**Full benchmark** (110 tests, ~60-120 minutes):
```bash
pnpm run benchmark:partitions
# or
node benchmarks/partitions-matrix.js
```

**Quick test** (modify constants in file for faster testing):
```javascript
// Edit benchmarks/partitions-matrix.js
const RECORDS_PER_TEST = 100;  // Reduce from 1000
// Change loop ranges for faster testing
for (let numPartitions = 0; numPartitions <= 2; numPartitions++) {
  for (let numAttributes = 1; numAttributes <= 3; numAttributes++) {
    // Only tests 3x3 = 9 combinations instead of 11x10 = 110
```

**Expected output**:
```
🚀 Starting Partitions Performance Benchmark

Configuration:
- Records per test: 1000
- Partitions range: 0 to 10
- Attributes per partition range: 1 to 10
- Async partitioning: Enabled

⏳ Progress: 110/110 (100.0%) - Testing 10p/10a...

✅ Benchmark Complete!

================================================================================
PARTITIONS PERFORMANCE BENCHMARK RESULTS
================================================================================

📊 0 Partitions (No Partitioning)
--------------------------------------------------------------------------------
Attrs    Create(ms)  Insert(ms)  Insert/sec  Query Part(ms)  Part Records  Query Full(ms)  Total Records
--------------------------------------------------------------------------------
1        245.12      3421.56     292         N/A             0             124.45          1000
2        268.34      3534.78     283         N/A             0             128.91          1000
...

📊 5 Partitions (5 partition dimensions)
--------------------------------------------------------------------------------
Attrs    Create(ms)  Insert(ms)  Insert/sec  Query Part(ms)  Part Records  Query Full(ms)  Total Records
--------------------------------------------------------------------------------
1        312.45      3678.23     272         45.12           100           156.78          1000
2        334.67      3789.45     264         48.34           100           162.34          1000
...

📈 Summary Statistics:
------------------------------------------------------------
Average Insert Time: 3621.45ms (276 records/sec)
Insert Time Range: 3421.56ms - 4234.12ms
Average Query by Partition: 52.34ms
Average Full Scan Query: 145.67ms
Total Tests: 110/110 successful

🏆 Best Insert Performance:
   0 partitions, 1 attributes: 3421.56ms (292 rec/sec)

🐌 Worst Insert Performance:
   10 partitions, 10 attributes: 4234.12ms (236 rec/sec)

💾 Results exported to benchmarks/partitions-results.json

⏱️  Total benchmark time: 12.34 minutes
```

### Results Output

Results are automatically exported to:
- **Console**: Formatted tables with statistics
- **JSON file**: `benchmarks/partitions-results.json`

**JSON Structure**:
```json
{
  "timestamp": "2025-10-13T...",
  "configuration": {
    "recordsPerTest": 1000,
    "partitionRange": [0, 10],
    "attributeRange": [1, 10],
    "asyncPartitions": true
  },
  "results": [
    {
      "numPartitions": 0,
      "numAttributes": 1,
      "createMs": "245.12",
      "insertMs": "3421.56",
      "insertPerSecond": "292",
      "queryPartitionMs": "N/A",
      "queryPartitionCount": 0,
      "queryFullMs": "124.45",
      "totalCount": 1000,
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
const RECORDS_PER_TEST = 1000;  // Number of records to insert
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

2. **Insert Time**: Time to insert 1,000 records
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

### Performance Recommendations

Based on benchmark results:

**0-2 partitions**:
- ✅ Best write performance
- ✅ Simplest schema
- ❌ Slower queries on large datasets

**3-5 partitions**:
- ✅ Balanced performance
- ✅ Good query filtering
- ⚠️ Moderate write overhead

**6+ partitions**:
- ⚠️ Slower writes
- ✅ Excellent query filtering
- ⚠️ Complex schema management

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
      - run: node benchmarks/partitions-matrix.js
      - uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: benchmarks/*.json
```

## Troubleshooting

### Timeouts

If benchmarks timeout:
1. Reduce `RECORDS_PER_TEST` (default: 1000)
2. Increase delay between tests
3. Check S3 connectivity
4. Verify LocalStack is running (for local tests)

### Memory Issues

If Node.js runs out of memory:
```bash
NODE_OPTIONS="--max-old-space-size=4096" node benchmarks/partitions-matrix.js
```

### Inconsistent Results

If results vary significantly:
1. Use LocalStack for consistent testing
2. Run benchmarks multiple times and average
3. Ensure no other processes are using S3
4. Check network stability (for AWS S3)

## See Also

- [Partition Documentation](../docs/partitions.md)
- [Performance Tips](../README.md#performance-tips)
- [EventualConsistency Benchmarks](../docs/benchmarks/eventual-consistency.md)
