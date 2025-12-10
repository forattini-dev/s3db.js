import { ResourceReader, ResourceWriter } from '../stream/index.js';
export class ResourceStreams {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    readable() {
        const stream = new ResourceReader({ resource: this.resource });
        return stream.build();
    }
    writable() {
        const stream = new ResourceWriter({ resource: this.resource });
        return stream.build();
    }
}
export default ResourceStreams;
//# sourceMappingURL=resource-streams.class.js.map