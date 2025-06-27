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
}); 