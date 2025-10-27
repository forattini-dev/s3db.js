# S3DB Password & Secret Types

## TL;DR

**S3DB has TWO native types for sensitive data:**

- **`password` type** - Use for **user passwords** (bcrypt one-way hashing, irreversible)
- **`secret` type** - Use for **API keys, tokens** (AES-256-GCM encryption, reversible)

**NEVER use `secret` type for user passwords!** Passwords should never be decryptable.

## Comparison

| Feature | `password` Type (Bcrypt) | `secret` Type (AES-256-GCM) |
|---------|-------------------------|----------------------------|
| **Use Case** | **User passwords ONLY** | API keys, tokens, reversible secrets |
| **Algorithm** | bcrypt (adaptive hashing) | AES-256-GCM (encryption) |
| **Reversible** | ❌ No (one-way hash) | ✅ Yes (can decrypt) |
| **Auto-hash/encrypt** | ✅ Yes (on insert/update) | ✅ Yes (on insert/update) |
| **Auto-decrypt** | ❌ No (use `verifyPassword()`) | ✅ Yes (on get/query) |
| **Storage** | Compacted bcrypt hash (53 bytes) | Encrypted Base64 (~72 chars) |
| **Configuration** | `bcryptRounds` (default: 10) | `passphrase` (required) |
| **Performance** | ~100-400ms (rounds 10-12) | ~50ms encrypt/decrypt |
| **Security** | Industry standard for passwords | Industry standard for reversible secrets |
| **Dependencies** | Built into S3DB | Zero - built into S3DB |

## Password Type (Bcrypt Hashing)

### How It Works

```javascript
import S3db, { verifyPassword } from 's3db.js';

const db = new S3db({
  connectionString: 'http://minioadmin:minioadmin123@localhost:9100/mydb',
  bcryptRounds: 10  // Optional: default is 10 (higher = slower but more secure)
});

await db.connect();

// Create resource with 'password' type field
await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    password: 'password|required|min:8',  // Auto-hashed with bcrypt!
    role: 'string'
  },
  timestamps: true
});

// Insert - password auto-hashed
const user = await db.resources.users.insert({
  email: 'user@example.com',
  name: 'John Doe',
  password: 'MySecurePass123'  // Hashed automatically
});

// Password is stored as compacted bcrypt hash (53 bytes)
console.log(user.password);  // "saltsaltsalt...hash..." (NOT the original password)

// To verify a password, use verifyPassword()
const isValid = await verifyPassword('MySecurePass123', user.password);
console.log(isValid);  // true
```

### What Happens

1. **On INSERT/UPDATE**:
   - S3DB validates schema
   - `password` fields are hashed using bcrypt
   - Hash is compacted from 60 to 53 bytes (removes `$2b$10$` prefix)
   - Stores compacted hash in S3 metadata

