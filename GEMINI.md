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

# GEMINI.md

This document provides essential guidance for AI developers working on the `s3db.js` codebase.

## 1. Core Concepts

### S3 Metadata Limit (2KB)
S3 object metadata is limited to 2KB. The `s3db.js` library provides "behaviors" to automatically handle data that exceeds this limit, for example by overflowing data to the object's body. This is managed by the `calculator.js` concern, which performs precise UTF-8 byte counting.

### Update Method Comparison
`s3db.js` offers three ways to update records, each with different performance characteristics.

| Method    | Requests    | Merges Data? | Speed         | Common Use Case                  |
|-----------|-------------|--------------|---------------|----------------------------------|
| `update()`  | GET + PUT   | Yes          | Baseline      | Default choice for most updates. |
| `patch()`   | HEAD + COPY | Yes          | 40-60% faster | Partial updates, metadata changes. |
| `replace()` | PUT         | No           | 30-40% faster | Overwriting an entire record.    |

**Recommendation:** Use `patch()` for performance-sensitive partial updates and `replace()` when you have the full object and want maximum speed. Use `update()` for general-purpose modifications.

### Connection Strings
The `Database` class is initialized with a connection string that defines the storage backend.

- **AWS S3:** `s3://KEY:SECRET@bucket?region=us-east-1`
- **MinIO/LocalStack:** `http://KEY:SECRET@localhost:9000/bucket`
- **In-Memory (for tests):** `memory://mybucket/databases/myapp`

## 2. Architecture

### Lazy Loading for Plugins
**CRITICAL:** To keep the core library small and prevent "module not found" errors, all plugins and their peer dependencies are loaded lazily. This means dependencies like the AWS SDK, GCP SDK, etc., are only imported when a specific plugin is actively used.

**Pattern:**
```javascript
// Static imports are discouraged
// import { SomeDriver } from './drivers/some-driver.js';

// Use dynamic import() to load on demand
const DRIVER_LOADERS = {
  aws: () => import('./drivers/aws-driver.js').then(m => m.AwsInventoryDriver),
  gcp: () => import('./drivers/gcp-driver.js').then(m => m.GcpInventoryDriver),
};

export async function loadDriver(name, options) {
  if (!DRIVER_LOADERS[name]) {
    throw new Error(`Driver ${name} not found.`);
  }
  const DriverClass = await DRIVER_LOADERS[name]();
  return new DriverClass(options);
}
```

### Global Coordinator Service
For distributed tasks like leader election (used in `TTLPlugin`, `S3QueuePlugin`, etc.), `s3db.js` uses a `GlobalCoordinatorService`. This service ensures that only one worker in a cluster acts as the leader at any given time.

- **Unified System:** All plugins share a single coordinator service per namespace, reducing S3 API calls by over 90%.
- **Event-Driven:** Plugins subscribe to leader change events rather than polling.
- **Automatic:** Enabled via `enableCoordinator: true` in a plugin's configuration. The service handles heartbeats, worker timeouts, and leader election automatically.
- **Debugging:** Set `logLevel: 'debug'` in plugin config or use `database.getGlobalCoordinator('default').getMetrics()` to inspect state.

### API Plugin Authentication and User Resources

The `ApiPlugin` provides robust authentication and authorization capabilities, supporting various drivers like OIDC, OAuth2, JWT, Basic, and API Key. A key aspect of this system is how user records are managed, specifically through a dedicated "users resource."

The plugin offers flexibility in managing this users resource: it can automatically create one for you, or you can instruct it to use an existing resource. Understanding the `auth.resource` and `auth.createResource` configuration options is crucial.

#### Configuration Options:

*   **`auth.resource` (string, optional):**
    *   **When `auth.createResource` is `true` (default behavior):** This option specifies the *name* of the resource that the `ApiPlugin` will use to store user data. If a resource with this name already exists, the plugin will reuse it. If it does not exist, the plugin will automatically create a new resource with this name. If `auth.resource` is not provided, the plugin defaults to using a resource named `plg_api_users`.
    *   **When `auth.createResource` is `false`:** This option *must* specify the name of an *existing* resource that the `ApiPlugin` should use for user data. The plugin will *not* attempt to create a new resource. If the specified resource does not exist, the plugin will throw an error during initialization.

*   **`auth.createResource` (boolean, default: `true`):**
    *   **`true` (default):** The `ApiPlugin` will automatically create a user resource if one does not exist with the name specified by `auth.resource` (or the default `plg_api_users`). If a resource with that name already exists, it will be reused.
    *   **`false`:** The `ApiPlugin` will *not* create a user resource. It *requires* an existing resource with the name specified in `auth.resource` (or the default `plg_api_users`) to be present in the database. If no such resource is found, the plugin will fail to initialize.

#### Examples:

**1. Automatic Resource Creation (Default Behavior):**

```javascript
// Scenario A: Use default resource name 'plg_api_users', create if not exists
new ApiPlugin({
  auth: {
    jwt: { enabled: true, secret: 'my-secret' }
  }
});

// Scenario B: Use custom resource name 'my_app_users', create if not exists
new ApiPlugin({
  auth: {
    jwt: { enabled: true, secret: 'my-secret' },
    resource: 'my_app_users' // Plugin will create 'my_app_users' if it doesn't exist
  }
});
```

**2. Using an Existing Resource (Preventing Automatic Creation):**

```javascript
// Scenario C: Use an existing resource named 'my_existing_users'.
// The plugin will throw an error if 'my_existing_users' does not exist.
new ApiPlugin({
  auth: {
    jwt: { enabled: true, secret: 'my-secret' },
    resource: 'my_existing_users',
    createResource: false // Explicitly prevent the plugin from creating a new resource
  }
});
```

## 3. Development Workflow

### Testing Strategy (Cost Optimization)
**IMPORTANT:** The test suite is comprehensive but resource-intensive. Avoid running the full test suite unnecessarily.

1.  **Develop Feature/Fix.**
2.  **Write Specific Test:** Create or update a specific test file targeting *only* the changes.
3.  **Run Specific Test:** Execute *only* that test file: `npx vitest run tests/path/to/test.js`
4.  **Check Coverage:** Verify coverage for the modified files only.
5.  **Full Suite (CI Only):** Leave full regression testing to the CI pipeline or pre-push checks.

### Getting Started
1.  **Install dependencies:** `pnpm install`
2.  **Build the core library:** `pnpm run build:core`
3.  **Run tests:** `pnpm test` (all), `pnpm test:quick` (smoke test), or `pnpm test:plugins` (for plugins).

### Key File Locations
- **Core Classes:** `src/database.class.js`, `src/resource.class.js`
- **Clients:** `src/clients/` (S3, Memory, Filesystem)
- **Plugins:** `src/plugins/`
- **Shared Logic:** `src/concerns/` (crypto, error handling, etc.)
- **Tests:** `tests/`
- **Usage Examples:** `docs/examples/`

### Validation
Schema validation is powered by **fastest-validator**. Nested objects are auto-detected, simplifying schema definitions.

```javascript
// No `$$type` needed for simple nested objects
const schema = {
  name: 'string',
  profile: {
    bio: 'string|optional',
    avatar: 'url'
  }
};
```

### Error Handling
Use the `tryFn` utility for safe error handling without `try...catch` blocks.

```javascript
import { tryFn } from './src/concerns/try-fn.js';
import { mapAwsError } from './src/errors.js';

const [ok, err, data] = await tryFn(() => resource.insert(record));

if (!ok) {
  // mapAwsError provides actionable suggestions for common S3 errors
  const mappedError = mapAwsError(err, { bucket, key });
  console.error(mappedError.message);
}
```