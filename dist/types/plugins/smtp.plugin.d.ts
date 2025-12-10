import { Plugin } from './plugin.class.js';
export type SMTPMode = 'relay' | 'server';
export type SMTPDriver = 'sendgrid' | 'aws-ses' | 'mailgun' | 'postmark' | 'smtp' | string;
export type RelayStrategy = 'failover' | 'round-robin' | 'domain-based';
export type TemplateEngineType = 'handlebars' | 'custom';
export type WebhookProvider = 'sendgrid' | 'aws-ses' | 'mailgun' | 'postmark' | string;
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'bounced' | 'complained' | 'opened' | 'clicked';
export type BounceType = 'hard' | 'soft';
export type ComplaintType = 'abuse' | 'fraud' | 'general' | 'not-spam';
export interface SMTPAuth {
    user?: string;
    pass?: string;
}
export interface RetryPolicy {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    multiplier: number;
    jitter: number;
}
export interface RateLimitConfig {
    maxPerSecond: number;
    maxQueueDepth: number;
}
export interface RelayConfig {
    driver: SMTPDriver;
    config: Record<string, unknown>;
    from?: string;
    [key: string]: unknown;
}
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
export interface WebhookEvent {
    type: string;
    messageId: string;
    timestamp: number;
    bounceType?: BounceType;
    complaintType?: ComplaintType;
    reason?: string;
    userAgent?: string;
    ip?: string;
    url?: string;
}
export interface WebhookProcessResult {
    processed: boolean;
    eventType?: string;
    [key: string]: unknown;
}
export interface PluginStatus {
    name: string;
    mode: SMTPMode;
    queuedEmails: number;
    rateLimitTokens: number;
    configType?: 'multi-relay' | 'driver' | 'legacy';
    relayStatus?: unknown;
    driver?: string;
    driverInfo?: unknown;
    connected?: boolean;
}
interface SMTPDriverInstance {
    name: string;
    sendEmail: (options: {
        from: string;
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        body?: string;
        html?: string;
        attachments: EmailAttachment[];
    }) => Promise<SendResult>;
    getInfo: () => unknown;
}
interface MultiRelayManagerInstance {
    initialize: (relays: RelayConfig[]) => Promise<void>;
    sendEmail: (options: {
        from: string;
        to: string[];
        cc: string[];
        bcc: string[];
        subject: string;
        body?: string;
        html?: string;
        attachments: EmailAttachment[];
    }) => Promise<SendResult>;
    getStatus: () => unknown;
}
interface SMTPConnectionManagerInstance {
    initialize: () => Promise<void>;
    sendEmail: (options: {
        from: string;
        to: string;
        cc?: string;
        bcc?: string;
        subject: string;
        text?: string;
        html?: string;
        attachments: EmailAttachment[];
    }) => Promise<SendResult>;
    close: () => Promise<void>;
    _isConnected: boolean;
}
interface SMTPTemplateEngineInstance {
    render: (templateName: string, data: Record<string, unknown>) => Promise<{
        subject?: string;
        body?: string;
        html?: string;
    }>;
    registerHelper: (name: string, fn: Function) => void;
    registerPartial: (name: string, template: string) => void;
    clearCache: () => void;
    getCacheStats: () => unknown;
}
interface WebhookReceiverInstance {
    processWebhook: (body: unknown, headers: Record<string, string>) => Promise<WebhookProcessResult>;
    on: (eventType: string, handler: (event: WebhookEvent) => Promise<void>) => void;
    getEventLog: (limit?: number) => unknown[];
    clearEventLog: () => void;
    getHandlerCount: () => number;
}
export declare class SMTPPlugin extends Plugin {
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
    private _emailQueue;
    private _queuedCount;
    private _rateLimitTokens;
    private _lastRateLimitRefill;
    private _rateLimitCarry;
    constructor(options?: SMTPPluginOptions);
    initialize(): Promise<void>;
    private _initializeDriverMode;
    private _initializeLegacyMode;
    private _initializeServerMode;
    private _ensureEmailResource;
    sendEmail(options: SendEmailOptions): Promise<EmailRecord>;
    private _validateEmailOptions;
    private _validateAttachments;
    private _renderTemplate;
    registerTemplateHelper(name: string, fn: Function): void;
    registerTemplatePartial(name: string, template: string): void;
    clearTemplateCache(): void;
    getTemplateCacheStats(): unknown;
    processWebhook(body: unknown, headers?: Record<string, string>): Promise<WebhookProcessResult>;
    onWebhookEvent(eventType: string, handler?: (event: WebhookEvent) => Promise<void>): void;
    private _handleWebhookEvent;
    getWebhookEventLog(limit?: number): unknown[];
    clearWebhookEventLog(): void;
    getWebhookHandlerCount(): number;
    private _checkRateLimit;
    private _createEmailRecord;
    private _updateEmailStatus;
    private _handleSendError;
    private _calculateBackoff;
    close(): Promise<void>;
    getStatus(): PluginStatus;
    static getAvailableDrivers(): string[];
}
export {};
//# sourceMappingURL=smtp.plugin.d.ts.map