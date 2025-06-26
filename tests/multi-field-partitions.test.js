import Resource from '../src/resource.class.js';

// Mock client for testing multi-field partitions
const mockClient = {
  headObject: () => Promise.resolve({
    Metadata: { name: 'test', email: 'test@example.com' },
    ContentLength: 1024,
    LastModified: new Date(),
    ContentType: 'application/json',
    VersionId: 'v123'
  }),
  putObject: () => Promise.resolve({ ETag: 'test-etag' }),
  getObject: () => Promise.resolve({
    Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(Buffer.from('test content'))) },
    ContentType: 'text/plain'
  }),
  exists: () => Promise.resolve(true),
  deleteObject: () => Promise.resolve({ DeleteMarker: true }),
  getAllKeys: () => Promise.resolve([]),
  count: () => Promise.resolve(0)
};

describe('Multi-Field Partitions', () => {
  let users;

  beforeEach(() => {
    users = new Resource({
      client: mockClient,
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        region: 'string|required',
        department: 'string|required',
        status: 'string|required',
        role: 'string|required'
      },
      options: {
        timestamps: true,
        partitions: {
          // Multi-field: region + department
          byRegionDept: {
            fields: {
              region: 'string|maxlength:2',
              department: 'string'
            }
          },
          // Multi-field: status + role
          byStatusRole: {
            fields: {
              status: 'string',
              role: 'string'
            }
          },
          // Single field for comparison
          byRegionOnly: {
            fields: {
              region: 'string|maxlength:2'
            }
          }
        }
      }
    });
  });

  test('should create partitions with multiple fields', () => {
    const partitions = users.options.partitions;
    
    expect(partitions.byRegionDept).toBeDefined();
    expect(partitions.byRegionDept.fields).toEqual({
      region: 'string|maxlength:2',
      department: 'string'
    });
    
    expect(partitions.byStatusRole).toBeDefined();
    expect(partitions.byStatusRole.fields).toEqual({
      status: 'string',
      role: 'string'
    });
  });

  test('should generate correct partition keys for multi-field partitions', () => {
    const userData = {
      region: 'US-WEST',
      department: 'engineering',
      status: 'active',
      role: 'admin'
    };

    const regionDeptKey = users.getPartitionKey('byRegionDept', 'user1', userData);
    expect(regionDeptKey).toBe('resource=users/partition=byRegionDept/region=US/department=engineering/id=user1');

    const statusRoleKey = users.getPartitionKey('byStatusRole', 'user1', userData);
    expect(statusRoleKey).toBe('resource=users/partition=byStatusRole/status=active/role=admin/id=user1');

    const regionOnlyKey = users.getPartitionKey('byRegionOnly', 'user1', userData);
    expect(regionOnlyKey).toBe('resource=users/partition=byRegionOnly/region=US/id=user1');
  });

  test('should handle missing field values gracefully', () => {
    const incompleteData = {
      region: 'US-WEST'
      // missing department, status, role
    };

    const regionDeptKey = users.getPartitionKey('byRegionDept', 'user1', incompleteData);
    expect(regionDeptKey).toBeNull(); // Should return null if required fields are missing

    const regionOnlyKey = users.getPartitionKey('byRegionOnly', 'user1', incompleteData);
    expect(regionOnlyKey).toBe('resource=users/partition=byRegionOnly/region=US/id=user1');
  });

  test('should insert and list by multi-field partitions', async () => {
    const testUsers = [
      {
        id: 'user1',
        name: 'João Silva',
        region: 'US-WEST',
        department: 'engineering',
        status: 'active',
        role: 'admin'
      },
      {
        id: 'user2',
        name: 'Maria Santos',
        region: 'US-EAST',
        department: 'engineering',
        status: 'active',
        role: 'user'
      },
      {
        id: 'user3',
        name: 'Carlos Lima',
        region: 'US-WEST',
        department: 'marketing',
        status: 'inactive',
        role: 'user'
      }
    ];

    // Insert test users
    for (const user of testUsers) {
      await users.insert(user);
    }

    // Test listing by region + department
    const usWestEngineering = await users.listByPartition({
      partition: 'byRegionDept',
      partitionValues: {
        region: 'US-WEST',
        department: 'engineering'
      }
    });

    expect(usWestEngineering).toHaveLength(1);
    expect(usWestEngineering[0].name).toBe('João Silva');

    // Test listing by status + role
    const activeUsers = await users.listByPartition({
      partition: 'byStatusRole',
      partitionValues: {
        status: 'active',
        role: 'user'
      }
    });

    expect(activeUsers).toHaveLength(1);
    expect(activeUsers[0].name).toBe('Maria Santos');

    // Test listing by single field
    const usWestUsers = await users.listByPartition({
      partition: 'byRegionOnly',
      partitionValues: {
        region: 'US-WEST'
      }
    });

    expect(usWestUsers).toHaveLength(2);
    expect(usWestUsers.map(u => u.name).sort()).toEqual(['Carlos Lima', 'João Silva']);
  });

  test('should count by multi-field partitions', async () => {
    const testUsers = [
      {
        id: 'user1',
        name: 'João Silva',
        region: 'US-WEST',
        department: 'engineering',
        status: 'active',
        role: 'admin'
      },
      {
        id: 'user2',
        name: 'Maria Santos',
        region: 'US-WEST',
        department: 'engineering',
        status: 'active',
        role: 'user'
      }
    ];

    for (const user of testUsers) {
      await users.insert(user);
    }

    const engineeringCount = await users.count({
      partition: 'byRegionDept',
      partitionValues: {
        region: 'US-WEST',
        department: 'engineering'
      }
    });

    expect(engineeringCount).toBe(2);

    const adminCount = await users.count({
      partition: 'byStatusRole',
      partitionValues: {
        status: 'active',
        role: 'admin'
      }
    });

    expect(adminCount).toBe(1);

    const totalCount = await users.count();
    expect(totalCount).toBe(2);
  });

  test('should paginate by multi-field partitions', async () => {
    const testUsers = [];
    for (let i = 1; i <= 5; i++) {
      testUsers.push({
        id: `user${i}`,
        name: `User ${i}`,
        region: 'US-WEST',
        department: 'engineering',
        status: 'active',
        role: i <= 2 ? 'admin' : 'user'
      });
    }

    for (const user of testUsers) {
      await users.insert(user);
    }

    const page1 = await users.page(0, 2, {
      partition: 'byRegionDept',
      partitionValues: {
        region: 'US-WEST',
        department: 'engineering'
      }
    });

    expect(page1.items).toHaveLength(2);
    expect(page1.totalItems).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.page).toBe(0);
    expect(page1.pageSize).toBe(2);

    const page2 = await users.page(1, 2, {
      partition: 'byRegionDept',
      partitionValues: {
        region: 'US-WEST',
        department: 'engineering'
      }
    });

    expect(page2.items).toHaveLength(2);
    expect(page2.page).toBe(1);
  });

  test('should handle automatic timestamp partitions with multi-field support', () => {
    const partitions = users.options.partitions;
    
    expect(partitions.byCreatedDate).toBeDefined();
    expect(partitions.byCreatedDate.fields).toEqual({
      createdAt: 'date|maxlength:10'
    });
    
    expect(partitions.byUpdatedDate).toBeDefined();
    expect(partitions.byUpdatedDate.fields).toEqual({
      updatedAt: 'date|maxlength:10'
    });
  });

  test('should list IDs by partial partition values', async () => {
    const testUsers = [
      {
        id: 'user1',
        name: 'João Silva',
        region: 'US-WEST',
        department: 'engineering',
        status: 'active',
        role: 'admin'
      },
      {
        id: 'user2',
        name: 'Maria Santos',
        region: 'US-WEST',
        department: 'marketing',
        status: 'active',
        role: 'user'
      }
    ];

    for (const user of testUsers) {
      await users.insert(user);
    }

    // List IDs with partial partition values (just region)
    const usWestIds = await users.listIds({
      partition: 'byRegionOnly',
      partitionValues: {
        region: 'US-WEST'
      }
    });

    expect(usWestIds).toHaveLength(2);
    expect(usWestIds).toContain('user1');
    expect(usWestIds).toContain('user2');
  });
});