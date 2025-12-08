# TypeScript Support

## ADDED Requirements

### Requirement: TypeScript Source Code

The entire s3db.js codebase SHALL be written in TypeScript with strict type checking enabled.

#### Scenario: Strict TypeScript configuration
- **WHEN** the project is compiled
- **THEN** all TypeScript strict mode options SHALL be enabled
- **AND** noImplicitAny SHALL be true
- **AND** strictNullChecks SHALL be true
- **AND** strictFunctionTypes SHALL be true
- **AND** noUncheckedIndexedAccess SHALL be true

#### Scenario: Source file extension
- **WHEN** a new source file is created
- **THEN** the file SHALL use the `.ts` extension
- **AND** no `.js` source files SHALL exist in the `src/` directory after migration

#### Scenario: Import path resolution
- **WHEN** importing modules
- **THEN** imports SHALL use the `.js` extension for Node.js ESM compatibility
- **AND** TypeScript SHALL be configured with `moduleResolution: "NodeNext"`

### Requirement: Type Definitions

All public APIs SHALL have explicit TypeScript type definitions.

#### Scenario: Database class typing
- **WHEN** instantiating a Database
- **THEN** the constructor SHALL accept typed configuration options
- **AND** TypeScript SHALL provide autocomplete for all options
- **AND** invalid options SHALL result in compile-time errors

#### Scenario: Resource class generic typing
- **WHEN** defining a Resource
- **THEN** the Resource SHALL be generic over the record type: `Resource<T>`
- **AND** all CRUD methods SHALL infer types from the record type
- **AND** query methods SHALL return properly typed arrays

#### Scenario: Plugin type safety
- **WHEN** registering a plugin
- **THEN** the plugin options SHALL be type-checked
- **AND** plugin methods SHALL have typed signatures
- **AND** invalid plugin configurations SHALL fail at compile time

### Requirement: Schema Type Inference

The type system SHALL infer record types from schema definitions.

#### Scenario: Schema to type conversion
- **WHEN** a schema is defined with attribute types
- **THEN** TypeScript SHALL infer the corresponding record type
- **AND** `string` SHALL map to `string`
- **AND** `number` SHALL map to `number`
- **AND** `boolean` SHALL map to `boolean`
- **AND** `date` SHALL map to `Date`
- **AND** `object` SHALL map to `Record<string, unknown>`
- **AND** `any` SHALL map to `unknown`

#### Scenario: Required and optional fields
- **WHEN** a field has `required` modifier
- **THEN** the type SHALL be non-optional
- **AND** fields without `required` SHALL be optional in the inferred type

#### Scenario: Nested object typing
- **WHEN** a schema defines nested objects
- **THEN** the nested structure SHALL be reflected in the inferred type
- **AND** dot notation access SHALL be type-safe

### Requirement: Event System Type Safety

The event emitter system SHALL have type-safe event names and payloads.

#### Scenario: Typed event emission
- **WHEN** emitting an event
- **THEN** the event name SHALL be type-checked
- **AND** the payload type SHALL match the event's expected payload
- **AND** invalid event names SHALL result in compile-time errors

#### Scenario: Typed event listeners
- **WHEN** registering an event listener
- **THEN** the callback parameter types SHALL be inferred from the event
- **AND** TypeScript SHALL provide autocomplete for event names
- **AND** callback SHALL receive properly typed arguments

### Requirement: Error Type Hierarchy

All errors SHALL extend a typed error hierarchy.

#### Scenario: Base error class
- **WHEN** an error is thrown
- **THEN** it SHALL extend `S3DBError` base class
- **AND** it SHALL include `code`, `message`, and optional `cause` properties
- **AND** error types SHALL be narrowable via discriminated unions

#### Scenario: Specialized error classes
- **WHEN** a specific error condition occurs
- **THEN** a specialized error class SHALL be thrown
- **AND** `ValidationError` SHALL include `field` and `constraint` properties
- **AND** `NotFoundError` SHALL include `id` and `resourceName` properties
- **AND** `S3Error` SHALL include the original AWS error

### Requirement: Build System TypeScript Support

The build system SHALL compile TypeScript to JavaScript with proper output formats.

#### Scenario: ESM output
- **WHEN** building for ESM
- **THEN** the output SHALL be in ES modules format
- **AND** the output SHALL be in `dist/s3db.es.js`
- **AND** sourcemaps SHALL be generated

#### Scenario: CommonJS output
- **WHEN** building for CommonJS
- **THEN** the output SHALL be in CommonJS format
- **AND** the output SHALL be in `dist/s3db.cjs`
- **AND** sourcemaps SHALL be generated

