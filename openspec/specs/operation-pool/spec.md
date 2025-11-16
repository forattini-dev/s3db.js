# operation-pool Specification

## Purpose
TBD - created by archiving change add-operation-pool-and-task-manager. Update Purpose after archive.
## Requirements
### Requirement: Global Operation Queueing
The S3Client and MemoryClient SHALL use an OperationPool to control concurrency of all S3 operations (putObject, getObject, headObject, deleteObject, copyObject, listObjectsV2) with a configurable maximum number of concurrent operations.

#### Scenario: Bulk insert respects concurrency limit
- **WHEN** user calls `insertMany([...100 items])` with `operationPool.concurrency: 10`
- **THEN** maximum 10 putObject operations SHALL execute concurrently
- **AND** remaining 90 operations SHALL queue and execute as slots become available

#### Scenario: Concurrent requests share global pool
- **WHEN** 3 concurrent bulk operations arrive (100 + 50 + 100 items)
- **THEN** total concurrent S3 operations SHALL NOT exceed configured concurrency limit
- **AND** all 250 operations SHALL complete successfully

#### Scenario: Single operation passes through quickly
- **WHEN** user calls `insert(singleItem)` with empty queue
- **THEN** operation SHALL execute immediately without waiting
- **AND** overhead SHALL be less than 1ms

### Requirement: Retry Logic with Exponential Backoff
The OperationPool SHALL automatically retry failed operations using exponential backoff for configurable retryable error types.

#### Scenario: Transient error retried successfully
- **WHEN** putObject fails with `ServiceUnavailable` error
- **AND** `retries: 3` is configured
- **THEN** operation SHALL retry up to 3 times with exponential backoff
- **AND** delays SHALL be 1s, 2s, 4s (base 1000ms * 2^attempt)

#### Scenario: Non-retryable error fails immediately
- **WHEN** putObject fails with `NoSuchBucket` error
- **AND** error is not in `retryableErrors` list
- **THEN** operation SHALL fail immediately without retry

#### Scenario: Max retries exhausted
- **WHEN** operation fails 4 times (initial + 3 retries)
- **THEN** operation SHALL reject with last error
- **AND** error SHALL include retry count in metadata

### Requirement: Per-Operation Timeout
The OperationPool SHALL enforce a configurable timeout per operation with automatic cancellation.

#### Scenario: Operation completes within timeout
- **WHEN** putObject executes in 500ms with `timeout: 5000` configured
- **THEN** operation SHALL complete successfully

#### Scenario: Operation exceeds timeout
- **WHEN** getObject takes longer than configured `timeout: 3000`
- **THEN** operation SHALL be cancelled with TimeoutError
- **AND** error message SHALL include timeout duration and task ID

#### Scenario: Timeout cleared on completion
- **WHEN** operation completes successfully
- **THEN** timeout timer SHALL be cleared to prevent memory leak

### Requirement: Priority Queue Support
The OperationPool SHALL support priority-based task ordering where higher priority tasks execute before lower priority tasks.

#### Scenario: High priority task jumps queue
- **WHEN** 50 normal priority tasks are queued
- **AND** 1 critical priority task (priority: 100) is enqueued
- **THEN** critical task SHALL execute before queued normal tasks
- **AND** normal tasks SHALL maintain FIFO order among same priority

#### Scenario: Default priority is zero
- **WHEN** task is enqueued without explicit priority
- **THEN** task priority SHALL default to 0

### Requirement: Adaptive Auto-Tuning
The OperationPool SHALL optionally adjust concurrency dynamically based on observed latency, throughput, and memory usage with a configurable adjustment interval.

#### Scenario: Auto-tuning increases concurrency on good performance
- **WHEN** average latency is below target (< 100ms) for 10+ tasks
- **AND** memory usage is below target (< 60% of targetMemoryPercent)
- **THEN** concurrency SHALL increase by 20%
- **AND** adjustment SHALL occur at next adjustment interval (5s)

#### Scenario: Auto-tuning decreases concurrency on memory pressure
- **WHEN** average memory usage exceeds `targetMemoryPercent: 0.7` (70%)
- **THEN** concurrency SHALL decrease by 20%
- **AND** reason SHALL be logged as "memory pressure"

#### Scenario: Auto-tuning respects min/max bounds
- **WHEN** auto-tuning calculates new concurrency below `minConcurrency: 1`
- **THEN** concurrency SHALL be clamped to minConcurrency
- **WHEN** auto-tuning calculates new concurrency above `maxConcurrency: 100`
- **THEN** concurrency SHALL be clamped to maxConcurrency

