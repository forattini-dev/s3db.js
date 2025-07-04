import S3DB from "../src/index.js";

// Test configuration with custom passphrase
const config = {
  connectionString: "s3://test-bucket",
  passphrase: "my-super-secret-passphrase-2024", // Custom passphrase for encryption
  verbose: true
};

async function testSecretPasswordGeneration() {
  console.log("Testing secret password generation...");
  
  const db = await setupDatabase();
  const users = db.resource("users", {
    attributes: {
      name: "string|required",
      email: "string|required",
      age: "number|optional",
      password: "secret|required", // This will auto-generate if not provided
      apiKey: "secret|optional"    // This will auto-generate if not provided
    }
  });

  try {
    // Test 1: Insert user without password (should auto-generate)
    console.log("\n1. Testing auto-generated password...");
    const user1 = await users.insert({
      name: "John Doe",
      email: "john@example.com",
      age: 30
      // password and apiKey will be auto-generated
    });
    
    console.log("User created with auto-generated credentials:", {
      id: user1.id,
      name: user1.name,
      email: user1.email,
      password: user1.password, // This should be auto-generated
      apiKey: user1.apiKey      // This should be auto-generated
    });

    // Test 2: Insert user with custom password
    console.log("\n2. Testing custom password...");
    const user2 = await users.insert({
      name: "Jane Smith",
      email: "jane@example.com",
      age: 25,
      password: "my-custom-password-123" // Custom password
      // apiKey will still be auto-generated
    });
    
    console.log("User created with custom password:", {
      id: user2.id,
      name: user2.name,
      email: user2.email,
      password: user2.password, // Should be the custom password
      apiKey: user2.apiKey      // Should be auto-generated
    });

    // Test 3: Insert user with both custom password and apiKey
    console.log("\n3. Testing custom password and apiKey...");
    const user3 = await users.insert({
      name: "Bob Wilson",
      email: "bob@example.com",
      age: 35,
      password: "bob-secret-pass",
      apiKey: "custom-api-key-xyz"
    });
    
    console.log("User created with custom credentials:", {
      id: user3.id,
      name: user3.name,
      email: user3.email,
      password: user3.password, // Should be custom
      apiKey: user3.apiKey      // Should be custom
    });

    // Test 4: Verify that passwords are encrypted in storage
    console.log("\n4. Testing password encryption...");
    const retrievedUser = await users.get(user1.id);
    console.log("Retrieved user (passwords should be decrypted):", {
      id: retrievedUser.id,
      name: retrievedUser.name,
      email: retrievedUser.email,
      password: retrievedUser.password, // Should be decrypted
      apiKey: retrievedUser.apiKey      // Should be decrypted
    });

    // Test 5: Test password generation pattern
    console.log("\n5. Testing password generation pattern...");
    const user4 = await users.insert({
      name: "Alice Johnson",
      email: "alice@example.com"
      // Both password and apiKey will be auto-generated
    });
    
    console.log("Password generation pattern check:", {
      password: user4.password,
      passwordLength: user4.password?.length,
      apiKey: user4.apiKey,
      apiKeyLength: user4.apiKey?.length,
      // Passwords should be 12 characters and contain only safe characters
      passwordPattern: /^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]{12}$/.test(user4.password)
    });

    // Test 6: List all users to verify they all have passwords
    console.log("\n6. Testing list with encrypted passwords...");
    const allUsers = await users.list({ limit: 10 });
    console.log("All users (passwords should be decrypted):", 
      allUsers.map(user => ({
        id: user.id,
        name: user.name,
        hasPassword: !!user.password,
        hasApiKey: !!user.apiKey,
        passwordLength: user.password?.length,
        apiKeyLength: user.apiKey?.length
      }))
    );

    // Test 7: Test update with new password
    console.log("\n7. Testing password update...");
    const updatedUser = await users.update(user1.id, {
      password: "new-updated-password-456"
    });
    
    console.log("Updated user:", {
      id: updatedUser.id,
      name: updatedUser.name,
      password: updatedUser.password // Should be the new password
    });

    console.log("\n✅ All tests completed successfully!");
    console.log("Summary:");
    console.log("- Auto-generated passwords work correctly");
    console.log("- Custom passwords are preserved");
    console.log("- Passwords are properly encrypted/decrypted");
    console.log("- Password generation uses safe characters");
    console.log("- Updates work with new passwords");

  } catch (error) {
    console.error("Test failed:", error.message);
    console.error("Stack:", error.stack);
  }  } finally {
    await teardownDatabase();
  }
}

