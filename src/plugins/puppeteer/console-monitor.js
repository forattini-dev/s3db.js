/**
 * ConsoleMonitor - Console Message Tracking
 *
 * Captures all console messages from the browser:
 * - Errors, warnings, info, debug, logs
 * - Stack traces
 * - Source location (file, line, column)
 * - Uncaught exceptions
 * - Promise rejections
 * - Performance warnings
 * - Deprecation warnings
 *
 * Use cases:
 * - JavaScript error tracking
 * - Debug production issues
 * - Monitor third-party script errors
 * - Track console.warn/console.error usage
 * - Detect performance issues
 * - Security monitoring (CSP violations)
 */
import tryFn from '../../concerns/try-fn.js';

export class ConsoleMonitor {
  constructor(plugin) {
    this.plugin = plugin;
    this.config = plugin.config.consoleMonitor || {
      enabled: false,
      persist: false,
      filters: {
        levels: null,          // ['error', 'warning'] or null for all
        excludePatterns: [],   // Regex patterns to exclude
        includeStackTraces: true,
        includeSourceLocation: true,
        captureNetwork: false  // Also capture network errors from console
      }
    };

    // Resources for persistence (lazy-initialized)
    this.sessionsResource = null;
    this.messagesResource = null;
    this.errorsResource = null;

    // Console message types
    this.messageTypes = {
      'log': 'log',
      'debug': 'debug',
      'info': 'info',
      'error': 'error',
      'warning': 'warning',
      'warn': 'warning',  // Alias
      'dir': 'dir',
      'dirxml': 'dirxml',
      'table': 'table',
      'trace': 'trace',
      'clear': 'clear',
      'startGroup': 'group',
      'startGroupCollapsed': 'groupCollapsed',
      'endGroup': 'groupEnd',
      'assert': 'assert',
      'profile': 'profile',
      'profileEnd': 'profileEnd',
      'count': 'count',
      'timeEnd': 'timeEnd',
      'verbose': 'verbose'
    };
  }

