/**
 * Helper methods for EventualConsistencyPlugin
 * @module eventual-consistency/helpers
 */

import { createTransaction } from './transactions.js';
import { resolveFieldAndPlugin, type FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';

export interface HelperOptions {
  source?: string;
}

export interface TargetResource {
  _eventualConsistencyPlugins?: Record<string, FieldHandler>;
  add?(field: string, value: number, options?: HelperOptions): Promise<any>;
  add?(value: number, options?: HelperOptions): Promise<any>;
  sub?(field: string, value: number, options?: HelperOptions): Promise<any>;
  sub?(value: number, options?: HelperOptions): Promise<any>;
  set?(field: string, value: number, options?: HelperOptions): Promise<any>;
  set?(value: number, options?: HelperOptions): Promise<any>;
  increment?(field: string, options?: HelperOptions): Promise<any>;
  increment?(options?: HelperOptions): Promise<any>;
  decrement?(field: string, options?: HelperOptions): Promise<any>;
  decrement?(options?: HelperOptions): Promise<any>;
  consolidate?(field?: string): Promise<any>;
  getConsolidatedValue?(field: string, recordId: string): Promise<number>;
  recalculate?(field: string, recordId: string): Promise<number>;
  [key: string]: any;
}

export interface EventualConsistencyPlugin {
  runConsolidation(handler: FieldHandler, resourceName: string, fieldName: string): Promise<any>;
  getConsolidatedValue(resourceName: string, fieldName: string, recordId: string): Promise<number>;
  recalculateRecord(resourceName: string, fieldName: string, recordId: string): Promise<number>;
}

/**
 * Add helper methods to a target resource
 *
 * @param resource - Target resource to add methods to
 * @param plugin - Plugin instance for consolidation methods
 * @param config - Plugin configuration
 */
export function addHelperMethods(
  resource: TargetResource,
  plugin: EventualConsistencyPlugin,
  _config: NormalizedConfig
): void {
  const defaultField = getDefaultField(resource);

  resource.add = async function(...args: any[]): Promise<any> {
    const { field, value, options, handler } = resolveFieldAndPlugin(
      args,
      defaultField,
      this
    );

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

  resource.sub = async function(...args: any[]): Promise<any> {
    const { field, value, options, handler } = resolveFieldAndPlugin(
      args,
      defaultField,
      this
    );

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

  resource.set = async function(...args: any[]): Promise<any> {
    const { field, value, options, handler } = resolveFieldAndPlugin(
      args,
      defaultField,
      this
    );

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

  resource.increment = async function(...args: any[]): Promise<any> {
    const options = typeof args[0] === 'string' ? args[1] : args[0];
    const field = typeof args[0] === 'string' ? args[0] : defaultField;

    return this.add?.(field as string, 1, options);
  };

  resource.decrement = async function(...args: any[]): Promise<any> {
    const options = typeof args[0] === 'string' ? args[1] : args[0];
    const field = typeof args[0] === 'string' ? args[0] : defaultField;

    return this.sub?.(field as string, 1, options);
  };

  resource.consolidate = async function(field?: string): Promise<any> {
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

  resource.getConsolidatedValue = async function(
    field: string,
    recordId: string
  ): Promise<number> {
    const handler = this._eventualConsistencyPlugins?.[field];
    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    return plugin.getConsolidatedValue(handler.resource, field, recordId);
  };

  resource.recalculate = async function(
    field: string,
    recordId: string
  ): Promise<number> {
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
function getDefaultField(resource: TargetResource): string | null {
  if (!resource._eventualConsistencyPlugins) {
    return null;
  }

  const fields = Object.keys(resource._eventualConsistencyPlugins);
  return fields.length > 0 ? (fields[0] ?? null) : null;
}
