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

export class NoSuchBucket extends BaseError {
  constructor({ bucket, ...rest }) {
    super({ ...rest, bucket, message: `Bucket does not exists [bucket:${bucket}]` });
  }
}

export class NoSuchKey extends BaseError {
  constructor({ bucket, key, ...rest }) {
    super({ ...rest, bucket, message: `Key does not exists [bucket:${bucket}/${key}]` });
    this.key = key;
  }
}

export class NotFound extends NoSuchKey {}

export class MissingMetadata extends BaseError {
  constructor({ bucket, ...rest }) {
    super({ ...rest, bucket, message: `Missing metadata for bucket [bucket:${bucket}]` });
  }
}

export class InvalidResourceItem extends BaseError {
  constructor({
    bucket,
    resourceName,
    attributes,
    validation,
  }) {
    super({
      bucket,
      message: `This item is not valid. Resource=${resourceName} [bucket:${bucket}].\n${JSON.stringify(validation, null, 2)}`,
    });

    this.resourceName = resourceName;
    this.attributes = attributes;
    this.validation = validation;
  }
}

export class UnknownError extends BaseError {}

export const ErrorMap = {
  'NotFound': NotFound,
  'NoSuchKey': NoSuchKey,
  'UnknownError': UnknownError,
  'NoSuchBucket': NoSuchBucket,
  'MissingMetadata': MissingMetadata,
  'InvalidResourceItem': InvalidResourceItem,
};
