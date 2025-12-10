import crypto from 'crypto';
import { SMTPError } from './errors.js';

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

interface SendGridEventData {
  sg_message_id?: string;
  email?: string;
  timestamp?: number;
  event?: string;
  bounce_type?: string;
  bounce_subtype?: string;
  reason?: string;
  useragent?: string;
  ip?: string;
  url?: string;
  [key: string]: unknown;
}

interface AwsSesNotification {
  Type?: string;
  Message?: string | AwsSesMessage;
  MessageSignature?: string;
  SignatureVersion?: string;
}

interface AwsSesMessage {
  eventType?: string;
  mail?: {
    messageId?: string;
    source?: string;
  };
  bounce?: {
    bounceType?: string;
    bouncedRecipients?: Array<{
      emailAddress?: string;
      bounceSubType?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
    timestamp?: number;
  };
  complaint?: {
    complaintFeedbackType?: string;
    complainedRecipients?: Array<{ emailAddress?: string }>;
    timestamp?: number;
  };
  delivery?: {
    recipients?: string[];
    timestamp?: number;
  };
  open?: {
    recipient?: string;
    userAgent?: string;
    ip?: string;
    timestamp?: number;
  };
  click?: {
    recipient?: string;
    userAgent?: string;
    ip?: string;
    link?: string;
    timestamp?: number;
  };
}

interface MailgunEventBody {
  'event-data'?: {
    event?: string;
    recipient?: string;
    message?: { id?: string };
    timestamp?: number;
    severity?: string;
    reason?: string;
    code?: string;
    'user-variables'?: { 'user-agent'?: string };
    'client-info'?: { ip?: string };
    url?: string;
  };
  event?: string;
  recipient?: string;
  'message-id'?: string;
  timestamp?: number;
}

interface PostmarkBody {
  Bounces?: Array<{
    MessageID?: string;
    Email?: string;
    Type?: string;
    BounceSubType?: string;
    Description?: string;
    BouncedAt?: string;
  }>;
  Complaints?: Array<{
    MessageID?: string;
    Email?: string;
    Description?: string;
    ComplainedAt?: string;
  }>;
  Deliveries?: Array<{
    MessageID?: string;
    Email?: string;
    DeliveredAt?: string;
  }>;
}

interface GenericEventBody {
  events?: Array<{
    type?: string;
    messageId?: string;
    message_id?: string;
    recipient?: string;
    email?: string;
    bounceType?: string;
    bounce_type?: string;
    complaintType?: string;
    complaint_type?: string;
    timestamp?: number;
  }>;
  type?: string;
  messageId?: string;
  message_id?: string;
  recipient?: string;
  email?: string;
  timestamp?: number;
  [key: string]: unknown;
}

export class WebhookReceiver {
  public options: WebhookReceiverOptions;
  public webhookSecret: string | null;
  public provider: WebhookProvider;
  public handlers: Map<string, EventHandler[]>;
  public maxEventLogSize: number;
  private _eventLog: LoggedEvent[];

  constructor(options: WebhookReceiverOptions = {}) {
    this.options = options;
    this.webhookSecret = options.webhookSecret || null;
    this.provider = options.provider || 'generic';
    this.handlers = new Map();
    this._eventLog = [];
    this.maxEventLogSize = options.maxEventLogSize || 1000;
  }

  async processWebhook(body: unknown, headers: WebhookHeaders = {}): Promise<ProcessWebhookResult> {
    try {
      if (this.webhookSecret) {
        const isValid = await this._validateSignature(body, headers);
        if (!isValid) {
          throw new SMTPError('Invalid webhook signature', {
            statusCode: 403,
            retriable: false,
            suggestion: 'Verify webhook secret matches provider configuration'
          });
        }
      }

      let events: WebhookEvent[] = [];

      if (this.provider === 'sendgrid') {
        events = this._parseSendGridEvents(body as SendGridEventData | SendGridEventData[]);
      } else if (this.provider === 'aws-ses') {
        events = await this._parseAwsSesEvents(body as AwsSesNotification);
      } else if (this.provider === 'mailgun') {
        events = this._parseMailgunEvents(body as MailgunEventBody);
      } else if (this.provider === 'postmark') {
        events = this._parsePostmarkEvents(body as PostmarkBody);
      } else {
        events = this._parseGenericEvents(body as GenericEventBody);
      }

      const results: DispatchedEvent[] = [];
      for (const event of events) {
        const result = await this._dispatchEvent(event);
        results.push(result);
      }

      return {
        success: true,
        eventsProcessed: results.length,
        events: results
      };
    } catch (err) {
      const error = err as SMTPError;
      throw new SMTPError(`Webhook processing error: ${error.message}`, {
        originalError: error,
        statusCode: error.statusCode || 400
      });
    }
  }

