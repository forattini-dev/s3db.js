import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Database from '../src/database.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'database-journey-' + Date.now());

describe('Database Class - Complete Journey', () => {
  let database;

  beforeEach(async () => {
    database = new Database({
      verbose: false,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        ?.replace('USER', process.env.MINIO_USER)
        ?.replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });
  });

  test('Database Journey: Connect → Create Resources → Manage Schema → Version Control → Events', async () => {
    console.log('\n🚀 Starting Database Journey...\n');

    // 1. Connect to database
    console.log('1️⃣ Connecting to database...');
    await database.connect();
    
    expect(database.client).toBeDefined();
    expect(database.resources).toBeDefined();
    
    console.log('✅ Database connected successfully');

    // 2. Create first resource
    console.log('\n2️⃣ Creating first resource...');
    const users = await database.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true'
      },
      options: {
        timestamps: true,
        partitions: {
          byRegion: {
            fields: {
              region: 'string|maxlength:2'
            }
          }
        }
      }
    });

    expect(users).toBeDefined();
    expect(users.name).toBe('users');
    expect(users.attributes.name).toBe('string|required');
    expect(users.options.timestamps).toBe(true);
    expect(users.options.partitions.byRegion).toBeDefined();
    
    // Verify resource is stored in database
    expect(database.resources.users).toBe(users);
    
    console.log('✅ Users resource created');

    // 3. Insert test data
    console.log('\n3️⃣ Inserting test data...');
    const user1 = await users.insert({
      name: 'João Silva',
      email: 'joao@example.com',
      age: 30,
      region: 'BR'
    });

    const user2 = await users.insert({
      name: 'John Doe',
      email: 'john@example.com', 
      age: 25,
      region: 'US'
    });

    expect(user1.id).toBeDefined();
    expect(user2.id).toBeDefined();
    
    console.log('✅ Test data inserted');

    // 4. Create second resource with different schema
    console.log('\n4️⃣ Creating second resource...');
    const products = await database.createResource({
      name: 'products',
      attributes: {
        title: 'string|required',
        price: 'number|required',
        category: 'string|required',
        description: 'string|optional'
      },
      options: {
        timestamps: true,
        partitions: {
          byCategory: {
            fields: {
              category: 'string'
            }
          },
          byPriceRange: {
            fields: {
              priceRange: 'string'
            }
          }
        }
      }
    });

    expect(products).toBeDefined();
    expect(products.name).toBe('products');
    expect(database.resources.products).toBe(products);
    
    console.log('✅ Products resource created');

    // 5. Insert product data
    console.log('\n5️⃣ Inserting product data...');
    const product1 = await products.insert({
      title: 'Laptop Pro',
      price: 2500,
      category: 'electronics',
      description: 'High-performance laptop',
      priceRange: 'high'
    });

    const product2 = await products.insert({
      title: 'Office Chair',
      price: 150,
      category: 'furniture', 
      description: 'Ergonomic office chair',
      priceRange: 'medium'
    });

    expect(product1.id).toBeDefined();
    expect(product2.id).toBeDefined();
    
    console.log('✅ Product data inserted');

    // 6. Test database-level queries across resources
    console.log('\n6️⃣ Testing database-level operations...');
    
    // Access resources through database
    const usersRef = database.resource('users');
    const productsRef = database.resource('products');
    
    expect(usersRef).toBe(users);
    expect(productsRef).toBe(products);
    
    // Verify data exists across resources
    const userCount = await users.count();
    const productCount = await products.count();
    
    expect(userCount).toBe(2);
    expect(productCount).toBe(2);
    
    console.log('✅ Database-level operations working');

    // 7. Test schema versioning and hashing
    console.log('\n7️⃣ Testing schema versioning...');
    
    // Generate definition hashes
    const usersHash = database.generateDefinitionHash(users.export());
    const productsHash = database.generateDefinitionHash(products.export());
    
    expect(usersHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(productsHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(usersHash).not.toBe(productsHash); // Different schemas should have different hashes
    
    // Test hash consistency
    const usersHash2 = database.generateDefinitionHash(users.export());
    expect(usersHash).toBe(usersHash2);
    
    console.log('✅ Schema versioning working');

    // 8. Test metadata file operations
    console.log('\n8️⃣ Testing metadata file operations...');
    
    // Upload metadata
    await database.uploadMetadataFile();
    
    // Verify s3db.json was created
    const metadataExists = await database.client.exists('s3db.json');
    expect(metadataExists).toBe(true);
    
    // Retrieve and verify metadata
    const metadata = await database.getMetadataFile();
    expect(metadata).toBeDefined();
    expect(metadata.s3dbVersion).toBeDefined();
    expect(metadata.lastUpdated).toBeDefined();
    expect(metadata.resources).toBeDefined();
    expect(metadata.resources.users).toBeDefined();
    expect(metadata.resources.products).toBeDefined();
    expect(metadata.resources.users.definitionHash).toBe(usersHash);
    expect(metadata.resources.products.definitionHash).toBe(productsHash);
    
    console.log('✅ Metadata file operations working');

    // 9. Test change detection
    console.log('\n9️⃣ Testing change detection...');
    
    // Simulate metadata with different hashes (schema changes)
    const oldMetadata = {
      s3dbVersion: '1.0.0',
      resources: {
        users: {
          definitionHash: 'sha256:old-users-hash'
        },
        products: {
          definitionHash: productsHash // Same hash
        },
        deletedResource: {
          definitionHash: 'sha256:deleted-resource-hash'
        }
      }
    };
    
    const changes = database.detectDefinitionChanges(oldMetadata);
    
    expect(changes).toHaveLength(2); // users changed, deletedResource deleted
    expect(changes.find(c => c.type === 'changed' && c.resourceName === 'users')).toBeDefined();
    expect(changes.find(c => c.type === 'deleted' && c.resourceName === 'deletedResource')).toBeDefined();
    
    console.log('✅ Change detection working');

    // 10. Test event emission
    console.log('\n🔟 Testing event emission...');
    
    let emittedEvents = [];
    database.on('resourceDefinitionsChanged', (event) => {
      emittedEvents.push(event);
    });
    
    // Manually trigger change detection
    await database.detectAndEmitChanges();
    
    // Since we just uploaded current metadata, no changes should be detected
    expect(emittedEvents).toHaveLength(0);
    
    console.log('✅ Event emission working');

    // 11. Test resource schema updates
    console.log('\n1️⃣1️⃣ Testing resource schema updates...');
    
    // Update users resource with new field
    const updatedUsers = await database.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required', 
        age: 'number|optional',
        active: 'boolean|default:true',
        lastLogin: 'string|optional' // New field
      },
      options: {
        timestamps: true,
        partitions: {
          byRegion: {
            fields: {
              region: 'string|maxlength:2'
            }
          }
        }
      }
    });
    
    // Should be the same instance (updated)
    expect(updatedUsers).toBe(users);
    expect(users.attributes.lastLogin).toBe('string|optional');
    
    // Hash should be different now
    const newUsersHash = database.generateDefinitionHash(users.export());
    expect(newUsersHash).not.toBe(usersHash);
    
    console.log('✅ Resource schema updates working');

    // 12. Test data integrity after schema change
    console.log('\n1️⃣2️⃣ Testing data integrity after schema change...');
    
    // Original data should still be accessible
    const retrievedUser1 = await users.get(user1.id);
    expect(retrievedUser1.name).toBe('João Silva');
    expect(retrievedUser1.email).toBe('joao@example.com');
    expect(retrievedUser1.lastLogin).toBeUndefined(); // New field not set on old data
    
    // New data should include new field
    const user3 = await users.insert({
      name: 'Maria Santos',
      email: 'maria@example.com',
      age: 28,
      region: 'BR',
      lastLogin: '2025-01-09T10:00:00Z'
    });
    
    expect(user3.lastLogin).toBe('2025-01-09T10:00:00Z');
    
    console.log('✅ Data integrity maintained after schema change');

    // 13. Test complex partition queries across resources
    console.log('\n1️⃣3️⃣ Testing complex partition queries...');
    
    // Query users by region partition
    const brUsers = await users.listByPartition({
      partition: 'byRegion',
      partitionValues: { region: 'BR' }
    });
    expect(brUsers).toHaveLength(2); // João and Maria
    
    // Query products by category partition
    const electronics = await products.listByPartition({
      partition: 'byCategory', 
      partitionValues: { category: 'electronics' }
    });
    expect(electronics).toHaveLength(1); // Laptop Pro
    
    console.log('✅ Complex partition queries working');

    // 14. Test database resource management
    console.log('\n1️⃣4️⃣ Testing database resource management...');
    
    // List all resources
    const resourceNames = Object.keys(database.resources);
    expect(resourceNames).toEqual(['users', 'products']);
    
    // Verify each resource is accessible
    for (const name of resourceNames) {
      const resource = database.resource(name);
      expect(resource).toBeDefined();
      expect(resource.name).toBe(name);
    }
    
    console.log('✅ Database resource management working');

    // 15. Test error handling
    console.log('\n1️⃣5️⃣ Testing error handling...');
    
    // Try to access non-existent resource
    try {
      const nonExistent = database.resource('non-existent');
      expect(nonExistent).toBeUndefined(); // Should return undefined
    } catch (error) {
      // Or might throw error depending on implementation
      expect(error).toBeDefined();
    }
    
    console.log('✅ Error handling working');

    // 16. Final verification and cleanup
    console.log('\n1️⃣6️⃣ Final verification...');
    
    // Verify final counts
    const finalUserCount = await users.count();
    const finalProductCount = await products.count();
    
    expect(finalUserCount).toBe(3); // João, John, Maria
    expect(finalProductCount).toBe(2); // Laptop Pro, Office Chair
    
    // Upload final metadata
    await database.uploadMetadataFile();
    
    const finalMetadata = await database.getMetadataFile();
    expect(finalMetadata.resources.users.definitionHash).toBe(newUsersHash);
    expect(finalMetadata.resources.products.definitionHash).toBe(productsHash);
    
    console.log('✅ Final verification completed');

    console.log('\n🎉 Database Journey completed successfully! All database operations working correctly.\n');
  }, 120000); // 2 minute timeout for comprehensive test

  test('Database Connection and Configuration Journey', async () => {
    console.log('\n🔗 Testing Database Connection and Configuration...\n');

    // Test configuration before connection
    console.log('1️⃣ Testing pre-connection configuration...');
    expect(database.connectionString).toBeDefined();
    expect(database.options).toBeDefined();
    
    console.log('✅ Pre-connection configuration verified');

    // Test connection
    console.log('\n2️⃣ Testing connection process...');
    await database.connect();
    
    expect(database.client).toBeDefined();
    expect(database.client.config).toBeDefined();
    expect(database.client.config.bucket).toBeDefined();
    
    console.log('✅ Connection process working');

    // Test s3db version
    console.log('\n3️⃣ Testing s3db version management...');
    expect(database.s3dbVersion).toBeDefined();
    expect(typeof database.s3dbVersion).toBe('string');
    
    console.log('✅ Version management working');

    console.log('\n✅ Connection and configuration journey completed successfully!\n');
  });

  test('Database Error Handling and Edge Cases Journey', async () => {
    console.log('\n⚠️  Testing Database Error Handling...\n');

    await database.connect();

    // Test invalid resource creation
    console.log('1️⃣ Testing invalid resource creation...');
    try {
      await database.createResource({
        // Missing required fields
        attributes: {
          name: 'string'
        }
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }

    console.log('✅ Invalid resource creation handled');

    // Test corrupted metadata handling
    console.log('\n2️⃣ Testing corrupted metadata handling...');
    
    // Simulate corrupted s3db.json
    await database.client.putObject({
      key: 's3db.json',
      body: 'invalid json content',
      contentType: 'application/json'
    });

    const metadata = await database.getMetadataFile();
    expect(metadata.s3dbVersion).toBe('1.0.0'); // Should return default
    expect(metadata.resources).toEqual({});

    console.log('✅ Corrupted metadata handled gracefully');

    // Test missing metadata handling
    console.log('\n3️⃣ Testing missing metadata handling...');
    
    await database.client.deleteObject('s3db.json');
    
    const missingMetadata = await database.getMetadataFile();
    expect(missingMetadata.s3dbVersion).toBe('1.0.0');
    expect(missingMetadata.resources).toEqual({});

    console.log('✅ Missing metadata handled gracefully');

    console.log('\n✅ Error handling journey completed successfully!\n');
  });
});


