import * as path from "path";
import { URL } from "node:url";
import { v4 as uuid } from "uuid";
import { S3, Credentials } from "aws-sdk";
import { flatten, unflatten } from "flat";
import Validator from "fastest-validator";
import { isArray, isEmpty, isObject, merge, sortBy } from "lodash";
import fs from 'fs'

import { version } from "../package.json";
import ConfigInterface from "./config.interface";
import LoggerInterface from "./logger.interface";
import MetadataInterface from "./metadata.interface";
import { MissingMetadata, NoSuchKey, InvalidResource } from "./errors";

export default class S3db {
  options: ConfigInterface;
  client: S3;
  keyPrefix: string = "";
  bucket: string = "s3db";
  version: string;
  logger: LoggerInterface;
  metadata: MetadataInterface;
  validatorInstance: any;

  /**
   * Constructor
   */
  constructor(options: ConfigInterface) {
    this.options = options;
    this.version = version;
    this.logger = options.logger || console;
    this.metadata = this.blankMetadataStructure();

    const uri = new URL(options.uri);
    this.bucket = uri.hostname;

    let [, ...subpath] = uri.pathname.split("/");
    this.keyPrefix = [...(subpath || [])].join("/");

    this.client = new S3({
      credentials: new Credentials({
        accessKeyId: uri.username,
        secretAccessKey: uri.password,
      }),
    });

    this.validatorInstance = new Validator();
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
          this.logger.warn(
            `Client version ${this.version} is different than ${metadata.version}`
          );
        }
      } else {
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
      const request = await this._s3GetObject({
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

    Object.entries(metadata.resources)
      .forEach(([resourceName, resourceDefinition]: [string, any]) => {
        let resource = this.metadata.resources[resourceName]

        resource = {
          ...resource,
          validator: this.validatorInstance.compile(resourceDefinition.schema),
          reversed: this.reverseMapper(resourceDefinition.mapper),
        }

        this.metadata.resources[resourceName] = resource
      });
  }

  /**
   * Generates empty metadata structure.
   * @returns MetadataInterface
   */
  private blankMetadataStructure(): MetadataInterface {
    return {
      version,
      resources: {},
    };
  }

  /**
   * Generate and upload new metadata structure.
   * @returns MetadataInterface
   */
  private async generateAndUploadMetadata(): Promise<MetadataInterface> {
    const body = this.blankMetadataStructure();

    await this._s3PutObject({ body, key: `s3db.json` });

    return body;
  }

  /**
   * Proxy to AWS S3's getObject
   * @param param0 key
   * @returns 
   */
  private async _s3GetObject({ key }: { key: string }) {
    try {
      const request = await this.client
        ?.getObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
        })
        .promise();

      return request;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          throw new NoSuchKey({ bucket: this.bucket, key });
        } else {
          return Promise.reject(new Error(error.name));
        }
      }
      throw error;
    }
  }

  /**
   * Proxy to AWS S3's putObject
   * @param {Object} param
   * @param {string} param.key
   * @param {string} param.body
   * @param {string} param.metadata
   * @returns 
   */
  private async _s3PutObject({
    key,
    body,
    metadata,
  }: {
    key: string;
    body: string | object;
    metadata?: object;
  }) {
    try {
      const request = await this.client
        .putObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
          Body: Buffer.from(
            isObject(body) ? JSON.stringify(body, null, 2) : body
          ),
          Metadata: { ...metadata },
        })
        .promise();

      return request;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  /**
   * Proxy to AWS S3's headObject
   * @param {Object} param
   * @param {string} param.key
   * @returns 
   */
  private async _s3HeadObject({ key }: { key: string }) {
    try {
      const request = await this.client
        ?.headObject({
          Bucket: this.bucket,
          Key: path.join(this.keyPrefix, key),
        })
        .promise();

      return request;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "NoSuchKey") {
          throw new NoSuchKey({ bucket: this.bucket, key });
        } else {
          return Promise.reject(new Error(error.name));
        }
      }
      throw error;
    }
  }

  /**
   * Reverses a object to have the oter way to translate from
   * @param {Object} mapper
   * @returns 
   */
  reverseMapper(mapper: any) {
    return Object.entries(mapper).reduce((acc: any, [key, value]) => {
      acc[String(value)] = key;
      return acc
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

    await this._s3PutObject({
      body: metadata,
      key: `s3db.json`,
    });
  }

  translateObjectWithMapper (resourceName: string, obj: any, mapper: any) {
    if (isEmpty(mapper)) throw new Error('invalid mapper')

    return Object.entries(obj)
      .reduce((acc: any, [key, value]) => {
        acc[mapper[key]] = value
        return acc
      }, {})
  }

  /**
   * Inserts a new object into the resource list.
   * @param {Object} param
   * @returns 
   */
  async insert({
    id,
    attributes,
    resourceName,
  }: {
    id?: string | number;
    attributes: any;
    resourceName: string;
  }) {
    const attributesFlat: any = flatten(attributes)
    
    // validate
    const errors = this.metadata.resources[resourceName].validator(attributesFlat)

    if (isArray(errors)) {
      throw new InvalidResource({ 
        bucket: this.bucket, 
        resourceName, 
        attributes, 
        validation: errors
      })
    }
  
    // save
    if (isEmpty(id)) id = uuid();
    const mapper: any = this.metadata.resources[resourceName].mapper

    await this._s3PutObject({
      key: path.join(`resource=${resourceName}`, `id=${id}`),
      body: "",
      metadata: this.translateObjectWithMapper(resourceName, attributesFlat, mapper),
    });

    return {
      ...attributes,
      id,
    };
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
    const mapper: any = this.metadata.resources[resourceName].reversed

    const request = await this._s3HeadObject({
      key: path.join(`resource=${resourceName}`, `id=${id}`),
    });

    const data: any = this.translateObjectWithMapper(resourceName, request.Metadata, mapper)
    data.id = id

    return merge(unflatten(data))
  }

  /**
   * Looper
   * @param {string} resourceName 
   * @returns 
   */
  resource(resourceName: string) {
    const looper = {
      define:
        (attributes: any, options = {}) =>
        async () => {
          await this.newResource({
            resourceName,
            attributes,
            options,
          });

          return looper;
        },

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
      
      bulkInsert: async (attributes: any[]) => {
        for (const attr in attributes) {
          await this.insert({
            resourceName,
            attributes: attr,
          })
        }

        return looper
      }
    };

    return looper;
  }
}
