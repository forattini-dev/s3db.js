import { flatten, unflatten } from "./concerns/flatten.js";
import { createHash } from "crypto";

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
import { hashPassword, compactHash } from "./concerns/password-hashing.js";
import { ValidatorManager } from "./validator.class.js";
import { tryFn, tryFnSync } from "./concerns/try-fn.js";
import { SchemaError } from "./errors.js";
import { encode as toBase62, decode as fromBase62, encodeDecimal, decodeDecimal, encodeFixedPoint, decodeFixedPoint, encodeFixedPointBatch, decodeFixedPointBatch } from "./concerns/base62.js";
import { encodeIPv4, decodeIPv4, encodeIPv6, decodeIPv6, isValidIPv4, isValidIPv6 } from "./concerns/ip.js";
import { encodeBuffer, decodeBuffer, encodeBits, decodeBits } from "./concerns/binary.js";
import { encodeGeoLat, decodeGeoLat, encodeGeoLon, decodeGeoLon, encodeGeoPoint, decodeGeoPoint } from "./concerns/geo-encoding.js";
import {
  generateSchemaFingerprint,
  getCachedValidator,
  cacheValidator,
  releaseValidator,
  getCacheStats,
  getCacheMemoryUsage,
  evictUnusedValidators
} from "./concerns/validator-cache.js";

export type AttributeValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

export interface SchemaAttributes {
  [key: string]: AttributeValue | SchemaAttributes;
}

export interface AttributeMapping {
  [key: string]: string;
}

export interface PluginAttributeMetadata {
  [key: string]: {
    __plugin__: string;
    [key: string]: unknown;
  };
}

export interface PluginAttributes {
  [pluginName: string]: string[];
}

export interface HookEntry {
  action: string;
  params: Record<string, unknown>;
}

export interface SchemaHooks {
  beforeMap: Record<string, (string | HookEntry)[]>;
  afterMap: Record<string, (string | HookEntry)[]>;
  beforeUnmap: Record<string, (string | HookEntry)[]>;
  afterUnmap: Record<string, (string | HookEntry)[]>;
}

export interface SchemaOptions {
  autoEncrypt?: boolean;
  autoDecrypt?: boolean;
  arraySeparator?: string;
  generateAutoHooks?: boolean;
  allNestedObjectsOptional?: boolean;
  hooks?: SchemaHooks;
}

export interface SchemaConstructorArgs {
  map?: AttributeMapping;
  pluginMap?: AttributeMapping;
  name: string;
  attributes?: SchemaAttributes;
  passphrase?: string;
  bcryptRounds?: number;
  version?: number;
  options?: SchemaOptions;
  _pluginAttributeMetadata?: PluginAttributeMetadata;
  _pluginAttributes?: PluginAttributes;
  /** Existing schema registry from s3db.json - if provided, indices are preserved */
  schemaRegistry?: SchemaRegistry;
  /** Existing plugin schema registry from s3db.json (accepts both legacy numeric and new string-key formats) */
  pluginSchemaRegistry?: Record<string, PluginSchemaRegistry | SchemaRegistry>;
}

export interface SchemaExport {
  version: number;
  name: string;
  options: SchemaOptions;
  attributes: SchemaAttributes;
  map: AttributeMapping;
  pluginMap: AttributeMapping;
  _pluginAttributeMetadata: PluginAttributeMetadata;
  _pluginAttributes: PluginAttributes;
}

export interface ActionContext {
  passphrase?: string;
  bcryptRounds?: number;
  separator?: string;
  precision?: number;
  decimals?: number;
  bitCount?: number | null;
  [key: string]: unknown;
}

interface MappingResult {
  mapping: AttributeMapping;
  reversedMapping: AttributeMapping;
}

/**
 * Schema Registry - Persistent attribute index mapping (Protocol Buffers style).
 * Prevents data corruption when adding/removing attributes by assigning
 * permanent indices that never change once assigned.
 */
export interface SchemaRegistry {
  /** Next available index for new attributes */
  nextIndex: number;
  /** Permanent mapping of attribute path to numeric index */
  mapping: Record<string, number>;
  /** Indices that were used but attribute was removed - never reused */
  burned: Array<{
    index: number;
    attribute: string;
    burnedAt: string;
    reason?: string;
  }>;
}

/**
 * Plugin Schema Registry - Stores actual key strings for plugin attributes.
 * Unlike user attributes (which use numeric indices → base62), plugin attributes
 * use SHA256 hash-based keys that must be preserved exactly.
 */
export interface PluginSchemaRegistry {
  /** Permanent mapping of attribute name to full key string (e.g., "_createdAt" → "p1a2") */
  mapping: Record<string, string>;
  /** Keys that were used but attribute was removed - never reused */
  burned: Array<{
    key: string;
    attribute: string;
    burnedAt: string;
    reason?: string;
  }>;
}

interface MappingFromRegistryResult extends MappingResult {
  registry: SchemaRegistry;
  changed: boolean;
}

interface PluginMappingFromRegistryResult extends MappingResult {
  registries: Record<string, PluginSchemaRegistry>;
  changed: boolean;
}

interface PluginAttributeInfo {
  key: string;
  pluginName: string;
}

type ValidatorFunction = (data: Record<string, unknown>) => Promise<true | Record<string, unknown>[]> | true | Record<string, unknown>[];

function generateBase62Mapping(keys: string[]): MappingResult {
  const mapping: AttributeMapping = {};
  const reversedMapping: AttributeMapping = {};
  keys.forEach((key, index) => {
    const base62Key = toBase62(index);
    mapping[key] = base62Key;
    reversedMapping[base62Key] = key;
  });
  return { mapping, reversedMapping };
}

