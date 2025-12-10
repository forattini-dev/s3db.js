import { NavigationError } from '../puppeteer.errors.js';
import type { PuppeteerPlugin } from '../puppeteer.plugin.js';

export interface TimingProfile {
  min: number;
  max: number;
  jitter: number;
}

export interface GeoData {
  timezones: string[];
  languages: string[];
}

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface BehavioralConfig {
  typingSpeed: { min: number; max: number };
  mouseMovements: boolean;
  scrollBehavior: string;
  clickDelay: { min: number; max: number };
}

export interface StealthProfile {
  userAgent: string;
  viewport: ViewportConfig;
  timezone: string;
  language: string;
  acceptLanguage: string;
  acceptEncoding: string;
  accept: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  timingProfile: TimingProfile;
  proxyId: string | null;
  proxyCountry: string | null;
  behavioral: BehavioralConfig;
}

export interface StealthProfileOptions {
  proxy?: { id?: string } | null;
  country?: string | null;
  timingProfile?: keyof typeof StealthManager.prototype.timingProfiles;
  screenResolution?: ViewportConfig | null;
}

export interface ConsistencyWarning {
  type: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PersonaContext {
  proxyId?: string;
  userAgent?: string;
  viewport?: ViewportConfig;
}

export interface Persona {
  personaId: string;
  proxyId?: string;
  userAgent: string;
  viewport: ViewportConfig;
  metadata: {
    lastUsed?: number;
    lastRequestTime?: number;
    recentRequests?: number;
  };
}

interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

interface GhostCursor {
  move(position: { x: number; y: number }): Promise<void>;
}

interface Page {
  emulateTimezone(timezone: string): Promise<void>;
  evaluateOnNewDocument<T>(fn: (profile: T) => void, profile: T): Promise<void>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
  waitForFunction(fn: () => boolean, options: { timeout: number }): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>;
  evaluateHandle(fn: () => unknown): Promise<unknown>;
  $(selector: string): Promise<ElementHandle | null>;
  $$(selector: string): Promise<ElementHandle[]>;
  keyboard: {
    type(char: string): Promise<void>;
  };
  viewport(): Promise<ViewportConfig | null>;
  goto(url: string, options?: { waitUntil?: string }): Promise<void>;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
  _cursor?: GhostCursor;
}

interface ElementHandle {
  click(): Promise<void>;
  hover(): Promise<void>;
}

export class StealthManager {
  plugin: PuppeteerPlugin;
  config: Record<string, unknown>;
  timingProfiles: Record<string, TimingProfile>;
  geoData: Record<string, GeoData>;

  constructor(plugin: PuppeteerPlugin) {
    this.plugin = plugin;
    this.config = ((plugin.config as unknown as { stealth?: Record<string, unknown> }).stealth) || {};

    this.timingProfiles = {
      'very-slow': { min: 5000, max: 15000, jitter: 2000 },
      'slow': { min: 3000, max: 8000, jitter: 1500 },
      'normal': { min: 1000, max: 5000, jitter: 1000 },
      'fast': { min: 500, max: 2000, jitter: 500 }
    };

    this.geoData = {
      'US': { timezones: ['America/New_York', 'America/Chicago', 'America/Los_Angeles'], languages: ['en-US'] },
      'BR': { timezones: ['America/Sao_Paulo'], languages: ['pt-BR', 'en-US'] },
      'GB': { timezones: ['Europe/London'], languages: ['en-GB', 'en-US'] },
      'DE': { timezones: ['Europe/Berlin'], languages: ['de-DE', 'en-US'] },
      'FR': { timezones: ['Europe/Paris'], languages: ['fr-FR', 'en-US'] },
      'JP': { timezones: ['Asia/Tokyo'], languages: ['ja-JP', 'en-US'] },
      'CN': { timezones: ['Asia/Shanghai'], languages: ['zh-CN', 'en-US'] }
    };
  }

  get logger(): Logger {
    return this.plugin.logger as Logger;
  }

  async createStealthProfile(options: StealthProfileOptions = {}): Promise<StealthProfile> {
    const {
      proxy = null,
      country = null,
      timingProfile = 'normal',
      screenResolution = null
    } = options;

    const geoProfile = this._selectGeoProfile(country);
    const userAgent = this._generateConsistentUserAgent();
    const viewport = this._generateConsistentViewport(screenResolution);

    const profile: StealthProfile = {
      userAgent,
      viewport,
      timezone: geoProfile.timezone,
      language: geoProfile.language,
      acceptLanguage: `${geoProfile.language},en;q=0.9`,
      acceptEncoding: 'gzip, deflate, br',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      platform: this._getPlatformFromUA(userAgent),
      hardwareConcurrency: this._getHardwareConcurrency(),
      deviceMemory: this._getDeviceMemory(),
      timingProfile: this.timingProfiles[timingProfile] as TimingProfile,
      proxyId: proxy?.id || null,
      proxyCountry: country,
      behavioral: {
        typingSpeed: { min: 100, max: 300 },
        mouseMovements: true,
        scrollBehavior: 'smooth',
        clickDelay: { min: 200, max: 800 }
      }
    };

    return profile;
  }

