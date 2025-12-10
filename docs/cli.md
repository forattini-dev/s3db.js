# 💻 S3db Command Line Interface (CLI)

The `s3db` CLI is a powerful tool for managing your S3db instances, resources, and data directly from your terminal. It provides commands for database configuration, CRUD operations, migrations, testing, and interacting with the Model Context Protocol (MCP) server.

## 🚀 Installation

The `s3db` CLI is installed automatically when you install `s3db.js`.

```bash
pnpm add s3db.js
# Or for global access
pnpm add -g s3db.js
```

You can then run commands using `s3db` or `npx s3db` (if not installed globally).

## ✨ Key Features

*   **Database Management:** Configure connection strings, test connectivity.
*   **Resource Operations:** List, query, insert, update, delete records.
*   **Schema Management:** Create resources, view schemas, compare local vs. deployed.
*   **Testing Utilities:** Seed databases, set up and tear down test environments.
*   **Migrations:** Generate, run, and rollback database migrations.
*   **MCP Server:** Start the Model Context Protocol server for AI integration.
*   **Interactive Console:** An enhanced REPL for direct database interaction.

## 🛠️ Global Options

Most commands support the following global options:

*   `-c, --connection <string>`: Specify the S3db connection string. Overrides auto-detection.
*   `-l, --log-level <level>`: Set the log level (trace, debug, info, warn, error, fatal). Default: `info`.

## 📖 Commands

Here's a comprehensive list of available commands and their usage:

### `s3db configure`

Configure your default S3db connection settings. These settings are saved to `~/.s3db/config.json`.

```bash
s3db configure
```

You will be prompted to enter your S3 connection string and preferred default behavior for resources.

### `s3db list`

List all resources in the connected S3db instance.

```bash
s3db list
s3db list --connection "memory://test-db"
```

### `s3db query <resource>`

Query a specific resource with filters, limits, and output formats.

*   `<resource>`: The name of the resource to query.
*   `-l, --limit <number>`: Limit the number of results (default: 10).
*   `-f, --filter <json>`: Filter records using a JSON string (e.g., `'{"age": {"gt": 25}}'`).
*   `-p, --partition <name>`: Query a specific partition.
*   `--csv`: Output results in CSV format.
*   `--json`: Output results in JSON format.

```bash
s3db query users
s3db query products --filter '{"category": "electronics"}' --limit 5
s3db query orders --partition byStatus --filter '{"status": "pending"}' --csv
```

### `s3db insert <resource>`

Insert data into a resource.

*   `<resource>`: The name of the resource.
*   `-d, --data <json>`: JSON string of the data to insert.
*   `-f, --file <path>`: Path to a JSON file containing the data.

```bash
s3db insert users -d '{"name": "Alice", "email": "alice@example.com"}'
s3db insert products -f ./product-data.json
```

### `s3db update <resource> <id>`

Update an existing record in a resource.

*   `<resource>`: The name of the resource.
*   `<id>`: The ID of the record to update.
*   `-d, --data <json>`: JSON string of the data to update.

```bash
s3db update users user_abc -d '{"age": 31}'
```

### `s3db delete <resource> <id>`

Delete a record from a resource.

*   `<resource>`: The name of the resource.
*   `<id>`: The ID of the record to delete.
*   `--force`: Skip confirmation prompt.

```bash
s3db delete users user_abc
s3db delete products product_xyz --force
```

### `s3db create-resource <name>`

Create a new resource with a specified schema and behavior.

*   `<name>`: The name of the new resource.
*   `-s, --schema <json>`: JSON string representing the resource's attributes (schema).
*   `-b, --behavior <type>`: Resource behavior (e.g., `body-overflow`, `enforce-limits`). Default: `user-managed`.
*   `--timestamps`: Enable `createdAt` and `updatedAt` fields.
*   `--paranoid`: Enable soft deletes.

```bash
s3db create-resource tasks --schema '{"description": "string|required", "completed": "boolean|default:false"}' --timestamps
```

### `s3db console` (or `s3db interactive`)

Launch an enhanced interactive REPL (Read-Eval-Print Loop) for direct database interaction.

```bash
s3db console
s3db interactive # Alias
```

Inside the console:
*   `db`: The connected `S3db` instance.
*   `resource`: The currently selected resource (use `.use <name>`).
*   `.help`: Show console-specific commands.
*   `.resources`: List all resources.
*   `.use <name>`: Select an active resource.
*   `await resource.list()`: List records in the current resource.
*   `Factory`, `Seeder`: Access testing utilities.

### `s3db stats [resource]`

