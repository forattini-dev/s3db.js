import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import S3DB from '../src/index.js';

describe('Secret Password Generation Tests', () => {
  let db;
  let users;
  const testPrefix = `test-${Date.now()}`;

  beforeEach(async () => {
    db = new S3DB({
      verbose: false,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`,
      passphrase: 'test-secret-passphrase-123'
    });

    await db.connect();

    users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional',
        password: 'secret|required',
        apiKey: 'secret|optional'
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    try {
      const allUsers = await users.list({ limit: 100 });
      if (allUsers.length > 0) {
        const ids = allUsers.map(user => user.id);
        await users.deleteMany(ids);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should auto-generate password when not provided', async () => {
    const user = await users.insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    });

    expect(user.password).toBeDefined();
    expect(user.password).toHaveLength(12);
    expect(user.password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{12}$/);
    expect(user.apiKey).toBeDefined();
    expect(user.apiKey).toHaveLength(12);
  });

  test('should use custom password when provided', async () => {
    const customPassword = 'my-custom-password-123';
    const user = await users.insert({
      name: 'Jane Smith',
      email: 'jane@example.com',
      age: 25,
      password: customPassword
    });

    expect(user.password).toBe(customPassword);
    expect(user.apiKey).toBeDefined(); // Should still auto-generate
    expect(user.apiKey).toHaveLength(12);
  });

  test('should auto-generate multiple secret fields', async () => {
    const user = await users.insert({
      name: 'Bob Wilson',
      email: 'bob@example.com'
    });

    expect(user.password).toBeDefined();
    expect(user.password).toHaveLength(12);
    expect(user.apiKey).toBeDefined();
    expect(user.apiKey).toHaveLength(12);
    expect(user.password).not.toBe(user.apiKey); // Should be different
  });

  test('should preserve custom values for all secret fields', async () => {
    const customPassword = 'custom-pass-456';
    const customApiKey = 'custom-api-key-789';
    
    const user = await users.insert({
      name: 'Alice Johnson',
      email: 'alice@example.com',
      password: customPassword,
      apiKey: customApiKey
    });

    expect(user.password).toBe(customPassword);
    expect(user.apiKey).toBe(customApiKey);
  });

  test('should encrypt and decrypt passwords correctly', async () => {
    const user = await users.insert({
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      age: 28
    });

    // Retrieve the user to verify encryption/decryption
    const retrievedUser = await users.get(user.id);

    expect(retrievedUser.password).toBe(user.password);
    expect(retrievedUser.apiKey).toBe(user.apiKey);
    expect(retrievedUser.password).toHaveLength(12);
    expect(retrievedUser.apiKey).toHaveLength(12);
  });

  test('should handle updates with new passwords', async () => {
    const user = await users.insert({
      name: 'David Wilson',
      email: 'david@example.com'
    });

    const newPassword = 'updated-password-999';
    const updatedUser = await users.update(user.id, {
      password: newPassword
    });

    expect(updatedUser.password).toBe(newPassword);
    expect(updatedUser.apiKey).toBe(user.apiKey); // Should remain the same
  });

  test('should generate different passwords for different users', async () => {
    const user1 = await users.insert({
      name: 'User 1',
      email: 'user1@example.com'
    });

    const user2 = await users.insert({
      name: 'User 2',
      email: 'user2@example.com'
    });

    expect(user1.password).not.toBe(user2.password);
    expect(user1.apiKey).not.toBe(user2.apiKey);
  });

  test('should work with list operations', async () => {
    await users.insert({
      name: 'List User 1',
      email: 'list1@example.com'
    });

    await users.insert({
      name: 'List User 2',
      email: 'list2@example.com'
    });

    const allUsers = await users.list({ limit: 10 });

    expect(allUsers.length).toBeGreaterThanOrEqual(2);
    allUsers.forEach(user => {
      expect(user.password).toBeDefined();
      expect(user.password).toHaveLength(12);
      expect(user.apiKey).toBeDefined();
      expect(user.apiKey).toHaveLength(12);
    });
  });

  test('should work with getMany operations', async () => {
    const user1 = await users.insert({
      name: 'Many User 1',
      email: 'many1@example.com'
    });

    const user2 = await users.insert({
      name: 'Many User 2',
      email: 'many2@example.com'
    });

    const retrievedUsers = await users.getMany([user1.id, user2.id]);

    expect(retrievedUsers).toHaveLength(2);
    retrievedUsers.forEach(user => {
      expect(user.password).toBeDefined();
      expect(user.password).toHaveLength(12);
      expect(user.apiKey).toBeDefined();
      expect(user.apiKey).toHaveLength(12);
    });
  });
}); 