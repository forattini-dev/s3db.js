/**
 * API Plugin + RelationPlugin integration smoke tests for ?populate
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from '@jest/globals';
import { ApiPlugin } from '../../src/plugins/api/index.js';
import { RelationPlugin } from '../../src/plugins/relation.plugin.js';
import { createMemoryDatabaseForTest } from '../config.js';

async function waitForServer(port, maxAttempts = 50) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch (err) {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`API server on port ${port} did not start within ${maxAttempts * 100}ms`);
}

describe('API Plugin populate parameter', () => {
  let db;
  let apiPlugin;
  let port;

  beforeEach(async () => {
    port = 3600 + Math.floor(Math.random() * 500);
    const testName = `api-populate-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { verbose: false });
    await db.connect();

    await db.createResource({
      name: 'customers',
      attributes: {
        id: 'string|optional',
        name: 'string|required'
      }
    });

    await db.createResource({
      name: 'products',
      attributes: {
        id: 'string|optional',
        sku: 'string|required',
        name: 'string|required'
      }
    });

    await db.createResource({
      name: 'orders',
      attributes: {
        id: 'string|optional',
        customerId: 'string|required',
        total: 'number|optional'
      },
      partitions: {
        byCustomer: { fields: { customerId: 'string' } }
      }
    });

    await db.createResource({
      name: 'order_items',
      attributes: {
        id: 'string|optional',
        orderId: 'string|required',
        productId: 'string|required',
        quantity: 'number|optional'
      },
      partitions: {
        byOrder: { fields: { orderId: 'string' } }
      }
    });

    const relationPlugin = new RelationPlugin({
      relations: {
        orders: {
          customer: {
            type: 'belongsTo',
            resource: 'customers',
            foreignKey: 'customerId'
          },
          items: {
            type: 'hasMany',
            resource: 'order_items',
            foreignKey: 'orderId'
          }
        },
        order_items: {
          product: {
            type: 'belongsTo',
            resource: 'products',
            foreignKey: 'productId'
          }
        }
      }
    });

    await db.usePlugin(relationPlugin);

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      verbose: false,
      docs: { enabled: false },
      logging: { enabled: false }
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    // Seed data
    await db.resources.customers.insert({ id: 'cust-1', name: 'Alice Doe' });
    await db.resources.products.insert({ id: 'prod-1', sku: 'WID-001', name: 'Widget' });
    await db.resources.orders.insert({ id: 'ord-1', customerId: 'cust-1', total: 199.99 });
    await db.resources.order_items.insert({
      id: 'item-1',
      orderId: 'ord-1',
      productId: 'prod-1',
      quantity: 2
    });
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

  it('hydrates relations with ?populate=customer,items.product', async () => {
    const response = await fetch(
      `http://127.0.0.1:${port}/orders?populate=customer,items.product`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);

    const order = body.data[0];
    expect(order.customer).toBeDefined();
    expect(order.customer.id).toBe('cust-1');

    expect(Array.isArray(order.items)).toBe(true);
    expect(order.items[0].product).toBeDefined();
    expect(order.items[0].product.id).toBe('prod-1');
  });

  it('returns 400 when relation path is invalid', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/orders?populate=unknownRelation`);

    expect(response.status).toBe(400);
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('INVALID_POPULATE');
    expect(body.error?.details?.errors?.[0]).toContain('unknownRelation');
  });
});
