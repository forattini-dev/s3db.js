/**
 * NetworkMonitor - Comprehensive Network Activity Tracking
 *
 * Captures all network requests/responses using Chrome DevTools Protocol (CDP):
 * - Request/Response headers, timing, sizes
 * - Status codes, errors, redirects
 * - Resource types (image, script, stylesheet, xhr, fetch, etc.)
 * - Compression detection (gzip, brotli)
 * - Cache behavior
 * - Failed requests
 *
 * Persistence Strategy:
 * - Optional S3DB storage with intelligent partitioning
 * - Compression for large payloads
 * - Filtering by resource type, status, size
 * - Separate resources for sessions, requests, and errors
 *
 * Use cases:
 * - SEO analysis (image sizes, script sizes, load times)
 * - Performance debugging (slow requests, failed requests)
 * - Security auditing (CSP violations, mixed content)
 * - Cost analysis (bandwidth usage)
 * - A/B testing (compare network behavior)
 */
import tryFn from '../../concerns/try-fn.js';

export class NetworkMonitor {
  constructor(plugin) {
    this.plugin = plugin;
    this.config = plugin.config.networkMonitor || {
      enabled: false,
      persist: false,
      filters: {
        types: null,          // ['image', 'script', 'stylesheet'] or null for all
        statuses: null,       // [404, 500] or null for all
        minSize: null,        // Only requests >= this size (bytes)
        maxSize: null,        // Only requests <= this size (bytes)
        saveErrors: true,     // Always save failed requests
        saveLargeAssets: true // Always save assets > 1MB
      },
      compression: {
        enabled: true,
        threshold: 10240      // Compress payloads > 10KB
      }
    };

    // Resources for persistence (lazy-initialized)
    this.sessionsResource = null;
    this.requestsResource = null;
    this.errorsResource = null;

    // Resource type mapping (CDP -> simplified)
    this.resourceTypes = {
      'Document': 'document',
      'Stylesheet': 'stylesheet',
      'Image': 'image',
      'Media': 'media',
      'Font': 'font',
      'Script': 'script',
      'TextTrack': 'texttrack',
      'XHR': 'xhr',
      'Fetch': 'fetch',
      'EventSource': 'eventsource',
      'WebSocket': 'websocket',
      'Manifest': 'manifest',
      'SignedExchange': 'signedexchange',
      'Ping': 'ping',
      'CSPViolationReport': 'cspviolation',
      'Preflight': 'preflight',
      'Other': 'other'
    };
  }

