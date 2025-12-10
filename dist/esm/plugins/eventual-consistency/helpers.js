/**
 * Helper methods for EventualConsistencyPlugin
 * @module eventual-consistency/helpers
 */
import { createTransaction } from './transactions.js';
import { resolveFieldAndPlugin } from './utils.js';
/**
 * Add helper methods to a target resource
 *
 * @param resource - Target resource to add methods to
 * @param plugin - Plugin instance for consolidation methods
 * @param config - Plugin configuration
 */
export function addHelperMethods(resource, plugin, config) {
    const defaultField = getDefaultField(resource);
    resource.add = async function (...args) {
        const { field, value, options, handler } = resolveFieldAndPlugin(args, defaultField, this);
        if (!handler) {
            throw new Error(`No eventual consistency handler for field: ${field}`);
        }
        return createTransaction(handler, {
            originalId: this.id,
            field,
            fieldPath: handler.fieldPath,
            value: Math.abs(value),
            operation: 'add',
            options
        });
    };
    resource.sub = async function (...args) {
        const { field, value, options, handler } = resolveFieldAndPlugin(args, defaultField, this);
        if (!handler) {
            throw new Error(`No eventual consistency handler for field: ${field}`);
        }
        return createTransaction(handler, {
            originalId: this.id,
            field,
            fieldPath: handler.fieldPath,
            value: Math.abs(value),
            operation: 'sub',
            options
        });
    };
    resource.set = async function (...args) {
        const { field, value, options, handler } = resolveFieldAndPlugin(args, defaultField, this);
        if (!handler) {
            throw new Error(`No eventual consistency handler for field: ${field}`);
        }
        return createTransaction(handler, {
            originalId: this.id,
            field,
            fieldPath: handler.fieldPath,
            value,
            operation: 'set',
            options
        });
    };
    resource.increment = async function (...args) {
        const options = typeof args[0] === 'string' ? args[1] : args[0];
        const field = typeof args[0] === 'string' ? args[0] : defaultField;
        return this.add?.(field, 1, options);
    };
    resource.decrement = async function (...args) {
        const options = typeof args[0] === 'string' ? args[1] : args[0];
        const field = typeof args[0] === 'string' ? args[0] : defaultField;
        return this.sub?.(field, 1, options);
    };
    resource.consolidate = async function (field) {
        const targetField = field || defaultField;
        if (!targetField) {
            throw new Error('Field name is required for consolidation');
        }
        const handler = this._eventualConsistencyPlugins?.[targetField];
        if (!handler) {
            throw new Error(`No eventual consistency handler for field: ${targetField}`);
        }
        return plugin.runConsolidation(handler, handler.resource, targetField);
    };
    resource.getConsolidatedValue = async function (field, recordId) {
        const handler = this._eventualConsistencyPlugins?.[field];
        if (!handler) {
            throw new Error(`No eventual consistency handler for field: ${field}`);
        }
        return plugin.getConsolidatedValue(handler.resource, field, recordId);
    };
    resource.recalculate = async function (field, recordId) {
        const handler = this._eventualConsistencyPlugins?.[field];
        if (!handler) {
            throw new Error(`No eventual consistency handler for field: ${field}`);
        }
        return plugin.recalculateRecord(handler.resource, field, recordId);
    };
}
/**
 * Get the default field for a resource (first configured field)
 *
 * @param resource - Target resource
 * @returns Default field name or null
 */
function getDefaultField(resource) {
    if (!resource._eventualConsistencyPlugins) {
        return null;
    }
    const fields = Object.keys(resource._eventualConsistencyPlugins);
    return fields.length > 0 ? (fields[0] ?? null) : null;
}
//# sourceMappingURL=helpers.js.map