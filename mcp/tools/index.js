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

/**
 * Get all tool definitions
 */
export function getAllTools() {
  return [
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
 * @param {Object} server - Server instance with helper methods
 * @returns {Object} Map of tool name -> handler function
 */
export function createAllHandlers(server) {
  return {
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
export function getToolsByCategory() {
  return {
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
