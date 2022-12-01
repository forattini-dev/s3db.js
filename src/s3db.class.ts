import { flatten } from "flat";
import { isEmpty } from "lodash";
import EventEmitter from "events";

import Resource from "./resource.class";
import S3Client from "./s3-client.class";
import { ValidatorFactory } from "./validator";
import PluginInterface from "./plugin.interface";
import S3dbConfigInterface from "./s3db-config.interface";
import MetadataInterface from "./metadata.interface";
import { S3dbMissingMetadata, ClientNoSuchKey } from "./errors";
import { MetadataResourceInterface } from "./resource.interface";

export default class S3db extends EventEmitter {
  options: S3dbConfigInterface;
  client: S3Client;
  keyPrefix: string = "";
  bucket: string = "s3db";
  version: string;
  validatorInstance: any;
  parallelism: number;
  resources: any;
  passphrase: string;
  plugins: PluginInterface[];
  cache: boolean | undefined = false;

  /**
   * Constructor
   */
  constructor(options: S3dbConfigInterface) {
    super();

    this.version = "1";
    this.resources = {};
    this.options = options;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || [];
    this.cache = options.cache;
    this.passphrase = options.passphrase || ""

    this.validatorInstance = ValidatorFactory({
      passphrase: options?.passphrase,
    });

    this.client = new S3Client({
      connectionString: options.uri,
      parallelism: this.parallelism,
    });

    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;

    this.startPlugins();
  }

  /**
   * Remotely setups s3db file.
   */
  async connect(): Promise<void> {
    let metadata = null;

    try {
      metadata = await this.getMetadataFile();
    } catch (error) {
      if (error instanceof S3dbMissingMetadata) {
        metadata = this.blankMetadataStructure();
        await this.uploadMetadataFile();
      } else {
        this.emit("error", error);
        return Promise.reject(error);
      }
    }

    for (const resource of Object.entries(metadata.resources)) {
      const [name, definition]: [string, any] = resource;

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
      this.plugins.map((plugin) => plugin.start());
    }
  }

  /**
   * Downloads current metadata.
   * If there isnt any file, creates an empty metadata.
   * @returns MetadataInterface
   */
  private async getMetadataFile() {
    try {
      const request = await this.client.getObject({ key: `s3db.json` });
      const metadata = JSON.parse(String(request?.Body));
      return this.unserializeMetadata(metadata);
    } catch (error: unknown) {
      if (error instanceof ClientNoSuchKey) {
        return Promise.reject(
          new S3dbMissingMetadata({ bucket: this.bucket, cause: error })
        );
      } else {
        return Promise.reject(error);
      }
    }
  }

  private unserializeMetadata(metadata: any) {
    const file = { ...metadata };
    if (isEmpty(file.resources)) return file;

    for (const [name, structure] of Object.entries(
      file.resources as MetadataResourceInterface[]
    )) {
      for (const [attr, value] of Object.entries(structure.schema)) {
        file.resources[name].schema[attr] = JSON.parse(value as any);
      }
    }

    return file;
  }

  async uploadMetadataFile() {
    const file = {
      version: this.version,
      resources: Object.entries(this.resources).reduce(
        (acc: any, definition) => {
          const [name, resource] = definition;
          acc[name] = (resource as Resource).export();
          return acc;
        },
        {}
      ),
    };

    await this.client.putObject({
      key: `s3db.json`,
      body: JSON.stringify(file, null, 2),
    });
  }

  /**
   * Generates empty metadata structure.
   * @returns MetadataInterface
   */
  private blankMetadataStructure(): MetadataInterface {
    return {
      version: `1`,
      resources: {},
    };
  }

  /**
   * Generates a new resorce with its translators and validatos.
   * @param {Object} param
   * @param {string} param.resourceName
   * @param {Object} param.attributes
   * @param {Object} param.options
   */
  async createResource({
    resourceName,
    attributes,
    options = {},
  }: {
    resourceName: string;
    attributes: any;
    options?: any;
  }) {
    const schema: any = flatten(attributes, { safe: true });

    const resource = new Resource({
      schema,
      s3db: this,
      name: resourceName,
      s3Client: this.client,
      validatorInstance: this.validatorInstance,

      options: {
        autoDecrypt: true,
        cache: this.cache,
        ...options,
      },
    });

    this.resources[resourceName] = resource;

    await this.uploadMetadataFile();

    return resource;
  }

  /**
   * Looper
   * @param {string} resourceName
   * @returns
   */
  resource(resourceName: string): Resource | any {
    if (!this.resources[resourceName]) {
      return Promise.reject(`resource ${resourceName} does not exist`);
    }

    return this.resources[resourceName];
  }
}
