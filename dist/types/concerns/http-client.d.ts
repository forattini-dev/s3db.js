export type AuthType = 'bearer' | 'basic' | 'apikey';
export type BackoffStrategy = 'fixed' | 'exponential';
export interface BearerAuth {
    type: 'bearer';
    token: string;
}
export interface BasicAuth {
    type: 'basic';
    username: string;
    password: string;
}
export interface ApiKeyAuth {
    type: 'apikey';
    header?: string;
    value: string;
}
export type AuthConfig = BearerAuth | BasicAuth | ApiKeyAuth;
export interface RetryConfig {
    maxAttempts?: number;
    delay?: number;
    backoff?: BackoffStrategy;
    jitter?: boolean;
    retryAfter?: boolean;
    retryOn?: number[];
    limit?: number;
}
export interface HttpClientOptions {
    baseUrl?: string;
    headers?: Record<string, string>;
    timeout?: number;
    retry?: RetryConfig;
    auth?: AuthConfig;
}
export interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
    json?: unknown;
}
export interface HttpClient {
    request(url: string, options?: RequestOptions): Promise<Response>;
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, options?: RequestOptions): Promise<Response>;
    put(url: string, options?: RequestOptions): Promise<Response>;
    patch(url: string, options?: RequestOptions): Promise<Response>;
    delete(url: string, options?: RequestOptions): Promise<Response>;
}
interface ReckerModule {
    createClient(options: unknown): ReckerClient;
}
interface ReckerClient {
    get(url: string, options?: unknown): Promise<Response>;
    post(url: string, options?: unknown): Promise<Response>;
    put(url: string, options?: unknown): Promise<Response>;
    patch(url: string, options?: unknown): Promise<Response>;
    delete(url: string, options?: unknown): Promise<Response>;
    request(url: string, options?: unknown): Promise<Response>;
    scrape?(url: string, options?: unknown): Promise<unknown>;
}
export declare function isReckerAvailable(): Promise<boolean>;
export declare class FetchFallback implements HttpClient {
    baseUrl: string;
    defaultHeaders: Record<string, string>;
    timeout: number;
    retry: Required<Omit<RetryConfig, 'limit'>>;
    auth: AuthConfig | null;
    constructor(options?: HttpClientOptions);
    private _buildHeaders;
    request(url: string, options?: RequestOptions): Promise<Response>;
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, options?: RequestOptions): Promise<Response>;
    put(url: string, options?: RequestOptions): Promise<Response>;
    patch(url: string, options?: RequestOptions): Promise<Response>;
    delete(url: string, options?: RequestOptions): Promise<Response>;
}
export declare class ReckerWrapper implements HttpClient {
    private recker;
    private client;
    private options;
    constructor(options: HttpClientOptions | undefined, reckerMod: ReckerModule);
    request(url: string, options?: RequestOptions): Promise<Response>;
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, options?: RequestOptions): Promise<Response>;
    put(url: string, options?: RequestOptions): Promise<Response>;
    patch(url: string, options?: RequestOptions): Promise<Response>;
    delete(url: string, options?: RequestOptions): Promise<Response>;
    scrape(url: string, options?: RequestOptions): Promise<unknown>;
}
export declare function createHttpClient(options?: HttpClientOptions): Promise<HttpClient>;
export declare function createHttpClientSync(options?: HttpClientOptions): HttpClient;
export declare function httpGet(url: string, options?: HttpClientOptions): Promise<Response>;
export declare function httpPost(url: string, body: unknown, options?: HttpClientOptions): Promise<Response>;
export declare function preloadRecker(): Promise<boolean>;
declare const _default: {
    createHttpClient: typeof createHttpClient;
    createHttpClientSync: typeof createHttpClientSync;
    httpGet: typeof httpGet;
    httpPost: typeof httpPost;
    isReckerAvailable: typeof isReckerAvailable;
    preloadRecker: typeof preloadRecker;
    FetchFallback: typeof FetchFallback;
    ReckerWrapper: typeof ReckerWrapper;
};
export default _default;
//# sourceMappingURL=http-client.d.ts.map