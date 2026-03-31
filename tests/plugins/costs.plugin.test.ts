import { CostsPlugin } from '../../src/plugins/costs.plugin.js';
import { detectProvider, getPricingForProvider } from '../../src/plugins/costs-pricing.js';

describe('CostsPlugin', () => {
  it('getCosts normalizes usage timestamps to ISO strings', () => {
    const plugin = new CostsPlugin();

    plugin.addRequest(
      'GetObjectCommand',
      'get',
      { httpResponse: { headers: { 'content-length': '128' } } },
      { Key: 'plugin=api/resource=users/item-1' }
    );

    expect(plugin.costs.usage.points).toHaveLength(1);
    expect(typeof plugin.costs.usage.points[0].timestamp).toBe('number');

    const publicCosts = plugin.getCosts();

    expect(publicCosts.usage.points).toHaveLength(1);
    expect(typeof publicCosts.usage.points[0].timestamp).toBe('string');
    expect(Number.isFinite(Date.parse(publicCosts.usage.points[0].timestamp))).toBe(true);
    expect(typeof publicCosts.usage.lastUpdatedAt).toBe('string');
    expect(Number.isFinite(Date.parse(publicCosts.usage.lastUpdatedAt!))).toBe(true);
  });

  it('getCosts keeps pricing tables live for runtime overrides', () => {
    const plugin = new CostsPlugin();
    const publicCosts = plugin.getCosts();

    publicCosts.requests.prices.get = 0.123;

    expect(plugin.costs.requests.prices.get).toBe(0.123);
  });

  it('defaults to AWS S3 pricing when no provider specified', () => {
    const plugin = new CostsPlugin();
    const costs = plugin.getCosts();

    expect(costs.provider).toBeNull();
    expect(costs.pricingModel).toBe('request-based');
    expect(costs.requests.prices.put).toBeCloseTo(0.005 / 1000, 10);
    expect(costs.requests.prices.get).toBeCloseTo(0.0004 / 1000, 10);
    expect(costs.rows.prices.readPerMillion).toBe(0);
    expect(costs.rows.prices.writtenPerMillion).toBe(0);
  });

  it('exposes rows data structure', () => {
    const plugin = new CostsPlugin();
    const costs = plugin.getCosts();

    expect(costs.rows).toBeDefined();
    expect(costs.rows.counts.read).toBe(0);
    expect(costs.rows.counts.written).toBe(0);
    expect(costs.rows.subtotal).toBe(0);
  });
});

describe('detectProvider', () => {
  it('detects AWS S3 from s3:// protocol', () => {
    expect(detectProvider('s3://key:secret@my-bucket?region=us-east-1')).toBe('aws-s3');
  });

  it('detects AWS S3 from amazonaws.com endpoint', () => {
    expect(detectProvider('https://key:secret@s3.us-east-1.amazonaws.com/bucket')).toBe('aws-s3');
  });

  it('detects Cloudflare R2 from r2.cloudflarestorage.com', () => {
    expect(detectProvider('https://key:secret@abc123.r2.cloudflarestorage.com/bucket')).toBe('cloudflare-r2');
  });

  it('detects Cloudflare D1 from sqlite+d1:// protocol', () => {
    expect(detectProvider('sqlite+d1://accountId/dbId?apiToken=tok')).toBe('cloudflare-d1');
  });

  it('detects Turso from sqlite+libsql:// with .turso.io', () => {
    expect(detectProvider('sqlite+libsql://my-db-org.turso.io?authToken=tok')).toBe('turso');
  });

  it('detects self-hosted for sqlite+libsql:// without .turso.io', () => {
    expect(detectProvider('sqlite+libsql://localhost:8080')).toBe('self-hosted');
  });

  it('detects self-hosted for memory://', () => {
    expect(detectProvider('memory://bucket')).toBe('self-hosted');
  });

  it('detects self-hosted for file://', () => {
    expect(detectProvider('file:///tmp/data')).toBe('self-hosted');
  });

  it('detects self-hosted for sqlite://', () => {
    expect(detectProvider('sqlite:///tmp/test.db')).toBe('self-hosted');
  });

  it('detects self-hosted for http://localhost', () => {
    expect(detectProvider('http://admin:admin@localhost:9000/bucket')).toBe('self-hosted');
  });

  it('defaults to aws-s3 for empty string', () => {
    expect(detectProvider('')).toBe('aws-s3');
  });

  it('defaults to aws-s3 for invalid URL', () => {
    expect(detectProvider('not-a-url')).toBe('aws-s3');
  });
});

