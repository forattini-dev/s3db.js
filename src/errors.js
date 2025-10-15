export class BaseError extends Error {
  constructor({ verbose, bucket, key, message, code, statusCode, requestId, awsMessage, original, commandName, commandInput, metadata, suggestion, description, ...rest }) {
    if (verbose) message = message + `\n\nVerbose:\n\n${JSON.stringify(rest, null, 2)}`;
    super(message);

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }

    super.name = this.constructor.name;
    this.name = this.constructor.name;
    this.bucket = bucket;
    this.key = key;
    this.thrownAt = new Date();
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.awsMessage = awsMessage;
    this.original = original;
    this.commandName = commandName;
    this.commandInput = commandInput;
    this.metadata = metadata;
    this.suggestion = suggestion;
    this.description = description;
    this.data = { bucket, key, ...rest, verbose, message };
  }

  toJson() {
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
      commandName: this.commandName,
      commandInput: this.commandInput,
      metadata: this.metadata,
      suggestion: this.suggestion,
      description: this.description,
      data: this.data,
      original: this.original,
      stack: this.stack,
    };
  }

  toString() {
    return `${this.name} | ${this.message}`;
  }
}

// Base error class for S3DB
export class S3dbError extends BaseError {
  constructor(message, details = {}) {
    // Extrai campos AWS se presentes
    let code, statusCode, requestId, awsMessage, original, metadata;
    if (details.original) {
      original = details.original;
      code = original.code || original.Code || original.name;
      statusCode = original.statusCode || (original.$metadata && original.$metadata.httpStatusCode);
      requestId = original.requestId || (original.$metadata && original.$metadata.requestId);
      awsMessage = original.message;
      metadata = original.$metadata ? { ...original.$metadata } : undefined;
    }
    super({ message, ...details, code, statusCode, requestId, awsMessage, original, metadata });
  }
}

// Database operation errors
export class DatabaseError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Validation errors
export class ValidationError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Authentication errors
export class AuthenticationError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Permission/Authorization errors
export class PermissionError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Encryption errors
export class EncryptionError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Resource not found error
export class ResourceNotFound extends S3dbError {
  constructor({ bucket, resourceName, id, original, ...rest }) {
    if (typeof id !== 'string') throw new Error('id must be a string');
    if (typeof bucket !== 'string') throw new Error('bucket must be a string');
    if (typeof resourceName !== 'string') throw new Error('resourceName must be a string');
    super(`Resource not found: ${resourceName}/${id} [bucket:${bucket}]`, {
      bucket,
      resourceName,
      id,
      original,
      ...rest
    });
  }
}

export class NoSuchBucket extends S3dbError {
  constructor({ bucket, original, ...rest }) {
    if (typeof bucket !== 'string') throw new Error('bucket must be a string');
    super(`Bucket does not exists [bucket:${bucket}]`, { bucket, original, ...rest });
  }
}

export class NoSuchKey extends S3dbError {
  constructor({ bucket, key, resourceName, id, original, ...rest }) {
    if (typeof key !== 'string') throw new Error('key must be a string');
    if (typeof bucket !== 'string') throw new Error('bucket must be a string');
    if (id !== undefined && typeof id !== 'string') throw new Error('id must be a string');
    super(`No such key: ${key} [bucket:${bucket}]`, { bucket, key, resourceName, id, original, ...rest });
    this.resourceName = resourceName;
    this.id = id;
  }
}

export class NotFound extends S3dbError {
  constructor({ bucket, key, resourceName, id, original, ...rest }) {
    if (typeof key !== 'string') throw new Error('key must be a string');
    if (typeof bucket !== 'string') throw new Error('bucket must be a string');
    super(`Not found: ${key} [bucket:${bucket}]`, { bucket, key, resourceName, id, original, ...rest });
    this.resourceName = resourceName;
    this.id = id;
  }
}

export class MissingMetadata extends S3dbError {
  constructor({ bucket, original, ...rest }) {
    if (typeof bucket !== 'string') throw new Error('bucket must be a string');
    super(`Missing metadata for bucket [bucket:${bucket}]`, { bucket, original, ...rest });
  }
}

