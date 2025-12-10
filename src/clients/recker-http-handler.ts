import { createClient } from 'recker';
import { Readable } from 'node:stream';
import type {
  ReckerHttpHandlerOptions,
  CircuitStats,
  HandlerMetrics,
  AwsHttpRequest,
  AwsHttpResponse,
  HandleOptions
} from './types.js';

interface CircuitBreakerOptions {
  threshold?: number;
  resetTimeout?: number;
}

class CircuitBreaker {
  private threshold: number;
  private resetTimeout: number;
  circuits: Map<string, CircuitStats>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.circuits = new Map();
  }

  getKey(hostname: string): string {
    return hostname || 'unknown';
  }

  getStats(key: string): CircuitStats {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        failures: 0,
        lastFailureTime: 0,
        state: 'CLOSED'
      });
    }
    return this.circuits.get(key)!;
  }

  canRequest(hostname: string): boolean {
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

  recordSuccess(hostname: string): void {
    const key = this.getKey(hostname);
    const stats = this.getStats(key);

    if (stats.state === 'HALF_OPEN' || stats.state === 'CLOSED') {
      stats.state = 'CLOSED';
      stats.failures = 0;
    }
  }

  recordFailure(hostname: string): void {
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

  getState(hostname: string): CircuitStats['state'] {
    const key = this.getKey(hostname);
    return this.getStats(key).state;
  }
}

class RequestDeduplicator {
  private pending: Map<string, Promise<{ response: AwsHttpResponse }>>;

  constructor() {
    this.pending = new Map();
  }

  generateKey(method: string, url: string): string {
    return `${method}:${url}`;
  }

  async dedupe(
    method: string,
    url: string,
    requestFn: () => Promise<{ response: AwsHttpResponse }>
  ): Promise<{ response: AwsHttpResponse }> {
    if (method !== 'GET' && method !== 'HEAD') {
      return requestFn();
    }

    const key = this.generateKey(method, url);

    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }

    const promise = requestFn().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.pending.size;
  }
}

function calculateRetryDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  useJitter: boolean = true
): number {
  let delay = Math.pow(2, attempt - 1) * baseDelay;
  delay = Math.min(delay, maxDelay);

  if (useJitter) {
    const jitterRange = delay * 0.25;
    const jitterAmount = (Math.random() * jitterRange * 2) - jitterRange;
    delay += jitterAmount;
  }

  return Math.max(0, Math.floor(delay));
}

function isRetryableError(error: Error | null, statusCode?: number): boolean {
  if (error) {
    const code = (error as NodeJS.ErrnoException).code;
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

function parseRetryAfter(headerValue: string | null): number | undefined {
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

interface ReckerClient {
  request(url: string, options: {
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    signal?: AbortSignal;
    timeout?: number;
    http2?: boolean;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Headers;
    body: ReadableStream | null;
  }>;
}

export class ReckerHttpHandler {
  metadata = { handlerProtocol: 'h2' };

  private options: Required<ReckerHttpHandlerOptions>;
  private client: ReckerClient | null;
  private deduplicator: RequestDeduplicator | null;
  private circuitBreaker: CircuitBreaker | null;
  private metrics: HandlerMetrics;

  constructor(options: ReckerHttpHandlerOptions = {}) {
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

    this.client = createClient({
      timeout: {
        lookup: 5000,
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
        max: this.options.connections * 10,
        agent: {
          connections: this.options.connections,
          pipelining: this.options.pipelining,
          keepAlive: true,
          keepAliveTimeout: this.options.keepAliveTimeout,
          keepAliveMaxTimeout: this.options.keepAliveMaxTimeout,
        },
      },
      observability: false,
    }) as unknown as ReckerClient;

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

  async handle(
    request: AwsHttpRequest,
    { abortSignal, requestTimeout }: HandleOptions = {}
  ): Promise<{ response: AwsHttpResponse }> {
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

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        headers[key] = value;
      }
    }

    const doRequest = async (): Promise<{ response: AwsHttpResponse }> => {
      this.metrics.requests++;

      let lastError: Error | undefined;
      let attempt = 0;
      const maxAttempts = this.options.enableRetry ? this.options.maxRetries + 1 : 1;

      while (attempt < maxAttempts) {
        attempt++;

        try {
          const reckerResponse = await this.client!.request(url, {
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

            let delay: number;
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

          if (this.circuitBreaker) {
            this.circuitBreaker.recordSuccess(hostname);
          }

          let body: Readable | undefined;
          if (reckerResponse.body) {
            body = Readable.fromWeb(reckerResponse.body as Parameters<typeof Readable.fromWeb>[0]);
          }

          const responseHeaders: Record<string, string> = {};
          for (const [key, value] of (reckerResponse.headers as any).entries()) {
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
          lastError = error as Error;

          if (this.circuitBreaker) {
            this.circuitBreaker.recordFailure(hostname);
          }

          if (this.options.enableRetry && attempt < maxAttempts && isRetryableError(error as Error)) {
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

  updateHttpClientConfig(key: keyof ReckerHttpHandlerOptions, value: unknown): void {
    (this.options as Record<string, unknown>)[key] = value;
  }

  httpHandlerConfigs(): ReckerHttpHandlerOptions {
    return { ...this.options };
  }

  getMetrics(): HandlerMetrics {
    return {
      ...this.metrics,
      circuitStates: this.circuitBreaker
        ? Object.fromEntries(this.circuitBreaker.circuits)
        : {},
      pendingDeduped: this.deduplicator?.size || 0,
    };
  }

  resetMetrics(): void {
    this.metrics = {
      requests: 0,
      retries: 0,
      deduped: 0,
      circuitBreakerTrips: 0,
    };
  }

  destroy(): void {
    this.client = null;
    this.deduplicator = null;
    this.circuitBreaker = null;
  }
}

export default ReckerHttpHandler;
