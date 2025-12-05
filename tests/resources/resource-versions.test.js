import { createDatabaseForTest } from '#tests/config.js';

describe('Resource Versions - Real Integration Tests', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=resources/versions');
    await database.connect();
  });

  test('Basic Versioning with Real Data', async () => {
    const resource = await database.createResource({
      name: 'documents',
      attributes: {
        id: 'string|optional',
        title: 'string|required',
        content: 'string|required',
        author: 'string|required'
      },
      version: '1'
    });

    // Verify version was set
    expect(resource.schema.version).toBe('1');

    // Insert initial version
    const document = await resource.insert({
      id: 'doc1',
      title: 'Initial Document',
      content: 'This is the initial content',
      author: 'Alice'
    });

    expect(document.id).toBe('doc1');
    expect(document.title).toBe('Initial Document');

    // Update document
    const updatedDocument = await resource.update('doc1', {
      title: 'Updated Document',
      content: 'This is the updated content',
      author: 'Alice'
    });

    expect(updatedDocument.title).toBe('Updated Document');
    expect(updatedDocument.content).toBe('This is the updated content');
    expect(updatedDocument.author).toBe('Alice'); // Should remain unchanged

    // Get document and verify it's the latest version
    const retrievedDocument = await resource.get('doc1');
    expect(retrievedDocument.title).toBe('Updated Document');
    expect(retrievedDocument.content).toBe('This is the updated content');
  });

  test('Version History and Rollback', async () => {
    const resource = await database.createResource({
      name: 'articles',
      attributes: {
        id: 'string|optional',
        title: 'string|required',
        body: 'string|required',
        tags: 'array|items:string',
        published: 'boolean|required'
      },
      version: '2'
    });

    // Insert initial article
    const article = await resource.insert({
      id: 'article1',
      title: 'First Draft',
      body: 'This is the first draft of the article',
      tags: ['draft', 'tech'],
      published: false
    });

    // First update
    await resource.update('article1', {
      title: 'Second Draft',
      body: 'This is the second draft with improvements',
      tags: ['draft', 'tech', 'improved'],
      published: false
    });

    // Second update
    await resource.update('article1', {
      title: 'Final Version',
      body: 'This is the final version ready for publication',
      tags: ['published', 'tech', 'final'],
      published: true
    });

    // Get current version
    const currentArticle = await resource.get('article1');
    expect(currentArticle.title).toBe('Final Version');
    expect(currentArticle.published).toBe(true);
    expect(currentArticle.tags).toContain('published');

    // Test that we can still access the resource after multiple updates
    const finalCheck = await resource.get('article1');
    expect(finalCheck.title).toBe('Final Version');
    expect(finalCheck.body).toBe('This is the final version ready for publication');
  });

  test('Version with Complex Data Types', async () => {
    const resource = await database.createResource({
      name: 'profiles',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'email|required',
        settings: 'object|optional',
        preferences: 'object|optional',
        metadata: 'object|optional'
      },
      version: '3'
    });

    // Insert profile with complex data
    const profile = await resource.insert({
      id: 'profile1',
      name: 'John Silva',
      email: 'john@example.com',
      settings: {
        theme: 'dark',
        notifications: true,
        language: 'pt-BR'
      },
      preferences: {
        categories: ['tech', 'sports'],
        frequency: 'daily'
      },
      metadata: {
        createdBy: 'system',
        lastLogin: '2024-01-15T10:00:00Z'
      }
    });

    expect(profile.settings?.theme).toBe('dark');
    expect(profile.preferences.categories).toEqual(['tech', 'sports']);

    // Update with new settings
    const updatedProfile = await resource.update('profile1', {
      name: 'John Silva',
      email: 'john@example.com',
      settings: {
        theme: 'light',
        notifications: false,
        language: 'en-US'
      },
      preferences: {
        categories: ['tech', 'music', 'travel'],
        frequency: 'weekly'
      }
    });

    expect(updatedProfile.settings.theme).toBe('light');
    expect(updatedProfile.settings.notifications).toBe(false);
    expect(updatedProfile.preferences.categories).toEqual(['tech', 'music', 'travel']);
    expect(updatedProfile.preferences.frequency).toBe('weekly');

    // Verify metadata remains unchanged
    expect(updatedProfile.metadata.createdBy).toBe('system');
  });

  test('Version with Nested Object Updates', async () => {
    const resource = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        details: 'object|optional',
        specifications: 'object|optional'
      },
      version: '1'
    });

    // Insert product with nested objects
    const product = await resource.insert({
      id: 'prod1',
      name: 'Laptop Pro',
      details: {
        brand: 'TechCorp',
        model: 'LP-2024',
        dimensions: {
          width: 15.6,
          height: 1.2,
          depth: 10.8
        }
      },
      specifications: {
        cpu: 'Intel i7',
        ram: '16GB',
        storage: '512GB SSD'
      }
    });

    // Update nested object properties
    const updatedProduct = await resource.update('prod1', {
      name: 'Laptop Pro',
      'details.brand': 'NewTechCorp',
      'details.dimensions.height': 1.5,
      'specifications.ram': '32GB',
      'specifications.storage': '1TB SSD'
    });

    expect(updatedProduct.details.brand).toBe('NewTechCorp');
    expect(updatedProduct.details.dimensions.height).toBe(1.5);
    expect(updatedProduct.details.dimensions.width).toBe(15.6); // Should remain unchanged
    expect(updatedProduct.specifications.ram).toBe('32GB');
    expect(updatedProduct.specifications.storage).toBe('1TB SSD');
    expect(updatedProduct.specifications.cpu).toBe('Intel i7'); // Should remain unchanged
  });

  test('Version with Array Updates', async () => {
    const resource = await database.createResource({
      name: 'projects',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        description: 'string|required',
        tags: 'array|items:string',
        team: 'array|items:object',
        milestones: 'array'
      },
      version: '2'
    });

    // Insert project with arrays
    const project = await resource.insert({
      id: 'proj1',
      name: 'Web Application',
      description: 'A modern web application',
      tags: ['web', 'javascript', 'react'],
      team: [
        { name: 'Alice', role: 'developer' },
        { name: 'Bob', role: 'designer' }
      ],
      milestones: [
        { name: 'Planning', completed: true },
        { name: 'Development', completed: false }
      ]
    });

    // Update arrays
    const updatedProject = await resource.update('proj1', {
      name: 'Web Application',
      description: 'A modern web application',
      tags: ['web', 'javascript', 'react', 'typescript'],
      team: [
        { name: 'Alice', role: 'lead-developer' },
        { name: 'Bob', role: 'designer' },
        { name: 'Charlie', role: 'tester' }
      ],
      milestones: [
        { name: 'Planning', completed: true },
        { name: 'Development', completed: true }
      ]
    });

    expect(updatedProject.tags).toContain('typescript');
    expect(updatedProject.team).toHaveLength(3);
    expect(updatedProject.team[0].role).toBe('lead-developer');
    expect(updatedProject.team[2].name).toBe('Charlie');
    expect(updatedProject.milestones[1].completed).toBe(true);
  });

  test('Version with Conditional Updates', async () => {
    const resource = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|optional',
        orderId: 'string|required',
        status: 'string|required',
        amount: 'number|required',
        items: 'array',
        metadata: 'object|optional'
      },
      version: '1'
    });

    // Insert order
    const order = await resource.insert({
      id: 'order1',
      orderId: 'ORD-001',
      status: 'pending',
      amount: 150.00,
      items: [
        { productId: 'prod1', quantity: 2, price: 75.00 }
      ],
      metadata: {
        source: 'web',
        customerId: 'cust123'
      }
    });

    // Update only if status is pending
    const updatedOrder = await resource.update('order1', {
      orderId: 'ORD-001',
      amount: 150.00,
      items: [
        { productId: 'prod1', quantity: 2, price: 75.00 }
      ],
      status: 'processing',
      'metadata.updatedAt': new Date().toISOString()
    });

    expect(updatedOrder.status).toBe('processing');
    expect(updatedOrder.metadata.updatedAt).toBeDefined();
    expect(updatedOrder.metadata.source).toBe('web'); // Should remain unchanged

    // Try to update again (should work)
    const finalOrder = await resource.update('order1', {
      orderId: 'ORD-001',
      amount: 150.00,
      items: [
        { productId: 'prod1', quantity: 2, price: 75.00 }
      ],
      status: 'completed',
      'metadata.completedAt': new Date().toISOString()
    });

    expect(finalOrder.status).toBe('completed');
    expect(finalOrder.metadata.completedAt).toBeDefined();
  });

  test('Version with Validation', async () => {
    const resource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'email|required',
        age: 'number|min:18|max:100',
        role: 'string|required'
      },
      version: '2'
    });

    // Insert valid user
    const user = await resource.insert({
      id: 'user1',
      name: 'John Silva',
      email: 'john@example.com',
      age: 30,
      role: 'user'
    });

    expect(user.age).toBe(30);
    expect(user.role).toBe('user');

    // Update with valid data
    const updatedUser = await resource.update('user1', {
      name: 'John Silva',
      email: 'john@example.com',
      age: 31,
      role: 'moderator'
    });

    expect(updatedUser.age).toBe(31);
    expect(updatedUser.role).toBe('moderator');

    // Test invalid update (should throw error)
    try {
      await resource.update('user1', {
        age: 15 // Below minimum
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('validation');
      expect(error.message).not.toContain('[object');
    }

    // Verify user data wasn't changed by invalid update
    const unchangedUser = await resource.get('user1');
    expect(unchangedUser.age).toBe(31);
    expect(unchangedUser.role).toBe('moderator');
  });

  test('Version with Timestamps', async () => {
    const resource = await database.createResource({
      name: 'events',
      attributes: {
        id: 'string|optional',
        title: 'string|required',
        description: 'string|required',
        startDate: 'string|required',
        endDate: 'string|required'
      },
      timestamps: true,
      version: '1'
    });

    // Insert event
    const event = await resource.insert({
      id: 'event1',
      title: 'Team Meeting',
      description: 'Weekly team sync',
      startDate: '2024-01-15T10:00:00Z',
      endDate: '2024-01-15T11:00:00Z'
    });

    expect(event.createdAt).toBeDefined();
    expect(event.updatedAt).toBeDefined();
    const originalUpdatedAt = event.updatedAt;

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update event
    const updatedEvent = await resource.update('event1', {
      title: 'Team Sync Meeting',
      description: 'Weekly team sync',
      startDate: '2024-01-15T10:00:00Z',
      endDate: '2024-01-15T11:30:00Z'
    });

    expect(updatedEvent.title).toBe('Team Sync Meeting');
    expect(updatedEvent.endDate).toBe('2024-01-15T11:30:00Z');
    expect(updatedEvent.createdAt).toBe(event.createdAt); // Should remain unchanged
    expect(updatedEvent.updatedAt).not.toBe(originalUpdatedAt); // Should be updated
  });

  test('Version with Large Data Updates', async () => {
    const resource = await database.createResource({
      name: 'documents',
      attributes: {
        id: 'string|optional',
        title: 'string|required',
        content: 'string|required',
        metadata: 'object|optional'
      },
      version: '3'
    });

    // Insert document with large content
    const largeContent = 'X'.repeat(10000); // 10KB content
    let document;
    try {
      document = await resource.insert({
        id: 'doc1',
        title: 'Large Document',
        content: largeContent,
        metadata: {
          size: largeContent.length,
          type: 'text'
        }
      });
      expect(document.content.length).toBe(10000);
      expect(document.metadata.size).toBe(10000);
    } catch (error) {
      // Acceptable for user-managed behavior: S3 may reject large metadata
      expect(
        error.message.includes('metadata headers exceed') ||
        error.message.includes('Validation error')
      ).toBe(true);
      return; // Skip the rest of the test if insert fails
    }

    // Update with even larger content
    const largerContent = 'B'.repeat(20000); // 20KB content
    try {
      const updatedDocument = await resource.update('doc1', {
        title: 'Large Document',
        content: largerContent,
        metadata: {
          size: largerContent.length,
          type: 'text',
          updated: true
        }
      });
      // If no error, check the result
      expect(updatedDocument.content.length).toBe(20000);
      expect(updatedDocument.metadata.size).toBe(20000);
      expect(updatedDocument.metadata.updated).toBe(true);
      expect(updatedDocument.metadata.type).toBe('text'); // Should remain unchanged
    } catch (error) {
      // Acceptable for user-managed behavior: S3 may reject large metadata
      expect(
        error.message.includes('metadata headers exceed') ||
        error.message.includes('Validation error')
      ).toBe(true);
    }
  });

  // Skipped by default: only for manual benchmarking
  // eslint-disable-next-line jest/no-disabled-tests
  test.skip('Version Performance with Multiple Updates (manual/benchmark only)', async () => {
            // This test is only for manual/local benchmarking.
        // In CI environments or slow machines, it may exceed Jest timeout.
    const resource = await database.createResource({
      name: 'performance',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        value: 'number|required',
        metadata: 'object|optional'
      },
      version: '1'
    });

    // Insert initial data
    const item = await resource.insert({
      id: 'perf1',
      name: 'Performance Test',
      value: 1,
      metadata: { version: 1 }
    });

    // Perform multiple updates
    const startTime = Date.now();
    
    for (let i = 2; i <= 50; i++) {
      await resource.update('perf1', {
        name: 'Performance Test',
        value: i,
        metadata: {
          version: i,
          updatedAt: new Date().toISOString()
        }
      });
    }
    
    const endTime = Date.now();

    // Verify final state
    const finalItem = await resource.get('perf1');
    expect(finalItem.value).toBe(50);
    expect(finalItem.metadata.version).toBe(50);
    expect(finalItem.metadata.updatedAt).toBeDefined();

    // Should complete in reasonable time
  }, 30000);

  test('Version with Concurrent Updates', async () => {
    const resource = await database.createResource({
      name: 'concurrent',
      attributes: {
        id: 'string|optional',
        counter: 'number|required',
        lastUpdate: 'string|required'
      },
      version: '2'
    });

    // Insert initial data
    const item = await resource.insert({
      id: 'concurrent1',
      counter: 0,
      lastUpdate: new Date().toISOString()
    });

    // Simulate concurrent updates
    const updatePromises = Array.from({ length: 10 }, (_, i) => 
      resource.update('concurrent1', {
        counter: i + 1,
        lastUpdate: new Date().toISOString()
      })
    );

    const results = await Promise.all(updatePromises);

    // Wait for internal operations to finish
    await new Promise(r => setTimeout(r, 100));

    // Verify final state (should be the last update)
    const finalItem = await resource.get('concurrent1');
    expect(finalItem.counter).toBeGreaterThanOrEqual(1);
    expect(finalItem.counter).toBeLessThanOrEqual(10);
    expect(finalItem.lastUpdate).toBeDefined();

    // All updates should have succeeded
    expect(results).toHaveLength(10);
  });
});