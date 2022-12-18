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
exports.S3Resource = void 0;
const path = __importStar(require("path"));
const nanoid_1 = require("nanoid");
const crypto_js_1 = __importDefault(require("crypto-js"));
const events_1 = __importDefault(require("events"));
const flat_1 = require("flat");
const lodash_1 = require("lodash");
const promise_pool_1 = require("@supercharge/promise-pool");
const errors_1 = require("./errors");
const s3_resource_cache_class_1 = require("./cache/s3-resource-cache.class");
const resource_write_stream_class_1 = require("./stream/resource-write-stream.class");
const resource_ids_read_stream_class_1 = require("./stream/resource-ids-read-stream.class");
const resource_ids_transformer_class_1 = require("./stream/resource-ids-transformer.class");
class S3Resource extends events_1.default {
    /**
     * Constructor
     */
    constructor(params) {
        super();
        this.s3db = params.s3db;
        this.name = params.name;
        this.schema = params.schema;
        this.options = params.options;
        this.s3Client = params.s3Client;
        this.validator = params.validatorInstance.compile(this.schema);
        const { mapObj, reversedMapObj } = this.getMappersFromSchema(this.schema);
        this.mapObj = mapObj;
        this.reversedMapObj = reversedMapObj;
        this.studyOptions();
        if (this.options.cache === true) {
            this.s3Cache = new s3_resource_cache_class_1.S3ResourceCache({
                resource: this,
                compressData: true,
                serializer: "json",
            });
        }
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
            schema: Object.assign({}, this.schema),
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
            this.options.beforeMap = {};
        if (!this.options.afterUnmap)
            this.options.afterUnmap = {};
        const schema = (0, flat_1.flatten)(this.schema, { safe: true });
        const addRule = (arr, attribute, action) => {
            if (!this.options[arr][attribute])
                this.options[arr][attribute] = [];
            this.options[arr][attribute] = [
                ...new Set([...this.options[arr][attribute], action]),
            ];
        };
        for (const [name, definition] of Object.entries(schema)) {
            if (definition.includes("secret")) {
                if (this.options.autoDecrypt === true) {
                    addRule("afterUnmap", name, "decrypt");
                }
            }
            if (definition.includes("array")) {
                addRule("beforeMap", name, "fromArray");
                addRule("afterUnmap", name, "toArray");
            }
            if (definition.includes("number")) {
                addRule("beforeMap", name, "toString");
                addRule("afterUnmap", name, "toNumber");
            }
            if (definition.includes("boolean")) {
                addRule("beforeMap", name, "toJson");
                addRule("afterUnmap", name, "fromJson");
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
        for (const [attribute, actions] of Object.entries(this.options.beforeMap)) {
            for (const action of actions) {
                if (action === "fromArray") {
                    obj[attribute] = (obj[attribute] || []).join("|");
                }
                else if (action === "toString") {
                    obj[attribute] = String(obj[attribute]);
                }
                else if (action === "toJson") {
                    obj[attribute] = JSON.stringify(obj[attribute]);
                }
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
        for (const [attribute, actions] of Object.entries(this.options.afterUnmap)) {
            for (const action of actions) {
                if (action === "decrypt") {
                    let content = obj[attribute];
                    content = crypto_js_1.default.AES.decrypt(content, this.s3db.passphrase);
                    content = content.toString(crypto_js_1.default.enc.Utf8);
                    obj[attribute] = content;
                }
                else if (action === "toArray") {
                    obj[attribute] = (obj[attribute] || "").split("|");
                }
                else if (action === "toNumber") {
                    obj[attribute] = Number(obj[attribute] || "");
                }
                else if (action === "fromJson") {
                    obj[attribute] = JSON.parse(obj[attribute]);
                }
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
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let _b = (0, flat_1.flatten)(attributes, {
                safe: true,
            }), { id } = _b, attrs = __rest(_b, ["id"]);
            // validate
            let { isValid, errors, data: validated } = this.check(attrs);
            if (!isValid) {
                return Promise.reject(new errors_1.S3dbInvalidResource({
                    bucket: this.s3Client.bucket,
                    resourceName: this.name,
                    attributes,
                    validation: errors,
                }));
            }
            if (!id && id !== 0)
                id = (0, nanoid_1.nanoid)();
            validated = this.map(validated);
            // save
            yield this.s3Client.putObject({
                key: path.join(`resource=${this.name}`, `id=${id}`),
                body: "",
                metadata: validated,
            });
            const final = Object.assign({ id }, (0, flat_1.unflatten)(this.unmap(validated)));
            if (this.s3Cache) {
                yield ((_a = this.s3Cache) === null || _a === void 0 ? void 0 : _a.purge());
            }
            this.emit("insert", final);
            return final;
        });
    }
    /**
     * Get a resource by id
     * @param {Object} param
     * @returns
     */
    get(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = yield this.s3Client.headObject(path.join(`resource=${this.name}`, `id=${id}`));
            let data = this.unmap(request.Metadata);
            data = (0, flat_1.unflatten)(data);
            data.id = id;
            data._length = request.ContentLength;
            data._createdAt = request.LastModified;
            if (request.Expiration)
                data._expiresAt = request.Expiration;
            this.emit("get", data);
            return data;
        });
    }
    /**
     * Update a resource by id
     * @param {Object} param
     * @returns
     */
    update(id, attributes) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const obj = yield this.get(id);
            let attrs1 = (0, flat_1.flatten)(attributes, { safe: true });
            let attrs2 = (0, flat_1.flatten)(obj, { safe: true });
            const attrs = (0, lodash_1.merge)(attrs2, attrs1);
            delete attrs.id;
            const { isValid, errors, data: validated } = this.check(attrs);
            if (!isValid) {
                return Promise.reject(new errors_1.S3dbInvalidResource({
                    bucket: this.s3Client.bucket,
                    resourceName: this.name,
                    attributes,
                    validation: errors,
                }));
            }
            if (!id && id !== 0)
                id = (0, nanoid_1.nanoid)();
            // save
            yield this.s3Client.putObject({
                key: path.join(`resource=${this.name}`, `id=${id}`),
                body: "",
                metadata: this.map(validated),
            });
            const final = Object.assign({ id }, (0, flat_1.unflatten)(validated));
            if (this.s3Cache)
                yield ((_a = this.s3Cache) === null || _a === void 0 ? void 0 : _a.purge());
            this.emit("update", attributes, final);
            return final;
        });
    }
    /**
     * Delete a resource by id
     * @param {Object} param
     * @returns
     */
    delete(id) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const key = path.join(`resource=${this.name}`, `id=${id}`);
            const response = yield this.s3Client.deleteObject(key);
            if (this.s3Cache)
                yield ((_a = this.s3Cache) === null || _a === void 0 ? void 0 : _a.purge());
            this.emit("delete", id);
            return response;
        });
    }
    /**
     *
     * @returns number
     */
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.s3Cache) {
                const cached = yield this.s3Cache.get({ action: "count" });
                if (cached)
                    return cached;
            }
            const count = yield this.s3Client.count({
                prefix: `resource=${this.name}`,
            });
            if (this.s3Cache)
                yield this.s3Cache.put({ action: "count", data: count });
            this.emit("count", count);
            return count;
        });
    }
    /**
     *
     */
    insertMany(objects) {
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
            this.emit("insertMany", objects.length);
            return results;
        });
    }
    /**
     * Delete resources by a list of ids
     * @param {Object} param
     * @returns
     */
    deleteMany(ids) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let packages = (0, lodash_1.chunk)(ids.map((x) => path.join(`resource=${this.name}`, `id=${x}`)), 1000);
            const { results } = yield promise_pool_1.PromisePool.for(packages)
                .withConcurrency(this.s3db.parallelism)
                .handleError((error, content) => __awaiter(this, void 0, void 0, function* () {
                this.emit("error", error, content);
                this.s3db.emit("error", this.name, error, content);
            }))
                .process((keys) => __awaiter(this, void 0, void 0, function* () {
                const response = yield this.s3Client.deleteObjects(keys);
                keys.forEach((key) => {
                    const id = key.split("=").pop();
                    this.emit("deleted", id);
                    this.s3db.emit("deleted", this.name, id);
                });
                return response;
            }));
            if (this.s3Cache)
                yield ((_a = this.s3Cache) === null || _a === void 0 ? void 0 : _a.purge());
            this.emit("insertMany", ids.length);
            return results;
        });
    }
    deleteAll() {
        return __awaiter(this, void 0, void 0, function* () {
            const ids = yield this.listIds();
            this.emit("deleteAll", ids.length);
            yield this.deleteMany(ids);
        });
    }
    listIds() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.s3Cache) {
                const cached = yield this.s3Cache.get({ action: "listIds" });
                if (cached)
                    return cached;
            }
            const keys = yield this.s3Client.getAllKeys({
                prefix: `resource=${this.name}`,
            });
            const ids = keys.map((x) => x.replace(`resource=${this.name}/id=`, ""));
            if (this.s3Cache) {
                yield this.s3Cache.put({ action: "listIds", data: ids });
                const x = yield this.s3Cache.get({ action: "listIds" });
            }
            this.emit("listIds", ids.length);
            return ids;
        });
    }
    getMany(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.s3Cache) {
                const cached = yield this.s3Cache.get({
                    action: "getMany",
                    params: { ids: ids.sort() },
                });
                if (cached)
                    return cached;
            }
            const { results } = yield promise_pool_1.PromisePool.for(ids)
                .withConcurrency(this.s3Client.parallelism)
                .process((id) => __awaiter(this, void 0, void 0, function* () {
                this.emit("id", id);
                const data = yield this.get(id);
                this.emit("data", data);
                return data;
            }));
            if (this.s3Cache)
                yield this.s3Cache.put({
                    action: "getMany",
                    params: { ids: ids.sort() },
                    data: results,
                });
            this.emit("getMany", ids.length);
            return results;
        });
    }
    getAll() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.s3Cache) {
                const cached = yield this.s3Cache.get({ action: "getAll" });
                if (cached)
                    return cached;
            }
            let ids = [];
            let gotFromCache = false;
            if (this.s3Cache) {
                const cached = yield this.s3Cache.get({ action: "listIds" });
                if (cached) {
                    ids = cached;
                    gotFromCache = true;
                }
            }
            if (!gotFromCache)
                ids = yield this.listIds();
            if (ids.length === 0)
                return [];
            const { results } = yield promise_pool_1.PromisePool.for(ids)
                .withConcurrency(this.s3Client.parallelism)
                .process((id) => __awaiter(this, void 0, void 0, function* () {
                const data = yield this.get(id);
                return data;
            }));
            if (this.s3Cache && results.length > 0) {
                yield this.s3Cache.put({ action: "getAll", data: results });
            }
            this.emit("getAll", results.length);
            return results;
        });
    }
    page({ offset = 0, size = 100 }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.s3Cache) {
                const cached = yield this.s3Cache.get({
                    action: "page",
                    params: { offset, size },
                });
                if (cached)
                    return cached;
            }
            const keys = yield this.s3Client.getKeysPage({
                amount: size,
                offset: offset,
                prefix: `resource=${this.name}`,
            });
            const ids = keys.map((x) => x.replace(`resource=${this.name}/id=`, ""));
            const data = yield this.getMany(ids);
            if (this.s3Cache)
                yield this.s3Cache.put({
                    action: "page",
                    params: { offset, size },
                    data,
                });
            return data;
        });
    }
    readable() {
        const stream = new resource_ids_read_stream_class_1.ResourceIdsReadStream({ resource: this });
        const transformer = new resource_ids_transformer_class_1.ResourceIdsToDataTransformer({ resource: this });
        return stream.pipe(transformer);
    }
    writable() {
        const stream = new resource_write_stream_class_1.ResourceWriteStream({ resource: this });
        return stream;
    }
}
exports.S3Resource = S3Resource;
exports.default = S3Resource;
