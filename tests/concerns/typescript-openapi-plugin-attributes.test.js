/**
 * TypeScript & OpenAPI Generator - Plugin Attributes Filtering Test
 *
 * Ensures that plugin attributes are NOT exposed in:
 * - TypeScript interface generation
 * - OpenAPI schema generation
 */

import { createDatabaseForTest } from '../config.js';
import { generateTypes } from '#src/concerns/typescript-generator.js';
import { generateOpenAPISpec } from '#src/plugins/api/utils/openapi-generator.js';
import fs from 'fs/promises';
import path from 'path';

describe('TypeScript & OpenAPI - Plugin Attributes Filtering', () => {
  let database;
  let users;
  let tempDir;

  beforeEach(async () => {
    database = createDatabaseForTest('ts-openapi-plugin-test');
    await database.connect();

    // Create resource with user attributes
    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'string|required|email',
        age: 'number|optional'
      },
      behavior: 'body-overflow',
      timestamps: false
    });

    // Add plugin attributes (these should NOT appear in generated types/docs)
    users.addPluginAttribute('_hasEmbedding', 'boolean|optional', 'VectorPlugin');
    users.addPluginAttribute('_status', 'string|optional', 'WorkflowPlugin');
    users.addPluginAttribute('_score', 'number|optional', 'RankingPlugin');

    tempDir = '/tmp/s3db-test-' + Date.now();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('TypeScript Generator', () => {
    it('should NOT include plugin attributes in generated TypeScript interfaces', async () => {
      const outputPath = path.join(tempDir, 'database.d.ts');

      await generateTypes(database, { outputPath });

      const content = await fs.readFile(outputPath, 'utf-8');

      // User attributes SHOULD be present
      expect(content).toContain('name');
      expect(content).toContain('email');
      expect(content).toContain('age');

      // Plugin attributes should NOT be present
      expect(content).not.toContain('_hasEmbedding');
      expect(content).not.toContain('_status');
      expect(content).not.toContain('_score');

      // Verify interface structure
      expect(content).toContain('export interface Users {');
      expect(content).toContain('id: string;');
      expect(content).toContain('name: string;');
      expect(content).toContain('email: string;');
      expect(content).toContain('age?: number;');
    });

    it('should handle resources with no plugin attributes', async () => {
      // Create another resource without plugins
      const posts = await database.createResource({
        name: 'posts',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string|required'
        },
        timestamps: false
      });

      const outputPath = path.join(tempDir, 'database.d.ts');
      await generateTypes(database, { outputPath });

      const content = await fs.readFile(outputPath, 'utf-8');

      // Verify posts interface exists and is correct
      expect(content).toContain('export interface Posts {');
      expect(content).toContain('title');
      expect(content).toContain('content');
    });

    it('should handle mixed scenario: some resources with plugins, some without', async () => {
      // Create resource without plugins
      await database.createResource({
        name: 'comments',
        attributes: {
          id: 'string|optional',
          text: 'string|required'
        },
        timestamps: false
      });

      const outputPath = path.join(tempDir, 'database.d.ts');
      await generateTypes(database, { outputPath });

      const content = await fs.readFile(outputPath, 'utf-8');

      // Users (with plugins) - plugins should be filtered
      expect(content).toContain('export interface Users {');
      expect(content).not.toContain('_hasEmbedding');

      // Comments (without plugins) - should be normal
      expect(content).toContain('export interface Comments {');
      expect(content).toContain('text');
    });
  });

  describe('OpenAPI Generator', () => {
    it('should NOT include plugin attributes in generated OpenAPI schema', () => {
      const spec = generateOpenAPISpec(database, {
        title: 'Test API',
        version: '1.0.0',
        baseUrl: 'http://localhost:3000'
      });

      // Verify spec was generated
      expect(spec).toBeDefined();
      expect(spec.components).toBeDefined();
      expect(spec.components.schemas).toBeDefined();

      // Get users schema - the schema might be under different structure
      const usersSchema = spec.components.schemas.User ||
                         spec.components.schemas.Users ||
                         spec.components.schemas.users;

      // If schema exists, verify plugin attributes are filtered
      if (usersSchema && usersSchema.properties) {
        // Plugin attributes should NOT be present
        expect(usersSchema.properties._hasEmbedding).toBeUndefined();
        expect(usersSchema.properties._status).toBeUndefined();
        expect(usersSchema.properties._score).toBeUndefined();

        // User attributes SHOULD be present (if schema is correctly structured)
        expect(usersSchema.properties.name).toBeDefined();
        expect(usersSchema.properties.email).toBeDefined();
      }
    });

    it('should handle resources without plugin attributes in OpenAPI', async () => {
      // Create clean resource
      await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          price: 'number|required'
        },
        timestamps: false
      });

      const spec = generateOpenAPISpec(database, {
        title: 'Test API',
        version: '1.0.0'
      });

      expect(spec).toBeDefined();
      expect(spec.components).toBeDefined();
    });

    it('should include plugin-level and resource-level custom routes in the spec', () => {
      users.config = users.config || {};
      users.config.routes = {
        'POST /:id/activate': async () => {}
      };
      users.config.api = {
        'async GET /:id/stats': async () => {}
      };

      const spec = generateOpenAPISpec(database, {
        basePath: '/v1',
        routes: {
          'GET /health': async () => {}
        },
        resources: {
          users: {
            routes: users.config.routes
          }
        }
      });

      expect(spec.paths['/v1/health']).toBeDefined();
      expect(spec.paths['/v1/health'].get).toBeDefined();
      expect(spec.paths['/v1/health'].get.tags).toEqual(
        expect.arrayContaining(['Health'])
      );

      expect(spec.paths['/v1/users/{id}/activate']).toBeDefined();
      expect(spec.paths['/v1/users/{id}/activate'].post.tags).toEqual(
        expect.arrayContaining(['users'])
      );

      expect(spec.paths['/v1/users/{id}/stats']).toBeDefined();
      expect(spec.paths['/v1/users/{id}/stats'].get.tags).toEqual(
        expect.arrayContaining(['users'])
      );

      expect(spec.tags.find((tag) => tag.name === 'Health')).toBeDefined();
      expect(spec.tags.find((tag) => tag.name === 'Custom Routes')).toBeDefined();

      expect(spec.paths['/v1/users'].head).toBeDefined();
      expect(spec.paths['/v1/users'].options).toBeDefined();
      expect(spec.paths['/v1/users/{id}'].head).toBeDefined();
      expect(spec.paths['/v1/users/{id}'].options).toBeDefined();
    });
  });

  describe('Integration - Plugin Attributes Should Be Internal Only', () => {
    it('should allow inserting data with plugin attributes via API but not expose them in docs', async () => {
      // Insert data with plugin attributes
      await users.insert({
        id: 'u1',
        name: 'Alice',
        email: 'alice@test.com',
        age: 30,
        _hasEmbedding: true,
        _status: 'active',
        _score: 95
      });

      // Verify data was stored
      const user = await users.get('u1');
      expect(user._hasEmbedding).toBe(true);
      expect(user._status).toBe('active');
      expect(user._score).toBe(95);

      // But OpenAPI docs should not show these fields
      const spec = generateOpenAPISpec(database, {
        title: 'Test API',
        version: '1.0.0'
      });

      // Check that plugin attributes are not in schema (if it exists)
      const usersSchema = spec.components.schemas.User ||
                         spec.components.schemas.Users ||
                         spec.components.schemas.users;

      if (usersSchema && usersSchema.properties) {
        expect(usersSchema.properties._hasEmbedding).toBeUndefined();
        expect(usersSchema.properties._status).toBeUndefined();
        expect(usersSchema.properties._score).toBeUndefined();
      }
    });

    it('should maintain backwards compatibility when plugin is removed', async () => {
      // Insert with plugin
      await users.insert({
        id: 'u2',
        name: 'Bob',
        email: 'bob@test.com',
        age: 25,
        _status: 'pending'
      });

      // Remove plugin attribute
      users.removePluginAttribute('_status', 'WorkflowPlugin');

      // TypeScript generator should still work
      const outputPath = path.join(tempDir, 'after-removal.d.ts');
      await generateTypes(database, { outputPath });

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('export interface Users {');
      expect(content).not.toContain('_status');

      // Data should still be readable
      const user = await users.get('u2');
      expect(user.name).toBe('Bob');
    });
  });
});
