import { createHmac, timingSafeEqual } from 'crypto';
import type { Context, Next } from '#src/plugins/shared/http-runtime.js';
import type { ContentfulStatusCode } from '#src/plugins/shared/http-runtime.js';
import type { ResourceLike, DatabaseLike } from './resource-manager.js';
import { createLogger } from '../../../concerns/logger.js';
import { unauthorized } from '../utils/response-formatter.js';
import { getCookie } from '#src/plugins/shared/http-runtime.js';
import { LRUCache } from '../concerns/lru-cache.js';
import { JWTResourceManager } from './resource-manager.js';
import { verifyPassword } from '#src/plugins/shared/password-verification.js';

const logger = createLogger({ name: 'JwtAuth', level: 'info' });
const tokenCache = new LRUCache<JWTPayload>({ max: 1000, ttl: 60000 });

export interface JWTPayload {
  iss?: string;
  aud?: string | string[];
  nbf?: number;
  sub?: string;
  iat?: number;
  exp?: number;
  jti?: string;
  id?: string;
  role?: string;
  scopes?: string[];
  [key: string]: unknown;
}

export interface JWTConfig {
  resource?: string;
  createResource?: boolean;
  secret?: string;
  userField?: string;
  passwordField?: string;
  passphrase?: string;
  expiresIn?: string;
  refreshExpiresIn?: string;
  optional?: boolean;
  cookieName?: string | null;
  issuer?: string;
  audience?: string | string[];
  clockTolerance?: number;
  jwksUri?: string;
  algorithms?: string[];
}

export interface JWTSignOptions {
  issuer?: string;
  audience?: string | string[];
}

export interface JWTVerificationOptions {
  issuer?: string;
  audience?: string | string[];
  clockTolerance?: number;
}

export interface UserRecord {
  id: string;
  active?: boolean;
  isActive?: boolean;
  role?: string;
  scopes?: string[];
  [key: string]: unknown;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: UserRecord;
  error?: string;
}

interface JWKSVerifierLike {
  verify(token: string): Promise<Record<string, unknown>>;
  clearCache(): void;
}

const AUTH_HEADER_REGEX = /^Bearer\s+(.+)$/i;
const ALLOWED_JWT_ALGORITHMS = ['HS256'];

function normalizeAudience(input: string | string[] | undefined): string[] | null {
  if (input === undefined) {
    return null;
  }

  return Array.isArray(input) ? [...input] : [input];
}

function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error('Invalid expiresIn format. Use: 60s, 30m, 24h, 7d');
  }

  const [, valueRaw, unit] = match;
  const value = parseInt(valueRaw!, 10);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit!]!;
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString()) as T;
  } catch {
    return null;
  }
}

function getTimestampSeconds(): number {
  return Date.now() / 1000;
}

function validateAudience(payloadAudiences: string | string[] | undefined, expectedAudiences: string[] | null): boolean {
  if (expectedAudiences === null) {
    return true;
  }

  const tokenAudiences = normalizeAudience(payloadAudiences);
  if (!tokenAudiences) {
    return false;
  }

  return tokenAudiences.some((audience) => expectedAudiences.includes(audience));
}

function buildCacheKey(token: string, secret: string, options: JWTVerificationOptions = {}): string {
  const audiences = normalizeAudience(options.audience);
  const audienceKey = audiences ? audiences.join(',') : '';
  const tolerance = options.clockTolerance ?? 0;
  const issuer = options.issuer ?? '';

  return `${token}:${secret}:${issuer}:${audienceKey}:${tolerance}`;
}

