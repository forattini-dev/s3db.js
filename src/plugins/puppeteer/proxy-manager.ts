import { BrowserPoolError } from '../puppeteer.errors.js';
import type { PuppeteerPlugin } from '../puppeteer.plugin.js';

export interface ProxyConfig {
  id?: string;
  protocol: string;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  url: string;
}

export interface ProxyManagerConfig {
  enabled: boolean;
  list: (string | Partial<ProxyConfig>)[];
  selectionStrategy: 'round-robin' | 'random' | 'least-used' | 'best-performance';
  bypassList?: string[];
  healthCheck?: {
    enabled?: boolean;
    interval?: number;
    testUrl?: string;
    timeout?: number;
    successRateThreshold?: number;
  };
}

export interface ProxyStats {
  requests: number;
  failures: number;
  successRate: number;
  lastUsed: number;
  healthy: boolean;
  createdAt: number;
}

export interface ProxyStatResult {
  proxyId: string;
  url: string;
  requests: number;
  failures: number;
  successRate: number;
  lastUsed: number;
  healthy: boolean;
  createdAt: number;
  boundSessions: number;
}

export interface SessionBinding {
  sessionId: string;
  proxyId: string;
  proxyUrl: string;
}

export interface HealthCheckResult {
  total: number;
  healthy: number;
  unhealthy: number;
  checks: Array<{
    proxyId: string;
    url: string;
    healthy: boolean;
  }>;
}

interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

interface CookieManager {
  storage?: {
    list(options: { limit: number }): Promise<Array<{ sessionId: string; proxyId?: string }>>;
  };
}

interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

interface Page {
  authenticate(credentials: { username: string; password: string }): Promise<void>;
  goto(url: string, options?: { timeout?: number }): Promise<void>;
}

interface PuppeteerInstance {
  launch(options: Record<string, unknown>): Promise<Browser>;
}

export class ProxyManager {
  plugin: PuppeteerPlugin;
  config: ProxyManagerConfig;
  storage: unknown;
  proxies: ProxyConfig[];
  proxyStats: Map<string, ProxyStats>;
  sessionProxyMap: Map<string, string>;
  selectionStrategy: string;
  currentProxyIndex: number;

  constructor(plugin: PuppeteerPlugin) {
    this.plugin = plugin;
    this.config = (plugin.config as { proxy: ProxyManagerConfig }).proxy;
    this.storage = null;

    this.proxies = [];
    this.proxyStats = new Map();
    this.sessionProxyMap = new Map();
    this.selectionStrategy = this.config.selectionStrategy || 'round-robin';
    this.currentProxyIndex = 0;
  }

  get logger(): Logger {
    return this.plugin.logger as Logger;
  }

  get puppeteer(): PuppeteerInstance {
    return (this.plugin as unknown as { puppeteer: PuppeteerInstance }).puppeteer;
  }

  get cookieManager(): CookieManager | null {
    return (this.plugin as unknown as { cookieManager: CookieManager | null }).cookieManager;
  }

  async initialize(): Promise<void> {
    if (this.config.enabled && this.config.list && this.config.list.length > 0) {
      this.proxies = this.config.list.map((proxy, index) => ({
        id: `proxy_${index}`,
        ...this._parseProxy(proxy)
      }));

      for (const proxy of this.proxies) {
        this.proxyStats.set(proxy.id!, {
          requests: 0,
          failures: 0,
          successRate: 1.0,
          lastUsed: 0,
          healthy: true,
          createdAt: Date.now()
        });
      }

      this.plugin.emit('proxyManager.initialized', {
        count: this.proxies.length,
        strategy: this.selectionStrategy
      });
    }

    if (this.cookieManager?.storage) {
      await this._loadSessionProxyBindings();
    }
  }

  private _parseProxy(proxy: string | Partial<ProxyConfig>): Omit<ProxyConfig, 'id'> {
    if (typeof proxy === 'string') {
      const url = new URL(proxy);
      return {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        username: url.username || null,
        password: url.password || null,
        url: proxy
      };
    } else {
      const protocol = proxy.protocol || 'http';
      const host = proxy.host!;
      const port = proxy.port || (protocol === 'https' ? 443 : 80);
      const username = proxy.username || null;
      const password = proxy.password || null;

      let url = `${protocol}://`;
      if (username && password) {
        url += `${username}:${password}@`;
      }
      url += `${host}:${port}`;

      return {
        protocol,
        host,
        port,
        username,
        password,
        url
      };
    }
  }

