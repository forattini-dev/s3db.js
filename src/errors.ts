// Global base error class
export abstract class BaseError extends Error {
  bucket: any;
  thrownAt: Date;
  constructor({ bucket, message }: { bucket: string; message: string }) {
    super();
    super.name = this.constructor.name;
    super.message = message;
    this.stack = this.stack;
    this.thrownAt = new Date();
  }

  toJson() {
    return { ...this };
  }

  toString() {
    return `${this.name} | ${this.message}`;
  }
}

// Errors interfaces
export interface S3Error {
  name: string;
  message: string;
}

export interface S3dbError {
  name: string;
  message: string;
}

// AWS S3 errors
export abstract class BaseS3Error extends BaseError implements S3Error {
  constructor({ bucket, message }: { bucket: string; message: string }) {
    super({ bucket, message });
  }
}

export class NoSuchKey extends BaseS3Error {
  key: string;
  constructor({ bucket, key }: { bucket: string; key: string }) {
    super({ bucket, message: `Key does not exists [s3://${bucket}/${key}]` });
    this.key = key;
  }
}

// Our errors
export abstract class BaseS3dbError extends BaseError implements S3dbError {
  constructor({ bucket, message }: { bucket: string; message: string }) {
    super({ bucket, message });
  }
}

export class MissingMetadata extends BaseS3dbError {
  constructor({ bucket }: { bucket: string }) {
    super({ bucket, message: `Missing metadata for bucket [s3://${bucket}]` });
  }
}

export class InvalidResource extends BaseS3dbError {
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
      message: `Resource is not valid. Name=${resourceName} [s3://${bucket}]. ${JSON.stringify(validation)}`,
    });

    this.resourceName = resourceName;
    this.attributes = attributes;
    this.validation = validation;
  }
}
