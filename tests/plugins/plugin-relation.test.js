import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import RelationPlugin from '../../src/plugins/relation.plugin.js';
import {
  RelationConfigError,
  UnsupportedRelationTypeError,
  RelatedResourceNotFoundError,
  JunctionTableNotFoundError
} from '../../src/plugins/relation.errors.js';

describe('RelationPlugin - Basic Configuration', () => {
  test('should create RelationPlugin with valid config', () => {
    const plugin = new RelationPlugin({
      relations: {
        users: {
          profile: {
            type: 'hasOne',
            resource: 'profiles',
            foreignKey: 'userId'
          }
        }
      }
    });

    expect(plugin.relations.users).toBeDefined();
    expect(plugin.relations.users.profile.type).toBe('hasOne');
  });

  test('should throw error for unsupported relation type', () => {
    const plugin = new RelationPlugin({
      relations: {
        users: {
          invalid: {
            type: 'invalidType',
            resource: 'profiles',
            foreignKey: 'userId'
          }
        }
      }
    });

    expect(() => plugin._validateRelationsConfig()).toThrow(UnsupportedRelationTypeError);
  });

  test('should throw error when resource field is missing', () => {
    const plugin = new RelationPlugin({
      relations: {
        users: {
          profile: {
            type: 'hasOne',
            foreignKey: 'userId'
            // Missing 'resource' field
          }
        }
      }
    });

    expect(() => plugin._validateRelationsConfig()).toThrow(RelationConfigError);
  });

  test('should throw error when foreignKey is missing', () => {
    const plugin = new RelationPlugin({
      relations: {
        users: {
          profile: {
            type: 'hasOne',
            resource: 'profiles'
            // Missing 'foreignKey'
          }
        }
      }
    });

    expect(() => plugin._validateRelationsConfig()).toThrow(RelationConfigError);
  });

  test('should throw error for belongsToMany without through', () => {
    const plugin = new RelationPlugin({
      relations: {
        posts: {
          tags: {
            type: 'belongsToMany',
            resource: 'tags',
            foreignKey: 'postId',
            otherKey: 'tagId'
            // Missing 'through'
          }
        }
      }
    });

    expect(() => plugin._validateRelationsConfig()).toThrow(RelationConfigError);
  });
});

describe('RelationPlugin - hasOne Relations', () => {
  let database;
  let users;
  let profiles;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('relation-hasone');

    // Create users resource
    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required'
      }
    });

    // Create profiles resource
    profiles = await database.createResource({
      name: 'profiles',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        bio: 'string',
        avatar: 'string|optional'
      }
    });

    // Add RelationPlugin
    plugin = new RelationPlugin({
      verbose: true,  // Enable debug logging
      relations: {
        users: {
          profile: {
            type: 'hasOne',
            resource: 'profiles',
            foreignKey: 'userId',
            localKey: 'id'
          }
        }
      }
    });

    await database.usePlugin(plugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should load hasOne relation with eager loading', async () => {
    const user = await users.insert({ id: 'u1', name: 'John', email: 'john@test.com' });
    await profiles.insert({ id: 'p1', userId: 'u1', bio: 'Software Developer' });

    const result = await users.get('u1', { include: ['profile'] });

    expect(result).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(result.profile.userId).toBe('u1');
    expect(result.profile.bio).toBe('Software Developer');
  });

  test('should return null when hasOne relation not found', async () => {
    await users.insert({ id: 'u2', name: 'Jane', email: 'jane@test.com' });

    const result = await users.get('u2', { include: ['profile'] });

    expect(result).toBeDefined();
    expect(result.profile).toBeNull();
  });

  test('should handle multiple records with hasOne relation', async () => {
    await users.insert({ id: 'u1', name: 'John', email: 'john@test.com' });
    await users.insert({ id: 'u2', name: 'Jane', email: 'jane@test.com' });
    await profiles.insert({ id: 'p1', userId: 'u1', bio: 'Developer' });
    await profiles.insert({ id: 'p2', userId: 'u2', bio: 'Designer' });

    const results = await users.list({ include: ['profile'] });

    expect(results.length).toBe(2);
    expect(results[0].profile).toBeDefined();
    expect(results[0].profile.userId).toBe(results[0].id);
    expect(results[1].profile).toBeDefined();
    expect(results[1].profile.userId).toBe(results[1].id);
  });
});

