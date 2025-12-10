# Connection Strings

Connection strings provide a compact way to configure database connections.

## Format

```
protocol://[user:password@]host[:port]/path[?options]
```

## Protocols

### s3:// (AWS S3)

```javascript
// Basic
s3://ACCESS_KEY:SECRET_KEY@bucket

// With region
s3://ACCESS_KEY:SECRET_KEY@bucket?region=us-east-1

// With key prefix
s3://ACCESS_KEY:SECRET_KEY@bucket/prefix/path?region=us-east-1
```

### http:// / https:// (S3-Compatible)

For MinIO, DigitalOcean Spaces, Cloudflare R2, etc.

```javascript
// MinIO local
http://minioadmin:minioadmin@localhost:9000/mybucket

// MinIO with prefix
http://user:pass@localhost:9000/mybucket/prefix

// DigitalOcean Spaces
https://ACCESS_KEY:SECRET_KEY@nyc3.digitaloceanspaces.com/mybucket

// Cloudflare R2
https://ACCESS_KEY:SECRET_KEY@ACCOUNT_ID.r2.cloudflarestorage.com/mybucket
```

### file:// (FileSystem)

```javascript
// Absolute path
file:///home/user/data

// With bucket/prefix
file:///home/user/data/mybucket/prefix

// Relative path (resolved to absolute)
file://./data
```

### memory:// (In-Memory)

```javascript
// Basic
memory://mybucket

// With prefix
memory://mybucket/prefix/path
```

## Query Parameters

### Common Options

| Parameter | Type | Description |
|-----------|------|-------------|
| `region` | string | AWS region (default: us-east-1) |
| `forcePathStyle` | boolean | Force path-style URLs |

### Compression Options

```javascript
// Enable compression
s3://key:secret@bucket?compression.enabled=true

// Set compression level
s3://key:secret@bucket?compression.enabled=true&compression.level=6
```

### TTL Options

```javascript
// Default TTL for all records (ms)
s3://key:secret@bucket?ttl.defaultTTL=86400000
```

### Nested Options

Query parameters support dot notation for nested configuration:

```javascript
// Single nested option
s3://key:secret@bucket?executorPool.concurrency=50

// Multiple nested options
s3://key:secret@bucket?executorPool.concurrency=50&executorPool.retries=5
```

## URL Encoding

Special characters in credentials must be URL-encoded:

| Character | Encoded |
|-----------|---------|
| `/` | `%2F` |
| `+` | `%2B` |
| `=` | `%3D` |
| `@` | `%40` |
| `:` | `%3A` |
| `?` | `%3F` |
| `&` | `%26` |

```javascript
// If access key is "ABC+DEF/123"
const key = encodeURIComponent('ABC+DEF/123');  // "ABC%2BDEF%2F123"
const connectionString = `s3://${key}:${secret}@bucket`;
```

## Examples

### AWS S3

```javascript
// US East
s3://AKIAXXXXXXXX:secretkey@mybucket?region=us-east-1

// EU West with prefix
s3://AKIAXXXXXXXX:secretkey@mybucket/production?region=eu-west-1

// With all options
s3://AKIAXXXXXXXX:secretkey@mybucket?region=us-east-1&compression.enabled=true
```

### MinIO

```javascript
// Local development
http://minioadmin:minioadmin@localhost:9000/devbucket

// Docker network
http://minio:minio123@minio:9000/mybucket

// Production MinIO
https://access:secret@minio.example.com/mybucket
```

### DigitalOcean Spaces

```javascript
https://ACCESS_KEY:SECRET_KEY@nyc3.digitaloceanspaces.com/myspace
https://ACCESS_KEY:SECRET_KEY@ams3.digitaloceanspaces.com/myspace
https://ACCESS_KEY:SECRET_KEY@sgp1.digitaloceanspaces.com/myspace
```

### Cloudflare R2

```javascript
https://ACCESS_KEY:SECRET_KEY@ACCOUNT_ID.r2.cloudflarestorage.com/mybucket
```

### Backblaze B2

```javascript
https://keyId:applicationKey@s3.us-west-000.backblazeb2.com/mybucket
```

### Testing

```javascript
// Memory (fastest, no persistence)
memory://testbucket

// FileSystem (persisted to disk)
file:///tmp/s3db-test

// Memory with namespace
memory://testbucket/tests/unit
```

## Programmatic Construction

### From Environment

```javascript
const db = new Database({
  connectionString: process.env.S3_CONNECTION_STRING
});
```

### From Components

```javascript
const db = new Database({
  bucket: 'mybucket',
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
```

### Building Dynamically

```javascript
function buildConnectionString(config) {
  const { protocol, key, secret, host, bucket, prefix, options } = config;

  const encodedKey = encodeURIComponent(key);
  const encodedSecret = encodeURIComponent(secret);

  let url = `${protocol}://${encodedKey}:${encodedSecret}@${host}/${bucket}`;

  if (prefix) {
    url += `/${prefix}`;
  }

  if (options && Object.keys(options).length > 0) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options)) {
      params.set(k, String(v));
    }
    url += `?${params.toString()}`;
  }

  return url;
}

const connStr = buildConnectionString({
  protocol: 's3',
  key: 'AKIAXXXXXXXX',
  secret: 'secretkey',
  host: 'mybucket',
  bucket: '',
  prefix: 'production',
  options: { region: 'us-east-1' }
});
```

## ConnectionString Class

s3db.js uses the `ConnectionString` class internally:

```javascript
import { ConnectionString } from 's3db.js';

const conn = new ConnectionString('s3://key:secret@bucket?region=us-east-1');

console.log(conn.bucket);        // "bucket"
console.log(conn.region);        // "us-east-1"
console.log(conn.accessKeyId);   // "key"
console.log(conn.keyPrefix);     // ""
console.log(conn.clientOptions); // { region: "us-east-1" }
```

### Parsed Properties

| Property | Description |
|----------|-------------|
| `bucket` | S3 bucket name |
| `region` | AWS region |
| `accessKeyId` | Access key |
| `secretAccessKey` | Secret key |
| `endpoint` | S3 endpoint URL |
| `keyPrefix` | Key prefix (path after bucket) |
| `forcePathStyle` | Path-style URLs flag |
| `clientType` | `'s3'`, `'filesystem'`, or `'memory'` |
| `basePath` | Base path (filesystem only) |
| `clientOptions` | Parsed query parameters |

## Validation

```javascript
import { ConnectionString, ConnectionStringError } from 's3db.js';

try {
  const conn = new ConnectionString('invalid');
} catch (err) {
  if (err instanceof ConnectionStringError) {
    console.error('Invalid connection string:', err.message);
    console.log('Suggestion:', err.suggestion);
  }
}
```

## Security Notes

1. **Never commit connection strings** containing credentials
2. **Use environment variables** in production
3. **URL-encode special characters** in credentials
4. **Use HTTPS** for production S3-compatible services
5. **Use IAM roles** when possible (no credentials in connection string)

```javascript
// Using IAM role (EC2, ECS, Lambda)
// No credentials needed - AWS SDK auto-discovers
s3://mybucket?region=us-east-1
```

## See Also

- [Database](/core/database.md) - Database configuration
- [Clients](/clients/README.md) - Storage backends
- [Security Best Practices](/guides/security-best-practices.md) - Security guide
