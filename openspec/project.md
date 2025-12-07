# Project Context

## Purpose
`s3db.js` turns AWS S3 (and S3‑compatible stores) into a document database with an ORM‑like interface, schema validation, encryption, and a plugin system. It provides the shared data layer and optional HTTP API used by services in this workspace. The library prioritizes reliability, cost‑efficiency, and simple operational overhead by leveraging S3 durability and metadata.

Core goals:
- Provide a simple, ergonomic CRUD API over S3 with validation and hooks
- Optimize for S3 performance and cost (metadata encoding, caching, batching)
- Offer extensibility via plugins (API server, identity, replication, cache, etc.)
- Ship as ESM with CJS bundles, plus first‑class TypeScript types

## Tech Stack
- **Runtime**: Node.js 18+ (ES Modules)
- **Language**: JavaScript with bundled TypeScript definitions (`dist/s3db.d.ts`)
- **Bundler**: Rollup v4 (ESM + CJS outputs under `dist/`)
- **Package manager**: pnpm (workspace enabled, monorepo structure)
- **Testing**: Vitest (Parallel execution, MemoryClient default) + TypeScript compile check via `tsc`
- **Validation**: fastest-validator v1.19+ (schema definitions and runtime checks)
- **AWS SDK**: AWS SDK v3 (`@aws-sdk/client-s3` v3.928+)
- **HTTP API (plugin)**: Hono v4+ (`hono`, `@hono/node-server`, `@hono/swagger-ui`)
- **Crypto & security**: bcrypt v5-6 (password hashing), AES‑256‑GCM for `secret` fields, `jose` v5-6 for JWT/OIDC
- **CLI**: Commander v14 based CLI in `bin/cli.js`
- **MCP Server**: Model Context Protocol server with Hybrid Search (Fuse.js + Embeddings) in `src/mcp/`
- **Documentation**: Docsify (Dark/Light theme, local preview) in `docs/`
- **CI/CD**: GitHub Actions (Next/Stable release channels)

Reference commands (see `package.json`):
- **Build**: `pnpm run build:core` (rollup) • `pnpm run dev` (watch mode)
- **Tests (Fast)**: `pnpm test` (uses MemoryClient, parallel)
- **Tests (Persistence)**: `pnpm run test:fs` (uses FileSystemClient, slower)
- **Coverage**: `pnpm run test:coverage`
- **Docs**: `pnpm run docs` (serves local preview at http://localhost:3000)
- **MCP Indexing**: `pnpm run mcp:reindex` (builds search embeddings)

## Project Conventions

### Code Style
- ES Modules, 2‑space indentation, Prettier defaults
- Naming: camelCase for variables/functions; PascalCase for classes/plugins (`*Plugin`)
- Keep imports semantically sorted; prefer small, focused modules
- Do not edit `dist/` by hand; build with rollup

### Architecture Patterns
- **Core classes**: `Database`, `Resource`, `Schema`, `Validator` (see `src/*.class.js`)
- **Storage clients**: 
  - `S3Client` (AWS S3)
  - `MemoryClient` (Default for tests - fast, in-memory, max 256MB limit)
  - `FileSystemClient` (Local persistence tests)
- **Plugins**: Modular capabilities under `src/plugins/`. All follow base `Plugin` class pattern.
  - **Lazy loading**: Peer dependencies use dynamic imports to prevent "module not found" errors
- **Data encoding**: Space‑optimized custom types (timestamps, UUIDs, vectors) to fit S3's 2KB metadata limits

### Testing Strategy (Cost Optimization)
**IMPORTANT:** The test suite is comprehensive but resource-intensive. 

1.  **Default Mode**: `pnpm test` runs `test:memory`. This uses `MemoryClient` and parallel execution (max 50% cores locally, 2 threads CI).
    - Fast, isolates state per test file, prevents OOM.
2.  **Persistence Mode**: `pnpm run test:fs` uses `FileSystemClient`. Use only when testing disk persistence or S3 simulation specifics.
3.  **Workflow**:
    - Develop Feature/Fix.
    - Create specific test file.
    - Run *only* that test: `npx vitest run tests/path/to/test.js`
    - Check coverage locally.
    - Leave full suite for CI/pre-push.

### Git Workflow
- Commits: Conventional Commits (e.g., `feat: add cloud inventory plugin`)
- **Release Channels**:
  - `main` branch pushes -> **Next** release (`x.y.z-next.HASH`) on NPM & GitHub Packages.
  - `v*` tags -> **Stable** release on NPM & GitHub Packages (auto-changelog generation).

## Domain Context
- **S3 metadata limit** (~2KB/key): Library uses compact encodings and spills to object body when needed
- **Security**: Passwords are one‑way hashed (`password` type); reversible secrets use `secret` type (AES-256-GCM)
- **Performance**: 
  - `patch()`: HEAD+COPY (metadata update)
  - `replace()`: PUT (overwrite)
  - `update()`: GET+PUT (merge)

## Project Structure (high level)
```
s3db.js/
├── src/                           # Core library source
│   ├── clients/                  # Storage backends (S3, Memory, FileSystem)
│   ├── concerns/                 # Shared utilities
│   ├── plugins/                  # Plugins (API, Identity, Replicators, etc.)
│   ├── mcp/                      # MCP Server & Search Logic
│   └── ...
├── tests/                         # Vitest test suites
│   ├── core/                     # Core functionality tests
│   ├── plugins/                  # Plugin tests
│   ├── performance/              # Benchmarks
│   └── config.js                 # Test environment configuration
├── docs/                          # Docsify Documentation
│   ├── _coverpage.md
│   ├── index.html
│   └── ...
├── .github/
│   └── workflows/                # CI/CD Pipelines (Quality, Next, Stable)
├── openspec/                      # OpenSpec change management
├── rollup.config.js              # Build configuration
├── vitest.config.js              # Vitest configuration
└── package.json                  # Dependencies and scripts
```