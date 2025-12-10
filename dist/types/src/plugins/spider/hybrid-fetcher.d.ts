import { CrawlContext } from './crawl-context.js';
export interface HybridFetcherConfig {
    context?: CrawlContext;
    strategy?: 'auto' | 'recker-only' | 'puppeteer-only';
    timeout?: number;
    navigationTimeout?: number;
    puppeteerOptions?: Record<string, unknown>;
    httpClient?: HttpClient | null;
    jsDetectionPatterns?: RegExp[];
    userAgent?: string;
    acceptLanguage?: string;
    platform?: 'Windows' | 'Mac' | 'Linux';
    headers?: Record<string, string>;
    proxy?: string | null;
    viewport?: {
        width: number;
        height: number;
    };
}
export interface FetchResult {
    html: string;
    response?: HttpResponse | PuppeteerResponse;
    url?: string;
    ok?: boolean;
    status?: number;
    headers?: Headers | Record<string, string>;
    source: 'recker' | 'puppeteer';
    method?: string;
    page?: Page;
}
export interface FetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    waitUntil?: string;
    timeout?: number;
    keepPage?: boolean;
}
export interface HeadResult {
    status: number;
    headers: Headers | Record<string, string>;
    ok: boolean;
}
export interface FetcherStats {
    reckerRequests: number;
    puppeteerRequests: number;
    fallbacks: number;
    errors: number;
    browserActive: boolean;
    httpClientActive: boolean;
}
interface HttpClient {
    get(url: string, options?: {
        headers?: Record<string, string>;
    }): Promise<HttpResponse>;
    post(url: string, options?: {
        headers?: Record<string, string>;
        body?: unknown;
    }): Promise<HttpResponse>;
    request(url: string, options?: Record<string, unknown>): Promise<HttpResponse>;
}
interface HttpResponse {
    ok: boolean;
    status: number;
    headers: Headers;
    text(): Promise<string>;
}
interface Headers {
    get(name: string): string | null;
    [key: string]: unknown;
}
interface Page {
    goto(url: string, options?: {
        waitUntil?: string;
        timeout?: number;
    }): Promise<PuppeteerResponse | null>;
    content(): Promise<string>;
    close(): Promise<void>;
}
interface PuppeteerResponse {
    status(): number;
}
interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
}
interface PuppeteerModule {
    default: {
        launch(options: Record<string, unknown>): Promise<Browser>;
    };
}
export declare class HybridFetcher {
    context: CrawlContext;
    strategy: 'auto' | 'recker-only' | 'puppeteer-only';
    timeout: number;
    navigationTimeout: number;
    puppeteerOptions: Record<string, unknown>;
    _customHttpClient: HttpClient | null;
    _httpClient: HttpClient | null;
    _browser: Browser | null;
    _puppeteer: PuppeteerModule | null;
    _jsPatterns: RegExp[];
    stats: {
        reckerRequests: number;
        puppeteerRequests: number;
        fallbacks: number;
        errors: number;
    };
    constructor(config?: HybridFetcherConfig);
    private _getHttpClient;
    private _getBrowser;
    private _needsJavaScript;
    fetchWithRecker(url: string, options?: FetchOptions): Promise<FetchResult>;
    fetchWithPuppeteer(url: string, options?: FetchOptions): Promise<FetchResult>;
    fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
    post(url: string, options?: FetchOptions): Promise<FetchResult>;
    head(url: string, options?: FetchOptions): Promise<HeadResult>;
    needsPuppeteer(url: string): Promise<boolean>;
    getStats(): FetcherStats;
    close(): Promise<void>;
    isPuppeteerAvailable(): Promise<boolean>;
}
export default HybridFetcher;
//# sourceMappingURL=hybrid-fetcher.d.ts.map