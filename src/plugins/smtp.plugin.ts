import { Plugin } from './plugin.class.js';
import { SMTPConnectionManager } from './smtp/connection-manager.js';
import { SMTPTemplateEngine, type CustomTemplateFunction } from './smtp/template-engine.js';
import { WebhookReceiver, type WebhookProvider as InternalWebhookProvider } from './smtp/webhook-receiver.js';
import { createDriver, getAvailableDrivers, MultiRelayManager } from './smtp/drivers/index.js';
import {
  SMTPError,
  TemplateError,
  RateLimitError,
  RecipientError,
  AttachmentError
} from './smtp/errors.js';

import type { Database } from '../database.class.js';
import type { Resource } from '../resource.class.js';
import type {
  SMTPAuth,
  RetryPolicy,
  RateLimitConfig,
  RelayConfig,
  RelayStrategy,
  TemplateEngineType,
  WebhookProvider,
  BounceType,
  ComplaintType,
  WebhookEvent,
  WebhookProcessResult,
  PluginStatus,
  SMTPDriverInstance,
  MultiRelayManagerInstance,
  SMTPConnectionManagerInstance,
  SMTPTemplateEngineInstance,
  WebhookReceiverInstance
} from './smtp/types.internal.js';

export type SMTPMode = 'relay' | 'server';
export type SMTPDriver = 'sendgrid' | 'aws-ses' | 'mailgun' | 'postmark' | 'smtp' | string;
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'bounced' | 'complained' | 'opened' | 'clicked';

export interface SMTPPluginOptions {
  mode?: SMTPMode;
  driver?: SMTPDriver | null;
  config?: Record<string, unknown>;
  relays?: RelayConfig[] | null;
  relayStrategy?: RelayStrategy;
  from?: string | null;
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  auth?: SMTPAuth;
  emailResource?: string;
  retryPolicy?: Partial<RetryPolicy>;
  rateLimit?: Partial<RateLimitConfig>;
  templateEngine?: TemplateEngineType;
  templateDir?: string | null;
  maxAttachmentSize?: number;
  maxEmailSize?: number;
  webhookSecret?: string | null;
  webhookPath?: string;
  webhookProvider?: WebhookProvider;
  webhookMaxEventLogSize?: number;
  requireAuth?: boolean;
  serverPort?: number;
  serverHost?: string;
  [key: string]: unknown;
}

export interface EmailAttachment {
  filename: string;
  content?: string | Buffer;
  size?: number;
  contentType?: string;
  path?: string;
  cid?: string;
}

export interface SendEmailOptions {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body?: string;
  html?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  attachments?: EmailAttachment[];
  metadata?: Record<string, unknown>;
}

export interface EmailRecord {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  html?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  attachments: EmailAttachment[];
  status: EmailStatus;
  errorCode?: string;
  errorMessage?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: number;
  sentAt?: number;
  failedAt?: number;
  bounceType?: BounceType;
  complaintType?: ComplaintType;
  messageId?: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SendResult {
  messageId?: string;
  relayUsed?: string | null;
}

export class SMTPPlugin extends Plugin {

  mode: SMTPMode;
  from: string | null;
  emailResource: string;
  useDriverPattern: boolean;
  driver: SMTPDriver | null;
  config: Record<string, unknown>;
  relays: RelayConfig[] | null;
  relayStrategy: RelayStrategy;
  host: string | null;
  port: number | null;
  secure: boolean;
  auth: SMTPAuth;
  templateDir: string | null;
  maxAttachmentSize: number;
  maxEmailSize: number;
  webhookSecret: string | null;
  webhookPath: string;
  retryPolicy: RetryPolicy;
  rateLimit: RateLimitConfig;
  connectionManager: SMTPConnectionManagerInstance | null;
  templateEngine: SMTPTemplateEngineInstance;
  webhookReceiver: WebhookReceiverInstance;
  multiRelayManager?: MultiRelayManagerInstance;
  relayDriver?: SMTPDriverInstance;
  smtpHooks: Map<string, Function[]>;

  private _emailQueue: Map<string, unknown>;
  private _queuedCount: number;
  private _rateLimitTokens: number;
  private _lastRateLimitRefill: number;
  private _rateLimitCarry: number;

