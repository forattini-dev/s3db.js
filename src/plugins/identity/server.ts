/**
 * Identity Server - Hono-based HTTP server for Identity Provider Plugin
 *
 * Manages OAuth2/OIDC endpoints only (no CRUD routes)
 */

import { errorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import {
  createCorsMiddleware,
  createSecurityMiddleware,
  createLoggingMiddleware
} from '../shared/middlewares/index.js';
import { idGenerator } from '../../concerns/id.js';
import { createJsonRateLimitMiddleware, RateLimiter } from './concerns/rate-limit.js';
import type { Context as HonoContext, Hono as HonoApp } from 'hono';

export interface IdentityServerOptions {
  port?: number;
  host?: string;
  logLevel?: string;
  issuer?: string;
  oauth2Server?: OAuth2ServerInstance;
  sessionManager?: SessionManagerInstance | null;
  usersResource?: any;
  identityPlugin?: IdentityPluginInstance | null;
  failbanManager?: FailbanManagerInstance | null;
  failbanConfig?: FailbanConfig;
  cors?: CorsConfig;
  security?: SecurityConfig;
  logging?: LoggingConfig;
  logger?: Logger;
}

export interface CorsConfig {
  enabled?: boolean;
  origin?: string;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface SecurityConfig {
  enabled?: boolean;
  contentSecurityPolicy?: Record<string, any>;
}

export interface LoggingConfig {
  enabled?: boolean;
  format?: string;
}

export interface FailbanConfig {
  enabled?: boolean;
  geo?: {
    enabled?: boolean;
  };
}

interface Logger {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (arg1: any, arg2?: any) => void;
}

interface OAuth2ServerInstance {
  discoveryHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  jwksHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  tokenHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  userinfoHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  introspectHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  authorizeHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  authorizePostHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  registerClientHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
  revokeHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
}

interface SessionManagerInstance {
  // Session manager interface
}

interface IdentityPluginInstance {
  getOnboardingStatus?: () => Promise<OnboardingStatus>;
  getIntegrationMetadata: () => IntegrationMetadata;
  rateLimiters?: Record<string, RateLimiter>;
}

interface OnboardingStatus {
  completed: boolean;
  adminExists: boolean;
  mode?: string;
  completedAt?: string;
}

interface IntegrationMetadata {
  cacheTtl: number;
  issuedAt: string;
  [key: string]: any;
}

interface FailbanManagerInstance {
  isBlacklisted: (ip: string) => boolean;
  checkCountryBlock: (ip: string) => { country: string; reason: string } | null;
  isBanned: (ip: string) => boolean;
  getBan: (ip: string) => Promise<BanRecord | null>;
}

interface BanRecord {
  expiresAt: string;
  reason: string;
}

interface ExpressStyleRequest {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, any>;
  cookies: Record<string, string>;
  ip: string;
  protocol: string;
  get: (name: string) => string | undefined;
}

interface ExpressStyleResponse {
  status: (code: number) => ExpressStyleResponse;
  json: (data: any) => any;
  header: (name: string, value: string) => ExpressStyleResponse;
  setHeader: (name: string, value: string) => ExpressStyleResponse;
  send: (data?: any) => any;
  redirect: (url: string, code?: number) => any;
}

interface ServerInfo {
  address: string;
  port: number;
}

function createExpressStyleResponse(c: HonoContext): ExpressStyleResponse {
  let statusCode = 200;

  const response: ExpressStyleResponse = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      return c.json(data, statusCode as any);
    },
    header(name: string, value: string) {
      c.header(name, value);
      return this;
    },
    setHeader(name: string, value: string) {
      c.header(name, value);
      return this;
    },
    send(data?: any) {
      if (data === undefined || data === null) {
        return c.body('', statusCode as any);
      }

      if (typeof data === 'string' || data instanceof Uint8Array) {
        return c.body(data as any, statusCode as any);
      }

      return c.json(data, statusCode as any);
    },
    redirect(url: string, code: number = 302) {
      return c.redirect(url, code as any);
    }
  };

  return response;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc: Record<string, string>, part: string) => {
      const [key, ...rest] = part.split('=');
      acc[key!] = decodeURIComponent(rest.join('=') || '');
      return acc;
    }, {});
}

