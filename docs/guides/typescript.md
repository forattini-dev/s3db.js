# 📘 TypeScript Guide

s3db.js is built with TypeScript from the ground up, providing a fully type-safe experience out-of-the-box. This guide will help you set up your project, leverage type definitions, and maximize developer experience with TypeScript.

## 🚀 Getting Started with TypeScript

### 1. Installation

If you haven't already, install TypeScript in your project:

```bash
pnpm add -D typescript @types/node
```

### 2. `tsconfig.json` Configuration

For the best experience, configure your `tsconfig.json` with strict mode enabled. Here's a recommended configuration:

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "es2022",                       /* Specify ECMAScript target version. */
    "module": "esnext",                       /* Specify module code generation. */
    "moduleResolution": "node",               /* Resolve modules using Node.js style. */
    "lib": ["es2022", "dom"],                 /* Specify library files to be included in the compilation. */
    "strict": true,                           /* Enable all strict type-checking options. */
    "esModuleInterop": true,                  /* Enables emit interoperability between CommonJS and ES Modules. */
    "skipLibCheck": true,                     /* Skip type checking of declaration files. */
    "forceConsistentCasingInFileNames": true, /* Disallow inconsistently-cased file names. */
    "outDir": "./dist",                       /* Redirect output structure to the directory. */
    "declaration": true,                      /* Generates corresponding '.d.ts' file. */
    "sourceMap": true,                        /* Generates corresponding '.map' file. */
    "allowSyntheticDefaultImports": true,     /* Allow default imports from modules with no default export. */
    "resolveJsonModule": true,                /* Include modules imported with '.json' extension. */
    "isolatedModules": true,                  /* Ensure that each file can be safely transpiled without relying on other imports. */
    "baseUrl": ".",                           /* Base directory to resolve non-absolute module names. */
    "paths": {
      "s3db.js": ["./node_modules/s3db.js/dist/s3db.es.js"] /* Alias for direct import */
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "mcp/**/*.ts"], /* Specify files to include. */
  "exclude": ["node_modules", "dist"]         /* Specify files to exclude. */
}
```

### 3. Basic Usage & Type Inference

s3db.js exports all its classes and types, allowing TypeScript to automatically infer types:

```typescript
import { S3db, S3dbConfig } from 's3db.js';

// Type-safe configuration
const config: S3dbConfig = {
  connectionString: 's3://KEY:SECRET@bucket/path',
  logLevel: 'debug'
};

const db = new S3db(config);

// TypeScript knows all methods and options on 'db'!
await db.connect();

const usersResource = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required|email'
  }
});

// 'usersResource' is inferred as `Resource<unknown>` or `Resource<any>` by default
// But TypeScript provides autocomplete for its methods (insert, get, list, etc.)
await usersResource.insert({ name: 'Alice', email: 'alice@example.com' });
```

### 4. Leveraging Generics for Resource Typing

For full end-to-end type safety with your data, define TypeScript interfaces for your resource data and use generics with `createResource` and `getResource`:

```typescript
import { S3db, S3dbConfig, Resource } from 's3db.js';

// 1. Define your data interface
interface User {
  id: string; // S3db automatically adds 'id'
  name: string;
  email: string;
  age?: number; // Optional field based on schema
  createdAt?: Date;
  updatedAt?: Date;
}

const db = new S3db({ connectionString: '...' });
await db.connect();

// 2. Create your resource, explicitly typing its data with the User interface
const users = await db.createResource<User>({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required|email',
    age: 'number|min:0'
  },
  timestamps: true // This will add createdAt and updatedAt
});

// 3. Access methods with full type safety
const newUser: Omit<User, 'id' | 'createdAt' | 'updatedAt'> = { // Omit auto-generated fields for insert
  name: 'Alice',
  email: 'alice@example.com',
  age: 30
};

const insertedUser: User = await users.insert(newUser);

console.log(insertedUser.id);       // 'id' is known
console.log(insertedUser.name);     // 'name' is known
console.log(insertedUser.createdAt); // 'createdAt' is known (from timestamps)

// Error: Property 'nme' does not exist on type 'User'.
// console.log(insertedUser.nme); 

const retrievedUser: User | null = await users.get(insertedUser.id);
if (retrievedUser) {
  console.log(`Retrieved user: ${retrievedUser.email}`);
}

const allUsers: User[] = await users.list(); // Returns an array of User objects
```

### 5. Auto-Generating Resource Types

For complex schemas or to reduce manual interface creation, s3db.js can auto-generate TypeScript interfaces directly from your resource definitions.

First, ensure `s3db.js/typescript-generator` is accessible in your build/runtime environment. This utility is designed to be run as part of a script or build step.

```typescript
// scripts/generate-types.ts
import { S3db } from 's3db.js';
import { generateTypes } from 's3db.js/typescript-generator'; // Ensure this path is correct

async function main() {
  const db = new S3db({ connectionString: process.env.S3DB_CONNECTION_STRING });
  await db.connect();

  // Create or load your resources here
  await db.createResource({ name: 'users', attributes: { name: 'string', email: 'email' } });
  await db.createResource({ name: 'products', attributes: { name: 'string', price: 'number' } });

  // Generate types for all resources
  await generateTypes(db, { outputPath: './src/types/generated-s3db.d.ts' });

  await db.disconnect();
  console.log('Generated S3db types to ./src/types/generated-s3db.d.ts');
}

main().catch(console.error);
```

Then, run this script (e.g., using `tsx` or a compiled `node` script):

```bash
# In your package.json scripts:
"generate:s3db-types": "tsx scripts/generate-types.ts"
```

The generated file (`generated-s3db.d.ts`) will contain interfaces like:

```typescript
// src/types/generated-s3db.d.ts (example content)
export interface UsersResource {
  id: string;
  name: string;
  email: string;
}

export interface ProductsResource {
  id: string;
  name: string;
  price: number;
}
```

You can then import and use these interfaces in your application:

```typescript
import { S3db, Resource } from 's3db.js';
import { UsersResource } from './types/generated-s3db'; // Adjust path as needed

const db = new S3db({ connectionString: '...' });
await db.connect();

const users: Resource<UsersResource> = db.getResource('users');

const user = await users.get('some-id');
// user is now fully typed as UsersResource
```

### 6. Tips for a Smooth TypeScript Experience

*   **`tsconfig.json`:** Always use `strict: true` and `esModuleInterop: true`.
*   **Editor Integration:** Ensure your IDE (VS Code recommended) has TypeScript configured correctly for auto-completion and error highlighting.
*   **Type Aliases:** Use type aliases for complex types, especially for plugin configurations or nested attributes.
*   **Type Assertion (`as any`):** Use sparingly. If you find yourself using `as any` frequently, it might indicate a missing type definition or a need to refine your interfaces.
*   **Path Aliases:** Configure `paths` in your `tsconfig.json` (as shown above) to simplify imports (e.g., `s3db.js` instead of `../../node_modules/s3db.js/dist/s3db.es.js`).
*   **`@types/node`:** Essential for Node.js built-in modules (`fs`, `path`, etc.).
