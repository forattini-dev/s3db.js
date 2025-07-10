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

/**
 * Convert a number to base36 string
 * @param {number} num - Number to convert
 * @returns {string} Base36 representation
 */
function toBase36(num) {
  return num.toString(36);
}

/**
 * Convert a base36 string back to number
 * @param {string} str - Base36 string to convert
 * @returns {number} Number representation
 */
function fromBase36(str) {
  return parseInt(str, 36);
}

/**
 * Generate base36 mapping for attributes
 * @param {string[]} keys - Array of attribute keys
 * @returns {Object} Mapping object with base36 keys
 */
function generateBase36Mapping(keys) {
  const mapping = {};
  const reversedMapping = {};
  
  keys.forEach((key, index) => {
    const base36Key = toBase36(index);
    mapping[key] = base36Key;
    reversedMapping[base36Key] = key;
  });
  
  return { mapping, reversedMapping };
}

export const SchemaActions = {
  trim: (value) => value == null ? value : value.trim(),

  encrypt: (value, { passphrase }) => {
    if (value === null || value === undefined) return value;
    return encrypt(value, passphrase);
  },
  decrypt: async (value, { passphrase }) => {
    if (value === null || value === undefined) return value;
    try {
      const raw = await decrypt(value, passphrase)
      // Se o valor original era um tipo primitivo, tente restaurar
      if (raw === 'null') return null;
      if (raw === 'undefined') return undefined;
      return raw;
    } catch (error) {
      return value;
    }
  },

  toString: (value) => value == null ? value : String(value),

  fromArray: (value, { separator }) => {
    if (value === null || value === undefined || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return '';
    }
    const escapedItems = value.map(item => {
      if (typeof item === 'string') {
        return item
          .replace(/\\/g, '\\\\')
          .replace(new RegExp(`\\${separator}`, 'g'), `\\${separator}`);
      }
      return String(item);
    });
    return escapedItems.join(separator);
  },

  toArray: (value, { separator }) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value === '') {
      return [];
    }
    const items = [];
    let current = '';
    let i = 0;
    const str = String(value);
    while (i < str.length) {
      if (str[i] === '\\' && i + 1 < str.length) {
        // If next char is separator or backslash, add it literally
        current += str[i + 1];
          i += 2;
      } else if (str[i] === separator) {
        items.push(current);
        current = '';
        i++;
      } else {
        current += str[i];
        i++;
      }
    }
    items.push(current);
    return items;
  },

  toJSON: (value) => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
      // Se já é um JSON válido, não serializa de novo
      try {
        const parsed = JSON.parse(value);
        // Se for objeto/array, retorna string original
        if (typeof parsed === 'object') return value;
      } catch {}
      // Se não for JSON válido, retorna string original
      return value;
    }
    return JSON.stringify(value);
  },
  fromJSON: (value) => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    if (value === '') return '';
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },

  toNumber: (value) => isString(value) ? value.includes('.') ? parseFloat(value) : parseInt(value) : value,

  toBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value),
  fromBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value) ? '1' : '0',
  fromBase36: (value) => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = parseInt(value, 36);
      return isNaN(n) ? undefined : n;
    }
    return undefined;
  },
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
      
      // Generate base36 mapping instead of sequential numbers
      const { mapping, reversedMapping } = generateBase36Mapping(allKeys);
      this.map = mapping;
      this.reversedMap = reversedMapping;
      

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
        if (definition.includes('items:string')) {
        this.addHook("beforeMap", name, "fromArray");
        this.addHook("afterUnmap", name, "toArray");
        }
      } 

      if (definition.includes("secret")) {
        if (this.options.autoEncrypt) {
          this.addHook("beforeMap", name, "encrypt");
        }

        if (this.options.autoDecrypt) {
          this.addHook("afterUnmap", name, "decrypt");
        }
      }

      if (definition.includes("number")) {
        this.addHook("beforeMap", name, "toBase36");
        this.addHook("afterUnmap", name, "fromBase36");
      }

      if (definition.includes("boolean")) {
        this.addHook("beforeMap", name, "fromBool");
        this.addHook("afterUnmap", name, "toBool");
      }

      if (definition.includes("json")) {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
      }

      // Handle object fields - add JSON serialization hooks
      if (definition === "object" || definition.includes("object")) {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
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
    const cloned = cloneDeep(resourceItem);
    for (const [attribute, actions] of Object.entries(this.options.hooks[hook])) {
      for (const action of actions) {
        const value = get(cloned, attribute)
        if (value !== undefined && typeof SchemaActions[action] === 'function') {
          set(cloned, attribute, await SchemaActions[action](value, {
            passphrase: this.passphrase,
            separator: this.options.arraySeparator,
          }))
        }
      }
    }
    return cloned;
  }

  async validate(resourceItem, { mutateOriginal = false } = {}) {
    let data = mutateOriginal ? resourceItem : cloneDeep(resourceItem)
    const result = await this.validator(data);
    return result
  }

  async mapper(resourceItem) {
    let obj = cloneDeep(resourceItem);
    // Always apply beforeMap hooks for all fields
    obj = await this.applyHooksActions(obj, "beforeMap");
    // Then flatten the object
    const flattenedObj = flatten(obj, { safe: true });
    const rest = { '_v': this.version + '' };
    for (const [key, value] of Object.entries(flattenedObj)) {
      const mappedKey = this.map[key] || key;
      // Always map numbers to base36
      const attrDef = this.getAttributeDefinition(key);
      if (typeof value === 'number' && typeof attrDef === 'string' && attrDef.includes('number')) {
        rest[mappedKey] = value.toString(36);
      } else if (typeof value === 'string') {
        if (value === '[object Object]') {
          rest[mappedKey] = '{}';
        } else if (value.startsWith('{') || value.startsWith('[')) {
          rest[mappedKey] = value;
        } else {
          rest[mappedKey] = value;
        }
      } else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        rest[mappedKey] = JSON.stringify(value);
      } else {
        rest[mappedKey] = value;
      }
    }
    await this.applyHooksActions(rest, "afterMap");
    return rest;
  }

  async unmapper(mappedResourceItem, mapOverride) {
    let obj = cloneDeep(mappedResourceItem);
    delete obj._v;
    obj = await this.applyHooksActions(obj, "beforeUnmap");
    const reversedMap = mapOverride ? invert(mapOverride) : this.reversedMap;
    const rest = {};
    for (const [key, value] of Object.entries(obj)) {
      const originalKey = reversedMap && reversedMap[key] ? reversedMap[key] : key;
      let parsedValue = value;
      const attrDef = this.getAttributeDefinition(originalKey);
      // Always unmap base36 strings to numbers for number fields
      if (typeof attrDef === 'string' && attrDef.includes('number')) {
        if (typeof parsedValue === 'string' && parsedValue !== '') {
          parsedValue = parseInt(parsedValue, 36);
        } else if (typeof parsedValue === 'number') {
          // Already a number, do nothing
        } else {
          parsedValue = undefined;
        }
      } else if (typeof value === 'string') {
        if (value === '[object Object]') {
          parsedValue = {};
        } else if (value.startsWith('{') || value.startsWith('[')) {
          try {
            parsedValue = JSON.parse(value);
          } catch {}
        }
      }
      // PATCH: ensure arrays are always arrays
      if (this.attributes) {
        if (typeof attrDef === 'string' && attrDef.includes('array')) {
          if (Array.isArray(parsedValue)) {
            // Already an array
          } else if (typeof parsedValue === 'string' && parsedValue.trim().startsWith('[')) {
            try {
              const arr = JSON.parse(parsedValue);
              if (Array.isArray(arr)) {
                parsedValue = arr;
              }
            } catch {}
          } else {
            parsedValue = SchemaActions.toArray(parsedValue, { separator: this.options.arraySeparator });
          }
        }
      }
      // PATCH: apply afterUnmap hooks for type restoration
      if (this.options.hooks && this.options.hooks.afterUnmap && this.options.hooks.afterUnmap[originalKey]) {
        for (const action of this.options.hooks.afterUnmap[originalKey]) {
          if (typeof SchemaActions[action] === 'function') {
            parsedValue = await SchemaActions[action](parsedValue, {
              passphrase: this.passphrase,
              separator: this.options.arraySeparator,
            });
    }
        }
      }
      rest[originalKey] = parsedValue;
    }
    await this.applyHooksActions(rest, "afterUnmap");
    const result = unflatten(rest);
    for (const [key, value] of Object.entries(mappedResourceItem)) {
      if (key.startsWith('$')) {
        result[key] = value;
      }
    }
    return result;
  }

  // Helper to get attribute definition by dot notation key
  getAttributeDefinition(key) {
    const parts = key.split('.');
    let def = this.attributes;
    for (const part of parts) {
      if (!def) return undefined;
      def = def[part];
    }
    return def;
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
