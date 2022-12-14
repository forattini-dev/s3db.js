"use strict";
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
exports.S3db = exports.S3Database = void 0;
const flat_1 = require("flat");
const lodash_1 = require("lodash");
const events_1 = __importDefault(require("events"));
const s3_resource_class_1 = __importDefault(require("./s3-resource.class"));
const s3_client_class_1 = __importDefault(require("./s3-client.class"));
const validator_1 = require("./validator");
const errors_1 = require("./errors");
class S3Database extends events_1.default {
    /**
     * Constructor
     */
    constructor(options) {
        super();
        this.keyPrefix = "";
        this.bucket = "s3db";
        this.cache = false;
        this.version = "1";
        this.resources = {};
        this.options = options;
        this.parallelism = parseInt(options.parallelism + "") || 10;
        this.plugins = options.plugins || [];
        this.cache = options.cache;
        this.passphrase = options.passphrase || "";
        this.validatorInstance = (0, validator_1.ValidatorFactory)({
            passphrase: options === null || options === void 0 ? void 0 : options.passphrase,
        });
        this.client = new s3_client_class_1.default({
            connectionString: options.uri,
            parallelism: this.parallelism,
        });
        this.bucket = this.client.bucket;
        this.keyPrefix = this.client.keyPrefix;
        this.startPlugins();
    }
    /**
     * Remotely setups s3db file.
     */
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            let metadata = null;
            try {
                metadata = yield this.getMetadataFile();
            }
            catch (error) {
                if (error instanceof errors_1.S3dbMissingMetadata) {
                    metadata = this.blankMetadataStructure();
                    yield this.uploadMetadataFile();
                }
                else {
                    this.emit("error", error);
                    return Promise.reject(error);
                }
            }
            for (const resource of Object.entries(metadata.resources)) {
                const [name, definition] = resource;
                this.resources[name] = new s3_resource_class_1.default({
                    name,
                    s3db: this,
                    s3Client: this.client,
                    schema: definition.schema,
                    options: definition.options,
                    validatorInstance: this.validatorInstance,
                });
            }
            this.emit("connected", new Date());
        });
    }
    startPlugins() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.plugins && !(0, lodash_1.isEmpty)(this.plugins)) {
                const startProms = this.plugins.map((plugin) => plugin.setup(this));
                yield Promise.all(startProms);
                this.plugins.map((plugin) => plugin.start());
            }
        });
    }
    /**
     * Downloads current metadata.
     * If there isnt any file, creates an empty metadata.
     * @returns MetadataInterface
     */
    getMetadataFile() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const request = yield this.client.getObject({ key: `s3db.json` });
                const metadata = JSON.parse(String(request === null || request === void 0 ? void 0 : request.Body));
                return this.unserializeMetadata(metadata);
            }
            catch (error) {
                if (error instanceof errors_1.ClientNoSuchKey) {
                    return Promise.reject(new errors_1.S3dbMissingMetadata({ bucket: this.bucket, cause: error }));
                }
                else {
                    return Promise.reject(error);
                }
            }
        });
    }
    unserializeMetadata(metadata) {
        const file = Object.assign({}, metadata);
        if ((0, lodash_1.isEmpty)(file.resources))
            return file;
        for (const [name, structure] of Object.entries(file.resources)) {
            for (const [attr, value] of Object.entries(structure.schema)) {
                file.resources[name].schema[attr] = JSON.parse(value);
            }
        }
        return file;
    }
    uploadMetadataFile() {
        return __awaiter(this, void 0, void 0, function* () {
            const file = {
                version: this.version,
                resources: Object.entries(this.resources).reduce((acc, definition) => {
                    const [name, resource] = definition;
                    acc[name] = resource.export();
                    return acc;
                }, {}),
            };
            yield this.client.putObject({
                key: `s3db.json`,
                body: JSON.stringify(file, null, 2),
            });
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
     * Generates a new resorce with its translators and validatos.
     * @param {Object} param
     * @param {string} param.name
     * @param {Object} param.attributes
     * @param {Object} param.options
     */
    createResource({ name, attributes, options = {}, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const schema = (0, flat_1.flatten)(attributes, { safe: true });
            const resource = new s3_resource_class_1.default({
                name,
                schema,
                s3db: this,
                s3Client: this.client,
                validatorInstance: this.validatorInstance,
                options: Object.assign({ autoDecrypt: true, cache: this.cache }, options),
            });
            this.resources[name] = resource;
            yield this.uploadMetadataFile();
            return resource;
        });
    }
    /**
     * Looper
     * @param {string} name
     * @returns
     */
    resource(name) {
        if (!this.resources[name]) {
            return Promise.reject(`resource ${name} does not exist`);
        }
        return this.resources[name];
    }
}
exports.S3Database = S3Database;
exports.default = S3Database;
class S3db extends S3Database {
}
exports.S3db = S3db;
