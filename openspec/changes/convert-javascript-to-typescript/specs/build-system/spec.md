# Build System (TypeScript)

## ADDED Requirements

### Requirement: TypeScript Compilation

The build system SHALL compile TypeScript source files to JavaScript.

#### Scenario: Development build
- **WHEN** running `pnpm run build`
- **THEN** all TypeScript files SHALL be compiled to JavaScript
- **AND** sourcemaps SHALL be generated
- **AND** declaration files SHALL be generated

#### Scenario: Watch mode
- **WHEN** running `pnpm run dev` or `pnpm run build:watch`
- **THEN** TypeScript files SHALL be recompiled on change
- **AND** incremental compilation SHALL be used for speed

#### Scenario: Type checking
- **WHEN** running `pnpm run typecheck`
- **THEN** all TypeScript files SHALL be type-checked without emitting
- **AND** type errors SHALL be reported with file locations

### Requirement: Rollup TypeScript Integration

Rollup SHALL process TypeScript files with proper plugin configuration.

#### Scenario: TypeScript plugin configuration
- **WHEN** Rollup builds the project
- **THEN** `@rollup/plugin-typescript` or `rollup-plugin-esbuild` SHALL process `.ts` files
- **AND** tsconfig.json settings SHALL be respected
- **AND** output SHALL match the target format (ESM/CJS)

#### Scenario: Declaration bundling
- **WHEN** building for production
- **THEN** `rollup-plugin-dts` SHALL bundle all declaration files
- **AND** the output SHALL be a single `dist/s3db.d.ts` file
- **AND** all public types SHALL be included

### Requirement: Package.json TypeScript Configuration

Package.json SHALL declare TypeScript support.

#### Scenario: Types field
- **WHEN** the package is published
- **THEN** package.json SHALL include `"types": "./dist/s3db.d.ts"`
- **AND** TypeScript SHALL find type definitions automatically

#### Scenario: Exports types
- **WHEN** using conditional exports
- **THEN** each export SHALL include a `types` condition
- **AND** the types condition SHALL precede import/require

#### Scenario: TypeScript peer dependency
- **WHEN** declaring peer dependencies
- **THEN** TypeScript SHALL be listed as optional peer dependency
- **AND** minimum version SHALL be TypeScript 5.0

### Requirement: Test Runner TypeScript Support

The test runner SHALL execute TypeScript tests.

#### Scenario: Vitest TypeScript execution
- **WHEN** running tests with Vitest
- **THEN** `.test.ts` files SHALL be compiled and executed
- **AND** no separate compilation step SHALL be required
- **AND** source maps SHALL provide accurate stack traces

#### Scenario: Test coverage
- **WHEN** generating coverage reports
- **THEN** coverage SHALL be mapped to TypeScript source files
- **AND** uncovered lines SHALL reference TypeScript line numbers

### Requirement: Editor Integration

Build configuration SHALL support IDE features.

#### Scenario: VS Code integration
- **WHEN** opening the project in VS Code
- **THEN** TypeScript IntelliSense SHALL work immediately
- **AND** errors SHALL be highlighted in real-time
- **AND** go-to-definition SHALL navigate to TypeScript source

#### Scenario: Project references
- **WHEN** the project uses composite mode
- **THEN** tsconfig.json SHALL enable `composite` and `declaration`
- **AND** incremental builds SHALL use `.tsbuildinfo` files

### Requirement: CLI TypeScript Compilation

CLI entry points SHALL be compiled to executable JavaScript.

#### Scenario: CLI build
- **WHEN** building CLI tools
- **THEN** `bin/s3db.ts` SHALL compile to `bin/s3db.js`
- **AND** shebang lines SHALL be preserved
- **AND** executable permissions SHALL be set

#### Scenario: MCP server build
- **WHEN** building the MCP server
- **THEN** `mcp/entrypoint.ts` SHALL compile to `mcp/entrypoint.js`
- **AND** all dependencies SHALL be properly bundled or imported
