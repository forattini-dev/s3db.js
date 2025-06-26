import Resource from '../src/resource.class.js';
import Client from '../src/client.class.js';

// Mock client for testing
const mockClient = {
  config: {
    bucket: 'test-bucket',
    keyPrefix: ''
  },
  headObject: () => Promise.resolve({
    Metadata: { name: 'test', email: 'test@example.com' },
    ContentLength: 1024,
    LastModified: new Date(),
    ContentType: 'application/json',
    VersionId: 'v123'
  }),
  putObject: () => Promise.resolve({ ETag: 'test-etag' }),
  getObject: () => Promise.resolve({
    Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(Buffer.from('test content'))) },
    ContentType: 'text/plain'
  }),
  exists: () => Promise.resolve(true),
  deleteObject: () => Promise.resolve({ DeleteMarker: true }),
  getAllKeys: () => Promise.resolve([]),
  count: () => Promise.resolve(0),
  deleteAll: () => Promise.resolve(42) // Mock that returns number of deleted objects
};

describe('Partition Validation and Delete Operations', () => {
  describe('Partition Validation', () => {
    test('should pass validation when all partition fields exist in attributes', () => {
      expect(() => {
        new Resource({
          client: mockClient,
          name: 'users',
          attributes: {
            id: 'string|required',
            name: 'string|required',
            region: 'string|required',
            department: 'string|required'
          },
          options: {
            partitions: {
              byRegionDept: {
                fields: {
                  region: 'string|maxlength:2',
                  department: 'string'
                }
              }
            }
          }
        });
      }).not.toThrow();
    });

    test('should throw error when partition field does not exist in attributes', () => {
      expect(() => {
        new Resource({
          client: mockClient,
          name: 'users',
          attributes: {
            id: 'string|required',
            name: 'string|required',
            region: 'string|required'
            // department field is missing
          },
          options: {
            partitions: {
              byRegionDept: {
                fields: {
                  region: 'string|maxlength:2',
                  department: 'string'  // This field doesn't exist in attributes
                }
              }
            }
          }
        });
      }).toThrow(
        `Partition 'byRegionDept' uses field 'department' which does not exist in resource version '1'. ` +
        `Available fields: id, name, region. ` +
        `This version of resource does not have support for this partition.`
      );
    });

    test('should handle timestamp partitions correctly', () => {
      expect(() => {
        new Resource({
          client: mockClient,
          name: 'events',
          attributes: {
            id: 'string|required',
            title: 'string|required'
          },
          options: {
            timestamps: true, // This adds createdAt and updatedAt automatically
            partitions: {
              byDate: {
                fields: {
                  createdAt: 'date|maxlength:10'
                }
              }
            }
          }
        });
      }).not.toThrow();
    });

    test('should throw detailed error for multiple missing fields', () => {
      expect(() => {
        new Resource({
          client: mockClient,
          name: 'orders',
          attributes: {
            id: 'string|required',
            amount: 'number|required'
          },
          options: {
            partitions: {
              byCustomerRegion: {
                fields: {
                  customerId: 'string',    // Missing field
                  region: 'string'         // Missing field
                }
              }
            }
          }
        });
      }).toThrow(/does not exist in resource version/);
    });

    test('should pass when no partitions are defined', () => {
      expect(() => {
        new Resource({
          client: mockClient,
          name: 'simple',
          attributes: {
            id: 'string|required',
            name: 'string|required'
          },
          options: {
            partitions: {} // No partitions
          }
        });
      }).not.toThrow();
    });
  });

  describe('Client deleteAll Method', () => {
    test('should have deleteAll method', () => {
      const client = new Client({
        connectionString: 's3://test:test@localhost:4566/test-bucket'
      });
      
      expect(typeof client.deleteAll).toBe('function');
    });

    test('should call deleteAll and return deleted count', async () => {
      const client = mockClient;
      const deletedCount = await client.deleteAll({ prefix: 'test-prefix/' });
      
      expect(deletedCount).toBe(42);
    });
  });

  describe('Resource deleteAll Method', () => {
    test('should throw error when paranoid mode is enabled (default)', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        }
        // paranoid defaults to true
      });

      await expect(resource.deleteAll()).rejects.toThrow(
        'deleteAll() is a dangerous operation and requires paranoid: false option. Current paranoid setting: true'
      );
    });

    test('should work when paranoid mode is disabled', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'users',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        },
        options: {
          paranoid: false
        }
      });

      const result = await resource.deleteAll();
      
      expect(result).toEqual({
        deletedCount: 42,
        version: '1'
      });
    });

    test('should emit deleteAll event', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'products',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        },
        options: {
          paranoid: false
        }
      });

      let emittedEvent = null;
      let emittedData = null;
      resource.on('deleteAll', (data) => {
        emittedEvent = 'deleteAll';
        emittedData = data;
      });
      
      await resource.deleteAll();
      
      expect(emittedEvent).toBe('deleteAll');
      expect(emittedData).toEqual({
        version: '1',
        prefix: 'resource=products/v=1',
        deletedCount: 42
      });
    });
  });

  describe('Resource deleteAllData Method', () => {
    test('should throw error when paranoid mode is enabled', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'orders',
        attributes: {
          id: 'string|required',
          amount: 'number|required'
        }
        // paranoid defaults to true
      });

      await expect(resource.deleteAllData()).rejects.toThrow(
        'deleteAllData() is a dangerous operation and requires paranoid: false option. Current paranoid setting: true'
      );
    });

    test('should work when paranoid mode is disabled', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'analytics',
        attributes: {
          id: 'string|required',
          event: 'string|required'
        },
        options: {
          paranoid: false
        }
      });

      const result = await resource.deleteAllData();
      
      expect(result).toEqual({
        deletedCount: 42,
        resource: 'analytics'
      });
    });

    test('should emit deleteAllData event', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'logs',
        attributes: {
          id: 'string|required',
          message: 'string|required'
        },
        options: {
          paranoid: false
        }
      });

      let emittedEvent = null;
      let emittedData = null;
      resource.on('deleteAllData', (data) => {
        emittedEvent = 'deleteAllData';
        emittedData = data;
      });
      
      await resource.deleteAllData();
      
      expect(emittedEvent).toBe('deleteAllData');
      expect(emittedData).toEqual({
        resource: 'logs',
        prefix: 'resource=logs',
        deletedCount: 42
      });
    });
  });

  describe('Security Features', () => {
    test('should prevent accidental data loss with paranoid mode', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'critical-data',
        attributes: {
          id: 'string|required',
          value: 'string|required'
        }
        // paranoid: true by default
      });

      // Both methods should be blocked
      await expect(resource.deleteAll()).rejects.toThrow(/paranoid.*false/);
      await expect(resource.deleteAllData()).rejects.toThrow(/paranoid.*false/);
    });

    test('should allow dangerous operations when explicitly disabled', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'temp-data',
        attributes: {
          id: 'string|required',
          value: 'string|required'
        },
        options: {
          paranoid: false  // Explicitly disabled
        }
      });

      // Both methods should work
      const deleteAllResult = await resource.deleteAll();
      const deleteAllDataResult = await resource.deleteAllData();

      expect(deleteAllResult.deletedCount).toBe(42);
      expect(deleteAllDataResult.deletedCount).toBe(42);
    });
  });

  describe('Integration with updateAttributes', () => {
    test('should validate partitions after updating attributes', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'dynamic',
        attributes: {
          id: 'string|required',
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

      // Remove the region field - should cause validation to fail
      expect(() => {
        resource.updateAttributes({
          id: 'string|required',
          name: 'string|required'
          // region removed
        });
      }).toThrow(/does not exist in resource version/);
    });
  });
});