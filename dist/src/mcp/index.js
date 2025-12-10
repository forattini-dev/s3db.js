#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { S3dbMcpServer } from "./server.js";
async function main() {
    const server = new S3dbMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("S3DB MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map