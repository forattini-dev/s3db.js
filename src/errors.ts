/**
 * S3DB Error Classes
 *
 * Typed error hierarchy for s3db.js operations.
 */

import type { StringRecord } from './types/common.types.js';

/** Base error context for all S3DB errors */
export interface BaseErrorContext {
  verbose?: boolean;
  bucket?: string;
  key?: string;
  message?: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  awsMessage?: string;
  original?: Error | unknown;
  commandName?: string;
  commandInput?: unknown;
  metadata?: StringRecord;
  description?: string;
  suggestion?: string;
  retriable?: boolean;
  docs?: string;
  title?: string;
  hint?: string;
  [key: string]: unknown;
}

/** Serialized error format */
export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  awsMessage?: string;
  bucket?: string;
  key?: string;
  thrownAt?: Date;
  retriable?: boolean;
  suggestion?: string;
  docs?: string;
  title?: string;
  hint?: string;
  commandName?: string;
  commandInput?: unknown;
  metadata?: StringRecord;
  description?: string;
  data?: StringRecord;
  original?: unknown;
  stack?: string;
}

export class BaseError extends Error {
  bucket?: string;
  key?: string;
  thrownAt: Date;
  code?: string;
  statusCode: number;
  requestId?: string;
  awsMessage?: string;
  original?: Error | unknown;
  commandName?: string;
  commandInput?: unknown;
  metadata?: StringRecord;
  description?: string;
  suggestion?: string;
  retriable: boolean;
  docs?: string;
  title: string;
  hint?: string;
  data: StringRecord;

  constructor(context: BaseErrorContext) {
    const {
      verbose,
      bucket,
      key,
      message = 'Unknown error',
      code,
      statusCode,
      requestId,
      awsMessage,
      original,
      commandName,
      commandInput,
      metadata,
      description,
      suggestion,
      retriable,
      docs,
      title,
      hint,
      ...rest
    } = context;

    let finalMessage = message;
    if (verbose) {
      finalMessage = message + `\n\nVerbose:\n\n${JSON.stringify(rest, null, 2)}`;
    }
    super(finalMessage);

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(finalMessage).stack;
    }

    this.name = this.constructor.name;
    this.bucket = bucket;
    this.key = key;
    this.thrownAt = new Date();
    this.code = code;
    this.statusCode = statusCode ?? 500;
    this.requestId = requestId;
    this.awsMessage = awsMessage;
    this.original = original;
    this.commandName = commandName;
    this.commandInput = commandInput;
    this.metadata = metadata;
    this.description = description;
    this.suggestion = suggestion;
    this.retriable = retriable ?? false;
    this.docs = docs;
    this.title = title || this.constructor.name;
    this.hint = hint;
    this.data = {
      bucket,
      key,
      ...rest,
      verbose,
      message,
      suggestion: this.suggestion,
      retriable: this.retriable,
      docs: this.docs,
      title: this.title,
      hint: this.hint,
    };
  }

  toJSON(): SerializedError {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      requestId: this.requestId,
      awsMessage: this.awsMessage,
      bucket: this.bucket,
      key: this.key,
      thrownAt: this.thrownAt,
      retriable: this.retriable,
      suggestion: this.suggestion,
      docs: this.docs,
      title: this.title,
      hint: this.hint,
      commandName: this.commandName,
      commandInput: this.commandInput,
      metadata: this.metadata,
      description: this.description,
      data: this.data,
      original: this.original,
      stack: this.stack,
    };
  }

  override toString(): string {
    return `${this.name} | ${this.message}`;
  }
}

/** AWS Error with $metadata */
interface AwsErrorLike {
  code?: string;
  Code?: string;
  name?: string;
  message?: string;
  statusCode?: number;
  requestId?: string;
  stack?: string;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
    [key: string]: unknown;
  };
}

/** S3DB Error details */
export interface S3dbErrorDetails {
  bucket?: string;
  key?: string;
  original?: AwsErrorLike | Error | unknown;
  statusCode?: number;
  retriable?: boolean;
  suggestion?: string;
  description?: string;
  [key: string]: unknown;
}

