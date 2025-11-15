# coordinator Specification

## Purpose
TBD - created by archiving change refactor-global-coordinator. Update Purpose after archive.
## Requirements
### Requirement: Global Coordinator Service Option
Coordinator-capable plugins MUST be able to share a single coordinator/election service per database namespace.

#### Scenario: Single election serving multiple plugins
- **GIVEN** a database with namespace `horizon` and two plugins (Queue + Scheduler) configured with `coordinationMode: global`
- **WHEN** both plugins start
- **THEN** only one election loop performs heartbeats and leader selection for namespace `horizon`
- **AND** the service notifies each plugin about leader changes so they can enable/disable their workers accordingly.

#### Scenario: Fallback to legacy per-plugin coordination
- **GIVEN** a plugin configured with `coordinationMode: global`
- **AND** the Global Coordinator Service cannot acquire its storage lock (e.g., S3 permission denied)
- **WHEN** the plugin starts
- **THEN** it MUST log a warning (`[coordinator] Failed to acquire global lock. Switching to per-plugin mode`)
- **AND** automatically transition to per-plugin coordination
- **AND** continue functioning without interruption
- **AND** the plugin's data and workers remain unaffected.

### Requirement: Shared Diagnostics and Configuration
Operators MUST be able to observe and tune the global coordinator via a single configuration surface.

#### Scenario: Exposing metrics/logs for shared elections
- **GIVEN** the global coordinator is running
- **WHEN** leadership changes or worker counts update
- **THEN** the system MUST emit a log/metric entry that clearly identifies the namespace and the plugins served, enabling operators to confirm only one election loop is active.

#### Scenario: Opt-in configuration
- **GIVEN** a coordinator plugin without explicit `coordinationMode`
- **WHEN** it starts
- **THEN** it MUST default to the existing per-plugin behavior (`coordinationMode: 'per-plugin'`)
- **AND** avoid breaking current deployments
- **AND** the documentation MUST describe how to enable the global mode
- **AND** the documentation MUST explain which configuration knobs apply at the service level (heartbeat intervals, jitter, diagnostics).

#### Scenario: Leadership change notification
- **GIVEN** a database with namespace `test` and global coordinator enabled
- **AND** pod-a is currently the leader
- **WHEN** pod-a becomes unavailable (no heartbeat for 3× lease timeout)
- **THEN** pod-b acquires the leader token
- **AND** the global service emits a 'leader:changed' event with payload `{ namespace: 'test', previousLeader: 'pod-a', newLeader: 'pod-b', epoch: 16 }`
- **AND** all subscribed plugins receive the event and update their internal state
- **AND** workers on pod-b are enabled while workers on pod-a are disabled.

#### Scenario: Worker registration and heartbeat
- **GIVEN** the global coordinator is running for namespace `production`
- **WHEN** a queue worker registers: `{ workerId: 'q1-worker-1', pluginType: 'queue', pod: 'pod-x', timeout: 20000 }`
- **THEN** the worker is stored in `plg_coordinator_global/production/workers/q1-worker-1.json`
- **AND** the worker's heartbeat is refreshed every 5 seconds
- **AND** if the worker fails to heartbeat for 20+ seconds, it's marked as inactive
- **AND** the event 'worker:timeout' is emitted so the plugin can clean up.

#### Scenario: Configuration inheritance in global mode
- **GIVEN** a plugin configured with:
  ```javascript
  {
    coordinationMode: 'global',
    globalCoordinator: {
      heartbeatInterval: 3000,
      leaseTimeout: 10000,
      diagnosticsEnabled: true
    }
  }
  ```
- **WHEN** the plugin connects to the global service
- **THEN** the global service applies these settings to its heartbeat cycle
- **AND** the configuration is shared by ALL plugins in the same namespace using global mode
- **AND** subsequent plugins use the same interval (no reconfiguration allowed mid-operation).

