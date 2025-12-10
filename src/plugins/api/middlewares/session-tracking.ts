import type { Context, MiddlewareHandler, Next } from 'hono';
import { encrypt, decrypt } from '../../../concerns/crypto.js';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger } from '../../../concerns/logger.js';
import { idGenerator } from '../../../concerns/id.js';
import { getCookie, setCookie } from 'hono/cookie';

const logger: Logger = createLogger({ name: 'SessionTracking', level: 'info' });

export interface SessionData {
  id: string;
  userAgent?: string | null;
  ip?: string | null;
  referer?: string | null;
  createdAt?: string;
  lastSeenAt?: string;
  lastUserAgent?: string | null;
  lastIp?: string | null;
  [key: string]: unknown;
}

export interface ResourceLike {
  exists(id: string): Promise<boolean>;
  get(id: string): Promise<SessionData | null>;
  insert(data: SessionData): Promise<SessionData>;
  update(id: string, data: Partial<SessionData>): Promise<SessionData>;
}

export interface DatabaseLike {
  resources: Record<string, ResourceLike>;
}

export interface EnrichSessionParams {
  session: SessionData;
  context: Context;
}

export type EnrichSessionFn = (params: EnrichSessionParams) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;

export interface SessionTrackingConfig {
  enabled?: boolean;
  resource?: string | null;
  cookieName?: string;
  cookieMaxAge?: number;
  cookieSecure?: boolean;
  cookieSameSite?: 'Strict' | 'Lax' | 'None';
  updateOnRequest?: boolean;
  passphrase?: string | null;
  enrichSession?: EnrichSessionFn | null;
}

export function createSessionTrackingMiddleware(config: SessionTrackingConfig = {}, db?: DatabaseLike): MiddlewareHandler {
  const {
    enabled = false,
    resource = null,
    cookieName = 'session_id',
    cookieMaxAge = 2592000000,
    cookieSecure = process.env.NODE_ENV === 'production',
    cookieSameSite = 'Strict',
    updateOnRequest = true,
    passphrase = null,
    enrichSession = null
  } = config;

  if (!enabled) {
    return async (_c: Context, next: Next): Promise<void | Response> => await next();
  }

  if (!passphrase) {
    throw new Error('sessionTracking.passphrase is required when sessionTracking.enabled = true');
  }

  const sessionsResource = resource && db ? db.resources[resource] : null;

  return async (c: Context, next: Next): Promise<void | Response> => {
    let session: SessionData | null = null;
    let sessionId: string | null = null;
    let isNewSession = false;

    const sessionCookie = getCookie(c, cookieName);

    if (sessionCookie) {
      try {
        sessionId = await decrypt(sessionCookie, passphrase);

        if (sessionsResource) {
          const exists = await sessionsResource.exists(sessionId);
          if (exists) {
            session = await sessionsResource.get(sessionId);
          }
        } else {
          session = { id: sessionId };
        }
      } catch (err) {
        const logLevel = c.get('logLevel');
        if (logLevel === 'debug' || logLevel === 'trace') {
          logger.error({ error: (err as Error).message }, '[SessionTracking] Failed to decrypt cookie');
        }
      }
    }

    if (!session) {
      isNewSession = true;
      sessionId = idGenerator();

      const sessionData: SessionData = {
        id: sessionId,
        userAgent: c.req.header('user-agent') || null,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null,
        referer: c.req.header('referer') || null,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      };

      if (enrichSession && typeof enrichSession === 'function') {
        try {
          const enriched = await enrichSession({ session: sessionData, context: c });
          if (enriched && typeof enriched === 'object') {
            Object.assign(sessionData, enriched);
          }
        } catch (enrichErr) {
          const logLevel = c.get('logLevel');
          if (logLevel === 'debug' || logLevel === 'trace') {
            logger.error({ error: (enrichErr as Error).message }, '[SessionTracking] enrichSession failed');
          }
        }
      }

      if (sessionsResource) {
        try {
          session = await sessionsResource.insert(sessionData);
        } catch (insertErr) {
          const logLevel = c.get('logLevel');
          if (logLevel === 'debug' || logLevel === 'trace') {
            logger.error({ error: (insertErr as Error).message }, '[SessionTracking] Failed to insert session');
          }
          session = sessionData;
        }
      } else {
        session = sessionData;
      }
    } else if (updateOnRequest && !isNewSession && sessionsResource && sessionId) {
      const updates: Partial<SessionData> = {
        lastSeenAt: new Date().toISOString(),
        lastUserAgent: c.req.header('user-agent') || null,
        lastIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null
      };

      sessionsResource.update(sessionId, updates).catch((updateErr: Error) => {
        const logLevel = c.get('logLevel');
        if (logLevel === 'debug' || logLevel === 'trace') {
          logger.error({ error: updateErr.message }, '[SessionTracking] Failed to update session');
        }
      });

      Object.assign(session, updates);
    }

    try {
      const encryptedSessionId = await encrypt(sessionId!, passphrase);

      setCookie(c, cookieName, encryptedSessionId, {
        maxAge: Math.floor(cookieMaxAge / 1000),
        path: '/',
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite
      });
    } catch (encryptErr) {
      const logLevel = c.get('logLevel');
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger.error({ error: (encryptErr as Error).message }, '[SessionTracking] Failed to encrypt session ID');
      }
    }

    c.set('sessionId', sessionId);
    c.set('session', session);

    await next();
  };
}

export default createSessionTrackingMiddleware;
