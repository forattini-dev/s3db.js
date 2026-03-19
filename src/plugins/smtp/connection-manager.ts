import { Readable } from 'node:stream';
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
) => Promise<void | boolean>;

export type SMTPDataHandler = (
  stream: NodeJS.ReadableStream,
  session: SMTPSession
) => Promise<void | boolean>;

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
  transportType: 'nodemailer' | 'smtp-server' | 'raffel-smtp' | null;
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

interface RaffelRegistry {
  procedure: (name: string, handler: (input: unknown) => unknown | Promise<unknown>) => void;
}

interface RaffelRouter {}

interface RaffelSmtpAdapter {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  server: { listening?: boolean } | null;
}

interface RaffelModule {
  createRegistry: () => RaffelRegistry;
  createRouter: (registry: RaffelRegistry) => RaffelRouter;
  createSmtpAdapter: (router: RaffelRouter, options: Record<string, unknown>) => RaffelSmtpAdapter;
}

interface ServerTransport {
  kind: 'smtp-server' | 'raffel-smtp';
  close: () => Promise<void>;
  verify: () => boolean;
}

export class SMTPConnectionManager {
  public mode: SMTPMode;
  public options: SMTPConnectionOptions;
  private _nodemailer: NodemailerModule | null;
  private _transport: NodemailerTransport | null;
  private _serverTransport: ServerTransport | null;
  private _isConnected: boolean;

  constructor(options: SMTPConnectionOptions = {}) {
    this.mode = options.mode || 'relay';
    this.options = options;
    this._nodemailer = null;
    this._transport = null;
    this._serverTransport = null;
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
    const {
      secure = false,
      requireAuth = false,
      authHandler = null,
      onMailFrom = null,
      onRcptTo = null,
      onData = null
    } = this.options;

    if (!onMailFrom) {
      const initialized = await this._initializeRaffelServer({
        secure,
        requireAuth,
        authHandler,
        onRcptTo,
        onData
      });
      if (initialized) {
        return;
      }
    }

    await this._initializeLegacyServer();
  }

  private async _initializeRaffelServer(options: {
    secure: boolean;
    requireAuth: boolean;
    authHandler: SMTPAuthHandler | null;
    onRcptTo: SMTPAddressHandler | null;
    onData: SMTPDataHandler | null;
  }): Promise<boolean> {
    try {
      const raffel = await import('raffel') as unknown as RaffelModule;
      const registry = raffel.createRegistry();
      const router = raffel.createRouter(registry);

      const {
        port = 25,
        host = '0.0.0.0',
        secure,
        requireAuth,
        authHandler,
        onRcptTo,
        onData
      } = {
        ...this.options,
        ...options
      };

      registry.procedure('mail.receive', async (input: unknown) => {
        const payload = (input || {}) as {
          sender?: string;
          recipients?: string[];
          rawMessage?: string;
          headers?: Record<string, string>;
          body?: string;
          size?: number;
          authenticated?: boolean;
          authenticatedUser?: string;
          tlsActive?: boolean;
          smtpUtf8?: boolean;
          bodyType?: string;
        };

        if (onData) {
          const stream = Readable.from([payload.rawMessage || '']);
          const accepted = await onData(stream, {
            sender: payload.sender || null,
            recipients: payload.recipients || [],
            headers: payload.headers || {},
            body: payload.body || '',
            size: payload.size || 0,
            authenticated: payload.authenticated || false,
            authenticatedUser: payload.authenticatedUser,
            tlsActive: payload.tlsActive || false,
            smtpUtf8: payload.smtpUtf8 || false,
            bodyType: payload.bodyType || '7BIT'
          });

          if (accepted === false) {
            return { rejected: true, message: 'Message rejected by onData handler' };
          }
        }

        return { queued: true };
      });

      const adapter = raffel.createSmtpAdapter(router, {
        port,
        host,
        requireAuth,
        authRequiresTls: secure,
        authVerifier: authHandler ? async (
          username: string,
          password: string,
          info: { remoteAddress: string; remotePort: number; tlsActive: boolean }
        ) => {
          try {
            const result = await authHandler(
              { user: username, pass: password, username, password } as SMTPAuth,
              info as unknown as SMTPSession
            );
            return Boolean(result?.user);
          } catch {
            return false;
          }
        } : undefined,
        recipientValidator: onRcptTo ? async (
          recipient: string,
          sender: string,
          info: { remoteAddress: string; authenticated: boolean; authenticatedUser?: string }
        ) => {
          try {
            const result = await onRcptTo(
              { address: recipient },
              { sender, ...info } as unknown as SMTPSession
            ) as unknown;
            return result !== false;
          } catch (err) {
            throw err as Error;
          }
        } : undefined
      });

      await adapter.start();

      this._serverTransport = {
        kind: 'raffel-smtp',
        close: async () => {
          await adapter.stop();
        },
        verify: () => Boolean(adapter.server)
      };

      return true;
    } catch {
      return false;
    }
  }

  private async _initializeLegacyServer(): Promise<void> {
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

      const server = new ServerClass({
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
              const accepted = await onMailFrom(address, session);
              if (accepted === false) {
                return callback(new SMTPError('Sender rejected by onMailFrom handler', {
                  retriable: false
                }));
              }
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
              const accepted = await onRcptTo(address, session);
              if (accepted === false) {
                return callback(new SMTPError('Recipient rejected by onRcptTo handler', {
                  retriable: false
                }));
              }
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
              const accepted = await onData(stream, session);
              if (accepted === false) {
                return callback(new SMTPError('Message rejected by onData handler', {
                  retriable: false
                }));
              }
            } catch (err) {
              return callback(err as Error);
            }
          }
          callback();
        }
      });

      await new Promise<void>((resolve, reject) => {
        server.listen(port as number, host as string, (err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this._serverTransport = {
        kind: 'smtp-server',
        close: async () => {
          await new Promise<void>((resolve) => {
            server.close(() => resolve());
          });
        },
        verify: () => !!(server && server.server && !server.server.closed)
      };
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
      return this._serverTransport?.verify() ?? false;
    }
    return false;
  }

  async close(): Promise<void> {
    if (this.mode === 'relay' && this._transport) {
      this._transport.close();
      this._transport = null;
    } else if (this.mode === 'server' && this._serverTransport) {
      await this._serverTransport.close();
      this._serverTransport = null;
    }
    this._isConnected = false;
  }

  getStatus(): ConnectionStatus {
    return {
      mode: this.mode,
      isConnected: this._isConnected,
      transportType: this._transport ? 'nodemailer' : (this._serverTransport?.kind ?? null)
    };
  }
}
