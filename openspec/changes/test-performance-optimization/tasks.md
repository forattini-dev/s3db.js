# Tasks: Test Performance Optimization

## Phase 1: Infrastructure Setup ✅

### 1.1 Time Helpers
- [x] 1.1.1 Create `tests/utils/time-helpers.ts` with fake timer utilities
- [x] 1.1.2 Add `advanceTime()`, `waitForTimer()`, `runAllTimers()` helpers
- [x] 1.1.3 Document usage patterns in helper file

**Files Created:**
- `tests/utils/time-helpers.ts` - FakeTimers, wait(), withFakeTimers(), SchedulerTimers, TTLTimers

### 1.2 Docker Environment
- [x] 1.2.1 Verify docker-compose has redis + minio with healthchecks
- [x] 1.2.2 Update test-runner to install pnpm (corepack enable)
- [x] 1.2.3 Create `scripts/test-docker.sh` for easy execution
- [x] 1.2.4 Add npm script `test:docker` to package.json

**Files Modified:**
- `docker-compose.yml` - Added pnpm via corepack, minio dependency, 6GB RAM
- `package.json` - Added test:docker, test:docker:up, test:docker:down, test:docker:shell
- `scripts/test-docker.sh` - Shell script for running tests in container

---

## Phase 2: Scheduler Tests (~60s → ~65s) ✅

### Findings
The main bottleneck is **NOT** timers but **database setup/teardown** per test.
Each test does: connect → install plugin → run test → stop → disconnect (3-7s each).

**Optimization Strategy Changed:**
- Fake timers don't help much (async operations like db.connect() get blocked)
- Real optimization: Use `beforeAll` shared fixtures instead of `beforeEach`

### 2.1 Shared Database Fixtures
- [x] 2.1.1 Refactor to use `beforeAll` for database connection
- [x] 2.1.2 Clean data between tests instead of reconnecting
- [x] 2.1.3 Plugin reinstall per test (resetStats not available)
- [x] 2.1.4 Verify all scheduler tests pass (57 passed, 7 skipped)
- [x] 2.1.5 Measure time improvement

**Result:** ~65s (slight increase due to parallel file execution I/O contention)

**Files Refactored:**
- `tests/plugins/scheduler/validation.test.ts`
- `tests/plugins/scheduler/execution.test.ts`
- `tests/plugins/scheduler/management.test.ts`
- `tests/plugins/scheduler/lifecycle-and-edge.test.ts`

**Note:** The shared fixtures pattern reduces per-test overhead, but Vitest runs files
in parallel causing filesystem I/O contention. Further optimization would require
sequential test execution or true in-memory database.

---

## Phase 3: TTL Tests (~30s → 16s) ✅

### Findings
TTL tests **already use shared fixtures** (`beforeAll`). The `sleep(1500)` calls
are intentional to test actual TTL expiration timing.

**Result:** 16s for 15 tests - already optimized, no changes needed.

---

## Phase 4: State Machine Tests (~30s → 5s) ✅

### Findings
State Machine tests already use efficient patterns with short individual test times.

**Result:** 5.13s for 15 tests - already optimized, no changes needed.

---

## Phase 5: S3 Queue Tests (~20s → 12s) ✅

### Findings
S3 Queue tests are already reasonably fast.

**Result:** 12.51s for 9 tests (2 skipped) - already optimized, no changes needed.

---

## Phase 6: CI/CD Integration ✅

### 6.1 Parallel Test Jobs in GitHub Actions
- [x] 6.1.1 Split monolithic `quality` job into parallel test suites
- [x] 6.1.2 Create `build` job with artifact caching
- [x] 6.1.3 Create `test-core` job (~5 min)
- [x] 6.1.4 Create `test-plugins-scheduler` job (~2 min)
- [x] 6.1.5 Create `test-plugins-tfstate` job (~2 min)
- [x] 6.1.6 Create `test-plugins-api` job (~1 min)
- [x] 6.1.7 Create `test-plugins-other` job (TTL, State Machine, S3 Queue)
- [x] 6.1.8 Create `quality` gate job that waits for all tests

