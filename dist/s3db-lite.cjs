'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var path = require('path');
var EventEmitter = require('events');
var lodashEs = require('lodash-es');
var recker = require('recker');
var clientS3 = require('@aws-sdk/client-s3');
var crypto = require('crypto');
var os = require('os');
var promises = require('timers/promises');
var nanoid = require('nanoid');
var promises$1 = require('fs/promises');
var stream = require('stream');
var fs = require('fs');
var zlib = require('zlib');
var jsonStableStringify = require('json-stable-stringify');
var bcrypt = require('bcrypt');
var FastestValidatorModule = require('fastest-validator');
var web = require('node:stream/web');
var node_crypto = require('node:crypto');
var pino = require('pino');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var FastestValidatorModule__namespace = /*#__PURE__*/_interopNamespaceDefault(FastestValidatorModule);

function tryFn(fnOrPromise) {
    if (fnOrPromise == null) {
        const err = new Error('fnOrPromise cannot be null or undefined');
        err.stack = new Error().stack;
        return [false, err, undefined];
    }
    if (typeof fnOrPromise === 'function') {
        try {
            const result = fnOrPromise();
            if (result == null) {
                return [true, null, result];
            }
            if (typeof result.then === 'function') {
                return result
                    .then((data) => [true, null, data])
                    .catch((error) => {
                    if (error instanceof Error && Object.isExtensible(error)) {
                        const desc = Object.getOwnPropertyDescriptor(error, 'stack');
                        if (desc?.writable && desc.configurable && Object.prototype.hasOwnProperty.call(error, 'stack')) {
                            try {
                                error.stack = new Error().stack;
                            }
                            catch {
                                // Ignore
                            }
                        }
                    }
                    return [false, error instanceof Error ? error : new Error(String(error)), undefined];
                });
            }
            return [true, null, result];
        }
        catch (error) {
            if (error instanceof Error && Object.isExtensible(error)) {
                const desc = Object.getOwnPropertyDescriptor(error, 'stack');
                if (desc?.writable && desc.configurable && Object.prototype.hasOwnProperty.call(error, 'stack')) {
                    try {
                        error.stack = new Error().stack;
                    }
                    catch {
                        // Ignore
                    }
                }
            }
            return [false, error instanceof Error ? error : new Error(String(error)), undefined];
        }
    }
    if (typeof fnOrPromise.then === 'function') {
        return Promise.resolve(fnOrPromise)
            .then((data) => [true, null, data])
            .catch((error) => {
            if (error instanceof Error && Object.isExtensible(error)) {
                const desc = Object.getOwnPropertyDescriptor(error, 'stack');
                if (desc?.writable && desc.configurable && Object.prototype.hasOwnProperty.call(error, 'stack')) {
                    try {
                        error.stack = new Error().stack;
                    }
                    catch {
                        // Ignore
                    }
                }
            }
            return [false, error instanceof Error ? error : new Error(String(error)), undefined];
        });
    }
    return [true, null, fnOrPromise];
}
/**
 * Synchronous version of tryFn for cases where you know the function is synchronous
 */
function tryFnSync(fn) {
    try {
        const result = fn();
        return [true, null, result];
    }
    catch (err) {
        return [false, err instanceof Error ? err : new Error(String(err)), undefined];
    }
}

class CircuitBreaker {
    threshold;
    resetTimeout;
    circuits;
    constructor(options = {}) {
        this.threshold = options.threshold || 5;
        this.resetTimeout = options.resetTimeout || 30000;
        this.circuits = new Map();
    }
    getKey(hostname) {
        return hostname || 'unknown';
    }
    getStats(key) {
        if (!this.circuits.has(key)) {
            this.circuits.set(key, {
                failures: 0,
                lastFailureTime: 0,
                state: 'CLOSED'
            });
        }
        return this.circuits.get(key);
    }
    canRequest(hostname) {
        const key = this.getKey(hostname);
        const stats = this.getStats(key);
        if (stats.state === 'OPEN') {
            const now = Date.now();
            if (now - stats.lastFailureTime > this.resetTimeout) {
                stats.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        return true;
    }
    recordSuccess(hostname) {
        const key = this.getKey(hostname);
        const stats = this.getStats(key);
        if (stats.state === 'HALF_OPEN' || stats.state === 'CLOSED') {
            stats.state = 'CLOSED';
            stats.failures = 0;
        }
    }
    recordFailure(hostname) {
        const key = this.getKey(hostname);
        const stats = this.getStats(key);
        stats.failures++;
        stats.lastFailureTime = Date.now();
        if (stats.state === 'HALF_OPEN') {
            stats.state = 'OPEN';
        }
        else if (stats.state === 'CLOSED' && stats.failures >= this.threshold) {
            stats.state = 'OPEN';
        }
    }
    getState(hostname) {
        const key = this.getKey(hostname);
        return this.getStats(key).state;
    }
}
class RequestDeduplicator {
    pending;
    constructor() {
        this.pending = new Map();
    }
    generateKey(method, url) {
        return `${method}:${url}`;
    }
    async dedupe(method, url, requestFn) {
        if (method !== 'GET' && method !== 'HEAD') {
            return requestFn();
        }
        const key = this.generateKey(method, url);
        if (this.pending.has(key)) {
            return this.pending.get(key);
        }
        const promise = requestFn().finally(() => {
            this.pending.delete(key);
        });
        this.pending.set(key, promise);
        return promise;
    }
    get size() {
        return this.pending.size;
    }
}
function calculateRetryDelay(attempt, baseDelay, maxDelay, useJitter = true) {
    let delay = Math.pow(2, attempt - 1) * baseDelay;
    delay = Math.min(delay, maxDelay);
    if (useJitter) {
        const jitterRange = delay * 0.25;
        const jitterAmount = (Math.random() * jitterRange * 2) - jitterRange;
        delay += jitterAmount;
    }
    return Math.max(0, Math.floor(delay));
}
function isRetryableError(error, statusCode) {
    if (error) {
        // Check for HTTP/2 specific errors first
        const h2Error = recker.parseHttp2Error(error);
        if (h2Error) {
            return h2Error.retriable;
        }
        // Check for native HTTP/2 errors
        if (error instanceof recker.Http2Error) {
            return error.retriable;
        }
        const code = error.code;
        if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' ||
            code === 'ECONNREFUSED' || code === 'EPIPE' || code === 'UND_ERR_SOCKET' ||
            code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' ||
            code === 'UND_ERR_BODY_TIMEOUT') {
            return true;
        }
        if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
            return true;
        }
    }
    if (statusCode) {
        return [408, 429, 500, 502, 503, 504].includes(statusCode);
    }
    return false;
}
/**
 * Get additional retry delay for HTTP/2 errors like ENHANCE_YOUR_CALM
 */
function getHttp2RetryDelay(error) {
    const h2Error = recker.parseHttp2Error(error);
    if (h2Error && h2Error.errorCode === 'ENHANCE_YOUR_CALM') {
        // Server is rate limiting, wait longer (5-10 seconds)
        return 5000 + Math.random() * 5000;
    }
    return undefined;
}
function parseRetryAfter(headerValue) {
    if (!headerValue)
        return undefined;
    const seconds = parseInt(headerValue, 10);
    if (!isNaN(seconds) && seconds >= 0) {
        return seconds * 1000;
    }
    const date = Date.parse(headerValue);
    if (!isNaN(date)) {
        const delay = date - Date.now();
        return delay > 0 ? delay : undefined;
    }
    return undefined;
}
class ReckerHttpHandler {
    options;
    client;
    deduplicator;
    circuitBreaker;
    metrics;
    http2MetricsEnabled;
    constructor(options = {}) {
        this.options = {
            connectTimeout: 10000,
            headersTimeout: 30000,
            bodyTimeout: 60000,
            keepAliveTimeout: 4000,
            keepAliveMaxTimeout: 600000,
            connections: 100,
            pipelining: 10,
            http2: true,
            http2MaxConcurrentStreams: 100,
            http2Preset: 'performance', // Default to performance preset for S3 workloads
            expectContinue: 2 * 1024 * 1024, // 2MB threshold for Expect: 100-Continue
            enableHttp2Metrics: false,
            enableDedup: true,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 5,
            circuitBreakerResetTimeout: 30000,
            enableRetry: true,
            maxRetries: 3,
            retryDelay: 1000,
            maxRetryDelay: 30000,
            retryJitter: true,
            respectRetryAfter: true,
            ...options,
        };
        this.http2MetricsEnabled = this.options.enableHttp2Metrics;
        // Build HTTP/2 configuration using presets
        const http2Config = this.options.http2
            ? this.options.http2Preset
                ? recker.expandHTTP2Options(this.options.http2Preset)
                : { enabled: true, maxConcurrentStreams: this.options.http2MaxConcurrentStreams }
            : false;
        // Build hooks for HTTP/2 observability
        const hooks = this.http2MetricsEnabled ? recker.createHttp2MetricsHooks() : undefined;
        this.client = recker.createClient({
            timeout: {
                lookup: 5000,
                connect: this.options.connectTimeout,
                secureConnect: this.options.connectTimeout,
                response: this.options.headersTimeout,
                request: this.options.bodyTimeout,
            },
            http2: http2Config,
            expectContinue: this.options.expectContinue,
            concurrency: {
                max: this.options.connections * 10,
                agent: {
                    connections: this.options.connections,
                    pipelining: this.options.pipelining,
                    keepAlive: true,
                    keepAliveTimeout: this.options.keepAliveTimeout,
                    keepAliveMaxTimeout: this.options.keepAliveMaxTimeout,
                },
            },
            hooks,
            observability: this.http2MetricsEnabled,
        });
        this.deduplicator = this.options.enableDedup ? new RequestDeduplicator() : null;
        this.circuitBreaker = this.options.enableCircuitBreaker ? new CircuitBreaker({
            threshold: this.options.circuitBreakerThreshold,
            resetTimeout: this.options.circuitBreakerResetTimeout,
        }) : null;
        this.metrics = {
            requests: 0,
            retries: 0,
            deduped: 0,
            circuitBreakerTrips: 0,
        };
    }
    get metadata() {
        return this.client?.metadata ?? { handlerProtocol: 'http/1.1' };
    }
    async handle(request, { abortSignal, requestTimeout } = {}) {
        const hostname = request.hostname;
        const method = request.method;
        if (this.circuitBreaker && !this.circuitBreaker.canRequest(hostname)) {
            this.metrics.circuitBreakerTrips++;
            throw new Error(`Circuit breaker OPEN for ${hostname}`);
        }
        const doRequest = async () => {
            this.metrics.requests++;
            let lastError;
            let attempt = 0;
            const maxAttempts = this.options.enableRetry ? this.options.maxRetries + 1 : 1;
            while (attempt < maxAttempts) {
                attempt++;
                try {
                    const headers = {};
                    for (const [key, value] of Object.entries(request.headers)) {
                        if (value !== undefined) {
                            headers[key] = value;
                        }
                    }
                    const result = await this.client.handle({
                        protocol: request.protocol,
                        hostname: request.hostname,
                        port: request.port,
                        path: request.path,
                        query: request.query,
                        method: request.method,
                        headers,
                        body: request.body,
                    }, {
                        abortSignal,
                        requestTimeout: requestTimeout || this.options.bodyTimeout,
                    });
                    const statusCode = result.response.statusCode;
                    if (this.options.enableRetry && attempt < maxAttempts &&
                        isRetryableError(null, statusCode)) {
                        this.metrics.retries++;
                        let delay;
                        if (this.options.respectRetryAfter) {
                            const retryAfter = parseRetryAfter(result.response.headers['retry-after'] ?? null);
                            delay = retryAfter !== undefined
                                ? Math.min(retryAfter, this.options.maxRetryDelay)
                                : calculateRetryDelay(attempt, this.options.retryDelay, this.options.maxRetryDelay, this.options.retryJitter);
                        }
                        else {
                            delay = calculateRetryDelay(attempt, this.options.retryDelay, this.options.maxRetryDelay, this.options.retryJitter);
                        }
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    if (this.circuitBreaker) {
                        this.circuitBreaker.recordSuccess(hostname);
                    }
                    return result;
                }
                catch (error) {
                    lastError = error;
                    if (this.circuitBreaker) {
                        this.circuitBreaker.recordFailure(hostname);
                    }
                    if (this.options.enableRetry && attempt < maxAttempts && isRetryableError(error)) {
                        this.metrics.retries++;
                        const h2Delay = getHttp2RetryDelay(error);
                        const delay = h2Delay !== undefined
                            ? Math.min(h2Delay, this.options.maxRetryDelay)
                            : calculateRetryDelay(attempt, this.options.retryDelay, this.options.maxRetryDelay, this.options.retryJitter);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw error;
                }
            }
            throw lastError;
        };
        if (this.deduplicator) {
            const protocol = request.protocol || 'https:';
            const url = `${protocol}//${hostname}${request.path}`;
            const originalRequests = this.metrics.requests;
            const result = await this.deduplicator.dedupe(method, url, doRequest);
            if (this.metrics.requests === originalRequests) {
                this.metrics.deduped++;
            }
            return result;
        }
        return doRequest();
    }
    updateHttpClientConfig(key, value) {
        this.options[key] = value;
    }
    httpHandlerConfigs() {
        return { ...this.options };
    }
    getMetrics() {
        const metrics = {
            ...this.metrics,
            circuitStates: this.circuitBreaker
                ? Object.fromEntries(this.circuitBreaker.circuits)
                : {},
            pendingDeduped: this.deduplicator?.size || 0,
        };
        // Include HTTP/2 metrics if enabled
        if (this.http2MetricsEnabled) {
            const h2Summary = recker.getGlobalHttp2Metrics().getSummary();
            metrics.http2 = {
                sessions: h2Summary.totals.sessions,
                activeSessions: h2Summary.totals.activeSessions,
                streams: h2Summary.totals.streams,
                activeStreams: h2Summary.totals.activeStreams,
                errors: h2Summary.totals.errors,
            };
        }
        return metrics;
    }
    resetMetrics() {
        this.metrics = {
            requests: 0,
            retries: 0,
            deduped: 0,
            circuitBreakerTrips: 0,
        };
    }
    destroy() {
        this.client = null;
        this.deduplicator = null;
        this.circuitBreaker = null;
    }
}

/**
 * S3DB Error Classes
 *
 * Typed error hierarchy for s3db.js operations.
 */
class BaseError extends Error {
    bucket;
    key;
    thrownAt;
    code;
    statusCode;
    requestId;
    awsMessage;
    original;
    commandName;
    commandInput;
    metadata;
    description;
    suggestion;
    retriable;
    docs;
    title;
    hint;
    data;
    constructor(context) {
        const { verbose, bucket, key, message = 'Unknown error', code, statusCode, requestId, awsMessage, original, commandName, commandInput, metadata, description, suggestion, retriable, docs, title, hint, ...rest } = context;
        let finalMessage = message;
        if (verbose) {
            finalMessage = message + `\n\nVerbose:\n\n${JSON.stringify(rest, null, 2)}`;
        }
        super(finalMessage);
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        }
        else {
            this.stack = new Error(finalMessage).stack;
        }
        this.name = this.constructor.name;
        this.bucket = bucket;
        this.key = key;
        this.thrownAt = new Date();
        this.code = code;
        this.statusCode = statusCode ?? 500;
        this.requestId = requestId;
        this.awsMessage = awsMessage;
        this.original = original;
        this.commandName = commandName;
        this.commandInput = commandInput;
        this.metadata = metadata;
        this.description = description;
        this.suggestion = suggestion;
        this.retriable = retriable ?? false;
        this.docs = docs;
        this.title = title || this.constructor.name;
        this.hint = hint;
        this.data = {
            bucket,
            key,
            ...rest,
            verbose,
            message,
            suggestion: this.suggestion,
            retriable: this.retriable,
            docs: this.docs,
            title: this.title,
            hint: this.hint,
        };
    }
    toJSON() {
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
            retriable: this.retriable,
            suggestion: this.suggestion,
            docs: this.docs,
            title: this.title,
            hint: this.hint,
            commandName: this.commandName,
            commandInput: this.commandInput,
            metadata: this.metadata,
            description: this.description,
            data: this.data,
            original: this.original,
            stack: this.stack,
        };
    }
    toString() {
        return `${this.name} | ${this.message}`;
    }
}
class S3dbError extends BaseError {
    constructor(message, details = {}) {
        let code;
        let statusCode;
        let requestId;
        let awsMessage;
        let original = details.original;
        let metadata;
        if (details.original && typeof details.original === 'object') {
            const awsError = details.original;
            original = details.original;
            code = awsError.code || awsError.Code || awsError.name;
            statusCode = awsError.statusCode || awsError.$metadata?.httpStatusCode;
            requestId = awsError.requestId || awsError.$metadata?.requestId;
            awsMessage = awsError.message;
            metadata = awsError.$metadata ? { ...awsError.$metadata } : undefined;
        }
        super({
            message,
            ...details,
            code,
            statusCode,
            requestId,
            awsMessage,
            original,
            metadata,
        });
    }
}
class DatabaseError extends S3dbError {
    constructor(message, details = {}) {
        const merged = {
            statusCode: details.statusCode ?? 500,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ??
                'Check database configuration and ensure the operation parameters are valid.',
            ...details,
        };
        super(message, merged);
        Object.assign(this, merged);
    }
}
class ValidationError extends S3dbError {
    field;
    value;
    constraint;
    constructor(message, details = {}) {
        const merged = {
            statusCode: details.statusCode ?? 422,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ??
                'Review validation errors and adjust the request payload before retrying.',
            ...details,
        };
        super(message, merged);
        this.field = details.field;
        this.value = details.value;
        this.constraint = details.constraint;
        Object.assign(this, merged);
    }
}
class AuthenticationError extends S3dbError {
    constructor(message, details = {}) {
        const merged = {
            statusCode: details.statusCode ?? 401,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ??
                'Provide valid authentication credentials and try again.',
            ...details,
        };
        super(message, merged);
        Object.assign(this, merged);
    }
}
class PermissionError extends S3dbError {
    constructor(message, details = {}) {
        const merged = {
            statusCode: details.statusCode ?? 403,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ??
                'Verify IAM permissions, bucket policies, and credentials before retrying.',
            ...details,
        };
        super(message, merged);
        Object.assign(this, merged);
    }
}
class EncryptionError extends S3dbError {
    constructor(message, details = {}) {
        const merged = {
            statusCode: details.statusCode ?? 500,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ??
                'Check encryption keys and inputs. This error generally requires code/config changes before retrying.',
            ...details,
        };
        super(message, merged);
        Object.assign(this, merged);
    }
}
class ResourceNotFound extends S3dbError {
    resourceName;
    id;
    constructor(details) {
        const { bucket, resourceName, id, original, ...rest } = details;
        if (typeof id !== 'string') {
            throw new ValidationError('ResourceNotFound requires id to be a string', {
                field: 'id',
                value: id,
                retriable: false,
                suggestion: 'Provide the resource id as a string when constructing ResourceNotFound.',
            });
        }
        if (typeof bucket !== 'string') {
            throw new ValidationError('ResourceNotFound requires bucket to be a string', {
                field: 'bucket',
                value: bucket,
                retriable: false,
                suggestion: 'Provide the bucket name as a string when constructing ResourceNotFound.',
            });
        }
        if (typeof resourceName !== 'string') {
            throw new ValidationError('ResourceNotFound requires resourceName to be a string', {
                field: 'resourceName',
                value: resourceName,
                retriable: false,
                suggestion: 'Provide the resource name as a string when constructing ResourceNotFound.',
            });
        }
        super(`Resource not found: ${resourceName}/${id} [bucket:${bucket}]`, {
            bucket,
            resourceName,
            id,
            original,
            statusCode: rest.statusCode ?? 404,
            retriable: rest.retriable ?? false,
            suggestion: rest.suggestion ?? 'Confirm the resource ID and ensure it exists before retrying.',
            ...rest,
        });
        this.resourceName = resourceName;
        this.id = id;
    }
}
class NoSuchBucket extends S3dbError {
    constructor(details) {
        const { bucket, original, ...rest } = details;
        if (typeof bucket !== 'string') {
            throw new ValidationError('NoSuchBucket requires bucket to be a string', {
                field: 'bucket',
                value: bucket,
                retriable: false,
                suggestion: 'Provide the bucket name as a string when constructing NoSuchBucket.',
            });
        }
        super(`Bucket does not exists [bucket:${bucket}]`, {
            bucket,
            original,
            statusCode: rest.statusCode ?? 404,
            retriable: rest.retriable ?? false,
            suggestion: rest.suggestion ?? 'Verify the bucket name and AWS region. Create the bucket if it is missing.',
            ...rest,
        });
    }
}
class NoSuchKey extends S3dbError {
    resourceName;
    id;
    constructor(details) {
        const { bucket, key, resourceName, id, original, ...rest } = details;
        if (typeof key !== 'string') {
            throw new ValidationError('NoSuchKey requires key to be a string', {
                field: 'key',
                value: key,
                retriable: false,
                suggestion: 'Provide the object key as a string when constructing NoSuchKey.',
            });
        }
        if (typeof bucket !== 'string') {
            throw new ValidationError('NoSuchKey requires bucket to be a string', {
                field: 'bucket',
                value: bucket,
                retriable: false,
                suggestion: 'Provide the bucket name as a string when constructing NoSuchKey.',
            });
        }
        if (id !== undefined && typeof id !== 'string') {
            throw new ValidationError('NoSuchKey requires id to be a string when provided', {
                field: 'id',
                value: id,
                retriable: false,
                suggestion: 'Provide the resource id as a string when including it in NoSuchKey.',
            });
        }
        super(`No such key: ${key} [bucket:${bucket}]`, {
            bucket,
            key,
            resourceName,
            id,
            original,
            statusCode: rest.statusCode ?? 404,
            retriable: rest.retriable ?? false,
            suggestion: rest.suggestion ?? 'Check if the object key is correct and that the object was uploaded.',
            ...rest,
        });
        this.resourceName = resourceName;
        this.id = id;
    }
}
class NotFound extends S3dbError {
    resourceName;
    id;
    constructor(details) {
        const { bucket, key, resourceName, id, original, ...rest } = details;
        if (typeof key !== 'string') {
            throw new ValidationError('NotFound requires key to be a string', {
                field: 'key',
                value: key,
                retriable: false,
                suggestion: 'Provide the object key as a string when constructing NotFound.',
            });
        }
        if (typeof bucket !== 'string') {
            throw new ValidationError('NotFound requires bucket to be a string', {
                field: 'bucket',
                value: bucket,
                retriable: false,
                suggestion: 'Provide the bucket name as a string when constructing NotFound.',
            });
        }
        super(`Not found: ${key} [bucket:${bucket}]`, {
            bucket,
            key,
            resourceName,
            id,
            original,
            statusCode: rest.statusCode ?? 404,
            retriable: rest.retriable ?? false,
            suggestion: rest.suggestion ?? 'Confirm the key and bucket. Upload the object if it is missing.',
            ...rest,
        });
        this.resourceName = resourceName;
        this.id = id;
    }
}
class MissingMetadata extends S3dbError {
    constructor(details) {
        const { bucket, original, ...rest } = details;
        if (typeof bucket !== 'string') {
            throw new ValidationError('MissingMetadata requires bucket to be a string', {
                field: 'bucket',
                value: bucket,
                retriable: false,
                suggestion: 'Provide the bucket name as a string when constructing MissingMetadata.',
            });
        }
        super(`Missing metadata for bucket [bucket:${bucket}]`, {
            bucket,
            original,
            statusCode: rest.statusCode ?? 500,
            retriable: rest.retriable ?? false,
            suggestion: rest.suggestion ?? 'Re-upload metadata or run db.uploadMetadataFile() to regenerate it.',
            ...rest,
        });
    }
}
class InvalidResourceItem extends S3dbError {
    constructor(details) {
        const { bucket, resourceName, attributes, validation, message, original, ...rest } = details;
        if (typeof bucket !== 'string') {
            throw new ValidationError('InvalidResourceItem requires bucket to be a string', {
                field: 'bucket',
                value: bucket,
                retriable: false,
                suggestion: 'Provide the bucket name as a string when constructing InvalidResourceItem.',
            });
        }
        if (typeof resourceName !== 'string') {
            throw new ValidationError('InvalidResourceItem requires resourceName to be a string', {
                field: 'resourceName',
                value: resourceName,
                retriable: false,
                suggestion: 'Provide the resource name as a string when constructing InvalidResourceItem.',
            });
        }
        super(message ||
            `Validation error: This item is not valid. Resource=${resourceName} [bucket:${bucket}].\n${JSON.stringify(validation, null, 2)}`, {
            bucket,
            resourceName,
            attributes,
            validation,
            original,
            statusCode: rest.statusCode ?? 422,
            retriable: rest.retriable ?? false,
            suggestion: rest.suggestion ?? 'Fix validation errors on the provided attributes before retrying the request.',
            ...rest,
        });
    }
}
class UnknownError extends S3dbError {
}
const ErrorMap = {
    NotFound,
    NoSuchKey,
    UnknownError,
    NoSuchBucket,
    MissingMetadata,
    InvalidResourceItem,
};
function mapAwsError(err, context = {}) {
    const awsErr = err;
    const code = awsErr.code || awsErr.Code || awsErr.name;
    const metadata = awsErr.$metadata ? { ...awsErr.$metadata } : undefined;
    const { commandName, commandInput } = context;
    let description;
    if (code === 'NoSuchKey' || code === 'NotFound') {
        description = 'The specified key does not exist in the bucket. Check if the key exists and if your credentials have permission to access it.';
        return new NoSuchKey({
            bucket: context.bucket ?? '',
            key: context.key ?? '',
            resourceName: context.resourceName,
            id: context.id,
            original: err,
            metadata,
            commandName,
            commandInput,
            description,
            retriable: false,
        });
    }
    if (code === 'NoSuchBucket') {
        description = 'The specified bucket does not exist. Check if the bucket name is correct and if your credentials have permission to access it.';
        return new NoSuchBucket({
            bucket: context.bucket ?? '',
            original: err,
            metadata,
            commandName,
            commandInput,
            description,
            retriable: false,
        });
    }
    if (code === 'AccessDenied' || awsErr.statusCode === 403 || code === 'Forbidden') {
        description = 'Access denied. Check your AWS credentials, IAM permissions, and bucket policy.';
        return new PermissionError('Access denied', {
            ...context,
            original: err,
            metadata,
            commandName,
            commandInput,
            description,
            retriable: false,
        });
    }
    if (code === 'ValidationError' || awsErr.statusCode === 400) {
        description = 'Validation error. Check the request parameters and payload format.';
        return new ValidationError('Validation error', {
            ...context,
            original: err,
            metadata,
            commandName,
            commandInput,
            description,
            retriable: false,
        });
    }
    if (code === 'MissingMetadata') {
        description = 'Object metadata is missing or invalid. Check if the object was uploaded correctly.';
        return new MissingMetadata({
            bucket: context.bucket ?? '',
            original: err,
            metadata,
            commandName,
            commandInput,
            description,
            retriable: false,
        });
    }
    const errorDetails = [
        `Unknown error: ${err.message || err.toString()}`,
        awsErr.code && `Code: ${awsErr.code}`,
        awsErr.statusCode && `Status: ${awsErr.statusCode}`,
        err.stack && `Stack: ${err.stack.split('\n')[0]}`,
    ]
        .filter(Boolean)
        .join(' | ');
    description = `Check the error details and AWS documentation. Original error: ${err.message || err.toString()}`;
    return new UnknownError(errorDetails, {
        ...context,
        original: err,
        metadata,
        commandName,
        commandInput,
        description,
        retriable: context.retriable ?? false,
    });
}
class ConnectionStringError extends S3dbError {
    constructor(message, details = {}) {
        const description = details.description || 'Invalid connection string format. Check the connection string syntax and credentials.';
        const merged = {
            statusCode: details.statusCode ?? 400,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ?? 'Fix the connection string and retry the operation.',
            description,
            ...details,
        };
        super(message, merged);
    }
}
class CryptoError extends S3dbError {
    constructor(message, details = {}) {
        const description = details.description || 'Cryptography operation failed. Check if the crypto library is available and input is valid.';
        const merged = {
            statusCode: details.statusCode ?? 500,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ?? 'Validate crypto inputs and environment setup before retrying.',
            description,
            ...details,
        };
        super(message, merged);
    }
}
class SchemaError extends S3dbError {
    constructor(message, details = {}) {
        const description = details.description || 'Schema validation failed. Check schema definition and input data format.';
        const merged = {
            statusCode: details.statusCode ?? 400,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ?? 'Update the schema or adjust the data to match the schema definition.',
            description,
            ...details,
        };
        super(message, merged);
    }
}
class ResourceError extends S3dbError {
    constructor(message, details = {}) {
        const description = details.description || 'Resource operation failed. Check resource configuration, attributes, and operation context.';
        const merged = {
            statusCode: details.statusCode ?? 400,
            retriable: details.retriable ?? false,
            suggestion: details.suggestion ?? 'Review the resource configuration and request payload before retrying.',
            description,
            ...details,
        };
        super(message, merged);
        Object.assign(this, merged);
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
${availableFields.map((f) => `  • ${f}`).join('\n') || '  (no fields defined)'}

Possible causes:
1. Field was removed from schema but partition still references it
2. Typo in partition field name
3. Nested field path is incorrect (use dot notation like 'utm.source')

Solution:
${details.strictValidation === false
                ? '  • Update partition definition to use existing fields'
                : `  • Add missing field to schema, OR
  • Update partition definition to use existing fields, OR
  • Use strictValidation: false to skip this check during testing`}

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/README.md#partitions
`.trim();
        }
        super(message, {
            ...details,
            statusCode: details.statusCode ?? 400,
            retriable: details.retriable ?? false,
            description,
        });
    }
}
class PluginError extends S3dbError {
    pluginName;
    operation;
    constructor(message, details = {}) {
        const { pluginName = 'Unknown', operation = 'unknown', ...rest } = details;
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

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/README.md
`.trim();
        }
        const merged = {
            ...rest,
            pluginName,
            operation,
            statusCode: rest.statusCode ?? 500,
            retriable: rest.retriable ?? false,
            description,
        };
        super(message, merged);
        this.pluginName = pluginName;
        this.operation = operation;
        Object.assign(this, merged);
    }
}
class PluginStorageError extends S3dbError {
    constructor(message, details = {}) {
        const { pluginSlug = 'unknown', key = '', operation = 'unknown', ...rest } = details;
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
            statusCode: rest.statusCode ?? 500,
            retriable: rest.retriable ?? false,
            description,
        });
    }
}
class PartitionDriverError extends S3dbError {
    constructor(message, details = {}) {
        const { driver = 'unknown', operation = 'unknown', queueSize, maxQueueSize, ...rest } = details;
        let description = details.description;
        if (!description && queueSize !== undefined && maxQueueSize !== undefined) {
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
${queueSize >= maxQueueSize ? 'Wait for queue to drain or increase maxQueueSize' : 'Check driver configuration and permissions'}
`.trim();
        }
        else if (!description) {
            description = `
Partition Driver Error

Driver: ${driver}
Operation: ${operation}

Check driver configuration and permissions.
`.trim();
        }
        super(message, {
            ...rest,
            driver,
            operation,
            queueSize,
            maxQueueSize,
            statusCode: rest.statusCode ?? 503,
            retriable: rest.retriable ?? (queueSize !== undefined && maxQueueSize !== undefined && queueSize >= maxQueueSize),
            description,
        });
    }
}
class BehaviorError extends S3dbError {
    constructor(message, details = {}) {
        const { behavior = 'unknown', availableBehaviors = [], ...rest } = details;
        let description = details.description;
        if (!description) {
            description = `
Behavior Error

Requested: ${behavior}
Available: ${availableBehaviors.join(', ') || 'body-overflow, body-only, truncate-data, enforce-limits, user-managed'}

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
            statusCode: rest.statusCode ?? 400,
            retriable: rest.retriable ?? false,
            description,
        });
    }
}
class StreamError extends S3dbError {
    constructor(message, details = {}) {
        const { operation = 'unknown', resource, ...rest } = details;
        let description = details.description;
        if (!description) {
            description = `
Stream Error

Operation: ${operation}
${resource ? `Resource: ${resource}` : ''}

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
            statusCode: rest.statusCode ?? 500,
            retriable: rest.retriable ?? false,
            description,
        });
    }
}
class MetadataLimitError extends S3dbError {
    constructor(message, details = {}) {
        const { totalSize, effectiveLimit, absoluteLimit = 2047, excess, resourceName, operation, ...rest } = details;
        let description = details.description;
        if (!description && totalSize && effectiveLimit) {
            description = `
S3 Metadata Size Limit Exceeded

Current Size: ${totalSize} bytes
Effective Limit: ${effectiveLimit} bytes
Absolute Limit: ${absoluteLimit} bytes
${excess ? `Excess: ${excess} bytes` : ''}
${resourceName ? `Resource: ${resourceName}` : ''}
${operation ? `Operation: ${operation}` : ''}

S3 has a hard limit of 2KB (2047 bytes) for object metadata.

Solutions:
1. Use 'body-overflow' behavior to store excess in body
2. Use 'body-only' behavior to store everything in body
3. Reduce number of fields
4. Use shorter field values
5. Enable advanced metadata encoding

Example:
  await db.createResource({
    name: '${resourceName || 'myResource'}',
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
            statusCode: rest.statusCode ?? 413,
            retriable: rest.retriable ?? false,
            description,
        });
    }
}
class AnalyticsNotEnabledError extends S3dbError {
    constructor(details = {}) {
        const { pluginName = 'EventualConsistency', resourceName = 'unknown', field = 'unknown', configuredResources = [], registeredResources = [], pluginInitialized = false, ...rest } = details;
        const message = `Analytics not enabled for ${resourceName}.${field}`;
        const description = `
Analytics Not Enabled

Plugin: ${pluginName}
Resource: ${resourceName}
Field: ${field}

Diagnostics:
  • Plugin initialized: ${pluginInitialized ? '✓ Yes' : '✗ No'}
  • Analytics resources created: ${registeredResources.length}/${configuredResources.length}
${configuredResources
            .map((r) => {
            const exists = registeredResources.includes(r);
            return `    ${exists ? '✓' : '✗'} ${r}${!exists ? ' (missing)' : ''}`;
        })
            .join('\n')}

Possible causes:
1. Resource not created yet - Analytics resources are created when db.createResource() is called
2. Resource created before plugin initialization - Plugin must be initialized before resources
3. Field not configured in analytics.resources config

Correct initialization order:
  1. Create database: const db = new Database({ ... })
  2. Install plugins: await db.connect() (triggers plugin.install())
  3. Create resources: await db.createResource({ name: '${resourceName}', ... })
  4. Analytics resources are auto-created by plugin

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
            statusCode: rest.statusCode ?? 400,
            retriable: rest.retriable ?? false,
            description,
        });
    }
}

async function dynamicCrypto() {
    let lib;
    if (typeof process !== 'undefined') {
        lib = crypto.webcrypto;
    }
    else if (typeof window !== 'undefined') {
        lib = window.crypto;
    }
    if (!lib)
        throw new CryptoError('Could not load any crypto library', { context: 'dynamicCrypto' });
    return lib;
}
async function encrypt(content, passphrase) {
    const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
    if (!okCrypto)
        throw new CryptoError('Crypto API not available', { original: errCrypto });
    const salt = cryptoLib.getRandomValues(new Uint8Array(16));
    const [okKey, errKey, key] = await tryFn(() => getKeyMaterial(passphrase, salt));
    const iv = cryptoLib.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedContent = encoder.encode(content);
    const [okEnc, errEnc, encryptedContent] = await tryFn(() => cryptoLib.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encodedContent));
    if (!okEnc)
        throw new CryptoError('Encryption failed', { original: errEnc, content });
    const encryptedData = new Uint8Array(salt.length + iv.length + encryptedContent.byteLength);
    encryptedData.set(salt);
    encryptedData.set(iv, salt.length);
    encryptedData.set(new Uint8Array(encryptedContent), salt.length + iv.length);
    return arrayBufferToBase64(encryptedData);
}
async function decrypt(encryptedBase64, passphrase) {
    const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
    if (!okCrypto)
        throw new CryptoError('Crypto API not available', { original: errCrypto });
    const encryptedData = base64ToArrayBuffer(encryptedBase64);
    const salt = encryptedData.slice(0, 16);
    const iv = encryptedData.slice(16, 28);
    const encryptedContent = encryptedData.slice(28);
    const [okKey, errKey, key] = await tryFn(() => getKeyMaterial(passphrase, salt));
    if (!okKey)
        throw new CryptoError('Key derivation failed (decrypt)', { original: errKey, passphrase, salt });
    const [okDec, errDec, decryptedContent] = await tryFn(() => cryptoLib.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encryptedContent));
    if (!okDec)
        throw new CryptoError('Decryption failed', { original: errDec, encryptedBase64 });
    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
}
async function md5(data) {
    if (typeof process === 'undefined') {
        throw new CryptoError('MD5 hashing is only available in Node.js environment', { context: 'md5' });
    }
    const [ok, err, result] = await tryFn(async () => {
        return crypto.createHash('md5').update(data).digest('base64');
    });
    if (!ok) {
        throw new CryptoError('MD5 hashing failed', { original: err, data });
    }
    return result;
}
async function getKeyMaterial(passphrase, salt) {
    const [okCrypto, errCrypto, cryptoLib] = await tryFn(dynamicCrypto);
    if (!okCrypto)
        throw new CryptoError('Crypto API not available', { original: errCrypto });
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(passphrase);
    const [okImport, errImport, baseKey] = await tryFn(() => cryptoLib.subtle.importKey('raw', keyMaterial, { name: 'PBKDF2' }, false, ['deriveKey']));
    if (!okImport)
        throw new CryptoError('importKey failed', { original: errImport, passphrase });
    const [okDerive, errDerive, derivedKey] = await tryFn(() => cryptoLib.subtle.deriveKey({
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
    }, baseKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']));
    if (!okDerive)
        throw new CryptoError('deriveKey failed', { original: errDerive, passphrase, salt });
    return derivedKey;
}
function arrayBufferToBase64(buffer) {
    if (typeof process !== 'undefined') {
        return Buffer.from(buffer).toString('base64');
    }
    else {
        const [ok, err, binary] = tryFnSync(() => String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))));
        if (!ok)
            throw new CryptoError('Failed to convert ArrayBuffer to base64 (browser)', { original: err });
        return window.btoa(binary);
    }
}
function base64ToArrayBuffer(base64) {
    if (typeof process !== 'undefined') {
        return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    else {
        const [ok, err, binaryString] = tryFnSync(() => window.atob(base64));
        if (!ok)
            throw new CryptoError('Failed to decode base64 (browser)', { original: err });
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
}

const BUILT_IN_SENSITIVE_FIELDS = [
    'password',
    'passwd',
    'pwd',
    'passphrase',
    'secret',
    'token',
    'auth',
    'authorization',
    'apikey',
    'api_key',
    'api-key',
    'apitoken',
    'api_token',
    'api-token',
    'apisecret',
    'api_secret',
    'api-secret',
    'authtoken',
    'auth_token',
    'auth-token',
    'bearertoken',
    'bearer_token',
    'bearer-token',
    'accesskey',
    'access_key',
    'access-key',
    'accesskeyid',
    'access_key_id',
    'access-key-id',
    'secretkey',
    'secret_key',
    'secret-key',
    'secretaccesskey',
    'secret_access_key',
    'secret-access-key',
    'awsaccesskey',
    'aws_access_key',
    'aws-access-key',
    'awsaccesskeyid',
    'aws_access_key_id',
    'aws-access-key-id',
    'awssecretkey',
    'aws_secret_key',
    'aws-secret-key',
    'awssecretaccesskey',
    'aws_secret_access_key',
    'aws-secret-access-key',
    'awstoken',
    'aws_token',
    'aws-token',
    'sessiontoken',
    'session_token',
    'session-token',
    'gcpaccesskey',
    'gcp_access_key',
    'gcp-access-key',
    'gcpsecretkey',
    'gcp_secret_key',
    'gcp-secret-key',
    'gcpapikey',
    'gcp_api_key',
    'gcp-api-key',
    'azurekey',
    'azure_key',
    'azure-key',
    'azurekeysecret',
    'azure_key_secret',
    'azure-key-secret',
    'azuretoken',
    'azure_token',
    'azure-token',
    'azuresecretkey',
    'azure_secret_key',
    'azure-secret-key',
    'connectionstring',
    'connection_string',
    'connection-string',
    'dbpassword',
    'db_password',
    'db-password',
    'dbtoken',
    'db_token',
    'db-token',
    'dbsecret',
    'db_secret',
    'db-secret',
    'mongodburi',
    'mongodb_uri',
    'mongodb-uri',
    'postgresqlpassword',
    'postgresql_password',
    'postgresql-password',
    'clientsecret',
    'client_secret',
    'client-secret',
    'clientid',
    'client_id',
    'client-id',
    'oauth2secret',
    'oauth2_secret',
    'oauth2-secret',
    'oidcsecret',
    'oidc_secret',
    'oidc-secret',
    'encryptionkey',
    'encryption_key',
    'encryption-key',
    'cryptokey',
    'crypto_key',
    'crypto-key',
    'hmackey',
    'hmac_key',
    'hmac-key',
    'rsaprivatekey',
    'rsa_private_key',
    'rsa-private-key',
    'privatekeyid',
    'private_key_id',
    'private-key-id',
    'privatekey',
    'private_key',
    'private-key',
    'certificate',
    'cert',
    'certificatekey',
    'certificate_key',
    'certificate-key',
    'credential',
    'credentials',
    'hash',
    'nonce',
    'jti',
    'fingerprint',
    'sessionid',
    'session_id',
    'session-id',
    'refreshtoken',
    'refresh_token',
    'refresh-token'
];
function createRedactRules(customPatterns = []) {
    const redactPaths = [];
    for (const field of BUILT_IN_SENSITIVE_FIELDS) {
        redactPaths.push(field);
        redactPaths.push(`*.${field}`);
        redactPaths.push(`**.${field}`);
    }
    if (customPatterns.length > 0) ;
    return redactPaths;
}

function serializeError(err) {
    if (!err || typeof err !== 'object') {
        return err;
    }
    const error = err;
    if (typeof error.toJSON === 'function') {
        return error.toJSON();
    }
    return {
        ...error,
        message: error.message,
        stack: error.stack,
    };
}
function createPrettyTransport() {
    return {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false
        }
    };
}
function createDefaultTransport() {
    const envFormat = process.env.S3DB_LOG_FORMAT?.toLowerCase();
    if (envFormat === 'json') {
        return undefined;
    }
    return createPrettyTransport();
}
function createLogger(options = {}) {
    const { level = 'info', name, format, transport, bindings = {}, redactPatterns = [], maxPayloadBytes = 1_000_000 } = options;
    const redactRules = createRedactRules(redactPatterns);
    let finalTransport;
    if (format === 'json') {
        finalTransport = undefined;
    }
    else if (format === 'pretty') {
        finalTransport = createPrettyTransport();
    }
    else if (transport !== undefined) {
        finalTransport = transport;
    }
    else {
        finalTransport = createDefaultTransport();
    }
    const normalizedBindings = bindings && typeof bindings === 'object' ? bindings : {};
    const config = {
        level,
        redact: redactRules,
        transport: finalTransport || undefined,
        serializers: {
            err: serializeError,
            error: serializeError
        }
    };
    let logger = pino({
        ...config,
        name
    });
    const baseBindings = name ? { ...normalizedBindings, name } : normalizedBindings;
    if (baseBindings && Object.keys(baseBindings).length > 0) {
        logger = logger.child(baseBindings);
    }
    logger._maxPayloadBytes = maxPayloadBytes;
    return logger;
}
function getLoggerOptionsFromEnv(configOptions = {}) {
    const options = { ...configOptions };
    if (process.env.S3DB_LOG_LEVEL) {
        options.level = process.env.S3DB_LOG_LEVEL;
    }
    if (process.env.S3DB_LOG_FORMAT) {
        const format = process.env.S3DB_LOG_FORMAT.toLowerCase();
        if (format === 'json' || format === 'pretty') {
            options.format = format;
        }
    }
    else if (process.env.S3DB_LOG_PRETTY === 'false') {
        options.format = 'json';
    }
    else if (process.env.S3DB_LOG_PRETTY === 'true') {
        options.format = 'pretty';
    }
    return options;
}

const logger = createLogger({ name: 'IdGenerator', level: 'info' });
const FALLBACK_URL_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const POOL_SIZE_MULTIPLIER = 128;
let pool;
let poolOffset = 0;
function fillPool(bytes) {
    if (!pool || pool.length < bytes) {
        pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
        node_crypto.randomFillSync(pool);
        poolOffset = 0;
    }
    else if (poolOffset + bytes > pool.length) {
        node_crypto.randomFillSync(pool);
        poolOffset = 0;
    }
    poolOffset += bytes;
}
function randomFromPool(bytes) {
    bytes |= 0;
    fillPool(bytes);
    return pool.subarray(poolOffset - bytes, poolOffset);
}
function customRandomFallback(alphabet, defaultSize, getRandom) {
    const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
    const step = Math.ceil((1.6 * mask * defaultSize) / alphabet.length);
    return (size = defaultSize) => {
        if (!size)
            return '';
        let id = '';
        while (true) {
            const bytes = getRandom(step);
            let i = step;
            while (i--) {
                id += alphabet[bytes[i] & mask] || '';
                if (id.length >= size)
                    return id;
            }
        }
    };
}
function customAlphabetFallback(alphabet, size = 21) {
    return customRandomFallback(alphabet, size, randomFromPool);
}
let activeCustomAlphabet = customAlphabetFallback;
let activeUrlAlphabet = FALLBACK_URL_ALPHABET;
let idGeneratorImpl = activeCustomAlphabet(activeUrlAlphabet, 22);
let passwordGeneratorImpl = activeCustomAlphabet(PASSWORD_ALPHABET, 16);
const nanoidReadyPromise = import('nanoid')
    .then((mod) => {
    const resolvedCustomAlphabet = mod?.customAlphabet ?? activeCustomAlphabet;
    const resolvedUrlAlphabet = mod?.urlAlphabet ?? activeUrlAlphabet;
    activeCustomAlphabet = resolvedCustomAlphabet;
    activeUrlAlphabet = resolvedUrlAlphabet;
    idGeneratorImpl = activeCustomAlphabet(activeUrlAlphabet, 22);
    passwordGeneratorImpl = activeCustomAlphabet(PASSWORD_ALPHABET, 16);
})
    .catch((error) => {
    if (typeof process !== 'undefined' && process?.env?.S3DB_DEBUG) {
        logger.warn({ error: error.message }, 'Failed to dynamically import "nanoid". Using fallback implementation.');
    }
});
function initializeNanoid() {
    return nanoidReadyPromise;
}
const idGenerator = (size) => idGeneratorImpl(size);
const passwordGenerator = (size) => passwordGeneratorImpl(size);
const getUrlAlphabet = () => activeUrlAlphabet;
const createCustomGenerator = (alphabet, size) => activeCustomAlphabet(alphabet, size);

var id = /*#__PURE__*/Object.freeze({
    __proto__: null,
    createCustomGenerator: createCustomGenerator,
    getUrlAlphabet: getUrlAlphabet,
    idGenerator: idGenerator,
    initializeNanoid: initializeNanoid,
    passwordGenerator: passwordGenerator
});

const CONTENT_TYPE_DICT = {
    'application/json': 'j',
    'application/xml': 'X',
    'application/ld+json': 'J',
    'text/html': 'H',
    'text/plain': 'T',
    'text/css': 'C',
    'text/javascript': 'V',
    'text/csv': 'v',
    'image/png': 'P',
    'image/jpeg': 'I',
    'image/gif': 'G',
    'image/svg+xml': 'S',
    'image/webp': 'W',
    'application/pdf': 'Q',
    'application/zip': 'z',
    'application/octet-stream': 'o',
    'application/x-www-form-urlencoded': 'u',
    'multipart/form-data': 'F',
    'font/woff': 'w',
    'font/woff2': 'f'
};
const URL_PREFIX_DICT = {
    '/api/v1/': '@1',
    '/api/v2/': '@2',
    '/api/v3/': '@3',
    '/api/': '@a',
    'https://api.example.com/': '@A',
    'https://api.': '@H',
    'https://www.': '@W',
    'https://': '@h',
    'http://': '@t',
    'https://s3.amazonaws.com/': '@s',
    'https://s3-': '@S',
    'http://localhost:': '@L',
    'http://localhost': '@l',
    '/v1/': '@v',
    '/users/': '@u',
    '/products/': '@p'
};
const STATUS_MESSAGE_DICT = {
    'processing': 'p',
    'completed': 'c',
    'succeeded': 's',
    'failed': 'f',
    'cancelled': 'x',
    'timeout': 't',
    'retrying': 'r',
    'authorized': 'a',
    'captured': 'K',
    'refunded': 'R',
    'declined': 'd',
    'shipped': 'h',
    'delivered': 'D',
    'returned': 'e',
    'in_transit': 'i',
    'initialized': 'n',
    'terminated': 'm'
};
const CONTENT_TYPE_REVERSE = Object.fromEntries(Object.entries(CONTENT_TYPE_DICT).map(([k, v]) => [v, k]));
const URL_PREFIX_REVERSE = Object.fromEntries(Object.entries(URL_PREFIX_DICT).map(([k, v]) => [v, k]));
const STATUS_MESSAGE_REVERSE = Object.fromEntries(Object.entries(STATUS_MESSAGE_DICT).map(([k, v]) => [v, k]));
const COMBINED_DICT = {
    ...CONTENT_TYPE_DICT,
    ...STATUS_MESSAGE_DICT
};
const COMBINED_REVERSE = {
    ...CONTENT_TYPE_REVERSE,
    ...STATUS_MESSAGE_REVERSE
};
function dictionaryEncode(value) {
    if (typeof value !== 'string' || !value) {
        return null;
    }
    if (COMBINED_DICT[value]) {
        return {
            encoded: 'd:' + COMBINED_DICT[value],
            encoding: 'dictionary',
            originalLength: value.length,
            encodedLength: 2 + COMBINED_DICT[value].length,
            dictionaryType: 'exact',
            savings: value.length - (2 + COMBINED_DICT[value].length)
        };
    }
    const sortedPrefixes = Object.entries(URL_PREFIX_DICT)
        .sort(([a], [b]) => b.length - a.length);
    for (const [prefix, code] of sortedPrefixes) {
        if (value.startsWith(prefix)) {
            const remainder = value.substring(prefix.length);
            const encoded = 'd:' + code + remainder;
            return {
                encoded,
                encoding: 'dictionary',
                originalLength: value.length,
                encodedLength: encoded.length,
                dictionaryType: 'prefix',
                prefix,
                remainder,
                savings: value.length - encoded.length
            };
        }
    }
    return null;
}
function dictionaryDecode(encoded) {
    if (typeof encoded !== 'string' || !encoded.startsWith('d:')) {
        return null;
    }
    const payload = encoded.substring(2);
    if (payload.length === 0) {
        return null;
    }
    if (payload.length === 1) {
        const decoded = COMBINED_REVERSE[payload];
        if (decoded) {
            return decoded;
        }
    }
    if (payload.startsWith('@')) {
        const prefixCode = payload.substring(0, 2);
        const remainder = payload.substring(2);
        const prefix = URL_PREFIX_REVERSE[prefixCode];
        if (prefix) {
            return prefix + remainder;
        }
    }
    return null;
}

const analysisCache = new Map();
const MAX_CACHE_SIZE = 500;
function isAsciiOnly(str) {
    return /^[\x20-\x7E]*$/.test(str);
}
function analyzeString(str) {
    if (!str || typeof str !== 'string') {
        return { type: 'none', safe: true };
    }
    if (analysisCache.has(str)) {
        return analysisCache.get(str);
    }
    if (isAsciiOnly(str)) {
        const result = {
            type: 'ascii',
            safe: true,
            stats: { ascii: str.length, latin1: 0, multibyte: 0 }
        };
        cacheAnalysisResult(str, result);
        return result;
    }
    let asciiCount = 0;
    let latin1Count = 0;
    let multibyteCount = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code >= 0x20 && code <= 0x7E) {
            asciiCount++;
        }
        else if (code < 0x20 || code === 0x7F) {
            multibyteCount++;
        }
        else if (code >= 0x80 && code <= 0xFF) {
            latin1Count++;
        }
        else {
            multibyteCount++;
        }
    }
    const hasMultibyte = multibyteCount > 0;
    const hasLatin1 = latin1Count > 0;
    let result;
    if (!hasLatin1 && !hasMultibyte) {
        result = {
            type: 'ascii',
            safe: true,
            stats: { ascii: asciiCount, latin1: 0, multibyte: 0 }
        };
    }
    else if (hasMultibyte) {
        const multibyteRatio = multibyteCount / str.length;
        if (multibyteRatio > 0.3) {
            result = {
                type: 'base64',
                safe: false,
                reason: 'high multibyte content',
                stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
            };
        }
        else {
            result = {
                type: 'url',
                safe: false,
                reason: 'contains multibyte characters',
                stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
            };
        }
    }
    else {
        const latin1Ratio = latin1Count / str.length;
        if (latin1Ratio > 0.5) {
            result = {
                type: 'base64',
                safe: false,
                reason: 'high Latin-1 content',
                stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
            };
        }
        else {
            result = {
                type: 'url',
                safe: false,
                reason: 'contains Latin-1 extended characters',
                stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
            };
        }
    }
    cacheAnalysisResult(str, result);
    return result;
}
function cacheAnalysisResult(str, result) {
    if (analysisCache.size >= MAX_CACHE_SIZE) {
        const firstKey = analysisCache.keys().next().value;
        if (firstKey !== undefined) {
            analysisCache.delete(firstKey);
        }
    }
    analysisCache.set(str, result);
}
const COMMON_VALUES = {
    'active': { encoded: 'active', encoding: 'none' },
    'inactive': { encoded: 'inactive', encoding: 'none' },
    'pending': { encoded: 'pending', encoding: 'none' },
    'completed': { encoded: 'completed', encoding: 'none' },
    'failed': { encoded: 'failed', encoding: 'none' },
    'success': { encoded: 'success', encoding: 'none' },
    'error': { encoded: 'error', encoding: 'none' },
    'processing': { encoded: 'processing', encoding: 'none' },
    'queued': { encoded: 'queued', encoding: 'none' },
    'cancelled': { encoded: 'cancelled', encoding: 'none' },
    'GET': { encoded: 'GET', encoding: 'none' },
    'POST': { encoded: 'POST', encoding: 'none' },
    'PUT': { encoded: 'PUT', encoding: 'none' },
    'DELETE': { encoded: 'DELETE', encoding: 'none' },
    'PATCH': { encoded: 'PATCH', encoding: 'none' },
    'HEAD': { encoded: 'HEAD', encoding: 'none' },
    'OPTIONS': { encoded: 'OPTIONS', encoding: 'none' },
    '200': { encoded: '200', encoding: 'none' },
    '201': { encoded: '201', encoding: 'none' },
    '204': { encoded: '204', encoding: 'none' },
    '301': { encoded: '301', encoding: 'none' },
    '302': { encoded: '302', encoding: 'none' },
    '304': { encoded: '304', encoding: 'none' },
    '400': { encoded: '400', encoding: 'none' },
    '401': { encoded: '401', encoding: 'none' },
    '403': { encoded: '403', encoding: 'none' },
    '404': { encoded: '404', encoding: 'none' },
    '405': { encoded: '405', encoding: 'none' },
    '409': { encoded: '409', encoding: 'none' },
    '422': { encoded: '422', encoding: 'none' },
    '429': { encoded: '429', encoding: 'none' },
    '500': { encoded: '500', encoding: 'none' },
    '502': { encoded: '502', encoding: 'none' },
    '503': { encoded: '503', encoding: 'none' },
    '504': { encoded: '504', encoding: 'none' },
    'OK': { encoded: 'OK', encoding: 'none' },
    'Created': { encoded: 'Created', encoding: 'none' },
    'paid': { encoded: 'paid', encoding: 'none' },
    'unpaid': { encoded: 'unpaid', encoding: 'none' },
    'refunded': { encoded: 'refunded', encoding: 'none' },
    'pending_payment': { encoded: 'pending_payment', encoding: 'none' },
    'authorized': { encoded: 'authorized', encoding: 'none' },
    'captured': { encoded: 'captured', encoding: 'none' },
    'declined': { encoded: 'declined', encoding: 'none' },
    'voided': { encoded: 'voided', encoding: 'none' },
    'chargeback': { encoded: 'chargeback', encoding: 'none' },
    'disputed': { encoded: 'disputed', encoding: 'none' },
    'settled': { encoded: 'settled', encoding: 'none' },
    'reversed': { encoded: 'reversed', encoding: 'none' },
    'shipped': { encoded: 'shipped', encoding: 'none' },
    'delivered': { encoded: 'delivered', encoding: 'none' },
    'returned': { encoded: 'returned', encoding: 'none' },
    'in_transit': { encoded: 'in_transit', encoding: 'none' },
    'out_for_delivery': { encoded: 'out_for_delivery', encoding: 'none' },
    'ready_to_ship': { encoded: 'ready_to_ship', encoding: 'none' },
    'backordered': { encoded: 'backordered', encoding: 'none' },
    'pre_order': { encoded: 'pre_order', encoding: 'none' },
    'on_hold': { encoded: 'on_hold', encoding: 'none' },
    'awaiting_pickup': { encoded: 'awaiting_pickup', encoding: 'none' },
    'admin': { encoded: 'admin', encoding: 'none' },
    'moderator': { encoded: 'moderator', encoding: 'none' },
    'owner': { encoded: 'owner', encoding: 'none' },
    'editor': { encoded: 'editor', encoding: 'none' },
    'viewer': { encoded: 'viewer', encoding: 'none' },
    'contributor': { encoded: 'contributor', encoding: 'none' },
    'guest': { encoded: 'guest', encoding: 'none' },
    'member': { encoded: 'member', encoding: 'none' },
    'trace': { encoded: 'trace', encoding: 'none' },
    'debug': { encoded: 'debug', encoding: 'none' },
    'info': { encoded: 'info', encoding: 'none' },
    'warn': { encoded: 'warn', encoding: 'none' },
    'fatal': { encoded: 'fatal', encoding: 'none' },
    'emergency': { encoded: 'emergency', encoding: 'none' },
    'dev': { encoded: 'dev', encoding: 'none' },
    'development': { encoded: 'development', encoding: 'none' },
    'staging': { encoded: 'staging', encoding: 'none' },
    'production': { encoded: 'production', encoding: 'none' },
    'test': { encoded: 'test', encoding: 'none' },
    'qa': { encoded: 'qa', encoding: 'none' },
    'uat': { encoded: 'uat', encoding: 'none' },
    'create': { encoded: 'create', encoding: 'none' },
    'read': { encoded: 'read', encoding: 'none' },
    'update': { encoded: 'update', encoding: 'none' },
    'delete': { encoded: 'delete', encoding: 'none' },
    'list': { encoded: 'list', encoding: 'none' },
    'search': { encoded: 'search', encoding: 'none' },
    'count': { encoded: 'count', encoding: 'none' },
    'enabled': { encoded: 'enabled', encoding: 'none' },
    'disabled': { encoded: 'disabled', encoding: 'none' },
    'archived': { encoded: 'archived', encoding: 'none' },
    'draft': { encoded: 'draft', encoding: 'none' },
    'published': { encoded: 'published', encoding: 'none' },
    'scheduled': { encoded: 'scheduled', encoding: 'none' },
    'expired': { encoded: 'expired', encoding: 'none' },
    'locked': { encoded: 'locked', encoding: 'none' },
    'low': { encoded: 'low', encoding: 'none' },
    'medium': { encoded: 'medium', encoding: 'none' },
    'high': { encoded: 'high', encoding: 'none' },
    'urgent': { encoded: 'urgent', encoding: 'none' },
    'critical': { encoded: 'critical', encoding: 'none' },
    'true': { encoded: 'true', encoding: 'none' },
    'false': { encoded: 'false', encoding: 'none' },
    'yes': { encoded: 'yes', encoding: 'none' },
    'no': { encoded: 'no', encoding: 'none' },
    'on': { encoded: 'on', encoding: 'none' },
    'off': { encoded: 'off', encoding: 'none' },
    '1': { encoded: '1', encoding: 'none' },
    '0': { encoded: '0', encoding: 'none' },
    'null': { encoded: 'null', encoding: 'special' },
    'undefined': { encoded: 'undefined', encoding: 'special' },
    'none': { encoded: 'none', encoding: 'none' },
    'N/A': { encoded: 'N/A', encoding: 'none' }
};
function metadataEncode(value) {
    if (value === null) {
        return { encoded: 'null', encoding: 'special' };
    }
    if (value === undefined) {
        return { encoded: 'undefined', encoding: 'special' };
    }
    const stringValue = String(value);
    if (stringValue.startsWith('d:') || stringValue.startsWith('u:') || stringValue.startsWith('b:')) {
        return {
            encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
            encoding: 'base64',
            reason: 'force-encoded to prevent decoding ambiguity'
        };
    }
    const dictResult = dictionaryEncode(stringValue);
    if (dictResult && dictResult.savings > 0) {
        return {
            encoded: dictResult.encoded,
            encoding: 'dictionary',
            dictionaryType: dictResult.dictionaryType,
            savings: dictResult.savings,
            compressionRatio: (dictResult.encodedLength / dictResult.originalLength).toFixed(3)
        };
    }
    if (COMMON_VALUES[stringValue]) {
        return COMMON_VALUES[stringValue];
    }
    const analysis = analyzeString(stringValue);
    switch (analysis.type) {
        case 'none':
        case 'ascii':
            return {
                encoded: stringValue,
                encoding: 'none',
                analysis
            };
        case 'url':
            return {
                encoded: 'u:' + encodeURIComponent(stringValue),
                encoding: 'url',
                analysis
            };
        case 'base64':
            return {
                encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
                encoding: 'base64',
                analysis
            };
        default:
            return {
                encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
                encoding: 'base64',
                analysis
            };
    }
}
function metadataDecode(value) {
    if (value === 'null') {
        return null;
    }
    if (value === 'undefined') {
        return undefined;
    }
    if (value === null || value === undefined || typeof value !== 'string') {
        return value;
    }
    if (value.startsWith('d:')) {
        const decoded = dictionaryDecode(value);
        if (decoded !== null) {
            return decoded;
        }
    }
    if (value.length >= 2) {
        const firstChar = value.charCodeAt(0);
        const secondChar = value.charCodeAt(1);
        if (secondChar === 58) {
            if (firstChar === 117) {
                if (value.length === 2)
                    return value;
                try {
                    return decodeURIComponent(value.substring(2));
                }
                catch {
                    return value;
                }
            }
            if (firstChar === 98) {
                if (value.length === 2)
                    return value;
                try {
                    const decoded = Buffer.from(value.substring(2), 'base64').toString('utf8');
                    return decoded;
                }
                catch {
                    return value;
                }
            }
        }
    }
    return value;
}

const S3_DEFAULT_REGION = 'us-east-1';
const S3_DEFAULT_ENDPOINT = 'https://s3.us-east-1.amazonaws.com';
class ConnectionString {
    region;
    bucket;
    accessKeyId;
    secretAccessKey;
    endpoint;
    keyPrefix;
    forcePathStyle;
    clientType;
    basePath;
    clientOptions;
    constructor(connectionString) {
        const [ok, err, parsed] = tryFnSync(() => new URL(connectionString));
        if (!ok) {
            throw new ConnectionStringError('Invalid connection string: ' + connectionString, {
                original: err,
                input: connectionString
            });
        }
        const uri = parsed;
        // defaults:
        this.region = S3_DEFAULT_REGION;
        this.bucket = 's3db';
        this.accessKeyId = undefined;
        this.secretAccessKey = undefined;
        this.endpoint = S3_DEFAULT_ENDPOINT;
        this.keyPrefix = '';
        // config:
        if (uri.protocol === 's3:')
            this.defineFromS3(uri);
        else if (uri.protocol === 'file:')
            this.defineFromFileUri(uri);
        else if (uri.protocol === 'memory:')
            this.defineFromMemoryUri(uri);
        else
            this.defineFromCustomUri(uri);
        // Parse querystring parameters (supports nested dot notation)
        this.clientOptions = this._parseQueryParams(uri.searchParams);
    }
    _parseQueryParams(searchParams) {
        const result = {};
        for (const [key, value] of searchParams.entries()) {
            const keys = key.split('.');
            let current = result;
            // Navigate/create nested structure
            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                if (!current[k] || typeof current[k] !== 'object') {
                    current[k] = {};
                }
                current = current[k];
            }
            // Set final value with type coercion
            const finalKey = keys[keys.length - 1];
            current[finalKey] = this._coerceValue(value);
        }
        return result;
    }
    _coerceValue(value) {
        // Boolean
        if (value === 'true')
            return true;
        if (value === 'false')
            return false;
        // Number
        if (/^-?\d+$/.test(value))
            return parseInt(value, 10);
        if (/^-?\d+\.\d+$/.test(value))
            return parseFloat(value);
        // String (default)
        return value;
    }
    defineFromS3(uri) {
        const [okBucket, errBucket, bucket] = tryFnSync(() => decodeURIComponent(uri.hostname));
        if (!okBucket) {
            throw new ConnectionStringError('Invalid bucket in connection string', {
                original: errBucket,
                input: uri.hostname
            });
        }
        this.bucket = bucket || 's3db';
        const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
        if (!okUser) {
            throw new ConnectionStringError('Invalid accessKeyId in connection string', {
                original: errUser,
                input: uri.username
            });
        }
        this.accessKeyId = user;
        const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
        if (!okPass) {
            throw new ConnectionStringError('Invalid secretAccessKey in connection string', {
                original: errPass,
                input: uri.password
            });
        }
        this.secretAccessKey = pass;
        this.endpoint = S3_DEFAULT_ENDPOINT;
        if (["/", "", null].includes(uri.pathname)) {
            this.keyPrefix = '';
        }
        else {
            const [, ...subpath] = uri.pathname.split('/');
            this.keyPrefix = [...(subpath || [])].join('/');
        }
    }
    defineFromCustomUri(uri) {
        this.forcePathStyle = true;
        this.endpoint = uri.origin;
        const [okUser, errUser, user] = tryFnSync(() => decodeURIComponent(uri.username));
        if (!okUser) {
            throw new ConnectionStringError('Invalid accessKeyId in connection string', {
                original: errUser,
                input: uri.username
            });
        }
        this.accessKeyId = user;
        const [okPass, errPass, pass] = tryFnSync(() => decodeURIComponent(uri.password));
        if (!okPass) {
            throw new ConnectionStringError('Invalid secretAccessKey in connection string', {
                original: errPass,
                input: uri.password
            });
        }
        this.secretAccessKey = pass;
        if (["/", "", null].includes(uri.pathname)) {
            this.bucket = 's3db';
            this.keyPrefix = '';
        }
        else {
            const [, bucket, ...subpath] = uri.pathname.split('/');
            if (!bucket) {
                this.bucket = 's3db';
            }
            else {
                const [okBucket, errBucket, bucketDecoded] = tryFnSync(() => decodeURIComponent(bucket));
                if (!okBucket) {
                    throw new ConnectionStringError('Invalid bucket in connection string', {
                        original: errBucket,
                        input: bucket
                    });
                }
                this.bucket = bucketDecoded;
            }
            this.keyPrefix = [...(subpath || [])].join('/');
        }
    }
    defineFromFileUri(uri) {
        this.clientType = 'filesystem';
        this.forcePathStyle = true;
        // No credentials needed for filesystem
        this.accessKeyId = undefined;
        this.secretAccessKey = undefined;
        // Parse pathname
        let pathname = uri.pathname || '';
        // Handle Windows paths (file:///C:/path/to/data)
        if (uri.hostname && uri.hostname.match(/^[a-zA-Z]$/)) {
            // Windows drive letter in hostname (file://C:/path)
            pathname = `${uri.hostname}:${pathname}`;
        }
        else if (uri.hostname && uri.hostname !== 'localhost') {
            // UNC path (file://server/share/path)
            pathname = `//${uri.hostname}${pathname}`;
        }
        // Decode URL-encoded characters
        const [okPath, errPath, decodedPath] = tryFnSync(() => decodeURIComponent(pathname));
        if (!okPath) {
            throw new ConnectionStringError('Invalid path in file:// connection string', {
                original: errPath,
                input: pathname
            });
        }
        // Handle empty path
        if (!decodedPath || decodedPath === '/' || decodedPath === '') {
            throw new ConnectionStringError('file:// connection string requires a path', {
                input: uri.href,
                suggestion: 'Use file:///absolute/path or file://./relative/path'
            });
        }
        // Parse path segments: /basePath/bucket/keyPrefix
        const segments = decodedPath.split('/').filter(Boolean);
        if (segments.length === 0) {
            throw new ConnectionStringError('file:// connection string requires a path', {
                input: uri.href,
                suggestion: 'Use file:///absolute/path or file://./relative/path'
            });
        }
        // For relative paths starting with ./ or ../
        if (decodedPath.startsWith('./') || decodedPath.startsWith('../')) {
            this.basePath = path.resolve(decodedPath);
            this.bucket = 's3db';
            this.keyPrefix = '';
        }
        else if (segments.length === 1) {
            this.basePath = path.resolve('/', segments[0]);
            this.bucket = 's3db';
            this.keyPrefix = '';
        }
        else if (segments.length === 2) {
            const [baseSegment, bucketSegment] = segments;
            this.basePath = path.resolve('/', baseSegment);
            this.bucket = bucketSegment;
            this.keyPrefix = '';
        }
        else {
            const [baseSegment, bucketSegment, ...prefixSegments] = segments;
            this.basePath = path.resolve('/', baseSegment);
            this.bucket = bucketSegment;
            this.keyPrefix = prefixSegments.join('/');
        }
        // Set synthetic endpoint for compatibility
        this.endpoint = `file://${this.basePath}`;
        this.region = 'local';
    }
    defineFromMemoryUri(uri) {
        this.clientType = 'memory';
        this.forcePathStyle = true;
        // No credentials needed for memory storage
        this.accessKeyId = undefined;
        this.secretAccessKey = undefined;
        // Parse hostname as bucket (or default to 's3db')
        const bucketFromHost = uri.hostname || '';
        if (bucketFromHost) {
            const [okBucket, , decodedBucket] = tryFnSync(() => decodeURIComponent(bucketFromHost));
            this.bucket = okBucket ? decodedBucket : bucketFromHost;
        }
        else {
            this.bucket = 's3db';
        }
        // Parse pathname as keyPrefix
        if (["/", "", null].includes(uri.pathname)) {
            this.keyPrefix = '';
        }
        else {
            const [, ...subpath] = uri.pathname.split('/');
            const decodedSegments = (subpath || []).map(segment => {
                if (!segment) {
                    return segment;
                }
                const [okSegment, , decodedSegment] = tryFnSync(() => decodeURIComponent(segment));
                return okSegment ? decodedSegment : segment;
            });
            this.keyPrefix = decodedSegments.filter(Boolean).join('/');
        }
        // Set synthetic endpoint for compatibility
        this.endpoint = 'memory://localhost';
        this.region = 'us-east-1';
    }
}

class AdaptiveTuning {
    minConcurrency;
    maxConcurrency;
    targetLatency;
    targetMemoryPercent;
    adjustmentInterval;
    metrics;
    currentConcurrency;
    lastAdjustment;
    intervalId;
    constructor(options = {}) {
        this.minConcurrency = options.minConcurrency || 1;
        this.maxConcurrency = options.maxConcurrency || 100;
        this.targetLatency = options.targetLatency || 200;
        this.targetMemoryPercent = options.targetMemoryPercent || 0.7;
        this.adjustmentInterval = options.adjustmentInterval || 5000;
        this.metrics = {
            latencies: [],
            throughputs: [],
            memoryUsages: [],
            errorRates: [],
            concurrencyHistory: []
        };
        this.currentConcurrency = this.suggestInitial();
        this.lastAdjustment = Date.now();
        this.intervalId = null;
        this.startMonitoring();
    }
    suggestInitial() {
        const totalMemoryMB = os.totalmem() / 1024 / 1024;
        const freeMemoryMB = os.freemem() / 1024 / 1024;
        const usedPercent = (totalMemoryMB - freeMemoryMB) / totalMemoryMB;
        let suggested;
        if (totalMemoryMB < 512) {
            suggested = 2;
        }
        else if (totalMemoryMB < 1024) {
            suggested = 5;
        }
        else if (totalMemoryMB < 2048) {
            suggested = 10;
        }
        else if (totalMemoryMB < 4096) {
            suggested = 20;
        }
        else if (totalMemoryMB < 8192) {
            suggested = 30;
        }
        else {
            suggested = 20;
        }
        if (usedPercent > 0.8) {
            suggested = Math.max(1, Math.floor(suggested * 0.5));
        }
        else if (usedPercent > 0.7) {
            suggested = Math.max(1, Math.floor(suggested * 0.7));
        }
        suggested = Math.min(Math.max(this.minConcurrency, Math.floor(suggested * 0.5)), 20);
        return suggested;
    }
    recordTaskMetrics(task) {
        const memoryUsed = process.memoryUsage().heapUsed / os.totalmem();
        this.metrics.latencies.push(task.latency);
        this.metrics.memoryUsages.push(memoryUsed);
        if (this.metrics.latencies.length > 100) {
            this.metrics.latencies.shift();
            this.metrics.memoryUsages.shift();
        }
        const recentTasks = this.metrics.latencies.filter((_, i) => {
            return i >= this.metrics.latencies.length - 10;
        }).length;
        const windowMs = 1000;
        const throughput = (recentTasks / windowMs) * 1000;
        this.metrics.throughputs.push(throughput);
        if (this.metrics.throughputs.length > 100) {
            this.metrics.throughputs.shift();
        }
    }
    startMonitoring() {
        this.intervalId = setInterval(() => {
            this.adjust();
        }, this.adjustmentInterval);
        if (this.intervalId.unref) {
            this.intervalId.unref();
        }
    }
    adjust() {
        if (this.metrics.latencies.length < 10) {
            return null;
        }
        const avgLatency = this._avg(this.metrics.latencies);
        const avgMemory = this._avg(this.metrics.memoryUsages);
        const avgThroughput = this._avg(this.metrics.throughputs);
        let adjustment = 0;
        let reason = '';
        if (avgMemory > this.targetMemoryPercent) {
            adjustment = -Math.ceil(this.currentConcurrency * 0.2);
            reason = `memory pressure (${(avgMemory * 100).toFixed(1)}%)`;
        }
        else if (avgLatency > this.targetLatency * 1.5) {
            adjustment = -Math.ceil(this.currentConcurrency * 0.1);
            reason = `high latency (${avgLatency.toFixed(0)}ms)`;
        }
        else if (avgLatency < this.targetLatency * 0.5 && avgMemory < this.targetMemoryPercent * 0.8) {
            adjustment = Math.ceil(this.currentConcurrency * 0.2);
            reason = 'good performance, scaling up';
        }
        else if (avgLatency > this.targetLatency * 1.2) {
            adjustment = -Math.ceil(this.currentConcurrency * 0.05);
            reason = 'slight latency increase';
        }
        if (adjustment !== 0) {
            const newConcurrency = Math.max(this.minConcurrency, Math.min(this.maxConcurrency, this.currentConcurrency + adjustment));
            if (newConcurrency !== this.currentConcurrency) {
                const oldConcurrency = this.currentConcurrency;
                this.currentConcurrency = newConcurrency;
                this.lastAdjustment = Date.now();
                this.metrics.concurrencyHistory.push({
                    timestamp: Date.now(),
                    old: oldConcurrency,
                    new: newConcurrency,
                    reason,
                    metrics: {
                        avgLatency,
                        avgMemory,
                        avgThroughput
                    }
                });
                if (this.metrics.concurrencyHistory.length > 100) {
                    this.metrics.concurrencyHistory.shift();
                }
                return newConcurrency;
            }
        }
        return null;
    }
    getConcurrency() {
        return this.currentConcurrency;
    }
    getMetrics() {
        if (this.metrics.latencies.length === 0) {
            return {
                current: this.currentConcurrency,
                avgLatency: 0,
                avgMemory: 0,
                avgThroughput: 0,
                history: []
            };
        }
        return {
            current: this.currentConcurrency,
            avgLatency: this._avg(this.metrics.latencies),
            avgMemory: this._avg(this.metrics.memoryUsages),
            avgThroughput: this._avg(this.metrics.throughputs),
            history: this.metrics.concurrencyHistory.slice(-10)
        };
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    _avg(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
}

class SignatureStats {
    alpha;
    maxEntries;
    entries;
    constructor(options = {}) {
        this.alpha = typeof options.alpha === 'number' ? options.alpha : 0.2;
        this.maxEntries = Math.max(1, options.maxEntries ?? 256);
        this.entries = new Map();
    }
    record(signature, metrics = {}) {
        if (!signature) {
            return;
        }
        const entry = this.entries.get(signature) || {
            signature,
            count: 0,
            avgQueueWait: 0,
            avgExecution: 0,
            successRate: 1
        };
        entry.count++;
        entry.avgQueueWait = this._mix(entry.avgQueueWait, metrics.queueWait ?? 0);
        entry.avgExecution = this._mix(entry.avgExecution, metrics.execution ?? 0);
        entry.successRate = this._mix(entry.successRate, metrics.success === false ? 0 : 1);
        this.entries.set(signature, entry);
        if (this.entries.size > this.maxEntries) {
            const oldestKey = this.entries.keys().next().value;
            if (oldestKey) {
                this.entries.delete(oldestKey);
            }
        }
    }
    snapshot(limit = 10) {
        if (this.entries.size === 0) {
            return [];
        }
        const sorted = Array.from(this.entries.values()).sort((a, b) => {
            if (a.avgExecution === b.avgExecution) {
                return b.count - a.count;
            }
            return b.avgExecution - a.avgExecution;
        });
        return sorted.slice(0, limit).map((entry) => ({
            signature: entry.signature,
            count: entry.count,
            avgQueueWait: Number(entry.avgQueueWait.toFixed(2)),
            avgExecution: Number(entry.avgExecution.toFixed(2)),
            successRate: Number(entry.successRate.toFixed(2))
        }));
    }
    reset() {
        this.entries.clear();
    }
    _mix(current, incoming) {
        if (current === 0)
            return incoming;
        return current * (1 - this.alpha) + incoming * this.alpha;
    }
}

class FifoTaskQueue {
    buffer;
    mask;
    head;
    tail;
    constructor(capacity = 32) {
        const size = this._normalizeCapacity(capacity);
        this.buffer = new Array(size);
        this.mask = size - 1;
        this.head = 0;
        this.tail = 0;
    }
    get length() {
        return this.tail - this.head;
    }
    enqueue(value) {
        if (this.length >= this.buffer.length) {
            this._grow();
        }
        const index = this.tail & this.mask;
        this.buffer[index] = value;
        this.tail++;
    }
    dequeue() {
        if (this.head === this.tail) {
            return null;
        }
        const index = this.head & this.mask;
        const value = this.buffer[index];
        this.buffer[index] = undefined;
        this.head++;
        if (this.head === this.tail) {
            this.head = 0;
            this.tail = 0;
        }
        return value;
    }
    flush(callback) {
        if (typeof callback === 'function') {
            for (let i = this.head; i < this.tail; i++) {
                const value = this.buffer[i & this.mask];
                if (value !== undefined) {
                    callback(value);
                }
            }
        }
        this.clear();
    }
    clear() {
        if (this.head !== this.tail) {
            for (let i = this.head; i < this.tail; i++) {
                this.buffer[i & this.mask] = undefined;
            }
        }
        this.head = 0;
        this.tail = 0;
    }
    setAgingMultiplier(_multiplier) {
        // Compatibility no-op for TasksPool.
    }
    toArray() {
        const len = this.length;
        if (len === 0) {
            return [];
        }
        const snapshot = new Array(len);
        for (let i = 0; i < len; i++) {
            snapshot[i] = this.buffer[(this.head + i) & this.mask];
        }
        return snapshot;
    }
    _grow() {
        const newSize = this.buffer.length * 2;
        const next = new Array(newSize);
        const len = this.length;
        for (let i = 0; i < len; i++) {
            next[i] = this.buffer[(this.head + i) & this.mask];
        }
        this.buffer = next;
        this.mask = newSize - 1;
        this.head = 0;
        this.tail = len;
    }
    _normalizeCapacity(value) {
        let size = 8;
        const normalized = Number.isFinite(value) && value > 0 ? Math.ceil(value) : size;
        const target = Math.max(size, normalized);
        while (size < target) {
            size <<= 1;
        }
        return size;
    }
}

class PriorityTaskQueue {
    heap;
    counter;
    agingMs;
    maxAgingBoost;
    agingMultiplier;
    _agingEnabled;
    constructor(options = {}) {
        this.heap = [];
        this.counter = 0;
        this.agingMs = options.agingMs ?? 0;
        this.maxAgingBoost = options.maxAgingBoost ?? 0;
        this.agingMultiplier = 1;
        this._agingEnabled = this.agingMs > 0 && this.maxAgingBoost > 0;
    }
    get length() {
        return this.heap.length;
    }
    enqueue(task) {
        const node = {
            task,
            priority: task.priority || 0,
            order: this.counter++
        };
        if (this._agingEnabled) {
            node.enqueuedAt = Date.now();
        }
        this.heap.push(node);
        this._bubbleUp(this.heap.length - 1);
    }
    dequeue() {
        if (this.heap.length === 0) {
            return null;
        }
        const topNode = this.heap[0];
        const lastNode = this.heap.pop();
        if (this.heap.length > 0 && lastNode) {
            this.heap[0] = lastNode;
            this._bubbleDown(0);
        }
        return topNode.task;
    }
    flush(callback) {
        if (typeof callback === 'function') {
            for (const node of this.heap) {
                callback(node.task);
            }
        }
        this.clear();
    }
    clear() {
        this.heap.length = 0;
    }
    setAgingMultiplier(multiplier) {
        if (!this._agingEnabled) {
            return;
        }
        if (typeof multiplier !== 'number' || Number.isNaN(multiplier)) {
            return;
        }
        this.agingMultiplier = Math.min(4, Math.max(0.25, multiplier));
    }
    _bubbleUp(index) {
        const now = this._agingTimestamp();
        const agingBase = this._agingBase();
        while (index > 0) {
            const parentIndex = (index - 1) >> 1;
            if (this._isHigherPriority(parentIndex, index, now, agingBase)) {
                break;
            }
            this._swap(index, parentIndex);
            index = parentIndex;
        }
    }
    _bubbleDown(index) {
        const length = this.heap.length;
        if (length === 0) {
            return;
        }
        const now = this._agingTimestamp();
        const agingBase = this._agingBase();
        while (true) {
            const left = (index << 1) + 1;
            const right = left + 1;
            let largest = index;
            if (left < length && this._isHigherPriority(left, largest, now, agingBase)) {
                largest = left;
            }
            if (right < length && this._isHigherPriority(right, largest, now, agingBase)) {
                largest = right;
            }
            if (largest === index) {
                break;
            }
            this._swap(index, largest);
            index = largest;
        }
    }
    _isHigherPriority(indexA, indexB, now, agingBase) {
        const heap = this.heap;
        const nodeA = heap[indexA];
        const nodeB = heap[indexB];
        if (!nodeA)
            return false;
        if (!nodeB)
            return true;
        const priorityA = this._priorityValue(nodeA, now, agingBase);
        const priorityB = this._priorityValue(nodeB, now, agingBase);
        if (priorityA === priorityB) {
            return nodeA.order < nodeB.order;
        }
        return priorityA > priorityB;
    }
    _priorityValue(node, now, agingBase) {
        if (!this._agingEnabled || !agingBase) {
            return node.priority;
        }
        const waited = Math.max(0, now - (node.enqueuedAt || 0));
        if (waited <= 0) {
            return node.priority;
        }
        const bonus = Math.min(this.maxAgingBoost, waited / agingBase);
        return node.priority + bonus;
    }
    _swap(i, j) {
        const tmp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = tmp;
    }
    _agingTimestamp() {
        return this._agingEnabled ? Date.now() : 0;
    }
    _agingBase() {
        if (!this._agingEnabled) {
            return 0;
        }
        const base = this.agingMs * this.agingMultiplier;
        if (!base || !Number.isFinite(base)) {
            return 0;
        }
        return base;
    }
}

function getFnName(fn) {
    if (typeof fn === 'function' && fn.name) {
        return fn.name;
    }
    return 'anonymous';
}
function extractLengthHint(item) {
    if (item == null)
        return undefined;
    if (typeof item === 'string' || Array.isArray(item)) {
        return item.length;
    }
    if (typeof item === 'object') {
        const obj = item;
        if (typeof obj.length === 'number') {
            return obj.length;
        }
        if (typeof obj.size === 'number') {
            return obj.size;
        }
    }
    return undefined;
}
function deriveSignature(fn, metadata = {}, signatureOverride, priority = 0) {
    if (signatureOverride)
        return signatureOverride;
    if (metadata.signature)
        return metadata.signature;
    const fnName = getFnName(fn);
    const hintSource = metadata.item ??
        metadata.items ??
        metadata.payload ??
        metadata.body ??
        metadata.data ??
        metadata.value;
    const lengthHint = metadata.itemLength ??
        metadata.length ??
        (typeof metadata.size === 'number' ? metadata.size : undefined) ??
        extractLengthHint(hintSource);
    const hint = lengthHint != null ? `${fnName}:${lengthHint}` : fnName;
    return `${hint}:p${priority}`;
}

const INTERNAL_DEFER = '__taskExecutorInternalDefer';
class MemorySampler {
    interval;
    lastSampleTime;
    lastSample;
    constructor(interval = 100) {
        this.interval = Math.max(25, interval);
        this.lastSampleTime = 0;
        this.lastSample = { heapUsed: 0 };
        this.sampleNow();
    }
    snapshot() {
        return this.lastSample.heapUsed;
    }
    maybeSample() {
        if (Date.now() - this.lastSampleTime >= this.interval) {
            return this.sampleNow();
        }
        return this.snapshot();
    }
    sampleNow() {
        this.lastSample = process.memoryUsage();
        this.lastSampleTime = Date.now();
        return this.lastSample.heapUsed;
    }
}
class RollingMetrics {
    size;
    entries;
    index;
    length;
    sums;
    errorCount;
    constructor(size = 256) {
        this.size = size;
        this.entries = new Array(size);
        this.index = 0;
        this.length = 0;
        this.sums = {
            queueWait: 0,
            execution: 0,
            retries: 0
        };
        this.errorCount = 0;
    }
    push(entry) {
        const old = this.entries[this.index];
        if (old) {
            this.sums.queueWait -= old.queueWait;
            this.sums.execution -= old.execution;
            this.sums.retries -= old.retries;
            if (!old.success) {
                this.errorCount--;
            }
        }
        this.entries[this.index] = entry;
        this.index = (this.index + 1) % this.size;
        if (this.length < this.size) {
            this.length++;
        }
        this.sums.queueWait += entry.queueWait;
        this.sums.execution += entry.execution;
        this.sums.retries += entry.retries;
        if (!entry.success) {
            this.errorCount++;
        }
    }
    snapshot() {
        if (this.length === 0) {
            return {
                sampleSize: 0,
                avgQueueWait: 0,
                avgExecution: 0,
                avgRetries: 0,
                errorRate: 0
            };
        }
        return {
            sampleSize: this.length,
            avgQueueWait: this.sums.queueWait / this.length,
            avgExecution: this.sums.execution / this.length,
            avgRetries: this.sums.retries / this.length,
            errorRate: this.errorCount / this.length
        };
    }
}
class RollingWindow {
    windowMs;
    events;
    constructor(windowMs = 1000) {
        this.windowMs = Math.max(250, windowMs);
        this.events = [];
    }
    record(timestamp = Date.now(), success = true) {
        this.events.push({ timestamp, success });
        this._prune();
    }
    snapshot() {
        this._prune();
        const count = this.events.length;
        if (count === 0) {
            return {
                windowMs: this.windowMs,
                throughputPerSec: 0,
                successRate: 1
            };
        }
        const now = Date.now();
        const effectiveWindow = Math.max(1, Math.min(this.windowMs, now - this.events[0].timestamp));
        const throughputPerSec = (count / effectiveWindow) * 1000;
        const successCount = this.events.filter((e) => e.success).length;
        return {
            windowMs: this.windowMs,
            throughputPerSec,
            successRate: successCount / count
        };
    }
    _prune() {
        const cutoff = Date.now() - this.windowMs;
        while (this.events.length > 0 && this.events[0].timestamp < cutoff) {
            this.events.shift();
        }
    }
}
class TasksPool extends EventEmitter.EventEmitter {
    features;
    lightMode;
    bareMode;
    autoConcurrency;
    retries;
    retryDelay;
    timeout;
    retryableErrors;
    retryStrategy;
    priorityConfig;
    queue;
    active;
    paused;
    stopped;
    stats;
    rollingMetrics;
    monitoring;
    taskMetrics;
    memorySampler;
    rollingWindow;
    signatureStats;
    tuner;
    autoTuningConfig;
    _configuredConcurrency;
    _effectiveConcurrency;
    _drainInProgress;
    _pendingDrain;
    _activeWaiters;
    _lightActiveTasks;
    _monitoringState;
    _lastTunedConcurrency;
    constructor(options = {}) {
        super();
        const requestedRetries = options.retries ?? 3;
        const monitoringRequested = options.monitoring?.enabled ?? true;
        const requestedMonitoringMode = options.monitoring?.mode;
        const requestedProfile = options.features?.profile;
        const needsRichProfile = requestedRetries > 0;
        let profile = requestedProfile || (needsRichProfile ? 'balanced' : 'light');
        const defaultMonitoringMode = options.monitoring?.collectMetrics || requestedMonitoringMode === 'detailed'
            ? 'detailed'
            : 'passive';
        const monitoringMode = monitoringRequested
            ? requestedMonitoringMode || defaultMonitoringMode
            : 'light';
        if (profile === 'light' && monitoringRequested && monitoringMode !== 'passive') {
            profile = 'balanced';
        }
        this.features = {
            profile,
            emitEvents: options.features?.emitEvents ?? profile !== 'bare',
            signatureInsights: options.features?.signatureInsights ?? true
        };
        this.lightMode = this.features.profile === 'light' || this.features.profile === 'bare';
        this.bareMode = this.features.profile === 'bare';
        const tunerInstance = options.autoTuning?.instance;
        const autoTuningRequested = options.autoTuning?.enabled || tunerInstance;
        const requestedConcurrency = options.concurrency ?? 10;
        this.autoConcurrency = requestedConcurrency === 'auto';
        this._configuredConcurrency = this.autoConcurrency
            ? 'auto'
            : this._normalizeConcurrency(requestedConcurrency);
        this._effectiveConcurrency = this.autoConcurrency
            ? this._defaultAutoConcurrency()
            : this._configuredConcurrency;
        this.retries = requestedRetries;
        this.retryDelay = options.retryDelay || 1000;
        this.timeout = options.timeout ?? 30000;
        this.retryableErrors = options.retryableErrors || [
            'NetworkingError',
            'TimeoutError',
            'RequestTimeout',
            'ServiceUnavailable',
            'SlowDown',
            'RequestLimitExceeded'
        ];
        this.retryStrategy = {
            jitter: options.retryStrategy?.jitter ?? true,
            minDelay: options.retryStrategy?.minDelay ?? 50,
            maxDelay: options.retryStrategy?.maxDelay ?? 30000,
            clampDelay: options.retryStrategy?.clampDelay ?? 250,
            pressureClampThreshold: options.retryStrategy?.pressureClampThreshold ?? 4,
            pressureSkipThreshold: options.retryStrategy?.pressureSkipThreshold ?? 10,
            latencyTarget: options.retryStrategy?.latencyTarget ?? 2000
        };
        this.priorityConfig = {
            agingMs: options.queue?.agingMs ?? 250,
            maxAgingBoost: options.queue?.maxAgingBoost ?? 3,
            latencyTarget: options.queue?.latencyTarget ?? 500
        };
        this.queue = this.lightMode
            ? new FifoTaskQueue()
            : new PriorityTaskQueue(this.priorityConfig);
        this.active = new Map();
        this.paused = false;
        this.stopped = false;
        this._drainInProgress = false;
        this._pendingDrain = false;
        this._activeWaiters = [];
        this.stats = {
            queueSize: 0,
            activeCount: 0,
            processedCount: 0,
            errorCount: 0,
            retryCount: 0
        };
        this.rollingMetrics = new RollingMetrics(256);
        this._lightActiveTasks = 0;
        this._monitoringState = {
            lastExport: 0,
            lastProcessed: 0
        };
        const monitoringEnabled = !this.bareMode && monitoringRequested;
        const collectMetricsRequested = options.monitoring?.collectMetrics ?? false;
        const collectMetrics = monitoringEnabled && (collectMetricsRequested || monitoringMode === 'detailed');
        this.monitoring = {
            enabled: monitoringEnabled,
            mode: monitoringMode,
            collectMetrics,
            sampleRate: this._normalizeSampleRate(options.monitoring?.sampleRate ?? 0),
            telemetryRate: this._normalizeSampleRate(options.monitoring?.telemetrySampleRate ??
                (collectMetrics || autoTuningRequested ? 1 : 0.2)),
            sampleInterval: options.monitoring?.sampleInterval ?? 100,
            rollingWindowMs: options.monitoring?.rollingWindowMs ?? 1000,
            reportInterval: options.monitoring?.reportInterval ?? 1000,
            signatureSampleLimit: Math.max(1, options.monitoring?.signatureSampleLimit ?? 8),
            exporter: typeof options.monitoring?.exporter === 'function' ? options.monitoring.exporter : null
        };
        this.taskMetrics = new Map();
        this.memorySampler =
            this.monitoring.collectMetrics &&
                this.monitoring.sampleRate > 0 &&
                this.monitoring.mode !== 'light'
                ? new MemorySampler(this.monitoring.sampleInterval)
                : null;
        this.rollingWindow = this.monitoring.collectMetrics
            ? new RollingWindow(this.monitoring.rollingWindowMs)
            : null;
        this.signatureStats = this.features.signatureInsights
            ? new SignatureStats({
                alpha: options.monitoring?.signatureAlpha,
                maxEntries: options.monitoring?.signatureMaxEntries
            })
            : null;
        this.tuner = null;
        this._lastTunedConcurrency = null;
        if (!this.bareMode && autoTuningRequested) {
            this.autoTuningConfig = options.autoTuning;
            this.tuner = tunerInstance || new AdaptiveTuning(options.autoTuning);
            const tuned = this.tuner.getConcurrency();
            if (typeof tuned === 'number' && tuned > 0) {
                this.setConcurrency(tuned);
                this._lastTunedConcurrency = tuned;
            }
        }
    }
    _normalizeConcurrency(concurrency) {
        if (typeof concurrency === 'number' && concurrency >= 1) {
            return concurrency;
        }
        return 10;
    }
    get concurrency() {
        return this._configuredConcurrency;
    }
    get effectiveConcurrency() {
        return this._effectiveConcurrency;
    }
    _defaultAutoConcurrency() {
        try {
            const cpuCount = Math.max(1, os.cpus()?.length || 0);
            return Math.min(Math.max(cpuCount, 4), 20);
        }
        catch {
            return 10;
        }
    }
    _normalizeSampleRate(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return 1;
        }
        if (value <= 0)
            return 0;
        if (value >= 1)
            return 1;
        return value;
    }
    _shouldSampleMetrics() {
        if (!this.monitoring.collectMetrics) {
            return false;
        }
        if (this.monitoring.sampleRate <= 0) {
            return false;
        }
        if (this.monitoring.sampleRate >= 1) {
            return true;
        }
        return Math.random() < this.monitoring.sampleRate;
    }
    _shouldCaptureAttemptTimeline(taskCollectMetrics) {
        if (taskCollectMetrics) {
            return true;
        }
        if (this.monitoring.collectMetrics || this.monitoring.mode === 'detailed') {
            return true;
        }
        return false;
    }
    setTuner(tuner) {
        this.tuner = tuner;
        if (this.autoConcurrency) {
            this._effectiveConcurrency = tuner.getConcurrency();
            this.processNext();
            this._lastTunedConcurrency = this._effectiveConcurrency;
        }
    }
    async enqueue(fn, options = {}) {
        let internalDefer = false;
        if (options && options[INTERNAL_DEFER]) {
            internalDefer = true;
            options = { ...options };
            delete options[INTERNAL_DEFER];
        }
        const collectMetrics = this._shouldSampleMetrics();
        const captureAttemptTimeline = this._shouldCaptureAttemptTimeline(collectMetrics);
        const taskMetadata = {
            ...(options.metadata || {})
        };
        const task = {
            id: nanoid.nanoid(),
            fn: fn,
            priority: options.priority || 0,
            retries: options.retries ?? this.retries,
            timeout: options.timeout ?? this.timeout,
            metadata: taskMetadata,
            attemptCount: 0,
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            collectMetrics,
            timings: {
                queueWait: null,
                execution: null,
                retryDelays: captureAttemptTimeline ? [] : null,
                retryDelayTotal: 0,
                total: null,
                failedAttempts: captureAttemptTimeline ? [] : null
            },
            controller: null,
            performance: {
                heapUsedBefore: null,
                heapUsedAfter: null,
                heapDelta: null
            },
            signature: '',
            promise: null,
            resolve: null,
            reject: null
        };
        task.signature = deriveSignature(fn, taskMetadata, options.signature, task.priority);
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        task.promise = promise;
        task.resolve = (result) => {
            this._recordTaskCompletion(task, result, null);
            resolve(result);
        };
        task.reject = (error) => {
            this._recordTaskCompletion(task, null, error);
            reject(error);
        };
        this._insertByPriority(task);
        this.stats.queueSize = this.queue.length;
        if (!internalDefer) {
            this.processNext();
        }
        return promise;
    }
    async addBatch(fns, options = {}) {
        const errors = [];
        const batchId = nanoid.nanoid();
        const promises = fns.map((fn, index) => {
            const taskOptions = {
                priority: options.priority,
                retries: options.retries,
                timeout: options.timeout,
                metadata: { ...options.metadata, batchId, index },
                [INTERNAL_DEFER]: true
            };
            return this.enqueue(fn, taskOptions)
                .then((result) => {
                if (options.onItemComplete) {
                    options.onItemComplete(result, index);
                }
                return result;
            })
                .catch((error) => {
                errors.push({ error, index });
                if (options.onItemError) {
                    options.onItemError(error, index);
                }
                throw error;
            });
        });
        if (promises.length > 0) {
            this.processNext();
        }
        const settled = await Promise.allSettled(promises);
        const orderedResults = settled.map((s) => {
            if (s.status === 'fulfilled')
                return s.value;
            return null;
        });
        return { results: orderedResults, errors, batchId };
    }
    /**
     * Process an array of items with controlled concurrency.
     * This is a convenience method that mimics PromisePool.for().process() API.
     *
     * @example
     * const { results, errors } = await TasksPool.map(
     *   users,
     *   async (user) => fetchUserData(user.id),
     *   { concurrency: 10 }
     * );
     */
    static async map(items, processor, options = {}) {
        const { concurrency = 10, onItemComplete, onItemError } = options;
        const pool = new TasksPool({
            concurrency,
            features: { profile: 'bare', emitEvents: false }
        });
        const fns = items.map((item, index) => async () => processor(item, index));
        const batchOptions = {
            onItemComplete: onItemComplete,
            onItemError: onItemError
                ? (error, index) => onItemError(error, items[index], index)
                : undefined
        };
        const { results, errors } = await pool.addBatch(fns, batchOptions);
        await pool.destroy();
        return {
            results: results.filter((r) => r !== null),
            errors: errors.map(e => ({ error: e.error, item: items[e.index], index: e.index }))
        };
    }
    processNext() {
        if (this.lightMode) {
            this._processLightQueue();
            return;
        }
        if (this.paused || this.stopped || this.queue.length === 0) {
            this._pendingDrain = false;
            return;
        }
        if (this._drainInProgress) {
            this._pendingDrain = true;
            return;
        }
        this._drainInProgress = true;
        do {
            this._pendingDrain = false;
            this._drainQueue();
        } while (this._pendingDrain && !this.paused && !this.stopped && this.queue.length > 0);
        this._drainInProgress = false;
    }
    _drainQueue() {
        while (this._canProcessNext()) {
            const task = this.queue.dequeue();
            if (!task)
                break;
            this.stats.queueSize = this.queue.length;
            const taskPromise = this._executeTaskWithRetry(task);
            this.active.set(taskPromise, task);
            this.stats.activeCount = this.active.size;
            this._safeEmit('pool:taskStarted', task);
            taskPromise
                .then((result) => {
                this.active.delete(taskPromise);
                this.stats.activeCount = this.active.size;
                this.stats.processedCount++;
                task.resolve(result);
                this._safeEmit('pool:taskCompleted', task, result);
                this._applyTunedConcurrency();
            })
                .catch((error) => {
                this.active.delete(taskPromise);
                this.stats.activeCount = this.active.size;
                this.stats.errorCount++;
                task.reject(error);
                this._safeEmit('pool:taskError', task, error);
                this._applyTunedConcurrency();
            })
                .finally(() => {
                this._maybeExportMonitoringSample('task');
                this._notifyActiveWaiters();
                this.processNext();
                if (this.active.size === 0 && this.queue.length === 0) {
                    this._safeEmit('pool:drained');
                }
            });
        }
    }
    _canProcessNext() {
        return (!this.paused &&
            !this.stopped &&
            this.queue.length > 0 &&
            this._currentActiveCount() < this.effectiveConcurrency);
    }
    _processLightQueue() {
        if (this.paused || this.stopped) {
            return;
        }
        if (this.bareMode) {
            this._processBareQueue();
            return;
        }
        while (this.queue.length > 0 && this._lightActiveTasks < this.effectiveConcurrency) {
            const task = this.queue.dequeue();
            if (!task)
                break;
            this.stats.queueSize = this.queue.length;
            this._lightActiveTasks++;
            this.stats.activeCount = this._lightActiveTasks;
            this._safeEmit('pool:taskStarted', task);
            const taskPromise = this._executeTaskWithRetry(task);
            taskPromise
                .then((result) => {
                this.stats.processedCount++;
                task.resolve(result);
                this._safeEmit('pool:taskCompleted', task, result);
                this._applyTunedConcurrency();
            })
                .catch((error) => {
                this.stats.errorCount++;
                task.reject(error);
                this._safeEmit('pool:taskError', task, error);
                this._applyTunedConcurrency();
            })
                .finally(() => {
                this._lightActiveTasks--;
                this.stats.activeCount = this._lightActiveTasks;
                this._notifyActiveWaiters();
                this._maybeExportMonitoringSample('task');
                if (this._lightActiveTasks === 0 && this.queue.length === 0) {
                    this._safeEmit('pool:drained');
                }
                else {
                    this._processLightQueue();
                }
            });
        }
    }
    _processBareQueue() {
        while (this.queue.length > 0 && this._lightActiveTasks < this.effectiveConcurrency) {
            const task = this.queue.dequeue();
            if (!task)
                break;
            this._lightActiveTasks++;
            const taskPromise = this._executeBareTask(task);
            taskPromise
                .then((result) => {
                task.resolve(result);
                this._applyTunedConcurrency();
            })
                .catch((error) => {
                task.reject(error);
                this._applyTunedConcurrency();
            })
                .finally(() => {
                this._lightActiveTasks--;
                this._notifyActiveWaiters();
                if (this._lightActiveTasks === 0 && this.queue.length === 0) {
                    this._safeEmit('pool:drained');
                }
                else {
                    this._processBareQueue();
                }
            });
        }
    }
    async _executeTaskWithRetry(task) {
        if (this.bareMode || (task.retries === 0 && !this._shouldEnforceTimeout(task.timeout))) {
            return await this._runSingleAttempt(task);
        }
        let lastError;
        for (let attempt = 0; attempt <= task.retries; attempt++) {
            task.attemptCount = attempt + 1;
            if (attempt === 0) {
                task.startedAt = Date.now();
                task.timings.queueWait = task.startedAt - task.createdAt;
            }
            try {
                const result = await this._runSingleAttempt(task);
                return result;
            }
            catch (error) {
                lastError = error;
                if (task.timings.failedAttempts) {
                    task.timings.failedAttempts.push({
                        attempt: attempt + 1,
                        duration: task.timings.execution || 0,
                        error: error.message
                    });
                }
                const isRetryable = this._isErrorRetryable(error);
                const hasRetriesLeft = attempt < task.retries;
                if (isRetryable && hasRetriesLeft) {
                    this.stats.retryCount++;
                    this._safeEmit('pool:taskRetry', task, attempt + 1);
                    const delayMs = this._computeRetryDelay(task, attempt, error);
                    if (delayMs == null) {
                        throw error;
                    }
                    const delayStartTime = Date.now();
                    const delayController = typeof AbortController !== 'undefined' ? new AbortController() : null;
                    task.delayController = delayController;
                    await this._sleep(delayMs, delayController?.signal);
                    const delayEndTime = Date.now();
                    const retryDuration = delayEndTime - delayStartTime;
                    if (task.timings.retryDelays) {
                        task.timings.retryDelays.push(retryDuration);
                    }
                    task.timings.retryDelayTotal = (task.timings.retryDelayTotal || 0) + retryDuration;
                    task.delayController = null;
                }
                else {
                    throw error;
                }
            }
            finally {
                task.controller = null;
                task.delayController = null;
            }
        }
        throw lastError;
    }
    async _runSingleAttempt(task) {
        if (typeof task.startedAt !== 'number') {
            task.startedAt = Date.now();
            task.timings.queueWait = task.startedAt - task.createdAt;
        }
        if (task.collectMetrics && this.memorySampler) {
            task.performance.heapUsedBefore = this._readHeapUsage('before');
        }
        const controller = this._shouldEnforceTimeout(task.timeout) && typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;
        task.controller = controller || null;
        const attemptStartTime = Date.now();
        const context = this._buildTaskContext(task, controller);
        const executionPromise = task.fn(context);
        const result = this._shouldEnforceTimeout(task.timeout)
            ? await this._executeWithTimeout(executionPromise, task.timeout, task, controller)
            : await executionPromise;
        const attemptEndTime = Date.now();
        task.timings.execution = attemptEndTime - attemptStartTime;
        if (task.collectMetrics && this.memorySampler) {
            task.performance.heapUsedAfter = this._readHeapUsage('after');
            task.performance.heapDelta = this._computeHeapDelta(task.performance.heapUsedBefore, task.performance.heapUsedAfter);
        }
        task.controller = null;
        return result;
    }
    async _executeBareTask(task) {
        return await this._runSingleAttempt(task);
    }
    async _executeWithTimeout(promise, timeout, task, controller) {
        let timerId;
        const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => {
                const timeoutError = new Error(`Task ${task.id} timed out after ${timeout}ms`);
                timeoutError.name = 'TimeoutError';
                timeoutError.code = 'EOPERATIONS_TIMEOUT';
                if (controller && typeof controller.abort === 'function') {
                    controller.abort(timeoutError);
                }
                reject(timeoutError);
            }, timeout);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        }
        finally {
            clearTimeout(timerId);
        }
    }
    _isErrorRetryable(error) {
        if (this.retryableErrors.length === 0) {
            return true;
        }
        return this.retryableErrors.some((errorType) => {
            return (error.name === errorType ||
                error.code === errorType ||
                error.constructor.name === errorType);
        });
    }
    _insertByPriority(task) {
        this.queue.enqueue(task);
    }
    _recordTaskCompletion(task, result, error) {
        task.completedAt = Date.now();
        task.timings.total = task.completedAt - task.createdAt;
        const totalRetryDelay = task.timings.retryDelays
            ? task.timings.retryDelays.reduce((a, b) => a + b, 0)
            : task.timings.retryDelayTotal || 0;
        task.timings.overhead = task.timings.total - (task.timings.execution || 0) - totalRetryDelay;
        if (this.tuner?.recordTaskMetrics) {
            try {
                this.tuner.recordTaskMetrics({
                    latency: task.timings.execution || 0,
                    queueWait: task.timings.queueWait ?? 0,
                    success: !error,
                    retries: task.attemptCount - 1,
                    heapDelta: task.performance.heapDelta || 0
                });
            }
            catch (tunerError) {
                this._safeEmit('tuner:error', tunerError);
            }
        }
        if (this.monitoring.collectMetrics && task.collectMetrics) {
            this._storeTaskMetrics(task, error);
        }
        if (this.signatureStats) {
            this.signatureStats.record(task.signature, {
                queueWait: task.timings.queueWait || 0,
                execution: task.timings.execution || 0,
                success: !error
            });
        }
        if (this.monitoring.enabled) {
            this._safeEmit('pool:taskMetrics', {
                taskId: task.id,
                timings: task.timings,
                performance: task.performance,
                metadata: task.metadata
            });
        }
        this._recordRollingMetrics(task, error);
    }
    _storeTaskMetrics(task, error) {
        const timingsSnapshot = {
            ...task.timings,
            retryDelays: task.timings.retryDelays ? task.timings.retryDelays.slice(0) : [],
            failedAttempts: task.timings.failedAttempts
                ? task.timings.failedAttempts.map((attempt) => ({ ...attempt }))
                : []
        };
        const performanceSnapshot = task.performance
            ? { ...task.performance }
            : { heapUsedBefore: null, heapUsedAfter: null, heapDelta: null };
        this.taskMetrics.set(task.id, {
            id: task.id,
            metadata: task.metadata,
            timings: timingsSnapshot,
            performance: performanceSnapshot,
            attemptCount: task.attemptCount,
            createdAt: task.createdAt,
            startedAt: task.startedAt,
            completedAt: task.completedAt,
            success: !error
        });
        if (this.taskMetrics.size > 1000) {
            const oldestKey = this.taskMetrics.keys().next().value;
            if (oldestKey) {
                this.taskMetrics.delete(oldestKey);
            }
        }
    }
    _recordRollingMetrics(task, error) {
        const entry = {
            queueWait: task.timings.queueWait || 0,
            execution: task.timings.execution || 0,
            retries: (task.attemptCount || 1) - 1,
            success: !error
        };
        this.rollingMetrics?.push(entry);
        this.rollingWindow?.record(task.completedAt || Date.now(), entry.success);
        this._syncQueueAging();
    }
    async pause() {
        this.paused = true;
        while (this.active.size > 0) {
            await this._waitForActive();
        }
        this._safeEmit('pool:paused');
    }
    resume() {
        this.paused = false;
        this.processNext();
        this._safeEmit('pool:resumed');
    }
    stop() {
        this.stopped = true;
        this.queue.flush((task) => {
            task.reject(new Error('Task cancelled by stop()'));
        });
        this.stats.queueSize = this.queue.length;
        this.active.forEach((task) => {
            if (task.controller && typeof task.controller.abort === 'function') {
                task.controller.abort(new Error('Task cancelled by stop()'));
            }
            if (task.delayController && typeof task.delayController.abort === 'function') {
                task.delayController.abort(new Error('Task cancelled by stop()'));
            }
        });
        this._safeEmit('pool:stopped');
        if (this.tuner?.stop) {
            this.tuner.stop();
        }
    }
    async drain() {
        while (this.queue.length > 0 || this._currentActiveCount() > 0) {
            await this._waitForActive();
        }
        this._safeEmit('pool:drained');
        this._maybeExportMonitoringSample('drain', true);
    }
    async _waitForActive() {
        if (this._currentActiveCount() === 0)
            return;
        await new Promise((resolve) => {
            this._activeWaiters.push(resolve);
        });
    }
    _notifyActiveWaiters() {
        if (this._activeWaiters.length === 0) {
            return;
        }
        const waiters = this._activeWaiters;
        this._activeWaiters = [];
        for (const resolve of waiters) {
            resolve();
        }
    }
    setConcurrency(n) {
        if (n === 'auto') {
            this.autoConcurrency = true;
            this._configuredConcurrency = 'auto';
            this._effectiveConcurrency = this._defaultAutoConcurrency();
            this.processNext();
            return;
        }
        if (typeof n !== 'number' || n < 1) {
            throw new Error('Concurrency must be >= 1');
        }
        const normalized = this._normalizeConcurrency(n);
        this.autoConcurrency = false;
        this._configuredConcurrency = normalized;
        this._effectiveConcurrency = normalized;
        this.processNext();
    }
    getConcurrency() {
        return this.concurrency;
    }
    getStats() {
        return {
            ...this.stats,
            queueSize: this.queue.length,
            activeCount: this._currentActiveCount(),
            concurrency: this.concurrency,
            effectiveConcurrency: this.effectiveConcurrency,
            paused: this.paused,
            stopped: this.stopped,
            rolling: this.getRollingMetrics()
        };
    }
    getTaskMetrics(taskId) {
        return this.taskMetrics.get(taskId);
    }
    getRollingMetrics() {
        return {
            samples: this.rollingMetrics?.snapshot() || null,
            throughput: this.rollingWindow?.snapshot() || null
        };
    }
    getSignatureInsights(limit = 5) {
        if (!this.signatureStats) {
            return [];
        }
        return this.signatureStats.snapshot(limit);
    }
    getAggregateMetrics(since = 0) {
        const tasks = Array.from(this.taskMetrics.values()).filter((t) => t.completedAt && t.completedAt > since);
        if (tasks.length === 0)
            return null;
        return {
            count: tasks.length,
            avgQueueWait: this._avg(tasks.map((t) => t.timings.queueWait || 0)),
            avgExecution: this._avg(tasks.map((t) => t.timings.execution || 0)),
            avgTotal: this._avg(tasks.map((t) => t.timings.total || 0)),
            p50Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.5),
            p95Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.95),
            p99Execution: this._percentile(tasks.map((t) => t.timings.execution || 0), 0.99),
            avgHeapDelta: this._avg(tasks.map((t) => t.performance.heapDelta || 0)),
            errorRate: tasks.filter((t) => t.timings.failedAttempts && t.timings.failedAttempts.length > 0).length / tasks.length,
            avgRetries: this._avg(tasks.map((t) => (t.attemptCount || 1) - 1)),
            autoTuning: this.tuner ? this.tuner.getMetrics() : null
        };
    }
    _avg(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    _percentile(arr, p) {
        if (arr.length === 0)
            return 0;
        const sorted = arr.slice().sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
    _sleep(ms, signal) {
        if (signal && typeof signal.aborted !== 'undefined') {
            return promises.setTimeout(ms, undefined, { signal });
        }
        return promises.setTimeout(ms);
    }
    _buildTaskContext(task, controller) {
        return {
            id: task.id,
            attempt: task.attemptCount,
            retries: task.retries,
            metadata: task.metadata,
            signal: controller?.signal
        };
    }
    _readHeapUsage(stage) {
        if (!this.memorySampler)
            return null;
        if (this.monitoring.mode === 'full') {
            return this.memorySampler.sampleNow();
        }
        if (this.monitoring.mode === 'balanced') {
            return stage === 'after'
                ? this.memorySampler.maybeSample()
                : this.memorySampler.snapshot();
        }
        return this.memorySampler.snapshot();
    }
    _computeHeapDelta(before, after) {
        if (typeof before !== 'number' || typeof after !== 'number') {
            return null;
        }
        return after - before;
    }
    _shouldEnforceTimeout(timeout) {
        if (this.bareMode) {
            return false;
        }
        if (timeout == null) {
            return false;
        }
        if (!Number.isFinite(timeout)) {
            return false;
        }
        return timeout > 0;
    }
    _computeRetryDelay(task, attempt, error) {
        const base = this.retryDelay * Math.pow(2, attempt);
        const saturation = (this.queue.length + this.active.size) / Math.max(1, this.effectiveConcurrency);
        if (saturation >= this.retryStrategy.pressureSkipThreshold) {
            return null;
        }
        let delayMs = base;
        const latencyTarget = this._latencyTargetMs();
        if (saturation >= this.retryStrategy.pressureClampThreshold ||
            (task.timings.queueWait || 0) > latencyTarget) {
            delayMs = Math.min(delayMs, this.retryStrategy.clampDelay);
        }
        if (this._isTransientNetworkError(error)) {
            delayMs = Math.max(this.retryStrategy.minDelay, delayMs * 0.5);
        }
        if (this.retryStrategy.jitter) {
            const jitterWindow = Math.max(1, delayMs * 0.2);
            delayMs = delayMs - jitterWindow / 2 + Math.random() * jitterWindow;
        }
        delayMs = Math.min(Math.max(delayMs, this.retryStrategy.minDelay), this.retryStrategy.maxDelay);
        return delayMs;
    }
    _isTransientNetworkError(error) {
        const message = `${error.name || ''} ${error.code || ''} ${error.message || ''}`;
        return /timeout|network|throttl|slowdown|temporarily unavailable/i.test(message);
    }
    _latencyTargetMs() {
        if (this.tuner && typeof this.tuner.targetLatency === 'number') {
            const target = this.tuner.targetLatency;
            if (target > 0) {
                return target;
            }
        }
        if (this.autoTuningConfig?.targetLatency) {
            return this.autoTuningConfig.targetLatency;
        }
        return this.retryStrategy.latencyTarget;
    }
    _syncQueueAging() {
        if (!this.queue?.setAgingMultiplier || !this.rollingMetrics) {
            return;
        }
        const snapshot = this.rollingMetrics.snapshot();
        if (!snapshot.sampleSize)
            return;
        const target = this._latencyTargetMs();
        if (!target)
            return;
        const ratio = snapshot.avgQueueWait / Math.max(1, target);
        const multiplier = Math.min(4, Math.max(0.25, ratio || 1));
        this.queue.setAgingMultiplier(multiplier);
    }
    _safeEmit(event, ...args) {
        if (!this.features.emitEvents) {
            return;
        }
        super.emit(event, ...args);
    }
    _currentActiveCount() {
        return this.lightMode ? this._lightActiveTasks : this.active.size;
    }
    _maybeExportMonitoringSample(stage, force = false) {
        if (!this.monitoring.enabled || !this.monitoring.exporter) {
            return;
        }
        const now = Date.now();
        if (!force && now - this._monitoringState.lastExport < this.monitoring.reportInterval) {
            return;
        }
        const completed = this.stats.processedCount + this.stats.errorCount;
        const deltaCompleted = completed - this._monitoringState.lastProcessed;
        const elapsed = Math.max(1, now - this._monitoringState.lastExport || this.monitoring.reportInterval);
        const throughput = deltaCompleted > 0 ? (deltaCompleted / elapsed) * 1000 : 0;
        const snapshot = {
            timestamp: now,
            stage,
            profile: this.features.profile,
            queueSize: this.queue.length,
            activeCount: this._currentActiveCount(),
            processed: this.stats.processedCount,
            errors: this.stats.errorCount,
            retries: this.stats.retryCount,
            throughput,
            signatureInsights: this.signatureStats
                ? this.signatureStats.snapshot(this.monitoring.signatureSampleLimit)
                : []
        };
        this._monitoringState.lastExport = now;
        this._monitoringState.lastProcessed = completed;
        try {
            this.monitoring.exporter(snapshot);
        }
        catch {
            // ignore exporter failures
        }
    }
    _applyTunedConcurrency() {
        if (!this.tuner) {
            return;
        }
        const tuned = this.tuner.getConcurrency();
        if (typeof tuned === 'number' &&
            tuned > 0 &&
            tuned !== this._lastTunedConcurrency &&
            tuned !== this.effectiveConcurrency) {
            this.setConcurrency(tuned);
            this._lastTunedConcurrency = tuned;
        }
    }
    async process(items, processor, options = {}) {
        const results = [];
        const errors = [];
        const promises = items.map((item, index) => {
            return this.enqueue(async () => {
                return await processor(item, index, this);
            }, {
                priority: options.priority,
                retries: options.retries,
                timeout: options.timeout,
                metadata: { index, totalCount: options.totalCount || items.length }
            })
                .then((result) => {
                results.push(result);
                if (options.onSuccess) {
                    options.onSuccess(item, result);
                }
                return result;
            })
                .catch((error) => {
                errors.push({ item, error, index });
                if (options.onError) {
                    options.onError(item, error);
                }
            });
        });
        await Promise.all(promises);
        return { results, errors };
    }
    async destroy() {
        this.stop();
        await this.drain();
        this.taskMetrics.clear();
        this.removeAllListeners();
    }
}

class S3Client extends EventEmitter {
    id;
    logLevel;
    logger;
    config;
    connectionString;
    httpClientOptions;
    client;
    _inflightCoalescing;
    taskExecutorConfig;
    taskExecutor;
    constructor({ logLevel = 'info', logger = null, id = null, AwsS3Client: providedClient, connectionString, httpClientOptions = {}, taskExecutor = false, executorPool = null, }) {
        super();
        this.logLevel = logLevel;
        const noop = () => { };
        this.logger = logger || {
            debug: noop,
            info: noop,
            warn: noop,
            error: noop,
            trace: noop
        };
        this.id = id ?? idGenerator(77);
        this.config = new ConnectionString(connectionString);
        this.connectionString = connectionString;
        this.httpClientOptions = {
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: httpClientOptions.maxSockets || 50,
            maxFreeSockets: httpClientOptions.maxFreeSockets || 10,
            timeout: 60000,
            ...httpClientOptions,
        };
        this.client = providedClient || this.createClient();
        this._inflightCoalescing = new Map();
        const poolConfig = executorPool ?? taskExecutor ?? false;
        this.taskExecutorConfig = this._normalizeTaskExecutorConfig(poolConfig);
        this.taskExecutor = this.taskExecutorConfig.enabled ? this._createTasksPool() : null;
    }
    async _coalesce(key, operationFn) {
        if (this._inflightCoalescing.has(key)) {
            return this._inflightCoalescing.get(key);
        }
        const promise = operationFn().finally(() => {
            this._inflightCoalescing.delete(key);
        });
        this._inflightCoalescing.set(key, promise);
        return promise;
    }
    _normalizeTaskExecutorConfig(config) {
        const envEnabled = process.env.S3DB_EXECUTOR_ENABLED;
        const envConcurrency = process.env.S3DB_CONCURRENCY;
        if (config === false || (typeof config === 'object' && config?.enabled === false) || envEnabled === 'false' || envEnabled === '0') {
            return { enabled: false };
        }
        let defaultConcurrency = 10;
        if (envConcurrency) {
            const parsed = parseInt(envConcurrency, 10);
            if (!isNaN(parsed) && parsed > 0) {
                defaultConcurrency = parsed;
            }
        }
        const configObj = typeof config === 'object' ? config : {};
        const normalized = {
            enabled: configObj.enabled ?? true,
            concurrency: configObj.concurrency ?? defaultConcurrency,
            retries: configObj.retries ?? 3,
            retryDelay: configObj.retryDelay ?? 1000,
            timeout: configObj.timeout ?? 30000,
            retryableErrors: configObj.retryableErrors ?? [
                'ECONNRESET',
                'ETIMEDOUT',
                'ENOTFOUND',
                'EAI_AGAIN',
                'EPIPE',
                'ECONNREFUSED',
                'SlowDown',
                'ServiceUnavailable',
                'InternalError',
                'RequestTimeout',
                'ThrottlingException',
                'ProvisionedThroughputExceededException',
            ],
            autotune: configObj.autotune ?? null,
            monitoring: configObj.monitoring ?? { collectMetrics: true },
        };
        return normalized;
    }
    _createTasksPool() {
        const poolConfig = {
            concurrency: this.taskExecutorConfig.concurrency,
            retries: this.taskExecutorConfig.retries,
            retryDelay: this.taskExecutorConfig.retryDelay,
            timeout: this.taskExecutorConfig.timeout,
            retryableErrors: this.taskExecutorConfig.retryableErrors,
            monitoring: this.taskExecutorConfig.monitoring,
        };
        if (poolConfig.concurrency === 'auto') {
            const tuner = new AdaptiveTuning(this.taskExecutorConfig.autotune || {});
            poolConfig.concurrency = tuner.currentConcurrency;
            poolConfig.autotune = tuner;
        }
        else if (this.taskExecutorConfig.autotune) {
            const tuner = new AdaptiveTuning({
                ...this.taskExecutorConfig.autotune,
                minConcurrency: poolConfig.concurrency,
            });
            poolConfig.autotune = tuner;
        }
        const pool = new TasksPool(poolConfig);
        pool.on('pool:taskStarted', (task) => {
            const typedTask = task;
            this.emit('pool:taskStarted', typedTask);
        });
        pool.on('pool:taskCompleted', (task) => this.emit('pool:taskCompleted', task));
        pool.on('pool:taskFailed', (task, error) => this.emit('pool:taskFailed', task, error));
        pool.on('pool:taskRetried', (task, attempt) => this.emit('pool:taskRetried', task, attempt));
        return pool;
    }
    async _executeOperation(fn, options = {}) {
        if (!this.taskExecutor || options.bypassPool) {
            return await fn();
        }
        if (this.logLevel === 'debug' || this.logLevel === 'trace') {
            const stats = this.taskExecutor.getStats();
            if ((stats.queueSize ?? 0) > 5 || (stats.activeCount ?? 0) > ((stats.effectiveConcurrency ?? 10) * 0.8)) {
                this.logger.debug(`[S3Client] Pool Load: Active=${stats.activeCount}/${stats.effectiveConcurrency}, Queue=${stats.queueSize}, Operation=${options.metadata?.operation || 'unknown'}`);
            }
        }
        const enqueueStart = Date.now();
        const result = await this.taskExecutor.enqueue(fn, {
            priority: options.priority ?? 0,
            retries: options.retries,
            timeout: options.timeout,
            metadata: options.metadata || {},
        });
        const totalMs = Date.now() - enqueueStart;
        if (totalMs > 100) {
            const op = options.metadata?.operation || 'unknown';
            const key = String(options.metadata?.key || '?').substring(0, 50);
            const stats = this.taskExecutor?.stats || {};
            this.logger.warn({ op, totalMs, key, queueSize: stats.queueSize || 0, active: stats.activeCount || 0 }, `[PERF] S3Client._executeOperation SLOW`);
        }
        return result;
    }
    async _executeBatch(fns, options = {}) {
        const wrapped = fns.map((fn, index) => Promise.resolve()
            .then(() => fn())
            .then((value) => {
            options.onItemComplete?.(value, index);
            return value;
        })
            .catch((error) => {
            options.onItemError?.(error, index);
            throw error;
        }));
        const settled = await Promise.allSettled(wrapped);
        const results = settled.map((state) => state.status === 'fulfilled' ? state.value : null);
        const errors = settled
            .map((state, index) => state.status === 'rejected' ? { error: state.reason, index } : null)
            .filter((e) => e !== null);
        return { results, errors };
    }
    getQueueStats() {
        return this.taskExecutor ? this.taskExecutor.getStats() : null;
    }
    getAggregateMetrics(since = 0) {
        return this.taskExecutor ? this.taskExecutor.getAggregateMetrics(since) : null;
    }
    async pausePool() {
        if (!this.taskExecutor)
            return null;
        return this.taskExecutor.pause();
    }
    resumePool() {
        if (!this.taskExecutor)
            return null;
        this.taskExecutor.resume();
    }
    async drainPool() {
        if (!this.taskExecutor)
            return null;
        return this.taskExecutor.drain();
    }
    stopPool() {
        if (!this.taskExecutor)
            return;
        this.taskExecutor.stop();
    }
    destroy() {
        if (this.client && typeof this.client.destroy === 'function') {
            this.client.destroy();
        }
        this.stopPool();
        this.removeAllListeners();
    }
    createClient() {
        const httpHandler = new ReckerHttpHandler(this.httpClientOptions);
        const options = {
            region: this.config.region,
            endpoint: this.config.endpoint,
            requestHandler: httpHandler,
        };
        if (this.config.forcePathStyle)
            options.forcePathStyle = true;
        if (this.config.accessKeyId) {
            options.credentials = {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey,
            };
        }
        const client = new clientS3.S3Client(options);
        client.middlewareStack.add((next, context) => async (args) => {
            if (context.commandName === 'DeleteObjectsCommand') {
                const body = args.request.body;
                if (body && typeof body === 'string') {
                    const contentMd5 = await md5(body);
                    args.request.headers['Content-MD5'] = contentMd5;
                }
            }
            return next(args);
        }, {
            step: 'build',
            name: 'addContentMd5ForDeleteObjects',
            priority: 'high',
        });
        return client;
    }
    async sendCommand(command) {
        this.emit('cl:request', command.constructor.name, command.input);
        const [ok, err, response] = await tryFn(() => this.client.send(command));
        if (!ok) {
            const bucket = this.config.bucket;
            const key = command.input && command.input.Key;
            throw mapAwsError(err, {
                bucket,
                key: key,
                commandName: command.constructor.name,
                commandInput: command.input,
            });
        }
        this.emit('cl:response', command.constructor.name, response, command.input);
        return response;
    }
    async putObject(params) {
        const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
            keyPrefix ? path.join(keyPrefix, key) : key;
            const stringMetadata = {};
            if (metadata) {
                for (const [k, v] of Object.entries(metadata)) {
                    const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_');
                    const { encoded } = metadataEncode(v);
                    stringMetadata[validKey] = encoded;
                }
            }
            const options = {
                Bucket: this.config.bucket,
                Key: keyPrefix ? path.join(keyPrefix, key) : key,
                Metadata: stringMetadata,
                Body: body || Buffer.alloc(0),
            };
            if (contentType !== undefined)
                options.ContentType = contentType;
            if (contentEncoding !== undefined)
                options.ContentEncoding = contentEncoding;
            if (contentLength !== undefined)
                options.ContentLength = contentLength;
            if (ifMatch !== undefined)
                options.IfMatch = ifMatch;
            if (ifNoneMatch !== undefined)
                options.IfNoneMatch = ifNoneMatch;
            const [ok, err, response] = await tryFn(() => this.sendCommand(new clientS3.PutObjectCommand(options)));
            this.emit('cl:PutObject', err || response, { key, metadata, contentType, body, contentEncoding, contentLength });
            if (!ok) {
                throw mapAwsError(err, {
                    bucket: this.config.bucket,
                    key,
                    commandName: 'PutObjectCommand',
                    commandInput: options,
                });
            }
            return response;
        }, { metadata: { operation: 'putObject', key } });
    }
    async getObject(key) {
        const getStart = Date.now();
        this.logger.debug({ key: key?.substring(0, 60) }, `[S3Client.getObject] START`);
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
            const options = {
                Bucket: this.config.bucket,
                Key: keyPrefix ? path.join(keyPrefix, key) : key,
            };
            const cmdStart = Date.now();
            const [ok, err, response] = await tryFn(async () => {
                const res = await this.sendCommand(new clientS3.GetObjectCommand(options));
                if (res.Metadata) {
                    const decodedMetadata = {};
                    for (const [k, value] of Object.entries(res.Metadata)) {
                        decodedMetadata[k] = metadataDecode(value);
                    }
                    res.Metadata = decodedMetadata;
                }
                return res;
            });
            const cmdMs = Date.now() - cmdStart;
            this.emit('cl:GetObject', err || response, { key });
            if (!ok) {
                this.logger.debug({ key: key?.substring(0, 60), cmdMs, err: err?.name }, `[S3Client.getObject] ERROR`);
                throw mapAwsError(err, {
                    bucket: this.config.bucket,
                    key,
                    commandName: 'GetObjectCommand',
                    commandInput: options,
                });
            }
            const totalMs = Date.now() - getStart;
            if (totalMs > 50) {
                this.logger.warn({ totalMs, cmdMs, key: key?.substring(0, 60) }, `[PERF] S3Client.getObject SLOW`);
            }
            else {
                this.logger.debug({ totalMs, key: key?.substring(0, 60) }, `[S3Client.getObject] complete`);
            }
            return response;
        }, { metadata: { operation: 'getObject', key } });
    }
    async headObject(key) {
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
            const options = {
                Bucket: this.config.bucket,
                Key: keyPrefix ? path.join(keyPrefix, key) : key,
            };
            const [ok, err, response] = await tryFn(async () => {
                const res = await this.sendCommand(new clientS3.HeadObjectCommand(options));
                if (res.Metadata) {
                    const decodedMetadata = {};
                    for (const [k, value] of Object.entries(res.Metadata)) {
                        decodedMetadata[k] = metadataDecode(value);
                    }
                    res.Metadata = decodedMetadata;
                }
                return res;
            });
            this.emit('cl:HeadObject', err || response, { key });
            if (!ok) {
                throw mapAwsError(err, {
                    bucket: this.config.bucket,
                    key,
                    commandName: 'HeadObjectCommand',
                    commandInput: options,
                });
            }
            return response;
        }, { metadata: { operation: 'headObject', key } });
    }
    async copyObject(params) {
        const { from, to, metadata, metadataDirective, contentType } = params;
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
            const options = {
                Bucket: this.config.bucket,
                Key: keyPrefix ? path.join(keyPrefix, to) : to,
                CopySource: path.join(this.config.bucket, keyPrefix ? path.join(keyPrefix, from) : from),
            };
            if (metadataDirective) {
                options.MetadataDirective = metadataDirective;
            }
            if (metadata && typeof metadata === 'object') {
                const encodedMetadata = {};
                for (const [k, value] of Object.entries(metadata)) {
                    const { encoded } = metadataEncode(value);
                    encodedMetadata[k] = encoded;
                }
                options.Metadata = encodedMetadata;
            }
            if (contentType) {
                options.ContentType = contentType;
            }
            const [ok, err, response] = await tryFn(() => this.sendCommand(new clientS3.CopyObjectCommand(options)));
            this.emit('cl:CopyObject', err || response, { from, to, metadataDirective });
            if (!ok) {
                throw mapAwsError(err, {
                    bucket: this.config.bucket,
                    key: to,
                    commandName: 'CopyObjectCommand',
                    commandInput: options,
                });
            }
            return response;
        }, { metadata: { operation: 'copyObject', from, to } });
    }
    async exists(key) {
        const [ok, err] = await tryFn(() => this.headObject(key));
        if (ok)
            return true;
        if (err.name === 'NoSuchKey' || err.name === 'NotFound')
            return false;
        throw err;
    }
    async deleteObject(key) {
        return await this._executeOperation(async () => {
            const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
            const options = {
                Bucket: this.config.bucket,
                Key: keyPrefix ? path.join(keyPrefix, key) : key,
            };
            const [ok, err, response] = await tryFn(() => this.sendCommand(new clientS3.DeleteObjectCommand(options)));
            this.emit('cl:DeleteObject', err || response, { key });
            if (!ok) {
                throw mapAwsError(err, {
                    bucket: this.config.bucket,
                    key,
                    commandName: 'DeleteObjectCommand',
                    commandInput: options,
                });
            }
            return response;
        }, { metadata: { operation: 'deleteObject', key } });
    }
    async deleteObjects(keys) {
        const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
        const packages = lodashEs.chunk(keys, 1000);
        const results = [];
        const errors = [];
        for (const packageKeys of packages) {
            const [ok, err, response] = await tryFn(async () => {
                return await this._executeOperation(async () => {
                    for (const key of packageKeys) {
                        await this.exists(key);
                    }
                    const options = {
                        Bucket: this.config.bucket,
                        Delete: {
                            Objects: packageKeys.map((key) => ({
                                Key: keyPrefix ? path.join(keyPrefix, key) : key,
                            })),
                        },
                    };
                    const [ok, err, res] = await tryFn(() => this.sendCommand(new clientS3.DeleteObjectsCommand(options)));
                    if (!ok)
                        throw err;
                    return res;
                }, { metadata: { operation: 'deleteObjects', count: packageKeys.length } });
            });
            if (ok) {
                results.push(response);
            }
            else {
                errors.push({ message: err.message, raw: err });
            }
        }
        const report = {
            deleted: results,
            notFound: errors,
        };
        this.emit('cl:DeleteObjects', report, keys);
        return report;
    }
    async deleteAll({ prefix } = {}) {
        const keyPrefix = typeof this.config.keyPrefix === 'string' ? this.config.keyPrefix : '';
        let continuationToken;
        let totalDeleted = 0;
        do {
            const listCommand = new clientS3.ListObjectsV2Command({
                Bucket: this.config.bucket,
                Prefix: keyPrefix ? path.join(keyPrefix, prefix || '') : prefix || '',
                ContinuationToken: continuationToken,
            });
            const listResponse = await this.client.send(listCommand);
            if (listResponse.Contents && listResponse.Contents.length > 0) {
                const deleteCommand = new clientS3.DeleteObjectsCommand({
                    Bucket: this.config.bucket,
                    Delete: {
                        Objects: listResponse.Contents.map(obj => ({ Key: obj.Key }))
                    }
                });
                const deleteResponse = await this.client.send(deleteCommand);
                const deletedCount = deleteResponse.Deleted ? deleteResponse.Deleted.length : 0;
                totalDeleted += deletedCount;
                this.emit('cl:DeleteAll', {
                    prefix,
                    batch: deletedCount,
                    total: totalDeleted
                });
            }
            continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
        } while (continuationToken);
        this.emit('cl:DeleteAllComplete', {
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
            throw new UnknownError('Unknown error in moveObject', { bucket: this.config.bucket, from, to, original: err });
        }
        return true;
    }
    async listObjects(params = {}) {
        const { prefix, maxKeys = 1000, continuationToken } = params;
        const listStart = Date.now();
        this.logger.debug({ prefix: prefix?.substring(0, 60), maxKeys }, `[S3Client.listObjects] START`);
        const options = {
            Bucket: this.config.bucket,
            MaxKeys: maxKeys,
            ContinuationToken: continuationToken || undefined,
            Prefix: this.config.keyPrefix
                ? path.join(this.config.keyPrefix, prefix || '')
                : prefix || '',
        };
        const [ok, err, response] = await tryFn(() => this.sendCommand(new clientS3.ListObjectsV2Command(options)));
        const totalMs = Date.now() - listStart;
        if (!ok) {
            this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), err: err?.name }, `[S3Client.listObjects] ERROR`);
            throw new UnknownError('Unknown error in listObjects', { prefix, bucket: this.config.bucket, original: err });
        }
        if (totalMs > 100) {
            this.logger.warn({ totalMs, prefix: prefix?.substring(0, 60), keys: response?.KeyCount || 0 }, `[PERF] S3Client.listObjects SLOW`);
        }
        else {
            this.logger.debug({ totalMs, prefix: prefix?.substring(0, 60), keys: response?.KeyCount || 0 }, `[S3Client.listObjects] complete`);
        }
        this.emit('cl:ListObjects', response, options);
        return response;
    }
    async count({ prefix } = {}) {
        let count = 0;
        let truncated = true;
        let continuationToken;
        while (truncated) {
            const options = {
                prefix,
                continuationToken,
            };
            const response = await this.listObjects(options);
            count += response.KeyCount || 0;
            truncated = response.IsTruncated || false;
            continuationToken = response.NextContinuationToken;
        }
        this.emit('cl:Count', count, { prefix });
        return count;
    }
    async getAllKeys({ prefix } = {}) {
        let keys = [];
        let truncated = true;
        let continuationToken;
        let iterations = 0;
        const startTotal = Date.now();
        while (truncated) {
            iterations++;
            const options = {
                prefix,
                continuationToken,
            };
            const startList = Date.now();
            const response = await this.listObjects(options);
            const listMs = Date.now() - startList;
            if (listMs > 500) {
                this.logger.warn({ iterations, listMs, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getAllKeys: listObjects iteration SLOW`);
            }
            if (response.Contents) {
                keys = keys.concat(response.Contents.map((x) => x.Key));
            }
            truncated = response.IsTruncated || false;
            continuationToken = response.NextContinuationToken;
        }
        const totalMs = Date.now() - startTotal;
        if (totalMs > 100) {
            this.logger.warn({ totalMs, iterations, keysCount: keys.length, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getAllKeys SLOW TOTAL`);
        }
        if (this.config.keyPrefix) {
            keys = keys
                .map((x) => x.replace(this.config.keyPrefix, ''))
                .map((x) => (x.startsWith('/') ? x.replace('/', '') : x));
        }
        this.emit('cl:GetAllKeys', keys, { prefix });
        return keys;
    }
    async getContinuationTokenAfterOffset(params = {}) {
        const { prefix, offset = 1000 } = params;
        if (offset === 0)
            return null;
        let truncated = true;
        let continuationToken;
        let skipped = 0;
        while (truncated) {
            const maxKeys = offset < 1000
                ? offset
                : offset - skipped > 1000
                    ? 1000
                    : offset - skipped;
            const options = {
                prefix,
                maxKeys,
                continuationToken,
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
        this.emit('cl:GetContinuationTokenAfterOffset', continuationToken || null, params);
        return continuationToken || null;
    }
    async getKeysPage(params = {}) {
        const pageStart = Date.now();
        const { prefix, offset = 0, amount = 100 } = params;
        this.logger.debug({ prefix: prefix?.substring(0, 60), offset, amount }, `[S3Client.getKeysPage] START`);
        let keys = [];
        let truncated = true;
        let continuationToken;
        let iterations = 0;
        if (offset > 0) {
            const tokenStart = Date.now();
            continuationToken = await this.getContinuationTokenAfterOffset({
                prefix,
                offset,
            }) || undefined;
            const tokenMs = Date.now() - tokenStart;
            this.logger.debug({ tokenMs, hasToken: !!continuationToken }, `[S3Client.getKeysPage] getContinuationTokenAfterOffset`);
            if (!continuationToken) {
                this.emit('cl:GetKeysPage', [], params);
                return [];
            }
        }
        while (truncated) {
            iterations++;
            const options = {
                prefix,
                continuationToken,
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
            keys = keys
                .map((x) => x.replace(this.config.keyPrefix, ''))
                .map((x) => (x.startsWith('/') ? x.replace('/', '') : x));
        }
        const totalMs = Date.now() - pageStart;
        if (totalMs > 100) {
            this.logger.warn({ totalMs, iterations, keysCount: keys.length, prefix: prefix?.substring(0, 60) }, `[PERF] S3Client.getKeysPage SLOW`);
        }
        else {
            this.logger.debug({ totalMs, iterations, keysCount: keys.length }, `[S3Client.getKeysPage] complete`);
        }
        this.emit('cl:GetKeysPage', keys, params);
        return keys;
    }
    async moveAllObjects({ prefixFrom, prefixTo }) {
        const keys = await this.getAllKeys({ prefix: prefixFrom });
        const results = [];
        const errors = [];
        for (const key of keys) {
            const to = key.replace(prefixFrom, prefixTo);
            const [ok, err] = await tryFn(async () => {
                await this.moveObject({
                    from: key,
                    to,
                });
            });
            if (ok) {
                results.push(to);
            }
            else {
                errors.push({
                    message: err.message,
                    raw: err,
                    item: key
                });
            }
        }
        this.emit('cl:MoveAllObjects', { results, errors }, { prefixFrom, prefixTo });
        if (errors.length > 0) {
            throw new UnknownError('Some objects could not be moved', {
                bucket: this.config.bucket,
                operation: 'moveAllObjects',
                prefixFrom,
                prefixTo,
                totalKeys: keys.length,
                failedCount: errors.length,
                successCount: results.length,
                errors: errors.map(e => ({ message: e.message, raw: e.raw })),
                suggestion: 'Check S3 permissions and retry failed objects individually'
            });
        }
        return results;
    }
}

class TasksRunner extends EventEmitter.EventEmitter {
    static notRun = Symbol('notRun');
    static failed = Symbol('failed');
    features;
    lightMode;
    bareMode;
    concurrency;
    retries;
    retryDelay;
    timeout;
    retryableErrors;
    active;
    paused;
    stopped;
    stats;
    processedItems;
    taskMetrics;
    monitoring;
    signatureStats;
    tuner;
    autoTuningConfig;
    _queue;
    _activeWaiters;
    _activeLightTasks;
    _taskMetricsOrder;
    _monitoringState;
    _lastTunedConcurrency;
    constructor(options = {}) {
        super();
        const requestedRetries = options.retries ?? 3;
        const monitoringRequested = options.monitoring?.enabled ?? false;
        const requestedMonitoringMode = options.monitoring?.mode;
        const requestedProfile = options.features?.profile;
        const autoTuningRequested = options.autoTuning?.enabled || options.autoTuning?.instance;
        const needsRichProfile = requestedRetries > 0 || !!options.priority || autoTuningRequested;
        let profile = requestedProfile || (needsRichProfile ? 'balanced' : 'light');
        const defaultMonitoringMode = options.monitoring?.collectMetrics || options.monitoring?.mode === 'detailed'
            ? 'detailed'
            : 'passive';
        const monitoringMode = monitoringRequested
            ? requestedMonitoringMode || defaultMonitoringMode
            : 'light';
        if (profile === 'light' && monitoringRequested && monitoringMode !== 'passive') {
            profile = 'balanced';
        }
        this.features = {
            profile,
            emitEvents: options.features?.emitEvents ?? profile !== 'bare',
            trackProcessedItems: options.features?.trackProcessedItems ?? (profile !== 'light' && profile !== 'bare'),
            signatureInsights: options.features?.signatureInsights ?? true
        };
        this.lightMode = this.features.profile === 'light' || this.features.profile === 'bare';
        this.bareMode = this.features.profile === 'bare';
        this.concurrency = options.concurrency || 5;
        this.retries = requestedRetries;
        this.retryDelay = options.retryDelay || 1000;
        this.timeout = options.timeout ?? 30000;
        this.retryableErrors = options.retryableErrors || [];
        this._queue = this.lightMode
            ? new FifoTaskQueue()
            : new PriorityTaskQueue();
        this.active = new Set();
        this.paused = false;
        this.stopped = false;
        this._activeWaiters = [];
        this.stats = {
            queueSize: 0,
            activeCount: 0,
            processedCount: 0,
            errorCount: 0,
            retryCount: 0
        };
        this.processedItems = this.features.trackProcessedItems ? [] : null;
        this.taskMetrics = new Map();
        const monitoringEnabled = !this.bareMode && monitoringRequested;
        const collectMetricsRequested = options.monitoring?.collectMetrics ?? false;
        const collectMetrics = monitoringEnabled && (collectMetricsRequested || monitoringMode === 'detailed');
        this.monitoring = {
            enabled: monitoringEnabled,
            mode: monitoringMode,
            collectMetrics,
            sampleRate: this._normalizeSampleRate(options.monitoring?.sampleRate ?? 1),
            maxSamples: Math.max(1, options.monitoring?.maxSamples ?? 512),
            rollingWindowMs: options.monitoring?.rollingWindowMs ?? 1000,
            reportInterval: options.monitoring?.reportInterval ?? 1000,
            telemetryRate: this._normalizeSampleRate(options.monitoring?.telemetrySampleRate ??
                (collectMetrics || autoTuningRequested ? 1 : 0.2)),
            signatureSampleLimit: Math.max(1, options.monitoring?.signatureSampleLimit ?? 8),
            exporter: typeof options.monitoring?.exporter === 'function' ? options.monitoring.exporter : null
        };
        this._taskMetricsOrder = [];
        this._activeLightTasks = 0;
        this._monitoringState = {
            lastExport: 0,
            lastProcessed: 0
        };
        this.signatureStats = this.features.signatureInsights
            ? new SignatureStats({
                alpha: options.monitoring?.signatureAlpha,
                maxEntries: options.monitoring?.signatureMaxEntries
            })
            : null;
        this.tuner = null;
        this._lastTunedConcurrency = null;
        const tunerInstance = options.autoTuning?.instance;
        if (!this.bareMode && autoTuningRequested) {
            this.autoTuningConfig = options.autoTuning;
            this.tuner = tunerInstance || new AdaptiveTuning(options.autoTuning);
            const tunedConcurrency = this.tuner.getConcurrency();
            if (typeof tunedConcurrency === 'number' && tunedConcurrency > 0) {
                this.setConcurrency(tunedConcurrency);
                this._lastTunedConcurrency = tunedConcurrency;
            }
        }
    }
    get queue() {
        if (typeof this._queue.toArray === 'function') {
            return this._queue.toArray();
        }
        if (Array.isArray(this._queue.heap)) {
            return this._queue.heap.map((node) => node.task);
        }
        return [];
    }
    async process(items, processor, options) {
        const iterableOptions = {
            ...options,
            totalCount: typeof items?.length === 'number' && Number.isFinite(items.length)
                ? items.length
                : options?.totalCount
        };
        return await this.processIterable(items, processor, iterableOptions);
    }
    async enqueue(fn, options = {}) {
        const taskMetadata = {
            ...(options.metadata || {})
        };
        const task = {
            id: nanoid.nanoid(),
            fn,
            priority: options.priority || 0,
            retries: options.retries ?? this.retries,
            timeout: options.timeout ?? this.timeout,
            metadata: taskMetadata,
            attemptCount: 0,
            createdAt: Date.now(),
            signature: '',
            promise: null,
            resolve: null,
            reject: null
        };
        task.signature = deriveSignature(fn, taskMetadata, options.signature, task.priority);
        this._primeTaskTelemetry(task);
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        task.promise = promise;
        task.resolve = resolve;
        task.reject = reject;
        this._insertByPriority(task);
        this.stats.queueSize = this._queue.length;
        this.processNext();
        return promise;
    }
    async processIterable(iterable, processor, options = {}) {
        const results = [];
        const errors = [];
        let index = 0;
        let processedCount = 0;
        const totalCount = typeof options.totalCount === 'number' && options.totalCount >= 0
            ? options.totalCount
            : null;
        const reportProgress = (item) => {
            processedCount++;
            if (!options.onProgress)
                return;
            const percentage = totalCount != null && totalCount > 0
                ? ((processedCount / totalCount) * 100).toFixed(2)
                : null;
            options.onProgress(item, {
                processedCount,
                totalCount,
                percentage
            });
        };
        for await (const item of iterable) {
            if (this.stopped)
                break;
            const currentIndex = index;
            this.enqueue(async () => {
                return await processor(item, currentIndex, this);
            }, {
                priority: options.priority,
                retries: options.retries,
                timeout: options.timeout,
                metadata: { item, index: currentIndex, itemLength: extractLengthHint(item) }
            })
                .then((result) => {
                results.push(result);
                options.onItemComplete?.(item, result);
                reportProgress(item);
            })
                .catch((error) => {
                errors.push({ item, error, index: currentIndex });
                options.onItemError?.(item, error);
                reportProgress(item);
            });
            index++;
            if (this._currentActiveCount() >= this.concurrency) {
                await this._waitForSlot();
            }
        }
        await this.drain();
        return { results, errors };
    }
    async processCorresponding(items, processor, options = {}) {
        const results = Array(items.length).fill(TasksRunner.notRun);
        for (let index = 0; index < items.length; index++) {
            if (this.stopped)
                break;
            const item = items[index];
            this.enqueue(async () => {
                return await processor(item, index, this);
            }, {
                priority: options.priority,
                retries: options.retries,
                timeout: options.timeout,
                metadata: { item, index, itemLength: extractLengthHint(item) }
            })
                .then((result) => {
                results[index] = result;
            })
                .catch((error) => {
                results[index] = TasksRunner.failed;
                options.onItemError?.(item, error);
            });
            if (this._currentActiveCount() >= this.concurrency) {
                await this._waitForSlot();
            }
        }
        await this.drain();
        return results;
    }
    processNext() {
        if (this.lightMode) {
            this._processLightQueue();
            return;
        }
        while (!this.paused && !this.stopped && this.active.size < this.concurrency && this._queue.length > 0) {
            const task = this._queue.dequeue();
            if (!task)
                break;
            this.stats.queueSize = this._queue.length;
            this._markTaskDequeued(task);
            const taskPromise = this._executeTaskWithRetry(task);
            this.active.add(taskPromise);
            this.stats.activeCount = this.active.size;
            this._safeEmit('taskStart', task);
            taskPromise
                .then((result) => {
                this.active.delete(taskPromise);
                this.stats.activeCount = this.active.size;
                this.stats.processedCount++;
                if (this.processedItems) {
                    this.processedItems.push(task.metadata.item);
                }
                this._recordTaskMetrics(task, true);
                task.resolve(result);
                this._safeEmit('taskComplete', task, result);
            })
                .catch((error) => {
                this.active.delete(taskPromise);
                this.stats.activeCount = this.active.size;
                this.stats.errorCount++;
                this._recordTaskMetrics(task, false, error);
                task.reject(error);
                this._safeEmit('taskError', task, error);
            })
                .finally(() => {
                this._maybeExportMonitoringSample('task');
                this._notifyActiveWaiters();
                this.processNext();
                if (this.active.size === 0 && this._queue.length === 0) {
                    this._safeEmit('drained');
                }
            });
        }
    }
    _processLightQueue() {
        if (this.paused || this.stopped) {
            return;
        }
        if (this.bareMode) {
            this._processBareQueue();
            return;
        }
        while (this._queue.length > 0 && this._activeLightTasks < this.concurrency) {
            const task = this._queue.dequeue();
            if (!task)
                break;
            this._markTaskDequeued(task);
            this._activeLightTasks++;
            this.stats.activeCount = this._activeLightTasks;
            this.stats.queueSize = this._queue.length;
            const taskPromise = this._executeTaskWithRetry(task);
            this._safeEmit('taskStart', task);
            taskPromise
                .then((result) => {
                this.stats.processedCount++;
                if (this.processedItems) {
                    this.processedItems.push(task.metadata.item);
                }
                this._recordTaskMetrics(task, true);
                task.resolve(result);
                this._safeEmit('taskComplete', task, result);
            })
                .catch((error) => {
                this.stats.errorCount++;
                this._recordTaskMetrics(task, false, error);
                task.reject(error);
                this._safeEmit('taskError', task, error);
            })
                .finally(() => {
                this._maybeExportMonitoringSample('task');
                this._activeLightTasks--;
                this.stats.activeCount = this._activeLightTasks;
                this._notifyActiveWaiters();
                if (this._activeLightTasks === 0 && this._queue.length === 0) {
                    this._safeEmit('drained');
                }
                else {
                    this._processLightQueue();
                }
            });
        }
    }
    _processBareQueue() {
        while (this._queue.length > 0 && this._activeLightTasks < this.concurrency) {
            const task = this._queue.dequeue();
            if (!task)
                break;
            this._activeLightTasks++;
            const taskPromise = this._executeBareTask(task);
            taskPromise
                .then((result) => {
                task.resolve(result);
            })
                .catch((error) => {
                task.reject(error);
            })
                .finally(() => {
                this._activeLightTasks--;
                this._notifyActiveWaiters();
                if (this._activeLightTasks === 0 && this._queue.length === 0) {
                    this._safeEmit('drained');
                }
                else {
                    this._processBareQueue();
                }
            });
        }
    }
    _currentActiveCount() {
        return this.lightMode ? this._activeLightTasks : this.active.size;
    }
    _maybeExportMonitoringSample(stage, force = false) {
        if (!this.monitoring.enabled || !this.monitoring.exporter) {
            return;
        }
        const now = Date.now();
        if (!force && now - this._monitoringState.lastExport < this.monitoring.reportInterval) {
            return;
        }
        const completed = this.stats.processedCount + this.stats.errorCount;
        const deltaCompleted = completed - this._monitoringState.lastProcessed;
        const elapsed = Math.max(1, now - this._monitoringState.lastExport || this.monitoring.reportInterval);
        const throughput = deltaCompleted > 0 ? (deltaCompleted / elapsed) * 1000 : 0;
        const snapshot = {
            timestamp: now,
            stage,
            profile: this.features.profile,
            queueSize: this._queue.length,
            activeCount: this._currentActiveCount(),
            processed: this.stats.processedCount,
            errors: this.stats.errorCount,
            retries: this.stats.retryCount,
            throughput,
            signatureInsights: this.signatureStats
                ? this.signatureStats.snapshot(this.monitoring.signatureSampleLimit)
                : []
        };
        this._monitoringState.lastExport = now;
        this._monitoringState.lastProcessed = completed;
        try {
            this.monitoring.exporter(snapshot);
        }
        catch {
            // noop
        }
    }
    async _executeTaskWithRetry(task) {
        if (this.bareMode || (task.retries === 0 && !this._shouldEnforceTimeout(task.timeout))) {
            return await this._runSingleAttempt(task);
        }
        let lastError;
        for (let attempt = 0; attempt <= task.retries; attempt++) {
            task.attemptCount = attempt + 1;
            const attemptStartedAt = this.monitoring.enabled ? Date.now() : 0;
            try {
                const result = await this._runSingleAttempt(task);
                return result;
            }
            catch (error) {
                lastError = error;
                const isRetryable = this._isErrorRetryable(error);
                const hasRetriesLeft = attempt < task.retries;
                if (this.monitoring.enabled && task.telemetry) {
                    task.telemetry.failedAttempts.push({
                        attempt: attempt + 1,
                        duration: Date.now() - attemptStartedAt,
                        errorName: error?.name || error?.constructor?.name || 'Error',
                        errorMessage: error?.message || ''
                    });
                }
                if (isRetryable && hasRetriesLeft) {
                    this.stats.retryCount++;
                    this._safeEmit('taskRetry', task, attempt + 1);
                    const delayMs = this.retryDelay * Math.pow(2, attempt);
                    await this._sleep(delayMs);
                }
                else {
                    throw error;
                }
            }
        }
        throw lastError;
    }
    async _runSingleAttempt(task) {
        const operation = task.fn();
        if (!this._shouldEnforceTimeout(task.timeout)) {
            return await operation;
        }
        return await this._executeWithTimeout(operation, task.timeout, task);
    }
    async _executeBareTask(task) {
        return await this._runSingleAttempt(task);
    }
    _shouldEnforceTimeout(timeout) {
        if (this.bareMode) {
            return false;
        }
        if (timeout == null) {
            return false;
        }
        if (!Number.isFinite(timeout)) {
            return false;
        }
        return timeout > 0;
    }
    async _executeWithTimeout(promise, timeout, task) {
        let timerId;
        const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => {
                reject(new Error(`Task ${task.id} timed out after ${timeout}ms`));
            }, timeout);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        }
        finally {
            clearTimeout(timerId);
        }
    }
    _isErrorRetryable(error) {
        if (this.retryableErrors.length === 0) {
            return true;
        }
        return this.retryableErrors.some((errorType) => {
            return (error.name === errorType ||
                error.code === errorType ||
                error.constructor.name === errorType);
        });
    }
    _insertByPriority(task) {
        this._queue.enqueue(task);
    }
    async _waitForSlot() {
        while (this._currentActiveCount() >= this.concurrency) {
            await this._waitForActive();
        }
    }
    async _waitForActive() {
        if (this._currentActiveCount() === 0)
            return;
        await new Promise((resolve) => {
            this._activeWaiters.push(resolve);
        });
    }
    _notifyActiveWaiters() {
        if (this._activeWaiters.length === 0) {
            return;
        }
        const waiters = this._activeWaiters;
        this._activeWaiters = [];
        for (const resolve of waiters) {
            resolve();
        }
    }
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    _primeTaskTelemetry(task) {
        if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
            return;
        }
        if (!this._shouldTrackTelemetry()) {
            return;
        }
        task.telemetry = {
            enqueuedAt: task.createdAt,
            failedAttempts: []
        };
    }
    _markTaskDequeued(task) {
        if (!task.telemetry) {
            return;
        }
        if (typeof task.telemetry.enqueuedAt !== 'number') {
            task.telemetry.enqueuedAt = task.createdAt || Date.now();
        }
        task.telemetry.startedAt = Date.now();
    }
    _shouldSampleMetrics() {
        if (!this.monitoring.collectMetrics) {
            return false;
        }
        if (this.monitoring.sampleRate >= 1) {
            return true;
        }
        if (this.monitoring.sampleRate <= 0) {
            return false;
        }
        return Math.random() < this.monitoring.sampleRate;
    }
    _shouldTrackTelemetry() {
        if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
            return false;
        }
        if (this.tuner || this.monitoring.mode === 'detailed' || this.monitoring.collectMetrics) {
            return true;
        }
        if (this.monitoring.telemetryRate >= 1) {
            return true;
        }
        if (this.monitoring.telemetryRate <= 0) {
            return false;
        }
        return Math.random() < this.monitoring.telemetryRate;
    }
    _storeTaskMetric(entry) {
        this.taskMetrics.set(entry.id, entry);
        this._taskMetricsOrder.push(entry.id);
        if (this._taskMetricsOrder.length > this.monitoring.maxSamples) {
            const oldest = this._taskMetricsOrder.shift();
            if (oldest) {
                this.taskMetrics.delete(oldest);
            }
        }
    }
    _recordTaskMetrics(task, success, error) {
        if (!this.monitoring.enabled && !this.tuner && !this.signatureStats) {
            return;
        }
        if (!task.telemetry) {
            if (this.signatureStats) {
                this.signatureStats.record(task.signature, { success });
            }
            return;
        }
        const telemetry = task.telemetry || {};
        const completedAt = Date.now();
        const enqueuedAt = typeof telemetry.enqueuedAt === 'number' ? telemetry.enqueuedAt : task.createdAt || completedAt;
        const startedAt = typeof telemetry.startedAt === 'number' ? telemetry.startedAt : completedAt;
        const queueWait = Math.max(0, startedAt - enqueuedAt);
        const execution = Math.max(0, completedAt - startedAt);
        const total = Math.max(0, completedAt - (task.createdAt || enqueuedAt));
        let entry = null;
        if (this.monitoring.enabled) {
            entry = {
                id: task.id,
                completedAt,
                success,
                attemptCount: task.attemptCount,
                timings: {
                    queueWait,
                    execution,
                    total,
                    failedAttempts: telemetry.failedAttempts || []
                },
                performance: {},
                error: success
                    ? null
                    : {
                        name: error?.name || error?.constructor?.name || 'Error',
                        message: error?.message || ''
                    }
            };
            if (this._shouldSampleMetrics()) {
                this._storeTaskMetric(entry);
            }
        }
        if (this.tuner?.recordTaskMetrics) {
            try {
                this.tuner.recordTaskMetrics({
                    latency: execution,
                    queueWait,
                    success,
                    retries: (task.attemptCount || 1) - 1,
                    heapDelta: entry?.performance?.heapDelta || 0
                });
            }
            catch (tunerError) {
                this._safeEmit('tuner:error', tunerError);
            }
            this._applyTunedConcurrency();
        }
        if (this.signatureStats) {
            this.signatureStats.record(task.signature, {
                queueWait,
                execution,
                success
            });
        }
        delete task.telemetry;
    }
    async pause() {
        this.paused = true;
        while (this.active.size > 0) {
            await this._waitForActive();
        }
        this._safeEmit('paused');
    }
    resume() {
        this.paused = false;
        this.processNext();
        this._safeEmit('resumed');
    }
    stop() {
        this.stopped = true;
        this._queue.flush((task) => {
            task.promise?.catch(() => { });
            task.reject(new Error('Task cancelled by stop()'));
        });
        this.stats.queueSize = this._queue.length;
        this._safeEmit('stopped');
    }
    async drain() {
        while (this._queue.length > 0 || this._currentActiveCount() > 0) {
            await this._waitForActive();
        }
        this._safeEmit('drained');
    }
    setConcurrency(n) {
        if (n < 1) {
            throw new Error('Concurrency must be >= 1');
        }
        this.concurrency = n;
        this.processNext();
    }
    getConcurrency() {
        return this.concurrency;
    }
    getStats() {
        return {
            ...this.stats,
            queueSize: this._queue.length,
            activeCount: this._currentActiveCount(),
            concurrency: this.concurrency,
            paused: this.paused,
            stopped: this.stopped,
            rolling: this.getRollingMetrics()
        };
    }
    getRollingMetrics() {
        if (!this.monitoring.enabled || !this.monitoring.collectMetrics) {
            return null;
        }
        const entries = Array.from(this.taskMetrics.values());
        if (entries.length === 0) {
            return {
                sampleSize: 0,
                avgQueueWait: 0,
                avgExecution: 0,
                avgRetries: 0,
                errorRate: 0
            };
        }
        return {
            sampleSize: entries.length,
            avgQueueWait: this._avg(entries.map((t) => t.timings.queueWait || 0)),
            avgExecution: this._avg(entries.map((t) => t.timings.execution || 0)),
            avgRetries: this._avg(entries.map((t) => (t.attemptCount || 1) - 1)),
            errorRate: entries.filter((t) => !t.success).length / entries.length
        };
    }
    getSignatureInsights(limit = 5) {
        if (!this.signatureStats) {
            return [];
        }
        return this.signatureStats.snapshot(limit);
    }
    getAggregateMetrics(since = 0) {
        if (!this.monitoring.enabled || !this.monitoring.collectMetrics) {
            return null;
        }
        const entries = Array.from(this.taskMetrics.values()).filter((entry) => !since || (entry.completedAt || 0) > since);
        if (entries.length === 0) {
            return null;
        }
        const executions = entries.map((entry) => entry.timings.execution || 0);
        return {
            count: entries.length,
            avgQueueWait: this._avg(entries.map((entry) => entry.timings.queueWait || 0)),
            avgExecution: this._avg(executions),
            avgTotal: this._avg(entries.map((entry) => entry.timings.total || 0)),
            p50Execution: this._percentile(executions, 0.5),
            p95Execution: this._percentile(executions, 0.95),
            p99Execution: this._percentile(executions, 0.99),
            errorRate: entries.filter((entry) => !entry.success).length / entries.length,
            avgRetries: this._avg(entries.map((entry) => (entry.attemptCount || 1) - 1))
        };
    }
    getProgress() {
        const total = this.stats.processedCount + this.stats.errorCount + this._queue.length + this._currentActiveCount();
        const completed = this.stats.processedCount + this.stats.errorCount;
        return {
            total,
            completed,
            pending: this._queue.length,
            active: this._currentActiveCount(),
            percentage: total > 0 ? ((completed / total) * 100).toFixed(2) : 0
        };
    }
    reset() {
        this._queue = this.lightMode
            ? new FifoTaskQueue()
            : new PriorityTaskQueue();
        this.active.clear();
        this.paused = false;
        this.stopped = false;
        this.processedItems = this.features.trackProcessedItems ? [] : null;
        this.taskMetrics.clear();
        this._taskMetricsOrder = [];
        this.signatureStats?.reset();
        this._activeWaiters = [];
        this._activeLightTasks = 0;
        this.stats = {
            queueSize: 0,
            activeCount: 0,
            processedCount: 0,
            errorCount: 0,
            retryCount: 0
        };
    }
    async destroy() {
        this.stop();
        this.removeAllListeners();
        if (this.tuner?.stop) {
            this.tuner.stop();
        }
    }
    _safeEmit(event, ...args) {
        if (!this.features.emitEvents) {
            return;
        }
        super.emit(event, ...args);
    }
    _applyTunedConcurrency() {
        if (!this.tuner) {
            return;
        }
        const tuned = this.tuner.getConcurrency();
        if (typeof tuned === 'number' &&
            tuned > 0 &&
            tuned !== this._lastTunedConcurrency &&
            tuned !== this.concurrency) {
            this.setConcurrency(tuned);
            this._lastTunedConcurrency = tuned;
        }
    }
    _normalizeSampleRate(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return 1;
        }
        if (value <= 0)
            return 0;
        if (value >= 1)
            return 1;
        return value;
    }
    _avg(arr) {
        if (!arr || arr.length === 0) {
            return 0;
        }
        const sum = arr.reduce((a, b) => a + b, 0);
        return sum / arr.length;
    }
    _percentile(arr, p) {
        if (!arr || arr.length === 0) {
            return 0;
        }
        const sorted = arr.slice().sort((a, b) => a - b);
        const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
        return sorted[index] ?? 0;
    }
    static async process(items, processor, options = {}) {
        const runner = new TasksRunner(options);
        const result = await runner.process(items, processor, options);
        runner.destroy();
        return result;
    }
    static withConcurrency(concurrency) {
        return new TasksRunner({ concurrency });
    }
}

class MemoryStorage {
    objects;
    bucket;
    enforceLimits;
    metadataLimit;
    maxObjectSize;
    persistPath;
    autoPersist;
    logLevel;
    maxMemoryMB;
    maxMemoryBytes;
    currentMemoryBytes;
    evictionEnabled;
    _stats;
    logger;
    constructor(config = {}) {
        this.objects = new Map();
        this.bucket = config.bucket || 's3db';
        this.enforceLimits = Boolean(config.enforceLimits);
        this.metadataLimit = config.metadataLimit ?? 2048;
        this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024;
        this.persistPath = config.persistPath;
        this.autoPersist = Boolean(config.autoPersist);
        this.logLevel = config.logLevel || 'info';
        this.maxMemoryMB = config.maxMemoryMB ?? 512;
        this.maxMemoryBytes = this.maxMemoryMB * 1024 * 1024;
        this.currentMemoryBytes = 0;
        this.evictionEnabled = config.evictionEnabled !== false;
        this._stats = {
            evictions: 0,
            evictedBytes: 0,
            peakMemoryBytes: 0
        };
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            this.logger = createLogger({ name: 'MemoryStorage', level: this.logLevel });
        }
    }
    _generateETag(body) {
        const buffer = this._toBuffer(body);
        return crypto.createHash('md5').update(buffer).digest('hex');
    }
    _toBuffer(body) {
        if (Buffer.isBuffer(body)) {
            return body;
        }
        if (body === undefined || body === null) {
            return Buffer.alloc(0);
        }
        return Buffer.from(body);
    }
    _formatEtag(etag) {
        return `"${etag}"`;
    }
    _normalizeEtagHeader(headerValue) {
        if (headerValue === undefined || headerValue === null) {
            return [];
        }
        return String(headerValue)
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
    }
    _encodeContinuationToken(key) {
        return Buffer.from(String(key), 'utf8').toString('base64');
    }
    _decodeContinuationToken(token) {
        try {
            const normalized = String(token).trim();
            const decoded = Buffer.from(normalized, 'base64').toString('utf8');
            const reencoded = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
            const normalizedNoPad = normalized.replace(/=+$/, '');
            if (!decoded || reencoded !== normalizedNoPad) {
                throw new Error('Invalid continuation token format');
            }
            return decoded;
        }
        catch (error) {
            throw new ValidationError('Invalid continuation token', {
                field: 'ContinuationToken',
                retriable: false,
                suggestion: 'Use the NextContinuationToken returned by a previous ListObjectsV2 response.',
                original: error
            });
        }
    }
    _extractCommonPrefix(prefix, delimiter, key) {
        if (!delimiter)
            return null;
        const hasPrefix = Boolean(prefix);
        if (hasPrefix && !key.startsWith(prefix)) {
            return null;
        }
        const remainder = hasPrefix ? key.slice(prefix.length) : key;
        const index = remainder.indexOf(delimiter);
        if (index === -1) {
            return null;
        }
        const baseLength = hasPrefix ? prefix.length : 0;
        return key.slice(0, baseLength + index + delimiter.length);
    }
    _calculateMetadataSize(metadata) {
        if (!metadata)
            return 0;
        let size = 0;
        for (const [key, value] of Object.entries(metadata)) {
            size += Buffer.byteLength(key, 'utf8');
            size += Buffer.byteLength(String(value), 'utf8');
        }
        return size;
    }
    _validateLimits(body, metadata) {
        if (!this.enforceLimits)
            return;
        const metadataSize = this._calculateMetadataSize(metadata);
        if (metadataSize > this.metadataLimit) {
            throw new MetadataLimitError('Metadata limit exceeded in memory storage', {
                bucket: this.bucket,
                totalSize: metadataSize,
                effectiveLimit: this.metadataLimit,
                operation: 'put',
                retriable: false,
                suggestion: 'Reduce metadata size or disable enforceLimits in MemoryClient configuration.'
            });
        }
        const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '', 'utf8');
        if (bodySize > this.maxObjectSize) {
            throw new ResourceError('Object size exceeds in-memory limit', {
                bucket: this.bucket,
                operation: 'put',
                size: bodySize,
                maxObjectSize: this.maxObjectSize,
                statusCode: 413,
                retriable: false,
                suggestion: 'Store smaller objects or increase maxObjectSize when instantiating MemoryClient.'
            });
        }
    }
    async put(key, params) {
        const { body, metadata, contentType, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
        this._validateLimits(body, metadata);
        const existing = this.objects.get(key);
        if (ifMatch !== undefined) {
            const expectedEtags = this._normalizeEtagHeader(ifMatch);
            const currentEtag = existing ? existing.etag : null;
            const matches = expectedEtags.length > 0 && currentEtag ? expectedEtags.includes(currentEtag) : false;
            if (!existing || !matches) {
                throw new ResourceError(`Precondition failed: ETag mismatch for key "${key}"`, {
                    bucket: this.bucket,
                    key,
                    code: 'PreconditionFailed',
                    statusCode: 412,
                    retriable: false,
                    suggestion: 'Fetch the latest object and retry with the current ETag in options.ifMatch.'
                });
            }
        }
        if (ifNoneMatch !== undefined) {
            const normalized = this._normalizeEtagHeader(ifNoneMatch);
            const targetValue = existing ? existing.etag : null;
            const shouldFail = (ifNoneMatch === '*' && Boolean(existing)) ||
                (normalized.length > 0 && existing && targetValue && normalized.includes(targetValue));
            if (shouldFail) {
                throw new ResourceError(`Precondition failed: object already exists for key "${key}"`, {
                    bucket: this.bucket,
                    key,
                    code: 'PreconditionFailed',
                    statusCode: 412,
                    retriable: false,
                    suggestion: 'Use ifNoneMatch: "*" only when the object should not exist or remove the conditional header.'
                });
            }
        }
        const buffer = this._toBuffer(body);
        const etag = this._generateETag(buffer);
        const lastModified = new Date().toISOString();
        const size = buffer.length;
        const existingSize = existing ? existing.size : 0;
        const memoryDelta = size - existingSize;
        this._evictIfNeeded(memoryDelta > 0 ? memoryDelta : 0);
        const objectData = {
            body: buffer,
            metadata: metadata ? { ...metadata } : {},
            contentType: contentType || 'application/octet-stream',
            etag,
            lastModified,
            size,
            contentEncoding,
            contentLength: typeof contentLength === 'number' ? contentLength : size
        };
        this.objects.set(key, objectData);
        this._trackMemory(memoryDelta);
        this.logger.debug({ key, size, etag }, `PUT ${key} (${size} bytes, etag: ${etag})`);
        if (this.autoPersist && this.persistPath) {
            await this.saveToDisk();
        }
        return {
            ETag: this._formatEtag(etag),
            VersionId: null,
            ServerSideEncryption: null,
            Location: `/${this.bucket}/${key}`
        };
    }
    async get(key) {
        const obj = this.objects.get(key);
        if (!obj) {
            const error = new ResourceError(`Object not found: ${key}`, {
                bucket: this.bucket,
                key,
                code: 'NoSuchKey',
                statusCode: 404,
                retriable: false,
                suggestion: 'Ensure the key exists before attempting to read it.'
            });
            error.name = 'NoSuchKey';
            throw error;
        }
        this._touchKey(key);
        this.logger.debug({ key, size: obj.size }, `GET ${key} (${obj.size} bytes)`);
        const bodyStream = stream.Readable.from(obj.body);
        bodyStream.transformToString = async (encoding = 'utf-8') => {
            const chunks = [];
            for await (const chunk of bodyStream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks).toString(encoding);
        };
        bodyStream.transformToByteArray = async () => {
            const chunks = [];
            for await (const chunk of bodyStream) {
                chunks.push(chunk);
            }
            return new Uint8Array(Buffer.concat(chunks));
        };
        bodyStream.transformToWebStream = () => {
            return stream.Readable.toWeb(bodyStream);
        };
        return {
            Body: bodyStream,
            Metadata: { ...obj.metadata },
            ContentType: obj.contentType,
            ContentLength: obj.size,
            ETag: this._formatEtag(obj.etag),
            LastModified: new Date(obj.lastModified),
            ContentEncoding: obj.contentEncoding
        };
    }
    async head(key) {
        const obj = this.objects.get(key);
        if (!obj) {
            const error = new ResourceError(`Object not found: ${key}`, {
                bucket: this.bucket,
                key,
                code: 'NoSuchKey',
                statusCode: 404,
                retriable: false,
                suggestion: 'Ensure the key exists before attempting to read it.'
            });
            error.name = 'NoSuchKey';
            throw error;
        }
        this._touchKey(key);
        this.logger.debug({ key }, `HEAD ${key}`);
        return {
            Metadata: { ...obj.metadata },
            ContentType: obj.contentType,
            ContentLength: obj.size,
            ETag: this._formatEtag(obj.etag),
            LastModified: new Date(obj.lastModified),
            ContentEncoding: obj.contentEncoding
        };
    }
    async copy(from, to, params) {
        const { metadata, metadataDirective, contentType } = params;
        const source = this.objects.get(from);
        if (!source) {
            throw new ResourceError(`Source object not found: ${from}`, {
                bucket: this.bucket,
                key: from,
                code: 'NoSuchKey',
                statusCode: 404,
                retriable: false,
                suggestion: 'Copy requires an existing source object. Verify the source key before retrying.'
            });
        }
        let finalMetadata = { ...source.metadata };
        if (metadataDirective === 'REPLACE' && metadata) {
            finalMetadata = metadata;
        }
        else if (metadata) {
            finalMetadata = { ...finalMetadata, ...metadata };
        }
        await this.put(to, {
            body: source.body,
            metadata: finalMetadata,
            contentType: contentType || source.contentType,
            contentEncoding: source.contentEncoding
        });
        this.logger.debug({ from, to }, `COPY ${from} → ${to}`);
        const destination = this.objects.get(to);
        return {
            CopyObjectResult: {
                ETag: this._formatEtag(destination.etag),
                LastModified: new Date(destination.lastModified).toISOString()
            },
            BucketKeyEnabled: false,
            VersionId: null,
            ServerSideEncryption: null
        };
    }
    exists(key) {
        return this.objects.has(key);
    }
    async delete(key) {
        const obj = this.objects.get(key);
        const existed = Boolean(obj);
        if (obj) {
            this._trackMemory(-obj.size);
        }
        this.objects.delete(key);
        this.logger.debug({ key, existed }, `DELETE ${key} (existed: ${existed})`);
        if (this.autoPersist && this.persistPath) {
            await this.saveToDisk();
        }
        return {
            DeleteMarker: false,
            VersionId: null
        };
    }
    async deleteMultiple(keys) {
        const deleted = [];
        const errors = [];
        for (const key of keys) {
            try {
                await this.delete(key);
                deleted.push({ Key: key });
            }
            catch (error) {
                const err = error;
                errors.push({
                    Key: key,
                    Code: err.name || 'InternalError',
                    Message: err.message
                });
            }
        }
        this.logger.debug({ deletedCount: deleted.length, errorCount: errors.length }, `DELETE BATCH (${deleted.length} deleted, ${errors.length} errors)`);
        return { Deleted: deleted, Errors: errors };
    }
    async list(params) {
        const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
        const sortedKeys = Array.from(this.objects.keys()).sort();
        const prefixFilter = prefix || '';
        let filteredKeys = prefixFilter
            ? sortedKeys.filter(key => key.startsWith(prefixFilter))
            : sortedKeys;
        let startAfterKey = null;
        if (continuationToken) {
            startAfterKey = this._decodeContinuationToken(continuationToken);
        }
        else if (startAfter) {
            startAfterKey = startAfter;
        }
        if (startAfterKey) {
            filteredKeys = filteredKeys.filter(key => key > startAfterKey);
        }
        const contents = [];
        const commonPrefixes = new Set();
        let processed = 0;
        let lastKeyInPage = null;
        for (const key of filteredKeys) {
            if (processed >= maxKeys) {
                break;
            }
            const prefixEntry = delimiter ? this._extractCommonPrefix(prefixFilter, delimiter, key) : null;
            if (prefixEntry) {
                if (!commonPrefixes.has(prefixEntry)) {
                    commonPrefixes.add(prefixEntry);
                }
                continue;
            }
            const obj = this.objects.get(key);
            contents.push({
                Key: key,
                Size: obj.size,
                LastModified: new Date(obj.lastModified),
                ETag: this._formatEtag(obj.etag),
                StorageClass: 'STANDARD'
            });
            processed++;
            lastKeyInPage = key;
        }
        const hasMoreKeys = filteredKeys.length > contents.length;
        const nextContinuationToken = hasMoreKeys && lastKeyInPage
            ? this._encodeContinuationToken(lastKeyInPage)
            : null;
        this.logger.debug({ prefix, objectCount: contents.length, prefixCount: commonPrefixes.size, truncated: Boolean(nextContinuationToken) }, `LIST prefix="${prefix}" (${contents.length} objects, ${commonPrefixes.size} prefixes, truncated=${Boolean(nextContinuationToken)})`);
        return {
            Contents: contents,
            CommonPrefixes: Array.from(commonPrefixes).map(commonPrefix => ({ Prefix: commonPrefix })),
            IsTruncated: Boolean(nextContinuationToken),
            ContinuationToken: continuationToken || undefined,
            NextContinuationToken: nextContinuationToken,
            KeyCount: contents.length,
            MaxKeys: maxKeys,
            Prefix: prefix || undefined,
            Delimiter: delimiter || undefined,
            StartAfter: startAfter || undefined
        };
    }
    snapshot() {
        const snapshot = {
            timestamp: new Date().toISOString(),
            bucket: this.bucket,
            objectCount: this.objects.size,
            objects: {}
        };
        for (const [key, obj] of this.objects.entries()) {
            snapshot.objects[key] = {
                body: obj.body.toString('base64'),
                metadata: obj.metadata,
                contentType: obj.contentType,
                etag: obj.etag,
                lastModified: obj.lastModified,
                size: obj.size,
                contentEncoding: obj.contentEncoding,
                contentLength: obj.contentLength
            };
        }
        return snapshot;
    }
    restore(snapshot) {
        if (!snapshot || !snapshot.objects) {
            throw new ValidationError('Invalid snapshot format', {
                field: 'snapshot',
                retriable: false,
                suggestion: 'Provide the snapshot returned by MemoryStorage.snapshot() before calling restore().'
            });
        }
        this.objects.clear();
        this.currentMemoryBytes = 0;
        let totalBytes = 0;
        for (const [key, obj] of Object.entries(snapshot.objects)) {
            const body = Buffer.from(obj.body, 'base64');
            totalBytes += body.length;
            this.objects.set(key, {
                body,
                metadata: obj.metadata,
                contentType: obj.contentType,
                etag: obj.etag,
                lastModified: obj.lastModified,
                size: obj.size,
                contentEncoding: obj.contentEncoding,
                contentLength: obj.contentLength
            });
        }
        this._trackMemory(totalBytes);
        this.logger.debug({ objectCount: this.objects.size }, `Restored snapshot with ${this.objects.size} objects`);
    }
    async saveToDisk(customPath) {
        const path = customPath || this.persistPath;
        if (!path) {
            throw new ValidationError('No persist path configured', {
                field: 'persistPath',
                retriable: false,
                suggestion: 'Provide a persistPath when creating MemoryClient or pass a custom path to saveToDisk().'
            });
        }
        const snapshot = this.snapshot();
        const json = JSON.stringify(snapshot, null, 2);
        const [ok, err] = await tryFn(() => promises$1.writeFile(path, json, 'utf-8'));
        if (!ok) {
            throw new ResourceError(`Failed to save to disk: ${err.message}`, {
                bucket: this.bucket,
                operation: 'saveToDisk',
                statusCode: 500,
                retriable: false,
                suggestion: 'Check filesystem permissions and available disk space, then retry.',
                original: err
            });
        }
        this.logger.debug({ objectCount: this.objects.size, path }, `Saved ${this.objects.size} objects to ${path}`);
        return path;
    }
    async loadFromDisk(customPath) {
        const path = customPath || this.persistPath;
        if (!path) {
            throw new ValidationError('No persist path configured', {
                field: 'persistPath',
                retriable: false,
                suggestion: 'Provide a persistPath when creating MemoryClient or pass a custom path to loadFromDisk().'
            });
        }
        const [ok, err, json] = await tryFn(() => promises$1.readFile(path, 'utf-8'));
        if (!ok) {
            throw new ResourceError(`Failed to load from disk: ${err.message}`, {
                bucket: this.bucket,
                operation: 'loadFromDisk',
                statusCode: 500,
                retriable: false,
                suggestion: 'Verify the file exists and is readable, then retry.',
                original: err
            });
        }
        const snapshot = JSON.parse(json);
        this.restore(snapshot);
        this.logger.debug({ objectCount: this.objects.size, path }, `Loaded ${this.objects.size} objects from ${path}`);
        return snapshot;
    }
    getStats() {
        return {
            objectCount: this.objects.size,
            totalSize: this.currentMemoryBytes,
            totalSizeFormatted: this._formatBytes(this.currentMemoryBytes),
            keys: this.getKeys(),
            bucket: this.bucket,
            maxMemoryMB: this.maxMemoryMB,
            memoryUsagePercent: this.maxMemoryBytes > 0
                ? Math.round((this.currentMemoryBytes / this.maxMemoryBytes) * 100)
                : 0,
            evictions: this._stats.evictions,
            evictedBytes: this._stats.evictedBytes,
            peakMemoryBytes: this._stats.peakMemoryBytes
        };
    }
    getKeys() {
        return Array.from(this.objects.keys()).sort();
    }
    _formatBytes(bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    _trackMemory(deltaBytes) {
        this.currentMemoryBytes += deltaBytes;
        if (this.currentMemoryBytes > this._stats.peakMemoryBytes) {
            this._stats.peakMemoryBytes = this.currentMemoryBytes;
        }
    }
    _touchKey(key) {
        const obj = this.objects.get(key);
        if (obj) {
            this.objects.delete(key);
            this.objects.set(key, obj);
        }
    }
    _evictIfNeeded(requiredBytes = 0) {
        if (!this.evictionEnabled)
            return 0;
        const targetBytes = this.maxMemoryBytes;
        const neededSpace = this.currentMemoryBytes + requiredBytes;
        if (neededSpace <= targetBytes)
            return 0;
        let evictedBytes = 0;
        const keysToEvict = [];
        for (const [key, obj] of this.objects) {
            if (this.currentMemoryBytes - evictedBytes + requiredBytes <= targetBytes) {
                break;
            }
            keysToEvict.push(key);
            evictedBytes += obj.size;
        }
        for (const key of keysToEvict) {
            const obj = this.objects.get(key);
            if (obj) {
                this.objects.delete(key);
                this._stats.evictions++;
                this._stats.evictedBytes += obj.size;
            }
        }
        this.currentMemoryBytes -= evictedBytes;
        if (keysToEvict.length > 0) {
            this.logger.debug({ evicted: keysToEvict.length, bytes: evictedBytes }, `LRU evicted ${keysToEvict.length} objects (${this._formatBytes(evictedBytes)})`);
        }
        return evictedBytes;
    }
    clear() {
        this.objects.clear();
        this.currentMemoryBytes = 0;
        this.logger.debug('Cleared all objects');
    }
    resetStats() {
        this._stats = {
            evictions: 0,
            evictedBytes: 0,
            peakMemoryBytes: this.currentMemoryBytes
        };
    }
}

const pathPosix$1 = path.posix;
const globalStorageRegistry$1 = new Map();
class MemoryClient extends EventEmitter {
    id;
    logLevel;
    logger;
    taskExecutorMonitoring;
    taskManager;
    storage;
    bucket;
    keyPrefix;
    region;
    _keyPrefixForStrip;
    connectionString;
    config;
    constructor(config = {}) {
        super();
        this.id = config.id || idGenerator(77);
        this.logLevel = config.logLevel || 'info';
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            this.logger = createLogger({ name: 'MemoryClient', level: this.logLevel });
        }
        this.taskExecutorMonitoring = config.taskExecutorMonitoring
            ? { ...config.taskExecutorMonitoring }
            : null;
        if (config.taskExecutor) {
            this.taskManager = config.taskExecutor;
        }
        else {
            this.taskManager = new TasksRunner({
                concurrency: config.concurrency || 5,
                retries: config.retries ?? 3,
                retryDelay: config.retryDelay ?? 1000,
                timeout: config.timeout ?? 30000,
                retryableErrors: config.retryableErrors || [],
                monitoring: this.taskExecutorMonitoring || undefined
            });
        }
        this.bucket = config.bucket || 's3db';
        this.keyPrefix = config.keyPrefix || '';
        this.region = config.region || 'memory';
        this._keyPrefixForStrip = this.keyPrefix ? pathPosix$1.join(this.keyPrefix, '') : '';
        this.connectionString = `memory://${this.bucket}${this.keyPrefix ? '/' + this.keyPrefix : ''}`;
        const storageKey = `${this.bucket}`;
        if (!globalStorageRegistry$1.has(storageKey)) {
            globalStorageRegistry$1.set(storageKey, new MemoryStorage({
                bucket: this.bucket,
                enforceLimits: config.enforceLimits || false,
                metadataLimit: config.metadataLimit || 2048,
                maxObjectSize: config.maxObjectSize || 5 * 1024 * 1024 * 1024,
                persistPath: config.persistPath,
                autoPersist: config.autoPersist,
                logLevel: this.logLevel,
                maxMemoryMB: config.maxMemoryMB,
                evictionEnabled: config.evictionEnabled
            }));
        }
        this.storage = globalStorageRegistry$1.get(storageKey);
        this.config = {
            bucket: this.bucket,
            keyPrefix: this.keyPrefix,
            region: this.region,
            endpoint: 'memory://',
            forcePathStyle: true
        };
        this.logger.debug({ id: this.id, bucket: this.bucket }, `Initialized (id: ${this.id}, bucket: ${this.bucket})`);
    }
    getQueueStats() {
        if (this.taskManager && typeof this.taskManager.getStats === 'function') {
            return this.taskManager.getStats();
        }
        return null;
    }
    getAggregateMetrics(since = 0) {
        if (this.taskManager && typeof this.taskManager.getAggregateMetrics === 'function') {
            return this.taskManager.getAggregateMetrics(since);
        }
        return null;
    }
    async sendCommand(command) {
        const commandName = command.constructor.name;
        const input = command.input || {};
        this.emit('cl:request', commandName, input);
        this.emit('command.request', commandName, input);
        let response;
        try {
            switch (commandName) {
                case 'PutObjectCommand':
                    response = await this._handlePutObject(input);
                    break;
                case 'GetObjectCommand':
                    response = await this._handleGetObject(input);
                    break;
                case 'HeadObjectCommand':
                    response = await this._handleHeadObject(input);
                    break;
                case 'CopyObjectCommand':
                    response = await this._handleCopyObject(input);
                    break;
                case 'DeleteObjectCommand':
                    response = await this._handleDeleteObject(input);
                    break;
                case 'DeleteObjectsCommand':
                    response = await this._handleDeleteObjects(input);
                    break;
                case 'ListObjectsV2Command':
                    response = await this._handleListObjects(input);
                    break;
                default:
                    throw new DatabaseError(`Unsupported command: ${commandName}`, {
                        operation: 'sendCommand',
                        statusCode: 400,
                        retriable: false,
                        suggestion: 'Use one of the supported commands: PutObject, GetObject, HeadObject, CopyObject, DeleteObject, DeleteObjects, or ListObjectsV2.'
                    });
            }
            this.emit('cl:response', commandName, response, input);
            this.emit('command.response', commandName, response, input);
            return response;
        }
        catch (error) {
            if (error instanceof BaseError) {
                throw error;
            }
            const mappedError = mapAwsError(error, {
                bucket: this.bucket,
                key: input.Key,
                commandName,
                commandInput: input
            });
            throw mappedError;
        }
    }
    async _handlePutObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const metadata = this._encodeMetadata(input.Metadata || {});
        const contentType = input.ContentType;
        const body = input.Body;
        const contentEncoding = input.ContentEncoding;
        const contentLength = input.ContentLength;
        const ifMatch = input.IfMatch;
        const ifNoneMatch = input.IfNoneMatch;
        return await this.storage.put(key, {
            body: body,
            metadata,
            contentType,
            contentEncoding,
            contentLength,
            ifMatch,
            ifNoneMatch
        });
    }
    async _handleGetObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const response = await this.storage.get(key);
        return this._decodeMetadataResponse(response);
    }
    async _handleHeadObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const response = await this.storage.head(key);
        return this._decodeMetadataResponse(response);
    }
    async _handleCopyObject(input) {
        const { sourceBucket, sourceKey } = this._parseCopySource(input.CopySource);
        if (sourceBucket !== this.bucket) {
            throw new DatabaseError(`Cross-bucket copy is not supported in MemoryClient (requested ${sourceBucket} → ${this.bucket})`, {
                operation: 'CopyObject',
                retriable: false,
                suggestion: 'Instantiate a MemoryClient with the desired bucket or copy within the same bucket.'
            });
        }
        const destinationKey = this._applyKeyPrefix(input.Key);
        const encodedMetadata = this._encodeMetadata(input.Metadata);
        return await this.storage.copy(sourceKey, destinationKey, {
            metadata: encodedMetadata,
            metadataDirective: input.MetadataDirective,
            contentType: input.ContentType
        });
    }
    async _handleDeleteObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        return await this.storage.delete(key);
    }
    async _handleDeleteObjects(input) {
        const objects = input.Delete?.Objects || [];
        const keys = objects.map(obj => this._applyKeyPrefix(obj.Key));
        return await this.storage.deleteMultiple(keys);
    }
    async _handleListObjects(input) {
        const fullPrefix = this._applyKeyPrefix(input.Prefix || '');
        const params = {
            prefix: fullPrefix,
            delimiter: input.Delimiter,
            maxKeys: input.MaxKeys,
            continuationToken: input.ContinuationToken
        };
        if (input.StartAfter) {
            params.startAfter = this._applyKeyPrefix(input.StartAfter || undefined);
        }
        const response = await this.storage.list(params);
        return this._normalizeListResponse(response);
    }
    async putObject(params) {
        const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
        const fullKey = this._applyKeyPrefix(key);
        const stringMetadata = this._encodeMetadata(metadata) || {};
        const input = { Key: key, Metadata: metadata, ContentType: contentType, Body: body, ContentEncoding: contentEncoding, ContentLength: contentLength, IfMatch: ifMatch, IfNoneMatch: ifNoneMatch };
        const response = await this.storage.put(fullKey, {
            body: body,
            metadata: stringMetadata,
            contentType,
            contentEncoding,
            contentLength,
            ifMatch,
            ifNoneMatch
        });
        this.emit('cl:response', 'PutObjectCommand', response, input);
        return response;
    }
    async getObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.get(fullKey);
        const decodedResponse = this._decodeMetadataResponse(response);
        this.emit('cl:response', 'GetObjectCommand', decodedResponse, input);
        return decodedResponse;
    }
    async headObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.head(fullKey);
        const decodedResponse = this._decodeMetadataResponse(response);
        this.emit('cl:response', 'HeadObjectCommand', decodedResponse, input);
        return decodedResponse;
    }
    async copyObject(params) {
        const { from, to, metadata, metadataDirective, contentType } = params;
        const fullFrom = this._applyKeyPrefix(from);
        const fullTo = this._applyKeyPrefix(to);
        const encodedMetadata = this._encodeMetadata(metadata);
        const input = { CopySource: from, Key: to, Metadata: metadata, MetadataDirective: metadataDirective, ContentType: contentType };
        const response = await this.storage.copy(fullFrom, fullTo, {
            metadata: encodedMetadata,
            metadataDirective,
            contentType
        });
        this.emit('cl:response', 'CopyObjectCommand', response, input);
        return response;
    }
    async exists(key) {
        const fullKey = this._applyKeyPrefix(key);
        return this.storage.exists(fullKey);
    }
    async deleteObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.delete(fullKey);
        this.emit('cl:response', 'DeleteObjectCommand', response, input);
        return response;
    }
    async deleteObjects(keys) {
        const fullKeys = keys.map(key => this._applyKeyPrefix(key));
        const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };
        const batches = lodashEs.chunk(fullKeys, this.taskManager.concurrency || 5);
        const allResults = { Deleted: [], Errors: [] };
        const { results } = await this.taskManager.process(batches, async (batch) => {
            return await this.storage.deleteMultiple(batch);
        });
        for (const result of results) {
            allResults.Deleted.push(...result.Deleted.map(item => ({ Key: this._stripKeyPrefix(item.Key) })));
            allResults.Errors.push(...result.Errors);
        }
        this.emit('cl:response', 'DeleteObjectsCommand', allResults, input);
        return allResults;
    }
    async listObjects(params = {}) {
        const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
        const fullPrefix = this._applyKeyPrefix(prefix || '');
        const listParams = {
            prefix: fullPrefix,
            delimiter,
            maxKeys,
            continuationToken
        };
        if (startAfter) {
            listParams.startAfter = this._applyKeyPrefix(startAfter);
        }
        const input = { Prefix: prefix, Delimiter: delimiter, MaxKeys: maxKeys, ContinuationToken: continuationToken, StartAfter: startAfter };
        const response = await this.storage.list(listParams);
        const normalized = this._normalizeListResponse(response);
        this.emit('cl:response', 'ListObjectsV2Command', normalized, input);
        return normalized;
    }
    async getKeysPage(params = {}) {
        const { prefix = '', offset = 0, amount = 100 } = params;
        let keys = [];
        let truncated = true;
        let continuationToken;
        if (offset > 0) {
            const fullPrefix = this._applyKeyPrefix(prefix || '');
            const response = await this.storage.list({
                prefix: fullPrefix,
                maxKeys: offset + amount
            });
            keys = (response.Contents || [])
                .map(x => this._stripKeyPrefix(x.Key))
                .slice(offset, offset + amount);
            truncated = Boolean(response.NextContinuationToken);
            continuationToken = response.NextContinuationToken || undefined;
        }
        else {
            while (truncated) {
                const remaining = amount - keys.length;
                if (remaining <= 0) {
                    break;
                }
                const res = await this.listObjects({
                    prefix,
                    continuationToken,
                    maxKeys: remaining
                });
                if (res.Contents) {
                    keys = keys.concat(res.Contents.map(x => x.Key));
                }
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken || undefined;
                if (keys.length >= amount) {
                    keys = keys.slice(0, amount);
                    break;
                }
            }
        }
        this.emit('cl:GetKeysPage', keys, params);
        return keys;
    }
    async getAllKeys(params = {}) {
        const { prefix = '' } = params;
        const fullPrefix = this._applyKeyPrefix(prefix || '');
        const response = await this.storage.list({
            prefix: fullPrefix,
            maxKeys: Number.MAX_SAFE_INTEGER
        });
        const keys = (response.Contents || []).map(x => this._stripKeyPrefix(x.Key));
        this.emit('cl:GetAllKeys', keys, params);
        return keys;
    }
    async count(params = {}) {
        const { prefix = '' } = params;
        const keys = await this.getAllKeys({ prefix });
        const count = keys.length;
        this.emit('cl:Count', count, { prefix });
        return count;
    }
    async deleteAll(params = {}) {
        const { prefix = '' } = params;
        const keys = await this.getAllKeys({ prefix });
        let totalDeleted = 0;
        if (keys.length > 0) {
            const result = await this.deleteObjects(keys);
            totalDeleted = result.Deleted.length;
            this.emit('deleteAll', {
                prefix,
                batch: totalDeleted,
                total: totalDeleted
            });
        }
        this.emit('deleteAllComplete', {
            prefix,
            totalDeleted
        });
        return totalDeleted;
    }
    async getContinuationTokenAfterOffset(params = {}) {
        const { prefix = '', offset = 1000 } = params;
        if (offset === 0)
            return null;
        const keys = await this.getAllKeys({ prefix });
        if (offset >= keys.length) {
            this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
            return null;
        }
        const keyForToken = keys[offset];
        const fullKey = this._applyKeyPrefix(keyForToken || '');
        const token = this._encodeContinuationTokenKey(fullKey);
        this.emit('cl:GetContinuationTokenAfterOffset', token, { prefix, offset });
        return token;
    }
    async moveObject(params) {
        const { from, to } = params;
        const [ok, err] = await tryFn(async () => {
            await this.copyObject({ from, to, metadataDirective: 'COPY' });
            await this.deleteObject(from);
        });
        if (!ok) {
            throw new DatabaseError('Unknown error in moveObject', {
                bucket: this.bucket,
                from,
                to,
                original: err
            });
        }
        return true;
    }
    async moveAllObjects(params) {
        const { prefixFrom, prefixTo } = params;
        const keys = await this.getAllKeys({ prefix: prefixFrom });
        const { results, errors } = await this.taskManager.process(keys, async (key) => {
            const to = key.replace(prefixFrom, prefixTo);
            await this.moveObject({ from: key, to });
            return { from: key, to };
        });
        this.emit('moveAllObjects', { results, errors });
        if (errors.length > 0) {
            const error = new Error('Some objects could not be moved');
            error.context = {
                bucket: this.bucket,
                operation: 'moveAllObjects',
                prefixFrom,
                prefixTo,
                totalKeys: keys.length,
                failedCount: errors.length,
                successCount: results.length,
                errors
            };
            throw error;
        }
        return results;
    }
    snapshot() {
        return this.storage.snapshot();
    }
    restore(snapshot) {
        this.storage.restore(snapshot);
    }
    async clear() {
        this.storage.clear();
    }
    getStats() {
        return this.storage.getStats();
    }
    destroy() {
        // MemoryClient doesn't have cleanup, but interface requires it
    }
    _encodeMetadata(metadata) {
        if (!metadata)
            return undefined;
        const encoded = {};
        for (const [rawKey, value] of Object.entries(metadata)) {
            const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
            const { encoded: encodedValue } = metadataEncode(value);
            encoded[validKey] = encodedValue;
        }
        return encoded;
    }
    _decodeMetadataResponse(response) {
        const decodedMetadata = {};
        if (response.Metadata) {
            for (const [k, v] of Object.entries(response.Metadata)) {
                decodedMetadata[k] = metadataDecode(v);
            }
        }
        return {
            ...response,
            Metadata: decodedMetadata
        };
    }
    _applyKeyPrefix(key) {
        if (!this.keyPrefix) {
            if (key === undefined || key === null) {
                return '';
            }
            return key;
        }
        if (key === undefined || key === null || key === '') {
            return pathPosix$1.join(this.keyPrefix, '');
        }
        return pathPosix$1.join(this.keyPrefix, key);
    }
    _stripKeyPrefix(key = '') {
        if (!this.keyPrefix) {
            return key;
        }
        const normalizedPrefix = this._keyPrefixForStrip;
        if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
            return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
        }
        return key;
    }
    _encodeContinuationTokenKey(key) {
        return Buffer.from(String(key), 'utf8').toString('base64');
    }
    _parseCopySource(copySource) {
        const trimmedSource = String(copySource || '').replace(/^\//, '');
        const [sourcePath] = trimmedSource.split('?');
        const decodedSource = decodeURIComponent(sourcePath ?? '');
        const [sourceBucket, ...sourceKeyParts] = decodedSource.split('/');
        if (!sourceBucket || sourceKeyParts.length === 0) {
            throw new DatabaseError(`Invalid CopySource value: ${copySource}`, {
                operation: 'CopyObject',
                retriable: false,
                suggestion: 'Provide CopySource in the format "<bucket>/<key>" as expected by AWS S3.'
            });
        }
        return {
            sourceBucket,
            sourceKey: sourceKeyParts.join('/')
        };
    }
    _normalizeListResponse(response) {
        const rawContents = Array.isArray(response.Contents) ? response.Contents : [];
        const contents = rawContents.map(item => ({
            ...item,
            Key: this._stripKeyPrefix(item.Key)
        }));
        const rawPrefixes = Array.isArray(response.CommonPrefixes) ? response.CommonPrefixes : [];
        const commonPrefixes = rawPrefixes.map(({ Prefix }) => ({
            Prefix: this._stripKeyPrefix(Prefix)
        }));
        return {
            Contents: contents,
            CommonPrefixes: commonPrefixes,
            IsTruncated: response.IsTruncated,
            ContinuationToken: response.ContinuationToken,
            NextContinuationToken: response.NextContinuationToken,
            KeyCount: contents.length,
            MaxKeys: response.MaxKeys,
            Prefix: this.keyPrefix ? undefined : response.Prefix,
            Delimiter: response.Delimiter,
            StartAfter: response.StartAfter
        };
    }
    static clearBucketStorage(bucket) {
        const storage = globalStorageRegistry$1.get(bucket);
        if (storage) {
            storage.clear();
        }
        globalStorageRegistry$1.delete(bucket);
    }
    static clearAllStorage() {
        for (const storage of globalStorageRegistry$1.values()) {
            storage.clear();
        }
        globalStorageRegistry$1.clear();
    }
}

function bumpProcessMaxListeners(additionalListeners) {
    if (additionalListeners <= 0 || typeof process === 'undefined')
        return;
    if (typeof process.getMaxListeners !== 'function' || typeof process.setMaxListeners !== 'function')
        return;
    const current = process.getMaxListeners();
    if (current === 0)
        return;
    process.setMaxListeners(current + additionalListeners);
}

function createStepExpression(value) {
    return ['*', '/', String(value)].join('');
}
function createHourlyStepExpression(value) {
    return ['0 ', createStepExpression(value), ' * * *'].join('');
}
function createDailyStepExpression(value) {
    return ['0 0 ', createStepExpression(value), ' * *'].join('');
}
function intervalToCron(ms) {
    const seconds = Math.max(1, Math.floor(ms / 1000));
    if (seconds < 60) {
        return `${createStepExpression(seconds)} * * * * *`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${createStepExpression(minutes)} * * * *`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return createHourlyStepExpression(hours);
    }
    const days = Math.floor(hours / 24);
    return createDailyStepExpression(days);
}
class CronManager {
    options;
    logger;
    jobs;
    _cron;
    _destroyed;
    _signalHandlersSetup;
    _boundShutdownHandler;
    _boundErrorHandler;
    disabled;
    constructor(options = {}) {
        const envDisabled = typeof process !== 'undefined' && process.env.S3DB_DISABLE_CRON === 'true';
        const explicitDisabled = typeof options.disabled === 'boolean' ? options.disabled : undefined;
        const isDisabled = explicitDisabled !== undefined ? explicitDisabled : envDisabled;
        this.options = {
            logLevel: options.logLevel || 'info',
            shutdownTimeout: options.shutdownTimeout || 30000,
            exitOnSignal: options.exitOnSignal !== false,
            disabled: isDisabled,
        };
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = this.options.logLevel;
            this.logger = createLogger({ name: 'CronManager', level: logLevel });
        }
        this.jobs = new Map();
        this._cron = null;
        this._destroyed = false;
        this._signalHandlersSetup = false;
        this.disabled = this.options.disabled;
        this.logger.debug({ disabled: this.disabled }, 'CronManager initialized');
        if (!this.disabled) {
            this._setupSignalHandlers();
        }
    }
    _setupSignalHandlers() {
        if (this.disabled || this._signalHandlersSetup)
            return;
        this._boundShutdownHandler = this._handleShutdown.bind(this);
        this._boundErrorHandler = this._handleError.bind(this);
        bumpProcessMaxListeners(5);
        process.once('SIGTERM', this._boundShutdownHandler);
        process.once('SIGINT', this._boundShutdownHandler);
        process.once('beforeExit', this._boundShutdownHandler);
        process.once('uncaughtException', this._boundErrorHandler);
        process.once('unhandledRejection', this._boundErrorHandler);
        this._signalHandlersSetup = true;
        this.logger.debug('Signal handlers registered');
    }
    removeSignalHandlers() {
        if (!this._signalHandlersSetup)
            return;
        if (this._boundShutdownHandler) {
            process.removeListener('SIGTERM', this._boundShutdownHandler);
            process.removeListener('SIGINT', this._boundShutdownHandler);
            process.removeListener('beforeExit', this._boundShutdownHandler);
        }
        if (this._boundErrorHandler) {
            process.removeListener('uncaughtException', this._boundErrorHandler);
            process.removeListener('unhandledRejection', this._boundErrorHandler);
        }
        this._signalHandlersSetup = false;
        this.logger.debug('Signal handlers removed');
    }
    _handleShutdown(signal) {
        if (this._destroyed)
            return;
        this.logger.debug({ signal }, `Received ${signal}, shutting down...`);
        this.shutdown({ signal })
            .then(() => {
            if (this.options.exitOnSignal) {
                process.exit(0);
            }
        })
            .catch((error) => {
            this.logger.error({ error: error.message, stack: error.stack }, 'Shutdown error');
            if (this.options.exitOnSignal) {
                process.exit(1);
            }
        });
    }
    _handleError(error) {
        this.logger.error({ error: error.message, stack: error.stack }, 'Uncaught error');
        this.shutdown({ error })
            .then(() => {
            if (this.options.exitOnSignal) {
                process.exit(1);
            }
        })
            .catch(() => {
            if (this.options.exitOnSignal) {
                process.exit(1);
            }
        });
    }
    async _loadCron() {
        if (this._cron)
            return this._cron;
        const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
        try {
            const cronModule = await import('node-cron');
            this._cron = cronModule.default || cronModule;
            this.logger.debug('node-cron loaded');
            return this._cron;
        }
        catch (error) {
            if (isTestEnv) {
                this.logger.warn({ error: error.message }, `Falling back to in-memory cron stub for tests`);
                this._cron = this._createTestCronStub();
                return this._cron;
            }
            throw new Error('Failed to load the bundled node-cron dependency. Try reinstalling packages with `pnpm install`.\n' +
                'Error: ' + error.message);
        }
    }
    async schedule(expression, fn, name, options = {}) {
        if (this._destroyed) {
            this.logger.warn({ name }, `Cannot schedule job '${name}' - manager is destroyed`);
            return null;
        }
        if (this.disabled) {
            this.logger.debug({ name }, `Scheduling disabled - skipping job '${name}'`);
            return this._createStubTask(name, fn);
        }
        const { replace = false, ...cronOptions } = options || {};
        if (this.jobs.has(name)) {
            if (!replace) {
                throw new Error(`[CronManager] Job '${name}' already exists`);
            }
            const stopped = this.stop(name);
            if (!stopped && this.jobs.has(name)) {
                this.jobs.delete(name);
            }
            this.logger.debug({ name }, `Replaced existing job '${name}'`);
        }
        const cron = await this._loadCron();
        const task = cron.schedule(expression, fn, {
            scheduled: cronOptions.scheduled !== false,
            timezone: cronOptions.timezone,
            recoverMissedExecutions: cronOptions.recoverMissedExecutions || false,
        });
        if (cronOptions.scheduled !== false && task?.start) {
            task.start();
        }
        this.jobs.set(name, {
            task,
            expression,
            fn,
            options: { ...cronOptions, replace },
            createdAt: Date.now(),
        });
        this.logger.debug({ name, expression }, `Scheduled job '${name}': ${expression}`);
        return task;
    }
    async scheduleInterval(ms, fn, name, options = {}) {
        const expression = intervalToCron(ms);
        return this.schedule(expression, fn, name, options);
    }
    stop(name) {
        const jobName = typeof name === 'string' ? name : String(name);
        if (!this.jobs.has(name)) {
            this.logger.trace?.({ name: jobName }, `Job '${jobName}' not found`);
            return false;
        }
        const entry = this.jobs.get(name);
        try {
            entry.task?.stop?.();
            entry.task?.destroy?.();
            this.jobs.delete(name);
            this.logger.debug({ name }, `Stopped job '${name}'`);
            return true;
        }
        catch (error) {
            this.logger.error({ name, error: error.message, stack: error.stack }, `Error stopping job '${name}'`);
            return false;
        }
    }
    getStats() {
        const stats = {
            totalJobs: this.jobs.size,
            jobs: [],
            isDestroyed: this._destroyed,
        };
        for (const [name, entry] of this.jobs.entries()) {
            stats.jobs.push({
                name,
                expression: entry.expression,
                createdAt: entry.createdAt,
                uptime: Date.now() - entry.createdAt,
            });
        }
        return stats;
    }
    isDestroyed() {
        return this._destroyed;
    }
    async shutdown(options = {}) {
        if (this._destroyed) {
            this.logger.debug('Already destroyed');
            return;
        }
        const timeout = options.timeout || this.options.shutdownTimeout;
        this.logger.debug({ jobCount: this.jobs.size }, `Shutting down ${this.jobs.size} jobs...`);
        if (this.disabled) {
            this.jobs.clear();
            this._destroyed = true;
            return;
        }
        const stopPromises = [];
        for (const [name, entry] of this.jobs.entries()) {
            const stopPromise = new Promise((resolve, reject) => {
                try {
                    entry.task?.stop?.();
                    entry.task?.destroy?.();
                    resolve();
                }
                catch (error) {
                    reject(error);
                }
            });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Stop timeout for job '${name}'`)), timeout));
            stopPromises.push(Promise.race([stopPromise, timeoutPromise])
                .catch(error => {
                this.logger.warn({ name, error: error.message }, `Error stopping job '${name}'`);
            }));
        }
        await Promise.allSettled(stopPromises);
        this.jobs.clear();
        this._destroyed = true;
        this.logger.debug('Shutdown complete');
    }
    _createStubTask(name, fn) {
        const logger = this.logger;
        return {
            start() { },
            stop() { },
            destroy() { },
            async run(...args) {
                try {
                    await fn?.();
                }
                catch (error) {
                    logger.error({ name, error: error.message, stack: error.stack }, `Stub task '${name}' execution error`);
                }
            }
        };
    }
    _inferIntervalFromExpression(expression) {
        if (!expression || typeof expression !== 'string') {
            return 60_000;
        }
        const parts = expression.trim().split(/\s+/);
        if (parts.length === 6) {
            const secondsPart = parts[0] ?? '';
            const match = secondsPart.match(/^\*\/(\d+)$/);
            if (match && match[1]) {
                const step = parseInt(match[1], 10);
                if (!Number.isNaN(step) && step > 0) {
                    return Math.max(step * 1000, 10);
                }
            }
        }
        if (parts.length >= 5) {
            const minutesPart = parts[0] ?? '';
            const match = minutesPart.match(/^\*\/(\d+)$/);
            if (match && match[1]) {
                const step = parseInt(match[1], 10);
                if (!Number.isNaN(step) && step > 0) {
                    return Math.max(step * 60_000, 10);
                }
            }
        }
        return 60_000;
    }
    _createTestCronStub() {
        const setIntervalFn = (globalThis.originalSetInterval ||
            globalThis.setInterval ||
            setInterval).bind(globalThis);
        const clearIntervalFn = (globalThis.originalClearInterval ||
            globalThis.clearInterval ||
            clearInterval).bind(globalThis);
        const logger = this.logger;
        const inferInterval = this._inferIntervalFromExpression.bind(this);
        return {
            schedule: (expression, fn, options = {}) => {
                const intervalMs = inferInterval(expression);
                let timerId = null;
                const run = async () => {
                    try {
                        await fn?.();
                    }
                    catch (err) {
                        logger.warn({ error: err?.message || String(err) }, 'Test cron stub task error');
                    }
                };
                const start = () => {
                    if (timerId !== null)
                        return;
                    timerId = setIntervalFn(run, intervalMs);
                };
                const stop = () => {
                    if (timerId === null)
                        return;
                    clearIntervalFn(timerId);
                    timerId = null;
                };
                const destroy = () => {
                    stop();
                };
                if (options.scheduled !== false) {
                    start();
                }
                return {
                    start,
                    stop,
                    destroy,
                    run,
                };
            },
        };
    }
}
let _globalCronManager = null;
function getCronManager(options = {}) {
    if (!_globalCronManager) {
        _globalCronManager = new CronManager(options);
    }
    return _globalCronManager;
}

class FileSystemStorage {
    basePath;
    bucket;
    enforceLimits;
    metadataLimit;
    maxObjectSize;
    logLevel;
    enableCompression;
    compressionThreshold;
    compressionLevel;
    enableTTL;
    defaultTTL;
    cleanupInterval;
    enableLocking;
    lockTimeout;
    enableBackup;
    backupSuffix;
    enableJournal;
    journalFile;
    enableStats;
    isWindows;
    locks;
    stats;
    logger;
    cronManager;
    cleanupJobName;
    constructor(config = {}) {
        this.basePath = config.basePath || './s3db-data';
        this.bucket = config.bucket || 's3db';
        this.enforceLimits = Boolean(config.enforceLimits);
        this.metadataLimit = config.metadataLimit ?? 2048;
        this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024;
        this.logLevel = config.logLevel || 'info';
        const compressionConfig = config.compression || {};
        this.enableCompression = Boolean(compressionConfig.enabled);
        this.compressionThreshold = compressionConfig.threshold ?? 1024;
        this.compressionLevel = compressionConfig.level ?? 6;
        const ttlConfig = config.ttl || {};
        this.enableTTL = Boolean(ttlConfig.enabled);
        this.defaultTTL = ttlConfig.defaultTTL ?? 3600000;
        this.cleanupInterval = ttlConfig.cleanupInterval ?? 300000;
        const lockingConfig = config.locking || {};
        this.enableLocking = Boolean(lockingConfig.enabled);
        this.lockTimeout = lockingConfig.timeout ?? 5000;
        const backupConfig = config.backup || {};
        this.enableBackup = Boolean(backupConfig.enabled);
        this.backupSuffix = backupConfig.suffix ?? '.bak';
        const journalConfig = config.journal || {};
        this.enableJournal = Boolean(journalConfig.enabled);
        this.journalFile = journalConfig.file ?? 'operations.journal';
        const statsConfig = config.stats || {};
        this.enableStats = Boolean(statsConfig.enabled);
        this.isWindows = os.platform() === 'win32';
        this.basePath = path.resolve(this.basePath);
        this.locks = new Map();
        this.stats = {
            gets: 0,
            puts: 0,
            deletes: 0,
            errors: 0,
            compressionSaved: 0,
            totalCompressed: 0,
            totalUncompressed: 0
        };
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            this.logger = createLogger({ name: 'FileSystemStorage', level: this.logLevel });
        }
        this.cronManager = getCronManager();
        this.cleanupJobName = null;
        if (this.enableTTL && this.cleanupInterval > 0) {
            this._initCleanup();
        }
        const features = [];
        if (this.enableCompression)
            features.push(`compression:${this.compressionThreshold}b`);
        if (this.enableTTL)
            features.push(`ttl:${this.defaultTTL}ms`);
        if (this.enableLocking)
            features.push('locking');
        if (this.enableBackup)
            features.push('backup');
        if (this.enableJournal)
            features.push('journal');
        if (this.enableStats)
            features.push('stats');
        this.logger.debug({ basePath: this.basePath, features }, `Initialized (basePath: ${this.basePath}${features.length ? ', features: ' + features.join(', ') : ''})`);
    }
    _keyToPath(key) {
        const normalizedKey = key.replace(/\//g, path.sep);
        return path.join(this.basePath, normalizedKey);
    }
    _pathToKey(filePath) {
        const relativePath = path.relative(this.basePath, filePath);
        return relativePath.split(path.sep).join('/');
    }
    _getObjectPath(key) {
        return this._keyToPath(key);
    }
    _getMetadataPath(key) {
        return this._keyToPath(key) + '.meta.json';
    }
    async _ensureDirectory(filePath) {
        const dir = path.dirname(filePath);
        const [ok, err] = await tryFn(() => promises$1.mkdir(dir, { recursive: true }));
        if (!ok && err.code !== 'EEXIST') {
            throw this._mapFilesystemError(err, { path: dir, operation: 'mkdir' });
        }
    }
    _generateETag(body) {
        const buffer = this._toBuffer(body);
        return crypto.createHash('md5').update(buffer).digest('hex');
    }
    _toBuffer(body) {
        if (Buffer.isBuffer(body)) {
            return body;
        }
        if (body === undefined || body === null) {
            return Buffer.alloc(0);
        }
        return Buffer.from(body);
    }
    _formatEtag(etag) {
        return `"${etag}"`;
    }
    _normalizeEtagHeader(headerValue) {
        if (headerValue === undefined || headerValue === null) {
            return [];
        }
        return String(headerValue)
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
    }
    _encodeContinuationToken(key) {
        return Buffer.from(String(key), 'utf8').toString('base64');
    }
    _decodeContinuationToken(token) {
        try {
            const normalized = String(token).trim();
            const decoded = Buffer.from(normalized, 'base64').toString('utf8');
            const reencoded = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
            const normalizedNoPad = normalized.replace(/=+$/, '');
            if (!decoded || reencoded !== normalizedNoPad) {
                throw new Error('Invalid continuation token format');
            }
            return decoded;
        }
        catch (error) {
            throw new ValidationError('Invalid continuation token', {
                field: 'ContinuationToken',
                retriable: false,
                suggestion: 'Use the NextContinuationToken returned by a previous ListObjectsV2 response.',
                original: error
            });
        }
    }
    _extractCommonPrefix(prefix, delimiter, key) {
        if (!delimiter)
            return null;
        const hasPrefix = Boolean(prefix);
        if (hasPrefix && !key.startsWith(prefix)) {
            return null;
        }
        const remainder = hasPrefix ? key.slice(prefix.length) : key;
        const index = remainder.indexOf(delimiter);
        if (index === -1) {
            return null;
        }
        const baseLength = hasPrefix ? prefix.length : 0;
        return key.slice(0, baseLength + index + delimiter.length);
    }
    _calculateMetadataSize(metadata) {
        if (!metadata)
            return 0;
        let size = 0;
        for (const [key, value] of Object.entries(metadata)) {
            size += Buffer.byteLength(key, 'utf8');
            size += Buffer.byteLength(String(value), 'utf8');
        }
        return size;
    }
    _validateLimits(body, metadata) {
        if (!this.enforceLimits)
            return;
        const metadataSize = this._calculateMetadataSize(metadata);
        if (metadataSize > this.metadataLimit) {
            throw new MetadataLimitError('Metadata limit exceeded in filesystem storage', {
                bucket: this.bucket,
                totalSize: metadataSize,
                effectiveLimit: this.metadataLimit,
                operation: 'put',
                retriable: false,
                suggestion: 'Reduce metadata size or disable enforceLimits in FileSystemClient configuration.'
            });
        }
        const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '', 'utf8');
        if (bodySize > this.maxObjectSize) {
            throw new ResourceError('Object size exceeds filesystem limit', {
                bucket: this.bucket,
                operation: 'put',
                size: bodySize,
                maxObjectSize: this.maxObjectSize,
                statusCode: 413,
                retriable: false,
                suggestion: 'Store smaller objects or increase maxObjectSize when instantiating FileSystemClient.'
            });
        }
    }
    async _writeAtomic(filePath, data) {
        await this._ensureDirectory(filePath);
        const tempPath = `${filePath}.tmp.${Date.now()}.${idGenerator(6)}`;
        try {
            await promises$1.writeFile(tempPath, data);
            await promises$1.rename(tempPath, filePath);
        }
        catch (error) {
            try {
                await promises$1.unlink(tempPath);
            }
            catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }
    async _readMetadata(key) {
        const metaPath = this._getMetadataPath(key);
        const [ok, err, json] = await tryFn(() => promises$1.readFile(metaPath, 'utf-8'));
        if (!ok) {
            throw this._mapFilesystemError(err, { key, path: metaPath, operation: 'readMetadata' });
        }
        return JSON.parse(json);
    }
    async _writeMetadata(key, metadata) {
        const metaPath = this._getMetadataPath(key);
        const json = JSON.stringify(metadata, null, 2);
        await this._writeAtomic(metaPath, json);
    }
    _initCleanup() {
        this.cleanupJobName = `filesystem-storage-cleanup-${Date.now()}`;
        this.cronManager.scheduleInterval(this.cleanupInterval, () => {
            this._runCleanup().catch(err => {
                this.logger.warn({ error: err.message }, 'Cleanup error');
            });
        }, this.cleanupJobName);
    }
    async _runCleanup() {
        if (!this.enableTTL || this.defaultTTL <= 0)
            return;
        let cleaned = 0;
        const now = Date.now();
        for await (const entry of this._walkDirectory(this.basePath)) {
            try {
                const [ok, , metaData] = await tryFn(() => this._readMetadata(entry.key));
                if (!ok)
                    continue;
                const expiresAt = metaData.expiresAt;
                if (expiresAt && expiresAt < now) {
                    await this.delete(entry.key);
                    cleaned++;
                }
            }
            catch (err) {
                // Ignore errors during cleanup
            }
        }
        if (cleaned > 0) {
            this.logger.debug({ cleaned }, `Cleanup: removed ${cleaned} expired objects`);
        }
    }
    async _acquireLock(key) {
        if (!this.enableLocking)
            return;
        const startTime = Date.now();
        while (this.locks.has(key)) {
            if (Date.now() - startTime > this.lockTimeout) {
                throw new ResourceError(`Lock timeout for key: ${key}`, {
                    bucket: this.bucket,
                    key,
                    code: 'LockTimeout',
                    statusCode: 408,
                    retriable: true,
                    suggestion: 'Increase lockTimeout or investigate concurrent writes holding the lock.'
                });
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.locks.set(key, Date.now());
    }
    _releaseLock(key) {
        if (!this.enableLocking)
            return;
        this.locks.delete(key);
    }
    async _journalOperation(operation, key, metadata = {}) {
        if (!this.enableJournal)
            return;
        const entry = {
            timestamp: new Date().toISOString(),
            operation,
            key,
            metadata
        };
        const journalPath = path.join(this.basePath, this.journalFile);
        const line = JSON.stringify(entry) + '\n';
        await tryFn(() => promises$1.appendFile(journalPath, line, 'utf8'));
    }
    async _createBackup(filePath) {
        if (!this.enableBackup)
            return;
        if (!fs.existsSync(filePath))
            return;
        const backupPath = filePath + this.backupSuffix;
        await tryFn(() => promises$1.copyFile(filePath, backupPath));
    }
    _compressBody(body) {
        if (!this.enableCompression) {
            return { buffer: this._toBuffer(body), compressed: false };
        }
        const buffer = this._toBuffer(body);
        const originalSize = buffer.length;
        if (originalSize < this.compressionThreshold) {
            return { buffer, compressed: false, originalSize };
        }
        const compressedBuffer = zlib.gzipSync(buffer, { level: this.compressionLevel });
        const compressedSize = compressedBuffer.length;
        if (this.enableStats) {
            this.stats.totalUncompressed += originalSize;
            this.stats.totalCompressed += compressedSize;
            this.stats.compressionSaved += (originalSize - compressedSize);
        }
        return {
            buffer: compressedBuffer,
            compressed: true,
            originalSize,
            compressedSize,
            compressionRatio: (compressedSize / originalSize).toFixed(3)
        };
    }
    _decompressBody(buffer, isCompressed) {
        if (!isCompressed || !this.enableCompression) {
            return buffer;
        }
        try {
            return zlib.gunzipSync(buffer);
        }
        catch (error) {
            this.logger.warn({ error: error.message }, 'Decompression failed, returning raw buffer');
            return buffer;
        }
    }
    getStats() {
        if (!this.enableStats) {
            return null;
        }
        const avgCompressionRatio = this.stats.totalUncompressed > 0
            ? (this.stats.totalCompressed / this.stats.totalUncompressed).toFixed(3)
            : 1.0;
        return {
            ...this.stats,
            avgCompressionRatio,
            features: {
                compression: this.enableCompression,
                ttl: this.enableTTL,
                locking: this.enableLocking,
                backup: this.enableBackup,
                journal: this.enableJournal,
                stats: this.enableStats
            }
        };
    }
    _mapFilesystemError(error, context = {}) {
        const { key, path: filePath, operation } = context;
        const errnoError = error;
        switch (errnoError.code) {
            case 'ENOENT':
                const err = new ResourceError(`Object not found: ${key || filePath}`, {
                    bucket: this.bucket,
                    key,
                    path: filePath,
                    code: 'NoSuchKey',
                    statusCode: 404,
                    retriable: false,
                    suggestion: 'Ensure the key exists before attempting to read it.',
                    original: error
                });
                err.name = 'NoSuchKey';
                return err;
            case 'EACCES':
            case 'EPERM':
                return new ResourceError(`Permission denied: ${key || filePath}`, {
                    bucket: this.bucket,
                    key,
                    path: filePath,
                    code: 'AccessDenied',
                    statusCode: 403,
                    retriable: false,
                    suggestion: 'Check filesystem permissions for the basePath directory.',
                    original: error
                });
            case 'ENOSPC':
                return new ResourceError('No space left on device', {
                    bucket: this.bucket,
                    key,
                    path: filePath,
                    code: 'ServiceUnavailable',
                    statusCode: 503,
                    retriable: true,
                    suggestion: 'Free up disk space and retry the operation.',
                    original: error
                });
            case 'EISDIR':
            case 'ENOTDIR':
                return new ResourceError(`Invalid object state: ${errnoError.message}`, {
                    bucket: this.bucket,
                    key,
                    path: filePath,
                    code: 'InvalidObjectState',
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'The key conflicts with a directory. Use a different key.',
                    original: error
                });
            case 'ENAMETOOLONG':
                return new ResourceError('Key too long for filesystem', {
                    bucket: this.bucket,
                    key,
                    path: filePath,
                    code: 'KeyTooLongError',
                    statusCode: 400,
                    retriable: false,
                    suggestion: 'Shorten the key or partition names to fit within OS path limits.',
                    original: error
                });
            case 'EMFILE':
            case 'ENFILE':
                return new ResourceError('Too many open files', {
                    bucket: this.bucket,
                    key,
                    path: filePath,
                    code: 'ServiceUnavailable',
                    statusCode: 503,
                    retriable: true,
                    suggestion: 'Reduce concurrent operations or increase system file descriptor limit.',
                    original: error
                });
            default:
                return new ResourceError(`Filesystem error: ${errnoError.message}`, {
                    bucket: this.bucket,
                    key,
                    path: filePath,
                    code: errnoError.code || 'InternalError',
                    statusCode: 500,
                    retriable: false,
                    suggestion: 'Check filesystem state and retry.',
                    original: error
                });
        }
    }
    async put(key, params) {
        const { body, metadata, contentType, contentEncoding, contentLength, ifMatch, ifNoneMatch, ttl } = params;
        await this._acquireLock(key);
        try {
            this._validateLimits(body, metadata);
            const objectPath = this._getObjectPath(key);
            const metaPath = this._getMetadataPath(key);
            const exists = fs.existsSync(objectPath);
            if (ifMatch !== undefined) {
                if (!exists) {
                    throw new ResourceError(`Precondition failed: object does not exist for key "${key}"`, {
                        bucket: this.bucket,
                        key,
                        code: 'PreconditionFailed',
                        statusCode: 412,
                        retriable: false,
                        suggestion: 'Fetch the latest object and retry with the current ETag in options.ifMatch.'
                    });
                }
                const currentMeta = await this._readMetadata(key);
                const expectedEtags = this._normalizeEtagHeader(ifMatch);
                const matches = expectedEtags.includes(currentMeta.etag);
                if (!matches) {
                    throw new ResourceError(`Precondition failed: ETag mismatch for key "${key}"`, {
                        bucket: this.bucket,
                        key,
                        code: 'PreconditionFailed',
                        statusCode: 412,
                        retriable: false,
                        suggestion: 'Fetch the latest object and retry with the current ETag in options.ifMatch.'
                    });
                }
            }
            if (ifNoneMatch !== undefined) {
                if (ifNoneMatch === '*' && exists) {
                    throw new ResourceError(`Precondition failed: object already exists for key "${key}"`, {
                        bucket: this.bucket,
                        key,
                        code: 'PreconditionFailed',
                        statusCode: 412,
                        retriable: false,
                        suggestion: 'Use ifNoneMatch: "*" only when the object should not exist or remove the conditional header.'
                    });
                }
                if (exists && ifNoneMatch !== '*') {
                    const currentMeta = await this._readMetadata(key);
                    const normalized = this._normalizeEtagHeader(ifNoneMatch);
                    if (normalized.includes(currentMeta.etag)) {
                        throw new ResourceError(`Precondition failed: ETag matches for key "${key}"`, {
                            bucket: this.bucket,
                            key,
                            code: 'PreconditionFailed',
                            statusCode: 412,
                            retriable: false,
                            suggestion: 'Remove ifNoneMatch header if you want to overwrite the object.'
                        });
                    }
                }
            }
            await this._createBackup(objectPath);
            const compressionResult = this._compressBody(body);
            const buffer = compressionResult.buffer;
            const etag = this._generateETag(buffer);
            const lastModified = new Date().toISOString();
            const size = buffer.length;
            const effectiveTTL = ttl ?? (this.enableTTL ? this.defaultTTL : null);
            const expiresAt = effectiveTTL ? Date.now() + effectiveTTL : null;
            const [okBody, errBody] = await tryFn(() => this._writeAtomic(objectPath, buffer));
            if (!okBody) {
                if (this.enableStats)
                    this.stats.errors++;
                throw this._mapFilesystemError(errBody, { key, path: objectPath, operation: 'put' });
            }
            const metaData = {
                metadata: metadata ? { ...metadata } : {},
                contentType: contentType || 'application/octet-stream',
                etag,
                lastModified,
                size,
                contentEncoding,
                contentLength: typeof contentLength === 'number' ? contentLength : size,
                compressed: compressionResult.compressed || false,
                originalSize: compressionResult.originalSize,
                compressionRatio: compressionResult.compressionRatio,
                expiresAt,
                body: buffer
            };
            const [okMeta, errMeta] = await tryFn(() => this._writeMetadata(key, metaData));
            if (!okMeta) {
                await tryFn(() => promises$1.unlink(objectPath));
                if (this.enableStats)
                    this.stats.errors++;
                throw this._mapFilesystemError(errMeta, { key, path: metaPath, operation: 'put' });
            }
            await this._journalOperation('put', key, {
                size,
                compressed: compressionResult.compressed,
                expiresAt
            });
            if (this.enableStats) {
                this.stats.puts++;
            }
            const info = [
                `${size} bytes`,
                `etag: ${etag}`
            ];
            if (compressionResult.compressed) {
                info.push(`compressed: ${compressionResult.originalSize}→${size} (${compressionResult.compressionRatio}x)`);
            }
            if (expiresAt) {
                info.push(`ttl: ${effectiveTTL}ms`);
            }
            this.logger.debug({ key, size, etag, compressed: compressionResult.compressed, ttl: effectiveTTL }, `PUT ${key} (${info.join(', ')})`);
            return {
                ETag: this._formatEtag(etag),
                VersionId: null,
                ServerSideEncryption: null,
                Location: `/${this.bucket}/${key}`
            };
        }
        finally {
            this._releaseLock(key);
        }
    }
    async get(key) {
        const objectPath = this._getObjectPath(key);
        const metaPath = this._getMetadataPath(key);
        const [okMeta, errMeta, metaData] = await tryFn(() => this._readMetadata(key));
        if (!okMeta) {
            throw this._mapFilesystemError(errMeta, { key, path: metaPath, operation: 'get' });
        }
        const metadata = metaData;
        if (this.enableTTL && metadata.expiresAt && metadata.expiresAt < Date.now()) {
            await this.delete(key);
            throw this._mapFilesystemError({ code: 'ENOENT', message: 'Object has expired' }, { key, path: objectPath, operation: 'get' });
        }
        const [okBody, errBody, bodyBuffer] = await tryFn(() => promises$1.readFile(objectPath));
        if (!okBody) {
            if (this.enableStats)
                this.stats.errors++;
            throw this._mapFilesystemError(errBody, { key, path: objectPath, operation: 'get' });
        }
        const finalBuffer = this._decompressBody(bodyBuffer, metadata.compressed);
        if (this.enableStats) {
            this.stats.gets++;
        }
        const info = [`${metadata.size} bytes`];
        if (metadata.compressed) {
            info.push(`decompressed: ${metadata.size}→${finalBuffer.length}`);
        }
        this.logger.debug({ key, size: metadata.size, compressed: metadata.compressed }, `GET ${key} (${info.join(', ')})`);
        const bodyStream = stream.Readable.from(finalBuffer);
        bodyStream.transformToString = async (encoding = 'utf-8') => {
            const chunks = [];
            for await (const chunk of bodyStream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks).toString(encoding);
        };
        bodyStream.transformToByteArray = async () => {
            const chunks = [];
            for await (const chunk of bodyStream) {
                chunks.push(chunk);
            }
            return new Uint8Array(Buffer.concat(chunks));
        };
        bodyStream.transformToWebStream = () => {
            return stream.Readable.toWeb(bodyStream);
        };
        return {
            Body: bodyStream,
            Metadata: { ...metadata.metadata },
            ContentType: metadata.contentType,
            ContentLength: finalBuffer.length,
            ETag: this._formatEtag(metadata.etag),
            LastModified: new Date(metadata.lastModified),
            ContentEncoding: metadata.contentEncoding
        };
    }
    async head(key) {
        const metaPath = this._getMetadataPath(key);
        const [ok, err, metaData] = await tryFn(() => this._readMetadata(key));
        if (!ok) {
            throw this._mapFilesystemError(err, { key, path: metaPath, operation: 'head' });
        }
        const metadata = metaData;
        this.logger.debug({ key }, `HEAD ${key}`);
        return {
            Metadata: { ...metadata.metadata },
            ContentType: metadata.contentType,
            ContentLength: metadata.size,
            ETag: this._formatEtag(metadata.etag),
            LastModified: new Date(metadata.lastModified),
            ContentEncoding: metadata.contentEncoding
        };
    }
    async copy(from, to, params) {
        const { metadata, metadataDirective, contentType } = params;
        const sourceObjectPath = this._getObjectPath(from);
        this._getMetadataPath(from);
        if (!fs.existsSync(sourceObjectPath)) {
            throw new ResourceError(`Source object not found: ${from}`, {
                bucket: this.bucket,
                key: from,
                code: 'NoSuchKey',
                statusCode: 404,
                retriable: false,
                suggestion: 'Copy requires an existing source object. Verify the source key before retrying.'
            });
        }
        const sourceMeta = await this._readMetadata(from);
        let finalMetadata = { ...sourceMeta.metadata };
        if (metadataDirective === 'REPLACE' && metadata) {
            finalMetadata = metadata;
        }
        else if (metadata) {
            finalMetadata = { ...finalMetadata, ...metadata };
        }
        const destObjectPath = this._getObjectPath(to);
        await this._ensureDirectory(destObjectPath);
        const [okCopy, errCopy] = await tryFn(() => promises$1.copyFile(sourceObjectPath, destObjectPath));
        if (!okCopy) {
            throw this._mapFilesystemError(errCopy, { key: to, path: destObjectPath, operation: 'copy' });
        }
        const destMeta = {
            metadata: finalMetadata,
            contentType: contentType || sourceMeta.contentType,
            etag: sourceMeta.etag,
            lastModified: new Date().toISOString(),
            size: sourceMeta.size,
            contentEncoding: sourceMeta.contentEncoding,
            contentLength: sourceMeta.contentLength,
            body: sourceMeta.body
        };
        await this._writeMetadata(to, destMeta);
        this.logger.debug({ from, to }, `COPY ${from} → ${to}`);
        return {
            CopyObjectResult: {
                ETag: this._formatEtag(destMeta.etag),
                LastModified: destMeta.lastModified
            },
            BucketKeyEnabled: false,
            VersionId: null,
            ServerSideEncryption: null
        };
    }
    async delete(key) {
        const objectPath = this._getObjectPath(key);
        const metaPath = this._getMetadataPath(key);
        await tryFn(() => promises$1.unlink(objectPath));
        await tryFn(() => promises$1.unlink(metaPath));
        if (this.enableBackup) {
            const backupPath = objectPath + this.backupSuffix;
            await tryFn(() => promises$1.unlink(backupPath));
        }
        await this._journalOperation('delete', key);
        if (this.enableStats) {
            this.stats.deletes++;
        }
        this.logger.debug({ key }, `DELETE ${key}`);
        return {
            DeleteMarker: false,
            VersionId: null
        };
    }
    async deleteMultiple(keys) {
        const deleted = [];
        const errors = [];
        for (const key of keys) {
            try {
                await this.delete(key);
                deleted.push({ Key: key });
            }
            catch (error) {
                const err = error;
                errors.push({
                    Key: key,
                    Code: err.name || 'InternalError',
                    Message: err.message
                });
            }
        }
        this.logger.debug({ deletedCount: deleted.length, errorCount: errors.length }, `DELETE BATCH (${deleted.length} deleted, ${errors.length} errors)`);
        return { Deleted: deleted, Errors: errors };
    }
    async *_walkDirectory(dirPath, prefix = '') {
        let entries;
        try {
            entries = await promises$1.readdir(dirPath, { withFileTypes: true });
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return;
            }
            throw error;
        }
        const files = [];
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                yield* this._walkDirectory(fullPath, prefix);
            }
            else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
                files.push({ entry, fullPath });
            }
        }
        const fileBatches = lodashEs.chunk(files, 50);
        for (const batch of fileBatches) {
            const promises = batch.map(async ({ entry, fullPath }) => {
                const key = this._pathToKey(fullPath);
                if (!prefix || key.startsWith(prefix)) {
                    const [ok, , stats] = await tryFn(() => promises$1.stat(fullPath));
                    if (ok) {
                        return {
                            key,
                            path: fullPath,
                            size: stats.size,
                            mtime: stats.mtime
                        };
                    }
                }
                return null;
            });
            const results = await Promise.all(promises);
            for (const res of results) {
                if (res)
                    yield res;
            }
        }
    }
    async list(params) {
        const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
        const prefixFilter = prefix || '';
        this.logger.debug({ prefix, delimiter, maxKeys, continuationToken, startAfter }, '[FileSystemStorage.list] Initial params');
        const startPath = prefixFilter ? this._keyToPath(prefixFilter) : this.basePath;
        this.logger.debug({ startPath, prefixFilter }, '[FileSystemStorage.list] Derived startPath');
        let searchPath;
        try {
            const startStats = await promises$1.stat(startPath);
            searchPath = startStats.isDirectory() ? startPath : path.dirname(startPath);
            this.logger.debug({ startPath, searchPath, isDirectory: startStats.isDirectory() }, '[FileSystemStorage.list] stat success');
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                this.logger.debug({ startPath, error: err.message }, '[FileSystemStorage.list] startPath does not exist, searching parent');
                searchPath = path.dirname(startPath);
            }
            else {
                this.logger.error({ error: err.message }, '[FileSystemStorage.list] Error stating startPath');
                throw err;
            }
        }
        this.logger.debug({ searchPath }, '[FileSystemStorage.list] Final searchPath');
        const allKeys = [];
        for await (const entry of this._walkDirectory(searchPath, prefixFilter)) {
            allKeys.push(entry);
        }
        this.logger.debug({ count: allKeys.length, keys: allKeys.map(k => k.key) }, '[FileSystemStorage.list] Keys from _walkDirectory');
        allKeys.sort((a, b) => a.key.localeCompare(b.key));
        let startAfterKey = null;
        if (continuationToken) {
            startAfterKey = this._decodeContinuationToken(continuationToken);
        }
        else if (startAfter) {
            startAfterKey = startAfter;
        }
        let filteredKeys = startAfterKey
            ? allKeys.filter(entry => entry.key > startAfterKey)
            : allKeys;
        const contents = [];
        const commonPrefixes = new Set();
        let processed = 0;
        let lastKeyInPage = null;
        for (const entry of filteredKeys) {
            if (processed >= maxKeys) {
                break;
            }
            const prefixEntry = delimiter ? this._extractCommonPrefix(prefixFilter, delimiter, entry.key) : null;
            if (prefixEntry) {
                if (!commonPrefixes.has(prefixEntry)) {
                    commonPrefixes.add(prefixEntry);
                }
                continue;
            }
            const [ok, , metaData] = await tryFn(() => this._readMetadata(entry.key));
            const etag = ok ? metaData.etag : this._generateETag(Buffer.alloc(0));
            contents.push({
                Key: entry.key,
                Size: entry.size,
                LastModified: new Date(entry.mtime),
                ETag: this._formatEtag(etag),
                StorageClass: 'STANDARD'
            });
            processed++;
            lastKeyInPage = entry.key;
        }
        const hasMoreKeys = filteredKeys.length > contents.length;
        const nextContinuationToken = hasMoreKeys && lastKeyInPage
            ? this._encodeContinuationToken(lastKeyInPage)
            : null;
        this.logger.debug({ prefix, objectCount: contents.length, prefixCount: commonPrefixes.size, truncated: Boolean(nextContinuationToken) }, `LIST prefix="${prefix}" (${contents.length} objects, ${commonPrefixes.size} prefixes, truncated=${Boolean(nextContinuationToken)})`);
        return {
            Contents: contents,
            CommonPrefixes: Array.from(commonPrefixes).map(commonPrefix => ({ Prefix: commonPrefix })),
            IsTruncated: Boolean(nextContinuationToken),
            ContinuationToken: continuationToken || undefined,
            NextContinuationToken: nextContinuationToken,
            KeyCount: contents.length,
            MaxKeys: maxKeys,
            Prefix: prefix || undefined,
            Delimiter: delimiter || undefined,
            StartAfter: startAfter || undefined
        };
    }
    exists(key) {
        const objectPath = this._getObjectPath(key);
        return fs.existsSync(objectPath);
    }
    async clear() {
        if (!this.basePath.includes('s3db') && !this.basePath.includes('data')) {
            throw new ValidationError('Cannot clear basePath - does not look like a data directory', {
                basePath: this.basePath,
                retriable: false,
                suggestion: 'Only directories with "s3db" or "data" in the path can be cleared for safety.'
            });
        }
        const { rm } = await import('fs/promises');
        await tryFn(() => rm(this.basePath, { recursive: true, force: true }));
        await this._ensureDirectory(this.basePath);
        this.logger.debug({ basePath: this.basePath }, `Cleared all objects from ${this.basePath}`);
    }
    destroy() {
        if (this.cleanupJobName) {
            this.cronManager.stop(this.cleanupJobName);
            this.cleanupJobName = null;
        }
        this.logger.debug('Destroyed (cleanup stopped)');
    }
}

const pathPosix = path.posix;
const globalStorageRegistry = new Map();
class FileSystemClient extends EventEmitter {
    id;
    logLevel;
    logger;
    taskExecutorMonitoring;
    taskManager;
    storage;
    basePath;
    bucket;
    keyPrefix;
    region;
    _keyPrefixForStrip;
    connectionString;
    config;
    constructor(config = {}) {
        super();
        this.id = config.id || idGenerator(77);
        this.logLevel = config.logLevel || 'info';
        if (config.logger) {
            this.logger = config.logger;
        }
        else {
            this.logger = createLogger({ name: 'FileSystemClient', level: this.logLevel });
        }
        this.taskExecutorMonitoring = config.taskExecutorMonitoring
            ? { ...config.taskExecutorMonitoring }
            : null;
        if (config.taskExecutor) {
            this.taskManager = config.taskExecutor;
        }
        else {
            this.taskManager = new TasksRunner({
                concurrency: config.concurrency || 5,
                retries: config.retries ?? 3,
                retryDelay: config.retryDelay ?? 1000,
                timeout: config.timeout ?? 30000,
                retryableErrors: config.retryableErrors || [],
                monitoring: this.taskExecutorMonitoring || undefined
            });
        }
        this.basePath = config.basePath || './s3db-data';
        this.bucket = config.bucket || 's3db';
        this.keyPrefix = config.keyPrefix || '';
        this.region = config.region || 'local';
        this._keyPrefixForStrip = this.keyPrefix ? pathPosix.join(this.keyPrefix, '') : '';
        this.basePath = path.resolve(this.basePath);
        const encodedBasePath = encodeURI(this.basePath);
        this.connectionString = `file://${encodedBasePath}`;
        if (!globalStorageRegistry.has(this.basePath)) {
            globalStorageRegistry.set(this.basePath, new FileSystemStorage({
                basePath: this.basePath,
                bucket: this.bucket,
                enforceLimits: config.enforceLimits || false,
                metadataLimit: config.metadataLimit || 2048,
                maxObjectSize: config.maxObjectSize || 5 * 1024 * 1024 * 1024,
                logLevel: this.logLevel,
                compression: config.compression,
                ttl: config.ttl,
                locking: config.locking,
                backup: config.backup,
                journal: config.journal,
                stats: config.stats
            }));
        }
        this.storage = globalStorageRegistry.get(this.basePath);
        this.config = {
            bucket: this.bucket,
            keyPrefix: this.keyPrefix,
            region: this.region,
            basePath: this.basePath,
            endpoint: `file://${this.basePath}`,
            forcePathStyle: true
        };
        this.logger.debug({ id: this.id, basePath: this.basePath, bucket: this.bucket }, `Initialized (id: ${this.id}, basePath: ${this.basePath}, bucket: ${this.bucket})`);
    }
    getQueueStats() {
        if (this.taskManager && typeof this.taskManager.getStats === 'function') {
            return this.taskManager.getStats();
        }
        return null;
    }
    getAggregateMetrics(since = 0) {
        if (this.taskManager && typeof this.taskManager.getAggregateMetrics === 'function') {
            return this.taskManager.getAggregateMetrics(since);
        }
        return null;
    }
    async sendCommand(command) {
        const commandName = command.constructor.name;
        const input = command.input || {};
        this.emit('cl:request', commandName, input);
        this.emit('command.request', commandName, input);
        let response;
        try {
            switch (commandName) {
                case 'PutObjectCommand':
                    response = await this._handlePutObject(input);
                    break;
                case 'GetObjectCommand':
                    response = await this._handleGetObject(input);
                    break;
                case 'HeadObjectCommand':
                    response = await this._handleHeadObject(input);
                    break;
                case 'CopyObjectCommand':
                    response = await this._handleCopyObject(input);
                    break;
                case 'DeleteObjectCommand':
                    response = await this._handleDeleteObject(input);
                    break;
                case 'DeleteObjectsCommand':
                    response = await this._handleDeleteObjects(input);
                    break;
                case 'ListObjectsV2Command':
                    response = await this._handleListObjects(input);
                    break;
                default:
                    throw new DatabaseError(`Unsupported command: ${commandName}`, {
                        operation: 'sendCommand',
                        statusCode: 400,
                        retriable: false,
                        suggestion: 'Use one of the supported commands: PutObject, GetObject, HeadObject, CopyObject, DeleteObject, DeleteObjects, or ListObjectsV2.'
                    });
            }
            this.emit('cl:response', commandName, response, input);
            this.emit('command.response', commandName, response, input);
            return response;
        }
        catch (error) {
            if (error instanceof BaseError) {
                throw error;
            }
            const mappedError = mapAwsError(error, {
                bucket: this.bucket,
                key: input.Key,
                commandName,
                commandInput: input
            });
            throw mappedError;
        }
    }
    async _handlePutObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const metadata = this._encodeMetadata(input.Metadata || {});
        const contentType = input.ContentType;
        const body = input.Body;
        const contentEncoding = input.ContentEncoding;
        const contentLength = input.ContentLength;
        const ifMatch = input.IfMatch;
        const ifNoneMatch = input.IfNoneMatch;
        return await this.storage.put(key, {
            body: body,
            metadata,
            contentType,
            contentEncoding,
            contentLength,
            ifMatch,
            ifNoneMatch
        });
    }
    async _handleGetObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const response = await this.storage.get(key);
        return this._decodeMetadataResponse(response);
    }
    async _handleHeadObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        const response = await this.storage.head(key);
        return this._decodeMetadataResponse(response);
    }
    async _handleCopyObject(input) {
        const { sourceBucket, sourceKey } = this._parseCopySource(input.CopySource);
        if (sourceBucket !== this.bucket) {
            throw new DatabaseError(`Cross-bucket copy is not supported in FileSystemClient (requested ${sourceBucket} → ${this.bucket})`, {
                operation: 'CopyObject',
                retriable: false,
                suggestion: 'Instantiate a FileSystemClient with the desired bucket or copy within the same bucket.'
            });
        }
        const destinationKey = this._applyKeyPrefix(input.Key);
        const encodedMetadata = this._encodeMetadata(input.Metadata);
        return await this.storage.copy(sourceKey, destinationKey, {
            metadata: encodedMetadata,
            metadataDirective: input.MetadataDirective,
            contentType: input.ContentType
        });
    }
    async _handleDeleteObject(input) {
        const key = this._applyKeyPrefix(input.Key);
        return await this.storage.delete(key);
    }
    async _handleDeleteObjects(input) {
        const objects = input.Delete?.Objects || [];
        const keys = objects.map(obj => this._applyKeyPrefix(obj.Key));
        return await this.storage.deleteMultiple(keys);
    }
    async _handleListObjects(input) {
        const fullPrefix = this._applyKeyPrefix(input.Prefix || '');
        const params = {
            prefix: fullPrefix,
            delimiter: input.Delimiter,
            maxKeys: input.MaxKeys,
            continuationToken: input.ContinuationToken
        };
        if (input.StartAfter) {
            params.startAfter = this._applyKeyPrefix(input.StartAfter);
        }
        const response = await this.storage.list(params);
        return this._normalizeListResponse(response);
    }
    async putObject(params) {
        const { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch } = params;
        const fullKey = this._applyKeyPrefix(key);
        const stringMetadata = this._encodeMetadata(metadata) || {};
        const input = { Key: key, Metadata: metadata, ContentType: contentType, Body: body, ContentEncoding: contentEncoding, ContentLength: contentLength, IfMatch: ifMatch, IfNoneMatch: ifNoneMatch };
        const response = await this.storage.put(fullKey, {
            body: body,
            metadata: stringMetadata,
            contentType,
            contentEncoding,
            contentLength,
            ifMatch,
            ifNoneMatch
        });
        this.emit('cl:response', 'PutObjectCommand', response, input);
        return response;
    }
    async getObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.get(fullKey);
        const decodedResponse = this._decodeMetadataResponse(response);
        this.emit('cl:response', 'GetObjectCommand', decodedResponse, input);
        return decodedResponse;
    }
    async headObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.head(fullKey);
        const decodedResponse = this._decodeMetadataResponse(response);
        this.emit('cl:response', 'HeadObjectCommand', decodedResponse, input);
        return decodedResponse;
    }
    async copyObject(params) {
        const { from, to, metadata, metadataDirective, contentType } = params;
        const fullFrom = this._applyKeyPrefix(from);
        const fullTo = this._applyKeyPrefix(to);
        const encodedMetadata = this._encodeMetadata(metadata);
        const input = { CopySource: from, Key: to, Metadata: metadata, MetadataDirective: metadataDirective, ContentType: contentType };
        const response = await this.storage.copy(fullFrom, fullTo, {
            metadata: encodedMetadata,
            metadataDirective,
            contentType
        });
        this.emit('cl:response', 'CopyObjectCommand', response, input);
        return response;
    }
    async exists(key) {
        const fullKey = this._applyKeyPrefix(key);
        return this.storage.exists(fullKey);
    }
    async deleteObject(key) {
        const fullKey = this._applyKeyPrefix(key);
        const input = { Key: key };
        const response = await this.storage.delete(fullKey);
        this.emit('cl:response', 'DeleteObjectCommand', response, input);
        return response;
    }
    async deleteObjects(keys) {
        const fullKeys = keys.map(key => this._applyKeyPrefix(key));
        const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };
        const batches = lodashEs.chunk(fullKeys, this.taskManager.concurrency || 5);
        const allResults = { Deleted: [], Errors: [] };
        const { results } = await this.taskManager.process(batches, async (batch) => {
            return await this.storage.deleteMultiple(batch);
        });
        for (const result of results) {
            allResults.Deleted.push(...result.Deleted.map(item => ({ Key: this._stripKeyPrefix(item.Key) })));
            allResults.Errors.push(...result.Errors);
        }
        this.emit('cl:response', 'DeleteObjectsCommand', allResults, input);
        return allResults;
    }
    async listObjects(params = {}) {
        const { prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = params;
        const fullPrefix = this._applyKeyPrefix(prefix || '');
        const listParams = {
            prefix: fullPrefix,
            delimiter,
            maxKeys,
            continuationToken
        };
        if (startAfter) {
            listParams.startAfter = this._applyKeyPrefix(startAfter);
        }
        const input = { Prefix: prefix, Delimiter: delimiter, MaxKeys: maxKeys, ContinuationToken: continuationToken, StartAfter: startAfter };
        const response = await this.storage.list(listParams);
        const normalized = this._normalizeListResponse(response);
        this.emit('cl:response', 'ListObjectsV2Command', normalized, input);
        return normalized;
    }
    async getKeysPage(params = {}) {
        const { prefix = '', offset = 0, amount = 100 } = params;
        let keys = [];
        let truncated = true;
        let continuationToken;
        if (offset > 0) {
            const fullPrefix = this._applyKeyPrefix(prefix || '');
            const response = await this.storage.list({
                prefix: fullPrefix,
                maxKeys: offset + amount
            });
            keys = (response.Contents || [])
                .map(x => this._stripKeyPrefix(x.Key))
                .slice(offset, offset + amount);
            truncated = Boolean(response.NextContinuationToken);
            continuationToken = response.NextContinuationToken || undefined;
        }
        else {
            while (truncated) {
                const remaining = amount - keys.length;
                if (remaining <= 0) {
                    break;
                }
                const res = await this.listObjects({
                    prefix,
                    continuationToken,
                    maxKeys: remaining
                });
                if (res.Contents) {
                    keys = keys.concat(res.Contents.map(x => x.Key));
                }
                truncated = res.IsTruncated || false;
                continuationToken = res.NextContinuationToken || undefined;
                if (keys.length >= amount) {
                    keys = keys.slice(0, amount);
                    break;
                }
            }
        }
        this.emit('cl:GetKeysPage', keys, params);
        return keys;
    }
    async getAllKeys(params = {}) {
        const { prefix = '' } = params;
        const fullPrefix = this._applyKeyPrefix(prefix || '');
        const response = await this.storage.list({
            prefix: fullPrefix,
            maxKeys: Number.MAX_SAFE_INTEGER
        });
        const keys = (response.Contents || []).map(x => this._stripKeyPrefix(x.Key));
        this.emit('cl:GetAllKeys', keys, params);
        return keys;
    }
    async count(params = {}) {
        const { prefix = '' } = params;
        const keys = await this.getAllKeys({ prefix });
        const count = keys.length;
        this.emit('cl:Count', count, { prefix });
        return count;
    }
    async deleteAll(params = {}) {
        const { prefix = '' } = params;
        const keys = await this.getAllKeys({ prefix });
        let totalDeleted = 0;
        if (keys.length > 0) {
            const result = await this.deleteObjects(keys);
            totalDeleted = result.Deleted.length;
            this.emit('deleteAll', {
                prefix,
                batch: totalDeleted,
                total: totalDeleted
            });
        }
        this.emit('deleteAllComplete', {
            prefix,
            totalDeleted
        });
        return totalDeleted;
    }
    async getContinuationTokenAfterOffset(params = {}) {
        const { prefix = '', offset = 1000 } = params;
        if (offset === 0)
            return null;
        const keys = await this.getAllKeys({ prefix });
        if (offset >= keys.length) {
            this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
            return null;
        }
        const keyForToken = keys[offset];
        const fullKey = this._applyKeyPrefix(keyForToken || '');
        const token = this._encodeContinuationTokenKey(fullKey);
        this.emit('cl:GetContinuationTokenAfterOffset', token, { prefix, offset });
        return token;
    }
    async moveObject(params) {
        const { from, to } = params;
        const [ok, err] = await tryFn(async () => {
            await this.copyObject({ from, to, metadataDirective: 'COPY' });
            await this.deleteObject(from);
        });
        if (!ok) {
            throw new DatabaseError('Unknown error in moveObject', {
                bucket: this.bucket,
                from,
                to,
                original: err
            });
        }
        return true;
    }
    async moveAllObjects(params) {
        const { prefixFrom, prefixTo } = params;
        const keys = await this.getAllKeys({ prefix: prefixFrom });
        const { results, errors } = await this.taskManager.process(keys, async (key) => {
            const to = key.replace(prefixFrom, prefixTo);
            await this.moveObject({ from: key, to });
            return { from: key, to };
        });
        this.emit('moveAllObjects', { results, errors });
        if (errors.length > 0) {
            const error = new Error('Some objects could not be moved');
            error.context = {
                bucket: this.bucket,
                operation: 'moveAllObjects',
                prefixFrom,
                prefixTo,
                totalKeys: keys.length,
                failedCount: errors.length,
                successCount: results.length,
                errors
            };
            throw error;
        }
        return results;
    }
    async clear() {
        await this.storage.clear();
    }
    _encodeMetadata(metadata) {
        if (!metadata)
            return undefined;
        const encoded = {};
        for (const [rawKey, value] of Object.entries(metadata)) {
            const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
            const { encoded: encodedValue } = metadataEncode(value);
            encoded[validKey] = encodedValue;
        }
        return encoded;
    }
    _decodeMetadataResponse(response) {
        const decodedMetadata = {};
        if (response.Metadata) {
            for (const [k, v] of Object.entries(response.Metadata)) {
                decodedMetadata[k] = metadataDecode(v);
            }
        }
        return {
            ...response,
            Metadata: decodedMetadata
        };
    }
    _applyKeyPrefix(key) {
        if (!this.keyPrefix) {
            if (key === undefined || key === null) {
                return '';
            }
            return key;
        }
        if (key === undefined || key === null || key === '') {
            return pathPosix.join(this.keyPrefix, '');
        }
        return pathPosix.join(this.keyPrefix, key);
    }
    _stripKeyPrefix(key = '') {
        if (!this.keyPrefix) {
            return key;
        }
        const normalizedPrefix = this._keyPrefixForStrip;
        if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
            return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
        }
        return key;
    }
    _encodeContinuationTokenKey(key) {
        return Buffer.from(String(key), 'utf8').toString('base64');
    }
    _parseCopySource(copySource) {
        const trimmedSource = String(copySource || '').replace(/^\//, '');
        const [sourcePath] = trimmedSource.split('?');
        const decodedSource = decodeURIComponent(sourcePath ?? '');
        const [sourceBucket, ...sourceKeyParts] = decodedSource.split('/');
        if (!sourceBucket || sourceKeyParts.length === 0) {
            throw new DatabaseError(`Invalid CopySource value: ${copySource}`, {
                operation: 'CopyObject',
                retriable: false,
                suggestion: 'Provide CopySource in the format "<bucket>/<key>" as expected by AWS S3.'
            });
        }
        return {
            sourceBucket,
            sourceKey: sourceKeyParts.join('/')
        };
    }
    _normalizeListResponse(response) {
        const rawContents = Array.isArray(response.Contents) ? response.Contents : [];
        const contents = rawContents.map(item => ({
            ...item,
            Key: this._stripKeyPrefix(item.Key)
        }));
        const rawPrefixes = Array.isArray(response.CommonPrefixes) ? response.CommonPrefixes : [];
        const commonPrefixes = rawPrefixes.map(({ Prefix }) => ({
            Prefix: this._stripKeyPrefix(Prefix)
        }));
        return {
            Contents: contents,
            CommonPrefixes: commonPrefixes,
            IsTruncated: response.IsTruncated,
            ContinuationToken: response.ContinuationToken,
            NextContinuationToken: response.NextContinuationToken,
            KeyCount: contents.length,
            MaxKeys: response.MaxKeys,
            Prefix: this.keyPrefix ? undefined : response.Prefix,
            Delimiter: response.Delimiter,
            StartAfter: response.StartAfter
        };
    }
    getStats() {
        return this.storage.getStats();
    }
    destroy() {
        if (this.storage && typeof this.storage.destroy === 'function') {
            this.storage.destroy();
        }
    }
    static clearPathStorage(basePath) {
        const absolutePath = path.resolve(basePath);
        const storage = globalStorageRegistry.get(absolutePath);
        if (storage && typeof storage.destroy === 'function') {
            storage.destroy();
        }
        globalStorageRegistry.delete(absolutePath);
    }
    static clearAllStorage() {
        for (const storage of globalStorageRegistry.values()) {
            if (typeof storage.destroy === 'function') {
                storage.destroy();
            }
        }
        globalStorageRegistry.clear();
    }
}

class ProcessManager {
    options;
    logger;
    intervals;
    timeouts;
    cleanups;
    isShuttingDown;
    shutdownPromise;
    _boundSignalHandler;
    _signalHandlersSetup;
    constructor(options = {}) {
        this.options = {
            logLevel: options.logLevel || 'info',
            shutdownTimeout: options.shutdownTimeout || 30000,
            exitOnSignal: options.exitOnSignal !== false,
        };
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            const logLevel = this.options.logLevel;
            this.logger = createLogger({ name: 'ProcessManager', level: logLevel });
        }
        this.intervals = new Map();
        this.timeouts = new Map();
        this.cleanups = new Map();
        this.isShuttingDown = false;
        this.shutdownPromise = null;
        this._signalHandlersSetup = false;
        this._boundSignalHandler = this._handleSignal.bind(this);
        this._setupSignalHandlers();
        this.logger.debug({ shutdownTimeout: this.options.shutdownTimeout }, 'ProcessManager initialized');
    }
    setInterval(fn, interval, name) {
        if (this.isShuttingDown) {
            throw new Error(`[ProcessManager] Cannot register interval '${name}' during shutdown`);
        }
        if (this.intervals.has(name)) {
            this.logger.warn({ name }, `interval '${name}' already exists, clearing previous`);
            this.clearInterval(name);
        }
        const start = Date.now();
        let expected = start + interval;
        let timerId;
        const tick = () => {
            const now = Date.now();
            const drift = now - expected;
            let executions = 1;
            if (drift > interval) {
                executions += Math.floor(drift / interval);
            }
            try {
                for (let i = 0; i < executions; i++)
                    fn();
            }
            finally {
                expected += executions * interval;
                const nextDelay = Math.max(0, interval - (drift % interval));
                timerId = setTimeout(tick, nextDelay);
            }
        };
        timerId = setTimeout(tick, interval);
        this.intervals.set(name, { id: timerId, fn, interval, precise: true });
        this.logger.debug({ name, interval }, `registered interval '${name}' (${interval}ms)`);
        return timerId;
    }
    clearInterval(name) {
        const entry = this.intervals.get(name);
        if (entry) {
            if (entry.precise) {
                clearTimeout(entry.id);
            }
            else {
                clearInterval(entry.id);
            }
            this.intervals.delete(name);
            this.logger.debug({ name }, `cleared interval '${name}'`);
        }
    }
    setTimeout(fn, delay, name) {
        if (this.isShuttingDown) {
            throw new Error(`[ProcessManager] Cannot register timeout '${name}' during shutdown`);
        }
        if (this.timeouts.has(name)) {
            this.logger.warn({ name }, `timeout '${name}' already exists, clearing previous`);
            this.clearTimeout(name);
        }
        const id = setTimeout(() => {
            fn();
            this.timeouts.delete(name);
        }, delay);
        this.timeouts.set(name, { id, fn, delay });
        this.logger.debug({ name, delay }, `registered timeout '${name}' (${delay}ms)`);
        return id;
    }
    clearTimeout(name) {
        const entry = this.timeouts.get(name);
        if (entry) {
            clearTimeout(entry.id);
            this.timeouts.delete(name);
            this.logger.debug({ name }, `cleared timeout '${name}'`);
        }
    }
    registerCleanup(cleanupFn, name) {
        if (this.isShuttingDown) {
            throw new Error(`[ProcessManager] Cannot register cleanup '${name}' during shutdown`);
        }
        if (this.cleanups.has(name)) {
            this.logger.warn({ name }, `cleanup '${name}' already registered, replacing`);
        }
        this.cleanups.set(name, cleanupFn);
        this.logger.debug({ name }, `registered cleanup '${name}'`);
    }
    unregisterCleanup(name) {
        if (this.cleanups.delete(name)) {
            this.logger.debug({ name }, `unregistered cleanup '${name}'`);
        }
    }
    _setupSignalHandlers() {
        if (this._signalHandlersSetup)
            return;
        bumpProcessMaxListeners(4);
        process.on('SIGTERM', this._boundSignalHandler);
        process.on('SIGINT', this._boundSignalHandler);
        process.on('uncaughtException', (err) => {
            this.logger.error({ error: err.message, stack: err.stack }, 'uncaught exception');
            this._handleSignal('uncaughtException');
        });
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error({ reason, promise: String(promise) }, 'unhandled rejection');
            this._handleSignal('unhandledRejection');
        });
        this._signalHandlersSetup = true;
        this.logger.debug('signal handlers registered (SIGTERM, SIGINT, uncaughtException, unhandledRejection)');
    }
    async _handleSignal(signal) {
        if (this.isShuttingDown) {
            this.logger.debug({ signal }, `shutdown already in progress, ignoring ${signal}`);
            return;
        }
        try {
            await this.shutdown();
            if (this.options.exitOnSignal) {
                process.exit(0);
            }
        }
        catch (err) {
            const error = err;
            this.logger.error({ error: error.message, stack: error.stack }, 'error during shutdown');
            if (this.options.exitOnSignal) {
                process.exit(1);
            }
        }
    }
    async shutdown(options = {}) {
        if (this.isShuttingDown) {
            this.logger.debug('shutdown already in progress, waiting for completion...');
            return this.shutdownPromise;
        }
        this.isShuttingDown = true;
        const timeout = options.timeout || this.options.shutdownTimeout;
        this.shutdownPromise = this._performShutdown(timeout);
        return this.shutdownPromise;
    }
    async _performShutdown(timeout) {
        const startTime = Date.now();
        if (this.intervals.size > 0) {
            for (const [name, entry] of this.intervals.entries()) {
                if (entry.precise) {
                    clearTimeout(entry.id);
                }
                else {
                    clearInterval(entry.id);
                }
                this.logger.debug({ name }, `cleared interval '${name}'`);
            }
            this.intervals.clear();
        }
        if (this.timeouts.size > 0) {
            for (const [name, entry] of this.timeouts.entries()) {
                clearTimeout(entry.id);
                this.logger.debug({ name }, `cleared timeout '${name}'`);
            }
            this.timeouts.clear();
        }
        if (this.cleanups.size > 0) {
            const cleanupPromises = Array.from(this.cleanups.entries()).map(async ([name, cleanupFn]) => {
                try {
                    const cleanupTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Cleanup '${name}' timed out`)), timeout));
                    await Promise.race([
                        cleanupFn(),
                        cleanupTimeout
                    ]);
                    this.logger.debug({ name }, `cleanup '${name}' completed`);
                }
                catch (err) {
                    const error = err;
                    this.logger.error({ name, error: error.message }, `cleanup '${name}' failed`);
                }
            });
            await Promise.allSettled(cleanupPromises);
            this.cleanups.clear();
        }
        const elapsed = Date.now() - startTime;
        this.logger.debug({ elapsed }, `shutdown completed in ${elapsed}ms`);
    }
    getStatus() {
        return {
            isShuttingDown: this.isShuttingDown,
            intervals: Array.from(this.intervals.keys()),
            timeouts: Array.from(this.timeouts.keys()),
            cleanups: Array.from(this.cleanups.keys()),
            counts: {
                intervals: this.intervals.size,
                timeouts: this.timeouts.size,
                cleanups: this.cleanups.size
            }
        };
    }
    removeSignalHandlers() {
        process.removeListener('SIGTERM', this._boundSignalHandler);
        process.removeListener('SIGINT', this._boundSignalHandler);
        this._signalHandlersSetup = false;
        this.logger.debug('signal handlers removed');
    }
}
let globalInstance = null;
function getProcessManager(options = {}) {
    if (!globalInstance) {
        globalInstance = new ProcessManager(options);
    }
    return globalInstance;
}
function resetProcessManager() {
    if (globalInstance) {
        globalInstance.removeSignalHandlers();
        globalInstance = null;
    }
}

class SafeEventEmitter extends EventEmitter {
    options;
    logger;
    _signalHandlersSetup;
    _isDestroyed;
    _boundCleanupHandler;
    constructor(options = {}) {
        super();
        this.options = {
            logLevel: options.logLevel || 'info',
            autoCleanup: options.autoCleanup !== false,
            maxListeners: options.maxListeners || 0
        };
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            this.logger = createLogger({ name: 'SafeEventEmitter', level: this.options.logLevel });
        }
        this._signalHandlersSetup = false;
        this._isDestroyed = false;
        if (this.options.maxListeners > 0) {
            this.setMaxListeners(this.options.maxListeners);
        }
        if (this.options.autoCleanup) {
            this._setupSignalHandlers();
        }
        this.logger.debug({ autoCleanup: this.options.autoCleanup }, `Initialized with auto-cleanup: ${this.options.autoCleanup}`);
    }
    _setupSignalHandlers() {
        if (this._signalHandlersSetup)
            return;
        this._boundCleanupHandler = this._handleCleanup.bind(this);
        bumpProcessMaxListeners(3);
        process.once('SIGTERM', this._boundCleanupHandler);
        process.once('SIGINT', this._boundCleanupHandler);
        process.once('beforeExit', this._boundCleanupHandler);
        this._signalHandlersSetup = true;
        this.logger.debug('Signal handlers registered (SIGTERM, SIGINT, beforeExit)');
    }
    _handleCleanup(signal) {
        if (this._isDestroyed)
            return;
        this.logger.debug({ signal }, `Received ${signal}, cleaning up listeners...`);
        this.destroy();
    }
    on(eventName, listener) {
        try {
            super.on(eventName, listener);
        }
        catch (err) {
            this.handleError(err, 'on');
        }
        return this;
    }
    once(eventName, listener) {
        try {
            super.once(eventName, listener);
        }
        catch (err) {
            this.handleError(err, 'once');
        }
        return this;
    }
    emit(eventName, ...args) {
        try {
            return super.emit(eventName, ...args);
        }
        catch (err) {
            this.handleError(err, 'emit');
            return false;
        }
    }
    handleError(err, method) {
        this.logger.error({ err, method }, `Error in SafeEventEmitter.${method}: ${err.message}`);
    }
    getListenerStats() {
        const stats = {};
        const events = this.eventNames();
        for (const event of events) {
            stats[String(event)] = this.listenerCount(event);
        }
        return stats;
    }
    getTotalListenerCount() {
        return this.eventNames().reduce((total, event) => {
            return total + this.listenerCount(event);
        }, 0);
    }
    destroy() {
        if (this._isDestroyed)
            return;
        const totalListeners = this.getTotalListenerCount();
        this.logger.debug({ totalListeners }, `Destroying emitter (${totalListeners} listeners)...`);
        this.removeAllListeners();
        if (this._boundCleanupHandler) {
            process.removeListener('SIGTERM', this._boundCleanupHandler);
            process.removeListener('SIGINT', this._boundCleanupHandler);
            process.removeListener('beforeExit', this._boundCleanupHandler);
            this._signalHandlersSetup = false;
        }
        this._isDestroyed = true;
        this.logger.debug('Destroyed');
    }
    isDestroyed() {
        return this._isDestroyed;
    }
    removeSignalHandlers() {
        if (this._boundCleanupHandler) {
            process.removeListener('SIGTERM', this._boundCleanupHandler);
            process.removeListener('SIGINT', this._boundCleanupHandler);
            process.removeListener('beforeExit', this._boundCleanupHandler);
            this._signalHandlersSetup = false;
            this.logger.debug('Signal handlers removed');
        }
    }
}
function createSafeEventEmitter(options = {}) {
    return new SafeEventEmitter(options);
}

const HOOK_EVENTS = [
    'beforeConnect', 'afterConnect',
    'beforeCreateResource', 'afterCreateResource',
    'beforeUploadMetadata', 'afterUploadMetadata',
    'beforeDisconnect', 'afterDisconnect',
    'resourceCreated', 'resourceUpdated'
];
class DatabaseHooks {
    database;
    _hooks;
    _hookEvents;
    _hooksInstalled;
    _originalConnect;
    _originalCreateResource;
    _originalUploadMetadataFile;
    _originalDisconnect;
    constructor(database) {
        this.database = database;
        this._hooks = new Map();
        this._hookEvents = [...HOOK_EVENTS];
        this._hooksInstalled = false;
        this._initHooks();
    }
    _initHooks() {
        this._hooks = new Map();
        for (const event of this._hookEvents) {
            this._hooks.set(event, []);
        }
    }
    get hookEvents() {
        return [...this._hookEvents];
    }
    get isInstalled() {
        return this._hooksInstalled;
    }
    wrapMethods(connect, createResource, uploadMetadataFile, disconnect) {
        if (this._hooksInstalled) {
            return {
                connect,
                createResource,
                uploadMetadataFile,
                disconnect
            };
        }
        this._originalConnect = connect;
        this._originalCreateResource = createResource;
        this._originalUploadMetadataFile = uploadMetadataFile;
        this._originalDisconnect = disconnect;
        const wrappedConnect = async () => {
            await this.executeHooks('beforeConnect', {});
            const result = await this._originalConnect();
            await this.executeHooks('afterConnect', { result });
            return result;
        };
        const wrappedCreateResource = async (config) => {
            await this.executeHooks('beforeCreateResource', { config });
            const resource = await this._originalCreateResource(config);
            await this.executeHooks('afterCreateResource', { resource, config });
            return resource;
        };
        const wrappedUploadMetadataFile = async () => {
            await this.executeHooks('beforeUploadMetadata', {});
            const result = await this._originalUploadMetadataFile();
            await this.executeHooks('afterUploadMetadata', { result });
            return result;
        };
        const wrappedDisconnect = async () => {
            await this.executeHooks('beforeDisconnect', {});
            const result = await this._originalDisconnect();
            await this.executeHooks('afterDisconnect', { result });
            return result;
        };
        this._hooksInstalled = true;
        return {
            connect: wrappedConnect,
            createResource: wrappedCreateResource,
            uploadMetadataFile: wrappedUploadMetadataFile,
            disconnect: wrappedDisconnect
        };
    }
    addHook(event, fn) {
        if (!this._hooks.has(event)) {
            throw new DatabaseError(`Unknown hook event: ${event}`, {
                operation: 'addHook',
                invalidEvent: event,
                availableEvents: this._hookEvents,
                suggestion: `Use one of the available hook events: ${this._hookEvents.join(', ')}`
            });
        }
        if (typeof fn !== 'function') {
            throw new DatabaseError('Hook function must be a function', {
                operation: 'addHook',
                event,
                receivedType: typeof fn,
                suggestion: 'Provide a function that will be called when the hook event occurs'
            });
        }
        this._hooks.get(event).push(fn);
    }
    removeHook(event, fn) {
        if (!this._hooks.has(event))
            return;
        const hooks = this._hooks.get(event);
        const index = hooks.indexOf(fn);
        if (index > -1) {
            hooks.splice(index, 1);
        }
    }
    getHooks(event) {
        if (!this._hooks.has(event))
            return [];
        return [...this._hooks.get(event)];
    }
    clearHooks(event) {
        if (!this._hooks.has(event))
            return;
        this._hooks.get(event).length = 0;
    }
    async executeHooks(event, context = {}) {
        if (!this._hooks.has(event))
            return;
        const hooks = this._hooks.get(event);
        for (const hook of hooks) {
            const [ok, error] = await tryFn(() => hook({ database: this.database, ...context }));
            if (!ok) {
                this.database.emit('hookError', { event, error, context });
                if (this.database.strictHooks) {
                    throw new DatabaseError(`Hook execution failed for event '${event}': ${error.message}`, {
                        event,
                        originalError: error,
                        context
                    });
                }
            }
        }
    }
}

class DatabaseCoordinators {
    database;
    _coordinators;
    constructor(database) {
        this.database = database;
        this._coordinators = new Map();
    }
    get coordinators() {
        return this._coordinators;
    }
    async getGlobalCoordinator(namespace, options = {}) {
        if (!namespace) {
            throw new Error('Database.getGlobalCoordinator: namespace is required');
        }
        const { autoStart = false } = options;
        if (this._coordinators.has(namespace)) {
            return this._coordinators.get(namespace);
        }
        try {
            const { GlobalCoordinatorService } = await Promise.resolve().then(function () { return globalCoordinatorService_class; });
            const coordinatorConfig = options.config || {};
            const service = new GlobalCoordinatorService({
                namespace,
                database: this.database,
                config: {
                    heartbeatInterval: coordinatorConfig.heartbeatInterval ?? 5000,
                    heartbeatJitter: coordinatorConfig.heartbeatJitter ?? 1000,
                    leaseTimeout: coordinatorConfig.leaseTimeout ?? 15000,
                    workerTimeout: coordinatorConfig.workerTimeout ?? 20000,
                    diagnosticsEnabled: coordinatorConfig.diagnosticsEnabled ?? (this.database.logger.level === 'debug' || this.database.logger.level === 'trace')
                }
            });
            if (autoStart && this.database.isConnected()) {
                await service.start();
            }
            this._coordinators.set(namespace, service);
            return service;
        }
        catch (err) {
            throw new DatabaseError('Failed to initialize global coordinator service', {
                operation: 'getGlobalCoordinator',
                namespace,
                cause: err?.message
            });
        }
    }
    async stopAll() {
        if (this._coordinators.size > 0) {
            for (const [, service] of this._coordinators) {
                try {
                    if (service && typeof service.stop === 'function') {
                        await service.stop();
                    }
                }
                catch {
                    // Silently continue on error
                }
            }
            this._coordinators.clear();
        }
    }
    collectMemorySnapshot() {
        const usage = process.memoryUsage();
        const toMB = (bytes) => Math.round((bytes || 0) / (1024 * 1024));
        const snapshot = {
            timestamp: new Date().toISOString(),
            rssMB: toMB(usage.rss),
            heapUsedMB: toMB(usage.heapUsed),
            heapTotalMB: toMB(usage.heapTotal),
            externalMB: toMB(usage.external)
        };
        if (usage.arrayBuffers !== undefined) {
            snapshot.arrayBuffersMB = toMB(usage.arrayBuffers);
        }
        return snapshot;
    }
}

class ResourceIdsReader extends EventEmitter {
    resource;
    client;
    stream;
    controller;
    continuationToken = null;
    closeNextIteration = false;
    constructor({ resource }) {
        super();
        this.resource = resource;
        this.client = resource.client;
        this.stream = new web.ReadableStream({
            start: this._start.bind(this),
            pull: this._pull.bind(this),
            cancel: this._cancel.bind(this),
        }, {
            highWaterMark: this.client.parallelism * 3
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
    async _pull(_controller) {
        if (this.closeNextIteration) {
            this.controller.close();
            return;
        }
        const response = await this.client.listObjects({
            prefix: `resource=${this.resource.name}`,
            continuationToken: this.continuationToken,
        });
        const keys = response?.Contents
            .map((x) => x.Key)
            .map((x) => x.replace(this.client.config.keyPrefix, ""))
            .map((x) => (x.startsWith("/") ? x.replace(`/`, "") : x))
            .map((x) => x.replace(`resource=${this.resource.name}/id=`, ""));
        this.continuationToken = response.NextContinuationToken || null;
        this.enqueue(keys);
        if (!response.IsTruncated)
            this.closeNextIteration = true;
    }
    enqueue(ids) {
        ids.forEach((key) => {
            this.controller.enqueue(key);
            this.emit("id", key);
        });
    }
    _cancel(_reason) {
        // No cleanup needed
    }
}

class ResourceIdsPageReader extends ResourceIdsReader {
    enqueue(ids) {
        this.controller.enqueue(ids);
        this.emit("page", ids);
    }
}

class ResourceReader extends EventEmitter {
    resource;
    client;
    batchSize;
    concurrency;
    input;
    transform;
    constructor({ resource, batchSize = 10, concurrency = 5 }) {
        super();
        if (!resource) {
            throw new StreamError('Resource is required for ResourceReader', {
                operation: 'constructor',
                resource: resource?.name,
                suggestion: 'Pass a valid Resource instance when creating ResourceReader'
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
        this.input.on('data', (chunk) => {
            this.transform.write(chunk);
        });
        this.input.on('end', () => {
            this.transform.end();
        });
        this.input.on('error', (error) => {
            this.emit('error', error);
        });
        this.transform.on('data', (data) => {
            this.emit('data', data);
        });
        this.transform.on('end', () => {
            this.emit('end');
        });
        this.transform.on('error', (error) => {
            this.emit('error', error);
        });
    }
    build() {
        return this;
    }
    async _transform(chunk, _encoding, callback) {
        const [, err] = await tryFn(async () => {
            await TasksPool.map(chunk, async (id) => {
                const data = await this.resource.get(id);
                this.transform.push(data);
                return data;
            }, {
                concurrency: this.concurrency,
                onItemError: (error, id) => this.emit("error", error, id)
            });
        });
        callback(err);
    }
    resume() {
        this.input.emit('resume');
    }
}

class ResourceWriter extends EventEmitter {
    resource;
    client;
    batchSize;
    concurrency;
    buffer;
    writing;
    ended;
    writable;
    constructor({ resource, batchSize = 10, concurrency = 5 }) {
        super();
        this.resource = resource;
        this.client = resource.client;
        this.batchSize = batchSize;
        this.concurrency = concurrency;
        this.buffer = [];
        this.writing = false;
        this.ended = false;
        this.writable = new stream.Writable({
            objectMode: true,
            write: this._write.bind(this)
        });
        this.writable.on('finish', () => {
            this.emit('finish');
        });
        this.writable.on('error', (error) => {
            this.emit('error', error);
        });
    }
    build() {
        return this;
    }
    write(chunk) {
        this.buffer.push(chunk);
        this._maybeWrite().catch(error => {
            this.emit('error', error);
        });
        return true;
    }
    end() {
        this.ended = true;
        this._maybeWrite().catch(error => {
            this.emit('error', error);
        });
    }
    async _maybeWrite() {
        if (this.writing)
            return;
        if (this.buffer.length === 0 && !this.ended)
            return;
        this.writing = true;
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.batchSize);
            const [ok, err] = await tryFn(async () => {
                await TasksPool.map(batch, async (item) => {
                    const [insertOk, insertErr, result] = await tryFn(async () => {
                        const res = await this.resource.insert(item);
                        return res;
                    });
                    if (!insertOk) {
                        this.emit('error', insertErr, item);
                        return null;
                    }
                    return result;
                }, {
                    concurrency: this.concurrency,
                    onItemError: (error, item) => this.emit("error", error, item)
                });
            });
            if (!ok) {
                this.emit('error', err);
            }
        }
        this.writing = false;
        if (this.ended) {
            this.writable.emit('finish');
        }
    }
    _write(_chunk, _encoding, callback) {
        callback();
    }
}

function streamToString(stream) {
    return new Promise((resolve, reject) => {
        if (!stream) {
            return reject(new StreamError('Stream is undefined', {
                operation: 'streamToString',
                suggestion: 'Ensure a valid stream is passed to streamToString()'
            }));
        }
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

class DatabaseRecovery {
    database;
    constructor(database) {
        this.database = database;
    }
    async attemptJsonRecovery(content, healingLog) {
        if (!content || typeof content !== 'string') {
            healingLog.push('Content is empty or not a string');
            return null;
        }
        const fixes = [
            () => content.replace(/,(\s*[}\]])/g, '$1'),
            () => content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":'),
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
                    if (char === '\\') {
                        escaped = true;
                        continue;
                    }
                    if (char === '"') {
                        inString = !inString;
                        continue;
                    }
                    if (!inString) {
                        if (char === '{')
                            openBraces++;
                        else if (char === '}')
                            openBraces--;
                        else if (char === '[')
                            openBrackets++;
                        else if (char === ']')
                            openBrackets--;
                    }
                }
                let fixed = content;
                while (openBrackets > 0) {
                    fixed += ']';
                    openBrackets--;
                }
                while (openBraces > 0) {
                    fixed += '}';
                    openBraces--;
                }
                return fixed;
            }
        ];
        for (const [index, fix] of fixes.entries()) {
            const [ok, , parsed] = tryFnSync(() => {
                const fixedContent = fix();
                return JSON.parse(fixedContent);
            });
            if (ok) {
                healingLog.push(`JSON recovery successful using fix #${index + 1}`);
                return parsed;
            }
        }
        healingLog.push('All JSON recovery attempts failed');
        return null;
    }
    async validateAndHealMetadata(metadata, healingLog) {
        if (!metadata || typeof metadata !== 'object') {
            healingLog.push('Metadata is not an object - using blank structure');
            return this.database.blankMetadataStructure();
        }
        let healed = { ...metadata };
        let changed = false;
        if (!healed.version || typeof healed.version !== 'string') {
            if (healed.version && typeof healed.version === 'number') {
                healed.version = String(healed.version);
                healingLog.push('Converted version from number to string');
                changed = true;
            }
            else {
                healed.version = '1';
                healingLog.push('Added missing or invalid version field');
                changed = true;
            }
        }
        if (!healed.s3dbVersion || typeof healed.s3dbVersion !== 'string') {
            if (healed.s3dbVersion && typeof healed.s3dbVersion !== 'string') {
                healed.s3dbVersion = String(healed.s3dbVersion);
                healingLog.push('Converted s3dbVersion to string');
                changed = true;
            }
            else {
                healed.s3dbVersion = this.database.s3dbVersion;
                healingLog.push('Added missing s3dbVersion field');
                changed = true;
            }
        }
        if (!healed.resources || typeof healed.resources !== 'object' || Array.isArray(healed.resources)) {
            healed.resources = {};
            healingLog.push('Fixed invalid resources field');
            changed = true;
        }
        if (!healed.lastUpdated) {
            healed.lastUpdated = new Date().toISOString();
            healingLog.push('Added missing lastUpdated field');
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
            }
            else {
                healingLog.push(`Removed invalid resource: ${name}`);
                changed = true;
            }
        }
        healed.resources = validResources;
        return changed ? healed : metadata;
    }
    _healResourceStructure(name, resource, healingLog) {
        if (!resource || typeof resource !== 'object') {
            healingLog.push(`Resource ${name}: invalid structure`);
            return null;
        }
        let healed = { ...resource };
        let changed = false;
        if (!healed.currentVersion) {
            healed.currentVersion = 'v1';
            healingLog.push(`Resource ${name}: added missing currentVersion`);
            changed = true;
        }
        if (!healed.versions || typeof healed.versions !== 'object' || Array.isArray(healed.versions)) {
            healed.versions = {};
            healingLog.push(`Resource ${name}: fixed invalid versions object`);
            changed = true;
        }
        if (!healed.partitions || typeof healed.partitions !== 'object' || Array.isArray(healed.partitions)) {
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
            }
            else {
                healingLog.push(`Resource ${name}: no valid versions found - removing resource`);
                return null;
            }
        }
        const versionData = healed.versions[healed.currentVersion];
        if (!versionData || typeof versionData !== 'object') {
            healingLog.push(`Resource ${name}: invalid version data - removing resource`);
            return null;
        }
        if (!versionData.attributes || typeof versionData.attributes !== 'object') {
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
    _healHooksStructure(hooks, resourceName, healingLog) {
        if (!hooks || typeof hooks !== 'object') {
            healingLog.push(`Resource ${resourceName}: invalid hooks structure - using empty hooks`);
            return {};
        }
        const healed = {};
        let changed = false;
        for (const [event, hookData] of Object.entries(hooks)) {
            if (hookData && typeof hookData === 'object' && Array.isArray(hookData.handlers)) {
                const validHandlers = hookData.handlers.filter((handler) => handler !== null &&
                    handler !== undefined &&
                    handler !== '');
                healed[event] = {
                    count: validHandlers.length,
                    handlers: validHandlers
                };
                if (validHandlers.length !== hookData.handlers.length) {
                    healingLog.push(`Resource ${resourceName}: cleaned invalid hooks for event ${event}`);
                    changed = true;
                }
            }
            else {
                healingLog.push(`Resource ${resourceName}: hooks for event ${event} is invalid - removing`);
                changed = true;
            }
        }
        return changed ? healed : hooks;
    }
    async createCorruptedBackup(content = null) {
        const [ok] = await tryFn(async () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupKey = `s3db.json.corrupted.${timestamp}.backup`;
            if (!content) {
                const [readOk, , readData] = await tryFn(async () => {
                    const request = await this.database.client.getObject('s3db.json');
                    return await streamToString(request?.Body);
                });
                content = readOk ? readData : 'Unable to read corrupted file content';
            }
            await this.database.client.putObject({
                key: backupKey,
                body: content,
                contentType: 'application/json'
            });
            this.database.logger.info({ backupKey }, `created backup of corrupted s3db.json as ${backupKey}`);
        });
        if (!ok) {
            this.database.logger.warn({}, 'failed to create backup');
        }
    }
    async uploadHealedMetadata(metadata, healingLog) {
        const [ok, err] = await tryFn(async () => {
            if (healingLog.length > 0) {
                this.database.logger.warn({ healingOperations: healingLog }, 'S3DB self-healing operations');
                healingLog.forEach(log => this.database.logger.warn(`  - ${log}`));
            }
            metadata.lastUpdated = new Date().toISOString();
            await this.database.client.putObject({
                key: 's3db.json',
                body: JSON.stringify(metadata, null, 2),
                contentType: 'application/json'
            });
            this.database.emit('db:metadata-healed', { healingLog, metadata });
            this.database.logger.info('successfully uploaded healed metadata');
        });
        if (!ok) {
            this.database.logger.error({ error: err?.message }, 'failed to upload healed metadata');
            throw err;
        }
    }
}

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const base = alphabet.length;
const charToValue = Object.fromEntries([...alphabet].map((c, i) => [c, i]));
const encode = (n) => {
    if (typeof n !== 'number' || isNaN(n))
        return 'undefined';
    if (!isFinite(n))
        return 'undefined';
    if (n === 0)
        return alphabet[0];
    if (n < 0)
        return '-' + encode(-Math.floor(n));
    n = Math.floor(n);
    let s = '';
    while (n) {
        s = alphabet[n % base] + s;
        n = Math.floor(n / base);
    }
    return s;
};
const decode = (s) => {
    if (typeof s !== 'string')
        return NaN;
    if (s === '')
        return 0;
    let negative = false;
    let str = s;
    if (str[0] === '-') {
        negative = true;
        str = str.slice(1);
    }
    let r = 0;
    for (let i = 0; i < str.length; i++) {
        const idx = charToValue[str[i]];
        if (idx === undefined)
            return NaN;
        r = r * base + idx;
    }
    return negative ? -r : r;
};
const encodeDecimal = (n) => {
    if (typeof n !== 'number' || isNaN(n))
        return 'undefined';
    if (!isFinite(n))
        return 'undefined';
    const negative = n < 0;
    n = Math.abs(n);
    const [intPart, decPart] = n.toString().split('.');
    const encodedInt = encode(Number(intPart));
    if (decPart) {
        return (negative ? '-' : '') + encodedInt + '.' + decPart;
    }
    return (negative ? '-' : '') + encodedInt;
};
const decodeDecimal = (s) => {
    if (typeof s !== 'string')
        return NaN;
    let negative = false;
    let str = s;
    if (str[0] === '-') {
        negative = true;
        str = str.slice(1);
    }
    const [intPart, decPart] = str.split('.');
    const decodedInt = decode(intPart);
    if (isNaN(decodedInt))
        return NaN;
    const num = decPart ? Number(decodedInt + '.' + decPart) : decodedInt;
    return negative ? -num : num;
};
/**
 * Fixed-point encoding optimized for normalized values (typically -1 to 1)
 * Common in embeddings, similarity scores, probabilities, etc.
 *
 * Achieves ~77% compression vs encodeDecimal for embedding vectors.
 */
const encodeFixedPoint = (n, precision = 6) => {
    if (typeof n !== 'number' || isNaN(n))
        return 'undefined';
    if (!isFinite(n))
        return 'undefined';
    const scale = Math.pow(10, precision);
    const scaled = Math.round(n * scale);
    if (scaled === 0)
        return '^0';
    const negative = scaled < 0;
    let num = Math.abs(scaled);
    let s = '';
    while (num > 0) {
        s = alphabet[num % base] + s;
        num = Math.floor(num / base);
    }
    return '^' + (negative ? '-' : '') + s;
};
/**
 * Decodes fixed-point encoded values
 */
const decodeFixedPoint = (s, precision = 6) => {
    if (typeof s !== 'string')
        return NaN;
    if (!s.startsWith('^'))
        return NaN;
    let str = s.slice(1);
    if (str === '0')
        return 0;
    let negative = false;
    if (str[0] === '-') {
        negative = true;
        str = str.slice(1);
    }
    let r = 0;
    for (let i = 0; i < str.length; i++) {
        const idx = charToValue[str[i]];
        if (idx === undefined)
            return NaN;
        r = r * base + idx;
    }
    const scale = Math.pow(10, precision);
    const scaled = negative ? -r : r;
    return scaled / scale;
};
/**
 * Batch encoding for arrays of fixed-point numbers (optimized for embeddings)
 *
 * Achieves ~17% additional compression vs individual encodeFixedPoint by using
 * a single prefix for the entire array instead of one prefix per value.
 */
const encodeFixedPointBatch = (values, precision = 6) => {
    if (!Array.isArray(values))
        return '';
    if (values.length === 0)
        return '^[]';
    const scale = Math.pow(10, precision);
    const encoded = values.map(n => {
        if (typeof n !== 'number' || isNaN(n) || !isFinite(n))
            return '';
        const scaled = Math.round(n * scale);
        if (scaled === 0)
            return '0';
        const negative = scaled < 0;
        let num = Math.abs(scaled);
        let s = '';
        while (num > 0) {
            s = alphabet[num % base] + s;
            num = Math.floor(num / base);
        }
        return (negative ? '-' : '') + s;
    });
    return '^[' + encoded.join(',') + ']';
};
/**
 * Decodes batch-encoded fixed-point arrays
 */
const decodeFixedPointBatch = (s, precision = 6) => {
    if (typeof s !== 'string')
        return [];
    if (!s.startsWith('^['))
        return [];
    const inner = s.slice(2, -1);
    if (inner === '')
        return [];
    const parts = inner.split(',');
    const scale = Math.pow(10, precision);
    return parts.map(part => {
        if (part === '0')
            return 0;
        if (part === '')
            return NaN;
        let negative = false;
        let str = part;
        if (str[0] === '-') {
            negative = true;
            str = str.slice(1);
        }
        let r = 0;
        for (let i = 0; i < str.length; i++) {
            const idx = charToValue[str[i]];
            if (idx === undefined)
                return NaN;
            r = r * base + idx;
        }
        const scaled = negative ? -r : r;
        return scaled / scale;
    });
};

const utf8BytesMemory = new Map();
const UTF8_MEMORY_MAX_SIZE = 10000;
function calculateUTF8Bytes(str) {
    if (typeof str !== 'string') {
        str = String(str);
    }
    const s = str;
    if (utf8BytesMemory.has(s)) {
        return utf8BytesMemory.get(s);
    }
    let bytes = 0;
    for (let i = 0; i < s.length; i++) {
        const codePoint = s.codePointAt(i);
        if (codePoint === undefined)
            continue;
        if (codePoint <= 0x7F) {
            bytes += 1;
        }
        else if (codePoint <= 0x7FF) {
            bytes += 2;
        }
        else if (codePoint <= 0xFFFF) {
            bytes += 3;
        }
        else if (codePoint <= 0x10FFFF) {
            bytes += 4;
            if (codePoint > 0xFFFF) {
                i++;
            }
        }
    }
    if (utf8BytesMemory.size < UTF8_MEMORY_MAX_SIZE) {
        utf8BytesMemory.set(s, bytes);
    }
    else if (utf8BytesMemory.size === UTF8_MEMORY_MAX_SIZE) {
        const entriesToDelete = Math.floor(UTF8_MEMORY_MAX_SIZE / 2);
        let deleted = 0;
        for (const key of utf8BytesMemory.keys()) {
            if (deleted >= entriesToDelete)
                break;
            utf8BytesMemory.delete(key);
            deleted++;
        }
        utf8BytesMemory.set(s, bytes);
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
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]';
        }
        return value.map(item => String(item)).join('|');
    }
    if (typeof value === 'object') {
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
function calculateSystemOverhead(config = {}) {
    const { version = '1', timestamps = false, id = '' } = config;
    const systemFields = {
        '_v': String(version),
    };
    if (timestamps) {
        systemFields.createdAt = '2024-01-01T00:00:00.000Z';
        systemFields.updatedAt = '2024-01-01T00:00:00.000Z';
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

const LOCK_DEFAULTS = {
    ttl: 30,
    timeout: 0,
    retryDelay: 100,
    maxRetryDelay: 1000,
    workerId: 'unknown'
};
function computeBackoff(attempt, baseDelay, maxDelay) {
    const exponential = Math.min(baseDelay * Math.pow(2, Math.max(attempt - 1, 0)), maxDelay);
    const jitter = Math.floor(Math.random() * Math.max(baseDelay / 2, 1));
    return exponential + jitter;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isPreconditionFailure(err) {
    const originalError = err?.original || err;
    const errorCode = originalError?.code || originalError?.Code || originalError?.name;
    const statusCode = originalError?.statusCode || originalError?.$metadata?.httpStatusCode;
    return errorCode === 'PreconditionFailed' || statusCode === 412;
}
class DistributedLock {
    storage;
    keyGenerator;
    defaults;
    constructor(storage, options = {}) {
        if (!storage) {
            throw new Error('DistributedLock requires a storage adapter');
        }
        this.storage = storage;
        this.keyGenerator = options.keyGenerator || ((name) => `locks/${name}`);
        this.defaults = { ...LOCK_DEFAULTS, ...options.defaults };
    }
    async acquire(lockName, options = {}) {
        const opts = { ...this.defaults, ...options };
        const { ttl, timeout, workerId, retryDelay, maxRetryDelay } = opts;
        const key = this.keyGenerator(lockName);
        const token = idGenerator();
        const startTime = Date.now();
        let attempt = 0;
        while (true) {
            const payload = {
                workerId,
                token,
                acquiredAt: Date.now(),
                _expiresAt: Date.now() + (ttl * 1000)
            };
            const [ok, err, putResponse] = await tryFn(() => this.storage.set(key, payload, {
                ttl,
                behavior: 'body-only',
                ifNoneMatch: '*'
            }));
            if (ok && putResponse) {
                return {
                    name: lockName,
                    key,
                    token,
                    workerId,
                    expiresAt: payload._expiresAt,
                    etag: putResponse.ETag || null
                };
            }
            if (!isPreconditionFailure(err)) {
                throw err;
            }
            if (timeout !== undefined && Date.now() - startTime >= timeout) {
                return null;
            }
            const current = await this.storage.get(key);
            if (!current) {
                continue;
            }
            if (current._expiresAt && Date.now() > current._expiresAt) {
                await tryFn(() => this.storage.delete(key));
                continue;
            }
            attempt += 1;
            const delay = computeBackoff(attempt, retryDelay, maxRetryDelay);
            await sleep(delay);
        }
    }
    async release(lock, token) {
        if (!lock)
            return;
        let key;
        let expectedToken = token;
        if (typeof lock === 'object') {
            key = lock.key || this.keyGenerator(lock.name);
            expectedToken = lock.token ?? token;
        }
        else if (typeof lock === 'string') {
            key = this.keyGenerator(lock);
            expectedToken = token;
        }
        else {
            throw new Error('release() expects a lock handle or lock name');
        }
        if (!expectedToken) {
            throw new Error('release() requires the lock token');
        }
        if (!key) {
            throw new Error('Invalid lock key');
        }
        const current = await this.storage.get(key);
        if (!current)
            return;
        if (current.token !== expectedToken) {
            return;
        }
        await this.storage.delete(key);
    }
    async withLock(lockName, options, callback) {
        if (typeof callback !== 'function') {
            throw new Error('withLock() requires a callback function');
        }
        const lock = await this.acquire(lockName, options);
        if (!lock) {
            return null;
        }
        try {
            return await callback(lock);
        }
        finally {
            await tryFn(() => this.release(lock));
        }
    }
    async isLocked(lockName) {
        const key = this.keyGenerator(lockName);
        const lock = await this.storage.get(key);
        return lock !== null;
    }
    async getLockInfo(lockName) {
        const key = this.keyGenerator(lockName);
        return this.storage.get(key);
    }
}

const SEQUENCE_DEFAULTS = {
    initialValue: 1,
    increment: 1,
    lockTimeout: 5000,
    lockTTL: 10
};
class DistributedSequence {
    storage;
    valueKeyGenerator;
    lockKeyGenerator;
    defaults;
    lock;
    constructor(storage, options = {}) {
        if (!storage) {
            throw new Error('DistributedSequence requires a storage adapter');
        }
        this.storage = storage;
        this.valueKeyGenerator = options.valueKeyGenerator || ((name) => `sequences/${name}/value`);
        this.lockKeyGenerator = options.lockKeyGenerator || ((name) => `sequences/${name}/lock`);
        this.defaults = { ...SEQUENCE_DEFAULTS, ...options.defaults };
        this.lock = new DistributedLock(storage, {
            keyGenerator: this.lockKeyGenerator,
            defaults: {
                ttl: this.defaults.lockTTL,
                timeout: this.defaults.lockTimeout
            }
        });
    }
    async next(name, options = {}) {
        const opts = { ...this.defaults, ...options };
        const { initialValue, increment, lockTimeout, lockTTL, metadata } = opts;
        const valueKey = this.valueKeyGenerator(name);
        const result = await this.lock.withLock(name, {
            timeout: lockTimeout,
            ttl: lockTTL
        }, async () => {
            const data = await this.storage.get(valueKey);
            if (!data) {
                await this.storage.set(valueKey, {
                    value: initialValue + increment,
                    name,
                    createdAt: Date.now(),
                    ...metadata
                }, { behavior: 'body-only' });
                return initialValue;
            }
            const currentValue = data.value;
            await this.storage.set(valueKey, {
                ...data,
                value: currentValue + increment,
                updatedAt: Date.now()
            }, { behavior: 'body-only' });
            return currentValue;
        });
        if (result === null) {
            throw new Error(`Failed to acquire lock for sequence "${name}"`);
        }
        return result;
    }
    async get(name) {
        const valueKey = this.valueKeyGenerator(name);
        const data = await this.storage.get(valueKey);
        return data?.value ?? null;
    }
    async getData(name) {
        const valueKey = this.valueKeyGenerator(name);
        return this.storage.get(valueKey);
    }
    async reset(name, value, options = {}) {
        const opts = { ...this.defaults, ...options };
        const { lockTimeout, lockTTL, metadata } = opts;
        const valueKey = this.valueKeyGenerator(name);
        const result = await this.lock.withLock(name, {
            timeout: lockTimeout,
            ttl: lockTTL
        }, async () => {
            const data = await this.storage.get(valueKey);
            await this.storage.set(valueKey, {
                value,
                name,
                createdAt: data?.createdAt || Date.now(),
                updatedAt: Date.now(),
                resetAt: Date.now(),
                ...metadata
            }, { behavior: 'body-only' });
            return true;
        });
        if (result === null) {
            throw new Error(`Failed to acquire lock for sequence "${name}"`);
        }
        return result;
    }
    async set(name, value, options = {}) {
        return this.reset(name, value, options);
    }
    async delete(name) {
        const valueKey = this.valueKeyGenerator(name);
        const lockKey = this.lockKeyGenerator(name);
        await this.storage.delete(valueKey);
        await tryFn(() => this.storage.delete(lockKey));
    }
    async exists(name) {
        const value = await this.get(name);
        return value !== null;
    }
    async increment(name, options = {}) {
        const opts = { ...this.defaults, ...options };
        const { increment } = opts;
        const preValue = await this.next(name, options);
        return preValue + increment;
    }
}

const S3_METADATA_LIMIT = 2047;
class PluginStorage {
    client;
    pluginSlug;
    _lock;
    _sequence;
    _now;
    constructor(client, pluginSlug, options = {}) {
        if (!client) {
            throw new PluginStorageError('PluginStorage requires a client instance', {
                operation: 'constructor',
                pluginSlug,
                suggestion: 'Pass a valid S3db Client instance when creating PluginStorage'
            });
        }
        if (!pluginSlug) {
            throw new PluginStorageError('PluginStorage requires a pluginSlug', {
                operation: 'constructor',
                suggestion: 'Provide a plugin slug (e.g., "eventual-consistency", "cache", "audit")'
            });
        }
        this.client = client;
        this.pluginSlug = pluginSlug;
        // Use arrow function to capture Date.now dynamically (enables FakeTimers mocking)
        this._now = options.now ?? (() => Date.now());
        this._lock = new DistributedLock(this, {
            keyGenerator: (name) => this.getPluginKey(null, 'locks', name)
        });
        this._sequence = new DistributedSequence(this, {
            valueKeyGenerator: (name) => this.getSequenceKey(null, name, 'value'),
            lockKeyGenerator: (name) => this.getSequenceKey(null, name, 'lock')
        });
    }
    getPluginKey(resourceName, ...parts) {
        if (resourceName) {
            return `resource=${resourceName}/plugin=${this.pluginSlug}/${parts.join('/')}`;
        }
        return `plugin=${this.pluginSlug}/${parts.join('/')}`;
    }
    getSequenceKey(resourceName, sequenceName, suffix) {
        if (resourceName) {
            return `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
        }
        return `plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
    }
    async set(key, data, options = {}) {
        const { ttl, behavior = 'body-overflow', contentType = 'application/json', ifMatch, ifNoneMatch } = options;
        const dataToSave = { ...data };
        if (ttl && typeof ttl === 'number' && ttl > 0) {
            dataToSave._expiresAt = this._now() + (ttl * 1000);
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
        if (ifMatch !== undefined) {
            putParams.ifMatch = ifMatch;
        }
        if (ifNoneMatch !== undefined) {
            putParams.ifNoneMatch = ifNoneMatch;
        }
        const [ok, err, response] = await tryFn(() => this.client.putObject(putParams));
        if (!ok) {
            throw new PluginStorageError(`Failed to save plugin data`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'set',
                behavior,
                ttl,
                original: err,
                suggestion: 'Check S3 permissions and key format'
            });
        }
        return response;
    }
    async batchSet(items) {
        const promises = items.map(async (item) => {
            const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options || {}));
            return { ok, key: item.key, error: ok ? undefined : error };
        });
        return Promise.all(promises);
    }
    async get(key) {
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            const error = err;
            if (error?.name === 'NoSuchKey' ||
                error?.code === 'NoSuchKey' ||
                error?.Code === 'NoSuchKey' ||
                error?.statusCode === 404) {
                return null;
            }
            throw new PluginStorageError(`Failed to retrieve plugin data`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'get',
                original: err,
                suggestion: 'Check if the key exists and S3 permissions are correct'
            });
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, parseErr, result] = await tryFn(async () => {
                const bodyContent = await this._readBodyAsString(response.Body);
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                throw new PluginStorageError(`Failed to parse JSON body`, {
                    pluginSlug: this.pluginSlug,
                    key,
                    operation: 'get',
                    original: parseErr,
                    suggestion: 'Body content may be corrupted. Check S3 object integrity'
                });
            }
            data = result;
        }
        const expiresAt = (data._expiresat || data._expiresAt);
        if (expiresAt) {
            if (this._now() > expiresAt) {
                await this.delete(key);
                return null;
            }
            delete data._expiresat;
            delete data._expiresAt;
        }
        return data;
    }
    _parseMetadataValues(metadata) {
        const parsed = {};
        for (const [key, value] of Object.entries(metadata)) {
            if (typeof value === 'string') {
                if ((value.startsWith('{') && value.endsWith('}')) ||
                    (value.startsWith('[') && value.endsWith(']'))) {
                    try {
                        parsed[key] = JSON.parse(value);
                        continue;
                    }
                    catch {
                        // Not JSON, keep as string
                    }
                }
                if (!isNaN(Number(value)) && value.trim() !== '') {
                    parsed[key] = Number(value);
                    continue;
                }
                if (value === 'true') {
                    parsed[key] = true;
                    continue;
                }
                if (value === 'false') {
                    parsed[key] = false;
                    continue;
                }
            }
            parsed[key] = value;
        }
        return parsed;
    }
    async _readBodyAsString(body) {
        if (!body) {
            return '';
        }
        const bodyAny = body;
        if (typeof bodyAny.transformToString === 'function') {
            return bodyAny.transformToString();
        }
        if (typeof bodyAny.transformToByteArray === 'function') {
            const bytes = await bodyAny.transformToByteArray();
            return Buffer.from(bytes).toString('utf-8');
        }
        if (typeof body === 'string') {
            return body;
        }
        if (body instanceof Uint8Array) {
            return Buffer.from(body).toString('utf-8');
        }
        if (body instanceof ArrayBuffer) {
            return Buffer.from(body).toString('utf-8');
        }
        if (typeof bodyAny.on === 'function') {
            return streamToString(bodyAny);
        }
        if (typeof bodyAny[Symbol.asyncIterator] === 'function') {
            const chunks = [];
            for await (const chunk of bodyAny) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            return Buffer.concat(chunks).toString('utf-8');
        }
        return String(body);
    }
    async list(prefix = '', options = {}) {
        const { limit } = options;
        const fullPrefix = prefix
            ? `plugin=${this.pluginSlug}/${prefix}`
            : `plugin=${this.pluginSlug}/`;
        const [ok, err, result] = await tryFn(() => this.client.listObjects({ prefix: fullPrefix, maxKeys: limit }));
        if (!ok || !result) {
            throw new PluginStorageError(`Failed to list plugin data`, {
                pluginSlug: this.pluginSlug,
                operation: 'list',
                prefix,
                fullPrefix,
                limit,
                original: err,
                suggestion: 'Check S3 permissions and bucket configuration'
            });
        }
        const keys = (result.Contents ?? []).map(item => item.Key).filter((k) => typeof k === 'string');
        return this._removeKeyPrefix(keys);
    }
    async listForResource(resourceName, subPrefix = '', options = {}) {
        const { limit } = options;
        const fullPrefix = subPrefix
            ? `resource=${resourceName}/plugin=${this.pluginSlug}/${subPrefix}`
            : `resource=${resourceName}/plugin=${this.pluginSlug}/`;
        const [ok, err, result] = await tryFn(() => this.client.listObjects({ prefix: fullPrefix, maxKeys: limit }));
        if (!ok || !result) {
            throw new PluginStorageError(`Failed to list resource data`, {
                pluginSlug: this.pluginSlug,
                operation: 'listForResource',
                resourceName,
                subPrefix,
                fullPrefix,
                limit,
                original: err,
                suggestion: 'Check resource name and S3 permissions'
            });
        }
        const keys = (result.Contents ?? []).map(item => item.Key).filter((k) => typeof k === 'string');
        return this._removeKeyPrefix(keys);
    }
    async listWithPrefix(prefix = '', options = {}) {
        const keys = await this.list(prefix, options);
        if (!keys || keys.length === 0) {
            return [];
        }
        const results = await this.batchGet(keys);
        return results
            .filter(item => item.ok && item.data != null)
            .map(item => item.data);
    }
    _removeKeyPrefix(keys) {
        const keyPrefix = this.client.config.keyPrefix;
        if (!keyPrefix)
            return keys;
        return keys
            .map(key => key.replace(keyPrefix, ''))
            .map(key => (key.startsWith('/') ? key.replace('/', '') : key));
    }
    async has(key) {
        const data = await this.get(key);
        return data !== null;
    }
    async isExpired(key) {
        const [ok, , response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            return true;
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, , result] = await tryFn(async () => {
                const bodyContent = await this._readBodyAsString(response.Body);
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                return true;
            }
            data = result;
        }
        const expiresAt = (data._expiresat || data._expiresAt);
        if (!expiresAt) {
            return false;
        }
        return this._now() > expiresAt;
    }
    async getTTL(key) {
        const [ok, , response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            return null;
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, , result] = await tryFn(async () => {
                const bodyContent = await this._readBodyAsString(response.Body);
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                return null;
            }
            data = result;
        }
        const expiresAt = (data._expiresat || data._expiresAt);
        if (!expiresAt) {
            return null;
        }
        const remaining = Math.max(0, expiresAt - this._now());
        return Math.floor(remaining / 1000);
    }
    async touch(key, additionalSeconds) {
        const [ok, , response] = await tryFn(() => this.client.headObject(key));
        if (!ok || !response) {
            return false;
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        const expiresAt = (parsedMetadata._expiresat || parsedMetadata._expiresAt);
        if (!expiresAt) {
            return false;
        }
        parsedMetadata._expiresAt = expiresAt + (additionalSeconds * 1000);
        delete parsedMetadata._expiresat;
        const encodedMetadata = {};
        for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
            const { encoded } = metadataEncode(metaValue);
            encodedMetadata[metaKey] = encoded;
        }
        const [copyOk] = await tryFn(() => this.client.copyObject({
            from: key,
            to: key,
            metadata: encodedMetadata,
            metadataDirective: 'REPLACE',
            contentType: response.ContentType || 'application/json'
        }));
        return copyOk;
    }
    async delete(key) {
        const [ok, err] = await tryFn(() => this.client.deleteObject(key));
        if (!ok) {
            throw new PluginStorageError(`Failed to delete plugin data`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'delete',
                original: err,
                suggestion: 'Check S3 delete permissions'
            });
        }
    }
    async deleteAll(resourceName = null) {
        let deleted = 0;
        if (resourceName) {
            const keys = await this.listForResource(resourceName);
            for (const key of keys) {
                await this.delete(key);
                deleted++;
            }
        }
        else {
            const allKeys = await this.client.getAllKeys({});
            const pluginKeys = allKeys.filter(key => key.includes(`plugin=${this.pluginSlug}/`));
            for (const key of pluginKeys) {
                await this.delete(key);
                deleted++;
            }
        }
        return deleted;
    }
    async batchPut(items) {
        const promises = items.map(async (item) => {
            const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options));
            return { key: item.key, ok, error: ok ? undefined : error };
        });
        return Promise.all(promises);
    }
    async batchGet(keys) {
        const promises = keys.map(async (key) => {
            const [ok, error, data] = await tryFn(() => this.get(key));
            return { key, ok, data, error: ok ? undefined : error };
        });
        return Promise.all(promises);
    }
    /**
     * Set data only if the key does not exist (conditional PUT).
     * Uses ifNoneMatch: '*' to ensure atomicity.
     * @returns The ETag (version) if set succeeded, null if key already exists.
     */
    async setIfNotExists(key, data, options = {}) {
        const [ok, err, response] = await tryFn(() => this.set(key, data, { ...options, ifNoneMatch: '*' }));
        if (!ok) {
            const error = err;
            // PreconditionFailed (412) or similar means key already exists
            if (error?.name === 'PreconditionFailed' ||
                error?.code === 'PreconditionFailed' ||
                error?.statusCode === 412) {
                return null;
            }
            throw err;
        }
        return response?.ETag ?? null;
    }
    /**
     * Get data along with its version (ETag) for conditional updates.
     * @returns Object with data and version, or { data: null, version: null } if not found.
     */
    async getWithVersion(key) {
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            const error = err;
            if (error?.name === 'NoSuchKey' ||
                error?.code === 'NoSuchKey' ||
                error?.Code === 'NoSuchKey' ||
                error?.statusCode === 404) {
                return { data: null, version: null };
            }
            throw new PluginStorageError(`Failed to retrieve plugin data with version`, {
                pluginSlug: this.pluginSlug,
                key,
                operation: 'getWithVersion',
                original: err,
                suggestion: 'Check if the key exists and S3 permissions are correct'
            });
        }
        const metadata = response.Metadata || {};
        const parsedMetadata = this._parseMetadataValues(metadata);
        let data = parsedMetadata;
        if (response.Body) {
            const [parseOk, parseErr, result] = await tryFn(async () => {
                const bodyContent = await this._readBodyAsString(response.Body);
                if (bodyContent && bodyContent.trim()) {
                    const body = JSON.parse(bodyContent);
                    return { ...parsedMetadata, ...body };
                }
                return parsedMetadata;
            });
            if (!parseOk || !result) {
                throw new PluginStorageError(`Failed to parse JSON body`, {
                    pluginSlug: this.pluginSlug,
                    key,
                    operation: 'getWithVersion',
                    original: parseErr,
                    suggestion: 'Body content may be corrupted'
                });
            }
            data = result;
        }
        // Check expiration
        const expiresAt = (data._expiresat || data._expiresAt);
        if (expiresAt && this._now() > expiresAt) {
            await this.delete(key);
            return { data: null, version: null };
        }
        // Clean up internal fields
        delete data._expiresat;
        delete data._expiresAt;
        // Extract ETag from response - need to get it from headObject since getObject may not return it
        const [headOk, , headResponse] = await tryFn(() => this.client.headObject(key));
        const version = headOk && headResponse ? headResponse.ETag ?? null : null;
        return { data, version };
    }
    /**
     * Set data only if the current version matches (conditional PUT).
     * Uses ifMatch to ensure no concurrent modifications.
     * @returns The new ETag (version) if set succeeded, null if version mismatch.
     */
    async setIfVersion(key, data, version, options = {}) {
        const [ok, err, response] = await tryFn(() => this.set(key, data, { ...options, ifMatch: version }));
        if (!ok) {
            const error = err;
            // PreconditionFailed (412) means version mismatch
            if (error?.name === 'PreconditionFailed' ||
                error?.code === 'PreconditionFailed' ||
                error?.statusCode === 412) {
                return null;
            }
            throw err;
        }
        return response?.ETag ?? null;
    }
    /**
     * Delete data only if the current version matches (conditional DELETE).
     * @returns true if deleted, false if version mismatch or key not found.
     */
    async deleteIfVersion(key, version) {
        // First verify the version matches
        const [headOk, , headResponse] = await tryFn(() => this.client.headObject(key));
        if (!headOk || !headResponse) {
            return false;
        }
        const currentVersion = headResponse.ETag;
        if (currentVersion !== version) {
            return false;
        }
        const [deleteOk] = await tryFn(() => this.client.deleteObject(key));
        return deleteOk;
    }
    async acquireLock(lockName, options = {}) {
        return this._lock.acquire(lockName, options);
    }
    async releaseLock(lock, token) {
        return this._lock.release(lock, token);
    }
    async withLock(lockName, options, callback) {
        return this._lock.withLock(lockName, options, callback);
    }
    async isLocked(lockName) {
        return this._lock.isLocked(lockName);
    }
    async increment(key, amount = 1, options = {}) {
        const [headOk, , headResponse] = await tryFn(() => this.client.headObject(key));
        if (headOk && headResponse?.Metadata) {
            const metadata = headResponse.Metadata || {};
            const parsedMetadata = this._parseMetadataValues(metadata);
            const currentValue = parsedMetadata.value || 0;
            const newValue = currentValue + amount;
            parsedMetadata.value = newValue;
            if (options.ttl) {
                parsedMetadata._expiresAt = this._now() + (options.ttl * 1000);
            }
            const encodedMetadata = {};
            for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
                const { encoded } = metadataEncode(metaValue);
                encodedMetadata[metaKey] = encoded;
            }
            const [copyOk] = await tryFn(() => this.client.copyObject({
                from: key,
                to: key,
                metadata: encodedMetadata,
                metadataDirective: 'REPLACE',
                contentType: headResponse.ContentType || 'application/json'
            }));
            if (copyOk) {
                return newValue;
            }
        }
        const data = await this.get(key);
        const value = (data?.value || 0) + amount;
        await this.set(key, { value }, options);
        return value;
    }
    async decrement(key, amount = 1, options = {}) {
        return this.increment(key, -amount, options);
    }
    async nextSequence(name, options = {}) {
        const { resourceName = null, initialValue = 1, increment = 1, lockTimeout = 5000, lockTTL = 10 } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const lockKey = this.getSequenceKey(resourceName, name, 'lock');
        const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
            const data = await this.get(valueKey);
            if (!data) {
                await this.set(valueKey, {
                    value: initialValue + increment,
                    name,
                    resourceName,
                    createdAt: this._now()
                }, { behavior: 'body-only' });
                return initialValue;
            }
            const currentValue = data.value;
            await this.set(valueKey, {
                ...data,
                value: currentValue + increment,
                updatedAt: this._now()
            }, { behavior: 'body-only' });
            return currentValue;
        });
        if (result === null) {
            throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
                pluginSlug: this.pluginSlug,
                operation: 'nextSequence',
                sequenceName: name,
                resourceName,
                lockTimeout,
                suggestion: 'Increase lockTimeout or check for deadlocks'
            });
        }
        return result;
    }
    async _withSequenceLock(lockKey, options, callback) {
        const { ttl = 30, timeout = 5000 } = options;
        const token = idGenerator();
        const startTime = this._now();
        let attempt = 0;
        while (true) {
            const payload = {
                token,
                acquiredAt: this._now(),
                _expiresAt: this._now() + (ttl * 1000)
            };
            const [ok, err] = await tryFn(() => this.set(lockKey, payload, {
                behavior: 'body-only',
                ifNoneMatch: '*'
            }));
            if (ok) {
                try {
                    return await callback();
                }
                finally {
                    const current = await this.get(lockKey);
                    if (current && current.token === token) {
                        await tryFn(() => this.delete(lockKey));
                    }
                }
            }
            if (!isPreconditionFailure(err)) {
                throw err;
            }
            if (timeout !== undefined && this._now() - startTime >= timeout) {
                return null;
            }
            const current = await this.get(lockKey);
            if (!current)
                continue;
            if (current._expiresAt && this._now() > current._expiresAt) {
                await tryFn(() => this.delete(lockKey));
                continue;
            }
            attempt += 1;
            const delay = computeBackoff(attempt, 100, 1000);
            await sleep(delay);
        }
    }
    async getSequence(name, options = {}) {
        const { resourceName = null } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const data = await this.get(valueKey);
        return data?.value ?? null;
    }
    async resetSequence(name, value, options = {}) {
        const { resourceName = null, lockTimeout = 5000, lockTTL = 10 } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const lockKey = this.getSequenceKey(resourceName, name, 'lock');
        const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
            const data = await this.get(valueKey);
            await this.set(valueKey, {
                value,
                name,
                resourceName,
                createdAt: data?.createdAt || this._now(),
                updatedAt: this._now(),
                resetAt: this._now()
            }, { behavior: 'body-only' });
            return true;
        });
        if (result === null) {
            throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
                pluginSlug: this.pluginSlug,
                operation: 'resetSequence',
                sequenceName: name,
                resourceName,
                lockTimeout,
                suggestion: 'Increase lockTimeout or check for deadlocks'
            });
        }
        return result;
    }
    async deleteSequence(name, options = {}) {
        const { resourceName = null } = options;
        const valueKey = this.getSequenceKey(resourceName, name, 'value');
        const lockKey = this.getSequenceKey(resourceName, name, 'lock');
        await this.delete(valueKey);
        await tryFn(() => this.delete(lockKey));
    }
    async listSequences(options = {}) {
        const { resourceName = null } = options;
        let prefix;
        if (resourceName) {
            prefix = `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=`;
        }
        else {
            prefix = `plugin=${this.pluginSlug}/sequence=`;
        }
        const [ok, , result] = await tryFn(() => this.client.listObjects({ prefix }));
        if (!ok || !result)
            return [];
        const keys = (result.Contents ?? []).map(item => item.Key).filter((k) => typeof k === 'string');
        const valueKeys = keys.filter(k => k.endsWith('/value'));
        const sequences = [];
        for (const key of valueKeys) {
            const data = await this.get(key);
            if (data) {
                sequences.push(data);
            }
        }
        return sequences;
    }
    _applyBehavior(data, behavior) {
        const effectiveLimit = calculateEffectiveLimit({ s3Limit: S3_METADATA_LIMIT });
        let metadata = {};
        let body = null;
        switch (behavior) {
            case 'body-overflow': {
                const entries = Object.entries(data);
                const sorted = entries.map(([key, value]) => {
                    const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
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
                    }
                    else {
                        if (body === null)
                            body = {};
                        body[item.key] = item.value;
                    }
                }
                break;
            }
            case 'body-only': {
                body = data;
                break;
            }
            case 'enforce-limits': {
                let currentSize = 0;
                for (const [key, value] of Object.entries(data)) {
                    const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
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
                            operation: 'PluginStorage.set',
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
                    availableBehaviors: ['body-overflow', 'body-only', 'enforce-limits'],
                    operation: 'PluginStorage._applyBehavior',
                    pluginSlug: this.pluginSlug,
                    suggestion: "Use 'body-overflow', 'body-only', or 'enforce-limits'"
                });
        }
        return { metadata, body };
    }
}

const DEFAULT_TTL_MS = 30000;
const DEFAULT_NAMESPACE = 'default';
class S3Mutex {
    storage;
    namespace;
    holderId;
    constructor(storage, namespace) {
        if (!storage) {
            throw new Error('S3Mutex: storage is required');
        }
        this.storage = storage;
        this.namespace = namespace || DEFAULT_NAMESPACE;
        this.holderId = this._generateHolderId();
    }
    async lock(key, ttlMs = DEFAULT_TTL_MS) {
        return this.tryLock(key, ttlMs);
    }
    async tryLock(key, ttlMs = DEFAULT_TTL_MS) {
        if (!key) {
            return {
                acquired: false,
                error: new Error('S3Mutex: key is required')
            };
        }
        const lockKey = this._getLockKey(key);
        const now = Date.now();
        const expiresAt = now + ttlMs;
        const lockId = this._generateLockId();
        const lockData = {
            lockId,
            holderId: this.holderId,
            acquiredAt: now,
            expiresAt
        };
        const version = await this.storage.setIfNotExists(lockKey, lockData, { ttl: Math.ceil(ttlMs / 1000) + 60, behavior: 'body-only' });
        if (version !== null) {
            return {
                acquired: true,
                lockId,
                expiresAt
            };
        }
        const existingResult = await this.storage.getWithVersion(lockKey);
        if (!existingResult.data) {
            return {
                acquired: false,
                error: new Error('Lock exists but could not be read')
            };
        }
        const existingLock = existingResult.data;
        if (existingLock.expiresAt <= now) {
            const newVersion = await this.storage.setIfVersion(lockKey, lockData, existingResult.version, { ttl: Math.ceil(ttlMs / 1000) + 60, behavior: 'body-only' });
            if (newVersion !== null) {
                return {
                    acquired: true,
                    lockId,
                    expiresAt
                };
            }
            return {
                acquired: false,
                error: new Error('Lock was taken by another process during expired lock takeover')
            };
        }
        return {
            acquired: false,
            error: new Error(`Lock is held by ${existingLock.holderId} until ${new Date(existingLock.expiresAt).toISOString()}`)
        };
    }
    async unlock(key, lockId) {
        if (!key || !lockId) {
            return false;
        }
        const lockKey = this._getLockKey(key);
        const result = await this.storage.getWithVersion(lockKey);
        if (!result.data || !result.version) {
            return false;
        }
        const existingLock = result.data;
        if (existingLock.lockId !== lockId) {
            return false;
        }
        return await this.storage.deleteIfVersion(lockKey, result.version);
    }
    async isLocked(key) {
        if (!key) {
            return false;
        }
        const lockKey = this._getLockKey(key);
        const result = await this.storage.getWithVersion(lockKey);
        if (!result.data) {
            return false;
        }
        const lockData = result.data;
        const now = Date.now();
        return lockData.expiresAt > now;
    }
    async extend(key, lockId, ttlMs) {
        if (!key || !lockId || ttlMs <= 0) {
            return false;
        }
        const lockKey = this._getLockKey(key);
        const result = await this.storage.getWithVersion(lockKey);
        if (!result.data || !result.version) {
            return false;
        }
        const existingLock = result.data;
        const now = Date.now();
        if (existingLock.lockId !== lockId) {
            return false;
        }
        if (existingLock.expiresAt <= now) {
            return false;
        }
        const newExpiresAt = now + ttlMs;
        const updatedLock = {
            ...existingLock,
            expiresAt: newExpiresAt
        };
        const newVersion = await this.storage.setIfVersion(lockKey, updatedLock, result.version, { ttl: Math.ceil(ttlMs / 1000) + 60, behavior: 'body-only' });
        return newVersion !== null;
    }
    async getLockInfo(key) {
        if (!key) {
            return null;
        }
        const lockKey = this._getLockKey(key);
        const result = await this.storage.getWithVersion(lockKey);
        if (!result.data) {
            return null;
        }
        return result.data;
    }
    _getLockKey(key) {
        return this.storage.getPluginKey(null, 'locks', `namespace=${this.namespace}`, `${key}.json`);
    }
    _generateLockId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `lock-${this.holderId}-${timestamp}-${random}`;
    }
    _generateHolderId() {
        if (typeof process !== 'undefined' && process.env) {
            if (process.env.POD_NAME) {
                return `holder-${process.env.POD_NAME}`;
            }
            if (process.env.HOSTNAME) {
                return `holder-${process.env.HOSTNAME}`;
            }
        }
        return `holder-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }
}

class DatabaseMetadata {
    database;
    _metadataUploadPending;
    _metadataUploadDebounce;
    _pluginStorage;
    _mutex;
    constructor(database) {
        this.database = database;
        this._metadataUploadPending = false;
        this._metadataUploadDebounce = null;
        this._pluginStorage = null;
        this._mutex = null;
    }
    _getPluginStorage() {
        if (!this._pluginStorage) {
            this._pluginStorage = new PluginStorage(this.database.client, 's3db-core');
        }
        return this._pluginStorage;
    }
    _requiresDistributedLock() {
        const client = this.database.client;
        if (!client)
            return false;
        const connStr = client.connectionString || '';
        if (connStr.startsWith('file://') || connStr.startsWith('memory://')) {
            return false;
        }
        const endpoint = client.config?.endpoint || '';
        if (endpoint.startsWith('mock://')) {
            return false;
        }
        return connStr.length > 0;
    }
    _getMutex() {
        if (!this._requiresDistributedLock()) {
            return null;
        }
        if (!this._mutex) {
            this._mutex = new S3Mutex(this._getPluginStorage(), 'metadata');
        }
        return this._mutex;
    }
    get uploadPending() {
        return this._metadataUploadPending;
    }
    blankMetadataStructure() {
        return {
            version: '1',
            s3dbVersion: this.database.s3dbVersion,
            lastUpdated: new Date().toISOString(),
            resources: {},
        };
    }
    generateDefinitionHash(definition, behavior) {
        const attributes = definition.attributes;
        const stableAttributes = { ...attributes };
        if (definition.timestamps) {
            delete stableAttributes.createdAt;
            delete stableAttributes.updatedAt;
        }
        const hashObj = {
            attributes: stableAttributes,
            behavior: behavior || definition.behavior || 'user-managed',
            partitions: definition.partitions || {},
        };
        const stableString = jsonStableStringify(hashObj);
        return `sha256:${crypto.createHash('sha256').update(stableString).digest('hex')}`;
    }
    getNextVersion(versions = {}) {
        const versionNumbers = Object.keys(versions)
            .filter(v => v.startsWith('v'))
            .map(v => parseInt(v.substring(1)))
            .filter(n => !isNaN(n));
        const maxVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) : 0;
        return `v${maxVersion + 1}`;
    }
    detectDefinitionChanges(savedMetadata) {
        const changes = [];
        for (const [name, currentResource] of Object.entries(this.database.resources)) {
            const currentHash = this.generateDefinitionHash(currentResource.export());
            const savedResource = savedMetadata.resources?.[name];
            if (!savedResource) {
                changes.push({
                    type: 'new',
                    resourceName: name,
                    currentHash,
                    savedHash: null
                });
            }
            else {
                const currentVersion = savedResource.currentVersion || 'v1';
                const versionData = savedResource.versions?.[currentVersion];
                const savedHash = versionData?.hash;
                if (savedHash !== currentHash) {
                    changes.push({
                        type: 'changed',
                        resourceName: name,
                        currentHash,
                        savedHash: savedHash || null,
                        fromVersion: currentVersion,
                        toVersion: this.getNextVersion(savedResource.versions)
                    });
                }
            }
        }
        for (const [name, savedResource] of Object.entries(savedMetadata.resources || {})) {
            if (!this.database._resourcesMap[name]) {
                const currentVersion = savedResource.currentVersion || 'v1';
                const versionData = savedResource.versions?.[currentVersion];
                changes.push({
                    type: 'deleted',
                    resourceName: name,
                    currentHash: null,
                    savedHash: versionData?.hash || null,
                    deletedVersion: currentVersion
                });
            }
        }
        return changes;
    }
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async _readFreshMetadata() {
        const [ok, , response] = await tryFn(async () => {
            const request = await this.database.client.getObject('s3db.json');
            return streamToString(request?.Body);
        });
        if (!ok || !response) {
            return null;
        }
        try {
            return JSON.parse(response);
        }
        catch {
            return null;
        }
    }
    _mergeSchemaRegistry(fresh, local) {
        if (!fresh && !local)
            return undefined;
        if (!fresh)
            return local;
        if (!local)
            return fresh;
        const mergedNextIndex = Math.max(fresh.nextIndex, local.nextIndex);
        const mergedMapping = { ...fresh.mapping };
        for (const [attr, index] of Object.entries(local.mapping)) {
            const existingIndex = mergedMapping[attr];
            if (existingIndex === undefined) {
                mergedMapping[attr] = index;
            }
            else if (existingIndex !== index) {
                mergedMapping[attr] = Math.max(existingIndex, index);
            }
        }
        const burnedByIndex = new Map();
        for (const entry of fresh.burned) {
            burnedByIndex.set(entry.index, entry);
        }
        for (const entry of local.burned) {
            if (!burnedByIndex.has(entry.index)) {
                burnedByIndex.set(entry.index, entry);
            }
        }
        return {
            nextIndex: mergedNextIndex,
            mapping: mergedMapping,
            burned: Array.from(burnedByIndex.values())
        };
    }
    _mergePluginSchemaRegistry(fresh, local) {
        if (!fresh && !local)
            return undefined;
        if (!fresh)
            return this._convertToPluginRegistries(local);
        if (!local)
            return this._convertToPluginRegistries(fresh);
        const merged = {};
        const allPlugins = new Set([...Object.keys(fresh), ...Object.keys(local)]);
        for (const pluginName of allPlugins) {
            const freshReg = fresh[pluginName];
            const localReg = local[pluginName];
            if (!freshReg && localReg) {
                merged[pluginName] = this._toPluginRegistry(localReg, pluginName);
            }
            else if (freshReg && !localReg) {
                merged[pluginName] = this._toPluginRegistry(freshReg, pluginName);
            }
            else if (freshReg && localReg) {
                merged[pluginName] = this._mergeSinglePluginRegistry(pluginName, freshReg, localReg);
            }
        }
        return merged;
    }
    _convertToPluginRegistries(registries) {
        if (!registries)
            return undefined;
        const result = {};
        for (const [name, reg] of Object.entries(registries)) {
            result[name] = this._toPluginRegistry(reg, name);
        }
        return result;
    }
    _toPluginRegistry(registry, pluginName) {
        if (!('nextIndex' in registry)) {
            return registry;
        }
        const numericReg = registry;
        const result = { mapping: {}, burned: [] };
        for (const [attr, index] of Object.entries(numericReg.mapping)) {
            result.mapping[attr] = this._legacyPluginKey(pluginName, index);
        }
        for (const burned of numericReg.burned) {
            result.burned.push({
                key: this._legacyPluginKey(pluginName, burned.index),
                attribute: burned.attribute,
                burnedAt: burned.burnedAt,
                reason: burned.reason
            });
        }
        return result;
    }
    _mergeSinglePluginRegistry(pluginName, fresh, local) {
        const freshPlugin = this._toPluginRegistry(fresh, pluginName);
        const localPlugin = this._toPluginRegistry(local, pluginName);
        const mergedMapping = { ...freshPlugin.mapping };
        for (const [attr, key] of Object.entries(localPlugin.mapping)) {
            if (!(attr in mergedMapping)) {
                mergedMapping[attr] = key;
            }
        }
        const burnedByKey = new Map();
        for (const entry of freshPlugin.burned) {
            burnedByKey.set(entry.key, entry);
        }
        for (const entry of localPlugin.burned) {
            if (!burnedByKey.has(entry.key)) {
                burnedByKey.set(entry.key, entry);
            }
        }
        return {
            mapping: mergedMapping,
            burned: Array.from(burnedByKey.values())
        };
    }
    _legacyPluginKey(pluginName, index) {
        const prefix = pluginName.substring(0, 2);
        return `p${prefix}${encode(index)}`;
    }
    _buildLocalMetadata() {
        const metadata = {
            version: this.database.version,
            s3dbVersion: this.database.s3dbVersion,
            lastUpdated: new Date().toISOString(),
            resources: {}
        };
        Object.entries(this.database.resources).forEach(([name, resource]) => {
            const resourceDef = resource.export();
            const serializableDef = this._buildMetadataDefinition(resourceDef);
            const definitionHash = this.generateDefinitionHash(serializableDef);
            const existingResource = this.database.savedMetadata?.resources?.[name];
            const currentVersion = existingResource?.currentVersion || 'v1';
            const existingVersionData = existingResource?.versions?.[currentVersion];
            let version;
            let isNewVersion;
            if (!existingVersionData || existingVersionData.hash !== definitionHash) {
                version = this.getNextVersion(existingResource?.versions);
                isNewVersion = true;
            }
            else {
                version = currentVersion;
                isNewVersion = false;
            }
            const idGeneratorValue = typeof resource.idGeneratorType === 'function'
                ? 'custom'
                : resource.idGeneratorType;
            const newVersionData = {
                hash: definitionHash,
                attributes: serializableDef.attributes,
                behavior: (serializableDef.behavior || 'user-managed'),
                timestamps: serializableDef.timestamps,
                partitions: serializableDef.partitions,
                paranoid: serializableDef.paranoid,
                allNestedObjectsOptional: serializableDef.allNestedObjectsOptional,
                autoDecrypt: serializableDef.autoDecrypt,
                cache: serializableDef.cache,
                asyncEvents: serializableDef.asyncEvents,
                asyncPartitions: serializableDef.asyncPartitions,
                hooks: serializableDef.hooks,
                idSize: resource.idSize,
                idGenerator: idGeneratorValue,
                createdAt: isNewVersion ? new Date().toISOString() : existingVersionData?.createdAt
            };
            const schema = resource.schema;
            let schemaRegistry = schema?.getSchemaRegistry?.();
            let pluginSchemaRegistry = schema?.getPluginSchemaRegistry?.();
            if (!schemaRegistry && existingResource?.schemaRegistry) {
                schemaRegistry = existingResource.schemaRegistry;
            }
            if (!pluginSchemaRegistry && existingResource?.pluginSchemaRegistry) {
                pluginSchemaRegistry = existingResource.pluginSchemaRegistry;
            }
            if (!schemaRegistry && schema) {
                const initial = schema.generateInitialRegistry?.();
                if (initial) {
                    schemaRegistry = initial.schemaRegistry;
                    pluginSchemaRegistry = initial.pluginSchemaRegistry;
                }
            }
            metadata.resources[name] = {
                currentVersion: version,
                partitions: resource.config.partitions || {},
                createdBy: existingResource?.createdBy || resource.config.createdBy || 'user',
                versions: {
                    ...existingResource?.versions,
                    [version]: newVersionData
                },
                schemaRegistry,
                pluginSchemaRegistry
            };
            if (resource.version !== version) {
                resource.version = version;
                resource.emit('versionUpdated', { oldVersion: currentVersion, newVersion: version });
            }
        });
        return metadata;
    }
    _mergeMetadata(fresh, local) {
        const merged = {
            version: local.version,
            s3dbVersion: local.s3dbVersion,
            lastUpdated: local.lastUpdated,
            resources: { ...fresh.resources }
        };
        for (const [name, localResource] of Object.entries(local.resources)) {
            const freshResource = fresh.resources[name];
            if (!freshResource) {
                merged.resources[name] = localResource;
                continue;
            }
            merged.resources[name] = {
                ...localResource,
                schemaRegistry: this._mergeSchemaRegistry(freshResource.schemaRegistry, localResource.schemaRegistry),
                pluginSchemaRegistry: this._mergePluginSchemaRegistry(freshResource.pluginSchemaRegistry, localResource.pluginSchemaRegistry)
            };
        }
        return merged;
    }
    scheduleMetadataUpload() {
        if (!this.database.deferMetadataWrites) {
            return this.uploadMetadataFile();
        }
        if (this._metadataUploadDebounce) {
            clearTimeout(this._metadataUploadDebounce);
        }
        this._metadataUploadPending = true;
        this._metadataUploadDebounce = setTimeout(() => {
            if (this._metadataUploadPending) {
                this.uploadMetadataFile()
                    .then(() => {
                    this._metadataUploadPending = false;
                })
                    .catch(err => {
                    this.database.logger.error({ error: err.message }, 'metadata upload failed');
                    this._metadataUploadPending = false;
                });
            }
        }, this.database.metadataWriteDelay);
        return Promise.resolve();
    }
    async flushMetadata() {
        if (this._metadataUploadDebounce) {
            clearTimeout(this._metadataUploadDebounce);
            this._metadataUploadDebounce = null;
        }
        if (this._metadataUploadPending) {
            await this.uploadMetadataFile();
            this._metadataUploadPending = false;
        }
    }
    async uploadMetadataFile() {
        const mutex = this._getMutex();
        if (!mutex) {
            await this._uploadMetadataWithoutLock();
            return;
        }
        await this._uploadMetadataWithLock(mutex);
    }
    async _uploadMetadataWithoutLock() {
        const localMetadata = this._buildLocalMetadata();
        await this.database.client.putObject({
            key: 's3db.json',
            body: JSON.stringify(localMetadata, null, 2),
            contentType: 'application/json'
        });
        this.database.savedMetadata = localMetadata;
        this.database.emit('db:metadata-uploaded', localMetadata);
    }
    async _uploadMetadataWithLock(mutex) {
        const maxRetries = 3;
        const lockTtl = 30000;
        let attempt = 0;
        while (attempt < maxRetries) {
            const lock = await mutex.tryLock('s3db-metadata', lockTtl);
            if (!lock.acquired) {
                attempt++;
                this.database.logger.debug({ attempt, maxRetries, error: lock.error?.message }, 'failed to acquire metadata lock, retrying');
                if (attempt >= maxRetries) {
                    throw new Error(`Failed to acquire metadata lock after ${maxRetries} attempts: ${lock.error?.message}`);
                }
                await this._sleep(100 * Math.pow(2, attempt - 1));
                continue;
            }
            try {
                const freshMetadata = await this._readFreshMetadata();
                const localMetadata = this._buildLocalMetadata();
                const finalMetadata = freshMetadata
                    ? this._mergeMetadata(freshMetadata, localMetadata)
                    : localMetadata;
                await this.database.client.putObject({
                    key: 's3db.json',
                    body: JSON.stringify(finalMetadata, null, 2),
                    contentType: 'application/json'
                });
                this.database.savedMetadata = finalMetadata;
                this.database.emit('db:metadata-uploaded', finalMetadata);
                return;
            }
            finally {
                await mutex.unlock('s3db-metadata', lock.lockId);
            }
        }
    }
    _buildMetadataDefinition(resourceDef) {
        const { hooks, ...rest } = resourceDef || {};
        const serializable = { ...rest };
        if (hooks) {
            serializable.hooks = this._summarizeHooks(hooks);
        }
        else {
            serializable.hooks = {};
        }
        return serializable;
    }
    _summarizeHooks(hooks) {
        if (!hooks || typeof hooks !== 'object') {
            return {};
        }
        const summary = {};
        for (const [event, handlers] of Object.entries(hooks)) {
            if (!Array.isArray(handlers) || handlers.length === 0) {
                continue;
            }
            summary[event] = {
                count: handlers.length,
                handlers: handlers.map((handler) => {
                    if (typeof handler !== 'function') {
                        return { name: null, length: null, type: typeof handler };
                    }
                    return {
                        name: handler.name || null,
                        length: handler.length ?? null,
                        type: 'function'
                    };
                })
            };
        }
        return summary;
    }
}

class DatabasePlugins {
    database;
    coordinators;
    constructor(database, coordinators) {
        this.database = database;
        this.coordinators = coordinators;
    }
    async startPlugins() {
        const db = this.database;
        if (!lodashEs.isEmpty(db.pluginList)) {
            const plugins = [];
            for (const p of db.pluginList) {
                try {
                    const plugin = lodashEs.isFunction(p) ? new p(db) : p;
                    plugins.push(plugin);
                }
                catch (error) {
                    const pluginName = p.name || p.constructor?.name || 'Unknown';
                    throw new DatabaseError(`Failed to instantiate plugin '${pluginName}': ${error.message}`, {
                        operation: 'startPlugins.instantiate',
                        pluginName,
                        original: error
                    });
                }
            }
            const concurrency = Math.max(1, Number.isFinite(db.executorPool?.concurrency) ? db.executorPool.concurrency : 5);
            const installResult = await TasksPool.map(plugins, async (plugin) => {
                const pluginName = this._getPluginName(plugin);
                if (typeof plugin.setInstanceName === 'function') {
                    plugin.setInstanceName(pluginName);
                }
                else {
                    plugin.instanceName = pluginName;
                }
                await plugin.install(db);
                db.emit('db:plugin:metrics', {
                    stage: 'install',
                    plugin: pluginName,
                    ...this.coordinators.collectMemorySnapshot()
                });
                db.pluginRegistry[pluginName] = plugin;
                return pluginName;
            }, { concurrency });
            if (installResult.errors.length > 0) {
                const errorInfo = installResult.errors[0];
                const failedPlugin = errorInfo.item;
                const error = errorInfo.error;
                const failedName = this._getPluginName(failedPlugin);
                throw new DatabaseError(`Failed to install plugin '${failedName}': ${error?.message || error}`, {
                    operation: 'startPlugins.install',
                    pluginName: failedName,
                    original: error
                });
            }
            const startResult = await TasksPool.map(plugins, async (plugin) => {
                const pluginName = this._getPluginName(plugin);
                await plugin.start();
                db.emit('db:plugin:metrics', {
                    stage: 'start',
                    plugin: pluginName,
                    ...this.coordinators.collectMemorySnapshot()
                });
                return plugin;
            }, { concurrency });
            if (startResult.errors.length > 0) {
                const errorInfo = startResult.errors[0];
                const failedPlugin = errorInfo.item;
                const error = errorInfo.error;
                const failedName = this._getPluginName(failedPlugin);
                throw new DatabaseError(`Failed to start plugin '${failedName}': ${error?.message || error}`, {
                    operation: 'startPlugins.start',
                    pluginName: failedName,
                    original: error
                });
            }
        }
    }
    async usePlugin(plugin, name = null) {
        const db = this.database;
        const pluginName = this._getPluginName(plugin, name);
        if (typeof plugin.setInstanceName === 'function') {
            plugin.setInstanceName(pluginName);
        }
        else {
            plugin.instanceName = pluginName;
        }
        if (!plugin.processManager) {
            plugin.processManager = db.processManager;
        }
        if (!plugin.cronManager) {
            plugin.cronManager = db.cronManager;
        }
        if (!plugin.logger && db.logger) {
            plugin.logger = db.getChildLogger(`Plugin:${pluginName}`, { plugin: pluginName });
        }
        db.plugins[pluginName] = plugin;
        if (db.isConnected()) {
            await plugin.install(db);
            await plugin.start();
        }
        return plugin;
    }
    async uninstallPlugin(name, options = {}) {
        const db = this.database;
        const pluginName = name.toLowerCase().replace('plugin', '');
        const plugin = db.plugins[pluginName] || db.pluginRegistry[pluginName];
        if (!plugin) {
            throw new DatabaseError(`Plugin '${name}' not found`, {
                operation: 'uninstallPlugin',
                pluginName: name,
                availablePlugins: Object.keys(db.pluginRegistry),
                suggestion: 'Check plugin name or list available plugins using Object.keys(db.pluginRegistry)'
            });
        }
        if (plugin.stop) {
            await plugin.stop();
        }
        if (plugin.uninstall) {
            await plugin.uninstall(options);
        }
        delete db.plugins[pluginName];
        delete db.pluginRegistry[pluginName];
        const index = db.pluginList.indexOf(plugin);
        if (index > -1) {
            db.pluginList.splice(index, 1);
        }
        db.emit('db:plugin:uninstalled', { name: pluginName, plugin });
    }
    _getPluginName(plugin, customName = null) {
        return customName || plugin.constructor.name.replace('Plugin', '').toLowerCase();
    }
}

class AsyncEventEmitter extends EventEmitter {
    _asyncMode;
    logLevel;
    logger;
    constructor(options = {}) {
        super();
        this._asyncMode = true;
        this.logLevel = options.logLevel || 'info';
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            this.logger = createLogger({ name: 'AsyncEventEmitter', level: this.logLevel });
        }
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
                }
                catch (error) {
                    if (event !== 'error') {
                        this.emit('error', error);
                    }
                    else {
                        const err = error;
                        this.logger.error({ error: err.message, stack: err.stack }, 'Error in error handler');
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

/**
 * Flatten nested objects into dot-notation keys
 * Lightweight replacement for 'flat' package (only needed features)
 */
function flatten(obj, options = {}) {
    const { safe = false } = options;
    const result = {};
    function recurse(current, path = '') {
        if (current === null || current === undefined) {
            result[path] = current;
            return;
        }
        if (safe && Array.isArray(current)) {
            result[path] = current;
            return;
        }
        if (typeof current !== 'object' || current instanceof Date) {
            result[path] = current;
            return;
        }
        if (Array.isArray(current)) {
            if (current.length === 0) {
                result[path] = [];
            }
            else {
                current.forEach((item, index) => {
                    const newPath = path ? `${path}.${index}` : `${index}`;
                    recurse(item, newPath);
                });
            }
            return;
        }
        const keys = Object.keys(current);
        if (keys.length === 0) {
            result[path] = {};
        }
        else {
            keys.forEach(key => {
                const newPath = path ? `${path}.${key}` : key;
                recurse(current[key], newPath);
            });
        }
    }
    recurse(obj);
    return result;
}
/**
 * Unflatten dot-notation keys back into nested objects
 * Lightweight replacement for 'flat' package (only needed features)
 */
function unflatten(obj, _options = {}) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const parts = key.split('.');
        let current = result;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            if (isLast) {
                current[part] = value;
            }
            else {
                const nextPart = parts[i + 1];
                const isNextNumeric = /^\d+$/.test(nextPart);
                if (isNextNumeric) {
                    current[part] = current[part] || [];
                }
                else {
                    current[part] = current[part] || {};
                }
                current = current[part];
            }
        }
    }
    return result;
}

// @ts-expect-error bcrypt has no type declarations
function hashPasswordSync(password, rounds = 10) {
    if (!password || typeof password !== 'string') {
        throw new ValidationError('Password must be a non-empty string', {
            field: 'password',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a non-empty string before calling hashPasswordSync().'
        });
    }
    if (rounds < 4 || rounds > 31) {
        throw new ValidationError('Bcrypt rounds must be between 4 and 31', {
            field: 'rounds',
            statusCode: 400,
            retriable: false,
            suggestion: 'Configure bcrypt rounds between 4 and 31 (inclusive).'
        });
    }
    return bcrypt.hashSync(password, rounds);
}
async function hashPassword(password, rounds = 10) {
    if (!password || typeof password !== 'string') {
        throw new ValidationError('Password must be a non-empty string', {
            field: 'password',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a non-empty string before calling hashPassword().'
        });
    }
    if (rounds < 4 || rounds > 31) {
        throw new ValidationError('Bcrypt rounds must be between 4 and 31', {
            field: 'rounds',
            statusCode: 400,
            retriable: false,
            suggestion: 'Configure bcrypt rounds between 4 and 31 (inclusive).'
        });
    }
    const hashed = await bcrypt.hash(password, rounds);
    return hashed;
}
function compactHash(bcryptHash) {
    if (!bcryptHash || typeof bcryptHash !== 'string') {
        throw new ValidationError('Invalid bcrypt hash', {
            field: 'bcryptHash',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a valid bcrypt hash generated by hashPassword().'
        });
    }
    if (!bcryptHash.startsWith('$2')) {
        throw new ValidationError('Not a valid bcrypt hash', {
            field: 'bcryptHash',
            statusCode: 400,
            retriable: false,
            suggestion: 'Ensure the hash starts with "$2" and was produced by bcrypt.'
        });
    }
    const parts = bcryptHash.split('$');
    if (parts.length !== 4) {
        throw new ValidationError('Invalid bcrypt hash format', {
            field: 'bcryptHash',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a complete bcrypt hash (e.g., "$2b$10$...").'
        });
    }
    return parts[3];
}

const FastestValidator = FastestValidatorModule__namespace.default;
async function secretHandler(actual, errors, _schema, field) {
    if (!this.passphrase) {
        errors.push(new ValidationError('Missing configuration for secrets encryption.', {
            actual,
            field,
            type: 'encryptionKeyMissing',
            suggestion: 'Provide a passphrase for secret encryption.'
        }));
        return actual;
    }
    const [ok, err, res] = await tryFn(() => encrypt(String(actual), this.passphrase));
    if (ok)
        return res;
    errors.push(new ValidationError('Problem encrypting secret.', {
        actual,
        field,
        type: 'encryptionProblem',
        error: err,
        suggestion: 'Check the passphrase and input value.'
    }));
    return actual;
}
function passwordHandler(actual, errors, _schema, field) {
    if (!this.bcryptRounds) {
        errors.push(new ValidationError('Missing bcrypt rounds configuration.', {
            actual,
            field,
            type: 'bcryptRoundsMissing',
            suggestion: 'Provide bcryptRounds in database configuration.'
        }));
        return actual;
    }
    const [okHash, errHash, hash] = tryFnSync(() => hashPasswordSync(String(actual), this.bcryptRounds));
    if (!okHash) {
        errors.push(new ValidationError('Problem hashing password.', {
            actual,
            field,
            type: 'passwordHashingProblem',
            error: errHash,
            suggestion: 'Check the bcryptRounds configuration and password value.'
        }));
        return actual;
    }
    const [okCompact, errCompact, compacted] = tryFnSync(() => compactHash(hash));
    if (!okCompact) {
        errors.push(new ValidationError('Problem compacting password hash.', {
            actual,
            field,
            type: 'hashCompactionProblem',
            error: errCompact,
            suggestion: 'Bcrypt hash format may be invalid.'
        }));
        return hash;
    }
    return compacted;
}
function jsonHandler(actual, errors, _schema, field) {
    if (lodashEs.isString(actual))
        return actual;
    const [ok, err, json] = tryFnSync(() => JSON.stringify(actual));
    if (!ok)
        throw new ValidationError('Failed to stringify JSON', { original: err, input: actual, field });
    return json;
}
class Validator extends FastestValidator {
    passphrase;
    bcryptRounds;
    autoEncrypt;
    autoHash;
    constructor({ options, passphrase, bcryptRounds = 10, autoEncrypt = true, autoHash = true } = {}) {
        super(lodashEs.merge({}, {
            useNewCustomCheckerFunction: true,
            messages: {
                encryptionKeyMissing: 'Missing configuration for secrets encryption.',
                encryptionProblem: 'Problem encrypting secret. Actual: {actual}. Error: {error}',
                bcryptRoundsMissing: 'Missing bcrypt rounds configuration for password hashing.',
                passwordHashingProblem: 'Problem hashing password. Error: {error}',
            },
            defaults: {
                string: {
                    trim: true,
                },
                object: {
                    strict: 'remove',
                },
                number: {
                    convert: true,
                }
            },
        }, options));
        this.passphrase = passphrase;
        this.bcryptRounds = bcryptRounds;
        this.autoEncrypt = autoEncrypt;
        this.autoHash = autoHash;
        this.alias('secret', {
            type: 'string',
            custom: this.autoEncrypt ? secretHandler : undefined,
            messages: {
                string: "The '{field}' field must be a string.",
                stringMin: "This secret '{field}' field length must be at least {expected} long.",
            },
        });
        this.alias('secretAny', {
            type: 'any',
            custom: this.autoEncrypt ? secretHandler : undefined,
        });
        this.alias('secretNumber', {
            type: 'number',
            custom: this.autoEncrypt ? secretHandler : undefined,
        });
        this.alias('password', {
            type: 'string',
            custom: this.autoHash ? passwordHandler : undefined,
            messages: {
                string: "The '{field}' field must be a string.",
                stringMin: "This password '{field}' field length must be at least {expected} long.",
            },
        });
        this.alias('json', {
            type: 'any',
            custom: this.autoEncrypt ? jsonHandler : undefined,
        });
        this.alias('embedding', {
            type: 'array',
            items: 'number',
            empty: false,
        });
    }
}
const ValidatorManager = Validator;

/**
 * IP Address Encoding/Decoding Utilities
 *
 * Provides compact binary encoding for IPv4 and IPv6 addresses
 * to save space in S3 metadata.
 */
/**
 * Validate IPv4 address format
 */
function isValidIPv4(ip) {
    if (typeof ip !== 'string')
        return false;
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);
    if (!match)
        return false;
    for (let i = 1; i <= 4; i++) {
        const octet = parseInt(match[i], 10);
        if (octet < 0 || octet > 255)
            return false;
    }
    return true;
}
/**
 * Validate IPv6 address format
 */
function isValidIPv6(ip) {
    if (typeof ip !== 'string')
        return false;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;
    return ipv6Regex.test(ip);
}
/**
 * Encode IPv4 address to Base64 binary representation
 */
function encodeIPv4(ip) {
    if (!isValidIPv4(ip)) {
        throw new ValidationError('Invalid IPv4 address', {
            field: 'ip',
            value: ip,
            retriable: false,
            suggestion: 'Provide a valid IPv4 address (e.g., "192.168.0.1").'
        });
    }
    const octets = ip.split('.').map(octet => parseInt(octet, 10));
    const buffer = Buffer.from(octets);
    return buffer.toString('base64');
}
/**
 * Decode Base64 binary to IPv4 address
 */
function decodeIPv4(encoded) {
    if (typeof encoded !== 'string') {
        throw new ValidationError('Encoded IPv4 must be a string', {
            field: 'encoded',
            retriable: false,
            suggestion: 'Pass the base64-encoded IPv4 string returned by encodeIPv4().'
        });
    }
    const [ok, err, result] = tryFnSync(() => {
        const buffer = Buffer.from(encoded, 'base64');
        if (buffer.length !== 4) {
            throw new ValidationError('Invalid encoded IPv4 length', {
                field: 'encoded',
                value: encoded,
                retriable: false,
                suggestion: 'Ensure the encoded IPv4 string was produced by encodeIPv4().'
            });
        }
        return Array.from(buffer).join('.');
    });
    if (!ok) {
        if (err instanceof ValidationError) {
            throw err;
        }
        throw new ValidationError('Failed to decode IPv4', {
            field: 'encoded',
            retriable: false,
            suggestion: 'Confirm the value is a base64-encoded IPv4 string generated by encodeIPv4().',
            original: err
        });
    }
    return result;
}
/**
 * Normalize IPv6 address to full expanded form
 */
function expandIPv6(ip) {
    if (!isValidIPv6(ip)) {
        throw new ValidationError('Invalid IPv6 address', {
            field: 'ip',
            value: ip,
            retriable: false,
            suggestion: 'Provide a valid IPv6 address (e.g., "2001:db8::1").'
        });
    }
    let expanded = ip;
    if (expanded === '::') {
        return '0000:0000:0000:0000:0000:0000:0000:0000';
    }
    if (expanded.includes('::')) {
        const parts = expanded.split('::');
        const leftParts = parts[0] ? parts[0].split(':') : [];
        const rightParts = parts[1] ? parts[1].split(':') : [];
        const missingGroups = 8 - leftParts.length - rightParts.length;
        const middleParts = Array(missingGroups).fill('0');
        expanded = [...leftParts, ...middleParts, ...rightParts].join(':');
    }
    const groups = expanded.split(':');
    const paddedGroups = groups.map(group => group.padStart(4, '0'));
    return paddedGroups.join(':');
}
/**
 * Compress IPv6 address (remove leading zeros and use ::)
 */
function compressIPv6(ip) {
    let compressed = ip.split(':').map(group => {
        return parseInt(group, 16).toString(16);
    }).join(':');
    const zeroSequences = [];
    let currentSequence = { start: -1, length: 0 };
    compressed.split(':').forEach((group, index) => {
        if (group === '0') {
            if (currentSequence.start === -1) {
                currentSequence.start = index;
                currentSequence.length = 1;
            }
            else {
                currentSequence.length++;
            }
        }
        else {
            if (currentSequence.length > 0) {
                zeroSequences.push({ ...currentSequence });
                currentSequence = { start: -1, length: 0 };
            }
        }
    });
    if (currentSequence.length > 0) {
        zeroSequences.push(currentSequence);
    }
    const longestSequence = zeroSequences
        .filter(seq => seq.length >= 2)
        .sort((a, b) => b.length - a.length)[0];
    if (longestSequence) {
        const parts = compressed.split(':');
        const before = parts.slice(0, longestSequence.start).join(':');
        const after = parts.slice(longestSequence.start + longestSequence.length).join(':');
        if (before && after) {
            compressed = `${before}::${after}`;
        }
        else if (before) {
            compressed = `${before}::`;
        }
        else if (after) {
            compressed = `::${after}`;
        }
        else {
            compressed = '::';
        }
    }
    return compressed;
}
/**
 * Encode IPv6 address to Base64 binary representation
 */
function encodeIPv6(ip) {
    if (!isValidIPv6(ip)) {
        throw new ValidationError('Invalid IPv6 address', {
            field: 'ip',
            value: ip,
            retriable: false,
            suggestion: 'Provide a valid IPv6 address (e.g., "2001:db8::1").'
        });
    }
    const expanded = expandIPv6(ip);
    const groups = expanded.split(':');
    const bytes = [];
    for (const group of groups) {
        const value = parseInt(group, 16);
        bytes.push((value >> 8) & 0xFF);
        bytes.push(value & 0xFF);
    }
    const buffer = Buffer.from(bytes);
    return buffer.toString('base64');
}
/**
 * Decode Base64 binary to IPv6 address
 */
function decodeIPv6(encoded, compress = true) {
    if (typeof encoded !== 'string') {
        throw new ValidationError('Encoded IPv6 must be a string', {
            field: 'encoded',
            retriable: false,
            suggestion: 'Pass the base64-encoded IPv6 string returned by encodeIPv6().'
        });
    }
    if (encoded.length !== 24 && isValidIPv6(encoded)) {
        return compress ? encoded : expandIPv6(encoded);
    }
    const [ok, err, result] = tryFnSync(() => {
        const buffer = Buffer.from(encoded, 'base64');
        if (buffer.length !== 16) {
            throw new ValidationError('Invalid encoded IPv6 length', {
                field: 'encoded',
                value: encoded,
                retriable: false,
                suggestion: 'Ensure the encoded IPv6 string was produced by encodeIPv6().'
            });
        }
        const groups = [];
        for (let i = 0; i < 16; i += 2) {
            const value = (buffer[i] << 8) | buffer[i + 1];
            groups.push(value.toString(16).padStart(4, '0'));
        }
        const fullAddress = groups.join(':');
        return compress ? compressIPv6(fullAddress) : fullAddress;
    });
    if (!ok) {
        if (err instanceof ValidationError) {
            throw err;
        }
        throw new ValidationError('Failed to decode IPv6', {
            field: 'encoded',
            retriable: false,
            suggestion: 'Confirm the value is a base64-encoded IPv6 string generated by encodeIPv6().',
            original: err
        });
    }
    return result;
}

/**
 * Binary/Buffer Encoding Utilities
 *
 * Provides compact Base64 encoding for binary data (Buffer, Uint8Array)
 * to save space in S3 metadata.
 */
/**
 * Encode Buffer to Base64 string
 */
function encodeBuffer(buffer) {
    if (buffer === null || buffer === undefined) {
        return null;
    }
    if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
        throw new ValidationError('Value must be a Buffer or Uint8Array', {
            field: 'buffer',
            value: typeof buffer,
            retriable: false,
            suggestion: 'Pass a Buffer or Uint8Array instance.'
        });
    }
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return buf.toString('base64');
}
/**
 * Decode Base64 string back to Buffer
 */
function decodeBuffer(encoded) {
    if (encoded === null || encoded === undefined) {
        return null;
    }
    if (typeof encoded !== 'string') {
        throw new ValidationError('Encoded buffer must be a string', {
            field: 'encoded',
            value: typeof encoded,
            retriable: false,
            suggestion: 'Pass the base64-encoded string returned by encodeBuffer().'
        });
    }
    return Buffer.from(encoded, 'base64');
}
/**
 * Encode a bitmap (Buffer) with optional size validation
 */
function encodeBits(buffer, expectedBits = null, skipValidation = false) {
    if (skipValidation) {
        return buffer.toString('base64');
    }
    if (buffer === null || buffer === undefined) {
        return null;
    }
    if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
        throw new ValidationError('Bitmap must be a Buffer or Uint8Array', {
            field: 'bits',
            value: typeof buffer,
            retriable: false,
            suggestion: 'Pass a Buffer or Uint8Array instance.'
        });
    }
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    if (expectedBits !== null) {
        const expectedBytes = (expectedBits + 7) >> 3;
        if (buf.length !== expectedBytes) {
            throw new ValidationError(`Bitmap size mismatch: expected ${expectedBytes} bytes (${expectedBits} bits), got ${buf.length} bytes`, {
                field: 'bits',
                expectedBits,
                expectedBytes,
                actualBytes: buf.length,
                retriable: false,
                suggestion: `Use Buffer.alloc(${expectedBytes}) to create a bitmap with ${expectedBits} bits.`
            });
        }
    }
    return buf.toString('base64');
}
/**
 * Decode Base64 string back to bitmap Buffer
 */
function decodeBits(encoded, expectedBits = null, skipValidation = false) {
    if (skipValidation) {
        return Buffer.from(encoded, 'base64');
    }
    if (encoded === null || encoded === undefined) {
        return null;
    }
    if (typeof encoded !== 'string') {
        throw new ValidationError('Encoded bits must be a string', {
            field: 'encoded',
            value: typeof encoded,
            retriable: false,
            suggestion: 'Pass the base64-encoded string returned by encodeBits().'
        });
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (expectedBits !== null) {
        const expectedBytes = (expectedBits + 7) >> 3;
        if (buffer.length !== expectedBytes) {
            throw new ValidationError(`Decoded bitmap size mismatch: expected ${expectedBytes} bytes (${expectedBits} bits), got ${buffer.length} bytes`, {
                field: 'bits',
                expectedBits,
                expectedBytes,
                actualBytes: buffer.length,
                retriable: false,
                suggestion: 'Ensure the encoded string was produced by encodeBits() with the same bit count.'
            });
        }
    }
    return buffer;
}
const POPCOUNT_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    let count = 0;
    let n = i;
    while (n) {
        count += n & 1;
        n >>= 1;
    }
    POPCOUNT_TABLE[i] = count;
}

function encodeGeoLat(lat, precision = 6) {
    if (lat === null || lat === undefined)
        return lat;
    if (typeof lat !== 'number' || isNaN(lat))
        return lat;
    if (!isFinite(lat))
        return lat;
    if (lat < -90 || lat > 90) {
        throw new ValidationError('Latitude out of range', {
            field: 'lat',
            value: lat,
            min: -90,
            max: 90,
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a latitude between -90 and +90 degrees.'
        });
    }
    const normalized = lat + 90;
    const scale = Math.pow(10, precision);
    const scaled = Math.round(normalized * scale);
    return '~' + encode(scaled);
}
function decodeGeoLat(encoded, precision = 6) {
    if (typeof encoded !== 'string')
        return encoded;
    if (!encoded.startsWith('~'))
        return encoded;
    const scaled = decode(encoded.slice(1));
    if (isNaN(scaled))
        return NaN;
    const scale = Math.pow(10, precision);
    const normalized = scaled / scale;
    return normalized - 90;
}
function encodeGeoLon(lon, precision = 6) {
    if (lon === null || lon === undefined)
        return lon;
    if (typeof lon !== 'number' || isNaN(lon))
        return lon;
    if (!isFinite(lon))
        return lon;
    if (lon < -180 || lon > 180) {
        throw new ValidationError('Longitude out of range', {
            field: 'lon',
            value: lon,
            min: -180,
            max: 180,
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide a longitude between -180 and +180 degrees.'
        });
    }
    const normalized = lon + 180;
    const scale = Math.pow(10, precision);
    const scaled = Math.round(normalized * scale);
    return '~' + encode(scaled);
}
function decodeGeoLon(encoded, precision = 6) {
    if (typeof encoded !== 'string')
        return encoded;
    if (!encoded.startsWith('~'))
        return encoded;
    const scaled = decode(encoded.slice(1));
    if (isNaN(scaled))
        return NaN;
    const scale = Math.pow(10, precision);
    const normalized = scaled / scale;
    return normalized - 180;
}
function encodeGeoPoint(lat, lon, precision = 6) {
    const latEncoded = encodeGeoLat(lat, precision);
    const lonEncoded = encodeGeoLon(lon, precision);
    return String(latEncoded) + String(lonEncoded);
}
function decodeGeoPoint(encoded, precision = 6) {
    if (typeof encoded !== 'string')
        return { latitude: NaN, longitude: NaN };
    const parts = encoded.split('~').filter(p => p.length > 0);
    if (parts.length !== 2) {
        return { latitude: NaN, longitude: NaN };
    }
    const latitude = decodeGeoLat('~' + parts[0], precision);
    const longitude = decodeGeoLon('~' + parts[1], precision);
    return { latitude, longitude };
}

const validatorCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;
function generateSchemaFingerprint(attributes, options = {}) {
    const normalized = {
        attributes: JSON.stringify(attributes, Object.keys(attributes).sort()),
        passphrase: options.passphrase || 'secret',
        bcryptRounds: options.bcryptRounds || 10,
        allNestedObjectsOptional: options.allNestedObjectsOptional ?? false
    };
    const serialized = JSON.stringify(normalized);
    return crypto.createHash('sha256').update(serialized).digest('hex');
}
function getCachedValidator(fingerprint) {
    const cached = validatorCache.get(fingerprint);
    if (cached) {
        cached.refCount++;
        cached.lastAccessedAt = Date.now();
        cacheHits++;
        return cached.validator;
    }
    cacheMisses++;
    return null;
}
function cacheValidator(fingerprint, validator) {
    if (validatorCache.has(fingerprint)) {
        validatorCache.get(fingerprint).refCount++;
        return;
    }
    validatorCache.set(fingerprint, {
        validator,
        refCount: 1,
        createdAt: Date.now(),
        lastAccessedAt: Date.now()
    });
}
function releaseValidator(fingerprint) {
    const cached = validatorCache.get(fingerprint);
    if (!cached)
        return;
    cached.refCount = Math.max(0, cached.refCount - 1);
}
function evictUnusedValidators(maxAgeMs = 5 * 60 * 1000) {
    const now = Date.now();
    let evicted = 0;
    for (const [fingerprint, cached] of validatorCache.entries()) {
        if (cached.refCount === 0 && (now - cached.lastAccessedAt) >= maxAgeMs) {
            validatorCache.delete(fingerprint);
            evicted++;
        }
    }
    return evicted;
}
function getCacheStats() {
    let totalRefCount = 0;
    let zeroRefCount = 0;
    for (const cached of validatorCache.values()) {
        totalRefCount += cached.refCount;
        if (cached.refCount === 0)
            zeroRefCount++;
    }
    return {
        size: validatorCache.size,
        totalReferences: totalRefCount,
        zeroRefValidators: zeroRefCount,
        cacheHits,
        cacheMisses,
        hitRate: cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses)) : 0
    };
}
function getCacheMemoryUsage() {
    const VALIDATOR_SIZE_KB = 50;
    return {
        estimatedKB: validatorCache.size * VALIDATOR_SIZE_KB,
        estimatedMB: (validatorCache.size * VALIDATOR_SIZE_KB) / 1024,
        validatorCount: validatorCache.size
    };
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
function generatePluginAttributeHash(pluginName, attributeName) {
    const input = `${pluginName}:${attributeName}`;
    const hash = crypto.createHash('sha256').update(input).digest();
    const num = hash.readUInt32BE(0);
    const base62Hash = encode(num);
    const paddedHash = base62Hash.padStart(3, '0').substring(0, 3);
    return 'p' + paddedHash.toLowerCase();
}
function generateLegacyPluginIndexKey(pluginName, index) {
    const prefix = pluginName.substring(0, 2);
    return `p${prefix}${encode(index)}`;
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
/**
 * Generate attribute mapping from a persistent registry.
 * This ensures indices are stable across schema changes - new attributes
 * always get the next available index, existing attributes keep their index.
 */
function generateMappingFromRegistry(keys, existingRegistry) {
    const now = new Date().toISOString();
    const registry = existingRegistry
        ? {
            nextIndex: existingRegistry.nextIndex,
            mapping: { ...existingRegistry.mapping },
            burned: [...existingRegistry.burned]
        }
        : { nextIndex: 0, mapping: {}, burned: [] };
    const mapping = {};
    const reversedMapping = {};
    let changed = false;
    const mappedIndices = Object.values(registry.mapping).filter((value) => Number.isFinite(value));
    const burnedIndices = registry.burned.map(burned => burned.index).filter((value) => Number.isFinite(value));
    const maxIndex = Math.max(-1, ...mappedIndices, ...burnedIndices);
    if (registry.nextIndex <= maxIndex) {
        registry.nextIndex = maxIndex + 1;
        changed = true;
    }
    for (const key of keys) {
        if (key in registry.mapping && registry.mapping[key] !== undefined) {
            const index = registry.mapping[key];
            const base62Key = encode(index);
            mapping[key] = base62Key;
            reversedMapping[base62Key] = key;
        }
        else {
            const index = registry.nextIndex++;
            registry.mapping[key] = index;
            const base62Key = encode(index);
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
function generatePluginMappingFromRegistry(attributes, existingRegistries) {
    const now = new Date().toISOString();
    const registries = {};
    const mapping = {};
    const reversedMapping = {};
    let changed = false;
    const byPlugin = new Map();
    for (const { key, pluginName } of attributes) {
        if (!byPlugin.has(pluginName))
            byPlugin.set(pluginName, []);
        byPlugin.get(pluginName).push(key);
    }
    const globalUsedKeys = new Set();
    for (const [pluginName, keys] of byPlugin) {
        const existing = existingRegistries?.[pluginName];
        const registry = { mapping: {}, burned: [] };
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
            }
            else {
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
            }
            else {
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
function isLegacyNumericRegistry(registry) {
    if ('nextIndex' in registry)
        return true;
    const values = Object.values(registry.mapping);
    if (values.length === 0)
        return false;
    return typeof values[0] === 'number';
}
const SchemaActions = {
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
    toNumber: (value) => lodashEs.isString(value) ? value.includes('.') ? parseFloat(value) : parseInt(value) : value,
    toBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value),
    fromBool: (value) => [true, 1, 'true', '1', 'yes', 'y'].includes(value) ? '1' : '0',
    fromBase62: (value) => {
        if (value === null || value === undefined || value === '')
            return value;
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            const n = decode(value);
            return isNaN(n) ? undefined : n;
        }
        return undefined;
    },
    toBase62: (value) => {
        if (value === null || value === undefined || value === '')
            return value;
        if (typeof value === 'number') {
            return encode(value);
        }
        if (typeof value === 'string') {
            const n = Number(value);
            return isNaN(n) ? value : encode(n);
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
                return encode(item);
            }
            const n = Number(item);
            return isNaN(n) ? '' : encode(n);
        });
        return base62Items.join(separator);
    },
    toArrayOfNumbers: (value, { separator }) => {
        if (Array.isArray(value)) {
            return value.map(v => (typeof v === 'number' ? v : decode(v)));
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
                const n = decode(v);
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
        const [ok, , encoded] = tryFnSync(() => '$' + encode(integerValue));
        return ok ? encoded : value;
    },
    decodeMoney: (value, { decimals = 2 } = {}) => {
        if (value === null || value === undefined)
            return value;
        if (typeof value !== 'string')
            return value;
        if (!value.startsWith('$'))
            return value;
        const [ok, , integerValue] = tryFnSync(() => decode(value.slice(1)));
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
class Schema {
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
    /** Updated schema registry - should be persisted to s3db.json */
    _schemaRegistry;
    /** Updated plugin schema registries - should be persisted to s3db.json */
    _pluginSchemaRegistry;
    /** Whether the registry was modified and needs persistence */
    _registryChanged = false;
    constructor(args) {
        const { map, pluginMap, name, attributes, passphrase, bcryptRounds, version = 1, options = {}, _pluginAttributeMetadata, _pluginAttributes, schemaRegistry, pluginSchemaRegistry } = args;
        this.name = name;
        this.version = version;
        this.attributes = attributes || {};
        this.passphrase = passphrase ?? "secret";
        this.bcryptRounds = bcryptRounds ?? 10;
        this.options = lodashEs.merge({}, this.defaultOptions(), options);
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
            }).compile(lodashEs.merge({ $$async: true, $$strict: false }, processedAttributes));
            cacheValidator(this._schemaFingerprint, this.validator);
        }
        if (this.options.generateAutoHooks)
            this.generateAutoHooks();
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
        if (!lodashEs.isEmpty(map)) {
            this.map = { ...map };
            this.reversedMap = lodashEs.invert(this.map);
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
                if (result.changed)
                    this._registryChanged = true;
            }
        }
        else {
            if (schemaRegistry) {
                const result = generateMappingFromRegistry(userKeys, schemaRegistry);
                this.map = result.mapping;
                this.reversedMap = result.reversedMapping;
                this._schemaRegistry = result.registry;
                if (result.changed)
                    this._registryChanged = true;
            }
            else {
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
            if (result.changed)
                this._registryChanged = true;
        }
        else {
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
        if (!lodashEs.isEmpty(pluginMap)) {
            this.pluginMap = pluginMap;
            this.reversedPluginMap = lodashEs.invert(pluginMap);
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
    _buildRegistryFromMap(legacyMap, existingRegistry) {
        const registry = {
            nextIndex: existingRegistry?.nextIndex ?? 0,
            mapping: { ...existingRegistry?.mapping },
            burned: existingRegistry?.burned ? [...existingRegistry.burned] : []
        };
        let maxIndex = registry.nextIndex - 1;
        for (const [attr, base62Key] of Object.entries(legacyMap)) {
            const index = decode(base62Key);
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
    generateInitialRegistry() {
        const schemaRegistry = {
            nextIndex: 0,
            mapping: {},
            burned: []
        };
        let maxIndex = -1;
        for (const [attr, base62Key] of Object.entries(this.map)) {
            const index = decode(base62Key);
            schemaRegistry.mapping[attr] = index;
            if (Number.isFinite(index)) {
                maxIndex = Math.max(maxIndex, index);
            }
        }
        schemaRegistry.nextIndex = maxIndex + 1;
        const pluginSchemaRegistry = {};
        for (const [pluginName, attrs] of Object.entries(this._pluginAttributes)) {
            const registry = {
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
    needsRegistryPersistence() {
        return this._registryChanged;
    }
    /**
     * Get the updated schema registry for persistence.
     */
    getSchemaRegistry() {
        return this._schemaRegistry;
    }
    /**
     * Get the updated plugin schema registries for persistence.
     */
    getPluginSchemaRegistry() {
        return this._pluginSchemaRegistry;
    }
    addHook(hook, attribute, action, params = {}) {
        if (!this.options.hooks[hook][attribute])
            this.options.hooks[hook][attribute] = [];
        const hookEntry = Object.keys(params).length > 0 ? { action, params } : action;
        this.options.hooks[hook][attribute] = lodashEs.uniq([...this.options.hooks[hook][attribute], hookEntry]);
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
        const schema = flatten(lodashEs.cloneDeep(this.attributes), { safe: true });
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
        let { map, pluginMap, _pluginAttributeMetadata, name, options, version, attributes } = lodashEs.isString(data) ? JSON.parse(data) : data;
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
        const cloned = lodashEs.cloneDeep(resourceItem);
        for (const [attribute, actions] of Object.entries(this.options.hooks[hook])) {
            for (const actionEntry of actions) {
                const actionName = typeof actionEntry === 'string' ? actionEntry : actionEntry.action;
                const actionParams = typeof actionEntry === 'object' ? actionEntry.params : {};
                const value = lodashEs.get(cloned, attribute);
                const actionFn = SchemaActions[actionName];
                if (value !== undefined && typeof actionFn === 'function') {
                    lodashEs.set(cloned, attribute, await actionFn(value, {
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
        const data = mutateOriginal ? resourceItem : lodashEs.cloneDeep(resourceItem);
        const result = await this.validator(data);
        return result;
    }
    async mapper(resourceItem) {
        let obj = lodashEs.cloneDeep(resourceItem);
        obj = await this.applyHooksActions(obj, "beforeMap");
        const flattenedObj = flatten(obj, { safe: true });
        const rest = { '_v': this.version + '' };
        for (const [key, value] of Object.entries(flattenedObj)) {
            const mappedKey = this.pluginMap[key] || this.map[key] || key;
            const attrDef = this.getAttributeDefinition(key);
            if (typeof value === 'number' && typeof attrDef === 'string' && attrDef.includes('number')) {
                rest[mappedKey] = encode(value);
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
        let obj = lodashEs.cloneDeep(mappedResourceItem);
        delete obj._v;
        obj = await this.applyHooksActions(obj, "beforeUnmap");
        const reversedMap = mapOverride ? lodashEs.invert(mapOverride) : this.reversedMap;
        const reversedPluginMap = pluginMapOverride ? lodashEs.invert(pluginMapOverride) : this.reversedPluginMap;
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
                    parsedValue = decode(parsedValue);
                }
                else if (typeof parsedValue === 'number') ;
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
                        if (Array.isArray(parsedValue)) ;
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
                        else if (part === 'required') ;
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
                    if (isExplicitRequired) ;
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

class ResourceValidator {
    attributes;
    strictValidation;
    allNestedObjectsOptional;
    passphrase;
    bcryptRounds;
    autoEncrypt;
    autoDecrypt;
    validatorManager;
    validateFn;
    constructor(config = {}) {
        this.attributes = config.attributes || {};
        this.strictValidation = config.strictValidation !== false;
        this.allNestedObjectsOptional = config.allNestedObjectsOptional || false;
        this.passphrase = config.passphrase;
        this.bcryptRounds = config.bcryptRounds;
        this.autoEncrypt = config.autoEncrypt !== false;
        this.autoDecrypt = config.autoDecrypt !== false;
        this.validatorManager = new ValidatorManager({
            autoEncrypt: this.autoEncrypt,
            passphrase: this.passphrase,
            bcryptRounds: this.bcryptRounds
        });
        this.compileValidator();
    }
    compileValidator() {
        const processedAttributes = this.preprocessAttributesForValidation(this.attributes);
        this.validateFn = this.validatorManager.compile(lodashEs.merge({ $$async: true, $$strict: false }, processedAttributes));
    }
    updateSchema(newAttributes) {
        this.attributes = newAttributes;
        this.compileValidator();
    }
    async validate(data, options = {}) {
        const { throwOnError = false, includeId = false, mutateOriginal = false } = options;
        const dataToValidate = mutateOriginal ? data : lodashEs.cloneDeep(data);
        if (!includeId && dataToValidate.id) {
            delete dataToValidate.id;
        }
        const result = {
            isValid: false,
            errors: [],
            data: dataToValidate
        };
        try {
            const check = await this.validateFn(dataToValidate);
            if (check === true) {
                result.isValid = true;
            }
            else {
                result.errors = Array.isArray(check) ? check : [check];
                result.isValid = false;
                if (throwOnError) {
                    const error = new Error('Validation failed');
                    error.validationErrors = result.errors;
                    error.invalidData = data;
                    throw error;
                }
            }
        }
        catch (err) {
            if (!throwOnError) {
                result.errors = [{ message: err.message, error: err }];
                result.isValid = false;
            }
            else {
                throw err;
            }
        }
        return result;
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
                        else if (part === 'required') ;
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
                const validatorTypes = [
                    'string', 'number', 'boolean', 'any', 'object', 'array', 'date', 'email', 'url', 'uuid',
                    'enum', 'custom', 'ip4', 'ip6', 'buffer', 'bits', 'money', 'crypto', 'decimal',
                    'geo:lat', 'geo:lon', 'geo:point', 'geo-lat', 'geo-lon', 'geo-point', 'secret', 'password', 'embedding'
                ];
                const objValue = value;
                const typeValue = objValue.type;
                const isValidValidatorType = typeof typeValue === 'string' &&
                    !typeValue.includes('|') &&
                    (validatorTypes.includes(typeValue) || typeValue.startsWith('bits:') || typeValue.startsWith('embedding:'));
                const hasValidatorType = isValidValidatorType && key !== '$$type';
                if (hasValidatorType) {
                    const { __plugin__, __pluginCreated__, ...cleanValue } = objValue;
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
                    const nestedObj = value;
                    const isExplicitRequired = nestedObj.$$type && nestedObj.$$type.includes('required');
                    const isExplicitOptional = nestedObj.$$type && nestedObj.$$type.includes('optional');
                    const objectConfig = {
                        type: 'object',
                        props: this.preprocessAttributesForValidation(nestedObj),
                        strict: false
                    };
                    if (isExplicitRequired) ;
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
    applyDefaults(data) {
        const out = { ...data };
        for (const [key, def] of Object.entries(this.attributes)) {
            if (out[key] === undefined) {
                if (typeof def === 'string' && def.includes('default:')) {
                    const match = def.match(/default:([^|]+)/);
                    if (match) {
                        let val = match[1];
                        if (def.includes('boolean'))
                            val = val === 'true';
                        else if (def.includes('number'))
                            val = Number(val);
                        out[key] = val;
                    }
                }
            }
        }
        return out;
    }
}

const INCREMENTAL_DEFAULTS = {
    type: 'incremental',
    start: 1,
    increment: 1,
    mode: 'standard',
    batchSize: 100,
    prefix: '',
    padding: 0
};
const VALIDATION_LIMITS = {
    maxPrefix: 20,
    maxPadding: 20,
    minBatchSize: 1,
    maxBatchSize: 100000,
    maxStartValue: Number.MAX_SAFE_INTEGER,
    minStartValue: Number.MIN_SAFE_INTEGER
};
class IncrementalConfigError extends Error {
    field;
    value;
    constructor(message, field, value) {
        super(message);
        this.name = 'IncrementalConfigError';
        this.field = field;
        this.value = value;
    }
}
function validateIncrementalConfig(config, options = {}) {
    const { throwOnError = true } = options;
    const errors = [];
    if (config.start !== undefined) {
        if (typeof config.start !== 'number' || !Number.isFinite(config.start)) {
            errors.push({
                field: 'start',
                message: 'start must be a finite number',
                value: config.start
            });
        }
        else if (!Number.isInteger(config.start)) {
            errors.push({
                field: 'start',
                message: 'start must be an integer',
                value: config.start
            });
        }
        else if (config.start > VALIDATION_LIMITS.maxStartValue || config.start < VALIDATION_LIMITS.minStartValue) {
            errors.push({
                field: 'start',
                message: `start must be between ${VALIDATION_LIMITS.minStartValue} and ${VALIDATION_LIMITS.maxStartValue}`,
                value: config.start
            });
        }
    }
    if (config.increment !== undefined) {
        if (typeof config.increment !== 'number' || !Number.isFinite(config.increment)) {
            errors.push({
                field: 'increment',
                message: 'increment must be a finite number',
                value: config.increment
            });
        }
        else if (!Number.isInteger(config.increment)) {
            errors.push({
                field: 'increment',
                message: 'increment must be an integer',
                value: config.increment
            });
        }
        else if (config.increment === 0) {
            errors.push({
                field: 'increment',
                message: 'increment cannot be zero',
                value: config.increment
            });
        }
    }
    if (config.mode !== undefined) {
        const validModes = ['standard', 'fast'];
        if (!validModes.includes(config.mode)) {
            errors.push({
                field: 'mode',
                message: `mode must be one of: ${validModes.join(', ')}`,
                value: config.mode
            });
        }
    }
    if (config.batchSize !== undefined) {
        if (typeof config.batchSize !== 'number' || !Number.isFinite(config.batchSize)) {
            errors.push({
                field: 'batchSize',
                message: 'batchSize must be a finite number',
                value: config.batchSize
            });
        }
        else if (!Number.isInteger(config.batchSize)) {
            errors.push({
                field: 'batchSize',
                message: 'batchSize must be an integer',
                value: config.batchSize
            });
        }
        else if (config.batchSize < VALIDATION_LIMITS.minBatchSize || config.batchSize > VALIDATION_LIMITS.maxBatchSize) {
            errors.push({
                field: 'batchSize',
                message: `batchSize must be between ${VALIDATION_LIMITS.minBatchSize} and ${VALIDATION_LIMITS.maxBatchSize}`,
                value: config.batchSize
            });
        }
    }
    if (config.prefix !== undefined) {
        if (typeof config.prefix !== 'string') {
            errors.push({
                field: 'prefix',
                message: 'prefix must be a string',
                value: config.prefix
            });
        }
        else if (config.prefix.length > VALIDATION_LIMITS.maxPrefix) {
            errors.push({
                field: 'prefix',
                message: `prefix must be at most ${VALIDATION_LIMITS.maxPrefix} characters`,
                value: config.prefix
            });
        }
        else if (config.prefix && !/^[A-Za-z0-9_-]+$/.test(config.prefix)) {
            errors.push({
                field: 'prefix',
                message: 'prefix must contain only alphanumeric characters, hyphens, and underscores',
                value: config.prefix
            });
        }
    }
    if (config.padding !== undefined) {
        if (typeof config.padding !== 'number' || !Number.isFinite(config.padding)) {
            errors.push({
                field: 'padding',
                message: 'padding must be a finite number',
                value: config.padding
            });
        }
        else if (!Number.isInteger(config.padding)) {
            errors.push({
                field: 'padding',
                message: 'padding must be an integer',
                value: config.padding
            });
        }
        else if (config.padding < 0 || config.padding > VALIDATION_LIMITS.maxPadding) {
            errors.push({
                field: 'padding',
                message: `padding must be between 0 and ${VALIDATION_LIMITS.maxPadding}`,
                value: config.padding
            });
        }
    }
    const result = {
        valid: errors.length === 0,
        errors
    };
    if (throwOnError && !result.valid && errors.length > 0) {
        const firstError = errors[0];
        throw new IncrementalConfigError(`Invalid incremental config: ${firstError.message}`, firstError.field, firstError.value);
    }
    return result;
}
function parseIncrementalSuffix(suffix, defaults) {
    const result = { ...defaults };
    if (suffix === 'fast') {
        result.mode = 'fast';
        return result;
    }
    if (suffix.startsWith('fast:')) {
        result.mode = 'fast';
        suffix = suffix.slice('fast:'.length);
    }
    const numValue = parseInt(suffix, 10);
    if (!isNaN(numValue) && String(numValue) === suffix) {
        result.start = numValue;
        return result;
    }
    const prefixMatch = suffix.match(/^([A-Za-z]+-?)(\d+)$/);
    if (prefixMatch && prefixMatch[1] && prefixMatch[2]) {
        const prefix = prefixMatch[1];
        const numPart = prefixMatch[2];
        result.prefix = prefix;
        result.start = parseInt(numPart, 10);
        result.padding = numPart.length;
        return result;
    }
    return result;
}
function parseIncrementalConfig(config, options = {}) {
    const { validate = false } = options;
    let parsed;
    if (typeof config === 'object' && config !== null) {
        parsed = {
            ...INCREMENTAL_DEFAULTS,
            ...config,
            type: 'incremental'
        };
    }
    else if (typeof config === 'string') {
        if (config === 'incremental') {
            parsed = { ...INCREMENTAL_DEFAULTS };
        }
        else if (config.startsWith('incremental:')) {
            const rest = config.slice('incremental:'.length);
            parsed = parseIncrementalSuffix(rest, INCREMENTAL_DEFAULTS);
        }
        else {
            parsed = { ...INCREMENTAL_DEFAULTS };
        }
    }
    else {
        parsed = { ...INCREMENTAL_DEFAULTS };
    }
    if (validate) {
        validateIncrementalConfig(parsed);
    }
    return parsed;
}
function formatIncrementalValue(value, options = {}) {
    const { prefix = '', padding = 0 } = options;
    const numStr = padding > 0
        ? String(value).padStart(padding, '0')
        : String(value);
    return prefix ? `${prefix}${numStr}` : numStr;
}
class SequenceStorage {
    client;
    resourceName;
    _lock;
    constructor(client, resourceName) {
        this.client = client;
        this.resourceName = resourceName;
        this._lock = new DistributedLock(this, {
            keyGenerator: (fieldName) => this.getLockKey(fieldName)
        });
    }
    getKey(fieldName, suffix) {
        return `resource=${this.resourceName}/sequence=${fieldName}/${suffix}`;
    }
    getLockKey(fieldName) {
        return this.getKey(fieldName, 'lock');
    }
    getValueKey(fieldName) {
        return this.getKey(fieldName, 'value');
    }
    async get(key) {
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));
        if (!ok || !response) {
            const error = err;
            if (error?.name === 'NoSuchKey' || error?.code === 'NoSuchKey' ||
                error?.Code === 'NoSuchKey' || error?.statusCode === 404) {
                return null;
            }
            throw err;
        }
        if (response.Body) {
            const bodyContent = await response.Body.transformToString();
            if (bodyContent && bodyContent.trim()) {
                return JSON.parse(bodyContent);
            }
        }
        return null;
    }
    async set(key, data, options = {}) {
        const { ttl, ifNoneMatch } = options;
        const dataToSave = { ...data };
        if (ttl && typeof ttl === 'number' && ttl > 0) {
            dataToSave._expiresAt = Date.now() + (ttl * 1000);
        }
        const putParams = {
            key,
            body: JSON.stringify(dataToSave),
            contentType: 'application/json'
        };
        if (ifNoneMatch !== undefined) {
            putParams.ifNoneMatch = ifNoneMatch;
        }
        const [ok, err, response] = await tryFn(() => this.client.putObject(putParams));
        if (!ok || !response)
            throw err ?? new Error('Put object returned no response');
        return response;
    }
    async delete(key) {
        await tryFn(() => this.client.deleteObject(key));
    }
    async acquireLock(fieldName, options = {}) {
        return this._lock.acquire(fieldName, options);
    }
    async releaseLock(lock) {
        if (!lock)
            return;
        return this._lock.release(lock);
    }
    async withLock(fieldName, options, callback) {
        return this._lock.withLock(fieldName, options, callback);
    }
    async nextSequence(fieldName, options = {}) {
        const { initialValue = 1, increment = 1, lockTimeout = 5000, lockTTL = 10 } = options;
        const valueKey = this.getValueKey(fieldName);
        const result = await this.withLock(fieldName, { timeout: lockTimeout, ttl: lockTTL }, async () => {
            const data = await this.get(valueKey);
            if (!data) {
                await this.set(valueKey, {
                    value: initialValue + increment,
                    name: fieldName,
                    createdAt: Date.now()
                });
                return initialValue;
            }
            const currentValue = data.value;
            await this.set(valueKey, {
                ...data,
                value: currentValue + increment,
                updatedAt: Date.now()
            });
            return currentValue;
        });
        if (result === null) {
            throw new Error(`Failed to acquire lock for sequence "${fieldName}"`);
        }
        return result;
    }
    async getSequence(fieldName) {
        const valueKey = this.getValueKey(fieldName);
        const data = await this.get(valueKey);
        return data?.value ?? null;
    }
    async resetSequence(fieldName, value, options = {}) {
        const { lockTimeout = 5000, lockTTL = 10 } = options;
        const valueKey = this.getValueKey(fieldName);
        const result = await this.withLock(fieldName, { timeout: lockTimeout, ttl: lockTTL }, async () => {
            const data = await this.get(valueKey);
            await this.set(valueKey, {
                value,
                name: fieldName,
                createdAt: data?.createdAt || Date.now(),
                updatedAt: Date.now(),
                resetAt: Date.now()
            });
            return true;
        });
        if (result === null) {
            throw new Error(`Failed to acquire lock for sequence "${fieldName}"`);
        }
        return result;
    }
    async listSequences() {
        const prefix = `resource=${this.resourceName}/sequence=`;
        const [ok, err, result] = await tryFn(() => this.client.listObjects({ prefix }));
        if (!ok || !result)
            return [];
        const keys = (result.Contents ?? []).map(item => item.Key);
        const valueKeys = keys.filter((k) => typeof k === 'string' && k.endsWith('/value'));
        const sequences = [];
        for (const key of valueKeys) {
            const data = await this.get(key);
            if (data) {
                sequences.push(data);
            }
        }
        return sequences;
    }
}
class IncrementalSequence {
    client;
    resourceName;
    config;
    logger;
    storage;
    localBatches;
    constructor(options) {
        this.client = options.client;
        this.resourceName = options.resourceName;
        this.config = options.config;
        this.logger = options.logger || console;
        this.storage = new SequenceStorage(options.client, options.resourceName);
        this.localBatches = new Map();
    }
    async nextValue(fieldName = 'id') {
        const { start, increment, prefix, padding } = this.config;
        const value = await this.storage.nextSequence(fieldName, {
            initialValue: start,
            increment
        });
        return formatIncrementalValue(value, { prefix, padding });
    }
    async nextValueFast(fieldName = 'id') {
        const batchKey = fieldName;
        let batch = this.localBatches.get(batchKey);
        if (!batch || batch.current >= batch.end) {
            batch = await this.reserveBatch(fieldName);
            this.localBatches.set(batchKey, batch);
        }
        const value = batch.current++;
        const { prefix, padding } = this.config;
        return formatIncrementalValue(value, { prefix, padding });
    }
    async reserveBatch(fieldName = 'id', count) {
        const batchSize = count || this.config.batchSize;
        const { start: initialValue } = this.config;
        const batchStart = await this.storage.nextSequence(fieldName, {
            initialValue,
            increment: batchSize
        });
        const batch = {
            start: batchStart,
            end: batchStart + batchSize,
            current: batchStart,
            reservedAt: Date.now()
        };
        return batch;
    }
    async next(fieldName = 'id') {
        if (this.config.mode === 'fast') {
            return this.nextValueFast(fieldName);
        }
        return this.nextValue(fieldName);
    }
    async getValue(fieldName = 'id') {
        return this.storage.getSequence(fieldName);
    }
    async reset(fieldName, value) {
        this.localBatches.delete(fieldName);
        return this.storage.resetSequence(fieldName, value);
    }
    async list() {
        return this.storage.listSequences();
    }
    getBatchStatus(fieldName = 'id') {
        const batch = this.localBatches.get(fieldName);
        if (!batch)
            return null;
        return {
            start: batch.start,
            end: batch.end,
            current: batch.current,
            remaining: batch.end - batch.current,
            reservedAt: batch.reservedAt
        };
    }
    releaseBatch(fieldName = 'id') {
        const batch = this.localBatches.get(fieldName);
        if (batch) {
            const unused = batch.end - batch.current;
            this.logger.debug?.({ fieldName, unused }, 'Releasing batch with unused IDs');
            this.localBatches.delete(fieldName);
        }
    }
}
function createIncrementalIdGenerator(options) {
    const parsedConfig = parseIncrementalConfig(options.config);
    const sequence = new IncrementalSequence({
        client: options.client,
        resourceName: options.resourceName,
        config: parsedConfig,
        logger: options.logger
    });
    const generator = async () => {
        return sequence.next('id');
    };
    generator._sequence = sequence;
    generator._config = parsedConfig;
    return generator;
}

class ResourceIdGenerator {
    resource;
    idSize;
    _incrementalConfig;
    _asyncIdGenerator;
    _generator;
    constructor(resource, config = {}) {
        this.resource = resource;
        const customIdGenerator = config.idGenerator;
        if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
            this.idSize = customIdGenerator;
        }
        else if (typeof config.idSize === 'number' && config.idSize > 0) {
            this.idSize = config.idSize;
        }
        else {
            this.idSize = 22;
        }
        this._incrementalConfig = null;
        this._asyncIdGenerator = false;
        this._generator = null;
        this._generator = this._configureGenerator(customIdGenerator, this.idSize);
    }
    _configureGenerator(customIdGenerator, idSize) {
        if (typeof customIdGenerator === 'function') {
            return (() => String(customIdGenerator()));
        }
        const isIncrementalString = typeof customIdGenerator === 'string' &&
            (customIdGenerator === 'incremental' || customIdGenerator.startsWith('incremental:'));
        const isIncrementalObject = typeof customIdGenerator === 'object' &&
            customIdGenerator !== null &&
            customIdGenerator.type === 'incremental';
        if (isIncrementalString || isIncrementalObject) {
            this._incrementalConfig = customIdGenerator;
            return null;
        }
        if (typeof customIdGenerator === 'number' && customIdGenerator > 0) {
            return createCustomGenerator(getUrlAlphabet(), customIdGenerator);
        }
        if (typeof idSize === 'number' && idSize > 0 && idSize !== 22) {
            return createCustomGenerator(getUrlAlphabet(), idSize);
        }
        return idGenerator;
    }
    initIncremental() {
        if (!this._incrementalConfig || this._generator !== null) {
            return;
        }
        const incrementalGen = createIncrementalIdGenerator({
            client: this.resource.client,
            resourceName: this.resource.name,
            config: this._incrementalConfig,
            logger: this.resource.logger
        });
        this._generator = incrementalGen;
        this._asyncIdGenerator = true;
    }
    isAsync() {
        return this._asyncIdGenerator === true;
    }
    getGenerator() {
        return this._generator;
    }
    generate() {
        if (!this._generator) {
            throw new Error('ID generator not initialized. Call initIncremental() first for incremental generators.');
        }
        return this._generator();
    }
    getType(customIdGenerator, idSize) {
        if (typeof customIdGenerator === 'function') {
            return 'custom';
        }
        if (this._incrementalConfig) {
            return 'incremental';
        }
        return 'nanoid';
    }
    async getSequenceValue(fieldName = 'id') {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.getValue(fieldName);
    }
    async resetSequence(fieldName, value) {
        if (!this._generator?._sequence) {
            this.resource.logger?.warn('resetSequence called on non-incremental resource');
            return false;
        }
        return this._generator._sequence.reset(fieldName, value);
    }
    async listSequences() {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.list();
    }
    async reserveIdBatch(count = 100) {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.reserveBatch('id', count);
    }
    getBatchStatus(fieldName = 'id') {
        if (!this._generator?._sequence) {
            return null;
        }
        return this._generator._sequence.getBatchStatus(fieldName);
    }
    releaseBatch(fieldName = 'id') {
        if (this._generator?._sequence) {
            this._generator._sequence.releaseBatch(fieldName);
        }
    }
}

class ResourceEvents {
    resource;
    disabled;
    _emitterProto;
    _pendingListeners;
    _wired;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._emitterProto = AsyncEventEmitter.prototype;
        this.disabled = config.disableEvents === true || config.disableResourceEvents === true;
        const events = config.events || {};
        this._pendingListeners = (!this.disabled && events && Object.keys(events).length > 0)
            ? events
            : null;
        this._wired = this.disabled || !this._pendingListeners;
    }
    isDisabled() {
        return this.disabled;
    }
    isWired() {
        return this._wired;
    }
    ensureWired() {
        if (this.disabled || this._wired) {
            return;
        }
        if (!this._pendingListeners) {
            this._wired = true;
            return;
        }
        for (const [eventName, listeners] of Object.entries(this._pendingListeners)) {
            if (Array.isArray(listeners)) {
                for (const listener of listeners) {
                    if (typeof listener === 'function') {
                        this._emitterProto.on.call(this.resource, eventName, listener.bind(this.resource));
                    }
                }
            }
            else if (typeof listeners === 'function') {
                this._emitterProto.on.call(this.resource, eventName, listeners.bind(this.resource));
            }
        }
        this._pendingListeners = null;
        this._wired = true;
    }
    emitStandardized(event, payload, id = null) {
        if (this.disabled) {
            return;
        }
        this.ensureWired();
        this._emitterProto.emit.call(this.resource, event, payload);
        if (id) {
            this._emitterProto.emit.call(this.resource, `${event}:${id}`, payload);
        }
    }
    on(eventName, listener) {
        if (this.disabled) {
            return this.resource;
        }
        this.ensureWired();
        this._emitterProto.on.call(this.resource, eventName, listener);
        return this.resource;
    }
    once(eventName, listener) {
        if (this.disabled) {
            return this.resource;
        }
        this.ensureWired();
        this._emitterProto.once.call(this.resource, eventName, listener);
        return this.resource;
    }
    emit(eventName, ...args) {
        if (this.disabled) {
            return false;
        }
        this.ensureWired();
        return this._emitterProto.emit.call(this.resource, eventName, ...args);
    }
}

class ResourceHooks {
    static HOOK_EVENTS = [
        'beforeInsert', 'afterInsert',
        'beforeUpdate', 'afterUpdate',
        'beforeDelete', 'afterDelete',
        'beforeGet', 'afterGet',
        'beforeList', 'afterList',
        'beforeQuery', 'afterQuery',
        'beforePatch', 'afterPatch',
        'beforeReplace', 'afterReplace',
        'beforeExists', 'afterExists',
        'beforeCount', 'afterCount',
        'beforeGetMany', 'afterGetMany',
        'beforeDeleteMany', 'afterDeleteMany'
    ];
    resource;
    _hooks;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._hooks = {};
        for (const event of ResourceHooks.HOOK_EVENTS) {
            this._hooks[event] = [];
        }
        const configHooks = config.hooks || {};
        for (const [event, hooksArr] of Object.entries(configHooks)) {
            if (Array.isArray(hooksArr) && this._hooks[event]) {
                for (const fn of hooksArr) {
                    const bound = this._bindHook(fn);
                    if (bound) {
                        this._hooks[event].push(bound);
                    }
                }
            }
        }
    }
    getHooks() {
        return this._hooks;
    }
    getHooksForEvent(event) {
        return this._hooks[event] || [];
    }
    addHook(event, fn) {
        if (!this._hooks[event]) {
            return false;
        }
        const bound = this._bindHook(fn);
        if (bound) {
            this._hooks[event].push(bound);
            return true;
        }
        return false;
    }
    async executeHooks(event, data) {
        const hooks = this._hooks[event];
        if (!hooks || hooks.length === 0) {
            return data;
        }
        let result = data;
        for (const hook of hooks) {
            result = await hook(result);
        }
        return result;
    }
    _bindHook(fn) {
        if (typeof fn !== 'function') {
            return null;
        }
        const hookFn = fn;
        const original = hookFn.__s3db_original || hookFn;
        const bound = original.bind(this.resource);
        try {
            Object.defineProperty(bound, '__s3db_original', {
                value: original,
                enumerable: false,
                configurable: true,
            });
        }
        catch (_) {
            bound.__s3db_original = original;
        }
        return bound;
    }
    hasHooks(event) {
        const hooks = this._hooks[event];
        return hooks !== undefined && hooks.length > 0;
    }
    getHookCount(event) {
        const hooks = this._hooks[event];
        return hooks ? hooks.length : 0;
    }
    clearHooks(event) {
        if (this._hooks[event]) {
            this._hooks[event] = [];
        }
    }
    clearAllHooks() {
        for (const event of ResourceHooks.HOOK_EVENTS) {
            this._hooks[event] = [];
        }
    }
}

class ResourceGuards {
    resource;
    _guard;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._guard = this._normalize(config.guard);
    }
    getGuard() {
        return this._guard;
    }
    _normalize(guard) {
        if (!guard)
            return null;
        if (Array.isArray(guard)) {
            return { '*': guard };
        }
        return guard;
    }
    async execute(operation, context, record = null) {
        if (!this._guard)
            return true;
        let guardFn = this._guard[operation];
        if (!guardFn) {
            guardFn = this._guard['*'];
        }
        if (!guardFn)
            return true;
        if (typeof guardFn === 'boolean') {
            return guardFn;
        }
        if (Array.isArray(guardFn)) {
            return this._checkRolesScopes(guardFn, context.user);
        }
        if (typeof guardFn === 'function') {
            try {
                const result = await guardFn(context, record);
                return result === true;
            }
            catch (err) {
                this.resource.logger?.error({ operation, error: err.message, stack: err.stack }, `guard error for ${operation}`);
                return false;
            }
        }
        return false;
    }
    _checkRolesScopes(requiredRolesScopes, user) {
        if (!user)
            return false;
        const userScopes = user.scope?.split(' ') || [];
        const clientId = user.azp || process.env.CLIENT_ID || 'default';
        const clientRoles = user.resource_access?.[clientId]?.roles || [];
        const realmRoles = user.realm_access?.roles || [];
        const azureRoles = user.roles || [];
        const userRoles = [...clientRoles, ...realmRoles, ...azureRoles];
        return requiredRolesScopes.some(required => {
            return userScopes.includes(required) || userRoles.includes(required);
        });
    }
    hasGuard(operation) {
        if (!this._guard)
            return false;
        return this._guard[operation] !== undefined || this._guard['*'] !== undefined;
    }
    setGuard(guard) {
        this._guard = this._normalize(guard);
    }
}

class ResourceMiddleware {
    static SUPPORTED_METHODS = [
        'get', 'list', 'listIds', 'getAll', 'count', 'page',
        'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
        'content', 'hasContent', 'query', 'getFromPartition', 'setContent', 'deleteContent', 'replace'
    ];
    resource;
    _middlewares;
    _originalMethods;
    _initialized;
    constructor(resource) {
        this.resource = resource;
        this._middlewares = new Map();
        this._originalMethods = new Map();
        this._initialized = false;
    }
    init() {
        if (this._initialized)
            return;
        for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
            this._middlewares.set(method, []);
            if (!this._originalMethods.has(method) && typeof this.resource[method] === 'function') {
                const originalMethod = this.resource[method];
                this._originalMethods.set(method, originalMethod.bind(this.resource));
                this.resource[method] = this._createDispatcher(method);
            }
        }
        this._initialized = true;
    }
    _createDispatcher(method) {
        const self = this;
        return async function (...args) {
            const ctx = { resource: self.resource, args, method };
            let idx = -1;
            const stack = self._middlewares.get(method);
            const dispatch = async (i) => {
                if (i <= idx) {
                    throw new ResourceError('Resource middleware next() called multiple times', {
                        resourceName: self.resource.name,
                        operation: method,
                        statusCode: 500,
                        retriable: false,
                        suggestion: 'Ensure each middleware awaits next() at most once.'
                    });
                }
                idx = i;
                if (i < stack.length) {
                    return await stack[i](ctx, () => dispatch(i + 1));
                }
                else {
                    return await self._originalMethods.get(method)(...ctx.args);
                }
            };
            return await dispatch(0);
        };
    }
    use(method, fn) {
        if (!this._initialized) {
            this.init();
        }
        if (!this._middlewares.has(method)) {
            throw new ResourceError(`No such method for middleware: ${method}`, {
                operation: 'useMiddleware',
                method,
                supportedMethods: ResourceMiddleware.SUPPORTED_METHODS
            });
        }
        this._middlewares.get(method).push(fn);
    }
    getMiddlewares(method) {
        return this._middlewares.get(method) || [];
    }
    isInitialized() {
        return this._initialized;
    }
    getMiddlewareCount(method) {
        const stack = this._middlewares.get(method);
        return stack ? stack.length : 0;
    }
    clearMiddlewares(method) {
        if (this._middlewares.has(method)) {
            this._middlewares.set(method, []);
        }
    }
    clearAllMiddlewares() {
        for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
            if (this._middlewares.has(method)) {
                this._middlewares.set(method, []);
            }
        }
    }
}

/**
 * S3 Key Utilities
 *
 * S3 keys always use POSIX-style forward slashes regardless of the operating system.
 * These utilities ensure consistent key construction across all platforms.
 */
const UNSAFE_KEY_CHARS = /[\\\/=%]/;
/**
 * Validates that a value is safe for use in S3 keys.
 * IDs and partition values must be URL-friendly (no /, \, =, or %).
 * Returns true if valid, false if contains unsafe characters.
 */
function isValidS3KeySegment(value) {
    return !UNSAFE_KEY_CHARS.test(value);
}
/**
 * Validates a value for S3 key usage, throwing ValidationError if invalid.
 * Use this for IDs and partition values.
 * Accepts any value type - coerces to string for validation.
 */
function validateS3KeySegment(value, context) {
    const strValue = String(value);
    if (UNSAFE_KEY_CHARS.test(strValue)) {
        const invalidChars = strValue.match(UNSAFE_KEY_CHARS);
        throw new ValidationError(`Invalid ${context}: contains unsafe character '${invalidChars?.[0]}'`, {
            field: context,
            value: strValue,
            constraint: 'url-safe',
            statusCode: 400,
            suggestion: 'IDs and partition values must be URL-friendly (no /, \\, =, or %). Use alphanumeric characters, hyphens, or underscores.'
        });
    }
}

class ResourcePartitions {
    resource;
    _strictValidation;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._strictValidation = config.strictValidation !== false;
    }
    getPartitions() {
        return this.resource.config?.partitions || {};
    }
    hasPartitions() {
        const partitions = this.getPartitions();
        return partitions && Object.keys(partitions).length > 0;
    }
    setupHooks(hooksModule) {
        if (!this.hasPartitions()) {
            return;
        }
        const hooks = hooksModule.getHooks();
        if (!hooks.afterInsert) {
            hooks.afterInsert = [];
        }
        hooks.afterInsert.push(async (data) => {
            await this.createReferences(data);
            return data;
        });
        if (!hooks.afterDelete) {
            hooks.afterDelete = [];
        }
        hooks.afterDelete.push(async (data) => {
            await this.deleteReferences(data);
            return data;
        });
    }
    validate() {
        if (!this._strictValidation) {
            return;
        }
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        const currentAttributes = Object.keys(this.resource.attributes || {});
        for (const [partitionName, partitionDef] of Object.entries(partitions)) {
            if (!partitionDef.fields) {
                continue;
            }
            for (const fieldName of Object.keys(partitionDef.fields)) {
                if (!this.fieldExistsInAttributes(fieldName)) {
                    throw new PartitionError(`Partition '${partitionName}' uses field '${fieldName}' which does not exist in resource attributes. Available fields: ${currentAttributes.join(', ')}.`, {
                        resourceName: this.resource.name,
                        partitionName,
                        fieldName,
                        availableFields: currentAttributes,
                        operation: 'validatePartitions'
                    });
                }
            }
        }
    }
    fieldExistsInAttributes(fieldName) {
        if (fieldName.startsWith('_')) {
            return true;
        }
        if (!fieldName.includes('.')) {
            return Object.keys(this.resource.attributes || {}).includes(fieldName);
        }
        const keys = fieldName.split('.');
        let currentLevel = this.resource.attributes || {};
        for (const key of keys) {
            if (!currentLevel || typeof currentLevel !== 'object' || !(key in currentLevel)) {
                return false;
            }
            currentLevel = currentLevel[key];
        }
        return true;
    }
    findOrphaned() {
        const orphaned = {};
        const partitions = this.getPartitions();
        if (!partitions) {
            return orphaned;
        }
        for (const [partitionName, partitionDef] of Object.entries(partitions)) {
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
    removeOrphaned({ dryRun = false } = {}) {
        const orphaned = this.findOrphaned();
        if (Object.keys(orphaned).length === 0) {
            return {};
        }
        if (dryRun) {
            return orphaned;
        }
        for (const partitionName of Object.keys(orphaned)) {
            delete this.resource.config.partitions[partitionName];
        }
        this.resource.emit('orphanedPartitionsRemoved', {
            resourceName: this.resource.name,
            removed: orphaned,
            timestamp: new Date().toISOString()
        });
        return orphaned;
    }
    applyRule(value, rule) {
        if (value === undefined || value === null) {
            return value;
        }
        let transformedValue = value;
        if (typeof rule === 'string' && rule.includes('maxlength:')) {
            const maxLengthMatch = rule.match(/maxlength:(\d+)/);
            if (maxLengthMatch) {
                const maxLength = parseInt(maxLengthMatch[1], 10);
                if (typeof transformedValue === 'string' && transformedValue.length > maxLength) {
                    transformedValue = transformedValue.substring(0, maxLength);
                }
            }
        }
        if (rule.includes('date')) {
            if (transformedValue instanceof Date) {
                transformedValue = transformedValue.toISOString().split('T')[0];
            }
            else if (typeof transformedValue === 'string') {
                if (transformedValue.includes('T') && transformedValue.includes('Z')) {
                    transformedValue = transformedValue.split('T')[0];
                }
                else {
                    const date = new Date(transformedValue);
                    if (!isNaN(date.getTime())) {
                        transformedValue = date.toISOString().split('T')[0];
                    }
                }
            }
        }
        return transformedValue;
    }
    getNestedFieldValue(data, fieldPath) {
        if (!fieldPath.includes('.')) {
            return data[fieldPath];
        }
        const keys = fieldPath.split('.');
        let currentLevel = data;
        for (const key of keys) {
            if (!currentLevel || typeof currentLevel !== 'object' || !(key in currentLevel)) {
                return undefined;
            }
            currentLevel = currentLevel[key];
        }
        return currentLevel;
    }
    getKey({ partitionName, id, data }) {
        const partitions = this.getPartitions();
        if (!partitions || !partitions[partitionName]) {
            throw new PartitionError(`Partition '${partitionName}' not found`, {
                resourceName: this.resource.name,
                partitionName,
                operation: 'getPartitionKey'
            });
        }
        const partition = partitions[partitionName];
        const partitionSegments = [];
        const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
        for (const [fieldName, rule] of sortedFields) {
            const fieldValue = this.getNestedFieldValue(data, fieldName);
            const transformedValue = this.applyRule(fieldValue, rule);
            if (transformedValue === undefined || transformedValue === null) {
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
        return path.join(`resource=${this.resource.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${finalId}`);
    }
    buildPrefix(partition, partitionDef, partitionValues) {
        const partitionSegments = [];
        const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
        for (const [fieldName, rule] of sortedFields) {
            const value = partitionValues[fieldName];
            if (value !== undefined && value !== null) {
                const transformedValue = this.applyRule(value, rule);
                partitionSegments.push(`${fieldName}=${transformedValue}`);
            }
        }
        if (partitionSegments.length > 0) {
            return `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
        }
        return `resource=${this.resource.name}/partition=${partition}`;
    }
    extractValuesFromKey(id, keys, sortedFields) {
        const idSegment = `id=${id}`;
        const keyForId = keys.find(key => {
            const segments = key.split('/');
            return segments.some(segment => segment === idSegment);
        });
        if (!keyForId) {
            throw new PartitionError(`Partition key not found for ID ${id}`, {
                resourceName: this.resource.name,
                id,
                operation: 'extractPartitionValuesFromKey'
            });
        }
        const keyParts = keyForId.split('/');
        const actualPartitionValues = {};
        for (const [fieldName] of sortedFields) {
            const fieldPart = keyParts.find(part => part.startsWith(`${fieldName}=`));
            if (fieldPart) {
                const value = fieldPart.replace(`${fieldName}=`, '');
                actualPartitionValues[fieldName] = value;
            }
        }
        return actualPartitionValues;
    }
    async createReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        const promises = Object.entries(partitions).map(async ([partitionName]) => {
            const partitionKey = this.getKey({ partitionName, id: data.id, data });
            if (partitionKey) {
                const partitionMetadata = {
                    _v: String(this.resource.version)
                };
                return this.resource.client.putObject({
                    key: partitionKey,
                    metadata: partitionMetadata,
                    body: '',
                    contentType: undefined,
                });
            }
            return null;
        });
        const results = await Promise.allSettled(promises);
        const failures = results.filter((r) => r.status === 'rejected');
        if (failures.length > 0) {
            this.resource.emit('partitionIndexWarning', {
                operation: 'create',
                id: data.id,
                failures: failures.map(f => f.reason)
            });
        }
    }
    async deleteReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        const keysToDelete = [];
        for (const [partitionName] of Object.entries(partitions)) {
            const partitionKey = this.getKey({ partitionName, id: data.id, data });
            if (partitionKey) {
                keysToDelete.push(partitionKey);
            }
        }
        if (keysToDelete.length > 0) {
            await tryFn(() => this.resource.client.deleteObjects(keysToDelete));
        }
    }
    async updateReferences(data) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        for (const [partitionName, partition] of Object.entries(partitions)) {
            if (!partition || !partition.fields || typeof partition.fields !== 'object') {
                continue;
            }
            const partitionKey = this.getKey({ partitionName, id: data.id, data });
            if (partitionKey) {
                const partitionMetadata = {
                    _v: String(this.resource.version)
                };
                await tryFn(async () => {
                    await this.resource.client.putObject({
                        key: partitionKey,
                        metadata: partitionMetadata,
                        body: '',
                        contentType: undefined,
                    });
                });
            }
        }
    }
    async handleReferenceUpdates(oldData, newData) {
        const partitions = this.getPartitions();
        if (!partitions || Object.keys(partitions).length === 0) {
            return;
        }
        const updatePromises = Object.entries(partitions).map(async ([partitionName, partition]) => {
            const [ok, err] = await tryFn(() => this.handleReferenceUpdate(partitionName, partition, oldData, newData));
            if (!ok) {
                return { partitionName, error: err };
            }
            return { partitionName, success: true };
        });
        await Promise.allSettled(updatePromises);
        const id = newData.id || oldData.id;
        const cleanupPromises = Object.entries(partitions).map(async ([partitionName]) => {
            const prefix = `resource=${this.resource.name}/partition=${partitionName}`;
            const [okKeys, , keys] = await tryFn(() => this.resource.client.getAllKeys({ prefix }));
            if (!okKeys || !keys) {
                return;
            }
            const validKey = this.getKey({ partitionName, id, data: newData });
            const staleKeys = keys.filter(key => key.endsWith(`/id=${id}`) && key !== validKey);
            if (staleKeys.length > 0) {
                await tryFn(() => this.resource.client.deleteObjects(staleKeys));
            }
        });
        await Promise.allSettled(cleanupPromises);
    }
    async handleReferenceUpdate(partitionName, partition, oldData, newData) {
        const id = newData.id || oldData.id;
        const oldPartitionKey = this.getKey({ partitionName, id, data: oldData });
        const newPartitionKey = this.getKey({ partitionName, id, data: newData });
        if (oldPartitionKey !== newPartitionKey) {
            if (oldPartitionKey) {
                await tryFn(async () => {
                    await this.resource.client.deleteObject(oldPartitionKey);
                });
            }
            if (newPartitionKey) {
                await tryFn(async () => {
                    const partitionMetadata = {
                        _v: String(this.resource.version)
                    };
                    await this.resource.client.putObject({
                        key: newPartitionKey,
                        metadata: partitionMetadata,
                        body: '',
                        contentType: undefined,
                    });
                });
            }
        }
        else if (newPartitionKey) {
            await tryFn(async () => {
                const partitionMetadata = {
                    _v: String(this.resource.version)
                };
                await this.resource.client.putObject({
                    key: newPartitionKey,
                    metadata: partitionMetadata,
                    body: '',
                    contentType: undefined,
                });
            });
        }
    }
    async getFromPartition({ id, partitionName, partitionValues = {} }) {
        validateS3KeySegment(id, 'id');
        for (const [fieldName, value] of Object.entries(partitionValues)) {
            if (value !== undefined && value !== null) {
                validateS3KeySegment(value, `partitionValues.${fieldName}`);
            }
        }
        const partitions = this.getPartitions();
        if (!partitions || !partitions[partitionName]) {
            throw new PartitionError(`Partition '${partitionName}' not found`, {
                resourceName: this.resource.name,
                partitionName,
                operation: 'getFromPartition'
            });
        }
        const partition = partitions[partitionName];
        const partitionSegments = [];
        const sortedFields = Object.entries(partition.fields).sort(([a], [b]) => a.localeCompare(b));
        for (const [fieldName, rule] of sortedFields) {
            const value = partitionValues[fieldName];
            if (value !== undefined && value !== null) {
                const transformedValue = this.applyRule(value, rule);
                partitionSegments.push(`${fieldName}=${transformedValue}`);
            }
        }
        if (partitionSegments.length === 0) {
            throw new PartitionError(`No partition values provided for partition '${partitionName}'`, {
                resourceName: this.resource.name,
                partitionName,
                operation: 'getFromPartition'
            });
        }
        const partitionKey = path.join(`resource=${this.resource.name}`, `partition=${partitionName}`, ...partitionSegments, `id=${id}`);
        const [ok] = await tryFn(async () => {
            await this.resource.client.headObject(partitionKey);
        });
        if (!ok) {
            throw new ResourceError(`Resource with id '${id}' not found in partition '${partitionName}'`, {
                resourceName: this.resource.name,
                id,
                partitionName,
                operation: 'getFromPartition'
            });
        }
        const data = await this.resource.get(id);
        data._partition = partitionName;
        data._partitionValues = partitionValues;
        this.resource._emitStandardized('partition-fetched', data, data.id);
        return data;
    }
}

class ResourceQuery {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    get client() {
        return this.resource.client;
    }
    get partitions() {
        return this.resource.config?.partitions || {};
    }
    async count({ partition = null, partitionValues = {} } = {}) {
        await this.resource.executeHooks('beforeCount', { partition, partitionValues });
        let prefix;
        if (partition && Object.keys(partitionValues).length > 0) {
            const partitionDef = this.partitions[partition];
            if (!partitionDef) {
                throw new PartitionError(`Partition '${partition}' not found`, {
                    resourceName: this.resource.name,
                    partitionName: partition,
                    operation: 'count'
                });
            }
            const partitionSegments = [];
            const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
            for (const [fieldName, rule] of sortedFields) {
                const value = partitionValues[fieldName];
                if (value !== undefined && value !== null) {
                    const transformedValue = this.resource.applyPartitionRule(value, rule);
                    partitionSegments.push(`${fieldName}=${transformedValue}`);
                }
            }
            if (partitionSegments.length > 0) {
                prefix = `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
            }
            else {
                prefix = `resource=${this.resource.name}/partition=${partition}`;
            }
        }
        else {
            prefix = `resource=${this.resource.name}/data`;
        }
        const count = await this.client.count({ prefix });
        await this.resource.executeHooks('afterCount', { count, partition, partitionValues });
        this.resource._emitStandardized('count', count);
        return count;
    }
    async listIds({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        let prefix;
        if (partition && Object.keys(partitionValues).length > 0) {
            if (!this.partitions[partition]) {
                throw new PartitionError(`Partition '${partition}' not found`, {
                    resourceName: this.resource.name,
                    partitionName: partition,
                    operation: 'listIds'
                });
            }
            const partitionDef = this.partitions[partition];
            const partitionSegments = [];
            const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
            for (const [fieldName, rule] of sortedFields) {
                const value = partitionValues[fieldName];
                if (value !== undefined && value !== null) {
                    const transformedValue = this.resource.applyPartitionRule(value, rule);
                    partitionSegments.push(`${fieldName}=${transformedValue}`);
                }
            }
            if (partitionSegments.length > 0) {
                prefix = `resource=${this.resource.name}/partition=${partition}/${partitionSegments.join('/')}`;
            }
            else {
                prefix = `resource=${this.resource.name}/partition=${partition}`;
            }
        }
        else {
            prefix = `resource=${this.resource.name}/data`;
        }
        const keys = await this.client.getKeysPage({
            prefix,
            offset: offset,
            amount: limit || 1000,
        });
        const ids = keys.map((key) => {
            const parts = key.split('/');
            const idPart = parts.find(part => part.startsWith('id='));
            return idPart ? idPart.replace('id=', '') : null;
        }).filter((id) => id !== null);
        this.resource._emitStandardized('listed-ids', ids.length);
        return ids;
    }
    async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        await this.resource.executeHooks('beforeList', { partition, partitionValues, limit, offset });
        const [ok, err, result] = await tryFn(async () => {
            if (!partition) {
                return this.listMain({ limit, offset });
            }
            return this.listPartition({ partition, partitionValues, limit, offset });
        });
        if (!ok) {
            return this.handleListError(err, { partition, partitionValues });
        }
        return this.resource.executeHooks('afterList', result);
    }
    async listMain({ limit, offset = 0 }) {
        const [ok, err, ids] = await tryFn(() => this.listIds({ limit, offset }));
        if (!ok || !ids)
            throw err;
        const results = await this.processListResults(ids, 'main');
        this.resource._emitStandardized('list', { count: results.length, errors: 0 });
        return results;
    }
    async listPartition({ partition, partitionValues, limit, offset = 0 }) {
        if (!this.partitions[partition]) {
            this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 0 });
            return [];
        }
        const partitionDef = this.partitions[partition];
        const prefix = this.resource.buildPartitionPrefix(partition, partitionDef, partitionValues);
        const [ok, err, keys] = await tryFn(() => this.client.getKeysPage({
            prefix,
            offset,
            amount: limit || 1000
        }));
        if (!ok || !keys)
            throw err;
        const filteredIds = this.extractIdsFromKeys(keys);
        const results = await this.processPartitionResults(filteredIds, partition, partitionDef, keys);
        this.resource._emitStandardized('list', { partition, partitionValues, count: results.length, errors: 0 });
        return results;
    }
    extractIdsFromKeys(keys) {
        return keys
            .map(key => {
            const parts = key.split('/');
            const idPart = parts.find(part => part.startsWith('id='));
            return idPart ? idPart.replace('id=', '') : null;
        })
            .filter((id) => id !== null);
    }
    async processListResults(ids, context = 'main') {
        const operations = ids.map((id) => async () => {
            const [ok, err, result] = await tryFn(() => this.resource.get(id));
            if (ok && result) {
                return result;
            }
            return this.handleResourceError(err, id, context);
        });
        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, ids[index]);
                this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
            }
        });
        this.resource._emitStandardized('list', { count: results.length, errors: 0 });
        return results.filter((r) => r !== null);
    }
    async processPartitionResults(ids, partition, partitionDef, keys) {
        const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
        const operations = ids.map((id) => async () => {
            const [ok, err, result] = await tryFn(async () => {
                const actualPartitionValues = this.resource.extractPartitionValuesFromKey(id, keys, sortedFields);
                const data = await this.resource.get(id);
                data._partition = partition;
                data._partitionValues = actualPartitionValues;
                return data;
            });
            if (ok && result)
                return result;
            return this.handleResourceError(err, id, 'partition');
        });
        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, ids[index]);
                this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
            }
        });
        return results.filter((item) => item !== null);
    }
    handleResourceError(error, id, context) {
        if (error.message.includes('Cipher job failed') || error.message.includes('OperationError')) {
            return {
                id,
                _decryptionFailed: true,
                _error: error.message,
                ...(context === 'partition' && { _partition: context })
            };
        }
        throw error;
    }
    handleListError(error, { partition, partitionValues }) {
        if (error.message.includes("Partition '") && error.message.includes("' not found")) {
            this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 1 });
            return [];
        }
        this.resource._emitStandardized('list', { partition, partitionValues, count: 0, errors: 1 });
        return [];
    }
    async getMany(ids) {
        await this.resource.executeHooks('beforeGetMany', { ids });
        const operations = ids.map((id) => async () => {
            const [ok, err, data] = await tryFn(() => this.resource.get(id));
            if (ok && data)
                return data;
            const error = err;
            if (error.message.includes('Cipher job failed') || error.message.includes('OperationError')) {
                return {
                    id,
                    _decryptionFailed: true,
                    _error: error.message
                };
            }
            throw error;
        });
        const { results } = await this.resource._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, ids[index]);
                this.resource.observers.map((x) => x.emit('error', this.resource.name, error, ids[index]));
                return {
                    id: ids[index],
                    _error: error.message,
                    _decryptionFailed: error.message.includes('Cipher job failed') || error.message.includes('OperationError')
                };
            }
        });
        const finalResults = await this.resource.executeHooks('afterGetMany', results.filter((r) => r !== null));
        this.resource._emitStandardized('fetched-many', ids.length);
        return finalResults;
    }
    async getAll() {
        const [ok, err, ids] = await tryFn(() => this.listIds());
        if (!ok || !ids)
            throw err;
        const results = [];
        for (const id of ids) {
            const [ok2, , item] = await tryFn(() => this.resource.get(id));
            if (ok2 && item) {
                results.push(item);
            }
        }
        return results;
    }
    async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
        const effectiveSize = size > 0 ? size : 100;
        let totalItems = null;
        let totalPages = null;
        if (!skipCount) {
            totalItems = await this.count({ partition, partitionValues });
            totalPages = Math.ceil(totalItems / effectiveSize);
        }
        const page = Math.floor(offset / effectiveSize);
        const items = await this.list({ partition, partitionValues, limit: effectiveSize, offset });
        const pageResult = {
            items,
            totalItems,
            page,
            pageSize: effectiveSize,
            totalPages,
            hasMore: items.length === effectiveSize && (offset + effectiveSize) < (totalItems || Infinity),
            _debug: {
                requestedSize: size,
                requestedOffset: offset,
                actualItemsReturned: items.length,
                skipCount,
                hasTotalItems: totalItems !== null
            }
        };
        this.resource._emitStandardized('paginated', pageResult);
        return pageResult;
    }
    async query(filter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} } = {}) {
        await this.resource.executeHooks('beforeQuery', { filter, limit, offset, partition, partitionValues });
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
            const filteredBatch = batch.filter(doc => {
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
        const finalResults = results.slice(0, limit);
        return await this.resource.executeHooks('afterQuery', finalResults);
    }
}

class ResourceContent {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    get client() {
        return this.resource.client;
    }
    async setContent({ id, buffer, contentType = 'application/octet-stream' }) {
        const [ok, err, currentData] = await tryFn(() => this.resource.get(id));
        if (!ok || !currentData) {
            throw new ResourceError(`Resource with id '${id}' not found`, {
                resourceName: this.resource.name,
                id,
                operation: 'setContent'
            });
        }
        const bufferLength = typeof buffer === 'string' ? buffer.length : buffer.length;
        const updatedData = {
            ...currentData,
            _hasContent: true,
            _contentLength: bufferLength,
            _mimeType: contentType
        };
        const mappedMetadata = await this.resource.schema.mapper(updatedData);
        const [ok2, err2] = await tryFn(() => this.client.putObject({
            key: this.resource.getResourceKey(id),
            metadata: mappedMetadata,
            body: buffer,
            contentType
        }));
        if (!ok2)
            throw err2;
        this.resource._emitStandardized('content-set', { id, contentType, contentLength: bufferLength }, id);
        return updatedData;
    }
    async content(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, err, response] = await tryFn(() => this.client.getObject(key));
        if (!ok) {
            const error = err;
            if (error.name === 'NoSuchKey' || error.code === 'NoSuchKey' || error.Code === 'NoSuchKey' || error.statusCode === 404) {
                return {
                    buffer: null,
                    contentType: null
                };
            }
            throw err;
        }
        const s3Response = response;
        const buffer = Buffer.from(await s3Response.Body.transformToByteArray());
        const contentType = s3Response.ContentType || null;
        this.resource._emitStandardized('content-fetched', { id, contentLength: buffer.length, contentType }, id);
        return {
            buffer,
            contentType
        };
    }
    async hasContent(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, , response] = await tryFn(() => this.client.headObject(key));
        if (!ok)
            return false;
        const s3Response = response;
        return (s3Response.ContentLength || 0) > 0;
    }
    async deleteContent(id) {
        const key = this.resource.getResourceKey(id);
        const [ok, err, existingObject] = await tryFn(() => this.client.headObject(key));
        if (!ok)
            throw err;
        const s3Response = existingObject;
        const existingMetadata = s3Response.Metadata || {};
        const [ok2, err2] = await tryFn(() => this.client.putObject({
            key,
            body: '',
            metadata: existingMetadata,
        }));
        if (!ok2)
            throw err2;
        this.resource._emitStandardized('content-deleted', id, id);
    }
}

class ResourceStreams {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    readable() {
        const stream = new ResourceReader({ resource: this.resource });
        return stream.build();
    }
    writable() {
        const stream = new ResourceWriter({ resource: this.resource });
        return stream.build();
    }
}

const S3_METADATA_LIMIT_BYTES = 2047;
async function handleInsert$4({ resource, data, mappedData }) {
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
        throw new MetadataLimitError('Metadata size exceeds 2KB limit on insert', {
            totalSize,
            effectiveLimit,
            absoluteLimit: S3_METADATA_LIMIT_BYTES,
            excess: totalSize - effectiveLimit,
            resourceName: resource.name,
            operation: 'insert'
        });
    }
    return { mappedData, body: '' };
}
async function handleUpdate$4({ resource, id, mappedData }) {
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
        throw new MetadataLimitError('Metadata size exceeds 2KB limit on update', {
            totalSize,
            effectiveLimit,
            absoluteLimit: S3_METADATA_LIMIT_BYTES,
            excess: totalSize - effectiveLimit,
            resourceName: resource.name,
            operation: 'update',
            id
        });
    }
    return { mappedData, body: JSON.stringify(mappedData) };
}
async function handleUpsert$4({ resource, id, mappedData }) {
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
        throw new MetadataLimitError('Metadata size exceeds 2KB limit on upsert', {
            totalSize,
            effectiveLimit,
            absoluteLimit: S3_METADATA_LIMIT_BYTES,
            excess: totalSize - effectiveLimit,
            resourceName: resource.name,
            operation: 'upsert',
            id
        });
    }
    return { mappedData, body: '' };
}
async function handleGet$4({ metadata, body }) {
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
        resource.emit('exceedsLimit', {
            operation: 'insert',
            totalSize,
            limit: 2047,
            excess: totalSize - 2047,
            data: originalData || data
        });
        const metadataOnly = { _v: mappedData._v };
        if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
            metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
        }
        return { mappedData: metadataOnly, body: JSON.stringify(mappedData) };
    }
    return { mappedData, body: '' };
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
        resource.emit('exceedsLimit', {
            operation: 'update',
            id,
            totalSize,
            limit: 2047,
            excess: totalSize - 2047,
            data: originalData || data
        });
    }
    return { mappedData, body: JSON.stringify(data) };
}
async function handleUpsert$3({ resource, id, data, mappedData }) {
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
        resource.emit('exceedsLimit', {
            operation: 'upsert',
            id,
            totalSize,
            limit: 2047,
            excess: totalSize - 2047,
            data
        });
    }
    return { mappedData, body: JSON.stringify(data) };
}
async function handleGet$3({ metadata, body }) {
    if (body && body.trim() !== '') {
        const [ok, , result] = await tryFn(() => {
            const bodyData = JSON.parse(body);
            return {
                metadata: {
                    ...bodyData,
                    ...metadata
                },
                body
            };
        });
        if (ok) {
            return result;
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

const TRUNCATED_FLAG = '$truncated';
const TRUNCATED_FLAG_VALUE = 'true';
const TRUNCATED_FLAG_BYTES = calculateUTF8Bytes(TRUNCATED_FLAG) + calculateUTF8Bytes(TRUNCATED_FLAG_VALUE);
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
    return '';
}
function truncateValue(value, maxBytes) {
    if (typeof value === 'string') {
        return truncateString(value, maxBytes);
    }
    else if (typeof value === 'object' && value !== null) {
        const jsonStr = JSON.stringify(value);
        return truncateString(jsonStr, maxBytes);
    }
    else {
        const stringValue = String(value);
        return truncateString(stringValue, maxBytes);
    }
}
async function handleInsert$2({ resource, data, mappedData }) {
    const effectiveLimit = calculateEffectiveLimit({
        s3Limit: S3_METADATA_LIMIT_BYTES,
        systemConfig: {
            version: resource.version,
            timestamps: resource.config.timestamps,
            id: data.id
        }
    });
    const attributeSizes = calculateAttributeSizes(mappedData);
    const sortedFields = Object.entries(attributeSizes)
        .sort(([, a], [, b]) => a - b);
    const resultFields = {};
    let currentSize = 0;
    let truncated = false;
    if (mappedData._v) {
        resultFields._v = mappedData._v;
        currentSize += attributeSizes._v;
    }
    for (const [fieldName, size] of sortedFields) {
        if (fieldName === '_v')
            continue;
        const fieldValue = mappedData[fieldName];
        const spaceNeeded = size + (truncated ? 0 : TRUNCATED_FLAG_BYTES);
        if (currentSize + spaceNeeded <= effectiveLimit) {
            resultFields[fieldName] = fieldValue;
            currentSize += size;
        }
        else {
            const availableSpace = effectiveLimit - currentSize - (truncated ? 0 : TRUNCATED_FLAG_BYTES);
            if (availableSpace > 0) {
                const truncatedValue = truncateValue(fieldValue, availableSpace);
                resultFields[fieldName] = truncatedValue;
                truncated = true;
                currentSize += calculateUTF8Bytes(truncatedValue);
            }
            else {
                resultFields[fieldName] = '';
                truncated = true;
            }
            break;
        }
    }
    let finalSize = calculateTotalSize(resultFields) + (truncated ? TRUNCATED_FLAG_BYTES : 0);
    while (finalSize > effectiveLimit) {
        const fieldNames = Object.keys(resultFields).filter(f => f !== '_v' && f !== '$truncated');
        if (fieldNames.length === 0) {
            break;
        }
        const lastField = fieldNames[fieldNames.length - 1];
        resultFields[lastField] = '';
        finalSize = calculateTotalSize(resultFields) + TRUNCATED_FLAG_BYTES;
        truncated = true;
    }
    if (truncated) {
        resultFields[TRUNCATED_FLAG] = TRUNCATED_FLAG_VALUE;
    }
    return { mappedData: resultFields, body: '' };
}
async function handleUpdate$2({ resource, data, mappedData, originalData }) {
    return handleInsert$2({ resource, data, mappedData});
}
async function handleUpsert$2({ resource, data, mappedData }) {
    return handleInsert$2({ resource, data, mappedData });
}
async function handleGet$2({ metadata, body }) {
    return { metadata, body };
}

var dataTruncate = /*#__PURE__*/Object.freeze({
    __proto__: null,
    handleGet: handleGet$2,
    handleInsert: handleInsert$2,
    handleUpdate: handleUpdate$2,
    handleUpsert: handleUpsert$2
});

const OVERFLOW_FLAG = '$overflow';
const OVERFLOW_FLAG_VALUE = 'true';
const OVERFLOW_FLAG_BYTES = calculateUTF8Bytes(OVERFLOW_FLAG) + calculateUTF8Bytes(OVERFLOW_FLAG_VALUE);
async function handleInsert$1({ resource, data, mappedData }) {
    const effectiveLimit = calculateEffectiveLimit({
        s3Limit: S3_METADATA_LIMIT_BYTES,
        systemConfig: {
            version: resource.version,
            timestamps: resource.config.timestamps,
            id: data.id
        }
    });
    const attributeSizes = calculateAttributeSizes(mappedData);
    const sortedFields = Object.entries(attributeSizes)
        .sort(([, a], [, b]) => a - b);
    const metadataFields = {};
    const bodyFields = {};
    let currentSize = 0;
    let willOverflow = false;
    if (mappedData._v) {
        metadataFields._v = mappedData._v;
        currentSize += attributeSizes._v;
    }
    if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
        const pluginMapStr = JSON.stringify(resource.schema.pluginMap);
        const pluginMapSize = calculateUTF8Bytes('_pluginMap') + calculateUTF8Bytes(pluginMapStr);
        metadataFields._pluginMap = pluginMapStr;
        currentSize += pluginMapSize;
    }
    let reservedLimit = effectiveLimit;
    for (const [fieldName, size] of sortedFields) {
        if (fieldName === '_v')
            continue;
        if (!willOverflow && (currentSize + size > effectiveLimit)) {
            reservedLimit -= OVERFLOW_FLAG_BYTES;
            willOverflow = true;
        }
        if (!willOverflow && (currentSize + size <= reservedLimit)) {
            metadataFields[fieldName] = mappedData[fieldName];
            currentSize += size;
        }
        else {
            bodyFields[fieldName] = mappedData[fieldName];
            willOverflow = true;
        }
    }
    if (willOverflow) {
        metadataFields[OVERFLOW_FLAG] = OVERFLOW_FLAG_VALUE;
    }
    const hasOverflow = Object.keys(bodyFields).length > 0;
    const body = hasOverflow ? JSON.stringify(bodyFields) : '';
    return { mappedData: metadataFields, body };
}
async function handleUpdate$1({ resource, data, mappedData }) {
    return handleInsert$1({ resource, data, mappedData });
}
async function handleUpsert$1({ resource, data, mappedData }) {
    return handleInsert$1({ resource, data, mappedData });
}
async function handleGet$1({ metadata, body }) {
    let bodyData = {};
    if (body && body.trim() !== '') {
        const [ok, , parsed] = tryFnSync(() => JSON.parse(body));
        if (ok) {
            bodyData = parsed;
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

async function handleInsert({ resource, mappedData }) {
    const metadataOnly = {
        '_v': mappedData._v || String(resource.version)
    };
    metadataOnly._map = JSON.stringify(resource.schema?.map || {});
    if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
        metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
    }
    const body = JSON.stringify(mappedData);
    return { mappedData: metadataOnly, body };
}
async function handleUpdate({ resource, mappedData }) {
    const metadataOnly = {
        '_v': mappedData._v || String(resource.version)
    };
    metadataOnly._map = JSON.stringify(resource.schema?.map || {});
    if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
        metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
    }
    const body = JSON.stringify(mappedData);
    return { mappedData: metadataOnly, body };
}
async function handleUpsert({ resource, mappedData }) {
    return handleInsert({ resource, mappedData });
}
async function handleGet({ metadata, body }) {
    let bodyData = {};
    if (body && body.trim() !== '') {
        const [ok, , parsed] = tryFnSync(() => JSON.parse(body));
        if (ok) {
            bodyData = parsed;
        }
    }
    const mergedData = {
        ...bodyData,
        ...metadata
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
    'user-managed': userManaged,
    'enforce-limits': enforceLimits,
    'truncate-data': dataTruncate,
    'body-overflow': bodyOverflow,
    'body-only': bodyOnly
};
function getBehavior(behaviorName) {
    const behavior = behaviors[behaviorName];
    if (!behavior) {
        throw new BehaviorError(`Unknown behavior: ${behaviorName}`, {
            behavior: behaviorName,
            availableBehaviors: Object.keys(behaviors),
            operation: 'getBehavior'
        });
    }
    return behavior;
}
const AVAILABLE_BEHAVIORS = Object.keys(behaviors);
const DEFAULT_BEHAVIOR = 'user-managed';

/**
 * S3 Error Classification Utilities
 *
 * Provides consistent error classification across all S3 operations.
 * Handles differences between AWS SDK v3, MinIO, and other S3-compatible clients.
 */
/**
 * Checks if an error indicates the object/resource was not found.
 * Handles various S3 client error formats (AWS SDK v3, MinIO, etc.)
 */
function isNotFoundError(error) {
    if (!error)
        return false;
    const err = error;
    return (err.name === 'NoSuchKey' ||
        err.name === 'NotFound' ||
        err.code === 'NoSuchKey' ||
        err.code === 'NotFound' ||
        err.Code === 'NoSuchKey' ||
        err.Code === 'NotFound' ||
        err.statusCode === 404 ||
        err.$metadata?.httpStatusCode === 404 ||
        (typeof err.message === 'string' && err.message.includes('NoSuchKey')));
}

/**
 * Safe Merge Utilities
 *
 * Provides functions to sanitize object keys before merging,
 * preventing prototype pollution attacks via __proto__, constructor, or prototype keys.
 */
const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];
/**
 * Check if a key is dangerous for object property assignment.
 * Handles both simple keys and dot-notation paths.
 */
function isDangerousKey(key) {
    if (DANGEROUS_KEYS.includes(key)) {
        return true;
    }
    if (key.includes('.')) {
        return key.split('.').some(part => DANGEROUS_KEYS.includes(part));
    }
    return false;
}
/**
 * Recursively sanitize an object, removing dangerous keys at all levels.
 * Use this for deep merge operations.
 */
function sanitizeDeep(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeDeep(item));
    }
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!isDangerousKey(key)) {
            result[key] = sanitizeDeep(value);
        }
    }
    return result;
}

class ResourcePersistence {
    resource;
    constructor(resource) {
        this.resource = resource;
    }
    get client() { return this.resource.client; }
    get schema() { return this.resource.schema; }
    get validator() { return this.resource.validator; }
    get config() { return this.resource.config; }
    get name() { return this.resource.name; }
    get version() { return this.resource.version; }
    get behavior() { return this.resource.behavior; }
    get hooks() { return this.resource.hooks; }
    get logger() { return this.resource.logger; }
    get idGenerator() { return this.resource.idGenerator; }
    get versioningEnabled() { return this.resource.versioningEnabled; }
    get observers() { return this.resource.observers; }
    async insert({ id: id$1, ...attributes }) {
        this.logger.trace({ id: id$1, attributeKeys: Object.keys(attributes) }, 'insert called');
        const providedId = id$1 !== undefined && id$1 !== null && String(id$1).trim() !== '';
        if (this.config.timestamps) {
            attributes.createdAt = new Date().toISOString();
            attributes.updatedAt = new Date().toISOString();
        }
        const attributesWithDefaults = this.validator.applyDefaults(attributes);
        const completeData = sanitizeDeep(id$1 !== undefined
            ? { id: id$1, ...attributesWithDefaults }
            : { ...attributesWithDefaults });
        const preProcessedData = sanitizeDeep(await this.resource.executeHooks('beforeInsert', completeData));
        const extraProps = Object.keys(preProcessedData).filter(k => !(k in completeData) || preProcessedData[k] !== completeData[k]);
        const extraData = {};
        for (const k of extraProps)
            extraData[k] = preProcessedData[k];
        const shouldValidateId = preProcessedData.id !== undefined && preProcessedData.id !== null;
        const { errors, isValid, data: validated } = await this.resource.validate(preProcessedData, { includeId: shouldValidateId });
        if (!isValid) {
            const errorMsg = (errors && errors.length && errors[0]?.message) ? errors[0].message : 'Insert failed';
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
        let finalId = validatedId || preProcessedData.id || id$1;
        if (!finalId) {
            finalId = await Promise.resolve(this.idGenerator());
            if (!finalId || String(finalId).trim() === '') {
                const { idGenerator } = await Promise.resolve().then(function () { return id; });
                finalId = idGenerator();
            }
        }
        const mappedData = await this.schema.mapper(validatedAttributes);
        mappedData._v = String(this.version);
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
            resource: this.resource,
            data: validatedAttributes,
            mappedData,
            originalData: completeData
        });
        const finalMetadata = processedMetadata;
        if (!finalId || String(finalId).trim() === '') {
            throw new InvalidResourceItem({
                bucket: this.client.config.bucket,
                resourceName: this.name,
                attributes: preProcessedData,
                validation: [{ message: 'Generated ID is invalid', field: 'id' }],
                message: 'Generated ID is invalid'
            });
        }
        const shouldCheckExists = providedId || shouldValidateId || validatedId !== undefined;
        if (shouldCheckExists) {
            const alreadyExists = await this.exists(finalId);
            if (alreadyExists) {
                throw new InvalidResourceItem({
                    bucket: this.client.config.bucket,
                    resourceName: this.name,
                    attributes: preProcessedData,
                    validation: [{ message: `Resource with id '${finalId}' already exists`, field: 'id' }],
                    message: `Resource with id '${finalId}' already exists`
                });
            }
        }
        const key = this.resource.getResourceKey(finalId);
        let contentType = undefined;
        if (body && body !== '') {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okParse)
                contentType = 'application/json';
        }
        if (this.behavior === 'body-only' && (!body || body === '')) {
            throw new ResourceError('Body required for body-only behavior', {
                resourceName: this.name,
                operation: 'insert',
                id: finalId,
                statusCode: 400,
                retriable: false,
                suggestion: 'Include a request body when using behavior "body-only" or switch to "body-overflow".'
            });
        }
        const [okPut, errPut] = await tryFn(() => this.client.putObject({
            key,
            body,
            contentType,
            metadata: finalMetadata,
        }));
        if (!okPut) {
            const msg = errPut && errPut.message ? errPut.message : '';
            if (msg.includes('metadata headers exceed') || msg.includes('Insert failed')) {
                const totalSize = calculateTotalSize(finalMetadata);
                const effectiveLimit = calculateEffectiveLimit({
                    s3Limit: 2047,
                    systemConfig: {
                        version: String(this.version),
                        timestamps: this.config.timestamps,
                        id: finalId
                    }
                });
                const excess = totalSize - effectiveLimit;
                throw new ResourceError('metadata headers exceed', {
                    resourceName: this.name,
                    operation: 'insert',
                    id: finalId,
                    totalSize,
                    effectiveLimit,
                    excess,
                    suggestion: 'Reduce metadata size or number of fields.'
                });
            }
            throw errPut;
        }
        const insertedObject = await this.get(finalId);
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                await this.resource.createPartitionReferences(insertedObject);
            }
            else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.createPartitionReferences(insertedObject).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'insert',
                            id: finalId,
                            error: err,
                            message: err.message
                        });
                    });
                });
            }
            else {
                const [ok, err] = await tryFn(() => this.resource.createPartitionReferences(insertedObject));
                if (!ok) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'insert',
                        id: finalId,
                        error: err,
                        message: err.message
                    });
                }
            }
            const nonPartitionHooks = this.hooks.afterInsert.filter(hook => !hook.toString().includes('createPartitionReferences'));
            let finalResult = insertedObject;
            for (const hook of nonPartitionHooks) {
                finalResult = await hook(finalResult);
            }
            this.resource._emitStandardized('inserted', finalResult, finalResult?.id || insertedObject?.id);
            return finalResult;
        }
        else {
            const finalResult = await this.resource.executeHooks('afterInsert', insertedObject);
            this.resource._emitStandardized('inserted', finalResult, finalResult?.id || insertedObject?.id);
            return finalResult;
        }
    }
    async get(id) {
        if (lodashEs.isObject(id)) {
            throw new ValidationError('Resource id must be a string', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass the resource id as a string value (e.g. "user-123").'
            });
        }
        if (lodashEs.isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a non-empty id when calling resource methods.'
            });
        }
        await this.resource.executeHooks('beforeGet', { id });
        const key = this.resource.getResourceKey(id);
        const [ok, err, request] = await tryFn(() => this.client.getObject(key));
        if (!ok || !request) {
            throw mapAwsError(err, {
                bucket: this.client.config.bucket,
                key,
                resourceName: this.name,
                operation: 'get',
                id
            });
        }
        const objectVersionRaw = request.Metadata?._v || this.version;
        const objectVersion = typeof objectVersionRaw === 'string' && objectVersionRaw.startsWith('v')
            ? objectVersionRaw.slice(1)
            : objectVersionRaw;
        const schema = await this.resource.getSchemaForVersion(objectVersion);
        let metadata = await schema.unmapper(request.Metadata || {});
        const behaviorImpl = getBehavior(this.behavior);
        let body = '';
        if (request.ContentLength && request.ContentLength > 0) {
            const [okBody, , fullObject] = await tryFn(() => this.client.getObject(key));
            if (okBody && fullObject?.Body) {
                const bodyBytes = await fullObject.Body.transformToByteArray();
                body = Buffer.from(bodyBytes).toString('utf-8');
            }
        }
        const { metadata: processedMetadata } = await behaviorImpl.handleGet({
            resource: this.resource,
            metadata,
            body
        });
        let data = await this.resource.composeFullObjectFromWrite({
            id,
            metadata: processedMetadata,
            body,
            behavior: this.behavior
        });
        data._contentLength = request.ContentLength;
        data._lastModified = request.LastModified;
        data._hasContent = (request.ContentLength || 0) > 0;
        data._mimeType = request.ContentType || null;
        data._etag = request.ETag;
        data._v = objectVersion;
        if (request.VersionId)
            data._versionId = request.VersionId;
        if (request.Expiration)
            data._expiresAt = request.Expiration;
        data._definitionHash = this.resource.getDefinitionHash();
        if (objectVersion !== this.version) {
            data = await this.resource.applyVersionMapping(data, objectVersion, this.version);
        }
        data = await this.resource.executeHooks('afterGet', data);
        this.resource._emitStandardized('fetched', data, data.id);
        return data;
    }
    async getOrNull(id) {
        const [ok, err, data] = await tryFn(() => this.get(id));
        if (!ok && err && isNotFoundError(err)) {
            return null;
        }
        if (!ok || !data)
            throw err;
        return data;
    }
    async getOrThrow(id) {
        const [ok, err, data] = await tryFn(() => this.get(id));
        if (!ok && err && isNotFoundError(err)) {
            throw new ResourceError(`Resource '${this.name}' with id '${id}' not found`, {
                resourceName: this.name,
                operation: 'getOrThrow',
                id,
                code: 'RESOURCE_NOT_FOUND'
            });
        }
        if (!ok || !data)
            throw err;
        return data;
    }
    async exists(id) {
        await this.resource.executeHooks('beforeExists', { id });
        const key = this.resource.getResourceKey(id);
        const [ok, err] = await tryFn(() => this.client.headObject(key));
        if (!ok && err) {
            if (!isNotFoundError(err)) {
                throw err;
            }
        }
        await this.resource.executeHooks('afterExists', { id, exists: ok });
        return ok;
    }
    async delete(id) {
        if (lodashEs.isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling delete().'
            });
        }
        let objectData;
        let deleteError = null;
        const [ok, err, data] = await tryFn(() => this.get(id));
        if (ok && data) {
            objectData = data;
        }
        else {
            objectData = { id };
            deleteError = err;
        }
        await this.resource.executeHooks('beforeDelete', objectData);
        const key = this.resource.getResourceKey(id);
        const [ok2, err2, response] = await tryFn(() => this.client.deleteObject(key));
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0 && objectData) {
            if (this.config.strictPartitions) {
                await this.resource.deletePartitionReferences(objectData);
            }
            else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.deletePartitionReferences(objectData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'delete',
                            id,
                            error: err,
                            message: err.message
                        });
                    });
                });
            }
            else {
                const [okDel, errDel] = await tryFn(() => this.resource.deletePartitionReferences(objectData));
                if (!okDel) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'delete',
                        id,
                        error: errDel,
                        message: errDel.message
                    });
                }
            }
            const nonPartitionHooks = this.hooks.afterDelete.filter(hook => !hook.toString().includes('deletePartitionReferences'));
            let afterDeleteData = objectData;
            for (const hook of nonPartitionHooks) {
                afterDeleteData = await hook(afterDeleteData);
            }
        }
        else {
            await this.resource.executeHooks('afterDelete', objectData);
        }
        this.resource._emitStandardized('deleted', {
            ...objectData,
            $before: { ...objectData },
            $after: null
        }, id);
        if (deleteError) {
            throw mapAwsError(deleteError, {
                bucket: this.client.config.bucket,
                key,
                resourceName: this.name,
                operation: 'delete',
                id
            });
        }
        if (!ok2)
            throw mapAwsError(err2, {
                key,
                resourceName: this.name,
                operation: 'delete',
                id
            });
        return response;
    }
    async upsert({ id, ...attributes }) {
        if (!id) {
            throw new ValidationError('Resource id is required for upsert', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide an id when calling upsert().'
            });
        }
        const exists = await this.exists(id);
        if (exists) {
            return this.update(id, attributes);
        }
        return this.insert({ id, ...attributes });
    }
    async insertMany(objects) {
        const operations = objects.map((attributes) => async () => {
            return await this.insert(attributes);
        });
        const { results } = await this._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, objects[index]);
                this.observers.map((x) => x.emit('error', this.name, error, objects[index]));
            }
        });
        this.resource._emitStandardized('inserted-many', objects.length);
        return results.filter((r) => r !== null);
    }
    async deleteMany(ids) {
        const operations = ids.map((id) => async () => {
            return await this.delete(id);
        });
        const { results, errors } = await this._executeBatchHelper(operations, {
            onItemError: (error, index) => {
                this.resource.emit('error', error, ids[index]);
                this.observers.map((x) => x.emit('error', this.name, error, ids[index]));
            }
        });
        this.resource._emitStandardized('deleted-many', ids.length);
        return { deleted: results.filter(r => r !== null).length, errors: errors.length };
    }
    async update(id, attributes) {
        if (lodashEs.isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling update().'
            });
        }
        const exists = await this.exists(id);
        if (!exists) {
            throw new ResourceError(`Resource with id '${id}' does not exist`, {
                resourceName: this.name,
                id,
                statusCode: 404,
                retriable: false,
                suggestion: 'Ensure the record exists or create it before attempting an update.'
            });
        }
        const originalData = await this.get(id);
        let mergedData = { ...originalData };
        for (const [key, value] of Object.entries(attributes)) {
            if (key.includes('.')) {
                const parts = key.split('.');
                let ref = mergedData;
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (typeof ref[part] !== 'object' || ref[part] === null) {
                        ref[part] = {};
                    }
                    else if (i === 0) {
                        ref[part] = { ...ref[part] };
                    }
                    ref = ref[part];
                }
                const finalKey = parts[parts.length - 1];
                ref[finalKey] = (typeof value === 'object' && value !== null) ?
                    (Array.isArray(value) ? [...value] : { ...value }) : value;
            }
            else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                mergedData[key] = { ...(mergedData[key] || {}), ...value };
            }
            else {
                mergedData[key] = (Array.isArray(value)) ? [...value] : value;
            }
        }
        if (this.config.timestamps) {
            const now = new Date().toISOString();
            mergedData.updatedAt = now;
            if (!mergedData.metadata)
                mergedData.metadata = {};
            else
                mergedData.metadata = { ...mergedData.metadata };
            mergedData.metadata.updatedAt = now;
        }
        mergedData = sanitizeDeep(mergedData);
        const preProcessedData = sanitizeDeep(await this.resource.executeHooks('beforeUpdate', mergedData));
        const completeData = { ...originalData, ...preProcessedData, id };
        const { isValid, errors, data } = await this.resource.validate(completeData, { includeId: true });
        if (!isValid) {
            throw new InvalidResourceItem({
                bucket: this.client.config.bucket,
                resourceName: this.name,
                attributes: preProcessedData,
                validation: errors,
                message: 'validation: ' + ((errors && errors.length) ? JSON.stringify(errors) : 'unknown')
            });
        }
        const earlyBehaviorImpl = getBehavior(this.behavior);
        const tempMappedData = await this.schema.mapper({ ...originalData, ...preProcessedData });
        tempMappedData._v = String(this.version);
        await earlyBehaviorImpl.handleUpdate({
            resource: this.resource,
            id,
            data: { ...originalData, ...preProcessedData },
            mappedData: tempMappedData,
            originalData: { ...attributes, id }
        });
        const { id: validatedId, ...validatedAttributes } = data;
        const oldData = { ...originalData, id };
        const newData = { ...validatedAttributes, id };
        await this.resource.handlePartitionReferenceUpdates(oldData, newData);
        const mappedData = await this.schema.mapper(validatedAttributes);
        mappedData._v = String(this.version);
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
            resource: this.resource,
            id,
            data: validatedAttributes,
            mappedData,
            originalData: { ...attributes, id }
        });
        const finalMetadata = processedMetadata;
        const key = this.resource.getResourceKey(id);
        let existingContentType = undefined;
        let finalBody = body;
        if (body === '' && this.behavior !== 'body-overflow') {
            const [ok, , existingObject] = await tryFn(() => this.client.getObject(key));
            if (ok && existingObject && existingObject.ContentLength && existingObject.ContentLength > 0 && existingObject.Body) {
                const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
                const existingBodyString = existingBodyBuffer.toString();
                const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(existingBodyString)));
                if (!okParse) {
                    finalBody = existingBodyBuffer;
                    existingContentType = existingObject.ContentType;
                }
            }
        }
        let finalContentType = existingContentType;
        if (finalBody && finalBody !== '' && !finalContentType) {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody)));
            if (okParse)
                finalContentType = 'application/json';
        }
        const [ok, err] = await tryFn(() => this.client.putObject({
            key,
            body: finalBody,
            contentType: finalContentType,
            metadata: finalMetadata,
        }));
        if (!ok && err && err.message && err.message.includes('metadata headers exceed')) {
            const totalSize = calculateTotalSize(finalMetadata);
            const effectiveLimit = calculateEffectiveLimit({
                s3Limit: 2047,
                systemConfig: {
                    version: String(this.version),
                    timestamps: this.config.timestamps,
                    id
                }
            });
            const excess = totalSize - effectiveLimit;
            this.resource.emit('exceedsLimit', {
                operation: 'update',
                totalSize,
                limit: 2047,
                effectiveLimit,
                excess,
                data: validatedAttributes
            });
            throw new ResourceError('metadata headers exceed', {
                resourceName: this.name,
                operation: 'update',
                id,
                totalSize,
                effectiveLimit,
                excess,
                suggestion: 'Reduce metadata size or number of fields.'
            });
        }
        else if (!ok) {
            throw mapAwsError(err, {
                bucket: this.client.config.bucket,
                key,
                resourceName: this.name,
                operation: 'update',
                id
            });
        }
        if (this.versioningEnabled && originalData._v !== this.version) {
            const [okHistory, errHistory] = await tryFn(() => this.resource.createHistoricalVersion(id, originalData));
            if (!okHistory) {
                this.resource.emit('historyError', {
                    operation: 'update',
                    id,
                    error: errHistory,
                    message: errHistory.message
                });
            }
        }
        const updatedData = await this.resource.composeFullObjectFromWrite({
            id,
            metadata: finalMetadata,
            body: finalBody,
            behavior: this.behavior
        });
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                await this.resource.handlePartitionReferenceUpdates(originalData, updatedData);
            }
            else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates(originalData, updatedData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'update',
                            id,
                            error: err,
                            message: err.message
                        });
                    });
                });
            }
            else {
                const [ok2, err2] = await tryFn(() => this.resource.handlePartitionReferenceUpdates(originalData, updatedData));
                if (!ok2) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'update',
                        id,
                        error: err2,
                        message: err2.message
                    });
                }
            }
            const nonPartitionHooks = this.hooks.afterUpdate.filter(hook => !hook.toString().includes('handlePartitionReferenceUpdates'));
            let finalResult = updatedData;
            for (const hook of nonPartitionHooks) {
                finalResult = await hook(finalResult);
            }
            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);
            return finalResult;
        }
        else {
            const finalResult = await this.resource.executeHooks('afterUpdate', updatedData);
            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);
            return finalResult;
        }
    }
    async _executeBatchHelper(operations, options = {}) {
        if (this.client._executeBatch) {
            return await this.client._executeBatch(operations, options);
        }
        const settled = await Promise.allSettled(operations.map(op => op()));
        const results = settled.map((s, index) => {
            if (s.status === 'fulfilled')
                return s.value;
            if (options.onItemError)
                options.onItemError(s.reason, index);
            return null;
        });
        const errors = settled
            .map((s, index) => s.status === 'rejected' ? { error: s.reason, index } : null)
            .filter((e) => e !== null);
        return { results, errors };
    }
    async patch(id, fields, options = {}) {
        if (lodashEs.isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling patch().'
            });
        }
        if (!fields || typeof fields !== 'object') {
            throw new ValidationError('fields must be a non-empty object', {
                field: 'fields',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass a plain object with the fields to update (e.g. { status: "active" }).'
            });
        }
        await this.resource.executeHooks('beforePatch', { id, fields, options });
        const behavior = this.behavior;
        const hasNestedFields = Object.keys(fields).some(key => key.includes('.'));
        let result;
        if ((behavior === 'enforce-limits' || behavior === 'truncate-data') && !hasNestedFields) {
            result = await this._patchViaCopyObject(id, fields, options);
        }
        else {
            result = await this.update(id, fields);
        }
        const finalResult = await this.resource.executeHooks('afterPatch', result);
        return finalResult;
    }
    async _patchViaCopyObject(id, fields, options = {}) {
        const key = this.resource.getResourceKey(id);
        const headResponse = await this.client.headObject(key);
        const currentMetadata = headResponse.Metadata || {};
        let currentData = await this.schema.unmapper(currentMetadata);
        if (!currentData.id) {
            currentData.id = id;
        }
        let mergedData = { ...currentData };
        for (const [fieldKey, value] of Object.entries(fields)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                mergedData[fieldKey] = { ...(mergedData[fieldKey] || {}), ...value };
            }
            else {
                mergedData[fieldKey] = (Array.isArray(value)) ? [...value] : value;
            }
        }
        if (this.config.timestamps) {
            mergedData.updatedAt = new Date().toISOString();
        }
        mergedData = sanitizeDeep(mergedData);
        const { isValid, errors } = await this.validator.validate(mergedData);
        if (!isValid) {
            throw new ValidationError('Validation failed during patch', {
                validation: errors
            });
        }
        const newMetadata = await this.schema.mapper(mergedData);
        newMetadata._v = String(this.version);
        await this.client.copyObject({
            from: key,
            to: key,
            metadataDirective: 'REPLACE',
            metadata: newMetadata
        });
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            const oldData = { ...currentData, id };
            const newData = { ...mergedData, id };
            if (this.config.strictPartitions) {
                await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            }
            else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates(oldData, newData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'patch',
                            id,
                            error: err
                        });
                    });
                });
            }
            else {
                await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            }
        }
        return mergedData;
    }
    async replace(id, fullData, options = {}) {
        if (lodashEs.isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling replace().'
            });
        }
        if (!fullData || typeof fullData !== 'object') {
            throw new ValidationError('fullData must be a non-empty object', {
                field: 'fullData',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass a plain object containing the full resource payload to replace().'
            });
        }
        await this.resource.executeHooks('beforeReplace', { id, fullData, options });
        const dataClone = { ...fullData };
        const attributesWithDefaults = this.validator.applyDefaults(dataClone);
        if (this.config.timestamps) {
            if (!attributesWithDefaults.createdAt) {
                attributesWithDefaults.createdAt = new Date().toISOString();
            }
            attributesWithDefaults.updatedAt = new Date().toISOString();
        }
        const completeData = sanitizeDeep({ id, ...attributesWithDefaults });
        const { errors, isValid, data: validated, } = await this.resource.validate(completeData, { includeId: true });
        if (!isValid) {
            const errorMsg = (errors && errors.length && errors[0]?.message) ? errors[0].message : 'Replace failed';
            throw new InvalidResourceItem({
                bucket: this.client.config.bucket,
                resourceName: this.name,
                attributes: completeData,
                validation: errors,
                message: errorMsg
            });
        }
        const { id: validatedId, ...validatedAttributes } = validated;
        const mappedMetadata = await this.schema.mapper(validatedAttributes);
        mappedMetadata._v = String(this.version);
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: finalMetadata, body } = await behaviorImpl.handleInsert({
            resource: this.resource,
            data: validatedAttributes,
            mappedData: mappedMetadata,
            originalData: completeData
        });
        const key = this.resource.getResourceKey(id);
        let contentType = undefined;
        if (body && body !== '') {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okParse)
                contentType = 'application/json';
        }
        if (this.behavior === 'body-only' && (!body || body === '')) {
            throw new ResourceError('Body required for body-only behavior', {
                resourceName: this.name,
                operation: 'replace',
                id,
                statusCode: 400,
                retriable: false,
                suggestion: 'Include a request body when using behavior "body-only" or switch to "body-overflow".'
            });
        }
        const [okPut, errPut] = await tryFn(() => this.client.putObject({
            key,
            body,
            contentType,
            metadata: finalMetadata,
        }));
        if (!okPut) {
            const msg = errPut && errPut.message ? errPut.message : '';
            if (msg.includes('metadata headers exceed') || msg.includes('Replace failed')) {
                const totalSize = calculateTotalSize(finalMetadata);
                const effectiveLimit = calculateEffectiveLimit({
                    s3Limit: 2047,
                    systemConfig: {
                        version: String(this.version),
                        timestamps: this.config.timestamps,
                        id
                    }
                });
                const excess = totalSize - effectiveLimit;
                errPut.totalSize = totalSize;
                errPut.limit = 2047;
                errPut.effectiveLimit = effectiveLimit;
                errPut.excess = excess;
                throw new ResourceError('metadata headers exceed', { resourceName: this.name, operation: 'replace', id, totalSize, effectiveLimit, excess, suggestion: 'Reduce metadata size or number of fields.' });
            }
            throw errPut;
        }
        const replacedObject = { id, ...validatedAttributes };
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                await this.resource.handlePartitionReferenceUpdates({}, replacedObject);
            }
            else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates({}, replacedObject).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'replace',
                            id,
                            error: err
                        });
                    });
                });
            }
            else {
                await this.resource.handlePartitionReferenceUpdates({}, replacedObject);
            }
        }
        const finalResult = await this.resource.executeHooks('afterReplace', replacedObject);
        return finalResult;
    }
    async updateConditional(id, attributes, options) {
        if (lodashEs.isEmpty(id)) {
            throw new ValidationError('Resource id cannot be empty', {
                field: 'id',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide the target id when calling updateConditional().'
            });
        }
        const { ifMatch } = options;
        if (!ifMatch) {
            throw new ValidationError('updateConditional requires ifMatch option with ETag value', {
                field: 'ifMatch',
                statusCode: 428,
                retriable: false,
                suggestion: 'Pass the current object ETag in options.ifMatch to enable conditional updates.'
            });
        }
        const exists = await this.exists(id);
        if (!exists) {
            return {
                success: false,
                error: `Resource with id '${id}' does not exist`
            };
        }
        const originalData = await this.get(id);
        let mergedData = { ...originalData };
        for (const [key, value] of Object.entries(attributes)) {
            if (key.includes('.')) {
                const parts = key.split('.');
                let ref = mergedData;
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (typeof ref[part] !== 'object' || ref[part] === null) {
                        ref[part] = {};
                    }
                    else if (i === 0) {
                        ref[part] = { ...ref[part] };
                    }
                    ref = ref[part];
                }
                const finalKey = parts[parts.length - 1];
                ref[finalKey] = (typeof value === 'object' && value !== null) ?
                    (Array.isArray(value) ? [...value] : { ...value }) : value;
            }
            else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                mergedData[key] = { ...(mergedData[key] || {}), ...value };
            }
            else {
                mergedData[key] = (Array.isArray(value)) ? [...value] : value;
            }
        }
        if (this.config.timestamps) {
            const now = new Date().toISOString();
            mergedData.updatedAt = now;
            if (!mergedData.metadata)
                mergedData.metadata = {};
            else
                mergedData.metadata = { ...mergedData.metadata };
            mergedData.metadata.updatedAt = now;
        }
        mergedData = sanitizeDeep(mergedData);
        const preProcessedData = sanitizeDeep(await this.resource.executeHooks('beforeUpdate', mergedData));
        const completeData = { ...originalData, ...preProcessedData, id };
        const { isValid, errors, data } = await this.resource.validate(completeData, { includeId: true });
        if (!isValid) {
            return {
                success: false,
                error: 'Validation failed: ' + ((errors && errors.length) ? JSON.stringify(errors) : 'unknown'),
                validationErrors: errors
            };
        }
        const { id: validatedId, ...validatedAttributes } = data;
        const mappedData = await this.schema.mapper(validatedAttributes);
        mappedData._v = String(this.version);
        const behaviorImpl = getBehavior(this.behavior);
        const { mappedData: processedMetadata, body } = await behaviorImpl.handleUpdate({
            resource: this.resource,
            id,
            data: validatedAttributes,
            mappedData,
            originalData: { ...attributes, id }
        });
        const key = this.resource.getResourceKey(id);
        let existingContentType = undefined;
        let finalBody = body;
        if (body === '' && this.behavior !== 'body-overflow') {
            const [okGet, , existingObject] = await tryFn(() => this.client.getObject(key));
            if (okGet && existingObject && existingObject.ContentLength && existingObject.ContentLength > 0 && existingObject.Body) {
                const existingBodyBuffer = Buffer.from(await existingObject.Body.transformToByteArray());
                const existingBodyString = existingBodyBuffer.toString();
                const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(existingBodyString)));
                if (!okParse) {
                    finalBody = existingBodyBuffer;
                    existingContentType = existingObject.ContentType;
                }
            }
        }
        let finalContentType = existingContentType;
        if (finalBody && finalBody !== '' && !finalContentType) {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(finalBody)));
            if (okParse)
                finalContentType = 'application/json';
        }
        const [ok, err, response] = await tryFn(() => this.client.putObject({
            key,
            body: finalBody,
            contentType: finalContentType,
            metadata: processedMetadata,
            ifMatch
        }));
        if (!ok) {
            if (err.name === 'PreconditionFailed' ||
                err.$metadata?.httpStatusCode === 412) {
                return {
                    success: false,
                    error: 'ETag mismatch - object was modified by another process'
                };
            }
            return {
                success: false,
                error: err.message || 'Update failed'
            };
        }
        if (this.versioningEnabled && originalData._v !== this.version) {
            const [okHistory, errHistory] = await tryFn(() => this.resource.createHistoricalVersion(id, originalData));
            if (!okHistory) {
                this.resource.emit('historyError', {
                    operation: 'updateConditional',
                    id,
                    error: errHistory,
                    message: errHistory.message
                });
            }
        }
        const updatedData = await this.resource.composeFullObjectFromWrite({
            id,
            metadata: processedMetadata,
            body: finalBody,
            behavior: this.behavior
        });
        const oldData = { ...originalData, id };
        const newData = { ...validatedAttributes, id };
        if (this.config.partitions && Object.keys(this.config.partitions).length > 0) {
            if (this.config.strictPartitions) {
                await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            }
            else if (this.config.asyncPartitions) {
                setImmediate(() => {
                    this.resource.handlePartitionReferenceUpdates(oldData, newData).catch(err => {
                        this.resource.emit('partitionIndexError', {
                            operation: 'updateConditional',
                            id,
                            error: err,
                            message: err.message
                        });
                    });
                });
            }
            else {
                const [okPartition, errPartition] = await tryFn(() => this.resource.handlePartitionReferenceUpdates(oldData, newData));
                if (!okPartition) {
                    this.resource.emit('partitionIndexError', {
                        operation: 'updateConditional',
                        id,
                        error: errPartition,
                        message: errPartition.message
                    });
                }
            }
            const nonPartitionHooks = this.hooks.afterUpdate.filter(hook => !hook.toString().includes('handlePartitionReferenceUpdates'));
            let finalResult = updatedData;
            for (const hook of nonPartitionHooks) {
                finalResult = await hook(finalResult);
            }
            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);
            return {
                success: true,
                data: finalResult,
                etag: response?.ETag
            };
        }
        else {
            await this.resource.handlePartitionReferenceUpdates(oldData, newData);
            const finalResult = await this.resource.executeHooks('afterUpdate', updatedData);
            this.resource._emitStandardized('updated', {
                ...updatedData,
                $before: { ...originalData },
                $after: { ...finalResult }
            }, updatedData.id);
            return {
                success: true,
                data: finalResult,
                etag: response?.ETag
            };
        }
    }
    async deleteAll() {
        if (this.config.paranoid !== false) {
            throw new ResourceError('deleteAll() is a dangerous operation and requires paranoid: false option.', {
                resourceName: this.name,
                operation: 'deleteAll',
                paranoid: this.config.paranoid,
                suggestion: 'Set paranoid: false to allow deleteAll.'
            });
        }
        const prefix = `resource=${this.name}/data`;
        const deletedCount = await this.client.deleteAll({ prefix });
        this.resource._emitStandardized('deleted-all', {
            version: this.version,
            prefix,
            deletedCount
        });
        return { deletedCount, version: this.version };
    }
    async deleteAllData() {
        if (this.config.paranoid !== false) {
            throw new ResourceError('deleteAllData() is a dangerous operation and requires paranoid: false option.', {
                resourceName: this.name,
                operation: 'deleteAllData',
                paranoid: this.config.paranoid,
                suggestion: 'Set paranoid: false to allow deleteAllData.'
            });
        }
        const prefix = `resource=${this.name}`;
        const deletedCount = await this.client.deleteAll({ prefix });
        this.resource._emitStandardized('deleted-all-data', {
            resource: this.name,
            prefix,
            deletedCount
        });
        return { deletedCount, resource: this.name };
    }
}

function validateResourceConfig(config) {
    const errors = [];
    if (!config.name) {
        errors.push("Resource 'name' is required");
    }
    else if (typeof config.name !== 'string') {
        errors.push("Resource 'name' must be a string");
    }
    else if (config.name.trim() === '') {
        errors.push("Resource 'name' cannot be empty");
    }
    else if (!isValidS3KeySegment(config.name)) {
        errors.push(`Resource 'name' must be URL-friendly (no /, \\, =, or %). Got: '${config.name}'`);
    }
    if (!config.client) {
        errors.push("S3 'client' is required");
    }
    if (!config.attributes) {
        errors.push("Resource 'attributes' are required");
    }
    else if (typeof config.attributes !== 'object' || Array.isArray(config.attributes)) {
        errors.push("Resource 'attributes' must be an object");
    }
    else if (Object.keys(config.attributes).length === 0) {
        errors.push("Resource 'attributes' cannot be empty");
    }
    if (config.version !== undefined && typeof config.version !== 'string') {
        errors.push("Resource 'version' must be a string");
    }
    if (config.behavior !== undefined && typeof config.behavior !== 'string') {
        errors.push("Resource 'behavior' must be a string");
    }
    if (config.passphrase !== undefined && typeof config.passphrase !== 'string') {
        errors.push("Resource 'passphrase' must be a string");
    }
    if (config.observers !== undefined && !Array.isArray(config.observers)) {
        errors.push("Resource 'observers' must be an array");
    }
    const booleanFields = ['cache', 'autoDecrypt', 'timestamps', 'paranoid', 'allNestedObjectsOptional'];
    for (const field of booleanFields) {
        if (config[field] !== undefined && typeof config[field] !== 'boolean') {
            errors.push(`Resource '${field}' must be a boolean`);
        }
    }
    if (config.idGenerator !== undefined) {
        const isValidFunction = typeof config.idGenerator === 'function';
        const isValidNumber = typeof config.idGenerator === 'number';
        const isValidIncremental = typeof config.idGenerator === 'string' &&
            (config.idGenerator === 'incremental' || config.idGenerator.startsWith('incremental:'));
        const isValidIncrementalObject = typeof config.idGenerator === 'object' &&
            config.idGenerator !== null &&
            config.idGenerator.type === 'incremental';
        if (!isValidFunction && !isValidNumber && !isValidIncremental && !isValidIncrementalObject) {
            errors.push("Resource 'idGenerator' must be a function, number (size), 'incremental' string, or incremental config object");
        }
        else if (isValidNumber && config.idGenerator <= 0) {
            errors.push("Resource 'idGenerator' size must be greater than 0");
        }
    }
    if (config.idSize !== undefined) {
        if (typeof config.idSize !== 'number' || !Number.isInteger(config.idSize)) {
            errors.push("Resource 'idSize' must be an integer");
        }
        else if (config.idSize <= 0) {
            errors.push("Resource 'idSize' must be greater than 0");
        }
    }
    if (config.partitions !== undefined) {
        if (typeof config.partitions !== 'object' || Array.isArray(config.partitions)) {
            errors.push("Resource 'partitions' must be an object");
        }
        else {
            for (const [partitionName, partitionDef] of Object.entries(config.partitions)) {
                if (!isValidS3KeySegment(partitionName)) {
                    errors.push(`Partition name '${partitionName}' must be URL-friendly (no /, \\, =, or %)`);
                }
                else if (typeof partitionDef !== 'object' || Array.isArray(partitionDef)) {
                    errors.push(`Partition '${partitionName}' must be an object`);
                }
                else if (!partitionDef.fields) {
                    errors.push(`Partition '${partitionName}' must have a 'fields' property`);
                }
                else if (typeof partitionDef.fields !== 'object' || Array.isArray(partitionDef.fields)) {
                    errors.push(`Partition '${partitionName}.fields' must be an object`);
                }
                else {
                    for (const [fieldName, fieldType] of Object.entries(partitionDef.fields)) {
                        if (!isValidS3KeySegment(fieldName)) {
                            errors.push(`Partition field '${fieldName}' must be URL-friendly (no /, \\, =, or %)`);
                        }
                        else if (typeof fieldType !== 'string') {
                            errors.push(`Partition '${partitionName}.fields.${fieldName}' must be a string`);
                        }
                    }
                }
            }
        }
    }
    if (config.hooks !== undefined) {
        if (typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
            errors.push("Resource 'hooks' must be an object");
        }
        else {
            const validHookEvents = [
                'beforeInsert', 'afterInsert',
                'beforeUpdate', 'afterUpdate',
                'beforeDelete', 'afterDelete',
                'beforeGet', 'afterGet',
                'beforeList', 'afterList',
                'beforeQuery', 'afterQuery',
                'beforeExists', 'afterExists',
                'beforeCount', 'afterCount',
                'beforePatch', 'afterPatch',
                'beforeReplace', 'afterReplace',
                'beforeGetMany', 'afterGetMany',
                'beforeDeleteMany', 'afterDeleteMany'
            ];
            for (const [event, hooksArr] of Object.entries(config.hooks)) {
                if (!validHookEvents.includes(event)) {
                    errors.push(`Invalid hook event '${event}'. Valid events: ${validHookEvents.join(', ')}`);
                }
                else if (!Array.isArray(hooksArr)) {
                    errors.push(`Resource 'hooks.${event}' must be an array`);
                }
            }
        }
    }
    if (config.events !== undefined) {
        if (typeof config.events !== 'object' || Array.isArray(config.events)) {
            errors.push("Resource 'events' must be an object");
        }
        else {
            for (const [eventName, listeners] of Object.entries(config.events)) {
                if (Array.isArray(listeners)) {
                    for (let i = 0; i < listeners.length; i++) {
                        const listener = listeners[i];
                        if (typeof listener !== 'function') {
                            errors.push(`Resource 'events.${eventName}[${i}]' must be a function`);
                        }
                    }
                }
                else if (typeof listeners !== 'function') {
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

class Resource extends AsyncEventEmitter {
    name;
    client;
    version;
    logLevel;
    logger;
    behavior;
    _resourceAsyncEvents;
    observers;
    passphrase;
    bcryptRounds;
    versioningEnabled;
    strictValidation;
    asyncEvents;
    idGenerator;
    idSize;
    idGeneratorType;
    config;
    validator;
    schema;
    $schema;
    hooks;
    attributes;
    guard;
    eventsDisabled;
    database;
    map;
    _schemaRegistry;
    _pluginSchemaRegistry;
    _instanceId;
    _idGenerator;
    _hooksModule;
    _partitions;
    _eventsModule;
    _guards;
    _middleware;
    _query;
    _content;
    _streams;
    _persistence;
    constructor(config = {}) {
        super();
        this._instanceId = idGenerator(7);
        const validation = validateResourceConfig(config);
        if (!validation.isValid) {
            const errorDetails = validation.errors.map((err) => `  • ${err}`).join('\n');
            throw new ResourceError(`Invalid Resource ${config.name || '[unnamed]'} configuration:\n${errorDetails}`, {
                resourceName: config.name,
                validation: validation.errors,
            });
        }
        const { name, client, version = '1', attributes = {}, behavior = DEFAULT_BEHAVIOR, passphrase = 'secret', bcryptRounds = 10, observers = [], cache = false, autoEncrypt = true, autoDecrypt = true, timestamps = false, partitions = {}, paranoid = true, allNestedObjectsOptional = true, hooks = {}, idGenerator: customIdGenerator, idSize = 22, versioningEnabled = false, strictValidation = true, events = {}, asyncEvents = true, asyncPartitions = true, strictPartitions = false, createdBy = 'user', guard, schemaRegistry, pluginSchemaRegistry } = config;
        this.name = name;
        this.client = client;
        this.version = version;
        this.logLevel = (config.logLevel || config.client?.logLevel || config.database?.logger.level || 'info');
        if (config.database && config.database.getChildLogger) {
            this.logger = config.database.getChildLogger(`Resource:${name}`, { resource: name });
        }
        else if (config.database && config.database.logger) {
            this.logger = config.database.logger.child({ resource: name });
        }
        else {
            this.logger = createLogger({ name: `Resource:${name}`, level: this.logLevel });
        }
        this.behavior = behavior;
        this.observers = observers;
        this.passphrase = passphrase ?? 'secret';
        this.bcryptRounds = bcryptRounds;
        this.versioningEnabled = versioningEnabled;
        this.strictValidation = strictValidation;
        this.setAsyncMode(asyncEvents);
        this._resourceAsyncEvents = asyncEvents;
        this.asyncEvents = asyncEvents;
        this._idGenerator = new ResourceIdGenerator(this, {
            idGenerator: customIdGenerator,
            idSize
        });
        this.idGenerator = this._idGenerator.getGenerator();
        this.idSize = this._idGenerator.idSize;
        this.idGeneratorType = this._idGenerator.getType(customIdGenerator, this.idSize);
        Object.defineProperty(this, '_incrementalConfig', {
            get: () => this._idGenerator._incrementalConfig,
            enumerable: false,
            configurable: false
        });
        const normalizedPartitions = this._normalizePartitionsInput(partitions, attributes);
        this.config = {
            cache,
            hooks,
            paranoid,
            timestamps,
            partitions: normalizedPartitions,
            autoEncrypt,
            autoDecrypt,
            allNestedObjectsOptional,
            asyncEvents: this.asyncEvents,
            asyncPartitions,
            strictPartitions,
            createdBy,
        };
        this.validator = new ResourceValidator({
            attributes,
            strictValidation,
            allNestedObjectsOptional,
            passphrase: this.passphrase,
            bcryptRounds: this.bcryptRounds,
            autoEncrypt,
            autoDecrypt
        });
        // Fix: parse version to number for Schema
        const parsedVersion = parseInt(version.replace(/v/i, ''), 10) || 1;
        this._schemaRegistry = schemaRegistry;
        this._pluginSchemaRegistry = pluginSchemaRegistry;
        this.schema = new Schema({
            name,
            attributes,
            passphrase,
            bcryptRounds,
            version: parsedVersion,
            options: {
                allNestedObjectsOptional,
                autoEncrypt,
                autoDecrypt
            },
            schemaRegistry: this._schemaRegistry,
            pluginSchemaRegistry: this._pluginSchemaRegistry
        });
        this._schemaRegistry = this.schema.getSchemaRegistry() || this._schemaRegistry;
        this._pluginSchemaRegistry = this.schema.getPluginSchemaRegistry() || this._pluginSchemaRegistry;
        const { database: _db, observers: _obs, client: _cli, ...cloneableConfig } = config;
        this.$schema = { ...cloneableConfig };
        this.$schema._createdAt = Date.now();
        this.$schema._updatedAt = Date.now();
        Object.freeze(this.$schema);
        this._hooksModule = new ResourceHooks(this, {});
        this.hooks = this._hooksModule.getHooks();
        this.attributes = attributes || {};
        this._partitions = new ResourcePartitions(this, { strictValidation });
        this.map = config.map;
        this.applyConfiguration({ map: this.map });
        if (hooks) {
            for (const [event, hooksArr] of Object.entries(hooks)) {
                if (Array.isArray(hooksArr)) {
                    for (const fn of hooksArr) {
                        this._hooksModule.addHook(event, fn);
                    }
                }
            }
        }
        this._eventsModule = new ResourceEvents(this, {
            disableEvents: config.disableEvents,
            disableResourceEvents: config.disableResourceEvents,
            events
        });
        this.eventsDisabled = this._eventsModule.isDisabled();
        this._guards = new ResourceGuards(this, { guard });
        this.guard = this._guards.getGuard();
        this._middleware = new ResourceMiddleware(this);
        this._middleware.init();
        this._query = new ResourceQuery(this);
        this._content = new ResourceContent(this);
        this._streams = new ResourceStreams(this);
        this._persistence = new ResourcePersistence(this);
        this._initIncrementalIdGenerator();
    }
    _normalizePartitionsInput(partitions, attributes) {
        if (!Array.isArray(partitions)) {
            return partitions || {};
        }
        const normalized = {};
        for (const fieldName of partitions) {
            if (typeof fieldName !== 'string') {
                throw new PartitionError('Invalid partition field type', {
                    fieldName,
                    receivedType: typeof fieldName,
                    retriable: false,
                    suggestion: 'Use string field names when declaring partitions (e.g. ["status", "region"]).'
                });
            }
            if (!attributes || !attributes[fieldName]) {
                throw new PartitionError(`Partition field '${fieldName}' not found in attributes`, {
                    fieldName,
                    availableFields: attributes ? Object.keys(attributes) : [],
                    retriable: false,
                    suggestion: 'Ensure the partition field exists in the resource attributes definition.'
                });
            }
            const partitionName = `by${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
            const fieldDef = attributes[fieldName];
            let fieldType = 'string';
            if (typeof fieldDef === 'string') {
                fieldType = fieldDef.split('|')[0].trim();
            }
            else if (typeof fieldDef === 'object' && fieldDef !== null && fieldDef.type) {
                fieldType = fieldDef.type;
            }
            normalized[partitionName] = {
                fields: {
                    [fieldName]: fieldType
                }
            };
        }
        return normalized;
    }
    configureIdGenerator(customIdGenerator, idSize) {
        const tempGenerator = new ResourceIdGenerator(this, { idGenerator: customIdGenerator, idSize });
        return tempGenerator.getGenerator();
    }
    _initIncrementalIdGenerator() {
        this._idGenerator.initIncremental();
        this.idGenerator = this._idGenerator.getGenerator();
    }
    hasAsyncIdGenerator() {
        return this._idGenerator.isAsync();
    }
    getIdGeneratorType(customIdGenerator, idSize) {
        return this._idGenerator.getType(customIdGenerator, idSize);
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
    applyConfiguration({ map } = {}) {
        if (this.config.timestamps) {
            if (!this.attributes.createdAt) {
                this.attributes.createdAt = 'string|optional';
            }
            if (!this.attributes.updatedAt) {
                this.attributes.updatedAt = 'string|optional';
            }
            if (!this.config.partitions) {
                this.config.partitions = {};
            }
            if (!this.config.partitions.byCreatedDate) {
                this.config.partitions.byCreatedDate = {
                    fields: {
                        createdAt: 'date|maxlength:10'
                    }
                };
            }
            if (!this.config.partitions.byUpdatedDate) {
                this.config.partitions.byUpdatedDate = {
                    fields: {
                        updatedAt: 'date|maxlength:10'
                    }
                };
            }
        }
        this.setupPartitionHooks();
        if (this.versioningEnabled) {
            if (!this.config.partitions.byVersion) {
                this.config.partitions.byVersion = {
                    fields: {
                        _v: 'string'
                    }
                };
            }
        }
        // Fix: parse version to number for Schema
        const parsedVersion = parseInt(this.version.replace(/v/i, ''), 10) || 1;
        this.schema = new Schema({
            name: this.name,
            attributes: this.attributes,
            passphrase: this.passphrase,
            bcryptRounds: this.bcryptRounds,
            version: parsedVersion,
            options: {
                autoEncrypt: this.config.autoEncrypt,
                autoDecrypt: this.config.autoDecrypt,
                allNestedObjectsOptional: this.config.allNestedObjectsOptional
            },
            map: map || this.map,
            schemaRegistry: this._schemaRegistry,
            pluginSchemaRegistry: this._pluginSchemaRegistry
        });
        this._schemaRegistry = this.schema.getSchemaRegistry() || this._schemaRegistry;
        this._pluginSchemaRegistry = this.schema.getPluginSchemaRegistry() || this._pluginSchemaRegistry;
        if (this.validator) {
            this.validator.updateSchema(this.attributes);
        }
        this.validatePartitions();
    }
    updateAttributes(newAttributes) {
        const oldAttributes = this.attributes;
        this.attributes = newAttributes;
        this.applyConfiguration();
        return { oldAttributes, newAttributes };
    }
    addPluginAttribute(name, definition, pluginName) {
        if (!pluginName) {
            throw new ResourceError('Plugin name is required when adding plugin attributes', { resource: this.name, attribute: name });
        }
        const existingDef = this.schema.getAttributeDefinition(name);
        if (existingDef && (!existingDef.__plugin__ || existingDef.__plugin__ !== pluginName)) {
            throw new ResourceError(`Attribute '${name}' already exists and is not from plugin '${pluginName}'`, { resource: this.name, attribute: name, plugin: pluginName });
        }
        let defObject = definition;
        if (typeof definition === 'object' && definition !== null) {
            defObject = { ...definition };
        }
        if (typeof defObject === 'object' && defObject !== null) {
            defObject.__plugin__ = pluginName;
            defObject.__pluginCreated__ = Date.now();
        }
        this.schema.attributes[name] = defObject;
        this.attributes[name] = defObject;
        if (typeof defObject === 'string') {
            if (!this.schema._pluginAttributeMetadata) {
                this.schema._pluginAttributeMetadata = {};
            }
            this.schema._pluginAttributeMetadata[name] = {
                __plugin__: pluginName,
                __pluginCreated__: Date.now()
            };
        }
        this.schema.regeneratePluginMapping();
        if (this.schema.options?.generateAutoHooks) {
            this.schema.generateAutoHooks();
        }
        const processedAttributes = this.schema.preprocessAttributesForValidation(this.schema.attributes);
        this.schema.validator = new ValidatorManager({ autoEncrypt: false }).compile(lodashEs.merge({ $$async: true, $$strict: false }, processedAttributes));
        if (this.database) {
            this.database.emit('plugin-attribute-added', {
                resource: this.name,
                attribute: name,
                plugin: pluginName,
                definition: defObject
            });
        }
    }
    removePluginAttribute(name, pluginName = null) {
        const attrDef = this.schema.getAttributeDefinition(name);
        const metadata = this.schema._pluginAttributeMetadata?.[name];
        const isPluginAttr = (typeof attrDef === 'object' && attrDef?.__plugin__) || metadata;
        if (!attrDef || !isPluginAttr) {
            return false;
        }
        const actualPlugin = attrDef?.__plugin__ || metadata?.__plugin__;
        if (pluginName && actualPlugin !== pluginName) {
            throw new ResourceError(`Attribute '${name}' belongs to plugin '${actualPlugin}', not '${pluginName}'`, { resource: this.name, attribute: name, actualPlugin, requestedPlugin: pluginName });
        }
        delete this.schema.attributes[name];
        delete this.attributes[name];
        if (this.schema._pluginAttributeMetadata?.[name]) {
            delete this.schema._pluginAttributeMetadata[name];
        }
        this.schema.regeneratePluginMapping();
        if (this.database) {
            this.database.emit('plugin-attribute-removed', {
                resource: this.name,
                attribute: name,
                plugin: actualPlugin
            });
        }
        return true;
    }
    addHook(event, fn) {
        this._hooksModule.addHook(event, fn);
    }
    async executeHooks(event, data) {
        return this._hooksModule.executeHooks(event, data);
    }
    _bindHook(fn) {
        return this._hooksModule._bindHook(fn);
    }
    setupPartitionHooks() {
        this._partitions.setupHooks(this._hooksModule);
    }
    async validate(data, options = {}) {
        return this.validator.validate(data, options);
    }
    validatePartitions() {
        this._partitions.validate();
    }
    fieldExistsInAttributes(fieldName) {
        return this._partitions.fieldExistsInAttributes(fieldName);
    }
    findOrphanedPartitions() {
        return this._partitions.findOrphaned();
    }
    removeOrphanedPartitions({ dryRun = false } = {}) {
        return this._partitions.removeOrphaned({ dryRun });
    }
    applyPartitionRule(value, rule) {
        return this._partitions.applyRule(value, rule);
    }
    getResourceKey(id) {
        validateS3KeySegment(id, 'id');
        const key = path.join('resource=' + this.name, 'data', `id=${id}`);
        return key;
    }
    getPartitionKey({ partitionName, id, data }) {
        return this._partitions.getKey({ partitionName, id, data });
    }
    getNestedFieldValue(data, fieldPath) {
        return this._partitions.getNestedFieldValue(data, fieldPath);
    }
    calculateContentLength(body) {
        if (!body)
            return 0;
        if (Buffer.isBuffer(body))
            return body.length;
        if (typeof body === 'string')
            return Buffer.byteLength(body, 'utf8');
        if (typeof body === 'object')
            return Buffer.byteLength(JSON.stringify(body), 'utf8');
        return Buffer.byteLength(String(body), 'utf8');
    }
    _emitStandardized(event, payload, id = null) {
        this._eventsModule.emitStandardized(event, payload, id);
    }
    _ensureEventsWired() {
        this._eventsModule.ensureWired();
    }
    on(eventName, listener) {
        this._eventsModule.on(eventName, listener);
        return this;
    }
    addListener(eventName, listener) {
        return this.on(eventName, listener);
    }
    once(eventName, listener) {
        this._eventsModule.once(eventName, listener);
        return this;
    }
    emit(eventName, ...args) {
        return this._eventsModule.emit(eventName, ...args);
    }
    async insert({ id, ...attributes }) {
        return this._persistence.insert({ id, ...attributes });
    }
    async get(id) {
        return this._persistence.get(id);
    }
    async getOrNull(id) {
        return this._persistence.getOrNull(id);
    }
    async getOrThrow(id) {
        return this._persistence.getOrThrow(id);
    }
    async exists(id) {
        return this._persistence.exists(id);
    }
    async update(id, attributes) {
        return this._persistence.update(id, attributes);
    }
    async patch(id, fields, options = {}) {
        return this._persistence.patch(id, fields, options);
    }
    async _patchViaCopyObject(id, fields, options = {}) {
        return this._persistence._patchViaCopyObject(id, fields, options);
    }
    async replace(id, fullData, options = {}) {
        return this._persistence.replace(id, fullData, options);
    }
    async updateConditional(id, attributes, options = {}) {
        return this._persistence.updateConditional(id, attributes, options);
    }
    async delete(id) {
        return this._persistence.delete(id);
    }
    async upsert({ id, ...attributes }) {
        return this._persistence.upsert({ id, ...attributes });
    }
    async count({ partition = null, partitionValues = {} } = {}) {
        return this._query.count({ partition, partitionValues });
    }
    async insertMany(objects) {
        return this._persistence.insertMany(objects);
    }
    async _executeBatchHelper(operations, options = {}) {
        return this._persistence._executeBatchHelper(operations, options);
    }
    async deleteMany(ids) {
        return this._persistence.deleteMany(ids);
    }
    async deleteAll() {
        return this._persistence.deleteAll();
    }
    async deleteAllData() {
        return this._persistence.deleteAllData();
    }
    async listIds({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        return this._query.listIds({ partition, partitionValues, limit, offset });
    }
    async list({ partition = null, partitionValues = {}, limit, offset = 0 } = {}) {
        return this._query.list({ partition, partitionValues, limit, offset });
    }
    async listMain({ limit, offset = 0 }) {
        return this._query.listMain({ limit, offset });
    }
    async listPartition({ partition, partitionValues, limit, offset = 0 }) {
        return this._query.listPartition({ partition, partitionValues, limit, offset });
    }
    buildPartitionPrefix(partition, partitionDef, partitionValues) {
        return this._partitions.buildPrefix(partition, partitionDef, partitionValues);
    }
    extractIdsFromKeys(keys) {
        return this._query.extractIdsFromKeys(keys);
    }
    async processListResults(ids, context = 'main') {
        return this._query.processListResults(ids, context);
    }
    async processPartitionResults(ids, partition, partitionDef, keys) {
        return this._query.processPartitionResults(ids, partition, partitionDef, keys);
    }
    extractPartitionValuesFromKey(id, keys, sortedFields) {
        return this._partitions.extractValuesFromKey(id, keys, sortedFields);
    }
    handleResourceError(error, id, context) {
        return this._query.handleResourceError(error, id, context);
    }
    handleListError(error, { partition, partitionValues }) {
        return this._query.handleListError(error, { partition, partitionValues });
    }
    async getMany(ids) {
        return this._query.getMany(ids);
    }
    async getAll() {
        return this._query.getAll();
    }
    async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false } = {}) {
        const result = await this._query.page({ offset, size, partition, partitionValues, skipCount });
        return result;
    }
    readable() {
        return this._streams.readable();
    }
    writable() {
        return this._streams.writable();
    }
    async setContent({ id, buffer, contentType = 'application/octet-stream' }) {
        return this._content.setContent({ id, buffer, contentType });
    }
    async content(id) {
        return this._content.content(id);
    }
    async hasContent(id) {
        return this._content.hasContent(id);
    }
    async deleteContent(id) {
        return this._content.deleteContent(id);
    }
    getDefinitionHash() {
        const definition = {
            attributes: this.attributes,
            behavior: this.behavior
        };
        const stableString = jsonStableStringify(definition);
        return `sha256:${crypto.createHash('sha256').update(stableString).digest('hex')}`;
    }
    extractVersionFromKey(key) {
        const parts = key.split('/');
        const versionPart = parts.find(part => part.startsWith('v='));
        return versionPart ? versionPart.replace('v=', '') : null;
    }
    async getSchemaForVersion(version) {
        return this.schema;
    }
    async createPartitionReferences(data) {
        return this._partitions.createReferences(data);
    }
    async deletePartitionReferences(data) {
        return this._partitions.deleteReferences(data);
    }
    async query(filter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} } = {}) {
        return this._query.query(filter, { limit, offset, partition, partitionValues });
    }
    async handlePartitionReferenceUpdates(oldData, newData) {
        return this._partitions.handleReferenceUpdates(oldData, newData);
    }
    async handlePartitionReferenceUpdate(partitionName, partition, oldData, newData) {
        return this._partitions.handleReferenceUpdate(partitionName, partition, oldData, newData);
    }
    async updatePartitionReferences(data) {
        return this._partitions.updateReferences(data);
    }
    async getFromPartition({ id, partitionName, partitionValues = {} }) {
        return this._partitions.getFromPartition({ id, partitionName, partitionValues });
    }
    async createHistoricalVersion(id, data) {
        const historicalKey = path.join(`resource=${this.name}`, `historical`, `id=${id}`);
        const historicalData = {
            ...data,
            _v: data._v || this.version,
            _historicalTimestamp: new Date().toISOString()
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
        let contentType = undefined;
        if (body && body !== '') {
            const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okParse)
                contentType = 'application/json';
        }
        await this.client.putObject({
            key: historicalKey,
            metadata: finalMetadata,
            body,
            contentType,
        });
    }
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
    async composeFullObjectFromWrite({ id, metadata, body, behavior }) {
        const behaviorFlags = {};
        if (metadata && metadata['$truncated'] === 'true') {
            behaviorFlags.$truncated = 'true';
        }
        if (metadata && metadata['$overflow'] === 'true') {
            behaviorFlags.$overflow = 'true';
        }
        let unmappedMetadata = {};
        const [ok, , unmapped] = await tryFn(() => this.schema.unmapper(metadata));
        unmappedMetadata = ok ? unmapped : metadata;
        const filterInternalFields = (obj) => {
            if (!obj || typeof obj !== 'object')
                return obj;
            const filtered = {};
            const pluginAttrNames = this.schema._pluginAttributes
                ? Object.values(this.schema._pluginAttributes).flat()
                : [];
            for (const [key, value] of Object.entries(obj)) {
                if (!key.startsWith('_') || key === '_geohash' || key.startsWith('_geohash_zoom') || pluginAttrNames.includes(key)) {
                    filtered[key] = value;
                }
            }
            return filtered;
        };
        const fixValue = (v) => {
            if (typeof v === 'object' && v !== null) {
                return v;
            }
            if (typeof v === 'string') {
                if (v === '[object Object]')
                    return {};
                if ((v.startsWith('{') || v.startsWith('['))) {
                    const [ok, , parsed] = tryFnSync(() => JSON.parse(v));
                    return ok ? parsed : v;
                }
                return v;
            }
            return v;
        };
        if (behavior === 'body-overflow') {
            const hasOverflow = metadata && metadata['$overflow'] === 'true';
            let bodyData = {};
            if (hasOverflow && body) {
                const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
                if (okBody) {
                    let pluginMapFromMeta = null;
                    if (metadata && metadata._pluginmap) {
                        const [okPluginMap, , parsedPluginMap] = await tryFn(() => Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap));
                        pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
                    }
                    const [okUnmap, , unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody, undefined, pluginMapFromMeta));
                    bodyData = okUnmap ? unmappedBody : {};
                }
            }
            const merged = { ...unmappedMetadata, ...bodyData, id };
            Object.keys(merged).forEach(k => { merged[k] = fixValue(merged[k]); });
            const result = filterInternalFields(merged);
            if (hasOverflow) {
                result.$overflow = 'true';
            }
            return result;
        }
        if (behavior === 'body-only') {
            const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(body ? JSON.parse(body) : {}));
            let mapFromMeta = this.schema.map;
            let pluginMapFromMeta = null;
            if (metadata && metadata._map) {
                const [okMap, , parsedMap] = await tryFn(() => Promise.resolve(typeof metadata._map === 'string' ? JSON.parse(metadata._map) : metadata._map));
                mapFromMeta = okMap ? parsedMap : this.schema.map;
            }
            if (metadata && metadata._pluginmap) {
                const [okPluginMap, , parsedPluginMap] = await tryFn(() => Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap));
                pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
            }
            const [okUnmap, , unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody, mapFromMeta, pluginMapFromMeta));
            const result = okUnmap ? { ...unmappedBody, id } : { id };
            Object.keys(result).forEach(k => { result[k] = fixValue(result[k]); });
            return result;
        }
        if (behavior === 'user-managed' && body && body.trim() !== '') {
            const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
            if (okBody) {
                let pluginMapFromMeta = null;
                if (metadata && metadata._pluginmap) {
                    const [okPluginMap, , parsedPluginMap] = await tryFn(() => Promise.resolve(typeof metadata._pluginmap === 'string' ? JSON.parse(metadata._pluginmap) : metadata._pluginmap));
                    pluginMapFromMeta = okPluginMap ? parsedPluginMap : null;
                }
                const [okUnmap, , unmappedBodyRaw] = await tryFn(async () => this.schema.unmapper(parsedBody, undefined, pluginMapFromMeta));
                const unmappedBody = unmappedBodyRaw;
                const bodyData = okUnmap ? unmappedBody : {};
                const merged = { ...bodyData, ...unmappedMetadata, id };
                Object.keys(merged).forEach(k => { merged[k] = fixValue(merged[k]); });
                return filterInternalFields(merged);
            }
        }
        const result = { ...unmappedMetadata, id };
        Object.keys(result).forEach(k => { result[k] = fixValue(result[k]); });
        const filtered = filterInternalFields(result);
        if (behaviorFlags.$truncated) {
            filtered.$truncated = behaviorFlags.$truncated;
        }
        if (behaviorFlags.$overflow) {
            filtered.$overflow = behaviorFlags.$overflow;
        }
        return filtered;
    }
    _normalizeGuard(guard) {
        const tempGuards = new ResourceGuards(this, { guard });
        return tempGuards.getGuard();
    }
    async executeGuard(operation, context, resource = null) {
        return this._guards.execute(operation, context, resource);
    }
    _checkRolesScopes(requiredRolesScopes, user) {
        return this._guards._checkRolesScopes(requiredRolesScopes, user);
    }
    _initMiddleware() {
        if (!this._middleware) {
            this._middleware = new ResourceMiddleware(this);
        }
        this._middleware.init();
    }
    useMiddleware(method, fn) {
        this._middleware.use(method, fn);
    }
    applyDefaults(data) {
        return this.validator.applyDefaults(data);
    }
    async getSequenceValue(fieldName = 'id') {
        return this._idGenerator.getSequenceValue(fieldName);
    }
    async resetSequence(fieldName, value) {
        return this._idGenerator.resetSequence(fieldName, value);
    }
    async listSequences() {
        return this._idGenerator.listSequences();
    }
    async reserveIdBatch(count = 100) {
        return this._idGenerator.reserveIdBatch(count);
    }
    getBatchStatus(fieldName = 'id') {
        return this._idGenerator.getBatchStatus(fieldName);
    }
    releaseBatch(fieldName = 'id') {
        this._idGenerator.releaseBatch(fieldName);
    }
    dispose() {
        if (this.schema) {
            this.schema.dispose();
        }
        this.emit('resource:disposed', { resourceName: this.name });
        this.removeAllListeners();
    }
}

class DatabaseResources {
    database;
    metadata;
    coordinators;
    constructor(database, metadata, coordinators) {
        this.database = database;
        this.metadata = metadata;
        this.coordinators = coordinators;
    }
    resourceExists(name) {
        return !!this.database._resourcesMap[name];
    }
    resourceExistsWithSameHash({ name, attributes, behavior = 'user-managed', partitions = {} }) {
        const db = this.database;
        if (!db._resourcesMap[name]) {
            return { exists: false, sameHash: false, hash: null };
        }
        const existingResource = db._resourcesMap[name];
        const existingHash = this.metadata.generateDefinitionHash(existingResource.export());
        const mockResource = new Resource({
            name,
            attributes,
            behavior,
            partitions,
            client: db.client,
            version: existingResource.version,
            passphrase: db.passphrase,
            bcryptRounds: db.bcryptRounds,
            versioningEnabled: db.versioningEnabled
        });
        const newHash = this.metadata.generateDefinitionHash(mockResource.export());
        return {
            exists: true,
            sameHash: existingHash === newHash,
            hash: newHash,
            existingHash
        };
    }
    async createResource({ name, attributes, behavior = 'user-managed', hooks, middlewares, ...config }) {
        const db = this.database;
        const normalizedPartitions = this._normalizePartitions(config.partitions || [], attributes);
        if (db._resourcesMap[name]) {
            const existingResource = db._resourcesMap[name];
            Object.assign(existingResource.config, {
                cache: db.cache,
                ...config,
                partitions: normalizedPartitions
            });
            if (behavior) {
                existingResource.behavior = behavior;
            }
            existingResource.versioningEnabled = db.versioningEnabled;
            existingResource.updateAttributes(attributes);
            if (hooks) {
                for (const [event, hooksArr] of Object.entries(hooks)) {
                    if (Array.isArray(hooksArr) && existingResource.hooks[event]) {
                        for (const fn of hooksArr) {
                            if (typeof fn === 'function') {
                                existingResource.hooks[event].push(fn.bind(existingResource));
                            }
                        }
                    }
                }
            }
            if (middlewares) {
                this._applyMiddlewares(existingResource, middlewares);
            }
            const disableEventsFlag = config.disableEvents !== undefined ? config.disableEvents : db.disableResourceEvents;
            existingResource.eventsDisabled = disableEventsFlag;
            const newHash = this.metadata.generateDefinitionHash(existingResource.export(), existingResource.behavior);
            const existingMetadata = db.savedMetadata?.resources?.[name];
            const currentVersion = existingMetadata?.currentVersion || 'v1';
            const existingVersionData = existingMetadata?.versions?.[currentVersion];
            if (!existingVersionData || existingVersionData.hash !== newHash) {
                await this.metadata.scheduleMetadataUpload();
            }
            db.emit('db:resource-updated', name);
            return existingResource;
        }
        const existingMetadata = db.savedMetadata?.resources?.[name];
        const version = existingMetadata?.currentVersion || 'v1';
        const resource = new Resource({
            name,
            client: db.client,
            version: config.version !== undefined ? config.version : version,
            attributes,
            behavior,
            passphrase: config.passphrase !== undefined ? config.passphrase : db.passphrase,
            bcryptRounds: config.bcryptRounds !== undefined ? config.bcryptRounds : db.bcryptRounds,
            observers: [db],
            cache: config.cache !== undefined ? config.cache : db.cache,
            timestamps: config.timestamps !== undefined ? config.timestamps : false,
            partitions: normalizedPartitions,
            paranoid: config.paranoid !== undefined ? config.paranoid : true,
            allNestedObjectsOptional: config.allNestedObjectsOptional !== undefined ? config.allNestedObjectsOptional : true,
            autoDecrypt: config.autoDecrypt !== undefined ? config.autoDecrypt : true,
            hooks: hooks || {},
            versioningEnabled: db.versioningEnabled,
            strictValidation: config.strictValidation !== undefined ? config.strictValidation : db.strictValidation,
            map: config.map,
            idGenerator: config.idGenerator,
            idSize: config.idSize,
            asyncEvents: config.asyncEvents,
            asyncPartitions: config.asyncPartitions !== undefined ? config.asyncPartitions : true,
            events: config.events || {},
            disableEvents: config.disableEvents !== undefined ? config.disableEvents : db.disableResourceEvents,
            createdBy: config.createdBy || 'user',
            api: config.api,
            description: config.description
        });
        resource.database = db;
        db._resourcesMap[name] = resource;
        if (middlewares) {
            this._applyMiddlewares(resource, middlewares);
        }
        await this.metadata.scheduleMetadataUpload();
        db.emit('db:resource-created', name);
        db.emit('db:resource:metrics', {
            resource: name,
            ...this.coordinators.collectMemorySnapshot()
        });
        return resource;
    }
    async listResources() {
        return Object.values(this.database.resources).map(r => r.export());
    }
    async getResource(name) {
        if (!this.database._resourcesMap[name]) {
            throw new ResourceNotFound({
                bucket: this.database.client.config?.bucket,
                resourceName: name,
                id: name
            });
        }
        return this.database._resourcesMap[name];
    }
    _normalizePartitions(partitions, attributes) {
        if (!Array.isArray(partitions)) {
            return partitions || {};
        }
        const normalized = {};
        for (const fieldName of partitions) {
            if (typeof fieldName !== 'string') {
                throw new SchemaError('Invalid partition field type', {
                    fieldName,
                    receivedType: typeof fieldName,
                    retriable: false,
                    suggestion: 'Use string field names when declaring partitions (e.g. ["status", "region"]).'
                });
            }
            if (!attributes[fieldName]) {
                throw new SchemaError(`Partition field '${fieldName}' not found in attributes`, {
                    fieldName,
                    availableFields: Object.keys(attributes),
                    retriable: false,
                    suggestion: 'Ensure the partition field exists in the resource attributes definition.'
                });
            }
            const partitionName = `by${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
            const fieldDef = attributes[fieldName];
            let fieldType = 'string';
            if (typeof fieldDef === 'string') {
                fieldType = fieldDef.split('|')[0].trim();
            }
            else if (typeof fieldDef === 'object' && fieldDef?.type) {
                fieldType = fieldDef.type;
            }
            normalized[partitionName] = {
                fields: {
                    [fieldName]: fieldType
                }
            };
        }
        return normalized;
    }
    _applyMiddlewares(resource, middlewares) {
        if (Array.isArray(middlewares)) {
            const methods = resource._middlewareMethods || [
                'get', 'list', 'listIds', 'getAll', 'count', 'page',
                'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
                'content', 'hasContent', 'query', 'getFromPartition', 'setContent',
                'deleteContent', 'replace', 'patch'
            ];
            for (const method of methods) {
                for (const middleware of middlewares) {
                    if (typeof middleware === 'function') {
                        resource.useMiddleware(method, middleware);
                    }
                }
            }
            return;
        }
        if (typeof middlewares === 'object' && middlewares !== null) {
            for (const [method, fns] of Object.entries(middlewares)) {
                if (method === '*') {
                    const methods = resource._middlewareMethods || [
                        'get', 'list', 'listIds', 'getAll', 'count', 'page',
                        'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
                        'content', 'hasContent', 'query', 'getFromPartition', 'setContent',
                        'deleteContent', 'replace', 'patch'
                    ];
                    const middlewareArray = Array.isArray(fns) ? fns : [fns];
                    for (const targetMethod of methods) {
                        for (const middleware of middlewareArray) {
                            if (typeof middleware === 'function') {
                                resource.useMiddleware(targetMethod, middleware);
                            }
                        }
                    }
                }
                else {
                    const middlewareArray = Array.isArray(fns) ? fns : [fns];
                    for (const middleware of middlewareArray) {
                        if (typeof middleware === 'function') {
                            resource.useMiddleware(method, middleware);
                        }
                    }
                }
            }
        }
    }
}

class DatabaseConnection {
    database;
    metadata;
    recovery;
    plugins;
    coordinators;
    _exitListenerRegistered;
    _exitListener;
    constructor(database, metadata, recovery, plugins, coordinators) {
        this.database = database;
        this.metadata = metadata;
        this.recovery = recovery;
        this.plugins = plugins;
        this.coordinators = coordinators;
        this._exitListenerRegistered = false;
        this._exitListener = null;
    }
    registerExitListener() {
        if (!this._exitListenerRegistered && typeof process !== 'undefined') {
            this._exitListenerRegistered = true;
            this._exitListener = async () => {
                if (this.database.isConnected()) {
                    await tryFn(() => this.disconnect());
                }
            };
            bumpProcessMaxListeners(1);
            process.on('exit', this._exitListener);
        }
    }
    isConnected() {
        return !!this.database.savedMetadata;
    }
    async connect() {
        const db = this.database;
        db.logger.debug({ databaseId: db.id }, 'connecting to database');
        this.registerExitListener();
        await this.plugins.startPlugins();
        let metadata = null;
        let needsHealing = false;
        const healingLog = [];
        if (await db.client.exists('s3db.json')) {
            const [ok] = await tryFn(async () => {
                const request = await db.client.getObject('s3db.json');
                const rawContent = await streamToString(request?.Body);
                const [parseOk, , parsedData] = tryFnSync(() => JSON.parse(rawContent));
                if (!parseOk) {
                    healingLog.push('JSON parsing failed - attempting recovery');
                    needsHealing = true;
                    metadata = await this.recovery.attemptJsonRecovery(rawContent, healingLog);
                    if (!metadata) {
                        await this.recovery.createCorruptedBackup(rawContent);
                        healingLog.push('Created backup of corrupted file - starting with blank metadata');
                        metadata = this.metadata.blankMetadataStructure();
                    }
                }
                else {
                    metadata = parsedData;
                }
                const healedMetadata = await this.recovery.validateAndHealMetadata(metadata, healingLog);
                if (healedMetadata !== metadata) {
                    metadata = healedMetadata;
                    needsHealing = true;
                }
            });
            if (!ok) {
                healingLog.push(`Critical error reading s3db.json: unknown error`);
                await this.recovery.createCorruptedBackup();
                metadata = this.metadata.blankMetadataStructure();
                needsHealing = true;
            }
        }
        else {
            metadata = this.metadata.blankMetadataStructure();
            await this.metadata.uploadMetadataFile();
        }
        if (needsHealing) {
            await this.recovery.uploadHealedMetadata(metadata, healingLog);
        }
        db.savedMetadata = metadata;
        const definitionChanges = this.metadata.detectDefinitionChanges(metadata);
        let registryUploadNeeded = false;
        for (const [name, resourceMetadata] of Object.entries(metadata.resources || {})) {
            const currentVersion = resourceMetadata.currentVersion || 'v1';
            const versionData = resourceMetadata.versions?.[currentVersion];
            if (versionData) {
                let restoredIdGenerator;
                let restoredIdSize;
                if (versionData.idGenerator !== undefined) {
                    if (versionData.idGenerator === 'custom_function') {
                        restoredIdGenerator = undefined;
                        restoredIdSize = versionData.idSize || 22;
                    }
                    else if (typeof versionData.idGenerator === 'number') {
                        restoredIdGenerator = versionData.idGenerator;
                        restoredIdSize = versionData.idSize || versionData.idGenerator;
                    }
                    else {
                        restoredIdSize = versionData.idSize || 22;
                    }
                }
                else {
                    restoredIdSize = versionData.idSize || 22;
                }
                db._resourcesMap[name] = new Resource({
                    name,
                    client: db.client,
                    database: db,
                    version: currentVersion,
                    attributes: versionData.attributes,
                    behavior: versionData.behavior || 'user-managed',
                    passphrase: db.passphrase,
                    bcryptRounds: db.bcryptRounds,
                    observers: [db],
                    cache: db.cache,
                    timestamps: versionData.timestamps !== undefined ? versionData.timestamps : false,
                    partitions: resourceMetadata.partitions || versionData.partitions || {},
                    paranoid: versionData.paranoid !== undefined ? versionData.paranoid : true,
                    allNestedObjectsOptional: versionData.allNestedObjectsOptional !== undefined ? versionData.allNestedObjectsOptional : true,
                    autoDecrypt: versionData.autoDecrypt !== undefined ? versionData.autoDecrypt : true,
                    asyncEvents: versionData.asyncEvents !== undefined ? versionData.asyncEvents : true,
                    hooks: {},
                    versioningEnabled: db.versioningEnabled,
                    strictValidation: db.strictValidation,
                    map: versionData.map,
                    idGenerator: restoredIdGenerator,
                    idSize: restoredIdSize,
                    schemaRegistry: resourceMetadata.schemaRegistry,
                    pluginSchemaRegistry: resourceMetadata.pluginSchemaRegistry
                });
                if (db._resourcesMap[name].schema?.needsRegistryPersistence()) {
                    registryUploadNeeded = true;
                }
            }
        }
        if (definitionChanges.length > 0) {
            db.emit('db:resource-definitions-changed', {
                changes: definitionChanges,
                metadata: db.savedMetadata
            });
        }
        if (registryUploadNeeded) {
            await this.metadata.scheduleMetadataUpload();
        }
        db.logger.info({
            databaseId: db.id,
            resourceCount: Object.keys(db.resources).length,
            pluginCount: Object.keys(db.pluginRegistry).length
        }, 'database connected');
        db.emit('db:connected', new Date());
    }
    async disconnect() {
        const db = this.database;
        db.logger.debug({ databaseId: db.id }, 'disconnecting from database');
        await this.metadata.flushMetadata();
        await db.emit('disconnected', new Date());
        await tryFn(async () => {
            await this.coordinators.stopAll();
            if (db.pluginList && db.pluginList.length > 0) {
                for (const plugin of db.pluginList) {
                    if (plugin && typeof plugin.removeAllListeners === 'function') {
                        plugin.removeAllListeners();
                    }
                }
                const stopConcurrency = Math.max(1, Number.isFinite(db.executorPool?.concurrency) ? db.executorPool.concurrency : 5);
                await TasksPool.map(db.pluginList, async (plugin) => {
                    await tryFn(async () => {
                        if (plugin && typeof plugin.stop === 'function') {
                            await plugin.stop();
                        }
                    });
                }, { concurrency: stopConcurrency });
            }
            if (db.resources && Object.keys(db.resources).length > 0) {
                for (const [, resource] of Object.entries(db.resources)) {
                    await tryFn(() => {
                        if (resource && typeof resource.dispose === 'function') {
                            resource.dispose();
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
                Object.keys(db.resources).forEach(k => delete db._resourcesMap[k]);
            }
            if (db.client) {
                if (typeof db.client.removeAllListeners === 'function') {
                    db.client.removeAllListeners();
                }
                if (typeof db.client.destroy === 'function') {
                    db.client.destroy();
                }
            }
            await db.emit('db:disconnected', new Date());
            if (typeof db.removeAllListeners === 'function') {
                db.removeAllListeners();
            }
            if (this._exitListener && typeof process !== 'undefined') {
                process.off('exit', this._exitListener);
                this._exitListener = null;
                this._exitListenerRegistered = false;
            }
            if (db.processManager && typeof db.processManager.removeSignalHandlers === 'function') {
                db.processManager.removeSignalHandlers();
            }
            if (db.cronManager && typeof db.cronManager.removeSignalHandlers === 'function') {
                db.cronManager.removeSignalHandlers();
                if (typeof db.cronManager.shutdown === 'function') {
                    await db.cronManager.shutdown();
                }
            }
            db.savedMetadata = null;
            db.plugins = {};
            db.pluginList = [];
        });
    }
}

class Database extends SafeEventEmitter {
    id;
    version;
    s3dbVersion;
    resources;
    savedMetadata;
    databaseOptions;
    executorPool;
    taskExecutor;
    pluginList;
    pluginRegistry;
    plugins;
    cache;
    passphrase;
    bcryptRounds;
    versioningEnabled;
    strictValidation;
    strictHooks;
    disableResourceEvents;
    deferMetadataWrites;
    metadataWriteDelay;
    processManager;
    cronManager;
    logLevel;
    logger;
    client;
    connectionString;
    bucket;
    keyPrefix;
    _resourcesMap;
    _parallelism;
    _childLoggerLevels;
    _hooksModule;
    _coordinatorsModule;
    _recoveryModule;
    _metadataModule;
    _pluginsModule;
    _resourcesModule;
    _connectionModule;
    constructor(options) {
        super({
            logLevel: options.logLevel || options.loggerOptions?.level || 'info',
            autoCleanup: options.autoCleanup !== false
        });
        this.id = (() => {
            const [ok, , id] = tryFnSync(() => idGenerator(7));
            return ok && id ? id : `db-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        })();
        this.version = '1';
        this.s3dbVersion = (() => {
            const [ok, , version] = tryFnSync(() => (typeof globalThis['19.2.4'] !== 'undefined' && globalThis['19.2.4'] !== '19.2.4'
                ? globalThis['19.2.4']
                : 'latest'));
            return ok ? version : 'latest';
        })();
        this._resourcesMap = {};
        this.resources = new Proxy(this._resourcesMap, {
            get: (target, prop) => {
                if (typeof prop === 'symbol' || prop === 'constructor' || prop === 'toJSON') {
                    return target[prop];
                }
                if (target[prop]) {
                    return target[prop];
                }
                return undefined;
            },
            ownKeys: (target) => {
                return Object.keys(target);
            },
            getOwnPropertyDescriptor: (target, prop) => {
                return Object.getOwnPropertyDescriptor(target, prop);
            }
        });
        this.savedMetadata = null;
        this.databaseOptions = options;
        const executorPoolConfig = options?.executorPool ?? options?.operationsPool;
        this._parallelism = this._normalizeParallelism(options?.parallelism ?? executorPoolConfig?.concurrency, 10);
        this.logLevel = options.logLevel || options.loggerOptions?.level || 'info';
        const loggerOptions = { ...(options.loggerOptions || {}) };
        if (options.logLevel) {
            loggerOptions.level = options.logLevel;
        }
        if (options.logger) {
            this.logger = options.logger;
            if (options.logLevel) {
                this.logger.level = options.logLevel;
            }
        }
        else {
            const loggerConfig = getLoggerOptionsFromEnv(loggerOptions);
            this.logger = createLogger({
                name: 'Database',
                ...loggerConfig
            });
        }
        this._childLoggerLevels = options.loggerOptions?.childLevels || {};
        if (options?.operationsPool && !options?.executorPool) {
            this.logger.warn('⚠️  "operationsPool" is deprecated in s3db.js v16.x. ' +
                'Use "executorPool" instead. ' +
                'Migration: https://s3db.js/docs/migration/v16-to-v17');
        }
        this.executorPool = this._normalizeOperationsPool(executorPoolConfig, this._parallelism);
        if (options?.taskExecutorMonitoring) {
            this.executorPool.monitoring = this._deepMerge(this.executorPool.monitoring || {}, options.taskExecutorMonitoring);
        }
        this._parallelism = this.executorPool?.concurrency ?? this._parallelism;
        this.taskExecutor = this.executorPool;
        this.pluginList = options.plugins ?? [];
        this.pluginRegistry = {};
        this.plugins = this.pluginRegistry;
        this.cache = options.cache;
        this.passphrase = options.passphrase ?? 'secret';
        this.bcryptRounds = options.bcryptRounds ?? 10;
        this.versioningEnabled = options.versioningEnabled ?? false;
        this.strictValidation = (options.strictValidation ?? true) !== false;
        this.strictHooks = options.strictHooks ?? false;
        this.disableResourceEvents = options.disableResourceEvents === true;
        this.deferMetadataWrites = options.deferMetadataWrites ?? false;
        this.metadataWriteDelay = options.metadataWriteDelay ?? 100;
        const exitOnSignal = (options.exitOnSignal ?? true) !== false;
        this.processManager = options.processManager ?? new ProcessManager({
            logLevel: this.logger.level,
            exitOnSignal
        });
        this.cronManager = options.cronManager ?? new CronManager({
            logLevel: this.logger.level,
            exitOnSignal
        });
        this._initializeClient(options);
        this._hooksModule = new DatabaseHooks(this);
        this._coordinatorsModule = new DatabaseCoordinators(this);
        this._recoveryModule = new DatabaseRecovery(this);
        this._metadataModule = new DatabaseMetadata(this);
        this._pluginsModule = new DatabasePlugins(this, this._coordinatorsModule);
        this._resourcesModule = new DatabaseResources(this, this._metadataModule, this._coordinatorsModule);
        this._connectionModule = new DatabaseConnection(this, this._metadataModule, this._recoveryModule, this._pluginsModule, this._coordinatorsModule);
        this._connectionModule.registerExitListener();
    }
    _initializeClient(options) {
        let connectionString = options.connectionString;
        if (!connectionString && (options.bucket || options.accessKeyId || options.secretAccessKey)) {
            const { bucket, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle } = options;
            if (endpoint) {
                const url = new URL(endpoint);
                if (accessKeyId)
                    url.username = encodeURIComponent(accessKeyId);
                if (secretAccessKey)
                    url.password = encodeURIComponent(secretAccessKey);
                url.pathname = `/${bucket || 's3db'}`;
                if (forcePathStyle) {
                    url.searchParams.set('forcePathStyle', 'true');
                }
                connectionString = url.toString();
            }
            else if (accessKeyId && secretAccessKey) {
                const params = new URLSearchParams();
                params.set('region', region || 'us-east-1');
                if (forcePathStyle) {
                    params.set('forcePathStyle', 'true');
                }
                connectionString = `s3://${encodeURIComponent(accessKeyId)}:${encodeURIComponent(secretAccessKey)}@${bucket || 's3db'}?${params.toString()}`;
            }
        }
        let mergedClientOptions = {};
        let connStr = null;
        if (options.clientOptions) {
            mergedClientOptions = { ...options.clientOptions };
        }
        if (connectionString) {
            try {
                connStr = new ConnectionString(connectionString);
                if (connStr.clientOptions && Object.keys(connStr.clientOptions).length > 0) {
                    mergedClientOptions = this._deepMerge(mergedClientOptions, connStr.clientOptions);
                }
            }
            catch {
                // If parsing fails, continue without querystring params
            }
        }
        if (!options.client && connectionString) {
            try {
                const url = new URL(connectionString);
                if (url.protocol === 'memory:') {
                    const bucketHost = url.hostname || 'test-bucket';
                    const [okBucket, , decodedBucket] = tryFnSync(() => decodeURIComponent(bucketHost));
                    const bucket = okBucket ? decodedBucket : bucketHost;
                    const rawPrefix = url.pathname ? url.pathname.substring(1) : '';
                    const [okPrefix, , decodedPrefix] = tryFnSync(() => decodeURIComponent(rawPrefix));
                    const keyPrefix = okPrefix ? decodedPrefix : rawPrefix;
                    const memoryOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
                        bucket,
                        keyPrefix,
                        logLevel: this.logger.level,
                    }, mergedClientOptions));
                    this.client = new MemoryClient(memoryOptions);
                }
                else if (url.protocol === 'file:') {
                    const filesystemOptions = this._applyTaskExecutorMonitoring(this._deepMerge({
                        basePath: connStr?.basePath,
                        bucket: connStr?.bucket,
                        keyPrefix: connStr?.keyPrefix,
                        logLevel: this.logger.level,
                    }, mergedClientOptions));
                    this.client = new FileSystemClient(filesystemOptions);
                }
                else {
                    const s3ClientOptions = this._deepMerge({
                        logLevel: this.logger.level,
                        logger: this.getChildLogger('S3Client'),
                        connectionString: connectionString,
                    }, mergedClientOptions);
                    s3ClientOptions.executorPool = this._deepMerge(s3ClientOptions.executorPool || {}, this.executorPool);
                    this.client = new S3Client(s3ClientOptions);
                }
            }
            catch {
                const s3ClientOptions = this._deepMerge({
                    logLevel: this.logger.level,
                    logger: this.getChildLogger('S3Client'),
                    connectionString: connectionString,
                }, mergedClientOptions);
                s3ClientOptions.executorPool = this._deepMerge(s3ClientOptions.executorPool || {}, this.executorPool);
                this.client = new S3Client(s3ClientOptions);
            }
        }
        else if (!options.client) {
            const s3ClientOptions = this._deepMerge({
                logLevel: this.logger.level,
                logger: this.getChildLogger('S3Client'),
            }, mergedClientOptions);
            s3ClientOptions.executorPool = this._deepMerge(s3ClientOptions.executorPool || {}, this.executorPool);
            this.client = new S3Client(s3ClientOptions);
        }
        else {
            this.client = options.client;
        }
        const resolvedConnectionString = connectionString || this._inferConnectionStringFromClient(this.client);
        this.connectionString = resolvedConnectionString;
        if (!this.databaseOptions.connectionString && resolvedConnectionString) {
            this.databaseOptions.connectionString = resolvedConnectionString;
        }
        this.bucket = this.client.bucket || '';
        this.keyPrefix = this.client.keyPrefix || '';
    }
    get parallelism() {
        return this._parallelism ?? 10;
    }
    set parallelism(value) {
        const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
        this._parallelism = normalized;
        if (this.executorPool) {
            this.executorPool.concurrency = normalized;
        }
    }
    setConcurrency(value) {
        const normalized = this._normalizeParallelism(value, this._parallelism ?? 10);
        this._parallelism = normalized;
        if (this.executorPool) {
            this.executorPool.concurrency = normalized;
        }
    }
    get operationsPool() {
        return this.executorPool;
    }
    get config() {
        return {
            version: this.version,
            s3dbVersion: this.s3dbVersion,
            bucket: this.bucket,
            keyPrefix: this.keyPrefix,
            taskExecutor: this.taskExecutor,
            logLevel: this.logger.level
        };
    }
    getChildLogger(name, bindings = {}) {
        const childLogger = this.logger.child({
            name,
            ...bindings
        });
        const levelOverride = this._childLoggerLevels[name];
        if (levelOverride) {
            childLogger.level = levelOverride;
        }
        return childLogger;
    }
    setChildLevel(name, level) {
        this._childLoggerLevels[name] = level;
    }
    async connect() {
        return this._connectionModule.connect();
    }
    async disconnect() {
        return this._connectionModule.disconnect();
    }
    isConnected() {
        return this._connectionModule.isConnected();
    }
    async startPlugins() {
        return this._pluginsModule.startPlugins();
    }
    async usePlugin(plugin, name = null) {
        return this._pluginsModule.usePlugin(plugin, name);
    }
    async uninstallPlugin(name, options = {}) {
        return this._pluginsModule.uninstallPlugin(name, options);
    }
    async getGlobalCoordinator(namespace, options = {}) {
        return this._coordinatorsModule.getGlobalCoordinator(namespace, options);
    }
    async createResource(config) {
        return this._resourcesModule.createResource(config);
    }
    async listResources() {
        return this._resourcesModule.listResources();
    }
    async getResource(name) {
        return this._resourcesModule.getResource(name);
    }
    resourceExists(name) {
        return this._resourcesModule.resourceExists(name);
    }
    resourceExistsWithSameHash(params) {
        return this._resourcesModule.resourceExistsWithSameHash(params);
    }
    async uploadMetadataFile() {
        return this._metadataModule.uploadMetadataFile();
    }
    async flushMetadata() {
        return this._metadataModule.flushMetadata();
    }
    blankMetadataStructure() {
        return this._metadataModule.blankMetadataStructure();
    }
    detectDefinitionChanges(savedMetadata) {
        return this._metadataModule.detectDefinitionChanges(savedMetadata);
    }
    generateDefinitionHash(definition, behavior) {
        return this._metadataModule.generateDefinitionHash(definition, behavior);
    }
    getNextVersion(versions = {}) {
        return this._metadataModule.getNextVersion(versions);
    }
    addHook(event, fn) {
        return this._hooksModule.addHook(event, fn);
    }
    removeHook(event, fn) {
        return this._hooksModule.removeHook(event, fn);
    }
    getHooks(event) {
        return this._hooksModule.getHooks(event);
    }
    clearHooks(event) {
        return this._hooksModule.clearHooks(event);
    }
    _deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] !== undefined) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    result[key] = this._deepMerge(result[key] || {}, source[key]);
                }
                else {
                    result[key] = source[key];
                }
            }
        }
        return result;
    }
    _applyTaskExecutorMonitoring(config) {
        if (!this.databaseOptions?.taskExecutorMonitoring) {
            return config;
        }
        const merged = { ...config };
        merged.taskExecutorMonitoring = this._deepMerge(this.databaseOptions.taskExecutorMonitoring, merged.taskExecutorMonitoring || {});
        return merged;
    }
    _normalizeParallelism(value, fallback = 10) {
        if (value === undefined || value === null || value === '') {
            return fallback;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return fallback;
            }
            if (trimmed.toLowerCase() === 'auto') {
                return fallback;
            }
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed) && parsed > 0) {
                return Math.floor(parsed);
            }
            return fallback;
        }
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value);
        }
        return fallback;
    }
    _normalizeOperationsPool(config, defaultConcurrency = 10) {
        if (config === false || config?.enabled === false) {
            return { enabled: false, concurrency: this._normalizeParallelism(undefined, defaultConcurrency) };
        }
        const normalizedConcurrency = this._normalizeParallelism(config?.concurrency, defaultConcurrency);
        return {
            enabled: true,
            concurrency: normalizedConcurrency,
            retries: config?.retries ?? 3,
            retryDelay: config?.retryDelay ?? 1000,
            timeout: config?.timeout ?? 30000,
            retryableErrors: config?.retryableErrors ?? [],
            autotune: config?.autotune ?? null,
            monitoring: config?.monitoring ?? { collectMetrics: true },
        };
    }
    _inferConnectionStringFromClient(client) {
        if (!client) {
            return undefined;
        }
        if (client.connectionString) {
            return client.connectionString;
        }
        if (client instanceof MemoryClient) {
            const bucket = encodeURIComponent(client.bucket || 's3db');
            const encodedPrefix = client.keyPrefix
                ? client.keyPrefix
                    .split('/')
                    .filter(Boolean)
                    .map((segment) => encodeURIComponent(segment))
                    .join('/')
                : '';
            const prefixPath = encodedPrefix ? `/${encodedPrefix}` : '';
            return `memory://${bucket}${prefixPath}`;
        }
        if (client instanceof FileSystemClient) {
            if (client.basePath) {
                return `file://${encodeURI(client.basePath)}`;
            }
        }
        return undefined;
    }
}
class S3db extends Database {
}

async function mapWithConcurrency(items, fn, options = {}) {
    const { concurrency = 10, onError = null } = options;
    const results = [];
    const errors = [];
    const executing = new Set();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const promise = (async () => {
            try {
                const result = await fn(item, i);
                results.push(result);
                return result;
            }
            catch (error) {
                const err = error;
                if (onError) {
                    await onError(err, item);
                }
                errors.push({ item, index: i, message: err.message, raw: err });
                return null;
            }
        })();
        executing.add(promise);
        promise.finally(() => executing.delete(promise));
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);
    return { results, errors };
}

class TaskExecutor {
}

class Benchmark {
    name;
    startTime;
    endTime;
    results;
    constructor(name) {
        this.name = name;
        this.startTime = null;
        this.endTime = null;
        this.results = [];
    }
    start() {
        this.startTime = Date.now();
    }
    end() {
        this.endTime = Date.now();
        return this.elapsed();
    }
    elapsed() {
        if (this.startTime === null || this.endTime === null) {
            return 0;
        }
        return this.endTime - this.startTime;
    }
    async measure(fn) {
        this.start();
        const result = await fn();
        this.end();
        this.results.push({
            duration: this.elapsed(),
            timestamp: Date.now()
        });
        return result;
    }
    async measureRepeated(fn, iterations = 10) {
        const results = [];
        for (let i = 0; i < iterations; i++) {
            this.start();
            await fn();
            this.end();
            results.push(this.elapsed());
        }
        return {
            iterations,
            results,
            avg: results.reduce((a, b) => a + b, 0) / results.length,
            min: Math.min(...results),
            max: Math.max(...results),
            p50: this.percentile(results, 0.5),
            p95: this.percentile(results, 0.95),
            p99: this.percentile(results, 0.99)
        };
    }
    percentile(arr, p) {
        if (arr.length === 0)
            return 0;
        const sorted = arr.slice().sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * p) - 1;
        return sorted[Math.max(0, index)];
    }
    report() {
        console.log(`\n[Benchmark] ${this.name}`);
        console.log(`  Duration: ${this.elapsed()}ms`);
        console.log(`  Runs: ${this.results.length}`);
        if (this.results.length > 1) {
            const durations = this.results.map((r) => r.duration);
            console.log(`  Avg: ${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)}ms`);
            console.log(`  Min: ${Math.min(...durations)}ms`);
            console.log(`  Max: ${Math.max(...durations)}ms`);
        }
    }
}
async function benchmark(name, fn) {
    const b = new Benchmark(name);
    await b.measure(fn);
    b.report();
    return b;
}

class PerformanceMonitor {
    db;
    snapshots;
    intervalId;
    constructor(database) {
        this.db = database;
        this.snapshots = [];
        this.intervalId = null;
    }
    start(intervalMs = 10000) {
        this.intervalId = setInterval(() => {
            this.takeSnapshot();
        }, intervalMs);
        if (this.intervalId.unref) {
            this.intervalId.unref();
        }
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    takeSnapshot() {
        const client = this.db?.client;
        const snapshot = {
            timestamp: Date.now(),
            taskQueue: client?.getQueueStats ? client.getQueueStats() : null,
            performance: client?.getAggregateMetrics ? client.getAggregateMetrics() : null,
            system: {
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage(),
                uptime: process.uptime()
            }
        };
        this.snapshots.push(snapshot);
        if (this.snapshots.length > 100) {
            this.snapshots.shift();
        }
        if (snapshot.taskQueue) {
            console.log(`[PerformanceMonitor] ${new Date().toISOString()}`);
            console.log(`  Queue: ${snapshot.taskQueue.queueSize} pending, ${snapshot.taskQueue.activeCount} active`);
            if (snapshot.performance) {
                console.log(`  Performance: ${snapshot.performance.avgExecution.toFixed(0)}ms avg, ${snapshot.performance.p95Execution.toFixed(0)}ms p95`);
            }
            const configured = snapshot.taskQueue.concurrency;
            const effective = snapshot.taskQueue.effectiveConcurrency;
            const concurrencyLabel = configured && effective && configured !== effective
                ? `${configured} (effective ${effective})`
                : configured ?? effective ?? 'n/a';
            console.log(`  Concurrency: ${concurrencyLabel}`);
            console.log(`  Memory: ${(snapshot.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`);
        }
        return snapshot;
    }
    getReport() {
        if (this.snapshots.length === 0)
            return null;
        const first = this.snapshots[0];
        const last = this.snapshots[this.snapshots.length - 1];
        let taskQueue = null;
        if (first.taskQueue && last.taskQueue) {
            taskQueue = {
                totalProcessed: last.taskQueue.processedCount - first.taskQueue.processedCount,
                totalErrors: last.taskQueue.errorCount - first.taskQueue.errorCount,
                avgQueueSize: this._avg(this.snapshots.map((s) => s.taskQueue?.queueSize || 0)),
                avgConcurrency: this._avg(this.snapshots.map((s) => s.taskQueue?.effectiveConcurrency ??
                    s.taskQueue?.concurrency ??
                    0))
            };
        }
        let performance = null;
        if (this.snapshots.some((s) => s.performance)) {
            const perfSnapshots = this.snapshots.filter((s) => s.performance);
            performance = {
                avgLatency: this._avg(perfSnapshots.map((s) => s.performance.avgExecution)),
                p95Latency: this._avg(perfSnapshots.map((s) => s.performance.p95Execution))
            };
        }
        const system = {
            avgMemoryMB: this._avg(this.snapshots.map((s) => s.system.memoryUsage.heapUsed)) / 1024 / 1024,
            peakMemoryMB: Math.max(...this.snapshots.map((s) => s.system.memoryUsage.heapUsed)) / 1024 / 1024
        };
        return {
            duration: last.timestamp - first.timestamp,
            snapshots: this.snapshots.length,
            taskQueue,
            performance,
            system
        };
    }
    _avg(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
}

/**
 * Fixed-size circular buffer for efficient rolling metrics.
 * Used by GlobalCoordinatorService for latency percentile tracking.
 *
 * Inspired by etcd's histogram-based metrics but implemented as a simple
 * ring buffer to avoid external dependencies.
 */
class RingBuffer {
    capacity;
    buffer;
    head = 0;
    _count = 0;
    constructor(capacity) {
        this.capacity = capacity;
        if (capacity < 1) {
            throw new Error('RingBuffer capacity must be at least 1');
        }
        this.buffer = new Array(capacity);
    }
    push(value) {
        this.buffer[this.head] = value;
        this.head = (this.head + 1) % this.capacity;
        if (this._count < this.capacity) {
            this._count++;
        }
    }
    toArray() {
        if (this._count === 0)
            return [];
        const result = [];
        if (this._count < this.capacity) {
            for (let i = 0; i < this._count; i++) {
                result.push(this.buffer[i]);
            }
        }
        else {
            for (let i = 0; i < this.capacity; i++) {
                const idx = (this.head + i) % this.capacity;
                result.push(this.buffer[idx]);
            }
        }
        return result;
    }
    get count() {
        return this._count;
    }
    get isFull() {
        return this._count === this.capacity;
    }
    clear() {
        this.buffer = new Array(this.capacity);
        this.head = 0;
        this._count = 0;
    }
}
/**
 * Specialized ring buffer for numeric latency tracking with percentile calculations.
 */
class LatencyBuffer extends RingBuffer {
    sortedCache = null;
    sortedCacheVersion = 0;
    currentVersion = 0;
    constructor(capacity = 100) {
        super(capacity);
    }
    push(value) {
        super.push(value);
        this.currentVersion++;
        this.sortedCache = null;
    }
    getSorted() {
        if (this.sortedCache && this.sortedCacheVersion === this.currentVersion) {
            return this.sortedCache;
        }
        this.sortedCache = this.toArray().sort((a, b) => a - b);
        this.sortedCacheVersion = this.currentVersion;
        return this.sortedCache;
    }
    percentile(p) {
        if (p < 0 || p > 100) {
            throw new Error('Percentile must be between 0 and 100');
        }
        const sorted = this.getSorted();
        if (sorted.length === 0)
            return 0;
        if (p === 0)
            return sorted[0];
        if (p === 100)
            return sorted[sorted.length - 1];
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)];
    }
    p50() {
        return this.percentile(50);
    }
    p95() {
        return this.percentile(95);
    }
    p99() {
        return this.percentile(99);
    }
    max() {
        const sorted = this.getSorted();
        return sorted.length > 0 ? sorted[sorted.length - 1] : 0;
    }
    min() {
        const sorted = this.getSorted();
        return sorted.length > 0 ? sorted[0] : 0;
    }
    avg() {
        const arr = this.toArray();
        if (arr.length === 0)
            return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }
    getStats() {
        return {
            count: this.count,
            min: this.min(),
            max: this.max(),
            avg: this.avg(),
            p50: this.p50(),
            p95: this.p95(),
            p99: this.p99()
        };
    }
    clear() {
        super.clear();
        this.sortedCache = null;
        this.currentVersion++;
    }
}

let serviceCounter = 0;
class GlobalCoordinatorService extends EventEmitter.EventEmitter {
    namespace;
    database;
    serviceId;
    workerId;
    isRunning;
    isLeader;
    currentLeaderId;
    currentEpoch;
    config;
    heartbeatTimer;
    electionTimer;
    subscribedPlugins;
    metrics;
    _circuitBreaker;
    _contentionState;
    _latencyBuffer;
    storage;
    _pluginStorage;
    logger;
    constructor({ namespace, database, config = {} }) {
        super();
        if (!namespace) {
            throw new Error('GlobalCoordinatorService: namespace is required');
        }
        if (!database) {
            throw new Error('GlobalCoordinatorService: database is required');
        }
        this.namespace = namespace;
        this.database = database;
        this.serviceId = `global-coordinator-${Date.now()}-${++serviceCounter}`;
        this.workerId = this._generateWorkerId();
        this.isRunning = false;
        this.isLeader = false;
        this.currentLeaderId = null;
        this.currentEpoch = 0;
        this.config = this._normalizeConfig(config);
        this.heartbeatTimer = null;
        this.electionTimer = null;
        this.subscribedPlugins = new Map();
        this.metrics = {
            heartbeatCount: 0,
            electionCount: 0,
            electionDurationMs: 0,
            leaderChanges: 0,
            workerRegistrations: 0,
            workerTimeouts: 0,
            startTime: null,
            lastHeartbeatTime: null,
            circuitBreakerTrips: 0,
            circuitBreakerState: 'closed',
            contentionEvents: 0,
            epochDriftEvents: 0
        };
        this._contentionState = {
            lastEventTime: 0,
            rateLimitMs: this.config.contentionRateLimitMs
        };
        this._latencyBuffer = new LatencyBuffer(this.config.metricsBufferSize);
        this._circuitBreaker = {
            state: 'closed',
            failureCount: 0,
            lastFailureTime: null,
            lastSuccessTime: null,
            openedAt: null,
            failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
            resetTimeout: config.circuitBreaker?.resetTimeout ?? 30000,
            halfOpenMaxAttempts: config.circuitBreaker?.halfOpenMaxAttempts ?? 1
        };
        this.storage = null;
        this._pluginStorage = null;
        this.logger = database.getChildLogger(`GlobalCoordinator:${namespace}`);
    }
    async start() {
        if (this.isRunning) {
            this._log('Service already running');
            return;
        }
        try {
            this.storage = this._getStorage();
            await this._initializeMetadata();
            this.isRunning = true;
            this.metrics.startTime = Date.now();
            this._log('Service started');
            this._startLoop();
        }
        catch (err) {
            this.isRunning = false;
            this._logError('Failed to start service', err);
            throw err;
        }
    }
    async _startLoop() {
        try {
            const jitterMs = Math.random() * this.config.heartbeatJitter;
            await this._sleep(jitterMs);
            if (this.isRunning) {
                await this._heartbeatCycle();
                this._scheduleHeartbeat();
            }
        }
        catch (err) {
            this._logError('Error in background loop start', err);
            if (this.isRunning) {
                setTimeout(() => this._startLoop(), 5000);
            }
        }
    }
    async stop() {
        if (!this.isRunning)
            return;
        try {
            this.isRunning = false;
            this.isLeader = false;
            this.currentLeaderId = null;
            if (this.heartbeatTimer) {
                clearTimeout(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
            if (this.electionTimer) {
                clearTimeout(this.electionTimer);
                this.electionTimer = null;
            }
            await this._unregisterWorker();
            this.subscribedPlugins.clear();
            this._log('Service stopped');
        }
        catch (err) {
            this._logError('Error stopping service', err);
        }
    }
    async subscribePlugin(pluginName, plugin) {
        const subStart = Date.now();
        this.logger.debug({ namespace: this.namespace, pluginName }, `[SUBSCRIBE] START`);
        if (!pluginName || !plugin) {
            throw new Error('GlobalCoordinatorService: pluginName and plugin required');
        }
        this.subscribedPlugins.set(pluginName, plugin);
        this._log(`Plugin subscribed: ${pluginName}`);
        if (this.isRunning && plugin.workerId && this.storage) {
            this.logger.debug({ namespace: this.namespace, pluginName, workerId: plugin.workerId?.substring(0, 30) }, `[SUBSCRIBE] registering worker entry`);
            const regStart = Date.now();
            await this._registerWorkerEntry(plugin.workerId, pluginName);
            this.logger.debug({ namespace: this.namespace, pluginName, ms: Date.now() - regStart }, `[SUBSCRIBE] worker entry registered`);
            this.logger.debug({ namespace: this.namespace, pluginName }, `[SUBSCRIBE] triggering background heartbeat (fire-and-forget)`);
            this._heartbeatCycle().catch(err => {
                this._logError('Background heartbeat after plugin subscription failed', err);
            });
        }
        const totalMs = Date.now() - subStart;
        this.logger.debug({ namespace: this.namespace, pluginName, totalMs }, `[SUBSCRIBE] complete`);
    }
    unsubscribePlugin(pluginName) {
        this.subscribedPlugins.delete(pluginName);
        this._log(`Plugin unsubscribed: ${pluginName}`);
    }
    async isLeaderCheck(workerId) {
        if (!workerId)
            return false;
        return this.currentLeaderId === workerId && this.isLeader;
    }
    async getLeader() {
        if (!this.isRunning)
            return null;
        return this.currentLeaderId;
    }
    async getEpoch() {
        if (!this.isRunning)
            return 0;
        return this.currentEpoch;
    }
    async getActiveWorkers() {
        if (!this.storage)
            return [];
        return await this.storage.listActiveWorkers(this._getWorkersPrefix(), this.config.workerTimeout);
    }
    getMetrics() {
        return {
            ...this.metrics,
            latency: this._latencyBuffer.getStats(),
            metricsWindowSize: this._latencyBuffer.count
        };
    }
    incrementEpochDriftEvents() {
        this.metrics.epochDriftEvents++;
    }
    async _heartbeatCycle() {
        if (!this.isRunning || !this.storage)
            return;
        if (!this._circuitBreakerAllows()) {
            this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] SKIPPED - circuit breaker open`);
            return;
        }
        try {
            const startMs = Date.now();
            this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] START`);
            const regStart = Date.now();
            await this._registerWorker();
            this.logger.debug({ namespace: this.namespace, ms: Date.now() - regStart }, `[HEARTBEAT] _registerWorker complete`);
            const stateStart = Date.now();
            const state = await this._getState();
            this.logger.debug({ namespace: this.namespace, ms: Date.now() - stateStart, hasState: !!state }, `[HEARTBEAT] _getState complete`);
            const previousLeaderId = this.currentLeaderId;
            const now = Date.now();
            let newLeaderId = state?.leaderId ?? null;
            let newEpoch = state?.epoch ?? this.currentEpoch ?? 0;
            let needsNewElection = !state || (state.leaseEnd && now >= state.leaseEnd);
            if (!needsNewElection && state?.leaderId) {
                const isLeaderCoordinator = state.leaderId.startsWith('gcs-');
                if (isLeaderCoordinator) {
                    const workerIds = await this.storage.listActiveWorkerIds(this._getWorkersPrefix(), this.config.workerTimeout);
                    const hasPluginWorkers = workerIds.some(id => !id.startsWith('gcs-'));
                    if (hasPluginWorkers) {
                        this._log('Plugin workers available, forcing re-election');
                        needsNewElection = true;
                    }
                }
            }
            if (needsNewElection) {
                this.logger.debug({ namespace: this.namespace }, `[HEARTBEAT] needs election, calling _conductElection`);
                const electionStart = Date.now();
                const electionResult = await this._conductElection(newEpoch);
                this.logger.debug({ namespace: this.namespace, ms: Date.now() - electionStart, leader: electionResult?.leaderId }, `[HEARTBEAT] _conductElection complete`);
                newLeaderId = electionResult?.leaderId || null;
                newEpoch = electionResult?.epoch ?? newEpoch + 1;
                this.metrics.electionCount++;
            }
            this.currentLeaderId = newLeaderId;
            this.currentEpoch = newEpoch || 1;
            this.isLeader = newLeaderId === this.workerId;
            this.metrics.heartbeatCount++;
            this.metrics.lastHeartbeatTime = Date.now();
            if (previousLeaderId !== newLeaderId) {
                this.metrics.leaderChanges++;
                this.logger.debug({ namespace: this.namespace, from: previousLeaderId, to: newLeaderId }, `[HEARTBEAT] leader changed, notifying plugins`);
                this._notifyLeaderChange(previousLeaderId, newLeaderId);
            }
            const durationMs = Date.now() - startMs;
            this.metrics.electionDurationMs = durationMs;
            this._latencyBuffer.push(durationMs);
            this._circuitBreakerSuccess();
            this._checkContention(durationMs);
            if (durationMs > 100) {
                this.logger.warn({ namespace: this.namespace, durationMs }, `[PERF] SLOW HEARTBEAT detected`);
            }
            else {
                this.logger.debug({ namespace: this.namespace, durationMs }, `[HEARTBEAT] complete`);
            }
        }
        catch (err) {
            this._circuitBreakerFailure();
            this._logError('Heartbeat cycle failed', err);
        }
    }
    _checkContention(durationMs) {
        if (!this.config.contentionEnabled)
            return;
        const ratio = durationMs / this.config.heartbeatInterval;
        if (ratio > this.config.contentionThreshold) {
            this.metrics.contentionEvents++;
            const now = Date.now();
            if (now - this._contentionState.lastEventTime > this._contentionState.rateLimitMs) {
                this._contentionState.lastEventTime = now;
                const event = {
                    namespace: this.namespace,
                    duration: durationMs,
                    expected: this.config.heartbeatInterval,
                    ratio,
                    threshold: this.config.contentionThreshold,
                    timestamp: now
                };
                this.emit('contention:detected', event);
                this.logger.warn({
                    namespace: this.namespace,
                    durationMs,
                    expectedMs: this.config.heartbeatInterval,
                    ratio: ratio.toFixed(2),
                    threshold: this.config.contentionThreshold
                }, `Contention detected: heartbeat took ${ratio.toFixed(1)}x longer than expected`);
            }
        }
    }
    async _conductElection(previousEpoch = 0) {
        try {
            this.logger.debug({ namespace: this.namespace }, `[ELECTION] START`);
            const listStart = Date.now();
            const workerIds = await this.storage.listActiveWorkerIds(this._getWorkersPrefix(), this.config.workerTimeout);
            this.logger.debug({ namespace: this.namespace, ms: Date.now() - listStart, count: workerIds?.length }, `[ELECTION] listActiveWorkerIds complete`);
            const pluginWorkerIds = workerIds.filter(id => !id.startsWith('gcs-'));
            this.logger.debug({ namespace: this.namespace, pluginWorkers: pluginWorkerIds?.length, allWorkers: workerIds?.length }, `[ELECTION] filtered workers`);
            const candidateIds = pluginWorkerIds.length > 0 ? pluginWorkerIds : workerIds;
            if (candidateIds.length === 0) {
                this.logger.debug({ namespace: this.namespace }, `[ELECTION] no workers available`);
                this._log('No workers available for election');
                return { leaderId: null, epoch: previousEpoch };
            }
            const elected = candidateIds[0] ?? null;
            const now = Date.now();
            const leaseEnd = now + this.config.leaseTimeout;
            const epoch = previousEpoch + 1;
            const newState = {
                leaderId: elected,
                leaderPod: elected ? this._getWorkerPod(elected) : undefined,
                epoch,
                leaseStart: now,
                leaseEnd,
                electedBy: this.workerId,
                electedAt: now
            };
            this._log(`Attempting to elect leader: ${elected}`);
            const [ok, err] = await tryFn(() => this.storage.set(this._getStateKey(), newState, {
                ttl: Math.ceil(this.config.leaseTimeout / 1000) + 60,
                behavior: 'body-only'
            }));
            if (!ok) {
                this._logError('Failed to store new leader state', err);
                return { leaderId: null, epoch: previousEpoch };
            }
            this._log(`Leader elected: ${elected}`);
            return { leaderId: elected, epoch };
        }
        catch (err) {
            this._logError('Election failed', err);
            return { leaderId: null, epoch: previousEpoch };
        }
    }
    async _registerWorker() {
        if (!this.storage)
            return;
        const regStart = Date.now();
        this.logger.debug({ namespace: this.namespace, subscribedCount: this.subscribedPlugins.size }, `[REGISTER_WORKER] START`);
        const registrations = [
            this._registerWorkerEntry(this.workerId)
        ];
        for (const [pluginName, plugin] of this.subscribedPlugins.entries()) {
            if (plugin && plugin.workerId) {
                registrations.push(this._registerWorkerEntry(plugin.workerId, pluginName));
            }
        }
        await Promise.all(registrations);
        const totalMs = Date.now() - regStart;
        if (totalMs > 50) {
            this.logger.warn({ namespace: this.namespace, totalMs, count: registrations.length }, `[PERF] SLOW _registerWorker`);
        }
        else {
            this.logger.debug({ namespace: this.namespace, totalMs, count: registrations.length }, `[REGISTER_WORKER] complete`);
        }
    }
    async _registerWorkerEntry(workerId, pluginName = null) {
        if (!workerId || !this.storage)
            return;
        const [ok, err] = await tryFn(() => this.storage.set(this._getWorkerKey(workerId), {
            workerId,
            pluginName: pluginName || 'coordinator',
            pod: this._getWorkerPod(workerId),
            lastHeartbeat: Date.now(),
            startTime: this.metrics.startTime,
            namespace: this.namespace
        }, {
            ttl: Math.ceil(this.config.workerTimeout / 1000),
            behavior: 'body-only'
        }));
        if (!ok) {
            this._logError(`Failed to register worker heartbeat for ${workerId}`, err);
        }
        else {
            this.metrics.workerRegistrations++;
        }
    }
    async _unregisterWorker() {
        if (!this.storage)
            return;
        const unregistrations = [
            this._unregisterWorkerEntry(this.workerId)
        ];
        for (const [, plugin] of this.subscribedPlugins.entries()) {
            if (plugin && plugin.workerId) {
                unregistrations.push(this._unregisterWorkerEntry(plugin.workerId));
            }
        }
        await Promise.all(unregistrations);
    }
    async _unregisterWorkerEntry(workerId) {
        if (!workerId || !this.storage)
            return;
        const [ok, err] = await tryFn(() => this.storage.delete(this._getWorkerKey(workerId)));
        if (!ok) {
            this._logError(`Failed to unregister worker ${workerId}`, err);
        }
    }
    async _getState() {
        if (!this.storage)
            return null;
        const [ok, , data] = await tryFn(() => this.storage.get(this._getStateKey()));
        if (!ok) {
            return null;
        }
        return data;
    }
    async _initializeMetadata() {
        if (!this.storage)
            return;
        const [ok, err] = await tryFn(() => this.storage.set(this._getMetadataKey(), {
            namespace: this.namespace,
            serviceId: this.serviceId,
            createdAt: Date.now(),
            createdBy: this.workerId,
            plugins: Array.from(this.subscribedPlugins.keys())
        }, {
            ttl: 3600,
            behavior: 'body-only'
        }));
        if (!ok) {
            this._logError('Failed to initialize metadata', err);
        }
    }
    _notifyLeaderChange(previousLeaderId, newLeaderId) {
        const event = {
            namespace: this.namespace,
            previousLeader: previousLeaderId,
            newLeader: newLeaderId,
            epoch: this.currentEpoch,
            timestamp: Date.now()
        };
        this._log(`Leader changed: ${previousLeaderId || 'none'} → ${newLeaderId}`, `(epoch: ${this.currentEpoch})`);
        this.emit('leader:changed', event);
        for (const [pluginName, plugin] of this.subscribedPlugins) {
            this._notifyPlugin(pluginName, plugin, 'leader:changed', event);
        }
    }
    _notifyPlugin(pluginName, plugin, eventType, data) {
        try {
            if (eventType === 'leader:changed') {
                const isLeader = data.newLeader === this.workerId;
                if (plugin.onGlobalLeaderChange) {
                    plugin.onGlobalLeaderChange(isLeader, data);
                }
            }
        }
        catch (err) {
            this._logError(`Plugin notification failed (${pluginName}):`, err);
        }
    }
    _scheduleHeartbeat() {
        if (!this.isRunning)
            return;
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
        }
        const jitterMs = Math.random() * this.config.heartbeatJitter;
        const delayMs = this.config.heartbeatInterval + jitterMs;
        this.heartbeatTimer = setTimeout(async () => {
            await this._heartbeatCycle();
            this._scheduleHeartbeat();
        }, delayMs);
    }
    _getStorage() {
        if (!this.database || !this.database.client) {
            throw new Error('GlobalCoordinatorService: database client not available');
        }
        if (!this._pluginStorage) {
            this._pluginStorage = new CoordinatorPluginStorage(this.database.client, 'coordinator');
        }
        return this._pluginStorage;
    }
    _getStateKey() {
        return this.storage.getPluginKey(null, `namespace=${this.namespace}`, 'state.json');
    }
    _getWorkersPrefix() {
        return this.storage.getPluginKey(null, `namespace=${this.namespace}`, 'workers') + '/';
    }
    _getWorkerKey(workerId) {
        return this.storage.getPluginKey(null, `namespace=${this.namespace}`, 'workers', `worker=${workerId}.json`);
    }
    _getMetadataKey() {
        return this.storage.getPluginKey(null, `namespace=${this.namespace}`, 'metadata.json');
    }
    _circuitBreakerAllows() {
        const cb = this._circuitBreaker;
        const now = Date.now();
        if (cb.state === 'closed') {
            return true;
        }
        if (cb.state === 'open') {
            if (cb.openedAt && now - cb.openedAt >= cb.resetTimeout) {
                cb.state = 'half-open';
                this.metrics.circuitBreakerState = 'half-open';
                this._log('Circuit breaker transitioning to half-open');
                return true;
            }
            return false;
        }
        return true;
    }
    _circuitBreakerSuccess() {
        const cb = this._circuitBreaker;
        if (cb.state === 'half-open') {
            cb.state = 'closed';
            cb.failureCount = 0;
            this.metrics.circuitBreakerState = 'closed';
            this._log('Circuit breaker closed after successful recovery');
        }
        else if (cb.state === 'closed') {
            cb.failureCount = 0;
        }
        cb.lastSuccessTime = Date.now();
    }
    _circuitBreakerFailure() {
        const cb = this._circuitBreaker;
        const now = Date.now();
        cb.failureCount++;
        cb.lastFailureTime = now;
        if (cb.state === 'half-open') {
            cb.state = 'open';
            cb.openedAt = now;
            this.metrics.circuitBreakerState = 'open';
            this.metrics.circuitBreakerTrips++;
            this._log('Circuit breaker reopened after half-open failure');
            this.emit('circuitBreaker:open', { namespace: this.namespace, failureCount: cb.failureCount });
        }
        else if (cb.state === 'closed' && cb.failureCount >= cb.failureThreshold) {
            cb.state = 'open';
            cb.openedAt = now;
            this.metrics.circuitBreakerState = 'open';
            this.metrics.circuitBreakerTrips++;
            this._log(`Circuit breaker opened after ${cb.failureCount} failures`);
            this.emit('circuitBreaker:open', { namespace: this.namespace, failureCount: cb.failureCount });
        }
    }
    getCircuitBreakerStatus() {
        const cb = this._circuitBreaker;
        return {
            state: cb.state,
            failureCount: cb.failureCount,
            failureThreshold: cb.failureThreshold,
            resetTimeout: cb.resetTimeout,
            lastFailureTime: cb.lastFailureTime,
            lastSuccessTime: cb.lastSuccessTime,
            openedAt: cb.openedAt,
            trips: this.metrics.circuitBreakerTrips
        };
    }
    _getWorkerPod(_workerId) {
        if (typeof process !== 'undefined' && process.env) {
            return process.env.HOSTNAME || process.env.NODE_NAME || 'unknown';
        }
        return 'unknown';
    }
    _normalizeConfig(config) {
        return {
            heartbeatInterval: Math.max(1000, config.heartbeatInterval || 5000),
            heartbeatJitter: Math.max(0, config.heartbeatJitter || 1000),
            leaseTimeout: Math.max(5000, config.leaseTimeout || 15000),
            workerTimeout: Math.max(5000, config.workerTimeout || 20000),
            diagnosticsEnabled: Boolean(config.diagnosticsEnabled ?? false),
            contentionEnabled: config.contention?.enabled ?? true,
            contentionThreshold: config.contention?.threshold ?? 2.0,
            contentionRateLimitMs: config.contention?.rateLimitMs ?? 30000,
            metricsBufferSize: Math.max(10, config.metricsBufferSize ?? 100)
        };
    }
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    _log(...args) {
        if (this.config.diagnosticsEnabled) {
            this.logger.debug(args[0], ...args.slice(1));
        }
    }
    _logError(msg, err) {
        if (this.config.diagnosticsEnabled) {
            this.logger.error({ error: err?.message || String(err) }, msg);
        }
    }
    _generateWorkerId() {
        const env = typeof process !== 'undefined' ? process.env : {};
        if (env.POD_NAME) {
            return `gcs-${env.POD_NAME}-${++serviceCounter}`;
        }
        if (env.HOSTNAME) {
            return `gcs-${env.HOSTNAME}-${++serviceCounter}`;
        }
        if (this.database && this.database.id) {
            return `gcs-${this.database.id}-${++serviceCounter}`;
        }
        return `gcs-${this.namespace}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${++serviceCounter}`;
    }
}
class CoordinatorPluginStorage extends PluginStorage {
    constructor(client, pluginSlug = 'coordinator') {
        super(client, pluginSlug);
    }
    async list(prefix = '', options = {}) {
        const { limit } = options;
        const fullPrefix = prefix || '';
        const [ok, err, result] = await tryFn(() => this.client.listObjects({ prefix: fullPrefix, maxKeys: limit }));
        if (!ok) {
            throw err;
        }
        const keys = result.Contents?.map(item => item.Key) || [];
        return this._removeKeyPrefix(keys);
    }
    async listWithPrefix(prefix = '', options = {}) {
        const keys = await this.list(prefix, options);
        if (!keys || keys.length === 0) {
            return [];
        }
        const results = await this.batchGet(keys);
        return results
            .filter(item => item.ok && item.data != null)
            .map(item => item.data);
    }
    async _getActiveKeys(prefix, timeoutMs) {
        const fullPrefix = prefix || '';
        const [ok, , result] = await tryFn(() => this.client.listObjects({ prefix: fullPrefix }));
        if (!ok || !result.Contents) {
            return [];
        }
        const now = Date.now();
        const activeKeys = [];
        const staleKeys = [];
        for (const obj of result.Contents) {
            const lastModified = obj.LastModified ? new Date(obj.LastModified).getTime() : 0;
            const age = now - lastModified;
            if (age < (timeoutMs + 5000)) {
                activeKeys.push(obj.Key);
            }
            else {
                staleKeys.push(obj.Key);
            }
        }
        if (staleKeys.length > 0) {
            this._deleteStaleWorkers(staleKeys).catch(() => { });
        }
        return activeKeys;
    }
    async listActiveWorkers(prefix, timeoutMs) {
        const activeKeys = await this._getActiveKeys(prefix, timeoutMs);
        const keysToFetch = this._removeKeyPrefix(activeKeys);
        if (keysToFetch.length === 0)
            return [];
        const results = await this.batchGet(keysToFetch);
        return results
            .filter(item => item.ok && item.data != null)
            .map(item => item.data)
            .sort((a, b) => (a.workerId || '').localeCompare(b.workerId || ''));
    }
    async listActiveWorkerIds(prefix, timeoutMs) {
        const activeKeys = await this._getActiveKeys(prefix, timeoutMs);
        const keysToProcess = this._removeKeyPrefix(activeKeys);
        if (keysToProcess.length === 0)
            return [];
        return keysToProcess
            .map(key => {
            const parts = key.split('/');
            const filename = parts[parts.length - 1];
            const rawId = filename.replace('.json', '');
            return rawId.startsWith('worker=') ? rawId.slice('worker='.length) : rawId;
        })
            .filter(id => id)
            .sort((a, b) => a.localeCompare(b));
    }
    async _deleteStaleWorkers(keys) {
        const cleanKeys = this._removeKeyPrefix(keys);
        if (cleanKeys.length > 0) {
            await Promise.all(cleanKeys.map(key => this.client.deleteObject(key)));
        }
    }
}

var globalCoordinatorService_class = /*#__PURE__*/Object.freeze({
    __proto__: null,
    CoordinatorPluginStorage: CoordinatorPluginStorage,
    GlobalCoordinatorService: GlobalCoordinatorService
});

exports.AVAILABLE_BEHAVIORS = AVAILABLE_BEHAVIORS;
exports.AdaptiveTuning = AdaptiveTuning;
exports.AnalyticsNotEnabledError = AnalyticsNotEnabledError;
exports.AuthenticationError = AuthenticationError;
exports.BaseError = BaseError;
exports.BehaviorError = BehaviorError;
exports.Benchmark = Benchmark;
exports.Client = S3Client;
exports.ConnectionString = ConnectionString;
exports.ConnectionStringError = ConnectionStringError;
exports.CryptoError = CryptoError;
exports.DEFAULT_BEHAVIOR = DEFAULT_BEHAVIOR;
exports.Database = Database;
exports.DatabaseError = DatabaseError;
exports.EncryptionError = EncryptionError;
exports.ErrorMap = ErrorMap;
exports.FileSystemClient = FileSystemClient;
exports.InvalidResourceItem = InvalidResourceItem;
exports.MemoryClient = MemoryClient;
exports.MetadataLimitError = MetadataLimitError;
exports.MissingMetadata = MissingMetadata;
exports.NoSuchBucket = NoSuchBucket;
exports.NoSuchKey = NoSuchKey;
exports.NotFound = NotFound;
exports.PartitionDriverError = PartitionDriverError;
exports.PartitionError = PartitionError;
exports.PerformanceMonitor = PerformanceMonitor;
exports.PermissionError = PermissionError;
exports.PluginError = PluginError;
exports.PluginStorageError = PluginStorageError;
exports.ProcessManager = ProcessManager;
exports.Resource = Resource;
exports.ResourceError = ResourceError;
exports.ResourceIdsPageReader = ResourceIdsPageReader;
exports.ResourceIdsReader = ResourceIdsReader;
exports.ResourceNotFound = ResourceNotFound;
exports.ResourceReader = ResourceReader;
exports.ResourceWriter = ResourceWriter;
exports.S3Client = S3Client;
exports.S3db = Database;
exports.S3dbError = S3dbError;
exports.SafeEventEmitter = SafeEventEmitter;
exports.Schema = Schema;
exports.SchemaError = SchemaError;
exports.StreamError = StreamError;
exports.TaskExecutor = TaskExecutor;
exports.TasksPool = TasksPool;
exports.TasksRunner = TasksRunner;
exports.UnknownError = UnknownError;
exports.ValidationError = ValidationError;
exports.Validator = Validator;
exports.behaviors = behaviors;
exports.benchmark = benchmark;
exports.createCustomGenerator = createCustomGenerator;
exports.createLogger = createLogger;
exports.createSafeEventEmitter = createSafeEventEmitter;
exports.decode = decode;
exports.decodeBits = decodeBits;
exports.decodeBuffer = decodeBuffer;
exports.decodeDecimal = decodeDecimal;
exports.decrypt = decrypt;
exports.default = S3db;
exports.encode = encode;
exports.encodeBits = encodeBits;
exports.encodeBuffer = encodeBuffer;
exports.encodeDecimal = encodeDecimal;
exports.encrypt = encrypt;
exports.getBehavior = getBehavior;
exports.getProcessManager = getProcessManager;
exports.idGenerator = idGenerator;
exports.initializeNanoid = initializeNanoid;
exports.mapAwsError = mapAwsError;
exports.mapWithConcurrency = mapWithConcurrency;
exports.passwordGenerator = passwordGenerator;
exports.resetProcessManager = resetProcessManager;
exports.streamToString = streamToString;
exports.tryFn = tryFn;
exports.tryFnSync = tryFnSync;
//# sourceMappingURL=s3db-lite.cjs.map
