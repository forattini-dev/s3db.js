# Skipped Tests Analysis

Generated: 2025-11-01

## Executive Summary

**Total Skipped Tests: 115**

This document provides a comprehensive analysis of all skipped tests in the s3db.js codebase, categorizing them by reason and providing recommendations for resolution.

## Categories Overview

| Category | Count | Priority | Action Required |
|----------|-------|----------|-----------------|
| Other (Needs Investigation) | 99 | HIGH | Investigate each test |
| Flaky/Race Conditions | 7 | MEDIUM | Fix concurrency issues |
| TODO/Needs Fix | 3 | HIGH | Address known issues |
| External Dependencies | 3 | LOW | Keep skipped (optional features) |
| Known Bugs/Issues | 2 | HIGH | Fix schema recreation |
| Performance/Timeouts | 1 | MEDIUM | Optimize or increase timeout |

---

## Detailed Analysis by Category

### 1. TODO/Needs Fix (3 tests) ⚠️ HIGH PRIORITY

These tests have explicit TODO comments indicating work in progress.

#### Tests:
1. **memory-client.test.js**: `should work with partitions`
   - **Issue**: Partition listing returns empty
   - **Comment**: "TODO: Fix partition listing - getAllKeys works but listPartition returns empty"
   - **Action**: Debug partition listing in MemoryClient

2. **plugin-attribute-isolation.test.js**: `Orphaned Attributes (Graceful Degradation)`
   - **Issue**: Feature not fully implemented
   - **Comment**: "TODO: Graceful degradation for orphaned attributes (work in progress)"
   - **Action**: Complete graceful degradation implementation

3. **plugin-scheduler.test.js**: `should handle action errors with retries`
   - **Issue**: Infinite loop in retry logic
   - **Comment**: "TODO: Fix infinite loop in retry logic - test hangs indefinitely"
   - **Action**: Fix retry logic to prevent infinite loops

---

### 2. Known Bugs/Issues (2 tests) ⚠️ HIGH PRIORITY

#### Tests:
1. **memory-client-backup-compatibility.test.js**: `should import BackupPlugin-compatible format`
   - **Issue**: Schema recreation fix needed
   - **Action**: Fix schema recreation logic in MemoryClient

2. **memory-client-backup-compatibility.test.js**: `should preserve data integrity through export/import cycle`
   - **Issue**: Schema recreation fix needed
   - **Action**: Same as above - fix schema recreation

---

### 3. Flaky/Race Conditions (7 tests) ⚠️ MEDIUM PRIORITY

These tests exhibit non-deterministic behavior due to timing or concurrency issues.

#### Tests:
1. **all-types-exhaustive.test.js** (3 tests):
   - `should list records with ALL types`
   - `should partition by string status`
   - `should partition by geo coordinates`
   - **Action**: Investigate race conditions in exhaustive type testing

2. **plugin-s3-queue.test.js**: `S3QueuePlugin` (entire suite)
   - **Action**: Fix race conditions in queue processing

3. **eventual-consistency-multi-client-locks.test.js**: Lock acquisition/release cycle
   - **Action**: Improve lock acquisition test stability

4. **eventual-consistency-plugin-storage-locks.test.js**: PluginStorage locks suite
   - **Action**: Fix timing issues in plugin storage locks

5. **plugin-state-machine-event-triggers.test.js**: Event triggers suite
   - **Action**: Stabilize event trigger timing

---

### 4. External Dependencies (3 tests) ℹ️ LOW PRIORITY

These tests require external services (OAuth, JWT) and can remain skipped.

#### Tests:
1. **identity.plugin.test.js**: `IdentityPlugin - OAuth2/OIDC Authorization Server`
2. **api.plugin.security.test.js**: `JWT Driver - Security`
3. **api.plugin.auth-drivers.test.js**: `JWT Authentication Driver`

**Recommendation**: Keep skipped unless OAuth/JWT integration is required. Consider mocking for basic functionality tests.

---

### 5. Performance/Timeouts (1 test) ⚠️ MEDIUM PRIORITY

#### Test:
- **plugin-scheduler.test.js**: `should maintain correct statistics across multiple executions`
  - **Issue**: Test is slow
  - **Action**: Either optimize test or increase timeout threshold

---

### 6. Other - Needs Investigation (99 tests) ⚠️ HIGH PRIORITY

The majority of skipped tests fall into this category. Further investigation required.

#### High-Impact Files:

##### api.plugin.security.test.js (13 skips)
- **Pattern**: 13 entire test suites skipped
- **Recommendation**: Review if security tests are no longer relevant or need updating

##### plugin-scheduler.test.js (12 skips)
- **Tests Include**:
  - Job timeout handling
  - Success rate calculation
  - History filtering
  - Job rescheduling
  - Error hooks
  - Action execution errors
  - Exponential backoff
  - Edge cases (short timeouts, zero retries)
  - Statistics tracking
