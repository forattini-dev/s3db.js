import { createHash } from "crypto";
import { isEmpty, isFunction } from "lodash-es";
import jsonStableStringify from "json-stable-stringify";
import { PromisePool } from "@supercharge/promise-pool";

import { S3Client } from "./clients/s3-client.class.js";
import { MemoryClient } from "./clients/memory-client.class.js";
import { FileSystemClient } from "./clients/filesystem-client.class.js";
import { ConnectionString } from "./connection-string.class.js";
import tryFn from "./concerns/try-fn.js";
import Resource from "./resource.class.js";
import { ResourceNotFound, DatabaseError, SchemaError } from "./errors.js";
import { idGenerator } from "./concerns/id.js";
import { streamToString } from "./stream/index.js";
import { ProcessManager } from "./concerns/process-manager.js";
import { SafeEventEmitter } from "./concerns/safe-event-emitter.js";
import { CronManager } from "./concerns/cron-manager.js";
import { createLogger, getLoggerOptionsFromEnv } from "./concerns/logger.js";

export class Database extends SafeEventEmitter {
  constructor(options) {
    // ✨ CLEAN CONFIG STRUCTURE (v16+)
    // Database config at root level, pool config nested under executorPool
    //
    // Structure:
    //   new Database({
    //     connectionString: 'file:///path?compression.enabled=true',
    //     verbose: false,              // Database option (root)
    //     executorPool: {              // Executor pool options (nested)
    //       concurrency: 100,          // Parallelism for operations
    //       retries: 3,
    //       autotune: { ... }
    //     }
    //   })

    super({
      verbose: options.verbose || false,
      autoCleanup: options.autoCleanup !== false
    });

    // Generate database ID with fallback for reliability
    this.id = (() => {
      const [ok, err, id] = tryFn(() => idGenerator(7));
      return ok && id ? id : `db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    })();

    this.version = "1";
    // Version is injected during build, fallback to "latest" for development
    this.s3dbVersion = (() => {
      const [ok, err, version] = tryFn(() => (typeof __PACKAGE_VERSION__ !== 'undefined' && __PACKAGE_VERSION__ !== '__PACKAGE_VERSION__'
        ? __PACKAGE_VERSION__
        : "latest"));
      return ok ? version : "latest";
    })();

    // Create Proxy for resources to enable property access (db.resources.users)
    this._resourcesMap = {};
    this.resources = new Proxy(this._resourcesMap, {
      get: (target, prop) => {
        // Allow standard Object methods
        if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') {
          return target[prop];
        }

        // Return resource if exists
        if (target[prop]) {
          return target[prop];
        }

        // Return undefined for non-existent resources (enables optional chaining)
        return undefined;
      },

      // Support Object.keys(), Object.entries(), etc.
      ownKeys: (target) => {
        return Object.keys(target);
      },

      getOwnPropertyDescriptor: (target, prop) => {
        return Object.getOwnPropertyDescriptor(target, prop);
      }
    });

    this.savedMetadata = null; // Store loaded metadata for versioning
    this.options = options;

    // 🔄 Support both old (operationsPool) and new (executorPool) names
    const executorPoolConfig = options?.executorPool ?? options?.operationsPool;

    this._parallelism = this._normalizeParallelism(
      options?.parallelism ?? executorPoolConfig?.concurrency,
      10
    );

    // ✨ Database-level options (root level)
    this.verbose = options.verbose ?? false;

    // 🪵 Logger initialization (Pino-based, replaces verbose flag)
    // Precedence: custom logger > loggerOptions > env vars > defaults
    if (options.logger) {
      // User provided custom Pino logger instance
      this.logger = options.logger;
    } else {
      // Create logger from options (with env var overrides)
      const loggerConfig = getLoggerOptionsFromEnv(options.loggerOptions || {});
      this.logger = createLogger({
        name: 'Database',
        ...loggerConfig
      });
    }

    // Store child level overrides for later use when creating child loggers
    this._childLoggerLevels = options.loggerOptions?.childLevels || {};

    // 📝 Deprecation warning for old name (after logger initialization)
    if (options?.operationsPool && !options?.executorPool) {
      this.logger.warn(
        '⚠️  "operationsPool" is deprecated in s3db.js v16.x. ' +
        'Use "executorPool" instead. ' +
        'Migration: https://s3db.js/docs/migration/v16-to-v17'
      );
    }

    // Normalize executorPool config with defaults
    this.executorPool = this._normalizeOperationsPool(executorPoolConfig, this._parallelism);
    if (options?.taskExecutorMonitoring) {
      this.executorPool.monitoring = this._deepMerge(
        this.executorPool.monitoring || {},
        options.taskExecutorMonitoring
      );
    }
    this._parallelism = this.executorPool?.concurrency ?? this._parallelism;
    this.taskExecutor = this.executorPool;
    this.pluginList = options.plugins ?? [];
    this.pluginRegistry = {};
    this.plugins = this.pluginRegistry; // Internal alias for plugin registry
    this.cache = options.cache;
    this.passphrase = options.passphrase ?? "secret";
    this.bcryptRounds = options.bcryptRounds ?? 10;
    this.versioningEnabled = options.versioningEnabled ?? false;
    this.persistHooks = options.persistHooks ?? false;
    this.strictValidation = (options.strictValidation ?? true) !== false;
    this.strictHooks = options.strictHooks ?? false;
    this.disableResourceEvents = options.disableResourceEvents === true;

    // Performance: Debounced metadata uploads (opt-in to prevent O(n²) complexity)
    this.deferMetadataWrites = options.deferMetadataWrites ?? false;
    this.metadataWriteDelay = options.metadataWriteDelay ?? 100;
    this._metadataUploadPending = false;
    this._metadataUploadDebounce = null;

    // Initialize ProcessManager for lifecycle management (prevents memory leaks)
    const exitOnSignal = (options.exitOnSignal ?? true) !== false;
    this.processManager = options.processManager ?? new ProcessManager({
      verbose: this.verbose,
      exitOnSignal
    });

    // Initialize CronManager for cron job management (prevents memory leaks)
    this.cronManager = options.cronManager ?? new CronManager({
      verbose: this.verbose,
      exitOnSignal
    });

    // Initialize global coordinator services (lazy instantiation, one per namespace)
    this._globalCoordinators = new Map();

    // Initialize hooks system
    this._initHooks();

    // Handle both connection string and individual parameters
    let connectionString = options.connectionString;
    if (!connectionString && (options.bucket || options.accessKeyId || options.secretAccessKey)) {
      // Build connection string manually
      const { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = options;
      
      // If endpoint is provided, assume it's MinIO or Digital Ocean
      if (endpoint) {
        const url = new URL(endpoint);
        if (accessKeyId) url.username = encodeURIComponent(accessKeyId);
        if (secretAccessKey) url.password = encodeURIComponent(secretAccessKey);
        url.pathname = `/${bucket || 's3db'}`;
        
        // Add forcePathStyle parameter if specified
        if (forcePathStyle) {
          url.searchParams.set('forcePathStyle', 'true');
        }
        
        connectionString = url.toString();
      } else if (accessKeyId && secretAccessKey) {
        // Otherwise, build S3 connection string only if credentials are provided
        const params = new URLSearchParams();
        params.set('region', region || 'us-east-1');
        if (forcePathStyle) {
          params.set('forcePathStyle', 'true');
        }
        connectionString = `s3://${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@${bucket || 's3db'}?${params.toString()}`;
      }
    }

    // ✨ VERTICALIZADO: Merge clientOptions from 2 sources only
    // Priority: querystring params > options.clientOptions
    // (No backward compatibility with flat config)

    let mergedClientOptions = {};
    let connStr = null;

    // Base: explicit options.clientOptions (if provided)
    if (options.clientOptions) {
      mergedClientOptions = { ...options.clientOptions };
    }

    // Override with querystring params (highest priority)
    if (connectionString) {
      try {
        connStr = new ConnectionString(connectionString);
        // ConnectionString._parseQueryParams() already populated connStr.clientOptions
        if (connStr.clientOptions && Object.keys(connStr.clientOptions).length > 0) {
          mergedClientOptions = this._deepMerge(mergedClientOptions, connStr.clientOptions);
        }
      } catch (err) {
        // If parsing fails, continue without querystring params
      }
    }

    // Auto-detect client type based on connection string protocol
    if (!options.client && connectionString) {
      try {
        const url = new URL(connectionString);
        if (url.protocol === 'memory:') {
          // Use MemoryClient for memory:// protocol
          const bucketHost = url.hostname || 'test-bucket';
          const [okBucket, errBucket, decodedBucket] = tryFn(() => decodeURIComponent(bucketHost));
          const bucket = okBucket ? decodedBucket : bucketHost;
          const rawPrefix = url.pathname ? url.pathname.substring(1) : ''; // Remove leading slash
          const [okPrefix, errPrefix, decodedPrefix] = tryFn(() => decodeURIComponent(rawPrefix));
          const keyPrefix = okPrefix ? decodedPrefix : rawPrefix;

          const memoryOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
            bucket,
            keyPrefix,
            verbose: this.verbose,
          }, mergedClientOptions));
          this.client = new MemoryClient(memoryOptions); // ✨ Deep merge client options
        } else if (url.protocol === 'file:') {
          // Use FileSystemClient for file:// protocol
          const filesystemOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
            basePath: connStr.basePath,
            bucket: connStr.bucket,
            keyPrefix: connStr.keyPrefix,
            verbose: this.verbose,
          }, mergedClientOptions));
          this.client = new FileSystemClient(filesystemOptions); // ✨ Deep merge client options
        } else {
          // Use S3Client for s3://, http://, https:// protocols
          // Merge client options first, then set executorPool (takes precedence)
          const s3ClientOptions = this._deepMerge({
            verbose: this.verbose,
            connectionString: connectionString,
          }, mergedClientOptions);
          // executorPool from Database (normalized) takes precedence over any in clientOptions
          s3ClientOptions.executorPool = this._deepMerge(
            s3ClientOptions.executorPool || {},
            this.executorPool
          );
          this.client = new S3Client(s3ClientOptions);
        }
      } catch (err) {
        // If URL parsing fails, fall back to S3Client
        const s3ClientOptions = this._deepMerge({
          verbose: this.verbose,
          connectionString: connectionString,
        }, mergedClientOptions);
        s3ClientOptions.executorPool = this._deepMerge(
          s3ClientOptions.executorPool || {},
          this.executorPool
        );
        this.client = new S3Client(s3ClientOptions);
      }
    } else if (!options.client) {
      // No connection string provided, use S3Client with defaults
      const s3ClientOptions = this._deepMerge({
        verbose: this.verbose,
      }, mergedClientOptions);
      s3ClientOptions.executorPool = this._deepMerge(
        s3ClientOptions.executorPool || {},
        this.executorPool
      );
      this.client = new S3Client(s3ClientOptions);
    } else {
      // Use provided client
      this.client = options.client;
    }

    // Store connection string for CLI access
    const resolvedConnectionString = connectionString || this._inferConnectionStringFromClient(this.client);
    this.connectionString = resolvedConnectionString;
    if (!this.options.connectionString && resolvedConnectionString) {
      this.options.connectionString = resolvedConnectionString;
    }

    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;

    // Register exit listener for cleanup
    this._registerExitListener();
  }

  /**
   * Expose normalized parallelism value
   * @returns {number}
   */
  get parallelism() {
    return this._parallelism ?? 10;
  }

  /**
   * Update executor pool concurrency at runtime
   * @param {number|string} value
   */
  set parallelism(value) {
    const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
    this._parallelism = normalized;
    if (this.executorPool) {
      this.executorPool.concurrency = normalized;
    }
  }

  /**
   * Update executor pool concurrency at runtime (public API)
   * @param {number|string} value - New concurrency value
   */
  setConcurrency(value) {
    const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
    this._parallelism = normalized;
    if (this.executorPool) {
      this.executorPool.concurrency = normalized;
    }
  }

  /**
   * Deprecated: Use db.executorPool instead
   * @deprecated v16.x - Will be removed in v17.0
   * @returns {Object} Executor pool (same as db.executorPool)
   */
  get operationsPool() {
    return this.executorPool;
  }


  /**
   * Register process exit listener for automatic cleanup
   * @private
   */
  _registerExitListener() {
    if (!this._exitListenerRegistered && typeof process !== 'undefined') {
      this._exitListenerRegistered = true;
      // Store listener reference for cleanup
      this._exitListener = async () => {
        if (this.isConnected()) {
          // Silently ignore errors on exit
          await tryFn(() => this.disconnect());
        }
      };
      process.on('exit', this._exitListener);
    }
  }

  /**
   * Deep merge two objects (target gets overwritten by source)
   * Used to merge clientOptions: querystring params override explicit options
   *
   * @param {Object} target - Base object
   * @param {Object} source - Object to merge (higher priority)
   * @returns {Object} Merged object
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          // Recursively merge nested objects
          result[key] = this._deepMerge(result[key] || {}, source[key]);
        } else {
          // Overwrite primitive values and arrays
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Apply database-level task executor monitoring defaults
   * @param {Object} config
   * @returns {Object}
   * @private
   */
  _applyTaskExecutorMonitoring(config = {}) {
    if (!this.options?.taskExecutorMonitoring) {
      return config;
    }
    const merged = { ...config };
    merged.taskExecutorMonitoring = this._deepMerge(
      this.options.taskExecutorMonitoring,
      merged.taskExecutorMonitoring || {}
    );
    return merged;
  }

  /**
   * Normalize a parallelism value into a positive integer
   * @param {number|string} value
   * @param {number} fallback
   * @returns {number}
   * @private
   */
  _normalizeParallelism(value, fallback = 10) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return fallback;
      }
      if (trimmed.toLowerCase() === 'auto') {
        return fallback;
      }
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
      }
      return fallback;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    return fallback;
  }

  /**
   * Normalize OperationsPool configuration with defaults
   * @private
   */
  _normalizeOperationsPool(config = {}, defaultConcurrency = 10) {
    // If explicitly disabled, return minimal config
    if (config === false || config?.enabled === false) {
      return { enabled: false, concurrency: this._normalizeParallelism(undefined, defaultConcurrency) };
    }

    const normalizedConcurrency = this._normalizeParallelism(config?.concurrency, defaultConcurrency);

    return {
      enabled: true, // ENABLED BY DEFAULT
      concurrency: normalizedConcurrency,
      retries: config?.retries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
      timeout: config?.timeout ?? 30000,
      retryableErrors: config?.retryableErrors ?? [],
      autotune: config?.autotune ?? null,
      monitoring: config?.monitoring ?? { collectMetrics: true },
    };
  }

  /**
   * Try to derive a connection string from the current client when not provided
   * @param {Object} client
   * @returns {string|undefined}
   * @private
   */
  _inferConnectionStringFromClient(client) {
    if (!client) {
      return undefined;
    }

    if (client && client.connectionString) {
      return client.connectionString;
    }

    if (client instanceof MemoryClient) {
      const bucket = encodeURIComponent(client.bucket || 's3db');
      const encodedPrefix = client.keyPrefix
        ? client.keyPrefix
            .split('/')
            .filter(Boolean)
            .map((segment) => encodeURIComponent(segment))
            .join('/')
        : '';
      const prefixPath = encodedPrefix ? `/${encodedPrefix}` : '';
      return `memory://${bucket}${prefixPath}`;
    }

    if (client instanceof FileSystemClient) {
      if (client.basePath) {
        return `file://${encodeURI(client.basePath)}`;
      }
    }

    return undefined;
  }

  /**
   * Get a child logger with specific context bindings
   * Child loggers are created ONCE and cached to avoid performance overhead
   *
   * @param {string} name - Logger name (e.g., 'Resource:users', 'Plugin:S3Queue')
   * @param {Object} [bindings={}] - Additional context to bind to logger
   * @returns {Object} Pino child logger instance
   *
   * @example
   * // In Resource constructor
   * this.logger = db.getChildLogger(`Resource:${name}`, { resource: name });
   *
   * // In Plugin initialize()
   * this.logger = db.getChildLogger(`Plugin:${this.name}`, { plugin: this.name });
   */
  getChildLogger(name, bindings = {}) {
    // Create child logger with context
    const childLogger = this.logger.child({
      name,
      ...bindings
    });

    // Apply per-component log level if configured
    const levelOverride = this._childLoggerLevels[name];
    if (levelOverride) {
      childLogger.level = levelOverride;
    }

    return childLogger;
  }

  /**
   * Set log level for a specific child logger by name
   * Useful for runtime adjustment of verbosity per component
   *
   * @param {string} name - Child logger name (e.g., 'Plugin:S3Queue')
   * @param {string} level - Log level (trace, debug, info, warn, error)
   * @returns {void}
   *
   * @example
   * // Enable debug logging for S3Queue plugin
   * db.setChildLevel('Plugin:S3Queue', 'debug');
   */
  setChildLevel(name, level) {
    this._childLoggerLevels[name] = level;
  }

  async connect() {
    this.logger.debug({ databaseId: this.id }, 'connecting to database');

    // Re-register exit listener if it was cleaned up
    this._registerExitListener();

    await this.startPlugins();

    let metadata = null;
    let needsHealing = false;
    let healingLog = [];

    if (await this.client.exists(`s3db.json`)) {
      const [ok, error] = await tryFn(async () => {
        const request = await this.client.getObject(`s3db.json`);
        const rawContent = await streamToString(request?.Body);

        // Try to parse JSON
        const [parseOk, parseError, parsedData] = tryFn(() => JSON.parse(rawContent));

        if (!parseOk) {
          healingLog.push('JSON parsing failed - attempting recovery');
          needsHealing = true;

          // Attempt to fix common JSON issues
          metadata = await this._attemptJsonRecovery(rawContent, healingLog);

          if (!metadata) {
            // Create backup and start fresh
            await this._createCorruptedBackup(rawContent);
            healingLog.push('Created backup of corrupted file - starting with blank metadata');
            metadata = this.blankMetadataStructure();
          }
        } else {
          metadata = parsedData;
        }

        // Validate and heal metadata structure
        const healedMetadata = await this._validateAndHealMetadata(metadata, healingLog);
        if (healedMetadata !== metadata) {
          metadata = healedMetadata;
          needsHealing = true;
        }
      });

      if (!ok) {
        healingLog.push(`Critical error reading s3db.json: ${error.message}`);
        await this._createCorruptedBackup();
        metadata = this.blankMetadataStructure();
        needsHealing = true;
      }
    } else {
      metadata = this.blankMetadataStructure();
      await this.uploadMetadataFile();
    }

    // Upload healed metadata if needed
    if (needsHealing) {
      await this._uploadHealedMetadata(metadata, healingLog);
    }

    this.savedMetadata = metadata;

    // Check for definition changes (this happens before creating resources from createResource calls)
    const definitionChanges = this.detectDefinitionChanges(metadata);
    
    // Create resources from saved metadata using current version
    for (const [name, resourceMetadata] of Object.entries(metadata.resources || {})) {
      const currentVersion = resourceMetadata.currentVersion || 'v1';
      const versionData = resourceMetadata.versions?.[currentVersion];
      
      if (versionData) {
        // Extract configuration from version data at root level
        // Restore ID generator configuration
        let restoredIdGenerator, restoredIdSize;
        if (versionData.idGenerator !== undefined) {
          if (versionData.idGenerator === 'custom_function') {
            // Custom function was used but can't be restored - use default
            restoredIdGenerator = undefined;
            restoredIdSize = versionData.idSize || 22;
          } else if (typeof versionData.idGenerator === 'number') {
            // Size-based generator
            restoredIdGenerator = versionData.idGenerator;
            restoredIdSize = versionData.idSize || versionData.idGenerator;
          }
        } else {
          // Legacy resource without saved ID config
          restoredIdSize = versionData.idSize || 22;
        }

        this._resourcesMap[name] = new Resource({
          name,
          client: this.client,
          database: this, // ensure reference
          version: currentVersion,
          attributes: versionData.attributes,
          behavior: versionData.behavior || 'user-managed',
          passphrase: this.passphrase,
          bcryptRounds: this.bcryptRounds,
          observers: [this],
          cache: this.cache,
          timestamps: versionData.timestamps !== undefined ? versionData.timestamps : false,
          partitions: resourceMetadata.partitions || versionData.partitions || {},
          paranoid: versionData.paranoid !== undefined ? versionData.paranoid : true,
          allNestedObjectsOptional: versionData.allNestedObjectsOptional !== undefined ? versionData.allNestedObjectsOptional : true,
          autoDecrypt: versionData.autoDecrypt !== undefined ? versionData.autoDecrypt : true,
          asyncEvents: versionData.asyncEvents !== undefined ? versionData.asyncEvents : true,
          hooks: this.persistHooks ? this._deserializeHooks(versionData.hooks || {}) : (versionData.hooks || {}),
          versioningEnabled: this.versioningEnabled,
          strictValidation: this.strictValidation,
          map: versionData.map,
          idGenerator: restoredIdGenerator,
          idSize: restoredIdSize
        });
      }
    }

    // Emit definition changes if any were detected
    if (definitionChanges.length > 0) {
      this.emit("db:resource-definitions-changed", {
        changes: definitionChanges,
        metadata: this.savedMetadata
      });
    }

    this.logger.info({
      databaseId: this.id,
      resourceCount: Object.keys(this.resources).length,
      pluginCount: Object.keys(this.pluginRegistry).length
    }, 'database connected');

    this.emit("db:connected", new Date());
  }

  /**
   * Detect changes in resource definitions compared to saved metadata
   * @param {Object} savedMetadata - The metadata loaded from s3db.json
   * @returns {Array} Array of change objects
   */
  detectDefinitionChanges(savedMetadata) {
    const changes = [];
    
    for (const [name, currentResource] of Object.entries(this.resources)) {
      const currentHash = this.generateDefinitionHash(currentResource.export());
      const savedResource = savedMetadata.resources?.[name];
      
      if (!savedResource) {
        changes.push({
          type: 'new',
          resourceName: name,
          currentHash,
          savedHash: null
        });
      } else {
        // Get current version hash from saved metadata
        const currentVersion = savedResource.currentVersion || 'v1';
        const versionData = savedResource.versions?.[currentVersion];
        const savedHash = versionData?.hash;
        
        if (savedHash !== currentHash) {
          changes.push({
            type: 'changed',
            resourceName: name,
            currentHash,
            savedHash,
            fromVersion: currentVersion,
            toVersion: this.getNextVersion(savedResource.versions)
          });
        }
      }
    }
    
    // Check for deleted resources
    for (const [name, savedResource] of Object.entries(savedMetadata.resources || {})) {
      if (!this._resourcesMap[name]) {
        const currentVersion = savedResource.currentVersion || 'v1';
        const versionData = savedResource.versions?.[currentVersion];
        changes.push({
          type: 'deleted',
          resourceName: name,
          currentHash: null,
          savedHash: versionData?.hash,
          deletedVersion: currentVersion
        });
      }
    }
    
    return changes;
  }

  /**
   * Generate a consistent hash for a resource definition
   * @param {Object} definition - Resource definition to hash
   * @param {string} behavior - Resource behavior
   * @returns {string} SHA256 hash
   */
  generateDefinitionHash(definition, behavior = undefined) {
    // Extract only the attributes for hashing (exclude name, version, options, etc.)
    const attributes = definition.attributes;
    // Create a stable version for hashing by excluding dynamic fields
    const stableAttributes = { ...attributes };
    // Remove timestamp fields if they were added automatically
    if (definition.timestamps) {
      delete stableAttributes.createdAt;
      delete stableAttributes.updatedAt;
    }
    // Include behavior and partitions in the hash
    const hashObj = {
      attributes: stableAttributes,
      behavior: behavior || definition.behavior || 'user-managed',
      partitions: definition.partitions || {},
    };
    // Use jsonStableStringify to ensure consistent ordering
    const stableString = jsonStableStringify(hashObj);
    return `sha256:${createHash('sha256').update(stableString).digest('hex')}`;
  }

  /**
   * Get the next version number for a resource
   * @param {Object} versions - Existing versions object
   * @returns {string} Next version string (e.g., 'v1', 'v2')
   */
  getNextVersion(versions = {}) {
    const versionNumbers = Object.keys(versions)
      .filter(v => v.startsWith('v'))
      .map(v => parseInt(v.substring(1)))
      .filter(n => !isNaN(n));

    const maxVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) : 0;
    return `v${maxVersion + 1}`;
  }

  /**
   * Serialize hooks to strings for JSON persistence
   * @param {Object} hooks - Hooks object with event names as keys and function arrays as values
   * @returns {Object} Serialized hooks object
   * @private
   */
  _serializeHooks(hooks) {
    if (!hooks || typeof hooks !== 'object') return hooks;

    const serialized = {};
    for (const [event, hookArray] of Object.entries(hooks)) {
      if (Array.isArray(hookArray)) {
        serialized[event] = hookArray.map(hook => {
          if (typeof hook === 'function') {
            const originalHook = hook.__s3db_original || hook;
            const [ok, err, data] = tryFn(() => ({
              __s3db_serialized_function: true,
              code: originalHook.toString(),
              name: originalHook.name || hook.name || 'anonymous'
            }));

            if (!ok) {
              // 🪵 Warn about hook serialization failure
              this.logger.warn({ event, error: err.message }, `failed to serialize hook for event '${event}'`);
              return null;
            }
            return data;
          }
          return hook;
        });
      } else {
        serialized[event] = hookArray;
      }
    }
    return serialized;
  }

  /**
   * Deserialize hooks from strings back to functions
   * @param {Object} serializedHooks - Serialized hooks object
   * @returns {Object} Deserialized hooks object
   * @private
   */
  _deserializeHooks(serializedHooks) {
    if (!serializedHooks || typeof serializedHooks !== 'object') return serializedHooks;

    const deserialized = {};
    for (const [event, hookArray] of Object.entries(serializedHooks)) {
      if (Array.isArray(hookArray)) {
        deserialized[event] = hookArray.map(hook => {
          if (hook && typeof hook === 'object' && hook.__s3db_serialized_function) {
            const [ok, err, fn] = tryFn(() => {
              // Use Function constructor instead of eval for better security
              const func = new Function('return ' + hook.code)();
              return typeof func === 'function' ? func : null;
            });

            if (!ok || fn === null) {
              // 🪵 Warn about hook deserialization failure
              this.logger.warn({ event, hookName: hook.name, error: err?.message || 'Invalid function' }, `failed to deserialize hook '${hook.name}' for event '${event}'`);
              return null;
            }
            return fn;
          }
          return hook;
        }).filter(hook => hook !== null); // Remove failed deserializations
      } else {
        deserialized[event] = hookArray;
      }
    }
    return deserialized;
  }

  async startPlugins() {
    const db = this

    if (!isEmpty(this.pluginList)) {
      // Instantiate plugin classes, wrapping errors in DatabaseError
      const plugins = [];
      for (const p of this.pluginList) {
        try {
          const plugin = isFunction(p) ? new p(this) : p;
          plugins.push(plugin);
        } catch (error) {
          const pluginName = p.name || p.constructor?.name || 'Unknown';
          throw new DatabaseError(`Failed to instantiate plugin '${pluginName}': ${error.message}`, {
            operation: "startPlugins.instantiate",
            pluginName,
            original: error
          });
        }
      }

      const concurrency = Math.max(1, Number.isFinite(this.executorPool?.concurrency) ? this.executorPool.concurrency : 5);

      const installResult = await PromisePool
        .withConcurrency(concurrency)
        .for(plugins)
        .process(async (plugin) => {
          const pluginName = this._getPluginName(plugin);

          if (typeof plugin.setInstanceName === 'function') {
            plugin.setInstanceName(pluginName);
          } else {
            plugin.instanceName = pluginName;
          }

          await plugin.install(db);

          this.emit('db:plugin:metrics', {
            stage: 'install',
            plugin: pluginName,
            ...this._collectMemorySnapshot()
          });

          // Register the plugin
          this.pluginRegistry[pluginName] = plugin;
          return pluginName;
        });

      if (installResult.errors.length > 0) {
        const errorInfo = installResult.errors[0];
        const failedPlugin = errorInfo.item;
        const error = errorInfo.raw || errorInfo.error || errorInfo;
        const failedName = this._getPluginName(failedPlugin);
        throw new DatabaseError(`Failed to install plugin '${failedName}': ${error?.message || error}`, {
          operation: "startPlugins.install",
          pluginName: failedName,
          original: error
        });
      }

      const startResult = await PromisePool
        .withConcurrency(concurrency)
        .for(plugins)
        .process(async (plugin) => {
          const pluginName = this._getPluginName(plugin);
          await plugin.start();
          this.emit('db:plugin:metrics', {
            stage: 'start',
            plugin: pluginName,
            ...this._collectMemorySnapshot()
          });
          return plugin;
        });

      if (startResult.errors.length > 0) {
        const errorInfo = startResult.errors[0];
        const failedPlugin = errorInfo.item;
        const error = errorInfo.raw || errorInfo.error || errorInfo;
        const failedName = this._getPluginName(failedPlugin);
        throw new DatabaseError(`Failed to start plugin '${failedName}': ${error?.message || error}`, {
          operation: "startPlugins.start",
          pluginName: failedName,
          original: error
        });
      }
    }
  }

  /**
   * Register and setup a plugin
   * @param {Plugin} plugin - Plugin instance to register
   * @param {string} [name] - Optional name for the plugin (defaults to plugin.constructor.name)
   */
  /**
   * Get the normalized plugin name
   * @private
   */
  _getPluginName(plugin, customName = null) {
    return customName || plugin.constructor.name.replace('Plugin', '').toLowerCase();
  }

  _collectMemorySnapshot() {
    const usage = process.memoryUsage();
    const toMB = (bytes) => Math.round((bytes || 0) / (1024 * 1024));

    const snapshot = {
      timestamp: new Date().toISOString(),
      rssMB: toMB(usage.rss),
      heapUsedMB: toMB(usage.heapUsed),
      heapTotalMB: toMB(usage.heapTotal),
      externalMB: toMB(usage.external)
    };

    if (usage.arrayBuffers !== undefined) {
      snapshot.arrayBuffersMB = toMB(usage.arrayBuffers);
    }

    return snapshot;
  }

  /**
   * Get or create a GlobalCoordinatorService for the given namespace
   * Lazy instantiation: service is created on first request
   * @param {string} namespace - Namespace for coordination
   * @returns {Promise<GlobalCoordinatorService>}
   */
  async getGlobalCoordinator(namespace, options = {}) {
    if (!namespace) {
      throw new Error('Database.getGlobalCoordinator: namespace is required');
    }

    const { autoStart = false } = options;

    // Return existing service if already created
    if (this._globalCoordinators.has(namespace)) {
      return this._globalCoordinators.get(namespace);
    }

    // Lazy instantiation: create service on first request
    try {
      const { GlobalCoordinatorService } = await import('./plugins/concerns/global-coordinator-service.class.js');

      const service = new GlobalCoordinatorService({
        namespace,
        database: this,
        config: {
          heartbeatInterval: 5000,
          heartbeatJitter: 1000,
          leaseTimeout: 15000,
          workerTimeout: 20000,
          diagnosticsEnabled: this.verbose
        }
      });

      // Start the service if database is connected
      if (autoStart && this.isConnected()) {
        await service.start();
      }

      // Store and return
      this._globalCoordinators.set(namespace, service);
      return service;

    } catch (err) {
      throw new DatabaseError('Failed to initialize global coordinator service', {
        operation: 'getGlobalCoordinator',
        namespace,
        cause: err?.message
      });
    }
  }

  async usePlugin(plugin, name = null) {
    const pluginName = this._getPluginName(plugin, name);

    if (typeof plugin.setInstanceName === 'function') {
      plugin.setInstanceName(pluginName);
    } else {
      plugin.instanceName = pluginName;
    }

    // Pass ProcessManager to plugin (prevents memory leaks)
    if (!plugin.processManager) {
      plugin.processManager = this.processManager;
    }

    // Pass CronManager to plugin (prevents memory leaks)
    if (!plugin.cronManager) {
      plugin.cronManager = this.cronManager;
    }

    // 🪵 Pass logger to plugin (creates child logger with plugin context)
    if (!plugin.logger && this.logger) {
      plugin.logger = this.getChildLogger(`Plugin:${pluginName}`, { plugin: pluginName });
    }

    // Register the plugin
    this.plugins[pluginName] = plugin;

    // Install the plugin if database is connected
    if (this.isConnected()) {
      await plugin.install(this);
      await plugin.start();
    }

    return plugin;
  }

  /**
   * Uninstall a plugin and optionally purge its data
   * @param {string} name - Plugin name
   * @param {Object} options - Uninstall options
   * @param {boolean} options.purgeData - Delete all plugin data from S3 (default: false)
   */
  async uninstallPlugin(name, options = {}) {
    const pluginName = name.toLowerCase().replace('plugin', '');
    const plugin = this.plugins[pluginName] || this.pluginRegistry[pluginName];

    if (!plugin) {
      throw new DatabaseError(`Plugin '${name}' not found`, {
        operation: 'uninstallPlugin',
        pluginName: name,
        availablePlugins: Object.keys(this.pluginRegistry),
        suggestion: 'Check plugin name or list available plugins using Object.keys(db.pluginRegistry)'
      });
    }

    // Stop the plugin first
    if (plugin.stop) {
      await plugin.stop();
    }

    // Uninstall the plugin
    if (plugin.uninstall) {
      await plugin.uninstall(options);
    }

    // Remove from registries
    delete this.plugins[pluginName];
    delete this.pluginRegistry[pluginName];

    // Remove from plugin list
    const index = this.pluginList.indexOf(plugin);
    if (index > -1) {
      this.pluginList.splice(index, 1);
    }

    this.emit('db:plugin:uninstalled', { name: pluginName, plugin });
  }

  /**
   * Schedule a deferred metadata upload (debounced to prevent O(n²) complexity)
   * @private
   */
  _scheduleMetadataUpload() {
    if (!this.deferMetadataWrites) {
      // If deferred writes are disabled, upload immediately
      return this.uploadMetadataFile();
    }

    // Clear existing debounce timer
    if (this._metadataUploadDebounce) {
      clearTimeout(this._metadataUploadDebounce);
    }

    this._metadataUploadPending = true;

    // Schedule the upload (async, non-blocking)
    this._metadataUploadDebounce = setTimeout(() => {
      if (this._metadataUploadPending) {
        // Fire and forget - don't await here
        this.uploadMetadataFile()
          .then(() => {
            this._metadataUploadPending = false;
          })
          .catch(err => {
            // Log error but don't throw (avoid unhandled rejection)
            // 🪵 Error logging for metadata upload failure
            this.logger.error({ error: err.message }, 'metadata upload failed');
            this._metadataUploadPending = false;
          });
      }
    }, this.metadataWriteDelay);

    // Return immediately (non-blocking)
    return Promise.resolve();
  }

  /**
   * Immediately flush any pending metadata uploads
   * @returns {Promise<void>}
   * @public
   */
  async flushMetadata() {
    // Clear debounce timer
    if (this._metadataUploadDebounce) {
      clearTimeout(this._metadataUploadDebounce);
      this._metadataUploadDebounce = null;
    }

    // Upload if pending
    if (this._metadataUploadPending) {
      await this.uploadMetadataFile();
      this._metadataUploadPending = false;
    }
  }

  async uploadMetadataFile() {
    const metadata = {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      lastUpdated: new Date().toISOString(),
      resources: {}
    };

    // Generate versioned definition for each resource
    Object.entries(this.resources).forEach(([name, resource]) => {
      const resourceDef = resource.export();
      const serializableDef = this._buildMetadataDefinition(resourceDef);
      const definitionHash = this.generateDefinitionHash(serializableDef);
      
      // Check if resource exists in saved metadata
      const existingResource = this.savedMetadata?.resources?.[name];
      const currentVersion = existingResource?.currentVersion || 'v1';
      const existingVersionData = existingResource?.versions?.[currentVersion];
      
      let version, isNewVersion;
      
      // If hash is different, create new version
      if (!existingVersionData || existingVersionData.hash !== definitionHash) {
        version = this.getNextVersion(existingResource?.versions);
        isNewVersion = true;
      } else {
        version = currentVersion;
        isNewVersion = false;
      }

      metadata.resources[name] = {
        currentVersion: version,
        partitions: resource.config.partitions || {},
        createdBy: existingResource?.createdBy || resource.config.createdBy || 'user',
        versions: {
          ...existingResource?.versions, // Preserve previous versions
          [version]: {
            hash: definitionHash,
            attributes: serializableDef.attributes,
            behavior: serializableDef.behavior || 'user-managed',
            timestamps: serializableDef.timestamps,
            partitions: serializableDef.partitions,
            paranoid: serializableDef.paranoid,
            allNestedObjectsOptional: serializableDef.allNestedObjectsOptional,
            autoDecrypt: serializableDef.autoDecrypt,
            cache: serializableDef.cache,
            asyncEvents: serializableDef.asyncEvents,
            hooks: serializableDef.hooks,
            idSize: resource.idSize,
            idGenerator: resource.idGeneratorType,
            createdAt: isNewVersion ? new Date().toISOString() : existingVersionData?.createdAt
          }
        }
      };

      // Update resource version safely
      if (resource.version !== version) {
        resource.version = version;
        resource.emit('versionUpdated', { oldVersion: currentVersion, newVersion: version });
      }
    });

    await this.client.putObject({
      key: 's3db.json',
      body: JSON.stringify(metadata, null, 2),
      contentType: 'application/json'
    });

    this.savedMetadata = metadata;
    this.emit('db:metadata-uploaded', metadata);
  }

  blankMetadataStructure() {
    return {
      version: `1`,
      s3dbVersion: this.s3dbVersion,
      lastUpdated: new Date().toISOString(),
      resources: {},
    };
  }

  /**
   * Produce a metadata-friendly copy of the resource definition that strips heavy references
   * such as raw hook functions (which capture large closures) while keeping useful diagnostics.
   * @param {Object} resourceDef - Result from resource.export()
   * @returns {Object} Serializable definition used for hashing and metadata persistence
   * @private
   */
  _buildMetadataDefinition(resourceDef = {}) {
    const {
      hooks,
      ...rest
    } = resourceDef || {};

    const serializable = { ...rest };

    if (hooks && this.persistHooks) {
      serializable.hooks = this._serializeHooks(hooks);
    } else if (hooks) {
      serializable.hooks = this._summarizeHooks(hooks);
    } else {
      serializable.hooks = {};
    }

    return serializable;
  }

  /**
   * Summarize hook arrays into lightweight metadata to avoid retaining heavy closures
   * while still exposing diagnostic information such as handler counts and names.
   * @param {Object} hooks - Resource hooks map
   * @returns {Object} Summary map
   * @private
   */
  _summarizeHooks(hooks = {}) {
    if (!hooks || typeof hooks !== 'object') {
      return {};
    }

    const summary = {};

    for (const [event, handlers] of Object.entries(hooks)) {
      if (!Array.isArray(handlers) || handlers.length === 0) {
        continue;
      }

      summary[event] = {
        count: handlers.length,
        handlers: handlers.map((handler) => {
          if (typeof handler !== 'function') {
            return { name: null, length: null, type: typeof handler };
          }
          return {
            name: handler.name || null,
            length: handler.length ?? null,
            type: 'function'
          };
        })
      };
    }

    return summary;
  }

  /**
   * Attempt to recover JSON from corrupted content
   */
  async _attemptJsonRecovery(content, healingLog) {
    if (!content || typeof content !== 'string') {
      healingLog.push('Content is empty or not a string');
      return null;
    }

    // Try common JSON fixes
    const fixes = [
      // Remove trailing commas
      () => content.replace(/,(\s*[}\]])/g, '$1'),
      // Add missing quotes to keys
      () => content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":'),
      // Fix incomplete objects by adding closing braces
      () => {
        let openBraces = 0;
        let openBrackets = 0;
        let inString = false;
        let escaped = false;
        
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          
          if (escaped) {
            escaped = false;
            continue;
          }
          
          if (char === '\\') {
            escaped = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') openBraces++;
            else if (char === '}') openBraces--;
            else if (char === '[') openBrackets++;
            else if (char === ']') openBrackets--;
          }
        }
        
        let fixed = content;
        while (openBrackets > 0) {
          fixed += ']';
          openBrackets--;
        }
        while (openBraces > 0) {
          fixed += '}';
          openBraces--;
        }
        
        return fixed;
      }
    ];

    for (const [index, fix] of fixes.entries()) {
      const [ok, err, parsed] = tryFn(() => {
        const fixedContent = fix();
        return JSON.parse(fixedContent);
      });

      if (ok) {
        healingLog.push(`JSON recovery successful using fix #${index + 1}`);
        return parsed;
      }
      // Try next fix
    }

    healingLog.push('All JSON recovery attempts failed');
    return null;
  }

  /**
   * Validate and heal metadata structure
   */
  async _validateAndHealMetadata(metadata, healingLog) {
    if (!metadata || typeof metadata !== 'object') {
      healingLog.push('Metadata is not an object - using blank structure');
      return this.blankMetadataStructure();
    }

    let healed = { ...metadata };
    let changed = false;

    // Ensure required fields exist and have correct types
    if (!healed.version || typeof healed.version !== 'string') {
      if (healed.version && typeof healed.version === 'number') {
        healed.version = String(healed.version);
        healingLog.push('Converted version from number to string');
        changed = true;
      } else {
        healed.version = '1';
        healingLog.push('Added missing or invalid version field');
        changed = true;
      }
    }

    if (!healed.s3dbVersion || typeof healed.s3dbVersion !== 'string') {
      if (healed.s3dbVersion && typeof healed.s3dbVersion !== 'string') {
        healed.s3dbVersion = String(healed.s3dbVersion);
        healingLog.push('Converted s3dbVersion to string');
        changed = true;
      } else {
        healed.s3dbVersion = this.s3dbVersion;
        healingLog.push('Added missing s3dbVersion field');
        changed = true;
      }
    }

    if (!healed.resources || typeof healed.resources !== 'object' || Array.isArray(healed.resources)) {
      healed.resources = {};
      healingLog.push('Fixed invalid resources field');
      changed = true;
    }

    if (!healed.lastUpdated) {
      healed.lastUpdated = new Date().toISOString();
      healingLog.push('Added missing lastUpdated field');
      changed = true;
    }

    // Validate and heal resource structures
    const validResources = {};
    for (const [name, resource] of Object.entries(healed.resources)) {
      const healedResource = this._healResourceStructure(name, resource, healingLog);
      if (healedResource) {
        validResources[name] = healedResource;
        if (healedResource !== resource) {
          changed = true;
        }
      } else {
        healingLog.push(`Removed invalid resource: ${name}`);
        changed = true;
      }
    }

    healed.resources = validResources;

    return changed ? healed : metadata;
  }

  /**
   * Heal individual resource structure
   */
  _healResourceStructure(name, resource, healingLog) {
    if (!resource || typeof resource !== 'object') {
      healingLog.push(`Resource ${name}: invalid structure`);
      return null;
    }

    let healed = { ...resource };
    let changed = false;

    // Ensure currentVersion exists
    if (!healed.currentVersion) {
      healed.currentVersion = 'v1';
      healingLog.push(`Resource ${name}: added missing currentVersion`);
      changed = true;
    }

    // Ensure versions object exists
    if (!healed.versions || typeof healed.versions !== 'object' || Array.isArray(healed.versions)) {
      healed.versions = {};
      healingLog.push(`Resource ${name}: fixed invalid versions object`);
      changed = true;
    }

    // Ensure partitions object exists
    if (!healed.partitions || typeof healed.partitions !== 'object' || Array.isArray(healed.partitions)) {
      healed.partitions = {};
      healingLog.push(`Resource ${name}: fixed invalid partitions object`);
      changed = true;
    }

    // Check if currentVersion exists in versions
    const currentVersion = healed.currentVersion;
    if (!healed.versions[currentVersion]) {
      // Try to find a valid version or fall back to v0
      const availableVersions = Object.keys(healed.versions);
      if (availableVersions.length > 0) {
        healed.currentVersion = availableVersions[0];
        healingLog.push(`Resource ${name}: changed currentVersion from ${currentVersion} to ${healed.currentVersion}`);
        changed = true;
      } else {
        // No valid versions exist - resource cannot be healed
        healingLog.push(`Resource ${name}: no valid versions found - removing resource`);
        return null;
      }
    }

    // Validate version data
    const versionData = healed.versions[healed.currentVersion];
    if (!versionData || typeof versionData !== 'object') {
      healingLog.push(`Resource ${name}: invalid version data - removing resource`);
      return null;
    }

    // Ensure required version fields
    if (!versionData.attributes || typeof versionData.attributes !== 'object') {
      healingLog.push(`Resource ${name}: missing or invalid attributes - removing resource`);
      return null;
    }

    // Heal hooks structure
    if (versionData.hooks) {
      const healedHooks = this._healHooksStructure(versionData.hooks, name, healingLog);
      if (healedHooks !== versionData.hooks) {
        healed.versions[healed.currentVersion].hooks = healedHooks;
        changed = true;
      }
    }

    return changed ? healed : resource;
  }

  /**
   * Heal hooks structure
   */
  _healHooksStructure(hooks, resourceName, healingLog) {
    if (!hooks || typeof hooks !== 'object') {
      healingLog.push(`Resource ${resourceName}: invalid hooks structure - using empty hooks`);
      return {};
    }

    const healed = {};
    let changed = false;

    for (const [event, hookArray] of Object.entries(hooks)) {
      if (Array.isArray(hookArray)) {
        // Filter out null, undefined, empty strings, and invalid hooks
        const validHooks = hookArray.filter(hook => 
          hook !== null && 
          hook !== undefined && 
          hook !== ""
        );
        healed[event] = validHooks;
        
        if (validHooks.length !== hookArray.length) {
          healingLog.push(`Resource ${resourceName}: cleaned invalid hooks for event ${event}`);
          changed = true;
        }
      } else {
        healingLog.push(`Resource ${resourceName}: hooks for event ${event} is not an array - removing`);
        changed = true;
      }
    }

    return changed ? healed : hooks;
  }

  /**
   * Create backup of corrupted file
   */
  async _createCorruptedBackup(content = null) {
    const [ok, err] = await tryFn(async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupKey = `s3db.json.corrupted.${timestamp}.backup`;

      if (!content) {
        const [readOk, readErr, readData] = await tryFn(async () => {
          const request = await this.client.getObject(`s3db.json`);
          return await streamToString(request?.Body);
        });
        content = readOk ? readData : 'Unable to read corrupted file content';
      }

      await this.client.putObject({
        key: backupKey,
        body: content,
        contentType: 'application/json'
      });

      // 🪵 Info log: backup created
      this.logger.info({ backupKey }, `created backup of corrupted s3db.json as ${backupKey}`);
    });

    if (!ok) {
      // 🪵 Warn log: backup creation failed
      this.logger.warn({ error: err.message }, `failed to create backup: ${err.message}`);
    }
  }

  /**
   * Upload healed metadata with logging
   */
  async _uploadHealedMetadata(metadata, healingLog) {
    const [ok, err] = await tryFn(async () => {
      // 🪵 Warn log: self-healing operations
      if (healingLog.length > 0) {
        this.logger.warn({ healingOperations: healingLog }, 'S3DB self-healing operations');
        healingLog.forEach(log => this.logger.warn(`  - ${log}`));
      }

      // Update lastUpdated timestamp
      metadata.lastUpdated = new Date().toISOString();

      await this.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(metadata, null, 2),
        contentType: 'application/json'
      });

      this.emit('db:metadata-healed', { healingLog, metadata });

      // 🪵 Info log: healed metadata uploaded
      this.logger.info('successfully uploaded healed metadata');
    });

    if (!ok) {
      // 🪵 Error log: healed metadata upload failed
      this.logger.error({ error: err.message }, `failed to upload healed metadata: ${err.message}`);
      throw err;
    }
  }

  /**
   * Check if a resource exists by name
   * @param {string} name - Resource name
   * @returns {boolean} True if resource exists, false otherwise
   */
  resourceExists(name) {
    return !!this._resourcesMap[name];
  }

  /**
   * Check if a resource exists with the same definition hash
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.attributes - Resource attributes
   * @param {string} [config.behavior] - Resource behavior
   * @returns {Object} Result with exists and hash information
   */
  resourceExistsWithSameHash({ name, attributes, behavior = 'user-managed', partitions = {} }) {
    if (!this._resourcesMap[name]) {
      return { exists: false, sameHash: false, hash: null };
    }

    const existingResource = this._resourcesMap[name];
    const existingHash = this.generateDefinitionHash(existingResource.export());

    // Create a mock resource to calculate the new hash
    const mockResource = new Resource({
      name,
      attributes,
      behavior,
      partitions,
      client: this.client,
      version: existingResource.version,
      passphrase: this.passphrase,
      bcryptRounds: this.bcryptRounds,
      versioningEnabled: this.versioningEnabled
    });
    
    const newHash = this.generateDefinitionHash(mockResource.export());
    
    return {
      exists: true,
      sameHash: existingHash === newHash,
      hash: newHash,
      existingHash
    };
  }

  /**
   * Create or update a resource in the database
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.attributes - Resource attributes schema
   * @param {string} [config.behavior='user-managed'] - Resource behavior strategy
   * @param {Object} [config.hooks] - Resource hooks
   * @param {boolean} [config.asyncEvents=true] - Whether events should be emitted asynchronously
   * @param {boolean} [config.timestamps=false] - Enable automatic timestamps
   * @param {Object} [config.partitions={}] - Partition definitions
   * @param {boolean} [config.paranoid=true] - Security flag for dangerous operations
   * @param {boolean} [config.cache=false] - Enable caching
   * @param {boolean} [config.autoDecrypt=true] - Auto-decrypt secret fields
   * @param {Function|number} [config.idGenerator] - Custom ID generator or size
   * @param {number} [config.idSize=22] - Size for auto-generated IDs
   * @param {string} [config.createdBy='user'] - Who created this resource ('user', 'plugin', or plugin name)
   * @returns {Promise<Resource>} The created or updated resource
   */
  /**
   * Normalize partitions config from array or object format
   * @param {Array|Object} partitions - Partitions config
   * @param {Object} attributes - Resource attributes
   * @returns {Object} Normalized partitions object
   * @private
   */
  _normalizePartitions(partitions, attributes) {
    // If already an object, return as-is
    if (!Array.isArray(partitions)) {
      return partitions || {};
    }

    // Transform array into object with auto-generated names
    const normalized = {};

    for (const fieldName of partitions) {
      if (typeof fieldName !== 'string') {
        throw new SchemaError('Invalid partition field type', {
          fieldName,
          receivedType: typeof fieldName,
          retriable: false,
          suggestion: 'Use string field names when declaring partitions (e.g. ["status", "region"]).'
        });
      }

      if (!attributes[fieldName]) {
        throw new SchemaError(`Partition field '${fieldName}' not found in attributes`, {
          fieldName,
          availableFields: Object.keys(attributes),
          retriable: false,
          suggestion: 'Ensure the partition field exists in the resource attributes definition.'
        });
      }

      // Generate partition name: byFieldName (capitalize first letter)
      const partitionName = `by${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;

      // Extract field type from attributes
      const fieldDef = attributes[fieldName];
      let fieldType = 'string'; // default

      if (typeof fieldDef === 'string') {
        // String format: "string|required" -> extract "string"
        fieldType = fieldDef.split('|')[0].trim();
      } else if (typeof fieldDef === 'object' && fieldDef.type) {
        // Object format: { type: 'string', required: true }
        fieldType = fieldDef.type;
      }

      normalized[partitionName] = {
        fields: {
          [fieldName]: fieldType
        }
      };
    }

    return normalized;
  }

  async createResource({ name, attributes, behavior = 'user-managed', hooks, middlewares, ...config }) {
    // Normalize partitions (support array shorthand)
    const normalizedPartitions = this._normalizePartitions(config.partitions, attributes);

    if (this._resourcesMap[name]) {
      const existingResource = this._resourcesMap[name];
      // Update configuration
      Object.assign(existingResource.config, {
        cache: this.cache,
        ...config,
        partitions: normalizedPartitions
      });
      if (behavior) {
        existingResource.behavior = behavior;
      }
      // Ensure versioning configuration is set
      existingResource.versioningEnabled = this.versioningEnabled;
      existingResource.updateAttributes(attributes);
      // NOVO: Mescla hooks se fornecidos (append ao final)
      if (hooks) {
        for (const [event, hooksArr] of Object.entries(hooks)) {
          if (Array.isArray(hooksArr) && existingResource.hooks[event]) {
            for (const fn of hooksArr) {
              if (typeof fn === 'function') {
                existingResource.hooks[event].push(fn.bind(existingResource));
              }
            }
          }
        }
      }
      // Apply middlewares if provided
      if (middlewares) {
        this._applyMiddlewares(existingResource, middlewares);
      }

      const disableEventsFlag = config.disableEvents !== undefined ? config.disableEvents : this.disableResourceEvents;
      existingResource.eventsDisabled = disableEventsFlag;

      // Only upload metadata if hash actually changed
      const newHash = this.generateDefinitionHash(existingResource.export(), existingResource.behavior);
      const existingMetadata = this.savedMetadata?.resources?.[name];
      const currentVersion = existingMetadata?.currentVersion || 'v1';
      const existingVersionData = existingMetadata?.versions?.[currentVersion];
      if (!existingVersionData || existingVersionData.hash !== newHash) {
        await this._scheduleMetadataUpload();
      }
      this.emit("db:resource-updated", name);
      return existingResource;
    }
    const existingMetadata = this.savedMetadata?.resources?.[name];
    const version = existingMetadata?.currentVersion || 'v1';
    const resource = new Resource({
      name,
      client: this.client,
      version: config.version !== undefined ? config.version : version,
      attributes,
      behavior,
      passphrase: config.passphrase !== undefined ? config.passphrase : this.passphrase,
      bcryptRounds: config.bcryptRounds !== undefined ? config.bcryptRounds : this.bcryptRounds,
      observers: [this],
      cache: config.cache !== undefined ? config.cache : this.cache,
      timestamps: config.timestamps !== undefined ? config.timestamps : false,
      partitions: normalizedPartitions,
      paranoid: config.paranoid !== undefined ? config.paranoid : true,
      allNestedObjectsOptional: config.allNestedObjectsOptional !== undefined ? config.allNestedObjectsOptional : true,
      autoDecrypt: config.autoDecrypt !== undefined ? config.autoDecrypt : true,
      hooks: hooks || {},
      versioningEnabled: this.versioningEnabled,
      strictValidation: config.strictValidation !== undefined ? config.strictValidation : this.strictValidation,
      map: config.map,
      idGenerator: config.idGenerator,
      idSize: config.idSize,
      asyncEvents: config.asyncEvents,
      asyncPartitions: config.asyncPartitions !== undefined ? config.asyncPartitions : true,
      events: config.events || {},
      disableEvents: config.disableEvents !== undefined ? config.disableEvents : this.disableResourceEvents,
      createdBy: config.createdBy || 'user'
    });
    resource.database = this;
    this._resourcesMap[name] = resource;

    // Apply middlewares if provided
    if (middlewares) {
      this._applyMiddlewares(resource, middlewares);
    }

    await this._scheduleMetadataUpload();
    this.emit("db:resource-created", name);
    this.emit('db:resource:metrics', {
      resource: name,
      ...this._collectMemorySnapshot()
    });
    return resource;
  }

  /**
   * Apply middlewares to a resource
   * @param {Resource} resource - Resource instance
   * @param {Array|Object} middlewares - Middlewares config
   * @private
   */
  _applyMiddlewares(resource, middlewares) {
    // Format 1: Array of functions (applies to all methods)
    if (Array.isArray(middlewares)) {
      // Apply to all middleware-supported methods
      const methods = resource._middlewareMethods || [
        'get', 'list', 'listIds', 'getAll', 'count', 'page',
        'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
        'content', 'hasContent', 'query', 'getFromPartition', 'setContent',
        'deleteContent', 'replace', 'patch'
      ];

      for (const method of methods) {
        for (const middleware of middlewares) {
          if (typeof middleware === 'function') {
            resource.useMiddleware(method, middleware);
          }
        }
      }
      return;
    }

    // Format 2: Object with method-specific middlewares
    if (typeof middlewares === 'object' && middlewares !== null) {
      for (const [method, fns] of Object.entries(middlewares)) {
        if (method === '*') {
          // Apply to all methods
          const methods = resource._middlewareMethods || [
            'get', 'list', 'listIds', 'getAll', 'count', 'page',
            'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
            'content', 'hasContent', 'query', 'getFromPartition', 'setContent',
            'deleteContent', 'replace', 'patch'
          ];

          const middlewareArray = Array.isArray(fns) ? fns : [fns];
          for (const targetMethod of methods) {
            for (const middleware of middlewareArray) {
              if (typeof middleware === 'function') {
                resource.useMiddleware(targetMethod, middleware);
              }
            }
          }
        } else {
          // Apply to specific method
          const middlewareArray = Array.isArray(fns) ? fns : [fns];
          for (const middleware of middlewareArray) {
            if (typeof middleware === 'function') {
              resource.useMiddleware(method, middleware);
            }
          }
        }
      }
    }
  }

  /**
   * List all resource names
   * @returns {Array} Array of resource names
   */
  async listResources() {
    return Object.keys(this.resources).map(name => ({ name }));
  }

  /**
   * Get a specific resource by name
   * @param {string} name - Resource name
   * @returns {Resource} Resource instance
   */
  async getResource(name) {
    if (!this._resourcesMap[name]) {
      throw new ResourceNotFound({
        bucket: this.client.config.bucket,
        resourceName: name,
        id: name
      });
    }
    return this._resourcesMap[name];
  }

  /**
   * Get database configuration
   * @returns {Object} Configuration object
   */
  get config() {
    return {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      taskExecutor: this.taskExecutor,
      verbose: this.verbose
    };
  }

  isConnected() {
    return !!this.savedMetadata;
  }

  async disconnect() {
    this.logger.debug({ databaseId: this.id }, 'disconnecting from database');

    // Flush any pending metadata uploads before disconnect
    await this.flushMetadata();

    // Emit disconnected event BEFORE removing listeners (Fix #2)
    await this.emit('disconnected', new Date());

    // Silently ignore all errors during disconnect
    await tryFn(async () => {
      // 0. Stop global coordinator services
      if (this._globalCoordinators && this._globalCoordinators.size > 0) {
        for (const [namespace, service] of this._globalCoordinators) {
          await tryFn(async () => {
            if (service && typeof service.stop === 'function') {
              await service.stop();
            }
          });
        }
        this._globalCoordinators.clear();
      }

      // 1. Defense in depth: Clean up plugins (Layer 1 - immediate cleanup)
      if (this.pluginList && this.pluginList.length > 0) {
        // MEMORY: First pass - immediate listener cleanup for failsafe
        // This is redundant with Plugin.stop() but guarantees cleanup even if stop() fails
        for (const plugin of this.pluginList) {
          if (plugin && typeof plugin.removeAllListeners === 'function') {
            plugin.removeAllListeners();
          }
        }
        // Also stop plugins if they have a stop method (includes second removeAllListeners() call)
        const stopConcurrency = Math.max(1, Number.isFinite(this.executorPool?.concurrency) ? this.executorPool.concurrency : 5);
        await PromisePool
          .withConcurrency(stopConcurrency)
          .for(this.pluginList)
          .process(async (plugin) => {
            // Silently ignore errors on exit
            await tryFn(async () => {
              if (plugin && typeof plugin.stop === 'function') {
                await plugin.stop();
              }
            });
          });
      }

      // 2. Defense in depth: Clean up resources (Layer 2 - resource lifecycle)
      if (this.resources && Object.keys(this.resources).length > 0) {
        for (const [name, resource] of Object.entries(this.resources)) {
          // Silently ignore errors on exit
          await tryFn(() => {
            // MEMORY: Resource disposal emits 'resource:disposed' event then removes all listeners
            // This gives plugins one final chance to clean up resource-specific state
            if (resource && typeof resource.dispose === 'function') {
              resource.dispose();
            }
            // Cleanup plugin wrappers and middlewares
            if (resource._pluginWrappers) {
              resource._pluginWrappers.clear();
            }
            if (resource._pluginMiddlewares) {
              resource._pluginMiddlewares = {};
            }
            if (resource.observers && Array.isArray(resource.observers)) {
              resource.observers = [];
            }
          });
        }
        // Instead of reassigning, clear in place
        Object.keys(this.resources).forEach(k => delete this._resourcesMap[k]);
      }

      // 3. Remove all listeners from the client
      if (this.client && typeof this.client.removeAllListeners === 'function') {
        this.client.removeAllListeners();
      }

      // 4. Emit disconnected event BEFORE removing database listeners (race condition fix)
      // This ensures listeners can actually receive the event
      await this.emit('db:disconnected', new Date());

      // 5. Remove all listeners from the database itself
      this.removeAllListeners();

      // 6. Cleanup process exit listener (memory leak fix)
      if (this._exitListener && typeof process !== 'undefined') {
        process.off('exit', this._exitListener);
        this._exitListener = null;
        this._exitListenerRegistered = false;
      }

      // 7. Clear saved metadata and plugin lists
      this.savedMetadata = null;
      this.plugins = {};
      this.pluginList = [];
    });
  }

  /**
   * Initialize hooks system for database operations
   * @private
   */
  _initHooks() {
    // Map of hook name -> array of hook functions
    this._hooks = new Map();
    
    // Define available hooks
    this._hookEvents = [
      'beforeConnect', 'afterConnect',
      'beforeCreateResource', 'afterCreateResource',
      'beforeUploadMetadata', 'afterUploadMetadata',
      'beforeDisconnect', 'afterDisconnect',
      'resourceCreated', 'resourceUpdated'
    ];

    // Initialize hook arrays
    for (const event of this._hookEvents) {
      this._hooks.set(event, []);
    }

    // Wrap hookable methods
    this._wrapHookableMethods();
  }

  /**
   * Wrap methods that can have hooks
   * @private
   */
  _wrapHookableMethods() {
    if (this._hooksInstalled) return; // Already wrapped

    // Store original methods
    this._originalConnect = this.connect.bind(this);
    this._originalCreateResource = this.createResource.bind(this);
    this._originalUploadMetadataFile = this.uploadMetadataFile.bind(this);
    this._originalDisconnect = this.disconnect.bind(this);

    // Wrap connect
    this.connect = async (...args) => {
      await this._executeHooks('beforeConnect', { args });
      const result = await this._originalConnect(...args);
      await this._executeHooks('afterConnect', { result, args });
      return result;
    };

    // Wrap createResource
    this.createResource = async (config) => {
      await this._executeHooks('beforeCreateResource', { config });
      const resource = await this._originalCreateResource(config);
      await this._executeHooks('afterCreateResource', { resource, config });
      return resource;
    };

    // Wrap uploadMetadataFile
    this.uploadMetadataFile = async (...args) => {
      await this._executeHooks('beforeUploadMetadata', { args });
      const result = await this._originalUploadMetadataFile(...args);
      await this._executeHooks('afterUploadMetadata', { result, args });
      return result;
    };

    // Wrap disconnect
    this.disconnect = async (...args) => {
      await this._executeHooks('beforeDisconnect', { args });
      const result = await this._originalDisconnect(...args);
      await this._executeHooks('afterDisconnect', { result, args });
      return result;
    };

    this._hooksInstalled = true;
  }

  /**
   * Add a hook for a specific database event
   * @param {string} event - Hook event name
   * @param {Function} fn - Hook function
   * @example
   * database.addHook('afterCreateResource', async ({ resource }) => {
   *   console.log('Resource created:', resource.name);
   * });
   */
  addHook(event, fn) {
    if (!this._hooks) this._initHooks();
    if (!this._hooks.has(event)) {
      throw new DatabaseError(`Unknown hook event: ${event}`, {
        operation: 'addHook',
        invalidEvent: event,
        availableEvents: this._hookEvents,
        suggestion: `Use one of the available hook events: ${this._hookEvents.join(', ')}`
      });
    }
    if (typeof fn !== 'function') {
      throw new DatabaseError('Hook function must be a function', {
        operation: 'addHook',
        event,
        receivedType: typeof fn,
        suggestion: 'Provide a function that will be called when the hook event occurs'
      });
    }
    this._hooks.get(event).push(fn);
  }

  /**
   * Execute hooks for a specific event
   * @param {string} event - Hook event name
   * @param {Object} context - Context data to pass to hooks
   * @private
   */
  async _executeHooks(event, context = {}) {
    if (!this._hooks || !this._hooks.has(event)) return;

    const hooks = this._hooks.get(event);
    for (const hook of hooks) {
      const [ok, error] = await tryFn(() => hook({ database: this, ...context }));
      if (!ok) {
        // Emit error event
        this.emit('hookError', { event, error, context });

        // In strict mode, throw on first error instead of continuing
        if (this.strictHooks) {
          throw new DatabaseError(`Hook execution failed for event '${event}': ${error.message}`, {
            event,
            originalError: error,
            context
          });
        }
      }
    }
  }

  /**
   * Remove a hook for a specific event
   * @param {string} event - Hook event name
   * @param {Function} fn - Hook function to remove
   */
  removeHook(event, fn) {
    if (!this._hooks || !this._hooks.has(event)) return;
    
    const hooks = this._hooks.get(event);
    const index = hooks.indexOf(fn);
    if (index > -1) {
      hooks.splice(index, 1);
    }
  }

  /**
   * Get all hooks for a specific event
   * @param {string} event - Hook event name
   * @returns {Function[]} Array of hook functions
   */
  getHooks(event) {
    if (!this._hooks || !this._hooks.has(event)) return [];
    return [...this._hooks.get(event)];
  }

  /**
   * Clear all hooks for a specific event
   * @param {string} event - Hook event name
   */
  clearHooks(event) {
    if (!this._hooks || !this._hooks.has(event)) return;
    this._hooks.get(event).length = 0;
  }
}

export class S3db extends Database {}
export default S3db;
