"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidResource = exports.MissingMetadata = exports.BaseS3dbError = exports.NoSuchKey = exports.BaseS3Error = exports.BaseError = void 0;
// Global base error class
class BaseError extends Error {
    constructor({ bucket, message }) {
        super();
        super.name = this.constructor.name;
        super.message = message;
        this.stack = this.stack;
        this.thrownAt = new Date();
    }
    toJson() {
        return Object.assign({}, this);
    }
    toString() {
        return `${this.name} | ${this.message}`;
    }
}
exports.BaseError = BaseError;
// AWS S3 errors
class BaseS3Error extends BaseError {
    constructor({ bucket, message }) {
        super({ bucket, message });
    }
}
exports.BaseS3Error = BaseS3Error;
class NoSuchKey extends BaseS3Error {
    constructor({ bucket, key }) {
        super({ bucket, message: `Key does not exists [s3://${bucket}/${key}]` });
        this.key = key;
    }
}
exports.NoSuchKey = NoSuchKey;
// Our errors
class BaseS3dbError extends BaseError {
    constructor({ bucket, message }) {
        super({ bucket, message });
    }
}
exports.BaseS3dbError = BaseS3dbError;
class MissingMetadata extends BaseS3dbError {
    constructor({ bucket }) {
        super({ bucket, message: `Missing metadata for bucket [s3://${bucket}]` });
    }
}
exports.MissingMetadata = MissingMetadata;
class InvalidResource extends BaseS3dbError {
    constructor({ bucket, resourceName, attributes, validation, }) {
        super({
            bucket,
            message: `Resource is not valid. Name=${resourceName} [s3://${bucket}]. ${JSON.stringify(validation)}`,
        });
        this.resourceName = resourceName;
        this.attributes = attributes;
        this.validation = validation;
    }
}
exports.InvalidResource = InvalidResource;
