import tryFn from "../concerns/try-fn.js";
import { isEmpty, isObject } from "lodash-es";
import { getBehavior } from "../behaviors/index.js";
import { calculateTotalSize, calculateEffectiveLimit } from "../concerns/calculator.js";
import { mapAwsError, InvalidResourceItem, ResourceError, ValidationError } from "../errors.js";
import { streamToString } from "../stream/index.js";

/**
 * ResourcePersistence handles all CRUD operations for a Resource.
 * Provides methods for insert, get, update, patch, replace, delete, and batch operations.
 */
export class ResourcePersistence {
    /**
     * Create a new ResourcePersistence instance
     * @param {Object} resource - Parent Resource instance
     */
    constructor(resource) {
        this.resource = resource;
    }

    get client() { return this.resource.client; }
    get schema() { return this.resource.schema; }
    get validator() { return this.resource.validator; }
    get config() { return this.resource.config; }
    get name() { return this.resource.name; }
    get version() { return this.resource.version; }
    get behavior() { return this.resource.behavior; }
    get hooks() { return this.resource.hooks; }
    get logger() { return this.resource.logger; }
    get idGenerator() { return this.resource.idGenerator; }
    get versioningEnabled() { return this.resource.versioningEnabled; }
    get observers() { return this.resource.observers; }

