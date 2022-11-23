import * as path from "path";
import { S3 } from "aws-sdk";
import Crypto from "crypto-js";
import { nanoid } from "nanoid";
import EventEmitter from "events";
import { sortBy, chunk, isArray } from "lodash";
import { flatten, unflatten } from "flat";
import { PromisePool } from "@supercharge/promise-pool";

import S3db from "./s3db.class";
import S3Client from "./s3-client.class";
import { S3dbInvalidResource } from "./errors";
import ResourceIdsReadStream from "./stream/resource-ids-read-stream.class";

import {
  ResourceInterface,
  ResourceConfigInterface,
} from "./resource.interface";
import ResourceIdsToDataTransformer from "./stream/resource-ids-transformer.class";

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
  constructor(params: ResourceConfigInterface) {
    super();

    this.s3db = params.s3db;
    this.name = params.name;
    this.schema = params.schema;
    this.options = params.options;
    this.client = params.s3Client;

    this.validator = params.validatorInstance.compile(this.schema);

    const { mapObj, reversedMapObj } = this.getMappersFromSchema(this.schema);
    this.mapObj = mapObj;
    this.reversedMapObj = reversedMapObj;

    this.studyOptions();
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
    const data = {
      name: this.name,
      schema: this.schema,
      mapper: this.mapObj,
      options: this.options,
    };

    for (const [name, definition] of Object.entries(this.schema)) {
      data.schema[name] = JSON.stringify(definition as any);
    }

    return data;
  }

  studyOptions() {
    if (!this.options.afterUnmap) this.options.beforeMap = [];
    if (!this.options.afterUnmap) this.options.afterUnmap = [];

    const schema: any = flatten(this.schema, { safe: true });

    for (const [name, definition] of Object.entries(schema)) {
      if ((definition as string).includes("secret")) {
        if (this.options.autoDecrypt === true) {
          this.options.afterUnmap.push({ attribute: name, action: "decrypt" });
        }
      }
      if ((definition as string).includes("array")) {
        this.options.beforeMap.push({ attribute: name, action: "fromArray" });
        this.options.afterUnmap.push({ attribute: name, action: "toArray" });
      }
      if ((definition as string).includes("number")) {
        this.options.beforeMap.push({ attribute: name, action: "toString" });
        this.options.afterUnmap.push({ attribute: name, action: "toNumber" });
      }
      if ((definition as string).includes("boolean")) {
        this.options.beforeMap.push({ attribute: name, action: "toJson" });
        this.options.afterUnmap.push({ attribute: name, action: "fromJson" });
      }
    }
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
    return this.check(flatten(data, { safe: true }));
  }

  map(data: any) {
    let obj: any = { ...data };

    for (const rule of this.options.beforeMap) {
      if (rule.action === "fromArray") {
        obj[rule.attribute] = (obj[rule.attribute] || []).join("|");
      } else if (rule.action === "toString") {
        obj[rule.attribute] = String(obj[rule.attribute]);
      } else if (rule.action === "toJson") {
        obj[rule.attribute] = JSON.stringify(obj[rule.attribute]);
      }
    }

    obj = Object.entries(obj).reduce((acc: any, [key, value]) => {
      acc[this.mapObj[key]] = isArray(value) ? value.join("|") : value;
      return acc;
    }, {});

    return obj;
  }

  unmap(data: any) {
    const obj = Object.entries(data).reduce((acc: any, [key, value]) => {
      acc[this.reversedMapObj[key]] = value;
      return acc;
    }, {});

    for (const rule of this.options.afterUnmap) {
      if (rule.action === "decrypt") {
        const decrypted = Crypto.AES.decrypt(
          obj[rule.attribute],
          String(this.s3db.passphrase)
        );

        obj[rule.attribute] = decrypted.toString(Crypto.enc.Utf8);
      } else if (rule.action === "toArray") {
        obj[rule.attribute] = (obj[rule.attribute] || "").split("|");
      } else if (rule.action === "toNumber") {
        obj[rule.attribute] = Number(obj[rule.attribute] || "");
      } else if (rule.action === "fromJson") {
        obj[rule.attribute] = JSON.parse(obj[rule.attribute]);
      }
    }

    return obj;
  }

  /**
   * Inserts a new object into the resource list.
   * @param {Object} param
   * @returns
   */
  async insert(attributes: any) {
    let { id, ...attrs }: { id: any; attrs: any } = flatten(attributes, {
      safe: true,
    });

    // validate
    const { isValid, errors, data: validated } = this.check(attrs);

    if (!isValid) {
      return Promise.reject(
        new S3dbInvalidResource({
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
    data = unflatten(data);

    data.id = id;
    data._length = request.ContentLength;
    data._createdAt = request.LastModified;
    data._checksum = request.ChecksumSHA256;

    if (request.Expiration) data._expiresAt = request.Expiration;

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

  /**
   * 
   * @returns number
   */
  async count() {
    const count = await this.client.count({
      prefix: `resource=${this.name}`,
    });

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

  async getAllIds() {
    const keys = await this.client.getAllKeys({
      prefix: `resource=${this.name}`,
    });

    const ids = keys.map((x) =>
      x.replace(path.join(`resource=${this.name}`, "id="), "")
    );

    return ids;
  }

  stream() {
    const stream = new ResourceIdsReadStream({ resource: this });
    const transformer = new ResourceIdsToDataTransformer({ resource: this });

    return stream.pipe(transformer);
  }
}
