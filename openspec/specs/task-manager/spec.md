# task-manager Specification

## Purpose
TBD - created by archiving change add-operation-pool-and-task-manager. Update Purpose after archive.
## Requirements
### Requirement: Batch Processing API
The TaskManager SHALL provide a process() method to execute an array of items through a processor function with configurable concurrency, returning results and errors.

#### Scenario: Process items successfully
- **WHEN** TaskManager processes 100 items with concurrency: 10
- **THEN** maximum 10 processor functions SHALL execute concurrently
- **AND** results array SHALL contain all successful results
- **AND** errors array SHALL contain all failed items with errors

#### Scenario: Process with progress callback
- **WHEN** process() is called with onProgress callback
- **THEN** callback SHALL be invoked after each item completes
- **AND** callback SHALL receive item and stats (processedCount, totalCount, percentage)

#### Scenario: Process with item callbacks
- **WHEN** process() is called with onItemComplete and onItemError callbacks
- **THEN** onItemComplete SHALL be called for successful items
- **AND** onItemError SHALL be called for failed items

### Requirement: Single Task Enqueuing
The TaskManager SHALL provide an enqueue() method to add individual tasks to the queue with priority, retry, and timeout support.

#### Scenario: Enqueue single task
- **WHEN** user calls `enqueue(async () => result, { priority: 10 })`
- **THEN** task SHALL be added to queue with priority 10
- **AND** Promise SHALL resolve when task completes

#### Scenario: Enqueue respects queue capacity
- **WHEN** queue has max capacity and enqueue() is called
- **THEN** behavior SHALL follow backpressure strategy (reject, wait, or drop-oldest)

### Requirement: Iterable and Generator Support
The TaskManager SHALL provide processIterable() method to process items from iterables and async generators without loading all items into memory.

#### Scenario: Process async generator
- **WHEN** processIterable() receives async generator yielding 10000 items
- **THEN** items SHALL be consumed incrementally
- **AND** memory usage SHALL remain constant
- **AND** SHALL NOT load all 10000 items at once

#### Scenario: Stop processing iterable early
- **WHEN** stop() is called during iterable processing
- **THEN** no more items SHALL be consumed from iterable
- **AND** active tasks SHALL complete

### Requirement: Corresponding Results
The TaskManager SHALL provide processCorresponding() method to maintain source-to-result index alignment using symbols for failed/skipped items.

#### Scenario: Preserve result order with failures
- **WHEN** processCorresponding() processes [item1, item2, item3, item4]
- **AND** item2 fails and item4 is not processed (stopped early)
- **THEN** results SHALL be [result1, TaskManager.failed, result3, TaskManager.notRun]

#### Scenario: Symbol values for status
- **WHEN** accessing result array from processCorresponding()
- **THEN** TaskManager.failed symbol SHALL mark failed items
- **AND** TaskManager.notRun symbol SHALL mark unprocessed items

### Requirement: Retry Logic with Backoff
The TaskManager SHALL retry failed tasks using exponential backoff for retryable errors, matching OperationPool retry behavior.

#### Scenario: Retry transient error
- **WHEN** task fails with retryable error
- **AND** retries: 3 is configured
- **THEN** task SHALL retry up to 3 times with exponential delays

#### Scenario: Retry delay calculation
- **WHEN** task is retried
- **THEN** delay SHALL be retryDelay * 2^attempt (1s, 2s, 4s for retryDelay: 1000)

### Requirement: Per-Task Timeout
The TaskManager SHALL enforce configurable timeout per task with automatic cancellation and timeout error.

#### Scenario: Task exceeds timeout
- **WHEN** task execution time exceeds configured timeout
- **THEN** task SHALL be cancelled with TimeoutError
- **AND** error message SHALL include task ID and timeout duration

### Requirement: Priority Queue
The TaskManager SHALL order tasks by priority where higher values execute first, with FIFO order for same-priority tasks.

#### Scenario: High priority executes first
- **WHEN** queue contains tasks with priorities [0, 0, 100, 0]
- **THEN** task with priority 100 SHALL execute before priority 0 tasks

### Requirement: Lifecycle Control
The TaskManager SHALL provide pause(), resume(), stop(), drain(), and destroy() methods for lifecycle management.