- **Recommendation**: Most appear to be complete tests that may have been temporarily skipped. Re-enable one by one and verify.

##### plugin-s3-queue-concurrent.test.js (7 skips)
- **Tests Include**:
  - Multiple concurrent workers
  - ETag locking race conditions
  - Visibility timeout handling
  - Work distribution
  - Mixed success/failure handling
  - Message ordering
  - High-volume processing (100+ messages)
- **Recommendation**: These appear to be concurrency tests. May require MemoryClient improvements or timing adjustments.

##### api-path-auth.test.js (4 skips)
- **Pattern**: 4 entire test suites skipped
- **Recommendation**: Review path authentication test relevance

##### recon.plugin.api.test.js (1 skip)
- **Reason**: `getApiRoutes()` method not implemented
- **Comment**: "This test was written for a future API integration that hasn't been implemented yet"
- **Recommendation**: Either implement the feature or remove the test

---

## Recommendations

### Immediate Actions (Next Sprint)

1. **Fix Known Bugs** (2 tests):
   - Fix MemoryClient schema recreation issue
   - This will unblock backup compatibility tests

2. **Address TODOs** (3 tests):
   - Fix SchedulerPlugin infinite loop in retry logic
   - Fix MemoryClient partition listing
   - Complete attribute isolation graceful degradation

3. **Investigate High-Skip Files**:
   - **plugin-scheduler.test.js** (12 skips): Re-enable tests one by one
   - **api.plugin.security.test.js** (13 skips): Determine if security tests are still needed
   - **plugin-s3-queue-concurrent.test.js** (7 skips): Fix concurrency issues

### Medium-Term Actions

4. **Fix Flaky Tests** (7 tests):
   - Add proper synchronization to race-prone tests
   - Consider using `waitFor` helpers or locks
   - Increase timeouts where appropriate

5. **Review "Other" Category**:
   - Systematically review each skipped test
   - Determine: Keep skip? Fix? Remove?
   - Document skip reasons inline

### Long-Term Actions

6. **External Dependency Tests** (3 tests):
   - Consider mocking OAuth/JWT for basic tests
   - Or keep skipped and document as optional

7. **Establish Skip Policy**:
   - All skips must have inline comment explaining why
   - Use tags: `[TODO]`, `[FLAKY]`, `[EXTERNAL]`, `[WIP]`
   - Regular review cycle (quarterly)

---

## Test Skip Best Practices

Going forward, all skipped tests should follow this format:

```javascript
// SKIP [CATEGORY]: Brief reason why this test is skipped
// TODO: What needs to be done to re-enable this test
// Related: Issue #123 or PR #456
it.skip('test description', async () => {
  // test code
});
```

### Categories:
- `[TODO]` - Work in progress
- `[BUG]` - Known bug blocking test
- `[FLAKY]` - Non-deterministic failure
- `[EXTERNAL]` - Requires external service
- `[PERF]` - Performance/timeout issue
- `[FUTURE]` - Feature not yet implemented

---

## Success Metrics

**Current State**: 115 skipped tests (large test suite impact)

**Goals**:
- Q1 2025: Reduce to < 50 skips (fix TODOs, bugs, investigate "Other")
- Q2 2025: Reduce to < 20 skips (fix flaky tests)
- Q3 2025: Reduce to < 10 skips (only external dependencies and future features)

---

## Appendix: Files with Skipped Tests

Total: 39 files with skipped tests

### Top 10 Files by Skip Count:
1. api.plugin.security.test.js - 13 skips
2. plugin-scheduler.test.js - 12 skips
3. plugin-s3-queue-concurrent.test.js - 7 skips
4. all-types-exhaustive.test.js - 4 skips
5. api-path-auth.test.js - 4 skips
6. plugin-tfstate.test.js - 3 skips
7. eventual-consistency-multi-client-locks.test.js - 3 skips
8. memory-client-backup-compatibility.test.js - 2 skips
9. plugin-s3-queue.test.js - 2 skips
10. eventual-consistency-plugin-storage-locks.test.js - 2 skips

---

## Next Steps

1. ✅ Analysis complete (this document)
2. ⬜ Create GitHub issues for each TODO/Bug category
3. ⬜ Assign owners for high-priority fixes
4. ⬜ Re-enable and verify scheduler tests (appears to be batch skip)
5. ⬜ Fix MemoryClient schema recreation bug
6. ⬜ Fix SchedulerPlugin infinite loop
7. ⬜ Establish quarterly skip review process

---

**Document Owner**: Engineering Team
**Last Updated**: 2025-11-01
**Next Review**: 2025-12-01
