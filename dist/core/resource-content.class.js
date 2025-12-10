import { tryFn } from '../concerns/try-fn.js';
import { ResourceError } from '../errors.js';
export class ResourceContent {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    get client() {
        return this.resource.client;
    }
    async setContent({ id, buffer, contentType = 'application/octet-stream' }) {
        const [ok, err, currentData] = await tryFn(() => this.resource.get(id));
        if (!ok || !currentData) {
            throw new ResourceError(`Resource with id '${id}' not found`, {
                resourceName: this.resource.name,
                id,
                operation: 'setContent'
            });
        }
        const bufferLength = typeof buffer === 'string' ? buffer.length : buffer.length;
        const updatedData = {
            ...currentData,
            _hasContent: true,
            _contentLength: bufferLength,
            _mimeType: contentType
        };
        const mappedMetadata = await this.resource.schema.mapper(updatedData);
        const [ok2, err2] = await tryFn(() => this.client.putObject({
            key: this.resource.getResourceKey(id),
            metadata: mappedMetadata,
            body: buffer,
            contentType
        }));
        if (!ok2)
            throw err2;
        this.resource._emitStandardized('content-set', { id, contentType, contentLength: bufferLength }, id);
        return updatedData;
    }
    async content(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));
        if (!ok) {
            const error = err;
            if (error.name === 'NoSuchKey' || error.code === 'NoSuchKey' || error.Code === 'NoSuchKey' || error.statusCode === 404) {
                return {
                    buffer: null,
                    contentType: null
                };
            }
            throw err;
        }
        const s3Response = response;
        const buffer = Buffer.from(await s3Response.Body.transformToByteArray());
        const contentType = s3Response.ContentType || null;
        this.resource._emitStandardized('content-fetched', { id, contentLength: buffer.length, contentType }, id);
        return {
            buffer,
            contentType
        };
    }
    async hasContent(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, , response] = await tryFn(() => this.client.headObject(key));
        if (!ok)
            return false;
        const s3Response = response;
        return (s3Response.ContentLength || 0) > 0;
    }
    async deleteContent(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, err, existingObject] = await tryFn(() => this.client.headObject(key));
        if (!ok)
            throw err;
        const s3Response = existingObject;
        const existingMetadata = s3Response.Metadata || {};
        const [ok2, err2] = await tryFn(() => this.client.putObject({
            key,
            body: '',
            metadata: existingMetadata,
        }));
        if (!ok2)
            throw err2;
        this.resource._emitStandardized('content-deleted', id, id);
    }
}
export default ResourceContent;
//# sourceMappingURL=resource-content.class.js.map