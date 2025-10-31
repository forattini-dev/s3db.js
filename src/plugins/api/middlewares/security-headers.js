/**
 * Security Headers Middleware
 *
 * Adds standard security headers to all responses for enhanced protection.
 * Helps prevent common web vulnerabilities like XSS, clickjacking, and MIME sniffing.
 *
 * Headers included:
 * - Content-Security-Policy (CSP): Prevents XSS and data injection attacks
 * - Strict-Transport-Security (HSTS): Forces HTTPS connections
 * - X-Frame-Options: Prevents clickjacking
 * - X-Content-Type-Options: Prevents MIME sniffing
 * - Referrer-Policy: Controls referer information
 * - X-XSS-Protection: Legacy XSS protection (for older browsers)
 *
 * @example
 * import { createSecurityHeadersMiddleware } from './middlewares/security-headers.js';
 *
 * const middleware = createSecurityHeadersMiddleware({
 *   headers: {
 *     csp: "default-src 'self'; script-src 'self' 'unsafe-inline'",
 *     hsts: { maxAge: 31536000, includeSubDomains: true },
 *     xFrameOptions: 'DENY'
 *   }
 * });
 *
 * app.use('*', middleware);
 */

/**
 * Create security headers middleware
 *
 * @param {Object} config - Security configuration
 * @param {Object} config.headers - Header configuration
 * @param {string} config.headers.csp - Content Security Policy
 * @param {Object} config.headers.hsts - HSTS configuration
 * @param {number} config.headers.hsts.maxAge - HSTS max age in seconds
 * @param {boolean} config.headers.hsts.includeSubDomains - Include subdomains
 * @param {boolean} config.headers.hsts.preload - Enable HSTS preload
 * @param {string} config.headers.xFrameOptions - X-Frame-Options value (DENY, SAMEORIGIN, ALLOW-FROM)
 * @param {string} config.headers.xContentTypeOptions - X-Content-Type-Options (nosniff)
 * @param {string} config.headers.referrerPolicy - Referrer-Policy value
 * @param {string} config.headers.xssProtection - X-XSS-Protection value
 * @returns {Function} Hono middleware
 */
export function createSecurityHeadersMiddleware(config = {}) {
  const defaults = {
    csp: "default-src 'self'",
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xssProtection: '1; mode=block',
    permissionsPolicy: 'geolocation=(), microphone=(), camera=()'
  };

  const settings = {
    ...defaults,
    ...(config.headers || {})
  };

  // Merge HSTS settings
  if (config.headers?.hsts && typeof config.headers.hsts === 'object') {
    settings.hsts = {
      ...defaults.hsts,
      ...config.headers.hsts
    };
  }

  return async (c, next) => {
    // Content Security Policy
    if (settings.csp) {
      c.header('Content-Security-Policy', settings.csp);
    }

    // HTTP Strict Transport Security
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

    // X-Frame-Options
    if (settings.xFrameOptions) {
      c.header('X-Frame-Options', settings.xFrameOptions);
    }

    // X-Content-Type-Options
    if (settings.xContentTypeOptions) {
      c.header('X-Content-Type-Options', settings.xContentTypeOptions);
    }

    // Referrer-Policy
    if (settings.referrerPolicy) {
      c.header('Referrer-Policy', settings.referrerPolicy);
    }

    // X-XSS-Protection (legacy, but still useful for older browsers)
    if (settings.xssProtection) {
      c.header('X-XSS-Protection', settings.xssProtection);
    }

    // Permissions-Policy (formerly Feature-Policy)
    if (settings.permissionsPolicy) {
      c.header('Permissions-Policy', settings.permissionsPolicy);
    }

    await next();
  };
}

export default createSecurityHeadersMiddleware;