#### Scenario: Auto-tuning warm-up period
- **WHEN** less than 10 tasks have completed
- **THEN** auto-tuning SHALL NOT adjust concurrency
- **AND** SHALL collect metrics for initial assessment

### Requirement: Metrics Collection
The OperationPool SHALL collect timing and performance metrics for all operations including queue wait time, execution time, retry count, and error count.

#### Scenario: Task metrics recorded on completion
- **WHEN** operation completes successfully
- **THEN** metrics SHALL include queueWait, execution, total timing
- **AND** metrics SHALL include heapDelta (memory used)
- **AND** metrics SHALL be stored with task ID

#### Scenario: Aggregate metrics available
- **WHEN** user calls `getAggregateMetrics(since)`
- **THEN** response SHALL include avgQueueWait, avgExecution, p50, p95, p99 latencies
- **AND** response SHALL include errorRate, avgRetries, avgHeapDelta

#### Scenario: Metrics cleanup to prevent memory leak
- **WHEN** task metrics exceed 1000 entries
- **THEN** oldest entries SHALL be removed automatically

### Requirement: Event Emitters for Monitoring
The OperationPool SHALL emit events for task lifecycle (start, complete, error, retry) to enable external monitoring.

#### Scenario: Task start event emitted
- **WHEN** operation begins execution
- **THEN** 'taskStart' event SHALL be emitted with task metadata

#### Scenario: Task error event emitted
- **WHEN** operation fails after all retries
- **THEN** 'taskError' event SHALL be emitted with task and error

#### Scenario: Task retry event emitted
- **WHEN** operation is retried
- **THEN** 'taskRetry' event SHALL be emitted with task and attempt number

### Requirement: Queue Control Methods
The OperationPool SHALL provide methods to pause, resume, stop, drain, and adjust concurrency at runtime.

#### Scenario: Pause queue waits for active tasks
- **WHEN** user calls `pause()`
- **THEN** no new tasks SHALL start from queue
- **AND** active tasks SHALL complete
- **AND** pause() SHALL resolve when all active tasks finish

#### Scenario: Resume queue restarts processing
- **WHEN** queue is paused and user calls `resume()`
- **THEN** queued tasks SHALL begin processing immediately

#### Scenario: Drain waits for all tasks
- **WHEN** user calls `drain()`
- **THEN** method SHALL wait for queue to empty
- **AND** method SHALL wait for all active tasks to complete
- **AND** 'drained' event SHALL be emitted

#### Scenario: Dynamic concurrency adjustment
- **WHEN** user calls `setConcurrency(20)` during operation
- **THEN** new concurrency limit SHALL apply immediately
- **AND** processing SHALL restart if previously at limit

### Requirement: Configuration via clientOptions
The OperationPool SHALL be configured via `clientOptions.operationPool` with support for connection string querystring parameters.

#### Scenario: Default configuration
- **WHEN** no operationPool config provided
- **THEN** OperationPool SHALL be enabled with concurrency: 'auto'
- **AND** retries: 3, retryDelay: 1000, timeout: 30000

#### Scenario: Connection string override
- **WHEN** connection string includes `?operationPool.concurrency=20&operationPool.retries=5`
- **THEN** OperationPool SHALL use concurrency: 20 and retries: 5
- **AND** SHALL override default values

#### Scenario: Disable OperationPool
- **WHEN** config includes `operationPool.enabled: false`
- **THEN** all operations SHALL bypass queue and execute directly
- **AND** behavior SHALL match pre-OperationPool implementation

### Requirement: Client Integration
The S3Client and MemoryClient SHALL wrap all storage operations through OperationPool with transparent API.

#### Scenario: All S3Client operations use pool
- **WHEN** any S3Client method is called (putObject, getObject, headObject, deleteObject, copyObject, listObjectsV2)
- **THEN** operation SHALL be enqueued in OperationPool
- **AND** SHALL return Promise that resolves when operation completes

#### Scenario: MemoryClient uses pool for consistency
- **WHEN** MemoryClient is instantiated
- **THEN** OperationPool SHALL be created with higher default concurrency (Infinity)
- **AND** operations SHALL pass through pool for API consistency

#### Scenario: Queue stats exposed via client
- **WHEN** user calls `db.client.getQueueStats()`
- **THEN** response SHALL include queueSize, activeCount, processedCount, errorCount, retryCount
- **AND** SHALL include current concurrency and auto-tuning state

