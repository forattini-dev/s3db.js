/**
 * Security Headers Middleware (Helmet-like)
 *
 * Adds security headers to HTTP responses:
 * - Content-Security-Policy (CSP)
 * - X-Frame-Options (clickjacking)
 * - X-Content-Type-Options (MIME sniffing)
 * - Strict-Transport-Security (HSTS)
 * - Referrer-Policy
 * - X-DNS-Prefetch-Control
 * - X-Download-Options
 * - X-Permitted-Cross-Domain-Policies
 * - X-XSS-Protection
 * - Permissions-Policy
 */

/**
 * Create security headers middleware
 * @param {Object} config - Security configuration
 * @returns {Function} Hono middleware
 */
export function createSecurityMiddleware(config = {}) {
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
    frameguard = { action: 'deny' },
    noSniff = true,
    hsts = {
      maxAge: 15552000, // 180 days
      includeSubDomains: true,
      preload: false
    },
    referrerPolicy = { policy: 'no-referrer' },
    dnsPrefetchControl = { allow: false },
    ieNoOpen = true,
    permittedCrossDomainPolicies = { policy: 'none' },
    xssFilter = { mode: 'block' },
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

  return async (c, next) => {
    // X-Content-Type-Options: nosniff (MIME sniffing protection)
    if (noSniff) {
      c.header('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options (clickjacking protection)
    if (frameguard) {
      const action = frameguard.action.toUpperCase();
      if (action === 'DENY') {
        c.header('X-Frame-Options', 'DENY');
      } else if (action === 'SAMEORIGIN') {
        c.header('X-Frame-Options', 'SAMEORIGIN');
      }
    }

    // Strict-Transport-Security (HSTS - force HTTPS)
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

    // Referrer-Policy (privacy)
    if (referrerPolicy) {
      c.header('Referrer-Policy', referrerPolicy.policy);
    }

    // X-DNS-Prefetch-Control (DNS leak protection)
    if (dnsPrefetchControl) {
      const value = dnsPrefetchControl.allow ? 'on' : 'off';
      c.header('X-DNS-Prefetch-Control', value);
    }

    // X-Download-Options (IE8+ download security)
    if (ieNoOpen) {
      c.header('X-Download-Options', 'noopen');
    }

    // X-Permitted-Cross-Domain-Policies (Flash/PDF security)
    if (permittedCrossDomainPolicies) {
      c.header('X-Permitted-Cross-Domain-Policies', permittedCrossDomainPolicies.policy);
    }

    // X-XSS-Protection (legacy XSS filter)
    if (xssFilter) {
      const mode = xssFilter.mode;
      c.header('X-XSS-Protection', mode === 'block' ? '1; mode=block' : '0');
    }

    // Permissions-Policy (modern feature policy)
    if (permissionsPolicy && permissionsPolicy.features) {
      const features = permissionsPolicy.features;
      const policies = [];

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

    // Content-Security-Policy (CSP)
    if (contentSecurityPolicy && contentSecurityPolicy.enabled !== false && contentSecurityPolicy.directives) {
      const cspParts = [];
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