export class S3dbError extends BaseError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    let code: string | undefined;
    let statusCode: number | undefined;
    let requestId: string | undefined;
    let awsMessage: string | undefined;
    let original = details.original;
    let metadata: StringRecord | undefined;

    if (details.original && typeof details.original === 'object') {
      const awsError = details.original as AwsErrorLike;
      original = details.original;
      code = awsError.code || awsError.Code || awsError.name;
      statusCode = awsError.statusCode || awsError.$metadata?.httpStatusCode;
      requestId = awsError.requestId || awsError.$metadata?.requestId;
      awsMessage = awsError.message;
      metadata = awsError.$metadata ? { ...awsError.$metadata } : undefined;
    }

    super({
      message,
      ...details,
      code,
      statusCode,
      requestId,
      awsMessage,
      original,
      metadata,
    });
  }
}

export class DatabaseError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const merged = {
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion:
        details.suggestion ??
        'Check database configuration and ensure the operation parameters are valid.',
      ...details,
    };
    super(message, merged);
    Object.assign(this, merged);
  }
}

export class ValidationError extends S3dbError {
  field?: string;
  value?: unknown;
  constraint?: string;

  constructor(message: string, details: S3dbErrorDetails & { field?: string; value?: unknown; constraint?: string } = {}) {
    const merged = {
      statusCode: details.statusCode ?? 422,
      retriable: details.retriable ?? false,
      suggestion:
        details.suggestion ??
        'Review validation errors and adjust the request payload before retrying.',
      ...details,
    };
    super(message, merged);
    this.field = details.field;
    this.value = details.value;
    this.constraint = details.constraint;
    Object.assign(this, merged);
  }
}

export class AuthenticationError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const merged = {
      statusCode: details.statusCode ?? 401,
      retriable: details.retriable ?? false,
      suggestion:
        details.suggestion ??
        'Provide valid authentication credentials and try again.',
      ...details,
    };
    super(message, merged);
    Object.assign(this, merged);
  }
}

export class PermissionError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const merged = {
      statusCode: details.statusCode ?? 403,
      retriable: details.retriable ?? false,
      suggestion:
        details.suggestion ??
        'Verify IAM permissions, bucket policies, and credentials before retrying.',
      ...details,
    };
    super(message, merged);
    Object.assign(this, merged);
  }
}

export class EncryptionError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const merged = {
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion:
        details.suggestion ??
        'Check encryption keys and inputs. This error generally requires code/config changes before retrying.',
      ...details,
    };
    super(message, merged);
    Object.assign(this, merged);
  }
}

export interface ResourceNotFoundDetails extends S3dbErrorDetails {
  bucket: string;
  resourceName: string;
  id: string;
}

export class ResourceNotFound extends S3dbError {
  resourceName: string;
  id: string;

  constructor(details: ResourceNotFoundDetails) {
    const { bucket, resourceName, id, original, ...rest } = details;

    if (typeof id !== 'string') {
      throw new ValidationError('ResourceNotFound requires id to be a string', {
        field: 'id',
        value: id,
        retriable: false,
        suggestion: 'Provide the resource id as a string when constructing ResourceNotFound.',
      });
    }
    if (typeof bucket !== 'string') {
      throw new ValidationError('ResourceNotFound requires bucket to be a string', {
        field: 'bucket',
        value: bucket,
        retriable: false,
        suggestion: 'Provide the bucket name as a string when constructing ResourceNotFound.',
      });
    }
    if (typeof resourceName !== 'string') {
      throw new ValidationError('ResourceNotFound requires resourceName to be a string', {
        field: 'resourceName',
        value: resourceName,
        retriable: false,
        suggestion: 'Provide the resource name as a string when constructing ResourceNotFound.',
      });
    }

    super(`Resource not found: ${resourceName}/${id} [bucket:${bucket}]`, {
      bucket,
      resourceName,
      id,
      original,
      statusCode: rest.statusCode ?? 404,
      retriable: rest.retriable ?? false,
      suggestion: rest.suggestion ?? 'Confirm the resource ID and ensure it exists before retrying.',
      ...rest,
    });

    this.resourceName = resourceName;
    this.id = id;
  }
}

