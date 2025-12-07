# Encryption

s3db.js provides field-level encryption using AES-256-GCM for sensitive data protection.

## Quick Start

```javascript
const db = new Database({
  connectionString: '...',
  passphrase: 'your-secret-passphrase-min-16-chars'  // Encryption key
});

const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    password: 'secret|required',     // Encrypted at rest
    apiToken: 'secret|optional'      // Encrypted at rest
  }
});

// Data is encrypted automatically
await users.insert({
  email: 'alice@example.com',
  password: 'myPassword123',
  apiToken: 'sk_live_abc123'
});

// Data is decrypted automatically on read
const user = await users.get('user123');
console.log(user.password);  // "myPassword123" (decrypted)
```

## The `secret` Field Type

Use `secret` type for any sensitive data:

```javascript
attributes: {
  password: 'secret|required',
  apiKey: 'secret|optional',
  ssn: 'secret|required',
  creditCard: 'secret|optional'
}
```

**How it works:**
1. On write: Value is encrypted with AES-256-GCM before storage
2. On read: Value is decrypted automatically
3. In S3: Stored as Base64-encoded ciphertext

## Encryption Algorithm

s3db.js uses industry-standard encryption:

| Component | Algorithm |
|-----------|-----------|
| Cipher | AES-256-GCM |
| Key Derivation | PBKDF2 with SHA-256 |
| Iterations | 100,000 |
| Salt | 16 bytes (random per value) |
| IV | 12 bytes (random per value) |
| Output | Base64 encoded |

## Passphrase Configuration

### Database Level (Recommended)

```javascript
const db = new Database({
  connectionString: '...',
  passphrase: process.env.ENCRYPTION_KEY
});
```

### Resource Level Override

```javascript
const sensitiveResource = await db.createResource({
  name: 'secrets',
  attributes: { ... },
  passphrase: 'different-key-for-this-resource'
});
```

## Auto-Decryption

By default, secret fields are auto-decrypted on read:

```javascript
const user = await users.get('user123');
console.log(user.password);  // Plaintext value
```

### Disable Auto-Decryption

For performance or security, disable auto-decryption:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { password: 'secret' },
  autoDecrypt: false  // Keep values encrypted on read
});

const user = await users.get('user123');
console.log(user.password);  // Base64 ciphertext
```

## Crypto Functions

Direct access to encryption utilities:

```javascript
import { encrypt, decrypt, sha256, md5 } from 's3db.js/concerns/crypto';

// Encrypt
const ciphertext = await encrypt('sensitive data', 'passphrase');

// Decrypt
const plaintext = await decrypt(ciphertext, 'passphrase');

// Hash
const hash = await sha256('data to hash');
const checksum = await md5('data');  // Node.js only
```

## Password Hashing (bcrypt)

For password verification, use bcrypt instead of encryption:

```javascript
import bcrypt from 'bcrypt';

const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    passwordHash: 'string|required'  // Store hash, not encrypted password
  }
});

// On registration
const hash = await bcrypt.hash('userPassword', db.bcryptRounds);
await users.insert({ email: 'user@example.com', passwordHash: hash });

// On login
const user = await users.get(userId);
const valid = await bcrypt.compare('inputPassword', user.passwordHash);
```

**When to use what:**
- `secret` type: Retrievable data (API keys, tokens, SSN)
- bcrypt hash: Non-retrievable data (passwords)

## Security Best Practices

### DO

```javascript
// Use environment variables for passphrase
passphrase: process.env.ENCRYPTION_KEY

// Use strong passphrases (16+ characters)
passphrase: 'a-very-long-and-random-passphrase-here'

// Rotate keys periodically
// (requires re-encrypting all secret fields)
```

### DON'T

```javascript
// Don't hardcode passphrases
passphrase: 'hardcoded-secret'  // Bad!

// Don't use weak passphrases
passphrase: 'password123'  // Bad!

// Don't log secret values
console.log(user);  // May leak decrypted secrets
```

## Key Rotation

To rotate encryption keys:

```javascript
async function rotateEncryptionKey(resource, oldKey, newKey) {
  const items = await resource.list();

  for (const item of items) {
    // Read with old key
    const oldDb = new Database({
      connectionString: '...',
      passphrase: oldKey
    });
    await oldDb.connect();
    const oldResource = await oldDb.getResource(resource.name);
    const data = await oldResource.get(item.id);

    // Write with new key
    const newDb = new Database({
      connectionString: '...',
      passphrase: newKey
    });
    await newDb.connect();
    const newResource = await newDb.getResource(resource.name);
    await newResource.replace(item.id, data);
  }
}
```

## Encryption Errors

```javascript
import { CryptoError } from 's3db.js/errors';

try {
  const user = await users.get('user123');
} catch (err) {
  if (err instanceof CryptoError) {
    // Wrong passphrase or corrupted data
    console.error('Decryption failed:', err.message);
  }
}
```

Common causes:
- Wrong passphrase
- Corrupted ciphertext
- Crypto API not available (rare)

## Storage Format

Encrypted values are stored as Base64 with embedded salt and IV:

```
[16 bytes salt][12 bytes IV][N bytes ciphertext]
└─────────────── Base64 encoded ───────────────┘
```

This format ensures:
- Each value has unique salt/IV (prevents rainbow tables)
- Self-contained (no external key storage)
- Portable (Base64 is S3 metadata safe)

## Browser Compatibility

Encryption works in both Node.js and browsers using WebCrypto API:

```javascript
// Node.js: Uses crypto.webcrypto
// Browser: Uses window.crypto.subtle
```

## Example: Secure User Data

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    passwordHash: 'string|required',    // bcrypt hash
    ssn: 'secret|optional',             // Encrypted
    apiKey: 'secret|optional',          // Encrypted
    twoFactorSecret: 'secret|optional'  // Encrypted
  }
});

// Store sensitive data
await users.insert({
  email: 'alice@example.com',
  passwordHash: await bcrypt.hash('password', 12),
  ssn: '123-45-6789',
  apiKey: 'sk_live_abc123',
  twoFactorSecret: 'JBSWY3DPEHPK3PXP'
});

// Retrieve (auto-decrypted)
const user = await users.get('user123');
// user.ssn = '123-45-6789' (decrypted)
// user.apiKey = 'sk_live_abc123' (decrypted)
```

## See Also

- [Schema](./schema.md) - Field types including `secret`
- [Security Best Practices](../guides/security-best-practices.md) - Security guide
- [Errors](../reference/errors.md) - CryptoError handling
