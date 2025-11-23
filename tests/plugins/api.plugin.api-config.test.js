/**
 * API Plugin - Resource API Config Tests
 *
 * Tests for the resource.$schema.api configuration structure:
 * - api.guard - guards configuration
 * - api.protected - list of fields to filter from API responses
 * - api.description - resource description for OpenAPI docs
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from '@jest/globals';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../config.js';

async function waitForServer(port, maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch (err) {
      // swallow connection errors until server is ready
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server on port ${port} did not become ready in time after ${maxAttempts * 100}ms`);
}

describe('API Plugin - resource.$schema.api configuration', () => {
  let db;
  let apiPlugin;
  let port;

  beforeEach(async () => {
    port = 3400 + Math.floor(Math.random() * 1000);
    const testName = `api-plugin-api-config-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    await db.connect();
  });

  afterEach(async () => {
    if (apiPlugin) {
      await apiPlugin.stop();
      apiPlugin = null;
    }

    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  describe('api.protected', () => {
    it('filters protected fields from GET response', async () => {
      const resource = await db.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          ip: 'string|optional',
          password: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ip', 'password']
        }
      });

      await resource.insert({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        ip: '192.168.1.1',
        password: 'secret123'
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['users']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const getResponse = await fetch(`http://127.0.0.1:${port}/users/user-1`);
      expect(getResponse.status).toBe(200);

      const getBody = await getResponse.json();
      expect(getBody.success).toBe(true);
      expect(getBody.data.name).toBe('John Doe');
      expect(getBody.data.email).toBe('john@example.com');
      expect(getBody.data.ip).toBeUndefined();
      expect(getBody.data.password).toBeUndefined();
    });

    it('filters protected fields from LIST response', async () => {
      const resource = await db.createResource({
        name: 'clicks',
        attributes: {
          id: 'string|optional',
          url: 'string|required',
          ip: 'string|optional',
          userAgent: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ip', 'userAgent']
        }
      });

      await resource.insert({ id: 'click-1', url: '/page1', ip: '1.2.3.4', userAgent: 'Mozilla/5.0' });
      await resource.insert({ id: 'click-2', url: '/page2', ip: '5.6.7.8', userAgent: 'Chrome/100' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['clicks']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/clicks`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);

      for (const item of body.data) {
        expect(item.url).toBeDefined();
        expect(item.ip).toBeUndefined();
        expect(item.userAgent).toBeUndefined();
      }
    });

    it('filters nested protected fields using dot notation', async () => {
      const resource = await db.createResource({
        name: 'events',
        attributes: {
          id: 'string|optional',
          type: 'string|required',
          metadata: {
            ip: 'string|optional',
            browser: 'string|optional',
            location: 'string|optional'
          }
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['metadata.ip', 'metadata.location']
        }
      });

      await resource.insert({
        id: 'event-1',
        type: 'click',
        metadata: {
          ip: '10.0.0.1',
          browser: 'Firefox',
          location: 'New York'
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['events']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/events/event-1`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.type).toBe('click');
      expect(body.data.metadata.browser).toBe('Firefox');
      expect(body.data.metadata.ip).toBeUndefined();
      expect(body.data.metadata.location).toBeUndefined();
    });

    it('filters protected fields from POST response', async () => {
      await db.createResource({
        name: 'logs',
        attributes: {
          id: 'string|optional',
          message: 'string|required',
          ip: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ip']
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['logs']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Test log', ip: '192.168.0.1' })
      });

      expect(response.status).toBe(201);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Test log');
      expect(body.data.ip).toBeUndefined();
    });

    it('filters protected fields from PUT response', async () => {
      const resource = await db.createResource({
        name: 'profiles',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          ssn: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['ssn']
        }
      });

      await resource.insert({ id: 'profile-1', name: 'Jane', ssn: '123-45-6789' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['profiles']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/profiles/profile-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Jane Updated', ssn: '987-65-4321' })
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Jane Updated');
      expect(body.data.ssn).toBeUndefined();
    });

    it('filters protected fields from PATCH response', async () => {
      const resource = await db.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|optional',
          email: 'string|required',
          apiKey: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          protected: ['apiKey']
        }
      });

      await resource.insert({ id: 'acc-1', email: 'test@test.com', apiKey: 'secret-key-123' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['accounts']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/accounts/acc-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'updated@test.com' })
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('updated@test.com');
      expect(body.data.apiKey).toBeUndefined();
    });
  });

  describe('api.guard', () => {
    it('applies guard from api.guard config', async () => {
      await db.createResource({
        name: 'secrets',
        attributes: {
          id: 'string|optional',
          value: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          guard: {
            list: (ctx) => ctx.user?.role === 'admin',
            get: (ctx) => ctx.user?.role === 'admin'
          }
        }
      });

      await db.resources.secrets.insert({ id: 'secret-1', value: 'top-secret' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['secrets']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      // Without auth - should be forbidden
      const response = await fetch(`http://127.0.0.1:${port}/secrets`);
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('combines guard and protected in api config', async () => {
      const resource = await db.createResource({
        name: 'items',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          internalId: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          guard: true, // Allow all (public)
          protected: ['internalId']
        }
      });

      await resource.insert({ id: 'item-1', name: 'Widget', internalId: 'INT-999' });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: ['items']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/items/item-1`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Widget');
      expect(body.data.internalId).toBeUndefined();
    });

  });

  describe('api.description', () => {
    it('uses api.description for OpenAPI documentation', async () => {
      await db.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          price: 'number|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          description: 'Product catalog management',
          guard: true
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: true },
        logging: { enabled: false },
        resources: ['products']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      // Fetch OpenAPI spec
      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      expect(response.status).toBe(200);

      const spec = await response.json();
      const productsTag = spec.tags.find(t => t.name === 'products');
      expect(productsTag).toBeDefined();
      expect(productsTag.description).toBe('Product catalog management');
    });

    it('supports object description format with field descriptions', async () => {
      await db.createResource({
        name: 'orders',
        attributes: {
          id: 'string|optional',
          total: 'number|required',
          status: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: true,
        api: {
          description: {
            resource: 'Order management endpoints',
            attributes: {
              total: 'Total order amount in cents',
              status: 'Order status (pending, paid, shipped)'
            }
          },
          guard: true
        }
      });

      apiPlugin = new ApiPlugin({
        logLevel: 'silent',
        port,
        host: '127.0.0.1',
        docs: { enabled: true },
        logging: { enabled: false },
        resources: ['orders']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      expect(response.status).toBe(200);

      const spec = await response.json();
      const ordersTag = spec.tags.find(t => t.name === 'orders');
      expect(ordersTag.description).toBe('Order management endpoints');

      // Check field descriptions in schema
      const orderSchema = spec.components.schemas.orders;
      expect(orderSchema.properties.total.description).toBe('Total order amount in cents');
      expect(orderSchema.properties.status.description).toBe('Order status (pending, paid, shipped)');
    });
  });
});