#### Scenario: Pause suspends new tasks
- **WHEN** pause() is called
- **THEN** no new tasks SHALL start
- **AND** active tasks SHALL complete
- **AND** pause() SHALL resolve when active tasks finish

#### Scenario: Resume restarts processing
- **WHEN** paused TaskManager calls resume()
- **THEN** queued tasks SHALL begin processing
- **AND** 'resumed' event SHALL be emitted

#### Scenario: Stop cancels pending tasks
- **WHEN** stop() is called with 50 queued tasks
- **THEN** all queued tasks SHALL be rejected with cancellation error
- **AND** 'stopped' event SHALL be emitted

#### Scenario: Drain waits for completion
- **WHEN** drain() is called
- **THEN** SHALL wait for all queued and active tasks to complete
- **AND** SHALL resolve only when queue is empty

#### Scenario: Destroy cleans up resources
- **WHEN** destroy() is called
- **THEN** SHALL call stop()
- **AND** SHALL remove all event listeners
- **AND** SHALL prepare instance for garbage collection

### Requirement: Dynamic Concurrency Adjustment
The TaskManager SHALL allow concurrency changes at runtime via setConcurrency() method.

#### Scenario: Increase concurrency during processing
- **WHEN** setConcurrency(20) is called while processing with concurrency: 10
- **THEN** up to 20 tasks SHALL execute concurrently
- **AND** additional slots SHALL be filled immediately

#### Scenario: Decrease concurrency during processing
- **WHEN** setConcurrency(5) is called while 10 tasks are active
- **THEN** no new tasks SHALL start until active count drops below 5

### Requirement: Statistics and Progress Tracking
The TaskManager SHALL provide getStats() and getProgress() methods for monitoring task execution.

#### Scenario: Get current statistics
- **WHEN** getStats() is called
- **THEN** response SHALL include queueSize, activeCount, processedCount, errorCount, retryCount

#### Scenario: Get progress percentage
- **WHEN** getProgress() is called during processing
- **THEN** response SHALL include total, completed, pending, active, percentage

### Requirement: Event Emitters
The TaskManager SHALL emit events for task lifecycle (taskStart, taskComplete, taskError, taskRetry, drained, paused, resumed, stopped).

#### Scenario: Task events emitted
- **WHEN** task lifecycle progresses
- **THEN** appropriate events SHALL be emitted with task metadata

### Requirement: Static Convenience Methods
The TaskManager SHALL provide static methods for one-liner batch processing without manual lifecycle management.

#### Scenario: Static process() method
- **WHEN** user calls `TaskManager.process(items, processor, options)`
- **THEN** TaskManager SHALL be created, execute batch, and destroy automatically
- **AND** SHALL return {results, errors}

#### Scenario: Static withConcurrency() builder
- **WHEN** user calls `TaskManager.withConcurrency(5)`
- **THEN** SHALL return new TaskManager instance with concurrency: 5

### Requirement: Reset Functionality
The TaskManager SHALL provide reset() method to clear state and prepare for reuse.

#### Scenario: Reset clears state
- **WHEN** reset() is called after processing
- **THEN** queue SHALL be empty
- **AND** stats SHALL reset to zero
- **AND** taskMetrics SHALL be cleared
- **AND** instance SHALL be ready for new batch

### Requirement: Retryable Error Configuration
The TaskManager SHALL accept retryableErrors list to control which errors trigger retries, defaulting to retry all errors.

#### Scenario: Retry only specific errors
- **WHEN** retryableErrors: ['NetworkError'] is configured
- **AND** task fails with ValidationError
- **THEN** task SHALL NOT be retried

#### Scenario: Default retry all errors
- **WHEN** no retryableErrors list is provided
- **THEN** all errors SHALL be considered retryable

### Requirement: Export and Usage
The TaskManager SHALL be exported from s3db.js for standalone usage independent of database operations.

#### Scenario: Import and use TaskManager
- **WHEN** user imports `import { TaskManager } from 's3db.js'`
- **THEN** TaskManager SHALL be available for use
- **AND** SHALL work without Database instance

#### Scenario: Use with custom workflow
- **WHEN** TaskManager processes items with custom multi-step logic
- **THEN** SHALL handle any async operation, not just database operations

