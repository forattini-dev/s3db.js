import { join } from "path";
import { nanoid } from "nanoid";
import EventEmitter from "events";
import { createHash } from "crypto";
import { PromisePool } from "@supercharge/promise-pool";
import jsonStableStringify from "json-stable-stringify";

import {
  chunk,
  merge,
  cloneDeep,
} from "lodash-es";

import Schema from "./schema.class.js";
import { InvalidResourceItem } from "./errors.js";
import { ResourceReader, ResourceWriter } from "./stream/index.js"
import { streamToString } from "./stream/index.js";

class Resource extends EventEmitter {
  constructor({
    name,
    client,
    version = '1',
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
    this.version = version;

    this.options = {
      cache: false,
      autoDecrypt: true,
      timestamps: false,
      partitions: {},  // Changed from partitionRules to partitions (named)
      ...options,
    };

    // Initialize hooks system
    this.hooks = {
      preInsert: [],
      afterInsert: [],
      preUpdate: [],
      afterUpdate: [],
      preDelete: [],
      afterDelete: []
    };

    if (options.timestamps) {
      attributes.createdAt = 'string|optional';
      attributes.updatedAt = 'string|optional';
      
      // Automatically add timestamp partitions for date-based organization
      if (!this.options.partitions.byCreatedDate) {
        this.options.partitions.byCreatedDate = {
          fields: {
            createdAt: 'date|maxlength:10'
          }
        };
      }
      if (!this.options.partitions.byUpdatedDate) {
        this.options.partitions.byUpdatedDate = {
          fields: {
            updatedAt: 'date|maxlength:10'
          }
        };
      }
    }

    this.schema = new Schema({
      name,
      attributes,
      passphrase,
      version: this.version,
      options: this.options,
    });

    // Setup automatic partition hooks if partitions are defined
    this.setupPartitionHooks();
  }

  export() {
    return this.schema.export();
  }

  /**
   * Update resource attributes and rebuild schema
   * @param {Object} newAttributes - New attributes definition
   */
  updateAttributes(newAttributes) {
    // Store old attributes for comparison
    const oldAttributes = this.attributes;
    this.attributes = newAttributes;

    // Add timestamp attributes if enabled
    if (this.options.timestamps) {
      newAttributes.createdAt = 'string|optional';
      newAttributes.updatedAt = 'string|optional';
      
      // Automatically add timestamp partitions for date-based organization
      if (!this.options.partitions.byCreatedDate) {
        this.options.partitions.byCreatedDate = {
          fields: {
            createdAt: 'date|maxlength:10'
          }
        };
      }
      if (!this.options.partitions.byUpdatedDate) {
        this.options.partitions.byUpdatedDate = {
          fields: {
            updatedAt: 'date|maxlength:10'
          }
        };
      }
    }

    // Rebuild schema with new attributes
    this.schema = new Schema({
      name: this.name,
      attributes: newAttributes,
      passphrase: this.passphrase,
      version: this.version,
      options: this.options,
    });

    // Re-setup partition hooks with new schema
    this.setupPartitionHooks();

    return { oldAttributes, newAttributes };
  }

  /**
   * Add a hook function for a specific event
   * @param {string} event - Hook event (preInsert, afterInsert, etc.)
   * @param {Function} fn - Hook function
   */
  addHook(event, fn) {
    if (this.hooks[event]) {
      this.hooks[event].push(fn.bind(this));
    }
  }

  /**
   * Execute hooks for a specific event
   * @param {string} event - Hook event
   * @param {*} data - Data to pass to hooks
   * @returns {*} Modified data
   */
  async executeHooks(event, data) {
    if (!this.hooks[event]) return data;
    
    let result = data;
    for (const hook of this.hooks[event]) {
      result = await hook(result);
    }
    return result;
  }

  /**
   * Setup automatic partition hooks
   */
  setupPartitionHooks() {
    const partitions = this.options.partitions;
    
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }

    // Add afterInsert hook to create partition references
    this.addHook('afterInsert', async (data) => {
      await this.createPartitionReferences(data);
      return data;
    });

    // Add afterDelete hook to clean up partition references
    this.addHook('afterDelete', async (data) => {
      await this.deletePartitionReferences(data);
      return data;
    });
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
   * Apply a single partition rule to a field value
   * @param {*} value - The field value
   * @param {string} rule - The partition rule
   * @returns {*} Transformed value
   */
  applyPartitionRule(value, rule) {
    if (value === undefined || value === null) {
      return value;
    }

    let transformedValue = value;

    // Apply maxlength rule manually
    if (typeof rule === 'string' && rule.includes('maxlength:')) {
      const maxLengthMatch = rule.match(/maxlength:(\d+)/);
      if (maxLengthMatch) {
        const maxLength = parseInt(maxLengthMatch[1]);
        if (typeof transformedValue === 'string' && transformedValue.length > maxLength) {
          transformedValue = transformedValue.substring(0, maxLength);
        }
      }
    }

    // Format date values
    if (rule.includes('date')) {
      if (transformedValue instanceof Date) {
        transformedValue = transformedValue.toISOString().split('T')[0]; // YYYY-MM-DD format
      } else if (typeof transformedValue === 'string') {
        try {
          // Handle ISO8601 timestamp strings (e.g., from timestamps)
          if (transformedValue.includes('T') && transformedValue.includes('Z')) {
            transformedValue = transformedValue.split('T')[0]; // Extract date part from ISO8601
          } else {
            // Try to parse as date
            const date = new Date(transformedValue);
            if (!isNaN(date.getTime())) {
              transformedValue = date.toISOString().split('T')[0];
            }
          }
        } catch (e) {
          // Keep original value if not a valid date
        }
      }
    }

    return transformedValue;
  }



  /**
   * Get the main resource key (always versioned path)
   * @param {string} id - Resource ID
   * @returns {string} The main S3 key path
   */
  getResourceKey(id) {
    // ALWAYS use versioned path for main object
    return join(`resource=${this.name}`, `v=${this.version}`, `id=${id}`);
  }

  /**
   * Get partition reference key for a specific partition
   * @param {string} partitionName - Name of the partition
   * @param {string} id - Resource ID  
   * @param {Object} data - Data object for partition value generation
   * @returns {string|null} The partition reference S3 key path
   */
  getPartitionKey(partitionName, id, data) {
    const partition = this.options.partitions[partitionName];
    if (!partition) {
      throw new Error(`Partition '${partitionName}' not found`);
    }

    const partitionSegments = [];
    
    // Process each field in the partition (sorted by field name for consistency)
    const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const fieldValue = this.applyPartitionRule(data[fieldName], rule);
      
      if (fieldValue === undefined || fieldValue === null) {
        return null; // Skip if any required field is missing
      }
      
      partitionSegments.push(`${fieldName}=${fieldValue}`);
    }

    if (partitionSegments.length === 0) {
      return null;
    }

    return join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
  }

