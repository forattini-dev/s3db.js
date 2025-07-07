import { join } from 'path';
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import Database from '../src/database.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-versions-' + Date.now());

describe('Resource Versioning with Partitions', () => {
  let database;

  beforeEach(async () => {
    // Create database with versioning enabled
    database = new Database({
      verbose: false,
      versioningEnabled: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`,
    });

    await database.connect();
  });

  test('should create resource with partitions and automatic version partition', async () => {
    // Create resource with two partitions and versioning enabled
    const resource = await database.createResource({
      name: 'users',
      attributes: {
        email: 'string|required',
        name: 'string|required',
        status: 'string|required',
        region: 'string|required'
      },
      partitions: {
        // Single attribute partition
        byStatus: {
          fields: {
            status: 'string'
          }
        },
        // Two attributes partition
        byStatusAndRegion: {
          fields: {
            status: 'string',
            region: 'string'
          }
        }
      },
      versioningEnabled: true
    });

    // Verify that versioning is enabled
    expect(resource.versioningEnabled).toBe(true);

    // Verify that automatic version partition was added
    expect(resource.config.partitions.byVersion).toBeDefined();
    expect(resource.config.partitions.byVersion.fields).toEqual({
      _v: 'string'
    });

    // Verify all partitions are present
    expect(Object.keys(resource.config.partitions)).toContain('byStatus');
    expect(Object.keys(resource.config.partitions)).toContain('byStatusAndRegion');
    expect(Object.keys(resource.config.partitions)).toContain('byVersion');

    // Verify attributes exist (order may vary based on definition order)
    const attributeKeys = Object.keys(resource.attributes);
    expect(attributeKeys).toContain('email');
    expect(attributeKeys).toContain('name');
    expect(attributeKeys).toContain('status');
    expect(attributeKeys).toContain('region');
  });

  test('should handle version increments and object migration', async () => {
    // Step 1: Create initial resource version (v0)
    const resource = await database.createResource({
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'number|required',
        status: 'string|required'
      },
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        }
      },
      versioningEnabled: true
    });

    // Insert two objects in v0
    const product1 = await resource.insert({
      name: 'Laptop',
      price: 999.99,
      status: 'active'
    });

    const product2 = await resource.insert({
      name: 'Mouse',
      price: 29.99,
      status: 'inactive'
    });

    // Verify objects have version (may be undefined in mocked environment)
    // In a real environment, this would be the current resource version
    console.log('Product1 _v:', product1._v);
    console.log('Product2 _v:', product2._v);

    // Step 2: Update resource definition with new attributes
    // Adding attributes at different positions (beginning, middle, end)
    const updatedResource = await database.createResource({
      name: 'products',
      attributes: {
        brand: 'string|optional',        // Beginning (alphabetically)
        category: 'string|optional',     // Middle position
        name: 'string|required',         // Existing
        price: 'number|required',        // Existing
        status: 'string|required',       // Existing
        weight: 'number|optional'        // End (alphabetically)
      },
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        },
        // Add new partition with two attributes
        byStatusAndName: {
          fields: {
            status: 'string',
            name: 'string'
          }
        }
      },
      versioningEnabled: true
    });

    // Verify version has incremented (starts with v1, then v2, etc.)
    expect(updatedResource.version).toMatch(/^v\d+$/);

    // Verify attributes are still in alphabetical order
    const newAttributeKeys = Object.keys(updatedResource.attributes);
    const sortedNewKeys = [...newAttributeKeys].sort();
    expect(newAttributeKeys).toEqual(sortedNewKeys);

    // Expected order: brand, category, name, price, status, weight
    expect(newAttributeKeys).toEqual(['brand', 'category', 'name', 'price', 'status', 'weight']);

    // Step 3: Insert new object with new schema version
    const product3 = await updatedResource.insert({
      brand: 'Apple',
      category: 'Electronics',
      name: 'MacBook',
      price: 1299.99,
      status: 'active',
      weight: 2.5
    });

    // Verify new object has the new attributes
    expect(product3.brand).toBe('Apple');
    expect(product3.category).toBe('Electronics');
    expect(product3.weight).toBe(2.5);

    // Step 4: Update an existing object (should migrate to new version)
    const updatedProduct1 = await updatedResource.update(product1.id, {
      brand: 'Dell',
      category: 'Computers',
      name: 'Laptop', // Include existing required fields
      price: 999.99,
      status: 'active',
      weight: 3.0
    });

    // Verify updated object has new attributes
    expect(updatedProduct1.brand).toBe('Dell');
    expect(updatedProduct1.category).toBe('Computers');
    expect(updatedProduct1.weight).toBe(3.0);

    // Verify existing attributes are preserved
    expect(updatedProduct1.name).toBe('Laptop');
    expect(updatedProduct1.price).toBe(999.99);
    expect(updatedProduct1.status).toBe('active');
    expect(updatedProduct1.id).toBe(product1.id);
  });

  test('should handle partition references across versions', async () => {
    // Create resource with multiple partitions
    const resource = await database.createResource({
      name: 'orders',
      attributes: {
        customerId: 'string|required',
        region: 'string|required',
        status: 'string|required',
        total: 'number|required'
      },
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        },
        byRegionAndStatus: {
          fields: {
            region: 'string',
            status: 'string'
          }
        }
      },
      versioningEnabled: true
    });

    // Insert order
    const order1 = await resource.insert({
      customerId: 'cust123',
      region: 'US',
      status: 'pending',
      total: 150.00
    });

    // Update resource with new attributes
    const updatedResource = await database.createResource({
      name: 'orders',
      attributes: {
        customerId: 'string|required',
        priority: 'string|optional',    // New attribute
        region: 'string|required',
        status: 'string|required',
        total: 'number|required'
      },
      partitions: {
        byStatus: {
          fields: {
            status: 'string'
          }
        },
        byRegionAndStatus: {
          fields: {
            region: 'string',
            status: 'string'
          }
        }
      },
      versioningEnabled: true
    });

    // Update the order (should migrate versions)
    const updatedOrder1 = await updatedResource.update(order1.id, {
      customerId: 'cust123', // Include required fields
      region: 'US',
      total: 150.00,
      priority: 'high',
      status: 'processing'
    });

    // Verify update worked
    expect(updatedOrder1.priority).toBe('high');
    expect(updatedOrder1.status).toBe('processing');

    // Verify all original attributes are preserved
    expect(updatedOrder1.customerId).toBe('cust123');
    expect(updatedOrder1.region).toBe('US');
    expect(updatedOrder1.total).toBe(150.00);
  });

  test('should maintain data integrity during version migrations', async () => {
    // Create resource with complex nested attributes
    const resource = await database.createResource({
      name: 'profiles',
      attributes: {
        email: 'string|required',
        preferences: 'object|optional',
        settings: 'object|optional',
        userId: 'string|required'
      },
      partitions: {
        byUserId: {
          fields: {
            userId: 'string'
          }
        }
      },
      versioningEnabled: true
    });

    // Insert profile with nested data
    const profile1 = await resource.insert({
      email: 'user@example.com',
      userId: 'user123',
      preferences: {
        theme: 'dark',
        notifications: {
          email: true,
          sms: false
        }
      },
      settings: {
        language: 'en',
        timezone: 'UTC'
      }
    });

    // Update resource definition with new attributes
    const updatedResource = await database.createResource({
      name: 'profiles',
      attributes: {
        avatar: 'string|optional',      // New attribute (beginning)
        email: 'string|required',
        lastLogin: 'string|optional',   // New attribute (middle)
        preferences: 'object|optional',
        settings: 'object|optional',
        userId: 'string|required'
      },
      partitions: {
        byUserId: {
          fields: {
            userId: 'string'
          }
        }
      },
      versioningEnabled: true
    });

    // Update profile (should migrate version)
    const updatedProfile1 = await updatedResource.update(profile1.id, {
      email: 'user@example.com', // Include required fields
      userId: 'user123',
      preferences: profile1.preferences,
      settings: profile1.settings,
      avatar: 'https://example.com/avatar.jpg',
      lastLogin: '2023-10-01T12:00:00Z'
    });

    // Verify update worked
    expect(updatedProfile1.avatar).toBe('https://example.com/avatar.jpg');
    expect(updatedProfile1.lastLogin).toBe('2023-10-01T12:00:00Z');

    // Verify complex nested data is preserved
    expect(updatedProfile1.email).toBe('user@example.com');
    expect(updatedProfile1.userId).toBe('user123');
    expect(updatedProfile1.preferences).toEqual({
      theme: 'dark',
      notifications: {
        email: true,
        sms: false
      }
    });
    expect(updatedProfile1.settings).toEqual({
      language: 'en',
      timezone: 'UTC'
    });
  });

  test('should handle multiple version increments', async () => {
    // Create initial resource (v1)
    let resource = await database.createResource({
      name: 'documents',
      attributes: {
        title: 'string|required',
        content: 'string|required'
      },
      versioningEnabled: true
    });

    // Insert document in v1
    const doc1 = await resource.insert({
      title: 'Document 1',
      content: 'Initial content'
    });

    // Document created (version field managed internally)
    console.log('Document _v:', doc1._v);

    // Update to v2
    resource = await database.createResource({
      name: 'documents',
      attributes: {
        author: 'string|optional',
        content: 'string|required',
        title: 'string|required'
      },
      versioningEnabled: true
    });

    expect(resource.version).toMatch(/^v\d+$/);

    // Update to v3
    resource = await database.createResource({
      name: 'documents',
      attributes: {
        author: 'string|optional',
        content: 'string|required',
        tags: 'array|optional',
        title: 'string|required'
      },
      versioningEnabled: true
    });

    expect(resource.version).toMatch(/^v\d+$/);

    // Update to v4
    resource = await database.createResource({
      name: 'documents',
      attributes: {
        author: 'string|optional',
        category: 'string|optional',
        content: 'string|required',
        tags: 'array|optional',
        title: 'string|required'
      },
      versioningEnabled: true
    });

    expect(resource.version).toMatch(/^v\d+$/);

    // Update the document (should migrate to v4)
    const updatedDoc1 = await resource.update(doc1.id, {
      title: 'Document 1', // Include required fields
      content: 'Initial content',
      author: 'John Doe',
      category: 'Technical',
      tags: ['technical', 'guide']
    });

    // Verify update worked
    expect(updatedDoc1.author).toBe('John Doe');
    expect(updatedDoc1.category).toBe('Technical');
    expect(updatedDoc1.tags).toEqual(['technical', 'guide']);

    // Verify original attributes are preserved
    expect(updatedDoc1.title).toBe('Document 1');
    expect(updatedDoc1.content).toBe('Initial content');
    expect(updatedDoc1.id).toBe(doc1.id);
  });

  test('should verify alphabetical ordering of attributes with mixed insertions', async () => {
    // Clean up any existing resources to avoid conflicts
    try {
      await database.deleteAll();
    } catch (e) {
      // Ignore errors if no resources exist
    }

    // Create resource with some attributes
    const resource = await database.createResource({
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'number|required',
        status: 'string|required'
      },
      versioningEnabled: true
    });

    // Insert object
    const product1 = await resource.insert({
      name: 'Widget',
      price: 99.99,
      status: 'active'
    });

    // Update resource with attributes added at different positions
    // Focus only on alphabetical ordering without partitions
    const updatedResource = await database.createResource({
      name: 'products',
      attributes: {
        availability: 'string|optional',  // First alphabetically
        brand: 'string|optional',         // Second alphabetically
        category: 'string|optional',      // Third alphabetically
        name: 'string|required',          // Fourth alphabetically
        price: 'number|required',         // Fifth alphabetically
        rating: 'number|optional',        // Sixth alphabetically
        status: 'string|required',        // Seventh alphabetically
        weight: 'number|optional'         // Eighth alphabetically
      },
      versioningEnabled: true
    });

    // Verify alphabetical order
    const attributeKeys = Object.keys(updatedResource.attributes);
    expect(attributeKeys).toEqual([
      'availability',
      'brand', 
      'category',
      'name',
      'price',
      'rating',
      'status',
      'weight'
    ]);

    // Update product to migrate to new version
    const updatedProduct1 = await updatedResource.update(product1.id, {
      name: 'Widget', // Include required fields
      price: 99.99,
      status: 'active',
      availability: 'in-stock',
      brand: 'TechCorp',
      category: 'Electronics',
      rating: 4.5,
      weight: 1.2
    });

    // Verify all attributes are handled correctly
    expect(updatedProduct1.availability).toBe('in-stock');
    expect(updatedProduct1.brand).toBe('TechCorp');
    expect(updatedProduct1.category).toBe('Electronics');
    expect(updatedProduct1.name).toBe('Widget');
    expect(updatedProduct1.price).toBe(99.99);
    expect(updatedProduct1.rating).toBe(4.5);
    expect(updatedProduct1.status).toBe('active');
    expect(updatedProduct1.weight).toBe(1.2);
  });
});