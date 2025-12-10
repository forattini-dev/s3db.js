import type { PuppeteerPlugin } from '../puppeteer.plugin.js';
import { CookieManagerError } from '../puppeteer.errors.js';

export interface CookieData {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface SessionData {
  sessionId: string;
  cookies: CookieData[];
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  proxyId?: string;
  domain: string;
  date: string;
  reputation: {
    successCount: number;
    failCount: number;
    successRate: number;
    lastUsed: number;
  };
  metadata: {
    createdAt: number;
    expiresAt: number;
    requestCount: number;
    age: number;
  };
}

export interface CookieManagerConfig {
  enabled: boolean;
  storage: {
    resource: string;
    autoSave: boolean;
    autoLoad: boolean;
    encrypt: boolean;
  };
  farming: {
    enabled: boolean;
    warmup: {
      enabled: boolean;
      pages: string[];
      randomOrder: boolean;
      timePerPage: { min: number; max: number };
      interactions: { scroll: boolean; click: boolean; hover: boolean };
    };
    rotation: {
      enabled: boolean;
      requestsPerCookie: number;
      maxAge: number;
      poolSize: number;
    };
    reputation: {
      enabled: boolean;
      trackSuccess: boolean;
      retireThreshold: number;
      ageBoost: boolean;
    };
  };
}

export interface CookieStats {
  total: number;
  healthy: number;
  unhealthy: number;
  averageAge: number;
  averageSuccessRate: number;
  byDomain: Record<string, number>;
}

export interface SaveSessionOptions {
  success?: boolean;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
  proxyId?: string;
}

interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

interface Database {
  createResource(config: Record<string, unknown>): Promise<unknown>;
  getResource(name: string): Promise<Resource>;
  resources: Record<string, Resource>;
}

interface Resource {
  name: string;
  get(id: string): Promise<SessionData | null>;
  insert(data: Record<string, unknown>): Promise<SessionData>;
  patch(id: string, data: Record<string, unknown>): Promise<SessionData>;
  list(options: { limit: number }): Promise<SessionData[]>;
}

interface Page {
  cookies(): Promise<CookieData[]>;
  setCookie(...cookies: CookieData[]): Promise<void>;
  url(): string;
  goto(url: string, options?: { waitUntil?: string }): Promise<void>;
  evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
  $$(selector: string): Promise<ElementHandle[]>;
  _userAgent?: string;
  _viewport?: { width: number; height: number; deviceScaleFactor: number };
  _proxyId?: string;
}

interface ElementHandle {
  click(): Promise<void>;
  hover(): Promise<void>;
}

export class CookieManager {
  plugin: PuppeteerPlugin;
  config: CookieManagerConfig;
  storage: Resource | null;
  sessions: Map<string, SessionData>;

  constructor(plugin: PuppeteerPlugin) {
    this.plugin = plugin;
    this.config = (plugin.config as { cookies: CookieManagerConfig }).cookies;
    this.storage = null;
    this.sessions = new Map();
  }

  get database(): Database {
    return this.plugin.database as unknown as Database;
  }

  get logger(): Logger {
    return this.plugin.logger as Logger;
  }

  async initialize(): Promise<void> {
    const resourceName = this.config.storage.resource;

    try {
      this.storage = await this.database.getResource(resourceName);
    } catch {
      throw new CookieManagerError(`Cookie storage resource '${resourceName}' not found`, {
        operation: 'initialize',
        retriable: false,
        suggestion: 'Ensure the cookie storage resource is created during plugin installation.'
      });
    }

    if (this.config.storage.autoLoad) {
      await this._loadAllSessions();
    }

    this.plugin.emit('cookieManager.initialized', {
      resource: resourceName,
      sessionsLoaded: this.sessions.size
    });
  }

  private async _loadAllSessions(): Promise<void> {
    if (!this.storage) return;

    const sessions = await this.storage.list({ limit: 10000 });

    for (const session of sessions) {
      this.sessions.set(session.sessionId, session);
    }
  }