  async insert({ id, ...attributes }) {
    if (this.options.timestamps) {
      attributes.createdAt = new Date().toISOString();
      attributes.updatedAt = new Date().toISOString();
    }

    // Execute preInsert hooks
    const preProcessedData = await this.executeHooks('preInsert', attributes);

    const {
      errors,
      isValid,
      data: validated,
    } = await this.validate(preProcessedData);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors,
      })
    }

    if (!id && id !== 0) id = nanoid();

    const metadata = await this.schema.mapper(validated);
    const key = this.getResourceKey(id);

    await this.client.putObject({
      metadata,
      key,
      body: "", // Empty body for metadata-only objects
    });

    const final = merge({ id }, validated);

    // Execute afterInsert hooks
    await this.executeHooks('afterInsert', final);

    this.emit("insert", final);
    return final;
  }

  async get(id) {
    const key = this.getResourceKey(id);
    
    const request = await this.client.headObject(key);

    // Get the correct schema version for unmapping
    const objectVersion = this.extractVersionFromKey(key) || this.version;
    const schema = await this.getSchemaForVersion(objectVersion);

    let data = await schema.unmapper(request.Metadata);
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
      const key = this.getResourceKey(id);
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

    // Execute preUpdate hooks
    const preProcessedData = await this.executeHooks('preUpdate', attributes);

    const attrs = merge(live, preProcessedData);
    delete attrs.id;

    const { isValid, errors, data: validated } = await this.validate(attrs);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors,
      })
    }

    const key = this.getResourceKey(id);

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

    // Execute afterUpdate hooks
    await this.executeHooks('afterUpdate', validated);

    this.emit("update", preProcessedData, validated);
    return validated;
  }

  async delete(id, partitionData = {}) {
    // Get object data before deletion for hooks
    let objectData;
    try {
      objectData = await this.get(id, partitionData);
    } catch (error) {
      // Object doesn't exist, create minimal data for hooks
      objectData = { id, ...partitionData };
    }

    // Execute preDelete hooks
    await this.executeHooks('preDelete', objectData);

    const key = this.getResourceKey(id);
    const response = await this.client.deleteObject(key);

    // Execute afterDelete hooks
    await this.executeHooks('afterDelete', objectData);

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

  async count({ partition = null, partitionValues = {} } = {}) {
    let prefix;
    
    if (partition && Object.keys(partitionValues).length > 0) {
      // Count in specific partition
      const partitionDef = this.options.partitions[partition];
      if (!partitionDef) {
        throw new Error(`Partition '${partition}' not found`);
      }
      
      // Build partition segments (sorted by field name for consistency)
      const partitionSegments = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== undefined && value !== null) {
          const transformedValue = this.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }
      
      if (partitionSegments.length > 0) {
        prefix = `resource=${this.name}/partition=${partition}/${partitionSegments.join('/')}`;
      } else {
        prefix = `resource=${this.name}/partition=${partition}`;
      }
    } else {
      // Count all in main resource
      prefix = `resource=${this.name}/v=${this.version}`;
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

  async listIds({ partition = null, partitionValues = {} } = {}) {
    let prefix;
    
    if (partition && Object.keys(partitionValues).length > 0) {
      // List from specific partition
      const partitionDef = this.options.partitions[partition];
      if (!partitionDef) {
        throw new Error(`Partition '${partition}' not found`);
      }
      
      // Build partition segments (sorted by field name for consistency)
      const partitionSegments = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== undefined && value !== null) {
          const transformedValue = this.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }
      
      if (partitionSegments.length > 0) {
        prefix = `resource=${this.name}/partition=${partition}/${partitionSegments.join('/')}`;
      } else {
        prefix = `resource=${this.name}/partition=${partition}`;
      }
    } else {
      // List from main resource
      prefix = `resource=${this.name}/v=${this.version}`;
    }

    const keys = await this.client.getAllKeys({
      prefix,
    });

    const ids = keys.map((key) => {
      // Extract ID from different path patterns:
      // /resource={name}/v={version}/id={id}
      // /resource={name}/partition={name}/{field}={value}/id={id}
      const parts = key.split('/');
      const idPart = parts.find(part => part.startsWith('id='));
      return idPart ? idPart.replace('id=', '') : null;
    }).filter(Boolean);

    this.emit("listIds", ids.length);
    return ids;
  }

  /**
   * List objects by partition name and values
   * @param {Object} partitionOptions - Partition options
   * @param {Object} options - Listing options
   * @returns {Array} Array of objects
   */
  async listByPartition({ partition = null, partitionValues = {} } = {}, options = {}) {
    const { limit, offset = 0 } = options;
    
    const ids = await this.listIds({ partition, partitionValues });
    
    // Apply offset and limit
    let filteredIds = ids.slice(offset);
    if (limit) {
      filteredIds = filteredIds.slice(0, limit);
    }

    // Get full data for each ID
    const { results } = await PromisePool.for(filteredIds)
      .withConcurrency(this.parallelism)
      .process(async (id) => {
        return await this.get(id);
      });

    this.emit("listByPartition", { partition, partitionValues, count: results.length });
    return results;
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

  async page(offset = 0, size = 100, { partition = null, partitionValues = {} } = {}) {
    const allIds = await this.listIds({ partition, partitionValues });
    const totalItems = allIds.length;
    const totalPages = Math.ceil(totalItems / size);
    
    // Get paginated IDs
    const paginatedIds = allIds.slice(offset * size, (offset + 1) * size);
    
    // Get full data for each ID
    const items = await Promise.all(
      paginatedIds.map(id => this.get(id))
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

    const key = this.getResourceKey(id);
    
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
    const key = this.getResourceKey(id);
    
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
    const key = this.getResourceKey(id);
    
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
    const key = this.getResourceKey(id);
    
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

  /**
   * Extract version from S3 key
   * @param {string} key - S3 object key
   * @returns {string|null} Version string or null
   */
  extractVersionFromKey(key) {
    const parts = key.split('/');
    const versionPart = parts.find(part => part.startsWith('v='));
    return versionPart ? versionPart.replace('v=', '') : null;
  }

  /**
   * Get schema for a specific version
   * @param {string} version - Version string (e.g., 'v0', 'v1')
   * @returns {Object} Schema object for the version
   */
  async getSchemaForVersion(version) {
    // For now, always return current schema
    // TODO: If backward compatibility needed, implement version storage differently
    return this.schema;
  }

  /**
   * Create partition references after insert
   * @param {Object} data - Inserted object data
   */
  async createPartitionReferences(data) {
    const partitions = this.options.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }

    // Create reference in each partition
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey(partitionName, data.id, data);
      
      if (partitionKey) {
        // Create minimal reference object pointing to main object
        const referenceMetadata = {
          _ref: this.getResourceKey(data.id),
          _partition: partitionName,
          _id: data.id
        };
        
        await this.client.putObject({
          key: partitionKey,
          metadata: referenceMetadata,
          body: "", // Partition references are metadata-only
        });
      }
    }
  }

  /**
   * Delete partition references after delete
   * @param {Object} data - Deleted object data
   */
  async deletePartitionReferences(data) {
    const partitions = this.options.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }

    // Delete reference in each partition
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey(partitionName, data.id, data);
      
      if (partitionKey) {
        try {
          await this.client.deleteObject(partitionKey);
        } catch (error) {
          // Ignore errors if partition reference doesn't exist
          if (error.name !== 'NoSuchKey') {
            throw error;
          }
        }
      }
    }
  }


}

export default Resource;
