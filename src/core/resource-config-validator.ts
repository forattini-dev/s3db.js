import type { StringRecord } from '../types/common.types.js';

export interface PartitionFieldsDef {
  [fieldName: string]: string;
}

export interface PartitionDef {
  fields?: PartitionFieldsDef;
}

export interface PartitionsConfig {
  [partitionName: string]: PartitionDef;
}

export interface HooksConfig {
  [event: string]: unknown[];
}

export interface EventsConfig {
  [eventName: string]: ((...args: unknown[]) => void) | Array<(...args: unknown[]) => void>;
}

export interface IncrementalIdGeneratorConfig {
  type: 'incremental';
  [key: string]: unknown;
}

export type IdGeneratorConfig = ((...args: unknown[]) => string) | number | string | IncrementalIdGeneratorConfig;

export interface ResourceConfigInput {
  name?: string;
  client?: unknown;
  attributes?: StringRecord;
  version?: string;
  behavior?: string;
  passphrase?: string;
  observers?: unknown[];
  cache?: boolean;
  autoDecrypt?: boolean;
  timestamps?: boolean;
  paranoid?: boolean;
  allNestedObjectsOptional?: boolean;
  idGenerator?: IdGeneratorConfig;
  idSize?: number;
  partitions?: PartitionsConfig;
  hooks?: HooksConfig;
  events?: EventsConfig;
  [key: string]: unknown;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateResourceConfig(config: ResourceConfigInput): ValidationResult {
  const errors: string[] = [];

  if (!config.name) {
    errors.push("Resource 'name' is required");
  } else if (typeof config.name !== 'string') {
    errors.push("Resource 'name' must be a string");
  } else if (config.name.trim() === '') {
    errors.push("Resource 'name' cannot be empty");
  }

  if (!config.client) {
    errors.push("S3 'client' is required");
  }

  if (!config.attributes) {
    errors.push("Resource 'attributes' are required");
  } else if (typeof config.attributes !== 'object' || Array.isArray(config.attributes)) {
    errors.push("Resource 'attributes' must be an object");
  } else if (Object.keys(config.attributes).length === 0) {
    errors.push("Resource 'attributes' cannot be empty");
  }

  if (config.version !== undefined && typeof config.version !== 'string') {
    errors.push("Resource 'version' must be a string");
  }

  if (config.behavior !== undefined && typeof config.behavior !== 'string') {
    errors.push("Resource 'behavior' must be a string");
  }

  if (config.passphrase !== undefined && typeof config.passphrase !== 'string') {
    errors.push("Resource 'passphrase' must be a string");
  }

  if (config.observers !== undefined && !Array.isArray(config.observers)) {
    errors.push("Resource 'observers' must be an array");
  }

  const booleanFields = ['cache', 'autoDecrypt', 'timestamps', 'paranoid', 'allNestedObjectsOptional'] as const;
  for (const field of booleanFields) {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') {
      errors.push(`Resource '${field}' must be a boolean`);
    }
  }

  if (config.idGenerator !== undefined) {
    const isValidFunction = typeof config.idGenerator === 'function';
    const isValidNumber = typeof config.idGenerator === 'number';
    const isValidIncremental = typeof config.idGenerator === 'string' &&
      (config.idGenerator === 'incremental' || config.idGenerator.startsWith('incremental:'));
    const isValidIncrementalObject = typeof config.idGenerator === 'object' &&
      config.idGenerator !== null &&
      (config.idGenerator as IncrementalIdGeneratorConfig).type === 'incremental';

    if (!isValidFunction && !isValidNumber && !isValidIncremental && !isValidIncrementalObject) {
      errors.push("Resource 'idGenerator' must be a function, number (size), 'incremental' string, or incremental config object");
    } else if (isValidNumber && (config.idGenerator as number) <= 0) {
      errors.push("Resource 'idGenerator' size must be greater than 0");
    }
  }

  if (config.idSize !== undefined) {
    if (typeof config.idSize !== 'number' || !Number.isInteger(config.idSize)) {
      errors.push("Resource 'idSize' must be an integer");
    } else if (config.idSize <= 0) {
      errors.push("Resource 'idSize' must be greater than 0");
    }
  }

  if (config.partitions !== undefined) {
    if (typeof config.partitions !== 'object' || Array.isArray(config.partitions)) {
      errors.push("Resource 'partitions' must be an object");
    } else {
      for (const [partitionName, partitionDef] of Object.entries(config.partitions)) {
        if (typeof partitionDef !== 'object' || Array.isArray(partitionDef)) {
          errors.push(`Partition '${partitionName}' must be an object`);
        } else if (!partitionDef.fields) {
          errors.push(`Partition '${partitionName}' must have a 'fields' property`);
        } else if (typeof partitionDef.fields !== 'object' || Array.isArray(partitionDef.fields)) {
          errors.push(`Partition '${partitionName}.fields' must be an object`);
        } else {
          for (const [fieldName, fieldType] of Object.entries(partitionDef.fields)) {
            if (typeof fieldType !== 'string') {
              errors.push(`Partition '${partitionName}.fields.${fieldName}' must be a string`);
            }
          }
        }
      }
    }
  }

  if (config.hooks !== undefined) {
    if (typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
      errors.push("Resource 'hooks' must be an object");
    } else {
      const validHookEvents = [
        'beforeInsert', 'afterInsert',
        'beforeUpdate', 'afterUpdate',
        'beforeDelete', 'afterDelete',
        'beforeGet', 'afterGet',
        'beforeList', 'afterList',
        'beforeQuery', 'afterQuery',
        'beforeExists', 'afterExists',
        'beforeCount', 'afterCount',
        'beforePatch', 'afterPatch',
        'beforeReplace', 'afterReplace',
        'beforeGetMany', 'afterGetMany',
        'beforeDeleteMany', 'afterDeleteMany'
      ];
      for (const [event, hooksArr] of Object.entries(config.hooks)) {
        if (!validHookEvents.includes(event)) {
          errors.push(`Invalid hook event '${event}'. Valid events: ${validHookEvents.join(', ')}`);
        } else if (!Array.isArray(hooksArr)) {
          errors.push(`Resource 'hooks.${event}' must be an array`);
        }
      }
    }
  }

  if (config.events !== undefined) {
    if (typeof config.events !== 'object' || Array.isArray(config.events)) {
      errors.push("Resource 'events' must be an object");
    } else {
      for (const [eventName, listeners] of Object.entries(config.events)) {
        if (Array.isArray(listeners)) {
          for (let i = 0; i < listeners.length; i++) {
            const listener = listeners[i];
            if (typeof listener !== 'function') {
              errors.push(`Resource 'events.${eventName}[${i}]' must be a function`);
            }
          }
        } else if (typeof listeners !== 'function') {
          errors.push(`Resource 'events.${eventName}' must be a function or array of functions`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export default validateResourceConfig;
