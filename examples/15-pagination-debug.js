import S3DB from "../src/index.js";

// Test configuration
const config = {
  connectionString: "s3://test-bucket",
  passphrase: "secret",
  verbose: true
};

async function paginationDebugExample() {
  console.log("Testing pagination with debug info...");
  
  const db = new S3DB(config);
  const users = db.resource("users", {
    attributes: {
      name: "string",
      email: "string",
      age: "number|optional"
    }
  });

  try {
    // Test page method with debug info
    console.log("\n1. Testing page method with debug...");
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

    // Test with skipCount for performance
    console.log("\n2. Testing page method with skipCount...");
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

    // Test with different page sizes
    console.log("\n3. Testing different page sizes...");
    const smallPage = await users.page({ offset: 0, size: 5 });
    const largePage = await users.page({ offset: 0, size: 1000 });
    
    console.log("Small page:", {
      items: smallPage.items.length,
      totalItems: smallPage.totalItems,
      pageSize: smallPage.pageSize
    });
    
    console.log("Large page:", {
      items: largePage.items.length,
      totalItems: largePage.totalItems,
      pageSize: largePage.pageSize
    });

  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

// Run the example
paginationDebugExample().catch(console.error); 