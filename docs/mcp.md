# 🤖 Model Context Protocol (MCP) Integration

s3db.js integrates with the Model Context Protocol (MCP) to expose its capabilities to Large Language Models (LLMs) and AI agents. This allows AI to interact with your S3db instances, perform database operations, retrieve information, and automate tasks through natural language commands or structured tool calls.

## 🚀 What is MCP?

The Model Context Protocol (MCP) is an open standard that allows AI models to discover and interact with external tools and services. It acts as a universal adapter, translating AI requests into actionable calls to your applications and vice-versa.

With MCP, your AI agent can:
*   **Discover S3db tools:** Understand what operations S3db can perform (list resources, query data, run migrations).
*   **Execute S3db operations:** Call specific database functions with parameters.
*   **Receive structured results:** Get back data in a format it can easily parse and understand.

## 🛠️ MCP Server Setup

s3db.js includes a built-in MCP server that exposes S3db's functionalities as tools.

### 1. Starting the MCP Server

You can start the MCP server using the `s3db` CLI:

```bash
# Start in stdio mode (default, for direct integration with AI runtimes)
s3db mcp

# Start with HTTP transport (for browser-based agents or external tools)
s3db mcp --transport http --port 17500

# Specify a connection string if not auto-detected
s3db mcp --transport http --port 17500 --connection "s3://KEY:SECRET@mybucket/databases/mcp-db"

# Or use environment variables
S3DB_CONNECTION_STRING="s3://KEY:SECRET@mybucket/databases/mcp-db" s3db mcp --transport http --port 17500
```

### 2. Available Transports

*   **`stdio` (Default):** Communicates over standard input/output. Ideal for direct integration with AI runtimes that can spawn a child process and exchange JSON-RPC messages.
*   **`http`:** Exposes an HTTP endpoint (`/mcp`) for tool calls and a `/health` endpoint for monitoring. Suitable for web-based AI agents or external services.

### 3. Connection String Detection

The MCP server will attempt to auto-detect your S3db connection string from multiple sources, in order of priority:
1.  `--connection` CLI option
2.  `S3DB_CONNECTION_STRING`, `S3_CONNECTION_STRING`, `DATABASE_URL` environment variables
3.  AWS environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`)
4.  `~/.config/mcp/config.json` (MCP client configuration)

If no connection string is provided or detected, the server will start, but you'll need to explicitly connect using an MCP tool (e.g., `dbConnect` tool).

## 🤖 Interacting with AI Agents

Once the MCP server is running, your AI agent can discover and call S3db tools. The exact integration method depends on your AI platform (e.g., Google Gemini, OpenAI, Claude).

**Example (Conceptual - Gemini Tool Calling):**

Imagine you have a `users` resource in S3db. An AI agent might use tools like this:

```json
// AI Agent calling a tool to list resources
{
  "tool_code": "listResources",
  "parameters": {}
}

// Response from S3db MCP Server
{
  "content": [
    {
      "type": "text",
      "text": "[\"users\", \"products\", \"orders\"]"
    }
  ],
  "tool_code": "listResources",
  "result": ["users", "products", "orders"]
}

// AI Agent calling a tool to query users
{
  "tool_code": "queryResource",
  "parameters": {
    "resourceName": "users",
    "filter": { "age": { "gt": 25 } },
    "limit": 10
  }
}

// Response from S3db MCP Server
{
  "content": [
    {
      "type": "text",
      "text": "[{\"id\":\"usr_abc\",\"name\":\"Alice\",\"email\":\"alice@example.com\",\"age\":30}]"
    }
  ],
  "tool_code": "queryResource",
  "result": [
    {
      "id": "usr_abc",
      "name": "Alice",
      "email": "alice@example.com",
      "age": 30
    }
  ]
}
```

## ✨ Available S3db Tools (via MCP)

The S3db MCP server exposes a rich set of tools covering various aspects of S3db functionality:

*   **Connection Management:** `dbConnect`, `dbDisconnect`, `dbStatus`
*   **Resource Management:** `createResource`, `getResourceSchema`, `listResources`, `resourceExists`
*   **CRUD Operations:** `insertRecord`, `getRecord`, `updateRecord`, `deleteRecord`, `listRecords`, `queryRecords`, `countRecords`
*   **Partitioning:** `listPartition`, `countPartition`
*   **Bulk Operations:** `insertManyRecords`, `getManyRecords`, `deleteManyRecords`
*   **Export/Import:** `exportResource`, `importResource`
*   **Statistics:** `getStats`, `getResourceStats`
*   **Documentation Search:** `searchDocumentation` (leverages the built-in documentation search functionality)

Each tool has a clear schema for its parameters and expected output, enabling seamless integration with AI agents.

## 🔗 Next Steps

*   [CLI Reference](./cli.md) - Learn more about the `s3db` command-line interface.
*   [Core Concepts: S3db Instances](../core/database.md) - Understand database configuration.
*   [Model Context Protocol Documentation](https://modelcontextprotocol.dev/docs) - Learn more about the MCP standard.
