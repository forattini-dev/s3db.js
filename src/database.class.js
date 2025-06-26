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
    this.s3dbVersion = "0.6.2"; // Current library version
    this.resources = {};
    this.savedMetadata = null; // Store loaded metadata for versioning
    this.options = options;
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || [];
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";

    this.client = options.client || new Client({
      verbose: this.verbose,
      parallelism: this.parallelism,
      connectionString: options.connectionString,
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
        this.resources[name] = new Resource({
          name,
          client: this.client,
          version: currentVersion,
          options: {
            ...versionData.options,
            partitions: resourceMetadata.partitions || versionData.options?.partitions || {}
          },
          attributes: versionData.attributes,
          parallelism: this.parallelism,
          passphrase: this.passphrase,
          observers: [this],
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
   * @returns {string} SHA256 hash
   */
  generateDefinitionHash(definition) {
    const stableString = jsonStableStringify(definition);
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
        partitions: resourceDef.options?.partitions || {},
        versions: {
          ...existingResource?.versions, // Preserve previous versions
          [version]: {
            hash: definitionHash,
            attributes: resourceDef.attributes,
            options: resourceDef.options,
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

  async createResource({ name, attributes, options = {} }) {
    // Check if resource already exists in memory
    if (this.resources[name]) {
      // Update existing resource instead of creating new instance
      const existingResource = this.resources[name];
      
      // Update options first
      Object.assign(existingResource.options, {
        cache: this.cache,
        ...options,
      });
      
      // Update attributes using the new method that rebuilds schema
      existingResource.updateAttributes(attributes);

      // Version will be updated by uploadMetadataFile if needed
      await this.uploadMetadataFile();
      
      this.emit("s3db.resourceUpdated", name);
      return existingResource;
    }

    // Create new resource only if it doesn't exist
    const existingMetadata = this.savedMetadata?.resources?.[name];
    const version = existingMetadata?.currentVersion || 'v0';
    
    const resource = new Resource({
      name,
      attributes,
      observers: [this],
      client: this.client,
      version,

      options: {
        cache: this.cache,
        ...options,
      },
    });

    this.resources[name] = resource;

    // Upload metadata will handle versioning
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
}

export class S3db extends Database { }
export default S3db;