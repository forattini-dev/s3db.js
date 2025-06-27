# s3db.js

Use AWS S3, the world's most reliable document storage, as a database with this ORM.

## Installation

```bash
npm install s3db.js
```

## Quick Start

### Node.js (ES Modules)

```javascript
import S3db from 's3db.js';

const db = new S3db({
  region: 'us-east-1',
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  bucket: 'your-bucket-name'
});

await db.connect();

const users = db.resource('users', {
  schema: {
    name: { type: 'string', required: true },
    email: { type: 'string', required: true },
    age: { type: 'number' }
  }
});

// Insert data
const user = await users.insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});

// Query data
const allUsers = await users.find();
const john = await users.findOne({ name: 'John Doe' });
```

### Node.js (CommonJS)

```javascript
const S3db = require('s3db.js');

const db = new S3db({
  connectionString: 's3://access-key:secret-key@bucket-name/prefix?region=us-east-1'
});

await db.connect();
// ... rest of the code
```

### Browser

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/s3db.js@latest/dist/s3db.iife.min.js"></script>
</head>
<body>
  <script>
    const db = new s3db.S3db({
      region: 'us-east-1',
      accessKeyId: 'your-access-key',
      secretAccessKey: 'your-secret-key',
      bucket: 'your-bucket-name'
    });

    db.connect().then(() => {
      const users = db.resource('users');
      return users.insert({ name: 'John', email: 'john@example.com' });
    });
  </script>
</body>
</html>
```

## Features

- 🚀 **High Performance**: Optimized for large datasets with streaming support
- 🔒 **Security**: Built-in encryption and compression
- 📊 **Schema Validation**: Automatic data validation with customizable schemas
- 🔄 **Caching**: Intelligent caching with TTL support
- 📦 **Partitioning**: Automatic data partitioning for better performance
- 🔌 **Plugin System**: Extensible with custom plugins
- 🌐 **Universal**: Works in Node.js and browsers
- 📝 **TypeScript**: Full TypeScript support with autocomplete

## API Reference

### S3db Class

The main database class for connecting to S3 and managing resources.

#### Constructor

```javascript
new S3db(config)
```

**Config Options:**
- `connectionString` (string): S3 connection string
- `region` (string): AWS region
- `accessKeyId` (string): AWS access key
- `secretAccessKey` (string): AWS secret key
- `bucket` (string): S3 bucket name
- `prefix` (string): Key prefix for all objects
- `encryption` (boolean): Enable encryption (default: false)
- `compression` (boolean): Enable compression (default: false)
- `cache` (boolean): Enable caching (default: true)
- `cacheTTL` (number): Cache TTL in seconds (default: 300)

#### Methods

- `connect()`: Connect to S3
- `disconnect()`: Disconnect from S3
- `resource(name, config)`: Create or get a resource
- `listResources()`: List all resources
- `getVersion()`: Get package version

### Resource Class

Represents a collection of documents in S3.

#### Methods

- `insert(data, options)`: Insert a single document
- `insertMany(data, options)`: Insert multiple documents
- `find(query, options)`: Find documents
- `findOne(query, options)`: Find a single document
- `update(query, data, options)`: Update documents
- `delete(query, options)`: Delete documents
- `createReadStream(query, options)`: Create a read stream
- `createWriteStream(options)`: Create a write stream

## Examples

See the [examples](./examples) directory for more detailed usage examples.

## License

UNLICENSED
