# 🧪 Testing with S3db.js

s3db.js provides powerful utilities (`Factory` and `Seeder`) to streamline your testing workflow, allowing you to easily generate consistent test data and manage your test database state. These tools are designed to work seamlessly with `MemoryClient` for ultra-fast, isolated tests.

## 🚀 Key Features

*   **`MemoryClient` Integration:** Designed for speed, `Factory` and `Seeder` work best with `MemoryClient` for isolated and rapid test execution.
*   **Data Factories:** Define reusable blueprints for creating test data, ensuring consistency and reducing boilerplate.
*   **Database Seeding:** Populate your test database with structured data in a controlled manner.
*   **Snapshot & Restore:** Quickly reset your database state between tests without slow re-initialization.

## 🛠️ Setup

First, ensure you have `vitest` (or your preferred test runner) installed and configured.

```bash
pnpm add -D vitest
```

## 🏭 Data Factories

The `Factory` class allows you to define how your test models are created. It's a declarative way to generate data that conforms to your resource schemas.

### 1. Define a Factory

Create a factory definition for each of your resources. You can place these in a dedicated `tests/factories/` directory.

```typescript
// tests/factories/UserFactory.ts
import { Factory } from 's3db.js/testing';
import { faker } from '@faker-js/faker'; // Install faker-js if you need dynamic data

interface User {
  id: string;
  name: string;
  email: string;
  age?: number;
  role: 'admin' | 'member';
}

Factory.define<User>('user', (options?: { isAdmin?: boolean }) => ({
  name: faker.person.fullName(),
  email: faker.internet.email(),
  age: faker.number.int({ min: 18, max: 80 }),
  role: options?.isAdmin ? 'admin' : 'member',
}));

// You can define factories for all your resources
interface Post {
  id: string;
  title: string;
  content: string;
  userId: string;
}
Factory.define<Post>('post', {
  title: faker.lorem.sentence(),
  content: faker.lorem.paragraphs(),
  userId: () => Factory.create('user').id, // Reference another factory
});
```

### 2. Create Data

Once defined, you can use `Factory.create` or `Factory.createMany` to generate data.

```typescript
import { Factory } from 's3db.js/testing';
import { S3db } from 's3db.js';

// Assume db is an initialized S3db instance
// Assume user and post factories are defined as above

// Set the database instance for factories to interact with resources
// This is typically done in your test setup (e.g., beforeEach)
Factory.setDatabase(db);

// Create a single user
const user = await Factory.create('user', { email: 'custom@example.com' });
console.log(user); 
// { id: 'usr_...', name: '...', email: 'custom@example.com', age: 45, role: 'member' }

// Create multiple users
const admins = await Factory.createMany('user', 5, { isAdmin: true });
console.log(admins.length); // 5

// Create with related data
const post = await Factory.create('post'); // userId will be generated from a new user
console.log(post.userId);
```

## 🌱 Database Seeding

The `Seeder` class orchestrates the creation of data across multiple resources, often using your defined factories. It's perfect for setting up a consistent state for integration tests.

### 1. Initialize the Seeder

```typescript
import { S3db } from 's3db.js';
import { Seeder, Factory } from 's3db.js/testing';

// Assume db is your S3db instance, connected to MemoryClient
const db = new S3db({ connectionString: 'memory://testdb' });
await db.connect();

// Make sure your factories know which database to use
Factory.setDatabase(db); 

const seeder = new Seeder(db);
```

### 2. Define Seed Specifications

You can define a "seed" function that specifies how many records of each type to create.

```typescript
// tests/seeds/initialSeed.ts
import { S3db } => 's3db.js';
import { Factory, Seeder } from 's3db.js/testing';

export async function initialSeed(db: S3db) {
  // Ensure factories are aware of the database context
  Factory.setDatabase(db);

  // Define how many of each resource to create
  const seedSpec = {
    user: 10,  // Create 10 users using the 'user' factory
    post: 50,  // Create 50 posts using the 'post' factory
  };

  const seeder = new Seeder(db);
  const createdData = await seeder.seed(seedSpec);

  console.log('Database seeded:', createdData);
  // { user: [user1, user2, ...], post: [post1, post2, ...] }

  return createdData;
}
```

### 3. Run the Seeder in Tests

```typescript
import { describe, it, beforeEach } from 'vitest';
import { S3db } from 's3db.js';
import { initialSeed } from '../seeds/initialSeed'; // Your seed file

describe('Application Features', () => {
  let db: S3db;
  let seededData: any; // Or type it as { user: User[], post: Post[] }

  beforeEach(async () => {
    db = new S3db({ connectionString: 'memory://app-test' });
    await db.connect();

    // Setup resources (must be done before seeding)
    await db.createResource({ name: 'users', attributes: { /* ... */ } });
    await db.createResource({ name: 'posts', attributes: { /* ... */ } });

    seededData = await initialSeed(db); // Run the seeder

    // You can now access seeded data, e.g., seededData.user[0]
  });

  it('should list all seeded users', async () => {
    const users = await db.getResource('users');
    const allUsers = await users.list();
    expect(allUsers).toHaveLength(seededData.user.length);
  });
});
```

## 🔄 Snapshot & Restore (Performance Optimization)

When using `MemoryClient`, you can save the entire state of your in-memory database and restore it later. This is incredibly fast and allows you to reset your test environment without re-running factories or seeders.

```typescript
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { S3db, Resource } from 's3db.js';
import { initialSeed } from '../seeds/initialSeed';

describe('User Management', () => {
  let db: S3db;
  let users: Resource<any>; // Or Resource<User>
  let initialSnapshot: any; // Type of MemoryClient snapshot

  beforeEach(async () => {
    db = new S3db({ connectionString: 'memory://user-tests' });
    await db.connect();

    // Create resources
    users = await db.createResource({ name: 'users', attributes: { name: 'string' } });

    // Seed initial data once
    await initialSeed(db);

    // Take a snapshot of the database after initial setup
    initialSnapshot = db.client.snapshot();
  });

  afterEach(() => {
    // Restore the database to its initial state before each test
    // This is much faster than re-seeding for every test
    if (initialSnapshot) {
      db.client.restore(initialSnapshot);
    }
  });

  it('should add a new user without affecting other tests', async () => {
    const originalCount = (await users.list()).length;
    await users.insert({ id: 'u100', name: 'New Test User' });
    const newCount = (await users.list()).length;
    expect(newCount).toBe(originalCount + 1);
  });

  it('should find existing seeded users', async () => {
    // This assumes initialSeed exports the createdData, which it does.
    // However, for this example to work correctly, initialSeed needs to return
    // the created data so it can be accessed here. Let's adjust for clarity.
    const seededUsers = (await initialSeed(db)).user;
    const user = await users.get(seededUsers[0].id);
    expect(user).toBeDefined();
    expect(user?.name).toEqual(seededUsers[0].name);
  });
});
```

## ⚠️ Important Considerations

*   **`MemoryClient` Only:** Snapshot/restore functionality is specific to `MemoryClient`. It is not available for `S3Client` or `FilesystemClient`.
*   **Performance:** While `MemoryClient` is fast, `snapshot()` and `restore()` still involve copying data. For very large test datasets, consider if re-seeding smaller, specific data per test is more efficient.
*   **Side Effects:** Ensure your factories and seeders are idempotent or that `snapshot`/`restore` adequately isolate state if you are modifying global resources within `beforeEach`.

---

## 🔗 Next Steps

*   [MemoryClient Documentation](/clients/memory-client.md)
*   [Performance Tuning Guide](/guides/performance-tuning.md)
*   [Core Concepts: Resources](/core/resource.md)
