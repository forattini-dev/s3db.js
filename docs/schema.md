# Schema & Validation Guide

> The magic behind S3DB's type system - where AWS S3 meets schema validation zen 🧘

## Table of Contents

- [Quick Start](#quick-start)
- [The Philosophy](#the-philosophy)
- [Resource Creation](#resource-creation)
- [Validation Engine](#validation-engine-fastest-validator)
- [Custom Types](#custom-types)
  - [secret - Auto-Encrypted Fields](#secret---auto-encrypted-fields)
  - [embedding - Vector Embeddings](#embedding---vector-embeddings)
  - [json - JSON Serialization](#json---json-serialization)
- [Standard Types](#standard-types)
- [Nested Objects](#nested-objects)
- [Arrays](#arrays)
- [Hooks & Transformations](#hooks--transformations)
- [Advanced Patterns](#advanced-patterns)
- [Performance Tips](#performance-tips)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```javascript
import { S3DB } from 's3db';

const database = new S3DB({
  connection: 's3://key:secret@bucket?region=us-east-1',
  passphrase: 'your-encryption-key'
});

// Create a resource with schema
const users = await database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    password: 'secret|required',           // Auto-encrypted ✨
    age: 'number|optional|min:18',
    embedding: 'embedding:1536',           // Vector magic 🎯
    profile: {                             // Nested objects work!
      name: 'string',
      bio: 'string|max:500'
    }
  }
});

// Insert with automatic validation
const user = await users.insert({
  email: 'ada@lovelace.com',
  password: 'supersecret',
  age: 36,
  embedding: [0.1, 0.2, ...], // 1536 floats
  profile: {
    name: 'Ada Lovelace',
    bio: 'First programmer'
  }
});
```

**What just happened?**
- ✅ Email validated as proper email format
- 🔐 Password encrypted with AES-256-GCM
- 🎯 Embedding compressed by 77% with fixed-point encoding
- 📦 Everything stored in S3 metadata (or body if too large)
- 🚀 Schema versioned and cached for future operations

---

## The Philosophy

S3DB turns S3 into a document database, but S3 has... *quirks*. The biggest one? **2KB metadata limit**.

Our schema system is designed to:

1. **Maximize space efficiency** - Base62 encoding, compression, smart packing
2. **Maintain type safety** - Full validation with helpful error messages
3. **Enable encryption** - Field-level encryption for sensitive data
4. **Stay flexible** - Schema evolution, versioning, graceful degradation
5. **Feel natural** - Intuitive API that just works™

Think of schemas as your contract with S3DB: "I promise to give you this shape of data, and you promise to store it efficiently and safely."

---

## Resource Creation

Resources are like tables in traditional databases. Each resource has:
- **name** - Unique identifier
- **attributes** - Schema definition (the star of the show)
- **partitions** - Optional indexing strategy
- **hooks** - Lifecycle callbacks
- **behavior** - How to handle 2KB limit

### Basic Resource

```javascript
const posts = await database.createResource({
  name: 'posts',
  attributes: {
    title: 'string|required',
    body: 'string|required',
    published: 'boolean|default:false',
    views: 'number|default:0'
  }
});
```

### Resource with Everything

```javascript
const articles = await database.createResource({
  name: 'articles',

  // Schema definition
  attributes: {
    slug: 'string|required',
    title: 'string|required|min:10|max:200',
    content: 'string|required',
    apiKey: 'secret',                      // Encrypted
    embedding: 'embedding:1536',           // Vector
    metadata: {                            // Nested
      author: 'string',
      tags: { type: 'array', items: 'string' }
    }
  },

  // Partitioning for performance
  partitions: {
    byAuthor: {
      fields: { author: 'string' }
    }
  },

  // 2KB limit behavior
  behavior: 'body-overflow',  // Smart fallback

  // Automatic timestamps
  timestamps: true,            // createdAt, updatedAt

  // Soft deletes
  paranoid: true,              // deletedAt instead of delete

  // Fast async partition indexing
  asyncPartitions: true,       // 70-100% faster writes

  // Lifecycle hooks
  hooks: {
    beforeInsert: [
      async (data) => {
        data.slug = data.title.toLowerCase().replace(/\s+/g, '-');
        return data;
      }
    ],
    afterInsert: [
      async (data) => {
        console.log('Article created:', data.id);
        return data;
      }
    ]
  }
});
```

---

## Validation Engine (Fastest-Validator)

S3DB uses [fastest-validator](https://github.com/icebob/fastest-validator) under the hood - one of the fastest validation libraries in the JavaScript ecosystem.

### How Validation Works

```javascript
// Define schema
const users = await database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    age: 'number|min:18|max:120'
  }
});

// ✅ Valid - passes validation
await users.insert({
  email: 'grace@hopper.com',
  age: 85
});

// ❌ Invalid - throws ValidationError
await users.insert({
  email: 'not-an-email',
  age: 15
});
// ValidationError: The 'email' field must be a valid email.
// ValidationError: The 'age' field must be larger than 18.
```

### Validation Rules Reference

| Rule | Example | Description |
|------|---------|-------------|
| `required` | `'string\|required'` | Field must be present |
| `optional` | `'string\|optional'` | Field can be omitted |
| `default:X` | `'boolean\|default:false'` | Default value if missing |
| `min:X` | `'string\|min:8'` | Minimum length/value |
| `max:X` | `'string\|max:100'` | Maximum length/value |
| `email` | `'string\|email'` | Valid email format |
| `url` | `'string\|url'` | Valid URL format |
| `enum` | `'string\|enum:a,b,c'` | Must be one of values |
| `pattern` | `'string\|pattern:/^[A-Z]/'` | Regex match |
| `trim` | `'string\|trim'` | Auto-trim whitespace (default) |
| `lowercase` | `'string\|lowercase'` | Convert to lowercase |
| `uppercase` | `'string\|uppercase'` | Convert to uppercase |
| `convert` | `'number\|convert'` | Auto-convert types (default for numbers) |

### Pipe Notation vs Object Notation

**Pipe notation** (recommended for simple cases):
```javascript
{
  email: 'string|required|email',
  age: 'number|optional|min:18'
}
```

**Object notation** (for complex cases):
```javascript
{
  email: {
    type: 'string',
    required: true,
    email: true
  },
  age: {
    type: 'number',
    optional: true,
    min: 18
  }
}
```

**Mixed notation** (best of both worlds):
```javascript
{
  email: 'string|required|email',
  tags: {
    type: 'array',
    items: 'string',
    min: 1,
    max: 10
  }
}
```

---

## Custom Types

S3DB extends fastest-validator with custom types optimized for S3 storage.

### `secret` - Auto-Encrypted Fields

Store sensitive data with automatic AES-256-GCM encryption.

#### Usage

```javascript
const users = await database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    password: 'secret|required',           // Encrypted string
    apiKey: 'secret|min:32',              // Encrypted with validation
    pin: 'secretNumber',                  // Encrypted number
    metadata: 'secretAny'                 // Encrypted any type
  }
});

// Insert - password auto-encrypted
const user = await users.insert({
  email: 'alan@turing.com',
  password: 'enigma123',
  apiKey: 'sk_live_abc123xyz...',
  pin: 1234
});

// Retrieve - password auto-decrypted
const found = await users.get(user.id);
console.log(found.password);  // 'enigma123' (decrypted)
```

#### Secret Variants

| Type | Description | Example |
|------|-------------|---------|
| `secret` | Encrypted string | `'secret\|required'` |
| `secretNumber` | Encrypted number | `'secretNumber'` |
| `secretAny` | Encrypted any type | `'secretAny'` |

#### Encryption Details

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Salt**: Random 16 bytes per field
- **IV**: Random 12 bytes per field
- **Encoding**: Base64 for storage
- **Cross-platform**: Works in Node.js and browsers

```javascript
// Encrypted value format in S3
{
  password: "salt:iv:encrypted:authTag" // Base64 encoded
}
```

#### Security Tips

✅ **DO:**
- Use strong passphrases (16+ characters)
- Store passphrase in environment variables
- Rotate encryption keys periodically
- Use `secret` for passwords, tokens, API keys

❌ **DON'T:**
- Hardcode passphrases in code
- Use short or common passphrases
- Share passphrases across environments
- Store credit cards without PCI compliance

### `embedding` - Vector Embeddings

Store high-dimensional vectors with 77% compression using fixed-point encoding.

#### Usage

```javascript
const documents = await database.createResource({
  name: 'documents',
  attributes: {
    text: 'string|required',
    // Shorthand notation (recommended)
    embedding: 'embedding:1536',           // OpenAI dimension

    // Alternative notations
    // embedding: 'embedding|length:768',  // Pipe notation
    // embedding: {                        // Object notation
    //   type: 'array',
    //   items: 'number',
    //   length: 1536,
    //   empty: false
    // }
  }
});

// Insert with embedding
const doc = await documents.insert({
  text: 'The quick brown fox...',
  embedding: [0.123, -0.456, 0.789, ...] // 1536 floats
});

// Query by similarity (requires VectorPlugin)
import { VectorPlugin } from 's3db/plugins';
database.use(new VectorPlugin());

const similar = await documents.findSimilar({
  embedding: queryVector,
  limit: 10,
  metric: 'cosine'
});
```

#### Common Embedding Dimensions

| Model | Dimension | Notation |
|-------|-----------|----------|
| OpenAI `text-embedding-3-small` | 1536 | `'embedding:1536'` |
| OpenAI `text-embedding-3-large` | 3072 | `'embedding:3072'` |
| Cohere `embed-english-v3.0` | 1024 | `'embedding:1024'` |
| BERT base | 768 | `'embedding:768'` |
| Sentence Transformers | 384 | `'embedding:384'` |

#### Compression Details

**Before encoding** (JSON):
```javascript
[0.123, -0.456, 0.789, ...]  // 1536 floats
// ~30KB as JSON string
```

**After encoding** (base62 fixed-point):
```javascript
"2kF_nX_pQ_..."  // Compact string
// ~7KB (77% smaller!)
```

**How it works:**
1. Convert float to fixed-point integer: `0.123 → 123000`
2. Encode to base62: `123000 → "nX"`
3. Join with separator: `"2kF_nX_pQ_..."`
4. Decode reverses the process with precision preservation

#### Performance Benefits

- **Space**: 77% compression vs JSON arrays
- **Speed**: Faster parsing than JSON
- **Precision**: Configurable (default 6 decimal places)
- **S3 Friendly**: Stays within 2KB metadata when possible

### `json` - JSON Serialization

Automatically serialize/deserialize JSON objects.

```javascript
const posts = await database.createResource({
  name: 'posts',
  attributes: {
    title: 'string|required',
    metadata: 'json'  // Any JSON-serializable value
  }
});

// Insert - auto-stringified
await posts.insert({
  title: 'My Post',
  metadata: { views: 100, likes: 50 }
});

// Retrieve - auto-parsed
const post = await posts.get(id);
console.log(post.metadata.views);  // 100
```

---

## Standard Types

Full support for all fastest-validator types:

### String

```javascript
{
  email: 'string|required|email',
  username: 'string|min:3|max:20|alphanum',
  url: 'string|url',
  slug: 'string|pattern:/^[a-z0-9-]+$/',
  status: 'string|enum:active,inactive,pending'
}
```

### Number

```javascript
{
  age: 'number|min:18|max:120',
  price: 'number|positive',
  score: 'number|integer|min:0|max:100',
  latitude: 'number|min:-90|max:90',
  longitude: 'number|min:-180|max:180'
}
```

### Boolean

```javascript
{
  active: 'boolean|default:true',
  verified: 'boolean',
  premium: 'boolean|default:false'
}
```

### Date

```javascript
{
  birthdate: 'date',
  createdAt: 'date|required',
  expiresAt: 'date|optional'
}
```

### Enum

```javascript
{
  role: 'string|enum:admin,user,guest',
  status: 'string|enum:draft,published,archived',
  priority: 'number|enum:1,2,3'
}
```

---

## Nested Objects

S3DB fully supports nested object structures.

### Simple Nesting

```javascript
const users = await database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    profile: {
      name: 'string',
      bio: 'string|max:500',
      avatar: 'string|url'
    }
  }
});

await users.insert({
  email: 'marie@curie.com',
  profile: {
    name: 'Marie Curie',
    bio: 'Physicist and chemist',
    avatar: 'https://example.com/avatar.jpg'
  }
});
```

### Deep Nesting

```javascript
{
  user: {
    profile: {
      personal: {
        name: 'string',
        age: 'number'
      },
      social: {
        twitter: 'string|optional',
        github: 'string|optional'
      }
    },
    settings: {
      notifications: {
        email: 'boolean|default:true',
        sms: 'boolean|default:false'
      }
    }
  }
}
```

### Optional Nested Objects

```javascript
const schema = await database.createResource({
  name: 'users',
  attributes: {
    email: 'string|required',
    profile: {
      $$type: 'object|optional',  // Mark entire object as optional
      name: 'string',
      bio: 'string'
    }
  }
});

// Valid - profile omitted
await users.insert({ email: 'test@example.com' });

// Valid - profile provided
await users.insert({
  email: 'test@example.com',
  profile: { name: 'Test User' }
});
```

---

## Arrays

Arrays are tricky in S3 metadata (2KB limit!). S3DB handles them intelligently.

### Arrays of Strings

```javascript
{
  tags: { type: 'array', items: 'string' }
}

// Stored as: "tag1|tag2|tag3" (pipe-separated, configurable)
```

### Arrays of Numbers

```javascript
{
  scores: { type: 'array', items: 'number' }
}

// Stored as: "2kF_nX_pQ" (base62 encoded)
```

### Arrays of Objects

```javascript
{
  comments: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        author: 'string',
        text: 'string',
        createdAt: 'date'
      }
    }
  }
}

