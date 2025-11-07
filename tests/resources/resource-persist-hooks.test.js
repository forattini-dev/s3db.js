import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import { createDatabaseForTest } from "../config.js";

describe("Resource Hook Persistence", () => {
  let db;

  beforeEach(async () => {
    db = await createDatabaseForTest("suite=resources/persist-hooks", {
      persistHooks: true // Enable hook persistence for testing
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) {
      await db.disconnect();
    }
  });

  test("should serialize hooks to strings when persistHooks is enabled", async () => {
    const executionLog = [];
    
    const resource = await db.createResource({
      name: "test_users",
      behavior: "user-managed",
      attributes: {
        name: "string",
        email: "string"
      },
      hooks: {
        beforeInsert: [
          function validateEmail(user) {
            executionLog.push("validateEmail executed");
            if (!user.email || !user.email.includes("@")) {
              throw new Error("Invalid email format");
            }
            return user;
          }
        ],
        afterInsert: [
          function logUser(user) {
            executionLog.push("logUser executed");
            return user;
          }
        ]
      }
    });

    // Test that hooks work
    const testUser = { name: "John Doe", email: "john@example.com" };
    executionLog.length = 0;
    
    const insertedUser = await resource.insert(testUser);
    
    expect(executionLog).toContain("validateEmail executed");
    expect(executionLog).toContain("logUser executed");
    expect(insertedUser.email).toBe("john@example.com");
  });

  test("should restore hooks from serialized form when reconnecting", async () => {
    const originalDb = db;
    
    // Create resource with hooks
    await originalDb.createResource({
      name: "persisted_users",
      behavior: "user-managed",
      attributes: {
        name: "string",
        email: "string"
      },
      hooks: {
        beforeInsert: [
          function validateUser(user) {
            if (!user.name || user.name.length < 2) {
              throw new Error("Name too short");
            }
            return user;
          }
        ]
      }
    });

    const originalConnectionString = originalDb.options.connectionString;
    await originalDb.disconnect();

    // Create new database instance to same location
    const newDb = await createDatabaseForTest("suite=resources/persist-hooks-restore", {
      persistHooks: true,
      connectionString: originalConnectionString
    });
    
    await newDb.connect();

    const restoredResource = newDb.resources.persisted_users;
    
    // Test that restored hooks work
    await expect(restoredResource.insert({ name: "X", email: "x@test.com" }))
      .rejects.toThrow("Name too short");
    
    const validUser = await restoredResource.insert({ 
      name: "Valid Name", 
      email: "valid@test.com" 
    });
    
    expect(validUser.name).toBe("Valid Name");
    
    await newDb.disconnect();
  });

  test("should handle hook serialization errors gracefully", async () => {
    const db = await createDatabaseForTest("suite=resources/persist-hooks-serialization", {
      persistHooks: true,
      verbose: false
    });

    const resource = await db.createResource({
      name: "test_serialization",
      behavior: "user-managed",
      attributes: {
        name: "string"
      },
      hooks: {
        beforeInsert: [
          // Normal function that should serialize
          function normalHook(data) {
            return data;
          },
          // Function with closure that may not serialize perfectly
          (() => {
            const closure = "closureValue";
            return function closureHook(data) {
              // This references closure variable
              return data;
            };
          })()
        ]
      }
    });

    // Should still work even with closure functions
    const result = await resource.insert({ name: "test" });
    expect(result.name).toBe("test");

    await db.disconnect();
  });

  test("should not serialize hooks when persistHooks is false", async () => {
    const db = await createDatabaseForTest("suite=resources/persist-hooks-disabled", {
      persistHooks: false
    });

    await db.createResource({
      name: "non_persisted",
      behavior: "user-managed",
      attributes: {
        name: "string"
      },
      hooks: {
        beforeInsert: [
          function testHook(data) {
            return data;
          }
        ]
      }
    });

    // Hooks should still work in current session
    const resource = db.resources.non_persisted;
    const result = await resource.insert({ name: "test" });
    expect(result.name).toBe("test");

    await db.disconnect();
  });

  test("should handle empty or invalid hooks gracefully", async () => {
    const db = await createDatabaseForTest("suite=resources/persist-hooks-empty", {
      persistHooks: true
    });

    // Test with empty hooks
    const resource1 = await db.createResource({
      name: "empty_hooks",
      behavior: "user-managed",
      attributes: {
        name: "string"
      },
      hooks: {}
    });

    const result1 = await resource1.insert({ name: "test1" });
    expect(result1.name).toBe("test1");

    // Test with null hooks
    const resource2 = await db.createResource({
      name: "null_hooks",
      behavior: "user-managed",
      attributes: {
        name: "string"
      },
      hooks: null
    });

    const result2 = await resource2.insert({ name: "test2" });
    expect(result2.name).toBe("test2");

    await db.disconnect();
  });

  test("should preserve hook function names in serialization", async () => {
    const db = await createDatabaseForTest("suite=resources/persist-hooks-names", {
      persistHooks: true
    });

    await db.createResource({
      name: "named_hooks",
      behavior: "user-managed",
      attributes: {
        name: "string"
      },
      hooks: {
        beforeInsert: [
          function namedHookFunction(data) {
            return data;
          }
        ]
      }
    });

    const originalConnectionString = db.options.connectionString;
    await db.disconnect();

    // Reconnect and verify hooks are restored
    const newDb = await createDatabaseForTest("suite=resources/persist-hooks-names-restore", {
      persistHooks: true,
      connectionString: originalConnectionString
    });
    
    await newDb.connect();

    const resource = newDb.resources.named_hooks;
    const result = await resource.insert({ name: "test" });
    expect(result.name).toBe("test");

    await newDb.disconnect();
  });
}); 