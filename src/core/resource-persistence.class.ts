import { tryFn } from '../concerns/try-fn.js';
import { isEmpty, isObject } from 'lodash-es';
import { getBehavior } from '../behaviors/index.js';
import { isNotFoundError } from '../concerns/s3-errors.js';
import { sanitizeDeep } from '../concerns/safe-merge.js';
import { calculateTotalSize, calculateEffectiveLimit } from '../concerns/calculator.js';
import { mapAwsError, InvalidResourceItem, ResourceError, ValidationError } from '../errors.js';
import { streamToString } from '../stream/index.js';
import type { StringRecord, JSONValue } from '../types/common.types.js';

export interface ResourceData extends StringRecord {
  id?: string;
  _contentLength?: number;
  _lastModified?: Date;
  _hasContent?: boolean;
  _mimeType?: string | null;
  _etag?: string;
  _v?: string | number;
  _versionId?: string;
  _expiresAt?: string;
  _definitionHash?: string;
  $before?: ResourceData;
  $after?: ResourceData | null;
}

export interface InsertParams extends StringRecord {
  id?: string;
}

export interface ValidationResult {
  errors?: Array<{ message?: string; field?: string }>;
  isValid: boolean;
  data: ResourceData;
}

export interface BehaviorResult {
  mappedData: StringRecord<string>;
  body: string;
}

export interface BehaviorHandleParams {
  resource: Resource;
  data?: StringRecord;
  mappedData?: StringRecord<string>;
  originalData?: StringRecord;
  metadata?: StringRecord;
  body?: string;
  id?: string;
}

export interface Behavior {
  handleInsert(params: BehaviorHandleParams): Promise<BehaviorResult>;
  handleUpdate(params: BehaviorHandleParams): Promise<BehaviorResult>;
  handleGet(params: BehaviorHandleParams): Promise<{ metadata: StringRecord<string> }>;
}

export interface S3ClientConfig {
  bucket: string;
}

export interface S3Response {
  Metadata?: StringRecord<string>;
  ContentLength?: number;
  ContentType?: string;
  LastModified?: Date;
  ETag?: string;
  VersionId?: string;
  Expiration?: string;
  Body?: {
    transformToByteArray(): Promise<Uint8Array>;
  };
}

export interface PutObjectParams {
  key: string;
  body?: string | Buffer;
  contentType?: string;
  metadata: StringRecord<string>;
  ifMatch?: string;
}

export interface CopyObjectParams {
  from: string;
  to: string;
  metadataDirective: 'REPLACE' | 'COPY';
  metadata: StringRecord<string>;
}

export interface S3Client {
  config: S3ClientConfig;
  putObject(params: PutObjectParams): Promise<{ ETag?: string }>;
  getObject(key: string): Promise<S3Response>;
  headObject(key: string): Promise<S3Response>;
  deleteObject(key: string): Promise<unknown>;
  copyObject(params: CopyObjectParams): Promise<unknown>;
  deleteAll(params: { prefix: string }): Promise<number>;
  _executeBatch?<T>(
    operations: Array<() => Promise<T>>,
    options?: BatchOptions
  ): Promise<BatchResult<T>>;
}

export interface Schema {
  mapper(data: StringRecord): Promise<StringRecord<string>>;
  unmapper(metadata: StringRecord<string>): Promise<StringRecord>;
}

export interface ResourceValidator {
  applyDefaults(data: StringRecord): StringRecord;
  validate(data: StringRecord): Promise<ValidationResult>;
}

export interface ResourceConfig {
  timestamps?: boolean;
  partitions?: StringRecord;
  strictPartitions?: boolean;
  asyncPartitions?: boolean;
  paranoid?: boolean;
}

export interface HooksCollection {
  afterInsert: Array<(data: ResourceData) => Promise<ResourceData>>;
  afterDelete: Array<(data: ResourceData) => Promise<ResourceData>>;
  afterUpdate: Array<(data: ResourceData) => Promise<ResourceData>>;
}

