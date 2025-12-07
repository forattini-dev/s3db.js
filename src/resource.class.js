import { join } from "path";
import { createHash } from "crypto";
import AsyncEventEmitter from "./concerns/async-event-emitter.js";
import jsonStableStringify from "json-stable-stringify";
import { chunk, cloneDeep, merge, isEmpty, isObject } from "lodash-es";

import Schema from "./schema.class.js";
import { ValidatorManager } from "./validator.class.js";
import { ResourceValidator } from "./core/resource-validator.class.js";
import { ResourceIdGenerator } from "./core/resource-id-generator.class.js";
import { ResourceEvents } from "./core/resource-events.class.js";
import { ResourceHooks } from "./core/resource-hooks.class.js";
import { ResourceGuards } from "./core/resource-guards.class.js";
import { ResourceMiddleware } from "./core/resource-middleware.class.js";
import { ResourcePartitions } from "./core/resource-partitions.class.js";
import { ResourceQuery } from "./core/resource-query.class.js";
import { ResourceContent } from "./core/resource-content.class.js";
import { ResourceStreams } from "./core/resource-streams.class.js";
import { ResourcePersistence } from "./core/resource-persistence.class.js";
import { streamToString } from "./stream/index.js";
import tryFn, { tryFnSync } from "./concerns/try-fn.js";
import { ResourceReader, ResourceWriter } from "./stream/index.js"
import { getBehavior, DEFAULT_BEHAVIOR } from "./behaviors/index.js";
import { idGenerator as defaultIdGenerator, createCustomGenerator, getUrlAlphabet } from "./concerns/id.js";
import { createIncrementalIdGenerator, parseIncrementalConfig } from "./concerns/incremental-sequence.js";
import { calculateTotalSize, calculateEffectiveLimit } from "./concerns/calculator.js";
import { mapAwsError, InvalidResourceItem, ResourceError, PartitionError, ValidationError } from "./errors.js";
import { createLogger } from "./concerns/logger.js";
import { validateResourceConfig } from "./core/resource-config-validator.js";


