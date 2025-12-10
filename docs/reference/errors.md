# Errors

s3db.js provides a comprehensive error hierarchy with detailed diagnostics.

## Error Hierarchy

```
Error
└── BaseError
    └── S3dbError
        ├── DatabaseError
        ├── ValidationError
        ├── AuthenticationError
        ├── PermissionError
        ├── EncryptionError
        ├── ResourceNotFound
        ├── NoSuchBucket
        ├── NoSuchKey
        ├── NotFound
        ├── MissingMetadata
        ├── InvalidResourceItem
        ├── ConnectionStringError
        ├── CryptoError
        ├── SchemaError
        ├── ResourceError
        ├── PartitionError
        ├── PluginError
        ├── PluginStorageError
        ├── PartitionDriverError
        ├── BehaviorError
        ├── StreamError
        ├── MetadataLimitError
        ├── AnalyticsNotEnabledError
        └── UnknownError
```

## Common Errors

### ResourceNotFound

Thrown when a resource ID doesn't exist:

```javascript
import { ResourceNotFound } from 's3db.js/errors';

try {
  await users.get('nonexistent-id');
} catch (err) {
  if (err instanceof ResourceNotFound) {
    console.log('Resource:', err.resourceName);
    console.log('ID:', err.id);
    console.log('Bucket:', err.bucket);
  }
}
```

**Properties:**
- `resourceName` - Resource name
- `id` - Requested ID
- `bucket` - S3 bucket
- `statusCode` - 404

### ValidationError

Thrown when data fails schema validation:

```javascript
import { ValidationError } from 's3db.js/errors';

try {
  await users.insert({ name: '' });  // Missing required email
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('Errors:', err.data);
    console.log('Suggestion:', err.suggestion);
  }
}
```

**Properties:**
- `statusCode` - 422
- `retriable` - false
- `suggestion` - Fix guidance

### InvalidResourceItem

Thrown when item doesn't match schema:

```javascript
import { InvalidResourceItem } from 's3db.js/errors';

try {
  await users.insert({ email: 'not-an-email', age: -5 });
} catch (err) {
  if (err instanceof InvalidResourceItem) {
    console.log('Resource:', err.resourceName);
    console.log('Validation:', err.validation);
  }
}
```

**Properties:**
- `resourceName` - Resource name
- `attributes` - Provided attributes
- `validation` - Validation errors array
- `statusCode` - 422

### PermissionError

Thrown for S3 access denied errors:

```javascript
import { PermissionError } from 's3db.js/errors';

try {
  await db.connect();
} catch (err) {
  if (err instanceof PermissionError) {
    console.log('Access denied');
    console.log('Suggestion:', err.suggestion);
  }
}
```

**Properties:**
- `statusCode` - 403
- `description` - Detailed explanation
- `suggestion` - Fix guidance

### NoSuchBucket

Thrown when S3 bucket doesn't exist:

```javascript
import { NoSuchBucket } from 's3db.js/errors';

try {
  await db.connect();
} catch (err) {
  if (err instanceof NoSuchBucket) {
    console.log('Bucket:', err.bucket);
    console.log('Create it or check the name');
  }
}
```

### MetadataLimitError

Thrown when data exceeds S3's 2KB metadata limit:

```javascript
import { MetadataLimitError } from 's3db.js/errors';

try {
  await resource.insert({ hugeField: 'x'.repeat(3000) });
} catch (err) {
  if (err instanceof MetadataLimitError) {
    console.log('Size:', err.totalSize, 'bytes');
    console.log('Limit:', err.effectiveLimit, 'bytes');
    console.log('Excess:', err.excess, 'bytes');
  }
}
```

**Properties:**
- `totalSize` - Actual size in bytes
- `effectiveLimit` - Configured limit
- `absoluteLimit` - 2047 bytes (S3 hard limit)
- `excess` - Bytes over limit
- `statusCode` - 413

### PartitionError

Thrown for partition configuration issues:

```javascript
import { PartitionError } from 's3db.js/errors';

try {
  await db.createResource({
    name: 'test',
    attributes: { name: 'string' },
    partitions: {
      byStatus: { fields: { status: 'string' } }  // 'status' doesn't exist!
    }
  });
} catch (err) {
  if (err instanceof PartitionError) {
    console.log('Partition:', err.partitionName);
    console.log('Missing field:', err.fieldName);
    console.log('Available fields:', err.availableFields);
  }
}
```

### CryptoError

Thrown for encryption/decryption failures:

