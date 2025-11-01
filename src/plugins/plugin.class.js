import EventEmitter from "events";
import { PluginStorage } from "../concerns/plugin-storage.js";
import { PluginError } from "../errors.js";
import { listPluginNamespaces } from "./namespace.js";

export class Plugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = this.constructor.name;
    this.options = options;
    this.hooks = new Map();

    // Auto-generate slug from class name (CamelCase -> kebab-case)
    // e.g., EventualConsistencyPlugin -> eventual-consistency-plugin
    this.baseSlug = options.slug || this._generateSlug();
    this.slug = this.baseSlug;

    // Storage instance (lazy-loaded)
    this._storage = null;

    // Multi-instance & namespacing
    this.instanceName = null;
    this.namespace = null;
    this._namespaceExplicit = false;

    if (options.namespace || options.instanceId) {
      this.setNamespace(options.namespace || options.instanceId, { explicit: true });
    }
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
   * Normalize namespace into kebab-case
   * @private
   */
  _normalizeNamespace(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '') || null;
  }

  /**
   * Update plugin namespace (affects storage slug & helpers)
   * @param {string|null} value
   * @param {Object} options
   * @param {boolean} options.explicit - Whether namespace was set explicitly by the user
   */
  setNamespace(value, { explicit = false } = {}) {
    const normalized = this._normalizeNamespace(value);

    if (!normalized) {
      if (explicit) {
        this.namespace = null;
        this.slug = this.baseSlug;
        this._namespaceExplicit = true;
        this._storage = null;
        if (typeof this.onNamespaceChanged === 'function') {
          this.onNamespaceChanged(this.namespace);
        }
      }
      return;
    }

    if (this.namespace === normalized && (explicit === false || this._namespaceExplicit)) {
      return;
    }

    this.namespace = normalized;
    if (explicit) {
      this._namespaceExplicit = true;
    }

    this.slug = `${this.baseSlug}--${normalized}`;
    this._storage = null; // Recreate storage with new slug on next access

    if (typeof this.onNamespaceChanged === 'function') {
      this.onNamespaceChanged(this.namespace);
    }
  }

  /**
   * Set instance name (called by Database when registering the plugin)
   * Automatically derives namespace when not explicitly provided.
   */
  setInstanceName(name) {
    if (!name) return;
    this.instanceName = name;

    if (!this._namespaceExplicit) {
      const normalized = this._normalizeNamespace(name);
      if (normalized && normalized !== this.baseSlug) {
        this.setNamespace(normalized);
      }
    }
  }

  /**
   * Hook for subclasses to react to namespace changes
   * @param {string|null} namespace
   */
  // eslint-disable-next-line no-unused-vars
  onNamespaceChanged(namespace) {
    // Subclasses may override
  }

  /**
   * Get PluginStorage instance (lazy-loaded)
   * @returns {PluginStorage}
   */
  getStorage() {
    if (!this._storage) {
      if (!this.database || !this.database.client) {
        throw new PluginError('Plugin storage unavailable until plugin is installed', {
          pluginName: this.name,
          operation: 'getStorage',
          statusCode: 400,
          retriable: false,
          suggestion: 'Call db.installPlugin(new Plugin()) or ensure db.connect() completed before accessing storage.'
        });
      }
      this._storage = new PluginStorage(this.database.client, this.slug);
    }
    return this._storage;
  }

  /**
   * Detect and warn about existing namespaces
   *
   * Automatically called during install() if plugin uses namespaces.
   * Scans storage to find existing namespaces and emits console warnings.
   *
   * @returns {Promise<string[]>} Array of detected namespaces
   */
  async detectAndWarnNamespaces() {
    // Only run if plugin explicitly uses namespaces
    if (!this._namespaceExplicit && !this.namespace) {
      return [];
    }

    try {
      // Get plugin prefix from slug (e.g., 'recon', 'scheduler', 'cache')
      const pluginPrefix = this.baseSlug;
      const currentNamespace = this.namespace || '';

      // List existing namespaces in storage
      const existingNamespaces = await listPluginNamespaces(
        this.getStorage(),
        pluginPrefix
      );

      // Emit console warnings (standardized format)
      if (existingNamespaces.length > 0) {
        console.warn(
          `[${this.name}] Detected ${existingNamespaces.length} existing namespace(s): ${existingNamespaces.join(', ')}`
        );
      }

      const namespaceDisplay = currentNamespace === '' ? '(none)' : `"${currentNamespace}"`;
      console.warn(`[${this.name}] Using namespace: ${namespaceDisplay}`);

      return existingNamespaces;
    } catch (error) {
      // Silently fail if storage is not available
      return [];
    }
  }

  /**
   * Install plugin
   * @param {Database} database - Database instance
   */
  async install(database) {
    this.database = database;
    this.beforeInstall();

    // Auto-detect and warn about namespaces if plugin uses them
    await this.detectAndWarnNamespaces();

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
      throw new PluginError(`Cannot add middleware to "${methodName}"`, {
        pluginName: this.name,
        operation: 'addMiddleware',
        statusCode: 400,
        retriable: false,
        suggestion: 'Ensure the resource exposes the method before registering middleware.',
        resourceName: resource.name || 'unknown',
        methodName
      });
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
