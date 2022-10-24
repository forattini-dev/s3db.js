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
const node_url_1 = require("node:url");
const uuid_1 = require("uuid");
const events_1 = __importDefault(require("events"));
const aws_sdk_1 = require("aws-sdk");
const flat_1 = require("flat");
const promise_pool_1 = require("@supercharge/promise-pool");
const lodash_1 = require("lodash");
const validator_1 = require("./validator");
const errors_1 = require("./errors");
class S3db extends events_1.default {
    /**
     * Constructor
     */
    constructor(options) {
        super();
        this.keyPrefix = "";
        this.bucket = "s3db";
        this.options = options;
        this.version = '1';
        this.logger = options.logger || console;
        this.parallelism = parseInt(options.parallelism + '') || 5;
        this.metadata = this.blankMetadataStructure();
        this.validatorInstance = (0, validator_1.ValidatorFactory)({
            passphrase: options === null || options === void 0 ? void 0 : options.passphrase,
        });
        const uri = new node_url_1.URL(options.uri);
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
     * Remotely setups s3db file.
     */
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const metadata = yield this.getMetadata();
                this.setMetadata(metadata);
            }
            catch (error) {
                if (error instanceof errors_1.MissingMetadata) {
                    const metadata = yield this.generateAndUploadMetadata();
                    this.setMetadata(metadata);
                    if (this.version !== metadata.version) {
                        this.logger.warn(`Client version ${this.version} is different than ${metadata.version}`);
                    }
                    this.emit("connected", this);
                }
                else {
                    this.emit("error", error);
                    throw error;
                }
            }
        });
    }
    /**
     * Downloads current metadata.
     * If there isnt any file, creates an empty metadata.
     * @returns MetadataInterface
     */
    getMetadata() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const request = yield this._s3GetObject({
                    key: `s3db.json`,
                });
                const metadata = (0, lodash_1.merge)(this.blankMetadataStructure(), JSON.parse(String(request === null || request === void 0 ? void 0 : request.Body)));
                return metadata;
            }
            catch (error) {
                if (error instanceof errors_1.NoSuchKey) {
                    throw new errors_1.MissingMetadata({ bucket: this.bucket });
                }
                else {
                    throw error;
                }
            }
        });
    }
    /**
     * Reorganizes its validates and translators according to the new metadata definition.
     * @param metadata
     */
    setMetadata(metadata) {
        this.metadata = metadata;
        Object.entries(metadata.resources).forEach(([resourceName, resourceDefinition]) => {
            let resource = this.metadata.resources[resourceName];
            resource = Object.assign(Object.assign({}, resource), { validator: this.validatorInstance.compile(resourceDefinition.schema), reversed: this.reverseMapper(resourceDefinition.mapper) });
            this.metadata.resources[resourceName] = resource;
        });
    }
    /**
     * Generates empty metadata structure.
     * @returns MetadataInterface
     */
    blankMetadataStructure() {
        return {
            version: `1`,
            resources: {},
        };
    }
    /**
     * Generate and upload new metadata structure.
     * @returns MetadataInterface
     */
    generateAndUploadMetadata() {
        return __awaiter(this, void 0, void 0, function* () {
            const body = this.blankMetadataStructure();
            yield this._s3PutObject({ body, key: `s3db.json` });
            return body;
        });
    }
    /**
     * Proxy to AWS S3's getObject
     * @param param0 key
     * @returns
     */
    _s3GetObject({ key }) {
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
     * Proxy to AWS S3's putObject
     * @param {Object} param
     * @param {string} param.key
     * @param {string} param.body
     * @param {string} param.metadata
     * @returns
     */
    _s3PutObject({ key, body, metadata, }) {
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
                this.logger.error(error);
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
    _s3HeadObject({ key }) {
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
     * Reverses a object to have the oter way to translate from
     * @param {Object} mapper
     * @returns
     */
    reverseMapper(mapper) {
        return Object.entries(mapper).reduce((acc, [key, value]) => {
            acc[String(value)] = key;
            return acc;
        }, {});
    }
    /**
     * Generates a new resorce with its translators and validatos.
     * @param {Object} param
     * @param {string} param.resourceName
     * @param {Object} param.attributes
     * @param {Object} param.options
     */
    newResource({ resourceName, attributes, options = {}, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const metadata = yield this.getMetadata();
            const schema = (0, flat_1.flatten)(attributes);
            let i = 0;
            const mapper = (0, lodash_1.sortBy)(Object.entries(schema), ["0"]).reduce((acc, [key, value]) => {
                acc[key] = String(i++);
                return acc;
            }, {});
            metadata.resources[resourceName] = {
                name: resourceName,
                options,
                schema,
                mapper,
            };
            this.setMetadata(metadata);
            yield this._s3PutObject({
                body: metadata,
                key: `s3db.json`,
            });
            return this.resource(resourceName);
        });
    }
    translateObjectWithMapper(resourceName, obj, mapper) {
        if ((0, lodash_1.isEmpty)(mapper))
            throw new Error("invalid mapper");
        return Object.entries(obj).reduce((acc, [key, value]) => {
            acc[mapper[key]] = value;
            return acc;
        }, {});
    }
    /**
     * Inserts a new object into the resource list.
     * @param {Object} param
     * @returns
     */
    insert({ attributes, resourceName, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const attributesFlat = (0, flat_1.flatten)(attributes);
            // validate
            if (!this.metadata.resources[resourceName])
                throw new Error("Resource does not exist");
            const errors = this.metadata.resources[resourceName].validator(attributesFlat);
            if ((0, lodash_1.isArray)(errors)) {
                throw new errors_1.InvalidResource({
                    bucket: this.bucket,
                    resourceName,
                    attributes,
                    validation: errors,
                });
            }
            // save
            const id = (attributes.id || attributes.id === 0) ? attributes.id : (0, uuid_1.v4)();
            const mapper = this.metadata.resources[resourceName].mapper;
            yield this._s3PutObject({
                key: path.join(`resource=${resourceName}`, `id=${id}`),
                body: "",
                metadata: this.translateObjectWithMapper(resourceName, (0, lodash_1.omit)(attributesFlat, 'id'), mapper),
            });
            this.emit("data", Object.assign(Object.assign({}, attributes), { id }));
            return Object.assign(Object.assign({}, attributes), { id });
        });
    }
    /**
     * Get a resource by id
     * @param {Object} param
     * @returns
     */
    getById({ id, resourceName, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const mapper = this.metadata.resources[resourceName].reversed;
            const request = yield this._s3HeadObject({
                key: path.join(`resource=${resourceName}`, `id=${id}`),
            });
            const data = this.translateObjectWithMapper(resourceName, request.Metadata, mapper);
            data.id = id;
            return (0, lodash_1.merge)((0, flat_1.unflatten)(data));
        });
    }
    /**
     *
     */
    bulkInsert(resourceName, objects) {
        return __awaiter(this, void 0, void 0, function* () {
            const { results } = yield promise_pool_1.PromisePool.for(objects)
                .withConcurrency(this.parallelism)
                .handleError((error, content) => __awaiter(this, void 0, void 0, function* () {
                this.emit("error", error, content);
            }))
                .process((attributes) => __awaiter(this, void 0, void 0, function* () {
                const result = yield this.insert({
                    resourceName,
                    attributes,
                });
                return result;
            }));
            return results;
        });
    }
    /**
     * Looper
     * @param {string} resourceName
     * @returns
     */
    resource(resourceName) {
        const looper = {
            define: (attributes, options = {}) => this.newResource({
                resourceName,
                attributes,
                options,
            }),
            definition: () => this.metadata.resources[resourceName],
            get: (id) => this.getById({
                resourceName,
                id,
            }),
            insert: (attributes) => this.insert({
                resourceName,
                attributes,
            }),
            bulkInsert: (objects) => __awaiter(this, void 0, void 0, function* () {
                return this.bulkInsert(resourceName, objects);
            }),
        };
        return looper;
    }
}
exports.default = S3db;
