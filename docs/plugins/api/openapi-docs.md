# 📝 OpenAPI & Swagger UI Customization

> **Navigation:** [← Back to API Plugin](./README.md) | [Authentication →](./authentication.md) | [Guards →](./guards.md)

The API Plugin automatically generates **OpenAPI 3.1 schemas** and serves an interactive **Swagger UI** at `/docs`. This guide shows you how to add descriptions and customize the generated documentation for the best developer experience.

---

## 🎯 Quick Start

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
await db.connect();

// Create resource with descriptions
await db.createResource({
  name: 'products',
  description: {
    attributes: {
      name: 'Product name as displayed to customers',
      price: 'Price in cents (e.g., 1999 = $19.99)',
      inStock: 'Whether product is currently available for purchase'
    }
  },
  attributes: {
    name: 'string|required|minlength:3',
    price: 'number|required|min:0',
    inStock: 'boolean|default:true'
  }
});

// Start API with Swagger UI
await db.usePlugin(new ApiPlugin({
  port: 3000,
  docs: {
    ui: 'swagger',  // or 'redoc'
    title: 'Product API',
    version: '1.0.0',
    description: 'E-commerce product catalog API'
  }
}));

// ✨ Visit http://localhost:3000/docs
```

---

## 📚 Three Ways to Add Descriptions

### 1️⃣ Simple Resource Description

Add a single description for the entire resource:

```javascript
await db.createResource({
  name: 'users',
  description: 'User accounts and authentication',
  attributes: {
    email: 'string|required|email',
    name: 'string|required'
  }
});
```

**What you get:**
- Resource description appears in Swagger UI endpoint list
- Generic auto-generated attribute descriptions

**Best for:** Simple resources where attribute names are self-explanatory

---

### 2️⃣ Per-Attribute Descriptions (Object Format)

Provide detailed descriptions for each attribute using the `description` object:

```javascript
await db.createResource({
  name: 'users',
  description: {
    attributes: {
      email: 'User email address (used for login)',
      name: 'Full name of the user',
      role: 'User role (admin, user, or guest)',
      active: 'Whether the account is active and can log in',
      lastLoginAt: 'ISO timestamp of last successful login'
    }
  },
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    role: 'string|default:user',
    active: 'boolean|default:true',
    lastLoginAt: 'string|optional'
  }
});
```

**What you get:**
- Each attribute shows its custom description in Swagger UI
- Helps API consumers understand field purposes
- Great for public APIs and SDKs

**Best for:** Public APIs where clear documentation is critical

---

### 3️⃣ Inline Descriptions (Object Notation)

Define descriptions directly in the attribute definition:

```javascript
await db.createResource({
  name: 'projects',
  attributes: {
    title: {
      type: 'string',
      required: true,
      minlength: 5,
      maxlength: 100,
      description: 'Project title (5-100 characters)'
    },
    status: {
      type: 'string',
      enum: ['active', 'archived', 'completed'],
      default: 'active',
      description: 'Project lifecycle status. Must be one of: active, archived, completed'
    },
    budget: {
      type: 'number',
      min: 0,
      description: 'Project budget in USD (must be non-negative)'
    },
    tags: {
      type: 'array',
      items: 'string',
      optional: true,
      description: 'Searchable tags for project categorization (e.g., ["urgent", "client-facing"])'
    }
  }
});
```

**What you get:**
- Descriptions appear next to validation rules in Swagger UI
- Most detailed and self-documenting approach
- Validation context is clear

**Best for:** Complex schemas with many validation rules and enums

---

## 🎨 Complete Example

Here's a fully documented e-commerce API:

```javascript
import { Database, ApiPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://bucket?region=us-east-1' });
await db.connect();

// Products resource with comprehensive documentation
await db.createResource({
  name: 'products',
  description: {
    attributes: {
      name: 'Product name as displayed to customers',
      sku: 'Stock Keeping Unit - unique product identifier for inventory tracking',
      price: 'Price in cents (e.g., 1999 = $19.99). Use cents to avoid floating point errors',
      category: 'Product category for filtering and navigation',
      inStock: 'Whether product is currently available for purchase. Auto-updated by inventory system',
      tags: 'Searchable tags for product discovery (e.g., ["summer", "sale", "featured"])',
      vendor: 'Vendor/supplier name for B2B tracking',
      publishedAt: 'ISO 8601 timestamp when product was first made available to customers'
    }
  },
  attributes: {
    name: 'string|required|minlength:3|maxlength:200',
    sku: 'string|required|uppercase',
    price: 'number|required|min:0',
    category: {
      type: 'string',
      enum: ['electronics', 'clothing', 'home', 'books'],
      required: true,
      description: 'Must be one of: electronics, clothing, home, books'
    },
    inStock: 'boolean|default:true',
    tags: 'array|items:string|optional',
    vendor: 'string|optional',
    publishedAt: 'string|optional'
  },
  timestamps: true,
  partitions: {
    byCategory: { fields: { category: 'string' } }
  }
});

// Start API with custom branding
await db.usePlugin(new ApiPlugin({
  port: 3000,
  docs: {
    ui: 'swagger',  // or 'redoc' for alternative UI
    title: 'Acme E-Commerce API',
    version: '2.1.0',
    description: 'Product catalog and inventory management API. Supports filtering, pagination, and real-time stock updates.'
  }
}));

console.log('🚀 API running at http://localhost:3000');
console.log('📚 Swagger UI at http://localhost:3000/docs');
console.log('📄 OpenAPI spec at http://localhost:3000/openapi.json');
```

**Result:** Beautiful, self-documenting Swagger UI with:
- Clear field descriptions
- Enum value documentation
- Validation constraints
- Example values
- Partition-based query parameters

---

## 📊 What Gets Documented Automatically

The OpenAPI generator automatically includes:

| Feature | Appears in Swagger UI | Source |
|---------|----------------------|--------|
| **Field types** | ✅ String, number, boolean, array, object | `attributes` definition |
| **Validation rules** | ✅ Min/max, length, pattern, format | String notation (`\|min:0\|max:100`) |
| **Required fields** | ✅ Red asterisk (*) | `required` rule or `\|required` |
| **Default values** | ✅ Shown in schema and examples | `default:` rule |
| **Enum values** | ✅ Dropdown list | `enum: [...]` array |
| **Descriptions** | ✅ Custom text below fields | `description` (3 methods above) |
| **Partitions** | ✅ Query parameters (`?partition=`, `?partitionValues=`) | `partitions` config |
| **Relations** | ✅ `?populate=` parameter | RelationPlugin integration |
| **Timestamps** | ✅ `createdAt`, `updatedAt` fields | `timestamps: true` |
| **Pagination** | ✅ `?limit=`, `?offset=` parameters | Always included |
| **Plugin attributes** | ❌ Hidden (internal use only) | Auto-filtered (see below) |

---

## 🚫 What's Automatically Hidden

**Plugin attributes are filtered from OpenAPI schemas** to keep your API documentation clean and focused on user-defined fields:

**Examples of hidden attributes:**
- `_hasEmbedding` (VectorPlugin)
- `_ttl_expiresAt`, `_ttl_expiresAtCohort` (TTLPlugin)
- `_status`, `_score` (FullTextPlugin)
- Any field starting with `_` added by plugins

**Why hide them?**
- These are internal implementation details
- They're managed automatically by plugins
- API consumers shouldn't interact with them directly
- Keeps Swagger UI clean and predictable

**Still accessible in code:**
```javascript
// You can still access plugin attributes in your code
const doc = await resource.get('doc123');
console.log(doc._hasEmbedding);  // ✅ Works!

// But they won't appear in:
// - Swagger UI
// - OpenAPI schema
// - TypeScript definitions
// - API documentation
```

**Technical Note:** The generator uses `resource.schema` (live attributes including plugins) and filters based on `_pluginAttributes` and `_pluginAttributeMetadata` reverse mappings.

---

## 💡 Best Practices

### ✅ DO: Write Clear, Helpful Descriptions

```javascript
// ✅ GOOD: Clear, explains purpose and format
price: {
  type: 'number',
  required: true,
  min: 0,
  description: 'Product price in cents (e.g., 1999 = $19.99). Use cents to avoid floating point errors.'
}

status: {
  type: 'string',
  enum: ['draft', 'published', 'archived'],
  default: 'draft',
  description: 'Content lifecycle state. "draft" = work in progress, "published" = live on site, "archived" = removed from public view but preserved.'
}
```

### ✅ DO: Document Units and Formats

```javascript
// ✅ GOOD: Specifies units
weight: {
  type: 'number',
  min: 0,
  description: 'Product weight in kilograms (kg)'
}

deliveryTime: {
  type: 'number',
  min: 0,
  description: 'Estimated delivery time in business days'
}

lastSyncedAt: {
  type: 'string',
  optional: true,
  description: 'ISO 8601 timestamp of last successful sync (e.g., "2024-01-15T14:30:00Z")'
}
```

### ✅ DO: Explain Enum Values

```javascript
// ✅ GOOD: Each enum value is documented
priority: {
  type: 'string',
  enum: ['low', 'medium', 'high', 'urgent'],
  default: 'medium',
  description: 'Task priority level:\n- "low": Can be delayed\n- "medium": Normal priority (default)\n- "high": Important, prioritize in sprint\n- "urgent": Requires immediate attention'
}
```

### ✅ DO: Clarify Optional vs Required

```javascript
// ✅ GOOD: Explains when field is needed
phoneNumber: {
  type: 'string',
  optional: true,
  description: 'User phone number (optional, but required for SMS notifications)'
}
```

### ❌ DON'T: Repeat Validation in Description

```javascript
// ❌ BAD: Repeats what's already in the schema
name: {
  type: 'string',
  required: true,
  minlength: 3,
  maxlength: 100,
  description: 'Required name field with min 3 and max 100 characters'
}

// ✅ GOOD: Explains the "why" and "what"
name: {
  type: 'string',
  required: true,
  minlength: 3,
  maxlength: 100,
  description: 'Product name as displayed to customers. Keep concise for mobile displays.'
}
```

### ❌ DON'T: Use Vague Descriptions

```javascript
// ❌ BAD: Doesn't add value
email: {
  type: 'string',
  required: true,
  description: 'The email field'
}

// ✅ GOOD: Adds context
email: {
  type: 'string',
  required: true,
  description: 'User email address (used for login and notifications)'
}
```

### ❌ DON'T: Skip Descriptions for Complex Fields

```javascript
// ❌ BAD: Complex field without explanation
metadata: {
  type: 'object',
  optional: true
  // No description!
}

// ✅ GOOD: Explains structure and purpose
metadata: {
  type: 'object',
  optional: true,
  description: 'Flexible key-value pairs for custom attributes (e.g., {"color": "blue", "size": "XL"}). Keys must be strings, values can be any JSON type.'
}
```

---

## 🎭 Swagger UI vs Redoc

The API Plugin supports two documentation UIs:

### Swagger UI (Default)

```javascript
docs: {
  ui: 'swagger',
  title: 'My API'
}
```

**Features:**
- Interactive "Try it out" testing
- Execute requests directly from docs
- OAuth2/OIDC authentication support
- Request/response examples
- Schema visualization

**Best for:** Internal APIs, testing, development

---

### Redoc

```javascript
docs: {
  ui: 'redoc',
  title: 'My API'
}
```

**Features:**
- Clean, responsive design
- Better for complex schemas
- Three-panel layout
- Markdown support in descriptions
- No "Try it out" (read-only)

**Best for:** Public APIs, external documentation, marketing

---

## 🔗 Related Guides

- **[API Plugin README](./README.md)** - Main plugin documentation
- **[Authentication](./authentication.md)** - Secure your API
- **[Guards](./guards.md)** - Fine-grained permissions
- **[Integrations](./integrations.md)** - Expose plugin data
- **[Deployment](./deployment.md)** - Production setup

---

## 📦 Additional Configuration

### Custom OpenAPI Schema Overrides

```javascript
await db.usePlugin(new ApiPlugin({
  port: 3000,
  docs: {
    ui: 'swagger',
    title: 'My API',
    version: '1.0.0',
    description: 'API description',

    // Custom OpenAPI schema extensions
    servers: [
      { url: 'https://api.example.com', description: 'Production' },
      { url: 'https://staging.api.example.com', description: 'Staging' }
    ],

    contact: {
      name: 'API Support',
      email: 'api@example.com',
      url: 'https://example.com/support'
    },

    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  }
}));
```

### Cache Configuration

OpenAPI schema generation is cached for performance (80-90% speedup):

```javascript
docs: {
  cache: {
    enabled: true,        // Default: true
    ttl: 3600000         // 1 hour (default)
  }
}
```

Cache automatically invalidates when:
- Resources are created/updated/deleted
- Plugin configuration changes
- `apiPlugin.invalidateOpenAPICache()` is called

---

**Status**: ✅ Production-ready - Powers enterprise APIs with beautiful, auto-generated documentation
