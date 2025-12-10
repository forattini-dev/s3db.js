import type { Context, Next, MiddlewareHandler } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
import { createLogger } from '../../../concerns/logger.js';

const logger = createLogger({ name: 'PathAuthMatcher', level: 'info' });

export interface AuthRule {
  path: string;
  methods: string[];
  required: boolean;
  strategy?: string;
  priorities?: Record<string, number>;
  unauthorizedBehavior?: string | {
    html?: string;
    json?: { status?: number; error?: string; message?: string };
    loginPath?: string;
  };
}

export interface AuthMiddlewareEntry {
  name: string;
  middleware: MiddlewareHandler;
}

export interface PathAuthOptions {
  rules?: AuthRule[];
  authMiddlewares?: Record<string, MiddlewareHandler>;
  unauthorizedHandler?: ((c: Context, message: string) => Response | Promise<Response>) | null;
  events?: {
    emitAuthEvent: (event: string, data: Record<string, unknown>) => void;
  } | null;
}

function calculateSpecificity(pattern: string): number {
  let score = 0;

  if (!pattern.includes('*') && !pattern.includes(':')) {
    score += 10000;
  }

  const segments = pattern.split('/').filter(s => s.length > 0);
  score += segments.length * 100;

  const singleWildcards = (pattern.match(/(?<!\*)\*(?!\*)/g) || []).length;
  const doubleWildcards = (pattern.match(/\*\*/g) || []).length;
  score -= singleWildcards * 10;
  score -= doubleWildcards * 50;

  const params = (pattern.match(/:[^/]+/g) || []).length;
  score -= params * 5;

  return score;
}

function patternToRegex(pattern: string): RegExp {
  let regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  regexPattern = regexPattern.replace(/:([^/]+)/g, '([^/]+)');

  regexPattern = regexPattern
    .replace(/\*\*/g, '___GLOBSTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___GLOBSTAR___/g, '.*');

  if (pattern.endsWith('/**')) {
    regexPattern = regexPattern.replace(/\/\.\*$/, '(?:/.*)?');
  }

  regexPattern = '^' + regexPattern + '$';

  return new RegExp(regexPattern);
}

export function matchPath(path: string, pattern: string): boolean {
  if (path === pattern) return true;

  const regex = patternToRegex(pattern);
  return regex.test(path);
}

export function findAuthRule(path: string, rules: AuthRule[] = []): (AuthRule & { specificity: number }) | null {
  if (!rules || rules.length === 0) {
    return null;
  }

  const matches = rules
    .map(rule => ({
      ...rule,
      specificity: calculateSpecificity(rule.path)
    }))
    .filter(rule => matchPath(path, rule.path))
    .sort((a, b) => b.specificity - a.specificity);

  return matches.length > 0 ? matches[0]! : null;
}

export function createPathBasedAuthMiddleware(options: PathAuthOptions = {}): MiddlewareHandler {
  const {
    rules = [],
    authMiddlewares = {},
    unauthorizedHandler = null,
    events = null
  } = options;

  const publicPaths = new Set<string>();
  rules.forEach(rule => {
    if (!rule.required && !rule.path.includes('*') && !rule.path.includes(':')) {
      publicPaths.add(rule.path);
    }
  });

  return async (c: Context, next: Next): Promise<Response | void> => {
    const currentPath = c.req.path;

    if (publicPaths.has(currentPath)) {
      return await next();
    }

    const rule = findAuthRule(currentPath, rules);

    if (!rule) {
      return await next();
    }

    if (!rule.required) {
      return await next();
    }

    if (rule.methods.length === 0 && rule.required) {
      if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
        logger.error(`[Path Auth] Invalid rule: path "${rule.path}" requires auth but has no methods`);
      }
      if (unauthorizedHandler) {
        return unauthorizedHandler(c, 'Configuration error');
      }
      return c.json({ error: 'Configuration error' }, 500);
    }

    const allowedMiddlewares: AuthMiddlewareEntry[] = rule.methods
      .map(methodName => ({
        name: methodName,
        middleware: authMiddlewares[methodName]
      }))
      .filter((m): m is AuthMiddlewareEntry => !!m.middleware);

    if (allowedMiddlewares.length === 0) {
      if (c.get('logLevel') === 'debug' || c.get('logLevel') === 'trace') {
        logger.error(`[Path Auth] No middlewares found for methods: ${rule.methods.join(', ')}`);
      }
      if (unauthorizedHandler) {
        return unauthorizedHandler(c, 'No auth methods available');
      }
      return c.json({ error: 'No auth methods available' }, 500);
    }

    const strategy = rule.strategy || 'any';
    const priorities = rule.priorities || {};

    if (strategy === 'priority' && Object.keys(priorities).length > 0) {
      allowedMiddlewares.sort((a, b) => {
        const priorityA = priorities[a.name] || 999;
        const priorityB = priorities[b.name] || 999;
        return priorityA - priorityB;
      });
    }

    for (const { name, middleware } of allowedMiddlewares) {
      let authSuccess = false;
      const tempNext = async () => {
        authSuccess = true;
      };

      await middleware(c, tempNext);

      if (authSuccess && c.get('user')) {
        if (events) {
          events.emitAuthEvent('success', {
            method: name,
            user: c.get('user'),
            path: currentPath,
            rule: rule.path
          });
        }
        return await next();
      }
    }

    if (events) {
      events.emitAuthEvent('failure', {
        path: currentPath,
        rule: rule.path,
        allowedMethods: rule.methods,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip')
      });
    }

    const acceptHeader = c.req.header('accept') || '';
    const acceptsHtml = acceptHeader.includes('text/html');

    const unauthorizedBehavior = rule.unauthorizedBehavior || 'auto';

    if (unauthorizedBehavior === 'auto') {
      if (acceptsHtml) {
        const returnTo = encodeURIComponent(c.req.path);
        return c.redirect(`/auth/login?returnTo=${returnTo}`);
      } else {
        return c.json({
          error: 'Unauthorized',
          message: `Authentication required. Allowed methods: ${rule.methods.join(', ')}`
        }, 401);
      }
    }

    if (typeof unauthorizedBehavior === 'object') {
      if (acceptsHtml && unauthorizedBehavior.html === 'redirect') {
        const returnTo = encodeURIComponent(c.req.path);
        const loginPath = unauthorizedBehavior.loginPath || '/auth/login';
        return c.redirect(`${loginPath}?returnTo=${returnTo}`);
      }

      if (!acceptsHtml && unauthorizedBehavior.json) {
        return c.json(
          unauthorizedBehavior.json,
          (unauthorizedBehavior.json.status || 401) as Parameters<typeof c.json>[1]
        );
      }
    }

    if (unauthorizedHandler) {
      return unauthorizedHandler(c, `Authentication required. Allowed methods: ${rule.methods.join(', ')}`);
    }

    return c.json({
      error: 'Unauthorized',
      message: `Authentication required. Allowed methods: ${rule.methods.join(', ')}`
    }, 401);
  };
}

export default {
  matchPath,
  findAuthRule,
  calculateSpecificity,
  createPathBasedAuthMiddleware
};
