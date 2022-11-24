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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const crypto_js_1 = __importDefault(require("crypto-js"));
const nanoid_1 = require("nanoid");
const events_1 = __importDefault(require("events"));
const lodash_1 = require("lodash");
const flat_1 = require("flat");
const promise_pool_1 = require("@supercharge/promise-pool");
const errors_1 = require("./errors");
const resource_ids_read_stream_class_1 = __importDefault(require("./stream/resource-ids-read-stream.class"));
const resource_ids_transformer_class_1 = __importDefault(require("./stream/resource-ids-transformer.class"));
class Resource extends events_1.default {
    /**
     * Constructor
     */
    constructor(params) {
        super();
        this.s3db = params.s3db;
        this.name = params.name;
        this.schema = params.schema;
        this.options = params.options;
        this.client = params.s3Client;
        this.validator = params.validatorInstance.compile(this.schema);
        const { mapObj, reversedMapObj } = this.getMappersFromSchema(this.schema);
        this.mapObj = mapObj;
        this.reversedMapObj = reversedMapObj;
        this.studyOptions();
    }
    getMappersFromSchema(schema) {
        let i = 0;
        const mapObj = (0, lodash_1.sortBy)(Object.entries(schema), ["0"]).reduce((acc, [key, value]) => {
            acc[key] = String(i++);
            return acc;
        }, {});
        const reversedMapObj = Object.entries(mapObj).reduce((acc, [key, value]) => {
            acc[String(value)] = key;
            return acc;
        }, {});
        return {
            mapObj,
            reversedMapObj,
        };
    }
    export() {
        const data = {
            name: this.name,
            schema: this.schema,
            mapper: this.mapObj,
            options: this.options,
        };
        for (const [name, definition] of Object.entries(this.schema)) {
            data.schema[name] = JSON.stringify(definition);
        }
        return data;
    }
    studyOptions() {
        if (!this.options.afterUnmap)
            this.options.beforeMap = [];
        if (!this.options.afterUnmap)
            this.options.afterUnmap = [];
        const schema = (0, flat_1.flatten)(this.schema, { safe: true });
        for (const [name, definition] of Object.entries(schema)) {
            if (definition.includes("secret")) {
                if (this.options.autoDecrypt === true) {
                    this.options.afterUnmap.push({ attribute: name, action: "decrypt" });
                }
            }
            if (definition.includes("array")) {
                this.options.beforeMap.push({ attribute: name, action: "fromArray" });
                this.options.afterUnmap.push({ attribute: name, action: "toArray" });
            }
            if (definition.includes("number")) {
                this.options.beforeMap.push({ attribute: name, action: "toString" });
                this.options.afterUnmap.push({ attribute: name, action: "toNumber" });
            }
            if (definition.includes("boolean")) {
                this.options.beforeMap.push({ attribute: name, action: "toJson" });
                this.options.afterUnmap.push({ attribute: name, action: "fromJson" });
            }
        }
    }
    check(data) {
        const result = {
            original: Object.assign({}, data),
            isValid: false,
            errors: [],
        };
        const check = this.validator(data);
        if (check === true) {
            result.isValid = true;
        }
        else {
            result.errors = check;
        }
        return Object.assign(Object.assign({}, result), { data });
    }
    validate(data) {
        return this.check((0, flat_1.flatten)(data, { safe: true }));
    }
    map(data) {
        let obj = Object.assign({}, data);
        for (const rule of this.options.beforeMap) {
            if (rule.action === "fromArray") {
                obj[rule.attribute] = (obj[rule.attribute] || []).join("|");
            }
            else if (rule.action === "toString") {
                obj[rule.attribute] = String(obj[rule.attribute]);
            }
            else if (rule.action === "toJson") {
                obj[rule.attribute] = JSON.stringify(obj[rule.attribute]);
            }
        }
        obj = Object.entries(obj).reduce((acc, [key, value]) => {
            acc[this.mapObj[key]] = (0, lodash_1.isArray)(value) ? value.join("|") : value;
            return acc;
        }, {});
        return obj;
    }
    unmap(data) {
        const obj = Object.entries(data).reduce((acc, [key, value]) => {
            acc[this.reversedMapObj[key]] = value;
            return acc;
        }, {});
        for (const rule of this.options.afterUnmap) {
            if (rule.action === "decrypt") {
                const decrypted = crypto_js_1.default.AES.decrypt(obj[rule.attribute], String(this.s3db.passphrase));
                obj[rule.attribute] = decrypted.toString(crypto_js_1.default.enc.Utf8);
            }
            else if (rule.action === "toArray") {
                obj[rule.attribute] = (obj[rule.attribute] || "").split("|");
            }
            else if (rule.action === "toNumber") {
                obj[rule.attribute] = Number(obj[rule.attribute] || "");
            }
            else if (rule.action === "fromJson") {
                obj[rule.attribute] = JSON.parse(obj[rule.attribute]);
            }
        }
        return obj;
    }
    /**
     * Inserts a new object into the resource list.
     * @param {Object} param
     * @returns
     */
    insert(attributes) {
        return __awaiter(this, void 0, void 0, function* () {
            let _a = (0, flat_1.flatten)(attributes, {
                safe: true,
            }), { id } = _a, attrs = __rest(_a, ["id"]);
            // validate
            const { isValid, errors, data: validated } = this.check(attrs);
            if (!isValid) {
                return Promise.reject(new errors_1.S3dbInvalidResource({
                    bucket: this.client.bucket,
                    resourceName: this.name,
                    attributes,
                    validation: errors,
                }));
            }
            if (!id && id !== 0) {
                id = (0, nanoid_1.nanoid)();
            }
            // save
            yield this.client.putObject({
                key: path.join(`resource=${this.name}`, `id=${id}`),
                body: "",
                metadata: this.map(validated),
            });
            const final = Object.assign({ id }, (0, flat_1.unflatten)(validated));
            this.emit("inserted", final);
            this.s3db.emit("inserted", this.name, final);
            return final;
        });
    }
    /**
     * Get a resource by id
     * @param {Object} param
     * @returns
     */
    getById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = yield this.client.headObject({
                key: path.join(`resource=${this.name}`, `id=${id}`),
            });
            let data = this.unmap(request.Metadata);
            data = (0, flat_1.unflatten)(data);
            data.id = id;
            data._length = request.ContentLength;
            data._createdAt = request.LastModified;
            data._checksum = request.ChecksumSHA256;
            if (request.Expiration)
                data._expiresAt = request.Expiration;
            this.emit("got", data);
            this.s3db.emit("got", this.name, data);
            return data;
        });
    }
    /**
     * Delete a resource by id
     * @param {Object} param
     * @returns
     */
    deleteById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = path.join(`resource=${this.name}`, `id=${id}`);
            const response = yield this.client.deleteObject(key);
            this.emit("deleted", id);
            this.s3db.emit("deleted", this.name, id);
            return response;
        });
    }
    /**
     *
     */
    bulkInsert(objects) {
        return __awaiter(this, void 0, void 0, function* () {
            const { results } = yield promise_pool_1.PromisePool.for(objects)
                .withConcurrency(this.s3db.parallelism)
                .handleError((error, content) => __awaiter(this, void 0, void 0, function* () {
                this.emit("error", error, content);
                this.s3db.emit("error", this.name, error, content);
            }))
                .process((attributes) => __awaiter(this, void 0, void 0, function* () {
                const result = yield this.insert(attributes);
                return result;
            }));
            return results;
        });
    }
    /**
     *
     * @returns number
     */
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            const count = yield this.client.count({
                prefix: `resource=${this.name}`,
            });
            return count;
        });
    }
    /**
     * Delete resources by a list of ids
     * @param {Object} param
     * @returns
     */
    bulkDelete(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            let packages = (0, lodash_1.chunk)(ids.map((x) => path.join(`resource=${this.name}`, `id=${x}`)), 1000);
            const { results } = yield promise_pool_1.PromisePool.for(packages)
                .withConcurrency(this.s3db.parallelism)
                .handleError((error, content) => __awaiter(this, void 0, void 0, function* () {
                this.emit("error", error, content);
                this.s3db.emit("error", this.name, error, content);
            }))
                .process((keys) => __awaiter(this, void 0, void 0, function* () {
                const response = yield this.client.deleteObjects(keys);
                keys.forEach((key) => {
                    const id = key.split("=").pop();
                    this.emit("deleted", id);
                    this.s3db.emit("deleted", this.name, id);
                });
                return response;
            }));
            return results;
        });
    }
    getAllIds() {
        return __awaiter(this, void 0, void 0, function* () {
            const keys = yield this.client.getAllKeys({
                prefix: `resource=${this.name}`,
            });
            const ids = keys.map((x) => x.replace(path.join(`resource=${this.name}`, "id="), ""));
            return ids;
        });
    }
    stream() {
        const stream = new resource_ids_read_stream_class_1.default({ resource: this });
        const transformer = new resource_ids_transformer_class_1.default({ resource: this });
        return stream.pipe(transformer);
    }
}
exports.default = Resource;