```javascript
import { CryptoError } from 's3db.js/errors';

try {
  const user = await users.get('id');  // Wrong passphrase
} catch (err) {
  if (err instanceof CryptoError) {
    console.log('Decryption failed');
    console.log('Check passphrase configuration');
  }
}
```

### PluginError

Thrown for plugin-related issues:

```javascript
import { PluginError } from 's3db.js/errors';

try {
  await db.getPlugin('nonexistent');
} catch (err) {
  if (err instanceof PluginError) {
    console.log('Plugin:', err.pluginName);
    console.log('Operation:', err.operation);
  }
}
```

## Error Properties

All errors extend `BaseError` with common properties:

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Error class name |
| `message` | string | Human-readable message |
| `statusCode` | number | HTTP status code |
| `code` | string | Error code (from AWS) |
| `bucket` | string | S3 bucket (if applicable) |
| `key` | string | S3 key (if applicable) |
| `original` | Error | Original error (if wrapped) |
| `retriable` | boolean | Whether retry might succeed |
| `suggestion` | string | Fix guidance |
| `description` | string | Detailed explanation |
| `docs` | string | Documentation URL |
| `thrownAt` | Date | When error occurred |

## Error Handling Patterns

### Try-Catch

```javascript
import {
  ResourceNotFound,
  ValidationError,
  PermissionError
} from 's3db.js/errors';

try {
  const user = await users.get(id);
  await users.update(id, newData);
} catch (err) {
  if (err instanceof ResourceNotFound) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (err instanceof ValidationError) {
    return res.status(422).json({ error: err.message, details: err.data });
  }
  if (err instanceof PermissionError) {
    return res.status(403).json({ error: 'Access denied' });
  }
  throw err;  // Re-throw unknown errors
}
```

### tryFn Helper

s3db.js includes a `tryFn` helper for functional error handling:

```javascript
import tryFn from 's3db.js/concerns/try-fn';

const [ok, err, user] = await tryFn(() => users.get(id));

if (!ok) {
  console.log('Error:', err.message);
  return null;
}

return user;
```

### mapAwsError

Convert AWS errors to s3db.js errors:

```javascript
import { mapAwsError } from 's3db.js/errors';

try {
  await s3Client.send(command);
} catch (awsErr) {
  const s3dbErr = mapAwsError(awsErr, { bucket, key });
  // s3dbErr is now a proper s3db.js error type
  throw s3dbErr;
}
```

## HTTP Status Codes

| Error | Status Code |
|-------|-------------|
| ResourceNotFound | 404 |
| NoSuchKey | 404 |
| NoSuchBucket | 404 |
| ValidationError | 422 |
| InvalidResourceItem | 422 |
| ConnectionStringError | 400 |
| SchemaError | 400 |
| PartitionError | 400 |
| BehaviorError | 400 |
| AuthenticationError | 401 |
| PermissionError | 403 |
| MetadataLimitError | 413 |
| DatabaseError | 500 |
| CryptoError | 500 |
| PluginError | 500 |
| StreamError | 500 |
| PartitionDriverError | 503 |
| UnknownError | 500 |

## Retriable Errors

Some errors can be retried:

```javascript
async function withRetry(fn, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!err.retriable) throw err;

      const delay = Math.pow(2, i) * 1000;  // Exponential backoff
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

const user = await withRetry(() => users.get(id));
```

**Typically retriable:**
- Network timeouts
- S3 rate limiting (503)
- Temporary failures

**Not retriable:**
- ValidationError
- ResourceNotFound
- PermissionError
- CryptoError

## Logging Errors

```javascript
import { S3dbError } from 's3db.js/errors';

try {
  await operation();
} catch (err) {
  if (err instanceof S3dbError) {
    logger.error({
      name: err.name,
      message: err.message,
      statusCode: err.statusCode,
      code: err.code,
      bucket: err.bucket,
      key: err.key,
      retriable: err.retriable,
      stack: err.stack
    }, 'S3DB operation failed');
  } else {
    logger.error({ err }, 'Unknown error');
  }
}
```

## JSON Serialization

All errors implement `toJSON()`:

```javascript
try {
  await users.get('bad-id');
} catch (err) {
  const json = JSON.stringify(err);
  // Includes all properties including stack trace
}
```

## See Also

- [Database](/core/database.md) - Error context
- [Resource](/core/resource.md) - CRUD error handling
- [Security Best Practices](/guides/security-best-practices.md) - Error security
