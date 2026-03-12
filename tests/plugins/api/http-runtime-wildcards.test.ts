import { HttpApp } from '../../../src/plugins/shared/http-runtime.js';

describe('HttpApp wildcard compatibility', () => {
  test('matches deep terminal wildcards for get and all routes', async () => {
    const app = new HttpApp();

    app.get('/assets/*', (c) => c.text(c.req.param('*') || 'ROOT'));
    app.all('/api/*', (c) => c.text(`${c.req.method}:${c.req.param('*') || 'ROOT'}`));

    const assetRoot = await app.fetch(new Request('http://localhost/assets'));
    expect(assetRoot.status).toBe(200);
    expect(await assetRoot.text()).toBe('ROOT');

    const assetNested = await app.fetch(new Request('http://localhost/assets/heroes/icons/icon.png'));
    expect(assetNested.status).toBe(200);
    expect(await assetNested.text()).toBe('heroes/icons/icon.png');

    const apiNested = await app.fetch(new Request('http://localhost/api/v1/admin/users', { method: 'POST' }));
    expect(apiNested.status).toBe(200);
    expect(await apiNested.text()).toBe('POST:v1/admin/users');
  });

  test('supports optional params through the upstream Raffel matcher', async () => {
    const app = new HttpApp();

    app.get('/users/:id?', (c) => c.text(c.req.param('id') || 'ROOT'));

    const collection = await app.fetch(new Request('http://localhost/users'));
    expect(collection.status).toBe(200);
    expect(await collection.text()).toBe('ROOT');

    const member = await app.fetch(new Request('http://localhost/users/user-42'));
    expect(member.status).toBe(200);
    expect(await member.text()).toBe('user-42');
  });

  test('preserves wildcard behavior for basePath groups, sub-app mounts and deep wildcards', async () => {
    const app = new HttpApp();
    const v1 = app.basePathApp('/v1');
    const admin = new HttpApp();

    v1.get('/reports/*', (c) => c.text(`reports:${c.req.param('*') || 'ROOT'}`));
    admin.get('/docs/*', (c) => c.text(`docs:${c.req.param('*') || 'ROOT'}`));
    app.route('/admin', admin);

    const grouped = await app.fetch(new Request('http://localhost/v1/reports/2026/03/summary.json'));
    expect(grouped.status).toBe(200);
    expect(await grouped.text()).toBe('reports:2026/03/summary.json');

    const mounted = await app.fetch(new Request('http://localhost/admin/docs/platform/http/page'));
    expect(mounted.status).toBe(200);
    expect(await mounted.text()).toBe('docs:platform/http/page');
  });
});