  on(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  off(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) return;
    const handlers = this.handlers.get(eventType)!;
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  private async _validateSignature(body: unknown, headers: WebhookHeaders): Promise<boolean> {
    if (!this.webhookSecret) return true;

    if (this.provider === 'sendgrid') {
      return this._validateSendGridSignature(body, headers);
    } else if (this.provider === 'aws-ses') {
      return this._validateAwsSesSignature(body as AwsSesNotification);
    } else if (this.provider === 'mailgun') {
      return this._validateMailgunSignature(headers);
    } else if (this.provider === 'postmark') {
      return this._validatePostmarkSignature(body, headers);
    }

    return true;
  }

  private _validateSendGridSignature(body: unknown, headers: WebhookHeaders): boolean {
    const signature = headers['x-twilio-email-event-webhook-signature'];
    const timestamp = headers['x-twilio-email-event-webhook-timestamp'];

    if (!signature || !timestamp) {
      return false;
    }

    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const signedContent = timestamp + bodyString;

    const hmac = crypto
      .createHmac('sha256', Buffer.from(this.webhookSecret!, 'base64'))
      .update(signedContent)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(signature)
    );
  }

  private _validateAwsSesSignature(body: AwsSesNotification): boolean {
    if (body.Type === 'SubscriptionConfirmation') {
      return true;
    }

    const message = body.Message;
    const messageSignature = body.MessageSignature;
    const signatureVersion = body.SignatureVersion;

    if (!message || !messageSignature || signatureVersion !== '1') {
      return false;
    }

    return !!messageSignature;
  }

  private _validateMailgunSignature(headers: WebhookHeaders): boolean {
    const signature = headers['x-mailgun-signature'];
    const timestamp = headers['x-mailgun-signature-timestamp'];
    const token = headers['x-mailgun-signature-token'];

    if (!signature || !timestamp || !token) {
      return false;
    }

    const hmac = crypto
      .createHmac('sha256', this.webhookSecret!)
      .update(timestamp + token)
      .digest('hex');

    return hmac === signature;
  }

  private _validatePostmarkSignature(body: unknown, headers: WebhookHeaders): boolean {
    const signature = headers['x-postmark-signature'];

    if (!signature) {
      return false;
    }

    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    const hmac = crypto
      .createHmac('sha256', this.webhookSecret!)
      .update(bodyString)
      .digest('base64');

    return hmac === signature;
  }

  private _parseSendGridEvents(body: SendGridEventData | SendGridEventData[]): WebhookEvent[] {
    const items = Array.isArray(body) ? body : [body];

    return items.map((item) => {
      const event: WebhookEvent = {
        provider: 'sendgrid',
        messageId: item.sg_message_id || item.email,
        recipient: item.email,
        timestamp: item.timestamp || Date.now() / 1000,
        rawEvent: item,
        type: item.event || 'unknown'
      };

      if (item.event === 'bounce') {
        event.type = 'bounce';
        event.bounceType = (item.bounce_type as BounceType) || 'permanent';
        event.bounceSubType = item.bounce_subtype;
        event.reason = item.reason || 'Bounce';
      } else if (item.event === 'dropped') {
        event.type = 'bounce';
        event.bounceType = 'permanent';
        event.reason = item.reason || 'Dropped';
      } else if (item.event === 'spamreport') {
        event.type = 'complaint';
        event.complaintType = 'abuse';
        event.reason = 'Spam report';
      } else if (item.event === 'delivered') {
        event.type = 'delivery';
        event.reason = 'Delivered';
      } else if (item.event === 'open') {
        event.type = 'open';
        event.userAgent = item.useragent;
        event.ip = item.ip;
      } else if (item.event === 'click') {
        event.type = 'click';
        event.url = item.url;
        event.userAgent = item.useragent;
        event.ip = item.ip;
      }

      return event;
    });
  }