Display statistics about the S3db instance or a specific resource.

*   `[resource]`: Optional. The name of a resource to get detailed stats for.

```bash
s3db stats
s3db stats users
```

### `s3db schema <resource>`

Show the schema of a resource.

*   `<resource>`: The name of the resource.
*   `-f, --format <type>`: Output format (`json`, `typescript`, `bigquery`). Default: `json`.

```bash
s3db schema users
s3db schema products --format typescript
```

### `s3db schema-diff`

Compare local schema files with deployed schemas in the S3db instance.

*   `-d, --dir <path>`: Path to your local schema directory (default: `./schemas`).

```bash
s3db schema-diff
s3db schema-diff --dir ./my-schemas
```

### `s3db count <resource>`

Count records in a resource with optional grouping.

*   `<resource>`: The name of the resource.
*   `-b, --by <field>`: Group the count by a specific field.
*   `-p, --partition <name>`: Count within a specific partition.

```bash
s3db count users
s3db count orders --by status
s3db count events --partition byDate --by eventType
```

### `s3db explain <resource>`

Show the partition structure and query plans for a resource.

*   `<resource>`: The name of the resource.
*   `-p, --partition <name>`: Explain a specific partition.

```bash
s3db explain users
s3db explain orders --partition byCustomer
```

### `s3db analyze <resource>`

Analyze resource performance and storage characteristics.

*   `<resource>`: The name of the resource.

```bash
s3db analyze products
```

### `s3db test` (Subcommands)

Utilities for testing S3db applications.

#### `s3db test seed [resource]`

Seed the database with test data using factories.

*   `[resource]`: Optional. Seed a specific resource. If omitted, seeds all resources with defined factories.
*   `-n, --count <number>`: Number of records to create (default: 10).
*   `-f, --file <path>`: Path to a custom seed definition file.

```bash
s3db test seed users
s3db test seed --count 50 products
s3db test seed --file ./tests/seeds/my-custom-seed.ts
```

#### `s3db test setup`

Set up an isolated test database.

*   `-n, --name <name>`: Name for the test database (default: `test-<timestamp>`).
*   `-f, --fixtures <path>`: Path to a fixtures file to load initial data.

```bash
s3db test setup
s3db test setup --name my-feature-test --fixtures ./tests/fixtures/initial.json
```

#### `s3db test teardown`

Clean up a test database.

*   `-n, --name <name>`: Name of the test database to tear down.
*   `--all`: Tear down all test databases.

```bash
s3db test teardown --name my-feature-test
s3db test teardown --all
```

#### `s3db test truncate <resource>`

Delete all data from a specific resource.

*   `<resource>`: The name of the resource to truncate.
*   `--force`: Skip confirmation.

```bash
s3db test truncate logs
```

### `s3db migrate` (Subcommands)

Utilities for managing database schema migrations.

#### `s3db migrate generate <name>`

Generate a new migration file.

*   `<name>`: A descriptive name for the migration.
*   `-d, --dir <path>`: Directory for migration files (default: `./migrations`).

```bash
s3db migrate generate add_users_table
```

#### `s3db migrate up`

Run pending migrations.

*   `-s, --step <number>`: Number of migrations to run (default: all).

```bash
s3db migrate up
s3db migrate up --step 1
```

#### `s3db migrate down`

Rollback migrations.

*   `-s, --step <number>`: Number of migrations to rollback (default: 1).

```bash
s3db migrate down
s3db migrate down --step 3
```

#### `s3db migrate reset`

Reset all migrations (rollback all).

*   `--force`: Skip confirmation.

```bash
s3db migrate reset
```

#### `s3db migrate status`

Show the status of migrations (executed vs. pending).

```bash
s3db migrate status
```

### `s3db mcp` (or `s3db server`)

Start the Model Context Protocol (MCP) server. See the [MCP Integration Guide](./mcp.md) for more details.

*   `-p, --port <port>`: Port for HTTP transport (default: 17500).
*   `-h, --host <host>`: Host address to bind to (default: `0.0.0.0`).
*   `-t, --transport <type>`: Transport type (`stdio` or `http`). Default: `stdio`.
*   `-c, --connection <string>`: S3db connection string (auto-detected if not provided).

```bash
s3db mcp
s3db mcp --transport http --port 8000
```

## 🔗 Next Steps

*   [MCP Integration Guide](/mcp.md) - Learn how to integrate S3db with AI agents.
*   [Testing Guide](/guides/testing.md) - Deep dive into testing utilities.
*   [Performance Tuning Guide](/guides/performance-tuning.md) - Optimize your S3db applications.
