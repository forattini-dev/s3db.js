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
const node_stream_1 = require("node:stream");
class ResourceIdsToDataTransformer extends node_stream_1.Transform {
    constructor({ resource }) {
        super({ objectMode: true, highWaterMark: resource.client.parallelism });
        this.resource = resource;
    }
    _transform(chunk, encoding, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(0, lodash_1.isArray)(chunk))
                this.push(null);
            this.emit("page", this.resource.name, chunk);
            const proms = chunk.map((id) => __awaiter(this, void 0, void 0, function* () {
                this.emit("id", this.resource.name, id);
                const data = yield this.resource.getById(id);
                this.push(data);
                return data;
            }));
            yield Promise.all(proms);
            callback(null);
        });
    }
}
exports.default = ResourceIdsToDataTransformer;
