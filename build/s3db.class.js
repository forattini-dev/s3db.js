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
const flat_1 = require("flat");
const lodash_1 = require("lodash");
const events_1 = __importDefault(require("events"));
const resource_class_1 = __importDefault(require("./resource.class"));
const s3_client_class_1 = __importDefault(require("./s3-client.class"));
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
        this.resources = {};
        this.version = "1";
        this.options = options;
        this.parallelism = parseInt(options.parallelism + "") || 10;
        this.metadata = this.blankMetadataStructure();
        this.passphrase = options === null || options === void 0 ? void 0 : options.passphrase;
        this.plugins = options.plugins || [];
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
            try {
                this.metadata = yield this.getMetadataFile();
            }
            catch (error) {
                if (error instanceof errors_1.S3dbMissingMetadata) {
                    this.metadata = this.blankMetadataStructure();
                    yield this.uploadMetadataFile();
                }
                else {
                    this.emit("error", error);
                    throw error;
                }
            }
            Object.entries(this.metadata.resources).forEach(([name, resource]) => {
                this.resources[name] = new resource_class_1.default({
                    name,
                    s3db: this,
                    s3Client: this.client,
                    schema: resource.schema,
                    options: resource.options,
                    validatorInstance: this.validatorInstance,
                });
            });
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
            yield this.client.putObject({
                key: `s3db.json`,
                body: JSON.stringify(this.metadata, null, 2),
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
     * @param {string} param.resourceName
     * @param {Object} param.attributes
     * @param {Object} param.options
     */
    createResource({ resourceName, attributes, options = {}, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const schema = (0, flat_1.flatten)(attributes, { safe: true });
            const resource = new resource_class_1.default({
                schema,
                options: Object.assign({ autoDecrypt: true }, options),
                s3db: this,
                name: resourceName,
                s3Client: this.client,
                validatorInstance: this.validatorInstance,
            });
            this.resources[resourceName] = resource;
            this.metadata.resources[resourceName] = resource.export();
            yield this.uploadMetadataFile();
            return resource;
        });
    }
    /**
     * Looper
     * @param {string} resourceName
     * @returns
     */
    resource(resourceName) {
        const resource = this.resources[resourceName];
        if (resource)
            return resource;
        return {
            define: (attributes, options = {}) => this.createResource({
                resourceName,
                attributes,
                options,
            }),
        };
    }
}
exports.default = S3db;
