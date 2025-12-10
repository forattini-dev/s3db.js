/**
 * Identity Provider Middleware
 * Session validation and authentication middleware
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import type { SessionManager, ValidateSessionResult, SessionRecord } from '../session-manager.js';

export interface SessionAuthOptions {
  required?: boolean;
  requireAdmin?: boolean;
  redirectTo?: string;
}

export interface CSRFProtectionOptions {
  excludePaths?: string[];
}

export interface SessionUser {
  id?: string;
  name?: string;
  email?: string;
  isAdmin?: boolean;
  [key: string]: any;
}

export interface SessionContextVariables {
  user: SessionUser | null;
  session: SessionRecord | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export function sessionAuth(sessionManager: SessionManager, options: SessionAuthOptions = {}): MiddlewareHandler {
  const {
    required = false,
    requireAdmin = false,
    redirectTo = '/login'
  } = options;

  return async (c: Context, next: Next): Promise<any> => {
    const sessionId = sessionManager.getSessionIdFromRequest(c.req as any);

    let user: SessionUser | null = null;
    let session: SessionRecord | null = null;

    if (sessionId) {
      const result: ValidateSessionResult = await sessionManager.validateSession(sessionId);

      if (result.valid) {
        session = result.session;
        user = result.session?.metadata || null;
      } else {
        sessionManager.clearSessionCookie(c as any);

        if (required) {
          const currentUrl = c.req.url;
          return c.redirect(`${redirectTo}?redirect=${encodeURIComponent(currentUrl)}&error=${encodeURIComponent('Your session has expired. Please log in again.')}`);
        }
      }
    }

    if (required && !user) {
      const currentUrl = c.req.url;
      return c.redirect(`${redirectTo}?redirect=${encodeURIComponent(currentUrl)}`);
    }

    if (requireAdmin && (!user || !user.isAdmin)) {
      return c.html('<h1>403 Forbidden</h1><p>You do not have permission to access this page.</p>', 403);
    }

    c.set('user', user);
    c.set('session', session);
    c.set('isAuthenticated', !!user);
    c.set('isAdmin', user?.isAdmin || false);

    await next();
  };
}

export function adminOnly(sessionManager: SessionManager): MiddlewareHandler {
  return sessionAuth(sessionManager, {
    required: true,
    requireAdmin: true
  });
}

export function optionalAuth(sessionManager: SessionManager): MiddlewareHandler {
  return sessionAuth(sessionManager, {
    required: false,
    requireAdmin: false
  });
}

export function csrfProtection(options: CSRFProtectionOptions = {}): MiddlewareHandler {
  const {
    excludePaths = []
  } = options;

  return async (c: Context, next: Next) => {
    const method = c.req.method;
    const path = c.req.path;

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      await next();
      return;
    }

    if (excludePaths.some(p => path.startsWith(p))) {
      await next();
      return;
    }

    await next();
  };
}

export default {
  sessionAuth,
  adminOnly,
  optionalAuth,
  csrfProtection
};
