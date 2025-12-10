import { HybridFetcher } from '../../../src/plugins/spider/hybrid-fetcher.js'
import { CrawlContext } from '../../../src/plugins/spider/crawl-context.js'

describe('HybridFetcher', () => {
  let fetcher
  let context

  beforeEach(() => {
    context = new CrawlContext({ userAgent: 'TestBot/1.0' })
    fetcher = new HybridFetcher({ context })
  })

  afterEach(async () => {
    if (fetcher) {
      await fetcher.close()
    }
  })

  describe('JavaScript Detection', () => {
    test('should detect Next.js pages', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Next.js App</title></head>
          <body>
            <div id="__next"></div>
            <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(true)
    })

    test('should detect React apps with empty root', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <div id="root"></div>
            <script src="/static/js/bundle.js"></script>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(true)
    })

    test('should detect Angular apps', () => {
      const html = `
        <!DOCTYPE html>
        <html ng-app="myApp">
          <body ng-controller="MainCtrl">
            <div ng-view></div>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(true)
    })

    test('should detect Vue.js apps', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <div id="app" v-cloak>
              {{ message }}
            </div>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(true)
    })

    test('should detect noscript warnings', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="app"></div>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(true)
    })

    test('should not flag static HTML pages', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Static Page</title></head>
          <body>
            <h1>Welcome</h1>
            <p>This is a static page with real content.</p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(false)
    })

    test('should not flag SSR pages with hydration', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>SSR Page</title></head>
          <body>
            <div id="root">
              <h1>Server Rendered Content</h1>
              <p>This content was rendered on the server.</p>
              <article>
                <h2>Article Title</h2>
                <p>Lots of text content here that makes sense.</p>
              </article>
            </div>
            <script src="/hydrate.js"></script>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(false)
    })

    test('should detect loading spinners', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <div class="loading-spinner"></div>
            <script src="/app.js"></script>
          </body>
        </html>
      `
      expect(fetcher._needsJavaScript(html)).toBe(true)
    })

    test('should handle empty/null HTML', () => {
      expect(fetcher._needsJavaScript('')).toBe(true)
      expect(fetcher._needsJavaScript(null)).toBe(true)
      expect(fetcher._needsJavaScript(undefined)).toBe(true)
    })
  })

  describe('Strategy Modes', () => {
    test('should default to auto strategy', () => {
      expect(fetcher.strategy).toBe('auto')
    })

    test('should accept recker-only strategy', () => {
      fetcher = new HybridFetcher({ context, strategy: 'recker-only' })
      expect(fetcher.strategy).toBe('recker-only')
    })

    test('should accept puppeteer-only strategy', () => {
      fetcher = new HybridFetcher({ context, strategy: 'puppeteer-only' })
      expect(fetcher.strategy).toBe('puppeteer-only')
    })

    test('should respect recker-only and never use puppeteer', async () => {
      fetcher = new HybridFetcher({
        context,
        strategy: 'recker-only',
        httpClient: {
          get: async (url) => ({
            ok: true,
            status: 200,
            text: async () => '<div id="root"></div>',
            headers: { get: () => null, getSetCookie: () => [] }
          })
        }
      })

      const result = await fetcher.fetch('https://example.com/')
      expect(result.method).toBe('http')
    })
  })

  describe('Cookie Synchronization', () => {
    test('should sync cookies after HTTP fetch', async () => {
      fetcher = new HybridFetcher({
        context,
        httpClient: {
          get: async () => ({
            ok: true,
            status: 200,
            text: async () => '<html><body>Content</body></html>',
            headers: {
              get: (name) => name.toLowerCase() === 'set-cookie' ? 'session=abc123' : null,
              getSetCookie: () => ['session=abc123; Path=/']
            }
          })
        }
      })

      await fetcher.fetchWithRecker('https://example.com/')

      const cookies = context.getCookiesForDomain('example.com')
      expect(cookies).toHaveLength(1)
      expect(cookies[0].name).toBe('session')
    })

    test('should use context cookies in HTTP requests', async () => {
      context.setCookies([
        { name: 'auth', value: 'token123', domain: 'api.example.com' }
      ])

      let capturedHeaders = null
      fetcher = new HybridFetcher({
        context,
        httpClient: {
          get: async (url, options) => {
            capturedHeaders = options?.headers
            return {
              ok: true,
              status: 200,
              text: async () => '<html></html>',
              headers: { get: () => null, getSetCookie: () => [] }
            }
          }
        }
      })

      await fetcher.fetchWithRecker('https://api.example.com/data')
      expect(capturedHeaders?.Cookie).toBe('auth=token123')
    })
  })

  describe('Error Handling', () => {
    test('should handle HTTP errors gracefully', async () => {
      fetcher = new HybridFetcher({
        context,
        httpClient: {
          get: async () => ({
            ok: false,
            status: 404,
            text: async () => 'Not Found',
            headers: { get: () => null, getSetCookie: () => [] }
          })
        }
      })

      const result = await fetcher.fetchWithRecker('https://example.com/missing')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(404)
    })

    test('should handle network errors', async () => {
      fetcher = new HybridFetcher({
        context,
        httpClient: {
          get: async () => {
            throw new Error('Network error')
          }
        }
      })

      await expect(fetcher.fetchWithRecker('https://example.com/')).rejects.toThrow('Network error')
    })
  })

  describe('Response Format', () => {
    test('should return consistent response structure from HTTP', async () => {
      fetcher = new HybridFetcher({
        context,
        httpClient: {
          get: async () => ({
            ok: true,
            status: 200,
            text: async () => '<html><body>Hello</body></html>',
            headers: { get: () => null, getSetCookie: () => [] }
          })
        }
      })

      const result = await fetcher.fetchWithRecker('https://example.com/')

      expect(result).toHaveProperty('ok', true)
      expect(result).toHaveProperty('status', 200)
      expect(result).toHaveProperty('html')
      expect(result).toHaveProperty('url')
      expect(result).toHaveProperty('method', 'http')
    })
  })

  describe('Context Sharing', () => {
    test('should share context between fetches', async () => {
      fetcher = new HybridFetcher({
        context,
        httpClient: {
          get: async (url) => {
            if (url.includes('login')) {
              return {
                ok: true,
                status: 200,
                text: async () => 'Logged in',
                headers: {
                  get: () => 'session=logged_in',
                  getSetCookie: () => ['session=logged_in; Path=/']
                }
              }
            }
            return {
              ok: true,
              status: 200,
              text: async () => 'Content',
              headers: { get: () => null, getSetCookie: () => [] }
            }
          }
        }
      })

      await fetcher.fetchWithRecker('https://example.com/login')
      const header = context.getCookieHeader('https://example.com/dashboard')

      expect(header).toBe('session=logged_in')
    })

    test('should allow external context modification', async () => {
      context.setCookies([
        { name: 'external', value: 'injected', domain: 'example.com' }
      ])

      let capturedHeaders = null
      fetcher = new HybridFetcher({
        context,
        httpClient: {
          get: async (url, options) => {
            capturedHeaders = options?.headers
            return {
              ok: true,
              status: 200,
              text: async () => 'OK',
              headers: { get: () => null, getSetCookie: () => [] }
            }
          }
        }
      })

      await fetcher.fetchWithRecker('https://example.com/')
      expect(capturedHeaders?.Cookie).toContain('external=injected')
    })
  })

  describe('Auto Mode Behavior', () => {
    test('should use HTTP first in auto mode', async () => {
      let httpCalled = false

      fetcher = new HybridFetcher({
        context,
        strategy: 'auto',
        httpClient: {
          get: async () => {
            httpCalled = true
            return {
              ok: true,
              status: 200,
              text: async () => '<html><body><h1>Title</h1><p>Content</p></body></html>',
              headers: { get: () => null, getSetCookie: () => [] }
            }
          }
        }
      })

      const result = await fetcher.fetch('https://example.com/')

      expect(httpCalled).toBe(true)
      expect(result.method).toBe('http')
    })
  })

  describe('Cleanup', () => {
    test('should close without errors when no browser started', async () => {
      await expect(fetcher.close()).resolves.not.toThrow()
    })

    test('should be safe to call close multiple times', async () => {
      await fetcher.close()
      await fetcher.close()
      await expect(fetcher.close()).resolves.not.toThrow()
    })
  })

  describe('Configuration', () => {
    test('should create context if not provided', () => {
      fetcher = new HybridFetcher({ userAgent: 'CustomBot/1.0' })
      expect(fetcher.context).toBeInstanceOf(CrawlContext)
      expect(fetcher.context.userAgent).toBe('CustomBot/1.0')
    })

    test('should accept custom timeout', () => {
      fetcher = new HybridFetcher({ context, timeout: 60000 })
      expect(fetcher.timeout).toBe(60000)
    })

    test('should accept custom navigation timeout', () => {
      fetcher = new HybridFetcher({ context, navigationTimeout: 45000 })
      expect(fetcher.navigationTimeout).toBe(45000)
    })
  })
})
