/**
 * Email Service for Identity Provider
 * Handles email sending via SMTP with template support
 */

/**
 * Email Service class
 * @class
 */
import { PluginError } from '../../errors.js';

export class EmailService {
  /**
   * Create Email Service instance
   * @param {Object} options - Email service configuration
   */
  constructor(options = {}) {
    this.config = {
      enabled: options.enabled !== false,
      from: options.from || 'noreply@s3db.identity',
      replyTo: options.replyTo || null,

      // SMTP configuration
      smtp: {
        host: options.smtp?.host || 'localhost',
        port: options.smtp?.port || 587,
        secure: options.smtp?.secure || false, // true for 465, false for other ports
        auth: {
          user: options.smtp?.auth?.user || '',
          pass: options.smtp?.auth?.pass || ''
        },
        // Optional TLS options
        tls: {
          rejectUnauthorized: options.smtp?.tls?.rejectUnauthorized !== false
        }
      },

      // Template configuration
      templates: {
        baseUrl: options.templates?.baseUrl || 'http://localhost:4000',
        brandName: options.templates?.brandName || 'S3DB Identity',
        brandLogo: options.templates?.brandLogo || null,
        brandColor: options.templates?.brandColor || '#007bff',
        supportEmail: options.templates?.supportEmail || null,
        customFooter: options.templates?.customFooter || null
      },

      verbose: options.verbose || false
    };

    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialize email service (lazy initialization)
   * @private
   */
  async _initialize() {
    if (this.initialized || !this.config.enabled) {
      return;
    }

    try {
      // Dynamic import of nodemailer
      const nodemailer = await import('nodemailer');

      // Create SMTP transporter
      this.transporter = nodemailer.default.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        auth: this.config.smtp.auth,
        tls: this.config.smtp.tls
      });

      // Verify connection
      if (this.config.verbose) {
        await this.transporter.verify();
        this.logger.info('[EmailService] SMTP connection verified');
      }

      this.initialized = true;
    } catch (error) {
      this.logger.error('[EmailService] Failed to initialize:', error);
      throw new PluginError(`Failed to initialize email service: ${error.message}`, {
        pluginName: 'IdentityPlugin',
        operation: 'emailInitialize',
        statusCode: 502,
        retriable: true,
        suggestion: 'Verify SMTP credentials/host settings or disable email service when not configured.',
        original: error
      });
    }
  }

  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML email body
   * @param {string} [options.text] - Plain text email body (fallback)
   * @param {string} [options.from] - Override sender address
   * @param {string} [options.replyTo] - Reply-to address
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(options) {
    if (!this.config.enabled) {
      if (this.config.verbose) {
        this.logger.info('[EmailService] Email service disabled, skipping send');
      }
      return { success: false, reason: 'disabled' };
    }

    // Initialize if needed
    if (!this.initialized) {
      await this._initialize();
    }

    const { to, subject, html, text, from, replyTo } = options;

    if (!to || !subject || !html) {
      throw new PluginError('Email requires to, subject, and html fields', {
        pluginName: 'IdentityPlugin',
        operation: 'sendEmail',
        statusCode: 400,
        retriable: false,
        suggestion: 'Pass recipient (to), subject, and html body when calling emailService.sendEmail().'
      });
    }

    try {
      const info = await this.transporter.sendMail({
        from: from || this.config.from,
        to,
        subject,
        text: text || this._htmlToText(html),
        html,
        replyTo: replyTo || this.config.replyTo
      });

      if (this.config.verbose) {
        this.logger.info('[EmailService] Email sent successfully:', info.messageId);
      }

      return {
        success: true,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected
      };
    } catch (error) {
      this.logger.error('[EmailService] Failed to send email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert HTML to plain text (simple implementation)
   * @param {string} html - HTML content
   * @returns {string} Plain text
   * @private
   */
  _htmlToText(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Base email template wrapper
   * @param {Object} options - Template options
   * @param {string} options.title - Email title
   * @param {string} options.preheader - Email preheader (preview text)
   * @param {string} options.content - Email content (HTML)
   * @returns {string} HTML email
   * @private
   */
  _baseTemplate({ title, preheader, content }) {
    const { brandName, brandLogo, brandColor, supportEmail, customFooter } = this.config.templates;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f4f4f4;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .email-header {
      background-color: ${brandColor};
      padding: 30px 20px;
      text-align: center;
    }
    .email-header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 24px;
    }
    .email-body {
      padding: 40px 20px;
    }
    .email-footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #6c757d;
      border-top: 1px solid #dee2e6;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background-color: ${brandColor};
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 500;
      margin: 20px 0;
    }
    .button:hover {
      background-color: ${brandColor}dd;
    }
    .info-box {
      background-color: #f8f9fa;
      border-left: 4px solid ${brandColor};
      padding: 15px;
      margin: 20px 0;
    }
    .preheader {
      display: none;
      font-size: 1px;
      color: #ffffff;
      line-height: 1px;
      max-height: 0;
      max-width: 0;
      opacity: 0;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <span class="preheader">${preheader || ''}</span>
  <div class="email-wrapper">
    <div class="email-header">
      ${brandLogo ? `<img src="${brandLogo}" alt="${brandName}" height="40" style="margin-bottom: 10px;">` : ''}
      <h1>${brandName}</h1>
    </div>
    <div class="email-body">
      ${content}
    </div>
    <div class="email-footer">
      ${customFooter || `
        <p>This email was sent from ${brandName}</p>
        ${supportEmail ? `<p>Need help? Contact us at <a href="mailto:${supportEmail}">${supportEmail}</a></p>` : ''}
        <p>&copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
      `}
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Send password reset email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.name - Recipient name
   * @param {string} options.resetToken - Password reset token
   * @param {number} [options.expiresIn] - Token expiration in minutes (default: 60)
   * @returns {Promise<Object>} Send result
   */
  async sendPasswordResetEmail({ to, name, resetToken, expiresIn = 60 }) {
    const { baseUrl } = this.config.templates;
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

    const content = `
      <h2>Password Reset Request</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
      <p>To reset your password, click the button below:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <div class="info-box">
        <p><strong>⏰ This link will expire in ${expiresIn} minutes.</strong></p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      </div>
      <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
      <p>Best regards,<br>The ${this.config.templates.brandName} Team</p>
    `;

    const html = this._baseTemplate({
      title: 'Reset Your Password',
      preheader: 'Click here to reset your password',
      content
    });

    return this.sendEmail({
      to,
      subject: 'Reset Your Password',
      html
    });
  }

  /**
   * Send email verification email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.name - Recipient name
   * @param {string} options.verificationToken - Email verification token
   * @param {number} [options.expiresIn] - Token expiration in hours (default: 24)
   * @returns {Promise<Object>} Send result
   */
  async sendEmailVerificationEmail({ to, name, verificationToken, expiresIn = 24 }) {
    const { baseUrl } = this.config.templates;
    const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    const content = `
      <h2>Verify Your Email Address</h2>
      <p>Hi ${name},</p>
      <p>Thank you for creating an account with ${this.config.templates.brandName}! To complete your registration, please verify your email address.</p>
      <p style="text-align: center;">
        <a href="${verifyUrl}" class="button">Verify Email Address</a>
      </p>
      <div class="info-box">
        <p><strong>⏰ This link will expire in ${expiresIn} hours.</strong></p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all;"><a href="${verifyUrl}">${verifyUrl}</a></p>
      </div>
      <p>If you didn't create an account with us, you can safely ignore this email.</p>
      <p>Welcome aboard!<br>The ${this.config.templates.brandName} Team</p>
    `;

    const html = this._baseTemplate({
      title: 'Verify Your Email',
      preheader: 'Verify your email address to get started',
      content
    });

    return this.sendEmail({
      to,
      subject: 'Verify Your Email Address',
      html
    });
  }

  /**
   * Send welcome email after successful registration
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.name - Recipient name
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeEmail({ to, name }) {
    const { baseUrl } = this.config.templates;

    const content = `
      <h2>Welcome to ${this.config.templates.brandName}!</h2>
      <p>Hi ${name},</p>
      <p>Your account is now active and you're ready to get started.</p>
      <p style="text-align: center;">
        <a href="${baseUrl}/profile" class="button">Go to Your Profile</a>
      </p>
      <p>If you have any questions or need help, don't hesitate to reach out to our support team.</p>
      <p>Best regards,<br>The ${this.config.templates.brandName} Team</p>
    `;

    const html = this._baseTemplate({
      title: 'Welcome!',
      preheader: 'Your account is ready',
      content
    });

    return this.sendEmail({
      to,
      subject: `Welcome to ${this.config.templates.brandName}!`,
      html
    });
  }

  /**
   * Test email service connection
   * @returns {Promise<boolean>} True if connection is valid
   */
  async testConnection() {
    if (!this.config.enabled) {
      return false;
    }

    try {
      await this._initialize();
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('[EmailService] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Close transporter connection
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      this.initialized = false;
    }
  }
}

export default EmailService;
