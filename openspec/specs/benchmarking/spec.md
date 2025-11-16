# benchmarking Specification

## Purpose
TBD - created by archiving change add-operation-pool-and-task-manager. Update Purpose after archive.
## Requirements
### Requirement: Benchmark Class
The Benchmark class SHALL provide timing utilities for measuring function execution with support for single runs, repeated measurements, and percentile calculations.

#### Scenario: Single measurement
- **WHEN** user calls `benchmark.measure(async () => operation)`
- **THEN** function SHALL execute once
- **AND** elapsed time SHALL be recorded
- **AND** result SHALL be returned

#### Scenario: Repeated measurements with statistics
- **WHEN** user calls `measureRepeated(fn, 100)`
- **THEN** function SHALL execute 100 times
- **AND** response SHALL include iterations, results array, avg, min, max, p50, p95, p99

#### Scenario: Report generation
- **WHEN** benchmark.report() is called
- **THEN** formatted output SHALL be logged with name, duration, runs, avg/min/max

### Requirement: Quick Benchmark Helper
A standalone benchmark() helper function SHALL provide one-liner timing with automatic reporting.

#### Scenario: Quick benchmark
- **WHEN** user calls `await benchmark('operation name', async () => fn())`
- **THEN** function SHALL execute and time
- **AND** report SHALL be automatically logged
- **AND** Benchmark instance SHALL be returned

### Requirement: PerformanceMonitor Class
The PerformanceMonitor class SHALL collect periodic snapshots of task queue performance, system metrics, and aggregate statistics for production monitoring.

#### Scenario: Start monitoring
- **WHEN** monitor.start(10000) is called
- **THEN** snapshots SHALL be taken every 10 seconds
- **AND** each snapshot SHALL include taskQueue stats, performance metrics, system memory/CPU

#### Scenario: Snapshot collection
- **WHEN** snapshot is taken
- **THEN** SHALL include timestamp, taskQueue.queueSize, taskQueue.activeCount
- **AND** SHALL include performance.avgExecution, performance.p95Execution
- **AND** SHALL include system.memoryUsage, system.cpuUsage

#### Scenario: Snapshot retention limit
- **WHEN** snapshots exceed 100 entries
- **THEN** oldest snapshot SHALL be removed automatically

#### Scenario: Stop monitoring
- **WHEN** monitor.stop() is called
- **THEN** periodic snapshots SHALL cease

### Requirement: Performance Report Generation
The PerformanceMonitor SHALL provide getReport() method to aggregate metrics across all snapshots.

#### Scenario: Generate aggregate report
- **WHEN** getReport() is called after 1 hour of monitoring
- **THEN** response SHALL include duration, totalProcessed, totalErrors
- **AND** SHALL include avgQueueSize, avgConcurrency, avgLatency, p95Latency
- **AND** SHALL include avgMemoryMB, peakMemoryMB

### Requirement: Comparison Benchmark Tests
Benchmark tests SHALL compare performance before and after OperationPool implementation with statistical validation.

#### Scenario: Bulk insert comparison
- **WHEN** comparison test runs bulk insert with and without OperationPool
- **THEN** test SHALL measure duration, memory usage, error count for both
- **AND** SHALL calculate percentage improvement
- **AND** SHALL log detailed comparison report

#### Scenario: Concurrent requests comparison
- **WHEN** comparison test runs 3 concurrent bulks with and without OperationPool
- **THEN** test SHALL prove global concurrency control effectiveness
- **AND** SHALL show reduced memory and errors with OperationPool

### Requirement: Auto-Tuning Convergence Test
A benchmark test SHALL demonstrate auto-tuning behavior by running increasing batch sizes and tracking concurrency adjustments.

#### Scenario: Track auto-tuning convergence
- **WHEN** test runs batches of [50, 100, 200, 500, 1000] items
- **THEN** SHALL record concurrency value after each batch
- **AND** SHALL demonstrate gradual increase to optimal concurrency
- **AND** SHALL output table showing batchSize, duration, concurrency, avgLatency

### Requirement: Export Benchmarking Utilities
The benchmark utilities SHALL be exported from s3db.js for external use.

#### Scenario: Import benchmarking tools
- **WHEN** user imports `import { Benchmark, benchmark, PerformanceMonitor } from 's3db.js'`
- **THEN** all tools SHALL be available
- **AND** SHALL work with any async operations, not just s3db operations

### Requirement: Percentile Calculation
The Benchmark class SHALL provide accurate percentile calculations (p50, p95, p99) for timing arrays.

#### Scenario: Calculate p95 latency
- **WHEN** percentile(results, 0.95) is called on timing array
- **THEN** SHALL sort array and return value at 95th percentile index
- **AND** calculation SHALL be accurate for arrays of any size

