import EventEmitter from "events";
import { flatten, } from "flat";

import Resource from "./resource.class";
import S3Client from "./s3-client.class";
import S3Streamer from "./s3-streamer.class";
import { ValidatorFactory } from "./validator";
import ConfigInterface from "./config.interface";
import MetadataInterface from "./metadata.interface";
import { MissingMetadata, NoSuchKey } from "./errors";

export default class S3db extends EventEmitter {
  options: ConfigInterface;
  client: S3Client;
  keyPrefix: string = "";
  bucket: string = "s3db";
  version: string;
  metadata: MetadataInterface;
  validatorInstance: any;
  parallelism: number;
  streamer: S3Streamer;
  resources: any;

  /**
   * Constructor
   */
  constructor(options: ConfigInterface) {
    super();

    this.version = "1";
    this.options = options;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.metadata = this.blankMetadataStructure();

    this.validatorInstance = ValidatorFactory({
      passphrase: options?.passphrase,
    });

    this.client = new S3Client({
      connectionString: options.uri,
    });

    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;

    this.streamer = new S3Streamer({
      s3db: this,
      client: this.client,
      parallelism: this.parallelism,
    });

    this.resources = {};
  }

  /**
   * Remotely setups s3db file.
   */
  async connect(): Promise<void> {
    try {
      this.metadata = await this.getMetadataFile();
    } catch (error) {
      if (error instanceof MissingMetadata) {
        this.metadata = this.blankMetadataStructure();
        await this.setMetadataFile();
      } else {
        this.emit("error", error);
        throw error;
      }
    }

    Object.entries(this.metadata.resources).forEach(
      ([name, schema]: [string, any]) => {
        this.resources[name] = new Resource({
          name,
          schema,
          s3Client: this.client,
          s3db: this,
          validatorInstance: this.validatorInstance,
        });
      }
    );

    this.emit("connected", this);
  }

  /**
   * Downloads current metadata.
   * If there isnt any file, creates an empty metadata.
   * @returns MetadataInterface
   */
  private async getMetadataFile() {
    try {
      const request = await this.client.getObject({ key: `s3db.json` });
      return JSON.parse(String(request?.Body));
    } catch (error: unknown) {
      if (error instanceof NoSuchKey) {
        throw new MissingMetadata({ bucket: this.bucket });
      } else {
        throw error;
      }
    }
  }

  async setMetadataFile() {
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
    const schema: any = flatten(attributes);

    const resource = new Resource({
      s3db: this,
      s3Client: this.client,
      name: resourceName,
      schema,
      validatorInstance: this.validatorInstance,
    });

    this.resources[resourceName] = resource;
    this.metadata.resources[resourceName] = resource.export();

    await this.setMetadataFile();
    return this.resource(resourceName);
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