2. **On GET/QUERY**:
   - S3DB retrieves hash from S3
   - Returns the hash as-is (NOT decrypted - it's one-way!)
   - Use `verifyPassword(plaintext, hash)` to verify

3. **Storage in S3**:
   ```
   X-Amz-Meta-0: user@example.com              (plaintext)
   X-Amz-Meta-1: John Doe                      (plaintext)
   X-Amz-Meta-2: saltsaltsalt...hash...        (BCRYPT HASH - 53 chars)
   ```

## Secret Type (AES-256-GCM Encryption)

### How It Works

```javascript
import S3db from 's3db.js';

const db = new S3db({
  connectionString: 'http://minioadmin:minioadmin123@localhost:9100/mydb',
  passphrase: 'my-super-secret-passphrase'  // Required for encryption
});

await db.connect();

// Create resource with 'secret' type field
await db.createResource({
  name: 'accounts',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    apiKey: 'secret|required',    // Auto-encrypts!
    refreshToken: 'secret',       // Also encrypted
    role: 'string'
  },
  timestamps: true
});

// Insert - apiKey auto-encrypted
const account = await db.resources.accounts.insert({
  email: 'user@example.com',
  name: 'John Doe',
  apiKey: 'sk_live_abc123xyz...'  // Encrypted automatically
});

// Get - apiKey auto-decrypted
const found = await db.resources.accounts.get(account.id);
console.log(found.apiKey);  // 'sk_live_abc123xyz...' (decrypted back to plaintext)
```

### What Happens

1. **On INSERT/UPDATE**:
   - S3DB validates schema
   - `secret` fields are encrypted using `encrypt(value, passphrase)`
   - Uses AES-256-GCM with PBKDF2 key derivation
   - Stores Base64-encoded encrypted value in S3 metadata

2. **On GET/QUERY**:
   - S3DB retrieves encrypted value from S3
   - `secret` fields are decrypted using `decrypt(encrypted, passphrase)`
   - Returns plaintext value for convenience

3. **Storage in S3**:
   ```
   X-Amz-Meta-0: user@example.com              (plaintext)
   X-Amz-Meta-1: John Doe                      (plaintext)
   X-Amz-Meta-2: bw/xfsmHniRWkuT5Fioi1CEK...  (ENCRYPTED - 72+ chars)
   X-Amz-Meta-3: admin                         (plaintext)
   ```

### Technical Details

**Encryption Function** (`src/concerns/crypto.js`):

```javascript
export async function encrypt(content, passphrase) {
  // 1. Generate random salt (16 bytes)
  // 2. Derive key using PBKDF2 (100k iterations, SHA-256)
  // 3. Generate random IV (12 bytes)
  // 4. Encrypt using AES-GCM (256-bit key)
  // 5. Return Base64: salt + IV + encrypted content
}
```

**Decryption Function** (`src/concerns/crypto.js`):

```javascript
export async function decrypt(encryptedBase64, passphrase) {
  // 1. Decode Base64
  // 2. Extract salt (first 16 bytes)
  // 3. Extract IV (next 12 bytes)
  // 4. Derive same key using PBKDF2
  // 5. Decrypt using AES-GCM
  // 6. Return plaintext
}
```

**Schema Type Alias** (`src/validator.class.js`):

```javascript
this.alias('secret', {
  type: "string",
  custom: this.autoEncrypt ? secretHandler : undefined,
  messages: {
    string: "The '{field}' field must be a string.",
    stringMin: "This secret '{field}' field length must be at least {expected} long.",
  },
})
```

## bcrypt Approach (External)

### How It Works

```javascript
import bcrypt from 'bcrypt';
import S3db from 's3db.js';

const db = new S3db({
  connectionString: 'http://minioadmin:minioadmin123@localhost:9100/mydb'
});

await db.connect();

await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    passwordHash: 'string|required',  // Manually handle bcrypt hash
    role: 'string'
  },
  timestamps: true
});

// Insert - manually hash with bcrypt
const passwordHash = await bcrypt.hash('senha123', 12);  // ~400ms
const user = await db.resources.users.insert({
  email: 'user@example.com',
  name: 'John Doe',
  passwordHash: passwordHash  // Store hash manually
});

// Login - manually compare
const found = await db.resources.users.query({ email: 'user@example.com' });
const valid = await bcrypt.compare('senha123', found[0].passwordHash);
```

### Problems

1. **External Dependency**: Requires `bcrypt` npm package
2. **Manual Management**: Must hash before insert, compare on login
3. **Password Only**: Cannot encrypt API keys, tokens, or other secrets
4. **No Auto-Decrypt**: Always get hash, never plaintext
5. **Slower**: 100-400ms per operation (by design)

## Password Verification

### With S3DB Native

```javascript
// Login
const users = await db.resources.users.query({ email: loginEmail });
if (users.length === 0) throw new Error('User not found');

// Auto-decrypted password
const valid = users[0].password === loginPassword;
```

**⚠️ Note**: S3DB auto-decrypts, so you compare plaintext. If you need bcrypt-style one-way hashing (where even the database admin can't see plaintext), disable auto-decrypt:

```javascript
await db.createResource({
  name: 'users',
  attributes: { ... },
  autoDecrypt: false  // Disable auto-decrypt
});

// Now you must manually decrypt or use a different verification method
```

### With bcrypt

```javascript
// Login
const users = await db.resources.users.query({ email: loginEmail });
if (users.length === 0) throw new Error('User not found');

// Manual comparison
const valid = await bcrypt.compare(loginPassword, users[0].passwordHash);
```

## Use Cases

### ✅ Use S3DB Native `secret` Type

- **Any secret data**: passwords, API keys, tokens, secrets
- **Integrated solution**: uses Node.js native crypto
- **Convenience**: auto-encrypt/decrypt
- **Performance**: fast enough for most use cases (~50ms)
- **Flexibility**: works for any secret field, not just passwords

### ❌ Don't Use bcrypt

- **External dependency**: adds `bcrypt` npm package
- **Manual work**: hash/compare manually
- **Limited**: passwords only
- **Slower**: 100-400ms per operation
- **Redundant**: S3DB has built-in encryption

### Maybe Use bcrypt

If you have regulatory/compliance requirements for **password-specific hashing** (like NIST SP 800-63B), bcrypt might be required. But for most applications, S3DB's native encryption is sufficient and better integrated.

## Migration from bcrypt to S3DB Native

### Step 1: Update Schema

**Before (bcrypt)**:
```javascript
await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    passwordHash: 'string|required',  // bcrypt hash
  }
});
```

**After (S3DB native)**:
```javascript
await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',  // Auto-encrypted
  }
});
```

### Step 2: Update Insert Logic

**Before (bcrypt)**:
```javascript
import bcrypt from 'bcrypt';

const passwordHash = await bcrypt.hash(plainPassword, 12);
await db.resources.users.insert({
  email,
  passwordHash
});
```

**After (S3DB native)**:
```javascript
// No bcrypt import needed!
await db.resources.users.insert({
  email,
  password: plainPassword  // Auto-encrypted
});
```

### Step 3: Update Login Logic

**Before (bcrypt)**:
```javascript
import bcrypt from 'bcrypt';

const users = await db.resources.users.query({ email: loginEmail });
if (users.length === 0) throw new Error('User not found');

const valid = await bcrypt.compare(loginPassword, users[0].passwordHash);
if (!valid) throw new Error('Invalid password');
```

**After (S3DB native)**:
```javascript
// No bcrypt import needed!
const users = await db.resources.users.query({ email: loginEmail });
if (users.length === 0) throw new Error('User not found');

const valid = users[0].password === loginPassword;  // Auto-decrypted
if (!valid) throw new Error('Invalid password');
```

### Step 4: Migrate Existing Data

If you have existing users with bcrypt hashes, you'll need to migrate them. This requires users to reset passwords:

```javascript
// On password reset/change
const users = await db.resources.users.query({ email: resetEmail });
if (users.length === 0) throw new Error('User not found');

// Update to use new encrypted field
await db.resources.users.update(users[0].id, {
  password: newPlainPassword,  // Auto-encrypted
  passwordHash: undefined      // Remove old bcrypt hash
});
```

Or, force all users to reset on next login:

```javascript
// Add migration flag to schema
await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret',           // New encrypted field
    passwordHash: 'string',       // Old bcrypt hash (temporary)
    needsMigration: 'boolean'     // Migration flag
  }
});

// On login
const users = await db.resources.users.query({ email: loginEmail });
if (users.length === 0) throw new Error('User not found');

// Check if needs migration
if (users[0].needsMigration) {
  // Verify old bcrypt hash
  const valid = await bcrypt.compare(loginPassword, users[0].passwordHash);
  if (!valid) throw new Error('Invalid password');

  // Migrate to new encrypted password
  await db.resources.users.update(users[0].id, {
    password: loginPassword,     // Auto-encrypted
    passwordHash: undefined,     // Remove old hash
    needsMigration: false
  });
}

// Normal login with new encrypted password
const valid = users[0].password === loginPassword;
```

## Security Considerations

### S3DB Native Encryption

- **Passphrase Security**: Store passphrase securely (env vars, secrets manager)
- **Passphrase Rotation**: Requires re-encrypting all secrets
- **At-Rest**: Encrypted in S3
- **In-Transit**: HTTPS for S3 connections
- **In-Memory**: Decrypted values in memory (same as bcrypt plaintext input)

### bcrypt

- **One-Way Hash**: Cannot decrypt (good for passwords)
- **Slow by Design**: 100-400ms (protects against brute force)
- **At-Rest**: Hashed in S3 (cannot reverse)
- **In-Transit**: HTTPS for S3 connections
- **In-Memory**: Plaintext password in memory during comparison

## Recommendations

1. **Default**: Use S3DB native `secret` type for all secrets
2. **Passphrase**: Store in environment variable or secrets manager
3. **Migration**: Migrate from bcrypt to native encryption
4. **Compliance**: Check if bcrypt-specific requirements exist
5. **Performance**: S3DB native is 2-8x faster than bcrypt

## Examples

- `demo-simple.js` - Basic demo of native encryption
- `docs/examples/e85-identity-whitelabel.js` - Identity Provider (currently uses bcrypt, needs migration)
- `tests/resource.test.js` - Tests for `secret` type encryption

## See Also

- [Crypto Implementation](../concerns/crypto.md) - Technical details
- [Validator](../validator.md) - Schema type aliases
- [Security Best Practices](./security-best-practices.md) - Production security
