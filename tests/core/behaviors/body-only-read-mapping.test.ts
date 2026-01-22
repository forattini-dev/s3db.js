/**
 * Body-Only Behavior - Read Mapping Tests
 *
 * Verifies that body-only behavior correctly maps indexed fields back to
 * field names when reading data. This addresses the issue where fields like
 * projectId, documentId, type were returning undefined with body-only behavior.
 *
 * Key points tested:
 * 1. Field names are correctly restored from indexed storage (0, 1, 2, etc.)
 * 2. Query by field works correctly
 * 3. Plugin attributes work correctly with the read path
 * 4. Timestamps work correctly with body-only
 */

import { createDatabaseForTest } from '../../config.js';

describe('Body-Only Behavior - Read Mapping', () => {
  let database;
  let resource;

  beforeEach(async () => {
    database = createDatabaseForTest('body-only-read-mapping');
    await database.connect();

    resource = await database.createResource({
      name: 'artifacts',
      attributes: {
        id: 'string|optional',
        projectId: 'string|required',
        documentId: 'string|required',
        type: 'string|required',
        name: 'string|optional'
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

  it('should correctly unmap indexed fields on get()', async () => {
    const testData = {
      id: 'artifact-1',
      projectId: 'project-123',
      documentId: 'doc-456',
      type: 'image',
      name: 'screenshot.png'
    };

    await resource.insert(testData);
    const retrieved = await resource.get('artifact-1');

    // All user-defined fields should be correctly named
    expect(retrieved.projectId).toBe('project-123');
    expect(retrieved.documentId).toBe('doc-456');
    expect(retrieved.type).toBe('image');
    expect(retrieved.name).toBe('screenshot.png');
    expect(retrieved.id).toBe('artifact-1');
  });

  it('should store data with indexed keys in S3 body', async () => {
    await resource.insert({
      id: 'artifact-2',
      projectId: 'project-123',
      documentId: 'doc-456',
      type: 'image'
    });

    const key = resource.getResourceKey('artifact-2');
    const fullObject = await database.client.getObject(key);
    const bodyBytes = await fullObject.Body.transformToByteArray();
    const bodyStr = Buffer.from(bodyBytes).toString('utf-8');
    const bodyData = JSON.parse(bodyStr);

    // Body should contain indexed keys (0, 1, 2, etc.)
    expect(Object.keys(bodyData).some(k => /^\d+$/.test(k))).toBe(true);
    // Body should NOT contain original field names
    expect(bodyData.projectId).toBeUndefined();
    expect(bodyData.documentId).toBeUndefined();
  });

  it('should store _map in metadata for field name restoration', async () => {
    await resource.insert({
      id: 'artifact-3',
      projectId: 'project-123',
      documentId: 'doc-456',
      type: 'image'
    });

    const key = resource.getResourceKey('artifact-3');
    const s3Object = await database.client.headObject(key);

    // Metadata should contain _map (stored as lowercase _map)
    expect(s3Object.Metadata).toHaveProperty('_map');

    const mapStr = s3Object.Metadata._map;
    const map = JSON.parse(mapStr);

    // Map should contain field -> index mappings
    expect(map).toHaveProperty('projectId');
    expect(map).toHaveProperty('documentId');
    expect(map).toHaveProperty('type');
  });

  it('should correctly query by field', async () => {
    await resource.insert({
      id: 'artifact-4',
      projectId: 'project-123',
      documentId: 'doc-456',
      type: 'image',
      name: 'screenshot.png'
    });

    await resource.insert({
      id: 'artifact-5',
      projectId: 'project-123',
      documentId: 'doc-789',
      type: 'document',
      name: 'report.pdf'
    });

    const images = await resource.query({ type: 'image' });
    expect(images).toHaveLength(1);
    expect(images[0].id).toBe('artifact-4');
    expect(images[0].name).toBe('screenshot.png');

    const docs = await resource.query({ type: 'document' });
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('artifact-5');
    expect(docs[0].name).toBe('report.pdf');
  });

  it('should work with plugin attributes', async () => {
    resource.addPluginAttribute('_status', 'string|optional', 'WorkflowPlugin');
    resource.addPluginAttribute('_score', 'number|optional', 'RankingPlugin');

    await resource.insert({
      id: 'artifact-6',
      projectId: 'project-123',
      documentId: 'doc-456',
      type: 'image',
      name: 'screenshot.png',
      _status: 'active',
      _score: 95
    });

    const retrieved = await resource.get('artifact-6');

    // User fields should be correctly named
    expect(retrieved.projectId).toBe('project-123');
    expect(retrieved.documentId).toBe('doc-456');
    expect(retrieved.type).toBe('image');

    // Plugin attributes should also work
    expect(retrieved._status).toBe('active');
    expect(retrieved._score).toBe(95);
  });

  it('should work with timestamps enabled', async () => {
    const resourceWithTimestamps = await database.createResource({
      name: 'artifacts-ts',
      attributes: {
        id: 'string|optional',
        projectId: 'string|required',
        documentId: 'string|required',
        type: 'string|required'
      },
      behavior: 'body-only',
      timestamps: true
    });

    await resourceWithTimestamps.insert({
      id: 'artifact-7',
      projectId: 'project-123',
      documentId: 'doc-456',
      type: 'image'
    });

    const retrieved = await resourceWithTimestamps.get('artifact-7');

    expect(retrieved.projectId).toBe('project-123');
    expect(retrieved.documentId).toBe('doc-456');
    expect(retrieved.type).toBe('image');
    expect(retrieved.createdAt).toBeDefined();
    expect(retrieved.updatedAt).toBeDefined();
  });

  it('should handle update operations correctly', async () => {
    await resource.insert({
      id: 'artifact-8',
      projectId: 'project-123',
      documentId: 'doc-456',
      type: 'image',
      name: 'old.png'
    });

    await resource.update('artifact-8', { name: 'new.png' });

    const retrieved = await resource.get('artifact-8');

    expect(retrieved.projectId).toBe('project-123');
    expect(retrieved.documentId).toBe('doc-456');
    expect(retrieved.type).toBe('image');
    expect(retrieved.name).toBe('new.png');
  });
});
