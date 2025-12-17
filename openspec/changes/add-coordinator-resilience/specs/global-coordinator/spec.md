# Global Coordinator Specification

## ADDED Requirements

### Requirement: Epoch Fencing

The GlobalCoordinatorService SHALL include an epoch number with every leader change notification. Plugins SHALL reject tasks dispatched with an epoch lower than their last known epoch.

#### Scenario: Task rejected due to stale epoch
- **WHEN** a plugin receives a task with epoch 5
- **AND** the plugin's last known epoch is 6
- **THEN** the plugin SHALL reject the task
- **AND** the plugin SHALL increment the `epochDriftEvents` metric

#### Scenario: Task accepted with current epoch
- **WHEN** a plugin receives a task with epoch 7
- **AND** the plugin's last known epoch is 6
- **THEN** the plugin SHALL accept the task
- **AND** the plugin SHALL update its last known epoch to 7

#### Scenario: Epoch fencing disabled
- **WHEN** `epochFencingEnabled` config is set to false
- **THEN** plugins SHALL accept tasks regardless of epoch
- **AND** no epoch validation SHALL be performed

### Requirement: Contention Detection

The GlobalCoordinatorService SHALL detect when heartbeat cycles take longer than expected and emit warning events to allow operators to identify coordination degradation.

#### Scenario: Contention detected
- **WHEN** a heartbeat cycle completes
- **AND** the cycle duration exceeds `contentionThreshold` times the configured `heartbeatInterval`
- **THEN** the coordinator SHALL emit a `contention:detected` event
- **AND** the event SHALL include the actual duration, expected interval, and ratio

#### Scenario: Contention rate limited
- **WHEN** contention is detected
- **AND** a `contention:detected` event was emitted within the last 30 seconds
- **THEN** no new event SHALL be emitted
- **AND** the `contentionEvents` metric SHALL still be incremented

#### Scenario: Contention detection disabled
- **WHEN** `contentionDetectionEnabled` config is set to false
- **THEN** no contention detection SHALL be performed
- **AND** no `contention:detected` events SHALL be emitted

### Requirement: Enhanced Coordinator Metrics

The GlobalCoordinatorService SHALL track detailed performance metrics including latency percentiles and event counters for observability.

#### Scenario: Heartbeat latency tracking
- **WHEN** `getMetrics()` is called
- **THEN** the response SHALL include `heartbeatLatencyP99` calculated from the last 100 heartbeats
- **AND** the response SHALL include `epochDriftEvents` counter
- **AND** the response SHALL include `contentionEvents` counter

#### Scenario: Metrics with insufficient data
- **WHEN** `getMetrics()` is called
- **AND** fewer than 10 heartbeats have completed
- **THEN** `heartbeatLatencyP99` SHALL return 0
- **AND** a note SHALL indicate insufficient data

#### Scenario: Ring buffer overflow
- **WHEN** more than 100 heartbeats have completed
- **THEN** the oldest latency values SHALL be discarded
- **AND** only the most recent 100 values SHALL be used for p99 calculation

### Requirement: Graceful Epoch Transition

The coordinator SHALL allow a grace period during leader transitions to prevent premature task rejection.

#### Scenario: Grace period during transition
- **WHEN** a leader change occurs
- **AND** a task arrives with epoch equal to (currentEpoch - 1)
- **AND** the task was dispatched within the last 5 seconds
- **THEN** the plugin MAY accept the task
- **AND** the plugin SHALL log a warning about late task arrival

#### Scenario: Stale task outside grace period
- **WHEN** a task arrives with epoch less than (currentEpoch - 1)
- **THEN** the plugin SHALL reject the task
- **AND** no grace period SHALL apply
