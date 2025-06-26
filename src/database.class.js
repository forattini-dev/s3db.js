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
      metadata = this.unserializeMetadata(metadata);
    } else {
      metadata = this.blankMetadataStructure();
      await this.uploadMetadataFile();
    }

    // Check for definition changes
    const definitionChanges = this.detectDefinitionChanges(metadata);
    
    for (const resource of Object.entries(metadata.resources)) {
      const [name, definition] = resource;

      this.resources[name] = new Resource({
        name,
        client: this.client,
        options: definition.options,
        attributes: definition.schema,
        parallelism: this.parallelism,
        passphrase: this.passphrase,
        observers: [this],
      });
    }

    // Emit definition changes if any were detected
    if (definitionChanges.length > 0) {
      this.emit("definitionChanges", definitionChanges);
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
      const savedResource = savedMetadata.resources[name];
      
      if (!savedResource) {
        changes.push({
          type: 'new',
          resourceName: name,
          currentHash,
          savedHash: null
        });
      } else if (savedResource.definitionHash !== currentHash) {
        changes.push({
          type: 'changed',
          resourceName: name,
          currentHash,
          savedHash: savedResource.definitionHash
        });
      }
    }
    
    // Check for deleted resources
    for (const [name, savedResource] of Object.entries(savedMetadata.resources || {})) {
      if (!this.resources[name]) {
        changes.push({
          type: 'deleted',
          resourceName: name,
          currentHash: null,
          savedHash: savedResource.definitionHash
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

  unserializeMetadata(metadata) {
    const file = { ...metadata };
    if (isEmpty(file.resources)) return file;

    for (const [name, structure] of Object.entries(file.resources)) {
      for (const [attr, value] of Object.entries(structure.attributes)) {
        file.resources[name].attributes[attr] = JSON.parse(value);
      }
    }

    return file;
  }

  async uploadMetadataFile() {
    const file = {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      resources: Object.entries(this.resources).reduce((acc, definition) => {
        const [name, resource] = definition;
        const exportedResource = resource.export();
        acc[name] = {
          ...exportedResource,
          definitionHash: this.generateDefinitionHash(exportedResource)
        };
        return acc;
      }, {}),
    };

    await this.client.putObject({
      key: `s3db.json`,
      contentType: "application/json",
      body: JSON.stringify(file, null, 2),
    });
  }

  blankMetadataStructure() {
    return {
      version: `1`,
      s3dbVersion: this.s3dbVersion,
      resources: {},
    };
  }

  async createResource({ name, attributes, options = {} }) {
    const resource = new Resource({
      name,
      attributes,
      observers: [this],
      client: this.client,

      options: {
        cache: this.cache,
        ...options,
      },
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
}

export class S3db extends Database { }
export default S3db;