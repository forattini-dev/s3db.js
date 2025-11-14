/**
 * SMTP Relay Driver
 * Unified interface for sending emails via any SMTP server or email provider
 *
 * Supports:
 * - Custom SMTP servers (host/port/auth)
 * - SendGrid, AWS SES, Mailgun, Postmark, Gmail
 */

import { ConnectionError, AuthenticationError } from '../errors.js';

// Provider-specific SMTP configurations
const PROVIDER_CONFIGS = {
  'sendgrid': {
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      // pass comes from config.apiKey
    }
  },
  'aws-ses': {
    host: (config) => `email-smtp.${config.region || 'us-east-1'}.amazonaws.com`,
    port: 587,
    secure: false,
    auth: {
      user: (config) => config.accessKeyId,
      pass: (config) => config.secretAccessKey
    }
  },
  'mailgun': {
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    auth: {
      user: (config) => `postmaster@${config.domain}`,
      pass: (config) => config.apiKey
    }
  },
  'postmark': {
    host: 'smtp.postmarkapp.com',
    port: 587,
    secure: false,
    auth: {
      user: (config) => config.serverToken,
      pass: (config) => config.serverToken
    }
  },
  'gmail': {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: (config) => config.email,
      pass: (config) => config.appPassword // or oauth2 token
    }
  }
};

export class SMTPRelayDriver {
  constructor(driverName, config = {}, options = {}) {
    this.name = driverName;
    this.config = config;
    this.options = options;
    this._transport = null;
    this._nodemailer = null;
    this._isInitialized = false;
  }

  /**
   * Initialize the driver
   */
  async initialize() {
    if (this._isInitialized) return;

    try {
      // Lazy load nodemailer
      const nodemailer = await import('nodemailer');
      this._nodemailer = nodemailer;

      // Build SMTP configuration
      const smtpConfig = this._buildSmtpConfig();

      // Create transport
      this._transport = nodemailer.default.createTransport(smtpConfig);

      // Verify connection
      const verified = await this._transport.verify();
      if (!verified) {
        throw new ConnectionError(
          `Failed to verify SMTP connection for driver "${this.name}"`,
          {
            driver: this.name,
            host: smtpConfig.host,
            port: smtpConfig.port,
            suggestion: 'Check credentials and SMTP server configuration'
          }
        );
      }

      this._isInitialized = true;
    } catch (err) {
      if (err instanceof ConnectionError || err instanceof AuthenticationError) {
        throw err;
      }
      throw new ConnectionError(
        `Failed to initialize SMTP driver "${this.name}": ${err.message}`,
        {
          originalError: err,
          driver: this.name
        }
      );
    }
  }

  /**
   * Build SMTP configuration from driver name and config
   * @private
   */
  _buildSmtpConfig() {
    let smtpConfig = {
      host: null,
      port: 587,
      secure: false,
      auth: {}
    };

    // Check if provider-specific config exists
    if (PROVIDER_CONFIGS[this.name]) {
      const providerConfig = PROVIDER_CONFIGS[this.name];

      // Merge provider defaults
      smtpConfig = {
        ...smtpConfig,
        host: typeof providerConfig.host === 'function'
          ? providerConfig.host(this.config)
          : providerConfig.host,
        port: providerConfig.port,
        secure: providerConfig.secure,
        auth: {}
      };

      // Build auth
      if (providerConfig.auth) {
        Object.entries(providerConfig.auth).forEach(([key, value]) => {
          smtpConfig.auth[key] = typeof value === 'function'
            ? value(this.config)
            : this.config[value];
        });
      }

      // Override with custom config values
      if (this.config.port) smtpConfig.port = this.config.port;
      if (this.config.secure !== undefined) smtpConfig.secure = this.config.secure;

      // Handle SendGrid special case
      if (this.name === 'sendgrid' && this.config.apiKey) {
        smtpConfig.auth.pass = this.config.apiKey;
      }
    } else {
      // Custom SMTP server (driver name should be 'smtp')
      if (this.name !== 'smtp') {
        throw new Error(`Unknown SMTP driver: "${this.name}"`);
      }

      // Use config as-is for custom SMTP
      smtpConfig = {
        host: this.config.host,
        port: this.config.port || 587,
        secure: this.config.secure !== undefined ? this.config.secure : false,
        auth: this.config.auth || {}
      };

      if (!smtpConfig.host) {
        throw new Error('Custom SMTP relay requires "host" in config');
      }
    }

    // Validate we have auth credentials
    if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
      throw new AuthenticationError(
        `SMTP driver "${this.name}" requires authentication credentials`,
        {
          driver: this.name,
          suggestion: `Check config object for ${this.name}`
        }
      );
    }

    // Add connection pooling defaults
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

  /**
   * Send email via this driver
   */
  async sendEmail(emailData) {
    if (!this._isInitialized) {
      throw new Error('Driver not initialized');
    }

    try {
      const result = await this._transport.sendMail({
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
        `Failed to send email via ${this.name}: ${err.message}`,
        {
          driver: this.name,
          originalError: err
        }
      );
    }
  }

  /**
   * Close driver connection
   */
  async close() {
    if (this._transport) {
      await this._transport.close();
      this._transport = null;
      this._isInitialized = false;
    }
  }

  /**
   * Get driver info
   */
  getInfo() {
    return {
      name: this.name,
      initialized: this._isInitialized,
      host: this._transport?.transporter?.options?.host || null
    };
  }
}