  constructor(options: SMTPPluginOptions = {}) {
    super(options);

    const smtpOptions = this.options as SMTPPluginOptions;
    const {
      mode = 'relay',
      driver = null,
      config = {},
      relays = null,
      relayStrategy = 'failover',
      from = null,
      host = null,
      port = null,
      secure = false,
      auth = {},
      emailResource = 'emails',
      retryPolicy = {},
      rateLimit = {},
      templateEngine = 'handlebars',
      templateDir = null,
      maxAttachmentSize = 25 * 1024 * 1024,
      maxEmailSize = 25 * 1024 * 1024,
      webhookSecret = null,
      webhookPath = '/webhooks/email-events',
      ...rest
    } = smtpOptions;

    this.mode = mode;
    this.from = from;
    this.emailResource = emailResource;

    this.useDriverPattern = Boolean(driver);
    this.driver = driver;
    this.config = config;
    this.relays = relays;
    this.relayStrategy = relayStrategy;

    this.host = host;
    this.port = port;
    this.secure = secure;
    this.auth = auth;
    this.templateDir = templateDir;
    this.maxAttachmentSize = maxAttachmentSize;
    this.maxEmailSize = maxEmailSize;
    this.webhookSecret = webhookSecret;
    this.webhookPath = webhookPath;

    this.retryPolicy = {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 60000,
      multiplier: 2,
      jitter: 0.1,
      ...retryPolicy
    };

    this.rateLimit = {
      maxPerSecond: 100,
      maxQueueDepth: 10000,
      ...rateLimit
    };

    this.connectionManager = null;

    this.templateEngine = new SMTPTemplateEngine({
      type: templateEngine as 'recker' | CustomTemplateFunction | undefined,
      templateDir: templateDir ?? undefined,
      cacheTemplates: true
    }) as unknown as SMTPTemplateEngineInstance;

    this.webhookReceiver = new WebhookReceiver({
      provider: (options.webhookProvider || 'sendgrid') as InternalWebhookProvider,
      webhookSecret: options.webhookSecret || null,
      maxEventLogSize: options.webhookMaxEventLogSize || 1000
    }) as unknown as WebhookReceiverInstance;

    this._emailQueue = new Map();
    this._queuedCount = 0;

    this._rateLimitTokens = this.rateLimit.maxPerSecond;
    this._lastRateLimitRefill = Date.now();
    this._rateLimitCarry = 0;

    this.smtpHooks = new Map();
  }

  async initialize(): Promise<void> {
    try {
      await this._ensureEmailResource();

      if (this.mode === 'relay') {
        if (this.useDriverPattern) {
          await this._initializeDriverMode();
        } else {
          await this._initializeLegacyMode();
        }
      } else if (this.mode === 'server') {
        await this._initializeServerMode();
      }

      this.emit('initialize', { mode: this.mode });
    } catch (err) {
      this.emit('error', { event: 'initialize', error: err });
      throw err;
    }
  }

  private async _initializeDriverMode(): Promise<void> {
    if (this.relays && Array.isArray(this.relays) && this.relays.length > 0) {
      this.multiRelayManager = new MultiRelayManager({
        strategy: this.relayStrategy
      }) as unknown as MultiRelayManagerInstance;
      await this.multiRelayManager.initialize(this.relays);
    } else if (this.driver) {
      this.relayDriver = await createDriver(this.driver, this.config, {
        from: this.from,
        emailResource: this.emailResource
      }) as unknown as SMTPDriverInstance;
    } else {
      throw new Error('Driver mode requires either "driver" or "relays" option');
    }
  }

  private async _initializeLegacyMode(): Promise<void> {
    const smtpOptions = this.options as SMTPPluginOptions;
    this.connectionManager = new SMTPConnectionManager({
      mode: this.mode,
      host: this.host === null ? undefined : this.host,
      port: this.port === null ? undefined : this.port,
      secure: this.secure,
      auth: this.auth,
      requireAuth: smtpOptions.requireAuth ?? false
    }) as unknown as SMTPConnectionManagerInstance;

    await this.connectionManager.initialize();
  }

  private async _initializeServerMode(): Promise<void> {
    const smtpOptions = this.options as SMTPPluginOptions;
    this.connectionManager = new SMTPConnectionManager({
      mode: 'server',
      port: smtpOptions.serverPort ?? 25,
      host: smtpOptions.serverHost ?? '0.0.0.0',
      requireAuth: smtpOptions.requireAuth ?? false
    }) as unknown as SMTPConnectionManagerInstance;

    await this.connectionManager.initialize();
  }

