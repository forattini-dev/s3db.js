import { join } from "path";
import { nanoid } from "nanoid";
import EventEmitter from "events";
import { PromisePool } from "@supercharge/promise-pool";
import jsonStableStringify from "json-stable-stringify";
import { createHash } from "crypto";

import {
  chunk,
  merge,
  cloneDeep,
} from "lodash-es";

import Schema from "./schema.class";
import { InvalidResourceItem } from "./errors";
import { ResourceReader, ResourceWriter } from "./stream/index"
import { streamToString } from "./stream/index.js";

class Resource extends EventEmitter {
  constructor({
    name,
    client,
    options = {},
    attributes = {},
    parallelism = 10,
    passphrase = 'secret',
    observers = [],
  }) {
    super();

    this.name = name;
    this.client = client;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? 'secret';

    this.options = {
      cache: false,
      autoDecrypt: true,
      timestamps: false,
      partitionRules: {},
      ...options,
    };

    if (options.timestamps) {
      attributes.createdAt = 'string|optional';
      attributes.updatedAt = 'string|optional';
      
      // Automatically add timestamp partitions for date-based organization
      if (!this.options.partitionRules.createdAt) {
        this.options.partitionRules.createdAt = 'date|maxlength:10';
      }
      if (!this.options.partitionRules.updatedAt) {
        this.options.partitionRules.updatedAt = 'date|maxlength:10';
      }
    }

    this.schema = new Schema({
      name,
      attributes,
      passphrase,
      options: this.options,
    })
  }

  export() {
    return this.schema.export();
  }

  async validate(data) {
    const result = {
      original: cloneDeep(data),
      isValid: false,
      errors: [],
    };

    const check = await this.schema.validate(data, { mutateOriginal: true });

    if (check === true) {
      result.isValid = true;
    } else {
      result.errors = check;
    }

    result.data = data;
    return result
  }

  /**
   * Generate partition path based on partition rules and data
   * @param {Object} data - The data object to generate partitions from
   * @returns {string} Partition path segment
   */
  generatePartitionPath(data) {
    const { partitionRules } = this.options;
    
    if (!partitionRules || Object.keys(partitionRules).length === 0) {
      return '';
    }

    const partitionSegments = [];
    
    for (const [field, rule] of Object.entries(partitionRules)) {
      let value = data[field];
      
      if (value === undefined || value === null) {
        continue;
      }

      // Apply maxlength rule manually
      if (typeof rule === 'string' && rule.includes('maxlength:')) {
        const maxLengthMatch = rule.match(/maxlength:(\d+)/);
        if (maxLengthMatch) {
          const maxLength = parseInt(maxLengthMatch[1]);
          if (typeof value === 'string' && value.length > maxLength) {
            value = value.substring(0, maxLength);
          }
        }
      }

      // Format date values
      if (rule.includes('date')) {
        if (value instanceof Date) {
          value = value.toISOString().split('T')[0]; // YYYY-MM-DD format
        } else if (typeof value === 'string') {
          try {
            // Handle ISO8601 timestamp strings (e.g., from timestamps)
            if (value.includes('T') && value.includes('Z')) {
              value = value.split('T')[0]; // Extract date part from ISO8601
            } else {
              // Try to parse as date
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                value = date.toISOString().split('T')[0];
              }
            }
          } catch (e) {
            // Keep original value if not a valid date
          }
        }
      }

      partitionSegments.push(`${field}=${value}`);
    }

