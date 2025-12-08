import { CrawlContext } from '../../../src/plugins/spider/crawl-context.js'

describe('CrawlContext', () => {
  let context

  beforeEach(() => {
    context = new CrawlContext()
  })

  describe('Cookie Management', () => {
    test('should set and retrieve cookies by domain', () => {
      context.setCookies([
        { name: 'session', value: 'abc123', domain: 'example.com' }
      ])

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].name).toBe('session')
      expect(cookies[0].value).toBe('abc123')
    })

    test('should track cookie source', () => {
      context.setCookies([
        { name: 'auth', value: 'token', domain: 'api.example.com' }
      ], 'http')

      const cookies = context.getCookiesForDomain('api.example.com')
      expect(cookies[0].source).toBe('http')
    })

    test('should format cookie header for HTTP requests', () => {
      context.setCookies([
        { name: 'session', value: 'abc', domain: 'example.com' },
        { name: 'user', value: 'john', domain: 'example.com' }
      ])

      const header = context.getCookieHeader('https://example.com/page')
      expect(header).toBe('session=abc; user=john')
    })

    test('should match subdomain cookies', () => {
      context.setCookies([
        { name: 'root', value: '1', domain: '.example.com' }
      ])

      const header = context.getCookieHeader('https://api.example.com/v1')
      expect(header).toBe('root=1')
    })

    test('should not include cookies for different domains', () => {
      context.setCookies([
        { name: 'session', value: 'abc', domain: 'example.com' }
      ])

      const header = context.getCookieHeader('https://other.com/page')
      expect(header).toBe('')
    })

    test('should handle secure cookie flag', () => {
      context.setCookies([
        { name: 'secure_token', value: 'xyz', domain: 'example.com', secure: true }
      ])

      const httpsHeader = context.getCookieHeader('https://example.com/')
      expect(httpsHeader).toBe('secure_token=xyz')

      const httpHeader = context.getCookieHeader('http://example.com/')
      expect(httpHeader).toBe('')
    })

    test('should handle path matching', () => {
      context.setCookies([
        { name: 'admin', value: '1', domain: 'example.com', path: '/admin' },
        { name: 'global', value: '2', domain: 'example.com', path: '/' }
      ])

      const adminHeader = context.getCookieHeader('https://example.com/admin/dashboard')
      expect(adminHeader).toContain('admin=1')
      expect(adminHeader).toContain('global=2')

      const publicHeader = context.getCookieHeader('https://example.com/public')
      expect(publicHeader).toBe('global=2')
    })
  })

  describe('Set-Cookie Header Parsing', () => {
    test('should parse simple Set-Cookie header', () => {
      context.setCookiesFromHeader('session=abc123', 'https://example.com/')

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].name).toBe('session')
      expect(cookies[0].value).toBe('abc123')
    })

    test('should parse Set-Cookie with attributes', () => {
      context.setCookiesFromHeader(
        'auth=token123; Path=/api; Domain=example.com; Secure; HttpOnly; SameSite=Strict',
        'https://example.com/'
      )

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies[0].secure).toBe(true)
      expect(cookies[0].httpOnly).toBe(true)
      expect(cookies[0].sameSite).toBe('Strict')
      expect(cookies[0].path).toBe('/api')
    })

    test('should parse Set-Cookie with Max-Age', () => {
      const now = Date.now()
      context.setCookiesFromHeader('temp=value; Max-Age=3600', 'https://example.com/')

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies[0].expires).toBeGreaterThanOrEqual(now + 3600000 - 1000)
      expect(cookies[0].expires).toBeLessThanOrEqual(now + 3600000 + 1000)
    })

    test('should parse Set-Cookie with Expires', () => {
      const futureDate = 'Wed, 01 Jan 2030 00:00:00 GMT'
      context.setCookiesFromHeader(`perm=value; Expires=${futureDate}`, 'https://example.com/')

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies[0].expires).toBe(new Date(futureDate).getTime())
    })

    test('should handle multiple Set-Cookie headers (array)', () => {
      context.setCookiesFromHeader([
        'session=abc; Path=/',
        'user=john; Path=/'
      ], 'https://example.com/')

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(2)
      expect(cookies.find(c => c.name === 'session')).toBeDefined()
      expect(cookies.find(c => c.name === 'user')).toBeDefined()
    })

    test('should extract domain from URL when not specified', () => {
      context.setCookiesFromHeader('test=value', 'https://api.example.com/v1/users')

      const cookies = context.getCookiesForDomain('api.example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].domain).toBe('api.example.com')
    })

    test('should handle malformed cookies gracefully', () => {
      expect(() => {
        context.setCookiesFromHeader('', 'https://example.com/')
        context.setCookiesFromHeader('invalid', 'https://example.com/')
        context.setCookiesFromHeader(null, 'https://example.com/')
      }).not.toThrow()

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Puppeteer Integration', () => {
    test('should format cookies for puppeteer', () => {
      context.setCookies([
        {
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
          expires: Date.now() + 3600000
        }
      ])

      const puppeteerCookies = context.getCookiesForPuppeteer('https://example.com/')
      expect(puppeteerCookies).toHaveLength(1)
      expect(puppeteerCookies[0]).toMatchObject({
        name: 'session',
        value: 'abc123',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax'
      })
    })

    test('should import cookies from puppeteer format', () => {
      context.importFromPuppeteer([
        {
          name: 'pptr_cookie',
          value: 'xyz',
          domain: '.example.com',
          path: '/',
          secure: false,
          httpOnly: false,
          sameSite: 'None',
          expires: Date.now() / 1000 + 3600
        }
      ])

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].name).toBe('pptr_cookie')
      expect(cookies[0].source).toBe('puppeteer')
    })

    test('should handle puppeteer cookies with session expiry (-1)', () => {
      context.importFromPuppeteer([
        {
          name: 'session',
          value: 'temp',
          domain: 'example.com',
          path: '/',
          expires: -1
        }
      ])

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies[0].expires).toBeUndefined()
    })
  })

  describe('HTTP Client Configuration', () => {
    test('should generate config for createHttpClient', () => {
      context = new CrawlContext({
        userAgent: 'MyBot/1.0',
        proxy: 'http://proxy.example.com:8080'
      })

      context.setCookies([
        { name: 'auth', value: 'token', domain: 'api.example.com' }
      ])

      const config = context.getHttpClientConfig('https://api.example.com/v1')

      expect(config.headers['User-Agent']).toBe('MyBot/1.0')
      expect(config.headers['Cookie']).toBe('auth=token')
      expect(config.proxy).toBe('http://proxy.example.com:8080')
    })

    test('should include consistent anti-detection headers', () => {
      const config = context.getHttpClientConfig('https://example.com/')

      expect(config.headers['Accept']).toBeDefined()
      expect(config.headers['Accept-Language']).toBeDefined()
      expect(config.headers['User-Agent']).toBeDefined()
    })
  })

  describe('Response Processing', () => {
    test('should extract cookies from response headers', () => {
      const mockResponse = {
        headers: {
          get: (name) => {
            if (name.toLowerCase() === 'set-cookie') {
              return 'session=abc123; Path=/; HttpOnly'
            }
            return null
          },
          getSetCookie: () => ['session=abc123; Path=/; HttpOnly']
        }
      }

      context.processResponse(mockResponse, 'https://example.com/login')

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].name).toBe('session')
    })

    test('should handle multiple Set-Cookie from getSetCookie', () => {
      const mockResponse = {
        headers: {
          get: () => null,
          getSetCookie: () => [
            'cookie1=value1; Path=/',
            'cookie2=value2; Path=/'
          ]
        }
      }

      context.processResponse(mockResponse, 'https://example.com/')

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(2)
    })
  })

  describe('Session Persistence', () => {
    test('should serialize to JSON', () => {
      context = new CrawlContext({
        userAgent: 'TestBot/1.0',
        timezone: 'Europe/London'
      })

      context.setCookies([
        { name: 'session', value: 'abc', domain: 'example.com' }
      ])

      const json = context.toJSON()

      expect(json.userAgent).toBe('TestBot/1.0')
      expect(json.timezone).toBe('Europe/London')
      expect(json.cookies).toBeDefined()
      expect(json.cookies.length).toBe(1)
    })

    test('should deserialize from JSON', () => {
      const json = {
        userAgent: 'RestoredBot/1.0',
        timezone: 'Asia/Tokyo',
        viewport: { width: 1280, height: 720 },
        cookies: [
          { name: 'restored', value: 'yes', domain: 'example.com', path: '/' }
        ],
        headers: {
          'Accept': 'text/html',
          'Accept-Language': 'ja-JP'
        }
      }

      const restored = CrawlContext.fromJSON(json)

      expect(restored.userAgent).toBe('RestoredBot/1.0')
      expect(restored.timezone).toBe('Asia/Tokyo')
      expect(restored.viewport).toEqual({ width: 1280, height: 720 })

      const cookies = restored.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].name).toBe('restored')
    })

    test('should handle empty JSON gracefully', () => {
      expect(() => CrawlContext.fromJSON({})).not.toThrow()
      expect(() => CrawlContext.fromJSON(null)).not.toThrow()
    })
  })

  describe('Anti-Detection Consistency', () => {
    test('should generate realistic User-Agent', () => {
      expect(context.userAgent).toMatch(/Mozilla\/5\.0/)
    })

    test('should provide consistent viewport', () => {
      expect(context.viewport).toHaveProperty('width')
      expect(context.viewport).toHaveProperty('height')
      expect(context.viewport.width).toBeGreaterThan(0)
      expect(context.viewport.height).toBeGreaterThan(0)
    })

    test('should maintain timezone setting', () => {
      context = new CrawlContext({ timezone: 'America/New_York' })
      expect(context.timezone).toBe('America/New_York')
    })

    test('should allow custom headers', () => {
      context = new CrawlContext({
        headers: { 'X-Custom': 'value' }
      })

      const config = context.getHttpClientConfig('https://example.com/')
      expect(config.headers['X-Custom']).toBe('value')
    })
  })

  describe('Cookie Expiration', () => {
    test('should not include expired cookies in header', () => {
      context.setCookies([
        {
          name: 'expired',
          value: 'old',
          domain: 'example.com',
          expires: Date.now() - 10000
        },
        {
          name: 'valid',
          value: 'new',
          domain: 'example.com',
          expires: Date.now() + 10000
        }
      ])

      const header = context.getCookieHeader('https://example.com/')
      expect(header).toBe('valid=new')
    })

    test('should include session cookies (no expiry)', () => {
      context.setCookies([
        { name: 'session', value: 'temp', domain: 'example.com' }
      ])

      const header = context.getCookieHeader('https://example.com/')
      expect(header).toBe('session=temp')
    })
  })

  describe('Edge Cases', () => {
    test('should handle cookie value with special characters', () => {
      context.setCookiesFromHeader('data=hello%20world; Path=/', 'https://example.com/')

      const header = context.getCookieHeader('https://example.com/')
      expect(header).toBe('data=hello%20world')
    })

    test('should handle domain with leading dot', () => {
      context.setCookies([
        { name: 'subdomain', value: '1', domain: '.example.com' }
      ])

      const headerSub = context.getCookieHeader('https://sub.example.com/')
      expect(headerSub).toBe('subdomain=1')

      const headerMain = context.getCookieHeader('https://example.com/')
      expect(headerMain).toBe('subdomain=1')
    })

    test('should update existing cookie', () => {
      context.setCookies([
        { name: 'token', value: 'old', domain: 'example.com' }
      ])
      context.setCookies([
        { name: 'token', value: 'new', domain: 'example.com' }
      ])

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].value).toBe('new')
    })

    test('should clear all cookies', () => {
      context.setCookies([
        { name: 'a', value: '1', domain: 'example.com' },
        { name: 'b', value: '2', domain: 'other.com' }
      ])

      context.clearCookies()

      expect(context.getCookiesForDomain('example.com')).toHaveLength(0)
      expect(context.getCookiesForDomain('other.com')).toHaveLength(0)
    })

    test('should clear cookies for specific domain', () => {
      context.setCookies([
        { name: 'a', value: '1', domain: 'example.com' },
        { name: 'b', value: '2', domain: 'other.com' }
      ])

      context.clearCookies('example.com')

      expect(context.getCookiesForDomain('example.com')).toHaveLength(0)
      expect(context.getCookiesForDomain('other.com')).toHaveLength(1)
    })
  })
})