// Stored as JSON string in metadata/body
```

### Array Validation

```javascript
{
  tags: {
    type: 'array',
    items: 'string',
    min: 1,      // At least 1 item
    max: 10,     // At most 10 items
    empty: false // Don't allow empty arrays
  }
}
```

### Array Encoding Options

S3DB automatically chooses the best encoding based on array content:

| Content | Encoding | Example |
|---------|----------|---------|
| Strings | Pipe-separated | `"a\|b\|c"` |
| Integers | Base62 | `"1_2_3"` |
| Decimals | Base62 decimal | `"1.5_2.3_3.7"` |
| Embeddings (256+ items) | Fixed-point base62 | `"2kF_nX_pQ"` |
| Objects | JSON | `"[{...},{...}]"` |

---

## Hooks & Transformations

Hooks let you transform data during the validation/storage lifecycle.

### Hook Types

| Hook | When | Use For |
|------|------|---------|
| `beforeInsert` | Before validation | Generate IDs, slugs, timestamps |
| `afterInsert` | After storage | Logging, notifications, replication |
| `beforeUpdate` | Before update validation | Audit trails, version tracking |
| `afterUpdate` | After update storage | Cache invalidation |
| `beforeDelete` | Before deletion | Soft deletes, backups |
| `afterDelete` | After deletion | Cleanup, notifications |

### Auto-Generated Hooks

S3DB automatically generates hooks for:
- **Encryption** (`secret` type)
- **Decryption** (on retrieval)
- **Array encoding** (pipe-separated or base62)
- **Boolean conversion** (true/false → 1/0)
- **Number encoding** (base62)
- **Embedding compression** (fixed-point base62)

### Custom Hooks

```javascript
const posts = await database.createResource({
  name: 'posts',
  attributes: {
    title: 'string|required',
    slug: 'string'
  },
  hooks: {
    beforeInsert: [
      // Generate slug from title
      async (data) => {
        data.slug = data.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        return data;
      },

      // Add timestamp
      async (data) => {
        data.createdAt = new Date().toISOString();
        return data;
      }
    ],

    afterInsert: [
      // Log creation
      async (data) => {
        console.log('Post created:', data.id);
        return data;
      },

      // Invalidate cache
      async (data) => {
        await cache.invalidate('posts:*');
        return data;
      }
    ]
  }
});
```

### Hook Best Practices

✅ **DO:**
- Keep hooks pure and focused
- Return the data object (even if not modified)
- Handle errors gracefully
- Use async/await for async operations
- Test hooks in isolation

❌ **DON'T:**
- Mutate external state
- Make hooks dependent on each other
- Use heavy operations (offload to queues)
- Throw errors without handling
- Access external variables (hooks are serialized!)

### Hook Serialization

**Important**: Hooks are serialized and stored with the schema. This means:

```javascript
// ✅ GOOD - Pure function
beforeInsert: [
  async (data) => {
    data.slug = data.title.toLowerCase().replace(/\s+/g, '-');
    return data;
  }
]

