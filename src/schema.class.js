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

import { encrypt, decrypt } from "./concerns/crypto.js";
import { ValidatorManager } from "./validator.class.js";
import { tryFn, tryFnSync } from "./concerns/try-fn.js";
import { SchemaError } from "./errors.js";
import { encode as toBase62, decode as fromBase62, encodeDecimal, decodeDecimal } from "./concerns/base62.js";

/**
 * Generate base62 mapping for attributes
 * @param {string[]} keys - Array of attribute keys
 * @returns {Object} Mapping object with base62 keys
 */
function generateBase62Mapping(keys) {
  const mapping = {};
  const reversedMapping = {};
  keys.forEach((key, index) => {
    const base62Key = toBase62(index);
    mapping[key] = base62Key;
    reversedMapping[base62Key] = key;
  });
  return { mapping, reversedMapping };
}

export const SchemaActions = {
  trim: (value) => value == null ? value : value.trim(),

  encrypt: async (value, { passphrase }) => {
    if (value === null || value === undefined) return value;
    const [ok, err, res] = await tryFn(() => encrypt(value, passphrase));
    return ok ? res : value;
  },
  decrypt: async (value, { passphrase }) => {
    if (value === null || value === undefined) return value;
    const [ok, err, raw] = await tryFn(() => decrypt(value, passphrase));
    if (!ok) return value;
    if (raw === 'null') return null;
    if (raw === 'undefined') return undefined;
    return raw;
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
      const [ok, err, parsed] = tryFnSync(() => JSON.parse(value));
      if (ok && typeof parsed === 'object') return value;
      return value;
    }
    const [ok, err, json] = tryFnSync(() => JSON.stringify(value));
    return ok ? json : value;
  },
  fromJSON: (value) => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    if (value === '') return '';
    const [ok, err, parsed] = tryFnSync(() => JSON.parse(value));
    return ok ? parsed : value;
  },

  toNumber: (value) => isString(value) ? value.includes('.') ? parseFloat(value) : parseInt(value) : value,

  toBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value),
  fromBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value) ? '1' : '0',
  fromBase62: (value) => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = fromBase62(value);
      return isNaN(n) ? undefined : n;
    }
    return undefined;
  },
  toBase62: (value) => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') {
      return toBase62(value);
    }
    if (typeof value === 'string') {
      const n = Number(value);
      return isNaN(n) ? value : toBase62(n);
    }
    return value;
  },
  fromBase62Decimal: (value) => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = decodeDecimal(value);
      return isNaN(n) ? undefined : n;
    }
    return undefined;
  },
  toBase62Decimal: (value) => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') {
      return encodeDecimal(value);
    }
    if (typeof value === 'string') {
      const n = Number(value);
      return isNaN(n) ? value : encodeDecimal(n);
    }
    return value;
  },
  fromArrayOfNumbers: (value, { separator }) => {
    if (value === null || value === undefined || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return '';
    }
    const base62Items = value.map(item => {
      if (typeof item === 'number' && !isNaN(item)) {
        return toBase62(item);
      }
      // fallback: try to parse as number, else keep as is
      const n = Number(item);
      return isNaN(n) ? '' : toBase62(n);
    });
    return base62Items.join(separator);
  },
  toArrayOfNumbers: (value, { separator }) => {
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'number' ? v : fromBase62(v)));
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value === '') {
      return [];
    }
    const str = String(value);
    const items = [];
    let current = '';
    let i = 0;
    while (i < str.length) {
      if (str[i] === '\\' && i + 1 < str.length) {
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
    return items.map(v => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v !== '') {
        const n = fromBase62(v);
        return isNaN(n) ? NaN : n;
      }
      return NaN;
    });
  },
  fromArrayOfDecimals: (value, { separator }) => {
    if (value === null || value === undefined || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return '';
    }
    const base62Items = value.map(item => {
      if (typeof item === 'number' && !isNaN(item)) {
        return encodeDecimal(item);
      }
      // fallback: try to parse as number, else keep as is
      const n = Number(item);
      return isNaN(n) ? '' : encodeDecimal(n);
    });
    return base62Items.join(separator);
  },
  toArrayOfDecimals: (value, { separator }) => {
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'number' ? v : decodeDecimal(v)));
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value === '') {
      return [];
    }
    const str = String(value);
    const items = [];
    let current = '';
    let i = 0;
    while (i < str.length) {
      if (str[i] === '\\' && i + 1 < str.length) {
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
    return items.map(v => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v !== '') {
        const n = decodeDecimal(v);
        return isNaN(n) ? NaN : n;
      }
      return NaN;
    });
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
      
      // Generate base62 mapping instead of sequential numbers
      const { mapping, reversedMapping } = generateBase62Mapping(allKeys);
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
      // Handle arrays first to avoid conflicts
      if (definition.includes("array")) {
        if (definition.includes('items:string')) {
          this.addHook("beforeMap", name, "fromArray");
          this.addHook("afterUnmap", name, "toArray");
        } else if (definition.includes('items:number')) {
          // Check if the array items should be treated as integers
          const isIntegerArray = definition.includes("integer:true") || 
                                definition.includes("|integer:") ||
                                definition.includes("|integer");
          
          if (isIntegerArray) {
            // Use standard base62 for arrays of integers
            this.addHook("beforeMap", name, "fromArrayOfNumbers");
            this.addHook("afterUnmap", name, "toArrayOfNumbers");
          } else {
            // Use decimal-aware base62 for arrays of decimals
            this.addHook("beforeMap", name, "fromArrayOfDecimals");
            this.addHook("afterUnmap", name, "toArrayOfDecimals");
          }
        }
        // Skip other processing for arrays to avoid conflicts
        continue;
      }

      // Handle secrets
      if (definition.includes("secret")) {
        if (this.options.autoEncrypt) {
          this.addHook("beforeMap", name, "encrypt");
        }
        if (this.options.autoDecrypt) {
          this.addHook("afterUnmap", name, "decrypt");
        }
        // Skip other processing for secrets
        continue;
      }

      // Handle numbers (only for non-array fields)
      if (definition.includes("number")) {
        // Check if it's specifically an integer field
        const isInteger = definition.includes("integer:true") || 
                         definition.includes("|integer:") ||
                         definition.includes("|integer");
        
        if (isInteger) {
          // Use standard base62 for integers
          this.addHook("beforeMap", name, "toBase62");
          this.addHook("afterUnmap", name, "fromBase62");
        } else {
          // Use decimal-aware base62 for decimal numbers
          this.addHook("beforeMap", name, "toBase62Decimal");
          this.addHook("afterUnmap", name, "fromBase62Decimal");
        }
        continue;
      }

      // Handle booleans
      if (definition.includes("boolean")) {
        this.addHook("beforeMap", name, "fromBool");
        this.addHook("afterUnmap", name, "toBool");
        continue;
      }

      // Handle JSON fields
      if (definition.includes("json")) {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
        continue;
      }

      // Handle object fields - add JSON serialization hooks
      if (definition === "object" || definition.includes("object")) {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
        continue;
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
    const [ok, err, attrs] = tryFnSync(() => Schema._importAttributes(attributes));
    if (!ok) throw new SchemaError('Failed to import schema attributes', { original: err, input: attributes });
    attributes = attrs;

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
      const [ok, err, parsed] = tryFnSync(() => JSON.parse(attrs));
      if (ok && typeof parsed === 'object' && parsed !== null) {
        const [okNested, errNested, nested] = tryFnSync(() => Schema._importAttributes(parsed));
        if (!okNested) throw new SchemaError('Failed to parse nested schema attribute', { original: errNested, input: attrs });
        return nested;
      }
      return attrs;
    }
    if (Array.isArray(attrs)) {
      const [okArr, errArr, arr] = tryFnSync(() => attrs.map(a => Schema._importAttributes(a)));
      if (!okArr) throw new SchemaError('Failed to import array schema attributes', { original: errArr, input: attrs });
      return arr;
    }
    if (typeof attrs === 'object' && attrs !== null) {
      const out = {};
      for (const [k, v] of Object.entries(attrs)) {
        const [okObj, errObj, val] = tryFnSync(() => Schema._importAttributes(v));
        if (!okObj) throw new SchemaError('Failed to import object schema attribute', { original: errObj, key: k, input: v });
        out[k] = val;
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
        rest[mappedKey] = toBase62(value);
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
      // Always unmap base62 strings to numbers for number fields (but not array fields or decimal fields)
      if (typeof attrDef === 'string' && attrDef.includes('number') && !attrDef.includes('array') && !attrDef.includes('decimal')) {
        if (typeof parsedValue === 'string' && parsedValue !== '') {
          parsedValue = fromBase62(parsedValue);
        } else if (typeof parsedValue === 'number') {
          // Already a number, do nothing
        } else {
          parsedValue = undefined;
        }
      } else if (typeof value === 'string') {
        if (value === '[object Object]') {
          parsedValue = {};
        } else if (value.startsWith('{') || value.startsWith('[')) {
          const [ok, err, parsed] = tryFnSync(() => JSON.parse(value));
          if (ok) parsedValue = parsed;
        }
      }
      // PATCH: ensure arrays are always arrays
      if (this.attributes) {
        if (typeof attrDef === 'string' && attrDef.includes('array')) {
          if (Array.isArray(parsedValue)) {
            // Already an array
          } else if (typeof parsedValue === 'string' && parsedValue.trim().startsWith('[')) {
            const [okArr, errArr, arr] = tryFnSync(() => JSON.parse(parsedValue));
            if (okArr && Array.isArray(arr)) {
              parsedValue = arr;
            }
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
