import type { Context, Next, MiddlewareHandler } from 'hono';

export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'font-src'?: string[];
  'connect-src'?: string[];
  'frame-src'?: string[];
  'object-src'?: string[];
  'media-src'?: string[];
  'worker-src'?: string[];
  'child-src'?: string[];
  'form-action'?: string[];
  'frame-ancestors'?: string[];
  'base-uri'?: string[];
  'manifest-src'?: string[];
  [key: string]: string[] | string | undefined;
}

export interface ContentSecurityPolicyConfig {
  enabled?: boolean;
  directives?: CSPDirectives;
  reportOnly?: boolean;
  reportUri?: string | null;
}

export interface FrameguardConfig {
  action: 'deny' | 'sameorigin';
}

export interface HstsConfig {
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

export interface ReferrerPolicyConfig {
  policy: string;
}

export interface DnsPrefetchControlConfig {
  allow: boolean;
}

export interface PermittedCrossDomainPoliciesConfig {
  policy: string;
}

export interface XssFilterConfig {
  mode: 'block' | 'disabled';
}

export interface PermissionsPolicyConfig {
  features?: Record<string, string[]>;
}

export interface SecurityConfig {
  contentSecurityPolicy?: ContentSecurityPolicyConfig;
  frameguard?: FrameguardConfig | false;
  noSniff?: boolean;
  hsts?: HstsConfig | false;
  referrerPolicy?: ReferrerPolicyConfig | false;
  dnsPrefetchControl?: DnsPrefetchControlConfig | false;
  ieNoOpen?: boolean;
  permittedCrossDomainPolicies?: PermittedCrossDomainPoliciesConfig | false;
  xssFilter?: XssFilterConfig | false;
  permissionsPolicy?: PermissionsPolicyConfig | false;
}

export function createSecurityMiddleware(config: SecurityConfig = {}): MiddlewareHandler {
  const {
    contentSecurityPolicy = {
      enabled: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:']
      },
      reportOnly: false,
      reportUri: null
    },
    frameguard = { action: 'deny' as const },
    noSniff = true,
    hsts = {
      maxAge: 15552000,
      includeSubDomains: true,
      preload: false
    },
    referrerPolicy = { policy: 'no-referrer' },
    dnsPrefetchControl = { allow: false },
    ieNoOpen = true,
    permittedCrossDomainPolicies = { policy: 'none' },
    xssFilter = { mode: 'block' as const },
    permissionsPolicy = {
      features: {
        geolocation: [],
        microphone: [],
        camera: [],
        payment: [],
        usb: []
      }
    }
  } = config;

  return async (c: Context, next: Next): Promise<void> => {
    if (noSniff) {
      c.header('X-Content-Type-Options', 'nosniff');
    }

    if (frameguard) {
      const action = frameguard.action.toUpperCase();
      if (action === 'DENY') {
        c.header('X-Frame-Options', 'DENY');
      } else if (action === 'SAMEORIGIN') {
        c.header('X-Frame-Options', 'SAMEORIGIN');
      }
    }

    if (hsts) {
      const parts = [`max-age=${hsts.maxAge}`];
      if (hsts.includeSubDomains) {
        parts.push('includeSubDomains');
      }
      if (hsts.preload) {
        parts.push('preload');
      }
      c.header('Strict-Transport-Security', parts.join('; '));
    }

    if (referrerPolicy) {
      c.header('Referrer-Policy', referrerPolicy.policy);
    }

    if (dnsPrefetchControl) {
      const value = dnsPrefetchControl.allow ? 'on' : 'off';
      c.header('X-DNS-Prefetch-Control', value);
    }

    if (ieNoOpen) {
      c.header('X-Download-Options', 'noopen');
    }

    if (permittedCrossDomainPolicies) {
      c.header('X-Permitted-Cross-Domain-Policies', permittedCrossDomainPolicies.policy);
    }

    if (xssFilter) {
      const mode = xssFilter.mode;
      c.header('X-XSS-Protection', mode === 'block' ? '1; mode=block' : '0');
    }

    if (permissionsPolicy && permissionsPolicy.features) {
      const features = permissionsPolicy.features;
      const policies: string[] = [];

      for (const [feature, allowList] of Object.entries(features)) {
        if (Array.isArray(allowList)) {
          const value = allowList.length === 0
            ? `${feature}=()`
            : `${feature}=(${allowList.join(' ')})`;
          policies.push(value);
        }
      }

      if (policies.length > 0) {
        c.header('Permissions-Policy', policies.join(', '));
      }
    }

    if (contentSecurityPolicy && contentSecurityPolicy.enabled !== false && contentSecurityPolicy.directives) {
      const cspParts: string[] = [];
      for (const [directive, values] of Object.entries(contentSecurityPolicy.directives)) {
        if (Array.isArray(values) && values.length > 0) {
          cspParts.push(`${directive} ${values.join(' ')}`);
        } else if (typeof values === 'string') {
          cspParts.push(`${directive} ${values}`);
        }
      }

      if (contentSecurityPolicy.reportUri) {
        cspParts.push(`report-uri ${contentSecurityPolicy.reportUri}`);
      }

      if (cspParts.length > 0) {
        const cspValue = cspParts.join('; ');
        const headerName = contentSecurityPolicy.reportOnly
          ? 'Content-Security-Policy-Report-Only'
          : 'Content-Security-Policy';
        c.header(headerName, cspValue);
      }
    }

    await next();
  };
}
