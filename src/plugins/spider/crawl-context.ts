export interface CrawlContextConfig {
  userAgent?: string;
  acceptLanguage?: string;
  platform?: 'Windows' | 'Mac' | 'Linux';
  headers?: Record<string, string>;
  proxy?: string | null;
  viewport?: { width: number; height: number };
  screen?: { width: number; height: number };
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
  defaultViewport: { width: number; height: number };
  ignoreDefaultArgs: string[];
}

export interface CrawlContextJSON {
  userAgent: string;
  acceptLanguage: string;
  platform: string;
  cookies: CookieData[];
  headers: Record<string, string>;
  proxy: string | null;
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
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
  setViewport(viewport: { width: number; height: number }): Promise<void>;
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

export class CrawlContext {
  _userAgent: string;
  _acceptLanguage: string;
  _platform: string;
  _cookies: Map<string, CookieData[]>;
  _headers: Record<string, string>;
  _proxy: string | null;
  _viewport: { width: number; height: number };
  _screen: { width: number; height: number };
  _timezone: string;
  _locale: string;
  _lastUrl: string | null;
  _referer: string | null;

  constructor(config: CrawlContextConfig = {}) {
    this._platform = config.platform || 'Windows';
    this._userAgent = config.userAgent || this._generateUserAgent();
    this._acceptLanguage = config.acceptLanguage || 'en-US,en;q=0.9';

    this._cookies = new Map();

    this._headers = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': this._acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      ...config.headers
    };

    this._proxy = config.proxy || null;

    this._viewport = config.viewport || { width: 1920, height: 1080 };
    this._screen = config.screen || { width: 1920, height: 1080 };

    this._timezone = config.timezone || 'America/New_York';
    this._locale = config.locale || 'en-US';

    this._lastUrl = null;
    this._referer = null;
  }

  get userAgent(): string {
    return this._userAgent;
  }

  set userAgent(ua: string) {
    this._userAgent = ua;
  }

  get viewport(): { width: number; height: number } {
    return this._viewport;
  }

  get timezone(): string {
    return this._timezone;
  }

  setCookies(cookies: CookieData[], source: string = 'manual'): void {
    for (const cookie of cookies) {
      const domain = cookie.domain || this._extractDomain(cookie.url);
      if (!domain) continue;

      const normalizedDomain = domain.replace(/^\./, '');

      if (!this._cookies.has(normalizedDomain)) {
        this._cookies.set(normalizedDomain, []);
      }

      const existing = this._cookies.get(normalizedDomain)!;
      const idx = existing.findIndex(c => c.name === cookie.name && c.path === (cookie.path || '/'));

      const cookieData: CookieData = {
        name: cookie.name,
        value: cookie.value,
        domain: normalizedDomain,
        path: cookie.path || '/',
        expires: cookie.expires,
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'Lax',
        _source: source,
        _updatedAt: Date.now()
      };

      if (idx >= 0) {
        existing[idx] = cookieData;
      } else {
        existing.push(cookieData);
      }
    }
  }

  setCookiesFromHeader(setCookieHeader: string | string[], url: string): void {
    if (!setCookieHeader) return;

    const headers = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];

