import { isEmpty } from "lodash-es";
import EventEmitter from "events";

import Client from "./client.class.js";
import Resource from "./resource.class.js";
import { Validator } from "./validator.class.js";
import { streamToString } from "./stream/index.js";

export class Database extends EventEmitter {
  constructor(options) {
    super();

    this.version = "1";
    this.resources = {};
    this.options = options;
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || [];
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";

    this.validatorInstance = new Validator({ passphrase: this.passphrase });

    this.client = options.client || new Client({
      verbose: this.verbose,
      parallelism: this.parallelism,
      connectionString: options.connectionString,
    });

    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;

    this.startPlugins();
  }

  async connect() {
    let metadata = null;

    if (await this.client.exists(`s3db.json`)) {
      const request = await this.client.getObject(`s3db.json`);
      metadata = JSON.parse(await streamToString(request?.Body));
      metadata = this.unserializeMetadata(metadata);
    } else {
      metadata = this.blankMetadataStructure();
      await this.uploadMetadataFile();
    }

    for (const resource of Object.entries(metadata.resources)) {
      const [name, definition] = resource;

      this.resources[name] = new Resource({
        name,
        client: this.client,
        options: definition.options,
        attributes: definition.schema,
        parallelism: this.parallelism,
        passphrase: this.passphrase,
        validatorInstance: this.validatorInstance,
        observers: [this],
      });
    }

    this.emit("connected", new Date());
  }

  async startPlugins() {
    if (this.plugins && !isEmpty(this.plugins)) {
      const setupProms = this.plugins.map(async (plugin) => {
        if (plugin.beforeSetup) await plugin.beforeSetup()
        await plugin.setup(this)
        if (plugin.afterSetup) await plugin.afterSetup()
      });

      await Promise.all(setupProms);

      const startProms = this.plugins.map(async (plugin) => {
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
      for (const [attr, value] of Object.entries(structure.schema)) {
        file.resources[name].schema[attr] = JSON.parse(value);
      }
    }

    return file;
  }

  async uploadMetadataFile() {
    const file = {
      version: this.version,
      resources: Object.entries(this.resources).reduce((acc, definition) => {
        const [name, resource] = definition;
        acc[name] = resource.export();
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
      resources: {},
    };
  }

  async createResource({ name, attributes, options = {} }) {
    const resource = new Resource({
      name,
      attributes,
      observers: [this],
      client: this.client,
      validatorInstance: this.validatorInstance,

      options: {
        autoDecrypt: true,
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

export class S3db extends Database {}
export default S3db;