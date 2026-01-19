import { createDatabaseForTest } from '#tests/config.js';
import { verifyPassword } from '#src/concerns/password-hashing.js';

describe('Resource - Password Type with bcrypt hashing', () => {
  let database;
  let usersResource;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=resources/password-type', {
      bcryptRounds: 4 // Low rounds for fast tests
    });

    usersResource = await database.createResource({
      name: 'users',
      attributes: {
        email: 'string|required|email',
        name: 'string|required',
        password: 'password|required|min:8'
      }
    });

    try {
      await usersResource.deleteAll({ paranoid: false });
    } catch (error) {}
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  test('should auto-hash password on insert with compacted bcrypt (60→53 bytes)', async () => {
    const plainPassword = 'MySecurePassword123';

    const user = await usersResource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: plainPassword
    });

    // Password should be hashed
    expect(user.password).not.toBe(plainPassword);

    // Bcrypt hash should be compacted (53 bytes instead of 60)
    expect(user.password.length).toBe(53);

    // Should not start with $ (compacted format)
    expect(user.password.startsWith('$')).toBe(false);
  });

  test('should verify password with verifyPassword() helper', async () => {
    const plainPassword = 'MySecurePassword123';

    const user = await usersResource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: plainPassword
    });

    // Correct password should verify
    const isValid = await verifyPassword(plainPassword, user.password);
    expect(isValid).toBe(true);

    // Wrong password should fail
    const isInvalid = await verifyPassword('WrongPassword', user.password);
    expect(isInvalid).toBe(false);
  });

  test('should auto-hash password on update', async () => {
    const user = await usersResource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: 'OldPassword123'
    });

    const oldHash = user.password;

    // Update password
    const updated = await usersResource.update(user.id, {
      password: 'NewPassword456'
    });

    // Password should be re-hashed
    expect(updated.password).not.toBe('NewPassword456');
    expect(updated.password).not.toBe(oldHash);
    expect(updated.password.length).toBe(53);

    // Old password should not work
    const oldWorks = await verifyPassword('OldPassword123', updated.password);
    expect(oldWorks).toBe(false);

    // New password should work
    const newWorks = await verifyPassword('NewPassword456', updated.password);
    expect(newWorks).toBe(true);
  });

  test('should enforce password constraints (min length)', async () => {
    await expect(
      usersResource.insert({
        email: 'test@example.com',
        name: 'Test User',
        password: 'short'  // Less than 8 characters
      })
    ).rejects.toThrow();
  });

  test('should handle different bcrypt rounds', async () => {
    // Create database with different bcrypt rounds
    const dbWithHigherRounds = createDatabaseForTest('suite=resources/password-type-rounds', {
      bcryptRounds: 12
    });

    const resource = await dbWithHigherRounds.createResource({
      name: 'users',
      attributes: {
        email: 'string|required',
        password: 'password|required'
      }
    });

    const plainPassword = 'MyPassword123';
    const user = await resource.insert({
      email: 'test@example.com',
      password: plainPassword
    });

    // Should still be 53 bytes (compacted)
    expect(user.password.length).toBe(53);
    expect(user.password).not.toBe(plainPassword);

    // Password should be hashed
    expect(user.password.startsWith('$')).toBe(false); // Compacted format

    // Note: verifyPassword() with bcrypt.compare() works regardless of rounds
    // The rounds are encoded in the hash itself, so verification is automatic

    await dbWithHigherRounds.disconnect();
  });

  test('should work with multiple password fields', async () => {
    const resource = await database.createResource({
      name: 'secure_accounts',
      attributes: {
        email: 'string|required',
        password: 'password|required|min:8',
        recoveryPassword: 'password|required|min:12'
      }
    });

    const account = await resource.insert({
      email: 'secure@example.com',
      password: 'MainPassword123',
      recoveryPassword: 'RecoveryPassword456!'
    });

    // Both passwords should be hashed
    expect(account.password).not.toBe('MainPassword123');
    expect(account.recoveryPassword).not.toBe('RecoveryPassword456!');

    // Both should be 53 bytes
    expect(account.password.length).toBe(53);
    expect(account.recoveryPassword.length).toBe(53);

    // Both should verify correctly
    const mainValid = await verifyPassword('MainPassword123', account.password);
    const recoveryValid = await verifyPassword('RecoveryPassword456!', account.recoveryPassword);

    expect(mainValid).toBe(true);
    expect(recoveryValid).toBe(true);
  });

  test('should work with patch() method', async () => {
    const user = await usersResource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: 'OldPassword123'
    });

    // Patch only the password
    const patched = await usersResource.patch(user.id, {
      password: 'NewPatchedPassword456'
    });

    // Password should be hashed
    expect(patched.password).not.toBe('NewPatchedPassword456');
    expect(patched.password.length).toBe(53);

    // Should verify
    const isValid = await verifyPassword('NewPatchedPassword456', patched.password);
    expect(isValid).toBe(true);
  });

  test('should differentiate between password and secret types', async () => {
    // Create database with passphrase for secret type and autoDecrypt disabled
    const dbWithPassphrase = createDatabaseForTest('suite=resources/password-secret-types', {
      bcryptRounds: 10,
      passphrase: 'test-encryption-key'
    });

    const resource = await dbWithPassphrase.createResource({
      name: 'accounts_with_both',
      attributes: {
        email: 'string|required',
        password: 'password|required',      // One-way hash (bcrypt)
        apiKey: 'secret|required'            // Reversible encryption (AES)
      },
      autoDecrypt: false  // Disable auto-decrypt to see encrypted value
    });

    const account = await resource.insert({
      email: 'test@example.com',
      password: 'UserPassword123',
      apiKey: 'sk-1234567890'
    });

    // Password: bcrypt hash (53 bytes, compacted)
    expect(account.password.length).toBe(53);
    expect(account.password.startsWith('$')).toBe(false);

    // API Key: AES encrypted (should be encrypted, not plaintext)
    expect(account.apiKey).not.toBe('sk-1234567890');
    // AES encryption produces different length than bcrypt hash
    expect(account.apiKey.length).not.toBe(53);

    // Password verification works (one-way)
    const passwordValid = await verifyPassword('UserPassword123', account.password);
    expect(passwordValid).toBe(true);

    // Wrong password fails
    const passwordInvalid = await verifyPassword('WrongPassword', account.password);
    expect(passwordInvalid).toBe(false);

    // Secret type cannot be verified like password (it's reversibly encrypted)
    // To verify a secret, you'd need to decrypt it first

    await dbWithPassphrase.disconnect();
  });

  test('should work with body-overflow behavior', async () => {
    const resource = await database.createResource({
      name: 'users_with_overflow',
      attributes: {
        email: 'string|required',
        name: 'string|required',
        password: 'password|required',
        bio: 'string|optional'
      },
      behavior: 'body-overflow'
    });

    const user = await resource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: 'SecurePassword123',
      bio: 'A'.repeat(3000)  // Force body overflow
    });

    // Password should still be hashed
    expect(user.password).not.toBe('SecurePassword123');
    expect(user.password.length).toBe(53);

    // Verification should work
    const isValid = await verifyPassword('SecurePassword123', user.password);
    expect(isValid).toBe(true);
  });
});
