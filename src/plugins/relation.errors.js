/**
 * RelationPlugin Error Classes
 * Custom errors for relation operations
 */

/**
 * Base error for all relation operations
 */
export class RelationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'RelationError';
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when relation configuration is invalid
 */
export class RelationConfigError extends RelationError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'RelationConfigError';
  }
}

/**
 * Thrown when a relation type is not supported
 */
export class UnsupportedRelationTypeError extends RelationError {
  constructor(type, context = {}) {
    super(`Unsupported relation type: ${type}. Supported types: hasOne, hasMany, belongsTo, belongsToMany`, context);
    this.name = 'UnsupportedRelationTypeError';
    this.relationType = type;
  }
}

/**
 * Thrown when a related resource is not found
 */
export class RelatedResourceNotFoundError extends RelationError {
  constructor(resourceName, context = {}) {
    super(`Related resource "${resourceName}" not found`, context);
    this.name = 'RelatedResourceNotFoundError';
    this.resourceName = resourceName;
  }
}

/**
 * Thrown when a junction table is missing for belongsToMany
 */
export class JunctionTableNotFoundError extends RelationError {
  constructor(junctionTable, context = {}) {
    super(`Junction table "${junctionTable}" not found for belongsToMany relation`, context);
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
      context
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
    super(`Foreign key "${foreignKey}" not found in resource "${resourceName}"`, context);
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
    super(`Record "${recordId}" not found in resource "${resourceName}"`, context);
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
    super(`Circular relation detected in path: ${path.join(' -> ')}`, context);
    this.name = 'CircularRelationError';
    this.relationPath = path;
  }
}

/**
 * Thrown when include path is invalid
 */
export class InvalidIncludePathError extends RelationError {
  constructor(path, reason, context = {}) {
    super(`Invalid include path "${path}": ${reason}`, context);
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
      context
    );
    this.name = 'BatchLoadError';
    this.relation = relation;
    this.batchSize = batchSize;
    this.failedCount = failedCount;
  }
}
