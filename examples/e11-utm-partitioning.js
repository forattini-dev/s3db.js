import { S3db } from "../src/index.js";
import { setupDatabase, teardownDatabase } from './database.js';

/**
 * UTM Tracking with Nested Field Partitions
 * 
 * This example demonstrates how to use partitions with nested fields
 * for UTM tracking in marketing campaigns. Perfect for analyzing
 * traffic sources, campaign performance, and user acquisition.
 */

async function main() {
  console.log("🚀 UTM Tracking with Nested Field Partitions Example\n");

  // Initialize S3db
  const s3db = await setupDatabase());console.log("✅ Connected to S3 database");

  // Create users resource with UTM tracking
  const users = await s3db.createResource({
    name: "users",
    attributes: {
      name: "string|required",
      email: "email|required",
      utm: {
        source: "string|required",      // google, facebook, twitter, etc.
        medium: "string|required",      // cpc, social, email, organic, etc.
        term: "string|optional",        // search terms
        campaign: "string|required",    // campaign name
        content: "string|optional"      // ad content identifier
      },
      address: {
        country: "string|required",
        state: "string|required",
        city: "string|required"
      },
      metadata: {
        category: "string|required",    // premium, standard, etc.
        priority: "string|required"     // high, medium, low
      },
      createdAt: "date|required"
    },
    options: {
      timestamps: true,
      partitions: {
        // Single UTM field partitions
        byUtmSource: {
          fields: {
            "utm.source": "string"
          }  await teardownDatabase();

        },
        byUtmMedium: {
          fields: {
            "utm.medium": "string"
          }
        },
        byUtmCampaign: {
          fields: {
            "utm.campaign": "string"
          }
        },

        // Geographic partitions
        byCountry: {
          fields: {
            "address.country": "string|maxlength:2"
          }
        },
        byState: {
          fields: {
            "address.country": "string|maxlength:2",
            "address.state": "string"
          }
        },

        // Combined UTM partitions
        bySourceMedium: {
          fields: {
            "utm.source": "string",
            "utm.medium": "string"
          }
        },
        bySourceCampaign: {
          fields: {
            "utm.source": "string",
            "utm.campaign": "string"
          }
        },

        // Complex multi-field partitions
        byUtmAndLocation: {
          fields: {
            "utm.source": "string",
            "utm.medium": "string",
            "address.country": "string|maxlength:2"
          }
        },
        byUtmAndMetadata: {
          fields: {
            "utm.source": "string",
            "utm.campaign": "string",
            "metadata.category": "string"
          }
        },

        // Date-based partitions
        byDate: {
          fields: {
            "createdAt": "date|maxlength:10"
          }
        },
        byDateAndSource: {
          fields: {
            "createdAt": "date|maxlength:10",
            "utm.source": "string"
          }
        }
      }
    }
  });

  console.log("✅ Created users resource with UTM tracking partitions");

  // Insert sample users with UTM data
  const sampleUsers = [
    {
      name: "John Doe",
      email: "john@example.com",
      utm: {
        source: "google",
        medium: "cpc",
        term: "best software",
        campaign: "brand_awareness",
        content: "ad_1"
      },
      address: {
        country: "US",
        state: "California",
        city: "San Francisco"
      },
      metadata: {
        category: "premium",
        priority: "high"
      },
      createdAt: new Date("2024-01-15T10:30:00Z")
    },
    {
      name: "Jane Smith",
      email: "jane@example.com",
      utm: {
        source: "facebook",
        medium: "social",
        term: null,
        campaign: "social_engagement",
        content: "post_1"
      },
      address: {
        country: "US",
        state: "New York",
        city: "New York"
      },
      metadata: {
        category: "standard",
        priority: "medium"
      },
      createdAt: new Date("2024-01-15T14:20:00Z")
    },
    {
      name: "Bob Wilson",
      email: "bob@example.com",
      utm: {
        source: "google",
        medium: "organic",
        term: "software review",
        campaign: "seo",
        content: null
      },
      address: {
        country: "CA",
        state: "Ontario",
        city: "Toronto"
      },
      metadata: {
        category: "premium",
        priority: "high"
      },
      createdAt: new Date("2024-01-16T09:15:00Z")
    },
    {
      name: "Alice Brown",
      email: "alice@example.com",
      utm: {
        source: "twitter",
        medium: "social",
        term: null,
        campaign: "viral_campaign",
        content: "tweet_1"
      },
      address: {
        country: "US",
        state: "Texas",
        city: "Austin"
      },
      metadata: {
        category: "standard",
        priority: "low"
      },
      createdAt: new Date("2024-01-16T16:45:00Z")
    },
    {
      name: "Charlie Davis",
      email: "charlie@example.com",
      utm: {
        source: "google",
        medium: "cpc",
        term: "enterprise software",
        campaign: "enterprise_sales",
        content: "ad_2"
      },
      address: {
        country: "US",
        state: "California",
        city: "Los Angeles"
      },
      metadata: {
        category: "premium",
        priority: "high"
      },
      createdAt: new Date("2024-01-17T11:30:00Z")
    }
  ];

  console.log("📊 Inserting sample users with UTM data...");
  const insertedUsers = [];
  for (const user of sampleUsers) {
    const inserted = await users.insert(user);
    insertedUsers.push(inserted);
    console.log(`  ✅ Inserted: ${inserted.name} (${inserted.utm.source}/${inserted.utm.medium})`);
  }

  console.log("\n🔍 UTM Analytics Examples:\n");

  // 1. Traffic by source
  console.log("1. Traffic by UTM Source:");
  const googleUsers = await users.listIds({
    partition: "byUtmSource",
    partitionValues: { "utm.source": "google" }
  });
  console.log(`   Google: ${googleUsers.length} users`);

  const facebookUsers = await users.listIds({
    partition: "byUtmSource",
    partitionValues: { "utm.source": "facebook" }
  });
  console.log(`   Facebook: ${facebookUsers.length} users`);

  const twitterUsers = await users.listIds({
    partition: "byUtmSource",
    partitionValues: { "utm.source": "twitter" }
  });
  console.log(`   Twitter: ${twitterUsers.length} users`);

  // 2. Traffic by medium
  console.log("\n2. Traffic by UTM Medium:");
  const cpcUsers = await users.listIds({
    partition: "byUtmMedium",
    partitionValues: { "utm.medium": "cpc" }
  });
  console.log(`   CPC: ${cpcUsers.length} users`);

  const socialUsers = await users.listIds({
    partition: "byUtmMedium",
    partitionValues: { "utm.medium": "social" }
  });
  console.log(`   Social: ${socialUsers.length} users`);

  const organicUsers = await users.listIds({
    partition: "byUtmMedium",
    partitionValues: { "utm.medium": "organic" }
  });
  console.log(`   Organic: ${organicUsers.length} users`);

  // 3. Campaign performance
  console.log("\n3. Campaign Performance:");
  const brandAwarenessUsers = await users.listIds({
    partition: "byUtmCampaign",
    partitionValues: { "utm.campaign": "brand_awareness" }
  });
  console.log(`   Brand Awareness: ${brandAwarenessUsers.length} users`);

  const enterpriseSalesUsers = await users.listIds({
    partition: "byUtmCampaign",
    partitionValues: { "utm.campaign": "enterprise_sales" }
  });
  console.log(`   Enterprise Sales: ${enterpriseSalesUsers.length} users`);

  // 4. Geographic analysis
  console.log("\n4. Geographic Analysis:");
  const usUsers = await users.listIds({
    partition: "byCountry",
    partitionValues: { "address.country": "US" }
  });
  console.log(`   US: ${usUsers.length} users`);

  const caUsers = await users.listIds({
    partition: "byCountry",
    partitionValues: { "address.country": "CA" }
  });
  console.log(`   Canada: ${caUsers.length} users`);

  const californiaUsers = await users.listIds({
    partition: "byState",
    partitionValues: { "address.country": "US", "address.state": "California" }
  });
  console.log(`   California: ${californiaUsers.length} users`);

  // 5. Combined analysis
  console.log("\n5. Combined UTM Analysis:");
  const googleCpcUsers = await users.listIds({
    partition: "bySourceMedium",
    partitionValues: { "utm.source": "google", "utm.medium": "cpc" }
  });
  console.log(`   Google CPC: ${googleCpcUsers.length} users`);

  const googleOrganicUsers = await users.listIds({
    partition: "bySourceMedium",
    partitionValues: { "utm.source": "google", "utm.medium": "organic" }
  });
  console.log(`   Google Organic: ${googleOrganicUsers.length} users`);

  // 6. Complex multi-field analysis
  console.log("\n6. Complex Multi-field Analysis:");
  const usGoogleCpcUsers = await users.listIds({
    partition: "byUtmAndLocation",
    partitionValues: { 
      "utm.source": "google", 
      "utm.medium": "cpc", 
      "address.country": "US" 
    }
  });
  console.log(`   US Google CPC: ${usGoogleCpcUsers.length} users`);

  const premiumGoogleUsers = await users.listIds({
    partition: "byUtmAndMetadata",
    partitionValues: { 
      "utm.source": "google", 
      "utm.campaign": "brand_awareness", 
      "metadata.category": "premium" 
    }
  });
  console.log(`   Premium Google Brand Awareness: ${premiumGoogleUsers.length} users`);

  // 7. Date-based analysis
  console.log("\n7. Date-based Analysis:");
  const jan15Users = await users.listIds({
    partition: "byDate",
    partitionValues: { "createdAt": "2024-01-15" }
  });
  console.log(`   January 15: ${jan15Users.length} users`);

  const jan16Users = await users.listIds({
    partition: "byDate",
    partitionValues: { "createdAt": "2024-01-16" }
  });
  console.log(`   January 16: ${jan16Users.length} users`);

  const jan15GoogleUsers = await users.listIds({
    partition: "byDateAndSource",
    partitionValues: { "createdAt": "2024-01-15", "utm.source": "google" }
  });
  console.log(`   January 15 Google: ${jan15GoogleUsers.length} users`);

  // 8. Detailed user data retrieval
  console.log("\n8. Detailed User Data:");
  const googleUsersData = await users.listByPartition({
    partition: "byUtmSource",
    partitionValues: { "utm.source": "google" }
  });
  
  console.log("   Google users details:");
  for (const user of googleUsersData) {
    console.log(`     - ${user.name}: ${user.utm.medium} (${user.utm.campaign})`);
  }

  // 9. Count operations
  console.log("\n9. Count Operations:");
  const totalGoogleCount = await users.count({
    partition: "byUtmSource",
    partitionValues: { "utm.source": "google" }
  });
  console.log(`   Total Google users: ${totalGoogleCount}`);

  const totalCpcCount = await users.count({
    partition: "byUtmMedium",
    partitionValues: { "utm.medium": "cpc" }
  });
  console.log(`   Total CPC users: ${totalCpcCount}`);

  // 10. Pagination example
  console.log("\n10. Pagination Example:");
  const page = await users.page(0, 2, {
    partition: "byUtmSource",
    partitionValues: { "utm.source": "google" }
  });
  console.log(`   Google users page 1: ${page.items.length} of ${page.totalItems} total`);
  console.log(`   Total pages: ${page.totalPages}`);

  // 11. Get specific user from partition
  console.log("\n11. Get User from Partition:");
  if (googleUsers.length > 0) {
    const userFromPartition = await users.getFromPartition(
      googleUsers[0],
      "byUtmSource",
      { "utm.source": "google" }
    );
    console.log(`   Retrieved from partition: ${userFromPartition.name} (${userFromPartition.utm.medium})`);
    console.log(`   Partition metadata: ${userFromPartition._partition}`);
  }

  console.log("\n✅ UTM Tracking Example Completed!");
  console.log("\n📈 Key Benefits of Nested Field Partitions:");
  console.log("   • Efficient querying by UTM parameters");
  console.log("   • Geographic analysis capabilities");
  console.log("   • Campaign performance tracking");
  console.log("   • Date-based analytics");
  console.log("   • Complex multi-dimensional analysis");
  console.log("   • Automatic partition creation and maintenance");
}

// Run the example
main().catch(console.error); 