    const cookies = headers.map(h => this._parseSetCookie(h, url)).filter((c): c is CookieData => c !== null);
    this.setCookies(cookies, 'recker');
  }

  getCookieHeader(url: string): string {
    const cookies = this._getMatchingCookies(url);

    if (cookies.length === 0) return '';

    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  getCookiesForPuppeteer(url: string): PuppeteerCookie[] {
    const urlObj = new URL(url);

    return this._getMatchingCookies(url).map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain!.startsWith('.') ? c.domain! : '.' + c.domain!,
      path: c.path || '/',
      expires: c.expires ? Math.floor(c.expires / 1000) : -1,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: this._normalizeSameSite(c.sameSite),
      url: `${urlObj.protocol}//${c.domain}${c.path || '/'}`
    }));
  }

  getAllCookies(): CookieData[] {
    const result: CookieData[] = [];
    for (const [, cookies] of this._cookies) {
      result.push(...cookies);
    }
    return result;
  }

  getCookiesForDomain(domain: string): (CookieData & { source?: string })[] {
    const normalizedDomain = domain.replace(/^\./, '');
    const result: (CookieData & { source?: string })[] = [];

    for (const [cookieDomain, cookies] of this._cookies) {
      if (this._domainMatches(normalizedDomain, cookieDomain) ||
          this._domainMatches(cookieDomain, normalizedDomain)) {
        for (const cookie of cookies) {
          result.push({ ...cookie, source: cookie._source });
        }
      }
    }

    return result;
  }

  clearCookies(domain?: string): void {
    if (domain) {
      const normalizedDomain = domain.replace(/^\./, '');
      this._cookies.delete(normalizedDomain);
    } else {
      this._cookies.clear();
    }
  }

  async importFromPuppeteer(pageOrCookies: Page | CookieData[]): Promise<void> {
    let cookies: CookieData[];

    if (Array.isArray(pageOrCookies)) {
      cookies = pageOrCookies.map(c => ({
        ...c,
        expires: c.expires && c.expires > 0 ? c.expires * 1000 : undefined
      }));
    } else {
      const rawCookies = await pageOrCookies.cookies();
      cookies = rawCookies.map(c => ({
        ...c,
        expires: c.expires && c.expires > 0 ? c.expires * 1000 : undefined
      }));
    }

    this.setCookies(cookies, 'puppeteer');
  }

  async exportToPuppeteer(page: Page, url?: string): Promise<void> {
    const targetUrl = url || page.url();
    if (!targetUrl || targetUrl === 'about:blank') return;

    const cookies = this.getCookiesForPuppeteer(targetUrl);
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
    }
  }

  getHttpClientConfig(url: string): HttpClientConfig {
    const config: HttpClientConfig = {
      headers: {
        ...this._headers,
        'User-Agent': this._userAgent
      },
      timeout: 30000,
      retry: {
        maxAttempts: 3,
        delay: 1000,
        backoff: 'exponential',
        jitter: true,
        retryAfter: true,
        retryOn: [429, 500, 502, 503, 504]
      }
    };

    const cookieHeader = this.getCookieHeader(url);
    if (cookieHeader) {
      config.headers['Cookie'] = cookieHeader;
    }

    if (this._referer) {
      config.headers['Referer'] = this._referer;
    }

    if (this._proxy) {
      config.proxy = this._proxy;
    }

    return config;
  }

  getLaunchConfig(): PuppeteerLaunchConfig {
    const args = [
      `--window-size=${this._viewport.width},${this._viewport.height}`,
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-infobars',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ];

    if (this._proxy) {
      args.push(`--proxy-server=${this._proxy}`);
    }

    return {
      headless: 'new',
      args,
      defaultViewport: this._viewport,
      ignoreDefaultArgs: ['--enable-automation']
    };
  }

  async configurePage(page: Page): Promise<Page> {
    await page.setUserAgent(this._userAgent);

    await page.setViewport(this._viewport);

    try {
      await page.emulateTimezone(this._timezone);
    } catch {
      // Timezone emulation may not be available in all puppeteer versions
    }

    await page.setExtraHTTPHeaders({
      'Accept-Language': this._acceptLanguage
    });

    await page.evaluateOnNewDocument((config: { platform: string; locale: string; screen: { width: number; height: number } }) => {
      Object.defineProperty(navigator, 'platform', { get: () => config.platform });
      Object.defineProperty(navigator, 'language', { get: () => config.locale });
      Object.defineProperty(navigator, 'languages', { get: () => [config.locale, 'en'] });

      Object.defineProperty(screen, 'width', { get: () => config.screen.width });
      Object.defineProperty(screen, 'height', { get: () => config.screen.height });
      Object.defineProperty(screen, 'availWidth', { get: () => config.screen.width });
      Object.defineProperty(screen, 'availHeight', { get: () => config.screen.height - 40 });

      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      (window as unknown as { chrome?: { runtime: Record<string, unknown> } }).chrome = { runtime: {} };

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery.call(window.navigator.permissions, parameters)
      );
    }, {
      platform: this._platform,
      locale: this._locale,
      screen: this._screen
    });

    const currentUrl = page.url();
    if (currentUrl && currentUrl !== 'about:blank') {
      await this.exportToPuppeteer(page, currentUrl);
    }

    page.on('response', async (response: PuppeteerResponse) => {
      try {
        const headers = response.headers();
        const setCookie = headers['set-cookie'];
        if (setCookie) {
          this.setCookiesFromHeader(setCookie, response.url());
        }
      } catch {
        // Ignore errors from detached frames
      }
    });

    return page;
  }

  processResponse(response: HttpResponse, url: string): void {
    if (!response || !response.headers) return;

    let setCookies: string | string[] | null = null;

    if (typeof response.headers.getSetCookie === 'function') {
      setCookies = response.headers.getSetCookie();
    } else if (typeof response.headers.get === 'function') {
      setCookies = response.headers.get('set-cookie');
    } else {
      setCookies = response.headers['set-cookie'] as string | string[];
    }

    if (setCookies) {
      this.setCookiesFromHeader(setCookies, url);
    }

    this._lastUrl = url;
    this._referer = url;
  }

  setReferer(url: string): void {
    this._referer = url;
  }

  toJSON(): CrawlContextJSON {
    const cookies = this.getAllCookies();

    return {
      userAgent: this._userAgent,
      acceptLanguage: this._acceptLanguage,
      platform: this._platform,
      cookies,
      headers: this._headers,
      proxy: this._proxy,
      viewport: this._viewport,
      screen: this._screen,
      timezone: this._timezone,
      locale: this._locale,
      lastUrl: this._lastUrl,
      referer: this._referer
    };
  }

  static fromJSON(json: Partial<CrawlContextJSON> | null): CrawlContext {
    if (!json) json = {};

    const ctx = new CrawlContext({
      userAgent: json.userAgent,
      acceptLanguage: json.acceptLanguage,
      platform: json.platform as 'Windows' | 'Mac' | 'Linux',
      headers: json.headers,
      proxy: json.proxy,
      viewport: json.viewport,
      screen: json.screen,
      timezone: json.timezone,
      locale: json.locale
    });

    if (json.cookies) {
      if (Array.isArray(json.cookies)) {
        ctx.setCookies(json.cookies, 'restored');
      } else {
        ctx._cookies = new Map(Object.entries(json.cookies as unknown as Record<string, CookieData[]>));
      }
    }

    ctx._lastUrl = json.lastUrl || null;
    ctx._referer = json.referer || null;

    return ctx;
  }

  private _generateUserAgent(): string {
    const chromeVersion = '120.0.6099.109';
    const platforms: Record<string, string> = {
      'Windows': 'Windows NT 10.0; Win64; x64',
      'Mac': 'Macintosh; Intel Mac OS X 10_15_7',
      'Linux': 'X11; Linux x86_64'
    };

    const platform = platforms[this._platform] || platforms['Windows'];

    return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  }

  private _extractDomain(url?: string): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  private _parseSetCookie(header: string, url: string): CookieData | null {
    if (!header || typeof header !== 'string') return null;

    const parts = header.split(';').map(p => p.trim());
    if (parts.length === 0) return null;

    const [nameValue, ...attrs] = parts;
    if (!nameValue) return null;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) return null;

    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();

    if (!name) return null;

    const cookie: CookieData = {
      name,
      value,
      domain: this._extractDomain(url) || undefined,
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'Lax'
    };

    for (const attr of attrs) {
      const attrLower = attr.toLowerCase();
      const eqIdx = attr.indexOf('=');

      if (eqIdx === -1) {
        if (attrLower === 'secure') cookie.secure = true;
        else if (attrLower === 'httponly') cookie.httpOnly = true;
      } else {
        const key = attr.slice(0, eqIdx).trim().toLowerCase();
        const val = attr.slice(eqIdx + 1).trim();

        switch (key) {
          case 'domain':
            cookie.domain = val.replace(/^\./, '');
            break;
          case 'path':
            cookie.path = val || '/';
            break;
          case 'expires':
            try {
              cookie.expires = new Date(val).getTime();
            } catch {
              // Invalid date
            }
            break;
          case 'max-age': {
            const maxAge = parseInt(val, 10);
            if (!isNaN(maxAge)) {
              cookie.expires = Date.now() + maxAge * 1000;
            }
            break;
          }
          case 'samesite':
            cookie.sameSite = val;
            break;
        }
      }
    }

    return cookie;
  }

  private _getMatchingCookies(url: string): CookieData[] {
    if (!url) return [];

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return [];
    }

    const domain = urlObj.hostname;
    const path = urlObj.pathname;
    const isSecure = urlObj.protocol === 'https:';
    const now = Date.now();

    const result: CookieData[] = [];

    for (const [cookieDomain, cookies] of this._cookies) {
      if (!this._domainMatches(domain, cookieDomain)) continue;

      for (const cookie of cookies) {
        if (cookie.expires && cookie.expires < now) continue;

        if (cookie.secure && !isSecure) continue;

        if (!path.startsWith(cookie.path || '/')) continue;

        result.push(cookie);
      }
    }

    return result;
  }

  private _domainMatches(requestDomain: string, cookieDomain: string): boolean {
    if (requestDomain === cookieDomain) return true;

    if (requestDomain.endsWith('.' + cookieDomain)) return true;

    return false;
  }

  private _normalizeSameSite(value?: string): 'Strict' | 'Lax' | 'None' {
    if (!value) return 'Lax';

    const normalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

    if (normalized === 'Strict' || normalized === 'Lax' || normalized === 'None') {
      return normalized;
    }

    return 'Lax';
  }
}

export default CrawlContext;
