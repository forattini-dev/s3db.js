import EventEmitter from "events";

export class Plugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = this.constructor.name;
    this.options = options;
    this.hooks = new Map();
  }

  async setup(database) {
    this.database = database;
    this.beforeSetup();
    await this.onSetup();
    this.afterSetup();
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

  // Override these methods in subclasses
  async onSetup() {
    // Override in subclasses
  }

  async onStart() {
    // Override in subclasses
  }

  async onStop() {
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
  beforeSetup() {
    this.emit("plugin.beforeSetup", new Date());
  }

  afterSetup() {
    this.emit("plugin.afterSetup", new Date());
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
}

export default Plugin;