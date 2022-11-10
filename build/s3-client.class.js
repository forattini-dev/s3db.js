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
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const aws_sdk_1 = require("aws-sdk");
const lodash_1 = require("lodash");
const errors_1 = require("./errors");
class S3Client {
    constructor({ connectionString }) {
        const uri = new URL(connectionString);
        this.bucket = uri.hostname;
        let [, ...subpath] = uri.pathname.split("/");
        this.keyPrefix = [...(subpath || [])].join("/");
        this.client = new aws_sdk_1.S3({
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
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const request = yield ((_a = this.client) === null || _a === void 0 ? void 0 : _a.getObject({
                    Bucket: this.bucket,
                    Key: path.join(this.keyPrefix, key),
                }).promise());
                return request;
            }
            catch (error) {
                if (error instanceof Error) {
                    if (error.name === "NoSuchKey") {
                        throw new errors_1.NoSuchKey({ bucket: this.bucket, key });
                    }
                    else {
                        return Promise.reject(new Error(error.name));
                    }
                }
                throw error;
            }
        });
    }
    /**
     *
     * @param param0
     * @returns
     */
    putObject({ key, body, metadata, }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const request = yield this.client
                    .putObject({
                    Bucket: this.bucket,
                    Key: path.join(this.keyPrefix, key),
                    Body: Buffer.from((0, lodash_1.isObject)(body) ? JSON.stringify(body, null, 2) : body),
                    Metadata: Object.assign({}, metadata),
                })
                    .promise();
                return request;
            }
            catch (error) {
                throw error;
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
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const request = yield ((_a = this.client) === null || _a === void 0 ? void 0 : _a.headObject({
                    Bucket: this.bucket,
                    Key: path.join(this.keyPrefix, key),
                }).promise());
                return request;
            }
            catch (error) {
                if (error instanceof Error) {
                    if (error.name === "NoSuchKey") {
                        throw new errors_1.NoSuchKey({ bucket: this.bucket, key });
                    }
                    else {
                        return Promise.reject(new Error(error.name));
                    }
                }
                throw error;
            }
        });
    }
    /**
     *
     * @param param0
     * @returns
     */
    listObjects({ prefix, maxKeys = 1000, continuationToken, }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const request = yield ((_a = this.client) === null || _a === void 0 ? void 0 : _a.listObjectsV2({
                    Bucket: this.bucket,
                    Prefix: path.join(this.keyPrefix, prefix),
                    MaxKeys: maxKeys,
                    ContinuationToken: continuationToken,
                }).promise());
                return request;
            }
            catch (error) {
                console.log({ error });
                if (error instanceof Error) {
                    return Promise.reject(new Error(error.name));
                }
                throw error;
            }
        });
    }
}
exports.default = S3Client;
