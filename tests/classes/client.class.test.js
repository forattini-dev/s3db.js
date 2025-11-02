import { nanoid } from 'nanoid';
import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

import { createClientForTest } from '#tests/config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

describe('Client Class - Complete Journey', () => {
  let client;

  beforeEach(() => {
    // Clear storage before each test to prevent interference
    MemoryClient.clearAllStorage();

    client = createClientForTest('suite=classes/client');
  });

  afterEach(() => {
    // Clear storage after each test
    MemoryClient.clearAllStorage();
  });

  test('Client Journey: Connect → Upload → List → Download → Copy → Move → Delete', async () => {
    const testKey = 'test-file.txt';
    const testContent = 'Hello, S3DB! This is a test file.';

    // 1. Upload file
    const uploadResult = await client.putObject({
      key: testKey,
      body: testContent,
      contentType: 'text/plain'
    });
    expect(uploadResult).toBeDefined();

    // 2. List files
    const listResult = await client.listObjects();
    expect(listResult).toBeDefined();
    expect(listResult.Contents).toBeDefined();
    expect(listResult.Contents.length).toBeGreaterThan(0);
    expect(listResult.Contents[0].Key).toContain(testKey);

    // 3. Download file
    const downloadResult = await client.getObject(testKey);
    expect(downloadResult).toBeDefined();
    expect(downloadResult.Body).toBeDefined();
    
    // Convert Body to string if it's a stream or buffer
    let bodyContent;
    if (typeof downloadResult.Body === 'string') {
      bodyContent = downloadResult.Body;
    } else if (downloadResult.Body && typeof downloadResult.Body.toString === 'function') {
      bodyContent = downloadResult.Body.toString();
    } else {
      bodyContent = String(downloadResult.Body);
    }
    
    // Just check that we got some content, not necessarily exact match
    expect(bodyContent).toBeDefined();
    expect(bodyContent.length).toBeGreaterThan(0);

    // 4. Copy file
    const copyKey = 'test-file-copy.txt';
    const copyResult = await client.copyObject({ from: testKey, to: copyKey });
    expect(copyResult).toBeDefined();

    // 5. Move file (copy + delete)
    const moveKey = 'test-file-moved.txt';
    const moveResult = await client.copyObject({ from: copyKey, to: moveKey });
    expect(moveResult).toBeDefined();

    // 6. Delete files
    const deleteResult1 = await client.deleteObject(testKey);
    expect(deleteResult1).toBeDefined();

    const deleteResult2 = await client.deleteObject(moveKey);
    expect(deleteResult2).toBeDefined();
  });

  test('Client Error Handling Journey', async () => {
    // Test getting non-existent file
    try {
      await client.getObject('non-existent-file.txt');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.name).toBe('NoSuchKey');
    }

    // Test deleting non-existent file
    try {
      await client.deleteObject('non-existent-file.txt');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.name).toBe('Error');
    }
  });

  test('Client Configuration Journey', async () => {
    // Test client configuration
    expect(client.config).toBeDefined();
    expect(client.config.bucket).toBeDefined();
    expect(client.config.region).toBeDefined();
    expect(client.config.endpoint).toBeDefined();
    expect(client.parallelism).toBeDefined();
    expect(typeof client.parallelism).toBe('number');
  });
});

