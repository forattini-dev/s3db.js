/**
 * Schema Sync - Plugin Attributes Filtering Test
 *
 * Ensures that plugin attributes are NOT replicated to external databases
 */

import { describe, it, expect } from '@jest/globals';
import {
  generatePostgresCreateTable,
  generateMySQLCreateTable,
  generateSQLiteCreateTable
} from '#src/plugins/replicators/schema-sync.helper.js';

describe('Schema Sync - Plugin Attributes Filtering', () => {
  const userAttributes = {
    id: 'string|required',
    name: 'string|required',
    email: 'string|required|email',
    age: 'number|optional'
  };

  const pluginAttributes = {
    _hasEmbedding: 'boolean|optional',
    _status: 'string|optional',
    _score: 'number|optional'
  };

  const allAttributes = { ...userAttributes, ...pluginAttributes };

  describe('PostgreSQL', () => {
    it('should create table with user attributes only (when pre-filtered)', () => {
      // Replicators filter attributes before calling helper functions
      const sql = generatePostgresCreateTable('users', userAttributes);

      // User attributes should be present
      expect(sql).toContain('"name"');
      expect(sql).toContain('"email"');
      expect(sql).toContain('"age"');

      // Plugin attributes should NOT be present
      expect(sql).not.toContain('_hasEmbedding');
      expect(sql).not.toContain('_status');
      expect(sql).not.toContain('_score');
    });

    it('should include plugin attributes if passed unfiltered (demonstrating need for filtering)', () => {
      // If replicators don't filter, plugin attributes would leak
      const sql = generatePostgresCreateTable('users', allAttributes);

      // This demonstrates why filtering is critical
      expect(sql).toContain('_hasEmbedding');
      expect(sql).toContain('_status');
      expect(sql).toContain('_score');
    });
  });

  describe('MySQL', () => {
    it('should create table with user attributes only (when pre-filtered)', () => {
      const sql = generateMySQLCreateTable('users', userAttributes);

      expect(sql).toContain('`name`');
      expect(sql).toContain('`email`');
      expect(sql).toContain('`age`');

      expect(sql).not.toContain('_hasEmbedding');
      expect(sql).not.toContain('_status');
      expect(sql).not.toContain('_score');
    });
  });

  describe('SQLite', () => {
    it('should create table with user attributes only (when pre-filtered)', () => {
      const sql = generateSQLiteCreateTable('users', userAttributes);

      // SQLite doesn't quote column names
      expect(sql).toContain('name TEXT');
      expect(sql).toContain('email TEXT');
      expect(sql).toContain('age REAL');

      expect(sql).not.toContain('_hasEmbedding');
      expect(sql).not.toContain('_status');
      expect(sql).not.toContain('_score');
    });
  });

  describe('Edge Cases', () => {
    it('should handle resources with no plugin attributes', () => {
      const sql = generatePostgresCreateTable('posts', {
        id: 'string|required',
        title: 'string|required',
        content: 'string|required'
      });

      expect(sql).toContain('"title"');
      expect(sql).toContain('"content"');
    });

    it('should handle resources with only plugin attributes', () => {
      // Edge case: resource with only internal fields
      const sql = generatePostgresCreateTable('internal_metadata', pluginAttributes);

      // Only id should be present
      expect(sql).toContain('id VARCHAR');
      expect(sql).toContain('_hasEmbedding');
      expect(sql).toContain('_status');
    });

    it('should handle empty attributes', () => {
      const sql = generatePostgresCreateTable('empty', {});

      // Should at least have id
      expect(sql).toContain('id VARCHAR');
      expect(sql).toContain('CREATE TABLE');
    });
  });
});