export interface NoSuchBucketDetails extends S3dbErrorDetails {
  bucket: string;
}

export class NoSuchBucket extends S3dbError {
  constructor(details: NoSuchBucketDetails) {
    const { bucket, original, ...rest } = details;

    if (typeof bucket !== 'string') {
      throw new ValidationError('NoSuchBucket requires bucket to be a string', {
        field: 'bucket',
        value: bucket,
        retriable: false,
        suggestion: 'Provide the bucket name as a string when constructing NoSuchBucket.',
      });
    }

    super(`Bucket does not exists [bucket:${bucket}]`, {
      bucket,
      original,
      statusCode: rest.statusCode ?? 404,
      retriable: rest.retriable ?? false,
      suggestion: rest.suggestion ?? 'Verify the bucket name and AWS region. Create the bucket if it is missing.',
      ...rest,
    });
  }
}

export interface NoSuchKeyDetails extends S3dbErrorDetails {
  bucket: string;
  key: string;
  resourceName?: string;
  id?: string;
}

export class NoSuchKey extends S3dbError {
  resourceName?: string;
  id?: string;

  constructor(details: NoSuchKeyDetails) {
    const { bucket, key, resourceName, id, original, ...rest } = details;

    if (typeof key !== 'string') {
      throw new ValidationError('NoSuchKey requires key to be a string', {
        field: 'key',
        value: key,
        retriable: false,
        suggestion: 'Provide the object key as a string when constructing NoSuchKey.',
      });
    }
    if (typeof bucket !== 'string') {
      throw new ValidationError('NoSuchKey requires bucket to be a string', {
        field: 'bucket',
        value: bucket,
        retriable: false,
        suggestion: 'Provide the bucket name as a string when constructing NoSuchKey.',
      });
    }
    if (id !== undefined && typeof id !== 'string') {
      throw new ValidationError('NoSuchKey requires id to be a string when provided', {
        field: 'id',
        value: id,
        retriable: false,
        suggestion: 'Provide the resource id as a string when including it in NoSuchKey.',
      });
    }

    super(`No such key: ${key} [bucket:${bucket}]`, {
      bucket,
      key,
      resourceName,
      id,
      original,
      statusCode: rest.statusCode ?? 404,
      retriable: rest.retriable ?? false,
      suggestion: rest.suggestion ?? 'Check if the object key is correct and that the object was uploaded.',
      ...rest,
    });

    this.resourceName = resourceName;
    this.id = id;
  }
}

export class NotFound extends S3dbError {
  resourceName?: string;
  id?: string;

  constructor(details: NoSuchKeyDetails) {
    const { bucket, key, resourceName, id, original, ...rest } = details;

    if (typeof key !== 'string') {
      throw new ValidationError('NotFound requires key to be a string', {
        field: 'key',
        value: key,
        retriable: false,
        suggestion: 'Provide the object key as a string when constructing NotFound.',
      });
    }
    if (typeof bucket !== 'string') {
      throw new ValidationError('NotFound requires bucket to be a string', {
        field: 'bucket',
        value: bucket,
        retriable: false,
        suggestion: 'Provide the bucket name as a string when constructing NotFound.',
      });
    }

    super(`Not found: ${key} [bucket:${bucket}]`, {
      bucket,
      key,
      resourceName,
      id,
      original,
      statusCode: rest.statusCode ?? 404,
      retriable: rest.retriable ?? false,
      suggestion: rest.suggestion ?? 'Confirm the key and bucket. Upload the object if it is missing.',
      ...rest,
    });

    this.resourceName = resourceName;
    this.id = id;
  }
}

export class MissingMetadata extends S3dbError {
  constructor(details: NoSuchBucketDetails) {
    const { bucket, original, ...rest } = details;

    if (typeof bucket !== 'string') {
      throw new ValidationError('MissingMetadata requires bucket to be a string', {
        field: 'bucket',
        value: bucket,
        retriable: false,
        suggestion: 'Provide the bucket name as a string when constructing MissingMetadata.',
      });
    }

    super(`Missing metadata for bucket [bucket:${bucket}]`, {
      bucket,
      original,
      statusCode: rest.statusCode ?? 500,
      retriable: rest.retriable ?? false,
      suggestion: rest.suggestion ?? 'Re-upload metadata or run db.uploadMetadataFile() to regenerate it.',
      ...rest,
    });
  }
}