describe('RelationPlugin - hasMany Relations', () => {
  let database;
  let users;
  let posts;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('relation-hasmany');

    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      }
    });

    posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        title: 'string|required',
        content: 'string'
      }
    });

    plugin = new RelationPlugin({
      relations: {
        users: {
          posts: {
            type: 'hasMany',
            resource: 'posts',
            foreignKey: 'userId',
            localKey: 'id'
          }
        }
      }
    });

    await database.usePlugin(plugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should load hasMany relation with eager loading', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await posts.insert({ id: 'p1', userId: 'u1', title: 'First Post', content: 'Hello' });
    await posts.insert({ id: 'p2', userId: 'u1', title: 'Second Post', content: 'World' });

    const result = await users.get('u1', { include: ['posts'] });

    expect(result).toBeDefined();
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.posts)).toBe(true);
    expect(result.posts.length).toBe(2);
    expect(result.posts[0].userId).toBe('u1');
    expect(result.posts[1].userId).toBe('u1');
  });

  test('should return empty array when hasMany relation not found', async () => {
    await users.insert({ id: 'u2', name: 'Jane' });

    const result = await users.get('u2', { include: ['posts'] });

    expect(result).toBeDefined();
    expect(result.posts).toBeDefined();
    expect(Array.isArray(result.posts)).toBe(true);
    expect(result.posts.length).toBe(0);
  });

  test('should handle multiple users with different post counts', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await users.insert({ id: 'u2', name: 'Jane' });
    await users.insert({ id: 'u3', name: 'Bob' });

    await posts.insert({ id: 'p1', userId: 'u1', title: 'Post 1', content: '' });
    await posts.insert({ id: 'p2', userId: 'u1', title: 'Post 2', content: '' });
    await posts.insert({ id: 'p3', userId: 'u2', title: 'Post 3', content: '' });

    const results = await users.list({ include: ['posts'] });

    expect(results.length).toBe(3);
    expect(results.find(u => u.id === 'u1').posts.length).toBe(2);
    expect(results.find(u => u.id === 'u2').posts.length).toBe(1);
    expect(results.find(u => u.id === 'u3').posts.length).toBe(0);
  });

  test('should track batch loading stats', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await posts.insert({ id: 'p1', userId: 'u1', title: 'Post 1', content: '' });

    const statsBefore = plugin.getStats();
    await users.get('u1', { include: ['posts'] });
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalRelationLoads).toBeGreaterThan(statsBefore.totalRelationLoads);
    expect(statsAfter.batchLoads).toBeGreaterThan(statsBefore.batchLoads);
  });
});

describe('RelationPlugin - belongsTo Relations', () => {
  let database;
  let users;
  let posts;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('relation-belongsto');

    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      }
    });

    posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        title: 'string|required'
      }
    });

    plugin = new RelationPlugin({
      relations: {
        posts: {
          author: {
            type: 'belongsTo',
            resource: 'users',
            foreignKey: 'userId',
            localKey: 'id'
          }
        }
      }
    });

    await database.usePlugin(plugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should load belongsTo relation with eager loading', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await posts.insert({ id: 'p1', userId: 'u1', title: 'My Post' });

    const result = await posts.get('p1', { include: ['author'] });

    expect(result).toBeDefined();
    expect(result.author).toBeDefined();
    expect(result.author.id).toBe('u1');
    expect(result.author.name).toBe('John');
  });

  test('should return null when parent not found', async () => {
    await posts.insert({ id: 'p2', userId: 'nonexistent', title: 'Orphan Post' });

    const result = await posts.get('p2', { include: ['author'] });

    expect(result).toBeDefined();
    expect(result.author).toBeNull();
  });

  test('should batch load parents for multiple records', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await users.insert({ id: 'u2', name: 'Jane' });

    await posts.insert({ id: 'p1', userId: 'u1', title: 'Post 1' });
    await posts.insert({ id: 'p2', userId: 'u2', title: 'Post 2' });
    await posts.insert({ id: 'p3', userId: 'u1', title: 'Post 3' });

    const results = await posts.list({ include: ['author'] });

    expect(results.length).toBe(3);

    // Find posts by ID (order may vary)
    const p1 = results.find(p => p.id === 'p1');
    const p2 = results.find(p => p.id === 'p2');
    const p3 = results.find(p => p.id === 'p3');

    expect(p1.author.id).toBe('u1');
    expect(p2.author.id).toBe('u2');
    expect(p3.author.id).toBe('u1');
  });
});

