export interface EmailHeadersOptions {
  customHeaders?: Record<string, string>;
  dkim?: DkimConfig | null;
  spf?: SpfConfig | null;
  dmarc?: DmarcConfig | null;
  messageIdDomain?: string;
  customUnsubscribeHeaders?: Record<string, string> | null;
}

export interface DkimConfig {
  domain?: string;
  selector?: string;
  privateKey?: string;
  algorithm?: string;
  canonicalization?: string;
  includeBodyLength?: boolean;
  includeTimestamp?: boolean;
  includeExpiration?: boolean;
}

export interface SpfConfig {
  [key: string]: unknown;
}

export interface DmarcConfig {
  [key: string]: unknown;
}

export interface EmailAddress {
  name?: string;
  address?: string;
}

export interface UnsubscribeInfo {
  url?: string;
  email?: string;
}

export interface EmailMessage {
  from?: string | EmailAddress;
  replyTo?: string | EmailAddress;
  inReplyTo?: string;
  references?: string | string[];
  listUnsubscribe?: string | UnsubscribeInfo;
  priority?: string;
  customHeaders?: Record<string, string>;
}

export interface GeneratedHeaders {
  [key: string]: string;
}

export interface DkimHeaderConfig {
  v: string;
  a: string;
  c: string;
  d: string;
  s: string;
  h: string;
  bh: string;
  b: string;
}

export interface ArcHeaders {
  'ARC-Seal': string;
  'ARC-Message-Signature': string;
  'ARC-Authentication-Results': string;
}

export class EmailHeadersBuilder {
  public options: EmailHeadersOptions;
  public headers: Record<string, string>;
  public customHeaders: Record<string, string>;
  public dkim: DkimConfig | null;
  public spf: SpfConfig | null;
  public dmarc: DmarcConfig | null;
  public messageIdDomain: string;
  public customUnsubscribeHeaders: Record<string, string> | null;

  constructor(options: EmailHeadersOptions = {}) {
    this.options = options;
    this.headers = {};
    this.customHeaders = options.customHeaders || {};
    this.dkim = options.dkim || null;
    this.spf = options.spf || null;
    this.dmarc = options.dmarc || null;
    this.messageIdDomain = options.messageIdDomain || 'example.com';
    this.customUnsubscribeHeaders = options.customUnsubscribeHeaders || null;
  }

  generateHeaders(message: EmailMessage = {}): GeneratedHeaders {
    const headers: GeneratedHeaders = {
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

  generateDkimSignature(_messageData: unknown): string | null {
    if (!this.dkim) {
      return null;
    }

    const {
      domain,
      selector = 'default',
      privateKey,
      algorithm = 'rsa-sha256',
      canonicalization = 'relaxed/relaxed'
    } = this.dkim;

    if (!privateKey) {
      return null;
    }

    const dkimHeader: DkimHeaderConfig = {
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

  generateAuthenticationHeaders(domain?: string): GeneratedHeaders {
    const domainClean = domain || this.messageIdDomain;
    const headers: GeneratedHeaders = {};

    if (this.spf) {
      headers['Received-SPF'] = this._generateSpfHeader(domainClean);
    }

    if (this.dmarc) {
      headers['Authentication-Results'] = this._generateDmarcHeader(domainClean);
    }

    return headers;
  }

  generateArcHeaders(_messageData: unknown): ArcHeaders {
    return {
      'ARC-Seal': this._generateArcSeal(),
      'ARC-Message-Signature': this._generateArcMessageSig(),
      'ARC-Authentication-Results': this._generateArcAuthResults()
    };
  }

  addUnsubscribeLink(unsubscribeUrl: string, oneClickOnly: boolean = false): Record<string, string> {
    this.headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;

    if (!oneClickOnly) {
      this.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    return this.headers;
  }

  addBounceAddress(bounceAddress: string): Record<string, string> {
    this.headers['Return-Path'] = `<${bounceAddress}>`;
    return this.headers;
  }

  addFeedbackLoopHeaders(feedbackEmail: string): Record<string, string> {
    this.headers['Feedback-ID'] = `${this._generateFeedbackId()}:${feedbackEmail}`;
    return this.headers;
  }

  getHeaders(): Record<string, string> {
    return { ...this.headers };
  }

  getHeadersAsString(): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(this.headers)) {
      lines.push(`${key}: ${value}`);
    }
    return lines.join('\n');
  }

  private _formatEmailAddress(email: string | EmailAddress): string {
    if (typeof email === 'string') {
      return email;
    }

    if (email.name && email.address) {
      return `"${email.name}" <${email.address}>`;
    }

    return email.address || String(email);
  }

  private _generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const domain = this.messageIdDomain;
    return `<${timestamp}-${random}@${domain}>`;
  }

  private _generateListUnsubscribe(unsubscribeInfo: string | UnsubscribeInfo): string {
    if (typeof unsubscribeInfo === 'string') {
      return `<${unsubscribeInfo}>`;
    }

    const parts: string[] = [];

    if (unsubscribeInfo.url) {
      parts.push(`<${unsubscribeInfo.url}>`);
    }

    if (unsubscribeInfo.email) {
      parts.push(`<mailto:${unsubscribeInfo.email}>`);
    }

    return parts.join(', ');
  }

  private _buildDkimHeader(dkimConfig: DkimHeaderConfig): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(dkimConfig)) {
      if (value) {
        parts.push(`${key}=${value}`);
      }
    }
    return parts.join(';');
  }

  private _generateSpfHeader(domain: string): string {
    const domainClean = domain || this.messageIdDomain;
    const ip = '203.0.113.1';
    return `pass (${domainClean} designates ${ip} as permitted sender) receiver=example.com`;
  }

  private _generateDmarcHeader(domain: string): string {
    const domainClean = domain || this.messageIdDomain;
    return `dmarc=pass header.from=${domainClean} header.canonical=dns/domain`;
  }

  private _generateArcSeal(): string {
    return `i=1; a=rsa-sha256; t=${Math.floor(Date.now() / 1000)}; cv=none; d=example.com; s=selector; b=`;
  }

  private _generateArcMessageSig(): string {
    return `i=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=selector; bh=; b=`;
  }

  private _generateArcAuthResults(): string {
    return `i=1; spf=pass; dmarc=pass; dkim=pass`;
  }

  private _generateFeedbackId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${timestamp}${random}`;
  }
}

export interface DkimPreset {
  domain: string;
  selector: string;
  algorithm: string;
  canonicalization: string;
}

export const dkimPresets: Record<string, DkimPreset> = {
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
} as const;

export type DmarcAlignmentMode = typeof dmarcAlignmentModes[keyof typeof dmarcAlignmentModes];

export const dmarcPolicies = {
  NONE: 'none',
  QUARANTINE: 'quarantine',
  REJECT: 'reject'
} as const;

export type DmarcPolicy = typeof dmarcPolicies[keyof typeof dmarcPolicies];
