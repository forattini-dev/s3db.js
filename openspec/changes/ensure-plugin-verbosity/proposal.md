# Enforce Configurable Plugin Verbosity

**Change ID:** `ensure-plugin-verbosity`
**Status:** Proposed
**Created:** 2025-11-06

## Overview

Give every plugin a consistent verbosity contract by requiring `verbose`, `resources`, `database`, and `client` inputs, defaulting `verbose` to `false`, and ensuring test fixtures explicitly pass `verbose: false`. The change will introduce a shared pattern so plugin noise can be controlled per plugin without global flags.

## Problem Statement

- Verbosity handling is inconsistent across plugins—some expose a `verbose` flag, others rely on ad-hoc logging toggles.
- Several plugins need access to injected `resources`, `database`, or `client` objects but do not document or enforce their presence, complicating test reuse.
- Automated tests sometimes inherit verbose logging, producing noisy output and obscuring failures.

## Goals

1. Require all plugins to accept `verbose`, `resources`, `database`, and `client` configuration options.
2. Default `verbose` to `false` while allowing per-plugin overrides (e.g., `new CachePlugin({ verbose: true })`).
3. Ensure integration/unit tests pass `verbose: false` explicitly to prevent log spam.
4. Document the pattern to keep future plugins aligned.

## Non-Goals

- Changing existing logging content or log levels beyond the flag gating.
- Introducing a global configuration registry for verbosity.
- Altering plugin constructor signatures beyond the added options.

## Proposed Solution

### 1. Shared Contract
- Create or update shared plugin base/concerns documentation describing required options (`verbose`, `resources`, `database`, `client`).
- Provide helper utilities to normalize these options and enforce defaults (`verbose: false`).

### 2. Plugin Updates
- Audit each plugin constructor and ensure the four options are supported.
- Update internal usage to reference `this.verbose` (default false) and to store provided `resources`, `database`, `client` handles when relevant.

### 3. Test Adjustments
- Update Jest fixtures and helper factories to pass `verbose: false` explicitly.
- Add regression coverage confirming `verbose` defaults to false and can be overridden per plugin.

### 4. Documentation
- Amend developer docs (`docs/testing.md`, `CLAUDE.md`, plugin authoring guides) to mention the standardized plugin config.

## Success Criteria

- Every plugin constructor accepts `verbose`, `resources`, `database`, and `client`, with `verbose` defaulting to `false`.
- Tests confirm verbosity defaults and per-plugin overrides.
- All automated tests linted to pass `verbose: false` when instantiating plugins.
- Developer documentation reflects the new convention.

## Risks & Mitigations

- **Plugin regressions**: Centralize normalization logic and add smoke tests to catch missing option propagation.
- **Noisy refactor**: Batch updates per plugin category; rely on automated formatting to minimize diff churn.
- **Backwards compatibility**: Maintain support for existing constructor signatures by merging defaults.

## Open Questions

1. Should `resources`, `database`, and `client` be required parameters (throwing on absence) or optional but normalized? (Proposed: optional, with helpful warnings.)
2. Do we need telemetry to confirm whether verbose mode is used in production?
