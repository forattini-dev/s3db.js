import rateLimitModule, { createDriverRateLimiter } from '../../../src/plugins/api/middlewares/rate-limit.js';

const { RateLimitStore } = rateLimitModule;

function createMockContext(requestHeaders = {}) {
  const normalized = Object.fromEntries(
    Object.entries(requestHeaders).map(([key, value]) => [key.toLowerCase(), value])
  );

  const store = new Map();
  return {
    req: {
      header(name) {
        return normalized[name.toLowerCase()];
      }
    },
    resHeaders: {},
    response: null,
    header(name, value) {
      this.resHeaders[name] = value;
    },
    json(body, status = 200) {
      this.response = { body, status };
      return this.response;
    },
    set(key, value) {
      store.set(key, value);
    },
    get(key) {
      return store.get(key);
    }
  };
}

describe('RateLimitStore', () => {
  it('records attempts and expires them after the window', async () => {
    const store = new RateLimitStore({ windowMs: 20, cleanupInterval: 10 });

    expect(store.getCount('test')).toBe(0);
    store.record('test');
    expect(store.getCount('test')).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(store.getCount('test')).toBe(0);

    store.stop();
  });
});

describe('createDriverRateLimiter', () => {
  it('blocks requests after exceeding the configured limit', async () => {
    const limiter = createDriverRateLimiter({
      windowMs: 50,
      maxAttempts: 2,
      keyPrefix: 'ratetest',
      enabled: true
    });

    const runRequest = async () => {
      const ctx = createMockContext({ 'x-forwarded-for': '10.0.0.9' });
      await limiter(ctx, async () => {});
      return ctx;
    };

    const first = await runRequest();
    expect(first.response).toBeNull();

    const second = await runRequest();
    expect(second.response).toBeNull();

    const thirdCtx = createMockContext({ 'x-forwarded-for': '10.0.0.9' });
    const response = await limiter(thirdCtx, async () => {});
    expect(response.status).toBe(429);
    expect(thirdCtx.resHeaders['Retry-After']).toBeDefined();
    expect(thirdCtx.resHeaders['X-RateLimit-Remaining']).toBe('0');
  });
});
