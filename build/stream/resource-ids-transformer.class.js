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
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const promise_pool_1 = require("@supercharge/promise-pool");
const node_stream_1 = require("node:stream");
class ResourceIdsToDataTransformer extends node_stream_1.Transform {
    constructor({ resource }) {
        super({ objectMode: true, highWaterMark: resource.s3Client.parallelism * 2 });
        this.resource = resource;
    }
    _transform(chunk, encoding, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(0, lodash_1.isArray)(chunk))
                this.push(null);
            this.emit("page", chunk);
            yield promise_pool_1.PromisePool.for(chunk)
                .withConcurrency(this.resource.s3Client.parallelism)
                .handleError((error, content) => __awaiter(this, void 0, void 0, function* () {
                this.emit("error", error, content);
            }))
                .process((id) => __awaiter(this, void 0, void 0, function* () {
                this.emit("id", id);
                const data = yield this.resource.getById(id);
                this.push(data);
                return data;
            }));
            callback(null);
        });
    }
}
exports.default = ResourceIdsToDataTransformer;