    return partitionSegments.length > 0 ? `partitions/${partitionSegments.join('/')}/` : '';
  }

  /**
   * Get the base key for a resource (with or without partitions)
   * @param {string} id - Resource ID
   * @param {Object} data - Data object for partition generation
   * @returns {string} The S3 key path
   */
  getResourceKey(id, data = {}) {
    const partitionPath = this.generatePartitionPath(data);
    
    if (partitionPath) {
      // Partitioned path: /resource={name}/partitions/{pName}={value}/id={id}
      return join(`resource=${this.name}`, partitionPath, `id=${id}`);
    } else {
      // Standard path with version: /resource={name}/v={version}/id={id}
      return join(`resource=${this.name}`, `v=${this.schema.version}`, `id=${id}`);
    }
  }

  async insert({ id, ...attributes }) {
    if (this.options.timestamps) {
      attributes.createdAt = new Date().toISOString();
      attributes.updatedAt = new Date().toISOString();
    }

    const {
      errors,
      isValid,
      data: validated,
    } = await this.validate(attributes);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes,
        validation: errors,
      })
    }

    if (!id && id !== 0) id = nanoid();

    const metadata = await this.schema.mapper(validated);
    const key = this.getResourceKey(id, validated);

    await this.client.putObject({
      metadata,
      key,
      body: "", // Empty body for metadata-only objects
    });

    const final = merge({ id }, validated);

    this.emit("insert", final);
    return final;
  }

  async get(id, partitionData = {}) {
    const key = this.getResourceKey(id, partitionData);
    
    const request = await this.client.headObject(key);

    let data = await this.schema.unmapper(request.Metadata);
    data.id = id;
    data._contentLength = request.ContentLength;
    data._lastModified = request.LastModified;
    data.mimeType = request.ContentType || null;

    if (request.VersionId) data._versionId = request.VersionId;
    if (request.Expiration) data._expiresAt = request.Expiration;

    // Add definition hash
    data.definitionHash = this.getDefinitionHash();

    // Indicate if object has binary content
    data._hasContent = request.ContentLength > 0;

    this.emit("get", data);
    return data;
  }

  async exists(id, partitionData = {}) {
    try {
      const key = this.getResourceKey(id, partitionData);
      await this.client.headObject(key);
      return true
    } catch (error) {
      return false
    }
  }

  async update(id, attributes, partitionData = {}) {
    const live = await this.get(id, partitionData);

    if (this.options.timestamps) {
      attributes.updatedAt = new Date().toISOString();
    }

    const attrs = merge(live, attributes);
    delete attrs.id;

    const { isValid, errors, data: validated } = await this.validate(attrs);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.bucket,
        resourceName: this.name,
        attributes,
        validation: errors,
      })
    }

    const key = this.getResourceKey(id, validated);

    // Check if object has existing content
    let existingBody = "";
    let existingContentType = undefined;
    try {
      const existingObject = await this.client.getObject(key);
      if (existingObject.ContentLength > 0) {
        existingBody = Buffer.from(await existingObject.Body.transformToByteArray());
        existingContentType = existingObject.ContentType;
      }
    } catch (error) {
      // No existing content, use empty body
    }

    await this.client.putObject({
      key,
      body: existingBody,
      contentType: existingContentType,
      metadata: await this.schema.mapper(validated),
    });

    validated.id = id;

    this.emit("update", attributes, validated);
    return validated;
  }

  async delete(id, partitionData = {}) {
    const key = this.getResourceKey(id, partitionData);
    const response = await this.client.deleteObject(key);

    this.emit("delete", id);
    return response;
  }

  async upsert({ id, ...attributes }) {
    const exists = await this.exists(id, attributes);

    if (exists) {
      return this.update(id, attributes, attributes);
    }

    return this.insert({ id, ...attributes });
  }

  async count(partitionData = {}) {
    let prefix = `resource=${this.name}`;
    
    // If partition data is provided, use it to narrow the search
    if (partitionData && Object.keys(partitionData).length > 0) {
      const partitionPath = this.generatePartitionPath(partitionData);
      if (partitionPath) {
        prefix = `resource=${this.name}/${partitionPath}`;
      }
    }

    const count = await this.client.count({
      prefix,
    });

    this.emit("count", count);
    return count;
  }

  async insertMany(objects) {
    const { results } = await PromisePool.for(objects)
      .withConcurrency(this.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
        this.observers.map((x) => x.emit("error", this.name, error, content));
      })
      .process(async (attributes) => {
        const result = await this.insert(attributes);
        return result;
      });

    this.emit("insertMany", objects.length);
    return results;
  }

  async deleteMany(ids, partitionData = {}) {
    const packages = chunk(
      ids.map((id) => this.getResourceKey(id, partitionData)),
      1000
    );

    const { results } = await PromisePool.for(packages)
      .withConcurrency(this.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
        this.observers.map((x) => x.emit("error", this.name, error, content));
      })
      .process(async (keys) => {
        const response = await this.client.deleteObjects(keys);

        keys.forEach((key) => {
          // Extract ID from key path
          const parts = key.split('/');
          const idPart = parts.find(part => part.startsWith('id='));
          const id = idPart ? idPart.replace('id=', '') : null;
          if (id) {
            this.emit("deleted", id);
            this.observers.map((x) => x.emit("deleted", this.name, id));
          }
        });

        return response;
      });

    this.emit("deleteMany", ids.length);
    return results;
  }

  async deleteAll() {
    const ids = await this.listIds();
    this.emit("deleteAll", ids.length);
    await this.deleteMany(ids);
  }

  async listIds(partitionData = {}) {
    let prefix = `resource=${this.name}`;
    
    // If partition data is provided, use it to narrow the search
    if (partitionData && Object.keys(partitionData).length > 0) {
      const partitionPath = this.generatePartitionPath(partitionData);
      if (partitionPath) {
        prefix = `resource=${this.name}/${partitionPath}`;
      }
    }

    const keys = await this.client.getAllKeys({
      prefix,
    });

    const ids = keys.map((key) => {
      // Extract ID from different path patterns:
      // /resource={name}/v={version}/id={id}
      // /resource={name}/partitions/.../id={id}
      const parts = key.split('/');
      const idPart = parts.find(part => part.startsWith('id='));
      return idPart ? idPart.replace('id=', '') : null;
    }).filter(Boolean);

    this.emit("listIds", ids.length);
    return ids;
  }

  async getMany(ids) {
    const { results } = await PromisePool.for(ids)
      .withConcurrency(this.client.parallelism)
      .process(async (id) => {
        this.emit("id", id);
        const data = await this.get(id);
        this.emit("data", data);
        return data;
      });

    this.emit("getMany", ids.length);

    return results;
  }

  async getAll() {
    let ids = await this.listIds();
    if (ids.length === 0) return [];

    const { results } = await PromisePool.for(ids)
      .withConcurrency(this.client.parallelism)
      .process(async (id) => {
        const data = await this.get(id);
        return data;
      });

    this.emit("getAll", results.length);
    return results;
  }

  async page(offset = 0, size = 100, partitionData = {}) {
    let prefix = `resource=${this.name}`;
    
    // If partition data is provided, use it to narrow the search
    if (partitionData && Object.keys(partitionData).length > 0) {
      const partitionPath = this.generatePartitionPath(partitionData);
      if (partitionPath) {
        prefix = `resource=${this.name}/${partitionPath}`;
      }
    }

    const allIds = await this.listIds(partitionData);
    const totalItems = allIds.length;
    const totalPages = Math.ceil(totalItems / size);
    
    // Get paginated IDs
    const paginatedIds = allIds.slice(offset * size, (offset + 1) * size);
    
    // Get full data for each ID with partition data if needed
    const items = await Promise.all(
      paginatedIds.map(id => this.get(id, partitionData))
    );

    const result = {
      items,
      totalItems,
      page: offset,
      pageSize: size,
      totalPages
    };

    this.emit("page", result);
    return result;
  }

  readable() {
    const stream = new ResourceReader({ resource: this });
    return stream.build()
  }

  writable() {
    const stream = new ResourceWriter({ resource: this });
    return stream.build()
  }

  /**
   * Store binary content associated with a resource
   * @param {string} id - Resource ID
   * @param {Buffer} buffer - Binary content
   * @param {string} contentType - Optional content type
   * @param {Object} partitionData - Partition data for locating the resource
   */
  async setContent(id, buffer, contentType = 'application/octet-stream', partitionData = {}) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Content must be a Buffer');
    }

    const key = this.getResourceKey(id, partitionData);
    
    // Get existing metadata first
    let existingMetadata = {};
    try {
      const existingObject = await this.client.headObject(key);
      existingMetadata = existingObject.Metadata || {};
    } catch (error) {
      // Object doesn't exist yet, that's ok
    }
    
    const response = await this.client.putObject({
      key,
      body: buffer,
      contentType,
      metadata: existingMetadata, // Preserve existing metadata
    });

    this.emit("setContent", id, buffer.length, contentType);
    return response;
  }

  /**
   * Retrieve binary content associated with a resource
   * @param {string} id - Resource ID
   * @param {Object} partitionData - Partition data for locating the resource
   * @returns {Object} Object with buffer and contentType
   */
  async getContent(id, partitionData = {}) {
    const key = this.getResourceKey(id, partitionData);
    
    try {
      const response = await this.client.getObject(key);
      const buffer = Buffer.from(await response.Body.transformToByteArray());
      const contentType = response.ContentType || null;

      this.emit("getContent", id, buffer.length, contentType);
      
      return {
        buffer,
        contentType
      };
    } catch (error) {
      if (error.name === "NoSuchKey") {
        return {
          buffer: null,
          contentType: null
        };
      }
      throw error;
    }
  }

  /**
   * Check if binary content exists for a resource
   * @param {string} id - Resource ID
   * @param {Object} partitionData - Partition data for locating the resource
   * @returns {boolean}
   */
  async hasContent(id, partitionData = {}) {
    const key = this.getResourceKey(id, partitionData);
    
    try {
      const response = await this.client.headObject(key);
      // Check if object has actual content (not just metadata)
      return response.ContentLength > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete binary content but preserve metadata
   * @param {string} id - Resource ID
   * @param {Object} partitionData - Partition data for locating the resource
   */
  async deleteContent(id, partitionData = {}) {
    const key = this.getResourceKey(id, partitionData);
    
    // Get existing metadata first
    const existingObject = await this.client.headObject(key);
    const existingMetadata = existingObject.Metadata || {};
    
    // Recreate object with empty body but preserve metadata
    const response = await this.client.putObject({
      key,
      body: "",
      metadata: existingMetadata,
    });
    
    this.emit("deleteContent", id);
    return response;
  }

  /**
   * Generate definition hash for this resource
   * @returns {string} SHA256 hash of the schema definition
   */
  getDefinitionHash() {
    const exportedSchema = this.schema.export();
    const stableString = jsonStableStringify(exportedSchema);
    return `sha256:${createHash('sha256').update(stableString).digest('hex')}`;
  }
}

export default Resource;
