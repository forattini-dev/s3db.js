import * as path from "path";
import { S3 } from "aws-sdk";
import shortid from "shortid";
import EventEmitter from "events";
import { flatten, unflatten } from "flat";
import { PromisePool } from "@supercharge/promise-pool";
import { isArray, isEmpty, merge, sortBy, omit } from "lodash";

import S3Client from "./s3-client.class";
import S3Streamer from "./s3-streamer.class";
import { ValidatorFactory } from "./validator";
import ConfigInterface from "./config.interface";
import MetadataInterface from "./metadata.interface";
import { MissingMetadata, NoSuchKey, InvalidResource } from "./errors";

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
  }

  /**
   * Remotely setups s3db file.
   */
  async connect(): Promise<void> {
    try {
      const metadata = await this.getMetadata();
      this.setMetadata(metadata);
    } catch (error) {
      if (error instanceof MissingMetadata) {
        const metadata = await this.generateAndUploadMetadata();
        this.setMetadata(metadata);

        if (this.version !== metadata.version) {
          this.emit(
            "warn",
            `Client version ${this.version} is different than ${metadata.version}`
          );
        }

        this.emit("connected", this);
      } else {
        this.emit("error", error);
        throw error;
      }
    }
  }

  /**
   * Downloads current metadata.
   * If there isnt any file, creates an empty metadata.
   * @returns MetadataInterface
   */
  private async getMetadata() {
    try {
      const request = await this.client.getObject({
        key: `s3db.json`,
      });

      const metadata = merge(
        this.blankMetadataStructure(),
        JSON.parse(String(request?.Body))
      );

      return metadata;
    } catch (error: unknown) {
      if (error instanceof NoSuchKey) {
        throw new MissingMetadata({ bucket: this.bucket });
      } else {
        throw error;
      }
    }
  }

  /**
   * Reorganizes its validates and translators according to the new metadata definition.
   * @param metadata
   */
  private setMetadata(metadata: MetadataInterface) {
    this.metadata = metadata;

    Object.entries(metadata.resources).forEach(
      ([resourceName, resourceDefinition]: [string, any]) => {
        let resource = this.metadata.resources[resourceName];

        resource = {
          ...resource,
          validator: this.validatorInstance.compile(resourceDefinition.schema),
          reversed: this.reverseMapper(resourceDefinition.mapper),
        };

        this.metadata.resources[resourceName] = resource;
      }
    );
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
   * Generate and upload new metadata structure.
   * @returns MetadataInterface
   */
  private async generateAndUploadMetadata(): Promise<MetadataInterface> {
    const body = this.blankMetadataStructure();
    
    await this.client.putObject({ 
      key: `s3db.json`,
      body: JSON.stringify(body, null, 2),
    });

    return body;
  }

  /**
   * Reverses a object to have the oter way to translate from
   * @param {Object} mapper
   * @returns
   */
  reverseMapper(mapper: any) {
    return Object.entries(mapper).reduce((acc: any, [key, value]) => {
      acc[String(value)] = key;
      return acc;
    }, {});
  }

  /**
   * Generates a new resorce with its translators and validatos.
   * @param {Object} param
   * @param {string} param.resourceName
   * @param {Object} param.attributes
   * @param {Object} param.options
   */
  async newResource({
    resourceName,
    attributes,
    options = {},
  }: {
    resourceName: string;
    attributes: any;
    options?: any;
  }) {
    const metadata = await this.getMetadata();
    const schema: any = flatten(attributes);

    let i = 0;
    const mapper = sortBy(Object.entries(schema), ["0"]).reduce(
      (acc: any, [key, value]) => {
        acc[key] = String(i++);
        return acc;
      },
      {}
    );

    metadata.resources[resourceName] = {
      name: resourceName,
      options,
      schema,
      mapper,
    };

    this.setMetadata(metadata);

    await this.client.putObject({
      key: `s3db.json`,
      body: JSON.stringify(metadata, null, 2),
    });

    return this.resource(resourceName);
  }

  translateObjectWithMapper(resourceName: string, obj: any, mapper: any) {
    if (isEmpty(mapper)) throw new Error("invalid mapper");

    return Object.entries(obj).reduce((acc: any, [key, value]) => {
      acc[mapper[key]] = value;
      return acc;
    }, {});
  }

  /**
   * Inserts a new object into the resource list.
   * @param {Object} param
   * @returns
   */
  async insert({
    attributes,
    resourceName,
  }: {
    attributes: any;
    resourceName: string;
  }) {
    const attributesFlat: any = flatten(attributes);

    // validate
    if (!this.metadata.resources[resourceName])
      throw new Error("Resource does not exist");

    const errors =
      this.metadata.resources[resourceName].validator(attributesFlat);

    if (isArray(errors)) {
      throw new InvalidResource({
        bucket: this.bucket,
        resourceName,
        attributes,
        validation: errors,
      });
    }

    // save
    if (!attributes.id && attributes.id !== 0)
      attributes.id = shortid.generate();
    const mapper: any = this.metadata.resources[resourceName].mapper;

    await this.client.putObject({
      key: path.join(`resource=${resourceName}`, `id=${attributes.id}`),
      body: "",
      metadata: this.translateObjectWithMapper(
        resourceName,
        omit(attributesFlat, "id"),
        mapper
      ),
    });

    this.emit("inserted", attributes);
    return attributes;
  }

  /**
   * Get a resource by id
   * @param {Object} param
   * @returns
   */
  async getById({
    id,
    resourceName,
  }: {
    id: string | number;
    resourceName: string;
  }) {
    const mapper: any = this.metadata.resources[resourceName].reversed;

    const request = await this.client.headObject({
      key: path.join(`resource=${resourceName}`, `id=${id}`),
    });

    const data: any = this.translateObjectWithMapper(
      resourceName,
      request.Metadata,
      mapper
    );

    data.id = id;

    return merge(unflatten(data));
  }

  /**
   *
   */
  async bulkInsert({
    resourceName,
    objects,
  }: {
    resourceName: string;
    objects: any[];
  }) {
    const { results } = await PromisePool.for(objects)
      .withConcurrency(this.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
      })
      .process(async (attributes: any) => {
        const result = await this.insert({
          resourceName,
          attributes,
        });

        return result;
      });

    return results;
  }

  async count({ resourceName }: { resourceName: string }) {
    let count = 0;
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const res: S3.ListObjectsV2Output = await this.client.listObjects({
        prefix: `resource=${resourceName}`,
        continuationToken,
      });

      count += res.KeyCount || 0;
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
    }

    return count;
  }

  async listIds({
    resourceName,
    limit = 1000,
  }: {
    resourceName: string;
    limit: number;
  }) {
    let ids: any[] = [];
    let truncated = true;
    let continuationToken;

    while (truncated && ids.length < limit) {
      const res: S3.ListObjectsV2Output = await this.client.listObjects({
        prefix: `resource=${resourceName}`,
        continuationToken,
      });

      ids = ids.concat(res.Contents?.map((x) => x.Key));
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
    }

    ids = ids.map((x) =>
      x.replace(
        path.join(this.keyPrefix, `resource=${resourceName}`, "id="),
        ""
      )
    );
    return ids;
  }

  async stream({
    resourceName,
    limit = 1000,
  }: {
    resourceName: string;
    limit: number;
  }) {
    return this.streamer.resourceRead({ resourceName });
  }

  /**
   * Looper
   * @param {string} resourceName
   * @returns
   */
  resource(resourceName: string) {
    const looper = {
      define: (attributes: any, options = {}) =>
        this.newResource({
          resourceName,
          attributes,
          options,
        }),

      definition: () => this.metadata.resources[resourceName],

      get: (id: any) =>
        this.getById({
          resourceName,
          id,
        }),

      insert: (attributes: any) =>
        this.insert({
          resourceName,
          attributes,
        }),

      bulkInsert: async (objects: any[]) => {
        return this.bulkInsert({ resourceName, objects });
      },

      count: async () => this.count({ resourceName }),

      listIds: async (options = {}) => {
        const { limit = 1000 }: { limit?: number } = options;
        return this.listIds({ resourceName, limit });
      },

      stream: async (options = {}) => {
        const { limit = 1000 }: { limit?: number } = options;
        return this.stream({ resourceName, limit });
      },
    };

    return looper;
  }
}
