import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createSecurityHeadersMiddleware } from '../../../src/plugins/api/middlewares/security-headers.js';

function createMockContext() {
  const headers = new Map<string, string>();
  return {
    header: vi.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
    _headers: headers,
    getHeader: (name: string) => headers.get(name)
  };
}

describe('createSecurityHeadersMiddleware', () => {
  describe('default headers', () => {
    test('sets all default security headers', async () => {
      const middleware = createSecurityHeadersMiddleware();
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'self'");
      expect(ctx.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(ctx.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(ctx.header).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(ctx.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(ctx.header).toHaveBeenCalledWith('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      expect(next).toHaveBeenCalled();
    });

    test('sets default HSTS header', async () => {
      const middleware = createSecurityHeadersMiddleware();
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    });
  });

  describe('custom headers', () => {
    test('allows custom CSP', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          csp: "default-src 'self'; script-src 'unsafe-inline'"
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'unsafe-inline'"
      );
    });

    test('allows custom X-Frame-Options', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          xFrameOptions: 'SAMEORIGIN'
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
    });

    test('allows custom Referrer-Policy', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          referrerPolicy: 'no-referrer'
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
    });
  });

  describe('disabling headers', () => {
    test('can disable CSP', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          csp: false
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).not.toHaveBeenCalledWith('Content-Security-Policy', expect.any(String));
    });

    test('can disable HSTS', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          hsts: false
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).not.toHaveBeenCalledWith('Strict-Transport-Security', expect.any(String));
    });

    test('can disable X-Frame-Options', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          xFrameOptions: false
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).not.toHaveBeenCalledWith('X-Frame-Options', expect.any(String));
    });

    test('can disable multiple headers', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          csp: false,
          hsts: false,
          xssProtection: false
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      // Disabled headers should not be set
      const headerCalls = ctx.header.mock.calls.map(([name]) => name);
      expect(headerCalls).not.toContain('Content-Security-Policy');
      expect(headerCalls).not.toContain('Strict-Transport-Security');
      expect(headerCalls).not.toContain('X-XSS-Protection');

      // Remaining headers should still be set
      expect(headerCalls).toContain('X-Frame-Options');
      expect(headerCalls).toContain('X-Content-Type-Options');
    });
  });

  describe('HSTS configuration', () => {
    test('custom maxAge', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          hsts: { maxAge: 86400 }
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('max-age=86400')
      );
    });

    test('without includeSubDomains', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          hsts: { maxAge: 31536000, includeSubDomains: false }
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000'
      );
    });

    test('with preload', async () => {
      const middleware = createSecurityHeadersMiddleware({
        headers: {
          hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
        }
      });
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(ctx.header).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    });
  });

  describe('middleware execution', () => {
    test('calls next()', async () => {
      const middleware = createSecurityHeadersMiddleware();
      const ctx = createMockContext();
      const next = vi.fn();

      await middleware(ctx as any, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    test('headers are set before next() is called', async () => {
      const middleware = createSecurityHeadersMiddleware();
      const ctx = createMockContext();
      let headersSetBeforeNext = 0;
      const next = vi.fn(() => {
        headersSetBeforeNext = ctx.header.mock.calls.length;
      });

      await middleware(ctx as any, next);

      expect(headersSetBeforeNext).toBeGreaterThan(0);
    });
  });
});
