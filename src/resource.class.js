import path from "path";
import { nanoid } from "nanoid";
import EventEmitter from "events";
import { flatten, unflatten } from "flat";
import { PromisePool } from "@supercharge/promise-pool";

import { 
  chunk, 
  merge,
  sortBy, 
  isArray,
  cloneDeep, 
} from "lodash-es";

import { decrypt } from "./crypto"
import Schema from "./schema.class";
import { Validator } from "./validator.class";
import { InvalidResourceItem } from "./errors";
import S3ResourceCache from "./cache/s3-resource-cache.class";
import { ResourceReader, ResourceWriter } from "./stream/index"

class Resource extends EventEmitter {
  constructor({
    name,
    client,
    options = {},
    attributes = {},
    parallelism = 10,
    passphrase = 'secret',
    observers = [],
  }) {
    super();
    
    this.name = name;
    this.client = client;
    this.options = options;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? 'secret';

    this.schema = new Schema({
      name,
      attributes,
      passphrase,
    })

    if (this.options.cache === true) {
      this.s3Cache = new S3ResourceCache({
        resource: this,
        compressData: true,
        serializer: "json",
      });
    }
  }

  export() {
    return this.schema.export();
  }

  async validate(data) {
    const result = {
      original: cloneDeep(data),
      isValid: false,
      errors: [],
    };

    const check = await this.schema.validate(data, { mutateOriginal: true });

    if (check === true) {
      result.isValid = true;
    } else {
      result.errors = check;
    }

    return merge({}, result, { data });
  }

  async insert({ id, ...attributes }) {
    const { 
      errors,
      isValid, 
      data: validated,
    } = await this.validate(attributes);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes,
        validation: errors,
      })
    }

    if (!id && id !== 0) id = nanoid();
    const metadata = await this.schema.mapper(validated);

    await this.client.putObject({
      metadata,
      key: path.join(`resource=${this.name}`, `id=${id}`),
    });

    const final = merge({ id }, validated);

    if (this.s3Cache) {
      await this.s3Cache.purge();
    }

    this.emit("insert", final);
    return final;
  }

  async get(id) {
    const request = await this.client.headObject(
      path.join(`resource=${this.name}`, `id=${id}`)
    );

    let data = await this.schema.unmapper(request.Metadata);
    data.id = id;
    data._length = request.ContentLength;
    data._createdAt = request.LastModified;

    if (request.Expiration) data._expiresAt = request.Expiration;

    this.emit("get", data);
    return data;
  }

  async update(id, attributes) {
    const live = await this.get(id);
    const attrs = merge(live, attributes);
    delete attrs.id;

    const { isValid, errors, data: validated } = await this.validate(attrs);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.bucket,
        resourceName: this.name,
        attributes,
        validation: errors,
      })
    }

    await this.client.putObject({
      key: path.join(`resource=${this.name}`, `id=${id}`),
      body: "",
      metadata: this.schema.mapper(validated),
    });

    const final = {
      id,
      ...(unflatten(validated)),
    };

    if (this.s3Cache) await this.s3Cache.purge();

    this.emit("update", attributes, final);
    return final;
  }

  async delete(id) {
    const key = path.join(`resource=${this.name}`, `id=${id}`);
    const response = await this.client.deleteObject(key);

    if (this.s3Cache) await this.s3Cache.purge();

    this.emit("delete", id);
    return response;
  }

  async count() {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "count" });
      if (cached) return cached;
    }

    const count = await this.client.count({
      prefix: `resource=${this.name}`,
    });

    if (this.s3Cache) await this.s3Cache.put({ action: "count", data: count });

    this.emit("count", count);
    return count;
  }

  async insertMany(objects) {
    const { results } = await PromisePool.for(objects)
      .withConcurrency(this.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
        this.observers.map((x) => x.emit("error", this.name, error, content));
      })
      .process(async (attributes) => {
        const result = await this.insert(attributes);
        return result;
      });

    this.emit("insertMany", objects.length);
    return results;
  }

  async deleteMany(ids) {
    const packages = chunk(
      ids.map((x) => path.join(`resource=${this.name}`, `id=${x}`)),
      1000
    );

    const { results } = await PromisePool.for(packages)
      .withConcurrency(this.parallelism)
      .handleError(async (error, content) => {
        this.emit("error", error, content);
        this.observers.map((x) => x.emit("error", this.name, error, content));
      })
      .process(async (keys) => {
        const response = await this.client.deleteObjects(keys);

        keys.forEach((key) => {
          const id = key.split("=").pop();
          this.emit("deleted", id);
          this.observers.map((x) => x.emit("deleted", this.name, id));
        });

        return response;
      });

    if (this.s3Cache) await this.s3Cache.purge();

    this.emit("deleteMany", ids.length);
    return results;
  }

  async deleteAll() {
    const ids = await this.listIds();
    this.emit("deleteAll", ids.length);
    await this.deleteMany(ids);
  }

  async listIds() {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "listIds" });
      if (cached) return cached;
    }

    const keys = await this.client.getAllKeys({
      prefix: `resource=${this.name}`,
    });

    const ids = keys.map((x) => x.replace(`resource=${this.name}/id=`, ""));

    if (this.s3Cache) {
      await this.s3Cache.put({ action: "listIds", data: ids });
    }

    this.emit("listIds", ids.length);
    return ids;
  }

  async getMany(ids) {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({
        action: "getMany",
        params: { ids: ids.sort() },
      });
      if (cached) return cached;
    }

    const { results } = await PromisePool.for(ids)
      .withConcurrency(this.client.parallelism)
      .process(async (id) => {
        this.emit("id", id);
        const data = await this.get(id);
        this.emit("data", data);
        return data;
      });

    if (this.s3Cache)
      await this.s3Cache.put({
        action: "getMany",
        params: { ids: ids.sort() },
        data: results,
      });

    this.emit("getMany", ids.length);

    return results;
  }

  async getAll() {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "getAll" });
      if (cached) return cached;
    }

    let ids = [];
    let gotFromCache = false;

    if (this.s3Cache) {
      const cached = await this.s3Cache.get({ action: "listIds" });
      if (cached) {
        ids = cached;
        gotFromCache = true;
      }
    }

    if (!gotFromCache) ids = await this.listIds();

    if (ids.length === 0) return [];

    const { results } = await PromisePool.for(ids)
      .withConcurrency(this.client.parallelism)
      .process(async (id) => {
        const data = await this.get(id);
        return data;
      });

    if (this.s3Cache && results.length > 0) {
      await this.s3Cache.put({ action: "getAll", data: results });
    }

    this.emit("getAll", results.length);

    return results;
  }

  async page({ offset = 0, size = 100 }) {
    if (this.s3Cache) {
      const cached = await this.s3Cache.get({
        action: "page",
        params: { offset, size },
      });
      if (cached) return cached;
    }

    const keys = await this.client.getKeysPage({
      amount: size,
      offset: offset,
      prefix: `resource=${this.name}`,
    });

    const ids = keys.map((x) => x.replace(`resource=${this.name}/id=`, ""));

    const data = await this.getMany(ids);

    if (this.s3Cache)
      await this.s3Cache.put({
        action: "page",
        params: { offset, size },
        data,
      });

    return data;
  }

  readable() {
    const stream = new ResourceReader({ resource: this });
    return stream.build()
  }

  writable() {
    const stream = new ResourceWriter({ resource: this });
    return stream.build()
  }
}

export default Resource;