export function createToken(payload: JWTPayload, secret: string, expiresIn: string = '7d', options: JWTSignOptions = {}): string {
  const expiresInSeconds = parseExpiresIn(expiresIn);

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = getTimestampSeconds();

  const data = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
    ...(options.issuer ? { iss: options.issuer } : {}),
    ...(options.audience ? { aud: options.audience } : {})
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyToken(token: string, secret: string, options: JWTVerificationOptions = {}): JWTPayload | null {
  const cacheKey = buildCacheKey(token, secret, options);
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    const now = getTimestampSeconds();
    const clockTolerance = Math.max(0, Math.floor(options.clockTolerance ?? 0));

    if (
      typeof cached.exp === 'number'
      && cached.exp > 0
      && now - clockTolerance >= cached.exp
    ) {
      tokenCache.delete(cacheKey);
      return null;
    }

    if (cached.nbf !== undefined) {
      if (typeof cached.nbf !== 'number' || now + clockTolerance < cached.nbf) {
        tokenCache.delete(cacheKey);
        return null;
      }
    }

    return cached;
  }

  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) {
      return null;
    }

    const header = decodeBase64UrlJson<{ alg?: string }>(encodedHeader);
    if (!header || !header.alg || !ALLOWED_JWT_ALGORITHMS.includes(header.alg)) {
      return null;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const signatureBuffer = Buffer.from(signature, 'base64url');
    if (signatureBuffer.length !== expectedSignature.length || !timingSafeEqual(signatureBuffer, expectedSignature)) {
      return null;
    }

    const payload = decodeBase64UrlJson<JWTPayload>(encodedPayload);
    if (!payload) {
      return null;
    }

    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= 0) {
      return null;
    }

    const now = getTimestampSeconds();
    const clockTolerance = Math.max(0, Math.floor(options.clockTolerance ?? 0));

    if (now - clockTolerance > payload.exp) {
      return null;
    }

    if (payload.nbf !== undefined) {
      if (typeof payload.nbf !== 'number' || !Number.isFinite(payload.nbf) || now + clockTolerance < payload.nbf) {
        return null;
      }
    }

    if (options.issuer && payload.iss !== options.issuer) {
      return null;
    }

    if (!validateAudience(payload.aud, normalizeAudience(options.audience))) {
      return null;
    }

    tokenCache.set(cacheKey, payload);
    return payload;
  } catch {
    return null;
  }
}

export async function createJWTHandler(
  config: JWTConfig = {},
  database: DatabaseLike
): Promise<(c: Context, next: Next) => Promise<Response | void>> {
  const {
    secret,
    userField = 'email',
    optional = false,
    cookieName = null,
    issuer,
    audience,
    clockTolerance = 0,
    jwksUri
  } = config;

  if (!secret && !jwksUri) {
    throw new Error('JWT driver: secret or jwksUri is required');
  }

  if (!database) {
    throw new Error('JWT driver: database is required');
  }

  let jwksVerifier: JWKSVerifierLike | null = null;
  if (jwksUri) {
    try {
      const { createJWKSVerifier } = await import('raffel');
      jwksVerifier = createJWKSVerifier({
        jwksUri,
        issuer,
        audience: audience ? (Array.isArray(audience) ? audience[0] : audience) : undefined,
        algorithms: config.algorithms || ['RS256', 'ES256'],
        clockTolerance: clockTolerance || 60
      });
      logger.debug(`JWT driver: JWKS verifier initialized for ${jwksUri}`);
    } catch {
      throw new Error('JWT driver: jwksUri requires raffel package (pnpm add raffel)');
    }
  }

  const manager = new JWTResourceManager(database, 'jwt', config as unknown as ConstructorParameters<typeof JWTResourceManager>[2]);
  const authResource = await manager.getOrCreateResource();
  logger.debug(`JWT driver initialized with resource: ${authResource.name}, userField: ${userField}`);

  const buildUnauthorized = (c: Context): Response => {
    const response = unauthorized('Authentication required');
    return c.json(response, response._status as ContentfulStatusCode);
  };

  const verifyTokenPayload = async (token: string): Promise<JWTPayload | null> => {
    if (jwksVerifier) {
      try {
        const claims = await jwksVerifier.verify(token);
        return claims as JWTPayload;
      } catch {
        return null;
      }
    }
    if (secret) {
      return verifyToken(token, secret, { issuer, audience, clockTolerance });
    }
    return null;
  };

  return async (c: Context, next: Next): Promise<Response | void> => {
    const authHeader = c.req.header('authorization');

    if (!authHeader) {
      if (cookieName) {
        try {
          const token = getCookie(c, cookieName);
          if (token) {
            const payload = await verifyTokenPayload(token);
            if (payload) {
              const userIdentifier = payload[userField];
              if (typeof userIdentifier === 'string' || typeof userIdentifier === 'number') {
                try {
                  const users = await authResource.query({ [userField]: userIdentifier }, { limit: 1 }) as UserRecord[];
                  const user = users[0];

                  if (user && user.active !== false && user.isActive !== false) {
                    c.set('user', user);
                    c.set('authMethod', 'jwt-cookie');
                    return await next();
                  }
                } catch {
                  // Ignore and continue to unauthorized
                }
              } else {
                c.set('user', payload);
                c.set('authMethod', 'jwt-cookie');
                return await next();
              }
            }
          }
        } catch {
          // Ignore and continue to unauthorized
        }
      }

      if (optional) {
        return await next();
      }

      return buildUnauthorized(c);
    }

    const match = authHeader.match(AUTH_HEADER_REGEX);
    if (!match) {
      return buildUnauthorized(c);
    }

    const token = match[1];
    if (!token) {
      return buildUnauthorized(c);
    }

    const payload = await verifyTokenPayload(token);
    if (!payload) {
      return buildUnauthorized(c);
    }

    const userIdentifier = payload[userField];
    if (typeof userIdentifier === 'string' || typeof userIdentifier === 'number') {
      try {
        const users = await authResource.query({ [userField]: userIdentifier }, { limit: 1 }) as UserRecord[];
        const user = users[0];

        if (!user) {
          return buildUnauthorized(c);
        }

        if (user.active === false || user.isActive === false) {
          return buildUnauthorized(c);
        }

        c.set('user', user);
        c.set('authMethod', 'jwt');
      } catch (err) {
        logger.error({ error: (err as Error).message }, 'Error loading user');
        return buildUnauthorized(c);
      }
    } else {
      c.set('user', payload);
      c.set('authMethod', 'jwt');
    }

    await next();
  };
}

