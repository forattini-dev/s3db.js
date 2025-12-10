import { jwtVerify } from 'jose';
import type { JWTPayload, CryptoKey, KeyObject } from 'jose';
import type { Context } from 'hono';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger, LogLevel } from '../../../concerns/logger.js';

type KeyLike = CryptoKey | KeyObject;

const logger: Logger = createLogger({ name: 'OidcBackchannel', level: 'info' as LogLevel });

export interface OidcConfig {
  issuer: string;
  clientId: string;
  onBackchannelLogout?: (params: BackchannelLogoutEvent) => Promise<void>;
}

export interface BackchannelLogoutEvent {
  claims: LogoutTokenClaims;
  sessionIds: string[];
  loggedOut: number;
}

export interface LogoutTokenClaims extends JWTPayload {
  events?: Record<string, unknown>;
  sid?: string;
}

export interface SessionStore {
  destroy(sessionId: string): Promise<void>;
  findBySub?(sub: string): Promise<string[]>;
  findBySid?(sid: string): Promise<string[]>;
}

export interface LogoutValidationResult {
  valid: boolean;
  errors: string[] | null;
}

export interface BackchannelLogoutResult {
  success: boolean;
  sessionsLoggedOut?: number;
  error?: string;
  statusCode: number;
}

export interface DiscoveryDocument {
  backchannel_logout_supported?: boolean;
  [key: string]: unknown;
}

export interface BackchannelLogoutConfigValidation {
  valid: boolean;
  errors: string[] | null;
  warnings: string[] | null;
}

export interface BackchannelConfig extends OidcConfig {
  sessionStore?: SessionStore;
  backchannelLogoutUri?: string;
}

export async function verifyBackchannelLogoutToken(
  logoutToken: string,
  config: OidcConfig,
  signingKey: KeyLike
): Promise<LogoutTokenClaims> {
  try {
    const { payload } = await jwtVerify(logoutToken, signingKey, {
      issuer: config.issuer,
      audience: config.clientId,
      clockTolerance: 60
    });

    const validation = validateLogoutTokenClaims(payload as LogoutTokenClaims);
    if (!validation.valid) {
      throw new Error(`Invalid logout token: ${validation.errors?.join(', ')}`);
    }

    return payload as LogoutTokenClaims;
  } catch (err) {
    throw new Error(`Logout token verification failed: ${(err as Error).message}`);
  }
}

