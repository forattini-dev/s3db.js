import { timingSafeEqual } from 'crypto';
import type { Context, Next } from '#src/plugins/shared/http-runtime.js';
import type { ContentfulStatusCode } from '#src/plugins/shared/http-runtime.js';
import type { DatabaseLike } from './resource-manager.js';
import { unauthorized } from '../utils/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';
import { isBcryptHash, verifyPassword } from '../../../concerns/password-hashing.js';
import { getCookie } from '#src/plugins/shared/http-runtime.js';
import { BasicAuthResourceManager } from './resource-manager.js';

const logger = createLogger({ name: 'BasicAuth', level: 'info' });

export interface BasicCredentials {
  username: string;
  password: string;
}

export interface AdminUserConfig {
  enabled?: boolean;
  username: string;
  password: string;
  scopes?: string[];
}

export interface BasicAuthConfig {
  resource?: string;
  createResource?: boolean;
  usernameField?: string;
  passwordField?: string;
  realm?: string;
  passphrase?: string;
  optional?: boolean;
  adminUser?: AdminUserConfig | null;
  cookieName?: string | null;
  tokenField?: string;
}

export interface UserRecord {
  id: string;
  active?: boolean;
  isActive?: boolean;
  [key: string]: unknown;
}

function secureStringEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const maxLength = Math.max(left.length, right.length);
  const leftPadded = Buffer.alloc(maxLength);
  const rightPadded = Buffer.alloc(maxLength);
  left.copy(leftPadded);
  right.copy(rightPadded);
  return timingSafeEqual(leftPadded, rightPadded);
}

async function verifyAdminPassword(candidate: string, expected: string): Promise<boolean> {
  if (!expected) {
    return false;
  }

  if (isBcryptHash(expected)) {
    return verifyPassword(candidate, expected);
  }

  if (!candidate) {
    return false;
  }

  return secureStringEquals(candidate, expected);
}

export function parseBasicAuth(authHeader: string | null | undefined): BasicCredentials | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match || !match[1]) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
    const [username, ...passwordParts] = decoded.split(':');
    const password = passwordParts.join(':');
    if (!username || !password) return null;
    return { username, password };
  } catch {
    return null;
  }
}

export async function createBasicAuthHandler(
  config: BasicAuthConfig = {},
  database: DatabaseLike
): Promise<(c: Context, next: Next) => Promise<Response | void>> {
  const {
    realm = 'API Access',
    usernameField = 'email',
    passwordField = 'password',
    optional = false,
    adminUser = null,
    cookieName = null,
    tokenField = 'apiToken'
  } = config;

  if (!database) {
    throw new Error('Basic Auth driver: database is required');
  }

  const manager = new BasicAuthResourceManager(database, 'basic', config as unknown as ConstructorParameters<typeof BasicAuthResourceManager>[2]);
  const authResource = await manager.getOrCreateResource();

  logger.debug(`Basic Auth driver initialized with resource: ${authResource.name}, usernameField: ${usernameField}`);

  return async (c: Context, next: Next): Promise<Response | void> => {
    const authHeader = c.req.header('authorization');

    if (!authHeader && cookieName) {
      try {
        const token = getCookie(c, cookieName);
        if (token) {
          const users = await authResource.query({ [tokenField]: token }, { limit: 1 }) as UserRecord[];
          if (users && users.length > 0) {
            const user = users[0]!;
            if (user.active === false || user.isActive === false) {
              const response = unauthorized('User account is inactive');
              return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
            }
            c.set('user', user);
            c.set('authMethod', 'basic-cookie');
            return await next();
          }
        }
      } catch {
        // ignore cookie auth errors
      }
    }

    if (!authHeader) {
      if (optional) return await next();
      c.header('WWW-Authenticate', `Basic realm="${realm}"`);
      const response = unauthorized('Basic authentication required');
      return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
    }

    const credentials = parseBasicAuth(authHeader);
    if (!credentials) {
      c.header('WWW-Authenticate', `Basic realm="${realm}"`);
      const response = unauthorized('Invalid Basic authentication format');
      return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
    }

    const { username, password } = credentials;

    if (adminUser && adminUser.enabled === true) {
      const usernameMatches = secureStringEquals(username, adminUser.username || '');
      const passwordMatches = await verifyAdminPassword(password, adminUser.password || '');
      if (usernameMatches && passwordMatches) {
        c.set('user', {
          id: 'root',
          username: adminUser.username,
          email: adminUser.username,
          scopes: adminUser.scopes || ['admin'],
          authMethod: 'basic-admin',
          isActive: true,
          active: true
        });
        c.set('authMethod', 'basic');
        return await next();
      }
    }

    try {
      const users = await authResource.query({ [usernameField]: username }, { limit: 1 }) as UserRecord[];
      if (!users || users.length === 0) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }

      const user = users[0]!;
      const storedPassword = user[passwordField] as string | undefined;
      if (!storedPassword) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }

      const isValid = await verifyPassword(password, storedPassword);
      if (!isValid) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('Invalid credentials');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }

      if (user.active === false || user.isActive === false) {
        c.header('WWW-Authenticate', `Basic realm="${realm}"`);
        const response = unauthorized('User account is inactive');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }

      c.set('user', user);
      c.set('authMethod', 'basic');
      return await next();
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Error validating Basic Auth credentials');
      c.header('WWW-Authenticate', `Basic realm="${realm}"`);
      const response = unauthorized('Authentication error');
      return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
    }
  };
}

export default {
  parseBasicAuth,
  createBasicAuthHandler
};
