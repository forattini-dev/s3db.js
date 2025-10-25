import { join } from "path";
import { createHash } from "crypto";
import AsyncEventEmitter from "./concerns/async-event-emitter.js";
import { customAlphabet, urlAlphabet } from 'nanoid';
import jsonStableStringify from "json-stable-stringify";
import { PromisePool } from "@supercharge/promise-pool";
import { chunk, cloneDeep, merge, isEmpty, isObject } from "lodash-es";

import Schema from "./schema.class.js";
import { ValidatorManager } from "./validator.class.js";
import { streamToString } from "./stream/index.js";
import tryFn, { tryFnSync } from "./concerns/try-fn.js";
import { ResourceReader, ResourceWriter } from "./stream/index.js"
import { getBehavior, DEFAULT_BEHAVIOR } from "./behaviors/index.js";
import { idGenerator as defaultIdGenerator } from "./concerns/id.js";
import { calculateTotalSize, calculateEffectiveLimit } from "./concerns/calculator.js";
import { mapAwsError, InvalidResourceItem, ResourceError, PartitionError, ValidationError } from "./errors.js";


export class Resource extends AsyncEventEmitter {
  /**
   * Create a new Resource instance
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.client - S3 client instance
   * @param {string} [config.version='v1'] - Resource version
   * @param {Object} [config.attributes={}] - Resource attributes schema
   * @param {string} [config.behavior='user-managed'] - Resource behavior strategy
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
   * @param {Function} [config.idGenerator] - Custom ID generator function
   * @param {number} [config.idSize=22] - Size for auto-generated IDs
   * @param {boolean} [config.versioningEnabled=false] - Enable versioning for this resource
   * @param {Object} [config.events={}] - Event listeners to automatically add
   * @param {boolean} [config.asyncEvents=true] - Whether events should be emitted asynchronously
   * @example
   * const users = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: {
   *     name: 'string|required',
   *     email: 'string|required',
   *     password: 'secret|required'
   *   },
   *   behavior: 'user-managed',
   *   passphrase: 'my-secret-key',
   *   timestamps: true,
   *   partitions: {
   *     byRegion: {
   *       fields: { region: 'string' }
   *     }
   *   },
   *   hooks: {
   *     beforeInsert: [async (data) => {
      *       return data;
   *     }]
   *   },
   *   events: {
   *     insert: (ev) => console.log('Inserted:', ev.id),
   *     update: [
   *       (ev) => console.warn('Update detected'),
   *       (ev) => console.log('Updated:', ev.id)
   *     ],
   *     delete: (ev) => console.log('Deleted:', ev.id)
   *   }
   * });
   * 
   * // With custom ID size
   * const shortIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idSize: 8 // Generate 8-character IDs
   * });
   * 
   * // With custom ID generator function
   * const customIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idGenerator: () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
   * });
   * 
   * // With custom ID generator using size parameter
   * const longIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idGenerator: 32 // Generate 32-character IDs (same as idSize: 32)
   * });
   */
  constructor(config = {}) {
    super();
    this._instanceId = defaultIdGenerator(7);

    // Validate configuration
    const validation = validateResourceConfig(config);
    if (!validation.isValid) {
      const errorDetails = validation.errors.map(err => `  • ${err}`).join('\n');
      throw new ResourceError(
        `Invalid Resource ${config.name || '[unnamed]'} configuration:\n${errorDetails}`, 
        { 
          resourceName: config.name, 
          validation: validation.errors, 
        }
      );
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
      hooks = {},
      idGenerator: customIdGenerator,
      idSize = 22,
      versioningEnabled = false,
      strictValidation = true,
      events = {},
      asyncEvents = true,
      asyncPartitions = true,
      strictPartitions = false,
      createdBy = 'user'
    } = config;

    // Set instance properties
    this.name = name;
    this.client = client;
    this.version = version;
    this.behavior = behavior;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? 'secret';
    this.versioningEnabled = versioningEnabled;
    this.strictValidation = strictValidation;
    
    // Configure async events mode
    this.setAsyncMode(asyncEvents);

    // Configure ID generator
    this.idGenerator = this.configureIdGenerator(customIdGenerator, idSize);
    
    // Store ID configuration for persistence
    // If customIdGenerator is a number, use it as idSize
    // Otherwise, use the provided idSize or default to 22
    if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
      this.idSize = customIdGenerator;
    } else if (typeof idSize === 'number' && idSize > 0) {
      this.idSize = idSize;
    } else {
      this.idSize = 22;
    }
    
    this.idGeneratorType = this.getIdGeneratorType(customIdGenerator, this.idSize);

    // Store configuration - all at root level
    this.config = {
      cache,
      hooks,
      paranoid,
      timestamps,
      partitions,
      autoDecrypt,
      allNestedObjectsOptional,
      asyncEvents,
      asyncPartitions,
      strictPartitions,
      createdBy,
    };

    // Initialize hooks system - expanded to cover ALL methods
    this.hooks = {
      // Insert hooks
      beforeInsert: [],
      afterInsert: [],

      // Update hooks
      beforeUpdate: [],
      afterUpdate: [],

      // Delete hooks
      beforeDelete: [],
      afterDelete: [],

      // Get hooks
      beforeGet: [],
      afterGet: [],

      // List hooks
      beforeList: [],
      afterList: [],

      // Query hooks
      beforeQuery: [],
      afterQuery: [],

      // Patch hooks
      beforePatch: [],
      afterPatch: [],

      // Replace hooks
      beforeReplace: [],
      afterReplace: [],

      // Exists hooks
      beforeExists: [],
      afterExists: [],

      // Count hooks
      beforeCount: [],
      afterCount: [],

      // GetMany hooks
      beforeGetMany: [],
      afterGetMany: [],

      // DeleteMany hooks
      beforeDeleteMany: [],
      afterDeleteMany: []
    };

    // Store attributes
    this.attributes = attributes || {};

    // Store map before applying configuration
    this.map = config.map;

    // Apply configuration settings (timestamps, partitions, hooks)
    this.applyConfiguration({ map: this.map });

    // Merge user-provided hooks (added last, after internal hooks)
    if (hooks) {
      for (const [event, hooksArr] of Object.entries(hooks)) {
        if (Array.isArray(hooksArr) && this.hooks[event]) {
          for (const fn of hooksArr) {
            if (typeof fn === 'function') {
              this.hooks[event].push(fn.bind(this));
            }
            // If not a function, ignore silently
          }
        }
      }
    }

    // Setup event listeners
    if (events && Object.keys(events).length > 0) {
      for (const [eventName, listeners] of Object.entries(events)) {
        if (Array.isArray(listeners)) {
          // Multiple listeners for this event
          for (const listener of listeners) {
            if (typeof listener === 'function') {
              // Bind listener to resource context so it has access to this.database
              this.on(eventName, listener.bind(this));
            }
          }
        } else if (typeof listeners === 'function') {
          // Single listener for this event
          // Bind listener to resource context so it has access to this.database
          this.on(eventName, listeners.bind(this));
        }
      }
    }

