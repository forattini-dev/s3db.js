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
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const node_stream_1 = require("node:stream");
const promise_pool_1 = require("@supercharge/promise-pool");
const lodash_1 = require("lodash");
class ResourceIdsReadStream extends node_stream_1.Readable {
    constructor({ resource }) {
        super({
            objectMode: true,
            highWaterMark: resource.client.parallelism,
        });
        this.resource = resource;
        this.pagesCount = 0;
        this.content = [];
        this.finishedReadingResource = false;
        this.loading = this.getItems();
    }
    _read(size) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.content.length === 0) {
                if (this.loading) {
                    yield this.loading;
                }
                else if (this.finishedReadingResource) {
                    this.push(null);
                    return;
                }
            }
            const data = this.content.shift();
            this.push(data);
        });
    }
    getItems({ continuationToken = null, } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            this.emit("page", this.pagesCount++);
            const res = yield this.resource.client.listObjects({
                prefix: `resource=${this.resource.name}`,
                continuationToken,
            });
            if (res.Contents) {
                const contents = (0, lodash_1.chunk)(res.Contents, this.resource.client.parallelism);
                yield promise_pool_1.PromisePool.for(contents)
                    .withConcurrency(5)
                    .handleError((error, content) => __awaiter(this, void 0, void 0, function* () {
                    this.emit("error", error, content);
                }))
                    .process((pkg) => {
                    const ids = pkg.map((obj) => {
                        return (obj.Key || "").replace(path.join(this.resource.client.keyPrefix, `resource=${this.resource.name}`, "id="), "");
                    });
                    this.content.push(ids);
                    ids.forEach((id) => this.emit("id", this.resource.name, id));
                });
            }
            this.finishedReadingResource = !res.IsTruncated;
            if (res.NextContinuationToken) {
                this.loading = this.getItems({
                    continuationToken: res.NextContinuationToken,
                });
            }
            else {
                this.loading = null;
            }
        });
    }
}
exports.default = ResourceIdsReadStream;