export class InvalidResourceItem extends S3dbError {
  constructor({
    bucket,
    resourceName,
    attributes,
    validation,
    message,
    original,
    ...rest
  }) {
    if (typeof bucket !== 'string') throw new Error('bucket must be a string');
    if (typeof resourceName !== 'string') throw new Error('resourceName must be a string');
    super(
      message || `Validation error: This item is not valid. Resource=${resourceName} [bucket:${bucket}].\n${JSON.stringify(validation, null, 2)}`,
      {
        bucket,
        resourceName,
        attributes,
        validation,
        original,
        ...rest
      }
    );
  }
}

export class UnknownError extends S3dbError {}

export const ErrorMap = {
  'NotFound': NotFound,
  'NoSuchKey': NoSuchKey,
  'UnknownError': UnknownError,
  'NoSuchBucket': NoSuchBucket,
  'MissingMetadata': MissingMetadata,
  'InvalidResourceItem': InvalidResourceItem,
};

// Utility to map AWS error to custom error
export function mapAwsError(err, context = {}) {
  const code = err.code || err.Code || err.name;
  const metadata = err.$metadata ? { ...err.$metadata } : undefined;
  const commandName = context.commandName;
  const commandInput = context.commandInput;
  let suggestion;
  if (code === 'NoSuchKey' || code === 'NotFound') {
    suggestion = 'Check if the key exists in the specified bucket and if your credentials have permission.';
    return new NoSuchKey({ ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === 'NoSuchBucket') {
    suggestion = 'Check if the bucket exists and if your credentials have permission.';
    return new NoSuchBucket({ ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === 'AccessDenied' || (err.statusCode === 403) || code === 'Forbidden') {
    suggestion = 'Check your credentials and bucket policy.';
    return new PermissionError('Access denied', { ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === 'ValidationError' || (err.statusCode === 400)) {
    suggestion = 'Check the request parameters and payload.';
    return new ValidationError('Validation error', { ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === 'MissingMetadata') {
    suggestion = 'Check if the object metadata is present and valid.';
    return new MissingMetadata({ ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  // Outros mapeamentos podem ser adicionados aqui
  // Incluir detalhes do erro original para facilitar debug
  const errorDetails = [
    `Unknown error: ${err.message || err.toString()}`,
    err.code && `Code: ${err.code}`,
    err.statusCode && `Status: ${err.statusCode}`,
    err.stack && `Stack: ${err.stack.split('\n')[0]}`,
  ].filter(Boolean).join(' | ');
  
  suggestion = `Check the error details and AWS documentation. Original error: ${err.message || err.toString()}`;
  return new UnknownError(errorDetails, { ...context, original: err, metadata, commandName, commandInput, suggestion });
}

export class ConnectionStringError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: 'Check the connection string format and credentials.' });
  }
}

export class CryptoError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: 'Check if the crypto library is available and input is valid.' });
  }
}

export class SchemaError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: 'Check schema definition and input data.' });
  }
}

export class ResourceError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: details.suggestion || 'Check resource configuration, attributes, and operation context.' });
    Object.assign(this, details);
  }
}

export class PartitionError extends S3dbError {
  constructor(message, details = {}) {
    // Generate description if not provided
    let description = details.description;
    if (!description && details.resourceName && details.partitionName && details.fieldName) {
      const { resourceName, partitionName, fieldName, availableFields = [] } = details;
      description = `
Partition Field Validation Error

Resource: ${resourceName}
Partition: ${partitionName}
Missing Field: ${fieldName}

Available fields in schema:
${availableFields.map(f => `  • ${f}`).join('\n') || '  (no fields defined)'}

Possible causes:
1. Field was removed from schema but partition still references it
2. Typo in partition field name
3. Nested field path is incorrect (use dot notation like 'utm.source')

Solution:
${details.strictValidation === false
  ? '  • Update partition definition to use existing fields'
  : `  • Add missing field to schema, OR
  • Update partition definition to use existing fields, OR
  • Use strictValidation: false to skip this check during testing`}

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partitions
`.trim();
    }

    super(message, {
      ...details,
      description,
      suggestion: details.suggestion || 'Check partition definition, fields, and input values.'
    });
  }
}

