import { createHash } from "crypto";
import { isEmpty, isFunction } from "lodash-es";
import jsonStableStringify from "json-stable-stringify";
import { PromisePool } from "@supercharge/promise-pool";

import { S3Client } from "./clients/s3-client.class.js";
import { MemoryClient } from "./clients/memory-client.class.js";
import tryFn from "./concerns/try-fn.js";
import Resource from "./resource.class.js";
import { ResourceNotFound, DatabaseError, SchemaError } from "./errors.js";
import { idGenerator } from "./concerns/id.js";
import { streamToString } from "./stream/index.js";
import { ProcessManager } from "./concerns/process-manager.js";
import { SafeEventEmitter } from "./concerns/safe-event-emitter.js";

export class Database extends SafeEventEmitter {
  constructor(options) {
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
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.pluginList = options.plugins || [];
    this.pluginRegistry = {};
    this.plugins = this.pluginRegistry; // Alias for plugin registry
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";
    this.bcryptRounds = options.bcryptRounds || 10;
    this.versioningEnabled = options.versioningEnabled || false;
    this.persistHooks = options.persistHooks || false; // New configuration for hook persistence
    this.strictValidation = options.strictValidation !== false; // Enable strict validation by default
    this.strictHooks = options.strictHooks || false; // Throw on first hook error instead of continuing

    // Initialize ProcessManager for lifecycle management (prevents memory leaks)
    this.processManager = options.processManager || new ProcessManager({
      verbose: this.verbose,
      exitOnSignal: options.exitOnSignal !== false // Default: true (auto-exit on SIGTERM/SIGINT)
    });

    if (this.verbose) {
      console.log(`[Database ${this.id}] ProcessManager initialized`);
    }

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

    // Auto-detect client type based on connection string protocol
    if (!options.client && connectionString) {
      try {
        const url = new URL(connectionString);
        if (url.protocol === 'memory:') {
          // Use MemoryClient for memory:// protocol
          const bucket = url.hostname || 'test-bucket';
          const keyPrefix = url.pathname ? url.pathname.substring(1) : ''; // Remove leading slash

          this.client = new MemoryClient({
            bucket,
            keyPrefix,
            verbose: this.verbose,
            enforceLimits: url.searchParams.get('enforceLimits') === 'true',
            persistPath: url.searchParams.get('persistPath') || undefined,
          });
        } else {
          // Use S3Client for s3://, http://, https:// protocols
          this.client = new S3Client({
            verbose: this.verbose,
            parallelism: this.parallelism,
            connectionString: connectionString,
          });
        }
      } catch (err) {
        // If URL parsing fails, fall back to S3Client
        this.client = new S3Client({
          verbose: this.verbose,
          parallelism: this.parallelism,
          connectionString: connectionString,
        });
      }
    } else if (!options.client) {
      // No connection string provided, use S3Client with defaults
      this.client = new S3Client({
        verbose: this.verbose,
        parallelism: this.parallelism,
        connectionString: connectionString,
      });
    } else {
      // Use provided client
      this.client = options.client;
    }

    // Store connection string for CLI access
    this.connectionString = connectionString;

    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;

    // Register exit listener for cleanup
    this._registerExitListener();
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

  async connect() {
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
          parallelism: this.parallelism,
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
            const [ok, err, data] = tryFn(() => ({
              __s3db_serialized_function: true,
              code: hook.toString(),
              name: hook.name || 'anonymous'
            }));

            if (!ok) {
              if (this.verbose) {
                console.warn(`Failed to serialize hook for event '${event}':`, err.message);
              }
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
              if (this.verbose) {
                console.warn(`Failed to deserialize hook '${hook.name}' for event '${event}':`, err?.message || 'Invalid function');
              }
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

      const concurrency = Math.max(1, Number.isFinite(this.parallelism) ? this.parallelism : 5);

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
          await plugin.start();
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

      if (this.verbose) {
        console.log(`[Database ${this.id}] ProcessManager passed to plugin '${pluginName}'`);
      }
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
      const definitionHash = this.generateDefinitionHash(resourceDef);
      
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
            attributes: resourceDef.attributes,
            behavior: resourceDef.behavior || 'user-managed',
            timestamps: resource.config.timestamps,
            partitions: resource.config.partitions,
            paranoid: resource.config.paranoid,
            allNestedObjectsOptional: resource.config.allNestedObjectsOptional,
            autoDecrypt: resource.config.autoDecrypt,
            cache: resource.config.cache,
            asyncEvents: resource.config.asyncEvents,
            hooks: this.persistHooks ? this._serializeHooks(resource.config.hooks) : resource.config.hooks,
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

      if (this.verbose) {
        console.warn(`S3DB: Created backup of corrupted s3db.json as ${backupKey}`);
      }
    });

    if (!ok && this.verbose) {
      console.warn(`S3DB: Failed to create backup: ${err.message}`);
    }
  }

