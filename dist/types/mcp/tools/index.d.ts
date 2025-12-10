/**
 * MCP Tools Registry
 * Exports all tool definitions and handlers organized by domain
 */
import type { S3dbMCPServer } from '../entrypoint.js';
/**
 * Get all tool definitions
 */
export declare function getAllTools(): any[];
/**
 * Create all tool handlers
 * @param server - Server instance with helper methods
 * @returns Map of tool name -> handler function
 */
export declare function createAllHandlers(server: S3dbMCPServer): Record<string, Function>;
/**
 * Get tools organized by category
 */
export declare function getToolsByCategory(): Record<string, any[]>;
//# sourceMappingURL=index.d.ts.map