// ❌ BAD - Uses closure variable (will be lost!)
const apiKey = 'secret';
beforeInsert: [
  async (data) => {
    data.apiKey = apiKey;  // apiKey is undefined when deserialized!
    return data;
  }
]

// ✅ GOOD - Uses data properties
beforeInsert: [
  async (data) => {
    data.apiKey = data.config.apiKey;  // Comes from data object
    return data;
  }
]
```

---

## Advanced Patterns

### Schema Versioning

Schemas are versioned automatically. When you change a schema, S3DB creates a new version:

```javascript
// Version 1
const users = await database.createResource({
  name: 'users',
  attributes: { email: 'string' }
});

// Later... Version 2
await users.updateSchema({
  email: 'string',
  name: 'string|required'  // Added field
});

// S3DB handles both versions transparently
// Old records work with v1, new records use v2
```

### Partial Updates

```javascript
// Only validate and update changed fields
await users.update(id, {
  name: 'New Name'
  // email not validated or changed
});
```

### Conditional Validation

```javascript
const orders = await database.createResource({
  name: 'orders',
  attributes: {
    type: 'string|enum:digital,physical',
    shippingAddress: 'string|optional'
  },
  hooks: {
    beforeInsert: [
      async (data) => {
        // Require shipping address for physical orders
        if (data.type === 'physical' && !data.shippingAddress) {
          throw new Error('Shipping address required for physical orders');
        }
        return data;
      }
    ]
  }
});
```

### Dynamic Defaults

```javascript
{
  id: 'string|required',
  createdAt: 'string',
  hooks: {
    beforeInsert: [
      async (data) => {
        if (!data.id) data.id = crypto.randomUUID();
        if (!data.createdAt) data.createdAt = new Date().toISOString();
        return data;
      }
    ]
  }
}
```

### Computed Fields

```javascript
const products = await database.createResource({
  name: 'products',
  attributes: {
    price: 'number|required',
    taxRate: 'number|default:0.1',
    priceWithTax: 'number'
  },
  hooks: {
    beforeInsert: [
      async (data) => {
        data.priceWithTax = data.price * (1 + data.taxRate);
        return data;
      }
    ],
    beforeUpdate: [
      async (data) => {
        if (data.price || data.taxRate) {
          const price = data.price || data._original.price;
          const taxRate = data.taxRate || data._original.taxRate;
          data.priceWithTax = price * (1 + taxRate);
        }
        return data;
      }
    ]
  }
});
```

---

## Performance Tips

### 1. Use Behaviors for Large Data

When your data might exceed 2KB metadata:

```javascript
const documents = await database.createResource({
  name: 'documents',
  behavior: 'body-overflow',  // Smart fallback to body
  attributes: {
    title: 'string',
    content: 'string',
    embedding: 'embedding:1536'
  }
});
```

**Behavior options:**
- `body-overflow` - Tries metadata, overflows to body (recommended)
- `body-only` - Always uses body (5TB limit)
- `truncate-data` - Truncates last field to fit
- `enforce-limits` - Throws error if too large
- `user-managed` - Emits events, you handle it

### 2. Optimize Embeddings

```javascript
// ✅ GOOD - Use embedding type (77% compression)
{ vector: 'embedding:1536' }

