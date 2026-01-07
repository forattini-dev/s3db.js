import EventEmitter from "events";
import { Transform } from "stream";
import { ResourceIdsPageReader } from "./resource-ids-page-reader.class.js";
import { TasksPool } from '../tasks/tasks-pool.class.js';
import tryFn from "../concerns/try-fn.js";
import { StreamError } from '../errors.js';
export class ResourceReader extends EventEmitter {
    resource;
    client;
    batchSize;
    concurrency;
    input;
    transform;
    constructor({ resource, batchSize = 10, concurrency = 5 }) {
        super();
        if (!resource) {
            throw new StreamError('Resource is required for ResourceReader', {
                operation: 'constructor',
                resource: resource?.name,
                suggestion: 'Pass a valid Resource instance when creating ResourceReader'
            });
        }
        this.resource = resource;
        this.client = resource.client;
        this.batchSize = batchSize;
        this.concurrency = concurrency;
        this.input = new ResourceIdsPageReader({ resource: this.resource });
        this.transform = new Transform({
            objectMode: true,
            transform: this._transform.bind(this)
        });
        this.input.on('data', (chunk) => {
            this.transform.write(chunk);
        });
        this.input.on('end', () => {
            this.transform.end();
        });
        this.input.on('error', (error) => {
            this.emit('error', error);
        });
        this.transform.on('data', (data) => {
            this.emit('data', data);
        });
        this.transform.on('end', () => {
            this.emit('end');
        });
        this.transform.on('error', (error) => {
            this.emit('error', error);
        });
    }
    build() {
        return this;
    }
    async _transform(chunk, _encoding, callback) {
        const [, err] = await tryFn(async () => {
            await TasksPool.map(chunk, async (id) => {
                const data = await this.resource.get(id);
                this.transform.push(data);
                return data;
            }, {
                concurrency: this.concurrency,
                onItemError: (error, id) => this.emit("error", error, id)
            });
        });
        callback(err);
    }
    resume() {
        this.input.emit('resume');
    }
}
export default ResourceReader;
//# sourceMappingURL=resource-reader.class.js.map