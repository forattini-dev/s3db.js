import Database from '../src/database.class.js';
import Resource from '../src/resource.class.js';
import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';

describe('Versioning and Change Detection Tests', () => {
  let mockClient;
  let database;

  beforeEach(() => {
    mockClient = {
      headObject: jest.fn().mockResolvedValue({ Metadata: {}, ContentLength: 0 }),
      putObject: jest.fn().mockResolvedValue({ ETag: 'test-etag' }),
      getObject: jest.fn().mockResolvedValue({
        Body: { transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array()) },
        ContentType: 'application/json'
      }),
      exists: jest.fn().mockResolvedValue(true),
      deleteObject: jest.fn().mockResolvedValue({ DeleteMarker: true }),
      getAllKeys: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    };

    database = new Database({
      connectionString: 'mock://test-bucket',
      client: mockClient
    });
  });

  describe('Definition Hash Generation', () => {
    test('should generate consistent hashes for identical resource definitions', () => {
      const definition1 = {
        name: 'users',
        attributes: { name: 'string', email: 'string' },
        options: { timestamps: true }
      };

      const definition2 = {
        name: 'users',
        attributes: { name: 'string', email: 'string' },
        options: { timestamps: true }
      };

      const hash1 = database.generateDefinitionHash(definition1);
      const hash2 = database.generateDefinitionHash(definition2);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    test('should generate different hashes for different resource definitions', () => {
      const definition1 = {
        name: 'users',
        attributes: { name: 'string', email: 'string' },
        options: { timestamps: true }
      };

      const definition2 = {
        name: 'users',
        attributes: { name: 'string', email: 'string', age: 'number' },
        options: { timestamps: true }
      };

      const hash1 = database.generateDefinitionHash(definition1);
      const hash2 = database.generateDefinitionHash(definition2);

      expect(hash1).not.toBe(hash2);
    });

    test('should ignore property order in hash generation', () => {
      const definition1 = {
        name: 'users',
        attributes: { name: 'string', email: 'string' },
        options: { timestamps: true }
      };

      const definition2 = {
        options: { timestamps: true },
        name: 'users',
        attributes: { email: 'string', name: 'string' }
      };

      const hash1 = database.generateDefinitionHash(definition1);
      const hash2 = database.generateDefinitionHash(definition2);

      expect(hash1).toBe(hash2);
    });

    test('should detect changes in partition rules', () => {
      const definition1 = {
        name: 'events',
        attributes: { title: 'string', date: 'string' },
        options: {
          partitionRules: {
            date: 'date'
          }
        }
      };

      const definition2 = {
        name: 'events',
        attributes: { title: 'string', date: 'string' },
        options: {
          partitionRules: {
            date: 'date',
            region: 'string'
          }
        }
      };

      const hash1 = database.generateDefinitionHash(definition1);
      const hash2 = database.generateDefinitionHash(definition2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Change Detection', () => {
    test('should detect new resources', () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        }),
        products: new Resource({
          client: mockClient,
          name: 'products',
          attributes: { title: 'string', price: 'number' }
        })
      };

      const savedMetadata = {
        resources: {
          users: {
            definitionHash: database.resources.users.getDefinitionHash()
          }
          // products is missing - should be detected as new
        }
      };

      const changes = database.detectDefinitionChanges(savedMetadata);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'new',
        resourceName: 'products',
        currentHash: database.resources.products.getDefinitionHash(),
        savedHash: null
      });
    });

    test('should detect deleted resources', () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        })
      };

      const savedMetadata = {
        resources: {
          users: {
            definitionHash: database.resources.users.getDefinitionHash()
          },
          deletedResource: {
            definitionHash: 'sha256:old-hash-value'
          }
        }
      };

      const changes = database.detectDefinitionChanges(savedMetadata);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'deleted',
        resourceName: 'deletedResource',
        currentHash: null,
        savedHash: 'sha256:old-hash-value'
      });
    });

    test('should detect changed resources', () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string', age: 'number' } // Added age field
        })
      };

      const savedMetadata = {
        resources: {
          users: {
            definitionHash: 'sha256:old-hash-before-age-field-was-added'
          }
        }
      };

      const changes = database.detectDefinitionChanges(savedMetadata);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'changed',
        resourceName: 'users',
        currentHash: database.resources.users.getDefinitionHash(),
        savedHash: 'sha256:old-hash-before-age-field-was-added'
      });
    });

    test('should detect no changes when definitions match', () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        })
      };

      const savedMetadata = {
        resources: {
          users: {
            definitionHash: database.resources.users.getDefinitionHash()
          }
        }
      };

      const changes = database.detectDefinitionChanges(savedMetadata);

      expect(changes).toHaveLength(0);
    });

    test('should handle empty saved metadata gracefully', () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        })
      };

      const changes = database.detectDefinitionChanges({});

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('new');
      expect(changes[0].resourceName).toBe('users');
    });

    test('should detect multiple types of changes simultaneously', () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string', phone: 'string' } // Modified
        }),
        newResource: new Resource({
          client: mockClient,
          name: 'newResource',
          attributes: { title: 'string' }
        })
      };

      const savedMetadata = {
        resources: {
          users: {
            definitionHash: 'sha256:old-users-hash'
          },
          deletedResource: {
            definitionHash: 'sha256:deleted-resource-hash'
          }
        }
      };

      const changes = database.detectDefinitionChanges(savedMetadata);

      expect(changes).toHaveLength(3);
      
      const changeTypes = changes.map(c => c.type);
      expect(changeTypes).toContain('changed');
      expect(changeTypes).toContain('new');
      expect(changeTypes).toContain('deleted');
    });
  });

  describe('Database Metadata Management', () => {
    test('should upload metadata file with correct structure', async () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        }),
        products: new Resource({
          client: mockClient,
          name: 'products',
          attributes: { title: 'string', price: 'number' },
          options: {
            partitionRules: {
              category: 'string'
            }
          }
        })
      };

      database.s3dbVersion = '1.2.0';

      await database.uploadMetadataFile();

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 's3db.json',
        body: JSON.stringify({
          s3dbVersion: '1.2.0',
          lastUpdated: expect.any(String),
          resources: {
            users: {
              definitionHash: database.resources.users.getDefinitionHash()
            },
            products: {
              definitionHash: database.resources.products.getDefinitionHash()
            }
          }
        }, null, 2),
        contentType: 'application/json'
      });
    });

    test('should retrieve and parse metadata file correctly', async () => {
      const mockMetadata = {
        s3dbVersion: '1.2.0',
        lastUpdated: '2025-06-26T10:00:00Z',
        resources: {
          users: {
            definitionHash: 'sha256:user-hash'
          },
          products: {
            definitionHash: 'sha256:product-hash'
          }
        }
      };

      mockClient.getObject.mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(
            new Uint8Array(Buffer.from(JSON.stringify(mockMetadata)))
          )
        }
      });

      const metadata = await database.getMetadataFile();

      expect(metadata).toEqual(mockMetadata);
      expect(mockClient.getObject).toHaveBeenCalledWith('s3db.json');
    });

    test('should handle missing metadata file gracefully', async () => {
      mockClient.getObject.mockRejectedValue({ name: 'NoSuchKey' });

      const metadata = await database.getMetadataFile();

      expect(metadata).toEqual({
        s3dbVersion: '1.0.0',
        resources: {}
      });
    });

    test('should handle corrupted metadata file gracefully', async () => {
      mockClient.getObject.mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(
            new Uint8Array(Buffer.from('invalid json'))
          )
        }
      });

      const metadata = await database.getMetadataFile();

      expect(metadata).toEqual({
        s3dbVersion: '1.0.0',
        resources: {}
      });
    });
  });

  describe('Integration with Resource Definition Hashing', () => {
    test('should maintain hash consistency between Resource and Database', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { name: 'string', email: 'string' },
        options: { timestamps: true }
      });

      const resourceHash = resource.getDefinitionHash();
      const databaseHash = database.generateDefinitionHash(resource.export());

      expect(resourceHash).toBe(databaseHash);
    });

    test('should include partition rules in hash calculation', () => {
      const resource1 = new Resource({
        client: mockClient,
        name: 'events',
        attributes: { title: 'string', date: 'string' }
      });

      const resource2 = new Resource({
        client: mockClient,
        name: 'events',
        attributes: { title: 'string', date: 'string' },
        options: {
          partitionRules: {
            date: 'date'
          }
        }
      });

      const hash1 = resource1.getDefinitionHash();
      const hash2 = resource2.getDefinitionHash();

      expect(hash1).not.toBe(hash2);
    });

    test('should detect changes in validator rules', () => {
      const resource1 = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { 
          name: 'string',
          email: 'string'
        },
        options: {
          rules: {
            name: 'string|min:3|max:50'
          }
        }
      });

      const resource2 = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { 
          name: 'string',
          email: 'string'
        },
        options: {
          rules: {
            name: 'string|min:2|max:100' // Changed validation rules
          }
        }
      });

      const hash1 = resource1.getDefinitionHash();
      const hash2 = resource2.getDefinitionHash();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Event Emission and Database Connection', () => {
    test('should emit changes event when differences are detected', async () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string', age: 'number' }
        })
      };

      const mockMetadata = {
        s3dbVersion: '1.1.0',
        resources: {
          users: {
            definitionHash: 'sha256:old-hash'
          },
          deletedResource: {
            definitionHash: 'sha256:deleted-hash'
          }
        }
      };

      mockClient.getObject.mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(
            new Uint8Array(Buffer.from(JSON.stringify(mockMetadata)))
          )
        }
      });

      const emitSpy = jest.spyOn(database, 'emit');

      await database.detectAndEmitChanges();

      expect(emitSpy).toHaveBeenCalledWith('resourceDefinitionsChanged', {
        changes: expect.arrayContaining([
          expect.objectContaining({ type: 'changed', resourceName: 'users' }),
          expect.objectContaining({ type: 'deleted', resourceName: 'deletedResource' })
        ]),
        metadata: mockMetadata
      });
    });

    test('should not emit changes event when no differences are detected', async () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        })
      };

      const mockMetadata = {
        s3dbVersion: '1.2.0',
        resources: {
          users: {
            definitionHash: database.resources.users.getDefinitionHash()
          }
        }
      };

      mockClient.getObject.mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(
            new Uint8Array(Buffer.from(JSON.stringify(mockMetadata)))
          )
        }
      });

      const emitSpy = jest.spyOn(database, 'emit');

      await database.detectAndEmitChanges();

      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Backward Compatibility', () => {
    test('should handle metadata without definition hashes', async () => {
      database.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        })
      };

      const oldMetadata = {
        s3dbVersion: '1.0.0',
        resources: {
          users: {} // No definitionHash
        }
      };

      const changes = database.detectDefinitionChanges(oldMetadata);

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual({
        type: 'changed',
        resourceName: 'users',
        currentHash: database.resources.users.getDefinitionHash(),
        savedHash: null
      });
    });

    test('should migrate from old metadata format', async () => {
      const oldMetadata = {
        version: '1.0.0', // Old format
        definitions: { // Old format
          users: {
            name: 'users',
            attributes: { name: 'string' }
          }
        }
      };

      mockClient.getObject.mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(
            new Uint8Array(Buffer.from(JSON.stringify(oldMetadata)))
          )
        }
      });

      const metadata = await database.getMetadataFile();

      // Should return default structure for unrecognized format
      expect(metadata).toEqual({
        s3dbVersion: '1.0.0',
        resources: {}
      });
    });
  });
});