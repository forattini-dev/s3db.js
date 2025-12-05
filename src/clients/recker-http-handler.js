/**
 * Recker HTTP Handler for AWS SDK v3
 *
 * High-performance adapter implementing the AWS SDK RequestHandler interface
 * using Recker (Undici-based HTTP client) for maximum performance.
 *
 * Performance Features:
 * - HTTP/2 multiplexing (100+ concurrent streams per connection)
 * - Aggressive connection pooling with keep-alive
 * - Request deduplication for identical in-flight requests
 * - Smart retry with exponential backoff + jitter
 * - Per-phase timeouts (DNS, connect, TLS, TTFB, total)
 * - Circuit breaker for failing endpoints
 * - Zero-copy streaming with Web Streams
 */

import { createClient } from 'recker';
import { Readable } from 'node:stream';

/**
 * Circuit breaker for endpoint protection
 */
class CircuitBreaker {
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
    } else if (stats.state === 'CLOSED' && stats.failures >= this.threshold) {
      stats.state = 'OPEN';
    }
  }

  getState(hostname) {
    const key = this.getKey(hostname);
    return this.getStats(key).state;
  }
}

/**
 * Request deduplication for identical in-flight requests
 */
class RequestDeduplicator {
  constructor() {
    this.pending = new Map();
  }

  generateKey(method, url) {
    return `${method}:${url}`;
  }