  /**
   * Initialize console monitoring resources
   */
  async initialize() {
    if (!this.config.persist) {
      return;
    }

    const resourceNames = this.plugin.resourceNames || {};
    const sessionsName = resourceNames.consoleSessions || 'plg_puppeteer_console_sessions';
    const messagesName = resourceNames.consoleMessages || 'plg_puppeteer_console_messages';
    const errorsName = resourceNames.consoleErrors || 'plg_puppeteer_console_errors';

    // Create sessions resource (metadata about each console session)
    const [sessionsCreated, sessionsErr, sessionsResource] = await tryFn(() => this.plugin.database.createResource({
      name: sessionsName,
      attributes: {
        sessionId: 'string|required',
        url: 'string|required',
        domain: 'string|required',
        date: 'string|required',         // YYYY-MM-DD
        startTime: 'number|required',
        endTime: 'number',
        duration: 'number',

        // Statistics
        totalMessages: 'number',
        errorCount: 'number',
        warningCount: 'number',
        logCount: 'number',
        infoCount: 'number',
        debugCount: 'number',

        // By type breakdown
        byType: 'object',                // { error: 5, warning: 3, log: 20 }

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

    // Create messages resource (all console messages)
    const [messagesCreated, messagesErr, messagesResource] = await tryFn(() => this.plugin.database.createResource({
      name: messagesName,
      attributes: {
        messageId: 'string|required',
        sessionId: 'string|required',
        timestamp: 'number|required',
        date: 'string|required',

        // Message details
        type: 'string|required',         // error, warning, log, info, debug, etc.
        text: 'string|required',
        args: 'array',                   // Console.log arguments

        // Source location
        source: 'object',                // { url, lineNumber, columnNumber }

        // Stack trace (for errors)
        stackTrace: 'object',

        // Context
        url: 'string',                   // Page URL when message occurred
        domain: 'string'
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        bySession: { fields: { sessionId: 'string' } },
        byType: { fields: { type: 'string' } },
        byDate: { fields: { date: 'string' } },
        byDomain: { fields: { domain: 'string' } }
      }
    }));

    if (messagesCreated) {
      this.messagesResource = messagesResource;
    } else if (this.plugin.database.resources?.[messagesName]) {
      this.messagesResource = this.plugin.database.resources[messagesName];
    } else {
      throw messagesErr;
    }

    // Create errors resource (errors and exceptions only)
    const [errorsCreated, errorsErr, errorsResource] = await tryFn(() => this.plugin.database.createResource({
      name: errorsName,
      attributes: {
        errorId: 'string|required',
        sessionId: 'string|required',
        messageId: 'string|required',
        timestamp: 'number|required',
        date: 'string|required',

        // Error details
        errorType: 'string',             // TypeError, ReferenceError, etc.
        message: 'string|required',
        stackTrace: 'object',

        // Source location
        url: 'string',                   // Script URL
        lineNumber: 'number',
        columnNumber: 'number',

        // Context
        pageUrl: 'string',               // Page URL when error occurred
        domain: 'string',

        // Classification
        isUncaught: 'boolean',
        isPromiseRejection: 'boolean',
        isNetworkError: 'boolean',
        isSyntaxError: 'boolean'
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

    this.plugin.emit('consoleMonitor.initialized', {
      persist: this.config.persist
    });
  }

  /**
   * Start monitoring console messages for a page
   * @param {Page} page - Puppeteer page
   * @param {Object} options - Monitoring options
   * @returns {Object} Session object
   */
  async startMonitoring(page, options = {}) {
    const {
      sessionId = `console_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
      messages: [],
      errors: [],
      exceptions: [],
      promiseRejections: [],

      // Statistics
      stats: {
        totalMessages: 0,
        errorCount: 0,
        warningCount: 0,
        logCount: 0,
        infoCount: 0,
        debugCount: 0,
        byType: {}
      }
    };

    // Console message handler
    const consoleHandler = (msg) => {
      const type = this.messageTypes[msg.type()] || msg.type();

      // Apply filters
      if (filters.levels && !filters.levels.includes(type)) {
        return;
      }

      const text = msg.text();

      // Exclude patterns
      if (filters.excludePatterns && filters.excludePatterns.length > 0) {
        for (const pattern of filters.excludePatterns) {
          if (new RegExp(pattern).test(text)) {
            return;
          }
        }
      }

      const message = {
        messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        type,
        text,
        args: msg.args().length > 0 ? msg.args().map(arg => this._serializeArg(arg)) : [],
        url: page.url()
      };

      // Get source location if enabled
      if (filters.includeSourceLocation && msg.location()) {
        message.source = {
          url: msg.location().url,
          lineNumber: msg.location().lineNumber,
          columnNumber: msg.location().columnNumber
        };
      }

      // Get stack trace for errors if enabled
      if (filters.includeStackTraces && (type === 'error' || type === 'warning')) {
        message.stackTrace = msg.stackTrace();
      }

      session.messages.push(message);
      session.stats.totalMessages++;

      // Update type counters
      if (!session.stats.byType[type]) {
        session.stats.byType[type] = 0;
      }
      session.stats.byType[type]++;

      // Update specific counters
      switch (type) {
        case 'error':
          session.stats.errorCount++;
          session.errors.push(message);
          break;
        case 'warning':
          session.stats.warningCount++;
          break;
        case 'log':
          session.stats.logCount++;
          break;
        case 'info':
          session.stats.infoCount++;
          break;
        case 'debug':
          session.stats.debugCount++;
          break;
      }
    };

    // Page error handler (uncaught exceptions)
    const pageErrorHandler = (error) => {
      const errorData = {
        errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        errorType: error.name || 'Error',
        message: error.message,
        stack: error.stack,
        isUncaught: true,
        url: page.url()
      };

      session.exceptions.push(errorData);
      session.stats.errorCount++;

      // Also add to messages for unified view
      session.messages.push({
        messageId: errorData.errorId,
        timestamp: errorData.timestamp,
        type: 'error',
        text: `Uncaught: ${error.message}`,
        stackTrace: error.stack,
        url: page.url()
      });
    };

    // Promise rejection handler
    const pageerrorHandler = (error) => {
      const errorData = {
        errorId: `rejection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        errorType: 'UnhandledPromiseRejection',
        message: error.message || String(error),
        stack: error.stack,
        isPromiseRejection: true,
        url: page.url()
      };

      session.promiseRejections.push(errorData);
      session.stats.errorCount++;

      // Also add to messages
      session.messages.push({
        messageId: errorData.errorId,
        timestamp: errorData.timestamp,
        type: 'error',
        text: `Unhandled Promise Rejection: ${errorData.message}`,
        stackTrace: error.stack,
        url: page.url()
      });
    };

    // Attach handlers
    page.on('console', consoleHandler);
    page.on('pageerror', pageErrorHandler);
    page.on('pageerror', pageerrorHandler);  // Some versions use different event

    // Store handlers for cleanup
    session._handlers = {
      console: consoleHandler,
      pageerror: pageErrorHandler,
      pageerror2: pageerrorHandler
    };
    session._page = page;
    session._persist = persist;

    this.plugin.emit('consoleMonitor.sessionStarted', {
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
    const { persist = session._persist } = options;

    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;

    // Remove handlers
    if (session._page && session._handlers) {
      session._page.off('console', session._handlers.console);
      session._page.off('pageerror', session._handlers.pageerror);
      session._page.off('pageerror', session._handlers.pageerror2);
    }

    // Persist to S3DB if enabled
    if (persist && this.sessionsResource) {
      try {
        await this._persistSession(session);
      } catch (err) {
        this.plugin.emit('consoleMonitor.persistFailed', {
          sessionId: session.sessionId,
          error: err.message
        });
      }
    }

    this.plugin.emit('consoleMonitor.sessionStopped', {
      sessionId: session.sessionId,
      duration: session.duration,
      totalMessages: session.stats.totalMessages,
      errorCount: session.stats.errorCount
    });

    // Clean up references
    delete session._handlers;
    delete session._page;

    return session;
  }

  /**
   * Persist session data to S3DB
   * @private
   */
  async _persistSession(session) {
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
      totalMessages: session.stats.totalMessages,
      errorCount: session.stats.errorCount,
      warningCount: session.stats.warningCount,
      logCount: session.stats.logCount,
      infoCount: session.stats.infoCount,
      debugCount: session.stats.debugCount,
      byType: session.stats.byType,
      userAgent: session._page?._userAgent || null
    });

    // Save messages (batch)
    if (session.messages.length > 0) {
      for (const msg of session.messages) {
        await this.messagesResource.insert({
          messageId: msg.messageId,
          sessionId: session.sessionId,
          timestamp: msg.timestamp,
          date: session.date,
          type: msg.type,
          text: msg.text,
          args: msg.args,
          source: msg.source || null,
          stackTrace: msg.stackTrace || null,
          url: msg.url,
          domain: this._extractDomain(msg.url)
        });
      }
    }

    // Save errors separately (uncaught exceptions + promise rejections)
    const allErrors = [
      ...session.exceptions.map(e => ({ ...e, isUncaught: true })),
      ...session.promiseRejections.map(e => ({ ...e, isPromiseRejection: true }))
    ];

    if (allErrors.length > 0) {
      for (const error of allErrors) {
        // Parse error type from message or use generic
        const errorType = this._extractErrorType(error.message);

        // Parse source location from stack if available
        const sourceLocation = this._parseStackTrace(error.stack);

        await this.errorsResource.insert({
          errorId: error.errorId,
          sessionId: session.sessionId,
          messageId: error.errorId,
          timestamp: error.timestamp,
          date: session.date,
          errorType: error.errorType || errorType,
          message: error.message,
          stackTrace: this._formatStackTrace(error.stack),
          url: sourceLocation?.url || null,
          lineNumber: sourceLocation?.lineNumber || null,
          columnNumber: sourceLocation?.columnNumber || null,
          pageUrl: error.url,
          domain: this._extractDomain(error.url),
          isUncaught: error.isUncaught || false,
          isPromiseRejection: error.isPromiseRejection || false,
          isNetworkError: this._isNetworkError(error.message),
          isSyntaxError: errorType === 'SyntaxError'
        });
      }
    }

    const persistDuration = Date.now() - startPersist;

    this.plugin.emit('consoleMonitor.persisted', {
      sessionId: session.sessionId,
      messages: session.messages.length,
      errors: allErrors.length,
      duration: persistDuration
    });
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
   * Serialize console.log argument
   * @private
   */
  _serializeArg(arg) {
    try {
      return arg.toString();
    } catch {
      return '[Object]';
    }
  }

  /**
   * Extract error type from message
   * @private
   */
  _extractErrorType(message) {
    const errorTypes = [
      'TypeError',
      'ReferenceError',
      'SyntaxError',
      'RangeError',
      'URIError',
      'EvalError',
      'SecurityError',
      'NetworkError'
    ];

    for (const type of errorTypes) {
      if (message.includes(type)) {
        return type;
      }
    }

    return 'Error';
  }

  /**
   * Parse stack trace to extract source location
   * @private
   */
  _parseStackTrace(stack) {
    if (!stack) return null;

    try {
      // Parse first line of stack trace
      const lines = stack.split('\n');
      const firstLine = lines[0] || '';

      // Match various stack trace formats
      const match = firstLine.match(/at\s+(.+?):(\d+):(\d+)/) ||
                    firstLine.match(/(.+?):(\d+):(\d+)/) ||
                    firstLine.match(/@(.+?):(\d+):(\d+)/);

      if (match) {
        return {
          url: match[1],
          lineNumber: parseInt(match[2], 10),
          columnNumber: parseInt(match[3], 10)
        };
      }
    } catch {
      // Ignore parse errors
    }

    return null;
  }

  /**
   * Format stack trace for storage
   * @private
   */
  _formatStackTrace(stack) {
    if (!stack) return null;

    try {
      const lines = stack.split('\n').slice(0, 10);  // Keep first 10 lines
      return {
        raw: stack.substring(0, 2000),  // Limit to 2KB
        frames: lines.map(line => line.trim())
      };
    } catch {
      return { raw: stack.substring(0, 2000) };
    }
  }

  /**
   * Check if error is network-related
   * @private
   */
  _isNetworkError(message) {
    const networkKeywords = [
      'net::ERR_',
      'NetworkError',
      'Failed to fetch',
      'fetch failed',
      'XMLHttpRequest',
      'CORS',
      'Network request failed'
    ];

    return networkKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Get session statistics
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Statistics
   */
  async getSessionStats(sessionId) {
    if (!this.sessionsResource) {
      throw new Error('Console monitoring persistence not enabled');
    }

    return await this.sessionsResource.get(sessionId);
  }

  /**
   * Query messages for a session
   * @param {string} sessionId - Session ID
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} Messages
   */
  async getSessionMessages(sessionId, filters = {}) {
    if (!this.messagesResource) {
      throw new Error('Console monitoring persistence not enabled');
    }

    return await this.messagesResource.listPartition('bySession', { sessionId }, filters);
  }

  /**
   * Query errors for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Errors
   */
  async getSessionErrors(sessionId) {
    if (!this.errorsResource) {
      throw new Error('Console monitoring persistence not enabled');
    }

    return await this.errorsResource.listPartition('bySession', { sessionId });
  }

  /**
   * Query all errors by type
   * @param {string} errorType - Error type
   * @returns {Promise<Array>} Errors
   */
  async getErrorsByType(errorType) {
    if (!this.errorsResource) {
      throw new Error('Console monitoring persistence not enabled');
    }

    return await this.errorsResource.listPartition('byErrorType', { errorType });
  }
}

export default ConsoleMonitor;