// ❌ BAD - Plain array (no compression)
{ vector: { type: 'array', items: 'number' } }
```

### 3. Use Partitions

```javascript
const users = await database.createResource({
  name: 'users',
  attributes: { email: 'string', country: 'string' },
  partitions: {
    byCountry: { fields: { country: 'string' } }
  },
  asyncPartitions: true  // 70-100% faster writes!
});

// O(1) lookup instead of O(n) scan
await users.query({ country: 'US' });
```

### 4. Minimize Nested Objects

```javascript
// ✅ GOOD - Flat structure (faster)
{
  userName: 'string',
  userEmail: 'string',
  userAge: 'number'
}

// ❌ SLOWER - Nested (more processing)
{
  user: {
    name: 'string',
    email: 'string',
    age: 'number'
  }
}
```

### 5. Batch Operations

```javascript
// ✅ GOOD - Batch insert (parallel)
await users.insertMany([
  { email: 'user1@example.com' },
  { email: 'user2@example.com' }
]);

// ❌ SLOWER - Sequential inserts
for (const user of users) {
  await users.insert(user);
}
```

---

## Troubleshooting

### Common Errors

#### ValidationError: Field is required

```javascript
// ❌ Error
await users.insert({ email: 'test@example.com' });
// ValidationError: The 'password' field is required.

