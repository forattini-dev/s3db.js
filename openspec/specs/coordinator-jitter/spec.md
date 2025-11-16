# coordinator-jitter Specification

## Purpose
TBD - created by archiving change add-coordinator-jitter. Update Purpose after archive.
## Requirements
### Requirement: Support configurable startup jitter

The CoordinatorPlugin MUST support configurable startup jitter to prevent thundering herd when multiple workers start simultaneously.

**Configuration Options:**
- `startupJitterMin`: Minimum jitter delay in milliseconds (default: 0)
- `startupJitterMax`: Maximum jitter delay in milliseconds (default: 5000)

**Jitter Calculation:**
```javascript
jitterMs = startupJitterMin + Math.random() * (startupJitterMax - startupJitterMin)
```

#### Scenario: Default configuration enables 0-5s jitter

**Given** CoordinatorPlugin initialized with default configuration
**When** worker starts coordination
**Then** worker MUST wait a random delay between 0-5000ms before coordinator election
**And** after delay, coordinator election proceeds normally
**And** heartbeat loop starts after election

#### Scenario: Custom jitter range configuration

**Given** CoordinatorPlugin initialized with:
- `startupJitterMin: 2000`
- `startupJitterMax: 8000`

**When** worker starts coordination
**Then** worker MUST wait a random delay between 2000-8000ms

#### Scenario: Disable jitter for testing

**Given** CoordinatorPlugin initialized with `startupJitterMax: 0`
**When** worker starts coordination
**Then** worker MUST skip jitter delay entirely
**And** coordinator election proceeds immediately (preserving old behavior)

#### Scenario: Fixed jitter delay

**Given** CoordinatorPlugin initialized with:
- `startupJitterMin: 3000`
- `startupJitterMax: 3000`

**When** worker starts coordination
**Then** worker MUST wait exactly 3000ms (deterministic delay)

### Requirement: Validate jitter configuration

The CoordinatorPlugin MUST validate jitter configuration during initialization and reject invalid values.

#### Scenario: Reject negative minimum jitter

**Given** CoordinatorPlugin initialized with `startupJitterMin: -100`
**When** plugin validates configuration
**Then** plugin MUST throw a validation error
**And** error message MUST explain that `startupJitterMin` cannot be negative

#### Scenario: Reject invalid range (max < min)

**Given** CoordinatorPlugin initialized with:
- `startupJitterMin: 5000`
- `startupJitterMax: 1000`

**When** plugin validates configuration
**Then** plugin MUST throw a validation error
**And** error message MUST explain that `startupJitterMax` must be >= `startupJitterMin`

#### Scenario: Accept zero values

**Given** CoordinatorPlugin initialized with:
- `startupJitterMin: 0`
- `startupJitterMax: 0`

**When** plugin validates configuration
**Then** plugin MUST accept the configuration (jitter disabled)

### Requirement: Apply jitter only to startup, not steady-state

The CoordinatorPlugin MUST apply jitter only during initial startup and NOT to heartbeat loops or epoch renewals.

#### Scenario: Heartbeat loop unaffected by jitter

**Given** worker has completed startup with jitter
**And** worker is in steady-state operation

**When** worker publishes heartbeats every 5 seconds
**Then** heartbeats MUST be published at regular 5s intervals
**And** NO jitter MUST be applied to heartbeat timing

#### Scenario: Epoch renewal unaffected by jitter

**Given** current coordinator needs to renew epoch
**When** epoch reaches 80% of duration (renewCoordinatorEpoch is called)
**Then** coordinator MUST renew epoch immediately
**And** NO jitter delay MUST be applied

#### Scenario: Subsequent startCoordination calls affected by jitter

**Given** worker calls `stopCoordination()` and then `startCoordination()` again
**When** worker restarts coordination
**Then** worker MUST apply jitter delay again (treats it as new startup)

### Requirement: Prevent thundering herd during mass restarts

The CoordinatorPlugin MUST spread startup load across the configured jitter window to prevent simultaneous S3 requests during mass pod restarts.

#### Scenario: Full pod restart with 50 workers

**Given** 50 workers restart simultaneously
**And** all workers use default jitter (0-5000ms)

**When** all workers start coordination at approximately the same time
**Then** workers MUST spread their first S3 requests over approximately 5 seconds
**And** NO thundering herd MUST occur (no massive simultaneous S3 requests)
**And** all workers MUST complete startup within approximately 5-10 seconds
**And** exactly one worker MUST be elected coordinator
**And** all workers MUST begin heartbeat loops after election

#### Scenario: Small deployment can disable jitter

**Given** deployment has only 5 workers
**And** all workers configured with `startupJitterMax: 0`

**When** all workers restart simultaneously
**Then** all workers MUST start immediately without delay
**And** coordinator election MUST complete faster (no jitter overhead)

#### Scenario: Large deployment uses extended jitter

**Given** deployment has 200 workers
**And** all workers configured with:
- `startupJitterMin: 0`
- `startupJitterMax: 15000` (15 seconds)

**When** all workers restart simultaneously
**Then** workers MUST spread startup over approximately 15 seconds
**And** S3 request rate MUST remain manageable (~13 requests/second)

### Requirement: Maintain backward compatibility

The CoordinatorPlugin MUST NOT break existing deployments that do not specify jitter configuration.

#### Scenario: Existing deployment without jitter config

**Given** CoordinatorPlugin initialized without explicit jitter configuration
**And** deployment was created before jitter feature was added

**When** worker starts coordination
**Then** worker MUST use default jitter (0-5000ms)
**And** coordinator election MUST work correctly
**And** all existing functionality MUST remain intact

#### Scenario: Election algorithm unchanged

**Given** multiple workers start with jitter enabled
**When** workers complete jitter delay and run coordinator election
**Then** lexicographic election MUST select the same coordinator as without jitter
**And** election determinism MUST be preserved

