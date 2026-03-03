import S3DB from "../src/index.js";

const config = {
  connectionString: "s3://test-bucket",
  passphrase: "secret",
  verbose: true
};

async function paginationExample() {
  console.log("Testing pagination modes...\n");

  const db = await setupDatabase();

  if (!db.resources.users) {
    await db.createResource({
      name: "users",
      attributes: {
        name: "string",
        email: "string",
        age: "number|optional"
      }
    });
  }
  const users = db.resources.users;

  try {
    // 1. Cursor-based pagination (recommended)
    console.log("1. Cursor-based pagination");
    console.log("   Best for: sequential traversal, large datasets\n");

    const firstPage = await users.page({ size: 10 });
    console.log("First page:", {
      items: firstPage.items.length,
      hasMore: firstPage.hasMore,
      nextCursor: firstPage.nextCursor ? "(opaque token)" : null
    });

    if (firstPage.nextCursor) {
      const secondPage = await users.page({
        size: 10,
        cursor: firstPage.nextCursor
      });
      console.log("Second page:", {
        items: secondPage.items.length,
        hasMore: secondPage.hasMore,
        usedCursor: secondPage._debug.usedCursor
      });
    }

    // 2. Page-based pagination
    console.log("\n2. Page-based pagination");
    console.log("   Best for: page-number navigation UIs\n");

    const page3 = await users.page({ page: 3, size: 10 });
    console.log("Page 3:", {
      items: page3.items.length,
      page: page3.page,
      totalPages: page3.totalPages,
      totalItems: page3.totalItems,
      hasMore: page3.hasMore
    });

    // 3. skipCount for performance
    console.log("\n3. skipCount mode");
    console.log("   Best for: large collections where you don't need totals\n");

    const fastPage = await users.page({
      size: 10,
      skipCount: true
    });
    console.log("Fast page:", {
      items: fastPage.items.length,
      totalItems: fastPage.totalItems,   // null (skipped)
      totalPages: fastPage.totalPages,   // null (skipped)
      hasMore: fastPage.hasMore,         // still works
      debug: fastPage._debug
    });

    // 4. Partition + cursor pagination
    console.log("\n4. Partition + cursor pagination\n");

    const partitioned = await users.page({
      size: 5,
      partition: "byStatus",
      partitionValues: { status: "active" }
    });
    console.log("Partitioned page:", {
      items: partitioned.items.length,
      hasMore: partitioned.hasMore,
      nextCursor: partitioned.nextCursor ? "(opaque token)" : null
    });

    // 5. Full traversal with cursor
    console.log("\n5. Full cursor traversal\n");

    let cursor = null;
    let totalTraversed = 0;
    let pageNum = 0;

    do {
      const result = await users.page({
        size: 25,
        cursor,
        skipCount: true
      });
      totalTraversed += result.items.length;
      pageNum++;
      cursor = result.nextCursor;
      console.log(`  Batch ${pageNum}: ${result.items.length} items (total so far: ${totalTraversed})`);
    } while (cursor);

    console.log(`  Done. Traversed ${totalTraversed} records in ${pageNum} batches.`);

  } catch (error) {
    console.error("Test failed:", error.message);
  } finally {
    await teardownDatabase();
  }
}

paginationExample().catch(console.error);
