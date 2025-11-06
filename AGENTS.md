<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Repository Guidelines

## Platform Context
- This repository provides the shared `s3db.js` data layer that other services (for example, `mrt-shortner`) call as both persistence and HTTP API; treat schema changes as cross-repo changes.
- Front-end clients that consume this API should align with the Jade design system, primarily maintained in `jade-web` and `jade-design-tokens`.

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

## Repository Index
- `s3db.js/` – Shared database and API surface that backs the platform.
- `mrt-shortner/` – URL shortener service and dashboard integrating with this API.
- `jade-web/` – Jade design system components for front-end clients.
- `jade-design-tokens/` – Source of Jade design tokens consumed by all UIs.
