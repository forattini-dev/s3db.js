import S3DB from "../src/index.js";

// Test configuration
const config = {
  connectionString: "s3://test-bucket",
  passphrase: "secret",
  verbose: true
};

async function testDecryptionErrorHandling() {
  console.log("Testing decryption error handling...");
  
  const db = new S3DB(config);
  const users = db.resource("users", {
    attributes: {
      name: "string",
      email: "string",
      age: "number|optional"
    }
  });

  try {
    // Test page method with potential decryption errors
    console.log("\n1. Testing page method...");
    const page = await users.page({ 
      offset: 0, 
      size: 100,
      skipCount: false 
    });
    
    console.log("Page result:", {
      items: page.items.length,
      totalItems: page.totalItems,
      page: page.page,
      totalPages: page.totalPages,
      debug: page._debug
    });

    // Check for decryption errors in items
    const decryptionErrors = page.items.filter(item => item._decryptionFailed);
    if (decryptionErrors.length > 0) {
      console.log(`Found ${decryptionErrors.length} items with decryption errors:`, 
        decryptionErrors.map(item => ({ id: item.id, error: item._error }))
      );
    }

    // Test list method
    console.log("\n2. Testing list method...");
    const list = await users.list({ limit: 10, offset: 0 });
    console.log("List result:", {
      count: list.length,
      decryptionErrors: list.filter(item => item._decryptionFailed).length
    });

    // Test getMany method
    console.log("\n3. Testing getMany method...");
    if (page.items.length > 0) {
      const ids = page.items.slice(0, 3).map(item => item.id);
      const many = await users.getMany(ids);
      console.log("GetMany result:", {
        requested: ids.length,
        returned: many.length,
        decryptionErrors: many.filter(item => item._decryptionFailed).length
      });
    }

    // Test getAll method
    console.log("\n4. Testing getAll method...");
    const all = await users.getAll();
    console.log("GetAll result:", {
      count: all.length,
      decryptionErrors: all.filter(item => item._decryptionFailed).length
    });

    // Test individual get method
    console.log("\n5. Testing individual get method...");
    if (page.items.length > 0) {
      const testId = page.items[0].id;
      try {
        const user = await users.get(testId);
        console.log("Get result:", {
          id: user.id,
          hasDecryptionError: user._decryptionFailed || false,
          error: user._error || null
        });
      } catch (error) {
        console.log("Get failed:", error.message);
      }
    }

  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

// Run the test
testDecryptionErrorHandling().catch(console.error); 