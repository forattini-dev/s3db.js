import EventEmitter from "events";
import { createHash } from "crypto";
import { isEmpty, isFunction } from "lodash-es";
import jsonStableStringify from "json-stable-stringify";

import Client from "./client.class.js";
import tryFn from "./concerns/try-fn.js";
import Resource from "./resource.class.js";
import { ResourceNotFound } from "./errors.js";
import { idGenerator } from "./concerns/id.js";
import { streamToString } from "./stream/index.js";

export class Database extends EventEmitter {
  constructor(options) {
    super();

    this.id = idGenerator(7)
    this.version = "1";
    // Version is injected during build, fallback to "latest" for development
    this.s3dbVersion = (() => {
      const [ok, err, version] = tryFn(() => (typeof __PACKAGE_VERSION__ !== 'undefined' && __PACKAGE_VERSION__ !== '__PACKAGE_VERSION__' 
        ? __PACKAGE_VERSION__ 
        : "latest"));
      return ok ? version : "latest";
    })();
    this.resources = {};
    this.savedMetadata = null; // Store loaded metadata for versioning
    this.options = options;
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || []; // Keep the original array for backward compatibility
    this.pluginRegistry = {}; // Initialize plugins registry as separate object
    this.pluginList = options.plugins || []; // Keep the list for backward compatibility
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";
    this.versioningEnabled = options.versioningEnabled || false;
    this.persistHooks = options.persistHooks || false; // New configuration for hook persistence

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

    this.client = options.client || new Client({
      verbose: this.verbose,
      parallelism: this.parallelism,
      connectionString: connectionString,
    });

    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;

    // Add process exit listener for cleanup
    if (!this._exitListenerRegistered) {
      this._exitListenerRegistered = true;
      if (typeof process !== 'undefined') {
        process.on('exit', async () => {
          if (this.isConnected()) {
            try {
              await this.disconnect();
            } catch (err) {
              // Silently ignore errors on exit
            }
          }
        });
      }
    }
  }
  
