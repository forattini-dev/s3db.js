# database Specification

## Purpose
TBD - created by archiving change add-pino-logging. Update Purpose after archive.
## Requirements
### Requirement: Global Logger Instance
The Database class SHALL provide a centralized Pino logger instance, either supplied by the user or created from factory options, accessible via `this.logger`.

#### Scenario: Default logger creation
- **WHEN** Database is instantiated without `logger` or `loggerOptions` parameters
- **THEN** a default Pino logger is created with `level: 'info'` and pretty-printing auto-detected based on TTY

#### Scenario: Custom logger provided
- **WHEN** Database constructor receives a custom Pino instance via `logger` option
- **THEN** that logger instance is used as-is without modification

#### Scenario: Logger config provided
- **WHEN** Database constructor receives `loggerOptions` object (not a logger instance)
- **THEN** a new Pino logger is created using those options plus defaults

#### Scenario: Logger accessible
- **WHEN** Database instance is created
- **THEN** the logger is accessible via `db.logger`

### Requirement: Child Logger Creation
The Database class SHALL provide helper methods to create child loggers with context bindings for Resources, Plugins, and other components.

#### Scenario: Create resource child logger
- **WHEN** calling `db.getChildLogger('ResourceName', { resource: 'users', operation: 'insert' })`
- **THEN** a Pino child logger is returned with those bindings applied

#### Scenario: Child logger inherits level
- **WHEN** a child logger is created from a parent with `level: 'info'`
- **THEN** the child logger defaults to the same level (unless overridden via `childLevels`)

#### Scenario: Child logger isolation
- **WHEN** multiple child loggers are created from the same parent
- **THEN** each child is an isolated instance; changing level on one does not affect others

### Requirement: Per-Component Log Level Control
The Database class SHALL support configuring different log levels for different components (Resources, Plugins, Database itself) via the `loggerOptions.childLevels` configuration.

#### Scenario: Set database log level
- **WHEN** Database is initialized with `loggerOptions: { level: 'info', childLevels: { 'Database': 'debug' } }`
- **THEN** Database logs are at `debug` level while other components default to `info`

#### Scenario: Set plugin-specific level
- **WHEN** `loggerOptions.childLevels: { 'Plugin:S3Queue': 'warn' }`
- **THEN** S3Queue plugin logs only `warn` and `error` messages

#### Scenario: Set resource-specific level
- **WHEN** `loggerOptions.childLevels: { 'Resource:analytics': 'error' }`
- **THEN** the `analytics` Resource logs only `error` messages

#### Scenario: Override at runtime
- **WHEN** calling `logger.setLevel('debug')` on a child logger instance
- **THEN** that logger's level is updated immediately

### Requirement: Secret Redaction
The Database logger SHALL automatically redact sensitive field values (passwords, API keys, AWS credentials, etc.) from all log output to prevent accidental secret leakage.

#### Scenario: Password redaction
- **WHEN** logging an object with `{ password: 'secret123', email: 'user@example.com' }`
- **THEN** the output contains `{ password: '[REDACTED]', email: 'user@example.com' }`

#### Scenario: AWS credential redaction
- **WHEN** logging contains `{ awsAccessKeyId: 'AKIA...', awsSecretAccessKey: '...', bucket: 'my-bucket' }`
- **THEN** credentials are redacted but bucket name is preserved

#### Scenario: Custom pattern redaction
- **WHEN** Database is initialized with `loggerOptions: { redactPatterns: [/mySecret\w+/i] }`
- **THEN** fields matching that pattern are redacted in addition to the built-in list

#### Scenario: Redaction indicator
- **WHEN** a field is redacted
- **THEN** it is replaced with the string `'[REDACTED]'`

### Requirement: Payload Truncation
The Database logger SHALL truncate large payloads that exceed a configurable maximum size, and indicate truncation in the output.

#### Scenario: Default truncation (1MB)
- **WHEN** logging an object larger than 1MB
- **THEN** the payload is truncated and the output includes `_truncated: true, _originalSize: N`

#### Scenario: Custom truncation limit
- **WHEN** Database is initialized with `loggerOptions: { maxPayloadBytes: 500_000 }`
- **THEN** payloads larger than 500KB are truncated

#### Scenario: No truncation for small payloads
- **WHEN** logging an object smaller than `maxPayloadBytes`
- **THEN** the full payload is included and `_truncated` is not present

### Requirement: Environment Variable Configuration
The Database logger configuration SHALL support override via environment variables for deployment flexibility.

#### Scenario: S3DB_LOG_LEVEL override
- **WHEN** `S3DB_LOG_LEVEL=debug` is set
- **THEN** the logger level defaults to `debug` (overriding `loggerOptions.level`)

#### Scenario: S3DB_LOG_PRETTY override
- **WHEN** `S3DB_LOG_PRETTY=true` is set
- **THEN** pretty-printing is enabled regardless of TTY detection

#### Scenario: S3DB_LOG_PRETTY=false override
- **WHEN** `S3DB_LOG_PRETTY=false` is set
- **THEN** JSON output is used regardless of TTY

### Requirement: TTY Auto-Detection
The Database logger SHALL automatically detect whether output is to a terminal (TTY) and apply pretty-printing for development convenience.

#### Scenario: Pretty-printing on terminal
- **WHEN** running `node app.js` (output to terminal)
- **THEN** logs are pretty-printed in human-readable format with colors

#### Scenario: JSON output when piped
- **WHEN** running `node app.js | tee logs.json` (output piped)
- **THEN** logs are compact JSON (no pretty-printing)

#### Scenario: Production environment
- **WHEN** `NODE_ENV=production` is set
- **THEN** pretty-printing is disabled even if TTY detected

### Requirement: Database Lifecycle Logging
The Database class SHALL log significant lifecycle events (connection, resource creation, errors) with appropriate context.

#### Scenario: Connection logging
- **WHEN** `database.connect()` is called
- **THEN** a log entry is recorded with `{ msg: 'connected', level: 'info' }`

#### Scenario: Disconnection logging
- **WHEN** `database.disconnect()` is called
- **THEN** a log entry is recorded

#### Scenario: Resource creation logging
- **WHEN** `database.createResource({ name: 'users' })` is called
- **THEN** a log entry is recorded with `{ msg: 'resource created', resource: 'users', level: 'info' }`

#### Scenario: Error logging with context
- **WHEN** an operation fails (e.g., S3 access denied)
- **THEN** the error is logged with `{ msg: 'operation failed', error: ErrorObject, bucket: '...', level: 'error' }`

