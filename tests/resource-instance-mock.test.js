import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Database } from '../src/index.js';

// Mock do S3 Client
const mockClient = {
  bucket: 'test-bucket',
  keyPrefix: '',
  config: { bucket: 'test-bucket' },
  exists: jest.fn(),
  getObject: jest.fn(),
  putObject: jest.fn(),
};

describe('Resource Instance Management (Mocked)', () => {
  let db;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock responses
    mockClient.exists.mockResolvedValue(false); // No s3db.json exists
    mockClient.putObject.mockResolvedValue({});

    db = new Database({
      connectionString: 'http://test',
      verbose: false,
      client: mockClient
    });
    
    await db.connect();
  });

  describe('Single Instance Policy', () => {
    it('should maintain single resource instance per name', async () => {
      // Create initial resource
      const users1 = await db.createResource({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string'
        }
      });

      // Get reference using db.resource()
      const usersRef1 = db.resource('users');
      
      // Should be exactly the same instance
      expect(users1).toBe(usersRef1);
      console.log('✅ Initial: users1 === usersRef1');

      // Create resource again with different schema
      const users2 = await db.createResource({
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string',
          age: 'number' // New field
        }
      });

      // Get reference again
      const usersRef2 = db.resource('users');

      // CRITICAL: Should be the SAME instance (updated, not replaced)
      expect(users1).toBe(users2);
      expect(users2).toBe(usersRef2);
      expect(users1).toBe(usersRef2);
      
      console.log('✅ After update: users1 === users2 === usersRef2');
      console.log('✅ Updated attributes:', users2.attributes);
      
      // Should have updated attributes
      expect(users2.attributes.age).toBe('number');
    });

    it('should not create multiple instances when called multiple times', async () => {
      let firstInstance;
      const instances = [];
      
      // Create same resource multiple times
      for (let i = 0; i < 3; i++) {
        const resource = await db.createResource({
          name: 'products',
          attributes: {
            name: 'string',
            price: 'number',
            iteration: `string|${i}` // Change to trigger version updates
          }
        });
        
        if (i === 0) firstInstance = resource;
        instances.push(resource);
      }

      // All should be the SAME instance
      expect(instances[0]).toBe(firstInstance);
      expect(instances[1]).toBe(firstInstance);
      expect(instances[2]).toBe(firstInstance);
      
      // And same as db.resource()
      const dbResource = db.resource('products');
      expect(firstInstance).toBe(dbResource);
      
      console.log('✅ All instances are the same:', instances.every(i => i === firstInstance));
      console.log('✅ Latest attributes:', dbResource.attributes);
    });

    it('should emit resourceUpdated when updating existing resource', async () => {
      const updateEvents = [];
      db.on('s3db.resourceUpdated', (name) => updateEvents.push(name));

      // Create initial resource
      await db.createResource({
        name: 'orders',
        attributes: { total: 'number' }
      });

      // Update should emit event
      await db.createResource({
        name: 'orders',
        attributes: { total: 'number', status: 'string' }
      });

      expect(updateEvents).toContain('orders');
      console.log('✅ Update event emitted correctly');
    });

    it('should preserve all resource references after updates', async () => {
      // Create resource
      const events1 = await db.createResource({
        name: 'events',
        attributes: { name: 'string' }
      });

      // Store multiple references
      const ref1 = db.resource('events');
      const ref2 = db.resource('events');
      
      // All should be same instance
      expect(events1).toBe(ref1);
      expect(ref1).toBe(ref2);

      // Update schema
      const events2 = await db.createResource({
        name: 'events',
        attributes: { name: 'string', date: 'string' }
      });

      // All references should still point to same instance
      expect(events1).toBe(events2);
      expect(events1).toBe(ref1);
      expect(events1).toBe(ref2);
      
      const ref3 = db.resource('events');
      expect(events1).toBe(ref3);
      
      console.log('✅ All references preserved after update');
      console.log('✅ Updated schema has date field:', !!events1.attributes.date);
    });
  });

  describe('Version Management with Single Instance', () => {
    it('should update version on same instance when schema changes', async () => {
      // Create resource
      const users = await db.createResource({
        name: 'users',
        attributes: { name: 'string' }
      });

      const initialVersion = users.options.version;
      console.log('Initial version:', initialVersion);

      // Update schema - should increment version on SAME instance
      await db.createResource({
        name: 'users',
        attributes: { name: 'string', email: 'string' }
      });

      // Same instance should have updated version
      const finalVersion = users.options.version;
      console.log('Final version:', finalVersion);
      
      // Version should have been updated
      expect(finalVersion).not.toBe(initialVersion);
      
      // Still same instance
      const currentRef = db.resource('users');
      expect(users).toBe(currentRef);
      expect(currentRef.options.version).toBe(finalVersion);
      
      console.log('✅ Version updated on same instance');
    });
  });
});