export function validateLogoutTokenClaims(claims: LogoutTokenClaims): LogoutValidationResult {
  const errors: string[] = [];

  if (!claims.events) {
    errors.push('Missing "events" claim');
  } else {
    const hasBackchannelEvent = claims.events['http://schemas.openid.net/event/backchannel-logout'];
    if (!hasBackchannelEvent) {
      errors.push('Missing backchannel-logout event in "events" claim');
    }
  }

  if (!claims.sub && !claims.sid) {
    errors.push('Must have either "sub" (subject) or "sid" (session ID) claim');
  }

  if (claims.nonce !== undefined) {
    errors.push('Logout token must NOT contain "nonce" claim');
  }

  if (!claims.iss) {
    errors.push('Missing "iss" (issuer) claim');
  }

  if (!claims.aud) {
    errors.push('Missing "aud" (audience) claim');
  }

  if (!claims.iat) {
    errors.push('Missing "iat" (issued at) claim');
  }

  if (!claims.jti) {
    errors.push('Missing "jti" (JWT ID) claim for replay protection');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}

export async function findSessionsToLogout(
  logoutToken: LogoutTokenClaims,
  sessionStore: SessionStore
): Promise<string[]> {
  const sessionsToLogout: string[] = [];

  if (typeof sessionStore.findBySub === 'function' && logoutToken.sub) {
    const sessions = await sessionStore.findBySub(logoutToken.sub);
    sessionsToLogout.push(...sessions);
  }

  if (typeof sessionStore.findBySid === 'function' && logoutToken.sid) {
    const sessions = await sessionStore.findBySid(logoutToken.sid);
    sessionsToLogout.push(...sessions);
  }

  return sessionsToLogout;
}

export async function handleBackchannelLogout(
  context: Context,
  config: OidcConfig,
  signingKey: KeyLike,
  sessionStore: SessionStore
): Promise<BackchannelLogoutResult> {
  try {
    const body = await context.req.parseBody();
    const logoutToken = body.logout_token as string;

    if (!logoutToken) {
      return {
        success: false,
        error: 'Missing logout_token parameter',
        statusCode: 400
      };
    }

    const claims = await verifyBackchannelLogoutToken(logoutToken, config, signingKey);

    const sessionIds = await findSessionsToLogout(claims, sessionStore);

    let loggedOut = 0;
    for (const sessionId of sessionIds) {
      try {
        await sessionStore.destroy(sessionId);
        loggedOut++;
      } catch (err) {
        logger.error({ error: (err as Error).message, sessionId }, `[OIDC] Failed to destroy session`);
      }
    }

    if (config.onBackchannelLogout && typeof config.onBackchannelLogout === 'function') {
      try {
        await config.onBackchannelLogout({
          claims,
          sessionIds,
          loggedOut
        });
      } catch (err) {
        logger.error({ error: (err as Error).message }, '[OIDC] onBackchannelLogout hook failed');
      }
    }

    return {
      success: true,
      sessionsLoggedOut: loggedOut,
      statusCode: 200
    };
  } catch (err) {
    logger.error({ error: (err as Error).message }, '[OIDC] Backchannel logout error');
    return {
      success: false,
      error: (err as Error).message,
      statusCode: 400
    };
  }
}

interface HonoApp {
  post(path: string, handler: (c: Context) => Promise<Response>): void;
}

export function registerBackchannelLogoutRoute(
  app: HonoApp,
  path: string,
  config: OidcConfig,
  signingKey: KeyLike,
  sessionStore: SessionStore
): void {
  if (!sessionStore) {
    throw new Error('Backchannel logout requires a session store');
  }

  app.post(path, async (c: Context) => {
    const result = await handleBackchannelLogout(c, config, signingKey, sessionStore);

    if (result.success) {
      return c.text('', result.statusCode as Parameters<typeof c.text>[1]);
    } else {
      return c.json({ error: result.error }, result.statusCode as Parameters<typeof c.json>[1]);
    }
  });
}

export function providerSupportsBackchannelLogout(discoveryDoc: DiscoveryDocument | null): boolean {
  return discoveryDoc?.backchannel_logout_supported === true;
}

export function getBackchannelLogoutUri(baseUrl: string, logoutPath: string = '/auth/backchannel-logout'): string {
  const url = new URL(logoutPath, baseUrl);
  return url.toString();
}

export function validateBackchannelLogoutConfig(
  config: BackchannelConfig,
  discoveryDoc: DiscoveryDocument | null
): BackchannelLogoutConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!providerSupportsBackchannelLogout(discoveryDoc)) {
    errors.push('Provider does not support backchannel logout (backchannel_logout_supported is false or missing)');
  }

  if (!config.sessionStore) {
    errors.push('Backchannel logout requires sessionStore to be configured');
  }

  if (!config.backchannelLogoutUri) {
    warnings.push('backchannelLogoutUri not configured. You must register this URI with your provider.');
  }

  if (config.sessionStore) {
    const supportsFindBySub = typeof config.sessionStore.findBySub === 'function';
    const supportsFindBySid = typeof config.sessionStore.findBySid === 'function';

    if (!supportsFindBySub && !supportsFindBySid) {
      warnings.push(
        'Session store does not implement findBySub() or findBySid(). ' +
        'You must implement custom logout logic in onBackchannelLogout hook.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null,
    warnings: warnings.length > 0 ? warnings : null
  };
}
