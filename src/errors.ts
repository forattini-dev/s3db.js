// Errors interfaces
export interface S3Error {
  name: string;
  message: string;
  cause?: Error;
}

export interface S3dbError {
  name: string;
  message: string;
  cause?: Error;
}

export class BaseError extends Error {
  bucket: any;
  thrownAt: Date;
  cause: Error | undefined;

  constructor({ bucket, message, cause }: { bucket: string; message: string, cause?: Error }) {
    super(message);

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else { 
      this.stack = (new Error(message)).stack; 
    }

    super.name = this.constructor.name;
    this.name = this.constructor.name;
    this.cause = cause
    this.thrownAt = new Date();
  }

  toJson() {
    return { ...this };
  }

  toString() {
    return `${this.name} | ${this.message}`;
  }
}

// AWS S3 errors
export abstract class BaseS3Error extends BaseError implements S3Error {
  constructor({ bucket, message }: { bucket: string; message: string }) {
    super({ bucket, message });
  }
}

export class ClientNoSuchKey extends BaseS3Error {
  key: string;
  constructor({ bucket, key }: { bucket: string; key: string }) {
    super({ bucket, message: `Key does not exists [s3://${bucket}/${key}]` });
    this.key = key;
  }
}

// Our errors
export abstract class BaseS3dbError extends BaseError implements S3dbError {
  constructor({ bucket, message, cause }: { bucket: string; message: string, cause?: Error }) {
    super({ bucket, message, cause });
  }
}

export class S3dbMissingMetadata extends BaseS3dbError {
  constructor({ bucket, cause }: { bucket: string, cause?: Error }) {
    super({ bucket, cause, message: `Missing metadata for bucket [s3://${bucket}]` });
  }
}

export class S3dbInvalidResource extends BaseS3dbError {
  resourceName: any;
  attributes: any;
  validation: any;

  constructor({
    bucket,
    resourceName,
    attributes,
    validation,
  }: {
    bucket: string;
    resourceName: string;
    attributes: string;
    validation: any[];
  }) {
    super({
      bucket,
      message: `Resource is not valid. Name=${resourceName} [s3://${bucket}].\n${JSON.stringify(validation, null, 2)}`,
    });

    this.resourceName = resourceName;
    this.attributes = attributes;
    this.validation = validation;
  }
}
