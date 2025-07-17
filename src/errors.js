export class BaseError extends Error {
  constructor({ verbose, bucket, key, message, code, statusCode, requestId, awsMessage, original, commandName, commandInput, metadata, suggestion, ...rest }) {
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

// Utilitário para mapear erro AWS para erro customizado
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
  suggestion = 'Check the error details and AWS documentation.';
  return new UnknownError('Unknown error', { ...context, original: err, metadata, commandName, commandInput, suggestion });
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
    super(message, { ...details, suggestion: details.suggestion || 'Check partition definition, fields, and input values.' });
  }
}
