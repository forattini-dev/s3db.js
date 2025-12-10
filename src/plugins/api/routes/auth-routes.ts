import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { asyncHandler } from '../utils/error-handler.js';
import * as formatter from '../utils/response-formatter.js';
import { createToken } from '../auth/jwt-auth.js';
import { generateApiKey } from '../auth/api-key-auth.js';
import { hashPassword } from '../../../concerns/password-hashing.js';

export interface AuthResource {
  name: string;
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

export interface AuthRoutesConfig {
  driver?: string;
  drivers?: string[];
  usernameField?: string;
  passwordField?: string;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  passphrase?: string;
  registration?: RegistrationConfig;
  loginThrottle?: LoginThrottleConfig;
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

interface HonoRequest {
  raw?: {
    socket?: {
      remoteAddress?: string;
    };
  };
}

export function createAuthRoutes(authResource: AuthResource, config: AuthRoutesConfig = {}, authMiddleware?: MiddlewareHandler): Hono {
  const app = new Hono();
  const {
    driver,
    drivers = [],
    usernameField = 'email',
    passwordField = 'password',
    jwtSecret,
    jwtExpiresIn = '7d',
    registration = {},
    loginThrottle = {}
  } = config;

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
  const isPasswordType = typeof passwordAttribute === 'string'
    ? passwordAttribute.includes('password')
    : (passwordAttribute as { type?: string })?.type === 'password';

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
    return (c.req as unknown as HonoRequest).raw?.socket?.remoteAddress || 'unknown';
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
      const data = await c.req.json();
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
          userData[passwordField] = await hashPassword(password);
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
      const data = await c.req.json();
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

      if (user.active !== undefined && !user.active) {
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

      const isBcryptHash = storedPassword.startsWith('$') || (storedPassword.length === 53 && !storedPassword.includes(':'));

      if (isBcryptHash) {
        const { verifyPassword } = await import('../../../concerns/password-hashing.js');
        isValid = await verifyPassword(password, storedPassword);
      } else {
        isValid = storedPassword === password;
      }

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
      if (jwtSecret) {
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

      if (loginThrottleConfig.enabled && throttleKey) {
        loginAttempts.delete(throttleKey);
      }

      const response = formatter.success({
        user: buildPublicUser(user),
        token,
        expiresIn: jwtExpiresIn
      });

      return c.json(response, response._status as ContentfulStatusCode);
    }));
  }

  if (jwtSecret) {
    app.post('/token/refresh', asyncHandler(async (c: Context) => {
      const user = c.get('user') as AuthUser | undefined;

      if (!user) {
        const response = formatter.unauthorized('Authentication required');
        return c.json(response, response._status as ContentfulStatusCode);
      }

      const token = createToken(
        { userId: user.id, username: user.username, role: user.role },
        jwtSecret,
        jwtExpiresIn
      );

      const response = formatter.success({
        token,
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

  return app;
}

export default {
  createAuthRoutes
};
