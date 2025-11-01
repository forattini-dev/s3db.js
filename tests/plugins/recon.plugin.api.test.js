import { describe, beforeEach, test, expect, jest } from '@jest/globals';

import { ReconPlugin } from '#src/plugins/recon.plugin.js';
import { RouteContext } from '#src/plugins/api/concerns/route-context.js';

const fakeDiffs = [
  { type: 'port:add', severity: 'high', critical: true, values: ['8443/tcp'] },
  { type: 'technology:add', severity: 'medium', critical: false, values: ['nodejs'] }
];

const fakeAlerts = [
  { host: 'example.com', stage: 'port:add', severity: 'high', values: ['8443/tcp'], timestamp: '2025-01-01T00:05:00.000Z' },
  { host: 'example.com', stage: 'field:primaryIp', severity: 'high', values: ['198.51.100.2'], timestamp: '2025-01-01T00:06:00.000Z' },
  { host: 'example.com', stage: 'technology:add', severity: 'medium', values: ['Next.js'], timestamp: '2025-01-01T00:07:00.000Z' }
];

const fakeReport = {
  target: {
    original: 'https://example.com',
    host: 'example.com',
    protocol: 'https',
    port: 443
  },
  startedAt: '2025-01-01T00:00:00.000Z',
  endedAt: '2025-01-01T00:05:00.000Z',
  status: 'ok',
  results: {
    dns: {
      status: 'ok',
      records: { a: ['93.184.216.34'] },
      raw: 'strip-me'
    },
    ports: {
      status: 'ok',
      openPorts: [{ port: '443/tcp', service: 'https', detail: 'nginx 1.18' }]
    },
    subdomains: {
      status: 'ok',
      list: ['app.example.com', 'cdn.example.com'],
      raw: { seen: true }
    },
    webDiscovery: {
      status: 'ok',
      paths: ['/admin', '/login'],
      tools: {
        ffuf: { status: 'ok', count: 2, sample: ['/admin', '/login'] }
      }
    }
  }
};

function createMockContext({ params = {}, query = {} } = {}) {
  const state = { status: 200, headers: {}, body: null };

  return {
    req: {
      param: (name) => (name ? params[name] : params),
      query: (name) => (name ? query[name] : query)
    },
    header: (name, value) => {
      if (value === undefined) {
        return state.headers[name.toLowerCase()];
      }
      state.headers[name.toLowerCase()] = value;
    },
    json: (data, status = 200, headers = {}) => {
      state.status = status;
      state.body = data;
      Object.assign(state.headers, headers);
      return { status, body: data };
    },
    text: (data, status = 200, headers = {}) => {
      state.status = status;
      state.body = data;
      Object.assign(state.headers, headers);
      return { status, body: data };
    },
    __state: state
  };
}

describe('ReconPlugin API routes', () => {
  let pluginStub;
  let handler;
  beforeEach(() => {
    pluginStub = {
      database: {},
      emit: jest.fn(),
      _deepClone: (value) => JSON.parse(JSON.stringify(value)),
      _stripRawFields: (value) => JSON.parse(JSON.stringify(value, (key, val) => {
        if (['raw', 'stdout', 'stderr'].includes(key)) {
          return undefined;
        }
        return val;
      })),
      _collectStageSummaries: jest.fn(() => [
        { stage: 'dns', status: 'ok', summary: { records: { a: ['93.184.216.34'] } } },
        { stage: 'ports', status: 'ok', summary: { total: 1 } }
      ]),
      getHostSummary: jest.fn(),
      _loadLatestReport: jest.fn(),
      _loadRecentDiffs: jest.fn(async (_, limit) => fakeDiffs.slice(0, Number(limit ?? fakeDiffs.length))),
      getRecentAlerts: jest.fn(async (_, { limit } = {}) => {
        const size = limit === undefined ? fakeAlerts.length : Number(limit);
        return fakeAlerts.slice(0, Number.isFinite(size) ? size : fakeAlerts.length);
      })
    };

    const routes = ReconPlugin.prototype.getApiRoutes.call(pluginStub, {});
    handler = routes['GET /recon/hosts/:hostId/summary'];
  });

  test('summaries route returns sanitized payload', async () => {
    const summary = {
      id: 'example.com',
      target: 'https://example.com',
      diffs: fakeDiffs,
      summary: {
        target: 'https://example.com',
        primaryIp: '93.184.216.34',
        cdn: 'Cloudflare',
        openPorts: [{ port: '443/tcp', service: 'https', detail: 'nginx 1.18' }],
        subdomains: ['app.example.com', 'cdn.example.com'],
        subdomainCount: 2,
        technologies: ['nginx 1.18']
      }
    };

    pluginStub.getHostSummary.mockResolvedValueOnce(summary);
    pluginStub._loadLatestReport.mockResolvedValueOnce(fakeReport);
    pluginStub.getRecentAlerts.mockResolvedValueOnce(fakeAlerts);

    const honoCtx = createMockContext({
      params: { hostId: 'example.com' },
      query: { diffLimit: '1', alertLimit: '2' }
    });
    const ctx = new RouteContext(honoCtx, { resources: {}, plugins: {} }, null, {});

    const response = await handler(honoCtx, ctx);

    expect(response.status).toBe(200);
    const payload = honoCtx.__state.body;
    expect(payload.success).toBe(true);
    const data = payload.data;

    expect(data.host.id).toBe('example.com');
    expect(data.diffs).toHaveLength(1);
    expect(pluginStub.getRecentAlerts).toHaveBeenCalledWith('example.com', { limit: 2 });
    expect(data.paths).toBeUndefined();
    expect(data.report.results.dns.raw).toBeUndefined();
    expect(data.report.results.subdomains.raw).toBeUndefined();
    expect(data.report.results.dns.records.a).toEqual(['93.184.216.34']);
    expect(data.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'dns', status: 'ok' }),
        expect.objectContaining({ stage: 'ports', status: 'ok' })
      ])
    );
  });

  test('returns 404 when host summary is missing', async () => {
    pluginStub.getHostSummary.mockResolvedValueOnce(null);

    const honoCtx = createMockContext({ params: { hostId: 'missing.com' } });
    const ctx = new RouteContext(honoCtx, { resources: {}, plugins: {} }, null, {});

    const response = await handler(honoCtx, ctx);
    expect(response.status).toBe(404);

    const payload = honoCtx.__state.body;
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('NOT_FOUND');
  });

  test('includes paths when includePaths is true', async () => {
    const summary = {
      id: 'example.com',
      target: 'https://example.com',
      diffs: fakeDiffs,
      summary: { target: 'https://example.com' }
    };

    pluginStub.getHostSummary.mockResolvedValueOnce(summary);
    pluginStub._loadLatestReport.mockResolvedValueOnce(fakeReport);
    pluginStub.getRecentAlerts.mockResolvedValueOnce(fakeAlerts);

    const honoCtx = createMockContext({
      params: { hostId: 'example.com' },
      query: { includePaths: 'true' }
    });
    const ctx = new RouteContext(honoCtx, { resources: {}, plugins: {} }, null, {});

    const response = await handler(honoCtx, ctx);
    expect(response.status).toBe(200);
    const data = honoCtx.__state.body.data;
    expect(data.paths).toEqual({
      items: ['/admin', '/login'],
      total: 2,
      sources: expect.objectContaining({
        ffuf: expect.objectContaining({ status: 'ok', count: 2 })
      })
    });
  });
});
