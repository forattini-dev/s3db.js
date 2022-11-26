"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const lodash_1 = require("lodash");
const nanoid_1 = require("nanoid");
const events_1 = __importDefault(require("events"));
const aws_sdk_1 = require("aws-sdk");
const promise_pool_1 = __importDefault(require("@supercharge/promise-pool"));
const errors_1 = require("./errors");
class S3Client extends events_1.default {
    constructor({ connectionString, parallelism = 10, AwsS3, }) {
        super();
        this.id = (0, nanoid_1.nanoid)(7);
        const uri = new URL(connectionString);
        this.bucket = uri.hostname;
        this.parallelism = parallelism;
        let [, ...subpath] = uri.pathname.split("/");
        this.keyPrefix = [...(subpath || [])].join("/");
        this.client =
            AwsS3 ||
                new aws_sdk_1.S3({
                    credentials: new aws_sdk_1.Credentials({
                        accessKeyId: uri.username,
                        secretAccessKey: uri.password,
                    }),
                });
    }
    /**
     *
     * @param param0
     * @returns
     */
    getObject({ key }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const options = {
                    Bucket: this.bucket,
                    Key: path.join(this.keyPrefix, key),
                };
                const response = yield this.client.getObject(options).promise();
                this.emit("request", "getObject", options);
                return response;
            }
            catch (error) {
                if (error instanceof Error) {
                    if (error.name === "NoSuchKey") {
                        return Promise.reject(new errors_1.ClientNoSuchKey({ bucket: this.bucket, key }));
                    }
                }
                return Promise.reject(error);
            }
        });
    }
    /**
     *
     * @param param0
     * @returns
     */
    putObject({ key, metadata, contentType, body, contentEncoding, }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const options = {
                    Bucket: this.bucket,
                    Key: path.join(this.keyPrefix, key),
                    Metadata: Object.assign({}, metadata),
                    Body: body,
                    ContentType: contentType,
                    ContentEncoding: contentEncoding,
                };
                const response = yield this.client.putObject(options).promise();
                this.emit("request", "putObject", options);
                return response;
            }
            catch (error) {
                this.emit("error", error);
                return Promise.reject(error);
            }
        });
    }
    /**
     * Proxy to AWS S3's headObject
     * @param {Object} param
     * @param {string} param.key
     * @returns
     */
    headObject({ key }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const options = {
                    Bucket: this.bucket,
                    Key: path.join(this.keyPrefix, key),
                };
                const response = yield this.client.headObject(options).promise();
                this.emit("request", "headObject", options);
                return response;
            }
            catch (error) {
                if (error instanceof Error) {
                    if (error.name === "NoSuchKey" || error.name === "NotFound") {
                        return Promise.reject(new errors_1.ClientNoSuchKey({ bucket: this.bucket, key }));
                    }
                }
                this.emit("error", error);
                return Promise.reject(error);
            }
        });
    }
    /**
     * Proxy to AWS S3's deleteObject
     * @param {Object} param
     * @param {string} param.key
     * @returns
     */
    deleteObject(key) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const options = {
                    Bucket: this.bucket,
                    Key: path.join(this.keyPrefix, key),
                };
                const response = yield this.client.deleteObject(options).promise();
                this.emit("request", "deleteObject", options);
                return response;
            }
            catch (error) {
                this.emit("error", error);
                if (error instanceof Error) {
                    if (error.name === "NoSuchKey") {
                        return Promise.reject(new errors_1.ClientNoSuchKey({ bucket: this.bucket, key }));
                    }
                }
                return Promise.reject(error);
            }
        });
    }
    /**
     * Proxy to AWS S3's deleteObjects
     * @param {Object} param
     * @param {string} param.keys
     * @returns
     */
    deleteObjects(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            const packages = (0, lodash_1.chunk)(keys, 1000);
            const { results, errors } = yield promise_pool_1.default.for(packages)
                .withConcurrency(this.parallelism)
                .process((keys) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const options = {
                        Bucket: this.bucket,
                        Delete: {
                            Objects: keys.map((key) => ({
                                Key: path.join(this.keyPrefix, key),
                            })),
                        },
                    };
                    const response = yield this.client.deleteObjects(options).promise();
                    this.emit("request", "deleteObjects", options);
                    return response;
                }
                catch (error) {
                    this.emit("error", error);
                    return Promise.reject(error);
                }
            }));
            return {
                deleted: results,
                notFound: errors,
            };
        });
    }
    /**
     *
     * @param param0
     * @returns
     */
    listObjects({ prefix, maxKeys = 1000, continuationToken, }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const options = {
                    Bucket: this.bucket,
                    MaxKeys: maxKeys,
                    ContinuationToken: continuationToken,
                    Prefix: path.join(this.keyPrefix, prefix || ""),
                };
                const response = yield this.client.listObjectsV2(options).promise();
                this.emit("request", "listObjectsV2", options);
                return response;
            }
            catch (error) {
                this.emit("error", error);
                return Promise.reject(error);
            }
        });
    }
    count({ prefix } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            this.emit("request", "count", { prefix });
            let count = 0;
            let truncated = true;
            let continuationToken;
            while (truncated) {
                const options = {
                    prefix,
                    continuationToken,
                };
                const res = yield this.listObjects(options);
                count += res.KeyCount || 0;
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken;
            }
            return count;
        });
    }
    getAllKeys({ prefix } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            this.emit("request", "getAllKeys", { prefix });
            let keys = [];
            let truncated = true;
            let continuationToken;
            while (truncated) {
                const options = {
                    prefix,
                    continuationToken,
                };
                const res = yield this.listObjects(options);
                if (res.Contents) {
                    keys = keys.concat(res.Contents.map((x) => x.Key));
                }
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken;
            }
            return keys
                .map((x) => x.replace(this.keyPrefix, ""))
                .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x));
        });
    }
}
exports.default = S3Client;
