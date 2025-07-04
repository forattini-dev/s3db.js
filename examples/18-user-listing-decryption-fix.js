import S3DB from "../src/index.js";

// MinIO configuration from your setup
const config = {
  connectionString: "http://SYqG8INkn9Eyz5uJf1U0:MjdBiEaw8BllFHazKUmMvDcui3ZWhiAMpoarEAUq@localhost:9010/s3db",
  passphrase: "your-secret-passphrase", // Change this to match your actual passphrase
  verbose: true
};

async function testUserListingWithDecryptionFix() {
  console.log("🔧 Testing user listing with decryption error fix...");
  
  const db = await setupDatabase();
  
  try {
    // Connect to databaseconsole.log("✅ Connected to MinIO database");

    // Create the users resource with your exact configuration
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

    console.log("✅ Users resource created");

    const users = db.resource('users');

    // Insert some test users
    console.log("\n📝 Inserting test users...");
    try {
      await users.insert({
        id: 'test.user@example.com',
        costCenter: 'IT',
        team: 'Engineering',
        scopes: 'admin,user',
        isActive: true,
        apiToken: 'test-token-123',
        webpush: {
          enabled: true,
          endpoint: 'https://example.com/push',
          p256dh: 'test-p256dh',
          auth: 'test-auth'
        },
        metadata: 'Test user metadata'
      });

      await users.insert({
        id: 'another.user@example.com',
        costCenter: 'HR',
        team: 'People',
        scopes: 'user',
        isActive: true,
        apiToken: 'test-token-456',
        metadata: 'Another test user'
      });

      console.log("✅ Test users inserted");
    } catch (insertError) {
      console.log("ℹ️  Users might already exist:", insertError.message);
    }

    // Test the exact scenario from your logs
    console.log("\n🔍 Testing page method (your exact use case)...");
    
    const { offset, size } = { offset: 0, size: 100 }; // Simulate getPaginationParams
    
    try {
      const result = await users.page({ offset, size });
      
      console.log("📊 Page result:", {
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

      // Simulate your API response processing (like your original code)
      const apiResponse = {
        items: validItems.map(item => {
          // Remove internal fields starting with _ (like your omitBy function)
          const cleanItem = {};
          Object.keys(item).forEach(key => {
            if (!key.startsWith('_')) {
              cleanItem[key] = item[key];
            }  } finally {
    await teardownDatabase();
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

      console.log("🚀 API Response:", {
        itemsCount: apiResponse.items.length,
        totalItems: apiResponse.totalItems,
        decryptionErrors: apiResponse.decryptionErrors
      });

      // Show the actual items (without sensitive data)
      if (apiResponse.items.length > 0) {
        console.log("\n📋 Sample items:");
        apiResponse.items.forEach((item, index) => {
          console.log(`   ${index + 1}. ID: ${item.id}`);
          console.log(`      Cost Center: ${item.costCenter}`);
          console.log(`      Team: ${item.team}`);
          console.log(`      Active: ${item.isActive}`);
          console.log(`      API Token: ${item.apiToken ? '[HIDDEN]' : 'none'}`);
          console.log(`      WebPush: ${item.webpush?.enabled ? 'enabled' : 'disabled'}`);
          console.log("");
        });
      }

    } catch (pageError) {
      console.error("❌ Page method failed:", pageError.message);
      
      // Fallback response (like your error handling)
      const fallbackResponse = {
        items: [],
        totalItems: null,
        page: Math.floor(offset / size),
        pageSize: size,
        totalPages: null,
        error: pageError.message
      };
      
      console.log("🔄 Fallback response:", fallbackResponse);
    }

    // Test with skipCount for better performance
    console.log("\n⚡ Testing with skipCount for performance...");
    try {
      const fastResult = await users.page({ 
        offset: 0, 
        size: 100,
        skipCount: true 
      });
      
      console.log("⚡ Fast page result:", {
        items: fastResult.items.length,
        totalItems: fastResult.totalItems, // null when skipCount is true
        page: fastResult.page,
        debug: fastResult._debug
      });
    } catch (fastError) {
      console.error("❌ Fast page method failed:", fastError.message);
    }

    // Test list method as alternative
    console.log("\n📋 Testing list method as alternative...");
    try {
      const listResult = await users.list({ 
        limit: 100, 
        offset: 0 
      });
      
      console.log("📋 List result:", {
        count: listResult.length,
        decryptionErrors: listResult.filter(item => item._decryptionFailed).length
      });
    } catch (listError) {
      console.error("❌ List method failed:", listError.message);
    }

    // Test count method separately
    console.log("\n🔢 Testing count method separately...");
    try {
      const count = await users.count();
      console.log("🔢 Count result:", count);
    } catch (countError) {
      console.error("❌ Count method failed:", countError.message);
    }

    // Test partitions
    console.log("\n🏷️  Testing partitions...");
    try {
      const itUsers = await users.list({
        partition: 'byCostCenter',
        partitionValues: { costCenter: 'IT' }
      });
      console.log("🏷️  IT users:", itUsers.length);

      const engineeringUsers = await users.list({
        partition: 'byTeam',
        partitionValues: { team: 'Engineering' }
      });
      console.log("🏷️  Engineering users:", engineeringUsers.length);
    } catch (partitionError) {
      console.error("❌ Partition test failed:", partitionError.message);
    }

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    // Clean up
    try {
      // Close the database connection properly
      if (db && typeof db.close === 'function') {
        await db.close();
      } else if (db && typeof db.disconnect === 'function') {
        await db.disconnect();
      }
      console.log("🔌 Disconnected from database");
    } catch (disconnectError) {
      console.log("⚠️  Disconnect error:", disconnectError.message);
    }
  }
}

// Run the test
console.log("🚀 Starting user listing decryption fix test...");
testUserListingWithDecryptionFix().catch(console.error); 