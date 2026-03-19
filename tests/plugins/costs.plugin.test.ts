import { CostsPlugin } from '../../src/plugins/costs.plugin.js';

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
});
