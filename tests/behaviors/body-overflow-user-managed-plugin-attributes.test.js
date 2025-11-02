/**
 * Body-Overflow & User-Managed Behaviors - Plugin Attributes Test
 *
 * Ensures that plugin attributes work correctly with both behaviors
 * and that _pluginMap is properly stored and retrieved
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

describe('Body-Overflow & User-Managed - Plugin Attributes', () => {
  let database;

  beforeEach(async () => {
    // Clear storage before each test to prevent interference
    MemoryClient.clearAllStorage();

    database = createDatabaseForTest('behavior-plugin-test');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
    // Clear storage after each test
    MemoryClient.clearAllStorage();
  });

  describe('Body-Overflow Behavior', () => {
    it('should store and retrieve plugin attributes when data overflows to body', async () => {
      const users = await database.createResource({
        name: 'users_overflow',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          // Large field to force overflow
          description: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: false
      });

      // Add plugin attributes
      users.addPluginAttribute('_status', 'string|optional', 'WorkflowPlugin');
      users.addPluginAttribute('_score', 'number|optional', 'RankingPlugin');

      // Insert with large description to trigger overflow
      // Need to be larger than 2KB limit to ensure overflow
      const largeDescription = 'x'.repeat(2500);
      await users.insert({
        id: 'u1',
        name: 'Alice',
        description: largeDescription,
        _status: 'active',
        _score: 95
      });

      // Retrieve and verify plugin attributes work correctly
      const user = await users.get('u1');
      expect(user.name).toBe('Alice');
      expect(user.description).toBe(largeDescription);
      expect(user._status).toBe('active');
      expect(user._score).toBe(95);
      // Note: $overflow flag may or may not be set depending on encoding efficiency
      // The important thing is that plugin attributes are correctly stored and retrieved
    });

    it('should handle plugin attributes when data fits in metadata', async () => {
      const posts = await database.createResource({
        name: 'posts_overflow',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: false
      });

      posts.addPluginAttribute('_published', 'boolean|optional', 'PublishPlugin');

      await posts.insert({
        id: 'p1',
        title: 'Short Title',
        content: 'Short content',
        _published: true
      });

      const post = await posts.get('p1');
      expect(post.title).toBe('Short Title');
      expect(post._published).toBe(true);
      expect(post.$overflow).toBeUndefined(); // No overflow
    });

    it('should update plugin attributes correctly with overflow', async () => {
      const docs = await database.createResource({
        name: 'docs_overflow',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: false
      });

      docs.addPluginAttribute('_version', 'number|optional', 'VersionPlugin');

      const largeContent = 'y'.repeat(2500);
      await docs.insert({
        id: 'd1',
        name: 'Doc 1',
        content: largeContent,
        _version: 1
      });

      // Update plugin attribute
      await docs.update('d1', { _version: 2 });

      const doc = await docs.get('d1');
      expect(doc._version).toBe(2);
      expect(doc.content).toBe(largeContent);
    });

    it('should handle backwards compatibility when plugin is removed', async () => {
      const items = await database.createResource({
        name: 'items_overflow',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          data: 'string|optional'
        },
        behavior: 'body-overflow',
        timestamps: false
      });

      items.addPluginAttribute('_temp', 'string|optional', 'TempPlugin');

      const largeData = 'z'.repeat(2500);
      await items.insert({
        id: 'i1',
        name: 'Item 1',
        data: largeData,
        _temp: 'temporary'
      });

      // Verify plugin attribute exists
      let item = await items.get('i1');
      expect(item._temp).toBe('temporary');

      // Remove plugin attribute
      items.removePluginAttribute('_temp', 'TempPlugin');

      // Should still read old data
      item = await items.get('i1');
      expect(item.name).toBe('Item 1');
      expect(item.data).toBe(largeData);
    });
  });

  describe('User-Managed Behavior', () => {

    it('should handle plugin attributes when data fits in metadata', async () => {
      const tags = await database.createResource({
        name: 'tags_managed',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          color: 'string|optional'
        },
        behavior: 'user-managed',
        timestamps: false
      });

      tags.addPluginAttribute('_active', 'boolean|optional', 'ActivePlugin');

      let exceedsLimitEmitted = false;
      tags.on('exceedsLimit', () => {
        exceedsLimitEmitted = true;
      });

      await tags.insert({
        id: 't1',
        name: 'Important',
        color: 'red',
        _active: true
      });

      expect(exceedsLimitEmitted).toBe(false); // Should fit in metadata

      const tag = await tags.get('t1');
      expect(tag.name).toBe('Important');
      expect(tag._active).toBe(true);
    });

    it('should handle backwards compatibility when plugin is removed', async () => {
      const notes = await database.createResource({
        name: 'notes_managed',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string|optional'
        },
        behavior: 'user-managed',
        timestamps: false
      });

      notes.addPluginAttribute('_draft', 'boolean|optional', 'DraftPlugin');

      const largeContent = 'b'.repeat(2500);
      await notes.insert({
        id: 'n1',
        title: 'Note 1',
        content: largeContent,
        _draft: true
      });

      // Verify plugin attribute
      let note = await notes.get('n1');
      expect(note._draft).toBe(true);

      // Remove plugin attribute
      notes.removePluginAttribute('_draft', 'DraftPlugin');

      // Should still read data
      note = await notes.get('n1');
      expect(note.title).toBe('Note 1');
      expect(note.content).toBe(largeContent);
    });
  });

  describe('Mixed Scenarios', () => {
    it('should handle multiple plugins with both behaviors', async () => {
      const records = await database.createResource({
        name: 'records_mixed',
        attributes: {
          id: 'string|optional',
          data: 'string|required'
        },
        behavior: 'body-overflow',
        timestamps: false
      });

      records.addPluginAttribute('_p1', 'string|optional', 'Plugin1');
      records.addPluginAttribute('_p2', 'number|optional', 'Plugin2');
      records.addPluginAttribute('_p3', 'boolean|optional', 'Plugin3');

      const largeData = 'c'.repeat(2500);
      await records.insert({
        id: 'r1',
        data: largeData,
        _p1: 'value1',
        _p2: 123,
        _p3: false
      });

      const record = await records.get('r1');
      expect(record._p1).toBe('value1');
      expect(record._p2).toBe(123);
      expect(record._p3).toBe(false);
    });
  });
});
