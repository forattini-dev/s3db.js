import crypto from 'crypto';
import { SMTPError } from './errors.js';
export class WebhookReceiver {
    options;
    webhookSecret;
    provider;
    handlers;
    maxEventLogSize;
    _eventLog;
    constructor(options = {}) {
        this.options = options;
        this.webhookSecret = options.webhookSecret || null;
        this.provider = options.provider || 'generic';
        this.handlers = new Map();
        this._eventLog = [];
        this.maxEventLogSize = options.maxEventLogSize || 1000;
    }
    async processWebhook(body, headers = {}) {
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
            let events = [];
            if (this.provider === 'sendgrid') {
                events = this._parseSendGridEvents(body);
            }
            else if (this.provider === 'aws-ses') {
                events = await this._parseAwsSesEvents(body);
            }
            else if (this.provider === 'mailgun') {
                events = this._parseMailgunEvents(body);
            }
            else if (this.provider === 'postmark') {
                events = this._parsePostmarkEvents(body);
            }
            else {
                events = this._parseGenericEvents(body);
            }
            const results = [];
            for (const event of events) {
                const result = await this._dispatchEvent(event);
                results.push(result);
            }
            return {
                success: true,
                eventsProcessed: results.length,
                events: results
            };
        }
        catch (err) {
            const error = err;
            throw new SMTPError(`Webhook processing error: ${error.message}`, {
                originalError: error,
                statusCode: error.statusCode || 400
            });
        }
    }
    on(eventType, handler) {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType).push(handler);
    }
    off(eventType, handler) {
        if (!this.handlers.has(eventType))
            return;
        const handlers = this.handlers.get(eventType);
        const index = handlers.indexOf(handler);
        if (index > -1) {
            handlers.splice(index, 1);
        }
    }
    async _validateSignature(body, headers) {
        if (!this.webhookSecret)
            return true;
        if (this.provider === 'sendgrid') {
            return this._validateSendGridSignature(body, headers);
        }
        else if (this.provider === 'aws-ses') {
            return this._validateAwsSesSignature(body);
        }
        else if (this.provider === 'mailgun') {
            return this._validateMailgunSignature(headers);
        }
        else if (this.provider === 'postmark') {
            return this._validatePostmarkSignature(body, headers);
        }
        return true;
    }
    _validateSendGridSignature(body, headers) {
        const signature = headers['x-twilio-email-event-webhook-signature'];
        const timestamp = headers['x-twilio-email-event-webhook-timestamp'];
        if (!signature || !timestamp) {
            return false;
        }
        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        const signedContent = timestamp + bodyString;
        const hmac = crypto
            .createHmac('sha256', Buffer.from(this.webhookSecret, 'base64'))
            .update(signedContent)
            .digest('base64');
        return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
    }
    _validateAwsSesSignature(body) {
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
    _validateMailgunSignature(headers) {
        const signature = headers['x-mailgun-signature'];
        const timestamp = headers['x-mailgun-signature-timestamp'];
        const token = headers['x-mailgun-signature-token'];
        if (!signature || !timestamp || !token) {
            return false;
        }
        const hmac = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(timestamp + token)
            .digest('hex');
        return hmac === signature;
    }
    _validatePostmarkSignature(body, headers) {
        const signature = headers['x-postmark-signature'];
        if (!signature) {
            return false;
        }
        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        const hmac = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(bodyString)
            .digest('base64');
        return hmac === signature;
    }
    _parseSendGridEvents(body) {
        const items = Array.isArray(body) ? body : [body];
        return items.map((item) => {
            const event = {
                provider: 'sendgrid',
                messageId: item.sg_message_id || item.email,
                recipient: item.email,
                timestamp: item.timestamp || Date.now() / 1000,
                rawEvent: item,
                type: item.event || 'unknown'
            };
            if (item.event === 'bounce') {
                event.type = 'bounce';
                event.bounceType = item.bounce_type || 'permanent';
                event.bounceSubType = item.bounce_subtype;
                event.reason = item.reason || 'Bounce';
            }
            else if (item.event === 'dropped') {
                event.type = 'bounce';
                event.bounceType = 'permanent';
                event.reason = item.reason || 'Dropped';
            }
            else if (item.event === 'spamreport') {
                event.type = 'complaint';
                event.complaintType = 'abuse';
                event.reason = 'Spam report';
            }
            else if (item.event === 'delivered') {
                event.type = 'delivery';
                event.reason = 'Delivered';
            }
            else if (item.event === 'open') {
                event.type = 'open';
                event.userAgent = item.useragent;
                event.ip = item.ip;
            }
            else if (item.event === 'click') {
                event.type = 'click';
                event.url = item.url;
                event.userAgent = item.useragent;
                event.ip = item.ip;
            }
            return event;
        });
    }
    async _parseAwsSesEvents(body) {
        const message = typeof body.Message === 'string'
            ? JSON.parse(body.Message)
            : body.Message || {};
        const eventType = message.eventType;
        const mail = message.mail || {};
        const bounce = message.bounce || {};
        const complaint = message.complaint || {};
        const delivery = message.delivery || {};
        const events = [];
        if (eventType === 'Bounce') {
            const bounceType = bounce.bounceType === 'Transient' ? 'soft' : 'hard';
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
            const complaintType = complaint.complaintFeedbackType || 'general';
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
    _parseMailgunEvents(body) {
        const events = [];
        const eventData = body['event-data'] || {};
        const eventType = eventData.event || body.event;
        const recipient = eventData.recipient || body.recipient;
        const messageId = eventData.message?.id || body['message-id'];
        const timestamp = eventData.timestamp || body.timestamp || Date.now() / 1000;
        const event = {
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
    _parsePostmarkEvents(body) {
        const events = [];
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
    _parseGenericEvents(body) {
        if (Array.isArray(body)) {
            return body.map((evt) => ({
                provider: 'generic',
                ...evt,
                type: evt.type || 'unknown',
                timestamp: evt.timestamp || Date.now() / 1000,
                rawEvent: evt
            }));
        }
        const genericBody = body;
        if (Array.isArray(genericBody.events)) {
            return genericBody.events.map((evt) => ({
                provider: 'generic',
                type: evt.type || 'unknown',
                messageId: evt.messageId || evt.message_id,
                recipient: evt.recipient || evt.email,
                bounceType: (evt.bounceType || evt.bounce_type),
                complaintType: (evt.complaintType || evt.complaint_type),
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
    async _dispatchEvent(event) {
        const handlers = this.handlers.get(event.type) || [];
        const results = [];
        this._addEventLog(event);
        for (const handler of handlers) {
            try {
                const result = await handler(event);
                results.push({
                    success: true,
                    result
                });
            }
            catch (err) {
                results.push({
                    success: false,
                    error: err.message
                });
            }
        }
        return {
            ...event,
            handlerResults: results
        };
    }
    _addEventLog(event) {
        this._eventLog.push({
            ...event,
            loggedAt: Date.now()
        });
        if (this._eventLog.length > this.maxEventLogSize) {
            this._eventLog.shift();
        }
    }
    getEventLog(limit = 100) {
        return this._eventLog.slice(-limit);
    }
    clearEventLog() {
        this._eventLog = [];
    }
    getHandlerCount() {
        const counts = {};
        for (const [type, handlers] of this.handlers) {
            counts[type] = handlers.length;
        }
        return counts;
    }
}
export const webhookProviders = {
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
//# sourceMappingURL=webhook-receiver.js.map