export interface Logger {
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface Observer {
  emit(event: string, ...args: unknown[]): void;
}

export interface Resource {
  client: S3Client;
  schema: Schema;
  validator: ResourceValidator;
  config: ResourceConfig;
  name: string;
  version: string | number;
  behavior: string;
  hooks: HooksCollection;
  logger: Logger;
  idGenerator: (data?: unknown) => string | Promise<string>;
  versioningEnabled: boolean;
  observers: Observer[];

  executeHooks(hookName: string, data: unknown): Promise<unknown>;
  validate(data: StringRecord, options?: { includeId?: boolean }): Promise<ValidationResult>;
  getResourceKey(id: string): string;
  getSchemaForVersion(version: string | number): Promise<Schema>;
  composeFullObjectFromWrite(params: {
    id: string;
    metadata: StringRecord<string>;
    body: string | Buffer;
    behavior: string;
  }): Promise<ResourceData>;
  createPartitionReferences(data: ResourceData): Promise<void>;
  deletePartitionReferences(data: ResourceData): Promise<void>;
  handlePartitionReferenceUpdates(oldData: ResourceData, newData: ResourceData): Promise<void>;
  applyVersionMapping(data: ResourceData, fromVersion: string | number, toVersion: string | number): Promise<ResourceData>;
  createHistoricalVersion(id: string, data: ResourceData): Promise<void>;
  getDefinitionHash(): string;
  emit(event: string, ...args: unknown[]): void;
  _emitStandardized(event: string, data: unknown, id?: string): void;
}

export interface PatchOptions {
  partition?: string;
  partitionValues?: StringRecord;
}

export interface ReplaceOptions {
  partition?: string;
  partitionValues?: StringRecord;
}

export interface UpdateConditionalOptions {
  ifMatch: string;
}

export interface UpdateConditionalResult {
  success: boolean;
  data?: ResourceData;
  etag?: string;
  error?: string;
  validationErrors?: Array<{ message?: string; field?: string }>;
}

export interface BatchOptions {
  onItemError?: (error: Error, index: number) => void;
}

export interface BatchResult<T> {
  results: Array<T | null>;
  errors: Array<{ error: Error; index: number }>;
}

export interface DeleteManyResult {
  deleted: number;
  errors: number;
}

export interface DeleteAllResult {
  deletedCount: number;
  version?: string | number;
  resource?: string;
}

export class ResourcePersistence {
  resource: Resource;

  constructor(resource: Resource) {
    this.resource = resource;
  }

  get client(): S3Client { return this.resource.client; }
  get schema(): Schema { return this.resource.schema; }
  get validator(): ResourceValidator { return this.resource.validator; }
  get config(): ResourceConfig { return this.resource.config; }
  get name(): string { return this.resource.name; }
  get version(): string | number { return this.resource.version; }
  get behavior(): string { return this.resource.behavior; }
  get hooks(): HooksCollection { return this.resource.hooks; }
  get logger(): Logger { return this.resource.logger; }
  get idGenerator(): (data?: unknown) => string | Promise<string> { return this.resource.idGenerator; }
  get versioningEnabled(): boolean { return this.resource.versioningEnabled; }
  get observers(): Observer[] { return this.resource.observers; }