  private async _loadSessionProxyBindings(): Promise<void> {
    const storage = this.cookieManager?.storage;
    if (!storage) return;

    const sessions = await storage.list({ limit: 1000 });

    for (const session of sessions) {
      if (session.proxyId) {
        this.sessionProxyMap.set(session.sessionId, session.proxyId);
      }
    }

    this.plugin.emit('proxyManager.bindingsLoaded', {
      count: this.sessionProxyMap.size
    });
  }

  getProxyForSession(sessionId: string, createIfMissing: boolean = true): ProxyConfig | null {
    if (!this.config.enabled || this.proxies.length === 0) {
      return null;
    }

    if (this.sessionProxyMap.has(sessionId)) {
      const proxyId = this.sessionProxyMap.get(sessionId)!;
      const proxy = this.proxies.find(p => p.id === proxyId);

      if (!proxy) {
        throw new BrowserPoolError(`Proxy ${proxyId} bound to session ${sessionId} not found in pool`, {
          operation: 'getProxyForSession',
          retriable: false,
          suggestion: 'Ensure proxies remain registered while sessions are active.',
          proxyId,
          sessionId
        });
      }

      const stats = this.proxyStats.get(proxyId);
      if (!stats || !stats.healthy) {
        throw new BrowserPoolError(`Proxy ${proxyId} bound to session ${sessionId} is unhealthy`, {
          operation: 'getProxyForSession',
          retriable: true,
          suggestion: 'Rebind the session to a healthy proxy or refresh the proxy pool.',
          proxyId,
          sessionId
        });
      }

      return proxy;
    }

    if (createIfMissing) {
      const proxy = this._selectProxy();

      if (proxy) {
        this.sessionProxyMap.set(sessionId, proxy.id!);

        this.plugin.emit('proxyManager.sessionBound', {
          sessionId,
          proxyId: proxy.id,
          proxyUrl: this._maskProxyUrl(proxy.url)
        });

        return proxy;
      }
    }

    return null;
  }

  private _selectProxy(): ProxyConfig {
    const healthyProxies = this.proxies.filter(proxy => {
      const stats = this.proxyStats.get(proxy.id!);
      return stats ? stats.healthy : false;
    });

    if (healthyProxies.length === 0) {
      throw new BrowserPoolError('No healthy proxies available', {
        operation: '_selectProxy',
        retriable: true,
        suggestion: 'Add healthy proxies to the configuration or allow existing proxies to recover.',
        available: this.proxies.length
      });
    }

    let selectedProxy: ProxyConfig | undefined;

    switch (this.selectionStrategy) {
      case 'round-robin':
        selectedProxy = healthyProxies[this.currentProxyIndex % healthyProxies.length];
        this.currentProxyIndex++;
        break;

      case 'random':
        selectedProxy = healthyProxies[Math.floor(Math.random() * healthyProxies.length)];
        break;

      case 'least-used':
        selectedProxy = healthyProxies.reduce((min, proxy) => {
          const proxyStats = this.proxyStats.get(proxy.id!);
          const minStats = this.proxyStats.get(min.id!);
          return proxyStats!.requests < minStats!.requests ? proxy : min;
        });
        break;

      case 'best-performance':
        selectedProxy = healthyProxies.reduce((best, proxy) => {
          const proxyStats = this.proxyStats.get(proxy.id!);
          const bestStats = this.proxyStats.get(best.id!);
          return proxyStats!.successRate > bestStats!.successRate ? proxy : best;
        });
        break;

      default:
        selectedProxy = healthyProxies[0];
    }

    return selectedProxy as ProxyConfig;
  }

  recordProxyUsage(proxyId: string, success: boolean = true): void {
    const stats = this.proxyStats.get(proxyId);
    if (!stats) return;

    stats.requests++;
    stats.lastUsed = Date.now();

    if (success) {
      stats.successRate = stats.successRate * 0.9 + 0.1;
    } else {
      stats.failures++;
      stats.successRate = stats.successRate * 0.9;

      const threshold = this.config.healthCheck?.successRateThreshold || 0.3;
      if (stats.successRate < threshold) {
        stats.healthy = false;
        this.plugin.emit('proxyManager.proxyUnhealthy', {
          proxyId,
          successRate: stats.successRate
        });
      }
    }
  }

