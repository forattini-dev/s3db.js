/**
 * Create security headers middleware (Helmet-like)
 * @param {object} security - Security configuration object
 * @returns {function} Hono middleware
 */
export async function createSecurityMiddleware(security) {
  return async (c, next) => {
    // X-Content-Type-Options: nosniff (MIME sniffing protection)
    if (security.noSniff) {
      c.header('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options (clickjacking protection)
    if (security.frameguard) {
      const action = security.frameguard.action.toUpperCase();
      if (action === 'DENY') {
        c.header('X-Frame-Options', 'DENY');
      } else if (action === 'SAMEORIGIN') {
        c.header('X-Frame-Options', 'SAMEORIGIN');
      }
    }

    // Strict-Transport-Security (HSTS - force HTTPS)
    if (security.hsts) {
      const parts = [`max-age=${security.hsts.maxAge}`];
      if (security.hsts.includeSubDomains) {
        parts.push('includeSubDomains');
      }
      if (security.hsts.preload) {
        parts.push('preload');
      }
      c.header('Strict-Transport-Security', parts.join('; '));
    }

    // Referrer-Policy (privacy)
    if (security.referrerPolicy) {
      c.header('Referrer-Policy', security.referrerPolicy.policy);
    }

    // X-DNS-Prefetch-Control (DNS leak protection)
    if (security.dnsPrefetchControl) {
      const value = security.dnsPrefetchControl.allow ? 'on' : 'off';
      c.header('X-DNS-Prefetch-Control', value);
    }

    // X-Download-Options (IE8+ download security)
    if (security.ieNoOpen) {
      c.header('X-Download-Options', 'noopen');
    }

    // X-Permitted-Cross-Domain-Policies (Flash/PDF security)
    if (security.permittedCrossDomainPolicies) {
      c.header('X-Permitted-Cross-Domain-Policies', security.permittedCrossDomainPolicies.policy);
    }

    // X-XSS-Protection (legacy XSS filter)
    if (security.xssFilter) {
      const mode = security.xssFilter.mode;
      c.header('X-XSS-Protection', mode === 'block' ? '1; mode=block' : '0');
    }

    // Permissions-Policy (modern feature policy)
    if (security.permissionsPolicy && security.permissionsPolicy.features) {
      const features = security.permissionsPolicy.features;
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
    const cspConfig = security.contentSecurityPolicy;

    if (cspConfig && cspConfig.enabled !== false && cspConfig.directives) {
      const cspParts = [];
      for (const [directive, values] of Object.entries(cspConfig.directives)) {
        if (Array.isArray(values) && values.length > 0) {
          cspParts.push(`${directive} ${values.join(' ')}`);
        } else if (typeof values === 'string') {
          cspParts.push(`${directive} ${values}`);
        }
      }

      if (cspConfig.reportUri) {
        cspParts.push(`report-uri ${cspConfig.reportUri}`);
      }

      if (cspParts.length > 0) {
        const cspValue = cspParts.join('; ');
        const headerName = cspConfig.reportOnly
          ? 'Content-Security-Policy-Report-Only'
          : 'Content-Security-Policy';
        c.header(headerName, cspValue);
      }
    }

    await next();
  };
}
