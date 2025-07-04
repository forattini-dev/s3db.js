import { isEmpty, isFunction } from "lodash-es";
import EventEmitter from "events";
import jsonStableStringify from "json-stable-stringify";
import { createHash } from "crypto";

import Client from "./client.class.js";
import Resource from "./resource.class.js";
import { streamToString } from "./stream/index.js";

export class Database extends EventEmitter {
  constructor(options) {
    super();

    this.version = "1";
    // Version is injected during build, fallback to "latest" for development
    this.s3dbVersion = (() => {
      try {
        return typeof __PACKAGE_VERSION__ !== 'undefined' && __PACKAGE_VERSION__ !== '__PACKAGE_VERSION__' 
          ? __PACKAGE_VERSION__ 
          : "latest";
      } catch (e) {
        return "latest";
      }
    })();
    this.resources = {};
    this.savedMetadata = null; // Store loaded metadata for versioning
    this.options = options;
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || [];
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";

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
  }
  
  async connect() {
    await this.startPlugins();

    let metadata = null;

    if (await this.client.exists(`s3db.json`)) {
      const request = await this.client.getObject(`s3db.json`);
      metadata = JSON.parse(await streamToString(request?.Body));
    } else {
      metadata = this.blankMetadataStructure();
      await this.uploadMetadataFile();
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
        this.resources[name] = new Resource({
          name,
          client: this.client,
          version: currentVersion,
          attributes: versionData.attributes,
          behavior: versionData.behavior || 'user-management',
          parallelism: this.parallelism,
          passphrase: this.passphrase,
          observers: [this],
          cache: this.cache,
          timestamps: versionData.timestamps !== undefined ? versionData.timestamps : false,
          partitions: resourceMetadata.partitions || versionData.partitions || {},
          paranoid: versionData.paranoid !== undefined ? versionData.paranoid : true,
          allNestedObjectsOptional: versionData.allNestedObjectsOptional !== undefined ? versionData.allNestedObjectsOptional : true,
          autoDecrypt: versionData.autoDecrypt !== undefined ? versionData.autoDecrypt : true,
          hooks: versionData.hooks || {}
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
    // Include behavior in the hash
    const hashObj = {
      attributes: stableAttributes,
      behavior: behavior || definition.behavior || 'user-management',
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

  async startPlugins() {
    const db = this

    if (!isEmpty(this.plugins)) {
      const plugins = this.plugins.map(p => isFunction(p) ? new p(this) : p)

      const setupProms = plugins.map(async (plugin) => {
        if (plugin.beforeSetup) await plugin.beforeSetup()
          await plugin.setup(db)
        if (plugin.afterSetup) await plugin.afterSetup()
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
            behavior: resourceDef.behavior || 'user-management',
            timestamps: resource.config.timestamps,
            partitions: resource.config.partitions,
            paranoid: resource.config.paranoid,
            allNestedObjectsOptional: resource.config.allNestedObjectsOptional,
            autoDecrypt: resource.config.autoDecrypt,
            cache: resource.config.cache,
            hooks: resource.config.hooks,
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
      resources: {},
    };
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
  resourceExistsWithSameHash({ name, attributes, behavior = 'user-management', options = {} }) {
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
      client: this.client,
      version: existingResource.version,
      passphrase: this.passphrase,
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



  async createResource({ name, attributes, behavior = 'user-management', hooks, ...config }) {
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
      attributes,
      behavior,
      observers: [this],
      client: this.client,
      version,
      passphrase: this.passphrase,
      cache: this.cache,
      hooks,
      ...config,
    });
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
      throw new Error(`Resource not found: ${name}`);
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
}

export class S3db extends Database {}
export default S3db;
