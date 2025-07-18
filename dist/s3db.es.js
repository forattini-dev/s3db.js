import { customAlphabet, urlAlphabet } from 'nanoid';
import zlib from 'zlib';
import { PromisePool } from '@supercharge/promise-pool';
import { ReadableStream } from 'node:stream/web';
import { chunk, merge, isString as isString$1, isEmpty, invert, uniq, cloneDeep, get, set, isObject as isObject$1, isFunction as isFunction$1, isPlainObject } from 'lodash-es';
import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { flatten, unflatten } from 'flat';
import FastestValidator from 'fastest-validator';

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const base = alphabet.length;
const charToValue = Object.fromEntries([...alphabet].map((c, i) => [c, i]));
const encode = (n) => {
  if (typeof n !== "number" || isNaN(n)) return "undefined";
  if (!isFinite(n)) return "undefined";
  if (n === 0) return alphabet[0];
  if (n < 0) return "-" + encode(-Math.floor(n));
  n = Math.floor(n);
  let s = "";
  while (n) {
    s = alphabet[n % base] + s;
    n = Math.floor(n / base);
  }
  return s;
};
const decode = (s) => {
  if (typeof s !== "string") return NaN;
  if (s === "") return 0;
  let negative = false;
  if (s[0] === "-") {
    negative = true;
    s = s.slice(1);
  }
  let r = 0;
  for (let i = 0; i < s.length; i++) {
    const idx = charToValue[s[i]];
    if (idx === void 0) return NaN;
    r = r * base + idx;
  }
  return negative ? -r : r;
};
const encodeDecimal = (n) => {
  if (typeof n !== "number" || isNaN(n)) return "undefined";
  if (!isFinite(n)) return "undefined";
  const negative = n < 0;
  n = Math.abs(n);
  const [intPart, decPart] = n.toString().split(".");
  const encodedInt = encode(Number(intPart));
  if (decPart) {
    return (negative ? "-" : "") + encodedInt + "." + decPart;
  }
  return (negative ? "-" : "") + encodedInt;
};
const decodeDecimal = (s) => {
  if (typeof s !== "string") return NaN;
  let negative = false;
  if (s[0] === "-") {
    negative = true;
    s = s.slice(1);
  }
  const [intPart, decPart] = s.split(".");
  const decodedInt = decode(intPart);
  if (isNaN(decodedInt)) return NaN;
  const num = decPart ? Number(decodedInt + "." + decPart) : decodedInt;
  return negative ? -num : num;
};

function calculateUTF8Bytes(str) {
  if (typeof str !== "string") {
    str = String(str);
  }
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.codePointAt(i);
    if (codePoint <= 127) {
      bytes += 1;
    } else if (codePoint <= 2047) {
      bytes += 2;
    } else if (codePoint <= 65535) {
      bytes += 3;
    } else if (codePoint <= 1114111) {
      bytes += 4;
      if (codePoint > 65535) {
        i++;
      }
    }
  }
  return bytes;
}
function calculateAttributeNamesSize(mappedObject) {
  let totalSize = 0;
  for (const key of Object.keys(mappedObject)) {
    totalSize += calculateUTF8Bytes(key);
  }
  return totalSize;
}
function transformValue(value) {
  if (value === null || value === void 0) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return value.map((item) => String(item)).join("|");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
function calculateAttributeSizes(mappedObject) {
  const sizes = {};
  for (const [key, value] of Object.entries(mappedObject)) {
    const transformedValue = transformValue(value);
    const byteSize = calculateUTF8Bytes(transformedValue);
    sizes[key] = byteSize;
  }
  return sizes;
}
function calculateTotalSize(mappedObject) {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const valueTotal = Object.values(valueSizes).reduce((total, size) => total + size, 0);
  const namesSize = calculateAttributeNamesSize(mappedObject);
  return valueTotal + namesSize;
}
function getSizeBreakdown(mappedObject) {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const namesSize = calculateAttributeNamesSize(mappedObject);
  const valueTotal = Object.values(valueSizes).reduce((sum, size) => sum + size, 0);
  const total = valueTotal + namesSize;
  const sortedAttributes = Object.entries(valueSizes).sort(([, a], [, b]) => b - a).map(([key, size]) => ({
    attribute: key,
    size,
    percentage: (size / total * 100).toFixed(2) + "%"
  }));
  return {
    total,
    valueSizes,
    namesSize,
    valueTotal,
    breakdown: sortedAttributes,
    // Add detailed breakdown including names
    detailedBreakdown: {
      values: valueTotal,
      names: namesSize,
      total
    }
  };
}
function calculateSystemOverhead(config = {}) {
  const { version = "1", timestamps = false, id = "" } = config;
  const systemFields = {
    "_v": String(version)
    // Version field (e.g., "1", "10", "100")
  };
  if (timestamps) {
    systemFields.createdAt = "2024-01-01T00:00:00.000Z";
    systemFields.updatedAt = "2024-01-01T00:00:00.000Z";
  }
  if (id) {
    systemFields.id = id;
  }
  const overheadObject = {};
  for (const [key, value] of Object.entries(systemFields)) {
    overheadObject[key] = value;
  }
  return calculateTotalSize(overheadObject);
}
function calculateEffectiveLimit(config = {}) {
  const { s3Limit = 2048, systemConfig = {} } = config;
  const overhead = calculateSystemOverhead(systemConfig);
  return s3Limit - overhead;
}

class BaseError extends Error {
  constructor({ verbose, bucket, key, message, code, statusCode, requestId, awsMessage, original, commandName, commandInput, metadata, suggestion, ...rest }) {
    if (verbose) message = message + `

Verbose:

${JSON.stringify(rest, null, 2)}`;
    super(message);
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
    super.name = this.constructor.name;
    this.name = this.constructor.name;
    this.bucket = bucket;
    this.key = key;
    this.thrownAt = /* @__PURE__ */ new Date();
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.awsMessage = awsMessage;
    this.original = original;
    this.commandName = commandName;
    this.commandInput = commandInput;
    this.metadata = metadata;
    this.suggestion = suggestion;
    this.data = { bucket, key, ...rest, verbose, message };
  }
  toJson() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      requestId: this.requestId,
      awsMessage: this.awsMessage,
      bucket: this.bucket,
      key: this.key,
      thrownAt: this.thrownAt,
      commandName: this.commandName,
      commandInput: this.commandInput,
      metadata: this.metadata,
      suggestion: this.suggestion,
      data: this.data,
      original: this.original,
      stack: this.stack
    };
  }
  toString() {
    return `${this.name} | ${this.message}`;
  }
}
class S3dbError extends BaseError {
  constructor(message, details = {}) {
    let code, statusCode, requestId, awsMessage, original, metadata;
    if (details.original) {
      original = details.original;
      code = original.code || original.Code || original.name;
      statusCode = original.statusCode || original.$metadata && original.$metadata.httpStatusCode;
      requestId = original.requestId || original.$metadata && original.$metadata.requestId;
      awsMessage = original.message;
      metadata = original.$metadata ? { ...original.$metadata } : void 0;
    }
    super({ message, ...details, code, statusCode, requestId, awsMessage, original, metadata });
  }
}
class DatabaseError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class ValidationError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class AuthenticationError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class PermissionError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class EncryptionError extends S3dbError {
  constructor(message, details = {}) {
    super(message, details);
    Object.assign(this, details);
  }
}
class ResourceNotFound extends S3dbError {
  constructor({ bucket, resourceName, id, original, ...rest }) {
    if (typeof id !== "string") throw new Error("id must be a string");
    if (typeof bucket !== "string") throw new Error("bucket must be a string");
    if (typeof resourceName !== "string") throw new Error("resourceName must be a string");
    super(`Resource not found: ${resourceName}/${id} [bucket:${bucket}]`, {
      bucket,
      resourceName,
      id,
      original,
      ...rest
    });
  }
}
class NoSuchBucket extends S3dbError {
  constructor({ bucket, original, ...rest }) {
    if (typeof bucket !== "string") throw new Error("bucket must be a string");
    super(`Bucket does not exists [bucket:${bucket}]`, { bucket, original, ...rest });
  }
}
class NoSuchKey extends S3dbError {
  constructor({ bucket, key, resourceName, id, original, ...rest }) {
    if (typeof key !== "string") throw new Error("key must be a string");
    if (typeof bucket !== "string") throw new Error("bucket must be a string");
    if (id !== void 0 && typeof id !== "string") throw new Error("id must be a string");
    super(`No such key: ${key} [bucket:${bucket}]`, { bucket, key, resourceName, id, original, ...rest });
    this.resourceName = resourceName;
    this.id = id;
  }
}
class NotFound extends S3dbError {
  constructor({ bucket, key, resourceName, id, original, ...rest }) {
    if (typeof key !== "string") throw new Error("key must be a string");
    if (typeof bucket !== "string") throw new Error("bucket must be a string");
    super(`Not found: ${key} [bucket:${bucket}]`, { bucket, key, resourceName, id, original, ...rest });
    this.resourceName = resourceName;
    this.id = id;
  }
}
class MissingMetadata extends S3dbError {
  constructor({ bucket, original, ...rest }) {
    if (typeof bucket !== "string") throw new Error("bucket must be a string");
    super(`Missing metadata for bucket [bucket:${bucket}]`, { bucket, original, ...rest });
  }
}
class InvalidResourceItem extends S3dbError {
  constructor({
    bucket,
    resourceName,
    attributes,
    validation,
    message,
    original,
    ...rest
  }) {
    if (typeof bucket !== "string") throw new Error("bucket must be a string");
    if (typeof resourceName !== "string") throw new Error("resourceName must be a string");
    super(
      message || `Validation error: This item is not valid. Resource=${resourceName} [bucket:${bucket}].
${JSON.stringify(validation, null, 2)}`,
      {
        bucket,
        resourceName,
        attributes,
        validation,
        original,
        ...rest
      }
    );
  }
}
class UnknownError extends S3dbError {
}
const ErrorMap = {
  "NotFound": NotFound,
  "NoSuchKey": NoSuchKey,
  "UnknownError": UnknownError,
  "NoSuchBucket": NoSuchBucket,
  "MissingMetadata": MissingMetadata,
  "InvalidResourceItem": InvalidResourceItem
};
function mapAwsError(err, context = {}) {
  const code = err.code || err.Code || err.name;
  const metadata = err.$metadata ? { ...err.$metadata } : void 0;
  const commandName = context.commandName;
  const commandInput = context.commandInput;
  let suggestion;
  if (code === "NoSuchKey" || code === "NotFound") {
    suggestion = "Check if the key exists in the specified bucket and if your credentials have permission.";
    return new NoSuchKey({ ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === "NoSuchBucket") {
    suggestion = "Check if the bucket exists and if your credentials have permission.";
    return new NoSuchBucket({ ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === "AccessDenied" || err.statusCode === 403 || code === "Forbidden") {
    suggestion = "Check your credentials and bucket policy.";
    return new PermissionError("Access denied", { ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === "ValidationError" || err.statusCode === 400) {
    suggestion = "Check the request parameters and payload.";
    return new ValidationError("Validation error", { ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  if (code === "MissingMetadata") {
    suggestion = "Check if the object metadata is present and valid.";
    return new MissingMetadata({ ...context, original: err, metadata, commandName, commandInput, suggestion });
  }
  suggestion = "Check the error details and AWS documentation.";
  return new UnknownError("Unknown error", { ...context, original: err, metadata, commandName, commandInput, suggestion });
}
class ConnectionStringError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: "Check the connection string format and credentials." });
  }
}
class CryptoError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: "Check if the crypto library is available and input is valid." });
  }
}
class SchemaError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: "Check schema definition and input data." });
  }
}
class ResourceError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: details.suggestion || "Check resource configuration, attributes, and operation context." });
    Object.assign(this, details);
  }
}
class PartitionError extends S3dbError {
  constructor(message, details = {}) {
    super(message, { ...details, suggestion: details.suggestion || "Check partition definition, fields, and input values." });
  }
}

function tryFn(fnOrPromise) {
  if (fnOrPromise == null) {
    const err = new Error("fnOrPromise cannot be null or undefined");
    err.stack = new Error().stack;
    return [false, err, void 0];
  }
  if (typeof fnOrPromise === "function") {
    try {
      const result = fnOrPromise();
      if (result == null) {
        return [true, null, result];
      }
      if (typeof result.then === "function") {
        return result.then((data) => [true, null, data]).catch((error) => {
          if (error instanceof Error && Object.isExtensible(error)) {
            const desc = Object.getOwnPropertyDescriptor(error, "stack");
            if (desc && desc.writable && desc.configurable && error.hasOwnProperty("stack")) {
              try {
                error.stack = new Error().stack;
              } catch (_) {
              }
            }
          }
          return [false, error, void 0];
        });
      }
      return [true, null, result];
    } catch (error) {
      if (error instanceof Error && Object.isExtensible(error)) {
        const desc = Object.getOwnPropertyDescriptor(error, "stack");
        if (desc && desc.writable && desc.configurable && error.hasOwnProperty("stack")) {
          try {
            error.stack = new Error().stack;
          } catch (_) {
          }
        }
      }
      return [false, error, void 0];
    }
  }
  if (typeof fnOrPromise.then === "function") {
    return Promise.resolve(fnOrPromise).then((data) => [true, null, data]).catch((error) => {
      if (error instanceof Error && Object.isExtensible(error)) {
        const desc = Object.getOwnPropertyDescriptor(error, "stack");
        if (desc && desc.writable && desc.configurable && error.hasOwnProperty("stack")) {
          try {
            error.stack = new Error().stack;
          } catch (_) {
          }
        }
      }
      return [false, error, void 0];
    });
  }
  return [true, null, fnOrPromise];
}
function tryFnSync(fn) {
  try {
    const result = fn();
    return [true, null, result];
  } catch (err) {
    return [false, err, null];
  }
}
var try_fn_default = tryFn;

async function dynamicCrypto() {
  let lib;
  if (typeof process !== "undefined") {
    const [ok, err, result] = await try_fn_default(async () => {
      const { webcrypto } = await import('crypto');
      return webcrypto;
    });
    if (ok) {
      lib = result;
    } else {
      throw new CryptoError("Crypto API not available", { original: err, context: "dynamicCrypto" });
    }
  } else if (typeof window !== "undefined") {
    lib = window.crypto;
  }
  if (!lib) throw new CryptoError("Could not load any crypto library", { context: "dynamicCrypto" });
  return lib;
}
async function sha256(message) {
  const [okCrypto, errCrypto, cryptoLib] = await try_fn_default(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const [ok, err, hashBuffer] = await try_fn_default(() => cryptoLib.subtle.digest("SHA-256", data));
  if (!ok) throw new CryptoError("SHA-256 digest failed", { original: err, input: message });
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
async function encrypt(content, passphrase) {
  const [okCrypto, errCrypto, cryptoLib] = await try_fn_default(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const salt = cryptoLib.getRandomValues(new Uint8Array(16));
  const [okKey, errKey, key] = await try_fn_default(() => getKeyMaterial(passphrase, salt));
  if (!okKey) throw new CryptoError("Key derivation failed", { original: errKey, passphrase, salt });
  const iv = cryptoLib.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedContent = encoder.encode(content);
  const [okEnc, errEnc, encryptedContent] = await try_fn_default(() => cryptoLib.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedContent));
  if (!okEnc) throw new CryptoError("Encryption failed", { original: errEnc, content });
  const encryptedData = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  encryptedData.set(salt);
  encryptedData.set(iv, salt.length);
  encryptedData.set(new Uint8Array(encryptedContent), salt.length + iv.length);
  return arrayBufferToBase64(encryptedData);
}
async function decrypt(encryptedBase64, passphrase) {
  const [okCrypto, errCrypto, cryptoLib] = await try_fn_default(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const encryptedData = base64ToArrayBuffer(encryptedBase64);
  const salt = encryptedData.slice(0, 16);
  const iv = encryptedData.slice(16, 28);
  const encryptedContent = encryptedData.slice(28);
  const [okKey, errKey, key] = await try_fn_default(() => getKeyMaterial(passphrase, salt));
  if (!okKey) throw new CryptoError("Key derivation failed (decrypt)", { original: errKey, passphrase, salt });
  const [okDec, errDec, decryptedContent] = await try_fn_default(() => cryptoLib.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedContent));
  if (!okDec) throw new CryptoError("Decryption failed", { original: errDec, encryptedBase64 });
  const decoder = new TextDecoder();
  return decoder.decode(decryptedContent);
}
async function md5(data) {
  if (typeof process === "undefined") {
    throw new CryptoError("MD5 hashing is only available in Node.js environment", { context: "md5" });
  }
  const [ok, err, result] = await try_fn_default(async () => {
    const { createHash } = await import('crypto');
    return createHash("md5").update(data).digest("base64");
  });
  if (!ok) {
    throw new CryptoError("MD5 hashing failed", { original: err, data });
  }
  return result;
}
async function getKeyMaterial(passphrase, salt) {
  const [okCrypto, errCrypto, cryptoLib] = await try_fn_default(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(passphrase);
  const [okImport, errImport, baseKey] = await try_fn_default(() => cryptoLib.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  ));
  if (!okImport) throw new CryptoError("importKey failed", { original: errImport, passphrase });
  const [okDerive, errDerive, derivedKey] = await try_fn_default(() => cryptoLib.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  ));
  if (!okDerive) throw new CryptoError("deriveKey failed", { original: errDerive, passphrase, salt });
  return derivedKey;
}
function arrayBufferToBase64(buffer) {
  if (typeof process !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  } else {
    const [ok, err, binary] = tryFnSync(() => String.fromCharCode.apply(null, new Uint8Array(buffer)));
    if (!ok) throw new CryptoError("Failed to convert ArrayBuffer to base64 (browser)", { original: err });
    return window.btoa(binary);
  }
}
function base64ToArrayBuffer(base64) {
  if (typeof process !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  } else {
    const [ok, err, binaryString] = tryFnSync(() => window.atob(base64));
    if (!ok) throw new CryptoError("Failed to decode base64 (browser)", { original: err });
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}

const idGenerator = customAlphabet(urlAlphabet, 22);
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const passwordGenerator = customAlphabet(passwordAlphabet, 16);

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}

// nodejs oddity
// require('events') === require('events').EventEmitter
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active && !(this instanceof domain.Domain)) {
      this.domain = domain.active;
    }
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] :
                                          [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + type + ' listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = new EventHandlers();
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = new EventHandlers();
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };
    
// Alias for removeListener added in NodeJS 10.0
// https://nodejs.org/api/events.html#events_emitter_off_eventname_listener
EventEmitter.prototype.off = function(type, listener){
    return this.removeListener(type, listener);
};

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = new EventHandlers();
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = new EventHandlers();
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener.listener || evlistener];
    else
      ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount$1.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount$1;
function listenerCount$1(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

class Plugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = this.constructor.name;
    this.options = options;
    this.hooks = /* @__PURE__ */ new Map();
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
  }
  async onStart() {
  }
  async onStop() {
  }
  // Hook management methods
  addHook(resource, event, handler) {
    if (!this.hooks.has(resource)) {
      this.hooks.set(resource, /* @__PURE__ */ new Map());
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
      resource._pluginWrappers = /* @__PURE__ */ new Map();
    }
    if (!resource._pluginWrappers.has(methodName)) {
      resource._pluginWrappers.set(methodName, []);
    }
    resource._pluginWrappers.get(methodName).push(wrapper);
    if (!resource[`_wrapped_${methodName}`]) {
      resource[`_wrapped_${methodName}`] = originalMethod;
      const isJestMock = originalMethod && originalMethod._isMockFunction;
      resource[methodName] = async function(...args) {
        let result = await resource[`_wrapped_${methodName}`](...args);
        for (const wrapper2 of resource._pluginWrappers.get(methodName)) {
          result = await wrapper2.call(this, result, args, methodName);
        }
        return result;
      };
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
    if (!resource._pluginMiddlewares) {
      resource._pluginMiddlewares = {};
    }
    if (!resource._pluginMiddlewares[methodName]) {
      resource._pluginMiddlewares[methodName] = [];
      const originalMethod = resource[methodName].bind(resource);
      resource[methodName] = async function(...args) {
        let idx = -1;
        const next = async (...nextArgs) => {
          idx++;
          if (idx < resource._pluginMiddlewares[methodName].length) {
            return await resource._pluginMiddlewares[methodName][idx].call(this, next, ...nextArgs);
          } else {
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
          if (value !== null && value !== void 0) {
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
    if (!fieldPath.includes(".")) {
      return data[fieldPath] ?? null;
    }
    const keys = fieldPath.split(".");
    let value = data;
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return value ?? null;
  }
  // Event emission methods
  beforeSetup() {
    this.emit("plugin.beforeSetup", /* @__PURE__ */ new Date());
  }
  afterSetup() {
    this.emit("plugin.afterSetup", /* @__PURE__ */ new Date());
  }
  beforeStart() {
    this.emit("plugin.beforeStart", /* @__PURE__ */ new Date());
  }
  afterStart() {
    this.emit("plugin.afterStart", /* @__PURE__ */ new Date());
  }
  beforeStop() {
    this.emit("plugin.beforeStop", /* @__PURE__ */ new Date());
  }
  afterStop() {
    this.emit("plugin.afterStop", /* @__PURE__ */ new Date());
  }
}
var plugin_class_default = Plugin;

const PluginObject = {
  setup(database) {
  },
  start() {
  },
  stop() {
  }
};

class AuditPlugin extends plugin_class_default {
  constructor(options = {}) {
    super(options);
    this.auditResource = null;
    this.config = {
      includeData: options.includeData !== false,
      includePartitions: options.includePartitions !== false,
      maxDataSize: options.maxDataSize || 1e4,
      // 10KB limit
      ...options
    };
  }
  async onSetup() {
    const [ok, err, auditResource] = await try_fn_default(() => this.database.createResource({
      name: "audits",
      attributes: {
        id: "string|required",
        resourceName: "string|required",
        operation: "string|required",
        recordId: "string|required",
        userId: "string|optional",
        timestamp: "string|required",
        oldData: "string|optional",
        newData: "string|optional",
        partition: "string|optional",
        partitionValues: "string|optional",
        metadata: "string|optional"
      },
      behavior: "body-overflow"
      // keyPrefix removido
    }));
    this.auditResource = ok ? auditResource : this.database.resources.audits || null;
    if (!ok && !this.auditResource) return;
    this.installDatabaseProxy();
    this.installEventListeners();
  }
  async onStart() {
  }
  async onStop() {
  }
  installDatabaseProxy() {
    if (this.database._auditProxyInstalled) {
      return;
    }
    const installEventListenersForResource = this.installEventListenersForResource.bind(this);
    this.database._originalCreateResource = this.database.createResource;
    this.database.createResource = async function(...args) {
      const resource = await this._originalCreateResource(...args);
      if (resource.name !== "audits") {
        installEventListenersForResource(resource);
      }
      return resource;
    };
    this.database._auditProxyInstalled = true;
  }
  installEventListeners() {
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === "audits") {
        continue;
      }
      this.installEventListenersForResource(resource);
    }
  }
  installEventListenersForResource(resource) {
    resource.on("insert", async (data) => {
      const recordId = data.id || "auto-generated";
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        resourceName: resource.name,
        operation: "insert",
        recordId,
        userId: this.getCurrentUserId?.() || "system",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        oldData: null,
        newData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(data)),
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
        metadata: JSON.stringify({
          source: "audit-plugin",
          version: "2.0"
        })
      };
      this.logAudit(auditRecord).catch(console.error);
    });
    resource.on("update", async (data) => {
      const recordId = data.id;
      let oldData = data.$before;
      if (this.config.includeData && !oldData) {
        const [ok, err, fetched] = await try_fn_default(() => resource.get(recordId));
        if (ok) oldData = fetched;
      }
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        resourceName: resource.name,
        operation: "update",
        recordId,
        userId: this.getCurrentUserId?.() || "system",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        oldData: oldData && this.config.includeData === false ? null : oldData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(data)),
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
        metadata: JSON.stringify({
          source: "audit-plugin",
          version: "2.0"
        })
      };
      this.logAudit(auditRecord).catch(console.error);
    });
    resource.on("delete", async (data) => {
      const recordId = data.id;
      let oldData = data;
      if (this.config.includeData && !oldData) {
        const [ok, err, fetched] = await try_fn_default(() => resource.get(recordId));
        if (ok) oldData = fetched;
      }
      const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;
      const auditRecord = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        resourceName: resource.name,
        operation: "delete",
        recordId,
        userId: this.getCurrentUserId?.() || "system",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        oldData: oldData && this.config.includeData === false ? null : oldData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: null,
        partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
        metadata: JSON.stringify({
          source: "audit-plugin",
          version: "2.0"
        })
      };
      this.logAudit(auditRecord).catch(console.error);
    });
    resource.useMiddleware("deleteMany", async (ctx, next) => {
      const ids = ctx.args[0];
      const oldDataMap = {};
      if (this.config.includeData) {
        for (const id of ids) {
          const [ok, err, data] = await try_fn_default(() => resource.get(id));
          oldDataMap[id] = ok ? data : null;
        }
      }
      const result = await next();
      if (result && result.length > 0 && this.config.includeData) {
        for (const id of ids) {
          const oldData = oldDataMap[id];
          const partitionValues = oldData ? this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null : null;
          const auditRecord = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            resourceName: resource.name,
            operation: "delete",
            recordId: id,
            userId: this.getCurrentUserId?.() || "system",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            oldData: this.config.includeData === false ? null : JSON.stringify(this.truncateData(oldData)),
            newData: null,
            partition: this.config.includePartitions ? this.getPrimaryPartition(partitionValues) : null,
            partitionValues: this.config.includePartitions ? partitionValues ? Object.keys(partitionValues).length > 0 ? JSON.stringify(partitionValues) : null : null : null,
            metadata: JSON.stringify({
              source: "audit-plugin",
              version: "2.0",
              batchOperation: true
            })
          };
          this.logAudit(auditRecord).catch(console.error);
        }
      }
      return result;
    });
  }
  getPartitionValues(data, resource) {
    if (!data) return null;
    const partitions = resource.config?.partitions || {};
    const partitionValues = {};
    for (const [partitionName, partitionDef] of Object.entries(partitions)) {
      if (partitionDef.fields) {
        const partitionData = {};
        for (const [fieldName, fieldRule] of Object.entries(partitionDef.fields)) {
          const fieldValue = this.getNestedFieldValue(data, fieldName);
          if (fieldValue !== void 0 && fieldValue !== null) {
            partitionData[fieldName] = fieldValue;
          }
        }
        if (Object.keys(partitionData).length > 0) {
          partitionValues[partitionName] = partitionData;
        }
      }
    }
    return partitionValues;
  }
  getNestedFieldValue(data, fieldPath) {
    if (!fieldPath.includes(".")) {
      return data[fieldPath];
    }
    const keys = fieldPath.split(".");
    let currentLevel = data;
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== "object" || !(key in currentLevel)) {
        return void 0;
      }
      currentLevel = currentLevel[key];
    }
    return currentLevel;
  }
  getPrimaryPartition(partitionValues) {
    if (!partitionValues) return null;
    const partitionNames = Object.keys(partitionValues);
    return partitionNames.length > 0 ? partitionNames[0] : null;
  }
  async logAudit(auditRecord) {
    if (!auditRecord.id) {
      auditRecord.id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const result = await this.auditResource.insert(auditRecord);
    return result;
  }
  truncateData(data) {
    if (!data) return data;
    const filteredData = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("_") && key !== "$overflow") {
        filteredData[key] = value;
      }
    }
    const dataStr = JSON.stringify(filteredData);
    if (dataStr.length <= this.config.maxDataSize) {
      return filteredData;
    }
    let truncatedData = { ...filteredData };
    let currentSize = JSON.stringify(truncatedData).length;
    const metadataOverhead = JSON.stringify({
      _truncated: true,
      _originalSize: dataStr.length,
      _truncatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).length;
    const targetSize = this.config.maxDataSize - metadataOverhead;
    for (const [key, value] of Object.entries(truncatedData)) {
      if (typeof value === "string" && currentSize > targetSize) {
        const excess = currentSize - targetSize;
        const newLength = Math.max(0, value.length - excess - 3);
        if (newLength < value.length) {
          truncatedData[key] = value.substring(0, newLength) + "...";
          currentSize = JSON.stringify(truncatedData).length;
        }
      }
    }
    return {
      ...truncatedData,
      _truncated: true,
      _originalSize: dataStr.length,
      _truncatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  // Utility methods for querying audit logs
  async getAuditLogs(options = {}) {
    if (!this.auditResource) return [];
    const [ok, err, result] = await try_fn_default(async () => {
      const {
        resourceName,
        operation,
        recordId,
        userId,
        partition,
        startDate,
        endDate,
        limit = 100,
        offset = 0
      } = options;
      const allAudits = await this.auditResource.getAll();
      let filtered = allAudits.filter((audit) => {
        if (resourceName && audit.resourceName !== resourceName) return false;
        if (operation && audit.operation !== operation) return false;
        if (recordId && audit.recordId !== recordId) return false;
        if (userId && audit.userId !== userId) return false;
        if (partition && audit.partition !== partition) return false;
        if (startDate && new Date(audit.timestamp) < new Date(startDate)) return false;
        if (endDate && new Date(audit.timestamp) > new Date(endDate)) return false;
        return true;
      });
      filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const deserialized = filtered.slice(offset, offset + limit).map((audit) => {
        const [okOld, , oldData] = typeof audit.oldData === "string" ? tryFnSync(() => JSON.parse(audit.oldData)) : [true, null, audit.oldData];
        const [okNew, , newData] = typeof audit.newData === "string" ? tryFnSync(() => JSON.parse(audit.newData)) : [true, null, audit.newData];
        const [okPart, , partitionValues] = audit.partitionValues && typeof audit.partitionValues === "string" ? tryFnSync(() => JSON.parse(audit.partitionValues)) : [true, null, audit.partitionValues];
        const [okMeta, , metadata] = audit.metadata && typeof audit.metadata === "string" ? tryFnSync(() => JSON.parse(audit.metadata)) : [true, null, audit.metadata];
        return {
          ...audit,
          oldData: audit.oldData === null || audit.oldData === void 0 || audit.oldData === "null" ? null : okOld ? oldData : null,
          newData: audit.newData === null || audit.newData === void 0 || audit.newData === "null" ? null : okNew ? newData : null,
          partitionValues: okPart ? partitionValues : audit.partitionValues,
          metadata: okMeta ? metadata : audit.metadata
        };
      });
      return deserialized;
    });
    return ok ? result : [];
  }
  async getRecordHistory(resourceName, recordId) {
    return this.getAuditLogs({
      resourceName,
      recordId,
      limit: 1e3
    });
  }
  async getPartitionHistory(resourceName, partitionName, partitionValues) {
    return this.getAuditLogs({
      resourceName,
      partition: partitionName,
      limit: 1e3
    });
  }
  async getAuditStats(options = {}) {
    const {
      resourceName,
      startDate,
      endDate
    } = options;
    const allAudits = await this.getAuditLogs({
      resourceName,
      startDate,
      endDate,
      limit: 1e4
    });
    const stats = {
      total: allAudits.length,
      byOperation: {},
      byResource: {},
      byPartition: {},
      byUser: {},
      timeline: {}
    };
    for (const audit of allAudits) {
      stats.byOperation[audit.operation] = (stats.byOperation[audit.operation] || 0) + 1;
      stats.byResource[audit.resourceName] = (stats.byResource[audit.resourceName] || 0) + 1;
      if (audit.partition) {
        stats.byPartition[audit.partition] = (stats.byPartition[audit.partition] || 0) + 1;
      }
      stats.byUser[audit.userId] = (stats.byUser[audit.userId] || 0) + 1;
      if (audit.timestamp) {
        const day = audit.timestamp.split("T")[0];
        stats.timeline[day] = (stats.timeline[day] || 0) + 1;
      }
    }
    return stats;
  }
}

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
function resolve() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : '/';

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
}
// path.normalize(path)
// posix version
function normalize(path) {
  var isPathAbsolute = isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isPathAbsolute).join('/');

  if (!path && !isPathAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isPathAbsolute ? '/' : '') + path;
}
// posix version
function isAbsolute(path) {
  return path.charAt(0) === '/';
}

// posix version
function join() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
}


// path.relative(from, to)
// posix version
function relative(from, to) {
  from = resolve(from).substr(1);
  to = resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
}

var sep = '/';
var delimiter = ':';

function dirname(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
}

function basename(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
}


function extname(path) {
  return splitPath(path)[3];
}
var path = {
  extname: extname,
  basename: basename,
  dirname: dirname,
  sep: sep,
  delimiter: delimiter,
  relative: relative,
  join: join,
  isAbsolute: isAbsolute,
  normalize: normalize,
  resolve: resolve
};
function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b' ?
    function (str, start, len) { return str.substr(start, len) } :
    function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

class Cache extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
  }
  // to implement:
  async _set(key, data) {
  }
  async _get(key) {
  }
  async _del(key) {
  }
  async _clear(key) {
  }
  validateKey(key) {
    if (key === null || key === void 0 || typeof key !== "string" || !key) {
      throw new Error("Invalid key");
    }
  }
  // generic class methods
  async set(key, data) {
    this.validateKey(key);
    await this._set(key, data);
    this.emit("set", data);
    return data;
  }
  async get(key) {
    this.validateKey(key);
    const data = await this._get(key);
    this.emit("get", data);
    return data;
  }
  async del(key) {
    this.validateKey(key);
    const data = await this._del(key);
    this.emit("delete", data);
    return data;
  }
  async delete(key) {
    return this.del(key);
  }
  async clear(prefix) {
    const data = await this._clear(prefix);
    this.emit("clear", data);
    return data;
  }
}

// shim for using process in browser
// based off https://github.com/defunctzombie/node-process/blob/master/browser.js

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
var cachedSetTimeout = defaultSetTimout;
var cachedClearTimeout = defaultClearTimeout;
if (typeof global.setTimeout === 'function') {
    cachedSetTimeout = setTimeout;
}
if (typeof global.clearTimeout === 'function') {
    cachedClearTimeout = clearTimeout;
}

