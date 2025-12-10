export type WebhookProvider = 'sendgrid' | 'aws-ses' | 'mailgun' | 'postmark' | 'generic';
export type EventType = 'bounce' | 'complaint' | 'delivery' | 'open' | 'click' | 'dropped' | string;
export type BounceType = 'hard' | 'soft' | 'permanent' | 'temporary';
export type ComplaintType = 'abuse' | 'fraud' | 'general' | 'not-spam';
export interface WebhookReceiverOptions {
    webhookSecret?: string | null;
    provider?: WebhookProvider;
    maxEventLogSize?: number;
}
export interface WebhookHeaders {
    'x-twilio-email-event-webhook-signature'?: string;
    'x-twilio-email-event-webhook-timestamp'?: string;
    'x-mailgun-signature'?: string;
    'x-mailgun-signature-timestamp'?: string;
    'x-mailgun-signature-token'?: string;
    'x-postmark-signature'?: string;
    [key: string]: string | undefined;
}
export interface WebhookEvent {
    provider: WebhookProvider;
    type: EventType;
    messageId?: string;
    recipient?: string;
    timestamp: number;
    bounceType?: BounceType;
    bounceSubType?: string;
    complaintType?: ComplaintType;
    reason?: string;
    status?: string;
    code?: string;
    userAgent?: string;
    ip?: string;
    url?: string;
    link?: string;
    rawEvent: unknown;
}
export interface LoggedEvent extends WebhookEvent {
    loggedAt: number;
}
export interface HandlerResult {
    success: boolean;
    result?: unknown;
    error?: string;
}
export interface DispatchedEvent extends WebhookEvent {
    handlerResults: HandlerResult[];
}
export interface ProcessWebhookResult {
    success: boolean;
    eventsProcessed: number;
    events: DispatchedEvent[];
}
export type EventHandler = (event: WebhookEvent) => Promise<unknown>;
export declare class WebhookReceiver {
    options: WebhookReceiverOptions;
    webhookSecret: string | null;
    provider: WebhookProvider;
    handlers: Map<string, EventHandler[]>;
    maxEventLogSize: number;
    private _eventLog;
    constructor(options?: WebhookReceiverOptions);
    processWebhook(body: unknown, headers?: WebhookHeaders): Promise<ProcessWebhookResult>;
    on(eventType: string, handler: EventHandler): void;
    off(eventType: string, handler: EventHandler): void;
    private _validateSignature;
    private _validateSendGridSignature;
    private _validateAwsSesSignature;
    private _validateMailgunSignature;
    private _validatePostmarkSignature;
    private _parseSendGridEvents;
    private _parseAwsSesEvents;
    private _parseMailgunEvents;
    private _parsePostmarkEvents;
    private _parseGenericEvents;
    private _dispatchEvent;
    private _addEventLog;
    getEventLog(limit?: number): LoggedEvent[];
    clearEventLog(): void;
    getHandlerCount(): Record<string, number>;
}
export interface WebhookProviderConfig {
    name: string;
    url: string;
    signatureHeader: string;
    timestampHeader?: string;
    docUrl: string;
}
export declare const webhookProviders: Record<string, WebhookProviderConfig>;
//# sourceMappingURL=webhook-receiver.d.ts.map