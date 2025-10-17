/**
 * Resource Events - this.database Binding Tests
 * Ensures that events have access to this.database after bind fix
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

describe('Resource Events - this.database Binding', () => {
  let database;
  let users;
  let stats;
  let eventCalls;

  beforeEach(async () => {
    database = await createDatabaseForTest('events-binding');
    eventCalls = [];

    // Create stats resource first
    stats = await database.createResource({
      name: 'stats',
      attributes: {
        id: 'string|required',
        count: 'number|default:0'
      }
    });

    // Create users resource with events
    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required'
      },
      events: {
        // Test with regular function (should have this.database)
        insert: [
          async function(data) {
            eventCalls.push({ type: 'insert', hasDatabase: !!this.database });

            // Should be able to access this.database.resources
            if (this.database && this.database.resources.stats) {
              await this.database.resources.stats.insert({
                id: `user-created-${data.id}`,
                count: 1
              });
            }
          }
        ],
        // Test with regular function (both regular and arrow functions work after bind fix)
        update: [
          async function(data) {
            // Regular function has access to this.database after bind
            eventCalls.push({ type: 'update', hasDatabase: !!this.database });
          }
        ]
      }
    });
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should bind this.database to event listeners with regular function', async () => {
    await users.insert({
      id: 'user1',
      name: 'John Doe',
      email: 'john@example.com'
    });

    // Wait for event to fire
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check that event was called with this.database
    expect(eventCalls).toHaveLength(1);
    expect(eventCalls[0]).toEqual({ type: 'insert', hasDatabase: true });

    // Check that cross-resource operation worked
    const stat = await stats.get('user-created-user1');
    expect(stat).toBeDefined();
    expect(stat.count).toBe(1);
  });

  it('should bind this.database to update event listeners', async () => {
    // First create the user
    await users.insert({
      id: 'user1',
      name: 'John Doe',
      email: 'john@example.com'
    });

    // Wait for insert event
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clear event calls from insert
    eventCalls = [];

    // Now update the user (triggers update event)
    await users.update('user1', { name: 'Jane Doe' });

    // Wait for update event to fire
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check that update event was called
    expect(eventCalls.some(c => c.type === 'update')).toBe(true);
  });

  it('should allow multiple events to access this.database', async () => {
    // Insert triggers insert event
    await users.insert({
      id: 'user2',
      name: 'Alice',
      email: 'alice@example.com'
    });

    // Wait for insert event
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify insert event was triggered
    expect(eventCalls.length).toBe(1);
    expect(eventCalls[0].type).toBe('insert');

    // Update triggers update event
    await users.update('user2', { name: 'Alice Updated' });

    // Wait for update event
    await new Promise(resolve => setTimeout(resolve, 100));

    // Both events should have been triggered
    expect(eventCalls.length).toBe(2);
    expect(eventCalls[0].type).toBe('insert');
    expect(eventCalls[1].type).toBe('update');
    expect(eventCalls.every(c => c.hasDatabase)).toBe(true);
  });

  it('should work with hooks AND events both accessing this.database', async () => {
    let hookCalled = false;

    // Create resource with both hooks and events
    const posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        userId: 'string|required'
      },
      hooks: {
        afterInsert: [
          async function(data) {
            hookCalled = true;
            // Hook should have this.database
            expect(this.database).toBeDefined();
            expect(this.database.resources).toBeDefined();
            return data;
          }
        ]
      },
      events: {
        insert: [
          async function(data) {
            // Event should ALSO have this.database
            expect(this.database).toBeDefined();
            expect(this.database.resources).toBeDefined();

            // Cross-resource operation
            await this.database.resources.stats.insert({
              id: `post-created-${data.id}`,
              count: 1
            });
          }
        ]
      }
    });

    await posts.insert({
      id: 'post1',
      title: 'Test Post',
      userId: 'user1'
    });

    // Wait for event
    await new Promise(resolve => setTimeout(resolve, 100));

    // Both hook and event should have been called
    expect(hookCalled).toBe(true);

    // Check cross-resource operation from event
    const stat = await stats.get('post-created-post1');
    expect(stat).toBeDefined();
  });
});
