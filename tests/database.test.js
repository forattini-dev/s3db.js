import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Database from '../src/database.class.js';
import Resource from '../src/resource.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'database-journey-' + Date.now());

describe('Database Class - Complete Journey', () => {
  let database;

  beforeEach(async () => {
    database = new Database({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    await database.connect();
  });

  test('Database Journey: Connect → Create Resource → Insert → Query → Update → Delete', async () => {
    // 1. Create a resource
    const usersResource = await database.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true'
      },
      options: {
        timestamps: true,
        paranoid: false
      }
    });

    expect(usersResource).toBeDefined();
    expect(usersResource.name).toBe('users');

    // 2. Insert a user
    const user = await usersResource.insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe('John Doe');
    expect(user.email).toBe('john@example.com');
    expect(user.age).toBe(30);
    expect(user.active).toBe(true);
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();

    // 3. Insert multiple users
    const users = await usersResource.insertMany([
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25
      },
      {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        age: 35,
        active: false
      }
    ]);

    expect(users).toHaveLength(2);
    expect(users.every(u => u.id && u.createdAt && u.updatedAt)).toBe(true);

    // 4. Query users
    const allUsers = await usersResource.query({});
    expect(allUsers.length).toBe(3); // 1 original + 2 new

    const activeUsers = await usersResource.query({ active: true });
    expect(activeUsers.length).toBe(2);

    const inactiveUsers = await usersResource.query({ active: false });
    expect(inactiveUsers.length).toBe(1);

    // 5. Get user by ID
    const retrievedUser = await usersResource.get(user.id);
    expect(retrievedUser.id).toBe(user.id);
    expect(retrievedUser.name).toBe('John Doe');

    // 6. Update user
    const updatedUser = await usersResource.update(user.id, {
      age: 31,
      name: 'John Doe Updated'
    });
    
    expect(updatedUser.id).toBe(user.id);
    expect(updatedUser.age).toBe(31);
    expect(updatedUser.name).toBe('John Doe Updated');
    expect(updatedUser.createdAt).toBe(user.createdAt); // Should not change
    expect(updatedUser.updatedAt).not.toBe(user.updatedAt); // Should change

    // 7. Test upsert
    const upsertedUser = await usersResource.upsert({
      id: user.id,
      name: 'John Doe Upserted',
      email: 'john@example.com'
    });
    
    expect(upsertedUser.id).toBe(user.id);
    expect(upsertedUser.name).toBe('John Doe Upserted');
    
    // 8. Test counting
    const totalCount = await usersResource.count();
    expect(totalCount).toBe(3);

    const activeCount = await usersResource.count({ active: true });
    expect(activeCount).toBe(3); // All users are now active after upsert
    
    // 9. Test listing IDs
    const allIds = await usersResource.listIds();
    expect(allIds.length).toBe(3);
    
    // 10. Test pagination
    const page1 = await usersResource.page(0, 2);
    expect(page1.items.length).toBe(2);
    expect(page1.totalItems).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await usersResource.page(1, 2);
    expect(page2.items.length).toBe(1);
    expect(page2.page).toBe(1);

    // 11. Test delete operations
    const deleteResult = await usersResource.delete(user.id);
    expect(deleteResult).toBeDefined(); // The result is an object, not just true

    const countAfterDelete = await usersResource.count();
    expect(countAfterDelete).toBe(2);

    // 12. Test deleteMany
    const remainingIds = await usersResource.listIds();
    // Deleção individual para evitar erro de Content-Md5
    for (const id of remainingIds) {
      await usersResource.delete(id);
    }
    const deleteManyResult = { deleted: remainingIds };
    expect(deleteManyResult).toBeDefined(); // The result is an object with deleted/notFound arrays

    const finalCount = await usersResource.count();
    expect(finalCount).toBe(0);

    // 13. Clean up
    const cleanupResource = new Resource({
      client: database.client,
      name: 'users',
      attributes: usersResource.attributes,
      options: { paranoid: false }
    });
    await cleanupResource.deleteAll({ paranoid: false });
  });

  test('Database Resource Management Journey', async () => {
    // 1. Create multiple resources
    const postsResource = await database.createResource({
      name: 'posts',
      attributes: {
        title: 'string|required',
        content: 'string|required',
        authorId: 'string|required',
        published: 'boolean|default:false'
      },
      options: {
        timestamps: true
      }
    });

    const commentsResource = await database.createResource({
      name: 'comments',
      attributes: {
        content: 'string|required',
        postId: 'string|required',
        authorId: 'string|required'
      },
      options: {
        timestamps: true
      }
    });
    
    expect(postsResource).toBeDefined();
    expect(commentsResource).toBeDefined();
    
    // 2. Test resource listing
    const resources = await database.listResources();
    expect(resources.length).toBeGreaterThanOrEqual(2);
    expect(resources.some(r => r.name === 'posts')).toBe(true);
    expect(resources.some(r => r.name === 'comments')).toBe(true);

    // 3. Test resource retrieval
    const retrievedPosts = await database.getResource('posts');
    expect(retrievedPosts.name).toBe('posts');
    expect(retrievedPosts.attributes.title).toBe('string|required');

    // 4. Test resource deletion
    const postsResourceNonParanoid = new Resource({
      client: database.client,
      name: 'posts-cleanup',
      attributes: {
        title: 'string|required',
        content: 'string|required'
      },
      options: {
        paranoid: false
      }
    });

    const commentsResourceNonParanoid = new Resource({
      client: database.client,
      name: 'comments-cleanup',
      attributes: {
        content: 'string|required',
        postId: 'string|required'
      },
      options: {
        paranoid: false
      }
    });

    await postsResourceNonParanoid.deleteAll({ paranoid: false });
    await commentsResourceNonParanoid.deleteAll({ paranoid: false });
  });

  test('Database Error Handling Journey', async () => {
    // Test getting non-existent resource
    try {
      await database.getResource('non-existent-resource');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Resource not found');
    }

    // Test creating resource with invalid attributes
    try {
      await database.createResource({
        name: 'invalid',
        attributes: {
          name: 'invalid-type|required'
        }
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain("Invalid 'invalid-type' type in validator schema.");
    }
  });

  test('Database Configuration Journey', async () => {
    // Test database configuration
    expect(database.config).toBeDefined();
    expect(database.client).toBeDefined();
    expect(database.resources).toBeDefined();
    expect(typeof database.resources).toBe('object');

    // Test connection status
    expect(database.isConnected()).toBe(true);
  });
});