export class Resource extends AsyncEventEmitter {
  /**
   * Create a new Resource instance
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.client - S3 client instance
   * @param {string} [config.version='v1'] - Resource version
   * @param {Object} [config.attributes={}] - Resource attributes schema
   * @param {string} [config.behavior='user-managed'] - Resource behavior strategy
   * @param {string} [config.passphrase='secret'] - Encryption passphrase (for 'secret' type)
   * @param {number} [config.bcryptRounds=10] - Bcrypt rounds (for 'password' type)
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
      bcryptRounds = 10,
      observers = [],
      cache = false,
      autoEncrypt = true,
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
      createdBy = 'user',
      guard
    } = config;

    // Set instance properties
    this.name = name;
    this.client = client;
    this.version = version;
    // Verbose follows explicit config, then client, then database (if provided during construction)
    this.logLevel = config.logLevel || config.client?.logLevel || config.database?.logger.level || 'info';

    // 🪵 Logger initialization - create child logger from database if available
    // Resources should NEVER create logger.child() in hot paths (insert/update/etc)
    if (config.database && config.database.getChildLogger) {
      // Get child logger from database with resource context
      this.logger = config.database.getChildLogger(`Resource:${name}`, { resource: name });
    } else if (config.database && config.database.logger) {
      // Fallback: Database has logger but no getChildLogger helper
      this.logger = config.database.logger.child({ resource: name });
    } else {
      // Standalone resource (no database) - create minimal logger
      // This happens in tests or when Resources are created independently
      this.logger = createLogger({ name: `Resource:${name}`, level: this.logLevel });
    }

    this.behavior = behavior;
    // LEGACY: observers is a pub/sub pattern used in batch operations (insertMany, deleteMany, getMany)
    // Modules access via this.resource.observers when needed. Not extracted - only 6 usages.
    this.observers = observers;
    this.passphrase = passphrase ?? 'secret';
    this.bcryptRounds = bcryptRounds;
    this.versioningEnabled = versioningEnabled;
    this.strictValidation = strictValidation;

    // Configure async events mode
    this.setAsyncMode(asyncEvents);
    // Store the asyncEvents setting for config access
    this.asyncEvents = this._asyncMode;

    // Configure ID generator module
    this._idGenerator = new ResourceIdGenerator(this, {
      idGenerator: customIdGenerator,
      idSize
    });
    // Backwards compatible: expose generator function directly
    this.idGenerator = this._idGenerator.getGenerator();

    // Store ID configuration for persistence
    this.idSize = this._idGenerator.idSize;
    this.idGeneratorType = this._idGenerator.getType(customIdGenerator, this.idSize);

    // Backwards compatible: expose _incrementalConfig for tests/introspection
    // Getter delegates to the module's internal state
    Object.defineProperty(this, '_incrementalConfig', {
      get: () => this._idGenerator._incrementalConfig,
      enumerable: false,
      configurable: false
    });

    // Store configuration - all at root level
    this.config = {
      cache,
      hooks,
      paranoid,
      timestamps,
      partitions,
      autoEncrypt,
      autoDecrypt,
      allNestedObjectsOptional,
      asyncEvents: this.asyncEvents,
      asyncPartitions,
      strictPartitions,
      createdBy,
    };

    // Initialize Validator
    this.validator = new ResourceValidator({
      attributes,
      strictValidation,
      allNestedObjectsOptional
    });

    // Initialize Schema (for mapping/unmapping)
    // TODO: In future phases, Schema should not handle validation at all
    this.schema = new Schema({
      name,
      attributes,
      passphrase,
      bcryptRounds,
      version,
      options: {
        allNestedObjectsOptional,
        autoEncrypt,
        autoDecrypt
      }
    });
    // Store raw schema definition (accessible as resource.$schema)
    // This is the LITERAL object passed to createResource()
    // Useful for plugins, documentation, and introspection
    // PERFORMANCE: Use shallow clone + Object.freeze instead of cloneDeep for 10x speed
    // Deep clone was unnecessary - config is never mutated after construction
    const { database: _db, observers: _obs, client: _cli, ...cloneableConfig } = config;
    this.$schema = { ...cloneableConfig };

    // Add metadata timestamps
    this.$schema._createdAt = Date.now();
    this.$schema._updatedAt = Date.now();

    // Freeze after adding timestamps to prevent mutations
    Object.freeze(this.$schema);

    // --- HOOKS SYSTEM ---
    // Initialize hooks module (empty initially, internal hooks added by applyConfiguration)
    this._hooksModule = new ResourceHooks(this, {});
    // Backwards compatible: expose hooks object directly
    this.hooks = this._hooksModule.getHooks();

    // Store attributes
    this.attributes = attributes || {};

    // --- PARTITIONS SYSTEM ---
    // Initialize partitions module BEFORE applyConfiguration (setupPartitionHooks needs it)
    this._partitions = new ResourcePartitions(this, { strictValidation });

    // Store map before applying configuration
    this.map = config.map;

    // Apply configuration settings (timestamps, partitions)
    // This adds internal hooks (partition hooks) BEFORE user hooks
    this.applyConfiguration({ map: this.map });

    // Merge user-provided hooks (added last, after internal hooks)
    if (hooks) {
      for (const [event, hooksArr] of Object.entries(hooks)) {
        if (Array.isArray(hooksArr)) {
          for (const fn of hooksArr) {
            this._hooksModule.addHook(event, fn);
          }
        }
      }
    }

    // --- EVENTS SYSTEM ---
    // Initialize events module (handles standardization and lazy wiring)
    // NOTE: Named _eventsModule to avoid collision with EventEmitter's internal _events property
    this._eventsModule = new ResourceEvents(this, {
      disableEvents: config.disableEvents,
      disableResourceEvents: config.disableResourceEvents,
      events
    });
    // Backwards compatible: expose eventsDisabled flag
    this.eventsDisabled = this._eventsModule.isDisabled();

    // --- GUARDS SYSTEM ---
    // Initialize guards module (framework-agnostic authorization)
    this._guards = new ResourceGuards(this, { guard });
    // Backwards compatible: expose guard config directly
    this.guard = this._guards.getGuard();

    // --- MIDDLEWARE SYSTEM ---
    // Initialize middleware module
    this._middleware = new ResourceMiddleware(this);
    this._middleware.init();

    // --- QUERY SYSTEM ---
    // Initialize query module (handles list, count, page, query operations)
    this._query = new ResourceQuery(this);

    // --- CONTENT SYSTEM ---
    // Initialize content module (handles binary content operations)
    this._content = new ResourceContent(this);

    // --- STREAMS SYSTEM ---
    // Initialize streams module (handles readable/writable streams)
    this._streams = new ResourceStreams(this);

    // --- PERSISTENCE SYSTEM ---
    // Initialize persistence module (handles CRUD operations)
    this._persistence = new ResourcePersistence(this);

    // --- INCREMENTAL ID GENERATOR ---
    // Initialize if incremental config was provided
    this._initIncrementalIdGenerator();
  }

  /**
   * Configure ID generator based on provided options
   * @deprecated Use ResourceIdGenerator module instead. This method is kept for backwards compatibility.
   * @param {Function|number|string|Object} customIdGenerator - Custom ID generator function, size, or config
   * @param {number} idSize - Size for auto-generated IDs
   * @returns {Function} Configured ID generator function (may be async for incremental)
   * @private
   */
  configureIdGenerator(customIdGenerator, idSize) {
    // Delegate to module - this method is deprecated
    const tempGenerator = new ResourceIdGenerator(this, { idGenerator: customIdGenerator, idSize });
    return tempGenerator.getGenerator();
  }

