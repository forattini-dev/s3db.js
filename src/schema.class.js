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

import { encrypt, decrypt } from "./crypto";
import { ValidatorManager } from "./validator.class";

export const SchemaActions = {
  trim: (value) => value.trim(),

  encrypt: (value, { passphrase }) => encrypt(value, passphrase),
  decrypt: (value, { passphrase }) => decrypt(value, passphrase),

  toString: (value) => String(value),

  fromArray: (value, { separator }) => (value || []).join(separator),
  toArray: (value, { separator }) => (value || "").split(separator),

  toJSON: (value) => JSON.stringify(value),
  fromJSON: (value) => JSON.parse(value),

  toNumber: (value) => isString(value) ? value.includes('.') ? parseFloat(value) : parseInt(value) : value,

  toBool: (value) => ['1', 'true', 'yes', true, 'y'].includes(value),
  fromBool: (value) => value ? '1' : '0',
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
