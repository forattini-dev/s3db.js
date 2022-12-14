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
exports.ResourceWriteStream = void 0;
const lodash_1 = require("lodash");
const node_stream_1 = require("node:stream");
class ResourceWriteStream extends node_stream_1.Writable {
    constructor({ resource }) {
        super({ objectMode: true, highWaterMark: resource.s3Client.parallelism * 2 });
        this.resource = resource;
        this.contents = [];
        this.running = null;
        this.receivedFinalMessage = false;
    }
    _write(chunk, encoding, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.running)
                yield this.running;
            if (!(0, lodash_1.isEmpty)(chunk)) {
                this.contents.push(chunk);
            }
            else {
                this.receivedFinalMessage = true;
            }
            this.running = this.writeOrWait();
            return callback(null);
        });
    }
    _writev(chunks, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.running)
                yield this.running;
            if (!(0, lodash_1.isEmpty)(chunks)) {
                for (const obj of chunks.map((c) => c.chunk)) {
                    this.contents.push(obj);
                }
            }
            else {
                this.receivedFinalMessage = true;
            }
            this.running = this.writeOrWait();
            return callback(null);
        });
    }
    writeOrWait() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.receivedFinalMessage) {
                const data = this.contents.splice(0, this.contents.length - 1);
                yield this.resource.bulkInsert(data);
                this.emit("end");
                return;
            }
            if (this.contents.length < this.resource.s3Client.parallelism)
                return;
            const objs = this.contents.splice(0, this.resource.s3Client.parallelism);
            objs.forEach((obj) => this.emit("id", obj.id));
            yield this.resource.bulkInsert(objs);
            objs.forEach((obj) => this.emit("data", obj));
        });
    }
    _final(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            this.receivedFinalMessage = true;
            yield this.writeOrWait();
            callback(null);
        });
    }
}
exports.ResourceWriteStream = ResourceWriteStream;
exports.default = ResourceWriteStream;