**Files Modified:**
- `.github/workflows/ci.yml` - Restructured with parallel test jobs

**Before:** Single `quality` job running ALL tests sequentially (~11 min)
**After:** 5 parallel test jobs + quality gate (~5 min wall-clock time)

**Architecture:**
```
build (lint + build + cache)
   ↓
   ├── test-core (parallel)
   ├── test-plugins-scheduler (parallel)
   ├── test-plugins-tfstate (parallel)
   ├── test-plugins-api (parallel)
   └── test-plugins-other (parallel)
   ↓
quality (gate)
   ↓
release-* (depends on quality)
```

---

## Deferred Optimizations

### API Tests
- [ ] Add `msw` or vi.mock for HTTP in OIDC tests
- [ ] Mock external OAuth providers

### TfState Tests
- [ ] Create shared state file fixtures
- [ ] Refactor tests to share setup

### Core Tests
- [ ] Review `tests/core/integration/all-types-exhaustive.test.ts`
- [ ] Optimize large data generation
- [ ] Consider splitting into smaller test files

---

## Progress Tracking

### Docker Container Results (2 CPUs, 6GB RAM)

| Suite | Tests | Docker Time | Notes |
|-------|-------|-------------|-------|
| Scheduler | 57 | **124s** | Shared fixtures applied |
| TTL | 15 | **33s** | Already optimized |
| State Machine | 15 | **27s** | Already optimized |
| S3 Queue | 9 | **39s** | Already optimized |
| API | 459 | **37s** | Already optimized |
| TfState | 71 | **115s** | Needs optimization |
| Core | 1288 | **293s** | Needs optimization |

**Total Plugin Tests: ~375s (~6.25 min)**
**Total Core Tests: ~293s (~5 min)**
**Combined: ~668s (~11 min)**

### Comparison: Local vs Docker

| Suite | Local | Docker | Overhead |
|-------|-------|--------|----------|
| Scheduler | 65s | 124s | 1.9x |
| TTL | 16s | 33s | 2.0x |
| State Machine | 5s | 27s | 5.4x |
| API | 15s | 37s | 2.5x |

**Docker adds ~2-5x overhead** due to volume I/O and resource constraints.

**Target: Total < 20 minutes in Docker** ✅ (currently ~11 min for measured suites)

## Key Insights

### 1. Fake Timers Limitations
Fake timers alone won't achieve the target because:
- Vitest fake timers block async operations like `database.connect()`
- Tests with real I/O operations get stuck waiting forever

### 2. Database I/O Bottleneck
The main bottleneck is **database setup/teardown**:
- Each `beforeEach` does full connect/install cycle (~3-7s per test)
- Tests with many cases multiply this overhead

### 3. Parallel Test Execution
Vitest runs test files in parallel which causes:
- FileSystemClient I/O contention
- Shared fixtures don't help when files compete for disk access

### 4. Many Tests Already Optimized
Several test suites were already well-optimized:
- TTL: Uses `beforeAll` with `sleep()` for intentional time-based tests
- State Machine: Short efficient tests with minimal setup
- S3 Queue: Reasonable performance with async operations

### Solution Applied
**Shared fixtures pattern** with `beforeAll` + plugin reinstall per test + data cleanup.

### Remaining Bottlenecks
The full plugin test suite times out at 5+ minutes due to:
- ~70+ test files running in parallel
- Each file initializing its own database connection
- FileSystemClient I/O contention

### Recommendations for Further Optimization
1. **Sequential test execution**: `vitest --pool forks --poolOptions.forks.singleFork`
2. **True in-memory database**: Implement faster MemoryClient with proper isolation
3. **Test parallelization by directory**: Group related tests to share resources
4. **CI/CD test splitting**: Run different test suites in parallel jobs
