/**
 * Install logic for EventualConsistencyPlugin
 * @module eventual-consistency/install
 */

import tryFn from "../../concerns/try-fn.js";
import { createPartitionConfig } from "./partitions.js";
import { addHelperMethods } from "./helpers.js";
import { flushPendingTransactions } from "./transactions.js";
import { startConsolidationTimer } from "./consolidation.js";
import { startGarbageCollectionTimer } from "./garbage-collection.js";
import { PluginError } from '../../errors.js';
import { getCronManager } from "../../concerns/cron-manager.js";
import { createTicketResourceSchema } from "./tickets.js";

/**
 * Install plugin for all configured resources
 *
 * @param {Object} database - Database instance
 * @param {Map} fieldHandlers - Field handlers map
 * @param {Function} completeFieldSetupFn - Function to complete field setup for a field
 * @param {Function} watchForResourceFn - Function to watch for resource creation
 * @param {Function} shouldManageResource - Predicate to determine if a resource should be managed
 */
export async function onInstall(database, fieldHandlers, completeFieldSetupFn, watchForResourceFn, shouldManageResource = () => true) {
  // Iterate over all resource/field combinations
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    if (!shouldManageResource(resourceName)) {
      continue;
    }
    const targetResource = database.resources[resourceName];

    if (!targetResource) {
      // Resource doesn't exist yet - mark for deferred setup
      for (const handler of resourceHandlers.values()) {
        handler.deferredSetup = true;
      }
      // Watch for this resource to be created
      watchForResourceFn(resourceName);
      continue;
    }

    // Resource exists - setup all fields for this resource
    for (const [fieldName, handler] of resourceHandlers) {
      handler.targetResource = targetResource;
      await completeFieldSetupFn(handler);
    }
  }
}

/**
 * Watch for a specific resource creation
 *
 * @param {string} resourceName - Resource name to watch for
 * @param {Object} database - Database instance
 * @param {Map} fieldHandlers - Field handlers map
 * @param {Function} completeFieldSetupFn - Function to complete setup for a field
 */
export function watchForResource(resourceName, database, fieldHandlers, completeFieldSetupFn) {
  const hookCallback = async ({ resource, config }) => {
    if (config.name === resourceName) {
      const resourceHandlers = fieldHandlers.get(resourceName);
      if (!resourceHandlers) return;

      // Setup all fields for this resource
      for (const [fieldName, handler] of resourceHandlers) {
        if (handler.deferredSetup) {
          handler.targetResource = resource;
          handler.deferredSetup = false;
          await completeFieldSetupFn(handler);
        }
      }
    }
  };

  database.addHook('afterCreateResource', hookCallback);
}

/**
 * Complete field setup for a single field handler
 *
 * @param {Object} handler - Field handler
 * @param {Object} database - Database instance
 * @param {Object} config - Plugin configuration
 * @param {Object} plugin - Plugin instance (for adding helper methods)
 * @returns {Promise<void>}
 */
