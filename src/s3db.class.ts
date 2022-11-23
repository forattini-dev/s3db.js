import { flatten } from "flat";
import { isEmpty } from "lodash";
import EventEmitter from "events";

import Resource from "./resource.class";
import S3Client from "./s3-client.class";
import { ValidatorFactory } from "./validator";
import ConfigInterface from "./config.interface";
import MetadataInterface from "./metadata.interface";
import { S3dbMissingMetadata, ClientNoSuchKey } from "./errors";
import { MetadataResourceInterface } from "./resource.interface";
import PluginInterface from "./plugin.interface";

export default class S3db extends EventEmitter {
  options: ConfigInterface;
  client: S3Client;
  keyPrefix: string = "";
  bucket: string = "s3db";
  version: string;
  metadata: MetadataInterface;
  validatorInstance: any;
  parallelism: number;
  resources: any;
  passphrase: string | undefined;
  plugins: PluginInterface[];

  /**
   * Constructor
   */
  constructor(options: ConfigInterface) {
    super();

    this.resources = {};
    this.version = "1";
    this.options = options;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.metadata = this.blankMetadataStructure();
    this.passphrase = options?.passphrase;
    this.plugins = options.plugins || [];

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
    try {
      this.metadata = await this.getMetadataFile();
    } catch (error) {
      if (error instanceof S3dbMissingMetadata) {
        this.metadata = this.blankMetadataStructure();
        await this.uploadMetadataFile();
      } else {
        this.emit("error", error);
        throw error;
      }
    }

    Object.entries(this.metadata.resources).forEach(
      ([name, resource]: [string, any]) => {
        this.resources[name] = new Resource({
          name,
          s3db: this,
          s3Client: this.client,
          schema: resource.schema,
          options: resource.options,
          validatorInstance: this.validatorInstance,
        });
      }
    );

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
    await this.client.putObject({
      key: `s3db.json`,
      body: JSON.stringify(this.metadata, null, 2),
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
      options: {
        autoDecrypt: true,
        ...options,
      },
      s3db: this,
      name: resourceName,
      s3Client: this.client,
      validatorInstance: this.validatorInstance,
    });

    this.resources[resourceName] = resource;
    this.metadata.resources[resourceName] = resource.export();

    await this.uploadMetadataFile();

    return resource;
  }

  /**
   * Looper
   * @param {string} resourceName
   * @returns
   */
  resource(resourceName: string): Resource | any {
    const resource = this.resources[resourceName];
    if (resource) return resource;

    return {
      define: (attributes: any, options = {}) =>
        this.createResource({
          resourceName,
          attributes,
          options,
        }),
    };
  }
}
