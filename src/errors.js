export class BaseError extends Error {
  constructor({ verbose, bucket, message, ...rest }) {
    if (verbose) message = message + `\n\nVerbose:\n\n${JSON.stringify(rest, null, 2)}`;
    super(message);

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else { 
      this.stack = (new Error(message)).stack; 
    }

    super.name = this.constructor.name;
    this.name = this.constructor.name;
    this.bucket = bucket
    this.thrownAt = new Date();
  }

  toJson() {
    return { ...this };
  }

  toString() {
    return `${this.name} | ${this.message}`;
  }
}

// Base error class for S3DB
export class S3DBError extends BaseError {
  constructor(message, details = {}) {
    super({ message, ...details });
  }
}

// Database operation errors
export class DatabaseError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Validation errors
export class ValidationError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Authentication errors
export class AuthenticationError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Permission/Authorization errors
export class PermissionError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Encryption errors
export class EncryptionError extends S3DBError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}

// Resource not found error
export class ResourceNotFound extends S3DBError {
  constructor({ bucket, resourceName, id, ...rest }) {
    super(`Resource not found: ${resourceName}/${id} [bucket:${bucket}]`, {
      bucket,
      resourceName,
      id,
      ...rest
    });
  }
}

export class NoSuchBucket extends S3DBError {
  constructor({ bucket, ...rest }) {
    super(`Bucket does not exists [bucket:${bucket}]`, { bucket, ...rest });
  }
}

export class NoSuchKey extends S3DBError {
  constructor({ bucket, key, ...rest }) {
    super(`Key [${key}] does not exists [bucket:${bucket}/${key}]`, { bucket, key, ...rest });
  }
}

export class NotFound extends NoSuchKey {}

export class MissingMetadata extends S3DBError {
  constructor({ bucket, ...rest }) {
    super(`Missing metadata for bucket [bucket:${bucket}]`, { bucket, ...rest });
  }
}

export class InvalidResourceItem extends S3DBError {
  constructor({
    bucket,
    resourceName,
    attributes,
    validation,
    message
  }) {
    super(
      message || `Validation error: This item is not valid. Resource=${resourceName} [bucket:${bucket}].\n${JSON.stringify(validation, null, 2)}`,
      {
        bucket,
        resourceName,
        attributes,
        validation,
      }
    );
  }
}

export class UnknownError extends S3DBError {}

export const ErrorMap = {
  'NotFound': NotFound,
  'NoSuchKey': NoSuchKey,
  'UnknownError': UnknownError,
  'NoSuchBucket': NoSuchBucket,
  'MissingMetadata': MissingMetadata,
  'InvalidResourceItem': InvalidResourceItem,
};
