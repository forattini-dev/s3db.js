'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var crypto = require('crypto');
var nanoid = require('nanoid');
var EventEmitter = require('events');
var promises = require('fs/promises');
var fs = require('fs');
var promises$1 = require('stream/promises');
var path = require('path');
var zlib = require('node:zlib');
var os = require('os');
var jsonStableStringify = require('json-stable-stringify');
var stream = require('stream');
var promisePool = require('@supercharge/promise-pool');
var web = require('node:stream/web');
var os$1 = require('node:os');
var lodashEs = require('lodash-es');
var http = require('http');
var https = require('https');
var nodeHttpHandler = require('@smithy/node-http-handler');
var clientS3 = require('@aws-sdk/client-s3');
var flat = require('flat');
var FastestValidator = require('fastest-validator');

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
const encodeFixedPoint = (n, precision = 6) => {
  if (typeof n !== "number" || isNaN(n)) return "undefined";
  if (!isFinite(n)) return "undefined";
  const scale = Math.pow(10, precision);
  const scaled = Math.round(n * scale);
  if (scaled === 0) return "^0";
  const negative = scaled < 0;
  let num = Math.abs(scaled);
  let s = "";
  while (num > 0) {
    s = alphabet[num % base] + s;
    num = Math.floor(num / base);
  }
  return "^" + (negative ? "-" : "") + s;
};
const decodeFixedPoint = (s, precision = 6) => {
  if (typeof s !== "string") return NaN;
  if (!s.startsWith("^")) return NaN;
  s = s.slice(1);
  if (s === "0") return 0;
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
  const scale = Math.pow(10, precision);
  const scaled = negative ? -r : r;
  return scaled / scale;
};

const utf8BytesMemory = /* @__PURE__ */ new Map();
const UTF8_MEMORY_MAX_SIZE = 1e4;
function calculateUTF8Bytes(str) {
  if (typeof str !== "string") {
    str = String(str);
  }
  if (utf8BytesMemory.has(str)) {
    return utf8BytesMemory.get(str);
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
  if (utf8BytesMemory.size < UTF8_MEMORY_MAX_SIZE) {
    utf8BytesMemory.set(str, bytes);
  } else if (utf8BytesMemory.size === UTF8_MEMORY_MAX_SIZE) {
    const entriesToDelete = Math.floor(UTF8_MEMORY_MAX_SIZE / 2);
    let deleted = 0;
    for (const key of utf8BytesMemory.keys()) {
      if (deleted >= entriesToDelete) break;
      utf8BytesMemory.delete(key);
      deleted++;
    }
    utf8BytesMemory.set(str, bytes);
  }
  return bytes;
}
function clearUTF8Memory() {
  utf8BytesMemory.clear();
}
const clearUTF8Memo = clearUTF8Memory;
const clearUTF8Cache = clearUTF8Memory;
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
  constructor({ verbose, bucket, key, message, code, statusCode, requestId, awsMessage, original, commandName, commandInput, metadata, description, ...rest }) {
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
    this.description = description;
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
      description: this.description,
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
  let description;
  if (code === "NoSuchKey" || code === "NotFound") {
    description = "The specified key does not exist in the bucket. Check if the key exists and if your credentials have permission to access it.";
    return new NoSuchKey({ ...context, original: err, metadata, commandName, commandInput, description });
  }
  if (code === "NoSuchBucket") {
    description = "The specified bucket does not exist. Check if the bucket name is correct and if your credentials have permission to access it.";
    return new NoSuchBucket({ ...context, original: err, metadata, commandName, commandInput, description });
  }
  if (code === "AccessDenied" || err.statusCode === 403 || code === "Forbidden") {
    description = "Access denied. Check your AWS credentials, IAM permissions, and bucket policy.";
    return new PermissionError("Access denied", { ...context, original: err, metadata, commandName, commandInput, description });
  }
  if (code === "ValidationError" || err.statusCode === 400) {
    description = "Validation error. Check the request parameters and payload format.";
    return new ValidationError("Validation error", { ...context, original: err, metadata, commandName, commandInput, description });
  }
  if (code === "MissingMetadata") {
    description = "Object metadata is missing or invalid. Check if the object was uploaded correctly.";
    return new MissingMetadata({ ...context, original: err, metadata, commandName, commandInput, description });
  }
  const errorDetails = [
    `Unknown error: ${err.message || err.toString()}`,
    err.code && `Code: ${err.code}`,
    err.statusCode && `Status: ${err.statusCode}`,
    err.stack && `Stack: ${err.stack.split("\n")[0]}`
  ].filter(Boolean).join(" | ");
  description = `Check the error details and AWS documentation. Original error: ${err.message || err.toString()}`;
  return new UnknownError(errorDetails, { ...context, original: err, metadata, commandName, commandInput, description });
}
class ConnectionStringError extends S3dbError {
  constructor(message, details = {}) {
    const description = details.description || "Invalid connection string format. Check the connection string syntax and credentials.";
    super(message, { ...details, description });
  }
}
class CryptoError extends S3dbError {
  constructor(message, details = {}) {
    const description = details.description || "Cryptography operation failed. Check if the crypto library is available and input is valid.";
    super(message, { ...details, description });
  }
}
class SchemaError extends S3dbError {
  constructor(message, details = {}) {
    const description = details.description || "Schema validation failed. Check schema definition and input data format.";
    super(message, { ...details, description });
  }
}
class ResourceError extends S3dbError {
  constructor(message, details = {}) {
    const description = details.description || "Resource operation failed. Check resource configuration, attributes, and operation context.";
    super(message, { ...details, description });
    Object.assign(this, details);
  }
}
class PartitionError extends S3dbError {
  constructor(message, details = {}) {
    let description = details.description;
    if (!description && details.resourceName && details.partitionName && details.fieldName) {
      const { resourceName, partitionName, fieldName, availableFields = [] } = details;
      description = `
Partition Field Validation Error

Resource: ${resourceName}
Partition: ${partitionName}
Missing Field: ${fieldName}

Available fields in schema:
${availableFields.map((f) => `  \u2022 ${f}`).join("\n") || "  (no fields defined)"}

Possible causes:
1. Field was removed from schema but partition still references it
2. Typo in partition field name
3. Nested field path is incorrect (use dot notation like 'utm.source')

Solution:
${details.strictValidation === false ? "  \u2022 Update partition definition to use existing fields" : `  \u2022 Add missing field to schema, OR
  \u2022 Update partition definition to use existing fields, OR
  \u2022 Use strictValidation: false to skip this check during testing`}

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partitions
`.trim();
    }
    super(message, {
      ...details,
      description
    });
  }
}
class AnalyticsNotEnabledError extends S3dbError {
  constructor(details = {}) {
    const {
      pluginName = "EventualConsistency",
      resourceName = "unknown",
      field = "unknown",
      configuredResources = [],
      registeredResources = [],
      pluginInitialized = false,
      ...rest
    } = details;
    const message = `Analytics not enabled for ${resourceName}.${field}`;
    const description = `
Analytics Not Enabled

Plugin: ${pluginName}
Resource: ${resourceName}
Field: ${field}

Diagnostics:
  \u2022 Plugin initialized: ${pluginInitialized ? "\u2713 Yes" : "\u2717 No"}
  \u2022 Analytics resources created: ${registeredResources.length}/${configuredResources.length}
${configuredResources.map((r) => {
      const exists = registeredResources.includes(r);
      return `    ${exists ? "\u2713" : "\u2717"} ${r}${!exists ? " (missing)" : ""}`;
    }).join("\n")}

Possible causes:
1. Resource not created yet - Analytics resources are created when db.createResource() is called
2. Resource created before plugin initialization - Plugin must be initialized before resources
3. Field not configured in analytics.resources config

Correct initialization order:
  1. Create database: const db = new Database({ ... })
  2. Install plugins: await db.connect() (triggers plugin.install())
  3. Create resources: await db.createResource({ name: '${resourceName}', ... })
  4. Analytics resources are auto-created by plugin

Example fix:
  const db = new Database({
    bucket: 'my-bucket',
    plugins: [new EventualConsistencyPlugin({
      resources: {
        '${resourceName}': {
          fields: {
            '${field}': { type: 'counter', analytics: true }
          }
        }
      }
    })]
  });

  await db.connect();  // Plugin initialized here
  await db.createResource({ name: '${resourceName}', ... });  // Analytics resource created here

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/eventual-consistency.md
`.trim();
    super(message, {
      ...rest,
      pluginName,
      resourceName,
      field,
      configuredResources,
      registeredResources,
      pluginInitialized,
      description
    });
  }
}
class PluginError extends S3dbError {
  constructor(message, details = {}) {
    const {
      pluginName = "Unknown",
      operation = "unknown",
      ...rest
    } = details;
    let description = details.description;
    if (!description) {
      description = `
Plugin Error

Plugin: ${pluginName}
Operation: ${operation}

Possible causes:
1. Plugin not properly initialized
2. Plugin configuration is invalid
3. Plugin dependencies not met
4. Plugin method called before installation

Solution:
Ensure plugin is added to database and connect() is called before usage.

Example:
  const db = new Database({
    bucket: 'my-bucket',
    plugins: [new ${pluginName}({ /* config */ })]
  });

  await db.connect();  // Plugin installed here
  // Now plugin methods are available

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/README.md
`.trim();
    }
    super(message, {
      ...rest,
      pluginName,
      operation,
      description
    });
  }
}
class PluginStorageError extends S3dbError {
  constructor(message, details = {}) {
    const {
      pluginSlug = "unknown",
      key = "",
      operation = "unknown",
      ...rest
    } = details;
    let description = details.description;
    if (!description) {
      description = `
Plugin Storage Error

Plugin: ${pluginSlug}
Key: ${key}
Operation: ${operation}

Possible causes:
1. Storage not initialized (plugin not installed)
2. Invalid key format
3. S3 operation failed
4. Permissions issue

Solution:
Ensure plugin has access to storage and key is valid.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/README.md#plugin-storage
`.trim();
    }
    super(message, {
      ...rest,
      pluginSlug,
      key,
      operation,
      description
    });
  }
}
class PartitionDriverError extends S3dbError {
  constructor(message, details = {}) {
    const {
      driver = "unknown",
      operation = "unknown",
      queueSize,
      maxQueueSize,
      ...rest
    } = details;
    let description = details.description;
    if (!description && queueSize !== void 0 && maxQueueSize !== void 0) {
      description = `
Partition Driver Error

Driver: ${driver}
Operation: ${operation}
Queue Status: ${queueSize}/${maxQueueSize}

Possible causes:
1. Queue is full (backpressure)
2. Driver not properly configured
3. SQS permissions issue (if using SQS driver)

Solution:
${queueSize >= maxQueueSize ? "Wait for queue to drain or increase maxQueueSize" : "Check driver configuration and permissions"}

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partition-drivers
`.trim();
    } else if (!description) {
      description = `
Partition Driver Error

Driver: ${driver}
Operation: ${operation}

Check driver configuration and permissions.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partition-drivers
`.trim();
    }
    super(message, {
      ...rest,
      driver,
      operation,
      queueSize,
      maxQueueSize,
      description
    });
  }
}
class BehaviorError extends S3dbError {
  constructor(message, details = {}) {
    const {
      behavior = "unknown",
      availableBehaviors = [],
      ...rest
    } = details;
    let description = details.description;
    if (!description) {
      description = `
Behavior Error

Requested: ${behavior}
Available: ${availableBehaviors.join(", ") || "body-overflow, body-only, truncate-data, enforce-limits, user-managed"}

Possible causes:
1. Behavior name misspelled
2. Custom behavior not registered

Solution:
Use one of the available behaviors or register custom behavior.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#behaviors
`.trim();
    }
    super(message, {
      ...rest,
      behavior,
      availableBehaviors,
      description
    });
  }
}
class StreamError extends S3dbError {
  constructor(message, details = {}) {
    const {
      operation = "unknown",
      resource,
      ...rest
    } = details;
    let description = details.description;
    if (!description) {
      description = `
Stream Error

Operation: ${operation}
${resource ? `Resource: ${resource}` : ""}

Possible causes:
1. Stream not properly initialized
2. Resource not available
3. Network error during streaming

Solution:
Check stream configuration and resource availability.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#streaming
`.trim();
    }
    super(message, {
      ...rest,
      operation,
      resource,
      description
    });
  }
}
class MetadataLimitError extends S3dbError {
  constructor(message, details = {}) {
    const {
      totalSize,
      effectiveLimit,
      absoluteLimit = 2047,
      excess,
      resourceName,
      operation,
      ...rest
    } = details;
    let description = details.description;
    if (!description && totalSize && effectiveLimit) {
      description = `
S3 Metadata Size Limit Exceeded

Current Size: ${totalSize} bytes
Effective Limit: ${effectiveLimit} bytes
Absolute Limit: ${absoluteLimit} bytes
${excess ? `Excess: ${excess} bytes` : ""}
${resourceName ? `Resource: ${resourceName}` : ""}
${operation ? `Operation: ${operation}` : ""}

S3 has a hard limit of 2KB (2047 bytes) for object metadata.

Solutions:
1. Use 'body-overflow' behavior to store excess in body
2. Use 'body-only' behavior to store everything in body
3. Reduce number of fields
4. Use shorter field values
5. Enable advanced metadata encoding

Example:
  await db.createResource({
    name: '${resourceName || "myResource"}',
    behavior: 'body-overflow',  // Automatically handles overflow
    attributes: { ... }
  });

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#metadata-size-limits
`.trim();
    }
    super(message, {
      ...rest,
      totalSize,
      effectiveLimit,
      absoluteLimit,
      excess,
      resourceName,
      operation,
      description
    });
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

async function dynamicCrypto() {
  let lib;
  if (typeof process !== "undefined") {
    lib = crypto.webcrypto;
  } else if (typeof window !== "undefined") {
    lib = window.crypto;
  }
  if (!lib) throw new CryptoError("Could not load any crypto library", { context: "dynamicCrypto" });
  return lib;
}
async function sha256(message) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const [ok, err, hashBuffer] = await tryFn(() => cryptoLib.subtle.digest("SHA-256", data));
  if (!ok) throw new CryptoError("SHA-256 digest failed", { original: err, input: message });
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
async function encrypt(content, passphrase) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const salt = cryptoLib.getRandomValues(new Uint8Array(16));
  const [okKey, errKey, key] = await tryFn(() => getKeyMaterial(passphrase, salt));
  if (!okKey) throw new CryptoError("Key derivation failed", { original: errKey, passphrase, salt });
  const iv = cryptoLib.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encodedContent = encoder.encode(content);
  const [okEnc, errEnc, encryptedContent] = await tryFn(() => cryptoLib.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedContent));
  if (!okEnc) throw new CryptoError("Encryption failed", { original: errEnc, content });
  const encryptedData = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
  encryptedData.set(salt);
  encryptedData.set(iv, salt.length);
  encryptedData.set(new Uint8Array(encryptedContent), salt.length + iv.length);
  return arrayBufferToBase64(encryptedData);
}
async function decrypt(encryptedBase64, passphrase) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const encryptedData = base64ToArrayBuffer(encryptedBase64);
  const salt = encryptedData.slice(0, 16);
  const iv = encryptedData.slice(16, 28);
  const encryptedContent = encryptedData.slice(28);
  const [okKey, errKey, key] = await tryFn(() => getKeyMaterial(passphrase, salt));
  if (!okKey) throw new CryptoError("Key derivation failed (decrypt)", { original: errKey, passphrase, salt });
  const [okDec, errDec, decryptedContent] = await tryFn(() => cryptoLib.subtle.decrypt({ name: "AES-GCM", iv }, key, encryptedContent));
  if (!okDec) throw new CryptoError("Decryption failed", { original: errDec, encryptedBase64 });
  const decoder = new TextDecoder();
  return decoder.decode(decryptedContent);
}
async function md5(data) {
  if (typeof process === "undefined") {
    throw new CryptoError("MD5 hashing is only available in Node.js environment", { context: "md5" });
  }
  const [ok, err, result] = await tryFn(async () => {
    return crypto.createHash("md5").update(data).digest("base64");
  });
  if (!ok) {
    throw new CryptoError("MD5 hashing failed", { original: err, data });
  }
  return result;
}
async function getKeyMaterial(passphrase, salt) {
  const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
  if (!okCrypto) throw new CryptoError("Crypto API not available", { original: errCrypto });
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(passphrase);
  const [okImport, errImport, baseKey] = await tryFn(() => cryptoLib.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  ));
  if (!okImport) throw new CryptoError("importKey failed", { original: errImport, passphrase });
  const [okDerive, errDerive, derivedKey] = await tryFn(() => cryptoLib.subtle.deriveKey(
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

const idGenerator = nanoid.customAlphabet(nanoid.urlAlphabet, 22);
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const passwordGenerator = nanoid.customAlphabet(passwordAlphabet, 16);

var id = /*#__PURE__*/Object.freeze({
  __proto__: null,
  idGenerator: idGenerator,
  passwordGenerator: passwordGenerator
});

function analyzeString(str) {
  if (!str || typeof str !== "string") {
    return { type: "none", safe: true };
  }
  let hasLatin1 = false;
  let hasMultibyte = false;
  let asciiCount = 0;
  let latin1Count = 0;
  let multibyteCount = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      asciiCount++;
    } else if (code < 32 || code === 127) {
      hasMultibyte = true;
      multibyteCount++;
    } else if (code >= 128 && code <= 255) {
      hasLatin1 = true;
      latin1Count++;
    } else {
      hasMultibyte = true;
      multibyteCount++;
    }
  }
  if (!hasLatin1 && !hasMultibyte) {
    return {
      type: "ascii",
      safe: true,
      stats: { ascii: asciiCount, latin1: 0, multibyte: 0 }
    };
  }
  if (hasMultibyte) {
    const multibyteRatio = multibyteCount / str.length;
    if (multibyteRatio > 0.3) {
      return {
        type: "base64",
        safe: false,
        reason: "high multibyte content",
        stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
      };
    }
    return {
      type: "url",
      safe: false,
      reason: "contains multibyte characters",
      stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
    };
  }
  const latin1Ratio = latin1Count / str.length;
  if (latin1Ratio > 0.5) {
    return {
      type: "base64",
      safe: false,
      reason: "high Latin-1 content",
      stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
    };
  }
  return {
    type: "url",
    safe: false,
    reason: "contains Latin-1 extended characters",
    stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
  };
}
function metadataEncode(value) {
  if (value === null) {
    return { encoded: "null", encoding: "special" };
  }
  if (value === void 0) {
    return { encoded: "undefined", encoding: "special" };
  }
  const stringValue = String(value);
  const analysis = analyzeString(stringValue);
  switch (analysis.type) {
    case "none":
    case "ascii":
      return {
        encoded: stringValue,
        encoding: "none",
        analysis
      };
    case "url":
      return {
        encoded: "u:" + encodeURIComponent(stringValue),
        encoding: "url",
        analysis
      };
    case "base64":
      return {
        encoded: "b:" + Buffer.from(stringValue, "utf8").toString("base64"),
        encoding: "base64",
        analysis
      };
    default:
      return {
        encoded: "b:" + Buffer.from(stringValue, "utf8").toString("base64"),
        encoding: "base64",
        analysis
      };
  }
}
function metadataDecode(value) {
  if (value === "null") {
    return null;
  }
  if (value === "undefined") {
    return void 0;
  }
  if (value === null || value === void 0 || typeof value !== "string") {
    return value;
  }
  if (value.startsWith("u:")) {
    if (value.length === 2) return value;
    try {
      return decodeURIComponent(value.substring(2));
    } catch (err) {
      return value;
    }
  }
  if (value.startsWith("b:")) {
    if (value.length === 2) return value;
    try {
      const decoded = Buffer.from(value.substring(2), "base64").toString("utf8");
      return decoded;
    } catch (err) {
      return value;
    }
  }
  if (value.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(value)) {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8");
      if (/[^\x00-\x7F]/.test(decoded) && Buffer.from(decoded, "utf8").toString("base64") === value) {
        return decoded;
      }
    } catch {
    }
  }
  return value;
}

const S3_METADATA_LIMIT = 2047;
class PluginStorage {
  /**
   * @param {Object} client - S3db Client instance
   * @param {string} pluginSlug - Plugin identifier (kebab-case)
   */
  constructor(client, pluginSlug) {
    if (!client) {
      throw new PluginStorageError("PluginStorage requires a client instance", {
        operation: "constructor",
        pluginSlug,
        suggestion: "Pass a valid S3db Client instance when creating PluginStorage"
      });
    }
    if (!pluginSlug) {
      throw new PluginStorageError("PluginStorage requires a pluginSlug", {
        operation: "constructor",
        suggestion: 'Provide a plugin slug (e.g., "eventual-consistency", "cache", "audit")'
      });
    }
    this.client = client;
    this.pluginSlug = pluginSlug;
  }
  /**
   * Generate hierarchical plugin-scoped key
   *
   * @param {string} resourceName - Resource name (optional, for resource-scoped data)
   * @param {...string} parts - Additional path parts
   * @returns {string} S3 key
   *
   * @example
   * // Resource-scoped: resource=wallets/plugin=eventual-consistency/balance/transactions/id=txn1
   * getPluginKey('wallets', 'balance', 'transactions', 'id=txn1')
   *
   * // Global plugin data: plugin=eventual-consistency/config
   * getPluginKey(null, 'config')
   */
  getPluginKey(resourceName, ...parts) {
    if (resourceName) {
      return `resource=${resourceName}/plugin=${this.pluginSlug}/${parts.join("/")}`;
    }
    return `plugin=${this.pluginSlug}/${parts.join("/")}`;
  }
  /**
   * Save data with metadata encoding, behavior support, and optional TTL
   *
   * @param {string} key - S3 key
   * @param {Object} data - Data to save
   * @param {Object} options - Options
   * @param {number} options.ttl - Time-to-live in seconds (optional)
   * @param {string} options.behavior - 'body-overflow' | 'body-only' | 'enforce-limits'
   * @param {string} options.contentType - Content type (default: application/json)
   * @returns {Promise<void>}
   */
  async set(key, data, options = {}) {
    const { ttl, behavior = "body-overflow", contentType = "application/json" } = options;
    const dataToSave = { ...data };
    if (ttl && typeof ttl === "number" && ttl > 0) {
      dataToSave._expiresAt = Date.now() + ttl * 1e3;
    }
    const { metadata, body } = this._applyBehavior(dataToSave, behavior);
    const putParams = {
      key,
      metadata,
      contentType
    };
    if (body !== null) {
      putParams.body = JSON.stringify(body);
    }
    const [ok, err] = await tryFn(() => this.client.putObject(putParams));
    if (!ok) {
      throw new PluginStorageError(`Failed to save plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: "set",
        behavior,
        ttl,
        original: err,
        suggestion: "Check S3 permissions and key format"
      });
    }
  }
  /**
   * Alias for set() to maintain backward compatibility
   * @deprecated Use set() instead
   */
  async put(key, data, options = {}) {
    return this.set(key, data, options);
  }
  /**
   * Get data with automatic metadata decoding and TTL check
   *
   * @param {string} key - S3 key
   * @returns {Promise<Object|null>} Data or null if not found/expired
   */
  async get(key) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));
    if (!ok) {
      if (err.name === "NoSuchKey" || err.Code === "NoSuchKey") {
        return null;
      }
      throw new PluginStorageError(`Failed to retrieve plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: "get",
        original: err,
        suggestion: "Check if the key exists and S3 permissions are correct"
      });
    }
    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);
    let data = parsedMetadata;
    if (response.Body) {
      try {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          data = { ...parsedMetadata, ...body };
        }
      } catch (parseErr) {
        throw new PluginStorageError(`Failed to parse JSON body`, {
          pluginSlug: this.pluginSlug,
          key,
          operation: "get",
          original: parseErr,
          suggestion: "Body content may be corrupted. Check S3 object integrity"
        });
      }
    }
    const expiresAt = data._expiresat || data._expiresAt;
    if (expiresAt) {
      if (Date.now() > expiresAt) {
        await this.delete(key);
        return null;
      }
      delete data._expiresat;
      delete data._expiresAt;
    }
    return data;
  }
  /**
   * Parse metadata values back to their original types
   * @private
   */
  _parseMetadataValues(metadata) {
    const parsed = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === "string") {
        if (value.startsWith("{") && value.endsWith("}") || value.startsWith("[") && value.endsWith("]")) {
          try {
            parsed[key] = JSON.parse(value);
            continue;
          } catch {
          }
        }
        if (!isNaN(value) && value.trim() !== "") {
          parsed[key] = Number(value);
          continue;
        }
        if (value === "true") {
          parsed[key] = true;
          continue;
        }
        if (value === "false") {
          parsed[key] = false;
          continue;
        }
      }
      parsed[key] = value;
    }
    return parsed;
  }
  /**
   * List all keys with plugin prefix
   *
   * @param {string} prefix - Additional prefix (optional)
   * @param {Object} options - List options
   * @param {number} options.limit - Max number of results
   * @returns {Promise<Array<string>>} List of keys
   */
  async list(prefix = "", options = {}) {
    const { limit } = options;
    const fullPrefix = prefix ? `plugin=${this.pluginSlug}/${prefix}` : `plugin=${this.pluginSlug}/`;
    const [ok, err, result] = await tryFn(
      () => this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );
    if (!ok) {
      throw new PluginStorageError(`Failed to list plugin data`, {
        pluginSlug: this.pluginSlug,
        operation: "list",
        prefix,
        fullPrefix,
        limit,
        original: err,
        suggestion: "Check S3 permissions and bucket configuration"
      });
    }
    const keys = result.Contents?.map((item) => item.Key) || [];
    return this._removeKeyPrefix(keys);
  }
  /**
   * List keys for a specific resource
   *
   * @param {string} resourceName - Resource name
   * @param {string} subPrefix - Additional prefix within resource (optional)
   * @param {Object} options - List options
   * @returns {Promise<Array<string>>} List of keys
   */
  async listForResource(resourceName, subPrefix = "", options = {}) {
    const { limit } = options;
    const fullPrefix = subPrefix ? `resource=${resourceName}/plugin=${this.pluginSlug}/${subPrefix}` : `resource=${resourceName}/plugin=${this.pluginSlug}/`;
    const [ok, err, result] = await tryFn(
      () => this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );
    if (!ok) {
      throw new PluginStorageError(`Failed to list resource data`, {
        pluginSlug: this.pluginSlug,
        operation: "listForResource",
        resourceName,
        subPrefix,
        fullPrefix,
        limit,
        original: err,
        suggestion: "Check resource name and S3 permissions"
      });
    }
    const keys = result.Contents?.map((item) => item.Key) || [];
    return this._removeKeyPrefix(keys);
  }
  /**
   * Remove client keyPrefix from keys
   * @private
   */
  _removeKeyPrefix(keys) {
    const keyPrefix = this.client.config.keyPrefix;
    if (!keyPrefix) return keys;
    return keys.map((key) => key.replace(keyPrefix, "")).map((key) => key.startsWith("/") ? key.replace("/", "") : key);
  }
  /**
   * Check if a key exists (not expired)
   *
   * @param {string} key - S3 key
   * @returns {Promise<boolean>} True if exists and not expired
   */
  async has(key) {
    const data = await this.get(key);
    return data !== null;
  }
  /**
   * Check if a key is expired
   *
   * @param {string} key - S3 key
   * @returns {Promise<boolean>} True if expired or not found
   */
  async isExpired(key) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));
    if (!ok) {
      return true;
    }
    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);
    let data = parsedMetadata;
    if (response.Body) {
      try {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          data = { ...parsedMetadata, ...body };
        }
      } catch {
        return true;
      }
    }
    const expiresAt = data._expiresat || data._expiresAt;
    if (!expiresAt) {
      return false;
    }
    return Date.now() > expiresAt;
  }
  /**
   * Get remaining TTL in seconds
   *
   * @param {string} key - S3 key
   * @returns {Promise<number|null>} Remaining seconds or null if no TTL/not found
   */
  async getTTL(key) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));
    if (!ok) {
      return null;
    }
    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);
    let data = parsedMetadata;
    if (response.Body) {
      try {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          data = { ...parsedMetadata, ...body };
        }
      } catch {
        return null;
      }
    }
    const expiresAt = data._expiresat || data._expiresAt;
    if (!expiresAt) {
      return null;
    }
    const remaining = Math.max(0, expiresAt - Date.now());
    return Math.floor(remaining / 1e3);
  }
  /**
   * Extend TTL by adding additional seconds
   *
   * @param {string} key - S3 key
   * @param {number} additionalSeconds - Seconds to add to current TTL
   * @returns {Promise<boolean>} True if extended, false if not found or no TTL
   */
  async touch(key, additionalSeconds) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));
    if (!ok) {
      return false;
    }
    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);
    let data = parsedMetadata;
    if (response.Body) {
      try {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          data = { ...parsedMetadata, ...body };
        }
      } catch {
        return false;
      }
    }
    const expiresAt = data._expiresat || data._expiresAt;
    if (!expiresAt) {
      return false;
    }
    data._expiresAt = expiresAt + additionalSeconds * 1e3;
    delete data._expiresat;
    const { metadata: newMetadata, body: newBody } = this._applyBehavior(data, "body-overflow");
    const putParams = {
      key,
      metadata: newMetadata,
      contentType: "application/json"
    };
    if (newBody !== null) {
      putParams.body = JSON.stringify(newBody);
    }
    const [putOk] = await tryFn(() => this.client.putObject(putParams));
    return putOk;
  }
  /**
   * Delete a single object
   *
   * @param {string} key - S3 key
   * @returns {Promise<void>}
   */
  async delete(key) {
    const [ok, err] = await tryFn(() => this.client.deleteObject(key));
    if (!ok) {
      throw new PluginStorageError(`Failed to delete plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: "delete",
        original: err,
        suggestion: "Check S3 delete permissions"
      });
    }
  }
  /**
   * Delete all plugin data (for uninstall)
   *
   * @param {string} resourceName - Resource name (optional, if null deletes all plugin data)
   * @returns {Promise<number>} Number of objects deleted
   */
  async deleteAll(resourceName = null) {
    let deleted = 0;
    if (resourceName) {
      const keys = await this.listForResource(resourceName);
      for (const key of keys) {
        await this.delete(key);
        deleted++;
      }
    } else {
      const allKeys = await this.client.getAllKeys({});
      const pluginKeys = allKeys.filter(
        (key) => key.includes(`plugin=${this.pluginSlug}/`)
      );
      for (const key of pluginKeys) {
        await this.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
  /**
   * Batch put operations
   *
   * @param {Array<{key: string, data: Object, options?: Object}>} items - Items to save
   * @returns {Promise<Array<{key: string, ok: boolean, error?: Error}>>} Results
   */
  async batchPut(items) {
    const results = [];
    for (const item of items) {
      const [ok, err] = await tryFn(
        () => this.put(item.key, item.data, item.options)
      );
      results.push({
        key: item.key,
        ok,
        error: err
      });
    }
    return results;
  }
  /**
   * Batch get operations
   *
   * @param {Array<string>} keys - Keys to fetch
   * @returns {Promise<Array<{key: string, ok: boolean, data?: Object, error?: Error}>>} Results
   */
  async batchGet(keys) {
    const results = [];
    for (const key of keys) {
      const [ok, err, data] = await tryFn(() => this.get(key));
      results.push({
        key,
        ok,
        data,
        error: err
      });
    }
    return results;
  }
  /**
   * Acquire a distributed lock with TTL and retry logic
   *
   * @param {string} lockName - Lock identifier
   * @param {Object} options - Lock options
   * @param {number} options.ttl - Lock TTL in seconds (default: 30)
   * @param {number} options.timeout - Max wait time in ms (default: 0, no wait)
   * @param {string} options.workerId - Worker identifier (default: 'unknown')
   * @returns {Promise<Object|null>} Lock object or null if couldn't acquire
   */
  async acquireLock(lockName, options = {}) {
    const { ttl = 30, timeout = 0, workerId = "unknown" } = options;
    const key = this.getPluginKey(null, "locks", lockName);
    const startTime = Date.now();
    while (true) {
      const existing = await this.get(key);
      if (!existing) {
        await this.set(key, { workerId, acquiredAt: Date.now() }, { ttl });
        return { key, workerId };
      }
      if (Date.now() - startTime >= timeout) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  /**
   * Release a distributed lock
   *
   * @param {string} lockName - Lock identifier
   * @returns {Promise<void>}
   */
  async releaseLock(lockName) {
    const key = this.getPluginKey(null, "locks", lockName);
    await this.delete(key);
  }
  /**
   * Check if a lock is currently held
   *
   * @param {string} lockName - Lock identifier
   * @returns {Promise<boolean>} True if locked
   */
  async isLocked(lockName) {
    const key = this.getPluginKey(null, "locks", lockName);
    const lock = await this.get(key);
    return lock !== null;
  }
  /**
   * Increment a counter value
   *
   * @param {string} key - S3 key
   * @param {number} amount - Amount to increment (default: 1)
   * @param {Object} options - Options (e.g., ttl)
   * @returns {Promise<number>} New value
   */
  async increment(key, amount = 1, options = {}) {
    const data = await this.get(key);
    const value = (data?.value || 0) + amount;
    await this.set(key, { value }, options);
    return value;
  }
  /**
   * Decrement a counter value
   *
   * @param {string} key - S3 key
   * @param {number} amount - Amount to decrement (default: 1)
   * @param {Object} options - Options (e.g., ttl)
   * @returns {Promise<number>} New value
   */
  async decrement(key, amount = 1, options = {}) {
    return this.increment(key, -amount, options);
  }
  /**
   * Apply behavior to split data between metadata and body
   *
   * @private
   * @param {Object} data - Data to split
   * @param {string} behavior - Behavior strategy
   * @returns {{metadata: Object, body: Object|null}}
   */
  _applyBehavior(data, behavior) {
    const effectiveLimit = calculateEffectiveLimit({ s3Limit: S3_METADATA_LIMIT });
    let metadata = {};
    let body = null;
    switch (behavior) {
      case "body-overflow": {
        const entries = Object.entries(data);
        const sorted = entries.map(([key, value]) => {
          const jsonValue = typeof value === "object" ? JSON.stringify(value) : value;
          const { encoded } = metadataEncode(jsonValue);
          const keySize = calculateUTF8Bytes(key);
          const valueSize = calculateUTF8Bytes(encoded);
          return { key, value, jsonValue, encoded, size: keySize + valueSize };
        }).sort((a, b) => a.size - b.size);
        let currentSize = 0;
        for (const item of sorted) {
          if (currentSize + item.size <= effectiveLimit) {
            metadata[item.key] = item.jsonValue;
            currentSize += item.size;
          } else {
            if (body === null) body = {};
            body[item.key] = item.value;
          }
        }
        break;
      }
      case "body-only": {
        body = data;
        break;
      }
      case "enforce-limits": {
        let currentSize = 0;
        for (const [key, value] of Object.entries(data)) {
          const jsonValue = typeof value === "object" ? JSON.stringify(value) : value;
          const { encoded } = metadataEncode(jsonValue);
          const keySize = calculateUTF8Bytes(key);
          const valueSize = calculateUTF8Bytes(encoded);
          currentSize += keySize + valueSize;
          if (currentSize > effectiveLimit) {
            throw new MetadataLimitError(`Data exceeds metadata limit with enforce-limits behavior`, {
              totalSize: currentSize,
              effectiveLimit,
              absoluteLimit: S3_METADATA_LIMIT,
              excess: currentSize - effectiveLimit,
              operation: "PluginStorage.set",
              pluginSlug: this.pluginSlug,
              suggestion: "Use 'body-overflow' or 'body-only' behavior to handle large data"
            });
          }
          metadata[key] = jsonValue;
        }
        break;
      }
      default:
        throw new BehaviorError(`Unknown behavior: ${behavior}`, {
          behavior,
          availableBehaviors: ["body-overflow", "body-only", "enforce-limits"],
          operation: "PluginStorage._applyBehavior",
          pluginSlug: this.pluginSlug,
          suggestion: "Use 'body-overflow', 'body-only', or 'enforce-limits'"
        });
    }
    return { metadata, body };
  }
}

class Plugin extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = this.constructor.name;
    this.options = options;
    this.hooks = /* @__PURE__ */ new Map();
    this.slug = options.slug || this._generateSlug();
    this._storage = null;
  }
  /**
   * Generate kebab-case slug from class name
   * @private
   * @returns {string}
   */
  _generateSlug() {
    return this.name.replace(/Plugin$/, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }
  /**
   * Get PluginStorage instance (lazy-loaded)
   * @returns {PluginStorage}
   */
  getStorage() {
    if (!this._storage) {
      if (!this.database || !this.database.client) {
        throw new Error("Plugin must be installed before accessing storage");
      }
      this._storage = new PluginStorage(this.database.client, this.slug);
    }
    return this._storage;
  }
  /**
   * Install plugin
   * @param {Database} database - Database instance
   */
  async install(database) {
    this.database = database;
    this.beforeInstall();
    await this.onInstall();
    this.afterInstall();
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
  /**
   * Uninstall plugin and cleanup all data
   * @param {Object} options - Uninstall options
   * @param {boolean} options.purgeData - Delete all plugin data from S3 (default: false)
   */
  async uninstall(options = {}) {
    const { purgeData = false } = options;
    this.beforeUninstall();
    await this.onUninstall(options);
    if (purgeData && this._storage) {
      const deleted = await this._storage.deleteAll();
      this.emit("plugin.dataPurged", { deleted });
    }
    this.afterUninstall();
  }
  // Override these methods in subclasses
  async onInstall() {
  }
  async onStart() {
  }
  async onStop() {
  }
  async onUninstall(options) {
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
  beforeInstall() {
    this.emit("plugin.beforeInstall", /* @__PURE__ */ new Date());
  }
  afterInstall() {
    this.emit("plugin.afterInstall", /* @__PURE__ */ new Date());
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
  beforeUninstall() {
    this.emit("plugin.beforeUninstall", /* @__PURE__ */ new Date());
  }
  afterUninstall() {
    this.emit("plugin.afterUninstall", /* @__PURE__ */ new Date());
  }
}

const PluginObject = {
  setup(database) {
  },
  start() {
  },
  stop() {
  }
};

class AuditPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.auditResource = null;
    this.config = {
      includeData: options.includeData !== false,
      includePartitions: options.includePartitions !== false,
      maxDataSize: options.maxDataSize || 1e4,
      ...options
    };
  }
  async onInstall() {
    const [ok, err, auditResource] = await tryFn(() => this.database.createResource({
      name: "plg_audits",
      attributes: {
        id: "string|required",
        resourceName: "string|required",
        operation: "string|required",
        recordId: "string|required",
        userId: "string|optional",
        timestamp: "string|required",
        createdAt: "string|required",
        // YYYY-MM-DD for partitioning
        oldData: "string|optional",
        newData: "string|optional",
        partition: "string|optional",
        partitionValues: "string|optional",
        metadata: "string|optional"
      },
      partitions: {
        byDate: { fields: { createdAt: "string|maxlength:10" } },
        byResource: { fields: { resourceName: "string" } }
      },
      behavior: "body-overflow"
    }));
    this.auditResource = ok ? auditResource : this.database.resources.plg_audits || null;
    if (!ok && !this.auditResource) return;
    this.database.addHook("afterCreateResource", (context) => {
      if (context.resource.name !== "plg_audits") {
        this.setupResourceAuditing(context.resource);
      }
    });
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== "plg_audits") {
        this.setupResourceAuditing(resource);
      }
    }
  }
  async onStart() {
  }
  async onStop() {
  }
  setupResourceAuditing(resource) {
    resource.on("insert", async (data) => {
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: "insert",
        recordId: data.id || "auto-generated",
        oldData: null,
        newData: this.config.includeData ? JSON.stringify(this.truncateData(data)) : null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });
    resource.on("update", async (data) => {
      let oldData = data.$before;
      if (this.config.includeData && !oldData) {
        const [ok, err, fetched] = await tryFn(() => resource.get(data.id));
        if (ok) oldData = fetched;
      }
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(data, resource) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: "update",
        recordId: data.id,
        oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: this.config.includeData ? JSON.stringify(this.truncateData(data)) : null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });
    resource.on("delete", async (data) => {
      let oldData = data;
      if (this.config.includeData && !oldData) {
        const [ok, err, fetched] = await tryFn(() => resource.get(data.id));
        if (ok) oldData = fetched;
      }
      const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: "delete",
        recordId: data.id,
        oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });
    const originalDeleteMany = resource.deleteMany.bind(resource);
    const plugin = this;
    resource.deleteMany = async function(ids) {
      const objectsToDelete = [];
      for (const id of ids) {
        const [ok, err, fetched] = await tryFn(() => resource.get(id));
        if (ok) {
          objectsToDelete.push(fetched);
        } else {
          objectsToDelete.push({ id });
        }
      }
      const result = await originalDeleteMany(ids);
      for (const oldData of objectsToDelete) {
        const partitionValues = oldData && plugin.config.includePartitions ? plugin.getPartitionValues(oldData, resource) : null;
        await plugin.logAudit({
          resourceName: resource.name,
          operation: "deleteMany",
          recordId: oldData.id,
          oldData: oldData && plugin.config.includeData ? JSON.stringify(plugin.truncateData(oldData)) : null,
          newData: null,
          partition: partitionValues ? plugin.getPrimaryPartition(partitionValues) : null,
          partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
        });
      }
      return result;
    };
    resource._originalDeleteMany = originalDeleteMany;
  }
  // Backward compatibility for tests
  installEventListenersForResource(resource) {
    return this.setupResourceAuditing(resource);
  }
  async logAudit(auditData) {
    if (!this.auditResource) {
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const auditRecord = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      userId: this.getCurrentUserId?.() || "system",
      timestamp: now.toISOString(),
      createdAt: now.toISOString().slice(0, 10),
      // YYYY-MM-DD for partitioning
      metadata: JSON.stringify({ source: "audit-plugin", version: "2.0" }),
      resourceName: auditData.resourceName,
      operation: auditData.operation,
      recordId: auditData.recordId
    };
    if (auditData.oldData !== null) {
      auditRecord.oldData = auditData.oldData;
    }
    if (auditData.newData !== null) {
      auditRecord.newData = auditData.newData;
    }
    if (auditData.partition !== null) {
      auditRecord.partition = auditData.partition;
    }
    if (auditData.partitionValues !== null) {
      auditRecord.partitionValues = auditData.partitionValues;
    }
    try {
      await this.auditResource.insert(auditRecord);
    } catch (error) {
      console.warn("Audit logging failed:", error.message);
    }
  }
  getPartitionValues(data, resource) {
    if (!this.config.includePartitions) return null;
    const partitions = resource.config?.partitions || resource.partitions;
    if (!partitions) {
      return null;
    }
    const partitionValues = {};
    for (const [partitionName, partitionConfig] of Object.entries(partitions)) {
      const values = {};
      for (const field of Object.keys(partitionConfig.fields)) {
        values[field] = this.getNestedFieldValue(data, field);
      }
      if (Object.values(values).some((v) => v !== void 0 && v !== null)) {
        partitionValues[partitionName] = values;
      }
    }
    return Object.keys(partitionValues).length > 0 ? partitionValues : null;
  }
  getNestedFieldValue(data, fieldPath) {
    const parts = fieldPath.split(".");
    let value = data;
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = value[part];
      } else {
        return void 0;
      }
    }
    return value;
  }
  getPrimaryPartition(partitionValues) {
    if (!partitionValues) return null;
    const partitionNames = Object.keys(partitionValues);
    return partitionNames.length > 0 ? partitionNames[0] : null;
  }
  truncateData(data) {
    if (!this.config.includeData) return null;
    const dataStr = JSON.stringify(data);
    if (dataStr.length <= this.config.maxDataSize) {
      return data;
    }
    return {
      ...data,
      _truncated: true,
      _originalSize: dataStr.length,
      _truncatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async getAuditLogs(options = {}) {
    if (!this.auditResource) return [];
    const { resourceName, operation, recordId, partition, startDate, endDate, limit = 100, offset = 0 } = options;
    let items = [];
    if (resourceName && !operation && !recordId && !partition && !startDate && !endDate) {
      const [ok, err, result] = await tryFn(
        () => this.auditResource.query({ resourceName }, { limit: limit + offset })
      );
      items = ok && result ? result : [];
      return items.slice(offset, offset + limit);
    } else if (startDate && !resourceName && !operation && !recordId && !partition) {
      const dates = this._generateDateRange(startDate, endDate);
      for (const date of dates) {
        const [ok, err, result] = await tryFn(
          () => this.auditResource.query({ createdAt: date })
        );
        if (ok && result) {
          items.push(...result);
        }
      }
      return items.slice(offset, offset + limit);
    } else if (resourceName || operation || recordId || partition || startDate || endDate) {
      const fetchSize = Math.min(1e4, Math.max(1e3, (limit + offset) * 20));
      const result = await this.auditResource.list({ limit: fetchSize });
      items = result || [];
      if (resourceName) {
        items = items.filter((log) => log.resourceName === resourceName);
      }
      if (operation) {
        items = items.filter((log) => log.operation === operation);
      }
      if (recordId) {
        items = items.filter((log) => log.recordId === recordId);
      }
      if (partition) {
        items = items.filter((log) => log.partition === partition);
      }
      if (startDate || endDate) {
        items = items.filter((log) => {
          const timestamp = new Date(log.timestamp);
          if (startDate && timestamp < new Date(startDate)) return false;
          if (endDate && timestamp > new Date(endDate)) return false;
          return true;
        });
      }
      return items.slice(offset, offset + limit);
    } else {
      const result = await this.auditResource.page({ size: limit, offset });
      return result.items || [];
    }
  }
  _generateDateRange(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : /* @__PURE__ */ new Date();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  }
  async getRecordHistory(resourceName, recordId) {
    return await this.getAuditLogs({ resourceName, recordId });
  }
  async getPartitionHistory(resourceName, partitionName, partitionValues) {
    return await this.getAuditLogs({
      resourceName,
      partition: partitionName,
      partitionValues: JSON.stringify(partitionValues)
    });
  }
  async getAuditStats(options = {}) {
    const logs = await this.getAuditLogs(options);
    const stats = {
      total: logs.length,
      byOperation: {},
      byResource: {},
      byPartition: {},
      byUser: {},
      timeline: {}
    };
    for (const log of logs) {
      stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
      stats.byResource[log.resourceName] = (stats.byResource[log.resourceName] || 0) + 1;
      if (log.partition) {
        stats.byPartition[log.partition] = (stats.byPartition[log.partition] || 0) + 1;
      }
      stats.byUser[log.userId] = (stats.byUser[log.userId] || 0) + 1;
      const date = log.timestamp.split("T")[0];
      stats.timeline[date] = (stats.timeline[date] || 0) + 1;
    }
    return stats;
  }
  /**
   * Clean up audit logs older than retention period
   * @param {number} retentionDays - Number of days to retain (default: 90)
   * @returns {Promise<number>} Number of records deleted
   */
  async cleanupOldAudits(retentionDays = 90) {
    if (!this.auditResource) return 0;
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const datesToDelete = [];
    const startDate = new Date(cutoffDate);
    startDate.setDate(startDate.getDate() - 365);
    for (let d = new Date(startDate); d < cutoffDate; d.setDate(d.getDate() + 1)) {
      datesToDelete.push(d.toISOString().slice(0, 10));
    }
    let deletedCount = 0;
    for (const dateStr of datesToDelete) {
      const [ok, err, oldAudits] = await tryFn(
        () => this.auditResource.query({ createdAt: dateStr })
      );
      if (ok && oldAudits) {
        for (const audit of oldAudits) {
          const [delOk] = await tryFn(() => this.auditResource.delete(audit.id));
          if (delOk) {
            deletedCount++;
          }
        }
      }
    }
    return deletedCount;
  }
}

class BackupError extends S3dbError {
  constructor(message, details = {}) {
    const { driver = "unknown", operation = "unknown", backupId, ...rest } = details;
    let description = details.description;
    if (!description) {
      description = `
Backup Operation Error

Driver: ${driver}
Operation: ${operation}
${backupId ? `Backup ID: ${backupId}` : ""}

Common causes:
1. Invalid backup driver configuration
2. Destination storage not accessible
3. Insufficient permissions
4. Network connectivity issues
5. Invalid backup file format

Solution:
Check driver configuration and ensure destination storage is accessible.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/backup.md
`.trim();
    }
    super(message, { ...rest, driver, operation, backupId, description });
  }
}

class BaseBackupDriver {
  constructor(config = {}) {
    this.config = {
      compression: "gzip",
      encryption: null,
      verbose: false,
      ...config
    };
  }
  /**
   * Initialize the driver
   * @param {Database} database - S3DB database instance
   */
  async setup(database) {
    this.database = database;
    await this.onSetup();
  }
  /**
   * Override this method to perform driver-specific setup
   */
  async onSetup() {
  }
  /**
   * Upload a backup file to the destination
   * @param {string} filePath - Path to the backup file
   * @param {string} backupId - Unique backup identifier
   * @param {Object} manifest - Backup manifest with metadata
   * @returns {Object} Upload result with destination info
   */
  async upload(filePath, backupId, manifest) {
    throw new BackupError("upload() method must be implemented by subclass", {
      operation: "upload",
      driver: this.constructor.name,
      backupId,
      suggestion: "Extend BaseBackupDriver and implement the upload() method"
    });
  }
  /**
   * Download a backup file from the destination
   * @param {string} backupId - Unique backup identifier
   * @param {string} targetPath - Local path to save the backup
   * @param {Object} metadata - Backup metadata
   * @returns {string} Path to downloaded file
   */
  async download(backupId, targetPath, metadata) {
    throw new BackupError("download() method must be implemented by subclass", {
      operation: "download",
      driver: this.constructor.name,
      backupId,
      suggestion: "Extend BaseBackupDriver and implement the download() method"
    });
  }
  /**
   * Delete a backup from the destination
   * @param {string} backupId - Unique backup identifier
   * @param {Object} metadata - Backup metadata
   */
  async delete(backupId, metadata) {
    throw new BackupError("delete() method must be implemented by subclass", {
      operation: "delete",
      driver: this.constructor.name,
      backupId,
      suggestion: "Extend BaseBackupDriver and implement the delete() method"
    });
  }
  /**
   * List backups available in the destination
   * @param {Object} options - List options (limit, prefix, etc.)
   * @returns {Array} List of backup metadata
   */
  async list(options = {}) {
    throw new BackupError("list() method must be implemented by subclass", {
      operation: "list",
      driver: this.constructor.name,
      suggestion: "Extend BaseBackupDriver and implement the list() method"
    });
  }
  /**
   * Verify backup integrity
   * @param {string} backupId - Unique backup identifier
   * @param {string} expectedChecksum - Expected file checksum
   * @param {Object} metadata - Backup metadata
   * @returns {boolean} True if backup is valid
   */
  async verify(backupId, expectedChecksum, metadata) {
    throw new BackupError("verify() method must be implemented by subclass", {
      operation: "verify",
      driver: this.constructor.name,
      backupId,
      suggestion: "Extend BaseBackupDriver and implement the verify() method"
    });
  }
  /**
   * Get driver type identifier
   * @returns {string} Driver type
   */
  getType() {
    throw new BackupError("getType() method must be implemented by subclass", {
      operation: "getType",
      driver: this.constructor.name,
      suggestion: "Extend BaseBackupDriver and implement the getType() method"
    });
  }
  /**
   * Get driver-specific storage info
   * @returns {Object} Storage information
   */
  getStorageInfo() {
    return {
      type: this.getType(),
      config: this.config
    };
  }
  /**
   * Clean up resources
   */
  async cleanup() {
  }
  /**
   * Log message if verbose mode is enabled
   * @param {string} message - Message to log
   */
  log(message) {
    if (this.config.verbose) {
      console.log(`[${this.getType()}BackupDriver] ${message}`);
    }
  }
}

class FilesystemBackupDriver extends BaseBackupDriver {
  constructor(config = {}) {
    super({
      path: "./backups/{date}/",
      permissions: 420,
      directoryPermissions: 493,
      ...config
    });
  }
  getType() {
    return "filesystem";
  }
  async onSetup() {
    if (!this.config.path) {
      throw new BackupError("FilesystemBackupDriver: path configuration is required", {
        operation: "onSetup",
        driver: "filesystem",
        suggestion: 'Provide a path in config: new FilesystemBackupDriver({ path: "/path/to/backups" })'
      });
    }
    this.log(`Initialized with path: ${this.config.path}`);
  }
  /**
   * Resolve path template variables
   * @param {string} backupId - Backup identifier
   * @param {Object} manifest - Backup manifest
   * @returns {string} Resolved path
   */
  resolvePath(backupId, manifest = {}) {
    const now = /* @__PURE__ */ new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "-");
    return this.config.path.replace("{date}", dateStr).replace("{time}", timeStr).replace("{year}", now.getFullYear().toString()).replace("{month}", (now.getMonth() + 1).toString().padStart(2, "0")).replace("{day}", now.getDate().toString().padStart(2, "0")).replace("{backupId}", backupId).replace("{type}", manifest.type || "backup");
  }
  async upload(filePath, backupId, manifest) {
    const targetDir = this.resolvePath(backupId, manifest);
    const targetPath = path.join(targetDir, `${backupId}.backup`);
    const manifestPath = path.join(targetDir, `${backupId}.manifest.json`);
    const [createDirOk, createDirErr] = await tryFn(
      () => promises.mkdir(targetDir, { recursive: true, mode: this.config.directoryPermissions })
    );
    if (!createDirOk) {
      throw new BackupError("Failed to create backup directory", {
        operation: "upload",
        driver: "filesystem",
        backupId,
        targetDir,
        original: createDirErr,
        suggestion: "Check directory permissions and disk space"
      });
    }
    const [copyOk, copyErr] = await tryFn(() => promises.copyFile(filePath, targetPath));
    if (!copyOk) {
      throw new BackupError("Failed to copy backup file", {
        operation: "upload",
        driver: "filesystem",
        backupId,
        filePath,
        targetPath,
        original: copyErr,
        suggestion: "Check file permissions and disk space"
      });
    }
    const [manifestOk, manifestErr] = await tryFn(
      () => import('fs/promises').then((fs) => fs.writeFile(
        manifestPath,
        JSON.stringify(manifest, null, 2),
        { mode: this.config.permissions }
      ))
    );
    if (!manifestOk) {
      await tryFn(() => promises.unlink(targetPath));
      throw new BackupError("Failed to write manifest file", {
        operation: "upload",
        driver: "filesystem",
        backupId,
        manifestPath,
        original: manifestErr,
        suggestion: "Check directory permissions and disk space"
      });
    }
    const [statOk, , stats] = await tryFn(() => promises.stat(targetPath));
    const size = statOk ? stats.size : 0;
    this.log(`Uploaded backup ${backupId} to ${targetPath} (${size} bytes)`);
    return {
      path: targetPath,
      manifestPath,
      size,
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async download(backupId, targetPath, metadata) {
    const sourcePath = metadata.path || path.join(
      this.resolvePath(backupId, metadata),
      `${backupId}.backup`
    );
    const [existsOk] = await tryFn(() => promises.access(sourcePath));
    if (!existsOk) {
      throw new BackupError("Backup file not found", {
        operation: "download",
        driver: "filesystem",
        backupId,
        sourcePath,
        suggestion: "Check if backup exists using list() method"
      });
    }
    const targetDir = path.dirname(targetPath);
    await tryFn(() => promises.mkdir(targetDir, { recursive: true }));
    const [copyOk, copyErr] = await tryFn(() => promises.copyFile(sourcePath, targetPath));
    if (!copyOk) {
      throw new BackupError("Failed to download backup", {
        operation: "download",
        driver: "filesystem",
        backupId,
        sourcePath,
        targetPath,
        original: copyErr,
        suggestion: "Check file permissions and disk space"
      });
    }
    this.log(`Downloaded backup ${backupId} from ${sourcePath} to ${targetPath}`);
    return targetPath;
  }
  async delete(backupId, metadata) {
    const backupPath = metadata.path || path.join(
      this.resolvePath(backupId, metadata),
      `${backupId}.backup`
    );
    const manifestPath = metadata.manifestPath || path.join(
      this.resolvePath(backupId, metadata),
      `${backupId}.manifest.json`
    );
    const [deleteBackupOk] = await tryFn(() => promises.unlink(backupPath));
    const [deleteManifestOk] = await tryFn(() => promises.unlink(manifestPath));
    if (!deleteBackupOk && !deleteManifestOk) {
      throw new BackupError("Failed to delete backup files", {
        operation: "delete",
        driver: "filesystem",
        backupId,
        backupPath,
        manifestPath,
        suggestion: "Check file permissions"
      });
    }
    this.log(`Deleted backup ${backupId}`);
  }
  async list(options = {}) {
    const { limit = 50, prefix = "" } = options;
    const basePath = this.resolvePath("*").replace("*", "");
    try {
      const results = [];
      await this._scanDirectory(path.dirname(basePath), prefix, results, limit);
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return results.slice(0, limit);
    } catch (error) {
      this.log(`Error listing backups: ${error.message}`);
      return [];
    }
  }
  async _scanDirectory(dirPath, prefix, results, limit) {
    if (results.length >= limit) return;
    const [readDirOk, , files] = await tryFn(() => promises.readdir(dirPath));
    if (!readDirOk) return;
    for (const file of files) {
      if (results.length >= limit) break;
      const fullPath = path.join(dirPath, file);
      const [statOk, , stats] = await tryFn(() => promises.stat(fullPath));
      if (!statOk) continue;
      if (stats.isDirectory()) {
        await this._scanDirectory(fullPath, prefix, results, limit);
      } else if (file.endsWith(".manifest.json")) {
        const [readOk, , content] = await tryFn(
          () => import('fs/promises').then((fs) => fs.readFile(fullPath, "utf8"))
        );
        if (readOk) {
          try {
            const manifest = JSON.parse(content);
            const backupId = file.replace(".manifest.json", "");
            if (!prefix || backupId.includes(prefix)) {
              results.push({
                id: backupId,
                path: fullPath.replace(".manifest.json", ".backup"),
                manifestPath: fullPath,
                size: stats.size,
                createdAt: manifest.createdAt || stats.birthtime.toISOString(),
                ...manifest
              });
            }
          } catch (parseErr) {
            this.log(`Failed to parse manifest ${fullPath}: ${parseErr.message}`);
          }
        }
      }
    }
  }
  async verify(backupId, expectedChecksum, metadata) {
    const backupPath = metadata.path || path.join(
      this.resolvePath(backupId, metadata),
      `${backupId}.backup`
    );
    const [readOk, readErr] = await tryFn(async () => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(backupPath);
      await promises$1.pipeline(stream, hash);
      const actualChecksum = hash.digest("hex");
      return actualChecksum === expectedChecksum;
    });
    if (!readOk) {
      this.log(`Verification failed for ${backupId}: ${readErr.message}`);
      return false;
    }
    return readOk;
  }
  getStorageInfo() {
    return {
      ...super.getStorageInfo(),
      path: this.config.path,
      permissions: this.config.permissions,
      directoryPermissions: this.config.directoryPermissions
    };
  }
}

class S3BackupDriver extends BaseBackupDriver {
  constructor(config = {}) {
    super({
      bucket: null,
      // Will use database bucket if not specified
      path: "backups/{date}/",
      storageClass: "STANDARD_IA",
      serverSideEncryption: "AES256",
      client: null,
      // Will use database client if not specified
      ...config
    });
  }
  getType() {
    return "s3";
  }
  async onSetup() {
    if (!this.config.client) {
      this.config.client = this.database.client;
    }
    if (!this.config.bucket) {
      this.config.bucket = this.database.bucket;
    }
    if (!this.config.client) {
      throw new BackupError("S3BackupDriver: client is required", {
        operation: "onSetup",
        driver: "s3",
        suggestion: "Provide a client in config or ensure database has a client configured"
      });
    }
    if (!this.config.bucket) {
      throw new BackupError("S3BackupDriver: bucket is required", {
        operation: "onSetup",
        driver: "s3",
        suggestion: "Provide a bucket in config or ensure database has a bucket configured"
      });
    }
    this.log(`Initialized with bucket: ${this.config.bucket}, path: ${this.config.path}`);
  }
  /**
   * Resolve S3 key template variables
   * @param {string} backupId - Backup identifier
   * @param {Object} manifest - Backup manifest
   * @returns {string} Resolved S3 key
   */
  resolveKey(backupId, manifest = {}) {
    const now = /* @__PURE__ */ new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "-");
    const basePath = this.config.path.replace("{date}", dateStr).replace("{time}", timeStr).replace("{year}", now.getFullYear().toString()).replace("{month}", (now.getMonth() + 1).toString().padStart(2, "0")).replace("{day}", now.getDate().toString().padStart(2, "0")).replace("{backupId}", backupId).replace("{type}", manifest.type || "backup");
    return path.posix.join(basePath, `${backupId}.backup`);
  }
  resolveManifestKey(backupId, manifest = {}) {
    return this.resolveKey(backupId, manifest).replace(".backup", ".manifest.json");
  }
  async upload(filePath, backupId, manifest) {
    const backupKey = this.resolveKey(backupId, manifest);
    const manifestKey = this.resolveManifestKey(backupId, manifest);
    const [statOk, , stats] = await tryFn(() => promises.stat(filePath));
    const fileSize = statOk ? stats.size : 0;
    const [uploadOk, uploadErr] = await tryFn(async () => {
      const fileStream = fs.createReadStream(filePath);
      return await this.config.client.uploadObject({
        bucket: this.config.bucket,
        key: backupKey,
        body: fileStream,
        contentLength: fileSize,
        metadata: {
          "backup-id": backupId,
          "backup-type": manifest.type || "backup",
          "created-at": (/* @__PURE__ */ new Date()).toISOString()
        },
        storageClass: this.config.storageClass,
        serverSideEncryption: this.config.serverSideEncryption
      });
    });
    if (!uploadOk) {
      throw new BackupError("Failed to upload backup file to S3", {
        operation: "upload",
        driver: "s3",
        backupId,
        bucket: this.config.bucket,
        key: backupKey,
        original: uploadErr,
        suggestion: "Check S3 permissions and bucket configuration"
      });
    }
    const [manifestOk, manifestErr] = await tryFn(
      () => this.config.client.uploadObject({
        bucket: this.config.bucket,
        key: manifestKey,
        body: JSON.stringify(manifest, null, 2),
        contentType: "application/json",
        metadata: {
          "backup-id": backupId,
          "manifest-for": backupKey
        },
        storageClass: this.config.storageClass,
        serverSideEncryption: this.config.serverSideEncryption
      })
    );
    if (!manifestOk) {
      await tryFn(() => this.config.client.deleteObject({
        bucket: this.config.bucket,
        key: backupKey
      }));
      throw new BackupError("Failed to upload manifest to S3", {
        operation: "upload",
        driver: "s3",
        backupId,
        bucket: this.config.bucket,
        manifestKey,
        original: manifestErr,
        suggestion: "Check S3 permissions and bucket configuration"
      });
    }
    this.log(`Uploaded backup ${backupId} to s3://${this.config.bucket}/${backupKey} (${fileSize} bytes)`);
    return {
      bucket: this.config.bucket,
      key: backupKey,
      manifestKey,
      size: fileSize,
      storageClass: this.config.storageClass,
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString(),
      etag: uploadOk?.ETag
    };
  }
  async download(backupId, targetPath, metadata) {
    const backupKey = metadata.key || this.resolveKey(backupId, metadata);
    const [downloadOk, downloadErr] = await tryFn(
      () => this.config.client.downloadObject({
        bucket: this.config.bucket,
        key: backupKey,
        filePath: targetPath
      })
    );
    if (!downloadOk) {
      throw new BackupError("Failed to download backup from S3", {
        operation: "download",
        driver: "s3",
        backupId,
        bucket: this.config.bucket,
        key: backupKey,
        targetPath,
        original: downloadErr,
        suggestion: "Check if backup exists and S3 permissions are correct"
      });
    }
    this.log(`Downloaded backup ${backupId} from s3://${this.config.bucket}/${backupKey} to ${targetPath}`);
    return targetPath;
  }
  async delete(backupId, metadata) {
    const backupKey = metadata.key || this.resolveKey(backupId, metadata);
    const manifestKey = metadata.manifestKey || this.resolveManifestKey(backupId, metadata);
    const [deleteBackupOk] = await tryFn(
      () => this.config.client.deleteObject({
        bucket: this.config.bucket,
        key: backupKey
      })
    );
    const [deleteManifestOk] = await tryFn(
      () => this.config.client.deleteObject({
        bucket: this.config.bucket,
        key: manifestKey
      })
    );
    if (!deleteBackupOk && !deleteManifestOk) {
      throw new BackupError("Failed to delete backup from S3", {
        operation: "delete",
        driver: "s3",
        backupId,
        bucket: this.config.bucket,
        backupKey,
        manifestKey,
        suggestion: "Check S3 delete permissions"
      });
    }
    this.log(`Deleted backup ${backupId} from S3`);
  }
  async list(options = {}) {
    const { limit = 50, prefix = "" } = options;
    const searchPrefix = this.config.path.replace(/\{[^}]+\}/g, "");
    const [listOk, listErr, response] = await tryFn(
      () => this.config.client.listObjects({
        bucket: this.config.bucket,
        prefix: searchPrefix,
        maxKeys: limit * 2
        // Get more to account for manifest files
      })
    );
    if (!listOk) {
      this.log(`Error listing S3 objects: ${listErr.message}`);
      return [];
    }
    const manifestObjects = (response.Contents || []).filter((obj) => obj.Key.endsWith(".manifest.json")).filter((obj) => !prefix || obj.Key.includes(prefix));
    const results = [];
    for (const obj of manifestObjects.slice(0, limit)) {
      const [manifestOk, , manifestContent] = await tryFn(
        () => this.config.client.getObject({
          bucket: this.config.bucket,
          key: obj.Key
        })
      );
      if (manifestOk) {
        try {
          const manifest = JSON.parse(manifestContent);
          const backupId = path.basename(obj.Key, ".manifest.json");
          results.push({
            id: backupId,
            bucket: this.config.bucket,
            key: obj.Key.replace(".manifest.json", ".backup"),
            manifestKey: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            storageClass: obj.StorageClass,
            createdAt: manifest.createdAt || obj.LastModified,
            ...manifest
          });
        } catch (parseErr) {
          this.log(`Failed to parse manifest ${obj.Key}: ${parseErr.message}`);
        }
      }
    }
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results;
  }
  async verify(backupId, expectedChecksum, metadata) {
    const backupKey = metadata.key || this.resolveKey(backupId, metadata);
    const [verifyOk, verifyErr] = await tryFn(async () => {
      const headResponse = await this.config.client.headObject({
        bucket: this.config.bucket,
        key: backupKey
      });
      const etag = headResponse.ETag?.replace(/"/g, "");
      if (etag && !etag.includes("-")) {
        const expectedMd5 = crypto.createHash("md5").update(expectedChecksum).digest("hex");
        return etag === expectedMd5;
      } else {
        const [streamOk, , stream] = await tryFn(
          () => this.config.client.getObjectStream({
            bucket: this.config.bucket,
            key: backupKey
          })
        );
        if (!streamOk) return false;
        const hash = crypto.createHash("sha256");
        for await (const chunk of stream) {
          hash.update(chunk);
        }
        const actualChecksum = hash.digest("hex");
        return actualChecksum === expectedChecksum;
      }
    });
    if (!verifyOk) {
      this.log(`Verification failed for ${backupId}: ${verifyErr?.message || "checksum mismatch"}`);
      return false;
    }
    return true;
  }
  getStorageInfo() {
    return {
      ...super.getStorageInfo(),
      bucket: this.config.bucket,
      path: this.config.path,
      storageClass: this.config.storageClass,
      serverSideEncryption: this.config.serverSideEncryption
    };
  }
}

class MultiBackupDriver extends BaseBackupDriver {
  constructor(config = {}) {
    super({
      destinations: [],
      strategy: "all",
      // 'all', 'any', 'priority'
      concurrency: 3,
      requireAll: true,
      // For backward compatibility
      ...config
    });
    this.drivers = [];
  }
  getType() {
    return "multi";
  }
  async onSetup() {
    if (!Array.isArray(this.config.destinations) || this.config.destinations.length === 0) {
      throw new BackupError("MultiBackupDriver requires non-empty destinations array", {
        operation: "onSetup",
        driver: "multi",
        destinationsProvided: this.config.destinations,
        suggestion: 'Provide destinations array: { destinations: [{ driver: "s3", config: {...} }, { driver: "filesystem", config: {...} }] }'
      });
    }
    for (const [index, destConfig] of this.config.destinations.entries()) {
      if (!destConfig.driver) {
        throw new BackupError(`Destination ${index} missing driver type`, {
          operation: "onSetup",
          driver: "multi",
          destinationIndex: index,
          destination: destConfig,
          suggestion: 'Each destination must have a driver property: { driver: "s3", config: {...} } or { driver: "filesystem", config: {...} }'
        });
      }
      try {
        const driver = createBackupDriver(destConfig.driver, destConfig.config || {});
        await driver.setup(this.database);
        this.drivers.push({
          driver,
          config: destConfig,
          index
        });
        this.log(`Setup destination ${index}: ${destConfig.driver}`);
      } catch (error) {
        throw new BackupError(`Failed to setup destination ${index}`, {
          operation: "onSetup",
          driver: "multi",
          destinationIndex: index,
          destinationDriver: destConfig.driver,
          destinationConfig: destConfig.config,
          original: error,
          suggestion: "Check destination driver configuration and ensure dependencies are available"
        });
      }
    }
    if (this.config.requireAll === false) {
      this.config.strategy = "any";
    }
    this.log(`Initialized with ${this.drivers.length} destinations, strategy: ${this.config.strategy}`);
  }
  async upload(filePath, backupId, manifest) {
    const strategy = this.config.strategy;
    const errors = [];
    if (strategy === "priority") {
      for (const { driver, config, index } of this.drivers) {
        const [ok, err, result] = await tryFn(
          () => driver.upload(filePath, backupId, manifest)
        );
        if (ok) {
          this.log(`Priority upload successful to destination ${index}`);
          return [{
            ...result,
            driver: config.driver,
            destination: index,
            status: "success"
          }];
        } else {
          errors.push({ destination: index, error: err.message });
          this.log(`Priority upload failed to destination ${index}: ${err.message}`);
        }
      }
      throw new BackupError("All priority destinations failed", {
        operation: "upload",
        driver: "multi",
        strategy: "priority",
        backupId,
        totalDestinations: this.drivers.length,
        failures: errors,
        suggestion: "Check destination configurations and ensure at least one destination is accessible"
      });
    }
    const uploadPromises = this.drivers.map(async ({ driver, config, index }) => {
      const [ok, err, result] = await tryFn(
        () => driver.upload(filePath, backupId, manifest)
      );
      if (ok) {
        this.log(`Upload successful to destination ${index}`);
        return {
          ...result,
          driver: config.driver,
          destination: index,
          status: "success"
        };
      } else {
        this.log(`Upload failed to destination ${index}: ${err.message}`);
        const errorResult = {
          driver: config.driver,
          destination: index,
          status: "failed",
          error: err.message
        };
        errors.push(errorResult);
        return errorResult;
      }
    });
    const allResults = await this._executeConcurrent(uploadPromises, this.config.concurrency);
    const successResults = allResults.filter((r) => r.status === "success");
    const failedResults = allResults.filter((r) => r.status === "failed");
    if (strategy === "all" && failedResults.length > 0) {
      throw new BackupError('Some destinations failed with strategy "all"', {
        operation: "upload",
        driver: "multi",
        strategy: "all",
        backupId,
        totalDestinations: this.drivers.length,
        successCount: successResults.length,
        failedCount: failedResults.length,
        failures: failedResults,
        suggestion: 'All destinations must succeed with "all" strategy. Use "any" strategy to tolerate failures, or fix failing destinations.'
      });
    }
    if (strategy === "any" && successResults.length === 0) {
      throw new BackupError('All destinations failed with strategy "any"', {
        operation: "upload",
        driver: "multi",
        strategy: "any",
        backupId,
        totalDestinations: this.drivers.length,
        failures: failedResults,
        suggestion: 'At least one destination must succeed with "any" strategy. Check all destination configurations.'
      });
    }
    return allResults;
  }
  async download(backupId, targetPath, metadata) {
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];
    for (const destMetadata of destinations) {
      if (destMetadata.status !== "success") continue;
      const driverInstance = this.drivers.find((d) => d.index === destMetadata.destination);
      if (!driverInstance) continue;
      const [ok, err, result] = await tryFn(
        () => driverInstance.driver.download(backupId, targetPath, destMetadata)
      );
      if (ok) {
        this.log(`Downloaded from destination ${destMetadata.destination}`);
        return result;
      } else {
        this.log(`Download failed from destination ${destMetadata.destination}: ${err.message}`);
      }
    }
    throw new BackupError("Failed to download backup from any destination", {
      operation: "download",
      driver: "multi",
      backupId,
      targetPath,
      attemptedDestinations: destinations.length,
      suggestion: "Check if backup exists in at least one destination and destinations are accessible"
    });
  }
  async delete(backupId, metadata) {
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];
    const errors = [];
    let successCount = 0;
    for (const destMetadata of destinations) {
      if (destMetadata.status !== "success") continue;
      const driverInstance = this.drivers.find((d) => d.index === destMetadata.destination);
      if (!driverInstance) continue;
      const [ok, err] = await tryFn(
        () => driverInstance.driver.delete(backupId, destMetadata)
      );
      if (ok) {
        successCount++;
        this.log(`Deleted from destination ${destMetadata.destination}`);
      } else {
        errors.push(`${destMetadata.destination}: ${err.message}`);
        this.log(`Delete failed from destination ${destMetadata.destination}: ${err.message}`);
      }
    }
    if (successCount === 0 && errors.length > 0) {
      throw new BackupError("Failed to delete from any destination", {
        operation: "delete",
        driver: "multi",
        backupId,
        attemptedDestinations: destinations.length,
        failures: errors,
        suggestion: "Check if backup exists in destinations and destinations are accessible with delete permissions"
      });
    }
    if (errors.length > 0) {
      this.log(`Partial delete success, some errors: ${errors.join("; ")}`);
    }
  }
  async list(options = {}) {
    const allLists = await Promise.allSettled(
      this.drivers.map(
        ({ driver, index }) => driver.list(options).catch((err) => {
          this.log(`List failed for destination ${index}: ${err.message}`);
          return [];
        })
      )
    );
    const backupMap = /* @__PURE__ */ new Map();
    allLists.forEach((result, index) => {
      if (result.status === "fulfilled") {
        result.value.forEach((backup) => {
          const existing = backupMap.get(backup.id);
          if (!existing || new Date(backup.createdAt) > new Date(existing.createdAt)) {
            backupMap.set(backup.id, {
              ...backup,
              destinations: existing ? [...existing.destinations || [], { destination: index, ...backup }] : [{ destination: index, ...backup }]
            });
          }
        });
      }
    });
    const results = Array.from(backupMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, options.limit || 50);
    return results;
  }
  async verify(backupId, expectedChecksum, metadata) {
    const destinations = Array.isArray(metadata.destinations) ? metadata.destinations : [metadata];
    for (const destMetadata of destinations) {
      if (destMetadata.status !== "success") continue;
      const driverInstance = this.drivers.find((d) => d.index === destMetadata.destination);
      if (!driverInstance) continue;
      const [ok, , isValid] = await tryFn(
        () => driverInstance.driver.verify(backupId, expectedChecksum, destMetadata)
      );
      if (ok && isValid) {
        this.log(`Verification successful from destination ${destMetadata.destination}`);
        return true;
      }
    }
    return false;
  }
  async cleanup() {
    await Promise.all(
      this.drivers.map(
        ({ driver }) => tryFn(() => driver.cleanup()).catch(() => {
        })
      )
    );
  }
  getStorageInfo() {
    return {
      ...super.getStorageInfo(),
      strategy: this.config.strategy,
      destinations: this.drivers.map(({ driver, config, index }) => ({
        index,
        driver: config.driver,
        info: driver.getStorageInfo()
      }))
    };
  }
  /**
   * Execute promises with concurrency limit
   * @param {Array} promises - Array of promise functions
   * @param {number} concurrency - Max concurrent executions
   * @returns {Array} Results in original order
   */
  async _executeConcurrent(promises, concurrency) {
    const results = new Array(promises.length);
    const executing = [];
    for (let i = 0; i < promises.length; i++) {
      const promise = Promise.resolve(promises[i]).then((result) => {
        results[i] = result;
        return result;
      });
      executing.push(promise);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(executing.findIndex((p) => p === promise), 1);
      }
    }
    await Promise.all(executing);
    return results;
  }
}

const BACKUP_DRIVERS = {
  filesystem: FilesystemBackupDriver,
  s3: S3BackupDriver,
  multi: MultiBackupDriver
};
function createBackupDriver(driver, config = {}) {
  const DriverClass = BACKUP_DRIVERS[driver];
  if (!DriverClass) {
    throw new BackupError(`Unknown backup driver: ${driver}`, {
      operation: "createBackupDriver",
      driver,
      availableDrivers: Object.keys(BACKUP_DRIVERS),
      suggestion: `Use one of the available drivers: ${Object.keys(BACKUP_DRIVERS).join(", ")}`
    });
  }
  return new DriverClass(config);
}
function validateBackupConfig(driver, config = {}) {
  if (!driver || typeof driver !== "string") {
    throw new BackupError("Driver type must be a non-empty string", {
      operation: "validateBackupConfig",
      driver,
      suggestion: "Provide a valid driver type string (filesystem, s3, or multi)"
    });
  }
  if (!BACKUP_DRIVERS[driver]) {
    throw new BackupError(`Unknown backup driver: ${driver}`, {
      operation: "validateBackupConfig",
      driver,
      availableDrivers: Object.keys(BACKUP_DRIVERS),
      suggestion: `Use one of the available drivers: ${Object.keys(BACKUP_DRIVERS).join(", ")}`
    });
  }
  switch (driver) {
    case "filesystem":
      if (!config.path) {
        throw new BackupError('FilesystemBackupDriver requires "path" configuration', {
          operation: "validateBackupConfig",
          driver: "filesystem",
          config,
          suggestion: 'Provide a "path" property in config: { path: "/path/to/backups" }'
        });
      }
      break;
    case "s3":
      break;
    case "multi":
      if (!Array.isArray(config.destinations) || config.destinations.length === 0) {
        throw new BackupError('MultiBackupDriver requires non-empty "destinations" array', {
          operation: "validateBackupConfig",
          driver: "multi",
          config,
          suggestion: 'Provide destinations array: { destinations: [{ driver: "s3", config: {...} }] }'
        });
      }
      config.destinations.forEach((dest, index) => {
        if (!dest.driver) {
          throw new BackupError(`Destination ${index} must have a "driver" property`, {
            operation: "validateBackupConfig",
            driver: "multi",
            destinationIndex: index,
            destination: dest,
            suggestion: 'Each destination must have a driver property: { driver: "s3", config: {...} }'
          });
        }
        if (dest.driver !== "multi") {
          validateBackupConfig(dest.driver, dest.config || {});
        }
      });
      break;
  }
  return true;
}

class BackupPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.config = {
      // Driver configuration
      driver: options.driver || "filesystem",
      driverConfig: options.config || {},
      // Scheduling configuration
      schedule: options.schedule || {},
      // Retention policy (Grandfather-Father-Son)
      retention: {
        daily: 7,
        weekly: 4,
        monthly: 12,
        yearly: 3,
        ...options.retention
      },
      // Backup options
      compression: options.compression || "gzip",
      encryption: options.encryption || null,
      verification: options.verification !== false,
      parallelism: options.parallelism || 4,
      include: options.include || null,
      exclude: options.exclude || [],
      backupMetadataResource: options.backupMetadataResource || "plg_backup_metadata",
      tempDir: options.tempDir || path.join(os.tmpdir(), "s3db", "backups"),
      verbose: options.verbose || false,
      // Hooks
      onBackupStart: options.onBackupStart || null,
      onBackupComplete: options.onBackupComplete || null,
      onBackupError: options.onBackupError || null,
      onRestoreStart: options.onRestoreStart || null,
      onRestoreComplete: options.onRestoreComplete || null,
      onRestoreError: options.onRestoreError || null
    };
    this.driver = null;
    this.activeBackups = /* @__PURE__ */ new Set();
    validateBackupConfig(this.config.driver, this.config.driverConfig);
    this._validateConfiguration();
  }
  _validateConfiguration() {
    if (this.config.encryption && (!this.config.encryption.key || !this.config.encryption.algorithm)) {
      throw new Error("BackupPlugin: Encryption requires both key and algorithm");
    }
    if (this.config.compression && !["none", "gzip", "brotli", "deflate"].includes(this.config.compression)) {
      throw new Error("BackupPlugin: Invalid compression type. Use: none, gzip, brotli, deflate");
    }
  }
  async onInstall() {
    this.driver = createBackupDriver(this.config.driver, this.config.driverConfig);
    await this.driver.setup(this.database);
    await promises.mkdir(this.config.tempDir, { recursive: true });
    await this._createBackupMetadataResource();
    if (this.config.verbose) {
      const storageInfo = this.driver.getStorageInfo();
      console.log(`[BackupPlugin] Initialized with driver: ${storageInfo.type}`);
    }
    this.emit("initialized", {
      driver: this.driver.getType(),
      config: this.driver.getStorageInfo()
    });
  }
  async _createBackupMetadataResource() {
    const [ok] = await tryFn(() => this.database.createResource({
      name: this.config.backupMetadataResource,
      attributes: {
        id: "string|required",
        type: "string|required",
        timestamp: "number|required",
        resources: "json|required",
        driverInfo: "json|required",
        // Store driver info instead of destinations
        size: "number|default:0",
        compressed: "boolean|default:false",
        encrypted: "boolean|default:false",
        checksum: "string|default:null",
        status: "string|required",
        error: "string|default:null",
        duration: "number|default:0",
        createdAt: "string|required"
      },
      behavior: "body-overflow",
      timestamps: true
    }));
    if (!ok && this.config.verbose) {
      console.log(`[BackupPlugin] Backup metadata resource '${this.config.backupMetadataResource}' already exists`);
    }
  }
  /**
   * Create a backup
   * @param {string} type - Backup type ('full' or 'incremental')
   * @param {Object} options - Backup options
   * @returns {Object} Backup result
   */
  async backup(type = "full", options = {}) {
    const backupId = this._generateBackupId(type);
    const startTime = Date.now();
    if (this.activeBackups.has(backupId)) {
      throw new Error(`Backup '${backupId}' is already in progress`);
    }
    try {
      this.activeBackups.add(backupId);
      if (this.config.onBackupStart) {
        await this._executeHook(this.config.onBackupStart, type, { backupId });
      }
      this.emit("backup_start", { id: backupId, type });
      const metadata = await this._createBackupMetadata(backupId, type);
      const tempBackupDir = path.join(this.config.tempDir, backupId);
      await promises.mkdir(tempBackupDir, { recursive: true });
      try {
        const manifest = await this._createBackupManifest(type, options);
        const exportedFiles = await this._exportResources(manifest.resources, tempBackupDir, type);
        if (exportedFiles.length === 0) {
          throw new Error("No resources were exported for backup");
        }
        const archiveExtension = this.config.compression !== "none" ? ".tar.gz" : ".json";
        const finalPath = path.join(tempBackupDir, `${backupId}${archiveExtension}`);
        const totalSize = await this._createArchive(exportedFiles, finalPath, this.config.compression);
        const checksum = await this._generateChecksum(finalPath);
        const uploadResult = await this.driver.upload(finalPath, backupId, manifest);
        if (this.config.verification) {
          const isValid = await this.driver.verify(backupId, checksum, uploadResult);
          if (!isValid) {
            throw new Error("Backup verification failed");
          }
        }
        const duration = Date.now() - startTime;
        await this._updateBackupMetadata(backupId, {
          status: "completed",
          size: totalSize,
          checksum,
          driverInfo: uploadResult,
          duration
        });
        if (this.config.onBackupComplete) {
          const stats = { backupId, type, size: totalSize, duration, driverInfo: uploadResult };
          await this._executeHook(this.config.onBackupComplete, type, stats);
        }
        this.emit("backup_complete", {
          id: backupId,
          type,
          size: totalSize,
          duration,
          driverInfo: uploadResult
        });
        await this._cleanupOldBackups();
        return {
          id: backupId,
          type,
          size: totalSize,
          duration,
          checksum,
          driverInfo: uploadResult
        };
      } finally {
        await this._cleanupTempFiles(tempBackupDir);
      }
    } catch (error) {
      if (this.config.onBackupError) {
        await this._executeHook(this.config.onBackupError, type, { backupId, error });
      }
      await this._updateBackupMetadata(backupId, {
        status: "failed",
        error: error.message,
        duration: Date.now() - startTime
      });
      this.emit("backup_error", { id: backupId, type, error: error.message });
      throw error;
    } finally {
      this.activeBackups.delete(backupId);
    }
  }
  _generateBackupId(type) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}-${timestamp}-${random}`;
  }
  async _createBackupMetadata(backupId, type) {
    const now = /* @__PURE__ */ new Date();
    const metadata = {
      id: backupId,
      type,
      timestamp: Date.now(),
      resources: [],
      driverInfo: {},
      size: 0,
      status: "in_progress",
      compressed: this.config.compression !== "none",
      encrypted: !!this.config.encryption,
      checksum: null,
      error: null,
      duration: 0,
      createdAt: now.toISOString().slice(0, 10)
    };
    const [ok] = await tryFn(
      () => this.database.resource(this.config.backupMetadataResource).insert(metadata)
    );
    return metadata;
  }
  async _updateBackupMetadata(backupId, updates) {
    const [ok] = await tryFn(
      () => this.database.resource(this.config.backupMetadataResource).update(backupId, updates)
    );
  }
  async _createBackupManifest(type, options) {
    let resourcesToBackup = options.resources || (this.config.include ? this.config.include : await this.database.listResources());
    if (Array.isArray(resourcesToBackup) && resourcesToBackup.length > 0 && typeof resourcesToBackup[0] === "object") {
      resourcesToBackup = resourcesToBackup.map((resource) => resource.name || resource);
    }
    const filteredResources = resourcesToBackup.filter(
      (name) => !this.config.exclude.includes(name)
    );
    return {
      type,
      timestamp: Date.now(),
      resources: filteredResources,
      compression: this.config.compression,
      encrypted: !!this.config.encryption,
      s3db_version: this.database.constructor.version || "unknown"
    };
  }
  async _exportResources(resourceNames, tempDir, type) {
    const exportedFiles = [];
    for (const resourceName of resourceNames) {
      const resource = this.database.resources[resourceName];
      if (!resource) {
        if (this.config.verbose) {
          console.warn(`[BackupPlugin] Resource '${resourceName}' not found, skipping`);
        }
        continue;
      }
      const exportPath = path.join(tempDir, `${resourceName}.json`);
      let records;
      if (type === "incremental") {
        const [lastBackupOk, , lastBackups] = await tryFn(
          () => this.database.resource(this.config.backupMetadataResource).list({
            filter: {
              status: "completed",
              type: { $in: ["full", "incremental"] }
            },
            sort: { timestamp: -1 },
            limit: 1
          })
        );
        let sinceTimestamp;
        if (lastBackupOk && lastBackups && lastBackups.length > 0) {
          sinceTimestamp = new Date(lastBackups[0].timestamp);
        } else {
          sinceTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1e3);
        }
        if (this.config.verbose) {
          console.log(`[BackupPlugin] Incremental backup for '${resourceName}' since ${sinceTimestamp.toISOString()}`);
        }
        records = await resource.list({
          filter: { updatedAt: { ">": sinceTimestamp.toISOString() } }
        });
      } else {
        records = await resource.list();
      }
      const exportData = {
        resourceName,
        definition: resource.config,
        records,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        type
      };
      await promises.writeFile(exportPath, JSON.stringify(exportData, null, 2));
      exportedFiles.push(exportPath);
      if (this.config.verbose) {
        console.log(`[BackupPlugin] Exported ${records.length} records from '${resourceName}'`);
      }
    }
    return exportedFiles;
  }
  async _createArchive(files, targetPath, compressionType) {
    const archive = {
      version: "1.0",
      created: (/* @__PURE__ */ new Date()).toISOString(),
      files: []
    };
    let totalSize = 0;
    for (const filePath of files) {
      const [readOk, readErr, content] = await tryFn(() => promises.readFile(filePath, "utf8"));
      if (!readOk) {
        if (this.config.verbose) {
          console.warn(`[BackupPlugin] Failed to read ${filePath}: ${readErr?.message}`);
        }
        continue;
      }
      const fileName = path.basename(filePath);
      totalSize += content.length;
      archive.files.push({
        name: fileName,
        size: content.length,
        content
      });
    }
    const archiveJson = JSON.stringify(archive);
    if (compressionType === "none") {
      await promises.writeFile(targetPath, archiveJson, "utf8");
    } else {
      const output = fs.createWriteStream(targetPath);
      const gzip = zlib.createGzip({ level: 6 });
      await promises$1.pipeline(
        async function* () {
          yield Buffer.from(archiveJson, "utf8");
        },
        gzip,
        output
      );
    }
    const [statOk, , stats] = await tryFn(() => promises.stat(targetPath));
    return statOk ? stats.size : totalSize;
  }
  async _generateChecksum(filePath) {
    const [ok, err, result] = await tryFn(async () => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      await promises$1.pipeline(stream, hash);
      return hash.digest("hex");
    });
    if (!ok) {
      throw new Error(`Failed to generate checksum for ${filePath}: ${err?.message}`);
    }
    return result;
  }
  async _cleanupTempFiles(tempDir) {
    const [ok] = await tryFn(
      () => import('fs/promises').then((fs) => fs.rm(tempDir, { recursive: true, force: true }))
    );
  }
  /**
   * Restore from backup
   * @param {string} backupId - Backup identifier
   * @param {Object} options - Restore options
   * @returns {Object} Restore result
   */
  async restore(backupId, options = {}) {
    try {
      if (this.config.onRestoreStart) {
        await this._executeHook(this.config.onRestoreStart, backupId, options);
      }
      this.emit("restore_start", { id: backupId, options });
      const backup = await this.getBackupStatus(backupId);
      if (!backup) {
        throw new Error(`Backup '${backupId}' not found`);
      }
      if (backup.status !== "completed") {
        throw new Error(`Backup '${backupId}' is not in completed status`);
      }
      const tempRestoreDir = path.join(this.config.tempDir, `restore-${backupId}`);
      await promises.mkdir(tempRestoreDir, { recursive: true });
      try {
        const downloadPath = path.join(tempRestoreDir, `${backupId}.backup`);
        await this.driver.download(backupId, downloadPath, backup.driverInfo);
        if (this.config.verification && backup.checksum) {
          const actualChecksum = await this._generateChecksum(downloadPath);
          if (actualChecksum !== backup.checksum) {
            throw new Error("Backup verification failed during restore");
          }
        }
        const restoredResources = await this._restoreFromBackup(downloadPath, options);
        if (this.config.onRestoreComplete) {
          await this._executeHook(this.config.onRestoreComplete, backupId, { restored: restoredResources });
        }
        this.emit("restore_complete", {
          id: backupId,
          restored: restoredResources
        });
        return {
          backupId,
          restored: restoredResources
        };
      } finally {
        await this._cleanupTempFiles(tempRestoreDir);
      }
    } catch (error) {
      if (this.config.onRestoreError) {
        await this._executeHook(this.config.onRestoreError, backupId, { error });
      }
      this.emit("restore_error", { id: backupId, error: error.message });
      throw error;
    }
  }
  async _restoreFromBackup(backupPath, options) {
    const restoredResources = [];
    try {
      let archiveData = "";
      if (this.config.compression !== "none") {
        const input = fs.createReadStream(backupPath);
        const gunzip = zlib.createGunzip();
        const chunks = [];
        await new Promise((resolve, reject) => {
          input.pipe(gunzip).on("data", (chunk) => chunks.push(chunk)).on("end", resolve).on("error", reject);
        });
        archiveData = Buffer.concat(chunks).toString("utf8");
      } else {
        archiveData = await promises.readFile(backupPath, "utf8");
      }
      let archive;
      try {
        archive = JSON.parse(archiveData);
      } catch (parseError) {
        throw new Error(`Failed to parse backup archive: ${parseError.message}`);
      }
      if (!archive || typeof archive !== "object") {
        throw new Error("Invalid backup archive: not a valid JSON object");
      }
      if (!archive.version || !archive.files) {
        throw new Error("Invalid backup archive format: missing version or files array");
      }
      if (this.config.verbose) {
        console.log(`[BackupPlugin] Restoring ${archive.files.length} files from backup`);
      }
      for (const file of archive.files) {
        try {
          const resourceData = JSON.parse(file.content);
          if (!resourceData.resourceName || !resourceData.definition) {
            if (this.config.verbose) {
              console.warn(`[BackupPlugin] Skipping invalid file: ${file.name}`);
            }
            continue;
          }
          const resourceName = resourceData.resourceName;
          if (options.resources && !options.resources.includes(resourceName)) {
            continue;
          }
          let resource = this.database.resources[resourceName];
          if (!resource) {
            if (this.config.verbose) {
              console.log(`[BackupPlugin] Creating resource '${resourceName}'`);
            }
            const [createOk, createErr] = await tryFn(
              () => this.database.createResource(resourceData.definition)
            );
            if (!createOk) {
              if (this.config.verbose) {
                console.warn(`[BackupPlugin] Failed to create resource '${resourceName}': ${createErr?.message}`);
              }
              continue;
            }
            resource = this.database.resources[resourceName];
          }
          if (resourceData.records && Array.isArray(resourceData.records)) {
            const mode = options.mode || "merge";
            if (mode === "replace") {
              const ids = await resource.listIds();
              for (const id of ids) {
                await resource.delete(id);
              }
            }
            let insertedCount = 0;
            for (const record of resourceData.records) {
              const [insertOk] = await tryFn(async () => {
                if (mode === "skip") {
                  const existing = await resource.get(record.id);
                  if (existing) {
                    return false;
                  }
                }
                await resource.insert(record);
                return true;
              });
              if (insertOk) {
                insertedCount++;
              }
            }
            restoredResources.push({
              name: resourceName,
              recordsRestored: insertedCount,
              totalRecords: resourceData.records.length
            });
            if (this.config.verbose) {
              console.log(`[BackupPlugin] Restored ${insertedCount}/${resourceData.records.length} records to '${resourceName}'`);
            }
          }
        } catch (fileError) {
          if (this.config.verbose) {
            console.warn(`[BackupPlugin] Error processing file ${file.name}: ${fileError.message}`);
          }
        }
      }
      return restoredResources;
    } catch (error) {
      if (this.config.verbose) {
        console.error(`[BackupPlugin] Error restoring backup: ${error.message}`);
      }
      throw new Error(`Failed to restore backup: ${error.message}`);
    }
  }
  /**
   * List available backups
   * @param {Object} options - List options
   * @returns {Array} List of backups
   */
  async listBackups(options = {}) {
    try {
      const driverBackups = await this.driver.list(options);
      const [metaOk, , metadataRecords] = await tryFn(
        () => this.database.resource(this.config.backupMetadataResource).list({
          limit: options.limit || 50,
          sort: { timestamp: -1 }
        })
      );
      const metadataMap = /* @__PURE__ */ new Map();
      if (metaOk) {
        metadataRecords.forEach((record) => metadataMap.set(record.id, record));
      }
      const combinedBackups = driverBackups.map((backup) => ({
        ...backup,
        ...metadataMap.get(backup.id) || {}
      }));
      return combinedBackups;
    } catch (error) {
      if (this.config.verbose) {
        console.log(`[BackupPlugin] Error listing backups: ${error.message}`);
      }
      return [];
    }
  }
  /**
   * Get backup status
   * @param {string} backupId - Backup identifier
   * @returns {Object|null} Backup status
   */
  async getBackupStatus(backupId) {
    const [ok, , backup] = await tryFn(
      () => this.database.resource(this.config.backupMetadataResource).get(backupId)
    );
    return ok ? backup : null;
  }
  async _cleanupOldBackups() {
    try {
      const [listOk, , allBackups] = await tryFn(
        () => this.database.resource(this.config.backupMetadataResource).list({
          filter: { status: "completed" },
          sort: { timestamp: -1 }
        })
      );
      if (!listOk || !allBackups || allBackups.length === 0) {
        return;
      }
      const now = Date.now();
      const msPerDay = 24 * 60 * 60 * 1e3;
      const msPerWeek = 7 * msPerDay;
      const msPerMonth = 30 * msPerDay;
      const msPerYear = 365 * msPerDay;
      const categorized = {
        daily: [],
        weekly: [],
        monthly: [],
        yearly: []
      };
      for (const backup of allBackups) {
        const age = now - backup.timestamp;
        if (age <= msPerDay * this.config.retention.daily) {
          categorized.daily.push(backup);
        } else if (age <= msPerWeek * this.config.retention.weekly) {
          categorized.weekly.push(backup);
        } else if (age <= msPerMonth * this.config.retention.monthly) {
          categorized.monthly.push(backup);
        } else if (age <= msPerYear * this.config.retention.yearly) {
          categorized.yearly.push(backup);
        }
      }
      const toKeep = /* @__PURE__ */ new Set();
      categorized.daily.forEach((b) => toKeep.add(b.id));
      const weeklyByWeek = /* @__PURE__ */ new Map();
      for (const backup of categorized.weekly) {
        const weekNum = Math.floor((now - backup.timestamp) / msPerWeek);
        if (!weeklyByWeek.has(weekNum)) {
          weeklyByWeek.set(weekNum, backup);
          toKeep.add(backup.id);
        }
      }
      const monthlyByMonth = /* @__PURE__ */ new Map();
      for (const backup of categorized.monthly) {
        const monthNum = Math.floor((now - backup.timestamp) / msPerMonth);
        if (!monthlyByMonth.has(monthNum)) {
          monthlyByMonth.set(monthNum, backup);
          toKeep.add(backup.id);
        }
      }
      const yearlyByYear = /* @__PURE__ */ new Map();
      for (const backup of categorized.yearly) {
        const yearNum = Math.floor((now - backup.timestamp) / msPerYear);
        if (!yearlyByYear.has(yearNum)) {
          yearlyByYear.set(yearNum, backup);
          toKeep.add(backup.id);
        }
      }
      const backupsToDelete = allBackups.filter((b) => !toKeep.has(b.id));
      if (backupsToDelete.length === 0) {
        return;
      }
      if (this.config.verbose) {
        console.log(`[BackupPlugin] Cleaning up ${backupsToDelete.length} old backups (keeping ${toKeep.size})`);
      }
      for (const backup of backupsToDelete) {
        try {
          await this.driver.delete(backup.id, backup.driverInfo);
          await this.database.resource(this.config.backupMetadataResource).delete(backup.id);
          if (this.config.verbose) {
            console.log(`[BackupPlugin] Deleted old backup: ${backup.id}`);
          }
        } catch (deleteError) {
          if (this.config.verbose) {
            console.warn(`[BackupPlugin] Failed to delete backup ${backup.id}: ${deleteError.message}`);
          }
        }
      }
    } catch (error) {
      if (this.config.verbose) {
        console.warn(`[BackupPlugin] Error during cleanup: ${error.message}`);
      }
    }
  }
  async _executeHook(hook, ...args) {
    if (typeof hook === "function") {
      return await hook(...args);
    }
  }
  async start() {
    if (this.config.verbose) {
      const storageInfo = this.driver.getStorageInfo();
      console.log(`[BackupPlugin] Started with driver: ${storageInfo.type}`);
    }
  }
  async stop() {
    for (const backupId of this.activeBackups) {
      this.emit("backup_cancelled", { id: backupId });
    }
    this.activeBackups.clear();
    if (this.driver) {
      await this.driver.cleanup();
    }
  }
  /**
   * Cleanup plugin resources (alias for stop for backward compatibility)
   */
  async cleanup() {
    await this.stop();
  }
}

class CacheError extends S3dbError {
  constructor(message, details = {}) {
    const { driver = "unknown", operation = "unknown", resourceName, key, ...rest } = details;
    let description = details.description;
    if (!description) {
      description = `
Cache Operation Error

Driver: ${driver}
Operation: ${operation}
${resourceName ? `Resource: ${resourceName}` : ""}
${key ? `Key: ${key}` : ""}

Common causes:
1. Invalid cache key format
2. Cache driver not properly initialized
3. Resource not found or not cached
4. Memory limits exceeded
5. Filesystem permissions issues

Solution:
Check cache configuration and ensure the cache driver is properly initialized.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/cache.md
`.trim();
    }
    super(message, { ...rest, driver, operation, resourceName, key, description });
  }
}

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
      throw new CacheError("Invalid cache key", {
        operation: "validateKey",
        driver: this.constructor.name,
        key,
        keyType: typeof key,
        suggestion: "Cache key must be a non-empty string"
      });
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

class ResourceIdsReader extends EventEmitter {
  constructor({ resource }) {
    super();
    this.resource = resource;
    this.client = resource.client;
    this.stream = new web.ReadableStream({
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

class ResourceIdsPageReader extends ResourceIdsReader {
  enqueue(ids) {
    this.controller.enqueue(ids);
    this.emit("page", ids);
  }
}

class ResourceReader extends EventEmitter {
  constructor({ resource, batchSize = 10, concurrency = 5 }) {
    super();
    if (!resource) {
      throw new StreamError("Resource is required for ResourceReader", {
        operation: "constructor",
        resource: resource?.name,
        suggestion: "Pass a valid Resource instance when creating ResourceReader"
      });
    }
    this.resource = resource;
    this.client = resource.client;
    this.batchSize = batchSize;
    this.concurrency = concurrency;
    this.input = new ResourceIdsPageReader({ resource: this.resource });
    this.transform = new stream.Transform({
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
    const [ok, err] = await tryFn(async () => {
      await promisePool.PromisePool.for(chunk).withConcurrency(this.concurrency).handleError(async (error, content) => {
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
    this.writable = new stream.Writable({
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
      const [ok, err] = await tryFn(async () => {
        await promisePool.PromisePool.for(batch).withConcurrency(this.concurrency).handleError(async (error, content) => {
          this.emit("error", error, content);
        }).process(async (item) => {
          const [ok2, err2, result] = await tryFn(async () => {
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
      return reject(new StreamError("Stream is undefined", {
        operation: "streamToString",
        suggestion: "Ensure a valid stream is passed to streamToString()"
      }));
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
    super();
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
      key: path.join(this.keyPrefix, key),
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
    const [ok, err, result] = await tryFn(async () => {
      const { Body } = await this.client.getObject(path.join(this.keyPrefix, key));
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
    await this.client.deleteObject(path.join(this.keyPrefix, key));
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

class MemoryCache extends Cache {
  constructor(config = {}) {
    super(config);
    this.cache = {};
    this.meta = {};
    this.maxSize = config.maxSize !== void 0 ? config.maxSize : 1e3;
    if (config.maxMemoryBytes && config.maxMemoryBytes > 0 && config.maxMemoryPercent && config.maxMemoryPercent > 0) {
      throw new Error(
        "[MemoryCache] Cannot use both maxMemoryBytes and maxMemoryPercent. Choose one: maxMemoryBytes (absolute) or maxMemoryPercent (0...1 fraction)."
      );
    }
    if (config.maxMemoryPercent && config.maxMemoryPercent > 0) {
      if (config.maxMemoryPercent > 1) {
        throw new Error(
          `[MemoryCache] maxMemoryPercent must be between 0 and 1 (e.g., 0.1 for 10%). Received: ${config.maxMemoryPercent}`
        );
      }
      const totalMemory = os$1.totalmem();
      this.maxMemoryBytes = Math.floor(totalMemory * config.maxMemoryPercent);
      this.maxMemoryPercent = config.maxMemoryPercent;
    } else {
      this.maxMemoryBytes = config.maxMemoryBytes !== void 0 ? config.maxMemoryBytes : 0;
      this.maxMemoryPercent = 0;
    }
    this.ttl = config.ttl !== void 0 ? config.ttl : 3e5;
    this.enableCompression = config.enableCompression !== void 0 ? config.enableCompression : false;
    this.compressionThreshold = config.compressionThreshold !== void 0 ? config.compressionThreshold : 1024;
    this.compressionStats = {
      totalCompressed: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      compressionRatio: 0
    };
    this.currentMemoryBytes = 0;
    this.evictedDueToMemory = 0;
  }
  async _set(key, data) {
    let finalData = data;
    let compressed = false;
    let originalSize = 0;
    let compressedSize = 0;
    const serialized = JSON.stringify(data);
    originalSize = Buffer.byteLength(serialized, "utf8");
    if (this.enableCompression) {
      try {
        if (originalSize >= this.compressionThreshold) {
          const compressedBuffer = zlib.gzipSync(Buffer.from(serialized, "utf8"));
          finalData = {
            __compressed: true,
            __data: compressedBuffer.toString("base64"),
            __originalSize: originalSize
          };
          compressedSize = Buffer.byteLength(finalData.__data, "utf8");
          compressed = true;
          this.compressionStats.totalCompressed++;
          this.compressionStats.totalOriginalSize += originalSize;
          this.compressionStats.totalCompressedSize += compressedSize;
          this.compressionStats.compressionRatio = (this.compressionStats.totalCompressedSize / this.compressionStats.totalOriginalSize).toFixed(2);
        }
      } catch (error) {
        console.warn(`[MemoryCache] Compression failed for key '${key}':`, error.message);
      }
    }
    const itemSize = compressed ? compressedSize : originalSize;
    if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
      const oldSize = this.meta[key]?.compressedSize || 0;
      this.currentMemoryBytes -= oldSize;
    }
    if (this.maxMemoryBytes > 0) {
      while (this.currentMemoryBytes + itemSize > this.maxMemoryBytes && Object.keys(this.cache).length > 0) {
        const oldestKey = Object.entries(this.meta).sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
        if (oldestKey) {
          const evictedSize = this.meta[oldestKey]?.compressedSize || 0;
          delete this.cache[oldestKey];
          delete this.meta[oldestKey];
          this.currentMemoryBytes -= evictedSize;
          this.evictedDueToMemory++;
        } else {
          break;
        }
      }
    }
    if (this.maxSize > 0 && Object.keys(this.cache).length >= this.maxSize) {
      const oldestKey = Object.entries(this.meta).sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
      if (oldestKey) {
        const evictedSize = this.meta[oldestKey]?.compressedSize || 0;
        delete this.cache[oldestKey];
        delete this.meta[oldestKey];
        this.currentMemoryBytes -= evictedSize;
      }
    }
    this.cache[key] = finalData;
    this.meta[key] = {
      ts: Date.now(),
      compressed,
      originalSize,
      compressedSize: itemSize
    };
    this.currentMemoryBytes += itemSize;
    return data;
  }
  async _get(key) {
    if (!Object.prototype.hasOwnProperty.call(this.cache, key)) return null;
    if (this.ttl > 0) {
      const now = Date.now();
      const meta = this.meta[key];
      if (meta && now - meta.ts > this.ttl) {
        const itemSize = meta.compressedSize || 0;
        this.currentMemoryBytes -= itemSize;
        delete this.cache[key];
        delete this.meta[key];
        return null;
      }
    }
    const rawData = this.cache[key];
    if (rawData && typeof rawData === "object" && rawData.__compressed) {
      try {
        const compressedBuffer = Buffer.from(rawData.__data, "base64");
        const decompressed = zlib.gunzipSync(compressedBuffer).toString("utf8");
        return JSON.parse(decompressed);
      } catch (error) {
        console.warn(`[MemoryCache] Decompression failed for key '${key}':`, error.message);
        delete this.cache[key];
        delete this.meta[key];
        return null;
      }
    }
    return rawData;
  }
  async _del(key) {
    if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
      const itemSize = this.meta[key]?.compressedSize || 0;
      this.currentMemoryBytes -= itemSize;
    }
    delete this.cache[key];
    delete this.meta[key];
    return true;
  }
  async _clear(prefix) {
    if (!prefix) {
      this.cache = {};
      this.meta = {};
      this.currentMemoryBytes = 0;
      return true;
    }
    for (const key of Object.keys(this.cache)) {
      if (key.startsWith(prefix)) {
        const itemSize = this.meta[key]?.compressedSize || 0;
        this.currentMemoryBytes -= itemSize;
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
  /**
   * Get compression statistics
   * @returns {Object} Compression stats including total compressed items, ratios, and space savings
   */
  getCompressionStats() {
    if (!this.enableCompression) {
      return { enabled: false, message: "Compression is disabled" };
    }
    const spaceSavings = this.compressionStats.totalOriginalSize > 0 ? ((this.compressionStats.totalOriginalSize - this.compressionStats.totalCompressedSize) / this.compressionStats.totalOriginalSize * 100).toFixed(2) : 0;
    return {
      enabled: true,
      totalItems: Object.keys(this.cache).length,
      compressedItems: this.compressionStats.totalCompressed,
      compressionThreshold: this.compressionThreshold,
      totalOriginalSize: this.compressionStats.totalOriginalSize,
      totalCompressedSize: this.compressionStats.totalCompressedSize,
      averageCompressionRatio: this.compressionStats.compressionRatio,
      spaceSavingsPercent: spaceSavings,
      memoryUsage: {
        uncompressed: `${(this.compressionStats.totalOriginalSize / 1024).toFixed(2)} KB`,
        compressed: `${(this.compressionStats.totalCompressedSize / 1024).toFixed(2)} KB`,
        saved: `${((this.compressionStats.totalOriginalSize - this.compressionStats.totalCompressedSize) / 1024).toFixed(2)} KB`
      }
    };
  }
  /**
   * Get memory usage statistics
   * @returns {Object} Memory stats including current usage, limits, and eviction counts
   */
  getMemoryStats() {
    const totalItems = Object.keys(this.cache).length;
    const memoryUsagePercent = this.maxMemoryBytes > 0 ? (this.currentMemoryBytes / this.maxMemoryBytes * 100).toFixed(2) : 0;
    const systemMemory = {
      total: os$1.totalmem(),
      free: os$1.freemem(),
      used: os$1.totalmem() - os$1.freemem()
    };
    const cachePercentOfTotal = systemMemory.total > 0 ? (this.currentMemoryBytes / systemMemory.total * 100).toFixed(2) : 0;
    return {
      currentMemoryBytes: this.currentMemoryBytes,
      maxMemoryBytes: this.maxMemoryBytes,
      maxMemoryPercent: this.maxMemoryPercent,
      memoryUsagePercent: parseFloat(memoryUsagePercent),
      cachePercentOfSystemMemory: parseFloat(cachePercentOfTotal),
      totalItems,
      maxSize: this.maxSize,
      evictedDueToMemory: this.evictedDueToMemory,
      averageItemSize: totalItems > 0 ? Math.round(this.currentMemoryBytes / totalItems) : 0,
      memoryUsage: {
        current: this._formatBytes(this.currentMemoryBytes),
        max: this.maxMemoryBytes > 0 ? this._formatBytes(this.maxMemoryBytes) : "unlimited",
        available: this.maxMemoryBytes > 0 ? this._formatBytes(this.maxMemoryBytes - this.currentMemoryBytes) : "unlimited"
      },
      systemMemory: {
        total: this._formatBytes(systemMemory.total),
        free: this._formatBytes(systemMemory.free),
        used: this._formatBytes(systemMemory.used),
        cachePercent: `${cachePercentOfTotal}%`
      }
    };
  }
  /**
   * Format bytes to human-readable format
   * @private
   */
  _formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}

class FilesystemCache extends Cache {
  constructor({
    directory,
    prefix = "cache",
    ttl = 36e5,
    enableCompression = true,
    compressionThreshold = 1024,
    createDirectory = true,
    fileExtension = ".cache",
    enableMetadata = true,
    maxFileSize = 10485760,
    // 10MB
    enableStats = false,
    enableCleanup = true,
    cleanupInterval = 3e5,
    // 5 minutes
    encoding = "utf8",
    fileMode = 420,
    enableBackup = false,
    backupSuffix = ".bak",
    enableLocking = false,
    lockTimeout = 5e3,
    enableJournal = false,
    journalFile = "cache.journal",
    ...config
  }) {
    super(config);
    if (!directory) {
      throw new Error("FilesystemCache: directory parameter is required");
    }
    this.directory = path.resolve(directory);
    this.prefix = prefix;
    this.ttl = ttl;
    this.enableCompression = enableCompression;
    this.compressionThreshold = compressionThreshold;
    this.createDirectory = createDirectory;
    this.fileExtension = fileExtension;
    this.enableMetadata = enableMetadata;
    this.maxFileSize = maxFileSize;
    this.enableStats = enableStats;
    this.enableCleanup = enableCleanup;
    this.cleanupInterval = cleanupInterval;
    this.encoding = encoding;
    this.fileMode = fileMode;
    this.enableBackup = enableBackup;
    this.backupSuffix = backupSuffix;
    this.enableLocking = enableLocking;
    this.lockTimeout = lockTimeout;
    this.enableJournal = enableJournal;
    this.journalFile = path.join(this.directory, journalFile);
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      clears: 0,
      errors: 0
    };
    this.locks = /* @__PURE__ */ new Map();
    this.cleanupTimer = null;
    this._init();
  }
  async _init() {
    if (this.createDirectory) {
      await this._ensureDirectory(this.directory);
    }
    if (this.enableCleanup && this.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this._cleanup().catch((err) => {
          console.warn("FilesystemCache cleanup error:", err.message);
        });
      }, this.cleanupInterval);
    }
  }
  async _ensureDirectory(dir) {
    const [ok, err] = await tryFn(async () => {
      await promises.mkdir(dir, { recursive: true });
    });
    if (!ok && err.code !== "EEXIST") {
      throw new Error(`Failed to create cache directory: ${err.message}`);
    }
  }
  _getFilePath(key) {
    const sanitizedKey = key.replace(/[<>:"/\\|?*]/g, "_");
    const filename = `${this.prefix}_${sanitizedKey}${this.fileExtension}`;
    return path.join(this.directory, filename);
  }
  _getMetadataPath(filePath) {
    return filePath + ".meta";
  }
  async _set(key, data) {
    const filePath = this._getFilePath(key);
    try {
      let serialized = JSON.stringify(data);
      const originalSize = Buffer.byteLength(serialized, this.encoding);
      if (originalSize > this.maxFileSize) {
        throw new Error(`Cache data exceeds maximum file size: ${originalSize} > ${this.maxFileSize}`);
      }
      let compressed = false;
      let finalData = serialized;
      if (this.enableCompression && originalSize >= this.compressionThreshold) {
        const compressedBuffer = zlib.gzipSync(Buffer.from(serialized, this.encoding));
        finalData = compressedBuffer.toString("base64");
        compressed = true;
      }
      if (this.enableBackup && await this._fileExists(filePath)) {
        const backupPath = filePath + this.backupSuffix;
        await this._copyFile(filePath, backupPath);
      }
      if (this.enableLocking) {
        await this._acquireLock(filePath);
      }
      try {
        await promises.writeFile(filePath, finalData, {
          encoding: compressed ? "utf8" : this.encoding,
          mode: this.fileMode
        });
        if (this.enableMetadata) {
          const metadata = {
            key,
            timestamp: Date.now(),
            ttl: this.ttl,
            compressed,
            originalSize,
            compressedSize: compressed ? Buffer.byteLength(finalData, "utf8") : originalSize,
            compressionRatio: compressed ? (Buffer.byteLength(finalData, "utf8") / originalSize).toFixed(2) : 1
          };
          await promises.writeFile(this._getMetadataPath(filePath), JSON.stringify(metadata), {
            encoding: this.encoding,
            mode: this.fileMode
          });
        }
        if (this.enableStats) {
          this.stats.sets++;
        }
        if (this.enableJournal) {
          await this._journalOperation("set", key, { size: originalSize, compressed });
        }
      } finally {
        if (this.enableLocking) {
          this._releaseLock(filePath);
        }
      }
      return data;
    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new Error(`Failed to set cache key '${key}': ${error.message}`);
    }
  }
  async _get(key) {
    const filePath = this._getFilePath(key);
    try {
      if (!await this._fileExists(filePath)) {
        if (this.enableStats) {
          this.stats.misses++;
        }
        return null;
      }
      let isExpired = false;
      if (this.enableMetadata) {
        const metadataPath = this._getMetadataPath(filePath);
        if (await this._fileExists(metadataPath)) {
          const [ok, err, metadata] = await tryFn(async () => {
            const metaContent = await promises.readFile(metadataPath, this.encoding);
            return JSON.parse(metaContent);
          });
          if (ok && metadata.ttl > 0) {
            const age = Date.now() - metadata.timestamp;
            isExpired = age > metadata.ttl;
          }
        }
      } else if (this.ttl > 0) {
        const stats = await promises.stat(filePath);
        const age = Date.now() - stats.mtime.getTime();
        isExpired = age > this.ttl;
      }
      if (isExpired) {
        await this._del(key);
        if (this.enableStats) {
          this.stats.misses++;
        }
        return null;
      }
      if (this.enableLocking) {
        await this._acquireLock(filePath);
      }
      try {
        const content = await promises.readFile(filePath, this.encoding);
        let isCompressed = false;
        if (this.enableMetadata) {
          const metadataPath = this._getMetadataPath(filePath);
          if (await this._fileExists(metadataPath)) {
            const [ok, err, metadata] = await tryFn(async () => {
              const metaContent = await promises.readFile(metadataPath, this.encoding);
              return JSON.parse(metaContent);
            });
            if (ok) {
              isCompressed = metadata.compressed;
            }
          }
        }
        let finalContent = content;
        if (isCompressed || this.enableCompression && content.match(/^[A-Za-z0-9+/=]+$/)) {
          try {
            const compressedBuffer = Buffer.from(content, "base64");
            finalContent = zlib.gunzipSync(compressedBuffer).toString(this.encoding);
          } catch (decompressError) {
            finalContent = content;
          }
        }
        const data = JSON.parse(finalContent);
        if (this.enableStats) {
          this.stats.hits++;
        }
        return data;
      } finally {
        if (this.enableLocking) {
          this._releaseLock(filePath);
        }
      }
    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      await this._del(key);
      return null;
    }
  }
  async _del(key) {
    const filePath = this._getFilePath(key);
    try {
      if (await this._fileExists(filePath)) {
        await promises.unlink(filePath);
      }
      if (this.enableMetadata) {
        const metadataPath = this._getMetadataPath(filePath);
        if (await this._fileExists(metadataPath)) {
          await promises.unlink(metadataPath);
        }
      }
      if (this.enableBackup) {
        const backupPath = filePath + this.backupSuffix;
        if (await this._fileExists(backupPath)) {
          await promises.unlink(backupPath);
        }
      }
      if (this.enableStats) {
        this.stats.deletes++;
      }
      if (this.enableJournal) {
        await this._journalOperation("delete", key);
      }
      return true;
    } catch (error) {
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new Error(`Failed to delete cache key '${key}': ${error.message}`);
    }
  }
  async _clear(prefix) {
    try {
      if (!await this._fileExists(this.directory)) {
        if (this.enableStats) {
          this.stats.clears++;
        }
        return true;
      }
      const files = await promises.readdir(this.directory);
      const cacheFiles = files.filter((file) => {
        if (!file.startsWith(this.prefix)) return false;
        if (!file.endsWith(this.fileExtension)) return false;
        if (prefix) {
          const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
          return keyPart.startsWith(prefix);
        }
        return true;
      });
      for (const file of cacheFiles) {
        const filePath = path.join(this.directory, file);
        try {
          if (await this._fileExists(filePath)) {
            await promises.unlink(filePath);
          }
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
        if (this.enableMetadata) {
          try {
            const metadataPath = this._getMetadataPath(filePath);
            if (await this._fileExists(metadataPath)) {
              await promises.unlink(metadataPath);
            }
          } catch (error) {
            if (error.code !== "ENOENT") {
              throw error;
            }
          }
        }
        if (this.enableBackup) {
          try {
            const backupPath = filePath + this.backupSuffix;
            if (await this._fileExists(backupPath)) {
              await promises.unlink(backupPath);
            }
          } catch (error) {
            if (error.code !== "ENOENT") {
              throw error;
            }
          }
        }
      }
      if (this.enableStats) {
        this.stats.clears++;
      }
      if (this.enableJournal) {
        await this._journalOperation("clear", prefix || "all", { count: cacheFiles.length });
      }
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        if (this.enableStats) {
          this.stats.clears++;
        }
        return true;
      }
      if (this.enableStats) {
        this.stats.errors++;
      }
      throw new Error(`Failed to clear cache: ${error.message}`);
    }
  }
  async size() {
    const keys = await this.keys();
    return keys.length;
  }
  async keys() {
    try {
      const files = await promises.readdir(this.directory);
      const cacheFiles = files.filter(
        (file) => file.startsWith(this.prefix) && file.endsWith(this.fileExtension)
      );
      const keys = cacheFiles.map((file) => {
        const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
        return keyPart;
      });
      return keys;
    } catch (error) {
      console.warn("FilesystemCache: Failed to list keys:", error.message);
      return [];
    }
  }
  // Helper methods
  async _fileExists(filePath) {
    const [ok] = await tryFn(async () => {
      await promises.stat(filePath);
    });
    return ok;
  }
  async _copyFile(src, dest) {
    const [ok, err] = await tryFn(async () => {
      const content = await promises.readFile(src);
      await promises.writeFile(dest, content);
    });
    if (!ok) {
      console.warn("FilesystemCache: Failed to create backup:", err.message);
    }
  }
  async _cleanup() {
    if (!this.ttl || this.ttl <= 0) return;
    try {
      const files = await promises.readdir(this.directory);
      const now = Date.now();
      for (const file of files) {
        if (!file.startsWith(this.prefix) || !file.endsWith(this.fileExtension)) {
          continue;
        }
        const filePath = path.join(this.directory, file);
        let shouldDelete = false;
        if (this.enableMetadata) {
          const metadataPath = this._getMetadataPath(filePath);
          if (await this._fileExists(metadataPath)) {
            const [ok, err, metadata] = await tryFn(async () => {
              const metaContent = await promises.readFile(metadataPath, this.encoding);
              return JSON.parse(metaContent);
            });
            if (ok && metadata.ttl > 0) {
              const age = now - metadata.timestamp;
              shouldDelete = age > metadata.ttl;
            }
          }
        } else {
          const [ok, err, stats] = await tryFn(async () => {
            return await promises.stat(filePath);
          });
          if (ok) {
            const age = now - stats.mtime.getTime();
            shouldDelete = age > this.ttl;
          }
        }
        if (shouldDelete) {
          const keyPart = file.slice(this.prefix.length + 1, -this.fileExtension.length);
          await this._del(keyPart);
        }
      }
    } catch (error) {
      console.warn("FilesystemCache cleanup error:", error.message);
    }
  }
  async _acquireLock(filePath) {
    if (!this.enableLocking) return;
    const lockKey = filePath;
    const startTime = Date.now();
    while (this.locks.has(lockKey)) {
      if (Date.now() - startTime > this.lockTimeout) {
        throw new Error(`Lock timeout for file: ${filePath}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    this.locks.set(lockKey, Date.now());
  }
  _releaseLock(filePath) {
    if (!this.enableLocking) return;
    this.locks.delete(filePath);
  }
  async _journalOperation(operation, key, metadata = {}) {
    if (!this.enableJournal) return;
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      operation,
      key,
      metadata
    };
    const [ok, err] = await tryFn(async () => {
      const line = JSON.stringify(entry) + "\n";
      await fs.promises.appendFile(this.journalFile, line, this.encoding);
    });
    if (!ok) {
      console.warn("FilesystemCache journal error:", err.message);
    }
  }
  // Cleanup on process exit
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
  // Get cache statistics
  getStats() {
    return {
      ...this.stats,
      directory: this.directory,
      ttl: this.ttl,
      compression: this.enableCompression,
      metadata: this.enableMetadata,
      cleanup: this.enableCleanup,
      locking: this.enableLocking,
      journal: this.enableJournal
    };
  }
}

class PartitionAwareFilesystemCache extends FilesystemCache {
  constructor({
    partitionStrategy = "hierarchical",
    // 'hierarchical', 'flat', 'temporal'
    trackUsage = true,
    preloadRelated = false,
    preloadThreshold = 10,
    maxCacheSize = null,
    usageStatsFile = "partition-usage.json",
    ...config
  }) {
    super(config);
    this.partitionStrategy = partitionStrategy;
    this.trackUsage = trackUsage;
    this.preloadRelated = preloadRelated;
    this.preloadThreshold = preloadThreshold;
    this.maxCacheSize = maxCacheSize;
    this.usageStatsFile = path.join(this.directory, usageStatsFile);
    this.partitionUsage = /* @__PURE__ */ new Map();
    this.loadUsageStats();
  }
  /**
   * Generate partition-aware cache key
   */
  _getPartitionCacheKey(resource, action, partition, partitionValues = {}, params = {}) {
    const keyParts = [`resource=${resource}`, `action=${action}`];
    if (partition && Object.keys(partitionValues).length > 0) {
      keyParts.push(`partition=${partition}`);
      const sortedFields = Object.entries(partitionValues).sort(([a], [b]) => a.localeCompare(b));
      for (const [field, value] of sortedFields) {
        if (value !== null && value !== void 0) {
          keyParts.push(`${field}=${value}`);
        }
      }
    }
    if (Object.keys(params).length > 0) {
      const paramsStr = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("|");
      keyParts.push(`params=${Buffer.from(paramsStr).toString("base64")}`);
    }
    return keyParts.join("/") + this.fileExtension;
  }
  /**
   * Get directory path for partition cache
   */
  _getPartitionDirectory(resource, partition, partitionValues = {}) {
    const basePath = path.join(this.directory, `resource=${resource}`);
    if (!partition) {
      return basePath;
    }
    if (this.partitionStrategy === "flat") {
      return path.join(basePath, "partitions");
    }
    if (this.partitionStrategy === "temporal" && this._isTemporalPartition(partition, partitionValues)) {
      return this._getTemporalDirectory(basePath, partition, partitionValues);
    }
    const pathParts = [basePath, `partition=${partition}`];
    const sortedFields = Object.entries(partitionValues).sort(([a], [b]) => a.localeCompare(b));
    for (const [field, value] of sortedFields) {
      if (value !== null && value !== void 0) {
        pathParts.push(`${field}=${this._sanitizePathValue(value)}`);
      }
    }
    return path.join(...pathParts);
  }
  /**
   * Enhanced set method with partition awareness
   */
  async _set(key, data, options = {}) {
    const { resource, action, partition, partitionValues, params } = options;
    if (resource && partition) {
      const partitionKey = this._getPartitionCacheKey(resource, action, partition, partitionValues, params);
      const partitionDir = this._getPartitionDirectory(resource, partition, partitionValues);
      await this._ensureDirectory(partitionDir);
      const filePath = path.join(partitionDir, this._sanitizeFileName(partitionKey));
      if (this.trackUsage) {
        await this._trackPartitionUsage(resource, partition, partitionValues);
      }
      const partitionData = {
        data,
        metadata: {
          resource,
          partition,
          partitionValues,
          timestamp: Date.now(),
          ttl: this.ttl
        }
      };
      return this._writeFileWithMetadata(filePath, partitionData);
    }
    return super._set(key, data);
  }
  /**
   * Public set method with partition support
   */
  async set(resource, action, data, options = {}) {
    if (typeof resource === "string" && typeof action === "string" && options.partition) {
      const key = this._getPartitionCacheKey(resource, action, options.partition, options.partitionValues, options.params);
      return this._set(key, data, { resource, action, ...options });
    }
    return super.set(resource, action);
  }
  /**
   * Public get method with partition support
   */
  async get(resource, action, options = {}) {
    if (typeof resource === "string" && typeof action === "string" && options.partition) {
      const key = this._getPartitionCacheKey(resource, action, options.partition, options.partitionValues, options.params);
      return this._get(key, { resource, action, ...options });
    }
    return super.get(resource);
  }
  /**
   * Enhanced get method with partition awareness
   */
  async _get(key, options = {}) {
    const { resource, action, partition, partitionValues, params } = options;
    if (resource && partition) {
      const partitionKey = this._getPartitionCacheKey(resource, action, partition, partitionValues, params);
      const partitionDir = this._getPartitionDirectory(resource, partition, partitionValues);
      const filePath = path.join(partitionDir, this._sanitizeFileName(partitionKey));
      if (!await this._fileExists(filePath)) {
        if (this.preloadRelated) {
          await this._preloadRelatedPartitions(resource, partition, partitionValues);
        }
        return null;
      }
      const result = await this._readFileWithMetadata(filePath);
      if (result && this.trackUsage) {
        await this._trackPartitionUsage(resource, partition, partitionValues);
      }
      return result?.data || null;
    }
    return super._get(key);
  }
  /**
   * Clear cache for specific partition
   */
  async clearPartition(resource, partition, partitionValues = {}) {
    const partitionDir = this._getPartitionDirectory(resource, partition, partitionValues);
    const [ok, err] = await tryFn(async () => {
      if (await this._fileExists(partitionDir)) {
        await promises.rm(partitionDir, { recursive: true });
      }
    });
    if (!ok) {
      console.warn(`Failed to clear partition cache: ${err.message}`);
    }
    const usageKey = this._getUsageKey(resource, partition, partitionValues);
    this.partitionUsage.delete(usageKey);
    await this._saveUsageStats();
    return ok;
  }
  /**
   * Clear all partitions for a resource
   */
  async clearResourcePartitions(resource) {
    const resourceDir = path.join(this.directory, `resource=${resource}`);
    const [ok, err] = await tryFn(async () => {
      if (await this._fileExists(resourceDir)) {
        await promises.rm(resourceDir, { recursive: true });
      }
    });
    for (const [key] of this.partitionUsage.entries()) {
      if (key.startsWith(`${resource}/`)) {
        this.partitionUsage.delete(key);
      }
    }
    await this._saveUsageStats();
    return ok;
  }
  /**
   * Get partition cache statistics
   */
  async getPartitionStats(resource, partition = null) {
    const stats = {
      totalFiles: 0,
      totalSize: 0,
      partitions: {},
      usage: {}
    };
    const resourceDir = path.join(this.directory, `resource=${resource}`);
    if (!await this._fileExists(resourceDir)) {
      return stats;
    }
    await this._calculateDirectoryStats(resourceDir, stats);
    for (const [key, usage] of this.partitionUsage.entries()) {
      if (key.startsWith(`${resource}/`)) {
        const partitionName = key.split("/")[1];
        if (!partition || partitionName === partition) {
          stats.usage[partitionName] = usage;
        }
      }
    }
    return stats;
  }
  /**
   * Get cache recommendations based on usage patterns
   */
  async getCacheRecommendations(resource) {
    const recommendations = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1e3;
    for (const [key, usage] of this.partitionUsage.entries()) {
      if (key.startsWith(`${resource}/`)) {
        const [, partition] = key.split("/");
        const daysSinceLastAccess = (now - usage.lastAccess) / dayMs;
        const accessesPerDay = usage.count / Math.max(1, daysSinceLastAccess);
        let recommendation = "keep";
        let priority = usage.count;
        if (daysSinceLastAccess > 30) {
          recommendation = "archive";
          priority = 0;
        } else if (accessesPerDay < 0.1) {
          recommendation = "reduce_ttl";
          priority = 1;
        } else if (accessesPerDay > 10) {
          recommendation = "preload";
          priority = 100;
        }
        recommendations.push({
          partition,
          recommendation,
          priority,
          usage: accessesPerDay,
          lastAccess: new Date(usage.lastAccess).toISOString()
        });
      }
    }
    return recommendations.sort((a, b) => b.priority - a.priority);
  }
  /**
   * Preload frequently accessed partitions
   */
  async warmPartitionCache(resource, options = {}) {
    const { partitions = [], maxFiles = 1e3 } = options;
    let warmedCount = 0;
    for (const partition of partitions) {
      const usageKey = `${resource}/${partition}`;
      const usage = this.partitionUsage.get(usageKey);
      if (usage && usage.count >= this.preloadThreshold) {
        console.log(`\u{1F525} Warming cache for ${resource}/${partition} (${usage.count} accesses)`);
        warmedCount++;
      }
      if (warmedCount >= maxFiles) break;
    }
    return warmedCount;
  }
  // Private helper methods
  async _trackPartitionUsage(resource, partition, partitionValues) {
    const usageKey = this._getUsageKey(resource, partition, partitionValues);
    const current = this.partitionUsage.get(usageKey) || {
      count: 0,
      firstAccess: Date.now(),
      lastAccess: Date.now()
    };
    current.count++;
    current.lastAccess = Date.now();
    this.partitionUsage.set(usageKey, current);
    if (current.count % 10 === 0) {
      await this._saveUsageStats();
    }
  }
  _getUsageKey(resource, partition, partitionValues) {
    const valuePart = Object.entries(partitionValues).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("|");
    return `${resource}/${partition}/${valuePart}`;
  }
  async _preloadRelatedPartitions(resource, partition, partitionValues) {
    console.log(`\u{1F3AF} Preloading related partitions for ${resource}/${partition}`);
    if (partitionValues.timestamp || partitionValues.date) ;
  }
  _isTemporalPartition(partition, partitionValues) {
    const temporalFields = ["date", "timestamp", "createdAt", "updatedAt"];
    return Object.keys(partitionValues).some(
      (field) => temporalFields.some((tf) => field.toLowerCase().includes(tf))
    );
  }
  _getTemporalDirectory(basePath, partition, partitionValues) {
    const dateValue = Object.values(partitionValues)[0];
    if (typeof dateValue === "string" && dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
      const [year, month, day] = dateValue.split("-");
      return path.join(basePath, "temporal", year, month, day);
    }
    return path.join(basePath, `partition=${partition}`);
  }
  _sanitizePathValue(value) {
    return String(value).replace(/[<>:"/\\|?*]/g, "_");
  }
  _sanitizeFileName(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, "_");
  }
  async _calculateDirectoryStats(dir, stats) {
    const [ok, err, files] = await tryFn(() => promises.readdir(dir));
    if (!ok) return;
    for (const file of files) {
      const filePath = path.join(dir, file);
      const [statOk, statErr, fileStat] = await tryFn(() => promises.stat(filePath));
      if (statOk) {
        if (fileStat.isDirectory()) {
          await this._calculateDirectoryStats(filePath, stats);
        } else {
          stats.totalFiles++;
          stats.totalSize += fileStat.size;
        }
      }
    }
  }
  async loadUsageStats() {
    const [ok, err, content] = await tryFn(async () => {
      const data = await promises.readFile(this.usageStatsFile, "utf8");
      return JSON.parse(data);
    });
    if (ok && content) {
      this.partitionUsage = new Map(Object.entries(content));
    }
  }
  async _saveUsageStats() {
    const statsObject = Object.fromEntries(this.partitionUsage);
    await tryFn(async () => {
      await promises.writeFile(
        this.usageStatsFile,
        JSON.stringify(statsObject, null, 2),
        "utf8"
      );
    });
  }
  async _writeFileWithMetadata(filePath, data) {
    const content = JSON.stringify(data);
    const [ok, err] = await tryFn(async () => {
      await promises.writeFile(filePath, content, {
        encoding: this.encoding,
        mode: this.fileMode
      });
    });
    if (!ok) {
      throw new Error(`Failed to write cache file: ${err.message}`);
    }
    return true;
  }
  async _readFileWithMetadata(filePath) {
    const [ok, err, content] = await tryFn(async () => {
      return await promises.readFile(filePath, this.encoding);
    });
    if (!ok || !content) return null;
    try {
      return JSON.parse(content);
    } catch (error) {
      return { data: content };
    }
  }
}

class CachePlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.config = {
      // Driver configuration
      driver: options.driver || "s3",
      config: {
        ttl: options.ttl,
        maxSize: options.maxSize,
        maxMemoryBytes: options.maxMemoryBytes,
        maxMemoryPercent: options.maxMemoryPercent,
        ...options.config
        // Driver-specific config (can override ttl/maxSize/maxMemoryBytes/maxMemoryPercent)
      },
      // Resource filtering
      include: options.include || null,
      // Array of resource names to cache (null = all)
      exclude: options.exclude || [],
      // Array of resource names to exclude
      // Partition settings
      includePartitions: options.includePartitions !== false,
      partitionStrategy: options.partitionStrategy || "hierarchical",
      partitionAware: options.partitionAware !== false,
      trackUsage: options.trackUsage !== false,
      preloadRelated: options.preloadRelated !== false,
      // Retry configuration
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 100,
      // ms
      // Logging
      verbose: options.verbose || false
    };
  }
  async onInstall() {
    if (this.config.driver && typeof this.config.driver === "object") {
      this.driver = this.config.driver;
    } else if (this.config.driver === "memory") {
      this.driver = new MemoryCache(this.config.config);
    } else if (this.config.driver === "filesystem") {
      if (this.config.partitionAware) {
        this.driver = new PartitionAwareFilesystemCache({
          partitionStrategy: this.config.partitionStrategy,
          trackUsage: this.config.trackUsage,
          preloadRelated: this.config.preloadRelated,
          ...this.config.config
        });
      } else {
        this.driver = new FilesystemCache(this.config.config);
      }
    } else {
      this.driver = new S3Cache({
        client: this.database.client,
        ...this.config.config
      });
    }
    this.installDatabaseHooks();
    this.installResourceHooks();
  }
  /**
   * Install database hooks to handle resource creation/updates
   */
  installDatabaseHooks() {
    this.database.addHook("afterCreateResource", async ({ resource }) => {
      if (this.shouldCacheResource(resource.name)) {
        this.installResourceHooksForResource(resource);
      }
    });
  }
  async onStart() {
  }
  async onStop() {
  }
  // Remove the old installDatabaseProxy method
  installResourceHooks() {
    for (const resource of Object.values(this.database.resources)) {
      if (!this.shouldCacheResource(resource.name)) {
        continue;
      }
      this.installResourceHooksForResource(resource);
    }
  }
  shouldCacheResource(resourceName) {
    const resourceMetadata = this.database.savedMetadata?.resources?.[resourceName];
    if (resourceMetadata?.createdBy && resourceMetadata.createdBy !== "user" && !this.config.include) {
      return false;
    }
    if (resourceName.startsWith("plg_") && !this.config.include) {
      return false;
    }
    if (this.config.exclude.includes(resourceName)) {
      return false;
    }
    if (this.config.include && !this.config.include.includes(resourceName)) {
      return false;
    }
    return true;
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
    if (this.driver instanceof PartitionAwareFilesystemCache) {
      resource.clearPartitionCache = async (partition, partitionValues = {}) => {
        return await this.driver.clearPartition(resource.name, partition, partitionValues);
      };
      resource.getPartitionCacheStats = async (partition = null) => {
        return await this.driver.getPartitionStats(resource.name, partition);
      };
      resource.getCacheRecommendations = async () => {
        return await this.driver.getCacheRecommendations(resource.name);
      };
      resource.warmPartitionCache = async (partitions = [], options = {}) => {
        return await this.driver.warmPartitionCache(resource.name, { partitions, ...options });
      };
    }
    const cacheMethods = [
      "count",
      "listIds",
      "getMany",
      "getAll",
      "page",
      "list",
      "get",
      "exists",
      "content",
      "hasContent",
      "query",
      "getFromPartition"
    ];
    for (const method of cacheMethods) {
      resource.useMiddleware(method, async (ctx, next) => {
        let skipCache = false;
        const lastArg = ctx.args[ctx.args.length - 1];
        if (lastArg && typeof lastArg === "object" && lastArg.skipCache === true) {
          skipCache = true;
        }
        if (skipCache) {
          return await next();
        }
        let key;
        if (method === "getMany") {
          key = await resource.cacheKeyFor({ action: method, params: { ids: ctx.args[0] } });
        } else if (method === "page") {
          const { offset, size, partition, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({ action: method, params: { offset, size }, partition, partitionValues });
        } else if (method === "list" || method === "listIds" || method === "count") {
          const { partition, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({ action: method, partition, partitionValues });
        } else if (method === "query") {
          const filter = ctx.args[0] || {};
          const options = ctx.args[1] || {};
          key = await resource.cacheKeyFor({
            action: method,
            params: { filter, options: { limit: options.limit, offset: options.offset } },
            partition: options.partition,
            partitionValues: options.partitionValues
          });
        } else if (method === "getFromPartition") {
          const { id, partitionName, partitionValues } = ctx.args[0] || {};
          key = await resource.cacheKeyFor({
            action: method,
            params: { id, partitionName },
            partition: partitionName,
            partitionValues
          });
        } else if (method === "getAll") {
          key = await resource.cacheKeyFor({ action: method });
        } else if (["get", "exists", "content", "hasContent"].includes(method)) {
          key = await resource.cacheKeyFor({ action: method, params: { id: ctx.args[0] } });
        }
        if (this.driver instanceof PartitionAwareFilesystemCache) {
          let partition, partitionValues;
          if (method === "list" || method === "listIds" || method === "count" || method === "page") {
            const args = ctx.args[0] || {};
            partition = args.partition;
            partitionValues = args.partitionValues;
          } else if (method === "query") {
            const options = ctx.args[1] || {};
            partition = options.partition;
            partitionValues = options.partitionValues;
          } else if (method === "getFromPartition") {
            const { partitionName, partitionValues: pValues } = ctx.args[0] || {};
            partition = partitionName;
            partitionValues = pValues;
          }
          const [ok, err, result] = await tryFn(() => resource.cache._get(key, {
            resource: resource.name,
            action: method,
            partition,
            partitionValues
          }));
          if (ok && result !== null && result !== void 0) return result;
          if (!ok && err.name !== "NoSuchKey") throw err;
          const freshResult = await next();
          await resource.cache._set(key, freshResult, {
            resource: resource.name,
            action: method,
            partition,
            partitionValues
          });
          return freshResult;
        } else {
          const [ok, err, result] = await tryFn(() => resource.cache.get(key));
          if (ok && result !== null && result !== void 0) return result;
          if (!ok && err.name !== "NoSuchKey") throw err;
          const freshResult = await next();
          await resource.cache.set(key, freshResult);
          return freshResult;
        }
      });
    }
    const writeMethods = ["insert", "update", "delete", "deleteMany", "setContent", "deleteContent", "replace"];
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
            const [ok, err, full] = await tryFn(() => resource.get(ctx.args[0]));
            if (ok && full) data = full;
          }
          await this.clearCacheForResource(resource, data);
        } else if (method === "setContent" || method === "deleteContent") {
          const id = ctx.args[0]?.id || ctx.args[0];
          await this.clearCacheForResource(resource, { id });
        } else if (method === "replace") {
          const id = ctx.args[0];
          await this.clearCacheForResource(resource, { id, ...ctx.args[1] });
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
    if (data && data.id) {
      const itemSpecificMethods = ["get", "exists", "content", "hasContent"];
      for (const method of itemSpecificMethods) {
        const specificKey = await this.generateCacheKey(resource, method, { id: data.id });
        const [ok2, err2] = await this.clearCacheWithRetry(resource.cache, specificKey);
        if (!ok2) {
          this.emit("cache_clear_error", {
            resource: resource.name,
            method,
            id: data.id,
            error: err2.message
          });
          if (this.config.verbose) {
            console.warn(`[CachePlugin] Failed to clear ${method} cache for ${resource.name}:${data.id}:`, err2.message);
          }
        }
      }
      if (this.config.includePartitions === true && resource.config?.partitions && Object.keys(resource.config.partitions).length > 0) {
        const partitionValues = this.getPartitionValues(data, resource);
        for (const [partitionName, values] of Object.entries(partitionValues)) {
          if (values && Object.keys(values).length > 0 && Object.values(values).some((v) => v !== null && v !== void 0)) {
            const partitionKeyPrefix = path.join(keyPrefix, `partition=${partitionName}`);
            const [ok2, err2] = await this.clearCacheWithRetry(resource.cache, partitionKeyPrefix);
            if (!ok2) {
              this.emit("cache_clear_error", {
                resource: resource.name,
                partition: partitionName,
                error: err2.message
              });
              if (this.config.verbose) {
                console.warn(`[CachePlugin] Failed to clear partition cache for ${resource.name}/${partitionName}:`, err2.message);
              }
            }
          }
        }
      }
    }
    const [ok, err] = await this.clearCacheWithRetry(resource.cache, keyPrefix);
    if (!ok) {
      this.emit("cache_clear_error", {
        resource: resource.name,
        type: "broad",
        error: err.message
      });
      if (this.config.verbose) {
        console.warn(`[CachePlugin] Failed to clear broad cache for ${resource.name}, trying specific methods:`, err.message);
      }
      const aggregateMethods = ["count", "list", "listIds", "getAll", "page", "query"];
      for (const method of aggregateMethods) {
        await this.clearCacheWithRetry(resource.cache, `${keyPrefix}/action=${method}`);
        await this.clearCacheWithRetry(resource.cache, `resource=${resource.name}/action=${method}`);
      }
    }
  }
  async clearCacheWithRetry(cache, key) {
    let lastError;
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      const [ok, err] = await tryFn(() => cache.clear(key));
      if (ok) {
        return [true, null];
      }
      lastError = err;
      if (err.name === "NoSuchKey" || err.code === "NoSuchKey") {
        return [true, null];
      }
      if (attempt < this.config.retryAttempts - 1) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [false, lastError];
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
      const paramsHash = this.hashParams(params);
      keyParts.push(paramsHash);
    }
    return path.join(...keyParts) + ".json.gz";
  }
  hashParams(params) {
    const serialized = jsonStableStringify(params) || "empty";
    return crypto.createHash("md5").update(serialized).digest("hex").substring(0, 16);
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
      throw new CacheError("Resource not found for cache warming", {
        operation: "warmCache",
        driver: this.driver?.constructor.name,
        resourceName,
        availableResources: Object.keys(this.database.resources),
        suggestion: "Check resource name spelling or ensure resource has been created"
      });
    }
    const { includePartitions = true, sampleSize = 100 } = options;
    if (this.driver instanceof PartitionAwareFilesystemCache && resource.warmPartitionCache) {
      const partitionNames = resource.config.partitions ? Object.keys(resource.config.partitions) : [];
      return await resource.warmPartitionCache(partitionNames, options);
    }
    let offset = 0;
    const pageSize = 100;
    const sampledRecords = [];
    while (sampledRecords.length < sampleSize) {
      const [ok, err, pageResult] = await tryFn(() => resource.page({ offset, size: pageSize }));
      if (!ok || !pageResult) {
        break;
      }
      const pageItems = Array.isArray(pageResult) ? pageResult : pageResult.items || [];
      if (pageItems.length === 0) {
        break;
      }
      sampledRecords.push(...pageItems);
      offset += pageSize;
    }
    if (includePartitions && resource.config.partitions && sampledRecords.length > 0) {
      for (const [partitionName, partitionDef] of Object.entries(resource.config.partitions)) {
        if (partitionDef.fields) {
          const partitionValuesSet = /* @__PURE__ */ new Set();
          for (const record of sampledRecords) {
            const values = this.getPartitionValues(record, resource);
            if (values[partitionName]) {
              partitionValuesSet.add(JSON.stringify(values[partitionName]));
            }
          }
          for (const partitionValueStr of partitionValuesSet) {
            const partitionValues = JSON.parse(partitionValueStr);
            await tryFn(() => resource.list({ partition: partitionName, partitionValues }));
          }
        }
      }
    }
    return {
      resourceName,
      recordsSampled: sampledRecords.length,
      partitionsWarmed: includePartitions && resource.config.partitions ? Object.keys(resource.config.partitions).length : 0
    };
  }
  async analyzeCacheUsage() {
    if (!(this.driver instanceof PartitionAwareFilesystemCache)) {
      return { message: "Cache usage analysis is only available with PartitionAwareFilesystemCache" };
    }
    const analysis = {
      totalResources: Object.keys(this.database.resources).length,
      resourceStats: {},
      recommendations: {},
      summary: {
        mostUsedPartitions: [],
        leastUsedPartitions: [],
        suggestedOptimizations: []
      }
    };
    for (const [resourceName, resource] of Object.entries(this.database.resources)) {
      if (!this.shouldCacheResource(resourceName)) {
        continue;
      }
      try {
        analysis.resourceStats[resourceName] = await this.driver.getPartitionStats(resourceName);
        analysis.recommendations[resourceName] = await this.driver.getCacheRecommendations(resourceName);
      } catch (error) {
        analysis.resourceStats[resourceName] = { error: error.message };
      }
    }
    const allRecommendations = Object.values(analysis.recommendations).flat();
    analysis.summary.mostUsedPartitions = allRecommendations.filter((r) => r.recommendation === "preload").sort((a, b) => b.priority - a.priority).slice(0, 5);
    analysis.summary.leastUsedPartitions = allRecommendations.filter((r) => r.recommendation === "archive").slice(0, 5);
    analysis.summary.suggestedOptimizations = [
      `Consider preloading ${analysis.summary.mostUsedPartitions.length} high-usage partitions`,
      `Archive ${analysis.summary.leastUsedPartitions.length} unused partitions`,
      `Monitor cache hit rates for partition efficiency`
    ];
    return analysis;
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

function createConfig(options, detectedTimezone) {
  const consolidation = options.consolidation || {};
  const locks = options.locks || {};
  const gc = options.garbageCollection || {};
  const analytics = options.analytics || {};
  const batch = options.batch || {};
  const lateArrivals = options.lateArrivals || {};
  const checkpoints = options.checkpoints || {};
  return {
    // Cohort (timezone)
    cohort: {
      timezone: options.cohort?.timezone || detectedTimezone
    },
    // Reducer function
    reducer: options.reducer || ((transactions) => {
      let baseValue = 0;
      for (const t of transactions) {
        if (t.operation === "set") {
          baseValue = t.value;
        } else if (t.operation === "add") {
          baseValue += t.value;
        } else if (t.operation === "sub") {
          baseValue -= t.value;
        }
      }
      return baseValue;
    }),
    // Consolidation settings
    consolidationInterval: consolidation.interval ?? 300,
    consolidationConcurrency: consolidation.concurrency ?? 5,
    consolidationWindow: consolidation.window ?? 24,
    autoConsolidate: consolidation.auto !== false,
    mode: consolidation.mode || "async",
    // ✅ Performance tuning - Mark applied concurrency (default 50, up from 10)
    markAppliedConcurrency: consolidation.markAppliedConcurrency ?? 50,
    // ✅ Performance tuning - Recalculate concurrency (default 50, up from 10)
    recalculateConcurrency: consolidation.recalculateConcurrency ?? 50,
    // Late arrivals
    lateArrivalStrategy: lateArrivals.strategy || "warn",
    // Batch transactions
    batchTransactions: batch.enabled || false,
    batchSize: batch.size || 100,
    // Locks
    lockTimeout: locks.timeout || 300,
    // Garbage collection
    transactionRetention: gc.retention ?? 30,
    gcInterval: gc.interval ?? 86400,
    // Analytics
    enableAnalytics: analytics.enabled || false,
    analyticsConfig: {
      periods: analytics.periods || ["hour", "day", "month"],
      metrics: analytics.metrics || ["count", "sum", "avg", "min", "max"],
      rollupStrategy: analytics.rollupStrategy || "incremental",
      retentionDays: analytics.retentionDays ?? 365
    },
    // Checkpoints
    enableCheckpoints: checkpoints.enabled !== false,
    checkpointStrategy: checkpoints.strategy || "hourly",
    checkpointRetention: checkpoints.retention ?? 90,
    checkpointThreshold: checkpoints.threshold ?? 1e3,
    deleteConsolidatedTransactions: checkpoints.deleteConsolidated !== false,
    autoCheckpoint: checkpoints.auto !== false,
    // Debug
    verbose: options.verbose || false
  };
}
function validateResourcesConfig(resources) {
  if (!resources || typeof resources !== "object") {
    throw new Error(
      "EventualConsistencyPlugin requires 'resources' option.\nExample: { resources: { urls: ['clicks', 'views'], posts: ['likes'] } }"
    );
  }
  for (const [resourceName, fields] of Object.entries(resources)) {
    if (!Array.isArray(fields)) {
      throw new Error(
        `EventualConsistencyPlugin resources.${resourceName} must be an array of field names`
      );
    }
  }
}
function logConfigWarnings(config) {
  if (config.batchTransactions && !config.verbose) {
    console.warn(
      `[EventualConsistency] WARNING: batch.enabled is true. This stores transactions in memory and will lose data if container crashes. Not recommended for distributed/production environments.`
    );
  }
  if (!config.enableCheckpoints && !config.verbose) {
    console.warn(
      `[EventualConsistency] INFO: checkpoints.enabled is false. Checkpoints improve performance in high-volume scenarios by creating snapshots. Consider enabling for production use.`
    );
  }
}
function logInitialization(config, fieldHandlers, timezoneAutoDetected) {
  if (!config.verbose) return;
  const totalFields = Array.from(fieldHandlers.values()).reduce((sum, handlers) => sum + handlers.size, 0);
  console.log(
    `[EventualConsistency] Initialized with ${fieldHandlers.size} resource(s), ${totalFields} field(s) total`
  );
  if (timezoneAutoDetected) {
    console.log(
      `[EventualConsistency] Using timezone: ${config.cohort.timezone} (${process.env.TZ ? "from TZ env var" : "default UTC"})`
    );
  }
}

function detectTimezone() {
  if (process.env.TZ) {
    return process.env.TZ;
  }
  return "UTC";
}
function getTimezoneOffset(timezone, verbose = false) {
  try {
    const now = /* @__PURE__ */ new Date();
    const utcDate = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    return tzDate.getTime() - utcDate.getTime();
  } catch (err) {
    const offsets = {
      "UTC": 0,
      "America/New_York": -5 * 36e5,
      "America/Chicago": -6 * 36e5,
      "America/Denver": -7 * 36e5,
      "America/Los_Angeles": -8 * 36e5,
      "America/Sao_Paulo": -3 * 36e5,
      "Europe/London": 0,
      "Europe/Paris": 1 * 36e5,
      "Europe/Berlin": 1 * 36e5,
      "Asia/Tokyo": 9 * 36e5,
      "Asia/Shanghai": 8 * 36e5,
      "Australia/Sydney": 10 * 36e5
    };
    if (verbose && !offsets[timezone]) {
      console.warn(
        `[EventualConsistency] Unknown timezone '${timezone}', using UTC. Consider using a valid IANA timezone (e.g., 'America/New_York')`
      );
    }
    return offsets[timezone] || 0;
  }
}
function getISOWeek(date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursday = new Date(yearStart.valueOf());
  if (yearStart.getUTCDay() !== 4) {
    firstThursday.setUTCDate(yearStart.getUTCDate() + (4 - yearStart.getUTCDay() + 7) % 7);
  }
  const weekNumber = 1 + Math.round((target - firstThursday) / 6048e5);
  return {
    year: target.getUTCFullYear(),
    week: weekNumber
  };
}
function getCohortInfo(date, timezone, verbose = false) {
  const offset = getTimezoneOffset(timezone, verbose);
  const localDate = new Date(date.getTime() + offset);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");
  const hour = String(localDate.getHours()).padStart(2, "0");
  const { year: weekYear, week: weekNumber } = getISOWeek(localDate);
  const week = `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
  return {
    date: `${year}-${month}-${day}`,
    hour: `${year}-${month}-${day}T${hour}`,
    // ISO-like format for hour partition
    week,
    // ISO 8601 week format (e.g., '2025-W42')
    month: `${year}-${month}`
  };
}
function createSyntheticSetTransaction(currentValue) {
  return {
    id: "__synthetic__",
    operation: "set",
    value: currentValue,
    timestamp: (/* @__PURE__ */ new Date(0)).toISOString(),
    synthetic: true
  };
}
function createFieldHandler(resourceName, fieldName) {
  return {
    resource: resourceName,
    field: fieldName,
    transactionResource: null,
    targetResource: null,
    analyticsResource: null,
    lockResource: null,
    checkpointResource: null,
    consolidationTimer: null,
    gcTimer: null,
    pendingTransactions: /* @__PURE__ */ new Map(),
    deferredSetup: false
  };
}
function validateNestedPath(resource, fieldPath) {
  const parts = fieldPath.split(".");
  const rootField = parts[0];
  if (!resource.attributes || !resource.attributes[rootField]) {
    return {
      valid: false,
      rootField,
      fullPath: fieldPath,
      error: `Root field "${rootField}" not found in resource attributes`
    };
  }
  if (parts.length === 1) {
    return { valid: true, rootField, fullPath: fieldPath };
  }
  let current = resource.attributes[rootField];
  let foundJson = false;
  let levelsAfterJson = 0;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (foundJson) {
      levelsAfterJson++;
      if (levelsAfterJson > 1) {
        return {
          valid: false,
          rootField,
          fullPath: fieldPath,
          error: `Path "${fieldPath}" exceeds 1 level after 'json' field. Maximum nesting after 'json' is 1 level.`
        };
      }
      continue;
    }
    if (typeof current === "string") {
      if (current === "json" || current.startsWith("json|")) {
        foundJson = true;
        levelsAfterJson++;
        if (levelsAfterJson > 1) {
          return {
            valid: false,
            rootField,
            fullPath: fieldPath,
            error: `Path "${fieldPath}" exceeds 1 level after 'json' field`
          };
        }
        continue;
      }
      return {
        valid: false,
        rootField,
        fullPath: fieldPath,
        error: `Field "${parts.slice(0, i).join(".")}" is type "${current}" and cannot be nested`
      };
    }
    if (typeof current === "object") {
      if (current.$$type) {
        const type = current.$$type;
        if (type === "json" || type.includes("json")) {
          foundJson = true;
          levelsAfterJson++;
          continue;
        }
        if (type !== "object" && !type.includes("object")) {
          return {
            valid: false,
            rootField,
            fullPath: fieldPath,
            error: `Field "${parts.slice(0, i).join(".")}" is type "${type}" and cannot be nested`
          };
        }
      }
      if (!current[part]) {
        return {
          valid: false,
          rootField,
          fullPath: fieldPath,
          error: `Field "${part}" not found in "${parts.slice(0, i).join(".")}"`
        };
      }
      current = current[part];
    } else {
      return {
        valid: false,
        rootField,
        fullPath: fieldPath,
        error: `Invalid structure at "${parts.slice(0, i).join(".")}"`
      };
    }
  }
  return { valid: true, rootField, fullPath: fieldPath };
}
function resolveFieldAndPlugin(resource, field, value) {
  if (!resource._eventualConsistencyPlugins) {
    throw new Error(`No eventual consistency plugins configured for this resource`);
  }
  if (field.includes(".")) {
    const validation = validateNestedPath(resource, field);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    const rootField = validation.rootField;
    const fieldPlugin2 = resource._eventualConsistencyPlugins[rootField];
    if (!fieldPlugin2) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(", ");
      throw new Error(
        `No eventual consistency plugin found for root field "${rootField}". Available fields: ${availableFields}`
      );
    }
    return {
      field: rootField,
      // Root field for plugin lookup
      fieldPath: field,
      // Full path for nested access
      value,
      plugin: fieldPlugin2
    };
  }
  const fieldPlugin = resource._eventualConsistencyPlugins[field];
  if (!fieldPlugin) {
    const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(", ");
    throw new Error(
      `No eventual consistency plugin found for field "${field}". Available fields: ${availableFields}`
    );
  }
  return { field, fieldPath: field, value, plugin: fieldPlugin };
}
function groupByCohort(transactions, cohortField) {
  const groups = {};
  for (const txn of transactions) {
    const cohort = txn[cohortField];
    if (!cohort) continue;
    if (!groups[cohort]) {
      groups[cohort] = [];
    }
    groups[cohort].push(txn);
  }
  return groups;
}
function ensureCohortHour(transaction, timezone = "UTC", verbose = false) {
  if (transaction.cohortHour) {
    return transaction;
  }
  if (transaction.timestamp) {
    const date = new Date(transaction.timestamp);
    const cohortInfo = getCohortInfo(date, timezone, verbose);
    if (verbose) {
      console.log(
        `[EventualConsistency] Transaction ${transaction.id} missing cohortHour, calculated from timestamp: ${cohortInfo.hour}`
      );
    }
    transaction.cohortHour = cohortInfo.hour;
    if (!transaction.cohortWeek) {
      transaction.cohortWeek = cohortInfo.week;
    }
    if (!transaction.cohortMonth) {
      transaction.cohortMonth = cohortInfo.month;
    }
  } else if (verbose) {
    console.warn(
      `[EventualConsistency] Transaction ${transaction.id} missing both cohortHour and timestamp, cannot calculate cohort`
    );
  }
  return transaction;
}
function ensureCohortHours(transactions, timezone = "UTC", verbose = false) {
  if (!transactions || !Array.isArray(transactions)) {
    return transactions;
  }
  return transactions.map((txn) => ensureCohortHour(txn, timezone, verbose));
}

function createPartitionConfig() {
  const partitions = {
    // Composite partition by originalId + applied status
    // This is THE MOST CRITICAL optimization for consolidation!
    // Why: Consolidation always queries { originalId, applied: false }
    // Without this: Reads ALL transactions (applied + pending) and filters manually
    // With this: Reads ONLY pending transactions - can be 1000x faster!
    byOriginalIdAndApplied: {
      fields: {
        originalId: "string",
        applied: "boolean"
      }
    },
    // Partition by time cohorts for batch consolidation across many records
    byHour: {
      fields: {
        cohortHour: "string"
      }
    },
    byDay: {
      fields: {
        cohortDate: "string"
      }
    },
    byWeek: {
      fields: {
        cohortWeek: "string"
      }
    },
    byMonth: {
      fields: {
        cohortMonth: "string"
      }
    }
  };
  return partitions;
}

async function createTransaction(handler, data, config) {
  const now = /* @__PURE__ */ new Date();
  const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);
  const watermarkMs = config.consolidationWindow * 60 * 60 * 1e3;
  const watermarkTime = now.getTime() - watermarkMs;
  const cohortHourDate = /* @__PURE__ */ new Date(cohortInfo.hour + ":00:00Z");
  if (cohortHourDate.getTime() < watermarkTime) {
    const hoursLate = Math.floor((now.getTime() - cohortHourDate.getTime()) / (60 * 60 * 1e3));
    if (config.lateArrivalStrategy === "ignore") {
      if (config.verbose) {
        console.warn(
          `[EventualConsistency] Late arrival ignored: transaction for ${cohortInfo.hour} is ${hoursLate}h late (watermark: ${config.consolidationWindow}h)`
        );
      }
      return null;
    } else if (config.lateArrivalStrategy === "warn") {
      console.warn(
        `[EventualConsistency] Late arrival detected: transaction for ${cohortInfo.hour} is ${hoursLate}h late (watermark: ${config.consolidationWindow}h). Processing anyway, but consolidation may not pick it up.`
      );
    }
  }
  const transaction = {
    id: idGenerator(),
    originalId: data.originalId,
    field: handler.field,
    value: data.value || 0,
    operation: data.operation || "set",
    timestamp: now.toISOString(),
    cohortDate: cohortInfo.date,
    cohortHour: cohortInfo.hour,
    cohortWeek: cohortInfo.week,
    cohortMonth: cohortInfo.month,
    source: data.source || "unknown",
    applied: false
  };
  if (config.batchTransactions) {
    handler.pendingTransactions.set(transaction.id, transaction);
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${handler.resource}.${handler.field} - Transaction batched: ${data.operation} ${data.value} for ${data.originalId} (batch: ${handler.pendingTransactions.size}/${config.batchSize})`
      );
    }
    if (handler.pendingTransactions.size >= config.batchSize) {
      await flushPendingTransactions(handler);
    }
  } else {
    await handler.transactionResource.insert(transaction);
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${handler.resource}.${handler.field} - Transaction created: ${data.operation} ${data.value} for ${data.originalId} (cohort: ${cohortInfo.hour}, applied: false)`
      );
    }
  }
  return transaction;
}
async function flushPendingTransactions(handler) {
  if (handler.pendingTransactions.size === 0) return;
  const transactions = Array.from(handler.pendingTransactions.values());
  try {
    await Promise.all(
      transactions.map(
        (transaction) => handler.transactionResource.insert(transaction)
      )
    );
    handler.pendingTransactions.clear();
  } catch (error) {
    console.error("Failed to flush pending transactions:", error);
    throw error;
  }
}

function startConsolidationTimer(handler, resourceName, fieldName, runConsolidationCallback, config) {
  const intervalMs = config.consolidationInterval * 1e3;
  if (config.verbose) {
    const nextRun = new Date(Date.now() + intervalMs);
    console.log(
      `[EventualConsistency] ${resourceName}.${fieldName} - Consolidation timer started. Next run at ${nextRun.toISOString()} (every ${config.consolidationInterval}s)`
    );
  }
  handler.consolidationTimer = setInterval(async () => {
    await runConsolidationCallback(handler, resourceName, fieldName);
  }, intervalMs);
  return handler.consolidationTimer;
}
async function runConsolidation(transactionResource, consolidateRecordFn, emitFn, config) {
  const startTime = Date.now();
  if (config.verbose) {
    console.log(
      `[EventualConsistency] ${config.resource}.${config.field} - Starting consolidation run at ${(/* @__PURE__ */ new Date()).toISOString()}`
    );
  }
  try {
    const now = /* @__PURE__ */ new Date();
    const hoursToCheck = config.consolidationWindow || 24;
    const cohortHours = [];
    for (let i = 0; i < hoursToCheck; i++) {
      const date = new Date(now.getTime() - i * 60 * 60 * 1e3);
      const cohortInfo = getCohortInfo(date, config.cohort.timezone, config.verbose);
      cohortHours.push(cohortInfo.hour);
    }
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Querying ${hoursToCheck} hour partitions for pending transactions...`
      );
    }
    const transactionsByHour = await Promise.all(
      cohortHours.map(async (cohortHour) => {
        const [ok, err, txns] = await tryFn(
          () => transactionResource.query({
            cohortHour,
            applied: false
          })
        );
        return ok ? txns : [];
      })
    );
    const transactions = transactionsByHour.flat();
    if (transactions.length === 0) {
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - No pending transactions found. Next run in ${config.consolidationInterval}s`
        );
      }
      return;
    }
    const uniqueIds = [...new Set(transactions.map((t) => t.originalId))];
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Found ${transactions.length} pending transactions for ${uniqueIds.length} records. Consolidating with concurrency=${config.consolidationConcurrency}...`
      );
    }
    const { results, errors } = await promisePool.PromisePool.for(uniqueIds).withConcurrency(config.consolidationConcurrency).process(async (id) => {
      return await consolidateRecordFn(id);
    });
    const duration = Date.now() - startTime;
    if (errors && errors.length > 0) {
      console.error(
        `[EventualConsistency] ${config.resource}.${config.field} - Consolidation completed with ${errors.length} errors in ${duration}ms:`,
        errors
      );
    }
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Consolidation complete: ${results.length} records consolidated in ${duration}ms (${errors.length} errors). Next run in ${config.consolidationInterval}s`
      );
    }
    if (emitFn) {
      emitFn("eventual-consistency.consolidated", {
        resource: config.resource,
        field: config.field,
        recordCount: uniqueIds.length,
        successCount: results.length,
        errorCount: errors.length,
        duration
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[EventualConsistency] ${config.resource}.${config.field} - Consolidation error after ${duration}ms:`,
      error
    );
    if (emitFn) {
      emitFn("eventual-consistency.consolidation-error", error);
    }
  }
}
async function consolidateRecord(originalId, transactionResource, targetResource, storage, analyticsResource, updateAnalyticsFn, config) {
  const lockKey = `consolidation-${config.resource}-${config.field}-${originalId}`;
  const lock = await storage.acquireLock(lockKey, {
    ttl: config.lockTimeout || 30,
    timeout: 0,
    // Don't wait if locked
    workerId: process.pid ? String(process.pid) : "unknown"
  });
  if (!lock) {
    if (config.verbose) {
      console.log(`[EventualConsistency] Lock for ${originalId} already held, skipping`);
    }
    const [recordOk, recordErr, record] = await tryFn(
      () => targetResource.get(originalId)
    );
    return recordOk && record ? record[config.field] || 0 : 0;
  }
  try {
    const [ok, err, transactions] = await tryFn(
      () => transactionResource.query({
        originalId,
        applied: false
      })
    );
    if (!ok || !transactions || transactions.length === 0) {
      const [recordOk2, recordErr2, record2] = await tryFn(
        () => targetResource.get(originalId)
      );
      const currentValue2 = recordOk2 && record2 ? record2[config.field] || 0 : 0;
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - No pending transactions for ${originalId}, skipping`
        );
      }
      return currentValue2;
    }
    const [appliedOk, appliedErr, appliedTransactions] = await tryFn(
      () => transactionResource.query({
        originalId,
        applied: true
      })
    );
    let currentValue = 0;
    if (appliedOk && appliedTransactions && appliedTransactions.length > 0) {
      const [recordExistsOk, recordExistsErr, recordExists] = await tryFn(
        () => targetResource.get(originalId)
      );
      if (!recordExistsOk || !recordExists) {
        if (config.verbose) {
          console.log(
            `[EventualConsistency] ${config.resource}.${config.field} - Record ${originalId} doesn't exist, deleting ${appliedTransactions.length} old applied transactions`
          );
        }
        const { results, errors } = await promisePool.PromisePool.for(appliedTransactions).withConcurrency(10).process(async (txn) => {
          const [deleted] = await tryFn(() => transactionResource.delete(txn.id));
          return deleted;
        });
        if (config.verbose && errors && errors.length > 0) {
          console.warn(
            `[EventualConsistency] ${config.resource}.${config.field} - Failed to delete ${errors.length} old applied transactions`
          );
        }
        currentValue = 0;
        appliedTransactions.length = 0;
      } else {
        appliedTransactions.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const hasSetInApplied = appliedTransactions.some((t) => t.operation === "set");
        if (!hasSetInApplied) {
          const recordValue = recordExists[config.field] || 0;
          if (typeof recordValue === "number") {
            let appliedDelta = 0;
            for (const t of appliedTransactions) {
              if (t.operation === "add") appliedDelta += t.value;
              else if (t.operation === "sub") appliedDelta -= t.value;
            }
            const baseValue = recordValue - appliedDelta;
            const hasExistingAnchor = appliedTransactions.some((t) => t.source === "anchor");
            if (baseValue !== 0 && typeof baseValue === "number" && !hasExistingAnchor) {
              const firstTransactionDate = new Date(appliedTransactions[0].timestamp);
              const cohortInfo = getCohortInfo(firstTransactionDate, config.cohort.timezone, config.verbose);
              const anchorTransaction = {
                id: idGenerator(),
                originalId,
                field: config.field,
                fieldPath: config.field,
                // Add fieldPath for consistency
                value: baseValue,
                operation: "set",
                timestamp: new Date(firstTransactionDate.getTime() - 1).toISOString(),
                // 1ms before first txn to ensure it's first
                cohortDate: cohortInfo.date,
                cohortHour: cohortInfo.hour,
                cohortMonth: cohortInfo.month,
                source: "anchor",
                applied: true
              };
              await transactionResource.insert(anchorTransaction);
              appliedTransactions.unshift(anchorTransaction);
            }
          }
        }
        currentValue = config.reducer(appliedTransactions);
      }
    } else {
      const [recordOk2, recordErr2, record2] = await tryFn(
        () => targetResource.get(originalId)
      );
      currentValue = recordOk2 && record2 ? record2[config.field] || 0 : 0;
      if (currentValue !== 0 && typeof currentValue === "number") {
        let anchorTimestamp;
        if (transactions && transactions.length > 0) {
          const firstPendingDate = new Date(transactions[0].timestamp);
          anchorTimestamp = new Date(firstPendingDate.getTime() - 1).toISOString();
        } else {
          anchorTimestamp = (/* @__PURE__ */ new Date()).toISOString();
        }
        const cohortInfo = getCohortInfo(new Date(anchorTimestamp), config.cohort.timezone, config.verbose);
        const anchorTransaction = {
          id: idGenerator(),
          originalId,
          field: config.field,
          fieldPath: config.field,
          // Add fieldPath for consistency
          value: currentValue,
          operation: "set",
          timestamp: anchorTimestamp,
          cohortDate: cohortInfo.date,
          cohortHour: cohortInfo.hour,
          cohortMonth: cohortInfo.month,
          source: "anchor",
          applied: true
        };
        await transactionResource.insert(anchorTransaction);
        if (config.verbose) {
          console.log(
            `[EventualConsistency] ${config.resource}.${config.field} - Created anchor transaction for ${originalId} with base value ${currentValue}`
          );
        }
      }
    }
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Consolidating ${originalId}: ${transactions.length} pending transactions (current: ${currentValue} from ${appliedOk && appliedTransactions?.length > 0 ? "applied transactions" : "record"})`
      );
    }
    transactions.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const transactionsByPath = {};
    for (const txn of transactions) {
      const path = txn.fieldPath || txn.field || config.field;
      if (!transactionsByPath[path]) {
        transactionsByPath[path] = [];
      }
      transactionsByPath[path].push(txn);
    }
    const appliedByPath = {};
    if (appliedOk && appliedTransactions && appliedTransactions.length > 0) {
      for (const txn of appliedTransactions) {
        const path = txn.fieldPath || txn.field || config.field;
        if (!appliedByPath[path]) {
          appliedByPath[path] = [];
        }
        appliedByPath[path].push(txn);
      }
    }
    const consolidatedValues = {};
    const lodash = await import('lodash-es');
    const [currentRecordOk, currentRecordErr, currentRecord] = await tryFn(
      () => targetResource.get(originalId)
    );
    for (const [fieldPath, pathTransactions] of Object.entries(transactionsByPath)) {
      let pathCurrentValue = 0;
      if (appliedByPath[fieldPath] && appliedByPath[fieldPath].length > 0) {
        appliedByPath[fieldPath].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        pathCurrentValue = config.reducer(appliedByPath[fieldPath]);
      } else {
        if (currentRecordOk && currentRecord) {
          const recordValue = lodash.get(currentRecord, fieldPath, 0);
          if (typeof recordValue === "number") {
            pathCurrentValue = recordValue;
          }
        }
      }
      if (pathCurrentValue !== 0) {
        pathTransactions.unshift(createSyntheticSetTransaction(pathCurrentValue));
      }
      const pathConsolidatedValue = config.reducer(pathTransactions);
      consolidatedValues[fieldPath] = pathConsolidatedValue;
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${fieldPath} - ${originalId}: ${pathCurrentValue} \u2192 ${pathConsolidatedValue} (${pathTransactions.length - (pathCurrentValue !== 0 ? 1 : 0)} pending txns)`
        );
      }
    }
    if (config.verbose) {
      console.log(
        `\u{1F525} [DEBUG] BEFORE targetResource.update() {
  originalId: '${originalId}',
  consolidatedValues: ${JSON.stringify(consolidatedValues, null, 2)}
}`
      );
    }
    const [recordOk, recordErr, record] = await tryFn(
      () => targetResource.get(originalId)
    );
    let updateOk, updateErr, updateResult;
    if (!recordOk || !record) {
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - Record ${originalId} doesn't exist yet. Will attempt update anyway (expected to fail).`
        );
      }
      const minimalRecord = { id: originalId };
      for (const [fieldPath, value] of Object.entries(consolidatedValues)) {
        lodash.set(minimalRecord, fieldPath, value);
      }
      const result = await tryFn(
        () => targetResource.update(originalId, minimalRecord)
      );
      updateOk = result[0];
      updateErr = result[1];
      updateResult = result[2];
    } else {
      for (const [fieldPath, value] of Object.entries(consolidatedValues)) {
        lodash.set(record, fieldPath, value);
      }
      const result = await tryFn(
        () => targetResource.update(originalId, record)
      );
      updateOk = result[0];
      updateErr = result[1];
      updateResult = result[2];
    }
    const consolidatedValue = consolidatedValues[config.field] || (record ? lodash.get(record, config.field, 0) : 0);
    if (config.verbose) {
      console.log(
        `\u{1F525} [DEBUG] AFTER targetResource.update() {
  updateOk: ${updateOk},
  updateErr: ${updateErr?.message || "undefined"},
  consolidatedValue (main field): ${consolidatedValue}
}`
      );
    }
    if (updateOk && config.verbose) {
      const [verifyOk, verifyErr, verifiedRecord] = await tryFn(
        () => targetResource.get(originalId, { skipCache: true })
      );
      for (const [fieldPath, expectedValue] of Object.entries(consolidatedValues)) {
        const actualValue = lodash.get(verifiedRecord, fieldPath);
        const match = actualValue === expectedValue;
        console.log(
          `\u{1F525} [DEBUG] VERIFICATION ${fieldPath} {
  expectedValue: ${expectedValue},
  actualValue: ${actualValue},
  ${match ? "\u2705 MATCH" : "\u274C MISMATCH"}
}`
        );
        if (!match) {
          console.error(
            `\u274C [CRITICAL BUG] Update reported success but value not persisted!
  Resource: ${config.resource}
  FieldPath: ${fieldPath}
  Record ID: ${originalId}
  Expected: ${expectedValue}
  Actually got: ${actualValue}
  This indicates a bug in s3db.js resource.update()`
          );
        }
      }
    }
    if (!updateOk) {
      if (updateErr?.message?.includes("does not exist")) {
        if (config.verbose) {
          console.warn(
            `[EventualConsistency] ${config.resource}.${config.field} - Record ${originalId} doesn't exist. Skipping consolidation. ${transactions.length} transactions will remain pending until record is created.`
          );
        }
        return consolidatedValue;
      }
      console.error(
        `[EventualConsistency] ${config.resource}.${config.field} - FAILED to update ${originalId}: ${updateErr?.message || updateErr}`,
        { error: updateErr, consolidatedValue, currentValue }
      );
      throw updateErr;
    }
    if (updateOk) {
      const transactionsToUpdate = transactions.filter((txn) => txn.id !== "__synthetic__");
      const markAppliedConcurrency = config.markAppliedConcurrency || 50;
      const { results, errors } = await promisePool.PromisePool.for(transactionsToUpdate).withConcurrency(markAppliedConcurrency).process(async (txn) => {
        const txnWithCohorts = ensureCohortHour(txn, config.cohort.timezone, false);
        const updateData = { applied: true };
        if (txnWithCohorts.cohortHour && !txn.cohortHour) {
          updateData.cohortHour = txnWithCohorts.cohortHour;
        }
        if (txnWithCohorts.cohortDate && !txn.cohortDate) {
          updateData.cohortDate = txnWithCohorts.cohortDate;
        }
        if (txnWithCohorts.cohortWeek && !txn.cohortWeek) {
          updateData.cohortWeek = txnWithCohorts.cohortWeek;
        }
        if (txnWithCohorts.cohortMonth && !txn.cohortMonth) {
          updateData.cohortMonth = txnWithCohorts.cohortMonth;
        }
        if (txn.value === null || txn.value === void 0) {
          updateData.value = 1;
        }
        const [ok2, err2] = await tryFn(
          () => transactionResource.update(txn.id, updateData)
        );
        if (!ok2 && config.verbose) {
          console.warn(
            `[EventualConsistency] Failed to mark transaction ${txn.id} as applied:`,
            err2?.message,
            "Update data:",
            updateData
          );
        }
        return ok2;
      });
      if (errors && errors.length > 0 && config.verbose) {
        console.warn(`[EventualConsistency] ${errors.length} transactions failed to mark as applied`);
      }
      if (config.enableAnalytics && transactionsToUpdate.length > 0 && updateAnalyticsFn) {
        const [analyticsOk, analyticsErr] = await tryFn(
          () => updateAnalyticsFn(transactionsToUpdate)
        );
        if (!analyticsOk) {
          console.error(
            `[EventualConsistency] ${config.resource}.${config.field} - CRITICAL: Analytics update failed for ${originalId}, but consolidation succeeded:`,
            {
              error: analyticsErr?.message || analyticsErr,
              stack: analyticsErr?.stack,
              originalId,
              transactionCount: transactionsToUpdate.length
            }
          );
        }
      }
      if (targetResource && targetResource.cache && typeof targetResource.cache.delete === "function") {
        try {
          const cacheKey = await targetResource.cacheKeyFor({ id: originalId });
          await targetResource.cache.delete(cacheKey);
          if (config.verbose) {
            console.log(
              `[EventualConsistency] ${config.resource}.${config.field} - Cache invalidated for ${originalId}`
            );
          }
        } catch (cacheErr) {
          if (config.verbose) {
            console.warn(
              `[EventualConsistency] ${config.resource}.${config.field} - Failed to invalidate cache for ${originalId}: ${cacheErr?.message}`
            );
          }
        }
      }
    }
    return consolidatedValue;
  } finally {
    const [lockReleased, lockReleaseErr] = await tryFn(
      () => storage.releaseLock(lockKey)
    );
    if (!lockReleased && config.verbose) {
      console.warn(`[EventualConsistency] Failed to release lock ${lockKey}:`, lockReleaseErr?.message);
    }
  }
}
async function getConsolidatedValue(originalId, options, transactionResource, targetResource, config) {
  const includeApplied = options.includeApplied || false;
  const startDate = options.startDate;
  const endDate = options.endDate;
  const query = { originalId };
  if (!includeApplied) {
    query.applied = false;
  }
  const [ok, err, transactions] = await tryFn(
    () => transactionResource.query(query)
  );
  if (!ok || !transactions || transactions.length === 0) {
    const [recordOk2, recordErr2, record2] = await tryFn(
      () => targetResource.get(originalId)
    );
    if (recordOk2 && record2) {
      return record2[config.field] || 0;
    }
    return 0;
  }
  let filtered = transactions;
  if (startDate || endDate) {
    filtered = transactions.filter((t) => {
      const timestamp = new Date(t.timestamp);
      if (startDate && timestamp < new Date(startDate)) return false;
      if (endDate && timestamp > new Date(endDate)) return false;
      return true;
    });
  }
  const [recordOk, recordErr, record] = await tryFn(
    () => targetResource.get(originalId)
  );
  const currentValue = recordOk && record ? record[config.field] || 0 : 0;
  const hasSetOperation = filtered.some((t) => t.operation === "set");
  if (currentValue !== 0 && !hasSetOperation) {
    filtered.unshift(createSyntheticSetTransaction(currentValue));
  }
  filtered.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return config.reducer(filtered);
}
async function getCohortStats(cohortDate, transactionResource) {
  const [ok, err, transactions] = await tryFn(
    () => transactionResource.query({
      cohortDate
    })
  );
  if (!ok) return null;
  const stats = {
    date: cohortDate,
    transactionCount: transactions.length,
    totalValue: 0,
    byOperation: { set: 0, add: 0, sub: 0 },
    byOriginalId: {}
  };
  for (const txn of transactions) {
    stats.totalValue += txn.value || 0;
    stats.byOperation[txn.operation] = (stats.byOperation[txn.operation] || 0) + 1;
    if (!stats.byOriginalId[txn.originalId]) {
      stats.byOriginalId[txn.originalId] = {
        count: 0,
        value: 0
      };
    }
    stats.byOriginalId[txn.originalId].count++;
    stats.byOriginalId[txn.originalId].value += txn.value || 0;
  }
  return stats;
}
async function recalculateRecord(originalId, transactionResource, targetResource, storage, consolidateRecordFn, config) {
  const lockKey = `recalculate-${config.resource}-${config.field}-${originalId}`;
  const lock = await storage.acquireLock(lockKey, {
    ttl: config.lockTimeout || 30,
    timeout: 0,
    // Don't wait if locked
    workerId: process.pid ? String(process.pid) : "unknown"
  });
  if (!lock) {
    if (config.verbose) {
      console.log(`[EventualConsistency] Recalculate lock for ${originalId} already held, skipping`);
    }
    throw new Error(`Cannot recalculate ${originalId}: lock already held by another worker`);
  }
  try {
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Starting recalculation for ${originalId} (resetting all transactions to pending)`
      );
    }
    const [allOk, allErr, allTransactions] = await tryFn(
      () => transactionResource.query({
        originalId
      })
    );
    if (!allOk || !allTransactions || allTransactions.length === 0) {
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - No transactions found for ${originalId}, nothing to recalculate`
        );
      }
      return 0;
    }
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Found ${allTransactions.length} total transactions for ${originalId}, marking all as pending...`
      );
    }
    const hasAnchor = allTransactions.some((txn) => txn.source === "anchor");
    if (!hasAnchor) {
      const now = /* @__PURE__ */ new Date();
      const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);
      const oldestTransaction = allTransactions.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )[0];
      const anchorTimestamp = oldestTransaction ? new Date(new Date(oldestTransaction.timestamp).getTime() - 1).toISOString() : now.toISOString();
      const anchorCohortInfo = getCohortInfo(new Date(anchorTimestamp), config.cohort.timezone, config.verbose);
      const anchorTransaction = {
        id: idGenerator(),
        originalId,
        field: config.field,
        fieldPath: config.field,
        value: 0,
        // Always 0 for recalculate - we start from scratch
        operation: "set",
        timestamp: anchorTimestamp,
        cohortDate: anchorCohortInfo.date,
        cohortHour: anchorCohortInfo.hour,
        cohortMonth: anchorCohortInfo.month,
        source: "anchor",
        applied: true
        // Anchor is always applied
      };
      await transactionResource.insert(anchorTransaction);
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - Created anchor transaction for ${originalId} with value 0`
        );
      }
    }
    const transactionsToReset = allTransactions.filter((txn) => txn.source !== "anchor");
    const recalculateConcurrency = config.recalculateConcurrency || 50;
    const { results, errors } = await promisePool.PromisePool.for(transactionsToReset).withConcurrency(recalculateConcurrency).process(async (txn) => {
      const [ok, err] = await tryFn(
        () => transactionResource.update(txn.id, { applied: false })
      );
      if (!ok && config.verbose) {
        console.warn(`[EventualConsistency] Failed to reset transaction ${txn.id}:`, err?.message);
      }
      return ok;
    });
    if (errors && errors.length > 0) {
      console.warn(
        `[EventualConsistency] ${config.resource}.${config.field} - Failed to reset ${errors.length} transactions during recalculation`
      );
    }
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Reset ${results.length} transactions to pending, now resetting record value and running consolidation...`
      );
    }
    const [resetOk, resetErr] = await tryFn(
      () => targetResource.update(originalId, {
        [config.field]: 0
      })
    );
    if (!resetOk && config.verbose) {
      console.warn(
        `[EventualConsistency] ${config.resource}.${config.field} - Failed to reset record value for ${originalId}: ${resetErr?.message}`
      );
    }
    const consolidatedValue = await consolidateRecordFn(originalId);
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Recalculation complete for ${originalId}: final value = ${consolidatedValue}`
      );
    }
    return consolidatedValue;
  } finally {
    const [lockReleased, lockReleaseErr] = await tryFn(
      () => storage.releaseLock(lockKey)
    );
    if (!lockReleased && config.verbose) {
      console.warn(`[EventualConsistency] Failed to release recalculate lock ${lockKey}:`, lockReleaseErr?.message);
    }
  }
}

function startGarbageCollectionTimer(handler, resourceName, fieldName, runGCCallback, config) {
  const gcIntervalMs = config.gcInterval * 1e3;
  handler.gcTimer = setInterval(async () => {
    await runGCCallback(handler, resourceName, fieldName);
  }, gcIntervalMs);
  return handler.gcTimer;
}
async function runGarbageCollection(transactionResource, storage, config, emitFn) {
  const lockKey = `gc-${config.resource}-${config.field}`;
  const lock = await storage.acquireLock(lockKey, {
    ttl: 300,
    // 5 minutes for GC
    timeout: 0,
    // Don't wait if locked
    workerId: process.pid ? String(process.pid) : "unknown"
  });
  if (!lock) {
    if (config.verbose) {
      console.log(`[EventualConsistency] GC already running in another container`);
    }
    return;
  }
  try {
    const now = Date.now();
    const retentionMs = config.transactionRetention * 24 * 60 * 60 * 1e3;
    const cutoffDate = new Date(now - retentionMs);
    const cutoffIso = cutoffDate.toISOString();
    if (config.verbose) {
      console.log(`[EventualConsistency] Running GC for transactions older than ${cutoffIso} (${config.transactionRetention} days)`);
    }
    const [ok, err, oldTransactions] = await tryFn(
      () => transactionResource.query({
        applied: true,
        timestamp: { "<": cutoffIso }
      })
    );
    if (!ok) {
      if (config.verbose) {
        console.warn(`[EventualConsistency] GC failed to query transactions:`, err?.message);
      }
      return;
    }
    if (!oldTransactions || oldTransactions.length === 0) {
      if (config.verbose) {
        console.log(`[EventualConsistency] No old transactions to clean up`);
      }
      return;
    }
    if (config.verbose) {
      console.log(`[EventualConsistency] Deleting ${oldTransactions.length} old transactions`);
    }
    const { results, errors } = await promisePool.PromisePool.for(oldTransactions).withConcurrency(10).process(async (txn) => {
      const [deleted] = await tryFn(() => transactionResource.delete(txn.id));
      return deleted;
    });
    if (config.verbose) {
      console.log(`[EventualConsistency] GC completed: ${results.length} deleted, ${errors.length} errors`);
    }
    if (emitFn) {
      emitFn("eventual-consistency.gc-completed", {
        resource: config.resource,
        field: config.field,
        deletedCount: results.length,
        errorCount: errors.length
      });
    }
  } catch (error) {
    if (config.verbose) {
      console.warn(`[EventualConsistency] GC error:`, error.message);
    }
    if (emitFn) {
      emitFn("eventual-consistency.gc-error", error);
    }
  } finally {
    await tryFn(() => storage.releaseLock(lockKey));
  }
}

async function updateAnalytics(transactions, analyticsResource, config) {
  if (!analyticsResource || transactions.length === 0) return;
  if (!config.field) {
    throw new Error(
      `[EventualConsistency] CRITICAL BUG: config.field is undefined in updateAnalytics()!
This indicates a race condition in the plugin where multiple handlers are sharing the same config object.
Config: ${JSON.stringify({ resource: config.resource, field: config.field })}
Transactions count: ${transactions.length}
AnalyticsResource: ${analyticsResource?.name || "unknown"}`
    );
  }
  if (config.verbose) {
    console.log(
      `[EventualConsistency] ${config.resource}.${config.field} - Updating analytics for ${transactions.length} transactions...`
    );
  }
  try {
    const byHour = groupByCohort(transactions, "cohortHour");
    const cohortCount = Object.keys(byHour).length;
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Updating ${cohortCount} hourly analytics cohorts IN PARALLEL...`
      );
    }
    await Promise.all(
      Object.entries(byHour).map(
        ([cohort, txns]) => upsertAnalytics("hour", cohort, txns, analyticsResource, config)
      )
    );
    if (config.analyticsConfig.rollupStrategy === "incremental") {
      const uniqueHours = Object.keys(byHour);
      if (config.verbose) {
        console.log(
          `[EventualConsistency] ${config.resource}.${config.field} - Rolling up ${uniqueHours.length} hours to daily/weekly/monthly analytics IN PARALLEL...`
        );
      }
      await Promise.all(
        uniqueHours.map(
          (cohortHour) => rollupAnalytics(cohortHour, analyticsResource, config)
        )
      );
    }
    if (config.verbose) {
      console.log(
        `[EventualConsistency] ${config.resource}.${config.field} - Analytics update complete for ${cohortCount} cohorts`
      );
    }
  } catch (error) {
    console.error(
      `[EventualConsistency] CRITICAL: ${config.resource}.${config.field} - Analytics update failed:`,
      {
        error: error.message,
        stack: error.stack,
        field: config.field,
        resource: config.resource,
        transactionCount: transactions.length
      }
    );
    throw new Error(
      `Analytics update failed for ${config.resource}.${config.field}: ${error.message}`
    );
  }
}
async function upsertAnalytics(period, cohort, transactions, analyticsResource, config) {
  const id = `${period}-${cohort}`;
  const transactionCount = transactions.length;
  const signedValues = transactions.map((t) => {
    if (t.operation === "sub") return -t.value;
    return t.value;
  });
  const totalValue = signedValues.reduce((sum, v) => sum + v, 0);
  const avgValue = totalValue / transactionCount;
  const minValue = Math.min(...signedValues);
  const maxValue = Math.max(...signedValues);
  const operations = calculateOperationBreakdown(transactions);
  const recordCount = new Set(transactions.map((t) => t.originalId)).size;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const [existingOk, existingErr, existing] = await tryFn(
    () => analyticsResource.get(id)
  );
  if (existingOk && existing) {
    const newTransactionCount = existing.transactionCount + transactionCount;
    const newTotalValue = existing.totalValue + totalValue;
    const newAvgValue = newTotalValue / newTransactionCount;
    const newMinValue = Math.min(existing.minValue, minValue);
    const newMaxValue = Math.max(existing.maxValue, maxValue);
    const newOperations = { ...existing.operations };
    for (const [op, stats] of Object.entries(operations)) {
      if (!newOperations[op]) {
        newOperations[op] = { count: 0, sum: 0 };
      }
      newOperations[op].count += stats.count;
      newOperations[op].sum += stats.sum;
    }
    const newRecordCount = Math.max(existing.recordCount, recordCount);
    await tryFn(
      () => analyticsResource.update(id, {
        transactionCount: newTransactionCount,
        totalValue: newTotalValue,
        avgValue: newAvgValue,
        minValue: newMinValue,
        maxValue: newMaxValue,
        operations: newOperations,
        recordCount: newRecordCount,
        updatedAt: now
      })
    );
  } else {
    await tryFn(
      () => analyticsResource.insert({
        id,
        field: config.field,
        period,
        cohort,
        transactionCount,
        totalValue,
        avgValue,
        minValue,
        maxValue,
        operations,
        recordCount,
        consolidatedAt: now,
        updatedAt: now
      })
    );
  }
}
function calculateOperationBreakdown(transactions) {
  const breakdown = {};
  for (const txn of transactions) {
    const op = txn.operation;
    if (!breakdown[op]) {
      breakdown[op] = { count: 0, sum: 0 };
    }
    breakdown[op].count++;
    const signedValue = op === "sub" ? -txn.value : txn.value;
    breakdown[op].sum += signedValue;
  }
  return breakdown;
}
async function rollupAnalytics(cohortHour, analyticsResource, config) {
  const cohortDate = cohortHour.substring(0, 10);
  const cohortMonth = cohortHour.substring(0, 7);
  const date = new Date(cohortDate);
  const cohortWeek = getCohortWeekFromDate(date);
  await rollupPeriod("day", cohortDate, cohortDate, analyticsResource, config);
  await rollupPeriod("week", cohortWeek, cohortWeek, analyticsResource, config);
  await rollupPeriod("month", cohortMonth, cohortMonth, analyticsResource, config);
}
function getCohortWeekFromDate(date) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursday = new Date(yearStart.valueOf());
  if (yearStart.getUTCDay() !== 4) {
    firstThursday.setUTCDate(yearStart.getUTCDate() + (4 - yearStart.getUTCDay() + 7) % 7);
  }
  const weekNumber = 1 + Math.round((target - firstThursday) / 6048e5);
  const weekYear = target.getUTCFullYear();
  return `${weekYear}-W${String(weekNumber).padStart(2, "0")}`;
}
async function rollupPeriod(period, cohort, sourcePrefix, analyticsResource, config) {
  let sourcePeriod;
  if (period === "day") {
    sourcePeriod = "hour";
  } else if (period === "week") {
    sourcePeriod = "day";
  } else if (period === "month") {
    sourcePeriod = "day";
  } else {
    sourcePeriod = "day";
  }
  const [ok, err, allAnalytics] = await tryFn(
    () => analyticsResource.list()
  );
  if (!ok || !allAnalytics) return;
  let sourceAnalytics;
  if (period === "week") {
    sourceAnalytics = allAnalytics.filter((a) => {
      if (a.period !== sourcePeriod) return false;
      const dayDate = new Date(a.cohort);
      const dayWeek = getCohortWeekFromDate(dayDate);
      return dayWeek === cohort;
    });
  } else {
    sourceAnalytics = allAnalytics.filter(
      (a) => a.period === sourcePeriod && a.cohort.startsWith(sourcePrefix)
    );
  }
  if (sourceAnalytics.length === 0) return;
  const transactionCount = sourceAnalytics.reduce((sum, a) => sum + a.transactionCount, 0);
  const totalValue = sourceAnalytics.reduce((sum, a) => sum + a.totalValue, 0);
  const avgValue = totalValue / transactionCount;
  const minValue = Math.min(...sourceAnalytics.map((a) => a.minValue));
  const maxValue = Math.max(...sourceAnalytics.map((a) => a.maxValue));
  const operations = {};
  for (const analytics of sourceAnalytics) {
    for (const [op, stats] of Object.entries(analytics.operations || {})) {
      if (!operations[op]) {
        operations[op] = { count: 0, sum: 0 };
      }
      operations[op].count += stats.count;
      operations[op].sum += stats.sum;
    }
  }
  const recordCount = Math.max(...sourceAnalytics.map((a) => a.recordCount));
  const id = `${period}-${cohort}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const [existingOk, existingErr, existing] = await tryFn(
    () => analyticsResource.get(id)
  );
  if (existingOk && existing) {
    await tryFn(
      () => analyticsResource.update(id, {
        transactionCount,
        totalValue,
        avgValue,
        minValue,
        maxValue,
        operations,
        recordCount,
        updatedAt: now
      })
    );
  } else {
    await tryFn(
      () => analyticsResource.insert({
        id,
        field: config.field,
        period,
        cohort,
        transactionCount,
        totalValue,
        avgValue,
        minValue,
        maxValue,
        operations,
        recordCount,
        consolidatedAt: now,
        updatedAt: now
      })
    );
  }
}
function fillGaps(data, period, startDate, endDate) {
  if (!data || data.length === 0) {
    data = [];
  }
  const dataMap = /* @__PURE__ */ new Map();
  data.forEach((item) => {
    dataMap.set(item.cohort, item);
  });
  const result = [];
  const emptyRecord = {
    count: 0,
    sum: 0,
    avg: 0,
    min: 0,
    max: 0,
    recordCount: 0
  };
  if (period === "hour") {
    const start = /* @__PURE__ */ new Date(startDate + "T00:00:00Z");
    const end = /* @__PURE__ */ new Date(endDate + "T23:59:59Z");
    for (let dt = new Date(start); dt <= end; dt.setHours(dt.getHours() + 1)) {
      const cohort = dt.toISOString().substring(0, 13);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
    }
  } else if (period === "day") {
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      const cohort = dt.toISOString().substring(0, 10);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
    }
  } else if (period === "month") {
    const startYear = parseInt(startDate.substring(0, 4));
    const startMonth = parseInt(startDate.substring(5, 7));
    const endYear = parseInt(endDate.substring(0, 4));
    const endMonth = parseInt(endDate.substring(5, 7));
    for (let year = startYear; year <= endYear; year++) {
      const firstMonth = year === startYear ? startMonth : 1;
      const lastMonth = year === endYear ? endMonth : 12;
      for (let month = firstMonth; month <= lastMonth; month++) {
        const cohort = `${year}-${month.toString().padStart(2, "0")}`;
        result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      }
    }
  }
  return result;
}
async function getAnalytics(resourceName, field, options, fieldHandlers) {
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new Error(`No eventual consistency configured for resource: ${resourceName}`);
  }
  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new Error(`No eventual consistency configured for field: ${resourceName}.${field}`);
  }
  if (!handler.analyticsResource) {
    throw new Error("Analytics not enabled for this plugin");
  }
  const { period = "day", date, startDate, endDate, month, year, breakdown = false, recordId } = options;
  if (recordId) {
    return await getAnalyticsForRecord(resourceName, field, recordId, options, handler);
  }
  const [ok, err, allAnalytics] = await tryFn(
    () => handler.analyticsResource.list()
  );
  if (!ok || !allAnalytics) {
    return [];
  }
  let filtered = allAnalytics.filter((a) => a.period === period);
  if (date) {
    if (period === "hour") {
      filtered = filtered.filter((a) => a.cohort.startsWith(date));
    } else {
      filtered = filtered.filter((a) => a.cohort === date);
    }
  } else if (startDate && endDate) {
    filtered = filtered.filter((a) => a.cohort >= startDate && a.cohort <= endDate);
  } else if (month) {
    filtered = filtered.filter((a) => a.cohort.startsWith(month));
  } else if (year) {
    filtered = filtered.filter((a) => a.cohort.startsWith(String(year)));
  }
  filtered.sort((a, b) => a.cohort.localeCompare(b.cohort));
  if (breakdown === "operations") {
    return filtered.map((a) => ({
      cohort: a.cohort,
      ...a.operations
    }));
  }
  return filtered.map((a) => ({
    cohort: a.cohort,
    count: a.transactionCount,
    sum: a.totalValue,
    avg: a.avgValue,
    min: a.minValue,
    max: a.maxValue,
    operations: a.operations,
    recordCount: a.recordCount
  }));
}
async function getAnalyticsForRecord(resourceName, field, recordId, options, handler) {
  const { period = "day", date, startDate, endDate, month, year } = options;
  const [okTrue, errTrue, appliedTransactions] = await tryFn(
    () => handler.transactionResource.query({
      originalId: recordId,
      applied: true
    })
  );
  const [okFalse, errFalse, pendingTransactions] = await tryFn(
    () => handler.transactionResource.query({
      originalId: recordId,
      applied: false
    })
  );
  let allTransactions = [
    ...okTrue && appliedTransactions ? appliedTransactions : [],
    ...okFalse && pendingTransactions ? pendingTransactions : []
  ];
  if (allTransactions.length === 0) {
    return [];
  }
  allTransactions = ensureCohortHours(allTransactions, handler.config?.cohort?.timezone || "UTC", false);
  let filtered = allTransactions;
  if (date) {
    if (period === "hour") {
      filtered = filtered.filter((t) => t.cohortHour && t.cohortHour.startsWith(date));
    } else if (period === "day") {
      filtered = filtered.filter((t) => t.cohortDate === date);
    } else if (period === "month") {
      filtered = filtered.filter((t) => t.cohortMonth && t.cohortMonth.startsWith(date));
    }
  } else if (startDate && endDate) {
    if (period === "hour") {
      filtered = filtered.filter((t) => t.cohortHour && t.cohortHour >= startDate && t.cohortHour <= endDate);
    } else if (period === "day") {
      filtered = filtered.filter((t) => t.cohortDate && t.cohortDate >= startDate && t.cohortDate <= endDate);
    } else if (period === "month") {
      filtered = filtered.filter((t) => t.cohortMonth && t.cohortMonth >= startDate && t.cohortMonth <= endDate);
    }
  } else if (month) {
    if (period === "hour") {
      filtered = filtered.filter((t) => t.cohortHour && t.cohortHour.startsWith(month));
    } else if (period === "day") {
      filtered = filtered.filter((t) => t.cohortDate && t.cohortDate.startsWith(month));
    }
  } else if (year) {
    if (period === "hour") {
      filtered = filtered.filter((t) => t.cohortHour && t.cohortHour.startsWith(String(year)));
    } else if (period === "day") {
      filtered = filtered.filter((t) => t.cohortDate && t.cohortDate.startsWith(String(year)));
    } else if (period === "month") {
      filtered = filtered.filter((t) => t.cohortMonth && t.cohortMonth.startsWith(String(year)));
    }
  }
  const cohortField = period === "hour" ? "cohortHour" : period === "day" ? "cohortDate" : "cohortMonth";
  const aggregated = aggregateTransactionsByCohort(filtered, cohortField);
  return aggregated;
}
function aggregateTransactionsByCohort(transactions, cohortField) {
  const groups = {};
  for (const txn of transactions) {
    const cohort = txn[cohortField];
    if (!cohort) continue;
    if (!groups[cohort]) {
      groups[cohort] = {
        cohort,
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
        recordCount: /* @__PURE__ */ new Set(),
        operations: {}
      };
    }
    const group = groups[cohort];
    const signedValue = txn.operation === "sub" ? -txn.value : txn.value;
    group.count++;
    group.sum += signedValue;
    group.min = Math.min(group.min, signedValue);
    group.max = Math.max(group.max, signedValue);
    group.recordCount.add(txn.originalId);
    const op = txn.operation;
    if (!group.operations[op]) {
      group.operations[op] = { count: 0, sum: 0 };
    }
    group.operations[op].count++;
    group.operations[op].sum += signedValue;
  }
  return Object.values(groups).map((g) => ({
    cohort: g.cohort,
    count: g.count,
    sum: g.sum,
    avg: g.sum / g.count,
    min: g.min === Infinity ? 0 : g.min,
    max: g.max === -Infinity ? 0 : g.max,
    recordCount: g.recordCount.size,
    operations: g.operations
  })).sort((a, b) => a.cohort.localeCompare(b.cohort));
}
async function getMonthByDay(resourceName, field, month, options, fieldHandlers) {
  const year = parseInt(month.substring(0, 4));
  const monthNum = parseInt(month.substring(5, 7));
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);
  const startDate = firstDay.toISOString().substring(0, 10);
  const endDate = lastDay.toISOString().substring(0, 10);
  const data = await getAnalytics(resourceName, field, {
    period: "day",
    startDate,
    endDate
  }, fieldHandlers);
  if (options.fillGaps) {
    return fillGaps(data, "day", startDate, endDate);
  }
  return data;
}
async function getDayByHour(resourceName, field, date, options, fieldHandlers) {
  const data = await getAnalytics(resourceName, field, {
    period: "hour",
    date
  }, fieldHandlers);
  if (options.fillGaps) {
    return fillGaps(data, "hour", date, date);
  }
  return data;
}
async function getLastNDays(resourceName, field, days, options, fieldHandlers) {
  const dates = Array.from({ length: days }, (_, i) => {
    const date = /* @__PURE__ */ new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().substring(0, 10);
  }).reverse();
  const data = await getAnalytics(resourceName, field, {
    ...options,
    // ✅ Include all options (recordId, etc.)
    period: "day",
    startDate: dates[0],
    endDate: dates[dates.length - 1]
  }, fieldHandlers);
  if (options.fillGaps) {
    return fillGaps(data, "day", dates[0], dates[dates.length - 1]);
  }
  return data;
}
async function getYearByMonth(resourceName, field, year, options, fieldHandlers) {
  const data = await getAnalytics(resourceName, field, {
    period: "month",
    year
  }, fieldHandlers);
  if (options.fillGaps) {
    const startDate = `${year}-01`;
    const endDate = `${year}-12`;
    return fillGaps(data, "month", startDate, endDate);
  }
  return data;
}
async function getYearByWeek(resourceName, field, year, options, fieldHandlers) {
  const data = await getAnalytics(resourceName, field, {
    period: "week",
    year
  }, fieldHandlers);
  if (options.fillGaps) {
    const startWeek = `${year}-W01`;
    const endWeek = `${year}-W53`;
    return fillGaps(data, "week", startWeek, endWeek);
  }
  return data;
}
async function getMonthByWeek(resourceName, field, month, options, fieldHandlers) {
  const year = parseInt(month.substring(0, 4));
  const monthNum = parseInt(month.substring(5, 7));
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);
  const firstWeek = getCohortWeekFromDate(firstDay);
  const lastWeek = getCohortWeekFromDate(lastDay);
  const data = await getAnalytics(resourceName, field, {
    period: "week",
    startDate: firstWeek,
    endDate: lastWeek
  }, fieldHandlers);
  return data;
}
async function getMonthByHour(resourceName, field, month, options, fieldHandlers) {
  let year, monthNum;
  if (month === "last") {
    const now = /* @__PURE__ */ new Date();
    now.setMonth(now.getMonth() - 1);
    year = now.getFullYear();
    monthNum = now.getMonth() + 1;
  } else {
    year = parseInt(month.substring(0, 4));
    monthNum = parseInt(month.substring(5, 7));
  }
  const firstDay = new Date(year, monthNum - 1, 1);
  const lastDay = new Date(year, monthNum, 0);
  const startDate = firstDay.toISOString().substring(0, 10);
  const endDate = lastDay.toISOString().substring(0, 10);
  const data = await getAnalytics(resourceName, field, {
    period: "hour",
    startDate,
    endDate
  }, fieldHandlers);
  if (options.fillGaps) {
    return fillGaps(data, "hour", startDate, endDate);
  }
  return data;
}
async function getTopRecords(resourceName, field, options, fieldHandlers) {
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new Error(`No eventual consistency configured for resource: ${resourceName}`);
  }
  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new Error(`No eventual consistency configured for field: ${resourceName}.${field}`);
  }
  if (!handler.transactionResource) {
    throw new Error("Transaction resource not initialized");
  }
  const { period = "day", date, metric = "transactionCount", limit = 10 } = options;
  const [ok, err, transactions] = await tryFn(
    () => handler.transactionResource.list()
  );
  if (!ok || !transactions) {
    return [];
  }
  let filtered = transactions;
  if (date) {
    if (period === "hour") {
      filtered = transactions.filter((t) => t.cohortHour && t.cohortHour.startsWith(date));
    } else if (period === "day") {
      filtered = transactions.filter((t) => t.cohortDate === date);
    } else if (period === "month") {
      filtered = transactions.filter((t) => t.cohortMonth && t.cohortMonth.startsWith(date));
    }
  }
  const byRecord = {};
  for (const txn of filtered) {
    const recordId = txn.originalId;
    if (!byRecord[recordId]) {
      byRecord[recordId] = { count: 0, sum: 0 };
    }
    byRecord[recordId].count++;
    byRecord[recordId].sum += txn.value;
  }
  const records = Object.entries(byRecord).map(([recordId, stats]) => ({
    recordId,
    count: stats.count,
    sum: stats.sum
  }));
  records.sort((a, b) => {
    if (metric === "transactionCount") {
      return b.count - a.count;
    } else if (metric === "totalValue") {
      return b.sum - a.sum;
    }
    return 0;
  });
  return records.slice(0, limit);
}
async function getYearByDay(resourceName, field, year, options, fieldHandlers) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const data = await getAnalytics(resourceName, field, {
    period: "day",
    startDate,
    endDate
  }, fieldHandlers);
  if (options.fillGaps) {
    return fillGaps(data, "day", startDate, endDate);
  }
  return data;
}
async function getWeekByDay(resourceName, field, week, options, fieldHandlers) {
  const year = parseInt(week.substring(0, 4));
  const weekNum = parseInt(week.substring(6, 8));
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setUTCDate(weekStart.getUTCDate() + i);
    days.push(day.toISOString().substring(0, 10));
  }
  const startDate = days[0];
  const endDate = days[6];
  const data = await getAnalytics(resourceName, field, {
    period: "day",
    startDate,
    endDate
  }, fieldHandlers);
  if (options.fillGaps) {
    return fillGaps(data, "day", startDate, endDate);
  }
  return data;
}
async function getWeekByHour(resourceName, field, week, options, fieldHandlers) {
  const year = parseInt(week.substring(0, 4));
  const weekNum = parseInt(week.substring(6, 8));
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const firstMonday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  const weekStart = new Date(firstMonday);
  weekStart.setUTCDate(weekStart.getUTCDate() + (weekNum - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const startDate = weekStart.toISOString().substring(0, 10);
  const endDate = weekEnd.toISOString().substring(0, 10);
  const data = await getAnalytics(resourceName, field, {
    period: "hour",
    startDate,
    endDate
  }, fieldHandlers);
  if (options.fillGaps) {
    return fillGaps(data, "hour", startDate, endDate);
  }
  return data;
}
async function getLastNHours(resourceName, field, hours = 24, options, fieldHandlers) {
  const now = /* @__PURE__ */ new Date();
  const hoursAgo = new Date(now);
  hoursAgo.setHours(hoursAgo.getHours() - hours + 1);
  const startHour = hoursAgo.toISOString().substring(0, 13);
  const endHour = now.toISOString().substring(0, 13);
  const data = await getAnalytics(resourceName, field, {
    ...options,
    // ✅ Include all options (recordId, etc.)
    period: "hour",
    startDate: startHour,
    endDate: endHour
  }, fieldHandlers);
  if (options.fillGaps) {
    const result = [];
    const emptyRecord = { count: 0, sum: 0, avg: 0, min: 0, max: 0, recordCount: 0 };
    const dataMap = new Map(data.map((d) => [d.cohort, d]));
    const current = new Date(hoursAgo);
    for (let i = 0; i < hours; i++) {
      const cohort = current.toISOString().substring(0, 13);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      current.setHours(current.getHours() + 1);
    }
    return result;
  }
  return data;
}
async function getLastNWeeks(resourceName, field, weeks = 4, options, fieldHandlers) {
  const now = /* @__PURE__ */ new Date();
  const weeksAgo = new Date(now);
  weeksAgo.setDate(weeksAgo.getDate() - weeks * 7);
  const weekCohorts = [];
  const currentDate = new Date(weeksAgo);
  while (currentDate <= now) {
    const weekCohort = getCohortWeekFromDate(currentDate);
    if (!weekCohorts.includes(weekCohort)) {
      weekCohorts.push(weekCohort);
    }
    currentDate.setDate(currentDate.getDate() + 7);
  }
  const startWeek = weekCohorts[0];
  const endWeek = weekCohorts[weekCohorts.length - 1];
  const data = await getAnalytics(resourceName, field, {
    period: "week",
    startDate: startWeek,
    endDate: endWeek
  }, fieldHandlers);
  return data;
}
async function getLastNMonths(resourceName, field, months = 12, options, fieldHandlers) {
  const now = /* @__PURE__ */ new Date();
  const monthsAgo = new Date(now);
  monthsAgo.setMonth(monthsAgo.getMonth() - months + 1);
  const startDate = monthsAgo.toISOString().substring(0, 7);
  const endDate = now.toISOString().substring(0, 7);
  const data = await getAnalytics(resourceName, field, {
    ...options,
    // ✅ Include all options (recordId, etc.)
    period: "month",
    startDate,
    endDate
  }, fieldHandlers);
  if (options.fillGaps) {
    const result = [];
    const emptyRecord = { count: 0, sum: 0, avg: 0, min: 0, max: 0, recordCount: 0 };
    const dataMap = new Map(data.map((d) => [d.cohort, d]));
    const current = new Date(monthsAgo);
    for (let i = 0; i < months; i++) {
      const cohort = current.toISOString().substring(0, 7);
      result.push(dataMap.get(cohort) || { cohort, ...emptyRecord });
      current.setMonth(current.getMonth() + 1);
    }
    return result;
  }
  return data;
}
async function getRawEvents(resourceName, field, options, fieldHandlers) {
  const resourceHandlers = fieldHandlers.get(resourceName);
  if (!resourceHandlers) {
    throw new Error(`No eventual consistency configured for resource: ${resourceName}`);
  }
  const handler = resourceHandlers.get(field);
  if (!handler) {
    throw new Error(`No eventual consistency configured for field: ${resourceName}.${field}`);
  }
  if (!handler.transactionResource) {
    throw new Error("Transaction resource not initialized");
  }
  const {
    recordId,
    startDate,
    endDate,
    cohortDate,
    cohortHour,
    cohortMonth,
    applied,
    operation,
    limit
  } = options;
  const query = {};
  if (recordId !== void 0) {
    query.originalId = recordId;
  }
  if (applied !== void 0) {
    query.applied = applied;
  }
  const [ok, err, allTransactions] = await tryFn(
    () => handler.transactionResource.query(query)
  );
  if (!ok || !allTransactions) {
    return [];
  }
  let filtered = allTransactions;
  if (operation !== void 0) {
    filtered = filtered.filter((t) => t.operation === operation);
  }
  if (cohortDate) {
    filtered = filtered.filter((t) => t.cohortDate === cohortDate);
  }
  if (cohortHour) {
    filtered = filtered.filter((t) => t.cohortHour === cohortHour);
  }
  if (cohortMonth) {
    filtered = filtered.filter((t) => t.cohortMonth === cohortMonth);
  }
  if (startDate && endDate) {
    const isHourly = startDate.length > 10;
    const cohortField = isHourly ? "cohortHour" : "cohortDate";
    filtered = filtered.filter(
      (t) => t[cohortField] && t[cohortField] >= startDate && t[cohortField] <= endDate
    );
  } else if (startDate) {
    const isHourly = startDate.length > 10;
    const cohortField = isHourly ? "cohortHour" : "cohortDate";
    filtered = filtered.filter((t) => t[cohortField] && t[cohortField] >= startDate);
  } else if (endDate) {
    const isHourly = endDate.length > 10;
    const cohortField = isHourly ? "cohortHour" : "cohortDate";
    filtered = filtered.filter((t) => t[cohortField] && t[cohortField] <= endDate);
  }
  filtered.sort((a, b) => {
    const aTime = new Date(a.timestamp || a.createdAt).getTime();
    const bTime = new Date(b.timestamp || b.createdAt).getTime();
    return bTime - aTime;
  });
  if (limit && limit > 0) {
    filtered = filtered.slice(0, limit);
  }
  return filtered;
}

function addHelperMethods(resource, plugin, config) {
  resource.set = async (id, field, value) => {
    const { field: rootField, fieldPath, plugin: handler } = resolveFieldAndPlugin(resource, field, value);
    const now = /* @__PURE__ */ new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);
    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
      fieldPath,
      // Store full path for nested access
      value,
      operation: "set",
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: "set",
      applied: false
    };
    await handler.transactionResource.insert(transaction);
    if (config.mode === "sync") {
      return await plugin._syncModeConsolidate(handler, id, fieldPath);
    }
    return value;
  };
  resource.add = async (id, field, amount) => {
    const { field: rootField, fieldPath, plugin: handler } = resolveFieldAndPlugin(resource, field, amount);
    const now = /* @__PURE__ */ new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);
    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
      fieldPath,
      // Store full path for nested access
      value: amount,
      operation: "add",
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: "add",
      applied: false
    };
    await handler.transactionResource.insert(transaction);
    if (config.mode === "sync") {
      return await plugin._syncModeConsolidate(handler, id, fieldPath);
    }
    const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
    if (!ok || !record) return amount;
    const lodash = await import('lodash-es');
    const currentValue = lodash.get(record, fieldPath, 0);
    return currentValue + amount;
  };
  resource.sub = async (id, field, amount) => {
    const { field: rootField, fieldPath, plugin: handler } = resolveFieldAndPlugin(resource, field, amount);
    const now = /* @__PURE__ */ new Date();
    const cohortInfo = getCohortInfo(now, config.cohort.timezone, config.verbose);
    const transaction = {
      id: idGenerator(),
      originalId: id,
      field: handler.field,
      fieldPath,
      // Store full path for nested access
      value: amount,
      operation: "sub",
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: "sub",
      applied: false
    };
    await handler.transactionResource.insert(transaction);
    if (config.mode === "sync") {
      return await plugin._syncModeConsolidate(handler, id, fieldPath);
    }
    const [ok, err, record] = await tryFn(() => handler.targetResource.get(id));
    if (!ok || !record) return -amount;
    const lodash = await import('lodash-es');
    const currentValue = lodash.get(record, fieldPath, 0);
    return currentValue - amount;
  };
  resource.increment = async (id, field) => {
    return await resource.add(id, field, 1);
  };
  resource.decrement = async (id, field) => {
    return await resource.sub(id, field, 1);
  };
  resource.consolidate = async (id, field) => {
    if (!field) {
      throw new Error(`Field parameter is required: consolidate(id, field)`);
    }
    const handler = resource._eventualConsistencyPlugins[field];
    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(", ");
      throw new Error(
        `No eventual consistency plugin found for field "${field}". Available fields: ${availableFields}`
      );
    }
    return await plugin._consolidateWithHandler(handler, id);
  };
  resource.getConsolidatedValue = async (id, field, options = {}) => {
    const handler = resource._eventualConsistencyPlugins[field];
    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(", ");
      throw new Error(
        `No eventual consistency plugin found for field "${field}". Available fields: ${availableFields}`
      );
    }
    return await plugin._getConsolidatedValueWithHandler(handler, id, options);
  };
  resource.recalculate = async (id, field) => {
    if (!field) {
      throw new Error(`Field parameter is required: recalculate(id, field)`);
    }
    const handler = resource._eventualConsistencyPlugins[field];
    if (!handler) {
      const availableFields = Object.keys(resource._eventualConsistencyPlugins).join(", ");
      throw new Error(
        `No eventual consistency plugin found for field "${field}". Available fields: ${availableFields}`
      );
    }
    return await plugin._recalculateWithHandler(handler, id);
  };
}

async function onInstall(database, fieldHandlers, completeFieldSetupFn, watchForResourceFn) {
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    const targetResource = database.resources[resourceName];
    if (!targetResource) {
      for (const handler of resourceHandlers.values()) {
        handler.deferredSetup = true;
      }
      watchForResourceFn(resourceName);
      continue;
    }
    for (const [fieldName, handler] of resourceHandlers) {
      handler.targetResource = targetResource;
      await completeFieldSetupFn(handler);
    }
  }
}
function watchForResource(resourceName, database, fieldHandlers, completeFieldSetupFn) {
  const hookCallback = async ({ resource, config }) => {
    if (config.name === resourceName) {
      const resourceHandlers = fieldHandlers.get(resourceName);
      if (!resourceHandlers) return;
      for (const [fieldName, handler] of resourceHandlers) {
        if (handler.deferredSetup) {
          handler.targetResource = resource;
          handler.deferredSetup = false;
          await completeFieldSetupFn(handler);
        }
      }
    }
  };
  database.addHook("afterCreateResource", hookCallback);
}
async function completeFieldSetup(handler, database, config, plugin) {
  if (!handler.targetResource) return;
  const resourceName = handler.resource;
  const fieldName = handler.field;
  const transactionResourceName = `plg_${resourceName}_tx_${fieldName}`;
  const partitionConfig = createPartitionConfig();
  const [ok, err, transactionResource] = await tryFn(
    () => database.createResource({
      name: transactionResourceName,
      attributes: {
        id: "string|required",
        originalId: "string|required",
        field: "string|required",
        fieldPath: "string|optional",
        // Support for nested field paths (e.g., 'utmResults.medium')
        value: "number|required",
        operation: "string|required",
        timestamp: "string|required",
        cohortDate: "string|required",
        cohortHour: "string|optional",
        // ✅ FIX BUG #2: Changed from required to optional for migration compatibility
        cohortWeek: "string|optional",
        cohortMonth: "string|optional",
        source: "string|optional",
        applied: "boolean|optional"
      },
      behavior: "body-overflow",
      timestamps: true,
      partitions: partitionConfig,
      asyncPartitions: true,
      createdBy: "EventualConsistencyPlugin"
    })
  );
  if (!ok && !database.resources[transactionResourceName]) {
    throw new Error(`Failed to create transaction resource for ${resourceName}.${fieldName}: ${err?.message}`);
  }
  handler.transactionResource = ok ? transactionResource : database.resources[transactionResourceName];
  if (config.enableAnalytics) {
    await createAnalyticsResource(handler, database, resourceName, fieldName);
  }
  addHelperMethodsForHandler(handler, plugin, config);
  if (config.verbose) {
    console.log(
      `[EventualConsistency] ${resourceName}.${fieldName} - Setup complete. Resources: ${transactionResourceName}${config.enableAnalytics ? `, plg_${resourceName}_an_${fieldName}` : ""} (locks via PluginStorage TTL)`
    );
  }
}
async function createAnalyticsResource(handler, database, resourceName, fieldName) {
  const analyticsResourceName = `plg_${resourceName}_an_${fieldName}`;
  const [ok, err, analyticsResource] = await tryFn(
    () => database.createResource({
      name: analyticsResourceName,
      attributes: {
        id: "string|required",
        field: "string|required",
        period: "string|required",
        cohort: "string|required",
        transactionCount: "number|required",
        totalValue: "number|required",
        avgValue: "number|required",
        minValue: "number|required",
        maxValue: "number|required",
        operations: "object|optional",
        recordCount: "number|required",
        consolidatedAt: "string|required",
        updatedAt: "string|required"
      },
      behavior: "body-overflow",
      timestamps: false,
      asyncPartitions: true,
      // ✅ Multi-attribute partitions for optimal analytics query performance
      partitions: {
        // Query by period (hour/day/week/month)
        byPeriod: {
          fields: { period: "string" }
        },
        // Query by period + cohort (e.g., all hour records for specific hours)
        byPeriodCohort: {
          fields: {
            period: "string",
            cohort: "string"
          }
        },
        // Query by field + period (e.g., all daily analytics for clicks field)
        byFieldPeriod: {
          fields: {
            field: "string",
            period: "string"
          }
        }
      },
      createdBy: "EventualConsistencyPlugin"
    })
  );
  if (!ok && !database.resources[analyticsResourceName]) {
    throw new Error(`Failed to create analytics resource for ${resourceName}.${fieldName}: ${err?.message}`);
  }
  handler.analyticsResource = ok ? analyticsResource : database.resources[analyticsResourceName];
}
function addHelperMethodsForHandler(handler, plugin, config) {
  const resource = handler.targetResource;
  const fieldName = handler.field;
  if (!resource._eventualConsistencyPlugins) {
    resource._eventualConsistencyPlugins = {};
  }
  resource._eventualConsistencyPlugins[fieldName] = handler;
  if (!resource.add) {
    addHelperMethods(resource, plugin, config);
  }
}
async function onStart(fieldHandlers, config, runConsolidationFn, runGCFn, emitFn) {
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    for (const [fieldName, handler] of resourceHandlers) {
      if (!handler.deferredSetup) {
        if (config.autoConsolidate && config.mode === "async") {
          startConsolidationTimer(handler, resourceName, fieldName, runConsolidationFn, config);
        }
        if (config.transactionRetention && config.transactionRetention > 0) {
          startGarbageCollectionTimer(handler, resourceName, fieldName, runGCFn, config);
        }
        if (emitFn) {
          emitFn("eventual-consistency.started", {
            resource: resourceName,
            field: fieldName,
            cohort: config.cohort
          });
        }
      }
    }
  }
}
async function onStop(fieldHandlers, emitFn) {
  for (const [resourceName, resourceHandlers] of fieldHandlers) {
    for (const [fieldName, handler] of resourceHandlers) {
      if (handler.consolidationTimer) {
        clearInterval(handler.consolidationTimer);
        handler.consolidationTimer = null;
      }
      if (handler.gcTimer) {
        clearInterval(handler.gcTimer);
        handler.gcTimer = null;
      }
      if (handler.pendingTransactions && handler.pendingTransactions.size > 0) {
        await flushPendingTransactions(handler);
      }
      if (emitFn) {
        emitFn("eventual-consistency.stopped", {
          resource: resourceName,
          field: fieldName
        });
      }
    }
  }
}

class EventualConsistencyPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    validateResourcesConfig(options.resources);
    const detectedTimezone = detectTimezone();
    const timezoneAutoDetected = !options.cohort?.timezone;
    this.config = createConfig(options, detectedTimezone);
    this.fieldHandlers = /* @__PURE__ */ new Map();
    for (const [resourceName, fields] of Object.entries(options.resources)) {
      const resourceHandlers = /* @__PURE__ */ new Map();
      for (const fieldName of fields) {
        resourceHandlers.set(fieldName, createFieldHandler(resourceName, fieldName));
      }
      this.fieldHandlers.set(resourceName, resourceHandlers);
    }
    logConfigWarnings(this.config);
    logInitialization(this.config, this.fieldHandlers, timezoneAutoDetected);
  }
  /**
   * Install hook - create resources and register helpers
   */
  async onInstall() {
    await onInstall(
      this.database,
      this.fieldHandlers,
      (handler) => completeFieldSetup(handler, this.database, this.config, this),
      (resourceName) => watchForResource(
        resourceName,
        this.database,
        this.fieldHandlers,
        (handler) => completeFieldSetup(handler, this.database, this.config, this)
      )
    );
  }
  /**
   * Start hook - begin timers and emit events
   */
  async onStart() {
    await onStart(
      this.fieldHandlers,
      this.config,
      (handler, resourceName, fieldName) => this._runConsolidationForHandler(handler, resourceName, fieldName),
      (handler, resourceName, fieldName) => this._runGarbageCollectionForHandler(handler, resourceName, fieldName),
      (event, data) => this.emit(event, data)
    );
  }
  /**
   * Stop hook - stop timers and flush pending
   */
  async onStop() {
    await onStop(
      this.fieldHandlers,
      (event, data) => this.emit(event, data)
    );
  }
  /**
   * Create partition configuration
   * @returns {Object} Partition configuration
   */
  createPartitionConfig() {
    return createPartitionConfig();
  }
  /**
   * Get cohort information for a date
   * @param {Date} date - Date to get cohort info for
   * @returns {Object} Cohort information
   */
  getCohortInfo(date) {
    return getCohortInfo(date, this.config.cohort.timezone, this.config.verbose);
  }
  /**
   * Create a transaction for a field handler
   * @param {Object} handler - Field handler
   * @param {Object} data - Transaction data
   * @returns {Promise<Object|null>} Created transaction
   */
  async createTransaction(handler, data) {
    return await createTransaction(handler, data, this.config);
  }
  /**
   * Consolidate a single record (internal method)
   * This is used internally by consolidation timers and helper methods
   * @private
   */
  async consolidateRecord(originalId) {
    return await consolidateRecord(
      originalId,
      this.transactionResource,
      this.targetResource,
      this.getStorage(),
      this.analyticsResource,
      (transactions) => this.updateAnalytics(transactions),
      this.config
    );
  }
  /**
   * Get consolidated value without applying (internal method)
   * @private
   */
  async getConsolidatedValue(originalId, options = {}) {
    return await getConsolidatedValue(
      originalId,
      options,
      this.transactionResource,
      this.targetResource,
      this.config
    );
  }
  /**
   * Get cohort statistics
   * @param {string} cohortDate - Cohort date
   * @returns {Promise<Object|null>} Cohort statistics
   */
  async getCohortStats(cohortDate) {
    return await getCohortStats(cohortDate, this.transactionResource);
  }
  /**
   * Recalculate from scratch (internal method)
   * @private
   */
  async recalculateRecord(originalId) {
    return await recalculateRecord(
      originalId,
      this.transactionResource,
      this.targetResource,
      this.getStorage(),
      (id) => this.consolidateRecord(id),
      this.config
    );
  }
  /**
   * Update analytics
   * @private
   */
  async updateAnalytics(transactions) {
    return await updateAnalytics(transactions, this.analyticsResource, this.config);
  }
  /**
   * Helper method for sync mode consolidation
   * @private
   */
  async _syncModeConsolidate(handler, id, field) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;
    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;
    const result = await this.consolidateRecord(id);
    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.analyticsResource = oldAnalyticsResource;
    return result;
  }
  /**
   * Helper method for consolidate with handler
   * @private
   */
  async _consolidateWithHandler(handler, id) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;
    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;
    const result = await this.consolidateRecord(id);
    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.analyticsResource = oldAnalyticsResource;
    return result;
  }
  /**
   * Helper method for getConsolidatedValue with handler
   * @private
   */
  async _getConsolidatedValueWithHandler(handler, id, options) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    const result = await this.getConsolidatedValue(id, options);
    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    return result;
  }
  /**
   * Helper method for recalculate with handler
   * @private
   */
  async _recalculateWithHandler(handler, id) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;
    this.config.resource = handler.resource;
    this.config.field = handler.field;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;
    const result = await this.recalculateRecord(id);
    this.config.resource = oldResource;
    this.config.field = oldField;
    this.transactionResource = oldTransactionResource;
    this.targetResource = oldTargetResource;
    this.analyticsResource = oldAnalyticsResource;
    return result;
  }
  /**
   * Run consolidation for a handler
   * @private
   */
  async _runConsolidationForHandler(handler, resourceName, fieldName) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    const oldAnalyticsResource = this.analyticsResource;
    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    this.analyticsResource = handler.analyticsResource;
    try {
      await runConsolidation(
        this.transactionResource,
        (id) => this.consolidateRecord(id),
        (event, data) => this.emit(event, data),
        this.config
      );
    } finally {
      this.config.resource = oldResource;
      this.config.field = oldField;
      this.transactionResource = oldTransactionResource;
      this.targetResource = oldTargetResource;
      this.analyticsResource = oldAnalyticsResource;
    }
  }
  /**
   * Run garbage collection for a handler
   * @private
   */
  async _runGarbageCollectionForHandler(handler, resourceName, fieldName) {
    const oldResource = this.config.resource;
    const oldField = this.config.field;
    const oldTransactionResource = this.transactionResource;
    const oldTargetResource = this.targetResource;
    this.config.resource = resourceName;
    this.config.field = fieldName;
    this.transactionResource = handler.transactionResource;
    this.targetResource = handler.targetResource;
    try {
      await runGarbageCollection(
        this.transactionResource,
        this.getStorage(),
        this.config,
        (event, data) => this.emit(event, data)
      );
    } finally {
      this.config.resource = oldResource;
      this.config.field = oldField;
      this.transactionResource = oldTransactionResource;
      this.targetResource = oldTargetResource;
    }
  }
  // Public Analytics API
  /**
   * Get analytics for a specific period
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Analytics data
   */
  async getAnalytics(resourceName, field, options = {}) {
    return await getAnalytics(resourceName, field, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire month, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics for the month
   */
  async getMonthByDay(resourceName, field, month, options = {}) {
    return await getMonthByDay(resourceName, field, month, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire day, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics for the day
   */
  async getDayByHour(resourceName, field, date, options = {}) {
    return await getDayByHour(resourceName, field, date, options, this.fieldHandlers);
  }
  /**
   * Get analytics for last N days, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} days - Number of days to look back (default: 7)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics
   */
  async getLastNDays(resourceName, field, days = 7, options = {}) {
    return await getLastNDays(resourceName, field, days, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire year, broken down by months
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} year - Year (e.g., 2025)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Monthly analytics for the year
   */
  async getYearByMonth(resourceName, field, year, options = {}) {
    return await getYearByMonth(resourceName, field, year, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire month, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format (or 'last' for previous month)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics for the month
   */
  async getMonthByHour(resourceName, field, month, options = {}) {
    return await getMonthByHour(resourceName, field, month, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire year, broken down by weeks
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} year - Year (e.g., 2025)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Weekly analytics for the year (up to 53 weeks)
   */
  async getYearByWeek(resourceName, field, year, options = {}) {
    return await getYearByWeek(resourceName, field, year, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire month, broken down by weeks
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} month - Month in YYYY-MM format
   * @param {Object} options - Options
   * @returns {Promise<Array>} Weekly analytics for the month
   */
  async getMonthByWeek(resourceName, field, month, options = {}) {
    return await getMonthByWeek(resourceName, field, month, options, this.fieldHandlers);
  }
  /**
   * Get top records by volume
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Top records
   */
  async getTopRecords(resourceName, field, options = {}) {
    return await getTopRecords(resourceName, field, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire year, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} year - Year (e.g., 2025)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics for the year (up to 365/366 records)
   */
  async getYearByDay(resourceName, field, year, options = {}) {
    return await getYearByDay(resourceName, field, year, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire week, broken down by days
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} week - Week in YYYY-Www format (e.g., '2025-W42')
   * @param {Object} options - Options
   * @returns {Promise<Array>} Daily analytics for the week (7 records)
   */
  async getWeekByDay(resourceName, field, week, options = {}) {
    return await getWeekByDay(resourceName, field, week, options, this.fieldHandlers);
  }
  /**
   * Get analytics for entire week, broken down by hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {string} week - Week in YYYY-Www format (e.g., '2025-W42')
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics for the week (168 records)
   */
  async getWeekByHour(resourceName, field, week, options = {}) {
    return await getWeekByHour(resourceName, field, week, options, this.fieldHandlers);
  }
  /**
   * Get analytics for last N hours
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} hours - Number of hours to look back (default: 24)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Hourly analytics
   */
  async getLastNHours(resourceName, field, hours = 24, options = {}) {
    return await getLastNHours(resourceName, field, hours, options, this.fieldHandlers);
  }
  /**
   * Get analytics for last N weeks
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} weeks - Number of weeks to look back (default: 4)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Weekly analytics
   */
  async getLastNWeeks(resourceName, field, weeks = 4, options = {}) {
    return await getLastNWeeks(resourceName, field, weeks, options, this.fieldHandlers);
  }
  /**
   * Get analytics for last N months
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {number} months - Number of months to look back (default: 12)
   * @param {Object} options - Options
   * @returns {Promise<Array>} Monthly analytics
   */
  async getLastNMonths(resourceName, field, months = 12, options = {}) {
    return await getLastNMonths(resourceName, field, months, options, this.fieldHandlers);
  }
  /**
   * Get raw transaction events for custom aggregation
   *
   * This method provides direct access to the underlying transaction events,
   * allowing developers to perform custom aggregations beyond the pre-built analytics.
   * Useful for complex queries, custom metrics, or when you need the raw event data.
   *
   * @param {string} resourceName - Resource name
   * @param {string} field - Field name
   * @param {Object} options - Query options
   * @param {string} options.recordId - Filter by specific record ID
   * @param {string} options.startDate - Start date filter (YYYY-MM-DD or YYYY-MM-DDTHH)
   * @param {string} options.endDate - End date filter (YYYY-MM-DD or YYYY-MM-DDTHH)
   * @param {string} options.cohortDate - Filter by cohort date (YYYY-MM-DD)
   * @param {string} options.cohortHour - Filter by cohort hour (YYYY-MM-DDTHH)
   * @param {string} options.cohortMonth - Filter by cohort month (YYYY-MM)
   * @param {boolean} options.applied - Filter by applied status (true/false/undefined for both)
   * @param {string} options.operation - Filter by operation type ('add', 'sub', 'set')
   * @param {number} options.limit - Maximum number of events to return
   * @returns {Promise<Array>} Raw transaction events
   *
   * @example
   * // Get all events for a specific record
   * const events = await plugin.getRawEvents('wallets', 'balance', {
   *   recordId: 'wallet1'
   * });
   *
   * @example
   * // Get events for a specific time range
   * const events = await plugin.getRawEvents('wallets', 'balance', {
   *   startDate: '2025-10-01',
   *   endDate: '2025-10-31'
   * });
   *
   * @example
   * // Get only pending (unapplied) transactions
   * const pending = await plugin.getRawEvents('wallets', 'balance', {
   *   applied: false
   * });
   */
  async getRawEvents(resourceName, field, options = {}) {
    return await getRawEvents(resourceName, field, options, this.fieldHandlers);
  }
  /**
   * Get diagnostics information about the plugin state
   *
   * This method provides comprehensive diagnostic information about the EventualConsistencyPlugin,
   * including configured resources, field handlers, timers, and overall health status.
   * Useful for debugging initialization issues, configuration problems, or runtime errors.
   *
   * @param {Object} options - Diagnostic options
   * @param {string} options.resourceName - Optional: limit diagnostics to specific resource
   * @param {string} options.field - Optional: limit diagnostics to specific field
   * @param {boolean} options.includeStats - Include transaction statistics (default: false)
   * @returns {Promise<Object>} Diagnostic information
   *
   * @example
   * // Get overall plugin diagnostics
   * const diagnostics = await plugin.getDiagnostics();
   * console.log(diagnostics);
   *
   * @example
   * // Get diagnostics for specific resource/field with stats
   * const diagnostics = await plugin.getDiagnostics({
   *   resourceName: 'wallets',
   *   field: 'balance',
   *   includeStats: true
   * });
   */
  async getDiagnostics(options = {}) {
    const { resourceName, field, includeStats = false } = options;
    const diagnostics = {
      plugin: {
        name: "EventualConsistencyPlugin",
        initialized: this.database !== null && this.database !== void 0,
        verbose: this.config.verbose || false,
        timezone: this.config.cohort?.timezone || "UTC",
        consolidation: {
          mode: this.config.consolidation?.mode || "timer",
          interval: this.config.consolidation?.interval || 6e4,
          batchSize: this.config.consolidation?.batchSize || 100
        },
        garbageCollection: {
          enabled: this.config.garbageCollection?.enabled !== false,
          retentionDays: this.config.garbageCollection?.retentionDays || 30,
          interval: this.config.garbageCollection?.interval || 36e5
        }
      },
      resources: [],
      errors: [],
      warnings: []
    };
    for (const [resName, resourceHandlers] of this.fieldHandlers.entries()) {
      if (resourceName && resName !== resourceName) {
        continue;
      }
      const resourceDiag = {
        name: resName,
        fields: []
      };
      for (const [fieldName, handler] of resourceHandlers.entries()) {
        if (field && fieldName !== field) {
          continue;
        }
        const fieldDiag = {
          name: fieldName,
          type: handler.type || "counter",
          analyticsEnabled: handler.analyticsResource !== null && handler.analyticsResource !== void 0,
          resources: {
            transaction: handler.transactionResource?.name || null,
            target: handler.targetResource?.name || null,
            analytics: handler.analyticsResource?.name || null
          },
          timers: {
            consolidation: handler.consolidationTimer !== null && handler.consolidationTimer !== void 0,
            garbageCollection: handler.garbageCollectionTimer !== null && handler.garbageCollectionTimer !== void 0
          }
        };
        if (!handler.transactionResource) {
          diagnostics.errors.push({
            resource: resName,
            field: fieldName,
            issue: "Missing transaction resource",
            suggestion: "Ensure plugin is installed and resources are created after plugin installation"
          });
        }
        if (!handler.targetResource) {
          diagnostics.warnings.push({
            resource: resName,
            field: fieldName,
            issue: "Missing target resource",
            suggestion: "Target resource may not have been created yet"
          });
        }
        if (handler.analyticsResource && !handler.analyticsResource.name) {
          diagnostics.errors.push({
            resource: resName,
            field: fieldName,
            issue: "Invalid analytics resource",
            suggestion: "Analytics resource exists but has no name - possible initialization failure"
          });
        }
        if (includeStats && handler.transactionResource) {
          try {
            const [okPending, errPending, pendingTxns] = await handler.transactionResource.query({ applied: false }).catch(() => [false, null, []]);
            const [okApplied, errApplied, appliedTxns] = await handler.transactionResource.query({ applied: true }).catch(() => [false, null, []]);
            fieldDiag.stats = {
              pendingTransactions: okPending ? pendingTxns?.length || 0 : "error",
              appliedTransactions: okApplied ? appliedTxns?.length || 0 : "error",
              totalTransactions: okPending && okApplied ? (pendingTxns?.length || 0) + (appliedTxns?.length || 0) : "error"
            };
            if (handler.analyticsResource) {
              const [okAnalytics, errAnalytics, analyticsRecords] = await handler.analyticsResource.list().catch(() => [false, null, []]);
              fieldDiag.stats.analyticsRecords = okAnalytics ? analyticsRecords?.length || 0 : "error";
            }
          } catch (error) {
            diagnostics.warnings.push({
              resource: resName,
              field: fieldName,
              issue: "Failed to fetch statistics",
              error: error.message
            });
          }
        }
        resourceDiag.fields.push(fieldDiag);
      }
      if (resourceDiag.fields.length > 0) {
        diagnostics.resources.push(resourceDiag);
      }
    }
    diagnostics.health = {
      status: diagnostics.errors.length === 0 ? diagnostics.warnings.length === 0 ? "healthy" : "warning" : "error",
      totalResources: diagnostics.resources.length,
      totalFields: diagnostics.resources.reduce((sum, r) => sum + r.fields.length, 0),
      errorCount: diagnostics.errors.length,
      warningCount: diagnostics.warnings.length
    };
    return diagnostics;
  }
}

class FulltextError extends S3dbError {
  constructor(message, details = {}) {
    const { resourceName, query, operation = "unknown", ...rest } = details;
    let description = details.description;
    if (!description) {
      description = `
Fulltext Search Operation Error

Operation: ${operation}
${resourceName ? `Resource: ${resourceName}` : ""}
${query ? `Query: ${query}` : ""}

Common causes:
1. Resource not indexed for fulltext search
2. Invalid query syntax
3. Index not built yet
4. Search configuration missing
5. Field not indexed

Solution:
Ensure resource is configured for fulltext search and index is built.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/fulltext.md
`.trim();
    }
    super(message, { ...rest, resourceName, query, operation, description });
  }
}

class FullTextPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.indexResource = null;
    this.config = {
      minWordLength: options.minWordLength || 3,
      maxResults: options.maxResults || 100,
      ...options
    };
    this.indexes = /* @__PURE__ */ new Map();
    this.dirtyIndexes = /* @__PURE__ */ new Set();
    this.deletedIndexes = /* @__PURE__ */ new Set();
  }
  async onInstall() {
    const [ok, err, indexResource] = await tryFn(() => this.database.createResource({
      name: "plg_fulltext_indexes",
      attributes: {
        id: "string|required",
        resourceName: "string|required",
        fieldName: "string|required",
        word: "string|required",
        recordIds: "json|required",
        // Array of record IDs containing this word
        count: "number|required",
        lastUpdated: "string|required"
      },
      partitions: {
        byResource: { fields: { resourceName: "string" } }
      },
      behavior: "body-overflow"
    }));
    this.indexResource = ok ? indexResource : this.database.resources.fulltext_indexes;
    await this.loadIndexes();
    this.installDatabaseHooks();
    this.installIndexingHooks();
  }
  async start() {
  }
  async stop() {
    await this.saveIndexes();
    this.removeDatabaseHooks();
  }
  async loadIndexes() {
    if (!this.indexResource) return;
    const [ok, err, allIndexes] = await tryFn(() => this.indexResource.getAll());
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
    const [ok, err] = await tryFn(async () => {
      for (const key of this.deletedIndexes) {
        const [resourceName] = key.split(":");
        const [queryOk, queryErr, results] = await tryFn(
          () => this.indexResource.query({ resourceName })
        );
        if (queryOk && results) {
          for (const index of results) {
            const indexKey = `${index.resourceName}:${index.fieldName}:${index.word}`;
            if (indexKey === key) {
              await this.indexResource.delete(index.id);
            }
          }
        }
      }
      for (const key of this.dirtyIndexes) {
        const [resourceName, fieldName, word] = key.split(":");
        const data = this.indexes.get(key);
        if (!data) continue;
        const [queryOk, queryErr, results] = await tryFn(
          () => this.indexResource.query({ resourceName })
        );
        let existingRecord = null;
        if (queryOk && results) {
          existingRecord = results.find(
            (index) => index.resourceName === resourceName && index.fieldName === fieldName && index.word === word
          );
        }
        if (existingRecord) {
          await this.indexResource.update(existingRecord.id, {
            recordIds: data.recordIds,
            count: data.count,
            lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
          });
        } else {
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
      }
      this.dirtyIndexes.clear();
      this.deletedIndexes.clear();
    });
  }
  installDatabaseHooks() {
    this.database.addHook("afterCreateResource", (resource) => {
      if (resource.name !== "plg_fulltext_indexes") {
        this.installResourceHooks(resource);
      }
    });
  }
  removeDatabaseHooks() {
    this.database.removeHook("afterCreateResource", this.installResourceHooks.bind(this));
  }
  installIndexingHooks() {
    if (!this.database.plugins) {
      this.database.plugins = {};
    }
    this.database.plugins.fulltext = this;
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name === "plg_fulltext_indexes") continue;
      this.installResourceHooks(resource);
    }
    if (!this.database._fulltextProxyInstalled) {
      this.database._previousCreateResourceForFullText = this.database.createResource;
      this.database.createResource = async function(...args) {
        const resource = await this._previousCreateResourceForFullText(...args);
        if (this.plugins?.fulltext && resource.name !== "plg_fulltext_indexes") {
          this.plugins.fulltext.installResourceHooks(resource);
        }
        return resource;
      };
      this.database._fulltextProxyInstalled = true;
    }
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== "plg_fulltext_indexes") {
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
      this.indexRecord(resource.name, result.id, data).catch(() => {
      });
      return result;
    });
    this.wrapResourceMethod(resource, "update", async (result, args, methodName) => {
      const [id, data] = args;
      this.removeRecordFromIndex(resource.name, id).catch(() => {
      });
      this.indexRecord(resource.name, id, result).catch(() => {
      });
      return result;
    });
    this.wrapResourceMethod(resource, "delete", async (result, args, methodName) => {
      const [id] = args;
      this.removeRecordFromIndex(resource.name, id).catch(() => {
      });
      return result;
    });
    this.wrapResourceMethod(resource, "deleteMany", async (result, args, methodName) => {
      const [ids] = args;
      for (const id of ids) {
        this.removeRecordFromIndex(resource.name, id).catch(() => {
        });
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
        this.dirtyIndexes.add(key);
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
            this.deletedIndexes.add(key);
          } else {
            this.indexes.set(key, data);
            this.dirtyIndexes.add(key);
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
      throw new FulltextError(`Resource '${resourceName}' not found`, {
        operation: "searchRecords",
        resourceName,
        query,
        availableResources: Object.keys(this.database.resources),
        suggestion: "Check resource name or ensure resource is created before searching"
      });
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
      throw new FulltextError(`Resource '${resourceName}' not found`, {
        operation: "rebuildIndex",
        resourceName,
        availableResources: Object.keys(this.database.resources),
        suggestion: "Check resource name or ensure resource is created before rebuilding index"
      });
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
        const [ok, err] = await tryFn(() => this.indexRecord(resourceName, record.id, record));
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
    const resourceNames = Object.keys(this.database.resources).filter((name) => name !== "plg_fulltext_indexes");
    for (const resourceName of resourceNames) {
      const [ok, err] = await tryFn(() => this.rebuildIndex(resourceName));
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

class MetricsPlugin extends Plugin {
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
  async onInstall() {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return;
    const [ok, err] = await tryFn(async () => {
      const [ok1, err1, metricsResource] = await tryFn(() => this.database.createResource({
        name: "plg_metrics",
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
          metadata: "json",
          createdAt: "string|required"
          // YYYY-MM-DD for partitioning
        },
        partitions: {
          byDate: { fields: { createdAt: "string|maxlength:10" } }
        },
        behavior: "body-overflow"
      }));
      this.metricsResource = ok1 ? metricsResource : this.database.resources.plg_metrics;
      const [ok2, err2, errorsResource] = await tryFn(() => this.database.createResource({
        name: "plg_error_logs",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          error: "string|required",
          timestamp: "string|required",
          metadata: "json",
          createdAt: "string|required"
          // YYYY-MM-DD for partitioning
        },
        partitions: {
          byDate: { fields: { createdAt: "string|maxlength:10" } }
        },
        behavior: "body-overflow"
      }));
      this.errorsResource = ok2 ? errorsResource : this.database.resources.plg_error_logs;
      const [ok3, err3, performanceResource] = await tryFn(() => this.database.createResource({
        name: "plg_performance_logs",
        attributes: {
          id: "string|required",
          resourceName: "string|required",
          operation: "string|required",
          duration: "number|required",
          timestamp: "string|required",
          metadata: "json",
          createdAt: "string|required"
          // YYYY-MM-DD for partitioning
        },
        partitions: {
          byDate: { fields: { createdAt: "string|maxlength:10" } }
        },
        behavior: "body-overflow"
      }));
      this.performanceResource = ok3 ? performanceResource : this.database.resources.plg_performance_logs;
    });
    if (!ok) {
      this.metricsResource = this.database.resources.plg_metrics;
      this.errorsResource = this.database.resources.plg_error_logs;
      this.performanceResource = this.database.resources.plg_performance_logs;
    }
    this.installDatabaseHooks();
    this.installMetricsHooks();
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
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
    this.removeDatabaseHooks();
  }
  installDatabaseHooks() {
    this.database.addHook("afterCreateResource", (resource) => {
      if (resource.name !== "plg_metrics" && resource.name !== "plg_error_logs" && resource.name !== "plg_performance_logs") {
        this.installResourceHooks(resource);
      }
    });
  }
  removeDatabaseHooks() {
    this.database.removeHook("afterCreateResource", this.installResourceHooks.bind(this));
  }
  installMetricsHooks() {
    for (const resource of Object.values(this.database.resources)) {
      if (["plg_metrics", "plg_error_logs", "plg_performance_logs"].includes(resource.name)) {
        continue;
      }
      this.installResourceHooks(resource);
    }
    this.database._createResource = this.database.createResource;
    this.database.createResource = async function(...args) {
      const resource = await this._createResource(...args);
      if (this.plugins?.metrics && !["plg_metrics", "plg_error_logs", "plg_performance_logs"].includes(resource.name)) {
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
      const [ok, err, result] = await tryFn(() => resource._insert(...args));
      this.recordOperation(resource.name, "insert", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "insert", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.update = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._update(...args));
      this.recordOperation(resource.name, "update", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "update", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.delete = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._delete(...args));
      this.recordOperation(resource.name, "delete", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "delete", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.deleteMany = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._deleteMany(...args));
      this.recordOperation(resource.name, "delete", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "delete", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.get = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._get(...args));
      this.recordOperation(resource.name, "get", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "get", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.getMany = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getMany(...args));
      this.recordOperation(resource.name, "get", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "get", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.getAll = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getAll(...args));
      this.recordOperation(resource.name, "list", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "list", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.list = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._list(...args));
      this.recordOperation(resource.name, "list", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "list", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.listIds = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._listIds(...args));
      this.recordOperation(resource.name, "list", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "list", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.count = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._count(...args));
      this.recordOperation(resource.name, "count", Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, "count", err);
      if (!ok) throw err;
      return result;
    }.bind(this);
    resource.page = async function(...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._page(...args));
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
        this.flushMetrics().catch(() => {
        });
      }, this.config.flushInterval);
    }
  }
  async flushMetrics() {
    if (!this.metricsResource) return;
    const [ok, err] = await tryFn(async () => {
      let metadata, perfMetadata, errorMetadata, resourceMetadata;
      if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
        metadata = {};
        perfMetadata = {};
        errorMetadata = {};
        resourceMetadata = {};
      } else {
        metadata = { global: "true" };
        perfMetadata = { perf: "true" };
        errorMetadata = { error: "true" };
        resourceMetadata = { resource: "true" };
      }
      const now = /* @__PURE__ */ new Date();
      const createdAt = now.toISOString().slice(0, 10);
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
            timestamp: now.toISOString(),
            createdAt,
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
              timestamp: now.toISOString(),
              createdAt,
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
            createdAt: perf.timestamp.slice(0, 10),
            // YYYY-MM-DD from timestamp
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
            createdAt: error.timestamp.slice(0, 10),
            // YYYY-MM-DD from timestamp
            metadata: errorMetadata
          });
        }
      }
      this.resetMetrics();
    });
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
    cutoffDate.toISOString().slice(0, 10);
    const datesToDelete = [];
    const startDate = new Date(cutoffDate);
    startDate.setDate(startDate.getDate() - 365);
    for (let d = new Date(startDate); d < cutoffDate; d.setDate(d.getDate() + 1)) {
      datesToDelete.push(d.toISOString().slice(0, 10));
    }
    if (this.metricsResource) {
      for (const dateStr of datesToDelete) {
        const [ok, err, oldMetrics] = await tryFn(
          () => this.metricsResource.query({ createdAt: dateStr })
        );
        if (ok && oldMetrics) {
          for (const metric of oldMetrics) {
            await tryFn(() => this.metricsResource.delete(metric.id));
          }
        }
      }
    }
    if (this.errorsResource) {
      for (const dateStr of datesToDelete) {
        const [ok, err, oldErrors] = await tryFn(
          () => this.errorsResource.query({ createdAt: dateStr })
        );
        if (ok && oldErrors) {
          for (const error of oldErrors) {
            await tryFn(() => this.errorsResource.delete(error.id));
          }
        }
      }
    }
    if (this.performanceResource) {
      for (const dateStr of datesToDelete) {
        const [ok, err, oldPerformance] = await tryFn(
          () => this.performanceResource.query({ createdAt: dateStr })
        );
        if (ok && oldPerformance) {
          for (const perf of oldPerformance) {
            await tryFn(() => this.performanceResource.delete(perf.id));
          }
        }
      }
    }
  }
}

class SqsConsumer {
  constructor({ queueUrl, onMessage, onError, poolingInterval = 5e3, maxMessages = 10, region = "us-east-1", credentials, endpoint, driver = "sqs" }) {
    this.driver = driver;
    this.queueUrl = queueUrl;
    this.onMessage = onMessage;
    this.onError = onError;
    this.poolingInterval = poolingInterval;
    this.maxMessages = maxMessages;
    this.region = region;
    this.credentials = credentials;
    this.endpoint = endpoint;
    this.sqs = null;
    this._stopped = false;
    this._timer = null;
    this._pollPromise = null;
    this._pollResolve = null;
    this._SQSClient = null;
    this._ReceiveMessageCommand = null;
    this._DeleteMessageCommand = null;
  }
  async start() {
    const [ok, err, sdk] = await tryFn(() => import('@aws-sdk/client-sqs'));
    if (!ok) throw new Error("SqsConsumer: @aws-sdk/client-sqs is not installed. Please install it to use the SQS consumer.");
    const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = sdk;
    this._SQSClient = SQSClient;
    this._ReceiveMessageCommand = ReceiveMessageCommand;
    this._DeleteMessageCommand = DeleteMessageCommand;
    this.sqs = new SQSClient({ region: this.region, credentials: this.credentials, endpoint: this.endpoint });
    this._stopped = false;
    this._pollPromise = new Promise((resolve) => {
      this._pollResolve = resolve;
    });
    this._poll();
  }
  async stop() {
    this._stopped = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._pollResolve) {
      this._pollResolve();
    }
  }
  async _poll() {
    if (this._stopped) {
      if (this._pollResolve) this._pollResolve();
      return;
    }
    const [ok, err, result] = await tryFn(async () => {
      const cmd = new this._ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: this.maxMessages,
        WaitTimeSeconds: 10,
        MessageAttributeNames: ["All"]
      });
      const { Messages } = await this.sqs.send(cmd);
      if (Messages && Messages.length > 0) {
        for (const msg of Messages) {
          const [okMsg, errMsg] = await tryFn(async () => {
            const parsedMsg = this._parseMessage(msg);
            await this.onMessage(parsedMsg, msg);
            await this.sqs.send(new this._DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: msg.ReceiptHandle
            }));
          });
          if (!okMsg && this.onError) {
            this.onError(errMsg, msg);
          }
        }
      }
    });
    if (!ok && this.onError) {
      this.onError(err);
    }
    this._timer = setTimeout(() => this._poll(), this.poolingInterval);
  }
  _parseMessage(msg) {
    let body;
    const [ok, err, parsed] = tryFn(() => JSON.parse(msg.Body));
    body = ok ? parsed : msg.Body;
    const attributes = {};
    if (msg.MessageAttributes) {
      for (const [k, v] of Object.entries(msg.MessageAttributes)) {
        attributes[k] = v.StringValue;
      }
    }
    return { $body: body, $attributes: attributes, $raw: msg };
  }
}

class RabbitMqConsumer {
  constructor({ amqpUrl, queue, prefetch = 10, reconnectInterval = 2e3, onMessage, onError, driver = "rabbitmq" }) {
    this.amqpUrl = amqpUrl;
    this.queue = queue;
    this.prefetch = prefetch;
    this.reconnectInterval = reconnectInterval;
    this.onMessage = onMessage;
    this.onError = onError;
    this.driver = driver;
    this.connection = null;
    this.channel = null;
    this._stopped = false;
  }
  async start() {
    this._stopped = false;
    await this._connect();
  }
  async stop() {
    this._stopped = true;
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }
  async _connect() {
    const [ok, err] = await tryFn(async () => {
      const amqp = (await import('amqplib')).default;
      this.connection = await amqp.connect(this.amqpUrl);
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(this.queue, { durable: true });
      this.channel.prefetch(this.prefetch);
      this.channel.consume(this.queue, async (msg) => {
        if (msg !== null) {
          const [okMsg, errMsg] = await tryFn(async () => {
            const content = JSON.parse(msg.content.toString());
            await this.onMessage({ $body: content, $raw: msg });
            this.channel.ack(msg);
          });
          if (!okMsg) {
            if (this.onError) this.onError(errMsg, msg);
            this.channel.nack(msg, false, false);
          }
        }
      });
    });
    if (!ok) {
      if (this.onError) this.onError(err);
      if (!this._stopped) {
        setTimeout(() => this._connect(), this.reconnectInterval);
      }
    }
  }
}

const CONSUMER_DRIVERS = {
  sqs: SqsConsumer,
  rabbitmq: RabbitMqConsumer
  // kafka: KafkaConsumer, // futuro
};
function createConsumer(driver, config) {
  const ConsumerClass = CONSUMER_DRIVERS[driver];
  if (!ConsumerClass) {
    throw new Error(`Unknown consumer driver: ${driver}. Available: ${Object.keys(CONSUMER_DRIVERS).join(", ")}`);
  }
  return new ConsumerClass(config);
}

class QueueError extends S3dbError {
  constructor(message, details = {}) {
    const { queueName, operation = "unknown", messageId, ...rest } = details;
    let description = details.description;
    if (!description) {
      description = `
Queue Operation Error

Operation: ${operation}
${queueName ? `Queue: ${queueName}` : ""}
${messageId ? `Message ID: ${messageId}` : ""}

Common causes:
1. Queue not properly configured
2. Message handler not registered
3. Queue resource not found
4. SQS/RabbitMQ connection failed
5. Message processing timeout

Solution:
Check queue configuration and message handler registration.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/queue.md
`.trim();
    }
    super(message, { ...rest, queueName, operation, messageId, description });
  }
}

class QueueConsumerPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.options = options;
    this.driversConfig = Array.isArray(options.consumers) ? options.consumers : [];
    this.consumers = [];
  }
  async onInstall() {
    for (const driverDef of this.driversConfig) {
      const { driver, config: driverConfig = {}, consumers: consumerDefs = [] } = driverDef;
      if (consumerDefs.length === 0 && driverDef.resources) {
        const { resources, driver: defDriver, config: nestedConfig, ...directConfig } = driverDef;
        const resourceList = Array.isArray(resources) ? resources : [resources];
        const flatConfig = nestedConfig ? { ...directConfig, ...nestedConfig } : directConfig;
        for (const resource of resourceList) {
          const consumer = createConsumer(driver, {
            ...flatConfig,
            onMessage: (msg) => this._handleMessage(msg, resource),
            onError: (err, raw) => this._handleError(err, raw, resource)
          });
          await consumer.start();
          this.consumers.push(consumer);
        }
      } else {
        for (const consumerDef of consumerDefs) {
          const { resources, ...consumerConfig } = consumerDef;
          const resourceList = Array.isArray(resources) ? resources : [resources];
          for (const resource of resourceList) {
            const mergedConfig = { ...driverConfig, ...consumerConfig };
            const consumer = createConsumer(driver, {
              ...mergedConfig,
              onMessage: (msg) => this._handleMessage(msg, resource),
              onError: (err, raw) => this._handleError(err, raw, resource)
            });
            await consumer.start();
            this.consumers.push(consumer);
          }
        }
      }
    }
  }
  async stop() {
    if (!Array.isArray(this.consumers)) this.consumers = [];
    for (const consumer of this.consumers) {
      if (consumer && typeof consumer.stop === "function") {
        await consumer.stop();
      }
    }
    this.consumers = [];
  }
  async _handleMessage(msg, configuredResource) {
    this.options;
    let body = msg.$body || msg;
    if (body.$body && !body.resource && !body.action && !body.data) {
      body = body.$body;
    }
    let resource = body.resource || msg.resource;
    let action = body.action || msg.action;
    let data = body.data || msg.data;
    if (!resource) {
      throw new QueueError("Resource not found in message", {
        operation: "handleMessage",
        queueName: configuredResource,
        messageBody: body,
        suggestion: 'Ensure message includes a "resource" field specifying the target resource name'
      });
    }
    if (!action) {
      throw new QueueError("Action not found in message", {
        operation: "handleMessage",
        queueName: configuredResource,
        resource,
        messageBody: body,
        suggestion: 'Ensure message includes an "action" field (insert, update, or delete)'
      });
    }
    const resourceObj = this.database.resources[resource];
    if (!resourceObj) {
      throw new QueueError(`Resource '${resource}' not found`, {
        operation: "handleMessage",
        queueName: configuredResource,
        resource,
        availableResources: Object.keys(this.database.resources),
        suggestion: "Check resource name or ensure resource is created before consuming messages"
      });
    }
    let result;
    const [ok, err, res] = await tryFn(async () => {
      if (action === "insert") {
        result = await resourceObj.insert(data);
      } else if (action === "update") {
        const { id: updateId, ...updateAttributes } = data;
        result = await resourceObj.update(updateId, updateAttributes);
      } else if (action === "delete") {
        result = await resourceObj.delete(data.id);
      } else {
        throw new QueueError(`Unsupported action '${action}'`, {
          operation: "handleMessage",
          queueName: configuredResource,
          resource,
          action,
          supportedActions: ["insert", "update", "delete"],
          suggestion: "Use one of the supported actions: insert, update, or delete"
        });
      }
      return result;
    });
    if (!ok) {
      throw err;
    }
    return res;
  }
  _handleError(err, raw, resourceName) {
  }
}

class ReplicationError extends S3dbError {
  constructor(message, details = {}) {
    const { replicatorClass = "unknown", operation = "unknown", resourceName, ...rest } = details;
    let description = details.description;
    if (!description) {
      description = `
Replication Operation Error

Replicator: ${replicatorClass}
Operation: ${operation}
${resourceName ? `Resource: ${resourceName}` : ""}

Common causes:
1. Invalid replicator configuration
2. Target system not accessible
3. Resource not configured for replication
4. Invalid operation type
5. Transformation function errors

Solution:
Check replicator configuration and ensure target system is accessible.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/replicator.md
`.trim();
    }
    super(message, { ...rest, replicatorClass, operation, resourceName, description });
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
    throw new ReplicationError("replicate() method must be implemented by subclass", {
      operation: "replicate",
      replicatorClass: this.name,
      resourceName,
      suggestion: "Extend BaseReplicator and implement the replicate() method"
    });
  }
  /**
   * Replicate multiple records in batch
   * @param {string} resourceName - Name of the resource being replicated
   * @param {Array} records - Array of records to replicate
   * @returns {Promise<Object>} Batch replicator result
   */
  async replicateBatch(resourceName, records) {
    throw new ReplicationError("replicateBatch() method must be implemented by subclass", {
      operation: "replicateBatch",
      replicatorClass: this.name,
      resourceName,
      batchSize: records?.length,
      suggestion: "Extend BaseReplicator and implement the replicateBatch() method"
    });
  }
  /**
   * Test the connection to the target
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    throw new ReplicationError("testConnection() method must be implemented by subclass", {
      operation: "testConnection",
      replicatorClass: this.name,
      suggestion: "Extend BaseReplicator and implement the testConnection() method"
    });
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

class BigqueryReplicator extends BaseReplicator {
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
    const [ok, err, sdk] = await tryFn(() => import('@google-cloud/bigquery'));
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[BigqueryReplicator] Failed to import BigQuery SDK: ${err.message}`);
      }
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
    let cleanData = this._cleanInternalFields(data);
    if (!transformFn) return cleanData;
    let transformedData = JSON.parse(JSON.stringify(cleanData));
    return transformFn(transformedData);
  }
  _cleanInternalFields(data) {
    if (!data || typeof data !== "object") return data;
    const cleanData = { ...data };
    Object.keys(cleanData).forEach((key) => {
      if (key.startsWith("$") || key.startsWith("_")) {
        delete cleanData[key];
      }
    });
    return cleanData;
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
    const [ok, err, result] = await tryFn(async () => {
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      for (const tableConfig of tableConfigs) {
        const [okTable, errTable] = await tryFn(async () => {
          const table = dataset.table(tableConfig.table);
          let job;
          if (operation === "insert") {
            const transformedData = this.applyTransform(data, tableConfig.transform);
            try {
              job = await table.insert([transformedData]);
            } catch (error) {
              const { errors: errors2, response } = error;
              if (this.config.verbose) {
                console.error("[BigqueryReplicator] BigQuery insert error details:");
                if (errors2) console.error(JSON.stringify(errors2, null, 2));
                if (response) console.error(JSON.stringify(response, null, 2));
              }
              throw error;
            }
          } else if (operation === "update") {
            const transformedData = this.applyTransform(data, tableConfig.transform);
            const keys = Object.keys(transformedData).filter((k) => k !== "id");
            const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
            const params = { id, ...transformedData };
            const query = `UPDATE \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` SET ${setClause} WHERE id = @id`;
            const maxRetries = 2;
            let lastError = null;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              const [ok2, error] = await tryFn(async () => {
                const [updateJob] = await this.bigqueryClient.createQueryJob({
                  query,
                  params,
                  location: this.location
                });
                await updateJob.getQueryResults();
                return [updateJob];
              });
              if (ok2) {
                job = ok2;
                break;
              } else {
                lastError = error;
                if (this.config.verbose) {
                  console.warn(`[BigqueryReplicator] Update attempt ${attempt} failed: ${error.message}`);
                  if (error.errors) {
                    console.error("[BigqueryReplicator] BigQuery update error details:");
                    console.error("Errors:", JSON.stringify(error.errors, null, 2));
                  }
                }
                if (error?.message?.includes("streaming buffer") && attempt < maxRetries) {
                  const delaySeconds = 30;
                  if (this.config.verbose) {
                    console.warn(`[BigqueryReplicator] Retrying in ${delaySeconds} seconds due to streaming buffer issue`);
                  }
                  await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1e3));
                  continue;
                }
                throw error;
              }
            }
            if (!job) throw lastError;
          } else if (operation === "delete") {
            const query = `DELETE FROM \`${this.projectId}.${this.datasetId}.${tableConfig.table}\` WHERE id = @id`;
            try {
              const [deleteJob] = await this.bigqueryClient.createQueryJob({
                query,
                params: { id },
                location: this.location
              });
              await deleteJob.getQueryResults();
              job = [deleteJob];
            } catch (error) {
              if (this.config.verbose) {
                console.error("[BigqueryReplicator] BigQuery delete error details:");
                console.error("Query:", query);
                if (error.errors) console.error("Errors:", JSON.stringify(error.errors, null, 2));
                if (error.response) console.error("Response:", JSON.stringify(error.response, null, 2));
              }
              throw error;
            }
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
        const [okLog, errLog] = await tryFn(async () => {
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
      if (errors.length > 0) {
        console.warn(`[BigqueryReplicator] Replication completed with errors for ${resourceName}:`, errors);
      }
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
    if (this.config.verbose) {
      console.warn(`[BigqueryReplicator] Replication failed for ${resourceName}: ${err.message}`);
    }
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
      const [ok, err, res] = await tryFn(() => this.replicate(
        resourceName,
        record.operation,
        record.data,
        record.id,
        record.beforeData
      ));
      if (ok) {
        results.push(res);
      } else {
        if (this.config.verbose) {
          console.warn(`[BigqueryReplicator] Batch replication failed for record ${record.id}: ${err.message}`);
        }
        errors.push({ id: record.id, error: err.message });
      }
    }
    if (errors.length > 0) {
      console.warn(`[BigqueryReplicator] Batch replication completed with ${errors.length} error(s) for ${resourceName}:`, errors);
    }
    return {
      success: errors.length === 0,
      results,
      errors
    };
  }
  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      if (!this.bigqueryClient) await this.initialize();
      const dataset = this.bigqueryClient.dataset(this.datasetId);
      await dataset.getMetadata();
      return true;
    });
    if (ok) return true;
    if (this.config.verbose) {
      console.warn(`[BigqueryReplicator] Connection test failed: ${err.message}`);
    }
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

class PostgresReplicator extends BaseReplicator {
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
    const [ok, err, sdk] = await tryFn(() => import('pg'));
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[PostgresReplicator] Failed to import pg SDK: ${err.message}`);
      }
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
    const [ok, err, result] = await tryFn(async () => {
      for (const table of tables) {
        const [okTable, errTable] = await tryFn(async () => {
          let result2;
          if (operation === "insert") {
            const cleanData = this._cleanInternalFields(data);
            const keys = Object.keys(cleanData);
            const values = keys.map((k) => cleanData[k]);
            const columns = keys.map((k) => `"${k}"`).join(", ");
            const params = keys.map((_, i) => `$${i + 1}`).join(", ");
            const sql = `INSERT INTO ${table} (${columns}) VALUES (${params}) ON CONFLICT (id) DO NOTHING RETURNING *`;
            result2 = await this.client.query(sql, values);
          } else if (operation === "update") {
            const cleanData = this._cleanInternalFields(data);
            const keys = Object.keys(cleanData).filter((k) => k !== "id");
            const setClause = keys.map((k, i) => `"${k}"=$${i + 1}`).join(", ");
            const values = keys.map((k) => cleanData[k]);
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
        const [okLog, errLog] = await tryFn(async () => {
          await this.client.query(
            `INSERT INTO ${this.logTable} (resource_name, operation, record_id, data, timestamp, source) VALUES ($1, $2, $3, $4, $5, $6)`,
            [resourceName, operation, id, JSON.stringify(data), (/* @__PURE__ */ new Date()).toISOString(), "s3db-replicator"]
          );
        });
        if (!okLog) {
        }
      }
      const success = errors.length === 0;
      if (errors.length > 0) {
        console.warn(`[PostgresReplicator] Replication completed with errors for ${resourceName}:`, errors);
      }
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
    if (this.config.verbose) {
      console.warn(`[PostgresReplicator] Replication failed for ${resourceName}: ${err.message}`);
    }
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
      const [ok, err, res] = await tryFn(() => this.replicate(
        resourceName,
        record.operation,
        record.data,
        record.id,
        record.beforeData
      ));
      if (ok) {
        results.push(res);
      } else {
        if (this.config.verbose) {
          console.warn(`[PostgresReplicator] Batch replication failed for record ${record.id}: ${err.message}`);
        }
        errors.push({ id: record.id, error: err.message });
      }
    }
    if (errors.length > 0) {
      console.warn(`[PostgresReplicator] Batch replication completed with ${errors.length} error(s) for ${resourceName}:`, errors);
    }
    return {
      success: errors.length === 0,
      results,
      errors
    };
  }
  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      if (!this.client) await this.initialize();
      await this.client.query("SELECT 1");
      return true;
    });
    if (ok) return true;
    if (this.config.verbose) {
      console.warn(`[PostgresReplicator] Connection test failed: ${err.message}`);
    }
    this.emit("connection_error", { replicator: this.name, error: err.message });
    return false;
  }
  _cleanInternalFields(data) {
    if (!data || typeof data !== "object") return data;
    const cleanData = { ...data };
    Object.keys(cleanData).forEach((key) => {
      if (key.startsWith("$") || key.startsWith("_")) {
        delete cleanData[key];
      }
    });
    return cleanData;
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

const S3_DEFAULT_REGION = "us-east-1";
const S3_DEFAULT_ENDPOINT = "https://s3.us-east-1.amazonaws.com";
class ConnectionString {
  constructor(connectionString) {
    let uri;
    const [ok, err, parsed] = tryFn(() => new URL(connectionString));
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
    parallelism = 10,
    httpClientOptions = {}
  }) {
    super();
    this.verbose = verbose;
    this.id = id ?? idGenerator(77);
    this.parallelism = parallelism;
    this.config = new ConnectionString(connectionString);
    this.httpClientOptions = {
      keepAlive: true,
      // Enabled for better performance
      keepAliveMsecs: 1e3,
      // 1 second keep-alive
      maxSockets: httpClientOptions.maxSockets || 500,
      // High concurrency support
      maxFreeSockets: httpClientOptions.maxFreeSockets || 100,
      // Better connection reuse
      timeout: 6e4,
      // 60 second timeout
      ...httpClientOptions
    };
    this.client = AwsS3Client || this.createClient();
  }
  createClient() {
    const httpAgent = new http.Agent(this.httpClientOptions);
    const httpsAgent = new https.Agent(this.httpClientOptions);
    const httpHandler = new nodeHttpHandler.NodeHttpHandler({
      httpAgent,
      httpsAgent
    });
    let options = {
      region: this.config.region,
      endpoint: this.config.endpoint,
      requestHandler: httpHandler
    };
    if (this.config.forcePathStyle) options.forcePathStyle = true;
    if (this.config.accessKeyId) {
      options.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey
      };
    }
    const client = new clientS3.S3Client(options);
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
    const [ok, err, response] = await tryFn(() => this.client.send(command));
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
  async putObject({ key, metadata, contentType, body, contentEncoding, contentLength, ifMatch }) {
    const keyPrefix = typeof this.config.keyPrefix === "string" ? this.config.keyPrefix : "";
    keyPrefix ? path.join(keyPrefix, key) : key;
    const stringMetadata = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, "_");
        const { encoded } = metadataEncode(v);
        stringMetadata[validKey] = encoded;
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
    if (ifMatch !== void 0) options.IfMatch = ifMatch;
    let response, error;
    try {
      response = await this.sendCommand(new clientS3.PutObjectCommand(options));
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
      response = await this.sendCommand(new clientS3.GetObjectCommand(options));
      if (response.Metadata) {
        const decodedMetadata = {};
        for (const [key2, value] of Object.entries(response.Metadata)) {
          decodedMetadata[key2] = metadataDecode(value);
        }
        response.Metadata = decodedMetadata;
      }
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
      response = await this.sendCommand(new clientS3.HeadObjectCommand(options));
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
      response = await this.sendCommand(new clientS3.CopyObjectCommand(options));
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
    const [ok, err] = await tryFn(() => this.headObject(key));
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
      response = await this.sendCommand(new clientS3.DeleteObjectCommand(options));
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
    const packages = lodashEs.chunk(keys, 1e3);
    const { results, errors } = await promisePool.PromisePool.for(packages).withConcurrency(this.parallelism).process(async (keys2) => {
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
      const [ok, err, res] = await tryFn(() => this.sendCommand(new clientS3.DeleteObjectsCommand(options)));
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
      const listCommand = new clientS3.ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: keyPrefix ? path.join(keyPrefix, prefix || "") : prefix || "",
        ContinuationToken: continuationToken
      });
      const listResponse = await this.client.send(listCommand);
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deleteCommand = new clientS3.DeleteObjectsCommand({
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
    const [ok, err] = await tryFn(async () => {
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
    const [ok, err, response] = await tryFn(() => this.sendCommand(new clientS3.ListObjectsV2Command(options)));
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
    const { results, errors } = await promisePool.PromisePool.for(keys).withConcurrency(this.parallelism).process(async (key) => {
      const to = key.replace(prefixFrom, prefixTo);
      const [ok, err] = await tryFn(async () => {
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
      throw new UnknownError("Some objects could not be moved", {
        bucket: this.config.bucket,
        operation: "moveAllObjects",
        prefixFrom,
        prefixTo,
        totalKeys: keys.length,
        failedCount: errors.length,
        successCount: results.length,
        errors: errors.map((e) => ({ message: e.message, raw: e.raw })),
        suggestion: "Check S3 permissions and retry failed objects individually"
      });
    }
    return results;
  }
}

class AsyncEventEmitter extends EventEmitter {
  constructor() {
    super();
    this._asyncMode = true;
  }
  emit(event, ...args) {
    if (!this._asyncMode) {
      return super.emit(event, ...args);
    }
    const listeners = this.listeners(event);
    if (listeners.length === 0) {
      return false;
    }
    setImmediate(async () => {
      for (const listener of listeners) {
        try {
          await listener(...args);
        } catch (error) {
          if (event !== "error") {
            this.emit("error", error);
          } else {
            console.error("Error in error handler:", error);
          }
        }
      }
    });
    return true;
  }
  emitSync(event, ...args) {
    return super.emit(event, ...args);
  }
  setAsyncMode(enabled) {
    this._asyncMode = enabled;
  }
}

async function secretHandler(actual, errors, schema) {
  if (!this.passphrase) {
    errors.push(new ValidationError("Missing configuration for secrets encryption.", {
      actual,
      type: "encryptionKeyMissing",
      suggestion: "Provide a passphrase for secret encryption."
    }));
    return actual;
  }
  const [ok, err, res] = await tryFn(() => encrypt(String(actual), this.passphrase));
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
  if (lodashEs.isString(actual)) return actual;
  const [ok, err, json] = tryFnSync(() => JSON.stringify(actual));
  if (!ok) throw new ValidationError("Failed to stringify JSON", { original: err, input: actual });
  return json;
}
class Validator extends FastestValidator {
  constructor({ options, passphrase, autoEncrypt = true } = {}) {
    super(lodashEs.merge({}, {
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
    this.alias("embedding", {
      type: "array",
      items: "number",
      empty: false
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

function isValidIPv4(ip) {
  if (typeof ip !== "string") return false;
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);
  if (!match) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) return false;
  }
  return true;
}
function isValidIPv6(ip) {
  if (typeof ip !== "string") return false;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;
  return ipv6Regex.test(ip);
}
function encodeIPv4(ip) {
  if (!isValidIPv4(ip)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  const octets = ip.split(".").map((octet) => parseInt(octet, 10));
  const buffer = Buffer.from(octets);
  return buffer.toString("base64");
}
function decodeIPv4(encoded) {
  if (typeof encoded !== "string") {
    throw new Error("Encoded IPv4 must be a string");
  }
  try {
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length !== 4) {
      throw new Error(`Invalid encoded IPv4 length: ${buffer.length} (expected 4)`);
    }
    return Array.from(buffer).join(".");
  } catch (err) {
    throw new Error(`Failed to decode IPv4: ${err.message}`);
  }
}
function expandIPv6(ip) {
  if (!isValidIPv6(ip)) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }
  let expanded = ip;
  if (expanded === "::") {
    return "0000:0000:0000:0000:0000:0000:0000:0000";
  }
  if (expanded.includes("::")) {
    const parts = expanded.split("::");
    const leftParts = parts[0] ? parts[0].split(":") : [];
    const rightParts = parts[1] ? parts[1].split(":") : [];
    const missingGroups = 8 - leftParts.length - rightParts.length;
    const middleParts = Array(missingGroups).fill("0");
    expanded = [...leftParts, ...middleParts, ...rightParts].join(":");
  }
  const groups = expanded.split(":");
  const paddedGroups = groups.map((group) => group.padStart(4, "0"));
  return paddedGroups.join(":");
}
function compressIPv6(ip) {
  let compressed = ip.split(":").map((group) => {
    return parseInt(group, 16).toString(16);
  }).join(":");
  const zeroSequences = [];
  let currentSequence = { start: -1, length: 0 };
  compressed.split(":").forEach((group, index) => {
    if (group === "0") {
      if (currentSequence.start === -1) {
        currentSequence.start = index;
        currentSequence.length = 1;
      } else {
        currentSequence.length++;
      }
    } else {
      if (currentSequence.length > 0) {
        zeroSequences.push({ ...currentSequence });
        currentSequence = { start: -1, length: 0 };
      }
    }
  });
  if (currentSequence.length > 0) {
    zeroSequences.push(currentSequence);
  }
  const longestSequence = zeroSequences.filter((seq) => seq.length >= 2).sort((a, b) => b.length - a.length)[0];
  if (longestSequence) {
    const parts = compressed.split(":");
    const before = parts.slice(0, longestSequence.start).join(":");
    const after = parts.slice(longestSequence.start + longestSequence.length).join(":");
    if (before && after) {
      compressed = `${before}::${after}`;
    } else if (before) {
      compressed = `${before}::`;
    } else if (after) {
      compressed = `::${after}`;
    } else {
      compressed = "::";
    }
  }
  return compressed;
}
function encodeIPv6(ip) {
  if (!isValidIPv6(ip)) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }
  const expanded = expandIPv6(ip);
  const groups = expanded.split(":");
  const bytes = [];
  for (const group of groups) {
    const value = parseInt(group, 16);
    bytes.push(value >> 8 & 255);
    bytes.push(value & 255);
  }
  const buffer = Buffer.from(bytes);
  return buffer.toString("base64");
}
function decodeIPv6(encoded, compress = true) {
  if (typeof encoded !== "string") {
    throw new Error("Encoded IPv6 must be a string");
  }
  try {
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length !== 16) {
      throw new Error(`Invalid encoded IPv6 length: ${buffer.length} (expected 16)`);
    }
    const groups = [];
    for (let i = 0; i < 16; i += 2) {
      const value = buffer[i] << 8 | buffer[i + 1];
      groups.push(value.toString(16).padStart(4, "0"));
    }
    const fullAddress = groups.join(":");
    return compress ? compressIPv6(fullAddress) : fullAddress;
  } catch (err) {
    throw new Error(`Failed to decode IPv6: ${err.message}`);
  }
}

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
  toNumber: (value) => lodashEs.isString(value) ? value.includes(".") ? parseFloat(value) : parseInt(value) : value,
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
  },
  fromArrayOfEmbeddings: (value, { separator, precision = 6 }) => {
    if (value === null || value === void 0 || !Array.isArray(value)) {
      return value;
    }
    if (value.length === 0) {
      return "";
    }
    const encodedItems = value.map((item) => {
      if (typeof item === "number" && !isNaN(item)) {
        return encodeFixedPoint(item, precision);
      }
      const n = Number(item);
      return isNaN(n) ? "" : encodeFixedPoint(n, precision);
    });
    return encodedItems.join(separator);
  },
  toArrayOfEmbeddings: (value, { separator, precision = 6 }) => {
    if (Array.isArray(value)) {
      return value.map((v) => typeof v === "number" ? v : decodeFixedPoint(v, precision));
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
        const n = decodeFixedPoint(v, precision);
        return isNaN(n) ? NaN : n;
      }
      return NaN;
    });
  },
  encodeIPv4: (value) => {
    if (value === null || value === void 0) return value;
    if (typeof value !== "string") return value;
    if (!isValidIPv4(value)) return value;
    const [ok, err, encoded] = tryFnSync(() => encodeIPv4(value));
    return ok ? encoded : value;
  },
  decodeIPv4: (value) => {
    if (value === null || value === void 0) return value;
    if (typeof value !== "string") return value;
    const [ok, err, decoded] = tryFnSync(() => decodeIPv4(value));
    return ok ? decoded : value;
  },
  encodeIPv6: (value) => {
    if (value === null || value === void 0) return value;
    if (typeof value !== "string") return value;
    if (!isValidIPv6(value)) return value;
    const [ok, err, encoded] = tryFnSync(() => encodeIPv6(value));
    return ok ? encoded : value;
  },
  decodeIPv6: (value) => {
    if (value === null || value === void 0) return value;
    if (typeof value !== "string") return value;
    const [ok, err, decoded] = tryFnSync(() => decodeIPv6(value));
    return ok ? decoded : value;
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
    this.options = lodashEs.merge({}, this.defaultOptions(), options);
    this.allNestedObjectsOptional = this.options.allNestedObjectsOptional ?? false;
    const processedAttributes = this.preprocessAttributesForValidation(this.attributes);
    this.validator = new ValidatorManager({ autoEncrypt: false }).compile(lodashEs.merge(
      { $$async: true, $$strict: false },
      processedAttributes
    ));
    if (this.options.generateAutoHooks) this.generateAutoHooks();
    if (!lodashEs.isEmpty(map)) {
      this.map = map;
      this.reversedMap = lodashEs.invert(map);
    } else {
      const flatAttrs = flat.flatten(this.attributes, { safe: true });
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
    this.options.hooks[hook][attribute] = lodashEs.uniq([...this.options.hooks[hook][attribute], action]);
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
  _generateHooksFromOriginalAttributes(attributes, prefix = "") {
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith("$$")) continue;
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null && !Array.isArray(value) && value.type) {
        if (value.type === "array" && value.items) {
          const itemsType = value.items;
          const arrayLength = typeof value.length === "number" ? value.length : null;
          if (itemsType === "string" || typeof itemsType === "string" && itemsType.includes("string")) {
            this.addHook("beforeMap", fullKey, "fromArray");
            this.addHook("afterUnmap", fullKey, "toArray");
          } else if (itemsType === "number" || typeof itemsType === "string" && itemsType.includes("number")) {
            const isIntegerArray = typeof itemsType === "string" && itemsType.includes("integer");
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
      } else if (typeof value === "object" && value !== null && !Array.isArray(value) && !value.type) {
        this._generateHooksFromOriginalAttributes(value, fullKey);
      }
    }
  }
  generateAutoHooks() {
    this._generateHooksFromOriginalAttributes(this.attributes);
    const schema = flat.flatten(lodashEs.cloneDeep(this.attributes), { safe: true });
    for (const [name, definition] of Object.entries(schema)) {
      if (name.includes("$$")) continue;
      if (this.options.hooks.beforeMap[name] || this.options.hooks.afterUnmap[name]) {
        continue;
      }
      const defStr = typeof definition === "string" ? definition : "";
      const defType = typeof definition === "object" && definition !== null ? definition.type : null;
      const isEmbeddingType = defStr.includes("embedding") || defType === "embedding";
      if (isEmbeddingType) {
        const lengthMatch = defStr.match(/embedding:(\d+)/);
        if (lengthMatch) {
          parseInt(lengthMatch[1], 10);
        } else if (defStr.includes("length:")) {
          const match = defStr.match(/length:(\d+)/);
          if (match) parseInt(match[1], 10);
        }
        this.addHook("beforeMap", name, "fromArrayOfEmbeddings");
        this.addHook("afterUnmap", name, "toArrayOfEmbeddings");
        continue;
      }
      const isArray = defStr.includes("array") || defType === "array";
      if (isArray) {
        let itemsType = null;
        if (typeof definition === "object" && definition !== null && definition.items) {
          itemsType = definition.items;
        } else if (defStr.includes("items:string")) {
          itemsType = "string";
        } else if (defStr.includes("items:number")) {
          itemsType = "number";
        }
        if (itemsType === "string" || typeof itemsType === "string" && itemsType.includes("string")) {
          this.addHook("beforeMap", name, "fromArray");
          this.addHook("afterUnmap", name, "toArray");
        } else if (itemsType === "number" || typeof itemsType === "string" && itemsType.includes("number")) {
          const isIntegerArray = defStr.includes("integer:true") || defStr.includes("|integer:") || defStr.includes("|integer") || typeof itemsType === "string" && itemsType.includes("integer");
          let arrayLength = null;
          if (typeof definition === "object" && definition !== null && typeof definition.length === "number") {
            arrayLength = definition.length;
          } else if (defStr.includes("length:")) {
            const match = defStr.match(/length:(\d+)/);
            if (match) arrayLength = parseInt(match[1], 10);
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
      if (defStr.includes("secret") || defType === "secret") {
        if (this.options.autoEncrypt) {
          this.addHook("beforeMap", name, "encrypt");
        }
        if (this.options.autoDecrypt) {
          this.addHook("afterUnmap", name, "decrypt");
        }
        continue;
      }
      if (defStr.includes("ip4") || defType === "ip4") {
        this.addHook("beforeMap", name, "encodeIPv4");
        this.addHook("afterUnmap", name, "decodeIPv4");
        continue;
      }
      if (defStr.includes("ip6") || defType === "ip6") {
        this.addHook("beforeMap", name, "encodeIPv6");
        this.addHook("afterUnmap", name, "decodeIPv6");
        continue;
      }
      if (defStr.includes("number") || defType === "number") {
        const isInteger = defStr.includes("integer:true") || defStr.includes("|integer:") || defStr.includes("|integer");
        if (isInteger) {
          this.addHook("beforeMap", name, "toBase62");
          this.addHook("afterUnmap", name, "fromBase62");
        } else {
          this.addHook("beforeMap", name, "toBase62Decimal");
          this.addHook("afterUnmap", name, "fromBase62Decimal");
        }
        continue;
      }
      if (defStr.includes("boolean") || defType === "boolean") {
        this.addHook("beforeMap", name, "fromBool");
        this.addHook("afterUnmap", name, "toBool");
        continue;
      }
      if (defStr.includes("json") || defType === "json") {
        this.addHook("beforeMap", name, "toJSON");
        this.addHook("afterUnmap", name, "fromJSON");
        continue;
      }
      if (definition === "object" || defStr.includes("object") || defType === "object") {
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
    } = lodashEs.isString(data) ? JSON.parse(data) : data;
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
    const cloned = lodashEs.cloneDeep(resourceItem);
    for (const [attribute, actions] of Object.entries(this.options.hooks[hook])) {
      for (const action of actions) {
        const value = lodashEs.get(cloned, attribute);
        if (value !== void 0 && typeof SchemaActions[action] === "function") {
          lodashEs.set(cloned, attribute, await SchemaActions[action](value, {
            passphrase: this.passphrase,
            separator: this.options.arraySeparator
          }));
        }
      }
    }
    return cloned;
  }
  async validate(resourceItem, { mutateOriginal = false } = {}) {
    let data = mutateOriginal ? resourceItem : lodashEs.cloneDeep(resourceItem);
    const result = await this.validator(data);
    return result;
  }
  async mapper(resourceItem) {
    let obj = lodashEs.cloneDeep(resourceItem);
    obj = await this.applyHooksActions(obj, "beforeMap");
    const flattenedObj = flat.flatten(obj, { safe: true });
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
    let obj = lodashEs.cloneDeep(mappedResourceItem);
    delete obj._v;
    obj = await this.applyHooksActions(obj, "beforeUnmap");
    const reversedMap = mapOverride ? lodashEs.invert(mapOverride) : this.reversedMap;
    const rest = {};
    for (const [key, value] of Object.entries(obj)) {
      const originalKey = reversedMap && reversedMap[key] ? reversedMap[key] : key;
      let parsedValue = value;
      const attrDef = this.getAttributeDefinition(originalKey);
      const hasAfterUnmapHook = this.options.hooks?.afterUnmap?.[originalKey];
      if (!hasAfterUnmapHook && typeof attrDef === "string" && attrDef.includes("number") && !attrDef.includes("array") && !attrDef.includes("decimal")) {
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
    const result = flat.unflatten(rest);
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
      if (typeof value === "string") {
        if (value === "ip4" || value.startsWith("ip4|")) {
          processed[key] = value.replace(/^ip4/, "string");
          continue;
        }
        if (value === "ip6" || value.startsWith("ip6|")) {
          processed[key] = value.replace(/^ip6/, "string");
          continue;
        }
        if (value.startsWith("embedding:")) {
          const lengthMatch = value.match(/embedding:(\d+)/);
          if (lengthMatch) {
            const length = lengthMatch[1];
            const rest = value.substring(`embedding:${length}`.length);
            processed[key] = `array|items:number|length:${length}|empty:false${rest}`;
            continue;
          }
        }
        if (value.startsWith("embedding|") || value === "embedding") {
          processed[key] = value.replace(/^embedding/, "array|items:number|empty:false");
          continue;
        }
        processed[key] = value;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const hasValidatorType = value.type !== void 0 && key !== "$$type";
        if (hasValidatorType) {
          if (value.type === "ip4") {
            processed[key] = { ...value, type: "string" };
          } else if (value.type === "ip6") {
            processed[key] = { ...value, type: "string" };
          } else if (value.type === "object" && value.properties) {
            processed[key] = {
              ...value,
              properties: this.preprocessAttributesForValidation(value.properties)
            };
          } else {
            processed[key] = value;
          }
        } else {
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
        }
      } else {
        processed[key] = value;
      }
    }
    return processed;
  }
}

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
    throw new MetadataLimitError("Metadata size exceeds 2KB limit on insert", {
      totalSize,
      effectiveLimit,
      absoluteLimit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: "insert"
    });
  }
  return { mappedData, body: "" };
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
    throw new MetadataLimitError("Metadata size exceeds 2KB limit on update", {
      totalSize,
      effectiveLimit,
      absoluteLimit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: "update",
      id
    });
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
    throw new MetadataLimitError("Metadata size exceeds 2KB limit on upsert", {
      totalSize,
      effectiveLimit,
      absoluteLimit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: "upsert",
      id
    });
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
    return { mappedData: { _v: mappedData._v }, body: JSON.stringify(mappedData) };
  }
  return { mappedData, body: "" };
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
  if (body && body.trim() !== "") {
    try {
      const bodyData = JSON.parse(body);
      const mergedData = {
        ...bodyData,
        ...metadata
      };
      return { metadata: mergedData, body };
    } catch (error) {
      return { metadata, body };
    }
  }
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
  return { mappedData: resultFields, body: "" };
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
    throw new BehaviorError(`Unknown behavior: ${behaviorName}`, {
      behavior: behaviorName,
      availableBehaviors: Object.keys(behaviors),
      operation: "getBehavior"
    });
  }
  return behavior;
}
const AVAILABLE_BEHAVIORS = Object.keys(behaviors);
const DEFAULT_BEHAVIOR = "user-managed";

class Resource extends AsyncEventEmitter {
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
   * @param {Object} [config.events={}] - Event listeners to automatically add
   * @param {boolean} [config.asyncEvents=true] - Whether events should be emitted asynchronously
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
   *   },
   *   events: {
   *     insert: (ev) => console.log('Inserted:', ev.id),
   *     update: [
   *       (ev) => console.warn('Update detected'),
   *       (ev) => console.log('Updated:', ev.id)
   *     ],
   *     delete: (ev) => console.log('Deleted:', ev.id)
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
    this._instanceId = idGenerator(7);
    const validation = validateResourceConfig(config);
    if (!validation.isValid) {
      const errorDetails = validation.errors.map((err) => `  \u2022 ${err}`).join("\n");
      throw new ResourceError(
        `Invalid Resource ${config.name || "[unnamed]"} configuration:
${errorDetails}`,
        {
          resourceName: config.name,
          validation: validation.errors
        }
      );
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
      versioningEnabled = false,
      strictValidation = true,
      events = {},
      asyncEvents = true,
      asyncPartitions = true,
      createdBy = "user"
    } = config;
    this.name = name;
    this.client = client;
    this.version = version;
    this.behavior = behavior;
    this.observers = observers;
    this.parallelism = parallelism;
    this.passphrase = passphrase ?? "secret";
    this.versioningEnabled = versioningEnabled;
    this.strictValidation = strictValidation;
    this.setAsyncMode(asyncEvents);
    this.idGenerator = this.configureIdGenerator(customIdGenerator, idSize);
    if (typeof customIdGenerator === "number" && customIdGenerator > 0) {
      this.idSize = customIdGenerator;
    } else if (typeof idSize === "number" && idSize > 0) {
      this.idSize = idSize;
    } else {
      this.idSize = 22;
    }
    this.idGeneratorType = this.getIdGeneratorType(customIdGenerator, this.idSize);
    this.config = {
      cache,
      hooks,
      paranoid,
      timestamps,
      partitions,
      autoDecrypt,
      allNestedObjectsOptional,
      asyncEvents,
      asyncPartitions,
      createdBy
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
    if (events && Object.keys(events).length > 0) {
      for (const [eventName, listeners] of Object.entries(events)) {
        if (Array.isArray(listeners)) {
          for (const listener of listeners) {
            if (typeof listener === "function") {
              this.on(eventName, listener.bind(this));
            }
          }
        } else if (typeof listeners === "function") {
          this.on(eventName, listeners.bind(this));
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
      return () => String(customIdGenerator());
    }
    if (typeof customIdGenerator === "number" && customIdGenerator > 0) {
      return nanoid.customAlphabet(nanoid.urlAlphabet, customIdGenerator);
    }
    if (typeof idSize === "number" && idSize > 0 && idSize !== 22) {
      return nanoid.customAlphabet(nanoid.urlAlphabet, idSize);
    }
    return idGenerator;
  }
  /**
   * Get a serializable representation of the ID generator type
   * @param {Function|number} customIdGenerator - Custom ID generator function or size
   * @param {number} idSize - Size for auto-generated IDs
   * @returns {string|number} Serializable ID generator type
   * @private
   */
  getIdGeneratorType(customIdGenerator, idSize) {
    if (typeof customIdGenerator === "function") {
      return "custom_function";
    }
    return idSize;
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
    this.schema = new Schema({
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
    this.applyConfiguration();
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
      original: lodashEs.cloneDeep(data),
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
   * @throws {Error} If partition fields don't exist in current schema (only when strictValidation is true)
   */
  validatePartitions() {
    if (!this.strictValidation) {
      return;
    }
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
   * Find orphaned partitions (partitions that reference non-existent fields)
   * @returns {Object} Object with orphaned partition names as keys and details as values
   * @example
   * const orphaned = resource.findOrphanedPartitions();
   * // Returns: { byRegion: { missingFields: ['region'], definition: {...} } }
   */
  findOrphanedPartitions() {
    const orphaned = {};
    if (!this.config.partitions) {
      return orphaned;
    }
    for (const [partitionName, partitionDef] of Object.entries(this.config.partitions)) {
      if (!partitionDef.fields) {
        continue;
      }
      const missingFields = [];
      for (const fieldName of Object.keys(partitionDef.fields)) {
        if (!this.fieldExistsInAttributes(fieldName)) {
          missingFields.push(fieldName);
        }
      }
      if (missingFields.length > 0) {
        orphaned[partitionName] = {
          missingFields,
          definition: partitionDef,
          allFields: Object.keys(partitionDef.fields)
        };
      }
    }
    return orphaned;
  }
  /**
   * Remove orphaned partitions (partitions that reference non-existent fields)
   * WARNING: This will modify the resource configuration and should be followed by uploadMetadataFile()
   * @param {Object} options - Options
   * @param {boolean} options.dryRun - If true, only returns what would be removed without modifying (default: false)
   * @returns {Object} Object with removed partition names and details
   * @example
   * // Dry run to see what would be removed
   * const toRemove = resource.removeOrphanedPartitions({ dryRun: true });
   * console.log('Would remove:', toRemove);
   *
   * // Actually remove orphaned partitions
   * const removed = resource.removeOrphanedPartitions();
   * await database.uploadMetadataFile(); // Save changes to S3
   */
  removeOrphanedPartitions({ dryRun = false } = {}) {
    const orphaned = this.findOrphanedPartitions();
    if (Object.keys(orphaned).length === 0) {
      return {};
    }
    if (dryRun) {
      return orphaned;
    }
    for (const partitionName of Object.keys(orphaned)) {
      delete this.config.partitions[partitionName];
    }
    this.emit("orphanedPartitionsRemoved", {
      resourceName: this.name,
      removed: Object.keys(orphaned),
      details: orphaned
    });
    return orphaned;
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
    const key = path.join("resource=" + this.name, "data", `id=${id}`);
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
    return path.join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${finalId}`);
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
  async insert({ id: id$1, ...attributes }) {
    const exists = await this.exists(id$1);
    if (exists) throw new Error(`Resource with id '${id$1}' already exists`);
    this.getResourceKey(id$1 || "(auto)");
    if (this.options.timestamps) {
      attributes.createdAt = (/* @__PURE__ */ new Date()).toISOString();
      attributes.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    const attributesWithDefaults = this.applyDefaults(attributes);
    const completeData = { id: id$1, ...attributesWithDefaults };
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
    let finalId = validatedId || id$1;
    if (!finalId) {
      finalId = this.idGenerator();
      if (!finalId || finalId.trim() === "") {
        const { idGenerator } = await Promise.resolve().then(function () { return id; });
        finalId = idGenerator();
      }
    }
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
      const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = "application/json";
    }
    if (this.behavior === "body-only" && (!body || body === "")) {
      throw new Error(`[Resource.insert] Attempt to save object without body! Data: id=${finalId}, resource=${this.name}`);
    }
    const [okPut, errPut, putResult] = await tryFn(() => this.client.putObject({
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
      throw errPut;
    }
    const insertedObject = await this.get(finalId);
    if (this.config.asyncPartitions && this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      setImmediate(() => {
        this.createPartitionReferences(insertedObject).catch((err) => {
          this.emit("partitionIndexError", {
            operation: "insert",
            id: finalId,
            error: err,
            message: err.message
          });
        });
      });
      const nonPartitionHooks = this.hooks.afterInsert.filter(
        (hook) => !hook.toString().includes("createPartitionReferences")
      );
      let finalResult = insertedObject;
      for (const hook of nonPartitionHooks) {
        finalResult = await hook(finalResult);
      }
      this.emit("insert", finalResult);
      return finalResult;
    } else {
      const finalResult = await this.executeHooks("afterInsert", insertedObject);
      this.emit("insert", finalResult);
      return finalResult;
    }
  }
  /**
   * Retrieve a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} The resource object with all attributes and metadata
   * @example
   * const user = await resource.get('user-123');
   */
  async get(id) {
    if (lodashEs.isObject(id)) throw new Error(`id cannot be an object`);
    if (lodashEs.isEmpty(id)) throw new Error("id cannot be empty");
    const key = this.getResourceKey(id);
    const [ok, err, request] = await tryFn(() => this.client.getObject(key));
    if (!ok) {
      throw mapAwsError(err, {
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
      const [okBody, errBody, fullObject] = await tryFn(() => this.client.getObject(key));
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
    data._etag = request.ETag;
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
    const [ok, err] = await tryFn(() => this.client.headObject(key));
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
    if (lodashEs.isEmpty(id)) {
      throw new Error("id cannot be empty");
    }
    const exists = await this.exists(id);
    if (!exists) {
      throw new Error(`Resource with id '${id}' does not exist`);
    }
    const originalData = await this.get(id);
    const attributesClone = lodashEs.cloneDeep(attributes);
    let mergedData = lodashEs.cloneDeep(originalData);
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
        ref[parts[parts.length - 1]] = lodashEs.cloneDeep(value);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        mergedData[key2] = lodashEs.merge({}, mergedData[key2], value);
      } else {
        mergedData[key2] = lodashEs.cloneDeep(value);
      }
    }
    if (this.config.timestamps) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      mergedData.updatedAt = now;
      if (!mergedData.metadata) mergedData.metadata = {};
      mergedData.metadata.updatedAt = now;
    }
    const preProcessedData = await this.executeHooks("beforeUpdate", lodashEs.cloneDeep(mergedData));
    const completeData = { ...originalData, ...preProcessedData, id };
    const { isValid, errors, data } = await this.validate(lodashEs.cloneDeep(completeData));
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
      const [ok2, err2, existingObject] = await tryFn(() => this.client.getObject(key));
      if (ok2 && existingObject.ContentLength > 0) {
        const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
        const existingBodyString = existingBodyBuffer.toString();
        const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(existingBodyString)));
        if (!okParse) {
          finalBody = existingBodyBuffer;
          existingContentType = existingObject.ContentType;
        }
      }
    }
    let finalContentType = existingContentType;
    if (finalBody && finalBody !== "" && !finalContentType) {
      const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody)));
      if (okParse) finalContentType = "application/json";
    }
    if (this.versioningEnabled && originalData._v !== this.version) {
      await this.createHistoricalVersion(id, originalData);
    }
    const [ok, err] = await tryFn(() => this.client.putObject({
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
    if (this.config.asyncPartitions && this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      setImmediate(() => {
        this.handlePartitionReferenceUpdates(originalData, updatedData).catch((err2) => {
          this.emit("partitionIndexError", {
            operation: "update",
            id,
            error: err2,
            message: err2.message
          });
        });
      });
      const nonPartitionHooks = this.hooks.afterUpdate.filter(
        (hook) => !hook.toString().includes("handlePartitionReferenceUpdates")
      );
      let finalResult = updatedData;
      for (const hook of nonPartitionHooks) {
        finalResult = await hook(finalResult);
      }
      this.emit("update", {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      });
      return finalResult;
    } else {
      const finalResult = await this.executeHooks("afterUpdate", updatedData);
      this.emit("update", {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      });
      return finalResult;
    }
  }
  /**
   * Update with conditional check (If-Match ETag)
   * @param {string} id - Resource ID
   * @param {Object} attributes - Attributes to update
   * @param {Object} options - Options including ifMatch (ETag)
   * @returns {Promise<Object>} { success: boolean, data?: Object, etag?: string, error?: string }
   * @example
   * const msg = await resource.get('msg-123');
   * const result = await resource.updateConditional('msg-123', { status: 'processing' }, { ifMatch: msg._etag });
   * if (!result.success) {
   *   console.log('Update failed - object was modified by another process');
   * }
   */
  async updateConditional(id, attributes, options = {}) {
    if (lodashEs.isEmpty(id)) {
      throw new Error("id cannot be empty");
    }
    const { ifMatch } = options;
    if (!ifMatch) {
      throw new Error("updateConditional requires ifMatch option with ETag value");
    }
    const exists = await this.exists(id);
    if (!exists) {
      return {
        success: false,
        error: `Resource with id '${id}' does not exist`
      };
    }
    const originalData = await this.get(id);
    const attributesClone = lodashEs.cloneDeep(attributes);
    let mergedData = lodashEs.cloneDeep(originalData);
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
        ref[parts[parts.length - 1]] = lodashEs.cloneDeep(value);
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        mergedData[key2] = lodashEs.merge({}, mergedData[key2], value);
      } else {
        mergedData[key2] = lodashEs.cloneDeep(value);
      }
    }
    if (this.config.timestamps) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      mergedData.updatedAt = now;
      if (!mergedData.metadata) mergedData.metadata = {};
      mergedData.metadata.updatedAt = now;
    }
    const preProcessedData = await this.executeHooks("beforeUpdate", lodashEs.cloneDeep(mergedData));
    const completeData = { ...originalData, ...preProcessedData, id };
    const { isValid, errors, data } = await this.validate(lodashEs.cloneDeep(completeData));
    if (!isValid) {
      return {
        success: false,
        error: "Validation failed: " + (errors && errors.length ? JSON.stringify(errors) : "unknown"),
        validationErrors: errors
      };
    }
    const { id: validatedId, ...validatedAttributes } = data;
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
    const key = this.getResourceKey(id);
    let existingContentType = void 0;
    let finalBody = body;
    if (body === "" && this.behavior !== "body-overflow") {
      const [ok2, err2, existingObject] = await tryFn(() => this.client.getObject(key));
      if (ok2 && existingObject.ContentLength > 0) {
        const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
        const existingBodyString = existingBodyBuffer.toString();
        const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(existingBodyString)));
        if (!okParse) {
          finalBody = existingBodyBuffer;
          existingContentType = existingObject.ContentType;
        }
      }
    }
    let finalContentType = existingContentType;
    if (finalBody && finalBody !== "" && !finalContentType) {
      const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody)));
      if (okParse) finalContentType = "application/json";
    }
    const [ok, err, response] = await tryFn(() => this.client.putObject({
      key,
      body: finalBody,
      contentType: finalContentType,
      metadata: processedMetadata,
      ifMatch
      // ← Conditional write with ETag
    }));
    if (!ok) {
      if (err.name === "PreconditionFailed" || err.$metadata?.httpStatusCode === 412) {
        return {
          success: false,
          error: "ETag mismatch - object was modified by another process"
        };
      }
      return {
        success: false,
        error: err.message || "Update failed"
      };
    }
    const updatedData = await this.composeFullObjectFromWrite({
      id,
      metadata: processedMetadata,
      body: finalBody,
      behavior: this.behavior
    });
    const oldData = { ...originalData, id };
    const newData = { ...validatedAttributes, id };
    if (this.config.asyncPartitions && this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      setImmediate(() => {
        this.handlePartitionReferenceUpdates(oldData, newData).catch((err2) => {
          this.emit("partitionIndexError", {
            operation: "updateConditional",
            id,
            error: err2,
            message: err2.message
          });
        });
      });
      const nonPartitionHooks = this.hooks.afterUpdate.filter(
        (hook) => !hook.toString().includes("handlePartitionReferenceUpdates")
      );
      let finalResult = updatedData;
      for (const hook of nonPartitionHooks) {
        finalResult = await hook(finalResult);
      }
      this.emit("update", {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      });
      return {
        success: true,
        data: finalResult,
        etag: response.ETag
      };
    } else {
      await this.handlePartitionReferenceUpdates(oldData, newData);
      const finalResult = await this.executeHooks("afterUpdate", updatedData);
      this.emit("update", {
        ...updatedData,
        $before: { ...originalData },
        $after: { ...finalResult }
      });
      return {
        success: true,
        data: finalResult,
        etag: response.ETag
      };
    }
  }
  /**
   * Delete a resource object by ID
   * @param {string} id - Resource ID
   * @returns {Promise<Object>} S3 delete response
   * @example
   * await resource.delete('user-123');
   */
  async delete(id) {
    if (lodashEs.isEmpty(id)) {
      throw new Error("id cannot be empty");
    }
    let objectData;
    let deleteError = null;
    const [ok, err, data] = await tryFn(() => this.get(id));
    if (ok) {
      objectData = data;
    } else {
      objectData = { id };
      deleteError = err;
    }
    await this.executeHooks("beforeDelete", objectData);
    const key = this.getResourceKey(id);
    const [ok2, err2, response] = await tryFn(() => this.client.deleteObject(key));
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
    if (this.config.asyncPartitions && this.config.partitions && Object.keys(this.config.partitions).length > 0) {
      setImmediate(() => {
        this.deletePartitionReferences(objectData).catch((err3) => {
          this.emit("partitionIndexError", {
            operation: "delete",
            id,
            error: err3,
            message: err3.message
          });
        });
      });
      const nonPartitionHooks = this.hooks.afterDelete.filter(
        (hook) => !hook.toString().includes("deletePartitionReferences")
      );
      let afterDeleteData = objectData;
      for (const hook of nonPartitionHooks) {
        afterDeleteData = await hook(afterDeleteData);
      }
      return response;
    } else {
      await this.executeHooks("afterDelete", objectData);
      return response;
    }
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
    const { results } = await promisePool.PromisePool.for(objects).withConcurrency(this.parallelism).handleError(async (error, content2) => {
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
    const packages = lodashEs.chunk(
      ids.map((id) => this.getResourceKey(id)),
      1e3
    );
    ids.map((id) => this.getResourceKey(id));
    const { results } = await promisePool.PromisePool.for(packages).withConcurrency(this.parallelism).handleError(async (error, content2) => {
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
    const [ok, err, result] = await tryFn(async () => {
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
    const [ok, err, ids] = await tryFn(() => this.listIds({ limit, offset }));
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
    const [ok, err, keys] = await tryFn(() => this.client.getAllKeys({ prefix }));
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
    const { results, errors } = await promisePool.PromisePool.for(ids).withConcurrency(this.parallelism).handleError(async (error, id) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
    }).process(async (id) => {
      const [ok, err, result] = await tryFn(() => this.get(id));
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
    const { results, errors } = await promisePool.PromisePool.for(ids).withConcurrency(this.parallelism).handleError(async (error, id) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
    }).process(async (id) => {
      const [ok, err, result] = await tryFn(async () => {
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
    const { results, errors } = await promisePool.PromisePool.for(ids).withConcurrency(this.client.parallelism).handleError(async (error, id) => {
      this.emit("error", error, content);
      this.observers.map((x) => x.emit("error", this.name, error, content));
      return {
        id,
        _error: error.message,
        _decryptionFailed: error.message.includes("Cipher job failed") || error.message.includes("OperationError")
      };
    }).process(async (id) => {
      const [ok, err, data] = await tryFn(() => this.get(id));
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
    const [ok, err, ids] = await tryFn(() => this.listIds());
    if (!ok) throw err;
    const results = [];
    for (const id of ids) {
      const [ok2, err2, item] = await tryFn(() => this.get(id));
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
    const [ok, err, result] = await tryFn(async () => {
      let totalItems = null;
      let totalPages = null;
      if (!skipCount) {
        const [okCount, errCount, count] = await tryFn(() => this.count({ partition, partitionValues }));
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
        const [okList, errList, listResult] = await tryFn(() => this.list({ partition, partitionValues, limit: size, offset }));
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
    const [ok, err, currentData] = await tryFn(() => this.get(id));
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
    const [ok2, err2] = await tryFn(() => this.client.putObject({
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
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));
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
    const [ok, err, response] = await tryFn(() => this.client.headObject(key));
    if (!ok) return false;
    return response.ContentLength > 0;
  }
  /**
   * Delete binary content but preserve metadata
   * @param {string} id - Resource ID
   */
  async deleteContent(id) {
    const key = this.getResourceKey(id);
    const [ok, err, existingObject] = await tryFn(() => this.client.headObject(key));
    if (!ok) throw err;
    const existingMetadata = existingObject.Metadata || {};
    const [ok2, err2, response] = await tryFn(() => this.client.putObject({
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
    return `sha256:${crypto.createHash("sha256").update(stableString).digest("hex")}`;
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
    const [ok, err, compatibleSchema] = await tryFn(() => Promise.resolve(new Schema({
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
    const promises = Object.entries(partitions).map(async ([partitionName, partition]) => {
      const partitionKey = this.getPartitionKey({ partitionName, id: data.id, data });
      if (partitionKey) {
        const partitionMetadata = {
          _v: String(this.version)
        };
        return this.client.putObject({
          key: partitionKey,
          metadata: partitionMetadata,
          body: "",
          contentType: void 0
        });
      }
      return null;
    });
    const results = await Promise.allSettled(promises);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      this.emit("partitionIndexWarning", {
        operation: "create",
        id: data.id,
        failures: failures.map((f) => f.reason)
      });
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
      const [ok, err] = await tryFn(() => this.client.deleteObjects(keysToDelete));
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
    const updatePromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
      const [ok, err] = await tryFn(() => this.handlePartitionReferenceUpdate(partitionName, partition, oldData, newData));
      if (!ok) {
        return { partitionName, error: err };
      }
      return { partitionName, success: true };
    });
    await Promise.allSettled(updatePromises);
    const id = newData.id || oldData.id;
    const cleanupPromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
      const prefix = `resource=${this.name}/partition=${partitionName}`;
      const [okKeys, errKeys, keys] = await tryFn(() => this.client.getAllKeys({ prefix }));
      if (!okKeys) {
        return;
      }
      const validKey = this.getPartitionKey({ partitionName, id, data: newData });
      const staleKeys = keys.filter((key) => key.endsWith(`/id=${id}`) && key !== validKey);
      if (staleKeys.length > 0) {
        const [okDel, errDel] = await tryFn(() => this.client.deleteObjects(staleKeys));
      }
    });
    await Promise.allSettled(cleanupPromises);
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
        const [ok, err] = await tryFn(async () => {
          await this.client.deleteObject(oldPartitionKey);
        });
      }
      if (newPartitionKey) {
        const [ok, err] = await tryFn(async () => {
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
      const [ok, err] = await tryFn(async () => {
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
        const [ok, err] = await tryFn(async () => {
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
    const partitionKey = path.join(`resource=${this.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
    const [ok, err] = await tryFn(async () => {
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
    const historicalKey = path.join(`resource=${this.name}`, `historical`, `id=${id}`);
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
      const [okParse, errParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
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
   * Compose the full object (metadata + body) as returned by .get(),
   * using in-memory data after insert/update, according to behavior
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
    const [ok, err, unmapped] = await tryFn(() => this.schema.unmapper(metadata));
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
        const [okBody, errBody, parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
        if (okBody) {
          const [okUnmap, errUnmap, unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody));
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
      const [okBody, errBody, parsedBody] = await tryFn(() => Promise.resolve(body ? JSON.parse(body) : {}));
      let mapFromMeta = this.schema.map;
      if (metadata && metadata._map) {
        const [okMap, errMap, parsedMap] = await tryFn(() => Promise.resolve(typeof metadata._map === "string" ? JSON.parse(metadata._map) : metadata._map));
        mapFromMeta = okMap ? parsedMap : this.schema.map;
      }
      const [okUnmap, errUnmap, unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody, mapFromMeta));
      const result2 = okUnmap ? { ...unmappedBody, id } : { id };
      Object.keys(result2).forEach((k) => {
        result2[k] = fixValue(result2[k]);
      });
      return result2;
    }
    if (behavior === "user-managed" && body && body.trim() !== "") {
      const [okBody, errBody, parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okBody) {
        const [okUnmap, errUnmap, unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody));
        const bodyData = okUnmap ? unmappedBody : {};
        const merged = { ...bodyData, ...unmappedMetadata, id };
        Object.keys(merged).forEach((k) => {
          merged[k] = fixValue(merged[k]);
        });
        return filterInternalFields(merged);
      }
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
    const [ok, err, result] = await tryFn(() => this.insert({ ...attributes, id }));
    if (!ok) {
      if (err && err.message && err.message.includes("already exists")) {
        const updateResult = await this.update(id, attributes);
        return updateResult;
      }
      throw err;
    }
    return result;
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
      "getMany",
      "content",
      "hasContent",
      "query",
      "getFromPartition",
      "setContent",
      "deleteContent",
      "replace"
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
  // Utility to apply schema default values
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
  if (config.events !== void 0) {
    if (typeof config.events !== "object" || Array.isArray(config.events)) {
      errors.push("Resource 'events' must be an object");
    } else {
      for (const [eventName, listeners] of Object.entries(config.events)) {
        if (Array.isArray(listeners)) {
          for (let i = 0; i < listeners.length; i++) {
            const listener = listeners[i];
            if (typeof listener !== "function") {
              errors.push(`Resource 'events.${eventName}[${i}]' must be a function`);
            }
          }
        } else if (typeof listeners !== "function") {
          errors.push(`Resource 'events.${eventName}' must be a function or array of functions`);
        }
      }
    }
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}

class Database extends EventEmitter {
  constructor(options) {
    super();
    this.id = idGenerator(7);
    this.version = "1";
    this.s3dbVersion = (() => {
      const [ok, err, version] = tryFn(() => true ? "11.3.2" : "latest");
      return ok ? version : "latest";
    })();
    this.resources = {};
    this.savedMetadata = null;
    this.options = options;
    this.verbose = options.verbose || false;
    this.parallelism = parseInt(options.parallelism + "") || 10;
    this.plugins = options.plugins || [];
    this.pluginRegistry = {};
    this.pluginList = options.plugins || [];
    this.cache = options.cache;
    this.passphrase = options.passphrase || "secret";
    this.versioningEnabled = options.versioningEnabled || false;
    this.persistHooks = options.persistHooks || false;
    this.strictValidation = options.strictValidation !== false;
    this._initHooks();
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
    this.client = options.client || new Client({
      verbose: this.verbose,
      parallelism: this.parallelism,
      connectionString
    });
    this.connectionString = connectionString;
    this.bucket = this.client.bucket;
    this.keyPrefix = this.client.keyPrefix;
    if (!this._exitListenerRegistered) {
      this._exitListenerRegistered = true;
      if (typeof process !== "undefined") {
        process.on("exit", async () => {
          if (this.isConnected()) {
            await tryFn(() => this.disconnect());
          }
        });
      }
    }
  }
  async connect() {
    await this.startPlugins();
    let metadata = null;
    let needsHealing = false;
    let healingLog = [];
    if (await this.client.exists(`s3db.json`)) {
      const [ok, error] = await tryFn(async () => {
        const request = await this.client.getObject(`s3db.json`);
        const rawContent = await streamToString(request?.Body);
        const [parseOk, parseError, parsedData] = tryFn(() => JSON.parse(rawContent));
        if (!parseOk) {
          healingLog.push("JSON parsing failed - attempting recovery");
          needsHealing = true;
          metadata = await this._attemptJsonRecovery(rawContent, healingLog);
          if (!metadata) {
            await this._createCorruptedBackup(rawContent);
            healingLog.push("Created backup of corrupted file - starting with blank metadata");
            metadata = this.blankMetadataStructure();
          }
        } else {
          metadata = parsedData;
        }
        const healedMetadata = await this._validateAndHealMetadata(metadata, healingLog);
        if (healedMetadata !== metadata) {
          metadata = healedMetadata;
          needsHealing = true;
        }
      });
      if (!ok) {
        healingLog.push(`Critical error reading s3db.json: ${error.message}`);
        await this._createCorruptedBackup();
        metadata = this.blankMetadataStructure();
        needsHealing = true;
      }
    } else {
      metadata = this.blankMetadataStructure();
      await this.uploadMetadataFile();
    }
    if (needsHealing) {
      await this._uploadHealedMetadata(metadata, healingLog);
    }
    this.savedMetadata = metadata;
    const definitionChanges = this.detectDefinitionChanges(metadata);
    for (const [name, resourceMetadata] of Object.entries(metadata.resources || {})) {
      const currentVersion = resourceMetadata.currentVersion || "v0";
      const versionData = resourceMetadata.versions?.[currentVersion];
      if (versionData) {
        let restoredIdGenerator, restoredIdSize;
        if (versionData.idGenerator !== void 0) {
          if (versionData.idGenerator === "custom_function") {
            restoredIdGenerator = void 0;
            restoredIdSize = versionData.idSize || 22;
          } else if (typeof versionData.idGenerator === "number") {
            restoredIdGenerator = versionData.idGenerator;
            restoredIdSize = versionData.idSize || versionData.idGenerator;
          }
        } else {
          restoredIdSize = versionData.idSize || 22;
        }
        this.resources[name] = new Resource({
          name,
          client: this.client,
          database: this,
          // ensure reference
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
          asyncEvents: versionData.asyncEvents !== void 0 ? versionData.asyncEvents : true,
          hooks: this.persistHooks ? this._deserializeHooks(versionData.hooks || {}) : versionData.hooks || {},
          versioningEnabled: this.versioningEnabled,
          strictValidation: this.strictValidation,
          map: versionData.map,
          idGenerator: restoredIdGenerator,
          idSize: restoredIdSize
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
    return `sha256:${crypto.createHash("sha256").update(stableString).digest("hex")}`;
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
  /**
   * Serialize hooks to strings for JSON persistence
   * @param {Object} hooks - Hooks object with event names as keys and function arrays as values
   * @returns {Object} Serialized hooks object
   * @private
   */
  _serializeHooks(hooks) {
    if (!hooks || typeof hooks !== "object") return hooks;
    const serialized = {};
    for (const [event, hookArray] of Object.entries(hooks)) {
      if (Array.isArray(hookArray)) {
        serialized[event] = hookArray.map((hook) => {
          if (typeof hook === "function") {
            const [ok, err, data] = tryFn(() => ({
              __s3db_serialized_function: true,
              code: hook.toString(),
              name: hook.name || "anonymous"
            }));
            if (!ok) {
              if (this.verbose) {
                console.warn(`Failed to serialize hook for event '${event}':`, err.message);
              }
              return null;
            }
            return data;
          }
          return hook;
        });
      } else {
        serialized[event] = hookArray;
      }
    }
    return serialized;
  }
  /**
   * Deserialize hooks from strings back to functions
   * @param {Object} serializedHooks - Serialized hooks object
   * @returns {Object} Deserialized hooks object
   * @private
   */
  _deserializeHooks(serializedHooks) {
    if (!serializedHooks || typeof serializedHooks !== "object") return serializedHooks;
    const deserialized = {};
    for (const [event, hookArray] of Object.entries(serializedHooks)) {
      if (Array.isArray(hookArray)) {
        deserialized[event] = hookArray.map((hook) => {
          if (hook && typeof hook === "object" && hook.__s3db_serialized_function) {
            const [ok, err, fn] = tryFn(() => {
              const func = new Function("return " + hook.code)();
              return typeof func === "function" ? func : null;
            });
            if (!ok || fn === null) {
              if (this.verbose) {
                console.warn(`Failed to deserialize hook '${hook.name}' for event '${event}':`, err?.message || "Invalid function");
              }
              return null;
            }
            return fn;
          }
          return hook;
        }).filter((hook) => hook !== null);
      } else {
        deserialized[event] = hookArray;
      }
    }
    return deserialized;
  }
  async startPlugins() {
    const db = this;
    if (!lodashEs.isEmpty(this.pluginList)) {
      const plugins = this.pluginList.map((p) => lodashEs.isFunction(p) ? new p(this) : p);
      const installProms = plugins.map(async (plugin) => {
        await plugin.install(db);
        const pluginName = this._getPluginName(plugin);
        this.pluginRegistry[pluginName] = plugin;
      });
      await Promise.all(installProms);
      const startProms = plugins.map(async (plugin) => {
        await plugin.start();
      });
      await Promise.all(startProms);
    }
  }
  /**
   * Register and setup a plugin
   * @param {Plugin} plugin - Plugin instance to register
   * @param {string} [name] - Optional name for the plugin (defaults to plugin.constructor.name)
   */
  /**
   * Get the normalized plugin name
   * @private
   */
  _getPluginName(plugin, customName = null) {
    return customName || plugin.constructor.name.replace("Plugin", "").toLowerCase();
  }
  async usePlugin(plugin, name = null) {
    const pluginName = this._getPluginName(plugin, name);
    this.plugins[pluginName] = plugin;
    if (this.isConnected()) {
      await plugin.install(this);
      await plugin.start();
    }
    return plugin;
  }
  /**
   * Uninstall a plugin and optionally purge its data
   * @param {string} name - Plugin name
   * @param {Object} options - Uninstall options
   * @param {boolean} options.purgeData - Delete all plugin data from S3 (default: false)
   */
  async uninstallPlugin(name, options = {}) {
    const pluginName = name.toLowerCase().replace("plugin", "");
    const plugin = this.plugins[pluginName] || this.pluginRegistry[pluginName];
    if (!plugin) {
      throw new DatabaseError(`Plugin '${name}' not found`, {
        operation: "uninstallPlugin",
        pluginName: name,
        availablePlugins: Object.keys(this.pluginRegistry),
        suggestion: "Check plugin name or list available plugins using Object.keys(db.pluginRegistry)"
      });
    }
    if (plugin.stop) {
      await plugin.stop();
    }
    if (plugin.uninstall) {
      await plugin.uninstall(options);
    }
    delete this.plugins[pluginName];
    delete this.pluginRegistry[pluginName];
    const index = this.pluginList.indexOf(plugin);
    if (index > -1) {
      this.pluginList.splice(index, 1);
    }
    this.emit("plugin.uninstalled", { name: pluginName, plugin });
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
        createdBy: existingResource?.createdBy || resource.config.createdBy || "user",
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
            asyncEvents: resource.config.asyncEvents,
            hooks: this.persistHooks ? this._serializeHooks(resource.config.hooks) : resource.config.hooks,
            idSize: resource.idSize,
            idGenerator: resource.idGeneratorType,
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
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      resources: {}
    };
  }
  /**
   * Attempt to recover JSON from corrupted content
   */
  async _attemptJsonRecovery(content, healingLog) {
    if (!content || typeof content !== "string") {
      healingLog.push("Content is empty or not a string");
      return null;
    }
    const fixes = [
      // Remove trailing commas
      () => content.replace(/,(\s*[}\]])/g, "$1"),
      // Add missing quotes to keys
      () => content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":'),
      // Fix incomplete objects by adding closing braces
      () => {
        let openBraces = 0;
        let openBrackets = 0;
        let inString = false;
        let escaped = false;
        for (let i = 0; i < content.length; i++) {
          const char = content[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === "\\") {
            escaped = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (char === "{") openBraces++;
            else if (char === "}") openBraces--;
            else if (char === "[") openBrackets++;
            else if (char === "]") openBrackets--;
          }
        }
        let fixed = content;
        while (openBrackets > 0) {
          fixed += "]";
          openBrackets--;
        }
        while (openBraces > 0) {
          fixed += "}";
          openBraces--;
        }
        return fixed;
      }
    ];
    for (const [index, fix] of fixes.entries()) {
      const [ok, err, parsed] = tryFn(() => {
        const fixedContent = fix();
        return JSON.parse(fixedContent);
      });
      if (ok) {
        healingLog.push(`JSON recovery successful using fix #${index + 1}`);
        return parsed;
      }
    }
    healingLog.push("All JSON recovery attempts failed");
    return null;
  }
  /**
   * Validate and heal metadata structure
   */
  async _validateAndHealMetadata(metadata, healingLog) {
    if (!metadata || typeof metadata !== "object") {
      healingLog.push("Metadata is not an object - using blank structure");
      return this.blankMetadataStructure();
    }
    let healed = { ...metadata };
    let changed = false;
    if (!healed.version || typeof healed.version !== "string") {
      if (healed.version && typeof healed.version === "number") {
        healed.version = String(healed.version);
        healingLog.push("Converted version from number to string");
        changed = true;
      } else {
        healed.version = "1";
        healingLog.push("Added missing or invalid version field");
        changed = true;
      }
    }
    if (!healed.s3dbVersion || typeof healed.s3dbVersion !== "string") {
      if (healed.s3dbVersion && typeof healed.s3dbVersion !== "string") {
        healed.s3dbVersion = String(healed.s3dbVersion);
        healingLog.push("Converted s3dbVersion to string");
        changed = true;
      } else {
        healed.s3dbVersion = this.s3dbVersion;
        healingLog.push("Added missing s3dbVersion field");
        changed = true;
      }
    }
    if (!healed.resources || typeof healed.resources !== "object" || Array.isArray(healed.resources)) {
      healed.resources = {};
      healingLog.push("Fixed invalid resources field");
      changed = true;
    }
    if (!healed.lastUpdated) {
      healed.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
      healingLog.push("Added missing lastUpdated field");
      changed = true;
    }
    const validResources = {};
    for (const [name, resource] of Object.entries(healed.resources)) {
      const healedResource = this._healResourceStructure(name, resource, healingLog);
      if (healedResource) {
        validResources[name] = healedResource;
        if (healedResource !== resource) {
          changed = true;
        }
      } else {
        healingLog.push(`Removed invalid resource: ${name}`);
        changed = true;
      }
    }
    healed.resources = validResources;
    return changed ? healed : metadata;
  }
  /**
   * Heal individual resource structure
   */
  _healResourceStructure(name, resource, healingLog) {
    if (!resource || typeof resource !== "object") {
      healingLog.push(`Resource ${name}: invalid structure`);
      return null;
    }
    let healed = { ...resource };
    let changed = false;
    if (!healed.currentVersion) {
      healed.currentVersion = "v0";
      healingLog.push(`Resource ${name}: added missing currentVersion`);
      changed = true;
    }
    if (!healed.versions || typeof healed.versions !== "object" || Array.isArray(healed.versions)) {
      healed.versions = {};
      healingLog.push(`Resource ${name}: fixed invalid versions object`);
      changed = true;
    }
    if (!healed.partitions || typeof healed.partitions !== "object" || Array.isArray(healed.partitions)) {
      healed.partitions = {};
      healingLog.push(`Resource ${name}: fixed invalid partitions object`);
      changed = true;
    }
    const currentVersion = healed.currentVersion;
    if (!healed.versions[currentVersion]) {
      const availableVersions = Object.keys(healed.versions);
      if (availableVersions.length > 0) {
        healed.currentVersion = availableVersions[0];
        healingLog.push(`Resource ${name}: changed currentVersion from ${currentVersion} to ${healed.currentVersion}`);
        changed = true;
      } else {
        healingLog.push(`Resource ${name}: no valid versions found - removing resource`);
        return null;
      }
    }
    const versionData = healed.versions[healed.currentVersion];
    if (!versionData || typeof versionData !== "object") {
      healingLog.push(`Resource ${name}: invalid version data - removing resource`);
      return null;
    }
    if (!versionData.attributes || typeof versionData.attributes !== "object") {
      healingLog.push(`Resource ${name}: missing or invalid attributes - removing resource`);
      return null;
    }
    if (versionData.hooks) {
      const healedHooks = this._healHooksStructure(versionData.hooks, name, healingLog);
      if (healedHooks !== versionData.hooks) {
        healed.versions[healed.currentVersion].hooks = healedHooks;
        changed = true;
      }
    }
    return changed ? healed : resource;
  }
  /**
   * Heal hooks structure
   */
  _healHooksStructure(hooks, resourceName, healingLog) {
    if (!hooks || typeof hooks !== "object") {
      healingLog.push(`Resource ${resourceName}: invalid hooks structure - using empty hooks`);
      return {};
    }
    const healed = {};
    let changed = false;
    for (const [event, hookArray] of Object.entries(hooks)) {
      if (Array.isArray(hookArray)) {
        const validHooks = hookArray.filter(
          (hook) => hook !== null && hook !== void 0 && hook !== ""
        );
        healed[event] = validHooks;
        if (validHooks.length !== hookArray.length) {
          healingLog.push(`Resource ${resourceName}: cleaned invalid hooks for event ${event}`);
          changed = true;
        }
      } else {
        healingLog.push(`Resource ${resourceName}: hooks for event ${event} is not an array - removing`);
        changed = true;
      }
    }
    return changed ? healed : hooks;
  }
  /**
   * Create backup of corrupted file
   */
  async _createCorruptedBackup(content = null) {
    const [ok, err] = await tryFn(async () => {
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
      const backupKey = `s3db.json.corrupted.${timestamp}.backup`;
      if (!content) {
        const [readOk, readErr, readData] = await tryFn(async () => {
          const request = await this.client.getObject(`s3db.json`);
          return await streamToString(request?.Body);
        });
        content = readOk ? readData : "Unable to read corrupted file content";
      }
      await this.client.putObject({
        key: backupKey,
        body: content,
        contentType: "application/json"
      });
      if (this.verbose) {
        console.warn(`S3DB: Created backup of corrupted s3db.json as ${backupKey}`);
      }
    });
    if (!ok && this.verbose) {
      console.warn(`S3DB: Failed to create backup: ${err.message}`);
    }
  }
  /**
   * Upload healed metadata with logging
   */
  async _uploadHealedMetadata(metadata, healingLog) {
    const [ok, err] = await tryFn(async () => {
      if (this.verbose && healingLog.length > 0) {
        console.warn("S3DB Self-Healing Operations:");
        healingLog.forEach((log) => console.warn(`  - ${log}`));
      }
      metadata.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
      await this.client.putObject({
        key: "s3db.json",
        body: JSON.stringify(metadata, null, 2),
        contentType: "application/json"
      });
      this.emit("metadataHealed", { healingLog, metadata });
      if (this.verbose) {
        console.warn("S3DB: Successfully uploaded healed metadata");
      }
    });
    if (!ok) {
      if (this.verbose) {
        console.error(`S3DB: Failed to upload healed metadata: ${err.message}`);
      }
      throw err;
    }
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
    const mockResource = new Resource({
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
  /**
   * Create or update a resource in the database
   * @param {Object} config - Resource configuration
   * @param {string} config.name - Resource name
   * @param {Object} config.attributes - Resource attributes schema
   * @param {string} [config.behavior='user-managed'] - Resource behavior strategy
   * @param {Object} [config.hooks] - Resource hooks
   * @param {boolean} [config.asyncEvents=true] - Whether events should be emitted asynchronously
   * @param {boolean} [config.timestamps=false] - Enable automatic timestamps
   * @param {Object} [config.partitions={}] - Partition definitions
   * @param {boolean} [config.paranoid=true] - Security flag for dangerous operations
   * @param {boolean} [config.cache=false] - Enable caching
   * @param {boolean} [config.autoDecrypt=true] - Auto-decrypt secret fields
   * @param {Function|number} [config.idGenerator] - Custom ID generator or size
   * @param {number} [config.idSize=22] - Size for auto-generated IDs
   * @param {string} [config.createdBy='user'] - Who created this resource ('user', 'plugin', or plugin name)
   * @returns {Promise<Resource>} The created or updated resource
   */
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
    const resource = new Resource({
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
      strictValidation: config.strictValidation !== void 0 ? config.strictValidation : this.strictValidation,
      map: config.map,
      idGenerator: config.idGenerator,
      idSize: config.idSize,
      asyncEvents: config.asyncEvents,
      events: config.events || {},
      createdBy: config.createdBy || "user"
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
    await tryFn(async () => {
      if (this.pluginList && this.pluginList.length > 0) {
        for (const plugin of this.pluginList) {
          if (plugin && typeof plugin.removeAllListeners === "function") {
            plugin.removeAllListeners();
          }
        }
        const stopProms = this.pluginList.map(async (plugin) => {
          await tryFn(async () => {
            if (plugin && typeof plugin.stop === "function") {
              await plugin.stop();
            }
          });
        });
        await Promise.all(stopProms);
      }
      if (this.resources && Object.keys(this.resources).length > 0) {
        for (const [name, resource] of Object.entries(this.resources)) {
          await tryFn(() => {
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
          });
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
    });
  }
  /**
   * Initialize hooks system for database operations
   * @private
   */
  _initHooks() {
    this._hooks = /* @__PURE__ */ new Map();
    this._hookEvents = [
      "beforeConnect",
      "afterConnect",
      "beforeCreateResource",
      "afterCreateResource",
      "beforeUploadMetadata",
      "afterUploadMetadata",
      "beforeDisconnect",
      "afterDisconnect",
      "resourceCreated",
      "resourceUpdated"
    ];
    for (const event of this._hookEvents) {
      this._hooks.set(event, []);
    }
    this._wrapHookableMethods();
  }
  /**
   * Wrap methods that can have hooks
   * @private
   */
  _wrapHookableMethods() {
    if (this._hooksInstalled) return;
    this._originalConnect = this.connect.bind(this);
    this._originalCreateResource = this.createResource.bind(this);
    this._originalUploadMetadataFile = this.uploadMetadataFile.bind(this);
    this._originalDisconnect = this.disconnect.bind(this);
    this.connect = async (...args) => {
      await this._executeHooks("beforeConnect", { args });
      const result = await this._originalConnect(...args);
      await this._executeHooks("afterConnect", { result, args });
      return result;
    };
    this.createResource = async (config) => {
      await this._executeHooks("beforeCreateResource", { config });
      const resource = await this._originalCreateResource(config);
      await this._executeHooks("afterCreateResource", { resource, config });
      return resource;
    };
    this.uploadMetadataFile = async (...args) => {
      await this._executeHooks("beforeUploadMetadata", { args });
      const result = await this._originalUploadMetadataFile(...args);
      await this._executeHooks("afterUploadMetadata", { result, args });
      return result;
    };
    this.disconnect = async (...args) => {
      await this._executeHooks("beforeDisconnect", { args });
      const result = await this._originalDisconnect(...args);
      await this._executeHooks("afterDisconnect", { result, args });
      return result;
    };
    this._hooksInstalled = true;
  }
  /**
   * Add a hook for a specific database event
   * @param {string} event - Hook event name
   * @param {Function} fn - Hook function
   * @example
   * database.addHook('afterCreateResource', async ({ resource }) => {
   *   console.log('Resource created:', resource.name);
   * });
   */
  addHook(event, fn) {
    if (!this._hooks) this._initHooks();
    if (!this._hooks.has(event)) {
      throw new DatabaseError(`Unknown hook event: ${event}`, {
        operation: "addHook",
        invalidEvent: event,
        availableEvents: this._hookEvents,
        suggestion: `Use one of the available hook events: ${this._hookEvents.join(", ")}`
      });
    }
    if (typeof fn !== "function") {
      throw new DatabaseError("Hook function must be a function", {
        operation: "addHook",
        event,
        receivedType: typeof fn,
        suggestion: "Provide a function that will be called when the hook event occurs"
      });
    }
    this._hooks.get(event).push(fn);
  }
  /**
   * Execute hooks for a specific event
   * @param {string} event - Hook event name
   * @param {Object} context - Context data to pass to hooks
   * @private
   */
  async _executeHooks(event, context = {}) {
    if (!this._hooks || !this._hooks.has(event)) return;
    const hooks = this._hooks.get(event);
    for (const hook of hooks) {
      const [ok, error] = await tryFn(() => hook({ database: this, ...context }));
      if (!ok) {
        this.emit("hookError", { event, error, context });
      }
    }
  }
  /**
   * Remove a hook for a specific event
   * @param {string} event - Hook event name
   * @param {Function} fn - Hook function to remove
   */
  removeHook(event, fn) {
    if (!this._hooks || !this._hooks.has(event)) return;
    const hooks = this._hooks.get(event);
    const index = hooks.indexOf(fn);
    if (index > -1) {
      hooks.splice(index, 1);
    }
  }
  /**
   * Get all hooks for a specific event
   * @param {string} event - Hook event name
   * @returns {Function[]} Array of hook functions
   */
  getHooks(event) {
    if (!this._hooks || !this._hooks.has(event)) return [];
    return [...this._hooks.get(event)];
  }
  /**
   * Clear all hooks for a specific event
   * @param {string} event - Hook event name
   */
  clearHooks(event) {
    if (!this._hooks || !this._hooks.has(event)) return;
    this._hooks.get(event).length = 0;
  }
}
class S3db extends Database {
}

function normalizeResourceName$1(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : name;
}
class S3dbReplicator extends BaseReplicator {
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
        else if (typeof res === "object" && res.resource) {
          map[normalizeResourceName$1(res.resource)] = res;
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
            if (typeof item === "object" && item.resource) {
              return item;
            }
            return item;
          });
        } else if (typeof dest === "function") map[normSrc] = dest;
        else if (typeof dest === "object" && dest.resource) {
          map[normSrc] = dest;
        }
      }
      return map;
    }
    if (typeof resources === "function") {
      return resources;
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
    await super.initialize(database);
    const [ok, err] = await tryFn(async () => {
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
        throw new ReplicationError("S3dbReplicator requires client or connectionString", {
          operation: "initialize",
          replicatorClass: "S3dbReplicator",
          suggestion: 'Provide either a client instance or connectionString in config: { client: db } or { connectionString: "s3://..." }'
        });
      }
      this.emit("connected", {
        replicator: this.name,
        target: this.connectionString || "client-provided"
      });
    });
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[S3dbReplicator] Initialization failed: ${err.message}`);
      }
      throw err;
    }
  }
  // Support both object and parameter signatures for flexibility
  async replicate(resourceOrObj, operation, data, recordId, beforeData) {
    let resource, op, payload, id;
    if (typeof resourceOrObj === "object" && resourceOrObj.resource) {
      resource = resourceOrObj.resource;
      op = resourceOrObj.operation;
      payload = resourceOrObj.data;
      id = resourceOrObj.id;
    } else {
      resource = resourceOrObj;
      op = operation;
      payload = data;
      id = recordId;
    }
    const normResource = normalizeResourceName$1(resource);
    const entry = this.resourcesMap[normResource];
    if (!entry) {
      throw new ReplicationError("Resource not configured for replication", {
        operation: "replicate",
        replicatorClass: "S3dbReplicator",
        resourceName: resource,
        configuredResources: Object.keys(this.resourcesMap),
        suggestion: 'Add resource to replicator resources map: { resources: { [resourceName]: "destination" } }'
      });
    }
    if (Array.isArray(entry)) {
      const results = [];
      for (const destConfig of entry) {
        const [ok, error, result] = await tryFn(async () => {
          return await this._replicateToSingleDestination(destConfig, normResource, op, payload, id);
        });
        if (!ok) {
          if (this.config && this.config.verbose) {
            console.warn(`[S3dbReplicator] Failed to replicate to destination ${JSON.stringify(destConfig)}: ${error.message}`);
          }
          throw error;
        }
        results.push(result);
      }
      return results;
    } else {
      const [ok, error, result] = await tryFn(async () => {
        return await this._replicateToSingleDestination(entry, normResource, op, payload, id);
      });
      if (!ok) {
        if (this.config && this.config.verbose) {
          console.warn(`[S3dbReplicator] Failed to replicate to destination ${JSON.stringify(entry)}: ${error.message}`);
        }
        throw error;
      }
      return result;
    }
  }
  async _replicateToSingleDestination(destConfig, sourceResource, operation, data, recordId) {
    let destResourceName;
    if (typeof destConfig === "string") {
      destResourceName = destConfig;
    } else if (typeof destConfig === "object" && destConfig.resource) {
      destResourceName = destConfig.resource;
    } else {
      destResourceName = sourceResource;
    }
    if (typeof destConfig === "object" && destConfig.actions && Array.isArray(destConfig.actions)) {
      if (!destConfig.actions.includes(operation)) {
        return { skipped: true, reason: "action_not_supported", action: operation, destination: destResourceName };
      }
    }
    const destResourceObj = this._getDestResourceObj(destResourceName);
    let transformedData;
    if (typeof destConfig === "object" && destConfig.transform && typeof destConfig.transform === "function") {
      transformedData = destConfig.transform(data);
      if (transformedData && data && data.id && !transformedData.id) {
        transformedData.id = data.id;
      }
    } else if (typeof destConfig === "object" && destConfig.transformer && typeof destConfig.transformer === "function") {
      transformedData = destConfig.transformer(data);
      if (transformedData && data && data.id && !transformedData.id) {
        transformedData.id = data.id;
      }
    } else {
      transformedData = data;
    }
    if (!transformedData && data) transformedData = data;
    let result;
    if (operation === "insert") {
      result = await destResourceObj.insert(transformedData);
    } else if (operation === "update") {
      result = await destResourceObj.update(recordId, transformedData);
    } else if (operation === "delete") {
      result = await destResourceObj.delete(recordId);
    } else {
      throw new ReplicationError(`Invalid replication operation: ${operation}`, {
        operation: "replicate",
        replicatorClass: "S3dbReplicator",
        invalidOperation: operation,
        supportedOperations: ["insert", "update", "delete"],
        resourceName: sourceResource,
        suggestion: "Use one of the supported operations: insert, update, delete"
      });
    }
    return result;
  }
  _applyTransformer(resource, data) {
    let cleanData = this._cleanInternalFields(data);
    const normResource = normalizeResourceName$1(resource);
    const entry = this.resourcesMap[normResource];
    let result;
    if (!entry) return cleanData;
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === "object" && item.transform && typeof item.transform === "function") {
          result = item.transform(cleanData);
          break;
        } else if (typeof item === "object" && item.transformer && typeof item.transformer === "function") {
          result = item.transformer(cleanData);
          break;
        }
      }
      if (!result) result = cleanData;
    } else if (typeof entry === "object") {
      if (typeof entry.transform === "function") {
        result = entry.transform(cleanData);
      } else if (typeof entry.transformer === "function") {
        result = entry.transformer(cleanData);
      }
    } else if (typeof entry === "function") {
      result = entry(cleanData);
    } else {
      result = cleanData;
    }
    if (result && cleanData && cleanData.id && !result.id) result.id = cleanData.id;
    if (!result && cleanData) result = cleanData;
    return result;
  }
  _cleanInternalFields(data) {
    if (!data || typeof data !== "object") return data;
    const cleanData = { ...data };
    Object.keys(cleanData).forEach((key) => {
      if (key.startsWith("$") || key.startsWith("_")) {
        delete cleanData[key];
      }
    });
    return cleanData;
  }
  _resolveDestResource(resource, data) {
    const normResource = normalizeResourceName$1(resource);
    const entry = this.resourcesMap[normResource];
    if (!entry) return resource;
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item.resource) return item.resource;
      }
      return resource;
    }
    if (typeof entry === "string") return entry;
    if (typeof entry === "function") return resource;
    if (typeof entry === "object" && entry.resource) return entry.resource;
    return resource;
  }
  _getDestResourceObj(resource) {
    const db = this.targetDatabase || this.client;
    const available = Object.keys(db.resources || {});
    const norm = normalizeResourceName$1(resource);
    const found = available.find((r) => normalizeResourceName$1(r) === norm);
    if (!found) {
      throw new ReplicationError("Destination resource not found in target database", {
        operation: "_getDestResourceObj",
        replicatorClass: "S3dbReplicator",
        destinationResource: resource,
        availableResources: available,
        suggestion: "Create the resource in target database or check resource name spelling"
      });
    }
    return db.resources[found];
  }
  async replicateBatch(resourceName, records) {
    if (this.enabled === false) {
      return { skipped: true, reason: "replicator_disabled" };
    }
    if (!this.shouldReplicateResource(resourceName)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const results = [];
    const errors = [];
    for (const record of records) {
      const [ok, err, result] = await tryFn(() => this.replicate({
        resource: resourceName,
        operation: record.operation,
        id: record.id,
        data: record.data,
        beforeData: record.beforeData
      }));
      if (ok) {
        results.push(result);
      } else {
        if (this.config.verbose) {
          console.warn(`[S3dbReplicator] Batch replication failed for record ${record.id}: ${err.message}`);
        }
        errors.push({ id: record.id, error: err.message });
      }
    }
    if (errors.length > 0) {
      console.warn(`[S3dbReplicator] Batch replication completed with ${errors.length} error(s) for ${resourceName}:`, errors);
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
    const [ok, err] = await tryFn(async () => {
      if (!this.targetDatabase) {
        throw new ReplicationError("No target database configured for connection test", {
          operation: "testConnection",
          replicatorClass: "S3dbReplicator",
          suggestion: "Initialize replicator with client or connectionString before testing connection"
        });
      }
      if (typeof this.targetDatabase.connect === "function") {
        await this.targetDatabase.connect();
      }
      return true;
    });
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[S3dbReplicator] Connection test failed: ${err.message}`);
      }
      this.emit("connection_error", { replicator: this.name, error: err.message });
      return false;
    }
    return true;
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
        } else if (typeof item === "string") {
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

class SqsReplicator extends BaseReplicator {
  constructor(config = {}, resources = [], client = null) {
    super(config);
    this.client = client;
    this.queueUrl = config.queueUrl;
    this.queues = config.queues || {};
    this.defaultQueue = config.defaultQueue || config.defaultQueueUrl || config.queueUrlDefault || null;
    this.region = config.region || "us-east-1";
    this.sqsClient = client || null;
    this.messageGroupId = config.messageGroupId;
    this.deduplicationId = config.deduplicationId;
    this.resourceQueueMap = config.resourceQueueMap || null;
    if (Array.isArray(resources)) {
      this.resources = {};
      for (const resource of resources) {
        if (typeof resource === "string") {
          this.resources[resource] = true;
        } else if (typeof resource === "object" && resource.name) {
          this.resources[resource.name] = resource;
        }
      }
    } else if (typeof resources === "object") {
      this.resources = resources;
      for (const [resourceName, resourceConfig] of Object.entries(resources)) {
        if (resourceConfig && resourceConfig.queueUrl) {
          this.queues[resourceName] = resourceConfig.queueUrl;
        }
      }
    } else {
      this.resources = {};
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
    let cleanData = this._cleanInternalFields(data);
    const entry = this.resources[resource];
    let result = cleanData;
    if (!entry) return cleanData;
    if (typeof entry.transform === "function") {
      result = entry.transform(cleanData);
    } else if (typeof entry.transformer === "function") {
      result = entry.transformer(cleanData);
    }
    return result || cleanData;
  }
  _cleanInternalFields(data) {
    if (!data || typeof data !== "object") return data;
    const cleanData = { ...data };
    Object.keys(cleanData).forEach((key) => {
      if (key.startsWith("$") || key.startsWith("_")) {
        delete cleanData[key];
      }
    });
    return cleanData;
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
      const [ok, err, sdk] = await tryFn(() => import('@aws-sdk/client-sqs'));
      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[SqsReplicator] Failed to import SQS SDK: ${err.message}`);
        }
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
    if (this.enabled === false) {
      return { skipped: true, reason: "replicator_disabled" };
    }
    if (!this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const [ok, err, result] = await tryFn(async () => {
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
    if (this.config.verbose) {
      console.warn(`[SqsReplicator] Replication failed for ${resource}: ${err.message}`);
    }
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
    if (this.enabled === false) {
      return { skipped: true, reason: "replicator_disabled" };
    }
    if (!this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const [ok, err, result] = await tryFn(async () => {
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
        const [okBatch, errBatch] = await tryFn(async () => {
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
      if (errors.length > 0) {
        console.warn(`[SqsReplicator] Batch replication completed with ${errors.length} error(s) for ${resource}:`, errors);
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
    if (this.config.verbose) {
      console.warn(`[SqsReplicator] Batch replication failed for ${resource}: ${errorMessage}`);
    }
    this.emit("batch_replicator_error", {
      replicator: this.name,
      resource,
      error: errorMessage
    });
    return { success: false, error: errorMessage };
  }
  async testConnection() {
    const [ok, err] = await tryFn(async () => {
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
    if (this.config.verbose) {
      console.warn(`[SqsReplicator] Connection test failed: ${err.message}`);
    }
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
      resources: Object.keys(this.resources || {}),
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

class WebhookReplicator extends BaseReplicator {
  constructor(config = {}, resources = [], client = null) {
    super(config);
    this.url = config.url;
    if (!this.url) {
      throw new Error('WebhookReplicator requires a "url" configuration');
    }
    this.method = (config.method || "POST").toUpperCase();
    this.headers = config.headers || {};
    this.timeout = config.timeout || 5e3;
    this.retries = config.retries ?? 3;
    this.retryDelay = config.retryDelay || 1e3;
    this.retryStrategy = config.retryStrategy || "exponential";
    this.retryOnStatus = config.retryOnStatus || [429, 500, 502, 503, 504];
    this.batch = config.batch || false;
    this.batchSize = config.batchSize || 100;
    this.auth = config.auth || null;
    if (Array.isArray(resources)) {
      this.resources = {};
      for (const resource of resources) {
        if (typeof resource === "string") {
          this.resources[resource] = true;
        } else if (typeof resource === "object" && resource.name) {
          this.resources[resource.name] = resource;
        }
      }
    } else if (typeof resources === "object") {
      this.resources = resources;
    } else {
      this.resources = {};
    }
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retriedRequests: 0,
      totalRetries: 0
    };
  }
  validateConfig() {
    const errors = [];
    if (!this.url) {
      errors.push("URL is required");
    }
    try {
      new URL(this.url);
    } catch (err) {
      errors.push(`Invalid URL format: ${this.url}`);
    }
    if (this.auth) {
      if (!this.auth.type) {
        errors.push("auth.type is required when auth is configured");
      } else if (!["bearer", "basic", "apikey"].includes(this.auth.type)) {
        errors.push("auth.type must be one of: bearer, basic, apikey");
      }
      if (this.auth.type === "bearer" && !this.auth.token) {
        errors.push("auth.token is required for bearer authentication");
      }
      if (this.auth.type === "basic" && (!this.auth.username || !this.auth.password)) {
        errors.push("auth.username and auth.password are required for basic authentication");
      }
      if (this.auth.type === "apikey" && (!this.auth.header || !this.auth.value)) {
        errors.push("auth.header and auth.value are required for API key authentication");
      }
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  /**
   * Build headers with authentication
   * @returns {Object} Headers object
   */
  _buildHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "s3db-webhook-replicator",
      ...this.headers
    };
    if (this.auth) {
      switch (this.auth.type) {
        case "bearer":
          headers["Authorization"] = `Bearer ${this.auth.token}`;
          break;
        case "basic":
          const credentials = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString("base64");
          headers["Authorization"] = `Basic ${credentials}`;
          break;
        case "apikey":
          headers[this.auth.header] = this.auth.value;
          break;
      }
    }
    return headers;
  }
  /**
   * Apply resource transformer if configured
   * @param {string} resource - Resource name
   * @param {Object} data - Data to transform
   * @returns {Object} Transformed data
   */
  _applyTransformer(resource, data) {
    let cleanData = this._cleanInternalFields(data);
    const entry = this.resources[resource];
    let result = cleanData;
    if (!entry) return cleanData;
    if (typeof entry.transform === "function") {
      result = entry.transform(cleanData);
    } else if (typeof entry.transformer === "function") {
      result = entry.transformer(cleanData);
    }
    return result || cleanData;
  }
  /**
   * Remove internal fields from data
   * @param {Object} data - Data object
   * @returns {Object} Cleaned data
   */
  _cleanInternalFields(data) {
    if (!data || typeof data !== "object") return data;
    const cleanData = { ...data };
    Object.keys(cleanData).forEach((key) => {
      if (key.startsWith("$") || key.startsWith("_")) {
        delete cleanData[key];
      }
    });
    return cleanData;
  }
  /**
   * Create standardized webhook payload
   * @param {string} resource - Resource name
   * @param {string} operation - Operation type
   * @param {Object} data - Record data
   * @param {string} id - Record ID
   * @param {Object} beforeData - Before data (for updates)
   * @returns {Object} Webhook payload
   */
  createPayload(resource, operation, data, id, beforeData = null) {
    const basePayload = {
      resource,
      action: operation,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      source: "s3db-webhook-replicator"
    };
    switch (operation) {
      case "insert":
        return {
          ...basePayload,
          data
        };
      case "update":
        return {
          ...basePayload,
          before: beforeData,
          data
        };
      case "delete":
        return {
          ...basePayload,
          data
        };
      default:
        return {
          ...basePayload,
          data
        };
    }
  }
  /**
   * Make HTTP request with retries
   * @param {Object} payload - Request payload
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Object>} Response
   */
  async _makeRequest(payload, attempt = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(this.url, {
        method: this.method,
        headers: this._buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      this.stats.totalRequests++;
      if (response.ok) {
        this.stats.successfulRequests++;
        return {
          success: true,
          status: response.status,
          statusText: response.statusText
        };
      }
      if (this.retryOnStatus.includes(response.status) && attempt < this.retries) {
        this.stats.retriedRequests++;
        this.stats.totalRetries++;
        const delay = this.retryStrategy === "exponential" ? this.retryDelay * Math.pow(2, attempt) : this.retryDelay;
        if (this.config.verbose) {
          console.log(`[WebhookReplicator] Retrying request (attempt ${attempt + 1}/${this.retries}) after ${delay}ms - Status: ${response.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this._makeRequest(payload, attempt + 1);
      }
      this.stats.failedRequests++;
      const errorText = await response.text().catch(() => "");
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        error: errorText || `HTTP ${response.status}: ${response.statusText}`
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (attempt < this.retries) {
        this.stats.retriedRequests++;
        this.stats.totalRetries++;
        const delay = this.retryStrategy === "exponential" ? this.retryDelay * Math.pow(2, attempt) : this.retryDelay;
        if (this.config.verbose) {
          console.log(`[WebhookReplicator] Retrying request (attempt ${attempt + 1}/${this.retries}) after ${delay}ms - Error: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this._makeRequest(payload, attempt + 1);
      }
      this.stats.failedRequests++;
      this.stats.totalRequests++;
      return {
        success: false,
        error: error.message
      };
    }
  }
  async initialize(database) {
    await super.initialize(database);
    const validation = this.validateConfig();
    if (!validation.isValid) {
      const error = new Error(`WebhookReplicator configuration is invalid: ${validation.errors.join(", ")}`);
      if (this.config.verbose) {
        console.error(`[WebhookReplicator] ${error.message}`);
      }
      this.emit("initialization_error", {
        replicator: this.name,
        error: error.message,
        errors: validation.errors
      });
      throw error;
    }
    this.emit("initialized", {
      replicator: this.name,
      url: this.url,
      method: this.method,
      authType: this.auth?.type || "none",
      resources: Object.keys(this.resources || {})
    });
  }
  async replicate(resource, operation, data, id, beforeData = null) {
    if (this.enabled === false) {
      return { skipped: true, reason: "replicator_disabled" };
    }
    if (!this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const [ok, err, result] = await tryFn(async () => {
      const transformedData = this._applyTransformer(resource, data);
      const payload = this.createPayload(resource, operation, transformedData, id, beforeData);
      const response = await this._makeRequest(payload);
      if (response.success) {
        this.emit("replicated", {
          replicator: this.name,
          resource,
          operation,
          id,
          url: this.url,
          status: response.status,
          success: true
        });
        return { success: true, status: response.status };
      }
      throw new Error(response.error || `HTTP ${response.status}: ${response.statusText}`);
    });
    if (ok) return result;
    if (this.config.verbose) {
      console.warn(`[WebhookReplicator] Replication failed for ${resource}: ${err.message}`);
    }
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
    if (this.enabled === false) {
      return { skipped: true, reason: "replicator_disabled" };
    }
    if (!this.shouldReplicateResource(resource)) {
      return { skipped: true, reason: "resource_not_included" };
    }
    const [ok, err, result] = await tryFn(async () => {
      if (this.batch) {
        const payloads = records.map(
          (record) => this.createPayload(
            resource,
            record.operation,
            this._applyTransformer(resource, record.data),
            record.id,
            record.beforeData
          )
        );
        const response = await this._makeRequest({ batch: payloads });
        if (response.success) {
          this.emit("batch_replicated", {
            replicator: this.name,
            resource,
            url: this.url,
            total: records.length,
            successful: records.length,
            errors: 0,
            status: response.status
          });
          return {
            success: true,
            total: records.length,
            successful: records.length,
            errors: 0,
            status: response.status
          };
        }
        throw new Error(response.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const results = await Promise.allSettled(
        records.map(
          (record) => this.replicate(resource, record.operation, record.data, record.id, record.beforeData)
        )
      );
      const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
      const failed = results.length - successful;
      this.emit("batch_replicated", {
        replicator: this.name,
        resource,
        url: this.url,
        total: records.length,
        successful,
        errors: failed
      });
      return {
        success: failed === 0,
        total: records.length,
        successful,
        errors: failed,
        results
      };
    });
    if (ok) return result;
    if (this.config.verbose) {
      console.warn(`[WebhookReplicator] Batch replication failed for ${resource}: ${err.message}`);
    }
    this.emit("batch_replicator_error", {
      replicator: this.name,
      resource,
      error: err.message
    });
    return { success: false, error: err.message };
  }
  async testConnection() {
    const [ok, err] = await tryFn(async () => {
      const testPayload = {
        test: true,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        source: "s3db-webhook-replicator"
      };
      const response = await this._makeRequest(testPayload);
      if (!response.success) {
        throw new Error(response.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      return true;
    });
    if (ok) return true;
    if (this.config.verbose) {
      console.warn(`[WebhookReplicator] Connection test failed: ${err.message}`);
    }
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
      url: this.url,
      method: this.method,
      authType: this.auth?.type || "none",
      timeout: this.timeout,
      retries: this.retries,
      retryStrategy: this.retryStrategy,
      batchMode: this.batch,
      resources: Object.keys(this.resources || {}),
      stats: { ...this.stats }
    };
  }
  shouldReplicateResource(resource) {
    if (!this.resources || Object.keys(this.resources).length === 0) {
      return true;
    }
    return Object.keys(this.resources).includes(resource);
  }
}

const REPLICATOR_DRIVERS = {
  s3db: S3dbReplicator,
  sqs: SqsReplicator,
  bigquery: BigqueryReplicator,
  postgres: PostgresReplicator,
  webhook: WebhookReplicator
};
function createReplicator(driver, config = {}, resources = [], client = null) {
  const ReplicatorClass = REPLICATOR_DRIVERS[driver];
  if (!ReplicatorClass) {
    throw new ReplicationError(`Unknown replicator driver: ${driver}`, {
      operation: "createReplicator",
      driver,
      availableDrivers: Object.keys(REPLICATOR_DRIVERS),
      suggestion: `Use one of the available drivers: ${Object.keys(REPLICATOR_DRIVERS).join(", ")}`
    });
  }
  return new ReplicatorClass(config, resources, client);
}
function validateReplicatorConfig(driver, config, resources = [], client = null) {
  const replicator = createReplicator(driver, config, resources, client);
  return replicator.validateConfig();
}

function normalizeResourceName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : name;
}
class ReplicatorPlugin extends Plugin {
  constructor(options = {}) {
    super();
    if (!options.replicators || !Array.isArray(options.replicators)) {
      throw new ReplicationError("ReplicatorPlugin requires replicators array", {
        operation: "constructor",
        pluginName: "ReplicatorPlugin",
        providedOptions: Object.keys(options),
        suggestion: 'Provide replicators array: new ReplicatorPlugin({ replicators: [{ driver: "s3db", resources: [...] }] })'
      });
    }
    for (const rep of options.replicators) {
      if (!rep.driver) {
        throw new ReplicationError("Each replicator must have a driver", {
          operation: "constructor",
          pluginName: "ReplicatorPlugin",
          replicatorConfig: rep,
          suggestion: 'Each replicator entry must specify a driver: { driver: "s3db", resources: {...} }'
        });
      }
      if (!rep.resources || typeof rep.resources !== "object") {
        throw new ReplicationError("Each replicator must have resources config", {
          operation: "constructor",
          pluginName: "ReplicatorPlugin",
          driver: rep.driver,
          replicatorConfig: rep,
          suggestion: 'Provide resources as object or array: { driver: "s3db", resources: ["users"] } or { resources: { users: "people" } }'
        });
      }
      if (Object.keys(rep.resources).length === 0) {
        throw new ReplicationError("Each replicator must have at least one resource configured", {
          operation: "constructor",
          pluginName: "ReplicatorPlugin",
          driver: rep.driver,
          replicatorConfig: rep,
          suggestion: 'Add at least one resource to replicate: { driver: "s3db", resources: ["users"] }'
        });
      }
    }
    this.config = {
      replicators: options.replicators || [],
      logErrors: options.logErrors !== false,
      replicatorLogResource: options.replicatorLogResource || "replicator_log",
      persistReplicatorLog: options.persistReplicatorLog || false,
      enabled: options.enabled !== false,
      batchSize: options.batchSize || 100,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 3e4,
      verbose: options.verbose || false
    };
    this.replicators = [];
    this.database = null;
    this.eventListenersInstalled = /* @__PURE__ */ new Set();
    this.eventHandlers = /* @__PURE__ */ new Map();
    this.stats = {
      totalReplications: 0,
      totalErrors: 0,
      lastSync: null
    };
    this._afterCreateResourceHook = null;
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
  async getCompleteData(resource, data) {
    const [ok, err, completeRecord] = await tryFn(() => resource.get(data.id));
    return ok ? completeRecord : data;
  }
  installEventListeners(resource, database, plugin) {
    if (!resource || this.eventListenersInstalled.has(resource.name) || resource.name === this.config.replicatorLogResource) {
      return;
    }
    const insertHandler = async (data) => {
      const [ok, error] = await tryFn(async () => {
        const completeData = { ...data, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
        await plugin.processReplicatorEvent("insert", resource.name, completeData.id, completeData);
      });
      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Insert event failed for resource ${resource.name}: ${error.message}`);
        }
        this.emit("error", { operation: "insert", error: error.message, resource: resource.name });
      }
    };
    const updateHandler = async (data, beforeData) => {
      const [ok, error] = await tryFn(async () => {
        const completeData = await plugin.getCompleteData(resource, data);
        const dataWithTimestamp = { ...completeData, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        await plugin.processReplicatorEvent("update", resource.name, completeData.id, dataWithTimestamp, beforeData);
      });
      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Update event failed for resource ${resource.name}: ${error.message}`);
        }
        this.emit("error", { operation: "update", error: error.message, resource: resource.name });
      }
    };
    const deleteHandler = async (data) => {
      const [ok, error] = await tryFn(async () => {
        await plugin.processReplicatorEvent("delete", resource.name, data.id, data);
      });
      if (!ok) {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Delete event failed for resource ${resource.name}: ${error.message}`);
        }
        this.emit("error", { operation: "delete", error: error.message, resource: resource.name });
      }
    };
    this.eventHandlers.set(resource.name, {
      insert: insertHandler,
      update: updateHandler,
      delete: deleteHandler
    });
    resource.on("insert", insertHandler);
    resource.on("update", updateHandler);
    resource.on("delete", deleteHandler);
    this.eventListenersInstalled.add(resource.name);
  }
  async onInstall() {
    if (this.config.persistReplicatorLog) {
      const [ok, err, logResource] = await tryFn(() => this.database.createResource({
        name: this.config.replicatorLogResource || "plg_replicator_logs",
        attributes: {
          id: "string|required",
          resource: "string|required",
          action: "string|required",
          data: "json",
          timestamp: "number|required",
          createdAt: "string|required"
        },
        behavior: "truncate-data"
      }));
      if (ok) {
        this.replicatorLogResource = logResource;
      } else {
        this.replicatorLogResource = this.database.resources[this.config.replicatorLogResource || "plg_replicator_logs"];
      }
    }
    await this.initializeReplicators(this.database);
    this.installDatabaseHooks();
    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== (this.config.replicatorLogResource || "plg_replicator_logs")) {
        this.installEventListeners(resource, this.database, this);
      }
    }
  }
  async start() {
  }
  async stop() {
    for (const replicator of this.replicators || []) {
      if (replicator && typeof replicator.cleanup === "function") {
        await replicator.cleanup();
      }
    }
    this.removeDatabaseHooks();
  }
  installDatabaseHooks() {
    this._afterCreateResourceHook = (resource) => {
      if (resource.name !== (this.config.replicatorLogResource || "plg_replicator_logs")) {
        this.installEventListeners(resource, this.database, this);
      }
    };
    this.database.addHook("afterCreateResource", this._afterCreateResourceHook);
  }
  removeDatabaseHooks() {
    if (this._afterCreateResourceHook) {
      this.database.removeHook("afterCreateResource", this._afterCreateResourceHook);
      this._afterCreateResourceHook = null;
    }
  }
  createReplicator(driver, config, resources, client) {
    return createReplicator(driver, config, resources, client);
  }
  async initializeReplicators(database) {
    for (const replicatorConfig of this.config.replicators) {
      const { driver, config = {}, resources, client, ...otherConfig } = replicatorConfig;
      const replicatorResources = resources || config.resources || {};
      const mergedConfig = { ...config, ...otherConfig };
      const replicator = this.createReplicator(driver, mergedConfig, replicatorResources, client);
      if (replicator) {
        await replicator.initialize(database);
        this.replicators.push(replicator);
      }
    }
  }
  async uploadMetadataFile(database) {
    if (typeof this.database.uploadMetadataFile === "function") {
      await this.database.uploadMetadataFile();
    }
  }
  async retryWithBackoff(operation, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const [ok, error, result] = await tryFn(operation);
      if (ok) {
        return result;
      } else {
        lastError = error;
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Retry attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        }
        if (attempt === maxRetries) {
          throw error;
        }
        const delay = Math.pow(2, attempt - 1) * 1e3;
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Waiting ${delay}ms before retry...`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }
  async logError(replicator, resourceName, operation, recordId, data, error) {
    const [ok, logError] = await tryFn(async () => {
      const logResourceName = this.config.replicatorLogResource;
      if (this.database && this.database.resources && this.database.resources[logResourceName]) {
        const logResource = this.database.resources[logResourceName];
        await logResource.insert({
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          data: JSON.stringify(data),
          error: error.message,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          status: "error"
        });
      }
    });
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[ReplicatorPlugin] Failed to log error for ${resourceName}: ${logError.message}`);
      }
      this.emit("replicator_log_error", {
        replicator: replicator.name || replicator.id,
        resourceName,
        operation,
        recordId,
        originalError: error.message,
        logError: logError.message
      });
    }
  }
  async processReplicatorEvent(operation, resourceName, recordId, data, beforeData = null) {
    if (!this.config.enabled) return;
    const applicableReplicators = this.replicators.filter((replicator) => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(resourceName, operation);
      return should;
    });
    if (applicableReplicators.length === 0) {
      return;
    }
    const promises = applicableReplicators.map(async (replicator) => {
      const [ok, error, result] = await tryFn(async () => {
        const result2 = await this.retryWithBackoff(
          () => replicator.replicate(resourceName, operation, data, recordId, beforeData),
          this.config.maxRetries
        );
        this.emit("replicated", {
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          result: result2,
          success: true
        });
        return result2;
      });
      if (ok) {
        return result;
      } else {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Replication failed for ${replicator.name || replicator.id} on ${resourceName}: ${error.message}`);
        }
        this.emit("replicator_error", {
          replicator: replicator.name || replicator.id,
          resourceName,
          operation,
          recordId,
          error: error.message
        });
        if (this.config.logErrors && this.database) {
          await this.logError(replicator, resourceName, operation, recordId, data, error);
        }
        throw error;
      }
    });
    return Promise.allSettled(promises);
  }
  async processReplicatorItem(item) {
    const applicableReplicators = this.replicators.filter((replicator) => {
      const should = replicator.shouldReplicateResource && replicator.shouldReplicateResource(item.resourceName, item.operation);
      return should;
    });
    if (applicableReplicators.length === 0) {
      return;
    }
    const promises = applicableReplicators.map(async (replicator) => {
      const [wrapperOk, wrapperError] = await tryFn(async () => {
        const [ok, err, result] = await tryFn(
          () => replicator.replicate(item.resourceName, item.operation, item.data, item.recordId, item.beforeData)
        );
        if (!ok) {
          if (this.config.verbose) {
            console.warn(`[ReplicatorPlugin] Replicator item processing failed for ${replicator.name || replicator.id} on ${item.resourceName}: ${err.message}`);
          }
          this.emit("replicator_error", {
            replicator: replicator.name || replicator.id,
            resourceName: item.resourceName,
            operation: item.operation,
            recordId: item.recordId,
            error: err.message
          });
          if (this.config.logErrors && this.database) {
            await this.logError(replicator, item.resourceName, item.operation, item.recordId, item.data, err);
          }
          return { success: false, error: err.message };
        }
        this.emit("replicated", {
          replicator: replicator.name || replicator.id,
          resourceName: item.resourceName,
          operation: item.operation,
          recordId: item.recordId,
          result,
          success: true
        });
        return { success: true, result };
      });
      if (wrapperOk) {
        return wrapperOk;
      } else {
        if (this.config.verbose) {
          console.warn(`[ReplicatorPlugin] Wrapper processing failed for ${replicator.name || replicator.id} on ${item.resourceName}: ${wrapperError.message}`);
        }
        this.emit("replicator_error", {
          replicator: replicator.name || replicator.id,
          resourceName: item.resourceName,
          operation: item.operation,
          recordId: item.recordId,
          error: wrapperError.message
        });
        if (this.config.logErrors && this.database) {
          await this.logError(replicator, item.resourceName, item.operation, item.recordId, item.data, wrapperError);
        }
        return { success: false, error: wrapperError.message };
      }
    });
    return Promise.allSettled(promises);
  }
  async logReplicator(item) {
    const logRes = this.replicatorLog || this.database.resources[normalizeResourceName(this.config.replicatorLogResource)];
    if (!logRes) {
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
    const [ok, err] = await tryFn(async () => {
      await logRes.insert(logItem);
    });
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[ReplicatorPlugin] Failed to log replicator item: ${err.message}`);
      }
      this.emit("replicator.log.failed", { error: err, item });
    }
  }
  async updateReplicatorLog(logId, updates) {
    if (!this.replicatorLog) return;
    const [ok, err] = await tryFn(async () => {
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
  async getReplicatorStats() {
    const replicatorStats = await Promise.all(
      this.replicators.map(async (replicator) => {
        const status = await replicator.getStatus();
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
      stats: this.stats,
      lastSync: this.stats.lastSync
    };
  }
  async getReplicatorLogs(options = {}) {
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
    const filter = {};
    if (resourceName) {
      filter.resourceName = resourceName;
    }
    if (operation) {
      filter.operation = operation;
    }
    if (status) {
      filter.status = status;
    }
    const logs = await this.replicatorLog.query(filter, { limit, offset });
    return logs || [];
  }
  async retryFailedReplicators() {
    if (!this.replicatorLog) {
      return { retried: 0 };
    }
    const failedLogs = await this.replicatorLog.query({
      status: "failed"
    });
    let retried = 0;
    for (const log of failedLogs || []) {
      const [ok, err] = await tryFn(async () => {
        await this.processReplicatorEvent(
          log.operation,
          log.resourceName,
          log.recordId,
          log.data
        );
      });
      if (ok) {
        retried++;
      }
    }
    return { retried };
  }
  async syncAllData(replicatorId) {
    const replicator = this.replicators.find((r) => r.id === replicatorId);
    if (!replicator) {
      throw new ReplicationError("Replicator not found", {
        operation: "syncAllData",
        pluginName: "ReplicatorPlugin",
        replicatorId,
        availableReplicators: this.replicators.map((r) => r.id),
        suggestion: "Check replicator ID or use getReplicatorStats() to list available replicators"
      });
    }
    this.stats.lastSync = (/* @__PURE__ */ new Date()).toISOString();
    for (const resourceName in this.database.resources) {
      if (normalizeResourceName(resourceName) === normalizeResourceName("plg_replicator_logs")) continue;
      if (replicator.shouldReplicateResource(resourceName)) {
        this.emit("replicator.sync.resource", { resourceName, replicatorId });
        const resource = this.database.resources[resourceName];
        let offset = 0;
        const pageSize = this.config.batchSize || 100;
        while (true) {
          const [ok, err, page] = await tryFn(() => resource.page({ offset, size: pageSize }));
          if (!ok || !page) break;
          const records = Array.isArray(page) ? page : page.items || [];
          if (records.length === 0) break;
          for (const record of records) {
            await replicator.replicate(resourceName, "insert", record, record.id);
          }
          offset += pageSize;
        }
      }
    }
    this.emit("replicator.sync.completed", { replicatorId, stats: this.stats });
  }
  async cleanup() {
    const [ok, error] = await tryFn(async () => {
      if (this.replicators && this.replicators.length > 0) {
        const cleanupPromises = this.replicators.map(async (replicator) => {
          const [replicatorOk, replicatorError] = await tryFn(async () => {
            if (replicator && typeof replicator.cleanup === "function") {
              await replicator.cleanup();
            }
          });
          if (!replicatorOk) {
            if (this.config.verbose) {
              console.warn(`[ReplicatorPlugin] Failed to cleanup replicator ${replicator.name || replicator.id}: ${replicatorError.message}`);
            }
            this.emit("replicator_cleanup_error", {
              replicator: replicator.name || replicator.id || "unknown",
              driver: replicator.driver || "unknown",
              error: replicatorError.message
            });
          }
        });
        await Promise.allSettled(cleanupPromises);
      }
      if (this.database && this.database.resources) {
        for (const resourceName of this.eventListenersInstalled) {
          const resource = this.database.resources[resourceName];
          const handlers = this.eventHandlers.get(resourceName);
          if (resource && handlers) {
            resource.off("insert", handlers.insert);
            resource.off("update", handlers.update);
            resource.off("delete", handlers.delete);
          }
        }
      }
      this.replicators = [];
      this.database = null;
      this.eventListenersInstalled.clear();
      this.eventHandlers.clear();
      this.removeAllListeners();
    });
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[ReplicatorPlugin] Failed to cleanup plugin: ${error.message}`);
      }
      this.emit("replicator_plugin_cleanup_error", {
        error: error.message
      });
    }
  }
}

class S3QueuePlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    if (!options.resource) {
      throw new Error('S3QueuePlugin requires "resource" option');
    }
    this.config = {
      resource: options.resource,
      visibilityTimeout: options.visibilityTimeout || 3e4,
      // 30 seconds
      pollInterval: options.pollInterval || 1e3,
      // 1 second
      maxAttempts: options.maxAttempts || 3,
      concurrency: options.concurrency || 1,
      deadLetterResource: options.deadLetterResource || null,
      autoStart: options.autoStart !== false,
      onMessage: options.onMessage,
      onError: options.onError,
      onComplete: options.onComplete,
      verbose: options.verbose || false,
      ...options
    };
    this.queueResource = null;
    this.targetResource = null;
    this.deadLetterResourceObj = null;
    this.workers = [];
    this.isRunning = false;
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.processedCache = /* @__PURE__ */ new Map();
    this.cacheCleanupInterval = null;
    this.lockCleanupInterval = null;
  }
  async onInstall() {
    this.targetResource = this.database.resources[this.config.resource];
    if (!this.targetResource) {
      throw new Error(`S3QueuePlugin: resource '${this.config.resource}' not found`);
    }
    const queueName = `${this.config.resource}_queue`;
    const [ok, err] = await tryFn(
      () => this.database.createResource({
        name: queueName,
        attributes: {
          id: "string|required",
          originalId: "string|required",
          // ID do registro original
          status: "string|required",
          // pending/processing/completed/failed/dead
          visibleAt: "number|required",
          // Timestamp de visibilidade
          claimedBy: "string|optional",
          // Worker que claimed
          claimedAt: "number|optional",
          // Timestamp do claim
          attempts: "number|default:0",
          maxAttempts: "number|default:3",
          error: "string|optional",
          result: "json|optional",
          createdAt: "string|required",
          completedAt: "number|optional"
        },
        behavior: "body-overflow",
        timestamps: true,
        asyncPartitions: true,
        partitions: {
          byStatus: { fields: { status: "string" } },
          byDate: { fields: { createdAt: "string|maxlength:10" } }
        }
      })
    );
    if (!ok && !this.database.resources[queueName]) {
      throw new Error(`Failed to create queue resource: ${err?.message}`);
    }
    this.queueResource = this.database.resources[queueName];
    this.addHelperMethods();
    if (this.config.deadLetterResource) {
      await this.createDeadLetterResource();
    }
    if (this.config.verbose) {
      console.log(`[S3QueuePlugin] Setup completed for resource '${this.config.resource}'`);
    }
  }
  async onStart() {
    if (this.config.autoStart && this.config.onMessage) {
      await this.startProcessing();
    }
  }
  async onStop() {
    await this.stopProcessing();
  }
  addHelperMethods() {
    const plugin = this;
    const resource = this.targetResource;
    resource.enqueue = async function(data, options = {}) {
      const recordData = {
        id: data.id || idGenerator(),
        ...data
      };
      const record = await resource.insert(recordData);
      const queueEntry = {
        id: idGenerator(),
        originalId: record.id,
        status: "pending",
        visibleAt: Date.now(),
        attempts: 0,
        maxAttempts: options.maxAttempts || plugin.config.maxAttempts,
        createdAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
      };
      await plugin.queueResource.insert(queueEntry);
      plugin.emit("message.enqueued", { id: record.id, queueId: queueEntry.id });
      return record;
    };
    resource.queueStats = async function() {
      return await plugin.getStats();
    };
    resource.startProcessing = async function(handler, options = {}) {
      return await plugin.startProcessing(handler, options);
    };
    resource.stopProcessing = async function() {
      return await plugin.stopProcessing();
    };
  }
  async startProcessing(handler = null, options = {}) {
    if (this.isRunning) {
      if (this.config.verbose) {
        console.log("[S3QueuePlugin] Already running");
      }
      return;
    }
    const messageHandler = handler || this.config.onMessage;
    if (!messageHandler) {
      throw new Error("S3QueuePlugin: onMessage handler required");
    }
    this.isRunning = true;
    const concurrency = options.concurrency || this.config.concurrency;
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 3e4;
      for (const [queueId, timestamp] of this.processedCache.entries()) {
        if (now - timestamp > maxAge) {
          this.processedCache.delete(queueId);
        }
      }
    }, 5e3);
    for (let i = 0; i < concurrency; i++) {
      const worker = this.createWorker(messageHandler, i);
      this.workers.push(worker);
    }
    if (this.config.verbose) {
      console.log(`[S3QueuePlugin] Started ${concurrency} workers`);
    }
    this.emit("workers.started", { concurrency, workerId: this.workerId });
  }
  async stopProcessing() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    await Promise.all(this.workers);
    this.workers = [];
    this.processedCache.clear();
    if (this.config.verbose) {
      console.log("[S3QueuePlugin] Stopped all workers");
    }
    this.emit("workers.stopped", { workerId: this.workerId });
  }
  createWorker(handler, workerIndex) {
    return (async () => {
      while (this.isRunning) {
        try {
          const message = await this.claimMessage();
          if (message) {
            await this.processMessage(message, handler);
          } else {
            await new Promise((resolve) => setTimeout(resolve, this.config.pollInterval));
          }
        } catch (error) {
          if (this.config.verbose) {
            console.error(`[Worker ${workerIndex}] Error:`, error.message);
          }
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      }
    })();
  }
  async claimMessage() {
    const now = Date.now();
    const [ok, err, messages] = await tryFn(
      () => this.queueResource.query({
        status: "pending"
      })
    );
    if (!ok || !messages || messages.length === 0) {
      return null;
    }
    const available = messages.filter((m) => m.visibleAt <= now);
    if (available.length === 0) {
      return null;
    }
    for (const msg of available) {
      const claimed = await this.attemptClaim(msg);
      if (claimed) {
        return claimed;
      }
    }
    return null;
  }
  /**
   * Acquire a distributed lock using PluginStorage TTL
   * This ensures only one worker can claim a message at a time
   */
  async acquireLock(messageId) {
    const storage = this.getStorage();
    const lockKey = `msg-${messageId}`;
    try {
      const lock = await storage.acquireLock(lockKey, {
        ttl: 5,
        // 5 seconds
        timeout: 0,
        // Don't wait if locked
        workerId: this.workerId
      });
      return lock !== null;
    } catch (error) {
      if (this.config.verbose) {
        console.log(`[acquireLock] Error: ${error.message}`);
      }
      return false;
    }
  }
  /**
   * Release a distributed lock via PluginStorage
   */
  async releaseLock(messageId) {
    const storage = this.getStorage();
    const lockKey = `msg-${messageId}`;
    try {
      await storage.releaseLock(lockKey);
    } catch (error) {
      if (this.config.verbose) {
        console.log(`[releaseLock] Failed to release lock for ${messageId}: ${error.message}`);
      }
    }
  }
  /**
   * Clean up stale locks - NO LONGER NEEDED
   * TTL handles automatic expiration, no manual cleanup required
   */
  async cleanupStaleLocks() {
    return;
  }
  async attemptClaim(msg) {
    const now = Date.now();
    const lockAcquired = await this.acquireLock(msg.id);
    if (!lockAcquired) {
      return null;
    }
    if (this.processedCache.has(msg.id)) {
      await this.releaseLock(msg.id);
      if (this.config.verbose) {
        console.log(`[attemptClaim] Message ${msg.id} already processed (in cache)`);
      }
      return null;
    }
    this.processedCache.set(msg.id, Date.now());
    await this.releaseLock(msg.id);
    const [okGet, errGet, msgWithETag] = await tryFn(
      () => this.queueResource.get(msg.id)
    );
    if (!okGet || !msgWithETag) {
      this.processedCache.delete(msg.id);
      if (this.config.verbose) {
        console.log(`[attemptClaim] Message ${msg.id} not found or error: ${errGet?.message}`);
      }
      return null;
    }
    if (msgWithETag.status !== "pending" || msgWithETag.visibleAt > now) {
      this.processedCache.delete(msg.id);
      if (this.config.verbose) {
        console.log(`[attemptClaim] Message ${msg.id} not claimable: status=${msgWithETag.status}, visibleAt=${msgWithETag.visibleAt}, now=${now}`);
      }
      return null;
    }
    if (this.config.verbose) {
      console.log(`[attemptClaim] Attempting to claim ${msg.id} with ETag: ${msgWithETag._etag}`);
    }
    const [ok, err, result] = await tryFn(
      () => this.queueResource.updateConditional(msgWithETag.id, {
        status: "processing",
        claimedBy: this.workerId,
        claimedAt: now,
        visibleAt: now + this.config.visibilityTimeout,
        attempts: msgWithETag.attempts + 1
      }, {
        ifMatch: msgWithETag._etag
        // ← ATOMIC CLAIM using ETag!
      })
    );
    if (!ok || !result.success) {
      this.processedCache.delete(msg.id);
      if (this.config.verbose) {
        console.log(`[attemptClaim] Failed to claim ${msg.id}: ${err?.message || result.error}`);
      }
      return null;
    }
    if (this.config.verbose) {
      console.log(`[attemptClaim] Successfully claimed ${msg.id}`);
    }
    const [okRecord, errRecord, record] = await tryFn(
      () => this.targetResource.get(msgWithETag.originalId)
    );
    if (!okRecord) {
      await this.failMessage(msgWithETag.id, "Original record not found");
      return null;
    }
    return {
      queueId: msgWithETag.id,
      record,
      attempts: msgWithETag.attempts + 1,
      maxAttempts: msgWithETag.maxAttempts
    };
  }
  async processMessage(message, handler) {
    const startTime = Date.now();
    try {
      const result = await handler(message.record, {
        queueId: message.queueId,
        attempts: message.attempts,
        workerId: this.workerId
      });
      await this.completeMessage(message.queueId, result);
      const duration = Date.now() - startTime;
      this.emit("message.completed", {
        queueId: message.queueId,
        originalId: message.record.id,
        duration,
        attempts: message.attempts
      });
      if (this.config.onComplete) {
        await this.config.onComplete(message.record, result);
      }
    } catch (error) {
      const shouldRetry = message.attempts < message.maxAttempts;
      if (shouldRetry) {
        await this.retryMessage(message.queueId, message.attempts, error.message);
        this.emit("message.retry", {
          queueId: message.queueId,
          originalId: message.record.id,
          attempts: message.attempts,
          error: error.message
        });
      } else {
        await this.moveToDeadLetter(message.queueId, message.record, error.message);
        this.emit("message.dead", {
          queueId: message.queueId,
          originalId: message.record.id,
          error: error.message
        });
      }
      if (this.config.onError) {
        await this.config.onError(error, message.record);
      }
    }
  }
  async completeMessage(queueId, result) {
    await this.queueResource.update(queueId, {
      status: "completed",
      completedAt: Date.now(),
      result
    });
  }
  async failMessage(queueId, error) {
    await this.queueResource.update(queueId, {
      status: "failed",
      error
    });
  }
  async retryMessage(queueId, attempts, error) {
    const backoff = Math.min(Math.pow(2, attempts) * 1e3, 3e4);
    await this.queueResource.update(queueId, {
      status: "pending",
      visibleAt: Date.now() + backoff,
      error
    });
    this.processedCache.delete(queueId);
  }
  async moveToDeadLetter(queueId, record, error) {
    if (this.config.deadLetterResource && this.deadLetterResourceObj) {
      const msg = await this.queueResource.get(queueId);
      await this.deadLetterResourceObj.insert({
        id: idGenerator(),
        originalId: record.id,
        queueId,
        data: record,
        error,
        attempts: msg.attempts,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    await this.queueResource.update(queueId, {
      status: "dead",
      error
    });
  }
  async getStats() {
    const [ok, err, allMessages] = await tryFn(
      () => this.queueResource.list()
    );
    if (!ok) {
      if (this.config.verbose) {
        console.warn("[S3QueuePlugin] Failed to get stats:", err.message);
      }
      return null;
    }
    const stats = {
      total: allMessages.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0
    };
    for (const msg of allMessages) {
      if (stats[msg.status] !== void 0) {
        stats[msg.status]++;
      }
    }
    return stats;
  }
  async createDeadLetterResource() {
    const [ok, err] = await tryFn(
      () => this.database.createResource({
        name: this.config.deadLetterResource,
        attributes: {
          id: "string|required",
          originalId: "string|required",
          queueId: "string|required",
          data: "json|required",
          error: "string|required",
          attempts: "number|required",
          createdAt: "string|required"
        },
        behavior: "body-overflow",
        timestamps: true
      })
    );
    if (ok || this.database.resources[this.config.deadLetterResource]) {
      this.deadLetterResourceObj = this.database.resources[this.config.deadLetterResource];
      if (this.config.verbose) {
        console.log(`[S3QueuePlugin] Dead letter queue created: ${this.config.deadLetterResource}`);
      }
    }
  }
}

class SchedulerError extends S3dbError {
  constructor(message, details = {}) {
    const { taskId, operation = "unknown", cronExpression, ...rest } = details;
    let description = details.description;
    if (!description) {
      description = `
Scheduler Operation Error

Operation: ${operation}
${taskId ? `Task ID: ${taskId}` : ""}
${cronExpression ? `Cron: ${cronExpression}` : ""}

Common causes:
1. Invalid cron expression format
2. Task not found or already exists
3. Scheduler not properly initialized
4. Job execution failure
5. Resource conflicts

Solution:
Check task configuration and ensure scheduler is properly initialized.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/scheduler.md
`.trim();
    }
    super(message, { ...rest, taskId, operation, cronExpression, description });
  }
}

class SchedulerPlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.config = {
      timezone: options.timezone || "UTC",
      jobs: options.jobs || {},
      defaultTimeout: options.defaultTimeout || 3e5,
      // 5 minutes
      defaultRetries: options.defaultRetries || 1,
      jobHistoryResource: options.jobHistoryResource || "plg_job_executions",
      persistJobs: options.persistJobs !== false,
      verbose: options.verbose || false,
      onJobStart: options.onJobStart || null,
      onJobComplete: options.onJobComplete || null,
      onJobError: options.onJobError || null,
      ...options
    };
    this.database = null;
    this.jobs = /* @__PURE__ */ new Map();
    this.activeJobs = /* @__PURE__ */ new Map();
    this.timers = /* @__PURE__ */ new Map();
    this.statistics = /* @__PURE__ */ new Map();
    this._validateConfiguration();
  }
  /**
   * Helper to detect test environment
   * @private
   */
  _isTestEnvironment() {
    return process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== void 0 || global.expect !== void 0;
  }
  _validateConfiguration() {
    if (Object.keys(this.config.jobs).length === 0) {
      throw new SchedulerError("At least one job must be defined", {
        operation: "validateConfiguration",
        jobCount: 0,
        suggestion: 'Provide at least one job in the jobs configuration: { jobs: { myJob: { schedule: "* * * * *", action: async () => {...} } } }'
      });
    }
    for (const [jobName, job] of Object.entries(this.config.jobs)) {
      if (!job.schedule) {
        throw new SchedulerError(`Job '${jobName}' must have a schedule`, {
          operation: "validateConfiguration",
          taskId: jobName,
          providedConfig: Object.keys(job),
          suggestion: 'Add a schedule property with a valid cron expression: { schedule: "0 * * * *", action: async () => {...} }'
        });
      }
      if (!job.action || typeof job.action !== "function") {
        throw new SchedulerError(`Job '${jobName}' must have an action function`, {
          operation: "validateConfiguration",
          taskId: jobName,
          actionType: typeof job.action,
          suggestion: 'Provide an action function: { schedule: "...", action: async (db, ctx) => {...} }'
        });
      }
      if (!this._isValidCronExpression(job.schedule)) {
        throw new SchedulerError(`Job '${jobName}' has invalid cron expression`, {
          operation: "validateConfiguration",
          taskId: jobName,
          cronExpression: job.schedule,
          suggestion: "Use valid cron format (5 fields: minute hour day month weekday) or shortcuts (@hourly, @daily, @weekly, @monthly, @yearly)"
        });
      }
    }
  }
  _isValidCronExpression(expr) {
    if (typeof expr !== "string") return false;
    const shortcuts = ["@yearly", "@annually", "@monthly", "@weekly", "@daily", "@hourly"];
    if (shortcuts.includes(expr)) return true;
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    return true;
  }
  async onInstall() {
    if (this.config.persistJobs) {
      await this._createJobHistoryResource();
    }
    for (const [jobName, jobConfig] of Object.entries(this.config.jobs)) {
      this.jobs.set(jobName, {
        ...jobConfig,
        enabled: jobConfig.enabled !== false,
        retries: jobConfig.retries || this.config.defaultRetries,
        timeout: jobConfig.timeout || this.config.defaultTimeout,
        lastRun: null,
        nextRun: null,
        runCount: 0,
        successCount: 0,
        errorCount: 0
      });
      this.statistics.set(jobName, {
        totalRuns: 0,
        totalSuccesses: 0,
        totalErrors: 0,
        avgDuration: 0,
        lastRun: null,
        lastSuccess: null,
        lastError: null
      });
    }
    await this._startScheduling();
    this.emit("initialized", { jobs: this.jobs.size });
  }
  async _createJobHistoryResource() {
    const [ok] = await tryFn(() => this.database.createResource({
      name: this.config.jobHistoryResource,
      attributes: {
        id: "string|required",
        jobName: "string|required",
        status: "string|required",
        // success, error, timeout
        startTime: "number|required",
        endTime: "number",
        duration: "number",
        result: "json|default:null",
        error: "string|default:null",
        retryCount: "number|default:0",
        createdAt: "string|required"
      },
      behavior: "body-overflow",
      partitions: {
        byJob: { fields: { jobName: "string" } },
        byDate: { fields: { createdAt: "string|maxlength:10" } }
      }
    }));
  }
  async _startScheduling() {
    for (const [jobName, job] of this.jobs) {
      if (job.enabled) {
        this._scheduleNextExecution(jobName);
      }
    }
  }
  _scheduleNextExecution(jobName) {
    const job = this.jobs.get(jobName);
    if (!job || !job.enabled) return;
    const nextRun = this._calculateNextRun(job.schedule);
    job.nextRun = nextRun;
    const delay = nextRun.getTime() - Date.now();
    if (delay > 0) {
      const timer = setTimeout(() => {
        this._executeJob(jobName);
      }, delay);
      this.timers.set(jobName, timer);
      if (this.config.verbose) {
        console.log(`[SchedulerPlugin] Scheduled job '${jobName}' for ${nextRun.toISOString()}`);
      }
    }
  }
  _calculateNextRun(schedule) {
    const now = /* @__PURE__ */ new Date();
    if (schedule === "@yearly" || schedule === "@annually") {
      const next2 = new Date(now);
      next2.setFullYear(next2.getFullYear() + 1);
      next2.setMonth(0, 1);
      next2.setHours(0, 0, 0, 0);
      return next2;
    }
    if (schedule === "@monthly") {
      const next2 = new Date(now);
      next2.setMonth(next2.getMonth() + 1, 1);
      next2.setHours(0, 0, 0, 0);
      return next2;
    }
    if (schedule === "@weekly") {
      const next2 = new Date(now);
      next2.setDate(next2.getDate() + (7 - next2.getDay()));
      next2.setHours(0, 0, 0, 0);
      return next2;
    }
    if (schedule === "@daily") {
      const next2 = new Date(now);
      next2.setDate(next2.getDate() + 1);
      next2.setHours(0, 0, 0, 0);
      return next2;
    }
    if (schedule === "@hourly") {
      const next2 = new Date(now);
      next2.setHours(next2.getHours() + 1, 0, 0, 0);
      return next2;
    }
    const [minute, hour, day, month, weekday] = schedule.split(/\s+/);
    const next = new Date(now);
    next.setMinutes(parseInt(minute) || 0);
    next.setSeconds(0);
    next.setMilliseconds(0);
    if (hour !== "*") {
      next.setHours(parseInt(hour));
    }
    if (next <= now) {
      if (hour !== "*") {
        next.setDate(next.getDate() + 1);
      } else {
        next.setHours(next.getHours() + 1);
      }
    }
    if (this._isTestEnvironment()) {
      next.setTime(next.getTime() + 1e3);
    }
    return next;
  }
  async _executeJob(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      return;
    }
    if (this.activeJobs.has(jobName)) {
      return;
    }
    this.activeJobs.set(jobName, "acquiring-lock");
    const storage = this.getStorage();
    const lockKey = `job-${jobName}`;
    const lock = await storage.acquireLock(lockKey, {
      ttl: Math.ceil(job.timeout / 1e3) + 60,
      // Job timeout + 60 seconds buffer
      timeout: 0,
      // Don't wait if locked
      workerId: process.pid ? String(process.pid) : "unknown"
    });
    if (!lock) {
      if (this.config.verbose) {
        console.log(`[SchedulerPlugin] Job '${jobName}' already running on another instance`);
      }
      this.activeJobs.delete(jobName);
      return;
    }
    const executionId = `${jobName}_${idGenerator()}`;
    const startTime = Date.now();
    const context = {
      jobName,
      executionId,
      scheduledTime: new Date(startTime),
      database: this.database
    };
    this.activeJobs.set(jobName, executionId);
    try {
      if (this.config.onJobStart) {
        await this._executeHook(this.config.onJobStart, jobName, context);
      }
      this.emit("job_start", { jobName, executionId, startTime });
      let attempt = 0;
      let lastError = null;
      let result = null;
      let status = "success";
      const isTestEnvironment = this._isTestEnvironment();
      while (attempt <= job.retries) {
        try {
          const actualTimeout = isTestEnvironment ? Math.min(job.timeout, 1e3) : job.timeout;
          let timeoutId;
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("Job execution timeout")), actualTimeout);
          });
          const jobPromise = job.action(this.database, context, this);
          try {
            result = await Promise.race([jobPromise, timeoutPromise]);
            clearTimeout(timeoutId);
          } catch (raceError) {
            clearTimeout(timeoutId);
            throw raceError;
          }
          status = "success";
          break;
        } catch (error) {
          lastError = error;
          attempt++;
          if (attempt <= job.retries) {
            if (this.config.verbose) {
              console.warn(`[SchedulerPlugin] Job '${jobName}' failed (attempt ${attempt + 1}):`, error.message);
            }
            const baseDelay = Math.min(Math.pow(2, attempt) * 1e3, 5e3);
            const delay = isTestEnvironment ? 1 : baseDelay;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      const endTime = Date.now();
      const duration = Math.max(1, endTime - startTime);
      if (lastError && attempt > job.retries) {
        status = lastError.message.includes("timeout") ? "timeout" : "error";
      }
      job.lastRun = new Date(endTime);
      job.runCount++;
      if (status === "success") {
        job.successCount++;
      } else {
        job.errorCount++;
      }
      const stats = this.statistics.get(jobName);
      stats.totalRuns++;
      stats.lastRun = new Date(endTime);
      if (status === "success") {
        stats.totalSuccesses++;
        stats.lastSuccess = new Date(endTime);
      } else {
        stats.totalErrors++;
        stats.lastError = { time: new Date(endTime), message: lastError?.message };
      }
      stats.avgDuration = (stats.avgDuration * (stats.totalRuns - 1) + duration) / stats.totalRuns;
      if (this.config.persistJobs) {
        await this._persistJobExecution(jobName, executionId, startTime, endTime, duration, status, result, lastError, attempt);
      }
      if (status === "success" && this.config.onJobComplete) {
        await this._executeHook(this.config.onJobComplete, jobName, result, duration);
      } else if (status !== "success" && this.config.onJobError) {
        await this._executeHook(this.config.onJobError, jobName, lastError, attempt);
      }
      this.emit("job_complete", {
        jobName,
        executionId,
        status,
        duration,
        result,
        error: lastError?.message,
        retryCount: attempt
      });
      this.activeJobs.delete(jobName);
      if (job.enabled) {
        this._scheduleNextExecution(jobName);
      }
      if (lastError && status !== "success") {
        throw lastError;
      }
    } finally {
      await tryFn(() => storage.releaseLock(lockKey));
    }
  }
  async _persistJobExecution(jobName, executionId, startTime, endTime, duration, status, result, error, retryCount) {
    const [ok, err] = await tryFn(
      () => this.database.resource(this.config.jobHistoryResource).insert({
        id: executionId,
        jobName,
        status,
        startTime,
        endTime,
        duration,
        result: result ? JSON.stringify(result) : null,
        error: error?.message || null,
        retryCount,
        createdAt: new Date(startTime).toISOString().slice(0, 10)
      })
    );
    if (!ok && this.config.verbose) {
      console.warn("[SchedulerPlugin] Failed to persist job execution:", err.message);
    }
  }
  async _executeHook(hook, ...args) {
    if (typeof hook === "function") {
      const [ok, err] = await tryFn(() => hook(...args));
      if (!ok && this.config.verbose) {
        console.warn("[SchedulerPlugin] Hook execution failed:", err.message);
      }
    }
  }
  /**
   * Manually trigger a job execution
   * Note: Race conditions are prevented by distributed locking in _executeJob()
   */
  async runJob(jobName, context = {}) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: "runJob",
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: "Check job name or use getAllJobsStatus() to list available jobs"
      });
    }
    if (this.activeJobs.has(jobName)) {
      throw new SchedulerError(`Job '${jobName}' is already running`, {
        operation: "runJob",
        taskId: jobName,
        executionId: this.activeJobs.get(jobName),
        suggestion: "Wait for current execution to complete or check job status with getJobStatus()"
      });
    }
    await this._executeJob(jobName);
  }
  /**
   * Enable a job
   */
  enableJob(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: "enableJob",
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: "Check job name or use getAllJobsStatus() to list available jobs"
      });
    }
    job.enabled = true;
    this._scheduleNextExecution(jobName);
    this.emit("job_enabled", { jobName });
  }
  /**
   * Disable a job
   */
  disableJob(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: "disableJob",
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: "Check job name or use getAllJobsStatus() to list available jobs"
      });
    }
    job.enabled = false;
    const timer = this.timers.get(jobName);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobName);
    }
    this.emit("job_disabled", { jobName });
  }
  /**
   * Get job status and statistics
   */
  getJobStatus(jobName) {
    const job = this.jobs.get(jobName);
    const stats = this.statistics.get(jobName);
    if (!job || !stats) {
      return null;
    }
    return {
      name: jobName,
      enabled: job.enabled,
      schedule: job.schedule,
      description: job.description,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      isRunning: this.activeJobs.has(jobName),
      statistics: {
        totalRuns: stats.totalRuns,
        totalSuccesses: stats.totalSuccesses,
        totalErrors: stats.totalErrors,
        successRate: stats.totalRuns > 0 ? stats.totalSuccesses / stats.totalRuns * 100 : 0,
        avgDuration: Math.round(stats.avgDuration),
        lastSuccess: stats.lastSuccess,
        lastError: stats.lastError
      }
    };
  }
  /**
   * Get all jobs status
   */
  getAllJobsStatus() {
    const jobs = [];
    for (const jobName of this.jobs.keys()) {
      jobs.push(this.getJobStatus(jobName));
    }
    return jobs;
  }
  /**
   * Get job execution history
   */
  async getJobHistory(jobName, options = {}) {
    if (!this.config.persistJobs) {
      return [];
    }
    const { limit = 50, status = null } = options;
    const queryParams = {
      jobName
      // Uses byJob partition for efficient lookup
    };
    if (status) {
      queryParams.status = status;
    }
    const [ok, err, history] = await tryFn(
      () => this.database.resource(this.config.jobHistoryResource).query(queryParams)
    );
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[SchedulerPlugin] Failed to get job history:`, err.message);
      }
      return [];
    }
    let filtered = history.sort((a, b) => b.startTime - a.startTime).slice(0, limit);
    return filtered.map((h) => {
      let result = null;
      if (h.result) {
        try {
          result = JSON.parse(h.result);
        } catch (e) {
          result = h.result;
        }
      }
      return {
        id: h.id,
        status: h.status,
        startTime: new Date(h.startTime),
        endTime: h.endTime ? new Date(h.endTime) : null,
        duration: h.duration,
        result,
        error: h.error,
        retryCount: h.retryCount
      };
    });
  }
  /**
   * Add a new job at runtime
   */
  addJob(jobName, jobConfig) {
    if (this.jobs.has(jobName)) {
      throw new SchedulerError(`Job '${jobName}' already exists`, {
        operation: "addJob",
        taskId: jobName,
        existingJobs: Array.from(this.jobs.keys()),
        suggestion: "Use a different job name or remove the existing job first with removeJob()"
      });
    }
    if (!jobConfig.schedule || !jobConfig.action) {
      throw new SchedulerError("Job must have schedule and action", {
        operation: "addJob",
        taskId: jobName,
        providedConfig: Object.keys(jobConfig),
        suggestion: 'Provide both schedule and action: { schedule: "0 * * * *", action: async (db, ctx) => {...} }'
      });
    }
    if (!this._isValidCronExpression(jobConfig.schedule)) {
      throw new SchedulerError("Invalid cron expression", {
        operation: "addJob",
        taskId: jobName,
        cronExpression: jobConfig.schedule,
        suggestion: "Use valid cron format (5 fields) or shortcuts (@hourly, @daily, @weekly, @monthly, @yearly)"
      });
    }
    const job = {
      ...jobConfig,
      enabled: jobConfig.enabled !== false,
      retries: jobConfig.retries || this.config.defaultRetries,
      timeout: jobConfig.timeout || this.config.defaultTimeout,
      lastRun: null,
      nextRun: null,
      runCount: 0,
      successCount: 0,
      errorCount: 0
    };
    this.jobs.set(jobName, job);
    this.statistics.set(jobName, {
      totalRuns: 0,
      totalSuccesses: 0,
      totalErrors: 0,
      avgDuration: 0,
      lastRun: null,
      lastSuccess: null,
      lastError: null
    });
    if (job.enabled) {
      this._scheduleNextExecution(jobName);
    }
    this.emit("job_added", { jobName });
  }
  /**
   * Remove a job
   */
  removeJob(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new SchedulerError(`Job '${jobName}' not found`, {
        operation: "removeJob",
        taskId: jobName,
        availableJobs: Array.from(this.jobs.keys()),
        suggestion: "Check job name or use getAllJobsStatus() to list available jobs"
      });
    }
    const timer = this.timers.get(jobName);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobName);
    }
    this.jobs.delete(jobName);
    this.statistics.delete(jobName);
    this.activeJobs.delete(jobName);
    this.emit("job_removed", { jobName });
  }
  /**
   * Get plugin instance by name (for job actions that need other plugins)
   */
  getPlugin(pluginName) {
    return null;
  }
  async start() {
    if (this.config.verbose) {
      console.log(`[SchedulerPlugin] Started with ${this.jobs.size} jobs`);
    }
  }
  async stop() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    if (!this._isTestEnvironment() && this.activeJobs.size > 0) {
      if (this.config.verbose) {
        console.log(`[SchedulerPlugin] Waiting for ${this.activeJobs.size} active jobs to complete...`);
      }
      const timeout = 5e3;
      const start = Date.now();
      while (this.activeJobs.size > 0 && Date.now() - start < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.activeJobs.size > 0) {
        console.warn(`[SchedulerPlugin] ${this.activeJobs.size} jobs still running after timeout`);
      }
    }
    if (this._isTestEnvironment()) {
      this.activeJobs.clear();
    }
  }
  async cleanup() {
    await this.stop();
    this.jobs.clear();
    this.statistics.clear();
    this.activeJobs.clear();
    this.removeAllListeners();
  }
}

class StateMachineError extends S3dbError {
  constructor(message, details = {}) {
    const { currentState, targetState, resourceName, operation = "unknown", ...rest } = details;
    let description = details.description;
    if (!description) {
      description = `
State Machine Operation Error

Operation: ${operation}
${currentState ? `Current State: ${currentState}` : ""}
${targetState ? `Target State: ${targetState}` : ""}
${resourceName ? `Resource: ${resourceName}` : ""}

Common causes:
1. Invalid state transition
2. State machine not configured
3. Transition conditions not met
4. State not defined in configuration
5. Missing transition handler

Solution:
Check state machine configuration and valid transitions.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/state-machine.md
`.trim();
    }
    super(message, { ...rest, currentState, targetState, resourceName, operation, description });
  }
}

class StateMachinePlugin extends Plugin {
  constructor(options = {}) {
    super();
    this.config = {
      stateMachines: options.stateMachines || {},
      actions: options.actions || {},
      guards: options.guards || {},
      persistTransitions: options.persistTransitions !== false,
      transitionLogResource: options.transitionLogResource || "plg_state_transitions",
      stateResource: options.stateResource || "plg_entity_states",
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 100,
      verbose: options.verbose || false
    };
    this.database = null;
    this.machines = /* @__PURE__ */ new Map();
    this._validateConfiguration();
  }
  _validateConfiguration() {
    if (!this.config.stateMachines || Object.keys(this.config.stateMachines).length === 0) {
      throw new StateMachineError("At least one state machine must be defined", {
        operation: "validateConfiguration",
        machineCount: 0,
        suggestion: "Provide at least one state machine in the stateMachines configuration"
      });
    }
    for (const [machineName, machine] of Object.entries(this.config.stateMachines)) {
      if (!machine.states || Object.keys(machine.states).length === 0) {
        throw new StateMachineError(`Machine '${machineName}' must have states defined`, {
          operation: "validateConfiguration",
          machineId: machineName,
          suggestion: "Define at least one state in the states configuration"
        });
      }
      if (!machine.initialState) {
        throw new StateMachineError(`Machine '${machineName}' must have an initialState`, {
          operation: "validateConfiguration",
          machineId: machineName,
          availableStates: Object.keys(machine.states),
          suggestion: "Specify an initialState property matching one of the defined states"
        });
      }
      if (!machine.states[machine.initialState]) {
        throw new StateMachineError(`Initial state '${machine.initialState}' not found in machine '${machineName}'`, {
          operation: "validateConfiguration",
          machineId: machineName,
          initialState: machine.initialState,
          availableStates: Object.keys(machine.states),
          suggestion: "Set initialState to one of the defined states"
        });
      }
    }
  }
  async onInstall() {
    if (this.config.persistTransitions) {
      await this._createStateResources();
    }
    for (const [machineName, machineConfig] of Object.entries(this.config.stateMachines)) {
      this.machines.set(machineName, {
        config: machineConfig,
        currentStates: /* @__PURE__ */ new Map()
        // entityId -> currentState
      });
    }
    this.emit("initialized", { machines: Array.from(this.machines.keys()) });
  }
  async _createStateResources() {
    const [logOk] = await tryFn(() => this.database.createResource({
      name: this.config.transitionLogResource,
      attributes: {
        id: "string|required",
        machineId: "string|required",
        entityId: "string|required",
        fromState: "string",
        toState: "string|required",
        event: "string|required",
        context: "json",
        timestamp: "number|required",
        createdAt: "string|required"
      },
      behavior: "body-overflow",
      partitions: {
        byMachine: { fields: { machineId: "string" } },
        byDate: { fields: { createdAt: "string|maxlength:10" } }
      }
    }));
    const [stateOk] = await tryFn(() => this.database.createResource({
      name: this.config.stateResource,
      attributes: {
        id: "string|required",
        machineId: "string|required",
        entityId: "string|required",
        currentState: "string|required",
        context: "json|default:{}",
        lastTransition: "string|default:null",
        updatedAt: "string|required"
      },
      behavior: "body-overflow"
    }));
  }
  /**
   * Send an event to trigger a state transition
   */
  async send(machineId, entityId, event, context = {}) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: "send",
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: "Check machine ID or use getMachines() to list available machines"
      });
    }
    const currentState = await this.getState(machineId, entityId);
    const stateConfig = machine.config.states[currentState];
    if (!stateConfig || !stateConfig.on || !stateConfig.on[event]) {
      throw new StateMachineError(`Event '${event}' not valid for state '${currentState}' in machine '${machineId}'`, {
        operation: "send",
        machineId,
        entityId,
        event,
        currentState,
        validEvents: stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : [],
        suggestion: "Use getValidEvents() to check which events are valid for the current state"
      });
    }
    const targetState = stateConfig.on[event];
    if (stateConfig.guards && stateConfig.guards[event]) {
      const guardName = stateConfig.guards[event];
      const guard = this.config.guards[guardName];
      if (guard) {
        const [guardOk, guardErr, guardResult] = await tryFn(
          () => guard(context, event, { database: this.database, machineId, entityId })
        );
        if (!guardOk || !guardResult) {
          throw new StateMachineError(`Transition blocked by guard '${guardName}'`, {
            operation: "send",
            machineId,
            entityId,
            event,
            currentState,
            guardName,
            guardError: guardErr?.message || "Guard returned false",
            suggestion: "Check guard conditions or modify the context to satisfy guard requirements"
          });
        }
      }
    }
    if (stateConfig.exit) {
      await this._executeAction(stateConfig.exit, context, event, machineId, entityId);
    }
    await this._transition(machineId, entityId, currentState, targetState, event, context);
    const targetStateConfig = machine.config.states[targetState];
    if (targetStateConfig && targetStateConfig.entry) {
      await this._executeAction(targetStateConfig.entry, context, event, machineId, entityId);
    }
    this.emit("transition", {
      machineId,
      entityId,
      from: currentState,
      to: targetState,
      event,
      context
    });
    return {
      from: currentState,
      to: targetState,
      event,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async _executeAction(actionName, context, event, machineId, entityId) {
    const action = this.config.actions[actionName];
    if (!action) {
      if (this.config.verbose) {
        console.warn(`[StateMachinePlugin] Action '${actionName}' not found`);
      }
      return;
    }
    const [ok, error] = await tryFn(
      () => action(context, event, { database: this.database, machineId, entityId })
    );
    if (!ok) {
      if (this.config.verbose) {
        console.error(`[StateMachinePlugin] Action '${actionName}' failed:`, error.message);
      }
      this.emit("action_error", { actionName, error: error.message, machineId, entityId });
    }
  }
  async _transition(machineId, entityId, fromState, toState, event, context) {
    const timestamp = Date.now();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const machine = this.machines.get(machineId);
    machine.currentStates.set(entityId, toState);
    if (this.config.persistTransitions) {
      const transitionId = `${machineId}_${entityId}_${timestamp}`;
      let logOk = false;
      let lastLogErr;
      for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
        const [ok, err] = await tryFn(
          () => this.database.resource(this.config.transitionLogResource).insert({
            id: transitionId,
            machineId,
            entityId,
            fromState,
            toState,
            event,
            context,
            timestamp,
            createdAt: now.slice(0, 10)
            // YYYY-MM-DD for partitioning
          })
        );
        if (ok) {
          logOk = true;
          break;
        }
        lastLogErr = err;
        if (attempt < this.config.retryAttempts - 1) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      if (!logOk && this.config.verbose) {
        console.warn(`[StateMachinePlugin] Failed to log transition after ${this.config.retryAttempts} attempts:`, lastLogErr.message);
      }
      const stateId = `${machineId}_${entityId}`;
      const stateData = {
        machineId,
        entityId,
        currentState: toState,
        context,
        lastTransition: transitionId,
        updatedAt: now
      };
      const [updateOk] = await tryFn(
        () => this.database.resource(this.config.stateResource).update(stateId, stateData)
      );
      if (!updateOk) {
        const [insertOk, insertErr] = await tryFn(
          () => this.database.resource(this.config.stateResource).insert({ id: stateId, ...stateData })
        );
        if (!insertOk && this.config.verbose) {
          console.warn(`[StateMachinePlugin] Failed to upsert state:`, insertErr.message);
        }
      }
    }
  }
  /**
   * Get current state for an entity
   */
  async getState(machineId, entityId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: "getState",
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: "Check machine ID or use getMachines() to list available machines"
      });
    }
    if (machine.currentStates.has(entityId)) {
      return machine.currentStates.get(entityId);
    }
    if (this.config.persistTransitions) {
      const stateId = `${machineId}_${entityId}`;
      const [ok, err, stateRecord] = await tryFn(
        () => this.database.resource(this.config.stateResource).get(stateId)
      );
      if (ok && stateRecord) {
        machine.currentStates.set(entityId, stateRecord.currentState);
        return stateRecord.currentState;
      }
    }
    const initialState = machine.config.initialState;
    machine.currentStates.set(entityId, initialState);
    return initialState;
  }
  /**
   * Get valid events for current state
   * Can accept either a state name (sync) or entityId (async to fetch latest state)
   */
  async getValidEvents(machineId, stateOrEntityId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: "getValidEvents",
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: "Check machine ID or use getMachines() to list available machines"
      });
    }
    let state;
    if (machine.config.states[stateOrEntityId]) {
      state = stateOrEntityId;
    } else {
      state = await this.getState(machineId, stateOrEntityId);
    }
    const stateConfig = machine.config.states[state];
    return stateConfig && stateConfig.on ? Object.keys(stateConfig.on) : [];
  }
  /**
   * Get transition history for an entity
   */
  async getTransitionHistory(machineId, entityId, options = {}) {
    if (!this.config.persistTransitions) {
      return [];
    }
    const { limit = 50, offset = 0 } = options;
    const [ok, err, transitions] = await tryFn(
      () => this.database.resource(this.config.transitionLogResource).query({
        machineId,
        entityId
      }, {
        limit,
        offset
      })
    );
    if (!ok) {
      if (this.config.verbose) {
        console.warn(`[StateMachinePlugin] Failed to get transition history:`, err.message);
      }
      return [];
    }
    const sorted = (transitions || []).sort((a, b) => b.timestamp - a.timestamp);
    return sorted.map((t) => ({
      from: t.fromState,
      to: t.toState,
      event: t.event,
      context: t.context,
      timestamp: new Date(t.timestamp).toISOString()
    }));
  }
  /**
   * Initialize entity state (useful for new entities)
   */
  async initializeEntity(machineId, entityId, context = {}) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: "initializeEntity",
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: "Check machine ID or use getMachines() to list available machines"
      });
    }
    const initialState = machine.config.initialState;
    machine.currentStates.set(entityId, initialState);
    if (this.config.persistTransitions) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const stateId = `${machineId}_${entityId}`;
      const [ok, err] = await tryFn(
        () => this.database.resource(this.config.stateResource).insert({
          id: stateId,
          machineId,
          entityId,
          currentState: initialState,
          context,
          lastTransition: null,
          updatedAt: now
        })
      );
      if (!ok && err && !err.message?.includes("already exists")) {
        throw new StateMachineError("Failed to initialize entity state", {
          operation: "initializeEntity",
          machineId,
          entityId,
          initialState,
          original: err,
          suggestion: "Check state resource configuration and database permissions"
        });
      }
    }
    const initialStateConfig = machine.config.states[initialState];
    if (initialStateConfig && initialStateConfig.entry) {
      await this._executeAction(initialStateConfig.entry, context, "INIT", machineId, entityId);
    }
    this.emit("entity_initialized", { machineId, entityId, initialState });
    return initialState;
  }
  /**
   * Get machine definition
   */
  getMachineDefinition(machineId) {
    const machine = this.machines.get(machineId);
    return machine ? machine.config : null;
  }
  /**
   * Get all available machines
   */
  getMachines() {
    return Array.from(this.machines.keys());
  }
  /**
   * Visualize state machine (returns DOT format for graphviz)
   */
  visualize(machineId) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new StateMachineError(`State machine '${machineId}' not found`, {
        operation: "visualize",
        machineId,
        availableMachines: Array.from(this.machines.keys()),
        suggestion: "Check machine ID or use getMachines() to list available machines"
      });
    }
    let dot = `digraph ${machineId} {
`;
    dot += `  rankdir=LR;
`;
    dot += `  node [shape=circle];
`;
    for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
      const shape = stateConfig.type === "final" ? "doublecircle" : "circle";
      const color = stateConfig.meta?.color || "lightblue";
      dot += `  ${stateName} [shape=${shape}, fillcolor=${color}, style=filled];
`;
    }
    for (const [stateName, stateConfig] of Object.entries(machine.config.states)) {
      if (stateConfig.on) {
        for (const [event, targetState] of Object.entries(stateConfig.on)) {
          dot += `  ${stateName} -> ${targetState} [label="${event}"];
`;
        }
      }
    }
    dot += `  start [shape=point];
`;
    dot += `  start -> ${machine.config.initialState};
`;
    dot += `}
`;
    return dot;
  }
  async start() {
    if (this.config.verbose) {
      console.log(`[StateMachinePlugin] Started with ${this.machines.size} state machines`);
    }
  }
  async stop() {
    this.machines.clear();
  }
  async cleanup() {
    await this.stop();
    this.removeAllListeners();
  }
}

function cosineDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dotProduct2 = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct2 += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return a.every((v) => v === 0) && b.every((v) => v === 0) ? 0 : 1;
  }
  const similarity = dotProduct2 / denominator;
  return 1 - similarity;
}
function euclideanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
function manhattanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum;
}
function dotProduct(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
function normalize(vector) {
  const magnitude2 = Math.sqrt(
    vector.reduce((sum, val) => sum + val * val, 0)
  );
  if (magnitude2 === 0) {
    return vector.slice();
  }
  return vector.map((val) => val / magnitude2);
}

function kmeans(vectors, k, options = {}) {
  const {
    maxIterations = 100,
    tolerance = 1e-4,
    distanceFn = euclideanDistance,
    seed = null,
    onIteration = null
  } = options;
  if (vectors.length === 0) {
    throw new Error("Cannot cluster empty vector array");
  }
  if (k < 1) {
    throw new Error(`k must be at least 1, got ${k}`);
  }
  if (k > vectors.length) {
    throw new Error(`k (${k}) cannot be greater than number of vectors (${vectors.length})`);
  }
  const dimensions = vectors[0].length;
  for (let i = 1; i < vectors.length; i++) {
    if (vectors[i].length !== dimensions) {
      throw new Error(`All vectors must have same dimensions. Expected ${dimensions}, got ${vectors[i].length} at index ${i}`);
    }
  }
  const centroids = initializeCentroidsKMeansPlusPlus(vectors, k, distanceFn, seed);
  let assignments = new Array(vectors.length);
  let iterations = 0;
  let converged = false;
  let previousInertia = Infinity;
  while (!converged && iterations < maxIterations) {
    const newAssignments = vectors.map((vector) => {
      let minDist = Infinity;
      let nearestCluster = 0;
      for (let i = 0; i < k; i++) {
        const dist = distanceFn(vector, centroids[i]);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = i;
        }
      }
      return nearestCluster;
    });
    let inertia2 = 0;
    vectors.forEach((vector, i) => {
      const dist = distanceFn(vector, centroids[newAssignments[i]]);
      inertia2 += dist * dist;
    });
    const inertiaChange = Math.abs(previousInertia - inertia2);
    converged = inertiaChange < tolerance;
    assignments = newAssignments;
    previousInertia = inertia2;
    if (onIteration) {
      onIteration(iterations + 1, inertia2, converged);
    }
    if (!converged) {
      const clusterSums = Array(k).fill(null).map(() => new Array(dimensions).fill(0));
      const clusterCounts = new Array(k).fill(0);
      vectors.forEach((vector, i) => {
        const cluster = assignments[i];
        clusterCounts[cluster]++;
        vector.forEach((val, j) => {
          clusterSums[cluster][j] += val;
        });
      });
      for (let i = 0; i < k; i++) {
        if (clusterCounts[i] > 0) {
          centroids[i] = clusterSums[i].map((sum) => sum / clusterCounts[i]);
        } else {
          const randomIdx = Math.floor(Math.random() * vectors.length);
          centroids[i] = [...vectors[randomIdx]];
        }
      }
    }
    iterations++;
  }
  let inertia = 0;
  vectors.forEach((vector, i) => {
    const dist = distanceFn(vector, centroids[assignments[i]]);
    inertia += dist * dist;
  });
  return {
    centroids,
    assignments,
    iterations,
    converged,
    inertia
  };
}
function initializeCentroidsKMeansPlusPlus(vectors, k, distanceFn, seed) {
  const centroids = [];
  const n = vectors.length;
  const firstIndex = seed !== null ? seed % n : Math.floor(Math.random() * n);
  centroids.push([...vectors[firstIndex]]);
  for (let i = 1; i < k; i++) {
    const distances = vectors.map((vector) => {
      return Math.min(...centroids.map((c) => distanceFn(vector, c)));
    });
    const squaredDistances = distances.map((d) => d * d);
    const totalSquared = squaredDistances.reduce((a, b) => a + b, 0);
    if (totalSquared === 0) {
      const randomIdx = Math.floor(Math.random() * n);
      centroids.push([...vectors[randomIdx]]);
      continue;
    }
    let threshold = Math.random() * totalSquared;
    let cumulativeSum = 0;
    for (let j = 0; j < n; j++) {
      cumulativeSum += squaredDistances[j];
      if (cumulativeSum >= threshold) {
        centroids.push([...vectors[j]]);
        break;
      }
    }
  }
  return centroids;
}
async function findOptimalK(vectors, options = {}) {
  const {
    minK = 2,
    maxK = Math.min(10, Math.floor(Math.sqrt(vectors.length / 2))),
    distanceFn = euclideanDistance,
    nReferences = 10,
    stabilityRuns = 5,
    ...kmeansOptions
  } = options;
  const metricsModule = await Promise.resolve().then(function () { return metrics; });
  const {
    silhouetteScore,
    daviesBouldinIndex,
    calinskiHarabaszIndex,
    gapStatistic,
    clusteringStability
  } = metricsModule;
  const results = [];
  for (let k = minK; k <= maxK; k++) {
    const kmeansResult = kmeans(vectors, k, { ...kmeansOptions, distanceFn });
    const silhouette = silhouetteScore(
      vectors,
      kmeansResult.assignments,
      kmeansResult.centroids,
      distanceFn
    );
    const daviesBouldin = daviesBouldinIndex(
      vectors,
      kmeansResult.assignments,
      kmeansResult.centroids,
      distanceFn
    );
    const calinskiHarabasz = calinskiHarabaszIndex(
      vectors,
      kmeansResult.assignments,
      kmeansResult.centroids,
      distanceFn
    );
    const gap = await gapStatistic(
      vectors,
      kmeansResult.assignments,
      kmeansResult.centroids,
      distanceFn,
      nReferences
    );
    const stability = clusteringStability(
      vectors,
      k,
      { ...kmeansOptions, distanceFn, nRuns: stabilityRuns }
    );
    results.push({
      k,
      inertia: kmeansResult.inertia,
      silhouette,
      daviesBouldin,
      calinskiHarabasz,
      gap: gap.gap,
      gapSk: gap.sk,
      stability: stability.stability,
      cvInertia: stability.cvInertia,
      iterations: kmeansResult.iterations,
      converged: kmeansResult.converged
    });
  }
  const elbowK = findElbowPoint(results.map((r) => r.inertia));
  const recommendations = {
    elbow: minK + elbowK,
    silhouette: results.reduce(
      (best, curr) => curr.silhouette > best.silhouette ? curr : best
    ).k,
    daviesBouldin: results.reduce(
      (best, curr) => curr.daviesBouldin < best.daviesBouldin ? curr : best
    ).k,
    calinskiHarabasz: results.reduce(
      (best, curr) => curr.calinskiHarabasz > best.calinskiHarabasz ? curr : best
    ).k,
    gap: results.reduce(
      (best, curr) => curr.gap > best.gap ? curr : best
    ).k,
    stability: results.reduce(
      (best, curr) => curr.stability > best.stability ? curr : best
    ).k
  };
  const votes = Object.values(recommendations);
  const consensus = votes.reduce((acc, k) => {
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const consensusK = parseInt(
    Object.entries(consensus).reduce((a, b) => b[1] > a[1] ? b : a)[0]
  );
  return {
    results,
    recommendations,
    consensus: consensusK,
    summary: {
      analysisRange: `${minK}-${maxK}`,
      totalVectors: vectors.length,
      dimensions: vectors[0].length,
      recommendation: consensusK,
      confidence: consensus[consensusK] / votes.length
    }
  };
}
function findElbowPoint(inertias) {
  const n = inertias.length;
  if (n < 3) return 0;
  let maxCurvature = -Infinity;
  let elbowIndex = 0;
  for (let i = 1; i < n - 1; i++) {
    const curvature = inertias[i - 1] - 2 * inertias[i] + inertias[i + 1];
    if (curvature > maxCurvature) {
      maxCurvature = curvature;
      elbowIndex = i;
    }
  }
  return elbowIndex;
}

class VectorError extends PluginError {
  constructor(message, details = {}) {
    super(message, {
      pluginName: "VectorPlugin",
      ...details,
      description: details.description || `
Vector Plugin Error

Operation: ${details.operation || "unknown"}

Common causes:
1. Vector dimension mismatch between vectors
2. Invalid distance metric specified (must be: cosine, euclidean, manhattan)
3. Empty vector array provided for clustering
4. k value larger than number of available vectors
5. Vector field not found or invalid in resource
6. Large vectors without proper behavior (use 'body-overflow' or 'body-only')

Available distance metrics:
- cosine: Best for normalized vectors, semantic similarity. Range: [0, 2]
- euclidean: Standard L2 distance, geometric proximity. Range: [0, \u221E)
- manhattan: L1 distance, faster computation. Range: [0, \u221E)

Storage considerations:
- Vectors > 250 dimensions may exceed S3 metadata limit (2KB)
- Use behavior: 'body-overflow' or 'body-only' for large vectors
- OpenAI ada-002 (1536 dims): ~10KB, requires body storage
- Sentence Transformers (384 dims): ~2.7KB, requires body storage
      `.trim()
    });
  }
}

class VectorPlugin extends Plugin {
  constructor(options = {}) {
    super(options);
    this.config = {
      dimensions: 1536,
      // Default to OpenAI text-embedding-3-small/3-large
      distanceMetric: "cosine",
      // Default metric
      storageThreshold: 1500,
      // Bytes - warn if vectors exceed this
      autoFixBehavior: false,
      // Automatically set body-overflow
      autoDetectVectorField: true,
      // Auto-detect embedding:XXX fields
      emitEvents: true,
      // Emit events for monitoring
      verboseEvents: false,
      // Emit detailed progress events
      eventThrottle: 100,
      // Throttle progress events (ms)
      ...options
    };
    this.distanceFunctions = {
      cosine: cosineDistance,
      euclidean: euclideanDistance,
      manhattan: manhattanDistance
    };
    this._vectorFieldCache = /* @__PURE__ */ new Map();
    this._throttleState = /* @__PURE__ */ new Map();
  }
  async onInstall() {
    this.emit("installed", { plugin: "VectorPlugin" });
    this.validateVectorStorage();
    this.installResourceMethods();
  }
  async onStart() {
    this.emit("started", { plugin: "VectorPlugin" });
  }
  async onStop() {
    this.emit("stopped", { plugin: "VectorPlugin" });
  }
  async onUninstall(options) {
    for (const resource of Object.values(this.database.resources)) {
      delete resource.vectorSearch;
      delete resource.cluster;
      delete resource.vectorDistance;
      delete resource.similarTo;
      delete resource.findSimilar;
      delete resource.distance;
    }
    this.emit("uninstalled", { plugin: "VectorPlugin" });
  }
  /**
   * Validate vector storage configuration for all resources
   *
   * Detects large vector fields and warns if proper behavior is not set.
   * Can optionally auto-fix by setting body-overflow behavior.
   */
  validateVectorStorage() {
    for (const resource of Object.values(this.database.resources)) {
      const vectorFields = this.findVectorFields(resource.schema.attributes);
      if (vectorFields.length === 0) continue;
      const totalVectorSize = vectorFields.reduce((sum, f) => sum + f.estimatedBytes, 0);
      if (totalVectorSize > this.config.storageThreshold) {
        const hasCorrectBehavior = ["body-overflow", "body-only"].includes(resource.behavior);
        if (!hasCorrectBehavior) {
          const warning = {
            resource: resource.name,
            vectorFields: vectorFields.map((f) => ({
              field: f.name,
              dimensions: f.length,
              estimatedBytes: f.estimatedBytes
            })),
            totalEstimatedBytes: totalVectorSize,
            metadataLimit: 2047,
            currentBehavior: resource.behavior || "default",
            recommendation: "body-overflow"
          };
          this.emit("vector:storage-warning", warning);
          if (this.config.autoFixBehavior) {
            resource.behavior = "body-overflow";
            this.emit("vector:behavior-fixed", {
              resource: resource.name,
              newBehavior: "body-overflow"
            });
          } else {
            console.warn(`\u26A0\uFE0F  VectorPlugin: Resource '${resource.name}' has large vector fields (${totalVectorSize} bytes estimated)`);
            console.warn(`   Current behavior: '${resource.behavior || "default"}'`);
            console.warn(`   Recommendation: Add behavior: 'body-overflow' or 'body-only' to resource configuration`);
            console.warn(`   Large vectors will exceed S3 metadata limit (2047 bytes) and cause errors.`);
          }
        }
      }
    }
  }
  /**
   * Auto-detect vector field from resource schema
   *
   * Looks for fields with type 'embedding:XXX' pattern.
   * Caches result per resource for performance.
   *
   * @param {Resource} resource - Resource instance
   * @returns {string|null} Detected vector field name or null
   */
  detectVectorField(resource) {
    if (this._vectorFieldCache.has(resource.name)) {
      return this._vectorFieldCache.get(resource.name);
    }
    const vectorField = this._findEmbeddingField(resource.schema.attributes);
    this._vectorFieldCache.set(resource.name, vectorField);
    if (vectorField && this.config.emitEvents) {
      this.emit("vector:field-detected", {
        resource: resource.name,
        vectorField,
        timestamp: Date.now()
      });
    }
    return vectorField;
  }
  /**
   * Recursively find embedding:XXX field in attributes
   *
   * @param {Object} attributes - Resource attributes
   * @param {string} path - Current path (for nested objects)
   * @returns {string|null} Field path or null
   */
  _findEmbeddingField(attributes, path = "") {
    for (const [key, attr] of Object.entries(attributes)) {
      const fullPath = path ? `${path}.${key}` : key;
      if (typeof attr === "string" && attr.startsWith("embedding:")) {
        return fullPath;
      }
      if (attr.type === "array" && attr.items === "number" && attr.length) {
        return fullPath;
      }
      if (attr.type === "object" && attr.props) {
        const nested = this._findEmbeddingField(attr.props, fullPath);
        if (nested) return nested;
      }
    }
    return null;
  }
  /**
   * Emit event with throttling support
   *
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   * @param {string} throttleKey - Unique key for throttling (optional)
   */
  _emitEvent(eventName, data, throttleKey = null) {
    if (!this.config.emitEvents) return;
    if (throttleKey) {
      const now = Date.now();
      const lastEmit = this._throttleState.get(throttleKey);
      if (lastEmit && now - lastEmit < this.config.eventThrottle) {
        return;
      }
      this._throttleState.set(throttleKey, now);
    }
    this.emit(eventName, data);
  }
  /**
   * Find vector fields in resource attributes
   *
   * @param {Object} attributes - Resource attributes
   * @param {string} path - Current path (for nested objects)
   * @returns {Array} Array of vector field info
   */
  findVectorFields(attributes, path = "") {
    const vectors = [];
    for (const [key, attr] of Object.entries(attributes)) {
      const fullPath = path ? `${path}.${key}` : key;
      if (attr.type === "array" && attr.items === "number" && attr.length) {
        vectors.push({
          name: fullPath,
          length: attr.length,
          estimatedBytes: this.estimateVectorBytes(attr.length)
        });
      }
      if (attr.type === "object" && attr.props) {
        vectors.push(...this.findVectorFields(attr.props, fullPath));
      }
    }
    return vectors;
  }
  /**
   * Estimate bytes required to store a vector in JSON format
   *
   * Conservative estimate: ~7 bytes per number + array overhead
   *
   * @param {number} dimensions - Number of dimensions
   * @returns {number} Estimated bytes
   */
  estimateVectorBytes(dimensions) {
    return dimensions * 7 + 50;
  }
  /**
   * Install vector methods on all resources
   */
  installResourceMethods() {
    for (const resource of Object.values(this.database.resources)) {
      const searchMethod = this.createVectorSearchMethod(resource);
      const clusterMethod = this.createClusteringMethod(resource);
      const distanceMethod = this.createDistanceMethod();
      resource.vectorSearch = searchMethod;
      resource.cluster = clusterMethod;
      resource.vectorDistance = distanceMethod;
      resource.similarTo = searchMethod;
      resource.findSimilar = searchMethod;
      resource.distance = distanceMethod;
    }
  }
  /**
   * Create vector search method for a resource
   *
   * Performs K-nearest neighbors search to find similar vectors.
   *
   * @param {Resource} resource - Resource instance
   * @returns {Function} Vector search method
   */
  createVectorSearchMethod(resource) {
    return async (queryVector, options = {}) => {
      const startTime = Date.now();
      let vectorField = options.vectorField;
      if (!vectorField && this.config.autoDetectVectorField) {
        vectorField = this.detectVectorField(resource);
        if (!vectorField) {
          vectorField = "vector";
        }
      } else if (!vectorField) {
        vectorField = "vector";
      }
      const {
        limit = 10,
        distanceMetric = this.config.distanceMetric,
        threshold = null,
        partition = null
      } = options;
      const distanceFn = this.distanceFunctions[distanceMetric];
      if (!distanceFn) {
        const error = new VectorError(`Invalid distance metric: ${distanceMetric}`, {
          operation: "vectorSearch",
          availableMetrics: Object.keys(this.distanceFunctions),
          providedMetric: distanceMetric
        });
        this._emitEvent("vector:search-error", {
          resource: resource.name,
          error: error.message,
          timestamp: Date.now()
        });
        throw error;
      }
      this._emitEvent("vector:search-start", {
        resource: resource.name,
        vectorField,
        limit,
        distanceMetric,
        partition,
        threshold,
        queryDimensions: queryVector.length,
        timestamp: startTime
      });
      try {
        let allRecords;
        if (partition) {
          this._emitEvent("vector:partition-filter", {
            resource: resource.name,
            partition,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition, partitionValues: partition });
        } else {
          allRecords = await resource.getAll();
        }
        const totalRecords = allRecords.length;
        let processedRecords = 0;
        let dimensionMismatches = 0;
        const results = allRecords.filter((record) => record[vectorField] && Array.isArray(record[vectorField])).map((record, index) => {
          try {
            const distance = distanceFn(queryVector, record[vectorField]);
            processedRecords++;
            if (this.config.verboseEvents && processedRecords % 100 === 0) {
              this._emitEvent("vector:search-progress", {
                resource: resource.name,
                processed: processedRecords,
                total: totalRecords,
                progress: processedRecords / totalRecords * 100,
                timestamp: Date.now()
              }, `search-${resource.name}`);
            }
            return { record, distance };
          } catch (err) {
            dimensionMismatches++;
            if (this.config.verboseEvents) {
              this._emitEvent("vector:dimension-mismatch", {
                resource: resource.name,
                recordIndex: index,
                expected: queryVector.length,
                got: record[vectorField]?.length,
                timestamp: Date.now()
              });
            }
            return null;
          }
        }).filter((result) => result !== null).filter((result) => threshold === null || result.distance <= threshold).sort((a, b) => a.distance - b.distance).slice(0, limit);
        const duration = Date.now() - startTime;
        const throughput = totalRecords / (duration / 1e3);
        this._emitEvent("vector:search-complete", {
          resource: resource.name,
          vectorField,
          resultsCount: results.length,
          totalRecords,
          processedRecords,
          dimensionMismatches,
          duration,
          throughput: throughput.toFixed(2),
          timestamp: Date.now()
        });
        if (this.config.verboseEvents) {
          this._emitEvent("vector:performance", {
            operation: "search",
            resource: resource.name,
            duration,
            throughput: throughput.toFixed(2),
            recordsPerSecond: (processedRecords / (duration / 1e3)).toFixed(2),
            timestamp: Date.now()
          });
        }
        return results;
      } catch (error) {
        this._emitEvent("vector:search-error", {
          resource: resource.name,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        });
        throw error;
      }
    };
  }
  /**
   * Create clustering method for a resource
   *
   * Performs k-means clustering on resource vectors.
   *
   * @param {Resource} resource - Resource instance
   * @returns {Function} Clustering method
   */
  createClusteringMethod(resource) {
    return async (options = {}) => {
      const startTime = Date.now();
      let vectorField = options.vectorField;
      if (!vectorField && this.config.autoDetectVectorField) {
        vectorField = this.detectVectorField(resource);
        if (!vectorField) {
          vectorField = "vector";
        }
      } else if (!vectorField) {
        vectorField = "vector";
      }
      const {
        k = 5,
        distanceMetric = this.config.distanceMetric,
        partition = null,
        ...kmeansOptions
      } = options;
      const distanceFn = this.distanceFunctions[distanceMetric];
      if (!distanceFn) {
        const error = new VectorError(`Invalid distance metric: ${distanceMetric}`, {
          operation: "cluster",
          availableMetrics: Object.keys(this.distanceFunctions),
          providedMetric: distanceMetric
        });
        this._emitEvent("vector:cluster-error", {
          resource: resource.name,
          error: error.message,
          timestamp: Date.now()
        });
        throw error;
      }
      this._emitEvent("vector:cluster-start", {
        resource: resource.name,
        vectorField,
        k,
        distanceMetric,
        partition,
        maxIterations: kmeansOptions.maxIterations || 100,
        timestamp: startTime
      });
      try {
        let allRecords;
        if (partition) {
          this._emitEvent("vector:partition-filter", {
            resource: resource.name,
            partition,
            timestamp: Date.now()
          });
          allRecords = await resource.list({ partition, partitionValues: partition });
        } else {
          allRecords = await resource.getAll();
        }
        const recordsWithVectors = allRecords.filter(
          (record) => record[vectorField] && Array.isArray(record[vectorField])
        );
        if (recordsWithVectors.length === 0) {
          const error = new VectorError("No vectors found in resource", {
            operation: "cluster",
            resourceName: resource.name,
            vectorField
          });
          this._emitEvent("vector:empty-dataset", {
            resource: resource.name,
            vectorField,
            totalRecords: allRecords.length,
            timestamp: Date.now()
          });
          throw error;
        }
        const vectors = recordsWithVectors.map((record) => record[vectorField]);
        const result = kmeans(vectors, k, {
          ...kmeansOptions,
          distanceFn,
          onIteration: this.config.verboseEvents ? (iteration, inertia, converged) => {
            this._emitEvent("vector:cluster-iteration", {
              resource: resource.name,
              k,
              iteration,
              inertia,
              converged,
              timestamp: Date.now()
            }, `cluster-${resource.name}`);
          } : void 0
        });
        if (result.converged) {
          this._emitEvent("vector:cluster-converged", {
            resource: resource.name,
            k,
            iterations: result.iterations,
            inertia: result.inertia,
            timestamp: Date.now()
          });
        }
        const clusters = Array(k).fill(null).map(() => []);
        recordsWithVectors.forEach((record, i) => {
          const clusterIndex = result.assignments[i];
          clusters[clusterIndex].push(record);
        });
        const duration = Date.now() - startTime;
        const clusterSizes = clusters.map((c) => c.length);
        this._emitEvent("vector:cluster-complete", {
          resource: resource.name,
          vectorField,
          k,
          vectorCount: vectors.length,
          iterations: result.iterations,
          converged: result.converged,
          inertia: result.inertia,
          clusterSizes,
          duration,
          timestamp: Date.now()
        });
        if (this.config.verboseEvents) {
          this._emitEvent("vector:performance", {
            operation: "clustering",
            resource: resource.name,
            k,
            duration,
            iterationsPerSecond: (result.iterations / (duration / 1e3)).toFixed(2),
            vectorsPerSecond: (vectors.length / (duration / 1e3)).toFixed(2),
            timestamp: Date.now()
          });
        }
        return {
          clusters,
          centroids: result.centroids,
          inertia: result.inertia,
          iterations: result.iterations,
          converged: result.converged
        };
      } catch (error) {
        this._emitEvent("vector:cluster-error", {
          resource: resource.name,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now()
        });
        throw error;
      }
    };
  }
  /**
   * Create distance calculation method
   *
   * @returns {Function} Distance method
   */
  createDistanceMethod() {
    return (vector1, vector2, metric = this.config.distanceMetric) => {
      const distanceFn = this.distanceFunctions[metric];
      if (!distanceFn) {
        throw new VectorError(`Invalid distance metric: ${metric}`, {
          operation: "vectorDistance",
          availableMetrics: Object.keys(this.distanceFunctions),
          providedMetric: metric
        });
      }
      return distanceFn(vector1, vector2);
    };
  }
  /**
   * Static utility: Normalize vector
   *
   * @param {number[]} vector - Input vector
   * @returns {number[]} Normalized vector
   */
  static normalize(vector) {
    return normalize(vector);
  }
  /**
   * Static utility: Calculate dot product
   *
   * @param {number[]} vector1 - First vector
   * @param {number[]} vector2 - Second vector
   * @returns {number} Dot product
   */
  static dotProduct(vector1, vector2) {
    return dotProduct(vector1, vector2);
  }
  /**
   * Static utility: Find optimal K for clustering
   *
   * Analyzes clustering quality across a range of K values using
   * multiple evaluation metrics.
   *
   * @param {number[][]} vectors - Vectors to analyze
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Analysis results with recommendations
   */
  static async findOptimalK(vectors, options) {
    return findOptimalK(vectors, options);
  }
}

function silhouetteScore(vectors, assignments, centroids, distanceFn = euclideanDistance) {
  const k = centroids.length;
  const n = vectors.length;
  const clusters = Array(k).fill(null).map(() => []);
  vectors.forEach((vector, i) => {
    clusters[assignments[i]].push(i);
  });
  let totalScore = 0;
  let validPoints = 0;
  if (clusters.every((c) => c.length <= 1)) {
    return 0;
  }
  for (let i = 0; i < n; i++) {
    const clusterIdx = assignments[i];
    const cluster = clusters[clusterIdx];
    if (cluster.length === 1) continue;
    let a = 0;
    for (const j of cluster) {
      if (i !== j) {
        a += distanceFn(vectors[i], vectors[j]);
      }
    }
    a /= cluster.length - 1;
    let b = Infinity;
    for (let otherCluster = 0; otherCluster < k; otherCluster++) {
      if (otherCluster === clusterIdx) continue;
      const otherPoints = clusters[otherCluster];
      if (otherPoints.length === 0) continue;
      let avgDist = 0;
      for (const j of otherPoints) {
        avgDist += distanceFn(vectors[i], vectors[j]);
      }
      avgDist /= otherPoints.length;
      b = Math.min(b, avgDist);
    }
    if (b === Infinity) continue;
    const maxAB = Math.max(a, b);
    const s = maxAB === 0 ? 0 : (b - a) / maxAB;
    totalScore += s;
    validPoints++;
  }
  return validPoints > 0 ? totalScore / validPoints : 0;
}
function daviesBouldinIndex(vectors, assignments, centroids, distanceFn = euclideanDistance) {
  const k = centroids.length;
  const scatters = new Array(k).fill(0);
  const clusterCounts = new Array(k).fill(0);
  vectors.forEach((vector, i) => {
    const cluster = assignments[i];
    scatters[cluster] += distanceFn(vector, centroids[cluster]);
    clusterCounts[cluster]++;
  });
  for (let i = 0; i < k; i++) {
    if (clusterCounts[i] > 0) {
      scatters[i] /= clusterCounts[i];
    }
  }
  let dbIndex = 0;
  let validClusters = 0;
  for (let i = 0; i < k; i++) {
    if (clusterCounts[i] === 0) continue;
    let maxRatio = 0;
    for (let j = 0; j < k; j++) {
      if (i === j || clusterCounts[j] === 0) continue;
      const centroidDist = distanceFn(centroids[i], centroids[j]);
      if (centroidDist === 0) continue;
      const ratio = (scatters[i] + scatters[j]) / centroidDist;
      maxRatio = Math.max(maxRatio, ratio);
    }
    dbIndex += maxRatio;
    validClusters++;
  }
  return validClusters > 0 ? dbIndex / validClusters : 0;
}
function calinskiHarabaszIndex(vectors, assignments, centroids, distanceFn = euclideanDistance) {
  const n = vectors.length;
  const k = centroids.length;
  if (k === 1 || k === n) return 0;
  const dimensions = vectors[0].length;
  const overallCentroid = new Array(dimensions).fill(0);
  vectors.forEach((vector) => {
    vector.forEach((val, dim) => {
      overallCentroid[dim] += val;
    });
  });
  overallCentroid.forEach((val, dim, arr) => {
    arr[dim] = val / n;
  });
  const clusterCounts = new Array(k).fill(0);
  vectors.forEach((vector, i) => {
    clusterCounts[assignments[i]]++;
  });
  let bgss = 0;
  for (let i = 0; i < k; i++) {
    if (clusterCounts[i] === 0) continue;
    const dist = distanceFn(centroids[i], overallCentroid);
    bgss += clusterCounts[i] * dist * dist;
  }
  let wcss = 0;
  vectors.forEach((vector, i) => {
    const cluster = assignments[i];
    const dist = distanceFn(vector, centroids[cluster]);
    wcss += dist * dist;
  });
  if (wcss === 0) return 0;
  return bgss / (k - 1) / (wcss / (n - k));
}
async function gapStatistic(vectors, assignments, centroids, distanceFn = euclideanDistance, nReferences = 10) {
  const n = vectors.length;
  const k = centroids.length;
  const dimensions = vectors[0].length;
  let wk = 0;
  vectors.forEach((vector, i) => {
    const dist = distanceFn(vector, centroids[assignments[i]]);
    wk += dist * dist;
  });
  wk = Math.log(wk + 1e-10);
  const referenceWks = [];
  const mins = new Array(dimensions).fill(Infinity);
  const maxs = new Array(dimensions).fill(-Infinity);
  vectors.forEach((vector) => {
    vector.forEach((val, dim) => {
      mins[dim] = Math.min(mins[dim], val);
      maxs[dim] = Math.max(maxs[dim], val);
    });
  });
  for (let ref = 0; ref < nReferences; ref++) {
    const refVectors = [];
    for (let i = 0; i < n; i++) {
      const refVector = new Array(dimensions);
      for (let dim = 0; dim < dimensions; dim++) {
        refVector[dim] = mins[dim] + Math.random() * (maxs[dim] - mins[dim]);
      }
      refVectors.push(refVector);
    }
    const refResult = kmeans(refVectors, k, { maxIterations: 50, distanceFn });
    let refWk = 0;
    refVectors.forEach((vector, i) => {
      const dist = distanceFn(vector, refResult.centroids[refResult.assignments[i]]);
      refWk += dist * dist;
    });
    referenceWks.push(Math.log(refWk + 1e-10));
  }
  const expectedWk = referenceWks.reduce((a, b) => a + b, 0) / nReferences;
  const gap = expectedWk - wk;
  const sdk = Math.sqrt(
    referenceWks.reduce((sum, wk2) => sum + Math.pow(wk2 - expectedWk, 2), 0) / nReferences
  );
  const sk = sdk * Math.sqrt(1 + 1 / nReferences);
  return { gap, sk, expectedWk, actualWk: wk };
}
function clusteringStability(vectors, k, options = {}) {
  const {
    nRuns = 10,
    distanceFn = euclideanDistance,
    ...kmeansOptions
  } = options;
  const inertias = [];
  const allAssignments = [];
  for (let run = 0; run < nRuns; run++) {
    const result = kmeans(vectors, k, {
      ...kmeansOptions,
      distanceFn,
      seed: run
      // Different seed for each run
    });
    inertias.push(result.inertia);
    allAssignments.push(result.assignments);
  }
  const assignmentSimilarities = [];
  for (let i = 0; i < nRuns - 1; i++) {
    for (let j = i + 1; j < nRuns; j++) {
      const similarity = calculateAssignmentSimilarity(allAssignments[i], allAssignments[j]);
      assignmentSimilarities.push(similarity);
    }
  }
  const avgInertia = inertias.reduce((a, b) => a + b, 0) / nRuns;
  const stdInertia = Math.sqrt(
    inertias.reduce((sum, val) => sum + Math.pow(val - avgInertia, 2), 0) / nRuns
  );
  const avgSimilarity = assignmentSimilarities.length > 0 ? assignmentSimilarities.reduce((a, b) => a + b, 0) / assignmentSimilarities.length : 1;
  return {
    avgInertia,
    stdInertia,
    cvInertia: avgInertia !== 0 ? stdInertia / avgInertia : 0,
    // Coefficient of variation
    avgSimilarity,
    stability: avgSimilarity
    // Higher is more stable
  };
}
function calculateAssignmentSimilarity(assignments1, assignments2) {
  const n = assignments1.length;
  let matches = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameCluster1 = assignments1[i] === assignments1[j];
      const sameCluster2 = assignments2[i] === assignments2[j];
      if (sameCluster1 === sameCluster2) {
        matches++;
      }
    }
  }
  const totalPairs = n * (n - 1) / 2;
  return totalPairs > 0 ? matches / totalPairs : 1;
}

var metrics = /*#__PURE__*/Object.freeze({
  __proto__: null,
  calinskiHarabaszIndex: calinskiHarabaszIndex,
  clusteringStability: clusteringStability,
  daviesBouldinIndex: daviesBouldinIndex,
  gapStatistic: gapStatistic,
  silhouetteScore: silhouetteScore
});

exports.AVAILABLE_BEHAVIORS = AVAILABLE_BEHAVIORS;
exports.AnalyticsNotEnabledError = AnalyticsNotEnabledError;
exports.AuditPlugin = AuditPlugin;
exports.AuthenticationError = AuthenticationError;
exports.BACKUP_DRIVERS = BACKUP_DRIVERS;
exports.BackupPlugin = BackupPlugin;
exports.BaseBackupDriver = BaseBackupDriver;
exports.BaseError = BaseError;
exports.BaseReplicator = BaseReplicator;
exports.BehaviorError = BehaviorError;
exports.BigqueryReplicator = BigqueryReplicator;
exports.CONSUMER_DRIVERS = CONSUMER_DRIVERS;
exports.Cache = Cache;
exports.CachePlugin = CachePlugin;
exports.Client = Client;
exports.ConnectionString = ConnectionString;
exports.ConnectionStringError = ConnectionStringError;
exports.CostsPlugin = CostsPlugin;
exports.CryptoError = CryptoError;
exports.DEFAULT_BEHAVIOR = DEFAULT_BEHAVIOR;
exports.Database = Database;
exports.DatabaseError = DatabaseError;
exports.EncryptionError = EncryptionError;
exports.ErrorMap = ErrorMap;
exports.EventualConsistencyPlugin = EventualConsistencyPlugin;
exports.FilesystemBackupDriver = FilesystemBackupDriver;
exports.FilesystemCache = FilesystemCache;
exports.FullTextPlugin = FullTextPlugin;
exports.InvalidResourceItem = InvalidResourceItem;
exports.MemoryCache = MemoryCache;
exports.MetadataLimitError = MetadataLimitError;
exports.MetricsPlugin = MetricsPlugin;
exports.MissingMetadata = MissingMetadata;
exports.MultiBackupDriver = MultiBackupDriver;
exports.NoSuchBucket = NoSuchBucket;
exports.NoSuchKey = NoSuchKey;
exports.NotFound = NotFound;
exports.PartitionAwareFilesystemCache = PartitionAwareFilesystemCache;
exports.PartitionDriverError = PartitionDriverError;
exports.PartitionError = PartitionError;
exports.PermissionError = PermissionError;
exports.Plugin = Plugin;
exports.PluginError = PluginError;
exports.PluginObject = PluginObject;
exports.PluginStorageError = PluginStorageError;
exports.PostgresReplicator = PostgresReplicator;
exports.QueueConsumerPlugin = QueueConsumerPlugin;
exports.REPLICATOR_DRIVERS = REPLICATOR_DRIVERS;
exports.RabbitMqConsumer = RabbitMqConsumer;
exports.ReplicatorPlugin = ReplicatorPlugin;
exports.Resource = Resource;
exports.ResourceError = ResourceError;
exports.ResourceIdsPageReader = ResourceIdsPageReader;
exports.ResourceIdsReader = ResourceIdsReader;
exports.ResourceNotFound = ResourceNotFound;
exports.ResourceReader = ResourceReader;
exports.ResourceWriter = ResourceWriter;
exports.S3BackupDriver = S3BackupDriver;
exports.S3Cache = S3Cache;
exports.S3QueuePlugin = S3QueuePlugin;
exports.S3db = Database;
exports.S3dbError = S3dbError;
exports.S3dbReplicator = S3dbReplicator;
exports.SchedulerPlugin = SchedulerPlugin;
exports.Schema = Schema;
exports.SchemaError = SchemaError;
exports.SqsConsumer = SqsConsumer;
exports.SqsReplicator = SqsReplicator;
exports.StateMachinePlugin = StateMachinePlugin;
exports.StreamError = StreamError;
exports.UnknownError = UnknownError;
exports.ValidationError = ValidationError;
exports.Validator = Validator;
exports.VectorPlugin = VectorPlugin;
exports.WebhookReplicator = WebhookReplicator;
exports.behaviors = behaviors;
exports.calculateAttributeNamesSize = calculateAttributeNamesSize;
exports.calculateAttributeSizes = calculateAttributeSizes;
exports.calculateEffectiveLimit = calculateEffectiveLimit;
exports.calculateSystemOverhead = calculateSystemOverhead;
exports.calculateTotalSize = calculateTotalSize;
exports.calculateUTF8Bytes = calculateUTF8Bytes;
exports.clearUTF8Cache = clearUTF8Cache;
exports.clearUTF8Memo = clearUTF8Memo;
exports.clearUTF8Memory = clearUTF8Memory;
exports.createBackupDriver = createBackupDriver;
exports.createConsumer = createConsumer;
exports.createReplicator = createReplicator;
exports.decode = decode;
exports.decodeDecimal = decodeDecimal;
exports.decodeFixedPoint = decodeFixedPoint;
exports.decrypt = decrypt;
exports.default = S3db;
exports.encode = encode;
exports.encodeDecimal = encodeDecimal;
exports.encodeFixedPoint = encodeFixedPoint;
exports.encrypt = encrypt;
exports.getBehavior = getBehavior;
exports.getSizeBreakdown = getSizeBreakdown;
exports.idGenerator = idGenerator;
exports.mapAwsError = mapAwsError;
exports.md5 = md5;
exports.passwordGenerator = passwordGenerator;
exports.sha256 = sha256;
exports.streamToString = streamToString;
exports.transformValue = transformValue;
exports.tryFn = tryFn;
exports.tryFnSync = tryFnSync;
exports.validateBackupConfig = validateBackupConfig;
exports.validateReplicatorConfig = validateReplicatorConfig;
//# sourceMappingURL=s3db.cjs.js.map
