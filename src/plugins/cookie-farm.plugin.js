import { Plugin } from './plugin.class.js';
import { PuppeteerPlugin } from './puppeteer.plugin.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import tryFn from '../concerns/try-fn.js';
import { resolveResourceName } from './concerns/resource-names.js';
import { CookieFarmError, PersonaNotFoundError } from './cookie-farm.errors.js';

/**
 * CookieFarmPlugin - Persona Factory for Professional Web Scraping
 *
 * Creates and manages "personas" - complete browser identities with:
 * - Cookies (farmed and aged)
 * - Proxy binding (immutable)
 * - User agent
 * - Viewport configuration
 * - Reputation score
 * - Quality rating
 *
 * Use Cases:
 * - Generate hundreds of trusted personas
 * - Warmup sessions automatically
 * - Rotate based on quality/age
 * - Export/import for scaling
 * - Integration with CrawlerPlugin
 *
 * @extends Plugin
 */
export class CookieFarmPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    const opts = this.options;

    const resourceNamesOption = opts.resourceNames || {};

    // Default configuration
    this.config = {
      verbose: this.verbose,
      // Persona generation
      generation: {
        count: 10, // Initial personas to generate
        proxies: [], // List of proxies to use
        userAgentStrategy: 'random', // 'random' | 'desktop-only' | 'mobile-only'
        viewportStrategy: 'varied', // 'varied' | 'fixed' | 'desktop-only'
        ...opts.generation
      },

      // Warmup process
      warmup: {
        enabled: true,
        sites: [
          'https://www.google.com',
          'https://www.youtube.com',
          'https://www.wikipedia.org',
          'https://www.reddit.com',
          'https://www.amazon.com'
        ],
        sitesPerPersona: 5,
        randomOrder: true,
        timePerSite: { min: 10000, max: 20000 },
        interactions: {
          scroll: true,
          hover: true,
          click: false // Safer - avoid accidental navigation
        },
        ...opts.warmup
      },

      // Quality scoring
      quality: {
        enabled: true,
        factors: {
          age: 0.3, // 30% weight
          successRate: 0.4, // 40% weight
          requestCount: 0.2, // 20% weight
          warmupCompleted: 0.1 // 10% weight
        },
        thresholds: {
          high: 0.8, // >= 80% = high quality
          medium: 0.5, // >= 50% = medium quality
          low: 0 // < 50% = low quality
        },
        ...opts.quality
      },

      // Rotation strategy
      rotation: {
        enabled: true,
        maxAge: 86400000, // 24 hours
        maxRequests: 200,
        minQualityScore: 0.3,
        retireOnFailureRate: 0.3, // Retire if success rate < 30%
        ...opts.rotation
      },

      // Storage
      storage: {
        resource: 'cookie_farm_personas',
        encrypt: true,
        ...opts.storage
      },

      // Export/Import
      export: {
        format: 'json', // 'json' | 'csv'
        includeCredentials: false, // Mask proxy credentials
        ...opts.export
      },

      // Stealth mode (anti-detection)
      stealth: {
        enabled: true,
        timingProfile: 'normal', // 'very-slow' | 'slow' | 'normal' | 'fast'
        consistentFingerprint: true, // Maintain consistent fingerprint per persona
        executeJSChallenges: true, // Auto-solve JS challenges
        humanBehavior: true, // Simulate mouse/scroll/typing
        requestPacing: true, // Throttle requests to avoid rate limits
        geoConsistency: true, // Match timezone/language to proxy geo
        ...opts.stealth
      },
      ...opts
    };

    this.config.verbose = this.verbose;

    this._storageResourceDescriptor = {
      defaultName: 'plg_cookie_farm_personas',
      override: resourceNamesOption.personas || opts.storage?.resource
    };
    this.config.storage.resource = this._resolveStorageResourceName();

    // Internal state
    this.puppeteerPlugin = null;
    this.stealthManager = null;
    this.personaPool = new Map(); // personaId -> persona object
    this.initialized = false;
  }

  _resolveStorageResourceName() {
    return resolveResourceName('cookiefarm', this._storageResourceDescriptor, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    if (this.config?.storage) {
      this.config.storage.resource = this._resolveStorageResourceName();
    }
  }

  /**
   * Install plugin and validate dependencies
   */
  async onInstall() {
    // Validate PuppeteerPlugin is installed (namespaced aware)
    const puppeteerPlugin = this._findPuppeteerDependency();

    if (!puppeteerPlugin) {
      throw new CookieFarmError('PuppeteerPlugin is required before installing CookieFarmPlugin', {
        pluginName: 'CookieFarmPlugin',
        operation: 'onInstall',
        statusCode: 400,
        retriable: false,
        suggestion: 'Install PuppeteerPlugin in db configuration before adding CookieFarmPlugin.'
      });
    }

    this.puppeteerPlugin = puppeteerPlugin;

    // Create personas storage resource
    await this._setupPersonaStorage();

    this.emit('cookieFarm.installed');
  }

  /**
   * Locate PuppeteerPlugin dependency respecting namespaces
   * @private
   */
  _findPuppeteerDependency() {
    const registries = [
      this.database?.plugins,
      this.database?.pluginRegistry,
      Array.isArray(this.database?.pluginList) ? this.database.pluginList : null
    ].filter(Boolean);

    const candidates = [];
    for (const registry of registries) {
      if (Array.isArray(registry)) {
        candidates.push(...registry);
      } else {
        candidates.push(...Object.values(registry));
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    const sameNamespace = candidates.find(
      plugin => plugin instanceof PuppeteerPlugin &&
        (plugin.namespace === this.namespace || !this.namespace)
    );
    if (sameNamespace) return sameNamespace;

    return candidates.find(plugin => plugin instanceof PuppeteerPlugin) || null;
  }

  /**
   * Start plugin
   */
  async onStart() {
    if (this.initialized) return;

    // Initialize StealthManager if enabled
    if (this.config.stealth.enabled) {
      const { StealthManager } = await import('./puppeteer/stealth-manager.js');
      this.stealthManager = new StealthManager(this);
      this.emit('cookieFarm.stealthEnabled');
    }

    // Load existing personas from storage
    await this._loadPersonaPool();

    // Generate initial personas if pool is empty
    if (this.personaPool.size === 0 && this.config.generation.count > 0) {
      this.emit('cookieFarm.generatingInitialPersonas', {
        count: this.config.generation.count
      });

      await this.generatePersonas(this.config.generation.count);
    }

    this.initialized = true;
    this.emit('cookieFarm.started', {
      personaCount: this.personaPool.size,
      stealthEnabled: this.config.stealth.enabled
    });
  }

  /**
   * Stop plugin
   */
  async onStop() {
    this.initialized = false;
    this.emit('cookieFarm.stopped');
  }

  /**
   * Uninstall plugin
   */
  async onUninstall(options = {}) {
    await this.onStop();
    this.emit('cookieFarm.uninstalled');
  }

  /**
   * Setup persona storage resource
   * @private
   */
  async _setupPersonaStorage() {
    const resourceName = this.config.storage.resource;

    try {
      await this.database.getResource(resourceName);
      return;
    } catch (err) {
      if (!['ResourceNotFoundError', 'ResourceNotFound'].includes(err?.name)) {
        throw err;
      }
    }

    const [created, createErr] = await tryFn(() => this.database.createResource({
      name: resourceName,
      attributes: {
        personaId: 'string|required',
        sessionId: 'string|required',
        proxyId: 'string|optional',
        userAgent: 'string|required',
        viewport: {
          width: 'number|required',
          height: 'number|required',
          deviceScaleFactor: 'number'
        },
        cookies: 'array',
        fingerprint: {
          proxy: 'string',
          userAgent: 'string',
          viewport: 'string'
        },
        reputation: {
          successCount: 'number',
          failCount: 'number',
          successRate: 'number',
          totalRequests: 'number'
        },
        quality: {
          score: 'number',
          rating: 'string',
          lastCalculated: 'number'
        },
        metadata: {
          createdAt: 'number',
          lastUsed: 'number',
          expiresAt: 'number',
          age: 'number',
          warmupCompleted: 'boolean',
          retired: 'boolean'
        }
      },
      timestamps: true,
      behavior: 'body-only',
      partitions: {
        byQuality: {
          fields: { 'quality.rating': 'string' }
        },
        byProxy: {
          fields: { proxyId: 'string' }
        },
        byRetirement: {
          fields: { 'metadata.retired': 'boolean' }
        }
      }
    }));

    if (!created) {
      const existing = this.database.resources?.[resourceName];
      if (!existing) {
        throw createErr;
      }
    }
  }

  /**
   * Load persona pool from storage
   * @private
   */
  async _loadPersonaPool() {
    const storage = await this.database.getResource(this.config.storage.resource);
    const personas = await storage.list({ limit: 1000 });

    for (const persona of personas) {
      this.personaPool.set(persona.personaId, persona);
    }

    this.emit('cookieFarm.personasLoaded', {
      count: this.personaPool.size
    });
  }

  /**
   * Generate new personas
   * @param {number} count - Number of personas to generate
   * @param {Object} options - Generation options
   * @returns {Promise<Array>}
   */
  async generatePersonas(count = 1, options = {}) {
    const {
      proxies = this.config.generation.proxies,
      warmup = this.config.warmup.enabled
    } = options;

    const generatedPersonas = [];

    for (let i = 0; i < count; i++) {
      const persona = await this._createPersona(proxies);
      generatedPersonas.push(persona);

      this.emit('cookieFarm.personaCreated', {
        personaId: persona.personaId,
        proxyId: persona.proxyId
      });

      // Warmup if enabled
      if (warmup) {
        await this.warmupPersona(persona.personaId);
      }
    }

    this.emit('cookieFarm.personasGenerated', {
      count: generatedPersonas.length
    });

    return generatedPersonas;
  }

  /**
   * Create a single persona
   * @private
   * @param {Array} proxies - Available proxies
   * @returns {Promise<Object>}
   */
  async _createPersona(proxies = []) {
    const personaId = `persona_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionId = `session_${personaId}`;

    // Generate user agent
    const userAgent = this._generateUserAgent();

    // Generate viewport
    const viewport = this._generateViewport();

    // Create fingerprint
    const fingerprint = {
      userAgent: userAgent,
      viewport: `${viewport.width}x${viewport.height}`,
      proxy: null
    };

    // Assign proxy if available
    let proxyId = null;
    if (proxies.length > 0 && this.puppeteerPlugin.config.proxy.enabled) {
      // This will create immutable binding
      const proxy = this.puppeteerPlugin.proxyManager.getProxyForSession(sessionId, true);
      proxyId = proxy?.id || null;
      fingerprint.proxy = proxyId;
    }

    const persona = {
      personaId,
      sessionId,
      proxyId,
      userAgent,
      viewport,
      cookies: [],
      fingerprint,
      reputation: {
        successCount: 0,
        failCount: 0,
        successRate: 1.0,
        totalRequests: 0
      },
      quality: {
        score: 0,
        rating: 'low',
        lastCalculated: Date.now()
      },
      metadata: {
        createdAt: Date.now(),
        lastUsed: null,
        expiresAt: Date.now() + this.config.rotation.maxAge,
        age: 0,
        warmupCompleted: false,
        retired: false
      }
    };

    // Save to storage
    const storage = this.database.getResource(this.config.storage.resource);
    await storage.insert(persona);

    // Add to pool
    this.personaPool.set(personaId, persona);

    return persona;
  }

  /**
   * Generate user agent based on strategy
   * @private
   */
  _generateUserAgent() {
    const strategy = this.config.generation.userAgentStrategy;

    // Use PuppeteerPlugin's user agent generation
    // For now, return a default - will enhance later
    const desktopAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    return desktopAgents[Math.floor(Math.random() * desktopAgents.length)];
  }

  /**
   * Generate viewport based on strategy
   * @private
   */
  _generateViewport() {
    const strategy = this.config.generation.viewportStrategy;

    const viewports = [
      { width: 1920, height: 1080, deviceScaleFactor: 1 },
      { width: 1680, height: 1050, deviceScaleFactor: 1 },
      { width: 1440, height: 900, deviceScaleFactor: 1 },
      { width: 1366, height: 768, deviceScaleFactor: 1 },
      { width: 1280, height: 800, deviceScaleFactor: 1 }
    ];

    return viewports[Math.floor(Math.random() * viewports.length)];
  }

  /**
   * Warmup a persona by visiting trusted sites
   * @param {string} personaId - Persona identifier
   * @returns {Promise<void>}
   */
  async warmupPersona(personaId) {
    const persona = this.personaPool.get(personaId);
    if (!persona) {
      throw new PersonaNotFoundError(personaId);
    }

    if (persona.metadata.warmupCompleted) {
      this.emit('cookieFarm.warmupSkipped', {
        personaId,
        reason: 'already completed'
      });
      return;
    }

    this.emit('cookieFarm.warmupStarted', { personaId });

    const sites = [...this.config.warmup.sites];
    const sitesToVisit = sites.slice(0, this.config.warmup.sitesPerPersona);

    if (this.config.warmup.randomOrder) {
      sitesToVisit.sort(() => Math.random() - 0.5);
    }

    for (const url of sitesToVisit) {
      try {
        await this._visitSite(persona, url);

        this.emit('cookieFarm.warmupSiteCompleted', {
          personaId,
          url
        });
      } catch (err) {
        this.emit('cookieFarm.warmupSiteFailed', {
          personaId,
          url,
          error: err.message
        });
      }
    }

    // Mark warmup as completed
    persona.metadata.warmupCompleted = true;

    // Recalculate quality
    await this._calculateQuality(persona);

    // Save to storage
    await this._savePersona(persona);

    this.emit('cookieFarm.warmupCompleted', { personaId });
  }

  /**
   * Visit a site with persona
   * @private
   */
  async _visitSite(persona, url) {
    const page = await this.puppeteerPlugin.navigate(url, {
      useSession: persona.sessionId
    });

    // Random time on site
    const timeOnSite = this.config.warmup.timePerSite.min +
      Math.random() * (this.config.warmup.timePerSite.max - this.config.warmup.timePerSite.min);

    // Perform interactions
    if (this.config.warmup.interactions.scroll) {
      await page.humanScroll({ direction: 'down' });
      await this._delay(1000);
    }

    if (this.config.warmup.interactions.hover) {
      try {
        const elements = await page.$$('a, button');
        if (elements.length > 0) {
          const randomElement = elements[Math.floor(Math.random() * elements.length)];
          await randomElement.hover();
        }
      } catch (err) {
        // Ignore hover errors
      }
    }

    // Wait remaining time
    await this._delay(timeOnSite);

    // Update reputation
    persona.reputation.successCount++;
    persona.reputation.totalRequests++;
    persona.reputation.successRate = persona.reputation.successCount / persona.reputation.totalRequests;
    persona.metadata.lastUsed = Date.now();

    await page.close();
  }

  /**
   * Calculate quality score for persona
   * @private
   */
  async _calculateQuality(persona) {
    if (!this.config.quality.enabled) {
      return;
    }

    const factors = this.config.quality.factors;
    let score = 0;

    // Age factor (older = better, up to 24h)
    const ageInHours = persona.metadata.age / (1000 * 60 * 60);
    const ageScore = Math.min(ageInHours / 24, 1);
    score += ageScore * factors.age;

    // Success rate factor
    score += persona.reputation.successRate * factors.successRate;

    // Request count factor (more requests = better, up to maxRequests)
    const requestScore = Math.min(
      persona.reputation.totalRequests / this.config.rotation.maxRequests,
      1
    );
    score += requestScore * factors.requestCount;

    // Warmup completed factor
    const warmupScore = persona.metadata.warmupCompleted ? 1 : 0;
    score += warmupScore * factors.warmupCompleted;

    // Normalize to 0-1
    persona.quality.score = score;

    // Determine rating
    const thresholds = this.config.quality.thresholds;
    if (score >= thresholds.high) {
      persona.quality.rating = 'high';
    } else if (score >= thresholds.medium) {
      persona.quality.rating = 'medium';
    } else {
      persona.quality.rating = 'low';
    }

    persona.quality.lastCalculated = Date.now();
  }

  /**
   * Save persona to storage
   * @private
   */
  async _savePersona(persona) {
    persona.metadata.age = Date.now() - persona.metadata.createdAt;

    const storage = this.database.getResource(this.config.storage.resource);
    await storage.update(persona.id, persona);
  }

  /**
   * Get persona by criteria
   * @param {Object} criteria - Selection criteria
   * @returns {Promise<Object|null>}
   */
  async getPersona(criteria = {}) {
    const {
      quality = null, // 'low' | 'medium' | 'high'
      minQualityScore = 0,
      proxyId = null,
      excludeRetired = true
    } = criteria;

    const candidates = Array.from(this.personaPool.values()).filter(persona => {
      // Exclude retired
      if (excludeRetired && persona.metadata.retired) {
        return false;
      }

      // Quality filter
      if (quality && persona.quality.rating !== quality) {
        return false;
      }

      // Min quality score
      if (persona.quality.score < minQualityScore) {
        return false;
      }

      // Proxy filter
      if (proxyId && persona.proxyId !== proxyId) {
        return false;
      }

      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    // Sort by quality score descending
    candidates.sort((a, b) => b.quality.score - a.quality.score);

    return candidates[0];
  }

  /**
   * Record persona usage
   * @param {string} personaId - Persona identifier
   * @param {Object} result - Usage result
   */
  async recordUsage(personaId, result = {}) {
    const { success = true } = result;

    const persona = this.personaPool.get(personaId);
    if (!persona) {
      throw new PersonaNotFoundError(personaId);
    }

    persona.reputation.totalRequests++;
    persona.metadata.lastUsed = Date.now();

    if (success) {
      persona.reputation.successCount++;
    } else {
      persona.reputation.failCount++;
    }

    persona.reputation.successRate = persona.reputation.successCount / persona.reputation.totalRequests;

    // Recalculate quality
    await this._calculateQuality(persona);

    // Check if should retire
    if (this._shouldRetire(persona)) {
      await this.retirePersona(personaId);
    } else {
      await this._savePersona(persona);
    }

    this.emit('cookieFarm.usageRecorded', {
      personaId,
      success,
      quality: persona.quality
    });
  }

  /**
   * Check if persona should be retired
   * @private
   */
  _shouldRetire(persona) {
    if (!this.config.rotation.enabled) {
      return false;
    }

    // Check age
    if (Date.now() > persona.metadata.expiresAt) {
      return true;
    }

    // Check request count
    if (persona.reputation.totalRequests >= this.config.rotation.maxRequests) {
      return true;
    }

    // Check success rate
    if (persona.reputation.successRate < this.config.rotation.retireOnFailureRate) {
      return true;
    }

    // Check quality score
    if (persona.quality.score < this.config.rotation.minQualityScore) {
      return true;
    }

    return false;
  }

  /**
   * Retire a persona
   * @param {string} personaId - Persona identifier
   */
  async retirePersona(personaId) {
    const persona = this.personaPool.get(personaId);
    if (!persona) {
      throw new PersonaNotFoundError(personaId);
    }

    persona.metadata.retired = true;
    await this._savePersona(persona);

    this.emit('cookieFarm.personaRetired', {
      personaId,
      reason: 'rotation policy'
    });
  }

  /**
   * Get statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const personas = Array.from(this.personaPool.values());

    const stats = {
      total: personas.length,
      active: 0,
      retired: 0,
      byQuality: { high: 0, medium: 0, low: 0 },
      byProxy: {},
      warmupCompleted: 0,
      averageQualityScore: 0,
      averageSuccessRate: 0,
      totalRequests: 0
    };

    let qualitySum = 0;
    let successRateSum = 0;

    for (const persona of personas) {
      if (persona.metadata.retired) {
        stats.retired++;
      } else {
        stats.active++;
      }

      stats.byQuality[persona.quality.rating]++;

      if (persona.proxyId) {
        stats.byProxy[persona.proxyId] = (stats.byProxy[persona.proxyId] || 0) + 1;
      }

      if (persona.metadata.warmupCompleted) {
        stats.warmupCompleted++;
      }

      qualitySum += persona.quality.score;
      successRateSum += persona.reputation.successRate;
      stats.totalRequests += persona.reputation.totalRequests;
    }

    if (personas.length > 0) {
      stats.averageQualityScore = qualitySum / personas.length;
      stats.averageSuccessRate = successRateSum / personas.length;
    }

    return stats;
  }

  /**
   * Export personas
   * @param {Object} options - Export options
   * @returns {Promise<Array>}
   */
  async exportPersonas(options = {}) {
    const { includeRetired = false, format = this.config.export.format } = options;

    const personas = Array.from(this.personaPool.values())
      .filter(persona => includeRetired || !persona.metadata.retired);

    // Mask credentials if needed
    if (!this.config.export.includeCredentials) {
      personas.forEach(persona => {
        if (persona.fingerprint.proxy) {
          persona.fingerprint.proxy = persona.proxyId; // Just ID, not full URL
        }
      });
    }

    return personas;
  }

  /**
   * Delay helper
   * @private
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CookieFarmPlugin;