describe('getPricingForProvider', () => {
  it('returns R2 pricing with zero egress', () => {
    const pricing = getPricingForProvider('cloudflare-r2');

    expect(pricing.provider).toBe('cloudflare-r2');
    expect(pricing.pricingModel).toBe('request-based');
    expect(pricing.requests.put).toBeCloseTo(4.50 / 1_000_000, 10);
    expect(pricing.requests.get).toBeCloseTo(0.36 / 1_000_000, 10);
    expect(pricing.requests.delete).toBe(0);
    expect(pricing.dataTransfer.tiers).toHaveLength(0);
    expect(pricing.storage.tiers).toHaveLength(1);
    expect(pricing.storage.tiers[0].pricePerGB).toBe(0.015);
  });

  it('returns D1 pricing with row-based model', () => {
    const pricing = getPricingForProvider('cloudflare-d1');

    expect(pricing.pricingModel).toBe('row-based');
    expect(pricing.rows.readPerMillion).toBe(0.001);
    expect(pricing.rows.writtenPerMillion).toBe(1.00);
    expect(pricing.requests.put).toBe(0);
    expect(pricing.storage.tiers[0].pricePerGB).toBe(0.75);
  });

  it('returns Turso Developer pricing by default', () => {
    const pricing = getPricingForProvider('turso');

    expect(pricing.pricingModel).toBe('row-based');
    expect(pricing.rows.readPerMillion).toBe(0.001);
    expect(pricing.rows.writtenPerMillion).toBe(1.00);
    expect(pricing.storage.tiers[0].pricePerGB).toBe(0.75);
  });

  it('returns Turso Scaler pricing when specified', () => {
    const pricing = getPricingForProvider('turso', { tursoPlan: 'scaler' });

    expect(pricing.rows.readPerMillion).toBe(0.0008);
    expect(pricing.rows.writtenPerMillion).toBe(0.80);
    expect(pricing.storage.tiers[0].pricePerGB).toBe(0.50);
  });

  it('returns Turso Pro pricing when specified', () => {
    const pricing = getPricingForProvider('turso', { tursoPlan: 'pro' });

    expect(pricing.rows.readPerMillion).toBe(0.00075);
    expect(pricing.rows.writtenPerMillion).toBe(0.75);
    expect(pricing.storage.tiers[0].pricePerGB).toBe(0.45);
  });

  it('returns zero costs for self-hosted', () => {
    const pricing = getPricingForProvider('self-hosted');

    expect(pricing.pricingModel).toBe('request-based');
    expect(pricing.requests.put).toBe(0);
    expect(pricing.requests.get).toBe(0);
    expect(pricing.storage.tiers[0].pricePerGB).toBe(0);
  });
});

describe('CostsPlugin with provider override', () => {
  it('applies R2 pricing via constructor', () => {
    const plugin = new CostsPlugin({ provider: 'cloudflare-r2' });
    const costs = plugin.getCosts();

    expect(costs.provider).toBe('cloudflare-r2');
    expect(costs.pricingModel).toBe('request-based');
    expect(costs.requests.prices.put).toBeCloseTo(4.50 / 1_000_000, 10);
    expect(costs.requests.prices.get).toBeCloseTo(0.36 / 1_000_000, 10);
    expect(costs.requests.prices.delete).toBe(0);
    expect(costs.storage.tiers).toHaveLength(1);
    expect(costs.storage.tiers[0].pricePerGB).toBe(0.015);
    expect(costs.dataTransfer.tiers).toHaveLength(0);
  });

  it('applies D1 row-based pricing via constructor', () => {
    const plugin = new CostsPlugin({ provider: 'cloudflare-d1' });
    const costs = plugin.getCosts();

    expect(costs.provider).toBe('cloudflare-d1');
    expect(costs.pricingModel).toBe('row-based');
    expect(costs.rows.prices.readPerMillion).toBe(0.001);
    expect(costs.rows.prices.writtenPerMillion).toBe(1.00);
    expect(costs.requests.prices.put).toBe(0);
  });

  it('applies Turso Scaler pricing via constructor', () => {
    const plugin = new CostsPlugin({ provider: 'turso', tursoPlan: 'scaler' });
    const costs = plugin.getCosts();

    expect(costs.provider).toBe('turso');
    expect(costs.pricingModel).toBe('row-based');
    expect(costs.rows.prices.readPerMillion).toBe(0.0008);
    expect(costs.rows.prices.writtenPerMillion).toBe(0.80);
  });

  it('applies self-hosted zero pricing via constructor', () => {
    const plugin = new CostsPlugin({ provider: 'self-hosted' });
    const costs = plugin.getCosts();

    expect(costs.provider).toBe('self-hosted');
    expect(costs.requests.prices.put).toBe(0);
    expect(costs.requests.prices.get).toBe(0);
    expect(costs.storage.tiers[0].pricePerGB).toBe(0);
  });
});