  private async _ensureEmailResource(): Promise<Resource> {
    if (!this.database) {
      throw new Error('Database not set on plugin. Make sure plugin is installed via db.installPlugin()');
    }

    try {
      const resource = await (this.database as unknown as { getResource: (name: string) => Promise<Resource | null> }).getResource(this.emailResource);
      if (resource) return resource;
    } catch {
      // Resource doesn't exist, create it
    }

    return await this.database.createResource({
      name: this.emailResource,
      behavior: 'body-overflow',
      timestamps: true,
      attributes: {
        from: 'string|required',
        to: 'array|required|items:string',
        cc: 'array',
        bcc: 'array',
        subject: 'string|required',
        body: 'string|required',
        html: 'string',
        template: 'string',
        templateData: 'object',
        attachments: 'array',
        status: 'string|enum:pending,sent,failed,bounced,complained|required',
        errorCode: 'string',
        errorMessage: 'string',
        attempts: 'number|min:0',
        maxAttempts: 'number|min:1',
        nextRetryAt: 'number',
        sentAt: 'number',
        failedAt: 'number',
        bounceType: 'string|enum:hard,soft',
        complaintType: 'string|enum:abuse,fraud,general,not-spam',
        messageId: 'string',
        metadata: 'object'
      },
      partitions: {
        byStatus: {
          fields: { status: 'string' }
        },
        byCreatedAtCohort: {
          fields: { createdAtCohort: 'string' }
        }
      }
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailRecord> {
    try {
      this._validateEmailOptions(options);

      await this._checkRateLimit();

      let body = options.body;
      let html = options.html;
      const { template, templateData } = options;
      if (template) {
        const rendered = await this._renderTemplate(template, templateData || {});
        body = rendered.body;
        html = rendered.html;
      }

      if (options.attachments) {
        this._validateAttachments(options.attachments);
      }

      const to = Array.isArray(options.to) ? options.to : [options.to];
      const cc = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : [];
      const bcc = options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : [];

      const emailRecord = await this._createEmailRecord({
        from: options.from,
        to,
        cc,
        bcc,
        subject: options.subject,
        body: body || '',
        html,
        template,
        templateData,
        attachments: options.attachments || [],
        metadata: options.metadata || {}
      });

      let result: SendResult;
      try {
        if (this.multiRelayManager) {
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
          result = await this.connectionManager!.sendEmail({
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

        await this._updateEmailStatus(emailRecord.id, 'sent', {
          messageId: result.messageId,
          sentAt: Date.now(),
          relayUsed: result.relayUsed || null
        });

        this.emit('email:sent', { emailId: emailRecord.id, messageId: result.messageId });
      } catch (err) {
        await this._handleSendError(emailRecord.id, err as Error);
        throw err;
      }

      return emailRecord;
    } catch (err) {
      this.emit('error', { event: 'sendEmail', error: err });
      throw err;
    }
  }

  private _validateEmailOptions(options: SendEmailOptions): void {
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validateEmail = (email: string): void => {
      if (!emailRegex.test(email)) {
        throw new RecipientError(`Invalid email format: ${email}`);
      }
    };

    validateEmail(options.from);
    const toList = Array.isArray(options.to) ? options.to : [options.to];
    toList.forEach(validateEmail);
  }

  private _validateAttachments(attachments: EmailAttachment[]): void {
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

  private async _renderTemplate(templateName: string, templateData: Record<string, unknown> = {}): Promise<{ subject?: string; body?: string; html?: string }> {
    try {
      const result = await this.templateEngine.render(templateName, templateData);
      return {
        subject: result.subject,
        body: result.body,
        html: result.html
      };
    } catch (err) {
      if (err instanceof TemplateError) throw err;
      throw new TemplateError(`Template rendering failed: ${(err as Error).message}`, {
        originalError: err instanceof Error ? err : null,
        template: templateName
      });
    }
  }

  registerTemplateHelper(name: string, fn: Function): void {
    this.templateEngine.registerHelper(name, fn);
  }

  registerTemplatePartial(name: string, template: string): void {
    this.templateEngine.registerPartial(name, template);
  }

  clearTemplateCache(): void {
    this.templateEngine.clearCache();
  }

  getTemplateCacheStats(): unknown {
    return this.templateEngine.getCacheStats();
  }

  async processWebhook(body: unknown, headers: Record<string, string> = {}): Promise<WebhookProcessResult> {
    try {
      const result = await this.webhookReceiver.processWebhook(body, headers);
      this.emit('webhook:processed', result);
      return result;
    } catch (err) {
      this.emit('error', { event: 'webhook', error: err });
      throw err;
    }
  }

  onWebhookEvent(eventType: string, handler?: (event: WebhookEvent) => Promise<void>): void {
    const wrappedHandler = async (event: WebhookEvent): Promise<void> => {
      await this._handleWebhookEvent(event);

      if (handler) {
        await handler(event);
      }
    };

    this.webhookReceiver.on(eventType, wrappedHandler);
  }

  private async _handleWebhookEvent(event: WebhookEvent): Promise<void> {
    try {
      const resource = await (this.database as unknown as { getResource: (name: string) => Promise<Resource> }).getResource(this.emailResource);

      let emailId: string | null = null;
      try {
        const emails = await (resource as unknown as { query: (q: Record<string, unknown>) => Promise<Array<{ id: string }>> }).query({ messageId: event.messageId });
        if (emails.length > 0) {
          emailId = emails[0]!.id;
        }
      } catch {
        const allEmails = await resource.list({ limit: 1000 }) as Array<{ id: string; messageId?: string }>;
        const found = allEmails.find((e) => e.messageId === event.messageId);
        if (found) {
          emailId = found.id;
        }
      }

      if (!emailId) {
        this.logger.warn(`Email not found for message ID: ${event.messageId}`);
        return;
      }

      const updates: Record<string, unknown> = {
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

      await resource.update(emailId, updates);

      this.emit('email:statusUpdated', {
        emailId,
        status: updates.status,
        eventType: event.type,
        timestamp: Date.now()
      });
    } catch (err) {
      this.logger.error(`Error handling webhook event: ${(err as Error).message}`);
    }
  }

  getWebhookEventLog(limit: number = 100): unknown[] {
    return this.webhookReceiver.getEventLog(limit);
  }

  clearWebhookEventLog(): void {
    this.webhookReceiver.clearEventLog();
  }

  getWebhookHandlerCount(): number {
    return this.webhookReceiver.getHandlerCount();
  }

  private async _checkRateLimit(): Promise<void> {
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

    if (this._rateLimitTokens < 1) {
      throw new RateLimitError('Rate limit exceeded. Please retry later.', {
        currentQueue: this._queuedCount,
        maxQueue: this.rateLimit.maxQueueDepth
      });
    }

    this._rateLimitTokens -= 1;
  }

  private async _createEmailRecord(emailData: {
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    html?: string;
    template?: string;
    templateData?: Record<string, unknown>;
    attachments: EmailAttachment[];
    metadata: Record<string, unknown>;
  }): Promise<EmailRecord> {
    const resource = await (this.database as unknown as { getResource: (name: string) => Promise<Resource> }).getResource(this.emailResource);

    return await resource.insert({
      ...emailData,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.retryPolicy.maxAttempts,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }) as unknown as EmailRecord;
  }

  private async _updateEmailStatus(emailId: string, status: EmailStatus, updates: Record<string, unknown> = {}): Promise<unknown> {
    const resource = await (this.database as unknown as { getResource: (name: string) => Promise<Resource> }).getResource(this.emailResource);

    return await resource.update(emailId, {
      status,
      updatedAt: Date.now(),
      ...updates
    });
  }

  private async _handleSendError(emailId: string, err: Error & { retriable?: boolean }): Promise<void> {
    const isRetryable = err.retriable !== false;
    const status: EmailStatus = isRetryable ? 'pending' : 'failed';

    const resource = await (this.database as unknown as { getResource: (name: string) => Promise<Resource> }).getResource(this.emailResource);
    const email = await resource.get(emailId) as unknown as { attempts: number };

    const updates: Record<string, unknown> = {
      status,
      errorCode: err.name,
      errorMessage: err.message,
      attempts: email.attempts + 1
    };

    if (isRetryable && (updates.attempts as number) < this.retryPolicy.maxAttempts) {
      const delay = this._calculateBackoff(updates.attempts as number);
      updates.nextRetryAt = Date.now() + delay;
    } else if (isRetryable && (updates.attempts as number) >= this.retryPolicy.maxAttempts) {
      updates.status = 'failed';
      updates.failedAt = Date.now();
    } else {
      updates.status = 'failed';
      updates.failedAt = Date.now();
    }

    await this._updateEmailStatus(emailId, updates.status as EmailStatus, updates);
  }

  private _calculateBackoff(attemptNumber: number): number {
    const { initialDelay, maxDelay, multiplier, jitter } = this.retryPolicy;

    const exponentialDelay = initialDelay * Math.pow(multiplier, attemptNumber);
    const capped = Math.min(exponentialDelay, maxDelay);
    const jitterAmount = capped * (Math.random() * 2 * jitter - jitter);

    return Math.max(initialDelay, capped + jitterAmount);
  }

  async close(): Promise<void> {
    if (this.connectionManager) {
      await this.connectionManager.close();
    }
    this.emit('close');
  }

  getStatus(): PluginStatus {
    const status: PluginStatus = {
      name: this.constructor.name || 'SMTPPlugin',
      mode: this.mode,
      queuedEmails: this._queuedCount,
      rateLimitTokens: Math.floor(this._rateLimitTokens)
    };

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

  static getAvailableDrivers(): string[] {
    return getAvailableDrivers();
  }
}
