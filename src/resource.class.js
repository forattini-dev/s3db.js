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
} from "lodash-es";

import { decrypt } from "./crypto"
import { Validator } from "./validator.class";
import { InvalidResourceItem } from "./errors";
import { ResourceReader, ResourceWriter } from "./stream/index"
import S3ResourceCache from "./cache/s3-resource-cache.class";

class Resource extends EventEmitter {
  constructor({
    name,
    client,
    options = {},
    attributes = {},
    parallelism = 10,
    passphrase = 'secret',
    validatorInstance = null,
    observers = [],
  }) {
    super();
    
    this.name = name;
    this.client = client;
    this.options = options;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? 10;

    this.schema = merge(
      { $$async: true }, 
      flatten(attributes, { safe: true }),
    )

    if (!validatorInstance) {
      validatorInstance = new Validator({ passphrase: this.passphrase ?? 'secret' });
    }

    this.validator = validatorInstance.compile(this.schema);

    const { mapObj, reversedMapObj } = this.getMappersFromSchema(this.schema);
    this.mapObj = mapObj;
    this.reversedMapObj = reversedMapObj;

    this.parseSchema();

    if (this.options.cache === true) {
      this.s3Cache = new S3ResourceCache({
        resource: this,
        compressData: true,
        serializer: "json",
      });
    }
  }

  getMappersFromSchema(schema) {
    let i = 0;

    const mapObj = sortBy(Object.entries(schema), ["0"]).reduce((acc, [key]) => {
      acc[key] = String(i++);
      return acc;
    }, {});

    const reversedMapObj = Object.entries(mapObj).reduce((acc, [key, value]) => {
      acc[String(value)] = key;
      return acc;
    }, {});

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
      data.schema[name] = JSON.stringify(definition);
    }

    return data;
  }

  parseSchema() {
    if (!this.options.afterUnmap) this.options.beforeMap = {};
    if (!this.options.afterUnmap) this.options.afterUnmap = {};

    const schema = flatten(this.schema, { safe: true });

    const addRule = (arr, attribute, action) => {
      if (!this.options[arr][attribute]) this.options[arr][attribute] = [];

      this.options[arr][attribute] = [
        ...new Set([...this.options[arr][attribute], action]),
      ];
    };

    for (const [name, definition] of Object.entries(schema)) {
      if (definition.includes("secret")) {
        if (this.options.autoDecrypt === true) {
          addRule("afterUnmap", name, "decrypt");
        }
      }
      if (definition.includes("array")) {
        addRule("beforeMap", name, "fromArray");
        addRule("afterUnmap", name, "toArray");
      }
      if (definition.includes("number")) {
        addRule("beforeMap", name, "toString");
        addRule("afterUnmap", name, "toNumber");
      }
      if (definition.includes("boolean")) {
        addRule("beforeMap", name, "toJson");
        addRule("afterUnmap", name, "fromJson");
      }
    }
  }

  async check(data) {
    const result = {
      original: { ...data },
      isValid: false,
      errors: [],
    };

    const check = await this.validator(data);

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

  validate(data) {
    return this.check(flatten(data, { safe: true }));
  }

  map(data) {
    let obj = { ...data };

    for (const [attribute, actions] of Object.entries(this.options.beforeMap)) {
      for (const action of actions) {
        if (action === "fromArray") {
          obj[attribute] = (obj[attribute] || []).join("|");
        } else if (action === "toString") {
          obj[attribute] = String(obj[attribute]);
        } else if (action === "toJson") {
          obj[attribute] = JSON.stringify(obj[attribute]);
        }
      }
    }

    obj = Object.entries(obj).reduce((acc, [key, value]) => {
      acc[this.mapObj[key]] = isArray(value) ? value.join("|") : value;
      return acc;
    }, {});

    return obj;
  }

  unmap(data) {
    const obj = Object.entries(data).reduce((acc, [key, value]) => {
      acc[this.reversedMapObj[key]] = value;
      return acc;
    }, {});

    for (const [attribute, actions] of Object.entries(this.options.afterUnmap)) {
      for (const action of actions) {
        if (action === "decrypt") {
          let content = obj[attribute];
          content = decrypt(content, this.passphrase);
          obj[attribute] = content;
        } else if (action === "toArray") {
          obj[attribute] = (obj[attribute] || "").split("|");
        } else if (action === "toNumber") {
          obj[attribute] = Number(obj[attribute] || "");
        } else if (action === "fromJson") {
          obj[attribute] = JSON.parse(obj[attribute]);
        }
      }
    }

    return obj;
  }

  async insert(attributes) {
    let { id, ...attrs } = flatten(attributes, {
      safe: true,
    });

    const { isValid, errors, data: validated } = await this.check(attrs);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes,
        validation: errors,
      })
    }

    if (!id && id !== 0) id = nanoid();
    const mappedData = this.map(validated);

    await this.client.putObject({
      key: path.join(`resource=${this.name}`, `id=${id}`),
      metadata: mappedData,
    });

    const final = { id, ...(unflatten(this.unmap(mappedData))) };

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

    let data = this.unmap(request.Metadata);
    data = unflatten(data);

    data.id = id;
    data._length = request.ContentLength;
    data._createdAt = request.LastModified;

    if (request.Expiration) data._expiresAt = request.Expiration;

    this.emit("get", data);

    return data;
  }

  async update(id, attributes) {
    const obj = await this.get(id);

    const attrs1 = flatten(attributes, { safe: true });
    const attrs2 = flatten(obj, { safe: true });

    const attrs = merge(attrs2, attrs1);
    delete attrs.id;

    const { isValid, errors, data: validated } = await this.check(attrs);

    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.bucket,
        resourceName: this.name,
        attributes,
        validation: errors,
      })
    }

    if (!id && id !== 0) id = nanoid();

    await this.client.putObject({
      key: path.join(`resource=${this.name}`, `id=${id}`),
      body: "",
      metadata: this.map(validated),
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
