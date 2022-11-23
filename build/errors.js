"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3dbInvalidResource = exports.S3dbMissingMetadata = exports.BaseS3dbError = exports.ClientNoSuchKey = exports.BaseS3Error = exports.BaseError = void 0;
class BaseError extends Error {
    constructor({ bucket, message, cause }) {
        super(message);
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = (new Error(message)).stack;
        }
        super.name = this.constructor.name;
        this.name = this.constructor.name;
        this.cause = cause;
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
class ClientNoSuchKey extends BaseS3Error {
    constructor({ bucket, key }) {
        super({ bucket, message: `Key does not exists [s3://${bucket}/${key}]` });
        this.key = key;
    }
}
exports.ClientNoSuchKey = ClientNoSuchKey;
// Our errors
class BaseS3dbError extends BaseError {
    constructor({ bucket, message, cause }) {
        super({ bucket, message, cause });
    }
}
exports.BaseS3dbError = BaseS3dbError;
class S3dbMissingMetadata extends BaseS3dbError {
    constructor({ bucket, cause }) {
        super({ bucket, cause, message: `Missing metadata for bucket [s3://${bucket}]` });
    }
}
exports.S3dbMissingMetadata = S3dbMissingMetadata;
class S3dbInvalidResource extends BaseS3dbError {
    constructor({ bucket, resourceName, attributes, validation, }) {
        super({
            bucket,
            message: `Resource is not valid. Name=${resourceName} [s3://${bucket}].\n${JSON.stringify(validation, null, 2)}`,
        });
        this.resourceName = resourceName;
        this.attributes = attributes;
        this.validation = validation;
    }
}
exports.S3dbInvalidResource = S3dbInvalidResource;