  async dedupe(method, url, requestFn) {
    // Only dedupe safe methods
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
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
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

/**
 * Check if error is retryable
 */
function isRetryableError(error, statusCode) {
  if (error) {
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
 * Parse Retry-After header
 */
function parseRetryAfter(headerValue) {
  if (!headerValue) return undefined;

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
  /**
   * Handler protocol metadata required by AWS SDK
   * Using 'h2' to indicate HTTP/2 support
   */
  metadata = { handlerProtocol: 'h2' };

  /**
   * Create a new ReckerHttpHandler with maximum performance tuning
   *
   * @param {Object} options - Configuration options
   * @param {number} [options.connectTimeout=10000] - TCP connection timeout
   * @param {number} [options.headersTimeout=30000] - Time to receive response headers (TTFB)
   * @param {number} [options.bodyTimeout=60000] - Time to receive response body
   * @param {number} [options.keepAliveTimeout=4000] - Keep-alive timeout for idle connections
   * @param {number} [options.keepAliveMaxTimeout=600000] - Maximum keep-alive timeout (10 min)
   * @param {number} [options.connections=100] - Connections per origin (pool size)
   * @param {number} [options.pipelining=10] - HTTP/1.1 pipelining factor
   * @param {boolean} [options.http2=true] - Enable HTTP/2 multiplexing
   * @param {number} [options.http2MaxConcurrentStreams=100] - Max HTTP/2 streams per connection
   * @param {boolean} [options.enableDedup=true] - Enable request deduplication
   * @param {boolean} [options.enableCircuitBreaker=true] - Enable circuit breaker
   * @param {number} [options.circuitBreakerThreshold=5] - Failures before circuit opens
   * @param {number} [options.circuitBreakerResetTimeout=30000] - Time before circuit half-opens
   * @param {boolean} [options.enableRetry=true] - Enable automatic retry
   * @param {number} [options.maxRetries=3] - Maximum retry attempts
   * @param {number} [options.retryDelay=1000] - Base retry delay in ms
   * @param {number} [options.maxRetryDelay=30000] - Maximum retry delay cap
   * @param {boolean} [options.retryJitter=true] - Add jitter to retry delays
   * @param {boolean} [options.respectRetryAfter=true] - Respect Retry-After header
   */
  constructor(options = {}) {
    this.options = {
      // Timeouts (aggressive for S3)
      connectTimeout: 10000,
      headersTimeout: 30000,
      bodyTimeout: 60000,
      keepAliveTimeout: 4000,
      keepAliveMaxTimeout: 600000, // 10 minutes

      // Connection pooling (aggressive)
      connections: 100,
      pipelining: 10,

      // HTTP/2 (major performance boost for S3)
      http2: true,
      http2MaxConcurrentStreams: 100,

      // Request deduplication
      enableDedup: true,

      // Circuit breaker
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      circuitBreakerResetTimeout: 30000,

      // Retry configuration
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
      maxRetryDelay: 30000,
      retryJitter: true,
      respectRetryAfter: true,

      ...options,
    };

    // Initialize Recker client with HTTP/2 and aggressive connection pooling
    this.client = createClient({
      // No baseUrl - we'll pass full URLs to each request
      timeout: {
        lookup: 5000,           // DNS should be fast
        connect: this.options.connectTimeout,
        secureConnect: this.options.connectTimeout,
        response: this.options.headersTimeout,
        request: this.options.bodyTimeout,
      },
      http2: this.options.http2 ? {
        enabled: true,
        maxConcurrentStreams: this.options.http2MaxConcurrentStreams,
      } : false,
      concurrency: {
        max: this.options.connections * 10, // Allow many concurrent requests
        agent: {
          connections: this.options.connections,
          pipelining: this.options.pipelining,
          keepAlive: true,
          keepAliveTimeout: this.options.keepAliveTimeout,
          keepAliveMaxTimeout: this.options.keepAliveMaxTimeout,
        },
      },
      // Disable observability for maximum performance
      observability: false,
    });

    // Initialize deduplicator
    this.deduplicator = this.options.enableDedup ? new RequestDeduplicator() : null;

    // Initialize circuit breaker
    this.circuitBreaker = this.options.enableCircuitBreaker ? new CircuitBreaker({
      threshold: this.options.circuitBreakerThreshold,
      resetTimeout: this.options.circuitBreakerResetTimeout,
    }) : null;

    // Metrics
    this.metrics = {
      requests: 0,
      retries: 0,
      deduped: 0,
      circuitBreakerTrips: 0,
    };
  }

  /**
   * Handle an HTTP request (implements AWS SDK RequestHandler interface)
   */
  async handle(request, { abortSignal, requestTimeout } = {}) {
    const protocol = request.protocol || 'https:';
    const defaultPort = protocol === 'https:' ? 443 : 80;
    const port = request.port || defaultPort;
    const hostname = request.hostname;

    // Build full URL from request components
    const url = `${protocol}//${hostname}:${port}${request.path}`;
    const method = request.method;

    // Check circuit breaker
    if (this.circuitBreaker && !this.circuitBreaker.canRequest(hostname)) {
      this.metrics.circuitBreakerTrips++;
      throw new Error(`Circuit breaker OPEN for ${hostname}`);
    }

    // Filter out undefined header values (AWS SDK may include them)
    const headers = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }

    // The actual request function
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

          // Check for retryable status codes
          if (this.options.enableRetry && attempt < maxAttempts &&
              isRetryableError(null, reckerResponse.status)) {
            this.metrics.retries++;

            // Calculate delay (respect Retry-After if present)
            let delay;
            if (this.options.respectRetryAfter) {
              const retryAfter = parseRetryAfter(reckerResponse.headers.get('Retry-After'));
              delay = retryAfter !== undefined
                ? Math.min(retryAfter, this.options.maxRetryDelay)
                : calculateRetryDelay(attempt, this.options.retryDelay, this.options.maxRetryDelay, this.options.retryJitter);
            } else {
              delay = calculateRetryDelay(attempt, this.options.retryDelay, this.options.maxRetryDelay, this.options.retryJitter);
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          // Success - record for circuit breaker
          if (this.circuitBreaker) {
            this.circuitBreaker.recordSuccess(hostname);
          }

          // Convert Web ReadableStream to Node.js Readable stream
          // AWS SDK expects Node.js streams for response body
          let body;
          if (reckerResponse.body) {
            body = Readable.fromWeb(reckerResponse.body);
          }

          // Convert Headers object to plain object
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

        } catch (error) {
          lastError = error;

          // Record failure for circuit breaker
          if (this.circuitBreaker) {
            this.circuitBreaker.recordFailure(hostname);
          }

          // Check if retryable
          if (this.options.enableRetry && attempt < maxAttempts && isRetryableError(error)) {
            this.metrics.retries++;
            const delay = calculateRetryDelay(attempt, this.options.retryDelay, this.options.maxRetryDelay, this.options.retryJitter);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw error;
        }
      }

      throw lastError;
    };

    // Apply deduplication for GET/HEAD requests
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

  /**
   * Update HTTP client configuration
   */
  updateHttpClientConfig(key, value) {
    this.options[key] = value;
  }

  /**
   * Get current HTTP client configuration
   */
  httpHandlerConfigs() {
    return { ...this.options };
  }

  /**
   * Get handler metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitStates: this.circuitBreaker
        ? Object.fromEntries(this.circuitBreaker.circuits)
        : {},
      pendingDeduped: this.deduplicator?.pending.size || 0,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests: 0,
      retries: 0,
      deduped: 0,
      circuitBreakerTrips: 0,
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.client = null;
    this.deduplicator = null;
    this.circuitBreaker = null;
  }
}

export default ReckerHttpHandler;
