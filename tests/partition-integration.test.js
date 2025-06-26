import Resource from '../src/resource.class.js';

describe('Partition Integration Tests', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      headObject: jest.fn().mockResolvedValue({ 
        Metadata: { name: 'test' },
        ContentLength: 1024
      }),
      putObject: jest.fn().mockResolvedValue({ ETag: 'test-etag' }),
      getObject: jest.fn().mockResolvedValue({
        Body: { transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array()) },
        ContentType: 'application/json'
      }),
      exists: jest.fn().mockResolvedValue(true),
      deleteObject: jest.fn().mockResolvedValue({ DeleteMarker: true }),
      getAllKeys: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    };
  });

  describe('Partition Listing and Pagination', () => {
    test('should list IDs from partitioned resources correctly', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'events',
        attributes: { name: 'string', date: 'string', region: 'string' },
        options: {
          partitionRules: {
            date: 'date',
            region: 'string'
          }
        }
      });

      // Mock S3 keys with mixed partitions
      const mockKeys = [
        'resource=events/partitions/date=2025-06-26/region=US/id=event1',
        'resource=events/partitions/date=2025-06-26/region=BR/id=event2',
        'resource=events/partitions/date=2025-06-27/region=US/id=event3',
        'resource=events/partitions/date=2025-06-27/id=event4', // Missing region
        'resource=events/v=1/id=legacy_event', // Non-partitioned
        'resource=other/partitions/date=2025-06-26/id=other1' // Different resource
      ];

      mockClient.getAllKeys.mockResolvedValue(mockKeys);

      const partitionData = { date: '2025-06-26' };
      const ids = await resource.listIds(partitionData);

      // Should only return IDs that match the partition filter
      expect(ids).toEqual(['event1', 'event2']);
      expect(mockClient.getAllKeys).toHaveBeenCalledWith(
        'resource=events/partitions/date=2025-06-26/'
      );
    });

    test('should handle listIds with full partition specification', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'analytics',
        attributes: { event: 'string', country: 'string', state: 'string', date: 'string' },
        options: {
          partitionRules: {
            country: 'string',
            state: 'string', 
            date: 'date'
          }
        }
      });

      const mockKeys = [
        'resource=analytics/partitions/country=BR/state=SP/date=2025-06-26/id=event1',
        'resource=analytics/partitions/country=BR/state=SP/date=2025-06-26/id=event2',
        'resource=analytics/partitions/country=BR/state=RJ/date=2025-06-26/id=event3',
        'resource=analytics/partitions/country=US/state=CA/date=2025-06-26/id=event4'
      ];

      mockClient.getAllKeys.mockResolvedValue(mockKeys);

      const partitionData = { country: 'BR', state: 'SP', date: '2025-06-26' };
      const ids = await resource.listIds(partitionData);

      expect(ids).toEqual(['event1', 'event2']);
      expect(mockClient.getAllKeys).toHaveBeenCalledWith(
        'resource=analytics/partitions/country=BR/state=SP/date=2025-06-26/'
      );
    });

    test('should handle page method with partition data', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { name: 'string', region: 'string' },
        options: {
          partitionRules: {
            region: 'string'
          }
        }
      });

      const mockKeys = [
        'resource=users/partitions/region=US/id=user1',
        'resource=users/partitions/region=US/id=user2',
        'resource=users/partitions/region=US/id=user3',
        'resource=users/partitions/region=US/id=user4',
        'resource=users/partitions/region=US/id=user5'
      ];

      mockClient.getAllKeys.mockResolvedValue(mockKeys);

      // Mock get method for each item
      resource.get = jest.fn()
        .mockResolvedValueOnce({ id: 'user1', name: 'User 1', region: 'US' })
        .mockResolvedValueOnce({ id: 'user2', name: 'User 2', region: 'US' })
        .mockResolvedValueOnce({ id: 'user3', name: 'User 3', region: 'US' });

      const partitionData = { region: 'US' };
      const result = await resource.page(0, 3, partitionData);

      expect(result).toEqual({
        items: [
          { id: 'user1', name: 'User 1', region: 'US' },
          { id: 'user2', name: 'User 2', region: 'US' },
          { id: 'user3', name: 'User 3', region: 'US' }
        ],
        totalItems: 5,
        page: 0,
        pageSize: 3,
        totalPages: 2
      });

      // Verify get was called with partition data
      expect(resource.get).toHaveBeenCalledWith('user1', partitionData);
      expect(resource.get).toHaveBeenCalledWith('user2', partitionData);
      expect(resource.get).toHaveBeenCalledWith('user3', partitionData);
    });

    test('should handle empty partition results gracefully', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'events',
        attributes: { name: 'string', region: 'string' },
        options: {
          partitionRules: {
            region: 'string'
          }
        }
      });

      mockClient.getAllKeys.mockResolvedValue([]);

      const partitionData = { region: 'NON_EXISTENT' };
      const ids = await resource.listIds(partitionData);

      expect(ids).toEqual([]);
    });

    test('should list all IDs when no partition data provided', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'mixed',
        attributes: { name: 'string', category: 'string' },
        options: {
          partitionRules: {
            category: 'string'
          }
        }
      });

      const mockKeys = [
        'resource=mixed/v=1/id=standard1',
        'resource=mixed/v=1/id=standard2',
        'resource=mixed/partitions/category=A/id=partitioned1',
        'resource=mixed/partitions/category=B/id=partitioned2'
      ];

      mockClient.getAllKeys.mockResolvedValue(mockKeys);

      const ids = await resource.listIds();

      expect(ids).toEqual(['standard1', 'standard2', 'partitioned1', 'partitioned2']);
      expect(mockClient.getAllKeys).toHaveBeenCalledWith('resource=mixed/');
    });
  });

  describe('Partition Content Management', () => {
    test('should handle content operations with consistent partition data', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'files',
        attributes: { name: 'string', folder: 'string', date: 'string' },
        options: {
          partitionRules: {
            folder: 'string',
            date: 'date'
          }
        }
      });

      const partitionData = { folder: 'uploads', date: '2025-06-26' };
      const content = Buffer.from('File content');

      // Set content
      await resource.setContent('file123', content, 'text/plain', partitionData);

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=files/partitions/folder=uploads/date=2025-06-26/id=file123',
        body: content,
        contentType: 'text/plain',
        metadata: {}
      });

      // Get content
      mockClient.getObject.mockResolvedValue({
        Body: { transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array(content)) },
        ContentType: 'text/plain'
      });

      const result = await resource.getContent('file123', partitionData);

      expect(result).toEqual({
        buffer: content,
        contentType: 'text/plain'
      });
      expect(mockClient.getObject).toHaveBeenCalledWith(
        'resource=files/partitions/folder=uploads/date=2025-06-26/id=file123'
      );

      // Check content existence
      const hasContent = await resource.hasContent('file123', partitionData);
      expect(hasContent).toBe(true);
      expect(mockClient.headObject).toHaveBeenCalledWith(
        'resource=files/partitions/folder=uploads/date=2025-06-26/id=file123'
      );

      // Delete content
      mockClient.headObject.mockResolvedValue({
        Metadata: { name: 'test.txt' },
        ContentLength: content.length
      });

      await resource.deleteContent('file123', partitionData);

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=files/partitions/folder=uploads/date=2025-06-26/id=file123',
        body: '',
        metadata: { name: 'test.txt' }
      });
    });

    test('should fail content operations with mismatched partition data', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'docs',
        attributes: { title: 'string', category: 'string' },
        options: {
          partitionRules: {
            category: 'string'
          }
        }
      });

      // Set content with one partition
      const content = Buffer.from('Document content');
      await resource.setContent('doc1', content, 'text/plain', { category: 'legal' });

      // Try to get with different partition
      mockClient.getObject.mockRejectedValue({ name: 'NoSuchKey' });

      const result = await resource.getContent('doc1', { category: 'technical' });

      expect(result).toEqual({
        buffer: null,
        contentType: null
      });
    });
  });

  describe('CRUD Operations with Partitions', () => {
    test('should insert resource with automatic partition path generation', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'events',
        attributes: { title: 'string', eventDate: 'string', region: 'string' },
        options: {
          partitionRules: {
            eventDate: 'date',
            region: 'string|maxlength:3'
          }
        }
      });

      // Mock schema validation and mapping
      resource.schema.validate = jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
        data: {
          title: 'Conference',
          eventDate: '2025-06-26',
          region: 'US-WEST'
        }
      });

      resource.schema.mapper = jest.fn().mockResolvedValue({
        title: 'Conference',
        eventDate: '2025-06-26',
        region: 'US-WEST'
      });

      const result = await resource.insert({
        title: 'Conference',
        eventDate: '2025-06-26',
        region: 'US-WEST'
      });

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: `resource=events/partitions/eventDate=2025-06-26/region=US-/id=${result.id}`,
        metadata: expect.objectContaining({
          title: 'Conference',
          eventDate: '2025-06-26',
          region: 'US-WEST'
        }),
        body: ''
      });
    });

    test('should update partitioned resource with correct key', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'products',
        attributes: { name: 'string', category: 'string', price: 'number' },
        options: {
          partitionRules: {
            category: 'string'
          }
        }
      });

      // Mock existing resource
      mockClient.headObject.mockResolvedValue({
        Metadata: { name: 'Product A', category: 'electronics', price: '100' }
      });

      resource.schema.validate = jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
        data: { name: 'Product A Updated', category: 'electronics', price: 150 }
      });

      resource.schema.mapper = jest.fn().mockResolvedValue({
        name: 'Product A Updated',
        category: 'electronics', 
        price: '150'
      });

      const partitionData = { category: 'electronics' };
      const result = await resource.update('prod123', {
        name: 'Product A Updated',
        price: 150
      }, partitionData);

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=products/partitions/category=electronics/id=prod123',
        metadata: expect.objectContaining({
          name: 'Product A Updated',
          price: '150'
        }),
        body: ''
      });
    });

    test('should delete partitioned resource with correct key', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'orders',
        attributes: { orderNumber: 'string', date: 'string', status: 'string' },
        options: {
          partitionRules: {
            date: 'date',
            status: 'string'
          }
        }
      });

      const partitionData = { date: '2025-06-26', status: 'completed' };
      const result = await resource.delete('order123', partitionData);

      expect(mockClient.deleteObject).toHaveBeenCalledWith(
        'resource=orders/partitions/date=2025-06-26/status=completed/id=order123'
      );
      expect(result).toBe(true);
    });

    test('should count partitioned resources correctly', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'logs',
        attributes: { message: 'string', level: 'string', date: 'string' },
        options: {
          partitionRules: {
            level: 'string',
            date: 'date'
          }
        }
      });

      mockClient.count.mockResolvedValue(42);

      const partitionData = { level: 'error', date: '2025-06-26' };
      const count = await resource.count(partitionData);

      expect(count).toBe(42);
      expect(mockClient.count).toHaveBeenCalledWith(
        'resource=logs/partitions/level=error/date=2025-06-26/'
      );
    });
  });
});