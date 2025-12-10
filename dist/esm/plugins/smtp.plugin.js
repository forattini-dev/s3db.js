import { Plugin } from './plugin.class.js';
import { SMTPConnectionManager } from './smtp/connection-manager.js';
import { SMTPTemplateEngine, defaultHandlebarsHelpers } from './smtp/template-engine.js';
import { WebhookReceiver } from './smtp/webhook-receiver.js';
import { createDriver, getAvailableDrivers, MultiRelayManager } from './smtp/drivers/index.js';
import { SMTPError, TemplateError, RateLimitError, RecipientError, AttachmentError } from './smtp/errors.js';
export class SMTPPlugin extends Plugin {
    mode;
    from;
    emailResource;
    useDriverPattern;
    driver;
    config;
    relays;
    relayStrategy;
    host;
    port;
    secure;
    auth;
    templateDir;
    maxAttachmentSize;
    maxEmailSize;
    webhookSecret;
    webhookPath;
    retryPolicy;
    rateLimit;
    connectionManager;
    templateEngine;
    webhookReceiver;
    multiRelayManager;
    relayDriver;
    smtpHooks;
    _emailQueue;
    _queuedCount;
    _rateLimitTokens;
    _lastRateLimitRefill;
    _rateLimitCarry;
    constructor(options = {}) {
        super(options);
        const smtpOptions = this.options;
        const { mode = 'relay', driver = null, config = {}, relays = null, relayStrategy = 'failover', from = null, host = null, port = null, secure = false, auth = {}, emailResource = 'emails', retryPolicy = {}, rateLimit = {}, templateEngine = 'handlebars', templateDir = null, maxAttachmentSize = 25 * 1024 * 1024, maxEmailSize = 25 * 1024 * 1024, webhookSecret = null, webhookPath = '/webhooks/email-events', ...rest } = smtpOptions;
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
            type: templateEngine,
            templateDir: templateDir ?? undefined,
            cacheTemplates: true,
            helpers: defaultHandlebarsHelpers
        });
        this.webhookReceiver = new WebhookReceiver({
            provider: (options.webhookProvider || 'sendgrid'),
            webhookSecret: options.webhookSecret || null,
            maxEventLogSize: options.webhookMaxEventLogSize || 1000
        });
        this._emailQueue = new Map();
        this._queuedCount = 0;
        this._rateLimitTokens = this.rateLimit.maxPerSecond;
        this._lastRateLimitRefill = Date.now();
        this._rateLimitCarry = 0;
        this.smtpHooks = new Map();
    }
    async initialize() {
        try {
            await this._ensureEmailResource();
            if (this.mode === 'relay') {
                if (this.useDriverPattern) {
                    await this._initializeDriverMode();
                }
                else {
                    await this._initializeLegacyMode();
                }
            }
            else if (this.mode === 'server') {
                await this._initializeServerMode();
            }
            this.emit('initialize', { mode: this.mode });
        }
        catch (err) {
            this.emit('error', { event: 'initialize', error: err });
            throw err;
        }
    }
    async _initializeDriverMode() {
        if (this.relays && Array.isArray(this.relays) && this.relays.length > 0) {
            this.multiRelayManager = new MultiRelayManager({
                strategy: this.relayStrategy
            });
            await this.multiRelayManager.initialize(this.relays);
        }
        else if (this.driver) {
            this.relayDriver = await createDriver(this.driver, this.config, {
                from: this.from,
                emailResource: this.emailResource
            });
        }
        else {
            throw new Error('Driver mode requires either "driver" or "relays" option');
        }
    }
    async _initializeLegacyMode() {
        const smtpOptions = this.options;
        this.connectionManager = new SMTPConnectionManager({
            mode: this.mode,
            host: this.host === null ? undefined : this.host,
            port: this.port === null ? undefined : this.port,
            secure: this.secure,
            auth: this.auth,
            requireAuth: smtpOptions.requireAuth ?? false
        });
        await this.connectionManager.initialize();
    }
    async _initializeServerMode() {
        const smtpOptions = this.options;
        this.connectionManager = new SMTPConnectionManager({
            mode: 'server',
            port: smtpOptions.serverPort ?? 25,
            host: smtpOptions.serverHost ?? '0.0.0.0',
            requireAuth: smtpOptions.requireAuth ?? false
        });
        await this.connectionManager.initialize();
    }
    async _ensureEmailResource() {
        if (!this.database) {
            throw new Error('Database not set on plugin. Make sure plugin is installed via db.installPlugin()');
        }
        try {
            const resource = await this.database.getResource(this.emailResource);
            if (resource)
                return resource;
        }
        catch {
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
    async sendEmail(options) {
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
            let result;
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
                }
                else if (this.relayDriver) {
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
                }
                else {
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
                await this._updateEmailStatus(emailRecord.id, 'sent', {
                    messageId: result.messageId,
                    sentAt: Date.now(),
                    relayUsed: result.relayUsed || null
                });
                this.emit('email:sent', { emailId: emailRecord.id, messageId: result.messageId });
            }
            catch (err) {
                await this._handleSendError(emailRecord.id, err);
                throw err;
            }
            return emailRecord;
        }
        catch (err) {
            this.emit('error', { event: 'sendEmail', error: err });
            throw err;
        }
    }
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
                throw new AttachmentError(`Attachment "${att.filename}" exceeds max size of ${this.maxAttachmentSize / 1024 / 1024}MB`);
            }
        }
    }
    async _renderTemplate(templateName, templateData = {}) {
        try {
            const result = await this.templateEngine.render(templateName, templateData);
            return {
                subject: result.subject,
                body: result.body,
                html: result.html
            };
        }
        catch (err) {
            if (err instanceof TemplateError)
                throw err;
            throw new TemplateError(`Template rendering failed: ${err.message}`, {
                originalError: err instanceof Error ? err : null,
                template: templateName
            });
        }
    }
    registerTemplateHelper(name, fn) {
        this.templateEngine.registerHelper(name, fn);
    }
    registerTemplatePartial(name, template) {
        this.templateEngine.registerPartial(name, template);
    }
    clearTemplateCache() {
        this.templateEngine.clearCache();
    }
    getTemplateCacheStats() {
        return this.templateEngine.getCacheStats();
    }
    async processWebhook(body, headers = {}) {
        try {
            const result = await this.webhookReceiver.processWebhook(body, headers);
            this.emit('webhook:processed', result);
            return result;
        }
        catch (err) {
            this.emit('error', { event: 'webhook', error: err });
            throw err;
        }
    }
    onWebhookEvent(eventType, handler) {
        const wrappedHandler = async (event) => {
            await this._handleWebhookEvent(event);
            if (handler) {
                await handler(event);
            }
        };
        this.webhookReceiver.on(eventType, wrappedHandler);
    }
    async _handleWebhookEvent(event) {
        try {
            const resource = await this.database.getResource(this.emailResource);
            let emailId = null;
            try {
                const emails = await resource.query({ messageId: event.messageId });
                if (emails.length > 0) {
                    emailId = emails[0].id;
                }
            }
            catch {
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
            const updates = {
                updatedAt: Date.now()
            };
            if (event.type === 'bounce') {
                updates.status = event.bounceType === 'hard' ? 'failed' : 'pending';
                updates.bounceType = event.bounceType;
                updates.failedAt = Date.now();
                updates.errorMessage = event.reason;
            }
            else if (event.type === 'complaint') {
                updates.status = 'complained';
                updates.complaintType = event.complaintType;
                updates.errorMessage = event.reason;
                updates.metadata = { unsubscribed: true, reason: 'complaint' };
            }
            else if (event.type === 'delivery') {
                updates.status = 'sent';
                updates.sentAt = Math.floor(event.timestamp * 1000);
            }
            else if (event.type === 'open') {
                updates.status = 'opened';
                updates.openedAt = Math.floor(event.timestamp * 1000);
                updates.metadata = { userAgent: event.userAgent, ip: event.ip };
            }
            else if (event.type === 'click') {
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
        }
        catch (err) {
            this.logger.error(`Error handling webhook event: ${err.message}`);
        }
    }
    getWebhookEventLog(limit = 100) {
        return this.webhookReceiver.getEventLog(limit);
    }
    clearWebhookEventLog() {
        this.webhookReceiver.clearEventLog();
    }
    getWebhookHandlerCount() {
        return this.webhookReceiver.getHandlerCount();
    }
    async _checkRateLimit() {
        const now = Date.now();
        const elapsed = (now - this._lastRateLimitRefill) / 1000;
        const tokensToAdd = elapsed * this.rateLimit.maxPerSecond;
        if (tokensToAdd > 0) {
            const accumulated = this._rateLimitCarry + tokensToAdd;
            const wholeTokens = Math.floor(accumulated);
            this._rateLimitCarry = accumulated - wholeTokens;
            if (wholeTokens > 0) {
                this._rateLimitTokens = Math.min(this.rateLimit.maxPerSecond, this._rateLimitTokens + wholeTokens);
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
    async _updateEmailStatus(emailId, status, updates = {}) {
        const resource = await this.database.getResource(this.emailResource);
        return await resource.update(emailId, {
            status,
            updatedAt: Date.now(),
            ...updates
        });
    }
    async _handleSendError(emailId, err) {
        const isRetryable = err.retriable !== false;
        const status = isRetryable ? 'pending' : 'failed';
        const resource = await this.database.getResource(this.emailResource);
        const email = await resource.get(emailId);
        const updates = {
            status,
            errorCode: err.name,
            errorMessage: err.message,
            attempts: email.attempts + 1
        };
        if (isRetryable && updates.attempts < this.retryPolicy.maxAttempts) {
            const delay = this._calculateBackoff(updates.attempts);
            updates.nextRetryAt = Date.now() + delay;
        }
        else if (isRetryable && updates.attempts >= this.retryPolicy.maxAttempts) {
            updates.status = 'failed';
            updates.failedAt = Date.now();
        }
        else {
            updates.status = 'failed';
            updates.failedAt = Date.now();
        }
        await this._updateEmailStatus(emailId, updates.status, updates);
    }
    _calculateBackoff(attemptNumber) {
        const { initialDelay, maxDelay, multiplier, jitter } = this.retryPolicy;
        const exponentialDelay = initialDelay * Math.pow(multiplier, attemptNumber);
        const capped = Math.min(exponentialDelay, maxDelay);
        const jitterAmount = capped * (Math.random() * 2 * jitter - jitter);
        return Math.max(initialDelay, capped + jitterAmount);
    }
    async close() {
        if (this.connectionManager) {
            await this.connectionManager.close();
        }
        this.emit('close');
    }
    getStatus() {
        const status = {
            name: this.constructor.name || 'SMTPPlugin',
            mode: this.mode,
            queuedEmails: this._queuedCount,
            rateLimitTokens: Math.floor(this._rateLimitTokens)
        };
        if (this.multiRelayManager) {
            status.configType = 'multi-relay';
            status.relayStatus = this.multiRelayManager.getStatus();
        }
        else if (this.relayDriver) {
            status.configType = 'driver';
            status.driver = this.relayDriver.name;
            status.driverInfo = this.relayDriver.getInfo();
        }
        else if (this.connectionManager) {
            status.configType = 'legacy';
            status.connected = this.connectionManager._isConnected;
        }
        return status;
    }
    static getAvailableDrivers() {
        return getAvailableDrivers();
    }
}
//# sourceMappingURL=smtp.plugin.js.map