// ✅ Fix
await users.insert({
  email: 'test@example.com',
  password: 'secret123'
});
```

#### ValidationError: Must be valid email

```javascript
// ❌ Error
await users.insert({ email: 'not-an-email' });
// ValidationError: The 'email' field must be a valid email.

// ✅ Fix
await users.insert({ email: 'valid@example.com' });
```

#### MetadataLimitError: Exceeds 2KB

```javascript
// ❌ Error - Large data with enforce-limits
await documents.insert({
  content: 'very long text...' // > 2KB
});
// MetadataLimitError: Data exceeds 2047 bytes

// ✅ Fix - Use body-overflow behavior
const documents = await database.createResource({
  name: 'documents',
  behavior: 'body-overflow',  // Auto-fallback
  attributes: { content: 'string' }
});
```

#### EncryptionError: Missing passphrase

```javascript
// ❌ Error
const db = new S3DB({ connection: 's3://...' });
await users.insert({ password: 'secret' });
// EncryptionError: Missing configuration for secrets encryption.

// ✅ Fix - Provide passphrase
const db = new S3DB({
  connection: 's3://...',
  passphrase: 'your-encryption-key'
});
```

#### Schema Version Mismatch

```javascript
// ❌ Error - Schema changed, old data incompatible
// S3DB handles this automatically with versioning

