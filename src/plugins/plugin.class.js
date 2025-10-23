import EventEmitter from "events";
import { PluginStorage } from "../concerns/plugin-storage.js";

export class Plugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = this.constructor.name;
    this.options = options;
    this.hooks = new Map();

    // Auto-generate slug from class name (CamelCase -> kebab-case)
    // e.g., EventualConsistencyPlugin -> eventual-consistency-plugin
    this.slug = options.slug || this._generateSlug();

    // Storage instance (lazy-loaded)
    this._storage = null;
  }

  /**
   * Generate kebab-case slug from class name
   * @private
   * @returns {string}
   */
  _generateSlug() {
    return this.name
      .replace(/Plugin$/, '') // Remove "Plugin" suffix
      .replace(/([a-z])([A-Z])/g, '$1-$2') // CamelCase -> kebab-case
      .toLowerCase();
  }

  /**
   * Get PluginStorage instance (lazy-loaded)
   * @returns {PluginStorage}
   */
  getStorage() {
    if (!this._storage) {
      if (!this.database || !this.database.client) {
        throw new Error('Plugin must be installed before accessing storage');
      }
      this._storage = new PluginStorage(this.database.client, this.slug);
    }
    return this._storage;
  }

  /**
   * Install plugin
   * @param {Database} database - Database instance
   */
  async install(database) {
    this.database = database;
    this.beforeInstall();
    await this.onInstall();
    this.afterInstall();
  }

  async start() {
    this.beforeStart();
    await this.onStart();
    this.afterStart();
  }

  async stop() {
    this.beforeStop();
    await this.onStop();
    this.afterStop();
  }

  /**
   * Uninstall plugin and cleanup all data
   * @param {Object} options - Uninstall options
   * @param {boolean} options.purgeData - Delete all plugin data from S3 (default: false)
   */
  async uninstall(options = {}) {
    const { purgeData = false } = options;

    this.beforeUninstall();
    await this.onUninstall(options);

    // Purge all plugin data if requested
    if (purgeData && this._storage) {
      const deleted = await this._storage.deleteAll();
      this.emit('plugin.dataPurged', { deleted });
    }

    this.afterUninstall();
  }

  // Override these methods in subclasses
  async onInstall() {
    // Override in subclasses
  }

  async onStart() {
    // Override in subclasses
  }

  async onStop() {
    // Override in subclasses
  }

  async onUninstall(options) {
    // Override in subclasses
  }

  // Hook management methods
  addHook(resource, event, handler) {
    if (!this.hooks.has(resource)) {
      this.hooks.set(resource, new Map());
    }
    
    const resourceHooks = this.hooks.get(resource);
    if (!resourceHooks.has(event)) {
      resourceHooks.set(event, []);
    }
    
    resourceHooks.get(event).push(handler);
  }

  removeHook(resource, event, handler) {
    const resourceHooks = this.hooks.get(resource);
    if (resourceHooks && resourceHooks.has(event)) {
      const handlers = resourceHooks.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Enhanced resource method wrapping that supports multiple plugins
  wrapResourceMethod(resource, methodName, wrapper) {
    const originalMethod = resource[methodName];
    
    if (!resource._pluginWrappers) {
      resource._pluginWrappers = new Map();
    }
    
    if (!resource._pluginWrappers.has(methodName)) {
      resource._pluginWrappers.set(methodName, []);
    }
    
    // Store the wrapper
    resource._pluginWrappers.get(methodName).push(wrapper);
    
    // Create the wrapped method if it doesn't exist
    if (!resource[`_wrapped_${methodName}`]) {
      resource[`_wrapped_${methodName}`] = originalMethod;
      
      // Preserve jest mock if it's a mock function
      const isJestMock = originalMethod && originalMethod._isMockFunction;
      
      resource[methodName] = async function(...args) {
        let result = await resource[`_wrapped_${methodName}`](...args);
        
        // Apply all wrappers in order
        for (const wrapper of resource._pluginWrappers.get(methodName)) {
          result = await wrapper.call(this, result, args, methodName);
        }
        
        return result;
      };
      
      // Preserve jest mock properties if it was a mock
      if (isJestMock) {
        Object.setPrototypeOf(resource[methodName], Object.getPrototypeOf(originalMethod));
        Object.assign(resource[methodName], originalMethod);
      }
    }
  }

  /**
   * Add a middleware to intercept a resource method (Koa/Express style).
   * Middleware signature: async (next, ...args) => { ... }
   * - Chame next(...args) para continuar a cadeia.
   * - Retorne sem chamar next para interromper.
   * - Pode modificar argumentos/resultados.
   */
  addMiddleware(resource, methodName, middleware) {
    // Safety check: verify method exists
    if (typeof resource[methodName] !== 'function') {
      throw new Error(`Cannot add middleware to "${methodName}": method does not exist on resource "${resource.name || 'unknown'}"`);
    }

    if (!resource._pluginMiddlewares) {
      resource._pluginMiddlewares = {};
    }
    if (!resource._pluginMiddlewares[methodName]) {
      resource._pluginMiddlewares[methodName] = [];
      // Wrap the original method only once
      const originalMethod = resource[methodName].bind(resource);
      resource[methodName] = async function(...args) {
        let idx = -1;
        const next = async (...nextArgs) => {
          idx++;
          if (idx < resource._pluginMiddlewares[methodName].length) {
            // Call next middleware
            return await resource._pluginMiddlewares[methodName][idx].call(this, next, ...nextArgs);
          } else {
            // Call original method
            return await originalMethod(...nextArgs);
          }
        };
        return await next(...args);
      };
    }
    resource._pluginMiddlewares[methodName].push(middleware);
  }

  // Partition-aware helper methods
  getPartitionValues(data, resource) {
    if (!resource.config?.partitions) return {};
    
    const partitionValues = {};
    for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
      if (partitionDef.fields) {
        partitionValues[partitionName] = {};
        for (const [fieldName, rule] of Object.entries(partitionDef.fields)) {
          const value = this.getNestedFieldValue(data, fieldName);
          // Only add field if value exists
          if (value !== null && value !== undefined) {
            partitionValues[partitionName][fieldName] = resource.applyPartitionRule(value, rule);
          }
        }
      } else {
        partitionValues[partitionName] = {};
      }
    }
    
    return partitionValues;
  }

  getNestedFieldValue(data, fieldPath) {
    if (!fieldPath.includes('.')) {
      return data[fieldPath] ?? null;
    }
    
    const keys = fieldPath.split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return value ?? null;
  }

  // Event emission methods
  beforeInstall() {
    this.emit("plugin.beforeInstall", new Date());
  }

  afterInstall() {
    this.emit("plugin.afterInstall", new Date());
  }

  beforeStart() {
    this.emit("plugin.beforeStart", new Date());
  }

  afterStart() {
    this.emit("plugin.afterStart", new Date());
  }

  beforeStop() {
    this.emit("plugin.beforeStop", new Date());
  }

  afterStop() {
    this.emit("plugin.afterStop", new Date());
  }

  beforeUninstall() {
    this.emit("plugin.beforeUninstall", new Date());
  }

  afterUninstall() {
    this.emit("plugin.afterUninstall", new Date());
  }
}

export default Plugin;