import { ResourceReader, ResourceWriter } from "../stream/index.js";

/**
 * ResourceStreams handles streaming operations for a Resource.
 * Provides methods for creating readable and writable streams.
 */
export class ResourceStreams {
    /**
     * Create a new ResourceStreams instance
     * @param {Object} resource - Parent Resource instance
     */
    constructor(resource) {
        this.resource = resource;
    }

    /**
     * Create a readable stream for iterating over resources
     * @returns {Object} Readable stream builder
     */
    readable() {
        const stream = new ResourceReader({ resource: this.resource });
        return stream.build();
    }

    /**
     * Create a writable stream for bulk inserting resources
     * @returns {Object} Writable stream builder
     */
    writable() {
        const stream = new ResourceWriter({ resource: this.resource });
        return stream.build();
    }
}
