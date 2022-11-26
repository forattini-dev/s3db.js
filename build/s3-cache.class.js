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
exports.CacheAvroSchema = void 0;
const avsc_1 = __importDefault(require("avsc"));
const node_zlib_1 = __importDefault(require("node:zlib"));
const path = __importStar(require("path"));
const lodash_1 = require("lodash");
const serializers_type_1 = __importDefault(require("./serializers.type"));
exports.CacheAvroSchema = avsc_1.default.Type.forSchema({
    name: "Cache",
    type: "record",
    fields: [{ name: "data", type: ["string"] }],
});
const serializers = (name) => {
    return {
        [serializers_type_1.default.json]: (data) => JSON.stringify(data),
        [serializers_type_1.default.avro]: (data) => String(exports.CacheAvroSchema.toBuffer(data)),
    }[name];
};
const unserializers = (name) => {
    return {
        [serializers_type_1.default.json]: (data) => JSON.parse(data),
        [serializers_type_1.default.avro]: (data) => exports.CacheAvroSchema.fromBuffer(Buffer.from(data)),
    }[name];
};
class S3Cache {
    constructor({ s3Client, compressData = true, serializer = serializers_type_1.default.json, }) {
        this.client = s3Client;
        this.serializer = serializer;
        this.compressData = compressData;
    }
    key({ resourceName, action = "list", params, }) {
        const keys = Object.keys(params)
            .sort()
            .map((x) => `${x}:${params[x]}`);
        keys.unshift(`action:${action}`);
        keys.unshift(`resource:${resourceName}`);
        const filename = `${keys.join("|")}.${this.serializer}${this.compressData ? ".zip" : ""}`;
        return path.join("cache", filename);
    }
    put({ resourceName, action = "list", params, data, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.key({ resourceName, action, params });
            const lengthRaw = (0, lodash_1.isString)(data)
                ? data.length
                : JSON.stringify(data).length;
            let body = this.serialize({ data });
            const lengthSerialized = body.length;
            if (this.compressData) {
                body = node_zlib_1.default.gzipSync(body);
            }
            const metadata = {
                compressor: "zlib",
                "client-id": this.client.id,
                serializer: String(this.serializer),
                compressed: String(this.compressData),
                "length-raw": String(lengthRaw),
                "length-serialized": String(lengthSerialized),
                "length-compressed": String(body.length),
            };
            return this.client.putObject({
                key,
                body,
                metadata,
                contentEncoding: this.compressData ? "gzip" : null,
                contentType: this.compressData
                    ? "application/gzip"
                    : `application/${this.serializer}`,
            });
        });
    }
    get({ resourceName, action = "list", params, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.key({ resourceName, action, params });
            const res = yield this.client.getObject({ key });
            if (!res.Body)
                return "";
            let data = res.Body;
            if (res.Metadata) {
                if (["true", true].includes(res.Metadata.compressed)) {
                    console.log({ data: data.toString() });
                    data = node_zlib_1.default.unzipSync(data.toString());
                }
            }
            return this.unserialize(data);
        });
    }
    serialize(data) {
        return serializers(this.serializer)(data);
    }
    unserialize(data) {
        return unserializers(this.serializer)(data);
    }
}
exports.default = S3Cache;