function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}
function nextTick(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
}
// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
var env = {};

var browser$1 = {
  env: env};

var inherits;
if (typeof Object.create === 'function'){
  inherits = function inherits(ctor, superCtor) {
    // implementation from standard node.js 'util' module
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  inherits = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor;
    var TempCtor = function () {};
    TempCtor.prototype = superCtor.prototype;
    ctor.prototype = new TempCtor();
    ctor.prototype.constructor = ctor;
  };
}

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
function format(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
}

// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
function deprecate(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (browser$1.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (browser$1.throwDeprecation) {
        throw new Error(msg);
      } else if (browser$1.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
}

var debugs = {};
var debugEnviron;
function debuglog(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = browser$1.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = 0;
      debugs[set] = function() {
        var msg = format.apply(null, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
}

/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    _extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray$1(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var length = output.reduce(function(prev, cur) {
    if (cur.indexOf('\n') >= 0) ;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray$1(ar) {
  return Array.isArray(ar);
}

function isBoolean(arg) {
  return typeof arg === 'boolean';
}

function isNull(arg) {
  return arg === null;
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isString(arg) {
  return typeof arg === 'string';
}

function isUndefined(arg) {
  return arg === void 0;
}

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}

function isFunction(arg) {
  return typeof arg === 'function';
}

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

function _extend(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
}
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
var inited = false;
function init () {
  inited = true;
  var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }

  revLookup['-'.charCodeAt(0)] = 62;
  revLookup['_'.charCodeAt(0)] = 63;
}

function toByteArray (b64) {
  if (!inited) {
    init();
  }
  var i, j, l, tmp, placeHolders, arr;
  var len = b64.length;

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  placeHolders = b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0;

  // base64 is 4/3 + up to two characters of the original data
  arr = new Arr(len * 3 / 4 - placeHolders);

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len;

  var L = 0;

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)];
    arr[L++] = (tmp >> 16) & 0xFF;
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4);
    arr[L++] = tmp & 0xFF;
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2);
    arr[L++] = (tmp >> 8) & 0xFF;
    arr[L++] = tmp & 0xFF;
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2]);
    output.push(tripletToBase64(tmp));
  }
  return output.join('')
}

function fromByteArray (uint8) {
  if (!inited) {
    init();
  }
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var output = '';
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    output += lookup[tmp >> 2];
    output += lookup[(tmp << 4) & 0x3F];
    output += '==';
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1]);
    output += lookup[tmp >> 10];
    output += lookup[(tmp >> 4) & 0x3F];
    output += lookup[(tmp << 2) & 0x3F];
    output += '=';
  }

  parts.push(output);

  return parts.join('')
}

function read (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? (nBytes - 1) : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

function write (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0);
  var i = isLE ? 0 : (nBytes - 1);
  var d = isLE ? 1 : -1;
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128;
}

var toString = {}.toString;

var isArray = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */


var INSPECT_MAX_BYTES = 50;

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer$1.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : true;

/*
 * Export kMaxLength after typed array support is determined.
 */
kMaxLength();

function kMaxLength () {
  return Buffer$1.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length);
    that.__proto__ = Buffer$1.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer$1(length);
    }
    that.length = length;
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer$1 (arg, encodingOrOffset, length) {
  if (!Buffer$1.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer$1)) {
    return new Buffer$1(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer$1.poolSize = 8192; // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer$1._augment = function (arr) {
  arr.__proto__ = Buffer$1.prototype;
  return arr
};

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer$1.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
};

if (Buffer$1.TYPED_ARRAY_SUPPORT) {
  Buffer$1.prototype.__proto__ = Uint8Array.prototype;
  Buffer$1.__proto__ = Uint8Array;
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer$1[Symbol.species] === Buffer$1) ;
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer$1.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
};

function allocUnsafe (that, size) {
  assertSize(size);
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
  if (!Buffer$1.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0;
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer$1.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
};
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer$1.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
};

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }

  if (!Buffer$1.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0;
  that = createBuffer(that, length);

  var actual = that.write(string, encoding);

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    that = that.slice(0, actual);
  }

  return that
}

function fromArrayLike (that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  that = createBuffer(that, length);
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255;
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength; // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array);
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset);
  } else {
    array = new Uint8Array(array, byteOffset, length);
  }

  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array;
    that.__proto__ = Buffer$1.prototype;
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array);
  }
  return that
}

function fromObject (that, obj) {
  if (internalIsBuffer(obj)) {
    var len = checked(obj.length) | 0;
    that = createBuffer(that, len);

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len);
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}
Buffer$1.isBuffer = isBuffer;
function internalIsBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer$1.compare = function compare (a, b) {
  if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length;
  var y = b.length;

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

Buffer$1.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
};

Buffer$1.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer$1.alloc(0)
  }

  var i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }

  var buffer = Buffer$1.allocUnsafe(length);
  var pos = 0;
  for (i = 0; i < list.length; ++i) {
    var buf = list[i];
    if (!internalIsBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer
};

function byteLength (string, encoding) {
  if (internalIsBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string;
  }

  var len = string.length;
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
Buffer$1.byteLength = byteLength;

function slowToString (encoding, start, end) {
  var loweredCase = false;

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0;
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length;
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0;
  start >>>= 0;

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8';

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer$1.prototype._isBuffer = true;

function swap (b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}

Buffer$1.prototype.swap16 = function swap16 () {
  var len = this.length;
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1);
  }
  return this
};

Buffer$1.prototype.swap32 = function swap32 () {
  var len = this.length;
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3);
    swap(this, i + 1, i + 2);
  }
  return this
};

Buffer$1.prototype.swap64 = function swap64 () {
  var len = this.length;
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7);
    swap(this, i + 1, i + 6);
    swap(this, i + 2, i + 5);
    swap(this, i + 3, i + 4);
  }
  return this
};

Buffer$1.prototype.toString = function toString () {
  var length = this.length | 0;
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
};

Buffer$1.prototype.equals = function equals (b) {
  if (!internalIsBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer$1.compare(this, b) === 0
};

Buffer$1.prototype.inspect = function inspect () {
  var str = '';
  var max = INSPECT_MAX_BYTES;
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ');
    if (this.length > max) str += ' ... ';
  }
  return '<Buffer ' + str + '>'
};

Buffer$1.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!internalIsBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = target ? target.length : 0;
  }
  if (thisStart === undefined) {
    thisStart = 0;
  }
  if (thisEnd === undefined) {
    thisEnd = this.length;
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0;
  end >>>= 0;
  thisStart >>>= 0;
  thisEnd >>>= 0;

  if (this === target) return 0

  var x = thisEnd - thisStart;
  var y = end - start;
  var len = Math.min(x, y);

  var thisCopy = this.slice(thisStart, thisEnd);
  var targetCopy = target.slice(start, end);

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i];
      y = targetCopy[i];
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
};

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -2147483648) {
    byteOffset = -2147483648;
  }
  byteOffset = +byteOffset;  // Coerce to Number.
  if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1);
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer$1.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (internalIsBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF; // Search for a byte value [0-255]
    if (Buffer$1.TYPED_ARRAY_SUPPORT &&
        typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false;
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer$1.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
};

Buffer$1.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
};

Buffer$1.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
};

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }

  // must be an even number of digits
  var strLen = string.length;
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed;
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer$1.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8';
    length = this.length;
    offset = 0;
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0;
    if (isFinite(length)) {
      length = length | 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = undefined;
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset;
  if (length === undefined || length > remaining) length = remaining;

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8';

  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
};

Buffer$1.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
};

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return fromByteArray(buf)
  } else {
    return fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];

  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1;

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F);
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F);
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint;
            }
          }
          break
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F);
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD;
      bytesPerSequence = 1;
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
      codePoint = 0xDC00 | codePoint & 0x3FF;
    }

    res.push(codePoint);
    i += bytesPerSequence;
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000;

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = '';
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    );
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F);
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length;

  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;

  var out = '';
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = '';
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res
}

Buffer$1.prototype.slice = function slice (start, end) {
  var len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;

  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }

  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }

  if (end < start) end = start;

  var newBuf;
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end);
    newBuf.__proto__ = Buffer$1.prototype;
  } else {
    var sliceLen = end - start;
    newBuf = new Buffer$1(sliceLen, undefined);
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start];
    }
  }

  return newBuf
};

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer$1.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }

  return val
};

Buffer$1.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length);
  }

  var val = this[offset + --byteLength];
  var mul = 1;
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul;
  }

  return val
};

Buffer$1.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset]
};

Buffer$1.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] | (this[offset + 1] << 8)
};

Buffer$1.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  return (this[offset] << 8) | this[offset + 1]
};

Buffer$1.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
};

Buffer$1.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
};

Buffer$1.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer$1.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);

  var i = byteLength;
  var mul = 1;
  var val = this[offset + --i];
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul;
  }
  mul *= 0x80;

  if (val >= mul) val -= Math.pow(2, 8 * byteLength);

  return val
};

Buffer$1.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
};

Buffer$1.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset] | (this[offset + 1] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer$1.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset + 1] | (this[offset] << 8);
  return (val & 0x8000) ? val | 0xFFFF0000 : val
};

Buffer$1.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
};

Buffer$1.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
};

Buffer$1.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, true, 23, 4)
};

Buffer$1.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length);
  return read(this, offset, false, 23, 4)
};

Buffer$1.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, true, 52, 8)
};

Buffer$1.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length);
  return read(this, offset, false, 52, 8)
};

function checkInt (buf, value, offset, ext, max, min) {
  if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer$1.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var mul = 1;
  var i = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  byteLength = byteLength | 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }

  var i = byteLength - 1;
  var mul = 1;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  this[offset] = (value & 0xff);
  return offset + 1
};

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8;
  }
}

Buffer$1.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer$1.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff;
  }
}

Buffer$1.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24);
    this[offset + 2] = (value >>> 16);
    this[offset + 1] = (value >>> 8);
    this[offset] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer$1.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

Buffer$1.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = 0;
  var mul = 1;
  var sub = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);

    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }

  var i = byteLength - 1;
  var mul = 1;
  var sub = 0;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF;
  }

  return offset + byteLength
};

Buffer$1.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -128);
  if (!Buffer$1.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
  if (value < 0) value = 0xff + value + 1;
  this[offset] = (value & 0xff);
  return offset + 1
};

Buffer$1.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
  } else {
    objectWriteUInt16(this, value, offset, true);
  }
  return offset + 2
};

Buffer$1.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -32768);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8);
    this[offset + 1] = (value & 0xff);
  } else {
    objectWriteUInt16(this, value, offset, false);
  }
  return offset + 2
};

Buffer$1.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff);
    this[offset + 1] = (value >>> 8);
    this[offset + 2] = (value >>> 16);
    this[offset + 3] = (value >>> 24);
  } else {
    objectWriteUInt32(this, value, offset, true);
  }
  return offset + 4
};

Buffer$1.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value;
  offset = offset | 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -2147483648);
  if (value < 0) value = 0xffffffff + value + 1;
  if (Buffer$1.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24);
    this[offset + 1] = (value >>> 16);
    this[offset + 2] = (value >>> 8);
    this[offset + 3] = (value & 0xff);
  } else {
    objectWriteUInt32(this, value, offset, false);
  }
  return offset + 4
};

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4);
  }
  write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4
}

Buffer$1.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
};

Buffer$1.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
};

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8);
  }
  write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8
}

Buffer$1.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
};

Buffer$1.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer$1.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }

  var len = end - start;
  var i;

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else if (len < 1000 || !Buffer$1.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    );
  }

  return len
};

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer$1.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start;
      start = 0;
      end = this.length;
    } else if (typeof end === 'string') {
      encoding = end;
      end = this.length;
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0);
      if (code < 256) {
        val = code;
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer$1.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255;
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0;
  end = end === undefined ? this.length : end >>> 0;

  if (!val) val = 0;

  var i;
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val;
    }
  } else {
    var bytes = internalIsBuffer(val)
      ? val
      : utf8ToBytes(new Buffer$1(val, encoding).toString());
    var len = bytes.length;
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len];
    }
  }

  return this
};

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '');
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '=';
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue
        }

        // valid lead
        leadSurrogate = codePoint;

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
        leadSurrogate = codePoint;
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
    }

    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      );
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF);
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }

  return byteArray
}


function base64ToBytes (str) {
  return toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i];
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}


// the following is from is-buffer, also by Feross Aboukhadijeh and with same lisence
// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
function isBuffer(obj) {
  return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj))
}

function isFastBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isFastBuffer(obj.slice(0, 0))
}

function BufferList() {
  this.head = null;
  this.tail = null;
  this.length = 0;
}

BufferList.prototype.push = function (v) {
  var entry = { data: v, next: null };
  if (this.length > 0) this.tail.next = entry;else this.head = entry;
  this.tail = entry;
  ++this.length;
};

BufferList.prototype.unshift = function (v) {
  var entry = { data: v, next: this.head };
  if (this.length === 0) this.tail = entry;
  this.head = entry;
  ++this.length;
};

BufferList.prototype.shift = function () {
  if (this.length === 0) return;
  var ret = this.head.data;
  if (this.length === 1) this.head = this.tail = null;else this.head = this.head.next;
  --this.length;
  return ret;
};

BufferList.prototype.clear = function () {
  this.head = this.tail = null;
  this.length = 0;
};

BufferList.prototype.join = function (s) {
  if (this.length === 0) return '';
  var p = this.head;
  var ret = '' + p.data;
  while (p = p.next) {
    ret += s + p.data;
  }return ret;
};

