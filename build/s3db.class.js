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
const uuid_1 = require("uuid");
const events_1 = __importDefault(require("events"));
const flat_1 = require("flat");
const promise_pool_1 = require("@supercharge/promise-pool");
const lodash_1 = require("lodash");
const s3_client_class_1 = __importDefault(require("./s3-client.class"));
const s3_streamer_class_1 = __importDefault(require("./s3-streamer.class"));
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
        this.version = "1";
        this.logger = options.logger || console;
        this.parallelism = parseInt(options.parallelism + "") || 5;
        this.metadata = this.blankMetadataStructure();
        this.validatorInstance = (0, validator_1.ValidatorFactory)({
            passphrase: options === null || options === void 0 ? void 0 : options.passphrase,
        });
        this.client = new s3_client_class_1.default({
            connectionString: options.uri,
        });
        this.bucket = this.client.bucket;
        this.keyPrefix = this.client.keyPrefix;
        this.streamer = new s3_streamer_class_1.default({
            s3db: this,
            client: this.client,
            parallelism: this.parallelism
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
                const request = yield this.client.getObject({
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
            yield this.client.putObject({ body, key: `s3db.json` });
            return body;
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
            yield this.client.putObject({
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
            if (!attributes.id && attributes.id !== 0)
                attributes.id = (0, uuid_1.v4)();
            const mapper = this.metadata.resources[resourceName].mapper;
            yield this.client.putObject({
                key: path.join(`resource=${resourceName}`, `id=${attributes.id}`),
                body: "",
                metadata: this.translateObjectWithMapper(resourceName, (0, lodash_1.omit)(attributesFlat, "id"), mapper),
            });
            this.emit("inserted", attributes);
            return attributes;
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
            const request = yield this.client.headObject({
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
    bulkInsert({ resourceName, objects, }) {
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
    count({ resourceName }) {
        return __awaiter(this, void 0, void 0, function* () {
            let count = 0;
            let truncated = true;
            let continuationToken;
            while (truncated) {
                const res = yield this.client.listObjects({
                    prefix: `resource=${resourceName}`,
                    continuationToken,
                });
                count += res.KeyCount || 0;
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken;
            }
            return count;
        });
    }
    listIds({ resourceName, limit = 1000, }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let ids = [];
            let truncated = true;
            let continuationToken;
            while (truncated && ids.length < limit) {
                const res = yield this.client.listObjects({
                    prefix: `resource=${resourceName}`,
                    continuationToken,
                });
                ids = ids.concat((_a = res.Contents) === null || _a === void 0 ? void 0 : _a.map((x) => x.Key));
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken;
            }
            ids = ids.map((x) => x.replace(path.join(this.keyPrefix, `resource=${resourceName}`, "id="), ""));
            return ids;
        });
    }
    stream({ resourceName, limit = 1000, }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.streamer.resourceRead({ resourceName });
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
                return this.bulkInsert({ resourceName, objects });
            }),
            count: () => __awaiter(this, void 0, void 0, function* () { return this.count({ resourceName }); }),
            listIds: (options = {}) => __awaiter(this, void 0, void 0, function* () {
                const { limit = 1000 } = options;
                return this.listIds({ resourceName, limit });
            }),
            stream: (options = {}) => __awaiter(this, void 0, void 0, function* () {
                const { limit = 1000 } = options;
                return this.stream({ resourceName, limit });
            }),
        };
        return looper;
    }
}
exports.default = S3db;