  async insert({ id, ...attributes }: InsertParams): Promise<ResourceData> {
    this.logger.trace({ id, attributeKeys: Object.keys(attributes) }, 'insert called');

    const providedId = id !== undefined && id !== null && String(id).trim() !== '';
    if (this.config.timestamps) {
      attributes.createdAt = new Date().toISOString();
      attributes.updatedAt = new Date().toISOString();
    }

    const attributesWithDefaults = this.validator.applyDefaults(attributes);
    const completeData: ResourceData = sanitizeDeep(id !== undefined
      ? { id, ...attributesWithDefaults }
      : { ...attributesWithDefaults }) as ResourceData;

    const preProcessedData = sanitizeDeep(await this.resource.executeHooks('beforeInsert', completeData)) as ResourceData;

    const extraProps = Object.keys(preProcessedData).filter(
      k => !(k in completeData) || preProcessedData[k] !== completeData[k]
    );
    const extraData: StringRecord = {};
    for (const k of extraProps) extraData[k] = preProcessedData[k];

    const shouldValidateId = preProcessedData.id !== undefined && preProcessedData.id !== null;
    const { errors, isValid, data: validated } = await this.resource.validate(preProcessedData, { includeId: shouldValidateId });

    if (!isValid) {
      const errorMsg = (errors && errors.length && errors[0]?.message) ? errors[0].message : 'Insert failed';
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
      const shouldUseData = this.resource.idGeneratorType === 'custom';
      const generatedId = shouldUseData ? this.idGenerator(preProcessedData) : this.idGenerator();
      finalId = await Promise.resolve(generatedId);
      if (!finalId || String(finalId).trim() === '') {
        const { idGenerator } = await import('#src/concerns/id.js');
        finalId = idGenerator();
      }
    }

    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);

    const behaviorImpl = getBehavior(this.behavior) as Behavior as Behavior;
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
    let contentType: string | undefined = undefined;
    if (body && body !== '') {
      const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = 'application/json';
    }

    if (this.behavior === 'body-only' && (!body || body === '')) {
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
            version: String(this.version),
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
              message: (err as Error).message
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
            message: (err as Error).message
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
      const finalResult = await this.resource.executeHooks('afterInsert', insertedObject) as ResourceData;
      this.resource._emitStandardized('inserted', finalResult, finalResult?.id || insertedObject?.id);
      return finalResult;
    }
  }

  async get(id: string): Promise<ResourceData> {
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
    const [ok, err, request] = await tryFn<S3Response>(() => this.client.getObject(key));

    if (!ok || !request) {
      throw mapAwsError(err as Error, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: 'get',
        id
      });
    }

    const objectVersionRaw = request.Metadata?._v || this.version;
    const objectVersion = typeof objectVersionRaw === 'string' && objectVersionRaw.startsWith('v')
      ? objectVersionRaw.slice(1)
      : objectVersionRaw;
    const schema = await this.resource.getSchemaForVersion(objectVersion);

    let metadata = await schema.unmapper(request.Metadata || {});

    const behaviorImpl = getBehavior(this.behavior) as Behavior;
    let body = '';

