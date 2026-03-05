import { createDatabaseForTest } from '#tests/config.js';
import { verifyPassword } from '#src/concerns/password-hashing.js';

describe('Resource - Password Type with bcrypt hashing', () => {
  let database;
  let usersResource;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=resources/password-type', {
      security: { bcrypt: { rounds: 12 } }
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

  test('should auto-hash password on insert with compact bcrypt format', async () => {
    const plainPassword = 'MySecurePassword123';

    const user = await usersResource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: plainPassword
    });

    expect(user.password).not.toBe(plainPassword);
    // b62(12) = "c", compact = $c$<53 saltHash> = 56 chars
    expect(user.password).toMatch(/^\$c\$.{53}$/);
    expect(user.password.length).toBe(56);
  });

  test('should verify password with verifyPassword() helper', async () => {
    const plainPassword = 'MySecurePassword123';

    const user = await usersResource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: plainPassword
    });

    const isValid = await verifyPassword(plainPassword, user.password);
    expect(isValid).toBe(true);

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

    const updated = await usersResource.update(user.id, {
      password: 'NewPassword456'
    });

    expect(updated.password).not.toBe('NewPassword456');
    expect(updated.password).not.toBe(oldHash);
    expect(updated.password).toMatch(/^\$c\$/);

    const oldWorks = await verifyPassword('OldPassword123', updated.password);
    expect(oldWorks).toBe(false);

    const newWorks = await verifyPassword('NewPassword456', updated.password);
    expect(newWorks).toBe(true);
  });

  test('should enforce password constraints (min length)', async () => {
    await expect(
      usersResource.insert({
        email: 'test@example.com',
        name: 'Test User',
        password: 'short'
      })
    ).rejects.toThrow();
  });

  test('should handle different bcrypt rounds', async () => {
    const dbWithHigherRounds = createDatabaseForTest('suite=resources/password-type-rounds', {
      security: { bcrypt: { rounds: 14 } }
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

    // b62(14) = "e"
    expect(user.password).toMatch(/^\$e\$.{53}$/);
    expect(user.password).not.toBe(plainPassword);

    const isValid = await verifyPassword(plainPassword, user.password);
    expect(isValid).toBe(true);

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

    expect(account.password).not.toBe('MainPassword123');
    expect(account.recoveryPassword).not.toBe('RecoveryPassword456!');

    expect(account.password).toMatch(/^\$c\$/);
    expect(account.recoveryPassword).toMatch(/^\$c\$/);

    expect(await verifyPassword('MainPassword123', account.password)).toBe(true);
    expect(await verifyPassword('RecoveryPassword456!', account.recoveryPassword)).toBe(true);
  });

  test('should work with patch() method', async () => {
    const user = await usersResource.insert({
      email: 'test@example.com',
      name: 'Test User',
      password: 'OldPassword123'
    });

    const patched = await usersResource.patch(user.id, {
      password: 'NewPatchedPassword456'
    });

    expect(patched.password).not.toBe('NewPatchedPassword456');
    expect(patched.password).toMatch(/^\$c\$/);

    const isValid = await verifyPassword('NewPatchedPassword456', patched.password);
    expect(isValid).toBe(true);
  });

  test('should differentiate between password and secret types', async () => {
    const dbWithPassphrase = createDatabaseForTest('suite=resources/password-secret-types', {
      security: { passphrase: 'test-encryption-key', bcrypt: { rounds: 12 } }
    });

    const resource = await dbWithPassphrase.createResource({
      name: 'accounts_with_both',
      attributes: {
        email: 'string|required',
        password: 'password|required',
        apiKey: 'secret|required'
      },
      autoDecrypt: false
    });

    const account = await resource.insert({
      email: 'test@example.com',
      password: 'UserPassword123',
      apiKey: 'sk-1234567890'
    });

    expect(account.password).toMatch(/^\$c\$/);
    expect(account.password.length).toBe(56);

    expect(account.apiKey).not.toBe('sk-1234567890');
    expect(account.apiKey.length).not.toBe(56);

    expect(await verifyPassword('UserPassword123', account.password)).toBe(true);
    expect(await verifyPassword('WrongPassword', account.password)).toBe(false);

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
      bio: 'A'.repeat(3000)
    });

    expect(user.password).not.toBe('SecurePassword123');
    expect(user.password).toMatch(/^\$c\$/);

    const isValid = await verifyPassword('SecurePassword123', user.password);
    expect(isValid).toBe(true);
  });

  test('should not rehash existing password and not re-encrypt existing secret on update()', async () => {
    const dbWithPassphrase = createDatabaseForTest('suite=resources/password-secret-patch-update', {
      security: {
        passphrase: 'test-passphrase',
        bcrypt: { rounds: 12 }
      }
    });

    const secureResource = await dbWithPassphrase.createResource({
      name: 'accounts_with_secret',
      attributes: {
        email: 'string|required|email',
        password: 'password|required|min:8',
        apiKey: 'secret|required'
      },
      autoDecrypt: false
    });

    const seed = await secureResource.insert({
      email: 'secret@example.com',
      password: 'OriginalPassword123',
      apiKey: 'api-secret-key-123'
    });

    const beforeUpdate = await secureResource.get(seed.id);
    const updated = await secureResource.update(seed.id, {
      email: 'updated@example.com'
    });

    expect(updated.password).toBe(beforeUpdate.password);
    expect(updated.apiKey).toBe(beforeUpdate.apiKey);
    expect(await verifyPassword('OriginalPassword123', updated.password)).toBe(true);

    await dbWithPassphrase.disconnect();
  });

  test('should not rehash existing password and re-encrypt existing secret on patch()', async () => {
    const dbWithPassphrase = createDatabaseForTest('suite=resources/password-secret-patch-update', {
      security: {
        passphrase: 'test-passphrase',
        bcrypt: { rounds: 12 }
      }
    });

    const secureResource = await dbWithPassphrase.createResource({
      name: 'accounts_with_secret',
      attributes: {
        email: 'string|required|email',
        password: 'password|required|min:8',
        apiKey: 'secret|required'
      },
      autoDecrypt: false
    });

    const seed = await secureResource.insert({
      email: 'secret@example.com',
      password: 'OriginalPassword123',
      apiKey: 'api-secret-key-123'
    });

    const beforePatch = await secureResource.get(seed.id);
    const afterPatch = await secureResource.patch(seed.id, {
      email: 'patched@example.com'
    });

    expect(afterPatch.password).toBe(beforePatch.password);
    expect(afterPatch.apiKey).toBe(beforePatch.apiKey);
    expect(await verifyPassword('OriginalPassword123', afterPatch.password)).toBe(true);

    await dbWithPassphrase.disconnect();
  });

  test('should keep stored secret and password stable on patch() with autoDecrypt enabled', async () => {
    const dbWithPassphrase = createDatabaseForTest('suite=resources-password-secret-autodecrypt-patch', {
      security: {
        passphrase: 'test-passphrase',
        bcrypt: { rounds: 12 }
      }
    });

    const secureResource = await dbWithPassphrase.createResource({
      name: 'accounts_with_secret',
      attributes: {
        email: 'string|required|email',
        password: 'password|required|min:8',
        apiKey: 'secret|required'
      },
      behavior: 'body-overflow',
      timestamps: true
    });

    const seed = await secureResource.insert({
      email: 'secret@example.com',
      password: 'OriginalPassword123',
      apiKey: 'api-secret-key-123'
    });

    const resourceSchema = secureResource.schema as Record<string, any>;
    const mappedPasswordField = (resourceSchema.map?.password as string | undefined) || 'password';
    const mappedSecretField = (resourceSchema.map?.apiKey as string | undefined) || 'apiKey';
    const resourceKey = secureResource.getResourceKey(seed.id);

    const beforeMetadata = await dbWithPassphrase.client.headObject(resourceKey);
    const beforePassword = beforeMetadata.Metadata?.[mappedPasswordField];
    const beforeSecret = beforeMetadata.Metadata?.[mappedSecretField];

    expect(beforePassword).toBeDefined();
    expect(beforeSecret).toBeDefined();

    await secureResource.patch(seed.id, {
      email: 'patched@example.com'
    });

    const afterMetadata = await dbWithPassphrase.client.headObject(resourceKey);
    const afterPassword = afterMetadata.Metadata?.[mappedPasswordField];
    const afterSecret = afterMetadata.Metadata?.[mappedSecretField];

    expect(afterPassword).toBe(beforePassword);
    expect(afterSecret).toBe(beforeSecret);

    const afterRecord = await secureResource.get(seed.id);
    expect(afterRecord.email).toBe('patched@example.com');
    expect(await verifyPassword('OriginalPassword123', afterRecord.password)).toBe(true);

    await dbWithPassphrase.disconnect();
  });

  test('should not rehash/re-encrypt when update or patch payload includes stored password and secret', async () => {
    const dbWithPassphrase = createDatabaseForTest('suite=resources/password-secret-update-stored-values', {
      security: {
        passphrase: 'test-passphrase',
        bcrypt: { rounds: 12 }
      }
    });

    const secureResource = await dbWithPassphrase.createResource({
      name: 'accounts_with_secret',
      attributes: {
        email: 'string|required|email',
        password: 'password|required|min:8',
        apiKey: 'secret|required'
      },
      autoDecrypt: false
    });

    const seed = await secureResource.insert({
      email: 'secret@example.com',
      password: 'OriginalPassword123',
      apiKey: 'api-secret-key-123'
    });

    const current = await secureResource.get(seed.id);

    const updatedWithStored = await secureResource.update(seed.id, {
      ...current,
      email: 'with-stored-values@example.com'
    });

    expect(updatedWithStored.password).toBe(current.password);
    expect(updatedWithStored.apiKey).toBe(current.apiKey);
    expect(await verifyPassword('OriginalPassword123', updatedWithStored.password)).toBe(true);

    const patchedWithStored = await secureResource.patch(seed.id, {
      ...current,
      email: 'with-stored-values-patch@example.com'
    });

    expect(patchedWithStored.password).toBe(current.password);
    expect(patchedWithStored.apiKey).toBe(current.apiKey);
    expect(await verifyPassword('OriginalPassword123', patchedWithStored.password)).toBe(true);

    await dbWithPassphrase.disconnect();
  });
});
