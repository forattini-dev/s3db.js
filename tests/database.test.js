import { join } from 'path';

import Database from '../src/database.class';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'database-' + Date.now())

describe('Database', () => {
  const s3db = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}`
  })

  beforeAll(async () => {
    await s3db.connect()
  })

  test('create resource', async () => {
    const users = await s3db.createResource({
      name: "users",
      attributes: {
        name: "string",
        email: "string",
      },
    })

    await users.insert({
      name: 'Filipe Forattini',
      email: 'filipe@forattini.com.br',
    })
  })

  test('should generate proper s3db.json with versioning info', async () => {
    const users = await s3db.createResource({
      name: "versioned-users",
      attributes: {
        name: "string",
        email: "string",
      },
    })

    // Check if s3db.json exists and has proper structure
    const s3dbJsonExists = await s3db.client.exists('s3db.json');
    expect(s3dbJsonExists).toBe(true);

    // Get and parse s3db.json
    const response = await s3db.client.getObject('s3db.json');
    const s3dbContent = JSON.parse(await response.Body.transformToString());

    expect(s3dbContent.version).toBe('1');
    expect(s3dbContent.s3dbVersion).toBe('0.6.2');
    expect(s3dbContent.resources).toBeDefined();
    expect(s3dbContent.resources['versioned-users']).toBeDefined();
    expect(s3dbContent.resources['versioned-users'].definitionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  })

  test('should generate consistent definition hashes', async () => {
    const testResource = await s3db.createResource({
      name: "hash-test",
      attributes: {
        name: "string",
        age: "number",
      },
    })

    const exportedResource = testResource.export();
    const hash1 = s3db.generateDefinitionHash(exportedResource);
    const hash2 = s3db.generateDefinitionHash(exportedResource);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  })

  test('should detect definition changes on connect', async () => {
    // Create a new database instance to test connection behavior
    const testDb = new Database({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}-change-detection`
    });

    let definitionChanges = [];
    testDb.on('definitionChanges', (changes) => {
      definitionChanges = changes;
    });

    // Create initial resource
    await testDb.createResource({
      name: "change-test",
      attributes: {
        name: "string",
      },
    });

    await testDb.connect();

    // Should detect no changes on first connect
    expect(definitionChanges.length).toBe(0);

    // Now create a database with different resource definition
    const testDb2 = new Database({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}-change-detection`
    });

    await testDb2.createResource({
      name: "change-test",
      attributes: {
        name: "string",
        email: "string", // Added field - should trigger change detection
      },
    });

    definitionChanges = [];
    testDb2.on('definitionChanges', (changes) => {
      definitionChanges = changes;
    });

    await testDb2.connect();

    // Should detect changes
    expect(definitionChanges.length).toBeGreaterThan(0);
    expect(definitionChanges[0].type).toBe('changed');
    expect(definitionChanges[0].resourceName).toBe('change-test');
  })
});

describe('Database partition support', () => {
  const partitionDb = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}-partitions`
  })

  beforeAll(async () => {
    await partitionDb.connect()
  })

  test('should create resources with partition rules', async () => {
    const events = await partitionDb.createResource({
      name: "events",
      attributes: {
        name: "string",
        eventDate: "string",
        region: "string",
      },
      options: {
        partitionRules: {
          eventDate: "date",
          region: "string|maxlength:5"
        }
      }
    })

    const event = await events.insert({
      name: 'Test Event',
      eventDate: '2025-06-26',
      region: 'US-WEST'
    });

    expect(event.name).toBe('Test Event');
    expect(event.eventDate).toBe('2025-06-26');
    expect(event.region).toBe('US-WEST');

    // Test partition path generation
    const partitionPath = events.generatePartitionPath({
      eventDate: '2025-06-26',
      region: 'US-WEST-VERY-LONG'
    });

    expect(partitionPath).toBe('partitions/eventDate=2025-06-26/region=US-WE/');
  })
});

describe('Database binary content integration', () => {
  const contentDb = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}-content`
  })

  beforeAll(async () => {
    await contentDb.connect()
  })

  test('should handle binary content through database resource', async () => {
    const files = await contentDb.createResource({
      name: "files",
      attributes: {
        filename: "string",
        size: "number",
      },
    })

    const file = await files.insert({
      filename: 'test.txt',
      size: 1024
    });

    const testContent = Buffer.from('This is test file content', 'utf8');
    
    // Store binary content
    await files.setContent(file.id, testContent, 'text/plain');
    
    // Retrieve binary content
    const content = await files.getContent(file.id);
    expect(content.buffer.toString('utf8')).toBe('This is test file content');
    expect(content.contentType).toBe('text/plain');
    
    // Verify content exists
    const hasContent = await files.hasContent(file.id);
    expect(hasContent).toBe(true);
  })
});
