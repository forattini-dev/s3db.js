/**
 * Body-Only Behavior - Legacy Data Support Tests
 *
 * Verifies that body-only behavior correctly handles legacy data that was
 * stored in metadata (instead of body) and doesn't have the _map field.
 *
 * This addresses the issue where data created before the _map field was added
 * couldn't be read correctly because:
 * 1. Data was stored in metadata with numeric indices (0, 1, 2, etc.)
 * 2. No _map field existed to restore field names
 *
 * The fix uses unmappedMetadata as fallback when body has no user data.
 */

import { createDatabaseForTest } from '../../config.js';
import { encode as toBase62 } from '../../../src/concerns/base62.js';

describe('Body-Only Behavior - Legacy Data Support', () => {
  let database;
  let resource;

  beforeEach(async () => {
    database = createDatabaseForTest('body-only-legacy');
    await database.connect();

    resource = await database.createResource({
      name: 'artifacts',
      attributes: {
        id: 'string|optional',
        projectId: 'string|required',
        documentId: 'string|required',
        type: 'string|required',
        fileName: 'string|required',
        mimeType: 'string|required',
        size: 'number|required'
      },
      behavior: 'body-only',
      timestamps: false
    });
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should read legacy data stored in metadata without _map field', async () => {
    const key = resource.getResourceKey('legacy-artifact-1');

    const schemaMap = resource.schema.map;
    const legacyMetadata = {
      [schemaMap.projectId]: 'project-123',
      [schemaMap.documentId]: 'doc-456',
      [schemaMap.type]: 'original',
      [schemaMap.fileName]: 'test-file.txt',
      [schemaMap.mimeType]: 'text/plain',
      [schemaMap.size]: toBase62(12345),
      '_v': 'v1',
      '_hascontent': 'true',
      '_contentlength': '12345'
    };

    await database.client.putObject({ key, body: '', metadata: legacyMetadata });

    const retrieved = await resource.get('legacy-artifact-1');

    expect(retrieved.id).toBe('legacy-artifact-1');
    expect(retrieved.projectId).toBe('project-123');
    expect(retrieved.documentId).toBe('doc-456');
    expect(retrieved.type).toBe('original');
    expect(retrieved.fileName).toBe('test-file.txt');
    expect(retrieved.mimeType).toBe('text/plain');
    expect(retrieved.size).toBe(12345);
  });

  it('should query legacy data stored in metadata without _map field', async () => {
    const key1 = resource.getResourceKey('legacy-artifact-2');
    const key2 = resource.getResourceKey('legacy-artifact-3');

    const schemaMap = resource.schema.map;
    const legacyMetadata1 = {
      [schemaMap.projectId]: 'project-123',
      [schemaMap.documentId]: 'doc-456',
      [schemaMap.type]: 'original',
      [schemaMap.fileName]: 'file1.txt',
      [schemaMap.mimeType]: 'text/plain',
      [schemaMap.size]: '100',
      '_v': 'v1'
    };

    const legacyMetadata2 = {
      [schemaMap.projectId]: 'project-123',
      [schemaMap.documentId]: 'doc-789',
      [schemaMap.type]: 'processed',
      [schemaMap.fileName]: 'file2.txt',
      [schemaMap.mimeType]: 'text/plain',
      [schemaMap.size]: '200',
      '_v': 'v1'
    };

    await database.client.putObject({ key: key1, body: '', metadata: legacyMetadata1 });
    await database.client.putObject({ key: key2, body: '', metadata: legacyMetadata2 });

    const results = await resource.query({ documentId: 'doc-456' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('legacy-artifact-2');
    expect(results[0].type).toBe('original');
    expect(results[0].fileName).toBe('file1.txt');
  });

  it('should prefer body data over metadata when body has user data', async () => {
    const testData = {
      id: 'artifact-new',
      projectId: 'project-new',
      documentId: 'doc-new',
      type: 'image',
      fileName: 'new-file.png',
      mimeType: 'image/png',
      size: 5000
    };

    await resource.insert(testData);
    const retrieved = await resource.get('artifact-new');

    expect(retrieved.projectId).toBe('project-new');
    expect(retrieved.documentId).toBe('doc-new');
    expect(retrieved.type).toBe('image');
    expect(retrieved.fileName).toBe('new-file.png');
    expect(retrieved.mimeType).toBe('image/png');
    expect(retrieved.size).toBe(5000);
  });

  it('should handle mixed scenario - body with only internal fields falls back to metadata', async () => {
    const key = resource.getResourceKey('mixed-artifact');

    const schemaMap = resource.schema.map;
    const legacyMetadata = {
      [schemaMap.projectId]: 'project-mixed',
      [schemaMap.documentId]: 'doc-mixed',
      [schemaMap.type]: 'mixed-type',
      [schemaMap.fileName]: 'mixed-file.txt',
      [schemaMap.mimeType]: 'application/octet-stream',
      [schemaMap.size]: '999',
      '_v': 'v1',
      '_map': JSON.stringify({})
    };

    await database.client.putObject({ key, body: JSON.stringify({ _v: 'v1' }), metadata: legacyMetadata });

    const retrieved = await resource.get('mixed-artifact');

    expect(retrieved.id).toBe('mixed-artifact');
    expect(retrieved.projectId).toBe('project-mixed');
    expect(retrieved.documentId).toBe('doc-mixed');
  });

  it('should correctly update legacy data and convert to new format', async () => {
    const key = resource.getResourceKey('legacy-to-update');

    const schemaMap = resource.schema.map;
    const legacyMetadata = {
      [schemaMap.projectId]: 'project-old',
      [schemaMap.documentId]: 'doc-old',
      [schemaMap.type]: 'old-type',
      [schemaMap.fileName]: 'old-file.txt',
      [schemaMap.mimeType]: 'text/plain',
      [schemaMap.size]: toBase62(100),
      '_v': 'v1'
    };

    await database.client.putObject({ key, body: '', metadata: legacyMetadata });

    await resource.update('legacy-to-update', { type: 'new-type', fileName: 'new-file.txt' });

    const retrieved = await resource.get('legacy-to-update');

    expect(retrieved.projectId).toBe('project-old');
    expect(retrieved.documentId).toBe('doc-old');
    expect(retrieved.type).toBe('new-type');
    expect(retrieved.fileName).toBe('new-file.txt');
    expect(retrieved.mimeType).toBe('text/plain');
    expect(retrieved.size).toBe(100);

    const s3Object = await database.client.headObject(key);
    expect(s3Object.Metadata).toHaveProperty('_map');
  });
});
