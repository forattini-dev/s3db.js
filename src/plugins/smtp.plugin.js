import { Plugin } from './plugin.class.js';
import { SMTPConnectionManager } from './smtp/connection-manager.js';
import { SMTPTemplateEngine, defaultHandlebarsHelpers } from './smtp/template-engine.js';
import { WebhookReceiver } from './smtp/webhook-receiver.js';
import { createDriver, getAvailableDrivers, MultiRelayManager } from './smtp/drivers/index.js';
import {
  SMTPError,
  AuthenticationError,
  TemplateError,
  RateLimitError,
  RecipientError,
  ConnectionError,
  AttachmentError
} from './smtp/errors.js';

/**
 * SMTPPlugin - Email delivery via SMTP relay or in-process SMTP server
 *
 * Provides flexible email delivery with multiple modes:
 * - Relay mode: Send via external SMTP (SendGrid, SES, Mailgun, etc.)
 * - Server mode: In-process SMTP listener
 *
 * Features:
 * - Automatic email resource creation & lifecycle tracking
 * - Template support (Handlebars + custom functions)
 * - Attachment handling (inline + file-based)
 * - Automatic retry with exponential backoff
 * - Rate limiting (global + per-domain)
 * - Bounce/complaint webhook handling
 * - Pre/post hooks for extensibility
 *
 * === Configuration ===
 *
 * // Relay mode (external SMTP)
 * new SMTPPlugin({
 *   mode: 'relay',
 *   host: 'smtp.sendgrid.net',
 *   port: 587,
 *   secure: false, // STARTTLS
 *   auth: {
 *     user: 'apikey',
 *     pass: process.env.SENDGRID_API_KEY
 *   },
 *   emailResource: 'emails',
 *   retryPolicy: {
 *     maxAttempts: 5,
 *     initialDelay: 1000,
 *     maxDelay: 60000,
 *     multiplier: 2,
 *     jitter: 0.1
 *   },
 *   rateLimit: {
 *     maxPerSecond: 100,
 *     maxQueueDepth: 10000
 *   }
 * })
 *
 * // Server mode (in-process SMTP)
 * new SMTPPlugin({
 *   mode: 'server',
 *   port: 25,
 *   host: '0.0.0.0',
 *   requireAuth: false
 * })
 */
