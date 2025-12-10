# Security Best Practices

This guide covers security best practices for s3db.js applications.

## Encryption

### Field-Level Encryption

Use `secret` type for sensitive data:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    password: 'secret|required',     // AES-256-GCM encrypted
    apiKey: 'secret|optional',       // AES-256-GCM encrypted
    ssn: 'secret|optional'           // AES-256-GCM encrypted
  }
});
```

### Strong Passphrases

```javascript
// DO: Use environment variables
const db = new Database({
  connectionString: '...',
  passphrase: process.env.ENCRYPTION_KEY  // 32+ characters
});

// DON'T: Hardcode passphrases
const db = new Database({
  passphrase: 'hardcoded-secret'  // Security risk!
});
```

### Password Hashing

For user passwords, use bcrypt instead of encryption:

```javascript
import bcrypt from 'bcrypt';

// Store hashed password (not encrypted)
const hash = await bcrypt.hash(password, 12);
await users.insert({ email, passwordHash: hash });

// Verify password
const user = await users.get(userId);
const valid = await bcrypt.compare(inputPassword, user.passwordHash);
```

## AWS Credentials

### IAM Policies

Minimum required permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:HeadObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket",
        "arn:aws:s3:::your-bucket/*"
      ]
    }
  ]
}
```

### Credential Management

```javascript
// DO: Use IAM roles (EC2, ECS, Lambda)
// AWS SDK auto-discovers credentials from instance metadata

// DO: Use environment variables
const db = new Database({
  connectionString: `s3://${process.env.AWS_ACCESS_KEY_ID}:${process.env.AWS_SECRET_ACCESS_KEY}@bucket`
});

// DON'T: Commit credentials
const db = new Database({
  connectionString: 's3://AKIAXXXXXXXX:secret@bucket'  // Never do this!
});
```

### URL-Encode Special Characters

If credentials contain special characters:

```javascript
const key = encodeURIComponent('ACCESS+KEY/WITH=SPECIAL');
const secret = encodeURIComponent('SECRET+KEY/WITH=SPECIAL');
const connStr = `s3://${key}:${secret}@bucket`;
```

## Input Validation

### Schema Validation

Always define strict schemas:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',           // Email format validation
    age: 'number|min:0|max:150',       // Range validation
    role: 'enum:user,admin,moderator', // Enum validation
    website: 'url|optional'            // URL format validation
  }
});
```

### Sanitize User Input

```javascript
// Hooks can sanitize data
const posts = await db.createResource({
  name: 'posts',
  attributes: { ... },
  hooks: {
    beforeInsert: async (data) => {
      // Sanitize HTML
      data.content = sanitizeHtml(data.content);
      // Trim strings
      data.title = data.title?.trim();
      return data;
    }
  }
});
```

## API Security

### Authentication Guards

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { ... },
  api: {
    guard: {
      list: async (ctx) => {
        if (!ctx.user) throw new Error('Authentication required');
        if (ctx.user.role !== 'admin') {
          return { userId: ctx.user.id };  // Filter by ownership
        }
        return true;
      },
      get: async (ctx, id) => {
        if (!ctx.user) throw new Error('Authentication required');
        return ctx.user.role === 'admin' || ctx.user.id === id;
      },
      create: async (ctx) => ctx.user?.role === 'admin',
      update: async (ctx, id) => ctx.user?.id === id || ctx.user?.role === 'admin',
      delete: async (ctx, id) => ctx.user?.role === 'admin'
    }
  }
});
```

### Protected Fields

Hide sensitive fields from API responses:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    passwordHash: 'string|required',
    apiKey: 'secret|optional',
    internalNotes: 'string|optional'
  },
  api: {
    protected: ['passwordHash', 'apiKey', 'internalNotes']
  }
});
```

### Rate Limiting

```javascript
import { ApiPlugin } from 's3db.js/plugins';

const api = new ApiPlugin({
  rateLimit: {
    windowMs: 60000,    // 1 minute
    max: 100            // 100 requests per window
  }
});
```

