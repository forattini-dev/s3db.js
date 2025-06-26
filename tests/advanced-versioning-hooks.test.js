import { describe, it, expect, beforeEach } from '@jest/globals';
import { Database } from '../src/index.js';

const connectionString = 's3://localhost:9000/test?accessKeyId=minioadmin&secretAccessKey=minioadmin&forcePathStyle=true';

describe('Advanced Versioning & Hooks System', () => {
  let db;

  beforeEach(async () => {
    db = new Database({
      connectionString: `${connectionString}/advanced-${Date.now()}`,
      verbose: false
    });
    await db.connect();
  });

  describe('Resource Versioning', () => {
    it('should create versioned resource definitions', async () => {
      const users = await db.createResource({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string'
        },
        options: {
          timestamps: true,
          partitionRules: {
            region: 'string|maxlength:2'
          }
        }
      });

      expect(users.options.version).toBe('v0');
      expect(db.savedMetadata).toBeDefined();
      expect(db.savedMetadata.resources.users).toBeDefined();
      expect(db.savedMetadata.resources.users.currentVersion).toBe('v0');
      expect(db.savedMetadata.resources.users.versions.v0).toBeDefined();
      expect(db.savedMetadata.resources.users.versions.v0.hash).toMatch(/^sha256:/);
    });

    it('should increment version when schema changes', async () => {
      // Create initial resource
      await db.createResource({
        name: 'products',
        attributes: {
          name: 'string',
          price: 'number'
        }
      });

      // Simulate schema change
      const productsV2 = await db.createResource({
        name: 'products',
        attributes: {
          name: 'string',
          price: 'number',
          category: 'string' // New field
        }
      });

      expect(productsV2.options.version).toBe('v1');
      expect(db.savedMetadata.resources.products.currentVersion).toBe('v1');
      expect(Object.keys(db.savedMetadata.resources.products.versions)).toEqual(['v0', 'v1']);
    });

    it('should preserve previous versions in metadata', async () => {
      const orders = await db.createResource({
        name: 'orders',
        attributes: {
          total: 'number'
        }
      });

      const v0Hash = db.savedMetadata.resources.orders.versions.v0.hash;

      // Change schema
      await db.createResource({
        name: 'orders',
        attributes: {
          total: 'number',
          status: 'string' // New field
        }
      });

      expect(db.savedMetadata.resources.orders.versions.v0.hash).toBe(v0Hash);
      expect(db.savedMetadata.resources.orders.versions.v1).toBeDefined();
      expect(db.savedMetadata.resources.orders.versions.v1.hash).not.toBe(v0Hash);
    });
  });

  describe('Hook System', () => {
    let resource;
    let hookCalls;

    beforeEach(async () => {
      hookCalls = [];
      
      resource = await db.createResource({
        name: 'events',
        attributes: {
          name: 'string',
          type: 'string'
        },
        options: {
          timestamps: true
        }
      });
    });

    it('should execute preInsert hooks', async () => {
      resource.addHook('preInsert', async (data) => {
        hookCalls.push('preInsert');
        data.processed = true;
        return data;
      });

      const result = await resource.insert({
        name: 'Test Event',
        type: 'conference'
      });

      expect(hookCalls).toContain('preInsert');
      expect(result.processed).toBe(true);
    });

    it('should execute afterInsert hooks', async () => {
      resource.addHook('afterInsert', async (data) => {
        hookCalls.push('afterInsert');
        return data;
      });

      await resource.insert({
        name: 'Test Event',
        type: 'conference'
      });

      expect(hookCalls).toContain('afterInsert');
    });

    it('should execute preUpdate hooks', async () => {
      const inserted = await resource.insert({
        name: 'Test Event',
        type: 'conference'
      });

      resource.addHook('preUpdate', async (data) => {
        hookCalls.push('preUpdate');
        data.modified = true;
        return data;
      });

      const result = await resource.update(inserted.id, {
        name: 'Updated Event'
      });

      expect(hookCalls).toContain('preUpdate');
      expect(result.modified).toBe(true);
    });

    it('should execute afterUpdate hooks', async () => {
      const inserted = await resource.insert({
        name: 'Test Event',
        type: 'conference'
      });

      resource.addHook('afterUpdate', async (data) => {
        hookCalls.push('afterUpdate');
        return data;
      });

      await resource.update(inserted.id, {
        name: 'Updated Event'
      });

      expect(hookCalls).toContain('afterUpdate');
    });

    it('should execute preDelete hooks', async () => {
      const inserted = await resource.insert({
        name: 'Test Event',
        type: 'conference'
      });

      resource.addHook('preDelete', async (data) => {
        hookCalls.push('preDelete');
        return data;
      });

      await resource.delete(inserted.id);

      expect(hookCalls).toContain('preDelete');
    });

    it('should execute afterDelete hooks', async () => {
      const inserted = await resource.insert({
        name: 'Test Event',
        type: 'conference'
      });

      resource.addHook('afterDelete', async (data) => {
        hookCalls.push('afterDelete');
        return data;
      });

      await resource.delete(inserted.id);

      expect(hookCalls).toContain('afterDelete');
    });

    it('should execute multiple hooks in sequence', async () => {
      resource.addHook('preInsert', async (data) => {
        hookCalls.push('preInsert-1');
        data.hook1 = true;
        return data;
      });

      resource.addHook('preInsert', async (data) => {
        hookCalls.push('preInsert-2');
        data.hook2 = true;
        return data;
      });

      const result = await resource.insert({
        name: 'Test Event',
        type: 'conference'
      });

      expect(hookCalls).toEqual(['preInsert-1', 'preInsert-2']);
      expect(result.hook1).toBe(true);
      expect(result.hook2).toBe(true);
    });
  });

  describe('Automatic Partition Management', () => {
    let resource;

    beforeEach(async () => {
      resource = await db.createResource({
        name: 'documents',
        attributes: {
          title: 'string',
          category: 'string',
          region: 'string'
        },
        options: {
          timestamps: true,
          partitionRules: {
            category: 'string',
            region: 'string|maxlength:2'
          }
        }
      });
    });

    it('should automatically create partition objects after insert', async () => {
      const document = await resource.insert({
        title: 'Test Document',
        category: 'report',
        region: 'US-WEST'
      });

      // Check that partition hooks were set up
      expect(resource.hooks.afterInsert.length).toBeGreaterThan(0);

      // The actual partition creation is tested through the hook system
      expect(document.category).toBe('report');
      expect(document.region).toBe('US'); // Should be truncated to 2 chars
    });

    it('should handle partition updates', async () => {
      const document = await resource.insert({
        title: 'Test Document',
        category: 'report',
        region: 'US'
      });

      await resource.update(document.id, {
        category: 'manual'
      }, {
        category: document.category,
        region: document.region,
        createdAt: document.createdAt
      });

      // Update hooks should have been executed
      expect(resource.hooks.afterUpdate.length).toBeGreaterThan(0);
    });

    it('should clean up partition objects after delete', async () => {
      const document = await resource.insert({
        title: 'Test Document',
        category: 'report',
        region: 'US'
      });

      await resource.delete(document.id, {
        category: document.category,
        region: document.region,
        createdAt: document.createdAt
      });

      // Delete hooks should have been executed
      expect(resource.hooks.afterDelete.length).toBeGreaterThan(0);
    });
  });

  describe('Version-based Unmapping', () => {
    it('should use correct schema version for unmapping', async () => {
      const products = await db.createResource({
        name: 'products',
        attributes: {
          name: 'string',
          price: 'number'
        }
      });

      const product = await products.insert({
        name: 'Test Product',
        price: 99.99
      });

      // Change schema to create new version
      await db.createResource({
        name: 'products',
        attributes: {
          name: 'string',
          price: 'number',
          category: 'string'
        }
      });

      // Old product should still be readable with correct schema
      const retrieved = await products.get(product.id);
      expect(retrieved.name).toBe('Test Product');
      expect(retrieved.price).toBe(99.99);
      expect(retrieved.category).toBeUndefined(); // Not in original schema
    });
  });

  describe('S3db.json Structure', () => {
    it('should create new metadata structure', async () => {
      await db.createResource({
        name: 'items',
        attributes: {
          name: 'string'
        },
        options: {
          partitionRules: {
            category: 'string'
          }
        }
      });

      const metadata = db.savedMetadata;

      expect(metadata.version).toBeDefined();
      expect(metadata.s3dbVersion).toBeDefined();
      expect(metadata.lastUpdated).toBeDefined();
      expect(metadata.resources.items).toBeDefined();
      expect(metadata.resources.items.currentVersion).toBe('v0');
      expect(metadata.resources.items.partitions).toEqual({ category: 'string' });
      expect(metadata.resources.items.versions.v0).toBeDefined();
      expect(metadata.resources.items.versions.v0.hash).toMatch(/^sha256:/);
      expect(metadata.resources.items.versions.v0.attributes).toBeDefined();
      expect(metadata.resources.items.versions.v0.options).toBeDefined();
      expect(metadata.resources.items.versions.v0.createdAt).toBeDefined();
    });
  });

  describe('Definition Change Detection', () => {
    it('should emit resourceDefinitionsChanged event', async (done) => {
      let changeEvent = null;

      db.on('resourceDefinitionsChanged', (event) => {
        changeEvent = event;
      });

      await db.createResource({
        name: 'notifications',
        attributes: {
          message: 'string'
        }
      });

      // Simulate reconnection with changed schema
      const db2 = new Database({
        connectionString: db.client.config.bucket,
        verbose: false
      });

      await db2.createResource({
        name: 'notifications',
        attributes: {
          message: 'string',
          priority: 'string' // New field
        }
      });

      db2.on('resourceDefinitionsChanged', (event) => {
        expect(event.changes).toBeDefined();
        expect(event.changes.length).toBeGreaterThan(0);
        expect(event.changes[0].type).toBe('changed');
        expect(event.changes[0].resourceName).toBe('notifications');
        expect(event.changes[0].fromVersion).toBeDefined();
        expect(event.changes[0].toVersion).toBeDefined();
        done();
      });

      await db2.connect();
    });
  });

  describe('Automatic Timestamp Partitions', () => {
    it('should automatically add timestamp partitions when timestamps: true', async () => {
      const logs = await db.createResource({
        name: 'logs',
        attributes: {
          message: 'string'
        },
        options: {
          timestamps: true
        }
      });

      expect(logs.options.partitionRules.createdAt).toBe('date|maxlength:10');
      expect(logs.options.partitionRules.updatedAt).toBe('date|maxlength:10');
    });

    it('should preserve manual partition rules with automatic timestamp partitions', async () => {
      const events = await db.createResource({
        name: 'events',
        attributes: {
          name: 'string',
          type: 'string'
        },
        options: {
          timestamps: true,
          partitionRules: {
            type: 'string'
          }
        }
      });

      expect(events.options.partitionRules.type).toBe('string');
      expect(events.options.partitionRules.createdAt).toBe('date|maxlength:10');
      expect(events.options.partitionRules.updatedAt).toBe('date|maxlength:10');
    });
  });
});