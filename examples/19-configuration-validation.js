import S3DB from "../src/index.js";

// Test configuration
const config = {
  connectionString: "s3://test-bucket",
  passphrase: "my-super-secret-passphrase-2024",
  verbose: true
};

async function testConfigurationValidation() {
  console.log("Testing configuration validation...");
  
  const db = new S3DB(config);
  
  // Test 1: Valid configuration
  console.log("\n1. Testing valid configuration...");
  try {
    const users = await db.createResource({
      name: "users",
      attributes: {
        name: "string|required",
        email: "string|required",
        password: "secret|required"
      },
      behavior: "user-management",
      timestamps: true,
      partitions: {
        byRegion: {
          fields: { region: "string" }
        }
      },
      paranoid: true,
      hooks: {
        preInsert: [
          async (data) => {
            console.log("Pre-insert hook executed");
            return data;
          }
        ]
      }
    });
    console.log("✅ Valid configuration accepted");
  } catch (error) {
    console.error("❌ Unexpected error:", error.message);
  }

  // Test 2: Missing required fields
  console.log("\n2. Testing missing required fields...");
  try {
    await db.createResource({
      // Missing name
      attributes: { name: "string" }
    });
    console.log("❌ Should have failed - missing name");
  } catch (error) {
    console.log("✅ Correctly caught missing name:", error.message.includes("name"));
  }

  try {
    await db.createResource({
      name: "users",
      // Missing attributes
    });
    console.log("❌ Should have failed - missing attributes");
  } catch (error) {
    console.log("✅ Correctly caught missing attributes:", error.message.includes("attributes"));
  }

  // Test 3: Invalid field types
  console.log("\n3. Testing invalid field types...");
  try {
    await db.createResource({
      name: 123, // Should be string
      attributes: { name: "string" }
    });
    console.log("❌ Should have failed - invalid name type");
  } catch (error) {
    console.log("✅ Correctly caught invalid name type:", error.message.includes("string"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      timestamps: "not-a-boolean" // Should be boolean
    });
    console.log("❌ Should have failed - invalid timestamps type");
  } catch (error) {
    console.log("✅ Correctly caught invalid timestamps type:", error.message.includes("boolean"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      parallelism: "not-a-number" // Should be number
    });
    console.log("❌ Should have failed - invalid parallelism type");
  } catch (error) {
    console.log("✅ Correctly caught invalid parallelism type:", error.message.includes("integer"));
  }

  // Test 4: Invalid partitions
  console.log("\n4. Testing invalid partitions...");
  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      partitions: {
        byRegion: "not-an-object" // Should be object
      }
    });
    console.log("❌ Should have failed - invalid partition type");
  } catch (error) {
    console.log("✅ Correctly caught invalid partition type:", error.message.includes("object"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      partitions: {
        byRegion: {
          // Missing fields property
        }
      }
    });
    console.log("❌ Should have failed - missing fields property");
  } catch (error) {
    console.log("✅ Correctly caught missing fields property:", error.message.includes("fields"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      partitions: {
        byRegion: {
          fields: {
            region: 123 // Should be string
          }
        }
      }
    });
    console.log("❌ Should have failed - invalid field type in partition");
  } catch (error) {
    console.log("✅ Correctly caught invalid field type in partition:", error.message.includes("string"));
  }

  // Test 5: Invalid hooks
  console.log("\n5. Testing invalid hooks...");
  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      hooks: {
        invalidEvent: [] // Invalid event name
      }
    });
    console.log("❌ Should have failed - invalid hook event");
  } catch (error) {
    console.log("✅ Correctly caught invalid hook event:", error.message.includes("Invalid hook event"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      hooks: {
        preInsert: "not-an-array" // Should be array
      }
    });
    console.log("❌ Should have failed - invalid hooks array");
  } catch (error) {
    console.log("✅ Correctly caught invalid hooks array:", error.message.includes("array"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      hooks: {
        preInsert: [
          "not-a-function" // Should be function
        ]
      }
    });
    console.log("❌ Should have failed - invalid hook function");
  } catch (error) {
    console.log("✅ Correctly caught invalid hook function:", error.message.includes("function"));
  }

  // Test 6: Edge cases
  console.log("\n6. Testing edge cases...");
  try {
    await db.createResource({
      name: "", // Empty string
      attributes: { name: "string" }
    });
    console.log("❌ Should have failed - empty name");
  } catch (error) {
    console.log("✅ Correctly caught empty name:", error.message.includes("empty"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: {} // Empty attributes
    });
    console.log("❌ Should have failed - empty attributes");
  } catch (error) {
    console.log("✅ Correctly caught empty attributes:", error.message.includes("empty"));
  }

  try {
    await db.createResource({
      name: "users",
      attributes: { name: "string" },
      parallelism: 0 // Should be > 0
    });
    console.log("❌ Should have failed - parallelism <= 0");
  } catch (error) {
    console.log("✅ Correctly caught parallelism <= 0:", error.message.includes("greater than 0"));
  }

  // Test 7: Complex valid configuration
  console.log("\n7. Testing complex valid configuration...");
  try {
    const complexUsers = await db.createResource({
      name: "complex-users",
      attributes: {
        name: "string|required",
        email: "string|required",
        password: "secret|required",
        age: "number|optional",
        profile: {
          bio: "string|optional",
          avatar: "url|optional"
        },
        tags: "array|items:string",
        metadata: "object|optional"
      },
      behavior: "body-overflow",
      timestamps: true,
      partitions: {
        byRegion: {
          fields: { region: "string" }
        },
        byDepartment: {
          fields: { department: "string" }
        },
        byAge: {
          fields: { age: "number" }
        }
      },
      paranoid: false,
      allNestedObjectsOptional: true,
      autoDecrypt: true,
      cache: true,
      parallelism: 25,
      hooks: {
        preInsert: [
          async (data) => {
            console.log("Pre-insert hook 1");
            return data;
          },
          async (data) => {
            console.log("Pre-insert hook 2");
            return data;
          }
        ],
        afterInsert: [
          async (data) => {
            console.log("After-insert hook");
            return data;
          }
        ],
        preUpdate: [
          async (data) => {
            console.log("Pre-update hook");
            return data;
          }
        ],
        afterUpdate: [
          async (data) => {
            console.log("After-update hook");
            return data;
          }
        ],
        preDelete: [
          async (data) => {
            console.log("Pre-delete hook");
            return data;
          }
        ],
        afterDelete: [
          async (data) => {
            console.log("After-delete hook");
            return data;
          }
        ]
      }
    });
    console.log("✅ Complex valid configuration accepted");
    console.log("Resource config:", {
      name: complexUsers.name,
      behavior: complexUsers.behavior,
      timestamps: complexUsers.config.timestamps,
      partitions: Object.keys(complexUsers.config.partitions),
      paranoid: complexUsers.config.paranoid,
      cache: complexUsers.config.cache,
      parallelism: complexUsers.parallelism
    });
  } catch (error) {
    console.error("❌ Unexpected error with complex config:", error.message);
  }

  console.log("\n✅ Configuration validation tests completed!");
}

// Run the test
testConfigurationValidation().catch(console.error); 