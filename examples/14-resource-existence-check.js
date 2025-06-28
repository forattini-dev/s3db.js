import S3db from "../src/index.js";

// Example demonstrating resource existence checking and conditional creation
async function main() {
  const db = new S3db({
    connectionString: "s3://test-bucket",
    verbose: true,
  });

  await db.connect();

  const userAttributes = {
    name: "string|required",
    email: "string|required|email",
    age: "number|optional"
  };

  const userOptions = {
    timestamps: true,
    partitions: {
      byAge: {
        fields: {
          age: "number|maxlength:2"
        }
      }
    }
  };

  console.log("=== Resource Existence Check Example ===\n");

  // 1. Check if resource exists (should be false initially)
  console.log("1. Checking if 'users' resource exists:");
  const exists1 = db.resourceExists("users");
  console.log(`   Resource exists: ${exists1}\n`);

  // 2. Create resource for the first time
  console.log("2. Creating 'users' resource for the first time:");
  const result1 = await db.createResourceIfNotExists({
    name: "users",
    attributes: userAttributes,
    options: userOptions,
    behavior: "user-management"
  });
  console.log(`   Created: ${result1.created}`);
  console.log(`   Reason: ${result1.reason}\n`);

  // 3. Check if resource exists now (should be true)
  console.log("3. Checking if 'users' resource exists after creation:");
  const exists2 = db.resourceExists("users");
  console.log(`   Resource exists: ${exists2}\n`);

  // 4. Try to create the same resource again with identical definition
  console.log("4. Trying to create 'users' resource again with same definition:");
  const result2 = await db.createResourceIfNotExists({
    name: "users",
    attributes: userAttributes,
    options: userOptions,
    behavior: "user-management"
  });
  console.log(`   Created: ${result2.created}`);
  console.log(`   Reason: ${result2.reason}\n`);

  // 5. Check hash comparison directly
  console.log("5. Checking hash comparison:");
  const hashCheck = db.resourceExistsWithSameHash({
    name: "users",
    attributes: userAttributes,
    options: userOptions,
    behavior: "user-management"
  });
  console.log(`   Exists: ${hashCheck.exists}`);
  console.log(`   Same hash: ${hashCheck.sameHash}`);
  console.log(`   New hash: ${hashCheck.hash}`);
  console.log(`   Existing hash: ${hashCheck.existingHash}\n`);

  // 6. Try to create resource with different attributes
  console.log("6. Trying to create 'users' resource with different attributes:");
  const modifiedAttributes = {
    name: "string|required",
    email: "string|required|email",
    age: "number|optional",
    phone: "string|optional" // Added new field
  };
  
  const result3 = await db.createResourceIfNotExists({
    name: "users",
    attributes: modifiedAttributes,
    options: userOptions,
    behavior: "user-management"
  });
  console.log(`   Created: ${result3.created}`);
  console.log(`   Reason: ${result3.reason}\n`);

  // 7. Check hash comparison with different attributes
  console.log("7. Checking hash comparison with different attributes:");
  const hashCheck2 = db.resourceExistsWithSameHash({
    name: "users",
    attributes: modifiedAttributes,
    options: userOptions,
    behavior: "user-management"
  });
  console.log(`   Exists: ${hashCheck2.exists}`);
  console.log(`   Same hash: ${hashCheck2.sameHash}`);
  console.log(`   New hash: ${hashCheck2.hash}`);
  console.log(`   Existing hash: ${hashCheck2.existingHash}\n`);

  // 8. Create a completely different resource
  console.log("8. Creating a different resource 'products':");
  const productAttributes = {
    name: "string|required",
    price: "number|required",
    category: "string|optional"
  };

  const result4 = await db.createResourceIfNotExists({
    name: "products",
    attributes: productAttributes,
    options: { timestamps: true },
    behavior: "user-management"
  });
  console.log(`   Created: ${result4.created}`);
  console.log(`   Reason: ${result4.reason}\n`);

  // 9. List all resources
  console.log("9. Listing all resources:");
  const resources = await db.listResources();
  console.log(`   Resources: ${resources.map(r => r.name).join(", ")}\n`);

  // 10. Demonstrate that createResource still works but creates versions unnecessarily
  console.log("10. Demonstrating createResource behavior (creates versions unnecessarily):");
  console.log("    Calling createResource with same definition multiple times...");
  
  for (let i = 0; i < 3; i++) {
    await db.createResource({
      name: "test-resource",
      attributes: { name: "string|required" },
      options: { timestamps: false }
    });
    console.log(`    Call ${i + 1}: Resource created/updated`);
  }
  console.log("    Note: Each call creates a new version even with same hash!\n");

  // 11. Demonstrate createResourceIfNotExists prevents unnecessary versions
  console.log("11. Demonstrating createResourceIfNotExists behavior (prevents unnecessary versions):");
  console.log("    Calling createResourceIfNotExists with same definition multiple times...");
  
  for (let i = 0; i < 3; i++) {
    const result = await db.createResourceIfNotExists({
      name: "safe-test-resource",
      attributes: { name: "string|required" },
      options: { timestamps: false }
    });
    console.log(`    Call ${i + 1}: ${result.created ? 'Created' : 'Skipped'} - ${result.reason}`);
  }

  console.log("\n=== Example completed ===");
}

main().catch(console.error); 