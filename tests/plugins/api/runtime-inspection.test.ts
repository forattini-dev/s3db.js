import { describe, expect, it } from 'vitest';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

describe('ApiPlugin runtime inspection', () => {
  it('builds preview, doctor output and contract tests without starting the server', async () => {
    const testName = `api-runtime-inspection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });

    try {
      await db.connect();
      await db.createResource({
        name: 'orders',
        attributes: {
          amount: 'number|required',
          status: 'string|required'
        }
      });

      const apiPlugin = new ApiPlugin({
        port: 4900 + Math.floor(Math.random() * 500),
        host: '127.0.0.1',
        logLevel: 'silent',
        logging: { enabled: false },
        docs: { enabled: true },
        routes: {
          'POST /sync': (c) => c.json({ ok: true })
        },
        auth: {
          resource: 'plg_api_users',
          drivers: [{
            driver: 'jwt',
            config: {
              secret: 'top-secret',
              resource: 'plg_api_users'
            }
          }]
        },
        resources: {
          orders: {
            auth: ['jwt']
          }
        }
      });

      (apiPlugin as unknown as { database: typeof db }).database = db;
      await apiPlugin.onInstall();

      const preview = await apiPlugin.previewRuntime();
      const doctor = await apiPlugin.doctor();
      const contractTests = await apiPlugin.contractTests();

      expect(preview.routes.some((route) => route.kind === 'health' && route.path === '/health')).toBe(true);
      expect(preview.routes.some((route) => route.kind === 'docs' && route.path === '/docs')).toBe(true);
      expect(preview.graph.operations.some((operation) => operation.id === 'create_orders')).toBe(true);
      expect(preview.summary.operations).toBeGreaterThan(0);

      expect(doctor.summary.warnings).toBeGreaterThan(0);
      expect(doctor.diagnostics.some((diagnostic) => diagnostic.code === 'MISSING_INPUT_SCHEMA')).toBe(true);

      expect(contractTests.checks.some((check) => check.kind === 'unauthorized' && check.operationId === 'create_orders')).toBe(true);
      expect(contractTests.checks.some((check) => check.kind === 'authorized' && check.operationId === 'create_orders')).toBe(true);
      expect(contractTests.checks.some((check) => check.kind === 'invalid-input' && check.operationId === 'create_orders')).toBe(true);
    } finally {
      await db.disconnect();
    }
  });
});
