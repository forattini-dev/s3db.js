/**
 * Email Headers Builder - DKIM, SPF, DMARC support
 *
 * Manages email headers for authentication and identification
 */
export class EmailHeadersBuilder {
  constructor(options = {}) {
    this.options = options;
    this.headers = {};
    this.customHeaders = options.customHeaders || {};

    // Email authentication settings
    this.dkim = options.dkim || null;
    this.spf = options.spf || null;
    this.dmarc = options.dmarc || null;
    this.messageIdDomain = options.messageIdDomain || 'example.com';
    this.customUnsubscribeHeaders = options.customUnsubscribeHeaders || null;
  }

  /**
   * Generate email headers
   */
  generateHeaders(message = {}) {
    const headers = {
      ...this.customHeaders
    };

    // Standard headers
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

    // Generate unique Message-ID
    headers['Message-ID'] = this._generateMessageId();

    // Add MIME headers
    headers['MIME-Version'] = '1.0';
    headers['Content-Type'] = 'multipart/alternative; charset=UTF-8';

    // Add authentication headers
    if (message.listUnsubscribe) {
      headers['List-Unsubscribe'] = this._generateListUnsubscribe(message.listUnsubscribe);
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    // Add custom unsubscribe headers if configured
    if (this.customUnsubscribeHeaders) {
      Object.assign(headers, this.customUnsubscribeHeaders);
    }

    // X-Headers for tracking/identification
    headers['X-Mailer'] = 's3db-smtp-plugin/2.0';
    headers['X-Priority'] = message.priority || '3';

    // Custom X-Headers
    if (message.customHeaders) {
      Object.assign(headers, message.customHeaders);
    }

    return headers;
  }

  /**
   * Generate DKIM signature (if configured)
   */
  generateDkimSignature(messageData) {
    if (!this.dkim) {
      return null;
    }

    const {
      domain,
      selector = 'default',
      privateKey,
      algorithm = 'rsa-sha256',
      canonicalization = 'relaxed/relaxed',
      includeBodyLength = true,
      includeTimestamp = true,
      includeExpiration = true
    } = this.dkim;

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
      bh: '', // Body hash (computed by nodemailer)
      b: '' // Signature (computed by nodemailer)
    };

    // This is a template - actual signing done by nodemailer
    return this._buildDkimHeader(dkimHeader);
  }

  /**
   * Generate SPF/DMARC policy headers
   */
  generateAuthenticationHeaders(domain) {
    const domain_clean = domain || this.messageIdDomain;
    const headers = {};

    // Add SPF if configured
    if (this.spf) {
      headers['Received-SPF'] = this._generateSpfHeader(domain_clean);
    }

    // Add DMARC result if configured
    if (this.dmarc) {
      headers['Authentication-Results'] = this._generateDmarcHeader(domain_clean);
    }

    return headers;
  }

  /**
   * Generate ARC headers (for message authentication)
   */
  generateArcHeaders(messageData) {
    return {
      'ARC-Seal': this._generateArcSeal(),
      'ARC-Message-Signature': this._generateArcMessageSig(),
      'ARC-Authentication-Results': this._generateArcAuthResults()
    };
  }

  /**
   * Add unsubscribe link to headers
   */
  addUnsubscribeLink(unsubscribeUrl, oneClickOnly = false) {
    this.headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;

    if (!oneClickOnly) {
      this.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    return this.headers;
  }

  /**
   * Add bounce address
   */
  addBounceAddress(bounceAddress) {
    this.headers['Return-Path'] = `<${bounceAddress}>`;
    return this.headers;
  }

  /**
   * Add feedback loop headers
   */
  addFeedbackLoopHeaders(feedbackEmail) {
    this.headers['Feedback-ID'] = `${this._generateFeedbackId()}:${feedbackEmail}`;
    return this.headers;
  }

  /**
   * Get all headers as object
   */
  getHeaders() {
    return { ...this.headers };
  }

  /**
   * Get headers as string (for display)
   */
  getHeadersAsString() {
    const lines = [];
    for (const [key, value] of Object.entries(this.headers)) {
      lines.push(`${key}: ${value}`);
    }
    return lines.join('\n');
  }

  // Private helpers

  /**
   * Format email address (with name if provided)
   * @private
   */
  _formatEmailAddress(email) {
    if (typeof email === 'string') {
      return email;
    }

    if (email.name && email.address) {
      return `"${email.name}" <${email.address}>`;
    }

    return email.address || email;
  }

  /**
   * Generate unique Message-ID
   * @private
   */
  _generateMessageId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const domain = this.messageIdDomain;
    return `<${timestamp}-${random}@${domain}>`;
  }

  /**
   * Generate List-Unsubscribe header
   * @private
   */
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

  /**
   * Build DKIM header
   * @private
   */
  _buildDkimHeader(dkimConfig) {
    const parts = [];
    for (const [key, value] of Object.entries(dkimConfig)) {
      if (value) {
        parts.push(`${key}=${value}`);
      }
    }
    return parts.join(';');
  }

  /**
   * Generate SPF header
   * @private
   */
  _generateSpfHeader(domain) {
    const domain_clean = domain || this.messageIdDomain;
    const ip = '203.0.113.1'; // Example IP
    return `pass (${domain_clean} designates ${ip} as permitted sender) receiver=example.com`;
  }

  /**
   * Generate DMARC header
   * @private
   */
  _generateDmarcHeader(domain) {
    const domain_clean = domain || this.messageIdDomain;
    return `dmarc=pass header.from=${domain_clean} header.canonical=dns/domain`;
  }

  /**
   * Generate ARC Seal
   * @private
   */
  _generateArcSeal() {
    return `i=1; a=rsa-sha256; t=${Math.floor(Date.now() / 1000)}; cv=none; d=example.com; s=selector; b=`;
  }

  /**
   * Generate ARC Message Signature
   * @private
   */
  _generateArcMessageSig() {
    return `i=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=selector; bh=; b=`;
  }

  /**
   * Generate ARC Authentication Results
   * @private
   */
  _generateArcAuthResults() {
    return `i=1; spf=pass; dmarc=pass; dkim=pass`;
  }

  /**
   * Generate Feedback-ID
   * @private
   */
  _generateFeedbackId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}${random}`;
  }
}

/**
 * Common DKIM configurations for popular providers
 */
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

/**
 * DMARC alignment modes
 */
export const dmarcAlignmentModes = {
  // Relaxed alignment (subdomain match)
  RELAXED: 'relaxed',

  // Strict alignment (exact domain match)
  STRICT: 'strict'
};

/**
 * DMARC policy recommendations
 */
export const dmarcPolicies = {
  // Monitor-only mode
  NONE: 'none',

  // Quarantine suspicious emails
  QUARANTINE: 'quarantine',

  // Reject suspicious emails
  REJECT: 'reject'
};
