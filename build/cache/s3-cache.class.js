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
exports.S3Cache = void 0;
const zlib_1 = __importDefault(require("zlib"));
const path = __importStar(require("path"));
const lodash_1 = require("lodash");
const serializers_type_1 = __importDefault(require("./serializers.type"));
const json_serializer_1 = require("./json.serializer");
const avro_serializer_1 = require("./avro.serializer");
class S3Cache {
    constructor({ s3Client, compressData = true, serializer = serializers_type_1.default.json, }) {
        this.s3Client = s3Client;
        this.serializer = serializer;
        this.compressData = compressData;
        this.serializers = {
            [serializers_type_1.default.json]: json_serializer_1.JsonSerializer,
            [serializers_type_1.default.avro]: avro_serializer_1.AvroSerializer,
        };
    }
    getKey({ params, hashed = true, additionalPrefix = "", }) {
        let filename = Object.keys(params || {})
            .sort()
            .map((x) => `${x}:${params[x]}`)
            .join("|") || "";
        if (filename.length === 0)
            filename = `empty`;
        if (hashed) {
            filename = Buffer.from(filename)
                .toString("base64")
                .split("")
                .reverse()
                .join("");
        }
        if (additionalPrefix.length > 0) {
            filename = additionalPrefix + filename;
        }
        filename = filename + "." + this.serializer;
        if (this.compressData)
            filename += ".gz";
        return path.join("cache", filename);
    }
    _put({ key, data }) {
        return __awaiter(this, void 0, void 0, function* () {
            const lengthRaw = (0, lodash_1.isString)(data)
                ? data.length
                : JSON.stringify(data).length;
            let body = this.serialize({ data });
            const lengthSerialized = body.length;
            if (this.compressData) {
                body = zlib_1.default.gzipSync(body);
            }
            const metadata = {
                compressor: "zlib",
                "client-id": this.s3Client.id,
                serializer: String(this.serializer),
                compressed: String(this.compressData),
                "length-raw": String(lengthRaw),
                "length-serialized": String(lengthSerialized),
                "length-compressed": String(body.length),
            };
            return this.s3Client.putObject({
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
    _get({ key }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const res = yield this.s3Client.getObject({ key });
                if (!res.Body)
                    return "";
                let content = res.Body;
                if (res.Metadata) {
                    const { serializer, compressor, compressed } = res.Metadata;
                    if (["true", true].includes(compressed)) {
                        if (compressor === `zlib`) {
                            content = zlib_1.default.unzipSync(content);
                        }
                    }
                    const { data } = this.serializers[serializer].unserialize(content);
                    return data;
                }
                return this.unserialize(content);
            }
            catch (error) {
                if (error instanceof Error) {
                    if (error.name !== "ClientNoSuchKey") {
                        return Promise.reject(error);
                    }
                }
            }
            return null;
        });
    }
    _delete({ key }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.s3Client.deleteObject(key);
            }
            catch (error) {
                if (error instanceof Error) {
                    if (error.name !== "ClientNoSuchKey") {
                        return Promise.reject(error);
                    }
                }
            }
            return true;
        });
    }
    serialize(data) {
        return this.serializers[this.serializer].serialize(data);
    }
    unserialize(data) {
        return this.serializers[this.serializer].unserialize(data);
    }
}
exports.S3Cache = S3Cache;
exports.default = S3Cache;
