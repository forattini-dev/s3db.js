/**
 * Partitions Performance Benchmark
 *
 * Tests a matrix of:
 * - 0 to 10 partitions
 * - 1 to 10 attributes per partition
 *
 * Measures:
 * - Resource creation time
 * - Insert operations (1000 records)
 * - Query by partition (filtered)
 * - Query without filter (full scan)
 */

import { createDatabaseForTest } from '../tests/config.js';

const RECORDS_PER_TEST = 1000;
const PARTITION_FIELD_PREFIX = 'part';
const ATTRIBUTE_PREFIX = 'attr';

// Utility to measure execution time
async function measureTime(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1_000_000;
  return { result, ms };
}

// Generate partition configuration
function generatePartitions(numPartitions, numAttributes) {
  if (numPartitions === 0) return null;

  const partitions = {};

  for (let p = 0; p < numPartitions; p++) {
    const partitionName = `partition${p}`;
    const fields = {};

    for (let a = 0; a < numAttributes; a++) {
      const fieldName = `${PARTITION_FIELD_PREFIX}${p}_${ATTRIBUTE_PREFIX}${a}`;
      fields[fieldName] = 'string';
    }

    partitions[partitionName] = { fields };
  }

  return partitions;
}

// Generate resource attributes
function generateAttributes(numPartitions, numAttributes) {
  const attributes = {
    id: 'string|required',
    name: 'string|required',
    value: 'number|default:0'
  };

  // Add partition fields
  for (let p = 0; p < numPartitions; p++) {
    for (let a = 0; a < numAttributes; a++) {
      const fieldName = `${PARTITION_FIELD_PREFIX}${p}_${ATTRIBUTE_PREFIX}${a}`;
      attributes[fieldName] = 'string|required';
    }
  }

  return attributes;
}

// Generate test data
function generateRecords(numPartitions, numAttributes, count) {
  const records = [];

  for (let i = 0; i < count; i++) {
    const record = {
      id: `record-${i}`,
      name: `Test Record ${i}`,
      value: Math.floor(Math.random() * 1000)
    };

    // Add partition field values
    for (let p = 0; p < numPartitions; p++) {
      for (let a = 0; a < numAttributes; a++) {
        const fieldName = `${PARTITION_FIELD_PREFIX}${p}_${ATTRIBUTE_PREFIX}${a}`;
        // Distribute across partitions: use modulo to ensure even distribution
        record[fieldName] = `value${(i + a) % 10}`;
      }
    }

    records.push(record);
  }

  return records;
}

// Run a single benchmark test
async function runBenchmark(numPartitions, numAttributes) {
  const database = createDatabaseForTest(`bench-partitions-${numPartitions}p-${numAttributes}a`);

  try {
    await database.connect();

    const partitions = generatePartitions(numPartitions, numAttributes);
    const attributes = generateAttributes(numPartitions, numAttributes);

    // 1. Measure resource creation
    const { ms: createMs, result: resource } = await measureTime(async () => {
      return await database.createResource({
        name: 'test_resource',
        attributes,
        partitions,
        asyncPartitions: true // Use async partitioning for performance
      });
    });

    // 2. Measure bulk insert
    const records = generateRecords(numPartitions, numAttributes, RECORDS_PER_TEST);
    const { ms: insertMs } = await measureTime(async () => {
      // Insert in batches of 100 to avoid overwhelming S3
      const batchSize = 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await Promise.all(batch.map(record => resource.insert(record)));
      }
    });

    // 3. Measure query by partition (if partitions exist)
    let queryPartitionMs = 0;
    let queryPartitionCount = 0;
    if (numPartitions > 0) {
      const partitionField = `${PARTITION_FIELD_PREFIX}0_${ATTRIBUTE_PREFIX}0`;
      const { ms, result } = await measureTime(async () => {
        return await resource.query({
          [partitionField]: 'value0'
        });
      });
      queryPartitionMs = ms;
      queryPartitionCount = result.length;
    }

    // 4. Measure full scan query
    const { ms: queryFullMs, result: fullResults } = await measureTime(async () => {
      return await resource.query({});
    });

    // 5. Count total records
    const totalCount = await resource.count();

    return {
      numPartitions,
      numAttributes,
      createMs: createMs.toFixed(2),
      insertMs: insertMs.toFixed(2),
      insertPerSecond: (RECORDS_PER_TEST / (insertMs / 1000)).toFixed(0),
      queryPartitionMs: queryPartitionMs > 0 ? queryPartitionMs.toFixed(2) : 'N/A',
      queryPartitionCount,
      queryFullMs: queryFullMs.toFixed(2),
      totalCount,
      success: true
    };

  } catch (error) {
    return {
      numPartitions,
      numAttributes,
      error: error.message,
      success: false
    };
  } finally {
    if (database?.connected) {
      await database.disconnect();
    }
  }
}

