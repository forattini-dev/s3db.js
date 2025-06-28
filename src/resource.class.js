import { join } from "path";
import { idGenerator } from "./concerns/id.js";
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
import { getBehavior, DEFAULT_BEHAVIOR } from "./behaviors/index.js";

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
    behavior = DEFAULT_BEHAVIOR,
  }) {
    super();

    this.name = name;
    this.client = client;
    this.version = version;
    this.behavior = behavior;
    
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? 'secret';

    this.options = {
      cache: false,
      autoDecrypt: true,
      timestamps: false,
      partitions: {},
      paranoid: true,  // Security flag for dangerous operations
      allNestedObjectsOptional: options.allNestedObjectsOptional ?? false,
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

    // Store attributes first
    this.attributes = attributes || {};

    if (options.timestamps) {
      this.attributes.createdAt = 'string|optional';
      this.attributes.updatedAt = 'string|optional';
      
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
      attributes: this.attributes,
      passphrase,
      version: this.version,
      options: {
        ...this.options,
        allNestedObjectsOptional: this.options.allNestedObjectsOptional ?? false
      },
    });

    // Validate partitions against current attributes
    this.validatePartitions();

    // Setup automatic partition hooks if partitions are defined
    this.setupPartitionHooks();

    // Merge user-provided hooks (added last, after internal hooks)
    if (options.hooks) {
      for (const [event, hooksArr] of Object.entries(options.hooks)) {
        if (Array.isArray(hooksArr) && this.hooks[event]) {
          for (const fn of hooksArr) {
            this.hooks[event].push(fn.bind(this));
          }
        }
      }
    }
  }

  export() {
    const exported = this.schema.export();
    exported.behavior = this.behavior;
    return exported;
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

    // Validate partitions against new attributes
    this.validatePartitions();

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
   * Validate that all partition fields exist in current resource attributes
   * @throws {Error} If partition fields don't exist in current schema
   */
  validatePartitions() {
    const partitions = this.options.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return; // No partitions to validate
    }

    const currentAttributes = Object.keys(this.attributes || {});
    
    for (const [partitionName, partitionDef] of Object.entries(partitions)) {
      if (!partitionDef.fields) {
        continue; // Skip invalid partition definitions
      }

      for (const fieldName of Object.keys(partitionDef.fields)) {
        if (!this.fieldExistsInAttributes(fieldName)) {
          throw new Error(
            `Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource version '${this.version}'. ` +
            `Available fields: ${currentAttributes.join(', ')}. ` +
            `This version of resource does not have support for this partition.`
          );
        }
      }
    }
  }

  /**
   * Check if a field (including nested fields) exists in the current attributes
   * @param {string} fieldName - Field name (can be nested like 'utm.source')
   * @returns {boolean} True if field exists
   */
  fieldExistsInAttributes(fieldName) {
    // Handle simple field names (no dots)
    if (!fieldName.includes('.')) {
      return Object.keys(this.attributes || {}).includes(fieldName);
    }

    // Handle nested field names using dot notation
    const keys = fieldName.split('.');
    let currentLevel = this.attributes || {};
    
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== 'object' || !(key in currentLevel)) {
        return false;
      }
      currentLevel = currentLevel[key];
    }
    
    return true;
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
      // Handle nested fields using dot notation (e.g., "utm.source", "address.city")
      const fieldValue = this.getNestedFieldValue(data, fieldName);
      const transformedValue = this.applyPartitionRule(fieldValue, rule);
      
      if (transformedValue === undefined || transformedValue === null) {
        return null; // Skip if any required field is missing
      }
      
      partitionSegments.push(`${fieldName}=${transformedValue}`);
    }

    if (partitionSegments.length === 0) {
      return null;
    }

    return join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
  }

  /**
   * Get nested field value from data object using dot notation
   * @param {Object} data - Data object
   * @param {string} fieldPath - Field path (e.g., "utm.source", "address.city")
   * @returns {*} Field value
   */
  getNestedFieldValue(data, fieldPath) {
    // Handle simple field names (no dots)
    if (!fieldPath.includes('.')) {
      return data[fieldPath];
    }

    // Handle nested field names using dot notation
    const keys = fieldPath.split('.');
    let value = data;
    
    for (const key of keys) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return undefined;
      }
      value = value[key];
    }
    
    return value;
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

    if (!id && id !== 0) id = idGenerator();

    const mappedData = await this.schema.mapper(validated);
    
    // Apply behavior strategy
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this,
      data: validated,
      mappedData
    });

    const key = this.getResourceKey(id);

    await this.client.putObject({
      metadata: processedMetadata,
      key,
      body,
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

    let metadata = await schema.unmapper(request.Metadata);
    
    // Apply behavior strategy for reading (important for body-overflow)
    const behaviorImpl = getBehavior(this.behavior);
    let body = "";
    
    // Get body content if needed (for body-overflow behavior)
    if (request.ContentLength > 0) {
      try {
        const fullObject = await this.client.getObject(key);
        body = await streamToString(fullObject.Body);
      } catch (error) {
        // Body read failed, continue with metadata only
        body = "";
      }
    }
    
    const { metadata: processedMetadata } = await behaviorImpl.handleGet({
      resource: this,
      metadata,
      body
    });

    let data = processedMetadata;
    data.id = id;
    data._contentLength = request.ContentLength;
    data._lastModified = request.LastModified;
    data._hasContent = request.ContentLength > 0;
    data._mimeType = request.ContentType || null;

    if (request.VersionId) data._versionId = request.VersionId;
    if (request.Expiration) data._expiresAt = request.Expiration;

    data._definitionHash = this.getDefinitionHash();

    this.emit("get", data);
    return data;
  }

  async exists(id) {
    try {
      const key = this.getResourceKey(id);
      await this.client.headObject(key);
      return true
    } catch (error) {
      return false
    }
  }

  async update(id, attributes) {
    const live = await this.get(id);

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

    const mappedData = await this.schema.mapper(validated);
    
    // Apply behavior strategy
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
      resource: this,
      id,
      data: validated,
      mappedData
    });

    const key = this.getResourceKey(id);

    // Check if object has existing content (non-behavior content)
    let existingContentType = undefined;
    let finalBody = body;
    
    // For behaviors that don't use body, preserve existing content
    if (body === "" && this.behavior !== 'body-overflow') {
      try {
        const existingObject = await this.client.getObject(key);
        if (existingObject.ContentLength > 0) {
          const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
          const existingBodyString = existingBodyBuffer.toString();
          
          // Only preserve if it's not behavior-managed content (doesn't look like JSON)
          try {
            JSON.parse(existingBodyString);
            // It's JSON, likely from previous body-overflow behavior, use new body
          } catch {
            // Not JSON, preserve existing binary content
            finalBody = existingBodyBuffer;
            existingContentType = existingObject.ContentType;
          }
        }
      } catch (error) {
        // No existing content, use new body
      }
    }

    await this.client.putObject({
      key,
      body: finalBody,
      contentType: existingContentType,
      metadata: processedMetadata,
    });

    validated.id = id;

    // Execute afterUpdate hooks
    await this.executeHooks('afterUpdate', validated);

    // Update partition objects to keep them in sync
    await this.updatePartitionReferences(validated);

    this.emit("update", preProcessedData, validated);
    return validated;
  }

  async delete(id) {
    // Get object data before deletion for hooks
    let objectData;
    try {
      objectData = await this.get(id);
    } catch (error) {
      // Object doesn't exist, create minimal data for hooks
      objectData = { id };
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
    const exists = await this.exists(id);

    if (exists) {
      return this.update(id, attributes);
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

  async deleteMany(ids) {
    const packages = chunk(
      ids.map((id) => this.getResourceKey(id)),
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
    // Security check: only allow if paranoid mode is disabled
    if (this.options.paranoid !== false) {
      throw new Error(
        `deleteAll() is a dangerous operation and requires paranoid: false option. ` +
        `Current paranoid setting: ${this.options.paranoid}`
      );
    }

    // Use deleteAll to efficiently delete all objects for current version
    const prefix = `resource=${this.name}/v=${this.version}`;
    const deletedCount = await this.client.deleteAll({ prefix });
    
    this.emit("deleteAll", { 
      version: this.version, 
      prefix, 
      deletedCount 
    });
    
    return { deletedCount, version: this.version };
  }

  /**
   * Delete all data for this resource across ALL versions
   * @returns {Promise<Object>} Deletion report
   */
  async deleteAllData() {
    // Security check: only allow if paranoid mode is disabled
    if (this.options.paranoid !== false) {
      throw new Error(
        `deleteAllData() is a dangerous operation and requires paranoid: false option. ` +
        `Current paranoid setting: ${this.options.paranoid}`
      );
    }

    // Use deleteAll to efficiently delete everything for this resource
    const prefix = `resource=${this.name}`;
    const deletedCount = await this.client.deleteAll({ prefix });
    
    this.emit("deleteAllData", { 
      resource: this.name, 
      prefix, 
      deletedCount 
    });
    
    return { deletedCount, resource: this.name };
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
    
    if (!partition) {
      // Fallback to main resource listing
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

    // Get partition definition
    const partitionDef = this.options.partitions[partition];
    if (!partitionDef) {
      throw new Error(`Partition '${partition}' not found`);
    }
    
    // Build partition prefix
    const partitionSegments = [];
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const value = partitionValues[fieldName];
      if (value !== undefined && value !== null) {
        const transformedValue = this.applyPartitionRule(value, rule);
        partitionSegments.push(`${fieldName}=${transformedValue}`);
      }
    }
    
    let prefix;
    if (partitionSegments.length > 0) {
      prefix = `resource=${this.name}/partition=${partition}/${partitionSegments.join('/')}`;
    } else {
      prefix = `resource=${this.name}/partition=${partition}`;
    }

    // Get all keys in the partition
    const keys = await this.client.getAllKeys({ prefix });
    
    // Extract IDs and apply pagination
    const ids = keys.map((key) => {
      const parts = key.split('/');
      const idPart = parts.find(part => part.startsWith('id='));
      return idPart ? idPart.replace('id=', '') : null;
    }).filter(Boolean);

    // Apply offset and limit
    let filteredIds = ids.slice(offset);
    if (limit) {
      filteredIds = filteredIds.slice(0, limit);
    }

    // Get full data directly from partition objects (no extra request needed!)
    const { results } = await PromisePool.for(filteredIds)
      .withConcurrency(this.parallelism)
      .process(async (id) => {
        return await this.getFromPartition(id, partition, partitionValues);
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
   */
  async setContent(id, buffer, contentType = 'application/octet-stream') {
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
   * @returns {Object} Object with buffer and contentType
   */
  async content(id) {
    const key = this.getResourceKey(id);
    
    try {
      const response = await this.client.getObject(key);
      const buffer = Buffer.from(await response.Body.transformToByteArray());
      const contentType = response.ContentType || null;

      this.emit("content", id, buffer.length, contentType);
      
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
   * @returns {boolean}
   */
  async hasContent(id) {
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
   */
  async deleteContent(id) {
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
    // Extract only the attributes for hashing (exclude name, version, options, etc.)
    const attributes = this.schema.export().attributes;
    
    // Create a stable version for hashing by excluding dynamic fields
    const stableAttributes = { ...attributes };
    
    // Remove timestamp fields if they were added automatically
    if (this.options.timestamps) {
      delete stableAttributes.createdAt;
      delete stableAttributes.updatedAt;
    }
    
    // Use jsonStableStringify to ensure consistent ordering
    const stableString = jsonStableStringify(stableAttributes);
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
        // Store the actual resource data in the partition path
        // This creates a direct copy with the same ID as the main resource
        const mappedData = await this.schema.mapper(data);
        
        // Apply behavior strategy for partition storage
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
          resource: this,
          data: data,
          mappedData
        });
        
        // Add version metadata for consistency
        const partitionMetadata = {
          ...processedMetadata,
          _version: this.version
        };
        
        await this.client.putObject({
          key: partitionKey,
          metadata: partitionMetadata,
          body,
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

    // Collect all partition keys to delete
    const keysToDelete = [];
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey(partitionName, data.id, data);
      
      if (partitionKey) {
        keysToDelete.push(partitionKey);
      }
    }

    // Delete all partition objects in a single batch operation
    if (keysToDelete.length > 0) {
      try {
        await this.client.deleteObjects(keysToDelete);
      } catch (error) {
        // Log but don't fail if some partition objects don't exist
        console.warn('Some partition objects could not be deleted:', error.message);
      }
    }
  }

  /**
   * Query documents with simple filtering
   * @param {Object} filter - Filter criteria
   * @returns {Array} Filtered documents
   */
  async query(filter = {}) {
    const allDocuments = await this.getAll();
    
    if (Object.keys(filter).length === 0) {
      return allDocuments;
    }
    
    return allDocuments.filter(doc => {
      return Object.entries(filter).every(([key, value]) => {
        return doc[key] === value;
      });
    });
  }

  /**
   * Update partition objects to keep them in sync
   * @param {Object} data - Updated object data
   */
  async updatePartitionReferences(data) {
    const partitions = this.options.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }

    // Update each partition object
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey(partitionName, data.id, data);
      
      if (partitionKey) {
        // Store the updated resource data in the partition path
        const mappedData = await this.schema.mapper(data);
        
        // Apply behavior strategy for partition storage
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
          resource: this,
          id: data.id,
          data: data,
          mappedData
        });
        
        // Add version metadata for consistency
        const partitionMetadata = {
          ...processedMetadata,
          _version: this.version
        };
        
        try {
          await this.client.putObject({
            key: partitionKey,
            metadata: partitionMetadata,
            body,
          });
        } catch (error) {
          // Log but don't fail if partition object doesn't exist
          console.warn(`Partition object could not be updated for ${partitionName}:`, error.message);
        }
      }
    }
  }

  /**
   * Get object directly from a specific partition
   * @param {string} id - Resource ID
   * @param {string} partitionName - Name of the partition
   * @param {Object} partitionValues - Values for partition fields
   * @returns {Object} The resource data
   */
  async getFromPartition(id, partitionName, partitionValues = {}) {
    const partition = this.options.partitions[partitionName];
    if (!partition) {
      throw new Error(`Partition '${partitionName}' not found`);
    }

    // Build partition key using provided values
    const partitionSegments = [];
    const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const value = partitionValues[fieldName];
      if (value !== undefined && value !== null) {
        const transformedValue = this.applyPartitionRule(value, rule);
        partitionSegments.push(`${fieldName}=${transformedValue}`);
      }
    }
    
    if (partitionSegments.length === 0) {
      throw new Error(`No partition values provided for partition '${partitionName}'`);
    }

    const partitionKey = join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
    
    const request = await this.client.headObject(partitionKey);

    // Get the correct schema version for unmapping
    const objectVersion = request.Metadata?._version || this.version;
    const schema = await this.getSchemaForVersion(objectVersion);

    let metadata = await schema.unmapper(request.Metadata);
    
    // Apply behavior strategy for reading
    const behaviorImpl = getBehavior(this.behavior);
    let body = "";
    
    // Get body content if needed
    if (request.ContentLength > 0) {
      try {
        const fullObject = await this.client.getObject(partitionKey);
        body = await streamToString(fullObject.Body);
      } catch (error) {
        body = "";
      }
    }
    
    const { metadata: processedMetadata } = await behaviorImpl.handleGet({
      resource: this,
      metadata,
      body
    });

    let data = processedMetadata;
    data.id = id;
    data._contentLength = request.ContentLength;
    data._lastModified = request.LastModified;
    data._hasContent = request.ContentLength > 0;
    data._mimeType = request.ContentType || null;
    data._partition = partitionName;
    data._partitionValues = partitionValues;

    if (request.VersionId) data._versionId = request.VersionId;
    if (request.Expiration) data._expiresAt = request.Expiration;

    data._definitionHash = this.getDefinitionHash();

    this.emit("getFromPartition", data);
    return data;
  }

}

export default Resource;
