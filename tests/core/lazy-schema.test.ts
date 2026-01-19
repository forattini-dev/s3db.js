import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../src/database.class.js';

describe('Lazy Schema (v19.3+)', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database({
      connectionString: 'memory://test/lazy-schema',
      logLevel: 'silent'
    });
    await db.connect();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  describe('Resource Creation', () => {
    it('should defer schema compilation when lazySchema is true', async () => {
      const resource = await db.createResource({
        name: 'lazy_users',
        attributes: { name: 'string', email: 'string|required' },
        lazySchema: true
      });

      expect(resource.isSchemaCompiled()).toBe(false);
      expect(resource._pendingSchemaConfig).not.toBeNull();
    });

    it('should compile schema immediately when lazySchema is false (default)', async () => {
      const resource = await db.createResource({
        name: 'eager_users',
        attributes: { name: 'string', email: 'string|required' }
      });

      expect(resource.isSchemaCompiled()).toBe(true);
      expect(resource._pendingSchemaConfig).toBeNull();
    });
  });

  describe('Schema Compilation on First Use', () => {
    it('should compile schema on first insert', async () => {
      const resource = await db.createResource({
        name: 'lazy_insert',
        attributes: { name: 'string' },
        lazySchema: true
      });

      expect(resource.isSchemaCompiled()).toBe(false);

      await resource.insert({ name: 'John' });

      expect(resource.isSchemaCompiled()).toBe(true);
    });

    it('should compile schema on first get', async () => {
      const eagerResource = await db.createResource({
        name: 'eager_for_get',
        attributes: { name: 'string' }
      });
      const doc = await eagerResource.insert({ name: 'Jane' });

      const lazyResource = await db.createResource({
        name: 'eager_for_get',
        attributes: { name: 'string' },
        lazySchema: true
      });

      expect(lazyResource.isSchemaCompiled()).toBe(false);

      await lazyResource.get(doc.id);

      expect(lazyResource.isSchemaCompiled()).toBe(true);
    });

    it('should compile schema on first query', async () => {
      const resource = await db.createResource({
        name: 'lazy_query',
        attributes: { name: 'string', status: 'string' },
        lazySchema: true
      });

      expect(resource.isSchemaCompiled()).toBe(false);

      await resource.query({ status: 'active' });

      expect(resource.isSchemaCompiled()).toBe(true);
    });

    it('should compile schema on first list', async () => {
      const resource = await db.createResource({
        name: 'lazy_list',
        attributes: { name: 'string' },
        lazySchema: true
      });

      expect(resource.isSchemaCompiled()).toBe(false);

      await resource.list();

      expect(resource.isSchemaCompiled()).toBe(true);
    });

    it('should compile schema on first validate', async () => {
      const resource = await db.createResource({
        name: 'lazy_validate',
        attributes: { name: 'string|required' },
        lazySchema: true
      });

      expect(resource.isSchemaCompiled()).toBe(false);

      await resource.validate({ name: 'Test' });

      expect(resource.isSchemaCompiled()).toBe(true);
    });
  });

  describe('prewarmSchema()', () => {
    it('should compile schema without performing CRUD', async () => {
      const resource = await db.createResource({
        name: 'lazy_prewarm',
        attributes: { name: 'string', age: 'number' },
        lazySchema: true
      });

      expect(resource.isSchemaCompiled()).toBe(false);

      resource.prewarmSchema();

      expect(resource.isSchemaCompiled()).toBe(true);
    });

    it('should be idempotent', async () => {
      const resource = await db.createResource({
        name: 'lazy_prewarm_idempotent',
        attributes: { name: 'string' },
        lazySchema: true
      });

      resource.prewarmSchema();
      resource.prewarmSchema();
      resource.prewarmSchema();

      expect(resource.isSchemaCompiled()).toBe(true);
    });
  });

  describe('Database.prewarmResources()', () => {
    it('should prewarm all lazy resources', async () => {
      await db.createResource({
        name: 'lazy1',
        attributes: { name: 'string' },
        lazySchema: true
      });

      await db.createResource({
        name: 'lazy2',
        attributes: { email: 'string' },
        lazySchema: true
      });

      await db.createResource({
        name: 'eager1',
        attributes: { id: 'string' }
      });

      const result = db.prewarmResources();

      expect(result.warmed).toContain('lazy1');
      expect(result.warmed).toContain('lazy2');
      expect(result.alreadyCompiled).toContain('eager1');
    });

    it('should prewarm specific resources by name', async () => {
      await db.createResource({
        name: 'lazy_specific1',
        attributes: { name: 'string' },
        lazySchema: true
      });

      await db.createResource({
        name: 'lazy_specific2',
        attributes: { email: 'string' },
        lazySchema: true
      });

      const result = db.prewarmResources(['lazy_specific1']);

      expect(result.warmed).toContain('lazy_specific1');
      expect(result.warmed).not.toContain('lazy_specific2');
    });
  });

  describe('Validation After Lazy Compilation', () => {
    it('should validate correctly after lazy compilation', async () => {
      const resource = await db.createResource({
        name: 'lazy_validation_test',
        attributes: {
          name: 'string|required',
          email: 'email|required',
          age: 'number|min:0|max:150'
        },
        lazySchema: true
      });

      const doc = await resource.insert({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      expect(doc.name).toBe('John Doe');
      expect(doc.email).toBe('john@example.com');
      expect(doc.age).toBe(30);
    });

    it('should reject invalid data after lazy compilation', async () => {
      const resource = await db.createResource({
        name: 'lazy_validation_reject',
        attributes: {
          email: 'email|required'
        },
        lazySchema: true
      });

      await expect(resource.insert({ email: 'not-an-email' }))
        .rejects.toThrow();
    });
  });
});
