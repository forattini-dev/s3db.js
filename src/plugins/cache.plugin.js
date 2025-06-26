import { join } from "path";

import { sha256 } from "../crypto.js";
import Plugin from "./plugin.class.js";
import S3Cache from "../cache/s3-cache.class.js";

export class CachePlugin extends Plugin {
  constructor(options = {}) {
    super()
    this.driver = options.driver
  }

  async setup(database) {
    this.database = database;
    
    if (!this.driver) this.driver = new S3Cache({
      keyPrefix: 'cache',
      client: database.client,
    });
    
    this.installDatabaseProxy();

    for (const resource of Object.values(database.resources)) {
      this.installResourcesProxies(resource);
    }
  }

  async start() { }
  async stop() { }

  installDatabaseProxy() {
    const db = this
    const installResourcesProxies = this.installResourcesProxies.bind(this);
    
    this.database._createResource = this.database.createResource
    this.database.createResource = async function (...args) {
      const resource = await this._createResource(...args);
      installResourcesProxies(resource);
      return resource
    }
  }

  installResourcesProxies(resource) {
    resource.cache = this.driver;

    let keyPrefix = `resource=${resource.name}`
    if (this.driver.keyPrefix) this.driver.keyPrefix = join(this.driver.keyPrefix, keyPrefix) 

    resource.cacheKeyFor = async function ({
      params = {},
      action = "list",
    }) {
      let key = Object.keys(params)
        .sort()
        .map((x) => `${x}:${params[x]}`)
        .join("|") || "empty";

      key = await sha256(key);
      key = join(keyPrefix, `action=${action}`, `${key}.json.gz`)
      return key;
    }

    // cache positive methods
    resource._count = resource.count;
    resource._listIds = resource.listIds;
    resource._getMany = resource.getMany;
    resource._getAll = resource.getAll;
    resource._page = resource.page;

    resource.count = async function () {
      const key = await this.cacheKeyFor({ action: "count" });

      try {
        const cached = await this.cache.get(key);
        if (cached) return cached;
      } catch (err) {
        if (err.name !== 'NoSuchKey') throw err
      }

      const data = await resource._count();
      await this.cache.set(key, data);
      return data
    }

    resource.listIds = async function () {
      const key = await this.cacheKeyFor({ action: "listIds" });

      try {
        const cached = await this.cache.get(key);
        if (cached) return cached;
      } catch (err) {
        if (err.name !== 'NoSuchKey') throw err
      }

      const data = await resource._listIds();
      await this.cache.set(key, data);
      return data
    }

    resource.getMany = async function (ids) {
      const key = await this.cacheKeyFor({ 
        action: "getMany", 
        params: { ids }
      })

      try {
        const cached = await this.cache.get(key);
        if (cached) return cached;
      } catch (err) {
        if (err.name !== 'NoSuchKey') throw err
      }

      const data = await resource._getMany(ids);
      await this.cache.set(key, data);
      return data
    }

    resource.getAll = async function () {
      const key = await this.cacheKeyFor({ action: "getAll" });

      try {
        const cached = await this.cache.get(key);
        if (cached) return cached;
      } catch (err) {
        if (err.name !== 'NoSuchKey') throw err
      }

      const data = await resource._getAll();
      await this.cache.set(key, data);
      return data
    }

    resource.page = async function ({ offset, size }) {
      const key = await this.cacheKeyFor({ 
        action: "page", 
        params: { offset, size }
      });

      try {
        const cached = await this.cache.get(key);
        if (cached) return cached;
      } catch (err) {
        if (err.name !== 'NoSuchKey') throw err
      }

      const data = await resource._page({ offset, size });
      await this.cache.set(key, data);
      return data
    }

    // cache negative methods
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    
    resource.insert = async function (...args) {
      const data = await resource._insert(...args);
      await this.cache.clear(keyPrefix);
      return data
    }
    
    resource.update = async function (...args) {
      const data = await resource._update(...args);
      await this.cache.clear(keyPrefix);
      return data
    }
    
    resource.delete = async function (...args) {
      const data = await resource._delete(...args);
      await this.cache.clear(keyPrefix);
      return data
    }
    
    resource.deleteMany = async function (...args) {
      const data = await resource._deleteMany(...args);
      await this.cache.clear(keyPrefix);
      return data
    }
  }
}

export default CachePlugin