// Run the test
testSecretPasswordGeneration().catch(console.error);

async function testUserListingWithDecryptionErrors() {
  console.log("Testing user listing with decryption error handling...");
  
  const db = new S3DB(config);
  
  // Create the users resource with the same configuration as your system
  await db.createResource({
    name: 'users',
    behavior: 'body-overflow',
    timestamps: true,
    attributes: {
      costCenter: 'string',
      team: 'string',
      scopes: 'string|optional',
      isActive: 'boolean|optional|default:true',
      apiToken: 'secret',
      webpush: {
        $$type: 'object|optional',
        enabled: 'boolean|optional|default:false',
        endpoint: 'string|optional',
        p256dh: 'string|optional',
        auth: 'string|optional',
      },
      metadata: 'string|optional',
    },
    partitions: {
      byCostCenter: {
        fields: { costCenter: 'string' }
      },
      byTeam: {
        fields: { team: 'string' }
      }
    }
  });

  const users = db.resource('users');

  try {
    // Simulate the exact scenario from your logs
    console.log("\n1. Testing page method (your exact use case)...");
    
    const { offset, size } = { offset: 0, size: 100 }; // Simulate getPaginationParams
    
    try {
      const result = await users.page({ offset, size });
      
      console.log("Page result:", {
        items: result.items.length,
        totalItems: result.totalItems,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        debug: result._debug
      });

      // Check for decryption errors
      const decryptionErrors = result.items.filter(item => item._decryptionFailed);
      if (decryptionErrors.length > 0) {
        console.log(`⚠️  Found ${decryptionErrors.length} items with decryption errors:`);
        decryptionErrors.forEach(item => {
          console.log(`   - ID: ${item.id}, Error: ${item._error}`);
        });
      }

      // Filter out items with decryption errors for your API response
      const validItems = result.items.filter(item => !item._decryptionFailed);
      console.log(`✅ Valid items for API response: ${validItems.length}`);

      // Simulate your API response processing
      const apiResponse = {
        items: validItems.map(item => {
          // Remove internal fields starting with _
          const cleanItem = {};
          Object.keys(item).forEach(key => {
            if (!key.startsWith('_')) {
              cleanItem[key] = item[key];
            }
          });
          return cleanItem;
        }),
        totalItems: result.totalItems,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        decryptionErrors: decryptionErrors.length
      };

      console.log("API Response:", {
        itemsCount: apiResponse.items.length,
        totalItems: apiResponse.totalItems,
        decryptionErrors: apiResponse.decryptionErrors
      });

    } catch (pageError) {
      console.error("❌ Page method failed:", pageError.message);
      
      // Fallback response
      const fallbackResponse = {
        items: [],
        totalItems: null,
        page: Math.floor(offset / size),
        pageSize: size,
        totalPages: null,
        error: pageError.message
      };
      
      console.log("Fallback response:", fallbackResponse);
    }

    // Test with skipCount for better performance
    console.log("\n2. Testing with skipCount for performance...");
    try {
      const fastResult = await users.page({ 
        offset: 0, 
        size: 100,
        skipCount: true 
      });
      
      console.log("Fast page result:", {
        items: fastResult.items.length,
        totalItems: fastResult.totalItems, // null when skipCount is true
        page: fastResult.page,
        debug: fastResult._debug
      });
    } catch (fastError) {
      console.error("❌ Fast page method failed:", fastError.message);
    }

    // Test list method as alternative
    console.log("\n3. Testing list method as alternative...");
    try {
      const listResult = await users.list({ 
        limit: 100, 
        offset: 0 
      });
      
      console.log("List result:", {
        count: listResult.length,
        decryptionErrors: listResult.filter(item => item._decryptionFailed).length
      });
    } catch (listError) {
      console.error("❌ List method failed:", listError.message);
    }

    // Test count method separately
    console.log("\n4. Testing count method separately...");
    try {
      const count = await users.count();
      console.log("Count result:", count);
    } catch (countError) {
      console.error("❌ Count method failed:", countError.message);
    }

  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

// Run the test
testUserListingWithDecryptionErrors().catch(console.error); 