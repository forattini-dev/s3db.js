import { WebSocketResourceConfig } from '../server.js';
/**
 * Normalize resources configuration for WebSocket plugin
 *
 * Each resource can have:
 * - auth: Array of allowed roles or true/false
 * - protected: Array of field names to filter from responses
 * - guard: Object with operation-specific guard functions
 * - events: Array of events to broadcast ('insert', 'update', 'delete')
 *
 * @param resourcesConfig - Raw resources configuration
 * @param logger - Logger instance
 * @returns Normalized resources configuration
 */
export declare function normalizeResourcesConfig(resourcesConfig: Record<string, any> | undefined, logger: any): Record<string, WebSocketResourceConfig>;
//# sourceMappingURL=normalize-resources.d.ts.map