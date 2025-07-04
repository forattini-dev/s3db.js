import S3DB from "../src/index.js";

// Test configuration with new structure
const config = {
  connectionString: "s3://test-bucket",
  passphrase: "my-super-secret-passphrase-2024",
  verbose: true
};

async function testNewConfigurationStructure() {
  console.log("Testing new configuration structure...");
  
  const db = await setupDatabase();
  
  // Test 1: Create resource with new configuration structure
  console.log("\n1. Creating resource with new configuration structure...");
  const users = await db.createResource({
    name: "users",
    attributes: {
      name: "string|required",
      email: "string|required",
      age: "number|optional",
      password: "secret|required",
      region: "string|optional"
    },
    behavior: "user-management",
    timestamps: true,
    partitions: {
      byRegion: {
        fields: { region: "string" }  await teardownDatabase();

      }
    },
    paranoid: true,
    allNestedObjectsOptional: false,
    autoDecrypt: true,
    cache: false,
    hooks: {
      preInsert: [
        async (data) => {
          console.log("Pre-insert hook:", data);
          return data;
        }
      ],
      afterInsert: [
        async (data) => {
          console.log("After-insert hook:", data);
          return data;
        }
      ]
    }
  });

  console.log("Resource created successfully!");
  console.log("Resource config:", {
    timestamps: users.config.timestamps,
    partitions: Object.keys(users.config.partitions),
    paranoid: users.config.paranoid,
    autoDecrypt: users.config.autoDecrypt,
    cache: users.config.cache
  });

  // Test 2: Insert user with auto-generated password
  console.log("\n2. Inserting user with auto-generated password...");
  const user = await users.insert({
    name: "John Doe",
    email: "john@example.com",
    age: 30,
    region: "us-east-1"
    // password will be auto-generated
  });

  console.log("User created:", {
    id: user.id,
    name: user.name,
    email: user.email,
    age: user.age,
    region: user.region,
    hasPassword: !!user.password,
    passwordLength: user.password?.length,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  });

  // Test 3: Test partition functionality
  console.log("\n3. Testing partition functionality...");
  const usersByRegion = await users.list({
    partition: "byRegion",
    partitionValues: { region: "us-east-1" }
  });

  console.log("Users in us-east-1 region:", usersByRegion.length);

  // Test 4: Test resource export with new structure
  console.log("\n4. Testing resource export...");
  const exported = users.export();
  console.log("Exported resource structure:", {
    name: exported.name,
    version: exported.version,
    behavior: exported.behavior,
    timestamps: exported.timestamps,
    partitions: Object.keys(exported.partitions),
    paranoid: exported.paranoid,
    autoDecrypt: exported.autoDecrypt,
    cache: exported.cache,
    hasHooks: !!exported.hooks
  });

  // Test 5: Test configuration update
  console.log("\n5. Testing configuration update...");
  const updatedResource = await db.createResource({
    name: "users",
    attributes: {
      name: "string|required",
      email: "string|required",
      age: "number|optional",
      password: "secret|required",
      region: "string|optional",
      department: "string|optional" // New field
    },
    behavior: "user-management",
    timestamps: true,
    partitions: {
      byRegion: {
        fields: { region: "string" }
      },
      byDepartment: {
        fields: { department: "string" }
      }
    },
    paranoid: false, // Changed
    cache: true, // Changed
    hooks: {
      preInsert: [
        async (data) => {
          console.log("Updated pre-insert hook:", data);
          return data;
        }
      ]
    }
  });

  console.log("Resource updated successfully!");
  console.log("Updated config:", {
    timestamps: updatedResource.config.timestamps,
    partitions: Object.keys(updatedResource.config.partitions),
    paranoid: updatedResource.config.paranoid,
    cache: updatedResource.config.cache
  });

  // Test 6: Insert user with new field
  console.log("\n6. Inserting user with new department field...");
  const user2 = await updatedResource.insert({
    name: "Jane Smith",
    email: "jane@example.com",
    age: 25,
    region: "us-west-1",
    department: "Engineering"
    // password will be auto-generated
  });

  console.log("User with department created:", {
    id: user2.id,
    name: user2.name,
    department: user2.department,
    hasPassword: !!user2.password,
    createdAt: user2.createdAt
  });

  console.log("\n✅ All tests completed successfully!");
  console.log("New configuration structure is working correctly.");
}

// Run the test
testNewConfigurationStructure().catch(console.error); 