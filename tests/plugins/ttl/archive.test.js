import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Archive Strategy', () => {
  let db;
  let orders;
  let archivedOrders;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-archive');
    await db.connect();

    orders = await db.createResource({
      name: 'orders',
      attributes: {
        id: 'string|optional',
        orderNumber: 'string',
        total: 'number'
      }
    });

    archivedOrders = await db.createResource({
      name: 'archived_orders',
      attributes: {
        id: 'string|optional',
        orderNumber: 'string',
        total: 'number',
        archivedAt: 'string',
        archivedFrom: 'string',
        originalId: 'string'
      }
    });

    plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        orders: {
          ttl: 1,
          onExpire: 'archive',
          archiveResource: 'archived_orders',
          keepOriginalId: true
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should archive expired order', async () => {
    await orders.insert({
      id: 'order-1',
      orderNumber: 'ORD-001',
      total: 100
    });

    await sleep(1500);
    await plugin.runCleanup();

    const originalOrder = await orders.get('order-1').catch(() => null);
    expect(originalOrder).toBeNull();

    const archivedList = await archivedOrders.list();
    const archived = archivedList.find(o => o.orderNumber === 'ORD-001');
    expect(archived).toBeDefined();
    expect(archived.orderNumber).toBe('ORD-001');
    expect(archived.total).toBe(100);
    expect(archived.archivedAt).toBeDefined();
    expect(archived.archivedFrom).toBe('orders');
  });

  test('should update stats after archive', async () => {
    await orders.insert({
      id: 'order-2',
      orderNumber: 'ORD-002',
      total: 200
    });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalArchived).toBeGreaterThan(statsBefore.totalArchived);
    expect(statsAfter.totalDeleted).toBeGreaterThan(statsBefore.totalDeleted);
  });
});
