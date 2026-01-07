import { createClient, expandHTTP2Options, Http2Error, parseHttp2Error, createHttp2MetricsHooks, getGlobalHttp2Metrics, } from 'recker';
import { Readable } from 'node:stream';
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
        const h2Error = parseHttp2Error(error);
        if (h2Error) {
            return h2Error.retriable;
        }
        // Check for native HTTP/2 errors
        if (error instanceof Http2Error) {
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
    const h2Error = parseHttp2Error(error);
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
export class ReckerHttpHandler {
    metadata = { handlerProtocol: 'h2' };
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
                ? expandHTTP2Options(this.options.http2Preset)
                : { enabled: true, maxConcurrentStreams: this.options.http2MaxConcurrentStreams }
            : false;
        // Build hooks for HTTP/2 observability
        const hooks = this.http2MetricsEnabled ? createHttp2MetricsHooks() : undefined;
        this.client = createClient({
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
    async handle(request, { abortSignal, requestTimeout } = {}) {
        const protocol = request.protocol || 'https:';
        const defaultPort = protocol === 'https:' ? 443 : 80;
        const port = request.port || defaultPort;
        const hostname = request.hostname;
        const url = `${protocol}//${hostname}:${port}${request.path}`;
        const method = request.method;
        if (this.circuitBreaker && !this.circuitBreaker.canRequest(hostname)) {
            this.metrics.circuitBreakerTrips++;
            throw new Error(`Circuit breaker OPEN for ${hostname}`);
        }
        const headers = {};
        for (const [key, value] of Object.entries(request.headers)) {
            if (value !== undefined) {
                headers[key] = value;
            }
        }
        const doRequest = async () => {
            this.metrics.requests++;
            let lastError;
            let attempt = 0;
            const maxAttempts = this.options.enableRetry ? this.options.maxRetries + 1 : 1;
            while (attempt < maxAttempts) {
                attempt++;
                try {
                    const reckerResponse = await this.client.request(url, {
                        method,
                        headers,
                        body: request.body,
                        signal: abortSignal,
                        timeout: requestTimeout || this.options.bodyTimeout,
                        http2: this.options.http2,
                    });
                    if (this.options.enableRetry && attempt < maxAttempts &&
                        isRetryableError(null, reckerResponse.status)) {
                        this.metrics.retries++;
                        let delay;
                        if (this.options.respectRetryAfter) {
                            const retryAfter = parseRetryAfter(reckerResponse.headers.get('Retry-After'));
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
                    let body;
                    if (reckerResponse.body) {
                        body = Readable.fromWeb(reckerResponse.body);
                    }
                    const responseHeaders = {};
                    for (const [key, value] of reckerResponse.headers.entries()) {
                        responseHeaders[key] = value;
                    }
                    return {
                        response: {
                            statusCode: reckerResponse.status,
                            reason: reckerResponse.statusText,
                            headers: responseHeaders,
                            body
                        }
                    };
                }
                catch (error) {
                    lastError = error;
                    if (this.circuitBreaker) {
                        this.circuitBreaker.recordFailure(hostname);
                    }
                    if (this.options.enableRetry && attempt < maxAttempts && isRetryableError(error)) {
                        this.metrics.retries++;
                        // Check for HTTP/2 specific retry delay (e.g., ENHANCE_YOUR_CALM)
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
            const h2Summary = getGlobalHttp2Metrics().getSummary();
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
export default ReckerHttpHandler;
//# sourceMappingURL=recker-http-handler.js.map