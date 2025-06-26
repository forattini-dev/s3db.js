import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Client from '../src/client.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'client-journey-' + Date.now());

describe('Client Class - Complete Journey', () => {
  let client;

  beforeEach(async () => {
    client = new Client({
      verbose: false,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        ?.replace('USER', process.env.MINIO_USER)
        ?.replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });
  });

  test('Client Journey: Connect → Upload → List → Download → Copy → Move → Delete', async () => {

    // 1. Setup event listeners to track operations
    
    const events = {
      commandRequest: 0,
      commandResponse: 0,
      putObject: 0,
      getObject: 0,
      headObject: 0,
      deleteObject: 0,
      deleteObjects: 0,
      listObjects: 0,
      count: 0,
      getAllKeys: 0
    };

    client.on('command.request', () => events.commandRequest++);
    client.on('command.response', () => events.commandResponse++);
    client.on('putObject', () => events.putObject++);
    client.on('getObject', () => events.getObject++);
    client.on('headObject', () => events.headObject++);
    client.on('deleteObject', () => events.deleteObject++);
    client.on('deleteObjects', () => events.deleteObjects++);
    client.on('listObjects', () => events.listObjects++);
    client.on('count', () => events.count++);
    client.on('getAllKeys', () => events.getAllKeys++);


    // 2. Upload multiple objects
    
    const uploadData = {
      body: 'Hello, S3DB World!',
      contentType: 'text/plain',
    };

    const uploads = await Promise.all([
      client.putObject({
        key: 'file1.txt',
        metadata: { category: 'documents', priority: 'high' },
        ...uploadData,
      }),
      client.putObject({
        key: 'file2.txt', 
        metadata: { category: 'documents', priority: 'medium' },
        ...uploadData,
      }),
      client.putObject({
        key: 'subfolder/file3.txt',
        metadata: { category: 'archives', priority: 'low' },
        ...uploadData,
      })
    ]);

    expect(uploads).toHaveLength(3);
    expect(uploads.every(upload => upload.ETag)).toBe(true);
    expect(events.putObject).toBe(3);
    expect(events.commandRequest).toBeGreaterThan(0);
    expect(events.commandResponse).toBeGreaterThan(0);


    // 3. Head object operations (get metadata)
    
    const headResult = await client.headObject('file1.txt');
    expect(headResult.Metadata).toBeDefined();
    expect(headResult.Metadata.category).toBe('documents');
    expect(headResult.Metadata.priority).toBe('high');
    expect(headResult.ContentLength).toBeGreaterThan(0);
    expect(headResult.LastModified).toBeInstanceOf(Date);
    expect(events.headObject).toBe(1);


    // 4. Download and verify content
    
    const downloadResult = await client.getObject('file1.txt');
    expect(downloadResult.Body).toBeDefined();
    expect(downloadResult.ContentType).toBe('text/plain');
    
    // Convert stream to string for verification
    const chunks = [];
    const reader = downloadResult.Body.getReader();
    let done = false;
    
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }
    
    const content = new TextDecoder().decode(new Uint8Array(
      chunks.reduce((acc, chunk) => [...acc, ...chunk], [])
    ));
    
    expect(content).toBe('Hello, S3DB World!');
    expect(events.getObject).toBe(1);


    // 5. List objects and count
    
    const listResult = await client.listObjects();
    expect(listResult.KeyCount).toBe(3);
    expect(listResult.Contents).toHaveLength(3);
    expect(events.listObjects).toBe(1);

    const totalCount = await client.count();
    expect(totalCount).toBe(3);
    expect(events.count).toBe(1);


    // 6. Get all keys
    
    const allKeys = await client.getAllKeys();
    expect(allKeys).toHaveLength(3);
    expect(allKeys).toContain('file1.txt');
    expect(allKeys).toContain('file2.txt');
    expect(allKeys).toContain('subfolder/file3.txt');
    expect(events.getAllKeys).toBe(1);


    // 7. Test object existence
    
    const existsFile1 = await client.exists('file1.txt');
    expect(existsFile1).toBe(true);

    const existsNonExistent = await client.exists('non-existent-file.txt');
    expect(existsNonExistent).toBe(false);


    // 8. Copy operations
    
    const copyResult = await client.copyObject({
      from: 'file1.txt',
      to: 'backup/file1-copy.txt'
    });
    
    expect(copyResult).toBeDefined();

    // Verify both original and copy exist
    const originalExists = await client.exists('file1.txt');
    const copyExists = await client.exists('backup/file1-copy.txt');
    expect(originalExists).toBe(true);
    expect(copyExists).toBe(true);


    // 9. Move operations
    
    const moveResult = await client.moveObject({
      from: 'file2.txt',
      to: 'moved/file2-moved.txt'
    });
    
    expect(moveResult).toBe(true);

    // Verify original is gone and moved version exists
    const originalExists2 = await client.exists('file2.txt');
    const movedExists = await client.exists('moved/file2-moved.txt');
    expect(originalExists2).toBe(false);
    expect(movedExists).toBe(true);


    // 10. Bulk move operations
    
    // First create some objects with a common prefix
    await Promise.all([
      client.putObject({
        key: 'temp/temp1.txt',
        body: 'temp content 1',
        contentType: 'text/plain'
      }),
      client.putObject({
        key: 'temp/temp2.txt', 
        body: 'temp content 2',
        contentType: 'text/plain'
      })
    ]);

    // Move all temp/ objects to archive/
    await client.moveAllObjects({
      prefixFrom: 'temp/',
      prefixTo: 'archive/'
    });

    // Verify temp objects are gone and archive objects exist
    const tempExists1 = await client.exists('temp/temp1.txt');
    const tempExists2 = await client.exists('temp/temp2.txt');
    const archiveExists1 = await client.exists('archive/temp1.txt');
    const archiveExists2 = await client.exists('archive/temp2.txt');

    expect(tempExists1).toBe(false);
    expect(tempExists2).toBe(false);
    expect(archiveExists1).toBe(true);
    expect(archiveExists2).toBe(true);


    // 11. Delete single objects
    
    const deleteResult = await client.deleteObject('backup/file1-copy.txt');
    expect(deleteResult).toBeDefined();
    expect(events.deleteObject).toBe(1);

    const deletedExists = await client.exists('backup/file1-copy.txt');
    expect(deletedExists).toBe(false);


    // 12. Delete multiple objects
    
    const keysToDelete = ['moved/file2-moved.txt', 'archive/temp1.txt'];
    const bulkDeleteResult = await client.deleteObjects(keysToDelete);
    expect(bulkDeleteResult).toBeDefined();
    expect(events.deleteObjects).toBe(1);

    // Verify objects are deleted
    for (const key of keysToDelete) {
      const exists = await client.exists(key);
      expect(exists).toBe(false);
    }


    // 13. Test prefix-based operations
    
    // Create objects with specific prefixes
    await Promise.all([
      client.putObject({
        key: 'prefix-test/group1/file1.txt',
        body: 'group1 content',
        contentType: 'text/plain'
      }),
      client.putObject({
        key: 'prefix-test/group1/file2.txt',
        body: 'group1 content',
        contentType: 'text/plain'
      }),
      client.putObject({
        key: 'prefix-test/group2/file1.txt',
        body: 'group2 content', 
        contentType: 'text/plain'
      })
    ]);

    // List objects with prefix
    const prefixList = await client.listObjects('prefix-test/group1/');
    expect(prefixList.KeyCount).toBe(2);

    // Count objects with prefix
    const prefixCount = await client.count('prefix-test/group1/');
    expect(prefixCount).toBe(2);

    // Get keys with prefix
    const prefixKeys = await client.getAllKeys('prefix-test/group1/');
    expect(prefixKeys).toHaveLength(2);
    expect(prefixKeys.every(key => key.startsWith('prefix-test/group1/'))).toBe(true);


    // 14. Test deleteAll functionality
    
    // Delete all objects with specific prefix
    const deleteAllResult = await client.deleteAll({ prefix: 'prefix-test/' });
    expect(typeof deleteAllResult).toBe('number');
    expect(deleteAllResult).toBe(3); // Should delete 3 objects

    // Verify all prefix-test objects are deleted
    const remainingPrefixObjects = await client.count('prefix-test/');
    expect(remainingPrefixObjects).toBe(0);


    // 15. Final cleanup and verification
    
    const finalList = await client.listObjects();
    
    // Clean up remaining objects
    if (finalList.KeyCount > 0) {
      const remainingKeys = await client.getAllKeys();
      if (remainingKeys.length > 0) {
        await client.deleteObjects(remainingKeys);
      }
    }

    const finalCount = await client.count();
    expect(finalCount).toBe(0);


    // 16. Event tracking summary
    
    expect(events.commandRequest).toBeGreaterThan(0);
    expect(events.commandResponse).toBeGreaterThan(0);
    expect(events.putObject).toBeGreaterThan(0);
    expect(events.getObject).toBeGreaterThan(0);
    expect(events.headObject).toBeGreaterThan(0);
    expect(events.deleteObject).toBeGreaterThan(0);
    expect(events.listObjects).toBeGreaterThan(0);
    expect(events.count).toBeGreaterThan(0);
    expect(events.getAllKeys).toBeGreaterThan(0);


  }, 60000); // 60 second timeout for comprehensive test

  test('Client Error Handling Journey', async () => {

    // Test operations on non-existent objects
    
    try {
      await client.getObject('non-existent-file.txt');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.name).toBe('NoSuchKey');
    }

    try {
      await client.headObject('non-existent-file.txt');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.name).toBe('NoSuchKey');
    }


    // Test invalid operations
    
    try {
      await client.copyObject({
        from: 'non-existent-source.txt',
        to: 'destination.txt'
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.name).toBe('NoSuchKey');
    }

    try {
      await client.moveObject({
        from: 'non-existent-source.txt',
        to: 'destination.txt'
      });
      expect(moveResult).toBe(false); // Should return false for failed move
    } catch (error) {
      // Move might throw or return false depending on implementation
      expect(error.name).toBe('NoSuchKey');
    }


  });

  test('Client Configuration Journey', async () => {

    // Test client configuration properties
    
    expect(client.config).toBeDefined();
    expect(client.config.bucket).toBeDefined();
    expect(client.config.region).toBeDefined();
    expect(client.config.endpoint).toBeDefined();


    // Test connection string parsing
    
    const testClient = new Client({
      connectionString: 'http://test:test@localhost:9000/test-bucket/test-prefix?param1=value1'
    });

    expect(testClient.config.bucket).toBe('test-bucket');
    expect(testClient.config.keyPrefix).toBe('test-prefix');
    expect(testClient.config.accessKeyId).toBe('test');
    expect(testClient.config.secretAccessKey).toBe('test');


  });
});