  /**
   * Upload healed metadata with logging
   */
  async _uploadHealedMetadata(metadata, healingLog) {
    const [ok, err] = await tryFn(async () => {
      if (this.verbose && healingLog.length > 0) {
        console.warn('S3DB Self-Healing Operations:');
        healingLog.forEach(log => console.warn(`  - ${log}`));
      }

      // Update lastUpdated timestamp
      metadata.lastUpdated = new Date().toISOString();

      await this.client.putObject({
        key: 's3db.json',
        body: JSON.stringify(metadata, null, 2),
        contentType: 'application/json'
      });

      this.emit('db:metadata-healed', { healingLog, metadata });

      if (this.verbose) {
        console.warn('S3DB: Successfully uploaded healed metadata');
      }
    });

    if (!ok) {
      if (this.verbose) {
        console.error(`S3DB: Failed to upload healed metadata: ${err.message}`);
      }
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

      // Only upload metadata if hash actually changed
      const newHash = this.generateDefinitionHash(existingResource.export(), existingResource.behavior);
      const existingMetadata = this.savedMetadata?.resources?.[name];
      const currentVersion = existingMetadata?.currentVersion || 'v1';
      const existingVersionData = existingMetadata?.versions?.[currentVersion];
      if (!existingVersionData || existingVersionData.hash !== newHash) {
        await this.uploadMetadataFile();
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
      parallelism: this.parallelism,
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
      createdBy: config.createdBy || 'user'
    });
    resource.database = this;
    this._resourcesMap[name] = resource;

    // Apply middlewares if provided
    if (middlewares) {
      this._applyMiddlewares(resource, middlewares);
    }

    await this.uploadMetadataFile();
    this.emit("db:resource-created", name);
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
      parallelism: this.parallelism,
      verbose: this.verbose
    };
  }

  isConnected() {
    return !!this.savedMetadata;
  }

  async disconnect() {
    // Emit disconnected event BEFORE removing listeners (Fix #2)
    await this.emit('disconnected', new Date());

    // Silently ignore all errors during disconnect
    await tryFn(async () => {
      // 1. Remove all listeners from all plugins
      if (this.pluginList && this.pluginList.length > 0) {
        for (const plugin of this.pluginList) {
          if (plugin && typeof plugin.removeAllListeners === 'function') {
            plugin.removeAllListeners();
          }
        }
        // Also stop plugins if they have a stop method
        const stopConcurrency = Math.max(1, Number.isFinite(this.parallelism) ? this.parallelism : 5);
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

      // 2. Remove all listeners from all resources
      if (this.resources && Object.keys(this.resources).length > 0) {
        for (const [name, resource] of Object.entries(this.resources)) {
          // Silently ignore errors on exit
          await tryFn(() => {
            if (resource && typeof resource.removeAllListeners === 'function') {
              resource.removeAllListeners();
            }
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
