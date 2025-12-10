import EventEmitter from "events";
import { Writable } from 'stream';
import { PromisePool } from '@supercharge/promise-pool';
import tryFn from "../concerns/try-fn.js";
export class ResourceWriter extends EventEmitter {
    resource;
    client;
    batchSize;
    concurrency;
    buffer;
    writing;
    ended;
    writable;
    constructor({ resource, batchSize = 10, concurrency = 5 }) {
        super();
        this.resource = resource;
        this.client = resource.client;
        this.batchSize = batchSize;
        this.concurrency = concurrency;
        this.buffer = [];
        this.writing = false;
        this.ended = false;
        this.writable = new Writable({
            objectMode: true,
            write: this._write.bind(this)
        });
        this.writable.on('finish', () => {
            this.emit('finish');
        });
        this.writable.on('error', (error) => {
            this.emit('error', error);
        });
    }
    build() {
        return this;
    }
    write(chunk) {
        this.buffer.push(chunk);
        this._maybeWrite().catch(error => {
            this.emit('error', error);
        });
        return true;
    }
    end() {
        this.ended = true;
        this._maybeWrite().catch(error => {
            this.emit('error', error);
        });
    }
    async _maybeWrite() {
        if (this.writing)
            return;
        if (this.buffer.length === 0 && !this.ended)
            return;
        this.writing = true;
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.batchSize);
            const [ok, err] = await tryFn(async () => {
                await PromisePool.for(batch)
                    .withConcurrency(this.concurrency)
                    .handleError(async (error, content) => {
                    this.emit("error", error, content);
                })
                    .process(async (item) => {
                    const [insertOk, insertErr, result] = await tryFn(async () => {
                        const res = await this.resource.insert(item);
                        return res;
                    });
                    if (!insertOk) {
                        this.emit('error', insertErr, item);
                        return null;
                    }
                    return result;
                });
            });
            if (!ok) {
                this.emit('error', err);
            }
        }
        this.writing = false;
        if (this.ended) {
            this.writable.emit('finish');
        }
    }
    _write(_chunk, _encoding, callback) {
        callback();
    }
}
export default ResourceWriter;
//# sourceMappingURL=resource-writer.class.js.map