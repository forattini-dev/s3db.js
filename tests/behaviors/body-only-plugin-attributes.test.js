/**
 * Body-Only Behavior with Plugin Attributes Test
 *
 * Tests that body-only behavior correctly stores and retrieves pluginMap
 * for backwards compatibility when plugins are added/removed.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';

describe('Body-Only Behavior - Plugin Attributes', () => {
  let database;
  let users;

  beforeEach(async () => {
    database = createDatabaseForTest('body-only-plugin-attrs-test');
    await database.connect();

    // Create resource with body-only behavior
    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional'
      },
      behavior: 'body-only',
      timestamps: false
    });
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should store and retrieve pluginMap in metadata', async () => {
    // Add plugin attributes
    users.addPluginAttribute('_status', 'string|optional', 'WorkflowPlugin');
    users.addPluginAttribute('_score', 'number|optional', 'RankingPlugin');

    // Insert record with plugin attributes
    await users.insert({
      id: 'u1',
      name: 'Alice',
      email: 'alice@test.com',
      age: 30,
      _status: 'active',
      _score: 95
    });

    // Get the raw S3 object to verify metadata
    const key = users.getResourceKey('u1');
    const s3Object = await database.client.headObject(key);

    // Verify metadata contains _pluginMap
    expect(s3Object.Metadata).toHaveProperty('_pluginmap');
    const storedPluginMap = JSON.parse(s3Object.Metadata._pluginmap);
    expect(storedPluginMap).toHaveProperty('_status');
    expect(storedPluginMap).toHaveProperty('_score');

    // Verify we can retrieve the data correctly
    const user = await users.get('u1');
    expect(user.name).toBe('Alice');
    expect(user._status).toBe('active');
    expect(user._score).toBe(95);
  });

  it('should handle backwards compatibility when plugin is removed', async () => {
    // Step 1: Add plugin and insert data
    users.addPluginAttribute('_hasEmbedding', 'boolean|optional', 'VectorPlugin');
    users.addPluginAttribute('_vectorDim', 'number|optional', 'VectorPlugin');

    await users.insert({
      id: 'u2',
      name: 'Bob',
      email: 'bob@test.com',
      age: 25,
      _hasEmbedding: true,
      _vectorDim: 1536
    });

    // Verify data is stored correctly
    let user = await users.get('u2');
    expect(user._hasEmbedding).toBe(true);
    expect(user._vectorDim).toBe(1536);

    // Step 2: Simulate plugin removal
    users.removePluginAttribute('_hasEmbedding', 'VectorPlugin');
    users.removePluginAttribute('_vectorDim', 'VectorPlugin');

    // Step 3: Should still be able to read old data (plugin attributes are preserved in stored _pluginMap)
    user = await users.get('u2');
    expect(user.name).toBe('Bob');
    expect(user.email).toBe('bob@test.com');
    expect(user.age).toBe(25);
    // Plugin attributes should be decoded using stored _pluginMap from metadata
    expect(user._hasEmbedding).toBe(true);
    expect(user._vectorDim).toBe(1536);
  });

  it('should handle updates with plugin attributes', async () => {
    users.addPluginAttribute('_status', 'string|optional', 'WorkflowPlugin');

    // Insert
    await users.insert({
      id: 'u3',
      name: 'Carol',
      email: 'carol@test.com',
      age: 35,
      _status: 'pending'
    });

    // Update
    await users.update('u3', {
      _status: 'approved'
    });

    // Verify
    const user = await users.get('u3');
    expect(user._status).toBe('approved');
    expect(user.name).toBe('Carol');
  });

  it('should not store _pluginMap if no plugin attributes exist', async () => {
    // Insert record without plugin attributes
    await users.insert({
      id: 'u4',
      name: 'Dave',
      email: 'dave@test.com',
      age: 40
    });

    // Get the raw S3 object to verify metadata
    const key = users.getResourceKey('u4');
    const s3Object = await database.client.headObject(key);

    // Verify metadata does NOT contain _pluginMap (no plugin attributes)
    expect(s3Object.Metadata._pluginmap).toBeUndefined();

    // Verify we can still retrieve the data correctly
    const user = await users.get('u4');
    expect(user.name).toBe('Dave');
    expect(user.email).toBe('dave@test.com');
    expect(user.age).toBe(40);
  });

  it('should handle mixed scenario: some records with plugin attrs, some without', async () => {
    // Insert record without plugin attributes
    await users.insert({
      id: 'u5',
      name: 'Eve',
      email: 'eve@test.com',
      age: 28
    });

    // Add plugin
    users.addPluginAttribute('_priority', 'number|optional', 'TaskPlugin');

    // Insert record with plugin attributes
    await users.insert({
      id: 'u6',
      name: 'Frank',
      email: 'frank@test.com',
      age: 32,
      _priority: 1
    });

    // Both records should be readable
    const user5 = await users.get('u5');
    expect(user5.name).toBe('Eve');
    expect(user5._priority).toBeUndefined(); // No plugin attribute

    const user6 = await users.get('u6');
    expect(user6.name).toBe('Frank');
    expect(user6._priority).toBe(1); // Has plugin attribute
  });
});