export interface InvalidResourceItemDetails extends S3dbErrorDetails {
  bucket: string;
  resourceName: string;
  attributes?: unknown;
  validation?: unknown;
  message?: string;
}

export class InvalidResourceItem extends S3dbError {
  constructor(details: InvalidResourceItemDetails) {
    const { bucket, resourceName, attributes, validation, message, original, ...rest } = details;

    if (typeof bucket !== 'string') {
      throw new ValidationError('InvalidResourceItem requires bucket to be a string', {
        field: 'bucket',
        value: bucket,
        retriable: false,
        suggestion: 'Provide the bucket name as a string when constructing InvalidResourceItem.',
      });
    }
    if (typeof resourceName !== 'string') {
      throw new ValidationError('InvalidResourceItem requires resourceName to be a string', {
        field: 'resourceName',
        value: resourceName,
        retriable: false,
        suggestion: 'Provide the resource name as a string when constructing InvalidResourceItem.',
      });
    }

    super(
      message ||
        `Validation error: This item is not valid. Resource=${resourceName} [bucket:${bucket}].\n${JSON.stringify(validation, null, 2)}`,
      {
        bucket,
        resourceName,
        attributes,
        validation,
        original,
        statusCode: rest.statusCode ?? 422,
        retriable: rest.retriable ?? false,
        suggestion: rest.suggestion ?? 'Fix validation errors on the provided attributes before retrying the request.',
        ...rest,
      }
    );
  }
}

export class UnknownError extends S3dbError {}

export const ErrorMap = {
  NotFound,
  NoSuchKey,
  UnknownError,
  NoSuchBucket,
  MissingMetadata,
  InvalidResourceItem,
} as const;

export interface MapAwsErrorContext {
  bucket?: string;
  key?: string;
  resourceName?: string;
  id?: string;
  operation?: string;
  commandName?: string;
  commandInput?: unknown;
  retriable?: boolean;
}

export function mapAwsError(err: AwsErrorLike | Error, context: MapAwsErrorContext = {}): S3dbError {
  const awsErr = err as AwsErrorLike;
  const code = awsErr.code || awsErr.Code || awsErr.name;
  const metadata = awsErr.$metadata ? { ...awsErr.$metadata } : undefined;
  const { commandName, commandInput } = context;
  let description: string;

  if (code === 'NoSuchKey' || code === 'NotFound') {
    description = 'The specified key does not exist in the bucket. Check if the key exists and if your credentials have permission to access it.';
    return new NoSuchKey({
      bucket: context.bucket ?? '',
      key: context.key ?? '',
      resourceName: context.resourceName,
      id: context.id,
      original: err,
      metadata,
      commandName,
      commandInput,
      description,
      retriable: false,
    });
  }

  if (code === 'NoSuchBucket') {
    description = 'The specified bucket does not exist. Check if the bucket name is correct and if your credentials have permission to access it.';
    return new NoSuchBucket({
      bucket: context.bucket ?? '',
      original: err,
      metadata,
      commandName,
      commandInput,
      description,
      retriable: false,
    });
  }

  if (code === 'AccessDenied' || awsErr.statusCode === 403 || code === 'Forbidden') {
    description = 'Access denied. Check your AWS credentials, IAM permissions, and bucket policy.';
    return new PermissionError('Access denied', {
      ...context,
      original: err,
      metadata,
      commandName,
      commandInput,
      description,
      retriable: false,
    });
  }

  if (code === 'ValidationError' || awsErr.statusCode === 400) {
    description = 'Validation error. Check the request parameters and payload format.';
    return new ValidationError('Validation error', {
      ...context,
      original: err,
      metadata,
      commandName,
      commandInput,
      description,
      retriable: false,
    });
  }

  if (code === 'MissingMetadata') {
    description = 'Object metadata is missing or invalid. Check if the object was uploaded correctly.';
    return new MissingMetadata({
      bucket: context.bucket ?? '',
      original: err,
      metadata,
      commandName,
      commandInput,
      description,
      retriable: false,
    });
  }

  const errorDetails = [
    `Unknown error: ${err.message || err.toString()}`,
    awsErr.code && `Code: ${awsErr.code}`,
    awsErr.statusCode && `Status: ${awsErr.statusCode}`,
    err.stack && `Stack: ${err.stack.split('\n')[0]}`,
  ]
    .filter(Boolean)
    .join(' | ');

  description = `Check the error details and AWS documentation. Original error: ${err.message || err.toString()}`;
  return new UnknownError(errorDetails, {
    ...context,
    original: err,
    metadata,
    commandName,
    commandInput,
    description,
    retriable: context.retriable ?? false,
  });
}