BufferList.prototype.concat = function (n) {
  if (this.length === 0) return Buffer$1.alloc(0);
  if (this.length === 1) return this.head.data;
  var ret = Buffer$1.allocUnsafe(n >>> 0);
  var p = this.head;
  var i = 0;
  while (p) {
    p.data.copy(ret, i);
    i += p.data.length;
    p = p.next;
  }
  return ret;
};

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var isBufferEncoding = Buffer$1.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     };


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
function StringDecoder(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer$1(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
}

// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

Readable.ReadableState = ReadableState;

var debug = debuglog('stream');
inherits(Readable, EventEmitter);

function prependListener(emitter, event, fn) {
  // Sadly this is not cacheable as some libraries bundle their own
  // event emitter implementation with them.
  if (typeof emitter.prependListener === 'function') {
    return emitter.prependListener(event, fn);
  } else {
    // This is a hack to make sure that our error handler is attached before any
    // userland ones.  NEVER DO THIS. This is here only because this code needs
    // to continue to work with older versions of Node.js that do not include
    // the prependListener() method. The goal is to eventually remove this hack.
    if (!emitter._events || !emitter._events[event])
      emitter.on(event, fn);
    else if (Array.isArray(emitter._events[event]))
      emitter._events[event].unshift(fn);
    else
      emitter._events[event] = [fn, emitter._events[event]];
  }
}
function listenerCount (emitter, type) {
  return emitter.listeners(type).length;
}
function ReadableState(options, stream) {

  options = options || {};

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  // A linked list is used to store data chunks instead of an array because the
  // linked list can remove elements from the beginning faster than
  // array.shift()
  this.buffer = new BufferList();
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}
function Readable(options) {

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options && typeof options.read === 'function') this._read = options.read;

  EventEmitter.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;

  if (!state.objectMode && typeof chunk === 'string') {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = Buffer.from(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var _e = new Error('stream.unshift() after end event');
      stream.emit('error', _e);
    } else {
      var skipAdd;
      if (state.decoder && !addToFront && !encoding) {
        chunk = state.decoder.write(chunk);
        skipAdd = !state.objectMode && chunk.length === 0;
      }

      if (!addToFront) state.reading = false;

      // Don't add to the buffer if we've decoded to an empty string chunk and
      // we're not in object mode
      if (!skipAdd) {
        // if we want the data now, just emit it.
        if (state.flowing && state.length === 0 && !state.sync) {
          stream.emit('data', chunk);
          stream.read(0);
        } else {
          // update the buffer info.
          state.length += state.objectMode ? 1 : chunk.length;
          if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

          if (state.needReadable) emitReadable(stream);
        }
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2 to prevent increasing hwm excessively in
    // tiny amounts
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function howMuchToRead(n, state) {
  if (n <= 0 || state.length === 0 && state.ended) return 0;
  if (state.objectMode) return 1;
  if (n !== n) {
    // Only flow one buffer at a time
    if (state.flowing && state.length) return state.buffer.head.data.length;else return state.length;
  }
  // If we're asking for more than the current hwm, then raise the hwm.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
  if (n <= state.length) return n;
  // Don't have enough
  if (!state.ended) {
    state.needReadable = true;
    return 0;
  }
  return state.length;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  n = parseInt(n, 10);
  var state = this._readableState;
  var nOrig = n;

  if (n !== 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  } else if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
    // If _read pushed data synchronously, then `reading` will be false,
    // and we need to re-evaluate how much data we can return to the user.
    if (!state.reading) n = howMuchToRead(nOrig, state);
  }

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  } else {
    state.length -= n;
  }

  if (state.length === 0) {
    // If we have nothing in the buffer, then we want to know
    // as soon as we *do* get something into the buffer.
    if (!state.ended) state.needReadable = true;

    // If we tried to read() past the EOF, then emit end on the next tick.
    if (nOrig !== n && state.ended) endReadable(this);
  }

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== null && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) nextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    nextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false);

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted) nextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  // If the user pushes more data while we're writing to dest then we'll end up
  // in ondata again. However, we only want to increase awaitDrain once because
  // dest will only emit one 'drain' event for the multiple writes.
  // => Introduce a guard on increasing awaitDrain.
  var increasedAwaitDrain = false;
  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    increasedAwaitDrain = false;
    var ret = dest.write(chunk);
    if (false === ret && !increasedAwaitDrain) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      // => Check whether `dest` is still a piping destination.
      if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
        increasedAwaitDrain = true;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (listenerCount(dest, 'error') === 0) dest.emit('error', er);
  }

  // Make sure our error handler is attached before userland ones.
  prependListener(dest, 'error', onerror);

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && src.listeners('data').length) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var _i = 0; _i < len; _i++) {
      dests[_i].emit('unpipe', this);
    }return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1) return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = EventEmitter.prototype.on.call(this, ev, fn);

  if (ev === 'data') {
    // Start flowing on next tick if stream isn't explicitly paused
    if (this._readableState.flowing !== false) this.resume();
  } else if (ev === 'readable') {
    var state = this._readableState;
    if (!state.endEmitted && !state.readableListening) {
      state.readableListening = state.needReadable = true;
      state.emittedReadable = false;
      if (!state.reading) {
        nextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    nextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  state.awaitDrain = 0;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  while (state.flowing && stream.read() !== null) {}
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function (ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromList(n, state) {
  // nothing buffered
  if (state.length === 0) return null;

  var ret;
  if (state.objectMode) ret = state.buffer.shift();else if (!n || n >= state.length) {
    // read it all, truncate the list
    if (state.decoder) ret = state.buffer.join('');else if (state.buffer.length === 1) ret = state.buffer.head.data;else ret = state.buffer.concat(state.length);
    state.buffer.clear();
  } else {
    // read part of list
    ret = fromListPartial(n, state.buffer, state.decoder);
  }

  return ret;
}

// Extracts only enough buffered data to satisfy the amount requested.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function fromListPartial(n, list, hasStrings) {
  var ret;
  if (n < list.head.data.length) {
    // slice is the same for buffers and strings
    ret = list.head.data.slice(0, n);
    list.head.data = list.head.data.slice(n);
  } else if (n === list.head.data.length) {
    // first chunk is a perfect match
    ret = list.shift();
  } else {
    // result spans more than one buffer
    ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
  }
  return ret;
}

// Copies a specified amount of characters from the list of buffered data
// chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBufferString(n, list) {
  var p = list.head;
  var c = 1;
  var ret = p.data;
  n -= ret.length;
  while (p = p.next) {
    var str = p.data;
    var nb = n > str.length ? str.length : n;
    if (nb === str.length) ret += str;else ret += str.slice(0, n);
    n -= nb;
    if (n === 0) {
      if (nb === str.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = str.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

// Copies a specified amount of bytes from the list of buffered data chunks.
// This function is designed to be inlinable, so please take care when making
// changes to the function body.
function copyFromBuffer(n, list) {
  var ret = Buffer.allocUnsafe(n);
  var p = list.head;
  var c = 1;
  p.data.copy(ret);
  n -= p.data.length;
  while (p = p.next) {
    var buf = p.data;
    var nb = n > buf.length ? buf.length : n;
    buf.copy(ret, ret.length - n, 0, nb);
    n -= nb;
    if (n === 0) {
      if (nb === buf.length) {
        ++c;
        if (p.next) list.head = p.next;else list.head = list.tail = null;
      } else {
        list.head = p;
        p.data = buf.slice(nb);
      }
      break;
    }
    ++c;
  }
  list.length -= c;
  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    nextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function forEach(xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

Writable.WritableState = WritableState;
inherits(Writable, EventEmitter);

function nop() {}

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

function WritableState(options, stream) {
  Object.defineProperty(this, 'buffer', {
    get: deprecate(function () {
      return this.getBuffer();
    }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.')
  });
  options = options || {};

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // allocate the first CorkedRequest, there is always
  // one allocated and free to use, and we maintain at most two
  this.corkedRequestsFree = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function writableStateGetBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};
function Writable(options) {

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex)) return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;
  }

  EventEmitter.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe, not readable'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  nextTick(cb, er);
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  var er = false;
  // Always throw error if a null is written
  // if we are not in object mode then throw
  // if it is not a buffer, string, or undefined.
  if (chunk === null) {
    er = new TypeError('May not write null values to stream');
  } else if (!Buffer$1.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  if (er) {
    stream.emit('error', er);
    nextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer$1.isBuffer(chunk)) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
  return this;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = Buffer$1.from(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);

  if (Buffer$1.isBuffer(chunk)) encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = new WriteReq(chunk, encoding, cb);
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;
  if (sync) nextTick(cb, er);else cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
        nextTick(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
        afterWrite(stream, state, finished, cb);
      }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    while (entry) {
      buffer[count] = entry;
      entry = entry.next;
      count += 1;
    }

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is almost always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    if (holder.next) {
      state.corkedRequestsFree = holder.next;
      holder.next = null;
    } else {
      state.corkedRequestsFree = new CorkedRequest(state);
    }
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequestCount = 0;
  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else {
      prefinish(stream, state);
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) nextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function (err) {
    var entry = _this.entry;
    _this.entry = null;
    while (entry) {
      var cb = entry.callback;
      state.pendingcb--;
      cb(err);
      entry = entry.next;
    }
    if (state.corkedRequestsFree) {
      state.corkedRequestsFree.next = _this;
    } else {
      state.corkedRequestsFree = _this;
    }
  };
}

inherits(Duplex, Readable);

var keys = Object.keys(Writable.prototype);
for (var v = 0; v < keys.length; v++) {
  var method = keys[v];
  if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
}
function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  nextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

inherits(Transform, Duplex);

function TransformState(stream) {
  this.afterTransform = function (er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
  this.writeencoding = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb) return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined) stream.push(data);

  cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}
function Transform(options) {
  if (!(this instanceof Transform)) return new Transform(options);

  Duplex.call(this, options);

  this._transformState = new TransformState(this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  if (options) {
    if (typeof options.transform === 'function') this._transform = options.transform;

    if (typeof options.flush === 'function') this._flush = options.flush;
  }

  this.once('prefinish', function () {
    if (typeof this._flush === 'function') this._flush(function (er) {
      done(stream, er);
    });else done(stream);
  });
}

Transform.prototype.push = function (chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function (chunk, encoding, cb) {
  throw new Error('Not implemented');
};

Transform.prototype._write = function (chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function (n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};

function done(stream, er) {
  if (er) return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var ts = stream._transformState;

  if (ws.length) throw new Error('Calling transform done when ws.length != 0');

  if (ts.transforming) throw new Error('Calling transform done when still transforming');

  return stream.push(null);
}

inherits(PassThrough, Transform);
function PassThrough(options) {
  if (!(this instanceof PassThrough)) return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function (chunk, encoding, cb) {
  cb(null, chunk);
};

inherits(Stream, EventEmitter);
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;

// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EventEmitter.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EventEmitter.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

class ResourceIdsReader extends EventEmitter {
  constructor({ resource }) {
    super();
    this.resource = resource;
    this.client = resource.client;
    this.stream = new ReadableStream({
      highWaterMark: this.client.parallelism * 3,
      start: this._start.bind(this),
      pull: this._pull.bind(this),
      cancel: this._cancel.bind(this)
    });
  }
  build() {
    return this.stream.getReader();
  }
  async _start(controller) {
    this.controller = controller;
    this.continuationToken = null;
    this.closeNextIteration = false;
  }
  async _pull(controller) {
    if (this.closeNextIteration) {
      controller.close();
      return;
    }
    const response = await this.client.listObjects({
      prefix: `resource=${this.resource.name}`,
      continuationToken: this.continuationToken
    });
    const keys = response?.Contents.map((x) => x.Key).map((x) => x.replace(this.client.config.keyPrefix, "")).map((x) => x.startsWith("/") ? x.replace(`/`, "") : x).map((x) => x.replace(`resource=${this.resource.name}/id=`, ""));
    this.continuationToken = response.NextContinuationToken;
    this.enqueue(keys);
    if (!response.IsTruncated) this.closeNextIteration = true;
  }
  enqueue(ids) {
    ids.forEach((key) => {
      this.controller.enqueue(key);
      this.emit("id", key);
    });
  }
  _cancel(reason) {
  }
}
var resource_ids_reader_class_default = ResourceIdsReader;

class ResourceIdsPageReader extends resource_ids_reader_class_default {
  enqueue(ids) {
    this.controller.enqueue(ids);
    this.emit("page", ids);
  }
}

class ResourceReader extends EventEmitter {
  constructor({ resource, batchSize = 10, concurrency = 5 }) {
    super();
    if (!resource) {
      throw new Error("Resource is required for ResourceReader");
    }
    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;
    this.input = new ResourceIdsPageReader({ resource: this.resource });
    this.transform = new Transform({
      objectMode: true,
      transform: this._transform.bind(this)
    });
    this.input.on("data", (chunk) => {
      this.transform.write(chunk);
    });
    this.input.on("end", () => {
      this.transform.end();
    });
    this.input.on("error", (error) => {
      this.emit("error", error);
    });
    this.transform.on("data", (data) => {
      this.emit("data", data);
    });
    this.transform.on("end", () => {
      this.emit("end");
    });
    this.transform.on("error", (error) => {
      this.emit("error", error);
    });
  }
  build() {
    return this;
  }
  async _transform(chunk, encoding, callback) {
    const [ok, err] = await try_fn_default(async () => {
      await PromisePool.for(chunk).withConcurrency(this.concurrency).handleError(async (error, content) => {
        this.emit("error", error, content);
      }).process(async (id) => {
        const data = await this.resource.get(id);
        this.push(data);
        return data;
      });
    });
    callback(err);
  }
  resume() {
    this.input.resume();
  }
}

class ResourceWriter extends EventEmitter {
  constructor({ resource, batchSize = 10, concurrency = 5 }) {
    super();
    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;
    this.buffer = [];
    this.writing = false;
    this.writable = new Writable({
      objectMode: true,
      write: this._write.bind(this)
    });
    this.writable.on("finish", () => {
      this.emit("finish");
    });
    this.writable.on("error", (error) => {
      this.emit("error", error);
    });
  }
  build() {
    return this;
  }
  write(chunk) {
    this.buffer.push(chunk);
    this._maybeWrite().catch((error) => {
      this.emit("error", error);
    });
    return true;
  }
  end() {
    this.ended = true;
    this._maybeWrite().catch((error) => {
      this.emit("error", error);
    });
  }
  async _maybeWrite() {
    if (this.writing) return;
    if (this.buffer.length === 0 && !this.ended) return;
    this.writing = true;
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.batchSize);
      const [ok, err] = await try_fn_default(async () => {
        await PromisePool.for(batch).withConcurrency(this.concurrency).handleError(async (error, content) => {
          this.emit("error", error, content);
        }).process(async (item) => {
          const [ok2, err2, result] = await try_fn_default(async () => {
            const res = await this.resource.insert(item);
            return res;
          });
          if (!ok2) {
            this.emit("error", err2, item);
            return null;
          }
          return result;
        });
      });
      if (!ok) {
        this.emit("error", err);
      }
    }
    this.writing = false;
    if (this.ended) {
      this.writable.emit("finish");
    }
  }
  async _write(chunk, encoding, callback) {
    callback();
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    if (!stream) {
      return reject(new Error("streamToString: stream is undefined"));
    }
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

class S3Cache extends Cache {
  constructor({
    client,
    keyPrefix = "cache",
    ttl = 0,
    prefix = void 0
  }) {
    super({ client, keyPrefix, ttl, prefix });
    this.client = client;
    this.keyPrefix = keyPrefix;
    this.config.ttl = ttl;
    this.config.client = client;
    this.config.prefix = prefix !== void 0 ? prefix : keyPrefix + (keyPrefix.endsWith("/") ? "" : "/");
  }
  async _set(key, data) {
    let body = JSON.stringify(data);
    const lengthSerialized = body.length;
    body = zlib.gzipSync(body).toString("base64");
    return this.client.putObject({
      key: join(this.keyPrefix, key),
      body,
      contentEncoding: "gzip",
      contentType: "application/gzip",
      metadata: {
        compressor: "zlib",
        compressed: "true",
        "client-id": this.client.id,
        "length-serialized": String(lengthSerialized),
        "length-compressed": String(body.length),
        "compression-gain": (body.length / lengthSerialized).toFixed(2)
      }
    });
  }
  async _get(key) {
    const [ok, err, result] = await try_fn_default(async () => {
      const { Body } = await this.client.getObject(join(this.keyPrefix, key));
      let content = await streamToString(Body);
      content = Buffer.from(content, "base64");
      content = zlib.unzipSync(content).toString();
      return JSON.parse(content);
    });
    if (ok) return result;
    if (err.name === "NoSuchKey" || err.name === "NotFound") return null;
    throw err;
  }
  async _del(key) {
    await this.client.deleteObject(join(this.keyPrefix, key));
    return true;
  }
  async _clear() {
    const keys = await this.client.getAllKeys({
      prefix: this.keyPrefix
    });
    await this.client.deleteObjects(keys);
  }
  async size() {
    const keys = await this.keys();
    return keys.length;
  }
  async keys() {
    const allKeys = await this.client.getAllKeys({ prefix: this.keyPrefix });
    const prefix = this.keyPrefix.endsWith("/") ? this.keyPrefix : this.keyPrefix + "/";
    return allKeys.map((k) => k.startsWith(prefix) ? k.slice(prefix.length) : k);
  }
}
var s3_cache_class_default = S3Cache;

class MemoryCache extends Cache {
  constructor(config = {}) {
    super(config);
    this.cache = {};
    this.meta = {};
    this.maxSize = config.maxSize || 0;
    this.ttl = config.ttl || 0;
  }
  async _set(key, data) {
    if (this.maxSize > 0 && Object.keys(this.cache).length >= this.maxSize) {
      const oldestKey = Object.entries(this.meta).sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
      if (oldestKey) {
        delete this.cache[oldestKey];
        delete this.meta[oldestKey];
      }
    }
    this.cache[key] = data;
    this.meta[key] = { ts: Date.now() };
    return data;
  }
  async _get(key) {
    if (!Object.prototype.hasOwnProperty.call(this.cache, key)) return null;
    if (this.ttl > 0) {
      const now = Date.now();
      const meta = this.meta[key];
      if (meta && now - meta.ts > this.ttl * 1e3) {
        delete this.cache[key];
        delete this.meta[key];
        return null;
      }
    }
    return this.cache[key];
  }
  async _del(key) {
    delete this.cache[key];
    delete this.meta[key];
    return true;
  }
  async _clear(prefix) {
    if (!prefix) {
      this.cache = {};
      this.meta = {};
      return true;
    }
    for (const key of Object.keys(this.cache)) {
      if (key.startsWith(prefix)) {
        delete this.cache[key];
        delete this.meta[key];
      }
    }
    return true;
  }
  async size() {
    return Object.keys(this.cache).length;
  }
  async keys() {
    return Object.keys(this.cache);
  }
}
var memory_cache_class_default = MemoryCache;

class CachePlugin extends plugin_class_default {
  constructor(options = {}) {
    super(options);
    this.driver = options.driver;
    this.config = {
      includePartitions: options.includePartitions !== false,
      ...options
    };
  }
  async setup(database) {
    await super.setup(database);
  }
  async onSetup() {
    if (this.config.driver) {
      this.driver = this.config.driver;
    } else if (this.config.driverType === "memory") {
      this.driver = new memory_cache_class_default(this.config.memoryOptions || {});
    } else {
      this.driver = new s3_cache_class_default({ client: this.database.client, ...this.config.s3Options || {} });
    }
    this.installDatabaseProxy();
    this.installResourceHooks();
  }
  async onStart() {
  }
  async onStop() {
  }
  installDatabaseProxy() {
    if (this.database._cacheProxyInstalled) {
      return;
    }
    const installResourceHooks = this.installResourceHooks.bind(this);
    this.database._originalCreateResourceForCache = this.database.createResource;
    this.database.createResource = async function(...args) {
      const resource = await this._originalCreateResourceForCache(...args);
      installResourceHooks(resource);
      return resource;
    };
    this.database._cacheProxyInstalled = true;
  }
  installResourceHooks() {
    for (const resource of Object.values(this.database.resources)) {
      this.installResourceHooksForResource(resource);
    }
  }
  installResourceHooksForResource(resource) {
    if (!this.driver) return;
    Object.defineProperty(resource, "cache", {
      value: this.driver,
      writable: true,
      configurable: true,
      enumerable: false
    });
    resource.cacheKeyFor = async (options = {}) => {
      const { action, params = {}, partition, partitionValues } = options;
      return this.generateCacheKey(resource, action, params, partition, partitionValues);
    };
    const cacheMethods = [
      "count",
      "listIds",
      "getMany",
      "getAll",
      "page",
      "list",
      "get"
    ];
    for (const method of cacheMethods) {
      resource.useMiddleware(method, async (ctx, next) => {
        let key;
        if (method === "getMany") {
          key = await resource.cacheKeyFor({ action: method, params: { ids: ctx.args[0] } });
        } else if (method === "page") {
          const { offset, size, partition, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({ action: method, params: { offset, size }, partition, partitionValues });
        } else if (method === "list" || method === "listIds" || method === "count") {
          const { partition, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({ action: method, partition, partitionValues });
        } else if (method === "getAll") {
          key = await resource.cacheKeyFor({ action: method });
        } else if (method === "get") {
          key = await resource.cacheKeyFor({ action: method, params: { id: ctx.args[0] } });
        }
        const [ok, err, cached] = await try_fn_default(() => resource.cache.get(key));
        if (ok && cached !== null && cached !== void 0) return cached;
        if (!ok && err.name !== "NoSuchKey") throw err;
        const result = await next();
        await resource.cache.set(key, result);
        return result;
      });
    }
    const writeMethods = ["insert", "update", "delete", "deleteMany"];
    for (const method of writeMethods) {
      resource.useMiddleware(method, async (ctx, next) => {
        const result = await next();
        if (method === "insert") {
          await this.clearCacheForResource(resource, ctx.args[0]);
        } else if (method === "update") {
          await this.clearCacheForResource(resource, { id: ctx.args[0], ...ctx.args[1] });
        } else if (method === "delete") {
          let data = { id: ctx.args[0] };
          if (typeof resource.get === "function") {
            const [ok, err, full] = await try_fn_default(() => resource.get(ctx.args[0]));
            if (ok && full) data = full;
          }
          await this.clearCacheForResource(resource, data);
        } else if (method === "deleteMany") {
          await this.clearCacheForResource(resource);
        }
        return result;
      });
    }
  }
  async clearCacheForResource(resource, data) {
    if (!resource.cache) return;
    const keyPrefix = `resource=${resource.name}`;
    await resource.cache.clear(keyPrefix);
    if (this.config.includePartitions === true && resource.config?.partitions && Object.keys(resource.config.partitions).length > 0) {
      if (!data) {
        for (const partitionName of Object.keys(resource.config.partitions)) {
          const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
          await resource.cache.clear(partitionKeyPrefix);
        }
      } else {
        const partitionValues = this.getPartitionValues(data, resource);
        for (const [partitionName, values] of Object.entries(partitionValues)) {
          if (values && Object.keys(values).length > 0 && Object.values(values).some((v) => v !== null && v !== void 0)) {
            const partitionKeyPrefix = join(keyPrefix, `partition=${partitionName}`);
            await resource.cache.clear(partitionKeyPrefix);
          }
        }
      }
    }
  }
  async generateCacheKey(resource, action, params = {}, partition = null, partitionValues = null) {
    const keyParts = [
      `resource=${resource.name}`,
      `action=${action}`
    ];
    if (partition && partitionValues && Object.keys(partitionValues).length > 0) {
      keyParts.push(`partition:${partition}`);
      for (const [field, value] of Object.entries(partitionValues)) {
        if (value !== null && value !== void 0) {
          keyParts.push(`${field}:${value}`);
        }
      }
    }
    if (Object.keys(params).length > 0) {
      const paramsHash = await this.hashParams(params);
      keyParts.push(paramsHash);
    }
    return join(...keyParts) + ".json.gz";
  }
  async hashParams(params) {
    const sortedParams = Object.keys(params).sort().map((key) => `${key}:${params[key]}`).join("|") || "empty";
    return await sha256(sortedParams);
  }
  // Utility methods
  async getCacheStats() {
    if (!this.driver) return null;
    return {
      size: await this.driver.size(),
      keys: await this.driver.keys(),
      driver: this.driver.constructor.name
    };
  }
  async clearAllCache() {
    if (!this.driver) return;
    for (const resource of Object.values(this.database.resources)) {
      if (resource.cache) {
        const keyPrefix = `resource=${resource.name}`;
        await resource.cache.clear(keyPrefix);
      }
    }
  }
  async warmCache(resourceName, options = {}) {
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    const { includePartitions = true } = options;
    await resource.getAll();
    if (includePartitions && resource.config.partitions) {
      for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
        if (partitionDef.fields) {
          const allRecords = await resource.getAll();
          const recordsArray = Array.isArray(allRecords) ? allRecords : [];
          const partitionValues = /* @__PURE__ */ new Set();
          for (const record of recordsArray.slice(0, 10)) {
            const values = this.getPartitionValues(record, resource);
            if (values[partitionName]) {
              partitionValues.add(JSON.stringify(values[partitionName]));
            }
          }
          for (const partitionValueStr of partitionValues) {
            const partitionValues2 = JSON.parse(partitionValueStr);
            await resource.list({ partition: partitionName, partitionValues: partitionValues2 });
          }
        }
      }
    }
  }
}

const CostsPlugin = {
  async setup(db) {
    if (!db || !db.client) {
      return;
    }
    this.client = db.client;
    this.map = {
      PutObjectCommand: "put",
      GetObjectCommand: "get",
      HeadObjectCommand: "head",
      DeleteObjectCommand: "delete",
      DeleteObjectsCommand: "delete",
      ListObjectsV2Command: "list"
    };
    this.costs = {
      total: 0,
      prices: {
        put: 5e-3 / 1e3,
        copy: 5e-3 / 1e3,
        list: 5e-3 / 1e3,
        post: 5e-3 / 1e3,
        get: 4e-4 / 1e3,
        select: 4e-4 / 1e3,
        delete: 4e-4 / 1e3,
        head: 4e-4 / 1e3
      },
      requests: {
        total: 0,
        put: 0,
        post: 0,
        copy: 0,
        list: 0,
        get: 0,
        select: 0,
        delete: 0,
        head: 0
      },
      events: {
        total: 0,
        PutObjectCommand: 0,
        GetObjectCommand: 0,
        HeadObjectCommand: 0,
        DeleteObjectCommand: 0,
        DeleteObjectsCommand: 0,
        ListObjectsV2Command: 0
      }
    };
    this.client.costs = JSON.parse(JSON.stringify(this.costs));
  },
  async start() {
    if (this.client) {
      this.client.on("command.response", (name) => this.addRequest(name, this.map[name]));
      this.client.on("command.error", (name) => this.addRequest(name, this.map[name]));
    }
  },
  addRequest(name, method) {
    if (!method) return;
    this.costs.events[name]++;
    this.costs.events.total++;
    this.costs.requests.total++;
    this.costs.requests[method]++;
    this.costs.total += this.costs.prices[method];
    if (this.client && this.client.costs) {
      this.client.costs.events[name]++;
      this.client.costs.events.total++;
      this.client.costs.requests.total++;
      this.client.costs.requests[method]++;
      this.client.costs.total += this.client.costs.prices[method];
    }
  }
};

class FullTextPlugin extends plugin_class_default {
  constructor(options = {}) {
    super();
    this.indexResource = null;
    this.config = {
      minWordLength: options.minWordLength || 3,
      maxResults: options.maxResults || 100,
      ...options
    };
    this.indexes = /* @__PURE__ */ new Map();
  }
  async setup(database) {
    this.database = database;
    const [ok, err, indexResource] = await try_fn_default(() => database.createResource({
      name: "fulltext_indexes",
      attributes: {
        id: "string|required",
        resourceName: "string|required",
        fieldName: "string|required",
        word: "string|required",
        recordIds: "json|required",
        // Array of record IDs containing this word
        count: "number|required",
        lastUpdated: "string|required"
      }
    }));
    this.indexResource = ok ? indexResource : database.resources.fulltext_indexes;
    await this.loadIndexes();
    this.installIndexingHooks();
  }
  async start() {
  }
  async stop() {
    await this.saveIndexes();
  }
  async loadIndexes() {
    if (!this.indexResource) return;
    const [ok, err, allIndexes] = await try_fn_default(() => this.indexResource.getAll());
    if (ok) {
      for (const indexRecord of allIndexes) {
        const key = `${indexRecord.resourceName}:${indexRecord.fieldName}:${indexRecord.word}`;
        this.indexes.set(key, {
          recordIds: indexRecord.recordIds || [],
          count: indexRecord.count || 0
        });
      }
    }
  }
  async saveIndexes() {
    if (!this.indexResource) return;
    const [ok, err] = await try_fn_default(async () => {
      const existingIndexes = await this.indexResource.getAll();
      for (const index of existingIndexes) {
        await this.indexResource.delete(index.id);
      }
      for (const [key, data] of this.indexes.entries()) {
        const [resourceName, fieldName, word] = key.split(":");
        await this.indexResource.insert({
          id: `index-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          resourceName,
          fieldName,
          word,
          recordIds: data.recordIds,
          count: data.count,
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    });
  }
  installIndexingHooks() {
    if (!this.database.plugins) {
      this.database.plugins = {};
    }
    this.database.plugins.fulltext = this;
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === "fulltext_indexes") continue;
      this.installResourceHooks(resource);
    }
    if (!this.database._fulltextProxyInstalled) {
      this.database._previousCreateResourceForFullText = this.database.createResource;
      this.database.createResource = async function(...args) {
        const resource = await this._previousCreateResourceForFullText(...args);
        if (this.plugins?.fulltext && resource.name !== "fulltext_indexes") {
          this.plugins.fulltext.installResourceHooks(resource);
        }
        return resource;
      };
      this.database._fulltextProxyInstalled = true;
    }
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== "fulltext_indexes") {
        this.installResourceHooks(resource);
      }
    }
  }
  installResourceHooks(resource) {
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    this.wrapResourceMethod(resource, "insert", async (result, args, methodName) => {
      const [data] = args;
      this.indexRecord(resource.name, result.id, data).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "update", async (result, args, methodName) => {
      const [id, data] = args;
      this.removeRecordFromIndex(resource.name, id).catch(console.error);
      this.indexRecord(resource.name, id, result).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "delete", async (result, args, methodName) => {
      const [id] = args;
      this.removeRecordFromIndex(resource.name, id).catch(console.error);
      return result;
    });
    this.wrapResourceMethod(resource, "deleteMany", async (result, args, methodName) => {
      const [ids] = args;
      for (const id of ids) {
        this.removeRecordFromIndex(resource.name, id).catch(console.error);
      }
      return result;
    });
  }
  async indexRecord(resourceName, recordId, data) {
    const indexedFields = this.getIndexedFields(resourceName);
    if (!indexedFields || indexedFields.length === 0) {
      return;
    }
    for (const fieldName of indexedFields) {
      const fieldValue = this.getFieldValue(data, fieldName);
      if (!fieldValue) {
        continue;
      }
      const words = this.tokenize(fieldValue);
      for (const word of words) {
        if (word.length < this.config.minWordLength) {
          continue;
        }
        const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
        const existing = this.indexes.get(key) || { recordIds: [], count: 0 };
        if (!existing.recordIds.includes(recordId)) {
          existing.recordIds.push(recordId);
          existing.count = existing.recordIds.length;
        }
        this.indexes.set(key, existing);
      }
    }
  }
  async removeRecordFromIndex(resourceName, recordId) {
    for (const [key, data] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        const index = data.recordIds.indexOf(recordId);
        if (index > -1) {
          data.recordIds.splice(index, 1);
          data.count = data.recordIds.length;
          if (data.recordIds.length === 0) {
            this.indexes.delete(key);
          } else {
            this.indexes.set(key, data);
          }
        }
      }
    }
  }
  getFieldValue(data, fieldPath) {
    if (!fieldPath.includes(".")) {
      return data && data[fieldPath] !== void 0 ? data[fieldPath] : null;
    }
    const keys = fieldPath.split(".");
    let value = data;
    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return value;
  }
  tokenize(text) {
    if (!text) return [];
    const str = String(text).toLowerCase();
    return str.replace(/[^\w\s\u00C0-\u017F]/g, " ").split(/\s+/).filter((word) => word.length > 0);
  }
  getIndexedFields(resourceName) {
    if (this.config.fields) {
      return this.config.fields;
    }
    const fieldMappings = {
      users: ["name", "email"],
      products: ["name", "description"],
      articles: ["title", "content"]
      // Add more mappings as needed
    };
    return fieldMappings[resourceName] || [];
  }
  // Main search method
  async search(resourceName, query, options = {}) {
    const {
      fields = null,
      // Specific fields to search in
      limit = this.config.maxResults,
      offset = 0,
      exactMatch = false
    } = options;
    if (!query || query.trim().length === 0) {
      return [];
    }
    const searchWords = this.tokenize(query);
    const results = /* @__PURE__ */ new Map();
    const searchFields = fields || this.getIndexedFields(resourceName);
    if (searchFields.length === 0) {
      return [];
    }
    for (const word of searchWords) {
      if (word.length < this.config.minWordLength) continue;
      for (const fieldName of searchFields) {
        if (exactMatch) {
          const key = `${resourceName}:${fieldName}:${word.toLowerCase()}`;
          const indexData = this.indexes.get(key);
          if (indexData) {
            for (const recordId of indexData.recordIds) {
              const currentScore = results.get(recordId) || 0;
              results.set(recordId, currentScore + 1);
            }
          }
        } else {
          for (const [key, indexData] of this.indexes.entries()) {
            if (key.startsWith(`${resourceName}:${fieldName}:${word.toLowerCase()}`)) {
              for (const recordId of indexData.recordIds) {
                const currentScore = results.get(recordId) || 0;
                results.set(recordId, currentScore + 1);
              }
            }
          }
        }
      }
    }
    const sortedResults = Array.from(results.entries()).map(([recordId, score]) => ({ recordId, score })).sort((a, b) => b.score - a.score).slice(offset, offset + limit);
    return sortedResults;
  }
  // Search and return full records
  async searchRecords(resourceName, query, options = {}) {
    const searchResults = await this.search(resourceName, query, options);
    if (searchResults.length === 0) {
      return [];
    }
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    const recordIds = searchResults.map((result2) => result2.recordId);
    const records = await resource.getMany(recordIds);
    const result = records.filter((record) => record && typeof record === "object").map((record) => {
      const searchResult = searchResults.find((sr) => sr.recordId === record.id);
      return {
        ...record,
        _searchScore: searchResult ? searchResult.score : 0
      };
    }).sort((a, b) => b._searchScore - a._searchScore);
    return result;
  }
  // Utility methods
  async rebuildIndex(resourceName) {
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new Error(`Resource '${resourceName}' not found`);
    }
    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }
    const allRecords = await resource.getAll();
    const batchSize = 100;
    for (let i = 0; i < allRecords.length; i += batchSize) {
      const batch = allRecords.slice(i, i + batchSize);
      for (const record of batch) {
        const [ok, err] = await try_fn_default(() => this.indexRecord(resourceName, record.id, record));
      }
    }
    await this.saveIndexes();
  }
  async getIndexStats() {
    const stats = {
      totalIndexes: this.indexes.size,
      resources: {},
      totalWords: 0
    };
    for (const [key, data] of this.indexes.entries()) {
      const [resourceName, fieldName] = key.split(":");
      if (!stats.resources[resourceName]) {
        stats.resources[resourceName] = {
          fields: {},
          totalRecords: /* @__PURE__ */ new Set(),
          totalWords: 0
        };
      }
      if (!stats.resources[resourceName].fields[fieldName]) {
        stats.resources[resourceName].fields[fieldName] = {
          words: 0,
          totalOccurrences: 0
        };
      }
      stats.resources[resourceName].fields[fieldName].words++;
      stats.resources[resourceName].fields[fieldName].totalOccurrences += data.count;
      stats.resources[resourceName].totalWords++;
      for (const recordId of data.recordIds) {
        stats.resources[resourceName].totalRecords.add(recordId);
      }
      stats.totalWords++;
    }
    for (const resourceName in stats.resources) {
      stats.resources[resourceName].totalRecords = stats.resources[resourceName].totalRecords.size;
    }
    return stats;
  }
  async rebuildAllIndexes({ timeout } = {}) {
    if (timeout) {
      return Promise.race([
        this._rebuildAllIndexesInternal(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))
      ]);
    }
    return this._rebuildAllIndexesInternal();
  }
  async _rebuildAllIndexesInternal() {
    const resourceNames = Object.keys(this.database.resources).filter((name) => name !== "fulltext_indexes");
    for (const resourceName of resourceNames) {
      const [ok, err] = await try_fn_default(() => this.rebuildIndex(resourceName));
    }
  }
  async clearIndex(resourceName) {
    for (const [key] of this.indexes.entries()) {
      if (key.startsWith(`${resourceName}:`)) {
        this.indexes.delete(key);
      }
    }
    await this.saveIndexes();
  }
  async clearAllIndexes() {
    this.indexes.clear();
    await this.saveIndexes();
  }
}

class MetricsPlugin extends plugin_class_default {
  constructor(options = {}) {
    super();
    this.config = {
      collectPerformance: options.collectPerformance !== false,
      collectErrors: options.collectErrors !== false,
      collectUsage: options.collectUsage !== false,
      retentionDays: options.retentionDays || 30,
      flushInterval: options.flushInterval || 6e4,
      // 1 minute
      ...options
    };
    this.metrics = {
      operations: {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      },
      resources: {},
      errors: [],
      performance: [],
      startTime: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.flushTimer = null;
  }
  async setup(database) {
    this.database = database;
    if (process.env.NODE_ENV === "test") return;
    const [ok, err] = await try_fn_default(async () => {
      const [ok1, err1, metricsResource] = await try_fn_default(() => database.createResource({
        name: "metrics",
        attributes: {
          id: "string|required",
          type: "string|required",
          // 'operation', 'error', 'performance'
          resourceName: "string",
          operation: "string",
          count: "number|required",
          totalTime: "number|required",
          errors: "number|required",
          avgTime: "number|required",
          timestamp: "string|required",
          metadata: "json"
        }
      }));
      this.metricsResource = ok1 ? metricsResource : database.resources.metrics;
      const [ok2, err2, errorsResource] = await try_fn_default(() => database.createResource({
        name: "error_logs",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          error: "string|required",
          timestamp: "string|required",
          metadata: "json"
        }
      }));
      this.errorsResource = ok2 ? errorsResource : database.resources.error_logs;
      const [ok3, err3, performanceResource] = await try_fn_default(() => database.createResource({
        name: "performance_logs",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          duration: "number|required",
          timestamp: "string|required",
          metadata: "json"
        }
      }));
      this.performanceResource = ok3 ? performanceResource : database.resources.performance_logs;
    });
    if (!ok) {
      this.metricsResource = database.resources.metrics;
      this.errorsResource = database.resources.error_logs;
      this.performanceResource = database.resources.performance_logs;
    }
    this.installMetricsHooks();
    if (process.env.NODE_ENV !== "test") {
      this.startFlushTimer();
    }
  }
  async start() {
  }
  async stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (process.env.NODE_ENV !== "test") {
      await this.flushMetrics();
    }
  }
  installMetricsHooks() {
    for (const resource of Object.values(this.database.resources)) {
      if (["metrics", "error_logs", "performance_logs"].includes(resource.name)) {
        continue;
      }
      this.installResourceHooks(resource);
    }
    this.database._createResource = this.database.createResource;
    this.database.createResource = async function(...args) {
      const resource = await this._createResource(...args);
      if (this.plugins?.metrics && !["metrics", "error_logs", "performance_logs"].includes(resource.name)) {
        this.plugins.metrics.installResourceHooks(resource);
      }
      return resource;
    };
  }
  installResourceHooks(resource) {
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    resource._get = resource.get;
    resource._getMany = resource.getMany;
    resource._getAll = resource.getAll;
    resource._list = resource.list;
    resource._listIds = resource.listIds;
    resource._count = resource.count;
    resource._page = resource.page;
    resource.insert = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._insert(...args));
      this.recordOperation(resource.name, "insert", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "insert", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.update = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._update(...args));
      this.recordOperation(resource.name, "update", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "update", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.delete = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._delete(...args));
      this.recordOperation(resource.name, "delete", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "delete", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.deleteMany = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._deleteMany(...args));
      this.recordOperation(resource.name, "delete", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "delete", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.get = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._get(...args));
      this.recordOperation(resource.name, "get", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "get", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.getMany = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._getMany(...args));
      this.recordOperation(resource.name, "get", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "get", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.getAll = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._getAll(...args));
      this.recordOperation(resource.name, "list", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "list", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.list = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._list(...args));
      this.recordOperation(resource.name, "list", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "list", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.listIds = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._listIds(...args));
      this.recordOperation(resource.name, "list", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "list", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.count = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._count(...args));
      this.recordOperation(resource.name, "count", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "count", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.page = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await try_fn_default(() => resource._page(...args));
      this.recordOperation(resource.name, "list", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "list", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
  }
  recordOperation(resourceName, operation, duration, isError) {
    if (this.metrics.operations[operation]) {
      this.metrics.operations[operation].count++;
      this.metrics.operations[operation].totalTime += duration;
      if (isError) {
        this.metrics.operations[operation].errors++;
      }
    }
    if (!this.metrics.resources[resourceName]) {
      this.metrics.resources[resourceName] = {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      };
    }
    if (this.metrics.resources[resourceName][operation]) {
      this.metrics.resources[resourceName][operation].count++;
      this.metrics.resources[resourceName][operation].totalTime += duration;
      if (isError) {
        this.metrics.resources[resourceName][operation].errors++;
      }
    }
    if (this.config.collectPerformance) {
      this.metrics.performance.push({
        resourceName,
        operation,
        duration,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  recordError(resourceName, operation, error) {
    if (!this.config.collectErrors) return;
    this.metrics.errors.push({
      resourceName,
      operation,
      error: error.message,
      stack: error.stack,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  startFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (this.config.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flushMetrics().catch(console.error);
      }, this.config.flushInterval);
    }
  }
  async flushMetrics() {
    if (!this.metricsResource) return;
    const [ok, err] = await try_fn_default(async () => {
      const metadata = process.env.NODE_ENV === "test" ? {} : { global: "true" };
      const perfMetadata = process.env.NODE_ENV === "test" ? {} : { perf: "true" };
      const errorMetadata = process.env.NODE_ENV === "test" ? {} : { error: "true" };
      const resourceMetadata = process.env.NODE_ENV === "test" ? {} : { resource: "true" };
      for (const [operation, data] of Object.entries(this.metrics.operations)) {
        if (data.count > 0) {
          await this.metricsResource.insert({
            id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: "operation",
            resourceName: "global",
            operation,
            count: data.count,
            totalTime: data.totalTime,
            errors: data.errors,
            avgTime: data.count > 0 ? data.totalTime / data.count : 0,
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            metadata
          });
        }
      }
      for (const [resourceName, operations] of Object.entries(this.metrics.resources)) {
        for (const [operation, data] of Object.entries(operations)) {
          if (data.count > 0) {
            await this.metricsResource.insert({
              id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: "operation",
              resourceName,
              operation,
              count: data.count,
              totalTime: data.totalTime,
              errors: data.errors,
              avgTime: data.count > 0 ? data.totalTime / data.count : 0,
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              metadata: resourceMetadata
            });
          }
        }
      }
      if (this.config.collectPerformance && this.metrics.performance.length > 0) {
        for (const perf of this.metrics.performance) {
          await this.performanceResource.insert({
            id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: perf.resourceName,
            operation: perf.operation,
            duration: perf.duration,
            timestamp: perf.timestamp,
            metadata: perfMetadata
          });
        }
      }
      if (this.config.collectErrors && this.metrics.errors.length > 0) {
        for (const error of this.metrics.errors) {
          await this.errorsResource.insert({
            id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: error.resourceName,
            operation: error.operation,
            error: error.error,
            stack: error.stack,
            timestamp: error.timestamp,
            metadata: errorMetadata
          });
        }
      }
      this.resetMetrics();
    });
    if (!ok) {
      console.error("Failed to flush metrics:", err);
    }
  }
  resetMetrics() {
    for (const operation of Object.keys(this.metrics.operations)) {
      this.metrics.operations[operation] = { count: 0, totalTime: 0, errors: 0 };
    }
    for (const resourceName of Object.keys(this.metrics.resources)) {
      for (const operation of Object.keys(this.metrics.resources[resourceName])) {
        this.metrics.resources[resourceName][operation] = { count: 0, totalTime: 0, errors: 0 };
      }
    }
    this.metrics.performance = [];
    this.metrics.errors = [];
  }
  // Utility methods
  async getMetrics(options = {}) {
    const {
      type = "operation",
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;
    if (!this.metricsResource) return [];
    const allMetrics = await this.metricsResource.getAll();
    let filtered = allMetrics.filter((metric) => {
      if (type && metric.type !== type) return false;
      if (resourceName && metric.resourceName !== resourceName) return false;
      if (operation && metric.operation !== operation) return false;
      if (startDate && new Date(metric.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(metric.timestamp) > new Date(endDate)) return false;
      return true;
    });
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return filtered.slice(offset, offset + limit);
  }
  async getErrorLogs(options = {}) {
    if (!this.errorsResource) return [];
    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;
    const allErrors = await this.errorsResource.getAll();
    let filtered = allErrors.filter((error) => {
      if (resourceName && error.resourceName !== resourceName) return false;
      if (operation && error.operation !== operation) return false;
      if (startDate && new Date(error.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(error.timestamp) > new Date(endDate)) return false;
      return true;
    });
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return filtered.slice(offset, offset + limit);
  }
  async getPerformanceLogs(options = {}) {
    if (!this.performanceResource) return [];
    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;
    const allPerformance = await this.performanceResource.getAll();
    let filtered = allPerformance.filter((perf) => {
      if (resourceName && perf.resourceName !== resourceName) return false;
      if (operation && perf.operation !== operation) return false;
      if (startDate && new Date(perf.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(perf.timestamp) > new Date(endDate)) return false;
      return true;
    });
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return filtered.slice(offset, offset + limit);
  }
  async getStats() {
    const now = /* @__PURE__ */ new Date();
    const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
    const [metrics, errors, performance] = await Promise.all([
      this.getMetrics({ startDate: startDate.toISOString() }),
      this.getErrorLogs({ startDate: startDate.toISOString() }),
      this.getPerformanceLogs({ startDate: startDate.toISOString() })
    ]);
    const stats = {
      period: "24h",
      totalOperations: 0,
      totalErrors: errors.length,
      avgResponseTime: 0,
      operationsByType: {},
      resources: {},
      uptime: {
        startTime: this.metrics.startTime,
        duration: now.getTime() - new Date(this.metrics.startTime).getTime()
      }
    };
    for (const metric of metrics) {
      if (metric.type === "operation") {
        stats.totalOperations += metric.count;
        if (!stats.operationsByType[metric.operation]) {
          stats.operationsByType[metric.operation] = {
            count: 0,
            errors: 0,
            avgTime: 0
          };
        }
        stats.operationsByType[metric.operation].count += metric.count;
        stats.operationsByType[metric.operation].errors += metric.errors;
        const current = stats.operationsByType[metric.operation];
        const totalCount2 = current.count;
        const newAvg = (current.avgTime * (totalCount2 - metric.count) + metric.totalTime) / totalCount2;
        current.avgTime = newAvg;
      }
    }
    const totalTime = metrics.reduce((sum, m) => sum + m.totalTime, 0);
    const totalCount = metrics.reduce((sum, m) => sum + m.count, 0);
    stats.avgResponseTime = totalCount > 0 ? totalTime / totalCount : 0;
    return stats;
  }
  async cleanupOldData() {
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    if (this.metricsResource) {
      const oldMetrics = await this.getMetrics({ endDate: cutoffDate.toISOString() });
      for (const metric of oldMetrics) {
        await this.metricsResource.delete(metric.id);
      }
    }
    if (this.errorsResource) {
      const oldErrors = await this.getErrorLogs({ endDate: cutoffDate.toISOString() });
      for (const error of oldErrors) {
        await this.errorsResource.delete(error.id);
      }
    }
    if (this.performanceResource) {
      const oldPerformance = await this.getPerformanceLogs({ endDate: cutoffDate.toISOString() });
      for (const perf of oldPerformance) {
        await this.performanceResource.delete(perf.id);
      }
    }
  }
}

class BaseReplicator extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.name = this.constructor.name;
    this.enabled = config.enabled !== false;
  }
  /**
   * Initialize the replicator
   * @param {Object} database - The s3db database instance
   * @returns {Promise<void>}
   */
  async initialize(database) {
    this.database = database;
    this.emit("initialized", { replicator: this.name });
  }
  /**
   * Replicate data to the target
   * @param {string} resourceName - Name of the resource being replicated
   * @param {string} operation - Operation type (insert, update, delete)
   * @param {Object} data - The data to replicate
   * @param {string} id - Record ID
   * @returns {Promise<Object>} replicator result
   */
  async replicate(resourceName, operation, data, id) {
    throw new Error(`replicate() method must be implemented by ${this.name}`);
  }
  /**
   * Replicate multiple records in batch
   * @param {string} resourceName - Name of the resource being replicated
   * @param {Array} records - Array of records to replicate
   * @returns {Promise<Object>} Batch replicator result
   */
  async replicateBatch(resourceName, records) {
    throw new Error(`replicateBatch() method must be implemented by ${this.name}`);
  }
  /**
   * Test the connection to the target
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    throw new Error(`testConnection() method must be implemented by ${this.name}`);
  }
  /**
   * Get replicator status and statistics
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    return {
      name: this.name,
      // Removed: enabled: this.enabled,
      config: this.config,
      connected: false
    };
  }
  /**
   * Cleanup resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.emit("cleanup", { replicator: this.name });
  }
  /**
   * Validate replicator configuration
   * @returns {Object} Validation result
   */
  validateConfig() {
    return { isValid: true, errors: [] };
  }
}
var base_replicator_class_default = BaseReplicator;

class BigqueryReplicator extends base_replicator_class_default {
  constructor(config = {}, resources = {}) {
    super(config);
    this.projectId = config.projectId;
    this.datasetId = config.datasetId;
    this.bigqueryClient = null;
    this.credentials = config.credentials;
    this.location = config.location || "US";
    this.logTable = config.logTable;
    this.resources = this.parseResourcesConfig(resources);
  }
  parseResourcesConfig(resources) {
    const parsed = {};
    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === "string") {
        parsed[resourceName] = [{
          table: config,
          actions: ["insert"],
          transform: null
        }];
      } else if (Array.isArray(config)) {
        parsed[resourceName] = config.map((item) => {
          if (typeof item === "string") {
            return { table: item, actions: ["insert"], transform: null };
          }
          return {
            table: item.table,
            actions: item.actions || ["insert"],
            transform: item.transform || null
          };
        });
      } else if (typeof config === "object") {
        parsed[resourceName] = [{
          table: config.table,
          actions: config.actions || ["insert"],
          transform: config.transform || null
        }];
      }
    }
    return parsed;
  }
  validateConfig() {
    const errors = [];
    if (!this.projectId) errors.push("projectId is required");
    if (!this.datasetId) errors.push("datasetId is required");
    if (Object.keys(this.resources).length === 0) errors.push("At least one resource must be configured");
    for (const [resourceName, tables] of Object.entries(this.resources)) {
      for (const tableConfig of tables) {
        if (!tableConfig.table) {
          errors.push(`Table name is required for resource '${resourceName}'`);
        }
        if (!Array.isArray(tableConfig.actions) || tableConfig.actions.length === 0) {
          errors.push(`Actions array is required for resource '${resourceName}'`);
        }
        const validActions = ["insert", "update", "delete"];
        const invalidActions = tableConfig.actions.filter((action) => !validActions.includes(action));
        if (invalidActions.length > 0) {
          errors.push(`Invalid actions for resource '${resourceName}': ${invalidActions.join(", ")}. Valid actions: ${validActions.join(", ")}`);
        }
        if (tableConfig.transform && typeof tableConfig.transform !== "function") {
          errors.push(`Transform must be a function for resource '${resourceName}'`);
        }
      }
    }
    return { isValid: errors.length === 0, errors };
  }
  async initialize(database) {
    await super.initialize(database);
    const [ok, err, sdk] = await try_fn_default(() => import('@google-cloud/bigquery'));
    if (!ok) {
      this.emit("initialization_error", { replicator: this.name, error: err.message });
      throw err;
    }
    const { BigQuery } = sdk;
    this.bigqueryClient = new BigQuery({
      projectId: this.projectId,
      credentials: this.credentials,
      location: this.location
    });
    this.emit("initialized", {
      replicator: this.name,
      projectId: this.projectId,
      datasetId: this.datasetId,
      resources: Object.keys(this.resources)
    });
  }
  shouldReplicateResource(resourceName) {
    return this.resources.hasOwnProperty(resourceName);
  }
  shouldReplicateAction(resourceName, operation) {
    if (!this.resources[resourceName]) return false;
    return this.resources[resourceName].some(
      (tableConfig) => tableConfig.actions.includes(operation)
    );
  }
  getTablesForResource(resourceName, operation) {
    if (!this.resources[resourceName]) return [];
    return this.resources[resourceName].filter((tableConfig) => tableConfig.actions.includes(operation)).map((tableConfig) => ({
      table: tableConfig.table,
      transform: tableConfig.transform
    }));
  }
  applyTransform(data, transformFn) {
    if (!transformFn) return data;
    let transformedData = JSON.parse(JSON.stringify(data));
    if (transformedData._length) delete transformedData._length;
    return transformFn(transformedData);
  }
  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    if (!this.shouldReplicateAction(resourceName, operation)) {
      return { skipped: true, reason: "action_not_included" };
    }
    const tableConfigs = this.getTablesForResource(resourceName, operation);
    if (tableConfigs.length === 0) {
      return { skipped: true, reason: "no_tables_for_action" };
    }
    const results = [];
    const errors = [];
    const [ok, err, result] = await try_fn_default(async () => {
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      for (const tableConfig of tableConfigs) {
        const [okTable, errTable] = await try_fn_default(async () => {
          const table = dataset.table(tableConfig.table);
          let job;
          if (operation === "insert") {
            const transformedData = this.applyTransform(data, tableConfig.transform);
            job = await table.insert([transformedData]);
          } else if (operation === "update") {
            const transformedData = this.applyTransform(data, tableConfig.transform);
            const keys = Object.keys(transformedData).filter((k) => k !== "id");
            const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
            const params = { id, ...transformedData };
            const query = `UPDATE \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` SET ${setClause} WHERE id = @id`;
            const maxRetries = 2;
            let lastError = null;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                const [updateJob] = await this.bigqueryClient.createQueryJob({
                  query,
                  params,
                  location: this.location
                });
                await updateJob.getQueryResults();
                job = [updateJob];
                break;
              } catch (error) {
                lastError = error;
                if (error?.message?.includes("streaming buffer") && attempt < maxRetries) {
                  const delaySeconds = 30;
                  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1e3));
                  continue;
                }
                throw error;
              }
            }
            if (!job) throw lastError;
          } else if (operation === "delete") {
            const query = `DELETE FROM \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` WHERE id = @id`;
            const [deleteJob] = await this.bigqueryClient.createQueryJob({
              query,
              params: { id },
              location: this.location
            });
            await deleteJob.getQueryResults();
            job = [deleteJob];
          } else {
            throw new Error(`Unsupported operation: ${operation}`);
          }
          results.push({
            table: tableConfig.table,
            success: true,
            jobId: job[0]?.id
          });
        });
        if (!okTable) {
          errors.push({
            table: tableConfig.table,
            error: errTable.message
          });
        }
      }
      if (this.logTable) {
        const [okLog, errLog] = await try_fn_default(async () => {
          const logTable = dataset.table(this.logTable);
          await logTable.insert([{
            resource_name: resourceName,
            operation,
            record_id: id,
            data: JSON.stringify(data),
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            source: "s3db-replicator"
          }]);
        });
        if (!okLog) {
        }
      }
      const success = errors.length === 0;
      this.emit("replicated", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        tables: tableConfigs.map((t) => t.table),
        results,
        errors,
        success
      });
      return {
        success,
        results,
        errors,
        tables: tableConfigs.map((t) => t.table)
      };
    });
    if (ok) return result;
    this.emit("replicator_error", {
      replicator: this.name,
      resourceName,
      operation,
      id,
      error: err.message
    });
    return { success: false, error: err.message };
  }
  async replicateBatch(resourceName, records) {
    const results = [];
    const errors = [];
    for (const record of records) {
      const [ok, err, res] = await try_fn_default(() => this.replicate(
        resourceName,
        record.operation,
        record.data,
        record.id,
        record.beforeData
      ));
      if (ok) results.push(res);
      else errors.push({ id: record.id, error: err.message });
    }
    return {
      success: errors.length === 0,
      results,
      errors
    };
  }
  async testConnection() {
    const [ok, err] = await try_fn_default(async () => {
      if (!this.bigqueryClient) await this.initialize();
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      await dataset.getMetadata();
      return true;
    });
    if (ok) return true;
    this.emit("connection_error", { replicator: this.name, error: err.message });
    return false;
  }
  async cleanup() {
  }
  getStatus() {
    return {
      ...super.getStatus(),
      projectId: this.projectId,
      datasetId: this.datasetId,
      resources: this.resources,
      logTable: this.logTable
    };
  }
}
var bigquery_replicator_class_default = BigqueryReplicator;

class PostgresReplicator extends base_replicator_class_default {
  constructor(config = {}, resources = {}) {
    super(config);
    this.connectionString = config.connectionString;
    this.host = config.host;
    this.port = config.port || 5432;
    this.database = config.database;
    this.user = config.user;
    this.password = config.password;
    this.client = null;
    this.ssl = config.ssl;
    this.logTable = config.logTable;
    this.resources = this.parseResourcesConfig(resources);
  }
  parseResourcesConfig(resources) {
    const parsed = {};
    for (const [resourceName, config] of Object.entries(resources)) {
      if (typeof config === "string") {
        parsed[resourceName] = [{
          table: config,
          actions: ["insert"]
        }];
      } else if (Array.isArray(config)) {
        parsed[resourceName] = config.map((item) => {
          if (typeof item === "string") {
            return { table: item, actions: ["insert"] };
          }
          return {
            table: item.table,
            actions: item.actions || ["insert"]
          };
        });
      } else if (typeof config === "object") {
        parsed[resourceName] = [{
          table: config.table,
          actions: config.actions || ["insert"]
        }];
      }
    }
    return parsed;
  }
  validateConfig() {
    const errors = [];
    if (!this.connectionString && (!this.host || !this.database)) {
      errors.push("Either connectionString or host+database must be provided");
    }
    if (Object.keys(this.resources).length === 0) {
      errors.push("At least one resource must be configured");
    }
    for (const [resourceName, tables] of Object.entries(this.resources)) {
      for (const tableConfig of tables) {
        if (!tableConfig.table) {
          errors.push(`Table name is required for resource '${resourceName}'`);
        }
        if (!Array.isArray(tableConfig.actions) || tableConfig.actions.length === 0) {
          errors.push(`Actions array is required for resource '${resourceName}'`);
        }
        const validActions = ["insert", "update", "delete"];
        const invalidActions = tableConfig.actions.filter((action) => !validActions.includes(action));
        if (invalidActions.length > 0) {
          errors.push(`Invalid actions for resource '${resourceName}': ${invalidActions.join(", ")}. Valid actions: ${validActions.join(", ")}`);
        }
      }
    }
    return { isValid: errors.length === 0, errors };
  }
  async initialize(database) {
    await super.initialize(database);
    const [ok, err, sdk] = await try_fn_default(() => import('pg'));
    if (!ok) {
      this.emit("initialization_error", {
        replicator: this.name,
        error: err.message
      });
      throw err;
    }
    const { Client } = sdk;
    const config = this.connectionString ? {
      connectionString: this.connectionString,
      ssl: this.ssl
    } : {
      host: this.host,
      port: this.port,
      database: this.database,
      user: this.user,
      password: this.password,
      ssl: this.ssl
    };
    this.client = new Client(config);
    await this.client.connect();
    if (this.logTable) {
      await this.createLogTableIfNotExists();
    }
    this.emit("initialized", {
      replicator: this.name,
      database: this.database || "postgres",
      resources: Object.keys(this.resources)
    });
  }
  async createLogTableIfNotExists() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${this.logTable} (
        id SERIAL PRIMARY KEY,
        resource_name VARCHAR(255) NOT NULL,
        operation VARCHAR(50) NOT NULL,
        record_id VARCHAR(255) NOT NULL,
        data JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        source VARCHAR(100) DEFAULT 's3db-replicator',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_resource_name ON ${this.logTable}(resource_name);
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_operation ON ${this.logTable}(operation);
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_record_id ON ${this.logTable}(record_id);
      CREATE INDEX IF NOT EXISTS idx_${this.logTable}_timestamp ON ${this.logTable}(timestamp);
    `;
    await this.client.query(createTableQuery);
  }
  shouldReplicateResource(resourceName) {
    return this.resources.hasOwnProperty(resourceName);
  }
  shouldReplicateAction(resourceName, operation) {
    if (!this.resources[resourceName]) return false;
    return this.resources[resourceName].some(
      (tableConfig) => tableConfig.actions.includes(operation)
    );
  }
  getTablesForResource(resourceName, operation) {
    if (!this.resources[resourceName]) return [];
    return this.resources[resourceName].filter((tableConfig) => tableConfig.actions.includes(operation)).map((tableConfig) => tableConfig.table);
  }
  async replicate(resourceName, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    if (!this.shouldReplicateAction(resourceName, operation)) {
      return { skipped: true, reason: "action_not_included" };
    }
    const tables = this.getTablesForResource(resourceName, operation);
    if (tables.length === 0) {
      return { skipped: true, reason: "no_tables_for_action" };
    }
    const results = [];
    const errors = [];
    const [ok, err, result] = await try_fn_default(async () => {
      for (const table of tables) {
        const [okTable, errTable] = await try_fn_default(async () => {
          let result2;
          if (operation === "insert") {
            const keys = Object.keys(data);
            const values = keys.map((k) => data[k]);
            const columns = keys.map((k) => `"${k}"`).join(", ");
            const params = keys.map((_, i) => `$${i + 1}`).join(", ");
            const sql = `INSERT INTO ${table} (${columns}) VALUES (${params}) ON CONFLICT (id) DO NOTHING RETURNING *`;
            result2 = await this.client.query(sql, values);
          } else if (operation === "update") {
            const keys = Object.keys(data).filter((k) => k !== "id");
            const setClause = keys.map((k, i) => `"${k}"=$${i + 1}`).join(", ");
            const values = keys.map((k) => data[k]);
            values.push(id);
            const sql = `UPDATE ${table} SET ${setClause} WHERE id=$${keys.length + 1} RETURNING *`;
            result2 = await this.client.query(sql, values);
          } else if (operation === "delete") {
            const sql = `DELETE FROM ${table} WHERE id=$1 RETURNING *`;
            result2 = await this.client.query(sql, [id]);
          } else {
            throw new Error(`Unsupported operation: ${operation}`);
          }
          results.push({
            table,
            success: true,
            rows: result2.rows,
            rowCount: result2.rowCount
          });
        });
        if (!okTable) {
          errors.push({
            table,
            error: errTable.message
          });
        }
      }
      if (this.logTable) {
        const [okLog, errLog] = await try_fn_default(async () => {
          await this.client.query(
            `INSERT INTO ${this.logTable} (resource_name, operation, record_id, data, timestamp, source) VALUES ($1, $2, $3, $4, $5, $6)`,
            [resourceName, operation, id, JSON.stringify(data), (/* @__PURE__ */ new Date()).toISOString(), "s3db-replicator"]
          );
        });
        if (!okLog) {
        }
      }
      const success = errors.length === 0;
      this.emit("replicated", {
        replicator: this.name,
        resourceName,
        operation,
        id,
        tables,
        results,
        errors,
        success
      });
      return {
        success,
        results,
        errors,
        tables
      };
    });
    if (ok) return result;
    this.emit("replicator_error", {
      replicator: this.name,
      resourceName,
      operation,
      id,
      error: err.message
    });
    return { success: false, error: err.message };
  }
  async replicateBatch(resourceName, records) {
    const results = [];
    const errors = [];
    for (const record of records) {
      const [ok, err, res] = await try_fn_default(() => this.replicate(
        resourceName,
        record.operation,
        record.data,
        record.id,
        record.beforeData
      ));
      if (ok) results.push(res);
      else errors.push({ id: record.id, error: err.message });
    }
    return {
      success: errors.length === 0,
      results,
      errors
    };
  }
  async testConnection() {
    const [ok, err] = await try_fn_default(async () => {
      if (!this.client) await this.initialize();
      await this.client.query("SELECT 1");
      return true;
    });
    if (ok) return true;
    this.emit("connection_error", { replicator: this.name, error: err.message });
    return false;
  }
  async cleanup() {
    if (this.client) await this.client.end();
  }
  getStatus() {
    return {
      ...super.getStatus(),
      database: this.database || "postgres",
      resources: this.resources,
      logTable: this.logTable
    };
  }
}
var postgres_replicator_class_default = PostgresReplicator;

const S3_DEFAULT_REGION = "us-east-1";
const S3_DEFAULT_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
class ConnectionString {
  constructor(connectionString) {
    let uri;
    const [ok, err, parsed] = try_fn_default(() => new URL(connectionString));
    if (!ok) {
      throw new ConnectionStringError("Invalid connection string: " + connectionString, { original: err, input: connectionString });
    }
    uri = parsed;
    this.region = S3_DEFAULT_REGION;
    if (uri.protocol === "s3:") this.defineFromS3(uri);
    else this.defineFromCustomUri(uri);
    for (const [k, v] of uri.searchParams.entries()) {
      this[k] = v;
    }
  }
  defineFromS3(uri) {
    const [okBucket, errBucket, bucket] = tryFnSync(() => decodeURIComponent(uri.hostname));
    if (!okBucket) throw new ConnectionStringError("Invalid bucket in connection string", { original: errBucket, input: uri.hostname });
    this.bucket = bucket || "s3db";
    const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
    if (!okUser) throw new ConnectionStringError("Invalid accessKeyId in connection string", { original: errUser, input: uri.username });
    this.accessKeyId = user;
    const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
    if (!okPass) throw new ConnectionStringError("Invalid secretAccessKey in connection string", { original: errPass, input: uri.password });
    this.secretAccessKey = pass;
    this.endpoint = S3_DEFAULT_ENDPOINT;
    if (["/", "", null].includes(uri.pathname)) {
      this.keyPrefix = "";
    } else {
      let [, ...subpath] = uri.pathname.split("/");
      this.keyPrefix = [...subpath || []].join("/");
    }
  }
  defineFromCustomUri(uri) {
    this.forcePathStyle = true;
    this.endpoint = uri.origin;
    const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
    if (!okUser) throw new ConnectionStringError("Invalid accessKeyId in connection string", { original: errUser, input: uri.username });
    this.accessKeyId = user;
    const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
    if (!okPass) throw new ConnectionStringError("Invalid secretAccessKey in connection string", { original: errPass, input: uri.password });
    this.secretAccessKey = pass;
    if (["/", "", null].includes(uri.pathname)) {
      this.bucket = "s3db";
      this.keyPrefix = "";
    } else {
      let [, bucket, ...subpath] = uri.pathname.split("/");
      if (!bucket) {
        this.bucket = "s3db";
      } else {
        const [okBucket, errBucket, bucketDecoded] = tryFnSync(() => decodeURIComponent(bucket));
        if (!okBucket) throw new ConnectionStringError("Invalid bucket in connection string", { original: errBucket, input: bucket });
        this.bucket = bucketDecoded;
      }
      this.keyPrefix = [...subpath || []].join("/");
    }
  }
}

class Client extends EventEmitter {
  constructor({
    verbose = false,
    id = null,
    AwsS3Client,
    connectionString,
    parallelism = 10
  }) {
    super();
    this.verbose = verbose;
    this.id = id ?? idGenerator();
    this.parallelism = parallelism;
    this.config = new ConnectionString(connectionString);
    this.client = AwsS3Client || this.createClient();
  }
  createClient() {
    let options = {
      region: this.config.region,
      endpoint: this.config.endpoint
    };
    if (this.config.forcePathStyle) options.forcePathStyle = true;
    if (this.config.accessKeyId) {
      options.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      };
    }
    const client = new S3Client(options);
    client.middlewareStack.add(
      (next, context) => async (args) => {
        if (context.commandName === "DeleteObjectsCommand") {
          const body = args.request.body;
          if (body && typeof body === "string") {
            const contentMd5 = await md5(body);
            args.request.headers["Content-MD5"] = contentMd5;
          }
        }
        return next(args);
      },
      {
        step: "build",
        name: "addContentMd5ForDeleteObjects",
        priority: "high"
      }
    );
    return client;
  }
  async sendCommand(command) {
    this.emit("command.request", command.constructor.name, command.input);
    const [ok, err, response] = await try_fn_default(() => this.client.send(command));
    if (!ok) {
      const bucket = this.config.bucket;
      const key = command.input && command.input.Key;
      throw mapAwsError(err, {
        bucket,
        key,
        commandName: command.constructor.name,
        commandInput: command.input
      });
    }
    this.emit("command.response", command.constructor.name, response, command.input);
    return response;
  }
  async putObject({ key, metadata, contentType, body, contentEncoding, contentLength }) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    keyPrefix ? path.join(keyPrefix, key) : key;
    const stringMetadata = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, "_");
        stringMetadata[validKey] = String(v);
      }
    }
    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key,
      Metadata: stringMetadata,
      Body: body || Buffer.alloc(0)
    };
    if (contentType !== void 0) options.ContentType = contentType;
    if (contentEncoding !== void 0) options.ContentEncoding = contentEncoding;
    if (contentLength !== void 0) options.ContentLength = contentLength;
    let response, error;
    try {
      response = await this.sendCommand(new PutObjectCommand(options));
      return response;
    } catch (err) {
      error = err;
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: "PutObjectCommand",
        commandInput: options
      });
    } finally {
      this.emit("putObject", error || response, { key, metadata, contentType, body, contentEncoding, contentLength });
    }
  }
  async getObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key
    };
    let response, error;
    try {
      response = await this.sendCommand(new GetObjectCommand(options));
      return response;
    } catch (err) {
      error = err;
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: "GetObjectCommand",
        commandInput: options
      });
    } finally {
      this.emit("getObject", error || response, { key });
    }
  }
  async headObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key
    };
    let response, error;
    try {
      response = await this.sendCommand(new HeadObjectCommand(options));
      return response;
    } catch (err) {
      error = err;
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: "HeadObjectCommand",
        commandInput: options
      });
    } finally {
      this.emit("headObject", error || response, { key });
    }
  }
  async copyObject({ from, to }) {
    const options = {
      Bucket: this.config.bucket,
      Key: this.config.keyPrefix ? path.join(this.config.keyPrefix, to) : to,
      CopySource: path.join(this.config.bucket, this.config.keyPrefix ? path.join(this.config.keyPrefix, from) : from)
    };
    let response, error;
    try {
      response = await this.sendCommand(new CopyObjectCommand(options));
      return response;
    } catch (err) {
      error = err;
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key: to,
        commandName: "CopyObjectCommand",
        commandInput: options
      });
    } finally {
      this.emit("copyObject", error || response, { from, to });
    }
  }
  async exists(key) {
    const [ok, err] = await try_fn_default(() => this.headObject(key));
    if (ok) return true;
    if (err.name === "NoSuchKey" || err.name === "NotFound") return false;
    throw err;
  }
  async deleteObject(key) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    keyPrefix ? path.join(keyPrefix, key) : key;
    const options = {
      Bucket: this.config.bucket,
      Key: keyPrefix ? path.join(keyPrefix, key) : key
    };
    let response, error;
    try {
      response = await this.sendCommand(new DeleteObjectCommand(options));
      return response;
    } catch (err) {
      error = err;
      throw mapAwsError(err, {
        bucket: this.config.bucket,
        key,
        commandName: "DeleteObjectCommand",
        commandInput: options
      });
    } finally {
      this.emit("deleteObject", error || response, { key });
    }
  }
  async deleteObjects(keys) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    const packages = chunk(keys, 1e3);
    const { results, errors } = await PromisePool.for(packages).withConcurrency(this.parallelism).process(async (keys2) => {
      for (const key of keys2) {
        keyPrefix ? path.join(keyPrefix, key) : key;
        this.config.bucket;
        await this.exists(key);
      }
      const options = {
        Bucket: this.config.bucket,
        Delete: {
          Objects: keys2.map((key) => ({
            Key: keyPrefix ? path.join(keyPrefix, key) : key
          }))
        }
      };
      let response;
      const [ok, err, res] = await try_fn_default(() => this.sendCommand(new DeleteObjectsCommand(options)));
      if (!ok) throw err;
      response = res;
      if (response && response.Errors && response.Errors.length > 0) ;
      if (response && response.Deleted && response.Deleted.length !== keys2.length) ;
      return response;
    });
    const report = {
      deleted: results,
      notFound: errors
    };
    this.emit("deleteObjects", report, keys);
    return report;
  }
  /**
   * Delete all objects under a specific prefix using efficient pagination
   * @param {Object} options - Delete options
   * @param {string} options.prefix - S3 prefix to delete
   * @returns {Promise<number>} Number of objects deleted
   */
  async deleteAll({ prefix } = {}) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    let continuationToken;
    let totalDeleted = 0;
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: keyPrefix ? path.join(keyPrefix, prefix || "") : prefix || "",
        ContinuationToken: continuationToken
      });
      const listResponse = await this.client.send(listCommand);
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key }))
          }
        });
        const deleteResponse = await this.client.send(deleteCommand);
        const deletedCount = deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;
        totalDeleted += deletedCount;
        this.emit("deleteAll", {
          prefix,
          batch: deletedCount,
          total: totalDeleted
        });
      }
      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : void 0;
    } while (continuationToken);
    this.emit("deleteAllComplete", {
      prefix,
      totalDeleted
    });
    return totalDeleted;
  }
  async moveObject({ from, to }) {
    const [ok, err] = await try_fn_default(async () => {
      await this.copyObject({ from, to });
      await this.deleteObject(from);
    });
    if (!ok) {
      throw new UnknownError("Unknown error in moveObject", { bucket: this.config.bucket, from, to, original: err });
    }
    return true;
  }
  async listObjects({
    prefix,
    maxKeys = 1e3,
    continuationToken
  } = {}) {
    const options = {
      Bucket: this.config.bucket,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
      Prefix: this.config.keyPrefix ? path.join(this.config.keyPrefix, prefix || "") : prefix || ""
    };
    const [ok, err, response] = await try_fn_default(() => this.sendCommand(new ListObjectsV2Command(options)));
    if (!ok) {
      throw new UnknownError("Unknown error in listObjects", { prefix, bucket: this.config.bucket, original: err });
    }
    this.emit("listObjects", response, options);
    return response;
  }
  async count({ prefix } = {}) {
    let count = 0;
    let truncated = true;
    let continuationToken;
    while (truncated) {
      const options = {
        prefix,
        continuationToken
      };
      const response = await this.listObjects(options);
      count += response.KeyCount || 0;
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    this.emit("count", count, { prefix });
    return count;
  }
  async getAllKeys({ prefix } = {}) {
    let keys = [];
    let truncated = true;
    let continuationToken;
    while (truncated) {
      const options = {
        prefix,
        continuationToken
      };
      const response = await this.listObjects(options);
      if (response.Contents) {
        keys = keys.concat(response.Contents.map((x) => x.Key));
      }
      truncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }
    if (this.config.keyPrefix) {
      keys = keys.map((x) => x.replace(this.config.keyPrefix, "")).map((x) => x.startsWith("/") ? x.replace(`/`, "") : x);
    }
    this.emit("getAllKeys", keys, { prefix });
    return keys;
  }
  async getContinuationTokenAfterOffset(params = {}) {
    const {
      prefix,
      offset = 1e3
    } = params;
    if (offset === 0) return null;
    let truncated = true;
    let continuationToken;
    let skipped = 0;
    while (truncated) {
      let maxKeys = offset < 1e3 ? offset : offset - skipped > 1e3 ? 1e3 : offset - skipped;
      const options = {
        prefix,
        maxKeys,
        continuationToken
      };
      const res = await this.listObjects(options);
      if (res.Contents) {
        skipped += res.Contents.length;
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (skipped >= offset) {
        break;
      }
    }
    this.emit("getContinuationTokenAfterOffset", continuationToken || null, params);
    return continuationToken || null;
  }
  async getKeysPage(params = {}) {
    const {
      prefix,
      offset = 0,
      amount = 100
    } = params;
    let keys = [];
    let truncated = true;
    let continuationToken;
    if (offset > 0) {
      continuationToken = await this.getContinuationTokenAfterOffset({
        prefix,
        offset
      });
      if (!continuationToken) {
        this.emit("getKeysPage", [], params);
        return [];
      }
    }
    while (truncated) {
      const options = {
        prefix,
        continuationToken
      };
      const res = await this.listObjects(options);
      if (res.Contents) {
        keys = keys.concat(res.Contents.map((x) => x.Key));
      }
      truncated = res.IsTruncated || false;
      continuationToken = res.NextContinuationToken;
      if (keys.length >= amount) {
        keys = keys.slice(0, amount);
        break;
      }
    }
    if (this.config.keyPrefix) {
      keys = keys.map((x) => x.replace(this.config.keyPrefix, "")).map((x) => x.startsWith("/") ? x.replace(`/`, "") : x);
    }
    this.emit("getKeysPage", keys, params);
    return keys;
  }
  async moveAllObjects({ prefixFrom, prefixTo }) {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const { results, errors } = await PromisePool.for(keys).withConcurrency(this.parallelism).process(async (key) => {
      const to = key.replace(prefixFrom, prefixTo);
      const [ok, err] = await try_fn_default(async () => {
        await this.moveObject({
          from: key,
          to
        });
      });
      if (!ok) {
        throw new UnknownError("Unknown error in moveAllObjects", { bucket: this.config.bucket, from: key, to, original: err });
      }
      return to;
    });
    this.emit("moveAllObjects", { results, errors }, { prefixFrom, prefixTo });
    if (errors.length > 0) {
      throw new Error("Some objects could not be moved");
    }
    return results;
  }
}
var client_class_default = Client;

async function secretHandler(actual, errors, schema) {
  if (!this.passphrase) {
    errors.push(new ValidationError("Missing configuration for secrets encryption.", {
      actual,
      type: "encryptionKeyMissing",
      suggestion: "Provide a passphrase for secret encryption."
    }));
    return actual;
  }
  const [ok, err, res] = await try_fn_default(() => encrypt(String(actual), this.passphrase));
  if (ok) return res;
  errors.push(new ValidationError("Problem encrypting secret.", {
    actual,
    type: "encryptionProblem",
    error: err,
    suggestion: "Check the passphrase and input value."
  }));
  return actual;
}
async function jsonHandler(actual, errors, schema) {
  if (isString$1(actual)) return actual;
  const [ok, err, json] = tryFnSync(() => JSON.stringify(actual));
  if (!ok) throw new ValidationError("Failed to stringify JSON", { original: err, input: actual });
  return json;
}
class Validator extends FastestValidator {
  constructor({ options, passphrase, autoEncrypt = true } = {}) {
    super(merge({}, {
      useNewCustomCheckerFunction: true,
      messages: {
        encryptionKeyMissing: "Missing configuration for secrets encryption.",
        encryptionProblem: "Problem encrypting secret. Actual: {actual}. Error: {error}"
      },
      defaults: {
        string: {
          trim: true
        },
        object: {
          strict: "remove"
        },
        number: {
          convert: true
        }
      }
    }, options));
    this.passphrase = passphrase;
    this.autoEncrypt = autoEncrypt;
    this.alias("secret", {
      type: "string",
      custom: this.autoEncrypt ? secretHandler : void 0,
      messages: {
        string: "The '{field}' field must be a string.",
        stringMin: "This secret '{field}' field length must be at least {expected} long."
      }
    });
    this.alias("secretAny", {
      type: "any",
      custom: this.autoEncrypt ? secretHandler : void 0
    });
    this.alias("secretNumber", {
      type: "number",
      custom: this.autoEncrypt ? secretHandler : void 0
    });
    this.alias("json", {
      type: "any",
      custom: this.autoEncrypt ? jsonHandler : void 0
    });
  }
}
const ValidatorManager = new Proxy(Validator, {
  instance: null,
  construct(target, args) {
    if (!this.instance) this.instance = new target(...args);
    return this.instance;
  }
});

function generateBase62Mapping(keys) {
  const mapping = {};
  const reversedMapping = {};
  keys.forEach((key, index) => {
    const base62Key = encode(index);
    mapping[key] = base62Key;
    reversedMapping[base62Key] = key;
  });
  return { mapping, reversedMapping };
}
const SchemaActions = {
  trim: (value) => value == null ? value : value.trim(),
  encrypt: async (value, { passphrase }) => {
    if (value === null || value === void 0) return value;
    const [ok, err, res] = await tryFn(() => encrypt(value, passphrase));
    return ok ? res : value;
  },
  decrypt: async (value, { passphrase }) => {
    if (value === null || value === void 0) return value;
    const [ok, err, raw] = await tryFn(() => decrypt(value, passphrase));
    if (!ok) return value;
    if (raw === "null") return null;
    if (raw === "undefined") return void 0;
    return raw;
  },
  toString: (value) => value == null ? value : String(value),
  fromArray: (value, { separator }) => {
    if (value === null || value === void 0 || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return "";
    }
    const escapedItems = value.map((item) => {
      if (typeof item === "string") {
        return item.replace(/\\/g, "\\\\").replace(new RegExp(`\\${separator}`, "g"), `\\${separator}`);
      }
      return String(item);
    });
    return escapedItems.join(separator);
  },
  toArray: (value, { separator }) => {
    if (Array.isArray(value)) {
      return value;
    }
    if (value === null || value === void 0) {
      return value;
    }
    if (value === "") {
      return [];
    }
    const items = [];
    let current = "";
    let i = 0;
    const str = String(value);
    while (i < str.length) {
      if (str[i] === "\\" && i + 1 < str.length) {
        current += str[i + 1];
        i += 2;
      } else if (str[i] === separator) {
        items.push(current);
        current = "";
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
    if (value === void 0) return void 0;
    if (typeof value === "string") {
      const [ok2, err2, parsed] = tryFnSync(() => JSON.parse(value));
      if (ok2 && typeof parsed === "object") return value;
      return value;
    }
    const [ok, err, json] = tryFnSync(() => JSON.stringify(value));
    return ok ? json : value;
  },
  fromJSON: (value) => {
    if (value === null) return null;
    if (value === void 0) return void 0;
    if (typeof value !== "string") return value;
    if (value === "") return "";
    const [ok, err, parsed] = tryFnSync(() => JSON.parse(value));
    return ok ? parsed : value;
  },
  toNumber: (value) => isString$1(value) ? value.includes(".") ? parseFloat(value) : parseInt(value) : value,
  toBool: (value) => [true, 1, "true", "1", "yes", "y"].includes(value),
  fromBool: (value) => [true, 1, "true", "1", "yes", "y"].includes(value) ? "1" : "0",
  fromBase62: (value) => {
    if (value === null || value === void 0 || value === "") return value;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const n = decode(value);
      return isNaN(n) ? void 0 : n;
    }
    return void 0;
  },
  toBase62: (value) => {
    if (value === null || value === void 0 || value === "") return value;
    if (typeof value === "number") {
      return encode(value);
    }
    if (typeof value === "string") {
      const n = Number(value);
      return isNaN(n) ? value : encode(n);
    }
    return value;
  },
  fromBase62Decimal: (value) => {
    if (value === null || value === void 0 || value === "") return value;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const n = decodeDecimal(value);
      return isNaN(n) ? void 0 : n;
    }
    return void 0;
  },
  toBase62Decimal: (value) => {
    if (value === null || value === void 0 || value === "") return value;
    if (typeof value === "number") {
      return encodeDecimal(value);
    }
    if (typeof value === "string") {
      const n = Number(value);
      return isNaN(n) ? value : encodeDecimal(n);
    }
    return value;
  },
  fromArrayOfNumbers: (value, { separator }) => {
    if (value === null || value === void 0 || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return "";
    }
    const base62Items = value.map((item) => {
      if (typeof item === "number" && !isNaN(item)) {
        return encode(item);
      }
      const n = Number(item);
      return isNaN(n) ? "" : encode(n);
    });
    return base62Items.join(separator);
  },
  toArrayOfNumbers: (value, { separator }) => {
    if (Array.isArray(value)) {
      return value.map((v) => typeof v === "number" ? v : decode(v));
    }
    if (value === null || value === void 0) {
      return value;
    }
    if (value === "") {
      return [];
    }
    const str = String(value);
    const items = [];
    let current = "";
    let i = 0;
    while (i < str.length) {
      if (str[i] === "\\" && i + 1 < str.length) {
        current += str[i + 1];
        i += 2;
      } else if (str[i] === separator) {
        items.push(current);
        current = "";
        i++;
      } else {
        current += str[i];
        i++;
      }
    }
    items.push(current);
    return items.map((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string" && v !== "") {
        const n = decode(v);
        return isNaN(n) ? NaN : n;
      }
      return NaN;
    });
  },
  fromArrayOfDecimals: (value, { separator }) => {
    if (value === null || value === void 0 || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return "";
    }
    const base62Items = value.map((item) => {
      if (typeof item === "number" && !isNaN(item)) {
        return encodeDecimal(item);
      }
      const n = Number(item);
      return isNaN(n) ? "" : encodeDecimal(n);
    });
    return base62Items.join(separator);
  },
  toArrayOfDecimals: (value, { separator }) => {
    if (Array.isArray(value)) {
      return value.map((v) => typeof v === "number" ? v : decodeDecimal(v));
    }
    if (value === null || value === void 0) {
      return value;
    }
    if (value === "") {
      return [];
    }
    const str = String(value);
    const items = [];
    let current = "";
    let i = 0;
    while (i < str.length) {
      if (str[i] === "\\" && i + 1 < str.length) {
        current += str[i + 1];
        i += 2;
      } else if (str[i] === separator) {
        items.push(current);
        current = "";
        i++;
      } else {
        current += str[i];
        i++;
      }
    }
    items.push(current);
    return items.map((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string" && v !== "") {
        const n = decodeDecimal(v);
        return isNaN(n) ? NaN : n;
      }
      return NaN;
    });
  }
};
class Schema {
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
    const processedAttributes = this.preprocessAttributesForValidation(this.attributes);
    this.validator = new ValidatorManager({ autoEncrypt: false }).compile(merge(
      { $$async: true },
      processedAttributes
    ));
    if (this.options.generateAutoHooks) this.generateAutoHooks();
    if (!isEmpty(map)) {
      this.map = map;
      this.reversedMap = invert(map);
    } else {
      const flatAttrs = flatten(this.attributes, { safe: true });
      const leafKeys = Object.keys(flatAttrs).filter((k) => !k.includes("$$"));
      const objectKeys = this.extractObjectKeys(this.attributes);
      const allKeys = [.../* @__PURE__ */ new Set([...leafKeys, ...objectKeys])];
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
        afterUnmap: {}
      }
    };
  }
  addHook(hook, attribute, action) {
    if (!this.options.hooks[hook][attribute]) this.options.hooks[hook][attribute] = [];
    this.options.hooks[hook][attribute] = uniq([...this.options.hooks[hook][attribute], action]);
  }
  extractObjectKeys(obj, prefix = "") {
    const objectKeys = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("$$")) continue;
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        objectKeys.push(fullKey);
        if (value.$$type === "object") {
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
        if (definition.includes("items:string")) {
          this.addHook("beforeMap", name, "fromArray");
          this.addHook("afterUnmap", name, "toArray");
        } else if (definition.includes("items:number")) {
          const isIntegerArray = definition.includes("integer:true") || definition.includes("|integer:") || definition.includes("|integer");
          if (isIntegerArray) {
            this.addHook("beforeMap", name, "fromArrayOfNumbers");
            this.addHook("afterUnmap", name, "toArrayOfNumbers");
          } else {
            this.addHook("beforeMap", name, "fromArrayOfDecimals");
            this.addHook("afterUnmap", name, "toArrayOfDecimals");
          }
        }
        continue;
      }
      if (definition.includes("secret")) {
        if (this.options.autoEncrypt) {
          this.addHook("beforeMap", name, "encrypt");
        }
        if (this.options.autoDecrypt) {
          this.addHook("afterUnmap", name, "decrypt");
        }
        continue;
      }
      if (definition.includes("number")) {
        const isInteger = definition.includes("integer:true") || definition.includes("|integer:") || definition.includes("|integer");
        if (isInteger) {
          this.addHook("beforeMap", name, "toBase62");
          this.addHook("afterUnmap", name, "fromBase62");
        } else {
          this.addHook("beforeMap", name, "toBase62Decimal");
          this.addHook("afterUnmap", name, "fromBase62Decimal");
        }
        continue;
      }
      if (definition.includes("boolean")) {
        this.addHook("beforeMap", name, "fromBool");
        this.addHook("afterUnmap", name, "toBool");
        continue;
      }
      if (definition.includes("json")) {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
        continue;
      }
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
    } = isString$1(data) ? JSON.parse(data) : data;
    const [ok, err, attrs] = tryFnSync(() => Schema._importAttributes(attributes));
    if (!ok) throw new SchemaError("Failed to import schema attributes", { original: err, input: attributes });
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
    if (typeof attrs === "string") {
      const [ok, err, parsed] = tryFnSync(() => JSON.parse(attrs));
      if (ok && typeof parsed === "object" && parsed !== null) {
        const [okNested, errNested, nested] = tryFnSync(() => Schema._importAttributes(parsed));
        if (!okNested) throw new SchemaError("Failed to parse nested schema attribute", { original: errNested, input: attrs });
        return nested;
      }
      return attrs;
    }
    if (Array.isArray(attrs)) {
      const [okArr, errArr, arr] = tryFnSync(() => attrs.map((a) => Schema._importAttributes(a)));
      if (!okArr) throw new SchemaError("Failed to import array schema attributes", { original: errArr, input: attrs });
      return arr;
    }
    if (typeof attrs === "object" && attrs !== null) {
      const out = {};
      for (const [k, v] of Object.entries(attrs)) {
        const [okObj, errObj, val] = tryFnSync(() => Schema._importAttributes(v));
        if (!okObj) throw new SchemaError("Failed to import object schema attribute", { original: errObj, key: k, input: v });
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
      map: this.map
    };
    return data;
  }
  /**
   * Recursively export attributes, keeping objects as objects and only serializing leaves as string
   */
  _exportAttributes(attrs) {
    if (typeof attrs === "string") {
      return attrs;
    }
    if (Array.isArray(attrs)) {
      return attrs.map((a) => this._exportAttributes(a));
    }
    if (typeof attrs === "object" && attrs !== null) {
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
        const value = get(cloned, attribute);
        if (value !== void 0 && typeof SchemaActions[action] === "function") {
          set(cloned, attribute, await SchemaActions[action](value, {
            passphrase: this.passphrase,
            separator: this.options.arraySeparator
          }));
        }
      }
    }
    return cloned;
  }
  async validate(resourceItem, { mutateOriginal = false } = {}) {
    let data = mutateOriginal ? resourceItem : cloneDeep(resourceItem);
    const result = await this.validator(data);
    return result;
  }
  async mapper(resourceItem) {
    let obj = cloneDeep(resourceItem);
    obj = await this.applyHooksActions(obj, "beforeMap");
    const flattenedObj = flatten(obj, { safe: true });
    const rest = { "_v": this.version + "" };
    for (const [key, value] of Object.entries(flattenedObj)) {
      const mappedKey = this.map[key] || key;
      const attrDef = this.getAttributeDefinition(key);
      if (typeof value === "number" && typeof attrDef === "string" && attrDef.includes("number")) {
        rest[mappedKey] = encode(value);
      } else if (typeof value === "string") {
        if (value === "[object Object]") {
          rest[mappedKey] = "{}";
        } else if (value.startsWith("{") || value.startsWith("[")) {
          rest[mappedKey] = value;
        } else {
          rest[mappedKey] = value;
        }
      } else if (Array.isArray(value) || typeof value === "object" && value !== null) {
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
      if (typeof attrDef === "string" && attrDef.includes("number") && !attrDef.includes("array") && !attrDef.includes("decimal")) {
        if (typeof parsedValue === "string" && parsedValue !== "") {
          parsedValue = decode(parsedValue);
        } else if (typeof parsedValue === "number") ; else {
          parsedValue = void 0;
        }
      } else if (typeof value === "string") {
        if (value === "[object Object]") {
          parsedValue = {};
        } else if (value.startsWith("{") || value.startsWith("[")) {
          const [ok, err, parsed] = tryFnSync(() => JSON.parse(value));
          if (ok) parsedValue = parsed;
        }
      }
      if (this.attributes) {
        if (typeof attrDef === "string" && attrDef.includes("array")) {
          if (Array.isArray(parsedValue)) ; else if (typeof parsedValue === "string" && parsedValue.trim().startsWith("[")) {
            const [okArr, errArr, arr] = tryFnSync(() => JSON.parse(parsedValue));
            if (okArr && Array.isArray(arr)) {
              parsedValue = arr;
            }
          } else {
            parsedValue = SchemaActions.toArray(parsedValue, { separator: this.options.arraySeparator });
          }
        }
      }
      if (this.options.hooks && this.options.hooks.afterUnmap && this.options.hooks.afterUnmap[originalKey]) {
        for (const action of this.options.hooks.afterUnmap[originalKey]) {
          if (typeof SchemaActions[action] === "function") {
            parsedValue = await SchemaActions[action](parsedValue, {
              passphrase: this.passphrase,
              separator: this.options.arraySeparator
            });
          }
        }
      }
      rest[originalKey] = parsedValue;
    }
    await this.applyHooksActions(rest, "afterUnmap");
    const result = unflatten(rest);
    for (const [key, value] of Object.entries(mappedResourceItem)) {
      if (key.startsWith("$")) {
        result[key] = value;
      }
    }
    return result;
  }
  // Helper to get attribute definition by dot notation key
  getAttributeDefinition(key) {
    const parts = key.split(".");
    let def = this.attributes;
    for (const part of parts) {
      if (!def) return void 0;
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
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const isExplicitRequired = value.$$type && value.$$type.includes("required");
        const isExplicitOptional = value.$$type && value.$$type.includes("optional");
        const objectConfig = {
          type: "object",
          properties: this.preprocessAttributesForValidation(value),
          strict: false
        };
        if (isExplicitRequired) ; else if (isExplicitOptional || this.allNestedObjectsOptional) {
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
var schema_class_default = Schema;

const S3_METADATA_LIMIT_BYTES = 2047;
async function handleInsert$4({ resource, data, mappedData, originalData }) {
  const totalSize = calculateTotalSize(mappedData);
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id
    }
  });
  if (totalSize > effectiveLimit) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, effective limit: ${effectiveLimit} bytes, absolute limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  return { mappedData, body: JSON.stringify(mappedData) };
}
async function handleUpdate$4({ resource, id, data, mappedData, originalData }) {
  const totalSize = calculateTotalSize(mappedData);
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });
  if (totalSize > effectiveLimit) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, effective limit: ${effectiveLimit} bytes, absolute limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  return { mappedData, body: JSON.stringify(mappedData) };
}
async function handleUpsert$4({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });
  if (totalSize > effectiveLimit) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, effective limit: ${effectiveLimit} bytes, absolute limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  return { mappedData, body: "" };
}
async function handleGet$4({ resource, metadata, body }) {
  return { metadata, body };
}

