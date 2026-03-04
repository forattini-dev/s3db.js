/**
 * MCP Tools Registry
 * Exports all tool definitions and handlers organized by domain
 */

import { connectionTools, createConnectionHandlers } from './connection.js';
import { resourceManagementTools, createResourceManagementHandlers } from './resources.js';
import { crudTools, createCrudHandlers } from './crud.js';
import { debuggingTools, createDebuggingHandlers } from './debugging.js';
import { queryTools, createQueryHandlers } from './query.js';
import { partitionTools, createPartitionHandlers } from './partitions.js';
import { bulkTools, createBulkHandlers } from './bulk.js';
import { exportImportTools, createExportImportHandlers } from './export-import.js';
import { statsTools, createStatsHandlers } from './stats.js';
import { docsSearchTools, createDocsSearchHandlers } from './docs-search.js';
import type { S3dbMCPServer } from '../entrypoint.js';

/**
 * Get all tool definitions
 */
export function getAllTools(): any[] {
  return [
    ...docsSearchTools,
    ...connectionTools,
    ...resourceManagementTools,
    ...crudTools,
    ...debuggingTools,
    ...queryTools,
    ...partitionTools,
    ...bulkTools,
    ...exportImportTools,
    ...statsTools
  ];
}

/**
 * Create all tool handlers
 * @param server - Server instance with helper methods
 * @returns Map of tool name -> handler function
 */
export function createAllHandlers(server: S3dbMCPServer): Record<string, Function> {
  return {
    ...createDocsSearchHandlers(server),
    ...createConnectionHandlers(server),
    ...createResourceManagementHandlers(server),
    ...createCrudHandlers(server),
    ...createDebuggingHandlers(server),
    ...createQueryHandlers(server),
    ...createPartitionHandlers(server),
    ...createBulkHandlers(server),
    ...createExportImportHandlers(server),
    ...createStatsHandlers(server)
  };
}

/**
 * Get tools organized by category
 */
export function getToolsByCategory(): Record<string, any[]> {
  return {
    docsSearch: docsSearchTools,
    connection: connectionTools,
    resources: resourceManagementTools,
    crud: crudTools,
    debugging: debuggingTools,
    query: queryTools,
    partitions: partitionTools,
    bulk: bulkTools,
    exportImport: exportImportTools,
    stats: statsTools
  };
}
