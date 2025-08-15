import S3DB from "../src/index.js";

// Test configuration
const config = {
  connectionString: "s3://test-bucket",
  passphrase: "secret",
  verbose: true
};

async function testDecryptionErrorHandling() {
  console.log("Testing decryption error handling...");
  
  const db = await setupDatabase();
  const users = db.resource("users", {
    attributes: {
      name: "string",
      email: "string",
      age: "number|optional"
    }
  });

  try {
    // Test page method with potential decryption errors
    console.log("\n1. Testing page method with error handling...");
    try {
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
    } catch (pageError) {
      console.log("Page method failed:", pageError.message);
    }

    // Test list method with error handling
    console.log("\n2. Testing list method with error handling...");
    try {
      const list = await users.list({ limit: 10, offset: 0 });
      console.log("List result:", {
        count: list.length,
        decryptionErrors: list.filter(item => item._decryptionFailed).length
      });
    } catch (listError) {
      console.log("List method failed:", listError.message);
    }

    // Test getMany method with error handling
    console.log("\n3. Testing getMany method with error handling...");
    try {
      // Try to get some IDs first
      const ids = await users.listIds({ limit: 3 });
      if (ids.length > 0) {
        const many = await users.getMany(ids);
        console.log("GetMany result:", {
          requested: ids.length,
          returned: many.length,
          decryptionErrors: many.filter(item => item._decryptionFailed).length
        });
      } else {
        console.log("No IDs found for getMany test");
      }  } finally {
    await teardownDatabase();
  }
    } catch (getManyError) {
      console.log("GetMany method failed:", getManyError.message);
    }

    // Test getAll method with error handling
    console.log("\n4. Testing getAll method with error handling...");
    try {
      const all = await users.getAll();
      console.log("GetAll result:", {
        count: all.length,
        decryptionErrors: all.filter(item => item._decryptionFailed).length
      });
    } catch (getAllError) {
      console.log("GetAll method failed:", getAllError.message);
    }

    // Test individual get method with error handling
    console.log("\n5. Testing individual get method with error handling...");
    try {
      const ids = await users.listIds({ limit: 1 });
      if (ids.length > 0) {
        const testId = ids[0];
        try {
          const user = await users.get(testId);
          console.log("Get result:", {
            id: user.id,
            hasDecryptionError: user._decryptionFailed || false,
            error: user._error || null
          });
        } catch (getError) {
          console.log(`Get failed for ${testId}:`, getError.message);
        }
      } else {
        console.log("No IDs found for individual get test");
      }
    } catch (listIdsError) {
      console.log("Failed to get IDs for individual get test:", listIdsError.message);
    }

    // Test count method with error handling
    console.log("\n6. Testing count method with error handling...");
    try {
      const count = await users.count();
      console.log("Count result:", count);
    } catch (countError) {
      console.log("Count method failed:", countError.message);
    }

    // Test with skipCount for performance
    console.log("\n7. Testing page method with skipCount...");
    try {
      const fastPage = await users.page({ 
        offset: 0, 
        size: 100,
        skipCount: true 
      });
      
      console.log("Fast page result:", {
        items: fastPage.items.length,
        totalItems: fastPage.totalItems, // Should be null
        page: fastPage.page,
        totalPages: fastPage.totalPages, // Should be null
        debug: fastPage._debug
      });
    } catch (fastPageError) {
      console.log("Fast page method failed:", fastPageError.message);
    }

  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

// Run the test
testDecryptionErrorHandling().catch(console.error); 