import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';
import { Resource } from '../../src/resource.class.js';

describe('Orphaned Partitions', () => {
  let database;
  let resource;

  beforeAll(async () => {
    database = await createDatabaseForTest('s3db-test-orphaned-partitions');
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('findOrphanedPartitions - should detect partitions with missing fields', async () => {
    // Create resource with partition
    resource = await database.createResource({
      name: 'users_orphaned',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        region: 'string|required',
        department: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        },
        byDepartment: {
          fields: { department: 'string' }
        }
      },
      strictValidation: false // Allow orphaned partitions for testing
    });

    // No orphaned partitions yet
    let orphaned = resource.findOrphanedPartitions();
    expect(Object.keys(orphaned).length).toBe(0);

    // Remove a field that a partition depends on
    resource.updateAttributes({
      id: 'string|optional',
      name: 'string|required',
      department: 'string|required'
      // region removed - byRegion partition becomes orphaned
    });

    // Should detect orphaned partition
    orphaned = resource.findOrphanedPartitions();
    expect(Object.keys(orphaned).length).toBe(1);
    expect(orphaned.byRegion).toBeDefined();
    expect(orphaned.byRegion.missingFields).toEqual(['region']);
    expect(orphaned.byRegion.allFields).toEqual(['region']);
  });

  test('findOrphanedPartitions - should detect multiple orphaned partitions', async () => {
    // Create resource with multiple partitions
    const res = await database.createResource({
      name: 'products_orphaned',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        category: 'string|required',
        region: 'string|required',
        status: 'string|required'
      },
      partitions: {
        byCategory: {
          fields: { category: 'string' }
        },
        byRegion: {
          fields: { region: 'string' }
        },
        byStatus: {
          fields: { status: 'string' }
        }
      },
      strictValidation: false // Allow orphaned partitions for testing
    });

    // Remove multiple fields
    res.updateAttributes({
      id: 'string|optional',
      name: 'string|required',
      status: 'string|required'
      // category and region removed
    });

    const orphaned = res.findOrphanedPartitions();
    expect(Object.keys(orphaned).length).toBe(2);
    expect(orphaned.byCategory).toBeDefined();
    expect(orphaned.byRegion).toBeDefined();
    expect(orphaned.byStatus).toBeUndefined();
  });

  test('removeOrphanedPartitions - dry run mode', async () => {
    // Create resource with partition
    const res = await database.createResource({
      name: 'orders_orphaned_dryrun',
      attributes: {
        id: 'string|optional',
        amount: 'number|required',
        region: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        }
      },
      strictValidation: false // Allow orphaned partitions for testing
    });

    // Remove field
    res.updateAttributes({
      id: 'string|optional',
      amount: 'number|required'
    });

    // Dry run - should not modify
    const toRemove = res.removeOrphanedPartitions({ dryRun: true });
    expect(Object.keys(toRemove).length).toBe(1);
    expect(toRemove.byRegion).toBeDefined();

    // Partition should still exist
    expect(res.config.partitions.byRegion).toBeDefined();
  });

  test('removeOrphanedPartitions - actually remove orphaned partitions', async () => {
    // Create resource with partition
    const res = await database.createResource({
      name: 'inventory_orphaned',
      attributes: {
        id: 'string|optional',
        quantity: 'number|required',
        warehouse: 'string|required'
      },
      partitions: {
        byWarehouse: {
          fields: { warehouse: 'string' }
        }
      },
      strictValidation: false // Disable for test
    });

    // Remove field
    res.updateAttributes({
      id: 'string|optional',
      quantity: 'number|required'
    });

    // Track event
    let eventFired = false;
    let eventData = null;
    res.on('orphanedPartitionsRemoved', (data) => {
      eventFired = true;
      eventData = data;
    });

    // Actually remove
    const removed = res.removeOrphanedPartitions();
    expect(Object.keys(removed).length).toBe(1);
    expect(removed.byWarehouse).toBeDefined();

    // Partition should be gone
    expect(res.config.partitions.byWarehouse).toBeUndefined();

    // Wait for async event
    await new Promise(resolve => setImmediate(resolve));
    expect(eventFired).toBe(true);
    expect(eventData.resourceName).toBe('inventory_orphaned');
    expect(eventData.removed).toEqual(['byWarehouse']);
  });

  test('removeOrphanedPartitions - should return empty when no orphaned partitions', async () => {
    const res = await database.createResource({
      name: 'clean_resource',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        status: 'string|required'
      },
      partitions: {
        byStatus: {
          fields: { status: 'string' }
        }
      }
    });

    const removed = res.removeOrphanedPartitions();
    expect(Object.keys(removed).length).toBe(0);
  });

  test('validatePartitions - should throw when strictValidation is true and partition is orphaned', async () => {
    expect(() => {
      new Resource({
        name: 'strict_resource',
        client: database.client,
        database,
        version: 'v1',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        partitions: {
          byRegion: {
            fields: { region: 'string' } // Field doesn't exist!
          }
        },
        strictValidation: true
      });
    }).toThrow(/Partition 'byRegion' uses field 'region'/);
  });

  test('validatePartitions - should not throw when strictValidation is false', () => {
    expect(() => {
      new Resource({
        name: 'lenient_resource',
        client: database.client,
        database,
        version: 'v1',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        partitions: {
          byRegion: {
            fields: { region: 'string' } // Field doesn't exist!
          }
        },
        strictValidation: false
      });
    }).not.toThrow();
  });
});
