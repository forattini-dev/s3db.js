/**
 * Helper methods for EventualConsistencyPlugin
 * @module eventual-consistency/helpers
 */

import { createTransaction } from './transactions.js';
import { type FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';

export interface HelperOptions {
  source?: string;
}

export interface TargetResource {
  _eventualConsistencyPlugins?: Record<string, FieldHandler>;
  add?(recordId: string, field: string, value: number, options?: HelperOptions): Promise<any>;
  add?(recordId: string, value: number, options?: HelperOptions): Promise<any>;
  add?(field: string, value: number, options?: HelperOptions): Promise<any>;
  add?(value: number, options?: HelperOptions): Promise<any>;
  sub?(recordId: string, field: string, value: number, options?: HelperOptions): Promise<any>;
  sub?(recordId: string, value: number, options?: HelperOptions): Promise<any>;
  sub?(field: string, value: number, options?: HelperOptions): Promise<any>;
  sub?(value: number, options?: HelperOptions): Promise<any>;
  set?(recordId: string, field: string, value: number, options?: HelperOptions): Promise<any>;
  set?(recordId: string, value: number, options?: HelperOptions): Promise<any>;
  set?(field: string, value: number, options?: HelperOptions): Promise<any>;
  set?(value: number, options?: HelperOptions): Promise<any>;
  increment?(recordId: string, field: string, options?: HelperOptions): Promise<any>;
  increment?(recordId: string, options?: HelperOptions): Promise<any>;
  increment?(field: string, options?: HelperOptions): Promise<any>;
  increment?(options?: HelperOptions): Promise<any>;
  decrement?(recordId: string, field: string, options?: HelperOptions): Promise<any>;
  decrement?(recordId: string, options?: HelperOptions): Promise<any>;
  decrement?(field: string, options?: HelperOptions): Promise<any>;
  decrement?(options?: HelperOptions): Promise<any>;
  consolidate?(recordId: string, field?: string): Promise<any>;
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

interface ResolvedMutationCall {
  recordId: string;
  field: string;
  value: number;
  options: HelperOptions;
  handler: FieldHandler | null;
}

function getConfiguredFields(resource: TargetResource): string[] {
  return Object.keys(resource._eventualConsistencyPlugins || {});
}

function isBoundRecord(resource: TargetResource): boolean {
  return resource.id !== undefined && resource.id !== null;
}

function resolveMutationCall(
  args: any[],
  defaultField: string | null,
  resource: TargetResource
): ResolvedMutationCall {
  const configuredFields = new Set(getConfiguredFields(resource));
  const boundRecord = isBoundRecord(resource);
  let recordId: string | undefined;
  let field = defaultField || '';
  let value: number;
  let options: HelperOptions = {};

  if (boundRecord) {
    recordId = String(resource.id);

    if (args.length === 1) {
      value = args[0];
    } else if (args.length === 2) {
      if (typeof args[0] === 'string' && configuredFields.has(args[0])) {
        field = args[0];
        value = args[1];
      } else {
        value = args[0];
        options = args[1] || {};
      }
    } else {
      field = args[0];
      value = args[1];
      options = args[2] || {};
    }
  } else {
    recordId = args[0] != null ? String(args[0]) : undefined;

    if (args.length === 2) {
      value = args[1];
    } else if (args.length === 3) {
      if (typeof args[1] === 'string' && configuredFields.has(args[1])) {
        field = args[1];
        value = args[2];
      } else {
        value = args[1];
        options = args[2] || {};
      }
    } else {
      field = args[1];
      value = args[2];
      options = args[3] || {};
    }
  }

  if (!recordId) {
    throw new Error('Record ID is required for eventual consistency operations');
  }

  if (!field) {
    throw new Error('Field name is required for eventual consistency operations');
  }

  return {
    recordId,
    field,
    value,
    options,
    handler: resource._eventualConsistencyPlugins?.[field] || null
  };
}

function resolveCounterCall(
  args: any[],
  defaultField: string | null,
  resource: TargetResource
): { recordId: string; field: string; options: HelperOptions } {
  const configuredFields = new Set(getConfiguredFields(resource));
  const boundRecord = isBoundRecord(resource);
  let recordId: string | undefined;
  let field = defaultField || '';
  let options: HelperOptions = {};

  if (boundRecord) {
    recordId = String(resource.id);
    if (typeof args[0] === 'string' && configuredFields.has(args[0])) {
      field = args[0];
      options = args[1] || {};
    } else {
      options = args[0] || {};
    }
  } else {
    recordId = args[0] != null ? String(args[0]) : undefined;
    if (typeof args[1] === 'string' && configuredFields.has(args[1])) {
      field = args[1];
      options = args[2] || {};
    } else {
      options = args[1] || {};
    }
  }

  if (!recordId) {
    throw new Error('Record ID is required for eventual consistency operations');
  }

  if (!field) {
    throw new Error('Field name is required for eventual consistency operations');
  }

  return { recordId, field, options };
}

function resolveConsolidationField(
  args: any[],
  defaultField: string | null,
  resource: TargetResource
): string {
  const configuredFields = new Set(getConfiguredFields(resource));

  if (isBoundRecord(resource)) {
    if (typeof args[0] === 'string' && configuredFields.has(args[0])) {
      return args[0];
    }
    return defaultField || '';
  }

  if (typeof args[1] === 'string' && configuredFields.has(args[1])) {
    return args[1];
  }

  return defaultField || '';
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
    const { recordId, field, value, options, handler } = resolveMutationCall(args, defaultField, this);

    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    return createTransaction(handler, {
      originalId: recordId,
      field,
      fieldPath: handler.fieldPath,
      value: Math.abs(value),
      operation: 'add',
      options
    });
  };

  resource.sub = async function(...args: any[]): Promise<any> {
    const { recordId, field, value, options, handler } = resolveMutationCall(args, defaultField, this);

    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    return createTransaction(handler, {
      originalId: recordId,
      field,
      fieldPath: handler.fieldPath,
      value: Math.abs(value),
      operation: 'sub',
      options
    });
  };

  resource.set = async function(...args: any[]): Promise<any> {
    const { recordId, field, value, options, handler } = resolveMutationCall(args, defaultField, this);

    if (!handler) {
      throw new Error(`No eventual consistency handler for field: ${field}`);
    }

    return createTransaction(handler, {
      originalId: recordId,
      field,
      fieldPath: handler.fieldPath,
      value,
      operation: 'set',
      options
    });
  };

  resource.increment = async function(...args: any[]): Promise<any> {
    const { recordId, field, options } = resolveCounterCall(args, defaultField, this);

    return this.add?.(recordId, field, 1, options);
  };

  resource.decrement = async function(...args: any[]): Promise<any> {
    const { recordId, field, options } = resolveCounterCall(args, defaultField, this);

    return this.sub?.(recordId, field, 1, options);
  };

  resource.consolidate = async function(...args: any[]): Promise<any> {
    const targetField = resolveConsolidationField(args, defaultField, this);
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
