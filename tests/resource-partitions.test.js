import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';

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
      options: {
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
      }
    });

    expect(resource.options.partitions.byCategory).toBeDefined();
    expect(resource.options.partitions.byRegion).toBeDefined();
    expect(resource.options.partitions.byCategory.fields.category).toBe('string');
    expect(resource.options.partitions.byRegion.fields.region).toBe('string|maxlength:2');
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
        options: {
          partitions: {
            invalidPartition: {
              fields: {
                nonExistentField: 'string' // This field doesn't exist in attributes
              }
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
      options: {
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
      }
    });

    const testData = {
      id: 'test-id',
      name: 'Test Item',
      region: 'US',
      category: 'electronics'
    };

    // Test single field partition key
    const regionKey = resource.getPartitionKey('byRegion', 'test-id', testData);
    expect(regionKey).toContain('resource=test');
    expect(regionKey).toContain('partition=byRegion');
    expect(regionKey).toContain('region=US');
    expect(regionKey).toContain('id=test-id');

    // Test multi-field partition key
    const regionCategoryKey = resource.getPartitionKey('byRegionCategory', 'test-id', testData);
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

    const nullKey = resource.getPartitionKey('byRegion', 'test-id', incompleteData);
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
      options: {
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
      options: {
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
      }
    });

    // Test partition key generation with truncated values
    const productData = {
      name: 'Product 1',
      code: 'ABC123', // Should be truncated to 'ABC'
      region: 'US-WEST' // Should be truncated to 'US'
    };

    const codeKey = resource.getPartitionKey('byCode', 'test-id', productData);
    expect(codeKey).toContain('code=ABC');

    const regionKey = resource.getPartitionKey('byRegion', 'test-id', productData);
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
      options: {
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
      }
    });

    // Test date partition key generation
    const eventData = {
      title: 'Event 1',
      eventDate: '2024-01-15T10:30:00Z', // ISO string
      createdAt: new Date('2024-01-01T10:00:00Z').toISOString() // Date object converted to ISO
    };

    const eventDateKey = resource.getPartitionKey('byEventDate', 'test-id', eventData);
    expect(eventDateKey).toContain('eventDate=2024-01-15');

    const createdDateKey = resource.getPartitionKey('byCreatedDate', 'test-id', eventData);
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
      options: {
        partitions: {
          byRegion: {
            fields: {
              region: 'string'
            }
          }
        }
      }
    });

    // Test invalid partition name
    expect(() => {
      resource.getPartitionKey('nonExistentPartition', 'id', {});
    }).toThrow(/Partition 'nonExistentPartition' not found/);

    // Test listByPartition with invalid partition
    try {
      await resource.listByPartition({
        partition: 'nonExistentPartition',
        partitionValues: { region: 'US' }
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain("Partition 'nonExistentPartition' not found");
    }

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

    expect(noPartitionResource.options.partitions).toEqual({});
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
      options: {
        partitions: {
          byRegion: {
            fields: {
              region: 'string|maxlength:2'
            }
          }
        }
      }
    });

    expect(partitionResource.options.partitions.byRegion).toBeDefined();
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
      options: {
        partitions: {
          byRegionCategoryStatus: {
            fields: {
              status: 'string', // Should be last alphabetically
              region: 'string|maxlength:2', // Should be second
              category: 'string' // Should be first alphabetically
            }
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

    const partitionKey = resource.getPartitionKey('byRegionCategoryStatus', 'test-id', testData);
    
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
      options: {
        partitions: {
          byRegionCategory: {
            fields: {
              region: 'string|maxlength:2',
              category: 'string'
            }
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

    const keyMissingRegion = resource.getPartitionKey('byRegionCategory', 'test-id', dataMissingRegion);
    expect(keyMissingRegion).toBeNull();

    // Test with missing category
    const dataMissingCategory = {
      name: 'Test Item',
      region: 'US'
      // Missing category
    };

    const keyMissingCategory = resource.getPartitionKey('byRegionCategory', 'test-id', dataMissingCategory);
    expect(keyMissingCategory).toBeNull();

    // Test with all fields present
    const completeData = {
      name: 'Test Item',
      region: 'US',
      category: 'electronics'
    };

    const completeKey = resource.getPartitionKey('byRegionCategory', 'test-id', completeData);
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
      options: {
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

    // Test listByPartition
    const electronicsProducts = await resource.listByPartition({
      partition: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(electronicsProducts).toHaveLength(3);
    expect(electronicsProducts.map(p => p.name)).toContain('Laptop');
    expect(electronicsProducts.map(p => p.name)).toContain('Phone');
    expect(electronicsProducts.map(p => p.name)).toContain('Tablet');

    const usProducts = await resource.listByPartition({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usProducts).toHaveLength(4);
    expect(usProducts.map(p => p.name)).toContain('Laptop');
    expect(usProducts.map(p => p.name)).toContain('Phone');
    expect(usProducts.map(p => p.name)).toContain('Book');
    expect(usProducts.map(p => p.name)).toContain('Chair');

    // Test listByPartition with pagination
    const paginatedProducts = await resource.listByPartition(
      { partition: 'byCategory', partitionValues: { category: 'electronics' } },
      { limit: 2, offset: 0 }
    );
    expect(paginatedProducts).toHaveLength(2);

    const paginatedProductsOffset = await resource.listByPartition(
      { partition: 'byCategory', partitionValues: { category: 'electronics' } },
      { limit: 2, offset: 2 }
    );
    expect(paginatedProductsOffset).toHaveLength(1);

    // Test page with partitions
    const page = await resource.page(0, 2, {
      partition: 'byCategory',
      partitionValues: { category: 'electronics' }
    });
    expect(page.items).toHaveLength(2);
    expect(page.totalItems).toBe(3);
    expect(page.totalPages).toBe(2);
    expect(page.page).toBe(0);
    expect(page.pageSize).toBe(2);

    // Test getFromPartition
    const laptopFromPartition = await resource.getFromPartition(
      insertedProducts[0].id,
      'byCategory',
      { category: 'electronics' }
    );
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
      options: {
        timestamps: true,
        partitions: {
          byDate: {
            fields: {
              eventDate: 'date|maxlength:10'
            }
          },
          byCategoryDate: {
            fields: {
              category: 'string',
              eventDate: 'date|maxlength:10'
            }
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

    // Test listByPartition by date
    const jan15Events = await resource.listByPartition({
      partition: 'byDate',
      partitionValues: { eventDate: '2024-01-15' }
    });
    expect(jan15Events).toHaveLength(2);
    expect(jan15Events.map(e => e.name)).toContain('Event 1');
    expect(jan15Events.map(e => e.name)).toContain('Event 2');

    // Test multi-field partition
    const conferenceJan15Ids = await resource.listIds({
      partition: 'byCategoryDate',
      partitionValues: { category: 'conference', eventDate: '2024-01-15' }
    });
    expect(conferenceJan15Ids).toHaveLength(2);

    const workshopJan16Ids = await resource.listIds({
      partition: 'byCategoryDate',
      partitionValues: { category: 'workshop', eventDate: '2024-01-16' }
    });
    expect(workshopJan16Ids).toHaveLength(2);

    // Test getFromPartition with date
    const event1FromPartition = await resource.getFromPartition(
      insertedEvents[0].id,
      'byDate',
      { eventDate: '2024-01-15' }
    );
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
      options: {
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

    const booksProducts = await resource.listByPartition({
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
      options: {
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

    // Test listByPartition with truncated values
    const usProducts = await resource.listByPartition({
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
      options: {
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

    // Test listByPartition
    const activeProducts = await resource.listByPartition({
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
      options: {
        partitions: {
          byCategoryRegion: {
            fields: {
              category: 'string',
              region: 'string|maxlength:2'
            }
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

    // Test listByPartition with 2 attributes
    const usElectronicsProducts = await resource.listByPartition({
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
      options: {
        partitions: {
          byCategoryRegionStatus: {
            fields: {
              category: 'string',
              region: 'string|maxlength:2',
              status: 'string'
            }
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

    // Test listByPartition with 3 attributes
    const usActiveElectronicsProducts = await resource.listByPartition({
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
      options: {
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

    // Test listByPartition with 5 attributes
    const usActiveHighHardwareProducts = await resource.listByPartition({
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
      options: {
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

    // Test listByPartition with nested fields
    const googleUsersData = await resource.listByPartition({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleUsersData).toHaveLength(2);
    expect(googleUsersData.map(u => u.name)).toContain('User 1');
    expect(googleUsersData.map(u => u.name)).toContain('User 3');

    // Test getFromPartition with nested fields
    const user1FromPartition = await resource.getFromPartition(
      googleUsers[0],
      'byUtmSource',
      { 'utm.source': 'google' }
    );
    expect(user1FromPartition.utm.source).toBe('google');
    expect(user1FromPartition._partition).toBe('byUtmSource');
    expect(user1FromPartition._partitionValues).toEqual({ 'utm.source': 'google' });

    // Test that nested fields are properly accessed during partition key generation
    const partitionKey = resource.getPartitionKey('byUtmSource', 'test-id', {
      name: 'Test User',
      utm: {
        source: 'google',
        medium: 'cpc'
      }
    });
    expect(partitionKey).toContain('utm.source=google');
    expect(partitionKey).toContain('partition=byUtmSource');

    // Test that missing nested fields return null
    const nullKey = resource.getPartitionKey('byUtmSource', 'test-id', {
      name: 'Test User'
      // Missing utm object
    });
    expect(nullKey).toBeNull();

    // Test that partial nested objects return null
    const partialKey = resource.getPartitionKey('byUtmSource', 'test-id', {
      name: 'Test User',
      utm: {
        medium: 'cpc'
        // Missing source field
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
      options: {
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
      }
    });

    expect(resource.options.partitions.byUtmSource).toBeDefined();
    expect(resource.options.partitions.byUtmMedium).toBeDefined();
    expect(resource.options.partitions.byUtmCampaign).toBeDefined();
    expect(resource.options.partitions.byCountry).toBeDefined();
    expect(resource.options.partitions.bySourceMedium).toBeDefined();
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
      options: {
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
      options: {
        partitions: {
          byUtmSource: {
            fields: {
              'utm.source': 'string'
            }
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
      options: {
        partitions: {
          byUtmMedium: {
            fields: {
              'utm.medium': 'string'
            }
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
      options: {
        partitions: {
          byUtmCampaign: {
            fields: {
              'utm.campaign': 'string'
            }
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
      options: {
        partitions: {
          bySourceMedium: {
            fields: {
              'utm.source': 'string',
              'utm.medium': 'string'
            }
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
      options: {
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
      options: {
        partitions: {
          byUtmSource: {
            fields: {
              'utm.source': 'string'
            }
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

    // Test listByPartition
    const googleUsers = await resource.listByPartition({
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(googleUsers).toHaveLength(5);
    expect(googleUsers.every(u => u.utm.source === 'google')).toBe(true);

    // Test pagination
    const page = await resource.page(0, 2, {
      partition: 'byUtmSource',
      partitionValues: { 'utm.source': 'google' }
    });
    expect(page.items).toHaveLength(2);
    expect(page.totalItems).toBe(5);
    expect(page.totalPages).toBe(3);

    // Test getFromPartition
    if (googleUsers.length > 0) {
      const userFromPartition = await resource.getFromPartition(
        googleUsers[0].id,
        'byUtmSource',
        { 'utm.source': 'google' }
      );
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
      options: {
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
    const sourceKey = resource.getPartitionKey('byUtmSource', 'test-id', testData);
    expect(sourceKey).toContain('utm.source=google');
    expect(sourceKey).toContain('partition=byUtmSource');

    // Test multi-field partition key
    const sourceMediumKey = resource.getPartitionKey('bySourceMedium', 'test-id', testData);
    expect(sourceMediumKey).toContain('utm.source=google');
    expect(sourceMediumKey).toContain('utm.medium=cpc');
    expect(sourceMediumKey).toContain('partition=bySourceMedium');

    // Test missing UTM data
    const incompleteData = {
      name: 'Test User'
      // Missing utm object
    };

    const nullKey = resource.getPartitionKey('byUtmSource', 'test-id', incompleteData);
    expect(nullKey).toBeNull();
  });
}); 