describe('RelationPlugin - belongsToMany Relations', () => {
  let database;
  let posts;
  let tags;
  let postTags;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('relation-belongstomany');

    posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        title: 'string|required'
      }
    });

    tags = await database.createResource({
      name: 'tags',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      }
    });

    postTags = await database.createResource({
      name: 'post_tags',
      attributes: {
        id: 'string|required',
        postId: 'string|required',
        tagId: 'string|required'
      }
    });

    plugin = new RelationPlugin({
      relations: {
        posts: {
          tags: {
            type: 'belongsToMany',
            resource: 'tags',
            through: 'post_tags',
            foreignKey: 'postId',
            otherKey: 'tagId',
            localKey: 'id'
          }
        }
      }
    });

    await database.usePlugin(plugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should load belongsToMany relation through junction table', async () => {
    await posts.insert({ id: 'p1', title: 'My Post' });
    await tags.insert({ id: 't1', name: 'JavaScript' });
    await tags.insert({ id: 't2', name: 'Node.js' });
    await postTags.insert({ id: 'pt1', postId: 'p1', tagId: 't1' });
    await postTags.insert({ id: 'pt2', postId: 'p1', tagId: 't2' });

    const result = await posts.get('p1', { include: ['tags'] });

    expect(result).toBeDefined();
    expect(result.tags).toBeDefined();
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags.length).toBe(2);
    expect(result.tags.map(t => t.name)).toContain('JavaScript');
    expect(result.tags.map(t => t.name)).toContain('Node.js');
  });

  test('should return empty array when no junction records exist', async () => {
    await posts.insert({ id: 'p2', title: 'Untagged Post' });

    const result = await posts.get('p2', { include: ['tags'] });

    expect(result).toBeDefined();
    expect(result.tags).toBeDefined();
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags.length).toBe(0);
  });

  test('should handle multiple posts with different tags', async () => {
    await posts.insert({ id: 'p1', title: 'Post 1' });
    await posts.insert({ id: 'p2', title: 'Post 2' });

    await tags.insert({ id: 't1', name: 'JavaScript' });
    await tags.insert({ id: 't2', name: 'Python' });
    await tags.insert({ id: 't3', name: 'Go' });

    await postTags.insert({ id: 'pt1', postId: 'p1', tagId: 't1' });
    await postTags.insert({ id: 'pt2', postId: 'p1', tagId: 't2' });
    await postTags.insert({ id: 'pt3', postId: 'p2', tagId: 't3' });

    const results = await posts.list({ include: ['tags'] });

    expect(results.length).toBe(2);

    const post1 = results.find(p => p.id === 'p1');
    const post2 = results.find(p => p.id === 'p2');

    expect(post1.tags.length).toBe(2);
    expect(post2.tags.length).toBe(1);
    expect(post1.tags.map(t => t.name)).toContain('JavaScript');
    expect(post1.tags.map(t => t.name)).toContain('Python');
    expect(post2.tags[0].name).toBe('Go');
  });
});