  async loadSession(page: Page, sessionId: string): Promise<boolean> {
    let session = this.sessions.get(sessionId);

    if (!session && this.storage) {
      try {
        session = await this.storage.get(sessionId) || undefined;
        if (session) {
          this.sessions.set(sessionId, session);
        }
      } catch {
        // Session doesn't exist
      }
    }

    if (!session || !session.cookies || session.cookies.length === 0) {
      return false;
    }

    // Set cookies on page
    await page.setCookie(...session.cookies);

    // Update last used
    session.reputation.lastUsed = Date.now();
    session.metadata.requestCount++;

    this.plugin.emit('cookieManager.sessionLoaded', {
      sessionId,
      cookieCount: session.cookies.length
    });

    return true;
  }

  async saveSession(page: Page, sessionId: string, options: SaveSessionOptions = {}): Promise<SessionData> {
    const cookies = await page.cookies();
    const url = new URL(page.url());
    const domain = url.hostname;
    const now = Date.now();
    const date = new Date().toISOString().split('T')[0];

    let session = this.sessions.get(sessionId);

    if (session) {
      // Update existing session
      session.cookies = cookies;
      session.domain = domain;
      session.date = date as string;
      session.metadata.age = now - session.metadata.createdAt;

      if (options.success !== undefined) {
        if (options.success) {
          session.reputation.successCount++;
        } else {
          session.reputation.failCount++;
        }
        session.reputation.successRate = session.reputation.successCount /
          (session.reputation.successCount + session.reputation.failCount);
      }

      if (this.storage) {
        await this.storage.patch(sessionId, session as unknown as Record<string, unknown>);
      }
    } else {
      // Create new session
      session = {
        sessionId,
        cookies,
        userAgent: options.userAgent || page._userAgent,
        viewport: options.viewport || page._viewport,
        proxyId: options.proxyId || page._proxyId,
        domain,
        date: date as string,
        reputation: {
          successCount: options.success ? 1 : 0,
          failCount: options.success === false ? 1 : 0,
          successRate: options.success ? 1 : (options.success === false ? 0 : 1),
          lastUsed: now
        },
        metadata: {
          createdAt: now,
          expiresAt: now + (this.config.farming.rotation.maxAge || 86400000),
          requestCount: 1,
          age: 0
        }
      };

      if (this.storage) {
        await this.storage.insert(session as unknown as Record<string, unknown>);
      }

      this.sessions.set(sessionId, session);
    }

    this.plugin.emit('cookieManager.sessionSaved', {
      sessionId,
      cookieCount: cookies.length,
      domain
    });

    return session as SessionData;
  }

  async farmCookies(sessionId: string): Promise<void> {
    if (!this.config.farming.enabled || !this.config.farming.warmup.enabled) {
      throw new CookieManagerError('Cookie farming is not enabled', {
        operation: 'farmCookies',
        retriable: false,
        suggestion: 'Enable farming in the configuration: cookies.farming.enabled = true'
      });
    }

    const pages = [...this.config.farming.warmup.pages];

    if (this.config.farming.warmup.randomOrder) {
      // Shuffle pages
      for (let i = pages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pages[i], pages[j]] = [pages[j] as string, pages[i] as string];
      }
    }

    this.plugin.emit('cookieManager.farmingStarted', {
      sessionId,
      pages: pages.length
    });

    const puppeteerPlugin = this.plugin as unknown as {
      navigate(url: string, options: { useSession: string }): Promise<Page>;
    };