    /**
     * Insert a new resource
     * @param {Object} params - Insert parameters
     * @param {string} [params.id] - Optional custom ID
     * @param {...Object} params - Resource attributes
     * @returns {Promise<Object>} The inserted resource object
     */
    async insert({ id, ...attributes }) {
        this.logger.trace({ id, attributeKeys: Object.keys(attributes) }, 'insert called');

        const providedId = id !== undefined && id !== null && String(id).trim() !== '';
        if (this.config.timestamps) {
            attributes.createdAt = new Date().toISOString();
            attributes.updatedAt = new Date().toISOString();
        }

        const attributesWithDefaults = this.validator.applyDefaults(attributes);
        const completeData = id !== undefined
            ? { id, ...attributesWithDefaults }
            : { ...attributesWithDefaults };

        const preProcessedData = await this.resource.executeHooks('beforeInsert', completeData);

        const extraProps = Object.keys(preProcessedData).filter(
            k => !(k in completeData) || preProcessedData[k] !== completeData[k]
        );
        const extraData = {};
        for (const k of extraProps) extraData[k] = preProcessedData[k];

        const shouldValidateId = preProcessedData.id !== undefined && preProcessedData.id !== null;
        const { errors, isValid, data: validated } = await this.resource.validate(preProcessedData, { includeId: shouldValidateId });

        if (!isValid) {
            const errorMsg = (errors && errors.length && errors[0].message) ? errors[0].message : 'Insert failed';
            throw new InvalidResourceItem({
                bucket: this.client.config.bucket,
                resourceName: this.name,
                attributes: preProcessedData,
                validation: errors,
                message: errorMsg
            });
        }

        const { id: validatedId, ...validatedAttributes } = validated;
        Object.assign(validatedAttributes, extraData);

        let finalId = validatedId || preProcessedData.id || id;
        if (!finalId) {
            finalId = await Promise.resolve(this.idGenerator());
            if (!finalId || String(finalId).trim() === '') {
                const { idGenerator } = await import('#src/concerns/id.js');
                finalId = idGenerator();
            }
        }

        const mappedData = await this.schema.mapper(validatedAttributes);
        mappedData._v = String(this.version);

        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
            resource: this.resource,
            data: validatedAttributes,
            mappedData,
            originalData: completeData
        });

        const finalMetadata = processedMetadata;

        if (!finalId || String(finalId).trim() === '') {
            throw new InvalidResourceItem({
                bucket: this.client.config.bucket,
                resourceName: this.name,
                attributes: preProcessedData,
                validation: [{ message: 'Generated ID is invalid', field: 'id' }],
                message: 'Generated ID is invalid'
            });
        }

        const shouldCheckExists = providedId || shouldValidateId || validatedId !== undefined;
        if (shouldCheckExists) {
            const alreadyExists = await this.exists(finalId);
            if (alreadyExists) {
                throw new InvalidResourceItem({
                    bucket: this.client.config.bucket,
                    resourceName: this.name,
                    attributes: preProcessedData,
                    validation: [{ message: `Resource with id '${finalId}' already exists`, field: 'id' }],
                    message: `Resource with id '${finalId}' already exists`
                });
            }
        }

        const key = this.resource.getResourceKey(finalId);
        let contentType = undefined;
        if (body && body !== "") {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okParse) contentType = 'application/json';
        }

        if (this.behavior === 'body-only' && (!body || body === "")) {
            throw new ResourceError('Body required for body-only behavior', {
                resourceName: this.name,
                operation: 'insert',
                id: finalId,
                statusCode: 400,
                retriable: false,
                suggestion: 'Include a request body when using behavior "body-only" or switch to "body-overflow".'
            });
        }

        const [okPut, errPut] = await tryFn(() => this.client.putObject({
            key,
            body,
            contentType,
            metadata: finalMetadata,
        }));

        if (!okPut) {
            const msg = errPut && errPut.message ? errPut.message : '';
            if (msg.includes('metadata headers exceed') || msg.includes('Insert failed')) {
                const totalSize = calculateTotalSize(finalMetadata);
                const effectiveLimit = calculateEffectiveLimit({
                    s3Limit: 2047,
                    systemConfig: {
                        version: this.version,
                        timestamps: this.config.timestamps,
                        id: finalId
                    }
                });
                const excess = totalSize - effectiveLimit;
                throw new ResourceError('metadata headers exceed', {
                    resourceName: this.name,
                    operation: 'insert',
                    id: finalId,
                    totalSize,
                    effectiveLimit,
                    excess,
                    suggestion: 'Reduce metadata size or number of fields.'
                });
            }
            throw errPut;
        }

        const insertedObject = await this.get(finalId);

        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                await this.resource.createPartitionReferences(insertedObject);
            } else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.createPartitionReferences(insertedObject).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'insert',
                            id: finalId,
                            error: err,
                            message: err.message
                        });
                    });
                });
            } else {
                const [ok, err] = await tryFn(() => this.resource.createPartitionReferences(insertedObject));
                if (!ok) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'insert',
                        id: finalId,
                        error: err,
                        message: err.message
                    });
                }
            }

            const nonPartitionHooks = this.hooks.afterInsert.filter(hook =>
                !hook.toString().includes('createPartitionReferences')
            );
            let finalResult = insertedObject;
            for (const hook of nonPartitionHooks) {
                finalResult = await hook(finalResult);
            }

            this.resource._emitStandardized('inserted', finalResult, finalResult?.id || insertedObject?.id);
            return finalResult;
        } else {
            const finalResult = await this.resource.executeHooks('afterInsert', insertedObject);
            this.resource._emitStandardized('inserted', finalResult, finalResult?.id || insertedObject?.id);
            return finalResult;
        }
    }

    /**
     * Retrieve a resource by ID
     * @param {string} id - Resource ID
     * @returns {Promise<Object>} The resource object
     */
    async get(id) {
        if (isObject(id)) {
            throw new ValidationError('Resource id must be a string', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass the resource id as a string value (e.g. "user-123").'
            });
        }
        if (isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a non-empty id when calling resource methods.'
            });
        }

        await this.resource.executeHooks('beforeGet', { id });

        const key = this.resource.getResourceKey(id);
        const [ok, err, request] = await tryFn(() => this.client.getObject(key));

        if (!ok) {
            throw mapAwsError(err, {
                bucket: this.client.config.bucket,
                key,
                resourceName: this.name,
                operation: 'get',
                id
            });
        }

        const objectVersionRaw = request.Metadata?._v || this.version;
        const objectVersion = typeof objectVersionRaw === 'string' && objectVersionRaw.startsWith('v') ? objectVersionRaw.slice(1) : objectVersionRaw;
        const schema = await this.resource.getSchemaForVersion(objectVersion);

        let metadata = await schema.unmapper(request.Metadata);

        const behaviorImpl = getBehavior(this.behavior);
        let body = "";

        if (request.ContentLength > 0) {
            const [okBody, , fullObject] = await tryFn(() => this.client.getObject(key));
            if (okBody) {
                body = await streamToString(fullObject.Body);
            }
        }

        const { metadata: processedMetadata } = await behaviorImpl.handleGet({
            resource: this.resource,
            metadata,
            body
        });

        let data = await this.resource.composeFullObjectFromWrite({
            id,
            metadata: processedMetadata,
            body,
            behavior: this.behavior
        });

        data._contentLength = request.ContentLength;
        data._lastModified = request.LastModified;
        data._hasContent = request.ContentLength > 0;
        data._mimeType = request.ContentType || null;
        data._etag = request.ETag;
        data._v = objectVersion;

        if (request.VersionId) data._versionId = request.VersionId;
        if (request.Expiration) data._expiresAt = request.Expiration;

        data._definitionHash = this.resource.getDefinitionHash();

        if (objectVersion !== this.version) {
            data = await this.resource.applyVersionMapping(data, objectVersion, this.version);
        }

        data = await this.resource.executeHooks('afterGet', data);

        this.resource._emitStandardized("fetched", data, data.id);
        return data;
    }

    /**
     * Retrieve a resource or return null if not found
     * @param {string} id - Resource ID
     * @returns {Promise<Object|null>} The resource or null
     */
    async getOrNull(id) {
        const [ok, err, data] = await tryFn(() => this.get(id));

        if (!ok && err && (err.name === 'NoSuchKey' || err.message?.includes('NoSuchKey'))) {
            return null;
        }

        if (!ok) throw err;
        return data;
    }

    /**
     * Retrieve a resource or throw if not found
     * @param {string} id - Resource ID
     * @returns {Promise<Object>} The resource object
     * @throws {ResourceError} If not found
     */
    async getOrThrow(id) {
        const [ok, err, data] = await tryFn(() => this.get(id));

        if (!ok && err && (err.name === 'NoSuchKey' || err.message?.includes('NoSuchKey'))) {
            throw new ResourceError(`Resource '${this.name}' with id '${id}' not found`, {
                resourceName: this.name,
                operation: 'getOrThrow',
                id,
                code: 'RESOURCE_NOT_FOUND'
            });
        }

        if (!ok) throw err;
        return data;
    }

    /**
     * Check if a resource exists
     * @param {string} id - Resource ID
     * @returns {Promise<boolean>} True if exists
     */
    async exists(id) {
        await this.resource.executeHooks('beforeExists', { id });

        const key = this.resource.getResourceKey(id);
        const [ok] = await tryFn(() => this.client.headObject(key));

        await this.resource.executeHooks('afterExists', { id, exists: ok });
        return ok;
    }

    /**
     * Delete a resource
     * @param {string} id - Resource ID
     * @returns {Promise<Object>} Delete response
     */
    async delete(id) {
        if (isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling delete().'
            });
        }

        let objectData;
        let deleteError = null;

        const [ok, err, data] = await tryFn(() => this.get(id));
        if (ok) {
            objectData = data;
        } else {
            objectData = { id };
            deleteError = err;
        }

        await this.resource.executeHooks('beforeDelete', objectData);
        const key = this.resource.getResourceKey(id);
        const [ok2, err2, response] = await tryFn(() => this.client.deleteObject(key));

        if (this.config.partitions && Object.keys(this.config.partitions).length > 0 && objectData) {
            if (this.config.strictPartitions) {
                await this.resource.deletePartitionReferences(objectData);
            } else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.deletePartitionReferences(objectData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'delete',
                            id,
                            error: err,
                            message: err.message
                        });
                    });
                });
            } else {
                const [okDel, errDel] = await tryFn(() => this.resource.deletePartitionReferences(objectData));
                if (!okDel) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'delete',
                        id,
                        error: errDel,
                        message: errDel.message
                    });
                }
            }

            const nonPartitionHooks = this.hooks.afterDelete.filter(hook =>
                !hook.toString().includes('deletePartitionReferences')
            );
            let afterDeleteData = objectData;
            for (const hook of nonPartitionHooks) {
                afterDeleteData = await hook(afterDeleteData);
            }
        } else {
            await this.resource.executeHooks('afterDelete', objectData);
        }

        this.resource._emitStandardized("deleted", {
            ...objectData,
            $before: { ...objectData },
            $after: null
        }, id);

        if (deleteError) {
            throw mapAwsError(deleteError, {
                bucket: this.client.config.bucket,
                key,
                resourceName: this.name,
                operation: 'delete',
                id
            });
        }

        if (!ok2) throw mapAwsError(err2, {
            key,
            resourceName: this.name,
            operation: 'delete',
            id
        });

        return response;
    }

    /**
     * Upsert a resource (insert or update)
     * @param {Object} params - Upsert parameters
     * @returns {Promise<Object>} The resource object
     */
    async upsert({ id, ...attributes }) {
        const exists = await this.exists(id);

        if (exists) {
            return this.update(id, attributes);
        }

        return this.insert({ id, ...attributes });
    }

    /**
     * Insert multiple resources
     * @param {Object[]} objects - Array of objects to insert
     * @returns {Promise<Object[]>} Array of inserted objects
     */
    async insertMany(objects) {
        const operations = objects.map((attributes) => async () => {
            return await this.insert(attributes);
        });

        const { results } = await this._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit("error", error, objects[index]);
                this.observers.map((x) => x.emit("error", this.name, error, objects[index]));
            }
        });

        this.resource._emitStandardized("inserted-many", objects.length);
        return results.filter(r => r !== null);
    }

    /**
     * Delete multiple resources by IDs
     * @param {string[]} ids - Array of IDs to delete
     * @returns {Promise<Object>} Results summary
     */
    async deleteMany(ids) {
        const operations = ids.map((id) => async () => {
            return await this.delete(id);
        });

        const { results, errors } = await this._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit("error", error, ids[index]);
                this.observers.map((x) => x.emit("error", this.name, error, ids[index]));
            }
        });

        this.resource._emitStandardized("deleted-many", ids.length);
        return { deleted: results.filter(r => r !== null).length, errors: errors.length };
    }

    /**
     * Update an existing resource
     * @param {string} id - Resource ID
     * @param {Object} attributes - Attributes to update
     * @returns {Promise<Object>} The updated resource object
     */
    async update(id, attributes) {
        if (isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling update().'
            });
        }

        const exists = await this.exists(id);
        if (!exists) {
            throw new ResourceError(`Resource with id '${id}' does not exist`, {
                resourceName: this.name,
                id,
                statusCode: 404,
                retriable: false,
                suggestion: 'Ensure the record exists or create it before attempting an update.'
            });
        }

        const originalData = await this.get(id);
        let mergedData = { ...originalData };

        for (const [key, value] of Object.entries(attributes)) {
            if (key.includes('.')) {
                const parts = key.split('.');
                let ref = mergedData;
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (typeof ref[part] !== 'object' || ref[part] === null) {
                        ref[part] = {};
                    } else if (i === 0) {
                        ref[part] = { ...ref[part] };
                    }
                    ref = ref[part];
                }
                const finalKey = parts[parts.length - 1];
                ref[finalKey] = (typeof value === 'object' && value !== null) ?
                    (Array.isArray(value) ? [...value] : { ...value }) : value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                mergedData[key] = { ...(mergedData[key] || {}), ...value };
            } else {
                mergedData[key] = (Array.isArray(value)) ? [...value] : value;
            }
        }

        if (this.config.timestamps) {
            const now = new Date().toISOString();
            mergedData.updatedAt = now;
            if (!mergedData.metadata) mergedData.metadata = {};
            else mergedData.metadata = { ...mergedData.metadata };
            mergedData.metadata.updatedAt = now;
        }

        const preProcessedData = await this.resource.executeHooks('beforeUpdate', mergedData);
        const completeData = { ...originalData, ...preProcessedData, id };

        const { isValid, errors, data } = await this.resource.validate(completeData, { includeId: true });
        if (!isValid) {
            throw new InvalidResourceItem({
                bucket: this.client.config.bucket,
                resourceName: this.name,
                attributes: preProcessedData,
                validation: errors,
                message: 'validation: ' + ((errors && errors.length) ? JSON.stringify(errors) : 'unknown')
            });
        }

        const earlyBehaviorImpl = getBehavior(this.behavior);
        const tempMappedData = await this.schema.mapper({ ...originalData, ...preProcessedData });
        tempMappedData._v = String(this.version);
        await earlyBehaviorImpl.handleUpdate({
            resource: this.resource,
            id,
            data: { ...originalData, ...preProcessedData },
            mappedData: tempMappedData,
            originalData: { ...attributes, id }
        });

        const { id: validatedId, ...validatedAttributes } = data;
        const oldData = { ...originalData, id };
        const newData = { ...validatedAttributes, id };
        await this.resource.handlePartitionReferenceUpdates(oldData, newData);

        const mappedData = await this.schema.mapper(validatedAttributes);
        mappedData._v = String(this.version);

        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
            resource: this.resource,
            id,
            data: validatedAttributes,
            mappedData,
            originalData: { ...attributes, id }
        });

        const finalMetadata = processedMetadata;
        const key = this.resource.getResourceKey(id);

        let existingContentType = undefined;
        let finalBody = body;
        if (body === "" && this.behavior !== 'body-overflow') {
            const [ok, , existingObject] = await tryFn(() => this.client.getObject(key));
            if (ok && existingObject.ContentLength > 0) {
                const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
                const existingBodyString = existingBodyBuffer.toString();
                const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(existingBodyString)));
                if (!okParse) {
                    finalBody = existingBodyBuffer;
                    existingContentType = existingObject.ContentType;
                }
            }
        }

        let finalContentType = existingContentType;
        if (finalBody && finalBody !== "" && !finalContentType) {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody)));
            if (okParse) finalContentType = 'application/json';
        }

        if (this.versioningEnabled && originalData._v !== this.version) {
            await this.resource.createHistoricalVersion(id, originalData);
        }

        const [ok, err] = await tryFn(() => this.client.putObject({
            key,
            body: finalBody,
            contentType: finalContentType,
            metadata: finalMetadata,
        }));

        if (!ok && err && err.message && err.message.includes('metadata headers exceed')) {
            const totalSize = calculateTotalSize(finalMetadata);
            const effectiveLimit = calculateEffectiveLimit({
                s3Limit: 2047,
                systemConfig: {
                    version: this.version,
                    timestamps: this.config.timestamps,
                    id: id
                }
            });
            const excess = totalSize - effectiveLimit;
            this.resource.emit('exceedsLimit', {
                operation: 'update',
                totalSize,
                limit: 2047,
                effectiveLimit,
                excess,
                data: validatedAttributes
            });
            throw new ResourceError('metadata headers exceed', {
                resourceName: this.name,
                operation: 'update',
                id,
                totalSize,
                effectiveLimit,
                excess,
                suggestion: 'Reduce metadata size or number of fields.'
            });
        } else if (!ok) {
            throw mapAwsError(err, {
                bucket: this.client.config.bucket,
                key,
                resourceName: this.name,
                operation: 'update',
                id
            });
        }

        const updatedData = await this.resource.composeFullObjectFromWrite({
            id,
            metadata: finalMetadata,
            body: finalBody,
            behavior: this.behavior
        });

        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                await this.resource.handlePartitionReferenceUpdates(originalData, updatedData);
            } else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates(originalData, updatedData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'update',
                            id,
                            error: err,
                            message: err.message
                        });
                    });
                });
            } else {
                const [ok2, err2] = await tryFn(() => this.resource.handlePartitionReferenceUpdates(originalData, updatedData));
                if (!ok2) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'update',
                        id,
                        error: err2,
                        message: err2.message
                    });
                }
            }

            const nonPartitionHooks = this.hooks.afterUpdate.filter(hook =>
                !hook.toString().includes('handlePartitionReferenceUpdates')
            );
            let finalResult = updatedData;
            for (const hook of nonPartitionHooks) {
                finalResult = await hook(finalResult);
            }

            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);
            return finalResult;
        } else {
            const finalResult = await this.resource.executeHooks('afterUpdate', updatedData);
            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);
            return finalResult;
        }
    }

    /**
     * Execute batch helper - uses client's _executeBatch if available
     * @private
     */
    async _executeBatchHelper(operations, options = {}) {
        if (this.client._executeBatch) {
            return await this.client._executeBatch(operations, options);
        }

        const settled = await Promise.allSettled(operations.map(op => op()));
        const results = settled.map((s, index) => {
            if (s.status === 'fulfilled') return s.value;
            if (options.onItemError) options.onItemError(s.reason, index);
            return null;
        });
        const errors = settled
            .map((s, index) => s.status === 'rejected' ? { error: s.reason, index } : null)
            .filter(Boolean);

        return { results, errors };
    }

    /**
     * Patch resource fields using optimized HEAD+COPY when possible
     * Falls back to GET+merge+PUT for body behaviors or nested fields
     * @param {string} id - Resource ID
     * @param {Object} fields - Fields to update
     * @param {Object} [options={}] - Patch options
     * @returns {Promise<Object>} Updated resource data
     */
    async patch(id, fields, options = {}) {
        if (isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling patch().'
            });
        }

        if (!fields || typeof fields !== 'object') {
            throw new ValidationError('fields must be a non-empty object', {
                field: 'fields',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass a plain object with the fields to update (e.g. { status: "active" }).'
            });
        }

        // Execute beforePatch hooks
        await this.resource.executeHooks('beforePatch', { id, fields, options });

        const behavior = this.behavior;

        // Check if fields contain dot notation (nested fields)
        const hasNestedFields = Object.keys(fields).some(key => key.includes('.'));

        let result;

        // Optimization: HEAD + COPY for metadata-only behaviors WITHOUT nested fields
        if ((behavior === 'enforce-limits' || behavior === 'truncate-data') && !hasNestedFields) {
            result = await this._patchViaCopyObject(id, fields, options);
        } else {
            // Fallback: GET + merge + PUT for body behaviors or nested fields
            result = await this.update(id, fields, options);
        }

        // Execute afterPatch hooks
        const finalResult = await this.resource.executeHooks('afterPatch', result);

        return finalResult;
    }

    /**
     * Internal helper: Optimized patch using HeadObject + CopyObject
     * Only works for metadata-only behaviors (enforce-limits, truncate-data)
     * Only for simple field updates (no nested fields with dot notation)
     * @private
     */
    async _patchViaCopyObject(id, fields, options = {}) {
        const { partition, partitionValues } = options;

        // Build S3 key
        const key = this.resource.getResourceKey(id);

        // Step 1: HEAD to get current metadata (optimization: no body transfer)
        const headResponse = await this.client.headObject(key);
        const currentMetadata = headResponse.Metadata || {};

        // Step 2: Decode metadata to user format
        let currentData = await this.schema.unmapper(currentMetadata);

        // Ensure ID is present
        if (!currentData.id) {
            currentData.id = id;
        }

        // Step 3: Merge with new fields (simple merge, no nested fields)
        // PERFORMANCE: Shallow clone (structural sharing) instead of cloneDeep for 10-50x speedup
        let mergedData = { ...currentData };

        for (const [key, value] of Object.entries(fields)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Merge objects: shallow merge instead of deep merge
                mergedData[key] = { ...(mergedData[key] || {}), ...value };
            } else {
                // Primitive or array: direct assign (shallow clone arrays)
                mergedData[key] = (Array.isArray(value)) ? [...value] : value;
            }
        }

        // Step 4: Update timestamps
        if (this.config.timestamps) {
            mergedData.updatedAt = new Date().toISOString();
        }

        // Step 5: Validate merged data (using ResourceValidator for consistency)
        const { isValid, errors } = await this.validator.validate(mergedData);
        if (!isValid) {
            throw new ValidationError('Validation failed during patch', errors);
        }

        // Step 6: Map/encode data to storage format
        const newMetadata = await this.schema.mapper(mergedData);

        // Add version metadata
        newMetadata._v = String(this.version);

        // Step 8: CopyObject with new metadata (atomic operation)
        await this.client.copyObject({
            from: key,
            to: key,
            metadataDirective: 'REPLACE',
            metadata: newMetadata
        });

        // Step 9: Update partitions if needed
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            const oldData = { ...currentData, id };
            const newData = { ...mergedData, id };

            if (this.config.strictPartitions) {
                // Strict mode: await partition operations synchronously and throw on error
                await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            } else if (this.config.asyncPartitions) {
                // Async mode: update in background
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates(oldData, newData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'patch',
                            id,
                            error: err
                        });
                    });
                });
            } else {
                // Sync mode: wait for completion
                await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            }
        }

        return mergedData;
    }

    /**
     * Replace resource (full object replacement without GET)
     * Direct PUT operation without fetching current object
     * @param {string} id - Resource ID
     * @param {Object} fullData - Complete object data (all required fields)
     * @param {Object} [options={}] - Replace options
     * @returns {Promise<Object>} Replaced resource data
     */
    async replace(id, fullData, options = {}) {
        if (isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling replace().'
            });
        }

        if (!fullData || typeof fullData !== 'object') {
            throw new ValidationError('fullData must be a non-empty object', {
                field: 'fullData',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass a plain object containing the full resource payload to replace().'
            });
        }

        // Execute beforeReplace hooks
        await this.resource.executeHooks('beforeReplace', { id, fullData, options });

        const { partition, partitionValues } = options;

        // PERFORMANCE: Shallow clone instead of cloneDeep for 10x speed
        const dataClone = { ...fullData };

        // Apply defaults before timestamps (delegated to validator)
        const attributesWithDefaults = this.validator.applyDefaults(dataClone);

        // Add timestamps
        if (this.config.timestamps) {
            // Preserve createdAt if provided, otherwise set to now
            if (!attributesWithDefaults.createdAt) {
                attributesWithDefaults.createdAt = new Date().toISOString();
            }
            attributesWithDefaults.updatedAt = new Date().toISOString();
        }

        // Ensure ID is set
        const completeData = { id, ...attributesWithDefaults };

        // Validate data
        const {
            errors,
            isValid,
            data: validated,
        } = await this.resource.validate(completeData, { includeId: true });

        if (!isValid) {
            const errorMsg = (errors && errors.length && errors[0].message) ? errors[0].message : 'Replace failed';
            throw new InvalidResourceItem({
                bucket: this.client.config.bucket,
                resourceName: this.name,
                attributes: completeData,
                validation: errors,
                message: errorMsg
            });
        }

        // Extract id and attributes from validated data
        const { id: validatedId, ...validatedAttributes } = validated;

        // Map/encode data to storage format
        const mappedMetadata = await this.schema.mapper(validatedAttributes);

        // Add version metadata
        mappedMetadata._v = String(this.version);

        // Use behavior to store data (like insert, not update)
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: finalMetadata, body } = await behaviorImpl.handleInsert({
            resource: this.resource,
            data: validatedAttributes,
            mappedData: mappedMetadata,
            originalData: completeData
        });

        // Build S3 key
        const key = this.resource.getResourceKey(id);

        // Determine content type based on body content
        let contentType = undefined;
        if (body && body !== "") {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okParse) contentType = 'application/json';
        }

        // Only throw if behavior is 'body-only' and body is empty
        if (this.behavior === 'body-only' && (!body || body === "")) {
            throw new ResourceError('Body required for body-only behavior', {
                resourceName: this.name,
                operation: 'replace',
                id,
                statusCode: 400,
                retriable: false,
                suggestion: 'Include a request body when using behavior "body-only" or switch to "body-overflow".'
            });
        }

        // Store to S3 (overwrites if exists, creates if not - true replace/upsert)
        const [okPut, errPut] = await tryFn(() => this.client.putObject({
            key,
            body,
            contentType,
            metadata: finalMetadata,
        }));

        if (!okPut) {
            const msg = errPut && errPut.message ? errPut.message : '';
            if (msg.includes('metadata headers exceed') || msg.includes('Replace failed')) {
                const totalSize = calculateTotalSize(finalMetadata);
                const effectiveLimit = calculateEffectiveLimit({
                    s3Limit: 2047,
                    systemConfig: {
                        version: this.version,
                        timestamps: this.config.timestamps,
                        id
                    }
                });
                const excess = totalSize - effectiveLimit;
                errPut.totalSize = totalSize;
                errPut.limit = 2047;
                errPut.effectiveLimit = effectiveLimit;
                errPut.excess = excess;
                throw new ResourceError('metadata headers exceed', { resourceName: this.name, operation: 'replace', id, totalSize, effectiveLimit, excess, suggestion: 'Reduce metadata size or number of fields.' });
            }
            throw errPut;
        }

        // Build the final object to return
        const replacedObject = { id, ...validatedAttributes };

        // Update partitions if needed
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                // Strict mode: await partition operations synchronously and throw on error
                await this.resource.handlePartitionReferenceUpdates({}, replacedObject);
            } else if (this.config.asyncPartitions) {
                // Async mode: update partition indexes in background
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates({}, replacedObject).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'replace',
                            id,
                            error: err
                        });
                    });
                });
            } else {
                // Sync mode: update partition indexes immediately
                await this.resource.handlePartitionReferenceUpdates({}, replacedObject);
            }
        }

        // Execute afterReplace hooks
        const finalResult = await this.resource.executeHooks('afterReplace', replacedObject);

        return finalResult;
    }

    /**
     * Update with conditional check (If-Match ETag)
     * @param {string} id - Resource ID
     * @param {Object} attributes - Attributes to update
     * @param {Object} options - Options including ifMatch (ETag)
     * @returns {Promise<Object>} { success: boolean, data?: Object, etag?: string, error?: string }
     */
    async updateConditional(id, attributes, options = {}) {
        if (isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling updateConditional().'
            });
        }

        const { ifMatch } = options;
        if (!ifMatch) {
            throw new ValidationError('updateConditional requires ifMatch option with ETag value', {
                field: 'ifMatch',
                statusCode: 428,
                retriable: false,
                suggestion: 'Pass the current object ETag in options.ifMatch to enable conditional updates.'
            });
        }

        // Check if resource exists
        const exists = await this.exists(id);
        if (!exists) {
            return {
                success: false,
                error: `Resource with id '${id}' does not exist`
            };
        }

        // Get original data
        const originalData = await this.get(id);
        // PERFORMANCE: Shallow clone (structural sharing) instead of cloneDeep for 10-50x speedup
        let mergedData = { ...originalData };

        // Merge attributes (same logic as update)
        for (const [key, value] of Object.entries(attributes)) {
            if (key.includes('.')) {
                // Dot notation: rebuild path with copy-on-write
                const parts = key.split('.');
                let ref = mergedData;

                // Clone path up to parent
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (typeof ref[part] !== 'object' || ref[part] === null) {
                        ref[part] = {};
                    } else if (i === 0) {
                        // First level: clone to avoid mutating original
                        ref[part] = { ...ref[part] };
                    }
                    ref = ref[part];
                }

                // Set final value (shallow clone if object/array)
                const finalKey = parts[parts.length - 1];
                ref[finalKey] = (typeof value === 'object' && value !== null) ?
                    (Array.isArray(value) ? [...value] : { ...value }) : value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Object merge: shallow merge instead of deep merge
                mergedData[key] = { ...(mergedData[key] || {}), ...value };
            } else {
                // Primitive or array: direct assign (shallow clone arrays)
                mergedData[key] = (Array.isArray(value)) ? [...value] : value;
            }
        }

        // Update timestamps if enabled
        if (this.config.timestamps) {
            const now = new Date().toISOString();
            mergedData.updatedAt = now;
            if (!mergedData.metadata) mergedData.metadata = {};
            else mergedData.metadata = { ...mergedData.metadata }; // Clone metadata before mutating
            mergedData.metadata.updatedAt = now;
        }

        // Execute beforeUpdate hooks
        // PERFORMANCE: Hooks can mutate data directly - no need for defensive clone
        const preProcessedData = await this.resource.executeHooks('beforeUpdate', mergedData);
        const completeData = { ...originalData, ...preProcessedData, id };

        // Validate
        const { isValid, errors, data } = await this.resource.validate(completeData, { includeId: true });
        if (!isValid) {
            return {
                success: false,
                error: 'Validation failed: ' + ((errors && errors.length) ? JSON.stringify(errors) : 'unknown'),
                validationErrors: errors
            };
        }

        // Prepare data for storage
        const { id: validatedId, ...validatedAttributes } = data;
        const mappedData = await this.schema.mapper(validatedAttributes);
        mappedData._v = String(this.version);

        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
            resource: this.resource,
            id,
            data: validatedAttributes,
            mappedData,
            originalData: { ...attributes, id }
        });

        const key = this.resource.getResourceKey(id);
        let existingContentType = undefined;
        let finalBody = body;

        if (body === "" && this.behavior !== 'body-overflow') {
            const [ok, err, existingObject] = await tryFn(() => this.client.getObject(key));
            if (ok && existingObject.ContentLength > 0) {
                const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
                const existingBodyString = existingBodyBuffer.toString();
                const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(existingBodyString)));
                if (!okParse) {
                    finalBody = existingBodyBuffer;
                    existingContentType = existingObject.ContentType;
                }
            }
        }

        let finalContentType = existingContentType;
        if (finalBody && finalBody !== "" && !finalContentType) {
            const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody)));
            if (okParse) finalContentType = 'application/json';
        }

        // Attempt conditional write with IfMatch
        const [ok, err, response] = await tryFn(() => this.client.putObject({
            key,
            body: finalBody,
            contentType: finalContentType,
            metadata: processedMetadata,
            ifMatch  // Conditional write with ETag
        }));

        if (!ok) {
            // Check if it's a PreconditionFailed error (412)
            if (err.name === 'PreconditionFailed' || err.$metadata?.httpStatusCode === 412) {
                return {
                    success: false,
                    error: 'ETag mismatch - object was modified by another process'
                };
            }

            // Other errors
            return {
                success: false,
                error: err.message || 'Update failed'
            };
        }

        // Success - compose updated data
        const updatedData = await this.resource.composeFullObjectFromWrite({
            id,
            metadata: processedMetadata,
            body: finalBody,
            behavior: this.behavior
        });

        // Handle partition updates based on strictPartitions and asyncPartitions config
        const oldData = { ...originalData, id };
        const newData = { ...validatedAttributes, id };

        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                // Strict mode: await partition operations synchronously and throw on error
                await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            } else if (this.config.asyncPartitions) {
                // Async mode
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates(oldData, newData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'updateConditional',
                            id,
                            error: err,
                            message: err.message
                        });
                    });
                });
            } else {
                // Sync mode (default): await partition operations synchronously but emit error instead of throwing
                const [ok, err] = await tryFn(() => this.resource.handlePartitionReferenceUpdates(oldData, newData));
                if (!ok) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'updateConditional',
                        id,
                        error: err,
                        message: err.message
                    });
                }
            }

            // Execute non-partition hooks
            const nonPartitionHooks = this.hooks.afterUpdate.filter(hook =>
                !hook.toString().includes('handlePartitionReferenceUpdates')
            );
            let finalResult = updatedData;
            for (const hook of nonPartitionHooks) {
                finalResult = await hook(finalResult);
            }

            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);

            return {
                success: true,
                data: finalResult,
                etag: response.ETag
            };
        } else {
            // Sync mode
            await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            const finalResult = await this.resource.executeHooks('afterUpdate', updatedData);

            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);

            return {
                success: true,
                data: finalResult,
                etag: response.ETag
            };
        }
    }

    /**
     * Delete all data for this resource (current version only)
     * Requires paranoid: false configuration
     * @returns {Promise<Object>} Deletion report with deletedCount
     */
    async deleteAll() {
        // Security check: only allow if paranoid mode is disabled
        if (this.config.paranoid !== false) {
            throw new ResourceError('deleteAll() is a dangerous operation and requires paranoid: false option.', {
                resourceName: this.name,
                operation: 'deleteAll',
                paranoid: this.config.paranoid,
                suggestion: 'Set paranoid: false to allow deleteAll.'
            });
        }

        // Use deleteAll to efficiently delete all objects (new format)
        const prefix = `resource=${this.name}/data`;
        const deletedCount = await this.client.deleteAll({ prefix });

        this.resource._emitStandardized("deleted-all", {
            version: this.version,
            prefix,
            deletedCount
        });

        return { deletedCount, version: this.version };
    }

    /**
     * Delete all data for this resource across ALL versions
     * Requires paranoid: false configuration
     * @returns {Promise<Object>} Deletion report with deletedCount
     */
    async deleteAllData() {
        // Security check: only allow if paranoid mode is disabled
        if (this.config.paranoid !== false) {
            throw new ResourceError('deleteAllData() is a dangerous operation and requires paranoid: false option.', {
                resourceName: this.name,
                operation: 'deleteAllData',
                paranoid: this.config.paranoid,
                suggestion: 'Set paranoid: false to allow deleteAllData.'
            });
        }

        // Use deleteAll to efficiently delete everything for this resource
        const prefix = `resource=${this.name}`;
        const deletedCount = await this.client.deleteAll({ prefix });

        this.resource._emitStandardized("deleted-all-data", {
            resource: this.name,
            prefix,
            deletedCount
        });

        return { deletedCount, resource: this.name };
    }
}