## Data Protection

### Paranoid Mode

Soft-delete instead of hard-delete:

```javascript
const users = await db.createResource({
  name: 'users',
  attributes: { ... },
  paranoid: true,      // Soft delete (set deletedAt)
  timestamps: true     // Required for paranoid
});

// "Deleted" records are marked, not removed
await users.delete('user123');  // Sets deletedAt, doesn't remove

// Restore
await users.restore('user123');
```

### Audit Trail

Track all changes:

```javascript
import { AuditPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: '...',
  plugins: [
    new AuditPlugin({
      resources: ['users', 'orders'],
      includeData: true,
      retention: 90 * 24 * 60 * 60 * 1000  // 90 days
    })
  ]
});
```

### Backup Strategy

Regular backups with the BackupPlugin:

```javascript
import { BackupPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: '...',
  plugins: [
    new BackupPlugin({
      schedule: '0 2 * * *',  // Daily at 2 AM
      retention: 30,          // Keep 30 days
      destination: 's3://backup-bucket/s3db-backups'
    })
  ]
});
```

## Network Security

### HTTPS Only

Always use HTTPS for S3 endpoints:

```javascript
// DO: Use HTTPS
connectionString: 'https://key:secret@minio.example.com/bucket'

// DON'T: Use HTTP in production
connectionString: 'http://key:secret@minio.example.com/bucket'  // Credentials exposed!
```

### VPC Endpoints

For AWS, use VPC endpoints to avoid public internet:

```javascript
const db = new Database({
  connectionString: 's3://key:secret@bucket?region=us-east-1',
  clientOptions: {
    endpoint: 'https://bucket.vpce-xxx.s3.us-east-1.vpce.amazonaws.com'
  }
});
```

## Logging

### Sensitive Data

Never log sensitive data:

```javascript
// DO: Log operations without data
logger.info({ userId: user.id, action: 'login' }, 'User logged in');

// DON'T: Log sensitive fields
logger.info({ user }, 'User logged in');  // May contain password, apiKey
```

### Log Levels

Use appropriate log levels:

```javascript
const db = new Database({
  connectionString: '...',
  logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
});
```

## Environment Security

### Environment Variables

```bash
# .env (never commit!)
S3_CONNECTION_STRING=s3://key:secret@bucket
ENCRYPTION_KEY=your-32-character-passphrase
JWT_SECRET=your-jwt-signing-secret
```

```javascript
// Load from environment
import 'dotenv/config';

const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING,
  passphrase: process.env.ENCRYPTION_KEY
});
```

### Secrets Managers

Use AWS Secrets Manager or similar:

```javascript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });
const response = await client.send(new GetSecretValueCommand({
  SecretId: 'prod/s3db/config'
}));

const secrets = JSON.parse(response.SecretString);

const db = new Database({
  connectionString: secrets.connectionString,
  passphrase: secrets.encryptionKey
});
```

## Checklist

### Development

- [ ] Use MemoryClient or FileSystemClient for local dev
- [ ] Never commit credentials to git
- [ ] Use `.env` files with `.gitignore`
- [ ] Enable debug logging

### Staging

- [ ] Use separate S3 bucket from production
- [ ] Use separate encryption keys
- [ ] Test backup/restore procedures
- [ ] Review IAM permissions

### Production

- [ ] Use IAM roles (not access keys)
- [ ] Enable S3 server-side encryption (SSE-S3 or SSE-KMS)
- [ ] Enable S3 versioning
- [ ] Enable S3 access logging
- [ ] Use VPC endpoints
- [ ] Minimum IAM permissions
- [ ] Regular key rotation
- [ ] Monitor CloudWatch metrics
- [ ] Enable audit logging
- [ ] Regular backups
- [ ] Disaster recovery plan

## See Also

- [Encryption](/core/encryption.md) - Field-level encryption
- [Errors](/reference/errors.md) - Error handling
- [API Plugin](/plugins/api/README.md) - API security features
- [Audit Plugin](/plugins/audit/README.md) - Audit logging
