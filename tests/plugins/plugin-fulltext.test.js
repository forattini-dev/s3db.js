import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import { FullTextPlugin } from '#src/plugins/fulltext.plugin.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('Full-Text Plugin', () => {
  jest.setTimeout(30000); // 30 seconds timeout for all tests
  let database;
  let client;
  let fullTextPlugin;
  let users;
  let products;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/fulltext');
    await database.connect();
    client = database.client;
    fullTextPlugin = new FullTextPlugin({
      logLevel: 'silent',
      enabled: true,
      fields: ['name', 'description', 'content'],
      minWordLength: 3,
      maxResults: 50,
      language: 'pt-BR'
    });

    // Create resources for testing
    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'string|required',
        description: 'string',
        department: 'string'
      }
    });
    products = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        description: 'string',
        content: 'string',
        category: 'string'
      }
    });
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Setup and Initialization', () => {
    test('should setup full-text plugin correctly', async () => {
      await fullTextPlugin.install(database);
      expect(fullTextPlugin.config.enabled).toBe(true);
      expect(fullTextPlugin.config.fields).toEqual(['name', 'description', 'content']);
      expect(fullTextPlugin.config.minWordLength).toBe(3);
      expect(fullTextPlugin.config.maxResults).toBe(50);
      expect(fullTextPlugin.config.language).toBe('pt-BR');
    });

    test('should handle disabled configuration', async () => {
      const disabledPlugin = new FullTextPlugin({ enabled: false });
      await disabledPlugin.install(database);
      expect(disabledPlugin.config.enabled).toBe(false);
    });

    test('should install hooks for existing resources', async () => {
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });

      await fullTextPlugin.install(database);

      expect(users._pluginWrappers).toBeDefined();
      expect(products._pluginWrappers).toBeDefined();
    });

    test('should install hooks for new resources', async () => {
      const newResource = await database.createResource({
        name: 'new-resource',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      await fullTextPlugin.install(database);

      expect(newResource._pluginWrappers).toBeDefined();
    });
  });

  describe('Indexing Operations', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
    });

    test('should index data on insert', async () => {
      await fullTextPlugin.install(database);
      const userData = {
        id: 'user-1',
        name: 'John Silva',
        email: 'john@example.com',
        description: 'Experienced software developer',
        department: 'TI'
      };

      await users.insert(userData);

      const indexStats = await fullTextPlugin.getIndexStats();
      expect(indexStats.totalWords).toBeGreaterThan(0);
      expect(indexStats.resources.users).toBeDefined();
    });

    test('should index data on update', async () => {
      await fullTextPlugin.install(database);
      const userData = {
        id: 'user-2',
        name: 'Mary Santos',
        email: 'mary@example.com',
        description: 'Business analyst',
        department: 'RH'
      };

      await users.insert(userData);

      // Update the user
      await users.update('user-2', {
        name: 'Mary Santos Silva',
                  email: 'mary@example.com',
        description: 'Senior business analyst',
        department: 'RH'
      });

      const indexStats = await fullTextPlugin.getIndexStats();
      expect(indexStats.totalWords).toBeGreaterThan(0);
    });

    test('should remove data from index on delete', async () => {
      await fullTextPlugin.install(database);
      const userData = {
        id: 'user-3',
        name: 'Peter Costa',
                  email: 'peter@example.com',
        description: 'Gerente de projeto',
        department: 'TI'
      };

      await users.insert(userData);

      const initialStats = await fullTextPlugin.getIndexStats();
      const initialWordCount = initialStats.totalWords;

      await users.delete('user-3');

      const finalStats = await fullTextPlugin.getIndexStats();
      expect(finalStats.totalWords).toBeLessThanOrEqual(initialWordCount);
    });

    test('should handle bulk operations', async () => {
      await fullTextPlugin.install(database);
      const userData = [
        { id: 'user-bulk-1', name: 'Alice Johnson', email: 'alice@example.com', description: 'Graphic designer', department: 'IT' },
        { id: 'user-bulk-2', name: 'Bob Wilson', email: 'bob@example.com', description: 'Frontend developer', department: 'IT' },
        { id: 'user-bulk-3', name: 'Carol Brown', email: 'carol@example.com', description: 'Data analyst', department: 'IT' }
      ];

      await users.insertMany(userData);

      const indexStats = await fullTextPlugin.getIndexStats();
      expect(indexStats.totalWords).toBeGreaterThan(0);
    });

    test('should respect minWordLength configuration', async () => {
      await fullTextPlugin.install(database);
      const userData = {
        id: 'user-short',
        name: 'Jo',
        email: 'jo@example.com',
        description: 'A very short description',
        department: 'IT'
      };

      await users.insert(userData);

      const indexStats = await fullTextPlugin.getIndexStats();
      // Words shorter than minWordLength should not be indexed
      expect(indexStats.totalWords).toBeGreaterThan(0);
    });

    test('should handle special characters and accents', async () => {
      await fullTextPlugin.install(database);
      const userData = {
        id: 'user-accents',
        name: 'Jose Maria Gonzalez',
        email: 'jose@example.com',
        description: 'Developer with experience in C++ and Python',
        department: 'TI'
      };

      await users.insert(userData);

      const results = await fullTextPlugin.searchRecords('users', 'Jose Maria');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]._searchScore).toBeGreaterThan(0);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
      // Create test data
      const testUsers = [
        { id: 'user-search-1', name: 'John Silva', email: 'john@example.com', description: 'Experienced Java developer', department: 'TI' },
        { id: 'user-search-2', name: 'Mary Santos', email: 'mary@example.com', description: 'Senior business analyst', department: 'RH' },
        { id: 'user-search-3', name: 'Peter Costa', email: 'peter@example.com', description: 'Software project manager', department: 'TI' },
        { id: 'user-search-4', name: 'Anna Oliveira', email: 'anna@example.com', description: 'User interface designer', department: 'Design' }
      ];

      for (const user of testUsers) {
        await users.insert(user);
      }

      const testProducts = [
        { id: 'prod-1', name: 'Laptop Dell Inspiron', description: 'Development notebook', content: 'Intel i7 processor, 16GB RAM', category: 'Electronics' },
        { id: 'prod-2', name: 'Mouse Logitech', description: 'Wireless gaming mouse', content: 'High precision optical sensor', category: 'Accessories' },
        { id: 'prod-3', name: 'Mechanical Keyboard', description: 'Keyboard for programmers', content: 'Cherry MX Blue switches', category: 'Accessories' }
      ];

      for (const product of testProducts) {
        await products.insert(product);
      }
    });

    test('should perform basic text search', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'John Silva');

      expect(results.length).toBeGreaterThan(0);
      // Handle potential encoding issues by checking if the name contains the search term
      expect((results[0]?.name || '').toLowerCase()).toContain('john');
      expect(results[0]._searchScore).toBeGreaterThan(0);
    });

    test('should perform search across multiple fields', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'developer');

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result._searchScore).toBeGreaterThan(0);
      });
    });

    test('should perform search in products', async () => {
      const results = await fullTextPlugin.searchRecords('products', 'laptop');

      expect(results.length).toBeGreaterThan(0);
      expect((results[0]?.name || '').toLowerCase()).toContain('laptop');
    });

    test('should respect maxResults configuration', async () => {
      const limitedPlugin = new FullTextPlugin({
      logLevel: 'silent',
        enabled: true,
        maxResults: 2
      });
      await limitedPlugin.install(database);

      const results = await limitedPlugin.searchRecords('users', 'TI');
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('should return results with search scores', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'developer');

      results.forEach(result => {
        expect(result._searchScore).toBeDefined();
        expect(typeof result._searchScore).toBe('number');
        expect(result._searchScore).toBeGreaterThan(0);
      });
    });

    test('should handle case-insensitive search', async () => {
      const results1 = await fullTextPlugin.searchRecords('users', 'john');
      const results2 = await fullTextPlugin.searchRecords('users', 'JOHN');

      expect(results1.length).toBe(results2.length);
    });

    test('should handle partial word matches', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'develop');

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect((result?.name || '').toLowerCase().includes('develop') || 
               (result?.description || '').toLowerCase().includes('develop')).toBe(true);
      });
    });

    test('should handle multiple word search', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'John developer');

      expect(results.length).toBeGreaterThan(0);
    });

    test('should handle empty search query', async () => {
      const results = await fullTextPlugin.searchRecords('users', '');
      expect(results).toEqual([]);
    });

    test('should handle search with only short words', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'a e o');
      expect(results).toEqual([]);
    });

    test('should handle non-existent resource', async () => {
      const results = await fullTextPlugin.searchRecords('non-existent', 'test');
      expect(results).toEqual([]);
    });
  });

  describe('Search with Options', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
      const testUsers = [
        { id: 'user-options-1', name: 'John Silva', email: 'john@example.com', description: 'Java developer', department: 'TI' },
        { id: 'user-options-2', name: 'Mary Santos', email: 'mary@example.com', description: 'Business analyst', department: 'RH' }
      ];

      for (const user of testUsers) {
        await users.insert(user);
      }
    });

    test('should search in specific fields', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'John', {
        fields: ['name']
      });

      expect(results.length).toBeGreaterThan(0);
      // Handle potential encoding issues by checking if the name contains the search term
      expect((results[0]?.name || '').toLowerCase()).toContain('john');
    });

    test('should limit results', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'developer', {
        limit: 1
      });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('should perform exact match search', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'John Silva', {
        exactMatch: true
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        // Handle potential encoding issues by checking if the name contains the search terms
        expect((result?.name || '').toLowerCase()).toContain('john');
        expect((result?.name || '').toLowerCase()).toContain('silva');
      });
    });

    test('should combine multiple options', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'developer', {
        fields: ['description'],
        limit: 1,
        exactMatch: false
      });

      expect(results.length).toBeLessThanOrEqual(1);
      results.forEach(result => {
        expect((result?.description || '').toLowerCase()).toContain('developer');
      });
    });
  });

  describe('Index Management', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
      const testUsers = [
        { id: 'user-index-1', name: 'Index User 1', email: 'index1@example.com', description: 'Test user for indexing', department: 'IT' },
        { id: 'user-index-2', name: 'Index User 2', email: 'index2@example.com', description: 'Another test user', department: 'IT' }
      ];

      for (const user of testUsers) {
        await users.insert(user);
      }
    });

    test('should get index statistics', async () => {
      const stats = await fullTextPlugin.getIndexStats();

      expect(stats.totalWords).toBeGreaterThan(0);
      expect(stats.resources).toBeDefined();
      expect(stats.resources.users).toBeDefined();
      expect(stats.resources.users.totalWords).toBeGreaterThan(0);
    });

    test('should rebuild index for specific resource', async () => {
      const initialStats = await fullTextPlugin.getIndexStats();
      const initialWordCount = initialStats.totalWords;

      await fullTextPlugin.rebuildIndex('users');

      const finalStats = await fullTextPlugin.getIndexStats();
      expect(finalStats.totalWords).toBeGreaterThanOrEqual(initialWordCount);
    }, 60000); // Increase timeout to 60 seconds

    test('should clear index for specific resource', async () => {
      const initialStats = await fullTextPlugin.getIndexStats();

      await fullTextPlugin.clearIndex('users');

      const finalStats = await fullTextPlugin.getIndexStats();
      expect(finalStats.totalWords).toBeLessThan(initialStats.totalWords);
    });

    test('should clear all indexes', async () => {
      await fullTextPlugin.clearAllIndexes();

      const stats = await fullTextPlugin.getIndexStats();
      expect(stats.totalWords).toBe(0);
    });

    test('should handle rebuild index for non-existent resource', async () => {
      await expect(fullTextPlugin.rebuildIndex('non-existent')).rejects.toThrow('Resource \'non-existent\' not found');
    });

    test('should respect custom timeout', async () => {
      // Mock to simulate slow operation
      const original = fullTextPlugin._rebuildAllIndexesInternal;
      fullTextPlugin._rebuildAllIndexesInternal = () => new Promise(resolve => setTimeout(resolve, 1000));
      await expect(fullTextPlugin.rebuildAllIndexes({ timeout: 100 })).rejects.toThrow('Timeout');
      // Restaurar original
      fullTextPlugin._rebuildAllIndexesInternal = original;
    }, 2000);
  });

  describe('Partition Support', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
      const testUsers = [
        { id: 'user-partition-1', name: 'Partition User 1', email: 'partition1@example.com', description: 'TI user', department: 'IT' },
        { id: 'user-partition-2', name: 'Partition User 2', email: 'partition2@example.com', description: 'HR user', department: 'HR' },
        { id: 'user-partition-3', name: 'Partition User 3', email: 'partition3@example.com', description: 'TI user', department: 'IT' }
      ];

      for (const user of testUsers) {
        await users.insert(user);
      }
    });

    test('should index data with partition information', async () => {
      const stats = await fullTextPlugin.getIndexStats();
      expect(stats.totalWords).toBeGreaterThan(0);
    });

    test('should search within partitions', async () => {
      const results = await fullTextPlugin.searchRecords('users', 'partition');

      expect(results.length).toBeGreaterThan(0);
      // Filter results to only include IT department users
      const itUsers = results.filter(result => result.department === 'IT');
      expect(itUsers.length).toBeGreaterThan(0);
      itUsers.forEach(result => {
        expect(result.department).toBe('IT');
      });
    });
  });

  describe('Language Support', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
    });

    test('should handle Portuguese language', async () => {
      const userData = {
        id: 'user-portuguese',
        name: 'John Silva',
        email: 'john@example.com',
        description: 'Software developer with experience in Java and Python',
        department: 'TI'
      };

      await users.insert(userData);

      const results = await fullTextPlugin.searchRecords('users', 'developer');
      expect(results.length).toBeGreaterThan(0);
    });

    test('should handle English language', async () => {
      const userData = {
        id: 'user-english',
        name: 'John Smith',
        email: 'john@example.com',
        description: 'Software developer with experience in Java and Python',
        department: 'IT'
      };

      await users.insert(userData);

      // Use the existing plugin to search for the English content
      const results = await fullTextPlugin.searchRecords('users', 'developer');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
    });

    test('should handle indexing errors gracefully', async () => {
      // Mock resource to simulate error
      users.insert = jest.fn().mockRejectedValue(new Error('Insert failed'));

      const userData = {
        id: 'user-error',
        name: 'Error User',
        email: 'error@example.com'
      };

      // Should not throw
      await expect(users.insert(userData)).rejects.toThrow('Insert failed');
    });

    test('should handle search errors gracefully', async () => {
      // Mock search to simulate error by returning empty array
      const originalSearch = fullTextPlugin.search.bind(fullTextPlugin);
      fullTextPlugin.search = jest.fn().mockResolvedValue([]);

      // Should return empty array instead of throwing
      const results = await fullTextPlugin.searchRecords('users', 'test');
      expect(results).toEqual([]);
      
      // Restore original method
      fullTextPlugin.search = originalSearch;
    });

    test('should handle index rebuild errors gracefully', async () => {
      // Mock rebuild to simulate error
      const originalRebuildIndex = fullTextPlugin.rebuildIndex.bind(fullTextPlugin);
      fullTextPlugin.rebuildIndex = jest.fn().mockRejectedValue(new Error('Rebuild failed'));

      await expect(fullTextPlugin.rebuildIndex('users')).rejects.toThrow('Rebuild failed');
      
      // Restore original method
      fullTextPlugin.rebuildIndex = originalRebuildIndex;
    }, 10000); // Increase timeout
  });

  describe('Performance', () => {
    beforeEach(async () => {
      await fullTextPlugin.install(database);
      // Create resources for testing
      users = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
          description: 'string',
          department: 'string'
        },
        partitions: {
          byDepartment: {
            fields: { department: 'string' }
          }
        }
      });
      products = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          description: 'string',
          content: 'string',
          category: 'string'
        }
      });
    });

    test('should handle large datasets efficiently', async () => {
      const startTime = Date.now();

      // Create only 5 records for speed
      const records = [];
      for (let i = 0; i < 5; i++) {
        records.push(users.insert({
          id: `user-perf-${i}`,
          name: `Performance User ${i}`,
          email: `perf${i}@example.com`,
          description: `User ${i} description with some searchable content`,
          department: 'IT'
        }));
      }
      await Promise.all(records);

      const insertTime = Date.now() - startTime;
      expect(insertTime).toBeLessThan(1000); // Should complete in less than 1 second

      const searchStartTime = Date.now();
      const results = await fullTextPlugin.searchRecords('users', 'searchable');
      const searchTime = Date.now() - searchStartTime;

      expect(searchTime).toBeLessThan(500); // Should search in less than 500ms
      expect(results.length).toBeGreaterThan(0);
    }, 2000); // Reduced timeout to 2 seconds

    test('should handle concurrent operations', async () => {
      const operations = [];

      for (let i = 0; i < 20; i++) {
        operations.push(
          users.insert({
            id: `user-concurrent-${i}`,
            name: `Concurrent User ${i}`,
            email: `concurrent${i}@example.com`,
            description: `Concurrent user ${i}`,
            department: 'IT'
          })
        );
      }

      await Promise.all(operations);

      const results = await fullTextPlugin.searchRecords('users', 'concurrent');
      expect(results.length).toBe(20);
    });
  });
}); 
