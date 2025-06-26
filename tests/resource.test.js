import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-journey-' + Date.now());

describe('Resource', () => {
  let client;
  let resource;

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    })

    resource = new Resource({
      client,
      name: 'breeds',
      attributes: {
        animal: 'string',
        name: 'string',
      },
      options: {
        timestamps: true,
      }
    })

    await resource.deleteAll()
  })

    resource = new Resource({
      client,
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true',
        bio: 'string|optional',
        tags: 'array|items:string'
      },
      options: {
        timestamps: true,
        partitions: {
          byRegion: {
            fields: {
              region: 'string|maxlength:2'
            }
          },
          byAgeGroup: {
            fields: {
              ageGroup: 'string'
            }
          }
        }
      }
    });

    // Clean slate for each test
    try {
      await resource.deleteAll({ paranoid: false });
    } catch (error) {
      // Ignore if no data exists
    }
  });

  test('Resource Journey: Create → Insert → Update → Query → Partition → Content → Delete', async () => {

    // 1. Create and verify resource structure
    expect(resource.name).toBe('users');
    expect(resource.attributes.name).toBe('string|required');
    expect(resource.attributes.email).toBe('email|required');
    expect(resource.options.timestamps).toBe(true);
    expect(resource.options.partitions).toBeDefined();
    expect(resource.options.partitions.byRegion).toBeDefined();

    // 2. Insert single user
    const user1 = await resource.insert({
      name: 'João Silva',
      email: 'joao@example.com',
      age: 30,
      bio: 'Desenvolvedor Full Stack',
      tags: ['javascript', 'node.js', 'react'],
      region: 'BR',
      ageGroup: 'adult'
    });

    expect(user1.id).toBeDefined();
    expect(user1.name).toBe('João Silva');
    expect(user1.email).toBe('joao@example.com');
    expect(user1.age).toBe(30);
    expect(user1.active).toBe(true); // Default value
    expect(user1.createdAt).toBeDefined();
    expect(user1.updatedAt).toBeDefined();
    expect(Array.isArray(user1.tags)).toBe(true);
    expect(user1.tags).toEqual(['javascript', 'node.js', 'react']);
    

    // 3. Verify user exists
    const exists = await resource.exists(user1.id);
    expect(exists).toBe(true);
    
    const notExists = await resource.exists('non-existent-id');
    expect(notExists).toBe(false);
    

    // 4. Get user and verify enhanced metadata
    const retrievedUser = await resource.get(user1.id);
    
    expect(retrievedUser.id).toBe(user1.id);
    expect(retrievedUser.name).toBe('João Silva');
    expect(retrievedUser._contentLength).toBeDefined();
    expect(retrievedUser._lastModified).toBeInstanceOf(Date);
    expect(retrievedUser.mimeType).toBeDefined();
    expect(retrievedUser.definitionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(typeof retrievedUser._hasContent).toBe('boolean');
    

    // 5. Update user
    const updatedUser = await resource.update(user1.id, {
      bio: 'Senior Full Stack Developer',
      age: 31,
      tags: ['javascript', 'node.js', 'react', 'typescript']
    });

    expect(updatedUser.id).toBe(user1.id);
    expect(updatedUser.bio).toBe('Senior Full Stack Developer');
    expect(updatedUser.age).toBe(31);
    expect(updatedUser.tags).toEqual(['javascript', 'node.js', 'react', 'typescript']);
    expect(updatedUser.createdAt).toBe(user1.createdAt); // Should not change
    expect(updatedUser.updatedAt).not.toBe(user1.updatedAt); // Should change
    

    // 6. Insert multiple users for querying
    const users = await resource.insertMany([
      {
        name: 'Maria Santos',
        email: 'maria@example.com',
        age: 25,
        region: 'BR',
        ageGroup: 'young-adult',
        tags: ['python', 'django']
      },
      {
        name: 'John Doe',
        email: 'john@example.com',
        age: 35,
        region: 'US',
        ageGroup: 'adult',
        tags: ['java', 'spring']
      },
      {
        name: 'Anna Johnson',
        email: 'anna@example.com',
        age: 28,
        region: 'US',
        ageGroup: 'young-adult',
        tags: ['go', 'kubernetes']
      }
    ]);

    expect(users).toHaveLength(3);
    expect(users.every(u => u.id && u.createdAt && u.updatedAt)).toBe(true);
    

    // 7. Test listing and counting
    const allIds = await resource.listIds();
    expect(allIds).toHaveLength(4); // 1 original + 3 new

    const totalCount = await resource.count();
    expect(totalCount).toBe(4);


    // 8. Test pagination
    const page1 = await resource.page(0, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.totalItems).toBe(4);
    expect(page1.totalPages).toBe(2);
    expect(page1.page).toBe(0);
    expect(page1.pageSize).toBe(2);

    const page2 = await resource.page(1, 2);
    expect(page2.items).toHaveLength(2);
    expect(page2.page).toBe(1);


    // 9. Test partitioned queries
    
    // Query by region partition
    const brUsersIds = await resource.listByPartition({
      partition: 'byRegion',
      partitionValues: { region: 'BR' }
    });
    expect(brUsersIds).toHaveLength(2); // João and Maria

    const usUsersIds = await resource.listByPartition({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(usUsersIds).toHaveLength(2); // John and Anna

    // Query by age group partition
    const youngAdultsIds = await resource.listByPartition({
      partition: 'byAgeGroup',
      partitionValues: { ageGroup: 'young-adult' }
    });
    expect(youngAdultsIds).toHaveLength(2); // Maria and Anna


    // 10. Test binary content operations
    const user = users[0]; // Maria
    
    // Add binary content
    const profileImage = Buffer.from('fake-image-data-here', 'utf8');
    await resource.setContent(user.id, profileImage, 'image/jpeg');

    // Verify content exists
    const hasContent = await resource.hasContent(user.id);
    expect(hasContent).toBe(true);

    // Retrieve content
    const content = await resource.content(user.id);
    expect(content.buffer).toBeInstanceOf(Buffer);
    expect(content.buffer.toString('utf8')).toBe('fake-image-data-here');
    expect(content.contentType).toBe('image/jpeg');

    // Verify _hasContent flag in get()
    const userWithContent = await resource.get(user.id);
    expect(userWithContent._hasContent).toBe(true);


    // 11. Test upsert operation
    
    // Upsert existing user (update)
    const upserted1 = await resource.upsert({
      id: user1.id,
      name: 'João Silva Santos', // Changed
      email: 'joao@example.com'
    });
    expect(upserted1.id).toBe(user1.id);
    expect(upserted1.name).toBe('João Silva Santos');

    // Upsert new user (insert)
    const upserted2 = await resource.upsert({
      name: 'New User',
      email: 'new@example.com',
      age: 40,
      region: 'EU',
      ageGroup: 'adult'
    });
    expect(upserted2.id).toBeDefined();
    expect(upserted2.name).toBe('New User');


    // 12. Test getMany operation
    const userIds = [user1.id, users[0].id, users[1].id];
    const retrievedUsers = await resource.getMany(userIds);
    
    expect(retrievedUsers).toHaveLength(3);
    expect(retrievedUsers.every(u => u.id && u.name && u.email)).toBe(true);


    // 13. Test delete content (preserve metadata)
    await resource.deleteContent(users[0].id);

    const userAfterContentDelete = await resource.get(users[0].id);
    expect(userAfterContentDelete.name).toBe('Maria Santos'); // Metadata preserved
    expect(userAfterContentDelete._hasContent).toBe(false); // Content gone


    // 14. Test individual delete
    const deleteResult = await resource.delete(users[2].id); // Anna
    expect(deleteResult).toBe(true);

    const countAfterDelete = await resource.count();
    expect(countAfterDelete).toBe(4); // 5 total - 1 deleted


    // 15. Test deleteMany
    const deleteIds = [users[0].id, users[1].id]; // Maria and John
    const deleteManyResult = await resource.deleteMany(deleteIds);
    expect(deleteManyResult).toEqual(deleteIds);

    const finalCount = await resource.count();
    expect(finalCount).toBe(2); // 4 - 2 deleted


    // 16. Test definition hash consistency
    const hash1 = resource.getDefinitionHash();
    const hash2 = resource.getDefinitionHash();
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);


  });

  test('Multi-Field Partitions Journey', async () => {

    // Create resource with multi-field partitions
    const partitionedResource = new Resource({
      client,
      name: 'events',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        region: 'string|required',
        department: 'string|required',
        status: 'string|required'
      },
      options: {
        timestamps: true,
        partitions: {
          byRegionDept: {
            fields: {
              region: 'string|maxlength:2',
              department: 'string'
            }
          },
          byStatus: {
            fields: {
              status: 'string'
            }
          }
        }
      }
    });

    // Clean slate
    try {
      await partitionedResource.deleteAll({ paranoid: false });
    } catch (error) {
      // Ignore
    }

    // Insert events with partition data
    const events = await partitionedResource.insertMany([
      {
        title: 'Tech Conference',
        region: 'US-WEST',
        department: 'engineering',
        status: 'active'
      },
      {
        title: 'Sales Meeting', 
        region: 'US-EAST',
        department: 'sales',
        status: 'active'
      },
      {
        title: 'Engineering Sync',
        region: 'US-WEST',
        department: 'engineering',
        status: 'completed'
      }
    ]);

    // Test multi-field partition queries
    const engineeringEvents = await partitionedResource.listByPartition({
      partition: 'byRegionDept',
      partitionValues: { region: 'US-WEST', department: 'engineering' }
    });
    expect(engineeringEvents).toHaveLength(2);

    const activeEvents = await partitionedResource.listByPartition({
      partition: 'byStatus', 
      partitionValues: { status: 'active' }
    });
    expect(activeEvents).toHaveLength(2);

  });

  test('Error Handling Journey', async () => {

    // Test invalid content type
    try {
      await resource.setContent('test-id', 'not a buffer', 'text/plain');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Content must be a Buffer');
    }

    // Test non-existent resource operations
    const nonExistent = await resource.get('non-existent-id');
    expect(nonExistent).toBe(null);

    const noContent = await resource.content('non-existent-id');
    expect(noContent.buffer).toBe(null);
    expect(noContent.contentType).toBe(null);

    // Test paranoid mode protection
    try {
      await resource.deleteAll(); // Should fail - paranoid mode enabled by default
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('paranoid');
    }

  });

  describe('Partitioning', () => {
    let partitionedResource;

    beforeEach(async () => {
      partitionedResource = new Resource({
        client,
        name: 'users',
        attributes: {
          name: 'string',
          email: 'string',
          age: 'number',
          city: 'string',
        },
        options: {
          timestamps: true,
          partitionBy: ['city', 'age'],
        }
      })

      await partitionedResource.deleteAll()
    })

    test('should create partitioned keys correctly', async () => {
      const user1 = await partitionedResource.insert({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        city: 'New York',
      })

      const user2 = await partitionedResource.insert({
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25,
        city: 'Los Angeles',
      })

      expect(user1.id).toBeDefined()
      expect(user2.id).toBeDefined()
      expect(user1.id).not.toBe(user2.id)

      // Verify the data is stored correctly
      const retrieved1 = await partitionedResource.get(user1.id)
      const retrieved2 = await partitionedResource.get(user2.id)

      expect(retrieved1.name).toBe('John Doe')
      expect(retrieved1.city).toBe('New York')
      expect(retrieved1.age).toBe(30)
      expect(retrieved2.name).toBe('Jane Smith')
      expect(retrieved2.city).toBe('Los Angeles')
      expect(retrieved2.age).toBe(25)
    })

    test('should query by partition', async () => {
      // Insert users in different cities
      await partitionedResource.insertMany([
        { name: 'John', email: 'john@ny.com', age: 30, city: 'New York' },
        { name: 'Jane', email: 'jane@ny.com', age: 25, city: 'New York' },
        { name: 'Bob', email: 'bob@la.com', age: 35, city: 'Los Angeles' },
        { name: 'Alice', email: 'alice@la.com', age: 28, city: 'Los Angeles' },
        { name: 'Charlie', email: 'charlie@sf.com', age: 32, city: 'San Francisco' },
      ])

      // Query by city partition
      const nyUsers = await partitionedResource.query({ city: 'New York' })
      const laUsers = await partitionedResource.query({ city: 'Los Angeles' })
      const sfUsers = await partitionedResource.query({ city: 'San Francisco' })

      expect(nyUsers.length).toBe(2)
      expect(laUsers.length).toBe(2)
      expect(sfUsers.length).toBe(1)

      // Verify all users from NY have correct city
      nyUsers.forEach(user => {
        expect(user.city).toBe('New York')
      })
    })

    test('should query by multiple partition fields', async () => {
      await partitionedResource.insertMany([
        { name: 'John', email: 'john@ny.com', age: 30, city: 'New York' },
        { name: 'Jane', email: 'jane@ny.com', age: 25, city: 'New York' },
        { name: 'Bob', email: 'bob@ny.com', age: 30, city: 'New York' },
        { name: 'Alice', email: 'alice@la.com', age: 28, city: 'Los Angeles' },
      ])

      // Query by both city and age
      const ny30Users = await partitionedResource.query({ city: 'New York', age: 30 })
      const ny25Users = await partitionedResource.query({ city: 'New York', age: 25 })

      expect(ny30Users.length).toBe(2)
      expect(ny25Users.length).toBe(1)

      ny30Users.forEach(user => {
        expect(user.city).toBe('New York')
        expect(user.age).toBe(30)
      })
    })

    test('should handle partition updates correctly', async () => {
      const user = await partitionedResource.insert({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        city: 'New York',
      })

      // Update partition field
      const updated = await partitionedResource.update(user.id, { city: 'Los Angeles' })

      expect(updated.city).toBe('Los Angeles')
      expect(updated.age).toBe(30)
      expect(updated.name).toBe('John Doe')

      // Verify the update is reflected in queries
      const nyUsers = await partitionedResource.query({ city: 'New York' })
      const laUsers = await partitionedResource.query({ city: 'Los Angeles' })

      expect(nyUsers.length).toBe(0)
      expect(laUsers.length).toBe(1)
      expect(laUsers[0].id).toBe(user.id)
    })

    test('should handle partition deletion', async () => {
      await partitionedResource.insertMany([
        { name: 'John', email: 'john@ny.com', age: 30, city: 'New York' },
        { name: 'Jane', email: 'jane@ny.com', age: 25, city: 'New York' },
        { name: 'Bob', email: 'bob@la.com', age: 35, city: 'Los Angeles' },
      ])

      // Delete by partition
      const deleted = await partitionedResource.deleteByPartition({ city: 'New York' })

      expect(deleted).toBe(2)

      const remainingUsers = await partitionedResource.query({})
      expect(remainingUsers.length).toBe(1)
      expect(remainingUsers[0].city).toBe('Los Angeles')
    })

    test('should handle complex partition queries', async () => {
      await partitionedResource.insertMany([
        { name: 'John', email: 'john@ny.com', age: 30, city: 'New York' },
        { name: 'Jane', email: 'jane@ny.com', age: 25, city: 'New York' },
        { name: 'Bob', email: 'bob@ny.com', age: 30, city: 'New York' },
        { name: 'Alice', email: 'alice@la.com', age: 28, city: 'Los Angeles' },
        { name: 'Charlie', email: 'charlie@la.com', age: 30, city: 'Los Angeles' },
      ])

      // Query with partial partition match
      const all30YearOlds = await partitionedResource.query({ age: 30 })
      expect(all30YearOlds.length).toBe(3)

      // Query with non-partition field
      const johnUsers = await partitionedResource.query({ name: 'John' })
      expect(johnUsers.length).toBe(1)
      expect(johnUsers[0].name).toBe('John')
    })

    test('should handle partition migration', async () => {
      const user = await partitionedResource.insert({
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
        city: 'New York',
      })

      // Migrate partition (this would typically be done through a migration script)
      const migrated = await partitionedResource.migratePartition(user.id, {
        city: 'Los Angeles',
        age: 31
      })

      expect(migrated.city).toBe('Los Angeles')
      expect(migrated.age).toBe(31)

      // Verify old partition is empty
      const nyUsers = await partitionedResource.query({ city: 'New York', age: 30 })
      expect(nyUsers.length).toBe(0)

      // Verify new partition has the user
      const laUsers = await partitionedResource.query({ city: 'Los Angeles', age: 31 })
      expect(laUsers.length).toBe(1)
      expect(laUsers[0].id).toBe(user.id)
    })
  });
});
