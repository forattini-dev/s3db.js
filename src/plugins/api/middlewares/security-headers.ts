import type { Context, MiddlewareHandler, Next } from 'hono';

export interface HSTSConfig {
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

export interface SecurityHeadersConfig {
  csp?: string | false;
  hsts?: HSTSConfig | false;
  xFrameOptions?: string | false;
  xContentTypeOptions?: string | false;
  referrerPolicy?: string | false;
  xssProtection?: string | false;
  permissionsPolicy?: string | false;
}

export interface SecurityHeadersMiddlewareConfig {
  headers?: SecurityHeadersConfig;
}

interface ResolvedHSTS {
  maxAge: number;
  includeSubDomains: boolean;
  preload: boolean;
}

interface ResolvedSettings {
  csp: string | false;
  hsts: ResolvedHSTS | false;
  xFrameOptions: string | false;
  xContentTypeOptions: string | false;
  referrerPolicy: string | false;
  xssProtection: string | false;
  permissionsPolicy: string | false;
}

export function createSecurityHeadersMiddleware(config: SecurityHeadersMiddlewareConfig = {}): MiddlewareHandler {
  const defaults: ResolvedSettings = {
    csp: "default-src 'self'",
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xssProtection: '1; mode=block',
    permissionsPolicy: 'geolocation=(), microphone=(), camera=()'
  };

  const settings: ResolvedSettings = {
    ...defaults,
    ...(config.headers || {})
  } as ResolvedSettings;

  if (config.headers?.hsts && typeof config.headers.hsts === 'object') {
    settings.hsts = {
      ...(defaults.hsts as ResolvedHSTS),
      ...config.headers.hsts
    };
  }

  return async (c: Context, next: Next): Promise<void | Response> => {
    if (settings.csp) {
      c.header('Content-Security-Policy', settings.csp);
    }

    if (settings.hsts) {
      const hsts = settings.hsts;
      let hstsValue = `max-age=${hsts.maxAge}`;

      if (hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }

      if (hsts.preload) {
        hstsValue += '; preload';
      }

      c.header('Strict-Transport-Security', hstsValue);
    }

    if (settings.xFrameOptions) {
      c.header('X-Frame-Options', settings.xFrameOptions);
    }

    if (settings.xContentTypeOptions) {
      c.header('X-Content-Type-Options', settings.xContentTypeOptions);
    }

    if (settings.referrerPolicy) {
      c.header('Referrer-Policy', settings.referrerPolicy);
    }

    if (settings.xssProtection) {
      c.header('X-XSS-Protection', settings.xssProtection);
    }

    if (settings.permissionsPolicy) {
      c.header('Permissions-Policy', settings.permissionsPolicy);
    }

    await next();
  };
}

export default createSecurityHeadersMiddleware;
