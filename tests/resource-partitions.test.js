import { join } from 'path';
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';
import Database from '../src/database.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-partitions-' + Date.now());

describe('Resource Partitions', () => {
  let client;

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    })
  });

  test('Basic Partition Creation and Validation', async () => {
    const resource = new Resource({
      client,
      name: 'products',
      attributes: {
        name: 'string|required',
        category: 'string|required',
        region: 'string|required',
        price: 'number|required'
      },
      partitions: {
        byCategory: {
          fields: {
            category: 'string'
          }
        },
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        }
      }
    });

    expect(resource.config.partitions.byCategory).toBeDefined();
    expect(resource.config.partitions.byRegion).toBeDefined();
    expect(resource.config.partitions.byCategory.fields.category).toBe('string');
    expect(resource.config.partitions.byRegion.fields.region).toBe('string|maxlength:2');
  });

  test('Partition Field Validation', async () => {
    // Test that partition validation fails for non-existent fields
    expect(() => {
      new Resource({
        client,
        name: 'invalid',
        attributes: {
          name: 'string|required'
        },
        partitions: {
          invalidPartition: {
            fields: {
              nonExistentField: 'string' // This field doesn't exist in attributes
            }
          }
        }
      });
    }).toThrow(/Partition 'invalidPartition' uses field 'nonExistentField'/);
  });

  test('Partition Key Generation', async () => {
    const resource = new Resource({
      client,
      name: 'test',
      attributes: {
        name: 'string|required',
        region: 'string|required',
        category: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        },
        byRegionCategory: {
          fields: {
            region: 'string|maxlength:2',
            category: 'string'
          }
        }
      }
    });

    const testData = {
      id: 'test-id',
      name: 'Test Item',
      region: 'US',
      category: 'electronics'
    };

    // Test single field partition key
    const regionKey = resource.getPartitionKey({ partitionName: 'byRegion', id: 'test-id', data: testData });
    expect(regionKey).toContain('resource=test');
    expect(regionKey).toContain('partition=byRegion');
    expect(regionKey).toContain('region=US');
    expect(regionKey).toContain('id=test-id');

    // Test multi-field partition key
    const regionCategoryKey = resource.getPartitionKey({ partitionName: 'byRegionCategory', id: 'test-id', data: testData });
    expect(regionCategoryKey).toContain('resource=test');
    expect(regionCategoryKey).toContain('partition=byRegionCategory');
    expect(regionCategoryKey).toContain('region=US');
    expect(regionCategoryKey).toContain('category=electronics');
    expect(regionCategoryKey).toContain('id=test-id');

    // Test null key when required field is missing
    const incompleteData = {
      id: 'test-id',
      name: 'Test Item'
      // Missing region and category
    };

    const nullKey = resource.getPartitionKey({ partitionName: 'byRegion', id: 'test-id', data: incompleteData });
    expect(nullKey).toBeNull();
  });

  test('Partition Rule Application', async () => {
    const resource = new Resource({
      client,
      name: 'test',
      attributes: {
        name: 'string|required',
        code: 'string|required',
        region: 'string|required',
        date: 'string|required'
      },
      partitions: {
        byCode: {
          fields: {
            code: 'string|maxlength:3'
          }
        },
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        },
        byDate: {
          fields: {
            date: 'date|maxlength:10'
          }
        }
      }
    });

    // Test maxlength rule application
    const longCode = resource.applyPartitionRule('ABC123', 'string|maxlength:3');
    expect(longCode).toBe('ABC');

    const longRegion = resource.applyPartitionRule('US-WEST', 'string|maxlength:2');
    expect(longRegion).toBe('US');

    // Test date rule application
    const isoDate = resource.applyPartitionRule('2024-01-15T10:30:00Z', 'date|maxlength:10');
    expect(isoDate).toBe('2024-01-15');

    const dateObject = resource.applyPartitionRule(new Date('2024-01-15'), 'date|maxlength:10');
    expect(dateObject).toBe('2024-01-15');

    const dateString = resource.applyPartitionRule('2024-01-15', 'date|maxlength:10');
    expect(dateString).toBe('2024-01-15');

    // Test null/undefined values
    const nullValue = resource.applyPartitionRule(null, 'string|maxlength:3');
    expect(nullValue).toBeNull();

    const undefinedValue = resource.applyPartitionRule(undefined, 'string|maxlength:3');
    expect(undefinedValue).toBeUndefined();
  });

  test('Partition with Maxlength Rules', async () => {
    const resource = new Resource({
      client,
      name: 'products',
      attributes: {
        name: 'string|required',
        code: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byCode: {
          fields: {
            code: 'string|maxlength:3'
          }
        },
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        }
      }
    });

    // Test partition key generation with truncated values
    const productData = {
      name: 'Product 1',
      code: 'ABC123', // Should be truncated to 'ABC'
      region: 'US-WEST' // Should be truncated to 'US'
    };

    const codeKey = resource.getPartitionKey({ partitionName: 'byCode', id: 'test-id', data: productData });
    expect(codeKey).toContain('code=ABC');

    const regionKey = resource.getPartitionKey({ partitionName: 'byRegion', id: 'test-id', data: productData });
    expect(regionKey).toContain('region=US');
  });

  test('Partition with Date Fields', async () => {
    const resource = new Resource({
      client,
      name: 'events',
      attributes: {
        title: 'string|required',
        eventDate: 'string|required',
        createdAt: 'string|required'
      },
      timestamps: true,
      partitions: {
        byEventDate: {
          fields: {
            eventDate: 'date|maxlength:10'
          }
        },
        byCreatedDate: {
          fields: {
            createdAt: 'date|maxlength:10'
          }
        }
      }
    });

    // Test date partition key generation
    const eventData = {
      title: 'Event 1',
      eventDate: '2024-01-15T10:30:00Z', // ISO string
      createdAt: new Date('2024-01-01T10:00:00Z').toISOString() // Date object converted to ISO
    };

    const eventDateKey = resource.getPartitionKey({ partitionName: 'byEventDate', id: 'test-id', data: eventData });
    expect(eventDateKey).toContain('eventDate=2024-01-15');

    const createdDateKey = resource.getPartitionKey({ partitionName: 'byCreatedDate', id: 'test-id', data: eventData });
    expect(createdDateKey).toContain('createdAt=2024-01-01');
  });

  test('Partition Error Handling', async () => {
    const resource = new Resource({
      client,
      name: 'error-test',
      attributes: {
        name: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: {
            region: 'string'
          }
        }
      }
    });

    // Test invalid partition name
    expect(() => {
      resource.getPartitionKey({ partitionName: 'nonExistentPartition', id: 'id', data: {} });
    }).toThrow(/Partition 'nonExistentPartition' not found/);

    // Test list with invalid partition
    const invalidPartitionResult = await resource.list({
      partition: 'invalid-partition',
      partitionValues: { country: 'US' }
    });
    expect(invalidPartitionResult).toEqual([]);

    // Test count with invalid partition
    try {
      await resource.count({
        partition: 'nonExistentPartition',
        partitionValues: { region: 'US' }
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain("Partition 'nonExistentPartition' not found");
    }
  });

  test('Partition Setup and Validation', async () => {
    // Test resource with no partitions
    const noPartitionResource = new Resource({
      client,
      name: 'no-partitions',
      attributes: {
        name: 'string|required'
      }
    });

    expect(noPartitionResource.config.partitions).toEqual({});
    expect(noPartitionResource.hooks.afterInsert).toHaveLength(0);
    expect(noPartitionResource.hooks.afterDelete).toHaveLength(0);

    // Test resource with partitions
    const partitionResource = new Resource({
      client,
      name: 'with-partitions',
      attributes: {
        name: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        }
      }
    });

    expect(partitionResource.config.partitions.byRegion).toBeDefined();
    expect(partitionResource.hooks.afterInsert).toHaveLength(1);
    expect(partitionResource.hooks.afterDelete).toHaveLength(1);
  });

  test('Partition Field Sorting', async () => {
    const resource = new Resource({
      client,
      name: 'sorting-test',
      attributes: {
        name: 'string|required',
        region: 'string|required',
        category: 'string|required',
        status: 'string|required'
      },
      partitions: {
        byRegionCategoryStatus: {
          fields: {
            status: 'string', // Should be last alphabetically
            region: 'string|maxlength:2', // Should be second
            category: 'string' // Should be first alphabetically
          }
        }
      }
    });

    const testData = {
      name: 'Test Item',
      region: 'US',
      category: 'electronics',
      status: 'active'
    };

    const partitionKey = resource.getPartitionKey({ partitionName: 'byRegionCategoryStatus', id: 'test-id', data: testData });
    
    // Verify fields are sorted alphabetically in the key
    const keyParts = partitionKey.split('/');
    const fieldParts = keyParts.filter(part => part.includes('=') && !part.startsWith('resource=') && !part.startsWith('partition=') && !part.startsWith('id='));
    
    // Extract field names in order they appear
    const fieldNames = fieldParts.map(part => part.split('=')[0]);
    
    // Should be sorted: category, region, status
    expect(fieldNames).toEqual(['category', 'region', 'status']);
  });

  test('Partition with Missing Fields', async () => {
    const resource = new Resource({
      client,
      name: 'missing-fields',
      attributes: {
        name: 'string|required',
        region: 'string|required',
        category: 'string|required'
      },
      partitions: {
        byRegionCategory: {
          fields: {
            region: 'string|maxlength:2',
            category: 'string'
          }
        }
      }
    });

    // Test with missing region
    const dataMissingRegion = {
      name: 'Test Item',
      category: 'electronics'
      // Missing region
    };

    const keyMissingRegion = resource.getPartitionKey({ partitionName: 'byRegionCategory', id: 'test-id', data: dataMissingRegion });
    expect(keyMissingRegion).toBeNull();

    // Test with missing category
    const dataMissingCategory = {
      name: 'Test Item',
      region: 'US'
      // Missing category
    };

    const keyMissingCategory = resource.getPartitionKey({ partitionName: 'byRegionCategory', id: 'test-id', data: dataMissingCategory });
    expect(keyMissingCategory).toBeNull();

    // Test with all fields present
    const completeData = {
      name: 'Test Item',
      region: 'US',
      category: 'electronics'
    };

    const completeKey = resource.getPartitionKey({ partitionName: 'byRegionCategory', id: 'test-id', data: completeData });
    expect(completeKey).not.toBeNull();
    expect(completeKey).toContain('region=US');
    expect(completeKey).toContain('category=electronics');
  });

  // ===== NOVOS TESTES PARA OPERAÇÕES REAIS COM PARTITIONS =====

  test('Complete Partition Operations - Insert, List, Count, and Query', async () => {
    const resource = new Resource({
      client,
      name: 'test-operations',
      attributes: {
        name: 'string|required',
        category: 'string|required',
        region: 'string|required',
        price: 'number|required'
      },
      partitions: {
        byCategory: {
          fields: {
            category: 'string'
          }
        },
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        },
        byCategoryRegion: {
          fields: {
            category: 'string',
            region: 'string|maxlength:2'
          }
        }
      }
    });

    // Insert test data
    const products = [
      { name: 'Laptop', category: 'electronics', region: 'US', price: 999 },
      { name: 'Phone', category: 'electronics', region: 'US', price: 699 },
      { name: 'Tablet', category: 'electronics', region: 'EU', price: 499 },
      { name: 'Book', category: 'books', region: 'US', price: 19 },
      { name: 'Magazine', category: 'books', region: 'EU', price: 9 },
      { name: 'Chair', category: 'furniture', region: 'US', price: 199 }
    ];

    const insertedProducts = [];
    for (const product of products) {
      const inserted = await resource.insert(product);
      insertedProducts.push(inserted);
    }

    // Test listIds with partitions
    const electronicsIds = await resource.listIds({
      partition: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(electronicsIds).toHaveLength(3);
    expect(electronicsIds).toContain(insertedProducts[0].id);
    expect(electronicsIds).toContain(insertedProducts[1].id);
    expect(electronicsIds).toContain(insertedProducts[2].id);

    const usIds = await resource.listIds({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usIds).toHaveLength(4); // Laptop, Phone, Book, Chair

    const euElectronicsIds = await resource.listIds({
      partition: 'byCategoryRegion',
      partitionValues: { category: 'electronics', region: 'EU' }
    });
    expect(euElectronicsIds).toHaveLength(1); // Only Tablet

    // Test count with partitions
    const electronicsCount = await resource.count({
      partition: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(electronicsCount).toBe(3);

    const usCount = await resource.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usCount).toBe(4);

    // Test list
    const electronicsProducts = await resource.list({
      partition: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(electronicsProducts).toHaveLength(3);
    expect(electronicsProducts.map(p => p.name)).toContain('Laptop');
    expect(electronicsProducts.map(p => p.name)).toContain('Phone');

    const usProducts = await resource.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usProducts).toHaveLength(4);
    expect(usProducts.map(p => p.name)).toContain('Laptop');
    expect(usProducts.map(p => p.name)).toContain('Book');

    // Test list with pagination
    const paginatedProducts = await resource.list({
      partition: 'byCategory',
      partitionValues: { category: 'electronics' },
      limit: 1
    });
    expect(paginatedProducts).toHaveLength(1);

    const paginatedProductsOffset = await resource.list({
      partition: 'byCategory',
      partitionValues: { category: 'electronics' },
      limit: 1,
      offset: 1
    });
    expect(paginatedProductsOffset).toHaveLength(1);

    // Test page with partitions
    const page = await resource.page({
      offset: 0,
      size: 2,
      partition: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(page.items).toHaveLength(2);
    expect(page.totalItems).toBe(3);
    expect(page.totalPages).toBe(2);
    expect(page.page).toBe(0);
    expect(page.pageSize).toBe(2);

    // Test getFromPartition
    const laptopFromPartition = await resource.getFromPartition({
      id: insertedProducts[0].id,
      partitionName: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(laptopFromPartition.name).toBe('Laptop');
    expect(laptopFromPartition._partition).toBe('byCategory');
    expect(laptopFromPartition._partitionValues).toEqual({ category: 'electronics' });

    // Test regular query (should not use partitions)
    const allProducts = await resource.query({});
    expect(allProducts).toHaveLength(6);

    const electronicsByQuery = await resource.query({ category: 'electronics' });
    expect(electronicsByQuery).toHaveLength(3);
  });

  test('Partition Operations with Date Fields', async () => {
    const resource = new Resource({
      client,
      name: 'test-date-partitions',
      attributes: {
        name: 'string|required',
        eventDate: 'string|required',
        category: 'string|required'
      },
      timestamps: true,
      partitions: {
        byDate: {
          fields: {
            eventDate: 'date|maxlength:10'
          }
        }
      }
    });

    // Insert events with different dates
    const events = [
      { name: 'Event 1', eventDate: '2024-01-15T10:00:00Z', category: 'conference' },
      { name: 'Event 2', eventDate: '2024-01-15T14:00:00Z', category: 'conference' },
      { name: 'Event 3', eventDate: '2024-01-16T09:00:00Z', category: 'workshop' },
      { name: 'Event 4', eventDate: '2024-01-16T16:00:00Z', category: 'workshop' },
      { name: 'Event 5', eventDate: '2024-01-17T11:00:00Z', category: 'meeting' }
    ];

    const insertedEvents = [];
    for (const event of events) {
      const inserted = await resource.insert(event);
      insertedEvents.push(inserted);
    }

    // Test listIds by date
    const jan15Ids = await resource.listIds({
      partition: 'byDate',
      partitionValues: { eventDate: '2024-01-15' }
    });
    expect(jan15Ids).toHaveLength(2);

    const jan16Ids = await resource.listIds({
      partition: 'byDate',
      partitionValues: { eventDate: '2024-01-16' }
    });
    expect(jan16Ids).toHaveLength(2);

    // Test count by date
    const jan15Count = await resource.count({
      partition: 'byDate',
      partitionValues: { eventDate: '2024-01-15' }
    });
    expect(jan15Count).toBe(2);

    // Test list by date
    const jan15Events = await resource.list({
      partition: 'byDate',
      partitionValues: { eventDate: '2024-01-15' }
    });
    expect(jan15Events).toHaveLength(2);
    expect(jan15Events.map(e => e.name)).toContain('Event 1');
    expect(jan15Events.map(e => e.name)).toContain('Event 2');

    // Test single field partition (byDate only)
    const jan15Ids2 = await resource.listIds({
      partition: 'byDate',
      partitionValues: { eventDate: '2024-01-15' }
    });
    expect(jan15Ids2).toHaveLength(2);

    const jan16Ids2 = await resource.listIds({
      partition: 'byDate',
      partitionValues: { eventDate: '2024-01-16' }
    });
    expect(jan16Ids2).toHaveLength(2);

    // Test getFromPartition with date
    const event1FromPartition = await resource.getFromPartition({
      id: insertedEvents[0].id,
      partitionName: 'byDate',
      partitionValues: { eventDate: '2024-01-15' }
    });
    expect(event1FromPartition.name).toBe('Event 1');
    expect(event1FromPartition._partition).toBe('byDate');
  });

  test('Partition Operations with Empty Results', async () => {
    const resource = new Resource({
      client,
      name: 'test-empty-partitions',
      attributes: {
        name: 'string|required',
        category: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byCategory: {
          fields: {
            category: 'string'
          }
        },
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        }
      }
    });

    // Insert only electronics products
    await resource.insert({ name: 'Laptop', category: 'electronics', region: 'US' });
    await resource.insert({ name: 'Phone', category: 'electronics', region: 'EU' });

    // Test empty results for non-existent categories
    const booksIds = await resource.listIds({
      partition: 'byCategory',
      partitionValues: { category: 'books' }
    });
    expect(booksIds).toHaveLength(0);

    const booksCount = await resource.count({
      partition: 'byCategory',
      partitionValues: { category: 'books' }
    });
    expect(booksCount).toBe(0);

    const booksProducts = await resource.list({
      partition: 'byCategory',
      partitionValues: { category: 'books' }
    });
    expect(booksProducts).toHaveLength(0);

    // Test empty results for non-existent regions
    const asiaIds = await resource.listIds({
      partition: 'byRegion',
      partitionValues: { region: 'AS' }
    });
    expect(asiaIds).toHaveLength(0);

    const asiaCount = await resource.count({
      partition: 'byRegion',
      partitionValues: { region: 'AS' }
    });
    expect(asiaCount).toBe(0);
  });

  test('Partition Operations with Maxlength Rules', async () => {
    const resource = new Resource({
      client,
      name: 'test-maxlength-partitions',
      attributes: {
        name: 'string|required',
        code: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byCode: {
          fields: {
            code: 'string|maxlength:3'
          }
        },
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        }
      }
    });

    // Insert products with long codes and regions
    await resource.insert({ name: 'Product 1', code: 'ABC123', region: 'US-WEST' });
    await resource.insert({ name: 'Product 2', code: 'DEF456', region: 'US-EAST' });
    await resource.insert({ name: 'Product 3', code: 'GHI789', region: 'EU-NORTH' });

    // Test that truncated values work in partitions
    const abcIds = await resource.listIds({
      partition: 'byCode',
      partitionValues: { code: 'ABC' }
    });
    expect(abcIds).toHaveLength(1);

    const defIds = await resource.listIds({
      partition: 'byCode',
      partitionValues: { code: 'DEF' }
    });
    expect(defIds).toHaveLength(1);

    const usIds = await resource.listIds({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usIds).toHaveLength(2); // Both US-WEST and US-EAST should match 'US'

    const euIds = await resource.listIds({
      partition: 'byRegion',
      partitionValues: { region: 'EU' }
    });
    expect(euIds).toHaveLength(1);

    // Test count with truncated values
    const usCount = await resource.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usCount).toBe(2);

    // Test list with truncated values
    const usProducts = await resource.list({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usProducts).toHaveLength(2);
    expect(usProducts.map(p => p.name)).toContain('Product 1');
    expect(usProducts.map(p => p.name)).toContain('Product 2');
  });

  test('Partition Operations with Mixed Data Types', async () => {
    const resource = new Resource({
      client,
      name: 'test-mixed-partitions',
      attributes: {
        name: 'string|required',
        category: 'string|required',
        price: 'number|required',
        isActive: 'boolean|required'
      },
      partitions: {
        byCategory: {
          fields: {
            category: 'string'
          }
        },
        byPriceRange: {
          fields: {
            price: 'number'
          }
        },
        byStatus: {
          fields: {
            isActive: 'boolean'
          }
        }
      }
    });

    // Insert products with mixed data types
    await resource.insert({ name: 'Laptop', category: 'electronics', price: 999, isActive: true });
    await resource.insert({ name: 'Phone', category: 'electronics', price: 699, isActive: true });
    await resource.insert({ name: 'Book', category: 'books', price: 25, isActive: false });
    await resource.insert({ name: 'Chair', category: 'furniture', price: 299, isActive: true });

    // Test string partitions
    const electronicsIds = await resource.listIds({
      partition: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(electronicsIds).toHaveLength(2);

    // Test number partitions
    const expensiveIds = await resource.listIds({
      partition: 'byPriceRange',
      partitionValues: { price: 999 }
    });
    expect(expensiveIds).toHaveLength(1);

    const cheapIds = await resource.listIds({
      partition: 'byPriceRange',
      partitionValues: { price: 25 }
    });
    expect(cheapIds).toHaveLength(1);

    const mediumIds = await resource.listIds({
      partition: 'byPriceRange',
      partitionValues: { price: 299 }
    });
    expect(mediumIds).toHaveLength(1);

    // Test boolean partitions
    const activeIds = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { isActive: true }
    });
    expect(activeIds).toHaveLength(3);

    const inactiveIds = await resource.listIds({
      partition: 'byStatus',
      partitionValues: { isActive: false }
    });
    expect(inactiveIds).toHaveLength(1);

    // Test counts
    const activeCount = await resource.count({
      partition: 'byStatus',
      partitionValues: { isActive: true }
    });
    expect(activeCount).toBe(3);

    // Test list
    const activeProducts = await resource.list({
      partition: 'byStatus',
      partitionValues: { isActive: true }
    });
    expect(activeProducts).toHaveLength(3);
    expect(activeProducts.every(p => p.isActive)).toBe(true);
  });

  test('Partition with 2 Attributes', async () => {
    const resource = new Resource({
      client,
      name: 'test-2-attributes',
      attributes: {
        name: 'string|required',
        category: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byCategoryRegion: {
          fields: {
            category: 'string',
            region: 'string|maxlength:2'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({ name: 'Laptop', category: 'electronics', region: 'US' });
    await resource.insert({ name: 'Phone', category: 'electronics', region: 'US' });
    await resource.insert({ name: 'Tablet', category: 'electronics', region: 'EU' });
    await resource.insert({ name: 'Book', category: 'books', region: 'US' });

    // Test listIds with 2 attributes
    const usElectronicsIds = await resource.listIds({
      partition: 'byCategoryRegion',
      partitionValues: { category: 'electronics', region: 'US' }
    });
    expect(usElectronicsIds).toHaveLength(2);

    const euElectronicsIds = await resource.listIds({
      partition: 'byCategoryRegion',
      partitionValues: { category: 'electronics', region: 'EU' }
    });
    expect(euElectronicsIds).toHaveLength(1);

    const usBooksIds = await resource.listIds({
      partition: 'byCategoryRegion',
      partitionValues: { category: 'books', region: 'US' }
    });
    expect(usBooksIds).toHaveLength(1);

    // Test count with 2 attributes
    const usElectronicsCount = await resource.count({
      partition: 'byCategoryRegion',
      partitionValues: { category: 'electronics', region: 'US' }
    });
    expect(usElectronicsCount).toBe(2);

    // Test list with 2 attributes
    const usElectronicsProducts = await resource.list({
      partition: 'byCategoryRegion',
      partitionValues: { category: 'electronics', region: 'US' }
    });
    expect(usElectronicsProducts).toHaveLength(2);
    expect(usElectronicsProducts.map(p => p.name)).toContain('Laptop');
    expect(usElectronicsProducts.map(p => p.name)).toContain('Phone');
  });

  test('Partition with 3 Attributes', async () => {
    const resource = new Resource({
      client,
      name: 'test-3-attributes',
      attributes: {
        name: 'string|required',
        category: 'string|required',
        region: 'string|required',
        status: 'string|required'
      },
      partitions: {
        byCategoryRegionStatus: {
          fields: {
            category: 'string',
            region: 'string|maxlength:2',
            status: 'string'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({ name: 'Laptop', category: 'electronics', region: 'US', status: 'active' });
    await resource.insert({ name: 'Phone', category: 'electronics', region: 'US', status: 'active' });
    await resource.insert({ name: 'Tablet', category: 'electronics', region: 'US', status: 'inactive' });
    await resource.insert({ name: 'Book', category: 'books', region: 'EU', status: 'active' });

    // Test listIds with 3 attributes
    const usActiveElectronicsIds = await resource.listIds({
      partition: 'byCategoryRegionStatus',
      partitionValues: { category: 'electronics', region: 'US', status: 'active' }
    });
    expect(usActiveElectronicsIds).toHaveLength(2);

    const usInactiveElectronicsIds = await resource.listIds({
      partition: 'byCategoryRegionStatus',
      partitionValues: { category: 'electronics', region: 'US', status: 'inactive' }
    });
    expect(usInactiveElectronicsIds).toHaveLength(1);

    const euActiveBooksIds = await resource.listIds({
      partition: 'byCategoryRegionStatus',
      partitionValues: { category: 'books', region: 'EU', status: 'active' }
    });
    expect(euActiveBooksIds).toHaveLength(1);

    // Test count with 3 attributes
    const usActiveElectronicsCount = await resource.count({
      partition: 'byCategoryRegionStatus',
      partitionValues: { category: 'electronics', region: 'US', status: 'active' }
    });
    expect(usActiveElectronicsCount).toBe(2);

    // Test list with 3 attributes
    const usActiveElectronicsProducts = await resource.list({
      partition: 'byCategoryRegionStatus',
      partitionValues: { category: 'electronics', region: 'US', status: 'active' }
    });
    expect(usActiveElectronicsProducts).toHaveLength(2);
    expect(usActiveElectronicsProducts.map(p => p.name)).toContain('Laptop');
    expect(usActiveElectronicsProducts.map(p => p.name)).toContain('Phone');
  });

  test('Partition with 5 Attributes', async () => {
    const resource = new Resource({
      client,
      name: 'test-5-attributes',
      attributes: {
        name: 'string|required',
        category: 'string|required',
        region: 'string|required',
        status: 'string|required',
        priority: 'string|required',
        type: 'string|required'
      },
      partitions: {
        byCategoryRegionStatusPriorityType: {
          fields: {
            category: 'string',
            region: 'string|maxlength:2',
            status: 'string',
            priority: 'string',
            type: 'string'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({ 
      name: 'Laptop', 
      category: 'electronics', 
      region: 'US', 
      status: 'active', 
      priority: 'high', 
      type: 'hardware' 
    });
    await resource.insert({ 
      name: 'Phone', 
      category: 'electronics', 
      region: 'US', 
      status: 'active', 
      priority: 'high', 
      type: 'hardware' 
    });
    await resource.insert({ 
      name: 'Software', 
      category: 'electronics', 
      region: 'US', 
      status: 'active', 
      priority: 'medium', 
      type: 'software' 
    });

    // Test listIds with 5 attributes
    const usActiveHighHardwareIds = await resource.listIds({
      partition: 'byCategoryRegionStatusPriorityType',
      partitionValues: { 
        category: 'electronics', 
        region: 'US', 
        status: 'active', 
        priority: 'high', 
        type: 'hardware' 
      }
    });
    expect(usActiveHighHardwareIds).toHaveLength(2);

    const usActiveMediumSoftwareIds = await resource.listIds({
      partition: 'byCategoryRegionStatusPriorityType',
      partitionValues: { 
        category: 'electronics', 
        region: 'US', 
        status: 'active', 
        priority: 'medium', 
        type: 'software' 
      }
    });
    expect(usActiveMediumSoftwareIds).toHaveLength(1);

    // Test count with 5 attributes
    const usActiveHighHardwareCount = await resource.count({
      partition: 'byCategoryRegionStatusPriorityType',
      partitionValues: { 
        category: 'electronics', 
        region: 'US', 
        status: 'active', 
        priority: 'high', 
        type: 'hardware' 
      }
    });
    expect(usActiveHighHardwareCount).toBe(2);

    // Test list with 5 attributes
    const usActiveHighHardwareProducts = await resource.list({
      partition: 'byCategoryRegionStatusPriorityType',
      partitionValues: { 
        category: 'electronics', 
        region: 'US', 
        status: 'active', 
        priority: 'high', 
        type: 'hardware' 
      }
    });
    expect(usActiveHighHardwareProducts).toHaveLength(2);
    expect(usActiveHighHardwareProducts.map(p => p.name)).toContain('Laptop');
    expect(usActiveHighHardwareProducts.map(p => p.name)).toContain('Phone');
  });

  test('Partition with Nested Fields', async () => {
    const resource = new Resource({
      client,
      name: 'test-nested-partitions',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          term: 'string|optional',
          campaign: 'string|required'
        },
        address: {
          country: 'string|required',
          state: 'string|required',
          city: 'string|required'
        },
        metadata: {
          category: 'string|required',
          priority: 'string|required'
        }
      },
      partitions: {
        byUtmSource: {
          fields: {
            'utm.source': 'string'
          }
        },
        byUtmCampaign: {
          fields: {
            'utm.campaign': 'string'
          }
        },
        byAddressCountry: {
          fields: {
            'address.country': 'string|maxlength:2'
          }
        },
        byAddressState: {
          fields: {
            'address.country': 'string|maxlength:2',
            'address.state': 'string'
          }
        },
        byMetadataCategory: {
          fields: {
            'metadata.category': 'string'
          }
        },
        byUtmAndAddress: {
          fields: {
            'utm.source': 'string',
            'utm.medium': 'string',
            'address.country': 'string|maxlength:2'
          }
        }
      }
    });

    // Insert test data with nested objects
    await resource.insert({
      name: 'User 1',
      utm: {
        source: 'google',
        medium: 'cpc',
        term: 'search term',
        campaign: 'brand'
      },
      address: {
        country: 'US',
        state: 'California',
        city: 'San Francisco'
      },
      metadata: {
        category: 'premium',
        priority: 'high'
      }
    });

    await resource.insert({
      name: 'User 2',
      utm: {
        source: 'facebook',
        medium: 'social',
        term: null,
        campaign: 'awareness'
      },
      address: {
        country: 'US',
        state: 'New York',
        city: 'New York'
      },
      metadata: {
        category: 'standard',
        priority: 'medium'
      }
    });

    await resource.insert({
      name: 'User 3',
      utm: {
        source: 'google',
        medium: 'organic',
        term: 'organic search',
        campaign: 'seo'
      },
      address: {
        country: 'CA',
        state: 'Ontario',
        city: 'Toronto'
      },
      metadata: {
        category: 'premium',
        priority: 'high'
      }
    });

    // Test single nested field partition
    const googleUsers = await resource.listIds({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleUsers).toHaveLength(2);

    const facebookUsers = await resource.listIds({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'facebook' }
    });
    expect(facebookUsers).toHaveLength(1);

    // Test nested field with maxlength rule
    const usUsers = await resource.listIds({
      partition: 'byAddressCountry',
      partitionValues: { 'address.country': 'US' }
    });
    expect(usUsers).toHaveLength(2);

    const caUsers = await resource.listIds({
      partition: 'byAddressCountry',
      partitionValues: { 'address.country': 'CA' }
    });
    expect(caUsers).toHaveLength(1);

    // Test multi-field nested partition
    const usCaliforniaUsers = await resource.listIds({
      partition: 'byAddressState',
      partitionValues: { 'address.country': 'US', 'address.state': 'California' }
    });
    expect(usCaliforniaUsers).toHaveLength(1);

    const usNewYorkUsers = await resource.listIds({
      partition: 'byAddressState',
      partitionValues: { 'address.country': 'US', 'address.state': 'New York' }
    });
    expect(usNewYorkUsers).toHaveLength(1);

    // Test complex multi-field nested partition
    const googleCpcUsUsers = await resource.listIds({
      partition: 'byUtmAndAddress',
      partitionValues: { 
        'utm.source': 'google', 
        'utm.medium': 'cpc', 
        'address.country': 'US' 
      }
    });
    expect(googleCpcUsUsers).toHaveLength(1);

    // Test count with nested fields
    const googleCount = await resource.count({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleCount).toBe(2);

    const usCount = await resource.count({
      partition: 'byAddressCountry',
      partitionValues: { 'address.country': 'US' }
    });
    expect(usCount).toBe(2);

    // Test list with nested fields
    const googleUsersData = await resource.list({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleUsersData).toHaveLength(2);
    expect(googleUsersData.map(u => u.name)).toContain('User 1');
    expect(googleUsersData.map(u => u.name)).toContain('User 3');

    // Test getFromPartition with nested fields
    if (googleUsers.length > 0) {
      const userFromPartition = await resource.getFromPartition({
        id: googleUsers[0],
        partitionName: 'byUtmSource',
        partitionValues: { 'utm.source': 'google' }
      });
      expect(userFromPartition.utm.source).toBe('google');
      expect(userFromPartition._partition).toBe('byUtmSource');
    }

    // Test that nested fields are properly accessed during partition key generation
    const partitionKey = resource.getPartitionKey({
      partitionName: 'byUtmSource',
      id: 'test-id',
      data: {
        name: 'Test User',
        utm: {
          source: 'google',
          medium: 'cpc'
        }
      }
    });
    expect(partitionKey).toContain('utm.source=google');
    expect(partitionKey).toContain('partition=byUtmSource');

    // Test that missing nested fields return null
    const nullKey = resource.getPartitionKey({
      partitionName: 'byUtmSource',
      id: 'test-id',
      data: {
        name: 'Test User'
        // Missing utm object
      }
    });
    expect(nullKey).toBeNull();

    // Test that partial nested objects return null
    const partialKey = resource.getPartitionKey({
      partitionName: 'byUtmSource',
      id: 'test-id',
      data: {
        name: 'Test User',
        utm: {
          medium: 'cpc'
          // Missing source field
        }
      }
    });
    expect(partialKey).toBeNull();
  });

  // ===== UTM TRACKING PARTITION TESTS =====

  test('UTM Tracking Resource Creation', async () => {
    const resource = new Resource({
      client,
      name: 'utm-users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          term: 'string|optional',
          campaign: 'string|required',
          content: 'string|optional'
        },
        address: {
          country: 'string|required',
          state: 'string|required',
          city: 'string|required'
        },
        metadata: {
          category: 'string|required',
          priority: 'string|required'
        }
      },
      timestamps: true,
      partitions: {
        byUtmSource: {
          fields: {
            'utm.source': 'string'
          }
        },
        byUtmMedium: {
          fields: {
            'utm.medium': 'string'
          }
        },
        byUtmCampaign: {
          fields: {
            'utm.campaign': 'string'
          }
        },
        byCountry: {
          fields: {
            'address.country': 'string|maxlength:2'
          }
        },
        bySourceMedium: {
          fields: {
            'utm.source': 'string',
            'utm.medium': 'string'
          }
        }
      }
    });

    expect(resource.config.partitions.byUtmSource).toBeDefined();
    expect(resource.config.partitions.byUtmMedium).toBeDefined();
    expect(resource.config.partitions.byUtmCampaign).toBeDefined();
    expect(resource.config.partitions.byCountry).toBeDefined();
    expect(resource.config.partitions.bySourceMedium).toBeDefined();
  });

  test('UTM Data Insertion and Partition Creation', async () => {
    const resource = new Resource({
      client,
      name: 'utm-test',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          campaign: 'string|required'
        },
        address: {
          country: 'string|required',
          state: 'string|required'
        }
      },
      partitions: {
        byUtmSource: {
          fields: {
            'utm.source': 'string'
          }
        },
        bySourceMedium: {
          fields: {
            'utm.source': 'string',
            'utm.medium': 'string'
          }
        }
      }
    });

    // Insert UTM tracking data
    const user1 = await resource.insert({
      name: 'John Doe',
      email: 'john@example.com',
      utm: {
        source: 'google',
        medium: 'cpc',
        campaign: 'brand_awareness'
      },
      address: {
        country: 'US',
        state: 'California'
      }
    });

    const user2 = await resource.insert({
      name: 'Jane Smith',
      email: 'jane@example.com',
      utm: {
        source: 'facebook',
        medium: 'social',
        campaign: 'social_engagement'
      },
      address: {
        country: 'US',
        state: 'New York'
      }
    });

    const user3 = await resource.insert({
      name: 'Bob Wilson',
      email: 'bob@example.com',
      utm: {
        source: 'google',
        medium: 'organic',
        campaign: 'seo'
      },
      address: {
        country: 'CA',
        state: 'Ontario'
      }
    });

    expect(user1.id).toBeDefined();
    expect(user2.id).toBeDefined();
    expect(user3.id).toBeDefined();
    expect(user1.utm.source).toBe('google');
    expect(user2.utm.source).toBe('facebook');
    expect(user3.utm.source).toBe('google');
  });

  test('UTM Source Analysis', async () => {
    const resource = new Resource({
      client,
      name: 'utm-source-analysis',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          campaign: 'string|required'
        }
      },
      partitions: {
        byUtmSource: {
          fields: {
            'utm.source': 'string'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({
      name: 'User 1',
      utm: { source: 'google', medium: 'cpc', campaign: 'brand' }
    });
    await resource.insert({
      name: 'User 2',
      utm: { source: 'google', medium: 'organic', campaign: 'seo' }
    });
    await resource.insert({
      name: 'User 3',
      utm: { source: 'facebook', medium: 'social', campaign: 'awareness' }
    });
    await resource.insert({
      name: 'User 4',
      utm: { source: 'twitter', medium: 'social', campaign: 'viral' }
    });

    // Test UTM source analysis
    const googleUsers = await resource.listIds({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleUsers).toHaveLength(2);

    const facebookUsers = await resource.listIds({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'facebook' }
    });
    expect(facebookUsers).toHaveLength(1);

    const twitterUsers = await resource.listIds({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'twitter' }
    });
    expect(twitterUsers).toHaveLength(1);

    // Test count operations
    const googleCount = await resource.count({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleCount).toBe(2);

    const facebookCount = await resource.count({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'facebook' }
    });
    expect(facebookCount).toBe(1);
  });

  test('UTM Medium Analysis', async () => {
    const resource = new Resource({
      client,
      name: 'utm-medium-analysis',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          campaign: 'string|required'
        }
      },
      partitions: {
        byUtmMedium: {
          fields: {
            'utm.medium': 'string'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({
      name: 'User 1',
      utm: { source: 'google', medium: 'cpc', campaign: 'brand' }
    });
    await resource.insert({
      name: 'User 2',
      utm: { source: 'google', medium: 'organic', campaign: 'seo' }
    });
    await resource.insert({
      name: 'User 3',
      utm: { source: 'facebook', medium: 'social', campaign: 'awareness' }
    });
    await resource.insert({
      name: 'User 4',
      utm: { source: 'twitter', medium: 'social', campaign: 'viral' }
    });

    // Test UTM medium analysis
    const cpcUsers = await resource.listIds({
      partition: 'byUtmMedium',
      partitionValues: { 'utm.medium': 'cpc' }
    });
    expect(cpcUsers).toHaveLength(1);

    const organicUsers = await resource.listIds({
      partition: 'byUtmMedium',
      partitionValues: { 'utm.medium': 'organic' }
    });
    expect(organicUsers).toHaveLength(1);

    const socialUsers = await resource.listIds({
      partition: 'byUtmMedium',
      partitionValues: { 'utm.medium': 'social' }
    });
    expect(socialUsers).toHaveLength(2);

    // Test count operations
    const socialCount = await resource.count({
      partition: 'byUtmMedium',
      partitionValues: { 'utm.medium': 'social' }
    });
    expect(socialCount).toBe(2);
  });

  test('UTM Campaign Performance', async () => {
    const resource = new Resource({
      client,
      name: 'utm-campaign-performance',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          campaign: 'string|required'
        }
      },
      partitions: {
        byUtmCampaign: {
          fields: {
            'utm.campaign': 'string'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({
      name: 'User 1',
      utm: { source: 'google', medium: 'cpc', campaign: 'brand_awareness' }
    });
    await resource.insert({
      name: 'User 2',
      utm: { source: 'google', medium: 'cpc', campaign: 'brand_awareness' }
    });
    await resource.insert({
      name: 'User 3',
      utm: { source: 'facebook', medium: 'social', campaign: 'social_engagement' }
    });
    await resource.insert({
      name: 'User 4',
      utm: { source: 'google', medium: 'organic', campaign: 'seo' }
    });

    // Test campaign performance
    const brandAwarenessUsers = await resource.listIds({
      partition: 'byUtmCampaign',
      partitionValues: { 'utm.campaign': 'brand_awareness' }
    });
    expect(brandAwarenessUsers).toHaveLength(2);

    const socialEngagementUsers = await resource.listIds({
      partition: 'byUtmCampaign',
      partitionValues: { 'utm.campaign': 'social_engagement' }
    });
    expect(socialEngagementUsers).toHaveLength(1);

    const seoUsers = await resource.listIds({
      partition: 'byUtmCampaign',
      partitionValues: { 'utm.campaign': 'seo' }
    });
    expect(seoUsers).toHaveLength(1);

    // Test count operations
    const brandAwarenessCount = await resource.count({
      partition: 'byUtmCampaign',
      partitionValues: { 'utm.campaign': 'brand_awareness' }
    });
    expect(brandAwarenessCount).toBe(2);
  });

  test('Combined UTM Analysis', async () => {
    const resource = new Resource({
      client,
      name: 'utm-combined-analysis',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          campaign: 'string|required'
        }
      },
      partitions: {
        bySourceMedium: {
          fields: {
            'utm.source': 'string',
            'utm.medium': 'string'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({
      name: 'User 1',
      utm: { source: 'google', medium: 'cpc', campaign: 'brand' }
    });
    await resource.insert({
      name: 'User 2',
      utm: { source: 'google', medium: 'cpc', campaign: 'brand' }
    });
    await resource.insert({
      name: 'User 3',
      utm: { source: 'google', medium: 'organic', campaign: 'seo' }
    });
    await resource.insert({
      name: 'User 4',
      utm: { source: 'facebook', medium: 'social', campaign: 'awareness' }
    });

    // Test combined analysis
    const googleCpcUsers = await resource.listIds({
      partition: 'bySourceMedium',
      partitionValues: { 'utm.source': 'google', 'utm.medium': 'cpc' }
    });
    expect(googleCpcUsers).toHaveLength(2);

    const googleOrganicUsers = await resource.listIds({
      partition: 'bySourceMedium',
      partitionValues: { 'utm.source': 'google', 'utm.medium': 'organic' }
    });
    expect(googleOrganicUsers).toHaveLength(1);

    const facebookSocialUsers = await resource.listIds({
      partition: 'bySourceMedium',
      partitionValues: { 'utm.source': 'facebook', 'utm.medium': 'social' }
    });
    expect(facebookSocialUsers).toHaveLength(1);

    // Test count operations
    const googleCpcCount = await resource.count({
      partition: 'bySourceMedium',
      partitionValues: { 'utm.source': 'google', 'utm.medium': 'cpc' }
    });
    expect(googleCpcCount).toBe(2);
  });

  test('Geographic UTM Analysis', async () => {
    const resource = new Resource({
      client,
      name: 'utm-geographic-analysis',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required'
        },
        address: {
          country: 'string|required',
          state: 'string|required'
        }
      },
      partitions: {
        byCountry: {
          fields: {
            'address.country': 'string|maxlength:2'
          }
        },
        byUtmAndCountry: {
          fields: {
            'utm.source': 'string',
            'address.country': 'string|maxlength:2'
          }
        }
      }
    });

    // Insert test data
    await resource.insert({
      name: 'User 1',
      utm: { source: 'google', medium: 'cpc' },
      address: { country: 'US', state: 'California' }
    });
    await resource.insert({
      name: 'User 2',
      utm: { source: 'google', medium: 'organic' },
      address: { country: 'US', state: 'New York' }
    });
    await resource.insert({
      name: 'User 3',
      utm: { source: 'facebook', medium: 'social' },
      address: { country: 'CA', state: 'Ontario' }
    });

    // Test geographic analysis
    const usUsers = await resource.listIds({
      partition: 'byCountry',
      partitionValues: { 'address.country': 'US' }
    });
    expect(usUsers).toHaveLength(2);

    const caUsers = await resource.listIds({
      partition: 'byCountry',
      partitionValues: { 'address.country': 'CA' }
    });
    expect(caUsers).toHaveLength(1);

    // Test combined UTM and geographic analysis
    const usGoogleUsers = await resource.listIds({
      partition: 'byUtmAndCountry',
      partitionValues: { 'utm.source': 'google', 'address.country': 'US' }
    });
    expect(usGoogleUsers).toHaveLength(2);

    const caFacebookUsers = await resource.listIds({
      partition: 'byUtmAndCountry',
      partitionValues: { 'utm.source': 'facebook', 'address.country': 'CA' }
    });
    expect(caFacebookUsers).toHaveLength(1);
  });

  test('UTM Data Retrieval and Pagination', async () => {
    const resource = new Resource({
      client,
      name: 'utm-data-retrieval',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required'
        }
      },
      partitions: {
        byUtmSource: {
          fields: {
            'utm.source': 'string'
          }
        }
      }
    });

    // Insert multiple users for pagination test
    for (let i = 1; i <= 5; i++) {
      await resource.insert({
        name: `User ${i}`,
        utm: { source: 'google', medium: 'cpc' }
      });
    }

    // Test list
    const googleUsers = await resource.list({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleUsers).toHaveLength(5);
    expect(googleUsers.every(u => u.utm.source === 'google')).toBe(true);

    // Test pagination
    const page = await resource.page({
      offset: 0,
      size: 2,
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(page.items).toHaveLength(2);
    expect(page.totalItems).toBe(5);
    expect(page.totalPages).toBe(3);

    // Test getFromPartition
    if (googleUsers.length > 0) {
      const userFromPartition = await resource.getFromPartition({
        id: googleUsers[0].id,
        partitionName: 'byUtmSource',
        partitionValues: { 'utm.source': 'google' }
      });
      expect(userFromPartition.utm.source).toBe('google');
      expect(userFromPartition._partition).toBe('byUtmSource');
    }
  });

  test('UTM Partition Key Generation', async () => {
    const resource = new Resource({
      client,
      name: 'utm-key-generation',
      attributes: {
        name: 'string|required',
        utm: {
          source: 'string|required',
          medium: 'string|required',
          campaign: 'string|required'
        }
      },
      partitions: {
        byUtmSource: {
          fields: {
            'utm.source': 'string'
          }
        },
        bySourceMedium: {
          fields: {
            'utm.source': 'string',
            'utm.medium': 'string'
          }
        }
      }
    });

    const testData = {
      name: 'Test User',
      utm: {
        source: 'google',
        medium: 'cpc',
        campaign: 'brand'
      }
    };

    // Test single field partition key
    const sourceKey = resource.getPartitionKey({ partitionName: 'byUtmSource', id: 'test-id', data: testData });
    expect(sourceKey).toContain('utm.source=google');
    expect(sourceKey).toContain('partition=byUtmSource');

    // Test multi-field partition key
    const sourceMediumKey = resource.getPartitionKey({ partitionName: 'bySourceMedium', id: 'test-id', data: testData });
    expect(sourceMediumKey).toContain('utm.source=google');
    expect(sourceMediumKey).toContain('utm.medium=cpc');
    expect(sourceMediumKey).toContain('partition=bySourceMedium');

    // Test missing UTM data
    const incompleteData = {
      name: 'Test User'
      // Missing utm object
    };

    const nullKey = resource.getPartitionKey({ partitionName: 'byUtmSource', id: 'test-id', data: incompleteData });
    expect(nullKey).toBeNull();
  });

  test('should move partition reference when partitioned field is updated', async () => {
    const resource = new Resource({
      client,
      name: 'partition-move-test',
      attributes: {
        name: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: {
            region: 'string'
          }
        }
      }
    });

    // Insert item in 'US' partition
    const item = await resource.insert({ name: 'Item 1', region: 'US' });
    const id = item.id;

    // Ensure it's in the 'US' partition
    let usIds = await resource.listIds({ partition: 'byRegion', partitionValues: { region: 'US' } });
    expect(usIds).toContain(id);

    // Update to 'BR'
    await resource.update(id, { region: 'BR' });

    // Ensure it's in the 'BR' partition
    const brIds = await resource.listIds({ partition: 'byRegion', partitionValues: { region: 'BR' } });
    expect(brIds).toContain(id);

    // Verify that the new partition works correctly
    const newPartitionResult = await resource.getFromPartition({
      id,
      partitionName: 'byRegion',
      partitionValues: { region: 'BR' }
    });
    expect(newPartitionResult.id).toBe(id);
    expect(newPartitionResult.region).toBe('BR');
  });

  // ===== PARTITION REFERENCE UPDATE TESTS =====

  describe('Partition Reference Update', () => {
    let db;
    let clicks;

    beforeEach(async () => {
      db = new Database({
        verbose: false,
        connectionString: process.env.BUCKET_CONNECTION_STRING
          ? process.env.BUCKET_CONNECTION_STRING
              .replace('USER', process.env.MINIO_USER || 'minioadmin')
              .replace('PASSWORD', process.env.MINIO_PASSWORD || 'minioadmin')
              + `/${testPrefix}`
          : 's3://test-bucket'
      });
      await db.connect();

      // Create a resource with partitions
      await db.createResource({
        name: 'clicks',
        behavior: 'body-overflow',
        timestamps: true,
        attributes: {
          sessionId: 'string',
          urlId: 'string',
          ip: 'string',
          utm: {
            source: 'string',
            medium: 'string',
            campaign: 'string'
          },
          queryParams: 'string|optional',
          userAgent: 'string|optional',
          userAgentData: 'object|optional',
        },
        partitions: {
          byUrlId: {
            fields: { urlId: 'string' }
          },
          bySessionId: {
            fields: { sessionId: 'string' }
          },
          byUtmSource: {
            fields: { 'utm.source': 'string' }
          },
          byUtmCampaign: {
            fields: { 'utm.campaign': 'string' }
          }
        }
      });

      clicks = db.resources.clicks;
    });

    test('should move partition references when partition fields change', async () => {
      // Insert initial click
      const initialClick = await clicks.insert({
        id: 'click-1',
        sessionId: 'session-123',
        urlId: 'url-456',
        ip: '192.168.1.1',
        utm: {
          source: 'email',
          medium: 'email',
          campaign: 'welcome'
        },
        userAgent: 'Mozilla/5.0...'
      });

      expect(initialClick.utm.source).toBe('email');
      expect(initialClick.utm.campaign).toBe('welcome');

      // Verify initial partition references exist
      const initialUtmSourcePartition = await clicks.getFromPartition({
        id: 'click-1',
        partitionName: 'byUtmSource',
        partitionValues: { 'utm.source': 'email' }
      });
      expect(initialUtmSourcePartition.utm.source).toBe('email');

      const initialUtmCampaignPartition = await clicks.getFromPartition({
        id: 'click-1',
        partitionName: 'byUtmCampaign',
        partitionValues: { 'utm.campaign': 'welcome' }
      });
      expect(initialUtmCampaignPartition.utm.campaign).toBe('welcome');

      // Update UTM fields
      const updatedClick = await clicks.update('click-1', {
        utm: {
          source: 'hsm',
          medium: 'email', // Keep the same medium
          campaign: 'retargeting'
        }
      });

      expect(updatedClick.utm.source).toBe('hsm');
      expect(updatedClick.utm.campaign).toBe('retargeting');

      // Verify new partition references are created and working
      const newUtmSourcePartition = await clicks.getFromPartition({
        id: 'click-1',
        partitionName: 'byUtmSource',
        partitionValues: { 'utm.source': 'hsm' }
      });
      expect(newUtmSourcePartition.utm.source).toBe('hsm');

      const newUtmCampaignPartition = await clicks.getFromPartition({
        id: 'click-1',
        partitionName: 'byUtmCampaign',
        partitionValues: { 'utm.campaign': 'retargeting' }
      });
      expect(newUtmCampaignPartition.utm.campaign).toBe('retargeting');



      // Verify unchanged partition references still exist
      const urlIdPartition = await clicks.getFromPartition({
        id: 'click-1',
        partitionName: 'byUrlId',
        partitionValues: { urlId: 'url-456' }
      });
      expect(urlIdPartition.urlId).toBe('url-456');

      const sessionIdPartition = await clicks.getFromPartition({
        id: 'click-1',
        partitionName: 'bySessionId',
        partitionValues: { sessionId: 'session-123' }
      });
      expect(sessionIdPartition.sessionId).toBe('session-123');
    });

    test('should handle partial updates correctly', async () => {
      // Insert initial click
      await clicks.insert({
        id: 'click-2',
        sessionId: 'session-456',
        urlId: 'url-789',
        ip: '192.168.1.2',
        utm: {
          source: 'google',
          medium: 'search',
          campaign: 'search'
        },
        userAgent: 'Mozilla/5.0...'
      });

      // Update only UTM source, keeping campaign unchanged
      const updatedClick = await clicks.update('click-2', {
        utm: {
          source: 'facebook',
          medium: 'search', // Keep the same medium
          campaign: 'search' // Same campaign
        }
      });

      expect(updatedClick.utm.source).toBe('facebook');
      expect(updatedClick.utm.campaign).toBe('search');

      // Verify new UTM source partition reference works
      const newUtmSourcePartition = await clicks.getFromPartition({
        id: 'click-2',
        partitionName: 'byUtmSource',
        partitionValues: { 'utm.source': 'facebook' }
      });
      expect(newUtmSourcePartition.utm.source).toBe('facebook');

      // Verify UTM campaign partition reference unchanged (same value)
      const utmCampaignPartition = await clicks.getFromPartition({
        id: 'click-2',
        partitionName: 'byUtmCampaign',
        partitionValues: { 'utm.campaign': 'search' }
      });
      expect(utmCampaignPartition.utm.campaign).toBe('search');
    });

    test('should handle updates that remove partition field values', async () => {
      // Insert initial click with UTM source
      await clicks.insert({
        id: 'click-3',
        sessionId: 'session-789',
        urlId: 'url-123',
        ip: '192.168.1.3',
        utm: {
          source: 'twitter',
          medium: 'social',
          campaign: 'social'
        },
        userAgent: 'Mozilla/5.0...'
      });

      // Update to remove UTM source (set to empty string)
      const updatedClick = await clicks.update('click-3', {
        utm: {
          source: '',
          medium: 'social',
          campaign: 'social'
        }
      });

      expect(updatedClick.utm.source).toBe('');
      expect(updatedClick.utm.campaign).toBe('social');

      // Verify UTM campaign partition reference still exists (since campaign didn't change)
      const utmCampaignPartition = await clicks.getFromPartition({
        id: 'click-3',
        partitionName: 'byUtmCampaign',
        partitionValues: { 'utm.campaign': 'social' }
      });
      expect(utmCampaignPartition.utm.campaign).toBe('social');


    });

    test('should not fail when partition operations encounter errors', async () => {
      // Insert initial click
      await clicks.insert({
        id: 'click-4',
        sessionId: 'session-999',
        urlId: 'url-999',
        ip: '192.168.1.4',
        utm: {
          source: 'linkedin',
          medium: 'b2b',
          campaign: 'b2b'
        },
        userAgent: 'Mozilla/5.0...'
      });

      // Mock deleteObject and putObject to throw errors
      const originalDeleteObject = clicks.client.deleteObject;
      const originalPutObject = clicks.client.putObject;
      clicks.client.deleteObject = jest.fn().mockImplementation(async (key) => {
        throw new Error('Simulated delete error');
      });
      clicks.client.putObject = jest.fn().mockImplementation(async (key, data) => {
        throw new Error('Simulated put error');
      });

      // Try to update partition references (should not throw)
      await expect(clicks.updatePartitionReferences({
        id: 'click-4',
        sessionId: 'session-999',
        urlId: 'url-999',
        ip: '192.168.1.4',
        utm: {
          source: 'linkedin',
          medium: 'b2b',
          campaign: 'b2b'
        },
        userAgent: 'Mozilla/5.0...'
      })).resolves.not.toThrow();

      // Restore original methods
      clicks.client.deleteObject = originalDeleteObject;
      clicks.client.putObject = originalPutObject;
    });
  });
}); 