    if (request.ContentLength && request.ContentLength > 0) {
      const [okBody, , fullObject] = await tryFn<S3Response>(() => this.client.getObject(key));
      if (okBody && fullObject?.Body) {
        const bodyBytes = await fullObject.Body.transformToByteArray();
        body = Buffer.from(bodyBytes).toString('utf-8');
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
    data._hasContent = (request.ContentLength || 0) > 0;
    data._mimeType = request.ContentType || null;
    data._etag = request.ETag;
    data._v = objectVersion;

    if (request.VersionId) data._versionId = request.VersionId;
    if (request.Expiration) data._expiresAt = request.Expiration;

    data._definitionHash = this.resource.getDefinitionHash();

    if (objectVersion !== this.version) {
      data = await this.resource.applyVersionMapping(data, objectVersion, this.version);
    }

    data = await this.resource.executeHooks('afterGet', data) as ResourceData;

    this.resource._emitStandardized('fetched', data, data.id);
    return data;
  }

  async getOrNull(id: string): Promise<ResourceData | null> {
    const [ok, err, data] = await tryFn<ResourceData>(() => this.get(id));

    if (!ok && err && isNotFoundError(err)) {
      return null;
    }

    if (!ok || !data) throw err;
    return data;
  }

  async getOrThrow(id: string): Promise<ResourceData> {
    const [ok, err, data] = await tryFn<ResourceData>(() => this.get(id));

    if (!ok && err && isNotFoundError(err)) {
      throw new ResourceError(`Resource '${this.name}' with id '${id}' not found`, {
        resourceName: this.name,
        operation: 'getOrThrow',
        id,
        code: 'RESOURCE_NOT_FOUND'
      });
    }

    if (!ok || !data) throw err;
    return data;
  }

  async exists(id: string): Promise<boolean> {
    await this.resource.executeHooks('beforeExists', { id });

    const key = this.resource.getResourceKey(id);
    const [ok, err] = await tryFn(() => this.client.headObject(key));

    if (!ok && err) {
      if (!isNotFoundError(err)) {
        throw err;
      }
    }

    await this.resource.executeHooks('afterExists', { id, exists: ok });
    return ok;
  }

  async delete(id: string): Promise<unknown> {
    if (isEmpty(id)) {
      throw new ValidationError('Resource id cannot be empty', {
        field: 'id',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide the target id when calling delete().'
      });
    }

    let objectData: ResourceData;
    let deleteError: Error | null = null;

    const [ok, err, data] = await tryFn<ResourceData>(() => this.get(id));
    if (ok && data) {
      objectData = data;
    } else {
      objectData = { id };
      deleteError = err as Error;
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
              message: (err as Error).message
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
            message: (errDel as Error).message
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

    this.resource._emitStandardized('deleted', {
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

    if (!ok2) throw mapAwsError(err2 as Error, {
      key,
      resourceName: this.name,
      operation: 'delete',
      id
    });

    return response;
  }

  async upsert({ id, ...attributes }: InsertParams): Promise<ResourceData> {
    if (!id) {
      throw new ValidationError('Resource id is required for upsert', {
        field: 'id',
        statusCode: 400,
        retriable: false,
        suggestion: 'Provide an id when calling upsert().'
      });
    }
    const exists = await this.exists(id);

    if (exists) {
      return this.update(id, attributes);
    }

    return this.insert({ id, ...attributes });
  }

  async insertMany(objects: InsertParams[]): Promise<ResourceData[]> {
    const operations = objects.map((attributes) => async () => {
      return await this.insert(attributes);
    });

    const { results } = await this._executeBatchHelper(operations, {
      onItemError: (error, index) => {
        this.resource.emit('error', error, objects[index]);
        this.observers.map((x) => x.emit('error', this.name, error, objects[index]));
      }
    });

    this.resource._emitStandardized('inserted-many', objects.length);
    return results.filter((r): r is ResourceData => r !== null);
  }

  async deleteMany(ids: string[]): Promise<DeleteManyResult> {
    const operations = ids.map((id) => async () => {
      return await this.delete(id);
    });

    const { results, errors } = await this._executeBatchHelper(operations, {
      onItemError: (error, index) => {
        this.resource.emit('error', error, ids[index]);
        this.observers.map((x) => x.emit('error', this.name, error, ids[index]));
      }
    });

    this.resource._emitStandardized('deleted-many', ids.length);
    return { deleted: results.filter(r => r !== null).length, errors: errors.length };
  }

  async update(id: string, attributes: StringRecord): Promise<ResourceData> {
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
    let mergedData: ResourceData = { ...originalData };

    for (const [key, value] of Object.entries(attributes)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let ref: StringRecord = mergedData;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]!;
          if (typeof ref[part] !== 'object' || ref[part] === null) {
            ref[part] = {};
          } else if (i === 0) {
            ref[part] = { ...(ref[part] as StringRecord) };
          }
          ref = ref[part] as StringRecord;
        }
        const finalKey = parts[parts.length - 1]!;
        ref[finalKey] = (typeof value === 'object' && value !== null) ?
          (Array.isArray(value) ? [...value] : { ...(value as StringRecord) }) : value;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        mergedData[key] = { ...((mergedData[key] as StringRecord) || {}), ...(value as StringRecord) };
      } else {
        mergedData[key] = (Array.isArray(value)) ? [...value] : value;
      }
    }

    if (this.config.timestamps) {
      const now = new Date().toISOString();
      mergedData.updatedAt = now;
      if (!mergedData.metadata) mergedData.metadata = {};
      else mergedData.metadata = { ...(mergedData.metadata as StringRecord) };
      (mergedData.metadata as StringRecord).updatedAt = now;
    }

    mergedData = sanitizeDeep(mergedData) as ResourceData;

    const preProcessedData = sanitizeDeep(await this.resource.executeHooks('beforeUpdate', mergedData)) as ResourceData;
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

    const earlyBehaviorImpl = getBehavior(this.behavior) as Behavior;
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

    const behaviorImpl = getBehavior(this.behavior) as Behavior;
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
      resource: this.resource,
      id,
      data: validatedAttributes,
      mappedData,
      originalData: { ...attributes, id }
    });