  /**
   * Initialize incremental ID generator (called after client is available)
   * Delegates to ResourceIdGenerator module.
   * @private
   */
  _initIncrementalIdGenerator() {
    this._idGenerator.initIncremental();
    // Update the backwards-compatible reference
    this.idGenerator = this._idGenerator.getGenerator();
  }

  /**
   * Check if ID generator is async (incremental mode)
   * Delegates to ResourceIdGenerator module.
   * @returns {boolean}
   */
  hasAsyncIdGenerator() {
    return this._idGenerator.isAsync();
  }

  /**
   * Get a serializable representation of the ID generator type
   * Delegates to ResourceIdGenerator module.
   * @param {Function|number} customIdGenerator - Custom ID generator function or size
   * @param {number} idSize - Size for auto-generated IDs
   * @returns {string|number} Serializable ID generator type
   * @private
   */
  getIdGeneratorType(customIdGenerator, idSize) {
    return this._idGenerator.getType(customIdGenerator, idSize);
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
      bcryptRounds: this.bcryptRounds,
      version: this.version,
      options: {
        autoEncrypt: this.config.autoEncrypt,
        autoDecrypt: this.config.autoDecrypt,
        allNestedObjectsOptional: this.config.allNestedObjectsOptional
      },
      map: map || this.map
    });

    // Update validator schema
    if (this.validator) {
      this.validator.updateSchema(this.attributes);
    }

    // Validate partitions against current attributes
    this.validatePartitions();
  }

  // ============================================================================
  // CROSS-CUTTING CONCERNS (Stay in Resource facade - affect multiple modules)
  // These methods modify Schema, Validator, and Hooks simultaneously.
  // They cannot be extracted to a single module without creating circular dependencies.
  // ============================================================================

  /**
   * Update resource attributes and rebuild schema
   * @param {Object} newAttributes - New attributes definition
   * @remarks CROSS-CUTTING: Modifies this.attributes, this.schema, triggers applyConfiguration()
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
   * @remarks CROSS-CUTTING: Modifies this.schema.attributes, this.attributes, recompiles validator, regenerates hooks
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
   * @remarks CROSS-CUTTING: Modifies this.schema.attributes, this.attributes, recompiles validator
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
   * Delegates to ResourceHooks module.
   * @param {string} event - Hook event (beforeInsert, afterInsert, etc.)
   * @param {Function} fn - Hook function
   */
  addHook(event, fn) {
    this._hooksModule.addHook(event, fn);
  }

  /**
   * Execute hooks for a specific event
   * Delegates to ResourceHooks module.
   * @param {string} event - Hook event
   * @param {*} data - Data to pass to hooks
   * @returns {Promise<*>} Modified data
   */
  async executeHooks(event, data) {
    return this._hooksModule.executeHooks(event, data);
  }

  /**
   * Bind a hook function to this resource context.
   * Delegates to ResourceHooks module.
   * @private
   */
  _bindHook(fn) {
    return this._hooksModule._bindHook(fn);
  }

  /**
   * Setup automatic partition hooks.
   * Delegates to ResourcePartitions module.
   */
  setupPartitionHooks() {
    this._partitions.setupHooks(this._hooksModule);
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
    return this.validator.validate(data, options);
  }

  /**
   * Validate that all partition fields exist in current resource attributes.
   * Delegates to ResourcePartitions module.
   * @throws {PartitionError} If partition fields don't exist in current schema (only when strictValidation is true)
   */
  validatePartitions() {
    this._partitions.validate();
  }

  /**
   * Check if a field (including nested fields) exists in the current attributes.
   * Delegates to ResourcePartitions module.
   * @param {string} fieldName - Field name (can be nested like 'utm.source')
   * @returns {boolean} True if field exists
   */
  fieldExistsInAttributes(fieldName) {
    return this._partitions.fieldExistsInAttributes(fieldName);
  }

  /**
   * Find orphaned partitions (partitions that reference non-existent fields).
   * Delegates to ResourcePartitions module.
   * @returns {Object} Object with orphaned partition names as keys and details as values
   */
  findOrphanedPartitions() {
    return this._partitions.findOrphaned();
  }

  /**
   * Remove orphaned partitions (partitions that reference non-existent fields).
   * Delegates to ResourcePartitions module.
   * WARNING: This will modify the resource configuration and should be followed by uploadMetadataFile()
   * @param {Object} options - Options
   * @param {boolean} options.dryRun - If true, only returns what would be removed without modifying (default: false)
   * @returns {Object} Object with removed partition names and details
   */
  removeOrphanedPartitions({ dryRun = false } = {}) {
    return this._partitions.removeOrphaned({ dryRun });
  }

  /**
   * Apply a single partition rule to a field value.
   * Delegates to ResourcePartitions module.
   * @param {*} value - The field value
   * @param {string} rule - The partition rule
   * @returns {*} Transformed value
   */
  applyPartitionRule(value, rule) {
    return this._partitions.applyRule(value, rule);
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
   * Generate partition key for a resource in a specific partition.
   * Delegates to ResourcePartitions module.
   * @param {Object} params - Partition key parameters
   * @param {string} params.partitionName - Name of the partition
   * @param {string} params.id - Resource ID
   * @param {Object} params.data - Resource data for partition value extraction
   * @returns {string|null} The partition key path or null if required fields are missing
   */
  getPartitionKey({ partitionName, id, data }) {
    return this._partitions.getKey({ partitionName, id, data });
  }

  /**
   * Get nested field value from data object using dot notation.
   * Delegates to ResourcePartitions module.
   * @param {Object} data - Data object
   * @param {string} fieldPath - Field path (e.g., "utm.source", "address.city")
   * @returns {*} Field value
   */
  getNestedFieldValue(data, fieldPath) {
    return this._partitions.getNestedFieldValue(data, fieldPath);
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
   * Emit a standardized event with optional ID-specific event.
   * Delegates to ResourceEvents module.
   * @private
   * @param {string} event - Event name
   * @param {Object} payload - Event payload
   * @param {string} [id] - Optional ID for ID-specific events
   */
  _emitStandardized(event, payload, id = null) {
    this._eventsModule.emitStandardized(event, payload, id);
  }

  /**
   * Ensure event listeners from config are wired up.
   * Delegates to ResourceEvents module.
   * @private
   */
  _ensureEventsWired() {
    this._eventsModule.ensureWired();
  }

  on(eventName, listener) {
    return this._eventsModule.on(eventName, listener);
  }

  addListener(eventName, listener) {
    return this.on(eventName, listener);
  }

  once(eventName, listener) {
    return this._eventsModule.once(eventName, listener);
  }

  emit(eventName, ...args) {
    return this._eventsModule.emit(eventName, ...args);
  }

  /**
   * Insert a new resource object.
   * Delegates to ResourcePersistence module.
   * @param {Object} attributes - Resource attributes
   * @param {string} [attributes.id] - Custom ID (optional, auto-generated if not provided)
   * @returns {Promise<Object>} The created resource object with all attributes
   */
  async insert({ id, ...attributes }) {
    return this._persistence.insert({ id, ...attributes });
  }

  /**
   * Retrieve a resource object by ID.
   * Delegates to ResourcePersistence module.
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object with all attributes and metadata
   */
  async get(id) {
    return this._persistence.get(id);
  }

  /**
   * Retrieve a resource object by ID, or return null if not found.
   * Delegates to ResourcePersistence module.
   * @param {string} id - Resource ID
   * @returns {Promise<Object|null>} The resource object or null if not found
   */
  async getOrNull(id) {
    return this._persistence.getOrNull(id);
  }

  /**
   * Retrieve a resource object by ID, or throw ResourceNotFoundError if not found.
   * Delegates to ResourcePersistence module.
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object
   * @throws {ResourceError} If resource does not exist
   */
  async getOrThrow(id) {
    return this._persistence.getOrThrow(id);
  }

  /**
   * Check if a resource exists by ID.
   * Delegates to ResourcePersistence module.
   * @param {string} id - Resource ID
   * @returns {Promise<boolean>} True if resource exists, false otherwise
   */
  async exists(id) {
    return this._persistence.exists(id);
  }

  /**
   * Update an existing resource object.
   * Delegates to ResourcePersistence module.
   * @param {string} id - Resource ID
   * @param {Object} attributes - Attributes to update (partial update supported)
   * @returns {Promise<Object>} The updated resource object with all attributes
   */
  async update(id, attributes) {
    return this._persistence.update(id, attributes);
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
    return this._persistence.patch(id, fields, options);
  }

  /**
   * Internal helper: Optimized patch using HeadObject + CopyObject
   * Delegates to ResourcePersistence module.
   * @private
   */
  async _patchViaCopyObject(id, fields, options = {}) {
    return this._persistence._patchViaCopyObject(id, fields, options);
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
    return this._persistence.replace(id, fullData, options);
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
    return this._persistence.updateConditional(id, attributes, options);
  }

  /**
   * Delete a resource object by ID.
   * Delegates to ResourcePersistence module.
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} S3 delete response
   */
  async delete(id) {
    return this._persistence.delete(id);
  }

  /**
   * Insert or update a resource object (upsert operation).
   * Delegates to ResourcePersistence module.
   * @param {Object} params - Upsert parameters
   * @param {string} params.id - Resource ID (required for upsert)
   * @returns {Promise<Object>} The inserted or updated resource object
   */
  async upsert({ id, ...attributes }) {
    return this._persistence.upsert({ id, ...attributes });
  }

  /**
   * Count resources with optional partition filtering.
   * Delegates to ResourceQuery module.
   * @param {Object} [params] - Count parameters
   * @param {string} [params.partition] - Partition name to count in
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @returns {Promise<number>} Total count of matching resources
   */
  async count({ partition = null, partitionValues = {} } = {}) {
    return this._query.count({ partition, partitionValues });
  }

  /**
   * Insert multiple resources in parallel.
   * Delegates to ResourcePersistence module.
   * @param {Object[]} objects - Array of resource objects to insert
   * @returns {Promise<Object[]>} Array of inserted resource objects
   */
  async insertMany(objects) {
    return this._persistence.insertMany(objects);
  }

  /**
   * Execute batch helper - uses client's _executeBatch if available.
   * Delegates to ResourcePersistence module.
   * @private
   */
  async _executeBatchHelper(operations, options = {}) {
    return this._persistence._executeBatchHelper(operations, options);
  }

  /**
   * Delete multiple resources by their IDs in parallel.
   * Delegates to ResourcePersistence module.
   * @param {string[]} ids - Array of resource IDs to delete
   * @returns {Promise<Object>} Results summary
   */
  async deleteMany(ids) {
    return this._persistence.deleteMany(ids);
  }

  /**
   * Delete all data for this resource (current version only).
   * Delegates to ResourcePersistence module.
   * Requires paranoid: false configuration.
   * @returns {Promise<Object>} Deletion report with deletedCount
   */
  async deleteAll() {
    return this._persistence.deleteAll();
  }

  /**
   * Delete all data for this resource across ALL versions.
   * Delegates to ResourcePersistence module.
   * Requires paranoid: false configuration.
   * @returns {Promise<Object>} Deletion report with deletedCount
   */
  async deleteAllData() {
    return this._persistence.deleteAllData();
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
    return this._query.listIds({ partition, partitionValues, limit, offset });
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
    return this._query.list({ partition, partitionValues, limit, offset });
  }

  async listMain({ limit, offset = 0 }) {
    return this._query.listMain({ limit, offset });
  }

  async listPartition({ partition, partitionValues, limit, offset = 0 }) {
    return this._query.listPartition({ partition, partitionValues, limit, offset });
  }

  /**
   * Build partition prefix from partition definition and values.
   * Delegates to ResourcePartitions module.
   */
  buildPartitionPrefix(partition, partitionDef, partitionValues) {
    return this._partitions.buildPrefix(partition, partitionDef, partitionValues);
  }

  /**
   * Extract IDs from S3 keys.
   * Delegates to ResourceQuery module.
   */
  extractIdsFromKeys(keys) {
    return this._query.extractIdsFromKeys(keys);
  }

  /**
   * Process list results with error handling.
   * Delegates to ResourceQuery module.
   */
  async processListResults(ids, context = 'main') {
    return this._query.processListResults(ids, context);
  }

  /**
   * Process partition results with error handling.
   * Delegates to ResourceQuery module.
   */
  async processPartitionResults(ids, partition, partitionDef, keys) {
    return this._query.processPartitionResults(ids, partition, partitionDef, keys);
  }

  /**
   * Extract partition values from S3 key for specific ID.
   * Delegates to ResourcePartitions module.
   */
  extractPartitionValuesFromKey(id, keys, sortedFields) {
    return this._partitions.extractValuesFromKey(id, keys, sortedFields);
  }

  /**
   * Handle resource-specific errors.
   * Delegates to ResourceQuery module.
   */
  handleResourceError(error, id, context) {
    return this._query.handleResourceError(error, id, context);
  }

  /**
   * Handle list method errors.
   * Delegates to ResourceQuery module.
   */
  handleListError(error, { partition, partitionValues }) {
    return this._query.handleListError(error, { partition, partitionValues });
  }

  /**
   * Get multiple resources by their IDs
   * @param {string[]} ids - Array of resource IDs
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * const users = await resource.getMany(['user-1', 'user-2', 'user-3']);
   */
  async getMany(ids) {
    return this._query.getMany(ids);
  }

  /**
   * Get all resources (equivalent to list() without pagination)
   * @returns {Promise<Object[]>} Array of all resource objects
   * @example
   * const allUsers = await resource.getAll();
   */
  async getAll() {
    return this._query.getAll();
  }

  /**
   * Get a page of resources with pagination metadata
   * @param {Object} [params] - Page parameters
   * @param {number} [params.offset=0] - Offset for pagination
   * @param {number} [params.size=100] - Page size
   * @param {string} [params.partition] - Partition name to page from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {boolean} [params.skipCount=false] - Skip total count for performance
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
    return this._query.page({ offset, size, partition, partitionValues, skipCount });
  }

  /**
   * Create a readable stream for iterating over resources.
   * Delegates to ResourceStreams module.
   * @returns {Object} Readable stream builder
   */
  readable() {
    return this._streams.readable();
  }

  /**
   * Create a writable stream for bulk inserting resources.
   * Delegates to ResourceStreams module.
   * @returns {Object} Writable stream builder
   */
  writable() {
    return this._streams.writable();
  }

  /**
   * Set binary content for a resource.
   * Delegates to ResourceContent module.
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
    return this._content.setContent({ id, buffer, contentType });
  }

  /**
   * Retrieve binary content associated with a resource.
   * Delegates to ResourceContent module.
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} Object with buffer and contentType
   * @example
   * const content = await resource.content('user-123');
   * if (content.buffer) {
   *   // Save to file
   *   fs.writeFileSync('output.jpg', content.buffer);
   * }
   */
  async content(id) {
    return this._content.content(id);
  }

  /**
   * Check if binary content exists for a resource.
   * Delegates to ResourceContent module.
   * @param {string} id - Resource ID
   * @returns {Promise<boolean>} True if content exists
   */
  async hasContent(id) {
    return this._content.hasContent(id);
  }

  /**
   * Delete binary content but preserve metadata.
   * Delegates to ResourceContent module.
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} Response from client
   */
  async deleteContent(id) {
    return this._content.deleteContent(id);
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
   * Create partition references after insert.
   * Delegates to ResourcePartitions module.
   * @param {Object} data - Inserted object data
   */
  async createPartitionReferences(data) {
    return this._partitions.createReferences(data);
  }

  /**
   * Delete partition references after delete.
   * Delegates to ResourcePartitions module.
   * @param {Object} data - Deleted object data
   */
  async deletePartitionReferences(data) {
    return this._partitions.deleteReferences(data);
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
    return this._query.query(filter, { limit, offset, partition, partitionValues });
  }

  /**
   * Handle partition reference updates with change detection.
   * Delegates to ResourcePartitions module.
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdates(oldData, newData) {
    return this._partitions.handleReferenceUpdates(oldData, newData);
  }

  /**
   * Handle partition reference update for a specific partition.
   * Delegates to ResourcePartitions module.
   * @param {string} partitionName - Name of the partition
   * @param {Object} partition - Partition definition
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdate(partitionName, partition, oldData, newData) {
    return this._partitions.handleReferenceUpdate(partitionName, partition, oldData, newData);
  }

  /**
   * Update partition objects to keep them in sync.
   * Delegates to ResourcePartitions module.
   * @param {Object} data - Updated object data
   */
  async updatePartitionReferences(data) {
    return this._partitions.updateReferences(data);
  }

  /**
   * Get a resource object directly from a specific partition.
   * Delegates to ResourcePartitions module.
   * @param {Object} params - Partition parameters
   * @param {string} params.id - Resource ID
   * @param {string} params.partitionName - Name of the partition
   * @param {Object} params.partitionValues - Values for partition fields
   * @returns {Promise<Object>} The resource object with partition metadata
   */
  async getFromPartition({ id, partitionName, partitionValues = {} }) {
    return this._partitions.getFromPartition({ id, partitionName, partitionValues });
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

  // --- GUARDS SYSTEM ---
  /**
   * Normalize guard configuration
   * Delegates to ResourceGuards module.
   * @deprecated Use ResourceGuards module directly
   * @private
   */
  _normalizeGuard(guard) {
    const tempGuards = new ResourceGuards(this, { guard });
    return tempGuards.getGuard();
  }

  /**
   * Execute guard for operation
   * Delegates to ResourceGuards module.
   * @param {string} operation - Operation name (list, get, insert, update, etc)
   * @param {Object} context - Framework-agnostic context
   * @param {Object} [resource] - Resource record (for get/update/delete)
   * @returns {Promise<boolean>} True if allowed, false if denied
   */
  async executeGuard(operation, context, resource = null) {
    return this._guards.execute(operation, context, resource);
  }

  /**
   * Check if user has required roles or scopes
   * Delegates to ResourceGuards module.
   * @private
   */
  _checkRolesScopes(requiredRolesScopes, user) {
    return this._guards._checkRolesScopes(requiredRolesScopes, user);
  }

  // --- MIDDLEWARE SYSTEM ---
  /**
   * Initialize middleware system
   * Delegates to ResourceMiddleware module.
   * @deprecated Middleware is auto-initialized in constructor
   * @private
   */
  _initMiddleware() {
    if (!this._middleware) {
      this._middleware = new ResourceMiddleware(this);
    }
    this._middleware.init();
  }

  /**
   * Add middleware for a specific method
   * Delegates to ResourceMiddleware module.
   * @param {string} method - Method name
   * @param {Function} fn - Middleware function (ctx, next) => Promise
   */
  useMiddleware(method, fn) {
    this._middleware.use(method, fn);
  }

  /**
   * @deprecated Use this.validator.applyDefaults() instead. This method delegates to ResourceValidator.
   */
  applyDefaults(data) {
    return this.validator.applyDefaults(data);
  }

  // ============================================================================
}

// ============================================================================
// INCREMENTAL SEQUENCE UTILITIES
// ============================================================================

/**
 * Get the current value of a sequence without incrementing
 * Only available for resources with incremental ID generator
 *
 * @param {string} [fieldName='id'] - Field name (defaults to 'id')
 * @returns {Promise<number|null>} Current sequence value or null if not incremental
 *
 * @example
 * const resource = await db.createResource({
 *   name: 'orders',
 *   idGenerator: 'incremental:1000'
 * });
 *
 * // After inserting 5 records
 * const nextValue = await resource.getSequenceValue();
 * console.log(nextValue); // 1006 (next ID that will be assigned)
 */
Resource.prototype.getSequenceValue = async function (fieldName = 'id') {
  return this._idGenerator.getSequenceValue(fieldName);
};

/**
 * Reset a sequence to a specific value
 * Only available for resources with incremental ID generator
 *
 * WARNING: This can cause ID conflicts if you reset to a value
 * that has already been used. Use with caution.
 *
 * @param {string} fieldName - Field name
 * @param {number} value - New value for the sequence
 * @returns {Promise<boolean>} True if reset successful, false if not incremental
 *
 * @example
 * // Reset order IDs to start from 5000
 * await orders.resetSequence('id', 5000);
 */
Resource.prototype.resetSequence = async function (fieldName, value) {
  return this._idGenerator.resetSequence(fieldName, value);
};

/**
 * List all sequences for this resource
 * Only available for resources with incremental ID generator
 *
 * @returns {Promise<Array|null>} Array of sequence info or null if not incremental
 *
 * @example
 * const sequences = await orders.listSequences();
 * // [{ name: 'orders-id', value: 1006, createdAt: ..., updatedAt: ... }]
 */
Resource.prototype.listSequences = async function () {
  return this._idGenerator.listSequences();
};

/**
 * Reserve a batch of IDs for bulk operations (fast mode only)
 *
 * @param {number} [count=100] - Number of IDs to reserve
 * @returns {Promise<Object|null>} Batch info { start, end, current } or null
 *
 * @example
 * const batch = await resource.reserveIdBatch(500);
 * // batch = { start: 1000, end: 1500, current: 1000 }
 */
Resource.prototype.reserveIdBatch = async function (count = 100) {
  return this._idGenerator.reserveIdBatch(count);
};

/**
 * Get the status of the current local batch (fast mode only)
 *
 * @param {string} [fieldName='id'] - Field name
 * @returns {Object|null} Batch status { start, end, current, remaining } or null
 *
 * @example
 * const status = resource.getBatchStatus();
 * // { start: 1000, end: 1100, current: 1042, remaining: 58 }
 */
Resource.prototype.getBatchStatus = function (fieldName = 'id') {
  return this._idGenerator.getBatchStatus(fieldName);
};

/**
 * Release unused IDs in the current batch (for graceful shutdown)
 *
 * @param {string} [fieldName='id'] - Field name
 */
Resource.prototype.releaseBatch = function (fieldName = 'id') {
  this._idGenerator.releaseBatch(fieldName);
};

// ============================================================================
// DISPOSAL
// ============================================================================

/**
 * Dispose of the resource and clean up all references
 *
 * Call this when a resource is being destroyed to prevent memory leaks.
 * This method:
 * - Releases validator cache reference (allows cache eviction)
 * - Removes all event listeners (prevents listener leaks)
 * - Emits disposal event for plugins to clean up
 *
 * @example
 * const resource = await db.getResource('users');
 * // ... use resource ...
 * resource.dispose(); // Clean up when done
 */
Resource.prototype.dispose = function () {
  // Release validator reference for cache eviction
  if (this.schema) {
    this.schema.dispose();
  }

  // Emit disposal event for plugins to clean up
  // Do this BEFORE removing listeners so plugins can handle the event
  this.emit('resource:disposed', { resourceName: this.name });

  // Remove all event listeners (inherited from AsyncEventEmitter)
  this.removeAllListeners();
};

export default Resource;
