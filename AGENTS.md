# Repository Guidelines

## Project Structure & Module Organization
- `src/` – core source, including plugins in `src/plugins/` and shared concerns in `src/concerns/`.
- `docs/` – plugin documentation and contributor references.
- `tests/` & `tests/typescript/` – Jest test suites and type checks.
- `dist/` – generated bundles; do not edit by hand.
- `scripts/` – release/build helper scripts.

## Build, Test, and Development Commands
- `pnpm run build:core` – generates the library bundles under `dist/`.
- `pnpm run dev` – rollup watch mode for iterative development.
- `pnpm run test` – runs JavaScript unit tests and TypeScript checks.
- `pnpm run test:coverage` – serial Jest run with coverage + TypeScript compile.
- `pnpm run test:quick` – Jest smoke run (useful before committing).
- `pnpm run test:plugins` – targeted plugin suites with higher timeouts.

## Coding Style & Naming Conventions
- JavaScript/TypeScript, ES modules, 2-space indentation.
- Prefer camelCase for variables/functions, PascalCase for classes/plugins.
- Plugins export a `*Plugin` class and expose drivers/utilities via `index.js`.
- Format with Prettier defaults (via editor) and keep imports sorted semantically.

## Testing Guidelines
- Jest for JS; TypeScript compile check via `pnpm run test:ts`.
- Name tests `*.test.js` and mirror source paths (e.g., `tests/plugins/<plugin>.test.js`).
- Plugin suites must maintain **≥90%** coverage (statements/branches/functions/lines) — run `pnpm run test:coverage` to verify.
- Add integration tests when touching plugin APIs or cross-plugin flows.

## Commit & Pull Request Guidelines
- Follow conventional, descriptive subject lines (e.g., `feat: add cloud inventory plugin`).
- Body should state motivation and high-level changes; reference issues with `Fixes #ID`.
- PRs must include summary, testing notes, and screenshots/logs when UI or CLI output changes.
- Keep diffs focused; update docs and peer dependency notes when behaviours change.
