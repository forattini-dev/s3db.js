import { flatten, unflatten } from "flat";

import {
  set,
  get,
  uniq,
  merge,
  invert,
  isEmpty,
  isString,
  cloneDeep,
} from "lodash-es";

import { encrypt, decrypt } from "./crypto.js";
import { ValidatorManager } from "./validator.class.js";

export const SchemaActions = {
  trim: (value) => value.trim(),

  encrypt: (value, { passphrase }) => encrypt(value, passphrase),
  decrypt: async (value, { passphrase }) => {
    try {
      const raw = await decrypt(value, passphrase)
      return raw;
    } catch (error) {
      console.warn(`Schema decrypt error: ${error}`, error)
      return value;

    }
  },

  toString: (value) => String(value),

  fromArray: (value, { separator }) => {
    // Handle null, undefined, or non-array values
    if (value === null || value === undefined || !Array.isArray(value)) {
      return value; // Preserve null/undefined, don't serialize non-arrays
    }
    
    // Handle empty arrays
    if (value.length === 0) {
      return '[]'; // Special marker for empty arrays
    }
    
    // Escape separator characters in array items before joining
    // First escape backslashes, then escape the separator
    const escapedItems = value.map(item => {
      if (typeof item === 'string') {
        return item
          .replace(/\\/g, '\\\\') // Escape backslashes first
          .replace(new RegExp(`\\${separator}`, 'g'), `\\${separator}`); // Then escape separator
      }
      return String(item);
    });
    
    return escapedItems.join(separator);
  },

  toArray: (value, { separator }) => {
    // Handle null/undefined values - preserve them
    if (value === null || value === undefined) {
      return value;
    }
    
    // Handle empty array marker
    if (value === '[]') {
      return [];
    }
    
    // Handle empty string (should also be empty array)
    if (value === '') {
      return [];
    }
    
    // Custom split that respects escaped separators
    const items = [];
    let current = '';
    let i = 0;
    const str = String(value);
    
    while (i < str.length) {
      if (str[i] === '\\' && i + 1 < str.length) {
        // Handle escaped characters
        if (str[i + 1] === separator) {
          current += separator; // Unescape separator
          i += 2;
        } else if (str[i + 1] === '\\') {
          current += '\\'; // Unescape backslash
          i += 2;
        } else {
          current += str[i]; // Keep backslash for other chars
          i++;
        }
      } else if (str[i] === separator) {
        // Found unescaped separator
        items.push(current);
        current = '';
        i++;
      } else {
        current += str[i];
        i++;
      }
    }
    
    // Add the last item
    items.push(current);
    
    return items;
  },

  toJSON: (value) => JSON.stringify(value),
  fromJSON: (value) => JSON.parse(value),

  toNumber: (value) => isString(value) ? value.includes('.') ? parseFloat(value) : parseInt(value) : value,

  toBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value),
  fromBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value) ? '1' : '0',
}

export class Schema {
  constructor(args) {
    const {
      map,
      name,
      attributes,
      passphrase,
      version = 1,
      options = {}
    } = args;

    this.name = name;
    this.version = version;
    this.attributes = attributes || {};
    this.passphrase = passphrase ?? "secret";
    this.options = merge({}, this.defaultOptions(), options);
    this.allNestedObjectsOptional = this.options.allNestedObjectsOptional ?? false;

    // Preprocess attributes to handle nested objects for validator compilation
    const processedAttributes = this.preprocessAttributesForValidation(this.attributes);

    this.validator = new ValidatorManager({ autoEncrypt: false }).compile(merge(
      { $$async: true },
      processedAttributes,
    ))

    if (this.options.generateAutoHooks) this.generateAutoHooks();

    if (!isEmpty(map)) {
      this.map = map;
      this.reversedMap = invert(map);
    }
    else {
      const flatAttrs = flatten(this.attributes, { safe: true });
      const leafKeys = Object.keys(flatAttrs).filter(k => !k.includes('$$'));
      
      // Also include parent object keys for objects that can be empty
      const objectKeys = this.extractObjectKeys(this.attributes);
      
      // Combine leaf keys and object keys, removing duplicates
      const allKeys = [...new Set([...leafKeys, ...objectKeys])];
      
      this.reversedMap = { ...allKeys }
      this.map = invert(this.reversedMap);
    }
  }

  defaultOptions() {
    return {
      autoEncrypt: true,
      autoDecrypt: true,
      arraySeparator: "|",
      generateAutoHooks: true,

      hooks: {
        beforeMap: {},
        afterMap: {},
        beforeUnmap: {},
        afterUnmap: {},
      }
    }
  }

  addHook(hook, attribute, action) {
    if (!this.options.hooks[hook][attribute]) this.options.hooks[hook][attribute] = [];
    this.options.hooks[hook][attribute] = uniq([...this.options.hooks[hook][attribute], action])
  }

