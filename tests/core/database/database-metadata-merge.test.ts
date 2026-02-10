import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockClient = {
  getObject: vi.fn(),
  putObject: vi.fn(),
  config: { keyPrefix: '' },
  getAllKeys: vi.fn().mockResolvedValue([]),
  headObject: vi.fn(),
  copyObject: vi.fn(),
  deleteObject: vi.fn(),
  listObjects: vi.fn().mockResolvedValue({ Contents: [] }),
};

const mockDatabase = {
  client: mockClient,
  logger: mockLogger,
  resources: {},
  savedMetadata: null,
  version: '1',
  s3dbVersion: '19.1.5',
  emit: vi.fn(),
  deferMetadataWrites: false,
  metadataWriteDelay: 1000,
};

import { DatabaseMetadata } from '../../../src/database/database-metadata.class.js';
import type { SavedMetadata } from '../../../src/database/types.js';
import type { SchemaRegistry } from '../../../src/schema.class.js';

describe('DatabaseMetadata Merge Logic', () => {
  let metadata: DatabaseMetadata;

  beforeEach(() => {
    vi.clearAllMocks();
    metadata = new DatabaseMetadata(mockDatabase as any);
  });

  describe('_mergeSchemaRegistry', () => {
    it('should return undefined when both registries are undefined', () => {
      const result = (metadata as any)._mergeSchemaRegistry(undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should return local when fresh is undefined', () => {
      const local: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 1, c: 2 },
        burned: []
      };

      const result = (metadata as any)._mergeSchemaRegistry(undefined, local);
      expect(result).toEqual(local);
    });

    it('should return fresh when local is undefined', () => {
      const fresh: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 1, c: 2 },
        burned: []
      };

      const result = (metadata as any)._mergeSchemaRegistry(fresh, undefined);
      expect(result).toEqual(fresh);
    });

    it('should use max nextIndex', () => {
      const fresh: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0, b: 1 },
        burned: []
      };

      const local: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 1 },
        burned: []
      };

      const result = (metadata as any)._mergeSchemaRegistry(fresh, local);
      expect(result.nextIndex).toBe(5);
    });

    it('should use max nextIndex from local when higher', () => {
      const fresh: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 1 },
        burned: []
      };

      const local: SchemaRegistry = {
        nextIndex: 7,
        mapping: { a: 0, b: 1, c: 2 },
        burned: []
      };

      const result = (metadata as any)._mergeSchemaRegistry(fresh, local);
      expect(result.nextIndex).toBe(7);
    });

    it('should union mappings with local taking precedence for new keys', () => {
      const fresh: SchemaRegistry = {
        nextIndex: 3,
        mapping: { a: 0, b: 1 },
        burned: []
      };

      const local: SchemaRegistry = {
        nextIndex: 4,
        mapping: { a: 0, c: 2, d: 3 },
        burned: []
      };

      const result = (metadata as any)._mergeSchemaRegistry(fresh, local);

      expect(result.mapping).toEqual({
        a: 0,
        b: 1,
        c: 2,
        d: 3
      });
    });

    it('should use max index when same attribute has different indices', () => {
      const fresh: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0, b: 1 },
        burned: []
      };

      const local: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0, b: 3 },
        burned: []
      };

      const result = (metadata as any)._mergeSchemaRegistry(fresh, local);
      expect(result.mapping.b).toBe(3);
    });

    it('should union burned lists without duplicates', () => {
      const fresh: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0 },
        burned: [
          { index: 1, attribute: 'old1', burnedAt: '2026-01-01', reason: 'removed' }
        ]
      };

      const local: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0 },
        burned: [
          { index: 2, attribute: 'old2', burnedAt: '2026-01-02', reason: 'removed' }
        ]
      };

      const result = (metadata as any)._mergeSchemaRegistry(fresh, local);

      expect(result.burned).toHaveLength(2);
      expect(result.burned.map((b: any) => b.index).sort()).toEqual([1, 2]);
    });

    it('should not duplicate burned entry when same index exists', () => {
      const fresh: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0 },
        burned: [
          { index: 1, attribute: 'old1', burnedAt: '2026-01-01', reason: 'removed' }
        ]
      };

      const local: SchemaRegistry = {
        nextIndex: 5,
        mapping: { a: 0 },
        burned: [
          { index: 1, attribute: 'old1', burnedAt: '2026-01-02', reason: 'removed' }
        ]
      };

      const result = (metadata as any)._mergeSchemaRegistry(fresh, local);

      expect(result.burned).toHaveLength(1);
      expect(result.burned[0].burnedAt).toBe('2026-01-01');
    });
  });

  describe('_mergePluginSchemaRegistry', () => {
    it('should return undefined when both are undefined', () => {
      const result = (metadata as any)._mergePluginSchemaRegistry(undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should pass through string-based plugin registries', () => {
      const local = {
        audit: {
          mapping: { _createdAt: 'pau0', _updatedAt: 'pau1' },
          burned: []
        }
      };

      const result = (metadata as any)._mergePluginSchemaRegistry(undefined, local);

      expect(result.audit.mapping._createdAt).toBe('pau0');
      expect(result.audit.mapping._updatedAt).toBe('pau1');
    });

    it('should return local converted when fresh is undefined', () => {
      const local = {
        audit: { mapping: { _createdAt: 'pauA', _updatedAt: 'pauB' }, burned: [] }
      };

      const result = (metadata as any)._mergePluginSchemaRegistry(undefined, local);
      expect(result.audit.mapping).toEqual(local.audit.mapping);
      expect(result.audit.burned).toEqual([]);
    });

    it('should return fresh converted when local is undefined', () => {
      const fresh = {
        audit: { mapping: { _createdAt: 'pauA', _updatedAt: 'pauB' }, burned: [] }
      };

      const result = (metadata as any)._mergePluginSchemaRegistry(fresh, undefined);
      expect(result.audit.mapping).toEqual(fresh.audit.mapping);
      expect(result.audit.burned).toEqual([]);
    });

    it('should merge registries for each plugin', () => {
      const fresh = {
        audit: { mapping: { _createdAt: 'pauA', _updatedAt: 'pauB' }, burned: [] },
        ttl: { mapping: { _expiresAt: 'pttA' }, burned: [] }
      };

      const local = {
        audit: { mapping: { _createdAt: 'pauA', _updatedAt: 'pauB', _deletedAt: 'pauC' }, burned: [] },
        cache: { mapping: { _cachedAt: 'pcaA' }, burned: [] }
      };

      const result = (metadata as any)._mergePluginSchemaRegistry(fresh, local);

      expect(result.audit.mapping).toEqual({
        _createdAt: 'pauA',
        _updatedAt: 'pauB',
        _deletedAt: 'pauC'
      });
      expect(result.ttl.mapping).toEqual(fresh.ttl.mapping);
      expect(result.cache.mapping).toEqual(local.cache.mapping);
    });
  });

  describe('_mergeMetadata', () => {
    it('should merge metadata and preserve fresh resources', () => {
      const fresh: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.4',
        lastUpdated: '2026-01-01T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 2, mapping: { name: 0, email: 1 }, burned: [] }
          }
        }
      };

      const local: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.5',
        lastUpdated: '2026-01-02T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 3, mapping: { name: 0, email: 1, age: 2 }, burned: [] }
          }
        }
      };

      const result = (metadata as any)._mergeMetadata(fresh, local);

      expect(result.s3dbVersion).toBe('19.1.5');
      expect(result.lastUpdated).toBe('2026-01-02T00:00:00Z');
      expect(result.resources.users.schemaRegistry.nextIndex).toBe(3);
      expect(result.resources.users.schemaRegistry.mapping.age).toBe(2);
    });

    it('should add new resources from local', () => {
      const fresh: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.4',
        lastUpdated: '2026-01-01T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 2, mapping: { name: 0, email: 1 }, burned: [] }
          }
        }
      };

      const local: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.5',
        lastUpdated: '2026-01-02T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 2, mapping: { name: 0, email: 1 }, burned: [] }
          },
          posts: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 2, mapping: { title: 0, body: 1 }, burned: [] }
          }
        }
      };

      const result = (metadata as any)._mergeMetadata(fresh, local);

      expect(result.resources.users).toBeDefined();
      expect(result.resources.posts).toBeDefined();
      expect(result.resources.posts.schemaRegistry.mapping.title).toBe(0);
    });

    it('should preserve fresh resources not in local', () => {
      const fresh: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.4',
        lastUpdated: '2026-01-01T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 2, mapping: { name: 0, email: 1 }, burned: [] }
          },
          oldResource: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 1, mapping: { field: 0 }, burned: [] }
          }
        }
      };

      const local: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.5',
        lastUpdated: '2026-01-02T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: { nextIndex: 2, mapping: { name: 0, email: 1 }, burned: [] }
          }
        }
      };

      const result = (metadata as any)._mergeMetadata(fresh, local);

      expect(result.resources.users).toBeDefined();
      expect(result.resources.oldResource).toBeDefined();
    });

    it('should handle concurrent schema changes from both pods', () => {
      const fresh: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.4',
        lastUpdated: '2026-01-01T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: {
              nextIndex: 4,
              mapping: { name: 0, email: 1, freshField: 2, anotherFresh: 3 },
              burned: []
            }
          }
        }
      };

      const local: SavedMetadata = {
        version: '1',
        s3dbVersion: '19.1.5',
        lastUpdated: '2026-01-02T00:00:00Z',
        resources: {
          users: {
            currentVersion: 'v1',
            partitions: {},
            versions: {},
            schemaRegistry: {
              nextIndex: 5,
              mapping: { name: 0, email: 1, localField: 2, localField2: 3, localField3: 4 },
              burned: []
            }
          }
        }
      };

      const result = (metadata as any)._mergeMetadata(fresh, local);

      expect(result.resources.users.schemaRegistry.nextIndex).toBe(5);
      expect(result.resources.users.schemaRegistry.mapping).toEqual({
        name: 0,
        email: 1,
        freshField: 2,
        anotherFresh: 3,
        localField: 2,
        localField2: 3,
        localField3: 4
      });
    });
  });
});
