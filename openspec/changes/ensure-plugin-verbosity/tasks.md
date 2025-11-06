# Implementation Tasks

**Change ID:** `ensure-plugin-verbosity`

## Phase 1 – Contract Definition

### Task 1: Define Shared Verbosity Contract
- [ ] Document required plugin options (`verbose`, `resources`, `database`, `client`) and default handling.
- [x] Implement helper (e.g., `normalizePluginOptions`) that applies defaults and stores references.
- **Validation:** Helper exported, unit tests cover defaulting behavior.

### Task 2: Update Documentation
- [ ] Add section to plugin authoring guide describing the required options.
- [x] Update `docs/testing.md` and `CLAUDE.md` to mention explicit `verbose: false` usage in tests.
- **Validation:** Docs reference new helper and defaults.

## Phase 2 – Plugin Updates

### Task 3: Apply Contract to Core Plugins
- [x] Audit core plugins (Cache, Scheduler, TfState, etc.) and ensure constructors call normalization helper.
- [x] Default `verbose` to `false`; store references to `resources`, `database`, `client` if applicable.
- **Validation:** Jest snapshots or unit tests confirm `plugin.verbose` defaults to `false` and toggles when set.

### Task 4: Apply Contract to Remaining Plugins
- [ ] Repeat normalization for remaining plugin directories (API, Identity, Cloud Inventory, etc.).
- [ ] Address optional peer-dependency plugins (Puppeteer, Recon) with the same pattern.
- **Validation:** Grep shows all plugin constructors referencing the helper / `this.verbose` default.

## Phase 3 – Test & Tooling Adjustments

### Task 5: Update Test Fixtures
- [ ] Update shared helpers and individual tests to pass `verbose: false` explicitly when instantiating plugins.
- [ ] Add regression tests ensuring verbose defaults do not change without explicit opt-in.
- **Validation:** Jest run confirms no unexpected console output; new tests pass.

### Task 6: Lint/Automation Guardrails
- [ ] Add lint rule or test to detect plugin construction without explicit verbose flag in tests.
- [ ] Integrate into CI (optional) to prevent regressions.
- **Validation:** CI fails when plugin instantiation omits verbosity override in tests.