#### Scenario: Declaration files
- **WHEN** building the project
- **THEN** TypeScript declaration files SHALL be generated
- **AND** declarations SHALL be bundled into `dist/s3db.d.ts`
- **AND** declarations SHALL include all public types

### Requirement: Lazy Loading Type Safety

Dynamic imports for plugins SHALL maintain type safety.

#### Scenario: Plugin lazy loading
- **WHEN** a plugin dynamically imports a dependency
- **THEN** the import SHALL be properly typed
- **AND** errors from missing dependencies SHALL be typed
- **AND** the return type SHALL match the actual module exports

#### Scenario: Optional dependency handling
- **WHEN** a peer dependency is not installed
- **THEN** the plugin SHALL throw a typed error
- **AND** the error message SHALL indicate the missing package
- **AND** the error SHALL extend `S3DBError`

### Requirement: Generic Type Constraints

Generic types SHALL have proper constraints for type safety.

#### Scenario: Resource generic constraint
- **WHEN** creating a Resource with a type parameter
- **THEN** the type parameter SHALL extend `Record<string, unknown>`
- **AND** methods SHALL use the constrained type for inference

#### Scenario: Plugin generic constraint
- **WHEN** creating a typed plugin
- **THEN** plugin options SHALL extend a base options interface
- **AND** plugin state SHALL be properly typed

### Requirement: Type Guards and Narrowing

Type guards SHALL be provided for runtime type checking.

#### Scenario: Record type guard
- **WHEN** checking if an object is a valid record
- **THEN** a type guard function SHALL narrow the type
- **AND** `isRecord<T>(obj): obj is T` SHALL be available

#### Scenario: Error type guard
- **WHEN** catching an error
- **THEN** error type guards SHALL be available
- **AND** `isS3DBError(e): e is S3DBError` SHALL narrow the type
- **AND** specific guards like `isValidationError` SHALL exist

### Requirement: Utility Types

Common utility types SHALL be exported for consumer use.

#### Scenario: Configuration types
- **WHEN** configuring the database
- **THEN** `DatabaseConfig`, `ResourceConfig`, `PluginConfig` types SHALL be exported
- **AND** consumers SHALL be able to use these types in their code

#### Scenario: Record operation types
- **WHEN** performing CRUD operations
- **THEN** `InsertInput<T>`, `UpdateInput<T>`, `QueryFilter<T>` types SHALL be available
- **AND** these types SHALL properly handle partial and deep partial operations

#### Scenario: Plugin development types
- **WHEN** developing custom plugins
- **THEN** `PluginInterface`, `PluginContext`, `PluginHooks` types SHALL be exported
- **AND** plugin developers SHALL have full type support

### Requirement: Test Type Coverage

Test files SHALL be written in TypeScript with full type coverage.

#### Scenario: Test file typing
- **WHEN** writing tests
- **THEN** test files SHALL use the `.test.ts` extension
- **AND** test utilities SHALL be properly typed
- **AND** mock objects SHALL match the types they mock

#### Scenario: Type-only tests
- **WHEN** testing type inference
- **THEN** type-only test files SHALL exist
- **AND** these SHALL use `// @ts-expect-error` for negative tests
- **AND** `expectTypeOf` utility SHALL verify type correctness

### Requirement: JSDoc Preservation

JSDoc comments SHALL be preserved for documentation generation.

#### Scenario: Public API documentation
- **WHEN** a public method or class has JSDoc
- **THEN** the JSDoc SHALL be preserved in output
- **AND** JSDoc types SHALL be consistent with TypeScript types
- **AND** `@example` blocks SHALL contain valid TypeScript

#### Scenario: Parameter documentation
- **WHEN** a function has parameters
- **THEN** JSDoc `@param` descriptions SHALL complement TypeScript types
- **AND** parameter types in JSDoc SHALL match TypeScript signatures

### Requirement: Migration Compatibility

The TypeScript migration SHALL maintain backwards compatibility.

#### Scenario: API surface preservation
- **WHEN** migrating a file to TypeScript
- **THEN** the public API SHALL remain unchanged
- **AND** all existing tests SHALL pass without modification
- **AND** consumers SHALL not need to update their code

#### Scenario: Export compatibility
- **WHEN** the library is consumed
- **THEN** both ESM and CommonJS imports SHALL work
- **AND** TypeScript consumers SHALL get full type inference
- **AND** JavaScript consumers SHALL get JSDoc-based IntelliSense

#### Scenario: Runtime behavior preservation
- **WHEN** TypeScript code is compiled and executed
- **THEN** runtime behavior SHALL be identical to the JavaScript version
- **AND** no TypeScript-specific runtime dependencies SHALL be required