export function createRefreshToken(payload: JWTPayload, secret: string, expiresIn: string = '30d', options: JWTSignOptions = {}): string {
  return createToken({ ...payload, type: 'refresh' }, secret, expiresIn, options);
}

export function verifyRefreshToken(token: string, secret: string, options: JWTVerificationOptions = {}): JWTPayload | null {
  const payload = verifyToken(token, secret, options);
  if (!payload || payload.type !== 'refresh') return null;
  return payload;
}

export async function jwtRefresh(
  authResource: ResourceLike,
  refreshToken: string,
  config: JWTConfig = {}
): Promise<LoginResult> {
  const {
    secret,
    userField = 'email',
    expiresIn = '7d',
    refreshExpiresIn = '30d',
    issuer,
    audience,
    clockTolerance = 0
  } = config;

  if (!secret) {
    return { success: false, error: 'JWT secret is required' };
  }

  const payload = verifyRefreshToken(refreshToken, secret, { issuer, audience, clockTolerance });
  if (!payload) {
    return { success: false, error: 'Invalid or expired refresh token' };
  }

  const userIdentifier = payload[userField];
  if (typeof userIdentifier !== 'string' && typeof userIdentifier !== 'number') {
    return { success: false, error: 'Invalid refresh token payload' };
  }

  try {
    const users = await authResource.query({ [userField]: userIdentifier }, { limit: 1 }) as UserRecord[];
    const user = users[0];

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.active === false || user.isActive === false) {
      return { success: false, error: 'User account is inactive' };
    }

    const tokenPayload = {
      [userField]: user[userField],
      id: user.id,
      role: user.role || 'user',
      scopes: user.scopes || []
    };

    const newToken = createToken(tokenPayload, secret, expiresIn, { issuer, audience });
    const newRefreshToken = createRefreshToken(tokenPayload, secret, refreshExpiresIn, { issuer, audience });

    return { success: true, token: newToken, refreshToken: newRefreshToken, user };
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Token refresh error');
    return { success: false, error: 'Token refresh error' };
  }
}

export async function jwtLogin(
  authResource: ResourceLike,
  username: string,
  password: string,
  config: JWTConfig = {},
  pepper?: string
): Promise<LoginResult> {
  const {
    secret,
    userField = 'email',
    passwordField = 'password',
    expiresIn = '7d',
    refreshExpiresIn = '30d',
    issuer,
    audience
  } = config;

  if (!secret) {
    return { success: false, error: 'JWT secret is required' };
  }

  try {
    const users = await authResource.query({ [userField]: username }, { limit: 1 }) as UserRecord[];
    const user = users[0];

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.active === false || user.isActive === false) {
      return { success: false, error: 'User account is inactive' };
    }

    const storedPassword = user[passwordField] as string | undefined;
    if (!storedPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isValid = await verifyPassword(password, storedPassword, { pepper });
    if (!isValid) {
      return { success: false, error: 'Invalid credentials' };
    }

    const tokenPayload = {
      [userField]: user[userField],
      id: user.id,
      role: user.role || 'user',
      scopes: user.scopes || []
    };

    const token = createToken(tokenPayload, secret, expiresIn, { issuer, audience });
    const refreshToken = refreshExpiresIn
      ? createRefreshToken(tokenPayload, secret, refreshExpiresIn, { issuer, audience })
      : undefined;

    return { success: true, token, refreshToken, user };
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Login error');
    return { success: false, error: 'Authentication error' };
  }
}

export default {
  createToken,
  verifyToken,
  createRefreshToken,
  verifyRefreshToken,
  createJWTHandler,
  jwtLogin,
  jwtRefresh
};