function generatePluginAttributeHash(pluginName: string, attributeName: string): string {
  const input = `${pluginName}:${attributeName}`;
  const hash = createHash('sha256').update(input).digest();
  const num = hash.readUInt32BE(0);
  const base62Hash = toBase62(num);
  const paddedHash = base62Hash.padStart(3, '0').substring(0, 3);
  return 'p' + paddedHash.toLowerCase();
}

function generateLegacyPluginIndexKey(pluginName: string, index: number): string {
  const prefix = pluginName.substring(0, 2);
  return `p${prefix}${toBase62(index)}`;
}

function generatePluginMapping(attributes: PluginAttributeInfo[]): MappingResult {
  const mapping: AttributeMapping = {};
  const reversedMapping: AttributeMapping = {};
  const usedHashes = new Set<string>();

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

/**
 * Generate attribute mapping from a persistent registry.
 * This ensures indices are stable across schema changes - new attributes
 * always get the next available index, existing attributes keep their index.
 */
function generateMappingFromRegistry(
  keys: string[],
  existingRegistry?: SchemaRegistry
): MappingFromRegistryResult {
  const now = new Date().toISOString();
  const registry: SchemaRegistry = existingRegistry
    ? {
        nextIndex: existingRegistry.nextIndex,
        mapping: { ...existingRegistry.mapping },
        burned: [...existingRegistry.burned]
      }
    : { nextIndex: 0, mapping: {}, burned: [] };

  const mapping: AttributeMapping = {};
  const reversedMapping: AttributeMapping = {};
  let changed = false;

  const mappedIndices = Object.values(registry.mapping).filter((value): value is number => Number.isFinite(value));
  const burnedIndices = registry.burned.map(burned => burned.index).filter((value): value is number => Number.isFinite(value));
  const maxIndex = Math.max(-1, ...mappedIndices, ...burnedIndices);
  if (registry.nextIndex <= maxIndex) {
    registry.nextIndex = maxIndex + 1;
    changed = true;
  }

  for (const key of keys) {
    if (key in registry.mapping && registry.mapping[key] !== undefined) {
      const index = registry.mapping[key]!;
      const base62Key = toBase62(index);
      mapping[key] = base62Key;
      reversedMapping[base62Key] = key;
    } else {
      const index = registry.nextIndex++;
      registry.mapping[key] = index;
      const base62Key = toBase62(index);
      mapping[key] = base62Key;
      reversedMapping[base62Key] = key;
      changed = true;
    }
  }

  const currentKeys = new Set(keys);
  for (const [attr, index] of Object.entries(registry.mapping)) {
    if (!currentKeys.has(attr)) {
      const alreadyBurned = registry.burned.some(b => b.index === index);
      if (!alreadyBurned) {
        registry.burned.push({
          index,
          attribute: attr,
          burnedAt: now,
          reason: 'removed'
        });
        changed = true;
      }
      delete registry.mapping[attr];
    }
  }

  return { mapping, reversedMapping, registry, changed };
}

/**
 * Generate plugin attribute mapping from a persistent registry.
 * Stores actual key strings (hash-based) to preserve compatibility with legacy data.
 */
function generatePluginMappingFromRegistry(
  attributes: PluginAttributeInfo[],
  existingRegistries?: Record<string, PluginSchemaRegistry | SchemaRegistry>
): PluginMappingFromRegistryResult {
  const now = new Date().toISOString();
  const registries: Record<string, PluginSchemaRegistry> = {};
  const mapping: AttributeMapping = {};
  const reversedMapping: AttributeMapping = {};
  let changed = false;

  const byPlugin = new Map<string, string[]>();
  for (const { key, pluginName } of attributes) {
    if (!byPlugin.has(pluginName)) byPlugin.set(pluginName, []);
    byPlugin.get(pluginName)!.push(key);
  }

  const globalUsedKeys = new Set<string>();

  for (const [pluginName, keys] of byPlugin) {
    const existing = existingRegistries?.[pluginName];
    const registry: PluginSchemaRegistry = { mapping: {}, burned: [] };

    if (existing) {
      if (isLegacyNumericRegistry(existing)) {
        for (const [attr, index] of Object.entries(existing.mapping)) {
          const legacyKey = generateLegacyPluginIndexKey(pluginName, index);
          registry.mapping[attr] = legacyKey;
          globalUsedKeys.add(legacyKey);
        }
        for (const burned of existing.burned) {
          const legacyKey = generateLegacyPluginIndexKey(pluginName, burned.index);
          registry.burned.push({
            key: legacyKey,
            attribute: burned.attribute,
            burnedAt: burned.burnedAt,
            reason: burned.reason
          });
          globalUsedKeys.add(legacyKey);
        }
        changed = true;
      } else {
        registry.mapping = { ...existing.mapping };
        registry.burned = [...existing.burned];
        for (const key of Object.values(existing.mapping)) {
          globalUsedKeys.add(key);
        }
        for (const burned of existing.burned) {
          globalUsedKeys.add(burned.key);
        }
      }
    }

    for (const attrName of keys) {
      const existingKey = registry.mapping[attrName];
      if (existingKey) {
        mapping[attrName] = existingKey;
        reversedMapping[existingKey] = attrName;
      } else {
        let hashKey = generatePluginAttributeHash(pluginName, attrName);
        let counter = 1;
        while (globalUsedKeys.has(hashKey)) {
          hashKey = `${generatePluginAttributeHash(pluginName, attrName)}${counter}`;
          counter++;
        }
        globalUsedKeys.add(hashKey);
        registry.mapping[attrName] = hashKey;
        mapping[attrName] = hashKey;
        reversedMapping[hashKey] = attrName;
        changed = true;
      }
    }

    const currentKeys = new Set(keys);
    for (const [attr, key] of Object.entries(registry.mapping)) {
      if (!currentKeys.has(attr)) {
        const alreadyBurned = registry.burned.some(b => b.key === key);
        if (!alreadyBurned) {
          registry.burned.push({
            key,
            attribute: attr,
            burnedAt: now,
            reason: 'removed'
          });
          changed = true;
        }
        delete registry.mapping[attr];
      }
    }

    registries[pluginName] = registry;
  }

  return { mapping, reversedMapping, registries, changed };
}

function isLegacyNumericRegistry(registry: PluginSchemaRegistry | SchemaRegistry): registry is SchemaRegistry {
  if ('nextIndex' in registry) return true;
  const values = Object.values(registry.mapping);
  if (values.length === 0) return false;
  return typeof values[0] === 'number';
}

export const SchemaActions = {
  trim: (value: unknown): unknown => value == null ? value : String(value).trim(),

  encrypt: async (value: unknown, { passphrase }: ActionContext): Promise<unknown> => {
    if (value === null || value === undefined) return value;
    const [ok, , res] = await tryFn(() => encrypt(value as string, passphrase!));
    return ok ? res : value;
  },

  decrypt: async (value: unknown, { passphrase }: ActionContext): Promise<unknown> => {
    if (value === null || value === undefined) return value;
    const [ok, , raw] = await tryFn<string>(() => decrypt(value as string, passphrase!) as Promise<string>);
    if (!ok) return value;
    if (raw === 'null') return null;
    if (raw === 'undefined') return undefined;
    return raw;
  },

  hashPassword: async (value: unknown, { bcryptRounds = 10 }: ActionContext): Promise<unknown> => {
    if (value === null || value === undefined) return value;
    const [okHash, , hash] = await tryFn<string>(() => hashPassword(String(value), bcryptRounds) as Promise<string>);
    if (!okHash) return value;
    const [okCompact, , compacted] = tryFnSync(() => compactHash(hash!));
    return okCompact ? compacted : hash;
  },

  toString: (value: unknown): unknown => value == null ? value : String(value),

  fromArray: (value: unknown, { separator }: ActionContext): unknown => {
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

  toArray: (value: unknown, { separator }: ActionContext): unknown => {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value === '') {
      return [];
    }
    const items: string[] = [];
    let current = '';
    let i = 0;
    const str = String(value);
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
    return items;
  },

  toJSON: (value: unknown): unknown => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
      const [ok, , parsed] = tryFnSync(() => JSON.parse(value));
      if (ok && typeof parsed === 'object') return value;
      return value;
    }
    const [ok, , json] = tryFnSync(() => JSON.stringify(value));
    return ok ? json : value;
  },

  fromJSON: (value: unknown): unknown => {
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    if (value === '') return '';
    const [ok, , parsed] = tryFnSync(() => JSON.parse(value));
    return ok ? parsed : value;
  },

  toNumber: (value: unknown): unknown => isString(value) ? (value as string).includes('.') ? parseFloat(value as string) : parseInt(value as string) : value,

  toBool: (value: unknown): boolean => [true, 1, 'true', '1', 'yes', 'y'].includes(value as string | number | boolean),
  fromBool: (value: unknown): string => [true, 1, 'true', '1', 'yes', 'y'].includes(value as string | number | boolean) ? '1' : '0',

  fromBase62: (value: unknown): unknown => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = fromBase62(value);
      return isNaN(n) ? undefined : n;
    }
    return undefined;
  },

  toBase62: (value: unknown): unknown => {
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

  fromBase62Decimal: (value: unknown): unknown => {
    if (value === null || value === undefined || value === '') return value;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = decodeDecimal(value);
      return isNaN(n) ? undefined : n;
    }
    return undefined;
  },

  toBase62Decimal: (value: unknown): unknown => {
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

  fromArrayOfNumbers: (value: unknown, { separator }: ActionContext): unknown => {
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

  toArrayOfNumbers: (value: unknown, { separator }: ActionContext): unknown => {
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'number' ? v : fromBase62(v as string)));
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value === '') {
      return [];
    }
    const str = String(value);
    const items: string[] = [];
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

  fromArrayOfDecimals: (value: unknown, { separator }: ActionContext): unknown => {
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

  toArrayOfDecimals: (value: unknown, { separator }: ActionContext): unknown => {
    if (Array.isArray(value)) {
      return value.map(v => (typeof v === 'number' ? v : decodeDecimal(v as string)));
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (value === '') {
      return [];
    }
    const str = String(value);
    const items: string[] = [];
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

  fromArrayOfEmbeddings: (value: unknown, { precision = 6 }: ActionContext): unknown => {
    if (value === null || value === undefined || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return '^[]';
    }
    return encodeFixedPointBatch(value as number[], precision);
  },

  toArrayOfEmbeddings: (value: unknown, { separator, precision = 6 }: ActionContext): unknown => {
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

    const items: string[] = [];
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

  encodeIPv4: (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    if (!isValidIPv4(value)) return value;
    const [ok, , encoded] = tryFnSync(() => encodeIPv4(value));
    return ok ? encoded : value;
  },

  decodeIPv4: (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeIPv4(value));
    return ok ? decoded : value;
  },

  encodeIPv6: (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    if (!isValidIPv6(value)) return value;
    const [ok, , encoded] = tryFnSync(() => encodeIPv6(value));
    return ok ? encoded : value;
  },

  decodeIPv6: (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeIPv6(value));
    return ok ? decoded : value;
  },

  encodeBuffer: (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) return value;
    const [ok, , encoded] = tryFnSync(() => encodeBuffer(value as Buffer));
    return ok ? encoded : value;
  },

  decodeBuffer: (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeBuffer(value));
    return ok ? decoded : value;
  },

  encodeBits: (value: unknown, { bitCount = null }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) return value;
    const [ok, , encoded] = tryFnSync(() => encodeBits(value as Buffer, bitCount));
    return ok ? encoded : value;
  },

  decodeBits: (value: unknown, { bitCount = null }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeBits(value, bitCount));
    return ok ? decoded : value;
  },

  encodeMoney: (value: unknown, { decimals = 2 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;

    const multiplier = Math.pow(10, decimals);
    const integerValue = Math.round(value * multiplier);

    const [ok, , encoded] = tryFnSync(() => '$' + toBase62(integerValue));
    return ok ? encoded : value;
  },

  decodeMoney: (value: unknown, { decimals = 2 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    if (!value.startsWith('$')) return value;

    const [ok, , integerValue] = tryFnSync(() => fromBase62(value.slice(1)));
    if (!ok || isNaN(integerValue)) return value;

    const divisor = Math.pow(10, decimals);
    return integerValue / divisor;
  },

  encodeDecimalFixed: (value: unknown, { precision = 2 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;
    const [ok, , encoded] = tryFnSync(() => encodeFixedPoint(value, precision));
    return ok ? encoded : value;
  },

  decodeDecimalFixed: (value: unknown, { precision = 2 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeFixedPoint(value, precision));
    return ok ? decoded : value;
  },

  encodeGeoLatitude: (value: unknown, { precision = 6 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;
    const [ok, , encoded] = tryFnSync(() => encodeGeoLat(value, precision));
    return ok ? encoded : value;
  },

  decodeGeoLatitude: (value: unknown, { precision = 6 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeGeoLat(value, precision));
    return ok ? decoded : value;
  },

  encodeGeoLongitude: (value: unknown, { precision = 6 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'number') return value;
    const [ok, , encoded] = tryFnSync(() => encodeGeoLon(value, precision));
    return ok ? encoded : value;
  },

  decodeGeoLongitude: (value: unknown, { precision = 6 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeGeoLon(value, precision));
    return ok ? decoded : value;
  },

  encodeGeoPointPair: (value: unknown, { precision = 6 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value) && value.length === 2) {
      const [ok, , encoded] = tryFnSync(() => encodeGeoPoint(value[0] as number, value[1] as number, precision));
      return ok ? encoded : value;
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (obj.lat !== undefined && obj.lon !== undefined) {
        const [ok, , encoded] = tryFnSync(() => encodeGeoPoint(obj.lat as number, obj.lon as number, precision));
        return ok ? encoded : value;
      }
      if (obj.latitude !== undefined && obj.longitude !== undefined) {
        const [ok, , encoded] = tryFnSync(() => encodeGeoPoint(obj.latitude as number, obj.longitude as number, precision));
        return ok ? encoded : value;
      }
    }
    return value;
  },

  decodeGeoPointPair: (value: unknown, { precision = 6 }: ActionContext = {}): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    const [ok, , decoded] = tryFnSync(() => decodeGeoPoint(value, precision));
    return ok ? decoded : value;
  },
};

export class Schema {
  name: string;
  version: number;
  attributes: SchemaAttributes;
  passphrase: string;
  bcryptRounds: number;
  options: SchemaOptions;
  allNestedObjectsOptional: boolean;
  _pluginAttributeMetadata: PluginAttributeMetadata;
  _pluginAttributes: PluginAttributes;
  _schemaFingerprint: string;
  validator: ValidatorFunction;
  map!: AttributeMapping;
  reversedMap!: AttributeMapping;
  pluginMap!: AttributeMapping;
  reversedPluginMap!: AttributeMapping;
  /** Updated schema registry - should be persisted to s3db.json */
  _schemaRegistry?: SchemaRegistry;
  /** Updated plugin schema registries - should be persisted to s3db.json */
  _pluginSchemaRegistry?: Record<string, PluginSchemaRegistry>;
  /** Whether the registry was modified and needs persistence */
  _registryChanged: boolean = false;

  constructor(args: SchemaConstructorArgs) {
    const {
      map,
      pluginMap,
      name,
      attributes,
      passphrase,
      bcryptRounds,
      version = 1,
      options = {},
      _pluginAttributeMetadata,
      _pluginAttributes,
      schemaRegistry,
      pluginSchemaRegistry
    } = args;

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
      this.validator = cachedValidator as ValidatorFunction;
    } else {
      this.validator = new ValidatorManager({
        autoEncrypt: false,
        passphrase: this.passphrase,
        bcryptRounds: this.bcryptRounds
      }).compile(merge(
        { $$async: true, $$strict: false },
        processedAttributes,
      )) as ValidatorFunction;

      cacheValidator(this._schemaFingerprint, this.validator);
    }

    if (this.options.generateAutoHooks) this.generateAutoHooks();

    const flatAttrs = flatten(this.attributes, { safe: true });
    const leafKeys = Object.keys(flatAttrs).filter(k => !k.includes('$$'));

    const objectKeys = this.extractObjectKeys(this.attributes);
    const allKeys = [...new Set([...leafKeys, ...objectKeys])];

    const userKeys: string[] = [];
    const pluginAttributes: PluginAttributeInfo[] = [];

    for (const key of allKeys) {
      const attrDef = this.getAttributeDefinition(key);
      if (typeof attrDef === 'object' && attrDef !== null && (attrDef as Record<string, unknown>).__plugin__) {
        pluginAttributes.push({ key, pluginName: (attrDef as Record<string, unknown>).__plugin__ as string });
      } else if (typeof attrDef === 'string' && this._pluginAttributeMetadata && this._pluginAttributeMetadata[key]) {
        const pluginName = this._pluginAttributeMetadata[key].__plugin__;
        pluginAttributes.push({ key, pluginName });
      } else {
        userKeys.push(key);
      }
    }

    if (!isEmpty(map)) {
      this.map = { ...map };
      this.reversedMap = invert(this.map);

      if (schemaRegistry) {
        const registryFromMap = this._buildRegistryFromMap(map, schemaRegistry);
        const result = generateMappingFromRegistry(userKeys, registryFromMap);
        for (const key of userKeys) {
          if (!(key in this.map)) {
            const mappedKey = result.mapping[key];
            if (mappedKey) {
              this.map[key] = mappedKey;
              this.reversedMap[mappedKey] = key;
            }
          }
        }
        this._schemaRegistry = result.registry;
        if (result.changed) this._registryChanged = true;
      }
    } else {
      if (schemaRegistry) {
        const result = generateMappingFromRegistry(userKeys, schemaRegistry);
        this.map = result.mapping;
        this.reversedMap = result.reversedMapping;
        this._schemaRegistry = result.registry;
        if (result.changed) this._registryChanged = true;
      } else {
        const { mapping, reversedMapping } = generateBase62Mapping(userKeys);
        this.map = mapping;
        this.reversedMap = reversedMapping;
      }
    }

    if (pluginSchemaRegistry) {
      const result = generatePluginMappingFromRegistry(pluginAttributes, pluginSchemaRegistry);
      this.pluginMap = result.mapping;
      this.reversedPluginMap = result.reversedMapping;
      this._pluginSchemaRegistry = result.registries;
      if (result.changed) this._registryChanged = true;
    } else {
      const { mapping: pMapping, reversedMapping: pReversedMapping } = generatePluginMapping(pluginAttributes);
      this.pluginMap = pMapping;
      this.reversedPluginMap = pReversedMapping;
    }

    this._pluginAttributes = {};
    for (const { key, pluginName } of pluginAttributes) {
      if (!this._pluginAttributes[pluginName]) {
        this._pluginAttributes[pluginName] = [];
      }
      this._pluginAttributes[pluginName].push(key);
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

  defaultOptions(): SchemaOptions {
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

  private _buildRegistryFromMap(legacyMap: AttributeMapping, existingRegistry?: SchemaRegistry): SchemaRegistry {
    const registry: SchemaRegistry = {
      nextIndex: existingRegistry?.nextIndex ?? 0,
      mapping: { ...existingRegistry?.mapping },
      burned: existingRegistry?.burned ? [...existingRegistry.burned] : []
    };

    let maxIndex = registry.nextIndex - 1;
    for (const [attr, base62Key] of Object.entries(legacyMap)) {
      const index = fromBase62(base62Key);
      if (!(attr in registry.mapping)) {
        registry.mapping[attr] = index;
      }
      if (Number.isFinite(index)) {
        maxIndex = Math.max(maxIndex, index);
      }
    }

    for (const burned of registry.burned) {
      maxIndex = Math.max(maxIndex, burned.index);
    }

    registry.nextIndex = Math.max(registry.nextIndex, maxIndex + 1);
    return registry;
  }

  /**
   * Generate initial schema registry from current mapping.
   * Used for migrating existing databases that don't have a registry yet.
   * This "freezes" the current mapping as the source of truth.
   */
  generateInitialRegistry(): { schemaRegistry: SchemaRegistry; pluginSchemaRegistry: Record<string, PluginSchemaRegistry> } {
    const schemaRegistry: SchemaRegistry = {
      nextIndex: 0,
      mapping: {},
      burned: []
    };

    let maxIndex = -1;
    for (const [attr, base62Key] of Object.entries(this.map)) {
      const index = fromBase62(base62Key);
      schemaRegistry.mapping[attr] = index;
      if (Number.isFinite(index)) {
        maxIndex = Math.max(maxIndex, index);
      }
    }
    schemaRegistry.nextIndex = maxIndex + 1;

    const pluginSchemaRegistry: Record<string, PluginSchemaRegistry> = {};
    for (const [pluginName, attrs] of Object.entries(this._pluginAttributes)) {
      const registry: PluginSchemaRegistry = {
        mapping: {},
        burned: []
      };
      for (const attr of attrs) {
        const key = this.pluginMap[attr];
        if (key) {
          registry.mapping[attr] = key;
        }
      }
      pluginSchemaRegistry[pluginName] = registry;
    }

    return { schemaRegistry, pluginSchemaRegistry };
  }

  /**
   * Check if the schema registry needs to be persisted.
   */
  needsRegistryPersistence(): boolean {
    return this._registryChanged;
  }

  /**
   * Get the updated schema registry for persistence.
   */
  getSchemaRegistry(): SchemaRegistry | undefined {
    return this._schemaRegistry;
  }

  /**
   * Get the updated plugin schema registries for persistence.
   */
  getPluginSchemaRegistry(): Record<string, PluginSchemaRegistry> | undefined {
    return this._pluginSchemaRegistry;
  }

  addHook(hook: keyof SchemaHooks, attribute: string, action: string, params: Record<string, unknown> = {}): void {
    if (!this.options.hooks![hook][attribute]) this.options.hooks![hook][attribute] = [];
    const hookEntry: string | HookEntry = Object.keys(params).length > 0 ? { action, params } : action;
    this.options.hooks![hook][attribute] = uniq([...this.options.hooks![hook][attribute], hookEntry]);
  }

  extractObjectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const objectKeys: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$$')) continue;

      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        objectKeys.push(fullKey);

        if ((value as Record<string, unknown>).$$type === 'object') {
          objectKeys.push(...this.extractObjectKeys(value as Record<string, unknown>, fullKey));
        }
      }
    }

    return objectKeys;
  }

  _generateHooksFromOriginalAttributes(attributes: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('$$')) continue;

      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (typeof value === 'object' && value !== null && !Array.isArray(value) && (value as Record<string, unknown>).type) {
        const typedValue = value as Record<string, unknown>;
        if (typedValue.type === 'array' && typedValue.items) {
          const itemsType = typedValue.items;
          const arrayLength = typeof typedValue.length === 'number' ? typedValue.length : null;

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
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value as Record<string, unknown>).type) {
        this._generateHooksFromOriginalAttributes(value as Record<string, unknown>, fullKey);
      }
    }
  }

  generateAutoHooks(): void {
    this._generateHooksFromOriginalAttributes(this.attributes);

    const schema = flatten(cloneDeep(this.attributes), { safe: true });

    for (const [name, definition] of Object.entries(schema)) {
      if (name.includes('$$')) continue;

      if (this.options.hooks!.beforeMap[name] || this.options.hooks!.afterUnmap[name]) {
        continue;
      }

      const defStr = typeof definition === 'string' ? definition : '';
      const defType = typeof definition === 'object' && definition !== null ? (definition as Record<string, unknown>).type as string | null : null;

      const isEmbeddingType = defStr.includes("embedding") || defType === 'embedding';

      if (isEmbeddingType) {
        this.addHook("beforeMap", name, "fromArrayOfEmbeddings");
        this.addHook("afterUnmap", name, "toArrayOfEmbeddings");
        continue;
      }

      const isArray = defStr.includes("array") || defType === 'array';

      if (isArray) {
        let itemsType: string | null = null;
        if (typeof definition === 'object' && definition !== null && (definition as Record<string, unknown>).items) {
          itemsType = (definition as Record<string, unknown>).items as string;
        } else if (defStr.includes('items:string')) {
          itemsType = 'string';
        } else if (defStr.includes('items:number')) {
          itemsType = 'number';
        }

        if (itemsType === 'string' || (typeof itemsType === 'string' && itemsType.includes('string'))) {
          this.addHook("beforeMap", name, "fromArray");
          this.addHook("afterUnmap", name, "toArray");
        } else if (itemsType === 'number' || (typeof itemsType === 'string' && itemsType.includes('number'))) {
          const isIntegerArray = defStr.includes("integer:true") ||
                                defStr.includes("|integer:") ||
                                defStr.includes("|integer") ||
                                (typeof itemsType === 'string' && itemsType.includes('integer'));

          let arrayLength: number | null = null;
          if (typeof definition === 'object' && definition !== null && typeof (definition as Record<string, unknown>).length === 'number') {
            arrayLength = (definition as Record<string, unknown>).length as number;
          } else if (defStr.includes('length:')) {
            const match = defStr.match(/length:(\d+)/);
            if (match) arrayLength = parseInt(match[1]!, 10);
          }

          const isEmbedding = !isIntegerArray && arrayLength !== null && arrayLength >= 256;

          if (isIntegerArray) {
            this.addHook("beforeMap", name, "fromArrayOfNumbers");
            this.addHook("afterUnmap", name, "toArrayOfNumbers");
          } else if (isEmbedding) {
            this.addHook("beforeMap", name, "fromArrayOfEmbeddings");
            this.addHook("afterUnmap", name, "toArrayOfEmbeddings");
          } else {
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
        let bitCount: number | null = null;
        const bitsMatch = defStr.match(/bits:(\d+)/);
        if (bitsMatch) {
          bitCount = parseInt(bitsMatch[1]!, 10);
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
          decimals = parseInt(decimalsMatch[1]!, 10);
        }

        this.addHook("beforeMap", name, "encodeMoney", { decimals });
        this.addHook("afterUnmap", name, "decodeMoney", { decimals });
        continue;
      }

      if (defStr.includes("decimal") || defType === 'decimal') {
        let precision = 2;
        const precisionMatch = defStr.match(/decimal:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1]!, 10);
        }

        this.addHook("beforeMap", name, "encodeDecimalFixed", { precision });
        this.addHook("afterUnmap", name, "decodeDecimalFixed", { precision });
        continue;
      }

      if (defStr.includes("geo:lat") || (defType === 'geo' && defStr.includes('lat'))) {
        let precision = 6;
        const precisionMatch = defStr.match(/geo:lat:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1]!, 10);
        }

        this.addHook("beforeMap", name, "encodeGeoLatitude", { precision });
        this.addHook("afterUnmap", name, "decodeGeoLatitude", { precision });
        continue;
      }

      if (defStr.includes("geo:lon") || (defType === 'geo' && defStr.includes('lon'))) {
        let precision = 6;
        const precisionMatch = defStr.match(/geo:lon:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1]!, 10);
        }

        this.addHook("beforeMap", name, "encodeGeoLongitude", { precision });
        this.addHook("afterUnmap", name, "decodeGeoLongitude", { precision });
        continue;
      }

      if (defStr.includes("geo:point") || defType === 'geo:point') {
        let precision = 6;
        const precisionMatch = defStr.match(/geo:point:(\d+)/);
        if (precisionMatch) {
          precision = parseInt(precisionMatch[1]!, 10);
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
        } else {
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

  static import(data: string | SchemaExport): Schema {
    let {
      map,
      pluginMap,
      _pluginAttributeMetadata,
      name,
      options,
      version,
      attributes
    } = isString(data) ? JSON.parse(data as string) : data;

    const [ok, err, attrs] = tryFnSync(() => Schema._importAttributes(attributes));
    if (!ok) throw new SchemaError('Failed to import schema attributes', { original: err, input: attributes });
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

  static _importAttributes(attrs: unknown): unknown {
    if (typeof attrs === 'string') {
      const [ok, , parsed] = tryFnSync(() => JSON.parse(attrs));
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
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(attrs)) {
        const [okObj, errObj, val] = tryFnSync(() => Schema._importAttributes(v));
        if (!okObj) throw new SchemaError('Failed to import object schema attribute', { original: errObj, key: k, input: v });
        out[k] = val;
      }
      return out;
    }
    return attrs;
  }

  export(): SchemaExport {
    const data: SchemaExport = {
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

  _exportAttributes(attrs: unknown): SchemaAttributes {
    if (typeof attrs === 'string') {
      return attrs as unknown as SchemaAttributes;
    }
    if (Array.isArray(attrs)) {
      return attrs.map(a => this._exportAttributes(a)) as unknown as SchemaAttributes;
    }
    if (typeof attrs === 'object' && attrs !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(attrs)) {
        out[k] = this._exportAttributes(v);
      }
      return out as SchemaAttributes;
    }
    return attrs as SchemaAttributes;
  }

  async applyHooksActions(resourceItem: Record<string, unknown>, hook: keyof SchemaHooks): Promise<Record<string, unknown>> {
    const cloned = cloneDeep(resourceItem);
    for (const [attribute, actions] of Object.entries(this.options.hooks![hook])) {
      for (const actionEntry of actions) {
        const actionName = typeof actionEntry === 'string' ? actionEntry : actionEntry.action;
        const actionParams = typeof actionEntry === 'object' ? actionEntry.params : {};

        const value = get(cloned, attribute);
        const actionFn = (SchemaActions as Record<string, ((value: unknown, ctx: ActionContext) => unknown | Promise<unknown>) | undefined>)[actionName];
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

  async mapper(resourceItem: Record<string, unknown>): Promise<Record<string, unknown>> {
    let obj = cloneDeep(resourceItem);
    obj = await this.applyHooksActions(obj, "beforeMap");
    const flattenedObj = flatten(obj, { safe: true });
    const rest: Record<string, unknown> = { '_v': this.version + '' };

    for (const [key, value] of Object.entries(flattenedObj)) {
      const mappedKey = this.pluginMap[key] || this.map[key] || key;
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

  async unmapper(
    mappedResourceItem: Record<string, unknown>,
    mapOverride?: AttributeMapping,
    pluginMapOverride?: AttributeMapping
  ): Promise<Record<string, unknown>> {
    let obj = cloneDeep(mappedResourceItem);
    delete obj._v;
    obj = await this.applyHooksActions(obj, "beforeUnmap");
    const reversedMap = mapOverride ? invert(mapOverride) : this.reversedMap;
    const reversedPluginMap = pluginMapOverride ? invert(pluginMapOverride) : this.reversedPluginMap;
    const rest: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      let originalKey = reversedPluginMap[key] || reversedMap[key] || key;

      if (!originalKey) {
        originalKey = key;
      }

      let parsedValue: unknown = value;
      const attrDef = this.getAttributeDefinition(originalKey);
      const hasAfterUnmapHook = this.options.hooks?.afterUnmap?.[originalKey];

      if (!hasAfterUnmapHook && typeof attrDef === 'string' && attrDef.includes('number') && !attrDef.includes('array') && !attrDef.includes('decimal')) {
        if (typeof parsedValue === 'string' && parsedValue !== '') {
          parsedValue = fromBase62(parsedValue);
        } else if (typeof parsedValue === 'number') {
          // Already a number
        } else {
          parsedValue = undefined;
        }
      } else if (typeof value === 'string') {
        if (value === '[object Object]') {
          parsedValue = {};
        } else if (value.startsWith('{') || value.startsWith('[')) {
          const [ok, , parsed] = tryFnSync(() => JSON.parse(value));
          if (ok) parsedValue = parsed;
        }
      }

      if (this.attributes) {
        if (typeof attrDef === 'string' && attrDef.includes('array')) {
          if (!hasAfterUnmapHook) {
            if (Array.isArray(parsedValue)) {
              // Already an array
            } else if (typeof parsedValue === 'string' && parsedValue.trim().startsWith('[')) {
              const [okArr, , arr] = tryFnSync(() => JSON.parse(parsedValue as string));
              if (okArr && Array.isArray(arr)) {
                parsedValue = arr;
              }
            } else {
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

          const actionFn = (SchemaActions as Record<string, (value: unknown, ctx: ActionContext) => unknown | Promise<unknown>>)[actionName];
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

  getAttributeDefinition(key: string): unknown {
    const parts = key.split('.');
    let def: unknown = this.attributes;
    for (const part of parts) {
      if (!def) return undefined;
      def = (def as Record<string, unknown>)[part];
    }
    return def;
  }

  regeneratePluginMapping(): void {
    const flatAttrs = flatten(this.attributes, { safe: true });
    const leafKeys = Object.keys(flatAttrs).filter(k => !k.includes('$$'));

    const objectKeys = this.extractObjectKeys(this.attributes);
    const allKeys = [...new Set([...leafKeys, ...objectKeys])];

    const pluginAttributes: PluginAttributeInfo[] = [];
    for (const key of allKeys) {
      const attrDef = this.getAttributeDefinition(key);
      if (typeof attrDef === 'object' && attrDef !== null && (attrDef as Record<string, unknown>).__plugin__) {
        pluginAttributes.push({ key, pluginName: (attrDef as Record<string, unknown>).__plugin__ as string });
      } else if (typeof attrDef === 'string' && this._pluginAttributeMetadata && this._pluginAttributeMetadata[key]) {
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

  preprocessAttributesForValidation(attributes: SchemaAttributes): Record<string, unknown> {
    const processed: Record<string, unknown> = {};

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
          if (!hasMin) validation += '|min:-90';
          if (!hasMax) validation += '|max:90';
          processed[key] = validation + rest;
          continue;
        }
        if (value.startsWith('geo:lon')) {
          const rest = value.replace(/^geo:lon(:\d+)?/, '');
          const hasMin = rest.includes('min:');
          const hasMax = rest.includes('max:');
          let validation = 'number';
          if (!hasMin) validation += '|min:-180';
          if (!hasMax) validation += '|max:180';
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
          const config: Record<string, unknown> = { type: baseType };

          for (let i = 1; i < parts.length; i++) {
            const part = parts[i]!;
            if (part === 'optional') {
              config.optional = true;
            } else if (part === 'required') {
              // required is default
            } else if (part.includes(':')) {
              const [modifier, val] = part.split(':');
              if (val === 'true') {
                config[modifier!] = true;
              } else if (val === 'false') {
                config[modifier!] = false;
              } else {
                const numVal = Number(val);
                config[modifier!] = Number.isNaN(numVal) ? val : numVal;
              }
            } else {
              config[part] = true;
            }
          }
          processed[key] = config;
          continue;
        }
        processed[key] = value;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const validatorTypes = ['string', 'number', 'boolean', 'any', 'object', 'array', 'date', 'email', 'url', 'uuid', 'enum', 'custom', 'ip4', 'ip6', 'buffer', 'bits', 'money', 'crypto', 'decimal', 'geo:lat', 'geo:lon', 'geo:point', 'geo-lat', 'geo-lon', 'geo-point', 'secret', 'password', 'embedding'];
        const typeValue = (value as Record<string, unknown>).type as string | undefined;
        const isValidValidatorType = typeof typeValue === 'string' &&
          !typeValue.includes('|') &&
          (validatorTypes.includes(typeValue) || typeValue.startsWith('bits:') || typeValue.startsWith('embedding:'));
        const hasValidatorType = isValidValidatorType && key !== '$$type';

        if (hasValidatorType) {
          const { __plugin__, __pluginCreated__, ...cleanValue } = value as Record<string, unknown>;

          if (cleanValue.type === 'ip4') {
            processed[key] = { ...cleanValue, type: 'string' };
          } else if (cleanValue.type === 'ip6') {
            processed[key] = { ...cleanValue, type: 'string' };
          } else if (cleanValue.type === 'buffer') {
            processed[key] = { ...cleanValue, type: 'any' };
          } else if (cleanValue.type === 'bits' || (cleanValue.type as string)?.startsWith('bits:')) {
            processed[key] = { ...cleanValue, type: 'any' };
          } else if (cleanValue.type === 'money' || cleanValue.type === 'crypto') {
            processed[key] = { ...cleanValue, type: 'number', min: cleanValue.min !== undefined ? cleanValue.min : 0 };
          } else if (cleanValue.type === 'decimal') {
            processed[key] = { ...cleanValue, type: 'number' };
          } else if (cleanValue.type === 'geo:lat' || cleanValue.type === 'geo-lat') {
            processed[key] = {
              ...cleanValue,
              type: 'number',
              min: cleanValue.min !== undefined ? cleanValue.min : -90,
              max: cleanValue.max !== undefined ? cleanValue.max : 90
            };
          } else if (cleanValue.type === 'geo:lon' || cleanValue.type === 'geo-lon') {
            processed[key] = {
              ...cleanValue,
              type: 'number',
              min: cleanValue.min !== undefined ? cleanValue.min : -180,
              max: cleanValue.max !== undefined ? cleanValue.max : 180
            };
          } else if (cleanValue.type === 'geo:point' || cleanValue.type === 'geo-point') {
            processed[key] = { ...cleanValue, type: 'any' };
          } else if (cleanValue.type === 'object' && cleanValue.properties) {
            processed[key] = {
              ...cleanValue,
              properties: this.preprocessAttributesForValidation(cleanValue.properties as SchemaAttributes)
            };
          } else if (cleanValue.type === 'object' && cleanValue.props) {
            processed[key] = {
              ...cleanValue,
              props: this.preprocessAttributesForValidation(cleanValue.props as SchemaAttributes)
            };
          } else {
            processed[key] = cleanValue;
          }
        } else {
          const isExplicitRequired = (value as Record<string, unknown>).$$type && ((value as Record<string, unknown>).$$type as string).includes('required');
          const isExplicitOptional = (value as Record<string, unknown>).$$type && ((value as Record<string, unknown>).$$type as string).includes('optional');
          const objectConfig: Record<string, unknown> = {
            type: 'object',
            props: this.preprocessAttributesForValidation(value as SchemaAttributes),
            strict: false
          };
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

  dispose(): void {
    if (this._schemaFingerprint) {
      releaseValidator(this._schemaFingerprint);
    }
  }

  static getValidatorCacheStats(): ReturnType<typeof getCacheStats> {
    return getCacheStats();
  }

  static getValidatorCacheMemoryUsage(): ReturnType<typeof getCacheMemoryUsage> {
    return getCacheMemoryUsage();
  }

  static evictUnusedValidators(maxAgeMs?: number): number {
    return evictUnusedValidators(maxAgeMs);
  }
}

export default Schema;
