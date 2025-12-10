let reckerModule = null;
let reckerLoadAttempted = false;
async function loadRecker() {
    if (reckerLoadAttempted)
        return reckerModule;
    reckerLoadAttempted = true;
    try {
        const mod = await import('recker');
        reckerModule = mod;
        return reckerModule;
    }
    catch {
        return null;
    }
}
export async function isReckerAvailable() {
    const mod = await loadRecker();
    return mod !== null;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function calculateDelay(attempt, baseDelay, backoff = 'exponential', jitter = true) {
    let delay = backoff === 'exponential'
        ? baseDelay * Math.pow(2, attempt)
        : baseDelay;
    if (jitter) {
        delay = delay * (0.5 + Math.random());
    }
    return Math.min(delay, 60000);
}
function parseRetryAfter(retryAfter) {
    if (!retryAfter)
        return null;
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
        return seconds * 1000;
    }
    const date = Date.parse(retryAfter);
    if (!isNaN(date)) {
        return Math.max(0, date - Date.now());
    }
    return null;
}
export class FetchFallback {
    baseUrl;
    defaultHeaders;
    timeout;
    retry;
    auth;
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
    async request(url, options = {}) {
        const fullUrl = this.baseUrl ? new URL(url, this.baseUrl).toString() : url;
        const method = (options.method || 'GET').toUpperCase();
        const headers = this._buildHeaders(options.headers);
        const body = options.body
            ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
            : undefined;
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
                if (!response.ok && this.retry.retryOn.includes(response.status) && attempt < this.retry.maxAttempts) {
                    let delay;
                    if (this.retry.retryAfter) {
                        const retryAfterDelay = parseRetryAfter(response.headers.get('Retry-After'));
                        delay = retryAfterDelay || calculateDelay(attempt, this.retry.delay, this.retry.backoff, this.retry.jitter);
                    }
                    else {
                        delay = calculateDelay(attempt, this.retry.delay, this.retry.backoff, this.retry.jitter);
                    }
                    await sleep(delay);
                    continue;
                }
                return response;
            }
            catch (error) {
                clearTimeout(timeoutId);
                lastError = error;
                if (attempt < this.retry.maxAttempts) {
                    const delay = calculateDelay(attempt, this.retry.delay, this.retry.backoff, this.retry.jitter);
                    await sleep(delay);
                    continue;
                }
            }
        }
        throw lastError || new Error('Request failed after retries');
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
}
export class ReckerWrapper {
    recker;
    client;
    options;
    constructor(options = {}, reckerMod) {
        this.recker = reckerMod;
        this.options = options;
        const retryConfig = options.retry ? {
            maxAttempts: options.retry.maxAttempts ?? options.retry.limit ?? 3,
            backoff: options.retry.backoff ?? 'exponential',
            jitter: options.retry.jitter ?? true
        } : undefined;
        const authHeaders = {};
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
    }
    async request(url, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const requestOptions = {
            headers: options.headers,
            body: options.body
        };
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
    async scrape(url, options = {}) {
        if (this.client.scrape) {
            return this.client.scrape(url, options);
        }
        throw new Error('Scrape not available');
    }
}
export async function createHttpClient(options = {}) {
    const recker = await loadRecker();
    if (recker) {
        return new ReckerWrapper(options, recker);
    }
    return new FetchFallback(options);
}
export function createHttpClientSync(options = {}) {
    if (reckerModule) {
        return new ReckerWrapper(options, reckerModule);
    }
    return new FetchFallback(options);
}
export async function httpGet(url, options = {}) {
    const client = await createHttpClient(options);
    return client.get(url, options);
}
export async function httpPost(url, body, options = {}) {
    const client = await createHttpClient(options);
    return client.post(url, { ...options, body });
}
export async function preloadRecker() {
    await loadRecker();
    return reckerModule !== null;
}
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
//# sourceMappingURL=http-client.js.map