/**
 * HTTP Client Wrapper for s3db.js
 *
 * Provides a unified HTTP client interface that uses recker when available,
 * falling back to native fetch with basic retry logic when not.
 *
 * @module concerns/http-client
 */

let reckerModule = null;
let reckerLoadAttempted = false;

/**
 * Lazily load recker module
 * @returns {Promise<Object|null>} Recker module or null if not available
 */
async function loadRecker() {
  if (reckerLoadAttempted) return reckerModule;
  reckerLoadAttempted = true;

  try {
    reckerModule = await import('recker');
    return reckerModule;
  } catch {
    return null;
  }
}

/**
 * Check if recker is available
 * @returns {Promise<boolean>}
 */
export async function isReckerAvailable() {
  const mod = await loadRecker();
  return mod !== null;
}

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in ms
 * @param {string} backoff - Backoff strategy ('fixed' or 'exponential')
 * @param {boolean} jitter - Whether to add jitter
 * @returns {number} Delay in ms
 */
function calculateDelay(attempt, baseDelay, backoff = 'exponential', jitter = true) {
  let delay = backoff === 'exponential'
    ? baseDelay * Math.pow(2, attempt)
    : baseDelay;

  if (jitter) {
    delay = delay * (0.5 + Math.random());
  }

  return Math.min(delay, 60000); // Cap at 60 seconds
}

/**
 * Parse Retry-After header
 * @param {string|null} retryAfter - Retry-After header value
 * @returns {number|null} Delay in ms or null if not parseable
 */
