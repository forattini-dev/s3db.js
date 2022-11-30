import * as path from "path";
import Crypto from "crypto-js";
import { nanoid } from "nanoid";
import EventEmitter from "events";
import { sortBy, chunk, isArray } from "lodash";
import { flatten, unflatten } from "flat";
import { PromisePool } from "@supercharge/promise-pool";

import S3db from "./s3db.class";
import S3Client from "./s3-client.class";
import { S3dbInvalidResource } from "./errors";
import ResourceWriteStream from "./stream/resource-write-stream.class";
import ResourceIdsReadStream from "./stream/resource-ids-read-stream.class";
import ResourceIdsToDataTransformer from "./stream/resource-ids-transformer.class";

import {
  ResourceInterface,
  ResourceConfigInterface,
} from "./resource.interface";
import S3ResourceCache from "./cache/s3-resource-cache.class";

export default class Resource
  extends EventEmitter
  implements ResourceInterface
{
  name: any;
  schema: any;
  mapObj: any;
  options: any;
  validator: any;
  reversedMapObj: any;

  s3db: S3db;
  s3Client: S3Client;
  s3Cache: S3ResourceCache | undefined;

  /**
   * Constructor
   */
  constructor(params: ResourceConfigInterface) {
    super();

    this.s3db = params.s3db;
    this.name = params.name;
    this.schema = params.schema;
    this.options = params.options;
    this.s3Client = params.s3Client;

    this.validator = params.validatorInstance.compile(this.schema);

    const { mapObj, reversedMapObj } = this.getMappersFromSchema(this.schema);
    this.mapObj = mapObj;
    this.reversedMapObj = reversedMapObj;

    this.studyOptions();

    if (this.options.cache === true) {
      this.s3Cache = new S3ResourceCache({
        resource: this,
        compressData: true,
        serializer: "json",
      });
    }
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
      schema: { ...this.schema },
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

    const addRule = (arr: any[], attribute: string, action: string) => {
      if (
        arr.filter((a) => a.attribute === attribute && a.action === action)
          .length > 0
      ) {
        arr.push({ attribute, action });
      }
    };

    for (const [name, definition] of Object.entries(schema)) {
      if ((definition as string).includes("secret")) {
        if (this.options.autoDecrypt === true) {
          addRule(this.options.afterUnmap, name, "decrypt");
        }
      }
      if ((definition as string).includes("array")) {
        addRule(this.options.beforeMap, name, "fromArray");
        addRule(this.options.afterUnmap, name, "toArray");
      }
      if ((definition as string).includes("number")) {
        addRule(this.options.beforeMap, name, "toString");
        addRule(this.options.afterUnmap, name, "toNumber");
      }
      if ((definition as string).includes("boolean")) {
        addRule(this.options.beforeMap, name, "toJson");
        addRule(this.options.afterUnmap, name, "fromJson");
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
          bucket: this.s3Client.bucket,
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
    await this.s3Client.putObject({
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

    if (this.s3Cache) {
      await this.s3Cache?.purge();
    }

    return final;
  }

  /**
   * Get a resource by id
   * @param {Object} param
   * @returns
   */
  async getById(id: any) {
    const request = await this.s3Client.headObject({
      key: path.join(`resource=${this.name}`, `id=${id}`),
    });

    let data: any = this.unmap(request.Metadata);
    data = unflatten(data);

    data.id = id;
    data._length = request.ContentLength;
    data._createdAt = request.LastModified;

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
    const response = await this.s3Client.deleteObject(key);

    this.emit("deleted", id);
    this.s3db.emit("deleted", this.name, id);

    if (this.s3Cache) {
      await this.s3Cache?.purge();
    }

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
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "count" });
      if (cached) return cached;
    }

    const count = await this.s3Client.count({
      prefix: `resource=${this.name}`,
    });

    if (this.s3Cache) {
      await this.s3Cache.put({ action: "count", data: count });
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
        const response = await this.s3Client.deleteObjects(keys);

        keys.forEach((key) => {
          const id = key.split("=").pop();
          this.emit("deleted", id);
          this.s3db.emit("deleted", this.name, id);
        });

        return response;
      });

    if (this.s3Cache) {
      await this.s3Cache?.purge();
    }

    return results;
  }

  async getAllIds() {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "getAllIds" });
      if (cached) return cached;
    }

    const keys = await this.s3Client.getAllKeys({
      prefix: `resource=${this.name}`,
    });

    const ids = keys.map((x) => x.replace(`resource=${this.name}/id=`, ""));

    if (this.s3Cache) {
      await this.s3Cache.put({ action: "getAllIds", data: ids });
      const x = await this.s3Cache.get({ action: "getAllIds" });
    }

    return ids;
  }

  async deleteAll() {
    const ids = await this.getAllIds();
    await this.bulkDelete(ids);
  }

  async getByIdList(ids: string[]) {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "getAll" });
      if (cached) return cached;
    }

    const { results } = await PromisePool.for(ids)
      .withConcurrency(this.s3Client.parallelism)
      .process(async (id: string) => {
        this.emit("id", id);
        const data = await this.getById(id);
        this.emit("data", data);
        return data;
      });

    if (this.s3Cache) {
      await this.s3Cache.put({ action: "getAll", data: results });
    }

    return results;
  }

  async getAll() {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "getAll" });
      if (cached) return cached;
    }

    let ids: string[] = [];
    let gotFromCache = false;

    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "getAllIds" });
      if (cached) {
        ids = cached;
        gotFromCache = true;
      }
    }

    if (!gotFromCache) ids = await this.getAllIds();

    if (ids.length === 0) return [];

    const { results } = await PromisePool.for(ids)
      .withConcurrency(this.s3Client.parallelism)
      .process(async (id: string) => {
        this.emit("id", id);
        const data = await this.getById(id);
        this.emit("data", data);
        return data;
      });

    if (this.s3Cache && results.length > 0) {
      await this.s3Cache.put({ action: "getAll", data: results });
      const x = await this.s3Cache.get({ action: "getAll" });
    }

    return results;
  }

  read() {
    const stream = new ResourceIdsReadStream({ resource: this });
    const transformer = new ResourceIdsToDataTransformer({ resource: this });

    return stream.pipe(transformer);
  }

  write() {
    const stream = new ResourceWriteStream({ resource: this });
    return stream;
  }
}
