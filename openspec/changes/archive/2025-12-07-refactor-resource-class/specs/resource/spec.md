# Resource Class Architecture

## ADDED Requirements

### Requirement: Modular Resource Architecture

The Resource class SHALL be composed of specialized internal modules that handle distinct responsibilities, enabling independent testing and maintenance while preserving the existing public API.

#### Scenario: Resource instantiation with modular components
- **WHEN** a new Resource is instantiated with valid configuration
- **THEN** the Resource SHALL internally instantiate all required modules (ResourceIdGenerator, ResourceHooks, ResourcePartitions, ResourceGuards, ResourceMiddleware, ResourcePersistence, ResourceQuery, ResourceContent, ResourceStreams)
- **AND** all modules SHALL receive reference to the parent Resource instance
- **AND** the public API SHALL remain unchanged

#### Scenario: State machine accessor moved to plugin
- **WHEN** the StateMachinePlugin is installed
- **THEN** the plugin SHALL inject the `state` accessor via `Object.defineProperty`
- **AND** the Resource class SHALL NOT contain state machine specific code

#### Scenario: Module isolation for testing
- **WHEN** a module is tested in isolation
- **THEN** it SHALL be possible to instantiate the module with a mock Resource context
- **AND** the module SHALL expose all functionality needed for unit testing

### Requirement: ResourceIdGenerator Module

The ResourceIdGenerator module SHALL handle all ID generation strategies including synchronous, asynchronous, and incremental modes.

#### Scenario: Synchronous ID generation
- **WHEN** no custom idGenerator is configured
- **THEN** ResourceIdGenerator SHALL return synchronous nanoid-based IDs
- **AND** IDs SHALL be 22 characters by default

#### Scenario: Incremental ID generation
- **WHEN** idGenerator is configured as 'incremental' or 'incremental:N'
- **THEN** ResourceIdGenerator SHALL use the distributed sequence mechanism
- **AND** IDs SHALL be generated atomically with S3 locking
- **AND** hasAsyncIdGenerator() SHALL return true

#### Scenario: Custom ID generator function
- **WHEN** idGenerator is a custom function
- **THEN** ResourceIdGenerator SHALL wrap it to ensure string output
- **AND** the function SHALL be called on each insert

### Requirement: ResourceHooks Module

The ResourceHooks module SHALL manage the lifecycle hooks system for all Resource operations.

#### Scenario: Hook registration
- **WHEN** addHook(event, fn) is called
- **THEN** the hook SHALL be bound to the Resource context
- **AND** the hook SHALL be added to the appropriate hook array

#### Scenario: Hook execution
- **WHEN** executeHooks(event, data) is called
- **THEN** all registered hooks for that event SHALL execute in order
- **AND** each hook SHALL receive the output of the previous hook
- **AND** the final transformed data SHALL be returned

#### Scenario: Hook binding preserves context
- **WHEN** a hook function uses `this`
- **THEN** `this` SHALL refer to the Resource instance
- **AND** hooks from plugins SHALL also have access to Resource context

### Requirement: ResourcePartitions Module

The ResourcePartitions module SHALL manage partition indexing, key generation, and partition queries.

#### Scenario: Partition key generation
- **WHEN** getPartitionKey() is called with partition name and data
- **THEN** the module SHALL generate the correct S3 key based on partition field values
- **AND** partition rules (date, maxlength) SHALL be applied

#### Scenario: Partition reference management
- **WHEN** a record is inserted, updated, or deleted
- **THEN** partition references SHALL be created, updated, or deleted accordingly
- **AND** asyncPartitions config SHALL control sync vs async behavior

#### Scenario: Orphaned partition detection
- **WHEN** findOrphanedPartitions() is called
- **THEN** the module SHALL identify partitions referencing non-existent fields
- **AND** removeOrphanedPartitions() SHALL clean them up

### Requirement: ResourceGuards Module

The ResourceGuards module SHALL handle authorization checks for Resource operations.

#### Scenario: Guard execution
- **WHEN** executeGuard(operation, context, resource) is called
- **THEN** the module SHALL evaluate the guard configuration
- **AND** return true for allowed operations, false for denied