describe('CostsPlugin row-based tracking', () => {
  it('tracks row costs for D1 provider', () => {
    const plugin = new CostsPlugin({ provider: 'cloudflare-d1' });

    plugin.addRequest(
      'PutObjectCommand',
      'put',
      { _rowsRead: 1, _rowsWritten: 1 } as any,
      { Key: 'resource=users/item-1' }
    );

    expect(plugin.costs.rows.counts.read).toBe(1);
    expect(plugin.costs.rows.counts.written).toBe(1);
    expect(plugin.costs.rows.subtotal).toBeGreaterThan(0);
    expect(plugin.costs.requests.subtotal).toBe(0);
  });

  it('calculates correct row cost for 1M reads on D1', () => {
    const plugin = new CostsPlugin({ provider: 'cloudflare-d1' });

    for (let i = 0; i < 100; i++) {
      plugin.addRequest(
        'GetObjectCommand',
        'get',
        { _rowsRead: 10_000, _rowsWritten: 0 } as any,
        { Key: `resource=users/item-${i}` }
      );
    }

    expect(plugin.costs.rows.counts.read).toBe(1_000_000);
    expect(plugin.costs.rows.subtotal).toBeCloseTo(0.001, 6);
  });

  it('includes row data in snapshot', () => {
    const plugin = new CostsPlugin({ provider: 'cloudflare-d1' });

    plugin.addRequest(
      'GetObjectCommand',
      'get',
      { _rowsRead: 5, _rowsWritten: 0 } as any,
      { Key: 'resource=orders/item-1' }
    );

    const snap = plugin.snapshot({ windowMs: 60_000 });

    expect(snap.rowsRead).toBe(5);
    expect(snap.rowsWritten).toBe(0);
    expect(snap.rowCost).toBeGreaterThan(0);
  });

  it('includes row data in estimate', () => {
    const plugin = new CostsPlugin({ provider: 'turso', tursoPlan: 'scaler' });

    plugin.addRequest(
      'PutObjectCommand',
      'put',
      { _rowsRead: 1, _rowsWritten: 1 } as any,
      { Key: 'resource=users/item-1' }
    );

    const est = plugin.estimate({ days: 30, observedWindowMs: 60_000 });

    expect(est.projected.rowsRead).toBeGreaterThan(0);
    expect(est.projected.rowsWritten).toBeGreaterThan(0);
    expect(est.projected.rowCost).toBeGreaterThan(0);
  });

  it('request-based provider ignores _rowsRead/_rowsWritten for cost', () => {
    const plugin = new CostsPlugin({ provider: 'cloudflare-r2' });

    plugin.addRequest(
      'GetObjectCommand',
      'get',
      { _rowsRead: 1, _rowsWritten: 0 } as any,
      { Key: 'resource=users/item-1' }
    );

    expect(plugin.costs.requests.subtotal).toBeGreaterThan(0);
    expect(plugin.costs.rows.subtotal).toBe(0);
  });

  it('self-hosted has zero cost for all operations', () => {
    const plugin = new CostsPlugin({ provider: 'self-hosted' });

    plugin.addRequest('PutObjectCommand', 'put', {}, { Key: 'resource=users/item-1' });
    plugin.addRequest('GetObjectCommand', 'get', {}, { Key: 'resource=users/item-1' });
    plugin.addRequest('ListObjectsV2Command', 'list', {}, { Key: 'resource=users/' });

    expect(plugin.costs.total).toBe(0);
    expect(plugin.costs.requests.subtotal).toBe(0);
  });
});