export class ConnectionStringError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const description = details.description || 'Invalid connection string format. Check the connection string syntax and credentials.';
    const merged = {
      statusCode: details.statusCode ?? 400,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Fix the connection string and retry the operation.',
      description,
      ...details,
    };
    super(message, merged);
  }
}

export class CryptoError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const description = details.description || 'Cryptography operation failed. Check if the crypto library is available and input is valid.';
    const merged = {
      statusCode: details.statusCode ?? 500,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Validate crypto inputs and environment setup before retrying.',
      description,
      ...details,
    };
    super(message, merged);
  }
}

export class SchemaError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const description = details.description || 'Schema validation failed. Check schema definition and input data format.';
    const merged = {
      statusCode: details.statusCode ?? 400,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Update the schema or adjust the data to match the schema definition.',
      description,
      ...details,
    };
    super(message, merged);
  }
}

export class ResourceError extends S3dbError {
  constructor(message: string, details: S3dbErrorDetails = {}) {
    const description = details.description || 'Resource operation failed. Check resource configuration, attributes, and operation context.';
    const merged = {
      statusCode: details.statusCode ?? 400,
      retriable: details.retriable ?? false,
      suggestion: details.suggestion ?? 'Review the resource configuration and request payload before retrying.',
      description,
      ...details,
    };
    super(message, merged);
    Object.assign(this, merged);
  }
}

export interface PartitionErrorDetails extends S3dbErrorDetails {
  resourceName?: string;
  partitionName?: string;
  fieldName?: string;
  availableFields?: string[];
  strictValidation?: boolean;
}

export class PartitionError extends S3dbError {
  constructor(message: string, details: PartitionErrorDetails = {}) {
    let description = details.description;
    if (!description && details.resourceName && details.partitionName && details.fieldName) {
      const { resourceName, partitionName, fieldName, availableFields = [] } = details;
      description = `
Partition Field Validation Error

Resource: ${resourceName}
Partition: ${partitionName}
Missing Field: ${fieldName}

Available fields in schema:
${availableFields.map((f) => `  • ${f}`).join('\n') || '  (no fields defined)'}

Possible causes:
1. Field was removed from schema but partition still references it
2. Typo in partition field name
3. Nested field path is incorrect (use dot notation like 'utm.source')

Solution:
${
  details.strictValidation === false
    ? '  • Update partition definition to use existing fields'
    : `  • Add missing field to schema, OR
  • Update partition definition to use existing fields, OR
  • Use strictValidation: false to skip this check during testing`
}

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partitions
`.trim();
    }

    super(message, {
      ...details,
      statusCode: details.statusCode ?? 400,
      retriable: details.retriable ?? false,
      description,
    });
  }
}

export interface PluginErrorDetails extends S3dbErrorDetails {
  pluginName?: string;
  operation?: string;
}

export class PluginError extends S3dbError {
  pluginName: string;
  operation: string;

