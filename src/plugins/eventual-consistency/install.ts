/**
 * Install logic for EventualConsistencyPlugin
 * @module eventual-consistency/install
 */

import tryFn from '../../concerns/try-fn.js';
import { createPartitionConfig } from './partitions.js';
import { addHelperMethods, type EventualConsistencyPlugin, type TargetResource } from './helpers.js';
import { flushPendingTransactions } from './transactions.js';
import { startConsolidationTimer, type RunConsolidationCallback } from './consolidation.js';
import { startGarbageCollectionTimer, type RunGCCallback, type EmitFunction } from './garbage-collection.js';
import { PluginError } from '../../errors.js';
import { getCronManager } from '../../concerns/cron-manager.js';
import { createTicketResourceSchema } from './tickets.js';
import type { FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';

export type FieldHandlers = Map<string, Map<string, FieldHandler>>;
export type ResourceFilter = (resourceName: string) => boolean;

export interface Database {
  resources: Record<string, any>;
  createResource(config: any): Promise<any>;
  addHook(hookName: string, callback: HookCallback): void;
}

export interface HookCallback {
  (params: { resource: any; config: { name: string } }): Promise<void>;
}

/**
 * Install plugin for all configured resources
 *
 * @param database - Database instance
 * @param fieldHandlers - Field handlers map
 * @param completeFieldSetupFn - Function to complete field setup for a field
 * @param watchForResourceFn - Function to watch for resource creation
 * @param shouldManageResource - Predicate to determine if a resource should be managed
 */
export async function onInstall(
  database: Database,
  fieldHandlers: FieldHandlers,
  completeFieldSetupFn: (handler: FieldHandler) => Promise<void>,
  watchForResourceFn: (resourceName: string) => void,
  shouldManageResource: ResourceFilter = () => true
): Promise<void> {
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    if (!shouldManageResource(resourceName)) {
      continue;
    }
    const targetResource = database.resources[resourceName];

    if (!targetResource) {
      for (const handler of resourceHandlers.values()) {
        handler.deferredSetup = true;
      }
      watchForResourceFn(resourceName);
      continue;
    }

    for (const [, handler] of resourceHandlers) {
      handler.targetResource = targetResource;
      await completeFieldSetupFn(handler);
    }
  }
}

/**
 * Watch for a specific resource creation
 *
 * @param resourceName - Resource name to watch for
 * @param database - Database instance
 * @param fieldHandlers - Field handlers map
 * @param completeFieldSetupFn - Function to complete setup for a field
 */
export function watchForResource(
  resourceName: string,
  database: Database,
  fieldHandlers: FieldHandlers,
  completeFieldSetupFn: (handler: FieldHandler) => Promise<void>
): void {
  const hookCallback: HookCallback = async ({ resource, config }) => {
    if (config.name === resourceName) {
      const resourceHandlers = fieldHandlers.get(resourceName);
      if (!resourceHandlers) return;

      for (const [, handler] of resourceHandlers) {
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

export interface PluginInstance extends EventualConsistencyPlugin {
  resourceFilter?: ResourceFilter;
}

/**
 * Complete field setup for a single field handler
 *
 * @param handler - Field handler
 * @param database - Database instance
 * @param config - Plugin configuration
 * @param plugin - Plugin instance (for adding helper methods)
 */
export async function completeFieldSetup(
  handler: FieldHandler,
  database: Database,
  config: NormalizedConfig,
  plugin: PluginInstance
): Promise<void> {
  if (!handler.targetResource) return;

  const resourceName = handler.resource;
  const fieldName = handler.field;

  if (plugin && typeof plugin.resourceFilter === 'function' && !plugin.resourceFilter(resourceName)) {
    return;
  }

  const transactionResourceName = `plg_${resourceName}_tx_${fieldName}`;
  const partitionConfig = createPartitionConfig();

  const [ok, err, transactionResource] = await tryFn(() =>
    database.createResource({
      name: transactionResourceName,
      attributes: {
        id: 'string|required',
        originalId: 'string|required',
        field: 'string|required',
        fieldPath: 'string|optional',
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

  if (config.enableCoordinator) {
    await createTicketResource(handler, database, resourceName, fieldName);
  }

  if (config.enableAnalytics) {
    await createAnalyticsResource(handler, database, resourceName, fieldName);
  }

  addHelperMethodsForHandler(handler, plugin, config);
}

/**
 * Create analytics resource for a field handler
 */
async function createAnalyticsResource(
  handler: FieldHandler,
  database: Database,
  resourceName: string,
  fieldName: string
): Promise<void> {
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
      partitions: {
        byPeriod: {
          fields: { period: 'string' }
        },
        byPeriodCohort: {
          fields: {
            period: 'string',
            cohort: 'string'
          }
        },
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
 */
async function createTicketResource(
  handler: FieldHandler,
  database: Database,
  resourceName: string,
  fieldName: string
): Promise<void> {
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
 */
function addHelperMethodsForHandler(
  handler: FieldHandler,
  plugin: PluginInstance,
  config: NormalizedConfig
): void {
  const resource = handler.targetResource as TargetResource;
  const fieldName = handler.field;

  if (!resource._eventualConsistencyPlugins) {
    resource._eventualConsistencyPlugins = {};
  }
  resource._eventualConsistencyPlugins[fieldName] = handler;

  if (!resource.add) {
    addHelperMethods(resource, plugin, config);
  }
}

/**
 * Start timers and emit events for all field handlers
 *
 * @param fieldHandlers - Field handlers map
 * @param config - Plugin configuration
 * @param runConsolidationFn - Function to run consolidation for a handler
 * @param runGCFn - Function to run GC for a handler
 * @param emitFn - Function to emit events
 */
export async function onStart(
  fieldHandlers: FieldHandlers,
  config: NormalizedConfig,
  runConsolidationFn: RunConsolidationCallback,
  runGCFn: RunGCCallback,
  emitFn?: EmitFunction
): Promise<void> {
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    for (const [fieldName, handler] of resourceHandlers) {
      if (!handler.deferredSetup) {
        if (!config.enableCoordinator) {
          if (config.autoConsolidate && config.mode === 'async') {
            startConsolidationTimer(handler, resourceName, fieldName, runConsolidationFn, config);
          }

          if (config.transactionRetention && config.transactionRetention > 0) {
            startGarbageCollectionTimer(handler, resourceName, fieldName, runGCFn, config);
          }
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
 * @param fieldHandlers - Field handlers map
 * @param emitFn - Function to emit events
 */
export async function onStop(
  fieldHandlers: FieldHandlers,
  emitFn?: EmitFunction
): Promise<void> {
  const cronManager = getCronManager();

  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    for (const [fieldName, handler] of resourceHandlers) {
      if (handler.consolidationJobName) {
        cronManager.stop(handler.consolidationJobName);
        handler.consolidationJobName = undefined;
      }

      if (handler.gcJobName) {
        cronManager.stop(handler.gcJobName);
        handler.gcJobName = undefined;
      }

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