var enforceLimits = /*#__PURE__*/Object.freeze({
  __proto__: null,
  S3_METADATA_LIMIT_BYTES: S3_METADATA_LIMIT_BYTES,
  handleGet: handleGet$4,
  handleInsert: handleInsert$4,
  handleUpdate: handleUpdate$4,
  handleUpsert: handleUpsert$4
});

async function handleInsert$3({ resource, data, mappedData, originalData }) {
  const totalSize = calculateTotalSize(mappedData);
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id
    }
  });
  if (totalSize > effectiveLimit) {
    resource.emit("exceedsLimit", {
      operation: "insert",
      totalSize,
      limit: 2047,
      excess: totalSize - 2047,
      data: originalData || data
    });
  }
  return { mappedData, body: JSON.stringify(data) };
}
async function handleUpdate$3({ resource, id, data, mappedData, originalData }) {
  const totalSize = calculateTotalSize(mappedData);
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });
  if (totalSize > effectiveLimit) {
    resource.emit("exceedsLimit", {
      operation: "update",
      id,
      totalSize,
      limit: 2047,
      excess: totalSize - 2047,
      data: originalData || data
    });
  }
  return { mappedData, body: JSON.stringify(data) };
}
async function handleUpsert$3({ resource, id, data, mappedData, originalData }) {
  const totalSize = calculateTotalSize(mappedData);
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });
  if (totalSize > effectiveLimit) {
    resource.emit("exceedsLimit", {
      operation: "upsert",
      id,
      totalSize,
      limit: 2047,
      excess: totalSize - 2047,
      data: originalData || data
    });
  }
  return { mappedData, body: JSON.stringify(data) };
}
async function handleGet$3({ resource, metadata, body }) {
  return { metadata, body };
}

