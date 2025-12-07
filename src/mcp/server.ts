import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { SearchService } from "./search.js";

export class S3dbMcpServer {
  private server: McpServer;
  private searchService: SearchService;

  constructor() {
    this.server = new McpServer({
      name: "s3db-mcp",
      version: "1.0.0"
    });
    this.searchService = new SearchService();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "search_core_docs",
      "Search the Core S3DB documentation (setup, basic usage, architecture)",
      { query: z.string().describe("The search query") },
      async ({ query }) => {
        const results = await this.searchService.searchCore(query);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
        };
      }
    );

    this.server.tool(
      "search_plugin_docs",
      "Search the S3DB Plugins documentation (specific features, integrations)",
      { query: z.string().describe("The search query") },
      async ({ query }) => {
        const results = await this.searchService.searchPlugins(query);
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
        };
      }
    );
  }

  async connect(transport: Transport) {
    await this.server.connect(transport);
  }
}