  extractObjectKeys(obj, prefix = '') {
    const objectKeys = [];
    
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$$')) continue; // Skip schema metadata
      
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // This is an object, add its key
        objectKeys.push(fullKey);
        
        // Check if it has nested objects
        if (value.$$type === 'object') {
          // Recursively extract nested object keys
          objectKeys.push(...this.extractObjectKeys(value, fullKey));
        }
      }
    }
    
    return objectKeys;
  }

  generateAutoHooks() {
    const schema = flatten(cloneDeep(this.attributes), { safe: true });

    for (const [name, definition] of Object.entries(schema)) {
      if (definition.includes("array")) {
        this.addHook("beforeMap", name, "fromArray");
        this.addHook("afterUnmap", name, "toArray");
      } else {
        if (definition.includes("secret")) {
          if (this.options.autoEncrypt) {
            this.addHook("beforeMap", name, "encrypt");
          }

          if (this.options.autoDecrypt) {
            this.addHook("afterUnmap", name, "decrypt");
          }
        }

        if (definition.includes("number")) {
          this.addHook("beforeMap", name, "toString");
          this.addHook("afterUnmap", name, "toNumber");
        }

        if (definition.includes("boolean")) {
          this.addHook("beforeMap", name, "fromBool");
          this.addHook("afterUnmap", name, "toBool");
        }
      }
    }
  }

  static import(data) {
    let {
      map,
      name,
      options,
      version,
      attributes
    } = isString(data) ? JSON.parse(data) : data;

    // Corrige atributos aninhados que possam ter sido serializados como string JSON
    attributes = Schema._importAttributes(attributes);

    const schema = new Schema({
      map,
      name,
      options,
      version,
      attributes
    });
    return schema;
  }

  /**
   * Recursively import attributes, parsing only stringified objects (legacy)
   */
  static _importAttributes(attrs) {
    if (typeof attrs === 'string') {
      // Tenta detectar se é um objeto serializado como string JSON
      try {
        const parsed = JSON.parse(attrs);
        // Só retorna o parse se for objeto ou array
        if (typeof parsed === 'object' && parsed !== null) {
          return Schema._importAttributes(parsed);
        }
      } catch (e) {}
      return attrs;
    }
    if (Array.isArray(attrs)) {
      return attrs.map(a => Schema._importAttributes(a));
    }
    if (typeof attrs === 'object' && attrs !== null) {
      const out = {};
      for (const [k, v] of Object.entries(attrs)) {
        out[k] = Schema._importAttributes(v);
      }
      return out;
    }
    return attrs;
  }

  export() {
    const data = {
      version: this.version,
      name: this.name,
      options: this.options,
      attributes: this._exportAttributes(this.attributes),
      map: this.map,
    };
    return data;
  }

  /**
   * Recursively export attributes, keeping objects as objects and only serializing leaves as string
   */
  _exportAttributes(attrs) {
    if (typeof attrs === 'string') {
      return attrs;
    }
    if (Array.isArray(attrs)) {
      return attrs.map(a => this._exportAttributes(a));
    }
    if (typeof attrs === 'object' && attrs !== null) {
      const out = {};
      for (const [k, v] of Object.entries(attrs)) {
        out[k] = this._exportAttributes(v);
      }
      return out;
    }
    return attrs;
  }

  async applyHooksActions(resourceItem, hook) {
    for (const [attribute, actions] of Object.entries(this.options.hooks[hook])) {
      for (const action of actions) {
        const value = get(resourceItem, attribute)
        if (value !== undefined && typeof SchemaActions[action] === 'function') {
          set(resourceItem, attribute, await SchemaActions[action](value, {
            passphrase: this.passphrase,
            separator: this.options.arraySeparator,
          }))
        }
      }
    }
  }

  async validate(resourceItem, { mutateOriginal = false } = {}) {
    let data = mutateOriginal ? resourceItem : cloneDeep(resourceItem)
    const result = await this.validator(data);
    return result
  }

  async mapper(resourceItem) {
    const obj = flatten(cloneDeep(resourceItem), { safe: true });

    await this.applyHooksActions(obj, "beforeMap");

    const rest = { '_v': this.version + '' }
    for (const [key, value] of Object.entries(obj)) {
      rest[this.map[key]] = value;
    }
    
    await this.applyHooksActions(rest, "afterMap");
    return rest;
  }

  async unmapper(mappedResourceItem) {
    const obj = cloneDeep(mappedResourceItem);
    delete obj._v;

    await this.applyHooksActions(obj, "beforeUnmap");

    const rest = {}
    for (const [key, value] of Object.entries(obj)) {
      rest[this.reversedMap[key]] = value;
    }
    
    await this.applyHooksActions(rest, "afterUnmap");
    return unflatten(rest);
  }

  /**
   * Preprocess attributes to convert nested objects into validator-compatible format
   * @param {Object} attributes - Original attributes
   * @returns {Object} Processed attributes for validator
   */
  preprocessAttributesForValidation(attributes) {
    const processed = {};
    
    for (const [key, value] of Object.entries(attributes)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const isExplicitRequired = value.$$type && value.$$type.includes('required');
        const isExplicitOptional = value.$$type && value.$$type.includes('optional');
        const objectConfig = {
          type: 'object',
          properties: this.preprocessAttributesForValidation(value),
          strict: false
        };
        // Se for explicitamente required, não marca como opcional
        if (isExplicitRequired) {
          // nada
        } else if (isExplicitOptional || this.allNestedObjectsOptional) {
          objectConfig.optional = true;
        }
        processed[key] = objectConfig;
      } else {
        processed[key] = value;
      }
    }
    
    return processed;
  }
}

export default Schema