async function createExpressStyleRequest(c: HonoContext): Promise<ExpressStyleRequest> {
  const cached = c.get('expressStyleRequest');
  if (cached) {
    return cached;
  }

  const raw = c.req.raw;
  const headers: Record<string, string> = {};
  raw.headers.forEach((value: string, key: string) => {
    headers[key.toLowerCase()] = value;
  });

  const url = new URL(raw.url);
  let body: Record<string, any> | undefined = undefined;
  const contentType = headers['content-type']?.split(';')[0]!.trim();

  try {
    if (contentType === 'application/json') {
      body = await c.req.json();
    } else if (
      contentType === 'application/x-www-form-urlencoded' ||
      contentType === 'multipart/form-data'
    ) {
      body = await c.req.parseBody() as Record<string, any>;
    }
  } catch {
    body = undefined;
  }

  const query = Object.fromEntries(url.searchParams.entries());
  const cookies = parseCookies(headers.cookie);
  const clientIp =
    c.get('clientIp') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown';

  const expressReq: ExpressStyleRequest = {
    method: raw.method,
    url: raw.url,
    originalUrl: raw.url,
    path: url.pathname,
    headers,
    query,
    body: body ?? {},
    cookies,
    ip: clientIp,
    protocol: url.protocol.replace(':', ''),
    get(name: string) {
      return headers[name.toLowerCase()];
    }
  };

  c.set('expressStyleRequest', expressReq);
  return expressReq;
}

export class IdentityServer {
  private options: Required<Pick<IdentityServerOptions, 'port' | 'host' | 'logLevel' | 'issuer'>> & IdentityServerOptions;
  private app: HonoApp | null;
  private server: any;
  private isRunning: boolean;
  private initialized: boolean;
  private logger: Logger;
  private Hono: typeof HonoApp | null;
  private serve: ((options: any, callback?: (info: ServerInfo) => void) => any) | null;
  private identityPlugin: IdentityPluginInstance | null;

  constructor(options: IdentityServerOptions = {}) {
    this.options = {
      port: options.port || 4000,
      host: options.host || '0.0.0.0',
      logLevel: options.logLevel || 'info',
      issuer: options.issuer || '',
      oauth2Server: options.oauth2Server,
      sessionManager: options.sessionManager || null,
      usersResource: options.usersResource || null,
      identityPlugin: options.identityPlugin || null,
      failbanManager: options.failbanManager || null,
      failbanConfig: options.failbanConfig || {},
      cors: options.cors || {},
      security: options.security || {},
      logging: options.logging || {},
      logger: options.logger || console
    };

    this.app = null;
    this.server = null;
    this.isRunning = false;
    this.initialized = false;
    this.logger = this.options.logger!;
    this.Hono = null;
    this.serve = null;
    this.identityPlugin = options.identityPlugin || null;
    this.logger.debug({ configuredPort: options.port, configuredHost: options.host }, '[Identity Server] Initializing');
  }

  private _setupFailbanMiddleware(): void {
    const { failbanManager } = this.options;

    if (!failbanManager || !this.app) return;

    this.app.use('*', async (c: HonoContext, next: () => Promise<void>): Promise<any> => {
      const ip = this._extractClientIp(c);
      c.set('clientIp', ip);

      if (failbanManager.isBlacklisted(ip)) {
        c.header('X-Ban-Status', 'blacklisted');
        c.header('X-Ban-Reason', 'IP is permanently blacklisted');

        if (this.options.logLevel && this.logger) {
          this.logger.info(`[Failban] Blocked blacklisted IP: ${ip}`);
        }

        return c.json({
          error: 'Forbidden',
          message: 'Your IP address has been permanently blocked',
          ip
        }, 403);
      }

      if (this.options.failbanConfig?.geo?.enabled) {
        const countryBlock = failbanManager.checkCountryBlock(ip);
        if (countryBlock) {
          c.header('X-Ban-Status', 'country_blocked');
          c.header('X-Ban-Reason', countryBlock.reason);
          c.header('X-Country-Code', countryBlock.country);

          if (this.options.logLevel && this.logger) {
            this.logger.info(`[Failban] Blocked country ${countryBlock.country} for IP: ${ip}`);
          }

          return c.json({
            error: 'Forbidden',
            message: 'Access from your country is not allowed',
            country: countryBlock.country,
            ip
          }, 403);
        }
      }

      if (failbanManager.isBanned(ip)) {
        const ban = await failbanManager.getBan(ip);

        if (ban) {
          const expiresAt = new Date(ban.expiresAt);
          const retryAfter = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);

          c.header('Retry-After', String(retryAfter));
          c.header('X-Ban-Status', 'banned');
          c.header('X-Ban-Reason', ban.reason);
          c.header('X-Ban-Expires', ban.expiresAt);

          if (this.options.logLevel && this.logger) {
            this.logger.info(`[Failban] Blocked banned IP: ${ip} (expires in ${retryAfter}s)`);
          }

          return c.json({
            error: 'Forbidden',
            message: 'Your IP address has been temporarily banned due to security violations',
            reason: ban.reason,
            expiresAt: ban.expiresAt,
            retryAfter
          }, 403);
        }
      }

      await next();
    });

