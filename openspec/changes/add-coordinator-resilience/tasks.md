# Tasks: Add Coordinator Resilience Features

## 1. Core Infrastructure

- [x] 1.1 Create RingBuffer utility class (`src/concerns/ring-buffer.ts`)
- [x] 1.2 Create LatencyBuffer specialized class with percentile calculations
- [x] 1.3 Export from concerns/index.ts

## 2. Enhanced Metrics

- [x] 2.1 Add `contentionEvents` and `epochDriftEvents` to CoordinatorMetrics
- [x] 2.2 Create `EnhancedCoordinatorMetrics` interface with latency stats
- [x] 2.3 Add `_latencyBuffer` to GlobalCoordinatorService
- [x] 2.4 Track heartbeat latencies in `_heartbeatCycle`
- [x] 2.5 Update `getMetrics()` to return `EnhancedCoordinatorMetrics`
- [x] 2.6 Add `incrementEpochDriftEvents()` method

## 3. Contention Detection

- [x] 3.1 Add `ContentionConfig` interface
- [x] 3.2 Add `ContentionEvent` interface
- [x] 3.3 Add `contentionThreshold`, `contentionEnabled`, `contentionRateLimitMs` to config
- [x] 3.4 Add `_contentionState` to GlobalCoordinatorService
- [x] 3.5 Implement `_checkContention()` method
- [x] 3.6 Emit `contention:detected` event with rate limiting
- [x] 3.7 Track contention events in metrics

## 4. Epoch Fencing

- [x] 4.1 Add `epochFencingEnabled` and `epochGracePeriodMs` to CoordinatorConfig
- [x] 4.2 Add `EpochValidationResult` interface
- [x] 4.3 Add `_lastKnownEpoch` and `_lastEpochChangeTime` to CoordinatorPlugin
- [x] 4.4 Implement `validateEpoch()` method with grace period logic
- [x] 4.5 Implement `isEpochValid()` convenience method
- [x] 4.6 Update `_setupLeaderChangeListener` to track epoch changes
- [x] 4.7 Add `getCurrentEpoch()` method

## 5. Testing

- [x] 5.1 Create `tests/concerns/ring-buffer.test.ts` (19 tests)
- [x] 5.2 Create `tests/plugins/concerns/coordinator-resilience.test.ts` (16 tests)
- [x] 5.3 Test RingBuffer basic operations and edge cases
- [x] 5.4 Test LatencyBuffer percentile calculations and caching
- [x] 5.5 Test enhanced metrics in GlobalCoordinatorService
- [x] 5.6 Test contention detection and rate limiting
- [x] 5.7 Test epoch fencing validation logic
- [x] 5.8 Test grace period for epoch-1 tasks
- [x] 5.9 Test configuration defaults and customization

## 6. Documentation

- [x] 6.1 Update `docs/core/internals/global-coordinator.md` with new features
- [x] 6.2 Add example for contention event handling
- [x] 6.3 Document epoch fencing best practices
- [x] 6.4 Update CLAUDE.md with new coordinator features
