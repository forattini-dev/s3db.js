/**
 * Complete TypeScript Usage Example for s3db.js
 *
 * This example demonstrates:
 * - Type-safe database configuration
 * - Creating resources with type checking
 * - Generating custom types for autocomplete
 * - Using all CRUD operations with full type safety
 * - Plugin configuration with types
 */

import {
  Database,
  DatabaseConfig,
  Resource,
  InsertOptions,
  UpdateOptions,
  QueryOptions,
  ListOptions,
  CachePlugin,
  TTLPlugin
} from 's3db.js';
import { generateTypes, GenerateTypesOptions } from 's3db.js/typescript-generator';

// Type-safe configuration
const config: DatabaseConfig = {
  connectionString: process.env.S3DB_CONNECTION_STRING || 's3://test:test@localhost:9000/test-bucket',
  region: 'us-east-1',
  verbose: true,
  parallelism: 10,
  passphrase: 'my-secret-key',
  cache: {
    enabled: true,
    ttl: 3600
  },
  plugins: [
    new CachePlugin({
      driver: 'memory',
      ttl: 1800000
    })
  ]
};

async function example() {
  const db = new Database(config);

  // Create resources with typed attributes
  await db.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required|email',
      age: 'number|min:0|max:150',
      active: 'boolean',
      role: 'string'
    },
    timestamps: true
  });

  // Generate TypeScript types for autocomplete
  await generateTypes(db, { outputPath: './types/database.d.ts' });

  // Now use with full type safety
  const users = db.resources.users;

  // INSERT with type-checked options
  const insertOptions: InsertOptions = {
    id: 'user-001',
    skipValidation: false
  };

  const user = await users.insert({
    name: 'Alice Johnson',
    email: 'alice@example.com',
    age: 28,
    active: true,
    role: 'admin'
  }, insertOptions);

  console.log('Created user:', user.name);

  // UPDATE with merge options
  const updateOptions: UpdateOptions = {
    merge: true
  };

  await users.update(user.id, {
    age: 29
  }, updateOptions);

  // QUERY with filters
  const queryOptions: QueryOptions = {
    limit: 10,
    offset: 0
  };

  const activeUsers = await users.query({
    active: true,
    role: 'admin'
  }, queryOptions);

  console.log(`Found ${activeUsers.length} active admins`);

  // LIST all
  const listOptions: ListOptions = {
    limit: 100
  };

  const allUsers = await users.list(listOptions);
  console.log(`Total users: ${allUsers.length}`);

  // PATCH (fast update)
  await users.patch(user.id, { active: false });

  // REPLACE (full replacement)
  await users.replace(user.id, {
    name: 'Alice J.',
    email: 'alice.j@example.com',
    age: 29,
    active: true,
    role: 'admin'
  });

  // VALIDATION
  const validation = await users.validate({
    name: 'Test',
    email: 'invalid-email'  // Will catch this error!
  });

  if (!validation.valid) {
    console.log('Validation errors:', validation.errors);
  }

  // Cleanup
  await db.stop();
}

example().catch(console.error);
