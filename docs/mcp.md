# MCP Server

s3db.js ships a built-in [Model Context Protocol](https://modelcontextprotocol.io) server. It lets any MCP-compatible AI client (Claude, Cursor, Windsurf, etc.) discover and use s3db capabilities through natural language.

---

## Operating Modes

The server operates in one of two modes, determined at startup by the presence of a connection string.

### Library Mode

When **no connection string is provided**, the server starts in Library Mode.

- No database connection is attempted
- Exposes **documentation tools, resources, and prompts** only
- Purpose: teach users how to design schemas, choose field types, configure plugins, and use s3db correctly
- Can be promoted to Full Mode at runtime by calling the `dbConnect` tool

```
[s3db MCP] Library mode — no connection string found. Serving documentation only.
```

### Full Mode

When a **connection string is provided** (via env var, config file, or CLI flag), the server starts in Full Mode.

- Connects to the database automatically
- Exposes **everything**: documentation + all CRUD tools + live resource introspection
- This is the mode used in production integrations

```
[s3db MCP] Full mode — connected to database.
```

### Runtime Promotion

Library Mode is not permanent. If a user calls `dbConnect` with valid credentials during a session, the server flips to Full Mode immediately — no restart required. All subsequent `listTools`, `listResources`, and `listPrompts` calls will reflect the full set.

---

## Setup

### Claude Code / Claude Desktop

```bash
# Library mode (documentation only — no credentials needed)
claude mcp add s3db -- npx -y s3db.js mcp

# Full mode (connect to your database)
claude mcp add s3db \
  -e S3DB_CONNECTION_STRING=s3://KEY:SECRET@my-bucket \
  -- npx -y s3db.js mcp
```

For Claude Desktop, add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "s3db": {
      "command": "npx",
      "args": ["-y", "s3db.js", "mcp"],
      "env": {
        "S3DB_CONNECTION_STRING": "s3://KEY:SECRET@my-bucket"
      }
    }
  }
}
```

### HTTP Transport

```bash
# Library mode
npx s3db.js mcp --transport=http

# Full mode
S3DB_CONNECTION_STRING=s3://KEY:SECRET@my-bucket npx s3db.js mcp --transport=http --port=17500
```

The HTTP server listens on `0.0.0.0:17500` by default. Each request creates a fresh transport (stateless). Endpoints:
- `POST /mcp` — tool calls and MCP protocol messages
- `GET /health` — health check

---

## Connection String

The server resolves the connection string from multiple sources, in priority order:

| Priority | Source |
|----------|--------|
| 1 | `--connection` CLI flag |
| 2 | `S3DB_CONNECTION_STRING` env var |
| 3 | `S3_CONNECTION_STRING` env var (alias) |
| 4 | `s3db.config.json` in the working directory |
| 5 | AWS env vars (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_S3_BUCKET`) |

### Connection String Formats

```bash
# AWS S3
s3://ACCESS_KEY:SECRET_KEY@bucket-name?region=us-east-1

# MinIO / S3-compatible
http://minioadmin:minioadmin@localhost:9000/my-bucket

# SQLite (persistent local)
sqlite:///tmp/s3db.sqlite

# In-memory (testing)
memory://my-bucket

# Filesystem (testing)
file:///tmp/s3db
```

Credentials containing special characters must be URL-encoded (e.g., `+` → `%2B`, `/` → `%2F`).

### Config File (`s3db.config.json`)

```json
{
  "connectionString": "s3://KEY:SECRET@my-bucket",
  "region": "us-east-1"
}
```

The config file path can be overridden with `S3DB_CONFIG=/path/to/config.json`.

---

## Tools

### Library Mode Tools

| Tool | Description |
|------|-------------|
| `s3dbSearchDocs` | Fuzzy-search across all s3db documentation |

### Full Mode Tools (all of the above plus)

**CRUD**

| Tool | Description |
|------|-------------|
| `resourceGet` | Get a document by ID |
| `resourceList` | List documents with optional filters and pagination |
| `resourcePage` | Cursor-based or page-number pagination |
| `resourceCount` | Count documents in a resource |
| `resourceInsert` | Insert a single document (atomic, prevents duplicate IDs) |
| `resourceInsertMany` | Insert multiple documents in one call |
| `resourceUpdate` | Update a document (GET + merge + PUT) |
| `resourceDelete` | Delete a document by ID |

**Query**

| Tool | Description |
|------|-------------|
| `resourceQuery` | Filter documents by field values — uses partitions when available for O(1) |

**Resource Management**

| Tool | Description |
|------|-------------|
| `dbListResources` | List all resources in the database |
| `dbCreateResource` | Create a new resource with schema and partitions |

**Connection**

| Tool | Description |
|------|-------------|
| `dbConnect` | Connect to a database (also promotes Library Mode to Full Mode) |
| `dbStatus` | Show current connection status and resource count |

### Advanced Tools (registered, callable by name)

These tools are not advertised by default but can be called directly if you know their names:

| Category | Tools |
|----------|-------|
| Bulk | `resourceUpdateMany`, `resourceBulkUpsert`, `resourceDeleteAll` |
| CRUD (extended) | `resourceGetMany`, `resourceUpsert`, `resourceDeleteMany`, `resourceExists`, `resourceListIds`, `resourceGetAll` |
| Partitions | `resourceListPartitions`, `resourceListPartitionValues`, `dbFindOrphanedPartitions`, `dbRemoveOrphanedPartitions` |
| Export / Import | `resourceExport`, `resourceImport`, `dbBackupMetadata` |
| Stats | `dbGetStats`, `dbClearCache`, `resourceGetStats`, `cacheGetStats` |
| Debugging | `dbInspectResource`, `dbGetMetadata`, `resourceValidate`, `dbHealthCheck`, `resourceGetRaw` |
| Connection | `dbDisconnect` |
| Docs (extended) | `s3dbSearchCoreDocs`, `s3dbSearchPluginDocs`, `s3dbListCoreTopics`, `s3dbListPluginTopics` |

