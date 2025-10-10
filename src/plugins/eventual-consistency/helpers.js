/**
 * Helper methods added to resources for EventualConsistencyPlugin
 * @module eventual-consistency/helpers
 */

import { idGenerator } from "../../concerns/id.js";
import tryFn from "../../concerns/try-fn.js";
import { getCohortInfo, resolveFieldAndPlugin } from "./utils.js";

/**
 * Add helper methods to resources
 * This adds: set(), add(), sub(), consolidate(), getConsolidatedValue(), recalculate()
 *
 * @param {Object} resource - Resource to add methods to
 * @param {Object} plugin - Plugin instance
 * @param {Object} config - Plugin configuration
 */
export function addHelperMethods(resource, plugin, config) {
  // Add method to set value (replaces current value)
  // Signature: set(id, field, value)
  resource.set = async (id, field, value) => {
    const { plugin: handler } = resolveFieldAndPlugin(resource, field, value);

    // Create transaction inline
    const now = new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);

    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
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
      return await plugin._syncModeConsolidate(handler, id, field);
    }

    return value;
  };

  // Add method to increment value
  // Signature: add(id, field, amount)
  resource.add = async (id, field, amount) => {
    const { plugin: handler } = resolveFieldAndPlugin(resource, field, amount);

    // Create transaction inline
    const now = new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);

    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
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
      return await plugin._syncModeConsolidate(handler, id, field);
    }

    // Async mode - return current value (optimistic)
    const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
    const currentValue = (ok && record) ? (record[field] || 0) : 0;
    return currentValue + amount;
  };

  // Add method to decrement value
  // Signature: sub(id, field, amount)
  resource.sub = async (id, field, amount) => {
    const { plugin: handler } = resolveFieldAndPlugin(resource, field, amount);

    // Create transaction inline
    const now = new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);

    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
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
      return await plugin._syncModeConsolidate(handler, id, field);
    }

    // Async mode - return current value (optimistic)
    const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
    const currentValue = (ok && record) ? (record[field] || 0) : 0;
    return currentValue - amount;
  };

  // Add method to manually trigger consolidation
  // Signature: consolidate(id, field)
  resource.consolidate = async (id, field) => {
    if (!field) {
      throw new Error(`Field parameter is required: consolidate(id, field)`);
    }

    const handler = resource._eventualConsistencyPlugins[field];

    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new Error(
        `No eventual consistency plugin found for field "${field}". ` +
        `Available fields: ${availableFields}`
      );
    }

    return await plugin._consolidateWithHandler(handler, id);
  };

  // Add method to get consolidated value without applying
  // Signature: getConsolidatedValue(id, field, options)
  resource.getConsolidatedValue = async (id, field, options = {}) => {
    const handler = resource._eventualConsistencyPlugins[field];

    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new Error(
        `No eventual consistency plugin found for field "${field}". ` +
        `Available fields: ${availableFields}`
      );
    }

    return await plugin._getConsolidatedValueWithHandler(handler, id, options);
  };

  // Add method to recalculate from scratch
  // Signature: recalculate(id, field)
  resource.recalculate = async (id, field) => {
    if (!field) {
      throw new Error(`Field parameter is required: recalculate(id, field)`);
    }

    const handler = resource._eventualConsistencyPlugins[field];

    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(', ');
      throw new Error(
        `No eventual consistency plugin found for field "${field}". ` +
        `Available fields: ${availableFields}`
      );
    }

    return await plugin._recalculateWithHandler(handler, id);
  };
}
