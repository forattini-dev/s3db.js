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
  decrypt: (value, { passphrase }) => decrypt(value, passphrase),

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
      options = {},
    } = args;

    this.name = name;
    this.version = version;
    this.attributes = attributes;
    this.passphrase = passphrase ?? "secret";
    this.options = merge({}, this.defaultOptions(), options);

    this.validator = new ValidatorManager({ autoEncrypt: false }).compile(merge(
      { $$async: true },
      cloneDeep(this.attributes),
    ))

    if (this.options.generateAutoHooks) this.generateAutoHooks();

    if (!isEmpty(map)) {
      this.map = map;
      this.reversedMap = invert(map);
    }
    else {
      const flatAttrs = flatten(this.attributes, { safe: true });
      this.reversedMap = { ...Object.keys(flatAttrs).filter(k => !k.includes('$$')) }
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
      attributes,
    } = isString(data) ? JSON.parse(data) : data;

    const schema = new Schema({
      map,
      name,
      options,
      version,
      attributes,
    })

    return schema
  }

  export() {
    const data = {
      version: this.version,
      name: this.name,
      options: this.options,
      attributes: cloneDeep(this.attributes),
      map: this.map,
    };

    for (const [name, definition] of Object.entries(this.attributes)) {
      data.attributes[name] = JSON.stringify(definition);
    }

    return data;
  }

  async applyHooksActions(resourceItem, hook) {
    for (const [attribute, actions] of Object.entries(this.options.hooks[hook])) {
      for (const action of actions) {
        const value = get(resourceItem, attribute)

        if (value !== undefined) {
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
}

export default Schema