  constructor(message: string, details: PluginErrorDetails = {}) {
    const { pluginName = 'Unknown', operation = 'unknown', ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Plugin Error

Plugin: ${pluginName}
Operation: ${operation}

Possible causes:
1. Plugin not properly initialized
2. Plugin configuration is invalid
3. Plugin dependencies not met
4. Plugin method called before installation

Solution:
Ensure plugin is added to database and connect() is called before usage.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/README.md
`.trim();
    }

    const merged = {
      ...rest,
      pluginName,
      operation,
      statusCode: rest.statusCode ?? 500,
      retriable: rest.retriable ?? false,
      description,
    };

    super(message, merged);
    this.pluginName = pluginName;
    this.operation = operation;
    Object.assign(this, merged);
  }
}

export interface PluginStorageErrorDetails extends S3dbErrorDetails {
  pluginSlug?: string;
  key?: string;
  operation?: string;
}

export class PluginStorageError extends S3dbError {
  constructor(message: string, details: PluginStorageErrorDetails = {}) {
    const { pluginSlug = 'unknown', key = '', operation = 'unknown', ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Plugin Storage Error

Plugin: ${pluginSlug}
Key: ${key}
Operation: ${operation}

Possible causes:
1. Storage not initialized (plugin not installed)
2. Invalid key format
3. S3 operation failed
4. Permissions issue

Solution:
Ensure plugin has access to storage and key is valid.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/README.md#plugin-storage
`.trim();
    }

    super(message, {
      ...rest,
      pluginSlug,
      key,
      operation,
      statusCode: rest.statusCode ?? 500,
      retriable: rest.retriable ?? false,
      description,
    });
  }
}

export interface PartitionDriverErrorDetails extends S3dbErrorDetails {
  driver?: string;
  operation?: string;
  queueSize?: number;
  maxQueueSize?: number;
}

export class PartitionDriverError extends S3dbError {
  constructor(message: string, details: PartitionDriverErrorDetails = {}) {
    const { driver = 'unknown', operation = 'unknown', queueSize, maxQueueSize, ...rest } = details;

    let description = details.description;
    if (!description && queueSize !== undefined && maxQueueSize !== undefined) {
      description = `
Partition Driver Error

Driver: ${driver}
Operation: ${operation}
Queue Status: ${queueSize}/${maxQueueSize}

Possible causes:
1. Queue is full (backpressure)
2. Driver not properly configured
3. SQS permissions issue (if using SQS driver)

Solution:
${queueSize >= maxQueueSize ? 'Wait for queue to drain or increase maxQueueSize' : 'Check driver configuration and permissions'}
`.trim();
    } else if (!description) {
      description = `
Partition Driver Error

Driver: ${driver}
Operation: ${operation}

Check driver configuration and permissions.
`.trim();
    }

    super(message, {
      ...rest,
      driver,
      operation,
      queueSize,
      maxQueueSize,
      statusCode: rest.statusCode ?? 503,
      retriable: rest.retriable ?? (queueSize !== undefined && maxQueueSize !== undefined && queueSize >= maxQueueSize),
      description,
    });
  }
}

export interface BehaviorErrorDetails extends S3dbErrorDetails {
  behavior?: string;
  availableBehaviors?: string[];
}

export class BehaviorError extends S3dbError {
  constructor(message: string, details: BehaviorErrorDetails = {}) {
    const { behavior = 'unknown', availableBehaviors = [], ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Behavior Error

Requested: ${behavior}
Available: ${availableBehaviors.join(', ') || 'body-overflow, body-only, truncate-data, enforce-limits, user-managed'}

Possible causes:
1. Behavior name misspelled
2. Custom behavior not registered

Solution:
Use one of the available behaviors or register custom behavior.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#behaviors
`.trim();
    }

    super(message, {
      ...rest,
      behavior,
      availableBehaviors,
      statusCode: rest.statusCode ?? 400,
      retriable: rest.retriable ?? false,
      description,
    });
  }
}

export interface StreamErrorDetails extends S3dbErrorDetails {
  operation?: string;
  resource?: string;
}

export class StreamError extends S3dbError {
  constructor(message: string, details: StreamErrorDetails = {}) {
    const { operation = 'unknown', resource, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Stream Error

Operation: ${operation}
${resource ? `Resource: ${resource}` : ''}

Possible causes:
1. Stream not properly initialized
2. Resource not available
3. Network error during streaming

Solution:
Check stream configuration and resource availability.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#streaming
`.trim();
    }

    super(message, {
      ...rest,
      operation,
      resource,
      statusCode: rest.statusCode ?? 500,
      retriable: rest.retriable ?? false,
      description,
    });
  }
}