  private async _parseAwsSesEvents(body: AwsSesNotification): Promise<WebhookEvent[]> {
    const message: AwsSesMessage = typeof body.Message === 'string'
      ? JSON.parse(body.Message)
      : body.Message || {};

    const eventType = message.eventType;
    const mail = message.mail || {};
    const bounce = message.bounce || {};
    const complaint = message.complaint || {};
    const delivery = message.delivery || {};

    const events: WebhookEvent[] = [];

    if (eventType === 'Bounce') {
      const bounceType: BounceType = bounce.bounceType === 'Transient' ? 'soft' : 'hard';

      for (const recipient of bounce.bouncedRecipients || []) {
        events.push({
          provider: 'aws-ses',
          type: 'bounce',
          messageId: mail.messageId,
          recipient: recipient.emailAddress,
          bounceType,
          bounceSubType: recipient.bounceSubType,
          status: recipient.status,
          reason: recipient.diagnosticCode || 'Bounce',
          timestamp: bounce.timestamp || Date.now() / 1000,
          rawEvent: message
        });
      }
    }

    if (eventType === 'Complaint') {
      const complaintType = (complaint.complaintFeedbackType as ComplaintType) || 'general';

      for (const recipient of complaint.complainedRecipients || []) {
        events.push({
          provider: 'aws-ses',
          type: 'complaint',
          messageId: mail.messageId,
          recipient: recipient.emailAddress,
          complaintType,
          reason: `Complaint: ${complaintType}`,
          timestamp: complaint.timestamp || Date.now() / 1000,
          rawEvent: message
        });
      }
    }

    if (eventType === 'Delivery') {
      for (const recipient of delivery.recipients || []) {
        events.push({
          provider: 'aws-ses',
          type: 'delivery',
          messageId: mail.messageId,
          recipient,
          timestamp: delivery.timestamp || Date.now() / 1000,
          rawEvent: message
        });
      }
    }

    if (eventType === 'Open' || eventType === 'Click') {
      events.push({
        provider: 'aws-ses',
        type: eventType.toLowerCase(),
        messageId: mail.messageId,
        recipient: message.open?.recipient || message.click?.recipient || mail.source,
        userAgent: message.open?.userAgent || message.click?.userAgent,
        ip: message.open?.ip || message.click?.ip,
        link: message.click?.link,
        timestamp: message.open?.timestamp || message.click?.timestamp || Date.now() / 1000,
        rawEvent: message
      });
    }

    return events;
  }

  private _parseMailgunEvents(body: MailgunEventBody): WebhookEvent[] {
    const events: WebhookEvent[] = [];

    const eventData = body['event-data'] || {};
    const eventType = eventData.event || body.event;
    const recipient = eventData.recipient || body.recipient;
    const messageId = eventData.message?.id || body['message-id'];
    const timestamp = eventData.timestamp || body.timestamp || Date.now() / 1000;

    const event: WebhookEvent = {
      provider: 'mailgun',
      type: eventType || 'unknown',
      messageId,
      recipient,
      timestamp,
      rawEvent: body
    };

    switch (eventType) {
      case 'failed':
        event.type = 'bounce';
        event.bounceType = eventData.severity === 'permanent' ? 'hard' : 'soft';
        event.reason = eventData.reason || 'Failed';
        event.code = eventData.code;
        break;

      case 'complained':
        event.type = 'complaint';
        event.complaintType = 'abuse';
        event.reason = 'Complained';
        break;

      case 'delivered':
        event.type = 'delivery';
        event.reason = 'Delivered';
        break;

      case 'opened':
        event.type = 'open';
        event.userAgent = eventData['user-variables']?.['user-agent'];
        event.ip = eventData['client-info']?.ip;
        break;

      case 'clicked':
        event.type = 'click';
        event.url = eventData.url;
        event.userAgent = eventData['user-variables']?.['user-agent'];
        event.ip = eventData['client-info']?.ip;
        break;
    }

    events.push(event);
    return events;
  }

  private _parsePostmarkEvents(body: PostmarkBody): WebhookEvent[] {
    const events: WebhookEvent[] = [];

    if (body.Bounces) {
      for (const bounce of body.Bounces) {
        events.push({
          provider: 'postmark',
          type: 'bounce',
          messageId: bounce.MessageID,
          recipient: bounce.Email,
          bounceType: bounce.Type === 'SoftBounce' ? 'soft' : 'hard',
          bounceSubType: bounce.BounceSubType,
          reason: bounce.Description || 'Bounce',
          timestamp: new Date(bounce.BouncedAt || Date.now()).getTime() / 1000,
          rawEvent: bounce
        });
      }
    }

    if (body.Complaints) {
      for (const complaint of body.Complaints) {
        events.push({
          provider: 'postmark',
          type: 'complaint',
          messageId: complaint.MessageID,
          recipient: complaint.Email,
          complaintType: 'abuse',
          reason: complaint.Description || 'Complaint',
          timestamp: new Date(complaint.ComplainedAt || Date.now()).getTime() / 1000,
          rawEvent: complaint
        });
      }
    }

    if (body.Deliveries) {
      for (const delivery of body.Deliveries) {
        events.push({
          provider: 'postmark',
          type: 'delivery',
          messageId: delivery.MessageID,
          recipient: delivery.Email,
          timestamp: new Date(delivery.DeliveredAt || Date.now()).getTime() / 1000,
          rawEvent: delivery
        });
      }
    }

    return events;
  }