  getProxyStats(): ProxyStatResult[] {
    return this.proxies.map(proxy => {
      const stats = this.proxyStats.get(proxy.id!)!;
      return {
        proxyId: proxy.id!,
        url: this._maskProxyUrl(proxy.url),
        ...stats,
        boundSessions: Array.from(this.sessionProxyMap.entries())
          .filter(([, proxyId]) => proxyId === proxy.id)
          .length
      };
    });
  }

  getSessionBindings(): SessionBinding[] {
    return Array.from(this.sessionProxyMap.entries()).map(([sessionId, proxyId]) => {
      const proxy = this.proxies.find(p => p.id === proxyId);
      return {
        sessionId,
        proxyId,
        proxyUrl: proxy ? this._maskProxyUrl(proxy.url) : 'unknown'
      };
    });
  }

  verifyBinding(sessionId: string, proxyId: string): boolean {
    if (!this.sessionProxyMap.has(sessionId)) {
      return false;
    }

    const boundProxyId = this.sessionProxyMap.get(sessionId);
    return boundProxyId === proxyId;
  }

  getProxyLaunchArgs(proxy: ProxyConfig | null): string[] {
    if (!proxy) return [];

    const args = [`--proxy-server=${proxy.url}`];

    if (this.config.bypassList && this.config.bypassList.length > 0) {
      args.push(`--proxy-bypass-list=${this.config.bypassList.join(';')}`);
    }

    return args;
  }

  async authenticateProxy(page: Page, proxy: ProxyConfig): Promise<void> {
    if (proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password
      });
    }
  }

  async checkProxyHealth(proxyId: string): Promise<boolean> {
    const proxy = this.proxies.find(p => p.id === proxyId);
    if (!proxy) return false;

    const stats = this.proxyStats.get(proxyId);
    if (!stats) return false;

    try {
      const pluginConfig = this.plugin.config as { launch: { args: string[] } };
      const browser = await this.puppeteer.launch({
        ...pluginConfig.launch,
        args: [
          ...pluginConfig.launch.args,
          ...this.getProxyLaunchArgs(proxy)
        ]
      });

      const page = await browser.newPage();

      await this.authenticateProxy(page, proxy);

      const testUrl = this.config.healthCheck?.testUrl || 'https://www.google.com';
      const timeout = this.config.healthCheck?.timeout || 10000;

      await page.goto(testUrl, { timeout });

      await browser.close();

      stats.healthy = true;
      stats.successRate = Math.min(stats.successRate + 0.1, 1.0);

      this.plugin.emit('proxyManager.healthCheckPassed', {
        proxyId,
        url: this._maskProxyUrl(proxy.url)
      });

      return true;
    } catch (err) {
      stats.healthy = false;
      stats.failures++;

      this.plugin.emit('proxyManager.healthCheckFailed', {
        proxyId,
        url: this._maskProxyUrl(proxy.url),
        error: (err as Error).message
      });

      return false;
    }
  }

  async checkAllProxies(): Promise<HealthCheckResult> {
    const results: HealthCheckResult = {
      total: this.proxies.length,
      healthy: 0,
      unhealthy: 0,
      checks: []
    };

    for (const proxy of this.proxies) {
      const isHealthy = await this.checkProxyHealth(proxy.id!);
      results.checks.push({
        proxyId: proxy.id!,
        url: this._maskProxyUrl(proxy.url),
        healthy: isHealthy
      });

      if (isHealthy) {
        results.healthy++;
      } else {
        results.unhealthy++;
      }
    }

    return results;
  }

  private _maskProxyUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.username) {
        return `${parsed.protocol}//${parsed.username}:***@${parsed.host}`;
      }
      return url;
    } catch {
      return url;
    }
  }

  _removeBinding(sessionId: string): void {
    this.sessionProxyMap.delete(sessionId);
    this.plugin.emit('proxyManager.bindingRemoved', { sessionId });
  }
}

export default ProxyManager;
