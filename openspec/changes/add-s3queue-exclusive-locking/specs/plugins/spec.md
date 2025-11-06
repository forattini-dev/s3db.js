# S3 Queue Exclusive Locking

**Capability:** plugins
**Change:** add-s3queue-exclusive-locking
**Type:** ADDED

## ADDED Requirements
### Requirement: Exclusive Message Acquisition
The S3QueuePlugin MUST ensure only one consumer processes a message at a time by applying a distributed lock before handing the payload to the worker.

#### Scenario: Acquire message exclusively
- **Given** two workers poll the same queue concurrently
- **When** both request the same pending message
- **Then** exactly one worker obtains a lock token bound to that message metadata
- **And** the other worker MUST skip that message without receiving its payload

#### Scenario: Lock visibility timeout
- **Given** a worker holds a lock token
- **When** the worker does not acknowledge completion within the configured visibility timeout
- **Then** the lock MUST expire
- **And** the message MUST become available for other workers to re-acquire

### Requirement: Lock Lifecycle Management
The plugin MUST persist lock metadata (token, owner, expiration) alongside the message and update it atomically during processing.

#### Scenario: Release lock on success
- **Given** a worker completes processing successfully
- **When** it acknowledges the message
- **Then** the plugin MUST remove the lock metadata
- **And** transition the message to a terminal `processed` status

#### Scenario: Release lock on failure
- **Given** a worker reports a processing failure
- **When** the plugin handles the failure outcome
- **Then** the lock metadata MUST be cleared or replaced according to the configured failure strategy

### Requirement: Failure Routing Strategy
The plugin MUST support configurable routing for failed messages: retry the original queue, route to a dead-letter queue, or both (retry up to N times, then dead-letter).

#### Scenario: Retry to original queue
- **Given** a queue configured with `failureStrategy: { mode: 'retry', maxRetries: 5 }`
- **When** a message fails while `retryCount < maxRetries`
- **Then** the plugin MUST increment the retry counter
- **And** requeue the message with a new visibility timeout

#### Scenario: Route to dead-letter queue
- **Given** a queue configured with `failureStrategy: { mode: 'dead-letter', deadLetterQueue: 'tasks_dlq' }`
- **When** a message fails processing
- **Then** the plugin MUST move the message to the configured dead-letter queue resource
- **And** annotate the message with failure metadata (reason, retries, timestamp)

#### Scenario: Retry then dead-letter
- **Given** a queue configured with `failureStrategy: { mode: 'hybrid', maxRetries: 3, deadLetterQueue: 'tasks_dlq' }`
- **When** a message fails and the retry counter reaches `maxRetries`
- **Then** the plugin MUST move the message to the dead-letter queue instead of requeuing it

### Requirement: Queue Ordering Modes
The plugin MUST support a configurable message ordering mode with `fifo` as the default and `lifo` available when explicitly requested.

#### Scenario: Default FIFO ordering
- **Given** a queue is created without specifying an ordering mode
- **When** multiple messages are enqueued sequentially
- **Then** consumers MUST receive them in the same order they were enqueued

#### Scenario: LIFO ordering
- **Given** a queue configured with `orderingMode: 'lifo'`
- **When** multiple messages are enqueued sequentially
- **Then** consumers MUST receive the most recently enqueued message first

#### Scenario: Reject unsupported ordering
- **Given** a queue is configured with `orderingMode: 'random'`
- **When** the plugin initializes
- **Then** it MUST throw a configuration error indicating the ordering mode is invalid

### Requirement: Ordering Guarantees
The plugin MUST allow operators to opt into strict ordering guarantees or relax ordering for higher throughput, and it MUST clearly document the behavior for each mode.

#### Scenario: Strict ordering guarantee
- **Given** a queue configured with `orderingGuarantee: true`
- **When** workers consume messages under FIFO mode
- **Then** the plugin MUST deliver messages strictly in enqueue order, even across retries and visibility timeouts

#### Scenario: Best-effort ordering
- **Given** a queue configured with `orderingGuarantee: false`
- **When** multiple workers process the queue concurrently
- **Then** the plugin MAY deliver messages out of order
- **And** it MUST emit diagnostics indicating ordering is best-effort

### Requirement: Failure Outcome Introspection
The plugin MUST expose hooks or events so operators can observe whether messages were retried or dead-lettered.

#### Scenario: Emit processing outcome event
- **Given** a message completes with either success or failure
- **When** the plugin transitions the message status
- **Then** it MUST emit an event including the message identifier, final status (`processed`, `retrying`, `dead-lettered`), and attempt count

### Requirement: High-Concurrency Safety
The plugin MUST preserve exclusive processing without duplication even when hundreds of consumers compete for the same queue.

#### Scenario: 100 concurrent consumers
- **Given** 100 worker pods poll the same queue simultaneously
- **When** a single pending message becomes available
- **Then** exactly one worker MUST acquire the lock token
- **And** the remaining workers MUST observe the message as unavailable until the lock releases

#### Scenario: Lock token uniqueness
- **Given** multiple lock attempts occur within the visibility window
- **When** the plugin issues lock tokens
- **Then** each token MUST be globally unique and bound to the specific message version (eTag or equivalent)
- **And** duplicate or stale tokens MUST be rejected

### Requirement: Lock Renewal
The plugin MUST allow workers to renew a lock before the visibility timeout expires to avoid unintended retries during long-running processing.

#### Scenario: Renew lock before timeout
- **Given** a worker holds a lock with a 30-second visibility timeout
- **When** the worker calls `renewLock` at 20 seconds
- **Then** the plugin MUST extend the lock expiration atomically
- **And** the message MUST remain hidden from other workers until the new expiration

#### Scenario: Prevent renewal after release
- **Given** a worker releases a lock after acknowledging success
- **When** it attempts to call `renewLock` again
- **Then** the plugin MUST reject the renewal because the lock no longer exists