  /**
   * Initialize network monitoring resources
   */
  async initialize() {
    if (!this.config.persist) {
      return;
    }

    // Create sessions resource (metadata about each crawl session)
    const resourceNames = this.plugin.resourceNames || {};
    const sessionsName = resourceNames.networkSessions || 'plg_puppeteer_network_sessions';
    const requestsName = resourceNames.networkRequests || 'plg_puppeteer_network_requests';
    const errorsName = resourceNames.networkErrors || 'plg_puppeteer_network_errors';

    const [sessionsCreated, sessionsErr, sessionsResource] = await tryFn(() => this.plugin.database.createResource({
      name: sessionsName,
      attributes: {
        sessionId: 'string|required',
        url: 'string|required',
        domain: 'string|required',
        date: 'string|required',         // YYYY-MM-DD for partitioning
        startTime: 'number|required',
        endTime: 'number',
        duration: 'number',

        // Summary statistics
        totalRequests: 'number',
        successfulRequests: 'number',
        failedRequests: 'number',
        totalBytes: 'number',
        transferredBytes: 'number',
        cachedBytes: 'number',

        // By type
        byType: 'object',                // { image: { count, size }, script: {...} }

        // Performance metrics
        performance: 'object',           // From PerformanceManager

        // User agent
        userAgent: 'string'
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        byUrl: { fields: { url: 'string' } },
        byDate: { fields: { date: 'string' } },
        byDomain: { fields: { domain: 'string' } }
      }
    }));

    if (sessionsCreated) {
      this.sessionsResource = sessionsResource;
    } else if (this.plugin.database.resources?.[sessionsName]) {
      this.sessionsResource = this.plugin.database.resources[sessionsName];
    } else {
      throw sessionsErr;
    }

    // Create requests resource (detailed info about each request)
    const [requestsCreated, requestsErr, requestsResource] = await tryFn(() => this.plugin.database.createResource({
      name: requestsName,
      attributes: {
        requestId: 'string|required',
        sessionId: 'string|required',
        url: 'string|required',
        domain: 'string|required',
        path: 'string',

        // Type and categorization
        type: 'string|required',         // image, script, stylesheet, xhr, etc.
        statusCode: 'number',
        statusText: 'string',
        method: 'string',                // GET, POST, etc.

        // Size information
        size: 'number',                  // Total size (bytes)
        transferredSize: 'number',       // Bytes transferred (after compression)
        resourceSize: 'number',          // Uncompressed size
        fromCache: 'boolean',

        // Timing information (ms)
        timing: 'object',                // { dns, tcp, ssl, request, response, total }
        startTime: 'number',
        endTime: 'number',
        duration: 'number',

        // Headers (compressed if large)
        requestHeaders: 'object',
        responseHeaders: 'object',

        // Compression
        compression: 'string',           // gzip, br (brotli), deflate, none

        // Cache
        cacheControl: 'string',
        expires: 'string',

        // Error information (if failed)
        failed: 'boolean',
        errorText: 'string',
        blockedReason: 'string',         // CSP, mixed-content, etc.

        // Redirects
        redirected: 'boolean',
        redirectUrl: 'string',

        // CDN detection
        cdn: 'string',                   // cloudflare, cloudfront, fastly, etc.
        cdnDetected: 'boolean',

        // Metadata
        mimeType: 'string',
        priority: 'string'               // VeryHigh, High, Medium, Low, VeryLow
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        bySession: { fields: { sessionId: 'string' } },
        byType: { fields: { type: 'string' } },
        byStatus: { fields: { statusCode: 'number' } },
        bySize: { fields: { size: 'number' } },
        byDomain: { fields: { domain: 'string' } }
      }
    }));

    if (requestsCreated) {
      this.requestsResource = requestsResource;
    } else if (this.plugin.database.resources?.[requestsName]) {
      this.requestsResource = this.plugin.database.resources[requestsName];
    } else {
      throw requestsErr;
    }

    // Create errors resource (failed requests only)
    const [errorsCreated, errorsErr, errorsResource] = await tryFn(() => this.plugin.database.createResource({
      name: errorsName,
      attributes: {
        errorId: 'string|required',
        sessionId: 'string|required',
        requestId: 'string|required',
        url: 'string|required',
        domain: 'string|required',
        date: 'string|required',         // YYYY-MM-DD

        // Error details
        errorType: 'string|required',    // net::ERR_*, failed, timeout, blocked
        errorText: 'string',
        statusCode: 'number',

        // Context
        type: 'string',                  // Resource type
        method: 'string',
        timing: 'object',

        // Additional info
        blockedReason: 'string',
        consoleMessages: 'array'         // Related console errors
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        bySession: { fields: { sessionId: 'string' } },
        byErrorType: { fields: { errorType: 'string' } },
        byDate: { fields: { date: 'string' } },
        byDomain: { fields: { domain: 'string' } }
      }
    }));

    if (errorsCreated) {
      this.errorsResource = errorsResource;
    } else if (this.plugin.database.resources?.[errorsName]) {
      this.errorsResource = this.plugin.database.resources[errorsName];
    } else {
      throw errorsErr;
    }

    this.plugin.emit('networkMonitor.initialized', {
      persist: this.config.persist
    });
  }

  /**
   * Start monitoring network activity for a page
   * @param {Page} page - Puppeteer page
   * @param {Object} options - Monitoring options
   * @returns {Object} Session object with methods
   */
  async startMonitoring(page, options = {}) {
    const {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      persist = this.config.persist,
      filters = this.config.filters
    } = options;

    const session = {
      sessionId,
      url: page.url(),
      domain: this._extractDomain(page.url()),
      date: new Date().toISOString().split('T')[0],
      startTime: Date.now(),
      endTime: null,
      duration: null,

      // Tracked data
      requests: new Map(),             // requestId -> request data
      responses: new Map(),            // requestId -> response data
      failures: [],
      consoleMessages: [],

      // Statistics
      stats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalBytes: 0,
        transferredBytes: 0,
        cachedBytes: 0,
        byType: {}
      }
    };

    // Get CDP session
    const client = await page.target().createCDPSession();

    // Enable Network domain
    await client.send('Network.enable');

