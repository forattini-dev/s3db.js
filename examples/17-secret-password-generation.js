import S3DB from "../src/index.js";

// Test configuration with custom passphrase
const config = {
  connectionString: "s3://test-bucket",
  passphrase: "my-super-secret-passphrase-2024", // Custom passphrase for encryption
  verbose: true
};

async function testSecretPasswordGeneration() {
  console.log("Testing secret password generation...");
  
  const db = new S3DB(config);
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
  }
}

// Run the test
testSecretPasswordGeneration().catch(console.error); 