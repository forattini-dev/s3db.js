/**
 * Helper methods added to resources for EventualConsistencyPlugin
 * @module eventual-consistency/helpers
 */

import { idGenerator } from "../../concerns/id.js";
import tryFn from "../../concerns/try-fn.js";
import { getCohortInfo, resolveFieldAndPlugin } from "./utils.js";
import { PluginError } from '../../errors.js';

/**
 * Add helper methods to resources
 * This adds: set(), add(), sub(), increment(), decrement(), consolidate(), getConsolidatedValue(), recalculate()
 *
 * @param {Object} resource - Resource to add methods to
 * @param {Object} plugin - Plugin instance
 * @param {Object} config - Plugin configuration
 */
export function addHelperMethods(resource, plugin, config) {
  // Add method to set value (replaces current value)
  // Signature: set(id, field, value)
  // Supports dot notation: set(id, 'utmResults.medium', 10)
  resource.set = async (id, field, value) => {
    const { field: rootField, fieldPath, plugin: handler } = resolveFieldAndPlugin(resource, field, value);

    // Create transaction inline
    const now = new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.logLevel);

    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
      fieldPath: fieldPath,  // Store full path for nested access
      value: value,
      operation: 'set',
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: 'set',
      applied: false
    };

    await handler.transactionResource.insert(transaction);

    // In sync mode, immediately consolidate
    if (config.mode === 'sync') {
      return await plugin._syncModeConsolidate(handler, id, fieldPath);
    }

    return value;
  };

  // Add method to increment value
  // Signature: add(id, field, amount)
  // Supports dot notation: add(id, 'utmResults.medium', 5)
  resource.add = async (id, field, amount) => {
    const { field: rootField, fieldPath, plugin: handler } = resolveFieldAndPlugin(resource, field, amount);

    // Create transaction inline
    const now = new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.logLevel);

    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
      fieldPath: fieldPath,  // Store full path for nested access
      value: amount,
      operation: 'add',
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: 'add',
      applied: false
    };

    await handler.transactionResource.insert(transaction);

    // In sync mode, immediately consolidate
    if (config.mode === 'sync') {
      return await plugin._syncModeConsolidate(handler, id, fieldPath);
    }

    // Async mode - return current value (optimistic)
    // Note: For nested paths, we need to use lodash get
    const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
    if (!ok || !record) return amount;

    // Get current value from nested path
    const lodash = await import('lodash-es');
    const currentValue = lodash.get(record, fieldPath, 0);
    return currentValue + amount;
  };

  // Add method to decrement value
  // Signature: sub(id, field, amount)
  // Supports dot notation: sub(id, 'utmResults.medium', 3)
  resource.sub = async (id, field, amount) => {
    const { field: rootField, fieldPath, plugin: handler } = resolveFieldAndPlugin(resource, field, amount);

    // Create transaction inline
    const now = new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.logLevel);

    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
      fieldPath: fieldPath,  // Store full path for nested access
      value: amount,
      operation: 'sub',
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: 'sub',
      applied: false
    };

    await handler.transactionResource.insert(transaction);

    // In sync mode, immediately consolidate
    if (config.mode === 'sync') {
      return await plugin._syncModeConsolidate(handler, id, fieldPath);
    }

    // Async mode - return current value (optimistic)
    // Note: For nested paths, we need to use lodash get
    const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
    if (!ok || !record) return -amount;

    // Get current value from nested path
    const lodash = await import('lodash-es');
    const currentValue = lodash.get(record, fieldPath, 0);
    return currentValue - amount;
  };

  // Add method to increment value by 1 (shorthand for add(id, field, 1))
  // Signature: increment(id, field)
  // Supports dot notation: increment(id, 'loginCount')
  resource.increment = async (id, field) => {
    return await resource.add(id, field, 1);
  };

  // Add method to decrement value by 1 (shorthand for sub(id, field, 1))
  // Signature: decrement(id, field)
  // Supports dot notation: decrement(id, 'remainingAttempts')
  resource.decrement = async (id, field) => {
    return await resource.sub(id, field, 1);
  };

  // Add method to manually trigger consolidation
  // Signature: consolidate(id, field)
  resource.consolidate = async (id, field) => {
    if (!field) {
      throw new PluginError('Field parameter is required: consolidate(id, field)', {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'resource.consolidate',
        statusCode: 400,
        retriable: false,
        suggestion: 'Invoke consolidate with both id and field parameters.'
      });
    }

    const handler = resource._eventualConsistencyPlugins[field];

    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new PluginError(`No eventual consistency plugin found for field "${field}"`, {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'resource.consolidate',
        statusCode: 404,
        retriable: false,
        suggestion: `Available fields: ${availableFields}`,
        field
      });
    }

    return await plugin._consolidateWithHandler(handler, id);
  };

  // Add method to get consolidated value without applying
  // Signature: getConsolidatedValue(id, field, options)
  resource.getConsolidatedValue = async (id, field, options = {}) => {
    const handler = resource._eventualConsistencyPlugins[field];

    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new PluginError(`No eventual consistency plugin found for field "${field}"`, {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'resource.getConsolidatedValue',
        statusCode: 404,
        retriable: false,
        suggestion: `Available fields: ${availableFields}`,
        field
      });
    }

    return await plugin._getConsolidatedValueWithHandler(handler, id, options);
  };

  // Add method to recalculate from scratch
  // Signature: recalculate(id, field)
  resource.recalculate = async (id, field) => {
    if (!field) {
      throw new PluginError('Field parameter is required: recalculate(id, field)', {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'resource.recalculate',
        statusCode: 400,
        retriable: false,
        suggestion: 'Invoke recalculate with both id and field parameters.'
      });
    }

    const handler = resource._eventualConsistencyPlugins[field];

    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new PluginError(`No eventual consistency plugin found for field "${field}"`, {
        pluginName: 'EventualConsistencyPlugin',
        operation: 'resource.recalculate',
        statusCode: 404,
        retriable: false,
        suggestion: `Available fields: ${availableFields}`,
        field
      });
    }

    return await plugin._recalculateWithHandler(handler, id);
  };
}