    if (this.options.logLevel && this.logger) {
      this.logger.info('[Identity Server] Failban middleware enabled (global ban check)');
    }
  }

  private _extractClientIp(c: HonoContext): string {
    return c.get('clientIp') ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      (c.env as any)?.ip ||
      'unknown';
  }

  private _createRateLimitMiddleware(limiter: RateLimiter): (c: HonoContext, next: () => Promise<void>) => Promise<any> {
    return createJsonRateLimitMiddleware(limiter, (c: HonoContext) => this._extractClientIp(c));
  }

  private _setupRoutes(): void {
    if (!this.app) return;

    this.app.use('*', async (c: HonoContext, next: () => Promise<void>) => {
      c.set('requestId', idGenerator());
      c.set('logLevel', this.options.logLevel);
      await next();
    });

    if (this.options.cors?.enabled) {
      const corsMiddleware = createCorsMiddleware(this.options.cors);
      this.app.use('*', corsMiddleware);
    }

    if (this.options.security?.enabled) {
      const securityMiddleware = createSecurityMiddleware(this.options.security);
      this.app.use('*', securityMiddleware);
    }

    if (this.options.failbanManager && this.options.failbanConfig?.enabled) {
      this._setupFailbanMiddleware();
    }

    if (this.options.logging?.enabled) {
      const loggingMiddleware = createLoggingMiddleware(this.options.logging);
      this.app.use('*', loggingMiddleware);
    }

    this.app.get('/health', (c: HonoContext) => {
      const response = formatter.success({
        status: 'ok',
        service: 'identity-provider',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
      return c.json(response);
    });

    this.app.get('/health/live', (c: HonoContext) => {
      const response = formatter.success({
        status: 'alive',
        timestamp: new Date().toISOString()
      });
      return c.json(response);
    });

    this.app.get('/health/ready', async (c: HonoContext) => {
      const isReady = this.options.oauth2Server !== null;

      let onboardingStatus: OnboardingStatus | null = null;
      if (this.options.identityPlugin && typeof this.options.identityPlugin.getOnboardingStatus === 'function') {
        try {
          onboardingStatus = await this.options.identityPlugin.getOnboardingStatus();
          this.logger.debug({ onboardingStatus }, '[Identity Server] Fetched onboarding status');
        } catch (error: any) {
          this.logger.debug({ error: error.message }, '[Identity Server] Error fetching onboarding status (non-fatal)');
        }
      }

      if (!isReady) {
        const response = formatter.error('Service not ready', {
          status: 503,
          code: 'NOT_READY',
          details: { onboarding: onboardingStatus }
        });
        return c.json(response, 503);
      }

      if (onboardingStatus && !onboardingStatus.completed && !onboardingStatus.adminExists) {
        const response = formatter.error('First run setup required', {
          status: 503,
          code: 'ONBOARDING_REQUIRED',
          details: {
            onboarding: {
              required: true,
              adminExists: false,
              mode: onboardingStatus.mode
            }
          }
        });
        return c.json(response, 503);
      }

      const response = formatter.success({
        status: 'ready',
        timestamp: new Date().toISOString(),
        onboarding: onboardingStatus ? {
          required: false,
          adminExists: onboardingStatus.adminExists,
          completedAt: onboardingStatus.completedAt
        } : undefined
      });
      return c.json(response);
    });

    this.app.get('/onboarding/status', async (c: HonoContext) => {
      if (!this.options.identityPlugin || typeof this.options.identityPlugin.getOnboardingStatus !== 'function') {
        const response = formatter.error('Onboarding not available', {
          status: 501,
          code: 'NOT_IMPLEMENTED'
        });
        return c.json(response, 501);
      }

      try {
        const status = await this.options.identityPlugin.getOnboardingStatus();
        const response = formatter.success(status);
        return c.json(response);
      } catch (error: any) {
        const response = formatter.error('Failed to get onboarding status', {
          status: 500,
          code: 'INTERNAL_ERROR',
          details: error.message
        });
        return c.json(response, 500);
      }
    });

    this.app.get('/', (c: HonoContext) => {
      return c.redirect('/.well-known/openid-configuration', 302);
    });

    this._setupOAuth2Routes();
    this._setupUIRoutes();

    (this.app.onError as any)(errorHandler);

    this.app.notFound((c: HonoContext) => {
      const response = formatter.error('Route not found', {
        status: 404,
        code: 'NOT_FOUND',
        details: {
          path: c.req.path,
          method: c.req.method
        }
      });
      return c.json(response, 404);
    });
  }

  private _setupOAuth2Routes(): void {
    const { oauth2Server } = this.options;

    if (!oauth2Server || !this.app) {
      this.logger.error('[Identity Server] OAuth2 Server not provided');
      return;
    }

    const rateLimiters = this.options.identityPlugin?.rateLimiters || {};
    const wrap = (handler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>) => async (c: HonoContext) => {
      const req = await createExpressStyleRequest(c);
      const res = createExpressStyleResponse(c);
      return await handler.call(oauth2Server, req, res);
    };

    this.app.get('/.well-known/openid-configuration', wrap(oauth2Server.discoveryHandler));
    this.app.get('/.well-known/jwks.json', wrap(oauth2Server.jwksHandler));

    this.app.get('/.well-known/s3db-identity.json', (c: HonoContext) => {
      const metadata = this.identityPlugin!.getIntegrationMetadata();
      const etag = `"${Buffer.from(JSON.stringify(metadata)).toString('base64').slice(0, 16)}"`;

      const ifNoneMatch = c.req.header('if-none-match');
      if (ifNoneMatch === etag) {
        return c.body(null, 304);
      }

      c.header('Content-Type', 'application/json');
      c.header('ETag', etag);
      c.header('Cache-Control', `public, max-age=${metadata.cacheTtl}`);
      c.header('Last-Modified', new Date(metadata.issuedAt).toUTCString());

      return c.json(metadata);
    });

    const tokenHandler = wrap(oauth2Server.tokenHandler);
    if (rateLimiters.token) {
      this.app.post('/oauth/token', this._createRateLimitMiddleware(rateLimiters.token), tokenHandler);
    } else {
      this.app.post('/oauth/token', tokenHandler);
    }

    this.app.get('/oauth/userinfo', wrap(oauth2Server.userinfoHandler));
    this.app.post('/oauth/introspect', wrap(oauth2Server.introspectHandler));

    const authorizeGet = wrap(oauth2Server.authorizeHandler);
    const authorizePost = wrap(oauth2Server.authorizePostHandler);
    if (rateLimiters.authorize) {
      const middleware = this._createRateLimitMiddleware(rateLimiters.authorize);
      this.app.get('/oauth/authorize', middleware, authorizeGet);
      this.app.post('/oauth/authorize', middleware, authorizePost);
    } else {
      this.app.get('/oauth/authorize', authorizeGet);
      this.app.post('/oauth/authorize', authorizePost);
    }

    this.app.post('/oauth/register', wrap(oauth2Server.registerClientHandler));
    this.app.post('/oauth/revoke', wrap(oauth2Server.revokeHandler));

    if (this.options.logLevel && this.logger) {
      this.logger.info('[Identity Server] Mounted OAuth2/OIDC routes:');
      this.logger.info('[Identity Server]   GET  /.well-known/openid-configuration (OIDC Discovery)');
      this.logger.info('[Identity Server]   GET  /.well-known/jwks.json (JWKS)');
      this.logger.info('[Identity Server]   GET  /.well-known/s3db-identity.json (S3DB Integration Metadata)');
      this.logger.info('[Identity Server]   GET  /oauth/authorize (Authorization UI)');
      this.logger.info('[Identity Server]   POST /oauth/authorize (Process Login)');
      this.logger.info('[Identity Server]   POST /oauth/token (Token)');
      this.logger.info('[Identity Server]   GET  /oauth/userinfo (UserInfo)');
      this.logger.info('[Identity Server]   POST /oauth/introspect (Introspection)');
      this.logger.info('[Identity Server]   POST /oauth/register (Client Registration)');
      this.logger.info('[Identity Server]   POST /oauth/revoke (Token Revocation)');
    }
  }

  private async _setupUIRoutes(): Promise<void> {
    const { sessionManager, identityPlugin } = this.options;

    if (!sessionManager || !identityPlugin || !this.app) {
      if (this.options.logLevel && this.logger) {
        this.logger.info('[Identity Server] SessionManager or IdentityPlugin not provided, skipping UI routes');
      }
      return;
    }

    try {
      const { registerUIRoutes } = await import('./ui/routes.js');
      registerUIRoutes(this.app, identityPlugin as any);

      if (this.options.logLevel && this.logger) {
        this.logger.info('[Identity Server] Mounted UI routes:');
        this.logger.info('[Identity Server]   GET  /login (Login Form)');
        this.logger.info('[Identity Server]   POST /login (Process Login)');
        this.logger.info('[Identity Server]   GET  /register (Registration Form)');
        this.logger.info('[Identity Server]   POST /register (Process Registration)');
        this.logger.info('[Identity Server]   GET  /logout (Logout)');
        this.logger.info('[Identity Server]   POST /logout (Logout)');
        this.logger.info('[Identity Server]   GET  /forgot-password (Forgot Password Form)');
        this.logger.info('[Identity Server]   POST /forgot-password (Process Forgot Password)');
        this.logger.info('[Identity Server]   GET  /reset-password (Reset Password Form)');
        this.logger.info('[Identity Server]   POST /reset-password (Process Password Reset)');
        this.logger.info('[Identity Server]   GET  /profile (User Profile - Protected)');
        this.logger.info('[Identity Server]   POST /profile/update (Update Profile)');
        this.logger.info('[Identity Server]   POST /profile/change-password (Change Password)');
        this.logger.info('[Identity Server]   POST /profile/logout-session (Logout Specific Session)');
        this.logger.info('[Identity Server]   POST /profile/logout-all-sessions (Logout All Other Sessions)');
        this.logger.info('[Identity Server]   GET  /admin (Admin Dashboard - Protected)');
        this.logger.info('[Identity Server]   GET  /admin/clients (List OAuth2 Clients)');
        this.logger.info('[Identity Server]   GET  /admin/clients/new (New Client Form)');
        this.logger.info('[Identity Server]   POST /admin/clients/create (Create Client)');
        this.logger.info('[Identity Server]   GET  /admin/clients/:id/edit (Edit Client Form)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/update (Update Client)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/delete (Delete Client)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/rotate-secret (Rotate Client Secret)');
        this.logger.info('[Identity Server]   POST /admin/clients/:id/toggle-active (Toggle Client Active)');
        this.logger.info('[Identity Server]   GET  /admin/users (List Users - Protected)');
        this.logger.info('[Identity Server]   GET  /admin/users/:id/edit (Edit User Form)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/update (Update User)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/delete (Delete User)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/change-status (Change User Status)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/verify-email (Mark Email Verified)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/reset-password (Send Password Reset)');
        this.logger.info('[Identity Server]   POST /admin/users/:id/toggle-admin (Toggle Admin Role)');
        this.logger.info('[Identity Server]   GET  /oauth/authorize (OAuth2 Consent Screen - Overrides OAuth2Server)');
        this.logger.info('[Identity Server]   POST /oauth/consent (Process OAuth2 Consent Decision)');
        this.logger.info('[Identity Server]   GET  /verify-email (Verify Email with Token)');
        this.logger.info('[Identity Server]   POST /verify-email/resend (Resend Verification Email)');
      }
    } catch (error: any) {
      this.logger.error('[Identity Server] Failed to setup UI routes:', error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('[Identity Server] Server is already running');
      return;
    }

    if (!this.initialized) {
      const { Hono } = await import('hono');
      const { serve } = await import('@hono/node-server');

      this.Hono = Hono;
      this.serve = serve;

      this.app = new Hono();
      this._setupRoutes();

      this.initialized = true;
    }

    const { port, host } = this.options;
    this.logger.debug({ configuredPort: port, configuredHost: host }, '[Identity Server] Attempting to start server');

    return new Promise((resolve, reject) => {
      try {
        this.server = this.serve!({
          fetch: this.app!.fetch,
          port,
          hostname: host
        }, (info: ServerInfo) => {
          this.isRunning = true;
          this.options.port = info.port;
          this.logger.info(`[Identity Server] Server listening on http://${info.address}:${info.port}`);
          this.logger.info(`[Identity Server] Issuer: ${this.options.issuer}`);
          this.logger.info(`[Identity Server] Discovery: ${this.options.issuer}/.well-known/openid-configuration`);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  get port(): number {
    return this.options.port;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('[Identity Server] Server is not running');
      return;
    }

    if (this.server && typeof this.server.close === 'function') {
      this.logger.debug('[Identity Server] Attempting to close server instance');
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          this.isRunning = false;
          this.logger.info('[Identity Server] Server stopped');
          resolve();
        });
      });
    } else {
      this.isRunning = false;
      this.logger.info('[Identity Server] Server stopped');
    }
  }

  getInfo(): { isRunning: boolean; port: number; host: string; issuer: string } {
    return {
      isRunning: this.isRunning,
      port: this.options.port,
      host: this.options.host,
      issuer: this.options.issuer
    };
  }

  getApp(): HonoApp | null {
    return this.app;
  }
}

export default IdentityServer;