// Run full matrix benchmark
async function runMatrixBenchmark() {
  console.log('🚀 Starting Partitions Performance Benchmark\n');
  console.log(`Configuration:`);
  console.log(`- Records per test: ${RECORDS_PER_TEST}`);
  console.log(`- Partitions range: 0 to 10`);
  console.log(`- Attributes per partition range: 1 to 10`);
  console.log(`- Async partitioning: Enabled\n`);

  const results = [];
  let completed = 0;
  const total = 11 * 10; // 11 partition configs (0-10) * 10 attribute configs (1-10)

  for (let numPartitions = 0; numPartitions <= 10; numPartitions++) {
    for (let numAttributes = 1; numAttributes <= 10; numAttributes++) {
      completed++;
      process.stdout.write(`\r⏳ Progress: ${completed}/${total} (${((completed/total)*100).toFixed(1)}%) - Testing ${numPartitions}p/${numAttributes}a...`);

      const result = await runBenchmark(numPartitions, numAttributes);
      results.push(result);

      // Small delay between tests to prevent overwhelming S3
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log('\n\n✅ Benchmark Complete!\n');

  return results;
}

// Format results as table
function formatResults(results) {
  console.log('=' .repeat(140));
  console.log('PARTITIONS PERFORMANCE BENCHMARK RESULTS');
  console.log('=' .repeat(140));
  console.log();

  // Group by number of partitions
  for (let p = 0; p <= 10; p++) {
    const partitionResults = results.filter(r => r.numPartitions === p && r.success);

    if (partitionResults.length === 0) continue;

    console.log(`\n📊 ${p} Partition${p !== 1 ? 's' : ''} (${p === 0 ? 'No Partitioning' : p + ' partition dimension' + (p > 1 ? 's' : '')})`);
    console.log('-'.repeat(140));
    console.log(
      'Attrs'.padEnd(8) +
      'Create(ms)'.padEnd(12) +
      'Insert(ms)'.padEnd(12) +
      'Insert/sec'.padEnd(12) +
      'Query Part(ms)'.padEnd(16) +
      'Part Records'.padEnd(14) +
      'Query Full(ms)'.padEnd(16) +
      'Total Records'
    );
    console.log('-'.repeat(140));

    partitionResults.forEach(r => {
      console.log(
        String(r.numAttributes).padEnd(8) +
        String(r.createMs).padEnd(12) +
        String(r.insertMs).padEnd(12) +
        String(r.insertPerSecond).padEnd(12) +
        String(r.queryPartitionMs).padEnd(16) +
        String(r.queryPartitionCount).padEnd(14) +
        String(r.queryFullMs).padEnd(16) +
        String(r.totalCount)
      );
    });
  }

  console.log('\n' + '='.repeat(140));

  // Summary statistics
  const successfulResults = results.filter(r => r.success);

  console.log('\n📈 Summary Statistics:');
  console.log('-'.repeat(60));

  const avgInsertMs = successfulResults.reduce((sum, r) => sum + parseFloat(r.insertMs), 0) / successfulResults.length;
  const avgInsertPerSec = successfulResults.reduce((sum, r) => sum + parseFloat(r.insertPerSecond), 0) / successfulResults.length;
  const minInsertMs = Math.min(...successfulResults.map(r => parseFloat(r.insertMs)));
  const maxInsertMs = Math.max(...successfulResults.map(r => parseFloat(r.insertMs)));

  const partitionResults = successfulResults.filter(r => r.numPartitions > 0);
  const avgQueryPartMs = partitionResults.reduce((sum, r) => sum + parseFloat(r.queryPartitionMs), 0) / partitionResults.length;

  const avgQueryFullMs = successfulResults.reduce((sum, r) => sum + parseFloat(r.queryFullMs), 0) / successfulResults.length;

  console.log(`Average Insert Time: ${avgInsertMs.toFixed(2)}ms (${avgInsertPerSec.toFixed(0)} records/sec)`);
  console.log(`Insert Time Range: ${minInsertMs.toFixed(2)}ms - ${maxInsertMs.toFixed(2)}ms`);
  console.log(`Average Query by Partition: ${avgQueryPartMs.toFixed(2)}ms`);
  console.log(`Average Full Scan Query: ${avgQueryFullMs.toFixed(2)}ms`);
  console.log(`Total Tests: ${successfulResults.length}/${results.length} successful`);

  // Find best and worst performers
  const bestInsert = successfulResults.reduce((best, r) =>
    parseFloat(r.insertMs) < parseFloat(best.insertMs) ? r : best
  );
  const worstInsert = successfulResults.reduce((worst, r) =>
    parseFloat(r.insertMs) > parseFloat(worst.insertMs) ? r : worst
  );

  console.log('\n🏆 Best Insert Performance:');
  console.log(`   ${bestInsert.numPartitions} partitions, ${bestInsert.numAttributes} attributes: ${bestInsert.insertMs}ms (${bestInsert.insertPerSecond} rec/sec)`);

  console.log('\n🐌 Worst Insert Performance:');
  console.log(`   ${worstInsert.numPartitions} partitions, ${worstInsert.numAttributes} attributes: ${worstInsert.insertMs}ms (${worstInsert.insertPerSecond} rec/sec)`);

  console.log('\n' + '='.repeat(60));

  // Errors if any
  const errors = results.filter(r => !r.success);
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(e => {
      console.log(`   ${e.numPartitions}p/${e.numAttributes}a: ${e.error}`);
    });
  }
}

// Main execution
async function main() {
  const startTime = Date.now();

  const results = await runMatrixBenchmark();
  formatResults(results);

  // Export JSON
  try {
    const fs = await import('fs');
    const data = {
      timestamp: new Date().toISOString(),
      configuration: {
        recordsPerTest: RECORDS_PER_TEST,
        partitionRange: [0, 10],
        attributeRange: [1, 10],
        asyncPartitions: true
      },
      results
    };

    fs.writeFileSync('benchmarks/partitions-results.json', JSON.stringify(data, null, 2));
    console.log(`\n💾 Results exported to benchmarks/partitions-results.json`);
  } catch (error) {
    console.error('\n⚠️  Failed to export JSON:', error.message);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  console.log(`\n⏱️  Total benchmark time: ${totalTime} minutes\n`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { runBenchmark, runMatrixBenchmark, formatResults };