#### Scenario: Role-based access control
- **WHEN** guard is configured with roles/scopes array
- **THEN** the module SHALL check user.scope and user.roles (Keycloak/Azure AD formats)
- **AND** allow if user has any required role/scope

#### Scenario: Custom guard function
- **WHEN** guard is a function
- **THEN** the function SHALL be called with context and resource
- **AND** only explicit true return SHALL allow the operation

### Requirement: ResourceMiddleware Module

The ResourceMiddleware module SHALL implement the middleware dispatch system for wrapping Resource methods.

#### Scenario: Middleware registration
- **WHEN** useMiddleware(method, fn) is called
- **THEN** the middleware SHALL be added to the method's middleware stack
- **AND** supported methods SHALL include all CRUD and query operations

#### Scenario: Middleware execution chain
- **WHEN** a wrapped method is called
- **THEN** middleware functions SHALL execute in registration order
- **AND** each middleware SHALL receive context and next function
- **AND** the original method SHALL execute after all middleware

### Requirement: ResourcePersistence Module

The ResourcePersistence module SHALL implement all CRUD operations for the Resource.

#### Scenario: Insert operation
- **WHEN** insert(data) is called
- **THEN** the module SHALL validate data, apply defaults, execute hooks, generate ID if needed, and persist to S3
- **AND** behavior strategy SHALL be applied for metadata/body handling

#### Scenario: Update operation with merge
- **WHEN** update(id, attributes) is called
- **THEN** the module SHALL GET existing data, merge with new attributes, and PUT
- **AND** dot notation for nested fields SHALL be supported

#### Scenario: Patch operation for performance
- **WHEN** patch(id, fields) is called with metadata-only behavior
- **THEN** the module SHALL use HEAD+COPY instead of GET+PUT
- **AND** provide 40-60% faster updates

#### Scenario: Replace operation without merge
- **WHEN** replace(id, fullData) is called
- **THEN** the module SHALL PUT directly without fetching existing data
- **AND** provide 30-40% faster full replacements

### Requirement: ResourceQuery Module

The ResourceQuery module SHALL implement query and listing operations.

#### Scenario: Query with filter
- **WHEN** query(filter, options) is called
- **THEN** the module SHALL scan records and filter by matching criteria
- **AND** support limit, offset, and partition options

#### Scenario: Paginated listing
- **WHEN** page(options) is called
- **THEN** the module SHALL return paginated results with total count
- **AND** support partition-scoped pagination

#### Scenario: Batch retrieval
- **WHEN** getMany(ids) is called
- **THEN** the module SHALL retrieve multiple records efficiently
- **AND** return array with results in same order as input ids

### Requirement: ResourceContent Module

The ResourceContent module SHALL handle binary content operations.

#### Scenario: Set binary content
- **WHEN** setContent({ id, buffer, contentType }) is called
- **THEN** the module SHALL store the buffer as the object body
- **AND** preserve existing metadata

#### Scenario: Get binary content
- **WHEN** content(id) is called
- **THEN** the module SHALL return the object body as buffer
- **AND** include content type information

### Requirement: ResourceStreams Module

The ResourceStreams module SHALL provide streaming interfaces for Resource data.

#### Scenario: Readable stream
- **WHEN** readable() is called
- **THEN** the module SHALL return a ResourceReader stream
- **AND** the stream SHALL yield records one by one

#### Scenario: Writable stream
- **WHEN** writable() is called
- **THEN** the module SHALL return a ResourceWriter stream
- **AND** the stream SHALL accept records for insertion

### Requirement: Resource Facade Pattern

The Resource class SHALL act as a facade that delegates to internal modules while exposing the same public API.

#### Scenario: Backwards compatibility
- **WHEN** existing code uses Resource methods
- **THEN** all methods SHALL work identically to before refactoring
- **AND** no breaking changes SHALL be introduced

#### Scenario: Resource class size reduction
- **WHEN** refactoring is complete
- **THEN** the Resource class SHALL be less than 500 lines
- **AND** all business logic SHALL reside in modules