var userManaged = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet$3,
  handleInsert: handleInsert$3,
  handleUpdate: handleUpdate$3,
  handleUpsert: handleUpsert$3
});

const TRUNCATED_FLAG = "$truncated";
const TRUNCATED_FLAG_VALUE = "true";
const TRUNCATED_FLAG_BYTES = calculateUTF8Bytes(TRUNCATED_FLAG) + calculateUTF8Bytes(TRUNCATED_FLAG_VALUE);
async function handleInsert$2({ resource, data, mappedData, originalData }) {
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id
    }
  });
  const attributeSizes = calculateAttributeSizes(mappedData);
  const sortedFields = Object.entries(attributeSizes).sort(([, a], [, b]) => a - b);
  const resultFields = {};
  let currentSize = 0;
  let truncated = false;
  if (mappedData._v) {
    resultFields._v = mappedData._v;
    currentSize += attributeSizes._v;
  }
  for (const [fieldName, size] of sortedFields) {
    if (fieldName === "_v") continue;
    const fieldValue = mappedData[fieldName];
    const spaceNeeded = size + (truncated ? 0 : TRUNCATED_FLAG_BYTES);
    if (currentSize + spaceNeeded <= effectiveLimit) {
      resultFields[fieldName] = fieldValue;
      currentSize += size;
    } else {
      const availableSpace = effectiveLimit - currentSize - (truncated ? 0 : TRUNCATED_FLAG_BYTES);
      if (availableSpace > 0) {
        const truncatedValue = truncateValue(fieldValue, availableSpace);
        resultFields[fieldName] = truncatedValue;
        truncated = true;
        currentSize += calculateUTF8Bytes(truncatedValue);
      } else {
        resultFields[fieldName] = "";
        truncated = true;
      }
      break;
    }
  }
  let finalSize = calculateTotalSize(resultFields) + (truncated ? TRUNCATED_FLAG_BYTES : 0);
  while (finalSize > effectiveLimit) {
    const fieldNames = Object.keys(resultFields).filter((f) => f !== "_v" && f !== "$truncated");
    if (fieldNames.length === 0) {
      break;
    }
    const lastField = fieldNames[fieldNames.length - 1];
    resultFields[lastField] = "";
    finalSize = calculateTotalSize(resultFields) + TRUNCATED_FLAG_BYTES;
    truncated = true;
  }
  if (truncated) {
    resultFields[TRUNCATED_FLAG] = TRUNCATED_FLAG_VALUE;
  }
  return { mappedData: resultFields, body: JSON.stringify(mappedData) };
}
async function handleUpdate$2({ resource, id, data, mappedData, originalData }) {
  return handleInsert$2({ resource, data, mappedData, originalData });
}
async function handleUpsert$2({ resource, id, data, mappedData }) {
  return handleInsert$2({ resource, data, mappedData });
}
async function handleGet$2({ resource, metadata, body }) {
  return { metadata, body };
}
function truncateValue(value, maxBytes) {
  if (typeof value === "string") {
    return truncateString(value, maxBytes);
  } else if (typeof value === "object" && value !== null) {
    const jsonStr = JSON.stringify(value);
    return truncateString(jsonStr, maxBytes);
  } else {
    const stringValue = String(value);
    return truncateString(stringValue, maxBytes);
  }
}
function truncateString(str, maxBytes) {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(str);
  if (bytes.length <= maxBytes) {
    return str;
  }
  let length = str.length;
  while (length > 0) {
    const truncated = str.substring(0, length);
    bytes = encoder.encode(truncated);
    if (bytes.length <= maxBytes) {
      return truncated;
    }
    length--;
  }
  return "";
}

var dataTruncate = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet$2,
  handleInsert: handleInsert$2,
  handleUpdate: handleUpdate$2,
  handleUpsert: handleUpsert$2
});

const OVERFLOW_FLAG = "$overflow";
const OVERFLOW_FLAG_VALUE = "true";
const OVERFLOW_FLAG_BYTES = calculateUTF8Bytes(OVERFLOW_FLAG) + calculateUTF8Bytes(OVERFLOW_FLAG_VALUE);
async function handleInsert$1({ resource, data, mappedData, originalData }) {
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id
    }
  });
  const attributeSizes = calculateAttributeSizes(mappedData);
  const sortedFields = Object.entries(attributeSizes).sort(([, a], [, b]) => a - b);
  const metadataFields = {};
  const bodyFields = {};
  let currentSize = 0;
  let willOverflow = false;
  if (mappedData._v) {
    metadataFields._v = mappedData._v;
    currentSize += attributeSizes._v;
  }
  let reservedLimit = effectiveLimit;
  for (const [fieldName, size] of sortedFields) {
    if (fieldName === "_v") continue;
    if (!willOverflow && currentSize + size > effectiveLimit) {
      reservedLimit -= OVERFLOW_FLAG_BYTES;
      willOverflow = true;
    }
    if (!willOverflow && currentSize + size <= reservedLimit) {
      metadataFields[fieldName] = mappedData[fieldName];
      currentSize += size;
    } else {
      bodyFields[fieldName] = mappedData[fieldName];
      willOverflow = true;
    }
  }
  if (willOverflow) {
    metadataFields[OVERFLOW_FLAG] = OVERFLOW_FLAG_VALUE;
  }
  const hasOverflow = Object.keys(bodyFields).length > 0;
  let body = hasOverflow ? JSON.stringify(bodyFields) : "";
  if (!hasOverflow) body = "{}";
  return { mappedData: metadataFields, body };
}
async function handleUpdate$1({ resource, id, data, mappedData, originalData }) {
  return handleInsert$1({ resource, data, mappedData, originalData });
}
async function handleUpsert$1({ resource, id, data, mappedData }) {
  return handleInsert$1({ resource, data, mappedData });
}
async function handleGet$1({ resource, metadata, body }) {
  let bodyData = {};
  if (body && body.trim() !== "") {
    const [ok, err, parsed] = tryFnSync(() => JSON.parse(body));
    if (ok) {
      bodyData = parsed;
    } else {
      bodyData = {};
    }
  }
  const mergedData = {
    ...bodyData,
    ...metadata
  };
  delete mergedData.$overflow;
  return { metadata: mergedData, body };
}

var bodyOverflow = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet$1,
  handleInsert: handleInsert$1,
  handleUpdate: handleUpdate$1,
  handleUpsert: handleUpsert$1
});

async function handleInsert({ resource, data, mappedData }) {
  const metadataOnly = {
    "_v": mappedData._v || String(resource.version)
  };
  metadataOnly._map = JSON.stringify(resource.schema.map);
  const body = JSON.stringify(mappedData);
  return { mappedData: metadataOnly, body };
}
async function handleUpdate({ resource, id, data, mappedData }) {
  const metadataOnly = {
    "_v": mappedData._v || String(resource.version)
  };
  metadataOnly._map = JSON.stringify(resource.schema.map);
  const body = JSON.stringify(mappedData);
  return { mappedData: metadataOnly, body };
}
async function handleUpsert({ resource, id, data, mappedData }) {
  return handleInsert({ resource, data, mappedData });
}
async function handleGet({ resource, metadata, body }) {
  let bodyData = {};
  if (body && body.trim() !== "") {
    const [ok, err, parsed] = tryFnSync(() => JSON.parse(body));
    if (ok) {
      bodyData = parsed;
    } else {
      bodyData = {};
    }
  }
  const mergedData = {
    ...bodyData,
    ...metadata
    // metadata contains _v
  };
  return { metadata: mergedData, body };
}

var bodyOnly = /*#__PURE__*/Object.freeze({
  __proto__: null,
  handleGet: handleGet,
  handleInsert: handleInsert,
  handleUpdate: handleUpdate,
  handleUpsert: handleUpsert
});

const behaviors = {
  "user-managed": userManaged,
  "enforce-limits": enforceLimits,
  "truncate-data": dataTruncate,
  "body-overflow": bodyOverflow,
  "body-only": bodyOnly
};
function getBehavior(behaviorName) {
  const behavior = behaviors[behaviorName];
  if (!behavior) {
    throw new Error(`Unknown behavior: ${behaviorName}. Available behaviors: ${Object.keys(behaviors).join(", ")}`);
  }
  return behavior;
}
const AVAILABLE_BEHAVIORS = Object.keys(behaviors);
const DEFAULT_BEHAVIOR = "user-managed";

