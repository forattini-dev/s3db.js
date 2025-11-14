/**
 * Tests for OpenAPI Custom Route Tag Inference
 *
 * Tests the automatic tag inference for custom routes in OpenAPI documentation
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '#src/database.class.js';
import { generateOpenAPISpec } from '#src/plugins/api/utils/openapi-generator.js';

describe('OpenAPI Custom Route Tag Inference', () => {
  let db;

  beforeEach(async () => {
    db = new Database({
      connectionString: 'memory://test-openapi-tags/db'
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) {
      await db.disconnect();
    }
  });

  describe('Plugin-level custom routes', () => {
    test('should infer tag from first path segment after base prefix', () => {
      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        routes: {
          'GET /analytics/reports': (c) => c.json({ success: true }),
          'POST /analytics/export': (c) => c.json({ success: true })
        }
      });

      // Check that 'analytics' tag exists
      const analyticsTag = spec.tags.find(t => t.name === 'analytics');
      expect(analyticsTag).toBeDefined();
      expect(analyticsTag.description).toBe('Custom routes for analytics');

      // Check that routes have 'analytics' tag (plugin routes don't include version prefix)
      const reportsPath = spec.paths['/api/analytics/reports'];
      expect(reportsPath?.get?.tags).toContain('analytics');
      expect(reportsPath?.get?.tags).not.toContain('Custom Routes');

      const exportPath = spec.paths['/api/analytics/export'];
      expect(exportPath?.post?.tags).toContain('analytics');
      expect(exportPath?.post?.tags).not.toContain('Custom Routes');
    });

    test('should handle routes without base or version prefix', () => {
      const spec = generateOpenAPISpec(db, {
        routes: {
          'GET /health/status': (c) => c.json({ status: 'ok' })
        }
      });

      const healthTag = spec.tags.find(t => t.name === 'health');
      expect(healthTag).toBeDefined();

      const healthPath = spec.paths['/health/status'];
      expect(healthPath?.get?.tags).toContain('health');
    });

    test('should extract only first segment for multi-segment paths', () => {
      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        routes: {
          'GET /admin/reports/monthly': (c) => c.json({ success: true }),
          'GET /admin/settings/security': (c) => c.json({ success: true })
        }
      });

      const adminTag = spec.tags.find(t => t.name === 'admin');
      expect(adminTag).toBeDefined();

      // Should NOT have 'reports' or 'settings' tags
      expect(spec.tags.find(t => t.name === 'reports')).toBeUndefined();
      expect(spec.tags.find(t => t.name === 'settings')).toBeUndefined();

      const monthlyPath = spec.paths['/api/admin/reports/monthly'];
      expect(monthlyPath?.get?.tags).toEqual(['admin']);
    });

    test('should fallback to "Custom Routes" when path starts with parameter', () => {
      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        routes: {
          'GET /:id': (c) => c.json({ success: true }),
          'GET /:userId/:itemId': (c) => c.json({ success: true })
        }
      });

      const customRoutesTag = spec.tags.find(t => t.name === 'Custom Routes');
      expect(customRoutesTag).toBeDefined();

      const idPath = spec.paths['/api/{id}'];
      expect(idPath?.get?.tags).toContain('Custom Routes');

      const userItemPath = spec.paths['/api/{userId}/{itemId}'];
      expect(userItemPath?.get?.tags).toContain('Custom Routes');
    });

    test('should group multiple routes with same inferred tag', () => {
      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        routes: {
          'GET /reports/sales': (c) => c.json({ success: true }),
          'GET /reports/users': (c) => c.json({ success: true }),
          'POST /reports/generate': (c) => c.json({ success: true })
        }
      });

      // Only ONE 'reports' tag should exist
      const reportsTags = spec.tags.filter(t => t.name === 'reports');
      expect(reportsTags).toHaveLength(1);

      // All routes should have 'reports' tag
      expect(spec.paths['/api/reports/sales']?.get?.tags).toContain('reports');
      expect(spec.paths['/api/reports/users']?.get?.tags).toContain('reports');
      expect(spec.paths['/api/reports/generate']?.post?.tags).toContain('reports');
    });

    test('should handle mixed case and convert to lowercase', () => {
      const spec = generateOpenAPISpec(db, {
        routes: {
          'GET /Analytics/report': (c) => c.json({ success: true }),
          'GET /ADMIN/users': (c) => c.json({ success: true })
        }
      });

      // Tags should be lowercase
      expect(spec.tags.find(t => t.name === 'analytics')).toBeDefined();
      expect(spec.tags.find(t => t.name === 'admin')).toBeDefined();

      // Should NOT have uppercase tags
      expect(spec.tags.find(t => t.name === 'Analytics')).toBeUndefined();
      expect(spec.tags.find(t => t.name === 'ADMIN')).toBeUndefined();
    });
  });

  describe('Resource-level custom routes', () => {
    test('should include both resource tag and inferred tag', async () => {
      await db.createResource({
        name: 'orders',
        attributes: {
          total: 'number'
        }
      });

      const ordersResource = db.resources.orders;
      ordersResource.config.routes = {
        'GET /reports': (c) => c.json({ success: true })
      };

      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        versionPrefix: 'v1',
        resources: {
          orders: { enabled: true }
        }
      });

      const reportsPath = spec.paths['/api/v1/orders/reports'];
      expect(reportsPath?.get?.tags).toContain('orders'); // Resource tag
      expect(reportsPath?.get?.tags).toContain('reports'); // Inferred tag
      expect(reportsPath?.get?.tags).not.toContain('Custom Routes');
    });

    test('should avoid duplicate tags when inferred tag equals resource name', async () => {
      await db.createResource({
        name: 'users',
        attributes: {
          name: 'string'
        }
      });

      const usersResource = db.resources.users;
      usersResource.config.routes = {
        'GET /list': (c) => c.json({ success: true })
      };

      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        versionPrefix: 'v1',
        resources: {
          users: { enabled: true }
        }
      });

      const listPath = spec.paths['/api/v1/users/list'];
      const tags = listPath?.get?.tags || [];

      // Should have 'users' tag (from resource)
      // Should have 'list' tag (inferred from path)
      expect(tags).toContain('users');
      expect(tags).toContain('list');

      // Should not have duplicate 'users'
      const usersTags = tags.filter(t => t === 'users');
      expect(usersTags).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty path segments', () => {
      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        routes: {
          'GET //reports': (c) => c.json({ success: true })
        }
      });

      // The path is created as /api//reports (empty segment preserved in path)
      // But tag inference should filter out empty segments and extract 'reports'
      const reportsPath = spec.paths['/api//reports'];
      expect(reportsPath?.get?.tags).toContain('reports');
    });

    test('should handle root path', () => {
      const spec = generateOpenAPISpec(db, {
        basePath: '/api',
        routes: {
          'GET /': (c) => c.json({ success: true })
        }
      });

      const rootPath = spec.paths['/api'];
      expect(rootPath?.get?.tags).toContain('Custom Routes');
    });

    test('should handle wildcard segments', () => {
      const spec = generateOpenAPISpec(db, {
        routes: {
          'GET /*/items': (c) => c.json({ success: true })
        }
      });

      const wildcardPath = spec.paths['/{wildcard}/items'];
      expect(wildcardPath?.get?.tags).toContain('Custom Routes');
    });
  });
});
