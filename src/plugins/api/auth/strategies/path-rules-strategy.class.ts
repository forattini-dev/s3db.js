import type { Context, Next, MiddlewareHandler } from 'hono';
import { BaseAuthStrategy, type BaseAuthStrategyOptions } from './base-strategy.class.js';
import { createPathBasedAuthMiddleware, type AuthRule } from '../path-auth-matcher.js';
import { createJWTHandler } from '../jwt-auth.js';
import { createApiKeyHandler } from '../api-key-auth.js';
import { createBasicAuthHandler } from '../basic-auth.js';
import { createOAuth2Handler } from '../oauth2-auth.js';

interface AuthenticatedUser {
  role?: string | string[];
  roles?: string | string[];
  scopes?: string | string[];
  scope?: string;
  token_use?: string;
  token_type?: string;
  service_account?: unknown;
  sub?: string;
  [key: string]: unknown;
}

export interface PathRulesAuthStrategyOptions extends BaseAuthStrategyOptions {
  pathRules: AuthRule[];
  events?: {
    emitAuthEvent: (event: string, data: Record<string, unknown>) => void;
  } | null;
}

export class PathRulesAuthStrategy extends BaseAuthStrategy {
  private pathRules: AuthRule[];
  private events: PathRulesAuthStrategyOptions['events'];

  private normalizeDriverName(value: string): string {
    const lowered = String(value || '').trim().toLowerCase();
    if (lowered === 'api-key' || lowered === 'api_key' || lowered === 'apikey') {
      return 'apiKey';
    }

    return lowered;
  }