  private _parseGenericEvents(body: GenericEventBody | unknown[]): WebhookEvent[] {
    if (Array.isArray(body)) {
      return body.map((evt) => ({
        provider: 'generic' as const,
        ...(evt as Record<string, unknown>),
        type: (evt as { type?: string }).type || 'unknown',
        timestamp: (evt as { timestamp?: number }).timestamp || Date.now() / 1000,
        rawEvent: evt
      }));
    }

    const genericBody = body as GenericEventBody;

    if (Array.isArray(genericBody.events)) {
      return genericBody.events.map((evt) => ({
        provider: 'generic' as const,
        type: evt.type || 'unknown',
        messageId: evt.messageId || evt.message_id,
        recipient: evt.recipient || evt.email,
        bounceType: (evt.bounceType || evt.bounce_type) as BounceType | undefined,
        complaintType: (evt.complaintType || evt.complaint_type) as ComplaintType | undefined,
        timestamp: evt.timestamp || Date.now() / 1000,
        rawEvent: evt
      }));
    }

    return [
      {
        provider: 'generic',
        type: genericBody.type || 'unknown',
        messageId: genericBody.messageId || genericBody.message_id,
        recipient: genericBody.recipient || genericBody.email,
        timestamp: genericBody.timestamp || Date.now() / 1000,
        rawEvent: genericBody
      }
    ];
  }

  private async _dispatchEvent(event: WebhookEvent): Promise<DispatchedEvent> {
    const handlers = this.handlers.get(event.type) || [];
    const results: HandlerResult[] = [];

    this._addEventLog(event);

    for (const handler of handlers) {
      try {
        const result = await handler(event);
        results.push({
          success: true,
          result
        });
      } catch (err) {
        results.push({
          success: false,
          error: (err as Error).message
        });
      }
    }

    return {
      ...event,
      handlerResults: results
    };
  }

  private _addEventLog(event: WebhookEvent): void {
    this._eventLog.push({
      ...event,
      loggedAt: Date.now()
    });

    if (this._eventLog.length > this.maxEventLogSize) {
      this._eventLog.shift();
    }
  }

  getEventLog(limit: number = 100): LoggedEvent[] {
    return this._eventLog.slice(-limit);
  }

  clearEventLog(): void {
    this._eventLog = [];
  }

  getHandlerCount(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [type, handlers] of this.handlers) {
      counts[type] = handlers.length;
    }
    return counts;
  }
}

export interface WebhookProviderConfig {
  name: string;
  url: string;
  signatureHeader: string;
  timestampHeader?: string;
  docUrl: string;
}

export const webhookProviders: Record<string, WebhookProviderConfig> = {
  sendgrid: {
    name: 'SendGrid Event Webhook',
    url: 'https://api.sendgrid.com/v3/mail_settings/event_webhook',
    signatureHeader: 'x-twilio-email-event-webhook-signature',
    timestampHeader: 'x-twilio-email-event-webhook-timestamp',
    docUrl: 'https://docs.sendgrid.com/for-developers/tracking-events/event'
  },

  'aws-ses': {
    name: 'AWS SES SNS Notifications',
    url: 'SNS Topic ARN',
    signatureHeader: 'None (SNS handles)',
    docUrl: 'https://docs.aws.amazon.com/ses/latest/dg/event-publishing-sns.html'
  },

  mailgun: {
    name: 'Mailgun Webhooks',
    url: 'https://api.mailgun.net/v3/domains/{domain}/webhooks',
    signatureHeader: 'x-mailgun-signature',
    docUrl: 'https://documentation.mailgun.com/en/latest/api-webhooks.html'
  },

  postmark: {
    name: 'Postmark Webhooks',
    url: 'https://api.postmarkapp.com/webhooks',
    signatureHeader: 'x-postmark-signature',
    docUrl: 'https://postmarkapp.com/developer/webhooks'
  }
};
