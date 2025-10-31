/**
 * StealthManager - Advanced Anti-Detection for Cookie Farm
 *
 * Implements sophisticated evasion techniques against cookie farm detection:
 *
 * Defense Mechanisms We Counter:
 * 1. Session binding (IP/UA consistency)
 * 2. Rate limiting (human-like timing)
 * 3. JS challenges (automatic execution)
 * 4. Fingerprint tracking (consistent profiles)
 * 5. Geographic impossible travel (proxy planning)
 * 6. User-Agent churn detection (stable profiles)
 * 7. Honeypot cookies (JS execution simulation)
 * 8. Behavioral analysis (mouse/scroll/timing)
 * 9. Request velocity monitoring (throttled requests)
 * 10. Multi-session concurrent use detection (serialized usage)
 *
 * Key Strategies:
 * - ONE persona = ONE complete identity (never mix!)
 * - Maintain consistency: IP, UA, viewport, timezone, language
 * - Human-like timing: delays, jitter, patterns
 * - JS execution: load resources, execute challenges
 * - Geographic coherence: proxy geo + timezone + language match
 */
export class StealthManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.config = plugin.config.stealth || {};

    // Timing profiles (human-like delays)
    this.timingProfiles = {
      'very-slow': { min: 5000, max: 15000, jitter: 2000 },
      'slow': { min: 3000, max: 8000, jitter: 1500 },
      'normal': { min: 1000, max: 5000, jitter: 1000 },
      'fast': { min: 500, max: 2000, jitter: 500 }
    };

    // Geographic data (timezone + language mapping)
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

  /**
   * Create a stealth-optimized persona profile
   * Ensures all fingerprint components are consistent
   */
  async createStealthProfile(options = {}) {
    const {
      proxy = null,
      country = null, // Target country (if known from proxy)
      timingProfile = 'normal',
      screenResolution = null
    } = options;

    // 1. Select consistent timezone + language based on country
    const geoProfile = this._selectGeoProfile(country);

    // 2. Generate consistent user agent
    const userAgent = this._generateConsistentUserAgent();

    // 3. Generate viewport that matches screen resolution
    const viewport = this._generateConsistentViewport(screenResolution);

    // 4. Create fingerprint profile
    const profile = {
      // Core identity
      userAgent,
      viewport,
      timezone: geoProfile.timezone,
      language: geoProfile.language,

      // Consistency markers
      acceptLanguage: `${geoProfile.language},en;q=0.9`,
      acceptEncoding: 'gzip, deflate, br',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',

      // Platform consistency
      platform: this._getPlatformFromUA(userAgent),
      hardwareConcurrency: this._getHardwareConcurrency(userAgent),
      deviceMemory: this._getDeviceMemory(userAgent),

      // Timing behavior
      timingProfile: this.timingProfiles[timingProfile],

      // Proxy binding
      proxyId: proxy?.id || null,
      proxyCountry: country,

      // Behavioral markers
      behavioral: {
        typingSpeed: { min: 100, max: 300 }, // ms per character
        mouseMovements: true,
        scrollBehavior: 'smooth',
        clickDelay: { min: 200, max: 800 }
      }
    };

    return profile;
  }

  /**
   * Select geo profile (timezone + language) based on country
   * @private
   */
  _selectGeoProfile(country) {
    if (country && this.geoData[country]) {
      const data = this.geoData[country];
      const timezone = data.timezones[Math.floor(Math.random() * data.timezones.length)];
      const language = data.languages[0]; // Primary language
      return { timezone, language };
    }

    // Default to US
    return {
      timezone: 'America/New_York',
      language: 'en-US'
    };
  }

  /**
   * Generate consistent user agent (avoid churn)
   * @private
   */
  _generateConsistentUserAgent() {
    // Use common, stable user agents
    const stableUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    return stableUserAgents[Math.floor(Math.random() * stableUserAgents.length)];
  }

  /**
   * Generate viewport consistent with screen resolution
   * @private
   */
  _generateConsistentViewport(screenResolution) {
    const commonResolutions = [
      { width: 1920, height: 1080, deviceScaleFactor: 1 }, // Full HD
      { width: 1680, height: 1050, deviceScaleFactor: 1 }, // WSXGA+
      { width: 1440, height: 900, deviceScaleFactor: 1 },  // WXGA+
      { width: 1366, height: 768, deviceScaleFactor: 1 },  // HD
      { width: 2560, height: 1440, deviceScaleFactor: 1 }  // QHD
    ];

    if (screenResolution) {
      return screenResolution;
    }

    return commonResolutions[Math.floor(Math.random() * commonResolutions.length)];
  }

  /**
   * Get platform from user agent
   * @private
   */
  _getPlatformFromUA(userAgent) {
    if (userAgent.includes('Windows')) return 'Win32';
    if (userAgent.includes('Mac')) return 'MacIntel';
    if (userAgent.includes('Linux')) return 'Linux x86_64';
    return 'Win32';
  }

  /**
   * Get hardware concurrency (CPU cores) from user agent
   * @private
   */
  _getHardwareConcurrency(userAgent) {
    // Desktop: 4-8 cores common
    // Mobile: 4-8 cores
    return [4, 6, 8][Math.floor(Math.random() * 3)];
  }

  /**
   * Get device memory from user agent
   * @private
   */
  _getDeviceMemory(userAgent) {
    // Common: 4, 8, 16 GB
    return [4, 8, 16][Math.floor(Math.random() * 3)];
  }

  /**
   * Apply stealth profile to page
   * Overrides navigator properties to match profile
   */
  async applyStealthProfile(page, profile) {
    // 1. Set timezone
    await page.emulateTimezone(profile.timezone);

    // 2. Override navigator properties
    await page.evaluateOnNewDocument((profile) => {
      // Override platform
      Object.defineProperty(navigator, 'platform', {
        get: () => profile.platform
      });

      // Override hardwareConcurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => profile.hardwareConcurrency
      });

      // Override deviceMemory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => profile.deviceMemory
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => [profile.language, 'en']
      });

      // Override webdriver flag (anti-detection)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false
      });

      // Add chrome object (missing in headless)
      if (!window.chrome) {
        window.chrome = {
          runtime: {}
        };
      }

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    }, profile);

    // 3. Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': profile.acceptLanguage,
      'Accept-Encoding': profile.acceptEncoding,
      'Accept': profile.accept
    });
  }

  /**
   * Execute JS challenges automatically
   * Simulates human JS execution
   */
  async executeJSChallenges(page) {
    try {
      // 1. Wait for page to be fully loaded
      await page.waitForFunction(() => document.readyState === 'complete', {
        timeout: 10000
      });

      // 2. Execute common JS challenges
      await page.evaluate(() => {
        // Set honeypot cookie (if expected)
        if (!document.cookie.includes('js_ok')) {
          document.cookie = 'js_ok=1; path=/';
        }

        // Execute any window.__JS_CHALLENGE if present
        if (window.__JS_CHALLENGE_INIT) {
          window.__JS_CHALLENGE_INIT();
        }

        // Trigger load events
        window.dispatchEvent(new Event('load'));
        document.dispatchEvent(new Event('DOMContentLoaded'));
      });

      // 3. Load resources (images, CSS, fonts) to simulate real browser
      await this._loadPageResources(page);

      // 4. Execute fetch to /.js-challenge if endpoint exists
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
        } catch (err) {
          // Endpoint may not exist - that's ok
        }
      });

    } catch (err) {
      // JS challenge execution failed - continue anyway
      this.plugin.emit('stealth.jsChallengeWarning', {
        error: err.message
      });
    }
  }

  /**
   * Load page resources to simulate real browser
   * @private
   */
  async _loadPageResources(page) {
    try {
      // Get all images and trigger load
      await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        images.forEach(img => {
          if (!img.complete) {
            img.dispatchEvent(new Event('load'));
          }
        });
      });

      // Wait for fonts to load
      await page.evaluateHandle(() => document.fonts.ready);

    } catch (err) {
      // Resource loading failed - continue
    }
  }

  /**
   * Add human-like delay between actions
   * Uses timing profile from persona
   */
  async humanDelay(profile, action = 'default') {
    const timing = profile.timingProfile;

    const baseDelay = timing.min + Math.random() * (timing.max - timing.min);
    const jitter = (Math.random() - 0.5) * timing.jitter;
    const totalDelay = Math.max(100, baseDelay + jitter);

    await this._delay(totalDelay);
  }

  /**
   * Simulate human typing with profile-specific speed
   */
  async humanType(page, selector, text, profile) {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    await element.click();

    // Type character by character with human timing
    for (const char of text) {
      await page.keyboard.type(char);

      const { min, max } = profile.behavioral.typingSpeed;
      const charDelay = min + Math.random() * (max - min);
      await this._delay(charDelay);

      // Random pause after punctuation
      if (['.', ',', '!', '?'].includes(char)) {
        await this._delay(200 + Math.random() * 300);
      }
    }
  }

  /**
   * Simulate realistic request pacing
   * Prevents rate limiting / velocity detection
   */
  async paceRequests(persona, requestCount) {
    // Calculate safe delay based on request count
    // Goal: stay under detection thresholds (e.g., 50 req/min)

    const maxRequestsPerMinute = 30; // Conservative
    const minDelayMs = (60 * 1000) / maxRequestsPerMinute;

    // Add random jitter to avoid patterns
    const jitter = minDelayMs * (0.5 + Math.random() * 0.5);
    const totalDelay = minDelayMs + jitter;

    await this._delay(totalDelay);

    // Track request for persona stats
    persona.metadata.lastRequestTime = Date.now();
  }

  /**
   * Check if persona should "rest" (cooldown)
   * Prevents velocity/concurrent use detection
   */
  shouldRest(persona) {
    const now = Date.now();
    const lastUsed = persona.metadata.lastUsed || 0;
    const timeSinceLastUse = now - lastUsed;

    // If used in last 5 seconds, should rest
    if (timeSinceLastUse < 5000) {
      return true;
    }

    // If high request count in short time, should rest
    const requestsInLastMinute = persona.metadata.recentRequests || 0;
    if (requestsInLastMinute > 20) {
      return true;
    }

    return false;
  }

  /**
   * Simulate mouse movements and scrolling
   * Generates behavioral fingerprint
   */
  async simulateHumanBehavior(page, profile) {
    try {
      // 1. Random scroll
      const scrollDistance = Math.floor(Math.random() * 500) + 200;
      await page.evaluate((distance) => {
        window.scrollBy({
          top: distance,
          behavior: 'smooth'
        });
      }, scrollDistance);

      await this._delay(1000 + Math.random() * 1000);

      // 2. Random mouse movement (if ghost-cursor available)
      if (page._cursor) {
        try {
          // Move to random position
          const viewport = await page.viewport();
          const x = Math.floor(Math.random() * viewport.width);
          const y = Math.floor(Math.random() * viewport.height);

          await page._cursor.move({ x, y });
          await this._delay(500);
        } catch (err) {
          // Cursor movement failed - continue
        }
      }

      // 3. Random hover over elements
      const elements = await page.$$('a, button, input');
      if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        await randomElement.hover().catch(() => {});
        await this._delay(300 + Math.random() * 500);
      }

    } catch (err) {
      // Behavior simulation failed - continue
    }
  }

  /**
   * Validate persona consistency before use
   * Ensures no fingerprint leakage
   */
  validatePersonaConsistency(persona, currentContext) {
    const warnings = [];

    // Check IP consistency (if proxy bound)
    if (persona.proxyId && currentContext.proxyId !== persona.proxyId) {
      warnings.push({
        type: 'PROXY_MISMATCH',
        message: `Persona ${persona.personaId} bound to ${persona.proxyId} but using ${currentContext.proxyId}`,
        severity: 'HIGH'
      });
    }

    // Check UA consistency
    if (currentContext.userAgent && currentContext.userAgent !== persona.userAgent) {
      warnings.push({
        type: 'UA_MISMATCH',
        message: 'User agent changed',
        severity: 'HIGH'
      });
    }

    // Check viewport consistency
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

    // Check usage velocity
    if (this.shouldRest(persona)) {
      warnings.push({
        type: 'HIGH_VELOCITY',
        message: 'Persona used too frequently',
        severity: 'MEDIUM'
      });
    }

    return warnings;
  }

  /**
   * Generate realistic browsing session
   * Visits pages with human-like patterns
   */
  async generateBrowsingSession(page, profile, urls) {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      // Navigate
      await page.goto(url, { waitUntil: 'networkidle2' });

      // Execute JS challenges
      await this.executeJSChallenges(page);

      // Simulate human behavior
      await this.simulateHumanBehavior(page, profile);

      // Human delay before next page
      await this.humanDelay(profile);

      // Random chance to go back
      if (i > 0 && Math.random() < 0.1) {
        await page.goBack();
        await this._delay(1000);
        await page.goForward();
      }
    }
  }

  /**
   * Delay helper
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default StealthManager;
