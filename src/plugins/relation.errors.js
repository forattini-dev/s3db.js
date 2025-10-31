import { PluginError } from '../errors.js';

/**
 * RelationPlugin Error Classes
 * Custom errors for relation operations
 */

/**
 * Base error for all relation operations
 */
export class RelationError extends PluginError {
  constructor(message, context = {}) {
    const merged = {
      pluginName: context.pluginName || 'RelationPlugin',
      operation: context.operation || 'unknown',
      statusCode: context.statusCode ?? 500,
      retriable: context.retriable ?? false,
      suggestion: context.suggestion ?? 'Inspect relation configuration (type, resource, foreign keys) before retrying.',
      ...context
    };
    super(message, merged);
    this.name = 'RelationError';
  }
}

/**
 * Thrown when relation configuration is invalid
 */
export class RelationConfigError extends RelationError {
  constructor(message, context = {}) {
    super(message, {
      statusCode: context.statusCode ?? 400,
      retriable: context.retriable ?? false,
      suggestion: context.suggestion ?? 'Review relation configuration fields (type, resource, localKey, foreignKey).',
      ...context
    });
    this.name = 'RelationConfigError';
  }
}

/**
 * Thrown when a relation type is not supported
 */
export class UnsupportedRelationTypeError extends RelationError {
  constructor(type, context = {}) {
    super(`Unsupported relation type: ${type}. Supported types: hasOne, hasMany, belongsTo, belongsToMany`, {
      statusCode: context.statusCode ?? 400,
      retriable: false,
      suggestion: context.suggestion ?? 'Use one of the supported relation types or implement a custom handler.',
      relationType: type,
      ...context
    });
    this.name = 'UnsupportedRelationTypeError';
    this.relationType = type;
  }
}

/**
 * Thrown when a related resource is not found
 */
export class RelatedResourceNotFoundError extends RelationError {
  constructor(resourceName, context = {}) {
    super(`Related resource "${resourceName}" not found`, {
      statusCode: context.statusCode ?? 404,
      retriable: false,
      suggestion: context.suggestion ?? 'Ensure the related resource is created and registered before defining the relation.',
      resourceName,
      ...context
    });
    this.name = 'RelatedResourceNotFoundError';
    this.resourceName = resourceName;
  }
}

/**
 * Thrown when a junction table is missing for belongsToMany
 */
export class JunctionTableNotFoundError extends RelationError {
  constructor(junctionTable, context = {}) {
    super(`Junction table "${junctionTable}" not found for belongsToMany relation`, {
      statusCode: context.statusCode ?? 404,
      retriable: false,
      suggestion: context.suggestion ?? 'Create the junction resource or update belongsToMany configuration to reference an existing one.',
      junctionTable,
      ...context
    });
    this.name = 'JunctionTableNotFoundError';
    this.junctionTable = junctionTable;
  }
}

/**
 * Thrown when cascade operation fails
 */
export class CascadeError extends RelationError {
  constructor(operation, resourceName, recordId, originalError, context = {}) {
    super(
      `Cascade ${operation} failed for resource "${resourceName}" record "${recordId}": ${originalError.message}`,
      {
        retriable: context.retriable ?? false,
        suggestion: context.suggestion ?? 'Check cascade configuration and ensure dependent records allow deletion/update.',
        operation,
        resourceName,
        recordId,
        originalError,
        ...context
      }
    );
    this.name = 'CascadeError';
    this.operation = operation;
    this.resourceName = resourceName;
    this.recordId = recordId;
    this.originalError = originalError;
  }
}

/**
 * Thrown when foreign key is missing
 */
export class MissingForeignKeyError extends RelationError {
  constructor(foreignKey, resourceName, context = {}) {
    super(`Foreign key "${foreignKey}" not found in resource "${resourceName}"`, {
      statusCode: context.statusCode ?? 422,
      retriable: false,
      suggestion: context.suggestion ?? 'Add the foreign key field to the resource schema or adjust relation configuration.',
      foreignKey,
      resourceName,
      ...context
    });
    this.name = 'MissingForeignKeyError';
    this.foreignKey = foreignKey;
    this.resourceName = resourceName;
  }
}

/**
 * Thrown when trying to load relations on non-existent record
 */
export class RecordNotFoundError extends RelationError {
  constructor(recordId, resourceName, context = {}) {
    super(`Record "${recordId}" not found in resource "${resourceName}"`, {
      statusCode: context.statusCode ?? 404,
      retriable: false,
      suggestion: context.suggestion ?? 'Ensure the primary record exists before loading relations.',
      recordId,
      resourceName,
      ...context
    });
    this.name = 'RecordNotFoundError';
    this.recordId = recordId;
    this.resourceName = resourceName;
  }
}

/**
 * Thrown when circular relation is detected
 */
export class CircularRelationError extends RelationError {
  constructor(path, context = {}) {
    super(`Circular relation detected in path: ${path.join(' -> ')}`, {
      statusCode: context.statusCode ?? 400,
      retriable: false,
      suggestion: context.suggestion ?? 'Adjust include paths to avoid circular references or limit recursion depth.',
      relationPath: path,
      ...context
    });
    this.name = 'CircularRelationError';
    this.relationPath = path;
  }
}

/**
 * Thrown when include path is invalid
 */
export class InvalidIncludePathError extends RelationError {
  constructor(path, reason, context = {}) {
    super(`Invalid include path "${path}": ${reason}`, {
      statusCode: context.statusCode ?? 400,
      retriable: false,
      suggestion: context.suggestion ?? 'Verify include syntax (users.posts.comments) and ensure each relation exists.',
      includePath: path,
      reason,
      ...context
    });
    this.name = 'InvalidIncludePathError';
    this.includePath = path;
    this.reason = reason;
  }
}

/**
 * Thrown when batch loading fails
 */
export class BatchLoadError extends RelationError {
  constructor(relation, batchSize, failedCount, context = {}) {
    super(
      `Batch loading failed for relation "${relation}". Failed ${failedCount} out of ${batchSize} records`,
      {
        retriable: context.retriable ?? true,
        suggestion: context.suggestion ?? 'Check batch size configuration and review individual errors to retry failed records.',
        relation,
        batchSize,
        failedCount,
        ...context
      }
    );
    this.name = 'BatchLoadError';
    this.relation = relation;
    this.batchSize = batchSize;
    this.failedCount = failedCount;
  }
}
