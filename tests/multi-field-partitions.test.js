import Resource from '../src/resource.class.js';

// Mock client for testing multi-field partitions
const mockClient = {
  config: {
    bucket: 'test-bucket'
  },
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

  test('should generate correct partition keys for multi-field partitions (with consistent ordering)', () => {
    const userData = {
      region: 'US-WEST',
      department: 'engineering',
      status: 'active',
      role: 'admin'
    };

    // Test that fields are consistently ordered alphabetically
    const regionDeptKey = users.getPartitionKey('byRegionDept', 'user1', userData);
    expect(regionDeptKey).toBe('resource=users/partition=byRegionDept/department=engineering/region=US/id=user1');

    const statusRoleKey = users.getPartitionKey('byStatusRole', 'user1', userData);
    expect(statusRoleKey).toBe('resource=users/partition=byStatusRole/role=admin/status=active/id=user1');

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

  test('should apply partition rules consistently with field ordering', () => {
    const testData = {
      region: 'US-WEST',
      department: 'engineering',
      status: 'active',
      role: 'admin'
    };

    // Test multiple calls to ensure consistency
    const key1 = users.getPartitionKey('byRegionDept', 'user1', testData);
    const key2 = users.getPartitionKey('byRegionDept', 'user1', testData);
    const key3 = users.getPartitionKey('byRegionDept', 'user1', testData);

    expect(key1).toBe(key2);
    expect(key2).toBe(key3);
    expect(key1).toBe('resource=users/partition=byRegionDept/department=engineering/region=US/id=user1');
  });

  test('should handle mixed field order in input data', () => {
    // Test with fields in different order than definition
    const testData1 = { region: 'US-WEST', department: 'engineering' };
    const testData2 = { department: 'engineering', region: 'US-WEST' };

    const key1 = users.getPartitionKey('byRegionDept', 'user1', testData1);
    const key2 = users.getPartitionKey('byRegionDept', 'user1', testData2);

    // Should generate identical keys regardless of input order
    expect(key1).toBe(key2);
    expect(key1).toBe('resource=users/partition=byRegionDept/department=engineering/region=US/id=user1');
  });

  test('should apply maxlength rules consistently', () => {
    const testData = {
      region: 'US-WEST-COAST',  // Will be truncated to 'US' due to maxlength:2
      department: 'engineering'
    };

    const key = users.getPartitionKey('byRegionDept', 'user1', testData);
    expect(key).toBe('resource=users/partition=byRegionDept/department=engineering/region=US/id=user1');
  });

  test('should build consistent prefix patterns for queries', () => {
    // Simulate how listIds would build prefixes
    const partitionValues = { region: 'US-WEST', department: 'engineering' };
    const partitionDef = users.options.partitions.byRegionDept;
    
    // Mimic the prefix building logic with sorted fields
    const partitionSegments = [];
    const sortedFields = Object.entries(partitionDef.fields).sort(([a], [b]) => a.localeCompare(b));
    
    for (const [fieldName, rule] of sortedFields) {
      const value = partitionValues[fieldName];
      if (value !== undefined && value !== null) {
        const transformedValue = users.applyPartitionRule(value, rule);
        partitionSegments.push(`${fieldName}=${transformedValue}`);
      }
    }
    
    const expectedPrefix = `resource=users/partition=byRegionDept/${partitionSegments.join('/')}`;
    expect(expectedPrefix).toBe('resource=users/partition=byRegionDept/department=engineering/region=US');
  });
});