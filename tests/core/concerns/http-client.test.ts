import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createHttpClient,
  createHttpClientSync,
  httpGet,
  httpPost,
  isReckerAvailable,
  getReckerCurlImpersonateStatus,
  ensureReckerCurlImpersonate,
  preloadRecker,
  FetchFallback,
  ReckerWrapper
} from '#src/concerns/http-client.js';

describe('HTTP Client Wrapper', () => {
  describe('FetchFallback', () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should make GET requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' })
      });

      const client = new FetchFallback({ baseUrl: 'https://api.example.com' });
      const response = await client.get('/users');

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 's3db-http-client'
          })
        })
      );
    });

    it('should make POST requests with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201
      });

      const client = new FetchFallback({ baseUrl: 'https://api.example.com' });
      const response = await client.post('/users', {
        body: { name: 'John' }
      });

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: '{"name":"John"}'
        })
      );
    });

    it('should add bearer token authentication', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const client = new FetchFallback({
        baseUrl: 'https://api.example.com',
        auth: {
          type: 'bearer',
          token: 'my-secret-token'
        }
      });

      await client.get('/protected');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-secret-token'
          })
        })
      );
    });

    it('should add basic authentication', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const client = new FetchFallback({
        baseUrl: 'https://api.example.com',
        auth: {
          type: 'basic',
          username: 'user',
          password: 'pass'
        }
      });

      await client.get('/protected');

      const expectedCredentials = Buffer.from('user:pass').toString('base64');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedCredentials}`
          })
        })
      );
    });

    it('should add API key authentication', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const client = new FetchFallback({
        baseUrl: 'https://api.example.com',
        auth: {
          type: 'apikey',
          header: 'X-API-Key',
          value: 'my-api-key'
        }
      });

      await client.get('/protected');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'my-api-key'
          })
        })
      );
    });

    it('should retry on 429 status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map()
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200
        });

      const client = new FetchFallback({
        retry: {
          maxAttempts: 3,
          delay: 10, // Short delay for tests
          backoff: 'fixed'
        }
      });

      const response = await client.get('https://api.example.com/test');

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 status', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Map()
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          headers: new Map()
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200
        });

      const client = new FetchFallback({
        retry: {
          maxAttempts: 3,
          delay: 10,
          backoff: 'fixed'
        }
      });

      const response = await client.get('https://api.example.com/test');

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should respect Retry-After header (seconds)', async () => {
      const startTime = Date.now();

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Map([['Retry-After', '1']]) // 1 second
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200
        });

      // Mock headers.get for the response
      mockFetch.mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 429,
        headers: { get: (name) => name === 'Retry-After' ? '0.05' : null } // 50ms
      })).mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const client = new FetchFallback({
        retry: {
          maxAttempts: 3,
          delay: 10,
          retryAfter: true
        }
      });

      await client.get('https://api.example.com/test');

      // Should have waited for Retry-After
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should stop retrying after max attempts', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Map()
      });

      const client = new FetchFallback({
        retry: {
          maxAttempts: 2,
          delay: 10,
          backoff: 'fixed'
        }
      });

      const response = await client.get('https://api.example.com/test');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200
        });

      const client = new FetchFallback({
        retry: {
          maxAttempts: 3,
          delay: 10,
          backoff: 'fixed'
        }
      });

      const response = await client.get('https://api.example.com/test');

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after all retries exhausted on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const client = new FetchFallback({
        retry: {
          maxAttempts: 2,
          delay: 10,
          backoff: 'fixed'
        }
      });

      await expect(client.get('https://api.example.com/test')).rejects.toThrow('Network error');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Map()
      });

      const client = new FetchFallback({
        retry: {
          maxAttempts: 3,
          delay: 10
        }
      });

      const response = await client.get('https://api.example.com/test');

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const delays = [];
      const originalSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0); // Execute immediately for tests
      });

      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, headers: new Map() })
        .mockResolvedValueOnce({ ok: false, status: 500, headers: new Map() })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const client = new FetchFallback({
        retry: {
          maxAttempts: 3,
          delay: 100,
          backoff: 'exponential',
          jitter: false
        }
      });

      await client.get('https://api.example.com/test');

      // First retry: 100ms, Second retry: 200ms (exponential)
      // Note: delays include timeout AbortController delays too
      const retryDelays = delays.filter(d => d >= 100);
      expect(retryDelays.length).toBeGreaterThanOrEqual(2);
    });

    it('should support all HTTP methods', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const client = new FetchFallback({ baseUrl: 'https://api.example.com' });

      await client.get('/test');
      await client.post('/test', { body: {} });
      await client.put('/test', { body: {} });
      await client.patch('/test', { body: {} });
      await client.delete('/test');

      expect(mockFetch).toHaveBeenCalledTimes(5);

      const methods = mockFetch.mock.calls.map(call => call[1].method);
      expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    });
  });

  describe('ReckerWrapper', () => {
    it('should not force curl impersonation by default', () => {
      const mockClient = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        request: vi.fn()
      };

      const createClient = vi.fn().mockReturnValue(mockClient);
      const wrapper = new ReckerWrapper({
        baseUrl: 'https://api.example.com',
        proxy: ['http://proxy1:8080', 'socks5://proxy2:1080']
      }, {
        createClient
      } as any);

      expect(wrapper).toBeDefined();
      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
        useCurl: undefined,
        proxy: ['http://proxy1:8080', 'socks5://proxy2:1080']
      }));
    });

    it('should allow disabling curl impersonation', () => {
      const mockClient = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        request: vi.fn()
      };

      const createClient = vi.fn().mockReturnValue(mockClient);
      new ReckerWrapper({
        baseUrl: 'https://api.example.com',
        useCurl: false
      }, {
        createClient
      } as any);

      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
        useCurl: false
      }));
    });

    it('should pass through full recker client options', () => {
      const mockClient = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
        request: vi.fn()
      };

      const createClient = vi.fn().mockReturnValue(mockClient);
      new ReckerWrapper({
        baseUrl: 'https://api.example.com',
        recker: {
          http2: { enabled: true },
          dns: { servers: ['1.1.1.1'] },
          searchParams: { env: 'test' }
        }
      }, {
        createClient
      } as any);

      expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
        baseUrl: 'https://api.example.com',
        http2: { enabled: true },
        dns: { servers: ['1.1.1.1'] },
        searchParams: { env: 'test' }
      }));
    });

    it('should pass through full recker request options', async () => {
      const mockClient = {
        get: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
        post: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
        put: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
        patch: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
        delete: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
        request: vi.fn().mockResolvedValue({ ok: true, status: 200 })
      };

      const createClient = vi.fn().mockReturnValue(mockClient);
      const wrapper = new ReckerWrapper({}, { createClient } as any);

      await wrapper.request('https://api.example.com/data', {
        method: 'OPTIONS',
        recker: {
          searchParams: { page: 1 },
          http2: { enabled: true }
        }
      });

      expect(mockClient.request).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          searchParams: { page: 1 },
          http2: { enabled: true }
        })
      );
    });
  });

  describe('createHttpClient', () => {
    it('should create a client instance', async () => {
      const client = await createHttpClient({
        baseUrl: 'https://api.example.com'
      });

      expect(client).toBeDefined();
      expect(typeof client.get).toBe('function');
      expect(typeof client.post).toBe('function');
    });

    it('should check if recker is available', async () => {
      const available = await isReckerAvailable();
      // In tests, recker should be available since it's in dependencies
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Quick functions', () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'test' })
      });
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('FetchFallback get should work directly', async () => {
      const client = new FetchFallback();
      const response = await client.get('https://api.example.com/test');
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('FetchFallback post should work directly', async () => {
      const client = new FetchFallback();
      const response = await client.post('https://api.example.com/test', { body: { name: 'test' } });
      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Integration with recker', () => {
    it('should use ReckerWrapper when recker is available', async () => {
      // Preload to ensure recker is loaded
      const isAvailable = await preloadRecker();

      if (isAvailable) {
        const client = await createHttpClient({
          baseUrl: 'https://api.example.com'
        });

        expect(client).toBeInstanceOf(ReckerWrapper);
        expect(typeof client.scrape).toBe('function');
      } else {
        const client = await createHttpClient({
          baseUrl: 'https://api.example.com'
        });

        expect(client).toBeInstanceOf(FetchFallback);
      }
    });

    it('should provide scrape method only with recker', async () => {
      const isAvailable = await isReckerAvailable();
      const client = await createHttpClient({});

      if (isAvailable) {
        expect(typeof client.scrape).toBe('function');
      } else {
        expect(client.scrape).toBeUndefined();
      }
    });

    it('should expose curl-impersonate status helpers', async () => {
      const status = await getReckerCurlImpersonateStatus();

      expect(typeof status.available).toBe('boolean');
      expect(typeof status.source).toBe('string');
      if (status.path !== null) {
        expect(typeof status.path).toBe('string');
      }
    });

    it('should not install impersonate when ensure is called without installIfMissing', async () => {
      const status = await ensureReckerCurlImpersonate({ installIfMissing: false });
      expect(typeof status.available).toBe('boolean');
    });
  });

  describe('Retry-After parsing', () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should parse Retry-After as seconds', async () => {
      const delays = [];
      const originalSetTimeout = global.setTimeout;
      vi.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
        delays.push(delay);
        return originalSetTimeout(fn, 0);
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: { get: () => '2' } // 2 seconds
        })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const client = new FetchFallback({
        retry: { maxAttempts: 3, delay: 100, retryAfter: true }
      });

      await client.get('https://api.example.com/test');

      // Should have a delay of 2000ms from Retry-After header
      expect(delays.some(d => d >= 2000)).toBe(true);
    });
  });
});