export class AnalyticsNotEnabledError extends S3dbError {
  constructor(details = {}) {
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

    // Generate diagnostic description
    const description = `
Analytics Not Enabled

Plugin: ${pluginName}
Resource: ${resourceName}
Field: ${field}

Diagnostics:
  • Plugin initialized: ${pluginInitialized ? '✓ Yes' : '✗ No'}
  • Analytics resources created: ${registeredResources.length}/${configuredResources.length}
${configuredResources.map(r => {
  const exists = registeredResources.includes(r);
  return `    ${exists ? '✓' : '✗'} ${r}${!exists ? ' (missing)' : ''}`;
}).join('\n')}

Possible causes:
1. Resource not created yet - Analytics resources are created when db.createResource() is called
2. Resource created before plugin initialization - Plugin must be initialized before resources
3. Field not configured in analytics.resources config

Correct initialization order:
  1. Create database: const db = new Database({ ... })
  2. Install plugins: await db.connect() (triggers plugin.install())
  3. Create resources: await db.createResource({ name: '${resourceName}', ... })
  4. Analytics resources are auto-created by plugin

Example fix:
  const db = new Database({
    bucket: 'my-bucket',
    plugins: [new EventualConsistencyPlugin({
      resources: {
        '${resourceName}': {
          fields: {
            '${field}': { type: 'counter', analytics: true }
          }
        }
      }
    })]
  });

  await db.connect();  // Plugin initialized here
  await db.createResource({ name: '${resourceName}', ... });  // Analytics resource created here

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
      description,
      suggestion: 'Ensure resources are created after plugin initialization. Check plugin configuration and resource creation order.'
    });
  }
}

// Plugin errors
export class PluginError extends S3dbError {
  constructor(message, details = {}) {
    const {
      pluginName = 'Unknown',
      operation = 'unknown',
      ...rest
    } = details;

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

Example:
  const db = new Database({
    bucket: 'my-bucket',
    plugins: [new ${pluginName}({ /* config */ })]
  });

  await db.connect();  // Plugin installed here
  // Now plugin methods are available

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/README.md
`.trim();
    }

    super(message, {
      ...rest,
      pluginName,
      operation,
      description,
      suggestion: details.suggestion || 'Check plugin initialization and configuration.'
    });
  }
}

// Plugin storage errors
export class PluginStorageError extends S3dbError {
  constructor(message, details = {}) {
    const {
      pluginSlug = 'unknown',
      key = '',
      operation = 'unknown',
      ...rest
    } = details;

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
      description,
      suggestion: details.suggestion || 'Check plugin storage configuration and S3 permissions.'
    });
  }
}

// Partition driver errors
export class PartitionDriverError extends S3dbError {
  constructor(message, details = {}) {
    const {
      driver = 'unknown',
      operation = 'unknown',
      queueSize,
      maxQueueSize,
      ...rest
    } = details;

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
${queueSize >= maxQueueSize
  ? 'Wait for queue to drain or increase maxQueueSize'
  : 'Check driver configuration and permissions'}

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partition-drivers
`.trim();
    } else if (!description) {
      description = `
Partition Driver Error

Driver: ${driver}
Operation: ${operation}

Check driver configuration and permissions.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partition-drivers
`.trim();
    }

    super(message, {
      ...rest,
      driver,
      operation,
      queueSize,
      maxQueueSize,
      description,
      suggestion: details.suggestion || 'Check partition driver configuration.'
    });
  }
}

// Behavior errors
export class BehaviorError extends S3dbError {
  constructor(message, details = {}) {
    const {
      behavior = 'unknown',
      availableBehaviors = [],
      ...rest
    } = details;

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
      description,
      suggestion: details.suggestion || 'Check behavior name and available behaviors.'
    });
  }
}

// Stream errors
export class StreamError extends S3dbError {
  constructor(message, details = {}) {
    const {
      operation = 'unknown',
      resource,
      ...rest
    } = details;

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
      description,
      suggestion: details.suggestion || 'Check stream configuration and resource availability.'
    });
  }
}

// Metadata limit errors (specific for 2KB S3 limit)
export class MetadataLimitError extends S3dbError {
  constructor(message, details = {}) {
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
      description,
      suggestion: details.suggestion || "Use 'body-overflow' or 'body-only' behavior to handle large metadata."
    });
  }
}