  async connect() {
    await this.startPlugins();

    let metadata = null;
    let needsHealing = false;
    let healingLog = [];

    if (await this.client.exists(`s3db.json`)) {
      try {
        const request = await this.client.getObject(`s3db.json`);
        const rawContent = await streamToString(request?.Body);
        
        // Try to parse JSON
        try {
          metadata = JSON.parse(rawContent);
        } catch (parseError) {
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
        }

        // Validate and heal metadata structure
        const healedMetadata = await this._validateAndHealMetadata(metadata, healingLog);
        if (healedMetadata !== metadata) {
          metadata = healedMetadata;
          needsHealing = true;
        }

      } catch (error) {
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
      const currentVersion = resourceMetadata.currentVersion || 'v0';
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

        this.resources[name] = new Resource({
          name,
          client: this.client,
          database: this, // ensure reference
          version: currentVersion,
          attributes: versionData.attributes,
          behavior: versionData.behavior || 'user-managed',
          parallelism: this.parallelism,
          passphrase: this.passphrase,
          observers: [this],
          cache: this.cache,
          timestamps: versionData.timestamps !== undefined ? versionData.timestamps : false,
          partitions: resourceMetadata.partitions || versionData.partitions || {},
          paranoid: versionData.paranoid !== undefined ? versionData.paranoid : true,
          allNestedObjectsOptional: versionData.allNestedObjectsOptional !== undefined ? versionData.allNestedObjectsOptional : true,
          autoDecrypt: versionData.autoDecrypt !== undefined ? versionData.autoDecrypt : true,
          hooks: this.persistHooks ? this._deserializeHooks(versionData.hooks || {}) : (versionData.hooks || {}),
          versioningEnabled: this.versioningEnabled,
          map: versionData.map,
          idGenerator: restoredIdGenerator,
          idSize: restoredIdSize
        });
      }
    }

    // Emit definition changes if any were detected
    if (definitionChanges.length > 0) {
      this.emit("resourceDefinitionsChanged", {
        changes: definitionChanges,
        metadata: this.savedMetadata
      });
    }

    this.emit("connected", new Date());
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
        const currentVersion = savedResource.currentVersion || 'v0';
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
      if (!this.resources[name]) {
        const currentVersion = savedResource.currentVersion || 'v0';
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
    
    const maxVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) : -1;
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
            try {
              return {
                __s3db_serialized_function: true,
                code: hook.toString(),
                name: hook.name || 'anonymous'
              };
            } catch (err) {
              if (this.verbose) {
                console.warn(`Failed to serialize hook for event '${event}':`, err.message);
              }
              return null;
            }
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
            try {
              // Use Function constructor instead of eval for better security
              const fn = new Function('return ' + hook.code)();
              if (typeof fn === 'function') {
                return fn;
              }
            } catch (err) {
              if (this.verbose) {
                console.warn(`Failed to deserialize hook '${hook.name}' for event '${event}':`, err.message);
              }
            }
            return null;
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
      const plugins = this.pluginList.map(p => isFunction(p) ? new p(this) : p)

      const setupProms = plugins.map(async (plugin) => {
        if (plugin.beforeSetup) await plugin.beforeSetup()
        await plugin.setup(db)
        if (plugin.afterSetup) await plugin.afterSetup()
        
        // Register the plugin using the same naming convention as usePlugin()
        const pluginName = this._getPluginName(plugin);
        this.pluginRegistry[pluginName] = plugin;
      });
      
      await Promise.all(setupProms);

      const startProms = plugins.map(async (plugin) => {
        if (plugin.beforeStart) await plugin.beforeStart()
        await plugin.start()
        if (plugin.afterStart) await plugin.afterStart()
      });

      await Promise.all(startProms);
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
    
    // Register the plugin
    this.plugins[pluginName] = plugin;
    
    // Setup the plugin if database is connected
    if (this.isConnected()) {
      await plugin.setup(this);
      await plugin.start();
    }
    
    return plugin;
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
      const currentVersion = existingResource?.currentVersion || 'v0';
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
    this.emit('metadataUploaded', metadata);
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
      try {
        const fixedContent = fix();
        const parsed = JSON.parse(fixedContent);
        healingLog.push(`JSON recovery successful using fix #${index + 1}`);
        return parsed;
      } catch (error) {
        // Try next fix
      }
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
      healed.currentVersion = 'v0';
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
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupKey = `s3db.json.corrupted.${timestamp}.backup`;
      
      if (!content) {
        try {
          const request = await this.client.getObject(`s3db.json`);
          content = await streamToString(request?.Body);
        } catch (error) {
          content = 'Unable to read corrupted file content';
        }
      }

      await this.client.putObject({
        key: backupKey,
        body: content,
        contentType: 'application/json'
      });

      if (this.verbose) {
        console.warn(`S3DB: Created backup of corrupted s3db.json as ${backupKey}`);
      }
    } catch (error) {
      if (this.verbose) {
        console.warn(`S3DB: Failed to create backup: ${error.message}`);
      }
    }
  }

  /**
   * Upload healed metadata with logging
   */
  async _uploadHealedMetadata(metadata, healingLog) {
    try {
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

      this.emit('metadataHealed', { healingLog, metadata });

      if (this.verbose) {
        console.warn('S3DB: Successfully uploaded healed metadata');
      }
    } catch (error) {
      if (this.verbose) {
        console.error(`S3DB: Failed to upload healed metadata: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if a resource exists by name
   * @param {string} name - Resource name
   * @returns {boolean} True if resource exists, false otherwise
   */
  resourceExists(name) {
    return !!this.resources[name];
  }

  /**
   * Check if a resource exists with the same definition hash
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.attributes - Resource attributes
   * @param {string} [config.behavior] - Resource behavior
   * @param {Object} [config.options] - Resource options (deprecated, use root level parameters)
   * @returns {Object} Result with exists and hash information
   */
  resourceExistsWithSameHash({ name, attributes, behavior = 'user-managed', partitions = {}, options = {} }) {
    if (!this.resources[name]) {
      return { exists: false, sameHash: false, hash: null };
    }

    const existingResource = this.resources[name];
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
      versioningEnabled: this.versioningEnabled,
      ...options
    });
    
    const newHash = this.generateDefinitionHash(mockResource.export());
    
    return {
      exists: true,
      sameHash: existingHash === newHash,
      hash: newHash,
      existingHash
    };
  }

  async createResource({ name, attributes, behavior = 'user-managed', hooks, ...config }) {
    if (this.resources[name]) {
      const existingResource = this.resources[name];
      // Update configuration
      Object.assign(existingResource.config, {
        cache: this.cache,
        ...config,
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
      // Only upload metadata if hash actually changed
      const newHash = this.generateDefinitionHash(existingResource.export(), existingResource.behavior);
      const existingMetadata = this.savedMetadata?.resources?.[name];
      const currentVersion = existingMetadata?.currentVersion || 'v0';
      const existingVersionData = existingMetadata?.versions?.[currentVersion];
      if (!existingVersionData || existingVersionData.hash !== newHash) {
        await this.uploadMetadataFile();
      }
      this.emit("s3db.resourceUpdated", name);
      return existingResource;
    }
    const existingMetadata = this.savedMetadata?.resources?.[name];
    const version = existingMetadata?.currentVersion || 'v0';
    const resource = new Resource({
      name,
      client: this.client,
      version: config.version !== undefined ? config.version : version,
      attributes,
      behavior,
      parallelism: this.parallelism,
      passphrase: config.passphrase !== undefined ? config.passphrase : this.passphrase,
      observers: [this],
      cache: config.cache !== undefined ? config.cache : this.cache,
      timestamps: config.timestamps !== undefined ? config.timestamps : false,
      partitions: config.partitions || {},
      paranoid: config.paranoid !== undefined ? config.paranoid : true,
      allNestedObjectsOptional: config.allNestedObjectsOptional !== undefined ? config.allNestedObjectsOptional : true,
      autoDecrypt: config.autoDecrypt !== undefined ? config.autoDecrypt : true,
      hooks: hooks || {},
      versioningEnabled: this.versioningEnabled,
      map: config.map,
      idGenerator: config.idGenerator,
      idSize: config.idSize,
      events: config.events || {}
    });
    resource.database = this;
    this.resources[name] = resource;
    await this.uploadMetadataFile();
    this.emit("s3db.resourceCreated", name);
    return resource;
  }

  resource(name) {
    if (!this.resources[name]) {
      return Promise.reject(`resource ${name} does not exist`);
    }

    return this.resources[name];
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
    if (!this.resources[name]) {
      throw new ResourceNotFound({
        bucket: this.client.config.bucket,
        resourceName: name,
        id: name
      });
    }
    return this.resources[name];
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
    try {
      // 1. Remove all listeners from all plugins
      if (this.pluginList && this.pluginList.length > 0) {
        for (const plugin of this.pluginList) {
          if (plugin && typeof plugin.removeAllListeners === 'function') {
            plugin.removeAllListeners();
          }
        }
        // Also stop plugins if they have a stop method
        const stopProms = this.pluginList.map(async (plugin) => {
          try {
            if (plugin && typeof plugin.stop === 'function') {
              await plugin.stop();
            }
          } catch (err) {
            // Silently ignore errors on exit
          }
        });
        await Promise.all(stopProms);
      }

      // 2. Remove all listeners from all resources
      if (this.resources && Object.keys(this.resources).length > 0) {
        for (const [name, resource] of Object.entries(this.resources)) {
          try {
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
          } catch (err) {
            // Silently ignore errors on exit
          }
        }
        // Instead of reassigning, clear in place
        Object.keys(this.resources).forEach(k => delete this.resources[k]);
      }

      // 3. Remove all listeners from the client
      if (this.client && typeof this.client.removeAllListeners === 'function') {
        this.client.removeAllListeners();
      }

      // 4. Remove all listeners from the database itself
      this.removeAllListeners();

      // 5. Clear saved metadata and plugin lists
      this.savedMetadata = null;
      this.plugins = {};
      this.pluginList = [];

      this.emit('disconnected', new Date());
    } catch (err) {
      // Silently ignore errors on exit
    }
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
      throw new Error(`Unknown hook event: ${event}. Available events: ${this._hookEvents.join(', ')}`);
    }
    if (typeof fn !== 'function') {
      throw new Error('Hook function must be a function');
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
      try {
        await hook({ database: this, ...context });
      } catch (error) {
        // Emit error but don't stop hook execution
        this.emit('hookError', { event, error, context });
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