// ✅ Solution - Use schema evolution
await resource.updateSchema({
  // New schema
  email: 'string|required',
  name: 'string|optional'  // New optional field
});

// Old records still work (v1)
// New records use new schema (v2)
```

### Debug Tips

**1. Enable verbose logging:**
```javascript
const db = new S3DB({
  connection: 's3://...',
  debug: true  // Logs all operations
});
```

**2. Inspect schema:**
```javascript
console.log(resource.schema.attributes);
console.log(resource.schema.options.hooks);
```

**3. Test validation separately:**
```javascript
const result = await resource.schema.validate({
  email: 'test@example.com',
  password: 'secret'
});
console.log(result);  // true or array of errors
```

**4. Check metadata size:**
```javascript
import { calculateMetadataSize } from 's3db/concerns/calculator';

const size = calculateMetadataSize({ email: 'test@example.com' });
console.log(size, 'bytes');  // 30 bytes
```

---

## Best Practices Checklist

✅ **Schema Design**
- [ ] Use appropriate types for each field
- [ ] Add validation rules for data quality
- [ ] Use `secret` for sensitive data
- [ ] Use `embedding` for vectors
- [ ] Keep structures as flat as possible
- [ ] Use partitions for large datasets

✅ **Validation**
- [ ] Mark required fields explicitly
- [ ] Provide sensible defaults
- [ ] Add min/max constraints
- [ ] Use enums for known values
- [ ] Test edge cases

✅ **Performance**
- [ ] Choose appropriate behavior for data size
- [ ] Use `asyncPartitions: true` for fast writes
- [ ] Batch operations when possible
- [ ] Minimize nested objects
- [ ] Use embeddings for vectors

✅ **Security**
- [ ] Encrypt sensitive fields with `secret`
- [ ] Store passphrase in environment
- [ ] Rotate encryption keys periodically
- [ ] Validate user input
- [ ] Use paranoid mode for soft deletes

✅ **Maintainability**
- [ ] Document schema changes
- [ ] Use semantic field names
- [ ] Keep hooks simple and pure
- [ ] Version schemas properly
- [ ] Test thoroughly

---

## Examples in the Wild

Check out these examples for real-world patterns:

- **[e07-create-resource.js](../examples/e07-create-resource.js)** - Basic resource creation
- **[e12-schema-validation.js](../examples/e12-schema-validation.js)** - Validation patterns
- **[e08-resource-behaviors.js](../examples/e08-resource-behaviors.js)** - Handling 2KB limits
- **[e29-arrays-of-strings-and-numbers.js](../examples/e29-arrays-of-strings-and-numbers.js)** - Array handling
- **[e41-vector-rag-chatbot.js](../examples/e41-vector-rag-chatbot.js)** - Embedding usage
- **[e39-testing-partial-schema.js](../examples/e39-testing-partial-schema.js)** - Schema testing

---

## Further Reading

- [Fastest Validator Documentation](https://github.com/icebob/fastest-validator)
- [Vector Plugin Guide](./plugins/vector.md)
- [Encryption Concerns](../src/concerns/crypto.js)
- [Base62 Encoding](../src/concerns/base62.js)
- [Schema Class Source](../src/schema.class.js)

---

**Happy schema designing! 🎨**

*Remember: Good schemas are like good jokes - they're well-structured, easy to understand, and don't throw unexpected errors.*
