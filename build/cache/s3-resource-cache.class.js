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
exports.S3ResourceCache = void 0;
const s3_cache_class_1 = __importDefault(require("./s3-cache.class"));
const serializers_type_1 = __importDefault(require("./serializers.type"));
class S3ResourceCache extends s3_cache_class_1.default {
    constructor({ resource, compressData = true, serializer = serializers_type_1.default.json, }) {
        super({
            s3Client: resource.s3Client,
            compressData: compressData,
            serializer: serializer,
        });
        this.resource = resource;
    }
    getKey({ action = "list", params }) {
        return super.getKey({
            params,
            additionalPrefix: `resource=${this.resource.name}/action=${action}|`,
        });
    }
    put({ action = "list", params, data, }) {
        const _super = Object.create(null, {
            _put: { get: () => super._put }
        });
        return __awaiter(this, void 0, void 0, function* () {
            return _super._put.call(this, {
                data,
                key: this.getKey({ action, params }),
            });
        });
    }
    get({ action = "list", params }) {
        const _super = Object.create(null, {
            _get: { get: () => super._get }
        });
        return __awaiter(this, void 0, void 0, function* () {
            return _super._get.call(this, {
                key: this.getKey({ action, params }),
            });
        });
    }
    delete({ action = "list", params }) {
        const _super = Object.create(null, {
            _delete: { get: () => super._delete }
        });
        return __awaiter(this, void 0, void 0, function* () {
            const key = this.getKey({ action, params });
            return _super._delete.call(this, {
                key: this.getKey({ action, params }),
            });
        });
    }
    purge() {
        return __awaiter(this, void 0, void 0, function* () {
            const keys = yield this.s3Client.getAllKeys({
                prefix: `cache/resource=${this.resource.name}`,
            });
            yield this.s3Client.deleteObjects(keys);
        });
    }
}
exports.S3ResourceCache = S3ResourceCache;
exports.default = S3ResourceCache;
