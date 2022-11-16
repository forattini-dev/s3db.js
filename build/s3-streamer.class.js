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
exports.ReadResourceStream = void 0;
const path = __importStar(require("path"));
const node_stream_1 = require("node:stream");
const promise_pool_1 = require("@supercharge/promise-pool");
class ReadResourceStream extends node_stream_1.Readable {
    constructor({ s3db, client, resourceName, parallelism = 10, }) {
        super({
            objectMode: true,
        });
        this.s3db = s3db;
        this.client = client;
        this.resourceName = resourceName;
        this.continuationToken = null;
        this.finishedReadingBucked = false;
        this.content = [];
        this.parallelism = parallelism;
        this.loading = this.getItems();
    }
    _read(size) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.content.length === 0) {
                if (this.loading) {
                    yield this.loading;
                }
                else if (this.finishedReadingBucked) {
                    this.push(null);
                    return;
                }
            }
            const data = this.content.shift();
            this.push(data);
        });
    }
    getItems() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.client.listObjects({
                prefix: `resource=${this.resourceName}`,
                continuationToken: this.continuationToken,
                maxKeys: (this.parallelism * 4) % 1000,
            });
            if (res.Contents) {
                yield promise_pool_1.PromisePool.for(res.Contents)
                    .withConcurrency(this.parallelism)
                    .handleError((error, content) => __awaiter(this, void 0, void 0, function* () {
                    this.emit("error", error, content);
                }))
                    .process((x) => this.addItem(x));
            }
            this.finishedReadingBucked = !res.IsTruncated;
            if (res.NextContinuationToken) {
                this.continuationToken = res.NextContinuationToken;
                this.loading = this.getItems();
            }
            else {
                this.loading = null;
            }
        });
    }
    addItem(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            let id = (obj.Key || "").replace(path.join(this.client.keyPrefix, `resource=${this.resourceName}`, "id="), "");
            this.emit("id", this.resourceName, id);
            const data = yield this.s3db.getById({
                resourceName: this.resourceName,
                id,
            });
            this.content.push(data);
        });
    }
}
exports.ReadResourceStream = ReadResourceStream;
class S3Streamer {
    constructor({ s3db, client, parallelism, }) {
        this.s3db = s3db;
        this.client = client;
        this.parallelism = parallelism;
    }
    resourceRead({ resourceName }) {
        return __awaiter(this, void 0, void 0, function* () {
            const input = new ReadResourceStream({
                s3db: this.s3db,
                client: this.client,
                resourceName,
                parallelism: this.parallelism,
            });
            return input;
        });
    }
}
exports.default = S3Streamer;
