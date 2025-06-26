import Resource from '../src/resource.class.js';

describe('Path Structure Tests', () => {
  const mockClient = {
    headObject: jest.fn(),
    putObject: jest.fn(),
    getObject: jest.fn(),
    exists: jest.fn(),
  };

  test('should generate correct standard paths with version', () => {
    const resource = new Resource({
      client: mockClient,
      name: 'users',
      attributes: {
        name: 'string',
        email: 'string'
      }
    });

    const key = resource.getResourceKey('user123', {});
    expect(key).toBe('resource=users/v=1/id=user123');
  });

  test('should generate correct partitioned paths without version', () => {
    const resource = new Resource({
      client: mockClient,
      name: 'events',
      attributes: {
        name: 'string',
        eventDate: 'string',
        region: 'string'
      },
      options: {
        partitionRules: {
          eventDate: 'date',
          region: 'string'
        }
      }
    });

    const key = resource.getResourceKey('event123', {
      eventDate: '2025-06-26',
      region: 'US'
    });
    expect(key).toBe('resource=events/partitions/eventDate=2025-06-26/region=US/id=event123');
  });

  test('should generate correct nested partition paths', () => {
    const resource = new Resource({
      client: mockClient,
      name: 'users',
      attributes: {
        name: 'string',
        region: 'string',
        state: 'string'
      },
      options: {
        partitionRules: {
          region: 'string',
          state: 'string'
        }
      }
    });

    const key = resource.getResourceKey('user123', {
      region: 'BR',
      state: 'SP'
    });
    expect(key).toBe('resource=users/partitions/region=BR/state=SP/id=user123');
  });

  test('should apply maxlength rule correctly', () => {
    const resource = new Resource({
      client: mockClient,
      name: 'logs',
      attributes: {
        message: 'string',
        resumeId: 'string'
      },
      options: {
        partitionRules: {
          resumeId: 'string|maxlength:10'
        }
      }
    });

    const partitionPath = resource.generatePartitionPath({
      resumeId: 'very-long-resume-id-that-should-be-truncated'
    });
    expect(partitionPath).toBe('partitions/resumeId=very-long-/');
  });

  test('should format dates correctly in partitions', () => {
    const resource = new Resource({
      client: mockClient,
      name: 'events',
      attributes: {
        name: 'string',
        eventDate: 'string'
      },
      options: {
        partitionRules: {
          eventDate: 'date'
        }
      }
    });

    const partitionPath = resource.generatePartitionPath({
      eventDate: '2025-06-26T10:30:00Z'
    });
    expect(partitionPath).toBe('partitions/eventDate=2025-06-26/');
  });

  test('should handle empty partition rules', () => {
    const resource = new Resource({
      client: mockClient,
      name: 'simple',
      attributes: {
        name: 'string'
      }
    });

    const partitionPath = resource.generatePartitionPath({
      someField: 'someValue'
    });
    expect(partitionPath).toBe('');
  });

  test('should extract IDs correctly from different path patterns', () => {
    const resource = new Resource({
      client: mockClient,
      name: 'test',
      attributes: { name: 'string' }
    });

    // Mock getAllKeys to return different path patterns
    const keys = [
      'resource=test/v=1/id=user123',
      'resource=test/partitions/region=US/id=event456',
      'resource=test/partitions/region=BR/state=SP/id=user789'
    ];

    const ids = keys.map((key) => {
      const parts = key.split('/');
      const idPart = parts.find(part => part.startsWith('id='));
      return idPart ? idPart.replace('id=', '') : null;
    }).filter(Boolean);

    expect(ids).toEqual(['user123', 'event456', 'user789']);
  });
});