export class SMTPPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    const {
      mode = 'relay', // 'relay' or 'server'
      // New driver/config pattern
      driver = null, // 'sendgrid', 'aws-ses', 'mailgun', 'postmark', 'smtp', etc.
      config = {}, // Driver-specific configuration
      relays = null, // Array of relay configs for multi-relay mode
      relayStrategy = 'failover', // 'failover', 'round-robin', 'domain-based'
      from = null, // Sender email (required for relay mode)
      // Legacy host/port/auth pattern (backward compatibility)
      host = null,
      port = null,
      secure = false,
      auth = {},
      // Common options
      emailResource = 'emails',
      retryPolicy = {},
      rateLimit = {},
      templateEngine = 'handlebars', // 'handlebars' or 'custom'
      templateDir = null,
      maxAttachmentSize = 25 * 1024 * 1024, // 25MB
      maxEmailSize = 25 * 1024 * 1024, // 25MB
      webhookSecret = null,
      webhookPath = '/webhooks/email-events',
      ...rest
    } = this.options;

    this.mode = mode;
    this.from = from;
    this.emailResource = emailResource;

    // Support both new (driver/config) and legacy (host/port/auth) patterns
    this.useDriverPattern = Boolean(driver);
    this.driver = driver;
    this.config = config;
    this.relays = relays;
    this.relayStrategy = relayStrategy;

    // Legacy pattern support
    this.host = host;
    this.port = port;
    this.secure = secure;
    this.auth = auth;
    this.templateEngine = templateEngine;
    this.templateDir = templateDir;
    this.maxAttachmentSize = maxAttachmentSize;
    this.maxEmailSize = maxEmailSize;
    this.webhookSecret = webhookSecret;
    this.webhookPath = webhookPath;

    // Retry policy with defaults
    this.retryPolicy = {
      maxAttempts: 5,
      initialDelay: 1000, // 1 second
      maxDelay: 60000, // 60 seconds
      multiplier: 2, // exponential
      jitter: 0.1, // ±10%
      ...retryPolicy
    };

    // Rate limiting with defaults
    this.rateLimit = {
      maxPerSecond: 100,
      maxQueueDepth: 10000,
      ...rateLimit
    };

    // Connection manager (lazy-init in initialize())
    this.connectionManager = null;

    // Template engine
    this.templateEngine = new SMTPTemplateEngine({
      type: templateEngine,
      templateDir: templateDir,
      cacheTemplates: true,
      helpers: defaultHandlebarsHelpers
    });

    // Webhook receiver for bounce/complaint/delivery notifications
    this.webhookReceiver = new WebhookReceiver({
      provider: options.webhookProvider || 'sendgrid',
      webhookSecret: options.webhookSecret || null,
      maxEventLogSize: options.webhookMaxEventLogSize || 1000
    });

    // Email queue (pending retries)
    this._emailQueue = new Map();
    this._queuedCount = 0;

    // Rate limit tracking
    this._rateLimitTokens = this.rateLimit.maxPerSecond;
    this._lastRateLimitRefill = Date.now();
    this._rateLimitCarry = 0;

    // Database reference (set by database on plugin install)
    this.database = null;

    // Lifecycle hooks
    this.hooks = new Map();
  }

  /**
   * Initialize plugin - set up connection and resources
   * Called by database when plugin is installed
   */
  async initialize() {
    try {
      // Create email resource if not exists
      await this._ensureEmailResource();

      // Initialize based on mode and pattern
      if (this.mode === 'relay') {
        if (this.useDriverPattern) {
          await this._initializeDriverMode();
        } else {
          await this._initializeLegacyMode();
        }
      } else if (this.mode === 'server') {
        await this._initializeServerMode();
      }

      // Emit initialize event
      this.emit('initialize', { mode: this.mode });
    } catch (err) {
      this.emit('error', { event: 'initialize', error: err });
      throw err;
    }
  }

  /**
   * Initialize using new driver/config pattern
   * @private
   */
  async _initializeDriverMode() {
    // Support multi-relay if configured
    if (this.relays && Array.isArray(this.relays) && this.relays.length > 0) {
      this.multiRelayManager = new MultiRelayManager({
        strategy: this.relayStrategy
      });
      await this.multiRelayManager.initialize(this.relays);
    } else if (this.driver) {
      // Single relay with driver pattern
      this.relayDriver = await createDriver(this.driver, this.config, {
        from: this.from,
        emailResource: this.emailResource
      });
    } else {
      throw new Error('Driver mode requires either "driver" or "relays" option');
    }
  }

  /**
   * Initialize using legacy host/port/auth pattern
   * @private
   */
  async _initializeLegacyMode() {
    this.connectionManager = new SMTPConnectionManager({
      mode: this.mode,
      host: this.host,
      port: this.port,
      secure: this.secure,
      auth: this.auth,
      requireAuth: this.options.requireAuth || false,
      ...this.options
    });

    await this.connectionManager.initialize();
  }

  /**
   * Initialize server mode
   * @private
   */
  async _initializeServerMode() {
    this.connectionManager = new SMTPConnectionManager({
      mode: 'server',
      port: this.options.serverPort || 25,
      host: this.options.serverHost || '0.0.0.0',
      requireAuth: this.options.requireAuth || false,
      ...this.options
    });

    await this.connectionManager.initialize();
  }

  /**
   * Ensure email resource exists in database
   * @private
   */
  async _ensureEmailResource() {
    if (!this.database) {
      throw new Error('Database not set on plugin. Make sure plugin is installed via db.installPlugin()');
    }

    try {
      // Try to get existing resource
      const resource = await this.database.getResource(this.emailResource);
      if (resource) return resource;
    } catch (err) {
      // Resource doesn't exist, create it
    }

    // Create new email resource
    return await this.database.createResource({
      name: this.emailResource,
      behavior: 'body-overflow', // Large email bodies overflow to S3 object body
      timestamps: true,
      attributes: {
        from: 'string|required',
        to: 'array|required|items:string',
        cc: 'array',
        bcc: 'array',
        subject: 'string|required',
        body: 'string|required',
        html: 'string',
        template: 'string', // template name if rendered from template
        templateData: 'object', // template variables
        attachments: 'array', // [{ filename, size, contentType }]
        status: 'string|enum:pending,sent,failed,bounced,complained|required', // delivery status
        errorCode: 'string', // SMTP error code if failed
        errorMessage: 'string', // SMTP error message
        attempts: 'number|min:0', // number of delivery attempts
        maxAttempts: 'number|min:1', // max retries
        nextRetryAt: 'number', // next retry timestamp (ms)
        sentAt: 'number', // when successfully sent
        failedAt: 'number', // when permanently failed
        bounceType: 'string|enum:hard,soft', // bounce classification
        complaintType: 'string|enum:abuse,fraud,general,not-spam', // complaint reason
        messageId: 'string', // SMTP message ID
        metadata: 'object' // custom metadata
      },
      partitions: {
        byStatus: {
          fields: { status: 'string' }
        },
        byCreatedAtCohort: {
          fields: { createdAtCohort: 'string' }, // e.g., '2024-01-15'
          compute: (doc) => {
            const date = new Date(doc.createdAt || Date.now());
            return {
              createdAtCohort: date.toISOString().split('T')[0]
            };
          }
        }
      }
    });
  }

  /**
   * Send email via SMTP
   *
   * @param {Object} options Email options
   * @param {string} options.from Sender email address
   * @param {string|string[]} options.to Recipient(s)
   * @param {string|string[]} options.cc CC recipient(s)
   * @param {string|string[]} options.bcc BCC recipient(s)
   * @param {string} options.subject Email subject
   * @param {string} options.body Plain text body
   * @param {string} options.html HTML body
   * @param {Object} options.template Template options (name + data)
   * @param {Array} options.attachments Attachments
   * @param {Object} options.metadata Custom metadata
   * @returns {Promise<Object>} Email record ID
   */
  async sendEmail(options = {}) {
    try {
      // Validate input
      this._validateEmailOptions(options);

      // Check rate limit
      await this._checkRateLimit();

      // Process template if provided
      let { body, html } = options;
      const { template, templateData } = options;
      if (template) {
        ({ body, html } = await this._renderTemplate(template, templateData));
      }

      // Validate attachments
      if (options.attachments) {
        this._validateAttachments(options.attachments);
      }

      // Normalize recipients
      const to = Array.isArray(options.to) ? options.to : [options.to];
      const cc = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : [];
      const bcc = options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : [];

      // Create email record
      const emailRecord = await this._createEmailRecord({
        from: options.from,
        to,
        cc,
        bcc,
        subject: options.subject,
        body,
        html,
        template,
        templateData,
        attachments: options.attachments || [],
        metadata: options.metadata || {}
      });

      // Attempt delivery via appropriate driver
      let result;
      try {
        if (this.multiRelayManager) {
          // Multi-relay mode
          result = await this.multiRelayManager.sendEmail({
            from: options.from,
            to: to,
            cc: cc,
            bcc: bcc,
            subject: options.subject,
            body,
            html,
            attachments: options.attachments || []
          });
        } else if (this.relayDriver) {
          // Single driver mode
          result = await this.relayDriver.sendEmail({
            from: options.from,
            to: to,
            cc: cc,
            bcc: bcc,
            subject: options.subject,
            body,
            html,
            attachments: options.attachments || []
          });
        } else {
          // Legacy connection manager mode
          result = await this.connectionManager.sendEmail({
            from: options.from,
            to: to.join(','),
            cc: cc.length ? cc.join(',') : undefined,
            bcc: bcc.length ? bcc.join(',') : undefined,
            subject: options.subject,
            text: body,
            html,
            attachments: options.attachments || []
          });
        }

        // Update email record as sent
        await this._updateEmailStatus(emailRecord.id, 'sent', {
          messageId: result.messageId,
          sentAt: Date.now(),
          relayUsed: result.relayUsed || null
        });

        // Emit send event
        this.emit('email:sent', { emailId: emailRecord.id, messageId: result.messageId });
      } catch (err) {
        // Handle send error
        await this._handleSendError(emailRecord.id, err);
        throw err;
      }

      return emailRecord;
    } catch (err) {
      this.emit('error', { event: 'sendEmail', error: err });
      throw err;
    }
  }

  /**
   * Validate email options
   * @private
   */
  _validateEmailOptions(options) {
    if (!options.from) {
      throw new RecipientError('Email "from" address is required', {
        suggestion: 'Provide a valid sender email address'
      });
    }

    if (!options.to) {
      throw new RecipientError('Email "to" recipient(s) required', {
        suggestion: 'Provide at least one recipient email address'
      });
    }

    if (!options.subject) {
      throw new SMTPError('Email "subject" is required', {
        suggestion: 'Provide a subject line for the email'
      });
    }

    if (!options.body && !options.html && !options.template) {
      throw new SMTPError('Email body, html, or template is required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validateEmail = (email) => {
      if (!emailRegex.test(email)) {
        throw new RecipientError(`Invalid email format: ${email}`);
      }
    };

    validateEmail(options.from);
    const toList = Array.isArray(options.to) ? options.to : [options.to];
    toList.forEach(validateEmail);
  }

  /**
   * Validate attachments
   * @private
   */
  _validateAttachments(attachments) {
    if (!Array.isArray(attachments)) {
      throw new AttachmentError('Attachments must be an array');
    }

    for (const att of attachments) {
      if (!att.filename) {
        throw new AttachmentError('Attachment missing "filename"');
      }

      const size = att.content ? Buffer.byteLength(att.content) : att.size || 0;
      if (size > this.maxAttachmentSize) {
        throw new AttachmentError(
          `Attachment "${att.filename}" exceeds max size of ${this.maxAttachmentSize / 1024 / 1024}MB`
        );
      }
    }
  }

  /**
   * Render email template using template engine
   * @private
   */
  async _renderTemplate(templateName, templateData = {}) {
    try {
      const result = await this.templateEngine.render(templateName, templateData);
      return {
        subject: result.subject,
        body: result.body,
        html: result.html
      };
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      throw new TemplateError(`Template rendering failed: ${err.message}`, {
        originalError: err,
        template: templateName
      });
    }
  }

  /**
   * Register a custom Handlebars helper
   */
  registerTemplateHelper(name, fn) {
    this.templateEngine.registerHelper(name, fn);
  }

  /**
   * Register a template partial
   */
  registerTemplatePartial(name, template) {
    this.templateEngine.registerPartial(name, template);
  }

  /**
   * Clear template cache
   */
  clearTemplateCache() {
    this.templateEngine.clearCache();
  }

  /**
   * Get template cache stats
   */
  getTemplateCacheStats() {
    return this.templateEngine.getCacheStats();
  }

  /**
   * Process webhook from email provider
   *
   * @param {Object} body - Request body
   * @param {Object} headers - Request headers
   * @returns {Promise<Object>} Webhook processing result
   */
  async processWebhook(body, headers = {}) {
    try {
      const result = await this.webhookReceiver.processWebhook(body, headers);
      this.emit('webhook:processed', result);
      return result;
    } catch (err) {
      this.emit('error', { event: 'webhook', error: err });
      throw err;
    }
  }

  /**
   * Register webhook event handler
   *
   * @param {string} eventType - bounce, complaint, delivery, open, click
   * @param {Function} handler - Async handler function
   */
  onWebhookEvent(eventType, handler) {
    // Wrap handler to auto-update email status
    const wrappedHandler = async (event) => {
      // Auto-update email status based on event
      await this._handleWebhookEvent(event);

      // Call custom handler if provided
      if (handler) {
        return await handler(event);
      }
    };

    this.webhookReceiver.on(eventType, wrappedHandler);
  }

  /**
   * Handle webhook event and update email status
   * @private
   */
  async _handleWebhookEvent(event) {
    try {
      const resource = await this.database.getResource(this.emailResource);

      // Find email by message ID
      let emailId = null;
      try {
        // Try to find by message ID
        const emails = await resource.query({ messageId: event.messageId });
        if (emails.length > 0) {
          emailId = emails[0].id;
        }
      } catch (err) {
        // Message ID might not be indexed, try searching
        const allEmails = await resource.list({ limit: 1000 });
        const found = allEmails.find((e) => e.messageId === event.messageId);
        if (found) {
          emailId = found.id;
        }
      }

      if (!emailId) {
        this.logger.warn(`Email not found for message ID: ${event.messageId}`);
        return;
      }

      // Update status based on event type
      const updates = {
        updatedAt: Date.now()
      };

      if (event.type === 'bounce') {
        updates.status = event.bounceType === 'hard' ? 'failed' : 'pending';
        updates.bounceType = event.bounceType;
        updates.failedAt = Date.now();
        updates.errorMessage = event.reason;
      } else if (event.type === 'complaint') {
        updates.status = 'complained';
        updates.complaintType = event.complaintType;
        updates.errorMessage = event.reason;
        // Auto-unsubscribe on complaint
        updates.metadata = { unsubscribed: true, reason: 'complaint' };
      } else if (event.type === 'delivery') {
        updates.status = 'sent';
        updates.sentAt = Math.floor(event.timestamp * 1000);
      } else if (event.type === 'open') {
        updates.status = 'opened';
        updates.openedAt = Math.floor(event.timestamp * 1000);
        updates.metadata = { userAgent: event.userAgent, ip: event.ip };
      } else if (event.type === 'click') {
        updates.status = 'clicked';
        updates.clickedAt = Math.floor(event.timestamp * 1000);
        updates.metadata = { url: event.url, userAgent: event.userAgent, ip: event.ip };
      }

      // Update email record
      await resource.update(emailId, updates);

      this.emit('email:statusUpdated', {
        emailId,
        status: updates.status,
        eventType: event.type,
        timestamp: Date.now()
      });
    } catch (err) {
      this.logger.error(`Error handling webhook event: ${err.message}`);
    }
  }

  /**
   * Get webhook event log
   */
  getWebhookEventLog(limit = 100) {
    return this.webhookReceiver.getEventLog(limit);
  }

  /**
   * Clear webhook event log
   */
  clearWebhookEventLog() {
    this.webhookReceiver.clearEventLog();
  }

  /**
   * Get webhook handler count
   */
  getWebhookHandlerCount() {
    return this.webhookReceiver.getHandlerCount();
  }

  /**
   * Check rate limit and consume token
   * @private
   */
  async _checkRateLimit() {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = (now - this._lastRateLimitRefill) / 1000;
    const tokensToAdd = elapsed * this.rateLimit.maxPerSecond;

    if (tokensToAdd > 0) {
      const accumulated = this._rateLimitCarry + tokensToAdd;
      const wholeTokens = Math.floor(accumulated);
      this._rateLimitCarry = accumulated - wholeTokens;

      if (wholeTokens > 0) {
        this._rateLimitTokens = Math.min(
          this.rateLimit.maxPerSecond,
          this._rateLimitTokens + wholeTokens
        );
      }
      this._lastRateLimitRefill = now;
    }

    // Check if token available
    if (this._rateLimitTokens < 1) {
      throw new RateLimitError('Rate limit exceeded. Please retry later.', {
        currentQueue: this._queuedCount,
        maxQueue: this.rateLimit.maxQueueDepth
      });
    }

    // Consume token
    this._rateLimitTokens -= 1;
  }

  /**
   * Create email record in database
   * @private
   */
  async _createEmailRecord(emailData) {
    const resource = await this.database.getResource(this.emailResource);

    return await resource.insert({
      ...emailData,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.retryPolicy.maxAttempts,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  /**
   * Update email delivery status
   * @private
   */
  async _updateEmailStatus(emailId, status, updates = {}) {
    const resource = await this.database.getResource(this.emailResource);

    return await resource.update(emailId, {
      status,
      updatedAt: Date.now(),
      ...updates
    });
  }

  /**
   * Handle send error - classify and schedule retry
   * @private
   */
  async _handleSendError(emailId, err) {
    const isRetryable = err.retriable !== false;
    const status = isRetryable ? 'pending' : 'failed';

    const updates = {
      status,
      errorCode: err.name,
      errorMessage: err.message,
      attempts: (await this.database.getResource(this.emailResource)).then(r => r.get(emailId)).then(e => e.attempts + 1)
    };

    if (isRetryable && updates.attempts < this.retryPolicy.maxAttempts) {
      // Schedule next retry
      const delay = this._calculateBackoff(updates.attempts);
      updates.nextRetryAt = Date.now() + delay;
    } else if (isRetryable && updates.attempts >= this.retryPolicy.maxAttempts) {
      updates.status = 'failed';
      updates.failedAt = Date.now();
    } else {
      updates.status = 'failed';
      updates.failedAt = Date.now();
    }

    await this._updateEmailStatus(emailId, updates.status, updates);
  }

  /**
   * Calculate exponential backoff with jitter
   * @private
   */
  _calculateBackoff(attemptNumber) {
    const { initialDelay, maxDelay, multiplier, jitter } = this.retryPolicy;

    const exponentialDelay = initialDelay * Math.pow(multiplier, attemptNumber);
    const capped = Math.min(exponentialDelay, maxDelay);
    const jitterAmount = capped * (Math.random() * 2 * jitter - jitter);

    return Math.max(initialDelay, capped + jitterAmount);
  }

  /**
   * Close plugin and clean up resources
   */
  async close() {
    if (this.connectionManager) {
      await this.connectionManager.close();
    }
    this.emit('close');
  }

  /**
   * Get plugin status
   */
  getStatus() {
    const status = {
      name: this.constructor.name || 'SMTPPlugin',
      mode: this.mode,
      queuedEmails: this._queuedCount,
      rateLimitTokens: Math.floor(this._rateLimitTokens)
    };

    // Add driver-specific status
    if (this.multiRelayManager) {
      status.configType = 'multi-relay';
      status.relayStatus = this.multiRelayManager.getStatus();
    } else if (this.relayDriver) {
      status.configType = 'driver';
      status.driver = this.relayDriver.name;
      status.driverInfo = this.relayDriver.getInfo();
    } else if (this.connectionManager) {
      status.configType = 'legacy';
      status.connected = this.connectionManager._isConnected;
    }

    return status;
  }

  /**
   * Get available drivers
   */
  static getAvailableDrivers() {
    return getAvailableDrivers();
  }
}
