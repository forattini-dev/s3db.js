import { timingSafeEqual } from 'node:crypto';
import { HttpApp } from '#src/plugins/shared/http-runtime.js';
import type { Context, MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';
import type { ContentfulStatusCode } from '#src/plugins/shared/http-runtime.js';
import { asyncHandler } from '../utils/error-handler.js';
import * as formatter from '../utils/response-formatter.js';
import { createToken, createRefreshToken, verifyRefreshToken } from '../auth/jwt-auth.js';
import { generateApiKey } from '../auth/api-key-auth.js';
import { compactHash, hashPassword, isPasswordHash, type SecurityConfig } from '../../../concerns/password-hashing.js';
import { verifyPassword } from '#src/plugins/shared/password-verification.js';

export interface AuthResource {
  name: string;
  security?: SecurityConfig;
  schema?: {
    attributes?: Record<string, unknown>;
  };
  query(filter: Record<string, unknown>): Promise<AuthUser[]>;
  insert(data: Record<string, unknown>): Promise<AuthUser>;
  update(id: string, data: Record<string, unknown>): Promise<AuthUser>;
  database?: unknown;
}

export interface AuthUser {
  id: string;
  email?: string;
  username?: string;
  role?: string;
  active?: boolean;
  isActive?: boolean;
  apiKey?: string;
  lastLoginAt?: string;
  [key: string]: unknown;
}

export interface RegistrationConfig {
  enabled?: boolean;
  allowedFields?: string[];
  defaultRole?: string;
}

export interface LoginThrottleConfig {
  enabled?: boolean;
  maxAttempts?: number;
  windowMs?: number;
  blockDurationMs?: number;
  maxEntries?: number;
}

export interface ClientCredentialsConfig {
  enabled?: boolean;
  expiresIn?: string;
  defaultScopes?: string[];
}

export interface AuthRoutesConfig {
  driver?: string;
  drivers?: string[];
  usernameField?: string;
  passwordField?: string;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  jwtRefreshExpiresIn?: string;
  passphrase?: string;
  registration?: RegistrationConfig;
  loginThrottle?: LoginThrottleConfig;
  clientCredentials?: ClientCredentialsConfig;
}

interface ThrottleRecord {
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt?: number;
  blockedUntil: number | null;
}

interface ThrottleResult {
  blocked: boolean;
  retryAfter?: number;
}

async function verifyStoredSecret(candidate: string, storedSecret: string, pepper?: string): Promise<boolean> {
  return verifyPassword(candidate, storedSecret, { pepper });
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const maxLength = Math.max(left.length, right.length);
  const leftPadded = Buffer.alloc(maxLength);
  const rightPadded = Buffer.alloc(maxLength);
  left.copy(leftPadded);
  right.copy(rightPadded);

  return timingSafeEqual(leftPadded, rightPadded) && left.length === right.length;
}

async function verifyClientSecret(candidate: string, storedSecret: string, pepper?: string): Promise<boolean> {
  if (!storedSecret) {
    return false;
  }

  if (isPasswordHash(storedSecret)) {
    return verifyStoredSecret(candidate, storedSecret, pepper);
  }

  return constantTimeEqual(candidate, storedSecret);
}

function isPasswordAttributeType(passwordAttribute: unknown): boolean {
  const passwordType = typeof passwordAttribute === 'string'
    ? passwordAttribute
    : (passwordAttribute as { type?: unknown })?.type;

  if (typeof passwordType !== 'string') {
    return false;
  }

  return passwordType === 'password'
    || passwordType.startsWith('password:')
    || passwordType.startsWith('password|');
}

function resolvePasswordSecurity(database: unknown): SecurityConfig | undefined {
  if (!database || typeof database !== 'object') {
    return undefined;
  }

  const candidate = (database as { security?: unknown }).security;
  if (candidate && typeof candidate === 'object') {
    return candidate as SecurityConfig;
  }

  return undefined;
}

function resolvePasswordPepper(database: unknown): string | undefined {
  const security = resolvePasswordSecurity(database);
  const candidatePepper = security?.pepper;
  return typeof candidatePepper === 'string' && candidatePepper.length > 0
    ? candidatePepper
    : undefined;
}

async function hashPasswordForStorage(
  password: string,
  database: unknown,
  passwordPepper: string | undefined
): Promise<string> {
  const security = resolvePasswordSecurity(database);
  const rounds = security?.bcrypt?.rounds ?? 12;
  const algorithm = security?.argon2 ? 'argon2id' : 'bcrypt';

  const hashed = await hashPassword(password, {
    rounds,
    algorithm,
    pepper: passwordPepper,
    argon2: security?.argon2,
  });

  try {
    return compactHash(hashed);
  } catch {
    return hashed;
  }
}

interface HttpRawRequest {
  raw?: {
    socket?: {
      remoteAddress?: string;
    };
  };
}

export function createAuthRoutes(authResource: AuthResource, config: AuthRoutesConfig = {}, authMiddleware?: MiddlewareHandler): HttpApp {
  const app = new HttpApp();
  const {
    driver,
    drivers = [],
    usernameField = 'email',
    passwordField = 'password',
    jwtSecret,
    jwtExpiresIn = '7d',
    jwtRefreshExpiresIn = '30d',
    registration = {},
    loginThrottle = {},
    clientCredentials = {}
  } = config;
  const passwordPepper = resolvePasswordPepper(authResource);
  const passwordSecurity = resolvePasswordSecurity(authResource);

  if (authMiddleware) {
    app.use('/me', authMiddleware);
    app.use('/token/refresh', authMiddleware);
  }

  const hasExternalAuth = Array.isArray(drivers) && drivers.some(d =>
    ['oidc', 'oauth2'].includes(d)
  );

  const registrationConfig = {
    enabled: registration.enabled === true,
    allowedFields: Array.isArray(registration.allowedFields) ? registration.allowedFields : [],
    defaultRole: registration.defaultRole || 'user'
  };

  const schemaAttributes = authResource.schema?.attributes || {};
  const passwordAttribute = schemaAttributes?.[passwordField];
  const isPasswordType = isPasswordAttributeType(passwordAttribute);

  const allowedRegistrationFields = new Set([usernameField, passwordField]);
  for (const field of registrationConfig.allowedFields) {
    if (typeof field === 'string' && field && field !== passwordField) {
      allowedRegistrationFields.add(field);
    }
  }

  const blockedRegistrationFields = new Set([
    'role',
    'active',
    'apiKey',
    'jwtSecret',
    'scopes',
    'createdAt',
    'updatedAt',
    'metadata',
    'id'
  ]);

  const loginThrottleConfig = {
    enabled: loginThrottle?.enabled !== false,
    maxAttempts: loginThrottle?.maxAttempts ?? 5,
    windowMs: loginThrottle?.windowMs ?? 60_000,
    blockDurationMs: loginThrottle?.blockDurationMs ?? 300_000,
    maxEntries: loginThrottle?.maxEntries ?? 10_000
  };

  const loginAttempts = new Map<string, ThrottleRecord>();

  const getClientIp = (c: Context): string => {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      const firstIp = forwarded.split(',')[0];
      return firstIp ? firstIp.trim() : 'unknown';
    }
    const cfConnecting = c.req.header('cf-connecting-ip');
    if (cfConnecting) {
      return cfConnecting;
    }
    return (c.req as unknown as HttpRawRequest).raw?.socket?.remoteAddress || 'unknown';
  };

  const cleanupLoginAttempts = (): void => {
    if (loginAttempts.size <= loginThrottleConfig.maxEntries) {
      return;
    }
    const oldestKey = loginAttempts.keys().next().value;
    if (oldestKey) {
      loginAttempts.delete(oldestKey);
    }
  };

  const getThrottleRecord = (key: string, now: number): ThrottleRecord | null => {
    if (!loginThrottleConfig.enabled) return null;
    let record = loginAttempts.get(key);
    if (record && record.blockedUntil && now > record.blockedUntil) {
      loginAttempts.delete(key);
      record = undefined;
    }
    if (!record || now - record.firstAttemptAt > loginThrottleConfig.windowMs) {
      record = { attempts: 0, firstAttemptAt: now, blockedUntil: null };
      loginAttempts.set(key, record);
      cleanupLoginAttempts();
    }
    return record;
  };

  const registerFailedAttempt = (record: ThrottleRecord | null, now: number): ThrottleResult => {
    if (!loginThrottleConfig.enabled || !record) {
      return { blocked: false };
    }
    record.attempts += 1;
    record.lastAttemptAt = now;
    if (record.attempts >= loginThrottleConfig.maxAttempts) {
      record.blockedUntil = now + loginThrottleConfig.blockDurationMs;
      const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
      return { blocked: true, retryAfter };
    }
    return { blocked: false };
  };

  const buildPublicUser = (user: AuthUser): Record<string, unknown> => {
    const publicUser: Record<string, unknown> = { id: user.id };
    const identifier = user[usernameField] ?? user.email ?? user.username;
    if (identifier !== undefined) {
      publicUser[usernameField] = identifier;
    }

    for (const field of allowedRegistrationFields) {
      if (field === usernameField || field === passwordField) continue;
      if (user[field] !== undefined) {
        publicUser[field] = user[field];
      }
    }

    if (schemaAttributes.role !== undefined && user.role !== undefined) {
      publicUser.role = user.role;
    }

    if (schemaAttributes.active !== undefined && user.active !== undefined) {
      publicUser.active = user.active;
    }

    return publicUser;
  };

  if (registrationConfig.enabled) {
    app.post('/register', asyncHandler(async (c: Context) => {
      const data = await c.req.json() as Record<string, string>;
      const username = data[usernameField];
      const password = data[passwordField];

      if (!username) {
        const response = formatter.validationError([
          { field: usernameField, message: `${usernameField} is required` }
        ]);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (!hasExternalAuth) {
        if (!password) {
          const response = formatter.validationError([
            { field: passwordField, message: `${passwordField} is required` }
          ]);
          return c.json(response, response._status as ContentfulStatusCode);
        }

        if (password.length < 8) {
          const response = formatter.validationError([
            { field: passwordField, message: 'Password must be at least 8 characters' }
          ]);
          return c.json(response, response._status as ContentfulStatusCode);
        }
      } else if (password && password.length < 8) {
        const response = formatter.validationError([
          { field: passwordField, message: 'Password must be at least 8 characters if provided' }
        ]);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const queryFilter = { [usernameField]: username };
      const existing = await authResource.query(queryFilter);
      if (existing && existing.length > 0) {
        const response = formatter.error(`${usernameField} already exists`, {
          status: 409,
          code: 'CONFLICT'
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const { id, ...dataWithoutId } = data;
      const userData: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(dataWithoutId)) {
        if (!allowedRegistrationFields.has(key)) continue;
        if (blockedRegistrationFields.has(key)) continue;
        if (key === usernameField || key === passwordField) continue;
        userData[key] = value;
      }

      userData[usernameField] = username;

      if (password) {
        if (isPasswordType) {
          userData[passwordField] = password;
        } else {
          userData[passwordField] = await hashPasswordForStorage(password, passwordSecurity, passwordPepper);
        }
      }

      if (schemaAttributes.role !== undefined) {
        userData.role = registrationConfig.defaultRole;
      }

      if (schemaAttributes.active !== undefined) {
        userData.active = true;
      }

      try {
        const user = await authResource.insert(userData);

        let token: string | null = null;
        if (driver === 'jwt' && jwtSecret) {
          token = createToken(
            {
              userId: user.id,
              [usernameField]: user[usernameField],
              role: user.role
            },
            jwtSecret,
            jwtExpiresIn
          );
        }

        const response = formatter.created({
          user: buildPublicUser(user),
          ...(token && { token })
        }, `/auth/users/${user.id}`);

        return c.json(response, response._status as ContentfulStatusCode);
      } catch (err) {
        const response = formatter.error((err as Error).message, { status: 500 });
        return c.json(response, response._status as ContentfulStatusCode);
      }
    }));
  }

  if (driver === 'jwt') {
    app.post('/login', asyncHandler(async (c: Context) => {
      const data = await c.req.json() as Record<string, string>;
      const username = data[usernameField];
      const password = data[passwordField];

      if (!username || !password) {
        const response = formatter.unauthorized(`${usernameField} and ${passwordField} are required`);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const queryFilter = { [usernameField]: username };
      const users = await authResource.query(queryFilter);
      if (!users || users.length === 0) {
        const now = Date.now();
        let throttleRecord: ThrottleRecord | null = null;
        if (loginThrottleConfig.enabled) {
          const ip = getClientIp(c);
          const throttleKey = `${ip}:${username}`;
          throttleRecord = getThrottleRecord(throttleKey, now);
          const throttleResult = registerFailedAttempt(throttleRecord, now);
          if (throttleResult.blocked) {
            c.header('Retry-After', throttleResult.retryAfter!.toString());
            const response = formatter.error('Too many login attempts. Try again later.', {
              status: 429,
              code: 'TOO_MANY_ATTEMPTS',
              details: { retryAfter: throttleResult.retryAfter }
            });
            return c.json(response, response._status as ContentfulStatusCode);
          }
        }

        const response = formatter.unauthorized('Invalid credentials');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const user = users[0]!;

      if (user.active === false || user.isActive === false) {
        const response = formatter.unauthorized('User account is inactive');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const now = Date.now();
      let throttleRecord: ThrottleRecord | null = null;
      let throttleKey: string | null = null;
      if (loginThrottleConfig.enabled) {
        const ip = getClientIp(c);
        throttleKey = `${ip}:${username}`;
        throttleRecord = getThrottleRecord(throttleKey, now);
        if (throttleRecord && throttleRecord.blockedUntil && now < throttleRecord.blockedUntil) {
          const retryAfter = Math.ceil((throttleRecord.blockedUntil - now) / 1000);
          c.header('Retry-After', retryAfter.toString());
          const response = formatter.error('Too many login attempts. Try again later.', {
            status: 429,
            code: 'TOO_MANY_ATTEMPTS',
            details: { retryAfter }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }
      }

      let isValid = false;

      const storedPassword = user[passwordField] as string | undefined;

      if (!storedPassword) {
        const response = formatter.unauthorized('Invalid credentials');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      isValid = await verifyStoredSecret(password, storedPassword, passwordPepper);

      if (!isValid) {
        const throttleResult = registerFailedAttempt(throttleRecord, now);
        if (throttleResult.blocked) {
          c.header('Retry-After', throttleResult.retryAfter!.toString());
          const response = formatter.error('Too many login attempts. Try again later.', {
            status: 429,
            code: 'TOO_MANY_ATTEMPTS',
            details: { retryAfter: throttleResult.retryAfter }
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }

        const response = formatter.unauthorized('Invalid credentials');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (user.lastLoginAt !== undefined) {
        await authResource.update(user.id, {
          lastLoginAt: new Date().toISOString()
        });
      }

      let token: string | null = null;
      let refreshToken: string | undefined;
      if (jwtSecret) {
        const tokenPayload = {
          userId: user.id,
          [usernameField]: user[usernameField],
          role: user.role,
          scopes: ((user as Record<string, unknown>).scopes as string[] | undefined) || []
        };
        token = createToken(tokenPayload, jwtSecret, jwtExpiresIn);
        refreshToken = createRefreshToken(tokenPayload, jwtSecret, jwtRefreshExpiresIn);
      }

      if (loginThrottleConfig.enabled && throttleKey) {
        loginAttempts.delete(throttleKey);
      }

      const response = formatter.success({
        user: buildPublicUser(user),
        token,
        refreshToken,
        expiresIn: jwtExpiresIn
      });

      return c.json(response, response._status as ContentfulStatusCode);
    }));
  }

  if (jwtSecret) {
    app.post('/token/refresh', asyncHandler(async (c: Context) => {
      const data = await c.req.json().catch(() => ({})) as Record<string, string>;
      const refreshTokenValue = data.refreshToken || data.refresh_token;

      if (refreshTokenValue) {
        const payload = verifyRefreshToken(refreshTokenValue, jwtSecret);
        if (!payload) {
          const response = formatter.unauthorized('Invalid or expired refresh token');
          return c.json(response, response._status as ContentfulStatusCode);
        }

        const userIdentifier = payload[usernameField] || payload.userId;
        if (typeof userIdentifier === 'string' || typeof userIdentifier === 'number') {
          const users = await authResource.query({ [usernameField]: userIdentifier });
          const user = users[0];
          if (!user || user.active === false || user.isActive === false) {
            const response = formatter.unauthorized('User not found or inactive');
            return c.json(response, response._status as ContentfulStatusCode);
          }

          const tokenPayload = {
            userId: user.id,
            [usernameField]: user[usernameField],
            role: user.role,
            scopes: ((user as Record<string, unknown>).scopes as string[] | undefined) || []
          };

          const newToken = createToken(tokenPayload, jwtSecret, jwtExpiresIn);
          const newRefreshToken = createRefreshToken(tokenPayload, jwtSecret, jwtRefreshExpiresIn);

          const response = formatter.success({
            token: newToken,
            refreshToken: newRefreshToken,
            expiresIn: jwtExpiresIn
          });
          return c.json(response, response._status as ContentfulStatusCode);
        }
      }

      const user = c.get('user') as AuthUser | undefined;
      if (!user) {
        const response = formatter.unauthorized('Authentication required');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const tokenPayload = {
        userId: user.id,
        [usernameField]: user[usernameField],
        role: user.role,
        scopes: ((user as Record<string, unknown>).scopes as string[] | undefined) || []
      };

      const token = createToken(tokenPayload, jwtSecret, jwtExpiresIn);
      const refreshToken = createRefreshToken(tokenPayload, jwtSecret, jwtRefreshExpiresIn);

      const response = formatter.success({
        token,
        refreshToken,
        expiresIn: jwtExpiresIn
      });

      return c.json(response, response._status as ContentfulStatusCode);
    }));
  }

  app.get('/me', asyncHandler(async (c: Context) => {
    const user = c.get('user') as AuthUser | undefined;

    if (!user) {
      const response = formatter.unauthorized('Authentication required');
      return c.json(response, response._status as ContentfulStatusCode);
    }

    const response = formatter.success(buildPublicUser(user));
    return c.json(response, response._status as ContentfulStatusCode);
  }));

  app.post('/api-key/regenerate', asyncHandler(async (c: Context) => {
    const user = c.get('user') as AuthUser | undefined;

    if (!user) {
      const response = formatter.unauthorized('Authentication required');
      return c.json(response, response._status as ContentfulStatusCode);
    }

    const newApiKey = generateApiKey();

    await authResource.update(user.id, {
      apiKey: newApiKey
    });

    const response = formatter.success({
      apiKey: newApiKey,
      message: 'API key regenerated successfully'
    });

    return c.json(response, response._status as ContentfulStatusCode);
  }));

  if (clientCredentials.enabled && jwtSecret) {
    const ccExpiresIn = clientCredentials.expiresIn || '1h';
    const ccDefaultScopes = clientCredentials.defaultScopes || [];

    app.post('/token', asyncHandler(async (c: Context) => {
      const contentType = c.req.header('content-type') || '';
      let data: Record<string, string>;

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const body = await c.req.text();
        data = Object.fromEntries(new URLSearchParams(body));
      } else {
        data = await c.req.json() as Record<string, string>;
      }

      const grantType = data.grant_type;
      if (grantType !== 'client_credentials') {
        const response = formatter.error('Unsupported grant_type. Use "client_credentials"', {
          status: 400,
          code: 'UNSUPPORTED_GRANT_TYPE'
        });
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const clientId = data.client_id;
      const clientSecret = data.client_secret;

      if (!clientId || !clientSecret) {
        const response = formatter.validationError([
          ...(!clientId ? [{ field: 'client_id', message: 'client_id is required' }] : []),
          ...(!clientSecret ? [{ field: 'client_secret', message: 'client_secret is required' }] : [])
        ]);
        return c.json(response, response._status as ContentfulStatusCode);
      }

      let serviceUser: AuthUser | null = null;

      const byApiKey = await authResource.query({ apiKey: clientId });
      if (byApiKey.length > 0) {
        const candidate = byApiKey[0]!;
        const storedSecret = (candidate as Record<string, unknown>)[passwordField] as string | undefined;

        if (storedSecret && await verifyClientSecret(clientSecret, storedSecret, passwordPepper)) {
            serviceUser = candidate;
        }
      }

      if (!serviceUser) {
        const byUsername = await authResource.query({ [usernameField]: clientId });
        if (byUsername.length > 0) {
          const candidate = byUsername[0]!;
          const storedSecret = (candidate as Record<string, unknown>)[passwordField] as string | undefined;

          if (storedSecret && await verifyClientSecret(clientSecret, storedSecret, passwordPepper)) {
              serviceUser = candidate;
          }
        }
      }

      if (!serviceUser) {
        const response = formatter.unauthorized('Invalid client credentials');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      if (serviceUser.active === false || serviceUser.isActive === false) {
        const response = formatter.unauthorized('Client account is inactive');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const requestedScopes = data.scope ? data.scope.split(' ') : ccDefaultScopes;
      const userScopes = ((serviceUser as Record<string, unknown>).scopes as string[] | undefined) || [];
      const grantedScopes = requestedScopes.length > 0
        ? requestedScopes.filter((s: string) => userScopes.includes(s) || userScopes.length === 0)
        : userScopes.length > 0 ? userScopes : ccDefaultScopes;

      const token = createToken(
        {
          sub: serviceUser.id,
          client_id: clientId,
          role: serviceUser.role || 'service',
          scopes: grantedScopes,
          grant_type: 'client_credentials'
        },
        jwtSecret,
        ccExpiresIn
      );

      const response = formatter.success({
        access_token: token,
        token_type: 'Bearer',
        expires_in: ccExpiresIn,
        scope: grantedScopes.join(' ')
      });

      return c.json(response, response._status as ContentfulStatusCode);
    }));
  }

  return app;
}

export default {
  createAuthRoutes
};