describe('RelationPlugin - Nested Includes', () => {
  let database;
  let users;
  let posts;
  let comments;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('relation-nested');

    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      }
    });

    posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        title: 'string|required'
      }
    });

    comments = await database.createResource({
      name: 'comments',
      attributes: {
        id: 'string|required',
        postId: 'string|required',
        authorId: 'string|required',
        content: 'string|required'
      }
    });

    plugin = new RelationPlugin({
      relations: {
        users: {
          posts: {
            type: 'hasMany',
            resource: 'posts',
            foreignKey: 'userId'
          }
        },
        posts: {
          author: {
            type: 'belongsTo',
            resource: 'users',
            foreignKey: 'userId'
          },
          comments: {
            type: 'hasMany',
            resource: 'comments',
            foreignKey: 'postId'
          }
        },
        comments: {
          author: {
            type: 'belongsTo',
            resource: 'users',
            foreignKey: 'authorId'
          }
        }
      }
    });

    await database.usePlugin(plugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should load nested relations (user -> posts -> comments)', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await posts.insert({ id: 'p1', userId: 'u1', title: 'Post 1' });
    await comments.insert({ id: 'c1', postId: 'p1', authorId: 'u1', content: 'Great!' });

    const result = await users.get('u1', {
      include: {
        posts: {
          include: ['comments']
        }
      }
    });

    expect(result).toBeDefined();
    expect(result.posts).toBeDefined();
    expect(result.posts.length).toBe(1);
    expect(result.posts[0].comments).toBeDefined();
    expect(result.posts[0].comments.length).toBe(1);
    expect(result.posts[0].comments[0].content).toBe('Great!');
  });

  test('should handle deep nested includes', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await users.insert({ id: 'u2', name: 'Jane' });
    await posts.insert({ id: 'p1', userId: 'u1', title: 'Post 1' });
    await comments.insert({ id: 'c1', postId: 'p1', authorId: 'u2', content: 'Nice!' });

    const result = await users.get('u1', {
      include: {
        posts: {
          include: {
            comments: {
              include: ['author']
            }
          }
        }
      }
    });

    expect(result.posts[0].comments[0].author).toBeDefined();
    expect(result.posts[0].comments[0].author.name).toBe('Jane');
  });
});

describe('RelationPlugin - Cascade Delete', () => {
  let database;
  let users;
  let posts;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('relation-cascade-delete');

    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      }
    });

    posts = await database.createResource({
      name: 'posts',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        title: 'string|required'
      }
    });

    plugin = new RelationPlugin({
      relations: {
        users: {
          posts: {
            type: 'hasMany',
            resource: 'posts',
            foreignKey: 'userId',
            cascade: ['delete']
          }
        }
      }
    });

    await database.usePlugin(plugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should cascade delete related records', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await posts.insert({ id: 'p1', userId: 'u1', title: 'Post 1' });
    await posts.insert({ id: 'p2', userId: 'u1', title: 'Post 2' });

    const postsBefore = await posts.query({ userId: 'u1' });
    expect(postsBefore.length).toBe(2);

    // Delete user (should cascade delete posts)
    await users.delete('u1');

    const postsAfter = await posts.query({ userId: 'u1' });
    expect(postsAfter.length).toBe(0);
  });

  test('should track cascade operation stats', async () => {
    await users.insert({ id: 'u1', name: 'John' });
    await posts.insert({ id: 'p1', userId: 'u1', title: 'Post 1' });

    const statsBefore = plugin.getStats();
    await users.delete('u1');
    const statsAfter = plugin.getStats();

    expect(statsAfter.cascadeOperations).toBeGreaterThan(statsBefore.cascadeOperations);
  });
});

describe('RelationPlugin - Statistics', () => {
  test('should return plugin statistics', () => {
    const plugin = new RelationPlugin({
      relations: {
        users: {
          posts: {
            type: 'hasMany',
            resource: 'posts',
            foreignKey: 'userId'
          },
          profile: {
            type: 'hasOne',
            resource: 'profiles',
            foreignKey: 'userId'
          }
        },
        posts: {
          author: {
            type: 'belongsTo',
            resource: 'users',
            foreignKey: 'userId'
          }
        }
      }
    });

    const stats = plugin.getStats();

    expect(stats.configuredResources).toBe(2);
    expect(stats.totalRelations).toBe(3);
    expect(stats.totalRelationLoads).toBe(0);
    expect(stats.cascadeOperations).toBe(0);
  });
});