class Resource extends EventEmitter {
  /**
   * Create a new Resource instance
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.client - S3 client instance
   * @param {string} [config.version='v0'] - Resource version
   * @param {Object} [config.attributes={}] - Resource attributes schema
   * @param {string} [config.behavior='user-managed'] - Resource behavior strategy
   * @param {string} [config.passphrase='secret'] - Encryption passphrase
   * @param {number} [config.parallelism=10] - Parallelism for bulk operations
   * @param {Array} [config.observers=[]] - Observer instances
   * @param {boolean} [config.cache=false] - Enable caching
   * @param {boolean} [config.autoDecrypt=true] - Auto-decrypt secret fields
   * @param {boolean} [config.timestamps=false] - Enable automatic timestamps
   * @param {Object} [config.partitions={}] - Partition definitions
   * @param {boolean} [config.paranoid=true] - Security flag for dangerous operations
   * @param {boolean} [config.allNestedObjectsOptional=false] - Make nested objects optional
   * @param {Object} [config.hooks={}] - Custom hooks
   * @param {Object} [config.options={}] - Additional options
   * @param {Function} [config.idGenerator] - Custom ID generator function
   * @param {number} [config.idSize=22] - Size for auto-generated IDs
   * @param {boolean} [config.versioningEnabled=false] - Enable versioning for this resource
   * @example
   * const users = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: {
   *     name: 'string|required',
   *     email: 'string|required',
   *     password: 'secret|required'
   *   },
   *   behavior: 'user-managed',
   *   passphrase: 'my-secret-key',
   *   timestamps: true,
   *   partitions: {
   *     byRegion: {
   *       fields: { region: 'string' }
   *     }
   *   },
   *   hooks: {
   *     beforeInsert: [async (data) => {
      *       return data;
   *     }]
   *   }
   * });
   * 
   * // With custom ID size
   * const shortIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idSize: 8 // Generate 8-character IDs
   * });
   * 
   * // With custom ID generator function
   * const customIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idGenerator: () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
   * });
   * 
   * // With custom ID generator using size parameter
   * const longIdUsers = new Resource({
   *   name: 'users',
   *   client: s3Client,
   *   attributes: { name: 'string|required' },
   *   idGenerator: 32 // Generate 32-character IDs (same as idSize: 32)
   * });
   */
  constructor(config = {}) {
    super();
    this._instanceId = Math.random().toString(36).slice(2, 8);
    const validation = validateResourceConfig(config);
    if (!validation.isValid) {
      throw new ResourceError(`Invalid Resource ${config.name} configuration`, { resourceName: config.name, validation: validation.errors, operation: "constructor", suggestion: "Check resource config and attributes." });
    }
    const {
      name,
      client,
      version = "1",
      attributes = {},
      behavior = DEFAULT_BEHAVIOR,
      passphrase = "secret",
      parallelism = 10,
      observers = [],
      cache = false,
      autoDecrypt = true,
      timestamps = false,
      partitions = {},
      paranoid = true,
      allNestedObjectsOptional = true,
      hooks = {},
      idGenerator: customIdGenerator,
      idSize = 22,
      versioningEnabled = false
    } = config;
    this.name = name;
    this.client = client;
    this.version = version;
    this.behavior = behavior;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? "secret";
    this.versioningEnabled = versioningEnabled;
    this.idGenerator = this.configureIdGenerator(customIdGenerator, idSize);
    this.config = {
      cache,
      hooks,
      paranoid,
      timestamps,
      partitions,
      autoDecrypt,
      allNestedObjectsOptional
    };
    this.hooks = {
      beforeInsert: [],
      afterInsert: [],
      beforeUpdate: [],
      afterUpdate: [],
      beforeDelete: [],
      afterDelete: []
    };
    this.attributes = attributes || {};
    this.map = config.map;
    this.applyConfiguration({ map: this.map });
    if (hooks) {
      for (const [event, hooksArr] of Object.entries(hooks)) {
        if (Array.isArray(hooksArr) && this.hooks[event]) {
          for (const fn of hooksArr) {
            if (typeof fn === "function") {
              this.hooks[event].push(fn.bind(this));
            }
          }
        }
      }
    }
    this._initMiddleware();
  }
  /**
   * Configure ID generator based on provided options
   * @param {Function|number} customIdGenerator - Custom ID generator function or size
   * @param {number} idSize - Size for auto-generated IDs
   * @returns {Function} Configured ID generator function
   * @private
   */
  configureIdGenerator(customIdGenerator, idSize) {
    if (typeof customIdGenerator === "function") {
      return customIdGenerator;
    }
    if (typeof customIdGenerator === "number" && customIdGenerator > 0) {
      return customAlphabet(urlAlphabet, customIdGenerator);
    }
    if (typeof idSize === "number" && idSize > 0 && idSize !== 22) {
      return customAlphabet(urlAlphabet, idSize);
    }
    return idGenerator;
  }
  /**
   * Get resource options (for backward compatibility with tests)
   */
  get options() {
    return {
      timestamps: this.config.timestamps,
      partitions: this.config.partitions || {},
      cache: this.config.cache,
      autoDecrypt: this.config.autoDecrypt,
      paranoid: this.config.paranoid,
      allNestedObjectsOptional: this.config.allNestedObjectsOptional
    };
  }
  export() {
    const exported = this.schema.export();
    exported.behavior = this.behavior;
    exported.timestamps = this.config.timestamps;
    exported.partitions = this.config.partitions || {};
    exported.paranoid = this.config.paranoid;
    exported.allNestedObjectsOptional = this.config.allNestedObjectsOptional;
    exported.autoDecrypt = this.config.autoDecrypt;
    exported.cache = this.config.cache;
    exported.hooks = this.hooks;
    exported.map = this.map;
    return exported;
  }
  /**
   * Apply configuration settings (timestamps, partitions, hooks)
   * This method ensures that all configuration-dependent features are properly set up
   */
  applyConfiguration({ map } = {}) {
    if (this.config.timestamps) {
      if (!this.attributes.createdAt) {
        this.attributes.createdAt = "string|optional";
      }
      if (!this.attributes.updatedAt) {
        this.attributes.updatedAt = "string|optional";
      }
      if (!this.config.partitions) {
        this.config.partitions = {};
      }
      if (!this.config.partitions.byCreatedDate) {
        this.config.partitions.byCreatedDate = {
          fields: {
            createdAt: "date|maxlength:10"
          }
        };
      }
      if (!this.config.partitions.byUpdatedDate) {
        this.config.partitions.byUpdatedDate = {
          fields: {
            updatedAt: "date|maxlength:10"
          }
        };
      }
    }
    this.setupPartitionHooks();
    if (this.versioningEnabled) {
      if (!this.config.partitions.byVersion) {
        this.config.partitions.byVersion = {
          fields: {
            _v: "string"
          }
        };
      }
    }
    this.schema = new schema_class_default({
      name: this.name,
      attributes: this.attributes,
      passphrase: this.passphrase,
      version: this.version,
      options: {
        autoDecrypt: this.config.autoDecrypt,
        allNestedObjectsOptional: this.config.allNestedObjectsOptional
      },
      map: map || this.map
    });
    this.validatePartitions();
  }
  /**
   * Update resource attributes and rebuild schema
   * @param {Object} newAttributes - New attributes definition
   */
  updateAttributes(newAttributes) {
    const oldAttributes = this.attributes;
    this.attributes = newAttributes;
    this.applyConfiguration({ map: this.schema?.map });
    return { oldAttributes, newAttributes };
  }
  /**
   * Add a hook function for a specific event
   * @param {string} event - Hook event (beforeInsert, afterInsert, etc.)
   * @param {Function} fn - Hook function
   */
  addHook(event, fn) {
    if (this.hooks[event]) {
      this.hooks[event].push(fn.bind(this));
    }
  }
  /**
   * Execute hooks for a specific event
   * @param {string} event - Hook event
   * @param {*} data - Data to pass to hooks
   * @returns {*} Modified data
   */
  async executeHooks(event, data) {
    if (!this.hooks[event]) return data;
    let result = data;
    for (const hook of this.hooks[event]) {
      result = await hook(result);
    }
    return result;
  }
  /**
   * Setup automatic partition hooks
   */
  setupPartitionHooks() {
    if (!this.config.partitions) {
      return;
    }
    const partitions = this.config.partitions;
    if (Object.keys(partitions).length === 0) {
      return;
    }
    if (!this.hooks.afterInsert) {
      this.hooks.afterInsert = [];
    }
    this.hooks.afterInsert.push(async (data) => {
      await this.createPartitionReferences(data);
      return data;
    });
    if (!this.hooks.afterDelete) {
      this.hooks.afterDelete = [];
    }
    this.hooks.afterDelete.push(async (data) => {
      await this.deletePartitionReferences(data);
      return data;
    });
  }
  async validate(data) {
    const result = {
      original: cloneDeep(data),
      isValid: false,
      errors: []
    };
    const check = await this.schema.validate(data, { mutateOriginal: false });
    if (check === true) {
      result.isValid = true;
    } else {
      result.errors = check;
    }
    result.data = data;
    return result;
  }
  /**
   * Validate that all partition fields exist in current resource attributes
   * @throws {Error} If partition fields don't exist in current schema
   */
  validatePartitions() {
    if (!this.config.partitions) {
      return;
    }
    const partitions = this.config.partitions;
    if (Object.keys(partitions).length === 0) {
      return;
    }
    const currentAttributes = Object.keys(this.attributes || {});
    for (const [partitionName, partitionDef] of Object.entries(partitions)) {
      if (!partitionDef.fields) {
        continue;
      }
      for (const fieldName of Object.keys(partitionDef.fields)) {
        if (!this.fieldExistsInAttributes(fieldName)) {
          throw new PartitionError(`Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource attributes. Available fields: ${currentAttributes.join(", ")}.`, { resourceName: this.name, partitionName, fieldName, availableFields: currentAttributes, operation: "validatePartitions" });
        }
      }
    }
  }
  /**
   * Check if a field (including nested fields) exists in the current attributes
   * @param {string} fieldName - Field name (can be nested like 'utm.source')
   * @returns {boolean} True if field exists
   */
  fieldExistsInAttributes(fieldName) {
    if (fieldName.startsWith("_")) {
      return true;
    }
    if (!fieldName.includes(".")) {
      return Object.keys(this.attributes || {}).includes(fieldName);
    }
    const keys = fieldName.split(".");
    let currentLevel = this.attributes || {};
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== "object" || !(key in currentLevel)) {
        return false;
      }
      currentLevel = currentLevel[key];
    }
    return true;
  }
  /**
   * Apply a single partition rule to a field value
   * @param {*} value - The field value
   * @param {string} rule - The partition rule
   * @returns {*} Transformed value
   */
  applyPartitionRule(value, rule) {
    if (value === void 0 || value === null) {
      return value;
    }
    let transformedValue = value;
    if (typeof rule === "string" && rule.includes("maxlength:")) {
      const maxLengthMatch = rule.match(/maxlength:(\d+)/);
      if (maxLengthMatch) {
        const maxLength = parseInt(maxLengthMatch[1]);
        if (typeof transformedValue === "string" && transformedValue.length > maxLength) {
          transformedValue = transformedValue.substring(0, maxLength);
        }
      }
    }
    if (rule.includes("date")) {
      if (transformedValue instanceof Date) {
        transformedValue = transformedValue.toISOString().split("T")[0];
      } else if (typeof transformedValue === "string") {
        if (transformedValue.includes("T") && transformedValue.includes("Z")) {
          transformedValue = transformedValue.split("T")[0];
        } else {
          const date = new Date(transformedValue);
          if (!isNaN(date.getTime())) {
            transformedValue = date.toISOString().split("T")[0];
          }
        }
      }
    }
    return transformedValue;
  }
  /**
   * Get the main resource key (new format without version in path)
   * @param {string} id - Resource ID
   * @returns {string} The main S3 key path
   */
  getResourceKey(id) {
    const key = join("resource=" + this.name, "data", `id=${id}`);
    return key;
  }
  /**
   * Generate partition key for a resource in a specific partition
   * @param {Object} params - Partition key parameters
   * @param {string} params.partitionName - Name of the partition
   * @param {string} params.id - Resource ID
   * @param {Object} params.data - Resource data for partition value extraction
   * @returns {string|null} The partition key path or null if required fields are missing
   * @example
   * const partitionKey = resource.getPartitionKey({
   *   partitionName: 'byUtmSource',
   *   id: 'user-123',
   *   data: { utm: { source: 'google' } }
   * });
   * // Returns: 'resource=users/partition=byUtmSource/utm.source=google/id=user-123'
   * 
   * // Returns null if required field is missing
   * const nullKey = resource.getPartitionKey({
   *   partitionName: 'byUtmSource',
   *   id: 'user-123',
   *   data: { name: 'John' } // Missing utm.source
   * });
   * // Returns: null
   */
  getPartitionKey({ partitionName, id, data }) {
    if (!this.config.partitions || !this.config.partitions[partitionName]) {
      throw new PartitionError(`Partition '${partitionName}' not found`, { resourceName: this.name, partitionName, operation: "getPartitionKey" });
    }
    const partition = this.config.partitions[partitionName];
    const partitionSegments = [];
    const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const fieldValue = this.getNestedFieldValue(data, fieldName);
      const transformedValue = this.applyPartitionRule(fieldValue, rule);
      if (transformedValue === void 0 || transformedValue === null) {
        return null;
      }
      partitionSegments.push(`${fieldName}=${transformedValue}`);
    }
    if (partitionSegments.length === 0) {
      return null;
    }
    const finalId = id || data?.id;
    if (!finalId) {
      return null;
    }
    return join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${finalId}`);
  }
  /**
   * Get nested field value from data object using dot notation
   * @param {Object} data - Data object
   * @param {string} fieldPath - Field path (e.g., "utm.source", "address.city")
   * @returns {*} Field value
   */
  getNestedFieldValue(data, fieldPath) {
    if (!fieldPath.includes(".")) {
      return data[fieldPath];
    }
    const keys = fieldPath.split(".");
    let currentLevel = data;
    for (const key of keys) {
      if (!currentLevel || typeof currentLevel !== "object" || !(key in currentLevel)) {
        return void 0;
      }
      currentLevel = currentLevel[key];
    }
    return currentLevel;
  }
  /**
   * Calculate estimated content length for body data
   * @param {string|Buffer} body - Body content
   * @returns {number} Estimated content length in bytes
   */
  calculateContentLength(body) {
    if (!body) return 0;
    if (Buffer.isBuffer(body)) return body.length;
    if (typeof body === "string") return Buffer.byteLength(body, "utf8");
    if (typeof body === "object") return Buffer.byteLength(JSON.stringify(body), "utf8");
    return Buffer.byteLength(String(body), "utf8");
  }
  /**
   * Insert a new resource object
   * @param {Object} attributes - Resource attributes
   * @param {string} [attributes.id] - Custom ID (optional, auto-generated if not provided)
   * @returns {Promise<Object>} The created resource object with all attributes
   * @example
   * // Insert with auto-generated ID
   * const user = await resource.insert({
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   age: 30
   * });
      * 
   * // Insert with custom ID
   * const user = await resource.insert({
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   */
  async insert({ id, ...attributes }) {
    const exists = await this.exists(id);
    if (exists) throw new Error(`Resource with id '${id}' already exists`);
    this.getResourceKey(id || "(auto)");
    if (this.options.timestamps) {
      attributes.createdAt = (/* @__PURE__ */ new Date()).toISOString();
      attributes.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    const attributesWithDefaults = this.applyDefaults(attributes);
    const completeData = { id, ...attributesWithDefaults };
    const preProcessedData = await this.executeHooks("beforeInsert", completeData);
    const extraProps = Object.keys(preProcessedData).filter(
      (k) => !(k in completeData) || preProcessedData[k] !== completeData[k]
    );
    const extraData = {};
    for (const k of extraProps) extraData[k] = preProcessedData[k];
    const {
      errors,
      isValid,
      data: validated
    } = await this.validate(preProcessedData);
    if (!isValid) {
      const errorMsg = errors && errors.length && errors[0].message ? errors[0].message : "Insert failed";
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors,
        message: errorMsg
      });
    }
    const { id: validatedId, ...validatedAttributes } = validated;
    Object.assign(validatedAttributes, extraData);
    const finalId = validatedId || id || this.idGenerator();
    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this,
      data: validatedAttributes,
      mappedData,
      originalData: completeData
    });
    const finalMetadata = processedMetadata;
    const key = this.getResourceKey(finalId);
    let contentType = void 0;
    if (body && body !== "") {
      const [okParse, errParse] = await try_fn_default(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = "application/json";
    }
    if (this.behavior === "body-only" && (!body || body === "")) {
      throw new Error(`[Resource.insert] Tentativa de gravar objeto sem body! Dados: id=${finalId}, resource=${this.name}`);
    }
    const [okPut, errPut, putResult] = await try_fn_default(() => this.client.putObject({
      key,
      body,
      contentType,
      metadata: finalMetadata
    }));
    if (!okPut) {
      const msg = errPut && errPut.message ? errPut.message : "";
      if (msg.includes("metadata headers exceed") || msg.includes("Insert failed")) {
        const totalSize = calculateTotalSize(finalMetadata);
        const effectiveLimit = calculateEffectiveLimit({
          s3Limit: 2047,
          systemConfig: {
            version: this.version,
            timestamps: this.config.timestamps,
            id: finalId
          }
        });
        const excess = totalSize - effectiveLimit;
        errPut.totalSize = totalSize;
        errPut.limit = 2047;
        errPut.effectiveLimit = effectiveLimit;
        errPut.excess = excess;
        throw new ResourceError("metadata headers exceed", { resourceName: this.name, operation: "insert", id: finalId, totalSize, effectiveLimit, excess, suggestion: "Reduce metadata size or number of fields." });
      }
      throw mapAwsError(errPut, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: "insert",
        id: finalId
      });
    }
    let insertedData = await this.composeFullObjectFromWrite({
      id: finalId,
      metadata: finalMetadata,
      body,
      behavior: this.behavior
    });
    const finalResult = await this.executeHooks("afterInsert", insertedData);
    this.emit("insert", {
      ...insertedData,
      $before: { ...completeData },
      $after: { ...finalResult }
    });
    return finalResult;
  }
  /**
   * Retrieve a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object with all attributes and metadata
   * @example
   * const user = await resource.get('user-123');
            */
  async get(id) {
    if (isObject$1(id)) throw new Error(`id cannot be an object`);
    if (isEmpty(id)) throw new Error("id cannot be empty");
    const key = this.getResourceKey(id);
    const [ok, err, request] = await try_fn_default(() => this.client.getObject(key));
    if (!ok) {
      throw mapAwsError(err, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: "get",
        id
      });
    }
    if (request.ContentLength === 0) {
      const noContentErr = new Error(`No such key: ${key} [bucket:${this.client.config.bucket}]`);
      noContentErr.name = "NoSuchKey";
      throw mapAwsError(noContentErr, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: "get",
        id
      });
    }
    const objectVersionRaw = request.Metadata?._v || this.version;
    const objectVersion = typeof objectVersionRaw === "string" && objectVersionRaw.startsWith("v") ? objectVersionRaw.slice(1) : objectVersionRaw;
    const schema = await this.getSchemaForVersion(objectVersion);
    let metadata = await schema.unmapper(request.Metadata);
    const behaviorImpl = getBehavior(this.behavior);
    let body = "";
    if (request.ContentLength > 0) {
      const [okBody, errBody, fullObject] = await try_fn_default(() => this.client.getObject(key));
      if (okBody) {
        body = await streamToString(fullObject.Body);
      } else {
        body = "";
      }
    }
    const { metadata: processedMetadata } = await behaviorImpl.handleGet({
      resource: this,
      metadata,
      body
    });
    let data = await this.composeFullObjectFromWrite({
      id,
      metadata: processedMetadata,
      body,
      behavior: this.behavior
    });
    data._contentLength = request.ContentLength;
    data._lastModified = request.LastModified;
    data._hasContent = request.ContentLength > 0;
    data._mimeType = request.ContentType || null;
    data._v = objectVersion;
    if (request.VersionId) data._versionId = request.VersionId;
    if (request.Expiration) data._expiresAt = request.Expiration;
    data._definitionHash = this.getDefinitionHash();
    if (objectVersion !== this.version) {
      data = await this.applyVersionMapping(data, objectVersion, this.version);
    }
    this.emit("get", data);
    const value = data;
    return value;
  }
  /**
   * Check if a resource exists by ID
   * @returns {Promise<boolean>} True if resource exists, false otherwise
   */
  async exists(id) {
    const key = this.getResourceKey(id);
    const [ok, err] = await try_fn_default(() => this.client.headObject(key));
    return ok;
  }
  /**
   * Update an existing resource object
   * @param {string} id - Resource ID
   * @param {Object} attributes - Attributes to update (partial update supported)
   * @returns {Promise<Object>} The updated resource object with all attributes
   * @example
   * // Update specific fields
   * const updatedUser = await resource.update('user-123', {
   *   name: 'John Updated',
   *   age: 31
   * });
   * 
   * // Update with timestamps (if enabled)
   * const updatedUser = await resource.update('user-123', {
   *   email: 'newemail@example.com'
   * });
      */
  async update(id, attributes) {
    if (isEmpty(id)) {
      throw new Error("id cannot be empty");
    }
    const exists = await this.exists(id);
    if (!exists) {
      throw new Error(`Resource with id '${id}' does not exist`);
    }
    const originalData = await this.get(id);
    const attributesClone = cloneDeep(attributes);
    let mergedData = cloneDeep(originalData);
    for (const [key2, value] of Object.entries(attributesClone)) {
      if (key2.includes(".")) {
        let ref = mergedData;
        const parts = key2.split(".");
        for (let i = 0; i < parts.length - 1; i++) {
          if (typeof ref[parts[i]] !== "object" || ref[parts[i]] === null) {
            ref[parts[i]] = {};
          }
          ref = ref[parts[i]];
        }
        ref[parts[parts.length - 1]] = cloneDeep(value);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        mergedData[key2] = merge({}, mergedData[key2], value);
      } else {
        mergedData[key2] = cloneDeep(value);
      }
    }
    if (this.config.timestamps) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      mergedData.updatedAt = now;
      if (!mergedData.metadata) mergedData.metadata = {};
      mergedData.metadata.updatedAt = now;
    }
    const preProcessedData = await this.executeHooks("beforeUpdate", cloneDeep(mergedData));
    const completeData = { ...originalData, ...preProcessedData, id };
    const { isValid, errors, data } = await this.validate(cloneDeep(completeData));
    if (!isValid) {
      throw new InvalidResourceItem({
        bucket: this.client.config.bucket,
        resourceName: this.name,
        attributes: preProcessedData,
        validation: errors,
        message: "validation: " + (errors && errors.length ? JSON.stringify(errors) : "unknown")
      });
    }
    await this.schema.mapper(data);
    const earlyBehaviorImpl = getBehavior(this.behavior);
    const tempMappedData = await this.schema.mapper({ ...originalData, ...preProcessedData });
    tempMappedData._v = String(this.version);
    await earlyBehaviorImpl.handleUpdate({
      resource: this,
      id,
      data: { ...originalData, ...preProcessedData },
      mappedData: tempMappedData,
      originalData: { ...attributesClone, id }
    });
    const { id: validatedId, ...validatedAttributes } = data;
    const oldData = { ...originalData, id };
    const newData = { ...validatedAttributes, id };
    await this.handlePartitionReferenceUpdates(oldData, newData);
    const mappedData = await this.schema.mapper(validatedAttributes);
    mappedData._v = String(this.version);
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
      resource: this,
      id,
      data: validatedAttributes,
      mappedData,
      originalData: { ...attributesClone, id }
    });
    const finalMetadata = processedMetadata;
    const key = this.getResourceKey(id);
    let existingContentType = void 0;
    let finalBody = body;
    if (body === "" && this.behavior !== "body-overflow") {
      const [ok2, err2, existingObject] = await try_fn_default(() => this.client.getObject(key));
      if (ok2 && existingObject.ContentLength > 0) {
        const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
        const existingBodyString = existingBodyBuffer.toString();
        const [okParse, errParse] = await try_fn_default(() => Promise.resolve(JSON.parse(existingBodyString)));
        if (!okParse) {
          finalBody = existingBodyBuffer;
          existingContentType = existingObject.ContentType;
        }
      }
    }
    let finalContentType = existingContentType;
    if (finalBody && finalBody !== "" && !finalContentType) {
      const [okParse, errParse] = await try_fn_default(() => Promise.resolve(JSON.parse(finalBody)));
      if (okParse) finalContentType = "application/json";
    }
    if (this.versioningEnabled && originalData._v !== this.version) {
      await this.createHistoricalVersion(id, originalData);
    }
    const [ok, err] = await try_fn_default(() => this.client.putObject({
      key,
      body: finalBody,
      contentType: finalContentType,
      metadata: finalMetadata
    }));
    if (!ok && err && err.message && err.message.includes("metadata headers exceed")) {
      const totalSize = calculateTotalSize(finalMetadata);
      const effectiveLimit = calculateEffectiveLimit({
        s3Limit: 2047,
        systemConfig: {
          version: this.version,
          timestamps: this.config.timestamps,
          id
        }
      });
      const excess = totalSize - effectiveLimit;
      err.totalSize = totalSize;
      err.limit = 2047;
      err.effectiveLimit = effectiveLimit;
      err.excess = excess;
      this.emit("exceedsLimit", {
        operation: "update",
        totalSize,
        limit: 2047,
        effectiveLimit,
        excess,
        data: validatedAttributes
      });
      throw new ResourceError("metadata headers exceed", { resourceName: this.name, operation: "update", id, totalSize, effectiveLimit, excess, suggestion: "Reduce metadata size or number of fields." });
    } else if (!ok) {
      throw mapAwsError(err, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: "update",
        id
      });
    }
    const updatedData = await this.composeFullObjectFromWrite({
      id,
      metadata: finalMetadata,
      body: finalBody,
      behavior: this.behavior
    });
    const finalResult = await this.executeHooks("afterUpdate", updatedData);
    this.emit("update", {
      ...updatedData,
      $before: { ...originalData },
      $after: { ...finalResult }
    });
    return finalResult;
  }
  /**
   * Delete a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} S3 delete response
   * @example
   * await resource.delete('user-123');
   */
  async delete(id) {
    if (isEmpty(id)) {
      throw new Error("id cannot be empty");
    }
    let objectData;
    let deleteError = null;
    const [ok, err, data] = await try_fn_default(() => this.get(id));
    if (ok) {
      objectData = data;
    } else {
      objectData = { id };
      deleteError = err;
    }
    await this.executeHooks("beforeDelete", objectData);
    const key = this.getResourceKey(id);
    const [ok2, err2, response] = await try_fn_default(() => this.client.deleteObject(key));
    this.emit("delete", {
      ...objectData,
      $before: { ...objectData },
      $after: null
    });
    if (deleteError) {
      throw mapAwsError(deleteError, {
        bucket: this.client.config.bucket,
        key,
        resourceName: this.name,
        operation: "delete",
        id
      });
    }
    if (!ok2) throw mapAwsError(err2, {
      key,
      resourceName: this.name,
      operation: "delete",
      id
    });
    await this.executeHooks("afterDelete", objectData);
    return response;
  }
  /**
   * Insert or update a resource object (upsert operation)
   * @param {Object} params - Upsert parameters
   * @param {string} params.id - Resource ID (required for upsert)
   * @param {...Object} params - Resource attributes (any additional properties)
   * @returns {Promise<Object>} The inserted or updated resource object
   * @example
   * // Will insert if doesn't exist, update if exists
   * const user = await resource.upsert({
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   */
  async upsert({ id, ...attributes }) {
    const exists = await this.exists(id);
    if (exists) {
      return this.update(id, attributes);
    }
    return this.insert({ id, ...attributes });
  }
  /**
   * Count resources with optional partition filtering
   * @param {Object} [params] - Count parameters
   * @param {string} [params.partition] - Partition name to count in
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @returns {Promise<number>} Total count of matching resources
   * @example
   * // Count all resources
   * const total = await resource.count();
   * 
   * // Count in specific partition
   * const googleUsers = await resource.count({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * 
   * // Count in multi-field partition
   * const usElectronics = await resource.count({
   *   partition: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async count({ partition = null, partitionValues = {} } = {}) {
    let prefix;
    if (partition && Object.keys(partitionValues).length > 0) {
      const partitionDef = this.config.partitions[partition];
      if (!partitionDef) {
        throw new PartitionError(`Partition '${partition}' not found`, { resourceName: this.name, partitionName: partition, operation: "count" });
      }
      const partitionSegments = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== void 0 && value !== null) {
          const transformedValue = this.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }
      if (partitionSegments.length > 0) {
        prefix = `resource=${this.name}/partition=${partition}/${partitionSegments.join("/")}`;
      } else {
        prefix = `resource=${this.name}/partition=${partition}`;
      }
    } else {
      prefix = `resource=${this.name}/data`;
    }
    const count = await this.client.count({ prefix });
    this.emit("count", count);
    return count;
  }
  /**
   * Insert multiple resources in parallel
   * @param {Object[]} objects - Array of resource objects to insert
   * @returns {Promise<Object[]>} Array of inserted resource objects
   * @example
   * const users = [
   *   { name: 'John', email: 'john@example.com' },
   *   { name: 'Jane', email: 'jane@example.com' },
   *   { name: 'Bob', email: 'bob@example.com' }
   * ];
   * const insertedUsers = await resource.insertMany(users);
      */
  async insertMany(objects) {
    const { results } = await PromisePool.for(objects).withConcurrency(this.parallelism).handleError(async (error, content2) => {
      this.emit("error", error, content2);
      this.observers.map((x) => x.emit("error", this.name, error, content2));
    }).process(async (attributes) => {
      const result = await this.insert(attributes);
      return result;
    });
    this.emit("insertMany", objects.length);
    return results;
  }
  /**
   * Delete multiple resources by their IDs in parallel
   * @param {string[]} ids - Array of resource IDs to delete
   * @returns {Promise<Object[]>} Array of S3 delete responses
   * @example
   * const deletedIds = ['user-1', 'user-2', 'user-3'];
   * const results = await resource.deleteMany(deletedIds);
      */
  async deleteMany(ids) {
    const packages = chunk(
      ids.map((id) => this.getResourceKey(id)),
      1e3
    );
    ids.map((id) => this.getResourceKey(id));
    const { results } = await PromisePool.for(packages).withConcurrency(this.parallelism).handleError(async (error, content2) => {
      this.emit("error", error, content2);
      this.observers.map((x) => x.emit("error", this.name, error, content2));
    }).process(async (keys) => {
      const response = await this.client.deleteObjects(keys);
      keys.forEach((key) => {
        const parts = key.split("/");
        const idPart = parts.find((part) => part.startsWith("id="));
        const id = idPart ? idPart.replace("id=", "") : null;
        if (id) {
          this.emit("deleted", id);
          this.observers.map((x) => x.emit("deleted", this.name, id));
        }
      });
      return response;
    });
    this.emit("deleteMany", ids.length);
    return results;
  }
  async deleteAll() {
    if (this.config.paranoid !== false) {
      throw new ResourceError("deleteAll() is a dangerous operation and requires paranoid: false option.", { resourceName: this.name, operation: "deleteAll", paranoid: this.config.paranoid, suggestion: "Set paranoid: false to allow deleteAll." });
    }
    const prefix = `resource=${this.name}/data`;
    const deletedCount = await this.client.deleteAll({ prefix });
    this.emit("deleteAll", {
      version: this.version,
      prefix,
      deletedCount
    });
    return { deletedCount, version: this.version };
  }
  /**
   * Delete all data for this resource across ALL versions
   * @returns {Promise<Object>} Deletion report
   */
  async deleteAllData() {
    if (this.config.paranoid !== false) {
      throw new ResourceError("deleteAllData() is a dangerous operation and requires paranoid: false option.", { resourceName: this.name, operation: "deleteAllData", paranoid: this.config.paranoid, suggestion: "Set paranoid: false to allow deleteAllData." });
    }
    const prefix = `resource=${this.name}`;
    const deletedCount = await this.client.deleteAll({ prefix });
    this.emit("deleteAllData", {
      resource: this.name,
      prefix,
      deletedCount
    });
    return { deletedCount, resource: this.name };
  }
  /**
   * List resource IDs with optional partition filtering and pagination
   * @param {Object} [params] - List parameters
   * @param {string} [params.partition] - Partition name to list from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {number} [params.limit] - Maximum number of results to return
   * @param {number} [params.offset=0] - Offset for pagination
   * @returns {Promise<string[]>} Array of resource IDs (strings)
   * @example
   * // List all IDs
   * const allIds = await resource.listIds();
   * 
   * // List IDs with pagination
   * const firstPageIds = await resource.listIds({ limit: 10, offset: 0 });
   * const secondPageIds = await resource.listIds({ limit: 10, offset: 10 });
   * 
   * // List IDs from specific partition
   * const googleUserIds = await resource.listIds({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
   * 
   * // List IDs from multi-field partition
   * const usElectronicsIds = await resource.listIds({
   *   partition: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async listIds({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
    let prefix;
    if (partition && Object.keys(partitionValues).length > 0) {
      if (!this.config.partitions || !this.config.partitions[partition]) {
        throw new PartitionError(`Partition '${partition}' not found`, { resourceName: this.name, partitionName: partition, operation: "listIds" });
      }
      const partitionDef = this.config.partitions[partition];
      const partitionSegments = [];
      const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
      for (const [fieldName, rule] of sortedFields) {
        const value = partitionValues[fieldName];
        if (value !== void 0 && value !== null) {
          const transformedValue = this.applyPartitionRule(value, rule);
          partitionSegments.push(`${fieldName}=${transformedValue}`);
        }
      }
      if (partitionSegments.length > 0) {
        prefix = `resource=${this.name}/partition=${partition}/${partitionSegments.join("/")}`;
      } else {
        prefix = `resource=${this.name}/partition=${partition}`;
      }
    } else {
      prefix = `resource=${this.name}/data`;
    }
    const keys = await this.client.getKeysPage({
      prefix,
      offset,
      amount: limit || 1e3
      // Default to 1000 if no limit specified
    });
    const ids = keys.map((key) => {
      const parts = key.split("/");
      const idPart = parts.find((part) => part.startsWith("id="));
      return idPart ? idPart.replace("id=", "") : null;
    }).filter(Boolean);
    this.emit("listIds", ids.length);
    return ids;
  }
  /**
   * List resources with optional partition filtering and pagination
   * @param {Object} [params] - List parameters
   * @param {string} [params.partition] - Partition name to list from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {number} [params.limit] - Maximum number of results
   * @param {number} [params.offset=0] - Number of results to skip
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * // List all resources
   * const allUsers = await resource.list();
   * 
   * // List with pagination
   * const first10 = await resource.list({ limit: 10, offset: 0 });
   * 
   * // List from specific partition
   * const usUsers = await resource.list({
   *   partition: 'byCountry',
   *   partitionValues: { 'profile.country': 'US' }
   * });
   */
  async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
    const [ok, err, result] = await try_fn_default(async () => {
      if (!partition) {
        return await this.listMain({ limit, offset });
      }
      return await this.listPartition({ partition, partitionValues, limit, offset });
    });
    if (!ok) {
      return this.handleListError(err, { partition, partitionValues });
    }
    return result;
  }
  async listMain({ limit, offset = 0 }) {
    const [ok, err, ids] = await try_fn_default(() => this.listIds({ limit, offset }));
    if (!ok) throw err;
    const results = await this.processListResults(ids, "main");
    this.emit("list", { count: results.length, errors: 0 });
    return results;
  }
  async listPartition({ partition, partitionValues, limit, offset = 0 }) {
    if (!this.config.partitions?.[partition]) {
      this.emit("list", { partition, partitionValues, count: 0, errors: 0 });
      return [];
    }
    const partitionDef = this.config.partitions[partition];
    const prefix = this.buildPartitionPrefix(partition, partitionDef, partitionValues);
    const [ok, err, keys] = await try_fn_default(() => this.client.getAllKeys({ prefix }));
    if (!ok) throw err;
    const ids = this.extractIdsFromKeys(keys).slice(offset);
    const filteredIds = limit ? ids.slice(0, limit) : ids;
    const results = await this.processPartitionResults(filteredIds, partition, partitionDef, keys);
    this.emit("list", { partition, partitionValues, count: results.length, errors: 0 });
    return results;
  }
  /**
   * Build partition prefix from partition definition and values
   */
  buildPartitionPrefix(partition, partitionDef, partitionValues) {
    const partitionSegments = [];
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const value = partitionValues[fieldName];
      if (value !== void 0 && value !== null) {
        const transformedValue = this.applyPartitionRule(value, rule);
        partitionSegments.push(`${fieldName}=${transformedValue}`);
      }
    }
    if (partitionSegments.length > 0) {
      return `resource=${this.name}/partition=${partition}/${partitionSegments.join("/")}`;
    }
    return `resource=${this.name}/partition=${partition}`;
  }
  /**
   * Extract IDs from S3 keys
   */
  extractIdsFromKeys(keys) {
    return keys.map((key) => {
      const parts = key.split("/");
      const idPart = parts.find((part) => part.startsWith("id="));
      return idPart ? idPart.replace("id=", "") : null;
    }).filter(Boolean);
  }
  /**
   * Process list results with error handling
   */
  async processListResults(ids, context = "main") {
    const { results, errors } = await PromisePool.for(ids).withConcurrency(this.parallelism).handleError(async (error, id) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
    }).process(async (id) => {
      const [ok, err, result] = await try_fn_default(() => this.get(id));
      if (ok) {
        return result;
      }
      return this.handleResourceError(err, id, context);
    });
    this.emit("list", { count: results.length, errors: 0 });
    return results;
  }
  /**
   * Process partition results with error handling
   */
  async processPartitionResults(ids, partition, partitionDef, keys) {
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
    const { results, errors } = await PromisePool.for(ids).withConcurrency(this.parallelism).handleError(async (error, id) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
    }).process(async (id) => {
      const [ok, err, result] = await try_fn_default(async () => {
        const actualPartitionValues = this.extractPartitionValuesFromKey(id, keys, sortedFields);
        return await this.getFromPartition({
          id,
          partitionName: partition,
          partitionValues: actualPartitionValues
        });
      });
      if (ok) return result;
      return this.handleResourceError(err, id, "partition");
    });
    return results.filter((item) => item !== null);
  }
  /**
   * Extract partition values from S3 key for specific ID
   */
  extractPartitionValuesFromKey(id, keys, sortedFields) {
    const keyForId = keys.find((key) => key.includes(`id=${id}`));
    if (!keyForId) {
      throw new PartitionError(`Partition key not found for ID ${id}`, { resourceName: this.name, id, operation: "extractPartitionValuesFromKey" });
    }
    const keyParts = keyForId.split("/");
    const actualPartitionValues = {};
    for (const [fieldName] of sortedFields) {
      const fieldPart = keyParts.find((part) => part.startsWith(`${fieldName}=`));
      if (fieldPart) {
        const value = fieldPart.replace(`${fieldName}=`, "");
        actualPartitionValues[fieldName] = value;
      }
    }
    return actualPartitionValues;
  }
  /**
   * Handle resource-specific errors
   */
  handleResourceError(error, id, context) {
    if (error.message.includes("Cipher job failed") || error.message.includes("OperationError")) {
      return {
        id,
        _decryptionFailed: true,
        _error: error.message,
        ...context === "partition" && { _partition: context }
      };
    }
    throw error;
  }
  /**
   * Handle list method errors
   */
  handleListError(error, { partition, partitionValues }) {
    if (error.message.includes("Partition '") && error.message.includes("' not found")) {
      this.emit("list", { partition, partitionValues, count: 0, errors: 1 });
      return [];
    }
    this.emit("list", { partition, partitionValues, count: 0, errors: 1 });
    return [];
  }
  /**
   * Get multiple resources by their IDs
   * @param {string[]} ids - Array of resource IDs
   * @returns {Promise<Object[]>} Array of resource objects
   * @example
   * const users = await resource.getMany(['user-1', 'user-2', 'user-3']);
      */
  async getMany(ids) {
    const { results, errors } = await PromisePool.for(ids).withConcurrency(this.client.parallelism).handleError(async (error, id) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
      return {
        id,
        _error: error.message,
        _decryptionFailed: error.message.includes("Cipher job failed") || error.message.includes("OperationError")
      };
    }).process(async (id) => {
      const [ok, err, data] = await try_fn_default(() => this.get(id));
      if (ok) return data;
      if (err.message.includes("Cipher job failed") || err.message.includes("OperationError")) {
        return {
          id,
          _decryptionFailed: true,
          _error: err.message
        };
      }
      throw err;
    });
    this.emit("getMany", ids.length);
    return results;
  }
  /**
   * Get all resources (equivalent to list() without pagination)
   * @returns {Promise<Object[]>} Array of all resource objects
   * @example
   * const allUsers = await resource.getAll();
      */
  async getAll() {
    const [ok, err, ids] = await try_fn_default(() => this.listIds());
    if (!ok) throw err;
    const results = [];
    for (const id of ids) {
      const [ok2, err2, item] = await try_fn_default(() => this.get(id));
      if (ok2) {
        results.push(item);
      }
    }
    return results;
  }
  /**
   * Get a page of resources with pagination metadata
   * @param {Object} [params] - Page parameters
   * @param {number} [params.offset=0] - Offset for pagination
   * @param {number} [params.size=100] - Page size
   * @param {string} [params.partition] - Partition name to page from
   * @param {Object} [params.partitionValues] - Partition field values to filter by
   * @param {boolean} [params.skipCount=false] - Skip total count for performance (useful for large collections)
   * @returns {Promise<Object>} Page result with items and pagination info
   * @example
   * // Get first page of all resources
   * const page = await resource.page({ offset: 0, size: 10 });
         * 
   * // Get page from specific partition
   * const googlePage = await resource.page({
   *   partition: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' },
   *   offset: 0,
   *   size: 5
   * });
   * 
   * // Skip count for performance in large collections
   * const fastPage = await resource.page({ 
   *   offset: 0, 
   *   size: 100, 
   *   skipCount: true 
   * });
      */
  async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
    const [ok, err, result] = await try_fn_default(async () => {
      let totalItems = null;
      let totalPages = null;
      if (!skipCount) {
        const [okCount, errCount, count] = await try_fn_default(() => this.count({ partition, partitionValues }));
        if (okCount) {
          totalItems = count;
          totalPages = Math.ceil(totalItems / size);
        } else {
          totalItems = null;
          totalPages = null;
        }
      }
      const page = Math.floor(offset / size);
      let items = [];
      if (size <= 0) {
        items = [];
      } else {
        const [okList, errList, listResult] = await try_fn_default(() => this.list({ partition, partitionValues, limit: size, offset }));
        items = okList ? listResult : [];
      }
      const result2 = {
        items,
        totalItems,
        page,
        pageSize: size,
        totalPages,
        hasMore: items.length === size && offset + size < (totalItems || Infinity),
        _debug: {
          requestedSize: size,
          requestedOffset: offset,
          actualItemsReturned: items.length,
          skipCount,
          hasTotalItems: totalItems !== null
        }
      };
      this.emit("page", result2);
      return result2;
    });
    if (ok) return result;
    return {
      items: [],
      totalItems: null,
      page: Math.floor(offset / size),
      pageSize: size,
      totalPages: null,
      _debug: {
        requestedSize: size,
        requestedOffset: offset,
        actualItemsReturned: 0,
        skipCount,
        hasTotalItems: false,
        error: err.message
      }
    };
  }
  readable() {
    const stream = new ResourceReader({ resource: this });
    return stream.build();
  }
  writable() {
    const stream = new ResourceWriter({ resource: this });
    return stream.build();
  }
  /**
   * Set binary content for a resource
   * @param {Object} params - Content parameters
   * @param {string} params.id - Resource ID
   * @param {Buffer|string} params.buffer - Content buffer or string
   * @param {string} [params.contentType='application/octet-stream'] - Content type
   * @returns {Promise<Object>} Updated resource data
   * @example
   * // Set image content
   * const imageBuffer = fs.readFileSync('image.jpg');
   * await resource.setContent({
   *   id: 'user-123',
   *   buffer: imageBuffer,
   *   contentType: 'image/jpeg'
   * });
   * 
   * // Set text content
   * await resource.setContent({
   *   id: 'document-456',
   *   buffer: 'Hello World',
   *   contentType: 'text/plain'
   * });
   */
  async setContent({ id, buffer, contentType = "application/octet-stream" }) {
    const [ok, err, currentData] = await try_fn_default(() => this.get(id));
    if (!ok || !currentData) {
      throw new ResourceError(`Resource with id '${id}' not found`, { resourceName: this.name, id, operation: "setContent" });
    }
    const updatedData = {
      ...currentData,
      _hasContent: true,
      _contentLength: buffer.length,
      _mimeType: contentType
    };
    const mappedMetadata = await this.schema.mapper(updatedData);
    const [ok2, err2] = await try_fn_default(() => this.client.putObject({
      key: this.getResourceKey(id),
      metadata: mappedMetadata,
      body: buffer,
      contentType
    }));
    if (!ok2) throw err2;
    this.emit("setContent", { id, contentType, contentLength: buffer.length });
    return updatedData;
  }
  /**
   * Retrieve binary content associated with a resource
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} Object with buffer and contentType
   * @example
   * const content = await resource.content('user-123');
   * if (content.buffer) {
         *   // Save to file
   *   fs.writeFileSync('output.jpg', content.buffer);
   * } else {
      * }
   */
  async content(id) {
    const key = this.getResourceKey(id);
    const [ok, err, response] = await try_fn_default(() => this.client.getObject(key));
    if (!ok) {
      if (err.name === "NoSuchKey") {
        return {
          buffer: null,
          contentType: null
        };
      }
      throw err;
    }
    const buffer = Buffer.from(await response.Body.transformToByteArray());
    const contentType = response.ContentType || null;
    this.emit("content", id, buffer.length, contentType);
    return {
      buffer,
      contentType
    };
  }
  /**
   * Check if binary content exists for a resource
   * @param {string} id - Resource ID
   * @returns {boolean}
   */
  async hasContent(id) {
    const key = this.getResourceKey(id);
    const [ok, err, response] = await try_fn_default(() => this.client.headObject(key));
    if (!ok) return false;
    return response.ContentLength > 0;
  }
  /**
   * Delete binary content but preserve metadata
   * @param {string} id - Resource ID
   */
  async deleteContent(id) {
    const key = this.getResourceKey(id);
    const [ok, err, existingObject] = await try_fn_default(() => this.client.headObject(key));
    if (!ok) throw err;
    const existingMetadata = existingObject.Metadata || {};
    const [ok2, err2, response] = await try_fn_default(() => this.client.putObject({
      key,
      body: "",
      metadata: existingMetadata
    }));
    if (!ok2) throw err2;
    this.emit("deleteContent", id);
    return response;
  }
  /**
   * Generate definition hash for this resource
   * @returns {string} SHA256 hash of the resource definition (name + attributes)
   */
  getDefinitionHash() {
    const definition = {
      attributes: this.attributes,
      behavior: this.behavior
    };
    const stableString = jsonStableStringify(definition);
    return `sha256:${createHash("sha256").update(stableString).digest("hex")}`;
  }
  /**
   * Extract version from S3 key
   * @param {string} key - S3 object key
   * @returns {string|null} Version string or null
   */
  extractVersionFromKey(key) {
    const parts = key.split("/");
    const versionPart = parts.find((part) => part.startsWith("v="));
    return versionPart ? versionPart.replace("v=", "") : null;
  }
  /**
   * Get schema for a specific version
   * @param {string} version - Version string (e.g., 'v0', 'v1')
   * @returns {Object} Schema object for the version
   */
  async getSchemaForVersion(version) {
    if (version === this.version) {
      return this.schema;
    }
    const [ok, err, compatibleSchema] = await try_fn_default(() => Promise.resolve(new schema_class_default({
      name: this.name,
      attributes: this.attributes,
      passphrase: this.passphrase,
      version,
      options: {
        ...this.config,
        autoDecrypt: true,
        autoEncrypt: true
      }
    })));
    if (ok) return compatibleSchema;
    return this.schema;
  }
  /**
   * Create partition references after insert
   * @param {Object} data - Inserted object data
   */
  async createPartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        const partitionMetadata = {
          _v: String(this.version)
        };
        await this.client.putObject({
          key: partitionKey,
          metadata: partitionMetadata,
          body: "",
          contentType: void 0
        });
      }
    }
  }
  /**
   * Delete partition references after delete
   * @param {Object} data - Deleted object data
   */
  async deletePartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    const keysToDelete = [];
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        keysToDelete.push(partitionKey);
      }
    }
    if (keysToDelete.length > 0) {
      const [ok, err] = await try_fn_default(() => this.client.deleteObjects(keysToDelete));
    }
  }
  /**
   * Query resources with simple filtering and pagination
   * @param {Object} [filter={}] - Filter criteria (exact field matches)
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Maximum number of results
   * @param {number} [options.offset=0] - Offset for pagination
   * @param {string} [options.partition] - Partition name to query from
   * @param {Object} [options.partitionValues] - Partition field values to filter by
   * @returns {Promise<Object[]>} Array of filtered resource objects
   * @example
   * // Query all resources (no filter)
   * const allUsers = await resource.query();
   * 
   * // Query with simple filter
   * const activeUsers = await resource.query({ status: 'active' });
   * 
   * // Query with multiple filters
   * const usElectronics = await resource.query({
   *   category: 'electronics',
   *   region: 'US'
   * });
   * 
   * // Query with pagination
   * const firstPage = await resource.query(
   *   { status: 'active' },
   *   { limit: 10, offset: 0 }
   * );
   * 
   * // Query within partition
   * const googleUsers = await resource.query(
   *   { status: 'active' },
   *   {
   *     partition: 'byUtmSource',
   *     partitionValues: { 'utm.source': 'google' },
   *     limit: 5
   *   }
   * );
   */
  async query(filter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} } = {}) {
    if (Object.keys(filter).length === 0) {
      return await this.list({ partition, partitionValues, limit, offset });
    }
    const results = [];
    let currentOffset = offset;
    const batchSize = Math.min(limit, 50);
    while (results.length < limit) {
      const batch = await this.list({
        partition,
        partitionValues,
        limit: batchSize,
        offset: currentOffset
      });
      if (batch.length === 0) {
        break;
      }
      const filteredBatch = batch.filter((doc) => {
        return Object.entries(filter).every(([key, value]) => {
          return doc[key] === value;
        });
      });
      results.push(...filteredBatch);
      currentOffset += batchSize;
      if (batch.length < batchSize) {
        break;
      }
    }
    return results.slice(0, limit);
  }
  /**
   * Handle partition reference updates with change detection
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdates(oldData, newData) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const [ok, err] = await try_fn_default(() => this.handlePartitionReferenceUpdate(partitionName, partition, oldData, newData));
    }
    const id = newData.id || oldData.id;
    for (const [partitionName, partition] of Object.entries(partitions)) {
      const prefix = `resource=${this.name}/partition=${partitionName}`;
      let allKeys = [];
      const [okKeys, errKeys, keys] = await try_fn_default(() => this.client.getAllKeys({ prefix }));
      if (okKeys) {
        allKeys = keys;
      } else {
        continue;
      }
      const validKey = this.getPartitionKey({ partitionName, id, data: newData });
      for (const key of allKeys) {
        if (key.endsWith(`/id=${id}`) && key !== validKey) {
          const [okDel, errDel] = await try_fn_default(() => this.client.deleteObject(key));
        }
      }
    }
  }
  /**
   * Handle partition reference update for a specific partition
   * @param {string} partitionName - Name of the partition
   * @param {Object} partition - Partition definition
   * @param {Object} oldData - Original object data before update
   * @param {Object} newData - Updated object data
   */
  async handlePartitionReferenceUpdate(partitionName, partition, oldData, newData) {
    const id = newData.id || oldData.id;
    const oldPartitionKey = this.getPartitionKey({ partitionName, id, data: oldData });
    const newPartitionKey = this.getPartitionKey({ partitionName, id, data: newData });
    if (oldPartitionKey !== newPartitionKey) {
      if (oldPartitionKey) {
        const [ok, err] = await try_fn_default(async () => {
          await this.client.deleteObject(oldPartitionKey);
        });
      }
      if (newPartitionKey) {
        const [ok, err] = await try_fn_default(async () => {
          const partitionMetadata = {
            _v: String(this.version)
          };
          await this.client.putObject({
            key: newPartitionKey,
            metadata: partitionMetadata,
            body: "",
            contentType: void 0
          });
        });
      }
    } else if (newPartitionKey) {
      const [ok, err] = await try_fn_default(async () => {
        const partitionMetadata = {
          _v: String(this.version)
        };
        await this.client.putObject({
          key: newPartitionKey,
          metadata: partitionMetadata,
          body: "",
          contentType: void 0
        });
      });
    }
  }
  /**
   * Update partition objects to keep them in sync (legacy method for backward compatibility)
   * @param {Object} data - Updated object data
   */
  async updatePartitionReferences(data) {
    const partitions = this.config.partitions;
    if (!partitions || Object.keys(partitions).length === 0) {
      return;
    }
    for (const [partitionName, partition] of Object.entries(partitions)) {
      if (!partition || !partition.fields || typeof partition.fields !== "object") {
        continue;
      }
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        const partitionMetadata = {
          _v: String(this.version)
        };
        const [ok, err] = await try_fn_default(async () => {
          await this.client.putObject({
            key: partitionKey,
            metadata: partitionMetadata,
            body: "",
            contentType: void 0
          });
        });
      }
    }
  }
  /**
   * Get a resource object directly from a specific partition
   * @param {Object} params - Partition parameters
   * @param {string} params.id - Resource ID
   * @param {string} params.partitionName - Name of the partition
   * @param {Object} params.partitionValues - Values for partition fields
   * @returns {Promise<Object>} The resource object with partition metadata
   * @example
   * // Get user from UTM source partition
   * const user = await resource.getFromPartition({
   *   id: 'user-123',
   *   partitionName: 'byUtmSource',
   *   partitionValues: { 'utm.source': 'google' }
   * });
         * 
   * // Get product from multi-field partition
   * const product = await resource.getFromPartition({
   *   id: 'product-456',
   *   partitionName: 'byCategoryRegion',
   *   partitionValues: { category: 'electronics', region: 'US' }
   * });
   */
  async getFromPartition({ id, partitionName, partitionValues = {} }) {
    if (!this.config.partitions || !this.config.partitions[partitionName]) {
      throw new PartitionError(`Partition '${partitionName}' not found`, { resourceName: this.name, partitionName, operation: "getFromPartition" });
    }
    const partition = this.config.partitions[partitionName];
    const partitionSegments = [];
    const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
    for (const [fieldName, rule] of sortedFields) {
      const value = partitionValues[fieldName];
      if (value !== void 0 && value !== null) {
        const transformedValue = this.applyPartitionRule(value, rule);
        partitionSegments.push(`${fieldName}=${transformedValue}`);
      }
    }
    if (partitionSegments.length === 0) {
      throw new PartitionError(`No partition values provided for partition '${partitionName}'`, { resourceName: this.name, partitionName, operation: "getFromPartition" });
    }
    const partitionKey = join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
    const [ok, err] = await try_fn_default(async () => {
      await this.client.headObject(partitionKey);
    });
    if (!ok) {
      throw new ResourceError(`Resource with id '${id}' not found in partition '${partitionName}'`, { resourceName: this.name, id, partitionName, operation: "getFromPartition" });
    }
    const data = await this.get(id);
    data._partition = partitionName;
    data._partitionValues = partitionValues;
    this.emit("getFromPartition", data);
    return data;
  }
  /**
   * Create a historical version of an object
   * @param {string} id - Resource ID
   * @param {Object} data - Object data to store historically
   */
  async createHistoricalVersion(id, data) {
    const historicalKey = join(`resource=${this.name}`, `historical`, `id=${id}`);
    const historicalData = {
      ...data,
      _v: data._v || this.version,
      _historicalTimestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const mappedData = await this.schema.mapper(historicalData);
    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this,
      data: historicalData,
      mappedData
    });
    const finalMetadata = {
      ...processedMetadata,
      _v: data._v || this.version,
      _historicalTimestamp: historicalData._historicalTimestamp
    };
    let contentType = void 0;
    if (body && body !== "") {
      const [okParse, errParse] = await try_fn_default(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = "application/json";
    }
    await this.client.putObject({
      key: historicalKey,
      metadata: finalMetadata,
      body,
      contentType
    });
  }
  /**
   * Apply version mapping to convert an object from one version to another
   * @param {Object} data - Object data to map
   * @param {string} fromVersion - Source version
   * @param {string} toVersion - Target version
   * @returns {Object} Mapped object data
   */
  async applyVersionMapping(data, fromVersion, toVersion) {
    if (fromVersion === toVersion) {
      return data;
    }
    const mappedData = {
      ...data,
      _v: toVersion,
      _originalVersion: fromVersion,
      _versionMapped: true
    };
    return mappedData;
  }
  /**
   * Compose the full object (metadata + body) as retornado por .get(),
   * usando os dados em memória após insert/update, de acordo com o behavior
   */
  async composeFullObjectFromWrite({ id, metadata, body, behavior }) {
    const behaviorFlags = {};
    if (metadata && metadata["$truncated"] === "true") {
      behaviorFlags.$truncated = "true";
    }
    if (metadata && metadata["$overflow"] === "true") {
      behaviorFlags.$overflow = "true";
    }
    let unmappedMetadata = {};
    const [ok, err, unmapped] = await try_fn_default(() => this.schema.unmapper(metadata));
    unmappedMetadata = ok ? unmapped : metadata;
    const filterInternalFields = (obj) => {
      if (!obj || typeof obj !== "object") return obj;
      const filtered2 = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!key.startsWith("_")) {
          filtered2[key] = value;
        }
      }
      return filtered2;
    };
    const fixValue = (v) => {
      if (typeof v === "object" && v !== null) {
        return v;
      }
      if (typeof v === "string") {
        if (v === "[object Object]") return {};
        if (v.startsWith("{") || v.startsWith("[")) {
          const [ok2, err2, parsed] = tryFnSync(() => JSON.parse(v));
          return ok2 ? parsed : v;
        }
        return v;
      }
      return v;
    };
    if (behavior === "body-overflow") {
      const hasOverflow = metadata && metadata["$overflow"] === "true";
      let bodyData = {};
      if (hasOverflow && body) {
        const [okBody, errBody, parsedBody] = await try_fn_default(() => Promise.resolve(JSON.parse(body)));
        if (okBody) {
          const [okUnmap, errUnmap, unmappedBody] = await try_fn_default(() => this.schema.unmapper(parsedBody));
          bodyData = okUnmap ? unmappedBody : {};
        }
      }
      const merged = { ...unmappedMetadata, ...bodyData, id };
      Object.keys(merged).forEach((k) => {
        merged[k] = fixValue(merged[k]);
      });
      const result2 = filterInternalFields(merged);
      if (hasOverflow) {
        result2.$overflow = "true";
      }
      return result2;
    }
    if (behavior === "body-only") {
      const [okBody, errBody, parsedBody] = await try_fn_default(() => Promise.resolve(body ? JSON.parse(body) : {}));
      let mapFromMeta = this.schema.map;
      if (metadata && metadata._map) {
        const [okMap, errMap, parsedMap] = await try_fn_default(() => Promise.resolve(typeof metadata._map === "string" ? JSON.parse(metadata._map) : metadata._map));
        mapFromMeta = okMap ? parsedMap : this.schema.map;
      }
      const [okUnmap, errUnmap, unmappedBody] = await try_fn_default(() => this.schema.unmapper(parsedBody, mapFromMeta));
      const result2 = okUnmap ? { ...unmappedBody, id } : { id };
      Object.keys(result2).forEach((k) => {
        result2[k] = fixValue(result2[k]);
      });
      return result2;
    }
    const result = { ...unmappedMetadata, id };
    Object.keys(result).forEach((k) => {
      result[k] = fixValue(result[k]);
    });
    const filtered = filterInternalFields(result);
    if (behaviorFlags.$truncated) {
      filtered.$truncated = behaviorFlags.$truncated;
    }
    if (behaviorFlags.$overflow) {
      filtered.$overflow = behaviorFlags.$overflow;
    }
    return filtered;
  }
  emit(event, ...args) {
    return super.emit(event, ...args);
  }
  async replace(id, attributes) {
    await this.delete(id);
    await new Promise((r) => setTimeout(r, 100));
    const maxWait = 5e3;
    const interval = 50;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const exists = await this.exists(id);
      if (!exists) {
        break;
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    try {
      const result = await this.insert({ ...attributes, id });
      return result;
    } catch (err) {
      if (err && err.message && err.message.includes("already exists")) {
        const result = await this.update(id, attributes);
        return result;
      }
      throw err;
    }
  }
  // --- MIDDLEWARE SYSTEM ---
  _initMiddleware() {
    this._middlewares = /* @__PURE__ */ new Map();
    this._middlewareMethods = [
      "get",
      "list",
      "listIds",
      "getAll",
      "count",
      "page",
      "insert",
      "update",
      "delete",
      "deleteMany",
      "exists",
      "getMany"
    ];
    for (const method of this._middlewareMethods) {
      this._middlewares.set(method, []);
      if (!this[`_original_${method}`]) {
        this[`_original_${method}`] = this[method].bind(this);
        this[method] = async (...args) => {
          const ctx = { resource: this, args, method };
          let idx = -1;
          const stack = this._middlewares.get(method);
          const dispatch = async (i) => {
            if (i <= idx) throw new Error("next() called multiple times");
            idx = i;
            if (i < stack.length) {
              return await stack[i](ctx, () => dispatch(i + 1));
            } else {
              return await this[`_original_${method}`](...ctx.args);
            }
          };
          return await dispatch(0);
        };
      }
    }
  }
  useMiddleware(method, fn) {
    if (!this._middlewares) this._initMiddleware();
    if (!this._middlewares.has(method)) throw new ResourceError(`No such method for middleware: ${method}`, { operation: "useMiddleware", method });
    this._middlewares.get(method).push(fn);
  }
  // Utilitário para aplicar valores default do schema
  applyDefaults(data) {
    const out = { ...data };
    for (const [key, def] of Object.entries(this.attributes)) {
      if (out[key] === void 0) {
        if (typeof def === "string" && def.includes("default:")) {
          const match = def.match(/default:([^|]+)/);
          if (match) {
            let val = match[1];
            if (def.includes("boolean")) val = val === "true";
            else if (def.includes("number")) val = Number(val);
            out[key] = val;
          }
        }
      }
    }
    return out;
  }
}
function validateResourceConfig(config) {
  const errors = [];
  if (!config.name) {
    errors.push("Resource 'name' is required");
  } else if (typeof config.name !== "string") {
    errors.push("Resource 'name' must be a string");
  } else if (config.name.trim() === "") {
    errors.push("Resource 'name' cannot be empty");
  }
  if (!config.client) {
    errors.push("S3 'client' is required");
  }
  if (!config.attributes) {
    errors.push("Resource 'attributes' are required");
  } else if (typeof config.attributes !== "object" || Array.isArray(config.attributes)) {
    errors.push("Resource 'attributes' must be an object");
  } else if (Object.keys(config.attributes).length === 0) {
    errors.push("Resource 'attributes' cannot be empty");
  }
  if (config.version !== void 0 && typeof config.version !== "string") {
    errors.push("Resource 'version' must be a string");
  }
  if (config.behavior !== void 0 && typeof config.behavior !== "string") {
    errors.push("Resource 'behavior' must be a string");
  }
  if (config.passphrase !== void 0 && typeof config.passphrase !== "string") {
    errors.push("Resource 'passphrase' must be a string");
  }
  if (config.parallelism !== void 0) {
    if (typeof config.parallelism !== "number" || !Number.isInteger(config.parallelism)) {
      errors.push("Resource 'parallelism' must be an integer");
    } else if (config.parallelism < 1) {
      errors.push("Resource 'parallelism' must be greater than 0");
    }
  }
  if (config.observers !== void 0 && !Array.isArray(config.observers)) {
    errors.push("Resource 'observers' must be an array");
  }
  const booleanFields = ["cache", "autoDecrypt", "timestamps", "paranoid", "allNestedObjectsOptional"];
  for (const field of booleanFields) {
    if (config[field] !== void 0 && typeof config[field] !== "boolean") {
      errors.push(`Resource '${field}' must be a boolean`);
    }
  }
  if (config.idGenerator !== void 0) {
    if (typeof config.idGenerator !== "function" && typeof config.idGenerator !== "number") {
      errors.push("Resource 'idGenerator' must be a function or a number (size)");
    } else if (typeof config.idGenerator === "number" && config.idGenerator <= 0) {
      errors.push("Resource 'idGenerator' size must be greater than 0");
    }
  }
  if (config.idSize !== void 0) {
    if (typeof config.idSize !== "number" || !Number.isInteger(config.idSize)) {
      errors.push("Resource 'idSize' must be an integer");
    } else if (config.idSize <= 0) {
      errors.push("Resource 'idSize' must be greater than 0");
    }
  }
  if (config.partitions !== void 0) {
    if (typeof config.partitions !== "object" || Array.isArray(config.partitions)) {
      errors.push("Resource 'partitions' must be an object");
    } else {
      for (const [partitionName, partitionDef] of Object.entries(config.partitions)) {
        if (typeof partitionDef !== "object" || Array.isArray(partitionDef)) {
          errors.push(`Partition '${partitionName}' must be an object`);
        } else if (!partitionDef.fields) {
          errors.push(`Partition '${partitionName}' must have a 'fields' property`);
        } else if (typeof partitionDef.fields !== "object" || Array.isArray(partitionDef.fields)) {
          errors.push(`Partition '${partitionName}.fields' must be an object`);
        } else {
          for (const [fieldName, fieldType] of Object.entries(partitionDef.fields)) {
            if (typeof fieldType !== "string") {
              errors.push(`Partition '${partitionName}.fields.${fieldName}' must be a string`);
            }
          }
        }
      }
    }
  }
  if (config.hooks !== void 0) {
    if (typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
      errors.push("Resource 'hooks' must be an object");
    } else {
      const validHookEvents = ["beforeInsert", "afterInsert", "beforeUpdate", "afterUpdate", "beforeDelete", "afterDelete"];
      for (const [event, hooksArr] of Object.entries(config.hooks)) {
        if (!validHookEvents.includes(event)) {
          errors.push(`Invalid hook event '${event}'. Valid events: ${validHookEvents.join(", ")}`);
        } else if (!Array.isArray(hooksArr)) {
          errors.push(`Resource 'hooks.${event}' must be an array`);
        } else {
          for (let i = 0; i < hooksArr.length; i++) {
            const hook = hooksArr[i];
            if (typeof hook !== "function") {
              if (typeof hook === "string") continue;
              continue;
            }
          }
        }
      }
    }
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}
var resource_class_default = Resource;

class Database extends EventEmitter {
  constructor(options) {
    super();
    this.version = "1";
    this.s3dbVersion = (() => {
      const [ok, err, version] = try_fn_default(() => true ? "7.2.1" : "latest");
      return ok ? version : "latest";
    })();
    this.resources = {};
    this.savedMetadata = null;
    this.options = options;
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || [];
    this.pluginList = options.plugins || [];
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";
    this.versioningEnabled = options.versioningEnabled || false;
    let connectionString = options.connectionString;
    if (!connectionString && (options.bucket || options.accessKeyId || options.secretAccessKey)) {
      const { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = options;
      if (endpoint) {
        const url = new URL(endpoint);
        if (accessKeyId) url.username = encodeURIComponent(accessKeyId);
        if (secretAccessKey) url.password = encodeURIComponent(secretAccessKey);
        url.pathname = `/${bucket || "s3db"}`;
        if (forcePathStyle) {
          url.searchParams.set("forcePathStyle", "true");
        }
        connectionString = url.toString();
      } else if (accessKeyId && secretAccessKey) {
        const params = new URLSearchParams();
        params.set("region", region || "us-east-1");
        if (forcePathStyle) {
          params.set("forcePathStyle", "true");
        }
        connectionString = `s3://${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@${bucket || "s3db"}?${params.toString()}`;
      }
    }
    this.client = options.client || new client_class_default({
      verbose: this.verbose,
      parallelism: this.parallelism,
      connectionString
    });
    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;
    if (!this._exitListenerRegistered) {
      this._exitListenerRegistered = true;
      process.on("exit", async () => {
        if (this.isConnected()) {
          try {
            await this.disconnect();
          } catch (err) {
          }
        }
      });
    }
  }
  async connect() {
    await this.startPlugins();
    let metadata = null;
    if (await this.client.exists(`s3db.json`)) {
      const request = await this.client.getObject(`s3db.json`);
      metadata = JSON.parse(await streamToString(request?.Body));
    } else {
      metadata = this.blankMetadataStructure();
      await this.uploadMetadataFile();
    }
    this.savedMetadata = metadata;
    const definitionChanges = this.detectDefinitionChanges(metadata);
    for (const [name, resourceMetadata] of Object.entries(metadata.resources || {})) {
      const currentVersion = resourceMetadata.currentVersion || "v0";
      const versionData = resourceMetadata.versions?.[currentVersion];
      if (versionData) {
        this.resources[name] = new resource_class_default({
          name,
          client: this.client,
          database: this,
          // garantir referência
          version: currentVersion,
          attributes: versionData.attributes,
          behavior: versionData.behavior || "user-managed",
          parallelism: this.parallelism,
          passphrase: this.passphrase,
          observers: [this],
          cache: this.cache,
          timestamps: versionData.timestamps !== void 0 ? versionData.timestamps : false,
          partitions: resourceMetadata.partitions || versionData.partitions || {},
          paranoid: versionData.paranoid !== void 0 ? versionData.paranoid : true,
          allNestedObjectsOptional: versionData.allNestedObjectsOptional !== void 0 ? versionData.allNestedObjectsOptional : true,
          autoDecrypt: versionData.autoDecrypt !== void 0 ? versionData.autoDecrypt : true,
          hooks: versionData.hooks || {},
          versioningEnabled: this.versioningEnabled,
          map: versionData.map
        });
      }
    }
    if (definitionChanges.length > 0) {
      this.emit("resourceDefinitionsChanged", {
        changes: definitionChanges,
        metadata: this.savedMetadata
      });
    }
    this.emit("connected", /* @__PURE__ */ new Date());
  }
  /**
   * Detect changes in resource definitions compared to saved metadata
   * @param {Object} savedMetadata - The metadata loaded from s3db.json
   * @returns {Array} Array of change objects
   */
  detectDefinitionChanges(savedMetadata) {
    const changes = [];
    for (const [name, currentResource] of Object.entries(this.resources)) {
      const currentHash = this.generateDefinitionHash(currentResource.export());
      const savedResource = savedMetadata.resources?.[name];
      if (!savedResource) {
        changes.push({
          type: "new",
          resourceName: name,
          currentHash,
          savedHash: null
        });
      } else {
        const currentVersion = savedResource.currentVersion || "v0";
        const versionData = savedResource.versions?.[currentVersion];
        const savedHash = versionData?.hash;
        if (savedHash !== currentHash) {
          changes.push({
            type: "changed",
            resourceName: name,
            currentHash,
            savedHash,
            fromVersion: currentVersion,
            toVersion: this.getNextVersion(savedResource.versions)
          });
        }
      }
    }
    for (const [name, savedResource] of Object.entries(savedMetadata.resources || {})) {
      if (!this.resources[name]) {
        const currentVersion = savedResource.currentVersion || "v0";
        const versionData = savedResource.versions?.[currentVersion];
        changes.push({
          type: "deleted",
          resourceName: name,
          currentHash: null,
          savedHash: versionData?.hash,
          deletedVersion: currentVersion
        });
      }
    }
    return changes;
  }
  /**
   * Generate a consistent hash for a resource definition
   * @param {Object} definition - Resource definition to hash
   * @param {string} behavior - Resource behavior
   * @returns {string} SHA256 hash
   */
  generateDefinitionHash(definition, behavior = void 0) {
    const attributes = definition.attributes;
    const stableAttributes = { ...attributes };
    if (definition.timestamps) {
      delete stableAttributes.createdAt;
      delete stableAttributes.updatedAt;
    }
    const hashObj = {
      attributes: stableAttributes,
      behavior: behavior || definition.behavior || "user-managed",
      partitions: definition.partitions || {}
    };
    const stableString = jsonStableStringify(hashObj);
    return `sha256:${createHash("sha256").update(stableString).digest("hex")}`;
  }
  /**
   * Get the next version number for a resource
   * @param {Object} versions - Existing versions object
   * @returns {string} Next version string (e.g., 'v1', 'v2')
   */
  getNextVersion(versions = {}) {
    const versionNumbers = Object.keys(versions).filter((v) => v.startsWith("v")).map((v) => parseInt(v.substring(1))).filter((n) => !isNaN(n));
    const maxVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) : -1;
    return `v${maxVersion + 1}`;
  }
  async startPlugins() {
    const db = this;
    if (!isEmpty(this.pluginList)) {
      const plugins = this.pluginList.map((p) => isFunction$1(p) ? new p(this) : p);
      const setupProms = plugins.map(async (plugin) => {
        if (plugin.beforeSetup) await plugin.beforeSetup();
        await plugin.setup(db);
        if (plugin.afterSetup) await plugin.afterSetup();
      });
      await Promise.all(setupProms);
      const startProms = plugins.map(async (plugin) => {
        if (plugin.beforeStart) await plugin.beforeStart();
        await plugin.start();
        if (plugin.afterStart) await plugin.afterStart();
      });
      await Promise.all(startProms);
    }
  }
  /**
   * Register and setup a plugin
   * @param {Plugin} plugin - Plugin instance to register
   * @param {string} [name] - Optional name for the plugin (defaults to plugin.constructor.name)
   */
  async usePlugin(plugin, name = null) {
    const pluginName = name || plugin.constructor.name.replace("Plugin", "").toLowerCase();
    this.plugins[pluginName] = plugin;
    if (this.isConnected()) {
      await plugin.setup(this);
      await plugin.start();
    }
    return plugin;
  }
  async uploadMetadataFile() {
    const metadata = {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      resources: {}
    };
    Object.entries(this.resources).forEach(([name, resource]) => {
      const resourceDef = resource.export();
      const definitionHash = this.generateDefinitionHash(resourceDef);
      const existingResource = this.savedMetadata?.resources?.[name];
      const currentVersion = existingResource?.currentVersion || "v0";
      const existingVersionData = existingResource?.versions?.[currentVersion];
      let version, isNewVersion;
      if (!existingVersionData || existingVersionData.hash !== definitionHash) {
        version = this.getNextVersion(existingResource?.versions);
        isNewVersion = true;
      } else {
        version = currentVersion;
        isNewVersion = false;
      }
      metadata.resources[name] = {
        currentVersion: version,
        partitions: resource.config.partitions || {},
        versions: {
          ...existingResource?.versions,
          // Preserve previous versions
          [version]: {
            hash: definitionHash,
            attributes: resourceDef.attributes,
            behavior: resourceDef.behavior || "user-managed",
            timestamps: resource.config.timestamps,
            partitions: resource.config.partitions,
            paranoid: resource.config.paranoid,
            allNestedObjectsOptional: resource.config.allNestedObjectsOptional,
            autoDecrypt: resource.config.autoDecrypt,
            cache: resource.config.cache,
            hooks: resource.config.hooks,
            createdAt: isNewVersion ? (/* @__PURE__ */ new Date()).toISOString() : existingVersionData?.createdAt
          }
        }
      };
      if (resource.version !== version) {
        resource.version = version;
        resource.emit("versionUpdated", { oldVersion: currentVersion, newVersion: version });
      }
    });
    await this.client.putObject({
      key: "s3db.json",
      body: JSON.stringify(metadata, null, 2),
      contentType: "application/json"
    });
    this.savedMetadata = metadata;
    this.emit("metadataUploaded", metadata);
  }
  blankMetadataStructure() {
    return {
      version: `1`,
      s3dbVersion: this.s3dbVersion,
      resources: {}
    };
  }
  /**
   * Check if a resource exists by name
   * @param {string} name - Resource name
   * @returns {boolean} True if resource exists, false otherwise
   */
  resourceExists(name) {
    return !!this.resources[name];
  }
  /**
   * Check if a resource exists with the same definition hash
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.attributes - Resource attributes
   * @param {string} [config.behavior] - Resource behavior
   * @param {Object} [config.options] - Resource options (deprecated, use root level parameters)
   * @returns {Object} Result with exists and hash information
   */
  resourceExistsWithSameHash({ name, attributes, behavior = "user-managed", partitions = {}, options = {} }) {
    if (!this.resources[name]) {
      return { exists: false, sameHash: false, hash: null };
    }
    const existingResource = this.resources[name];
    const existingHash = this.generateDefinitionHash(existingResource.export());
    const mockResource = new resource_class_default({
      name,
      attributes,
      behavior,
      partitions,
      client: this.client,
      version: existingResource.version,
      passphrase: this.passphrase,
      versioningEnabled: this.versioningEnabled,
      ...options
    });
    const newHash = this.generateDefinitionHash(mockResource.export());
    return {
      exists: true,
      sameHash: existingHash === newHash,
      hash: newHash,
      existingHash
    };
  }
  async createResource({ name, attributes, behavior = "user-managed", hooks, ...config }) {
    if (this.resources[name]) {
      const existingResource = this.resources[name];
      Object.assign(existingResource.config, {
        cache: this.cache,
        ...config
      });
      if (behavior) {
        existingResource.behavior = behavior;
      }
      existingResource.versioningEnabled = this.versioningEnabled;
      existingResource.updateAttributes(attributes);
      if (hooks) {
        for (const [event, hooksArr] of Object.entries(hooks)) {
          if (Array.isArray(hooksArr) && existingResource.hooks[event]) {
            for (const fn of hooksArr) {
              if (typeof fn === "function") {
                existingResource.hooks[event].push(fn.bind(existingResource));
              }
            }
          }
        }
      }
      const newHash = this.generateDefinitionHash(existingResource.export(), existingResource.behavior);
      const existingMetadata2 = this.savedMetadata?.resources?.[name];
      const currentVersion = existingMetadata2?.currentVersion || "v0";
      const existingVersionData = existingMetadata2?.versions?.[currentVersion];
      if (!existingVersionData || existingVersionData.hash !== newHash) {
        await this.uploadMetadataFile();
      }
      this.emit("s3db.resourceUpdated", name);
      return existingResource;
    }
    const existingMetadata = this.savedMetadata?.resources?.[name];
    const version = existingMetadata?.currentVersion || "v0";
    const resource = new resource_class_default({
      name,
      client: this.client,
      version: config.version !== void 0 ? config.version : version,
      attributes,
      behavior,
      parallelism: this.parallelism,
      passphrase: config.passphrase !== void 0 ? config.passphrase : this.passphrase,
      observers: [this],
      cache: config.cache !== void 0 ? config.cache : this.cache,
      timestamps: config.timestamps !== void 0 ? config.timestamps : false,
      partitions: config.partitions || {},
      paranoid: config.paranoid !== void 0 ? config.paranoid : true,
      allNestedObjectsOptional: config.allNestedObjectsOptional !== void 0 ? config.allNestedObjectsOptional : true,
      autoDecrypt: config.autoDecrypt !== void 0 ? config.autoDecrypt : true,
      hooks: hooks || {},
      versioningEnabled: this.versioningEnabled,
      map: config.map,
      idGenerator: config.idGenerator,
      idSize: config.idSize
    });
    resource.database = this;
    this.resources[name] = resource;
    await this.uploadMetadataFile();
    this.emit("s3db.resourceCreated", name);
    return resource;
  }
  resource(name) {
    if (!this.resources[name]) {
      return Promise.reject(`resource ${name} does not exist`);
    }
    return this.resources[name];
  }
  /**
   * List all resource names
   * @returns {Array} Array of resource names
   */
  async listResources() {
    return Object.keys(this.resources).map((name) => ({ name }));
  }
  /**
   * Get a specific resource by name
   * @param {string} name - Resource name
   * @returns {Resource} Resource instance
   */
  async getResource(name) {
    if (!this.resources[name]) {
      throw new ResourceNotFound({
        bucket: this.client.config.bucket,
        resourceName: name,
        id: name
      });
    }
    return this.resources[name];
  }
  /**
   * Get database configuration
   * @returns {Object} Configuration object
   */
  get config() {
    return {
      version: this.version,
      s3dbVersion: this.s3dbVersion,
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      parallelism: this.parallelism,
      verbose: this.verbose
    };
  }
  isConnected() {
    return !!this.savedMetadata;
  }
  async disconnect() {
    try {
      if (this.pluginList && this.pluginList.length > 0) {
        for (const plugin of this.pluginList) {
          if (plugin && typeof plugin.removeAllListeners === "function") {
            plugin.removeAllListeners();
          }
        }
        const stopProms = this.pluginList.map(async (plugin) => {
          try {
            if (plugin && typeof plugin.stop === "function") {
              await plugin.stop();
            }
          } catch (err) {
          }
        });
        await Promise.all(stopProms);
      }
      if (this.resources && Object.keys(this.resources).length > 0) {
        for (const [name, resource] of Object.entries(this.resources)) {
          try {
            if (resource && typeof resource.removeAllListeners === "function") {
              resource.removeAllListeners();
            }
            if (resource._pluginWrappers) {
              resource._pluginWrappers.clear();
            }
            if (resource._pluginMiddlewares) {
              resource._pluginMiddlewares = {};
            }
            if (resource.observers && Array.isArray(resource.observers)) {
              resource.observers = [];
            }
          } catch (err) {
          }
        }
        Object.keys(this.resources).forEach((k) => delete this.resources[k]);
      }
      if (this.client && typeof this.client.removeAllListeners === "function") {
        this.client.removeAllListeners();
      }
      this.removeAllListeners();
      this.savedMetadata = null;
      this.plugins = {};
      this.pluginList = [];
      this.emit("disconnected", /* @__PURE__ */ new Date());
    } catch (err) {
    }
  }
}
class S3db extends Database {
}

