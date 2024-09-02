import { flatten } from "flat";
import { isEmpty } from "lodash-es";
import EventEmitter from "events";

import Client from "./client.class.js";
import Resource from "./resource.class.js";
import { ValidatorFactory } from "./validator.js";
import { streamToString } from "./stream/index.js";
import { MissingMetadata, NoSuchKey } from "./errors.js";

class Database extends EventEmitter {
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

    this.validatorInstance = ValidatorFactory({
      passphrase: this.passphrase,
    });

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
        s3db: this,
        s3Client: this.client,
        schema: definition.schema,
        options: definition.options,
        validatorInstance: this.validatorInstance,
      });
    }

    this.emit("connected", new Date());
  }

  async startPlugins() {
    if (this.plugins && !isEmpty(this.plugins)) {
      const startProms = this.plugins.map((plugin) => plugin.setup(this));
      await Promise.all(startProms);
      this.plugins.forEach((plugin) => plugin.start());
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
    return resource;
  }

  resource(name) {
    if (!this.resources[name]) {
      return Promise.reject(`resource ${name} does not exist`);
    }

    return this.resources[name];
  }
}

export default Database;
export class S3db extends Database {}