    const finalMetadata = processedMetadata;
    const key = this.resource.getResourceKey(id);

    let existingContentType: string | undefined = undefined;
    let finalBody: string | Buffer = body;
    if (body === '' && this.behavior !== 'body-overflow') {
      const [ok, , existingObject] = await tryFn<S3Response>(() => this.client.getObject(key));
      if (ok && existingObject && existingObject.ContentLength && existingObject.ContentLength > 0 && existingObject.Body) {
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
    if (finalBody && finalBody !== '' && !finalContentType) {
      const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody as string)));
      if (okParse) finalContentType = 'application/json';
    }

    const [ok, err] = await tryFn(() => this.client.putObject({
      key,
      body: finalBody,
      contentType: finalContentType,
      metadata: finalMetadata,
    }));

    if (!ok && err && (err as Error).message && (err as Error).message.includes('metadata headers exceed')) {
      const totalSize = calculateTotalSize(finalMetadata);
      const effectiveLimit = calculateEffectiveLimit({
        s3Limit: 2047,
        systemConfig: {
          version: String(this.version),
          timestamps: this.config.timestamps,
          id
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
      throw mapAwsError(err as Error, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: 'update',
        id
      });
    }

    if (this.versioningEnabled && originalData._v !== this.version) {
      const [okHistory, errHistory] = await tryFn(() => this.resource.createHistoricalVersion(id, originalData));
      if (!okHistory) {
        this.resource.emit('historyError', {
          operation: 'update',
          id,
          error: errHistory,
          message: (errHistory as Error).message
        });
      }
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
              message: (err as Error).message
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
            message: (err2 as Error).message
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
      const finalResult = await this.resource.executeHooks('afterUpdate', updatedData) as ResourceData;
      this.resource._emitStandardized('updated', {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      }, updatedData.id);
      return finalResult;
    }
  }

  async _executeBatchHelper<T>(
    operations: Array<() => Promise<T>>,
    options: BatchOptions = {}
  ): Promise<BatchResult<T>> {
    if (this.client._executeBatch) {
      return await this.client._executeBatch(operations, options);
    }

    const settled = await Promise.allSettled(operations.map(op => op()));
    const results = settled.map((s, index) => {
      if (s.status === 'fulfilled') return s.value;
      if (options.onItemError) options.onItemError(s.reason as Error, index);
      return null;
    });
    const errors = settled
      .map((s, index) => s.status === 'rejected' ? { error: s.reason as Error, index } : null)
      .filter((e): e is { error: Error; index: number } => e !== null);

    return { results, errors };
  }

  async patch(id: string, fields: StringRecord, options: PatchOptions = {}): Promise<ResourceData> {
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

    await this.resource.executeHooks('beforePatch', { id, fields, options });

    const behavior = this.behavior;
    const hasNestedFields = Object.keys(fields).some(key => key.includes('.'));

    let result: ResourceData;

    if ((behavior === 'enforce-limits' || behavior === 'truncate-data') && !hasNestedFields) {
      result = await this._patchViaCopyObject(id, fields, options);
    } else {
      result = await this.update(id, fields);
    }

    const finalResult = await this.resource.executeHooks('afterPatch', result) as ResourceData;

    return finalResult;
  }

  async _patchViaCopyObject(id: string, fields: StringRecord, options: PatchOptions = {}): Promise<ResourceData> {
    const key = this.resource.getResourceKey(id);

    const headResponse = await this.client.headObject(key);
    const currentMetadata = headResponse.Metadata || {};

    let currentData = await this.schema.unmapper(currentMetadata) as ResourceData;

    if (!currentData.id) {
      currentData.id = id;
    }

    let mergedData: ResourceData = { ...currentData };

    for (const [fieldKey, value] of Object.entries(fields)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        mergedData[fieldKey] = { ...((mergedData[fieldKey] as StringRecord) || {}), ...(value as StringRecord) };
      } else {
        mergedData[fieldKey] = (Array.isArray(value)) ? [...value] : value;
      }
    }

    if (this.config.timestamps) {
      mergedData.updatedAt = new Date().toISOString();
    }

    mergedData = sanitizeDeep(mergedData) as ResourceData;

    const { isValid, errors } = await this.validator.validate(mergedData);
    if (!isValid) {
      throw new ValidationError('Validation failed during patch', {
        validation: errors
      });
    }

    const newMetadata = await this.schema.mapper(mergedData);
    newMetadata._v = String(this.version);

    await this.client.copyObject({
      from: key,
      to: key,
      metadataDirective: 'REPLACE',
      metadata: newMetadata
    });

    if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      const oldData = { ...currentData, id };
      const newData = { ...mergedData, id };

      if (this.config.strictPartitions) {
        await this.resource.handlePartitionReferenceUpdates(oldData, newData);
      } else if (this.config.asyncPartitions) {
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
        await this.resource.handlePartitionReferenceUpdates(oldData, newData);
      }
    }

    return mergedData;
  }

  async replace(id: string, fullData: StringRecord, options: ReplaceOptions = {}): Promise<ResourceData> {
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

    await this.resource.executeHooks('beforeReplace', { id, fullData, options });

    const dataClone = { ...fullData };
    const attributesWithDefaults = this.validator.applyDefaults(dataClone);

    if (this.config.timestamps) {
      if (!attributesWithDefaults.createdAt) {
        attributesWithDefaults.createdAt = new Date().toISOString();
      }
      attributesWithDefaults.updatedAt = new Date().toISOString();
    }

    const completeData: ResourceData = sanitizeDeep({ id, ...attributesWithDefaults }) as ResourceData;

    const {
      errors,
      isValid,
      data: validated,
    } = await this.resource.validate(completeData, { includeId: true });

    if (!isValid) {
      const errorMsg = (errors && errors.length && errors[0]?.message) ? errors[0].message : 'Replace failed';
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: completeData,
        validation: errors,
        message: errorMsg
      });
    }

    const { id: validatedId, ...validatedAttributes } = validated;

    const mappedMetadata = await this.schema.mapper(validatedAttributes);
    mappedMetadata._v = String(this.version);

    const behaviorImpl = getBehavior(this.behavior) as Behavior;
    const { mappedData: finalMetadata, body } = await behaviorImpl.handleInsert({
      resource: this.resource,
      data: validatedAttributes,
      mappedData: mappedMetadata,
      originalData: completeData
    });

    const key = this.resource.getResourceKey(id);

    let contentType: string | undefined = undefined;
    if (body && body !== '') {
      const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = 'application/json';
    }

    if (this.behavior === 'body-only' && (!body || body === '')) {
      throw new ResourceError('Body required for body-only behavior', {
        resourceName: this.name,
        operation: 'replace',
        id,
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
      const msg = errPut && (errPut as Error).message ? (errPut as Error).message : '';
      if (msg.includes('metadata headers exceed') || msg.includes('Replace failed')) {
        const totalSize = calculateTotalSize(finalMetadata);
        const effectiveLimit = calculateEffectiveLimit({
          s3Limit: 2047,
          systemConfig: {
            version: String(this.version),
            timestamps: this.config.timestamps,
            id
          }
        });
        const excess = totalSize - effectiveLimit;
        (errPut as Error & { totalSize?: number; limit?: number; effectiveLimit?: number; excess?: number }).totalSize = totalSize;
        (errPut as Error & { totalSize?: number; limit?: number; effectiveLimit?: number; excess?: number }).limit = 2047;
        (errPut as Error & { totalSize?: number; limit?: number; effectiveLimit?: number; excess?: number }).effectiveLimit = effectiveLimit;
        (errPut as Error & { totalSize?: number; limit?: number; effectiveLimit?: number; excess?: number }).excess = excess;
        throw new ResourceError('metadata headers exceed', { resourceName: this.name, operation: 'replace', id, totalSize, effectiveLimit, excess, suggestion: 'Reduce metadata size or number of fields.' });
      }
      throw errPut;
    }

    const replacedObject: ResourceData = { id, ...validatedAttributes };

    if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      if (this.config.strictPartitions) {
        await this.resource.handlePartitionReferenceUpdates({}, replacedObject);
      } else if (this.config.asyncPartitions) {
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
        await this.resource.handlePartitionReferenceUpdates({}, replacedObject);
      }
    }

    const finalResult = await this.resource.executeHooks('afterReplace', replacedObject) as ResourceData;

    return finalResult;
  }

  async updateConditional(
    id: string,
    attributes: StringRecord,
    options: UpdateConditionalOptions
  ): Promise<UpdateConditionalResult> {
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

    const exists = await this.exists(id);
    if (!exists) {
      return {
        success: false,
        error: `Resource with id '${id}' does not exist`
      };
    }

    const originalData = await this.get(id);
    let mergedData: ResourceData = { ...originalData };

    for (const [key, value] of Object.entries(attributes)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let ref: StringRecord = mergedData;

        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]!;
          if (typeof ref[part] !== 'object' || ref[part] === null) {
            ref[part] = {};
          } else if (i === 0) {
            ref[part] = { ...(ref[part] as StringRecord) };
          }
          ref = ref[part] as StringRecord;
        }

        const finalKey = parts[parts.length - 1]!;
        ref[finalKey] = (typeof value === 'object' && value !== null) ?
          (Array.isArray(value) ? [...value] : { ...(value as StringRecord) }) : value;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        mergedData[key] = { ...((mergedData[key] as StringRecord) || {}), ...(value as StringRecord) };
      } else {
        mergedData[key] = (Array.isArray(value)) ? [...value] : value;
      }
    }

    if (this.config.timestamps) {
      const now = new Date().toISOString();
      mergedData.updatedAt = now;
      if (!mergedData.metadata) mergedData.metadata = {};
      else mergedData.metadata = { ...(mergedData.metadata as StringRecord) };
      (mergedData.metadata as StringRecord).updatedAt = now;
    }

    mergedData = sanitizeDeep(mergedData) as ResourceData;

    const preProcessedData = sanitizeDeep(await this.resource.executeHooks('beforeUpdate', mergedData)) as ResourceData;
    const completeData = { ...originalData, ...preProcessedData, id };

    const { isValid, errors, data } = await this.resource.validate(completeData, { includeId: true });
    if (!isValid) {
      return {
        success: false,
        error: 'Validation failed: ' + ((errors && errors.length) ? JSON.stringify(errors) : 'unknown'),
        validationErrors: errors
      };
    }

    const { id: validatedId, ...validatedAttributes } = data;
    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);

    const behaviorImpl = getBehavior(this.behavior) as Behavior;
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
      resource: this.resource,
      id,
      data: validatedAttributes,
      mappedData,
      originalData: { ...attributes, id }
    });

    const key = this.resource.getResourceKey(id);
    let existingContentType: string | undefined = undefined;
    let finalBody: string | Buffer = body;

    if (body === '' && this.behavior !== 'body-overflow') {
      const [okGet, , existingObject] = await tryFn<S3Response>(() => this.client.getObject(key));
      if (okGet && existingObject && existingObject.ContentLength && existingObject.ContentLength > 0 && existingObject.Body) {
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
    if (finalBody && finalBody !== '' && !finalContentType) {
      const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody as string)));
      if (okParse) finalContentType = 'application/json';
    }

    const [ok, err, response] = await tryFn<{ ETag?: string }>(() => this.client.putObject({
      key,
      body: finalBody,
      contentType: finalContentType,
      metadata: processedMetadata,
      ifMatch
    }));

    if (!ok) {
      if ((err as Error & { name?: string }).name === 'PreconditionFailed' ||
          (err as Error & { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) {
        return {
          success: false,
          error: 'ETag mismatch - object was modified by another process'
        };
      }

      return {
        success: false,
        error: (err as Error).message || 'Update failed'
      };
    }

    if (this.versioningEnabled && originalData._v !== this.version) {
      const [okHistory, errHistory] = await tryFn(() => this.resource.createHistoricalVersion(id, originalData));
      if (!okHistory) {
        this.resource.emit('historyError', {
          operation: 'updateConditional',
          id,
          error: errHistory,
          message: (errHistory as Error).message
        });
      }
    }

    const updatedData = await this.resource.composeFullObjectFromWrite({
      id,
      metadata: processedMetadata,
      body: finalBody,
      behavior: this.behavior
    });

    const oldData = { ...originalData, id };
    const newData = { ...validatedAttributes, id };

    if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      if (this.config.strictPartitions) {
        await this.resource.handlePartitionReferenceUpdates(oldData, newData);
      } else if (this.config.asyncPartitions) {
        setImmediate(() => {
          this.resource.handlePartitionReferenceUpdates(oldData, newData).catch(err => {
            this.resource.emit('partitionIndexError', {
              operation: 'updateConditional',
              id,
              error: err,
              message: (err as Error).message
            });
          });
        });
      } else {
        const [okPartition, errPartition] = await tryFn(() => this.resource.handlePartitionReferenceUpdates(oldData, newData));
        if (!okPartition) {
          this.resource.emit('partitionIndexError', {
            operation: 'updateConditional',
            id,
            error: errPartition,
            message: (errPartition as Error).message
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

      return {
        success: true,
        data: finalResult,
        etag: (response as { ETag?: string })?.ETag
      };
    } else {
      await this.resource.handlePartitionReferenceUpdates(oldData, newData);
      const finalResult = await this.resource.executeHooks('afterUpdate', updatedData) as ResourceData;

      this.resource._emitStandardized('updated', {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      }, updatedData.id);

      return {
        success: true,
        data: finalResult,
        etag: (response as { ETag?: string })?.ETag
      };
    }
  }

  async deleteAll(): Promise<DeleteAllResult> {
    if (this.config.paranoid !== false) {
      throw new ResourceError('deleteAll() is a dangerous operation and requires paranoid: false option.', {
        resourceName: this.name,
        operation: 'deleteAll',
        paranoid: this.config.paranoid,
        suggestion: 'Set paranoid: false to allow deleteAll.'
      });
    }

    const prefix = `resource=${this.name}/data`;
    const deletedCount = await this.client.deleteAll({ prefix });

    this.resource._emitStandardized('deleted-all', {
      version: this.version,
      prefix,
      deletedCount
    });

    return { deletedCount, version: this.version };
  }

  async deleteAllData(): Promise<DeleteAllResult> {
    if (this.config.paranoid !== false) {
      throw new ResourceError('deleteAllData() is a dangerous operation and requires paranoid: false option.', {
        resourceName: this.name,
        operation: 'deleteAllData',
        paranoid: this.config.paranoid,
        suggestion: 'Set paranoid: false to allow deleteAllData.'
      });
    }

    const prefix = `resource=${this.name}`;
    const deletedCount = await this.client.deleteAll({ prefix });

    this.resource._emitStandardized('deleted-all-data', {
      resource: this.name,
      prefix,
      deletedCount
    });

    return { deletedCount, resource: this.name };
  }
}

export default ResourcePersistence;
