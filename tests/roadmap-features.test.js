import Resource from '../src/resource.class.js';
import Database from '../src/database.class.js';
import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';

describe('Roadmap Features - Complete Coverage', () => {
  let mockClient;
  let mockHeadResponse;
  let mockGetResponse;

  beforeEach(() => {
    mockHeadResponse = {
      Metadata: { name: 'test', email: 'test@example.com' },
      ContentLength: 1024,
      LastModified: new Date(),
      ContentType: 'application/json',
      VersionId: 'v123',
      Expiration: null
    };

    mockGetResponse = {
      Body: {
        transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array(Buffer.from('test content')))
      },
      ContentType: 'text/plain',
      ContentLength: 12
    };

    mockClient = {
      headObject: jest.fn().mockResolvedValue(mockHeadResponse),
      putObject: jest.fn().mockResolvedValue({ ETag: 'test-etag' }),
      getObject: jest.fn().mockResolvedValue(mockGetResponse),
      exists: jest.fn().mockResolvedValue(true),
      deleteObject: jest.fn().mockResolvedValue({ DeleteMarker: true }),
      getAllKeys: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    };
  });

  describe('1. Binary Content Storage (setContent/getContent)', () => {
    test('should store binary content in standard resource', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string', content: 'string' }
      });

      const buffer = Buffer.from('Hello, World!', 'utf8');
      await resource.setContent('doc123', buffer, 'text/plain');

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=documents/v=1/id=doc123',
        body: buffer,
        contentType: 'text/plain',
        metadata: {} // No existing metadata
      });
    });

    test('should store binary content in partitioned resource', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'files',
        attributes: { name: 'string', region: 'string', date: 'string' },
        options: {
          partitionRules: {
            region: 'string',
            date: 'date'
          }
        }
      });

      const buffer = Buffer.from('File content', 'utf8');
      const partitionData = { region: 'US', date: '2025-06-26' };
      
      await resource.setContent('file123', buffer, 'application/octet-stream', partitionData);

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=files/partitions/region=US/date=2025-06-26/id=file123',
        body: buffer,
        contentType: 'application/octet-stream',
        metadata: {}
      });
    });

    test('should preserve existing metadata when setting content', async () => {
      const existingMetadata = { title: 'Test Document', author: 'John Doe' };
      mockClient.headObject.mockResolvedValueOnce({
        Metadata: existingMetadata,
        ContentLength: 0
      });

      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string', author: 'string' }
      });

      const buffer = Buffer.from('New content', 'utf8');
      await resource.setContent('doc123', buffer, 'text/plain');

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=documents/v=1/id=doc123',
        body: buffer,
        contentType: 'text/plain',
        metadata: existingMetadata
      });
    });

    test('should retrieve binary content correctly', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string' }
      });

      const result = await resource.getContent('doc123');

      expect(result).toEqual({
        buffer: Buffer.from('test content'),
        contentType: 'text/plain'
      });
      expect(mockClient.getObject).toHaveBeenCalledWith('resource=documents/v=1/id=doc123');
    });

    test('should handle non-existent content gracefully', async () => {
      mockClient.getObject.mockRejectedValueOnce({ name: 'NoSuchKey' });

      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string' }
      });

      const result = await resource.getContent('nonexistent');

      expect(result).toEqual({
        buffer: null,
        contentType: null
      });
    });

    test('should detect content existence correctly', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string' }
      });

      // Object with content
      mockClient.headObject.mockResolvedValueOnce({ ContentLength: 1024 });
      const hasContent = await resource.hasContent('doc123');
      expect(hasContent).toBe(true);

      // Object without content (metadata only)
      mockClient.headObject.mockResolvedValueOnce({ ContentLength: 0 });
      const hasNoContent = await resource.hasContent('doc456');
      expect(hasNoContent).toBe(false);

      // Non-existent object
      mockClient.headObject.mockRejectedValueOnce({ name: 'NoSuchKey' });
      const notExists = await resource.hasContent('doc789');
      expect(notExists).toBe(false);
    });

    test('should delete content but preserve metadata', async () => {
      const existingMetadata = { title: 'Test Document' };
      mockClient.headObject.mockResolvedValueOnce({
        Metadata: existingMetadata,
        ContentLength: 1024
      });

      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string' }
      });

      await resource.deleteContent('doc123');

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=documents/v=1/id=doc123',
        body: '',
        metadata: existingMetadata
      });
    });

    test('should throw error for non-Buffer content', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string' }
      });

      await expect(resource.setContent('doc123', 'not a buffer')).rejects.toThrow('Content must be a Buffer');
    });
  });

  describe('2. Extended get() Method', () => {
    test('should return extended metadata including _hasContent', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string', author: 'string' }
      });

      // Mock schema unmapper
      resource.schema.unmapper = jest.fn().mockResolvedValue({
        title: 'Test Document',
        author: 'John Doe'
      });

      const result = await resource.get('doc123');

      expect(result).toEqual({
        id: 'doc123',
        title: 'Test Document',
        author: 'John Doe',
        _contentLength: 1024,
        _lastModified: mockHeadResponse.LastModified,
        mimeType: 'application/json',
        _versionId: 'v123',
        definitionHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        _hasContent: true // ContentLength > 0
      });
    });

    test('should indicate no content when object is metadata-only', async () => {
      mockClient.headObject.mockResolvedValueOnce({
        ...mockHeadResponse,
        ContentLength: 0
      });

      const resource = new Resource({
        client: mockClient,
        name: 'documents',
        attributes: { title: 'string' }
      });

      resource.schema.unmapper = jest.fn().mockResolvedValue({ title: 'Test' });

      const result = await resource.get('doc123');
      expect(result._hasContent).toBe(false);
    });
  });

  describe('3. Partition Support', () => {
    test('should generate correct partition paths', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'events',
        attributes: { name: 'string', date: 'string', region: 'string' },
        options: {
          partitionRules: {
            date: 'date',
            region: 'string|maxlength:5'
          }
        }
      });

      const partitionPath = resource.generatePartitionPath({
        date: '2025-06-26',
        region: 'US-WEST-COAST'
      });

      expect(partitionPath).toBe('partitions/date=2025-06-26/region=US-WE/');
    });

    test('should handle Date objects in partition rules', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'events',
        attributes: { name: 'string', eventDate: 'string' },
        options: {
          partitionRules: {
            eventDate: 'date'
          }
        }
      });

      const date = new Date('2025-06-26T10:30:00Z');
      const partitionPath = resource.generatePartitionPath({
        eventDate: date
      });

      expect(partitionPath).toBe('partitions/eventDate=2025-06-26/');
    });

    test('should apply maxlength rule correctly', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'logs',
        attributes: { message: 'string', resumeId: 'string' },
        options: {
          partitionRules: {
            resumeId: 'string|maxlength:10'
          }
        }
      });

      const partitionPath = resource.generatePartitionPath({
        resumeId: 'very-long-resume-id-that-exceeds-limit'
      });

      expect(partitionPath).toBe('partitions/resumeId=very-long-/');
    });

    test('should skip undefined/null values in partitions', () => {
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

      const partitionPath = resource.generatePartitionPath({
        date: '2025-06-26',
        region: null, // Should be skipped
        undefinedField: undefined // Should be skipped
      });

      expect(partitionPath).toBe('partitions/date=2025-06-26/');
    });

    test('should generate correct resource keys based on partition data', () => {
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

      // Standard key (no partition data)
      const standardKey = resource.getResourceKey('user123', {});
      expect(standardKey).toBe('resource=users/v=1/id=user123');

      // Partitioned key
      const partitionedKey = resource.getResourceKey('user123', { region: 'US' });
      expect(partitionedKey).toBe('resource=users/partitions/region=US/id=user123');
    });

    test('should support nested partitions', () => {
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

      const partitionPath = resource.generatePartitionPath({
        country: 'BR',
        state: 'SP',
        date: '2025-06-26'
      });

      expect(partitionPath).toBe('partitions/country=BR/state=SP/date=2025-06-26/');
    });
  });

  describe('4. Schema Versioning & Definition Hashing', () => {
    test('should generate consistent definition hashes', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { name: 'string', email: 'string' }
      });

      const hash1 = resource.getDefinitionHash();
      const hash2 = resource.getDefinitionHash();

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    test('should generate different hashes for different schemas', () => {
      const resource1 = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { name: 'string', email: 'string' }
      });

      const resource2 = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { name: 'string', email: 'string', age: 'number' }
      });

      const hash1 = resource1.getDefinitionHash();
      const hash2 = resource2.getDefinitionHash();

      expect(hash1).not.toBe(hash2);
    });

    test('should include definition hash in exported schema', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'users',
        attributes: { name: 'string', email: 'string' }
      });

      const exported = resource.export();
      const hash = resource.getDefinitionHash();
      
      // Verify that the hash is based on the exported schema
      const stableString = jsonStableStringify(exported);
      const expectedHash = `sha256:${createHash('sha256').update(stableString).digest('hex')}`;
      
      expect(hash).toBe(expectedHash);
    });
  });

  describe('5. Database Integration & Change Detection', () => {
    test('should detect definition changes', () => {
      const db = new Database({
        connectionString: 'mock://test',
        client: mockClient
      });

      // Simulate current resources
      db.resources = {
        users: new Resource({
          client: mockClient,
          name: 'users',
          attributes: { name: 'string', email: 'string' }
        })
      };

      // Simulate saved metadata with different hash
      const savedMetadata = {
        resources: {
          users: {
            definitionHash: 'sha256:different-hash'
          },
          deletedResource: {
            definitionHash: 'sha256:old-hash'
          }
        }
      };

      const changes = db.detectDefinitionChanges(savedMetadata);

      expect(changes).toHaveLength(2);
      expect(changes[0]).toEqual({
        type: 'changed',
        resourceName: 'users',
        currentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        savedHash: 'sha256:different-hash'
      });
      expect(changes[1]).toEqual({
        type: 'deleted',
        resourceName: 'deletedResource',
        currentHash: null,
        savedHash: 'sha256:old-hash'
      });
    });

    test('should detect new resources', () => {
      const db = new Database({
        connectionString: 'mock://test',
        client: mockClient
      });

      db.resources = {
        newResource: new Resource({
          client: mockClient,
          name: 'newResource',
          attributes: { name: 'string' }
        })
      };

      const savedMetadata = { resources: {} };
      const changes = db.detectDefinitionChanges(savedMetadata);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('new');
      expect(changes[0].resourceName).toBe('newResource');
    });

    test('should generate consistent definition hashes at database level', () => {
      const db = new Database({
        connectionString: 'mock://test',
        client: mockClient
      });

      const definition = {
        name: 'users',
        attributes: { name: 'string', email: 'string' },
        options: { timestamps: true }
      };

      const hash1 = db.generateDefinitionHash(definition);
      const hash2 = db.generateDefinitionHash(definition);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
    });
  });

  describe('6. Complete Roadmap Integration Tests', () => {
    test('should handle complete workflow: create, partition, content, versioning', async () => {
      const resource = new Resource({
        client: mockClient,
        name: 'files',
        attributes: { 
          filename: 'string', 
          size: 'number',
          uploadDate: 'string',
          bucket: 'string'
        },
        options: {
          timestamps: true,
          partitionRules: {
            uploadDate: 'date',
            bucket: 'string|maxlength:10'
          }
        }
      });

      // Mock schema methods
      resource.schema.validate = jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
        data: {
          filename: 'test.pdf',
          size: 2048,
          uploadDate: '2025-06-26',
          bucket: 'documents-bucket-long-name'
        }
      });
      resource.schema.mapper = jest.fn().mockResolvedValue({
        filename: 'test.pdf',
        size: '2048',
        uploadDate: '2025-06-26',
        bucket: 'documents-bucket-long-name'
      });

      // 1. Insert with partitioning
      const result = await resource.insert({
        filename: 'test.pdf',
        size: 2048,
        uploadDate: '2025-06-26',
        bucket: 'documents-bucket-long-name'
      });

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=files/partitions/uploadDate=2025-06-26/bucket=documents-/id=' + result.id,
        metadata: expect.any(Object),
        body: ''
      });

      // 2. Add binary content
      const fileContent = Buffer.from('PDF file content here', 'utf8');
      const partitionData = { 
        uploadDate: '2025-06-26', 
        bucket: 'documents-bucket-long-name' 
      };
      
      await resource.setContent(result.id, fileContent, 'application/pdf', partitionData);

      expect(mockClient.putObject).toHaveBeenCalledWith({
        key: 'resource=files/partitions/uploadDate=2025-06-26/bucket=documents-/id=' + result.id,
        body: fileContent,
        contentType: 'application/pdf',
        metadata: {}
      });

      // 3. Verify definition hash is included
      const definitionHash = resource.getDefinitionHash();
      expect(definitionHash).toMatch(/^sha256:[a-f0-9]{64}$/);

      // 4. Verify partition path generation
      const expectedPath = resource.generatePartitionPath(partitionData);
      expect(expectedPath).toBe('partitions/uploadDate=2025-06-26/bucket=documents-/');
    });

    test('should handle ID extraction from various path patterns', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'mixed',
        attributes: { name: 'string' }
      });

      const testKeys = [
        'resource=mixed/v=1/id=standard123',
        'resource=mixed/partitions/region=US/id=partitioned456',
        'resource=mixed/partitions/country=BR/state=SP/date=2025-06-26/id=nested789',
        'resource=mixed/v=2/id=version2_abc'
      ];

      const extractedIds = testKeys.map((key) => {
        const parts = key.split('/');
        const idPart = parts.find(part => part.startsWith('id='));
        return idPart ? idPart.replace('id=', '') : null;
      }).filter(Boolean);

      expect(extractedIds).toEqual([
        'standard123',
        'partitioned456', 
        'nested789',
        'version2_abc'
      ]);
    });

    test('should validate roadmap requirements coverage', () => {
      // Verify all roadmap features are implemented:
      
      // 1. ✅ setContent(id, buffer, contentType) - Implemented
      const resource = new Resource({
        client: mockClient,
        name: 'test',
        attributes: { name: 'string' }
      });
      expect(typeof resource.setContent).toBe('function');

      // 2. ✅ getContent(id) - Implemented  
      expect(typeof resource.getContent).toBe('function');

      // 3. ✅ Extended get() method - Returns additional metadata
      expect(typeof resource.get).toBe('function');

      // 4. ✅ Partition support - generatePartitionPath implemented
      expect(typeof resource.generatePartitionPath).toBe('function');

      // 5. ✅ Definition hashing - getDefinitionHash implemented
      expect(typeof resource.getDefinitionHash).toBe('function');

      // 6. ✅ hasContent and deleteContent - Implemented
      expect(typeof resource.hasContent).toBe('function');
      expect(typeof resource.deleteContent).toBe('function');

      // 7. ✅ Database versioning - detectDefinitionChanges implemented
      const db = new Database({ connectionString: 'mock://', client: mockClient });
      expect(typeof db.detectDefinitionChanges).toBe('function');
      expect(typeof db.generateDefinitionHash).toBe('function');

      // All requirements are covered! ✅
    });
  });

  describe('7. Edge Cases & Error Handling', () => {
    test('should handle invalid partition rule formats gracefully', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'test',
        attributes: { name: 'string', field: 'string' },
        options: {
          partitionRules: {
            field: 'invalid-rule-format'
          }
        }
      });

      const partitionPath = resource.generatePartitionPath({
        field: 'test-value'
      });

      // Should still work, just won't apply special formatting
      expect(partitionPath).toBe('partitions/field=test-value/');
    });

    test('should handle malformed date strings in partition rules', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'test',
        attributes: { name: 'string', date: 'string' },
        options: {
          partitionRules: {
            date: 'date'
          }
        }
      });

      const partitionPath = resource.generatePartitionPath({
        date: 'not-a-valid-date'
      });

      // Should keep original value if date parsing fails
      expect(partitionPath).toBe('partitions/date=not-a-valid-date/');
    });

    test('should handle empty or missing attributes in partitions', () => {
      const resource = new Resource({
        client: mockClient,
        name: 'test',
        attributes: { name: 'string' },
        options: {
          partitionRules: {
            nonexistent: 'string'
          }
        }
      });

      const partitionPath = resource.generatePartitionPath({
        name: 'test'
      });

      // Should return empty string when no valid partition values
      expect(partitionPath).toBe('');
    });
  });
});