import { join } from 'path';

import Client from '../src/client.class';
import Resource from '../src/resource.class';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-' + Date.now())

describe('Resource', () => {
  const client = new Client({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}`
  })

  const resource = new Resource({
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

  beforeEach(async () => {
    await resource.deleteAll()
  })

  test('single element complete example', async () => {
    const in1 = await resource.insert({
      animal: 'dog',
      name: 'beagle',
    })

    expect(in1).toBeDefined()
    expect(in1.id).toBeDefined()
    expect(in1.animal).toBe('dog')
    expect(in1.name).toBe('beagle')
    expect(in1.createdAt).toBeDefined()
    expect(in1.updatedAt).toBeDefined()

    const ex1 = await resource.exists(in1.id)
    expect(ex1).toBe(true)
    const ex2 = await resource.exists(in1.id + '$$')
    expect(ex2).toBe(false)

    const up1 = await resource.update(in1.id, { name: 'bulldog' })

    expect(up1).toBeDefined()
    expect(up1.id).toBe(in1.id)
    expect(up1.animal).toBe('dog')
    expect(up1.name).toBe('bulldog')
    expect(up1.createdAt).toBeDefined()
    expect(up1.updatedAt).toBeDefined()
    expect(up1.createdAt).toBe(in1.createdAt)
    expect(up1.updatedAt).not.toBe(in1.updatedAt)

    const up2 = await resource.upsert({ 
      id: in1.id, 
      name: 'dalmata',
    })

    expect(up2).toBeDefined()
    expect(up2.id).toBe(in1.id)
    expect(up2.animal).toBe('dog')
    expect(up2.name).toBe('dalmata')
    expect(up2.createdAt).toBeDefined()
    expect(up2.updatedAt).toBeDefined()
    expect(up2.createdAt).toBe(in1.createdAt)
    expect(up2.updatedAt).not.toBe(in1.updatedAt)

    const del1 = await resource.delete(in1.id)
    const count = await resource.count()

    expect(del1).toBeDefined()
    expect(count).toBe(0)

    const in2 = await resource.upsert({
      animal: 'cat',
      name: 'persian',
    })

    expect(in2).toBeDefined()
    expect(in2.id).toBeDefined()
    expect(in2.animal).toBe('cat')
    expect(in2.name).toBe('persian')
    expect(in2.createdAt).toBeDefined()
    expect(in2.updatedAt).toBeDefined()

    const del2 = await resource.delete(in2.id)
    const count2 = await resource.count()

    expect(del2).toBeDefined()
    expect(count2).toBe(0)
  });

  test('multiple elements complete example', async () => {
    const [in1, in2, in3] = await resource.insertMany([
      { animal: 'dog', name: 'beagle', token: '$ecret1' },
      { animal: 'dog', name: 'poodle', token: '$ecret3' },
      { animal: 'dog', name: 'bulldog', token: '$ecret2' },
    ])

    const count = await resource.count()
    expect(count).toBe(3)

    const list = await resource.listIds()
    expect(list).toBeDefined()
    expect(list.length).toBe(3)

    const del1 = await resource.deleteMany([ in1.id, in2.id, in3.id ])
    expect(del1).toBeDefined()

    const count2 = await resource.count()
    expect(count2).toBe(0)
  });
});

describe('Resource binary content', () => {
  const contentResource = new Resource({
    client,
    name: 'content-test',
    attributes: {
      name: 'string'
    }
  })

  beforeEach(async () => {
    await contentResource.deleteAll()
  })

  test('should store and retrieve binary content', async () => {
    const user = await contentResource.insert({ name: 'John Doe' });
    const buffer = Buffer.from('Hello, World!', 'utf8');
    
    // Store content
    await contentResource.setContent(user.id, buffer, 'text/plain');
    
    // Retrieve content
    const content = await contentResource.getContent(user.id);
    expect(content.buffer.toString('utf8')).toBe('Hello, World!');
    expect(content.contentType).toBe('text/plain');
    
    // Check content exists
    const hasContent = await contentResource.hasContent(user.id);
    expect(hasContent).toBe(true);
    
    // Delete content
    await contentResource.deleteContent(user.id);
    
    // Verify content is deleted
    const deletedContent = await contentResource.getContent(user.id);
    expect(deletedContent.buffer).toBe(null);
    expect(deletedContent.contentType).toBe(null);
    
    const hasContentAfterDelete = await contentResource.hasContent(user.id);
    expect(hasContentAfterDelete).toBe(false);
  });

  test('should handle non-existent content gracefully', async () => {
    const content = await contentResource.getContent('non-existent-id');
    expect(content.buffer).toBe(null);
    expect(content.contentType).toBe(null);
    
    const hasContent = await contentResource.hasContent('non-existent-id');
    expect(hasContent).toBe(false);
  });

  test('should throw error for non-buffer content', async () => {
    const user = await contentResource.insert({ name: 'John Doe' });
    
    await expect(contentResource.setContent(user.id, 'not a buffer')).rejects.toThrow('Content must be a Buffer');
  });
});

describe('Resource partitions', () => {
  const partitionResource = new Resource({
    client,
    name: 'partition-test',
    attributes: {
      name: 'string',
      region: 'string',
      createdAt: 'string'
    },
    options: {
      partitionRules: {
        region: 'string',
        createdAt: 'date'
      }
    }
  })

  beforeEach(async () => {
    await partitionResource.deleteAll()
  })

  test('should create partitioned resources with date partitions', async () => {
    const event = await partitionResource.insert({ 
      name: 'Test Event', 
      region: 'US',
      createdAt: '2025-06-26'
    });
    
    expect(event.name).toBe('Test Event');
    expect(event.createdAt).toBe('2025-06-26');
    
    // Should be able to retrieve with partition data
    const retrieved = await partitionResource.get(event.id, { 
      region: 'US', 
      createdAt: '2025-06-26' 
    });
    expect(retrieved.name).toBe('Test Event');
  });

  test('should generate correct partition paths', async () => {
    const partitionPath = partitionResource.generatePartitionPath({
      region: 'US',
      createdAt: '2025-06-26'
    });
    
    expect(partitionPath).toBe('partitions/region=US/createdAt=2025-06-26/');
  });

  test('should handle empty partition rules', async () => {
    const noPartitionResource = new Resource({
      client,
      name: 'no-partition',
      attributes: {
        name: 'string'
      }
    });

    const partitionPath = noPartitionResource.generatePartitionPath({
      region: 'US'
    });
    
    expect(partitionPath).toBe('');
  });
});

describe('Resource definition hash', () => {
  test('should generate consistent definition hash', async () => {
    const hash1 = resource.getDefinitionHash();
    const hash2 = resource.getDefinitionHash();
    
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('should include definition hash in get response', async () => {
    const user = await resource.insert({ animal: 'dog', name: 'beagle' });
    const retrieved = await resource.get(user.id);
    
    expect(retrieved.definitionHash).toBeDefined();
    expect(retrieved.definitionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe('Extended get method', () => {
  test('should return additional metadata fields', async () => {
    const user = await resource.insert({ animal: 'dog', name: 'beagle' });
    const retrieved = await resource.get(user.id);
    
    expect(retrieved._contentLength).toBeDefined();
    expect(retrieved._lastModified).toBeDefined();
    expect(retrieved.mimeType).toBeDefined();
    expect(retrieved.definitionHash).toBeDefined();
    
    // _contentLength should be a number
    expect(typeof retrieved._contentLength).toBe('number');
    
    // _lastModified should be a Date
    expect(retrieved._lastModified).toBeInstanceOf(Date);
  });
});
