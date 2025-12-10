import { NavigationError } from '../puppeteer.errors.js';
export class StealthManager {
    plugin;
    config;
    timingProfiles;
    geoData;
    constructor(plugin) {
        this.plugin = plugin;
        this.config = (plugin.config.stealth) || {};
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
    get logger() {
        return this.plugin.logger;
    }
    async createStealthProfile(options = {}) {
        const { proxy = null, country = null, timingProfile = 'normal', screenResolution = null } = options;
        const geoProfile = this._selectGeoProfile(country);
        const userAgent = this._generateConsistentUserAgent();
        const viewport = this._generateConsistentViewport(screenResolution);
        const profile = {
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
            timingProfile: this.timingProfiles[timingProfile],
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
    _selectGeoProfile(country) {
        if (country && this.geoData[country]) {
            const data = this.geoData[country];
            const timezone = data.timezones[Math.floor(Math.random() * data.timezones.length)];
            const language = data.languages[0];
            return { timezone, language };
        }
        return {
            timezone: 'America/New_York',
            language: 'en-US'
        };
    }
    _generateConsistentUserAgent() {
        const stableUserAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        return stableUserAgents[Math.floor(Math.random() * stableUserAgents.length)];
    }
    _generateConsistentViewport(screenResolution) {
        const commonResolutions = [
            { width: 1920, height: 1080, deviceScaleFactor: 1 },
            { width: 1680, height: 1050, deviceScaleFactor: 1 },
            { width: 1440, height: 900, deviceScaleFactor: 1 },
            { width: 1366, height: 768, deviceScaleFactor: 1 },
            { width: 2560, height: 1440, deviceScaleFactor: 1 }
        ];
        if (screenResolution) {
            return screenResolution;
        }
        return commonResolutions[Math.floor(Math.random() * commonResolutions.length)];
    }
    _getPlatformFromUA(userAgent) {
        if (userAgent.includes('Windows'))
            return 'Win32';
        if (userAgent.includes('Mac'))
            return 'MacIntel';
        if (userAgent.includes('Linux'))
            return 'Linux x86_64';
        return 'Win32';
    }
    _getHardwareConcurrency() {
        return [4, 6, 8][Math.floor(Math.random() * 3)];
    }
    _getDeviceMemory() {
        return [4, 8, 16][Math.floor(Math.random() * 3)];
    }
    async applyStealthProfile(page, profile) {
        await page.emulateTimezone(profile.timezone);
        await page.evaluateOnNewDocument((p) => {
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
            const win = window;
            if (!win.chrome) {
                win.chrome = {
                    runtime: {}
                };
            }
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery.call(window.navigator.permissions, parameters));
        }, profile);
        await page.setExtraHTTPHeaders({
            'Accept-Language': profile.acceptLanguage,
            'Accept-Encoding': profile.acceptEncoding,
            'Accept': profile.accept
        });
    }
    async executeJSChallenges(page) {
        try {
            await page.waitForFunction(() => document.readyState === 'complete', {
                timeout: 10000
            });
            await page.evaluate(() => {
                if (!document.cookie.includes('js_ok')) {
                    document.cookie = 'js_ok=1; path=/';
                }
                const win = window;
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
                        const data = await response.json();
                        if (data.token) {
                            window.__JS_CHALLENGE_TOKEN = data.token;
                        }
                    }
                }
                catch {
                    // Endpoint may not exist
                }
            });
        }
        catch (err) {
            this.plugin.emit('stealth.jsChallengeWarning', {
                error: err.message
            });
        }
    }
    async _loadPageResources(page) {
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
        }
        catch {
            // Resource loading failed - continue
        }
    }
    async humanDelay(profile) {
        const timing = profile.timingProfile;
        const baseDelay = timing.min + Math.random() * (timing.max - timing.min);
        const jitter = (Math.random() - 0.5) * timing.jitter;
        const totalDelay = Math.max(100, baseDelay + jitter);
        await this._delay(totalDelay);
    }
    async humanType(page, selector, text, profile) {
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
    async paceRequests(persona) {
        const maxRequestsPerMinute = 30;
        const minDelayMs = (60 * 1000) / maxRequestsPerMinute;
        const jitter = minDelayMs * (0.5 + Math.random() * 0.5);
        const totalDelay = minDelayMs + jitter;
        await this._delay(totalDelay);
        persona.metadata.lastRequestTime = Date.now();
    }
    shouldRest(persona) {
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
    async simulateHumanBehavior(page, _profile) {
        try {
            const scrollDistance = Math.floor(Math.random() * 500) + 200;
            await page.evaluate((distance) => {
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
                }
                catch {
                    // Cursor movement failed - continue
                }
            }
            const elements = await page.$$('a, button, input');
            if (elements.length > 0) {
                const randomElement = elements[Math.floor(Math.random() * elements.length)];
                await randomElement.hover().catch(() => { });
                await this._delay(300 + Math.random() * 500);
            }
        }
        catch {
            // Behavior simulation failed - continue
        }
    }
    validatePersonaConsistency(persona, currentContext) {
        const warnings = [];
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
    async generateBrowsingSession(page, profile, urls) {
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
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
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
export default StealthManager;
//# sourceMappingURL=stealth-manager.js.map