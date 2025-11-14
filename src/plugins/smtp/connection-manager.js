import { ConnectionError, AuthenticationError } from './errors.js';

/**
 * SMTPConnectionManager - Manages both relay and server mode connections
 *
 * Modes:
 * - relay: Connect to external SMTP server (SendGrid, SES, Mailgun, etc.)
 * - server: In-process SMTP server that accepts incoming connections
 */
export class SMTPConnectionManager {
  constructor(options = {}) {
    this.mode = options.mode || 'relay'; // 'relay' or 'server'
    this.options = options;
    this._nodemailer = null;
    this._transport = null;
    this._server = null;
    this._isConnected = false;
  }

  /**
   * Initialize connection (lazy-load nodemailer for relay mode)
   */
  async initialize() {
    if (this._isConnected) return;

    if (this.mode === 'relay') {
      await this._initializeRelay();
    } else if (this.mode === 'server') {
      await this._initializeServer();
    } else {
      throw new Error(`Unsupported SMTP mode: ${this.mode}`);
    }

    this._isConnected = true;
  }

  /**
   * Initialize SMTP relay connection (external SMTP)
   * @private
   */
  async _initializeRelay() {
    try {
      // Lazy load nodemailer
      const nodemailer = await import('nodemailer');
      this._nodemailer = nodemailer;

      const {
        host,
        port = 587,
        secure = false, // false = STARTTLS (587), true = TLS (465)
        auth = {},
        pool = {},
        maxConnections = 5,
        maxMessages = 100,
        rateDelta = 1000,
        rateLimit = 5,
        ...otherConfig
      } = this.options;

      if (!host) {
        throw new Error('SMTP relay requires "host" option');
      }

      // Validate credentials
      if (!auth.user || !auth.pass) {
        throw new AuthenticationError('SMTP relay requires auth.user and auth.pass', {
          suggestion: 'Provide user and password for SMTP relay'
        });
      }

      // Create transport with connection pooling
      this._transport = nodemailer.default.createTransport({
        host,
        port,
        secure,
        auth,
        connectionUrl: null, // Use host/port instead
        pool: {
          maxConnections,
          maxMessages,
          rateDelta,
          rateLimit,
          ...pool
        },
        ...otherConfig
      });

      // Verify connection
      const verified = await this._transport.verify();
      if (!verified) {
        throw new ConnectionError('Failed to verify SMTP relay connection', {
          host,
          port,
          suggestion: 'Check host, port, and credentials'
        });
      }
    } catch (err) {
      if (err instanceof AuthenticationError || err instanceof ConnectionError) {
        throw err;
      }
      throw new ConnectionError(`Failed to initialize SMTP relay: ${err.message}`, {
        originalError: err,
        suggestion: 'Verify SMTP configuration (host, port, auth)'
      });
    }
  }

  /**
   * Initialize SMTP server mode (in-process listener)
   * @private
   */
  async _initializeServer() {
    try {
      // Lazy load simple-smtp-server
      const SMTPServer = await import('smtp-server');
      const server = SMTPServer.SMTPServer;

      const {
        port = 25,
        host = '0.0.0.0',
        secure = false,
        requireAuth = false,
        authHandler = null,
        onMailFrom = null,
        onRcptTo = null,
        onData = null,
        ...otherConfig
      } = this.options;

      // Create SMTP server
      this._server = new server({
        port,
        host,
        secure,
        allowInsecureAuth: !secure, // Allow plaintext auth on non-TLS
        disableReverseLookup: true,
        ...otherConfig,

        // Auth handler
        onAuth: async (auth, session, callback) => {
          if (!requireAuth) {
            return callback(null, { user: 'anonymous' });
          }

          if (authHandler) {
            try {
              const result = await authHandler(auth, session);
              return callback(null, result);
            } catch (err) {
              return callback(new AuthenticationError(err.message));
            }
          }

          callback(new AuthenticationError('Authentication required'));
        },

        // Mail from handler
        onMailFrom: async (address, session, callback) => {
          if (onMailFrom) {
            try {
              await onMailFrom(address, session);
            } catch (err) {
              return callback(err);
            }
          }
          callback();
        },

        // Recipient handler
        onRcptTo: async (address, session, callback) => {
          if (onRcptTo) {
            try {
              await onRcptTo(address, session);
            } catch (err) {
              return callback(err);
            }
          }
          callback();
        },

        // Data handler (email body)
        onData: async (stream, session, callback) => {
          if (onData) {
            try {
              await onData(stream, session);
            } catch (err) {
              return callback(err);
            }
          }
          callback();
        }
      });

      // Start listening
      await new Promise((resolve, reject) => {
        this._server.listen(port, host, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      throw new ConnectionError(`Failed to initialize SMTP server: ${err.message}`, {
        originalError: err,
        suggestion: 'Verify port is available and npm package "smtp-server" is installed'
      });
    }
  }

  /**
   * Send email via relay transport
   * @param {Object} message Email message object
   * @returns {Object} Send result with messageId
   */
  async sendEmail(message) {
    if (!this._isConnected || !this._transport) {
      throw new ConnectionError('SMTP relay not initialized. Call initialize() first');
    }

    try {
      const info = await this._transport.sendMail(message);
      return {
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected
      };
    } catch (err) {
      // Classify error as retryable or permanent
      if (err.code === 'EAUTH' || err.responseCode === 535) {
        throw new AuthenticationError(`SMTP authentication failed: ${err.message}`, {
          originalError: err
        });
      }

      if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
        throw new ConnectionError(`SMTP connection error: ${err.message}`, {
          originalError: err,
          retriable: true
        });
      }

      if (err.responseCode === 429 || err.code === 'RATE_LIMITED') {
        throw new RateLimitError(`SMTP rate limited: ${err.message}`, {
          originalError: err
        });
      }

      // Default: retryable SMTP error
      throw new SMTPError(`SMTP sendMail failed: ${err.message}`, {
        originalError: err,
        retriable: true
      });
    }
  }

  /**
   * Check if connection is alive
   */
  async verify() {
    if (this.mode === 'relay') {
      if (!this._transport) return false;
      try {
        return await this._transport.verify();
      } catch (err) {
        return false;
      }
    } else if (this.mode === 'server') {
      return this._server && this._server.server && !this._server.server.closed;
    }
    return false;
  }

  /**
   * Close connection
   */
  async close() {
    if (this.mode === 'relay' && this._transport) {
      this._transport.close();
      this._transport = null;
    } else if (this.mode === 'server' && this._server) {
      await new Promise((resolve) => {
        this._server.close(() => resolve());
      });
      this._server = null;
    }
    this._isConnected = false;
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      mode: this.mode,
      isConnected: this._isConnected,
      transportType: this._transport ? 'nodemailer' : (this._server ? 'smtp-server' : null)
    };
  }
}

// Import errors for use in this module
import { SMTPError, RateLimitError } from './errors.js';