    // --- MIDDLEWARE SYSTEM ---
    this._initMiddleware();
    // Debug: print method names and typeof update at construction
    const ownProps = Object.getOwnPropertyNames(this);
    const proto = Object.getPrototypeOf(this);
    const protoProps = Object.getOwnPropertyNames(proto);
  }

  /**
   * Configure ID generator based on provided options
   * @param {Function|number} customIdGenerator - Custom ID generator function or size
   * @param {number} idSize - Size for auto-generated IDs
   * @returns {Function} Configured ID generator function
   * @private
   */
  configureIdGenerator(customIdGenerator, idSize) {
    // If a custom function is provided, wrap it to ensure string output
    if (typeof customIdGenerator === 'function') {
      return () => String(customIdGenerator());
    }
    // If customIdGenerator is a number (size), create a generator with that size
    if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
      return customAlphabet(urlAlphabet, customIdGenerator);
    }
    // If idSize is provided, create a generator with that size
    if (typeof idSize === 'number' && idSize > 0 && idSize !== 22) {
      return customAlphabet(urlAlphabet, idSize);
    }
    // Default to the standard idGenerator (22 chars)
    return defaultIdGenerator;
  }

  /**
   * Get a serializable representation of the ID generator type
   * @param {Function|number} customIdGenerator - Custom ID generator function or size
   * @param {number} idSize - Size for auto-generated IDs
   * @returns {string|number} Serializable ID generator type
   * @private
   */
  getIdGeneratorType(customIdGenerator, idSize) {
    // If a custom function is provided
    if (typeof customIdGenerator === 'function') {
      return 'custom_function';
    }
    // For number generators or default size, return the actual idSize
    return idSize;
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
    exported.map = this.map;
    return exported;
  }

  /**
   * Apply configuration settings (timestamps, partitions, hooks)
   * This method ensures that all configuration-dependent features are properly set up
   */
  applyConfiguration({ map } = {}) {
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

    // Add automatic "byVersion" partition if versioning is enabled
    if (this.versioningEnabled) {
      if (!this.config.partitions.byVersion) {
        this.config.partitions.byVersion = {
          fields: {
            _v: 'string'
          }
        };
      }
    }

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
      map: map || this.map
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
    // Don't pass old map - let it regenerate with new attributes
    this.applyConfiguration();

    return { oldAttributes, newAttributes };
  }

  /**
   * Add a plugin-created attribute to the resource schema
   * This ensures plugin attributes don't interfere with user-defined attributes
   * by using a separate mapping namespace (p0, p1, p2, ...)
   *
   * @param {string} name - Attribute name (e.g., '_hasEmbedding', 'clusterId')
   * @param {Object|string} definition - Attribute definition
   * @param {string} pluginName - Name of plugin adding the attribute
   * @returns {void}
   *
   * @example
   * // VectorPlugin adding tracking field
   * resource.addPluginAttribute('_hasEmbedding', {
   *   type: 'boolean',
   *   optional: true,
   *   default: false
   * }, 'VectorPlugin');
   *
   * // Shorthand notation
   * resource.addPluginAttribute('clusterId', 'string|optional', 'VectorPlugin');
   */
  addPluginAttribute(name, definition, pluginName) {
    if (!pluginName) {
      throw new ResourceError(
        'Plugin name is required when adding plugin attributes',
        { resource: this.name, attribute: name }
      );
    }

    // If attribute already exists and is not a plugin attribute, throw error
    const existingDef = this.schema.getAttributeDefinition(name);
    if (existingDef && (!existingDef.__plugin__ || existingDef.__plugin__ !== pluginName)) {
      throw new ResourceError(
        `Attribute '${name}' already exists and is not from plugin '${pluginName}'`,
        { resource: this.name, attribute: name, plugin: pluginName }
      );
    }

    // Use the definition as-is (string or object)
    // The schema preprocessor will handle string notation validation
    let defObject = definition;
    if (typeof definition === 'object' && definition !== null) {
      // Clone to avoid mutation
      defObject = { ...definition };
    }

    // Mark as plugin-created with metadata
    // For string definitions, we need to preserve them but track plugin ownership separately
    if (typeof defObject === 'object' && defObject !== null) {
      defObject.__plugin__ = pluginName;
      defObject.__pluginCreated__ = Date.now();
    }

    // Add to schema attributes
    // Store original definition (string or object) as the validator expects
    this.schema.attributes[name] = defObject;

    // Also update resource.attributes to keep them in sync
    this.attributes[name] = defObject;

    // For string definitions, add metadata separately
    if (typeof defObject === 'string') {
      // Create a marker object to track plugin ownership in a parallel structure
      if (!this.schema._pluginAttributeMetadata) {
        this.schema._pluginAttributeMetadata = {};
      }
      this.schema._pluginAttributeMetadata[name] = {
        __plugin__: pluginName,
        __pluginCreated__: Date.now()
      };
    }

    // Regenerate plugin mapping only (not user mapping)
    this.schema.regeneratePluginMapping();

    // Regenerate hooks for the new attribute
    if (this.schema.options.generateAutoHooks) {
      this.schema.generateAutoHooks();
    }

    // Recompile validator to include new attribute
    const processedAttributes = this.schema.preprocessAttributesForValidation(this.schema.attributes);
    this.schema.validator = new ValidatorManager({ autoEncrypt: false }).compile(merge(
      { $$async: true, $$strict: false },
      processedAttributes
    ));

    // Emit event
    if (this.database) {
      this.database.emit('plugin-attribute-added', {
        resource: this.name,
        attribute: name,
        plugin: pluginName,
        definition: defObject
      });
    }
  }

  /**
   * Remove a plugin-created attribute from the resource schema
   * Called when a plugin is uninstalled or no longer needs the attribute
   *
   * @param {string} name - Attribute name to remove
   * @param {string} [pluginName] - Optional plugin name for safety check
   * @returns {boolean} True if attribute was removed, false if not found
   *
   * @example
   * resource.removePluginAttribute('_hasEmbedding', 'VectorPlugin');
   */
  removePluginAttribute(name, pluginName = null) {
    const attrDef = this.schema.getAttributeDefinition(name);

    // Check metadata for string definitions
    const metadata = this.schema._pluginAttributeMetadata?.[name];
    const isPluginAttr = (typeof attrDef === 'object' && attrDef?.__plugin__) || metadata;

    // Check if attribute exists and is a plugin attribute
    if (!attrDef || !isPluginAttr) {
      return false;
    }

    // Get plugin name from either object or metadata
    const actualPlugin = attrDef?.__plugin__ || metadata?.__plugin__;

    // Safety check: if pluginName provided, ensure it matches
    if (pluginName && actualPlugin !== pluginName) {
      throw new ResourceError(
        `Attribute '${name}' belongs to plugin '${actualPlugin}', not '${pluginName}'`,
        { resource: this.name, attribute: name, actualPlugin, requestedPlugin: pluginName }
      );
    }

    // Remove from schema
    delete this.schema.attributes[name];

    // Also remove from resource.attributes to keep them in sync
    delete this.attributes[name];

    // Remove metadata if it exists
    if (this.schema._pluginAttributeMetadata?.[name]) {
      delete this.schema._pluginAttributeMetadata[name];
    }

    // Regenerate plugin mapping
    this.schema.regeneratePluginMapping();

    // Emit event
    if (this.database) {
      this.database.emit('plugin-attribute-removed', {
        resource: this.name,
        attribute: name,
        plugin: actualPlugin
      });
    }

    return true;
  }

  /**
   * Add a hook function for a specific event
   * @param {string} event - Hook event (beforeInsert, afterInsert, etc.)
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

  /**
   * Validate data against resource schema without saving
   * @param {Object} data - Data to validate
   * @param {Object} options - Validation options
   * @param {boolean} options.throwOnError - Throw error if validation fails (default: false)
   * @param {boolean} options.includeId - Include ID validation (default: false)
   * @param {boolean} options.mutateOriginal - Allow mutation of original data (default: false)
   * @returns {Promise<{valid: boolean, isValid: boolean, errors: Array, data: Object, original: Object}>} Validation result
   * @example
   * // Validate before insert
   * const result = await resource.validate({
   *   name: 'John Doe',
   *   email: 'invalid-email' // Will fail email validation
   * });
   *
   * if (!result.valid) {
   *   console.log('Validation errors:', result.errors);
   *   // [{ field: 'email', message: '...', ... }]
   * }
   *
   * // Throw on error
   * try {
   *   await resource.validate({ email: 'bad' }, { throwOnError: true });
   * } catch (err) {
   *   console.log('Validation failed:', err.message);
   * }
   */
  async validate(data, options = {}) {
    const {
      throwOnError = false,
      includeId = false,
      mutateOriginal = false
    } = options;

    // Clone data to avoid mutation (unless mutateOriginal is true)
    const dataToValidate = mutateOriginal ? data : cloneDeep(data);

    // If includeId is false, remove id from validation
    if (!includeId && dataToValidate.id) {
      delete dataToValidate.id;
    }

    const result = {
      original: cloneDeep(data),
      isValid: false,
      errors: [],
      data: dataToValidate
    };

    try {
      const check = await this.schema.validate(dataToValidate, { mutateOriginal });

      if (check === true) {
        result.isValid = true;
      } else {
        result.errors = Array.isArray(check) ? check : [check];
        result.isValid = false;

        if (throwOnError) {
          const error = new Error('Validation failed');
          error.validationErrors = result.errors;
          error.invalidData = data;
          throw error;
        }
      }
    } catch (err) {
      // If schema.validate threw, and we're not in throwOnError mode, catch and return result
      if (!throwOnError) {
        result.errors = [{ message: err.message, error: err }];
        result.isValid = false;
      } else {
        throw err;
      }
    }

    return result;
  }

  /**
   * Validate that all partition fields exist in current resource attributes
   * @throws {Error} If partition fields don't exist in current schema (only when strictValidation is true)
   */
  validatePartitions() {
    // Skip validation if strictValidation is disabled
    if (!this.strictValidation) {
      return;
    }

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
          throw new PartitionError(`Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource attributes. Available fields: ${currentAttributes.join(', ')}.`, { resourceName: this.name, partitionName, fieldName, availableFields: currentAttributes, operation: 'validatePartitions' });
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
    // Allow system metadata fields (those starting with _)
    if (fieldName.startsWith('_')) {
      return true;
    }

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
   * Find orphaned partitions (partitions that reference non-existent fields)
   * @returns {Object} Object with orphaned partition names as keys and details as values
   * @example
   * const orphaned = resource.findOrphanedPartitions();
   * // Returns: { byRegion: { missingFields: ['region'], definition: {...} } }
   */
  findOrphanedPartitions() {
    const orphaned = {};

    if (!this.config.partitions) {
      return orphaned;
    }

    for (const [partitionName, partitionDef] of Object.entries(this.config.partitions)) {
      if (!partitionDef.fields) {
        continue;
      }

      const missingFields = [];
      for (const fieldName of Object.keys(partitionDef.fields)) {
        if (!this.fieldExistsInAttributes(fieldName)) {
          missingFields.push(fieldName);
        }
      }

      if (missingFields.length > 0) {
        orphaned[partitionName] = {
          missingFields,
          definition: partitionDef,
          allFields: Object.keys(partitionDef.fields)
        };
      }
    }

    return orphaned;
  }

  /**
   * Remove orphaned partitions (partitions that reference non-existent fields)
   * WARNING: This will modify the resource configuration and should be followed by uploadMetadataFile()
   * @param {Object} options - Options
   * @param {boolean} options.dryRun - If true, only returns what would be removed without modifying (default: false)
   * @returns {Object} Object with removed partition names and details
   * @example
   * // Dry run to see what would be removed
   * const toRemove = resource.removeOrphanedPartitions({ dryRun: true });
   * console.log('Would remove:', toRemove);
   *
   * // Actually remove orphaned partitions
   * const removed = resource.removeOrphanedPartitions();
   * await database.uploadMetadataFile(); // Save changes to S3
   */
  removeOrphanedPartitions({ dryRun = false } = {}) {
    const orphaned = this.findOrphanedPartitions();

    if (Object.keys(orphaned).length === 0) {
      return {};
    }

    if (dryRun) {
      return orphaned;
    }

    // Remove orphaned partitions from config
    for (const partitionName of Object.keys(orphaned)) {
      delete this.config.partitions[partitionName];
    }

    // Emit event for tracking
    this.emit('orphanedPartitionsRemoved', {
      resourceName: this.name,
      removed: Object.keys(orphaned),
      details: orphaned
    });

    return orphaned;
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
        // Handle ISO8601 timestamp strings (e.g., from timestamps)
        if (transformedValue.includes('T') && transformedValue.includes('Z')) {
          transformedValue = transformedValue.split('T')[0]; // Extract date part from ISO8601
        } else {
          // Try to parse as date
          const date = new Date(transformedValue);
          if (!isNaN(date.getTime())) {
            transformedValue = date.toISOString().split('T')[0];
          }
          // If parsing fails, keep original value
        }
      }
    }

    return transformedValue;
  }

  /**
   * Get the main resource key (new format without version in path)
   * @param {string} id - Resource ID
   * @returns {string} The main S3 key path
   */
  getResourceKey(id) {
    const key = join('resource=' + this.name, 'data', `id=${id}`);
    // eslint-disable-next-line no-console
    return key;
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
      throw new PartitionError(`Partition '${partitionName}' not found`, { resourceName: this.name, partitionName, operation: 'getPartitionKey' });
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

    // Ensure id is never undefined
    const finalId = id || data?.id;
    if (!finalId) {
      return null; // Cannot create partition key without id
    }

    return join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${finalId}`);
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
   * Calculate estimated content length for body data
   * @param {string|Buffer} body - Body content
   * @returns {number} Estimated content length in bytes
   */
  calculateContentLength(body) {
    if (!body) return 0;
    if (Buffer.isBuffer(body)) return body.length;
    if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
    if (typeof body === 'object') return Buffer.byteLength(JSON.stringify(body), 'utf8');
    return Buffer.byteLength(String(body), 'utf8');
  }

  /**
   * Emit events with backward compatibility support
   * Emits both new standardized events and old deprecated events
   *
   * @private
   * @param {string} oldEvent - Old event name (deprecated)
   * @param {string} newEvent - New standardized event name
   * @param {Object} payload - Event payload
   * @param {string} [id] - Optional ID for ID-specific events
   */
  _emitWithDeprecation(oldEvent, newEvent, payload, id = null) {
    // Emit new standardized event
    this.emit(newEvent, payload);

    // Emit ID-specific event if ID provided
    if (id) {
      this.emit(`${newEvent}:${id}`, payload);
    }

    // Emit old event with deprecation warning if anyone is listening
    if (this.listenerCount(oldEvent) > 0) {
      console.warn(
        `[s3db.js] Event "${oldEvent}" is deprecated and will be removed in v14.0.0. ` +
        `Use "${newEvent}" instead.` +
        (id ? ` ID-specific events are also available: "${newEvent}:${id}"` : '')
      );
      this.emit(oldEvent, payload);
    }
  }

  /**
   * Insert a new resource object
   * @param {Object} attributes - Resource attributes
   * @param {string} [attributes.id] - Custom ID (optional, auto-generated if not provided)
   * @returns {Promise<Object>} The created resource object with all attributes
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
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   */
  async insert({ id, ...attributes }) {
    const exists = await this.exists(id);
    if (exists) throw new Error(`Resource with id '${id}' already exists`);
    const keyDebug = this.getResourceKey(id || '(auto)');
    if (this.config.timestamps) {
      attributes.createdAt = new Date().toISOString();
      attributes.updatedAt = new Date().toISOString();
    }

    // Aplica defaults antes de tudo
    const attributesWithDefaults = this.applyDefaults(attributes);
    // Reconstruct the complete data for validation
    // Only include id if it's defined (not undefined)
    const completeData = id !== undefined
      ? { id, ...attributesWithDefaults }
      : { ...attributesWithDefaults };

    // Execute beforeInsert hooks
    const preProcessedData = await this.executeHooks('beforeInsert', completeData);

    // Capture extra properties added by beforeInsert
    const extraProps = Object.keys(preProcessedData).filter(
      k => !(k in completeData) || preProcessedData[k] !== completeData[k]
    );
    const extraData = {};
    for (const k of extraProps) extraData[k] = preProcessedData[k];

    const {
      errors,
      isValid,
      data: validated,
    } = await this.validate(preProcessedData, { includeId: true });

    if (!isValid) {
      const errorMsg = (errors && errors.length && errors[0].message) ? errors[0].message : 'Insert failed';
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors,
        message: errorMsg
      })
    }

    // Extract id and attributes from validated data
    const { id: validatedId, ...validatedAttributes } = validated;
    // Reinjetar propriedades extras do beforeInsert
    Object.assign(validatedAttributes, extraData);
    
    // Generate ID with fallback for empty generators
    let finalId = validatedId || id;
    if (!finalId) {
      finalId = this.idGenerator();
      // Fallback to default generator if custom generator returns empty
      if (!finalId || finalId.trim() === '') {
        const { idGenerator } = await import('#src/concerns/id.js');
        finalId = idGenerator();
      }
    }

    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);

    // Apply behavior strategy
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this,
      data: validatedAttributes,
      mappedData,
      originalData: completeData
    });

    // Add version metadata (required for all objects)
    const finalMetadata = processedMetadata;
    const key = this.getResourceKey(finalId);
    // Determine content type based on body content
    let contentType = undefined;
    if (body && body !== "") {
      const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = 'application/json';
    }
    // LOG: body e contentType antes do putObject
    // Only throw if behavior is 'body-only' and body is empty
    if (this.behavior === 'body-only' && (!body || body === "")) {
      throw new Error(`[Resource.insert] Attempt to save object without body! Data: id=${finalId}, resource=${this.name}`);
    }
    // For other behaviors, allow empty body (all data in metadata)

    const [okPut, errPut, putResult] = await tryFn(() => this.client.putObject({
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
        errPut.totalSize = totalSize;
        errPut.limit = 2047;
        errPut.effectiveLimit = effectiveLimit;
        errPut.excess = excess;
        throw new ResourceError('metadata headers exceed', { resourceName: this.name, operation: 'insert', id: finalId, totalSize, effectiveLimit, excess, suggestion: 'Reduce metadata size or number of fields.' });
      }
      throw errPut;
    }

    // Get the inserted object
    const insertedObject = await this.get(finalId);

    // Handle partition indexing based on strictPartitions and asyncPartitions config
    if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      if (this.config.strictPartitions) {
        // Strict mode: await partition operations synchronously and throw on error
        await this.createPartitionReferences(insertedObject);
      } else if (this.config.asyncPartitions) {
        // Async mode: create partition indexes in background
        setImmediate(() => {
          this.createPartitionReferences(insertedObject).catch(err => {
            this.emit('partitionIndexError', {
              operation: 'insert',
              id: finalId,
              error: err,
              message: err.message
            });
          });
        });
      } else {
        // Sync mode (default): await partition operations synchronously but emit error instead of throwing
        const [ok, err] = await tryFn(() => this.createPartitionReferences(insertedObject));
        if (!ok) {
          this.emit('partitionIndexError', {
            operation: 'insert',
            id: finalId,
            error: err,
            message: err.message
          });
        }
      }

      // Execute other afterInsert hooks synchronously (excluding partition hook)
      const nonPartitionHooks = this.hooks.afterInsert.filter(hook =>
        !hook.toString().includes('createPartitionReferences')
      );
      let finalResult = insertedObject;
      for (const hook of nonPartitionHooks) {
        finalResult = await hook(finalResult);
      }

      // Emit insert event with standardized naming
      this._emitWithDeprecation('insert', 'inserted', finalResult, finalResult?.id || insertedObject?.id);
      return finalResult;
    } else {
      // Sync mode: execute all hooks including partition creation
      const finalResult = await this.executeHooks('afterInsert', insertedObject);

      // Emit insert event with standardized naming
      this._emitWithDeprecation('insert', 'inserted', finalResult, finalResult?.id || insertedObject?.id);

      // Return the final object
      return finalResult;
    }
  }

  /**
   * Retrieve a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object with all attributes and metadata
   * @example
   * const user = await resource.get('user-123');
   */
  async get(id) {
    if (isObject(id)) throw new Error(`id cannot be an object`);
    if (isEmpty(id)) throw new Error('id cannot be empty');

    // Execute beforeGet hooks
    await this.executeHooks('beforeGet', { id });

    const key = this.getResourceKey(id);
    // LOG: start of get
    // eslint-disable-next-line no-console
    const [ok, err, request] = await tryFn(() => this.client.getObject(key));
    // LOG: resultado do headObject
    // eslint-disable-next-line no-console
    if (!ok) {
      throw mapAwsError(err, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: 'get',
        id
      });
    }
    // NOTE: ContentLength === 0 is valid for objects with data in metadata only
    // (removed validation that threw NoSuchKey for empty body objects)

    // Get the correct schema version for unmapping (from _v metadata)
    const objectVersionRaw = request.Metadata?._v || this.version;
    const objectVersion = typeof objectVersionRaw === 'string' && objectVersionRaw.startsWith('v') ? objectVersionRaw.slice(1) : objectVersionRaw;
    const schema = await this.getSchemaForVersion(objectVersion);

    let metadata = await schema.unmapper(request.Metadata);

    // Apply behavior strategy for reading (important for body-overflow)
    const behaviorImpl = getBehavior(this.behavior);
    let body = "";

    // Get body content if needed (for body-overflow behavior)
    if (request.ContentLength > 0) {
      const [okBody, errBody, fullObject] = await tryFn(() => this.client.getObject(key));
      if (okBody) {
        body = await streamToString(fullObject.Body);
      } else {
        // Body read failed, continue with metadata only
        body = "";
      }
    }

    const { metadata: processedMetadata } = await behaviorImpl.handleGet({
      resource: this,
      metadata,
      body
    });

    // Use composeFullObjectFromWrite to ensure proper field preservation
    let data = await this.composeFullObjectFromWrite({
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

    // Add version info to returned data

    if (request.VersionId) data._versionId = request.VersionId;
    if (request.Expiration) data._expiresAt = request.Expiration;

    data._definitionHash = this.getDefinitionHash();

    // Apply version mapping if object is from a different version
    if (objectVersion !== this.version) {
      data = await this.applyVersionMapping(data, objectVersion, this.version);
    }

    // Execute afterGet hooks
    data = await this.executeHooks('afterGet', data);

    this._emitWithDeprecation("get", "fetched", data, data.id);
    const value = data;
    return value;
  }

  /**
   * Retrieve a resource object by ID, or return null if not found
   * @param {string} id - Resource ID
   * @returns {Promise<Object|null>} The resource object or null if not found
   * @example
   * const user = await resource.getOrNull('user-123');
   * if (user) {
   *   console.log('Found user:', user.name);
   * } else {
   *   console.log('User not found');
   * }
   */
  async getOrNull(id) {
    const [ok, err, data] = await tryFn(() => this.get(id));

    // Check if error is NoSuchKey (resource doesn't exist)
    if (!ok && err && (err.name === 'NoSuchKey' || err.message?.includes('NoSuchKey'))) {
      return null;
    }

    // Re-throw other errors (permission denied, network issues, etc.)
    if (!ok) {
      throw err;
    }

    return data;
  }

  /**
   * Retrieve a resource object by ID, or throw ResourceNotFoundError if not found
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object
   * @throws {ResourceError} If resource does not exist
   * @example
   * // Throws error if user doesn't exist (no need for null check)
   * const user = await resource.getOrThrow('user-123');
   * console.log('User name:', user.name); // Safe to access
   */
  async getOrThrow(id) {
    const [ok, err, data] = await tryFn(() => this.get(id));

    // Check if error is NoSuchKey (resource doesn't exist)
    if (!ok && err && (err.name === 'NoSuchKey' || err.message?.includes('NoSuchKey'))) {
      throw new ResourceError(`Resource '${this.name}' with id '${id}' not found`, {
        resourceName: this.name,
        operation: 'getOrThrow',
        id,
        code: 'RESOURCE_NOT_FOUND'
      });
    }

    // Re-throw other errors (permission denied, network issues, etc.)
    if (!ok) {
      throw err;
    }

    return data;
  }

  /**
   * Check if a resource exists by ID
   * @returns {Promise<boolean>} True if resource exists, false otherwise
   */
  async exists(id) {
    // Execute beforeExists hooks
    await this.executeHooks('beforeExists', { id });

    const key = this.getResourceKey(id);
    const [ok, err] = await tryFn(() => this.client.headObject(key));

    // Execute afterExists hooks
    await this.executeHooks('afterExists', { id, exists: ok });

    return ok;
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
      */
  async update(id, attributes) {
    if (isEmpty(id)) {
      throw new Error('id cannot be empty');
    }
    // Garante que o recurso existe antes de atualizar
    const exists = await this.exists(id);
    if (!exists) {
      throw new Error(`Resource with id '${id}' does not exist`);
    }
    const originalData = await this.get(id);
    const attributesClone = cloneDeep(attributes);
    let mergedData = cloneDeep(originalData);
    for (const [key, value] of Object.entries(attributesClone)) {
      if (key.includes('.')) {
        let ref = mergedData;
        const parts = key.split('.');
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof ref[parts[i]] !== 'object' || ref[parts[i]] === null) {
            ref[parts[i]] = {};
          }
          ref = ref[parts[i]];
        }
        ref[parts[parts.length - 1]] = cloneDeep(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        mergedData[key] = merge({}, mergedData[key], value);
      } else {
        mergedData[key] = cloneDeep(value);
      }
    }
    // Debug: print mergedData and attributes
    if (this.config.timestamps) {
      const now = new Date().toISOString();
      mergedData.updatedAt = now;
      if (!mergedData.metadata) mergedData.metadata = {};
      mergedData.metadata.updatedAt = now;
    }
    const preProcessedData = await this.executeHooks('beforeUpdate', cloneDeep(mergedData));
    const completeData = { ...originalData, ...preProcessedData, id };
    const { isValid, errors, data } = await this.validate(cloneDeep(completeData), { includeId: true });
    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors,
        message: 'validation: ' + ((errors && errors.length) ? JSON.stringify(errors) : 'unknown')
      });
    }
    const mappedDataDebug = await this.schema.mapper(data);
    const earlyBehaviorImpl = getBehavior(this.behavior);
    const tempMappedData = await this.schema.mapper({ ...originalData, ...preProcessedData });
    tempMappedData._v = String(this.version);
    await earlyBehaviorImpl.handleUpdate({
      resource: this,
      id,
      data: { ...originalData, ...preProcessedData },
      mappedData: tempMappedData,
      originalData: { ...attributesClone, id }
    });
    const { id: validatedId, ...validatedAttributes } = data;
    const oldData = { ...originalData, id };
    const newData = { ...validatedAttributes, id };
    await this.handlePartitionReferenceUpdates(oldData, newData);
    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
      resource: this,
      id,
      data: validatedAttributes,
      mappedData,
      originalData: { ...attributesClone, id }
    });
    const finalMetadata = processedMetadata;
    const key = this.getResourceKey(id);
    // eslint-disable-next-line no-console
    let existingContentType = undefined;
    let finalBody = body;
    if (body === "" && this.behavior !== 'body-overflow') {
      // eslint-disable-next-line no-console
      const [ok, err, existingObject] = await tryFn(() => this.client.getObject(key));
      // eslint-disable-next-line no-console
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
    if (this.versioningEnabled && originalData._v !== this.version) {
      await this.createHistoricalVersion(id, originalData);
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
      err.totalSize = totalSize;
      err.limit = 2047;
      err.effectiveLimit = effectiveLimit;
      err.excess = excess;
      this.emit('exceedsLimit', {
        operation: 'update',
        totalSize,
        limit: 2047,
        effectiveLimit,
        excess,
        data: validatedAttributes
      });
      throw new ResourceError('metadata headers exceed', { resourceName: this.name, operation: 'update', id, totalSize, effectiveLimit, excess, suggestion: 'Reduce metadata size or number of fields.' });
    } else if (!ok) {
      throw mapAwsError(err, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: 'update',
        id
      });
    }
    const updatedData = await this.composeFullObjectFromWrite({
      id,
      metadata: finalMetadata,
      body: finalBody,
      behavior: this.behavior
    });
    
    // Handle partition updates based on strictPartitions and asyncPartitions config
    if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      if (this.config.strictPartitions) {
        // Strict mode: await partition operations synchronously and throw on error
        await this.handlePartitionReferenceUpdates(originalData, updatedData);
      } else if (this.config.asyncPartitions) {
        // Async mode: update partition indexes in background
        setImmediate(() => {
          this.handlePartitionReferenceUpdates(originalData, updatedData).catch(err => {
            this.emit('partitionIndexError', {
              operation: 'update',
              id,
              error: err,
              message: err.message
            });
          });
        });
      } else {
        // Sync mode (default): await partition operations synchronously but emit error instead of throwing
        const [ok, err] = await tryFn(() => this.handlePartitionReferenceUpdates(originalData, updatedData));
        if (!ok) {
          this.emit('partitionIndexError', {
            operation: 'update',
            id,
            error: err,
            message: err.message
          });
        }
      }

      // Execute other afterUpdate hooks synchronously (excluding partition hook)
      const nonPartitionHooks = this.hooks.afterUpdate.filter(hook =>
        !hook.toString().includes('handlePartitionReferenceUpdates')
      );
      let finalResult = updatedData;
      for (const hook of nonPartitionHooks) {
        finalResult = await hook(finalResult);
      }

      this._emitWithDeprecation('update', 'updated', {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      }, updatedData.id);
      return finalResult;
    } else {
      // Sync mode: execute all hooks including partition updates
      const finalResult = await this.executeHooks('afterUpdate', updatedData);
      this._emitWithDeprecation('update', 'updated', {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      }, updatedData.id);
      return finalResult;
    }
  }

  /**
   * Patch resource (partial update optimized for metadata-only behaviors)
   *
   * This method provides an optimized update path for resources using metadata-only behaviors
   * (enforce-limits, truncate-data). It uses HeadObject + CopyObject for atomic updates without
   * body transfer, eliminating race conditions and reducing latency by ~50%.
   *
   * For behaviors that store data in body (body-overflow, body-only), it automatically falls
   * back to the standard update() method.
   *
   * @param {string} id - Resource ID
   * @param {Object} fields - Fields to update (partial data)
   * @param {Object} options - Update options
   * @param {string} options.partition - Partition name (if using partitions)
   * @param {Object} options.partitionValues - Partition values (if using partitions)
   * @returns {Promise<Object>} Updated resource data
   *
   * @example
   * // Fast atomic update (enforce-limits behavior)
   * await resource.patch('user-123', { status: 'active', loginCount: 42 });
   *
   * @example
   * // With partitions
   * await resource.patch('order-456', { status: 'shipped' }, {
   *   partition: 'byRegion',
   *   partitionValues: { region: 'US' }
   * });
   */
  async patch(id, fields, options = {}) {
    if (isEmpty(id)) {
      throw new Error('id cannot be empty');
    }

    if (!fields || typeof fields !== 'object') {
      throw new Error('fields must be a non-empty object');
    }

    // Execute beforePatch hooks
    await this.executeHooks('beforePatch', { id, fields, options });

    const behavior = this.behavior;

    // Check if fields contain dot notation (nested fields)
    const hasNestedFields = Object.keys(fields).some(key => key.includes('.'));

    let result;

    // ✅ Optimization: HEAD + COPY for metadata-only behaviors WITHOUT nested fields
    if ((behavior === 'enforce-limits' || behavior === 'truncate-data') && !hasNestedFields) {
      result = await this._patchViaCopyObject(id, fields, options);
    } else {
      // ⚠️ Fallback: GET + merge + PUT for:
      // - Behaviors with body storage
      // - Nested field updates (need full object merge)
      result = await this.update(id, fields, options);
    }

    // Execute afterPatch hooks
    const finalResult = await this.executeHooks('afterPatch', result);

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
    const key = this.getResourceKey(id);

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
    const fieldsClone = cloneDeep(fields);
    let mergedData = cloneDeep(currentData);

    for (const [key, value] of Object.entries(fieldsClone)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Merge objects
        mergedData[key] = merge({}, mergedData[key], value);
      } else {
        mergedData[key] = cloneDeep(value);
      }
    }

    // Step 4: Update timestamps
    if (this.config.timestamps) {
      mergedData.updatedAt = new Date().toISOString();
    }

    // Step 5: Validate merged data
    const validationResult = await this.schema.validate(mergedData);
    if (validationResult !== true) {
      throw new ValidationError('Validation failed during patch', validationResult);
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
        await this.handlePartitionReferenceUpdates(oldData, newData);
      } else if (this.config.asyncPartitions) {
        // Async mode: update in background
        setImmediate(() => {
          this.handlePartitionReferenceUpdates(oldData, newData).catch(err => {
            this.emit('partitionIndexError', {
              operation: 'patch',
              id,
              error: err
            });
          });
        });
      } else {
        // Sync mode: wait for completion
        await this.handlePartitionReferenceUpdates(oldData, newData);
      }
    }

    return mergedData;
  }

  /**
   * Replace resource (full object replacement without GET)
   *
   * This method performs a direct PUT operation without fetching the current object.
   * Use this when you already have the complete object and want to replace it entirely,
   * saving 1 S3 request (GET).
   *
   * ⚠️ Warning: You must provide ALL required fields. Missing fields will NOT be preserved
   * from the current object. This method does not merge with existing data.
   *
   * @param {string} id - Resource ID
   * @param {Object} fullData - Complete object data (all required fields)
   * @param {Object} options - Update options
   * @param {string} options.partition - Partition name (if using partitions)
   * @param {Object} options.partitionValues - Partition values (if using partitions)
   * @returns {Promise<Object>} Replaced resource data
   *
   * @example
   * // Replace entire object (must include ALL required fields)
   * await resource.replace('user-123', {
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   status: 'active',
   *   loginCount: 42
   * });
   *
   * @example
   * // With partitions
   * await resource.replace('order-456', fullOrderData, {
   *   partition: 'byRegion',
   *   partitionValues: { region: 'US' }
   * });
   */
  async replace(id, fullData, options = {}) {
    if (isEmpty(id)) {
      throw new Error('id cannot be empty');
    }

    if (!fullData || typeof fullData !== 'object') {
      throw new Error('fullData must be a non-empty object');
    }

    // Execute beforeReplace hooks
    await this.executeHooks('beforeReplace', { id, fullData, options });

    const { partition, partitionValues } = options;

    // Clone data to avoid mutations
    const dataClone = cloneDeep(fullData);

    // Apply defaults before timestamps
    const attributesWithDefaults = this.applyDefaults(dataClone);

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
    } = await this.validate(completeData, { includeId: true });

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
      resource: this,
      data: validatedAttributes,
      mappedData: mappedMetadata,
      originalData: completeData
    });

    // Build S3 key
    const key = this.getResourceKey(id);

    // Determine content type based on body content
    let contentType = undefined;
    if (body && body !== "") {
      const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = 'application/json';
    }

    // Only throw if behavior is 'body-only' and body is empty
    if (this.behavior === 'body-only' && (!body || body === "")) {
      throw new Error(`[Resource.replace] Attempt to save object without body! Data: id=${id}, resource=${this.name}`);
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
        await this.handlePartitionReferenceUpdates({}, replacedObject);
      } else if (this.config.asyncPartitions) {
        // Async mode: update partition indexes in background
        setImmediate(() => {
          this.handlePartitionReferenceUpdates({}, replacedObject).catch(err => {
            this.emit('partitionIndexError', {
              operation: 'replace',
              id,
              error: err
            });
          });
        });
      } else {
        // Sync mode: update partition indexes immediately
        await this.handlePartitionReferenceUpdates({}, replacedObject);
      }
    }

    // Execute afterReplace hooks
    const finalResult = await this.executeHooks('afterReplace', replacedObject);

    return finalResult;
  }

  /**
   * Update with conditional check (If-Match ETag)
   * @param {string} id - Resource ID
   * @param {Object} attributes - Attributes to update
   * @param {Object} options - Options including ifMatch (ETag)
   * @returns {Promise<Object>} { success: boolean, data?: Object, etag?: string, error?: string }
   * @example
   * const msg = await resource.get('msg-123');
   * const result = await resource.updateConditional('msg-123', { status: 'processing' }, { ifMatch: msg._etag });
   * if (!result.success) {
   *   console.log('Update failed - object was modified by another process');
   * }
   */
  async updateConditional(id, attributes, options = {}) {
    if (isEmpty(id)) {
      throw new Error('id cannot be empty');
    }

    const { ifMatch } = options;
    if (!ifMatch) {
      throw new Error('updateConditional requires ifMatch option with ETag value');
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
    const attributesClone = cloneDeep(attributes);
    let mergedData = cloneDeep(originalData);

    // Merge attributes (same logic as update)
    for (const [key, value] of Object.entries(attributesClone)) {
      if (key.includes('.')) {
        let ref = mergedData;
        const parts = key.split('.');
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof ref[parts[i]] !== 'object' || ref[parts[i]] === null) {
            ref[parts[i]] = {};
          }
          ref = ref[parts[i]];
        }
        ref[parts[parts.length - 1]] = cloneDeep(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        mergedData[key] = merge({}, mergedData[key], value);
      } else {
        mergedData[key] = cloneDeep(value);
      }
    }

    // Update timestamps if enabled
    if (this.config.timestamps) {
      const now = new Date().toISOString();
      mergedData.updatedAt = now;
      if (!mergedData.metadata) mergedData.metadata = {};
      mergedData.metadata.updatedAt = now;
    }

    // Execute beforeUpdate hooks
    const preProcessedData = await this.executeHooks('beforeUpdate', cloneDeep(mergedData));
    const completeData = { ...originalData, ...preProcessedData, id };

    // Validate
    const { isValid, errors, data } = await this.validate(cloneDeep(completeData), { includeId: true });
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
      resource: this,
      id,
      data: validatedAttributes,
      mappedData,
      originalData: { ...attributesClone, id }
    });

    const key = this.getResourceKey(id);
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
      ifMatch  // ← Conditional write with ETag
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
    const updatedData = await this.composeFullObjectFromWrite({
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
        await this.handlePartitionReferenceUpdates(oldData, newData);
      } else if (this.config.asyncPartitions) {
        // Async mode
        setImmediate(() => {
          this.handlePartitionReferenceUpdates(oldData, newData).catch(err => {
            this.emit('partitionIndexError', {
              operation: 'updateConditional',
              id,
              error: err,
              message: err.message
            });
          });
        });
      } else {
        // Sync mode (default): await partition operations synchronously but emit error instead of throwing
        const [ok, err] = await tryFn(() => this.handlePartitionReferenceUpdates(oldData, newData));
        if (!ok) {
          this.emit('partitionIndexError', {
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

      this._emitWithDeprecation('update', 'updated', {
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
      await this.handlePartitionReferenceUpdates(oldData, newData);
      const finalResult = await this.executeHooks('afterUpdate', updatedData);

      this._emitWithDeprecation('update', 'updated', {
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
   * Delete a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} S3 delete response
   * @example
   * await resource.delete('user-123');
   */
  async delete(id) {
    if (isEmpty(id)) {
      throw new Error('id cannot be empty');
    }
    
    let objectData;
    let deleteError = null;
    
    // Try to get the object data first
    const [ok, err, data] = await tryFn(() => this.get(id));
    if (ok) {
      objectData = data;
    } else {
      objectData = { id };
      deleteError = err; // Store the error for later
    }
    
    await this.executeHooks('beforeDelete', objectData);
    const key = this.getResourceKey(id);
    const [ok2, err2, response] = await tryFn(() => this.client.deleteObject(key));

    // Always emit delete event for audit purposes, even if delete fails
    this._emitWithDeprecation("delete", "deleted", {
      ...objectData,
      $before: { ...objectData },
      $after: null
    }, id);
    
    // If we had an error getting the object, throw it now (after emitting the event)
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
    
    // Handle partition cleanup based on strictPartitions and asyncPartitions config
    if (this.config.partitions && Object.keys(this.config.partitions).length > 0 && objectData) {
      if (this.config.strictPartitions) {
        // Strict mode: await partition operations synchronously and throw on error
        await this.deletePartitionReferences(objectData);
      } else if (this.config.asyncPartitions) {
        // Async mode: delete partition indexes in background
        setImmediate(() => {
          this.deletePartitionReferences(objectData).catch(err => {
            this.emit('partitionIndexError', {
              operation: 'delete',
              id,
              error: err,
              message: err.message
            });
          });
        });
      } else {
        // Sync mode (default): await partition operations synchronously but emit error instead of throwing
        const [ok, err] = await tryFn(() => this.deletePartitionReferences(objectData));
        if (!ok) {
          this.emit('partitionIndexError', {
            operation: 'delete',
            id,
            error: err,
            message: err.message
          });
        }
      }

      // Execute other afterDelete hooks synchronously (excluding partition hook)
      const nonPartitionHooks = this.hooks.afterDelete.filter(hook => 
        !hook.toString().includes('deletePartitionReferences')
      );
      let afterDeleteData = objectData;
      for (const hook of nonPartitionHooks) {
        afterDeleteData = await hook(afterDeleteData);
      }
      return response;
    } else {
      // Sync mode: execute all hooks including partition deletion
      const afterDeleteData = await this.executeHooks('afterDelete', objectData);
      return response;
    }
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
    // Execute beforeCount hooks
    await this.executeHooks('beforeCount', { partition, partitionValues });

    let prefix;

    if (partition && Object.keys(partitionValues).length > 0) {
      // Count in specific partition
      const partitionDef = this.config.partitions[partition];
      if (!partitionDef) {
        throw new PartitionError(`Partition '${partition}' not found`, { resourceName: this.name, partitionName: partition, operation: 'count' });
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
      // Count all in main resource (new format)
      prefix = `resource=${this.name}/data`;
    }

    const count = await this.client.count({ prefix });

    // Execute afterCount hooks
    await this.executeHooks('afterCount', { count, partition, partitionValues });

    this._emitWithDeprecation("count", "counted", count);
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

    this._emitWithDeprecation("insertMany", "inserted-many", objects.length);
    return results;
  }

  /**
   * Delete multiple resources by their IDs in parallel
   * @param {string[]} ids - Array of resource IDs to delete
   * @returns {Promise<Object[]>} Array of S3 delete responses
   * @example
   * const deletedIds = ['user-1', 'user-2', 'user-3'];
   * const results = await resource.deleteMany(deletedIds);
      */
  async deleteMany(ids) {
    // Execute beforeDeleteMany hooks
    await this.executeHooks('beforeDeleteMany', { ids });

    const packages = chunk(
      ids.map((id) => this.getResourceKey(id)),
      1000
    );

    // Debug log: print all keys to be deleted
    const allKeys = ids.map((id) => this.getResourceKey(id));

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

    // Execute afterDeleteMany hooks
    await this.executeHooks('afterDeleteMany', { ids, results });

    this._emitWithDeprecation("deleteMany", "deleted-many", ids.length);
    return results;
  }

  async deleteAll() {
    // Security check: only allow if paranoid mode is disabled
    if (this.config.paranoid !== false) {
      throw new ResourceError('deleteAll() is a dangerous operation and requires paranoid: false option.', { resourceName: this.name, operation: 'deleteAll', paranoid: this.config.paranoid, suggestion: 'Set paranoid: false to allow deleteAll.' });
    }

    // Use deleteAll to efficiently delete all objects (new format)
    const prefix = `resource=${this.name}/data`;
    const deletedCount = await this.client.deleteAll({ prefix });

    this._emitWithDeprecation("deleteAll", "deleted-all", {
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
      throw new ResourceError('deleteAllData() is a dangerous operation and requires paranoid: false option.', { resourceName: this.name, operation: 'deleteAllData', paranoid: this.config.paranoid, suggestion: 'Set paranoid: false to allow deleteAllData.' });
    }

    // Use deleteAll to efficiently delete everything for this resource
    const prefix = `resource=${this.name}`;
    const deletedCount = await this.client.deleteAll({ prefix });

    this._emitWithDeprecation("deleteAllData", "deleted-all-data", {
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
        throw new PartitionError(`Partition '${partition}' not found`, { resourceName: this.name, partitionName: partition, operation: 'listIds' });
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
      // List from main resource (without version in path)
      prefix = `resource=${this.name}/data`;
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
    this._emitWithDeprecation("listIds", "listed-ids", ids.length);
    return ids;
  }

  /**
   * List resources with optional partition filtering and pagination
   * @param {Object} [params] - List parameters
   * @param {string} [params.partition] - Partition name to list from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {number} [params.limit] - Maximum number of results
   * @param {number} [params.offset=0] - Number of results to skip
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * // List all resources
   * const allUsers = await resource.list();
   * 
   * // List with pagination
   * const first10 = await resource.list({ limit: 10, offset: 0 });
   * 
   * // List from specific partition
   * const usUsers = await resource.list({
   *   partition: 'byCountry',
   *   partitionValues: { 'profile.country': 'US' }
   * });
   */
  async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
    // Execute beforeList hooks
    await this.executeHooks('beforeList', { partition, partitionValues, limit, offset });

    const [ok, err, result] = await tryFn(async () => {
      if (!partition) {
        return await this.listMain({ limit, offset });
      }
      return await this.listPartition({ partition, partitionValues, limit, offset });
    });
    if (!ok) {
      return this.handleListError(err, { partition, partitionValues });
    }

    // Execute afterList hooks
    const finalResult = await this.executeHooks('afterList', result);
    return finalResult;
  }

  async listMain({ limit, offset = 0 }) {
    const [ok, err, ids] = await tryFn(() => this.listIds({ limit, offset }));
    if (!ok) throw err;
    const results = await this.processListResults(ids, 'main');
    this._emitWithDeprecation("list", "listed", { count: results.length, errors: 0 });
    return results;
  }

  async listPartition({ partition, partitionValues, limit, offset = 0 }) {
    if (!this.config.partitions?.[partition]) {
      this._emitWithDeprecation("list", "listed", { partition, partitionValues, count: 0, errors: 0 });
      return [];
    }
    const partitionDef = this.config.partitions[partition];
    const prefix = this.buildPartitionPrefix(partition, partitionDef, partitionValues);
    const [ok, err, keys] = await tryFn(() => this.client.getAllKeys({ prefix }));
    if (!ok) throw err;
    const ids = this.extractIdsFromKeys(keys).slice(offset);
    const filteredIds = limit ? ids.slice(0, limit) : ids;
    const results = await this.processPartitionResults(filteredIds, partition, partitionDef, keys);
    this._emitWithDeprecation("list", "listed", { partition, partitionValues, count: results.length, errors: 0 });
    return results;
  }

  /**
   * Build partition prefix from partition definition and values
   */
  buildPartitionPrefix(partition, partitionDef, partitionValues) {
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
      return `resource=${this.name}/partition=${partition}/${partitionSegments.join('/')}`;
    }

    return `resource=${this.name}/partition=${partition}`;
  }

  /**
   * Extract IDs from S3 keys
   */
  extractIdsFromKeys(keys) {
    return keys
      .map(key => {
        const parts = key.split('/');
        const idPart = parts.find(part => part.startsWith('id='));
        return idPart ? idPart.replace('id=', '') : null;
      })
      .filter(Boolean);
  }

  /**
   * Process list results with error handling
   */
  async processListResults(ids, context = 'main') {
    const { results, errors } = await PromisePool.for(ids)
      .withConcurrency(this.parallelism)
      .handleError(async (error, id) => {
        this.emit("error", error, content);
        this.observers.map((x) => x.emit("error", this.name, error, content));
      })
      .process(async (id) => {
        const [ok, err, result] = await tryFn(() => this.get(id));
        if (ok) {
          return result;
        }
        return this.handleResourceError(err, id, context);
      });
    this._emitWithDeprecation("list", "listed", { count: results.length, errors: 0 });
    return results;
  }

  /**
   * Process partition results with error handling
   */
  async processPartitionResults(ids, partition, partitionDef, keys) {
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
    const { results, errors } = await PromisePool.for(ids)
      .withConcurrency(this.parallelism)
      .handleError(async (error, id) => {
        this.emit("error", error, content);
        this.observers.map((x) => x.emit("error", this.name, error, content));
      })
      .process(async (id) => {
        const [ok, err, result] = await tryFn(async () => {
          const actualPartitionValues = this.extractPartitionValuesFromKey(id, keys, sortedFields);
          return await this.getFromPartition({
            id,
            partitionName: partition,
            partitionValues: actualPartitionValues
          });
        });
        if (ok) return result;
        return this.handleResourceError(err, id, 'partition');
      });
    return results.filter(item => item !== null);
  }

  /**
   * Extract partition values from S3 key for specific ID
   */
  extractPartitionValuesFromKey(id, keys, sortedFields) {
    const keyForId = keys.find(key => key.includes(`id=${id}`));
    if (!keyForId) {
      throw new PartitionError(`Partition key not found for ID ${id}`, { resourceName: this.name, id, operation: 'extractPartitionValuesFromKey' });
    }

    const keyParts = keyForId.split('/');
    const actualPartitionValues = {};

    for (const [fieldName] of sortedFields) {
      const fieldPart = keyParts.find(part => part.startsWith(`${fieldName}=`));
      if (fieldPart) {
        const value = fieldPart.replace(`${fieldName}=`, '');
        actualPartitionValues[fieldName] = value;
      }
    }

    return actualPartitionValues;
  }

  /**
   * Handle resource-specific errors
   */
  handleResourceError(error, id, context) {
    if (error.message.includes('Cipher job failed') || error.message.includes('OperationError')) {
      return {
        id,
        _decryptionFailed: true,
        _error: error.message,
        ...(context === 'partition' && { _partition: context })
      };
    }
    throw error;
  }

  /**
   * Handle list method errors
   */
  handleListError(error, { partition, partitionValues }) {
    if (error.message.includes("Partition '") && error.message.includes("' not found")) {
      this._emitWithDeprecation("list", "listed", { partition, partitionValues, count: 0, errors: 1 });
      return [];
    }

    this._emitWithDeprecation("list", "listed", { partition, partitionValues, count: 0, errors: 1 });
    return [];
  }

  /**
   * Get multiple resources by their IDs
   * @param {string[]} ids - Array of resource IDs
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * const users = await resource.getMany(['user-1', 'user-2', 'user-3']);
      */
  async getMany(ids) {
    // Execute beforeGetMany hooks
    await this.executeHooks('beforeGetMany', { ids });

    const { results, errors } = await PromisePool.for(ids)
      .withConcurrency(this.client.parallelism)
      .handleError(async (error, id) => {
        this.emit("error", error, content);
        this.observers.map((x) => x.emit("error", this.name, error, content));
        return {
          id,
          _error: error.message,
          _decryptionFailed: error.message.includes('Cipher job failed') || error.message.includes('OperationError')
        };
      })
      .process(async (id) => {
        const [ok, err, data] = await tryFn(() => this.get(id));
        if (ok) return data;
        if (err.message.includes('Cipher job failed') || err.message.includes('OperationError')) {
          return {
            id,
            _decryptionFailed: true,
            _error: err.message
          };
        }
        throw err;
      });

    // Execute afterGetMany hooks
    const finalResults = await this.executeHooks('afterGetMany', results);

    this._emitWithDeprecation("getMany", "fetched-many", ids.length);
    return finalResults;
  }

  /**
   * Get all resources (equivalent to list() without pagination)
   * @returns {Promise<Object[]>} Array of all resource objects
   * @example
   * const allUsers = await resource.getAll();
      */
  async getAll() {
    const [ok, err, ids] = await tryFn(() => this.listIds());
    if (!ok) throw err;
    const results = [];
    for (const id of ids) {
      const [ok2, err2, item] = await tryFn(() => this.get(id));
      if (ok2) {
        results.push(item);
      } else {
        // Log error but continue
      }
    }
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
      */
  async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
    const [ok, err, result] = await tryFn(async () => {
      // Get total count only if not skipped (for performance)
      let totalItems = null;
      let totalPages = null;
      if (!skipCount) {
        const [okCount, errCount, count] = await tryFn(() => this.count({ partition, partitionValues }));
        if (okCount) {
          totalItems = count;
          totalPages = Math.ceil(totalItems / size);
        } else {
          totalItems = null;
          totalPages = null;
        }
      }
      const page = Math.floor(offset / size);
      let items = [];
      if (size <= 0) {
        items = [];
      } else {
        const [okList, errList, listResult] = await tryFn(() => this.list({ partition, partitionValues, limit: size, offset: offset }));
        items = okList ? listResult : [];
      }
      const result = {
        items,
        totalItems,
        page,
        pageSize: size,
        totalPages,
        hasMore: items.length === size && (offset + size) < (totalItems || Infinity),
        _debug: {
          requestedSize: size,
          requestedOffset: offset,
          actualItemsReturned: items.length,
          skipCount: skipCount,
          hasTotalItems: totalItems !== null
        }
      };
      this._emitWithDeprecation("page", "paginated", result);
      return result;
    });
    if (ok) return result;
    // Final fallback - return a safe result even if everything fails
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
        error: err.message
      }
    };
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
    const [ok, err, currentData] = await tryFn(() => this.get(id));
    if (!ok || !currentData) {
      throw new ResourceError(`Resource with id '${id}' not found`, { resourceName: this.name, id, operation: 'setContent' });
    }
    const updatedData = {
      ...currentData,
      _hasContent: true,
      _contentLength: buffer.length,
      _mimeType: contentType
    };
    const mappedMetadata = await this.schema.mapper(updatedData);
    const [ok2, err2] = await tryFn(() => this.client.putObject({
      key: this.getResourceKey(id),
      metadata: mappedMetadata,
      body: buffer,
      contentType
    }));
    if (!ok2) throw err2;
    this._emitWithDeprecation("setContent", "content-set", { id, contentType, contentLength: buffer.length }, id);
    return updatedData;
  }

  /**
   * Retrieve binary content associated with a resource
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} Object with buffer and contentType
   * @example
   * const content = await resource.content('user-123');
   * if (content.buffer) {
         *   // Save to file
   *   fs.writeFileSync('output.jpg', content.buffer);
   * } else {
      * }
   */
  async content(id) {
    const key = this.getResourceKey(id);
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));
    if (!ok) {
      if (err.name === "NoSuchKey") {
        return {
          buffer: null,
          contentType: null
        };
      }
      throw err;
    }
    const buffer = Buffer.from(await response.Body.transformToByteArray());
    const contentType = response.ContentType || null;
    this._emitWithDeprecation("content", "content-fetched", { id, contentLength: buffer.length, contentType }, id);
    return {
      buffer,
      contentType
    };
  }

  /**
   * Check if binary content exists for a resource
   * @param {string} id - Resource ID
   * @returns {boolean}
   */
  async hasContent(id) {
    const key = this.getResourceKey(id);
    const [ok, err, response] = await tryFn(() => this.client.headObject(key));
    if (!ok) return false;
    return response.ContentLength > 0;
  }

  /**
   * Delete binary content but preserve metadata
   * @param {string} id - Resource ID
   */
  async deleteContent(id) {
    const key = this.getResourceKey(id);
    const [ok, err, existingObject] = await tryFn(() => this.client.headObject(key));
    if (!ok) throw err;
    const existingMetadata = existingObject.Metadata || {};
    const [ok2, err2, response] = await tryFn(() => this.client.putObject({
      key,
      body: "",
      metadata: existingMetadata,
    }));
    if (!ok2) throw err2;
    this._emitWithDeprecation("deleteContent", "content-deleted", id, id);
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
   * @param {string} version - Version string (e.g., 'v1', 'v2')
   * @returns {Object} Schema object for the version
   */
  async getSchemaForVersion(version) {
    return this.schema;
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

    // Create all partition references in parallel
    const promises = Object.entries(partitions).map(async ([partitionName, partition]) => {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        // Save only version as metadata, never object attributes
        const partitionMetadata = {
          _v: String(this.version)
        };
        return this.client.putObject({
          key: partitionKey,
          metadata: partitionMetadata,
          body: '',
          contentType: undefined,
        });
      }
      return null;
    });

    // Wait for all partition references to be created
    const results = await Promise.allSettled(promises);
    
    // Check for any failures
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      // Emit warning but don't throw - partitions are secondary indexes
      this.emit('partitionIndexWarning', {
        operation: 'create',
        id: data.id,
        failures: failures.map(f => f.reason)
      });
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
    const keysToDelete = [];
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        keysToDelete.push(partitionKey);
      }
    }
    if (keysToDelete.length > 0) {
      const [ok, err] = await tryFn(() => this.client.deleteObjects(keysToDelete));
      if (!ok) {
        // console.warn('Some partition objects could not be deleted:', err.message);
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
    // Execute beforeQuery hooks
    await this.executeHooks('beforeQuery', { filter, limit, offset, partition, partitionValues });

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
    const finalResults = results.slice(0, limit);

    // Execute afterQuery hooks
    return await this.executeHooks('afterQuery', finalResults);
  }

  /**
   * Handle partition reference updates with change detection
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdates(oldData, newData) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    
    // Update all partitions in parallel
    const updatePromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
      const [ok, err] = await tryFn(() => this.handlePartitionReferenceUpdate(partitionName, partition, oldData, newData));
      if (!ok) {
        // console.warn(`Failed to update partition references for ${partitionName}:`, err.message);
        return { partitionName, error: err };
      }
      return { partitionName, success: true };
    });
    
    await Promise.allSettled(updatePromises);
    
    // Aggressive cleanup: remove stale partition keys in parallel
    const id = newData.id || oldData.id;
    const cleanupPromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
      const prefix = `resource=${this.name}/partition=${partitionName}`;
      const [okKeys, errKeys, keys] = await tryFn(() => this.client.getAllKeys({ prefix }));
      if (!okKeys) {
        // console.warn(`Aggressive cleanup: could not list keys for partition ${partitionName}:`, errKeys.message);
        return;
      }
      
      const validKey = this.getPartitionKey({ partitionName, id, data: newData });
      const staleKeys = keys.filter(key => key.endsWith(`/id=${id}`) && key !== validKey);
      
      if (staleKeys.length > 0) {
        const [okDel, errDel] = await tryFn(() => this.client.deleteObjects(staleKeys));
        if (!okDel) {
          // console.warn(`Aggressive cleanup: could not delete stale partition keys:`, errDel.message);
        }
      }
    });
    
    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Handle partition reference update for a specific partition
   * @param {string} partitionName - Name of the partition
   * @param {Object} partition - Partition definition
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdate(partitionName, partition, oldData, newData) {
    // Ensure we have the correct id
    const id = newData.id || oldData.id;

    // Get old and new partition keys
    const oldPartitionKey = this.getPartitionKey({ partitionName, id, data: oldData });
    const newPartitionKey = this.getPartitionKey({ partitionName, id, data: newData });

    // If partition keys are different, we need to move the reference
    if (oldPartitionKey !== newPartitionKey) {
      // Delete old partition reference if it exists
      if (oldPartitionKey) {
        const [ok, err] = await tryFn(async () => {
          await this.client.deleteObject(oldPartitionKey);
        });
        if (!ok) {
          // Log but don't fail if old partition object doesn't exist
          // console.warn(`Old partition object could not be deleted for ${partitionName}:`, err.message);
        }
      }

      // Create new partition reference if new key exists
      if (newPartitionKey) {
        const [ok, err] = await tryFn(async () => {
          // Save only version as metadata
          const partitionMetadata = {
            _v: String(this.version)
          };
          await this.client.putObject({
            key: newPartitionKey,
            metadata: partitionMetadata,
            body: '',
            contentType: undefined,
          });
        });
        if (!ok) {
          // Log but don't fail if new partition object creation fails
          // console.warn(`New partition object could not be created for ${partitionName}:`, err.message);
        }
      }
    } else if (newPartitionKey) {
      // If partition keys are the same, just update the existing reference
      const [ok, err] = await tryFn(async () => {
        // Save only version as metadata
        const partitionMetadata = {
          _v: String(this.version)
        };
        await this.client.putObject({
          key: newPartitionKey,
          metadata: partitionMetadata,
          body: '',
          contentType: undefined,
        });
      });
      if (!ok) {
        // Log but don't fail if partition object update fails
        // console.warn(`Partition object could not be updated for ${partitionName}:`, err.message);
      }
    }
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
      // Validate that the partition exists and has the required structure
      if (!partition || !partition.fields || typeof partition.fields !== 'object') {
        // console.warn(`Skipping invalid partition '${partitionName}' in resource '${this.name}'`);
        continue;
      }
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        // Save only version as metadata
        const partitionMetadata = {
          _v: String(this.version)
        };
        const [ok, err] = await tryFn(async () => {
          await this.client.putObject({
            key: partitionKey,
            metadata: partitionMetadata,
            body: '',
            contentType: undefined,
          });
        });
        if (!ok) {
          // Log but don't fail if partition object doesn't exist
          // console.warn(`Partition object could not be updated for ${partitionName}:`, err.message);
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
      throw new PartitionError(`Partition '${partitionName}' not found`, { resourceName: this.name, partitionName, operation: 'getFromPartition' });
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
      throw new PartitionError(`No partition values provided for partition '${partitionName}'`, { resourceName: this.name, partitionName, operation: 'getFromPartition' });
    }

    const partitionKey = join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);

    // Verify partition reference exists
    const [ok, err] = await tryFn(async () => {
      await this.client.headObject(partitionKey);
    });
    if (!ok) {
      throw new ResourceError(`Resource with id '${id}' not found in partition '${partitionName}'`, { resourceName: this.name, id, partitionName, operation: 'getFromPartition' });
    }

    // Get the actual data from the main resource object
    const data = await this.get(id);

    // Add partition metadata
    data._partition = partitionName;
    data._partitionValues = partitionValues;

    this._emitWithDeprecation("getFromPartition", "partition-fetched", data, data.id);
    return data;
  }

  /**
   * Create a historical version of an object
   * @param {string} id - Resource ID
   * @param {Object} data - Object data to store historically
   */
  async createHistoricalVersion(id, data) {
    const historicalKey = join(`resource=${this.name}`, `historical`, `id=${id}`);

    // Ensure the historical object has the _v metadata
    const historicalData = {
      ...data,
      _v: data._v || this.version,
      _historicalTimestamp: new Date().toISOString()
    };

    const mappedData = await this.schema.mapper(historicalData);

    // Apply behavior strategy for historical storage
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this,
      data: historicalData,
      mappedData
    });

    // Add version metadata for consistency
    const finalMetadata = {
      ...processedMetadata,
      _v: data._v || this.version,
      _historicalTimestamp: historicalData._historicalTimestamp
    };

    // Determine content type based on body content
    let contentType = undefined;
    if (body && body !== "") {
      const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = 'application/json';
    }

    await this.client.putObject({
      key: historicalKey,
      metadata: finalMetadata,
      body,
      contentType,
    });
  }

  /**
   * Apply version mapping to convert an object from one version to another
   * @param {Object} data - Object data to map
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {Object} Mapped object data
   */
  async applyVersionMapping(data, fromVersion, toVersion) {
    // If versions are the same, no mapping needed
    if (fromVersion === toVersion) {
      return data;
    }

    // For now, we'll implement a simple mapping strategy
    // In a full implementation, this would use sophisticated version mappers
    // based on the schema evolution history

    // Add version info to the returned data
    const mappedData = {
      ...data,
      _v: toVersion,
      _originalVersion: fromVersion,
      _versionMapped: true
    };

    // TODO: Implement sophisticated version mapping logic here
    // This could involve:
    // 1. Field renames
    // 2. Field type changes
    // 3. Default values for new fields
    // 4. Data transformations

    return mappedData;
  }

  /**
   * Compose the full object (metadata + body) as returned by .get(),
   * using in-memory data after insert/update, according to behavior
   */
  async composeFullObjectFromWrite({ id, metadata, body, behavior }) {
    // Preserve behavior flags before unmapping
    const behaviorFlags = {};
    if (metadata && metadata['$truncated'] === 'true') {
      behaviorFlags.$truncated = 'true';
    }
    if (metadata && metadata['$overflow'] === 'true') {
      behaviorFlags.$overflow = 'true';
    }
    // Always unmap metadata first to get the correct field names
    let unmappedMetadata = {};
    const [ok, err, unmapped] = await tryFn(() => this.schema.unmapper(metadata));
    unmappedMetadata = ok ? unmapped : metadata;
    // Helper function to filter out internal S3DB fields
    // Preserve geo-related fields (_geohash, _geohash_zoom*) for GeoPlugin
    // Preserve plugin attributes (fields in _pluginAttributes)
    const filterInternalFields = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const filtered = {};
      const pluginAttrNames = this.schema._pluginAttributes
        ? Object.values(this.schema._pluginAttributes).flat()
        : [];

      for (const [key, value] of Object.entries(obj)) {
        // Keep field if it doesn't start with _, or if it's a special field, or if it's a plugin attribute
        if (!key.startsWith('_') || key === '_geohash' || key.startsWith('_geohash_zoom') || pluginAttrNames.includes(key)) {
          filtered[key] = value;
        }
      }
      return filtered;
    };
    const fixValue = (v) => {
      if (typeof v === 'object' && v !== null) {
        return v;
      }
      if (typeof v === 'string') {
        if (v === '[object Object]') return {};
        if ((v.startsWith('{') || v.startsWith('['))) {
          // Use tryFnSync for safe parse
          const [ok, err, parsed] = tryFnSync(() => JSON.parse(v));
          return ok ? parsed : v;
        }
        return v;
      }
      return v;
    };
    if (behavior === 'body-overflow') {
      const hasOverflow = metadata && metadata['$overflow'] === 'true';
      let bodyData = {};
      if (hasOverflow && body) {
        const [okBody, errBody, parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
        if (okBody) {
          // Extract pluginMap for backwards compatibility when plugins are added/removed
          let pluginMapFromMeta = null;
          // S3 metadata keys are case-insensitive and stored as lowercase
          if (metadata && metadata._pluginmap) {
            const [okPluginMap, errPluginMap, parsedPluginMap] = await tryFn(() =>
              Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap)
            );
            pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
          }

          const [okUnmap, errUnmap, unmappedBody] = await tryFn(() =>
            this.schema.unmapper(parsedBody, undefined, pluginMapFromMeta)
          );
          bodyData = okUnmap ? unmappedBody : {};
        }
      }
      const merged = { ...unmappedMetadata, ...bodyData, id };
      Object.keys(merged).forEach(k => { merged[k] = fixValue(merged[k]); });
      const result = filterInternalFields(merged);
      if (hasOverflow) {
        result.$overflow = 'true';
      }
      return result;
    }
    if (behavior === 'body-only') {
      const [okBody, errBody, parsedBody] = await tryFn(() => Promise.resolve(body ? JSON.parse(body) : {}));
      let mapFromMeta = this.schema.map;
      let pluginMapFromMeta = null;

      if (metadata && metadata._map) {
        const [okMap, errMap, parsedMap] = await tryFn(() => Promise.resolve(typeof metadata._map === 'string' ? JSON.parse(metadata._map) : metadata._map));
        mapFromMeta = okMap ? parsedMap : this.schema.map;
      }

      // S3 metadata keys are case-insensitive and stored as lowercase
      // So _pluginMap becomes _pluginmap
      if (metadata && metadata._pluginmap) {
        const [okPluginMap, errPluginMap, parsedPluginMap] = await tryFn(() => Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap));
        pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
      }

      const [okUnmap, errUnmap, unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody, mapFromMeta, pluginMapFromMeta));
      const result = okUnmap ? { ...unmappedBody, id } : { id };
      Object.keys(result).forEach(k => { result[k] = fixValue(result[k]); });
      return result;
    }
    
    // Handle user-managed behavior when data is in body
    if (behavior === 'user-managed' && body && body.trim() !== '') {
      const [okBody, errBody, parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okBody) {
        // Extract pluginMap for backwards compatibility when plugins are added/removed
        let pluginMapFromMeta = null;
        // S3 metadata keys are case-insensitive and stored as lowercase
        if (metadata && metadata._pluginmap) {
          const [okPluginMap, errPluginMap, parsedPluginMap] = await tryFn(() =>
            Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap)
          );
          pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
        }

        const [okUnmap, errUnmap, unmappedBody] = await tryFn(() =>
          this.schema.unmapper(parsedBody, undefined, pluginMapFromMeta)
        );
        const bodyData = okUnmap ? unmappedBody : {};
        const merged = { ...bodyData, ...unmappedMetadata, id };
        Object.keys(merged).forEach(k => { merged[k] = fixValue(merged[k]); });
        return filterInternalFields(merged);
      }
    }
    
    const result = { ...unmappedMetadata, id };
    Object.keys(result).forEach(k => { result[k] = fixValue(result[k]); });
    const filtered = filterInternalFields(result);
    if (behaviorFlags.$truncated) {
      filtered.$truncated = behaviorFlags.$truncated;
    }
    if (behaviorFlags.$overflow) {
      filtered.$overflow = behaviorFlags.$overflow;
    }
    return filtered;
  }

  // --- MIDDLEWARE SYSTEM ---
  _initMiddleware() {
    // Map of methodName -> array of middleware functions
    this._middlewares = new Map();
    // Supported methods for middleware (expanded to include newly cached methods)
    this._middlewareMethods = [
      'get', 'list', 'listIds', 'getAll', 'count', 'page',
      'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
      'content', 'hasContent', 'query', 'getFromPartition', 'setContent', 'deleteContent', 'replace'
    ];
    for (const method of this._middlewareMethods) {
      this._middlewares.set(method, []);
      // Wrap the method if not already wrapped
      if (!this[`_original_${method}`]) {
        this[`_original_${method}`] = this[method].bind(this);
        this[method] = async (...args) => {
          const ctx = { resource: this, args, method };
          let idx = -1;
          const stack = this._middlewares.get(method);
          const dispatch = async (i) => {
            if (i <= idx) throw new Error('next() called multiple times');
            idx = i;
            if (i < stack.length) {
              return await stack[i](ctx, () => dispatch(i + 1));
            } else {
              // Final handler: call the original method
              return await this[`_original_${method}`](...ctx.args);
            }
          };
          return await dispatch(0);
        };
      }
    }
  }

  useMiddleware(method, fn) {
    if (!this._middlewares) this._initMiddleware();
    if (!this._middlewares.has(method)) throw new ResourceError(`No such method for middleware: ${method}`, { operation: 'useMiddleware', method });
    this._middlewares.get(method).push(fn);
  }

  // Utility to apply schema default values
  applyDefaults(data) {
    const out = { ...data };
    for (const [key, def] of Object.entries(this.attributes)) {
      if (out[key] === undefined) {
        if (typeof def === 'string' && def.includes('default:')) {
          const match = def.match(/default:([^|]+)/);
          if (match) {
            let val = match[1];
            // Convert to boolean/number if necessary
            if (def.includes('boolean')) val = val === 'true';
            else if (def.includes('number')) val = Number(val);
            out[key] = val;
          }
        }
      }
    }
    return out;
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

  // Validate idGenerator
  if (config.idGenerator !== undefined) {
    if (typeof config.idGenerator !== 'function' && typeof config.idGenerator !== 'number') {
      errors.push("Resource 'idGenerator' must be a function or a number (size)");
    } else if (typeof config.idGenerator === 'number' && config.idGenerator <= 0) {
      errors.push("Resource 'idGenerator' size must be greater than 0");
    }
  }

  // Validate idSize
  if (config.idSize !== undefined) {
    if (typeof config.idSize !== 'number' || !Number.isInteger(config.idSize)) {
      errors.push("Resource 'idSize' must be an integer");
    } else if (config.idSize <= 0) {
      errors.push("Resource 'idSize' must be greater than 0");
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
      const validHookEvents = [
        'beforeInsert', 'afterInsert',
        'beforeUpdate', 'afterUpdate',
        'beforeDelete', 'afterDelete',
        'beforeGet', 'afterGet',
        'beforeList', 'afterList',
        'beforeQuery', 'afterQuery',
        'beforeExists', 'afterExists',
        'beforeCount', 'afterCount',
        'beforePatch', 'afterPatch',
        'beforeReplace', 'afterReplace',
        'beforeGetMany', 'afterGetMany',
        'beforeDeleteMany', 'afterDeleteMany'
      ];
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

  // Validate events
  if (config.events !== undefined) {
    if (typeof config.events !== 'object' || Array.isArray(config.events)) {
      errors.push("Resource 'events' must be an object");
    } else {
      for (const [eventName, listeners] of Object.entries(config.events)) {
        if (Array.isArray(listeners)) {
          // Multiple listeners for this event
          for (let i = 0; i < listeners.length; i++) {
            const listener = listeners[i];
            if (typeof listener !== 'function') {
              errors.push(`Resource 'events.${eventName}[${i}]' must be a function`);
            }
          }
        } else if (typeof listeners !== 'function') {
          errors.push(`Resource 'events.${eventName}' must be a function or array of functions`);
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