export async function completeFieldSetup(handler, database, config, plugin) {
  if (!handler.targetResource) return;

  const resourceName = handler.resource;
  const fieldName = handler.field;

  if (plugin && typeof plugin.resourceFilter === 'function' && !plugin.resourceFilter(resourceName)) {
    return;
  }

  // Create transaction resource with partitions (plg_ prefix for plugin resources)
  const transactionResourceName = `plg_${resourceName}_tx_${fieldName}`;
  const partitionConfig = createPartitionConfig();

  const [ok, err, transactionResource] = await tryFn(() =>
    database.createResource({
      name: transactionResourceName,
      attributes: {
        id: 'string|required',
        originalId: 'string|required',
        field: 'string|required',
        fieldPath: 'string|optional',  // Support for nested field paths (e.g., 'utmResults.medium')
        value: 'number|required',
        operation: 'string|required',
        timestamp: 'string|required',
        cohortDate: 'string|required',
        cohortHour: 'string|required',
        cohortWeek: 'string|optional',
        cohortMonth: 'string|optional',
        source: 'string|optional',
        applied: 'boolean|optional'
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: partitionConfig,
      asyncPartitions: true,
      createdBy: 'EventualConsistencyPlugin'
    })
  );

  if (!ok && !database.resources[transactionResourceName]) {
    throw new PluginError(`Failed to create transaction resource for ${resourceName}.${fieldName}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'createTransactionResource',
      statusCode: 500,
      retriable: false,
      suggestion: 'Verify database permissions and configuration for creating plugin resources.',
      resourceName,
      fieldName,
      original: err
    });
  }

  handler.transactionResource = ok ? transactionResource : database.resources[transactionResourceName];

  // Create ticket resource for coordinator mode workload distribution
  if (config.enableCoordinator) {
    await createTicketResource(handler, database, resourceName, fieldName);
  }

  // Locks are now managed by PluginStorage with TTL - no Resource needed
  // Lock acquisition is handled via storage.acquireLock() with automatic expiration

  // Create analytics resource if enabled
  if (config.enableAnalytics) {
    await createAnalyticsResource(handler, database, resourceName, fieldName);
  }

  // Add helper methods to the target resource
  addHelperMethodsForHandler(handler, plugin, config);

  if (config.verbose) {
    // this.logger.info(
    //   `[EventualConsistency] ${resourceName}.${fieldName} - ` +
    //   `Setup complete. Resources: ${transactionResourceName}` +
    //   `${config.enableAnalytics ? `, plg_${resourceName}_an_${fieldName}` : ''}` +
    //   ` (locks via PluginStorage TTL)`
    // );
  }
}

/**
 * Create analytics resource for a field handler
 *
 * @param {Object} handler - Field handler
 * @param {Object} database - Database instance
 * @param {string} resourceName - Resource name
 * @param {string} fieldName - Field name
 * @returns {Promise<void>}
 */
async function createAnalyticsResource(handler, database, resourceName, fieldName) {
  const analyticsResourceName = `plg_${resourceName}_an_${fieldName}`;

  const [ok, err, analyticsResource] = await tryFn(() =>
    database.createResource({
      name: analyticsResourceName,
      attributes: {
        id: 'string|required',
        field: 'string|required',
        period: 'string|required',
        cohort: 'string|required',
        transactionCount: 'number|required',
        totalValue: 'number|required',
        avgValue: 'number|required',
        minValue: 'number|required',
        maxValue: 'number|required',
        operations: 'object|optional',
        recordCount: 'number|required',
        consolidatedAt: 'string|required',
        updatedAt: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: false,
      asyncPartitions: true,
      // ✅ Multi-attribute partitions for optimal analytics query performance
      partitions: {
        // Query by period (hour/day/week/month)
        byPeriod: {
          fields: { period: 'string' }
        },
        // Query by period + cohort (e.g., all hour records for specific hours)
        byPeriodCohort: {
          fields: {
            period: 'string',
            cohort: 'string'
          }
        },
        // Query by field + period (e.g., all daily analytics for clicks field)
        byFieldPeriod: {
          fields: {
            field: 'string',
            period: 'string'
          }
        }
      },
      createdBy: 'EventualConsistencyPlugin'
    })
  );

  if (!ok && !database.resources[analyticsResourceName]) {
    throw new PluginError(`Failed to create analytics resource for ${resourceName}.${fieldName}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'createAnalyticsResource',
      statusCode: 500,
      retriable: false,
      suggestion: 'Verify database permissions and configuration for creating analytics resources.',
      resourceName,
      fieldName,
      original: err
    });
  }

  handler.analyticsResource = ok ? analyticsResource : database.resources[analyticsResourceName];
}

/**
 * Create ticket resource for a field handler (coordinator mode)
 *
 * Tickets are used to distribute consolidation workload across multiple workers.
 * The coordinator creates tickets by querying pending transactions, and workers
 * claim tickets atomically to process batches of records.
 *
 * @param {Object} handler - Field handler
 * @param {Object} database - Database instance
 * @param {string} resourceName - Resource name
 * @param {string} fieldName - Field name
 * @returns {Promise<void>}
 */