    // Request will be sent
    client.on('Network.requestWillBeSent', (params) => {
      const requestData = {
        requestId: params.requestId,
        url: params.request.url,
        domain: this._extractDomain(params.request.url),
        path: this._extractPath(params.request.url),
        type: this.resourceTypes[params.type] || 'other',
        method: params.request.method,
        requestHeaders: params.request.headers,
        priority: params.request.initialPriority,
        startTime: params.timestamp * 1000, // Convert to ms
        redirected: !!params.redirectResponse,
        redirectUrl: params.redirectResponse?.url || null
      };

      session.requests.set(params.requestId, requestData);
      session.stats.totalRequests++;
    });

    // Response received
    client.on('Network.responseReceived', (params) => {
      const responseData = {
        requestId: params.requestId,
        statusCode: params.response.status,
        statusText: params.response.statusText,
        mimeType: params.response.mimeType,
        responseHeaders: params.response.headers,
        fromCache: params.response.fromDiskCache || params.response.fromServiceWorker,
        compression: this._detectCompression(params.response.headers),
        cacheControl: params.response.headers['cache-control'] || params.response.headers['Cache-Control'],
        expires: params.response.headers['expires'] || params.response.headers['Expires'],
        timing: params.response.timing ? this._parseTiming(params.response.timing) : null,
        cdn: this._detectCDN(params.response.headers),
        cdnDetected: !!this._detectCDN(params.response.headers)
      };

      session.responses.set(params.requestId, responseData);
    });

    // Loading finished
    client.on('Network.loadingFinished', (params) => {
      const request = session.requests.get(params.requestId);
      const response = session.responses.get(params.requestId);

      if (request && response) {
        const endTime = params.timestamp * 1000;
        const duration = endTime - request.startTime;

        const combined = {
          ...request,
          ...response,
          endTime,
          duration,
          size: params.encodedDataLength,
          transferredSize: params.encodedDataLength,
          resourceSize: params.decodedBodyLength || params.encodedDataLength,
          failed: false
        };

        // Check if passes filters
        if (this._passesFilters(combined, filters)) {
          session.requests.set(params.requestId, combined);

          // Update stats
          session.stats.successfulRequests++;
          session.stats.totalBytes += combined.resourceSize || 0;
          session.stats.transferredBytes += combined.transferredSize || 0;

          if (combined.fromCache) {
            session.stats.cachedBytes += combined.resourceSize || 0;
          }

          // By type stats
          const type = combined.type;
          if (!session.stats.byType[type]) {
            session.stats.byType[type] = { count: 0, size: 0, transferredSize: 0 };
          }
          session.stats.byType[type].count++;
          session.stats.byType[type].size += combined.resourceSize || 0;
          session.stats.byType[type].transferredSize += combined.transferredSize || 0;
        } else {
          // Remove if doesn't pass filters
          session.requests.delete(params.requestId);
        }
      }
    });

    // Loading failed
    client.on('Network.loadingFailed', (params) => {
      const request = session.requests.get(params.requestId);

      if (request) {
        const errorData = {
          ...request,
          failed: true,
          errorText: params.errorText,
          blockedReason: params.blockedReason,
          endTime: params.timestamp * 1000,
          duration: (params.timestamp * 1000) - request.startTime
        };

        session.failures.push(errorData);
        session.stats.failedRequests++;

        // Remove from requests if not saving errors
        if (!filters.saveErrors) {
          session.requests.delete(params.requestId);
        } else {
          session.requests.set(params.requestId, errorData);
        }
      }
    });

