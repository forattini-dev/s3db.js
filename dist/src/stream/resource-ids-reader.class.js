import EventEmitter from "events";
import { ReadableStream } from "node:stream/web";
export class ResourceIdsReader extends EventEmitter {
    resource;
    client;
    stream;
    controller;
    continuationToken = null;
    closeNextIteration = false;
    constructor({ resource }) {
        super();
        this.resource = resource;
        this.client = resource.client;
        this.stream = new ReadableStream({
            start: this._start.bind(this),
            pull: this._pull.bind(this),
            cancel: this._cancel.bind(this),
        }, {
            highWaterMark: this.client.parallelism * 3
        });
    }
    build() {
        return this.stream.getReader();
    }
    async _start(controller) {
        this.controller = controller;
        this.continuationToken = null;
        this.closeNextIteration = false;
    }
    async _pull(_controller) {
        if (this.closeNextIteration) {
            this.controller.close();
            return;
        }
        const response = await this.client.listObjects({
            prefix: `resource=${this.resource.name}`,
            continuationToken: this.continuationToken,
        });
        const keys = response?.Contents
            .map((x) => x.Key)
            .map((x) => x.replace(this.client.config.keyPrefix, ""))
            .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x))
            .map((x) => x.replace(`resource=${this.resource.name}/id=`, ""));
        this.continuationToken = response.NextContinuationToken || null;
        this.enqueue(keys);
        if (!response.IsTruncated)
            this.closeNextIteration = true;
    }
    enqueue(ids) {
        ids.forEach((key) => {
            this.controller.enqueue(key);
            this.emit("id", key);
        });
    }
    _cancel(_reason) {
        // No cleanup needed
    }
}
export default ResourceIdsReader;
//# sourceMappingURL=resource-ids-reader.class.js.map