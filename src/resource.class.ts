import * as path from "path";
import { S3 } from "aws-sdk";
import { nanoid } from "nanoid";
import EventEmitter from "events";
import { sortBy, chunk } from "lodash";
import { flatten, unflatten } from "flat";
import { PromisePool } from "@supercharge/promise-pool";

import S3db from "./s3db.class";
import S3Client from "./s3-client.class";
import { InvalidResource } from "./errors";

import {
  ResourceInterface,
  ResourceConfigInterface,
} from "./resource.interface";

export default class Resource
  extends EventEmitter
  implements ResourceInterface
{
  s3db: S3db;
  client: S3Client;
  options: any;
  schema: any;
  validator: any;
  mapObj: any;
  reversedMapObj: any;
  name: any;

  /**
   * Constructor
   */
  constructor(options: ResourceConfigInterface) {
    super();

    this.options = options;
    this.name = options.name;
    this.schema = options.schema;
    this.s3db = options.s3db;
    this.client = options.s3Client;
    this.validator = options.validatorInstance.compile(this.schema);

    const { mapObj, reversedMapObj } = this.getMappersFromSchema(this.schema);
    this.mapObj = mapObj;
    this.reversedMapObj = reversedMapObj;
  }

  getMappersFromSchema(schema: any) {
    let i = 0;

    const mapObj = sortBy(Object.entries(schema), ["0"]).reduce(
      (acc: any, [key, value]) => {
        acc[key] = String(i++);
        return acc;
      },
      {}
    );

    const reversedMapObj = Object.entries(mapObj).reduce(
      (acc: any, [key, value]) => {
        acc[String(value)] = key;
        return acc;
      },
      {}
    );

    return {
      mapObj,
      reversedMapObj,
    };
  }

  export() {
    return {
      name: this.name,
      options: {},
      schema: this.schema,
      mapper: this.mapObj,
    };
  }

  private check(data: any) {
    const result = {
      original: { ...data },
      isValid: false,
      errors: [],
    };

    const check = this.validator(data);

    if (check === true) {
      result.isValid = true;
    } else {
      result.errors = check;
    }

    return {
      ...result,
      data,
    };
  }

  validate(data: any) {
    return this.check(flatten(data));
  }

  map(data: any) {
    return Object.entries(data).reduce((acc: any, [key, value]) => {
      acc[this.mapObj[key]] = value;
      return acc;
    }, {});
  }

  unmap(data: any) {
    return Object.entries(data).reduce((acc: any, [key, value]) => {
      acc[this.reversedMapObj[key]] = value;
      return acc;
    }, {});
  }

  /**
   * Inserts a new object into the resource list.
   * @param {Object} param
   * @returns
   */
  async insert(attributes: any) {
    let { id, ...attrs }: { id: any; attrs: any } = flatten(attributes);

    // validate
    const { isValid, errors, data: validated } = this.check(attrs);

    if (!isValid) {
      return Promise.reject(
        new InvalidResource({
          bucket: this.client.bucket,
          resourceName: this.name,
          attributes,
          validation: errors,
        })
      );
    }

    if (!id && id !== 0) {
      id = nanoid();
    }

    // save
    await this.client.putObject({
      key: path.join(`resource=${this.name}`, `id=${id}`),
      body: "",
      metadata: this.map(validated),
    });

    const final = {
      id,
      ...(unflatten(validated) as object),
    };

    this.emit("inserted", final);
    this.s3db.emit("inserted", this.name, final);

    return final;
  }

  /**
   * Get a resource by id
   * @param {Object} param
   * @returns
   */
  async getById(id: any) {
    const request = await this.client.headObject({
      key: path.join(`resource=${this.name}`, `id=${id}`),
    });

    let data: any = this.unmap(request.Metadata);
    data.id = id;
    data = unflatten(data);

    this.emit("got", data);
    this.s3db.emit("got", this.name, data);

    return data;
  }

  /**
   * Delete a resource by id
   * @param {Object} param
   * @returns
   */
  async deleteById(id: any) {
    const key = path.join(`resource=${this.name}`, `id=${id}`);
    const response = await this.client.deleteObject(key);

    this.emit("deleted", id);
    this.s3db.emit("deleted", this.name, id);

    return response;
  }

  /**
   *
   */
  async bulkInsert(objects: any[]) {
    const { results } = await PromisePool.for(objects)
      .withConcurrency(this.s3db.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
        this.s3db.emit("error", this.name, error, content);
      })
      .process(async (attributes: any) => {
        const result = await this.insert(attributes);
        return result;
      });

    return results;
  }

  async count() {
    let count = 0;
    let truncated = true;
    let continuationToken;

    while (truncated) {
      const res: S3.ListObjectsV2Output = await this.client.listObjects({
        prefix: `resource=${this.name}`,
        continuationToken,
      });

      count += res.KeyCount || 0;
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
    }

    return count;
  }

  /**
   * Delete resources by a list of ids
   * @param {Object} param
   * @returns
   */
  async bulkDelete(ids: any[]): Promise<any[]> {
    let packages = chunk(
      ids.map((x) => path.join(`resource=${this.name}`, `id=${x}`)),
      1000
    );

    const { results } = await PromisePool.for(packages)
      .withConcurrency(this.s3db.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
        this.s3db.emit("error", this.name, error, content);
      })
      .process(async (keys: string[]) => {
        const response = await this.client.deleteObjects(keys);

        keys.forEach((key) => {
          const id = key.split("=").pop();
          this.emit("deleted", id);
          this.s3db.emit("deleted", this.name, id);
        });

        return response;
      });

    return results;
  }

  async listIds({ limit = 1000 }: { limit?: number } = {}) {
    let ids: any[] = [];
    let truncated = true;
    let continuationToken;

    while (truncated && ids.length < limit) {
      const res: S3.ListObjectsV2Output = await this.client.listObjects({
        prefix: `resource=${this.name}`,
        continuationToken,
      });

      ids = ids.concat(res.Contents?.map((x) => x.Key));
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
    }

    ids = ids.map((x) =>
      x.replace(
        path.join(this.s3db.keyPrefix, `resource=${this.name}`, "id="),
        ""
      )
    );
    return ids;
  }

  async stream({ limit = 1000 }: { limit?: number }) {
    return this.s3db.streamer.resourceRead({ resourceName: this.name });
  }
}