function normalizeResourceName$1(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : name;
}
class S3dbReplicator extends base_replicator_class_default {
  constructor(config = {}, resources = [], client = null) {
    super(config);
    this.instanceId = Math.random().toString(36).slice(2, 10);
    this.client = client;
    this.connectionString = config.connectionString;
    let normalizedResources = resources;
    if (!resources) normalizedResources = {};
    else if (Array.isArray(resources)) {
      normalizedResources = {};
      for (const res of resources) {
        if (typeof res === "string") normalizedResources[normalizeResourceName$1(res)] = res;
      }
    } else if (typeof resources === "string") {
      normalizedResources[normalizeResourceName$1(resources)] = resources;
    }
    this.resourcesMap = this._normalizeResources(normalizedResources);
  }
  _normalizeResources(resources) {
    if (!resources) return {};
    if (Array.isArray(resources)) {
      const map = {};
      for (const res of resources) {
        if (typeof res === "string") map[normalizeResourceName$1(res)] = res;
        else if (Array.isArray(res) && typeof res[0] === "string") map[normalizeResourceName$1(res[0])] = res;
        else if (typeof res === "object" && res.resource) {
          map[normalizeResourceName$1(res.resource)] = { ...res };
        }
      }
      return map;
    }
    if (typeof resources === "object") {
      const map = {};
      for (const [src, dest] of Object.entries(resources)) {
        const normSrc = normalizeResourceName$1(src);
        if (typeof dest === "string") map[normSrc] = dest;
        else if (Array.isArray(dest)) {
          map[normSrc] = dest.map((item) => {
            if (typeof item === "string") return item;
            if (typeof item === "function") return item;
            if (typeof item === "object" && item.resource) {
              return { ...item };
            }
            return item;
          });
        } else if (typeof dest === "function") map[normSrc] = dest;
        else if (typeof dest === "object" && dest.resource) {
          map[normSrc] = { ...dest };
        }
      }
      return map;
    }
    if (typeof resources === "function") {
      return resources;
    }
    if (typeof resources === "string") {
      const map = { [normalizeResourceName$1(resources)]: resources };
      return map;
    }
    return {};
  }
  validateConfig() {
    const errors = [];
    if (!this.client && !this.connectionString) {
      errors.push("You must provide a client or a connectionString");
    }
    if (!this.resourcesMap || typeof this.resourcesMap === "object" && Object.keys(this.resourcesMap).length === 0) {
      errors.push("You must provide a resources map or array");
    }
    return { isValid: errors.length === 0, errors };
  }
  async initialize(database) {
    try {
      await super.initialize(database);
      if (this.client) {
        this.targetDatabase = this.client;
      } else if (this.connectionString) {
        const targetConfig = {
          connectionString: this.connectionString,
          region: this.region,
          keyPrefix: this.keyPrefix,
          verbose: this.config.verbose || false
        };
        this.targetDatabase = new S3db(targetConfig);
        await this.targetDatabase.connect();
      } else {
        throw new Error("S3dbReplicator: No client or connectionString provided");
      }
      this.emit("connected", {
        replicator: this.name,
        target: this.connectionString || "client-provided"
      });
    } catch (err) {
      throw err;
    }
  }
  // Change signature to accept id
  async replicate({ resource, operation, data, id: explicitId }) {
    const normResource = normalizeResourceName$1(resource);
    const destResource = this._resolveDestResource(normResource, data);
    const destResourceObj = this._getDestResourceObj(destResource);
    const transformedData = this._applyTransformer(normResource, data);
    let result;
    if (operation === "insert") {
      result = await destResourceObj.insert(transformedData);
    } else if (operation === "update") {
      result = await destResourceObj.update(explicitId, transformedData);
    } else if (operation === "delete") {
      result = await destResourceObj.delete(explicitId);
    } else {
      throw new Error(`Invalid operation: ${operation}. Supported operations are: insert, update, delete`);
    }
    return result;
  }
  _applyTransformer(resource, data) {
    const normResource = normalizeResourceName$1(resource);
    const entry = this.resourcesMap[normResource];
    let result;
    if (!entry) return data;
    if (Array.isArray(entry) && typeof entry[1] === "function") {
      result = entry[1](data);
    } else if (typeof entry === "function") {
      result = entry(data);
    } else if (typeof entry === "object") {
      if (typeof entry.transform === "function") result = entry.transform(data);
      else if (typeof entry.transformer === "function") result = entry.transformer(data);
    } else {
      result = data;
    }
    if (result && data && data.id && !result.id) result.id = data.id;
    if (!result && data) result = data;
    return result;
  }
  _resolveDestResource(resource, data) {
    const normResource = normalizeResourceName$1(resource);
    const entry = this.resourcesMap[normResource];
    if (!entry) return resource;
    if (Array.isArray(entry)) {
      if (typeof entry[0] === "string") return entry[0];
      if (typeof entry[0] === "object" && entry[0].resource) return entry[0].resource;
      if (typeof entry[0] === "function") return resource;
    }
    if (typeof entry === "string") return entry;
    if (typeof entry === "function") return resource;
    if (typeof entry === "object" && entry.resource) return entry.resource;
    return resource;
  }
  _getDestResourceObj(resource) {
    if (!this.client || !this.client.resources) return null;
    const available = Object.keys(this.client.resources);
    const norm = normalizeResourceName$1(resource);
    const found = available.find((r) => normalizeResourceName$1(r) === norm);
    if (!found) {
      throw new Error(`[S3dbReplicator] Destination resource not found: ${resource}. Available: ${available.join(", ")}`);
    }
    return this.client.resources[found];
  }
  async replicateBatch(resourceName, records) {
    if (!this.enabled || !this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const results = [];
    const errors = [];
    for (const record of records) {
      const [ok, err, result] = await try_fn_default(() => this.replicate({
        resource: resourceName,
        operation: record.operation,
        id: record.id,
        data: record.data,
        beforeData: record.beforeData
      }));
      if (ok) results.push(result);
      else errors.push({ id: record.id, error: err.message });
    }
    this.emit("batch_replicated", {
      replicator: this.name,
      resourceName,
      total: records.length,
      successful: results.length,
      errors: errors.length
    });
    return {
      success: errors.length === 0,
      results,
      errors,
      total: records.length
    };
  }
  async testConnection() {
    const [ok, err] = await try_fn_default(async () => {
      if (!this.targetDatabase) {
        await this.initialize(this.database);
      }
      await this.targetDatabase.listResources();
      return true;
    });
    if (ok) return true;
    this.emit("connection_error", {
      replicator: this.name,
      error: err.message
    });
    return false;
  }
  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.targetDatabase,
      targetDatabase: this.connectionString || "client-provided",
      resources: Object.keys(this.resourcesMap || {}),
      totalreplicators: this.listenerCount("replicated"),
      totalErrors: this.listenerCount("replicator_error")
    };
  }
  async cleanup() {
    if (this.targetDatabase) {
      this.targetDatabase.removeAllListeners();
    }
    await super.cleanup();
  }
  shouldReplicateResource(resource, action) {
    const normResource = normalizeResourceName$1(resource);
    const entry = this.resourcesMap[normResource];
    if (!entry) return false;
    if (!action) return true;
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === "object" && item.resource) {
          if (item.actions && Array.isArray(item.actions)) {
            if (item.actions.includes(action)) return true;
          } else {
            return true;
          }
        } else if (typeof item === "string" || typeof item === "function") {
          return true;
        }
      }
      return false;
    }
    if (typeof entry === "object" && entry.resource) {
      if (entry.actions && Array.isArray(entry.actions)) {
        return entry.actions.includes(action);
      }
      return true;
    }
    if (typeof entry === "string" || typeof entry === "function") {
      return true;
    }
    return false;
  }
}
var s3db_replicator_class_default = S3dbReplicator;