    // Console messages (for correlation with errors)
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        session.consoleMessages.push({
          type: msg.type(),
          text: msg.text(),
          timestamp: Date.now()
        });
      }
    });

    // Store CDP session for cleanup
    session._cdpSession = client;
    session._persist = persist;
    session._page = page;

    this.plugin.emit('networkMonitor.sessionStarted', {
      sessionId,
      url: page.url()
    });

    return session;
  }

  /**
   * Stop monitoring and optionally persist data
   * @param {Object} session - Session object from startMonitoring
   * @param {Object} options - Stop options
   * @returns {Object} Final session data
   */
  async stopMonitoring(session, options = {}) {
    const {
      persist = session._persist,
      includePerformance = true
    } = options;

    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;

    // Collect performance metrics if available
    if (includePerformance && this.plugin.performanceManager && session._page) {
      try {
        session.performance = await this.plugin.performanceManager.collectMetrics(session._page, {
          waitForLoad: false,
          collectResources: false, // We already have this from CDP
          collectMemory: true
        });
      } catch (err) {
        this.plugin.emit('networkMonitor.performanceCollectionFailed', {
          sessionId: session.sessionId,
          error: err.message
        });
      }
    }

    // Disable network tracking
    if (session._cdpSession) {
      try {
        await session._cdpSession.send('Network.disable');
        await session._cdpSession.detach();
      } catch (err) {
        // Ignore - page might be closed
      }
    }

    // Convert Map to Array for persistence
    const requestsArray = Array.from(session.requests.values());

    // Persist to S3DB if enabled
    if (persist && this.sessionsResource) {
      try {
        await this._persistSession(session, requestsArray);
      } catch (err) {
        this.plugin.emit('networkMonitor.persistFailed', {
          sessionId: session.sessionId,
          error: err.message
        });
      }
    }

    this.plugin.emit('networkMonitor.sessionStopped', {
      sessionId: session.sessionId,
      duration: session.duration,
      totalRequests: session.stats.totalRequests,
      failedRequests: session.stats.failedRequests
    });

    // Clean up references
    delete session._cdpSession;
    delete session._page;

    return {
      ...session,
      requests: requestsArray
    };
  }

  /**
   * Persist session data to S3DB
   * @private
   */
  async _persistSession(session, requests) {
    const startPersist = Date.now();

    // Save session metadata
    await this.sessionsResource.insert({
      sessionId: session.sessionId,
      url: session.url,
      domain: session.domain,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      totalRequests: session.stats.totalRequests,
      successfulRequests: session.stats.successfulRequests,
      failedRequests: session.stats.failedRequests,
      totalBytes: session.stats.totalBytes,
      transferredBytes: session.stats.transferredBytes,
      cachedBytes: session.stats.cachedBytes,
      byType: session.stats.byType,
      performance: session.performance ? {
        score: session.performance.score,
        lcp: session.performance.coreWebVitals.lcp,
        cls: session.performance.coreWebVitals.cls,
        fcp: session.performance.coreWebVitals.fcp
      } : null,
      userAgent: session._page?._userAgent || null
    });

    // Save requests (batch insert for performance)
    if (requests.length > 0) {
      const requestInserts = requests.map(req => ({
        requestId: req.requestId,
        sessionId: session.sessionId,
        url: req.url,
        domain: req.domain,
        path: req.path,
        type: req.type,
        statusCode: req.statusCode,
        statusText: req.statusText,
        method: req.method,
        size: req.resourceSize,
        transferredSize: req.transferredSize,
        resourceSize: req.resourceSize,
        fromCache: req.fromCache,
        timing: req.timing,
        startTime: req.startTime,
        endTime: req.endTime,
        duration: req.duration,
        requestHeaders: this._compressHeaders(req.requestHeaders),
        responseHeaders: this._compressHeaders(req.responseHeaders),
        compression: req.compression,
        cacheControl: req.cacheControl,
        expires: req.expires,
        failed: req.failed,
        errorText: req.errorText,
        blockedReason: req.blockedReason,
        redirected: req.redirected,
        redirectUrl: req.redirectUrl,
        cdn: req.cdn,
        cdnDetected: req.cdnDetected,
        mimeType: req.mimeType,
        priority: req.priority
      }));

      // Batch insert (s3db handles chunking)
      for (const request of requestInserts) {
        await this.requestsResource.insert(request);
      }
    }

    // Save errors separately
    if (session.failures.length > 0) {
      for (const failure of session.failures) {
        await this.errorsResource.insert({
          errorId: `error_${failure.requestId}`,
          sessionId: session.sessionId,
          requestId: failure.requestId,
          url: failure.url,
          domain: failure.domain,
          date: session.date,
          errorType: this._categorizeError(failure.errorText),
          errorText: failure.errorText,
          statusCode: failure.statusCode,
          type: failure.type,
          method: failure.method,
          timing: failure.timing,
          blockedReason: failure.blockedReason,
          consoleMessages: session.consoleMessages
            .filter(msg => Math.abs(msg.timestamp - failure.endTime) < 1000) // Within 1s
            .map(msg => msg.text)
        });
      }
    }

    const persistDuration = Date.now() - startPersist;

    this.plugin.emit('networkMonitor.persisted', {
      sessionId: session.sessionId,
      requests: requests.length,
      errors: session.failures.length,
      duration: persistDuration
    });
  }

  /**
   * Check if request passes filters
   * @private
   */
  _passesFilters(request, filters) {
    // Type filter
    if (filters.types && !filters.types.includes(request.type)) {
      return false;
    }

    // Status filter
    if (filters.statuses && !filters.statuses.includes(request.statusCode)) {
      return false;
    }

    // Size filters
    if (filters.minSize && (request.resourceSize || 0) < filters.minSize) {
      return false;
    }

    if (filters.maxSize && (request.resourceSize || 0) > filters.maxSize) {
      return false;
    }

    // Always save large assets if configured
    if (filters.saveLargeAssets && (request.resourceSize || 0) > 1024 * 1024) {
      return true;
    }

    return true;
  }

  /**
   * Extract domain from URL
   * @private
   */
  _extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract path from URL
   * @private
   */
  _extractPath(url) {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  }

  /**
   * Detect compression algorithm
   * @private
   */
  _detectCompression(headers) {
    const encoding = headers['content-encoding'] || headers['Content-Encoding'] || '';
    if (encoding.includes('br')) return 'brotli';
    if (encoding.includes('gzip')) return 'gzip';
    if (encoding.includes('deflate')) return 'deflate';
    return 'none';
  }

  /**
   * Detect CDN provider
   * @private
   */
  _detectCDN(headers) {
    const server = headers['server'] || headers['Server'] || '';
    const via = headers['via'] || headers['Via'] || '';
    const cfRay = headers['cf-ray'] || headers['CF-Ray'];
    const xCache = headers['x-cache'] || headers['X-Cache'] || '';

    if (cfRay || server.includes('cloudflare')) return 'cloudflare';
    if (xCache.includes('cloudfront') || headers['x-amz-cf-id']) return 'cloudfront';
    if (server.includes('fastly') || via.includes('fastly')) return 'fastly';
    if (headers['x-akamai-transformed'] || headers['x-akamai-staging']) return 'akamai';
    if (headers['x-cdn'] || headers['X-CDN']) return headers['x-cdn'] || headers['X-CDN'];

    return null;
  }

  /**
   * Parse timing data
   * @private
   */
  _parseTiming(timing) {
    if (!timing) return null;

    return {
      dns: timing.dnsEnd - timing.dnsStart,
      tcp: timing.connectEnd - timing.connectStart,
      ssl: timing.sslEnd - timing.sslStart,
      request: timing.sendEnd - timing.sendStart,
      response: timing.receiveHeadersEnd - timing.sendEnd,
      total: timing.receiveHeadersEnd
    };
  }

  /**
   * Compress headers (remove unnecessary data)
   * @private
   */
  _compressHeaders(headers) {
    if (!headers) return {};

    // Remove common unnecessary headers
    const compressed = { ...headers };
    const toRemove = ['cookie', 'Cookie', 'set-cookie', 'Set-Cookie'];

    toRemove.forEach(key => delete compressed[key]);

    return compressed;
  }

  /**
   * Categorize error type
   * @private
   */
  _categorizeError(errorText) {
    if (!errorText) return 'unknown';

    if (errorText.includes('ERR_NAME_NOT_RESOLVED')) return 'dns';
    if (errorText.includes('ERR_CONNECTION')) return 'connection';
    if (errorText.includes('ERR_TIMED_OUT')) return 'timeout';
    if (errorText.includes('ERR_SSL')) return 'ssl';
    if (errorText.includes('ERR_CERT')) return 'certificate';
    if (errorText.includes('ERR_BLOCKED')) return 'blocked';
    if (errorText.includes('ERR_FAILED')) return 'failed';
    if (errorText.includes('ERR_ABORTED')) return 'aborted';

    return 'other';
  }

  /**
   * Get session statistics
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Statistics
   */
  async getSessionStats(sessionId) {
    if (!this.sessionsResource) {
      throw new Error('Network monitoring persistence not enabled');
    }

    const session = await this.sessionsResource.get(sessionId);
    return session;
  }

  /**
   * Query requests for a session
   * @param {string} sessionId - Session ID
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Requests
   */
  async getSessionRequests(sessionId, filters = {}) {
    if (!this.requestsResource) {
      throw new Error('Network monitoring persistence not enabled');
    }

    // Use partition for fast lookup
    return await this.requestsResource.listPartition('bySession', { sessionId }, filters);
  }

  /**
   * Query errors for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Errors
   */
  async getSessionErrors(sessionId) {
    if (!this.errorsResource) {
      throw new Error('Network monitoring persistence not enabled');
    }

    return await this.errorsResource.listPartition('bySession', { sessionId });
  }
}

export default NetworkMonitor;
