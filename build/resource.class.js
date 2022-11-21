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
const nanoid_1 = require("nanoid");
const events_1 = __importDefault(require("events"));
const lodash_1 = require("lodash");
const flat_1 = require("flat");
const promise_pool_1 = require("@supercharge/promise-pool");
const errors_1 = require("./errors");
class Resource extends events_1.default {
    /**
     * Constructor
     */
    constructor(options) {
        super();
        this.options = options;
        this.name = options.name;
        this.schema = options.schema;
        this.s3db = options.s3db;
        this.client = options.s3Client;
        this.validator = options.validatorInstance.compile(this.schema);
        const { mapObj, reversedMapObj } = this.getMappersFromSchema(this.schema);
        this.mapObj = mapObj;
        this.reversedMapObj = reversedMapObj;
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
        return {
            name: this.name,
            options: {},
            schema: this.schema,
            mapper: this.mapObj,
        };
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
        return this.check((0, flat_1.flatten)(data));
    }
    map(data) {
        return Object.entries(data).reduce((acc, [key, value]) => {
            acc[this.mapObj[key]] = value;
            return acc;
        }, {});
    }
    unmap(data) {
        return Object.entries(data).reduce((acc, [key, value]) => {
            acc[this.reversedMapObj[key]] = value;
            return acc;
        }, {});
    }
    /**
     * Inserts a new object into the resource list.
     * @param {Object} param
     * @returns
     */
    insert(attributes) {
        return __awaiter(this, void 0, void 0, function* () {
            let _a = (0, flat_1.flatten)(attributes), { id } = _a, attrs = __rest(_a, ["id"]);
            // validate
            const { isValid, errors, data: validated } = this.check(attrs);
            if (!isValid) {
                return Promise.reject(new errors_1.InvalidResource({
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
            data.id = id;
            data = (0, flat_1.unflatten)(data);
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
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            let count = 0;
            let truncated = true;
            let continuationToken;
            while (truncated) {
                const res = yield this.client.listObjects({
                    prefix: `resource=${this.name}`,
                    continuationToken,
                });
                count += res.KeyCount || 0;
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken;
            }
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
    listIds({ limit = 1000 } = {}) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let ids = [];
            let truncated = true;
            let continuationToken;
            while (truncated && ids.length < limit) {
                const res = yield this.client.listObjects({
                    prefix: `resource=${this.name}`,
                    continuationToken,
                });
                ids = ids.concat((_a = res.Contents) === null || _a === void 0 ? void 0 : _a.map((x) => x.Key));
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken;
            }
            ids = ids.map((x) => x.replace(path.join(this.s3db.keyPrefix, `resource=${this.name}`, "id="), ""));
            return ids;
        });
    }
    stream({ limit = 1000 }) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.s3db.streamer.resourceRead({ resourceName: this.name });
        });
    }
}
exports.default = Resource;