function parseRetryAfter(retryAfter) {
  if (!retryAfter) return null;

  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

/**
 * Native fetch fallback with basic retry logic
 */
class FetchFallback {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || '';
    this.defaultHeaders = options.headers || {};
    this.timeout = options.timeout || 30000;
    this.retry = {
      maxAttempts: options.retry?.maxAttempts ?? 3,
      delay: options.retry?.delay ?? 1000,
      backoff: options.retry?.backoff ?? 'exponential',
      jitter: options.retry?.jitter ?? true,
      retryAfter: options.retry?.retryAfter ?? true,
      retryOn: options.retry?.retryOn ?? [429, 500, 502, 503, 504]
    };
    this.auth = options.auth || null;
  }

  /**
   * Build headers with authentication
   * @param {Object} requestHeaders - Additional headers for this request
   * @returns {Object} Headers object
   */
  _buildHeaders(requestHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 's3db-http-client',
      ...this.defaultHeaders,
      ...requestHeaders
    };

    if (this.auth) {
      switch (this.auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${this.auth.token}`;
          break;
        case 'basic': {
          const credentials = Buffer.from(`${this.auth.username}:${this.auth.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
          break;
        }
        case 'apikey':
          headers[this.auth.header || 'X-API-Key'] = this.auth.value;
          break;
      }
    }

    return headers;
  }

  /**
   * Make HTTP request with retry logic
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @returns {Promise<Response>}
   */
  async request(url, options = {}) {
    const fullUrl = this.baseUrl ? new URL(url, this.baseUrl).toString() : url;
    const method = (options.method || 'GET').toUpperCase();
    const headers = this._buildHeaders(options.headers);
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined;
    const timeout = options.timeout || this.timeout;

    let lastError;

    for (let attempt = 0; attempt <= this.retry.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(fullUrl, {
          method,
          headers,
          body,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Check if we should retry
        if (!response.ok && this.retry.retryOn.includes(response.status) && attempt < this.retry.maxAttempts) {
          // Check for Retry-After header
          let delay;
          if (this.retry.retryAfter) {
            const retryAfterDelay = parseRetryAfter(response.headers.get('Retry-After'));
            delay = retryAfterDelay || calculateDelay(attempt, this.retry.delay, this.retry.backoff, this.retry.jitter);
          } else {
            delay = calculateDelay(attempt, this.retry.delay, this.retry.backoff, this.retry.jitter);
          }

          await sleep(delay);
          continue;
        }

        return response;

      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;

        // Retry on network errors
        if (attempt < this.retry.maxAttempts) {
          const delay = calculateDelay(attempt, this.retry.delay, this.retry.backoff, this.retry.jitter);
          await sleep(delay);
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Make GET request
   */
  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  /**
   * Make POST request
   */
  async post(url, options = {}) {
    return this.request(url, { ...options, method: 'POST' });
  }

  /**
   * Make PUT request
   */
  async put(url, options = {}) {
    return this.request(url, { ...options, method: 'PUT' });
  }

  /**
   * Make PATCH request
   */
  async patch(url, options = {}) {
    return this.request(url, { ...options, method: 'PATCH' });
  }

  /**
   * Make DELETE request
   */
  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }
}

/**
 * Recker-based HTTP client wrapper
 * Provides same interface as FetchFallback but uses recker's advanced features
 */
class ReckerWrapper {
  constructor(options = {}, reckerMod) {
    this.recker = reckerMod;

    // Map s3db retry config to recker format
    const retryConfig = options.retry ? {
      maxAttempts: options.retry.maxAttempts ?? options.retry.limit ?? 3,
      backoff: options.retry.backoff ?? 'exponential',
      jitter: options.retry.jitter ?? true
    } : undefined;

    // Build auth configuration
    let authHeaders = {};
    if (options.auth) {
      switch (options.auth.type) {
        case 'bearer':
          authHeaders['Authorization'] = `Bearer ${options.auth.token}`;
          break;
        case 'basic': {
          const credentials = Buffer.from(`${options.auth.username}:${options.auth.password}`).toString('base64');
          authHeaders['Authorization'] = `Basic ${credentials}`;
          break;
        }
        case 'apikey':
          authHeaders[options.auth.header || 'X-API-Key'] = options.auth.value;
          break;
      }
    }

    this.client = reckerMod.createClient({
      baseUrl: options.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 's3db-http-client',
        ...authHeaders,
        ...options.headers
      },
      timeout: options.timeout || 30000,
      retry: retryConfig
    });

    this.options = options;
  }

  /**
   * Make HTTP request
   */
  async request(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const requestOptions = {
      headers: options.headers,
      body: options.body
    };

    // Use json option if body is an object
    if (options.body && typeof options.body === 'object' && !(options.body instanceof Buffer)) {
      requestOptions.json = options.body;
      delete requestOptions.body;
    }

    switch (method) {
      case 'GET':
        return this.client.get(url, requestOptions);
      case 'POST':
        return this.client.post(url, requestOptions);
      case 'PUT':
        return this.client.put(url, requestOptions);
      case 'PATCH':
        return this.client.patch(url, requestOptions);
      case 'DELETE':
        return this.client.delete(url, requestOptions);
      default:
        return this.client.request(url, { ...requestOptions, method });
    }
  }

  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  async post(url, options = {}) {
    return this.request(url, { ...options, method: 'POST' });
  }

  async put(url, options = {}) {
    return this.request(url, { ...options, method: 'PUT' });
  }

  async patch(url, options = {}) {
    return this.request(url, { ...options, method: 'PATCH' });
  }

  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  /**
   * Scrape HTML page (recker-only feature)
   * @param {string} url - URL to scrape
   * @param {Object} options - Scrape options
   * @returns {Promise<Object>} Document object with selectAll method
   */
  async scrape(url, options = {}) {
    return this.client.scrape(url, options);
  }
}

/**
 * Create HTTP client with unified interface
 * Uses recker when available, falls back to native fetch
 *
 * @param {Object} options - Client configuration
 * @param {string} options.baseUrl - Base URL for requests
 * @param {Object} options.headers - Default headers
 * @param {number} options.timeout - Request timeout in ms (default: 30000)
 * @param {Object} options.retry - Retry configuration
 * @param {number} options.retry.maxAttempts - Max retry attempts (default: 3)
 * @param {number} options.retry.delay - Base delay in ms (default: 1000)
 * @param {string} options.retry.backoff - Backoff strategy: 'fixed' or 'exponential' (default: 'exponential')
 * @param {boolean} options.retry.jitter - Add jitter to delays (default: true)
 * @param {boolean} options.retry.retryAfter - Respect Retry-After header (default: true)
 * @param {number[]} options.retry.retryOn - Status codes to retry (default: [429, 500, 502, 503, 504])
 * @param {Object} options.auth - Authentication configuration
 * @param {string} options.auth.type - Auth type: 'bearer', 'basic', 'apikey'
 * @param {string} options.auth.token - Bearer token
 * @param {string} options.auth.username - Basic auth username
 * @param {string} options.auth.password - Basic auth password
 * @param {string} options.auth.header - API key header name (default: 'X-API-Key')
 * @param {string} options.auth.value - API key value
 * @returns {Promise<FetchFallback|ReckerWrapper>} HTTP client instance
 *
 * @example
 * // Basic usage
 * const client = await createHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   timeout: 10000
 * });
 *
 * const response = await client.get('/users');
 * const data = await response.json();
 *
 * @example
 * // With authentication
 * const client = await createHttpClient({
 *   baseUrl: 'https://api.example.com',
 *   auth: {
 *     type: 'bearer',
 *     token: 'your-token'
 *   },
 *   retry: {
 *     maxAttempts: 5,
 *     retryAfter: true
 *   }
 * });
 */
export async function createHttpClient(options = {}) {
  const recker = await loadRecker();

  if (recker) {
    return new ReckerWrapper(options, recker);
  }

  return new FetchFallback(options);
}

/**
 * Create HTTP client synchronously (uses fallback if recker not loaded)
 * Prefer createHttpClient() for guaranteed recker usage when available
 *
 * @param {Object} options - Same as createHttpClient
 * @returns {FetchFallback|ReckerWrapper} HTTP client instance
 */
export function createHttpClientSync(options = {}) {
  if (reckerModule) {
    return new ReckerWrapper(options, reckerModule);
  }
  return new FetchFallback(options);
}

/**
 * Quick HTTP GET request
 * @param {string} url - URL to fetch
 * @param {Object} options - Request options
 * @returns {Promise<Response>}
 */
export async function httpGet(url, options = {}) {
  const client = await createHttpClient(options);
  return client.get(url, options);
}

/**
 * Quick HTTP POST request
 * @param {string} url - URL to post to
 * @param {Object} body - Request body
 * @param {Object} options - Request options
 * @returns {Promise<Response>}
 */
export async function httpPost(url, body, options = {}) {
  const client = await createHttpClient(options);
  return client.post(url, { ...options, body });
}

/**
 * Preload recker module
 * Call this during initialization to ensure recker is ready for sync usage
 */
export async function preloadRecker() {
  await loadRecker();
  return reckerModule !== null;
}

// Re-export classes for advanced usage
export { FetchFallback, ReckerWrapper };

export default {
  createHttpClient,
  createHttpClientSync,
  httpGet,
  httpPost,
  isReckerAvailable,
  preloadRecker,
  FetchFallback,
  ReckerWrapper
};
