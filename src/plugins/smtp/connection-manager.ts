import { ConnectionError, AuthenticationError, SMTPError, RateLimitError } from './errors.js';

export type SMTPMode = 'relay' | 'server';

export interface SMTPAuth {
  user?: string;
  pass?: string;
}

export interface SMTPPoolOptions {
  maxConnections?: number;
  maxMessages?: number;
  rateDelta?: number;
  rateLimit?: number;
  [key: string]: unknown;
}

export interface SMTPSession {
  [key: string]: unknown;
}

export interface SMTPAuthResult {
  user: string;
  [key: string]: unknown;
}

export type SMTPAuthHandler = (
  auth: SMTPAuth,
  session: SMTPSession
) => Promise<SMTPAuthResult>;

export type SMTPAddressHandler = (
  address: { address: string },
  session: SMTPSession
) => Promise<void>;

export type SMTPDataHandler = (
  stream: NodeJS.ReadableStream,
  session: SMTPSession
) => Promise<void>;

export interface SMTPConnectionOptions {
  mode?: SMTPMode;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: SMTPAuth;
  pool?: SMTPPoolOptions;
  maxConnections?: number;
  maxMessages?: number;
  rateDelta?: number;
  rateLimit?: number;
  requireAuth?: boolean;
  authHandler?: SMTPAuthHandler | null;
  onMailFrom?: SMTPAddressHandler | null;
  onRcptTo?: SMTPAddressHandler | null;
  onData?: SMTPDataHandler | null;
  [key: string]: unknown;
}

export interface EmailMessage {
  from?: string;
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  attachments?: unknown[];
  [key: string]: unknown;
}

export interface SendResult {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
}

export interface ConnectionStatus {
  mode: SMTPMode;
  isConnected: boolean;
  transportType: 'nodemailer' | 'smtp-server' | null;
}

interface NodemailerModule {
  default: {
    createTransport: (options: unknown) => NodemailerTransport;
  };
}

interface NodemailerTransport {
  verify: () => Promise<boolean>;
  sendMail: (message: unknown) => Promise<NodemailerSendResult>;
  close: () => void;
}

interface NodemailerSendResult {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
}

interface SMTPServerModule {
  SMTPServer: new (options: unknown) => SMTPServerInstance;
}

interface SMTPServerInstance {
  listen: (port: number, host: string, callback: (err?: Error) => void) => void;
  close: (callback: () => void) => void;
  server?: { closed?: boolean };
}

export class SMTPConnectionManager {
  public mode: SMTPMode;
  public options: SMTPConnectionOptions;
  private _nodemailer: NodemailerModule | null;
  private _transport: NodemailerTransport | null;
  private _server: SMTPServerInstance | null;
  private _isConnected: boolean;

  constructor(options: SMTPConnectionOptions = {}) {
    this.mode = options.mode || 'relay';
    this.options = options;
    this._nodemailer = null;
    this._transport = null;
    this._server = null;
    this._isConnected = false;
  }