class SqsReplicator extends base_replicator_class_default {
  constructor(config = {}, resources = [], client = null) {
    super(config);
    this.resources = resources;
    this.client = client;
    this.queueUrl = config.queueUrl;
    this.queues = config.queues || {};
    this.defaultQueue = config.defaultQueue || config.defaultQueueUrl || config.queueUrlDefault;
    this.region = config.region || "us-east-1";
    this.sqsClient = client || null;
    this.messageGroupId = config.messageGroupId;
    this.deduplicationId = config.deduplicationId;
    if (resources && typeof resources === "object") {
      for (const [resourceName, resourceConfig] of Object.entries(resources)) {
        if (resourceConfig.queueUrl) {
          this.queues[resourceName] = resourceConfig.queueUrl;
        }
      }
    }
  }
  validateConfig() {
    const errors = [];
    if (!this.queueUrl && Object.keys(this.queues).length === 0 && !this.defaultQueue && !this.resourceQueueMap) {
      errors.push("Either queueUrl, queues object, defaultQueue, or resourceQueueMap must be provided");
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  getQueueUrlsForResource(resource) {
    if (this.resourceQueueMap && this.resourceQueueMap[resource]) {
      return this.resourceQueueMap[resource];
    }
    if (this.queues[resource]) {
      return [this.queues[resource]];
    }
    if (this.queueUrl) {
      return [this.queueUrl];
    }
    if (this.defaultQueue) {
      return [this.defaultQueue];
    }
    throw new Error(`No queue URL found for resource '${resource}'`);
  }
  _applyTransformer(resource, data) {
    const entry = this.resources[resource];
    let result = data;
    if (!entry) return data;
    if (typeof entry.transform === "function") {
      result = entry.transform(data);
    } else if (typeof entry.transformer === "function") {
      result = entry.transformer(data);
    }
    return result || data;
  }
  /**
   * Create standardized message structure
   */
  createMessage(resource, operation, data, id, beforeData = null) {
    const baseMessage = {
      resource,
      // padronizado para 'resource'
      action: operation,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      source: "s3db-replicator"
    };
    switch (operation) {
      case "insert":
        return {
          ...baseMessage,
          data
        };
      case "update":
        return {
          ...baseMessage,
          before: beforeData,
          data
        };
      case "delete":
        return {
          ...baseMessage,
          data
        };
      default:
        return {
          ...baseMessage,
          data
        };
    }
  }
  async initialize(database, client) {
    await super.initialize(database);
    if (!this.sqsClient) {
      const [ok, err, sdk] = await try_fn_default(() => import('@aws-sdk/client-sqs'));
      if (!ok) {
        this.emit("initialization_error", {
          replicator: this.name,
          error: err.message
        });
        throw err;
      }
      const { SQSClient } = sdk;
      this.sqsClient = client || new SQSClient({
        region: this.region,
        credentials: this.config.credentials
      });
      this.emit("initialized", {
        replicator: this.name,
        queueUrl: this.queueUrl,
        queues: this.queues,
        defaultQueue: this.defaultQueue
      });
    }
  }
  async replicate(resource, operation, data, id, beforeData = null) {
    if (!this.enabled || !this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const [ok, err, result] = await try_fn_default(async () => {
      const { SendMessageCommand } = await import('@aws-sdk/client-sqs');
      const queueUrls = this.getQueueUrlsForResource(resource);
      const transformedData = this._applyTransformer(resource, data);
      const message = this.createMessage(resource, operation, transformedData, id, beforeData);
      const results = [];
      for (const queueUrl of queueUrls) {
        const command = new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
          MessageGroupId: this.messageGroupId,
          MessageDeduplicationId: this.deduplicationId ? `${resource}:${operation}:${id}` : void 0
        });
        const result2 = await this.sqsClient.send(command);
        results.push({ queueUrl, messageId: result2.MessageId });
        this.emit("replicated", {
          replicator: this.name,
          resource,
          operation,
          id,
          queueUrl,
          messageId: result2.MessageId,
          success: true
        });
      }
      return { success: true, results };
    });
    if (ok) return result;
    this.emit("replicator_error", {
      replicator: this.name,
      resource,
      operation,
      id,
      error: err.message
    });
    return { success: false, error: err.message };
  }
  async replicateBatch(resource, records) {
    if (!this.enabled || !this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const [ok, err, result] = await try_fn_default(async () => {
      const { SendMessageBatchCommand } = await import('@aws-sdk/client-sqs');
      const queueUrls = this.getQueueUrlsForResource(resource);
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < records.length; i += batchSize) {
        batches.push(records.slice(i, i + batchSize));
      }
      const results = [];
      const errors = [];
      for (const batch of batches) {
        const [okBatch, errBatch] = await try_fn_default(async () => {
          const entries = batch.map((record, index) => ({
            Id: `${record.id}-${index}`,
            MessageBody: JSON.stringify(this.createMessage(
              resource,
              record.operation,
              record.data,
              record.id,
              record.beforeData
            )),
            MessageGroupId: this.messageGroupId,
            MessageDeduplicationId: this.deduplicationId ? `${resource}:${record.operation}:${record.id}` : void 0
          }));
          const command = new SendMessageBatchCommand({
            QueueUrl: queueUrls[0],
            // Assuming all queueUrls in a batch are the same for batching
            Entries: entries
          });
          const result2 = await this.sqsClient.send(command);
          results.push(result2);
        });
        if (!okBatch) {
          errors.push({ batch: batch.length, error: errBatch.message });
          if (errBatch.message && (errBatch.message.includes("Batch error") || errBatch.message.includes("Connection") || errBatch.message.includes("Network"))) {
            throw errBatch;
          }
        }
      }
      this.emit("batch_replicated", {
        replicator: this.name,
        resource,
        queueUrl: queueUrls[0],
        // Assuming all queueUrls in a batch are the same for batching
        total: records.length,
        successful: results.length,
        errors: errors.length
      });
      return {
        success: errors.length === 0,
        results,
        errors,
        total: records.length,
        queueUrl: queueUrls[0]
        // Assuming all queueUrls in a batch are the same for batching
      };
    });
    if (ok) return result;
    const errorMessage = err?.message || err || "Unknown error";
    this.emit("batch_replicator_error", {
      replicator: this.name,
      resource,
      error: errorMessage
    });
    return { success: false, error: errorMessage };
  }
  async testConnection() {
    const [ok, err] = await try_fn_default(async () => {
      if (!this.sqsClient) {
        await this.initialize(this.database);
      }
      const { GetQueueAttributesCommand } = await import('@aws-sdk/client-sqs');
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: ["QueueArn"]
      });
      await this.sqsClient.send(command);
      return true;
    });
    if (ok) return true;
    this.emit("connection_error", {
      replicator: this.name,
      error: err.message
    });
    return false;
  }
  async getStatus() {
    const baseStatus = await super.getStatus();
    return {
      ...baseStatus,
      connected: !!this.sqsClient,
      queueUrl: this.queueUrl,
      region: this.region,
      resources: this.resources,
      totalreplicators: this.listenerCount("replicated"),
      totalErrors: this.listenerCount("replicator_error")
    };
  }
  async cleanup() {
    if (this.sqsClient) {
      this.sqsClient.destroy();
    }
    await super.cleanup();
  }
  shouldReplicateResource(resource) {
    const result = this.resourceQueueMap && Object.keys(this.resourceQueueMap).includes(resource) || this.queues && Object.keys(this.queues).includes(resource) || !!(this.defaultQueue || this.queueUrl) || this.resources && Object.keys(this.resources).includes(resource) || false;
    return result;
  }
}
var sqs_replicator_class_default = SqsReplicator;

const REPLICATOR_DRIVERS = {
  s3db: s3db_replicator_class_default,
  sqs: sqs_replicator_class_default,
  bigquery: bigquery_replicator_class_default,
  postgres: postgres_replicator_class_default
};
function createReplicator(driver, config = {}, resources = [], client = null) {
  const ReplicatorClass = REPLICATOR_DRIVERS[driver];
  if (!ReplicatorClass) {
    throw new Error(`Unknown replicator driver: ${driver}. Available drivers: ${Object.keys(REPLICATOR_DRIVERS).join(", ")}`);
  }
  return new ReplicatorClass(config, resources, client);
}

function normalizeResourceName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : name;
}
class ReplicatorPlugin extends plugin_class_default {
  constructor(options = {}) {
    super();
    if (options.verbose) {
      console.log("[PLUGIN][CONSTRUCTOR] ReplicatorPlugin constructor called");
    }
    if (options.verbose) {
      console.log("[PLUGIN][constructor] New ReplicatorPlugin instance created with config:", options);
    }
    if (!options.replicators || !Array.isArray(options.replicators)) {
      throw new Error("ReplicatorPlugin: replicators array is required");
    }
    for (const rep of options.replicators) {
      if (!rep.driver) throw new Error("ReplicatorPlugin: each replicator must have a driver");
    }
    this.config = {
      verbose: options.verbose ?? false,
      persistReplicatorLog: options.persistReplicatorLog ?? false,
      replicatorLogResource: options.replicatorLogResource ?? "replicator_logs",
      replicators: options.replicators || []
    };
    this.replicators = [];
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      totalOperations: 0,
      totalErrors: 0,
      lastError: null
    };
    this._installedListeners = [];
  }
  /**
   * Decompress data if it was compressed
   */
  async decompressData(data) {
    return data;
  }
  // Helper to filter out internal S3DB fields
  filterInternalFields(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const filtered = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!key.startsWith("_") && key !== "$overflow" && key !== "$before" && key !== "$after") {
        filtered[key] = value;
      }
    }
    return filtered;
  }
  installEventListeners(resource) {
    const plugin = this;
    if (plugin.config.verbose) {
      console.log("[PLUGIN] installEventListeners called for:", resource && resource.name, {
        hasDatabase: !!resource.database,
        sameDatabase: resource.database === plugin.database,
        alreadyInstalled: resource._replicatorListenersInstalled,
        resourceObj: resource,
        resourceObjId: resource && resource.id,
        resourceObjType: typeof resource,
        resourceObjIs: resource && Object.is(resource, plugin.database.resources && plugin.database.resources[resource.name]),
        resourceObjEq: resource === (plugin.database.resources && plugin.database.resources[resource.name])
      });
    }
    if (!resource || resource.name === plugin.config.replicatorLogResource || !resource.database || resource.database !== plugin.database) return;
    if (resource._replicatorListenersInstalled) return;
    resource._replicatorListenersInstalled = true;
    this._installedListeners.push(resource);
    if (plugin.config.verbose) {
      console.log(`[PLUGIN] installEventListeners INSTALLED for resource: ${resource && resource.name}`);
    }
    resource.on("insert", async (data) => {
      if (plugin.config.verbose) {
        console.log("[PLUGIN] Listener INSERT on", resource.name, "plugin.replicators.length:", plugin.replicators.length, plugin.replicators.map((r) => ({ id: r.id, driver: r.driver })));
      }
      try {
        const completeData = await plugin.getCompleteData(resource, data);
        if (plugin.config.verbose) {
          console.log(`[PLUGIN] Listener INSERT completeData for ${resource.name} id=${data && data.id}:`, completeData);
        }
        await plugin.processReplicatorEvent(resource.name, "insert", data.id, completeData, null);
      } catch (err) {
        if (plugin.config.verbose) {
          console.error(`[PLUGIN] Listener INSERT error on ${resource.name} id=${data && data.id}:`, err);
        }
      }
    });
    resource.on("update", async (data) => {
      console.log("[PLUGIN][Listener][UPDATE][START] triggered for resource:", resource.name, "data:", data);
      const beforeData = data && data.$before;
      if (plugin.config.verbose) {
        console.log("[PLUGIN] Listener UPDATE on", resource.name, "plugin.replicators.length:", plugin.replicators.length, plugin.replicators.map((r) => ({ id: r.id, driver: r.driver })), "data:", data, "beforeData:", beforeData);
      }
      try {
        let completeData;
        const [ok, err, record] = await try_fn_default(() => resource.get(data.id));
        if (ok && record) {
          completeData = record;
        } else {
          completeData = data;
        }
        await plugin.processReplicatorEvent(resource.name, "update", data.id, completeData, beforeData);
      } catch (err) {
        if (plugin.config.verbose) {
          console.error(`[PLUGIN] Listener UPDATE erro em ${resource.name} id=${data && data.id}:`, err);
        }
      }
    });
    resource.on("delete", async (data, beforeData) => {
      if (plugin.config.verbose) {
        console.log("[PLUGIN] Listener DELETE on", resource.name, "plugin.replicators.length:", plugin.replicators.length, plugin.replicators.map((r) => ({ id: r.id, driver: r.driver })));
      }
      try {
        await plugin.processReplicatorEvent(resource.name, "delete", data.id, null, beforeData);
      } catch (err) {
        if (plugin.config.verbose) {
          console.error(`[PLUGIN] Listener DELETE erro em ${resource.name} id=${data && data.id}:`, err);
        }
      }
    });
    if (plugin.config.verbose) {
      console.log(`[PLUGIN] Listeners instalados para resource: ${resource && resource.name} (insert: ${resource.listenerCount("insert")}, update: ${resource.listenerCount("update")}, delete: ${resource.listenerCount("delete")})`);
    }
  }
  /**
   * Get complete data by always fetching the full record from the resource
   * This ensures we always have the complete data regardless of behavior or data size
   */
  async getCompleteData(resource, data) {
    const [ok, err, completeRecord] = await try_fn_default(() => resource.get(data.id));
    return ok ? completeRecord : data;
  }
  async setup(database) {
    console.log("[PLUGIN][SETUP] setup called");
    if (this.config.verbose) {
      console.log("[PLUGIN][setup] called with database:", database && database.name);
    }
    this.database = database;
    if (this.config.persistReplicatorLog) {
      let logRes = database.resources[normalizeResourceName(this.config.replicatorLogResource)];
      if (!logRes) {
        logRes = await database.createResource({
          name: this.config.replicatorLogResource,
          behavior: "truncate-data",
          attributes: {
            id: "string|required",
            resource: "string|required",
            action: "string|required",
            data: "object",
            timestamp: "number|required",
            createdAt: "string|required"
          },
          partitions: {
            byDate: { fields: { "createdAt": "string|maxlength:10" } }
          }
        });
        if (this.config.verbose) {
          console.log("[PLUGIN] Log resource created:", this.config.replicatorLogResource, !!logRes);
        }
      }
      database.resources[normalizeResourceName(this.config.replicatorLogResource)] = logRes;
      this.replicatorLog = logRes;
      if (this.config.verbose) {
        console.log("[PLUGIN] Log resource created and registered:", this.config.replicatorLogResource, !!database.resources[normalizeResourceName(this.config.replicatorLogResource)]);
      }
      if (typeof database.uploadMetadataFile === "function") {
        await database.uploadMetadataFile();
        if (this.config.verbose) {
          console.log("[PLUGIN] uploadMetadataFile called. database.resources keys:", Object.keys(database.resources));
        }
      }
    }
    if (this.config.replicators && this.config.replicators.length > 0 && this.replicators.length === 0) {
      await this.initializeReplicators();
      console.log("[PLUGIN][SETUP] after initializeReplicators, replicators.length:", this.replicators.length);
      if (this.config.verbose) {
        console.log("[PLUGIN][setup] After initializeReplicators, replicators.length:", this.replicators.length, this.replicators.map((r) => ({ id: r.id, driver: r.driver })));
      }
    }
    for (const resourceName in database.resources) {
      if (normalizeResourceName(resourceName) !== normalizeResourceName(this.config.replicatorLogResource)) {
        this.installEventListeners(database.resources[resourceName]);
      }
    }
    database.on("connected", () => {
      for (const resourceName in database.resources) {
        if (normalizeResourceName(resourceName) !== normalizeResourceName(this.config.replicatorLogResource)) {
          this.installEventListeners(database.resources[resourceName]);
        }
      }
    });
    const originalCreateResource = database.createResource.bind(database);
    database.createResource = async (config) => {
      if (this.config.verbose) {
        console.log("[PLUGIN] createResource proxy called for:", config && config.name);
      }
      const resource = await originalCreateResource(config);
      if (resource && resource.name !== this.config.replicatorLogResource) {
        this.installEventListeners(resource);
      }
      return resource;
    };
    database.on("s3db.resourceCreated", (resourceName) => {
      const resource = database.resources[resourceName];
      if (resource && resource.name !== this.config.replicatorLogResource) {
        this.installEventListeners(resource);
      }
    });
    database.on("s3db.resourceUpdated", (resourceName) => {
      const resource = database.resources[resourceName];
      if (resource && resource.name !== this.config.replicatorLogResource) {
        this.installEventListeners(resource);
      }
    });
  }
  async initializeReplicators() {
    console.log("[PLUGIN][INIT] initializeReplicators called");
    for (const replicatorConfig of this.config.replicators) {
      try {
        console.log("[PLUGIN][INIT] processing replicatorConfig:", replicatorConfig);
        const driver = replicatorConfig.driver;
        const resources = replicatorConfig.resources;
        const client = replicatorConfig.client;
        const replicator = createReplicator(driver, replicatorConfig, resources, client);
        if (replicator) {
          await replicator.initialize(this.database);
          this.replicators.push({
            id: Math.random().toString(36).slice(2),
            driver,
            config: replicatorConfig,
            resources,
            instance: replicator
          });
          console.log("[PLUGIN][INIT] pushed replicator:", driver, resources);
        } else {
          console.log("[PLUGIN][INIT] createReplicator returned null/undefined for driver:", driver);
        }
      } catch (err) {
        console.error("[PLUGIN][INIT] Error creating replicator:", err);
      }
    }
  }
  async start() {
  }
  async stop() {
  }
  async processReplicatorEvent(resourceName, operation, recordId, data, beforeData = null) {
    if (this.config.verbose) {
      console.log("[PLUGIN][processReplicatorEvent] replicators.length:", this.replicators.length, this.replicators.map((r) => ({ id: r.id, driver: r.driver })));
      console.log(`[PLUGIN][processReplicatorEvent] operation: ${operation}, resource: ${resourceName}, recordId: ${recordId}, data:`, data, "beforeData:", beforeData);
    }
    if (this.config.verbose) {
      console.log(`[PLUGIN] processReplicatorEvent: resource=${resourceName} op=${operation} id=${recordId} data=`, data);
    }
    if (this.config.verbose) {
      console.log(`[PLUGIN] processReplicatorEvent: resource=${resourceName} op=${operation} replicators=${this.replicators.length}`);
    }
    if (this.replicators.length === 0) {
      if (this.config.verbose) {
        console.log("[PLUGIN] No replicators registered");
      }
      return;
    }
    const applicableReplicators = this.replicators.filter((replicator) => {
      const should = replicator.instance.shouldReplicateResource(resourceName, operation);
      if (this.config.verbose) {
        console.log(`[PLUGIN] Replicator ${replicator.driver} shouldReplicateResource(${resourceName}, ${operation}):`, should);
      }
      return should;
    });
    if (this.config.verbose) {
      console.log(`[PLUGIN] processReplicatorEvent: applicableReplicators for resource=${resourceName}:`, applicableReplicators.map((r) => r.driver));
    }
    if (applicableReplicators.length === 0) {
      if (this.config.verbose) {
        console.log("[PLUGIN] No applicable replicators for resource", resourceName);
      }
      return;
    }
    const filteredData = this.filterInternalFields(isPlainObject(data) ? data : { raw: data });
    const filteredBeforeData = beforeData ? this.filterInternalFields(isPlainObject(beforeData) ? beforeData : { raw: beforeData }) : null;
    const item = {
      id: `repl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      resourceName,
      operation,
      recordId,
      data: filteredData,
      beforeData: filteredBeforeData,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      attempts: 0
    };
    const logId = await this.logreplicator(item);
    const [ok, err, result] = await try_fn_default(async () => this.processreplicatorItem(item));
    if (ok) {
      if (logId) {
        await this.updatereplicatorLog(logId, {
          status: result.success ? "success" : "failed",
          attempts: 1,
          error: result.success ? "" : JSON.stringify(result.results)
        });
      }
      this.stats.totalOperations++;
      if (result.success) {
        this.stats.successfulOperations++;
      } else {
        this.stats.failedOperations++;
      }
    } else {
      if (logId) {
        await this.updatereplicatorLog(logId, {
          status: "failed",
          attempts: 1,
          error: err.message
        });
      }
      this.stats.failedOperations++;
    }
  }
  async processreplicatorItem(item) {
    if (this.config.verbose) {
      console.log("[PLUGIN][processreplicatorItem] called with item:", item);
    }
    const applicableReplicators = this.replicators.filter((replicator) => {
      const should = replicator.instance.shouldReplicateResource(item.resourceName, item.operation);
      if (this.config.verbose) {
        console.log(`[PLUGIN] processreplicatorItem: Replicator ${replicator.driver} shouldReplicateResource(${item.resourceName}, ${item.operation}):`, should);
      }
      return should;
    });
    if (this.config.verbose) {
      console.log(`[PLUGIN] processreplicatorItem: applicableReplicators for resource=${item.resourceName}:`, applicableReplicators.map((r) => r.driver));
    }
    if (applicableReplicators.length === 0) {
      if (this.config.verbose) {
        console.log("[PLUGIN] processreplicatorItem: No applicable replicators for resource", item.resourceName);
      }
      return { success: true, skipped: true, reason: "no_applicable_replicators" };
    }
    const results = [];
    for (const replicator of applicableReplicators) {
      let result;
      let ok, err;
      if (this.config.verbose) {
        console.log("[PLUGIN] processReplicatorItem", {
          resource: item.resourceName,
          operation: item.operation,
          data: item.data,
          beforeData: item.beforeData,
          replicator: replicator.instance?.constructor?.name
        });
      }
      if (replicator.instance && replicator.instance.constructor && replicator.instance.constructor.name === "S3dbReplicator") {
        [ok, err, result] = await try_fn_default(
          () => replicator.instance.replicate({
            resource: item.resourceName,
            operation: item.operation,
            data: item.data,
            id: item.recordId,
            beforeData: item.beforeData
          })
        );
      } else {
        [ok, err, result] = await try_fn_default(
          () => replicator.instance.replicate(
            item.resourceName,
            item.operation,
            item.data,
            item.recordId,
            item.beforeData
          )
        );
      }
      results.push({
        replicatorId: replicator.id,
        driver: replicator.driver,
        success: result && result.success,
        error: result && result.error,
        skipped: result && result.skipped
      });
    }
    return {
      success: results.every((r) => r.success || r.skipped),
      results
    };
  }
  async logreplicator(item) {
    const logRes = this.replicatorLog || this.database.resources[normalizeResourceName(this.config.replicatorLogResource)];
    if (!logRes) {
      if (this.config.verbose) {
        console.error("[PLUGIN] replicator log resource not found!");
      }
      if (this.database) {
        if (this.config.verbose) {
          console.warn("[PLUGIN] database.resources keys:", Object.keys(this.database.resources));
        }
        if (this.database.options && this.database.options.connectionString) {
          if (this.config.verbose) {
            console.warn("[PLUGIN] database connectionString:", this.database.options.connectionString);
          }
        }
      }
      this.emit("replicator.log.failed", { error: "replicator log resource not found", item });
      return;
    }
    const logItem = {
      id: item.id || `repl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      resource: item.resource || item.resourceName || "",
      action: item.operation || item.action || "",
      data: item.data || {},
      timestamp: typeof item.timestamp === "number" ? item.timestamp : Date.now(),
      createdAt: item.createdAt || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
    };
    try {
      await logRes.insert(logItem);
    } catch (err) {
      if (this.config.verbose) {
        console.error("[PLUGIN] Error writing to replicator log:", err);
      }
      this.emit("replicator.log.failed", { error: err, item });
    }
  }
  async updatereplicatorLog(logId, updates) {
    if (!this.replicatorLog) return;
    const [ok, err] = await try_fn_default(async () => {
      await this.replicatorLog.update(logId, {
        ...updates,
        lastAttempt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    if (!ok) {
      this.emit("replicator.updateLog.failed", { error: err.message, logId, updates });
    }
  }
  // Utility methods
  async getreplicatorStats() {
    const replicatorStats = await Promise.all(
      this.replicators.map(async (replicator) => {
        const status = await replicator.instance.getStatus();
        return {
          id: replicator.id,
          driver: replicator.driver,
          config: replicator.config,
          status
        };
      })
    );
    return {
      replicators: replicatorStats,
      queue: {
        length: this.queue.length,
        isProcessing: this.isProcessing
      },
      stats: this.stats,
      lastSync: this.stats.lastSync
    };
  }
  async getreplicatorLogs(options = {}) {
    if (!this.replicatorLog) {
      return [];
    }
    const {
      resourceName,
      operation,
      status,
      limit = 100,
      offset = 0
    } = options;
    let query = {};
    if (resourceName) {
      query.resourceName = resourceName;
    }
    if (operation) {
      query.operation = operation;
    }
    if (status) {
      query.status = status;
    }
    const logs = await this.replicatorLog.list(query);
    return logs.slice(offset, offset + limit);
  }
  async retryFailedreplicators() {
    if (!this.replicatorLog) {
      return { retried: 0 };
    }
    const failedLogs = await this.replicatorLog.list({
      status: "failed"
    });
    let retried = 0;
    for (const log of failedLogs) {
      const [ok, err] = await try_fn_default(async () => {
        await this.processReplicatorEvent(
          log.resourceName,
          log.operation,
          log.recordId,
          log.data
        );
      });
      if (ok) {
        retried++;
      } else {
        if (this.config.verbose) {
          console.error("Failed to retry replicator:", err);
        }
      }
    }
    return { retried };
  }
  async syncAllData(replicatorId) {
    const replicator = this.replicators.find((r) => r.id === replicatorId);
    if (!replicator) {
      throw new Error(`Replicator not found: ${replicatorId}`);
    }
    this.stats.lastSync = (/* @__PURE__ */ new Date()).toISOString();
    for (const resourceName in this.database.resources) {
      if (normalizeResourceName(resourceName) === normalizeResourceName("replicator_logs")) continue;
      if (replicator.instance.shouldReplicateResource(resourceName)) {
        this.emit("replicator.sync.resource", { resourceName, replicatorId });
        const resource = this.database.resources[resourceName];
        const allRecords = await resource.getAll();
        for (const record of allRecords) {
          await replicator.instance.replicate(resourceName, "insert", record, record.id);
        }
      }
    }
    this.emit("replicator.sync.completed", { replicatorId, stats: this.stats });
  }
  async cleanup() {
    if (this.config.verbose) {
      console.log("[PLUGIN][CLEANUP] Cleaning up ReplicatorPlugin");
    }
    if (this._installedListeners && Array.isArray(this._installedListeners)) {
      for (const resource of this._installedListeners) {
        if (resource && typeof resource.removeAllListeners === "function") {
          resource.removeAllListeners("insert");
          resource.removeAllListeners("update");
          resource.removeAllListeners("delete");
        }
        resource._replicatorListenersInstalled = false;
      }
      this._installedListeners = [];
    }
    if (this.database && typeof this.database.removeAllListeners === "function") {
      this.database.removeAllListeners();
    }
    if (this.replicators && Array.isArray(this.replicators)) {
      for (const rep of this.replicators) {
        if (rep.instance && typeof rep.instance.cleanup === "function") {
          await rep.instance.cleanup();
        }
      }
      this.replicators = [];
    }
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      totalOperations: 0,
      totalErrors: 0,
      lastError: null
    };
    if (this.config.verbose) {
      console.log("[PLUGIN][CLEANUP] ReplicatorPlugin cleanup complete");
    }
  }
}

export { AVAILABLE_BEHAVIORS, AuditPlugin, AuthenticationError, BaseError, CachePlugin, Client, ConnectionString, ConnectionStringError, CostsPlugin, CryptoError, DEFAULT_BEHAVIOR, Database, DatabaseError, EncryptionError, ErrorMap, FullTextPlugin, InvalidResourceItem, MetricsPlugin, MissingMetadata, NoSuchBucket, NoSuchKey, NotFound, PartitionError, PermissionError, plugin_class_default as Plugin, PluginObject, ReplicatorPlugin, Resource, ResourceError, ResourceIdsPageReader, ResourceIdsReader, ResourceNotFound, ResourceReader, ResourceWriter, Database as S3db, S3dbError, Schema, SchemaError, UnknownError, ValidationError, Validator, behaviors, calculateAttributeNamesSize, calculateAttributeSizes, calculateEffectiveLimit, calculateSystemOverhead, calculateTotalSize, calculateUTF8Bytes, decode, decodeDecimal, decrypt, S3db as default, encode, encodeDecimal, encrypt, getBehavior, getSizeBreakdown, idGenerator, mapAwsError, md5, passwordGenerator, sha256, streamToString, transformValue, tryFn, tryFnSync };
