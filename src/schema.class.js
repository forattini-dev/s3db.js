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
import { encode as toBase62, decode as fromBase62, encodeDecimal, decodeDecimal, encodeFixedPoint, decodeFixedPoint, encodeFixedPointBatch, decodeFixedPointBatch } from "./concerns/base62.js";
import { encodeIPv4, decodeIPv4, encodeIPv6, decodeIPv6, isValidIPv4, isValidIPv6 } from "./concerns/ip.js";
import { encodeMoney, decodeMoney, getCurrencyDecimals } from "./concerns/money.js";
import { encodeGeoLat, decodeGeoLat, encodeGeoLon, decodeGeoLon, encodeGeoPoint, decodeGeoPoint } from "./concerns/geo-encoding.js";

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
  fromArrayOfEmbeddings: (value, { separator, precision = 6 }) => {
    if (value === null || value === undefined || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return '^[]';
    }
    // Use batch encoding for massive compression (17% additional savings)
    // Format: ^[val1,val2,val3,...] instead of ^val1,^val2,^val3,...
    return encodeFixedPointBatch(value, precision);
  },
  toArrayOfEmbeddings: (value, { separator, precision = 6 }) => {
    if (Array.isArray(value)) {
      // Already an array, return as-is
      return value;
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value === '' || value === '^[]') {
      return [];
    }

    const str = String(value);

    // Check if this is batch-encoded (^[...])
    if (str.startsWith('^[')) {
      return decodeFixedPointBatch(str, precision);
    }

    // Fallback: Legacy format with individual prefixes (^val,^val,^val)
    // This maintains backwards compatibility with data encoded before batch optimization
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
        const n = decodeFixedPoint(v, precision);
        return isNaN(n) ? NaN : n;
      }
      return NaN;
    });
  },

  encodeIPv4: (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    if (!isValidIPv4(value)) return value;
    const [ok, err, encoded] = tryFnSync(() => encodeIPv4(value));
    return ok ? encoded : value;
  },
  decodeIPv4: (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, err, decoded] = tryFnSync(() => decodeIPv4(value));
    return ok ? decoded : value;
  },

  encodeIPv6: (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    if (!isValidIPv6(value)) return value;
    const [ok, err, encoded] = tryFnSync(() => encodeIPv6(value));
    return ok ? encoded : value;
  },
  decodeIPv6: (value) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, err, decoded] = tryFnSync(() => decodeIPv6(value));
    return ok ? decoded : value;
  },

  // Money type - Integer-based (banking standard)
  encodeMoney: (value, { currency = 'USD' } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;
    const [ok, err, encoded] = tryFnSync(() => encodeMoney(value, currency));
    return ok ? encoded : value;
  },
  decodeMoney: (value, { currency = 'USD' } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, err, decoded] = tryFnSync(() => decodeMoney(value, currency));
    return ok ? decoded : value;
  },

  // Decimal type - Fixed-point for non-monetary decimals
  encodeDecimalFixed: (value, { precision = 2 } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;
    const [ok, err, encoded] = tryFnSync(() => encodeFixedPoint(value, precision));
    return ok ? encoded : value;
  },
  decodeDecimalFixed: (value, { precision = 2 } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, err, decoded] = tryFnSync(() => decodeFixedPoint(value, precision));
    return ok ? decoded : value;
  },

  // Geo types - Latitude
  encodeGeoLatitude: (value, { precision = 6 } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;
    const [ok, err, encoded] = tryFnSync(() => encodeGeoLat(value, precision));
    return ok ? encoded : value;
  },
  decodeGeoLatitude: (value, { precision = 6 } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, err, decoded] = tryFnSync(() => decodeGeoLat(value, precision));
    return ok ? decoded : value;
  },

  // Geo types - Longitude
  encodeGeoLongitude: (value, { precision = 6 } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;
    const [ok, err, encoded] = tryFnSync(() => encodeGeoLon(value, precision));
    return ok ? encoded : value;
  },
  decodeGeoLongitude: (value, { precision = 6 } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, err, decoded] = tryFnSync(() => decodeGeoLon(value, precision));
    return ok ? decoded : value;
  },

  // Geo types - Point (lat+lon pair)
  encodeGeoPointPair: (value, { precision = 6 } = {}) => {
    if (value === null || value === undefined) return value;
    // Accept object with lat/lon or array [lat, lon]
    if (Array.isArray(value) && value.length === 2) {
      const [ok, err, encoded] = tryFnSync(() => encodeGeoPoint(value[0], value[1], precision));
      return ok ? encoded : value;
    }
    if (typeof value === 'object' && value.lat !== undefined && value.lon !== undefined) {
      const [ok, err, encoded] = tryFnSync(() => encodeGeoPoint(value.lat, value.lon, precision));
      return ok ? encoded : value;
    }
    if (typeof value === 'object' && value.latitude !== undefined && value.longitude !== undefined) {
      const [ok, err, encoded] = tryFnSync(() => encodeGeoPoint(value.latitude, value.longitude, precision));
      return ok ? encoded : value;
    }
    return value;
  },
  decodeGeoPointPair: (value, { precision = 6 } = {}) => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, err, decoded] = tryFnSync(() => decodeGeoPoint(value, precision));
    // Return as object { latitude, longitude }
    return ok ? decoded : value;
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
      { $$async: true, $$strict: false },
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

  _generateHooksFromOriginalAttributes(attributes, prefix = '') {
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('$$')) continue;

      const fullKey = prefix ? `${prefix}.${key}` : key;

      // Check if this is an object notation type definition (has 'type' property)
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && value.type) {
        if (value.type === 'array' && value.items) {
          // Handle array with object notation
          const itemsType = value.items;
          const arrayLength = typeof value.length === 'number' ? value.length : null;

          if (itemsType === 'string' || (typeof itemsType === 'string' && itemsType.includes('string'))) {
            this.addHook("beforeMap", fullKey, "fromArray");
            this.addHook("afterUnmap", fullKey, "toArray");
          } else if (itemsType === 'number' || (typeof itemsType === 'string' && itemsType.includes('number'))) {
            const isIntegerArray = typeof itemsType === 'string' && itemsType.includes('integer');
            const isEmbedding = !isIntegerArray && arrayLength !== null && arrayLength >= 256;

            if (isIntegerArray) {
              this.addHook("beforeMap", fullKey, "fromArrayOfNumbers");
              this.addHook("afterUnmap", fullKey, "toArrayOfNumbers");
            } else if (isEmbedding) {
              this.addHook("beforeMap", fullKey, "fromArrayOfEmbeddings");
              this.addHook("afterUnmap", fullKey, "toArrayOfEmbeddings");
            } else {
              this.addHook("beforeMap", fullKey, "fromArrayOfDecimals");
              this.addHook("afterUnmap", fullKey, "toArrayOfDecimals");
            }
          }
        }
        // For other types with object notation, they'll be handled by the flattened processing
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !value.type) {
        // This is a nested object, recurse
        this._generateHooksFromOriginalAttributes(value, fullKey);
      }
    }
  }

  generateAutoHooks() {
    // First, process the original attributes to find arrays with object notation
    // This handles cases like: { type: 'array', items: 'number', length: 768 }
    this._generateHooksFromOriginalAttributes(this.attributes);

    // Then process the flattened schema for other types
    const schema = flatten(cloneDeep(this.attributes), { safe: true });

    for (const [name, definition] of Object.entries(schema)) {
      // Skip metadata fields
      if (name.includes('$$')) continue;

      // Skip if hooks already exist (from object notation processing)
      if (this.options.hooks.beforeMap[name] || this.options.hooks.afterUnmap[name]) {
        continue;
      }

      // Normalize definition - can be a string or value from flattened object
      const defStr = typeof definition === 'string' ? definition : '';
      const defType = typeof definition === 'object' && definition !== null ? definition.type : null;

      // Check if this is an embedding type (custom shorthand)
      const isEmbeddingType = defStr.includes("embedding") || defType === 'embedding';

      if (isEmbeddingType) {
        // Extract length from embedding:1536 or embedding|length:1536
        let embeddingLength = null;
        const lengthMatch = defStr.match(/embedding:(\d+)/);
        if (lengthMatch) {
          embeddingLength = parseInt(lengthMatch[1], 10);
        } else if (defStr.includes('length:')) {
          const match = defStr.match(/length:(\d+)/);
          if (match) embeddingLength = parseInt(match[1], 10);
        }

        // Embeddings always use fixed-point encoding
        this.addHook("beforeMap", name, "fromArrayOfEmbeddings");
        this.addHook("afterUnmap", name, "toArrayOfEmbeddings");
        continue;
      }

      // Check if this is an array type
      const isArray = defStr.includes("array") || defType === 'array';

      if (isArray) {
        // Determine item type for arrays
        let itemsType = null;
        if (typeof definition === 'object' && definition !== null && definition.items) {
          itemsType = definition.items;
        } else if (defStr.includes('items:string')) {
          itemsType = 'string';
        } else if (defStr.includes('items:number')) {
          itemsType = 'number';
        }

        if (itemsType === 'string' || (typeof itemsType === 'string' && itemsType.includes('string'))) {
          this.addHook("beforeMap", name, "fromArray");
          this.addHook("afterUnmap", name, "toArray");
        } else if (itemsType === 'number' || (typeof itemsType === 'string' && itemsType.includes('number'))) {
          // Check if the array items should be treated as integers
          const isIntegerArray = defStr.includes("integer:true") ||
                                defStr.includes("|integer:") ||
                                defStr.includes("|integer") ||
                                (typeof itemsType === 'string' && itemsType.includes('integer'));

          // Check if this is an embedding array (large arrays of decimals)
          // Common embedding dimensions: 256, 384, 512, 768, 1024, 1536, 2048, 3072
          let arrayLength = null;
          if (typeof definition === 'object' && definition !== null && typeof definition.length === 'number') {
            arrayLength = definition.length;
          } else if (defStr.includes('length:')) {
            const match = defStr.match(/length:(\d+)/);
            if (match) arrayLength = parseInt(match[1], 10);
          }

          const isEmbedding = !isIntegerArray && arrayLength !== null && arrayLength >= 256;

          if (isIntegerArray) {
            // Use standard base62 for arrays of integers
            this.addHook("beforeMap", name, "fromArrayOfNumbers");
            this.addHook("afterUnmap", name, "toArrayOfNumbers");
          } else if (isEmbedding) {
            // Use fixed-point encoding for embedding vectors (77% compression)
            this.addHook("beforeMap", name, "fromArrayOfEmbeddings");
            this.addHook("afterUnmap", name, "toArrayOfEmbeddings");
          } else {
            // Use decimal-aware base62 for regular arrays of decimals
            this.addHook("beforeMap", name, "fromArrayOfDecimals");
            this.addHook("afterUnmap", name, "toArrayOfDecimals");
          }
        }
        // Skip other processing for arrays to avoid conflicts
        continue;
      }

      // Handle secrets
      if (defStr.includes("secret") || defType === 'secret') {
        if (this.options.autoEncrypt) {
          this.addHook("beforeMap", name, "encrypt");
        }
        if (this.options.autoDecrypt) {
          this.addHook("afterUnmap", name, "decrypt");
        }
        // Skip other processing for secrets
        continue;
      }

      // Handle ip4 type
      if (defStr.includes("ip4") || defType === 'ip4') {
        this.addHook("beforeMap", name, "encodeIPv4");
        this.addHook("afterUnmap", name, "decodeIPv4");
        continue;
      }

      // Handle ip6 type
      if (defStr.includes("ip6") || defType === 'ip6') {
        this.addHook("beforeMap", name, "encodeIPv6");
        this.addHook("afterUnmap", name, "decodeIPv6");
        continue;
      }

      // Handle money type (integer-based, currency-aware)
      if (defStr.includes("money") || defType === 'money') {
        // Extract currency from money:BRL or money|currency:BRL notation
        let currency = 'USD';
        const currencyMatch = defStr.match(/money:([A-Z]{3,4})/i);
        if (currencyMatch) {
          currency = currencyMatch[1].toUpperCase();
        }

        this.addHook("beforeMap", name, "encodeMoney", { currency });
        this.addHook("afterUnmap", name, "decodeMoney", { currency });
        continue;
      }

      // Handle decimal type (fixed-point for non-monetary decimals)
      if (defStr.includes("decimal") || defType === 'decimal') {
        // Extract precision from decimal:4 notation
        let precision = 2; // Default precision
        const precisionMatch = defStr.match(/decimal:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1], 10);
        }

        this.addHook("beforeMap", name, "encodeDecimalFixed", { precision });
        this.addHook("afterUnmap", name, "decodeDecimalFixed", { precision });
        continue;
      }

      // Handle geo:lat type (latitude)
      if (defStr.includes("geo:lat") || (defType === 'geo' && defStr.includes('lat'))) {
        // Extract precision from geo:lat:6 notation
        let precision = 6; // Default precision (GPS standard)
        const precisionMatch = defStr.match(/geo:lat:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1], 10);
        }

        this.addHook("beforeMap", name, "encodeGeoLatitude", { precision });
        this.addHook("afterUnmap", name, "decodeGeoLatitude", { precision });
        continue;
      }

      // Handle geo:lon type (longitude)
      if (defStr.includes("geo:lon") || (defType === 'geo' && defStr.includes('lon'))) {
        // Extract precision from geo:lon:6 notation
        let precision = 6; // Default precision
        const precisionMatch = defStr.match(/geo:lon:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1], 10);
        }

        this.addHook("beforeMap", name, "encodeGeoLongitude", { precision });
        this.addHook("afterUnmap", name, "decodeGeoLongitude", { precision });
        continue;
      }

      // Handle geo:point type (lat+lon pair)
      if (defStr.includes("geo:point") || defType === 'geo:point') {
        // Extract precision from geo:point:6 notation
        let precision = 6; // Default precision
        const precisionMatch = defStr.match(/geo:point:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1], 10);
        }

        this.addHook("beforeMap", name, "encodeGeoPointPair", { precision });
        this.addHook("afterUnmap", name, "decodeGeoPointPair", { precision });
        continue;
      }

      // Handle numbers (only for non-array fields)
      if (defStr.includes("number") || defType === 'number') {
        // Check if it's specifically an integer field
        const isInteger = defStr.includes("integer:true") ||
                         defStr.includes("|integer:") ||
                         defStr.includes("|integer");

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
      if (defStr.includes("boolean") || defType === 'boolean') {
        this.addHook("beforeMap", name, "fromBool");
        this.addHook("afterUnmap", name, "toBool");
        continue;
      }

      // Handle JSON fields
      if (defStr.includes("json") || defType === 'json') {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
        continue;
      }

      // Handle object fields - add JSON serialization hooks
      if (definition === "object" || defStr.includes("object") || defType === 'object') {
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
      // Try to detect if it's an object serialized as JSON string
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
      const hasAfterUnmapHook = this.options.hooks?.afterUnmap?.[originalKey];

      // Always unmap base62 strings to numbers for number fields (but not array fields or decimal fields)
      // Skip if there are afterUnmap hooks that will handle the conversion
      if (!hasAfterUnmapHook && typeof attrDef === 'string' && attrDef.includes('number') && !attrDef.includes('array') && !attrDef.includes('decimal')) {
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
      // Skip automatic array conversion if there's an afterUnmap hook that will handle it
      if (this.attributes) {
        if (typeof attrDef === 'string' && attrDef.includes('array')) {
          if (!hasAfterUnmapHook) {
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
      if (typeof value === 'string') {
        // Expand ip4 shorthand to string type with custom validation
        if (value === 'ip4' || value.startsWith('ip4|')) {
          processed[key] = value.replace(/^ip4/, 'string');
          continue;
        }
        // Expand ip6 shorthand to string type with custom validation
        if (value === 'ip6' || value.startsWith('ip6|')) {
          processed[key] = value.replace(/^ip6/, 'string');
          continue;
        }
        // Expand money shorthand to number type with min validation
        if (value === 'money' || value.startsWith('money:') || value.startsWith('money|')) {
          // Extract any modifiers after money:CURRENCY
          const rest = value.replace(/^money(:[A-Z]{3,4})?/, '');
          // Money must be non-negative
          const hasMin = rest.includes('min:');
          processed[key] = hasMin ? `number${rest}` : `number|min:0${rest}`;
          continue;
        }
        // Expand decimal shorthand to number type
        if (value === 'decimal' || value.startsWith('decimal:') || value.startsWith('decimal|')) {
          // Extract any modifiers after decimal:PRECISION
          const rest = value.replace(/^decimal(:\d+)?/, '');
          processed[key] = `number${rest}`;
          continue;
        }
        // Expand geo:lat shorthand to number type with range validation
        if (value.startsWith('geo:lat')) {
          // Extract any modifiers after geo:lat:PRECISION
          const rest = value.replace(/^geo:lat(:\d+)?/, '');
          // Latitude range: -90 to 90
          const hasMin = rest.includes('min:');
          const hasMax = rest.includes('max:');
          let validation = 'number';
          if (!hasMin) validation += '|min:-90';
          if (!hasMax) validation += '|max:90';
          processed[key] = validation + rest;
          continue;
        }
        // Expand geo:lon shorthand to number type with range validation
        if (value.startsWith('geo:lon')) {
          // Extract any modifiers after geo:lon:PRECISION
          const rest = value.replace(/^geo:lon(:\d+)?/, '');
          // Longitude range: -180 to 180
          const hasMin = rest.includes('min:');
          const hasMax = rest.includes('max:');
          let validation = 'number';
          if (!hasMin) validation += '|min:-180';
          if (!hasMax) validation += '|max:180';
          processed[key] = validation + rest;
          continue;
        }
        // Expand geo:point shorthand to object with lat/lon
        if (value.startsWith('geo:point')) {
          // geo:point is an object or array with lat/lon
          // For simplicity, allow it as any type (will be validated in hooks)
          processed[key] = 'any';
          continue;
        }
        // Expand embedding:XXX shorthand to array|items:number|length:XXX
        if (value.startsWith('embedding:')) {
          const lengthMatch = value.match(/embedding:(\d+)/);
          if (lengthMatch) {
            const length = lengthMatch[1];
            // Extract any additional modifiers after the length
            const rest = value.substring(`embedding:${length}`.length);
            processed[key] = `array|items:number|length:${length}|empty:false${rest}`;
            continue;
          }
        }
        // Expand embedding|... to array|items:number|...
        if (value.startsWith('embedding|') || value === 'embedding') {
          processed[key] = value.replace(/^embedding/, 'array|items:number|empty:false');
          continue;
        }
        processed[key] = value;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Check if this is a validator type definition (has 'type' property that is NOT '$$type')
        // vs a nested object structure
        const hasValidatorType = value.type !== undefined && key !== '$$type';

        if (hasValidatorType) {
          // Handle ip4 and ip6 object notation
          if (value.type === 'ip4') {
            processed[key] = { ...value, type: 'string' };
          } else if (value.type === 'ip6') {
            processed[key] = { ...value, type: 'string' };
          } else if (value.type === 'money') {
            // Money type → number with min:0
            processed[key] = { ...value, type: 'number', min: value.min !== undefined ? value.min : 0 };
          } else if (value.type === 'decimal') {
            // Decimal type → number
            processed[key] = { ...value, type: 'number' };
          } else if (value.type === 'geo:lat' || value.type === 'geo-lat') {
            // Geo latitude → number with range [-90, 90]
            processed[key] = {
              ...value,
              type: 'number',
              min: value.min !== undefined ? value.min : -90,
              max: value.max !== undefined ? value.max : 90
            };
          } else if (value.type === 'geo:lon' || value.type === 'geo-lon') {
            // Geo longitude → number with range [-180, 180]
            processed[key] = {
              ...value,
              type: 'number',
              min: value.min !== undefined ? value.min : -180,
              max: value.max !== undefined ? value.max : 180
            };
          } else if (value.type === 'geo:point' || value.type === 'geo-point') {
            // Geo point → any (will be validated in hooks)
            processed[key] = { ...value, type: 'any' };
          } else if (value.type === 'object' && value.properties) {
            // Recursively process nested object properties
            processed[key] = {
              ...value,
              properties: this.preprocessAttributesForValidation(value.properties)
            };
          } else {
            // This is a validator type definition (e.g., { type: 'array', items: 'number' }), pass it through
            processed[key] = value;
          }
        } else {
          // This is a nested object structure, wrap it for validation
          const isExplicitRequired = value.$$type && value.$$type.includes('required');
          const isExplicitOptional = value.$$type && value.$$type.includes('optional');
          const objectConfig = {
            type: 'object',
            properties: this.preprocessAttributesForValidation(value),
            strict: false
          };
          // If explicitly required, don't mark as optional
          if (isExplicitRequired) {
            // nothing
          } else if (isExplicitOptional || this.allNestedObjectsOptional) {
            objectConfig.optional = true;
          }
          processed[key] = objectConfig;
        }
      } else {
        processed[key] = value;
      }
    }

    return processed;
  }
}

export default Schema
