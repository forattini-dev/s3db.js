import { join } from "path";
import EventEmitter from "events";
import { createHash } from "crypto";
import jsonStableStringify from "json-stable-stringify";
import { PromisePool } from "@supercharge/promise-pool";

import {
  chunk,
  merge,
  cloneDeep,
} from "lodash-es";

import Schema from "./schema.class.js";
import { InvalidResourceItem } from "./errors.js";
import { streamToString } from "./stream/index.js";
import { idGenerator, passwordGenerator } from "./concerns/id.js";
import { ResourceReader, ResourceWriter } from "./stream/index.js"
import { getBehavior, DEFAULT_BEHAVIOR } from "./behaviors/index.js";

export class Resource extends EventEmitter {
  /**
   * Create a new Resource instance
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.client - S3 client instance
   * @param {string} [config.version='v0'] - Resource version
   * @param {Object} [config.attributes={}] - Resource attributes schema
   * @param {string} [config.behavior='user-management'] - Resource behavior strategy
   * @param {string} [config.passphrase='secret'] - Encryption passphrase
   * @param {number} [config.parallelism=10] - Parallelism for bulk operations
   * @param {Array} [config.observers=[]] - Observer instances
   * @param {boolean} [config.cache=false] - Enable caching
   * @param {boolean} [config.autoDecrypt=true] - Auto-decrypt secret fields
   * @param {boolean} [config.timestamps=false] - Enable automatic timestamps
   * @param {Object} [config.partitions={}] - Partition definitions
   * @param {boolean} [config.paranoid=true] - Security flag for dangerous operations
   * @param {boolean} [config.allNestedObjectsOptional=false] - Make nested objects optional
   * @param {Object} [config.hooks={}] - Custom hooks
   * @param {Object} [config.options={}] - Additional options
   * @example
   * const users = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: {
   *     name: 'string|required',
   *     email: 'string|required',
   *     password: 'secret|required'
   *   },
   *   behavior: 'user-management',
   *   passphrase: 'my-secret-key',
   *   timestamps: true,
   *   partitions: {
   *     byRegion: {
   *       fields: { region: 'string' }
   *     }
   *   },
   *   hooks: {
   *     preInsert: [async (data) => {
   *       console.log('Pre-insert hook:', data);
   *       return data;
   *     }]
   *   }
   * });
   */
  constructor(config) {
    super();

    // Validate configuration
    const validation = validateResourceConfig(config);
    if (!validation.isValid) {
      throw new Error(`Invalid Resource configuration:\n${validation.errors.join('\n')}`);
    }

    // Extract configuration with defaults - all at root level
    const {
      name,
      client,
      version = '1',
      attributes = {},
      behavior = DEFAULT_BEHAVIOR,
      passphrase = 'secret',
      parallelism = 10,
      observers = [],
      cache = false,
      autoDecrypt = true,
      timestamps = false,
      partitions = {},
      paranoid = true,
      allNestedObjectsOptional = true,
      hooks = {}
    } = config;

    // Set instance properties
    this.name = name;
    this.client = client;
    this.version = version;
    this.behavior = behavior;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? 'secret';

    // Store configuration - all at root level
    this.config = {
      cache,
      hooks,
      paranoid,
      timestamps,
      partitions,
      autoDecrypt,
      allNestedObjectsOptional,
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

    // Store attributes
    this.attributes = attributes || {};

    // Apply configuration settings (timestamps, partitions, hooks)
    this.applyConfiguration();

    // Merge user-provided hooks (added last, after internal hooks)
    if (hooks) {
      for (const [event, hooksArr] of Object.entries(hooks)) {
        if (Array.isArray(hooksArr) && this.hooks[event]) {
          for (const fn of hooksArr) {
            if (typeof fn === 'function') {
              this.hooks[event].push(fn.bind(this));
            }
            // Se não for função, ignore silenciosamente
          }
        }
      }
    }
  }

  /**
   * Get resource options (for backward compatibility with tests)
   */
  get options() {
    return {
      timestamps: this.config.timestamps,
      partitions: this.config.partitions || {},
      cache: this.config.cache,
      autoDecrypt: this.config.autoDecrypt,
      paranoid: this.config.paranoid,
      allNestedObjectsOptional: this.config.allNestedObjectsOptional
    };
  }

  export() {
    const exported = this.schema.export();
    // Add all configuration at root level
    exported.behavior = this.behavior;
    exported.timestamps = this.config.timestamps;
    exported.partitions = this.config.partitions || {};
    exported.paranoid = this.config.paranoid;
    exported.allNestedObjectsOptional = this.config.allNestedObjectsOptional;
    exported.autoDecrypt = this.config.autoDecrypt;
    exported.cache = this.config.cache;
    exported.hooks = this.hooks;
    return exported;
  }

  /**
   * Apply configuration settings (timestamps, partitions, hooks)
   * This method ensures that all configuration-dependent features are properly set up
   */
  applyConfiguration() {
    // Handle timestamps configuration
    if (this.config.timestamps) {
      // Add timestamp attributes if they don't exist
      if (!this.attributes.createdAt) {
        this.attributes.createdAt = 'string|optional';
      }
      if (!this.attributes.updatedAt) {
        this.attributes.updatedAt = 'string|optional';
      }
      
      // Ensure partitions object exists
      if (!this.config.partitions) {
        this.config.partitions = {};
      }
      
      // Add timestamp partitions if they don't exist
      if (!this.config.partitions.byCreatedDate) {
        this.config.partitions.byCreatedDate = {
          fields: {
            createdAt: 'date|maxlength:10'
          }
        };
      }
      if (!this.config.partitions.byUpdatedDate) {
        this.config.partitions.byUpdatedDate = {
          fields: {
            updatedAt: 'date|maxlength:10'
          }
        };
      }
    }

    // Setup automatic partition hooks
    this.setupPartitionHooks();

    // Rebuild schema with current attributes
    this.schema = new Schema({
      name: this.name,
      attributes: this.attributes,
      passphrase: this.passphrase,
      version: this.version,
      options: {
        autoDecrypt: this.config.autoDecrypt,
        allNestedObjectsOptional: this.config.allNestedObjectsOptional
      },
    });

    // Validate partitions against current attributes
    this.validatePartitions();
  }

  /**
   * Update resource attributes and rebuild schema
   * @param {Object} newAttributes - New attributes definition
   */
  updateAttributes(newAttributes) {
    // Store old attributes for comparison
    const oldAttributes = this.attributes;
    this.attributes = newAttributes;

    // Apply configuration to ensure timestamps and hooks are set up
    this.applyConfiguration();

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
    if (!this.config.partitions) {
      return;
    }
    
    const partitions = this.config.partitions;
    if (Object.keys(partitions).length === 0) {
      return;
    }

    // Add afterInsert hook to create partition references
    if (!this.hooks.afterInsert) {
      this.hooks.afterInsert = [];
    }
    this.hooks.afterInsert.push(async (data) => {
      await this.createPartitionReferences(data);
      return data;
    });

    // Add afterDelete hook to clean up partition references
    if (!this.hooks.afterDelete) {
      this.hooks.afterDelete = [];
    }
    this.hooks.afterDelete.push(async (data) => {
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
    if (!this.config.partitions) {
      return; // No partitions to validate
    }
    
    const partitions = this.config.partitions;
    if (Object.keys(partitions).length === 0) {
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
            `Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource attributes. ` +
            `Available fields: ${currentAttributes.join(', ')}.`
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
   * Generate partition key for a resource in a specific partition
   * @param {Object} params - Partition key parameters
   * @param {string} params.partitionName - Name of the partition
   * @param {string} params.id - Resource ID
   * @param {Object} params.data - Resource data for partition value extraction
   * @returns {string|null} The partition key path or null if required fields are missing
   * @example
   * const partitionKey = resource.getPartitionKey({
   *   partitionName: 'byUtmSource',
   *   id: 'user-123',
   *   data: { utm: { source: 'google' } }
   * });
   * // Returns: 'resource=users/partition=byUtmSource/utm.source=google/id=user-123'
   * 
   * // Returns null if required field is missing
   * const nullKey = resource.getPartitionKey({
   *   partitionName: 'byUtmSource',
   *   id: 'user-123',
   *   data: { name: 'John' } // Missing utm.source
   * });
   * // Returns: null
   */
  getPartitionKey({ partitionName, id, data }) {
    if (!this.config.partitions || !this.config.partitions[partitionName]) {
      throw new Error(`Partition '${partitionName}' not found`);
    }
    
    const partition = this.config.partitions[partitionName];
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
    let currentLevel = data;
    
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== 'object' || !(key in currentLevel)) {
        return undefined;
      }
      currentLevel = currentLevel[key];
    }
    
    return currentLevel;
  }

  /**
   * Insert a new resource object
   * @param {Object} params - Insert parameters
   * @param {string} [params.id] - Resource ID (auto-generated if not provided)
   * @param {...Object} params - Resource attributes (any additional properties)
   * @returns {Promise<Object>} The inserted resource object with all attributes and generated ID
   * @example
   * // Insert with auto-generated ID
   * const user = await resource.insert({
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   age: 30
   * });
   * 
   * // Insert with custom ID
   * const user = await resource.insert({
   *   id: 'custom-id-123',
   *   name: 'Jane Smith',
   *   email: 'jane@example.com'
   * });
   * 
   * // Insert with auto-generated password for secret field
   * const user = await resource.insert({
   *   name: 'John Doe',
   *   email: 'john@example.com',
   * });
   */
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

  /**
   * Retrieve a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object with all attributes and metadata
   * @example
   * const user = await resource.get('user-123');
   * console.log(user.name); // 'John Doe'
   * console.log(user._lastModified); // Date object
   * console.log(user._hasContent); // boolean
   */
  async get(id) {
    const key = this.getResourceKey(id);
    
    try {
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
          console.warn(`Failed to read body for resource ${id}:`, error.message);
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
    } catch (error) {
      // Check if this is a decryption error
      if (error.message.includes('Cipher job failed') || 
          error.message.includes('OperationError') ||
          error.originalError?.message?.includes('Cipher job failed')) {
        
        // Try to get the object without decryption (raw metadata)
        try {
          console.warn(`Decryption failed for resource ${id}, attempting to get raw metadata`);
          
          const request = await this.client.headObject(key);
          const objectVersion = this.extractVersionFromKey(key) || this.version;
          
          // Create a temporary schema with autoDecrypt disabled
          const tempSchema = new Schema({
            name: this.name,
            attributes: this.attributes,
            passphrase: this.passphrase,
            version: objectVersion,
            options: {
              ...this.config,
              autoDecrypt: false, // Disable decryption
              autoEncrypt: false  // Disable encryption
            }
          });
          
          let metadata = await tempSchema.unmapper(request.Metadata);
          
          // Apply behavior strategy for reading
          const behaviorImpl = getBehavior(this.behavior);
          let body = "";
          
          if (request.ContentLength > 0) {
            try {
              const fullObject = await this.client.getObject(key);
              body = await streamToString(fullObject.Body);
            } catch (bodyError) {
              console.warn(`Failed to read body for resource ${id}:`, bodyError.message);
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
          data._version = objectVersion;
          data._decryptionFailed = true; // Flag to indicate decryption failed

          if (request.VersionId) data._versionId = request.VersionId;
          if (request.Expiration) data._expiresAt = request.Expiration;

          data._definitionHash = this.getDefinitionHash();

          this.emit("get", data);
          return data;
          
        } catch (fallbackError) {
          console.error(`Fallback attempt also failed for resource ${id}:`, fallbackError.message);
        }
      }
      
      // Re-throw the error with more context
      const enhancedError = new Error(`Failed to get resource with id '${id}': ${error.message}`);
      enhancedError.originalError = error;
      enhancedError.resourceId = id;
      enhancedError.resourceKey = key;
      throw enhancedError;
    }
  }

  /**
   * Check if a resource exists by ID
   * @param {string} id - Resource ID
   * @returns {Promise<boolean>} True if resource exists, false otherwise
   * @example
   * const exists = await resource.exists('user-123');
   * if (exists) {
   *   console.log('User exists');
   * }
   */
  async exists(id) {
    try {
      const key = this.getResourceKey(id);
      await this.client.headObject(key);
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Update an existing resource object
   * @param {string} id - Resource ID
   * @param {Object} attributes - Attributes to update (partial update supported)
   * @returns {Promise<Object>} The updated resource object with all attributes
   * @example
   * // Update specific fields
   * const updatedUser = await resource.update('user-123', {
   *   name: 'John Updated',
   *   age: 31
   * });
   * 
   * // Update with timestamps (if enabled)
   * const updatedUser = await resource.update('user-123', {
   *   email: 'newemail@example.com'
   * });
   * console.log(updatedUser.updatedAt); // ISO timestamp
   */
  async update(id, attributes) {
    const live = await this.get(id);

    if (this.config.timestamps) {
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

  /**
   * Delete a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} S3 delete response
   * @example
   * await resource.delete('user-123');
   * console.log('User deleted successfully');
   */
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

  /**
   * Insert or update a resource object (upsert operation)
   * @param {Object} params - Upsert parameters
   * @param {string} params.id - Resource ID (required for upsert)
   * @param {...Object} params - Resource attributes (any additional properties)
   * @returns {Promise<Object>} The inserted or updated resource object
   * @example
   * // Will insert if doesn't exist, update if exists
   * const user = await resource.upsert({
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   */
  async upsert({ id, ...attributes }) {
    const exists = await this.exists(id);

    if (exists) {
      return this.update(id, attributes);
    }

    return this.insert({ id, ...attributes });
  }

  /**
   * Count resources with optional partition filtering
   * @param {Object} [params] - Count parameters
   * @param {string} [params.partition] - Partition name to count in
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @returns {Promise<number>} Total count of matching resources
   * @example
   * // Count all resources
   * const total = await resource.count();
   * 
   * // Count in specific partition
   * const googleUsers = await resource.count({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * 
   * // Count in multi-field partition
   * const usElectronics = await resource.count({
   *   partition: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async count({ partition = null, partitionValues = {} } = {}) {
    let prefix;
    
    if (partition && Object.keys(partitionValues).length > 0) {
      // Count in specific partition
      const partitionDef = this.config.partitions[partition];
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

  /**
   * Insert multiple resources in parallel
   * @param {Object[]} objects - Array of resource objects to insert
   * @returns {Promise<Object[]>} Array of inserted resource objects
   * @example
   * const users = [
   *   { name: 'John', email: 'john@example.com' },
   *   { name: 'Jane', email: 'jane@example.com' },
   *   { name: 'Bob', email: 'bob@example.com' }
   * ];
   * const insertedUsers = await resource.insertMany(users);
   * console.log(`Inserted ${insertedUsers.length} users`);
   */
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

  /**
   * Delete multiple resources by their IDs in parallel
   * @param {string[]} ids - Array of resource IDs to delete
   * @returns {Promise<Object[]>} Array of S3 delete responses
   * @example
   * const deletedIds = ['user-1', 'user-2', 'user-3'];
   * const results = await resource.deleteMany(deletedIds);
   * console.log(`Deleted ${deletedIds.length} users`);
   */
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
    if (this.config.paranoid !== false) {
      throw new Error(
        `deleteAll() is a dangerous operation and requires paranoid: false option. ` +
        `Current paranoid setting: ${this.config.paranoid}`
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
    if (this.config.paranoid !== false) {
      throw new Error(
        `deleteAllData() is a dangerous operation and requires paranoid: false option. ` +
        `Current paranoid setting: ${this.config.paranoid}`
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

  /**
   * List resource IDs with optional partition filtering and pagination
   * @param {Object} [params] - List parameters
   * @param {string} [params.partition] - Partition name to list from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {number} [params.limit] - Maximum number of results to return
   * @param {number} [params.offset=0] - Offset for pagination
   * @returns {Promise<string[]>} Array of resource IDs (strings)
   * @example
   * // List all IDs
   * const allIds = await resource.listIds();
   * 
   * // List IDs with pagination
   * const firstPageIds = await resource.listIds({ limit: 10, offset: 0 });
   * const secondPageIds = await resource.listIds({ limit: 10, offset: 10 });
   * 
   * // List IDs from specific partition
   * const googleUserIds = await resource.listIds({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * 
   * // List IDs from multi-field partition
   * const usElectronicsIds = await resource.listIds({
   *   partition: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async listIds({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
    let prefix;
    
    if (partition && Object.keys(partitionValues).length > 0) {
      // List from specific partition
      if (!this.config.partitions || !this.config.partitions[partition]) {
        throw new Error(`Partition '${partition}' not found`);
      }
      
      const partitionDef = this.config.partitions[partition];
      
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

    // Use getKeysPage for real pagination support
    const keys = await this.client.getKeysPage({
      prefix,
      offset: offset,
      amount: limit || 1000, // Default to 1000 if no limit specified
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
   * List resource objects with optional partition filtering and pagination
   * @param {Object} [params] - List parameters
   * @param {string} [params.partition] - Partition name to list from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {number} [params.limit] - Maximum number of results to return
   * @param {number} [params.offset=0] - Offset for pagination
   * @returns {Promise<Object[]>} Array of resource objects with all attributes
   * @example
   * // List all resources
   * const allUsers = await resource.list();
   * 
   * // List with pagination
   * const firstPage = await resource.list({ limit: 10, offset: 0 });
   * const secondPage = await resource.list({ limit: 10, offset: 10 });
   * 
   * // List from specific partition
   * const googleUsers = await resource.list({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * 
   * // List from partition with pagination
   * const googleUsersPage = await resource.list({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' },
   *   limit: 5,
   *   offset: 0
   * });
   */
  async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
    try {
      if (!partition) {
        // Fallback to main resource listing
        let ids = [];
        try {
          ids = await this.listIds({ partition, partitionValues });
        } catch (listIdsError) {
          console.warn(`Failed to get list IDs:`, listIdsError.message);
          return [];
        }
        
        // Apply offset and limit
        let filteredIds = ids.slice(offset);
        if (limit) {
          filteredIds = filteredIds.slice(0, limit);
        }

        // Get full data for each ID with error handling
        const { results, errors } = await PromisePool.for(filteredIds)
          .withConcurrency(this.parallelism)
          .handleError(async (error, id) => {
            console.warn(`Failed to get resource ${id}:`, error.message);
            // Return null for failed items so we can filter them out
            return null;
          })
          .process(async (id) => {
            try {
              return await this.get(id);
            } catch (error) {
              // If it's a decryption error, try to get basic info
              if (error.message.includes('Cipher job failed') || 
                  error.message.includes('OperationError')) {
                console.warn(`Decryption failed for ${id}, returning basic info`);
                return {
                  id,
                  _decryptionFailed: true,
                  _error: error.message
                };
              }
              throw error; // Re-throw other errors
            }
          });

        // Filter out null results (failed items)
        const validResults = results.filter(item => item !== null);

        this.emit("list", { partition, partitionValues, count: validResults.length, errors: errors.length });
        return validResults;
      }

      // Get partition definition
      if (!this.config.partitions || !this.config.partitions[partition]) {
        throw new Error(`Partition '${partition}' not found`);
      }
      
      const partitionDef = this.config.partitions[partition];
      
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
      let keys = [];
      try {
        keys = await this.client.getAllKeys({ prefix });
      } catch (getKeysError) {
        console.warn(`Failed to get partition keys:`, getKeysError.message);
        return [];
      }
      
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

      // Get full data directly from partition objects with error handling
      const { results, errors } = await PromisePool.for(filteredIds)
        .withConcurrency(this.parallelism)
        .handleError(async (error, id) => {
          console.warn(`Failed to get partition resource ${id}:`, error.message);
          return null;
        })
        .process(async (id) => {
          try {
            return await this.getFromPartition({ id, partitionName: partition, partitionValues });
          } catch (error) {
            // If it's a decryption error, try to get basic info
            if (error.message.includes('Cipher job failed') || 
                error.message.includes('OperationError')) {
              console.warn(`Decryption failed for partition resource ${id}, returning basic info`);
              return {
                id,
                _partition: partition,
                _partitionValues: partitionValues,
                _decryptionFailed: true,
                _error: error.message
              };
            }
            throw error; // Re-throw other errors
          }
        });

      // Filter out null results (failed items)
      const validResults = results.filter(item => item !== null);

      this.emit("list", { partition, partitionValues, count: validResults.length, errors: errors.length });
      return validResults;
    } catch (error) {
      // Final fallback - return empty array if everything fails
      console.error(`Critical error in list method:`, error.message);
      this.emit("list", { partition, partitionValues, count: 0, errors: 1 });
      return [];
    }
  }

  /**
   * Get multiple resources by their IDs
   * @param {string[]} ids - Array of resource IDs
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * const users = await resource.getMany(['user-1', 'user-2', 'user-3']);
   * users.forEach(user => console.log(user.name));
   */
  async getMany(ids) {
    const { results, errors } = await PromisePool.for(ids)
      .withConcurrency(this.client.parallelism)
      .handleError(async (error, id) => {
        console.warn(`Failed to get resource ${id}:`, error.message);
        // Return basic info for failed items
        return {
          id,
          _error: error.message,
          _decryptionFailed: error.message.includes('Cipher job failed') || error.message.includes('OperationError')
        };
      })
      .process(async (id) => {
        this.emit("id", id);
        try {
          const data = await this.get(id);
          this.emit("data", data);
          return data;
        } catch (error) {
          // If it's a decryption error, return basic info
          if (error.message.includes('Cipher job failed') || 
              error.message.includes('OperationError')) {
            console.warn(`Decryption failed for ${id}, returning basic info`);
            return {
              id,
              _decryptionFailed: true,
              _error: error.message
            };
          }
          throw error; // Re-throw other errors
        }
      });

    this.emit("getMany", ids.length);
    return results;
  }

  /**
   * Get all resources (equivalent to list() without pagination)
   * @returns {Promise<Object[]>} Array of all resource objects
   * @example
   * const allUsers = await resource.getAll();
   * console.log(`Total users: ${allUsers.length}`);
   */
  async getAll() {
    let ids = await this.listIds();
    if (ids.length === 0) return [];

    const { results, errors } = await PromisePool.for(ids)
      .withConcurrency(this.client.parallelism)
      .handleError(async (error, id) => {
        console.warn(`Failed to get resource ${id}:`, error.message);
        // Return basic info for failed items
        return {
          id,
          _error: error.message,
          _decryptionFailed: error.message.includes('Cipher job failed') || error.message.includes('OperationError')
        };
      })
      .process(async (id) => {
        try {
          const data = await this.get(id);
          return data;
        } catch (error) {
          // If it's a decryption error, return basic info
          if (error.message.includes('Cipher job failed') || 
              error.message.includes('OperationError')) {
            console.warn(`Decryption failed for ${id}, returning basic info`);
            return {
              id,
              _decryptionFailed: true,
              _error: error.message
            };
          }
          throw error; // Re-throw other errors
        }
      });

    this.emit("getAll", results.length);
    return results;
  }

  /**
   * Get a page of resources with pagination metadata
   * @param {Object} [params] - Page parameters
   * @param {number} [params.offset=0] - Offset for pagination
   * @param {number} [params.size=100] - Page size
   * @param {string} [params.partition] - Partition name to page from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {boolean} [params.skipCount=false] - Skip total count for performance (useful for large collections)
   * @returns {Promise<Object>} Page result with items and pagination info
   * @example
   * // Get first page of all resources
   * const page = await resource.page({ offset: 0, size: 10 });
   * console.log(`Page ${page.page + 1} of ${page.totalPages}`);
   * console.log(`Showing ${page.items.length} of ${page.totalItems} total`);
   * 
   * // Get page from specific partition
   * const googlePage = await resource.page({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' },
   *   offset: 0,
   *   size: 5
   * });
   * 
   * // Skip count for performance in large collections
   * const fastPage = await resource.page({ 
   *   offset: 0, 
   *   size: 100, 
   *   skipCount: true 
   * });
   * console.log(`Got ${fastPage.items.length} items`); // totalItems will be null
   */
  async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
    try {
      // Get total count only if not skipped (for performance)
      let totalItems = null;
      let totalPages = null;
      
      if (!skipCount) {
        try {
          totalItems = await this.count({ partition, partitionValues });
          totalPages = Math.ceil(totalItems / size);
        } catch (countError) {
          console.warn(`Failed to get count for page:`, countError.message);
          // Continue without count if it fails
          totalItems = null;
          totalPages = null;
        }
      }
      
      const page = Math.floor(offset / size);
      
      // Use the existing list() method which already has pagination implemented
      let items = [];
      try {
        items = await this.list({ 
          partition, 
          partitionValues,
          limit: size,
          offset: offset
        });
      } catch (listError) {
        console.warn(`Failed to get items for page:`, listError.message);
        // Return empty items array if list fails
        items = [];
      }
      
      const result = {
        items,
        totalItems,
        page,
        pageSize: size,
        totalPages,
        // Add additional metadata for debugging
        _debug: {
          requestedSize: size,
          requestedOffset: offset,
          actualItemsReturned: items.length,
          skipCount: skipCount,
          hasTotalItems: totalItems !== null
        }
      };
      
      this.emit("page", result);
      return result;
    } catch (error) {
      // Final fallback - return a safe result even if everything fails
      console.error(`Critical error in page method:`, error.message);
      
      return {
        items: [],
        totalItems: null,
        page: Math.floor(offset / size),
        pageSize: size,
        totalPages: null,
        _debug: {
          requestedSize: size,
          requestedOffset: offset,
          actualItemsReturned: 0,
          skipCount: skipCount,
          hasTotalItems: false,
          error: error.message
        }
      };
    }
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
   * Set binary content for a resource
   * @param {Object} params - Content parameters
   * @param {string} params.id - Resource ID
   * @param {Buffer|string} params.buffer - Content buffer or string
   * @param {string} [params.contentType='application/octet-stream'] - Content type
   * @returns {Promise<Object>} Updated resource data
   * @example
   * // Set image content
   * const imageBuffer = fs.readFileSync('image.jpg');
   * await resource.setContent({
   *   id: 'user-123',
   *   buffer: imageBuffer,
   *   contentType: 'image/jpeg'
   * });
   * 
   * // Set text content
   * await resource.setContent({
   *   id: 'document-456',
   *   buffer: 'Hello World',
   *   contentType: 'text/plain'
   * });
   */
  async setContent({ id, buffer, contentType = 'application/octet-stream' }) {
    // Get current resource data
    const currentData = await this.get(id);
    if (!currentData) {
      throw new Error(`Resource with id '${id}' not found`);
    }

    // Update with new content
    const updatedData = {
      ...currentData,
      _hasContent: true,
      _contentLength: buffer.length,
      _mimeType: contentType
    };

    // Store the content in the main resource object
    await this.client.putObject({
      key: this.getResourceKey(id),
      metadata: await this.schema.mapper(updatedData),
      body: buffer,
      contentType
    });

    this.emit("setContent", { id, contentType, contentLength: buffer.length });
    return updatedData;
  }

  /**
   * Retrieve binary content associated with a resource
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} Object with buffer and contentType
   * @example
   * const content = await resource.content('user-123');
   * if (content.buffer) {
   *   console.log('Content type:', content.contentType);
   *   console.log('Content size:', content.buffer.length);
   *   // Save to file
   *   fs.writeFileSync('output.jpg', content.buffer);
   * } else {
   *   console.log('No content found');
   * }
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
   * @returns {string} SHA256 hash of the resource definition (name + attributes)
   */
  getDefinitionHash() {
    // Create a stable object with only attributes and behavior (consistent with Database.generateDefinitionHash)
    const definition = {
      attributes: this.attributes,
      behavior: this.behavior
    };
    
    // Use jsonStableStringify to ensure consistent ordering regardless of input order
    const stableString = jsonStableStringify(definition);
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
    // If version is the same as current, return current schema
    if (version === this.version) {
      return this.schema;
    }
    
    // For different versions, try to create a compatible schema
    // This is especially important for v0 objects that might have different encryption
    try {
      const compatibleSchema = new Schema({
        name: this.name,
        attributes: this.attributes,
        passphrase: this.passphrase,
        version: version,
        options: {
          ...this.config,
          // For older versions, be more lenient with decryption
          autoDecrypt: true,
          autoEncrypt: true
        }
      });
      
      return compatibleSchema;
    } catch (error) {
      console.warn(`Failed to create compatible schema for version ${version}, using current schema:`, error.message);
      return this.schema;
    }
  }

  /**
   * Create partition references after insert
   * @param {Object} data - Inserted object data
   */
  async createPartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }

    // Create reference in each partition
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      
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
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }

    // Collect all partition keys to delete
    const keysToDelete = [];
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      
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
   * Query resources with simple filtering and pagination
   * @param {Object} [filter={}] - Filter criteria (exact field matches)
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Maximum number of results
   * @param {number} [options.offset=0] - Offset for pagination
   * @param {string} [options.partition] - Partition name to query from
   * @param {Object} [options.partitionValues] - Partition field values to filter by
   * @returns {Promise<Object[]>} Array of filtered resource objects
   * @example
   * // Query all resources (no filter)
   * const allUsers = await resource.query();
   * 
   * // Query with simple filter
   * const activeUsers = await resource.query({ status: 'active' });
   * 
   * // Query with multiple filters
   * const usElectronics = await resource.query({
   *   category: 'electronics',
   *   region: 'US'
   * });
   * 
   * // Query with pagination
   * const firstPage = await resource.query(
   *   { status: 'active' },
   *   { limit: 10, offset: 0 }
   * );
   * 
   * // Query within partition
   * const googleUsers = await resource.query(
   *   { status: 'active' },
   *   {
   *     partition: 'byUtmSource',
   *     partitionValues: { 'utm.source': 'google' },
   *     limit: 5
   *   }
   * );
   */
  async query(filter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} } = {}) {
    if (Object.keys(filter).length === 0) {
      // No filter, just return paginated results
      return await this.list({ partition, partitionValues, limit, offset });
    }

    const results = [];
    let currentOffset = offset;
    const batchSize = Math.min(limit, 50); // Process in smaller batches
    
    while (results.length < limit) {
      // Get a batch of objects
      const batch = await this.list({ 
        partition, 
        partitionValues, 
        limit: batchSize, 
        offset: currentOffset 
      });
      
      if (batch.length === 0) {
        break; // No more data
      }
      
      // Filter the batch
      const filteredBatch = batch.filter(doc => {
        return Object.entries(filter).every(([key, value]) => {
          return doc[key] === value;
        });
      });
      
      // Add filtered results
      results.push(...filteredBatch);
      currentOffset += batchSize;
      
      // If we got less than batchSize, we've reached the end
      if (batch.length < batchSize) {
        break;
      }
    }
    
    // Return only up to the requested limit
    return results.slice(0, limit);
  }

  /**
   * Update partition objects to keep them in sync
   * @param {Object} data - Updated object data
   */
  async updatePartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }

    // Update each partition object
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      
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
   * Get a resource object directly from a specific partition
   * @param {Object} params - Partition parameters
   * @param {string} params.id - Resource ID
   * @param {string} params.partitionName - Name of the partition
   * @param {Object} params.partitionValues - Values for partition fields
   * @returns {Promise<Object>} The resource object with partition metadata
   * @example
   * // Get user from UTM source partition
   * const user = await resource.getFromPartition({
   *   id: 'user-123',
   *   partitionName: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * console.log(user._partition); // 'byUtmSource'
   * console.log(user._partitionValues); // { 'utm.source': 'google' }
   * 
   * // Get product from multi-field partition
   * const product = await resource.getFromPartition({
   *   id: 'product-456',
   *   partitionName: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async getFromPartition({ id, partitionName, partitionValues = {} }) {
    if (!this.config.partitions || !this.config.partitions[partitionName]) {
      throw new Error(`Partition '${partitionName}' not found`);
    }
    
    const partition = this.config.partitions[partitionName];

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

/**
 * Validate Resource configuration object
 * @param {Object} config - Configuration object to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
function validateResourceConfig(config) {
  const errors = [];
  
  // Validate required fields
  if (!config.name) {
    errors.push("Resource 'name' is required");
  } else if (typeof config.name !== 'string') {
    errors.push("Resource 'name' must be a string");
  } else if (config.name.trim() === '') {
    errors.push("Resource 'name' cannot be empty");
  }
  
  if (!config.client) {
    errors.push("S3 'client' is required");
  }
  
  // Validate attributes
  if (!config.attributes) {
    errors.push("Resource 'attributes' are required");
  } else if (typeof config.attributes !== 'object' || Array.isArray(config.attributes)) {
    errors.push("Resource 'attributes' must be an object");
  } else if (Object.keys(config.attributes).length === 0) {
    errors.push("Resource 'attributes' cannot be empty");
  }
  
  // Validate optional fields with type checking
  if (config.version !== undefined && typeof config.version !== 'string') {
    errors.push("Resource 'version' must be a string");
  }
  
  if (config.behavior !== undefined && typeof config.behavior !== 'string') {
    errors.push("Resource 'behavior' must be a string");
  }
  
  if (config.passphrase !== undefined && typeof config.passphrase !== 'string') {
    errors.push("Resource 'passphrase' must be a string");
  }
  
  if (config.parallelism !== undefined) {
    if (typeof config.parallelism !== 'number' || !Number.isInteger(config.parallelism)) {
      errors.push("Resource 'parallelism' must be an integer");
    } else if (config.parallelism < 1) {
      errors.push("Resource 'parallelism' must be greater than 0");
    }
  }
  
  if (config.observers !== undefined && !Array.isArray(config.observers)) {
    errors.push("Resource 'observers' must be an array");
  }
  
  // Validate boolean fields
  const booleanFields = ['cache', 'autoDecrypt', 'timestamps', 'paranoid', 'allNestedObjectsOptional'];
  for (const field of booleanFields) {
    if (config[field] !== undefined && typeof config[field] !== 'boolean') {
      errors.push(`Resource '${field}' must be a boolean`);
    }
  }
  
  // Validate partitions
  if (config.partitions !== undefined) {
    if (typeof config.partitions !== 'object' || Array.isArray(config.partitions)) {
      errors.push("Resource 'partitions' must be an object");
    } else {
      for (const [partitionName, partitionDef] of Object.entries(config.partitions)) {
        if (typeof partitionDef !== 'object' || Array.isArray(partitionDef)) {
          errors.push(`Partition '${partitionName}' must be an object`);
        } else if (!partitionDef.fields) {
          errors.push(`Partition '${partitionName}' must have a 'fields' property`);
        } else if (typeof partitionDef.fields !== 'object' || Array.isArray(partitionDef.fields)) {
          errors.push(`Partition '${partitionName}.fields' must be an object`);
        } else {
          for (const [fieldName, fieldType] of Object.entries(partitionDef.fields)) {
            if (typeof fieldType !== 'string') {
              errors.push(`Partition '${partitionName}.fields.${fieldName}' must be a string`);
            }
          }
        }
      }
    }
  }
  
  // Validate hooks
  if (config.hooks !== undefined) {
    if (typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
      errors.push("Resource 'hooks' must be an object");
    } else {
      const validHookEvents = ['preInsert', 'afterInsert', 'preUpdate', 'afterUpdate', 'preDelete', 'afterDelete'];
      for (const [event, hooksArr] of Object.entries(config.hooks)) {
        if (!validHookEvents.includes(event)) {
          errors.push(`Invalid hook event '${event}'. Valid events: ${validHookEvents.join(', ')}`);
        } else if (!Array.isArray(hooksArr)) {
          errors.push(`Resource 'hooks.${event}' must be an array`);
        } else {
          for (let i = 0; i < hooksArr.length; i++) {
            const hook = hooksArr[i];
            // Only validate user-provided hooks for being functions
            if (typeof hook !== 'function') {
              // If the hook is a string (e.g., a placeholder or reference), skip error
              if (typeof hook === 'string') continue;
              // If the hook is not a function or string, skip error (system/plugin hooks)
              continue;
            }
          }
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export default Resource;