  private normalizeScopes(raw: string | string[] | undefined): string[] {
    if (!raw) {
      return [];
    }

    const values = Array.isArray(raw) ? raw : [raw];
    return values
      .flatMap(value => String(value).split(' '))
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  private normalizeRoles(raw: string | string[] | undefined): string[] {
    if (!raw) {
      return [];
    }

    const values = Array.isArray(raw) ? raw : [raw];
    return values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private getUserScopes(user: AuthenticatedUser): string[] {
    if (Array.isArray(user.scopes)) {
      return user.scopes
        .filter((scope): scope is string => typeof scope === 'string')
        .map(scope => scope.trim())
        .filter(Boolean);
    }

    if (typeof user.scope === 'string') {
      return this.normalizeScopes(user.scope);
    }

    return [];
  }

  private getUserRoles(user: AuthenticatedUser): string[] {
    const directRoles = this.normalizeRoles(user.role as string | string[] | undefined);
    if (directRoles.length > 0) {
      return directRoles;
    }

    return this.normalizeRoles(user.roles as string | string[] | undefined);
  }

  private hasScope(user: AuthenticatedUser, scope: string): boolean {
    const scopes = this.getUserScopes(user);

    if (scopes.includes(scope)) {
      return true;
    }

    const wildcardScopes = scopes.filter((value) => value.endsWith(':*'));
    for (const wildcard of wildcardScopes) {
      const prefix = wildcard.slice(0, -2);
      if (scope.startsWith(`${prefix}:`)) {
        return true;
      }
    }

    if (scopes.includes('*')) {
      return true;
    }

    return false;
  }

  private isServiceAccount(c: Context): boolean {
    const identity = c.get('identity') as { isServiceAccount?: () => boolean } | undefined;
    if (identity?.isServiceAccount?.()) {
      return true;
    }

    const serviceAccount = c.get('serviceAccount');
    if (serviceAccount) {
      return true;
    }

    const user = c.get('user') as AuthenticatedUser | undefined;
    if (!user) {
      return false;
    }

    if (typeof user.token_use === 'string' && user.token_use.toLowerCase() === 'service') {
      return true;
    }

    if (typeof user.token_type === 'string' && user.token_type.toLowerCase() === 'service') {
      return true;
    }

    if (user.service_account) {
      return true;
    }

    return typeof user.sub === 'string' && user.sub.startsWith('sa:');
  }

  private hasRequiredRole(user: AuthenticatedUser, rule: AuthRule): boolean {
    const requiredRoles = this.normalizeRoles(rule.roles);
    if (requiredRoles.length === 0) {
      return true;
    }

    const userRoles = this.getUserRoles(user);
    return requiredRoles.some((role) => userRoles.includes(role));
  }

  private hasRequiredScopes(user: AuthenticatedUser, rule: AuthRule): boolean {
    const requiredScopes = this.normalizeScopes(rule.scopes);
    if (requiredScopes.length === 0) {
      return true;
    }

    return requiredScopes.every((scope) => this.hasScope(user, scope));
  }

  constructor({ drivers, authResource, oidcMiddleware, database, pathRules, events, logLevel, logger }: PathRulesAuthStrategyOptions) {
    super({ drivers, authResource, oidcMiddleware, database, logLevel, logger });
    this.pathRules = pathRules;
    this.events = events;
  }

  override async createMiddleware(): Promise<MiddlewareHandler> {
    const authMiddlewares: Record<string, MiddlewareHandler> = {};
    const allowedServiceAccounts = this.pathRules.some((rule) =>
      rule.required !== false && rule.allowServiceAccounts === false
    );

    for (const driverDef of this.drivers) {
      const driverType = this.normalizeDriverName(driverDef.type || driverDef.driver || '');
      const driverConfig = driverDef.config || driverDef;

      if (driverType === 'oauth2-server') {
        continue;
      }

      if (driverType === 'oidc') {
        if (this.oidcMiddleware) {
          authMiddlewares.oidc = this.oidcMiddleware;
        }
        continue;
      }

      if (driverType === 'jwt') {
        authMiddlewares.jwt = await createJWTHandler(driverConfig as Parameters<typeof createJWTHandler>[0], this.database) as MiddlewareHandler;
      }

      if (driverType === 'apiKey') {
        authMiddlewares.apiKey = await createApiKeyHandler(driverConfig as Parameters<typeof createApiKeyHandler>[0], this.database) as MiddlewareHandler;
      }

      if (driverType === 'basic') {
        authMiddlewares.basic = await createBasicAuthHandler(driverConfig as Parameters<typeof createBasicAuthHandler>[0], this.database) as MiddlewareHandler;
      }

      if (driverType === 'oauth2') {
        const oauth2Handler = await createOAuth2Handler(driverConfig as Parameters<typeof createOAuth2Handler>[0], this.database);
        authMiddlewares.oauth2 = async (c: Context, next: Next) => {
          const user = await oauth2Handler(c);
          if (user) {
            c.set('user', user);
            c.set('authMethod', 'oauth2');
            return await next();
          }
        };
      }
    }

    const availableMethods = Object.keys(authMiddlewares);
    this.logger.debug({ ruleCount: this.pathRules.length, methods: availableMethods }, `Path-based auth with ${this.pathRules.length} rules, methods: ${availableMethods.join(', ')}`);

    const authorizeRequest = async (context: Context, rule: AuthRule): Promise<boolean> => {
      if (!rule.required) {
        return true;
      }

      const user = context.get('user') as AuthenticatedUser | undefined;
      if (!user) {
        return false;
      }

      if (rule.allowServiceAccounts === false && this.isServiceAccount(context)) {
        return false;
      }

      if (!this.hasRequiredRole(user, rule)) {
        return false;
      }

      if (!this.hasRequiredScopes(user, rule)) {
        return false;
      }

      return true;
    };

    if (!allowedServiceAccounts && this.pathRules.length > 0) {
      this.logger.debug('Some path rules explicitly disable service account access');
    }

    return createPathBasedAuthMiddleware({
      rules: this.pathRules,
      authMiddlewares,
      unauthorizedHandler: (c: Context, message: string) => {
        const acceptHeader = c.req.header('accept') || '';
        const acceptsHtml = acceptHeader.includes('text/html');

        if (acceptsHtml) {
          if (authMiddlewares.oidc) {
            return c.redirect('/auth/login', 302);
          }
        }

        return c.json({
          error: 'Unauthorized',
          message
        }, 401);
      },
      events: this.events,
      authorizeRequest: async (c, rule) => authorizeRequest(c, rule as AuthRule)
    });
  }
}