    for (const url of pages) {
      try {
        const page = await puppeteerPlugin.navigate(url, { useSession: sessionId });

        // Wait random time
        const { min, max } = this.config.farming.warmup.timePerPage;
        const waitTime = min + Math.random() * (max - min);
        await this._delay(waitTime);

        // Perform interactions
        if (this.config.farming.warmup.interactions.scroll) {
          await this._randomScroll(page);
        }

        if (this.config.farming.warmup.interactions.hover) {
          await this._randomHover(page);
        }

        if (this.config.farming.warmup.interactions.click) {
          await this._randomClick(page);
        }

        await page.goto('about:blank');

        this.plugin.emit('cookieManager.farmingPageVisited', {
          sessionId,
          url
        });
      } catch (err) {
        this.plugin.emit('cookieManager.farmingPageFailed', {
          sessionId,
          url,
          error: (err as Error).message
        });
      }
    }

    this.plugin.emit('cookieManager.farmingCompleted', {
      sessionId,
      pages: pages.length
    });
  }

  private async _randomScroll(page: Page): Promise<void> {
    const scrollDistance = Math.floor(Math.random() * 500) + 200;
    await page.evaluate((distance: number) => {
      window.scrollBy(0, distance);
    }, scrollDistance);
    await this._delay(500 + Math.random() * 1000);
  }

  private async _randomHover(page: Page): Promise<void> {
    try {
      const elements = await page.$$('a, button');
      if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)]!;
        await randomElement.hover();
        await this._delay(300 + Math.random() * 500);
      }
    } catch {
      // Ignore hover errors
    }
  }

  private async _randomClick(page: Page): Promise<void> {
    try {
      // Only click on safe elements (avoid logout, delete, etc.)
      const elements = await page.$$('a[href^="/"], a[href^="https://"]');
      const safeElements = [];

      for (const el of elements) {
        safeElements.push(el);
        if (safeElements.length >= 5) break;
      }

      if (safeElements.length > 0 && Math.random() < 0.3) {
        // 30% chance to click
        const randomElement = safeElements[Math.floor(Math.random() * safeElements.length)]!;
        await randomElement.click();
        await this._delay(1000 + Math.random() * 2000);
      }
    } catch {
      // Ignore click errors
    }
  }

  async getStats(): Promise<CookieStats> {
    const stats: CookieStats = {
      total: this.sessions.size,
      healthy: 0,
      unhealthy: 0,
      averageAge: 0,
      averageSuccessRate: 0,
      byDomain: {}
    };

    let totalAge = 0;
    let totalSuccessRate = 0;

    for (const session of this.sessions.values()) {
      // Count by health
      if (session.reputation.successRate >= (this.config.farming.reputation.retireThreshold || 0.5)) {
        stats.healthy++;
      } else {
        stats.unhealthy++;
      }

      // Sum for averages
      totalAge += session.metadata.age;
      totalSuccessRate += session.reputation.successRate;

      // Count by domain
      if (!stats.byDomain[session.domain]) {
        stats.byDomain[session.domain] = 0;
      }
      stats.byDomain[session.domain] = (stats.byDomain[session.domain] ?? 0) + 1;
    }

    if (this.sessions.size > 0) {
      stats.averageAge = totalAge / this.sessions.size;
      stats.averageSuccessRate = totalSuccessRate / this.sessions.size;
    }

    return stats;
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async rotateSession(sessionId: string): Promise<string> {
    const oldSession = this.sessions.get(sessionId);

    // Generate new session ID
    const newSessionId = `${sessionId}_${Date.now()}`;

    // Copy old session data if exists
    if (oldSession) {
      const newSession: SessionData = {
        ...oldSession,
        sessionId: newSessionId,
        metadata: {
          ...oldSession.metadata,
          createdAt: Date.now(),
          age: 0
        },
        reputation: {
          successCount: 0,
          failCount: 0,
          successRate: 1,
          lastUsed: Date.now()
        }
      };

      this.sessions.set(newSessionId, newSession);

      if (this.storage) {
        await this.storage.insert(newSession as unknown as Record<string, unknown>);
      }
    }

    this.plugin.emit('cookieManager.sessionRotated', {
      oldSessionId: sessionId,
      newSessionId
    });

    return newSessionId;
  }

  private async _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CookieManager;