  private _selectGeoProfile(country: string | null): { timezone: string; language: string } {
    if (country && this.geoData[country]) {
      const data = this.geoData[country];
      const timezone = data.timezones[Math.floor(Math.random() * data.timezones.length)] as string;
      const language = data.languages[0] as string;
      return { timezone, language };
    }

    return {
      timezone: 'America/New_York',
      language: 'en-US'
    };
  }

  private _generateConsistentUserAgent(): string {
    const stableUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    return stableUserAgents[Math.floor(Math.random() * stableUserAgents.length)] as string;
  }

  private _generateConsistentViewport(screenResolution: ViewportConfig | null): ViewportConfig {
    const commonResolutions: ViewportConfig[] = [
      { width: 1920, height: 1080, deviceScaleFactor: 1 },
      { width: 1680, height: 1050, deviceScaleFactor: 1 },
      { width: 1440, height: 900, deviceScaleFactor: 1 },
      { width: 1366, height: 768, deviceScaleFactor: 1 },
      { width: 2560, height: 1440, deviceScaleFactor: 1 }
    ];

    if (screenResolution) {
      return screenResolution;
    }

    return commonResolutions[Math.floor(Math.random() * commonResolutions.length)] as ViewportConfig;
  }

  private _getPlatformFromUA(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Win32';
    if (userAgent.includes('Mac')) return 'MacIntel';
    if (userAgent.includes('Linux')) return 'Linux x86_64';
    return 'Win32';
  }

  private _getHardwareConcurrency(): number {
    return [4, 6, 8][Math.floor(Math.random() * 3)] as number;
  }

  private _getDeviceMemory(): number {
    return [4, 8, 16][Math.floor(Math.random() * 3)] as number;
  }