async function createTicketResource(handler, database, resourceName, fieldName) {
  const ticketResourceName = `plg_${resourceName}_${fieldName}_tickets`;
  const ticketSchema = createTicketResourceSchema();

  const [ok, err, ticketResource] = await tryFn(() =>
    database.createResource({
      name: ticketResourceName,
      ...ticketSchema,
      createdBy: 'EventualConsistencyPlugin'
    })
  );

  if (!ok && !database.resources[ticketResourceName]) {
    throw new PluginError(`Failed to create ticket resource for ${resourceName}.${fieldName}`, {
      pluginName: 'EventualConsistencyPlugin',
      operation: 'createTicketResource',
      statusCode: 500,
      retriable: false,
      suggestion: 'Verify database permissions and configuration for creating ticket resources.',
      resourceName,
      fieldName,
      original: err
    });
  }

  handler.ticketResource = ok ? ticketResource : database.resources[ticketResourceName];
}

/**
 * Add helper methods to the target resource for a field handler
 *
 * @param {Object} handler - Field handler
 * @param {Object} plugin - Plugin instance
 * @param {Object} config - Plugin configuration
 */
function addHelperMethodsForHandler(handler, plugin, config) {
  const resource = handler.targetResource;
  const fieldName = handler.field;

  // Store handler reference on the resource for later access
  if (!resource._eventualConsistencyPlugins) {
    resource._eventualConsistencyPlugins = {};
  }
  resource._eventualConsistencyPlugins[fieldName] = handler;

  // Add helper methods if not already added
  if (!resource.add) {
    addHelperMethods(resource, plugin, config);
  }
}

/**
 * Start timers and emit events for all field handlers
 *
 * @param {Map} fieldHandlers - Field handlers map
 * @param {Object} config - Plugin configuration
 * @param {Function} runConsolidationFn - Function to run consolidation for a handler
 * @param {Function} runGCFn - Function to run GC for a handler
 * @param {Function} emitFn - Function to emit events
 * @returns {Promise<void>}
 */
export async function onStart(fieldHandlers, config, runConsolidationFn, runGCFn, emitFn) {
  // Start timers and emit events for all field handlers
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    for (const [fieldName, handler] of resourceHandlers) {
      if (!handler.deferredSetup) {
        // Start auto-consolidation timer if enabled
        if (config.autoConsolidate && config.mode === 'async') {
          startConsolidationTimer(handler, resourceName, fieldName, runConsolidationFn, config);
        }

        // Start garbage collection timer
        if (config.transactionRetention && config.transactionRetention > 0) {
          startGarbageCollectionTimer(handler, resourceName, fieldName, runGCFn, config);
        }

        if (emitFn) {
          emitFn('plg:eventual-consistency:started', {
            resource: resourceName,
            field: fieldName,
            cohort: config.cohort
          });
        }
      }
    }
  }
}

/**
 * Stop all timers and flush pending transactions
 *
 * @param {Map} fieldHandlers - Field handlers map
 * @param {Function} emitFn - Function to emit events
 * @returns {Promise<void>}
 */
export async function onStop(fieldHandlers, emitFn) {
  const cronManager = getCronManager();

  // Stop all timers for all handlers
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    for (const [fieldName, handler] of resourceHandlers) {
      // Stop consolidation job
      if (handler.consolidationJobName) {
        cronManager.stop(handler.consolidationJobName);
        handler.consolidationJobName = null;
      }

      // Stop garbage collection job
      if (handler.gcJobName) {
        cronManager.stop(handler.gcJobName);
        handler.gcJobName = null;
      }

      // Flush pending transactions
      if (handler.pendingTransactions && handler.pendingTransactions.size > 0) {
        await flushPendingTransactions(handler);
      }

      if (emitFn) {
        emitFn('plg:eventual-consistency:stopped', {
          resource: resourceName,
          field: fieldName
        });
      }
    }
  }
}
