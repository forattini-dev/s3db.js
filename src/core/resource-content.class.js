import tryFn from "../concerns/try-fn.js";
import { ResourceError } from "../errors.js";

/**
 * ResourceContent handles binary content operations for a Resource.
 * Provides methods for setting, getting, checking, and deleting binary content.
 */
export class ResourceContent {
    /**
     * Create a new ResourceContent instance
     * @param {Object} resource - Parent Resource instance
     */
    constructor(resource) {
        this.resource = resource;
    }

    /**
     * Get client from resource
     * @private
     */
    get client() {
        return this.resource.client;
    }

    /**
     * Set binary content for a resource
     * @param {Object} params - Content parameters
     * @param {string} params.id - Resource ID
     * @param {Buffer|string} params.buffer - Content buffer or string
     * @param {string} [params.contentType='application/octet-stream'] - Content type
     * @returns {Promise<Object>} Updated resource data
     */
    async setContent({ id, buffer, contentType = 'application/octet-stream' }) {
        const [ok, err, currentData] = await tryFn(() => this.resource.get(id));
        if (!ok || !currentData) {
            throw new ResourceError(`Resource with id '${id}' not found`, {
                resourceName: this.resource.name,
                id,
                operation: 'setContent'
            });
        }

        const updatedData = {
            ...currentData,
            _hasContent: true,
            _contentLength: buffer.length,
            _mimeType: contentType
        };

        const mappedMetadata = await this.resource.schema.mapper(updatedData);

        const [ok2, err2] = await tryFn(() => this.client.putObject({
            key: this.resource.getResourceKey(id),
            metadata: mappedMetadata,
            body: buffer,
            contentType
        }));

        if (!ok2) throw err2;

        this.resource._emitStandardized("content-set", { id, contentType, contentLength: buffer.length }, id);
        return updatedData;
    }

    /**
     * Retrieve binary content associated with a resource
     * @param {string} id - Resource ID
     * @returns {Promise<Object>} Object with buffer and contentType
     */
    async content(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));

        if (!ok) {
            if (err.name === "NoSuchKey" || err.code === "NoSuchKey" || err.Code === "NoSuchKey" || err.statusCode === 404) {
                return {
                    buffer: null,
                    contentType: null
                };
            }
            throw err;
        }

        const buffer = Buffer.from(await response.Body.transformToByteArray());
        const contentType = response.ContentType || null;

        this.resource._emitStandardized("content-fetched", { id, contentLength: buffer.length, contentType }, id);

        return {
            buffer,
            contentType
        };
    }

    /**
     * Check if binary content exists for a resource
     * @param {string} id - Resource ID
     * @returns {Promise<boolean>} True if content exists
     */
    async hasContent(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, err, response] = await tryFn(() => this.client.headObject(key));
        if (!ok) return false;
        return response.ContentLength > 0;
    }

    /**
     * Delete binary content but preserve metadata
     * @param {string} id - Resource ID
     * @returns {Promise<Object>} Response from client
     */
    async deleteContent(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, err, existingObject] = await tryFn(() => this.client.headObject(key));
        if (!ok) throw err;

        const existingMetadata = existingObject.Metadata || {};

        const [ok2, err2, response] = await tryFn(() => this.client.putObject({
            key,
            body: "",
            metadata: existingMetadata,
        }));

        if (!ok2) throw err2;

        this.resource._emitStandardized("content-deleted", id, id);
        return response;
    }
}