---

## Resources (`s3db://` URIs)

Resources provide structured documentation and live schema information via URI templates.

### Available in Both Modes

| URI | Description |
|-----|-------------|
| `s3db://overview` | Full capabilities overview |
| `s3db://best-practices` | Behaviors, partitions, and performance guide |
| `s3db://core/{topic}` | Core docs — `database`, `schema`, `behaviors`, `partitions`, `security`, `streaming`, `encryption` |
| `s3db://plugin/{name}` | Plugin docs — `api`, `audit`, `cache`, `full-text`, `metrics`, `replicator`, `state-machine`, `ttl`, `vector`, etc. |
| `s3db://guide/{topic}` | Guides — `getting-started`, `performance`, `testing`, `security` |
| `s3db://field-type/{type}` | Field type reference — `string`, `password`, `secret`, `embedding`, `ip4`, etc. |
| `s3db://client/{name}` | Storage client docs — `s3`, `sqlite`, `memory`, `filesystem` |

### Available in Full Mode Only

| URI | Description |
|-----|-------------|
| `s3db://resource/{name}` | Live schema, partitions, behavior, and usage examples for a connected resource |

Reading `s3db://resource/{name}` in Library Mode returns a helpful message explaining how to connect.

---

## Prompts

Prompts are structured templates that guide the AI to help with common s3db tasks.

### Available in Both Modes

| Prompt | Description |
|--------|-------------|
| `create_resource` | Generate a resource definition with schema, partitions, and behavior |
| `setup_plugin` | Configure any plugin with best practices |
| `create_partition_strategy` | Design partitions for your query patterns |
| `create_api_server` | Set up ApiPlugin with guards and OpenAPI |
| `migrate_from_mongodb` | Migration guide from MongoDB |
| `migrate_from_dynamodb` | Migration guide from DynamoDB |
| `migrate_from_prisma` | Migration guide from Prisma/PostgreSQL |
| `explain_behavior` | Explain body-overflow, body-only, truncate-data, enforce-limits |
| `explain_partitions` | Explain partition design and O(1) lookup patterns |
| `compare_clients` | Compare S3, memory, and filesystem clients |
| `explain_plugin` | Deep dive into any plugin's capabilities |

### Available in Full Mode Only

| Prompt | Description |
|--------|-------------|
| `debug_connection` | Diagnose connection issues with a live database |
| `debug_query_performance` | Identify slow queries and missing partitions |
| `optimize_costs` | Analyze and reduce S3 API call costs |
| `setup_vector_rag` | Configure VectorPlugin for RAG pipelines |
| `setup_replication` | Set up ReplicatorPlugin for BigQuery, PostgreSQL, or SQS |

---

## Architecture

### Startup Sequence

```
1. dotenv loads .env from process.cwd()
2. S3dbMCPServer constructor registers all handlers
3. preloadSearch() ensures docs are available (local or cloned from GitHub)
4. resolveConfig() merges: DEFAULTS < s3db.config.json < env vars
5. If connectionString present → isLibraryMode = false → auto-connect database
6. Transport starts (stdio or HTTP)
7. Signal handlers register SIGINT/SIGTERM → graceful disconnect
```

### Global State

A single `database` variable holds the active connection. Tool handlers receive it as an injected parameter. The `dbConnect` tool returns a new instance that replaces the global. `dbDisconnect` nulls it out.

### Documentation Search

The `s3dbSearchDocs` tool uses [Fuse.js](https://fusejs.io/) for fuzzy search. On startup:
1. Checks for local `docs/` directory (present when running from source)
2. If not found, clones the GitHub repo with `git sparse-checkout` into `~/.cache/s3db-mcp/docs/`
3. Builds two separate Fuse.js indexes: core docs and plugin docs
4. Searches both in parallel and merges results by relevance score

### Mode Flag

`S3dbMCPServer.isLibraryMode` is a mutable boolean:
- Initialized to `true`
- Set to `false` at startup when a connection string exists
- Flipped to `false` at runtime when `dbConnect` succeeds

`ListToolsRequestSchema`, `ListResourceTemplatesRequestSchema`, and `ListPromptsRequestSchema` all gate their responses on this flag, so the transition is seamless and immediate.

---

## Examples

### Ask About Schema Design (Library Mode)

```
User: How do I model a users resource with email login and role-based access?

→ AI uses s3dbSearchDocs to find relevant docs
→ AI reads s3db://core/schema and s3db://field-type/password
→ AI uses create_resource prompt to generate schema
```

### Explore State Machine Plugin in Docs

```
User: How does state machine validation and history work here?

→ AI reads s3db://plugin/state-machine for machine capabilities
→ AI explains transition rejection contract, history APIs, and snapshot helpers
```

### Query Live Data (Full Mode)

```
User: Show me all orders placed in the last 7 days

→ AI calls dbListResources to see available resources
→ AI reads s3db://resource/orders to understand schema and partitions
→ AI calls resourceQuery with appropriate partition values
```

### Read State Timeline from a Live Resource

```
User: Give me the last 10 transitions for order order-42

→ AI reads s3db://resource/orders to confirm state-field and bindings
→ AI calls db.resources.orders.state.getLastTransitions('order-42', 10)
→ AI returns a recency-first timeline with event, states, and context
```

### Connect at Runtime

```
User: Connect to s3://mykey:mysecret@prod-bucket

→ AI calls dbConnect({ connectionString: "s3://mykey:mysecret@prod-bucket" })
→ Server flips to Full Mode
→ All tools, resources, and prompts now available
```
