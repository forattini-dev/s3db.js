## Why
- Ensure S3QueuePlugin enforces single-consumer message ownership to avoid duplicate processing across distributed workers.
- Clarify failure handling so operators know when messages are retried vs moved to a dead-letter queue.
- Document locking semantics to align implementation with documented guarantees.

## What Changes
- Define exclusive message acquisition via optimistic locking with visibility windows.
- Specify configurable failure handling: retry, requeue, or dead-letter routing.
- Capture lock lifecycle, release conditions, and monitoring requirements for consumers.

## Impact
- Guides implementation updates to S3QueuePlugin and related docs/tests.
- May require schema or metadata adjustments to persist lock state and retry counters.
- Communicates new operational expectations to downstream services using S3QueuePlugin.

## Open Questions
- Should lock timeouts be configurable per queue or per message type?
- Do we need admin tooling to replay dead-letter messages back into the primary queue?
