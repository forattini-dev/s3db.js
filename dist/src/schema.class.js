import { flatten, unflatten } from "./concerns/flatten.js";
import { createHash } from "crypto";
import { set, get, uniq, merge, invert, isEmpty, isString, cloneDeep, } from "lodash-es";
import { encrypt, decrypt } from "./concerns/crypto.js";
import { hashPassword, compactHash } from "./concerns/password-hashing.js";
import { ValidatorManager } from "./validator.class.js";
import { tryFn, tryFnSync } from "./concerns/try-fn.js";
import { SchemaError } from "./errors.js";
import { encode as toBase62, decode as fromBase62, encodeDecimal, decodeDecimal, encodeFixedPoint, decodeFixedPoint, encodeFixedPointBatch, decodeFixedPointBatch } from "./concerns/base62.js";
import { encodeIPv4, decodeIPv4, encodeIPv6, decodeIPv6, isValidIPv4, isValidIPv6 } from "./concerns/ip.js";
import { encodeBuffer, decodeBuffer, encodeBits, decodeBits } from "./concerns/binary.js";
import { encodeGeoLat, decodeGeoLat, encodeGeoLon, decodeGeoLon, encodeGeoPoint, decodeGeoPoint } from "./concerns/geo-encoding.js";
import { generateSchemaFingerprint, getCachedValidator, cacheValidator, releaseValidator, getCacheStats, getCacheMemoryUsage, evictUnusedValidators } from "./concerns/validator-cache.js";
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
function generatePluginAttributeHash(pluginName, attributeName) {
    const input = `${pluginName}:${attributeName}`;
    const hash = createHash('sha256').update(input).digest();
    const num = hash.readUInt32BE(0);
    const base62Hash = toBase62(num);
    const paddedHash = base62Hash.padStart(3, '0').substring(0, 3);
    return 'p' + paddedHash.toLowerCase();
}
function generatePluginMapping(attributes) {
    const mapping = {};
    const reversedMapping = {};
    const usedHashes = new Set();
    for (const { key, pluginName } of attributes) {
        let hash = generatePluginAttributeHash(pluginName, key);
        let counter = 1;
        let finalHash = hash;
        while (usedHashes.has(finalHash)) {
            finalHash = `${hash}${counter}`;
            counter++;
        }
        usedHashes.add(finalHash);
        mapping[key] = finalHash;
        reversedMapping[finalHash] = key;
    }
    return { mapping, reversedMapping };
}
export const SchemaActions = {
    trim: (value) => value == null ? value : String(value).trim(),
    encrypt: async (value, { passphrase }) => {
        if (value === null || value === undefined)
            return value;
        const [ok, , res] = await tryFn(() => encrypt(value, passphrase));
        return ok ? res : value;
    },
    decrypt: async (value, { passphrase }) => {
        if (value === null || value === undefined)
            return value;
        const [ok, , raw] = await tryFn(() => decrypt(value, passphrase));
        if (!ok)
            return value;
        if (raw === 'null')
            return null;
        if (raw === 'undefined')
            return undefined;
        return raw;
    },
    hashPassword: async (value, { bcryptRounds = 10 }) => {
        if (value === null || value === undefined)
            return value;
        const [okHash, , hash] = await tryFn(() => hashPassword(String(value), bcryptRounds));
        if (!okHash)
            return value;
        const [okCompact, , compacted] = tryFnSync(() => compactHash(hash));
        return okCompact ? compacted : hash;
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
                current += str[i + 1];
                i += 2;
            }
            else if (str[i] === separator) {
                items.push(current);
                current = '';
                i++;
            }
            else {
                current += str[i];
                i++;
            }
        }
        items.push(current);
        return items;
    },
    toJSON: (value) => {
        if (value === null)
            return null;
        if (value === undefined)
            return undefined;
        if (typeof value === 'string') {
            const [ok, , parsed] = tryFnSync(() => JSON.parse(value));
            if (ok && typeof parsed === 'object')
                return value;
            return value;
        }
        const [ok, , json] = tryFnSync(() => JSON.stringify(value));
        return ok ? json : value;
    },
    fromJSON: (value) => {
        if (value === null)
            return null;
        if (value === undefined)
            return undefined;
        if (typeof value !== 'string')
            return value;
        if (value === '')
            return '';
        const [ok, , parsed] = tryFnSync(() => JSON.parse(value));
        return ok ? parsed : value;
    },
    toNumber: (value) => isString(value) ? value.includes('.') ? parseFloat(value) : parseInt(value) : value,
    toBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value),
    fromBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value) ? '1' : '0',
    fromBase62: (value) => {
        if (value === null || value === undefined || value === '')
            return value;
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            const n = fromBase62(value);
            return isNaN(n) ? undefined : n;
        }
        return undefined;
    },
    toBase62: (value) => {
        if (value === null || value === undefined || value === '')
            return value;
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
        if (value === null || value === undefined || value === '')
            return value;
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            const n = decodeDecimal(value);
            return isNaN(n) ? undefined : n;
        }
        return undefined;
    },
    toBase62Decimal: (value) => {
        if (value === null || value === undefined || value === '')
            return value;
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
            }
            else if (str[i] === separator) {
                items.push(current);
                current = '';
                i++;
            }
            else {
                current += str[i];
                i++;
            }
        }
        items.push(current);
        return items.map(v => {
            if (typeof v === 'number')
                return v;
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
            }
            else if (str[i] === separator) {
                items.push(current);
                current = '';
                i++;
            }
            else {
                current += str[i];
                i++;
            }
        }
        items.push(current);
        return items.map(v => {
            if (typeof v === 'number')
                return v;
            if (typeof v === 'string' && v !== '') {
                const n = decodeDecimal(v);
                return isNaN(n) ? NaN : n;
            }
            return NaN;
        });
    },
    fromArrayOfEmbeddings: (value, { precision = 6 }) => {
        if (value === null || value === undefined || !Array.isArray(value)) {
            return value;
        }
        if (value.length === 0) {
            return '^[]';
        }
        return encodeFixedPointBatch(value, precision);
    },
    toArrayOfEmbeddings: (value, { separator, precision = 6 }) => {
        if (Array.isArray(value)) {
            return value;
        }
        if (value === null || value === undefined) {
            return value;
        }
        if (value === '' || value === '^[]') {
            return [];
        }
        const str = String(value);
        if (str.startsWith('^[')) {
            return decodeFixedPointBatch(str, precision);
        }
        const items = [];
        let current = '';
        let i = 0;
        while (i < str.length) {
            if (str[i] === '\\' && i + 1 < str.length) {
                current += str[i + 1];
                i += 2;
            }
            else if (str[i] === separator) {
                items.push(current);
                current = '';
                i++;
            }
            else {
                current += str[i];
                i++;
            }
        }
        items.push(current);
        return items.map(v => {
            if (typeof v === 'number')
                return v;
            if (typeof v === 'string' && v !== '') {
                const n = decodeFixedPoint(v, precision);
                return isNaN(n) ? NaN : n;
            }
            return NaN;
        });
    },
    encodeIPv4: (value) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        if (!isValidIPv4(value))
            return value;
        const [ok, , encoded] = tryFnSync(() => encodeIPv4(value));
        return ok ? encoded : value;
    },
    decodeIPv4: (value) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeIPv4(value));
        return ok ? decoded : value;
    },
    encodeIPv6: (value) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        if (!isValidIPv6(value))
            return value;
        const [ok, , encoded] = tryFnSync(() => encodeIPv6(value));
        return ok ? encoded : value;
    },
    decodeIPv6: (value) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeIPv6(value));
        return ok ? decoded : value;
    },
    encodeBuffer: (value) => {
        if (value === null || value === undefined)
            return value;
        if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array))
            return value;
        const [ok, , encoded] = tryFnSync(() => encodeBuffer(value));
        return ok ? encoded : value;
    },
    decodeBuffer: (value) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeBuffer(value));
        return ok ? decoded : value;
    },
    encodeBits: (value, { bitCount = null } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array))
            return value;
        const [ok, , encoded] = tryFnSync(() => encodeBits(value, bitCount));
        return ok ? encoded : value;
    },
    decodeBits: (value, { bitCount = null } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeBits(value, bitCount));
        return ok ? decoded : value;
    },
    encodeMoney: (value, { decimals = 2 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'number')
            return value;
        const multiplier = Math.pow(10, decimals);
        const integerValue = Math.round(value * multiplier);
        const [ok, , encoded] = tryFnSync(() => '$' + toBase62(integerValue));
        return ok ? encoded : value;
    },
    decodeMoney: (value, { decimals = 2 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        if (!value.startsWith('$'))
            return value;
        const [ok, , integerValue] = tryFnSync(() => fromBase62(value.slice(1)));
        if (!ok || isNaN(integerValue))
            return value;
        const divisor = Math.pow(10, decimals);
        return integerValue / divisor;
    },
    encodeDecimalFixed: (value, { precision = 2 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'number')
            return value;
        const [ok, , encoded] = tryFnSync(() => encodeFixedPoint(value, precision));
        return ok ? encoded : value;
    },
    decodeDecimalFixed: (value, { precision = 2 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeFixedPoint(value, precision));
        return ok ? decoded : value;
    },
    encodeGeoLatitude: (value, { precision = 6 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'number')
            return value;
        const [ok, , encoded] = tryFnSync(() => encodeGeoLat(value, precision));
        return ok ? encoded : value;
    },
    decodeGeoLatitude: (value, { precision = 6 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeGeoLat(value, precision));
        return ok ? decoded : value;
    },
    encodeGeoLongitude: (value, { precision = 6 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'number')
            return value;
        const [ok, , encoded] = tryFnSync(() => encodeGeoLon(value, precision));
        return ok ? encoded : value;
    },
    decodeGeoLongitude: (value, { precision = 6 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeGeoLon(value, precision));
        return ok ? decoded : value;
    },
    encodeGeoPointPair: (value, { precision = 6 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (Array.isArray(value) && value.length === 2) {
            const [ok, , encoded] = tryFnSync(() => encodeGeoPoint(value[0], value[1], precision));
            return ok ? encoded : value;
        }
        if (typeof value === 'object' && value !== null) {
            const obj = value;
            if (obj.lat !== undefined && obj.lon !== undefined) {
                const [ok, , encoded] = tryFnSync(() => encodeGeoPoint(obj.lat, obj.lon, precision));
                return ok ? encoded : value;
            }
            if (obj.latitude !== undefined && obj.longitude !== undefined) {
                const [ok, , encoded] = tryFnSync(() => encodeGeoPoint(obj.latitude, obj.longitude, precision));
                return ok ? encoded : value;
            }
        }
        return value;
    },
    decodeGeoPointPair: (value, { precision = 6 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        const [ok, , decoded] = tryFnSync(() => decodeGeoPoint(value, precision));
        return ok ? decoded : value;
    },
};
export class Schema {
    name;
    version;
    attributes;
    passphrase;
    bcryptRounds;
    options;
    allNestedObjectsOptional;
    _pluginAttributeMetadata;
    _pluginAttributes;
    _schemaFingerprint;
    validator;
    map;
    reversedMap;
    pluginMap;
    reversedPluginMap;
    constructor(args) {
        const { map, pluginMap, name, attributes, passphrase, bcryptRounds, version = 1, options = {}, _pluginAttributeMetadata, _pluginAttributes } = args;
        this.name = name;
        this.version = version;
        this.attributes = attributes || {};
        this.passphrase = passphrase ?? "secret";
        this.bcryptRounds = bcryptRounds ?? 10;
        this.options = merge({}, this.defaultOptions(), options);
        this.allNestedObjectsOptional = this.options.allNestedObjectsOptional ?? false;
        this._pluginAttributeMetadata = _pluginAttributeMetadata || {};
        this._pluginAttributes = _pluginAttributes || {};
        const processedAttributes = this.preprocessAttributesForValidation(this.attributes);
        this._schemaFingerprint = generateSchemaFingerprint(processedAttributes, {
            passphrase: this.passphrase,
            bcryptRounds: this.bcryptRounds,
            allNestedObjectsOptional: this.allNestedObjectsOptional
        });
        const cachedValidator = getCachedValidator(this._schemaFingerprint);
        if (cachedValidator) {
            this.validator = cachedValidator;
        }
        else {
            this.validator = new ValidatorManager({
                autoEncrypt: false,
                passphrase: this.passphrase,
                bcryptRounds: this.bcryptRounds
            }).compile(merge({ $$async: true, $$strict: false }, processedAttributes));
            cacheValidator(this._schemaFingerprint, this.validator);
        }
        if (this.options.generateAutoHooks)
            this.generateAutoHooks();
        if (!isEmpty(map)) {
            this.map = map;
            this.reversedMap = invert(map);
        }
        else {
            const flatAttrs = flatten(this.attributes, { safe: true });
            const leafKeys = Object.keys(flatAttrs).filter(k => !k.includes('$$'));
            const objectKeys = this.extractObjectKeys(this.attributes);
            const allKeys = [...new Set([...leafKeys, ...objectKeys])];
            const userKeys = [];
            const pluginAttributes = [];
            for (const key of allKeys) {
                const attrDef = this.getAttributeDefinition(key);
                if (typeof attrDef === 'object' && attrDef !== null && attrDef.__plugin__) {
                    pluginAttributes.push({ key, pluginName: attrDef.__plugin__ });
                }
                else if (typeof attrDef === 'string' && this._pluginAttributeMetadata && this._pluginAttributeMetadata[key]) {
                    const pluginName = this._pluginAttributeMetadata[key].__plugin__;
                    pluginAttributes.push({ key, pluginName });
                }
                else {
                    userKeys.push(key);
                }
            }
            const { mapping, reversedMapping } = generateBase62Mapping(userKeys);
            this.map = mapping;
            this.reversedMap = reversedMapping;
            const { mapping: pMapping, reversedMapping: pReversedMapping } = generatePluginMapping(pluginAttributes);
            this.pluginMap = pMapping;
            this.reversedPluginMap = pReversedMapping;
            this._pluginAttributes = {};
            for (const { key, pluginName } of pluginAttributes) {
                if (!this._pluginAttributes[pluginName]) {
                    this._pluginAttributes[pluginName] = [];
                }
                this._pluginAttributes[pluginName].push(key);
            }
        }
        if (!isEmpty(pluginMap)) {
            this.pluginMap = pluginMap;
            this.reversedPluginMap = invert(pluginMap);
        }
        if (!this.pluginMap) {
            this.pluginMap = {};
            this.reversedPluginMap = {};
        }
        if (!this._pluginAttributes) {
            this._pluginAttributes = {};
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
        };
    }
    addHook(hook, attribute, action, params = {}) {
        if (!this.options.hooks[hook][attribute])
            this.options.hooks[hook][attribute] = [];
        const hookEntry = Object.keys(params).length > 0 ? { action, params } : action;
        this.options.hooks[hook][attribute] = uniq([...this.options.hooks[hook][attribute], hookEntry]);
    }
    extractObjectKeys(obj, prefix = '') {
        const objectKeys = [];
        for (const [key, value] of Object.entries(obj)) {
            if (key.startsWith('$$'))
                continue;
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                objectKeys.push(fullKey);
                if (value.$$type === 'object') {
                    objectKeys.push(...this.extractObjectKeys(value, fullKey));
                }
            }
        }
        return objectKeys;
    }
    _generateHooksFromOriginalAttributes(attributes, prefix = '') {
        for (const [key, value] of Object.entries(attributes)) {
            if (key.startsWith('$$'))
                continue;
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && value !== null && !Array.isArray(value) && value.type) {
                const typedValue = value;
                if (typedValue.type === 'array' && typedValue.items) {
                    const itemsType = typedValue.items;
                    const arrayLength = typeof typedValue.length === 'number' ? typedValue.length : null;
                    if (itemsType === 'string' || (typeof itemsType === 'string' && itemsType.includes('string'))) {
                        this.addHook("beforeMap", fullKey, "fromArray");
                        this.addHook("afterUnmap", fullKey, "toArray");
                    }
                    else if (itemsType === 'number' || (typeof itemsType === 'string' && itemsType.includes('number'))) {
                        const isIntegerArray = typeof itemsType === 'string' && itemsType.includes('integer');
                        const isEmbedding = !isIntegerArray && arrayLength !== null && arrayLength >= 256;
                        if (isIntegerArray) {
                            this.addHook("beforeMap", fullKey, "fromArrayOfNumbers");
                            this.addHook("afterUnmap", fullKey, "toArrayOfNumbers");
                        }
                        else if (isEmbedding) {
                            this.addHook("beforeMap", fullKey, "fromArrayOfEmbeddings");
                            this.addHook("afterUnmap", fullKey, "toArrayOfEmbeddings");
                        }
                        else {
                            this.addHook("beforeMap", fullKey, "fromArrayOfDecimals");
                            this.addHook("afterUnmap", fullKey, "toArrayOfDecimals");
                        }
                    }
                }
            }
            else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !value.type) {
                this._generateHooksFromOriginalAttributes(value, fullKey);
            }
        }
    }
    generateAutoHooks() {
        this._generateHooksFromOriginalAttributes(this.attributes);
        const schema = flatten(cloneDeep(this.attributes), { safe: true });
        for (const [name, definition] of Object.entries(schema)) {
            if (name.includes('$$'))
                continue;
            if (this.options.hooks.beforeMap[name] || this.options.hooks.afterUnmap[name]) {
                continue;
            }
            const defStr = typeof definition === 'string' ? definition : '';
            const defType = typeof definition === 'object' && definition !== null ? definition.type : null;
            const isEmbeddingType = defStr.includes("embedding") || defType === 'embedding';
            if (isEmbeddingType) {
                this.addHook("beforeMap", name, "fromArrayOfEmbeddings");
                this.addHook("afterUnmap", name, "toArrayOfEmbeddings");
                continue;
            }
            const isArray = defStr.includes("array") || defType === 'array';
            if (isArray) {
                let itemsType = null;
                if (typeof definition === 'object' && definition !== null && definition.items) {
                    itemsType = definition.items;
                }
                else if (defStr.includes('items:string')) {
                    itemsType = 'string';
                }
                else if (defStr.includes('items:number')) {
                    itemsType = 'number';
                }
                if (itemsType === 'string' || (typeof itemsType === 'string' && itemsType.includes('string'))) {
                    this.addHook("beforeMap", name, "fromArray");
                    this.addHook("afterUnmap", name, "toArray");
                }
                else if (itemsType === 'number' || (typeof itemsType === 'string' && itemsType.includes('number'))) {
                    const isIntegerArray = defStr.includes("integer:true") ||
                        defStr.includes("|integer:") ||
                        defStr.includes("|integer") ||
                        (typeof itemsType === 'string' && itemsType.includes('integer'));
                    let arrayLength = null;
                    if (typeof definition === 'object' && definition !== null && typeof definition.length === 'number') {
                        arrayLength = definition.length;
                    }
                    else if (defStr.includes('length:')) {
                        const match = defStr.match(/length:(\d+)/);
                        if (match)
                            arrayLength = parseInt(match[1], 10);
                    }
                    const isEmbedding = !isIntegerArray && arrayLength !== null && arrayLength >= 256;
                    if (isIntegerArray) {
                        this.addHook("beforeMap", name, "fromArrayOfNumbers");
                        this.addHook("afterUnmap", name, "toArrayOfNumbers");
                    }
                    else if (isEmbedding) {
                        this.addHook("beforeMap", name, "fromArrayOfEmbeddings");
                        this.addHook("afterUnmap", name, "toArrayOfEmbeddings");
                    }
                    else {
                        this.addHook("beforeMap", name, "fromArrayOfDecimals");
                        this.addHook("afterUnmap", name, "toArrayOfDecimals");
                    }
                }
                continue;
            }
            if (defStr.includes("secret") || defType === 'secret') {
                if (this.options.autoEncrypt) {
                    this.addHook("beforeMap", name, "encrypt");
                }
                if (this.options.autoDecrypt) {
                    this.addHook("afterUnmap", name, "decrypt");
                }
                continue;
            }
            if (defStr.includes("password") || defType === 'password') {
                continue;
            }
            if (defStr.includes("ip4") || defType === 'ip4') {
                this.addHook("beforeMap", name, "encodeIPv4");
                this.addHook("afterUnmap", name, "decodeIPv4");
                continue;
            }
            if (defStr.includes("ip6") || defType === 'ip6') {
                this.addHook("beforeMap", name, "encodeIPv6");
                this.addHook("afterUnmap", name, "decodeIPv6");
                continue;
            }
            if (defStr.includes("buffer") || defType === 'buffer') {
                this.addHook("beforeMap", name, "encodeBuffer");
                this.addHook("afterUnmap", name, "decodeBuffer");
                continue;
            }
            if (defStr.includes("bits") || defType === 'bits') {
                let bitCount = null;
                const bitsMatch = defStr.match(/bits:(\d+)/);
                if (bitsMatch) {
                    bitCount = parseInt(bitsMatch[1], 10);
                }
                this.addHook("beforeMap", name, "encodeBits", { bitCount });
                this.addHook("afterUnmap", name, "decodeBits", { bitCount });
                continue;
            }
            if (defStr.includes("money") || defType === 'money' || defStr.includes("crypto") || defType === 'crypto') {
                let decimals = 2;
                if (defStr.includes("crypto") || defType === 'crypto') {
                    decimals = 8;
                }
                const decimalsMatch = defStr.match(/(?:money|crypto):(\d+)/i);
                if (decimalsMatch) {
                    decimals = parseInt(decimalsMatch[1], 10);
                }
                this.addHook("beforeMap", name, "encodeMoney", { decimals });
                this.addHook("afterUnmap", name, "decodeMoney", { decimals });
                continue;
            }
            if (defStr.includes("decimal") || defType === 'decimal') {
                let precision = 2;
                const precisionMatch = defStr.match(/decimal:(\d+)/);
                if (precisionMatch) {
                    precision = parseInt(precisionMatch[1], 10);
                }
                this.addHook("beforeMap", name, "encodeDecimalFixed", { precision });
                this.addHook("afterUnmap", name, "decodeDecimalFixed", { precision });
                continue;
            }
            if (defStr.includes("geo:lat") || (defType === 'geo' && defStr.includes('lat'))) {
                let precision = 6;
                const precisionMatch = defStr.match(/geo:lat:(\d+)/);
                if (precisionMatch) {
                    precision = parseInt(precisionMatch[1], 10);
                }
                this.addHook("beforeMap", name, "encodeGeoLatitude", { precision });
                this.addHook("afterUnmap", name, "decodeGeoLatitude", { precision });
                continue;
            }
            if (defStr.includes("geo:lon") || (defType === 'geo' && defStr.includes('lon'))) {
                let precision = 6;
                const precisionMatch = defStr.match(/geo:lon:(\d+)/);
                if (precisionMatch) {
                    precision = parseInt(precisionMatch[1], 10);
                }
                this.addHook("beforeMap", name, "encodeGeoLongitude", { precision });
                this.addHook("afterUnmap", name, "decodeGeoLongitude", { precision });
                continue;
            }
            if (defStr.includes("geo:point") || defType === 'geo:point') {
                let precision = 6;
                const precisionMatch = defStr.match(/geo:point:(\d+)/);
                if (precisionMatch) {
                    precision = parseInt(precisionMatch[1], 10);
                }
                this.addHook("beforeMap", name, "encodeGeoPointPair", { precision });
                this.addHook("afterUnmap", name, "decodeGeoPointPair", { precision });
                continue;
            }
            if (defStr.includes("number") || defType === 'number') {
                const isInteger = defStr.includes("integer:true") ||
                    defStr.includes("|integer:") ||
                    defStr.includes("|integer");
                if (isInteger) {
                    this.addHook("beforeMap", name, "toBase62");
                    this.addHook("afterUnmap", name, "fromBase62");
                }
                else {
                    this.addHook("beforeMap", name, "toBase62Decimal");
                    this.addHook("afterUnmap", name, "fromBase62Decimal");
                }
                continue;
            }
            if (defStr.includes("boolean") || defType === 'boolean') {
                this.addHook("beforeMap", name, "fromBool");
                this.addHook("afterUnmap", name, "toBool");
                continue;
            }
            if (defStr.includes("json") || defType === 'json') {
                this.addHook("beforeMap", name, "toJSON");
                this.addHook("afterUnmap", name, "fromJSON");
                continue;
            }
            if (definition === "object" || defStr.includes("object") || defType === 'object') {
                this.addHook("beforeMap", name, "toJSON");
                this.addHook("afterUnmap", name, "fromJSON");
                continue;
            }
        }
    }
    static import(data) {
        let { map, pluginMap, _pluginAttributeMetadata, name, options, version, attributes } = isString(data) ? JSON.parse(data) : data;
        const [ok, err, attrs] = tryFnSync(() => Schema._importAttributes(attributes));
        if (!ok)
            throw new SchemaError('Failed to import schema attributes', { original: err, input: attributes });
        attributes = attrs;
        const schema = new Schema({
            map,
            pluginMap: pluginMap || {},
            name,
            options,
            version,
            attributes
        });
        if (_pluginAttributeMetadata) {
            schema._pluginAttributeMetadata = _pluginAttributeMetadata;
        }
        return schema;
    }
    static _importAttributes(attrs) {
        if (typeof attrs === 'string') {
            const [ok, , parsed] = tryFnSync(() => JSON.parse(attrs));
            if (ok && typeof parsed === 'object' && parsed !== null) {
                const [okNested, errNested, nested] = tryFnSync(() => Schema._importAttributes(parsed));
                if (!okNested)
                    throw new SchemaError('Failed to parse nested schema attribute', { original: errNested, input: attrs });
                return nested;
            }
            return attrs;
        }
        if (Array.isArray(attrs)) {
            const [okArr, errArr, arr] = tryFnSync(() => attrs.map(a => Schema._importAttributes(a)));
            if (!okArr)
                throw new SchemaError('Failed to import array schema attributes', { original: errArr, input: attrs });
            return arr;
        }
        if (typeof attrs === 'object' && attrs !== null) {
            const out = {};
            for (const [k, v] of Object.entries(attrs)) {
                const [okObj, errObj, val] = tryFnSync(() => Schema._importAttributes(v));
                if (!okObj)
                    throw new SchemaError('Failed to import object schema attribute', { original: errObj, key: k, input: v });
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
            pluginMap: this.pluginMap || {},
            _pluginAttributeMetadata: this._pluginAttributeMetadata || {},
            _pluginAttributes: this._pluginAttributes || {}
        };
        return data;
    }
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
            for (const actionEntry of actions) {
                const actionName = typeof actionEntry === 'string' ? actionEntry : actionEntry.action;
                const actionParams = typeof actionEntry === 'object' ? actionEntry.params : {};
                const value = get(cloned, attribute);
                const actionFn = SchemaActions[actionName];
                if (value !== undefined && typeof actionFn === 'function') {
                    set(cloned, attribute, await actionFn(value, {
                        passphrase: this.passphrase,
                        bcryptRounds: this.bcryptRounds,
                        separator: this.options.arraySeparator,
                        ...actionParams
                    }));
                }
            }
        }
        return cloned;
    }
    async validate(resourceItem, { mutateOriginal = false } = {}) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[DEPRECATION] Schema.validate() is deprecated. Use ResourceValidator.validate() instead.');
        }
        const data = mutateOriginal ? resourceItem : cloneDeep(resourceItem);
        const result = await this.validator(data);
        return result;
    }
    async mapper(resourceItem) {
        let obj = cloneDeep(resourceItem);
        obj = await this.applyHooksActions(obj, "beforeMap");
        const flattenedObj = flatten(obj, { safe: true });
        const rest = { '_v': this.version + '' };
        for (const [key, value] of Object.entries(flattenedObj)) {
            const mappedKey = this.pluginMap[key] || this.map[key] || key;
            const attrDef = this.getAttributeDefinition(key);
            if (typeof value === 'number' && typeof attrDef === 'string' && attrDef.includes('number')) {
                rest[mappedKey] = toBase62(value);
            }
            else if (typeof value === 'string') {
                if (value === '[object Object]') {
                    rest[mappedKey] = '{}';
                }
                else if (value.startsWith('{') || value.startsWith('[')) {
                    rest[mappedKey] = value;
                }
                else {
                    rest[mappedKey] = value;
                }
            }
            else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
                rest[mappedKey] = JSON.stringify(value);
            }
            else {
                rest[mappedKey] = value;
            }
        }
        await this.applyHooksActions(rest, "afterMap");
        return rest;
    }
    async unmapper(mappedResourceItem, mapOverride, pluginMapOverride) {
        let obj = cloneDeep(mappedResourceItem);
        delete obj._v;
        obj = await this.applyHooksActions(obj, "beforeUnmap");
        const reversedMap = mapOverride ? invert(mapOverride) : this.reversedMap;
        const reversedPluginMap = pluginMapOverride ? invert(pluginMapOverride) : this.reversedPluginMap;
        const rest = {};
        for (const [key, value] of Object.entries(obj)) {
            let originalKey = reversedPluginMap[key] || reversedMap[key] || key;
            if (!originalKey) {
                originalKey = key;
            }
            let parsedValue = value;
            const attrDef = this.getAttributeDefinition(originalKey);
            const hasAfterUnmapHook = this.options.hooks?.afterUnmap?.[originalKey];
            if (!hasAfterUnmapHook && typeof attrDef === 'string' && attrDef.includes('number') && !attrDef.includes('array') && !attrDef.includes('decimal')) {
                if (typeof parsedValue === 'string' && parsedValue !== '') {
                    parsedValue = fromBase62(parsedValue);
                }
                else if (typeof parsedValue === 'number') {
                    // Already a number
                }
                else {
                    parsedValue = undefined;
                }
            }
            else if (typeof value === 'string') {
                if (value === '[object Object]') {
                    parsedValue = {};
                }
                else if (value.startsWith('{') || value.startsWith('[')) {
                    const [ok, , parsed] = tryFnSync(() => JSON.parse(value));
                    if (ok)
                        parsedValue = parsed;
                }
            }
            if (this.attributes) {
                if (typeof attrDef === 'string' && attrDef.includes('array')) {
                    if (!hasAfterUnmapHook) {
                        if (Array.isArray(parsedValue)) {
                            // Already an array
                        }
                        else if (typeof parsedValue === 'string' && parsedValue.trim().startsWith('[')) {
                            const [okArr, , arr] = tryFnSync(() => JSON.parse(parsedValue));
                            if (okArr && Array.isArray(arr)) {
                                parsedValue = arr;
                            }
                        }
                        else {
                            parsedValue = SchemaActions.toArray(parsedValue, { separator: this.options.arraySeparator });
                        }
                    }
                }
            }
            const afterUnmapHooks = this.options.hooks?.afterUnmap?.[originalKey];
            if (afterUnmapHooks) {
                for (const actionEntry of afterUnmapHooks) {
                    const actionName = typeof actionEntry === 'string' ? actionEntry : actionEntry.action;
                    const actionParams = typeof actionEntry === 'object' ? actionEntry.params : {};
                    const actionFn = SchemaActions[actionName];
                    if (typeof actionFn === 'function') {
                        parsedValue = await actionFn(parsedValue, {
                            passphrase: this.passphrase,
                            bcryptRounds: this.bcryptRounds,
                            separator: this.options.arraySeparator,
                            ...actionParams
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
    getAttributeDefinition(key) {
        const parts = key.split('.');
        let def = this.attributes;
        for (const part of parts) {
            if (!def)
                return undefined;
            def = def[part];
        }
        return def;
    }
    regeneratePluginMapping() {
        const flatAttrs = flatten(this.attributes, { safe: true });
        const leafKeys = Object.keys(flatAttrs).filter(k => !k.includes('$$'));
        const objectKeys = this.extractObjectKeys(this.attributes);
        const allKeys = [...new Set([...leafKeys, ...objectKeys])];
        const pluginAttributes = [];
        for (const key of allKeys) {
            const attrDef = this.getAttributeDefinition(key);
            if (typeof attrDef === 'object' && attrDef !== null && attrDef.__plugin__) {
                pluginAttributes.push({ key, pluginName: attrDef.__plugin__ });
            }
            else if (typeof attrDef === 'string' && this._pluginAttributeMetadata && this._pluginAttributeMetadata[key]) {
                const pluginName = this._pluginAttributeMetadata[key].__plugin__;
                pluginAttributes.push({ key, pluginName });
            }
        }
        const { mapping, reversedMapping } = generatePluginMapping(pluginAttributes);
        this.pluginMap = mapping;
        this.reversedPluginMap = reversedMapping;
        this._pluginAttributes = {};
        for (const { key, pluginName } of pluginAttributes) {
            if (!this._pluginAttributes[pluginName]) {
                this._pluginAttributes[pluginName] = [];
            }
            this._pluginAttributes[pluginName].push(key);
        }
    }
    preprocessAttributesForValidation(attributes) {
        const processed = {};
        for (const [key, value] of Object.entries(attributes)) {
            if (typeof value === 'string') {
                if (value === 'ip4' || value.startsWith('ip4|')) {
                    processed[key] = value.replace(/^ip4/, 'string');
                    continue;
                }
                if (value === 'ip6' || value.startsWith('ip6|')) {
                    processed[key] = value.replace(/^ip6/, 'string');
                    continue;
                }
                if (value === 'buffer' || value.startsWith('buffer|')) {
                    processed[key] = 'any';
                    continue;
                }
                if (value === 'bits' || value.startsWith('bits:') || value.startsWith('bits|')) {
                    processed[key] = 'any';
                    continue;
                }
                if (value === 'money' || value.startsWith('money:') || value.startsWith('money|') ||
                    value === 'crypto' || value.startsWith('crypto:') || value.startsWith('crypto|')) {
                    const rest = value.replace(/^(?:money|crypto)(?::\d+)?/, '');
                    const hasMin = rest.includes('min:');
                    processed[key] = hasMin ? `number${rest}` : `number|min:0${rest}`;
                    continue;
                }
                if (value === 'decimal' || value.startsWith('decimal:') || value.startsWith('decimal|')) {
                    const rest = value.replace(/^decimal(:\d+)?/, '');
                    processed[key] = `number${rest}`;
                    continue;
                }
                if (value.startsWith('geo:lat')) {
                    const rest = value.replace(/^geo:lat(:\d+)?/, '');
                    const hasMin = rest.includes('min:');
                    const hasMax = rest.includes('max:');
                    let validation = 'number';
                    if (!hasMin)
                        validation += '|min:-90';
                    if (!hasMax)
                        validation += '|max:90';
                    processed[key] = validation + rest;
                    continue;
                }
                if (value.startsWith('geo:lon')) {
                    const rest = value.replace(/^geo:lon(:\d+)?/, '');
                    const hasMin = rest.includes('min:');
                    const hasMax = rest.includes('max:');
                    let validation = 'number';
                    if (!hasMin)
                        validation += '|min:-180';
                    if (!hasMax)
                        validation += '|max:180';
                    processed[key] = validation + rest;
                    continue;
                }
                if (value.startsWith('geo:point')) {
                    processed[key] = 'any';
                    continue;
                }
                if (value.startsWith('embedding:')) {
                    const lengthMatch = value.match(/embedding:(\d+)/);
                    if (lengthMatch) {
                        const length = lengthMatch[1];
                        const rest = value.substring(`embedding:${length}`.length);
                        processed[key] = `array|items:number|length:${length}|empty:false${rest}`;
                        continue;
                    }
                }
                if (value.startsWith('embedding|') || value === 'embedding') {
                    processed[key] = value.replace(/^embedding/, 'array|items:number|empty:false');
                    continue;
                }
                if (value.includes('|')) {
                    const parts = value.split('|');
                    const baseType = parts[0];
                    const config = { type: baseType };
                    for (let i = 1; i < parts.length; i++) {
                        const part = parts[i];
                        if (part === 'optional') {
                            config.optional = true;
                        }
                        else if (part === 'required') {
                            // required is default
                        }
                        else if (part.includes(':')) {
                            const [modifier, val] = part.split(':');
                            if (val === 'true') {
                                config[modifier] = true;
                            }
                            else if (val === 'false') {
                                config[modifier] = false;
                            }
                            else {
                                const numVal = Number(val);
                                config[modifier] = Number.isNaN(numVal) ? val : numVal;
                            }
                        }
                        else {
                            config[part] = true;
                        }
                    }
                    processed[key] = config;
                    continue;
                }
                processed[key] = value;
            }
            else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const validatorTypes = ['string', 'number', 'boolean', 'any', 'object', 'array', 'date', 'email', 'url', 'uuid', 'enum', 'custom', 'ip4', 'ip6', 'buffer', 'bits', 'money', 'crypto', 'decimal', 'geo:lat', 'geo:lon', 'geo:point', 'geo-lat', 'geo-lon', 'geo-point', 'secret', 'password', 'embedding'];
                const typeValue = value.type;
                const isValidValidatorType = typeof typeValue === 'string' &&
                    !typeValue.includes('|') &&
                    (validatorTypes.includes(typeValue) || typeValue.startsWith('bits:') || typeValue.startsWith('embedding:'));
                const hasValidatorType = isValidValidatorType && key !== '$$type';
                if (hasValidatorType) {
                    const { __plugin__, __pluginCreated__, ...cleanValue } = value;
                    if (cleanValue.type === 'ip4') {
                        processed[key] = { ...cleanValue, type: 'string' };
                    }
                    else if (cleanValue.type === 'ip6') {
                        processed[key] = { ...cleanValue, type: 'string' };
                    }
                    else if (cleanValue.type === 'buffer') {
                        processed[key] = { ...cleanValue, type: 'any' };
                    }
                    else if (cleanValue.type === 'bits' || cleanValue.type?.startsWith('bits:')) {
                        processed[key] = { ...cleanValue, type: 'any' };
                    }
                    else if (cleanValue.type === 'money' || cleanValue.type === 'crypto') {
                        processed[key] = { ...cleanValue, type: 'number', min: cleanValue.min !== undefined ? cleanValue.min : 0 };
                    }
                    else if (cleanValue.type === 'decimal') {
                        processed[key] = { ...cleanValue, type: 'number' };
                    }
                    else if (cleanValue.type === 'geo:lat' || cleanValue.type === 'geo-lat') {
                        processed[key] = {
                            ...cleanValue,
                            type: 'number',
                            min: cleanValue.min !== undefined ? cleanValue.min : -90,
                            max: cleanValue.max !== undefined ? cleanValue.max : 90
                        };
                    }
                    else if (cleanValue.type === 'geo:lon' || cleanValue.type === 'geo-lon') {
                        processed[key] = {
                            ...cleanValue,
                            type: 'number',
                            min: cleanValue.min !== undefined ? cleanValue.min : -180,
                            max: cleanValue.max !== undefined ? cleanValue.max : 180
                        };
                    }
                    else if (cleanValue.type === 'geo:point' || cleanValue.type === 'geo-point') {
                        processed[key] = { ...cleanValue, type: 'any' };
                    }
                    else if (cleanValue.type === 'object' && cleanValue.properties) {
                        processed[key] = {
                            ...cleanValue,
                            properties: this.preprocessAttributesForValidation(cleanValue.properties)
                        };
                    }
                    else if (cleanValue.type === 'object' && cleanValue.props) {
                        processed[key] = {
                            ...cleanValue,
                            props: this.preprocessAttributesForValidation(cleanValue.props)
                        };
                    }
                    else {
                        processed[key] = cleanValue;
                    }
                }
                else {
                    const isExplicitRequired = value.$$type && value.$$type.includes('required');
                    const isExplicitOptional = value.$$type && value.$$type.includes('optional');
                    const objectConfig = {
                        type: 'object',
                        props: this.preprocessAttributesForValidation(value),
                        strict: false
                    };
                    if (isExplicitRequired) {
                        // nothing
                    }
                    else if (isExplicitOptional || this.allNestedObjectsOptional) {
                        objectConfig.optional = true;
                    }
                    processed[key] = objectConfig;
                }
            }
            else {
                processed[key] = value;
            }
        }
        return processed;
    }
    dispose() {
        if (this._schemaFingerprint) {
            releaseValidator(this._schemaFingerprint);
        }
    }
    static getValidatorCacheStats() {
        return getCacheStats();
    }
    static getValidatorCacheMemoryUsage() {
        return getCacheMemoryUsage();
    }
    static evictUnusedValidators(maxAgeMs) {
        return evictUnusedValidators(maxAgeMs);
    }
}
export default Schema;
//# sourceMappingURL=schema.class.js.map