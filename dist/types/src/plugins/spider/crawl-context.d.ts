export interface CrawlContextConfig {
    userAgent?: string;
    acceptLanguage?: string;
    platform?: 'Windows' | 'Mac' | 'Linux';
    headers?: Record<string, string>;
    proxy?: string | null;
    viewport?: {
        width: number;
        height: number;
    };
    screen?: {
        width: number;
        height: number;
    };
    timezone?: string;
    locale?: string;
}
export interface CookieData {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None' | string;
    url?: string;
    _source?: string;
    _updatedAt?: number;
}
export interface PuppeteerCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
    url: string;
}
export interface HttpClientConfig {
    headers: Record<string, string>;
    timeout: number;
    proxy?: string;
    retry: {
        maxAttempts: number;
        delay: number;
        backoff: string;
        jitter: boolean;
        retryAfter: boolean;
        retryOn: number[];
    };
}
export interface PuppeteerLaunchConfig {
    headless: string;
    args: string[];
    defaultViewport: {
        width: number;
        height: number;
    };
    ignoreDefaultArgs: string[];
}
export interface CrawlContextJSON {
    userAgent: string;
    acceptLanguage: string;
    platform: string;
    cookies: CookieData[];
    headers: Record<string, string>;
    proxy: string | null;
    viewport: {
        width: number;
        height: number;
    };
    screen: {
        width: number;
        height: number;
    };
    timezone: string;
    locale: string;
    lastUrl: string | null;
    referer: string | null;
}
interface Page {
    url(): string;
    cookies(): Promise<CookieData[]>;
    setCookie(...cookies: PuppeteerCookie[]): Promise<void>;
    setUserAgent(userAgent: string): Promise<void>;
    setViewport(viewport: {
        width: number;
        height: number;
    }): Promise<void>;
    emulateTimezone(timezone: string): Promise<void>;
    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
    evaluateOnNewDocument<T>(fn: (arg: T) => void, arg: T): Promise<void>;
    on(event: string, handler: (response: PuppeteerResponse) => void): void;
}
interface PuppeteerResponse {
    url(): string;
    headers(): Record<string, string>;
}
interface HttpResponse {
    headers: {
        get?(name: string): string | null;
        getSetCookie?(): string[];
        [key: string]: unknown;
    };
}
export declare class CrawlContext {
    _userAgent: string;
    _acceptLanguage: string;
    _platform: string;
    _cookies: Map<string, CookieData[]>;
    _headers: Record<string, string>;
    _proxy: string | null;
    _viewport: {
        width: number;
        height: number;
    };
    _screen: {
        width: number;
        height: number;
    };
    _timezone: string;
    _locale: string;
    _lastUrl: string | null;
    _referer: string | null;
    constructor(config?: CrawlContextConfig);
    get userAgent(): string;
    set userAgent(ua: string);
    get viewport(): {
        width: number;
        height: number;
    };
    get timezone(): string;
    setCookies(cookies: CookieData[], source?: string): void;
    setCookiesFromHeader(setCookieHeader: string | string[], url: string): void;
    getCookieHeader(url: string): string;
    getCookiesForPuppeteer(url: string): PuppeteerCookie[];
    getAllCookies(): CookieData[];
    getCookiesForDomain(domain: string): (CookieData & {
        source?: string;
    })[];
    clearCookies(domain?: string): void;
    importFromPuppeteer(pageOrCookies: Page | CookieData[]): Promise<void>;
    exportToPuppeteer(page: Page, url?: string): Promise<void>;
    getHttpClientConfig(url: string): HttpClientConfig;
    getLaunchConfig(): PuppeteerLaunchConfig;
    configurePage(page: Page): Promise<Page>;
    processResponse(response: HttpResponse, url: string): void;
    setReferer(url: string): void;
    toJSON(): CrawlContextJSON;
    static fromJSON(json: Partial<CrawlContextJSON> | null): CrawlContext;
    private _generateUserAgent;
    private _extractDomain;
    private _parseSetCookie;
    private _getMatchingCookies;
    private _domainMatches;
    private _normalizeSameSite;
}
export default CrawlContext;
//# sourceMappingURL=crawl-context.d.ts.map