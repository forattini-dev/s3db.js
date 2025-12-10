export class EmailHeadersBuilder {
    options;
    headers;
    customHeaders;
    dkim;
    spf;
    dmarc;
    messageIdDomain;
    customUnsubscribeHeaders;
    constructor(options = {}) {
        this.options = options;
        this.headers = {};
        this.customHeaders = options.customHeaders || {};
        this.dkim = options.dkim || null;
        this.spf = options.spf || null;
        this.dmarc = options.dmarc || null;
        this.messageIdDomain = options.messageIdDomain || 'example.com';
        this.customUnsubscribeHeaders = options.customUnsubscribeHeaders || null;
    }
    generateHeaders(message = {}) {
        const headers = {
            ...this.customHeaders
        };
        if (message.from) {
            headers['From'] = this._formatEmailAddress(message.from);
        }
        if (message.replyTo) {
            headers['Reply-To'] = this._formatEmailAddress(message.replyTo);
        }
        if (message.inReplyTo) {
            headers['In-Reply-To'] = message.inReplyTo;
        }
        if (message.references) {
            headers['References'] = Array.isArray(message.references)
                ? message.references.join(' ')
                : message.references;
        }
        headers['Message-ID'] = this._generateMessageId();
        headers['MIME-Version'] = '1.0';
        headers['Content-Type'] = 'multipart/alternative; charset=UTF-8';
        if (message.listUnsubscribe) {
            headers['List-Unsubscribe'] = this._generateListUnsubscribe(message.listUnsubscribe);
            headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        }
        if (this.customUnsubscribeHeaders) {
            Object.assign(headers, this.customUnsubscribeHeaders);
        }
        headers['X-Mailer'] = 's3db-smtp-plugin/2.0';
        headers['X-Priority'] = message.priority || '3';
        if (message.customHeaders) {
            Object.assign(headers, message.customHeaders);
        }
        return headers;
    }
    generateDkimSignature(_messageData) {
        if (!this.dkim) {
            return null;
        }
        const { domain, selector = 'default', privateKey, algorithm = 'rsa-sha256', canonicalization = 'relaxed/relaxed' } = this.dkim;
        if (!privateKey) {
            return null;
        }
        const dkimHeader = {
            v: '1',
            a: algorithm,
            c: canonicalization,
            d: domain || this.messageIdDomain,
            s: selector,
            h: 'From:To:Subject:Date:Message-ID:MIME-Version:Content-Type',
            bh: '',
            b: ''
        };
        return this._buildDkimHeader(dkimHeader);
    }
    generateAuthenticationHeaders(domain) {
        const domainClean = domain || this.messageIdDomain;
        const headers = {};
        if (this.spf) {
            headers['Received-SPF'] = this._generateSpfHeader(domainClean);
        }
        if (this.dmarc) {
            headers['Authentication-Results'] = this._generateDmarcHeader(domainClean);
        }
        return headers;
    }
    generateArcHeaders(_messageData) {
        return {
            'ARC-Seal': this._generateArcSeal(),
            'ARC-Message-Signature': this._generateArcMessageSig(),
            'ARC-Authentication-Results': this._generateArcAuthResults()
        };
    }
    addUnsubscribeLink(unsubscribeUrl, oneClickOnly = false) {
        this.headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
        if (!oneClickOnly) {
            this.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
        }
        return this.headers;
    }
    addBounceAddress(bounceAddress) {
        this.headers['Return-Path'] = `<${bounceAddress}>`;
        return this.headers;
    }
    addFeedbackLoopHeaders(feedbackEmail) {
        this.headers['Feedback-ID'] = `${this._generateFeedbackId()}:${feedbackEmail}`;
        return this.headers;
    }
    getHeaders() {
        return { ...this.headers };
    }
    getHeadersAsString() {
        const lines = [];
        for (const [key, value] of Object.entries(this.headers)) {
            lines.push(`${key}: ${value}`);
        }
        return lines.join('\n');
    }
    _formatEmailAddress(email) {
        if (typeof email === 'string') {
            return email;
        }
        if (email.name && email.address) {
            return `"${email.name}" <${email.address}>`;
        }
        return email.address || String(email);
    }
    _generateMessageId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const domain = this.messageIdDomain;
        return `<${timestamp}-${random}@${domain}>`;
    }
    _generateListUnsubscribe(unsubscribeInfo) {
        if (typeof unsubscribeInfo === 'string') {
            return `<${unsubscribeInfo}>`;
        }
        const parts = [];
        if (unsubscribeInfo.url) {
            parts.push(`<${unsubscribeInfo.url}>`);
        }
        if (unsubscribeInfo.email) {
            parts.push(`<mailto:${unsubscribeInfo.email}>`);
        }
        return parts.join(', ');
    }
    _buildDkimHeader(dkimConfig) {
        const parts = [];
        for (const [key, value] of Object.entries(dkimConfig)) {
            if (value) {
                parts.push(`${key}=${value}`);
            }
        }
        return parts.join(';');
    }
    _generateSpfHeader(domain) {
        const domainClean = domain || this.messageIdDomain;
        const ip = '203.0.113.1';
        return `pass (${domainClean} designates ${ip} as permitted sender) receiver=example.com`;
    }
    _generateDmarcHeader(domain) {
        const domainClean = domain || this.messageIdDomain;
        return `dmarc=pass header.from=${domainClean} header.canonical=dns/domain`;
    }
    _generateArcSeal() {
        return `i=1; a=rsa-sha256; t=${Math.floor(Date.now() / 1000)}; cv=none; d=example.com; s=selector; b=`;
    }
    _generateArcMessageSig() {
        return `i=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=selector; bh=; b=`;
    }
    _generateArcAuthResults() {
        return `i=1; spf=pass; dmarc=pass; dkim=pass`;
    }
    _generateFeedbackId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `${timestamp}${random}`;
    }
}
export const dkimPresets = {
    sendgrid: {
        domain: 'sendgrid.net',
        selector: 'sendgrid',
        algorithm: 'rsa-sha256',
        canonicalization: 'relaxed/relaxed'
    },
    aws_ses: {
        domain: 'amazonses.com',
        selector: 'default',
        algorithm: 'rsa-sha256',
        canonicalization: 'relaxed/relaxed'
    },
    mailgun: {
        domain: 'mailgun.org',
        selector: 'mailgun',
        algorithm: 'rsa-sha256',
        canonicalization: 'relaxed/relaxed'
    },
    postmark: {
        domain: 'postmarkapp.com',
        selector: 'postmark',
        algorithm: 'rsa-sha256',
        canonicalization: 'simple/simple'
    }
};
export const dmarcAlignmentModes = {
    RELAXED: 'relaxed',
    STRICT: 'strict'
};
export const dmarcPolicies = {
    NONE: 'none',
    QUARANTINE: 'quarantine',
    REJECT: 'reject'
};
//# sourceMappingURL=email-headers.js.map