  async initialize(): Promise<void> {
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

  private async _initializeRelay(): Promise<void> {
    try {
      // @ts-ignore - nodemailer has no type declarations
      const nodemailer = await import('nodemailer') as NodemailerModule;
      this._nodemailer = nodemailer;

      const {
        host,
        port = 587,
        secure = false,
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

      if (!auth.user || !auth.pass) {
        throw new AuthenticationError('SMTP relay requires auth.user and auth.pass', {
          suggestion: 'Provide user and password for SMTP relay'
        });
      }

      this._transport = nodemailer.default.createTransport({
        host,
        port,
        secure,
        auth,
        connectionUrl: null,
        pool: {
          maxConnections,
          maxMessages,
          rateDelta,
          rateLimit,
          ...pool
        },
        ...otherConfig
      });

      const verified = await this._transport.verify();
      if (!verified) {
        throw new ConnectionError('Failed to verify SMTP relay connection', {
          host,
          port,
          suggestion: 'Check host, port, and credentials'
        } as Record<string, unknown>);
      }
    } catch (err) {
      if (err instanceof AuthenticationError || err instanceof ConnectionError) {
        throw err;
      }
      throw new ConnectionError(`Failed to initialize SMTP relay: ${(err as Error).message}`, {
        originalError: err as Error,
        suggestion: 'Verify SMTP configuration (host, port, auth)'
      });
    }
  }

  private async _initializeServer(): Promise<void> {
    try {
      const SMTPServer = await import('smtp-server') as SMTPServerModule;
      const ServerClass = SMTPServer.SMTPServer;

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

      this._server = new ServerClass({
        port,
        host,
        secure,
        allowInsecureAuth: !secure,
        disableReverseLookup: true,
        ...otherConfig,

        onAuth: async (
          auth: SMTPAuth,
          session: SMTPSession,
          callback: (err: Error | null, result?: SMTPAuthResult) => void
        ) => {
          if (!requireAuth) {
            return callback(null, { user: 'anonymous' });
          }

          if (authHandler) {
            try {
              const result = await authHandler(auth, session);
              return callback(null, result);
            } catch (err) {
              return callback(new AuthenticationError((err as Error).message));
            }
          }

          callback(new AuthenticationError('Authentication required'));
        },

        onMailFrom: async (
          address: { address: string },
          session: SMTPSession,
          callback: (err?: Error) => void
        ) => {
          if (onMailFrom) {
            try {
              await onMailFrom(address, session);
            } catch (err) {
              return callback(err as Error);
            }
          }
          callback();
        },

        onRcptTo: async (
          address: { address: string },
          session: SMTPSession,
          callback: (err?: Error) => void
        ) => {
          if (onRcptTo) {
            try {
              await onRcptTo(address, session);
            } catch (err) {
              return callback(err as Error);
            }
          }
          callback();
        },

        onData: async (
          stream: NodeJS.ReadableStream,
          session: SMTPSession,
          callback: (err?: Error) => void
        ) => {
          if (onData) {
            try {
              await onData(stream, session);
            } catch (err) {
              return callback(err as Error);
            }
          }
          callback();
        }
      });

      await new Promise<void>((resolve, reject) => {
        this._server!.listen(port as number, host as string, (err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      throw new ConnectionError(`Failed to initialize SMTP server: ${(err as Error).message}`, {
        originalError: err as Error,
        suggestion: 'Verify port is available and npm package "smtp-server" is installed'
      });
    }
  }

  async sendEmail(message: EmailMessage): Promise<SendResult> {
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
      const error = err as Error & { code?: string; responseCode?: number };

      if (error.code === 'EAUTH' || error.responseCode === 535) {
        throw new AuthenticationError(`SMTP authentication failed: ${error.message}`, {
          originalError: error
        });
      }

      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        throw new ConnectionError(`SMTP connection error: ${error.message}`, {
          originalError: error,
          retriable: true
        });
      }

      if (error.responseCode === 429 || error.code === 'RATE_LIMITED') {
        throw new RateLimitError(`SMTP rate limited: ${error.message}`, {
          originalError: error
        });
      }

      throw new SMTPError(`SMTP sendMail failed: ${error.message}`, {
        originalError: error,
        retriable: true
      });
    }
  }

  async verify(): Promise<boolean> {
    if (this.mode === 'relay') {
      if (!this._transport) return false;
      try {
        return await this._transport.verify();
      } catch (_err) {
        return false;
      }
    } else if (this.mode === 'server') {
      return !!(this._server && this._server.server && !this._server.server.closed);
    }
    return false;
  }

  async close(): Promise<void> {
    if (this.mode === 'relay' && this._transport) {
      this._transport.close();
      this._transport = null;
    } else if (this.mode === 'server' && this._server) {
      await new Promise<void>((resolve) => {
        this._server!.close(() => resolve());
      });
      this._server = null;
    }
    this._isConnected = false;
  }

  getStatus(): ConnectionStatus {
    return {
      mode: this.mode,
      isConnected: this._isConnected,
      transportType: this._transport ? 'nodemailer' : (this._server ? 'smtp-server' : null)
    };
  }
}
