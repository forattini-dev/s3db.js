import { ConnectionError, AuthenticationError } from '../errors.js';

export interface SMTPAuth {
  user?: string | ((config: DriverConfig) => string);
  pass?: string | ((config: DriverConfig) => string);
}

export interface ProviderConfig {
  host: string | ((config: DriverConfig) => string);
  port: number;
  secure: boolean;
  auth: SMTPAuth;
}

export interface DriverConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user?: string;
    pass?: string;
  };
  apiKey?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  domain?: string;
  serverToken?: string;
  email?: string;
  appPassword?: string;
  maxConnections?: number;
  maxMessages?: number;
  rateDelta?: number;
  rateLimit?: number;
  [key: string]: unknown;
}

export interface DriverOptions {
  [key: string]: unknown;
}

export interface EmailData {
  from?: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  body?: string;
  html?: string;
  attachments?: unknown[];
}

export interface SendResult {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
  pending?: string[];
}

export interface DriverInfo {
  name: string;
  initialized: boolean;
  host: string | null;
}

interface SMTPConfig {
  host: string | null;
  port: number;
  secure: boolean;
  auth: {
    user?: string;
    pass?: string;
  };
  pool?: {
    maxConnections: number;
    maxMessages: number;
    rateDelta: number;
    rateLimit: number;
  };
}

interface NodemailerModule {
  default: {
    createTransport: (options: unknown) => NodemailerTransport;
  };
}

interface NodemailerTransport {
  verify: () => Promise<boolean>;
  sendMail: (message: unknown) => Promise<NodemailerSendResult>;
  close: () => Promise<void>;
  transporter?: {
    options?: {
      host?: string;
    };
  };
}

interface NodemailerSendResult {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
  pending?: string[];
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  'sendgrid': {
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey'
    }
  },
  'aws-ses': {
    host: (config: DriverConfig) => `email-smtp.${config.region || 'us-east-1'}.amazonaws.com`,
    port: 587,
    secure: false,
    auth: {
      user: (config: DriverConfig) => config.accessKeyId || '',
      pass: (config: DriverConfig) => config.secretAccessKey || ''
    }
  },
  'mailgun': {
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    auth: {
      user: (config: DriverConfig) => `postmaster@${config.domain}`,
      pass: (config: DriverConfig) => config.apiKey || ''
    }
  },
  'postmark': {
    host: 'smtp.postmarkapp.com',
    port: 587,
    secure: false,
    auth: {
      user: (config: DriverConfig) => config.serverToken || '',
      pass: (config: DriverConfig) => config.serverToken || ''
    }
  },
  'gmail': {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: (config: DriverConfig) => config.email || '',
      pass: (config: DriverConfig) => config.appPassword || ''
    }
  }
};

export class SMTPRelayDriver {
  public name: string;
  public config: DriverConfig;
  public options: DriverOptions;
  private _transport: NodemailerTransport | null;
  private _nodemailer: NodemailerModule | null;
  private _isInitialized: boolean;

  constructor(driverName: string, config: DriverConfig = {}, options: DriverOptions = {}) {
    this.name = driverName;
    this.config = config;
    this.options = options;
    this._transport = null;
    this._nodemailer = null;
    this._isInitialized = false;
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    try {
      // @ts-ignore - nodemailer has no type declarations
      const nodemailer = await import('nodemailer') as NodemailerModule;
      this._nodemailer = nodemailer;

      const smtpConfig = this._buildSmtpConfig();

      this._transport = nodemailer.default.createTransport(smtpConfig);

      const verified = await this._transport.verify();
      if (!verified) {
        throw new ConnectionError(
          `Failed to verify SMTP connection for driver "${this.name}"`,
          {
            driver: this.name,
            host: smtpConfig.host,
            port: smtpConfig.port,
            suggestion: 'Check credentials and SMTP server configuration'
          } as Record<string, unknown>
        );
      }

      this._isInitialized = true;
    } catch (err) {
      if (err instanceof ConnectionError || err instanceof AuthenticationError) {
        throw err;
      }
      throw new ConnectionError(
        `Failed to initialize SMTP driver "${this.name}": ${(err as Error).message}`,
        {
          originalError: err as Error,
          driver: this.name
        } as Record<string, unknown>
      );
    }
  }

  private _buildSmtpConfig(): SMTPConfig {
    let smtpConfig: SMTPConfig = {
      host: null,
      port: 587,
      secure: false,
      auth: {}
    };

    if (PROVIDER_CONFIGS[this.name]) {
      const providerConfig = PROVIDER_CONFIGS[this.name]!;

      smtpConfig = {
        ...smtpConfig,
        host: typeof providerConfig.host === 'function'
          ? providerConfig.host(this.config)
          : providerConfig.host,
        port: providerConfig.port,
        secure: providerConfig.secure,
        auth: {}
      };

      if (providerConfig.auth) {
        for (const [key, value] of Object.entries(providerConfig.auth)) {
          (smtpConfig.auth as Record<string, string>)[key] = typeof value === 'function'
            ? value(this.config)
            : (this.config[value as string] as string);
        }
      }

      if (this.config.port) smtpConfig.port = this.config.port;
      if (this.config.secure !== undefined) smtpConfig.secure = this.config.secure;

      if (this.name === 'sendgrid' && this.config.apiKey) {
        smtpConfig.auth.pass = this.config.apiKey;
      }
    } else {
      if (this.name !== 'smtp') {
        throw new Error(`Unknown SMTP driver: "${this.name}"`);
      }

      smtpConfig = {
        host: this.config.host || null,
        port: this.config.port || 587,
        secure: this.config.secure !== undefined ? this.config.secure : false,
        auth: this.config.auth || {}
      };

      if (!smtpConfig.host) {
        throw new Error('Custom SMTP relay requires "host" in config');
      }
    }

    if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
      throw new AuthenticationError(
        `SMTP driver "${this.name}" requires authentication credentials`,
        {
          driver: this.name,
          suggestion: `Check config object for ${this.name}`
        } as Record<string, unknown>
      );
    }

    return {
      ...smtpConfig,
      pool: {
        maxConnections: this.config.maxConnections || 5,
        maxMessages: this.config.maxMessages || 100,
        rateDelta: this.config.rateDelta || 1000,
        rateLimit: this.config.rateLimit || 5
      }
    };
  }

  async sendEmail(emailData: EmailData): Promise<SendResult> {
    if (!this._isInitialized) {
      throw new Error('Driver not initialized');
    }

    try {
      const result = await this._transport!.sendMail({
        from: emailData.from,
        to: emailData.to,
        cc: emailData.cc,
        bcc: emailData.bcc,
        subject: emailData.subject,
        text: emailData.body,
        html: emailData.html,
        attachments: emailData.attachments
      });

      return {
        messageId: result.messageId,
        response: result.response,
        accepted: result.accepted,
        rejected: result.rejected,
        pending: result.pending
      };
    } catch (err) {
      throw new ConnectionError(
        `Failed to send email via ${this.name}: ${(err as Error).message}`,
        {
          driver: this.name,
          originalError: err as Error
        } as Record<string, unknown>
      );
    }
  }

  async close(): Promise<void> {
    if (this._transport) {
      await this._transport.close();
      this._transport = null;
      this._isInitialized = false;
    }
  }

  getInfo(): DriverInfo {
    return {
      name: this.name,
      initialized: this._isInitialized,
      host: this._transport?.transporter?.options?.host || null
    };
  }
}
