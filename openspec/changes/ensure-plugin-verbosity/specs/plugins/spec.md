# Plugin Verbosity Contract

**Capability:** plugins
**Change:** ensure-plugin-verbosity
**Type:** ADDED

## ADDED Requirements

### Requirement: Plugins Support Standard Options

Every plugin MUST accept `verbose`, `resources`, `database`, and `client` options during construction and normalize them via a shared helper.

#### Scenario: Default Options Applied
- **Given** a plugin is constructed without passing `verbose`
- **When** the plugin initializes
- **Then** `plugin.verbose` MUST default to `false`
- **And** the helper MUST attach any provided `resources`, `database`, and `client` references

#### Scenario: Verbose Override
- **Given** a plugin is constructed with `{ verbose: true }`
- **When** the plugin runs
- **Then** `plugin.verbose` MUST be `true`
- **And** logging MUST remain gated behind the `verbose` flag

### Requirement: Test Harness Uses Explicit Verbosity

All automated tests MUST pass `verbose: false` (or equivalent helper) when instantiating plugins unless a test explicitly verifies verbose behavior.

#### Scenario: Test Helper Enforcement
- **Given** a shared test helper creates plugin instances
- **When** the helper builds plugin options
- **Then** it MUST set `verbose: false` unless the caller overrides it

#### Scenario: Verbose Behavior Tests
- **Given** a test verifies logging behavior
- **When** it needs to enable verbose output
- **Then** it MUST opt-in with `{ verbose: true }` inside the test body

### Requirement: Documentation Updates

Contributor documentation MUST describe the standardized plugin options and testing pattern.

#### Scenario: Developer Reads Plugin Guide
- **Given** a developer consults plugin authoring docs
- **When** they review configuration guidance
- **Then** they MUST find instructions on `verbose`, `resources`, `database`, and `client` along with default values and testing expectations