  async applyStealthProfile(page: Page, profile: StealthProfile): Promise<void> {
    await page.emulateTimezone(profile.timezone);

    await page.evaluateOnNewDocument((p: StealthProfile) => {
      Object.defineProperty(navigator, 'platform', {
        get: () => p.platform
      });

      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => p.hardwareConcurrency
      });

      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => p.deviceMemory
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => [p.language, 'en']
      });

      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });

      const win = window as unknown as { chrome?: { runtime: Record<string, unknown> } };
      if (!win.chrome) {
        win.chrome = {
          runtime: {}
        };
      }

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: PermissionDescriptor) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery.call(window.navigator.permissions, parameters)
      );
    }, profile);

    await page.setExtraHTTPHeaders({
      'Accept-Language': profile.acceptLanguage,
      'Accept-Encoding': profile.acceptEncoding,
      'Accept': profile.accept
    });
  }

  async executeJSChallenges(page: Page): Promise<void> {
    try {
      await page.waitForFunction(() => document.readyState === 'complete', {
        timeout: 10000
      });

      await page.evaluate(() => {
        if (!document.cookie.includes('js_ok')) {
          document.cookie = 'js_ok=1; path=/';
        }

        const win = window as unknown as { __JS_CHALLENGE_INIT?: () => void };
        if (win.__JS_CHALLENGE_INIT) {
          win.__JS_CHALLENGE_INIT();
        }

        window.dispatchEvent(new Event('load'));
        document.dispatchEvent(new Event('DOMContentLoaded'));
      });

      await this._loadPageResources(page);

      await page.evaluate(async () => {
        try {
          const response = await fetch('/.js-challenge', {
            method: 'GET',
            credentials: 'include'
          });
          if (response.ok) {
            const data = await response.json() as { token?: string };
            if (data.token) {
              (window as unknown as { __JS_CHALLENGE_TOKEN?: string }).__JS_CHALLENGE_TOKEN = data.token;
            }
          }
        } catch {
          // Endpoint may not exist
        }
      });

    } catch (err) {
      this.plugin.emit('stealth.jsChallengeWarning', {
        error: (err as Error).message
      });
    }
  }

  private async _loadPageResources(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        images.forEach(img => {
          if (!img.complete) {
            img.dispatchEvent(new Event('load'));
          }
        });
      });

      await page.evaluateHandle(() => document.fonts.ready);

    } catch {
      // Resource loading failed - continue
    }
  }

  async humanDelay(profile: StealthProfile): Promise<void> {
    const timing = profile.timingProfile;

    const baseDelay = timing.min + Math.random() * (timing.max - timing.min);
    const jitter = (Math.random() - 0.5) * timing.jitter;
    const totalDelay = Math.max(100, baseDelay + jitter);

    await this._delay(totalDelay);
  }

  async humanType(page: Page, selector: string, text: string, profile: StealthProfile): Promise<void> {
    const element = await page.$(selector);
    if (!element) {
      throw new NavigationError(`Element not found: ${selector}`, {
        operation: 'humanType',
        retriable: false,
        suggestion: 'Verify the selector exists on the target page before invoking humanType.',
        selector
      });
    }

    await element.click();

    for (const char of text) {
      await page.keyboard.type(char);

      const { min, max } = profile.behavioral.typingSpeed;
      const charDelay = min + Math.random() * (max - min);
      await this._delay(charDelay);

      if (['.', ',', '!', '?'].includes(char)) {
        await this._delay(200 + Math.random() * 300);
      }
    }
  }

  async paceRequests(persona: Persona): Promise<void> {
    const maxRequestsPerMinute = 30;
    const minDelayMs = (60 * 1000) / maxRequestsPerMinute;
    const jitter = minDelayMs * (0.5 + Math.random() * 0.5);
    const totalDelay = minDelayMs + jitter;

    await this._delay(totalDelay);

    persona.metadata.lastRequestTime = Date.now();
  }

  shouldRest(persona: Persona): boolean {
    const now = Date.now();
    const lastUsed = persona.metadata.lastUsed || 0;
    const timeSinceLastUse = now - lastUsed;

    if (timeSinceLastUse < 5000) {
      return true;
    }

    const requestsInLastMinute = persona.metadata.recentRequests || 0;
    if (requestsInLastMinute > 20) {
      return true;
    }

    return false;
  }

  async simulateHumanBehavior(page: Page, _profile: StealthProfile): Promise<void> {
    try {
      const scrollDistance = Math.floor(Math.random() * 500) + 200;
      await page.evaluate((distance: number) => {
        window.scrollBy({
          top: distance,
          behavior: 'smooth'
        });
      }, scrollDistance);

      await this._delay(1000 + Math.random() * 1000);

      if (page._cursor) {
        try {
          const viewport = await page.viewport();
          if (viewport) {
            const x = Math.floor(Math.random() * viewport.width);
            const y = Math.floor(Math.random() * viewport.height);

            await page._cursor.move({ x, y });
            await this._delay(500);
          }
        } catch {
          // Cursor movement failed - continue
        }
      }

      const elements = await page.$$('a, button, input');
      if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)]!;
        await randomElement.hover().catch(() => {});
        await this._delay(300 + Math.random() * 500);
      }

    } catch {
      // Behavior simulation failed - continue
    }
  }

  validatePersonaConsistency(persona: Persona, currentContext: PersonaContext): ConsistencyWarning[] {
    const warnings: ConsistencyWarning[] = [];

    if (persona.proxyId && currentContext.proxyId !== persona.proxyId) {
      warnings.push({
        type: 'PROXY_MISMATCH',
        message: `Persona ${persona.personaId} bound to ${persona.proxyId} but using ${currentContext.proxyId}`,
        severity: 'HIGH'
      });
    }

    if (currentContext.userAgent && currentContext.userAgent !== persona.userAgent) {
      warnings.push({
        type: 'UA_MISMATCH',
        message: 'User agent changed',
        severity: 'HIGH'
      });
    }

    if (currentContext.viewport) {
      if (currentContext.viewport.width !== persona.viewport.width ||
          currentContext.viewport.height !== persona.viewport.height) {
        warnings.push({
          type: 'VIEWPORT_MISMATCH',
          message: 'Viewport changed',
          severity: 'MEDIUM'
        });
      }
    }

    if (this.shouldRest(persona)) {
      warnings.push({
        type: 'HIGH_VELOCITY',
        message: 'Persona used too frequently',
        severity: 'MEDIUM'
      });
    }

    return warnings;
  }

  async generateBrowsingSession(page: Page, profile: StealthProfile, urls: string[]): Promise<void> {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i] as string;

      await page.goto(url, { waitUntil: 'networkidle2' });

      await this.executeJSChallenges(page);

      await this.simulateHumanBehavior(page, profile);

      await this.humanDelay(profile);

      if (i > 0 && Math.random() < 0.1) {
        await page.goBack();
        await this._delay(1000);
        await page.goForward();
      }
    }
  }

  private async _delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default StealthManager;