export interface MetadataLimitErrorDetails extends S3dbErrorDetails {
  totalSize?: number;
  effectiveLimit?: number;
  absoluteLimit?: number;
  excess?: number;
  resourceName?: string;
  operation?: string;
}

export class MetadataLimitError extends S3dbError {
  constructor(message: string, details: MetadataLimitErrorDetails = {}) {
    const {
      totalSize,
      effectiveLimit,
      absoluteLimit = 2047,
      excess,
      resourceName,
      operation,
      ...rest
    } = details;

    let description = details.description;
    if (!description && totalSize && effectiveLimit) {
      description = `
S3 Metadata Size Limit Exceeded

Current Size: ${totalSize} bytes
Effective Limit: ${effectiveLimit} bytes
Absolute Limit: ${absoluteLimit} bytes
${excess ? `Excess: ${excess} bytes` : ''}
${resourceName ? `Resource: ${resourceName}` : ''}
${operation ? `Operation: ${operation}` : ''}

S3 has a hard limit of 2KB (2047 bytes) for object metadata.

Solutions:
1. Use 'body-overflow' behavior to store excess in body
2. Use 'body-only' behavior to store everything in body
3. Reduce number of fields
4. Use shorter field values
5. Enable advanced metadata encoding

Example:
  await db.createResource({
    name: '${resourceName || 'myResource'}',
    behavior: 'body-overflow',  // Automatically handles overflow
    attributes: { ... }
  });

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#metadata-size-limits
`.trim();
    }

    super(message, {
      ...rest,
      totalSize,
      effectiveLimit,
      absoluteLimit,
      excess,
      resourceName,
      operation,
      statusCode: rest.statusCode ?? 413,
      retriable: rest.retriable ?? false,
      description,
    });
  }
}

export interface AnalyticsNotEnabledErrorDetails extends S3dbErrorDetails {
  pluginName?: string;
  resourceName?: string;
  field?: string;
  configuredResources?: string[];
  registeredResources?: string[];
  pluginInitialized?: boolean;
}

export class AnalyticsNotEnabledError extends S3dbError {
  constructor(details: AnalyticsNotEnabledErrorDetails = {}) {
    const {
      pluginName = 'EventualConsistency',
      resourceName = 'unknown',
      field = 'unknown',
      configuredResources = [],
      registeredResources = [],
      pluginInitialized = false,
      ...rest
    } = details;

    const message = `Analytics not enabled for ${resourceName}.${field}`;

    const description = `
Analytics Not Enabled

Plugin: ${pluginName}
Resource: ${resourceName}
Field: ${field}

Diagnostics:
  • Plugin initialized: ${pluginInitialized ? '✓ Yes' : '✗ No'}
  • Analytics resources created: ${registeredResources.length}/${configuredResources.length}
${configuredResources
  .map((r) => {
    const exists = registeredResources.includes(r);
    return `    ${exists ? '✓' : '✗'} ${r}${!exists ? ' (missing)' : ''}`;
  })
  .join('\n')}

Possible causes:
1. Resource not created yet - Analytics resources are created when db.createResource() is called
2. Resource created before plugin initialization - Plugin must be initialized before resources
3. Field not configured in analytics.resources config

Correct initialization order:
  1. Create database: const db = new Database({ ... })
  2. Install plugins: await db.connect() (triggers plugin.install())
  3. Create resources: await db.createResource({ name: '${resourceName}', ... })
  4. Analytics resources are auto-created by plugin

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/eventual-consistency.md
`.trim();

    super(message, {
      ...rest,
      pluginName,
      resourceName,
      field,
      configuredResources,
      registeredResources,
      pluginInitialized,
      statusCode: rest.statusCode ?? 400,
      retriable: rest.retriable ?? false,
      description,
    });
  }
}
