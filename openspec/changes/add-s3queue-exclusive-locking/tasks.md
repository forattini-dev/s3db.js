## 1. Specification
- [ ] 1.1 Validate no existing s3-queue spec conflicts
- [ ] 1.2 Draft locking and dead-letter requirements with scenarios
- [ ] 1.3 Run `openspec validate add-s3queue-exclusive-locking --strict`

## 2. Implementation
- [ ] 2.1 Update S3QueuePlugin to enforce exclusive locks
- [ ] 2.2 Add configuration for failure routing (retry vs dead-letter)
- [ ] 2.3 Expand tests covering lock acquisition, retries, and DLQ routing
- [ ] 2.4 Update plugin docs with new behaviors and configuration samples
- [ ] 2.5 Implement configurable FIFO/LIFO ordering with validation
- [ ] 2.6 Support ordering guarantee toggle and related diagnostics
- [ ] 2.7 Add lock renewal API and prevent stale token reuse
- [ ] 2.8 Load-test locking with ≥100 concurrent workers to verify exclusivity

## 3. Rollout
- [ ] 3.1 Provide migration guidance for existing queues (metadata updates)
- [ ] 3.2 Monitor production queues for duplicate processing events post-deploy
