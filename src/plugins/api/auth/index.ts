import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
import type { DatabaseLike } from './resource-manager.js';
import { createJWTHandler, createToken, verifyToken, type JWTConfig } from './jwt-auth.js';
import { createApiKeyHandler, generateApiKey, type ApiKeyConfig } from './api-key-auth.js';
import { createBasicAuthHandler, type BasicAuthConfig } from './basic-auth.js';
import { createOAuth2Handler, type OAuth2Config } from './oauth2-auth.js';
import { OIDCClient } from './oidc-client.js';
import { unauthorized } from '../utils/response-formatter.js';
import { getCookie } from 'hono/cookie';

export interface AuthMiddlewareOptions {
  methods?: string[];
  jwt?: JWTConfig;
  apiKey?: ApiKeyConfig;
  basic?: BasicAuthConfig;
  oauth2?: OAuth2Config;
  oidc?: MiddlewareHandler | null;
  database: DatabaseLike;
  optional?: boolean;
  strategy?: 'any' | 'priority';
  priorities?: Record<string, number>;
}

interface AuthMethodEntry {
  name: string;
  middleware: MiddlewareHandler;
}

export async function createAuthMiddleware(options: AuthMiddlewareOptions): Promise<MiddlewareHandler> {
  const {
    methods = [],
    jwt: jwtConfig = {},
    apiKey: apiKeyConfig = {},
    basic: basicConfig = {},
    oauth2: oauth2Config = {} as OAuth2Config,
    oidc: oidcMiddleware = null,
    database,
    optional = false,
    strategy = 'any',
    priorities = {}
  } = options;

  if (!database) {
    throw new Error('createAuthMiddleware: database parameter is required');
  }

  if (methods.length === 0) {
    return async (c: Context, next: Next) => await next();
  }

  const middlewares: AuthMethodEntry[] = [];

  if (methods.includes('jwt') && jwtConfig.secret) {
    const jwtHandler = await createJWTHandler(jwtConfig, database);
    middlewares.push({
      name: 'jwt',
      middleware: jwtHandler as MiddlewareHandler
    });
  }

  if (methods.includes('apiKey')) {
    const apiKeyHandler = await createApiKeyHandler(apiKeyConfig, database);
    middlewares.push({
      name: 'apiKey',
      middleware: apiKeyHandler as MiddlewareHandler
    });
  }

  if (methods.includes('basic')) {
    const basicHandler = await createBasicAuthHandler(basicConfig, database);
    middlewares.push({
      name: 'basic',
      middleware: basicHandler as MiddlewareHandler
    });
  }

  if (methods.includes('oauth2') && oauth2Config.issuer) {
    const oauth2Handler = await createOAuth2Handler(oauth2Config, database);
    middlewares.push({
      name: 'oauth2',
      middleware: async (c: Context, next: Next) => {
        const user = await oauth2Handler(c);
        if (user) {
          c.set('user', user);
          c.set('authMethod', 'oauth2');
          return await next();
        }
      }
    });
  }

  if (oidcMiddleware) {
    middlewares.push({
      name: 'oidc',
      middleware: oidcMiddleware
    });
  }

  if (strategy === 'priority' && Object.keys(priorities).length > 0) {
    middlewares.sort((a, b) => {
      const priorityA = priorities[a.name] || 999;
      const priorityB = priorities[b.name] || 999;
      return priorityA - priorityB;
    });
  }

  const hasMultipleMethods = middlewares.length > 1;

  return async (c: Context, next: Next): Promise<Response | void> => {
    let attempted = false;
    let lastErrorResponse: Response | null = null;

    const hasCredentials = (name: string): boolean => {
      if (name === 'jwt') {
        if (c.req.header('authorization')) return true;
        if (jwtConfig.cookieName) {
          try {
            return !!getCookie(c, jwtConfig.cookieName);
          } catch {
            return false;
          }
        }
        return false;
      }

      if (name === 'apiKey') {
        const headerName = apiKeyConfig.headerName || 'X-API-Key';
        if (c.req.header(headerName)) return true;

        if (apiKeyConfig.queryParam) {
          return !!c.req.query(apiKeyConfig.queryParam);
        }
        return false;
      }

      if (name === 'basic') {
        if (c.req.header('authorization')) return true;
        if (basicConfig.cookieName) {
          try {
            return !!getCookie(c, basicConfig.cookieName);
          } catch {
            return false;
          }
        }
        return false;
      }

      if (name === 'oauth2') {
        return !!c.req.header('authorization');
      }

      return false;
    };

    for (const { name, middleware } of middlewares) {
      const credentialsPresent = hasCredentials(name);

      if (!credentialsPresent && hasMultipleMethods) {
        continue;
      }

      attempted = attempted || credentialsPresent || !hasMultipleMethods;

      let authSuccess = false;
      const tempNext = async () => {
        authSuccess = true;
      };

      const result = await middleware(c, tempNext);

      if (result !== undefined && result !== null) {
        const statusCode = typeof (result as Response)?.status === 'number'
          ? (result as Response).status
          : (typeof (result as { _status?: number })?._status === 'number' ? (result as { _status?: number })._status : null);

        if (statusCode === 401 || statusCode === 403) {
          lastErrorResponse = result as Response;
          continue;
        }

        return result;
      }

      if (authSuccess && c.get('user')) {
        return await next();
      }
    }

    if (!attempted) {
      if (optional) {
        return await next();
      }

      const response = unauthorized(
        `Authentication required. Supported methods: ${methods.join(', ')}`
      );
      return c.json(response, (response as { _status: number })._status as Parameters<typeof c.json>[1]);
    }

    if (lastErrorResponse) {
      return lastErrorResponse;
    }

    if (optional) {
      return await next();
    }

    const response = unauthorized(
      `Authentication required. Supported methods: ${methods.join(', ')}`
    );
    return c.json(response, (response as { _status: number })._status as Parameters<typeof c.json>[1]);
  };
}

export { OIDCClient, createToken, verifyToken, generateApiKey };

export default {
  createAuthMiddleware,
  createJWTHandler,
  createApiKeyHandler,
  createBasicAuthHandler,
  createOAuth2Handler,
  createToken,
  verifyToken,
  generateApiKey,
  OIDCClient
};
